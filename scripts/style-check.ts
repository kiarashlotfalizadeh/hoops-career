// Style check: whether the staff's fits say what the engine says each style is worth. Every offensive
// playbook, defensive playbook and shape for every team of the real league, fully drilled, against
// every other team (paired games: the same seeds for each configuration), by shot-value margin a game
// (every attempt as likely to fall, a fouled miss at what its free throws were worth, plus the free throws
// made: as counterWorth measures). Prints, for
// each part:
// - r: the fit's points a game against the measured worth, both against the team's average option,
//   over every team and option (the target is 0.6 or more), and within each option across teams;
// - for the playbooks, the staff's pick (presetScores, the coach's lean included) against the best
//   measured option for each team, and how many teams each playbook is best for and picked by (the
//   league's style spread);
// - for the shapes, how often the fit's sign against four-out is right where it says 0.2 or more.
// The fits were fitted to a run of this over 90 real and fictional rosters (2026-10); run it again
// after an engine or playbook change, and refit coachAI's OFF_FIT/DEF_FIT/SHAPE_FIT if r falls.
// Usage: npx tsx scripts/style-check.ts [games per opponent, default 6] [parts: off,def,shape] [seed]
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import { startRegularSeason } from '../src/core/league/season';
import { buildSimInput } from '../src/core/league/games';
import { teamPlayers } from '../src/core/league/helpers';
import { GameSim } from '../src/core/sim/engine';
import { Rng } from '../src/core/random';
import { freshFamiliarity } from '../src/core/sim/familiarity';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, cloneTactics } from '../src/core/sim/tactics';
import { defPresetFit, fitRoster, offPresetFit, presetScores, rosterProfile, shapeFits } from '../src/core/ai/coachAI';
import { OFF_SHAPES, type Tactics } from '../src/core/types';

const k = Number(process.argv[2] ?? 6);
const parts = (process.argv[3] ?? 'off,def,shape').split(',');
const seedBase = Number(process.argv[4] ?? 9001);
const L = createLeague({ name: 'Style', userTid: 0, coachName: 'C', settings: defaultSettings(), seed: JSON.parse(readFileSync('src/data/seed.json', 'utf8')), rngSeed: 7 });
L.id = 'style-check';
startRegularSeason(L);

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const corr = (x: number[], y: number[]) => {
  const [mx, my] = [mean(x), mean(y)];
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    a += (x[i] - mx) * (y[i] - my);
    b += (x[i] - mx) ** 2;
    c += (y[i] - my) ** 2;
  }
  return a / Math.sqrt(b * c);
};

/** Each option's worth for team `tid`, against its average option, in points a game. */
function measure(tid: number, options: [string, Tactics][]): Record<string, number> {
  const team = L.teams[tid];
  const ps = teamPlayers(L, tid);
  const base = buildSimInput(L, tid, 1, 'regular');
  const opps = L.teams.filter((o) => o.tid !== tid).map((o) => buildSimInput(L, o.tid, 1, 'regular'));
  const runs: Record<string, number[]> = {};
  for (const [id, tactics] of options) {
    const tm = { ...team, tactics };
    const me = { ...base, team: tm, fam: freshFamiliarity(tm, ps, 100), adjust: true };
    const xs: number[] = [];
    for (const o of opps)
      for (let g = 0; g < k; g++) {
        const rng = new Rng((seedBase + tid * 7919 + o.team.tid * 104729 + Math.imul(g + 1, 2654435761)) >>> 0);
        const home = g % 2 === 0;
        const sim = new GameSim(home ? me : o, home ? o : me, { rng, type: 'regular', injuries: false });
        const r = sim.simToEnd();
        const x = r.xShots!;
        const f = sim.xFouledMiss;
        const v = [x[0].pts + f[0] + r.home.t.ftm, x[1].pts + f[1] + r.away.t.ftm];
        xs.push(home ? v[0] - v[1] : v[1] - v[0]);
      }
    runs[id] = xs;
  }
  const ids = Object.keys(runs);
  const avg = mean(ids.map((id) => mean(runs[id])));
  return Object.fromEntries(ids.map((id) => [id, mean(runs[id]) - avg]));
}

