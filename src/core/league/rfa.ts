// Restricted free agency, the NBA's simplified. When a young player's deal runs out (a first-round
// pick finishing his rookie-scale deal, or anyone with three seasons or fewer in the league), his
// team can extend a qualifying offer during the re-sign period. In free agency he is then a
// restricted free agent: his team can still re-sign him with Bird rights, another team can sign him
// to an offer sheet (two to five seasons, no options, at what he asks of it, paid for like any
// signing), and his team has two days to match it, keeping him on exactly those terms, or let him
// go. Unsigned when the market closes, he plays a season on the qualifying offer and is
// unrestricted after it. While the offer stands his team carries a cap hold for him through free
// agency, and a pending offer sheet holds the other team's room.
//
// Simplified: two-way players can't be made restricted; the qualifying offer is one formula (see
// qualifyingOffer) rather than the CBA's table; a matched player can be traded to the team that
// signed the sheet once the usual trade lock after a signing is up; offer sheets are summer-only;
// and a team at the 21-man offseason limit can't match, nor take back a player on his qualifying
// offer at the close (it lapses and he stays an unrestricted free agent) rather than being made to
// cut someone.

import type { League, OfferSheet, Player, Team } from '../types';
import { FREE_AGENT } from '../types';
import { seasonLabel } from '../constants';
import { clamp } from '../random';
import { contractExp, salaryFor } from '../playerGen';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, addInbox, addNews, andList, contractSeason, freeAgents, payroll, playerName, revenueScale, standardRoster, teamPlayers } from './helpers';
import {
  EXCEPTIONS,
  FA_DAYS,
  FIRED_REASON,
  type SigningRoute,
  askingContract,
  isException,
  makeContract,
  marketSalary,
  payrollBudget,
  rookieScaleDeal,
  signPlayer,
  summerRoster,
  tradeValue,
  spendRoute,
  valueScore,
} from './contracts';
import { logMove } from './transactions';
import { money } from '../format';

/** Free-agency days a team has to match an offer sheet: the day it is signed and the next (until the market closes, if that comes first). */
export const MATCH_DAYS = 2;
/** Offer sheets run at least two seasons (and at most five, like any contract). */
export const SHEET_MIN_YEARS = 2;
/** The longest offer sheet: four seasons (five is only for re-signing on full Bird rights). */
export const SHEET_MAX_YEARS = 4;
/** Seasons in the league (the one just played included) up to which a player not on a rookie-scale deal can be made restricted. */
export const RFA_MAX_SERVICE = 3;

/** AI teams qualify players worth this much (a rotation player) and up. */
const AI_QUALIFY_VALUE = 66;
/** AI teams sign restricted free agents worth this much and up to offer sheets: pickier than for unrestricted ones, since his team may match. */
export const AI_SHEET_VALUE = 68;
/** Points off an AI team's interest in a restricted free agent next to an unrestricted one (see aiSign). */
export const AI_SHEET_PENALTY = 0.5;
/** Least trade value (to his team, under its strategy) of the contract an offer sheet would give him for an AI team to match it. */
const MATCH_VALUE = 2;

const yrs = (n: number) => `${n} yr${n === 1 ? '' : 's'}`;
const teamName = (league: League, tid: number) => `${league.teams[tid].region} ${league.teams[tid].name}`;

// ---------------------------------------------------------------- who, and for how much

/**
 * Seasons he has played in the league, this one included. `experience` counts a season only when
 * the next one starts (see newSeason), so in the summer it is one behind.
 */
export function serviceYears(league: League, p: Player): number {
  return p.experience + (p.stats.some((s) => s.season === league.season && !s.playoffs && !s.real && s.gp > 0) ? 1 : 0);
}

/**
 * Could his team make him a restricted free agent: his standard deal runs out after this season,
 * and he is finishing a first-round rookie-scale deal or has played three seasons or fewer (this
 * one included). A player coming off a qualifying offer is unrestricted.
 */
export function rfaEligible(league: League, p: Player): boolean {
  if (p.tid < 0 || p.contract.twoWay || p.contract.qualifying || contractExp(p.contract) > league.season) return false;
  return rookieScaleDeal(p) || serviceYears(league, p) <= RFA_MAX_SERVICE;
}

