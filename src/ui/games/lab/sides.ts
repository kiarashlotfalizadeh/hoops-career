// How the Lab sets up its games: each side built as a real game's would be, the kind of game being
// played now, the opponent it starts on, and how far a change must clear its noise to be called.
import type { LabSide } from '../../../core/ai/lab';
import { buildSimInput, userGameOnDay } from '../../../core/league/games';
import { nextMeeting } from '../../../core/ai/opponentPlan';
import type { GameType, League, Tactics, TacticsPatch } from '../../../core/types';

export type LabMode = 'project' | 'compare';

/** A verdict needs the change to clear two standard errors (about a 95% interval). */
export const SIGMAS = 2;

/**
 * Standard errors each counter must clear when `n` are tested at once: wide enough that the whole
 * list has a 95% chance of marking none of the ones that change nothing (Bonferroni: 2 for one,
 * about 2.8 for nine). At two each, about one run in five flagged a counter that does nothing.
 */
export function familySigmas(n: number): number {
  if (n <= 1) return SIGMAS;
  // upper-tail normal quantile of 2.5% / n (Abramowitz & Stegun 26.2.23, error under 0.0005)
  const t = Math.sqrt(-2 * Math.log(0.025 / n));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
}

/** Lab games are the kind being played now: in the postseason, the play-in's or the playoffs' (the playoffs' shorter rotations included). */
export function labGameType(league: League): GameType {
  return league.phase === 'playoffs' || league.phase === 'playin' ? league.phase : 'regular';
}

/**
 * A lab side is built like a real game's: the game plan for this opponent on top of the tactics,
 * injured players kept on the roster so the engine hands their minutes down the bench, morale and
 * wear, rest, and an AI opponent's in-game adjustments, with the plan its coach brings to your next
 * meeting if he game-plans for it.
 */
export function sideFor(league: League, tid: number, opp: number, tactics?: Tactics): LabSide {
  const view = tactics ? { ...league, teams: league.teams.map((t) => (t.tid === tid ? { ...t, tactics } : t)) } : league;
  const input = buildSimInput(view, tid, league.day, labGameType(league), opp, nextMeeting(league, tid === league.userTid ? opp : tid));
  // (the season history is never read by a game: it stays out of the message to the worker)
  return { ...input, team: { ...input.team, seasons: [] } };
}

/** The seed a run against `opp` plays from: the same games for every run against them until the league moves on. */
export const labSeed = (league: League, opp: number) => (league.rng ^ (opp * 7919)) >>> 0;

/** The user's next opponent (today's first), else any other team. */
export function defaultOpponent(league: League): number {
  const g =
    userGameOnDay(league, league.day) ??
    league.schedule.filter((x) => !x.played && x.day >= league.day && (x.home === league.userTid || x.away === league.userTid)).sort((a, b) => a.day - b.day)[0];
  if (g) return g.home === league.userTid ? g.away : g.home;
  return league.userTid === 0 ? 1 : 0;
}

/** A patch that turns any tactics into `t` (the Lab applies it on top of the plan the side already plays). */
export const toTactics = (t: Tactics): TacticsPatch => ({ offense: { ...t.offense }, defense: { ...t.defense }, manage: { ...t.manage } });
