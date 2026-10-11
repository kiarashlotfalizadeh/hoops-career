import type { League, Team } from '../types';
import { clamp } from '../random';
import { salaryFor } from '../playerGen';
import { CAP } from '../constants';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, teamPlayers, winPct } from './helpers';

export const ARENA_CAPACITY = 18_800;

// Money below is in first-season thousands of dollars; revenueScale grows it with the cap.

/** National media deals and the league's revenue sharing, paid to every team over the regular season. */
export const NATIONAL_REVENUE = 140_000;
/** Arena, travel, front office and other fixed operating costs per season. */
export const OPERATIONS_PER_SEASON = 62_000;
/** Merchandise and local TV per home game for an average market at average hype. */
const MERCH_PER_GAME = 1_150;
const LOCAL_TV_PER_GAME = 600;
/** Playoff tickets sell at this multiple of the regular-season price. */
export const PLAYOFF_PRICE_MULT = 1.6;

/** Cost of a staff or facilities budget at `level` (1-100) per season. */
export function budgetCostPerSeason(league: League, level: number) {
  return (5_000 + level * 200) * revenueScale(league);
}

/** Ticket price fans consider fair: rises with hype, winning, market size and facilities. */
export function referencePrice(league: League, team: Team): number {
  const ts = curTeamSeason(league, team.tid);
  const wp = ts.won + ts.lost >= 5 ? winPct(ts) : 0.5;
  return (62 + 55 * team.hype + 70 * (wp - 0.5) + 22 * Math.min(team.pop / 10, 1.5) + (team.budget.facilities - 50) * 0.25) * revenueScale(league);
}

export function attendanceFor(league: League, team: Team, playoffs = false): number {
  const ref = referencePrice(league, team) * (playoffs ? PLAYOFF_PRICE_MULT : 1);
  const price = team.budget.ticketPrice;
  const demand = 1.05 * Math.exp((-1.1 * (price - ref)) / ref);
  return Math.round(clamp(ARENA_CAPACITY * demand, 1_500, ARENA_CAPACITY));
}

/**
 * What AI front offices charge each season: the fair price plus the little fans will still pay
 * before seats go empty (whole dollars, rounded down), which is where gate revenue peaks.
 */
export function aiTicketPrice(league: League, team: Team): number {
  return Math.floor(referencePrice(league, team) * (1 + Math.log(1.05) / 1.1));
}

/**
 * Revenue & expenses for one game (applied to both teams; home gets gate). `playoffs` covers the
 * whole postseason, play-in included: gate only, no salary or national-revenue share (those are
 * spread over the 82 regular-season games).
 */
export function gameFinances(league: League, team: Team, home: boolean, playoffs: boolean) {
  const ts = curTeamSeason(league, team.tid);
  const scale = revenueScale(league);
  let revenue = 0;
  let att = 0;
  if (home) {
    att = attendanceFor(league, team, playoffs);
    const gate = (att * team.budget.ticketPrice * (playoffs ? PLAYOFF_PRICE_MULT : 1)) / 1000;
    const merch = MERCH_PER_GAME * scale * (0.5 + team.hype) * (0.7 + team.pop / 15);
    const localTv = LOCAL_TV_PER_GAME * scale * (0.6 + team.pop / 12);
    revenue += gate + merch + localTv;
    // attendance is a regular-season figure (per home game on the Finances screen)
    if (!playoffs) ts.attendance += att;
  }
  if (!playoffs) revenue += (NATIONAL_REVENUE * scale) / 82;
  let expenses = 0;
  if (!playoffs) {
    const pay =
      teamPlayers(league, team.tid).reduce((a, p) => a + salaryFor(p, league.season), 0) +
      team.deadMoney.filter((d) => d.season === league.season).reduce((a, d) => a + d.amount, 0);
    expenses += pay / 82;
    expenses += (budgetCostPerSeason(league, team.budget.coaching) + budgetCostPerSeason(league, team.budget.health) + budgetCostPerSeason(league, team.budget.facilities)) / 82;
    expenses += (OPERATIONS_PER_SEASON * scale) / 82;
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

/** Share of the luxury-tax pot paid out to teams under the tax line; the league keeps the rest. */
export const TAX_SHARE_TO_NON_TAXPAYERS = 0.5;

/**
 * End of regular season: teams under the salary floor pay the shortfall (to their players, as in
 * the NBA), teams over the tax line pay CAP.taxRate on every dollar above it, and half of the tax
 * is shared among the teams that didn't pay any.
 */
export function assessLuxuryTax(league: League): { tid: number; tax: number; shortfall: number }[] {
  const cap = CAP_FOR(league);
  const bills: { tid: number; tax: number; shortfall: number }[] = [];
  for (const t of league.teams) {
    // cap payroll: two-way pay doesn't count toward the tax or the floor
    const pay = payroll(league, t.tid);
    const ts = curTeamSeason(league, t.tid);
    ts.payroll = pay;
    const tax = pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
    const shortfall = Math.max(0, cap.minPayroll - pay);
    if (!tax && !shortfall) continue;
    bills.push({ tid: t.tid, tax, shortfall });
    t.cash -= tax + shortfall;
    ts.expenses += tax + shortfall;
  }
  const pot = bills.reduce((a, b) => a + b.tax, 0) * TAX_SHARE_TO_NON_TAXPAYERS;
  const receivers = league.teams.filter((t) => !bills.some((b) => b.tid === t.tid && b.tax > 0));
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
