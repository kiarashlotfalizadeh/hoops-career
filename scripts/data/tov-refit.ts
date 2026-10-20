// Re-fit each real player's turnover tendency (tend.tov) to the engine as it plays now, in place in
// src/data/seed.json. The build's calibration (calibrate.ts) fits it as turnovers per use of the ball
// (FGA + 0.44 FTA + TOV): a residual for how often the engine hands him the ball where it can be lost.
// When the engine or the AI's tactics change who has the ball (every man-to-man playbook switching
// off-ball screens hands bigs cross-screen post-ups on smalls), that residual drifts: in October 2026
// centers turned it over on 18% of their uses (real 12.5%) and point guards on 11.6% (13.5%), so a
// Rudy Gobert lost it 3.5 times a game (1.4). This plays real-roster seasons through the league code,
// compares each player's turnovers per use with his real seasons' (weighted as the build weighs them)
// and steps his multiplier toward it, a few passes, nothing else in the seed moving.
// Usage: npx tsx scripts/data/tov-refit.ts [passes] [days]   (env HC_SEED_OUT: the seed to rewrite)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLeague, defaultSettings, type SeedData } from '../../src/core/league/create';
import { simDay, startRegularSeason } from '../../src/core/league/season';
import { releasePlayer } from '../../src/core/league/contracts';
import { standardRoster } from '../../src/core/league/helpers';
import { clamp } from '../../src/core/random';
import { CAP } from '../../src/core/constants';
import type { PlayerStats } from '../../src/core/types';
import { SEASON_WEIGHT } from './derive';

const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');
const passes = Number(process.argv[2] ?? 3);
const days = Number(process.argv[3] ?? 110);
const RNGS = [7, 11];
/** How far one pass steps toward the target (in log space), times the sample's reliability. */
const DAMP = 0.85;
/** Bounds the build's calibration keeps the multiplier in. */
const MIN = 0.3;
const MAX = 3.5;

const uses = (s: { fga: number; fta: number; tov: number }) => s.fga + 0.44 * s.fta + s.tov;

/** His real turnovers per use over the seasons the build weighs (regular season), and the weighted uses behind it. */
function target(stats: PlayerStats[]): { rate: number; uses: number } | null {
  let tov = 0;
  let u = 0;
  for (const s of stats) {
    const w = s.real && !s.playoffs ? SEASON_WEIGHT[s.season] : undefined;
    if (!w) continue;
    tov += s.tov * w;
    u += uses(s) * w;
  }
  return u >= 150 ? { rate: tov / u, uses: u } : null;
}

interface Acc {
  tov: number;
  use: number;
  min: number;
}

/** Play `days` of a real-roster regular season and total each seed player's turnovers and uses. */
function play(seed: SeedData, rngSeed: number, into: Map<string, Acc>) {
  const league = createLeague({ name: 'Refit', userTid: 0, coachName: 'Refit', settings: defaultSettings(), seed: structuredClone(seed), rngSeed });
  // (as real-check does: the user's team cut to 15 and run by its staff)
  const roster = standardRoster(league, 0).sort((a, b) => a.ovr - b.ovr);
  while (standardRoster(league, 0).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
  const errs = startRegularSeason(league);
  if (errs.length) throw new Error(errs.join('; '));
  for (let d = 0; d < days && league.phase === 'regular'; d++) simDay(league);
  for (const p of Object.values(league.players)) {
    if (!p.bbrefId) continue;
    const s = p.stats.filter((x) => x.season === league.season && !x.playoffs);
    const a = into.get(p.bbrefId) ?? { tov: 0, use: 0, min: 0 };
    for (const x of s) {
      a.tov += x.tov;
      a.use += uses(x);
      a.min += x.min;
    }
    into.set(p.bbrefId, a);
  }
}

function report(seed: SeedData, sim: Map<string, Acc>, label: string) {
  const groups = new Map<string, { st: number; su: number; rt: number; ru: number }>();
  let err = 0;
  let n = 0;
  for (const sp of seed.players) {
    const a = sim.get(sp.id);
    const t = target(sp.stats);
    if (!a || !t || a.use < 120) continue;
    const g = sp.pos.includes('C') ? 'C' : sp.pos.includes('PG') ? 'PG' : 'wings/forwards';
    const x = groups.get(g) ?? { st: 0, su: 0, rt: 0, ru: 0 };
    x.st += a.tov;
    x.su += a.use;
    x.rt += t.rate * a.use;
    x.ru += a.use;
    groups.set(g, x);
    err += Math.abs(a.tov / a.use - t.rate);
    n++;
  }
  const by = [...groups].map(([g, x]) => `${g} ${((100 * x.st) / x.su).toFixed(1)}% (real ${((100 * x.rt) / x.ru).toFixed(1)}%)`).join(', ');
  console.log(`${label}: turnovers per use ${by}; mean abs error ${((100 * err) / Math.max(1, n)).toFixed(2)} points over ${n} players`);
}

function main() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  for (let pass = 0; pass <= passes; pass++) {
    const sim = new Map<string, Acc>();
    for (const r of RNGS) play(seed, r, sim);
    report(seed, sim, pass === 0 ? 'before' : `after pass ${pass}`);
    if (pass === passes) break;
    for (const sp of seed.players) {
      const a = sim.get(sp.id);
      const t = target(sp.stats);
      if (!a || !t || a.use < 60 || !a.tov || !sp.tend) continue;
      // (a thin sample on either side moves him less)
      const rel = (a.use / (a.use + 250)) * (t.uses / (t.uses + 250));
      const ratio = t.rate / (a.tov / a.use);
      sp.tend.tov = Math.round(clamp((sp.tend.tov ?? 1) * Math.exp(Math.log(ratio) * DAMP * rel), MIN, MAX) * 1000) / 1000;
    }
  }
  const json = JSON.stringify(seed);
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT} (${(json.length / 1e6).toFixed(2)} MB)`);
}

main();
