// What each player is worth on the floor going into the season the seed opens: points per 100
// possessions his team gains with him on it, at each end. It is the calibration's value target
// (calibrate.ts), built from the play-by-play the way the public impact metrics are:
//   1. RAPM over seven seasons of lineup stints (regular season and postseason, recent seasons
//      counting most): each player's effect with his teammates and opponents adjusted for.
//   2. A box-score prior fitted on that RAPM: his per-100 box line (scoring, shooting volume, free
//      throws, playmaking, turnovers, glass, steals, blocks, fouls) and his minutes, regressed on
//      the RAPM of the players with large samples, read for everyone.
//   3. RAPM again, each player shrunk toward his prior instead of toward average: a small sample says
//      what his box line says, a large one what his lineups did.
//   4. A year of aging from where his evidence is centred to the new season (agedImpact).
import { rapm, type RapmResult } from '../nba/rapm';
import type { SeasonPbp } from '../nba/pbp';
import type { BoxLine } from './boxscores';
import { clamp } from '../../../src/core/random';

/**
 * Seasons (by end year) behind the estimate, newest last, and how much each counts. These, the
 * penalties and the aging curve are the ones that best predicted a season the estimate hadn't seen:
 * fitted on 2019-20 to 2024-25, each variant's values predicted the points of every 2025-26 lineup
 * stint, and steeper recency, stronger shrinkage (most of all at the defensive end) and a gentler
 * aging curve than the first tried each predicted better (28% more of the lineups' spread together).
 */
export const IMPACT_WEIGHTS: Record<number, number> = { 2020: 0.03, 2021: 0.05, 2022: 0.08, 2023: 0.15, 2024: 0.3, 2025: 0.55, 2026: 1 };
/** Ridge penalties, in possessions: toward zero for the RAPM the prior is fitted on, toward the prior for the estimate. */
const LAMBDA_FIT = 1500;
const LAMBDA = { off: 5000, def: 12000 };
/** Weighted possessions a player needs to count in the prior's fit. */
const FIT_POSS = 5000;
/** The prior's coefficients are ridge-regressed too (on standardized features). */
const FIT_RIDGE = 2;

export interface Impact {
  /** Points per 100 possessions added on offense and prevented on defense. */
  off: number;
  def: number;
  /** What his box line says alone (the prior). */
  priorOff: number;
  priorDef: number;
  /** Weighted possessions behind the estimate (offense and defense). */
  poss: number;
  /** The season his evidence is centred on (weighted by possessions), by end year. */
  center: number;
}

const FEATURES = ['pts', 'fga', 'fg3a', 'fta', 'ast', 'tov', 'orb', 'drb', 'stl', 'blk', 'pf', 'mpg'] as const;
type Feature = (typeof FEATURES)[number];

/** His box line over the seasons, weighted as the stints are: per 100 possessions, and minutes a game. */
function boxFeatures(lines: BoxLine[], weights: Record<number, number>): Map<number, { f: Record<Feature, number>; poss: number }> {
  const acc = new Map<number, Record<Feature | 'poss' | 'min' | 'gp', number>>();
  for (const l of lines) {
    const w = weights[l.season];
    if (!w || l.poss <= 0) continue;
    const e = acc.get(l.pid) ?? { pts: 0, fga: 0, fg3a: 0, fta: 0, ast: 0, tov: 0, orb: 0, drb: 0, stl: 0, blk: 0, pf: 0, mpg: 0, poss: 0, min: 0, gp: 0 };
    e.pts += l.pts * w;
    e.fga += l.fga * w;
    e.fg3a += l.tpa * w;
    e.fta += l.fta * w;
    e.ast += l.ast * w;
    e.tov += l.tov * w;
    e.orb += l.orb * w;
    e.drb += l.drb * w;
    e.stl += l.stl * w;
    e.blk += l.blk * w;
    e.pf += l.pf * w;
    e.poss += l.poss * w;
    if (l.part === 'reg') {
      e.min += l.min * w;
      e.gp += l.gp * w;
    }
    acc.set(l.pid, e);
  }
  const out = new Map<number, { f: Record<Feature, number>; poss: number }>();
  for (const [pid, e] of acc) {
    const per100 = (x: number) => (100 * x) / e.poss;
    const f = Object.fromEntries(FEATURES.map((k) => [k, k === 'mpg' ? (e.gp ? e.min / e.gp : 0) : per100(e[k])])) as Record<Feature, number>;
    out.set(pid, { f, poss: e.poss });
  }
  return out;
}

/** Weighted ridge regression of y on standardized features; returns a predictor. */
function fitLinear(rows: { f: Record<Feature, number>; y: number; w: number }[]): (f: Record<Feature, number>) => number {
  const k = FEATURES.length;
  const sw = rows.reduce((a, r) => a + r.w, 0);
  const mean = FEATURES.map((c) => rows.reduce((a, r) => a + r.w * r.f[c], 0) / sw);
  const sd = FEATURES.map((c, j) => Math.sqrt(rows.reduce((a, r) => a + r.w * (r.f[c] - mean[j]) ** 2, 0) / sw) || 1);
  const ym = rows.reduce((a, r) => a + r.w * r.y, 0) / sw;
  const A = Array.from({ length: k }, () => new Float64Array(k));
  const b = new Float64Array(k);
  for (const r of rows) {
    const z = FEATURES.map((c, j) => (r.f[c] - mean[j]) / sd[j]);
    for (let i = 0; i < k; i++) {
      b[i] += r.w * z[i] * (r.y - ym);
      for (let j = 0; j < k; j++) A[i][j] += r.w * z[i] * z[j];
    }
  }
  // (the ridge in units of the average row's weight)
  for (let i = 0; i < k; i++) A[i][i] += (FIT_RIDGE * sw) / rows.length;
  const beta = gauss(A, b);
  return (f) => ym + FEATURES.reduce((a, c, j) => a + (beta[j] * (f[c] - mean[j])) / sd[j], 0);
}

