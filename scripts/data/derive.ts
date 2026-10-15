// Turn three seasons of per-game + advanced stats (and Dunks & Threes EPM) into internal ratings.
// Seasons are weighted by recency and minutes, then regressed toward a size-appropriate
// mean in proportion to sample size. Ratings are a first guess; calibrate.ts then nudges
// them until each player reproduces his real per-36 profile in the engine.

import type { Ratings, Tendencies } from '../../src/core/types';
import { clampRatings, heightToRating } from '../../src/core/ratings';
import { Rng, clamp, hashString } from '../../src/core/random';
import { genRatings } from '../../src/core/playerGen';
import type { AdvRow, PerGameRow } from './parse';
import type { PbpAgg } from './nba/profile';
import type { EpmAgg } from './epm';
import { SEED_SEASON } from './sources';

/** Recency weights for the stat seasons (box scores and play-by-play alike). */
export const SEASON_WEIGHT: Record<number, number> = { [SEED_SEASON - 1]: 1.0, [SEED_SEASON - 2]: 0.6, [SEED_SEASON - 3]: 0.3 };

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
  /** NBA.com play-by-play profile (shot zones, creation, defense, RAPM), when matched. */
  pbp?: PbpAgg;
  /** Dunks & Threes EPM, when the player is in the exports. */
  epm?: EpmAgg;
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

export interface PopStats {
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
    ...pbpFeatures(a.pbp),
    // NaN without EPM (z-scores treat NaN as 0, and the impact ratings below fall back to box plus-minus)
    epmO: a.epm ? a.epm.off : NaN,
    epmD: a.epm ? a.epm.def : NaN,
  };
}

const bayes = (m: number, n: number, prior: number, k: number) => (m + prior * k) / (n + k);

/** Play-by-play features; NaN when the player has no NBA.com profile (z-scores treat NaN as 0). */
export function pbpFeatures(b?: PbpAgg) {
  const N = NaN;
  if (!b || b.mins < 60) {
    return {
      rimPct: N,
      paintPct: N,
      midPct: N,
      rimShare: N,
      midShare: N,
      unast: N,
      pullupShare: N,
      driveShare: N,
      postShare: N,
      cutRate: N,
      dunkRate: N,
      transShare: N,
      sfdRate: N,
      orbTrue: N,
      drbTrue: N,
      badPassRate: N,
      lostBallRate: N,
      rimDeter: N,
      rimFgAllowed: N,
      blkRim: N,
      mdSaved: N,
      rapmO: N,
      rapmD: N,
    };
  }
  const fga = b.fga.rim + b.fga.paint + b.fga.mid + b.fga.c3 + b.fga.ab3;
  const fgm = b.fgm.rim + b.fgm.paint + b.fgm.mid + b.fgm.c3 + b.fgm.ab3;
  const per36 = (x: number) => (x / Math.max(1, b.mins)) * 36;
  // RAPM regressed by its own sample: 6000 weighted possessions count about half
  const rel = b.rapmPoss / (b.rapmPoss + 6000);
  return {
    rimPct: bayes(b.fgm.rim, b.fga.rim, 0.655, 60),
    paintPct: bayes(b.fgm.paint, b.fga.paint, 0.45, 50),
    midPct: bayes(b.fgm.mid, b.fga.mid, 0.42, 50),
    rimShare: fga ? b.fga.rim / fga : N,
    midShare: fga ? b.fga.mid / fga : N,
    unast: fgm ? 1 - b.astFgm / fgm : N,
    pullupShare: fga ? b.pullup / fga : N,
    driveShare: fga ? b.drive / fga : N,
    postShare: fga ? b.post / fga : N,
    cutRate: per36(b.cut),
    dunkRate: b.fga.rim > 10 ? b.dunk / b.fga.rim : N,
    transShare: fga ? b.trans / fga : N,
    sfdRate: fga ? b.sfDrawn / fga : N,
    orbTrue: b.orbChances > 50 ? b.orb / b.orbChances : N,
    drbTrue: b.drbChances > 50 ? b.drb / b.drbChances : N,
    badPassRate: b.ast + b.tovBadPass > 10 ? b.tovBadPass / (b.ast + b.tovBadPass) : N,
    lostBallRate: per36(b.tovLostBall),
    rimDeter: b.oppFga > 200 ? b.oppRimA / b.oppFga : N,
    rimFgAllowed: b.oppRimA > 100 ? bayes(b.oppRimM, b.oppRimA, 0.66, 300) : N,
    blkRim: b.oppRimA > 100 ? b.blkRim / b.oppRimA : N,
    mdSaved: b.mdPoss > 100 ? b.mdSaved : N,
    rapmO: b.rapmO * rel,
    rapmD: b.rapmD * rel,
  };
}

