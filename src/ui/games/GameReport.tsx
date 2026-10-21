// A game's report: the final score is the hero (the board; the first showing counts it up), then for
// your games the night's story (the headline, the player of the game, what it means), then the tabs:
// Debrief (your games: the staff's verdict, your moves and what to do next time, the keys, then the
// stars, the night, what was said and the other scores a tap each), Why (what decided it), Box (the
// linescore and both box scores), Shots and Flow (win probability, the margin and the play-by-play).
// Each tab is its own module under report/.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { gameStoryFor } from '../../core/analysis/gameStory';
import { GameTop, useFirstShowing } from './occasion';
import { buildGameReport } from '../../core/analysis/gameReport';
import { Empty, PageHeader } from '../components/ui';
import { GameRecap } from '../components/GameRecap';
import { boardColors, FinalSlab } from '../components/FinalSlab';
import { HighlightsCard } from '../components/HighlightsCard';
import { TabBar, useQueryParam } from '../league/shared';
import { WhyTab } from './report/WhyTab';
import { BoxTab } from './report/BoxTab';
import { ShotsTab } from './report/ShotsTab';
import { FlowTab } from './report/FlowTab';
import '../components/gameday.css';

type Tab = 'recap' | 'report' | 'box' | 'shots' | 'flow' | 'pbp';

export default function GameReport() {
  const league = useLeague();
  const { gid } = useParams();
  const g = league.games.find((x) => x.gid === Number(gid));
  const userGame = !!g && (g.home.tid === league.userTid || g.away.tid === league.userTid);
  const report = useMemo(() => (g && userGame && g.impacts ? buildGameReport(league, g) : null), [g, userGame, league]);
  // your games open on their recap (the result, the stars, the keys); the Why is a tab away
  const [picked, setTab] = useQueryParam<Tab>('tab', userGame ? 'recap' : 'box', ['recap', 'report', 'box', 'shots', 'flow', 'pbp']);
  const story = useLeagueMemo(() => (g && userGame ? gameStoryFor(league, g.gid) : null), [league, g, userGame]);
  const moment = useFirstShowing(story ? `${league.id}:${story.gid}` : undefined);
  if (!g) {
    return (
      <main className="page">
        <PageHeader title="Game" back backTo="/games" />
        {/* (in a card, as a missing player's page has it) */}
        <div className="card">
          <Empty>This game is no longer stored. Detailed results are kept for the current season.</Empty>
        </div>
      </main>
    );
  }
  const tabs: { id: Tab; label: string }[] = [
    ...(userGame ? [{ id: 'recap' as Tab, label: 'Debrief' }] : []),
    ...(report ? [{ id: 'report' as Tab, label: 'Why' }] : []),
    { id: 'box', label: 'Box' },
    ...(g.shots?.length ? [{ id: 'shots' as Tab, label: 'Shots' }] : []),
    ...(g.flow?.length || g.pbp?.length ? [{ id: 'flow' as Tab, label: 'Flow' }] : []),
  ];
  // the play-by-play is under Flow; a tab this game doesn't have (a link from another game's report) opens the first it has
  const want = picked === 'pbp' ? 'flow' : picked;
  const tab = tabs.some((t) => t.id === want) ? want : tabs[0].id;
  // the user's team carries the accent in two-team comparisons, wherever it played (side 0 = home);
  // between two other teams neither side does, and the charts take the home team's view
  const accentSide: 0 | 1 = userGame && g.home.tid === league.userTid ? 0 : 1;
  const colors: [string, string] = !userGame
    ? ['var(--text-dim)', 'var(--text-dim)']
    : accentSide === 0
      ? ['var(--text-dim)', 'var(--accent)']
      : ['var(--accent)', 'var(--text-dim)'];
  const opp = userGame ? (g.home.tid === league.userTid ? g.away.tid : g.home.tid) : undefined;
  return (
    <main className="page gv">
      <GameTop
        title="Game report"
        backTo="/games"
        right={
          opp !== undefined && (
            <Link to={`/games/${opp}`} className="card-link">
              Matchup <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )
        }
      />
      <FinalSlab res={g} league={league} story={story} moment={moment} />
      {tabs.length > 1 && <TabBar value={tab} onChange={setTab} options={tabs} label="Game report sections" />}
      {tab === 'recap' && userGame && (
        <GameRecap res={g} league={league} report={report} highlights={league.reel?.gid === g.gid ? <HighlightsCard league={league} res={g} /> : undefined} />
      )}
      {tab === 'report' && report && <WhyTab g={g} league={league} report={report} />}
      {tab === 'box' && <BoxTab g={g} league={league} userGame={userGame} colors={colors} />}
      {tab === 'shots' && g.shots && <ShotsTab g={g} league={league} />}
      {tab === 'flow' && <FlowTab g={g} league={league} side={userGame ? accentSide : 0} kits={boardColors(league, g)} />}
    </main>
  );
}
