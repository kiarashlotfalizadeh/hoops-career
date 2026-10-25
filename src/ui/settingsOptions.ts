// Settings choices that are also offered elsewhere (New League, the live game), defined once so the
// screens always agree.
import type { Settings } from '../core/types';
import { COURT_RANGE, DIFFICULTIES, DIFFICULTY, type Difficulty } from '../core/league/difficulty';
import { GRACE } from '../core/league/jobSecurity';

/** The help line for teaching, the same in Settings and New League. */
export const TEACHING_HELP = "The first-week guide on Today, its welcome mail and Today's Glossary link. Every ? and glossary word stays.";

/** Whether new leagues start with teaching on: this device remembers the last choice. */
export function teachingDefault(): boolean {
  try {
    return localStorage.getItem('hc:teaching') !== '0';
  } catch {
    return true;
  }
}

export function rememberTeaching(on: boolean) {
  try {
    localStorage.setItem('hc:teaching', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Live game playback speeds (1 = normal). */
export const LIVE_SPEEDS: { id: number; label: string }[] = [1, 2, 4].map((id) => ({ id, label: `${id}×` }));

/** Where a live game stops for a break with a period report. */
export const LIVE_BREAKS: { id: NonNullable<Settings['liveBreaks']>; label: string }[] = [
  { id: 'quarters', label: 'Quarters' },
  { id: 'half', label: 'Halftime' },
  { id: 'off', label: 'None' },
];

/** The difficulty presets as picker options (the numbers live in core/league/difficulty.ts). */
export const DIFFICULTY_OPTIONS: { id: Settings['difficulty']; label: string; help: string }[] = DIFFICULTIES.map((id) => ({
  id,
  label: DIFFICULTY[id].label,
  help: DIFFICULTY[id].line,
}));

export const helpFor = <T extends string>(list: { id: T; help: string }[], id: T) => list.find((x) => x.id === id)?.help ?? '';

/** A share of fair value as the difference from it: 0.88 → "−12%", 1 → "Fair". */
const vsFair = (x: number) => (Math.abs(x - 1) < 0.005 ? 'Fair' : `${x < 1 ? '−' : '+'}${Math.round(Math.abs(x - 1) * 100)}%`);
const PLANS: Record<'never' | 'sometimes' | 'always', string> = { never: 'None', sometimes: 'Half', always: 'All' };

/**
 * What tells the presets apart, one column each, for the difficulty picker (Settings and New
 * League): the label over the column, the figure for a preset, and what it means.
 */
export const DIFFICULTY_COLUMNS: { id: string; label: string; value: (d: Difficulty) => string; help: string }[] = [
  { id: 'trade', label: 'Trade asks', value: (d) => vsFair(DIFFICULTY[d].tradeAsk), help: 'What AI GMs need back in a trade, against fair value (−12% means 12% less).' },
  {
    id: 'contract',
    label: 'Contract asks',
    value: (d) => vsFair(DIFFICULTY[d].contractAsk),
    help: 'What your own players and free agents ask of you, against their market price.',
  },
  { id: 'plans', label: 'Opponent plans', value: (d) => PLANS[DIFFICULTY[d].opponentPlans], help: 'How many opposing coaches come in with a game plan against you.' },
  {
    id: 'court',
    label: 'On court',
    value: (d) => {
      const x = DIFFICULTY[d];
      if (!x.court) return 'Even';
      const sign = x.court > 0 ? '+' : '−';
      // (Hard's grows with your team: 1 to 5 points, the better the team, the more; the sign on both ends)
      return x.courtGrowth ? `${sign}${Math.abs(x.court) * COURT_RANGE[0]} to ${sign}${Math.abs(x.court) * COURT_RANGE[1]}` : `${sign}${Math.abs(x.court)}`;
    },
    help: 'Points a game your team gets (+) or your opponents get (−) over what the rosters and tactics are worth, the way home court works. On Hard it grows with your team: the better your roster, the harder they play you.',
  },
  {
    id: 'owner',
    label: 'Owner waits',
    value: (d) => `${GRACE[d]} yr${GRACE[d] === 1 ? '' : 's'}`,
    help: `Seasons before the owner can fire you (with Job security on). A harder owner also loses patience faster after a bad season, accepts fewer rebuilding seasons in a row (${DIFFICULTIES.map((d) => `${DIFFICULTY[d].label} ${DIFFICULTY[d].rebuildSeasons}`).join(', ')}) and a higher floor under his win goal (${DIFFICULTIES.map((d) => `${DIFFICULTY[d].label} .${Math.round(DIFFICULTY[d].winFloor * 1000)}`).join(', ')}).`,
  },
];
