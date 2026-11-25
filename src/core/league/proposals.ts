// AI teams' trade offers to the user (proposals): real deals the offering team has already said yes
// to, posted to the inbox and the Trade screen's Offers tab, where the user accepts, counters or
// declines them. They come about once every ten days in season and every third day in the ten
// before the deadline, one around opening night (none of these while a newcomer's guide runs: see
// agenda.ts's guideWeeks), for the user's first-round pick on draft night
// and, from taxpayers, as salary dumps when free agency opens. None is a fleecing: each is at worst
// slightly against the user in neutral value. Offers draw on their own random stream (seeded by
// the league, the date and the purpose), so the league's stream (games, injuries) never moves.
// When a team's two-team offer can't be made (the salary it would send back is what spoils it), it
// may call a third team in to take that salary (aiTrades.ts's facilitatedDeal): a three-team offer,
// kept as its legs beside the user's view of it (Proposal.legs).
// The user's staff rates each one (offerRating: by neutral value and by what it does to his five
// best), and a long sim stops only for the ones the setting says (Settings.offerStops: the good
// ones by default, see stopsForOffer); the rest wait in the queue and the digest. A pitch he turned
// down isn't made again (see turnedDown), and no team asks a competing user for one of his five
// best without a player near his level coming back. Each GM's note gives his own team's reason:
// its record and seat, the roster quality it ranks low in that the player lifts, the veteran's
// age and contract, the tax bill.
// Also here: the players the user marks untouchable, whom no AI team asks for.

import type { DraftPick, League, Player, Proposal, Team } from '../types';
import { Rng, hashString } from '../random';
import { CAP_FOR, addInbox, andList, contractSeason, curTeamSeason, fmtDate, playerName, readsOnly, sentence, shortName, standardRoster, teamCity, payroll } from './helpers';
import { tradeValue } from './contracts';
import { nextPick } from './draft';
import {
  capSalary,
  evaluateDeal,
  evaluateTrade,
  executeDeal,
  executeTrade,
  legsOf,
  pickLabel,
  tradedAwayBy,
  untradeable,
  validateDeal,
  validateTrade,
  type TradeLeg,
  type TradeOffer,
} from './trades';
import { facilitatedDeal } from './aiTrades';
import { dumpPackage, neutralBalance, packageFor } from './tradePackages';
import { makeItWork } from './tradeHelp';
import { plural } from '../format';
import { guideWeeks } from './agenda';
import { tradeRequests } from './pulse';
import { takesCalls } from './voices';
import { rosterProfile, type ProfileKey } from '../ai/coachAI';
import { confStandings } from './standings';
import { money, ordinal } from '../format';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import { teamTaxBill } from './finances';

/** Offers open at once, at most (one per team). */
export const MAX_OPEN = 4;
/** How far an offer may run against the user in neutral value: this share of what he sends. */
const USER_SLACK = 0.1;
/** Days an in-season or summer offer stands (one is drawn per offer). */
const STANDS = [5, 7] as const;
/** Days before the same pitch (the same player bought or sold, the same team's salary dump) can come again. */
const PITCH_REST = 21;
/**
 * ...and once the user has turned it down: the same team doesn't make it again that season, and
 * another only after this many days, with an offer worth more to him than the one he turned down
 * (BETTER_BY of what he'd send). On PITCH_REST alone a cheap young player was asked for five times
 * in a season, each time by another team with the same kind of package (the playtest, 2026-11-23).
 */
export const DECLINED_REST = 60;
const BETTER_BY = 0.1;
/** Declined pitches kept (the season's). */
const LOG_KEPT = 60;

/** An offer found, before it's posted; `pitch` names what it's about, for the rest between pitches ("sell:812"); `legs` when a third team is in it. */
type Pitch = { tid: number; offer: TradeOffer; kind: Proposal['kind']; note: string; pitch: string; legs?: TradeLeg[] };

/** An offer as its legs: a three-team offer's own, a two-team offer's two. */
export const proposalLegs = (p: Pick<Proposal, 'offer' | 'legs'>): TradeLeg[] => p.legs ?? legsOf(p.offer);

/** The third team in a three-team offer (the one that isn't the user's or the team that called), or null. */
export const proposalThird = (league: League, p: Pick<Proposal, 'tid' | 'legs'>): number | null =>
  p.legs?.flatMap((l) => [l.tid, l.to]).find((tid) => tid !== league.userTid && tid !== p.tid) ?? null;

/** A three-team deal as the user sees it, added up: all he sends, and all he gets (in the name of the team that called). */
function userView(league: League, legs: TradeLeg[], lead: number): TradeOffer {
  const user = league.userTid;
  const out = legs.filter((l) => l.tid === user);
  const inc = legs.filter((l) => l.to === user);
  return {
    a: { tid: user, pids: out.flatMap((l) => l.pids), dpids: out.flatMap((l) => l.dpids) },
    b: { tid: lead, pids: inc.flatMap((l) => l.pids), dpids: inc.flatMap((l) => l.dpids) },
  };
}

export const openProposals = (league: League): Proposal[] => league.proposals ?? [];

// ---------------------------------------------------------------- the staff's read of an offer

export type OfferRating = 'good' | 'fair' | 'poor';

