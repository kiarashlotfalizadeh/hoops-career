// The main thread's side of the sim worker: runs a sim or a phase change on the open league in the
// worker and hands back the league it became. The league passed in is never changed: until a run
// finishes (or sends a checkpoint) the screens keep showing it, and a run that throws leaves it as
// it was. Where no worker can start (tests in Node, a browser that refuses one), the same code runs
// on a copy of the league in this thread.
import * as Comlink from 'comlink';
import type { League, LiveOp } from '../core/types';
import { counterWorth, measureChanges as measureLocally, type CounterWorth, type LeagueChange } from '../core/ai/counterWorth';
import type { GameSim } from '../core/sim/engine';
import { forkSim, measureChoices, nightWorth, simState, type ChoiceWorth, type LiveChoice, type NightWorth } from './liveWorth';
import { measureCalls, type CallsMeasured } from './liveWorth';
import type { SimWorkerApi } from '../workers/sim.worker';
import {
  applyGames,
  applySig,
  diffGames,
  gamesSig,
  LOST_RESULTS,
  runSim,
  runTask,
  withoutGames,
  type GamesDelta,
  type GamesSig,
  type SimProgress,
  type SimStop,
  type SimTarget,
  type TaskOp,
  type TaskResult,
} from './simCore';

type Remote = Comlink.Remote<SimWorkerApi>;

let worker: Worker | null = null;
let remote: Remote | null = null;
/** The results the worker holds (for one league), as a signature: what each run's delta is made against. */
let held: { id: string; sig: GamesSig } | null = null;
/** Tests (and a browser that can't start a worker) run the sim here instead. */
let local = typeof Worker === 'undefined';
let localStop = false;
/** The counter measurement running in this thread (no worker): a newer one stops it. */
let localWorth = 0;

/** Fail calls in flight when the worker dies. */
const failing = new Set<(e: Error) => void>();
/** Whether the worker has answered since it started: one that dies before it ever does couldn't load. */
let answered = false;

/**
 * The worker died before it ever answered: its code couldn't load (an update replaced it on the
 * server, or the browser refuses it). The run goes again in this thread, as do later ones.
 */
class WorkerUnavailable extends Error {}

function ensure(): Remote | null {
  if (local) return null;
  if (remote) return remote;
  try {
    const w = new Worker(new URL('../workers/sim.worker.ts', import.meta.url), { type: 'module' });
    const die = (e: Error) => {
      if (worker !== w) return;
      w.terminate();
      worker = null;
      remote = null;
      held = null;
      if (!answered) {
        console.error('the sim worker did not start, simming on the main thread', e);
        local = true;
        e = new WorkerUnavailable(e.message);
      }
      for (const fail of [...failing]) fail(e);
    };
    w.addEventListener('error', (e) => die(new Error(e.message || 'The sim worker crashed.')));
    w.addEventListener('messageerror', () => die(new Error('The sim worker sent an unreadable message.')));
    worker = w;
    remote = Comlink.wrap<SimWorkerApi>(w);
    held = null;
    answered = false;
    return remote;
  } catch (e) {
    console.error('no sim worker, simming on the main thread', e);
    local = true;
    return null;
  }
}

