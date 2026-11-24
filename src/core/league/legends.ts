// The league's tails: the rare player the scale wasn't built for, and the stretches when anyone
// plays above or below himself. Everything else in the game holds a league to the shape of the one
// it started as (the rating anchors, the usage and three-point ceilings, the engine's own limits);
// this is the room left on purpose at the very top, so that once in a while a league gets a 7'5"
// guard in a center's body, a scorer who averages 40, or a team that wins 74.
//
// Three parts, none of them on the league's random stream (every draw has a stream of its own):
// - A generational prospect: about one draft class in three has one (GENERATIONAL.odds), a top prospect
//   whose hidden `peak` lets his ratings run past the best player the league had when it was made, by
//   up to a few raw points, and half the time a body nobody has (a unicorn). He still has to get
//   there: his summers, his arc and his health are his own.
// - Room at the top: a player past the top of the league's scale is let through the anchors as far as
//   his peak (see keepPeak, peakSummer), keeps more of his usage and his threes from one season to
//   the next, and gets the engine's room for it (legendRooms: FEEL.tails).
// - Form: every player runs a little hot or cold for a couple of weeks at a time (formOf), now and
//   then a lot. A tear is nobody's rating; it shows in his games and the press finds it there.

import type { League, Player, Ratings } from '../types';
import { Rng, clamp, hashString, mix32 } from '../random';
import { RATING_KEYS, heightToRating, ovrRaw, ovrWeights, toDisplay } from '../ratings';
import { FEEL, legendRoom } from '../sim/engine/feel';

export const GENERATIONAL = {
  /** The chance a draft class has a generational prospect. */
  odds: 0.3,
  /** How far past the top of the league's scale he can go, raw overall points (a range). */
  peak: [2.5, 7] as [number, number],
  /** His hidden growth (a range): he develops like the best of any class. */
  growth: [0.7, 1] as [number, number],
  /** The share of them with a body nobody has: a wing's or a guard's game at 7'3" to 7'6". */
  unicorn: 0.5,
  /**
   * A fictional league starts with one already in his prime this often, and this far into his room
   * (a range of his peak). Half the leagues, most of the way up (0.5-0.9), made the store's default
   * league a one-man era from opening night: a 98 at 39-43 points and a PER of 40-48 in its first 20
   * games, where the real league's best score 31 at 33. Now about one in seven, starting at the top
   * of the scale with his climb ahead of him (at one in four, a fictional star-check still had one
   * league in eight led by him at 35+ in six of eight seasons).
   */
  founding: 0.15,
  foundingRoom: [0, 0.15] as [number, number],
  /**
   * A founding legend's peak (a range, raw points past the top of the scale): under a drafted one's.
   * He climbs from the league's first summer, in his prime, against rosters made to the real league's
   * shape; with a drafted one's peak he reached the whole room in two summers and led a fictional
   * league at 49.8 points a game (the real league's tails top out near 40).
   */
  foundingPeak: [2.5, 4.5] as [number, number],
  /** From this display OVR a player with room keeps climbing in his summers, to this age, by this many raw points a year (a range). */
  climbFrom: 86,
  climbTo: 28,
  climb: [1.3, 2.8] as [number, number],
};

/** The top of the league's scale in raw overall: the best player it had when it was made. */
export const scaleTop = (league: Pick<League, 'ovrScale'>) => league.ovrScale.raw[league.ovrScale.raw.length - 1];

/** How much of the room at the top a player has now, 0..1 (FEEL.tails): none for nearly everyone. */
export function roomOf(league: Pick<League, 'ovrScale'>, p: Player): number {
  return p.peak ? legendRoom(ovrRaw(p.ratings), scaleTop(league)) : 0;
}

/** The engine's input: the room of each of these players who has any (see SimTeamInput.legend). */
export function legendRooms(league: Pick<League, 'ovrScale'>, players: Player[]): Record<number, number> | undefined {
  let out: Record<number, number> | undefined;
  for (const p of players) {
    if (!p.peak) continue;
    const room = roomOf(league, p);
    if (room > 0) (out ??= {})[p.pid] = Math.round(room * 1000) / 1000;
  }
  return out;
}

