// Turn three seasons of per-game + advanced stats into internal ratings.
// Seasons are weighted by recency and minutes, then regressed toward a size-appropriate
// mean in proportion to sample size. Ratings are a first guess; calibrate.ts then nudges
// them until each player reproduces his real per-36 profile in the engine.

import type { Ratings, Tendencies } from '../../src/core/types';
import { clampRatings, heightToRating } from '../../src/core/ratings';
import { Rng, clamp, hashString } from '../../src/core/random';
import { genRatings } from '../../src/core/playerGen';
import type { AdvRow, PerGameRow } from './parse';

export const SEASON_WEIGHT: Record<number, number> = { 2026: 1.0, 2025: 0.6, 2024: 0.3 };

export interface Agg {
  /** Weighted minutes (recency-weighted). */
  wMin: number;
  /** Raw total minutes across seasons. */
  rawMin: number;
  games: number;
  mpg: number; // recency-weighted minutes per game
  per36: Record<'fga' | 'fg3a' | 'fg3' | 'fg2a' | 'fg2' | 'fta' | 'ft' | 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'pts', number>;
  fg3Pct: number;
  fg2Pct: number;
  ftPct: number;
  adv: Record<'usg' | 'ast' | 'orb' | 'drb' | 'stl' | 'blk' | 'tov' | 'obpm' | 'dbpm' | 'bpm' | 'ts' | 'ws48' | 'vorp', number>;
  lastAge: number;
  pos: string;
}

