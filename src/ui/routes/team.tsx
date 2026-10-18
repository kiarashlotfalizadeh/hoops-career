// Team: who plays and how. The hub's sections are /team (the roster), /team/rotation,
// /team/tactics and /team/lineups; a player's page and the comparison sit under it.
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';
import { lazyRetry } from '../lazyRetry';

const TeamHub = lazyRetry(() => import('../team/TeamHub'));
const PlayerView = lazyRetry(() => import('../screens/PlayerView'));
const Compare = lazyRetry(() => import('../screens/Compare'));

/** /team/12 was another team's page before the redesign: those live at /teams/:tid now. */
function TeamSection() {
  const { tab = '' } = useParams();
  if (/^\d+$/.test(tab)) return <Navigate to={`/teams/${tab}`} replace />;
  return <TeamHub />;
}

function Player() {
  const { pathname } = useLocation();
  return <PlayerView key={pathname} />;
}

export const teamRoutes = (
  <>
    <Route path="/team" element={<TeamHub />} />
    <Route path="/team/:tab" element={<TeamSection />} />
    <Route path="/player/:pid" element={<Player />} />
    <Route path="/compare" element={<Compare />} />
  </>
);
