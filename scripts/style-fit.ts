// Style fit: refit the staff's reads (coachAI's OFF_FIT, DEF_FIT and shapeFits) to style-check's
// measurements. Each option's worth against the roster's average option (a shape's against four-out) is
// fitted on the roster's qualities, the terms picked one at a time (at most three) while they predict
// rosters left out better (ten folds), from the qualities an option can plausibly lean on (QUALITIES).
// The first league named is the real one: its rosters may be measured on several seed sets (joined by
// +, averaged); every other league gets a start of its own, so the weights are shared and the starts
// printed are the real league's. Prints each model (start and terms in fit points, a tenth of a point a
// game, with each quality's neutral level), and for each league the fit's r and slope against the
// measured worth, the read's top picks and the best measured.
// Usage: STYLE_JSON=real-a.json tsx scripts/style-check.ts 24 off,def,shape 4242 real, the same for a
// second seed and a fictional league or two, then
//   tsx scripts/style-fit.ts off real-a.json+real-b.json,fic11.json,fic23.json
import { readFileSync } from 'node:fs';
import type { Part, StyleRow } from './style-measure';

const part = process.argv[2] as Part;
const spec = process.argv[3];
if (!part || !spec) throw new Error('Usage: style-fit off|def|shape real-a.json[+real-b.json][,fictional.json...]');

/** The qualities each option's fit may use: what its style leans on, as a coach would read it. */
const QUALITIES: Record<Part, Record<string, string[]>> = {
  off: {
    balanced: ['depth', 'starCreator'],
    helio: ['starCreator', 'creatorGap', 'shooting', 'passing'],
    fiveOut: ['shooting', 'passing', 'size', 'starCreator', 'bigPassing'],
    hub: ['bigPassing', 'passing', 'creatorGap', 'starCreator'],
    paceSpace: ['athleticism', 'shooting', 'passing', 'depth'],
    grind: ['size', 'postScoring', 'shooting', 'passing', 'starCreator'],
  },
  def: {
    drop: ['rimProtection', 'steals', 'athleticism', 'size', 'depth'],
    switch: ['perimeterD', 'athleticism', 'size', 'steals', 'depth'],
    blitz: ['steals', 'perimeterD', 'athleticism', 'size', 'depth'],
    ice: ['steals', 'perimeterD', 'athleticism', 'depth'],
    hedge: ['bigMobility', 'athleticism', 'steals', 'rimProtection', 'depth'],
    zone: ['size', 'rimProtection', 'perimeterD', 'steals', 'athleticism', 'depth'],
    chaos: ['steals', 'athleticism', 'depth', 'perimeterD'],
  },
  shape: { fiveOut: ['spacing', 'bigPass', 'size', 'creator'], horns: ['creator', 'spacing', 'size', 'bigPass'], twoIn: ['inside', 'orb', 'spacing', 'size'] },
};
/** At most this many terms an option, each kept only if it cuts the error on rosters left out by this share. */
const MAX_TERMS = Number(process.env.MAX_TERMS ?? 3);
const MIN_GAIN = Number(process.env.MIN_GAIN ?? 0.015);
const vs = part === 'shape' ? 'fourOut' : '';

type Row = StyleRow & { li: number; x: Record<string, number> };
const leagues = spec.split(',').map((group) => {
  const sets = group.split('+').map((f) => (JSON.parse(readFileSync(f, 'utf8')) as Record<string, StyleRow[]>)[part]);
  return sets[0].map((r, i) => ({ ...r, meas: Object.fromEntries(Object.keys(r.meas).map((id) => [id, sets.reduce((a, s) => a + s[i].meas[id], 0) / sets.length])) }));
});
const rows: Row[] = leagues.flatMap((rs, li) => rs.map((r) => ({ ...r, li, x: (part === 'shape' ? r.shape! : r.profile) as Record<string, number> })));
const all = Object.keys(rows[0].meas);
const ids = all.filter((id) => id !== vs);
const y = (r: Row, id: string) => r.meas[id] - (vs ? r.meas[vs] : 0);
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const keys = [...new Set(Object.values(QUALITIES[part]).flat())];
const neutral = Object.fromEntries(keys.map((k) => [k, Math.round(mean(rows.map((r) => r.x[k])))]));