const STATS = ['fga', 'fg3a', 'fg3', 'fg2a', 'fg2', 'fta', 'ft', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const;

/** Aggregate a player's rows (use per-team rows or combined rows, never both). */
export function aggregate(rows: PerGameRow[], adv: AdvRow[]): Agg | null {
  let wMin = 0;
  let rawMin = 0;
  let games = 0;
  let wGames = 0;
  const tot: Record<string, number> = {};
  for (const k of STATS) tot[k] = 0;
  let lastAge = 0;
  let lastSeason = 0;
  let pos = '';
  for (const r of rows) {
    const w = SEASON_WEIGHT[r.season] ?? 0.2;
    const mins = r.mp * r.g;
    rawMin += mins;
    wMin += mins * w;
    games += r.g;
    wGames += r.g * w;
    for (const k of STATS) tot[k] += (r[k] as number) * r.g * w;
    if (r.season >= lastSeason) {
      lastSeason = r.season;
      lastAge = r.age;
      pos = r.pos || pos;
    }
  }
  if (wMin <= 0) return null;
  const per36: Agg['per36'] = {} as Agg['per36'];
  for (const k of STATS) per36[k] = (tot[k] / wMin) * 36;
  // Bayesian shooting percentages
  const fg3Pct = (tot.fg3 + 0.345 * 120) / (tot.fg3a + 120);
  const fg2Pct = (tot.fg2 + 0.53 * 150) / (tot.fg2a + 150);
  const ftPct = (tot.ft + 0.76 * 50) / (tot.fta + 50);
  // advanced: minutes x recency weighted means
  const a: Agg['adv'] = { usg: 0, ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, obpm: 0, dbpm: 0, bpm: 0, ts: 0, ws48: 0, vorp: 0 };
  let aw = 0;
  for (const r of adv) {
    const w = (SEASON_WEIGHT[r.season] ?? 0.2) * r.mpTotal;
    if (w <= 0) continue;
    aw += w;
    a.usg += r.usgPct * w;
    a.ast += r.astPct * w;
    a.orb += r.orbPct * w;
    a.drb += r.drbPct * w;
    a.stl += r.stlPct * w;
    a.blk += r.blkPct * w;
    a.tov += r.tovPct * w;
    a.obpm += r.obpm * w;
    a.dbpm += r.dbpm * w;
    a.bpm += r.bpm * w;
    a.ts += r.ts * w;
    a.ws48 += r.ws48 * w;
    a.vorp += (r.vorp / Math.max(1, r.mpTotal)) * 2000 * w;
  }
  if (aw > 0) for (const k of Object.keys(a) as (keyof Agg['adv'])[]) a[k] /= aw;
  return { wMin, rawMin, games, mpg: wGames ? wMin / wGames : 0, per36, fg3Pct, fg2Pct, ftPct, adv: a, lastAge, pos };
}

export interface Bio {
  heightIn: number;
  weightLb: number;
  age: number;
  pos: string;
}

interface PopStats {
  mean: Record<string, number>;
  sd: Record<string, number>;
}

/** Feature vector used for z-scores. */
export function features(a: Agg) {
  const p = a.per36;
  return {
    usg: a.adv.usg,
    astPct: a.adv.ast,
    orbPct: a.adv.orb,
    drbPct: a.adv.drb,
    stlPct: a.adv.stl,
    blkPct: a.adv.blk,
    tovPct: a.adv.tov,
    obpm: a.adv.obpm,
    dbpm: a.adv.dbpm,
    ts: a.adv.ts,
    fg3Pct: a.fg3Pct,
    fg2Pct: a.fg2Pct,
    ftPct: a.ftPct,
    tpa36: Math.log1p(p.fg3a),
    fta36: Math.log1p(p.fta),
    tpar: p.fga ? p.fg3a / p.fga : 0,
    ftr: p.fga ? p.fta / p.fga : 0,
    ast36: p.ast,
    mpg: a.mpg,
  };
}

export function popStats(aggs: Agg[]): PopStats {
  const pool = aggs.filter((a) => a.rawMin >= 500);
  const keys = Object.keys(features(pool[0]));
  const mean: Record<string, number> = {};
  const sd: Record<string, number> = {};
  for (const k of keys) {
    let sw = 0;
    let s = 0;
    for (const a of pool) {
      const w = Math.sqrt(a.wMin);
      sw += w;
      s += (features(a) as Record<string, number>)[k] * w;
    }
    mean[k] = s / sw;
    let v = 0;
    for (const a of pool) {
      const w = Math.sqrt(a.wMin);
      v += w * ((features(a) as Record<string, number>)[k] - mean[k]) ** 2;
    }
    sd[k] = Math.sqrt(v / sw) || 1;
  }
  return { mean, sd };
}

/** Derive ratings from stats. `rel` (0..1) is the sample reliability used to regress. */
export function deriveRatings(a: Agg, bio: Bio, pop: PopStats, seedKey: string): { r: Ratings; tend: Tendencies; rel: number } {
  const f = features(a) as Record<string, number>;
  const rel = a.wMin / (a.wMin + 500);
  const z = (k: string) => clamp(((f[k] - pop.mean[k]) / pop.sd[k]) * rel, -3.6, 3.6);
  const h = heightToRating(bio.heightIn || 79);
  const hz = (h - 50) / 15;
  const wz = ((bio.weightLb || 220) - 220) / 25;
  const rng = new Rng(hashString(seedKey));
  const age = bio.age || a.lastAge || 26;
  const r: Ratings = {
    hgt: h,
    spd: 72 - 0.42 * h + 5 * z('stlPct') + 2 * z('ftr') - Math.max(0, age - 29) * 1.8 + rng.normal(0, 3),
    ath: 52 + 5 * z('blkPct') + 4 * z('orbPct') + 4 * z('ftr') - 0.05 * h - Math.max(0, age - 29) * 2 + rng.normal(0, 3),
    str: 48 + 10 * wz + 3 * hz,
    end: clamp(38 + (a.mpg - 18) * 1.5, 25, 92),
    ins: 50 + 9 * z('fg2Pct') + 4 * z('ftr') + 4 * hz,
    mid: 48 + 9 * z('ftPct') + 4 * z('tpa36') + 4 * z('usg') - 3 * hz,
    tp: 47 + 11 * z('fg3Pct') + 11 * z('tpa36'),
    ft: clamp((a.ftPct - 0.42) / 0.0052, 1, 100),
    hnd: 50 + 8 * z('usg') + 8 * z('astPct') - 3 * z('tovPct') - 6 * hz,
    pas: 50 + 13 * z('astPct') + 2 * z('obpm'),
    oiq: 50 + 8 * z('obpm') + 4 * z('ts') + 3 * z('usg'),
    drw: 48 + 11 * z('fta36') + 3 * z('ftr'),
    post: 30 + 9 * hz + 6 * z('usg') + 5 * wz - 4 * z('tpar'),
    perD: 50 + 6 * z('dbpm') + 6 * z('stlPct') - 3 * hz,
    intD: 46 + 6 * z('dbpm') + 7 * z('blkPct') + 7 * hz + 3 * z('drbPct'),
    stl: 50 + 14 * z('stlPct'),
    blk: 46 + 13 * z('blkPct') + 4 * hz,
    diq: 50 + 9 * z('dbpm') + 2 * z('stlPct') + 2 * z('blkPct'),
    oreb: 48 + 14 * z('orbPct') + 3 * hz,
    dreb: 48 + 14 * z('drbPct') + 3 * hz,
  };
  const tend: Tendencies = {
    use: clamp(Math.pow(Math.max(5, a.adv.usg || 18) / 19, 1.2), 0.35, 2.6),
    three: clamp(((a.per36.fga ? a.per36.fg3a / a.per36.fga : 0.38) + 0.03) / 0.41, 0.03, 2.6),
    drive: 1,
    pass: clamp(Math.pow(Math.max(3, a.adv.ast || 14) / 15, 0.6), 0.5, 2),
  };
  return { r: clampRatings(r), tend, rel };
}

/** Ratings for players without NBA stats (rookies, international signings): draft slot + profile. */
export function prospectRatings(bio: Bio, pick: number | null, seedKey: string, hint?: ProspectHint): { r: Ratings; tend: Tendencies } {
  const rng = new Rng(hashString(seedKey));
  const talent = pick ? (pick <= 30 ? 1.25 - 0.055 * (pick - 1) : -0.45 - 0.02 * (pick - 30)) : -0.85;
  const { r } = genRatings(rng, { talent: talent + (hint?.bump ?? 0), age: bio.age || 21, heightIn: bio.heightIn || undefined });
  if (hint) {
    for (const [k, v] of Object.entries(hint.mods ?? {})) r[k as keyof Ratings] += v as number;
  }
  return { r: clampRatings(r), tend: { use: hint?.use ?? 1, three: hint?.three ?? 1, drive: hint?.drive ?? 1, pass: 1 } };
}

export interface ProspectHint {
  bump?: number;
  mods?: Partial<Ratings>;
  use?: number;
  three?: number;
  drive?: number;
}

/**
 * "Reputation" profiles for headline 2026 draftees, from widely reported pre-draft scouting
 * consensus. Matched by name after the draft page is parsed; anyone not listed falls back
 * to draft slot + measurables.
 */
export const PROSPECT_HINTS: Record<string, ProspectHint> = {
  'AJ Dybantsa': { bump: 0.25, mods: { ath: 8, spd: 4, mid: 6, ins: 6, drw: 6 }, use: 1.3, drive: 1.2 },
  'Darryn Peterson': { bump: 0.25, mods: { hnd: 6, mid: 6, tp: 4, oiq: 4 }, use: 1.3 },
  'Cameron Boozer': { bump: 0.2, mods: { str: 10, post: 8, dreb: 8, oreb: 6, oiq: 6, pas: 4 }, use: 1.15 },
  'Caleb Wilson': { bump: 0.05, mods: { ath: 10, blk: 6, ins: 6, oreb: 4 }, drive: 1.15 },
  'Nate Ament': { bump: 0, mods: { tp: 6, mid: 4, hgt: 3 }, three: 1.2 },
  'Kingston Flemings': { bump: 0, mods: { spd: 10, hnd: 6, pas: 4 }, drive: 1.2 },
  'Mikel Brown Jr.': { bump: 0, mods: { tp: 8, hnd: 6, pas: 4 }, three: 1.25 },
  'Jayden Quaintance': { bump: 0, mods: { blk: 12, intD: 8, ath: 6, tp: -10 }, three: 0.3 },
};
