// Rollouts: a measurement's games, played over and over, each by its index (its seed), so any share of
// them can be played anywhere and the readings, put back together in index order, come out the same:
// in this thread a chunk at a time (playHere), or spread over a pool of workers (state/simPool.ts). Three
// kinds: the rest of a live game from where it stands, once for each choice (state/liveWorth.ts
// measureChoices, measureCalls); the rest of a night from its first move, once with each set of the
// night's moves (nightWorth); and a whole game between two sides as they're set up (core/ai/counterWorth.ts).
//
// Also here: the copy of a game a continuation is played on (forkSim), the game as plain data for a
// worker (simState, simFromState), and the live choices and journaled moves a continuation makes.

import { GameSim, type SP, type ST, type SimTeamInput } from './engine';
import { Rng, mix32 } from '../random';
import type { CallId, GameType, LineupStat, LiveOp, SetStat, Tactics, TacticImpact } from '../types';
import { cloneTactics } from './tactics';

// ------------------------------------------------------------ copies of a game

/**
 * A copy of the game as it stands, to play on without touching it: everything the engine writes from
 * here on is copied (the players on the floor are the same objects as in the roster and the matchups,
 * in the copy as in the game; a lineup's, an impact's and a set's tally are the same objects as their
 * team and their slots point to), with no play-by-play kept and none of what's been logged so far (a
 * continuation only needs the score at the end). What the engine only reads is shared: the teams'
 * records (Team), the players' ratings and composites, the stint plans, the game's conditions and the
 * zone tables (replaced whole, never written). With `seed`, the rest of the game draws from a new
 * stream: copies with the same seed play the same rest of the game. Played on, a copy plays exactly as
 * a deep copy of the game would (live.test.ts holds it to that).
 */
export function forkSim(sim: GameSim, seed?: number): GameSim {
  const copy = cloneSim(sim);
  if (seed !== undefined) copy.seed = seed >>> 0;
  return copy;
}

const rngOf = (r: Rng): Rng => {
  const x = Object.create(Rng.prototype) as Rng;
  x.state = r.state;
  return x;
};

function cloneSim(sim: GameSim): GameSim {
  // every field as it is (numbers, flags, the shared parts), then each one the engine writes copied over it
  const out = Object.assign(Object.create(GameSim.prototype) as GameSim, sim);
  const sp = new Map<SP, SP>();
  for (const t of sim.T) for (const p of t.players) sp.set(p, { ...p, b: { ...p.b } });
  const P = (p: SP | null) => (p ? sp.get(p)! : null);
  const lines = new Map<LineupStat, LineupStat>();
  out.lineups = new Map();
  for (const [k, v] of sim.lineups) {
    const c = { ...v };
    lines.set(v, c);
    out.lineups.set(k, c);
  }
  const tags = new Map<TacticImpact, TacticImpact>();
  out.impacts = new Map();
  for (const [k, v] of sim.impacts) {
    const c = { ...v, players: { ...v.players } };
    tags.set(v, c);
    out.impacts.set(k, c);
  }
  out.impactSlots = new Map();
  for (const [k, slots] of sim.impactSlots)
    out.impactSlots.set(
      k,
      slots.map((x) => x && tags.get(x)!),
    );
  const sets = new Map<SetStat, SetStat>();
  out.setStats = new Map();
  for (const [k, v] of sim.setStats) {
    const c = { ...v };
    sets.set(v, c);
    out.setStats.set(k, c);
  }
  out.possSet = sim.possSet && sets.get(sim.possSet)!;
  out.T = sim.T.map((t): ST => {
    const pt: ST['pt'] = {};
    for (const k in t.pt) pt[k] = { ...t.pt[k] };
    const guardOf = new Map<number, SP>();
    for (const [k, v] of t.guardOf) guardOf.set(k, sp.get(v)!);
    const byId = new Map<number, SP>();
    for (const [k, v] of t.byId) byId.set(k, sp.get(v)!);
    return {
      ...t,
      players: t.players.map((p) => sp.get(p)!),
      byId,
      on: t.on.map((p) => sp.get(p)!),
      guardOf,
      t: cloneTactics(t.t),
      base: cloneTactics(t.base),
      qs: t.qs.slice(),
      tot: { ...t.tot },
      pt,
      ex: { ...t.ex },
      restedLate: new Set(t.restedLate),
      subSig: t.subSig.slice(),
      subLock: new Map(t.subLock),
      hacked: new Map(t.hacked),
      setRuns: new Map(t.setRuns),
      acts: { ...t.acts },
      cap: { ...t.cap },
      habit: { ...t.habit },
      nextSet: t.nextSet && { ...t.nextSet },
      ls: t.ls && lines.get(t.ls)!,
    };
  }) as [ST, ST];
  out.lastShooter = P(sim.lastShooter);
  out.calledActor = P(sim.calledActor);
  out.owed = P(sim.owed);
  if (sim.play) {
    // (a set handed to an action is taken within the possession: a copy made between possessions has none)
    const cast = { ...sim.play.cast } as Record<string, unknown>;
    for (const k in cast) if (sp.has(cast[k] as SP)) cast[k] = sp.get(cast[k] as SP);
    out.play = { ...sim.play, cast: cast as unknown as typeof sim.play.cast };
  }
  out.rng = rngOf(sim.rng);
  out.fx = rngOf(sim.fx);
  out.opts = { ...sim.opts, rng: rngOf(sim.opts.rng), record: false, keepShots: false };
  out.record = false;
  out.logs = [];
  out.pbp = [];
  out.shots = [];
  out.cur = null;
  out.possSec = [sim.possSec[0], sim.possSec[1]];
  out.xShots = [{ ...sim.xShots[0] }, { ...sim.xShots[1] }];
  out.xFouledMiss = [sim.xFouledMiss[0], sim.xFouledMiss[1]];
  out.xVar = [sim.xVar[0], sim.xVar[1]];
  out.flow = sim.flow.slice();
  out.flowPeriods = sim.flowPeriods.slice();
  out.flowT = sim.flowT.slice();
  out.flowPoss = sim.flowPoss.slice();
  out.stints = sim.stints && new Map([...sim.stints].map(([k, v]) => [k, { ...v }]));
  out.injuries = sim.injuries.map((x) => ({ ...x }));
  out.adjustments = sim.adjustments.map((x) => ({ ...x }));
  out.mandatory = { ...sim.mandatory };
  return out;
}

