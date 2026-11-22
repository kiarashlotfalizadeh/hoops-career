// A game's report: the final score is the hero (the board; the first showing counts it up), then
// the tabs: Summary (your games, numbers first: what the schemes, the shooting luck and your moves
// were worth, what decided it in points, the four factors, your coaching and every player's grade),
// Box (the linescore and both box scores), Shots and Flow (win probability, the margin and the
// play-by-play). Each tab is its own module under report/.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague } from '../../state/store';
import { GameTop, useFirstShowing } from './occasion';
import { buildGameReport } from '../../core/analysis/gameReport';
import { Empty, PageHeader } from '../components/ui';
import { boardColors, FinalSlab } from '../components/FinalSlab';
import { ShareButton } from '../share/ShareButton';
import { gamePosterOf, posterFile } from '../share/specs';
import { HighlightsCard } from '../components/HighlightsCard';
import { TabBar, useQueryParam } from '../league/shared';
import { SummaryTab } from './report/SummaryTab';
import { BoxTab } from './report/BoxTab';
import { ShotsTab } from './report/ShotsTab';
import { FlowTab } from './report/FlowTab';
import '../components/gameday.css';

type Tab = 'summary' | 'box' | 'shots' | 'flow';
/** Tabs a link from before the report had a Summary may name: the Debrief and the Why are it, the play-by-play is under Flow. */
const OLD_TAB: Record<string, Tab> = { recap: 'summary', report: 'summary', pbp: 'flow' };

export default function GameReport() {
  const league = useLeague();
  const { gid } = useParams();
  const g = league.games.find((x) => x.gid === Number(gid));
  const userGame = !!g && (g.home.tid === league.userTid || g.away.tid === league.userTid);
  const report = useMemo(() => (g && userGame && g.impacts ? buildGameReport(league, g) : null), [g, userGame, league]);
  // your games open on their summary; anyone else's on the box score
  const [raw, setTab] = useQueryParam<Tab | keyof typeof OLD_TAB>('tab', userGame ? 'summary' : 'box', ['summary', 'box', 'shots', 'flow', ...Object.keys(OLD_TAB)]);
  const picked: Tab = OLD_TAB[raw] ?? (raw as Tab);
  const moment = useFirstShowing(g && userGame ? `${league.id}:${g.gid}` : undefined);
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
    ...(userGame ? [{ id: 'summary' as Tab, label: 'Summary' }] : []),
    { id: 'box', label: 'Box' },
    ...(g.shots?.length ? [{ id: 'shots' as Tab, label: 'Shots' }] : []),
    ...(g.flow?.length || g.pbp?.length ? [{ id: 'flow' as Tab, label: 'Flow' }] : []),
  ];
  // a tab this game doesn't have (a link from another game's report) opens the first it has
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0].id;
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
          <span className="row" style={{ gap: 10 }}>
            {/* the final as a picture, one tap */}
            <ShareButton
              className="btn xs ghost"
              spec={() => gamePosterOf(league, g)}
              file={posterFile(`${league.teams[g.away.tid].abbrev} ${league.teams[g.home.tid].abbrev} ${g.gid}`)}
              title="The final"
            />
            {opp !== undefined && (
              <Link to={`/games/${opp}`} className="card-link">
                Matchup <ChevronRight size={14} aria-hidden="true" />
              </Link>
            )}
          </span>
        }
      />
      {/* the full board on the first tab; on the others it is one line, so the tab's own content starts on the first screen */}
      <FinalSlab res={g} league={league} moment={moment} compact={tab !== tabs[0].id} />
      {tabs.length > 1 && <TabBar value={tab} onChange={setTab} options={tabs} label="Game report sections" />}
      {tab === 'summary' && userGame && (
        <SummaryTab res={g} league={league} report={report} highlights={league.reel?.gid === g.gid ? <HighlightsCard league={league} res={g} /> : undefined} />
      )}
      {tab === 'box' && <BoxTab g={g} league={league} userGame={userGame} colors={colors} />}
      {tab === 'shots' && g.shots && <ShotsTab g={g} league={league} />}
      {tab === 'flow' && <FlowTab g={g} league={league} side={userGame ? accentSide : 0} kits={boardColors(league, g)} />}
    </main>
  );
}
