import type { Contract, Mood, Player, PlayerStats, Pos, Ratings } from './types';
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

export function salaryFor(p: Pick<Player, 'contract'>, season: number): number {
  const c = p.contract;
  const i = season - c.start;
  if (i < 0 || i >= c.salaries.length) return 0;
  return c.salaries[i];
}

export function contractExp(c: Contract): number {
  return c.start + c.salaries.length - 1;
}

export function yearsLeft(c: Contract, season: number): number {
  return Math.max(0, contractExp(c) - season + 1);
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