/** A game as plain data (see simState): what crosses to a worker. */
export type SimState = Record<string, unknown> & { readonly __sim: unique symbol };

/**
 * The game as plain data, without its logs and play-by-play: what a worker is sent to measure from
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

// ------------------------------------------------------------ what a continuation does

/** A choice in a live game, as plain data (it crosses to a worker): a play called, a sub, new tactics, a timeout, or none. */
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

/** The seed of continuation `i` from a spot: the same `base` and `i` give the same rest of the game. */
export const branchSeed = (base: number, i: number) => mix32((base ^ Math.imul(i + 1, 2654435761)) >>> 0);

/** How a continuation ended for `side`: the margin in points, by shot value, and the result (1 a win). */
export interface Ending {
  pts: number;
  win: number;
}

/** A game's margin for `side` by shot value: every attempt as likely to fall (fouled misses included) plus the free throws made. */
export function xMargin(sim: GameSim, side: 0 | 1): number {
  // (as the result rounds the shot values: what counterWorth went by when it read the result)
  const val = (i: 0 | 1) => Math.round(sim.xShots[i].pts * 10) / 10 + sim.xFouledMiss[i] + sim.T[i].tot.ftm;
  return side === 0 ? val(0) - val(1) : val(1) - val(0);
}

/** Play `sim` on from possession `steps` (it has played that many) to the end, making `ops` after as many possessions as each says. */
export function playWith(sim: GameSim, side: 0 | 1, steps: number, ops: LiveOp[]): Ending & { x: number } {
  let at = steps;
  let k = 0;
  let guard = 0;
  while (!sim.over && guard++ < 2000) {
    while (k < ops.length && ops[k].at <= at) applyOp(sim, side, ops[k++]);
    sim.step();
    at++;
  }
  return endingOf(sim, side);
}

/** Play `sim` to the final buzzer and read how it ended for `side`, by shot value too. */
export function endOf(sim: GameSim, side: 0 | 1): Ending & { x: number } {
  let guard = 0;
  while (sim.step() && guard++ < 2000);
  return endingOf(sim, side);
}

function endingOf(sim: GameSim, side: 0 | 1): Ending & { x: number } {
  const val = (i: 0 | 1) => sim.xShots[i].pts + sim.xFouledMiss[i] + sim.T[i].tot.ftm;
  const pts = sim.T[side].score - sim.T[1 - side].score;
  return { pts, x: val(side) - val((1 - side) as 0 | 1), win: pts > 0 ? 1 : 0 };
}

// ------------------------------------------------------------ rollouts

/** A batch of rollouts: what each one plays, from what. Rollout `i` always plays the same game. */
export type Rollouts =
  /**
   * The rest of the game from `sim` (as it stands), once for each choice, on continuation i's seed: each
   * choice's margin by shot value, in points and the result, against the first's.
   */
  | { kind: 'spot'; sim: GameSim; side: 0 | 1; choices: LiveChoice[]; base: number }
  /**
   * The rest of the night from `sim` (`steps` possessions played), once with each of `variants` (the
   * moves made, as the journal has them) where `i` is under its `upTo`: the margin by shot value and the
   * result (NaN for one not played).
   */
  | { kind: 'night'; sim: GameSim; side: 0 | 1; steps: number; variants: LiveOp[][]; upTo: number[]; base: number }
  /**
   * A whole game between `sides` (home first) on game i of batch `batch` of `games` from `seed`: the
   * margin by shot value for `side`.
   */
  | { kind: 'games'; sides: [SimTeamInput, SimTeamInput]; type: GameType; neutral: boolean; side: 0 | 1; seed: number; batch: number; games: number };

