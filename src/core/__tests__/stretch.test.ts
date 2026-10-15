// The stretch provision: a release's dead money spread evenly over twice the seasons left plus one
// (in season, this season's salary as usual and the later seasons stretched; in the summer, every
// season left), with buyouts (what's left after the giveback is stretched), waivers (a claim takes
// the contract and wipes the stretched money) and the transaction log.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, curTeamSeason, freeAgents, payroll, standardRoster } from '../league/helpers';
import { buyoutTerms, releasePlayer, releaseSchedule, resolveWaivers, signPlayer, stretchDeadMoney, stretchPhrase, userBuyout, userClaim } from '../league/contracts';
import { txnLine, txnText } from '../league/transactions';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(phase: League['phase'] = 'regular'): League {
  const l = createLeague({ name: 'stretch', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
  l.id = 'stretch_3';
  l.phase = phase;
  l.day = phase === 'regular' ? 30 : l.day;
  for (const t of l.teams) Object.assign(curTeamSeason(l, t.tid), { won: 10, lost: 10 });
  return l;
}

/** One of the user's players on `salary` a season from `start` for `years`. */
function signed(l: League, salary: number, years: number, start = l.season, age = 27): Player {
  const p = standardRoster(l, U)[0];
  p.ovr = p.pot = 70;
  p.bornYear = l.season - age;
  p.experience = 6;
  p.injury = null;
  p.mood.tradeRequest = false;
  p.mood.score = 0;
  p.contract = { start, salaries: Array.from({ length: years }, () => salary) };
  return p;
}

const sum = (xs: { amount: number }[]) => xs.reduce((a, d) => a + d.amount, 0);
const deadOf = (l: League, pid: number) => l.teams[U].deadMoney.filter((d) => d.pid === pid).sort((a, b) => a.season - b.season);

describe('the stretch provision', () => {
  it('in season: this season is paid as usual, the seasons after it spread over twice their number plus one', () => {
    const l = league();
    const p = signed(l, 12_000, 3);
    const sched = stretchDeadMoney(l, releaseSchedule(l, p))!;
    expect(sched[0]).toEqual({ season: l.season, amount: 12_000 });
    const rest = sched.slice(1);
    expect(rest.map((d) => d.season)).toEqual([1, 2, 3, 4, 5].map((i) => l.season + i));
    expect(rest.every((d) => d.stretched)).toBe(true);
    expect(sum(rest)).toBe(24_000);
    expect(rest.slice(0, -1).every((d) => d.amount === 4_800)).toBe(true);
    const before = payroll(l, U, l.season + 1);
    releasePlayer(l, p, { stretch: true });
    // waived in season with guaranteed money: the stretched schedule is what a claim would wipe
    expect(p.waivers?.dead).toEqual(sched);
    expect(deadOf(l, p.pid).map(({ season, amount }) => ({ season, amount }))).toEqual(sched.map(({ season, amount }) => ({ season, amount })));
    expect(payroll(l, U, l.season + 1) - before).toBe(4_800 - 12_000);
    expect(stretchPhrase(l, 5)).toBe("this season's as usual and the rest stretched over 5 seasons");
  });

  it('in the summer every season left is stretched, from next season; amounts in $10K steps, the total unchanged', () => {
    const l = league('freeAgency');
    const p = signed(l, 10_010, 2, l.season + 1);
    const sched = stretchDeadMoney(l, releaseSchedule(l, p))!;
    expect(sched.map((d) => d.season)).toEqual([1, 2, 3, 4, 5].map((i) => l.season + i));
    expect(sum(sched)).toBe(20_020);
    expect(sched.slice(0, -1).every((d) => d.amount % 10 === 0 && d.amount === 4_000)).toBe(true);
    expect(sched[4].amount).toBe(4_020);
    expect(stretchPhrase(l, 5)).toBe('stretched over 5 seasons');
    // one season left in the summer: over three
    const q = signed(l, 9_000, 1, l.season + 1);
    expect(stretchDeadMoney(l, releaseSchedule(l, q))!.map((d) => d.amount)).toEqual([3_000, 3_000, 3_000]);
  });

  it('nothing to stretch in season on a deal that ends this season, so the release is the usual one', () => {
    const l = league();
    const p = signed(l, 8_000, 1);
    expect(stretchDeadMoney(l, releaseSchedule(l, p))).toBeNull();
    expect(releaseSchedule(l, p, { stretch: true })).toEqual([{ season: l.season, amount: 8_000 }]);
  });

  it('a buyout stretches what is left after he gives some back, and the log says so', () => {
    const l = league();
    const p = signed(l, 10_000, 3, l.season, 33);
    const terms = buyoutTerms(l, p)!;
    expect(terms.giveback).toBeGreaterThan(0);
    const plain = releaseSchedule(l, p, { giveback: terms.giveback });
    const res = userBuyout(l, p.pid, true);
    expect(res.reason).toMatch(/this season's as usual and the rest stretched over 5 seasons/);
    const dead = deadOf(l, p.pid);
    expect(sum(dead)).toBe(sum(plain));
    expect(dead).toHaveLength(6);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toBeUndefined();
    const t = l.transactions!.at(-1)!;
    expect(t).toMatchObject({ kind: 'buyout', note: 'stretched', years: 5 });
    expect(txnText(l, txnLine(t, { tid: U }))).toMatch(/\(the rest stretched over 5 seasons\)$/);
  });

  it('a waiver claim takes over the contract and wipes the stretched dead money', () => {
    const l = league();
    const p = signed(l, 3_000, 3);
    p.ovr = p.pot = 78;
    // an AI team with room and a spot, first in the waiver order
    Object.assign(curTeamSeason(l, AI), { won: 2, lost: 18 });
    l.teams[AI].deadMoney = [];
    while (standardRoster(l, AI).length > 13) {
      const x = standardRoster(l, AI)[0];
      x.tid = FREE_AGENT;
    }
    for (const x of standardRoster(l, AI)) x.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    releasePlayer(l, p, { stretch: true });
    expect(deadOf(l, p.pid).length).toBe(6);
    const t = l.transactions!.at(-1)!;
    expect(t).toMatchObject({ kind: 'waive', note: 'stretched', years: 5, amount: 9_000 });
    expect(txnText(l, txnLine(t, { tid: U }))).toMatch(/\(\$9\.0M in dead money, stretched over 5 seasons\)$/);
    l.day += 2;
    resolveWaivers(l);
    expect(p.tid).toBe(AI);
    expect(deadOf(l, p.pid)).toEqual([]);
  });

  it("the user's own claim works the same way on another team's stretched release", () => {
    const l = league();
    const p = standardRoster(l, AI)[0];
    p.ovr = p.pot = 60;
    p.injury = null;
    p.experience = 6;
    p.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin * 2, CAP_FOR(l).vetMin * 2] };
    releasePlayer(l, p, { stretch: true });
    expect(l.teams[AI].deadMoney.filter((d) => d.pid === p.pid && d.stretched)).toHaveLength(3);
    while (standardRoster(l, U).length > 14) standardRoster(l, U)[0].tid = FREE_AGENT;
    l.teams[U].deadMoney = [];
    for (const x of standardRoster(l, U)) x.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    Object.assign(curTeamSeason(l, U), { won: 1, lost: 19 });
    expect(userClaim(l, p.pid).ok).toBe(true);
    l.day += 2;
    resolveWaivers(l);
    expect(p.tid).toBe(U);
    expect(l.teams[AI].deadMoney.filter((d) => d.pid === p.pid)).toEqual([]);
    // (a fresh signing for comparison: no stretch, nothing left behind)
    const fa = freeAgents(l)[0];
    signPlayer(l, fa, U, CAP_FOR(l).vetMin, 1, { news: false });
    expect(fa.contract.salaries).toEqual([CAP_FOR(l).vetMin]);
  });
});
