// Turns the play-by-play of the stat seasons (read from the game files, games/playbyplay.ts) and the
// NBA.com matchup archives into per-season player profiles, matchup defense and multi-season RAPM.
// The seed builder calls buildNbaProfile() directly; each season's parsed matchups are cached as JSON
// next to the archives.
// Usage: npm run data:nba reads the game files and the archives on its own, filling their caches
// ahead of data:build, and writes the profile to data/raw/nba/nba_profile.json for inspection.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NBA_RAW } from './fetch';
import { PBP_SEASONS } from './sources';
import { FIRST_SEASON, SEED_SEASON } from '../sources';
import type { PlayerPbp } from './pbp';
import { rapm, type RapmResult } from './rapm';
import { processMatchups, type SeasonMatchups, type DefMatchup } from './matchups';
import { readPlayByPlay, type PbpData } from '../games/playbyplay';
import { readBoxScores } from '../games/boxscores';
import { IMPACT_WEIGHTS, estimateImpact } from '../games/impact';

/**
 * Recency weights for the profile's RAPM (seasons by end year), and its penalty. It is evidence, as
 * the box score is: plain RAPM over the stat seasons, shrunk toward average. The impact estimate,
 * shrunk toward a box-score prior over seven seasons, is the value target instead (games/impact.ts):
 * read into the evidence too, it would count twice, and the stars it rates higher would start with
 * more feel than the engine can give them and move their whole band back down.
 */
export const RAPM_WEIGHTS: Record<number, number> = { [SEED_SEASON - 1]: 1, [SEED_SEASON - 2]: 0.7, [SEED_SEASON - 3]: 0.45 };
export const RAPM_LAMBDA = 3000;

export interface NbaProfile {
  generated: string;
  seasons: number[];
  players: Record<number, PlayerPbp>[]; // index-aligned with seasons
  matchups: Record<number, DefMatchup>[];
  rapm: RapmResult;
  league: { season: number; ortg: number; pace: number }[];
}

/** The seasons the impact estimate reads, oldest first. */
export const IMPACT_SEASONS = Object.keys(IMPACT_WEIGHTS)
  .map(Number)
  .sort((a, b) => a - b);

/** Bump when matchups.ts changes what it extracts, so the caches are rebuilt. */
const CACHE_VERSION = 1;

/** What `make` parsed from `archive`, cached until the archive is re-downloaded or CACHE_VERSION changes. */
async function cached<T>(name: string, archive: string, make: () => Promise<T>): Promise<T> {
  const f = join(NBA_RAW, name);
  const st = statSync(archive);
  const key = `${CACHE_VERSION}:${st.size}:${st.mtimeMs}`;
  if (existsSync(f)) {
    const c = JSON.parse(readFileSync(f, 'utf8')) as { key?: string; value: T };
    if (c.key === key) return c.value;
  }
  const value = await make();
  writeFileSync(f, JSON.stringify({ key, value }));
  return value;
}

export async function buildNbaProfile(pbp: PbpData, log = console.log): Promise<NbaProfile> {
  const mus: SeasonMatchups[] = [];
  for (const s of PBP_SEASONS) {
    const mf = join(NBA_RAW, `matchups_${s - 1}.tar.xz`);
    if (existsSync(mf)) mus.push(await cached(`matchups_${s}.json`, mf, () => processMatchups(mf, s, log)));
  }
  const seasons = PBP_SEASONS.map((s) => {
    const reg = pbp.full[`${s}|reg`];
    if (!reg) throw new Error(`The play-by-play has no ${s} regular season read in full.`);
    return reg;
  });
  log(`  RAPM over ${seasons.reduce((a, s) => a + s.stints.length, 0)} stints (λ = ${RAPM_LAMBDA})`);
  const r = rapm(
    seasons.map((s) => ({ stints: s.stints, weight: RAPM_WEIGHTS[s.season] ?? 0.3 })),
    RAPM_LAMBDA,
  );
  const league = seasons.map((s) => {
    const poss = s.stints.reduce((a, x) => a + x.poss, 0);
    const pts = s.stints.reduce((a, x) => a + x.pts, 0);
    return { season: s.season, ortg: (100 * pts) / poss, pace: poss / s.games / 2 };
  });
  return {
    generated: new Date().toISOString(),
    seasons: seasons.map((s) => s.season),
    players: seasons.map((s) => s.players),
    matchups: seasons.map((s) => mus.find((m) => m.season === s.season)?.defenders ?? {}),
    rapm: r,
    league,
  };
}

if (process.argv[1]?.endsWith('build.ts')) {
  const t0 = Date.now();
  (async () => {
    const box = await readBoxScores(SEED_SEASON);
    const pbp = await readPlayByPlay(IMPACT_SEASONS, FIRST_SEASON, SEED_SEASON);
    const seasons = IMPACT_SEASONS.flatMap((s) => [pbp.full[`${s}|reg`], pbp.full[`${s}|post`]].filter((x) => x));
    estimateImpact(
      seasons,
      box.lines.filter((l) => IMPACT_WEIGHTS[l.season]),
    );
    const p = await buildNbaProfile(pbp);
    writeFileSync(join(NBA_RAW, 'nba_profile.json'), JSON.stringify(p));
    console.log(`wrote nba_profile.json in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  })();
}
