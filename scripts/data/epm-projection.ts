// Dunks & Threes' EPM projection for the season the seed opens (data/epm/projection/): each
// player's projected offensive, defensive and total EPM for 2026-27, his projected minutes and
// usage, and a projected per-100-possession box line. Exported by hand from the site like the
// season exports (epm.ts), and kept in its own folder because its columns differ.
//
// The seed's ratings describe the players as they are on opening night, and the projection is the
// best public estimate of exactly that: three seasons of EPM and box score regressed by sample, aged
// a year, and the 2026 rookies' college numbers translated. So it is the seed's last and heaviest
// word (applyProjection below, run on a finished seed):
//   1. Box line. Each player's hidden event multipliers (calibrated so he reproduces his real per-36
//      line in the engine) move by his projected rate over his three-season rate for blocks and
//      boards, and his usage, three-point share and passing tendencies the same way; his shooting
//      ratings move by what the change in his percentages is worth across the seed. A rookie's, who
//      has no real line, move most of the way to what his projection reads as.
//   2. Impact. Offensive IQ moves by the change from his three-season offensive EPM to the
//      projected one, and defensive IQ and perimeter and interior defense by the defensive half,
//      each by what a standard deviation of EPM is worth in that rating across the seed.
//   3. Level. His OVR is set mostly (PROJ_WEIGHT) by where his projected EPM ranks: the seed's own
//      raw OVRs, sorted, handed out in projected-EPM order, so the league keeps its spread of
//      ratings (and the engine and the fictional leagues their tuning). The skills that move are
//      those at the end of the floor where the projection and his ratings disagree.
//   4. Stamina follows half the change in his minutes.
//   5. The league keeps its level: every rating and multiplier goes back to its old mean over the
//      rotations, so the engine's league rates stay where they were tuned.
// Players the projection doesn't list keep the OVR they had. Each player keeps his projection
// (SeedPlayer.proj), and the seed's source notes it, so a seed takes it once.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitCsv } from './nba/csv';
import { crosswalk, type BbrefRow, type NbaPerson } from './nba/crosswalk';
import { EPM_DIR } from './epm';
import { SEASON_WEIGHT, staminaFromMinutes } from './derive';
import { STAT_SEASONS } from './sources';
import { SKILL_KEYS, buildOvrScale, clampRatings, composites, ovrRaw, toDisplay } from '../../src/core/ratings';
import { clamp } from '../../src/core/random';
import { FRANCHISES } from '../../src/core/teams';
import type { SeedData, SeedPlayer, SeedProjection } from '../../src/core/league/create';
import type { RatingKey, Ratings, Tendencies } from '../../src/core/types';

export const PROJ_DIR = process.env.HC_EPM_PROJ_DIR ?? join(EPM_DIR, 'projection');

/** How far a player's raw OVR goes from where it was to where his projected EPM ranks. */
export const PROJ_WEIGHT = 0.8;
/** How far a player with no real line to compare (a rookie) goes from his ratings to what his projection reads as. */
export const ROOKIE_WEIGHT = 0.6;
/** Raw minutes over the stat seasons below which a player's own line is too thin to compare with his projection. */
const THIN = 400;

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

/** The projection for `season` in `dir` (any file name; a later file by name wins a player listed twice). */
export function loadProjection(season: number, dir = PROJ_DIR, log = console.log): EpmProjection[] {
  if (!existsSync(dir)) {
    log(`EPM projection: no ${dir}`);
    return [];
  }
  const byId = new Map<number, EpmProjection>();
  let other = 0;
  for (const f of readdirSync(dir)
    .filter((x) => x.toLowerCase().endsWith('.csv'))
    .sort())
    for (const r of parseProjection(readFileSync(join(dir, f), 'utf8'))) {
      if (r.season !== season) other++;
      else byId.set(r.nbaId, r);
    }
  log(`EPM projection: ${byId.size} players for ${season}${other ? `; ignored ${other} rows for other seasons` : ''}`);
  return [...byId.values()];
}