/**
 * His qualifying offer, one season in next season's money: a first-round pick finishing his rookie
 * scale gets a raise on his final salary from 30% (the #1 pick) to 50% (#30), as the NBA's table
 * runs; anyone else 125% of his final salary. Either way at least his minimum plus $200K (grown
 * with the cap, as the minimum is) and at most his max.
 */
export function qualifyingOffer(league: League, p: Player): number {
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  const final = salaryFor(p, contractExp(p.contract));
  const raise = rookieScaleDeal(p) ? 1.3 + (0.2 * (clamp(p.draft.pick, 1, 30) - 1)) / 29 : 1.25;
  const floor = (p.experience >= 3 ? cap.vetMin : cap.minContract) + Math.round((200 * revenueScale(league, next)) / 10) * 10;
  return Math.min(Math.max(Math.round((final * raise) / 10) * 10, floor), cap.maxContract(p.experience));
}

/** Restricted free agents on the market (whose rights team `tid` holds), best first. */
export const restrictedFreeAgents = (league: League, tid?: number): Player[] =>
  freeAgents(league)
    .filter((p) => p.rfa && (tid === undefined || p.rfa.tid === tid))
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);

/** Restricted free agents with an offer sheet waiting for their team's decision (signed by team `tid`). */
export const pendingSheets = (league: League, tid?: number): Player[] =>
  restrictedFreeAgents(league).filter((p) => p.rfa!.sheet && (tid === undefined || p.rfa!.sheet.tid === tid));

/** The last free-agency day an offer sheet signed on `day` can be matched on. */
export const matchDeadline = (day: number) => Math.min(FA_DAYS - 1, day + MATCH_DAYS - 1);

/** When a sheet's last match day ends: "day 7" (faDay 6), or "day 30 (when free agency closes)", which reads the same mid-sentence. */
export const deadlineLabel = (until: number) => (until >= FA_DAYS - 1 ? `day ${FA_DAYS} (when free agency closes)` : `day ${until + 1}`);

// ---------------------------------------------------------------- qualifying offers

function qualify(league: League, p: Player) {
  const qo = qualifyingOffer(league, p);
  p.rfa = { tid: p.tid, qo };
  logMove(league, 'qualify', p.tid, p, { amount: qo, note: 'extended' });
}

/**
 * Free agency opens: the qualified player's cap hold is set for the market, the larger of his
 * qualifying offer and his asking price from his team (as in the re-sign period).
 * Called while he is still on its roster.
 */
export function setRfaHold(league: League, p: Player) {
  if (!p.rfa || p.tid !== p.rfa.tid) return;
  p.rfa.hold = Math.max(p.rfa.qo, askingContract(league, p, p.tid).amount);
}

/**
 * Free agency opens: an AI team qualifies the eligible players it didn't re-sign but would want
 * back, best first, while it has spots under the offseason limit to bring them back in: worth 66+
 * (a rotation player), not asking out, and worth at least 80% of the offer on the market. The offer
 * only costs anything if he takes it, which he does when nobody offers more, so that is the one
 * test; whether a contract fits the payroll is the call when an offer sheet comes (aiMatchVerdict).
 */
export function aiQualify(league: League, t: Team) {
  let room = OFFSEASON_ROSTER_MAX - standardRoster(league, t.tid).filter((x) => contractExp(x.contract) > league.season).length;
  const candidates = teamPlayers(league, t.tid)
    .filter((p) => !p.rfa && rfaEligible(league, p) && valueScore(league, p) >= AI_QUALIFY_VALUE)
    .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid);
  for (const p of candidates) {
    if (room <= 0) return;
    if (marketSalary(league, p) < qualifyingOffer(league, p) * 0.8) continue;
    qualify(league, p);
    room--;
  }
}

/**
 * The payroll an AI team will go to for keeping its restricted free agent worth `v` (matching an
 * offer sheet, or coming to terms): the budget re-signing uses (see payrollBudget; a young player
 * worth 80+ is core), stretched to 5% past the tax line, since the alternative is losing a young
 * player for nothing.
 */
const keepBudget = (league: League, t: Team, v: number) => {
  const cap = CAP_FOR(league, contractSeason(league));
  return Math.max(payrollBudget(cap, t, v, { core: v >= 80, young: true }), cap.luxuryTax * 1.05);
};

/** The free-agency day from which an AI team and its restricted free agent come to terms if no offer sheet has come (see aiRfaTerms). */
export const AI_TERMS_DAY = 10;