export function popStats(aggs: Agg[]): PopStats {
  const pool = aggs.filter((a) => a.rawMin >= 500);
  const feats = pool.map((a) => ({ f: features(a) as Record<string, number>, w: Math.sqrt(a.wMin) }));
  const keys = Object.keys(feats[0].f);
  const mean: Record<string, number> = {};
  const sd: Record<string, number> = {};
  for (const k of keys) {
    let sw = 0;
    let s = 0;
    for (const { f, w } of feats) {
      if (!Number.isFinite(f[k])) continue;
      sw += w;
      s += f[k] * w;
    }
    mean[k] = sw ? s / sw : 0;
    let v = 0;
    for (const { f, w } of feats) if (Number.isFinite(f[k])) v += w * (f[k] - mean[k]) ** 2;
    sd[k] = sw ? Math.sqrt(v / sw) || 1 : 1;
  }
  return { mean, sd };
}

/** Stamina from real minutes per game, with a soft age-based floor (half the shortfall below it is forgiven). */
export function staminaFromMinutes(mpg: number, age: number): number {
  const raw = 38 + (mpg - 18) * 1.5;
  const floor = age <= 30 ? 48 : age <= 33 ? 44 : 40;
  return clamp(raw >= floor ? raw : floor - (floor - raw) * 0.5, 25, 92);
}

