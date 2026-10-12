// Turns the NBA.com archives into per-season player profiles, matchup defense, full names /
// teams by NBA person id, and multi-season RAPM. The seed builder calls buildNbaProfile()
// directly; each season's parsed play-by-play and matchups are cached as JSON next to the archives.
// Usage: npm run data:nba (after data:fetch-nba) builds the profile on its own, filling those
// caches ahead of data:build, and writes it to data/raw/nba/nba_profile.json for inspection.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NBA_RAW } from './fetch';
import { PBP_SEASONS } from './sources';
import { SEED_SEASON } from '../sources';
import { processSeason, type SeasonPbp, type PlayerPbp } from './pbp';
import { processMatchups, type SeasonMatchups, type DefMatchup } from './matchups';
import { rapm, type RapmResult } from './rapm';

/** Recency weights for RAPM (seasons by end year). */
export const RAPM_WEIGHTS: Record<number, number> = { [SEED_SEASON - 1]: 1, [SEED_SEASON - 2]: 0.7, [SEED_SEASON - 3]: 0.45 };
export const RAPM_LAMBDA = 3000;

export interface NbaProfile {
  generated: string;
  seasons: number[];
  players: Record<number, PlayerPbp>[]; // index-aligned with seasons
  matchups: Record<number, DefMatchup>[];
  names: Record<number, string>;
  teams: Record<number, Record<number, string>>; // season -> pid -> tricode
  rapm: RapmResult;
  league: { season: number; ortg: number; pace: number }[];
}

/** Bump when pbp.ts or matchups.ts change what they extract, so the caches are rebuilt. */
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

export async function buildNbaProfile(log = console.log): Promise<NbaProfile> {
  const pbp: SeasonPbp[] = [];
  const mus: SeasonMatchups[] = [];
  for (const s of PBP_SEASONS) {
    const pf = join(NBA_RAW, `cdnnba_${s - 1}.tar.xz`);
    const mf = join(NBA_RAW, `matchups_${s - 1}.tar.xz`);
    if (!existsSync(pf)) throw new Error(`Missing ${pf}. Run npm run data:fetch-nba first.`);
    pbp.push(await cached(`pbp_${s}.json`, pf, () => processSeason(pf, s, log)));
    if (existsSync(mf)) mus.push(await cached(`matchups_${s}.json`, mf, () => processMatchups(mf, s, log)));
  }
  const names: Record<number, string> = {};
  const teams: Record<number, Record<number, string>> = {};
  for (const m of mus) {
    Object.assign(names, m.names);
    teams[m.season] = { ...m.teams };
  }
  for (const s of pbp) {
    teams[s.season] ??= {};
    for (const p of Object.values(s.players)) {
      const top = Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0];
      if (top && !teams[s.season][p.id]) teams[s.season][p.id] = top[0];
    }
  }
  log(`  RAPM over ${pbp.reduce((a, s) => a + s.stints.length, 0)} stints (λ = ${RAPM_LAMBDA})`);
  const r = rapm(
    pbp.map((s) => ({ stints: s.stints, weight: RAPM_WEIGHTS[s.season] ?? 0.3 })),
    RAPM_LAMBDA,
  );
  const league = pbp.map((s) => {
    const poss = s.stints.reduce((a, x) => a + x.poss, 0);
    const pts = s.stints.reduce((a, x) => a + x.pts, 0);
    return { season: s.season, ortg: (100 * pts) / poss, pace: poss / s.games / 2 };
  });
  return {
    generated: new Date().toISOString(),
    seasons: pbp.map((s) => s.season),
    players: pbp.map((s) => s.players),
    matchups: pbp.map((s) => mus.find((m) => m.season === s.season)?.defenders ?? {}),
    names,
    teams,
    rapm: r,
    league,
  };
}

if (process.argv[1]?.endsWith('build.ts')) {
  const t0 = Date.now();
  buildNbaProfile().then((p) => {
    writeFileSync(join(NBA_RAW, 'nba_profile.json'), JSON.stringify(p));
    console.log(`wrote nba_profile.json in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  });
}