/**
 * An AI team's restricted free agent who has had the market for ten days without an offer sheet
 * comes to terms with it: his asking price from it (never under the qualifying offer, which he
 * could simply take) for the years he wants, when that fits what the team will pay to keep him
 * (keepBudget) and there's a roster spot. Otherwise he waits, and takes the qualifying offer when
 * the market closes.
 */
export function aiRfaTerms(league: League) {
  if (league.phase !== 'freeAgency' || league.faDay < AI_TERMS_DAY) return;
  const next = contractSeason(league);
  for (const p of restrictedFreeAgents(league)) {
    const r = p.rfa!;
    if (r.sheet || (r.tid === league.userTid && !league.fired)) continue;
    const t = league.teams[r.tid];
    const ask = askingContract(league, p, t.tid);
    const amount = Math.max(ask.amount, r.qo);
    if (summerRoster(league, t.tid) >= OFFSEASON_ROSTER_MAX || payroll(league, t.tid, next) + amount > keepBudget(league, t, valueScore(league, p))) continue;
    signPlayer(league, p, t.tid, amount, ask.years, { start: next });
  }
}

/** Why the user can't extend this player a qualifying offer now, or null. */
export function qualifyBlockedReason(league: League, p: Player): string | null {
  if (league.fired) return FIRED_REASON;
  if (p.tid !== league.userTid) return 'Not on your team.';
  if (league.phase !== 'resign') return 'Qualifying offers are extended in the re-sign period, before free agency opens.';
  if (contractExp(p.contract) > league.season) return `${playerName(p)} is still under contract.`;
  if (p.rfa) return `${playerName(p)} already has a qualifying offer.`;
  if (p.contract.twoWay) return "Two-way players can't be made restricted free agents.";
  if (p.contract.qualifying) return `${playerName(p)} played this season on a qualifying offer: he is unrestricted now.`;
  if (!rfaEligible(league, p))
    return `Only a first-round pick finishing his rookie-scale deal, or a player with ${RFA_MAX_SERVICE} seasons or fewer in the league, can be made a restricted free agent.`;
  return null;
}

/** The user extends a qualifying offer to one of his expiring players (re-sign period). */
export function userQualify(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!p) return { ok: false, reason: 'Player not found.' };
  const why = qualifyBlockedReason(league, p);
  if (why) return { ok: false, reason: why };
  qualify(league, p);
  return { ok: true, reason: `Qualifying offer to ${playerName(p)}: ${money(p.rfa!.qo)} for one season. He'll be a restricted free agent.` };
}

/**
 * The user withdraws a qualifying offer: in the re-sign period, or in free agency before an offer
 * sheet is signed. He is an unrestricted free agent then, and his cap hold comes off the books.
 */
export function userWithdrawQualifying(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  const r = p?.rfa;
  if (!p || !r || r.tid !== league.userTid) return { ok: false, reason: 'No qualifying offer of yours to withdraw.' };
  if (r.sheet) return { ok: false, reason: `${playerName(p)} has signed an offer sheet with the ${league.teams[r.sheet.tid].name}: match it or let him go.` };
  logMove(league, 'qualify', r.tid, p, { amount: r.qo, note: 'withdrawn' });
  const hold = r.hold;
  delete p.rfa;
  return {
    ok: true,
    reason:
      p.tid === FREE_AGENT
        ? `Qualifying offer withdrawn: ${playerName(p)} is an unrestricted free agent, and his ${money(hold ?? r.qo)} cap hold is off your books.`
        : `Qualifying offer withdrawn: ${playerName(p)} becomes an unrestricted free agent when the market opens.`,
  };
}

// ---------------------------------------------------------------- offer sheets

/** Why no team could sign him to an offer sheet of this length now, or null (the money, cap and roster are the signing's own checks). */
export function sheetBlockedReason(league: League, p: Player, years: number): string | null {
  const r = p.rfa;
  if (!r || p.tid !== FREE_AGENT) return `${playerName(p)} isn't a restricted free agent.`;
  if (league.phase !== 'freeAgency') return 'Offer sheets are signed during free agency.';
  if (r.sheet)
    return `${playerName(p)} has signed an offer sheet with the ${league.teams[r.sheet.tid].name}: the ${league.teams[r.tid].name} decide by the end of ${deadlineLabel(r.sheet.until)}.`;
  if (years < SHEET_MIN_YEARS || years > SHEET_MAX_YEARS) return `Offer sheets run ${SHEET_MIN_YEARS} to ${SHEET_MAX_YEARS} years.`;
  return null;
}

