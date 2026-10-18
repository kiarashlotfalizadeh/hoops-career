// The owner's goals for the user's season. On opening night the owner looks at the roster he has and
// sets three or four goals for it, frozen for the season: a win total (what the roster should win,
// from its minutes-weighted OVR against the league's, see expectedWinPct), a postseason goal from
// where that projects the team in its conference and its front office's strategy (or a development
// goal for a rebuilder or a team projected out of the play-in: minutes for players 23 or under), and
// a money goal (a profit from the season's budget, or staying under the luxury tax for a team near
// the line). Each franchise's owner has a personality of his own (a builder, win-now or frugal), the
// same every season of a league, which moves the targets and weights a little. In season the goals
// report their progress (ownerProgress) and the owner checks in at the All-Star break and when the
// team falls clearly off pace; after the playoffs each goal is graded −1..1 by how far the result beat
// or missed its target, and the weights make the season's grade (see owner.ts for the running
// standing and firing). A team that takes over mid-season gets goals from that day, prorated.
// Nothing here draws from the league's random stream.

import type { League, Player, Team, TeamSeason } from '../types';
import { maybeUltimatum } from './jobSecurity';
import { clamp, hashString } from '../random';
import { autoRotation } from '../ai/coachAI';
import { playerAge, salaryFor } from '../playerGen';
import { MARGIN_SD, TALENT_NET, phi } from '../analysis/projection';
import { leagueForecast, type Forecast } from '../analysis/odds';
import { CAP_FOR, addInbox, payroll, revenueScale, standardRoster } from './helpers';
import { LOCAL_TV_PER_GAME, MERCH_PER_GAME, NATIONAL_REVENUE, OPERATIONS_PER_SEASON, REVENUE_SHARING, attendanceFor, budgetCostPerSeason, profit } from './finances';
import { confStandings } from './standings';
import { money } from '../format';

export type OwnerPersonality = 'builder' | 'win-now' | 'frugal';
export type OwnerGoalKind = 'wins' | 'postseason' | 'profit' | 'payroll' | 'youth';

/** One of the owner's goals for a season (OwnerGoals.goals). */
export interface OwnerGoal {
  kind: OwnerGoalKind;
  /** The goal in plain words: "Win 48 games", "Win a playoff round", "Stay under the luxury tax". */
  title: string;
  /**
   * What meets it: wins; the postseason level (see POSTSEASON: 1 the play-in .. 6 the title);
   * profit in $K; the most payroll in $K (the tax line for "stay under"); minutes for players 23 or under.
   */
  target: number;
  /** Its share of the season's grade (the goals' weights add up to 1). */
  weight: number;
  /**
   * The plan per regular-season game the in-season projection blends the results so far with: the
   * roster's expected win% (wins), the budget's operating profit (profit), the young players' minutes (youth).
   */
  perGame?: number;
  /** Profit: money the budget expects at the season's end (revenue sharing, playoff gates, the league's tax payouts). */
  end?: number;
  /** Postseason: the conference rank the roster projected to when the goal was set. */
  rank?: number;
}

/** The owner's goals for the user's season (League.ownerGoals), set on opening night or when he took over mid-season. */
export interface OwnerGoals {
  season: number;
  tid: number;
  /** Regular-season games the goals cover: all of them on opening night, the games left after a mid-season start. */
  games: number;
  /** Set mid-season (a takeover, or a save from before goals): the day and the record, profit and young players' minutes then. Only what came after counts. */
  from?: { day: number; won: number; lost: number; profit: number; youth: number };
  goals: OwnerGoal[];
  /** The owner's check-ins sent this season (at the All-Star break, and when the team fell off pace): once each. */
  sent?: ('allStar' | 'pace')[];
  /** His ultimatum at the All-Star break to a coach on the hot seat (see jobSecurity.ts): miss it and he's fired. */
  ultimatum?: Ultimatum;
}

/** "Make the playoffs or you're done": a wins total or a postseason level, graded at the season's review. */
export interface Ultimatum {
  kind: 'wins' | 'postseason';
  /** Wins (since the goals were set), or a postseason level (see POSTSEASON). */
  target: number;
  /** "Win 40 games", "Make the playoffs". */
  text: string;
}

/** A season's review by the owner (League.ownerReviews): each goal with its result and grade, the season's grade and the standing after it. */
export interface OwnerReview {
  season: number;
  tid: number;
  /** The goals graded (empty for a season without goals, reviewed on the old absolute scale). */
  goals: (Omit<OwnerGoal, 'perGame' | 'end'> & { result: number; grade: number })[];
  /** The season's grade (−1..1): the goals' grades by weight. */
  grade: number;
  /** The overall standing after the review (League.ownerMood.total). */
  total: number;
  fired?: true;
}

/** Seasons of reviews the history keeps. */
export const REVIEWS_KEPT = 10;
/** Regular-season games a team plays. */
export const SEASON_GAMES = 82;
/** Wins above or below the target that max out the wins grade (a full season; a shorter stretch scales it down to half). */
export const WIN_SCALE = 20;
/** Profit above or below the target that maxes out the profit grade, in first-season dollars ($K). */
export const PROFIT_SCALE = 40_000;
/** Each win the roster should win above .500 brings about this much more profit (gate, merchandise, hype, playoff gates), first-season $K. */
export const PROFIT_PER_WIN = 2_000;
/**
 * The playoff gates and the league's luxury-tax payouts a typical season brings beyond the budget, first-season $K:
 * fitted so that over sixteen simulated league-seasons the profit goals' results center on their targets (they had
 * come in $4.0M over at 8,000).
 */
