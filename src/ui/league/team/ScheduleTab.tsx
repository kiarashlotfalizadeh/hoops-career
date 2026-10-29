// Another team's Schedule: your head-to-head with them this season (to their Matchup page), then
// their games.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { TeamLogo } from '../../components/TeamLogo';
import { keep } from '../../components/ui';
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
          <span className="lg-h2h-v">{keep(seriesText(series) || 'No regular-season meetings')}</span>
        </span>
        {/* (your games in their list carry your team's wash, as your rows do everywhere: no key needed) */}
        <ChevronRight size={18} className="dim" aria-hidden="true" />
      </Link>
      <TeamScheduleList league={league} tid={tid} h2hTid={league.userTid} />
    </>
  );
}
