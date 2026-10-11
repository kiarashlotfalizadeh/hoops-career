// The finance model: money grows with the cap, the tax and the salary floor, AI ticket pricing,
// and the owner's grading.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { aiTicketPrice, assessLuxuryTax, attendanceFor, gameFinances, referencePrice, TAX_SHARE_TO_NON_TAXPAYERS } from '../league/finances';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, standardRoster } from '../league/helpers';
import { OWNER_PROFIT_RANGE, OWNER_PROFIT_TARGET, ownerMoneyScore } from '../league/owner';
import { newSeason, startRegularSeason } from '../league/season';
import { CAP } from '../constants';
import type { League } from '../types';

function league(): League {
  const l = createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  while (standardRoster(l, 0).length > CAP.rosterMax) standardRoster(l, 0)[0].tid = -1;
  return l;
}

/** One home and one away regular-season game: revenue, and expenses other than payroll. */
function gameMoney(l: League, tid: number) {
  const team = l.teams[tid];
  const ts = curTeamSeason(l, tid);
  const [rev, exp] = [ts.revenue, ts.expenses];
  gameFinances(l, team, true, false);
  gameFinances(l, team, false, false);
  return { revenue: ts.revenue - rev, other: ts.expenses - exp };
}

describe('finances (L1, L15)', () => {
  it('revenue, prices and costs grow with the cap', () => {
    const l = league();
    const team = l.teams[3];
    const first = gameMoney(l, 3);
    const pay = (2 * payroll(l, 3) + 2 * team.deadMoney.reduce((a, d) => a + (d.season === l.season ? d.amount : 0), 0)) / 82;
    const price = team.budget.ticketPrice;
    const ref = referencePrice(l, team);
    l.season += 10;
    const g = revenueScale(l);
    expect(g).toBeCloseTo(Math.pow(1 + CAP.growth, 10));
    expect(referencePrice(l, team) / ref).toBeCloseTo(g);
    team.budget.ticketPrice = price * g;
    const later = gameMoney(l, 3);
    expect(later.revenue / first.revenue).toBeCloseTo(g, 2);
    // payroll is out of contract ten years on; staff, facilities and the arena cost more
    expect(later.other / (first.other - pay)).toBeCloseTo(g, 2);
  });

  it('AI teams price tickets off fan demand each season; the user keeps pace with league revenue', () => {
    const l = league();
    expect(startRegularSeason(l)).toEqual([]);
    for (const t of l.teams.filter((x) => x.tid !== 0)) {
      expect(t.budget.ticketPrice).toBe(aiTicketPrice(l, t));
      // the price where the arena just sells out
      expect(attendanceFor(l, t)).toBe(18_800);
      expect(attendanceFor(l, { ...t, budget: { ...t.budget, ticketPrice: t.budget.ticketPrice + 5 } })).toBeLessThan(18_800);
    }
    const mine = l.teams[0].budget.ticketPrice;
    l.phase = 'freeAgency';
    l.faDay = 30;
    expect(newSeason(l)).toBe(true);
    expect(l.teams[0].budget.ticketPrice).toBe(Math.round(mine * (1 + CAP.growth)));
  });

  it('taxpayers pay CAP.taxRate, half the pot goes to the rest, and teams under the floor pay the shortfall', () => {
    const l = league();
    const cap = CAP_FOR(l);
    const pay = (tid: number) => payroll(l, tid);
    const setPayroll = (tid: number, target: number) => {
      const p = standardRoster(l, tid).sort((a, b) => b.contract.salaries[0] - a.contract.salaries[0])[0];
      p.contract.salaries[0] += target - pay(tid);
    };
    l.teams.forEach((t) => setPayroll(t.tid, (cap.minPayroll + cap.luxuryTax) / 2));
    setPayroll(1, cap.luxuryTax + 10_000);
    setPayroll(2, cap.minPayroll - 4_000);
    const cash = l.teams.map((t) => t.cash);
    const bills = assessLuxuryTax(l);
    expect(bills.find((b) => b.tid === 1)?.tax).toBe(Math.round(10_000 * CAP.taxRate));
    expect(bills.find((b) => b.tid === 2)?.shortfall).toBe(4_000);
    expect(l.teams[1].cash).toBeCloseTo(cash[1] - 10_000 * CAP.taxRate);
    // the floor team doesn't pay tax, so it gets a share too
    const share = (10_000 * CAP.taxRate * TAX_SHARE_TO_NON_TAXPAYERS) / 29;
    expect(l.teams[2].cash).toBeCloseTo(cash[2] - 4_000 + share);
    expect(l.teams[5].cash).toBeCloseTo(cash[5] + share);
  });

  it("the owner's profit target grows with league revenue", () => {
    const l = league();
    expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET)).toBeCloseTo(0);
    expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET + OWNER_PROFIT_RANGE)).toBe(1);
    l.season += 10;
    const g = revenueScale(l);
    expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET)).toBeLessThan(0);
    expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET * g)).toBeCloseTo(0);
    expect(ownerMoneyScore(l, (OWNER_PROFIT_TARGET + OWNER_PROFIT_RANGE / 2) * g)).toBeCloseTo(0.5);
  });
});
