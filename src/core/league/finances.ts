import type { League, Team } from '../types';
import { clamp } from '../random';
import { salaryFor } from '../playerGen';
import { CAP_FOR, curTeamSeason, teamPlayers, winPct } from './helpers';

export const ARENA_CAPACITY = 18_800;
/** Arena, travel, front office and other fixed operating costs ($K per season). */
export const OPERATIONS_PER_SEASON = 55_000;

export function budgetCostPerSeason(level: number) {
  return 5_000 + level * 200; // $K
}

export function attendanceFor(league: League, team: Team, playoffs = false): number {
  const ts = curTeamSeason(league, team.tid);
  const wp = ts.won + ts.lost >= 5 ? winPct(ts) : 0.5;
  const priceEffect = (team.budget.ticketPrice - 95) / 260;
  const demand = 0.55 + 0.32 * team.hype + 0.1 * Math.min(team.pop / 10, 1) + (wp - 0.5) * 0.3 + (team.budget.facilities - 50) / 500 - priceEffect + (playoffs ? 0.25 : 0);
  return Math.round(clamp(ARENA_CAPACITY * demand, 7_000, ARENA_CAPACITY));
}

/** Revenue & expenses for one game (applied to both teams; home gets gate). */
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
  if (!playoffs) revenue += 150_000 / 82; // national media & league revenue share
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
  team.hype = clamp(team.hype + (won ? d : -d * 0.9), 0.05, 1);
}

/** End of regular season: luxury tax collected and shared among non-taxpayers. */
export function assessLuxuryTax(league: League): { tid: number; tax: number }[] {
  const cap = CAP_FOR(league);
  const bills: { tid: number; tax: number }[] = [];
  for (const t of league.teams) {
    const pay = teamPlayers(league, t.tid).reduce((a, p) => a + salaryFor(p, league.season), 0) + t.deadMoney.filter((d) => d.season === league.season).reduce((a, d) => a + d.amount, 0);
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
