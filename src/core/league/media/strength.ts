// How good the press thinks a team is right now: this season's net rating regressed toward what its
// healthy roster is worth (the game projection's own blend, see analysis/projection.ts), so a team
// that lost its star last night reads weaker today. A pure read of the league.
import type { League, Player } from '../../types';
import { HOME_EDGE, blendNet } from '../../analysis/projection';
import { winChance } from '../../analysis/winProb';
import { ROSTER_NET } from '../../analysis/odds';
import { netOf, tsOf } from './voice';

/** Minutes by OVR rank in a typical rotation, as the season forecast weighs a roster. */
const SLOTS = [35, 34, 32, 30, 28, 24, 20, 16, 12, 9];

/** Minutes-weighted OVR of a team's best ten healthy players (`roster` sorted best first). */
export function healthyWorth(roster: Player[]): number {
  let sum = 0;
  let min = 0;
  let i = 0;
  for (const p of roster) {
    if (i >= SLOTS.length) break;
    if (p.injury && p.injury.gamesRemaining > 0) continue;
    sum += p.ovr * SLOTS[i];
    min += SLOTS[i];
    i++;
  }
  return min ? sum / min : 0;
}

/** Each team's strength in net points per 100 possessions (`rosters` from voice.rosters). */
export function strengths(league: League, rosters: Player[][]): number[] {
  const worth = rosters.map(healthyWorth);
  const avg = worth.reduce((a, b) => a + b, 0) / Math.max(1, worth.length);
  return league.teams.map((t) => {
    const ts = tsOf(league, t.tid);
    const gp = ts.won + ts.lost;
    return blendNet(netOf(ts), gp, worth[t.tid] - avg, ROSTER_NET);
  });
}

/** The 2-2-1-1-1 home pattern from the higher seed's side. */
const HOME = [true, true, false, false, true, false, true];

/**
 * A best-of-seven from the higher seed's side, already `hw`-`lw`: its chance to win the series and
 * the most likely number of games for whichever side is favoured. `edge` is its net edge per 100
 * possessions; home court as the projection counts it.
 */
export function seriesOdds(edge: number, hw = 0, lw = 0): { p: number; games: number } {
  const pHome = winChance(edge + HOME_EDGE);
  const pAway = winChance(edge - HOME_EDGE);
  // P(series reaches each state) by dynamic programming over games
  let states = new Map<string, number>([[`${hw}-${lw}`, 1]]);
  let win = 0;
  const endW = new Array(8).fill(0);
  const endL = new Array(8).fill(0);
  for (let g = hw + lw; g < 7; g++) {
    const next = new Map<string, number>();
    for (const [k, pr] of states) {
      const [a, b] = k.split('-').map(Number);
      const p = HOME[g] ? pHome : pAway;
      const add = (aa: number, bb: number, q: number) => {
        if (aa === 4) {
          win += q;
          endW[aa + bb] += q;
        } else if (bb === 4) endL[aa + bb] += q;
        else next.set(`${aa}-${bb}`, (next.get(`${aa}-${bb}`) ?? 0) + q);
      };
      add(a + 1, b, pr * p);
      add(a, b + 1, pr * (1 - p));
    }
    states = next;
  }
  const ends = win >= 0.5 ? endW : endL;
  let games = 4;
  for (let n = 4; n <= 7; n++) if (ends[n] > ends[games]) games = n;
  return { p: win, games };
}
