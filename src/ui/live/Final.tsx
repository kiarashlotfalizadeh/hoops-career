// The live screen with no game on: no game for your team today (and the way to the next one), or the
// final card (the result with Game report and Next game, which names it) over the night's recap.
import { Activity, ChevronsRight } from 'lucide-react';
import type { GameResult, League, Team } from '../../core/types';
import { Empty, PageHeader } from '../components/ui';
import { GameRecap } from '../components/GameRecap';
import { FinalSlab } from '../components/FinalSlab';
import { HighlightsCard } from '../components/HighlightsCard';
import { stillAlive } from '../flow';

/** No game for your team today: why, and Sim to next game (named: `next`) when there is one to sim to. */
export function NoGame({ league, canSim, next, busy, onNext }: { league: League; canSim: boolean; next?: string; busy: boolean; onNext: () => void }) {
  return (
    <main className="page">
      <PageHeader title="Live" back backTo="/games" />
      <Empty>
        {league.phase === 'preseason'
          ? 'No games yet: start the regular season from Today or the Play menu.'
          : (league.phase === 'playin' || league.phase === 'playoffs') && !stillAlive(league)
            ? 'Your season is over: no more games until next season.'
            : ['regular', 'playin', 'playoffs'].includes(league.phase)
              ? 'No game for your team today.'
              : 'No games until next season.'}
        {/* (the flow's line: a game's "Thu, Oct 22 · vs DEN (3-1)", or why there's none) */}
        {canSim && next && <div className="lv-nogame-next small">{next.includes(' · ') ? `Next: ${next}` : next}</div>}
      </Empty>
      {canSim && (
        <button className="btn primary block big" disabled={busy} onClick={onNext}>
          <ChevronsRight size={18} /> Sim to next game
        </button>
      )}
    </main>
  );
}

/**
 * The final card: the result as a broadcast's final graphic, with the report (its Why, the recap
 * being here) and the next game; a game the Play menu finished says so and offers its box score.
 * `next` names the next game ("Sat, Feb 13 · vs PHI (37-19)") when there is one.
 */
export function LiveFinal({
  league,
  final,
  teams: [home, away],
  result,
  announce,
  onReport,
  next,
  busy,
  onNext,
}: {
  league: League;
  /** Coached here to the end (false: simmed from the Play menu). */
  final: boolean;
  /** [home, away]. */
  teams: [Team, Team];
  result?: GameResult;
  /** What screen readers hear (the final score). */
  announce: string;
  onReport: (gid: number) => void;
  /** There's a next game to go to, and its line, if any. */
  next?: { sub?: string };
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <main className="page lv-final">
      <h1 className="sr-only">
        {final ? 'Final' : 'Simulated'}: {away.region} {away.name} {result ? `${result.away.pts}, ` : ''}
        {home.region} {home.name}
        {result ? ` ${result.home.pts}` : ''}
      </h1>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      {result ? (
        <FinalSlab res={result} league={league}>
          {!final && <div className="lv-simmed small">Played out from the Play menu: the result stands.</div>}
          <div className="lv-final-go">
            <button className="btn primary" onClick={() => onReport(result.gid)}>
              <Activity size={16} aria-hidden="true" /> {final ? 'Game report' : 'Box score'}
            </button>
            {next && (
              <button className="btn" disabled={busy} onClick={onNext}>
                Next game <ChevronsRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {next?.sub && <div className="lv-final-next small">Next: {next.sub}</div>}
        </FinalSlab>
      ) : (
        <Empty>{final ? 'Final.' : 'This game was simulated.'}</Empty>
      )}
      {result && <GameRecap res={result} league={league} highlights={final ? <HighlightsCard league={league} res={result} /> : undefined} />}
    </main>
  );
}
