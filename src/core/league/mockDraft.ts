// The mock draft: this season's draft played out the way AI teams pick (draftScore: potential and
// talent as the consensus reads them, a nudge toward a roster's needs, the consensus rank, and
// what nobody outside knows: each team's own board and its whim on the night, MOCK_SPREAD), a few
// hundred times on a stream of its own. Before the lottery the order is the one by
// record (as the projected slots read it: lottery teams first, then the playoff teams), with each
// pick going to its owner (a protected pick that lands inside its protection stays home, a swap
// right takes the other first when that one lands higher); after the lottery it's the real order,
// and on draft night it starts from the picks already made. The user's picks go to the highest
// player left on his own big board, or to his staff's pick (the best on their read). Pure reads of
// the league: the real draft's draws never change.

import type { DraftPick, League } from '../types';
import { Rng, hashString, mix32 } from '../random';
import { DRAFT_NOISE, draftNeed, draftOrder, draftScore, draftStandings, type DraftNeed } from './draft';
import { curTeamSeason, prospects, teamPlayers } from './helpers';
import { consensusRead, mystery, staffRead, teamSpread } from './prospects';

/** Simulated drafts in a mock. */
export const MOCK_RUNS = 250;
/** A prospect this far below a slot's best rated one (about five of a team's reads on the night) is never its pick. */
const OUT_OF_REACH = 10;

/** How far an AI team's score of a prospect strays from the consensus's, one standard deviation: its own board (teamSpread, for a prospect this hard to read) and its whim on the night (DRAFT_NOISE). */
export const mockSpread = (league: League, m = 1) => Math.hypot(teamSpread(league, m), DRAFT_NOISE);

export interface MockSlot {
  round: 1 | 2;
  /** The pick's number in its round, and overall. */
  pick: number;
  overall: number;
  /** Who makes it, and whose pick it was (traded picks: the original team). */
  tid: number;
  orig: number;
  /** Before the lottery: a slot by record, which the lottery can still reshuffle. */
  projected: boolean;
  /**
   * The mock's pick for the slot (its likeliest player not named at an earlier slot), then the
   * likeliest others: each with the share of drafts he was the pick here.
   */
  options: { pid: number; p: number }[];
}

export interface MockDraft {
  slots: MockSlot[];
  runs: number;
  /** Each prospect's draft position over the runs: the 10th-percentile, median and 90th-percentile overall pick (61+: undrafted), and how often he went in the first round. */
  range: Map<number, { lo: number; med: number; hi: number; first: number }>;
  /** The share of drafts a prospect was gone before an overall pick. */
  goneBefore: (pid: number, overall: number) => number;
}

/** Whether there's a mock to show: this season's class exists and the order means something (games played, or the lottery drawn). */
export function mockAvailable(league: League): boolean {
  if (!prospects(league, league.season).length) return false;
  if (league.phase === 'draftLottery' || league.phase === 'draft') return draftOrder(league).length > 0;
  if (!['regular', 'playin', 'playoffs'].includes(league.phase)) return false;
  return league.teams.some((t) => {
    const ts = curTeamSeason(league, t.tid);
    return ts.won + ts.lost > 0;
  });
}

/** The order the mock drafts in: the real one once the lottery has set it, else by record. */
function mockOrder(league: League): { round: 1 | 2; pick: number; tid: number; orig: number; projected: boolean }[] {
  const real = draftOrder(league);
  if (real.length) return real.map((d) => ({ round: d.round, pick: d.pick!, tid: d.tid, orig: d.originalTid, projected: false }));
  const recs = draftStandings(league);
  const order = { 1: [...recs.filter((r) => !r.playoff), ...recs.filter((r) => r.playoff)], 2: draftStandings(league, 2) };
  const out: ReturnType<typeof mockOrder> = [];
  const firsts = new Map<number, (typeof out)[number]>();
  for (const round of [1, 2] as const)
    order[round].forEach((r, i) => {
      const dp: DraftPick | undefined = league.draftPicks.find((d) => d.season === league.season && d.round === round && d.originalTid === r.tid);
      if (!dp) return;
      // a pick that lands inside its protection stays with its team
      const tid = dp.protection && i + 1 <= dp.protection ? dp.originalTid : dp.tid;
      const slot = { round, pick: i + 1, tid, orig: dp.originalTid, projected: true };
      out.push(slot);
      if (round === 1) firsts.set(dp.dpid, slot);
    });
  // a swap right takes the other first when that one lands higher, as the lottery settles it (see resolveSwaps)
  for (const d of league.draftPicks) {
    const right = firsts.get(d.dpid);
    const subject = d.swap !== undefined ? firsts.get(d.swap) : undefined;
    if (right && subject && subject.pick < right.pick) [right.tid, subject.tid] = [subject.tid, right.tid];
  }
  return out;
}

