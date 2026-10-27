// What a choice in a live game is worth from where the game stands: the rest of tonight's game played
// many times from this exact spot, with the choice made and without it, game for game on the same
// seeds. The engine draws each possession from the game's seed and the possession counts
// (GameSim.step), so a copy of the game given a new seed is a new version of the rest of the night,
// and two copies given the same one (one with the choice made) stay paired possession by possession:
// what differs between them is the choice. The late play call in the huddle shows each option's
// reading (measureChoices); after the final, the night's moves are played back from tip-off with and
// without them (nightWorth). Pure: it reads the game and plays copies of it.
//
// Readings are by the final margin in points and by the result: the margin by shot value (what
// counterWorth goes by, with less noise) leaves out what an and-one is worth (the engine counts a
// fouled make at its fouled chance), and a change of coverage moves the and-ones: measured over 7,200
// paired games, the assistant's breaks read −0.6 a game by shot value and −0.1 ± 0.1 in points.

import { GameSim } from '../core/sim/engine';
import { Rng, mix32 } from '../core/random';
import type { CallId, LiveOp, Tactics, Team } from '../core/types';
import { cloneTactics } from '../core/sim/tactics';
import { shrinkWorth } from '../core/ai/counterWorth';

/**
 * A copy of the game as it stands, to play on without touching it: everything the engine reads and
 * writes from here on, deep-copied (the players on the floor are the same objects as in the roster and
 * the matchups, in the copy as in the game), with no play-by-play kept and none of what's been logged
 * so far (a continuation only needs the score at the end). The teams' records (Team) are shared: the
 * engine only reads them. With `seed`, the rest of the game draws from a new stream: copies with the
 * same seed play the same rest of the game.
 */
export function forkSim(sim: GameSim, seed?: number): GameSim {
  const teams: Team[] = sim.T.map((t) => t.team);
  const plain = { ...simState(sim), T: sim.T.map((t) => ({ ...t, team: null })) };
  const copy = simFromState(structuredClone(plain) as unknown as SimState);
  copy.T.forEach((t, i) => (t.team = teams[i]));
  if (seed !== undefined) copy.seed = seed >>> 0;
  return copy;
}

/** A game as plain data (see simState): what crosses to the worker. */
export type SimState = Record<string, unknown> & { readonly __sim: unique symbol };

/**
 * The game as plain data, without its logs and play-by-play: what the worker is sent to measure from
 * (the message copies it). It shares its parts with the game: copy it before changing anything.
 */
export function simState(sim: GameSim): SimState {
  return { ...(sim as unknown as Record<string, unknown>), logs: [], pbp: [], shots: [], cur: null } as unknown as SimState;
}

/** A game again from its plain data (simState, copied), unrecorded: it plays on from where it was. */
export function simFromState(state: SimState): GameSim {
  const sim = state as unknown as GameSim;
  Object.setPrototypeOf(sim, GameSim.prototype);
  for (const r of [sim.rng, sim.fx, sim.opts.rng]) Object.setPrototypeOf(r, Rng.prototype);
  sim.record = false;
  sim.opts = { ...sim.opts, record: false, keepShots: false };
  return sim;
}

/** How one continuation ended for the side it's measured for: the margin in points and the result (1 a win). */
export interface Ending {
  pts: number;
  win: number;
}

/** Play `sim` (a copy) to the final buzzer and read how it ended for `side`. */
export function playOut(sim: GameSim, side: 0 | 1): Ending {
  let guard = 0;
  while (sim.step() && guard++ < 2000);
  const pts = sim.T[side].score - sim.T[1 - side].score;
  return { pts, win: pts > 0 ? 1 : 0 };
}

/** A paired reading: the mean difference a choice made over the games, and its standard error. */
export interface Paired {
  mean: number;
  se: number;
  n: number;
}

export function paired(d: number[]): Paired {
  const n = d.length;
  if (!n) return { mean: 0, se: Infinity, n };
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { mean, se: sd / Math.sqrt(n), n };
}

/** The seed of continuation `i` from a spot: the same `base` and `i` give the same rest of the game. */
export const branchSeed = (base: number, i: number) => mix32((base ^ Math.imul(i + 1, 2654435761)) >>> 0);

/** A spot's seeds: the same spot (the game's seed, the possessions played) reads the same every time it's measured. */
export const spotSeed = (sim: GameSim) => mix32((sim.seed ^ Math.imul(sim.T[0].poss * 4096 + sim.T[1].poss + 1, 0x9e3779b1)) >>> 0);

