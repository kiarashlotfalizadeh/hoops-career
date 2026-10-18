// League: everyone else. The hub's sections have their own paths (/league/standings, /league/stats,
// ... /league/history; /league opens on the phase's own section), other teams' pages are /teams/:tid.
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';
import { useStore } from '../../state/store';
import { lazyRetry } from '../lazyRetry';

const LeagueHub = lazyRetry(() => import('../screens/LeagueHub'));
const TeamView = lazyRetry(() => import('../screens/TeamView'));

/** /league, or a link from before the sections had paths (/league?tab=stats&sv=teams → /league/stats?sv=teams). */
function LeagueIndex() {
  const { search } = useLocation();
  const sp = new URLSearchParams(search);
  const tab = sp.get('tab');
  if (!tab) return <LeagueHub />;
  sp.delete('tab');
  const qs = sp.toString();
  return <Navigate to={`/league/${encodeURIComponent(tab.toLowerCase())}${qs ? `?${qs}` : ''}`} replace />;
}

/** Another team's page; the user's own team lives in the Team tab. A page per team, so tabs and filters start fresh. */
function TeamPage() {
  const { tid = '' } = useParams();
  const userTid = useStore((s) => s.league?.userTid);
  if (Number(tid) === userTid && /^\d+$/.test(tid)) return <Navigate to="/team" replace />;
  return <TeamView key={tid} />;
}

export const leagueRoutes = (
  <>
    <Route path="/league" element={<LeagueIndex />} />
    <Route path="/league/:tab" element={<LeagueHub />} />
    <Route path="/teams/:tid" element={<TeamPage />} />
  </>
);