/** The mock draft for the league as it stands (null when there's none to show). */
export function mockDraft(league: League, runs = MOCK_RUNS): MockDraft | null {
  if (!mockAvailable(league)) return null;
  const order = mockOrder(league);
  const pool = prospects(league, league.season);
  if (!order.length || !pool.length) return null;
  const n = league.teams.length;
  const user = league.userTid;
  const idx = new Map(pool.map((p, i) => [p.pid, i]));
  // the user's board, as pool indexes, best first
  const board = (league.draftBoard ?? []).map((pid) => idx.get(pid)).filter((i): i is number => i !== undefined);
  const need0 = league.teams.map((t) => draftNeed(teamPlayers(league, t.tid)));
  // the room's read of each prospect, and the user's staff's
  const room = pool.map((p) => consensusRead(league, p));
  const staff = pool.map((p) => staffRead(league, p));
  const spread = pool.map((p) => mockSpread(league, mystery(league, p)));
  const big = pool.map((p) => p.ratings.hgt >= 60);
  const guard = pool.map((p) => p.ratings.hnd >= 60);
  const counts = order.map(() => new Map<number, number>());
  const where = pool.map(() => new Int32Array(runs));
  const base = hashString(`${league.id}:${league.season}:${league.phase}:${league.day}:${pool.length}:mock`);
  const taken = new Uint8Array(pool.length);
  const at = new Float64Array(pool.length);
  for (let r = 0; r < runs; r++) {
    const rng = new Rng(mix32(base + Math.imul(r + 1, 0x9e3779b1)));
    taken.fill(0);
    const need: DraftNeed[] = need0.map((x) => ({ ...x }));
    for (let k = 0; k < pool.length; k++) where[k][r] = order.length + 1;
    order.forEach((slot, si) => {
      let pick = -1;
      if (slot.tid === user) pick = board.find((i) => !taken[i]) ?? -1;
      if (pick < 0 && slot.tid === user) {
        // his staff's pick: the best on their read, need counted
        let best = -Infinity;
        const nd = need[slot.tid] ?? { bigs: 3, guards: 3 };
        for (let i = 0; i < pool.length; i++) {
          if (taken[i]) continue;
          const s = draftScore(pool[i], nd, 0, staff[i], false);
          if (s > best) {
            best = s;
            pick = i;
          }
        }
      }
      if (pick < 0) {
        const nd = need[slot.tid] ?? { bigs: 3, guards: 3 };
        // the rating without the night's read; a prospect out of reach of the best is left out of the draws
        let top = -Infinity;
        for (let i = 0; i < pool.length; i++) {
          if (taken[i]) continue;
          at[i] = draftScore(pool[i], nd, 0, room[i]);
          if (at[i] > top) top = at[i];
        }
        let best = -Infinity;
        for (let i = 0; i < pool.length; i++) {
          if (taken[i] || at[i] < top - OUT_OF_REACH) continue;
          const s = at[i] + rng.normal(0, spread[i]);
          if (s > best) {
            best = s;
            pick = i;
          }
        }
      }
      if (pick < 0) return;
      taken[pick] = 1;
      where[pick][r] = si + 1;
      counts[si].set(pick, (counts[si].get(pick) ?? 0) + 1);
      const nd = need[slot.tid];
      if (nd) {
        if (big[pick]) nd.bigs++;
        if (guard[pick]) nd.guards++;
      }
    });
  }
  // the mock reads as one draft: each slot's pick is its likeliest player not already named at an
  // earlier slot (a prospect likeliest at #3 and #4 is #3's), the alternatives the likeliest of the rest
  const named = new Set<number>();
  const slots: MockSlot[] = order.map((o, si) => {
    const ranked = [...counts[si].entries()].sort((a, b) => b[1] - a[1]);
    const pick = ranked.find(([i]) => !named.has(i));
    if (pick) named.add(pick[0]);
    const others = ranked.filter(([i]) => !named.has(i)).slice(0, 2);
    return {
      ...o,
      overall: (o.round - 1) * n + o.pick,
      options: (pick ? [pick, ...others] : others).map(([i, c]) => ({ pid: pool[i].pid, p: c / runs })),
    };
  });
  // a position in the mock's order to the slot's overall number (on draft night the order starts mid-draft)
  const overallAt = (pos: number) => (pos <= slots.length ? slots[pos - 1].overall : 2 * n + 1);
  const range = new Map<number, { lo: number; med: number; hi: number; first: number }>();
  pool.forEach((p, i) => {
    const d = [...where[i]].sort((a, b) => a - b);
    const q = (f: number) => overallAt(d[Math.min(d.length - 1, Math.floor(f * (d.length - 1)))]);
    range.set(p.pid, { lo: q(0.1), med: q(0.5), hi: q(0.9), first: d.filter((x) => x <= slots.length && slots[x - 1].round === 1).length / runs });
  });
  const goneBefore = (pid: number, overall: number) => {
    const i = idx.get(pid);
    if (i === undefined) return 1;
    let c = 0;
    for (const x of where[i]) if (x <= slots.length && slots[x - 1].overall < overall) c++;
    return c / runs;
  };
  return { slots, runs, range, goneBefore };
}

const memo = new WeakMap<League, { key: string; value: MockDraft | null }>();

/** The mock the screens share, worked out once for the league as it is (a pick made, a game played, the board reordered, a trade). */
export function leagueMock(league: League): MockDraft | null {
  const key = `${league.season}|${league.phase}|${league.day}|${league.games.length}|${league.nextTxnId ?? 0}|${league.draftPicks.length}|${(league.draftBoard ?? []).join(',')}`;
  const hit = memo.get(league);
  if (hit && hit.key === key) return hit.value;
  const value = mockDraft(league);
  memo.set(league, { key, value });
  return value;
}

/** The user's next pick in the mock's order, if he has one. */
export const userNextSlot = (league: League, m: MockDraft) => m.slots.find((s) => s.tid === league.userTid);
