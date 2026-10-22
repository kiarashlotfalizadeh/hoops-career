// The finance model: money grows with the cap, the tax and the salary floor, revenue sharing, AI
// ticket pricing, the owner's grading, and each arena's crowds.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import {
  aiTicketPrice,
  arenaCapacity,
  assessLuxuryTax,
  attendanceFor,
  gameFinances,
  luxuryTaxBill,
  NATIONAL_REVENUE,
  referencePrice,
  REVENUE_SHARING,
  shareRevenue,
  TAX_SHARE_TO_NON_TAXPAYERS,
  taxRateAt,
  taxRepeater,
} from '../league/finances';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, standardRoster, teamPlayers } from '../league/helpers';
import { salaryFor } from '../playerGen';
import { OWNER_PROFIT_RANGE, OWNER_PROFIT_TARGET, ownerMoneyScore } from '../league/owner';
import { newSeason, simDay, startRegularSeason } from '../league/season';
import { CAP, TAX_BRACKET_PCT } from '../constants';
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
  it("revenue and costs with the cap, ticket prices, the luxury tax and the floor, revenue sharing, the owner's target, and attendance", () => {
    // revenue, prices and costs grow with the cap
    {
      const l = league();
      const team = l.teams[3];
      const first = gameMoney(l, 3);
      // every salary is paid, two-way deals included (they only stay off the cap)
      const salaries = teamPlayers(l, 3).reduce((a, p) => a + salaryFor(p, l.season), 0);
      const pay = (2 * salaries + 2 * team.deadMoney.reduce((a, d) => a + (d.season === l.season ? d.amount : 0), 0)) / 82;
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
    }

    // AI teams price tickets off fan demand each season; the user keeps pace with league revenue
    {
      const l = league();
      expect(startRegularSeason(l)).toEqual([]);
      for (const t of l.teams.filter((x) => x.tid !== 0)) {
        expect(t.budget.ticketPrice).toBe(aiTicketPrice(l, t));
        // the price where the gate peaks: the sellout price when fans want more seats than there are, else the fair one
        // (rounded down to the dollar, which gives up a dollar a seat at most)
        const gate = (price: number) => attendanceFor(l, { ...t, budget: { ...t.budget, ticketPrice: price } }) * price;
        expect(gate(t.budget.ticketPrice) + arenaCapacity(t)).toBeGreaterThanOrEqual(gate(t.budget.ticketPrice + 5));
        expect(gate(t.budget.ticketPrice)).toBeGreaterThanOrEqual(gate(t.budget.ticketPrice - 5));
        expect(attendanceFor(l, t)).toBeLessThanOrEqual(arenaCapacity(t));
      }
      // playoff tickets cost 1.6x and fans pay 1.6x for them: a team that priced fans out still does
      const t = l.teams[1];
      const steep = { ...t, budget: { ...t.budget, ticketPrice: t.budget.ticketPrice * 1.5 } };
      expect(attendanceFor(l, steep, true)).toBe(attendanceFor(l, steep));
      expect(attendanceFor(l, steep, true)).toBeLessThan(12_000);
      const mine = l.teams[0].budget.ticketPrice;
      l.phase = 'freeAgency';
      l.faDay = 30;
      expect(newSeason(l)).toBe(true);
      expect(l.teams[0].budget.ticketPrice).toBe(Math.round(mine * (1 + CAP.growth)));
    }

    // the tax climbs by brackets of 3.24% of the cap over the line: 1.5, 1.75, 2.5, 3.25, then 0.5 more each, a repeater 1 more on every one
    {
      const l = league();
      const cap = CAP_FOR(l);
      const step = cap.salaryCap * TAX_BRACKET_PCT;
      expect([0, 1, 2, 3, 4, 5].map((i) => taxRateAt(i))).toEqual([1.5, 1.75, 2.5, 3.25, 3.75, 4.25]);
      expect(taxRateAt(0, true)).toBe(2.5);
      expect(luxuryTaxBill(l, cap.luxuryTax)).toBe(0);
      expect(luxuryTaxBill(l, cap.luxuryTax + 1_000)).toBe(1_500);
      expect(luxuryTaxBill(l, cap.luxuryTax + step * 2)).toBe(Math.round(step * 1.5 + step * 1.75));
      expect(luxuryTaxBill(l, cap.luxuryTax + step * 5)).toBe(Math.round(step * (1.5 + 1.75 + 2.5 + 3.25 + 3.75)));
      expect(luxuryTaxBill(l, cap.luxuryTax + 1_000, l.season, true)).toBe(2_500);
      // a repeater: a taxpayer in three of the four seasons before
      const t = l.teams[3];
      expect(taxRepeater(l, 3)).toBe(false);
      for (const s of [l.season - 3, l.season - 2, l.season - 1]) {
        const ts = t.seasons.find((x) => x.season === s) ?? { ...t.seasons[0], season: s };
        ts.payroll = CAP_FOR(l, s).luxuryTax + 1;
        if (!t.seasons.includes(ts)) t.seasons.push(ts);
      }
      expect(taxRepeater(l, 3)).toBe(true);
    }

    // taxpayers pay by the brackets, half the pot goes to the rest, and teams under the floor pay the shortfall
    {
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
      const tax = luxuryTaxBill(l, cap.luxuryTax + 10_000);
      expect(tax).toBeGreaterThan(10_000 * CAP.taxRate);
      expect(bills.find((b) => b.tid === 1)?.tax).toBe(tax);
      expect(bills.find((b) => b.tid === 2)?.shortfall).toBe(4_000);
      expect(l.teams[1].cash).toBeCloseTo(cash[1] - tax);
      // the floor team doesn't pay tax, so it gets a share too
      const share = (tax * TAX_SHARE_TO_NON_TAXPAYERS) / 29;
      expect(l.teams[2].cash).toBeCloseTo(cash[2] - 4_000 + share);
      expect(l.teams[5].cash).toBeCloseTo(cash[5] + share);
    }

    // revenue sharing moves part of each local-revenue gap to the league average and nets to zero
    {
      const l = league();
      for (const t of l.teams) {
        for (let i = 0; i < 41; i++) {
          gameFinances(l, t, true, false);
          gameFinances(l, t, false, false);
        }
        Object.assign(curTeamSeason(l, t.tid), { won: 41, lost: 41 });
      }
      const national = NATIONAL_REVENUE * revenueScale(l);
      const local = l.teams.map((t) => curTeamSeason(l, t.tid).revenue - national);
      const mean = local.reduce((a, v) => a + v, 0) / local.length;
      const cash = l.teams.map((t) => t.cash);
      const got = shareRevenue(l);
      expect(Math.abs([...got.values()].reduce((a, v) => a + v, 0))).toBeLessThanOrEqual(l.teams.length);
      const byPop = [...l.teams].sort((a, b) => a.pop - b.pop);
      const [small, big] = [byPop[0].tid, byPop[byPop.length - 1].tid];
      expect(got.get(small)!).toBeGreaterThan(0);
      expect(got.get(big)!).toBeLessThan(0);
      for (const tid of [small, big]) {
        expect(got.get(tid)).toBe(Math.round((mean - local[tid]) * REVENUE_SHARING));
        expect(l.teams[tid].cash).toBeCloseTo(cash[tid] + got.get(tid)!);
      }
      // the payer books it as an expense, the receiver as revenue
      expect(curTeamSeason(l, big).revenue - national).toBeCloseTo(local[big]);
    }

    // the owner's profit target grows with league revenue
    {
      const l = league();
      expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET)).toBeCloseTo(0);
      expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET + OWNER_PROFIT_RANGE)).toBe(1);
      l.season += 10;
      const g = revenueScale(l);
      expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET)).toBeLessThan(0);
      expect(ownerMoneyScore(l, OWNER_PROFIT_TARGET * g)).toBeCloseTo(0);
      expect(ownerMoneyScore(l, (OWNER_PROFIT_TARGET + OWNER_PROFIT_RANGE / 2) * g)).toBeCloseTo(0.5);
    }

    // each arena holds its own crowd: a hyped winner sells out, a losing team with no buzz does not
    {
      const l = league();
      const seats = l.teams.map((t) => arenaCapacity(t));
      expect(Math.min(...seats)).toBeGreaterThan(16_500);
      expect(Math.max(...seats)).toBeLessThan(21_500);
      expect(new Set(seats).size).toBeGreaterThan(20);
      const at = (hype: number, won: number, lost: number) => {
        const t = { ...l.teams[5], hype };
        Object.assign(curTeamSeason(l, 5), { won, lost });
        t.budget = { ...t.budget, ticketPrice: aiTicketPrice(l, t) };
        return attendanceFor(l, t);
      };
      expect(at(0.95, 30, 10)).toBe(arenaCapacity(l.teams[5]));
      const weak = at(0.1, 10, 30);
      expect(weak).toBeGreaterThan(13_500);
      expect(weak).toBeLessThan(17_000);
    }

    // crowds vary from night to night and never pass the arena
    {
      const l = league();
      expect(startRegularSeason(l)).toEqual([]);
      while (l.day < 20) simDay(l);
      const crowds = l.games.filter((g) => g.type === 'regular').map((g) => ({ att: g.att!, seats: arenaCapacity(l.teams[g.home.tid]) }));
      expect(crowds.length).toBeGreaterThan(100);
      for (const c of crowds) expect(c.att).toBeLessThanOrEqual(c.seats);
      expect(new Set(crowds.map((c) => c.att)).size).toBeGreaterThan(crowds.length / 3);
    }
  }, 180_000);
});
