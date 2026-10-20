import type { League } from '../core/types';
import { leagueForecast, type Forecast } from '../core/analysis/odds';
import { useLeagueMemo, useStore } from '../state/store';

/** The forecast the screens last showed, held through a sim. */
let held: { id: string; season: number; f: Forecast | null } | null = null;

/**
 * The season forecast for a screen (`leagueForecast`). While a sim runs every checkpoint is a new
 * league, and its thousands of simulated seasons would run again for each: the screens keep the last
 * forecast until the sim ends, then catch up once.
 */
export function useForecast(league: League): Forecast | null {
  const simming = useStore((s) => !!s.sim);
  return useLeagueMemo(() => {
    if (simming && held && held.id === league.id && held.season === league.season) return held.f;
    const f = leagueForecast(league);
    held = { id: league.id, season: league.season, f };
    return f;
  }, [league, simming]);
}