const NBA_CODE = new Map(FRANCHISES.map((f) => [f.abbrev, f.bbref]));

/**
 * Each projected player's seed player: the NBA.com id the seed already has, else the play-by-play
 * crosswalk's name matching against the seed's players, by their team now and their real teams.
 */
export function matchProjection(rows: EpmProjection[], seed: SeedData, log = console.log): Map<number, SeedPlayer> {
  const byNba = new Map(seed.players.flatMap((sp) => (sp.nbaId ? [[sp.nbaId, sp] as const] : [])));
  const map = new Map<number, SeedPlayer>();
  const rest: NbaPerson[] = [];
  for (const r of rows) {
    const sp = byNba.get(r.nbaId);
    if (sp) map.set(r.nbaId, sp);
    // (crosswalk reads NBA.com tricodes)
    else rest.push({ pid: r.nbaId, name: r.name, teams: { [r.season]: r.team } });
  }
  const taken = new Set([...map.values()].map((sp) => sp.id));
  const byId = new Map(seed.players.map((sp) => [sp.id, sp]));
  const bbref: BbrefRow[] = seed.players
    .filter((sp) => !taken.has(sp.id))
    .flatMap((sp) => [
      ...(sp.team ? [{ id: sp.id, name: `${sp.first} ${sp.last}`, season: seed.season, team: sp.team }] : []),
      ...sp.stats.filter((s) => s.real && FRANCHISES[s.tid]).map((s) => ({ id: sp.id, name: `${sp.first} ${sp.last}`, season: s.season, team: FRANCHISES[s.tid].bbref })),
    ]);
  const cw = crosswalk(rest, bbref);
  for (const [pid, id] of cw.map) map.set(pid, byId.get(id)!);
  log(
    `  matched ${map.size} of ${rows.length} (${map.size - cw.map.size} by NBA.com id)${
      cw.unmatched.length ? `; unmatched: ${cw.unmatched.map((p) => `${p.name} (${p.teams[seed.season]})`).join(', ')}` : ''
    }`,
  );
  return map;
}

/** NBA.com tricode → the seed's Basketball Reference code. */
export const seedTeam = (tri: string) => NBA_CODE.get(tri) ?? tri;

// ---------------------------------------------------------------- the player's line, then and projected

/** The rates the projection is compared on, all per 36 minutes (shares for percentages and usage). */
interface Line {
  min: number;
  fg2a: number;
  fg3a: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  fg2pct: number;
  fg3pct: number;
  ftpct: number;
  usg: number;
  /** Assist percentage (Basketball Reference's, 24.5). */
  astPct: number;
  /** Minutes-weighted EPM over the stat seasons, when the seed has it, and the raw minutes behind it. */
  off: number;
  def: number;
  epmMin: number;
}
type Rate = 'fg2a' | 'fg3a' | 'fta' | 'orb' | 'drb' | 'ast' | 'tov' | 'stl' | 'blk';
const RATES: Rate[] = ['fg2a', 'fg3a', 'fta', 'orb', 'drb', 'ast', 'tov', 'stl', 'blk'];