/** The numbers each rollout yields (its row). */
export const rowWidth = (r: Rollouts) => (r.kind === 'spot' ? 3 * r.choices.length : r.kind === 'night' ? 2 * r.variants.length : 1);

/** The games each rollout plays. */
export const rowGames = (r: Rollouts) => (r.kind === 'spot' ? r.choices.length : r.kind === 'night' ? r.variants.length : 1);

/** Play rollouts `from` to `to` of `r`: their rows, one after another. */
export function playRollouts(r: Rollouts, from: number, to: number): Float64Array {
  const w = rowWidth(r);
  const out = new Float64Array((to - from) * w);
  for (let i = from; i < to; i++) {
    const o = (i - from) * w;
    if (r.kind === 'spot') {
      const seed = branchSeed(r.base, i);
      let first: (Ending & { x: number }) | null = null;
      r.choices.forEach((c, k) => {
        const s = forkSim(r.sim, seed);
        const e = applyChoice(s, r.side, c) ? endOf(s, r.side) : first;
        first ??= e;
        out[o + 3 * k] = (e?.x ?? 0) - (first?.x ?? 0);
        out[o + 3 * k + 1] = (e?.pts ?? 0) - (first?.pts ?? 0);
        out[o + 3 * k + 2] = (e?.win ?? 0) - (first?.win ?? 0);
      });
    } else if (r.kind === 'night') {
      const seed = branchSeed(r.base, i);
      r.variants.forEach((ops, v) => {
        const e = i < r.upTo[v] ? playWith(forkSim(r.sim, seed), r.side, r.steps, ops) : null;
        out[o + 2 * v] = e ? e.x : NaN;
        out[o + 2 * v + 1] = e ? e.win : NaN;
      });
    } else {
      const rng = new Rng((r.seed + Math.imul(r.batch * r.games + i + 1, 2654435761)) >>> 0);
      const sim = new GameSim(r.sides[0], r.sides[1], { rng, type: r.type, injuries: false, neutral: r.neutral });
      let guard = 0;
      while (sim.step() && guard++ < 2000);
      out[o] = xMargin(sim, r.side);
    }
  }
  return out;
}

/** A batch's games as plain data, for a worker (the message copies it): the game it plays from as simState. */
export type WireRollouts = Exclude<Rollouts, { sim: GameSim }> | (Omit<Extract<Rollouts, { sim: GameSim }>, 'sim'> & { sim: SimState });

export const toWire = (r: Rollouts): WireRollouts => ('sim' in r ? { ...r, sim: simState(r.sim) } : r);
export const fromWire = (r: WireRollouts): Rollouts => ('sim' in r ? ({ ...r, sim: simFromState(r.sim) } as Rollouts) : r);

/** How a batch is played: in chunks, with pauses, progress and ways to stop early. */
export interface RolloutOpts {
  /** Rollouts played between pauses (in this thread). */
  chunk: number;
  /** A pause between chunks in this thread, for the screen or a sim to get in. */
  between?: () => Promise<void> | void;
  /** Checked between chunks: true gives up (and the batch comes back null). */
  cancelled?: () => boolean;
  /** A clock time (ms) past which no more are started, once `min` are played (read as it goes: it can be set late). */
  until?: () => number;
  min?: number;
  /** Rollouts played so far, after each chunk. */
  onPlayed?: (n: number) => void;
  /** True while a sim runs that the batch waits for (a worker pool starts no more until it's done). */
  hold?: () => boolean;
}

/** Rollouts played: the first `n` of a batch, their rows one after another. */
export interface Played {
  rows: Float64Array;
  n: number;
}

/** Plays a batch's first `n` rollouts (fewer when out of time), or null when cancelled. */
export type Runner = (r: Rollouts, n: number, opts: RolloutOpts) => Promise<Played | null>;

/** In this thread, a chunk at a time, with the pause between chunks. */
export const playHere: Runner = async (r, n, o) => {
  const w = rowWidth(r);
  const rows = new Float64Array(n * w);
  let i = 0;
  for (; i < n; i += o.chunk) {
    if (i) {
      o.onPlayed?.(i);
      await o.between?.();
      if (o.cancelled?.()) return null;
      // (out of time on a slow device: the reading stands on the games played, its noise wider for it;
      // a stop decided by the clock, never by the readings, keeps them honest)
      if (i >= (o.min ?? n) && Date.now() > (o.until?.() ?? Infinity)) break;
    }
    rows.set(playRollouts(r, i, Math.min(n, i + o.chunk)), i * w);
  }
  const played = Math.min(i, n);
  return { rows: rows.subarray(0, played * w), n: played };
};

/** Column `c` of the first `n` rows of width `w`: one number of each rollout, in order. */
export function column(p: Played, w: number, c: number, n = p.n): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(p.rows[i * w + c]);
  return out;
}
