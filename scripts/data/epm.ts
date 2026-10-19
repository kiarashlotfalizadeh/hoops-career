// Dunks & Threes EPM (Estimated Plus-Minus, dunksandthrees.com): each player-season's offensive
// and defensive impact in points per 100 possessions, a lineup-data RAPM regressed toward a
// box-score and tracking prior. Exported by hand from the site (it needs a subscription, so
// nothing here downloads it) as one CSV per regular season, kept in data/epm/.
//
// EPM leans the impact ratings (offensive IQ, defensive IQ, perimeter and interior defense)
// toward the best public estimate of what a player is worth (by derive.ts's EPM_BLEND), and each
// season's EPM is kept with his imported stats.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitCsv } from './nba/csv';
import { crosswalk, type BbrefRow, type NbaPerson } from './nba/crosswalk';
import { STAT_SEASONS } from './sources';
import { EPM_BLEND_V1, IMPACT_BASE, SEASON_WEIGHT, deriveRatings, type Agg, type Bio, type EpmBlend, type ImpactValues, type PopStats } from './derive';
import { RATING_KEYS } from '../../src/core/ratings';
import type { Ratings } from '../../src/core/types';

// the offline fixture build (HC_RAW_DIR) brings its own files unless HC_EPM_DIR says otherwise
export const EPM_DIR = process.env.HC_EPM_DIR ?? (process.env.HC_RAW_DIR ? join(process.env.HC_RAW_DIR, 'epm') : join(process.cwd(), 'data', 'epm'));

export interface EpmRow {
  /** NBA.com person id. */
  nbaId: number;
  name: string;
  /** Season by end year (2026 = 2025-26), as everywhere in the pipeline. */
  season: number;
  /** NBA.com tricode of each team he played for that season. */
  teams: string[];
  min: number;
  off: number;
  def: number;
  tot: number;
}

/** A player's EPM over the stat seasons: recency- and minutes-weighted, like the advanced stats. */
export interface EpmAgg {
  off: number;
  def: number;
  tot: number;
  /** Raw minutes behind it. */
  min: number;
}

const NEED = ['season', 'seasontype', 'player_id', 'player_name', 'team_alias', 'mp', 'off', 'def', 'tot'];

/** Regular-season rows of one Dunks & Threes export (a row per player-season, teams combined). */
export function parseEpm(text: string): EpmRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  const missing = NEED.filter((k) => idx[k] === undefined);
  if (missing.length) throw new Error(`not a Dunks & Threes EPM export: no ${missing.join(', ')} column`);
  const out: EpmRow[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const get = (k: string) => (c[idx[k]] ?? '').trim();
    // seasontype 2 is the regular season (NBA.com's 002); playoff rows would count twice
    if (get('seasontype') !== '2') continue;
    const row: EpmRow = {
      nbaId: Number(get('player_id')),
      name: get('player_name'),
      season: Number(get('season')),
      teams: (idx.team_alias_all !== undefined && get('team_alias_all') ? get('team_alias_all') : get('team_alias')).split(',').map((t) => t.trim()),
      min: Number(get('mp')),
      off: Number(get('off')),
      def: Number(get('def')),
      tot: Number(get('tot')),
    };
    if (!row.nbaId || !row.season || !(row.min > 0) || ![row.off, row.def, row.tot].every(Number.isFinite)) continue;
    out.push(row);
  }
  return out;
}