/** His real line over the stat seasons, recency- and minutes-weighted as derive.ts weights it, percentages with its priors. */
export function realLine(sp: SeedPlayer): Line | null {
  let w = 0;
  let min = 0;
  const t: Record<string, number> = {
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    orb: 0,
    drb: 0,
    ast: 0,
    tov: 0,
    stl: 0,
    blk: 0,
    usg: 0,
    astPct: 0,
    uw: 0,
    off: 0,
    def: 0,
    ew: 0,
    emin: 0,
  };
  for (const s of sp.stats) {
    const sw = SEASON_WEIGHT[s.season];
    if (!s.real || s.playoffs || !sw || !STAT_SEASONS.includes(s.season) || s.min <= 0) continue;
    min += s.min;
    w += s.min * sw;
    t.fg2m += (s.fgm - s.tpm) * sw;
    t.fg2a += (s.fga - s.tpa) * sw;
    t.fg3m += s.tpm * sw;
    t.fg3a += s.tpa * sw;
    t.ftm += s.ftm * sw;
    t.fta += s.fta * sw;
    for (const k of ['orb', 'drb', 'ast', 'tov', 'stl', 'blk'] as const) t[k] += s[k] * sw;
    if (s.adv?.usg !== undefined) {
      t.usg += s.adv.usg * s.min * sw;
      t.astPct += (s.adv.astPct ?? 0) * s.min * sw;
      t.uw += s.min * sw;
    }
    if (s.adv?.oepm !== undefined && s.adv.depm !== undefined) {
      t.off += s.adv.oepm * s.min * sw;
      t.def += s.adv.depm * s.min * sw;
      t.ew += s.min * sw;
      t.emin += s.min;
    }
  }
  if (w <= 0) return null;
  const per36 = (k: string) => (t[k] / w) * 36;
  return {
    min,
    fg2a: per36('fg2a'),
    fg3a: per36('fg3a'),
    fta: per36('fta'),
    orb: per36('orb'),
    drb: per36('drb'),
    ast: per36('ast'),
    tov: per36('tov'),
    stl: per36('stl'),
    blk: per36('blk'),
    fg2pct: (t.fg2m + 0.53 * 150) / (t.fg2a + 150),
    fg3pct: (t.fg3m + 0.345 * 120) / (t.fg3a + 120),
    ftpct: (t.ftm + 0.76 * 50) / (t.fta + 50),
    usg: t.uw ? t.usg / t.uw / 100 : NaN,
    astPct: t.uw ? t.astPct / t.uw : NaN,
    off: t.ew ? t.off / t.ew : NaN,
    def: t.ew ? t.def / t.ew : NaN,
    epmMin: t.emin,
  };
}

/**
 * The projection on the real lines' scale: each per-100 rate times the ratio of the real rate to
 * the projected one over the players who have both (pace, and any lean the projection has league-
 * wide, so the league's rates don't move), and each percentage shifted by the same comparison.
 */
function toLineScale(pairs: { line: Line; p: EpmProjection }[]) {
  const ratio = {} as Record<Rate, number>;
  const shift = { fg2pct: 0, fg3pct: 0, ftpct: 0, usg: 0 };
  // assist percentage per assist per 36, for a rookie's passing tendency
  let astPct = 0;
  let astW = 0;
  let sw = 0;
  const real = Object.fromEntries([...RATES, 'fg2pct', 'fg3pct', 'ftpct', 'usg'].map((k) => [k, 0])) as Record<string, number>;
  const proj = { ...real };
  for (const { line, p } of pairs) {
    const w = Math.min(line.min, 3000);
    sw += w;
    for (const k of RATES) {
      real[k] += line[k] * w;
      proj[k] += p.box[k] * w;
    }
    for (const k of ['fg2pct', 'fg3pct', 'ftpct'] as const) {
      real[k] += line[k] * w;
      proj[k] += p.box[k] * w;
    }
    real.usg += (Number.isFinite(line.usg) ? line.usg : p.usg) * w;
    proj.usg += p.usg * w;
    if (Number.isFinite(line.astPct)) {
      astPct += line.astPct * w;
      astW += line.ast * w;
    }
  }
  for (const k of RATES) ratio[k] = real[k] / proj[k];
  for (const k of ['fg2pct', 'fg3pct', 'ftpct', 'usg'] as const) shift[k] = (real[k] - proj[k]) / sw;
  return (p: EpmProjection, min = 0): Line => ({
    min,
    ...(Object.fromEntries(RATES.map((k) => [k, p.box[k] * ratio[k]])) as Record<Rate, number>),
    fg2pct: p.box.fg2pct + shift.fg2pct,
    fg3pct: p.box.fg3pct + shift.fg3pct,
    ftpct: p.box.ftpct + shift.ftpct,
    usg: p.usg + shift.usg,
    astPct: p.box.ast * ratio.ast * (astPct / astW),
    off: p.off,
    def: p.def,
    epmMin: Infinity,
  });
}

