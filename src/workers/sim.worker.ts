import * as Comlink from 'comlink';
import type { GameResult, League } from '../core/types';
import { applyGames, diffGames, gamesSig, runSim, runTask, withoutGames, type GamesDelta, type GamesSig, type SimProgress, type SimTarget, type TaskOp } from '../state/simCore';

// The season sim, off the main thread. The worker keeps its own copy of the open league's results
// between runs (they are most of a league), so each run only carries the league without them plus
// the results the other side doesn't have yet (see GamesDelta).

/** The results this worker holds, for one league. */
let cache: { id: string; games: GameResult[] } | null = null;
let stopFlag = false;

const yieldDay = () => new Promise<void>((r) => setTimeout(r, 0));

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
    let l: League;
    try {
      l = open(core, delta);
    } catch (e) {
      cache = null;
      throw e;
    }
    // what the main thread holds now: each checkpoint sends only what's new since the last one
    let sent = gamesSig(l.games);
    try {
      const r = await runSim(l, target, {
        progress: (p) => void cb.progress(p),
        shouldStop: () => stopFlag,
        checkpoint: async (x) => {
          const out = pack(x, sent);
          sent = gamesSig(x.games);
          await cb.checkpoint(out.core, out.delta);
        },
        yieldDay,
      });
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
  stop() {
    stopFlag = true;
  },
  /** Forget the cached results (the main thread lost track of them). */
  reset() {
    cache = null;
  },
};

export type SimWorkerApi = typeof api;
Comlink.expose(api);