/** Least squares: weights for the columns of X. */
function ols(X: number[][], Y: number[]): number[] {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => Array<number>(p).fill(0));
  const b = Array<number>(p).fill(0);
  X.forEach((x, i) => x.forEach((v, j) => ((b[j] += v * Y[i]), x.forEach((u, k) => (A[j][k] += v * u)))));
  for (let c = 0; c < p; c++) {
    let m = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m], b[c], b[m]] = [A[m], A[c], b[m], b[c]];
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < p; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}
// (each league after the first its own start)
const design = (rs: Row[], ts: string[]) => rs.map((r) => [1, ...ts.map((k) => r.x[k] - neutral[k]), ...leagues.slice(1).map((_, i) => (r.li === i + 1 ? 1 : 0))]);
const predict = (w: number[], x: number[]) => x.reduce((a, v, j) => a + v * w[j], 0);
function cvErr(id: string, ts: string[]): number {
  let se = 0;
  for (let f = 0; f < 10; f++) {
    const tr = rows.filter((r) => r.tid % 10 !== f);
    const te = rows.filter((r) => r.tid % 10 === f);
    const w = ols(
      design(tr, ts),
      tr.map((r) => y(r, id)),
    );
    design(te, ts).forEach((x, i) => (se += (predict(w, x) - y(te[i], id)) ** 2));
  }
  return se / rows.length;
}

const models: Record<string, { base: number; terms: [string, number, number][]; starts: number[] }> = {};
for (const id of ids) {
  let ts: string[] = [];
  let err = cvErr(id, ts);
  for (let step = 0; step < MAX_TERMS; step++) {
    let best: [string, number] | null = null;
    for (const k of QUALITIES[part][id] ?? [])
      if (!ts.includes(k)) {
        const e = cvErr(id, [...ts, k]);
        if (!best || e < best[1]) best = [k, e];
      }
    if (!best || best[1] > err * (1 - MIN_GAIN)) break;
    ts = [...ts, best[0]];
    err = best[1];
  }
  const w = ols(
    design(rows, ts),
    rows.map((r) => y(r, id)),
  );
  const r1 = (v: number, d = 1) => Math.round(v * 10 * 10 ** d) / 10 ** d;
  models[id] = { base: r1(w[0]), terms: ts.map((k, i) => [k, r1(w[i + 1], 2), neutral[k]]), starts: [0, ...leagues.slice(1).map((_, i) => w[1 + ts.length + i] * 10)] };
  console.log(`${id.padEnd(10)} base ${models[id].base} terms ${JSON.stringify(models[id].terms)}`);
}
if (vs) models[vs] = { base: 0, terms: [], starts: leagues.map(() => 0) };

const fitOf = (r: Row) => Object.fromEntries(all.map((id) => [id, models[id].base + models[id].starts[r.li] + models[id].terms.reduce((a, [k, w, n]) => a + w * (r.x[k] - n), 0)]));
const top = (f: Record<string, number>) => all.reduce((a, id) => (f[id] > f[a] ? id : a));
leagues.forEach((_, li) => {
  const rs = rows.filter((r) => r.li === li);
  const xs: number[] = [];
  const ys: number[] = [];
  const picks: Record<string, number> = {};
  const best: Record<string, number> = {};
  for (const r of rs) {
    const f = fitOf(r);
    const m = mean(all.map((id) => f[id]));
    for (const id of all) {
      xs.push((f[id] - m) / 10);
      ys.push(r.meas[id]);
    }
    picks[top(f)] = (picks[top(f)] ?? 0) + 1;
    best[top(r.meas)] = (best[top(r.meas)] ?? 0) + 1;
  }
  const [mx, my] = [mean(xs), mean(ys)];
  const sxy = xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((a, v) => a + (v - mx) ** 2, 0);
  const syy = ys.reduce((a, v) => a + (v - my) ** 2, 0);
  console.log(
    `${spec.split(',')[li]}: r ${(sxy / Math.sqrt(sxx * syy)).toFixed(2)} · slope ${(sxy / sxx).toFixed(2)} · the read's top ${JSON.stringify(picks)} · measured best ${JSON.stringify(best)}`,
  );
});
