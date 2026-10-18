// The Skip ahead sheet's choices in a live game (see LiveGame.simTo).
import { CLUTCH_SEC } from '../../state/live';
import { periodLabel } from '../stats';

export type SkipTo = 'quarter' | 'half' | 'clutch' | 'end';

export interface SkipChoice {
  id: SkipTo;
  label: string;
  sub: string;
}

/**
 * What the Skip sheet offers. `playing` is the period being played as the screen shows it: the one
 * the court is drawing, or at a break the one about to start. (The drawn view can't say: it's taken
 * before the sim steps on, so on a period's first possession it still reads the period before, and a
 * skip "to the end" of that one would play through the period being drawn.) `sim` is where the game
 * itself is: clutch time is offered while the game hasn't reached it.
 */
export function skipChoices(playing: number, atBreak: boolean, sim: { q: number; clock: number }): SkipChoice[] {
  return [
    { id: 'quarter', label: `End of ${periodLabel(playing)}`, sub: 'Stops at the break, with its report.' },
    // (from the first quarter's break, the end of the next quarter is halftime)
    ...(playing === 1 && !atBreak ? [{ id: 'half' as SkipTo, label: 'Halftime', sub: 'Plays through the second quarter too.' }] : []),
    ...(playing <= 4 && !(sim.q >= 4 && sim.clock <= CLUTCH_SEC) ? [{ id: 'clutch' as SkipTo, label: 'Clutch time', sub: '5:00 left in the fourth quarter.' }] : []),
    { id: 'end', label: 'Sim to final', sub: 'The rest plays out at once, with your plan and rotation as they are.' },
  ];
}
