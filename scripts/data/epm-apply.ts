// Apply the Dunks & Threes EPM exports (data/epm/) to an existing src/data/seed.json built without
// them, without re-running calibration: each player's impact ratings move by what EPM changes in them
// (calibration never touches those, so the rest of the seed stays as calibrated), and each real
// season gets its EPM. A seed that already has EPM is left alone: rebuild it with data:build.
// Needs the same raw pages as data:build (Basketball Reference stats and NBA.com play-by-play).
// Usage: npm run data:epm
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAT_SEASONS } from './sources';
import { parseAdvanced, parsePerGame, type AdvRow, type PerGameRow } from './parse';
import { aggregate, popStats, type Agg } from './derive';
import { buildNbaProfile } from './nba/build';
import { profilesByBbref } from './nba/profile';
import { NBA_RAW } from './nba/fetch';
import { COMBINED } from './positions';
import { aggregateEpm, epmByBbref, epmFields, epmShift, loadEpm, matchEpm } from './epm';
import { RATING_KEYS, clampRatings } from '../../src/core/ratings';
import type { SeedData } from '../../src/core/league/create';
import type { Ratings } from '../../src/core/types';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');

async function main() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  if (seed.players.some((p) => p.stats.some((s) => s.adv?.epm !== undefined))) {
    console.log(`${OUT} already has EPM; rebuild it with npm run data:build to take new exports in.`);
    return;
  }
  const rows = loadEpm();
  if (!rows.length) process.exit(1);
  const perGame: PerGameRow[] = [];
  const adv: AdvRow[] = [];
  for (const s of STAT_SEASONS) {
    const pg = join(RAW, `per_game_${s}.html`);
    const ad = join(RAW, `advanced_${s}.html`);
    if (!existsSync(pg) || !existsSync(ad)) {
      console.error(`Missing stats for ${s} in ${RAW}. Run \`npm run data:fetch\` first.`);
      process.exit(1);
    }
    perGame.push(...parsePerGame(readFileSync(pg, 'utf8'), s).rows);
    adv.push(...parseAdvanced(readFileSync(ad, 'utf8'), s));
  }
  if (!existsSync(join(NBA_RAW, `cdnnba_${STAT_SEASONS[STAT_SEASONS.length - 1] - 1}.tar.xz`))) {
    console.error('NBA.com play-by-play not found; run `npm run data:fetch-nba` first (the impact ratings read it).');
    process.exit(1);
  }
  const bbref = perGame.map((r) => ({ id: r.id, name: r.name, season: r.season, team: r.team }));
  const pbpById = profilesByBbref(await buildNbaProfile(), bbref);
  const epmById = epmByBbref(rows, matchEpm(rows, bbref, new Map([...pbpById].map(([id, b]) => [b.nbaId, id]))));

  // the build's aggregation, over the seed's players: a combined row for a season split between teams
  const seasonRows = <T extends { season: number; team: string }>(list: T[]) =>
    STAT_SEASONS.flatMap((s) => {
      const sr = list.filter((r) => r.season === s);
      const comb = sr.find((r) => COMBINED.test(r.team));
      return comb ? [comb] : sr;
    });
  const aggs = new Map<string, Agg>();
  for (const sp of seed.players) {
    const pg = seasonRows(perGame.filter((r) => r.id === sp.id));
    const a = pg.length ? aggregate(pg, seasonRows(adv.filter((r) => r.id === sp.id))) : null;
    if (!a) continue;
    a.pbp = pbpById.get(sp.id);
    a.epm = aggregateEpm([...(epmById.get(sp.id)?.values() ?? [])]);
    aggs.set(sp.id, a);
  }
  const pop = popStats([...aggs.values()]);

  let shifted = 0;
  let withSeasons = 0;
  const big: string[] = [];
  for (const sp of seed.players) {
    const a = aggs.get(sp.id);
    const d = a ? epmShift(a, { heightIn: sp.heightIn, weightLb: sp.weightLb, age: seed.season - sp.bornYear, pos: sp.pos }, pop, sp.id) : {};
    if (Object.keys(d).length) {
      const r = { ...sp.ratings };
      for (const [k, v] of Object.entries(d)) r[k as keyof Ratings] += v;
      const c = clampRatings(r);
      sp.ratings = Object.fromEntries(RATING_KEYS.map((k) => [k, Math.round(c[k] * 10) / 10])) as unknown as Ratings;
      shifted++;
      for (const [k, v] of Object.entries(d)) if (Math.abs(v) >= 5) big.push(`${sp.first} ${sp.last} ${k} ${v > 0 ? '+' : ''}${v.toFixed(1)}`);
    }
    const seasons = epmById.get(sp.id);
    let any = false;
    for (const st of sp.stats) {
      const e = st.real ? seasons?.get(st.season) : undefined;
      if (!e || !st.adv) continue;
      Object.assign(st.adv, epmFields(e));
      any = true;
    }
    if (any) withSeasons++;
  }
  if (!seed.source.includes('EPM')) seed.source += '; Dunks & Threes EPM';
  console.log(`EPM applied: impact ratings moved for ${shifted} players, EPM seasons for ${withSeasons}`);
  if (big.length) console.log(`  moves of 5 or more: ${big.join(', ')}`);
  writeFileSync(OUT, JSON.stringify(seed));
  console.log(`wrote ${OUT} (${(JSON.stringify(seed).length / 1e6).toFixed(2)} MB)`);
}

void main();
