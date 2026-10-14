import type { Contract, Mood, Player, PlayerStats, Pos, Ratings, Tendencies } from './types';
import { Rng, clamp } from './random';
import { NAME_POOLS } from './names';
import { archetype, clampRatings, heightToRating, inferPos, ovrRaw, potential, toDisplay, type OvrScale } from './ratings';

type Archetype = 'shooter' | 'slasher' | 'playmaker' | 'scorer' | 'athlete' | 'defender' | 'rimProtector' | 'stretch' | 'postScorer' | 'rebounder' | 'twoWay' | 'connector';

const ARCH_MODS: Record<Archetype, Partial<Ratings>> = {
  shooter: { tp: 16, ft: 11, mid: 8, oiq: 3 },
  slasher: { ins: 12, ath: 11, spd: 8, drw: 11, tp: -8 },
  playmaker: { pas: 16, hnd: 12, oiq: 8 },
  scorer: { mid: 11, tp: 6, hnd: 8, oiq: 6, drw: 7 },
  athlete: { ath: 16, spd: 10, blk: 5, oiq: -6, end: 6 },
  defender: { perD: 14, stl: 10, diq: 10, tp: -4 },
  rimProtector: { blk: 18, intD: 12, dreb: 8, tp: -10, hnd: -6 },
  stretch: { tp: 18, ft: 12, post: -6, blk: -5, oreb: -6 },
  postScorer: { post: 18, str: 10, ins: 8, spd: -6 },
  rebounder: { oreb: 16, dreb: 16, str: 8 },
  twoWay: { perD: 8, tp: 8, oiq: 4, diq: 5 },
  connector: { pas: 9, oiq: 10, diq: 8 },
};

const GUARD_ARCH: Archetype[] = ['shooter', 'slasher', 'playmaker', 'scorer', 'athlete', 'defender', 'twoWay', 'connector'];
const WING_ARCH: Archetype[] = ['shooter', 'slasher', 'scorer', 'athlete', 'defender', 'twoWay', 'connector', 'playmaker'];
const BIG_ARCH: Archetype[] = ['rimProtector', 'stretch', 'postScorer', 'rebounder', 'athlete', 'connector', 'defender'];

/** Baseline attribute for an average NBA player of a given size rating h (0..100). */
function baseline(h: number): Ratings {
  return {
    hgt: h,
    spd: 74 - 0.42 * h,
    ath: 56 - 0.04 * h,
    str: 22 + 0.6 * h,
    end: 55,
    ins: 40 + 0.22 * h,
    mid: 54 - 0.12 * h,
    tp: 60 - 0.33 * h,
    ft: 74 - 0.26 * h,
    hnd: 76 - 0.56 * h,
    pas: 66 - 0.42 * h,
    oiq: 50,
    drw: 46,
    post: 18 + 0.52 * h,
    perD: 60 - 0.24 * h,
    intD: 18 + 0.62 * h,
    stl: 56 - 0.2 * h,
    blk: 8 + 0.78 * h,
    diq: 50,
    oreb: 12 + 0.72 * h,
    dreb: 20 + 0.66 * h,
  };
}

const SKILL_KEYS: (keyof Ratings)[] = ['ins', 'mid', 'tp', 'ft', 'hnd', 'pas', 'oiq', 'drw', 'post', 'perD', 'intD', 'stl', 'blk', 'diq', 'oreb', 'dreb'];
const PHYS_KEYS: (keyof Ratings)[] = ['spd', 'ath', 'str', 'end'];

export interface GenOpts {
  heightIn?: number;
  /** Talent z-score: 0 = average NBA rotation player, +2.5 = star, -1.5 = fringe. */
  talent: number;
  age: number;
}

