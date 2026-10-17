// Technical and flagrant fouls: who loses his temper and how often. The engine (GameSim in
// engine.ts) rolls them on a random stream of their own, drawn from the game's seed and the
// possession count, so a game in which nobody is whistled for one plays exactly as it would
// without them; the league side (suspensions) is in league/discipline.ts.

import type { CoachProfile, Player } from '../types';
import { Rng, clamp, hashString } from '../random';

export const DISC = {
  /**
   * Technical fouls: the chance per unit of weight (see techWeight) at each stoppage, a dead ball
   * (a make, a made last free throw, a dead-ball turnover or side out, a timeout) or a whistle (a
   * personal foul, where the man it's called on and his coach argue it more), tuned so the league
   * sees about 0.45 a team game in the regular season, about one in twenty on a coach.
   */
  tech: { dead: 0.00093, whistle: 0.00188, fouler: 3, coach: 0.2, coachArgue: 2 },
  /** A player with a technical already is still hot: likelier to get another (and be ejected) than his temper alone says. */
  again: 1.3,
  /** A team trailing by this much is frustrated (more of them), and so are players in foul trouble and a team in the penalty. */
  frustrated: { down: 15, mult: 1.4, fouls: 4, foulMult: 1.3, penaltyMult: 1.15 },
  /** Close and late (the last five minutes of the fourth quarter or overtime within six), the playoffs, and garbage time (or a 25-point game in the fourth). */
  heat: { clutch: 1.5, playoffs: 1.2, garbage: 0.35 },
  /**
   * Flagrant fouls: the chance a shooting foul at the rim is upgraded (a foul on a shot in the paint
   * or on a drive about half as often, an intentional foul hardly ever) per unit of the fouler's
   * weight (see flagrantWeight), and the share of them that are Flagrant 2s (more for a hothead):
   * about 0.06 Flagrant 1s and 0.004 Flagrant 2s a team game.
   */
  flagrant: { rim: 0.0067, paint: 0.45, drive: 0.5, intentional: 0.03, f2: 0.072 },
  /** The shot clock after a flagrant foul's free throws: the fouled team's ball out of bounds, at 14 (NBA). */
  flagrantShotClock: 14,
};

/** A uniform draw that's the same every time for the same key (and unlike Math.random, the same on every device). */
function hashUniform(key: string): number {
  return new Rng(hashString(key)).next();
}

/**
 * A player's temperament, 0 (calm) to 1 (a hothead): hidden and stored nowhere, so it's the same in
 * every game he plays and for players from older saves. Mostly a draw from who he is (most players
 * low, a few high), plus a little for a physical player (strength, interior defense) and a star who
 * has the ball and the calls to argue; young players are hotter and veterans calmer.
 */
export function temperament(p: Pick<Player, 'pid' | 'firstName' | 'lastName' | 'ratings' | 'ovr' | 'experience'>): number {
  const u = hashUniform(`${p.pid}:${p.firstName} ${p.lastName}:temper`);
  const physical = clamp((p.ratings.str - 50) / 45, 0, 1) * 0.6 + clamp((p.ratings.intD - 50) / 45, 0, 1) * 0.4;
  const star = clamp((p.ovr - 74) / 20, 0, 1);
  const years = p.experience ?? 0;
  const age = years <= 2 ? 0.04 : years >= 12 ? -0.06 : 0;
  return clamp(0.78 * u ** 6 + 0.14 * physical + 0.1 * star + age, 0, 1);
}

/** A coach's temperament (0..1): a draw from his name, most of them calm. */
export function coachTemperament(c: Pick<CoachProfile, 'name'>): number {
  return clamp(0.1 + 0.9 * hashUniform(`${c.name}:coach-temper`) ** 2.5, 0, 1);
}

/**
 * How likely a player of temperament `temper` is to be whistled for a technical, relative to the
 * others on the floor: the hottest about three and a half times the league's average, so the most
 * technical-prone players reach the 16 that cost a game in a full season, as a few NBA players do.
 */
export function techWeight(temper: number): number {
  return 0.33 + 1.8 * temper * temper;
}

/**
 * How likely a foul of his is to be a flagrant (see DISC.flagrant), and of those a Flagrant 2: a
 * hothead's twice a calm player's, and a Flagrant 2 a little likelier, so flagrant points add up to
 * a suspension for a handful of players a season.
 */
export function flagrantWeight(temper: number): { f1: number; f2: number } {
  return { f1: 0.7 + temper, f2: 0.8 + 0.8 * temper };
}
