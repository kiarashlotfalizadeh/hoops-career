// Team: who plays and how. The hub's sections are /team (the roster), /team/rotation,
// /team/tactics (its own sections under it: /team/tactics/instructions, /match, /analysis) and
// /team/lineups; a player's page and the comparison sit under it.
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';
import { lazyRetry } from '../lazyRetry';

const TeamHub = lazyRetry(() => import('../team/TeamHub'));
const PlayerView = lazyRetry(() => import('../screens/PlayerView'));
const Compare = lazyRetry(() => import('../screens/Compare'));

/**
 * The screen a path shows, for what keeps it mounted (App's screen boundary): Tactics' sections are
 * one screen, so moving between them keeps its visit (its Undo, and the change measured once it ends).
 */
export const screenKey = (path: string) => path.replace(/^\/team\/tactics\/[^/]*$/, '/team/tactics');

/** Tactics' own sections: the paths under /team/tactics (Tactic is /team/tactics itself). */
const TACTICS_SUBS = ['instructions', 'match', 'analysis'];

/**
 * /team/12 was another team's page before the redesign: those live at /teams/:tid now. Only Tactics
 * has sections of its own; any other path under a section opens the section.
 */
function TeamSection() {
  const { tab = '', sub } = useParams();
  const { search } = useLocation();
  if (/^\d+$/.test(tab)) return <Navigate to={`/teams/${tab}`} replace />;
  if (sub !== undefined && !(tab === 'tactics' && TACTICS_SUBS.includes(sub))) return <Navigate to={`/team/${tab}${search}`} replace />;
  return <TeamHub />;
}

function Player() {
  const { pathname } = useLocation();
  return <PlayerView key={pathname} />;
}

export const teamRoutes = (
  <>
    <Route path="/team" element={<TeamHub />} />
    {/* (one route for both: moving between Tactics' sections keeps the hub, and the visit, as it is) */}
    <Route path="/team/:tab/:sub?" element={<TeamSection />} />
    <Route path="/player/:pid" element={<Player />} />
    <Route path="/compare" element={<Compare />} />
  </>
);
