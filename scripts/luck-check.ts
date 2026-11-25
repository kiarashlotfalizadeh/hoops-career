// Shooting-luck check: is a game's "shooting luck" figure as wide as the report says it is?
//
// The report reads a night's luck (what both sides' shots came to, against what their looks were
// worth) against that game's own shot-by-shot spread (GameResult.xShots: `sd`). This plays games the
// way the bench does (a generated league's teams, staff rotations and tactics) and checks that the
// luck figure, measured in those spreads, has no lean (mean near 0) and the width it claims (SD near
// 1), and that "1-in-N" nights come about as often as they say (past 2 SD: about 4.6% of games).
//
// Usage: npx tsx scripts/luck-check.ts [games]
import { Rng } from '../src/core/random';
import { generatePlayer, DEFAULT_SCALE } from '../src/core/playerGen';
import { makeTeam } from '../src/core/teamFactory';
import { autoRotation, autoTactics } from '../src/core/ai/coachAI';
import { GameSim } from '../src/core/sim/engine';
import { buildOvrScale, ovrRaw, toDisplay } from '../src/core/ratings';
import { luckPts, luckZ } from '../src/core/analysis/debrief';
import type { Player, Team } from '../src/core/types';

const games = Number(process.argv[2] ?? 1500);
const rng = new Rng(4242);
let pid = 0;
const teams: Team[] = [];
const rosters: Player[][] = [];
const all: Player[] = [];
for (let tid = 0; tid < 30; tid++) {
  const team = makeTeam(tid, 2027, rng);
  const roster: Player[] = [];
  for (let i = 0; i < 14; i++) {
    const talent = rng.normal(i < 3 ? 1.2 : i < 8 ? 0.2 : -0.7, 0.8);
    roster.push(generatePlayer(rng, { pid: pid++, season: 2027, tid, age: Math.round(rng.uniform(20, 34)), talent, scale: DEFAULT_SCALE }));
  }
  teams.push(team);
  rosters.push(roster);
  all.push(...roster);
}
const scale = buildOvrScale(all.map((p) => ovrRaw(p.ratings)));
for (const p of all) p.ovr = toDisplay(ovrRaw(p.ratings), scale);
for (let i = 0; i < 30; i++) {
  teams[i].rotation = autoRotation(rosters[i]);
  teams[i].tactics = autoTactics(teams[i], rosters[i], false);
}

const luck: number[] = [];
const z: number[] = [];
const sds: number[] = [];
const side: number[] = [];
for (let g = 0; g < games; g++) {
  const h = g % 30;
  let a = rng.int(0, 29);
  if (a === h) a = (a + 1) % 30;
  const sim = new GameSim(
    { team: teams[h], players: rosters[h], adjust: true },
    { team: teams[a], players: rosters[a], adjust: true },
    { rng: new Rng(rng.int(1, 2 ** 31 - 1)), type: 'regular' },
  );
  const r = sim.simToEnd();
  const l = luckPts(r, 0) - luckPts(r, 1);
  luck.push(l);
  side.push(luckPts(r, 0), luckPts(r, 1));
  z.push(luckZ(r, 0)!);
  sds.push(Math.hypot(r.xShots![0].sd!, r.xShots![1].sd!));
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const past = (k: number) => z.filter((x) => Math.abs(x) >= k).length / z.length;
console.log(`${games} games`);
console.log(`one side's luck: mean ${mean(side).toFixed(2)} pts (0 = no lean), SD ${sd(side).toFixed(1)}`);
console.log(`the game's luck (home less away): SD ${sd(luck).toFixed(1)} pts; its own spread says ${mean(sds).toFixed(1)}`);
console.log(`in its own spreads: mean ${mean(z).toFixed(3)}, SD ${sd(z).toFixed(3)} (1 = as wide as it says)`);
console.log(`past 2 SD: ${(past(2) * 100).toFixed(1)}% (4.6%) · past 3 SD: ${(past(3) * 100).toFixed(2)}% (0.27%)`);
const ok = Math.abs(mean(side)) < 0.5 && Math.abs(sd(z) - 1) < 0.08 && past(2) < 0.07;
console.log(ok ? 'OK' : 'OFF');
if (!ok) process.exitCode = 1;
