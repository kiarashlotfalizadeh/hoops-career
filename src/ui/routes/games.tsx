// Games: your schedule, a matchup page per opponent (/games/:tid: scouting, the game plan,
// matchups, the Lab, and on game day the preview), the live game and its reports.
import { Route, useLocation } from 'react-router-dom';
import { lazyRetry } from '../lazyRetry';

const GamesHub = lazyRetry(() => import('../games/GamesHub'));
const Matchup = lazyRetry(() => import('../screens/GamePlan'));
const Preview = lazyRetry(() => import('../screens/Preview'));
const Live = lazyRetry(() => import('../screens/Live'));
const GameView = lazyRetry(() => import('../screens/GameView'));
const TacticsLab = lazyRetry(() => import('../screens/TacticsLab'));

function MatchupPage() {
  const { pathname } = useLocation();
  return <Matchup key={pathname} />;
}

/** Each visit sets up its own game: "Watch & coach live" from a finished game's card mounts a fresh one. */
function LivePage() {
  const { key } = useLocation();
  return <Live key={key} />;
}

export const gamesRoutes = (
  <>
    <Route path="/games" element={<GamesHub />} />
    <Route path="/games/:tid" element={<MatchupPage />} />
    <Route path="/preview/:gid?" element={<Preview />} />
    <Route path="/live" element={<LivePage />} />
    <Route path="/game/:gid" element={<GameView />} />
    <Route path="/lab" element={<TacticsLab />} />
  </>
);
