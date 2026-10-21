// A game as a story: its headline, its hero, what it meant, and the user's games written up as news (see world.ts).
import type { League, ScheduledGame } from '../types';

/** A finished game told as a story, from one team's side. */
export interface GameStory {
  gid: number;
  /** The headline ("Brunson's 41 sinks Boston at the buzzer"). */
  head: string;
  /** The line under it. */
  dek: string;
  /** The player of the game, for his jersey. */
  hero?: number;
  /** What it means, in short lines ("Third straight win", "Up to 4th in the East", "First win at TD Garden since 2024"). */
  means: string[];
}

/** The story of a finished game (`gid`) from `tid`'s side (the user's team by default), or null if it isn't on record. */
export function gameStoryFor(league: League, gid: number, tid = league.userTid): GameStory | null {
  void league;
  void gid;
  void tid;
  return null;
}

/** After every game: the user's games go in the news as stories. */
export function storyGame(league: League, g: ScheduledGame) {
  void league;
  void g;
}