export const PROFIT_EXTRA = 12_000;
/** Payroll over or under its line, as a share of the tax line, that maxes out a payroll goal's grade. */
export const PAYROLL_SCALE = 0.05;
/** Games of the record so far that weigh as much as the roster's expectation in a projection. */
export const PACE_PRIOR = 40;
/** Age (as of February 1 of the season) a development goal's players are at most. */
export const YOUNG_AGE = 23;

/** The postseason levels a goal or a result names (index = level). */
export const POSTSEASON: { goal: string; result: string }[] = [
  { goal: 'Reach the postseason', result: 'missed the play-in' },
  { goal: 'Reach the play-in', result: 'lost in the play-in' },
  { goal: 'Make the playoffs', result: 'lost in the first round' },
  { goal: 'Win a playoff round', result: 'lost in the second round' },
  { goal: 'Reach the conference finals', result: 'lost in the conference finals' },
  { goal: 'Reach the Finals', result: 'lost in the Finals' },
  { goal: 'Win the title', result: 'won the title' },
];

/** Each personality as the Owner tab names it ("Builder · plays the long game"). */
export const PERSONALITY: Record<OwnerPersonality, { label: string; blurb: string }> = {
  builder: { label: 'Builder', blurb: 'plays the long game' },
  'win-now': { label: 'Win-now', blurb: 'wants results this season' },
  frugal: { label: 'Frugal', blurb: 'watches the bottom line' },
};

/** A franchise's owner's personality: the same every season of a league (a hash of the league and the team, never its random stream). */
export function ownerPersonality(league: League, tid: number): OwnerPersonality {
  return (['builder', 'win-now', 'frugal'] as const)[hashString(`${league.id}:${tid}:owner`) % 3];
}

const thisSeason = (league: League, tid: number): TeamSeason | undefined => league.teams[tid]?.seasons.find((s) => s.season === league.season);
const age = (league: League, p: Player) => playerAge(p, league.season);

// ---------------------------------------------------------------- expectations

/**
 * A team's minutes-weighted OVR over the regular-season games ahead, as an assistant would play its
 * standard roster (autoRotation): each injured player joins the rotation when he's back, the stretch
 * split at each return. The user's own rotation doesn't come into it, so it can't move the bar.
 */
export function rosterTalent(league: League, tid: number, games = SEASON_GAMES): number {
  const roster = standardRoster(league, tid);
  if (!roster.length || games <= 0) return 0;
  const back = roster.map((p) => p.injury?.gamesRemaining ?? 0).filter((g) => g > 0 && g < games);
  const cuts = [...new Set([0, ...back, games])].sort((a, b) => a - b);
  let acc = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const at = cuts[i];
    const healthy = roster.filter((p) => !(p.injury && p.injury.gamesRemaining > at)).map((p) => ({ ...p, injury: null }));
    if (!healthy.length) continue;
    const rot = autoRotation(healthy);
    let sum = 0;
    let min = 0;
    for (const p of healthy) {
      const m = rot.minutes[p.pid] ?? 0;
      sum += p.ovr * m;
      min += m;
    }
    if (min) acc += (sum / min) * (cuts[i + 1] - at);
  }
  return acc / games;
}

/**
 * Each team's regular-season games still to play, and its home games among them: every team plays 82
 * (41 at home), though only 80 are on the schedule on opening night while the NBA Cup's knockout
 * window is kept clear (see cup.ts).
 */
function gamesLeft(league: League): { left: number[]; home: number[] } {
  const rows = league.teams.map((t) => thisSeason(league, t.tid));
  return {
    left: rows.map((ts) => Math.max(0, SEASON_GAMES - (ts ? ts.won + ts.lost : 0))),
    home: rows.map((ts) => Math.max(0, SEASON_GAMES / 2 - (ts ? ts.homeWon + ts.homeLost : 0))),
  };
}

/** What each team should do over the rest of its regular season (League.teams order). */
export interface TeamOutlook {
  tid: number;
  won: number;
  lost: number;
  left: number;
  talent: number;
  /** Expected win% in the games left: the talent against the league's, through the projection's net-rating line (see expectedWinPct). */
  pct: number;
  /** Projected final win%: the record so far and the expectation for the games left. */
  final: number;
}

/**
 * The win% a roster should have against an average opponent: TALENT_NET points of net rating per
 * point of OVR above the league's average roster, a margin per game at a pace of 100, and the
 * chance of winning a game at that margin (phi(margin / MARGIN_SD)). Over sixteen simulated
 * league-seasons (two real and two fictional leagues, four seasons each: 480 team-seasons) the opening-night
 * expectation is unbiased: actual wins are 0.95 × expected + 2.0 (r 0.72, the misses' SD 7.0 wins),
 * within 1.7 wins on average in every band from under 28 to over 54, and no team's strategy that
 * night leans it (contenders +0.3, rebuilders +0.7). The season forecast's preseason projection
 * (odds.ts) is a little tighter (r 0.73) but under-spread (actual = 1.07 × its wins − 3.0); the two
 * differ by 1.6 wins (SD), which is why the screens show the forecast's projection once games are
 * played (see ownerProgress) and the owner's own read before.
 */
