// NBA.com's league schedule (scheduleLeagueV2_1.json) → the seed's compact schedule:
// one "day:AWY@HOM" string per regular-season game, day 0 = Oct 20 of the season's first year
// (the game's calendar, see dayToDate). Cup knockout games are still placeholders without
// teams, and the extra games for teams knocked out of the Cup aren't published yet; the game
// fills those in at league creation (src/core/league/schedule.ts realSchedule).
import type { SeedSchedule } from '../../../src/core/league/create';
import { seasonLabel } from '../../../src/core/constants';
import { teamByCode, tricodeOf } from './teams';

interface NbaGame {
  gameId: string;
  gameDateEst: string;
  homeTeam: { teamTricode: string };
  awayTeam: { teamTricode: string };
}

export interface ScheduleParse {
  schedule: SeedSchedule;
  /** Regular-season games without teams yet (Cup knockouts). */
  placeholders: number;
}

export const dayZero = (season: number) => Date.UTC(season - 1, 9, 20);

/** Season day of an ISO date (YYYY-MM-DD...). */
export function dayOf(season: number, iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - dayZero(season)) / 86_400_000);
}

export function parseNbaSchedule(json: unknown, season: number): ScheduleParse | null {
  const ls = (json as { leagueSchedule?: { seasonYear?: string; gameDates?: { games: NbaGame[] }[] } }).leagueSchedule;
  if (!ls?.gameDates || ls.seasonYear !== seasonLabel(season)) return null;
  const games: { day: number; id: string; s: string }[] = [];
  let placeholders = 0;
  for (const gd of ls.gameDates) {
    for (const g of gd.games) {
      if (!g.gameId.startsWith('002')) continue; // 001 preseason, 004+ postseason, 006 Cup final
      const home = teamByCode(g.homeTeam.teamTricode || '');
      const away = teamByCode(g.awayTeam.teamTricode || '');
      if (!home || !away) {
        placeholders++;
        continue;
      }
      const day = dayOf(season, g.gameDateEst);
      games.push({ day, id: g.gameId, s: `${day}:${tricodeOf(away)}@${tricodeOf(home)}` });
    }
  }
  games.sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const start = new Date(dayZero(season)).toISOString().slice(0, 10);
  return { schedule: { season, start, games: games.map((g) => g.s) }, placeholders };
}