/** An offer this share of what the user sends (or gets, when that is more) in his favor in neutral value is a good one; that far against him, a poor one. */
export const GOOD_SHARE = 0.05;
/** His best players by OVR that count as his core while he competes, and how close in OVR a player coming back must be for a deal that takes one to be a basketball trade. */
const CORE = 5;
const CORE_BACK = 4;

/** The user's five best players (by OVR) while his team competes: nobody's for picks and filler. None for a rebuilding team. */
function userCore(league: League): Player[] {
  if (league.teams[league.userTid].strategy === 'rebuild') return [];
  return standardRoster(league, league.userTid)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, CORE);
}

/** The core player a deal takes without a player near his level coming back, if any. */
function coreCost(league: League, offer: TradeOffer): Player | null {
  const back = Math.max(0, ...offer.b.pids.map((pid) => league.players[pid]?.ovr ?? 0));
  return userCore(league).find((p) => offer.a.pids.includes(p.pid) && back < p.ovr - CORE_BACK) ?? null;
}

/**
 * The staff's read of an AI team's offer: good, fair or poor for the user, with the reason in a
 * line. By neutral value (the AI's own scale, see neutralBalance: GOOD_SHARE either way), and poor
 * whatever the value when it takes one of his five best while he competes and nothing near his
 * level comes back. The Offers tab's tag and what a long sim stops for read the same call.
 */
export function offerRating(league: League, p: Pick<Proposal, 'offer'>): { rating: OfferRating; label: string; why: string } {
  const { net, out } = neutralBalance(league, p.offer);
  const share = net / Math.max(1, out, out + net);
  const core = coreCost(league, p.offer);
  if (core)
    return {
      rating: 'poor',
      label: 'Costs your core',
      why: `It takes ${shortName(league, core)}, one of your five best, and no player near his level comes back.`,
    };
  if (share > GOOD_SHARE) return { rating: 'good', label: 'In your favor', why: 'Your staff has you ahead on value.' };
  if (share < -GOOD_SHARE) return { rating: 'poor', label: 'A little short', why: 'Your staff has you a little short on value.' };
  return { rating: 'fair', label: 'Fair value', why: 'Your staff calls it even on value.' };
}

/** What long sims stop for among AI teams' offers (Settings.offerStops): the ones the staff rates good, unless he chose all or none. */
export const offerStops = (league: Pick<League, 'settings'>): 'good' | 'all' | 'never' => league.settings.offerStops ?? 'good';

/** Whether this open offer stops a long sim the day it comes in. A draft-night offer for the pick on the clock always shows: the draft waits on him anyway. */
export function stopsForOffer(league: League, p: Proposal): boolean {
  const mode = offerStops(league);
  if (p.kind === 'pick' || mode === 'all') return true;
  return mode === 'good' && offerRating(league, p).rating === 'good';
}

/** The pitch a declined offer stood for, and how far in the user's favor it was (neutral value, and what he'd have sent). */
function logDecline(league: League, p: Proposal) {
  if (!p.pitch || p.kind === 'pick') return;
  const { net, out } = neutralBalance(league, p.offer);
  const log = (league.offerLog ?? []).filter((x) => x.season === league.season);
  log.push({ pitch: p.pitch, tid: p.tid, season: league.season, day: league.day, net: Math.round(net), out: Math.round(out) });
  league.offerLog = log.slice(-LOG_KEPT);
}

/** The latest time the user turned this pitch down this season, if he did. */
const lastDecline = (league: League, pitch: string) => (league.offerLog ?? []).filter((x) => x.season === league.season && x.pitch === pitch).at(-1);

/**
 * A pitch the user turned down doesn't come again from that team this season, nor from any team
 * for DECLINED_REST days; after that only as an offer worth more to him than the one he declined
 * (see beatsDeclined).
 */
function turnedDown(league: League, pitch: string, tid?: number): boolean {
  const log = (league.offerLog ?? []).filter((x) => x.season === league.season && x.pitch === pitch);
  return log.some((x) => x.tid === tid || league.day - x.day < DECLINED_REST);
}

/** An offer for a pitch he once turned down must be worth more to him than that one was: by BETTER_BY of what he'd send. */
function beatsDeclined(league: League, pitch: string, offer: TradeOffer): boolean {
  const was = lastDecline(league, pitch);
  if (!was) return true;
  const { net, out } = neutralBalance(league, offer);
  return net >= was.net + BETTER_BY * Math.max(out, was.out, 1);
}

/** A random stream of its own for one purpose on one day: the league's stream never moves for offers. */
const offerRng = (league: League, purpose: string) => new Rng(hashString(`${league.id}:${league.season}:${league.day}:${purpose}`));

// ---------------------------------------------------------------- untouchables

/** Did the user mark this player of his untouchable? */
export function isUntouchable(league: League, pid: number): boolean {
  return !!league.untouchable?.includes(pid) && league.players[pid]?.tid === league.userTid;
}

/** Mark (or unmark) one of the user's players untouchable: any open offer that asks for him is withdrawn. */
export function setUntouchable(league: League, pid: number, on: boolean) {
  if (league.players[pid]?.tid !== league.userTid) return;
  const list = (league.untouchable ?? []).filter((x) => x !== pid);
  league.untouchable = on ? [...list, pid] : list;
  if (on) cleanProposals(league);
}

// ---------------------------------------------------------------- open offers

/**
 * An AI team's own offer still stands when the deal has drifted this share of what it sends against
 * it since (an injury's share of the season left, a pick's projection): offers are made at or just
 * over even, so a day's drift turned them down at once.
 */
