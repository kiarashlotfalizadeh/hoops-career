// Converts a coach's depth chart + minute targets into a 48-slot (one per game minute)
// substitution plan. The live engine follows the plan at dead balls, overriding it for
// fouls, fatigue, injuries and blowouts. This is what makes minute settings reliable.

import type { Pos, Rotation } from '../types';

export interface PlanPlayer {
  pid: number;
  minutes: number;
  starter: boolean;
  closer: boolean;
  guard: boolean; // can handle the ball
  big: boolean;
  endurance: number; // 0..100
  /** Hard minute cap: the plan never goes past it while anyone else has minutes to give. */
  cap?: number;
}

/** A rostered player as the plan sees him. */
export interface PlanSource {
  pid: number;
  /** False when injured or resting: his planned minutes go to teammates. */
  available: boolean;
  guard: boolean;
  big: boolean;
  endurance: number;
}

/** Ball handler / big flags the plan uses for positional sanity. */
export function planRoles(r: { hnd: number; hgt: number }, pos: Pos): { guard: boolean; big: boolean } {
  return { guard: r.hnd >= 55 || pos === 'PG' || pos === 'SG', big: r.hgt >= 60 || pos === 'C' };
}

/**
 * What the stint plan is built from: the available players in depth order, with the minutes
 * of unavailable teammates handed out (bench first), a starter's share for a starter with no
 * minutes set, hard caps, and for auto-managed teams the shorter playoff rotation. The engine
 * and the Rotation screen's preview both use it, so the preview shows what the engine plays.
 */
export function planInputs(roster: PlanSource[], rot: Rotation, opts: { playoffs?: boolean } = {}): PlanPlayer[] {
  const inOrder = new Map(rot.order.map((pid, i) => [pid, i]));
  // starters are the first five available in the depth order
  const depth = [...roster].sort((a, b) => (inOrder.get(a.pid) ?? 99) - (inOrder.get(b.pid) ?? 99));
  const ordered = depth.filter((p) => p.available);
  const missing = roster.filter((p) => !p.available).reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
  const mins = ordered.map((p) => rot.minutes[p.pid] ?? 0);
  let toGive = missing;
  if (toGive > 0) {
    // a reserve promoted into the starting five takes over the minutes of the starter he replaces
    const outStarters = depth.slice(0, 5).filter((p) => !p.available);
    let k = 0;
    for (let i = 0; i < Math.min(5, ordered.length) && toGive > 0 && k < outStarters.length; i++) {
      if (depth.indexOf(ordered[i]) < 5) continue;
      const add = Math.min(toGive, Math.max(0, (rot.minutes[outStarters[k++].pid] ?? 0) - mins[i]));
      mins[i] += add;
      toGive -= add;
    }
    // then to the next bench players (those with low minutes), then spread
    for (let i = 5; i < mins.length && toGive > 0; i++) {
      const add = Math.min(toGive, Math.max(0, 22 - mins[i]));
      mins[i] += add;
      toGive -= add;
    }
    for (let i = 0; i < mins.length && toGive > 0; i++) {
      const add = Math.min(toGive, Math.max(0, 38 - mins[i]));
      mins[i] += add;
      toGive -= add;
    }
  }
  // a starter without planned minutes (new to the depth chart) gets a starter's share
  for (let i = 0; i < Math.min(5, mins.length); i++) if (!rot.minutes[ordered[i].pid]) mins[i] = Math.max(mins[i], 24);
  const caps = ordered.map((p) => rot.caps[p.pid] || undefined);
  if (opts.playoffs && !rot.manual) {
    // playoff rotations shorten to eight: the top five play ~10% more (42 at most), nobody past
    // the eighth man plays, and the rescale to 240 goes to the regulars
    const rank = mins.map((_, i) => i).sort((a, b) => mins[b] - mins[a]);
    rank.forEach((i, r) => {
      if (r < 5) {
        mins[i] *= 1.1;
        caps[i] = Math.min(caps[i] ?? 42, 42);
      } else if (r >= 8) mins[i] = 0;
    });
  }
  const closerSet = new Set(rot.closers.filter((pid) => ordered.some((p) => p.pid === pid)));
  for (const p of ordered) {
    if (closerSet.size >= 5) break;
    closerSet.add(p.pid);
  }
  return ordered.map((p, i) => ({
    pid: p.pid,
    minutes: caps[i] !== undefined ? Math.min(mins[i], caps[i]!) : mins[i],
    starter: i < 5,
    closer: closerSet.has(p.pid),
    guard: p.guard,
    big: p.big,
    endurance: p.endurance,
    cap: caps[i],
  }));
}

