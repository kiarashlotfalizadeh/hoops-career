// Another team's Schedule: your head-to-head with them this season (to their Matchup page), then
// their games.
import { Link } from 'react-router-dom';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { TeamLogo } from '../../components/TeamLogo';
import { TeamScheduleList } from '../Schedule';
import { seasonSeries, seriesText } from '../../games/series';

export function ScheduleTab({ league, tid }: { league: League; tid: number }) {
  // the regular-season series as Games and the matchup page write it (playoff and Cup knockout games aside)
  const series = useLeagueMemo(() => seasonSeries(league, tid), [league, tid]);
  const me = league.teams[league.userTid];
  return (
    <>
      <Link to={`/games/${tid}`} className="card lg-h2h">
        <TeamLogo tid={league.userTid} size={32} decorative />
        <span className="grow">
          <span className="over">
            {me.abbrev} vs {league.teams[tid].abbrev} this season
          </span>
          <span className="lg-h2h-v">{seriesText(series) || 'No regular-season meetings'}</span>
        </span>
        <span className="lg-h2h-key">Your games</span>
      </Link>
      <TeamScheduleList league={league} tid={tid} h2hTid={league.userTid} />
    </>
  );
}
