// Contract talks between the user and a player's agent: re-signing, free agency (offer sheets too)
// and extensions. His ask is open (askingContract, extensionAsk): offered on his terms, it signs
// him on the spot. What he'd take is a little lower, his walk-away price, which he keeps to himself:
// 0-12% under the ask, from a hash of the league, season, team and player (so asking again can't
// reroll it), lower for a player keen on the team (its record, market, the role on offer, his mood
// with his own team), later in the summer market and for older players, higher for money-first
// players and stars. An offer at or above it signs him. Below it he counters, between the offer and
// his ask for the years he wants, and his patience drops; a lowball (under 85% of the ask for those
// terms) costs twice the patience and a little of his interest in the team. Out of patience, talks
// break down for a while (see breakDown). Only the user negotiates: AI teams sign at the ask, and
// a player's interest only ever drops for the user's team, so the league's economy is unchanged.
// Top free agents in the summer weigh competing offers instead (see userBid in freeAgency.ts).

import type { League, Player, TalkTerms, Talks } from '../types';
import { seasonLabel } from '../constants';
import { clamp, hashString } from '../random';
import { contractExp, extensionStart, playerAge } from '../playerGen';
import { CAP_FOR, addInbox, contractSeason, fmtDate, playerName } from './helpers';
import {
  type Ask,
  FA_DAYS,
  extendContract,
  extensionAsk,
  extensionBlockedReason,
  extensionMaxYears,
  extensionRefusal,
  askingContract,
  playerPrefs,
  teamAppeal,
  valueScore,
} from './contracts';

export type TalkKind = Talks['kind'];

/** What the user's contract moves answer: `counter`, the player's counter-offer when he made one. */
export interface OfferResult {
  ok: boolean;
  reason: string;
  counter?: TalkTerms;
}

/** The furthest his walk-away price goes under his ask. */
export const WALK_MAX = 0.12;
/** An offer under this share of his ask for its terms is a lowball. */
export const LOWBALL = 0.85;
/** A player option on the final season takes this off his price; a team option adds this to it. */
export const PLAYER_OPTION = 0.04;
export const TEAM_OPTION = 0.06;
/** Each year away from the length he wants adds this to his price (as willSign counts it). */
export const YEAR_PREMIUM = 0.03;
/** Offers below his price a player hears before talks break down (one more when he's keen on the team, one fewer for a star). */
export const PATIENCE = 3;
/** Interest in the team a lowball costs (off his appeal), and the most it can cost in a season. */
export const SOUR_STEP = 0.02;
const SOUR_MAX = 0.06;
/** How long talks are off once they break down: free-agency days, days in the season, days for an extension. */
export const COOL_FA = 3;
export const COOL_SEASON = 7;
export const COOL_EXTEND = 30;
/** Re-sign period: what talks breaking down does to his ask (he then takes nothing less). */
export const FIRM_BUMP = 1.05;

/** Money in talks: offers and counters move in $50K steps. */
const money2 = (k: number) => `$${(k / 1000).toFixed(2)}M`;
const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];

/** The stretch of the calendar talks are in: a player's patience and counter start over in the next one. */
export function talkPeriod(league: League): Talks['period'] {
  return league.phase === 'resign' ? 'resign' : league.phase === 'freeAgency' ? 'fa' : 'season';
}

/** His talks with the user's team this contract season, as stored (any kind or period), or null. */
function ownTalks(league: League, p: Player): Talks | null {
  const t = p.talks;
  return t && t.tid === league.userTid && t.season === contractSeason(league) ? t : null;
}

/** Talks that broke down and are still off. */
const closedNow = (league: League, t: Talks | null): t is Talks & { closed: { season: number; day: number } } =>
  !!t?.closed && (league.season < t.closed.season || (league.season === t.closed.season && league.day < t.closed.day));

/** Offers below his price he'll hear when talks start: one more when he's keen on the team, one fewer for a star. */
export function initialPatience(league: League, p: Player): number {
  return PATIENCE + (teamAppeal(league, league.userTid, p) >= 1.1 ? 1 : 0) - (valueScore(league, p) >= 82 ? 1 : 0);
}

