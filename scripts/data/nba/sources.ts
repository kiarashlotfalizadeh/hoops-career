// NBA.com season matchups (stats.nba.com tracking: who guarded whom), as archived by the public
// shufinskiy/nba_data dataset on GitHub, plus ESPN college stats from sportsdataverse/hoopR-mbb-data.
// Both are plain files on raw.githubusercontent.com, so they download from anywhere (stats.nba.com
// itself blocks cloud IPs). The play-by-play comes with the game files (games/sources.ts).
//
// Dataset files are named by the season's start year (matchups_2025 = 2025-26); the game names
// seasons by end year (2026), like Basketball Reference.
import { SEED_SEASON, STAT_SEASONS } from '../sources';

export const NBA_DATA = 'https://raw.githubusercontent.com/shufinskiy/nba_data/main/datasets';
export const NCAA_DATA = 'https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb';

/** Seasons (end year) with play-by-play profiles and matchup data: the same three the ratings come from. */
export const PBP_SEASONS = STAT_SEASONS;
/** College seasons (end year) for incoming rookies and last year's draftees. */
export const COLLEGE_SEASONS = [SEED_SEASON - 1, SEED_SEASON - 2];

export interface NbaFile {
  key: string; // cache name
  url: string;
  kind: 'matchups' | 'college';
  season: number;
}

export function nbaFiles(): NbaFile[] {
  const out: NbaFile[] = [];
  for (const s of PBP_SEASONS) out.push({ key: `matchups_${s - 1}.tar.xz`, url: `${NBA_DATA}/matchups_${s - 1}.tar.xz`, kind: 'matchups', season: s });
  for (const y of COLLEGE_SEASONS) out.push({ key: `ncaa_player_box_${y}.parquet`, url: `${NCAA_DATA}/player_box/parquet/player_box_${y}.parquet`, kind: 'college', season: y });
  return out;
}