/** Whether he is one of the rare ones: a player with room past the league's best, there or on his way. */
export const isGenerational = (p: Pick<Player, 'peak'>) => !!p.peak;

/** Move every skill of a player together so his raw overall changes by `delta` (as the anchors do). */
function shiftRaw(r: Ratings, delta: number) {
  const w = ovrWeights(r);
  const weight = RATING_KEYS.reduce((t, k) => t + (k === 'hgt' ? 0 : w[k]), 0);
  // (ovrRaw divides its weighted sum by 0.94)
  const step = (delta * 0.94) / weight;
  for (const k of RATING_KEYS) if (k !== 'hgt') r[k] = clamp(Math.round((r[k] + step) * 10) / 10, 1, 100);
}

/** The attributes a taller body brings with it, per point of height rating, when a prospect is made a unicorn. */
const SIZE_GAINS: Partial<Record<keyof Ratings, number>> = { blk: 0.6, intD: 0.45, dreb: 0.5, oreb: 0.4, post: 0.25, str: 0.3, ins: 0.15, spd: -0.12, hnd: -0.1 };

/**
 * Make one of a new class's best prospects generational, some classes (GENERATIONAL.odds). Call
 * with the class as generated, before its tendencies and combine are final. Returns him, or null.
 */
export function seedGenerational(league: League, year: number, klass: Player[]): Player | null {
  const g = GENERATIONAL;
  const rng = new Rng(mix32(hashString(`${league.id}:generational:${year}`)));
  if (!rng.chance(g.odds) || klass.length < 5) return null;
  const p = [...klass].sort((a, b) => b.ovr + b.pot - (a.ovr + a.pot) || a.pid - b.pid)[rng.int(0, 2)];
  p.peak = Math.round(rng.uniform(g.peak[0], g.peak[1]) * 10) / 10;
  p.growth = Math.round(rng.uniform(g.growth[0], g.growth[1]) * 100) / 100;
  if (rng.chance(g.unicorn)) {
    // a wing's or a guard's game in a center's body: the height, and what height alone brings
    const inches = clamp(Math.round(rng.uniform(86.5, 90.4)), 87, 90);
    const before = p.ratings.hgt;
    p.heightIn = Math.max(p.heightIn, inches);
    p.ratings.hgt = heightToRating(p.heightIn);
    const up = p.ratings.hgt - before;
    for (const [k, per] of Object.entries(SIZE_GAINS) as [keyof Ratings, number][]) p.ratings[k] = clamp(Math.round((p.ratings[k] + per * up) * 10) / 10, 1, 100);
    p.weightLb = Math.round(p.weightLb + up * 0.9);
  }
  return p;
}

/**
 * A fictional league's founding legend, some leagues (GENERATIONAL.founding): its best player of
 * 23 to 28 is already past the scale. Call once its scale is built.
 */
export function seedFounding(league: League): Player | null {
  const g = GENERATIONAL;
  const rng = new Rng(mix32(hashString(`${league.id}:founding-legend`)));
  if (!rng.chance(g.founding)) return null;
  const season = league.season;
  const best = Object.values(league.players)
    .filter((p) => p.tid >= 0 && season - p.bornYear >= 23 && season - p.bornYear <= 28)
    .sort((a, b) => ovrRaw(b.ratings) - ovrRaw(a.ratings) || a.pid - b.pid)[0];
  if (!best) return null;
  best.peak = Math.round(rng.uniform(g.foundingPeak[0], g.foundingPeak[1]) * 10) / 10;
  const to = scaleTop(league) + best.peak * rng.uniform(g.foundingRoom[0], g.foundingRoom[1]);
  shiftRaw(best.ratings, to - ovrRaw(best.ratings));
  return best;
}

/**
 * The anchors' exception (see progression.ts's anchorOverallSpread): a player with room is held to
 * the league's shape only as far as the top of the scale plus his peak. `before` is his raw overall
 * going into the anchor; returns what it should be coming out.
 */
