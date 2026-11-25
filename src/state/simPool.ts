// The rollout pool: a few workers that play a measurement's rollouts side by side (core/sim/rollouts.ts).
// Each is sent the batch once (the game it plays from, as plain data) and handed the next chunk of it
// whenever it finishes its last, so a measurement takes about its games over the device's cores, and a
// slow core (a phone's efficiency cores) just plays fewer chunks. The rows come back by index and are
// put together in order: a batch read here reads exactly as one played in a single thread. Where no
// worker can start (tests in Node, a browser that refuses one), or one fails, the batch is played in
// this thread instead (playHere). Each worker only takes a range of indices, so nothing is shared
// between them: no SharedArrayBuffer, no cross-origin isolation headers.

import * as Comlink from 'comlink';
import { playHere, rowGames, rowWidth, toWire, type Runner } from '../core/sim/rollouts';
import type { McWorkerApi } from '../workers/mc.worker';

interface Lane {
  w: Worker;
  api: Comlink.Remote<McWorkerApi>;
  /** Rejects when the worker dies or can't load. */
  dead: Promise<never>;
}

/** Workers at most: one less than the device's cores (the screen keeps one), and no more than this. */
export const POOL_MAX = 6;
/**
 * Games a chunk plays at most: small enough that a stop on the clock comes on time and the workers
 * finish together, big enough that the messages cost nothing (a game is a millisecond or more). A
 * small batch is cut finer still, into four chunks a worker.
 */
const CHUNK_GAMES = 8;
/** A pool idle this long is let go (its memory back to the device); the next measurement starts it again. */
const IDLE_MS = 60_000;

let lanes: Lane[] | null = null;
let unavailable = typeof Worker === 'undefined';
/** Whether a worker of the pool has ever played a chunk: one that fails before any did couldn't load. */
let answered = false;
let busy = 0;
let idle: ReturnType<typeof setTimeout> | null = null;
let ids = 0;

/** How many workers the pool runs on this device. */
export const poolSize = () => Math.max(1, Math.min(POOL_MAX, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));

function start(): Lane[] | null {
  if (unavailable) return null;
  if (idle) clearTimeout(idle);
  idle = null;
  if (lanes) return lanes;
  try {
    lanes = Array.from({ length: poolSize() }, () => {
      const w = new Worker(new URL('../workers/mc.worker.ts', import.meta.url), { type: 'module' });
      const dead = new Promise<never>((_, reject) => {
        w.addEventListener('error', (e) => reject(new Error(e.message || 'A rollout worker crashed.')));
        w.addEventListener('messageerror', () => reject(new Error('A rollout worker sent an unreadable message.')));
      });
      dead.catch(() => {});
      return { w, api: Comlink.wrap<McWorkerApi>(w), dead };
    });
    return lanes;
  } catch (e) {
    console.error('no rollout workers: measuring in this thread', e);
    unavailable = true;
    return null;
  }
}

function stop() {
  for (const l of lanes ?? []) l.w.terminate();
  lanes = null;
}

/** Let the pool go once nothing has used it for a while. */
function rest() {
  if (busy || !lanes) return;
  if (idle) clearTimeout(idle);
  idle = setTimeout(stop, IDLE_MS);
}

/** Start the pool ahead of a measurement (a live game opening), so the first one doesn't wait for the workers to load. */
export function warmPool() {
  if (start()) rest();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Play a batch's first `n` rollouts over the pool (fewer when out of time: the first ones, as many as
 * were handed out by then), or null when cancelled. Pauses between chunks aren't needed (this thread
 * only hands them out); `hold` holds back new chunks while it's true.
 */
export const playPooled: Runner = async (r, n, o) => {
  const pool = start();
  if (!pool) return playHere(r, n, o);
  busy++;
  const id = ++ids;
  const w = rowWidth(r);
  const chunk = Math.max(1, Math.min(Math.round(CHUNK_GAMES / rowGames(r)), Math.ceil(n / (4 * pool.length))));
  const rows = new Float64Array(n * w);
  const wire = toWire(r);
  const opened = new Set<Lane>();
  let next = 0;
  let played = 0;
  let gaveUp = false;
  try {
    await Promise.all(
      pool.map(async (lane) => {
        for (;;) {
          while (o.hold?.() && !o.cancelled?.()) await sleep(50);
          if (gaveUp || next >= n) return;
          if (o.cancelled?.()) {
            gaveUp = true;
            return;
          }
          // (out of time: the reading stands on the games handed out, as it does in one thread)
          if (next && next >= (o.min ?? n) && Date.now() > (o.until?.() ?? Infinity)) return;
          const from = next;
          const to = Math.min(n, from + chunk);
          next = to;
          // (the batch goes to each worker once, with its first chunk: the messages arrive in order)
          if (!opened.has(lane)) {
            opened.add(lane);
            void lane.api.open(id, wire);
          }
          const part = await Promise.race([lane.api.run(id, from, to), lane.dead]);
          answered = true;
          rows.set(part, from * w);
          played += to - from;
          o.onPlayed?.(played);
        }
      }),
    );
  } catch (e) {
    // a worker that died or couldn't load: the pool goes (the next measurement starts a fresh one, unless
    // none ever played: then they can't load here) and this batch is played in this thread
    console.error('a rollout worker failed: measuring in this thread', e);
    if (!answered) unavailable = true;
    stop();
    busy--;
    return playHere(r, n, o);
  }
  for (const lane of opened) void lane.api.close(id);
  busy--;
  rest();
  if (gaveUp) return null;
  return { rows: rows.subarray(0, next * w), n: next };
};

/** Whether measurements are played over the worker pool here (else in this thread). */
export const pooled = () => !unavailable;