export const expectedWinPct = (talent: number, leagueTalent: number) => phi((TALENT_NET * (talent - leagueTalent)) / MARGIN_SD);

/** Every team's outlook from today (opening night: the whole season). Reads the league only. */
export function leagueOutlook(league: League): TeamOutlook[] {
  const { left } = gamesLeft(league);
  const regular = league.phase === 'preseason' || league.phase === 'regular';
  const rows = league.teams.map((t) => {
    const ts = thisSeason(league, t.tid);
    const games = regular ? left[t.tid] : 0;
    return { tid: t.tid, won: ts?.won ?? 0, lost: ts?.lost ?? 0, left: games, talent: rosterTalent(league, t.tid, games || SEASON_GAMES) };
  });
  const avg = rows.reduce((a, r) => a + r.talent, 0) / Math.max(1, rows.length);
  return rows.map((r) => {
    const pct = expectedWinPct(r.talent, avg);
    const g = r.won + r.lost + r.left;
    return { ...r, pct, final: g ? (r.won + pct * r.left) / g : pct };
  });
}

/** Projected conference rank (1 = best) by projected final win%, the talent breaking ties. */
function projectedRank(league: League, outlook: TeamOutlook[], tid: number): number {
  const conf = league.teams[tid].conf;
  const mine = outlook[tid];
  return 1 + outlook.filter((o) => o.tid !== tid && league.teams[o.tid].conf === conf && (o.final > mine.final || (o.final === mine.final && o.talent > mine.talent))).length;
}

// ---------------------------------------------------------------- the budget

/** Gate, merchandise and local TV a home game brings at today's ticket price, hype and market (as gameFinances books them). */
function localPerHomeGame(league: League, t: Team) {
  const s = revenueScale(league);
  return (attendanceFor(league, t) * t.budget.ticketPrice) / 1000 + MERCH_PER_GAME * s * (0.5 + t.hype) * (0.7 + t.pop / 15) + LOCAL_TV_PER_GAME * s * (0.6 + t.pop / 12);
}

/**
 * The season's budget from today, the finance model's own way: national revenue for every game left,
 * gate, merchandise and local TV for every home game left, revenue sharing against the league's average
 * local revenue (still to come during the regular season), and every game's share of the salaries (two-way
 * deals and dead money included, 10-day deals paid already), the staff and facilities budgets and the
 * arena; and at the end of the regular season, a payroll under the salary floor makes up the shortfall
 * (`floor`, as assessLuxuryTax charges it). Playoff gates and the league's luxury-tax payouts aren't in it
 * (see PROFIT_EXTRA).
 */
export function seasonBudget(league: League, tid: number): { op: number; share: number; floor: number } {
  if (league.phase !== 'preseason' && league.phase !== 'regular') return { op: 0, share: 0, floor: 0 };
  const s = revenueScale(league);
  const national = (NATIONAL_REVENUE * s) / SEASON_GAMES;
  const { left, home } = gamesLeft(league);
  // local revenue booked so far (as revenue sharing counts it) and to come
  const local = league.teams.map((t) => {
    const ts = thisSeason(league, t.tid);
    const booked = ts ? ts.revenue - national * (ts.won + ts.lost) - (ts.cashIn ?? 0) : 0;
    return booked + home[t.tid] * localPerHomeGame(league, t);
  });
  const mean = local.reduce((a, v) => a + v, 0) / Math.max(1, local.length);
  const t = league.teams[tid];
  const pay =
    standardRoster(league, tid).reduce((a, p) => a + (p.contract.tenDay ? 0 : salaryFor(p, league.season)), 0) +
    Object.values(league.players).reduce((a, p) => a + (p.tid === tid && p.contract.twoWay ? salaryFor(p, league.season) : 0), 0) +
    t.deadMoney.filter((d) => d.season === league.season).reduce((a, d) => a + d.amount, 0);
  const costs =
    pay +
    budgetCostPerSeason(league, t.budget.coaching) +
    budgetCostPerSeason(league, t.budget.health) +
    budgetCostPerSeason(league, t.budget.facilities) +
    OPERATIONS_PER_SEASON * s;
  const op = national * left[tid] + home[tid] * localPerHomeGame(league, t) - (costs / SEASON_GAMES) * left[tid];
  return { op, share: (mean - local[tid]) * REVENUE_SHARING, floor: Math.max(0, CAP_FOR(league).minPayroll - payroll(league, tid)) };
}

/** Minutes for players 23 or under in a team's regular season, from its box scores (players who left since count for the minutes they played). */
export function youngMinutes(league: League, tid: number, season = league.season): number {
  let min = 0;
  for (const p of Object.values(league.players)) {
    if (playerAge(p, season) > YOUNG_AGE) continue;
    for (const s of p.stats) if (s.season === season && s.tid === tid && !s.playoffs && !s.real) min += s.min;
  }
  return Math.round(min);
}