/** A choice in a live game, as plain data (it crosses to the worker): a play called, a sub, new tactics, a timeout, or none. */
export type LiveChoice =
  | { kind: 'none' }
  /** No play called (one called already is taken back): the offense runs, or the after-timeout play. */
  | { kind: 'noPlay' }
  | { kind: 'play'; set: CallId; pid: number }
  | { kind: 'sub'; out: number; in: number }
  | { kind: 'tactics'; tactics: Tactics }
  | { kind: 'timeout' };

/** Make `c` in `sim` for `side`, as the live game would: false when it can't be made now. */
export function applyChoice(sim: GameSim, side: 0 | 1, c: LiveChoice): boolean {
  switch (c.kind) {
    case 'none':
      return true;
    case 'noPlay':
      sim.T[side].nextSet = null;
      return true;
    case 'play':
      return sim.runSet(side, c.set, c.pid);
    case 'sub':
      return sim.substitute(side, c.out, c.in);
    case 'tactics':
      sim.setTactics(side, cloneTactics(c.tactics));
      return true;
    case 'timeout':
      return sim.callTimeout(side);
  }
}

/** A choice's reading against the first one (the game as it stands): its win chance (0-1) and margin, each with its standard error. */
export interface ChoiceWorth {
  win: number;
  winSe: number;
  pts: number;
  ptsSe: number;
  n: number;
}

/** How a measurement runs: its games, a chunk of games between pauses (for the screen or a sim to get in), progress and a way to give up. */
export interface BranchOpts {
  games?: number;
  /** Continuations of each choice played between pauses. */
  chunk?: number;
  between?: () => Promise<void> | void;
  cancelled?: () => boolean;
  onProgress?: (done: number, total: number) => void;
  /** Mixed into the spot's seeds: another `salt` plays other versions of the rest of the game (a fresh batch to check a reading on). */
  salt?: number;
}

/** Continuations each late play-call option is played from the huddle: the last minutes only, so a second or two in all. */
export const CHOICE_GAMES = 400;

/**
 * What each choice is worth from where `sim` stands, against the first (usually none): the rest of the
 * game played `games` times on the same seeds (the spot's: measured again, it reads the same) with
 * each choice made on a fresh copy. Null when cancelled. A choice that can't be made now reads even.
 */
export async function measureChoices(sim: GameSim, side: 0 | 1, choices: LiveChoice[], opts: BranchOpts = {}): Promise<ChoiceWorth[] | null> {
  const games = opts.games ?? CHOICE_GAMES;
  const chunk = opts.chunk ?? 40;
  const base = opts.salt ? mix32((spotSeed(sim) ^ opts.salt) >>> 0) : spotSeed(sim);
  const d = choices.map(() => ({ pts: [] as number[], win: [] as number[] }));
  for (let i = 0; i < games; i++) {
    if (i && i % chunk === 0) {
      opts.onProgress?.(i, games);
      await opts.between?.();
      if (opts.cancelled?.()) return null;
    }
    const seed = branchSeed(base, i);
    let first: Ending | null = null;
    choices.forEach((c, k) => {
      const s = forkSim(sim, seed);
      const e = applyChoice(s, side, c) ? playOut(s, side) : first;
      first ??= e;
      d[k].pts.push((e?.pts ?? 0) - first!.pts);
      d[k].win.push((e?.win ?? 0) - first!.win);
    });
  }
  opts.onProgress?.(games, games);
  return d.map((x) => {
    const p = paired(x.pts);
    const w = paired(x.win);
    return { pts: p.mean, ptsSe: p.se, win: w.mean, winSe: w.se, n: p.n };
  });
}

/** A reading this many standard errors from even says something: inside it, "too close to say". */
export const SAY_Z = 2;

/** Whether a reading says something (past SAY_Z standard errors from even). */
export const clearOf = (mean: number, se: number) => Math.abs(mean) >= SAY_Z * se && mean !== 0;

// ------------------------------------------------------------ the staff's call, at a stop in play

// At a break (a period's end, a timeout of either side, a run of theirs) the staff measures the changes
// the game in front of it suggests (ui/live/calls.ts drafts them: the counters to what's hurting you, the
// touchline levers, your tactics B and C, a timeout, a sub) and proposes the best one only when it
// clears its noise. Two steps keep the number honest: each change is first played CALL_SCREEN times
// to find the one that looks best, and that one is then played again CALL_CONFIRM times on fresh seeds:
// the number shown, and whether it clears, is that second reading's alone (picking the best of five
// readings picks the luckiest too; the fresh ones don't know which was picked). Each continuation is
// scored by the rest of the game's margin by shot value (counterWorth's: every attempt as likely to
// fall, the fouled misses and the free throws made), which reads a change about a third tighter than
// the points; late in a close game, where a point of margin isn't the question, by the result.