/**
 * Where talks with him stand now, without starting any: patience left, his standing counter, his
 * firm ask in the re-sign period, and when talks are off until (`closed`). A new period or kind of
 * talks starts over, keeping the interest lost to lowballs (and talks that are still off).
 */
export function talkState(
  league: League,
  p: Player,
  kind: TalkKind,
): { patience: number; counter?: TalkTerms; firm?: number; closed?: { season: number; day: number }; lowballs: number; sour: number; started: boolean } {
  const t = ownTalks(league, p);
  if (closedNow(league, t)) return { patience: 0, closed: t.closed, lowballs: t.lowballs ?? 0, sour: t.sour ?? 0, started: true };
  if (t && t.kind === kind && t.period === talkPeriod(league) && !t.closed)
    return { patience: t.patience, counter: t.counter, firm: t.firm, lowballs: t.lowballs ?? 0, sour: t.sour ?? 0, started: true };
  return { patience: initialPatience(league, p), lowballs: 0, sour: t?.sour ?? 0, started: false };
}

/** His talks with the user for this kind and period, started (or started over) for an offer. */
function openTalks(league: League, p: Player, kind: TalkKind): Talks {
  const st = talkState(league, p, kind);
  const t = ownTalks(league, p);
  if (st.started && t) return t;
  const fresh: Talks = { tid: league.userTid, season: contractSeason(league), kind, period: talkPeriod(league), patience: st.patience };
  if (st.sour) fresh.sour = st.sour;
  p.talks = fresh;
  return fresh;
}

/** His ask in these talks: his asking price from the user (an extension's for an extension), up FIRM_BUMP once re-sign talks broke down. */
export function talkAsk(league: League, p: Player, kind: TalkKind): Ask {
  const ask = kind === 'extend' ? extensionAsk(league, p) : askingContract(league, p, league.userTid);
  const firm = talkState(league, p, kind).firm;
  if (!firm) return ask;
  const { max } = talkBounds(league, p, kind);
  return { amount: Math.min(max, Math.ceil((ask.amount * firm) / 50) * 50), years: ask.years };
}

/** His minimum and max for the contract talked about: an extension's are those of its first season. */
function talkBounds(league: League, p: Player, kind: TalkKind): { min: number; max: number } {
  const cap = CAP_FOR(league, kind === 'extend' ? contractExp(p.contract) + 1 : contractSeason(league));
  return { min: p.experience >= 3 ? cap.vetMin : cap.minContract, max: cap.maxContract(p.experience) };
}

/** His price for a deal on these terms, as a multiple of his ask: 3% a year away from the length he wants, 4% off for a player option, 6% more for a team option. */
export function termsFactor(ask: Ask, years: number, option?: TalkTerms['option']): number {
  return (1 + Math.abs(years - ask.years) * YEAR_PREMIUM) * (option === 'player' ? 1 - PLAYER_OPTION : option === 'team' ? 1 + TEAM_OPTION : 1);
}

/**
 * His ask on these terms: an offer of this much signs him on the spot (between his minimum and the
 * max, in $50K steps, but his minimum exactly when that's what he asks: a little over it would no
 * longer be a minimum deal).
 */
export function askFor(league: League, p: Player, kind: TalkKind, years: number, option?: TalkTerms['option']): number {
  const { min, max } = talkBounds(league, p, kind);
  const ask = talkAsk(league, p, kind);
  const raw = ask.amount * termsFactor(ask, years, option);
  return raw <= min + 1 ? min : clamp(Math.ceil(raw / 50) * 50, min, max);
}

/**
 * How far under his ask he'd still sign (0..WALK_MAX), never shown: a hash of the league, season,
 * team and player (2-6%), plus a quarter of how keen he is on the team (its appeal to him), up to 3%
 * more as the summer market thins out (an unsigned free agent in season has few suitors left), and
 * up to 3% for a player past 29; less for a money-first player, and for a star (worth 78+), who has
 * other options. Out of the re-sign period's talks that broke down, none.
 */