/** Minutes a game the young players on the roster would get from an assistant's rotation (healthy). */
function youngPerGame(league: League, tid: number): number {
  const roster = standardRoster(league, tid).map((p) => ({ ...p, injury: null }));
  if (!roster.length) return 0;
  const rot = autoRotation(roster);
  return roster.filter((p) => age(league, p) <= YOUNG_AGE).reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
}

// ---------------------------------------------------------------- setting the goals

const round100 = (x: number) => Math.round(x / 100) * 100;
const round500 = (x: number) => Math.round(x / 500) * 500;

/** Base weights by goal, and how each personality and market size moves them. */
const WEIGHT: Record<OwnerGoalKind, number> = { wins: 0.4, postseason: 0.3, profit: 0.2, payroll: 0.15, youth: 0.3 };
const LEAN: Record<OwnerPersonality, Partial<Record<OwnerGoalKind, number>>> = {
  'win-now': { wins: 1.15, postseason: 1.3, profit: 0.75, payroll: 0.75, youth: 0.6 },
  builder: { wins: 0.9, postseason: 0.85, youth: 1.5 },
  frugal: { wins: 0.9, profit: 1.7, payroll: 1.7 },
};
/** Wins the owner adds to (or takes off) what the roster should win, over a full season. */
const WIN_NUDGE: Record<OwnerPersonality, number> = { 'win-now': 2, builder: -1, frugal: -1 };
/** Profit the owner adds to the budget, over a full season, first-season $K. */
const PROFIT_NUDGE: Record<OwnerPersonality, number> = { 'win-now': -2_000, builder: 0, frugal: 4_000 };

/** Weights that add up to exactly 1, in whole percents (the largest takes the rounding). */
function normalize(goals: OwnerGoal[]) {
  const sum = goals.reduce((a, g) => a + g.weight, 0);
  for (const g of goals) g.weight = Math.round((g.weight / sum) * 100) / 100;
  const top = goals.reduce((a, g) => (g.weight > a.weight ? g : a), goals[0]);
  top.weight = Math.round((top.weight + 1 - goals.reduce((a, g) => a + g.weight, 0)) * 100) / 100;
}

/** The current postseason level of a team's season (see POSTSEASON): the round it reached, the play-in, or none. */
export function postseasonLevel(ts: TeamSeason | undefined): number {
  if (!ts) return 0;
  if (ts.playoffRound >= 1) return Math.min(6, ts.playoffRound + 1);
  return ts.playIn || ts.playoffRound === 0 ? 1 : 0;
}

/** The team is still playing in the postseason (or hasn't finished its regular season). */
function alive(league: League, tid: number) {
  if (league.phase === 'preseason' || league.phase === 'regular') return true;
  const ts = thisSeason(league, tid);
  if (!ts || ts.playoffRound < 0 || ts.playoffRound === 5) return false;
  if (league.phase === 'playin') return true;
  if (league.phase !== 'playoffs') return false;
  return !league.playoffs.some((s) => (s.high === tid || s.low === tid) && s.winner !== undefined && s.winner !== tid) && ts.playoffRound >= 1;
}

/**
 * The goals the owner of `tid` sets today for the rest of its season: on opening night (and in the
 * preseason, as a preview) for the whole season, mid-season from today with the targets prorated to
 * the games left, and during the postseason a postseason goal alone (the next round). Null when the
 * team's season is over. Reads the league only (`outlook` may be passed when setting many teams' goals).
 */
