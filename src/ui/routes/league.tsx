// League: everyone else. The hub's sections, other teams' pages (/teams/:tid) and history.
import { Navigate, Route, useParams } from 'react-router-dom';
import { lazyRetry } from '../lazyRetry';

const LeagueHub = lazyRetry(() => import('../screens/LeagueHub'));
const TeamView = lazyRetry(() => import('../screens/TeamView'));
const History = lazyRetry(() => import('../screens/History'));

function LeagueTab() {
  const { tab } = useParams();
  return <Navigate to={`/league?tab=${tab ?? 'standings'}`} replace />;
}

export const leagueRoutes = (
  <>
    <Route path="/league" element={<LeagueHub />} />
    <Route path="/league/history" element={<History />} />
    <Route path="/league/:tab" element={<LeagueTab />} />
    <Route path="/teams/:tid" element={<TeamView />} />
  </>
);