/** The salaries a sheet's terms come to, as signed (see makeContract). */
const sheetContract = (league: League, p: Player, s: Pick<OfferSheet, 'amount' | 'years'>) => makeContract(league, s.amount, s.years, contractSeason(league), p.experience);
const sheetTotal = (league: League, p: Player, s: Pick<OfferSheet, 'amount' | 'years'>) => sheetContract(league, p, s).salaries.reduce((a, x) => a + x, 0);

/** News-worthy: a good player, big money, or the user's team in it. */
const notable = (league: League, p: Player, amount: number, tids: number[]) =>
  p.ovr >= 72 || amount >= CAP_FOR(league, contractSeason(league)).salaryCap * 0.06 || tids.includes(league.userTid);

/**
 * Team `tid` signs restricted free agent `p` to an offer sheet on free-agency day `day`; the caller
 * has checked the terms (sheetBlockedReason, his asking price) and how it is paid for (`route`).
 * A sheet on an exception reserves it; cap space is held by marketHolds (and counts as used only
 * if he joins, see settleSheet). His team has until the end of the next day to match, and the user
 * is asked when it's his player.
 */
export function signOfferSheet(league: League, p: Player, tid: number, amount: number, years: number, route: SigningRoute, day: number) {
  const r = p.rfa!;
  const sheet: OfferSheet = { tid, amount, years, route, day, until: matchDeadline(day) };
  r.sheet = sheet;
  if (isException(route)) spendRoute(league, tid, route, contractSeason(league));
  logMove(league, 'offerSheet', [tid, r.tid], p, { amount, years });
  const name = playerName(p);
  const total = sheetTotal(league, p, sheet);
  const t = league.teams[tid];
  const own = league.teams[r.tid];
  if (notable(league, p, amount, [tid, r.tid]))
    addNews(league, {
      kind: 'signing',
      text: `${name} signed a ${years}-year, ${money(total)} offer sheet with the ${t.region} ${t.name}. The ${own.name} can match it by the end of ${deadlineLabel(sheet.until)}${sheet.until < FA_DAYS - 1 ? ' of free agency' : ''}.`,
      tids: [tid, r.tid],
      pids: [p.pid],
    });
  if (r.tid === league.userTid && !league.fired)
    addInbox(league, {
      from: 'Assistant GM',
      subject: `${t.abbrev} signed ${name} to an offer sheet`,
      body: `${name} signed an offer sheet with the ${t.region} ${t.name}: ${yrs(years)} / ${money(total)}, ${money(sheetContract(league, p, sheet).salaries[0])} in ${seasonLabel(contractSeason(league))} with 5% raises.\nMatch it by the end of ${deadlineLabel(sheet.until)} and he stays with us on exactly those terms. Let it go, or leave it unanswered until then, and he joins ${t.abbrev}. Matching needs a roster spot, not cap room.`,
      tone: 'alert',
      important: true,
      link: '/office/free-agents',
      sheet: p.pid,
    });
}

/**
 * Would an AI team match this offer sheet, and why: it needs a roster spot under the offseason
 * limit (its own pending offer sheets hold theirs), and the contract has to fit what it will pay to
 * keep him (keepBudget) and be worth having (its trade value to the team, under its strategy,
 * contract surplus or burden included, at least MATCH_VALUE: about a rotation player on a fair deal).
 */
export function aiMatchVerdict(league: League, p: Player): { match: boolean; why: string } {
  const r = p.rfa!;
  const sh = r.sheet!;
  const t = league.teams[r.tid];
  const next = contractSeason(league);
  if (summerRoster(league, t.tid) >= OFFSEASON_ROSTER_MAX) return { match: false, why: `they had no roster spot left (${OFFSEASON_ROSTER_MAX})` };
  const v = valueScore(league, p);
  if (payroll(league, t.tid, next) + sh.amount > keepBudget(league, t, v)) return { match: false, why: 'it would take their payroll past what they will spend' };
  if (tradeValue(league, { ...p, contract: sheetContract(league, p, sh) }, t.strategy) < MATCH_VALUE) return { match: false, why: "they don't think he's worth that contract" };
  return { match: true, why: "he's worth the money to them, and it fits their payroll" };
}