export function genRatings(rng: Rng, o: GenOpts): { r: Ratings; heightIn: number } {
  const heightIn = o.heightIn ?? clamp(Math.round(rng.normal(78.6, 3.3)), 70, 88);
  const h = heightToRating(heightIn + rng.normal(0, 0.8)); // wingspan noise
  const r = baseline(h);
  const pool = h >= 58 ? BIG_ARCH : h >= 44 ? WING_ARCH : GUARD_ARCH;
  const a1 = rng.pick(pool);
  let a2 = rng.pick(pool);
  if (a2 === a1) a2 = rng.pick(pool);
  for (const [arch, w] of [
    [a1, 1],
    [a2, 0.55],
  ] as [Archetype, number][]) {
    const mods = ARCH_MODS[arch];
    for (const k in mods) {
      const key = k as keyof Ratings;
      r[key] += (mods[key] ?? 0) * w;
    }
  }
  // talent shifts skills strongly, physical tools mildly
  for (const k of SKILL_KEYS) r[k] += o.talent * 7.5 + rng.normal(0, 7);
  for (const k of PHYS_KEYS) r[k] += o.talent * 3 + rng.normal(0, 8);
  // age: young players are raw, especially in IQ; athleticism peaks mid-20s
  const youth = clamp(25 - o.age, 0, 7);
  for (const k of SKILL_KEYS) r[k] -= youth * 1.4;
  r.oiq -= youth * 1.6;
  r.diq -= youth * 1.6;
  r.str -= youth * 1.8;
  const old = clamp(o.age - 29, 0, 10);
  r.spd -= old * 2.2;
  r.ath -= old * 2.4;
  r.end -= old * 1.5;
  r.oiq += old * 0.8;
  r.diq += old * 0.6;
  return { r: clampRatings(r), heightIn };
}

// ---------------------------------------------------------------- tendencies

const TEND_KEYS = ['use', 'three', 'drive', 'pass', 'blk', 'stl', 'orb', 'drb', 'tov', 'pf', 'mid', 'corner', 'create'] as const;
type TendKey = (typeof TEND_KEYS)[number];

/**
 * Hidden tendencies for players the seed didn't calibrate (draft classes, fictional leagues), drawn
 * the way the seed's calibrated ones relate to a player's level and size: log(tendency) = b0 +
 * b1·(OVR-75)/8 + b2·max(0, OVR-80)/8 + b3·(size-50)/15 (a minutes-weighted fit over the real
 * players), plus a personal style with the spread left around the fit (sd). Real stars carry two to
 * three times a role player's usage, create their own shots, foul less and leave corner threes to
 * others; a generated 88 without tendencies shot like a role player (and the engine caps such a
 * player's share of the offense lower), so long careers drifted toward parity and threes as real
 * players retired. Level and size only: fits on skill profiles mislead on generated players, whose
 * skills relate to each other differently. The event intercepts (b0) are then set so that a real
 * league with every player replaced by a generated one keeps the real league's shot diet, assists,
 * turnovers, steals, blocks and fouls. lo/hi are the calibration's bounds.
 */
const TEND_MODEL: Record<TendKey, { b: [number, number, number, number]; sd: number; lo: number; hi: number }> = {
  use: { b: [0.285, 0.208, 0.398, -0.288], sd: 0.79, lo: 0.1, hi: 25 },
  three: { b: [-0.22, -0.352, 0.263, -0.119], sd: 1.13, lo: 0.02, hi: 5 },
  drive: { b: [-0.347, 0.039, -0.11, -0.012], sd: 0.78, lo: 0.15, hi: 5 },
  pass: { b: [0.374, 0.253, -0.375, 0.071], sd: 0.51, lo: 0.25, hi: 6 },
  blk: { b: [0.225, 0.068, 0.016, -0.278], sd: 0.35, lo: 0.15, hi: 6 },
  stl: { b: [0.007, 0.053, 0.01, -0.058], sd: 0.21, lo: 0.2, hi: 5 },
  orb: { b: [0.06, 0.023, -0.257, 0.064], sd: 0.54, lo: 0.08, hi: 5 },
  drb: { b: [0.095, 0.121, -0.011, -0.239], sd: 0.25, lo: 0.08, hi: 5 },
  tov: { b: [0.114, -0.014, -0.22, 0.293], sd: 0.27, lo: 0.3, hi: 3.5 },
  pf: { b: [0.195, -0.32, -0.233, 0.066], sd: 0.55, lo: 0.15, hi: 3 },
  mid: { b: [0.276, 0.098, -0.029, 0.356], sd: 0.82, lo: 0.05, hi: 6 },
  corner: { b: [0.463, -0.105, -1.05, 0.041], sd: 0.79, lo: 0.1, hi: 6 },
  create: { b: [-0.253, 0.348, 0.262, -0.325], sd: 0.86, lo: 0.15, hi: 5 },
};