// ---------------------------------------------------------------- what a rate is worth in a rating

/** The features each shooting rating reads, as the build derives it (derive.ts). */
const SHOOTING: { key: RatingKey; feats: ((l: Line) => number)[] }[] = [
  { key: 'tp', feats: [(l) => l.fg3pct, (l) => Math.log1p(l.fg3a)] },
  { key: 'ft', feats: [(l) => l.ftpct] },
  { key: 'ins', feats: [(l) => l.fg2pct, (l) => Math.log1p(l.fta)] },
  { key: 'drw', feats: [(l) => Math.log1p(l.fta)] },
];

/** Ordinary least squares with an intercept (normal equations; a handful of features). */
export function ols(x: number[][], y: number[], w?: number[]): number[] {
  const n = x[0].length + 1;
  const a = Array.from({ length: n }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i < y.length; i++) {
    const row = [1, ...x[i]];
    const wi = w?.[i] ?? 1;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) a[r][c] += wi * row[r] * row[c];
      a[r][n] += wi * row[r] * y[i];
    }
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !a[c][c]) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row, i) => (row[i] ? row[n] / row[i] : 0));
}

const predict = (b: number[], f: number[]) => b[0] + f.reduce((s, v, i) => s + b[i + 1] * v, 0);

/** Weighted mean and SD. */
function meanSd(v: number[], w: number[]) {
  const sw = w.reduce((a, b) => a + b, 0);
  const m = v.reduce((a, x, i) => a + x * w[i], 0) / sw;
  const sd = Math.sqrt(v.reduce((a, x, i) => a + w[i] * (x - m) ** 2, 0) / sw) || 1;
  return { m, sd };
}

/**
 * The skills an OVR move goes into, by how much of it each takes: the feel, creation and defense
 * that OVR weighs (and the engine's impact runs through), not the box-score events it barely counts
 * (steals, blocks, boards, free throws), which the projection's box line has already set.
 */
const OFFENSE: Partial<Record<RatingKey, number>> = { oiq: 1.5, hnd: 1, pas: 1, ins: 1, mid: 1, post: 1, tp: 0.5, drw: 0.5 };
const DEFENSE: Partial<Record<RatingKey, number>> = { diq: 1.5, perD: 1.5, intD: 1.5, dreb: 0.3 };

/** Skills moved, each by its weight in `w` times one amount, until raw OVR reaches `target`. */
function shiftRaw(r: Ratings, target: number, w: Partial<Record<RatingKey, number>>): Ratings {
  const at = (d: number) => {
    const t = { ...r };
    for (const [k, x] of Object.entries(w) as [RatingKey, number][]) t[k] = clamp(r[k] + x * d, 1, 100);
    return t;
  };
  let lo = -60;
  let hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ovrRaw(at(mid)) < target) lo = mid;
    else hi = mid;
  }
  return clampRatings(at(hi));
}

/** Skills shifted until raw OVR reaches `target`, a share `off` of the move on offense and the rest on defense. */
export function shiftSplit(r: Ratings, target: number, off: number): Ratings {
  const w: Partial<Record<RatingKey, number>> = {};
  for (const [k, x] of Object.entries(OFFENSE) as [RatingKey, number][]) w[k] = 2 * off * x;
  for (const [k, x] of Object.entries(DEFENSE) as [RatingKey, number][]) w[k] = 2 * (1 - off) * x;
  const out = shiftRaw(r, target, w);
  // (ratings are kept to a tenth) a big that only capped ratings could move the rest of the way gets there evenly
  return Math.abs(ovrRaw(out) - target) < 0.1 ? out : shiftRaw(r, target, Object.fromEntries(SKILL_KEYS.map((k) => [k, 1])));
}

