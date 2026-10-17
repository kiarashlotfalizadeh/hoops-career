// The mock draft: AI teams' picks read the way the real draft makes them (the scoring the two share
// leaves the real draft exactly as it was), a mock that never touches the league and reads the same
// for the same league, each pick going to its owner (a protected pick inside its protection stays
// home), the user's big board followed, and after the lottery the real order, on draft night from
// the picks already made.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { aiChoose, draftOrder, draftPlayer, runLottery } from '../league/draft';
import { mockAvailable, mockDraft } from '../league/mockDraft';
import { prospects, teamPlayers } from '../league/helpers';
import { simDay } from '../league/season';
import { Rng } from '../random';
import type { League, Player } from '../types';

/** aiChoose as it was before its scoring was shared with the mock draft. */
function oldChoose(league: League, tid: number, rng: Rng): Player | undefined {
  const avail = prospects(league, league.season);
  if (!avail.length) return undefined;
  const roster = teamPlayers(league, tid);
  const bigs = roster.filter((p) => p.ratings.hgt >= 60).length;
  const guards = roster.filter((p) => p.ratings.hnd >= 60).length;
  let best: Player | undefined;
  let bs = -Infinity;
  for (const p of avail) {
    let s = p.pot * 0.65 + p.ovr * 0.35 + rng.normal(0, 1.5);
    if (bigs <= 2 && p.ratings.hgt >= 60) s += 1;
    if (guards <= 2 && p.ratings.hnd >= 60) s += 1;
    s -= (p.prospect?.rank ?? 50) * 0.04;
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

describe('the mock draft', () => {
  let l: League;
  beforeAll(() => {
    l = testLeague('mock');
    l.id = 'lg_mock';
    for (let i = 0; i < 20; i++) simDay(l);
  }, 60_000);

  it('the real draft picks exactly as it did before its scoring was shared', () => {
    for (let tid = 0; tid < l.teams.length; tid++) {
      const a = new Rng(1000 + tid);
      const b = new Rng(1000 + tid);
      expect(aiChoose(l, tid, a)?.pid).toBe(oldChoose(l, tid, b)?.pid);
      expect(a.state).toBe(b.state);
    }
  });

  it('reads the same for the same league and never touches it', () => {
    expect(mockAvailable(l)).toBe(true);
    const before = JSON.stringify(l);
    const a = mockDraft(l)!;
    const b = mockDraft(l)!;
    expect(JSON.stringify(l)).toBe(before);
    expect(a.slots).toEqual(b.slots);
    expect(a.slots.length).toBe(60);
    expect(a.slots.every((s) => s.projected)).toBe(true);
    // a prospect goes once a draft: his shares over the slots add up to at most every draft
    const shares = new Map<number, number>();
    for (const s of a.slots) {
      expect(s.options.length).toBeGreaterThan(0);
      // the alternatives after the slot's pick, likeliest first
      for (let i = 2; i < s.options.length; i++) expect(s.options[i].p).toBeLessThanOrEqual(s.options[i - 1].p);
      for (const o of s.options) shares.set(o.pid, (shares.get(o.pid) ?? 0) + o.p);
    }
    for (const v of shares.values()) expect(v).toBeLessThanOrEqual(1 + 1e-9);
    // it reads as one draft: nobody is the pick twice
    const picks = a.slots.map((s) => s.options[0].pid);
    expect(new Set(picks).size).toBe(picks.length);
    for (const r of a.range.values()) {
      expect(r.lo).toBeLessThanOrEqual(r.med);
      expect(r.med).toBeLessThanOrEqual(r.hi);
    }
    // the best prospects go early, and they're gone before the late picks
    const best = prospects(l, l.season).sort((x, y) => (x.prospect?.rank ?? 99) - (y.prospect?.rank ?? 99))[0];
    expect(a.range.get(best.pid)!.med).toBeLessThanOrEqual(10);
    expect(a.goneBefore(best.pid, 31)).toBeGreaterThan(0.95);
  });

  it('each pick goes to its owner, and a protected pick inside its protection stays home', () => {
    const x = structuredClone(l);
    const first = mockDraft(x)!.slots[0];
    const dp = x.draftPicks.find((d) => d.season === x.season && d.round === 1 && d.originalTid === first.orig)!;
    const buyer = (first.orig + 1) % 30;
    dp.tid = buyer;
    expect(mockDraft(x)!.slots[0]).toMatchObject({ tid: buyer, orig: first.orig });
    dp.protection = 4;
    expect(mockDraft(x)!.slots[0]).toMatchObject({ tid: first.orig, orig: first.orig });
  });

  it("the user's picks follow his big board", () => {
    const x = structuredClone(l);
    const mine = mockDraft(x)!.slots.find((s) => s.tid === x.userTid)!;
    // the class's lowest-ranked prospect: nobody else takes him first
    const sleeper = prospects(x, x.season).sort((a, b) => (b.prospect?.rank ?? 0) - (a.prospect?.rank ?? 0))[0];
    x.draftBoard = [sleeper.pid];
    const m = mockDraft(x)!;
    expect(m.slots.find((s) => s.tid === x.userTid && s.overall === mine.overall)!.options[0]).toEqual({ pid: sleeper.pid, p: 1 });
  });

  it('after the lottery it drafts in the real order, and on draft night from the picks already made', () => {
    const x = structuredClone(l);
    runLottery(x, new Rng(5));
    x.phase = 'draftLottery';
    const m = mockDraft(x)!;
    expect(m.slots.every((s) => !s.projected)).toBe(true);
    const order = draftOrder(x);
    expect(m.slots.map((s) => [s.round, s.pick, s.tid])).toEqual(order.map((d) => [d.round, d.pick, d.tid]));
    x.phase = 'draft';
    const took = prospects(x, x.season)[0];
    draftPlayer(x, order[0], took.pid);
    const after = mockDraft(x)!;
    expect(after.slots[0].overall).toBe(2);
    expect(after.slots.some((s) => s.options.some((o) => o.pid === took.pid))).toBe(false);
  });

  it('is quick enough to work out when the screen opens', () => {
    const t0 = performance.now();
    mockDraft(l);
    expect(performance.now() - t0).toBeLessThan(2500);
  });
});