const t0 = performance.now();
for (const part of parts) {
  const rows: { abbrev: string; meas: Record<string, number>; fit: Record<string, number>; staff?: string; cur: string }[] = [];
  for (const team of L.teams) {
    const ps = teamPlayers(L, team.tid);
    const t = team.tactics;
    let options: [string, Tactics][];
    let fit: Record<string, number>;
    if (part === 'off' || part === 'def') {
      const presets = part === 'off' ? OFF_PRESETS : DEF_PRESETS;
      options = presets.map((p) => {
        const x = cloneTactics(t);
        if (part === 'off') [x.offense, x.offPreset] = [applyOffPreset(x.offense, p.id), p.id];
        else [x.defense, x.defPreset] = [applyDefPreset(x.defense, p.id), p.id];
        return [p.id, x];
      });
      const pr = rosterProfile(fitRoster(ps));
      fit = part === 'off' ? offPresetFit(pr) : defPresetFit(pr);
    } else {
      options = OFF_SHAPES.map((s) => {
        const x = cloneTactics(t);
        if (s === 'fourOut') delete x.offense.shape;
        else x.offense.shape = s;
        return [s, x];
      });
      fit = shapeFits(fitRoster(ps), t, team.rotation.order);
    }
    const sc = part === 'shape' ? undefined : presetScores(team, ps)[part as 'off' | 'def'];
    const staff = sc && Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
    rows.push({
      abbrev: team.abbrev,
      meas: measure(team.tid, options),
      fit,
      staff,
      cur: part === 'off' ? t.offPreset : part === 'def' ? t.defPreset : (t.offense.shape ?? 'fourOut'),
    });
  }
  const ids = Object.keys(rows[0].meas);
  // fit points are a tenth of a point a game; both against the team's average option
  const rel = (r: (typeof rows)[number]) => {
    const m = mean(ids.map((id) => r.fit[id]));
    return Object.fromEntries(ids.map((id) => [id, (r.fit[id] - m) / 10]));
  };
  const x = rows.flatMap((r) => ids.map((id) => rel(r)[id]));
  const y = rows.flatMap((r) => ids.map((id) => r.meas[id]));
  console.log(`\n== ${part}: ${rows.length} teams × ${ids.length} options, ${(L.teams.length - 1) * k} games each (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  console.log(`r(fit, measured) over every team and option: ${corr(x, y).toFixed(2)}`);
  console.log(
    `within each option across teams: ${ids
      .map(
        (id) =>
          `${id} ${corr(
            rows.map((r) => rel(r)[id]),
            rows.map((r) => r.meas[id]),
          ).toFixed(2)}`,
      )
      .join(' · ')}`,
  );
  console.log(`measured worth against the team's average option: ${ids.map((id) => `${id} ${mean(rows.map((r) => r.meas[id])).toFixed(2)}`).join(' · ')}`);
  const best = (r: (typeof rows)[number]) => ids.reduce((a, id) => (r.meas[id] > r.meas[a] ? id : a), ids[0]);
  const count = (f: (r: (typeof rows)[number]) => string) => JSON.stringify(rows.reduce<Record<string, number>>((a, r) => ({ ...a, [f(r)]: (a[f(r)] ?? 0) + 1 }), {}));
  console.log(`best for: ${count(best)}`);
  if (part !== 'shape') {
    console.log(`the staff picks: ${count((r) => r.staff!)}; the league plays: ${count((r) => r.cur)}`);
    console.log(
      `the staff's pick under the best, a game: ${mean(rows.map((r) => r.meas[best(r)] - r.meas[r.staff!])).toFixed(2)} (the pick is the best for ${rows.filter((r) => best(r) === r.staff).length} of ${rows.length})`,
    );
  } else {
    const said = rows.flatMap((r) =>
      ids.filter((id) => id !== 'fourOut' && Math.abs(r.fit[id] - r.fit.fourOut) >= 2).map((id) => Math.sign(r.fit[id] - r.fit.fourOut) === Math.sign(r.meas[id] - r.meas.fourOut)),
    );
    console.log(`the fit's sign against four-out, where it says 0.2 a game or more: right ${said.filter(Boolean).length} of ${said.length}`);
  }
  for (const r of rows)
    console.log(
      `  ${r.abbrev.padEnd(4)} ${ids.map((id) => `${id} ${r.meas[id] >= 0 ? '+' : ''}${r.meas[id].toFixed(1)}/${(rel(r)[id] >= 0 ? '+' : '') + rel(r)[id].toFixed(1)}`).join('  ')}${r.staff ? `  staff: ${r.staff}` : ''}`,
    );
}
