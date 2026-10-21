// The user's coaching legacy: career milestones, honors, signature wins and the season's review (see world.ts).
import type { League, ScheduledGame } from '../types';

export interface LegacyState {
  /** Placeholder: the legacy's own state goes here. */
  v?: number;
}

export function legacyGame(league: League, g: ScheduledGame) {
  void league;
  void g;
}

export function legacyDay(league: League) {
  void league;
}

export function legacySeasonEnd(league: League) {
  void league;
}
