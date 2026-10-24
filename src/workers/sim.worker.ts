import * as Comlink from 'comlink';
import type { GameResult, League } from '../core/types';
import { counterWorth } from '../core/ai/counterWorth';
import { applyGames, diffGames, gamesSig, runSim, runTask, withoutGames, type GamesDelta, type GamesSig, type SimProgress, type SimTarget, type TaskOp } from '../state/simCore';

// The season sim, off the main thread. The worker keeps its own copy of the open league's results
// between runs (they are most of a league), so each run only carries the league without them plus
// the results the other side doesn't have yet (see GamesDelta).

/** The results this worker holds, for one league. */
let cache: { id: string; games: GameResult[] } | null = null;
let stopFlag = false;
/** The main thread asked for a checkpoint as soon as it can have one (the app is going to the background). */
let checkpointAsked = false;
/** The counter measurement running (counterWorth): a newer one stops it. */
let worthRun = 0;

/**
 * Between days the sim lets the worker's messages in (a stop). A timer would do, but nested timers
 * are held back to 4 ms each, about a second a season; a message on a channel of its own isn't.
 */
const wakeup = new MessageChannel();
let wake: (() => void) | null = null;
wakeup.port1.onmessage = () => {
  const w = wake;
  wake = null;
  w?.();
};
const yieldDay = () =>
  new Promise<void>((r) => {
    wake = r;
    wakeup.port2.postMessage(0);
  });

/**
 * A checkpoint is the league as a long sim stands, for the screens to show and the main thread to
 * save. Taking one in costs the main thread a moment (the league crosses over, the screens draw it,
 * it's written to the device), so one goes at most every few seconds and only once the last is in;
 * the sim plays on meanwhile instead of waiting for it.
 */
const CHECKPOINT_MS = 5000;

/** The league to work on: `core` with the cached results brought up to date by `delta`. */
function open(core: League, delta: GamesDelta): League {
  const base = cache?.id === core.id ? cache.games : [];
  if (base.length < delta.keep) throw new Error('The sim worker lost track of the results.');
  return { ...core, games: applyGames(base, delta) };
}

/** Send the league back: without its results, plus those the other side lacks since `sent`. */
function pack(l: League, sent: GamesSig) {
  return { core: withoutGames(l), delta: diffGames(sent, l.games) };
}

export interface SimCallbacks {
  progress: (p: SimProgress) => void;
  checkpoint: (core: League, delta: GamesDelta) => Promise<void> | void;
}

const api = {
  async sim(core: League, delta: GamesDelta, target: SimTarget, cb: SimCallbacks) {
    stopFlag = false;
    checkpointAsked = false;
    let l: League;
    try {
      l = open(core, delta);
    } catch (e) {
      cache = null;
      throw e;
    }
    // what the main thread holds now: each checkpoint sends only what's new since the last one
    let sent = gamesSig(l.games);
    let last = performance.now();
    /** The checkpoint the main thread is taking in, until it has. */
    let inFlight: Promise<void> | null = null;
    try {
      const r = await runSim(l, target, {
        progress: (p) => void cb.progress(p),
        shouldStop: () => stopFlag,
        checkpoint: (x) => {
          if (inFlight || (!checkpointAsked && performance.now() - last < CHECKPOINT_MS)) return;
          checkpointAsked = false;
          const out = pack(x, sent);
          const before = sent;
          sent = gamesSig(x.games);
          // (the message is a copy: the sim can go on changing the league at once)
          inFlight = Promise.resolve(cb.checkpoint(out.core, out.delta))
            .then(
              () => {},
              // (one that didn't get through: the next delta is made against what the other side had before it)
              () => {
                sent = before;
              },
            )
            .finally(() => {
              inFlight = null;
              last = performance.now();
            });
        },
        // (whether one is due is looked at every day)
        checkpointDays: 1,
        yieldDay,
      });
      // the end's delta is made against the last checkpoint's results: they're in on the other side
      // first (the two travel by different ports, which needn't keep their order)
      if (inFlight) await inFlight;
      cache = { id: l.id, games: l.games };
      return { ...pack(l, sent), ...r };
    } catch (e) {
      // a half-played day: nothing of it is kept, on either side
      cache = null;
      throw e;
    } finally {
      (cb as unknown as Comlink.ProxyMarked & { [Comlink.releaseProxy]?: () => void })[Comlink.releaseProxy]?.();
    }
  },
  task(core: League, delta: GamesDelta, op: TaskOp) {
    const l = open(core, delta);
    const sent = gamesSig(l.games);
    try {
      const result = runTask(l, op);
      cache = { id: l.id, games: l.games };
      return { ...pack(l, sent), result };
    } catch (e) {
      cache = null;
      throw e;
    }
  },
  /**
   * What the staff's counters against `opp` are worth (see counterWorth.ts), for the user's game
   * `gid`: a few seconds of games, a configuration at a time, with a pause between them for a sim
   * asked for meanwhile to get in (it works on a league of its own). A newer measurement, or
   * cancelWorth, stops this one.
   */
  async counterWorth(core: League, delta: GamesDelta, opp: number, gid: number | undefined, progress: (done: number, total: number) => void) {
    const run = ++worthRun;
    const l = open(core, delta);
    cache = { id: l.id, games: l.games };
    const game = gid !== undefined ? l.schedule.find((g) => g.gid === gid) : undefined;
    try {
      return await counterWorth(l, opp, game, {
        onProgress: (d, t) => void progress(d, t),
        between: () => new Promise<void>((r) => setTimeout(r, 0)),
        cancelled: () => run !== worthRun,
      });
    } finally {
      (progress as unknown as Comlink.ProxyMarked & { [Comlink.releaseProxy]?: () => void })[Comlink.releaseProxy]?.();
    }
  },
  cancelWorth() {
    worthRun++;
  },
  stop() {
    stopFlag = true;
  },
  /** Send a checkpoint after the day being played, whenever the last one went. */
  checkpointNow() {
    checkpointAsked = true;
  },
  /** Forget the cached results (the main thread lost track of them). */
  reset() {
    cache = null;
  },
};

export type SimWorkerApi = typeof api;
Comlink.expose(api);
