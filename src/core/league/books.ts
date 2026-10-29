// The owner and the books: the user's cash (Team.cash, every season's profit and loss since the
// league began, the luxury tax included) has consequences once it's in the red. The owner judges one
// measure, the cash the day the regular season's books close (after revenue sharing and that
// season's luxury tax: see closeBooks), with the luxury tax he signed off on taken back out (a
// win-now owner's payroll goal lets a contender pay the tax up to the first apron: see
// sanctionedTax), so the goals and the books tell one money story: a contender that pays the tax the
// owner asked for isn't frozen or fired over it, and spending past his line still is. The playoff
// gates that come after are his bonus, not the coach's cover, so a warned contender can't be bailed
// out by a deep run (they are in the cash the next season's close reads). The steps move only at
// his season review, on that close: in the red, no word or a warning becomes an ultimatum (the first
// close of a payroll the coach inherited, in his first season in charge, only a warning); still in
// the red at a later review, the budget is frozen (the staff and facilities budgets cut to the
// league's standard and held there, and the payroll can't grow past minimum deals: no raises on a
// re-signing, an extension, a qualifying offer or a matched offer sheet, no waiver claim on more than
// a minimum, no trade that takes on salary or sends cash). A season played frozen that closes in the
// red grades FREEZE_GRADE at best, a title or not; deeper in the red than at the last review, the
// freeze didn't stop the bleeding: a final warning (BLEED_GRADE at best), and the next review deeper
// still gets the coach fired (with job security on), whatever he won. The size of the hole counts:
// a close past DEBT_LIMIT, dug deeper on the coach's watch, goes straight to the freeze, and under
// the freeze skips the final warning; and past the limit a title doesn't lift the season's grade
// (see ownerEvaluation). A review in the black lifts it all. In season, from WARN_DAYS before the
// trade deadline (when the projection means something and there are still deals to make), the day the
// close projects WARN_RED or more into the red (seasonEndCash), the owner warns him, once a season.
// Each step is a staff call on Today (see calls.ts), which stops a long sim; the owner's mail says it
// in his words. Nothing here draws from the league's random stream.
import type { League } from '../types';
import { CAP_FOR, addInbox, curTeamSeason, payroll, revenueScale } from './helpers';
import { PROJECT_HOME_GAMES, seasonEndCash, teamTaxBill } from './finances';
import { graceLeft } from './jobSecurity';
import { forcedPayroll } from './ownerGoals';
import { money } from '../format';

export type BooksStage = 'warning' | 'ultimatum' | 'freeze' | 'final';

/** Where the user's books stand with the owner (League.books): the step, and when it was taken. */
export interface Books {
  stage: BooksStage;
  tid: number;
  season: number;
  day: number;
  /** The regular season's close ($K) at the review that last read the books (none on a warning, or in a save from before it was kept). */
  close?: number;
  /** The step came straight from a close past the debt limit (see booksVerdict), not up the ladder. */
  debt?: true;
}

/** How far into the red (first-season $K) the regular season's close must project for the owner's warning. */
export const WARN_RED = 5_000;
/**
 * Days before the trade deadline the warning (and its call) opens: the projected close for a payroll
 * the user hasn't moved is within $3.2M on average by then (90 team-seasons of the real league), against
 * $5.5M in the season's second week, when the projection is the size of the warning itself and the
 * summer's signings can't be traded yet (until December 15); and three weeks of deals are left.
 */
export const WARN_DAYS = 21;
/** The staff and facilities budgets a freeze cuts to (the league's standard: 50). */
export const FROZEN_BUDGET = 50;
/** The most a season played under the freeze can grade when its books close in the red (a title lifts it no further). */
export const FREEZE_GRADE = 0;
/** ...and when they close deeper in the red than at the last review: the freeze didn't stop the bleeding (Poor). */
export const BLEED_GRADE = -0.4;
/**
 * The debt (first-season $K, grown with the cap) the owner carries at most: a frozen season that
 * closes deeper in the red past it skips the final warning. About a season of the national TV money.
 * (AI-run teams answer to no owner, and a few run past it: 13 of 290 AI team-seasons over ten seasons
 * of the real league. A coach who takes one over still gets the ultimatum and the freeze first, and
 * the limit only bites if the hole keeps getting deeper on his watch.)
 */
export const DEBT_LIMIT = 150_000;

/** The user's books, if the owner has a word about them (none for a fired coach or another team's). */
export function booksOf(league: League): Books | undefined {
  const b = league.books;
  return b && b.tid === league.userTid && !league.fired ? b : undefined;
}

