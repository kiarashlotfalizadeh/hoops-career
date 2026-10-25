// The season's chapters as Today tells them, read from the league as it stands: All-Star weekend
// (its eve, when the staff reads who is in line, then its results until the user's next game) and
// the season's end (from the night his season is over until the draft: the verdict, the owner's word,
// the season's best and its honors). Pure league reading, no React.
import type { League, Player } from '../../core/types';
import { allStarVote } from '../../core/league/awards';
import { curTeamSeason, playerName } from '../../core/league/helpers';
import { awardLine } from '../../core/league/media/history';
import { stillAlive } from '../flow';
import { lastResults } from './front';

/** Where All-Star weekend stands for Today: its eve (the vote still open), its results (until his next game), or neither. */
export function allStarPhase(l: League): 'eve' | 'after' | null {
  if (l.phase !== 'regular' || !l.allStarDay) return null;
  const aw = l.awards.find((a) => a.season === l.season);
  const named = !!aw?.allStars.E.length;
  if (!named) return l.day >= l.allStarDay - 1 && l.day <= l.allStarDay ? 'eve' : null;
  if (l.day <= l.allStarDay || !aw?.allStarGame) return null;
  // (the weekend is the news until his first game after it)
  const [last] = lastResults(l, 1);
  return !last || last.day < l.allStarDay ? 'after' : null;
}

/** One of his players in the vote: in (and as which pick), on the bubble, and his line. */
export interface AllStarRead {
  p: Player;
  status: 'in' | 'bubble';
  line: string;
}

/**
 * The staff's read on the eve: his players the vote has in as it stands tonight, and the ones just
 * behind them (the next three in the conference), from the same ranking the league names them by
 * (allStarVote). A read, not the result: the last games can move it.
 */
export function allStarRead(l: League): AllStarRead[] {
  const me = l.userTid;
  const conf = l.teams[me].conf;
  const { picks, next } = allStarVote(l);
  const out: AllStarRead[] = [];
  const line = (p: Player) => {
    const s = p.stats.find((x) => x.season === l.season && !x.playoffs && x.tid === me);
    return s?.gp ? `${(s.pts / s.gp).toFixed(1)} points, ${((s.orb + s.drb) / s.gp).toFixed(1)} rebounds and ${(s.ast / s.gp).toFixed(1)} assists a game` : '';
  };
  for (const pid of picks[conf]) if (l.players[pid]?.tid === me) out.push({ p: l.players[pid], status: 'in', line: line(l.players[pid]) });
  for (const pid of next[conf]) if (l.players[pid]?.tid === me) out.push({ p: l.players[pid], status: 'bubble', line: line(l.players[pid]) });
  return out;
}

/** The weekend's results as Today lists them: the game, its MVP, the contests, and his All-Stars. */
export function allStarResults(l: League): { head: string; lines: string[]; mine: Player[] } | null {
  const aw = l.awards.find((a) => a.season === l.season);
  const g = aw?.allStarGame;
  if (!aw || !g) return null;
  const me = l.userTid;
  const mvp = aw.allStarMvp !== undefined ? l.players[aw.allStarMvp] : undefined;
  const winner = g.east > g.west ? 'East' : 'West';
  const lines = [`${winner} ${Math.max(g.east, g.west)}-${Math.min(g.east, g.west)}${mvp ? `, MVP ${playerName(mvp)}${g.mvp ? ` (${g.mvp.pts} points)` : ''}` : ''}`];
  const three = aw.saturday?.three[0];
  const dunk = aw.saturday?.dunk[0];
  if (three && l.players[three.pid]) lines.push(`Three-Point Contest: ${playerName(l.players[three.pid])}`);
  if (dunk && l.players[dunk.pid]) lines.push(`Slam Dunk Contest: ${playerName(l.players[dunk.pid])}`);
  const mine = [...aw.allStars.E, ...aw.allStars.W].map((pid) => l.players[pid]).filter((p) => p?.tid === me);
  const first = mine[0];
  const again = first ? awardLine(l, first, 'All-Star', l.season) : null;
  const head = mine.length
    ? `${mine.length > 1 ? `${mine.length} All-Stars` : `${playerName(first)}${again && again !== 'his first' ? `, ${again} time` : ''}`} for the ${l.teams[me].name}`
    : `${winner} wins the All-Star Game`;
  return { head, lines, mine };
}

/** The user's season is over: out of the play-in or the playoffs, or the Finals done (until the draft starts). */
export function seasonOver(l: League): boolean {
  if (l.fired) return false;
  if (l.phase === 'draftLottery') return true;
  return (l.phase === 'playin' || l.phase === 'playoffs') && !stillAlive(l);
}

/** How his postseason ended, in a line: "Lost 1-4 to the Celtics in the first round", "Out in the play-in". */
export function seasonEndLine(l: League): string {
  const me = l.userTid;
  const ts = curTeamSeason(l, me);
  const lost = l.playoffs.find((s) => s.winner !== undefined && s.winner !== me && (s.high === me || s.low === me));
  if (lost) {
    const [w, ls] = lost.high === me ? [lost.highWins, lost.lowWins] : [lost.lowWins, lost.highWins];
    const round = ['', 'first round', 'second round', 'conference finals', 'Finals'][lost.round] ?? 'playoffs';
    return `Lost ${w}-${ls} to the ${l.teams[lost.winner!].name} in the ${round}.`;
  }
  if (ts.playoffRound === 5) {
    const f = l.playoffs.find((s) => s.round === 4 && s.winner === me);
    if (!f) return 'Champions.';
    const [w, ls] = f.high === me ? [f.highWins, f.lowWins] : [f.lowWins, f.highWins];
    return `${w}-${ls} over the ${l.teams[f.high === me ? f.low : f.high].name} in the Finals.`;
  }
  if (ts.playIn || ts.playoffRound === 0) return 'Out in the play-in.';
  return 'Missed the postseason.';
}
