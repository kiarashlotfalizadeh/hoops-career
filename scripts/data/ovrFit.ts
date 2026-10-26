// Refit the OVR weights (src/core/ratings.ts OVR_GUARD / OVR_BIG) on a build's report.
//
// OVR is what fans read first and what every AI decision (rotations, trades, contracts) reads, so it
// has to rank players the way their game does: impact alone crowned efficient low-usage shooters
// (Kennard an 87 "All-Star") and sank high-usage stars (LeBron, Jaylen Brown 81). The target blends
// three measurements of the real player, each a z-score over regulars:
//   impact (his projected points per 100, games/impact.ts), production (box creation per 36: points,
//   assists, boards, stocks, less turnovers) and role (the minutes coaches gave him),
// and the weights are the non-negative ones closest to the old (a ridge toward them) that predict it
// from his calibrated ratings, guards' and bigs' separately (blended by size as ovrRaw blends them),
// scaled so the league's raw OVR keeps its mean.
//
// Usage: HC_REPORT=<report.json> node_modules/.bin/tsx scripts/data/build-seed.ts, then
//        node_modules/.bin/tsx scripts/data/ovrFit.ts <report.json>
import { readFileSync } from 'node:fs';
import { RATING_KEYS, buildOvrScale, ovrRaw, toDisplay } from '../../src/core/ratings';
import type { Ratings } from '../../src/core/types';
import { OVR_TARGET, ovrTarget, type ReportRow } from './reputation';

const path = process.argv[2] ?? process.env.HC_REPORT;
if (!path) throw new Error('usage: ovrFit.ts <report.json>');
const report: { players: ReportRow[] } = JSON.parse(readFileSync(path, 'utf8'));
const rows = report.players.filter((p) => p.team && p.rawMin >= OVR_TARGET.minMinutes && p.per36 && p.proj);
const target = ovrTarget(rows);
const raws = rows.map((p) => ovrRaw(p.ratings));
const mRaw = raws.reduce((a, b) => a + b, 0) / raws.length;
const sRaw = Math.sqrt(raws.reduce((a, b) => a + (b - mRaw) ** 2, 0) / raws.length);
const y = rows.map((p) => mRaw + sRaw * target.get(p.id)!);

// the current weights, as ovrRaw applies them (with its /0.94)
const big = (r: Ratings) => Math.min(1, Math.max(0, (r.hgt - 40) / 40));
const prior = (() => {
  // recover the weights from ovrRaw on unit vectors at the two ends of the size blend
  const at = (hgt: number, k: string) => {
    const r = Object.fromEntries(RATING_KEYS.map((x) => [x, 0])) as unknown as Ratings;
    r.hgt = hgt;
    const base = ovrRaw(r);
    (r as unknown as Record<string, number>)[k] += 1;
    return ovrRaw(r) - base;
  };
  return { g: RATING_KEYS.map((k) => (k === 'hgt' ? at(39, 'hgt') : at(0, k))), b: RATING_KEYS.map((k) => (k === 'hgt' ? at(81, 'hgt') : at(100, k))) };
})();
const n = RATING_KEYS.length;
const X = rows.map((p) => {
  const b = big(p.ratings);
  return [...RATING_KEYS.map((k) => p.ratings[k] * (1 - b)), ...RATING_KEYS.map((k) => p.ratings[k] * b)];
});
const w0 = [...prior.g, ...prior.b];
const w = [...w0];
const lambda = Number(process.env.RIDGE ?? 2e5);
// coordinate descent, each weight kept non-negative
for (let it = 0; it < 4000; it++) {
  for (let j = 0; j < 2 * n; j++) {
    let num = lambda * w0[j];
    let den = lambda;
    for (let i = 0; i < X.length; i++) {
      const xij = X[i][j];
      if (!xij) continue;
      let pred = 0;
      for (let k = 0; k < 2 * n; k++) if (k !== j) pred += X[i][k] * w[k];
      num += xij * (y[i] - pred);
      den += xij * xij;
    }
    w[j] = Math.max(0, num / den);
  }
  if (it % 500 === 499) {
    const res = X.reduce((a, x, i) => a + (x.reduce((s, v, k) => s + v * w[k], 0) - y[i]) ** 2, 0);
    console.error(`iter ${it + 1}: rmse ${Math.sqrt(res / X.length).toFixed(3)}`);
  }
}
const pred = X.map((x) => x.reduce((s, v, k) => s + v * w[k], 0));
const corr = (a: number[], b: number[]) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
};
console.log(`${rows.length} players; r(old OVR, target) ${corr(raws, y).toFixed(3)} → r(new, target) ${corr(pred, y).toFixed(3)}`);
const fmt = (ws: number[]) => `{\n${RATING_KEYS.map((k, i) => `  ${k}: ${Math.round(ws[i] * 0.94 * 1000) / 1000},`).join('\n')}\n}`;
console.log(`const OVR_GUARD: Ratings = ${fmt(w.slice(0, n))};`);
console.log(`const OVR_BIG: Ratings = ${fmt(w.slice(n))};`);

// what the new weights make of the league: its top 40, and the players the old weights misjudged
const rawW = (r: Ratings) => {
  const b = big(r);
  return RATING_KEYS.reduce((s, k, i) => s + r[k] * ((1 - b) * w[i] + b * w[n + i]), 0);
};
const team = report.players.filter((p) => p.team);
const oldScale = buildOvrScale(team.map((p) => ovrRaw(p.ratings)));
const newScale = buildOvrScale(team.map((p) => rawW(p.ratings)));
const shown = team.map((p) => ({ p, was: toDisplay(ovrRaw(p.ratings), oldScale), now: toDisplay(rawW(p.ratings), newScale) })).sort((a, b) => b.now - a.now);
console.log(
  'top 40:',
  shown
    .slice(0, 40)
    .map((x) => `${x.p.name} ${x.now} (${x.was})`)
    .join(', '),
);
const moved = [...shown].sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was)).slice(0, 30);
console.log('moved most:', moved.map((x) => `${x.p.name} ${x.was}→${x.now}`).join(', '));
