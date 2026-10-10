// Converts a coach's depth chart + minute targets into a 48-slot (one per game minute)
// substitution plan. The live engine follows the plan at dead balls, overriding it for
// fouls, fatigue, injuries and blowouts. This is what makes minute settings reliable.

export interface PlanPlayer {
  pid: number;
  minutes: number;
  starter: boolean;
  closer: boolean;
  guard: boolean; // can handle the ball
  big: boolean;
  endurance: number; // 0..100
}

export function normalizeMinutes(players: PlanPlayer[], total = 240): number[] {
  const raw = players.map((p) => Math.max(0, Math.min(48, p.minutes)));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // fall back to an even split among the first 10
    return players.map((_, i) => (i < 10 ? total / Math.min(10, players.length) : 0));
  }
  let scaled = raw.map((m) => (m * total) / sum);
  // cap at 46 and redistribute overflow to the rest
  for (let iter = 0; iter < 5; iter++) {
    let overflow = 0;
    scaled = scaled.map((m) => {
      if (m > 46) {
        overflow += m - 46;
        return 46;
      }
      return m;
    });
    if (overflow < 0.01) break;
    const room = scaled.reduce((a, m, i) => a + (m < 46 && raw[i] > 0 ? 46 - m : 0), 0);
    if (room <= 0) break;
    scaled = scaled.map((m, i) => (m < 46 && raw[i] > 0 ? m + (overflow * (46 - m)) / room : m));
  }
  // integer minutes via largest remainder
  const floors = scaled.map((m) => Math.floor(m));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((m, i) => [m - Math.floor(m), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rem <= 0) break;
    floors[i]++;
    rem--;
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
      while (firstHalf > 120) {
        const i = need.indexOf(Math.max(...need));
        need[i]--;
        firstHalf--;
      }
      firstHalfNeed = need.slice();
    } else {
      for (let i = 0; i < n; i++) need[i] = mins[i] - firstHalfNeed[i];
    }
    // The second half is planned backwards from the final buzzer so the closing lineup
    // finishes the game; its "first" slot in planning order is minute 48.
    for (let step = 0; step < 24; step++) {
      const s = half === 0 ? step : 23 - step;
      const remaining = 24 - step;
      const slot = half * 24 + s;
      const scores: { i: number; sc: number }[] = [];
      for (let i = 0; i < n; i++) {
        const p = players[i];
        const avail = need[i];
        if (avail <= 0) continue;
        const maxStint = 6 + (p.endurance / 100) * 6;
        let sc = need[i] / remaining;
        if (onPrev[i]) sc += stint[i] < maxStint ? 0.45 : -0.6;
        else if (rest[i] < 3) sc -= 0.35;
        if (half === 0 && step === 0 && p.starter) sc += 6;
        if (half === 1 && step < 4 && p.closer) sc += 6;
        if (half === 1 && step === 23 && p.starter) sc += 0.6;
        if (avail >= remaining) sc += 100;
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
        const alt = scores.slice(5).find((x) => !players[x.i].big);
        if (alt) {
          const drop = bigs[bigs.length - 1];
          chosen = chosen.map((i) => (i === drop ? alt.i : i));
        }
      }
      // fill if fewer than five have minutes left (short roster): use the freshest regulars
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