/** The budget is frozen (the final warning is a freeze too). */
export const frozen = (league: League) => {
  const s = booksOf(league)?.stage;
  return s === 'freeze' || s === 'final';
};

/** Whether the warning's window is open: the regular season's last WARN_DAYS days before the trade deadline, deadline day included. */
export const warnWindow = (league: League) => league.phase === 'regular' && league.day <= league.tradeDeadlineDay && league.tradeDeadlineDay - league.day <= WARN_DAYS;

/**
 * The regular season's books close (after revenue sharing and the luxury tax): every team's cash
 * then, what the owner's review of the season reads (TeamSeason.closeCash).
 */
export function closeBooks(league: League) {
  for (const t of league.teams) curTeamSeason(league, t.tid).closeCash = Math.round(t.cash);
}

/** Team `tid`'s cash when this season's regular-season books closed (before then, or in a save from before it was kept: its cash now). */
export function closedCash(league: League, tid: number): number {
  return curTeamSeason(league, tid).closeCash ?? league.teams[tid].cash;
}

/**
 * What this season's payroll goal signs off on ($K), on its payroll as assessed at the end of the
 * regular season (before then, today's): the luxury tax up to its target (a win-now owner's first
 * apron, or the payroll the coach inherited past the owner's line: see planOwnerGoals), and the
 * inherited payroll's salary past the owner's own line (OwnerGoal.line). None without a payroll goal,
 * or with one at the tax line itself. The inherited payroll is the one the goal was set on
 * (OwnerGoal.inherited), so only the payroll itself falling brings it down: read off the contracts
 * still inherited today, swapping an inherited star for one on the same salary had wiped a $61M
 * sign-off (Jokić for Tatum: "on track" on the goal, a warning on the books, the review found,
 * round 3).
 */
function allowedThisSeason(league: League, tid: number): number {
  const og = league.ownerGoals;
  if (!og || og.season !== league.season || og.tid !== tid) return 0;
  const g = og.goals.find((x) => x.kind === 'payroll');
  if (!g) return 0;
  const tax = CAP_FOR(league).luxuryTax;
  const own = g.line ?? Math.max(tax, g.target);
  const pay = curTeamSeason(league, tid).payroll || payroll(league, tid);
  // (an inherited payroll's: what is still inherited of it, not the room its goal leaves on top, see PAYROLL_SLACK)
  const upTo = Math.min(pay, g.target, g.line !== undefined ? (g.inherited ?? forcedPayroll(league, tid)) : Infinity);
  return teamTaxBill(league, tid, upTo) + Math.max(0, upTo - own);
}

/**
 * What the owner signed off on since the coach took over ($K), which the books don't count against
 * him: the luxury tax up to his payroll goal's line, and the payroll the coach inherited past it
 * (see allowedThisSeason), each reviewed season's (TeamSeason.signedOff, kept at the review) and this
 * season's while it's still to be reviewed. Without it the two money stories disagreed: a win-now
 * owner's goal said "stay under the first apron" and the season met it, while the tax it paid took
 * the books into the red and brought an ultimatum, then a freeze (the 76ers on Hard, the review
 * found); and the real league's Thunder, back-to-back champions on the extensions they signed before
 * the coach arrived, went warning, ultimatum, freeze under every owner.
 */
export function sanctionedTax(league: League, tid = league.userTid): number {
  const from = league.tenureStart ?? league.startSeason;
  let sum = 0;
  let current = false;
  for (const ts of league.teams[tid].seasons) {
    if (ts.season < from || ts.signedOff === undefined) continue;
    sum += ts.signedOff;
    if (ts.season === league.season) current = true;
  }
  return sum + (current ? 0 : allowedThisSeason(league, tid));
}

/**
 * The books as the owner reads them (the coach's own: tid is the user's): the cash his review will
 * judge, as it projects now (`judged`: the regular season's projected close, see seasonEndCash,
 * with the tax he signed off on taken back out; the playoff gates still to come aren't in it), the
 * projected close itself (`end`) and the tax he signed off on (`sanctioned`). Reads the league only.
 */
export function booksOutlook(league: League): { end: number; judged: number; sanctioned: number; tax: number } {
  const p = seasonEndCash(league, league.userTid);
  const sanctioned = sanctionedTax(league);
  return { end: p.end, judged: p.end + sanctioned, sanctioned, tax: p.tax };
}

/** The coach's first season in charge (a new career or a new job): the payroll and the books are the ones he inherited. */
const inherited = (league: League) => league.season - (league.tenureStart ?? league.startSeason) + 1 <= 1;

