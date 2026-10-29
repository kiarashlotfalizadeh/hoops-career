// The staff's measuring in a sim: each morning, before the sim decides whether to stop, the numbers the
// staff's picks and the open cards wait on (the week's, see weekCall.ts's weekNeeds; the calls', see
// calls.ts's callNeeds) are measured in paired games, on a budget, and the picks made (staffDecide).
// So a long sim and a short one make the same picks, a sim stops only for a card that has its numbers,
// and no card opens only to vanish once its numbers come in. It runs where the sim runs (the worker;
// a test's thread), and the screens' own measuring (staffPlan.ts) is left the cards whose numbers a
// change of his made stale.
//
// The budget: SIM_GAMES paired games a configuration and SIM_COUNTERS counters (the first the rules
// draft), a promising one played again on fresh seeds (see counterWorth.ts). That reads a counter to
// about ±1.0 a game (±0.7 replayed) where a card's own 240 read it to ±0.45; every reading is shrunk
// toward even by its noise before it's called a gain, so the smaller budget makes the staff more
// cautious, not less honest. A measurement is 80 to 240 paired games: a skid's steps, a starter's
// injury, the young players' lean and its second reading, the deadline's deal, the series, and the
// staff's playbook change (staffLever.ts, the biggest).
import type { League } from '../types';
import { counterWorth, measureChanges, withChange, type WorthOpts } from '../ai/counterWorth';
import { callNeeds, callsDecide, changeWorth, countersWorth, storeWorth, type CallMeasure, type CallWorth } from './calls';
import { payoffNeeds, weekDecide, weekNeeds, youthPayoff } from './weekCall';
import { leverMorning } from './staffLever';

/** Paired games a configuration plays in a sim's measurement. */
export const SIM_GAMES = 40;
/** Counters a sim's measurement plays at most. */
export const SIM_COUNTERS = 2;
/** Rounds of measuring a morning at most (a pick can call for another measurement). */
const ROUNDS = 4;

/** One call's numbers, measured on the sim's budget (the screens pass their own options). Null if it was stopped. */
export async function measureCall(league: League, m: CallMeasure, opts: WorthOpts = {}): Promise<CallWorth | null> {
  const g = league.schedule.find((x) => x.gid === m.gid);
  if (m.kind === 'counters') {
    const out = await counterWorth(league, m.opp, g, { games: SIM_GAMES, counters: SIM_COUNTERS, ...opts });
    return out ? countersWorth(league, m, out) : null;
  }
  const out = await measureChanges(m.base ? withChange(league, m.base) : league, m.opp, [m.change], g, { games: SIM_GAMES, ...opts });
  return out?.[0] ? changeWorth(league, m, out[0]) : null;
}

/** What the staff's picks and the open cards wait on this morning, each once. */
export function staffNeeds(league: League): CallMeasure[] {
  const all = [...weekNeeds(league), ...callNeeds(league), ...payoffNeeds(league)];
  return all.filter((m, i) => all.findIndex((x) => x.key === m.key) === i);
}

/** The staff's picks, with what they wait on measured. */
export function staffDecide(league: League) {
  youthPayoff(league);
  weekDecide(league);
  callsDecide(league);
}

/**
 * The morning's measuring and the picks (runSim calls it each morning): false if it was stopped
 * part-way (what's measured is kept; the rest is measured the next time).
 */
export async function staffMorning(league: League, opts: WorthOpts & { onMeasure?: () => void } = {}): Promise<boolean> {
  for (let round = 0; round < ROUNDS; round++) {
    const need = staffNeeds(league);
    if (!need.length) break;
    opts.onMeasure?.();
    for (const m of need) {
      const w = await measureCall(league, m, opts);
      if (!w) return false;
      storeWorth(league, m.key, w);
    }
    staffDecide(league);
  }
  staffDecide(league);
  // (the staff's measured change to the user's playbook, every couple of weeks: staffLever.ts)
  return leverMorning(league, opts);
}