const STANDS_DRIFT = 0.03;

/** Why an offer can't be taken now (it expired, the rules or the other GM's mind changed), or null. */
export function proposalError(league: League, p: Proposal): string | null {
  if (p.offer.a.tid !== league.userTid) return 'That offer was made to another team.';
  if (p.season !== league.season || league.day > p.expires) return 'The offer has expired.';
  const errors = p.legs ? validateDeal(league, p.legs) : validateTrade(league, p.offer);
  if (errors.length) return errors[0];
  const asked = p.offer.a.pids.find((pid) => isUntouchable(league, pid));
  if (asked !== undefined) return `You made ${playerName(league.players[asked])} untouchable.`;
  // a three-team offer stands while both other teams still take it (each through the same small drift)
  if (p.legs) {
    const no = evaluateDeal(league, p.legs).teams.find((t) => !t.accept && (t.parts.tooManyFirsts || t.delta < -STANDS_DRIFT * Math.abs(t.valueOut)));
    return no ? `${teamCity(league, no.tid)} has changed its mind.` : null;
  }
  // (its own offer stands through a small drift in values as the days pass: STANDS_DRIFT of what it sends)
  const ev = evaluateTrade(league, p.offer);
  return ev.accept || (ev.ok && !ev.parts.tooManyFirsts && ev.delta >= -STANDS_DRIFT * Math.abs(ev.valueOut)) ? null : `${teamCity(league, p.tid)} has changed its mind.`;
}

/** An offer whose mail is still unread stands at least this many days more, up to OFFER_MAX_DAYS days after it was made. */
const UNSEEN_LEFT = STANDS[0];
/** The longest an offer stands: one the user hasn't seen yet, three weeks after it was made (see holdUnseen). */
export const OFFER_MAX_DAYS = PITCH_REST;

/**
 * The user has had every open offer in front of him (Today's Needs you and the bell list them all,
 * the Offers tab each in full): from now on their dates stand as shown. Called as a sim starts (it
 * starts from a screen with them on it) and as the Offers tab shows them.
 */
export function markOffersSeen(league: League) {
  for (const p of openProposals(league)) p.seen = true;
}

/**
 * An offer's days run from when the user could see it: while he hasn't (it came during a long sim,
 * its mail unread), it stands at least UNSEEN_LEFT days more, up to OFFER_MAX_DAYS days after it was
 * made, and its mail says the new date; once he has (see markOffersSeen), the date shown no longer
 * moves. The trade deadline (or a pick being made) still ends it.
 */
function holdUnseen(league: League) {
  // (never past the trade deadline: the offer would read as standing after trading closed)
  const last = league.phase === 'regular' ? league.tradeDeadlineDay : Infinity;
  for (const p of openProposals(league)) {
    if (p.kind === 'pick' || p.season !== league.season) continue;
    const mail = league.inbox.find((m) => m.proposal === p.id);
    const was = p.expires;
    if (mail && !mail.read && !p.seen) p.expires = Math.max(p.expires, Math.min(league.day + UNSEEN_LEFT, p.day + OFFER_MAX_DAYS, last));
    p.expires = Math.min(p.expires, Math.max(last, league.day));
    if (mail && p.expires !== was) mail.body = mail.body.replace(/It stands until [^.]+\./, standsText(league, p));
  }
}

/** "It stands until Oct 25.", as an offer's mail says it. */
const standsText = (league: League, p: Proposal) =>
  p.kind === 'pick'
    ? 'It stands until the pick is made.'
    : p.expires === league.day
      ? 'It stands until the end of today.'
      : `It stands until ${fmtDate(league.season, p.expires)}.`;

/**
 * Drop offers that expired or stopped being valid (an asset moved, the deadline passed, the AI's
 * view changed), and untouchables who left the user's team. Daily and at every phase change. An
 * offer the user hasn't seen yet keeps standing (see holdUnseen).
 */
export function cleanProposals(league: League) {
  if (league.untouchable) league.untouchable = league.untouchable.filter((pid) => league.players[pid]?.tid === league.userTid);
  if (!league.proposals?.length) return;
  holdUnseen(league);
  const open = league.proposals;
  const keep = open.filter((p) => !proposalError(league, p));
  if (keep.length !== open.length) league.proposals = keep;
}

/** Take an offer: checked again (rules, value, expiry) before it goes through. */
export function acceptProposal(league: League, id: number): { ok: boolean; reason: string } {
  const p = openProposals(league).find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'That offer is no longer on the table.' };
  const err = proposalError(league, p);
  league.proposals = openProposals(league).filter((x) => x.id !== id);
  if (err) return { ok: false, reason: err };
  const third = proposalThird(league, p);
  if (p.legs) executeDeal(league, p.legs);
  else executeTrade(league, p.offer);
  // the deal can make other offers impossible (the same player, a full roster)
  cleanProposals(league);
  const C = teamCity(league, p.tid);
  return { ok: true, reason: third !== null ? `Three-team trade done with ${C} and ${teamCity(league, third)}.` : `Trade done with ${C}.` };
}

/** Turn an offer down: it goes, and the pitch is remembered (see turnedDown): the same ask doesn't come back next week. */
export function declineProposal(league: League, id: number): boolean {
  const p = openProposals(league).find((x) => x.id === id);
  if (!p) return false;
  logDecline(league, p);
  league.proposals = openProposals(league).filter((x) => x.id !== id);
  return true;
}

