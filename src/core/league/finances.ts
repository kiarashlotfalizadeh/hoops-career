import type { League, Team } from '../types';
import { clamp } from '../random';
import { salaryFor } from '../playerGen';
import { CAP_FOR, curTeamSeason, payroll, teamPlayers, winPct } from './helpers';

export const ARENA_CAPACITY = 18_800;
/** Arena, travel, front office and other fixed operating costs ($K per season). */
export const OPERATIONS_PER_SEASON = 62_000;

export function budgetCostPerSeason(level: number) {
  return 5_000 + level * 200; // $K
}

/** Ticket price fans consider fair: rises with hype, winning, market size and facilities. */
export function referencePrice(league: League, team: Team): number {
  const ts = curTeamSeason(league, team.tid);
  const wp = ts.won + ts.lost >= 5 ? winPct(ts) : 0.5;
  return 62 + 55 * team.hype + 70 * (wp - 0.5) + 22 * Math.min(team.pop / 10, 1.5) + (team.budget.facilities - 50) * 0.25;
}

export function attendanceFor(league: League, team: Team, playoffs = false): number {
  const ref = referencePrice(league, team) * (playoffs ? 1.6 : 1);
  const price = team.budget.ticketPrice;
  const demand = 1.05 * Math.exp((-1.1 * (price - ref)) / ref);
  return Math.round(clamp(ARENA_CAPACITY * demand, 1_500, ARENA_CAPACITY));
}

/**
 * Revenue & expenses for one game (applied to both teams; home gets gate). `playoffs` covers the
 * whole postseason, play-in included: gate only, no salary or national-revenue share (those are
 * spread over the 82 regular-season games).
 */
export function gameFinances(league: League, team: Team, home: boolean, playoffs: boolean) {
  const ts = curTeamSeason(league, team.tid);
  let revenue = 0;
  let att = 0;
  if (home) {
    att = attendanceFor(league, team, playoffs);
    const gate = (att * team.budget.ticketPrice * (playoffs ? 1.6 : 1)) / 1000;
    const merch = 1_150 * (0.5 + team.hype) * (0.7 + team.pop / 15);
    const localTv = 600 * (0.6 + team.pop / 12);
    revenue += gate + merch + localTv;
    ts.attendance += att;
  }
  if (!playoffs) revenue += 130_000 / 82; // national media & league revenue share
  let expenses = 0;
  if (!playoffs) {
    const pay = teamPlayers(league, team.tid).reduce((a, p) => a + salaryFor(p, league.season), 0) + team.deadMoney.filter((d) => d.season === league.season).reduce((a, d) => a + d.amount, 0);
    expenses += pay / 82;
    expenses += (budgetCostPerSeason(team.budget.coaching) + budgetCostPerSeason(team.budget.health) + budgetCostPerSeason(team.budget.facilities)) / 82;
    expenses += OPERATIONS_PER_SEASON / 82;
  }
  ts.revenue += revenue;
  ts.expenses += expenses;
  team.cash += revenue - expenses;
  return att;
}

export function updateHype(team: Team, won: boolean, playoffs: boolean) {
  const d = playoffs ? 0.012 : 0.006;
  // facilities slowly build (or erode) fan enthusiasm
  const fac = ((team.budget.facilities - 50) / 50) * 0.0006;
  team.hype = clamp(team.hype + (won ? d : -d * 0.9) + fac, 0.05, 1);
}

/** End of regular season: luxury tax collected and shared among non-taxpayers. */
export function assessLuxuryTax(league: League): { tid: number; tax: number }[] {
  const cap = CAP_FOR(league);
  const bills: { tid: number; tax: number }[] = [];
  for (const t of league.teams) {
    // cap payroll: two-way pay doesn't count toward the tax
    const pay = payroll(league, t.tid);
    const ts = curTeamSeason(league, t.tid);
    ts.payroll = pay;
    if (pay > cap.luxuryTax) {
      const tax = Math.round((pay - cap.luxuryTax) * 1.5);
      bills.push({ tid: t.tid, tax });
      t.cash -= tax;
      ts.expenses += tax;
    }
  }
  const pot = bills.reduce((a, b) => a + b.tax, 0);
  const receivers = league.teams.filter((t) => !bills.some((b) => b.tid === t.tid));
  if (pot > 0 && receivers.length) {
    const share = pot / receivers.length;
    for (const t of receivers) {
      t.cash += share;
      curTeamSeason(league, t.tid).revenue += share;
    }
  }
  return bills;
}

export function profit(league: League, tid: number, season = league.season) {
  const ts = league.teams[tid].seasons.find((s) => s.season === season);
  return ts ? ts.revenue - ts.expenses : 0;
}
