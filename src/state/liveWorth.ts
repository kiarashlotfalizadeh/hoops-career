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
  const base = spotSeed(sim);
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
