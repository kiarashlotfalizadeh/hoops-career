// The scouting profile's skills: blends of a player's ratings (the engine's own composites) and where
// each puts him among the league's rostered players. The player page and the comparison screen read
// them from here, so the two always agree.
import type { League, Player } from '../core/types';
import { composites, type Composites } from '../core/ratings';
import { useLeagueMemo } from '../state/store';

export interface SkillDef {
  key: string;
  label: string;
  get: (c: Composites, p: Player) => number;
  help: string;
}

export const SKILLS: SkillDef[] = [
  {
    key: 'create',
    label: 'Shot creation',
    get: (c) => (c.create + c.pnrHandle) / 2,
    help: 'Beating a defender and running pick-and-roll. Drives usage in pick-and-rolls and isolations.',
  },
  { key: 'three', label: 'Three-point shooting', get: (c) => (c.c3 + c.pu3) / 2, help: 'Catch-and-shoot and pull-up threes. Also creates spacing for teammates.' },
  { key: 'mid', label: 'Mid-range', get: (c) => c.midShot, help: 'Pull-ups and floaters, the answer to drop coverage.' },
  { key: 'rim', label: 'Finishing', get: (c) => c.rim, help: 'Converting at the rim through contact and rim protectors.' },
  { key: 'pass', label: 'Playmaking', get: (c) => c.passing, help: 'Finding the open man: punishes blitzes, doubles and heavy help.' },
  { key: 'sec', label: 'Ball security', get: (c) => c.ballSec, help: 'Avoiding turnovers under pressure and traps.' },
  { key: 'perd', label: 'Perimeter defense', get: (c) => c.perDef, help: 'Containing guards and wings on the ball. Key for switching.' },
  { key: 'intd', label: 'Interior defense', get: (c) => c.intDef, help: 'Holding position against post-ups and walling off drives.' },
  { key: 'rimp', label: 'Rim protection', get: (c) => c.rimProt, help: 'Altering shots at the rim. Anchors drop coverage and zones.' },
  { key: 'reb', label: 'Rebounding', get: (c) => (c.orb + c.drb) / 2, help: 'Securing boards on both ends.' },
  { key: 'ath', label: 'Athleticism', get: (_c, p) => (p.ratings.spd + p.ratings.ath) / 2, help: 'Speed and explosiveness. Declines from the late 20s.' },
];

/** A skill's percentile (1-99) among `league`'s rostered players, by skill key and value. */
export type SkillPercentile = (key: string, val: number) => number;

/** Each skill's values over the rostered players, sorted once: a percentile is then a binary search. */
export function skillPercentiles(league: League): SkillPercentile {
  const pool = Object.values(league.players).filter((p) => p.tid >= 0);
  const sorted: Record<string, number[]> = {};
  for (const s of SKILLS) sorted[s.key] = pool.map((p) => s.get(composites(p.ratings), p)).sort((a, b) => a - b);
  return (key: string, val: number) => {
    const arr = sorted[key];
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < val) lo = mid + 1;
      else hi = mid;
    }
    return arr.length ? Math.min(99, Math.max(1, Math.round((lo / arr.length) * 100))) : 50;
  };
}

export function useSkillPercentiles(league: League): SkillPercentile {
  return useLeagueMemo(() => skillPercentiles(league), [league]);
}

/** A percentile's bar colour: elite, good, average, poor. */
export const skillColor = (pc: number) => (pc >= 85 ? 'var(--tier-elite)' : pc >= 65 ? 'var(--good)' : pc >= 35 ? 'var(--info)' : 'var(--bad)');
