// AI trade offers to the user (proposals), untouchables, the packages behind the trading block,
// the trade deadline's ramp, rumors and recap, and draft night stopped before every pick.
// Fictional leagues keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { advanceDay, continueDraft, draftNextPick, startDraft, startRegularSeason, userDraftPick } from '../league/season';
import { CAP_FOR, contractSeason, dateToDay, prospects, standardRoster } from '../league/helpers';
import { marketSalary, releasePlayer, tradeValue } from '../league/contracts';
import {
  MAX_OPEN,
  acceptProposal,
  aiProposals,
  cleanProposals,
  declineProposal,
  draftProposals,
  freeAgencyProposals,
  isUntouchable,
  openProposals,
  proposalError,
  setUntouchable,
} from '../league/proposals';
import { deadlineDay, seasonTrades } from '../league/deadline';
import { MAX_FIRSTS_OUT, MAX_PICKS_OUT, aiToAiTrade, aiTradeChance, evaluateTrade, executeTrade, makeItWork, neutralBalance, packageFor, validateTrade } from '../league/trades';
import { nextPick, runLottery } from '../league/draft';
import { Rng } from '../random';
import type { League, Player, Proposal } from '../types';
import { DRAFT_PROSPECT } from '../types';

const U = 0;

function league(rngSeed = 5, userTid = U): League {
  const l = createLeague({ name: `pr${rngSeed}`, userTid, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // offers and rumors draw on streams seeded by the league's id, which is made from the clock
  l.id = `pr${rngSeed}`;
  return l;
}

/** A league in its regular season, with the user's roster at 15. */
function season(rngSeed = 5): League {
  const l = league(rngSeed);
  while (standardRoster(l, U).length > 15) releasePlayer(l, standardRoster(l, U)[0], { news: false });
  expect(startRegularSeason(l)).toEqual([]);
  return l;
}

/** Give a player a known value: OVR = POT, age, healthy, and a contract at his market price unless `salary` is set. */
function shape(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.mood.tradeRequest = false;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary ?? marketSalary(l, p)) };
  return p;
}

/** Each AI team's best package for the user's players and picks in `give`, where it has one. */
const packages = (l: League, give: { pids: number[]; dpids: number[] }) =>
  l.teams.flatMap((t) => (t.tid === l.userTid ? [] : [packageFor(l, t.tid, give)].filter((x) => x !== null)));

/** Every offer made on each day up to the deadline (the daily clean-up in between), checked as it is made. */
function offersThroughDeadline(l: League, check: (p: Proposal) => void): Proposal[] {
  const made: Proposal[] = [];
  for (let d = l.day; d <= l.tradeDeadlineDay; d++) {
    l.day = d;
    cleanProposals(l);
    const before = new Set(openProposals(l).map((p) => p.id));
    aiProposals(l);
    for (const p of openProposals(l).filter((x) => !before.has(x.id))) {
      check(p);
      made.push(p);
    }
  }
  return made;
}

/** Days go by (offers made, the daily clean-up) until an open offer matches `want`. */
function waitForOffer(l: League, want: (p: Proposal) => boolean = () => true): Proposal | undefined {
  for (let d = l.day; d <= l.tradeDeadlineDay; d++) {
    l.day = d;
    cleanProposals(l);
    aiProposals(l);
    const p = openProposals(l).find(want);
    if (p) return p;
  }
  return undefined;
}