/** Every export in `dir` (any file name: the season comes from the rows); a season exported twice keeps the later file's rows. */
export function loadEpm(dir = EPM_DIR, log = console.log): EpmRow[] {
  if (!existsSync(dir)) {
    log(`EPM: no ${dir}; impact ratings come from box plus-minus and RAPM alone`);
    return [];
  }
  const bySeason = new Map<number, EpmRow[]>();
  for (const f of readdirSync(dir)
    .filter((x) => x.toLowerCase().endsWith('.csv'))
    .sort()) {
    const rows = parseEpm(readFileSync(join(dir, f), 'utf8'));
    for (const s of new Set(rows.map((r) => r.season))) bySeason.set(s, []);
    for (const r of rows) bySeason.get(r.season)!.push(r);
  }
  const used = [...bySeason.keys()].filter((s) => STAT_SEASONS.includes(s)).sort();
  const ignored = [...bySeason.keys()].filter((s) => !STAT_SEASONS.includes(s)).sort();
  const missing = STAT_SEASONS.filter((s) => !bySeason.has(s));
  log(
    `EPM: ${used.map((s) => `${s} (${bySeason.get(s)!.length} players)`).join(', ') || 'none'}${ignored.length ? `; ignored ${ignored.join(', ')} (not a stat season)` : ''}${
      missing.length ? `; no export for ${missing.join(', ')}` : ''
    }`,
  );
  return used.flatMap((s) => bySeason.get(s)!);
}

/**
 * Basketball Reference id for each EPM player: the NBA.com id the play-by-play crosswalk already
 * matched (`known`, NBA.com id → BBRef id), else the same name-and-team crosswalk.
 */
export function matchEpm(rows: EpmRow[], bbref: BbrefRow[], known: Map<number, string>, log = console.log): Map<number, string> {
  const map = new Map<number, string>();
  const people = new Map<number, NbaPerson>();
  for (const r of rows) {
    const id = known.get(r.nbaId);
    if (id) map.set(r.nbaId, id);
    else {
      const p = people.get(r.nbaId) ?? { pid: r.nbaId, name: r.name, teams: {} };
      p.teams[r.season] = r.teams[r.teams.length - 1];
      people.set(r.nbaId, p);
    }
  }
  const taken = new Set(map.values());
  const cw = crosswalk(
    [...people.values()],
    bbref.filter((b) => !taken.has(b.id)),
  );
  for (const [pid, id] of cw.map) map.set(pid, id);
  const total = new Set(rows.map((r) => r.nbaId)).size;
  log(
    `  EPM matched: ${map.size} of ${total} players (${map.size - cw.map.size} by NBA.com id)${
      cw.unmatched.length
        ? `; unmatched: ${cw.unmatched
            .slice(0, 8)
            .map((p) => p.name)
            .join(', ')}${cw.unmatched.length > 8 ? '…' : ''}`
        : ''
    }`,
  );
  return map;
}

/** Recency- and minutes-weighted EPM over a player's rows. */
export function aggregateEpm(rows: EpmRow[]): EpmAgg | undefined {
  let w = 0;
  const a: EpmAgg = { off: 0, def: 0, tot: 0, min: 0 };
  for (const r of rows) {
    const wr = (SEASON_WEIGHT[r.season] ?? 0) * r.min;
    if (wr <= 0) continue;
    w += wr;
    a.off += r.off * wr;
    a.def += r.def * wr;
    a.tot += r.tot * wr;
    a.min += r.min;
  }
  if (w <= 0) return undefined;
  a.off /= w;
  a.def /= w;
  a.tot /= w;
  return a;
}

