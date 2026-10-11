// Engine calibration bench: builds a synthetic 30-team league, simulates games and
// compares league-wide averages to 2025-26 NBA targets. Usage: npx tsx scripts/engine-bench.ts [games]
import { Rng } from '../src/core/random';
import { generatePlayer, DEFAULT_SCALE } from '../src/core/playerGen';
import { makeTeam } from '../src/core/teamFactory';
import { autoRotation, autoTactics } from '../src/core/ai/coachAI';
import { GameSim } from '../src/core/sim/engine';
import { TARGETS } from '../src/core/constants';
import { buildOvrScale, ovrRaw, toDisplay } from '../src/core/ratings';
import type { Player, Team } from '../src/core/types';

const games = Number(process.argv[2] ?? 600);
const rng = new Rng(12345);
let pid = 0;
const teams: Team[] = [];
const rosters: Player[][] = [];
const all: Player[] = [];
for (let tid = 0; tid < 30; tid++) {
  const team = makeTeam(tid, 2027, rng);
  const roster: Player[] = [];
  for (let i = 0; i < 14; i++) {
    const talent = rng.normal(i < 3 ? 1.2 : i < 8 ? 0.2 : -0.7, 0.8);
    const age = Math.round(rng.uniform(20, 34));
    roster.push(generatePlayer(rng, { pid: pid++, season: 2027, tid, age, talent, scale: DEFAULT_SCALE }));
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

const presetCount: Record<string, number> = {};
for (const t of teams) presetCount[`${t.tactics.offPreset}/${t.tactics.defPreset}`] = (presetCount[`${t.tactics.offPreset}/${t.tactics.defPreset}`] ?? 0) + 1;
console.log('AI presets:', Object.entries(presetCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));

const sum: Record<string, number> = {};
const add = (k: string, v: number) => (sum[k] = (sum[k] ?? 0) + v);
const ptTotals: Record<string, { poss: number; pts: number }> = {};
const impactTotals: Record<string, number> = {};
let ot = 0;
const t0 = performance.now();
let homeWins = 0;
const minutes: number[] = [];
const margins: number[] = [];
const scores: [number, number][] = [];
for (let g = 0; g < games; g++) {
  const h = g % 30;
  let a = rng.int(0, 29);
  if (a === h) a = (a + 1) % 30;
  const sim = new GameSim({ team: teams[h], players: rosters[h], adjust: true }, { team: teams[a], players: rosters[a], adjust: true }, { rng, type: 'regular' });
  const res = sim.simToEnd();
  if (res.home.pts > res.away.pts) homeWins++;
  margins.push(res.home.pts - res.away.pts);
  scores.push([res.home.pts, res.away.pts]);
  ot += res.ot > 0 ? 1 : 0;
  for (const tb of [res.home, res.away]) {
    add('poss', tb.poss);
    for (const [k, v] of Object.entries(tb.t)) add(k, v);
    for (const [k, v] of Object.entries(tb.playTypes)) {
      const e = (ptTotals[k] ??= { poss: 0, pts: 0 });
      e.poss += v.poss;
      e.pts += v.pts;
    }
    for (const pl of tb.players) if (pl.min > 0) minutes.push(pl.min);
  }
  for (const im of res.impacts ?? []) impactTotals[im.key] = (impactTotals[im.key] ?? 0) + im.pts;
}
const ms = performance.now() - t0;
const n = games * 2;
const avg = (k: string) => sum[k] / n;
const rows: [string, number, number][] = [
  ['pace (poss)', avg('poss') * (48 / 48), TARGETS.pace],
  ['pts', avg('pts'), TARGETS.pts],
  ['ortg', (sum.pts / sum.poss) * 100, TARGETS.ortg],
  ['fga', avg('fga'), TARGETS.fga],
  ['fg%', sum.fgm / sum.fga, TARGETS.fgPct],
  ['3pa', avg('tpa'), TARGETS.tpa],
  ['3p%', sum.tpm / sum.tpa, TARGETS.tpPct],
  ['fta', avg('fta'), TARGETS.fta],
  ['ft%', sum.ftm / sum.fta, TARGETS.ftPct],
  ['orb', avg('orb'), TARGETS.orb],
  ['drb', avg('drb'), TARGETS.drb],
  ['ast', avg('ast'), TARGETS.ast],
  ['stl', avg('stl'), TARGETS.stl],
  ['blk', avg('blk'), TARGETS.blk],
  ['tov', avg('tov'), TARGETS.tov],
  ['pf', avg('pf'), TARGETS.pf],
];
console.log(`${games} games in ${ms.toFixed(0)}ms (${(ms / games).toFixed(2)} ms/game). Home win% ${(homeWins / games).toFixed(3)}, OT ${(ot / games).toFixed(3)}`);
for (const [k, v, t] of rows) console.log(`${k.padEnd(12)} ${v.toFixed(3).padStart(8)}  target ${t.toFixed(3).padStart(8)}  ${(((v - t) / t) * 100).toFixed(1).padStart(6)}%`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
const hs = scores.map((x) => x[0]);
const as = scores.map((x) => x[1]);
const corr = hs.reduce((a, h, i) => a + (h - mean(hs)) * (as[i] - mean(as)), 0) / (hs.length - 1) / sd(hs) / sd(as);
console.log('\nGame shape (random matchups, so the margin includes team strength):');
for (const [k, v, t] of [
  ['margin sd', sd(margins), TARGETS.marginSd],
  ['20+ games', margins.filter((m) => Math.abs(m) >= 20).length / games, TARGETS.blowout20],
  ['overtime', ot / games, TARGETS.otRate],
  ['score corr', corr, TARGETS.scoreCorr],
] as const)
  console.log(`${k.padEnd(12)} ${v.toFixed(3).padStart(8)}  target ${t.toFixed(3).padStart(8)}`);
console.log('\nPlay types (share of poss, PPP):');
const totalPoss = Object.values(ptTotals).reduce((a, b) => a + b.poss, 0);
for (const [k, v] of Object.entries(ptTotals).sort((a, b) => b[1].poss - a[1].poss)) {
  console.log(`  ${k.padEnd(12)} ${((v.poss / totalPoss) * 100).toFixed(1).padStart(5)}%  ${(v.pts / v.poss).toFixed(3)}`);
}
console.log('\nImpact keys (avg pts per game):');
for (const [k, v] of Object.entries(impactTotals).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${(v / games).toFixed(2)}`);
minutes.sort((a, b) => b - a);
console.log('\nMinutes: max', minutes[0], 'p95', minutes[Math.floor(minutes.length * 0.05)]);
