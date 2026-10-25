// The season a Stats view reads and its two selects: which season (an imported one marked real),
// and the regular season or the playoffs.
import type { League } from '../../../core/types';
import { seasonLabel } from '../../../core/constants';
import { PickerLine } from '../Views';
import { useLeagueMemo } from '../../../state/store';
import { FilterField, statSeasons, useQueryParam } from '../shared';

/** The season a stats view reads (the current one once it has games, else the last) and whether it's the playoffs'. */
export function useStatSeason(league: League) {
  const seasons = useLeagueMemo(() => statSeasons(league), [league]);
  // before the first game of a season, open on the last completed one
  const started = league.games.some((g) => g.season === league.season);
  const fallback = started ? league.season : ([...seasons].filter((s) => s.season < league.season).sort((a, b) => b.season - a.season)[0]?.season ?? league.season);
  const [seasonStr, setSeasonStr] = useQueryParam<string>('season', String(fallback));
  // a season the league doesn't have (an old or garbled link) opens the default one
  const season = seasons.some((s) => s.season === Number(seasonStr)) ? Number(seasonStr) : fallback;
  const [po, setPo] = useQueryParam<'reg' | 'po'>('po', 'reg', ['reg', 'po']);
  const real = seasons.find((s) => s.season === season)?.real ?? false;
  // (a real season's playoffs, when the seed has its playoff lines)
  const types = !real || !!seasons.find((s) => s.season === season)?.post;
  return { seasons, season, setSeason: (s: number) => setSeasonStr(String(s)), fallback, po: types ? po : ('reg' as const), setPo, real, types };
}

export type StatSeason = ReturnType<typeof useStatSeason>;

export function SeasonSelect({ s }: { s: StatSeason }) {
  return (
    <select className="lg-select" value={s.season} onChange={(e) => s.setSeason(Number(e.target.value))} aria-label="Season">
      {s.seasons.map((x) => (
        <option key={x.season} value={x.season}>
          {seasonLabel(x.season)}
          {x.real ? ' (real)' : ''}
        </option>
      ))}
    </select>
  );
}

/** Regular season or playoffs; a real season from a seed without its playoff lines has only the regular season. */
export function TypeSelect({ s }: { s: StatSeason }) {
  return (
    <select className="lg-select" value={s.po} onChange={(e) => s.setPo(e.target.value as 'reg' | 'po')} aria-label="Season type" disabled={!s.types}>
      <option value="reg">Regular season</option>
      <option value="po">Playoffs</option>
    </select>
  );
}

/** The season a view reads, as one quiet line over it ("2026-27 · Regular season ⌄") that opens the season and its type in a sheet. `types` false for a view kept for the regular season only. */
export function SeasonPicker({ s, types = true }: { s: StatSeason; types?: boolean }) {
  const po = types && s.po === 'po';
  const parts = [seasonLabel(s.season), ...(types ? [po ? 'Playoffs' : 'Regular season'] : []), ...(s.real ? ['Real'] : [])];
  return (
    <PickerLine parts={parts} title="Season" label={`Season: ${parts.join(', ')}. Change`}>
      <FilterField label="Season">
        <SeasonSelect s={s} />
      </FilterField>
      {types && (
        <FilterField label="Games">
          <TypeSelect s={s} />
        </FilterField>
      )}
    </PickerLine>
  );
}