/**
 * The offer sheet is decided: matched, he re-signs with his team on exactly its terms (the offering
 * team gets back the room it held, and the exception if the sheet used one); not matched, he joins
 * the offering team on them, and a sheet on cap space counts as the team using its space (no
 * mid-level for it this season, the room exception instead). Either way it's a signing: the trade
 * lock until December 15 applies.
 */
function settleSheet(league: League, p: Player, matched: boolean) {
  const r = p.rfa!;
  const sh = r.sheet!;
  const next = contractSeason(league);
  const offerer = league.teams[sh.tid];
  if (matched) {
    if (sh.route === 'mle' && offerer.mleSeason === next) delete offerer.mleSeason;
    if (sh.route === 'tmle' && offerer.taxMleSeason === next) delete offerer.taxMleSeason;
    if (sh.route === 'room' && offerer.roomSeason === next) delete offerer.roomSeason;
    if (sh.route === 'bae' && offerer.baeSeason === next) delete offerer.baeSeason;
  } else if (sh.route === 'space') spendRoute(league, sh.tid, 'space', next);
  // (on exactly the sheet's terms, its 5% raises included)
  signPlayer(league, p, matched ? r.tid : sh.tid, sh.amount, sh.years, { start: next, news: false, log: false, raise: 0.05 });
  logMove(league, 'match', [r.tid, sh.tid], p, { amount: p.contract.salaries[0], years: sh.years, note: matched ? 'matched' : 'declined' });
  if (!notable(league, p, sh.amount, [r.tid, sh.tid])) return;
  const own = league.teams[r.tid];
  const total = sheetTotal(league, p, sh);
  addNews(league, {
    kind: 'signing',
    text: matched
      ? `The ${own.region} ${own.name} matched ${playerName(p)}'s offer sheet from the ${offerer.name}: he stays with them on ${yrs(sh.years)} / ${money(total)}.`
      : `${playerName(p)} joins the ${offerer.region} ${offerer.name} on ${yrs(sh.years)} / ${money(total)}: the ${own.name} declined to match his offer sheet.`,
    tids: [r.tid, sh.tid],
    pids: [p.pid],
  });
}

/** Why the user can't decide on this player's offer sheet now (or, `match`, match it), or null. */
export function sheetDecisionBlocked(league: League, pid: number, match: boolean): string | null {
  const p = league.players[pid];
  const r = p?.rfa;
  if (league.fired) return FIRED_REASON;
  if (!p || !r?.sheet || p.tid !== FREE_AGENT || league.phase !== 'freeAgency') return 'This offer sheet has been decided.';
  // (the user took over another team since it was signed)
  if (r.tid !== league.userTid) return `His rights belong to the ${league.teams[r.tid].name}: they decide on it.`;
  if (match && summerRoster(league, league.userTid) >= OFFSEASON_ROSTER_MAX)
    return `Matching needs a roster spot: yours is full (${OFFSEASON_ROSTER_MAX}${league.faBids?.length || pendingSheets(league, league.userTid).length ? ', counting your pending offers and offer sheets' : ''}). Release or trade someone first.`;
  return null;
}

/** The user matches the offer sheet on his restricted free agent, or lets him go to the team that signed it. */
export function userDecideSheet(league: League, pid: number, match: boolean): { ok: boolean; reason: string } {
  const why = sheetDecisionBlocked(league, pid, match);
  if (why) return { ok: false, reason: why };
  const p = league.players[pid];
  const sh = p.rfa!.sheet!;
  const t = league.teams[sh.tid];
  settleSheet(league, p, match);
  return match
    ? { ok: true, reason: `Matched: ${playerName(p)} stays on ${yrs(sh.years)} at ${money(p.contract.salaries[0])}.` }
    : { ok: true, reason: `${playerName(p)} joins the ${t.name} on their offer sheet.` };
}

/**
 * Offer sheets whose last match day is `through` or earlier are decided (all of them when the
 * market closes): an AI team by aiMatchVerdict; the user's own restricted free agent, left
 * unanswered, goes to the team that signed him. The user hears about his own and the ones he signed.
 */