/** Derive ratings from stats. `rel` (0..1) is the sample reliability used to regress. */
export function deriveRatings(a: Agg, bio: Bio, pop: PopStats, seedKey: string): { r: Ratings; tend: Tendencies; rel: number } {
  const f = features(a) as Record<string, number>;
  const rel = a.wMin / (a.wMin + 500);
  const z = (k: string) => (Number.isFinite(f[k]) ? clamp(((f[k] - pop.mean[k]) / pop.sd[k]) * rel, -3.6, 3.6) : 0);
  // NBA.com play-by-play profile available: shot zones, creation, true rebound rates, defense, RAPM
  const has = Number.isFinite(f.rimPct);
  const h = heightToRating(bio.heightIn || 79);
  const hz = (h - 50) / 15;
  const wz = ((bio.weightLb || 220) - 220) / 25;
  const rng = new Rng(hashString(seedKey));
  const age = bio.age || a.lastAge || 26;
  // Impact: Dunks & Threes EPM, when he has it, takes box plus-minus's place in the impact ratings
  // (offensive and defensive IQ; perimeter and interior defense read no box plus-minus with the
  // play-by-play). It is box plus-minus done better, a box and tracking prior refined by lineup
  // data, while our own RAPM keeps its weight. Weighed in 20 simulated seasons against leaning
  // on EPM harder or splitting RAPM's weight with it, this kept simulated team results closest to
  // the players' real impact and moved OVR toward both EPM and RAPM.
  const ob = Number.isFinite(f.epmO) ? 'epmO' : 'obpm';
  const db = Number.isFinite(f.epmD) ? 'epmD' : 'dbpm';
  const r: Ratings = {
    hgt: h,
    spd: 72 - 0.42 * h + 5 * z('stlPct') + 2 * z('ftr') + (has ? 3 * z('transShare') + 2 * z('driveShare') : 0) - Math.max(0, age - 29) * 1.8 + rng.normal(0, 3),
    ath:
      52 +
      (has ? 5 * z('dunkRate') + 3 * z('blkPct') + 3 * z('orbPct') + 2 * z('transShare') : 5 * z('blkPct') + 4 * z('orbPct') + 4 * z('ftr')) -
      0.05 * h -
      Math.max(0, age - 29) * 2 +
      rng.normal(0, 3),
    str: 48 + 10 * wz + 3 * hz,
    // real minutes reflect role as much as conditioning: a soft floor by age lifts bench players
    // (so one promoted can carry mid-20s minutes) but keeps their order, so stamina still says
    // who has carried a big role (the rotation AI also remembers last season's minutes)
    end: staminaFromMinutes(a.mpg, age),
    ins: has ? 50 + 10 * z('rimPct') + 3 * z('ftr') + 2 * z('dunkRate') + 3 * hz : 50 + 9 * z('fg2Pct') + 4 * z('ftr') + 4 * hz,
    mid: has ? 48 + 9 * z('midPct') + 4 * z('paintPct') + 3 * z('pullupShare') + 3 * z('ftPct') - 2 * hz : 48 + 9 * z('ftPct') + 4 * z('tpa36') + 4 * z('usg') - 3 * hz,
    tp: 47 + 11 * z('fg3Pct') + 11 * z('tpa36'),
    ft: clamp((a.ftPct - 0.42) / 0.0052, 1, 100),
    hnd: has
      ? 50 + 6 * z('usg') + 6 * z('unast') + 3 * z('pullupShare') + 4 * z('astPct') - 4 * z('lostBallRate') - 5 * hz
      : 50 + 8 * z('usg') + 8 * z('astPct') - 3 * z('tovPct') - 6 * hz,
    pas: has ? 50 + 12 * z('astPct') + 2 * z('obpm') - 3 * z('badPassRate') : 50 + 13 * z('astPct') + 2 * z('obpm'),
    oiq: has ? 50 + 5 * z(ob) + 6 * z('rapmO') + 3 * z('ts') + 2 * z('usg') : 50 + 8 * z(ob) + 4 * z('ts') + 3 * z('usg'),
    drw: has ? 48 + 9 * z('sfdRate') + 5 * z('fta36') : 48 + 11 * z('fta36') + 3 * z('ftr'),
    post: has ? 30 + 8 * hz + 9 * z('postShare') + 4 * z('usg') + 4 * wz : 30 + 9 * hz + 6 * z('usg') + 5 * wz - 4 * z('tpar'),
    perD: has ? 50 + 5 * z('mdSaved') + 4 * z('rapmD') + 4 * z('stlPct') - 3 * hz : 50 + 6 * z(db) + 6 * z('stlPct') - 3 * hz,
    intD: has
      ? 46 + 5 * z('rapmD') + 5 * z('blkRim') - 4 * z('rimFgAllowed') - 3 * z('rimDeter') + 6 * hz + 2 * z('drbPct')
      : 46 + 6 * z(db) + 7 * z('blkPct') + 7 * hz + 3 * z('drbPct'),
    stl: 50 + 14 * z('stlPct'),
    blk: 46 + 13 * z('blkPct') + 4 * hz,
    diq: has ? 50 + 5 * z(db) + 7 * z('rapmD') + 2 * z('mdSaved') + z('stlPct') + z('blkPct') : 50 + 9 * z(db) + 2 * z('stlPct') + 2 * z('blkPct'),
    oreb: 48 + 14 * z(has && Number.isFinite(f.orbTrue) ? 'orbTrue' : 'orbPct') + 3 * hz,
    dreb: 48 + 14 * z(has && Number.isFinite(f.drbTrue) ? 'drbTrue' : 'drbPct') + 3 * hz,
  };
  const b = a.pbp;
  const pbpFga = b ? b.fga.rim + b.fga.paint + b.fga.mid + b.fga.c3 + b.fga.ab3 : 0;
  const tend: Tendencies = {
    use: clamp(Math.pow(Math.max(5, a.adv.usg || 18) / 19, 1.2), 0.35, 2.6),
    three: clamp(((a.per36.fga ? a.per36.fg3a / a.per36.fga : 0.38) + 0.03) / 0.41, 0.03, 2.6),
    drive: has && b ? clamp(Math.pow((b.fga.rim / pbpFga + 0.02) / 0.3, 0.8), 0.3, 3) : 1,
    pass: clamp(Math.pow(Math.max(3, a.adv.ast || 14) / 15, 0.6), 0.5, 2),
  };
  if (has && b) {
    tend.mid = clamp(Math.pow((b.fga.mid / pbpFga + 0.01) / 0.12, 0.8), 0.1, 4);
    const t3 = b.fga.c3 + b.fga.ab3;
    tend.corner = t3 > 20 ? clamp(Math.pow((b.fga.c3 / t3 + 0.02) / 0.28, 0.9), 0.2, 4) : 1;
    tend.create = clamp(Math.pow((Number.isFinite(f.unast) ? f.unast : 0.45) / 0.45, 1.1), 0.3, 3);
  }
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
