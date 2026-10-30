// What the staff believes, in words. The sim still measures every call, counter and fit, and the staff
// still acts on those readings, but the player gets an opinion and never the figure behind it: what a
// choice will do stays a little unknown (src/ui/DESIGN.md, "Words before the fact, numbers for facts").
// Every screen says a forecast or an estimate with these words, so a lean reads the same everywhere.
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
export const SINCE: Record<Lean, string> = { gain: 'Seems to help', cost: 'Seems to hurt', even: 'No clear change' };

/** A playbook, a shape or a fit against the one in use. */
export const FIT: Record<Lean, string> = { gain: 'Better fit', cost: 'Worse fit', even: 'Similar fit' };

/** How big an edge in a game was, for "what decided it": sized, not counted. */
export function edgeWord(pts: number): string {
  const a = Math.abs(pts);
  return a >= 4 ? 'Big edge' : a >= 1.5 ? 'Edge' : 'Small edge';
}

/** One team's chance to win as the pre-game screens say it. */
export function oddsWord(p: number): string {
  if (p >= 0.8) return 'Heavy favorite';
  if (p >= 0.62) return 'Favorite';
  if (p >= 0.54) return 'Slight favorite';
  if (p > 0.46) return 'Toss-up';
  if (p > 0.38) return 'Slight underdog';
  if (p > 0.2) return 'Underdog';
  return 'Long shot';
}
