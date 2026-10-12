// Opening-night extras: the real 2026-27 schedule, future draft-pick ownership, current
// injuries and two-way contracts. All are plain files on hosts that download from anywhere
// (raw.githubusercontent.com, GitHub releases, NBA.com's public S3 bucket), cached in
// data/raw/extra/.
import { join } from 'node:path';
import { seasonLabel } from '../../../src/core/constants';
import { SEED_SEASON } from '../sources';

// follows HC_RAW_DIR (the offline fixture build) unless HC_EXTRA_DIR says otherwise
export const EXTRA_RAW = process.env.HC_EXTRA_DIR ?? join(process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw'), 'extra');

/**
 * calebcpratt-git/nba-roster-builder refreshes its scraped snapshots daily (pick ownership from
 * RealGM, contracts from SalarySwish). Pinned so a rebuild is reproducible; bump it (resolve with
 * `git ls-remote https://github.com/calebcpratt-git/nba-roster-builder HEAD`) to pick up trades.
 */
export const ROSTER_BUILDER_SHA = '8279a506883ef21886729f6c458088ea6281d619';
const ROSTER_BUILDER = `https://raw.githubusercontent.com/calebcpratt-git/nba-roster-builder/${ROSTER_BUILDER_SHA}/snapshots/scraped`;

export interface ExtraFile {
  key: string; // cache file name in data/raw/extra/
  url: string;
  what: string;
  optional?: boolean;
}

export const EXTRA_FILES: ExtraFile[] = [
  {
    key: 'schedule.json',
    url: 'https://nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/staticData/scheduleLeagueV2_1.json',
    what: `NBA.com ${seasonLabel(SEED_SEASON)} league schedule`,
  },
  { key: 'draft-picks.json', url: `${ROSTER_BUILDER}/draft-picks.json`, what: 'future draft-pick ownership (RealGM via nba-roster-builder)' },
  { key: 'players.json', url: `${ROSTER_BUILDER}/players.json`, what: 'contracts incl. two-way deals (SalarySwish via nba-roster-builder)' },
  // hourly mirror of ESPN's injury report; deliberately unpinned so a refetch gets today's list
  { key: 'injuries.json', url: 'https://raw.githubusercontent.com/BenoParadise/nba-injuries/main/data.json', what: 'ESPN injury report (hourly mirror)' },
  {
    key: `injuries_${SEED_SEASON}.parquet`,
    url: `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_injuries/injuries_${SEED_SEASON}.parquet`,
    what: 'ESPN injury history (sportsdataverse), backup for injuries.json',
    optional: true,
  },
  {
    key: 'draft-picks-ldsport.py',
    url: 'https://raw.githubusercontent.com/tobeyhirsch/nba-draft-pick-grader/main/src/draft_picks_data.py',
    what: 'LD Sport pick table (cross-check only)',
    optional: true,
  },
];

export const extraPath = (key: string) => join(EXTRA_RAW, key);
