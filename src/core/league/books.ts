// The owner and the books: the user's cash (Team.cash, every season's profit and loss since the
// league began, the luxury tax included) has consequences once it's in the red. The owner judges one
// measure, the cash the day the regular season's books close (after revenue sharing and that
// season's luxury tax: see closeBooks): the playoff gates that come after are his bonus, not the
// coach's cover, so a warned contender can't be bailed out by a deep run. The steps move only at
// his season review, on that close: in the red, no word or a warning becomes an ultimatum; still in
// the red at a later review, the budget is frozen (the staff and facilities budgets cut to the
// league's standard and held there, and the payroll can't grow past minimum deals: no raises on a
// re-signing, an extension, a qualifying offer or a matched offer sheet, no waiver claim on more than
// a minimum, no trade that takes on salary or sends cash). A season played frozen that closes in the
// red grades FREEZE_GRADE at best, a title or not; deeper in the red than at the last review, the
// freeze didn't stop the bleeding: a final warning (BLEED_GRADE at best), and the next review deeper
// still gets the coach fired (with job security on), whatever he won. Past DEBT_LIMIT the owner skips
// the final warning. A review in the black lifts it all. In season, from WARN_DAYS before the trade
// deadline (when the projection means something and there are still deals to make), the day the
// close projects WARN_RED or more into the red (seasonEndCash), the owner warns him, once a season.
// Each step is a staff call on Today (see calls.ts), which stops a long sim; the owner's mail says it
// in his words. Nothing here draws from the league's random stream.
import type { League } from '../types';
import { addInbox, curTeamSeason, revenueScale } from './helpers';
import { PROJECT_HOME_GAMES, seasonEndCash } from './finances';
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

/** What follows the next review deeper in the red, under the freeze, in the owner's words. */
const nextTime = (league: League, final: boolean) =>
  final
    ? league.settings.jobSecurity
      ? "Deeper in the red when next season's books close and you're done here, whatever you win."
      : `Deeper in the red when next season's books close and that season grades ${grade100(BLEED_GRADE)} at best too.`
    : "Deeper in the red when next season's books close, and that's your final warning.";

const grade100 = (g: number) => `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(Math.round(g * 100))}`;

