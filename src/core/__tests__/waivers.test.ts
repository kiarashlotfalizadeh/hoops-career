// Waivers and buyouts (W10): in-season releases with guaranteed money go on waivers for two days,
// where teams claim in reverse order of record and take the dead money off the old team's books;
// veterans can be bought out for part of what they're owed; rebuilders buy out veterans after
// the deadline without going under 14 players.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, curTeamSeason, freeAgents, standardRoster } from '../league/helpers';
import {
  WAIVER_DAYS,
  aiBuyouts,
  buyoutTerms,
  claimBlockedReason,
  onWaivers,
  releasePlayer,
  resolveWaivers,
  signPlayer,
  userBuyout,
  userClaim,
  waiverOrder,
} from '../league/contracts';
import { userOffer } from '../league/freeAgency';
import { contractExp } from '../playerGen';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;

function league(rngSeed = 11): League {
  const l = createLeague({ name: `w${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `waivers_${rngSeed}`;
  l.phase = 'regular';
  l.day = 20;
  // everyone 10-10, so a test can make the team it wants first in the waiver order
  for (const t of l.teams) Object.assign(curTeamSeason(l, t.tid), { won: 10, lost: 10 });
  return l;
}

const record = (l: League, tid: number, won: number) => Object.assign(curTeamSeason(l, tid), { won, lost: 20 - won });

/** A player of known value and contract (`salary` a season, `years` from this season). */
function shape(l: League, p: Player, ovr: number, age: number, salary: number, years: number): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  p.mood.tradeRequest = false;
  p.mood.score = 0;
  p.contract = { start: l.season, salaries: Array.from({ length: years }, () => salary) };
  return p;
}

/** Bring a team to `n` standard players: preseason cuts (no waivers), or free agents on minimum deals. */
function cutTo(l: League, tid: number, n: number) {
  const phase = l.phase;
  l.phase = 'preseason';
  while (standardRoster(l, tid).length > n) releasePlayer(l, standardRoster(l, tid)[0], { news: false });
  l.phase = phase;
  while (standardRoster(l, tid).length < n) signPlayer(l, freeAgents(l)[0], tid, CAP_FOR(l).vetMin, 1, { news: false });
}

const deadFor = (l: League, tid: number, pid: number) => l.teams[tid].deadMoney.filter((d) => d.pid === pid).reduce((a, d) => a + d.amount, 0);
const passDays = (l: League, n: number) => {
  for (let i = 0; i < n; i++) {
    l.day++;
    resolveWaivers(l);
  }
};

describe('waivers', () => {
  it("a claim takes over the contract, and the dead money comes off the old team's books", () => {
    const l = league();
    const vetMin = CAP_FOR(l).vetMin;
    const p = shape(l, standardRoster(l, U)[0], 70, 26, vetMin, 2);
    const claimer = 5;
    cutTo(l, claimer, 14);
    record(l, claimer, 2);
    releasePlayer(l, p);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toMatchObject({ from: U, until: l.day + WAIVER_DAYS });
    expect(deadFor(l, U, p.pid)).toBe(2 * vetMin);
    // on waivers he can be claimed, not signed
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(false);
    expect(onWaivers(l).map((x) => x.pid)).toEqual([p.pid]);
    expect(userOffer(l, p.pid, vetMin, 1).reason).toMatch(/waivers/);
    passDays(l, WAIVER_DAYS - 1);
    expect(p.tid).toBe(FREE_AGENT);
    passDays(l, 1);
    expect(p.tid).toBe(claimer);
    expect(p.waivers).toBeUndefined();
    expect(p.contract.salaries).toEqual([vetMin, vetMin]);
    expect(l.teams[claimer].rotation.order).toContain(p.pid);
    expect(deadFor(l, U, p.pid)).toBe(0);
    expect(l.inbox[0].subject).toMatch(/claimed off waivers/);
  });

  it('a contract nobody wants clears to free agency, and its dead money stays', () => {
    const l = league();
    const p = shape(l, standardRoster(l, U)[0], 62, 31, 30_000, 3);
    releasePlayer(l, p);
    expect(p.waivers).toBeDefined();
    passDays(l, WAIVER_DAYS);
    expect(p.waivers).toBeUndefined();
    expect(p.tid).toBe(FREE_AGENT);
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(true);
    expect(deadFor(l, U, p.pid)).toBe(90_000);
    expect(l.inbox[0].subject).toMatch(/cleared waivers/);
  });

  it('the user claims in waiver order: a worse record goes first', () => {
    for (const worseAi of [false, true]) {
      const l = league();
      const vetMin = CAP_FOR(l).vetMin;
      const from = 7;
      const p = shape(l, standardRoster(l, from)[0], 69, 25, vetMin, 2);
      cutTo(l, U, 14);
      record(l, U, 3);
      const rival = 9;
      cutTo(l, rival, 14);
      if (worseAi) record(l, rival, 1);
      releasePlayer(l, p);
      expect(claimBlockedReason(l, from, p)).toMatch(/released/);
      expect(userClaim(l, p.pid).ok).toBe(true);
      expect(waiverOrder(l)[0].tid).toBe(worseAi ? rival : U);
      passDays(l, WAIVER_DAYS);
      expect(p.tid).toBe(worseAi ? rival : U);
      expect(deadFor(l, from, p.pid)).toBe(0);
      if (worseAi) expect(l.inbox[0].body).toMatch(/ahead of us/);
    }
  });

  it("a claim needs a roster spot and room for this season's salary unless it's a minimum", () => {
    const l = league();
    const from = 7;
    const p = shape(l, standardRoster(l, from)[0], 75, 27, 25_000, 2);
    releasePlayer(l, p);
    cutTo(l, U, 14);
    l.teams[U].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).salaryCap });
    expect(userClaim(l, p.pid).reason).toMatch(/cap space/);
    l.teams[U].deadMoney = [];
    while (standardRoster(l, U).length < 15) {
      const fa = freeAgents(l)[0];
      fa.tid = U;
      fa.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    }
    expect(claimBlockedReason(l, U, p)).toMatch(/roster spot/);
  });

  it("preseason cuts and minimum camp deals don't go through waivers", () => {
    const l = league();
    l.phase = 'preseason';
    const p = shape(l, standardRoster(l, U)[0], 70, 26, 10_000, 2);
    const camp = shape(l, standardRoster(l, U)[1], 66, 26, CAP_FOR(l).vetMin, 1);
    releasePlayer(l, p);
    releasePlayer(l, camp);
    expect(p.waivers).toBeUndefined();
    expect(camp.waivers).toBeUndefined();
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(true);
  });

  it('everyone left on waivers clears when the season is over', () => {
    const l = league();
    const p = shape(l, standardRoster(l, U)[0], 70, 26, CAP_FOR(l).vetMin, 2);
    releasePlayer(l, p);
    l.phase = 'draftLottery';
    resolveWaivers(l);
    expect(p.waivers).toBeUndefined();
    expect(p.tid).toBe(FREE_AGENT);
  });
});

describe('buyouts', () => {
  it('cuts the dead money by what he gives back, with no waivers', () => {
    const l = league();
    const p = shape(l, standardRoster(l, U)[0], 74, 31, 20_000, 2);
    l.teams[U].strategy = 'contend';
    const happy = buyoutTerms(l, p)!;
    expect(happy.owed).toBe(40_000);
    expect(happy.giveback).toBeGreaterThanOrEqual(0);
    expect(happy.giveback).toBeLessThanOrEqual(0.35);
    // unhappy, older, or on a team that isn't contending: he gives back more
    p.mood.tradeRequest = true;
    const unhappy = buyoutTerms(l, p)!;
    expect(unhappy.giveback).toBeGreaterThan(happy.giveback);
    p.bornYear = l.season - 33;
    l.teams[U].strategy = 'rebuild';
    const most = buyoutTerms(l, p)!;
    expect(most.giveback).toBeGreaterThan(unhappy.giveback);
    expect(most.giveback).toBeLessThanOrEqual(0.35);
    const res = userBuyout(l, p.pid);
    expect(res.ok).toBe(true);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toBeUndefined();
    expect(deadFor(l, U, p.pid)).toBe(most.dead);
    expect(Math.abs(most.dead - most.owed * (1 - most.giveback))).toBeLessThanOrEqual(20);
    expect(most.saved).toBeGreaterThan(0);
  });

  it('is for veterans with guaranteed money left', () => {
    const l = league();
    const young = shape(l, standardRoster(l, U)[0], 74, 26, 20_000, 2);
    expect(buyoutTerms(l, young)).toBeNull();
    expect(userBuyout(l, young.pid).ok).toBe(false);
    const camp = shape(l, standardRoster(l, U)[1], 70, 30, CAP_FOR(l).vetMin, 1);
    l.phase = 'preseason';
    expect(buyoutTerms(l, camp)).toBeNull();
  });

  it('AI rebuilders buy out veterans after the deadline but never go under 14 players', () => {
    const l = league();
    const before = new Map<number, number>();
    for (const t of l.teams) {
      if (t.tid === U) continue;
      t.strategy = 'rebuild';
      cutTo(l, t.tid, 13 + (t.tid % 3));
      const vet = standardRoster(l, t.tid)[0];
      shape(l, vet, 75, 32, 12_000, 1);
      expect(contractExp(vet.contract)).toBe(l.season);
      before.set(t.tid, standardRoster(l, t.tid).length);
    }
    let bought = 0;
    for (let d = 0; d < 6; d++) {
      l.day = l.tradeDeadlineDay + 1 + d;
      const fa = freeAgents(l).length;
      aiBuyouts(l);
      bought += freeAgents(l).length - fa;
      for (const [tid, n] of before) expect(standardRoster(l, tid).length).toBeGreaterThanOrEqual(Math.min(n, 14));
    }
    expect(bought).toBeGreaterThan(0);
    for (const [tid, n] of before) if (n < 15) expect(standardRoster(l, tid).length).toBe(n);
    expect(onWaivers(l)).toEqual([]);
  });
});
