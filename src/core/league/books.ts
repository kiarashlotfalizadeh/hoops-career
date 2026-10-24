// The owner and the books: the user's cash (Team.cash, every season's profit and loss since the
// league began, the luxury tax included) has consequences once it's in the red, in three steps, and
// they move only at the owner's season review, on the cash the season closed with (the luxury tax
// paid): a review in the red turns no word or a warning into an ultimatum, back in the black by the
// next review; a review still in the red after it freezes the budget (the staff and facilities
// budgets cut to the league's standard and held there, and the payroll can't grow: minimum deals
// only, no raises on re-signing, no trade that takes back more salary than it sends); and a review
// in the black lifts it all. In season, the day the books project into the red at the season's end
// (seasonEndCash: the tax bill still to come included), the owner warns him, once a season, while
// there's time to do something about it. Cash that dips under zero and back between paydays moves
// nothing. Each step is a staff call on Today (see calls.ts), which stops a long sim; the owner's
// mail says it in his words. Nothing here draws from the league's random stream.
import type { League } from '../types';
import { addInbox, curTeamSeason, revenueScale } from './helpers';
import { PROJECT_HOME_GAMES, seasonEndCash } from './finances';
import { money } from '../format';

export type BooksStage = 'warning' | 'ultimatum' | 'freeze';

/** Where the user's books stand with the owner (League.books): the step, and when it was taken. */
export interface Books {
  stage: BooksStage;
  tid: number;
  season: number;
  day: number;
}

/** How far into the red (first-season $K) the season's end must project for the owner's warning. */
export const WARN_RED = 5_000;
/** The staff and facilities budgets a freeze cuts to (the league's standard: 50). */
export const FROZEN_BUDGET = 50;

/** The user's books, if the owner has a word about them (none for a fired coach or another team's). */
export function booksOf(league: League): Books | undefined {
  const b = league.books;
  return b && b.tid === league.userTid && !league.fired ? b : undefined;
}

/** The budget is frozen. */
export const frozen = (league: League) => booksOf(league)?.stage === 'freeze';

function step(league: League, stage: BooksStage) {
  league.books = { stage, tid: league.userTid, season: league.season, day: league.day };
  const team = league.teams[league.userTid];
  const cash = money(-team.cash);
  if (stage === 'warning') {
    const p = seasonEndCash(league, league.userTid);
    addInbox(league, {
      from: 'Owner',
      subject: 'The books are heading into the red',
      body: `At this rate we finish the season ${money(-p.end)} in the red${p.tax > 0 ? `, after a ${money(p.tax)} luxury tax bill` : ''}. That comes out of my pocket. Payroll, the tax and the budgets are where the money goes: fix it before the season's review, or we'll have a harder conversation.`,
      tone: 'bad',
      link: '/office/finances',
    });
  } else if (stage === 'ultimatum')
    addInbox(league, {
      from: 'Owner',
      subject: 'The books: an ultimatum',
      body: `We closed the season ${cash} in the red. Back in the black by next season's review, or I freeze the budget: minimum deals only, no raises, no taking on salary, and the staff budgets cut to the league standard.`,
      tone: 'bad',
      link: '/office/finances',
    });
  else {
    // the cut: budgets over the standard come down to it
    for (const k of ['coaching', 'health', 'facilities'] as const) team.budget[k] = Math.min(team.budget[k], FROZEN_BUDGET);
    addInbox(league, {
      from: 'Owner',
      subject: 'The budget is frozen',
      body: `${cash} in the red at a second review, and I warned you. The budget is frozen until a review finds us back in the black: minimum deals only, no raises when you re-sign anyone, no trade that takes on more salary than it sends out, and the staff and facilities budgets cut to the league standard.`,
      tone: 'bad',
      link: '/office/finances',
    });
  }
}

/**
 * Every day of the regular season: books that project WARN_RED or more into the red at the season's
 * end get the owner's warning, once a season, once the home games so far say what a home game
 * brings (an early season projects within about $6M; less than that in the red is noise).
 */
export function booksDaily(league: League) {
  // (one warning a season: settled or not, it stands until the review, which steps it up or lifts it)
  if (league.fired || league.phase !== 'regular' || booksOf(league)) return;
  const ts = curTeamSeason(league, league.userTid);
  if (ts.homeWon + ts.homeLost < PROJECT_HOME_GAMES) return;
  if (seasonEndCash(league, league.userTid).end < -WARN_RED * revenueScale(league)) step(league, 'warning');
}

/** At the season's review, on the cash the season closed with: in the red, a step up (an ultimatum from an earlier season becomes a freeze); in the black, it all lifts. */
export function booksReview(league: League) {
  if (league.fired) return;
  const b = booksOf(league);
  if (league.teams[league.userTid].cash >= 0) {
    if (!league.books) return;
    delete league.books;
    if (b && b.stage !== 'warning')
      addInbox(league, {
        from: 'Owner',
        subject: 'Back in the black',
        body:
          b.stage === 'freeze'
            ? 'The books are back in the black, so the freeze is over. Let us keep them there.'
            : "We're back in the black. The ultimatum is off. Keep it that way.",
        tone: 'good',
        link: '/office/finances',
      });
    return;
  }
  if (!b || b.stage === 'warning') step(league, 'ultimatum');
  else if (b.stage === 'ultimatum' && b.season < league.season) step(league, 'freeze');
}

/** Why a signing at `amount` a season is off under a freeze (more than `min`, the least he could be paid), or null. */
export function freezeSigningReason(league: League, amount: number, min: number): string | null {
  return frozen(league) && amount > min ? 'The budget is frozen while the books are in the red: minimum deals only.' : null;
}

/** Why re-signing at `amount` is off under a freeze (a raise on what he's paid now, `now`), or null. */
export function freezeResignReason(league: League, amount: number, now: number): string | null {
  return frozen(league) && amount > now ? `The budget is frozen while the books are in the red: no raises (he's paid ${money(now)} now).` : null;
}

/** Why a trade that takes in `incoming` and sends out `outgoing` of this contract season's salary is off under a freeze, or null. */
export function freezeTradeReason(league: League, incoming: number, outgoing: number): string | null {
  return frozen(league) && incoming > outgoing
    ? `The budget is frozen while the books are in the red: a trade can't take on more salary than it sends out (this one takes on ${money(incoming - outgoing)}).`
    : null;
}