/** Each BBRef id's EPM rows by season. */
export function epmByBbref(rows: EpmRow[], ids: Map<number, string>): Map<string, Map<number, EpmRow>> {
  const out = new Map<string, Map<number, EpmRow>>();
  for (const r of rows) {
    const id = ids.get(r.nbaId);
    if (!id) continue;
    const m = out.get(id) ?? new Map<number, EpmRow>();
    m.set(r.season, r);
    out.set(id, m);
  }
  return out;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** A season's EPM as the seed keeps it with that season's advanced stats. */
export const epmFields = (e: EpmRow) => ({ oepm: r1(e.off), depm: r1(e.def), epm: r1(e.tot) });

/**
 * What EPM changes in a player's ratings: derived with it minus derived without it (the impact
 * ratings only), scaled as the build blends a thin sample (under 400 minutes) with its prior.
 * Calibration never touches these ratings, so a seed built without EPM takes the shift as it is.
 */
export function epmShift(a: Agg, bio: Bio, pop: PopStats, seedKey: string): Partial<Ratings> {
  if (!a.epm || a.rawMin < 60) return {};
  const w = blendWeight(a.rawMin);
  const withEpm = deriveRatings(a, bio, pop, seedKey).r;
  const without = deriveRatings({ ...a, epm: undefined }, bio, pop, seedKey).r;
  const out: Partial<Ratings> = {};
  for (const k of RATING_KEYS) {
    const d = (withEpm[k] - without[k]) * w;
    if (Math.abs(d) >= 0.05) out[k] = d;
  }
  return out;
}

/** How much of his derived ratings a player keeps: the build blends a sample under 400 raw minutes with a prior (and derives none under 60). */
export const blendWeight = (rawMin: number) => (rawMin < 60 ? 0 : Math.min(1, rawMin / 400));

const IMPACT_KEYS = ['oiq', 'diq', 'perD', 'intD'] as const;
const list = (v: ImpactValues) => IMPACT_KEYS.map((k) => `${k} ${v[k]}`).join(', ');

/** The seed's `source` note for EPM, with the blend its impact ratings were derived at. */
export const epmSourceNote = (b: EpmBlend) => `Dunks & Threes EPM (impact weights ${list(b.w)}; scale ${list(b.k)})`;

/**
 * The EPM blend a seed's impact ratings were derived at, from its `source`: null without EPM, and
 * the first one (EPM_BLEND_V1) for a seed that took EPM before the source recorded it.
 */
export function seedEpmBlend(source: string): EpmBlend | null {
  if (!source.includes('Dunks & Threes EPM')) return null;
  const b: EpmBlend = { w: { ...EPM_BLEND_V1.w }, k: { ...EPM_BLEND_V1.k } };
  const m = source.match(/Dunks & Threes EPM \(impact weights ([^;)]*)(?:; scale ([^)]*))?\)/);
  const read = (text: string | undefined, into: ImpactValues) => {
    for (const part of (text ?? '').split(',')) {
      const [k, v] = part.trim().split(/\s+/);
      if ((IMPACT_KEYS as readonly string[]).includes(k) && Number.isFinite(Number(v))) into[k as keyof ImpactValues] = Number(v);
    }
  };
  read(m?.[1], b.w);
  read(m?.[2], b.k);
  return b;
}

/** A source string with its EPM note giving this blend. */
export const withEpmNote = (source: string, b: EpmBlend) =>
  source.includes('Dunks & Threes EPM') ? source.replace(/Dunks & Threes EPM( \(impact weights [^)]*\))?/, epmSourceNote(b)) : `${source}; ${epmSourceNote(b)}`;

/**
 * What moving a player derived with the play-by-play from EPM blend `from` to `to` changes in his
 * impact ratings `r`, given his EPM z-scores (offensive for offensive IQ, defensive for the rest).
 * A derived impact rating is IMPACT_BASE + k × (w × z + the rating's other terms), so the one derived
 * with `to` is IMPACT_BASE + (k′/k) × (the one derived with `from` − IMPACT_BASE) + k′ × (w′ − w) × z:
 * exact for a rating as derived. The build blends a sample under 400 minutes with a prior, so the
 * shift is scaled down the same way (exact when the prior sat where the derived rating did), and the
 * leveling's skill shift, which the seed doesn't record, is scaled by k′/k with the rest.
 */
export function reweightShift(r: ImpactValues, z: { off: number; def: number }, rawMin: number, from: EpmBlend, to: EpmBlend): Partial<Ratings> {
  const bw = blendWeight(rawMin);
  const out: Partial<Ratings> = {};
  if (bw <= 0) return out;
  for (const k of IMPACT_KEYS) {
    const d = bw * ((to.k[k] / from.k[k] - 1) * (r[k] - IMPACT_BASE[k]) + to.k[k] * (to.w[k] - from.w[k]) * (k === 'oiq' ? z.off : z.def));
    if (d !== 0) out[k] = d;
  }
  return out;
}
