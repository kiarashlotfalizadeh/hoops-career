// Games: your schedule, a matchup page per opponent (/games/:tid: the preview on game day, scouting,
// the game plan and matchups), the live game and its reports.
import { Navigate, Route, useLocation, useParams } from 'react-router-dom';
import { useLeague } from '../../state/store';
import { nextUserGame } from '../../core/analysis/preview';
import { lazyRetry } from '../lazyRetry';

const GamesHub = lazyRetry(() => import('../games/GamesHub'));
const Matchup = lazyRetry(() => import('../games/Matchup'));
const Live = lazyRetry(() => import('../screens/Live'));
const GameReport = lazyRetry(() => import('../games/GameReport'));

function MatchupPage() {
  const { pathname } = useLocation();
  return <Matchup key={pathname} />;
}

/** Each visit sets up its own game: "Watch & coach live" from a finished game's card mounts a fresh one. */
function LivePage() {
  const { key } = useLocation();
  return <Live key={key} />;
}

/**
 * The pre-game screen is the matchup page's Preview now: /preview/:gid opens it for that game's
 * opponent (its report once it's played), /preview the user's next game's.
 */
function PreviewRedirect() {
  const league = useLeague();
  const { gid } = useParams();
  const g = gid !== undefined ? league.schedule.find((x) => x.gid === Number(gid)) : nextUserGame(league);
  if (g && g.played) return <Navigate to={`/game/${g.gid}`} replace />;
  const me = league.userTid;
  if (!g || (g.home !== me && g.away !== me)) return <Navigate to="/games" replace />;
  return <Navigate to={`/games/${g.home === me ? g.away : g.home}?tab=preview`} replace />;
}

export const gamesRoutes = (
  <>
    <Route path="/games" element={<GamesHub />} />
    <Route path="/games/:tid" element={<MatchupPage />} />
    <Route path="/preview/:gid?" element={<PreviewRedirect />} />
    <Route path="/live" element={<LivePage />} />
    <Route path="/game/:gid" element={<GameReport />} />
    {/* the Tactics Lab was retired: old links go to Tactics */}
    <Route path="/lab" element={<Navigate to="/team/tactics" replace />} />
  </>
);
