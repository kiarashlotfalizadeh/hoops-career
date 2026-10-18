// Another team's Schedule: your head-to-head with them this season (to their Matchup page), then
// their games.
import { Link } from 'react-router-dom';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { TeamLogo } from '../../components/TeamLogo';
import { TeamScheduleList } from '../Schedule';

export function ScheduleTab({ league, tid }: { league: League; tid: number }) {
  const h2h = useLeagueMemo(() => {
    let w = 0;
    let l = 0;
    for (const g of league.games) {
      if (g.season !== league.season || g.type === 'allstar') continue;
      const ids = [g.home.tid, g.away.tid];
      if (!ids.includes(tid) || !ids.includes(league.userTid)) continue;
      const usWon = (g.home.tid === league.userTid ? g.home.pts : g.away.pts) > (g.home.tid === league.userTid ? g.away.pts : g.home.pts);
      if (usWon) w++;
      else l++;
    }
    const left = league.schedule.filter((g) => !g.played && ((g.home === tid && g.away === league.userTid) || (g.away === tid && g.home === league.userTid))).length;
    return { w, l, left };
  }, [league, tid]);
  const me = league.teams[league.userTid];
  return (
    <>
      <Link to={`/games/${tid}`} className="card lg-h2h">
        <TeamLogo tid={league.userTid} size={32} decorative />
        <span className="grow">
          <span className="over">
            {me.abbrev} vs {league.teams[tid].abbrev} this season
          </span>
          <span className="lg-h2h-v">
            {h2h.w + h2h.l ? `${h2h.w}-${h2h.l}` : 'No meetings yet'}
            {h2h.left ? <span className="dim"> · {h2h.left} to play</span> : null}
          </span>
        </span>
        <span className="lg-h2h-key">Your games</span>
      </Link>
      <TeamScheduleList league={league} tid={tid} h2hTid={league.userTid} />
    </>
  );
}
