// How the staff's readings are said (src/ui/DESIGN.md, "Words before the fact, numbers for facts").
// A choice not yet played (a counter, a tactic, a fit) gets an opinion in words and never the figure
// behind it: what it will do stays a little unknown. What already happened, and what the two teams
// are, gets the exact figure: the points an edge was worth in a game (ptsFig), a chance to win (winPct).
import { WORTH_MIN } from '../ai/counterWorth';

/** Which way a reading leans: a gain, a cost, or too small to call. */
export type Lean = 'gain' | 'cost' | 'even';

/** A reading in points a game as a lean (`min`: how far from even it has to be to lean at all). */
export const leanOf = (pts: number, min = WORTH_MIN): Lean => (pts >= min ? 'gain' : pts <= -min ? 'cost' : 'even');

/** A lean's colour on the page. */
export const leanTone = (l: Lean): '' | 'good' | 'bad' => (l === 'gain' ? 'good' : l === 'cost' ? 'bad' : '');

/** Before a choice is made: the staff's opinion of it. */
export const AHEAD: Record<Lean, string> = { gain: 'Should help', cost: 'Could hurt', even: 'No clear edge' };

/** After a choice was made: what the staff makes of it so far. */
export const SINCE: Record<Lean, string> = { gain: 'Seems to help', cost: 'Seems to hurt', even: 'Too close to call' };

/** A playbook, a shape or a fit against the one in use. */
export const FIT: Record<Lean, string> = { gain: 'Better fit', cost: 'Worse fit', even: 'Similar fit' };

/** Inside even, a fit this far from the one in use (points a game) still leans a shade: the staff's read is a model, not a noisy measurement. */
export const SHADE_MIN = 0.2;

/**
 * A fit against the one in use in words, with a shade inside even ("Slightly better"), so a list of
 * playbooks the staff reads close still says which way each leans and no two read the same for no reason.
 */
export function fitWord(pts: number): string {
  const l = leanOf(pts);
  if (l !== 'even') return FIT[l];
  return pts >= SHADE_MIN ? 'Slightly better' : pts <= -SHADE_MIN ? 'Slightly worse' : 'Similar fit';
}

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
