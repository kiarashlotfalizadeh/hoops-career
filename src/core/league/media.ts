// The league's press: power rankings, weekly and monthly honors, the season's predictions,
// columns on trades and starts, and the stories of other teams' big games (see world.ts).
import type { League, ScheduledGame } from '../types';

/**
 * A weekly or monthly honor, by conference where the league names two: Player of the Week, Player,
 * Rookie and Coach of the Month. A coach's honor names his team (`tid`) and no player.
 */
export interface Honor {
  season: number;
  /** The day it was announced. */
  day: number;
  kind: 'potw' | 'potm' | 'rotm' | 'cotm';
  conf?: 'E' | 'W';
  tid: number;
  pid?: number;
  /** Why, in one line ("31.5 points a game as the Knicks went 4-0"). */
  line: string;
}

/** One team in a week's power rankings. */
export interface PowerRow {
  tid: number;
  rank: number;
  /** Last week's rank, if there was one. */
  prev?: number;
  /** The press's line on them. */
  blurb: string;
}

export interface MediaState {
  /** This season's and last season's honors, oldest first (the user's coach honors are kept for good by legacy.ts). */
  honors?: Honor[];
  /** The latest power rankings. */
  power?: { season: number; day: number; rows: PowerRow[] };
}

/** The latest power rankings, if this season has had any. */
export function latestPower(league: League): PowerRow[] | null {
  const p = league.media?.power;
  return p && p.season === league.season ? p.rows : null;
}

export function mediaGame(league: League, g: ScheduledGame) {
  void league;
  void g;
}

export function mediaDay(league: League) {
  void league;
}

export function mediaSeasonStart(league: League) {
  void league;
}

export function mediaSeasonEnd(league: League) {
  void league;
}