export function walkAwayDiscount(league: League, p: Player, kind: TalkKind): number {
  if (talkState(league, p, kind).firm) return 0;
  const season = contractSeason(league);
  let d = 0.02 + 0.04 * (hashString(`${league.id}:${season}:${league.userTid}:${p.pid}:walk`) / 4294967296);
  d += (teamAppeal(league, league.userTid, p) - 1) * 0.25;
  if (kind === 'fa') d += league.phase === 'freeAgency' ? (0.03 * league.faDay) / (FA_DAYS - 1) : 0.03;
  d += clamp((playerAge(p, season) - 29) * 0.006, 0, 0.03);
  d -= (playerPrefs(league, p).money - 1) * 0.04;
  const v = valueScore(league, p);
  d -= v >= 82 ? 0.03 : v >= 78 ? 0.015 : 0;
  return clamp(d, 0, WALK_MAX);
}

/** The least he'd sign for on these terms (hidden from the user). */
export function walkAwayFor(league: League, p: Player, kind: TalkKind, years: number, option?: TalkTerms['option']): number {
  const ask = talkAsk(league, p, kind);
  const { min, max } = talkBounds(league, p, kind);
  return clamp(ask.amount * (1 - walkAwayDiscount(league, p, kind)) * termsFactor(ask, years, option), min, max);
}

/** When talks that broke down are on again, in words: "Jul 4", or "the preseason" for the rest of the summer. */
export function closedLabel(league: League, closed: { season: number; day: number }): string {
  return closed.season > league.season ? 'the preseason' : fmtDate(closed.season, closed.day);
}

/** What talks breaking down costs, in the period they're in now, in words for the contract sheet. */
export function breakdownRule(league: League, kind: TalkKind): string {
  if (kind === 'extend') return `he won't discuss an extension for ${COOL_EXTEND} days`;
  switch (talkPeriod(league)) {
    case 'resign':
      return `his ask goes up ${Math.round((FIRM_BUMP - 1) * 100)}% and he'll take nothing less for the rest of the re-sign period`;
    case 'fa':
      return `he won't take your calls for ${COOL_FA} days, or for the rest of the summer if you lowballed him twice`;
    default:
      return `he won't take your calls for a week`;
  }
}

/** His patience in words: "Two more offers below his price and talks break down." */
export const patienceText = (n: number) =>
  n > 0 ? `${(WORDS[n] ?? String(n)).replace(/^./, (c) => c.toUpperCase())} more offer${n === 1 ? '' : 's'} below his price and talks break down.` : 'Talks are over for now.';

/** Out of patience: talks break off for a while, by the period they're in (see breakdownRule). */
function breakDown(league: League, p: Player, t: Talks, kind: TalkKind): string {
  const name = playerName(p);
  delete t.counter;
  t.patience = 0;
  if (kind === 'extend') {
    t.closed = { season: league.season, day: league.day + COOL_EXTEND };
    return `Talks broke down: ${name} won't discuss an extension again until ${closedLabel(league, t.closed)}.`;
  }
  switch (t.period) {
    case 'resign': {
      t.firm = FIRM_BUMP;
      const ask = talkAsk(league, p, kind);
      return `Talks broke down: ${name} has had enough. His ask is now ${money2(ask.amount)} over ${yrs(ask.years)}, and he'll take nothing less for the rest of the re-sign period.`;
    }
    case 'fa':
      t.closed = (t.lowballs ?? 0) >= 2 ? { season: league.season + 1, day: 0 } : { season: league.season, day: league.day + COOL_FA };
      return t.closed.season > league.season
        ? `Talks broke down: after two lowballs, ${name} won't talk to you again this summer.`
        : `Talks broke down: ${name} won't take your calls until ${closedLabel(league, t.closed)}.`;
    default:
      t.closed = { season: league.season, day: league.day + COOL_SEASON };
      return `Talks broke down: ${name} won't take your calls until ${closedLabel(league, t.closed)}.`;
  }
}

/**
 * The player hears the user's offer (the caller has checked the rules: window, roster, cap, years).
 * At or above his walk-away price for its terms, or on his standing counter's terms for at least as
 * much, he accepts (the caller signs him). Below it he counters on his preferred length, kept within
 * `years` (the deal's own limits), between the offer's worth on those terms and his ask, and never
 * above an earlier counter; the offer costs a patience (two for a lowball, which also costs a little
 * interest in the team), and out of patience talks break down. Talks that are off hear nothing; in
 * the re-sign period after a breakdown only his ask is heard, at no cost.
 */
