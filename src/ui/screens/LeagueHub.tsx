import { useEffect, useRef } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../../state/store';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import { fmtDate } from '../../core/league/helpers';
import { PageHeader, Segmented } from '../components/ui';
import { TabBar, useQueryParam, useSetParams } from '../league/shared';
import { StandingsTab } from '../league/StandingsTab';
import { StatsTab } from '../league/StatsTab';
import { RatingsTab } from '../league/RatingsTab';
import { PlayoffsTab } from '../league/PlayoffsTab';
import { AwardsTab } from '../league/AwardsTab';
import { CupTab } from '../league/CupTab';
import { NewsTab } from '../league/NewsTab';
import { DayScoreboard, TeamScheduleList } from '../league/Schedule';

const TABS = ['standings', 'schedule', 'stats', 'ratings', 'cup', 'playoffs', 'awards', 'news'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = {
  standings: 'Standings',
  schedule: 'Schedule',
  stats: 'Stats',
  ratings: 'Ratings',
  cup: 'NBA Cup',
  playoffs: 'Playoffs',
  awards: 'Awards',
  news: 'News',
};

export default function LeagueHub() {
  const league = useLeague();
  const inPost = league.phase === 'playin' || league.phase === 'playoffs';
  const [tab, setTab] = useQueryParam<Tab>('tab', inPost ? 'playoffs' : 'standings', TABS, true);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.scrollY > 120) window.scrollTo({ top: 0 });
  }, [tab]);
  const inSeason = league.phase === 'regular' || inPost;

  return (
    <main className="page lg-page">
      <PageHeader
        title="League"
        sub={`${seasonLabel(league.season)} · ${PHASE_LABEL[league.phase]}${inSeason ? ` · ${fmtDate(league.season, league.day)}` : ''}`}
        right={
          <Link to="/history" className="btn sm ghost" aria-label="History of the league">
            <HistoryIcon size={16} /> History
          </Link>
        }
      />
      <TabBar value={tab} onChange={setTab} options={TABS.map((id) => ({ id, label: LABEL[id] }))} label="League sections" />
      {tab === 'standings' && <StandingsTab league={league} />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'stats' && <StatsTab league={league} />}
      {tab === 'ratings' && <RatingsTab league={league} />}
      {tab === 'cup' && <CupTab league={league} />}
      {tab === 'playoffs' && <PlayoffsTab league={league} />}
      {tab === 'awards' && <AwardsTab league={league} />}
      {tab === 'news' && <NewsTab league={league} />}
    </main>
  );
}

/** Your schedule (all of it, or its NBA Cup games) or every game of a day: one switch over the list. */
function ScheduleTab() {
  const league = useLeague();
  const [mode] = useQueryParam<'mine' | 'day'>('sched', 'mine', ['mine', 'day']);
  const [games] = useQueryParam<'all' | 'cup'>('games', 'all', ['all', 'cup']);
  const setParams = useSetParams();
  const t = league.teams[league.userTid];
  const cup = league.schedule.some((g) => g.cup && (g.home === t.tid || g.away === t.tid));
  const value = mode === 'day' ? 'day' : cup && games === 'cup' ? 'cup' : 'mine';
  // both query values change in one step
  const pick = (v: 'mine' | 'cup' | 'day') => setParams(v === 'day' ? { sched: 'day' } : { sched: null, games: v === 'cup' ? 'cup' : null });
  return (
    <>
      <Segmented
        label="Schedule view"
        value={value}
        onChange={pick}
        options={[
          { id: 'mine' as const, label: `${t.abbrev} schedule` },
          ...(cup ? [{ id: 'cup' as const, label: 'Cup games' }] : []),
          { id: 'day' as const, label: 'Scores by day' },
        ]}
      />
      {mode === 'mine' ? <TeamScheduleList league={league} tid={league.userTid} cupOnly={value === 'cup'} /> : <DayScoreboard league={league} />}
    </>
  );
}
