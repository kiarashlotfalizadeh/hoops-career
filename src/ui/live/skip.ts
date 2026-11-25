// The Skip ahead sheet's choices in a live game (see LiveGame.simTo).
import { CLUTCH_SEC } from '../../state/live';
import { periodLabel } from '../stats';
import { closeGame } from './alerts';
import { winProb } from '../../core/analysis/winProb';
import { GAME } from '../../core/constants';

export type SkipTo = 'quarter' | 'half' | 'clutch' | 'min2' | 'min1' | 'sec24' | 'end';

export interface SkipChoice {
  id: SkipTo;
  label: string;
  sub: string;
}

/**
 * The fourth quarter or overtime of a game no longer close where the sim stands (closeGame: one side
 * 95% to win it), the third quarter's buzzer counting as the fourth's tip: no clutch time to skip to.
 */
export function simDecided(sim: { q: number; clock: number; T: readonly { score: number }[] }, edge: number): boolean {
  const at = sim.q === 3 && sim.clock <= 0.05 ? { q: 4, clock: GAME.quarterSec } : { q: sim.q, clock: sim.clock };
  return at.q >= 4 && !closeGame({ ...at, ball: null, sides: sim.T }, edge);
}

/**
 * Your starters hurt and out for the game since the sim's `from`-th injury: a skip ahead stops for the
 * first of them (useLiveGame.skip), with his line over the court, so the coach sees it as it happens.
 */
export function hurtStarters(
  sim: { injuries: readonly { pid: number; tid: number }[]; T: readonly { team: { tid: number }; players: readonly { pid: number; starter: boolean }[] }[] },
  side: 0 | 1,
  from: number,
): number[] {
  const t = sim.T[side];
  return sim.injuries
    .slice(from)
    .filter((i) => i.tid === t.team.tid && t.players.some((p) => p.pid === i.pid && p.starter))
    .map((i) => i.pid);
}

/** A side this likely to win in the fourth quarter or overtime: the screen offers the final (FinalOffer). */
export const SEALED_WIN = 0.98;

/** Whether the drawn game is sealed: the fourth quarter or overtime, one side SEALED_WIN to win it. */
export function sealedGame(v: { q: number; clock: number; ball: 0 | 1 | null; sides: readonly { score: number }[] }, edge: number): boolean {
  if (v.q < 4) return false;
  const p = winProb({ margin: v.sides[0].score - v.sides[1].score, q: v.q, clock: v.clock, ball: v.ball, edge });
  return p >= SEALED_WIN || p <= 1 - SEALED_WIN;
}

/**
 * What the Skip sheet offers. `playing` is the period being played as the screen shows it: the one
 * the court is drawing, or at a break the one about to start. (The drawn view can't say: it's taken
 * before the sim steps on, so on a period's first possession it still reads the period before, and a
 * skip "to the end" of that one would play through the period being drawn.) `sim` is where the game
 * itself is: clutch time stays offered until the game reaches 5:00 in the fourth even when the score
 * looks decided, so a coach always gets the choice to attempt a comeback or sim to final there.
 */
export function skipChoices(playing: number, atBreak: boolean, sim: { q: number; clock: number }, decided = false): SkipChoice[] {
  const inClutch = playing >= 4 && (atBreak ? playing >= 5 : sim.q >= 4 && sim.clock <= CLUTCH_SEC);
  const rem = atBreak ? (playing >= 5 ? GAME.otSec : GAME.quarterSec) : sim.clock;
  const clutchStops: SkipChoice[] = [];
  if (inClutch && !decided) {
    if (rem > 125) clutchStops.push({ id: 'min2', label: 'Last 2 minutes', sub: `Stops with 2:00 left in ${periodLabel(playing)}.` });
    if (rem > 65) clutchStops.push({ id: 'min1', label: 'Final minute', sub: `Stops with 1:00 left in ${periodLabel(playing)}.` });
    if (rem > 26 && rem <= 125) clutchStops.push({ id: 'sec24', label: 'Final 24 seconds', sub: `Stops with one shot clock left in ${periodLabel(playing)}.` });
  }
  return [
    { id: 'quarter', label: `End of ${periodLabel(playing)}`, sub: 'Stops at the break, with its report.' },
    // (from the first quarter's break, the end of the next quarter is halftime)
    ...(playing === 1 && !atBreak ? [{ id: 'half' as SkipTo, label: 'Halftime', sub: 'Plays through the second quarter too.' }] : []),
    ...(playing <= 4 && !(sim.q >= 4 && sim.clock <= CLUTCH_SEC) ? [{ id: 'clutch' as SkipTo, label: 'Clutch time', sub: 'Stops with 5:00 left in the fourth.' }] : []),
    ...clutchStops,
    {
      id: 'end',
      label: 'Sim to final',
      sub: decided ? 'The game is decided. The rest plays out at once.' : 'The rest plays out at once, with your plan and rotation.',
    },
  ];
}