/**
 * The calibrated tendencies were fitted to each real player's own numbers, so their spread around
 * the fit, and part of its rise with level, also make up for what that player's ratings miss. Drawn
 * whole on top of ratings that already make a star the first option, they compound: the real league
 * with every player's tendencies generated had a 58-point scorer, 20 players over 30 a game and 190
 * 50-point games a season (with its calibrated ones: 1 and 20), and fictional leagues the same.
 * Size compounds the same way: generated guards' ratings already make them the ball handlers, and
 * with the fit's whole size term on top a fictional league's small guards used 27% of their teams'
 * possessions (the real ones 25%) and four of them over 35%. So generated players' usage and
 * self-creation rise with level at 0.15 of the fit's rate and with smallness at 0.3, and the keys
 * that choose who shoots and from where keep 0.3 of their spread: a fictional league's ten top
 * scorers then use 34% of their teams' possessions, as the real league's do (they used 36-38%), and
 * over seven seasons its top scorer averages 34-39 with 10-31 50-point games a season (37-49 with
 * 27-84).
 */
const GEN_LEVEL: Partial<Record<TendKey, number>> = { use: 0.15, create: 0.15 };
const GEN_SIZE: Partial<Record<TendKey, number>> = { use: 0.3, create: 0.3 };
const GEN_STYLE: Partial<Record<TendKey, number>> = { use: 0.3, create: 0.3, three: 0.3, mid: 0.3, drive: 0.3, corner: 0.3, pass: 0.3 };

/**
 * Share of a player's usage and self-creation beyond his level's and size's (the model's) that
 * carries into the next season. Calibrated ones were fitted to his role among his 2025-26 and
 * 2026-27 teammates, so they hold only with them: Dončić's and Reaves's are each 15 times the
 * model's, which splits the Lakers' shots as it really went, but once Reaves and Sexton had left,
 * Dončić used 49% of his team's possessions (37% before) and scored 42 a game (31) at the same
 * level. Kept whole, the real league's top scorer reached 41-47 a game with 10-11 players over 30
 * within seven seasons (31-33 and 2-3 in the first). Moving a quarter of the way to the model's each
 * offseason, a player's role settles to what his level and size bring as his teammates change: the
 * top scorer stays at 31-38 with at most 7 over 30.
 */
const OWN_ROLE_KEEP = 0.75;

/** The model's log-tendency for a player of this OVR and size. */
function tendBase(k: TendKey, ovr: number, size: number): number {
  const [c, lvl, star, hgt] = TEND_MODEL[k].b;
  return c + (GEN_LEVEL[k] ?? 1) * ((lvl * (ovr - 75)) / 8 + (star * Math.max(0, ovr - 80)) / 8) + ((GEN_SIZE[k] ?? 1) * hgt * (size - 50)) / 15;
}

const setTend = (t: Tendencies, k: TendKey, v: number) => (t[k] = Math.round(clamp(v, TEND_MODEL[k].lo, TEND_MODEL[k].hi) * 1000) / 1000);

/**
 * Tendencies for a generated player whose ratings are final. The style draws come from a stream
 * of his own, so every other draw (the rest of a draft class or league) stays where it was.
 */
export function genTendencies(p: Player, rng: Rng): Tendencies {
  const style = new Rng(Math.imul(rng.state ^ p.pid, 0x9e3779b1));
  const t = {} as Tendencies;
  for (const k of TEND_KEYS) setTend(t, k, Math.exp(tendBase(k, p.ovr, p.ratings.hgt) + style.normal(0, TEND_MODEL[k].sd * (GEN_STYLE[k] ?? 1))));
  return t;
}

/**
 * Tendencies follow his level (call after a year's development, with the OVR they were last set
 * for): his own style stays and the part that comes with quality moves, so a prospect who becomes
 * a star takes more of the shots and an aging star hands them on (his ratings do most of that),
 * while his usage and self-creation settle toward his level's (OWN_ROLE_KEEP). A player without
 * tendencies (from a save made before they were generated) gets a set.
 */
export function followTendencies(p: Player, prevOvr: number, rng: Rng) {
  if (!p.tend) {
    p.tend = genTendencies(p, rng);
    return;
  }
  const t = p.tend;
  for (const k of TEND_KEYS) {
    const before = tendBase(k, prevOvr, p.ratings.hgt);
    const own = (t[k] ?? Math.exp(before)) / Math.exp(before);
    setTend(t, k, Math.exp(tendBase(k, p.ovr, p.ratings.hgt)) * Math.pow(own, GEN_LEVEL[k] ? OWN_ROLE_KEEP : 1));
  }
}

export function blankMood(): Mood {
  return { score: 0, ptComponent: 0, winComponent: 0, roleComponent: 0, contractComponent: 0, expectedMin: 0, tradeRequest: false, notes: [] };
}

