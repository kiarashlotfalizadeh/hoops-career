// Basketball Reference pages used to build the seed. Seasons are named by end year
// (NBA_2026 = 2025-26). The game starts in 2026-27 (season 2027).

export const BASE = 'https://www.basketball-reference.com';
/** The season the game starts in; every other season here counts back from it. */
export const SEED_SEASON = 2027;
/** The three seasons of stats before it, oldest first. */
export const STAT_SEASONS = [SEED_SEASON - 3, SEED_SEASON - 2, SEED_SEASON - 1];
export const ROSTER_SEASONS = [SEED_SEASON, SEED_SEASON - 1];
// 2003..2026: back to the longest-serving player's draft (LeBron James, 2003); a player who entered
// the league earlier would have no draft row and be seeded as undrafted
export const DRAFT_YEARS = Array.from({ length: SEED_SEASON - 2003 }, (_, i) => 2003 + i);

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
}

export function allSources(): Source[] {
  const out: Source[] = [];
  out.push({ key: 'contracts', url: `${BASE}/contracts/players.html` });
  for (const s of STAT_SEASONS) {
    out.push({ key: `per_game_${s}`, url: `${BASE}/leagues/NBA_${s}_per_game.html` });
    out.push({ key: `advanced_${s}`, url: `${BASE}/leagues/NBA_${s}_advanced.html` });
  }
  for (const s of ROSTER_SEASONS) for (const t of TEAM_CODES) out.push({ key: `roster_${t}_${s}`, url: `${BASE}/teams/${t}/${s}.html`, optional: true });
  for (const y of DRAFT_YEARS) out.push({ key: `draft_${y}`, url: `${BASE}/draft/NBA_${y}.html`, optional: true });
  return out;
}
