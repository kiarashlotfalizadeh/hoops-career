// Who the staff favours before a game, in words: "OKC · Slight favorite", or "Toss-up". Every pre-game
// screen says it this way and never the figure (core/analysis/staffWords.ts).
import type { League } from '../../core/types';
import { oddsWord } from '../../core/analysis/staffWords';

/** A game's favourite and how much of one, from the home side's chance to win (`abbrev` is empty for a toss-up). */
export function favoriteOf(league: League, g: { home: number; away: number }, homeWin: number): { abbrev: string; word: string; line: string } {
  const word = oddsWord(Math.max(homeWin, 1 - homeWin));
  if (word === 'Toss-up') return { abbrev: '', word, line: word };
  const abbrev = league.teams[homeWin >= 0.5 ? g.home : g.away].abbrev;
  return { abbrev, word, line: `${abbrev} · ${word}` };
}