export function blankStats(season: number, tid: number, playoffs: boolean): PlayerStats {
  return {
    season,
    tid,
    playoffs,
    gp: 0,
    gs: 0,
    min: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    orb: 0,
    drb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    pts: 0,
    pm: 0,
    rimM: 0,
    rimA: 0,
    midM: 0,
    midA: 0,
    onPoss: 0,
    onPtsFor: 0,
    onPtsAgainst: 0,
    teamFga: 0,
    teamFta: 0,
    teamTov: 0,
  };
}

export function pickName(rng: Rng, intlBias = 1): { first: string; last: string; country: string; college: string } {
  const weights = NAME_POOLS.map((p) => (p.country === 'USA' ? p.weight : p.weight * intlBias));
  const pool = NAME_POOLS[rng.weighted(weights)];
  const first = rng.pick(pool.first);
  const last = rng.pick(pool.last);
  const college = pool.colleges ? rng.pick(pool.colleges) : '';
  return { first, last, country: pool.country, college };
}

export function playerAge(p: Pick<Player, 'bornYear'>, season: number) {
  // season 2027 = 2026-27; age as of Feb 1 of the season, like Basketball Reference
  return season - p.bornYear;
}

/** Salary for a season, a signed extension's included. */
export function salaryFor(p: Pick<Player, 'contract'>, season: number): number {
  const c = p.contract;
  const i = season - c.start;
  if (i < 0) return 0;
  if (i < c.salaries.length) return c.salaries[i];
  return c.next?.salaries[i - c.salaries.length] ?? 0;
}

/** Last season he is signed for, a signed extension's included. */
export function contractExp(c: Contract): number {
  return c.start + c.salaries.length - 1 + (c.next?.salaries.length ?? 0);
}

/** First season of a signed extension (the season after the current deal's last), or null. */
export function extensionStart(c: Contract): number | null {
  return c.next ? c.start + c.salaries.length : null;
}

export function refreshPlayerDerived(p: Player, season: number, scale: OvrScale) {
  p.ovr = toDisplay(ovrRaw(p.ratings), scale);
  p.pot = potential(p.ovr, playerAge(p, season), p.growth);
  p.archetype = archetype(p.ratings).label;
}

export interface NewPlayerOpts {
  pid: number;
  season: number;
  tid: number;
  age: number;
  talent: number;
  heightIn?: number;
  scale: OvrScale;
  intlBias?: number;
  draftYear?: number;
  /** Full names already in use: a new player draws again (a few times) rather than share one. */
  taken?: Set<string>;
}

export function generatePlayer(rng: Rng, o: NewPlayerOpts): Player {
  const { r, heightIn } = genRatings(rng, { talent: o.talent, age: o.age, heightIn: o.heightIn });
  let nm = pickName(rng, o.intlBias ?? 1);
  for (let i = 0; i < 8 && o.taken?.has(`${nm.first} ${nm.last}`); i++) nm = pickName(rng, o.intlBias ?? 1);
  o.taken?.add(`${nm.first} ${nm.last}`);
  const pos: Pos = inferPos(r);
  const weight = Math.round(105 + heightIn * 1.45 + (r.str - 50) * 0.6 + rng.normal(0, 8));
  const p: Player = {
    pid: o.pid,
    firstName: nm.first,
    lastName: nm.last,
    pos,
    heightIn,
    weightLb: weight,
    bornYear: o.season - o.age,
    country: nm.country,
    college: nm.country === 'USA' || nm.country === 'Canada' ? nm.college : '',
    jersey: String(rng.pick([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 41, 44, 55])),
    draft: { year: o.draftYear ?? o.season, round: 0, pick: 0, tid: null },
    tid: o.tid,
    ratings: r,
    ovr: 0,
    pot: 0,
    growth: clamp(rng.normal(0, 0.45), -1, 1),
    injuryProne: clamp(rng.normal(0.3, 0.15), 0, 1),
    ratingsHistory: [],
    contract: { start: o.season, salaries: [0] },
    stats: [],
    injury: null,
    injuryCount: 0,
    mood: blankMood(),
    training: 'balanced',
    awards: [],
    joinedSeason: o.season,
    experience: 0,
    wear: 0,
    restedGames: 0,
    archetype: '',
  };
  refreshPlayerDerived(p, o.season, o.scale);
  return p;
}

/** A provisional scale used before a real league distribution exists. */
export const DEFAULT_SCALE: OvrScale = {
  raw: [30, 38, 41.5, 44.5, 47.5, 50.5, 53.5, 56.5, 59.5, 63, 67],
  disp: [52, 62, 66, 70, 74, 78, 82, 86, 90, 94, 97],
};
