// League → Stats: the leaders, every player's line, every team's, and every player's ratings, one
// switch apart (the views live in src/ui/league/stats).
import type { League } from '../../core/types';
import { Segmented } from '../components/ui';
import { useQueryParam } from './shared';
import { RatingsTab } from './RatingsTab';
import { useSeasonRows } from './stats/rows';
import { SeasonSelect, TypeSelect, useStatSeason } from './stats/season';
import { Leaders } from './stats/Leaders';
import { PlayerStatsTable } from './stats/PlayerStatsTable';
import { TeamStatsTable } from './stats/TeamStatsTable';

type View = 'leaders' | 'players' | 'teams' | 'ratings';

/** Stats: the leaders, every player's line, every team's, and every player's ratings, one switch apart. */
export function StatsTab({ league }: { league: League }) {
  const [view, setView] = useQueryParam<View>('sv', 'leaders', ['leaders', 'players', 'teams', 'ratings']);
  return (
    <>
      <Segmented
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
      {view === 'ratings' ? <RatingsTab league={league} /> : <SeasonStats league={league} view={view} />}
    </>
  );
}

function SeasonStats({ league, view }: { league: League; view: Exclude<View, 'ratings'> }) {
  const s = useStatSeason(league);
  // team stats are kept for the regular season only; imported seasons have no playoff lines
  const playoffs = s.po === 'po' && view !== 'teams' && !s.real;
  const rows = useSeasonRows(league, s.season, playoffs);
  return (
    <>
      {view !== 'players' && (
        <div className="lg-sub">
          <SeasonSelect s={s} />
          {view === 'leaders' && <TypeSelect s={s} />}
        </div>
      )}
      {view === 'leaders' && <Leaders league={league} rows={rows} season={s.season} playoffs={playoffs} />}
      {view === 'players' && <PlayerStatsTable league={league} rows={rows} s={s} playoffs={playoffs} />}
      {view === 'teams' && <TeamStatsTable league={league} season={s.season} />}
    </>
  );
}
