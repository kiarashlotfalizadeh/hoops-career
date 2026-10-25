// League → Stats: the leaders, every player's line, every team's, and every player's ratings, one
// switch apart (the views live in src/ui/league/stats).
import type { League } from '../../core/types';
import { useQueryParam } from './shared';
import { ViewChips } from './Views';
import { RatingsTab } from './RatingsTab';
import { useSeasonRows } from './stats/rows';
import { SeasonPicker, useStatSeason, type StatSeason } from './stats/season';
import { Leaders } from './stats/Leaders';
import { PlayerStatsTable } from './stats/PlayerStatsTable';
import { TeamStatsTable } from './stats/TeamStatsTable';

type View = 'leaders' | 'players' | 'teams' | 'ratings';

/** Stats: the leaders, every player's line, every team's, and every player's ratings, one switch apart. */
export function StatsTab({ league }: { league: League }) {
  const [view, setView] = useQueryParam<View>('sv', 'leaders', ['leaders', 'players', 'teams', 'ratings']);
  const s = useStatSeason(league);
  return (
    <>
      <ViewChips
        label="Stats view"
        value={view}
        onChange={setView}
        options={[
          { id: 'leaders', label: 'Leaders' },
          { id: 'players', label: 'Players' },
          { id: 'teams', label: 'Teams' },
          { id: 'ratings', label: 'Ratings' },
        ]}
      />
      {view === 'ratings' ? <RatingsTab league={league} /> : <SeasonStats league={league} view={view} s={s} />}
    </>
  );
}

function SeasonStats({ league, view, s }: { league: League; view: Exclude<View, 'ratings'>; s: StatSeason }) {
  // team stats are kept for the regular season only (s.po is the regular season's for a real season without playoff lines)
  const playoffs = s.po === 'po' && view !== 'teams';
  const rows = useSeasonRows(league, s.season, playoffs);
  return (
    <>
      {/* (the players' season is in their Filters, with the rest of the table's switches; ratings are today's) */}
      {view !== 'players' && <SeasonPicker s={s} types={view === 'leaders'} />}
      {view === 'leaders' && <Leaders league={league} rows={rows} season={s.season} playoffs={playoffs} />}
      {view === 'players' && <PlayerStatsTable league={league} rows={rows} s={s} playoffs={playoffs} />}
      {view === 'teams' && <TeamStatsTable league={league} season={s.season} />}
    </>
  );
}