export function planOwnerGoals(league: League, tid: number, outlook: TeamOutlook[] = leagueOutlook(league)): OwnerGoals | null {
  const team = league.teams[tid];
  const ts = thisSeason(league, tid);
  const who = ownerPersonality(league, tid);
  const lean = (k: OwnerGoalKind) => WEIGHT[k] * (LEAN[who][k] ?? 1);
  const o = outlook[tid];
  const regular = league.phase === 'preseason' || league.phase === 'regular';
  const opening = league.phase === 'preseason' || (ts?.won ?? 0) + (ts?.lost ?? 0) === 0;
  const base: OwnerGoals = { season: league.season, tid, games: o.left, goals: [] };
  if (!regular) {
    // a team taken over in the postseason: win the series (or the play-in) it's in
    if (!alive(league, tid)) return null;
    const level = postseasonLevel(ts) + 1;
    base.goals.push({ kind: 'postseason', title: POSTSEASON[level].goal, target: level, weight: 1 });
    base.from = { day: league.day, won: ts?.won ?? 0, lost: ts?.lost ?? 0, profit: profit(league, tid), youth: 0 };
    return base;
  }
  if (o.left <= 0) return null;
  const share = o.left / SEASON_GAMES;
  if (!opening) base.from = { day: league.day, won: ts?.won ?? 0, lost: ts?.lost ?? 0, profit: profit(league, tid), youth: youngMinutes(league, tid) };
  const goals = base.goals;
  // wins: what the roster should win, nudged by the owner's personality
  const expected = o.pct * o.left;
  const wins = clamp(Math.round(expected + WIN_NUDGE[who] * share), Math.max(1, Math.round(o.left * 0.12)), Math.round(o.left * 0.88));
  goals.push({ kind: 'wins', title: opening ? `Win ${wins} games` : `Win ${wins} of the last ${o.left} games`, target: wins, weight: lean('wins'), perGame: o.pct });
  // the postseason, from the projected conference rank and the front office's strategy
  const rank = projectedRank(league, outlook, tid);
  const rebuild = team.strategy === 'rebuild';
  let level = 0;
  if (!rebuild && (rank <= 4 || team.strategy === 'contend')) {
    level = 3;
    // the conference's best roster by a distance is expected to go deeper (four wins clear: the
    // conference finals, nine: the Finals; a win-now owner asks it a little sooner)
    const second = outlook.filter((x) => x.tid !== tid && league.teams[x.tid].conf === team.conf).reduce((a, x) => Math.max(a, x.final), 0);
    const clear = rank === 1 ? (o.final - second) * SEASON_GAMES + (who === 'win-now' ? 1.5 : 0) : 0;
    if (clear >= 9) level = 5;
    else if (clear >= 4) level = 4;
  } else if (!rebuild && rank <= 8) level = 2;
  else if (!rebuild && rank <= 10) level = 1;
  if (level) goals.push({ kind: 'postseason', title: POSTSEASON[level].goal, target: level, weight: lean('postseason'), rank });
  // development: a rebuilder, a team projected out of the play-in, or a retooling team with young players in its rotation
  const youngPg = youngPerGame(league, tid);
  if (!level || (team.strategy === 'retool' && youngPg * SEASON_GAMES >= 2_500)) {
    // an assistant's rotation undercounts them: young players gain minutes over a season as they improve (fitted over simulated seasons)
    const target = Math.max(500, round100((0.85 * youngPg * o.left + 1_350 * share) * (who === 'builder' ? 1.1 : 1)));
    goals.push({
      kind: 'youth',
      title: `Play your young players: ${target.toLocaleString('en-US')} minutes for players ${YOUNG_AGE} or under`,
      target,
      weight: lean('youth') * (level ? 0.5 : 1),
      perGame: (0.85 * youngPg + 1_350 / SEASON_GAMES) * (who === 'builder' ? 1.1 : 1),
    });
  }
  // money: a payroll near the tax line is the owner's concern (under it, staying there; just over it, or a
  // frugal owner's a little more, getting under), a taxpayer's no more spending, and anyone else's the season's profit
  const line = CAP_FOR(league).luxuryTax;
  const pay = payroll(league, tid);
  const market = team.pop < 3 ? 1.3 : team.pop > 7 ? 0.75 : 1;
  if (pay > line * (who === 'frugal' ? 1.04 : 1.01)) {
    const cap = Math.ceil((pay + line * 0.005) / 1000) * 1000;
    goals.push({ kind: 'payroll', title: `Keep the payroll under ${money(cap)}`, target: cap, weight: lean('payroll') * market });
  } else if (pay > line * 0.94) {
    goals.push({ kind: 'payroll', title: pay > line ? 'Get under the luxury tax' : 'Stay under the luxury tax', target: line, weight: lean('payroll') * market });
  } else {
    const s = revenueScale(league);
    const b = seasonBudget(league, tid);
    // a roster that should lose draws smaller crowds game by game; one that should win earns playoff gates at the
    // end. The season's end money (revenue sharing, the floor, playoff gates, tax payouts) all lands after a
    // mid-season start, so none of it is prorated.
    const wins = PROFIT_PER_WIN * (expected - o.left / 2) * s;
    const op = b.op + Math.min(0, wins);
    const end = b.share - b.floor + PROFIT_EXTRA * s + Math.max(0, wins);
    const target = round500((opening ? profit(league, tid) : 0) + op + end + PROFIT_NUDGE[who] * share * s);
    const words = target >= 500 ? `Turn a ${money(target)} profit` : target > -500 ? 'Break even' : `Keep the loss under ${money(-target)}`;
    goals.push({ kind: 'profit', title: opening ? words : `${words} the rest of the way`, target, weight: lean('profit') * market, perGame: op / o.left, end });
  }
  normalize(goals);
  return base;
}

/** The goals the owner set for the user's current season, if he has set them (absent before opening night, for a fired coach, and in a save from before goals). */
export function currentGoals(league: League): OwnerGoals | undefined {
  const og = league.ownerGoals;
  return og && og.season === league.season && og.tid === league.userTid && !league.fired ? og : undefined;
}

/**
 * The owner sets the user's goals for the rest of the season (opening night, a mid-season takeover,
 * or a save from before goals in season) and, unless `quiet`, says so in the inbox. Goals for a team
 * whose season is over are cleared: the next ones come on opening night.
 */
export function setOwnerGoals(league: League, quiet = false) {
  const og = league.fired ? null : planOwnerGoals(league, league.userTid);
  if (!og) {
    delete league.ownerGoals;
    return;
  }
  league.ownerGoals = og;
  if (quiet) return;
  const who = ownerPersonality(league, league.userTid);
  addInbox(league, {
    from: 'Owner',
    subject: og.from ? 'My goals for the rest of the season' : 'My goals for this season',
    body: [
      og.from ? 'Here is what I expect for the rest of the season:' : 'Here is what I expect from this roster:',
      ...og.goals.map((g) => `${g.title} (${Math.round(g.weight * 100)}% of my review)`),
      `${who === 'win-now' ? 'I want results.' : who === 'frugal' ? 'Every dollar counts.' : "I'm patient, but I'm watching."} I'll check in at the All-Star break.`,
    ].join('\n'),
    tone: 'neutral',
    link: '/office/owner',
  });
}