describe('AI trade offers', () => {
  it('are deals the offering team accepts and the rules allow, never far against the user, four open at most and one per team', () => {
    let n = 0;
    for (const seed of [5, 9]) {
      const l = season(seed);
      const made = offersThroughDeadline(l, (p) => {
        expect(validateTrade(l, p.offer)).toEqual([]);
        expect(evaluateTrade(l, p.offer).accept).toBe(true);
        expect(proposalError(l, p)).toBeNull();
        const { net, out } = neutralBalance(l, p.offer);
        expect(net).toBeGreaterThanOrEqual(-0.1 * Math.max(0, out) - 1e-9);
        expect(p.offer.a.tid).toBe(U);
        expect(p.expires - p.day).toBeLessThanOrEqual(7);
        expect(l.inbox.some((m) => m.proposal === p.id)).toBe(true);
        const open = openProposals(l);
        expect(open.length).toBeLessThanOrEqual(MAX_OPEN);
        expect(new Set(open.map((x) => x.tid)).size).toBe(open.length);
      });
      n += made.length;
      expect(new Set(made.map((p) => p.kind)).has('buy')).toBe(true);
    }
    expect(n).toBeGreaterThan(4);
  });

  it("never ask for a player the user made untouchable, nor does 'what would make this work?'", () => {
    const l = season(9);
    const off = standardRoster(l, U)
      .sort((a, b) => tradeValue(l, b) - tradeValue(l, a))
      .slice(0, 6);
    for (const p of off) setUntouchable(l, p.pid, true);
    expect(off.every((p) => isUntouchable(l, p.pid))).toBe(true);
    const made = offersThroughDeadline(l, (p) => expect(p.offer.a.pids.some((pid) => off.some((x) => x.pid === pid))).toBe(false));
    expect(made.length).toBeGreaterThan(0);
    // asked what it would take for their best player, no team asks for an untouchable
    for (const t of l.teams.slice(1, 8)) {
      const best = standardRoster(l, t.tid).sort((a, b) => b.ovr - a.ovr)[0];
      const r = makeItWork(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: t.tid, pids: [best.pid], dpids: [] } });
      for (const pid of r.offer?.a.pids ?? []) expect(isUntouchable(l, pid)).toBe(false);
    }
  });

  it('marking a player untouchable withdraws an offer for him, and the mark goes when he leaves', () => {
    const l = season(5);
    const p = waitForOffer(l, (x) => x.offer.a.pids.length > 0);
    expect(p).toBeDefined();
    const pid = p!.offer.a.pids[0];
    setUntouchable(l, pid, true);
    expect(openProposals(l).some((x) => x.id === p!.id)).toBe(false);
    releasePlayer(l, l.players[pid], { news: false });
    expect(l.untouchable).not.toContain(pid);
  });

  it('expire after their last day', () => {
    const l = season(5);
    const p = waitForOffer(l)!;
    expect(p).toBeDefined();
    l.day = p.expires;
    cleanProposals(l);
    expect(openProposals(l)).toContain(p);
    l.day = p.expires + 1;
    expect(proposalError(l, p)).toMatch(/expired/);
    cleanProposals(l);
    expect(openProposals(l)).not.toContain(p);
  });

  it('accepting one goes through; a stale one fails cleanly and changes nothing', () => {
    const l = season(9);
    const good = waitForOffer(l)!;
    expect(good).toBeDefined();
    // one goes through: the user's assets move to the offering team
    const r = acceptProposal(l, good.id);
    expect(r.ok).toBe(true);
    for (const pid of good.offer.a.pids) expect(l.players[pid].tid).toBe(good.tid);
    for (const pid of good.offer.b.pids) expect(l.players[pid].tid).toBe(U);
    expect(openProposals(l)).not.toContain(good);
    // another goes stale: a player in it moves elsewhere first
    const l2 = season(5);
    const stale = waitForOffer(l2, (p) => p.offer.b.pids.length > 0)!;
    expect(stale).toBeDefined();
    const moved = stale.offer.b.pids[0];
    const other = l2.teams.find((t) => t.tid !== U && t.tid !== stale.tid)!.tid;
    executeTrade(l2, { a: { tid: stale.tid, pids: [moved], dpids: [] }, b: { tid: other, pids: [], dpids: [] } });
    const owners = new Map(Object.values(l2.players).map((p) => [p.pid, p.tid]));
    const res = acceptProposal(l2, stale.id);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no longer on that team/);
    expect(Object.values(l2.players).every((p) => owners.get(p.pid) === p.tid)).toBe(true);
    expect(openProposals(l2)).not.toContain(stale);
    expect(acceptProposal(l2, stale.id).reason).toMatch(/no longer on the table/);
    expect(declineProposal(l2, 999_999)).toBe(false);
  });

  it("taxpayers' salary dumps leave the user ahead in neutral value", () => {
    const l = league(7);
    l.phase = 'freeAgency';
    l.day = dateToDay(l.season, 5, 30);
    const cs = contractSeason(l);
    const cap = CAP_FOR(l, cs);
    // the user has room; three AI teams are over the tax, each with a bad contract
    for (const p of standardRoster(l, U)) shape(l, p, p.ovr, 26, cap.vetMin);
    let n = 0;
    for (const tid of [3, 8, 14]) {
      shape(l, standardRoster(l, tid)[0], 66, 31, Math.round(cap.salaryCap * 0.12), 3);
      l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: cs, amount: cap.luxuryTax });
    }
    freeAgencyProposals(l);
    for (const p of openProposals(l)) {
      expect(p.kind).toBe('dump');
      expect(neutralBalance(l, p.offer).net).toBeGreaterThanOrEqual(0);
      expect(evaluateTrade(l, p.offer).accept).toBe(true);
      expect(p.offer.b.dpids.length).toBeLessThanOrEqual(MAX_PICKS_OUT);
      n++;
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe("the trading block's packages", () => {
  it('send two firsts and three picks at most, and nothing the user traded away this season or that just signed (B3, B6)', () => {
    const l = season(5);
    // a star everybody wants: picks pile up
    const star = shape(l, standardRoster(l, U)[0], 92, 24, CAP_FOR(l).vetMin, 3);
    // every team's best player just signed, and the user traded each team's first pick away earlier
    for (const t of l.teams.filter((x) => x.tid !== U)) {
      standardRoster(l, t.tid).sort((a, b) => b.ovr - a.ovr)[0].tradeLock = { season: l.season, day: l.day + 30 };
      const dp = l.draftPicks.find((d) => d.tid === t.tid && d.round === 1)!;
      dp.tradedFrom = { tid: U, season: l.season };
    }
    const offers = packages(l, { pids: [star.pid], dpids: [] });
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const picks = o.offer.b.dpids.map((d) => l.draftPicks.find((x) => x.dpid === d)!);
      expect(picks.length).toBeLessThanOrEqual(MAX_PICKS_OUT);
      expect(picks.filter((d) => d.round === 1).length).toBeLessThanOrEqual(MAX_FIRSTS_OUT);
      expect(picks.some((d) => d.tradedFrom?.tid === U)).toBe(false);
      expect(o.offer.b.pids.some((pid) => l.players[pid].tradeLock)).toBe(false);
      expect(evaluateTrade(l, o.offer).accept).toBe(true);
    }
  });

  it('can shop a pick, or a player and a pick together', () => {
    const l = season(5);
    const pick = l.draftPicks.find((d) => d.tid === U && d.round === 1)!;
    const forPick = packages(l, { pids: [], dpids: [pick.dpid] });
    expect(forPick.length).toBeGreaterThan(0);
    for (const o of forPick) {
      expect(o.offer.a).toEqual({ tid: U, pids: [], dpids: [pick.dpid] });
      expect(evaluateTrade(l, o.offer).accept).toBe(true);
    }
    const p = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr)[1];
    const both = packages(l, { pids: [p.pid], dpids: [pick.dpid] });
    expect(both.length).toBeGreaterThan(0);
    for (const o of both) expect(evaluateTrade(l, o.offer).accept).toBe(true);
  });
});