/** The phases after the season's review: the review that next reads the books is next season's. */
const AFTER_REVIEW: ReadonlySet<League['phase']> = new Set(['draftLottery', 'draft', 'resign', 'freeAgency']);

/** Whether the review that next reads the books can fire the coach: job security on and his grace period over (`next`: next season's review). */
export function reviewCanFire(league: League, next = AFTER_REVIEW.has(league.phase)): boolean {
  return league.settings.jobSecurity && graceLeft(league, next) === 0;
}

/**
 * What closing deeper in the red than at the last review brings under the freeze (see booksVerdict):
 * the sack after the final warning, or past DEBT_LIMIT (`fire`), else the final warning. Null when
 * the budget isn't frozen. `limit`: the debt limit ($K, grown with the cap).
 */
export function deeperMeans(league: League): { fire: boolean; closed: number; limit: number } | null {
  const b = booksOf(league);
  if (!b || (b.stage !== 'freeze' && b.stage !== 'final')) return null;
  const closed = b.close ?? league.teams[league.userTid].cash;
  const limit = DEBT_LIMIT * revenueScale(league);
  // (closed at the limit already, any close deeper is past it)
  return { fire: b.stage === 'final' || closed <= -limit, closed, limit };
}

/**
 * What the next close deeper in the red than the last review's brings under the freeze, in a
 * sentence: the final warning (and past the debt limit the sack), or the sack itself; with job
 * security off or in the grace period, the season's cap instead. `nextSeason`: the close is next
 * season's (between seasons); `owner`: in the owner's own words, else the screens'. Empty when the
 * budget isn't frozen.
 */
export function deeperText(league: League, nextSeason = AFTER_REVIEW.has(league.phase), owner = false): string {
  const d = deeperMeans(league);
  if (!d) return '';
  const next = nextSeason ? "when next season's books close" : 'when the books close';
  const can = reviewCanFire(league, nextSeason);
  const closed = money(-d.closed);
  const fired = owner ? "you're done here, whatever you win" : "you're fired, whatever you win";
  const capped = `that season grades ${grade100(BLEED_GRADE)} at best`;
  if (owner)
    return d.fire
      ? `Deeper in the red ${next} and ${can ? fired : `${capped} too`}.`
      : `Deeper in the red ${next}, and that's your final warning. ${can ? `Past ${money(d.limit)} in the red, ${fired}.` : `That season grades ${grade100(BLEED_GRADE)} at best.`}`;
  return d.fire
    ? `Deeper in the red than ${closed} ${next}, and ${can ? fired : `${capped} too`}.`
    : `Deeper in the red than ${closed} ${next} brings his final warning. ${can ? `Past ${money(d.limit)} in the red, deeper gets you fired.` : `That season grades ${grade100(BLEED_GRADE)} at best.`}`;
}

const grade100 = (g: number) => `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(Math.round(g * 100))}`;

function step(league: League, stage: BooksStage, close?: number, debt = false) {
  league.books = { stage, tid: league.userTid, season: league.season, day: league.day, ...(close !== undefined ? { close } : {}), ...(debt ? { debt: true as const } : {}) };
  const team = league.teams[league.userTid];
  if (stage === 'warning' && close !== undefined) {
    // at the review, the first close of an inherited payroll: a warning, not yet an ultimatum
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: 'The books: a warning',
      body: `The regular season's books closed ${money(-close)} in the red, luxury tax and all. You inherited that payroll, so this time it's a warning. Back in the black when next season's books close, or it's an ultimatum.`,
      tone: 'bad',
      link: '/office/finances',
    });
    return;
  }
  if (stage === 'warning') {
    const p = booksOutlook(league);
    addInbox(league, {
      from: 'Owner',
      subject: 'The books are heading into the red',
      body: `At this rate the regular season's books close ${money(-p.judged)} in the red${p.tax > 0 ? `, after a ${money(p.tax)} luxury tax bill` : ''}.${p.sanctioned > 0 ? ` The ${money(p.sanctioned)} of tax I signed off on doesn't count against you.` : ''} That comes out of my pocket. I judge the books when the regular season ends, so playoff money won't cover it. Payroll, the tax and the budgets are where the money goes. Fix it before the deadline, or we'll have a harder talk at the review.`,
      tone: 'bad',
      link: '/office/finances',
    });
    return;
  }
  const red = money(-(close ?? team.cash));
  if (stage === 'ultimatum')
    addInbox(league, {
      from: 'Owner',
      subject: 'The books: an ultimatum',
      body: `The regular season's books closed ${red} in the red, luxury tax and all. The playoff gates are my bonus, not your cover. Be back in the black when next season's books close, or I freeze the budget. That means minimum deals only, no raises, no taking on salary, and staff budgets cut to the league standard.`,
      tone: 'bad',
      link: '/office/finances',
    });
  else if (stage === 'freeze') {
    // the cut: budgets over the standard come down to it
    for (const k of ['coaching', 'health', 'facilities'] as const) team.budget[k] = Math.min(team.budget[k], FROZEN_BUDGET);
    addInbox(league, {
      ...(debt ? { important: true } : {}),
      from: 'Owner',
      subject: 'The budget is frozen',
      body: `${debt ? `The books closed ${red} in the red, past the ${money(DEBT_LIMIT * revenueScale(league))} I'll carry. A hole that size doesn't get an ultimatum first.` : `The books closed ${red} in the red again, and I warned you.`} The budget is frozen until a season's books close in the black. Minimum deals only, and no raises for your own players. No trade that takes on salary or sends cash. The staff and facilities budgets drop to the league standard. ${deeperText(league, true, true)}`,
      tone: 'bad',
      link: '/office/finances',
    });
  } else
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: 'The books: a final warning',
      body: `Frozen, and the books still closed ${red} in the red, deeper than last season. The freeze stands, and no title pays for this. This season grades ${grade100(BLEED_GRADE)} at best. ${deeperText(league, true, true)}`,
      tone: 'bad',
      link: '/office/finances',
    });
}

