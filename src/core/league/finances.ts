import type { League, Team } from '../types';
import { clamp, mix32 } from '../random';
import { salaryFor } from '../playerGen';
import { REPEATER_EXTRA, TAX_BRACKET_PCT, TAX_RATES, TAX_RATE_STEP } from '../constants';
import { FRANCHISES } from '../teams';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, teamPlayers } from './helpers';

/** Seats for an arena the franchise table doesn't list (about the league's average). */
export const DEFAULT_CAPACITY = 18_100;

/** Seats for basketball in the team's arena (the franchise table's figure). */
export function arenaCapacity(team: Team): number {
  return FRANCHISES[team.tid]?.capacity ?? DEFAULT_CAPACITY;
}

// Money below is in first-season thousands of dollars; revenueScale grows it with the cap.

/** National media deals and the league's revenue sharing, paid to every team over the regular season. */
export const NATIONAL_REVENUE = 140_000;
/** Arena, travel, front office and other fixed operating costs per season. */
export const OPERATIONS_PER_SEASON = 62_000;
/** Merchandise and local TV per home game for an average market at average hype. */
export const MERCH_PER_GAME = 1_150;
export const LOCAL_TV_PER_GAME = 600;
/** Playoff tickets sell at this multiple of the regular-season price. */
export const PLAYOFF_PRICE_MULT = 1.6;

/** Cost of a staff or facilities budget at `level` (1-100) per season. */
export function budgetCostPerSeason(league: League, level: number) {
  return (5_000 + level * 200) * revenueScale(league);
}

/** Games of a .500 record a team's win% is weighed with for the fans (none played: .500; it counts more as the season goes on). */
const FAN_RECORD_PRIOR = 10;

/** The record as the fans weigh it: the win% so far, pulled toward .500 early in the season. */
function fansWinPct(league: League, team: Team) {
  const ts = curTeamSeason(league, team.tid);
  return (ts.won + FAN_RECORD_PRIOR / 2) / (ts.won + ts.lost + FAN_RECORD_PRIOR);
}

/** Ticket price fans consider fair: rises with hype, winning, market size and facilities. */
export function referencePrice(league: League, team: Team): number {
  const wp = fansWinPct(league, team);
  return (74 + 35 * team.hype + 20 * (wp - 0.5) + 22 * Math.min(team.pop / 10, 1.5) + (team.budget.facilities - 50) * 0.25) * revenueScale(league);
}

/**
 * Share of the arena's seats fans want at the fair price: an average team in an average market about
 * full, a hyped winner more than the building holds, a losing team with no buzz about five in six.
 */
export function fanInterest(league: League, team: Team): number {
  const wp = fansWinPct(league, team);
  return clamp(0.97 + 0.2 * (team.hype - 0.5) + 0.15 * (wp - 0.5) + 0.05 * (Math.min(team.pop / 10, 1.5) - 0.5), 0.5, 1.4);
}

/** How fast demand falls as the ticket climbs over the fair price (and rises below it). */
const PRICE_SENSITIVITY = 1;

/** Seats fans want for a home game at today's price (more than the arena holds, for a hot ticket). */
function seatsWanted(league: League, team: Team, playoffs: boolean): number {
  // playoff tickets cost more and fans will pay more for them, by the same multiple
  const ref = referencePrice(league, team) * (playoffs ? PLAYOFF_PRICE_MULT : 1);
  const price = team.budget.ticketPrice * (playoffs ? PLAYOFF_PRICE_MULT : 1);
  return arenaCapacity(team) * fanInterest(league, team) * Math.exp((-PRICE_SENSITIVITY * (price - ref)) / ref);
}

/** The crowd a home game draws on an average night at today's price: fan interest, less what the price above the fair one turns away. */
export function attendanceFor(league: League, team: Team, playoffs = false): number {
  return Math.round(clamp(seatsWanted(league, team, playoffs), 1_500, arenaCapacity(team)));
}

/**
 * What AI front offices charge each season (whole dollars, rounded down): where gate revenue peaks.
 * Fans who want more seats than the arena holds pay up to the price that just sells it out; a team
 * fans want less of can't fill it at any price worth charging, and prices for the crowd it draws.
 */
export function aiTicketPrice(league: League, team: Team): number {
  const ref = referencePrice(league, team);
  const sellout = ref * (1 + Math.log(fanInterest(league, team)) / PRICE_SENSITIVITY);
  return Math.floor(Math.max(sellout, ref / PRICE_SENSITIVITY));
}

/**
 * One game's crowd around the average: a hyped visitor draws more, and every night differs a little
 * (a few percent either way, fixed by the game).
 */