/** The display scale as the build's leveling sees it: the seed's players with a team. */
const scaleOf = (players: SeedPlayer[]) => buildOvrScale(players.filter((p) => p.team).map((p) => ovrRaw(p.ratings)));

const TEND_KEYS = ['use', 'three', 'pass', 'blk', 'stl', 'orb', 'drb', 'tov'] as const;

/**
 * Move every player's skills, stamina and event multipliers by one amount each (multipliers by one
 * factor), so that their weighted means are back where they were in `prior`. A shift every player
 * shares leaves display OVR where it was (the scale is the league's own quantiles), but for the
 * small differences in OVR weights between guards and bigs.
 */
function recentre(seed: SeedData, prior: Map<string, { r: Ratings; tend: Tendencies }>, weight: (sp: SeedPlayer) => number) {
  const keys: RatingKey[] = [...SKILL_KEYS, 'end'];
  let sw = 0;
  const dr = Object.fromEntries(keys.map((k) => [k, 0])) as Record<RatingKey, number>;
  const dt = Object.fromEntries(TEND_KEYS.map((k) => [k, 0])) as Record<(typeof TEND_KEYS)[number], number>;
  for (const sp of seed.players) {
    const w = weight(sp);
    const was = prior.get(sp.id);
    if (!w || !was) continue;
    sw += w;
    for (const k of keys) dr[k] += (sp.ratings[k] - was.r[k]) * w;
    for (const k of TEND_KEYS) dt[k] += Math.log((sp.tend?.[k] ?? 1) / (was.tend[k] ?? 1)) * w;
  }
  for (const sp of seed.players) {
    const r = { ...sp.ratings };
    for (const k of keys) r[k] -= dr[k] / sw;
    sp.ratings = clampRatings(r);
    if (!sp.tend) continue;
    for (const k of TEND_KEYS) if (sp.tend[k] !== undefined) sp.tend[k] = Math.round(sp.tend[k]! * Math.exp(-dt[k] / sw) * 1000) / 1000;
  }
}

export const projectionNote = (season: number) => `Dunks & Threes ${season - 1}-${String(season).slice(2)} EPM projection`;