// ---------------------------------------------------------------- progress and grades

export type GoalStatus = 'ahead' | 'on track' | 'behind' | 'met' | 'missed';

export interface GoalProgress {
  goal: OwnerGoal;
  /** The result so far (wins, level, profit, payroll, minutes). */
  now: number;
  /** Where it projects at the season's end (the result once it's final). */
  projected: number;
  status: GoalStatus;
  /** How it stands, in a few words: "31-19, projected 50 wins", "3rd in the East" (before a game: "His read of the roster: 46 wins"). */
  text: string;
  /** Progress toward the target, 0..1, for a bar (payroll: how much of the line is used). */
  fill: number;
}

/** Statuses that count as on track for a summary ("2 of 3 on track"). */
export const ON_TRACK: ReadonlySet<GoalStatus> = new Set<GoalStatus>(['ahead', 'on track', 'met']);

/** A goal's result as it stands (final once the season is over): wins, the postseason level, profit, payroll at the tax assessment, young players' minutes. */
export function goalResult(league: League, og: OwnerGoals, g: OwnerGoal): number {
  const ts = league.teams[og.tid]?.seasons.find((s) => s.season === og.season);
  switch (g.kind) {
    case 'wins':
      return (ts?.won ?? 0) - (og.from?.won ?? 0);
    case 'postseason':
      return postseasonLevel(ts);
    case 'profit':
      return profit(league, og.tid, og.season) - (og.from?.profit ?? 0);
    case 'payroll':
      // what the tax was assessed on at the end of the regular season (the payroll today before then)
      return ts?.payroll || payroll(league, og.tid, og.season);
    case 'youth':
      return youngMinutes(league, og.tid, og.season) - (og.from?.youth ?? 0);
  }
}

/** The result meets the goal: at least the target (a payroll goal: at most its line). */
export const goalMet = (g: Pick<OwnerGoal, 'kind' | 'target'>, result: number) => (g.kind === 'payroll' ? result <= g.target : result >= g.target);

/** A goal's grade (−1..1) for a result: how far it beat or missed the target, on a scale where a near miss costs little. */
export function gradeGoal(league: League, og: OwnerGoals, g: OwnerGoal, result: number): number {
  const span = Math.max(0.5, og.games / SEASON_GAMES);
  const r2 = (x: number) => Math.round(clamp(x, -1, 1) * 100) / 100;
  switch (g.kind) {
    case 'wins':
      return r2((result - g.target) / (WIN_SCALE * span));
    case 'postseason': {
      // reaching it is worth +30 and each level beyond 30 more; each level short costs 35
      const d = result - g.target;
      return r2(d >= 0 ? 0.3 + 0.3 * d : 0.35 * d);
    }
    case 'profit':
      return r2((result - g.target) / (PROFIT_SCALE * revenueScale(league, og.season) * span));
    case 'payroll': {
      // a line kept is what the owner expects: +15, up to +30 with room to spare; over it costs 25, down to
      // −100 at PAYROLL_SCALE of the tax line over (the luxury tax he pays for it)
      const step = PAYROLL_SCALE * CAP_FOR(league, og.season).luxuryTax;
      return r2(result <= g.target ? 0.15 + 0.15 * clamp((g.target - result) / step, 0, 1) : -0.25 - 0.75 * clamp((result - g.target) / step, 0, 1));
    }
    case 'youth':
      return r2((result - g.target) / Math.max(1_000 * span, 0.5 * g.target));
  }
}

const ordinalRank = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** The result in words: "52 wins", "lost in the second round", "$9.4M profit", "$198.1M, $2.9M under", "1,840 minutes". */
export function resultText(g: Pick<OwnerGoal, 'kind' | 'target'>, result: number): string {
  switch (g.kind) {
    case 'wins':
      return `${result} win${result === 1 ? '' : 's'}`;
    case 'postseason':
      return POSTSEASON[clamp(result, 0, 6)].result;
    case 'profit':
      return result >= 0 ? `${money(result)} profit` : `${money(-result)} loss`;
    case 'payroll':
      return result <= g.target ? `${money(result)}, ${money(g.target - result)} under` : `${money(result)}, ${money(result - g.target)} over`;
    case 'youth':
      return `${result.toLocaleString('en-US')} minutes`;
  }
}

/**
 * How each of the season's goals stands today: the result so far, where it projects (wins: the season
 * forecast's projected record when `fc` is given, as the screens pass it, so the owner's projection and
 * the odds line on the same screen agree; otherwise the record so far blended with the roster's
 * expectation for the games left, PACE_PRIOR games of each; the conference seed; profit so far and the
 * budget for the rest; payroll against its line; young players' minutes at their pace) and whether
 * that's ahead, on track or behind, or already met or missed. Reads the league only.
 */