function nightFactor(league: League, opp: Team | undefined, gid: number | undefined) {
  const visitor = opp ? 0.08 * (opp.hype - 0.5) : 0;
  const night = gid === undefined ? 0 : (mix32(mix32(gid) ^ league.season) / 0xffffffff - 0.5) * 0.08;
  return 1 + visitor + night;
}

/**
 * Revenue & expenses for one game (applied to both teams; home gets gate, from the crowd `game`'s
 * visitor and night draw). `playoffs` covers the whole postseason, play-in included: gate only, no
 * salary or national-revenue share (those are spread over the 82 regular-season games).
 */
export function gameFinances(league: League, team: Team, home: boolean, playoffs: boolean, game?: { opp: Team; gid: number }) {
  const ts = curTeamSeason(league, team.tid);
  const scale = revenueScale(league);
  let revenue = 0;
  let att = 0;
  if (home) {
    att = Math.round(clamp(seatsWanted(league, team, playoffs) * nightFactor(league, game?.opp, game?.gid), 1_500, arenaCapacity(team)));
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
 * about $80M a season on the same payroll, and over a long career small markets ran a billion into the red.
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

/**
 * A repeat taxpayer: one that paid the tax in three of the four seasons before `season` (each
 * season's payroll on its books against that season's line).
 */
export function taxRepeater(league: League, tid: number, season = league.season): boolean {
  const t = league.teams[tid];
  let n = 0;
  for (let s = season - 4; s < season; s++) {
    const ts = t.seasons.find((x) => x.season === s);
    if (ts && ts.payroll > CAP_FOR(league, s).luxuryTax) n++;
  }
  return n >= 3;
}

/** The tax rate on bracket `i` over the line (0 the first): 1.5, 1.75, 2.5, 3.25, then 0.5 more each; a repeater pays 1 more on each. */
export function taxRateAt(i: number, repeater = false): number {
  const last = TAX_RATES.length - 1;
  return (i <= last ? TAX_RATES[i] : TAX_RATES[last] + TAX_RATE_STEP * (i - last)) + (repeater ? REPEATER_EXTRA : 0);
}

/**
 * The luxury tax on a payroll, as the NBA's progressive brackets have it: every TAX_BRACKET_PCT of
 * the cap over the line is taxed at the next rate (see taxRateAt), a repeater's at 1 more.
 */
export function luxuryTaxBill(league: League, pay: number, season = league.season, repeater = false): number {
  const cap = CAP_FOR(league, season);
  let over = pay - cap.luxuryTax;
  const step = cap.salaryCap * TAX_BRACKET_PCT;
  let tax = 0;
  for (let i = 0; over > 0; i++) {
    const part = Math.min(over, step);
    tax += part * taxRateAt(i, repeater);
    over -= part;
  }
  return Math.round(tax);
}

/** Team `tid`'s tax bill on a payroll in `season`, at the repeater rate if it is one. */
export const teamTaxBill = (league: League, tid: number, pay: number, season = league.season) => luxuryTaxBill(league, pay, season, taxRepeater(league, tid, season));

/** Share of the luxury-tax pot paid out to teams under the tax line; the league keeps the rest. */
export const TAX_SHARE_TO_NON_TAXPAYERS = 0.5;

/**
 * End of regular season: teams under the salary floor pay the shortfall (to their players, as in
 * the NBA), teams over the tax line pay its progressive brackets (see luxuryTaxBill; a repeater
 * more), and half of the tax is shared among the teams that didn't pay any.
 */
export function assessLuxuryTax(league: League): { tid: number; tax: number; shortfall: number }[] {
  const cap = CAP_FOR(league);
  const bills: { tid: number; tax: number; shortfall: number }[] = [];
  for (const t of league.teams) {
    // cap payroll: two-way pay doesn't count toward the tax or the floor
    const pay = payroll(league, t.tid);
    const ts = curTeamSeason(league, t.tid);
    ts.payroll = pay;
    const tax = teamTaxBill(league, t.tid, pay);
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

/** A tax bill's change from one payroll to another, and the highest line (the tax, the aprons) the new one crosses that the old one was under. */
export interface TaxChange {
  before: number;
  after: number;
  delta: number;
  crosses?: 'tax' | 'first' | 'second';
}

/** What moving team `tid`'s payroll in `season` from `before` to `after` does to its luxury tax (at its repeater rate, if it is one). */
export function taxChange(league: League, tid: number, before: number, after: number, season = league.season): TaxChange {
  const cap = CAP_FOR(league, season);
  const t0 = teamTaxBill(league, tid, before, season);
  const t1 = teamTaxBill(league, tid, after, season);
  const line = (x: number) => (x > cap.secondApron ? 3 : x > cap.firstApron ? 2 : x > cap.luxuryTax ? 1 : 0);
  const crosses = line(after) > line(before) ? (['tax', 'first', 'second'] as const)[line(after) - 1] : undefined;
  return { before: t0, after: t1, delta: t1 - t0, ...(crosses ? { crosses } : {}) };
}

/** Home games a team's gate so far is read from before the projection trusts it over the estimate. */
export const PROJECT_HOME_GAMES = 4;

/**
 * Where team `tid`'s cash should stand when the season's books close: the cash now, plus what the
 * regular-season games left should earn over what they cost (each home game left at the local
 * revenue a home game has brought so far, or before PROJECT_HOME_GAMES of them an estimate of it;
 * the national money, payroll, budgets and operations every game), plus revenue sharing, less the
 * luxury tax still to come at the end of the regular season or, under the line, plus a share of the
 * league's tax pot (every team's tax at today's payrolls): the regular season's close, what the
 * owner's review judges (see books.ts). Between seasons it projects next season's close in full;
 * during the postseason the books have closed, and it is the close itself (playoff gates come after
 * it). Reads the league only.
 */
export function seasonEndCash(league: League, tid: number): { end: number; tax: number; left: number } {
  const team = league.teams[tid];
  const inSeason = league.phase === 'preseason' || league.phase === 'regular';
  const between = ['draftLottery', 'draft', 'resign', 'freeAgency'].includes(league.phase);
  if (!inSeason && !between) {
    const ts = curTeamSeason(league, tid);
    return { end: ts.closeCash ?? team.cash, tax: ts.payroll ? teamTaxBill(league, tid, ts.payroll) : 0, left: 0 };
  }
  const s = between ? league.season + 1 : league.season;
  const scale = revenueScale(league, s);
  const national = (NATIONAL_REVENUE * scale) / 82;
  // local revenue (gate, merchandise, local TV) a home game: from the home games so far once there are enough, else an estimate
  const perHome = (t: Team) => {
    const ts = curTeamSeason(league, t.tid);
    const home = ts.homeWon + ts.homeLost;
    if (inSeason && home >= PROJECT_HOME_GAMES) return (ts.revenue - (ts.cashIn ?? 0) - national * (ts.won + ts.lost)) / home;
    const gate = (attendanceFor(league, t) * t.budget.ticketPrice) / 1000;
    return gate + MERCH_PER_GAME * scale * (0.5 + t.hype) * (0.7 + t.pop / 15) + LOCAL_TV_PER_GAME * scale * (0.6 + t.pop / 12);
  };
  // a team's season of local revenue, as revenue sharing reads it: so far, and its home games left
  const localSeason = (t: Team) => {
    const ts = curTeamSeason(league, t.tid);
    const home = ts.homeWon + ts.homeLost;
    const sofar = inSeason ? ts.revenue - (ts.cashIn ?? 0) - national * (ts.won + ts.lost) : 0;
    return sofar + perHome(t) * Math.max(0, 41 - (inSeason ? home : 0));
  };
  const ts = curTeamSeason(league, tid);
  const left = between ? 82 : Math.max(0, 82 - ts.won - ts.lost);
  const homeLeft = between ? 41 : Math.max(0, 41 - ts.homeWon - ts.homeLost);
  const pay = payroll(league, tid, s);
  const twoWay = teamPlayers(league, tid).reduce((a, p) => a + (p.contract.twoWay && !p.contract.tenDay ? salaryFor(p, s) : 0), 0);
  const budgets = (['coaching', 'health', 'facilities'] as const).reduce((a, k) => a + budgetCostPerSeason(league, team.budget[k]), 0) * (scale / revenueScale(league));
  const costPerGame = (pay + twoWay + budgets + OPERATIONS_PER_SEASON * scale) / 82;
  // revenue sharing on the season's local revenue: the league average's gap, REVENUE_SHARING of it either way
  const locals = league.teams.map(localSeason);
  const sharing = (locals.reduce((a, v) => a + v, 0) / locals.length - locals[tid]) * REVENUE_SHARING;
  // the tax, or under the line a share of the pot
  const bills = league.teams.map((t) => teamTaxBill(league, t.tid, payroll(league, t.tid, s), s));
  const tax = bills[tid];
  const payers = bills.filter((b) => b > 0).length;
  const pot = tax > 0 || payers === bills.length ? 0 : (bills.reduce((a, b) => a + b, 0) * TAX_SHARE_TO_NON_TAXPAYERS) / (bills.length - payers);
  return { end: Math.round(team.cash + homeLeft * perHome(team) + left * (national - costPerGame) + sharing - tax + pot), tax, left };
}

export function profit(league: League, tid: number, season = league.season) {
  const ts = league.teams[tid].seasons.find((s) => s.season === season);
  return ts ? ts.revenue - ts.expenses : 0;
}
