// The Office's small motion pieces, on top of ui/motion.ts: a figure that ticks when it changes, a
// value that starts from rest and travels to its place once the screen is up, a chip that leaves
// before its state does. Their classes live in styles/motion.css (`fo-m-*`).
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { reducedMotion, useChanged } from '../motion';
import { CountUp } from '../components/ui';

/**
 * False for the first frame, then true: a meter's pin or a bar's width rendered at rest first and at
 * its value after, so its own CSS transition carries it there. True at once under reduced motion.
 */
export function useArrived(): boolean {
  const [on, setOn] = useState(() => reducedMotion());
  useEffect(() => {
    if (on) return;
    // two frames: the resting style has to be painted before the value replaces it
    let b = 0;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setOn(true))));
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [on]);
  return on;
}

/**
 * A figure that ticks to its new value: up when the number rose, down when it fell. `value` is what
 * is compared (the number, or the text when there is none); the first show stands still.
 */
export function Tick({ value, children, className = '' }: { value: number | string; children: ReactNode; className?: string }) {
  const c = useChanged(value);
  return (
    <span key={c.key} className={`${c.changed ? (c.dir < 0 ? 'm-tick-down' : 'm-tick-up') : ''} ${className}`}>
      {children}
    </span>
  );
}

/**
 * A screen's lead figure: it counts up as the screen opens, and ticks (up or down) when a move
 * changes it afterwards. `value` is the number behind `text`.
 */
export function Fig({ value, text }: { value: number; text: string }) {
  const c = useChanged(value);
  if (!c.changed) return <CountUp value={text} />;
  return (
    <span key={c.key} className={c.dir < 0 ? 'm-tick-down' : 'm-tick-up'}>
      {text}
    </span>
  );
}

/** How long a chip takes to leave (styles/motion.css `.fo-m-out`). */
const OUT_MS = 130;

/**
 * A remove button's handler that lets its chip leave first: the chip (the closest `selector`)
 * shrinks away, then `fn` takes it out of the state. At once under reduced motion.
 */
export function leaving(selector: string, fn: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget.closest<HTMLElement>(selector);
    if (!el || reducedMotion()) return fn();
    if (el.classList.contains('fo-m-out')) return;
    el.classList.add('fo-m-out');
    window.setTimeout(fn, OUT_MS);
  };
}
