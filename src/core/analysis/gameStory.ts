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

/** What makes a game ahead of the user's team more than a date: its billing ("Rivalry night", "Christmas Day", "Game 7"). */
export interface Billing {
  /** A short tag ("Rivalry", "Revenge game", "Christmas Day"). */
  tag: string;
  /** One line on why ("Boston knocked you out last spring; 2-1 this season"). */
  line: string;
  /** 3 a huge night, 2 a big one, 1 a little extra. */
  weight: 1 | 2 | 3;
}

/** The billing of a game not yet played, from `tid`'s side (the user's team by default), or null for an ordinary night. */
export function billingFor(league: League, g: ScheduledGame, tid = league.userTid): Billing | null {
  void league;
  void g;
  void tid;
  return null;
}

/** After every game: the user's games go in the news as stories. */
export function storyGame(league: League, g: ScheduledGame) {
  void league;
  void g;
}
