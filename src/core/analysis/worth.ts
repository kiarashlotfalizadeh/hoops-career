// What a team's players are worth on the floor: each one's worth to the engine (his OVR, read the way
// the games play it), weighted by the minutes a typical rotation gives him over the games he'll be
// there for (injured players out for the games they'll miss, everyone out for his share of the
// games a rotation player misses). The season forecast's talent prior (odds.ts) and the
// difficulty's edge on the court (difficulty.ts) both read a team's strength from it.
import type { Player, RatingKey } from '../types';
import { clamp } from '../random';

/**
 * Net rating per point of a roster's worth (rosterWorth) above the league's: what the season
 * forecast's talent prior counts. Fitted with the engine weights below (ridge) over 156 simulated
 * seasons from opening night (32 real-league and 20 fictional leagues, three seasons each: 4,680
 * team seasons): 2.18, the fit explaining 72% of the real league's final net ratings and 75% of the
 * fictional ones', each league left out of the fit in turn. OVR alone, every player there for every
 * game, had explained 61% and 69%, and missed the same rosters by 4-6 net points (10-15 wins) in
 * every league: under the Thunder and the Cavaliers, over the Kings, the 76ers and the Wizards.
 */
export const ROSTER_NET = 2.18;
/** Minutes by OVR rank in a typical rotation (240 in all), for what a roster is worth with its injured players out or back. */
const SLOTS = [35, 34, 32, 30, 28, 24, 20, 16, 12, 9];
/**
 * The share of his team's games a healthy rotation player is there for: in those simulated seasons
 * a top-eight player healthy on opening night played 76% of them (rest nights, injuries, trades),
 * a little more young (79% at 20-23) and less old (70% at 36+). Pricing it is pricing the
 * injuries to come: a star's absences cost a top-heavy roster more than a deep one. Age didn't
 * sharpen the forecast any further (nor did injury-proneness, a fictional player's only injury
 * history: half a percent of games either way), so every player gets the same share, the one the
 * fit read best (72-78% did about as well).
 */
export const AVAILABLE = 0.78;
/**
 * What the engine gets from a player beyond his OVR, in OVR points: per point of each rating over
 * 50, and per OVR point past 85 and 90 (a star's games are worth more than a straight line of OVR
 * says, by about 0.8 points an OVR point past 85). OVR is the fans' read of a real player (impact,
 * production and role: see ratings.ts); the games value defensive feel, interior defense, passing
 * and the offensive glass more than it does, and stamina, size and the mid-range less. Fitted with
 * ROSTER_NET (above).
 */
const ENGINE: Partial<Record<RatingKey, number>> = {
  hgt: -0.046,
  spd: 0.021,
  ath: 0.005,
  str: 0.005,
  end: -0.095,
  ins: 0.025,
  mid: -0.033,
  tp: 0.022,
  ft: -0.018,
  drw: -0.005,
  post: -0.024,
  hnd: 0.001,
  pas: 0.034,
  oiq: 0.025,
  perD: 0.013,
  intD: 0.04,
  blk: -0.025,
  stl: 0.004,
  diq: 0.119,
  oreb: 0.049,
  dreb: -0.036,
};
const STAR_STEPS: [ovr: number, perPoint: number][] = [
  [85, 0.809],
  [90, -0.183],
];

/** A player's worth on the floor in OVR points: his OVR, read the way the engine plays it (see ENGINE). */
export function playerWorth(p: Pick<Player, 'ovr' | 'ratings'>): number {
  let v = p.ovr;
  for (const [at, per] of STAR_STEPS) v += per * Math.max(0, p.ovr - at);
  if (p.ratings) for (const k in ENGINE) v += ENGINE[k as RatingKey]! * (p.ratings[k as RatingKey] - 50);
  return v;
}

/**
 * What a team's players are worth on the floor over what's left of its season: each one's worth
 * weighted by the minutes he can expect. A game's rotation is the players there that night by OVR,
 * into the typical rotation's minutes (SLOTS); each player is there with his chance (AVAILABLE, less
 * the share of the games left an injury keeps him out), so a player's expected minutes are his
 * chance times the minutes of the spot he'd take behind however many of the better players are
 * there (worked out exactly, every player independent).
 */
export function rosterWorth(players: Player[], gamesLeft: number): number {
  const sorted = [...players].sort((a, b) => b.ovr - a.ovr);
  // the chance that exactly k of the players so far are there (the last cell: all the spots taken)
  let there = [1];
  let sum = 0;
  let min = 0;
  for (const p of sorted) {
    const miss = p.injury ? clamp(p.injury.gamesRemaining / Math.max(1, gamesLeft), 0, 1) : 0;
    const a = AVAILABLE * (1 - miss);
    let spot = 0;
    for (let k = 0; k < there.length && k < SLOTS.length; k++) spot += there[k] * SLOTS[k];
    if (spot <= 0) break;
    sum += a * spot * playerWorth(p);
    min += a * spot;
    const next = new Array<number>(Math.min(there.length + 1, SLOTS.length + 1)).fill(0);
    there.forEach((q, k) => {
      next[k] += q * (1 - a);
      next[Math.min(k + 1, SLOTS.length)] += q * a;
    });
    there = next;
  }
  return min ? sum / min : 0;
}