/** Continuations each drafted change is played to find the best (a screen: its reading isn't shown). */
export const CALL_SCREEN = 64;
/** Continuations the best is played again on fresh seeds: the reading shown, and whether it clears. */
export const CALL_CONFIRM = 320;
/**
 * The most a stop's measurement takes on the device once the game is there, in ms (the screen gets the
 * first two fifths): on a slow phone a stop early in the game would take longer than this, and it stops
 * at the time (never below CALL_SCREEN_MIN / CALL_CONFIRM_MIN), its reading as wide as the games it
 * played. A desktop plays all of them well inside it (about 8 s at the end of the first quarter, 2.5 s
 * at the end of the third). A stop the screen sees coming is measured from before the game gets there
 * (useStaffCall's look ahead), and that time comes free: the budget only starts at the spot.
 */
export const CALL_BUDGET_MS = 12_000;
/** A stop where play waits (a break, your timeout's huddle): the coach is reading the report, so the measurement has longer. */
export const CALL_BREAK_MS = 30_000;
export const CALL_SCREEN_MIN = 16;
export const CALL_CONFIRM_MIN = 96;
/** Late, with only a few minutes left, a continuation costs little and the result is the question: more of them. */
export const CALL_CONFIRM_LATE = 480;
/**
 * In crunch time, judged by the result (a point or two of win chance: a coin's worth of noise at 480),
 * the screen and the confirmation both go wider: over 163 crunch-time stops of 18 close games (scratch
 * p1/live crunch.mts, 2026-10-27) 64 and 480 called at 9% of stops, 160 and 1,600 at 19%: about 4 s a
 * stop on a desktop. A call there clears on the margin and the result both, and says the margin: on
 * fresh seeds (282 stops of 30 games, each call re-measured on 2,000) it called at 13% of stops, shown
 * +0.37 to the margin against a true +0.36 ± 0.03; in 36 games with every call taken, +0.72 against
 * +0.78 ± 0.11 over all its calls. Its win chance isn't said: still +3.4% raw against a true +2.8.
 */
export const CALL_SCREEN_CRUNCH = 160;
export const CALL_CONFIRM_CRUNCH = 1600;
/**
 * How far the true worth of the staff's best change spreads either side of even, in points of the
 * rest of the game's margin: what a reading is shrunk toward even by (shrinkWorth's rule with the
 * live spread). Measured as the spread of the confirmed readings less their noise: 0.56 over 1,729
 * stops in 216 headless games of 27 teams (scratch round/ten/live calls.mts, 2026-10-26). Over those
 * games the staff called 1.13 changes a game, and taking every call against taking none, paired on
 * the same seeds, came out +2.2 ± 0.7 points of margin and +11 ± 3 points of win chance a game.
 */
export const CALL_SPREAD = 0.6;

const shrinkTo = (spread: number) => (raw: number, se: number) => (raw * spread ** 2) / (spread ** 2 + se ** 2);
const bandOf = (spread: number) => (se: number) => (se * spread) / Math.sqrt(spread ** 2 + se ** 2);

/** A reading shrunk toward even by the share of it that can be noise, with the live calls' spread. */
export const shrinkCall = (raw: number, se: number) => shrinkTo(CALL_SPREAD)(raw, se);
/** How uncertain a shrunk reading still is (its posterior standard deviation): narrower than the reading's own noise. */
export const shrunkSe = (se: number) => bandOf(CALL_SPREAD)(se);

/** How a continuation ended for `side`: the margin in points and by shot value, and the result. */
function endOf(sim: GameSim, side: 0 | 1): Ending & { x: number } {
  let guard = 0;
  while (sim.step() && guard++ < 2000);
  const val = (i: 0 | 1) => sim.xShots[i].pts + sim.xFouledMiss[i] + sim.T[i].tot.ftm;
  const pts = sim.T[side].score - sim.T[1 - side].score;
  return { pts, x: val(side) - val((1 - side) as 0 | 1), win: pts > 0 ? 1 : 0 };
}

