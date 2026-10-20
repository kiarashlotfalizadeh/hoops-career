// The user's team's familiarity record as the Tactics screen reads it, worked out once per league.
import { useLeague, useLeagueMemo } from '../../state/store';
import type { Familiarity } from '../../core/types';
import { teamFam } from './fam';

export function useFam(): Familiarity {
  const league = useLeague();
  return useLeagueMemo(() => teamFam(league), [league]);
}
