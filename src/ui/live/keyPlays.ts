// "Key plays" mode for the live game: the court draws only the possessions worth watching and
// fast-forwards through the rest.

import type { PossLog } from '../../core/sim/log';
import { CLUTCH_SEC } from '../../state/live';

export interface KeyContext {
  /** Each side's unanswered points before the possession (0 home, 1 away). */
  runBefore: [number, number];
  /** And after it. */
  runAfter: [number, number];
  /** Something the assistant, a banner or a broadcast graphic will bring up came out of it (an injury, a foul-out, a new alert, a coach's adjustment, a milestone or a big night). */
  event: boolean;
}

/**
 * Whether a possession is worth drawing: crunch time of a close game (the last five minutes of the
 * fourth quarter within ten), overtime, the last 24 seconds of a period, a run reaching 8-0, a
 * timeout, a play call, or anything that raises an alert or puts up a graphic.
 */
export function isKey(log: PossLog, ctx: KeyContext): boolean {
  const margin = Math.abs(log.score[0] - log.score[1]);
  if (log.q >= 5) return true;
  if (log.q === 4 && log.clockStart <= CLUTCH_SEC && margin <= 10) return true;
  if (log.clockEnd <= 24) return true;
  if ([0, 1].some((i) => ctx.runBefore[i] < 8 && ctx.runAfter[i] >= 8)) return true;
  if (log.steps.some((s) => s.k === 'timeout')) return true;
  // an end-of-game play call
  if (log.call) return true;
  return ctx.event;
}