/** Each choice's continuations against the first's, game for game: the margin by shot value, in points and the result. */
async function spotDiffs(
  sim: GameSim,
  side: 0 | 1,
  choices: LiveChoice[],
  games: number,
  salt: number,
  opts: BranchOpts,
  done: { n: number; total: number },
  /** A clock time (ms) past which no more continuations are started, once `min` of them are played (read as it goes: it can be set late). */
  until: number | (() => number) = Infinity,
  min = games,
) {
  const base = salt ? mix32((spotSeed(sim) ^ salt) >>> 0) : spotSeed(sim);
  const d = choices.map(() => ({ x: [] as number[], pts: [] as number[], win: [] as number[] }));
  const chunk = opts.chunk ?? 16;
  for (let i = 0; i < games; i++) {
    if (i && i % chunk === 0) {
      opts.onProgress?.(done.n, done.total);
      await opts.between?.();
      if (opts.cancelled?.()) return null;
      // (out of time on a slow device: the reading stands on the games played, its noise wider for it;
      // a stop decided by the clock, never by the readings, keeps them honest)
      if (i >= min && Date.now() > (typeof until === 'number' ? until : until())) break;
    }
    const seed = branchSeed(base, i);
    let first: (Ending & { x: number }) | null = null;
    choices.forEach((c, k) => {
      const s = forkSim(sim, seed);
      const e = applyChoice(s, side, c) ? endOf(s, side) : first;
      first ??= e;
      d[k].x.push((e?.x ?? 0) - (first?.x ?? 0));
      d[k].pts.push((e?.pts ?? 0) - (first?.pts ?? 0));
      d[k].win.push((e?.win ?? 0) - (first?.win ?? 0));
      done.n++;
    });
  }
  return d;
}

/** The confirmed reading of the staff's best change: the margin by shot value (shrunk toward even, and as measured) and the win chance, each with its standard error. */
export interface CallReading {
  /** Points of the rest of the game's margin, shrunk toward even by its noise (shrinkCall): what's shown. */
  pts: number;
  /** The reading as measured, and its standard error (whether it clears is read on these). */
  raw: number;
  se: number;
  /** The shrunk reading's own uncertainty (shrunkSe): the ± shown beside it. */
  band: number;
  /**
   * Points of win chance (0-1) as measured, and its standard error: what a crunch-time call clears on
   * besides the margin, never shown (see measureCalls).
   */
  win: number;
  winSe: number;
  /** Continuations it was read on, each way. */
  n: number;
}

/** A confirmed reading (`x` by shot value, `w` the result) as the staff says it: each shrunk toward even by its noise. */
function readingOf(x: Paired, w: Paired): CallReading {
  return {
    pts: round1(shrinkCall(x.mean, x.se)),
    raw: round2(x.mean),
    se: round2(x.se),
    band: round2(shrunkSe(x.se)),
    win: round3(w.mean),
    winSe: round3(w.se),
    n: x.n,
  };
}

/** What the staff's measurement found: the change it proposes (`pick`, an index into the changes) when one clears, and the best one's confirmed reading either way. */
export interface CallsMeasured {
  /** The change proposed: its reading cleared its noise (in its favour). Null: none did. */
  pick: number | null;
  /** The change that screened best, played again (null when none screened above even: nothing was played again). */
  best: number | null;
  reading: CallReading | null;
  /** Changes measured. */
  tried: number;
  /** What it was judged by: the margin, or (late in a close game) the result. */
  by: 'pts' | 'win';
}

/**
 * The staff's call from where `sim` stands: each of `changes` (LiveChoices, against the game as it
 * stands) played CALL_SCREEN times, the best of them CALL_CONFIRM times more on fresh seeds, and
 * proposed when that reading clears its noise (SAY_Z standard errors above even) by `by`. Null when
 * cancelled.
 */