export function keepPeak(league: Pick<League, 'ovrScale'>, p: Player, before: number, anchored: number): number {
  if (!p.peak || before <= anchored) return anchored;
  return Math.max(anchored, Math.min(before, scaleTop(league) + p.peak));
}

/**
 * His summer's climb past the scale: from GENERATIONAL.climbFrom on, to GENERATIONAL.climbTo, a
 * player with room left gains up to a couple of raw points a year toward his peak (a stream of his
 * own). Past his prime the league's aging takes it back as it does everyone's.
 */
export function peakSummer(league: League, p: Player) {
  const g = GENERATIONAL;
  if (!p.peak) return;
  const age = league.season - p.bornYear;
  if (age > g.climbTo || toDisplay(ovrRaw(p.ratings), league.ovrScale) < g.climbFrom) return;
  const cap = scaleTop(league) + p.peak;
  const raw = ovrRaw(p.ratings);
  if (raw >= cap) return;
  const rng = new Rng(mix32(hashString(`${league.id}:climb:${p.pid}:${league.season}`)));
  shiftRaw(p.ratings, Math.min(cap - raw, rng.uniform(g.climb[0], g.climb[1])));
}

/** The share of his team's possessions (and its threes) a season may run to before his tendency is brought back: the league's line, plus his room's. */
export const volumeRoom = (league: Pick<League, 'ovrScale'>, p: Player) => {
  const room = roomOf(league, p);
  return { use: FEEL.tails.use * room, three: FEEL.tails.three * room };
};

// ---------------------------------------------------------------- form

export const FORM = {
  /** Days a stretch of form lasts before it turns into the next. */
  days: 13,
  /** A usual stretch's size (the standard deviation of the multiplier on his skills), and how much more each standard deviation past `tail` adds (a tear, a slump). */
  sd: 0.02,
  tail: 1.4,
  extra: 0.03,
  /** The most it lifts or costs him. */
  max: 0.09,
  min: -0.07,
};

/**
 * A player's form on a season day: a multiplier around 1 on his skills in that day's game, moving
 * smoothly from one stretch to the next (FORM). The same for a player and a day every time, from the
 * league's id: nothing is stored and nothing is drawn from the league's stream.
 */
export function formOf(league: Pick<League, 'id' | 'season'>, pid: number, day: number): number {
  const f = FORM;
  // (each player's stretches start on his own day)
  const shift = mix32(hashString(`${league.id}:form:${pid}`)) % f.days;
  const x = (Math.max(0, day) + shift) / f.days;
  const k = Math.floor(x);
  const z = (i: number) => new Rng(mix32(hashString(`${league.id}:form:${pid}:${league.season}:${i}`))).normal(0, 1);
  const t = x - k;
  const s = t * t * (3 - 2 * t);
  const v = z(k) * (1 - s) + z(k + 1) * s;
  const far = Math.max(0, Math.abs(v) - f.tail);
  return 1 + clamp(f.sd * v + Math.sign(v) * f.extra * far, f.min, f.max);
}

/** A stretch of form worth a word: a tear or a slump, the tail of FORM (its `tail` standard deviations out). */
export type FormStretch = 'hot' | 'cold';

export const FORM_WORD: Record<FormStretch, string> = { hot: 'Hot stretch', cold: 'Cold stretch' };

/** What a stretch means, for a title or a screen reader. */
export const FORM_ABOUT: Record<FormStretch, string> = {
  hot: 'Playing above himself for a week or two.',
  cold: 'Playing below himself for a week or two.',
};

/**
 * The stretch a player is in on a day of the season (today by default), when it is one worth a word:
 * the same form the engine plays him at that day (formOf), past the edge where a usual wobble becomes
 * a tear or a slump. Null for a usual stretch, a player without a team, and outside the season's games.
 */
export function formStretch(league: Pick<League, 'id' | 'season' | 'day' | 'phase'>, p: Pick<Player, 'pid' | 'tid'>, day = league.day): FormStretch | null {
  if (p.tid < 0 || !(league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs')) return null;
  const edge = FORM.sd * FORM.tail;
  const f = formOf(league, p.pid, day);
  return f >= 1 + edge ? 'hot' : f <= 1 - edge ? 'cold' : null;
}