// ---------------------------------------------------------------- making offers

/** At worst slightly against the user in neutral value (the extra players in the bigger half count for less). */
function fair(league: League, offer: TradeOffer, slack = USER_SLACK): boolean {
  const { net, out } = neutralBalance(league, offer);
  return net >= -slack * Math.max(0, out);
}

/** "Name (78)" or a pick's label, for each asset on one side of a deal, in a list. */
export const assetText = (league: League, side: TradeOffer['a']) =>
  andList([
    ...side.pids.map((pid) => `${playerName(league.players[pid])} (${league.players[pid].ovr})`),
    ...side.dpids.flatMap((d) => {
      const dp = league.draftPicks.find((x) => x.dpid === d);
      return dp ? [`the ${pickLabel(league, dp)}`] : [];
    }),
  ]) || 'nothing';

/** One side of a deal in a headline: its players by name (a teammate's twin told apart), then its picks counted ("Kennard + 2 picks"); a lone pick of this draft whose slot is set, by number ("pick #12"). */
function sideHeadline(league: League, side: TradeOffer['a']): string {
  const picks = side.dpids.map((d) => league.draftPicks.find((x) => x.dpid === d)).filter((d): d is DraftPick => !!d);
  const lone = !side.pids.length && picks.length === 1 && picks[0].pick && picks[0].season === league.season ? picks[0] : null;
  if (lone) return `pick #${(lone.round - 1) * league.teams.length + lone.pick!}`;
  return [...side.pids.map((pid) => shortName(league, league.players[pid])), ...(picks.length ? [plural(picks.length, 'pick')] : [])].join(' + ');
}

/**
 * An offer's headline, the same in the inbox and on the agenda, naming both sides: "PHX want
 * Kenrich Williams + 3 picks for Kennard", "MIL offer Portis + 2 picks for nothing".
 */
export function offerSubject(league: League, offer: TradeOffer, third: number | null = null): string {
  const abbrev = league.teams[offer.b.tid].abbrev;
  const yours = sideHeadline(league, offer.a);
  const theirs = sideHeadline(league, offer.b);
  const line = yours ? `${abbrev} want ${yours} for ${theirs || 'nothing'}` : `${abbrev} offer ${theirs} for nothing`;
  // (a three-team offer says so, and who the third is)
  return third !== null ? `${line}, with ${league.teams[third].abbrev}` : line;
}

/** What a third team does in a three-team offer, as the calling GM's mail says it. */
function thirdText(league: League, p: Pick<Proposal, 'tid' | 'legs'>): string {
  const third = proposalThird(league, p);
  if (third === null || !p.legs) return '';
  const name = teamCity(league, third);
  const takes = p.legs.filter((l) => l.to === third);
  const from = takes[0]?.tid;
  const what = assetText(league, { tid: third, pids: takes.flatMap((l) => l.pids), dpids: takes.flatMap((l) => l.dpids) });
  return from === league.userTid ? ` You'd send ${what} to ${name}, which has the room for it.` : ` ${name} takes ${what} from us to make the money work.`;
}

/** Post an offer (if it is still one the team accepts and the user would want), with its inbox message. */
function post(league: League, pitch: Pitch, rng: Rng, lastDay?: number): Proposal | null {
  const open = openProposals(league);
  if (open.length >= MAX_OPEN || open.some((p) => p.tid === pitch.tid)) return null;
  // a player is in one open offer at a time (the one it's about, or a part of its package, a third team's leg too)
  const players = (o: Pick<Proposal, 'offer' | 'legs'>) => (o.legs ? o.legs.flatMap((l) => l.pids) : [...o.offer.a.pids, ...o.offer.b.pids]);
  if (open.some((p) => players(p).some((pid) => players(pitch).includes(pid)))) return null;
  const days = rng.int(STANDS[0], STANDS[1]);
  const p: Proposal = {
    id: league.nextProposalId ?? 1,
    tid: pitch.tid,
    offer: structuredClone(pitch.offer),
    kind: pitch.kind,
    note: pitch.note,
    pitch: pitch.pitch,
    season: league.season,
    day: league.day,
    expires: Math.max(league.day, Math.min(league.day + days, lastDay ?? Infinity)),
    ...(pitch.legs ? { legs: structuredClone(pitch.legs).map(({ tid, to, pids, dpids }) => ({ tid, to, pids, dpids })) } : {}),
  };
  // every offer is one the team takes and the rules allow, the day it is made, and one he hasn't
  // turned down already unless it's worth more to him than that one was
  if (proposalError(league, p) || !beatsDeclined(league, pitch.pitch, p.offer)) return null;
  league.nextProposalId = p.id + 1;
  league.proposals = [...open, p];
  const t = league.teams[p.tid];
  const user = league.userTid;
  const until = standsText(league, p);
  const lead = p.legs ? p.legs.filter((l) => l.tid === user && l.to === p.tid) : [p.offer.a];
  const toLead = { tid: user, pids: lead.flatMap((l) => l.pids), dpids: lead.flatMap((l) => l.dpids) };
  const ask = toLead.pids.length || toLead.dpids.length ? `for ${assetText(league, toLead)}` : 'and want nothing back';
  const from = `${t.region} ${t.name} GM`;
  // the same pitch made again this season replaces its earlier mail: one message per pitch, the latest on top
  league.inbox = league.inbox.filter((m) => !(m.season === league.season && m.pitch === pitch.pitch && m.from === from));
  addInbox(league, {
    from,
    subject: offerSubject(league, p.offer, proposalThird(league, p)),
    pitch: pitch.pitch,
    body: `${p.note}\n${sentence(`We'd send ${assetText(league, p.offer.b)} ${ask}`)}${thirdText(league, p)} ${until}`,
    tone: 'neutral',
    link: '/office/trade?tab=offers',
    proposal: p.id,
  });
  return p;
}

