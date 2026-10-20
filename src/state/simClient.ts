// The main thread's side of the sim worker: runs a sim or a phase change on the open league in the
// worker and hands back the league it became. The league passed in is never changed: until a run
// finishes (or sends a checkpoint) the screens keep showing it, and a run that throws leaves it as
// it was. Where no worker can start (tests in Node, a browser that refuses one), the same code runs
// on a copy of the league in this thread.
import * as Comlink from 'comlink';
import type { League } from '../core/types';
import type { SimWorkerApi } from '../workers/sim.worker';
import {
  applyGames,
  diffGames,
  gamesSig,
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

/** What to send the worker for `l`: its results relative to what the worker holds. */
const deltaFor = (l: League): GamesDelta => diffGames(held?.id === l.id ? held.sig : null, l.games);

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
  // main's results as the worker last saw them: each checkpoint adds to them
  let games = l.games;
  const cb = Comlink.proxy({
    progress: (p: SimProgress) => {
      answered = true;
      hooks.progress(p);
    },
    checkpoint: async (core: League, d: GamesDelta) => {
      games = applyGames(games, d);
      held = { id: l.id, sig: gamesSig(games) };
      await hooks.checkpoint({ ...core, games });
    },
  });
  try {
    const out = await guarded(() => r.sim(withoutGames(l), deltaFor(l), target, cb));
    games = applyGames(games, out.delta);
    held = { id: l.id, sig: gamesSig(games) };
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
    const out = await guarded(() => r.task(withoutGames(l), deltaFor(l), op));
    const games = applyGames(l.games, out.delta);
    held = { id: l.id, sig: gamesSig(games) };
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
