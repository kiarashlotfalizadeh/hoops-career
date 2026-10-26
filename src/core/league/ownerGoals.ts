// The owner's goals for the user's season. On opening night the owner looks at the roster he has and
// sets three or four goals for it, frozen for the season: a win total (what the season forecast
// projects the roster to win, the difficulty's edge on the court in it, see leagueOutlook: the
// number the press's "projected for N wins" reads; after the coach's first season with the team
// raised a little toward what a team with its payroll's league rank should win, and never under
// the difficulty's win% floor, itself never closer than FLOOR_MARGIN wins under his read), a
// postseason goal from where that projects the team in its conference and its front office's
// strategy (or a development goal for a rebuilder or a team projected out of the play-in: minutes
// for players 23 or under, for as many seasons in a row without the postseason as the difficulty
// gives a rebuild; after that, the play-in at least and a higher floor, and only reaching the
// postseason resets the clock), and a money goal (a profit from the season's budget at the league's
// standard levers, or the luxury tax line for a team near or over it: a win-now owner's the first
// apron). A season under the floor
// grades Poor or worse whatever else went right (see floorCap), and so does one past the rebuild
// allowance that misses the postseason, lower each season it goes on (see patienceCap). Each
// franchise's owner has a personality of his own (a builder, win-now or frugal), the
// same every season of a league, which moves the targets and weights a little. In season the goals
// report their progress (ownerProgress) and the owner checks in at the All-Star break (monthly too: legacyPulse.ts) and when the
// team falls clearly off pace; after the playoffs each goal is graded −1..1 by how far the result beat
// or missed its target, and the weights make the season's grade (see owner.ts for the running
// standing and firing). A team that takes over mid-season gets goals from that day, prorated.
// Nothing here draws from the league's random stream.

import type { League, Player, Team, TeamSeason } from '../types';
import { canBeFired, maybeUltimatum } from './jobSecurity';
import { clamp, hashString } from '../random';
import { autoRotation } from '../ai/coachAI';
import { playerAge, salaryFor } from '../playerGen';
import { MARGIN_SD, PRIOR_GAMES, phi } from '../analysis/projection';
import { forecast, leagueForecast, type Forecast, type TeamOdds } from '../analysis/odds';
import { ROSTER_NET, rosterWorth } from '../analysis/worth';
import { CAP_FOR, addInbox, payroll, revenueScale, standardRoster } from './helpers';
import { LOCAL_TV_PER_GAME, MERCH_PER_GAME, NATIONAL_REVENUE, OPERATIONS_PER_SEASON, REVENUE_SHARING, aiTicketPrice, attendanceFor, budgetCostPerSeason, profit } from './finances';
import { confStandings } from './standings';
import { money } from '../format';
import { CAP } from '../constants';
import { preset, userCourtPoints } from './difficulty';

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
  /** Wins: the league rank of the team's payroll when it was set (1: the highest), when that raised the target. */
  payRank?: number;
  /** Wins: last season's target with this team, when it held this one up (see WIN_SLIDE). */
  held?: number;
  /**
   * Payroll: the owner's own line (the tax line; a win-now owner's first apron) when the target is the
   * payroll the coach inherited past it (see forcedPayroll): the books don't count that payroll's tax,
   * nor its salary past this line, against him (see books.ts sanctionedTax).
   */
  line?: number;
  /**
   * Development: the part of its weight that came from telling the owner the season was a rebuild or
   * a development year (see concedeSeason, easeFloor). That part grades 0 at best: playing the young
   * players spares the miss it stood for, it doesn't earn on top of it.
   */
  conceded?: number;
  /**
   * Wins: the wins the difficulty's edge on the court moved the owner's read by (under 0 on Hard:
   * see userCourtPoints), counted in as the season forecast counts it. Absent in goals from before
   * it was (their targets ignored it).
   */
  edge?: number;
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
  /** The least win% he accepts this season (see floorCap); absent in goals from before the floor. */
  floor?: number;
  /** The rebuild clock: which season in a row without the postseason this is, of how many he allows; `over`: he allows no more (the play-in at least). */
  rebuild?: { year: number; of: number; over?: true };
  /** A season he asks to compete in after seasons without the postseason, short of his allowance: how many, of how many he allows (the rebuild clock is running). */
  missed?: { seasons: number; of: number };
  /** He lowered the floor this season when told it was a development year (see easeFloor). */
  eased?: true;
  /** What telling him the season was a rebuild (or a development year) cost the standing (CONCEDE_COST each): the review keeps it off, whatever the season's grade (see ownerEvaluation). */
  cost?: number;
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
  /** The owner's own words on the season (his verdict's first line: "I'm pleased.", or why he fired the coach); absent in reviews from before it was kept. */
  said?: string;
  /** The season's grade (−1..1): the goals' grades by weight. */
  grade: number;
  /** The overall standing after the review (League.ownerMood.total). */
  total: number;
  /** Regular-season games the goals covered (all 82 unless they were set mid-season); absent in reviews from before it was kept. */
  games?: number;
  /** A championship (or a postseason two rounds past the goal) that lifted the season's grade (see CROWN_GRADE). */
  crowned?: 'title' | 'run';
  /** What held the season's grade down, when something did: the win floor, the rebuild clock (see patienceCap), or the books closed in the red under the freeze (see booksVerdict). */
  held?: 'floor' | 'patience' | 'books';
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
/** Each win it should fall short of .500 costs about this much (crowds and merchandise thin as the losses mount), first-season $K. */
export const PROFIT_PER_LOSS = 1_500;
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
/** The most a development goal grades: minutes past its target are the coach's own to hand out, as a payroll kept under its line is (+30). */
export const YOUTH_TOP = 0.3;
/** Age (as of February 1 of the season) a development goal's players are at most. */
export const YOUNG_AGE = 23;
/** How far the floor rises once the owner's patience with a rebuild has run out. */
export const REBUILD_OVER_FLOOR = 0.1;
/** The most a season under the floor can grade, and how much lower each point of win% under it takes that. */
export const FLOOR_GRADE = -0.4;
export const FLOOR_SLOPE = 3;
/** Regular-season games played before the floor counts (a short stretch after a late takeover doesn't). */
export const FLOOR_GAMES = 20;
/**
 * Wins (over a full season) the floor stays under the owner's read of the roster at least: on Hard
 * the floor and the rebuild clock's rise had asked a Kings roster he read at 16 wins for 35 (the
 * review, round 2), a firing by design.
 */