export function normalizeMinutes(players: PlanPlayer[], total = 240): number[] {
  const raw = players.map((p) => Math.max(0, Math.min(48, p.minutes)));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // fall back to an even split among the first 10
    return players.map((_, i) => (i < 10 ? total / Math.min(10, players.length) : 0));
  }
  const lim = players.map((p) => Math.min(46, p.cap ?? 46));
  let scaled = raw.map((m) => (m * total) / sum);
  // cap at 46 (or the player's hard cap) and hand the overflow to the rest of the rotation; if
  // they are all capped, to the deep bench; only past that do caps give
  const spread = (open: (i: number) => boolean) => {
    for (let iter = 0; iter < 8; iter++) {
      let overflow = 0;
      scaled = scaled.map((m, i) => {
        if (m > lim[i]) {
          overflow += m - lim[i];
          return lim[i];
        }
        return m;
      });
      if (overflow < 0.01) return 0;
      const room = scaled.reduce((a, m, i) => a + (m < lim[i] && open(i) ? lim[i] - m : 0), 0);
      if (room <= overflow) {
        scaled = scaled.map((m, i) => (open(i) ? Math.max(m, lim[i]) : m));
        return overflow - room;
      }
      scaled = scaled.map((m, i) => (m < lim[i] && open(i) ? m + (overflow * (lim[i] - m)) / room : m));
    }
    return 0;
  };
  let left = spread((i) => raw[i] > 0);
  if (left > 0) left = spread(() => true);
  if (left > 0) scaled = scaled.map((m) => (m * total) / (total - left));
  // integer minutes via largest remainder, never rounding a capped player past his cap
  const floors = scaled.map((m) => Math.floor(m));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((m, i) => [m - Math.floor(m), i] as const).sort((a, b) => b[0] - a[0]);
  for (const pass of [0, 1]) {
    for (const [, i] of order) {
      if (rem <= 0) break;
      if (pass === 0 && floors[i] + 1 > lim[i]) continue;
      floors[i]++;
      rem--;
    }
  }
  return floors;
}