const age = (league: League, p: Player) => league.season - p.bornYear;

/** Does the player fit the team's plan: help now for a contender, youth for a rebuilder, a starter in his prime otherwise. */
function fits(league: League, t: Team, p: Player): boolean {
  if (t.strategy === 'contend') return p.ovr >= 74 && age(league, p) <= 33;
  if (t.strategy === 'rebuild') return age(league, p) <= 25;
  return p.ovr >= 72 && age(league, p) <= 30;
}

/** Teams that can make an offer now: not the user's, and without one already open. */
/** The AI teams that might call the user today: none with an offer already open, and only front offices taking calls (voices.ts's takesCalls). */
const free = (league: League) => {
  const busy = new Set(openProposals(league).map((p) => p.tid));
  return league.teams.filter((t) => t.tid !== league.userTid && !busy.has(t.tid) && takesCalls(league, t.tid));
};

/**
 * Is a pitch about this player out already (in an open offer), or was this pitch mailed in the last
 * PITCH_REST days? Then it isn't made again: a player has one live pitch at a time, and a declined
 * or lapsed one rests a while before it comes back.
 */
function pitchedLately(league: League, pid: number, pitch: string, tid?: number): boolean {
  if (openProposals(league).some((p) => p.offer.a.pids.includes(pid) || p.offer.b.pids.includes(pid))) return true;
  if (turnedDown(league, pitch, tid)) return true;
  return league.inbox.some((m) => m.season === league.season && m.pitch === pitch && league.day - m.day < PITCH_REST);
}

/** A player's spot on the floor, as a GM talks about it. */
const spot = (p: Player) => (p.pos === 'PG' || p.pos === 'SG' ? 'guard' : p.pos === 'C' || p.pos === 'PF' ? 'big' : 'wing');

/** Roster qualities a GM names as a need, in his words (the playbooks' roster profile: coachAI's rosterProfile). */
const NEED_WORD: Partial<Record<ProfileKey, string>> = {
  shooting: 'three-point shooting',
  rimProtection: 'rim protection',
  perimeterD: 'perimeter defense',
  passing: 'passing',
  starCreator: 'shot creation',
  size: 'size',
  athleticism: 'speed and athleticism',
};
/** A team ranks this low or lower in a quality for it to be a need a GM names, and the player must lift it this much (the profile's own scale). */
const NEED_RANK = 20;
const NEED_LIFT = 1.5;

/**
 * The roster quality a team ranks lowest in the league in (NEED_RANK or worse, by its best eight)
 * that this player would lift (NEED_LIFT or more): the reason a GM gives that is about his own
 * team. Null when he fills no such hole.
 */
function needHeFills(league: League, t: Team, target: Player): { word: string; rank: number } | null {
  const mine = standardRoster(league, t.tid);
  const now = rosterProfile(mine);
  const withHim = rosterProfile([...mine, target]);
  const others = league.teams.filter((x) => x.tid !== t.tid).map((x) => rosterProfile(standardRoster(league, x.tid)));
  let best: { word: string; rank: number } | null = null;
  for (const k of Object.keys(NEED_WORD) as ProfileKey[]) {
    if (withHim[k] - now[k] < NEED_LIFT) continue;
    const rank = 1 + others.filter((o) => o[k] > now[k]).length;
    if (rank >= NEED_RANK && (!best || rank > best.rank)) best = { word: NEED_WORD[k]!, rank };
  }
  return best;
}

/** A team's record and conference seat once ten games are in: "30-12, 3rd in the West". */
function standing(league: League, t: Team): { rec: string; seat: string; rank: number; winning: boolean } | null {
  const ts = curTeamSeason(league, t.tid);
  if (ts.won + ts.lost < 10) return null;
  const rank = confStandings(league, t.conf).find((r) => r.tid === t.tid)?.confRank ?? 15;
  return { rec: `${ts.won}-${ts.lost}`, seat: `${ordinal(rank)} in the ${t.conf === 'E' ? 'East' : 'West'}`, rank, winning: ts.won > ts.lost };
}

/** One of the lines that apply, picked by a hash of the day and the player: the same pitch doesn't always read the same, and the league's stream never moves. */
const pickLine = (league: League, pid: number, lines: (string | false | null | undefined)[]) => {
  const ok = lines.filter((x): x is string => !!x);
  return ok[hashString(`${league.id}:${league.season}:${league.day}:${pid}:note`) % ok.length];
};

/**
 * Why a team wants the user's player, in its GM's words, from its own situation: the roster quality
 * it ranks low in that he lifts (with the rank), its record and seat once ten games are in, a thin
 * spot he'd fill (fewer than two players at his spot within three points of him), or for a
 * rebuilder his age beside its young core's. A plan's stock line only when none of those applies.
 */
