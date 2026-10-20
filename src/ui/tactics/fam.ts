// Familiarity as the Tactics screen reads it: the team's record of what it has drilled (as training
// camp will leave it, before opening night), each phase of play's figure, and what a setting costs
// against what the team has drilled.
import { famDims, freshFamiliarity, type FamDim } from '../../core/sim/familiarity';
import { teamPlayers } from '../../core/league/helpers';
import { levelIndex, levelName, type LeveledTactic } from '../../core/sim/tactics';
import type { ActionType, Familiarity, League, Tactics } from '../../core/types';

/** What the user's team has drilled (made as camp would leave it when there's no record yet). */
export function teamFam(league: League, tid = league.userTid): Familiarity {
  const team = league.teams[tid];
  return team.fam ?? freshFamiliarity(team, teamPlayers(league, tid));
}

/** Before opening night, nothing has been drilled yet: camp will drill whatever the team opens with. */
export const preCamp = (league: League) => !league.teams[league.userTid].fam;

/** The phases of play, FM's way, and the parts of familiarity each is read from. */
export type Phase = 'inPoss' | 'inTrans' | 'outPoss' | 'defTrans';
export const PHASES: { id: Phase; label: string; short: string; dims: FamDim[]; end: 'off' | 'def' }[] = [
  { id: 'inPoss', label: 'In possession', short: 'In possession', dims: ['shape', 'actions', 'tempo'], end: 'off' },
  { id: 'inTrans', label: 'In transition', short: 'In transition', dims: ['tempo'], end: 'off' },
  { id: 'outPoss', label: 'Out of possession', short: 'Out of possession', dims: ['scheme', 'coverage', 'pressure'], end: 'def' },
  { id: 'defTrans', label: 'Defensive transition', short: 'Def. transition', dims: ['pressure'], end: 'def' },
];

/** A phase's familiarity: the mean of its parts. */
export const phaseFam = (dims: Record<FamDim, number>, ph: Phase) => {
  const ds = PHASES.find((p) => p.id === ph)!.dims;
  return ds.reduce((a, d) => a + dims[d], 0) / ds.length;
};

/** A 0-100 setting the team drills, as its habit is kept: the key, where it sits in the tactics, and the familiarity part it counts in. */
export type HabitKey = 'pace' | 'transition' | 'threePoint' | 'rimAttack' | 'crashBoards' | 'help' | 'pressure' | 'physicality' | 'getBack' | `a_${ActionType}`;

const DEF_KEYS = ['help', 'pressure', 'physicality', 'getBack'];

export const habitDim = (k: HabitKey): FamDim => (k === 'pace' || k === 'transition' ? 'tempo' : DEF_KEYS.includes(k) ? 'pressure' : 'actions');

function setHabit(t: Tactics, k: HabitKey, v: number): Tactics {
  const out: Tactics = { ...t, offense: { ...t.offense, actions: { ...t.offense.actions } }, defense: { ...t.defense } };
  if (k.startsWith('a_')) out.offense.actions[k.slice(2) as ActionType] = v;
  else if (DEF_KEYS.includes(k)) (out.defense as unknown as Record<string, number>)[k] = v;
  else (out.offense as unknown as Record<string, number>)[k] = v;
  return out;
}

/** A drilled setting's value in tactics `t`. */
export function habitValue(t: Tactics, k: HabitKey): number {
  if (k.startsWith('a_')) return t.offense.actions[k.slice(2) as ActionType];
  if (DEF_KEYS.includes(k)) return (t.defense as unknown as Record<string, number>)[k];
  return (t.offense as unknown as Record<string, number>)[k];
}

/**
 * When a setting sits off the level the team has drilled it at: that level's name, and the
 * familiarity points its part loses for it. Null when it's where they drilled it.
 */
export function offHabit(fam: Familiarity, t: Tactics, k: HabitKey, level: LeveledTactic): { drilled: string; cost: number } | null {
  const h = fam.habit[k];
  if (h === undefined) return null;
  const v = habitValue(t, k);
  if (levelIndex(h) === levelIndex(v)) return null;
  const dim = habitDim(k);
  const now = famDims(fam, t)[dim];
  const at = famDims(fam, setHabit(t, k, h))[dim];
  return { drilled: levelName(level, h), cost: Math.max(0, at - now) };
}

/** "84%". */
export const pct = (v: number) => `${Math.round(v)}%`;
