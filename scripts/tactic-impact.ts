// Tactic impact: what aimed tactical choices are worth when they fit the opponent and when they don't,
// in net points per 100 possessions for the team making the choice, paired seeds (the same games with
// and without it), each pooled over three teams making it. The opponents are teams reshaped to have
// what each choice is aimed at (a star with non-shooters around him, a shooting team, a pull-up
// shooter on the ball...). Each case is measured at 1x tactical leverage (the engine before tactics
// were made to matter more) and at K.tacticEdge, with the ratio; the tags columns are the change in
// the tags the choice moves, per 100 too, as the tactic-sweep reads them: they should roughly agree
// with the measured values.
// Then, for sets, what one run is worth over the trip the team would have run, per possession (the
// sets test's measure: a fork of the game calls the set while the game itself plays on): on its first
// run against a defense it beats and one that kills it, and after a read (the read's cost).
// Usage: npx tsx scripts/tactic-impact.ts [games per team] [case names, comma-separated (substrings), or "sets"]
import { createLeague, defaultSettings } from '../src/core/league/create';
import { teamPlayers } from '../src/core/league/helpers';
import { applyPatch, pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../src/core/ai/lab';
import { composites } from '../src/core/ratings';
import type { Player, SetId, Tactics } from '../src/core/types';
import { GameSim, K, type SimTeamInput } from '../src/core/sim/engine';
import { castFor, setFit } from '../src/core/sim/sets';
import { Rng } from '../src/core/random';

const games = Number(process.argv[2] ?? 400);
const which = (process.argv[3] ?? '').split(',').filter(Boolean);
// the fictional league the engine tests play (the box-and-one's numbers in the README are its)
const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
const MAN: TacticsPatch = { defense: { scheme: 'man', pnr: 'drop', switchOffBall: false, help: 50, pressure: 50, starPlan: 'none' } };
const side = (tid: number, patch?: TacticsPatch, players?: Player[], tactics?: Tactics): SimTeamInput => ({
  team: { ...league.teams[tid], tactics: applyPatch(tactics ?? league.teams[tid].tactics, patch) },
  players: players ?? teamPlayers(league, tid),
});
const c = (p: Player) => composites(p.ratings);
const starters = (tid: number, ps: Player[]) => {
  const s = new Set(league.teams[tid].rotation.order.slice(0, 5));
  return ps.filter((p) => s.has(p.pid));
};

/** A team reshaped to have what a choice is aimed at; `who` is the player an instruction or a hunt names. */
interface Shape {
  players: Player[];
  tactics: Tactics;
  who?: number;
}
const OFF_TEAM = 9;
function shaped(kind: string, tid = OFF_TEAM): Shape {
  const players = structuredClone(teamPlayers(league, tid)).sort((a, b) => b.ovr - a.ovr);
  const tactics = structuredClone(league.teams[tid].tactics);
  const set = (p: Player, r: Partial<Player['ratings']>) => Object.assign(p.ratings, r);
  const five = starters(tid, players);
  const handler = [...five].sort((a, b) => c(b).pnrHandle - c(a).pnrHandle)[0];
  const big = [...five].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  let who: number | undefined;
  switch (kind) {
    // engineDefense's shapes: a star creator on a green light with non-shooters around him, every player a shooter and nobody a creator
    case 'helio':
    case 'selfish':
    case 'starShooters':
      players.forEach((p, i) => {
        // (a selfish star: the same scorer, but no passer, so a double gets the ball out of his hands)
        if (i === 0) set(p, { hnd: 92, pas: kind === 'selfish' ? 40 : 86, oiq: 90, tp: 84, mid: 84, spd: 84, ins: 78, drw: 80 });
        else if (kind !== 'starShooters') set(p, { tp: 22, hnd: Math.min(p.ratings.hnd, 45), mid: Math.min(p.ratings.mid, 45) });
        else set(p, { tp: 84, hnd: Math.min(p.ratings.hnd, 55), pas: Math.min(p.ratings.pas, 50) });
      });
      tactics.offense.roles[players[0].pid] = 'creator';
      tactics.offense.freedom[players[0].pid] = 1;
      who = players[0].pid;
      break;
    case 'shooters':
      for (const p of players) set(p, { tp: 82, hnd: Math.min(p.ratings.hnd, 60), mid: 64 });
      Object.assign(tactics.offense, { threePoint: 100, rimAttack: 40, crashBoards: 10, actions: { motion: 100, handoff: 90, pnr: 45, iso: 10, post: 0 } });
      break;
    case 'post':
      for (const p of players) set(p, p.ratings.hgt >= 60 ? { post: 88, str: 85, ins: 80 } : { tp: Math.min(p.ratings.tp, 35) });
      Object.assign(tactics.offense, { threePoint: 0, rimAttack: 100, crashBoards: 85, actions: { post: 100, iso: 70, pnr: 45, motion: 25, handoff: 10 } });
      break;
    // the ball handler in the pick-and-roll: a pull-up shooter, or one who can't shoot
    case 'pullup':
      set(handler, { tp: 90, mid: 90, hnd: 88, oiq: 85 });
      tactics.offense.actions.pnr = 100;
      who = handler.pid;
      break;
    case 'driver':
      set(handler, { tp: 20, mid: 25, hnd: 85, spd: 85, ins: 80 });
      tactics.offense.actions.pnr = 100;
      who = handler.pid;
      break;
    // a big who rolls hard, and the handler to find him
    case 'roller':
      set(big, { ins: 90, ath: 90, hgt: Math.max(big.ratings.hgt, 82), str: 82, oiq: 75, tp: 15 });
      set(handler, { pas: 85 });
      tactics.offense.actions.pnr = 100;
      tactics.offense.screeners = [big.pid];
      who = big.pid;
      break;
    // a starter for an instruction: a shooter who can't drive, one who can, a non-shooter, a big who can't make free throws
    case 'shooterNoDrive':
    case 'shooterDriver':
    case 'nonShooter':
    case 'poorFtBig': {
      const p = kind === 'poorFtBig' ? big : five.filter((x) => x !== handler && x !== big).sort((a, b) => c(b).c3 - c(a).c3)[0];
      delete p.tend;
      if (kind === 'shooterNoDrive') set(p, { tp: 92, hnd: 30, spd: 40, ins: 30, ath: 40 });
      if (kind === 'shooterDriver') set(p, { tp: 92, hnd: 85, spd: 85, ins: 80, ath: 80 });
      if (kind === 'nonShooter') set(p, { tp: 15 });
      if (kind === 'poorFtBig') set(p, { ft: 25, post: 80, ins: 80, drw: 85, str: 85 });
      who = p.pid;
      break;
    }
    // ball security across the roster
    case 'loose':
      for (const p of players) set(p, { hnd: Math.min(p.ratings.hnd, 35), pas: Math.min(p.ratings.pas, 40), oiq: Math.min(p.ratings.oiq, 45) });
      break;
    case 'secure':
      for (const p of players) set(p, { hnd: Math.max(p.ratings.hnd, 82), pas: Math.max(p.ratings.pas, 78), oiq: Math.max(p.ratings.oiq, 78) });
      break;
    // a team that runs after every stop, and one that walks it up
    case 'runner':
      for (const p of players) set(p, { spd: Math.max(p.ratings.spd, 75) });
      Object.assign(tactics.offense, { transition: 100, pace: 90 });
      break;
    case 'walker':
      for (const p of players) set(p, { spd: Math.min(p.ratings.spd, 45) });
      Object.assign(tactics.offense, { transition: 0, pace: 15 });
      break;
    // a defense with a weak link on the perimeter (and the best perimeter defender of their five, to hunt by mistake)
    case 'weakLink':
    case 'stopper': {
      const p = five.filter((x) => x !== big).sort((a, b) => c(a).perDef - c(b).perDef)[kind === 'weakLink' ? 0 : 3];
      set(p, kind === 'weakLink' ? { perD: 20, spd: 40, diq: 35 } : { perD: 95, spd: 85, diq: 85 });
      who = p.pid;
      break;
    }
    case 'base':
      break;
    default:
      throw new Error(`No shape ${kind}`);
  }
  return { players, tactics, who };
}

/** Teams that make the choice: three for each, so one roster's quirks don't decide it. */
const DEFENSES = [4, 3, 11];
const OFFENSES = [5, 13, 21];
const pooled = (rs: LabSummary[]): LabSummary => ({
  ...rs[0],
  margins: rs.flatMap((r) => r.margins),
  pace: rs.reduce((x, r) => x + r.pace, 0) / rs.length,
  impacts: Object.fromEntries(
    [...new Set(rs.flatMap((r) => Object.keys(r.impacts)))].map((k) => [
      k,
      { us: rs.reduce((s, r) => s + (r.impacts[k]?.us ?? 0), 0) / rs.length, them: rs.reduce((s, r) => s + (r.impacts[k]?.them ?? 0), 0) / rs.length },
    ]),
  ),
});
const tags = (r: LabSummary, prefixes: string[]) => Object.entries(r.impacts).reduce((s, [k, v]) => s + (prefixes.some((p) => k.startsWith(p)) ? v.us - v.them : 0), 0);

interface Case {
  name: string;
  /** Whether the choice is aimed right (+) or wrong (-) for this opponent. */
  aim: '+' | '-';
  /** The defense chooses against a reshaped offense, or the offense against a reshaped (or set) defense. */
  by: 'def' | 'off';
  shape: string;
  base: (s: Shape) => TacticsPatch;
  alt: (s: Shape) => TacticsPatch;
  /** Patch on the opponent (the defense an offensive choice faces). */
  opp?: TacticsPatch;
  /** The tags the choice moves. */
  tags: string[];
  /** The teams making it (else three defenses or three offenses). */
  teams?: number[];
}
const d = (defense: TacticsPatch['defense']): TacticsPatch => ({ defense: { ...MAN.defense, ...defense } });
const pd = (kind: 'under' | 'tight' | 'sag' | 'body') => (s: Shape) => d({ playerD: { [s.who!]: kind } });
const PKG: SetId[] = ['floppy', 'chicago', 'spain', 'elevator'];
const COV = ['drop_', 'switch_', 'blitz_', 'hedge_', 'ice_'];
const cases: Case[] = [
  { name: 'box1 vs star+non-shooters', aim: '+', by: 'def', shape: 'helio', base: () => MAN, alt: (s) => d({ scheme: 'box1', chase: [s.who!] }), tags: ['box_', 'zone_'] },
  { name: 'box1 vs shooting team', aim: '-', by: 'def', shape: 'shooters', base: () => MAN, alt: () => d({ scheme: 'box1' }), tags: ['box_', 'zone_'] },
  { name: '3-2 (not 2-3) vs shooting team', aim: '+', by: 'def', shape: 'shooters', base: () => d({ scheme: 'zone23' }), alt: () => d({ scheme: 'zone32' }), tags: ['zone_'] },
  { name: '3-2 (not 2-3) vs post team', aim: '-', by: 'def', shape: 'post', base: () => d({ scheme: 'zone23' }), alt: () => d({ scheme: 'zone32' }), tags: ['zone_'] },
  { name: '2-3 (not man) vs post team', aim: '+', by: 'def', shape: 'post', base: () => MAN, alt: () => d({ scheme: 'zone23' }), tags: ['zone_'] },
  { name: '2-3 (not man) vs shooting team', aim: '-', by: 'def', shape: 'shooters', base: () => MAN, alt: () => d({ scheme: 'zone23' }), tags: ['zone_'] },
  { name: 'drop (not hedge) vs non-shooting handler', aim: '+', by: 'def', shape: 'driver', base: () => d({ pnr: 'hedge' }), alt: () => d({ pnr: 'drop' }), tags: COV },
  { name: 'drop (not hedge) vs pull-up shooter', aim: '-', by: 'def', shape: 'pullup', base: () => d({ pnr: 'hedge' }), alt: () => d({ pnr: 'drop' }), tags: COV },
  { name: 'hedge (not drop) vs pull-up shooter', aim: '+', by: 'def', shape: 'pullup', base: () => d({ pnr: 'drop' }), alt: () => d({ pnr: 'hedge' }), tags: COV },
  { name: 'hedge (not drop) vs roll threat', aim: '-', by: 'def', shape: 'roller', base: () => d({ pnr: 'drop' }), alt: () => d({ pnr: 'hedge' }), tags: COV },
  { name: 'top-lock a shooter who cannot drive', aim: '+', by: 'def', shape: 'shooterNoDrive', base: () => MAN, alt: pd('tight'), tags: ['pd_'] },
  { name: 'top-lock a shooter who drives', aim: '-', by: 'def', shape: 'shooterDriver', base: () => MAN, alt: pd('tight'), tags: ['pd_'] },
  { name: 'sag off a non-shooter', aim: '+', by: 'def', shape: 'nonShooter', base: () => MAN, alt: pd('sag'), tags: ['pd_'] },
  { name: 'sag off a shooter', aim: '-', by: 'def', shape: 'shooterNoDrive', base: () => MAN, alt: pd('sag'), tags: ['pd_'] },
  { name: 'go under a handler who cannot shoot', aim: '+', by: 'def', shape: 'driver', base: () => MAN, alt: pd('under'), tags: ['pd_'] },
  { name: 'go under a pull-up shooter', aim: '-', by: 'def', shape: 'pullup', base: () => MAN, alt: pd('under'), tags: ['pd_'] },
  { name: 'get physical with a poor FT big', aim: '+', by: 'def', shape: 'poorFtBig', base: () => MAN, alt: pd('body'), tags: ['pd_'] },
  {
    name: 'double a star who cannot pass',
    aim: '+',
    by: 'def',
    shape: 'selfish',
    base: () => MAN,
    alt: (s) => d({ starPlan: 'double', starTarget: s.who! }),
    tags: ['star_', 'double_'],
  },
  {
    name: 'double a passing star (shooters around)',
    aim: '-',
    by: 'def',
    shape: 'starShooters',
    base: () => MAN,
    alt: (s) => d({ starPlan: 'double', starTarget: s.who! }),
    tags: ['star_', 'double_'],
  },
  { name: 'deny the star (non-shooters around)', aim: '+', by: 'def', shape: 'helio', base: () => MAN, alt: (s) => d({ starPlan: 'deny', starTarget: s.who! }), tags: ['star_'] },
  { name: 'press after makes vs loose handlers', aim: '+', by: 'def', shape: 'loose', base: () => MAN, alt: () => d({ press: 'afterMade' }), tags: ['press_'] },
  { name: 'press after makes vs secure handlers', aim: '-', by: 'def', shape: 'secure', base: () => MAN, alt: () => d({ press: 'afterMade' }), tags: ['press_'] },
  { name: 'pressure 85 vs loose handlers', aim: '+', by: 'def', shape: 'loose', base: () => MAN, alt: () => d({ pressure: 85 }), tags: ['pressure_'] },
  { name: 'pressure 85 vs secure handlers', aim: '-', by: 'def', shape: 'secure', base: () => MAN, alt: () => d({ pressure: 85 }), tags: ['pressure_'] },
  { name: 'pack the paint vs non-shooters', aim: '+', by: 'def', shape: 'post', base: () => MAN, alt: () => d({ help: 85 }), tags: ['help_', 'spacing'] },
  { name: 'pack the paint vs shooting team', aim: '-', by: 'def', shape: 'shooters', base: () => MAN, alt: () => d({ help: 85 }), tags: ['help_', 'spacing'] },
  { name: 'sprint back vs a running team', aim: '+', by: 'def', shape: 'runner', base: () => MAN, alt: () => d({ getBack: 90 }), tags: ['getback', 'crash_'] },
  { name: 'sprint back vs a walk-it-up team', aim: '-', by: 'def', shape: 'walker', base: () => MAN, alt: () => d({ getBack: 90 }), tags: ['getback', 'crash_'] },
  // offensive choices: the defense they face is a reshaped team playing the settings named
  { name: 'set package vs drop', aim: '+', by: 'off', shape: 'base', opp: MAN, base: () => ({}), alt: () => ({ offense: { sets: PKG } }), tags: ['set_'] },
  {
    name: 'set package vs switch',
    aim: '-',
    by: 'off',
    shape: 'base',
    opp: d({ pnr: 'switch', switchOffBall: true }),
    base: () => ({}),
    alt: () => ({ offense: { sets: PKG } }),
    tags: ['set_'],
  },
  { name: 'hunt their weak link', aim: '+', by: 'off', shape: 'weakLink', opp: MAN, base: () => ({}), alt: (s) => ({ offense: { huntTarget: s.who! } }), tags: ['hunt'] },
  { name: 'hunt their stopper', aim: '-', by: 'off', shape: 'stopper', opp: MAN, base: () => ({}), alt: (s) => ({ offense: { huntTarget: s.who! } }), tags: ['hunt'] },
  {
    name: 'crash the glass vs a walk-it-up team',
    aim: '+',
    by: 'off',
    shape: 'walker',
    opp: MAN,
    base: () => ({}),
    alt: () => ({ offense: { crashBoards: 90 } }),
    tags: ['crash_', 'getback'],
  },
  {
    name: 'crash the glass vs a running team',
    aim: '-',
    by: 'off',
    shape: 'runner',
    opp: MAN,
    base: () => ({}),
    alt: () => ({ offense: { crashBoards: 90 } }),
    tags: ['crash_', 'getback'],
  },
];
const todo = cases.filter((x) => !which.length || which.some((w) => x.name.includes(w)));
const setsToo = !which.length || which.includes('sets');
if (!todo.length && !setsToo) throw new Error(`No case matches ${which.join(', ')}; the cases are: ${cases.map((x) => x.name).join('; ')}`);

const EDGE = K.tacticEdge;
console.log(`${games} games x 3 teams per case: net pts/100 for the team making the choice (paired) at 1x and ${EDGE}x tactical leverage, tags per 100 likewise`);
const sum = { right: [0, 0], wrong: [0, 0] };
for (const k of todo) {
  const s = shaped(k.shape);
  const teams = k.teams ?? (k.by === 'def' ? DEFENSES : OFFENSES);
  const run = (patch: TacticsPatch) =>
    pooled(
      teams.map((t, i) => {
        // the team making the choice is side A; its opponent is the reshaped team
        const opp = k.by === 'def' ? side(OFF_TEAM, undefined, s.players, s.tactics) : side(OFF_TEAM, k.opp, s.players, s.tactics);
        return runLab({ a: side(t, patch), b: opp, games, seed: 31 + 1000 * i });
      }),
    );
  const out = [1, EDGE].map((e) => {
    K.tacticEdge = e;
    const base = run(k.base(s));
    const alt = run({ ...k.base(s), ...k.alt(s), defense: { ...k.base(s).defense, ...k.alt(s).defense }, offense: { ...k.base(s).offense, ...k.alt(s).offense } });
    const { delta, se } = pairedDelta(base, alt);
    const per100 = 100 / ((base.pace + alt.pace) / 2);
    return { delta, se, tags: (tags(alt, k.tags) - tags(base, k.tags)) * per100 };
  });
  K.tacticEdge = EDGE;
  const [a, b] = out;
  const acc = k.aim === '+' ? sum.right : sum.wrong;
  acc[0] += a.delta;
  acc[1] += b.delta;
  const f = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
  console.log(
    `${k.aim} ${k.name.padEnd(42)} ${f(a.delta).padStart(6)} ± ${a.se.toFixed(2)} → ${f(b.delta).padStart(6)} ± ${b.se.toFixed(2)}  x${(b.delta / a.delta).toFixed(1).padStart(4)}   tags ${f(a.tags)} → ${f(b.tags)}`,
  );
}
const nr = todo.filter((x) => x.aim === '+').length;
const nw = todo.length - nr;
const m = (acc: number[], n: number) => (n ? `${(acc[0] / n).toFixed(2)} → ${(acc[1] / n).toFixed(2)} (x${(acc[1] / acc[0]).toFixed(2)})` : '-');
console.log(`mean aimed right ${m(sum.right, nr)}; aimed wrong ${m(sum.wrong, nw)}`);

// ---------------------------------------------------------------- sets, run by run

type In = { T: { on: Parameters<typeof castFor>[1]; setRuns: Map<SetId, number>; score: number }[]; poss: 0 | 1; q: number; clock: number; inTransition: boolean };
const inn = (sim: GameSim) => sim as unknown as In;
/** A copy of a game in progress that plays on by itself (the possession streams are the game's seed and counts). */
function fork(sim: GameSim): GameSim {
  const { rng, fx, opts: o, ...data } = sim as unknown as Record<string, unknown>;
  void rng;
  void fx;
  const f = Object.assign(Object.create(Object.getPrototypeOf(sim)), structuredClone(data)) as Record<string, unknown>;
  f.rng = new Rng(1);
  f.fx = new Rng(2);
  f.opts = o;
  return f as unknown as GameSim;
}
/** The team (of a few) whose starting five fits set `id` best, as the sets test picks it. */
function teamFor(id: SetId): number {
  let best = -1;
  let bestFit = -1;
  for (const tid of [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]) {
    const sim = new GameSim(side(tid), side(9), { rng: new Rng(1), type: 'regular', injuries: false });
    const fit = setFit(id, castFor(id, inn(sim).T[0].on)!.star);
    if (fit > bestFit) [best, bestFit] = [tid, fit];
  }
  return best;
}
/** Points per possession set `id` (its `prior` earlier runs read) adds over the trip the team would have run, before each quiet trip of Q1-Q3. */
function runValue(id: SetId, def: TacticsPatch, n: number, prior: number) {
  const o = teamFor(id);
  let k = 0;
  let sum = 0;
  let sum2 = 0;
  for (let g = 0; g < n; g++) {
    const sim = new GameSim(side(o), side(9, def), { rng: new Rng(500 + g), type: 'regular', injuries: false });
    while (!sim.over) {
      const s = inn(sim);
      if (!(s.poss === 0 && s.q <= 3 && s.clock > 30 && s.clock < 700)) {
        sim.step();
        continue;
      }
      const f = fork(sim);
      inn(f).T[0].setRuns = new Map(prior ? [[id, prior]] : []);
      f.callPlay(0, { kind: 'set', set: id });
      const [a, b] = [inn(f).T[0].score, s.T[0].score];
      f.step();
      sim.step();
      if (inn(sim).inTransition) continue;
      const diff = inn(f).T[0].score - a - (inn(sim).T[0].score - b);
      k++;
      sum += diff;
      sum2 += diff * diff;
    }
  }
  const mean = sum / k;
  return { mean, se: Math.sqrt((sum2 / k - mean * mean) / k) };
}
if (setsToo) {
  const n = Math.max(10, Math.round(games / 25));
  console.log(`sets, points per possession over the trip it replaces (${n} games each) at 1x and ${EDGE}x:`);
  const SET_CASES: [SetId, string, TacticsPatch][] = [
    ['floppy', 'drop', d({ pnr: 'drop' })],
    ['floppy', 'switch', d({ pnr: 'switch', switchOffBall: true })],
    ['chicago', 'drop', d({ pnr: 'drop' })],
    ['chicago', 'switch', d({ pnr: 'switch', switchOffBall: true })],
    ['spain', 'hedge', d({ pnr: 'hedge' })],
    ['elevator', 'hedge', d({ pnr: 'hedge' })],
    ['elevator', '3-2 zone', d({ scheme: 'zone32' })],
  ];
  const f = (x: { mean: number; se: number }) => `${x.mean >= 0 ? '+' : ''}${x.mean.toFixed(3)} ± ${x.se.toFixed(3)}`;
  for (const [id, vs, patch] of SET_CASES) {
    const out = [1, EDGE].map((e) => {
      K.tacticEdge = e;
      return [runValue(id, patch, n, 0), runValue(id, patch, n, 1)];
    });
    K.tacticEdge = EDGE;
    const [[a0, a1], [b0, b1]] = out;
    console.log(`  ${`${id} vs ${vs}`.padEnd(22)} first run ${f(a0)} → ${f(b0)}   read cost ${(a0.mean - a1.mean).toFixed(3)} → ${(b0.mean - b1.mean).toFixed(3)}`);
  }
}