export interface ProjectionReport {
  matched: number;
  rookies: number;
  /** OVR before → after for each matched player. */
  moves: { sp: SeedPlayer; p: EpmProjection; before: number; after: number }[];
  /** Pearson r of OVR with projected EPM over the matched players with 15+ projected minutes, before and after. */
  r: [number, number];
  /** Projected team differs from the seed's. */
  teamDiffs: { sp: SeedPlayer; p: EpmProjection }[];
  /** Rostered players the projection doesn't list. */
  unlisted: SeedPlayer[];
}

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

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Apply the projection to a finished seed in place (see the top of this file). */
export function applyProjection(seed: SeedData, rows: EpmProjection[], log = console.log, weight = PROJ_WEIGHT): ProjectionReport {
  const matchedBy = matchProjection(rows, seed, log);
  const items = rows.flatMap((p) => {
    const sp = matchedBy.get(p.nbaId);
    if (!sp) return [];
    const line = realLine(sp);
    return [{ sp, p, line: line && line.min >= THIN ? line : null }];
  });
  const vets = items.filter((x): x is typeof x & { line: Line } => x.line !== null);
  const toLine = toLineScale(vets.map(({ line, p }) => ({ line, p })));
  const before = scaleOf(seed.players);
  const ovrBefore = new Map(seed.players.map((sp) => [sp.id, toDisplay(ovrRaw(sp.ratings), before)]));
  const prior = new Map(seed.players.map((sp) => [sp.id, { r: { ...sp.ratings }, tend: { ...(sp.tend ?? { use: 1, three: 1, drive: 1, pass: 1 }) } }]));
  const rawBefore = new Map(seed.players.map((sp) => [sp.id, ovrRaw(sp.ratings)]));

  // 1. the box line: multipliers by projected over real rate, shooting ratings by what the change is worth
  const fitPool = vets.filter((x) => x.line.min >= 1500);
  const shootFits = SHOOTING.map(({ key, feats }) => ({
    key,
    feats,
    b: ols(
      fitPool.map((x) => feats.map((f) => f(x.line))),
      fitPool.map((x) => x.sp.ratings[key]),
    ),
  }));
  // (steals and turnovers stay as calibrated: in the engine they follow who guards and who handles
  // the ball, which the impact and level moves already change, and moving them too tracked the
  // projected rates worse)
  const MULT: { k: 'blk' | 'orb' | 'drb'; rate: Rate }[] = [
    { k: 'blk', rate: 'blk' },
    { k: 'orb', rate: 'orb' },
    { k: 'drb', rate: 'drb' },
  ];
  const ratio = (a: number, b: number, lo = 0.6, hi = 1.6) => clamp((a + 0.05) / (b + 0.05), lo, hi);
  const fga = (l: Line) => l.fg2a + l.fg3a;
  for (const { sp, p, line } of items) {
    const proj = toLine(p);
    const r = { ...sp.ratings };
    const tend = sp.tend ? { ...sp.tend } : { use: 1, three: 1, drive: 1, pass: 1 };
    if (line) {
      for (const { key, feats, b } of shootFits)
        r[key] += clamp(
          predict(
            b,
            feats.map((f) => f(proj)),
          ) -
            predict(
              b,
              feats.map((f) => f(line)),
            ),
          -12,
          12,
        );
      for (const { k, rate } of MULT) tend[k] = (tend[k] ?? 1) * ratio(proj[rate], line[rate]);
      // usage, three-point share and assists as derive.ts reads them (a share smoothed so that a
      // center's few threes can't multiply a calibrated tendency, capped where the seed's top out)
      if (Number.isFinite(line.usg)) tend.use *= ratio(proj.usg, line.usg, 0.7, 1.4) ** 1.2;
      tend.three = Math.min(Math.max(5, tend.three), tend.three * ratio(proj.fg3a / fga(proj) + 0.1, line.fg3a / Math.max(0.1, fga(line)) + 0.1, 0.67, 1.5));
      tend.pass *= ratio(proj.ast, line.ast, 0.7, 1.4) ** 0.6;
    } else {
      for (const { key, feats, b } of shootFits)
        r[key] +=
          ROOKIE_WEIGHT *
          (predict(
            b,
            feats.map((f) => f(proj)),
          ) -
            r[key]);
      const lerp = (a: number, b: number) => a + ROOKIE_WEIGHT * (b - a);
      tend.use = lerp(tend.use, clamp(Math.pow((proj.usg * 100) / 19, 1.2), 0.35, 2.6));
      tend.three = lerp(tend.three, clamp((proj.fg3a / fga(proj) + 0.03) / 0.41, 0.03, 2.6));
      tend.pass = lerp(tend.pass, clamp(Math.pow(Math.max(3, proj.astPct) / 15, 0.6), 0.5, 2));
    }
    for (const k of TEND_KEYS) if (tend[k] !== undefined) tend[k] = Math.round(tend[k]! * 1000) / 1000;
    sp.ratings = clampRatings(r);
    sp.tend = tend;
  }

  // 2. impact: the IQs and defenses by the change from three-season EPM to the projection, in standard deviations
  const withEpm = vets.filter((x) => Number.isFinite(x.line.off) && x.line.epmMin >= 500);
  const zOf = (vals: { v: number; w: number }[]) =>
    meanSd(
      vals.map((x) => x.v),
      vals.map((x) => x.w),
    );
  const realO = zOf(withEpm.map((x) => ({ v: x.line.off, w: Math.sqrt(x.line.min) })));
  const realD = zOf(withEpm.map((x) => ({ v: x.line.def, w: Math.sqrt(x.line.min) })));
  const pool = items.filter((x) => x.p.mpg >= 12);
  const projO = zOf(pool.map((x) => ({ v: x.p.off, w: x.p.mpg })));
  const projD = zOf(pool.map((x) => ({ v: x.p.def, w: x.p.mpg })));
  const IMPACT: { key: RatingKey; side: 'off' | 'def' }[] = [
    { key: 'oiq', side: 'off' },
    { key: 'diq', side: 'def' },
    { key: 'perD', side: 'def' },
    { key: 'intD', side: 'def' },
  ];
  const zReal = (l: Line, side: 'off' | 'def') => (side === 'off' ? (l.off - realO.m) / realO.sd : (l.def - realD.m) / realD.sd);
  const zProj = (p: EpmProjection, side: 'off' | 'def') => (side === 'off' ? (p.off - projO.m) / projO.sd : (p.def - projD.m) / projD.sd);
  const impactFits = IMPACT.map(({ key, side }) => ({
    key,
    side,
    b: ols(
      withEpm.map((x) => [zReal(x.line, side)]),
      withEpm.map((x) => x.sp.ratings[key]),
      withEpm.map((x) => Math.sqrt(x.line.min)),
    ),
  }));
  log(`  impact per SD of EPM: ${impactFits.map((f) => `${f.key} ${f.b[1].toFixed(1)}`).join(', ')}`);
  const hasEpm = new Set(withEpm.map((x) => x.sp.id));
  for (const { sp, p, line } of items) {
    const r = { ...sp.ratings };
    const has = line && hasEpm.has(sp.id);
    for (const { key, side, b } of impactFits) {
      const zp = clamp(zProj(p, side), -3.6, 3.6);
      r[key] += has ? clamp(b[1] * (zp - zReal(line!, side)), -15, 15) : ROOKIE_WEIGHT * (predict(b, [zp]) - r[key]);
    }
    sp.ratings = clampRatings(r);
  }

  // 3. the level: OVR mostly from where projected EPM ranks. The seed's own raw OVRs are handed out in
  // projected-EPM order, so the league keeps its spread of raw ratings, which the display scale, the
  // fictional leagues, development and aging are all tuned to (and display OVR its distribution).
  const ranked = [...items].sort((a, b) => a.p.tot - b.p.tot);
  const raws = ranked.map((x) => rawBefore.get(x.sp.id)!).sort((a, b) => a - b);
  const target = new Map(seed.players.map((sp) => [sp.id, rawBefore.get(sp.id)!]));
  ranked.forEach((x, i) => target.set(x.sp.id, weight * raws[i] + (1 - weight) * rawBefore.get(x.sp.id)!));
  const moved = new Set(items.map((x) => x.sp.id));
  // the end of the floor to move: where the projection disagrees most with his ratings now
  const curO = meanSd(
    items.map((x) => x.sp.ratings.oiq),
    items.map(() => 1),
  );
  const curD = meanSd(
    items.map((x) => (x.sp.ratings.diq + x.sp.ratings.perD + x.sp.ratings.intD) / 3),
    items.map(() => 1),
  );
  const offShare = new Map(
    items.map(({ sp, p }) => {
      const up = target.get(sp.id)! >= rawBefore.get(sp.id)! ? 1 : -1;
      const dO = up * (zProj(p, 'off') - (sp.ratings.oiq - curO.m) / curO.sd);
      const dD = up * (zProj(p, 'def') - ((sp.ratings.diq + sp.ratings.perD + sp.ratings.intD) / 3 - curD.m) / curD.sd);
      const wO = Math.max(0, dO) + 0.4;
      const wD = Math.max(0, dD) + 0.4;
      return [sp.id, clamp(wO / (wO + wD), 0.2, 0.8)];
    }),
  );
  const settle = () => {
    for (const sp of seed.players) {
      const t = target.get(sp.id)!;
      if (Math.abs(ovrRaw(sp.ratings) - t) < 0.1) continue;
      sp.ratings = moved.has(sp.id) ? shiftSplit(sp.ratings, t, offShare.get(sp.id)!) : shiftRaw(sp.ratings, t, Object.fromEntries(SKILL_KEYS.map((k) => [k, 1])));
    }
  };
  settle();

  // 4. stamina follows half the change in minutes, and each player keeps his projection
  for (const { sp, p, line } of items) {
    const age = seed.season - sp.bornYear;
    const games = sp.stats.filter((s) => s.real && !s.playoffs && s.season === seed.season - 1).reduce((a, s) => a + s.gp, 0);
    const mpg = line && games ? sp.stats.filter((s) => s.real && !s.playoffs && s.season === seed.season - 1).reduce((a, s) => a + s.min, 0) / games : null;
    const toward = staminaFromMinutes(p.mpg, age);
    sp.ratings.end = r1(clamp(mpg !== null ? sp.ratings.end + 0.5 * (toward - staminaFromMinutes(mpg, age)) : sp.ratings.end + ROOKIE_WEIGHT * (toward - sp.ratings.end), 25, 92));
    sp.proj = { season: p.season, mpg: r1(p.mpg), oepm: r1(p.off), depm: r1(p.def), epm: r1(p.tot) } satisfies SeedProjection;
  }
  // (the event multipliers were set against his ratings as they were: they take back what the impact
  // and level moves did to the composites the engine's events read, so the box line stays projected)
  for (const { sp } of items) {
    const was = composites(prior.get(sp.id)!.r);
    const now = composites(sp.ratings);
    const t = sp.tend!;
    const blockSkill = (r: Ratings) => 0.7 * r.blk + 0.18 * r.hgt + 0.12 * r.ath;
    const fix: [keyof Tendencies, number][] = [
      ['orb', (was.orb / now.orb) ** 2],
      ['drb', (was.drb / now.drb) ** 2.2],
      ['blk', (blockSkill(prior.get(sp.id)!.r) / blockSkill(sp.ratings)) ** 2],
    ];
    for (const [k, f] of fix) (t as unknown as Record<string, number>)[k] = Math.round((t[k] ?? 1) * clamp(f, 0.7, 1.4) * 1000) / 1000;
  }

  // 5. the league keeps its level: the projection ages every veteran a year and the rookies' college
  // numbers translate low, but the league they make up is no worse, and the engine's rates are tuned
  // to it. So every rating and multiplier is moved back to its old mean over the rotations (rostered
  // players, by projected minutes), each player keeping his move against the rest, and the OVRs are
  // settled on their targets again.
  recentre(seed, prior, (sp) => (sp.team ? (sp.proj?.mpg ?? 10) : 0));
  settle();
  seed.source = seed.source.includes(projectionNote(seed.season)) ? seed.source : `${seed.source}; ${projectionNote(seed.season)}`;

  const after = scaleOf(seed.players);
  const corrPool = items.filter((x) => x.p.mpg >= 15);
  const corr = (ovr: (sp: SeedPlayer) => number) =>
    pearson(
      corrPool.map((x) => ovr(x.sp)),
      corrPool.map((x) => x.p.tot),
    );
  const listed = new Set(items.map((x) => x.sp.id));
  return {
    matched: items.length,
    rookies: items.length - vets.length,
    moves: items.map(({ sp, p }) => ({ sp, p, before: ovrBefore.get(sp.id)!, after: toDisplay(ovrRaw(sp.ratings), after) })),
    r: [corr((sp) => ovrBefore.get(sp.id)!), corr((sp) => toDisplay(ovrRaw(sp.ratings), after))],
    teamDiffs: items.filter(({ sp, p }) => (sp.team ?? '') !== seedTeam(p.team)).map(({ sp, p }) => ({ sp, p })),
    unlisted: seed.players.filter((sp) => sp.team && !listed.has(sp.id)),
  };
}
