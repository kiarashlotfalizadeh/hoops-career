// Tactic sweep: what each slider extreme or scheme is worth against the team's own settings, in
// net points per 100 possessions, over four real matchups with paired seeds. On average personnel
// no single extreme should beat the base by more than ~2, and the "why" tags it moves should
// roughly agree with the measured change (tags column: change in tagged points per game, team's view).
// Usage: npx tsx scripts/tactic-sweep.ts [games per matchup] [config names, comma-separated]
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import { ensureRotation } from '../src/core/league/games';
import { teamPlayers } from '../src/core/league/helpers';
import { pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../src/core/ai/lab';

const L = createLeague({ name: 'Sweep', userTid: 0, coachName: 'C', settings: defaultSettings(), seed: JSON.parse(readFileSync('src/data/seed.json', 'utf8')), rngSeed: 7 });
for (const t of L.teams) ensureRotation(L, t.tid);
const side = (tid: number) => ({ team: { ...L.teams[tid], seasons: [] }, players: teamPlayers(L, tid).filter((p) => !p.injury) });
const pairs = [
  [5, 9],
  [13, 22],
  [0, 1],
  [27, 3],
];
const games = Number(process.argv[2] ?? 300);
const which = (process.argv[3] ?? '').split(',').filter(Boolean);
const all: [string, TacticsPatch, string[]][] = [
  ['pressure 0', { defense: { pressure: 0 } }, ['pressure_']],
  ['pressure 25', { defense: { pressure: 25 } }, ['pressure_']],
  ['pressure 75', { defense: { pressure: 75 } }, ['pressure_']],
  ['pressure 100', { defense: { pressure: 100 } }, ['pressure_']],
  ['crash 0', { offense: { crashBoards: 0 } }, ['crash_']],
  ['crash 25', { offense: { crashBoards: 25 } }, ['crash_']],
  ['crash 75', { offense: { crashBoards: 75 } }, ['crash_']],
  ['crash 100', { offense: { crashBoards: 100 } }, ['crash_']],
  ['getBack 0', { defense: { getBack: 0 } }, ['getback', 'crash_']],
  ['getBack 100', { defense: { getBack: 100 } }, ['getback', 'crash_']],
  ['crash100+getBack100', { offense: { crashBoards: 100 }, defense: { getBack: 100 } }, ['crash_', 'getback']],
  ['transition 0', { offense: { transition: 0 } }, ['transition']],
  ['transition 100', { offense: { transition: 100 } }, ['transition']],
  ['phys 0', { defense: { physicality: 0 } }, ['physicality', 'clean_defense']],
  ['phys 100', { defense: { physicality: 100 } }, ['physicality', 'clean_defense']],
  ['help 0', { defense: { help: 0 } }, ['help_']],
  ['help 100', { defense: { help: 100 } }, ['help_']],
  ['press afterMade', { defense: { press: 'afterMade' } }, ['press_']],
  ['press always', { defense: { press: 'always' } }, ['press_']],
  ['pnr drop', { defense: { pnr: 'drop', switchOffBall: false } }, ['drop_', 'switch_', 'blitz_', 'hedge_', 'ice_']],
  ['pnr switch', { defense: { pnr: 'switch', switchOffBall: true } }, ['drop_', 'switch_', 'blitz_', 'hedge_', 'ice_']],
  ['pnr blitz', { defense: { pnr: 'blitz', switchOffBall: false } }, ['drop_', 'switch_', 'blitz_', 'hedge_', 'ice_']],
  ['pnr hedge', { defense: { pnr: 'hedge', switchOffBall: false } }, ['drop_', 'switch_', 'blitz_', 'hedge_', 'ice_']],
  ['pnr ice', { defense: { pnr: 'ice', switchOffBall: false } }, ['drop_', 'switch_', 'blitz_', 'hedge_', 'ice_']],
  ['zone23', { defense: { scheme: 'zone23' } }, ['zone_']],
  ['zone32', { defense: { scheme: 'zone32' } }, ['zone_']],
  ['switchOffBall', { defense: { switchOffBall: true } }, ['switch_', 'drop_']],
  ['star deny', { defense: { starPlan: 'deny' } }, ['star_deny']],
  ['star double', { defense: { starPlan: 'double' } }, ['star_double', 'double_kick']],
  ['pace 0', { offense: { pace: 0 } }, []],
  ['pace 100', { offense: { pace: 100 } }, []],
  ['three 100', { offense: { threePoint: 100 } }, []],
  ['rim 100', { offense: { rimAttack: 100 } }, []],
  ['EXPLOIT', { defense: { pressure: 100, getBack: 100, press: 'always', pnr: 'blitz', switchOffBall: false }, offense: { crashBoards: 100 } }, []],
  ['EXPLOIT-nopress', { defense: { pressure: 100, getBack: 100 }, offense: { crashBoards: 100 } }, []],
];
const cfgs = all.filter(([k]) => !which.length || which.includes(k));
const unknown = which.filter((w) => !all.some(([k]) => k === w));
if (unknown.length) throw new Error(`No config named ${unknown.join(', ')}; the names are: ${all.map(([k]) => k).join(', ')}`);

const base: LabSummary[] = pairs.map(([a, b]) => runLab({ a: side(a), b: side(b), games, seed: 4242 + a }));
const avg = (f: (r: LabSummary) => number, rs: LabSummary[]) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
const tags = (r: LabSummary, prefixes: string[]) => Object.entries(r.impacts).reduce((s, [k, v]) => s + (prefixes.some((p) => k.startsWith(p)) ? v.us - v.them : 0), 0);
const stats = (rs: LabSummary[]) =>
  `oppTov ${(avg((r) => r.oppShot.tov, rs) * 100).toFixed(1)} orb% ${(avg((r) => r.shot.orb, rs) * 100).toFixed(1)} oppOrb% ${(avg((r) => r.oppShot.orb, rs) * 100).toFixed(1)} trans ${(avg((r) => r.playTypes.transition?.freq ?? 0, rs) * 100).toFixed(1)}% oppTrans ${(avg((r) => r.oppPlayTypes.transition?.freq ?? 0, rs) * 100).toFixed(1)}% oppFTr ${avg((r) => r.oppShot.ftRate, rs).toFixed(3)}`;
console.log(`${games} games x ${pairs.length} matchups; base net ${avg((r) => r.net, base).toFixed(2)} | ${stats(base)}`);
for (const [name, patch, prefixes] of cfgs) {
  const rs = pairs.map(([a, b]) => runLab({ a: side(a), b: side(b), games, seed: 4242 + a, patch }));
  const d = rs.map((r, i) => pairedDelta(base[i], r));
  const delta = d.reduce((s, x) => s + x.delta, 0) / d.length;
  const se = Math.sqrt(d.reduce((s, x) => s + x.se ** 2, 0)) / d.length;
  const perGame = rs.map((r, i) => (delta * (r.pace + base[i].pace)) / 200).reduce((s, x) => s + x, 0) / rs.length;
  const tagDelta = prefixes.length ? rs.reduce((s, r, i) => s + tags(r, prefixes) - tags(base[i], prefixes), 0) / rs.length : NaN;
  console.log(
    `${name.padEnd(20)} net ${delta >= 0 ? '+' : ''}${delta.toFixed(2).padStart(5)} ± ${se.toFixed(2)} /100 (${perGame.toFixed(1)} pts/g, tags ${Number.isNaN(tagDelta) ? '   -' : tagDelta.toFixed(1)}) | ${stats(rs)}`,
  );
}
