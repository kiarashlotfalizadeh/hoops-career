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
  // playoff tickets cost more and fans will pay more for them, by the same multiple
  const ref = referencePrice(league, team) * (playoffs ? PLAYOFF_PRICE_MULT : 1);
  const price = team.budget.ticketPrice * (playoffs ? PLAYOFF_PRICE_MULT : 1);
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
    // (a 10-day contract is paid in full when it's signed: see tenDay.ts)
    const pay =
      teamPlayers(league, team.tid).reduce((a, p) => a + (p.contract.tenDay ? 0 : salaryFor(p, league.season)), 0) +
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

/** Share of the gap to the league's average local revenue that revenue sharing evens out. */
export const REVENUE_SHARING = 0.4;

/**
 * Revenue sharing, at the end of the regular season: each team pays REVENUE_SHARING of whatever its
 * local revenue (gate, merchandise and local TV) beat the league average by, and the teams below the
 * average get the same share of their gap. Without it the biggest markets out-earned the smallest by
 * about 80M a season on the same payroll, and over a long career small markets ran a billion into the red.
 * Returns what each team received (negative: paid).
 */
export function shareRevenue(league: League): Map<number, number> {
  const national = (NATIONAL_REVENUE * revenueScale(league)) / 82;
  const local = league.teams.map((t) => {
    const ts = curTeamSeason(league, t.tid);
    // (cash taken in trades is revenue, but not local revenue)
    return ts.revenue - national * (ts.won + ts.lost) - (ts.cashIn ?? 0);
  });
  const mean = local.reduce((a, v) => a + v, 0) / Math.max(1, local.length);
  const out = new Map<number, number>();
  for (const t of league.teams) {
    const ts = curTeamSeason(league, t.tid);
    const x = Math.round((mean - local[t.tid]) * REVENUE_SHARING);
    if (x >= 0) ts.revenue += x;
    else ts.expenses -= x;
    t.cash += x;
    out.set(t.tid, x);
  }
  return out;
}

/** Share of the luxury-tax pot paid out to teams under the tax line; the league keeps the rest. */
export const TAX_SHARE_TO_NON_TAXPAYERS = 0.5;

/**
 * The luxury tax on a payroll `over` the tax line ($K), by the NBA's brackets: each $5.0M of it
 * (in the league's first-season money, grown with the cap by `scale`, see revenueScale) is taxed at
 * a higher rate, 1.5, 1.75, 2.5 and 3.25 a dollar and then 0.5 more for each bracket after; a
 * repeater pays 2.5, 2.75, 3.5 and 4.25, then 0.5 more a bracket. Rounded to the $1K.
 */
export function taxFor(over: number, repeater: boolean, scale = 1): number {
  const bracket = CAP.taxBracket * scale;
  const rates = repeater ? CAP.repeaterRates : CAP.taxRates;
  let left = over;
  let tax = 0;
  for (let i = 0; left > 0; i++) {
    const rate = i < rates.length ? rates[i] : rates[rates.length - 1] + CAP.taxRateStep * (i - rates.length + 1);
    tax += Math.min(left, bracket) * rate;
    left -= bracket;
  }
  return Math.round(tax);
}

/** Seasons out of the four before it a team must have paid tax in to pay the repeater rates. */
export const REPEATER_SEASONS = 3;

/**
 * The seasons among the four before `season` in which team `tid` paid luxury tax: by the bill
 * assessLuxuryTax recorded, or for a season from before bills were recorded, by its payroll at the
 * end of that regular season against that season's tax line.
 */
export function taxSeasons(league: League, tid: number, season = league.season): number {
  let n = 0;
  for (const ts of league.teams[tid].seasons)
    if (ts.season < season && ts.season >= season - 4 && (ts.tax !== undefined ? ts.tax > 0 : ts.payroll > CAP_FOR(league, ts.season).luxuryTax)) n++;
  return n;
}

/** Does team `tid` pay the repeater rates this season: tax in at least 3 of the 4 seasons before it? */
export const taxRepeater = (league: League, tid: number, season = league.season) => taxSeasons(league, tid, season) >= REPEATER_SEASONS;

/** The luxury tax team `tid` pays on payroll `pay` in a season: its brackets over that season's tax line, at the repeater rates when it is one. */
export function luxuryTaxBill(league: League, tid: number, pay: number, season = league.season): number {
  return taxFor(pay - CAP_FOR(league, season).luxuryTax, taxRepeater(league, tid, season), revenueScale(league, season));
}

/**
 * End of regular season: teams under the salary floor pay the shortfall (to their players, as in
 * the NBA), teams over the tax line pay the luxury tax by its brackets (see luxuryTaxBill; recorded
 * on the season for the repeater rule), and half of the tax is shared among the teams that didn't
 * pay any.
 */
export function assessLuxuryTax(league: League): { tid: number; tax: number; shortfall: number }[] {
  const cap = CAP_FOR(league);
  const bills: { tid: number; tax: number; shortfall: number }[] = [];
  for (const t of league.teams) {
    // cap payroll: two-way pay doesn't count toward the tax or the floor
    const pay = payroll(league, t.tid);
    const ts = curTeamSeason(league, t.tid);
    ts.payroll = pay;
    const tax = luxuryTaxBill(league, t.tid, pay);
    ts.tax = tax;
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
