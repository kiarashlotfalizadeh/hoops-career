// The night around the live court (see atmosphere.ts): the crowd's rule along the floor's edges in
// the home team's colour (louder, heavier; hushed, gone), and clutch time's frame, which tightens
// around the floor in the brand's red and breathes slowly. What the night says in words (the callout
// for a big moment, the crowd's line, the offers) is on the call bar (CallBar.tsx).
// CSS does the moving (opacity only, cheap on a phone); reduced motion keeps it still and in view.
import type { CSSProperties } from 'react';

/**
 * The building around the floor: `level` 0 (hushed) .. 4 (on its feet), in `color` (the home kit's;
 * the accent on a neutral floor). `clutch`: the finish's frame over it.
 */
export function Crowd({ level, color, clutch }: { level: number; color: string; clutch: boolean }) {
  const lvl = Math.max(0, Math.min(4, Math.round(level)));
  return <div className={`lv-crowd lvl-${lvl}${clutch ? ' clutch' : ''}`} style={{ '--crowd-c': color } as CSSProperties} aria-hidden="true" />;
}

const SLOW_KEY = 'hoops.live.clutchSlow';

/** Whether this device slows close finishes to 1× by itself (the offer's Always). A setting of the live screen's own, on this device. */
export function clutchSlowAlways(): boolean {
  try {
    return localStorage.getItem(SLOW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setClutchSlowAlways(on: boolean) {
  try {
    if (on) localStorage.setItem(SLOW_KEY, '1');
    else localStorage.removeItem(SLOW_KEY);
  } catch {
    // (private browsing: it's offered again next time)
  }
}