/** Returns plan[slot] = array of 5 pids, slot 0..47. */
export function buildMinutePlan(players: PlanPlayer[]): number[][] {
  const n = players.length;
  const plan: number[][] = [];
  if (n < 5) {
    for (let s = 0; s < 48; s++) plan.push(players.map((p) => p.pid));
    return plan;
  }
  const mins = normalizeMinutes(players);
  const onPrev = new Array<boolean>(n).fill(false);
  const stint = new Array<number>(n).fill(0);
  const rest = new Array<number>(n).fill(99);
  let firstHalfNeed: number[] = [];

  for (let half = 0; half < 2; half++) {
    // split each player's minutes across halves (first half gets the floor)
    const need = mins.map((m) => (half === 0 ? Math.floor(m / 2) : 0));
    if (half === 0) {
      let firstHalf = need.reduce((a, b) => a + b, 0);
      // ensure exactly 120 in first half
      const order = mins.map((m, i) => [m % 2, i] as const).sort((a, b) => b[0] - a[0]);
      let k = 0;
      while (firstHalf < 120 && k < order.length * 2) {
        const i = order[k % order.length][1];
        if (need[i] < mins[i] && need[i] < 24) {
          need[i]++;
          firstHalf++;
        }
        k++;
      }
      firstHalfNeed = need.slice();
    } else {
      for (let i = 0; i < n; i++) need[i] = mins[i] - firstHalfNeed[i];
    }
    // The second half is planned backwards from the final buzzer so the closing lineup
    // finishes the game; its "first" slot in planning order is minute 48. The starters' opening
    // stretch of the third quarter is held back until planning reaches it, so they still have
    // the minutes for it: about half the second-half minutes of the starter who plays fewest,
    // leaving the closers their last four and the bench room for its own minutes.
    let block = 0;
    if (half === 1) {
      block = 24;
      let starters = 0;
      for (let i = 0; i < n; i++) {
        const p = players[i];
        if (p.starter) {
          starters++;
          block = Math.min(block, Math.round(need[i] / 2), Math.floor(6 + (p.endurance / 100) * 6), need[i] - (p.closer ? 4 : 0));
        } else if (need[i] > 0) block = Math.min(block, 24 - need[i] - (p.closer ? 0 : 4));
      }
      if (block < 2 || starters !== 5) block = 0;
    }
    for (let step = 0; step < 24; step++) {
      const s = half === 0 ? step : 23 - step;
      const remaining = 24 - step;
      const slot = half * 24 + s;
      const inBlock = remaining <= block;
      const scores: { i: number; sc: number }[] = [];
      for (let i = 0; i < n; i++) {
        const p = players[i];
        if (inBlock && !p.starter) continue;
        // the minutes he still has to play, and the slots he can play them in
        const avail = need[i] - (p.starter && !inBlock ? block : 0);
        if (avail <= 0) continue;
        const left = inBlock ? remaining : remaining - block;
        const maxStint = 6 + (p.endurance / 100) * 6;
        let sc = avail / left;
        // a player on the floor plays out his last minute now rather than in a one-minute stint later
        if (onPrev[i]) sc += stint[i] < maxStint ? (avail === 1 ? 0.8 : 0.45) : -0.6;
        else if (rest[i] < 3) sc -= 0.35;
        if (half === 0 && step === 0 && p.starter) sc += 6;
        if (half === 1 && step < 4 && p.closer) sc += 6;
        if (avail >= left) sc += 100;
        // one slot to spare: sitting him now would only bring him back after a one-minute rest
        else if (onPrev[i] && avail === left - 1) sc += 3;
        scores.push({ i, sc });
      }
      scores.sort((a, b) => b.sc - a.sc);
      let chosen = scores.slice(0, 5).map((x) => x.i);
      // positional sanity: at least one ball handler, at most three bigs
      const hasGuard = chosen.some((i) => players[i].guard);
      if (!hasGuard) {
        const alt = scores.slice(5).find((x) => players[x.i].guard);
        if (alt) {
          const worst = chosen.filter((i) => !players[i].closer || !(half === 1 && step < 4)).pop();
          if (worst !== undefined) chosen = chosen.map((i) => (i === worst ? alt.i : i));
        }
      }
      const bigs = chosen.filter((i) => players[i].big);
      if (bigs.length > 3) {
        // never the guard just swapped in: a player listed twice would leave the floor with four
        const alt = scores.slice(5).find((x) => !players[x.i].big && !chosen.includes(x.i));
        if (alt) {
          const drop = bigs[bigs.length - 1];
          chosen = chosen.map((i) => (i === drop ? alt.i : i));
        }
      }
      // fill if fewer than five have minutes left (short roster): use the regulars with the most minutes
      if (chosen.length < 5) {
        const extra = players
          .map((_, i) => i)
          .filter((i) => !chosen.includes(i))
          .sort((a, b) => mins[b] - mins[a]);
        while (chosen.length < 5 && extra.length) chosen.push(extra.shift()!);
      }
      for (let i = 0; i < n; i++) {
        const isOn = chosen.includes(i);
        if (isOn) {
          need[i]--;
          stint[i] = onPrev[i] ? stint[i] + 1 : 1;
          rest[i] = 0;
        } else {
          rest[i] = onPrev[i] ? 1 : rest[i] + 1;
          stint[i] = 0;
        }
        onPrev[i] = isOn;
      }
      plan[slot] = chosen.map((i) => players[i].pid);
    }
    // halftime resets stints
    stint.fill(0);
    rest.fill(99);
  }
  return plan;
}

/** Default minute distribution by depth order (sums to 240 for 10+ players). */
export function defaultMinutesByDepth(count: number): number[] {
  const base = [35, 34, 33, 31, 29, 23, 20, 16, 12, 7, 0, 0, 0, 0, 0, 0, 0, 0];
  const mins = base.slice(0, count);
  const sum = mins.reduce((a, b) => a + b, 0);
  if (sum === 0) return mins;
  return mins.map((m) => Math.round((m * 240) / sum));
}
