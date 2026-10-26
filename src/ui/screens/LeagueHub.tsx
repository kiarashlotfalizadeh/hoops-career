// The League hub: everyone else, one section per path (/league/standings ... /league/history).
// /league opens on what the phase is about: the standings, or the bracket in the postseason. Five
// sections are the tab row, which fits a 360px phone without scrolling (eight once hid behind a
// clipped, scrolling row): Standings, Playoffs (the NBA Cup a row at its top while the Cup is on),
// Stats, Scores, News. Awards and History, the record of what's been won, are the header's two links.
import { Suspense } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { League } from '../../core/types';
import { useLeague } from '../../state/store';
import { lazyRetry } from '../lazyRetry';
import { ChevronRight } from 'lucide-react';
import { PageHeader, Spinner } from '../components/ui';
import { TabBar } from '../league/shared';
import { StandingsTab } from '../league/StandingsTab';
import { StatsTab } from '../league/StatsTab';
import { PlayoffsTab } from '../league/PlayoffsTab';
import { AwardsTab } from '../league/AwardsTab';
import { CupTab } from '../league/CupTab';
import { NewsTab } from '../league/NewsTab';
import { DayScoreboard } from '../league/Schedule';

const History = lazyRetry(() => import('./History'));

const TABS = ['standings', 'playoffs', 'cup', 'stats', 'schedule', 'awards', 'news', 'history'] as const;
type Tab = (typeof TABS)[number];
/** The tab row's five. */
const TOP: Tab[] = ['standings', 'playoffs', 'stats', 'schedule', 'news'];
const LABEL: Record<Tab, string> = {
  standings: 'Standings',
  playoffs: 'Playoffs',
  cup: 'Cup',
  stats: 'Stats',
  schedule: 'Scores',
  awards: 'Awards',
  news: 'News',
  history: 'History',
};

/** The section /league opens on: the bracket during the play-in and the playoffs, the standings otherwise. */
const defaultLeagueTab = (league: League): Tab => (league.phase === 'playin' || league.phase === 'playoffs' ? 'playoffs' : 'standings');

/** The NBA Cup has a tab while this season's Cup is still to come or was played this regular season. */
const cupShown = (league: League) => !!league.cup && league.cup.season === league.season && (league.phase === 'preseason' || league.phase === 'regular');

export default function LeagueHub() {
  const league = useLeague();
  const nav = useNavigate();
  const { search } = useLocation();
  const params = useParams();
  const raw = params.tab?.toLowerCase();
  // Ratings is a view of Stats now; anything else unknown opens the hub
  if (raw === 'ratings') return <Navigate to={`/league/stats?${new URLSearchParams([...new URLSearchParams(search), ['sv', 'ratings']])}`} replace />;
  if (raw !== undefined && !(TABS as readonly string[]).includes(raw)) return <Navigate to="/league" replace />;
  const tab = (raw as Tab | undefined) ?? defaultLeagueTab(league);
  // (the Cup lights Playoffs, its home; Awards and History light their header link)
  const lit: Tab = tab === 'cup' ? 'playoffs' : tab;
  const head = (id: 'awards' | 'history') => (
    <Link to={`/league/${id}`} className={`btn sm${tab === id ? ' on' : ''}`} aria-current={tab === id ? 'page' : undefined}>
      {LABEL[id]}
    </Link>
  );
  return (
    <main className="page lg-page">
      <PageHeader
        title="League"
        right={
          <span className="lg-ph-links">
            {head('awards')}
            {head('history')}
          </span>
        }
      />
      <TabBar value={lit} onChange={(t) => nav(`/league/${t}`, { replace: true })} options={TOP.map((id) => ({ id, label: LABEL[id] }))} label="League sections" />
      {tab === 'standings' && <StandingsTab league={league} />}
      {tab === 'playoffs' && (
        <>
          {cupShown(league) && <CupLink league={league} />}
          <PlayoffsTab league={league} />
        </>
      )}
      {tab === 'cup' && <CupTab league={league} />}
      {tab === 'stats' && <StatsTab league={league} />}
      {tab === 'schedule' && <DayScoreboard league={league} />}
      {tab === 'awards' && <AwardsTab league={league} />}
      {tab === 'news' && <NewsTab league={league} />}
      {tab === 'history' && (
        // (the app's own wait: nothing for a moment, then a spinner, never a "Loading…" line)
        <Suspense
          fallback={
            <div className="page-wait" role="status" aria-label="Loading">
              <Spinner />
            </div>
          }
        >
          <History />
        </Suspense>
      )}
    </main>
  );
}

/** The NBA Cup while it's on, as one row at the top of Playoffs: where it stands, a tap to its groups and bracket. */
function CupLink({ league }: { league: League }) {
  const cup = league.cup;
  const where = !cup ? '' : cup.champion !== undefined ? `Won by the ${league.teams[cup.champion].name}` : cup.seeds ? 'Knockouts' : 'Group stage';
  return (
    <Link to="/league/cup" className="card listrow clickable lg-cuplink">
      <span className="grow">
        <span className="lr-name">NBA Cup</span>
        {where && <span className="lr-meta">{where}</span>}
      </span>
      <ChevronRight size={18} className="dim" aria-hidden="true" />
    </Link>
  );
}