export function hearOffer(
  league: League,
  p: Player,
  kind: TalkKind,
  offer: TalkTerms,
  years: { min: number; max: number },
): { accept: boolean; text: string; counter?: TalkTerms } {
  const name = playerName(p);
  const st = talkState(league, p, kind);
  if (st.closed) return { accept: false, text: `${name} isn't taking your calls until ${closedLabel(league, st.closed)}.` };
  const option = offer.option;
  const standing = st.counter;
  if (standing && standing.years === offer.years && (standing.option ?? null) === (option ?? null) && offer.amount >= standing.amount) return { accept: true, text: 'Deal!' };
  if (offer.amount >= walkAwayFor(league, p, kind, offer.years, option) - 1) return { accept: true, text: 'Deal!' };
  const askAt = askFor(league, p, kind, offer.years, option);
  if (st.firm)
    return { accept: false, text: `${name} will only sign at his ask now: ${money2(askAt)} a season for ${yrs(offer.years)}${option ? ` with a ${option} option` : ''}.` };
  const t = openTalks(league, p, kind);
  const lowball = offer.amount < askAt * LOWBALL;
  t.patience -= lowball ? 2 : 1;
  if (lowball) {
    t.lowballs = (t.lowballs ?? 0) + 1;
    t.sour = Math.min(SOUR_MAX, Math.round(((t.sour ?? 0) + SOUR_STEP) * 1000) / 1000);
  }
  if (t.patience <= 0) return { accept: false, text: breakDown(league, p, t, kind) };
  // his counter, on the length he wants (within the deal's limits) and no option, with the ask as
  // it stands after a lowball: what the offer is worth on those terms, met halfway to his ask
  const ask = talkAsk(league, p, kind);
  const cy = clamp(ask.years, years.min, years.max);
  const worth = (offer.amount / termsFactor(ask, offer.years, option)) * termsFactor(ask, cy);
  const top = askFor(league, p, kind, cy);
  const walk = walkAwayFor(league, p, kind, cy);
  const floor = walk <= talkBounds(league, p, kind).min + 1 ? walk : Math.ceil(walk / 50) * 50;
  let amount = clamp(Math.ceil((worth + (top - worth) * 0.5) / 50) * 50, Math.min(floor, top), top);
  if (t.counter && t.counter.years === cy && !t.counter.option) amount = Math.min(amount, t.counter.amount);
  t.counter = { amount, years: cy };
  const hurt = lowball ? ` That was a lowball: he's less keen on your team now.` : '';
  // (his patience is on the sheet, next to the counter: see patienceText)
  return { accept: false, counter: t.counter, text: `${name} counters at ${money2(amount)} a season over ${yrs(cy)}.${hurt}` };
}

/**
 * The user extends one of his players (see extensionBlockedReason): a negotiation like any other,
 * on the extension's ask (see hearOffer), with no options (any option on his deal is picked up).
 */
export function userExtend(league: League, pid: number, amount: number, years: number): OfferResult {
  const p = league.players[pid];
  if (!p) return { ok: false, reason: 'Player not found.' };
  const blocked = extensionBlockedReason(league, p) ?? extensionRefusal(league, p);
  if (blocked) return { ok: false, reason: blocked };
  const maxYears = extensionMaxYears(p);
  if (years < 1 || years > maxYears) return { ok: false, reason: `His extension can run 1 to ${maxYears} years.` };
  const h = hearOffer(league, p, 'extend', { amount, years }, { min: 1, max: maxYears });
  if (!h.accept) return { ok: false, reason: h.text, counter: h.counter };
  extendContract(league, p, amount, years);
  const salaries = p.contract.next!.salaries;
  const start = extensionStart(p.contract)!;
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signs a ${years}-year, $${(salaries.reduce((a, x) => a + x, 0) / 1000).toFixed(1)}M extension`,
    body: `${playerName(p)} is now signed through ${seasonLabel(contractExp(p.contract))}. The extension starts in ${seasonLabel(start)} at $${(salaries[0] / 1000).toFixed(1)}M${years > 1 ? ' with 5% annual raises' : ''}, and counts against that season's cap; his current salary doesn't change.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} signs his extension!` };
}