/** Run `call`, failing it if the worker dies meanwhile. */
function guarded<T>(call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = (e: Error) => {
      failing.delete(fail);
      reject(e);
    };
    failing.add(fail);
    call().then(
      (v) => {
        failing.delete(fail);
        answered = true;
        resolve(v);
      },
      (e: unknown) => {
        // (an error the worker sends back: it's running)
        answered = true;
        fail(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Run a worker call on `l`, sent without its results but with a delta against what the worker holds
 * (`held`), and the signature of the list the worker opens: taken as it's sent, as `l`'s results can
 * change while the worker works on them (a live game recorded meanwhile adds to the same list). If
 * the worker has lost track of what it holds (a reply came back after a later call's), it says so
 * before it does anything, and the call goes again with the results whole.
 */
async function withGames<T>(l: League, call: (core: League, delta: GamesDelta, sent: GamesSig) => Promise<T>): Promise<{ out: T; sent: GamesSig }> {
  for (let whole = false; ; whole = true) {
    const sent = gamesSig(l.games);
    const delta = diffGames(!whole && held?.id === l.id ? held.sig : null, l.games);
    try {
      return { out: await guarded(() => call(withoutGames(l), delta, sent)), sent };
    } catch (e) {
      held = null;
      if (whole || !(e instanceof Error) || e.message !== LOST_RESULTS) throw e;
      console.warn('The sim worker lost track of the results: sending them whole.');
    }
  }
}

export interface SimRunHooks {
  progress: (p: SimProgress) => void;
  /**
   * The league as a long sim stands, to show and save: from the worker every few seconds, once the
   * last one is in (the run carries on meanwhile); in this thread every 20 days.
   */
  checkpoint: (l: League) => void | Promise<void>;
}

export interface SimOutcome {
  league: League;
  days: number;
  stop: SimStop;
}

export async function simLeague(l: League, target: SimTarget, hooks: SimRunHooks): Promise<SimOutcome> {
  const r = ensure();
  if (!r) {
    localStop = false;
    const copy = structuredClone(l);
    const out = await runSim(copy, target, {
      progress: hooks.progress,
      shouldStop: () => localStop,
      checkpoint: (x) => hooks.checkpoint(structuredClone(x)),
      yieldDay: () => new Promise((res) => setTimeout(res, 0)),
    });
    return { league: copy, ...out };
  }
  // main's results as the worker last saw them (and their signature): each checkpoint adds to them.
  // What the worker holds between runs (`held`) only changes when the run ends
  let games = l.games;
  let sig: GamesSig = [];
  const cb = Comlink.proxy({
    progress: (p: SimProgress) => {
      answered = true;
      hooks.progress(p);
    },
    checkpoint: async (core: League, d: GamesDelta) => {
      const before = [games, sig] as const;
      games = applyGames(games, d);
      sig = applySig(sig, d);
      try {
        await hooks.checkpoint({ ...core, games });
      } catch (e) {
        // (one that didn't get through: the worker makes the next against what this side had before it)
        [games, sig] = before;
        throw e;
      }
    },
  });
  try {
    const { out } = await withGames(l, (core, delta, sent) => {
      games = l.games;
      sig = sent;
      return r.sim(core, delta, target, cb);
    });
    games = applyGames(games, out.delta);
    held = { id: l.id, sig: applySig(sig, out.delta) };
    return { league: { ...out.core, games }, days: out.days, stop: out.stop };
  } catch (e) {
    held = null;
    if (e instanceof WorkerUnavailable) return simLeague(l, target, hooks);
    throw e;
  }
}

export async function taskLeague(l: League, op: TaskOp): Promise<{ league: League; result: TaskResult }> {
  const r = ensure();
  if (!r) {
    const copy = structuredClone(l);
    const result = runTask(copy, op);
    return { league: copy, result };
  }
  try {
    const { out, sent } = await withGames(l, (core, delta) => r.task(core, delta, op));
    const games = applyGames(l.games, out.delta);
    held = { id: l.id, sig: applySig(sent, out.delta) };
    return { league: { ...out.core, games }, result: out.result };
  } catch (e) {
    held = null;
    if (e instanceof WorkerUnavailable) return taskLeague(l, op);
    throw e;
  }
}

/**
 * Ask a running sim for a checkpoint after the day it's on, to show and save (the app is going to the
 * background, where the system may end it). In this thread the league on screen is already where
 * the sim is, as of its last checkpoint, so there's nothing to ask for.
 */
export function checkpointSimRun() {
  void remote?.checkpointNow();
}

/** Ask a running sim to stop after the day it's on. */
export function stopSimRun() {
  localStop = true;
  void remote?.stop();
}

/** Tests: run the sim in this thread whatever the environment. */
export function simLocally(on = true) {
  local = on;
}

/**
 * What the staff's counters against `opp` are worth for the user's game `gid` (see counterWorth.ts),
 * measured in the worker (here, without one), `progress` told after each configuration. A newer call
 * stops this one, which then comes back null, as it does after cancelWorth.
 */
export async function measureCounters(l: League, opp: number, gid: number | undefined, progress: (done: number, total: number) => void): Promise<CounterWorth[] | null> {
  const r = ensure();
  if (!r) {
    const run = ++localWorth;
    const game = gid !== undefined ? l.schedule.find((g) => g.gid === gid) : undefined;
    return counterWorth(l, opp, game, { onProgress: progress, between: () => new Promise<void>((res) => setTimeout(res, 0)), cancelled: () => run !== localWorth });
  }
  try {
    const { out, sent } = await withGames(l, (core, delta) => r.counterWorth(core, delta, opp, gid, Comlink.proxy(progress)));
    // (the list as it was sent: a game recorded meanwhile isn't in the worker's copy)
    held = { id: l.id, sig: sent };
    return out;
  } catch (e) {
    held = null;
    if (e instanceof WorkerUnavailable) return measureCounters(l, opp, gid, progress);
    throw e;
  }
}

/**
 * What each change is worth to the user's game `gid` against `opp` (see measureChanges in
 * counterWorth.ts), measured in the worker (here, without one), as measureCounters is: a newer
 * measurement of either kind stops this one, which then comes back null.
 */
export async function measureChanges(
  l: League,
  opp: number,
  gid: number | undefined,
  changes: LeagueChange[],
  progress: (done: number, total: number) => void,
  /** Games each configuration is played (WORTH_GAMES by default): fewer for one of several games pooled. */
  games?: number,
): Promise<CounterWorth[] | null> {
  const r = ensure();
  if (!r) {
    const run = ++localWorth;
    const game = gid !== undefined ? l.schedule.find((g) => g.gid === gid) : undefined;
    return measureLocally(l, opp, changes, game, {
      games,
      onProgress: progress,
      between: () => new Promise<void>((res) => setTimeout(res, 0)),
      cancelled: () => run !== localWorth,
    });
  }
  try {
    const { out, sent } = await withGames(l, (core, delta) => r.measureChanges(core, delta, opp, gid, changes, Comlink.proxy(progress), games));
    held = { id: l.id, sig: sent };
    return out;
  } catch (e) {
    held = null;
    if (e instanceof WorkerUnavailable) return measureChanges(l, opp, gid, changes, progress, games);
    throw e;
  }
}

/** Stop a counter measurement in flight (its screen closed). */
export function cancelWorth() {
  localWorth++;
  void remote?.cancelWorth();
}

/** Live measurements: the next one's id, those given up in this thread (no worker), and when those measured ahead are due. */
let liveIds = 0;
const localGone = new Set<number>();
const localDue = new Map<number, number>();

/**
 * What each choice is worth from where the live game `sim` stands, against the first (see
 * measureChoices in liveWorth.ts): in the worker, sent the game as plain data; here, without one, on
 * a copy, a chunk at a time. `id` (nextLiveId) is what cancelLive stops it by: it then comes back null.
 */
export async function measureLive(
  sim: GameSim,
  side: 0 | 1,
  choices: LiveChoice[],
  id: number,
  progress: (done: number, total: number) => void = () => {},
  games?: number,
): Promise<ChoiceWorth[] | null> {
  const r = ensure();
  if (!r) {
    const out = await measureChoices(forkSim(sim), side, choices, {
      games,
      onProgress: progress,
      between: () => new Promise<void>((res) => setTimeout(res, 0)),
      cancelled: () => localGone.has(id),
    });
    localGone.delete(id);
    return out;
  }
  try {
    return await guarded(() => r.liveChoices(simState(sim), side, choices, games, id, Comlink.proxy(progress)));
  } catch (e) {
    if (e instanceof WorkerUnavailable) return measureLive(sim, side, choices, id, progress, games);
    throw e;
  }
}

/**
 * The staff's call from where the live game `sim` stands (see measureCalls in liveWorth.ts): in the
 * worker, sent the game as plain data (a copy taken now: the game plays on meanwhile); here, without
 * one, on a copy a chunk at a time. cancelLive(id) stops it: it then comes back null.
 */
export async function measureCallsLive(
  sim: GameSim,
  side: 0 | 1,
  changes: LiveChoice[],
  by: 'pts' | 'win',
  confirm: number,
  id: number,
  progress: (done: number, total: number) => void = () => {},
  /** Its budget once the game is at its spot, and whether it's measured ahead of it (no limit until reachLive). */
  budgetMs?: number,
  ahead = false,
): Promise<CallsMeasured | null> {
  const r = ensure();
  const local = (s: GameSim) => {
    if (ahead) localDue.set(id, Infinity);
    return measureCalls(s, side, changes, {
      by,
      confirm,
      budgetMs,
      due: ahead ? () => localDue.get(id) ?? Infinity : undefined,
      onProgress: progress,
      between: () => new Promise<void>((res) => setTimeout(res, 0)),
      cancelled: () => localGone.has(id),
    }).finally(() => {
      localGone.delete(id);
      localDue.delete(id);
    });
  };
  if (!r) return local(forkSim(sim));
  const copy = forkSim(sim);
  try {
    return await guarded(() => r.liveCalls(simState(copy), side, changes, by, confirm, id, Comlink.proxy(progress), budgetMs, ahead));
  } catch (e) {
    if (e instanceof WorkerUnavailable) return local(copy);
    throw e;
  }
}

/** An id for a live measurement, to stop it by. */
export const nextLiveId = () => ++liveIds;

/** Stop a live measurement in flight (its huddle or sheet closed). */
export function cancelLive(id: number) {
  localGone.add(id);
  void remote?.cancelLive(id);
}

/** The game got to the spot the staff's measurement `id` was started ahead for (measureCallsLive's `ahead`): it has `budgetMs` from now. */
export function reachLive(id: number, budgetMs: number) {
  if (localDue.has(id)) localDue.set(id, Date.now() + budgetMs);
  void remote?.liveReach(id, budgetMs);
}

/**
 * What a live game's moves were worth (see nightWorth in liveWorth.ts), from the game at tip-off: in
 * the worker after the final, behind any sim (here, without one, a chunk at a time).
 */
export async function measureNight(tip: GameSim, side: 0 | 1, ops: LiveOp[]): Promise<NightWorth | null> {
  const r = ensure();
  if (!r) return nightWorth(forkSim(tip), side, ops, { between: () => new Promise<void>((res) => setTimeout(res, 0)) });
  try {
    return await guarded(() => r.nightWorth(simState(tip), side, ops));
  } catch (e) {
    if (e instanceof WorkerUnavailable) return measureNight(tip, side, ops);
    throw e;
  }
}
