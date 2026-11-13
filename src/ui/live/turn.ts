// The live game on a phone is a broadcast, and a broadcast is wide. A phone held sideways gets the
// sideways layout ('side': the court fills the screen, a slim scorebug over it, the bench as a rail
// and the console a drawer). Held upright, the same layout is turned a quarter round ('turned') so the
// user turns the phone: iOS can't lock the orientation from a web page, so the page turns instead
// (live/styles/side.css rotates the body, so sheets and toasts turn with it). Settings can keep the
// upright layout instead (`settings.liveTurn`). Tablets and desktops keep their own layouts (null).
// Under the turn the page's coordinates are the turned screen's, but a touch's are the glass's:
// `localPoint` and `localDelta` map one to the other for code that measures a touch itself.
import { useEffect, useSyncExternalStore } from 'react';

/** A phone: a coarse pointer and a screen whose short side is at most this many px. */
const PHONE_SIDE = 500;

export type LiveShape = 'side' | 'turned' | 'upright' | null;

function media(q: string) {
  return (fn: () => void) => {
    const m = typeof matchMedia === 'function' ? matchMedia(q) : null;
    m?.addEventListener('change', fn);
    return () => m?.removeEventListener('change', fn);
  };
}
const ask = (q: string) => () => typeof matchMedia === 'function' && matchMedia(q).matches;
const onLand = media('(orientation: landscape)');
const isLand = ask('(orientation: landscape)');
const onCoarse = media('(pointer: coarse)');
const isCoarse = ask('(pointer: coarse)');
const never = () => false;

/** This device is a phone (asked of the screen, not the window: an iPad's narrow split view is not one). */
function isPhone(): boolean {
  if (!isCoarse() || typeof screen === 'undefined') return false;
  return Math.min(screen.width, screen.height) <= PHONE_SIDE;
}

/**
 * The live game's shape on this device, and the page turned while it is 'turned' (`data-turned` on the
 * root). `pref` is the setting (sideways unless 'upright'); `onAir`: a game is on (the final card and the
 * report are upright screens).
 */
export function useLiveShape(pref: 'side' | 'upright' | undefined, onAir: boolean): LiveShape {
  const coarse = useSyncExternalStore(onCoarse, isCoarse, never);
  const land = useSyncExternalStore(onLand, isLand, never);
  const phone = coarse && isPhone();
  const shape: LiveShape = !phone ? null : land ? 'side' : pref !== 'upright' && onAir ? 'turned' : 'upright';
  useEffect(() => {
    if (shape !== 'turned') return;
    const root = document.documentElement;
    root.dataset.turned = '';
    return () => void delete root.dataset.turned;
  }, [shape]);
  return shape;
}

/** Where the screen can be locked sideways (Android, in full screen or installed), try it: the page then needn't turn. */
export function lockSideways() {
  const o = typeof screen !== 'undefined' ? (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }) : undefined;
  o?.lock?.('landscape').catch(() => {});
}
export function unlockSideways() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // (nothing was locked)
  }
}

const turned = () => typeof document !== 'undefined' && 'turned' in document.documentElement.dataset;

/**
 * A touch at (x, y) on the glass, in `el`'s own box (what its layout calls x and y), with the box's own
 * width and height. The page turned a quarter clockwise: the box's x runs down the glass, its y leftward.
 */
export function localPoint(el: Element, x: number, y: number): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  if (!turned()) return { x: x - r.left, y: y - r.top, w: r.width, h: r.height };
  return { x: y - r.top, y: r.right - x, w: r.height, h: r.width };
}

/** A finger's move on the glass (dx, dy), as the page sees it. */
export function localDelta(dx: number, dy: number): { dx: number; dy: number } {
  return turned() ? { dx: dy, dy: -dx } : { dx, dy };
}