export function ownerProgress(league: League, og: OwnerGoals | undefined = currentGoals(league), fc?: Forecast | null): GoalProgress[] {
  if (!og) return [];
  const ts = league.teams[og.tid]?.seasons.find((s) => s.season === og.season);
  const regular = og.season === league.season && (league.phase === 'regular' || league.phase === 'preseason');
  const gp = (ts ? ts.won + ts.lost : 0) - (og.from ? og.from.won + og.from.lost : 0);
  const left = regular ? Math.max(0, og.games - gp) : 0;
  const w = gp / (gp + PACE_PRIOR);
  const rows = og.goals.map((g): GoalProgress => {
    const now = goalResult(league, og, g);
    switch (g.kind) {
      case 'wins': {
        const pace = gp ? now / gp : (g.perGame ?? 0.5);
        const f = regular && gp > 0 && fc?.season === og.season ? fc.teams[og.tid] : undefined;
        const projected = f ? clamp(Math.round(f.w) - (og.from?.won ?? 0), now, now + left) : Math.round(now + left * (w * pace + (1 - w) * (g.perGame ?? 0.5)));
        const lost = gp - now;
        const status: GoalStatus =
          now >= g.target ? 'met' : now + left < g.target ? 'missed' : projected >= g.target + 3 ? 'ahead' : projected >= g.target - 1 ? 'on track' : 'behind';
        const read = Math.round((g.perGame ?? 0.5) * og.games);
        const text =
          gp === 0 ? `His read of the roster: ${read} ${og.from ? `of the ${og.games} left` : 'wins'}` : left ? `${now}-${lost}, projected ${projected} wins` : `${now}-${lost}`;
        return { goal: g, now, projected, status, text, fill: clamp(now / Math.max(1, g.target), 0, 1) };
      }
      case 'postseason': {
        const level = now;
        if (regular) {
          const row = confStandings(league, league.teams[og.tid].conf).find((r) => r.tid === og.tid);
          // before the first game the standings' order is only a tiebreak: where the roster projected him instead
          const fresh = gp === 0 && (ts?.won ?? 0) + (ts?.lost ?? 0) === 0;
          const seed = (fresh ? g.rank : undefined) ?? row?.confRank ?? 15;
          const implied = seed <= 6 ? 2 : seed <= 10 ? 1 : 0;
          const deep = g.target >= 3 ? (seed <= [0, 0, 0, 4, 2, 1, 1][g.target] ? 1 : 0) : 0;
          const clinched = row?.clinched;
          const status: GoalStatus =
            (g.target <= 2 && clinched === 'x') || (g.target === 1 && clinched === 'p')
              ? 'met'
              : clinched === 'e'
                ? 'missed'
                : g.target >= 3
                  ? deep
                    ? 'on track'
                    : 'behind'
                  : implied > g.target || (implied === g.target && seed <= [0, 6, 3][g.target])
                    ? 'ahead'
                    : implied >= g.target
                      ? 'on track'
                      : 'behind';
          const conf = league.teams[og.tid].conf === 'E' ? 'East' : 'West';
          const text = fresh ? `His read of the roster: ${ordinalRank(seed)} in the ${conf}` : `${ordinalRank(seed)} in the ${conf}`;
          // a deep run on track projects to his goal, as its status says (the seed alone only implies the playoffs)
          return { goal: g, now: implied, projected: g.target >= 3 && deep ? g.target : implied, status, text, fill: clamp(implied / g.target, 0, 1) };
        }
        const still = og.season === league.season && alive(league, og.tid);
        const status: GoalStatus = level >= g.target ? 'met' : still ? 'on track' : 'missed';
        const text =
          !still || level < 1
            ? POSTSEASON[level].result
            : level === 1
              ? 'In the play-in'
              : league.phase === 'playin'
                ? 'Qualified for the playoffs'
                : `Playing in the ${['', '', 'first round', 'second round', 'conference finals', 'Finals'][level]}`;
        return { goal: g, now: level, projected: level, status, text: text.charAt(0).toUpperCase() + text.slice(1), fill: clamp(level / g.target, 0, 1) };
      }
      case 'profit': {
        const projected = regular ? now + (g.perGame ?? 0) * left + (g.end ?? 0) : now;
        const scale = PROFIT_SCALE * revenueScale(league, og.season) * Math.max(0.5, og.games / SEASON_GAMES);
        const status: GoalStatus =
          !regular && now >= g.target ? 'met' : projected >= g.target + 0.15 * scale ? 'ahead' : projected >= g.target - 0.1 * scale ? 'on track' : 'behind';
        const text = !regular ? `${money(now)} so far` : gp ? `${money(now)} so far, projected ${money(projected)}` : `His budget projects ${money(projected)}`;
        return { goal: g, now, projected, status, text, fill: g.target > 0 ? clamp(projected / g.target, 0, 1) : projected >= g.target ? 1 : 0 };
      }
      case 'payroll': {
        const settled = !regular;
        const status: GoalStatus = settled ? (now <= g.target ? 'met' : 'missed') : now <= g.target ? (g.target - now >= 0.02 * g.target ? 'ahead' : 'on track') : 'behind';
        const text = now <= g.target ? `${money(now)}, ${money(g.target - now)} under` : `${money(now)}, ${money(now - g.target)} over`;
        return { goal: g, now, projected: now, status, text, fill: clamp(now / g.target, 0, 1) };
      }
      case 'youth': {
        const v = 20 / (gp + 20);
        const rate = gp ? (1 - v) * (now / gp) + v * (g.perGame ?? 0) : (g.perGame ?? 0);
        const projected = round100(now + left * rate);
        const status: GoalStatus = now >= g.target ? 'met' : !regular ? 'missed' : projected >= g.target * 1.1 ? 'ahead' : projected >= g.target * 0.95 ? 'on track' : 'behind';
        const text =
          !regular || !left
            ? `${now.toLocaleString('en-US')} minutes`
            : gp
              ? `${now.toLocaleString('en-US')} so far, projected ${projected.toLocaleString('en-US')}`
              : `About ${Math.round(g.perGame ?? 0)} minutes a game`;
        return { goal: g, now, projected, status, text, fill: clamp(now / Math.max(1, g.target), 0, 1) };
      }
    }
  });
  // before a game counts, nothing he projects is ahead or behind yet (a payroll over its line already is)
  return regular && gp === 0 ? rows.map((p) => (p.goal.kind === 'payroll' || p.status === 'met' || p.status === 'missed' ? p : { ...p, status: 'on track' })) : rows;
}

