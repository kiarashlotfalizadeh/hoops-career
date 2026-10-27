// The user's young players' turn (League.youthLean): a stretch of his games in which his staff's
// rotation leans to the young, as an AI team's youth movement does (see games.ts's youthMovement),
// put in by the week's call when he says so or his staff does (see weekCall.ts); or, answered the
// other way, the stretch in which the staff doesn't ask again. No imports beyond types, so games.ts
// can read it without a cycle.
import type { League } from '../types';

export interface YouthLean {
  season: number;
  /** The user's team it was put in for. */
  tid: number;
  /** The first and last day it holds. */
  from: number;
  until: number;
  /** How far the rotation leans to the young (an AI team's youth movement, 0 to 1). */
  level: number;
  /** Put in by his answer ('staff') or the staff's own pick ('auto'), or turned down ('kept': nothing leans, the call waits until `until`). */
  how: 'staff' | 'auto' | 'kept';
  /** What it was for (the owner's youth goal, or the draft), what it measured at when it went in (points a game, shrunk), and the young players' minutes a game the rotation planned without it. */
  why?: 'goal' | 'draft';
  pts?: number;
  young?: number;
  /** Put in from a card (his answer or the staff's lean on one he left): its games played, it's measured again. */
  card?: true;
  /** Its games played, the staff measured it again on the last of them and the digest said what it came to (weekCall.ts's youthPayoff). */
  paid?: true;
}

/** The lean on the user's rotation today (0: none). */
export function userYouth(league: Pick<League, 'youthLean' | 'season' | 'userTid' | 'phase' | 'day'>): number {
  const y = league.youthLean;
  return y && y.how !== 'kept' && y.season === league.season && y.tid === league.userTid && league.phase === 'regular' && league.day >= y.from && league.day <= y.until
    ? y.level
    : 0;
}
