// The owner and the books: the user's cash (Team.cash, every season's profit and loss since the
// league began, the luxury tax included) has consequences once it's in the red, in three steps. The
// day it goes under zero the owner warns him; a review in the red (or a hole as deep as RED_ULTIMATUM)
// turns that into an ultimatum, back in the black by the next review; and a review still in the red
// after it (or a hole as deep as RED_FREEZE) freezes the budget: the staff and facilities budgets are
// cut to the league's standard and can't go up, and the payroll can't grow (minimum deals only, no
// raises on re-signing, no trade that takes back more salary than it sends). Back in the black, any
// day, it all lifts. Each step is a staff call on Today (see calls.ts), which stops a long sim; the
// owner's mail says it in his words. Nothing here draws from the league's random stream.
import type { League } from '../types';
import { addInbox, revenueScale } from './helpers';
import { money } from '../format';

export type BooksStage = 'warning' | 'ultimatum' | 'freeze';

/** Where the user's books stand with the owner (League.books): the step, and when it was taken. */
export interface Books {
  stage: BooksStage;
  tid: number;
  season: number;
  day: number;
}

/** A hole this deep (first-season $K) turns a warning into an ultimatum at once, and this deep a freeze. */
export const RED_ULTIMATUM = 25_000;
export const RED_FREEZE = 50_000;
/** The staff and facilities budgets a freeze cuts to (the league's standard: 50). */
export const FROZEN_BUDGET = 50;

/** The user's books, if the owner has a word about them (none for a fired coach or another team's). */
export function booksOf(league: League): Books | undefined {
  const b = league.books;
  return b && b.tid === league.userTid && !league.fired ? b : undefined;
}

/** The budget is frozen. */
export const frozen = (league: League) => booksOf(league)?.stage === 'freeze';

/** The cash a hole of `k` first-season $K is now. */
const scaled = (league: League, k: number) => k * revenueScale(league);

function step(league: League, stage: BooksStage) {
  league.books = { stage, tid: league.userTid, season: league.season, day: league.day };
  const team = league.teams[league.userTid];
  const cash = money(-team.cash);
  if (stage === 'warning')
    addInbox(league, {
      from: 'Owner',
      subject: "We're in the red",
      body: `The franchise is ${cash} in the red. That comes out of my pocket. Get the books back in the black: payroll, the luxury tax and the budgets are where the money goes. If we're still in the red at the season's review, we'll have a harder conversation.`,
      tone: 'bad',
      link: '/office/finances',
    });
  else if (stage === 'ultimatum')
    addInbox(league, {
      from: 'Owner',
      subject: 'The books: an ultimatum',
      body: `We're ${cash} in the red. Back in the black by next season's review, or I freeze the budget: minimum deals only, no raises, no taking on salary, and the staff budgets cut to the league standard.`,
      tone: 'bad',
      link: '/office/finances',
    });
  else {
    // the cut: budgets over the standard come down to it
    for (const k of ['coaching', 'health', 'facilities'] as const) team.budget[k] = Math.min(team.budget[k], FROZEN_BUDGET);
    addInbox(league, {
      from: 'Owner',
      subject: 'The budget is frozen',
      body: `${cash} in the red, and I warned you. The budget is frozen until we're back in the black: minimum deals only, no raises when you re-sign anyone, no trade that takes on more salary than it sends out, and the staff and facilities budgets are cut to the league standard.`,
      tone: 'bad',
      link: '/office/finances',
    });
  }
}

/** Every day: a hole that opens gets the warning, one that deepens past the lines steps up at once, and the black lifts it all. */
export function booksDaily(league: League) {
  if (league.fired) return;
  const cash = league.teams[league.userTid].cash;
  const b = booksOf(league);
  if (cash >= 0) {
    if (!league.books) return;
    const was = league.books.stage;
    delete league.books;
    if (b && was !== 'warning')
      addInbox(league, {
        from: 'Owner',
        subject: 'Back in the black',
        body:
          was === 'freeze' ? 'The books are back in the black, so the freeze is over. Let us keep them there.' : "We're back in the black. The ultimatum is off. Keep it that way.",
        tone: 'good',
        link: '/office/finances',
      });
    return;
  }
  // (another team's books from before a takeover don't follow him)
  if (!b) return step(league, cash <= -scaled(league, RED_ULTIMATUM) ? 'ultimatum' : 'warning');
  if (b.stage === 'warning' && cash <= -scaled(league, RED_ULTIMATUM)) step(league, 'ultimatum');
  else if (b.stage === 'ultimatum' && cash <= -scaled(league, RED_FREEZE)) step(league, 'freeze');
}

/** At the season's review: in the red, a warning becomes an ultimatum, and an ultimatum from an earlier season a freeze. */
export function booksReview(league: League) {
  if (league.fired || league.teams[league.userTid].cash >= 0) return booksDaily(league);
  const b = booksOf(league);
  if (!b) step(league, 'ultimatum');
  else if (b.stage === 'warning') step(league, 'ultimatum');
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