export function resolveOfferSheets(league: League, through = Infinity) {
  const due = pendingSheets(league)
    .filter((p) => p.rfa!.sheet!.until <= through)
    .sort((a, b) => a.rfa!.sheet!.until - b.rfa!.sheet!.until || a.pid - b.pid);
  const user = league.userTid;
  for (const p of due) {
    const r = p.rfa!;
    const sh = r.sheet!;
    const name = playerName(p);
    const terms = `${yrs(sh.years)} / ${money(sheetTotal(league, p, sh))}`;
    if (r.tid === user && !league.fired) {
      settleSheet(league, p, false);
      addInbox(league, {
        from: 'Assistant GM',
        subject: `${name} joins ${league.teams[sh.tid].abbrev}`,
        body: `We didn't match ${name}'s offer sheet by the deadline, so he joins the ${teamName(league, sh.tid)} on it (${terms}). His cap hold is off our books.`,
        tone: 'bad',
        link: `/player/${p.pid}`,
      });
      continue;
    }
    const verdict = aiMatchVerdict(league, p);
    settleSheet(league, p, verdict.match);
    if (sh.tid !== user) continue;
    const own = league.teams[r.tid];
    addInbox(league, {
      from: 'Assistant GM',
      subject: verdict.match ? `${own.abbrev} matched our offer sheet for ${name}` : `${name} is ours`,
      body: verdict.match
        ? `The ${teamName(league, r.tid)} matched our offer sheet for ${name} (${terms}): ${verdict.why}. He stays with them, and the room the sheet held is free again${isException(sh.route) ? `, ${EXCEPTIONS[sh.route].name} included` : ''}.`
        : `The ${teamName(league, r.tid)} declined to match our offer sheet: ${verdict.why}. ${name} joins us on it (${terms}) and has been added to the end of your rotation.`,
      tone: verdict.match ? 'neutral' : 'good',
      link: `/player/${p.pid}`,
    });
  }
}

/**
 * Free agency closes (offer sheets decided first): each restricted free agent still unsigned takes
 * his qualifying offer, one season with his team, and is unrestricted after it. A team at the
 * offseason limit (21) can't take him back: his offer lapses and he stays a free agent. The user
 * hears about his own; the notable ones make the news.
 */
export function acceptQualifyingOffers(league: League) {
  const next = contractSeason(league);
  const took: Player[] = [];
  const lapsed: Player[] = [];
  for (const p of restrictedFreeAgents(league)) {
    const r = p.rfa!;
    if (r.sheet) continue;
    if (summerRoster(league, r.tid) >= OFFSEASON_ROSTER_MAX) {
      if (r.tid === league.userTid) lapsed.push(p);
      delete p.rfa;
      continue;
    }
    const tid = r.tid;
    signPlayer(league, p, tid, r.qo, 1, { start: next, news: false, log: false });
    p.contract.qualifying = true;
    logMove(league, 'qualify', tid, p, { amount: p.contract.salaries[0], years: 1, note: 'accepted' });
    took.push(p);
  }
  const news = took.filter((p) => p.ovr >= 70);
  if (news.length)
    addNews(league, {
      kind: 'signing',
      text: `Qualifying offers taken: ${news
        .slice(0, 6)
        .map((p) => `${playerName(p)} (${league.teams[p.tid].abbrev})`)
        .join(', ')}${news.length > 6 ? ` and ${news.length - 6} more` : ''}. Each plays a season on his and is unrestricted next summer.`,
      tids: [...new Set(news.map((p) => p.tid))],
      pids: news.map((p) => p.pid),
    });
  const mine = took.filter((p) => p.tid === league.userTid);
  if (mine.length || lapsed.length)
    addInbox(league, {
      from: 'Assistant GM',
      subject: mine.length === 1 && !lapsed.length ? `${playerName(mine[0])} takes his qualifying offer` : 'Qualifying offers',
      body: [
        ...mine.map((p) => `${playerName(p)} signed his qualifying offer: one season at ${money(salaryFor(p, next))}. He'll be an unrestricted free agent next summer.`),
        lapsed.length
          ? `${andList(lapsed.map(playerName))}'s qualifying offer${lapsed.length > 1 ? 's' : ''} lapsed: our roster was full (${OFFSEASON_ROSTER_MAX}) when free agency closed, so ${lapsed.length > 1 ? "they're unrestricted free agents" : "he's an unrestricted free agent"}.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      tone: lapsed.length ? 'alert' : 'neutral',
      link: mine.length === 1 && !lapsed.length ? `/player/${mine[0].pid}` : '/office',
    });
}
