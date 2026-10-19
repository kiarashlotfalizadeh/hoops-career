// Basketball Reference pages used to build the seed. Seasons are named by end year
// (NBA_2026 = 2025-26). The game starts in 2026-27 (season 2027).

export const BASE = 'https://www.basketball-reference.com';
/** The season the game starts in; every other season here counts back from it. */
export const SEED_SEASON = 2027;
/** The three seasons of stats before it, oldest first. */
export const STAT_SEASONS = [SEED_SEASON - 3, SEED_SEASON - 2, SEED_SEASON - 1];
export const ROSTER_SEASONS = [SEED_SEASON, SEED_SEASON - 1];
/**
 * The longest-serving player's rookie season (LeBron James, 2003-04): every player's draft and every
 * NBA season since are on record. A player who entered the league earlier would have no draft row
 * (seeded as undrafted) and only part of his career.
 */
export const FIRST_SEASON = 2004;
/** The seasons before the stat seasons, from FIRST_SEASON: each player's career on record, never his ratings. */
export const HISTORY_SEASONS = Array.from({ length: STAT_SEASONS[0] - FIRST_SEASON }, (_, i) => FIRST_SEASON + i);
// 2003..2026
export const DRAFT_YEARS = Array.from({ length: SEED_SEASON - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON - 1 + i);

export const TEAM_CODES = [
  'ATL',
  'BOS',
  'BRK',
  'CHO',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHO',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
];

export interface Source {
  key: string; // cache file name
  url: string;
  optional?: boolean;
  /** Changes through the offseason (signings, trades): re-fetched with --refresh even when cached. */
  volatile?: boolean;
}

/** A team's roster page for a season, under the code it had then (SEA for 2007-08). */
export function rosterSource(team: string, season: number): Source {
  return { key: `roster_${team}_${season}`, url: `${BASE}/teams/${team}/${season}.html`, optional: true };
}

export function allSources(): Source[] {
  const out: Source[] = [];
  out.push({ key: 'contracts', url: `${BASE}/contracts/players.html`, volatile: true });
  for (const s of STAT_SEASONS) {
    out.push({ key: `per_game_${s}`, url: `${BASE}/leagues/NBA_${s}_per_game.html` });
    out.push({ key: `advanced_${s}`, url: `${BASE}/leagues/NBA_${s}_advanced.html` });
  }
  for (const s of ROSTER_SEASONS) for (const t of TEAM_CODES) out.push({ ...rosterSource(t, s), volatile: s === SEED_SEASON });
  for (const y of DRAFT_YEARS) out.push({ key: `draft_${y}`, url: `${BASE}/draft/NBA_${y}.html`, optional: true });
  // last: a run cut short by rate limits has the pages ratings need first
  for (const s of HISTORY_SEASONS) {
    out.push({ key: `per_game_${s}`, url: `${BASE}/leagues/NBA_${s}_per_game.html` });
    out.push({ key: `advanced_${s}`, url: `${BASE}/leagues/NBA_${s}_advanced.html` });
  }
  return out;
}
