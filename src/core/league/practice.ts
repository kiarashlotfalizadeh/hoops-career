// Between games and after them: what each team learns of its tactics (see src/core/sim/familiarity.ts).
// A game drills the tactics it was played with and teaches each player who played the system and his
// roles; a day without one is a practice day at the team's focus; training camp drills the tactics
// a team opens the season with; a recovery focus takes wear off faster.

import type { League, Player, Tactics } from '../types';
import type { GameSim } from '../sim/engine';
import {
  afterGame,
  ensureFam,
  famDims,
  famEnds,
  famOverall,
  freshFamiliarity,
  knowOf,
  practiceDay,
  roleFam,
  rotationWeights,
  sharedSeconds,
  trainingCamp,
  PREP_META,
  type FamDim,
} from '../sim/familiarity';
import { gamesOnDay } from './games';
import { teamPlayers } from './helpers';

/** After a game between two of the league's teams: each learns from the tactics it played (its coach's, as the game ended) by its players' minutes, and each pair by the minutes they shared. */
export function learnFromGame(league: League, sim: GameSim) {
  const lineups = [...sim.lineups.values()];
  for (const t of sim.T) {
    const team = league.teams[t.tid];
    if (!team || team.tid !== t.tid) continue;
    const roster = teamPlayers(league, t.tid);
    const secs: Record<number, number> = {};
    for (const p of t.players) secs[p.pid] = p.b.sec;
    afterGame(ensureFam(team, roster), t.base, roster, secs, sharedSeconds(lineups, t.side));
  }
}

/** The day's practices: every team without a game today, at its focus; a recovery focus rests the legs of every player it has. */
export function practiceDays(league: League) {
  const playing = new Set<number>();
  for (const g of gamesOnDay(league, league.day)) playing.add(g.home).add(g.away);
  // (every roster in one pass over the players: this runs every day of the season)
  const rosters = new Map<number, Player[]>();
  for (const p of Object.values(league.players)) if (p.tid >= 0) (rosters.get(p.tid) ?? rosters.set(p.tid, []).get(p.tid)!).push(p);
  for (const team of league.teams) {
    const roster = rosters.get(team.tid) ?? [];
    if (!playing.has(team.tid)) practiceDay(team, roster);
    const rest = PREP_META[team.prep ?? 'balanced'].rest;
    if (rest) for (const p of roster) if (p.wear > 0) p.wear = Math.max(0, p.wear - rest);
  }
}

/** Training camp before opening night, for every team. */
export function trainingCamps(league: League) {
  for (const team of league.teams) trainingCamp(team, teamPlayers(league, team.tid));
}

/** A team's familiarity with some tactics, as the screens show it. */
export interface SystemFamiliarity {
  /** Each part, 0-100 (roles over the rotation, its minutes weighting them). */
  dims: Record<FamDim, number>;
  off: number;
  def: number;
  overall: number;
  /** Each player's knowledge of the system and of his role pair. */
  players: { pid: number; know: number; role: number }[];
}

/**
 * What team `tid` knows of tactics `t` (its own by default): before it has a record of what it
 * knows (a new league before opening night), as training camp will leave it.
 */
export function systemFamiliarity(league: League, tid: number, t?: Tactics): SystemFamiliarity {
  const team = league.teams[tid];
  const roster = teamPlayers(league, tid);
  const fam = team.fam ?? freshFamiliarity(team, roster);
  const tactics = t ?? team.tactics;
  const dims = famDims(fam, tactics, roster, rotationWeights(team, roster));
  const ends = famEnds(dims);
  return {
    dims,
    ...ends,
    overall: famOverall(dims),
    players: roster.map((p) => ({ pid: p.pid, know: knowOf(fam, p.pid), role: roleFam(fam, tactics, p) })),
  };
}
