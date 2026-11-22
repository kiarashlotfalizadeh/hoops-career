// Who is favoured before a game, as a figure: "OKC 62%". Every pre-game screen says it this way
// (core/analysis/staffWords.ts: a chance to win is a fact about the two teams, not a forecast of a choice).
import type { League } from '../../core/types';
import { winPct } from '../../core/analysis/staffWords';

/** A game's favourite and its chance to win, from the home side's (`line`: "OKC 62%"; an even game names the home side at 50%). */
export function favoriteOf(league: League, g: { home: number; away: number }, homeWin: number): { abbrev: string; pct: string; line: string } {
  const home = homeWin >= 0.5;
  const abbrev = league.teams[home ? g.home : g.away].abbrev;
  const pct = winPct(home ? homeWin : 1 - homeWin);
  return { abbrev, pct, line: `${abbrev} ${pct}` };
}
