// Settings choices that are also offered elsewhere (New League, the live game), defined once so the
// screens always agree.
import type { Settings } from '../core/types';

/** Live game playback speeds (1 = normal). */
export const LIVE_SPEEDS: { id: number; label: string }[] = [1, 2, 4].map((id) => ({ id, label: `${id}×` }));

export const DIFFICULTY: { id: Settings['difficulty']; label: string; help: string }[] = [
  { id: 'casual', label: 'Casual', help: 'AI GMs accept trades about 12% below fair value, and free agents ask you for 10% less. Opposing coaches never game-plan against you.' },
  {
    id: 'normal',
    label: 'Normal',
    help: 'Fair trades and market-rate contracts. Opposing coaches game-plan against what your team does best in about half your games, the better coaches more often.',
  },
  {
    id: 'hard',
    label: 'Hard',
    help: 'AI GMs want a 12% premium in trades, and free agents ask you for 12% more. Every opposing coach game-plans against what your team does best.',
  },
];

/** How much of the coaching controls the Tactics screens show. */
export const COMPLEXITY: { id: Settings['complexity']; label: string; help: string }[] = [
  { id: 'simple', label: 'Simple', help: 'Pick a playbook and a defensive identity. Your staff handles the details.' },
  { id: 'advanced', label: 'Advanced', help: 'Tune pace, shot profile, actions, coverages and help defense. Recommended.' },
  { id: 'expert', label: 'Expert', help: 'Everything: individual roles, shot freedom, matchups and end-of-game rules.' },
];

export const helpFor = <T extends string>(list: { id: T; help: string }[], id: T) => list.find((x) => x.id === id)?.help ?? '';
