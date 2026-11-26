// How the staff's readings are said (src/ui/DESIGN.md, "Numbers for facts, reasons before a choice").
// What already happened, and what the two teams are, gets the exact figure: the points an edge was
// worth in a game (ptsFig), a chance to win (winPct), a check on played games. A choice of the coach's
// not yet played (a counter, a playbook, a change to the rotation) gets the staff's reasons and no
// reading at all. The words here are for what's left: the staff's own proposals (a change it tested
// and offers, a deal: AHEAD) and what it makes of a change once its games are played (SINCE).
import { WORTH_MIN } from '../ai/counterWorth';

/** Which way a reading leans: a gain, a cost, or too small to call. */
export type Lean = 'gain' | 'cost' | 'even';

/** A reading in points a game as a lean (`min`: how far from even it has to be to lean at all). */
export const leanOf = (pts: number, min = WORTH_MIN): Lean => (pts >= min ? 'gain' : pts <= -min ? 'cost' : 'even');

/** A lean's colour on the page. */
export const leanTone = (l: Lean): '' | 'good' | 'bad' => (l === 'gain' ? 'good' : l === 'cost' ? 'bad' : '');

/** A change the staff itself proposes, before it's made: its opinion of it (never on the coach's own options). */
export const AHEAD: Record<Lean, string> = { gain: 'Should help', cost: 'Could hurt', even: 'No clear edge' };

/** After a choice was made: what the staff makes of it so far. */
export const SINCE: Record<Lean, string> = { gain: 'Seems to help', cost: 'Seems to hurt', even: 'Too close to call' };

/** Points an edge was worth, as a fact: "+4.2 pts", "−1.3 pts" (a true minus), "0.0 pts". */
export function ptsFig(pts: number, unit = true): string {
  const a = Math.abs(pts);
  const sign = a < 0.05 ? '' : pts > 0 ? '+' : '−';
  return `${sign}${a.toFixed(1)}${unit ? ' pts' : ''}`;
}

/** A chance to win as a whole percentage, never 0 or 100 while the game is open: "62%". */
export function winPct(p: number): string {
  return `${Math.min(99, Math.max(1, Math.round(p * 100)))}%`;
}
