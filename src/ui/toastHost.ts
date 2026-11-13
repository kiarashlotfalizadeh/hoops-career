// Where the toasts go. Anywhere else they rise over the foot of the screen; on the live page that is
// the floor the players are on, or the console, so the page puts a place for them at the court's top
// edge, over the far stands (setToastHost), and the toasts go there instead, smaller, the newest only.
// Not while a sheet is open over the court: then they sit over the sheet, as anywhere else.
import { useSyncExternalStore } from 'react';

let host: HTMLElement | null = null;
const subs = new Set<() => void>();

/** The live page's place for the toasts (a ref callback: null when it goes). */
export function setToastHost(el: HTMLElement | null) {
  if (host === el) return;
  host = el;
  for (const f of subs) f();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  // (a sheet opening or closing is a class on the body)
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(fn) : null;
  mo?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => {
    subs.delete(fn);
    mo?.disconnect();
  };
}

const current = () => (host && !document.body.classList.contains('sheet-open') ? host : null);

/** The place the toasts go now, or null for their own place at the screen's foot. */
export function useToastHost(): HTMLElement | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
