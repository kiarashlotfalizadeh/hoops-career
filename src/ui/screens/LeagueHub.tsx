import { useEffect, useRef } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../../state/store';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import { fmtDate } from '../../core/league/helpers';
import { PageHeader, Segmented } from '../components/ui';
import { TabBar, useQueryParam } from '../league/shared';
import { StandingsTab } from '../league/StandingsTab';
import { StatsTab } from '../league/StatsTab';
import { PlayoffsTab } from '../league/PlayoffsTab';
import { AwardsTab } from '../league/AwardsTab';
import { CupTab } from '../league/CupTab';
import { NewsTab } from '../league/NewsTab';
import { DayScoreboard, TeamScheduleList } from '../league/Schedule';

const TABS = ['standings', 'schedule', 'stats', 'cup', 'playoffs', 'awards', 'news'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { standings: 'Standings', schedule: 'Schedule', stats: 'Stats', cup: 'NBA Cup', playoffs: 'Playoffs', awards: 'Awards', news: 'News' };

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
          <Link to="/history" className="btn sm ghost" aria-label="League history">
            <HistoryIcon size={16} /> History
          </Link>
        }
      />
      <TabBar value={tab} onChange={setTab} options={TABS.map((id) => ({ id, label: LABEL[id] }))} />
      {tab === 'standings' && <StandingsTab league={league} />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'stats' && <StatsTab league={league} />}
      {tab === 'cup' && <CupTab league={league} />}
      {tab === 'playoffs' && <PlayoffsTab league={league} />}
      {tab === 'awards' && <AwardsTab league={league} />}
      {tab === 'news' && <NewsTab league={league} />}
    </main>
  );
}

function ScheduleTab() {
  const league = useLeague();
  const [mode, setMode] = useQueryParam<'mine' | 'day'>('sched', 'mine', ['mine', 'day']);
  const t = league.teams[league.userTid];
  return (
    <>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { id: 'mine', label: `${t.abbrev} schedule` },
          { id: 'day', label: 'All games by day' },
        ]}
      />
      {mode === 'mine' ? <TeamScheduleList league={league} tid={league.userTid} /> : <DayScoreboard league={league} />}
    </>
  );
}
