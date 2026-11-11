/**
 * Motion hooks for screens. The keyframes and classes they pair with live in styles/motion.css
 * (`m-rise`, `m-pop`, `m-flash`, `m-tick-up`...). Every hook stands still under reduced motion.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A key that changes each time `value` does (not on mount): put it on the element with an `m-flash`
 * or `m-tick-up` class so the animation replays for a new value and never for the first one.
 * `dir` says which way a number moved (1 up, -1 down, 0 first show or not a number).
 */
export function useChanged<T>(value: T): { key: number; dir: -1 | 0 | 1; changed: boolean } {
  const last = useRef(value);
  const n = useRef(0);
  const dir = useRef<-1 | 0 | 1>(0);
  if (last.current !== value) {
    const a = last.current as unknown;
    const b = value as unknown;
    dir.current = typeof a === 'number' && typeof b === 'number' ? (b > a ? 1 : -1) : 0;
    last.current = value;
    n.current++;
  }
  return { key: n.current, dir: dir.current, changed: n.current > 0 };
}

/**
 * A number that glides to its new value instead of jumping (a score, a meter, a total). Starts at
 * the value itself: the first show doesn't count up (use `CountUp` in ui.tsx for that).
 */
export function useTween(value: number, ms = 450): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion() || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (value - a) * (1 - (1 - t) ** 3);
      from.current = v;
      setShown(t >= 1 ? value : v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/**
 * True once the element has come into view (and stays true): start a chart's draw or a meter's fill
 * when the player scrolls to it, not while it sits below the fold. True at once where the browser
 * can't say, and under reduced motion.
 */
export function useSeen(ref: RefObject<Element | null>, margin = '0px 0px -8% 0px'): boolean {
  const [seen, setSeen] = useState(() => reducedMotion() || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

/**
 * Where a chosen child sits inside its row, for an indicator that slides to it (Segmented's thumb).
 * Measures the child's content box (`inset` true) or its whole box, again whenever the row resizes.
 */
export function useIndicator(row: RefObject<HTMLElement | null>, selector: string, dep: unknown, inset = false): { x: number; w: number; ready: boolean } | null {
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>(selector);
      if (!on || !on.offsetWidth) return setBox(null);
      const cs = inset ? getComputedStyle(on) : null;
      const pl = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
      const pr = cs ? parseFloat(cs.paddingRight) || 0 : 0;
      const next = { x: on.offsetLeft + pl, w: on.offsetWidth - pl - pr };
      setBox((b) => (b && b.x === next.x && b.w === next.w ? b : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [row, selector, dep, inset]);
  // the first place is set without a slide; later ones glide
  useEffect(() => {
    if (!box || ready) return;
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, [box, ready]);
  return box ? { ...box, ready } : null;
}