function buyNote(league: League, t: Team, target: Player): string {
  const last = shortName(league, target);
  const st = standing(league, t);
  const where = spot(target);
  const thin = standardRoster(league, t.tid).filter((x) => spot(x) === where && x.ovr >= target.ovr - 3).length < 2;
  const need = needHeFills(league, t, target);
  const needLine = need && `We're ${ordinal(need.rank)} in the league in ${need.word}, and ${last} fixes that.`;
  if (t.strategy === 'rebuild') {
    const a = playerAge(target, league.season);
    const core = standardRoster(league, t.tid)
      .filter((x) => playerAge(x, league.season) <= 24)
      .sort((x, y) => y.ovr - x.ovr)
      .slice(0, 2);
    return pickLine(league, target.pid, [
      core.length === 2 &&
        `${last} is ${a}. We're building around ${shortName(league, core[0])} (${playerAge(core[0], league.season)}) and ${shortName(league, core[1])} (${playerAge(core[1], league.season)}), and he grows with them.`,
      st && `We're ${st.rec} and playing for next year. ${last} is ${a}: he'll still be getting better when we're ready.`,
      needLine,
      !core.length && !st && `${last} fits our timeline: we're building around young players.`,
    ]);
  }
  if (t.strategy === 'contend')
    return pickLine(league, target.pid, [
      needLine,
      st && st.winning && `We're ${st.rec}, ${st.seat}, and ${thin ? `short a ${where}` : 'one piece short'} for the playoffs. ${last} is that piece.`,
      st && !st.winning && `We're built to win and we're ${st.rec}. Something has to change, and ${last} changes it.`,
      !needLine && !st && (thin ? `We need another ${where} for a playoff run, and ${last} is the one we want.` : `We're going for it this season, and ${last} makes us better right away.`),
    ]);
  return pickLine(league, target.pid, [
    needLine,
    thin && `We're thin at ${where}${st ? ` and ${st.seat} at ${st.rec}` : ''}. ${last} would start for us.`,
    st &&
      !thin &&
      (st.rank <= 6
        ? `We're ${st.rec}, ${st.seat}, and we want to stay out of the play-in. ${last} keeps us there.`
        : st.rank <= 10
          ? `We're ${st.rec}, ${st.seat}, in the play-in as it stands. ${last} gets us out of it.`
          : `We're ${st.rec}, ${st.seat}, and not done with this season. ${last} gets us back in the race.`),
    !needLine && !thin && !st && `We're retooling on the fly, and ${last} is the kind of player we want.`,
  ]);
}

/**
 * Why a rebuilder sells a veteran, in its GM's words: its record, his age and what is left on his
 * deal, and the young player at his spot who'd get his minutes. "We're rebuilding, and X doesn't fit
 * our timeline. He can help a team like yours win now." had been every such offer's note.
 */
function sellNote(league: League, t: Team, vet: Player): string {
  const last = shortName(league, vet);
  const a = playerAge(vet, league.season);
  const st = standing(league, t);
  const cs = contractSeason(league);
  const years = Math.max(1, contractExp(vet.contract) - cs + 1);
  const sal = money(salaryFor(vet, cs));
  const kid = standardRoster(league, t.tid)
    .filter((x) => x.pid !== vet.pid && spot(x) === spot(vet) && playerAge(x, league.season) <= 23)
    .sort((x, y) => y.pot - x.pot || y.ovr - x.ovr)[0];
  const rec = st ? `We're ${st.rec}` : "We're rebuilding";
  return pickLine(league, vet.pid, [
    kid && `${rec}, and ${last} is ${a}. ${shortName(league, kid)} (${playerAge(kid, league.season)}) needs his minutes, so we'd rather have what you'd send.`,
    years <= 1
      ? `${rec}, and ${last}'s deal (${sal}) is up this summer. Better something from you now than nothing in July.`
      : `${rec}. ${last} is ${a} with ${years} seasons left at ${sal}, and he'll be past it by the time we're good.`,
    st && st.rank >= 11 && `We're ${st.seat} and going nowhere this year. ${last} (${a}) should be playing in May, and it won't be here.`,
  ]);
}

/** Teams that try a three-team offer for one player once their two-team offer fails. */
const THIRD_TRIES = 2;

/** The user's yes in a three-team offer an AI team builds: fair to him in neutral value, as every offer is (the AI teams answer for themselves). */
const userAgrees = (league: League, lead: number) => (tid: number, legs: TradeLeg[]) => (tid === league.userTid ? fair(league, userView(league, legs, lead)) : undefined);

/**
 * An AI team wants one of the user's players (70+, not untouchable) that fits its plan, and offers
 * its best package for him (see packageFor). Two players are tried, each with up to six teams.
 */
