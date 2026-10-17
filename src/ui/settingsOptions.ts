// Settings choices that are also offered elsewhere (New League, the live game), defined once so the
// screens always agree.
import type { Settings } from '../core/types';

/** Live game playback speeds (1 = normal). */
export const LIVE_SPEEDS: { id: number; label: string }[] = [1, 2, 4].map((id) => ({ id, label: `${id}×` }));

export const DIFFICULTY: { id: Settings['difficulty']; label: string; help: string }[] = [
  { id: 'casual', label: 'Casual', help: 'Trades about 12% under fair value go through, free agents ask 10% less, and no coach game-plans against you.' },
  {
    id: 'normal',
    label: 'Normal',
    help: 'Fair trades and market-rate contracts. Coaches game-plan against your strengths in about half your games.',
  },
  {
    id: 'hard',
    label: 'Hard',
    help: 'GMs want a 12% premium in trades, free agents ask 12% more, and every coach game-plans against you.',
  },
];

/** How much of the coaching controls the Tactics screens show. */
export const COMPLEXITY: { id: Settings['complexity']; label: string; help: string }[] = [
  { id: 'simple', label: 'Simple', help: 'Pick a playbook and a defensive identity. Your staff handles the details.' },
  { id: 'advanced', label: 'Advanced', help: 'Pace, shot profile, actions, coverages and help defense. Recommended.' },
  { id: 'expert', label: 'Expert', help: 'Everything: roles, shot freedom, matchups and end-of-game rules.' },
];

export const helpFor = <T extends string>(list: { id: T; help: string }[], id: T) => list.find((x) => x.id === id)?.help ?? '';
