// Who guards whom: the staff's matchup assignment, as the engine makes it for the ten players on the
// floor, and as the game plan screen previews it before tip-off. Out-of-possession roles send their
// players to the man their job is (the lead handler, the best scorer, the least dangerous big...).

import type { DefRole } from '../types';

/** An offensive player as the assignment reads him. */
export interface MatchupScorer {
  pid: number;
  /** Height rating. */
  hgt: number;
  /** A big is guarded by interior defense, anyone else by perimeter defense. */
  big: boolean;
  /** How much the offense runs through him (any scale: only the ratio to the top one counts). */
  threat: number;
  /** How much of that is his ball screens, on the same scale (none given: none of it). */
  handle?: number;
  /** His shooting gravity, 0-100 (none given: 50). */
  shoot?: number;
}

/** A defender as the assignment reads him. */
export interface MatchupDefender {
  pid: number;
  hgt: number;
  intDef: number;
  perDef: number;
  /** His out-of-possession role (none: standard). */
  role?: DefRole;
}

/** How hard an out-of-possession role pulls its player to his man: a cost of this much at most, against size gaps and defensive quality. */
export const ROLE_PULL = 2.5;

/**
 * How well scorer `o` suits the job of a defender in role `role` (0 to 1): the point-of-attack
 * stopper wants the lead ball handler, the wing stopper the best scorer who isn't, the anchor the
 * big who stays furthest from the arc, the roamer the weakest shooter, and the hidden defender the
 * least dangerous player. A standard defender has no preference.
 */
export function roleTarget(role: DefRole | undefined, o: MatchupScorer, maxThreat: number, maxHandle: number): number {
  const threat = o.threat / (maxThreat || 1);
  const handle = maxHandle > 0 ? (o.handle ?? 0) / maxHandle : 0;
  const noShot = 1 - Math.min(100, Math.max(0, o.shoot ?? 50)) / 100;
  switch (role) {
    case 'poa':
      return handle;
    case 'stopper':
      return threat * (1 - 0.8 * handle);
    case 'anchor':
      return (o.big ? 0.6 : 0) + 0.4 * noShot;
    case 'roamer':
      return noShot * (1 - 0.5 * threat);
    case 'hide':
      return 1 - threat;
    default:
      return 0;
  }
}

/** All 120 orderings of five defenders. */
const PERMS5: number[][] = (() => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) return void out.push(cur);
    for (let i = 0; i < rest.length; i++) rec([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  rec([], [0, 1, 2, 3, 4]);
  return out;
})();

/**
 * Cost of defender j guarding scorer i (lower is better): size gaps cost, a good defender on the
 * scorers the offense runs through saves, a defender's role pulls him to the man his job is (see
 * roleTarget), and a planned matchup (`manual`: scorer pid -> defender pid) all but decides it.
 */
function costMatrix(off: MatchupScorer[], def: MatchupDefender[], manual: Record<number, number>): number[] {
  const maxThreat = Math.max(...off.map((o) => o.threat)) || 1;
  const maxHandle = Math.max(0, ...off.map((o) => o.handle ?? 0));
  const n = def.length;
  const cost: number[] = new Array(off.length * n);
  for (let i = 0; i < off.length; i++) {
    const o = off[i];
    const m = manual[o.pid];
    for (let j = 0; j < n; j++) {
      const d = def[j];
      let c = Math.abs(o.hgt - d.hgt) * 0.09;
      const quality = o.big ? d.intDef : d.perDef;
      c -= (o.threat / maxThreat) * (quality - 50) * 0.06;
      if (d.role && d.role !== 'standard') c -= ROLE_PULL * roleTarget(d.role, o, maxThreat, maxHandle);
      if (m !== undefined) c += m === d.pid ? -50 : 4;
      cost[i * n + j] = c;
    }
  }
  return cost;
}

/**
 * The cheapest assignment of distinct defenders to the scorers: for each scorer, the index of his
 * defender in `def`. Five on five (the engine's case) searches the 120 orderings in a fixed order,
 * first best kept; other sizes (a preview's bench units) search every assignment the same way.
 * With fewer defenders than scorers there is nothing to choose: they're handed out in turn.
 */
export function solveMatchups(off: MatchupScorer[], def: MatchupDefender[], manual: Record<number, number> = {}): number[] {
  if (!off.length) return [];
  if (!def.length) return off.map(() => -1);
  if (def.length < off.length) return off.map((_, i) => i % def.length);
  const cost = costMatrix(off, def, manual);
  if (off.length === 5 && def.length === 5) {
    let best = PERMS5[0];
    let bestCost = Infinity;
    for (const p of PERMS5) {
      const c = cost[p[0]] + cost[5 + p[1]] + cost[10 + p[2]] + cost[15 + p[3]] + cost[20 + p[4]];
      if (c < bestCost) {
        bestCost = c;
        best = p;
      }
    }
    return [...best];
  }
  // depth-first over the defenders still free, summing left to right as the five-man case does
  const n = def.length;
  const used = new Array<boolean>(n).fill(false);
  const cur: number[] = [];
  let best: number[] = [];
  let bestCost = Infinity;
  const rec = (i: number, sum: number) => {
    if (i === off.length) {
      if (sum < bestCost) {
        bestCost = sum;
        best = [...cur];
      }
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true;
      cur.push(j);
      rec(i + 1, i === 0 ? cost[j] : sum + cost[i * n + j]);
      cur.pop();
      used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}