export async function measureCalls(
  sim: GameSim,
  side: 0 | 1,
  changes: LiveChoice[],
  opts: BranchOpts & {
    by?: 'pts' | 'win';
    screen?: number;
    confirm?: number;
    budgetMs?: number;
    /** When the budget runs out (a clock time, ms), read as it goes: for a stop measured ahead, Infinity until the game gets there. Default: `budgetMs` from now. */
    due?: () => number;
  } = {},
): Promise<CallsMeasured | null> {
  const by = opts.by ?? 'pts';
  const t0 = Date.now();
  const budget = opts.budgetMs ?? CALL_BUDGET_MS;
  const due = opts.due ?? (() => t0 + budget);
  const screen = opts.screen ?? (by === 'win' ? CALL_SCREEN_CRUNCH : CALL_SCREEN);
  const confirm = opts.confirm ?? CALL_CONFIRM;
  const out: CallsMeasured = { pick: null, best: null, reading: null, tried: changes.length, by };
  if (!changes.length) return out;
  const done = { n: 0, total: screen * (changes.length + 1) + confirm * 2 };
  const first = await spotDiffs(sim, side, [{ kind: 'none' }, ...changes], screen, 0, opts, done, () => due() - 0.6 * budget, Math.min(screen, CALL_SCREEN_MIN));
  if (!first) return null;
  // the best as screened: the most margin (late, the most win chance, then margin), above even
  const score = (k: number) => {
    const x = paired(first[k + 1].x).mean;
    return by === 'win' ? paired(first[k + 1].win).mean * 100 + x / 100 : x;
  };
  const order = changes.map((_, k) => k).sort((a, b) => score(b) - score(a));
  if (score(order[0]) <= 0) {
    opts.onProgress?.(done.total, done.total);
    return out;
  }
  const best = order[0];
  const again = await spotDiffs(sim, side, [{ kind: 'none' }, changes[best]], confirm, 0x63616c6c, opts, done, due, Math.min(confirm, CALL_CONFIRM_MIN));
  if (!again) return null;
  opts.onProgress?.(done.total, done.total);
  const x = paired(again[1].x);
  const w = paired(again[1].win);
  out.best = best;
  out.reading = readingOf(x, w);
  // (in crunch time it must clear on the result and on the margin both: cleared on the win chance alone,
  // 16 calls in games where every earlier call was taken read +2.6% to win against a true +0.2 ± 0.3;
  // what's said is the margin, shrunk, which holds in games followed or not: CALL_SCREEN_CRUNCH)
  const clearX = x.mean > 0 && clearOf(x.mean, x.se);
  const clears = by === 'win' ? clearX && w.mean > 0 && clearOf(w.mean, w.se) : clearX;
  if (clears) out.pick = best;
  return out;
}

/**
 * One change measured from where `sim` stands (a touchline lever, a tactic switched): `after` against
 * `before`, CALL_CONFIRM continuations each, by the margin by shot value and the result. Null when cancelled.
 */
export async function measureChange(sim: GameSim, side: 0 | 1, before: LiveChoice, after: LiveChoice, opts: BranchOpts = {}): Promise<CallReading | null> {
  const games = opts.games ?? CALL_CONFIRM;
  const done = { n: 0, total: games * 2 };
  const d = await spotDiffs(sim, side, [before, after], games, 0x6c657672, opts, done, Date.now() + CALL_BUDGET_MS, Math.min(games, CALL_CONFIRM_MIN));
  if (!d) return null;
  opts.onProgress?.(done.total, done.total);
  return readingOf(paired(d[1].x), paired(d[1].win));
}

// ------------------------------------------------------------ the night's moves, after the final

/**
 * What the night's moves were worth (GameResult.movesWorth): the rest of the game from the first move
 * played over and over with every move made where it was (after as many possessions) and without any,
 * in points of margin (shrunk toward even by its noise, as every measured number is) and win chance;
 * and the move that mattered most when one clearly did (the night without just it, against with all).
 */
export interface NightWorth {
  pts: number;
  raw: number;
  se: number;
  win: number;
  winSe: number;
  n: number;
  moves: number;
  top?: { op: number; pts: number; se: number };
}

/** Continuations the night's moves are measured over (with them and without), and the leave-one-out readings of each move. */
export const NIGHT_GAMES = 200;
export const NIGHT_MOVE_GAMES = 100;
/** Moves measured one by one for "the one that mattered most" (the night's last ones, if it had more). */
export const NIGHT_MOVES_MAX = 8;

/**
 * The moves that count: every coaching op but switching who makes the subs (how the coach runs the
 * game, kept either way) and an edit made away from the Live screen (it became the plan: LiveGame).
 */
const counted = (o: LiveOp) => o.op !== 'manualSubs' && !(o.op === 'tactics' && o.args.plan);

/** Make journaled op `o` in `sim` for `side`, as the live game made it (LiveGame.apply). */
export function applyOp(sim: GameSim, side: 0 | 1, o: LiveOp): boolean {
  switch (o.op) {
    case 'sub':
      return sim.substitute(side, o.args.out, o.args.in);
    case 'tactics':
      sim.setTactics(side, cloneTactics(o.args.tactics));
      return true;
    case 'timeout':
      return sim.callTimeout(side, o.args.reason);
    case 'manualSubs':
      sim.T[side].manualSubs = !!o.args.on;
      return true;
    case 'play':
      return sim.runSet(side, o.args.set, o.args.pid);
  }
}