function tryBuy(league: League, rng: Rng): Pitch | null {
  const targets = standardRoster(league, league.userTid).filter(
    (p) => p.ovr >= 70 && !isUntouchable(league, p.pid) && !untradeable(league, p) && !pitchedLately(league, p.pid, `buy:${p.pid}`),
  );
  for (let k = 0; k < 2 && targets.length; k++) {
    // (any of them alike, on one draw of the stream)
    const target = targets.splice(rng.weighted(targets.map(() => 1)), 1)[0];
    const pitch = `buy:${target.pid}`;
    let thirds = THIRD_TRIES;
    for (const t of rng.shuffle(free(league).filter((x) => fits(league, x, target) && !turnedDown(league, pitch, x.tid))).slice(0, 6)) {
      const pkg = packageFor(league, t.tid, { pids: [target.pid], dpids: [] });
      // (one of his five best while he competes goes only for a player near his level: no picks and
      // filler for a contender's starter, see coreCost; and nothing he has turned down unless it beats that)
      const ok = (o: TradeOffer) => fair(league, o) && !coreCost(league, o) && beatsDeclined(league, pitch, o);
      if (pkg && ok(pkg.offer)) return { tid: t.tid, offer: pkg.offer, kind: 'buy', note: buyNote(league, t, target), pitch };
      // the salary it would have to send back spoils the offer: a third team with room takes it instead
      if (thirds-- <= 0) continue;
      const legs = facilitatedDeal(league, t.tid, league.userTid, target, { agrees: userAgrees(league, t.tid) });
      if (legs && ok(userView(league, legs, t.tid))) return { tid: t.tid, offer: userView(league, legs, t.tid), legs, kind: 'buy', note: buyNote(league, t, target), pitch };
    }
  }
  return null;
}

/**
 * A rebuilder offers a veteran (74+, 27 or older) for what "what would make this work?" says it
 * needs from the user, never his two best players. Its lens discounts the veterans the user would
 * send to match salary, so many asks run too far against the user to be offered: up to three
 * veterans of up to four rebuilders are tried.
 */
function trySell(league: League, rng: Rng): Pitch | null {
  const user = league.userTid;
  const keep = standardRoster(league, user)
    .sort((a, b) => tradeValue(league, b) - tradeValue(league, a))
    .slice(0, 2)
    .map((p) => p.pid);
  // a star who has asked his team for a trade (pulse.ts): it calls around, the user included, whatever either team's plan
  const busy = new Set(openProposals(league).map((p) => p.tid));
  for (const star of tradeRequests(league).slice(0, 3)) {
    if (busy.has(star.tid) || untradeable(league, star) || tradedAwayBy(league, star, user) || pitchedLately(league, star.pid, `sell:${star.pid}`, star.tid)) continue;
    const ask = makeItWork(league, { a: { tid: user, pids: [], dpids: [] }, b: { tid: star.tid, pids: [star.pid], dpids: [] } }, keep);
    const note = `${shortName(league, star)} has asked us for a trade. We'd rather make a deal now than lose him for nothing.`;
    if (ask.offer && fair(league, ask.offer)) return { tid: star.tid, offer: ask.offer, kind: 'sell', note, pitch: `sell:${star.pid}` };
    // (the salary the user would send back is what spoils it: a third team with room takes it)
    const legs = facilitatedDeal(league, user, star.tid, star, { keep: new Set([...keep, ...(league.untouchable ?? [])]), agrees: userAgrees(league, star.tid) });
    if (legs) return { tid: star.tid, offer: userView(league, legs, star.tid), legs, kind: 'sell', note, pitch: `sell:${star.pid}` };
  }
  // a rebuilding team isn't in the market for veterans
  if (league.teams[user].strategy === 'rebuild') return null;
  for (const t of rng.shuffle(free(league).filter((x) => x.strategy === 'rebuild')).slice(0, 4)) {
    const vets = standardRoster(league, t.tid)
      .filter((p) => p.ovr >= 74 && age(league, p) >= 27 && !untradeable(league, p) && !tradedAwayBy(league, p, user) && !pitchedLately(league, p.pid, `sell:${p.pid}`, t.tid))
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    for (const vet of vets.slice(0, 3)) {
      const ask = makeItWork(league, { a: { tid: user, pids: [], dpids: [] }, b: { tid: t.tid, pids: [vet.pid], dpids: [] } }, keep);
      if (!ask.offer || !fair(league, ask.offer)) continue;
      return {
        tid: t.tid,
        offer: ask.offer,
        kind: 'sell',
        note: sellNote(league, t, vet),
        pitch: `sell:${vet.pid}`,
      };
    }
  }
  return null;
}

/** Why a taxpayer dumps a contract, in its GM's words: how far over the line it is, the bill that comes with it, and the deal he'd take on. */
function dumpNote(league: League, t: Team, p: Player, picks: number): string {
  const cs = contractSeason(league);
  const pay = payroll(league, t.tid, cs);
  const over = pay - CAP_FOR(league, cs).luxuryTax;
  const bill = teamTaxBill(league, t.tid, pay, cs);
  const years = Math.max(1, contractExp(p.contract) - cs + 1);
  return `We're ${money(over)} over the luxury tax, a bill of ${money(bill)}. Take ${shortName(league, p)}'s ${money(salaryFor(p, cs))}${years > 1 ? ` for ${years} seasons` : ', which is up this summer'} and the pick${picks > 1 ? 's are' : ' is'} yours.`;
}

/** Contracts a taxpayer tries to dump on the user, its worst first (see tryDump). */
const DUMP_TRIES = 3;

/**
 * A taxpayer offers its worst contract it can pay off with picks attached, the cheapest first (the
 * cheapest makes way for a better one past three; two firsts at most), until the user comes out
 * ahead in neutral value. The user needs the cap room (or the salary going back) and the roster spot.
 */