export const FLOOR_MARGIN = 6;
/** The most wins (over a full season) a payroll's league rank raises the win target by. */
export const PAY_RAISE = 3;
/** Room an inherited payroll's "add nothing to it" leaves, as a share of the tax line (about $0.5M). */
export const PAYROLL_SLACK = 0.0025;

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

/**
 * The owner's personality in a line that agrees with the goals he set ("Win-now · wants results this
 * season" had sat over the Nets' rebuild goals): a win-now owner allowing a rebuild says so.
 */
export function personalityLine(who: OwnerPersonality, og?: Pick<OwnerGoals, 'rebuild'>): string {
  const p = PERSONALITY[who];
  return `${p.label} · ${who === 'win-now' && og?.rebuild && !og.rebuild.over ? "wants results, but he'll take a rebuild this season" : p.blurb}`;
}

/** A franchise's owner's personality: the same every season of a league (a hash of the league and the team, never its random stream). */
export function ownerPersonality(league: League, tid: number): OwnerPersonality {
  return (['builder', 'win-now', 'frugal'] as const)[hashString(`${league.id}:${tid}:owner`) % 3];
}

const thisSeason = (league: League, tid: number): TeamSeason | undefined => league.teams[tid]?.seasons.find((s) => s.season === league.season);
const age = (league: League, p: Player) => playerAge(p, league.season);

// ---------------------------------------------------------------- expectations

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
  /** What its players are worth on the floor over the games left (the season forecast's talent prior: see rosterWorth). */
  talent: number;
  /** Expected win% in the games left: the season forecast's projection (see leagueOutlook). */
  pct: number;
  /** The same without the difficulty's edge on the court (the user's team; anyone else's is `pct`). */
  bare: number;
  /** Projected final win%: the record so far and the expectation for the games left. */
  final: number;
}

/** Simulated seasons behind the owner's read: the press's predictions' count, so on opening night the two read the same forecast. */
const OUTLOOK_SIMS = 500;