function gauss(A: Float64Array[], b: Float64Array): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Each player's impact by NBA.com person id, from the seasons' stints (regular season and postseason
 * of each season in IMPACT_WEIGHTS) and the box-score lines of the same seasons.
 */
export function estimateImpact(
  seasons: SeasonPbp[],
  lines: BoxLine[],
  opts: { weights?: Record<number, number>; lambda?: { off: number; def: number }; prior?: boolean; log?: (m: string) => void } = {},
): { impact: Map<number, Impact>; fit: { off: number; def: number; n: number } } {
  const weights = opts.weights ?? IMPACT_WEIGHTS;
  const log = opts.log ?? console.log;
  const input = seasons.filter((s) => weights[s.season]).map((s) => ({ stints: s.stints, weight: weights[s.season] }));
  const plain = rapm(input, LAMBDA_FIT);
  const box = boxFeatures(lines, weights);
  // the prior: box line → RAPM, fitted on the players with large samples
  const fitRows = [...box].filter(([pid]) => (plain.poss[pid] ?? 0) >= FIT_POSS);
  const fitOff = fitLinear(fitRows.map(([pid, b]) => ({ f: b.f, y: plain.off[pid], w: plain.poss[pid] })));
  const fitDef = fitLinear(fitRows.map(([pid, b]) => ({ f: b.f, y: plain.def[pid], w: plain.poss[pid] })));
  const prior = { off: {} as Record<number, number>, def: {} as Record<number, number> };
  for (const [pid, b] of box) {
    prior.off[pid] = fitOff(b.f);
    prior.def[pid] = fitDef(b.f);
  }
  // how much of the large samples' RAPM the box line explains
  const r2 = (pred: (f: Record<Feature, number>) => number, y: Record<number, number>) => {
    const w = fitRows.map(([pid]) => plain.poss[pid]);
    const sw = w.reduce((a, b) => a + b, 0);
    const ym = fitRows.reduce((a, [pid], i) => a + w[i] * y[pid], 0) / sw;
    const ss = fitRows.reduce((a, [pid], i) => a + w[i] * (y[pid] - ym) ** 2, 0);
    const res = fitRows.reduce((a, [pid, b], i) => a + w[i] * (y[pid] - pred(b.f)) ** 2, 0);
    return 1 - res / ss;
  };
  const fit = { off: r2(fitOff, plain.off), def: r2(fitDef, plain.def), n: fitRows.length };
  const est: RapmResult = rapm(input, opts.lambda ?? LAMBDA, opts.prior === false ? undefined : prior);
  // where each player's evidence sits in time
  const center = new Map<number, [number, number]>();
  for (const s of seasons) {
    const w = weights[s.season];
    if (!w) continue;
    for (const p of Object.values(s.players)) {
      const c = center.get(p.id) ?? [0, 0];
      const poss = (p.offPoss + p.defPoss) * w;
      center.set(p.id, [c[0] + poss * s.season, c[1] + poss]);
    }
  }
  const impact = new Map<number, Impact>();
  for (const pidS of Object.keys(est.off)) {
    const pid = Number(pidS);
    const c = center.get(pid);
    impact.set(pid, {
      off: est.off[pid],
      def: est.def[pid],
      priorOff: prior.off[pid] ?? 0,
      priorDef: prior.def[pid] ?? 0,
      poss: est.poss[pid] ?? 0,
      center: c && c[1] > 0 ? c[0] / c[1] : Math.max(...Object.keys(weights).map(Number)),
    });
  }
  log(
    `  impact: RAPM over ${input.reduce((a, s) => a + s.stints.length, 0).toLocaleString('en-US')} stints, ${impact.size} players; box prior fitted on ${fit.n} (R² ${fit.off.toFixed(2)} offense, ${fit.def.toFixed(2)} defense)`,
  );
  return { impact, fit };
}

/**
 * What a year of aging does to a player's impact at `age` (points per 100): young players gain,
 * mostly on offense, until 27; then they lose, at both ends, faster each year.
 */
export function agingStep(age: number): { off: number; def: number } {
  const total = clamp(0.12 * (27 - age), -1.1, 0.75);
  const offShare = total > 0 ? 0.65 : 0.5;
  return { off: total * offShare, def: total * (1 - offShare) };
}

/** His impact moved from where his evidence is centred to the season `season`, at his age then. */
export function agedImpact(i: Impact, season: number, ageThen: number): { off: number; def: number } {
  const years = Math.max(0, season - i.center);
  const step = agingStep(ageThen - years / 2);
  return { off: i.off + step.off * years, def: i.def + step.def * years };
}
