// A game's report: the final, then Recap (your games: the stars, the keys, the night, the press
// conference), Why (what decided it), Box, Shots and Flow (win probability, the margin and the
// play-by-play). Each tab is its own module under report/.
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useLeague } from '../../state/store';
import { buildGameReport } from '../../core/analysis/gameReport';
import { Empty, PageHeader } from '../components/ui';
import { matchupColors } from '../teamColors';
import { FinalSlab, GameRecap } from '../components/GameRecap';
import { HighlightsCard } from '../components/HighlightsCard';
import { TabBar, useQueryParam } from '../league/shared';
import { WhyTab } from './report/WhyTab';
import { BoxTab } from './report/BoxTab';
import { ShotsTab } from './report/ShotsTab';
import { FlowTab } from './report/FlowTab';
import '../components/gameday.css';
import './games.css';

type Tab = 'recap' | 'report' | 'box' | 'shots' | 'flow' | 'pbp';

export default function GameReport() {
  const league = useLeague();
  const { gid } = useParams();
  const g = league.games.find((x) => x.gid === Number(gid));
  const userGame = !!g && (g.home.tid === league.userTid || g.away.tid === league.userTid);
  const report = useMemo(() => (g && userGame && g.impacts ? buildGameReport(league, g) : null), [g, userGame, league]);
  // your games open on their recap (the result, the stars, the keys); the Why is a tab away
  const [picked, setTab] = useQueryParam<Tab>('tab', userGame ? 'recap' : 'box', ['recap', 'report', 'box', 'shots', 'flow', 'pbp']);
  if (!g) {
    return (
      <main className="page">
        <PageHeader title="Game" back backTo="/games" />
        <Empty>This game is no longer stored. Detailed results are kept for the current season.</Empty>
      </main>
    );
  }
  const home = league.teams[g.home.tid];
  const away = league.teams[g.away.tid];
  const tabs: { id: Tab; label: string }[] = [
    ...(userGame ? [{ id: 'recap' as Tab, label: 'Recap' }] : []),
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
  return (
    <main className="page gv">
      <PageHeader title="Game report" back backTo="/games" />
      <FinalSlab res={g} league={league} />
      {tabs.length > 1 && <TabBar value={tab} onChange={setTab} options={tabs} label="Game report sections" />}
      {tab === 'recap' && userGame && (
        <GameRecap res={g} league={league} report={report} highlights={league.reel?.gid === g.gid ? <HighlightsCard league={league} res={g} /> : undefined} />
      )}
      {tab === 'report' && report && <WhyTab g={g} league={league} report={report} />}
      {tab === 'box' && <BoxTab g={g} league={league} userGame={userGame} colors={colors} />}
      {tab === 'shots' && g.shots && <ShotsTab g={g} league={league} userGame={userGame} accentSide={accentSide} />}
      {tab === 'flow' && <FlowTab g={g} league={league} side={userGame ? accentSide : 0} kits={matchupColors(home.colors, away.colors)} />}
    </main>
  );
}