/**
 * Every day of the regular season, in the warning's window (see warnWindow): a close that projects
 * WARN_RED or more into the red gets the owner's warning, once a season (and once the home games so
 * far say what a home game brings, for a team taken over late).
 */
export function booksDaily(league: League) {
  // (one warning a season: settled or not, it stands until the review, which steps it up or lifts it)
  // (a warning from last season's review, an inherited payroll's, gives way to this season's)
  const b = booksOf(league);
  if (league.fired || !warnWindow(league) || (b && !(b.stage === 'warning' && b.season < league.season))) return;
  const ts = curTeamSeason(league, league.userTid);
  if (ts.homeWon + ts.homeLost < PROJECT_HOME_GAMES) return;
  if (booksOutlook(league).judged < -WARN_RED * revenueScale(league)) step(league, 'warning');
}

/** What the season's review does about the books (see booksVerdict). */
export interface BooksVerdict {
  /** The regular season's close the review reads ($K). */
  close: number;
  /** The step the books go to, or null: they're in the black (any step lifts). */
  stage: BooksStage | null;
  /** The most the season can grade over them: played frozen and closed in the red. */
  cap?: number;
  /** Closed deeper in the red than at the last review, under the freeze. */
  deeper?: true;
  /** He's fired over them (when the review can fire him at all: see canBeFired). */
  fire?: true;
  /** The close is past the debt limit: no title lifts the season's grade (see ownerEvaluation). */
  past?: true;
  /** ...and the hole was dug deeper on his watch: no step or a warning goes straight to the freeze. */
  debt?: true;
}

/** The cash the season's review judges ($K): the regular season's close (see closeBooks), the tax the owner signed off on taken back out (see sanctionedTax). */
export function reviewClose(league: League): number {
  return Math.round(closedCash(league, league.userTid) + sanctionedTax(league));
}

/**
 * What the season's review will do about the books, on its close (see reviewClose): in the black,
 * any step lifts; in the red, no step or a warning becomes an ultimatum, an ultimatum from an earlier
 * season a freeze; a season played frozen grades FREEZE_GRADE at best, and closed deeper in the red
 * than at the last review it gets the final warning (BLEED_GRADE at best), past DEBT_LIMIT or after
 * a final warning the sack. The size of the hole moves it too: past DEBT_LIMIT (`past`: no title
 * lifts the season) and deeper than last season's close (a hole dug on his watch, not one he took
 * over), no step or a warning goes straight to the freeze (`debt`), a first season in charge
 * excepted. A passive Thunder coach had closed $182M in the red, then $1.07B, and heard "I'm
 * thrilled" on a title each time before the ladder reached the sack (the review, round 3). Null
 * when there's nothing to say (in the black with no step, or fired). Reads the league only.
 */
