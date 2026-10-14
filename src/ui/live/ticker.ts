import { fmtClock } from '../stats';

/**
 * Clock and score as the court animates them. A tiny store outside React state, so only the
 * scorebug re-renders, at most ~4 times a second plus each basket, instead of the whole page.
 */
export function createTicker(clock: number, score: [number, number]) {
  let state = { clock, score };
  let last = 0;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set(c: number, s: [number, number] | null, force = false) {
      const score = s ?? state.score;
      const scored = score[0] !== state.score[0] || score[1] !== state.score[1];
      const now = performance.now();
      if (!force && !scored && (now - last < 250 || fmtClock(c) === fmtClock(state.clock))) return;
      last = now;
      state = { clock: c, score };
      subs.forEach((f) => f());
    },
  };
}
export type Ticker = ReturnType<typeof createTicker>;
