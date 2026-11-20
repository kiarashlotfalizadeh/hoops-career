// The chime: a small two-note yes when something of yours lands. A trade you made (in the builder,
// from an offer, a staff's call or a three-team deal), your draft pick, and each career moment that
// takes the screen (a clinch, a title, an award, a milestone). It rides the game's sounds (the
// device's "Game sounds"). One place decides it: the trade and the pick are read off the league's
// transaction log, so every way of making one rings, and none has to remember to.
import { useEffect, useRef } from 'react';
import type { League } from '../core/types';
import { useStore } from '../state/store';
import { sfx } from './sound';
import type { MomentKind } from './moments';

/** Two things landing together (your pick, and the moment for it) are one chime. */
const ONCE_MS = 900;
let rang = -Infinity;

/** Ring it, unless it has only just rung. */
export function chime() {
  const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (t - rang < ONCE_MS) return;
  rang = t;
  sfx('chime');
}

/** The moments that are good news of your own: the job's hard ones and a newspaper's story don't ring. */
const RINGS: ReadonlySet<MomentKind> = new Set<MomentKind>([
  'clinch',
  'series',
  'title',
  'cup',
  'draft',
  'signing',
  'award',
  'allStar',
  'record',
  'milestone',
  'jersey',
  'farewell',
  'hired',
]);

/** A moment has taken the screen. */
export function momentCue(kind: MomentKind) {
  if (RINGS.has(kind)) chime();
}

/** Does this move of the log ring: a trade the user's team is in, or a pick it made? */
export function ringsFor(league: Pick<League, 'userTid'>, txn: { kind: string; tids: number[] }): boolean {
  return (txn.kind === 'trade' && txn.tids.includes(league.userTid)) || (txn.kind === 'draft' && txn.tids[0] === league.userTid);
}

/**
 * Watch the open league's transaction log (the app's shell mounts it once): a new trade or pick of
 * the user's rings as it lands. Not while a sim runs (the staff picking for him over a simmed draft
 * isn't a string of chimes: the moment after it rings once), and not for what was already in the
 * log when the league opened.
 */
export function useCues() {
  const league = useStore((s) => s.league);
  const v = useStore((s) => s.v);
  const seen = useRef<{ id: string; next: number } | null>(null);
  useEffect(() => {
    if (!league) return void (seen.current = null);
    const next = league.nextTxnId ?? 0;
    const was = seen.current;
    seen.current = { id: league.id, next };
    if (!was || was.id !== league.id || next <= was.next || useStore.getState().sim) return;
    if ((league.transactions ?? []).some((x) => x.id >= was.next && ringsFor(league, x))) chime();
  }, [league, v]);
}