/** The season's goals graded: each one's result and grade, and the season's grade by weight. */
export function gradeOwnerGoals(league: League, og: OwnerGoals): { goals: OwnerReview['goals']; grade: number } {
  const goals = og.goals.map((g) => {
    const result = goalResult(league, og, g);
    // (the plan's per-game numbers were for the in-season projection only)
    return { kind: g.kind, title: g.title, target: g.target, weight: g.weight, result, grade: gradeGoal(league, og, g, result) };
  });
  const grade = Math.round(goals.reduce((a, g) => a + g.weight * g.grade, 0) * 100) / 100;
  return { goals, grade };
}

// ---------------------------------------------------------------- check-ins

/** Regular-season games played before the owner says the team is off pace, and how many of them since he set the goals. */
export const PACE_GAMES = 40;
export const PACE_SINCE = 20;
/** Wins under his target (over a full season; half that over a short stretch) the projection must fall before he says so. */
export const OFF_PACE = 5;

/**
 * The owner's in-season mail, once a day of the regular season: goals for a season that has none yet
 * (a save from before them: set quietly from that day, the Owner tab shows them), a word when the team
 * has fallen clearly off pace after PACE_GAMES games (once), and a check-in at the All-Star break
 * (once): on track or worried, with the numbers. Both read the season forecast as the screens show it
 * (see leagueForecast), so the numbers he quotes are the ones on Home; for the pace that's a weekly
 * look, and only once the quick projection (the record blended with the roster's expectation) is
 * within two wins of the line, so a season on pace never runs the forecast for it.
 */
export function ownerCheckIn(league: League) {
  if (league.fired || league.phase !== 'regular') return;
  if (!currentGoals(league)) setOwnerGoals(league, true);
  const og = currentGoals(league);
  if (!og) return;
  const sent = (og.sent ??= []);
  const ts = thisSeason(league, og.tid);
  const gp = ts ? ts.won + ts.lost : 0;
  const since = gp - (og.from ? og.from.won + og.from.lost : 0);
  const allStar = league.day === league.allStarDay && !sent.includes('allStar');
  const pace = !sent.includes('pace') && gp >= PACE_GAMES && since >= PACE_SINCE && (league.day % 7 === 6 || allStar);
  // most days there is nothing to say: the progress (and the standings it reads) waits until there might be
  if (!allStar && !pace) return;
  const line = (og.goals.find((g) => g.kind === 'wins')?.target ?? 0) - OFF_PACE * Math.max(0.5, og.games / SEASON_GAMES);
  const quick = ownerProgress(league, og).find((p) => p.goal.kind === 'wins');
  const look = allStar || (pace && !!quick && quick.status !== 'met' && quick.projected <= line + 2);
  const prog = look ? ownerProgress(league, og, leagueForecast(league)) : [];
  const wins = prog.find((p) => p.goal.kind === 'wins');
  if (pace && wins && wins.status !== 'met' && wins.projected <= line) {
    sent.push('pace');
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: "We're off pace",
      body: `We're ${wins.now}-${since - wins.now}${og.from ? ' since you took over' : ''}, on course for about ${wins.projected} wins. I expected ${wins.goal.target} from this roster. That gap has to close.`,
      tone: 'bad',
      link: '/office/owner',
    });
  }
  if (allStar) {
    sent.push('allStar');
    // a coach on the hot seat gets his ultimatum with it (its own mail, important)
    maybeUltimatum(league, leagueForecast(league));
    const good = prog.filter((p) => ON_TRACK.has(p.status)).length;
    const lines = prog.map((p) => `${p.goal.title} — ${p.text} (${p.status})`);
    const mood =
      good === prog.length
        ? "We're on track. Keep it going."
        : good * 2 >= prog.length
          ? 'Some of it is working. Not all of it.'
          : "I'm worried. We're behind where I expected to be.";
    addInbox(league, {
      from: 'Owner',
      subject: 'All-Star break check-in',
      body: [`At the break, ${good} of my ${prog.length} goals ${good === 1 ? 'is' : 'are'} on track.`, ...lines, mood].join('\n'),
      tone: good === prog.length ? 'good' : good * 2 >= prog.length ? 'neutral' : 'bad',
      link: '/office/owner',
    });
  }
}
