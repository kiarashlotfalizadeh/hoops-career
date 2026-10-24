// What a team's players are worth on the floor: its OVR weighted by a typical rotation's minutes,
// injured players out for the games they'll miss. The season forecast's talent prior (odds.ts) and
// the difficulty's edge on the court (difficulty.ts) both read a team's strength from it.
import type { Player } from '../types';
import { clamp } from '../random';

/**
 * Net rating per point of a roster's worth (rosterWorth) above the league's: what the season
 * forecast's talent prior counts. Fitted over eight simulated opening seasons of the real league
 * (240 team seasons, r = 0.91): 2.15. At the game projection's 1.7 (TALENT_NET, a planned
 * rotation's), the forecast was a fifth too timid: teams finished 1.21 wins from average for every
 * win it projected (the Thunder, projected for 64, won 69-74), the worst short of what it said.
 */
export const ROSTER_NET = 2.1;
/** Minutes by OVR rank in a typical rotation (240 in all), for what a roster is worth with its injured players out or back. */
const SLOTS = [35, 34, 32, 30, 28, 24, 20, 16, 12, 9];
/** Injured players whose absences are played out exactly (each one in or out), the most valuable first; the rest count as out when they'll miss most of what's left. */
const EXACT_INJURIES = 4;

/**
 * What a team's players are worth on the floor over what's left of its season (its OVR weighted by
 * a typical rotation's minutes): each injured player out for the games he'll miss and back after,
 * every combination of the most valuable ones weighed by how much of the stretch it covers.
 */
export function rosterWorth(players: Player[], gamesLeft: number): number {
  const sorted = [...players].sort((a, b) => b.ovr - a.ovr);
  const miss = (p: Player) => (p.injury ? clamp(p.injury.gamesRemaining / Math.max(1, gamesLeft), 0, 1) : 0);
  const hurt = sorted.filter((p) => miss(p) > 0);
  const exact = hurt.slice(0, EXACT_INJURIES);
  // the rest: out when they'll miss most of it
  const gone = new Set(hurt.slice(EXACT_INJURIES).filter((p) => miss(p) >= 0.5));
  const worth = (out: Set<Player>) => {
    let sum = 0;
    let min = 0;
    let i = 0;
    for (const p of sorted) {
      if (out.has(p) || gone.has(p)) continue;
      const m = SLOTS[i++];
      if (m === undefined) break;
      sum += p.ovr * m;
      min += m;
    }
    return min ? sum / min : 0;
  };
  let total = 0;
  for (let mask = 0; mask < 1 << exact.length; mask++) {
    const out = new Set<Player>();
    let w = 1;
    exact.forEach((p, k) => {
      const m = miss(p);
      if (mask & (1 << k)) {
        out.add(p);
        w *= m;
      } else w *= 1 - m;
    });
    if (w > 0) total += w * worth(out);
  }
  return total;
}