/** Play `sim` on from possession `steps` (it has played that many) to the end, making `ops` after as many possessions as each says. */
function playWith(sim: GameSim, side: 0 | 1, steps: number, ops: LiveOp[]): Ending {
  let at = steps;
  let k = 0;
  let guard = 0;
  while (!sim.over && guard++ < 2000) {
    while (k < ops.length && ops[k].at <= at) applyOp(sim, side, ops[k++]);
    sim.step();
    at++;
  }
  const pts = sim.T[side].score - sim.T[1 - side].score;
  return { pts, win: pts > 0 ? 1 : 0 };
}

/**
 * The night's moves (`ops`, the journal's), measured from the game at tip-off (`tip`, unplayed): the
 * game is played to the first move as it was (the same seed: the same possessions), and from there
 * NIGHT_GAMES versions of the rest of the night with every move and without; the moves one at a time
 * (each left out of the night, the others kept) on the first NIGHT_MOVE_GAMES of them. Null with no
 * move to measure, or when cancelled.
 */
export async function nightWorth(tip: GameSim, side: 0 | 1, ops: LiveOp[], opts: BranchOpts = {}): Promise<NightWorth | null> {
  const moves = ops.filter(counted);
  if (!moves.length) return null;
  const games = opts.games ?? NIGHT_GAMES;
  const chunk = opts.chunk ?? 20;
  // the game as it was, to the first move (switching the subs to you before it is part of how it was played)
  const first = moves[0].at;
  const s0 = forkSim(tip);
  let steps = 0;
  let k = 0;
  while (steps < first && !s0.over) {
    while (k < ops.length && ops[k].at <= steps) applyOp(s0, side, ops[k++]);
    s0.step();
    steps++;
  }
  const rest = ops.slice(k);
  // (what came before the first move, and what isn't a move, is how the game was run either way)
  const without = rest.filter((o) => !counted(o));
  const one = rest.map((o, i) => ({ o, i })).filter((x) => counted(x.o));
  const singles = one.slice(-NIGHT_MOVES_MAX);
  const base = mix32((tip.seed ^ 0x6e696768) >>> 0);
  const total = games + (one.length > 1 ? Math.min(games, NIGHT_MOVE_GAMES) : 0);
  const all: number[] = [];
  const allWin: number[] = [];
  const by: number[][] = singles.map(() => []);
  for (let i = 0; i < games; i++) {
    if (i && i % chunk === 0) {
      opts.onProgress?.(i, total);
      await opts.between?.();
      if (opts.cancelled?.()) return null;
    }
    const seed = branchSeed(base, i);
    const w = playWith(forkSim(s0, seed), side, steps, rest);
    const wo = playWith(forkSim(s0, seed), side, steps, without);
    all.push(w.pts - wo.pts);
    allWin.push(w.win - wo.win);
    if (one.length > 1 && i < NIGHT_MOVE_GAMES)
      singles.forEach((x, j) => {
        const less = playWith(
          forkSim(s0, seed),
          side,
          steps,
          rest.filter((_, m) => m !== x.i),
        );
        by[j].push(w.pts - less.pts);
      });
  }
  opts.onProgress?.(total, total);
  const r = paired(all);
  const win = paired(allWin);
  const out: NightWorth = {
    pts: round1(shrinkWorth(r.mean, r.se)),
    raw: round1(r.mean),
    se: round2(r.se),
    win: Math.round(win.mean * 1000) / 1000,
    winSe: Math.round(win.se * 1000) / 1000,
    n: r.n,
    moves: moves.length,
  };
  // (one move: the night's reading is its own)
  if (one.length > 1) {
    // the one that mattered most: the biggest reading, when it's clear of even and of the next one
    const rs = by.map((d) => paired(d));
    const order = rs.map((_, j) => j).sort((a, b) => Math.abs(rs[b].mean) - Math.abs(rs[a].mean));
    const [a, b] = order;
    const best = rs[a];
    if (clearOf(best.mean, best.se) && (b === undefined || Math.abs(best.mean) - Math.abs(rs[b].mean) >= best.se))
      out.top = { op: ops.indexOf(singles[a].o), pts: round1(shrinkWorth(best.mean, best.se)), se: round2(best.se) };
  }
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
