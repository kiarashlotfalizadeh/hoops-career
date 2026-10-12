// NBA.com data (play-by-play from cdn.nba.com and season matchups from stats.nba.com), as
// archived by the public shufinskiy/nba_data dataset on GitHub, plus ESPN college stats from
// sportsdataverse/hoopR-mbb-data. Both are plain files on raw.githubusercontent.com, so they
// download from anywhere (stats.nba.com itself blocks cloud IPs).
//
// Dataset files are named by the season's start year (cdnnba_2025 = 2025-26); the game names
// seasons by end year (2026), like Basketball Reference.
import { SEED_SEASON, STAT_SEASONS } from '../sources';

export const NBA_DATA = 'https://raw.githubusercontent.com/shufinskiy/nba_data/main/datasets';
export const NCAA_DATA = 'https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb';

/** Seasons (end year) with play-by-play and matchup data: the same three as the box scores. */
export const PBP_SEASONS = STAT_SEASONS;
/** College seasons (end year) for incoming rookies and last year's draftees. */
export const COLLEGE_SEASONS = [SEED_SEASON - 1, SEED_SEASON - 2];

export interface NbaFile {
  key: string; // cache name
  url: string;
  kind: 'pbp' | 'matchups' | 'college';
  season: number;
}

export function nbaFiles(): NbaFile[] {
  const out: NbaFile[] = [];
  for (const s of PBP_SEASONS) {
    out.push({ key: `cdnnba_${s - 1}.tar.xz`, url: `${NBA_DATA}/cdnnba_${s - 1}.tar.xz`, kind: 'pbp', season: s });
    out.push({ key: `matchups_${s - 1}.tar.xz`, url: `${NBA_DATA}/matchups_${s - 1}.tar.xz`, kind: 'matchups', season: s });
  }
  for (const y of COLLEGE_SEASONS) out.push({ key: `ncaa_player_box_${y}.parquet`, url: `${NCAA_DATA}/player_box/parquet/player_box_${y}.parquet`, kind: 'college', season: y });
  return out;
}