/** The z for a probability (phi's inverse), by bisection: for taking the edge on the court back out of a forecast's win%. */
function zOf(p: number): number {
  let [lo, hi] = [-6, 6];
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (phi(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Every team's outlook from today (opening night: the whole season): the season forecast's projected
 * wins (odds.ts, the same simulated seasons the press's "projected for N wins" reads on opening
 * night), the user's with the difficulty's edge on the court in it as the forecast has it (on Hard
 * the owner asks what the roster should win against opponents who raise their game for it, not what
 * it would win on Normal). The owner's read and the forecast had been two models (his a planned
 * rotation's OVR at the game projection's rate) and differed by 4-8 wins for a fifth of the league
 * (the review, round 2: the Nets 26 against 34, the 76ers 46 against 41). Outside the season (the
 * summer's "next season" read) the forecast's own prior instead: what the rosters are worth at its
 * rate (ROSTER_NET), as a win% against an average team. Reads the league only.
 */
export function leagueOutlook(league: League): TeamOutlook[] {
  const { left } = gamesLeft(league);
  const regular = league.phase === 'preseason' || league.phase === 'regular';
  const fc = regular ? forecast(league, { sims: OUTLOOK_SIMS }) : null;
  const rosters = league.teams.map((): Player[] => []);
  for (const p of Object.values(league.players)) if (p.tid >= 0 && p.tid < rosters.length) rosters[p.tid].push(p);
  const rows = league.teams.map((t) => {
    const ts = thisSeason(league, t.tid);
    const games = regular ? left[t.tid] : 0;
    return { tid: t.tid, won: ts?.won ?? 0, lost: ts?.lost ?? 0, left: games, talent: rosterWorth(rosters[t.tid], games || SEASON_GAMES) };
  });
  const avg = rows.reduce((a, r) => a + r.talent, 0) / Math.max(1, rows.length);
  const court = userCourtPoints(league);
  return rows.map((r) => {
    const f: TeamOdds | undefined = fc?.teams[r.tid];
    const user = r.tid === league.userTid;
    let pct: number;
    let bare: number;
    if (f && r.left > 0) {
      pct = clamp((f.w - r.won) / r.left, 0.005, 0.995);
      // (the forecast counts the edge in the user's prior, less as his games so far weigh in: see odds.ts)
      const gp = r.won + r.lost;
      bare = user && court ? phi(zOf(pct) - (court * PRIOR_GAMES) / (gp + PRIOR_GAMES) / MARGIN_SD) : pct;
    } else {
      bare = phi((ROSTER_NET * (r.talent - avg)) / MARGIN_SD);
      pct = user && court ? phi((ROSTER_NET * (r.talent - avg) + court) / MARGIN_SD) : bare;
    }
    const g = r.won + r.lost + r.left;
    return { ...r, pct, bare, final: g ? (r.won + pct * r.left) / g : pct };
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

/** The staff and facilities budgets every AI front office runs (see teamFactory). */
export const STANDARD_BUDGET = 50;

/** A team at the league's standard levers: every budget at STANDARD_BUDGET, tickets where the staff would price them. */
function standardLevers(league: League, t: Team): Team {
  const budget = { ...t.budget, coaching: STANDARD_BUDGET, health: STANDARD_BUDGET, facilities: STANDARD_BUDGET };
  return { ...t, budget: { ...budget, ticketPrice: aiTicketPrice(league, { ...t, budget }) } };
}

/**
 * The season's budget from today, the finance model's own way: national revenue for every game left,
 * gate, merchandise and local TV for every home game left, revenue sharing against the league's average
 * local revenue (still to come during the regular season), and every game's share of the salaries (two-way
 * deals and dead money included, 10-day deals paid already), the staff and facilities budgets and the
 * arena; and at the end of the regular season, a payroll under the salary floor makes up the shortfall
 * (`floor`, as assessLuxuryTax charges it). Playoff gates and the league's luxury-tax payouts aren't in it
 * (see PROFIT_EXTRA). `standard`: at the league's standard levers instead of the team's own (every
 * staff and facilities budget at STANDARD_BUDGET, tickets at the price the staff would set), as the
 * owner sets his profit target: from the team's own levers, tickets at $30 and every budget maxed the
 * night he set it lowered the target by $40-70M, and putting them back banked the difference (the
 * Hornets on Hard kept a job with it, the review found, round 2).
 */
export function seasonBudget(league: League, tid: number, standard = false): { op: number; share: number; floor: number } {
  if (league.phase !== 'preseason' && league.phase !== 'regular') return { op: 0, share: 0, floor: 0 };
  const s = revenueScale(league);
  const national = (NATIONAL_REVENUE * s) / SEASON_GAMES;
  const { left, home } = gamesLeft(league);
  const own = league.teams[tid];
  const t = standard ? standardLevers(league, own) : own;
  // local revenue booked so far (as revenue sharing counts it) and to come
  const local = league.teams.map((x) => {
    const ts = thisSeason(league, x.tid);
    const booked = ts ? ts.revenue - national * (ts.won + ts.lost) - (ts.cashIn ?? 0) : 0;
    return booked + home[x.tid] * localPerHomeGame(league, x.tid === tid ? t : x);
  });
  const mean = local.reduce((a, v) => a + v, 0) / Math.max(1, local.length);
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

// ---------------------------------------------------------------- the floor and the rebuild clock

/**
 * Seasons in a row, up to last season, the user's team has gone without the postseason under the
 * owner of `tid`: reviewed seasons of his with this team that missed the play-in, a rebuild he
 * allowed or a season he asked to compete alike. Only a season that reached the postseason (the
 * play-in counts: it's what he asks for once his patience is out) ends the run, so a missed
 * "compete" season doesn't reset his patience.
 */
export function rebuildRun(league: League, tid: number): number {
  const reviews = (league.ownerReviews ?? []).filter((r) => r.tid === tid && r.season < league.season);
  const team = league.teams[tid];
  let n = 0;
  for (let s = league.season - 1; ; s--) {
    const r = reviews.find((x) => x.season === s);
    if (!r || !r.goals.length || postseasonLevel(team?.seasons.find((x) => x.season === s)) >= 1) return n;
    n++;
  }
}

/**
 * The most a season can grade once the owner's patience with a rebuild is out (OwnerGoals.rebuild
 * `over`) and it misses the postseason anyway: Poor (FLOOR_GRADE) the first season past his allowance,
 * PATIENCE_STEP lower for each one after it. A coach who keeps missing runs out of road: on normal
 * (each season 40% of the standing) one whose rebuild seasons graded about even crosses the firing
 * line in his third season past the allowance (−0.16, −0.34, −0.52), where the clock used to reset
 * after each season he was asked to compete in.
 */
export const PATIENCE_STEP = 0.2;

/** The grade cap for a season past the owner's rebuild allowance that missed the postseason (none otherwise: 1). */
export function patienceCap(og: Pick<OwnerGoals, 'rebuild'>, level: number): number {
  const r = og.rebuild;
  if (!r?.over || level >= 1) return 1;
  return Math.max(-1, FLOOR_GRADE - PATIENCE_STEP * Math.max(0, r.year - r.of - 1));
}

/** Wins a season's target can fall under last season's with the same team, outside a rebuild season. */
export const WIN_SLIDE = 3;

/**
 * Last season's full-season wins target for the user with team `tid` (none after a mid-season start,
 * a takeover, or a save from before reviews kept it; nor one set off the court edge's on Easy or
 * Hard before the owner counted it, see OwnerGoal.edge: an impossible ask doesn't hold up the next).
 */
export function lastWinsTarget(league: League, tid: number): number | undefined {
  const r = (league.ownerReviews ?? []).find((x) => x.tid === tid && x.season === league.season - 1);
  const g = r?.games === SEASON_GAMES ? r.goals.find((x) => x.kind === 'wins') : undefined;
  return g && (g.edge !== undefined || !preset(league).court) ? g.target : undefined;
}

/** The grade a season with this regular-season record can have at most: under the floor, FLOOR_GRADE and lower (none above it: 1). */
export function floorCap(og: Pick<OwnerGoals, 'floor'>, won: number, games: number): number {
  if (og.floor === undefined || games < FLOOR_GAMES) return 1;
  const pct = won / games;
  return pct >= og.floor ? 1 : Math.max(-1, FLOOR_GRADE - FLOOR_SLOPE * (og.floor - pct));
}

/** Each team's payroll rank in the league (1: the highest), by tid. */
function payrollRanks(league: League): number[] {
  const pays = league.teams.map((t) => payroll(league, t.tid));
  return pays.map((p, tid) => 1 + pays.filter((q, i) => i !== tid && (q > p || (q === p && i < tid))).length);
}

/** Moves that bring a player to a team (a trade is read from its sides). */
const ARRIVALS: ReadonlySet<string> = new Set(['sign', 'claim', 'tenDay', 'twoWay', 'convert', 'offerSheet', 'match']);

/**
 * The payroll a coach had no hand in, for `season` ($K): the contracts he inherited, at their
 * scheduled salaries (signed before his tenure, by players on the team since before he arrived: not
 * one he traded for, signed or claimed, nor a re-signing or an extension of his own), the
 * rookie-scale deals of the team's own first-round picks, and the minimum deals that fill the roster
 * to its 13, and this season's dead money of contracts he inherited too (a release of his own of one
 * moves its salary to dead money, it doesn't add to the payroll: the staff's opening-night cuts of a
 * camp roster over 15 left the 76ers, the Knicks, the Warriors and the Magic $2.4-4.9M "over" a goal
 * they had done nothing to, the review found, round 2). Read for the user's team; for any other
 * team (a job he's offered) all of its payroll, as a new coach would inherit it. The real league's
 * Thunder opened at $216M and, with no move of the coach's, went to $253M the next season on the
 * extensions it signed before him (Gilgeous-Alexander's supermax, Williams's and Holmgren's): the
 * owner's "get under the luxury tax" and the books' tax bill held that against a back-to-back
 * champion, an ultimatum and then a freeze, whoever owned the team.
 */
export function forcedPayroll(league: League, tid: number, season = league.season): number {
  const mine = tid === league.userTid;
  const from = mine ? (league.tenureStart ?? league.startSeason) : season + 1;
  const arrived = new Set<number>();
  // (and the contracts he signed himself with players already here: a release of one of those is his dead money)
  const signed = new Set<number>();
  if (mine)
    for (const t of league.transactions ?? []) {
      // (moves made while he ran this team: the log marks them his)
      if (!t.user || !t.tids.includes(tid)) continue;
      if (t.kind === 'trade') for (const side of t.sides ?? []) if (side.tid !== tid) for (const x of side.players) arrived.add(x.pid);
      if (ARRIVALS.has(t.kind) && t.pid !== undefined && t.tids[0] === tid) arrived.add(t.pid);
      if ((t.kind === 'resign' || t.kind === 'extend') && t.pid !== undefined && t.tids[0] === tid) signed.add(t.pid);
    }
  let sum = 0;
  let n = 0;
  const others: number[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid !== tid || p.contract.twoWay || p.contract.tenDay) continue;
    const c = p.contract;
    const inherited = c.start <= from && !arrived.has(p.pid);
    const draftee = !!c.rookie && p.draft.round === 1 && p.draft.tid === tid;
    // (the deal as it was signed: an extension of his own isn't in it)
    const i = season - c.start;
    const sal = i >= 0 && i < c.salaries.length ? c.salaries[i] : 0;
    if (!inherited && !draftee) {
      others.push(salaryFor(p, season));
      continue;
    }
    sum += sal;
    if (sal > 0) n++;
  }
  // and the roster minimum's bodies: the cheapest of his own players up to 13, at a veteran's minimum each at most
  const vetMin = CAP_FOR(league, season).vetMin;
  others.sort((a, b) => a - b);
  for (let k = 0; k < Math.min(others.length, Math.max(0, CAP.rosterMin - n)); k++) sum += Math.min(others[k], vetMin);
  for (const d of league.teams[tid]?.deadMoney ?? []) if (d.season === season && !arrived.has(d.pid) && !signed.has(d.pid)) sum += d.amount;
  return sum;
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
  const diff = preset(league);
  // the rebuild clock: seasons in a row this team has gone without the postseason under him, of the difficulty's allowance
  const run = rebuildRun(league, tid);
  const patienceOut = run >= diff.rebuildSeasons;
  // (the floor moves with the edge on the court as the roster's read does: Hard's floor is a win% for
  // a team its opponents raise their game against; and it stays FLOOR_MARGIN wins under his own read
  // of the roster, so it marks a season gone wrong, never one his read says the roster can't reach)
  const edgePct = o.pct - o.bare;
  const floor = clamp(Math.round(Math.min(diff.winFloor + (patienceOut ? REBUILD_OVER_FLOOR : 0) + edgePct, o.pct - FLOOR_MARGIN / SEASON_GAMES) * 1000) / 1000, 0.1, 0.6);
  base.floor = floor;
  // the postseason, from the projected conference rank and the front office's strategy (and the
  // rebuild clock: once it has run out, the play-in at least). A payroll in the league's top half
  // isn't a rebuild, whatever the front office calls it: the play-in at least.
  const payRank = payrollRanks(league)[tid];
  const paidToWin = payRank <= outlook.length / 2;
  const rank = projectedRank(league, outlook, tid);
  const rebuild = team.strategy === 'rebuild' && !patienceOut && !paidToWin;
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
  if (patienceOut || paidToWin) level = Math.max(level, 1);
  // wins: what the roster should win, nudged by the owner's personality, never under the floor; once
  // the payroll is the coach's own (after his first season with the team, a payroll he didn't inherit
  // whole) raised half-way to what a team paid like it should win (a payroll in the league's top half:
  // the league's expectations sorted, the payroll's rank among them), PAY_RAISE wins at most; and
  // outside a rebuild season never more than WIN_SLIDE under last season's full-season target with
  // this team (a roster run down doesn't lower the bar for the coach who ran it down). The raise had
  // held a first-season 76ers coach to 52 wins on a 41-win forecast, "for the league's 2nd-highest
  // payroll", while the same owner called it the payroll he had inherited.
  const cap = CAP_FOR(league);
  const pay = payroll(league, tid);
  const forcedPay = forcedPayroll(league, tid);
  const first = tid !== league.userTid || (league.tenureStart ?? league.startSeason) >= league.season;
  const inherited = first || forcedPay >= pay - PAYROLL_SLACK * cap.luxuryTax;
  // (what a team paid like it should win, against the same edge on the court as his own read)
  const byRank = paidToWin && !inherited ? (outlook.map((x) => (x.tid === tid ? o.bare : x.pct)).sort((a, b) => b - a)[payRank - 1] ?? o.bare) + edgePct : o.pct;
  const pct = o.pct + Math.min(PAY_RAISE / SEASON_GAMES, 0.5 * Math.max(0, byRank - o.pct));
  const expected = o.pct * o.left;
  const last = level && opening ? lastWinsTarget(league, tid) : undefined;
  const wins = clamp(
    Math.max(Math.round(pct * o.left + WIN_NUDGE[who] * share), last !== undefined ? last - WIN_SLIDE : 0),
    Math.max(1, Math.round(o.left * floor)),
    Math.round(o.left * 0.88),
  );
  goals.push({
    kind: 'wins',
    title: opening ? `Win ${wins} games` : `Win ${wins} of the last ${o.left} games`,
    target: wins,
    weight: lean('wins'),
    perGame: o.pct,
    edge: Math.round(edgePct * o.left * 10) / 10,
    ...(pct - o.pct >= 0.02 ? { payRank } : {}),
    ...(last !== undefined && wins > Math.round(pct * o.left + WIN_NUDGE[who] * share) ? { held: last } : {}),
  });
  // a season without a postseason goal is a rebuild season, one of the allowance; past it, the
  // season competes, and missing the postseason anyway caps its grade (see patienceCap)
  if (!level) base.rebuild = { year: run + 1, of: diff.rebuildSeasons };
  else if (patienceOut && run > 0) base.rebuild = { year: run + 1, of: diff.rebuildSeasons, over: true };
  else if (run > 0) base.missed = { seasons: run, of: diff.rebuildSeasons };
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
  // money: a payroll near or over the tax line is the owner's concern, and the line is his limit
  // (a win-now owner's the first apron: he pays some tax for a contender, not the second apron's);
  // anyone else's the season's profit
  const line = cap.luxuryTax;
  const market = team.pop < 3 ? 1.3 : team.pop > 7 ? 0.75 : 1;
  // a payroll the coach inherited past the owner's line is the owner's own: the line becomes "add
  // nothing to it" (the books don't count its tax, nor its salary past his line: see sanctionedTax):
  // his figure rounded up, with PAYROLL_SLACK of room, so a coach who adds nothing is never over it by
  // a rounding or the staff's own opening-night cuts (see forcedPayroll)
  const payrollGoal = (own: number, under: string, getUnder: string) => {
    const kept = forcedPay > own;
    const target = kept ? Math.ceil((forcedPay + PAYROLL_SLACK * line) / 100) * 100 : own;
    const over = pay > target;
    goals.push({
      kind: 'payroll',
      title: kept ? 'Add nothing to the payroll you inherited' : over ? getUnder : under,
      target,
      // a taxpayer's goal weighs more: what he pays for it comes out of his pocket
      weight: lean('payroll') * market * (over ? 1.3 : 1),
      ...(kept ? { line: own } : {}),
    });
  };
  if (who === 'win-now' && pay > line) payrollGoal(cap.firstApron, 'Stay under the first apron', 'Get under the first apron');
  else if (pay > line * 0.94) payrollGoal(line, 'Stay under the luxury tax', 'Get under the luxury tax');
  else {
    const s = revenueScale(league);
    // a roster that should lose draws smaller crowds game by game; one that should win earns playoff gates at the
    // end. The season's end money (revenue sharing, the floor, playoff gates, tax payouts) all lands after a
    // mid-season start, so none of it is prorated. The target is the budget at the league's standard levers
    // (see seasonBudget), so the price and the budgets the night he sets it don't move it; the projection
    // reads the team's own, so what the coach does with them shows in it.
    const wins = (expected >= o.left / 2 ? PROFIT_PER_WIN : PROFIT_PER_LOSS) * (expected - o.left / 2) * s;
    const split = (b: { op: number; share: number; floor: number }) => ({ op: b.op + Math.min(0, wins), end: b.share - b.floor + PROFIT_EXTRA * s + Math.max(0, wins) });
    const std = split(seasonBudget(league, tid, true));
    const { op, end } = split(seasonBudget(league, tid));
    const target = round500((opening ? profit(league, tid) : 0) + std.op + std.end + PROFIT_NUDGE[who] * share * s);
    const words = target >= 500 ? `Turn a ${money(target)} profit` : target > -500 ? 'Break even' : `Keep the loss under ${money(-target)}`;
    goals.push({ kind: 'profit', title: opening ? words : `${words} the rest of the way`, target, weight: lean('profit') * market, perGame: op / o.left, end });
  }
  normalize(goals);
  return base;
}

/**
 * A goal as the preseason shows it before the owner sets it on opening night, its figure an estimate
 * ("Win about 32 games"): the league's other rosters still change before the opener (their cuts and
 * signings), and that moves his read of this one by a win or so.
 */
export function previewTitle(g: Pick<OwnerGoal, 'kind' | 'title' | 'target'>): string {
  switch (g.kind) {
    case 'wins':
      return `Win about ${g.target} games`;
    case 'profit':
      return g.title.replace(/^Turn a (\S+) profit$/, 'Turn a profit of about $1').replace(/^Keep the loss under /, 'Keep the loss under about ');
    case 'youth':
      return g.title.replace(/: ([\d,]+) minutes/, ': about $1 minutes');
    default:
      return g.title;
  }
}

/** A postseason goal's level as a cell's short label ("Play-in 21%"). */
const LEVEL_SHORT = ['Postseason', 'Play-in', 'Playoffs', 'Round 2', 'Conf. finals', 'Finals', 'Title'];

/**
 * The season forecast's chance at the owner's postseason goal while he has one, labelled by it
 * ("Play-in": the top six or the play-in, 21%), else at the postseason (the playoffs, through the
 * play-in too). `sure`: a place clinched that meets it. Today's cell had
 * shown "Postseason 9%" (making the playoffs) under a goal of reaching the play-in, about 21%.
 */
export function goalChance(league: League, o: TeamOdds): { label: string; p: number; sure: boolean } {
  const g = currentGoals(league)?.goals.find((x) => x.kind === 'postseason');
  const level = g ? clamp(g.target, 1, 6) : 2;
  const p = level === 1 ? o.top6 + o.playIn : o.reach[level - 2];
  return { label: g ? LEVEL_SHORT[level] : LEVEL_SHORT[0], p, sure: o.clinched && level <= 2 };
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
      ...goalsWhy(og),
      `${who === 'win-now' ? 'I want results.' : who === 'frugal' ? 'Every dollar counts.' : "I'm patient, but I'm watching."} I'll check in once a month.`,
    ].join('\n'),
    tone: 'neutral',
    link: '/office/owner',
  });
}

const SEASONS_WORD = ['no', 'one', 'two', 'three', 'four'];
const ORDINAL_WORD = ['', 'first', 'second', 'third', 'fourth'];

/** The owner's reasons, a line each: what he pays for, his floor, and the rebuild clock. */
export function goalsWhy(og: OwnerGoals): string[] {
  const out: string[] = [];
  const wins = og.goals.find((g) => g.kind === 'wins');
  if (wins?.payRank) out.push(`You have the league's ${ordinalRank(wins.payRank)}-highest payroll. I expect a record to match it.`);
  if (wins?.held) out.push(`Last season I asked for ${wins.held} wins. A roster that got worse on your watch doesn't lower the bar by more than ${WIN_SLIDE}.`);
  // a payroll line past the tax: the tax up to it is his to pay (see books.ts sanctionedTax)
  const pg = og.goals.find((g) => g.kind === 'payroll');
  if (pg?.line !== undefined) out.push("You inherited this payroll, past my line, and I won't hold its tax against you on the books. Add to it and that's on you.");
  else if (pg && /first apron/.test(pg.title))
    out.push("I'll pay the luxury tax for a contender up to the first apron, and it won't count against you on the books. Past the apron, it's on you.");
  if (og.rebuild?.over)
    out.push(
      `${og.rebuild.year - 1 === 1 ? 'One season' : `${og.rebuild.year - 1} seasons`} without the postseason is all I'll take. This season we compete: miss the play-in and it grades ${grade100(patienceCap(og, 0))} at best, whatever else goes right.`,
    );
  else if (og.rebuild) {
    const { year, of } = og.rebuild;
    const n = SEASONS_WORD[of] ?? String(of);
    out.push(
      year <= 1
        ? `I'll give you ${n} season${of === 1 ? '' : 's'} without the playoffs. After that, I want the play-in.`
        : year >= of
          ? `This is the last of the ${n} seasons without the playoffs I'll give you. After that, I want the play-in.`
          : `I'll give you ${n} seasons without the playoffs, and this is the ${ORDINAL_WORD[year] ?? ordinalRank(year)}. After that, I want the play-in.`,
    );
  } else if (og.missed) {
    const { seasons: n, of } = og.missed;
    out.push(
      `${n === 1 ? 'Last season' : `The last ${n} seasons`} went without the postseason, ${n === 1 ? 'one' : n} of the ${of} I'll allow. ${of - n === 1 ? 'Miss it again' : `${of - n} more`} and I want the play-in at least.`,
    );
  }
  // (the floor is said when it's near: a rebuild, or a win goal within ten wins of it)
  const near = og.floor !== undefined && (!!og.rebuild || (wins && wins.target <= og.floor * og.games + 10));
  if (near) out.push(`Whatever the plan, under ${Math.round(og.floor! * og.games)} wins${og.from ? ` of the ${og.games}` : ''} is a failed season.`);
  return out;
}

// ---------------------------------------------------------------- conceding a season

/** What telling the owner the season is a rebuild costs the standing, at once. */
export const CONCEDE_COST = 0.1;

/** Why the user can't tell the owner this season is a rebuild now, or null. */
export function concedeBlockedReason(league: League): string | null {
  const og = currentGoals(league);
  if (!og || league.phase !== 'regular') return 'There is no season to give up on.';
  if (league.day > league.tradeDeadlineDay) return "The deadline has passed: there's nothing left to sell. Play it out.";
  if (!og.goals.some((g) => g.kind === 'postseason')) return 'He already expects a rebuild this season.';
  const run = rebuildRun(league, og.tid);
  const of = preset(league).rebuildSeasons;
  if (run >= of) return `He has given you ${run === 1 ? 'a season' : `${run} seasons`} without the postseason already: he wants the play-in.`;
  return null;
}

/**
 * The user tells the owner this season is a rebuild (concedeBlockedReason has passed): the
 * postseason goal gives way to a development goal for the games left (its weight with it, or added
 * to one he already has), the season counts on the rebuild clock, and the standing takes
 * CONCEDE_COST at once. The win goal and the floor stand.
 */
export function concedeSeason(league: League) {
  const og = currentGoals(league)!;
  const post = og.goals.find((g) => g.kind === 'postseason')!;
  addYouthWeight(league, og, post.weight);
  og.goals = og.goals.filter((g) => g !== post);
  og.rebuild = { year: rebuildRun(league, og.tid) + 1, of: preset(league).rebuildSeasons };
  chargeConcession(league, og);
  addInbox(league, {
    from: 'Owner',
    subject: 'A rebuilding season',
    body: `If this season is gone, I'd rather hear it from you than read it. Play the young players and sell what we can: that spares you the miss, it won't earn you anything on top. It counts as season ${og.rebuild.year} of the ${og.rebuild.of} I'll give a rebuild, and it costs you with me. The win goal stands.`,
    tone: 'neutral',
    link: '/office/owner',
  });
}

/** A concession's cost: off the standing at once, and kept off at the review (see OwnerGoals.cost). */
function chargeConcession(league: League, og: OwnerGoals) {
  og.cost = Math.round(((og.cost ?? 0) + CONCEDE_COST) * 100) / 100;
  league.ownerMood.total = Math.round(clamp(league.ownerMood.total - CONCEDE_COST, -1, 1) * 100) / 100;
}

/**
 * A development goal for the games left takes `weight` (added to the one he already has), as weight
 * conceded: it grades 0 at best (see OwnerGoal.conceded). Moved whole to minutes the coach sets
 * himself, a conceded postseason goal had turned a likely miss (−35) into close to +100: the Hawks
 * conceded at 8% odds and played the kids to a season grade of +39 where pushing graded −24.
 */
function addYouthWeight(league: League, og: OwnerGoals, weight: number) {
  const who = ownerPersonality(league, og.tid);
  const ts = thisSeason(league, og.tid);
  const left = Math.max(0, SEASON_GAMES - (ts ? ts.won + ts.lost : 0));
  const youth = og.goals.find((g) => g.kind === 'youth');
  if (youth) {
    youth.weight = Math.round((youth.weight + weight) * 100) / 100;
    youth.conceded = Math.round(((youth.conceded ?? 0) + weight) * 100) / 100;
    return;
  }
  const perGame = (0.85 * youngPerGame(league, og.tid) + 1_350 / SEASON_GAMES) * (who === 'builder' ? 1.1 : 1);
  const target = Math.max(100, round100(youngMinutes(league, og.tid) - (og.from?.youth ?? 0) + perGame * left));
  og.goals.push({
    kind: 'youth',
    title: `Play your young players: ${target.toLocaleString('en-US')} minutes for players ${YOUNG_AGE} or under`,
    target,
    weight,
    perGame,
    conceded: weight,
  });
}

// ---------------------------------------------------------------- the floor in danger

/** How far the owner lowers this season's floor when told it's a development year (once a season). */
export const FLOOR_EASE = 0.1;
/** The share of the wins goal's weight a development year moves to playing the young players. */
const EASE_WEIGHT = 0.4;

/**
 * The season heading under the owner's floor: the wins the pace so far projects (blended with his
 * read of the roster, as the wins goal projects them), against the floor's wins. Null when it isn't:
 * no floor, fewer than FLOOR_GAMES played, or on pace to clear it.
 */
export function floorDanger(league: League): { projected: number; floorWins: number } | null {
  const og = currentGoals(league);
  if (!og || og.floor === undefined || league.phase !== 'regular') return null;
  const ts = thisSeason(league, og.tid);
  const gp = (ts ? ts.won + ts.lost : 0) - (og.from ? og.from.won + og.from.lost : 0);
  if (gp < FLOOR_GAMES) return null;
  const won = (ts?.won ?? 0) - (og.from?.won ?? 0);
  const left = Math.max(0, og.games - gp);
  const w = gp / (gp + PACE_PRIOR);
  const read = og.goals.find((g) => g.kind === 'wins')?.perGame ?? won / gp;
  const projected = Math.round(won + left * (w * (won / gp) + (1 - w) * read));
  const floorWins = Math.ceil(og.floor * og.games);
  return projected < floorWins ? { projected, floorWins } : null;
}

/** Why the user can't tell the owner this is a development year now, or null. */
export function easeFloorBlockedReason(league: League): string | null {
  const og = currentGoals(league);
  if (!og || og.floor === undefined || league.phase !== 'regular') return 'There is no season to give up on.';
  if (league.day > league.tradeDeadlineDay) return "The deadline has passed: there's nothing left to sell. Play it out.";
  if (og.eased) return 'He has eased the floor once this season already.';
  const run = rebuildRun(league, og.tid);
  if (og.rebuild?.over || run >= preset(league).rebuildSeasons)
    return `He has given you ${run === 1 ? 'a season' : `${run} seasons`} without the postseason already: he wants wins, not patience.`;
  return null;
}

/**
 * The user tells the owner this is a development year (easeFloorBlockedReason has passed): the
 * floor drops FLOOR_EASE for this season, EASE_WEIGHT of the wins goal goes to playing the young
 * players, the season counts on the rebuild clock, and the standing takes CONCEDE_COST at once.
 */
export function easeFloor(league: League) {
  const og = currentGoals(league)!;
  og.floor = Math.max(0, Math.round((og.floor! - FLOOR_EASE) * 1000) / 1000);
  og.eased = true;
  const wins = og.goals.find((g) => g.kind === 'wins');
  if (wins) {
    const moved = Math.round(wins.weight * EASE_WEIGHT * 100) / 100;
    wins.weight = Math.round((wins.weight - moved) * 100) / 100;
    addYouthWeight(league, og, moved);
  }
  og.rebuild ??= { year: rebuildRun(league, og.tid) + 1, of: preset(league).rebuildSeasons };
  chargeConcession(league, og);
  addInbox(league, {
    from: 'Owner',
    subject: 'A development year',
    body: `Fine: play the kids and take the lottery odds. Under ${Math.ceil(og.floor * og.games)} wins is still a failed season, and it costs you with me. It counts as season ${og.rebuild.year} of the ${og.rebuild.of} I'll give a rebuild.`,
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
  /** No game counts yet: the status is the owner's read of the roster against his own goal ("Behind his read"). */
  before?: true;
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
    case 'youth': {
      // minutes the coach hands out himself: short of the target costs down to −100, past it earns
      // YOUTH_TOP at most, and the weight a concession moved here nothing (see OwnerGoal.conceded)
      const raw = clamp((result - g.target) / Math.max(1_000 * span, 0.5 * g.target), -1, 1);
      const moved = clamp(g.conceded ?? 0, 0, g.weight);
      return g.weight > 0 ? r2(((g.weight - moved) * Math.min(raw, YOUTH_TOP) + moved * Math.min(raw, 0)) / g.weight) : r2(Math.min(raw, YOUTH_TOP));
    }
  }
}

/** A grade (−1..1) as the owner says it: "−40", "+12". */
const grade100 = (g: number) => `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(Math.round(g * 100))}`;

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
  // before a game counts, nothing is ahead yet; a goal over his own read of the roster is behind it
  // already, and says so (a payroll over its line already is behind)
  return regular && gp === 0
    ? rows.map((p) =>
        p.goal.kind === 'payroll' || p.status === 'met' || p.status === 'missed' ? p : { ...p, status: p.status === 'behind' ? 'behind' : 'on track', before: true },
      )
    : rows;
}

/** The regular-season record the goals cover (since they were set). */
export function goalsRecord(league: League, og: OwnerGoals): { won: number; games: number } {
  const ts = league.teams[og.tid]?.seasons.find((s) => s.season === og.season);
  const won = (ts?.won ?? 0) - (og.from?.won ?? 0);
  return { won, games: won + (ts?.lost ?? 0) - (og.from?.lost ?? 0) };
}

/** The least a season's grade can be with a championship ('title'), or a postseason two rounds past the goal ('run'): Excellent either way. */
export const CROWN_GRADE: Record<'title' | 'run', number> = { title: 0.5, run: 0.4 };

/**
 * The season's goals graded: each one's result and grade, and the season's grade by weight, held
 * under the floor's cap when the record fell under it (`floored`: it did, and the cap bit) or under
 * the rebuild clock's when a season past his allowance missed the postseason (`impatient`, see
 * patienceCap), and lifted to CROWN_GRADE by a title or a postseason two rounds past the goal
 * (`crowned`): what a season is remembered for, whatever the money goals did (the books can still
 * hold it down: see booksVerdict).
 */
export function gradeOwnerGoals(league: League, og: OwnerGoals): { goals: OwnerReview['goals']; grade: number; floored?: true; impatient?: true; crowned?: 'title' | 'run' } {
  const goals = og.goals.map((g) => {
    const result = goalResult(league, og, g);
    // (the plan's per-game numbers were for the in-season projection only)
    return { kind: g.kind, title: g.title, target: g.target, weight: g.weight, result, grade: gradeGoal(league, og, g, result), ...(g.edge !== undefined ? { edge: g.edge } : {}) };
  });
  const sum = goals.reduce((a, g) => a + g.weight * g.grade, 0);
  const rec = goalsRecord(league, og);
  const level = postseasonLevel(thisSeason(league, og.tid));
  const floor = floorCap(og, rec.won, rec.games);
  const patience = patienceCap(og, level);
  const cap = Math.min(floor, patience);
  const post = og.goals.find((g) => g.kind === 'postseason');
  const crowned = level >= 6 ? 'title' : post && level - post.target >= 2 ? 'run' : undefined;
  const grade = Math.round(Math.max(Math.min(sum, cap), crowned ? CROWN_GRADE[crowned] : -1) * 100) / 100;
  // (whichever cap held it lowest is the one the review names)
  const bit = cap < sum && !crowned;
  return {
    goals,
    grade,
    ...(bit && floor <= patience ? { floored: true as const } : {}),
    ...(bit && patience < floor ? { impatient: true as const } : {}),
    ...(crowned ? { crowned } : {}),
  };
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
 * has fallen clearly off pace after PACE_GAMES games (once; important, stopping a sim, only when
 * this season's review could fire the coach), and a check-in at the All-Star break
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
      // (it stops a sim only when this season's review could cost him his job)
      important: canBeFired(league),
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