describe('the trade deadline', () => {
  it('ramps AI-to-AI trade attempts toward the deadline, about as many a season as before', () => {
    const l = league(5);
    l.phase = 'regular';
    const D = l.tradeDeadlineDay;
    let expected = 0;
    const at = (d: number) => {
      l.day = d;
      return aiTradeChance(l);
    };
    for (let d = 0; d <= D; d++) {
      const c = at(d);
      expected += c.p * c.attempts;
    }
    // the flat 12% a day it replaces
    expect(expected / (0.12 * (D + 1))).toBeGreaterThan(0.85);
    expect(expected / (0.12 * (D + 1))).toBeLessThan(1.1);
    expect(at(D - 3).p).toBeGreaterThanOrEqual(3 * at(D - 40).p);
    expect(at(D).attempts).toBe(3);
    // and the trades themselves cluster: more a day in the last three weeks than before
    const early: number[] = [];
    const late: number[] = [];
    for (const seed of [2, 3, 4]) {
      const s = season(seed);
      const ids = () => s.news.filter((n) => n.text.startsWith('Trade: ')).length;
      const rng = new Rng(seed);
      for (let d = 0; d <= s.tradeDeadlineDay; d++) {
        s.day = d;
        const before = ids();
        aiToAiTrade(s, rng);
        (s.tradeDeadlineDay - d < 21 ? late : early).push(ids() - before);
      }
    }
    const rate = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(rate(late)).toBeGreaterThan(rate(early));
  });

  it('posts weekly rumors in the last three weeks, a deadline-day briefing and one recap the day after', () => {
    const l = season(5);
    const D = l.tradeDeadlineDay;
    for (const d of [D - 22, D - 15, D - 8, D - 1, D, D + 1]) {
      l.day = d;
      advanceDay(l);
    }
    const rumors = l.news.filter((n) => n.kind === 'rumor');
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors.every((n) => [D - 21, D - 14, D - 7].includes(n.day) && /are listening on/.test(n.text))).toBe(true);
    expect(l.inbox.filter((m) => m.subject === 'Deadline day' && m.day === D)).toHaveLength(1);
    // the recap counts the season's trades, once, however often the day is looked at
    deadlineDay(l);
    l.day = D + 1;
    deadlineDay(l);
    const recaps = l.news.filter((n) => n.text.startsWith('Trade deadline recap'));
    expect(recaps).toHaveLength(1);
    expect(recaps[0].day).toBe(D + 1);
    expect(recaps[0].text).toContain(seasonTrades(l).length === 1 ? 'one trade' : seasonTrades(l).length ? `${seasonTrades(l).length} trades` : 'no trades');
    expect(l.inbox.filter((m) => m.subject === 'Deadline recap')).toHaveLength(1);
  });
});