function step(league: League, stage: BooksStage, close?: number) {
  league.books = { stage, tid: league.userTid, season: league.season, day: league.day, ...(close !== undefined ? { close } : {}) };
  const team = league.teams[league.userTid];
  if (stage === 'warning') {
    const p = seasonEndCash(league, league.userTid);
    addInbox(league, {
      from: 'Owner',
      subject: 'The books are heading into the red',
      body: `At this rate the regular season's books close ${money(-p.end)} in the red${p.tax > 0 ? `, after a ${money(p.tax)} luxury tax bill` : ''}. That comes out of my pocket, and playoff money won't cover it: I judge the books when the regular season ends. Payroll, the tax and the budgets are where the money goes. Fix it before the deadline, or we'll have a harder conversation at the review.`,
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
      body: `The regular season's books closed ${red} in the red, luxury tax and all. The playoff gates are my bonus, not your cover. Back in the black when next season's books close, or I freeze the budget: minimum deals only, no raises, no taking on salary, and the staff budgets cut to the league standard.`,
      tone: 'bad',
      link: '/office/finances',
    });
  else if (stage === 'freeze') {
    // the cut: budgets over the standard come down to it
    for (const k of ['coaching', 'health', 'facilities'] as const) team.budget[k] = Math.min(team.budget[k], FROZEN_BUDGET);
    addInbox(league, {
      from: 'Owner',
      subject: 'The budget is frozen',
      body: `The books closed ${red} in the red again, and I warned you. The budget is frozen until a season's books close in the black: minimum deals only, no raises (re-signing, extending, qualifying or matching an offer sheet), no trade that takes on salary or sends cash, and the staff and facilities budgets cut to the league standard. ${nextTime(league, false)}`,
      tone: 'bad',
      link: '/office/finances',
    });
  } else
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: 'The books: a final warning',
      body: `Frozen, and the books still closed ${red} in the red, deeper than last season. The freeze stands, and no title pays for this: this season grades ${grade100(BLEED_GRADE)} at best. ${nextTime(league, true)}`,
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
  if (league.fired || !warnWindow(league) || booksOf(league)) return;
  const ts = curTeamSeason(league, league.userTid);
  if (ts.homeWon + ts.homeLost < PROJECT_HOME_GAMES) return;
  if (seasonEndCash(league, league.userTid).end < -WARN_RED * revenueScale(league)) step(league, 'warning');
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
}

/**
 * What the season's review will do about the books, on the regular season's close: in the black,
 * any step lifts; in the red, no step or a warning becomes an ultimatum, an ultimatum from an earlier
 * season a freeze; a season played frozen grades FREEZE_GRADE at best, and closed deeper in the red
 * than at the last review it gets the final warning (BLEED_GRADE at best), past DEBT_LIMIT or after
 * a final warning the sack. Null when there's nothing to say (in the black with no step, or fired).
 * Reads the league only.
 */
export function booksVerdict(league: League): BooksVerdict | null {
  if (league.fired) return null;
  const b = booksOf(league);
  const close = closedCash(league, league.userTid);
  if (close >= 0) return b ? { close, stage: null } : null;
  if (!b || b.stage === 'warning') return { close, stage: 'ultimatum' };
  // (a step this review has taken already stands)
  if (b.season >= league.season) return { close, stage: b.stage };
  if (b.stage === 'ultimatum') return { close, stage: 'freeze' };
  if (b.close === undefined || close >= b.close) return { close, stage: b.stage, cap: FREEZE_GRADE };
  const fire = b.stage === 'final' || close < -DEBT_LIMIT * revenueScale(league);
  return { close, stage: 'final', cap: BLEED_GRADE, deeper: true, ...(fire ? { fire: true as const } : {}) };
}

/** At the season's review: the books take the step the verdict says (see booksVerdict), and the owner says so when it changes. */
export function booksReview(league: League, v: BooksVerdict | null = booksVerdict(league)) {
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
  if (b && b.stage === v.stage && b.season >= league.season) return;
  // a frozen season that didn't dig deeper stands as it is: the review says so (see booksLine)
  if (b && b.stage === v.stage && b.stage !== 'warning') {
    league.books = { ...b, season: league.season, day: league.day, close: v.close };
    return;
  }
  step(league, v.stage, v.close);
}

/** The review's line about the books when they hold its grade (`grade`, before them) down, or null. */
export function booksLine(v: BooksVerdict | null, grade: number): string | null {
  if (!v || v.cap === undefined || grade <= v.cap) return null;
  return v.deeper
    ? `The books closed ${money(-v.close)} in the red under the freeze, deeper than last season: whatever we won, this season grades ${grade100(v.cap)} at best.`
    : `The books closed ${money(-v.close)} in the red under the freeze: whatever we won, this season grades ${grade100(v.cap)} at best until they're back in the black.`;
}

/** The least a frozen signing, re-signing or match may pay: his minimum, or what he's paid now (no raise on it). */
const most = (now: number, min: number) => Math.max(now, min);

/** Why a signing at `amount` a season is off under a freeze (more than `min`, the least he could be paid), or null. */
export function freezeSigningReason(league: League, amount: number, min: number): string | null {
  return frozen(league) && amount > min + 1 ? `The budget is frozen while the books are in the red: minimum deals only (${money(min)}).` : null;
}

/**
 * Why paying one of his own players `amount` a season is off under a freeze (re-signing him,
 * extending him, qualifying him or matching an offer sheet he signed): more than he's paid now
 * (`now`) and more than his minimum (`min`), or null. `what` names the deal ("re-signing").
 */
export function freezeResignReason(league: League, amount: number, now: number, min = 0, what = 'a new deal'): string | null {
  if (!frozen(league) || amount <= most(now, min) + 1) return null;
  return `The budget is frozen while the books are in the red: no raises, and ${what} at ${money(amount)} is one (he's paid ${money(now)} now${min > now ? `, his minimum is ${money(min)}` : ''}).`;
}

/** Why a trade that takes in `incoming` and sends out `outgoing` of this contract season's salary, and `cash` in cash, is off under a freeze, or null. */
export function freezeTradeReason(league: League, incoming: number, outgoing: number, cash = 0): string | null {
  if (!frozen(league)) return null;
  if (incoming > outgoing)
    return `The budget is frozen while the books are in the red: a trade can't take on more salary than it sends out (this one takes on ${money(incoming - outgoing)}).`;
  return cash > 0 ? 'The budget is frozen while the books are in the red: no cash goes out in a trade.' : null;
}
