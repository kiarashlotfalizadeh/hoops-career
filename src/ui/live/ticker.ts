import { fmtClock } from '../stats';
import { shotText } from './shotClock';

/**
 * Clock, score and shot clock as the court animates them. A tiny store outside React state, so only
 * the scorebug re-renders, at most ~4 times a second plus each basket, instead of the whole page.
 * The shot clock is null while it is off; between possessions all three hold where the court left them,
 * and a jump (a skip, key plays, a break: `force`) leaves the shot clock off until the court plays on.
 */
export function createTicker(clock: number, score: [number, number]) {
  let state = { clock, score, shot: null as number | null };
  let last = 0;
  const subs = new Set<() => void>();
  const shotOf = (s: number | null) => (s === null ? '' : shotText(s));
  return {
    get: () => state,
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set(c: number, s: [number, number] | null, force = false, shot?: number | null) {
      const score = s ?? state.score;
      const sh = shot !== undefined ? shot : force ? null : state.shot;
      const scored = score[0] !== state.score[0] || score[1] !== state.score[1];
      const now = performance.now();
      const moved = fmtClock(c) !== fmtClock(state.clock) || shotOf(sh) !== shotOf(state.shot);
      if (!force && !scored && (now - last < 250 || !moved)) return;
      last = now;
      state = { clock: c, score, shot: sh };
      subs.forEach((f) => f());
    },
  };
}
export type Ticker = ReturnType<typeof createTicker>;

/** The frame the court has reached in the possession it's drawing (see Court's onBeat): a store like the ticker's, so only the caption re-renders. */
export function createBeat() {
  let beat = 0;
  const subs = new Set<() => void>();
  return {
    get: () => beat,
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set(i: number) {
      if (i === beat) return;
      beat = i;
      subs.forEach((f) => f());
    },
  };
}
export type Beat = ReturnType<typeof createBeat>;