export function booksVerdict(league: League): BooksVerdict | null {
  if (league.fired) return null;
  const b = booksOf(league);
  const close = reviewClose(league);
  if (close >= 0) return b ? { close, stage: null } : null;
  const past = close < -DEBT_LIMIT * revenueScale(league);
  const was = league.teams[league.userTid].seasons.find((s) => s.season === league.season - 1)?.closeCash;
  const debt = past && !inherited(league) && (was === undefined || closedCash(league, league.userTid) < was);
  const big = { ...(past ? { past: true as const } : {}), ...(debt ? { debt: true as const } : {}) };
  // (a payroll he inherited: its first close in the red only warns)
  if (!b || b.stage === 'warning') return { close, stage: inherited(league) ? 'warning' : debt ? 'freeze' : 'ultimatum', ...big };
  // (a step this review has taken already stands)
  if (b.season >= league.season) return { close, stage: b.stage, ...big };
  if (b.stage === 'ultimatum') return { close, stage: 'freeze', ...big };
  if (b.close === undefined || close >= b.close) return { close, stage: b.stage, cap: FREEZE_GRADE, ...big };
  const fire = b.stage === 'final' || past;
  return { close, stage: 'final', cap: BLEED_GRADE, deeper: true, ...(fire ? { fire: true as const } : {}), ...big };
}

/** At the season's review: the books take the step the verdict says (see booksVerdict), and the owner says so when it changes. */
export function booksReview(league: League, v: BooksVerdict | null = booksVerdict(league)) {
  // what the owner signed off on this season, kept for the seasons to come (see sanctionedTax)
  const allowed = allowedThisSeason(league, league.userTid);
  if (allowed > 0) curTeamSeason(league, league.userTid).signedOff = Math.round(allowed);
  if (!v) return;
  const b = booksOf(league);
  if (v.stage === null) {
    delete league.books;
    if (b && b.stage !== 'warning')
      addInbox(league, {
        from: 'Owner',
        subject: 'Back in the black',
        body:
          b.stage === 'ultimatum'
            ? 'The books closed in the black. The ultimatum is off. Keep it that way.'
            : "The books closed in the black, so the freeze is over. Let's keep them there.",
        tone: 'good',
        link: '/office/finances',
      });
    return;
  }
  // (an in-season warning becomes the review's, with the close, once)
  if (b && b.stage === v.stage && b.season >= league.season && (v.stage !== 'warning' || b.close !== undefined)) return;
  // a frozen season that didn't dig deeper stands as it is: the review says so (see booksLine)
  if (b && b.stage === v.stage && b.stage !== 'warning') {
    league.books = { ...b, season: league.season, day: league.day, close: v.close };
    return;
  }
  // (straight to the freeze from a close past the debt limit: the owner says why)
  step(league, v.stage, v.close, !!v.debt && v.stage === 'freeze' && (!b || b.stage === 'warning'));
}

/** The review's line about the books when they hold its grade (`grade`, before them) down, or null. */
export function booksLine(v: BooksVerdict | null, grade: number): string | null {
  if (!v || v.cap === undefined || grade <= v.cap) return null;
  return v.deeper
    ? `The books closed ${money(-v.close)} in the red under the freeze, deeper than last season. Whatever we won, this season grades ${grade100(v.cap)} at best.`
    : `The books closed ${money(-v.close)} in the red under the freeze. Until they're back in the black, a season grades ${grade100(v.cap)} at best.`;
}

/** The least a frozen signing, re-signing or match may pay: his minimum, or what he's paid now (no raise on it). */
const most = (now: number, min: number) => Math.max(now, min);

/** Why a signing at `amount` a season is off under a freeze (more than `min`, the least he could be paid), or null. */
export function freezeSigningReason(league: League, amount: number, min: number): string | null {
  return frozen(league) && amount > min + 1 ? `The budget is frozen: minimum deals only, ${money(min)}.` : null;
}

/**
 * Why paying one of his own players `amount` a season is off under a freeze (re-signing him,
 * extending him, qualifying him or matching an offer sheet he signed): more than he's paid now
 * (`now`) and more than his minimum (`min`), or null. `what` names the deal ("re-signing").
 */
export function freezeResignReason(league: League, amount: number, now: number, min = 0, what = 'a new deal'): string | null {
  if (!frozen(league) || amount <= most(now, min) + 1) return null;
  return `The budget is frozen: no raises. He's paid ${money(now)} now${min > now ? `, his minimum is ${money(min)}` : ''}, so ${what} at ${money(amount)} is one.`;
}

/** Why a trade that takes in `incoming` and sends out `outgoing` of this contract season's salary, and `cash` in cash, is off under a freeze, or null. */
export function freezeTradeReason(league: League, incoming: number, outgoing: number, cash = 0): string | null {
  if (!frozen(league)) return null;
  if (incoming > outgoing) return `The budget is frozen: a trade can't take on salary. This one adds ${money(incoming - outgoing)}.`;
  return cash > 0 ? 'The budget is frozen: no cash goes out in a trade.' : null;
}