function tryDump(league: League, rng: Rng): Pitch | null {
  const user = league.userTid;
  const cs = contractSeason(league);
  const tax = CAP_FOR(league, cs).luxuryTax;
  for (const t of rng.shuffle(free(league).filter((x) => payroll(league, x.tid, cs) > tax)).slice(0, 4)) {
    // its worst contracts first, up to DUMP_TRIES: a burden that three picks (two firsts at most)
    // can't pay off isn't one it can dump, so the next one is tried
    const bad = standardRoster(league, t.tid)
      .filter((p) => capSalary(league, p.pid) > 0 && !untradeable(league, p) && !tradedAwayBy(league, p, user) && tradeValue(league, p) < 0)
      .sort((a, b) => tradeValue(league, a) - tradeValue(league, b) || a.pid - b.pid)
      .slice(0, DUMP_TRIES);
    for (const p of bad) {
      if (pitchedLately(league, p.pid, `dump:${t.tid}`, t.tid)) break;
      const deal = dumpPackage(league, t.tid, user, p, (o) => fair(league, o, 0));
      if (!deal || !evaluateTrade(league, deal).accept) continue;
      return {
        tid: t.tid,
        offer: deal,
        kind: 'dump',
        note: dumpNote(league, t, p, deal.b.dpids.length),
        pitch: `dump:${t.tid}`,
      };
    }
  }
  return null;
}

const TRIES: Record<Proposal['kind'], ((league: League, rng: Rng) => Pitch | null) | null> = { buy: tryBuy, sell: trySell, dump: tryDump, pick: null };

/** One offer, of the first of `kinds` that finds one; `lastDay` caps how long it stands. */
function makeOffer(league: League, rng: Rng, kinds: Proposal['kind'][], lastDay?: number): Proposal | null {
  if (openProposals(league).length >= MAX_OPEN) return null;
  // (the searches only read the league, so its rosters and values are worked out once: see readsOnly)
  const pitch = readsOnly(league, () => {
    for (const k of kinds) {
      const x = TRIES[k]?.(league, rng);
      if (x) return x;
    }
    return null;
  });
  return pitch ? post(league, pitch, rng, lastDay) : null;
}

/** The order offer kinds are tried in: a draw for the first (mostly buys), then the others. */
function kindsFor(rng: Rng): Proposal['kind'][] {
  const all: Proposal['kind'][] = ['buy', 'sell', 'dump'];
  const first = all[rng.weighted([0.55, 0.3, 0.15])];
  return [first, ...all.filter((k) => k !== first)];
}

/** In season, up to the deadline: an offer about once every ten days, every third day in the last ten. */
export function aiProposals(league: League) {
  if (league.phase !== 'regular' || league.fired || league.day > league.tradeDeadlineDay) return;
  // (a newcomer's first games are the guide's: no offer lands on them)
  if (guideWeeks(league)) return;
  const rng = offerRng(league, 'offers');
  if (!rng.chance(league.tradeDeadlineDay - league.day < 10 ? 1 / 3 : 1 / 10)) return;
  makeOffer(league, rng, kindsFor(rng), league.tradeDeadlineDay);
}

/** Around opening night a team calls with an offer. */
export function openingProposal(league: League) {
  if (league.phase !== 'regular' || league.fired || guideWeeks(league)) return;
  const rng = offerRng(league, 'opening');
  makeOffer(league, rng, rng.chance(0.6) ? ['buy', 'sell'] : ['sell', 'buy'], league.tradeDeadlineDay);
}

/** Free agency opens: a user with cap room hears from a taxpayer or two that wants to dump salary. */
export function freeAgencyProposals(league: League) {
  if (league.phase !== 'freeAgency' || league.fired) return;
  const cs = contractSeason(league);
  if (payroll(league, league.userTid, cs) >= CAP_FOR(league, cs).salaryCap) return;
  const rng = offerRng(league, 'dumps');
  for (let i = 0; i < 2; i++) if (!makeOffer(league, rng, ['dump'])) break;
}

/** Draft night, the user on the clock in the first round: one or two teams offer to move up into his pick. */
export function draftProposals(league: League) {
  if (league.phase !== 'draft' || league.fired) return;
  // offers for a pick that has been made are gone
  cleanProposals(league);
  const dp = nextPick(league);
  if (!dp || dp.tid !== league.userTid || dp.round !== 1 || openProposals(league).some((p) => p.offer.a.dpids.includes(dp.dpid))) return;
  // teams call once about a pick: offers the user turned down aren't made again that night (the
  // same stream would make them again after his next trade)
  const pitch = `pick:${dp.dpid}`;
  if (league.inbox.some((m) => m.season === league.season && m.day === league.day && m.pitch === pitch)) return;
  const rng = offerRng(league, `pick:${dp.dpid}`);
  const n = rng.chance(0.5) ? 2 : 1;
  const found = rng
    .shuffle(free(league))
    .slice(0, 8)
    .flatMap((t) => {
      const pkg = packageFor(league, t.tid, { pids: [], dpids: [dp.dpid] });
      return pkg && fair(league, pkg.offer) ? [pkg] : [];
    });
  for (const pkg of found.sort((a, b) => b.myValue - a.myValue || a.tid - b.tid).slice(0, n))
    post(
      league,
      {
        tid: pkg.tid,
        offer: pkg.offer,
        kind: 'pick',
        note: `There's a player on the board we like at #${dp.pick}. Move down and pick up extra assets.`,
        pitch,
      },
      rng,
      league.day,
    );
}
