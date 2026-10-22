// Dunks & Threes' EPM projection for the season the seed opens (data/epm/projection/): each
// player's projected offensive, defensive and total EPM for 2026-27 (and his projected minutes,
// usage and per-100 box line, which the seed doesn't use). Exported by hand from the site (it needs
// a subscription, so nothing here downloads it).
//
// The seed's ratings describe the players as they are on opening night, and the projection is the
// best public estimate of what each is worth then: three seasons of EPM and box score regressed by
// sample, aged a year, and the 2026 rookies' college numbers translated. The build uses it once, as
// the value target of the engine calibration (calibrate.ts): each player's ratings move until his
// team gains in simulated games, with him on the floor, what his projected EPM says at each end, its
// actual gaps between players included. Nothing else reads it: his impact ratings start from his
// evidence (derive.ts), his box line from his real one. Each player keeps his projection
// (SeedPlayer.proj) and the seed's source notes it. A build without it fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitCsv } from './nba/csv';
import { crosswalk, type BbrefRow, type NbaPerson } from './nba/crosswalk';

// the offline fixture build (HC_RAW_DIR) brings its own export unless HC_EPM_PROJ_DIR says otherwise
export const PROJ_DIR =
  process.env.HC_EPM_PROJ_DIR ?? (process.env.HC_RAW_DIR ? join(process.env.HC_RAW_DIR, 'epm', 'projection') : join(process.cwd(), 'data', 'epm', 'projection'));

export interface EpmProjection {
  nbaId: number;
  name: string;
  /** NBA.com tricode of the team he's projected with. */
  team: string;
  season: number;
  mpg: number;
  /** Usage, a share (0.32). */
  usg: number;
  off: number;
  def: number;
  tot: number;
  /** Projected box line per 100 possessions, and percentages as shares. */
  box: Record<(typeof PER100)[number], number> & Record<(typeof PCT)[number], number>;
}

const PER100 = ['pts', 'fg2a', 'fg3a', 'fta', 'orb', 'drb', 'ast', 'tov', 'stl', 'blk'] as const;
const PCT = ['tspct', 'fg2pct', 'fg3pct', 'ftpct'] as const;
const NEED = ['season', 'nba_id', 'name', 'team', 'p_mpg', 'p_usg', 'oepm', 'depm', 'epm', ...PER100.map((k) => `p_${k}_100`), ...PCT.map((k) => `p_${k}`)];

/** One Dunks & Threes projection export: a row per player. */
export function parseProjection(text: string): EpmProjection[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  const missing = NEED.filter((k) => idx[k] === undefined);
  if (missing.length) throw new Error(`not a Dunks & Threes EPM projection: no ${missing.join(', ')} column`);
  const out: EpmProjection[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const get = (k: string) => (c[idx[k]] ?? '').trim();
    const num = (k: string) => Number(get(k));
    const box = Object.fromEntries([...PER100.map((k) => [k, num(`p_${k}_100`)]), ...PCT.map((k) => [k, num(`p_${k}`)])]) as EpmProjection['box'];
    const row: EpmProjection = {
      nbaId: num('nba_id'),
      name: get('name'),
      team: get('team'),
      season: num('season'),
      mpg: num('p_mpg'),
      usg: num('p_usg'),
      off: num('oepm'),
      def: num('depm'),
      tot: num('epm'),
      box,
    };
    if (!row.nbaId || !row.season || !(row.mpg > 0) || ![row.off, row.def, row.tot, row.usg, ...Object.values(box)].every(Number.isFinite)) continue;
    out.push(row);
  }
  return out;
}

/**
 * The projection for `season` in `dir` (any file name; a later file by name wins a player listed
 * twice). The seed can't be built without it: no folder, or no rows for the season, throws.
 */
export function loadProjection(season: number, dir = PROJ_DIR, log = console.log): EpmProjection[] {
  const files = existsSync(dir) ? readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.csv')) : [];
  const byId = new Map<number, EpmProjection>();
  let other = 0;
  for (const f of files.sort())
    for (const r of parseProjection(readFileSync(join(dir, f), 'utf8'))) {
      if (r.season !== season) other++;
      else byId.set(r.nbaId, r);
    }
  if (!byId.size)
    throw new Error(
      `No Dunks & Threes EPM projection for ${season} in ${dir}${files.length ? ` (${files.join(', ')}${other ? `: ${other} rows for other seasons` : ''})` : ''}: export it from the site into that folder (see the README).`,
    );
  log(`EPM projection: ${byId.size} players for ${season}${other ? `; ignored ${other} rows for other seasons` : ''}`);
  return [...byId.values()];
}

/**
 * Each projected player's Basketball Reference id, for the build to derive his ratings with: the
 * NBA.com id the play-by-play crosswalk already matched (`known`, NBA.com id → BBRef id), else the
 * same crosswalk's name matching against `bbref` (his team now from the contracts, and his real teams).
 */
export function projectionByBbref(rows: EpmProjection[], bbref: BbrefRow[], known: Map<number, string>, log = console.log): Map<string, EpmProjection> {
  const out = new Map<string, EpmProjection>();
  const rest: NbaPerson[] = [];
  for (const r of rows) {
    const id = known.get(r.nbaId);
    if (id) out.set(id, r);
    else rest.push({ pid: r.nbaId, name: r.name, teams: { [r.season]: r.team } });
  }
  const byNba = new Map(rows.map((r) => [r.nbaId, r]));
  const cw = crosswalk(
    rest,
    bbref.filter((b) => !out.has(b.id)),
  );
  for (const [pid, id] of cw.map) out.set(id, byNba.get(pid)!);
  log(`  projection matched: ${out.size} of ${rows.length} (${out.size - cw.map.size} by NBA.com id)`);
  return out;
}

export const projectionNote = (season: number) => `Dunks & Threes ${season - 1}-${String(season).slice(2)} EPM projection`;

export function pearson(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}
