// NBA.com's league schedule (scheduleLeagueV2_1.json) → the seed's compact schedule:
// one "day:AWY@HOM" string per regular-season game, day 0 = Oct 20 of the season's first year
// (the game's calendar, see dayToDate), plus the NBA Cup: its groups, which games are group games,
// and the knockout dates. Cup knockout games are still placeholders without teams, and the extra
// games for teams knocked out of the Cup aren't published yet; the game schedules those as the Cup
// plays out (src/core/league/cup.ts).
import type { SeedSchedule } from '../../../src/core/league/create';
import { seasonLabel } from '../../../src/core/constants';
import { teamByCode, tricodeOf } from './teams';

interface NbaGame {
  gameId: string;
  gameDateEst: string;
  gameLabel?: string;
  gameSubLabel?: string;
  gameSubtype?: string;
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
  const groups: Record<string, Set<string>> = {};
  const groupGames: string[] = [];
  const knockout: Record<'qf' | 'sf' | 'final', number[]> = { qf: [], sf: [], final: [] };
  for (const gd of ls.gameDates) {
    for (const g of gd.games) {
      const day = dayOf(season, g.gameDateEst);
      const sub = g.gameSubLabel ?? '';
      if (g.gameSubtype === 'in-season-knockout') {
        const round = /quarter/i.test(sub) ? 'qf' : /semi/i.test(sub) ? 'sf' : /champ/i.test(sub) ? 'final' : null;
        if (round) knockout[round].push(day);
      }
      if (!g.gameId.startsWith('002')) continue; // 001 preseason, 004+ postseason, 006 Cup final
      const home = teamByCode(g.homeTeam.teamTricode || '');
      const away = teamByCode(g.awayTeam.teamTricode || '');
      if (!home || !away) {
        placeholders++;
        continue;
      }
      const str = `${day}:${tricodeOf(away)}@${tricodeOf(home)}`;
      games.push({ day, id: g.gameId, s: str });
      // "East Group A" → "East A"
      const grp = g.gameSubtype === 'in-season' && sub.match(/^(East|West) Group ([A-Z])$/);
      if (grp) {
        const id = `${grp[1]} ${grp[2]}`;
        (groups[id] ??= new Set()).add(tricodeOf(home)).add(tricodeOf(away));
        groupGames.push(str);
      }
    }
  }
  games.sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const start = new Date(dayZero(season)).toISOString().slice(0, 10);
  const schedule: SeedSchedule = { season, start, games: games.map((g) => g.s) };
  const qf = [...new Set(knockout.qf)].sort((a, b) => a - b);
  const sf = [...new Set(knockout.sf)];
  const fin = [...new Set(knockout.final)];
  // only a complete Cup: six groups of five, 60 group games, two quarterfinal nights, one semifinal and one final night
  if (Object.keys(groups).length === 6 && Object.values(groups).every((g) => g.size === 5) && groupGames.length === 60 && qf.length === 2 && sf.length === 1 && fin.length === 1) {
    schedule.cup = {
      groups: Object.fromEntries(
        Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, set]) => [id, [...set].sort()]),
      ),
      games: groupGames.sort(),
      qf: [qf[0], qf[1]],
      sf: sf[0],
      final: fin[0],
    };
  }
  return { schedule, placeholders };
}