describe('draft night', () => {
  function lottery(rngSeed = 5): League {
    const l = league(rngSeed);
    l.phase = 'draftLottery';
    runLottery(l, new Rng(3));
    return l;
  }
  const drafted = (l: League) => Object.values(l.players).filter((p) => p.draft.year === l.season && p.draft.round > 0 && p.tid !== DRAFT_PROSPECT).length;

  it('stopped before every pick, starts with #1 on the clock; the next pick is exactly one', () => {
    const l = lottery();
    l.settings.draftPause = true;
    expect(startDraft(l)).toBe(true);
    expect([nextPick(l)?.round, nextPick(l)?.pick]).toEqual([1, 1]);
    expect(drafted(l)).toBe(0);
    for (let i = 1; i <= 5; i++) {
      const dp = nextPick(l)!;
      if (dp.tid === l.userTid) {
        expect(draftNextPick(l)).toBe(false);
        // the user's own pick stops before the next one too
        expect(userDraftPick(l, prospects(l, l.season)[0].pid)).toBeNull();
      } else expect(draftNextPick(l)).toBe(true);
      expect(drafted(l)).toBe(i);
      expect(nextPick(l)!.pick).toBe(i + 1);
    }
    // off again, the draft runs on to the user's next pick
    l.settings.draftPause = false;
    continueDraft(l);
    expect(nextPick(l)?.tid).toBe(l.userTid);
    // and outside the draft nothing happens
    l.phase = 'resign';
    expect(draftNextPick(l)).toBe(false);
  });

  it("without the pause, runs to the user's pick as before, where teams call to move up into it", () => {
    const l = lottery(7);
    expect(startDraft(l)).toBe(true);
    const dp = nextPick(l);
    expect(dp?.tid).toBe(l.userTid);
    if (dp?.round === 1) {
      draftProposals(l);
      for (const p of openProposals(l)) {
        expect(p.kind).toBe('pick');
        expect(p.offer.a.dpids).toEqual([dp.dpid]);
        expect(evaluateTrade(l, p.offer).accept).toBe(true);
        expect(p.expires).toBe(l.day);
      }
    }
  });
});
