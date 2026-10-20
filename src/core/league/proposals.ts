// AI teams' trade offers to the user (proposals): real deals the offering team has already said yes
// to, posted to the inbox and the Trade screen's Offers tab, where the user accepts, counters or
// declines them. They come about once every ten days in season and every third day in the ten
// before the deadline, one around opening night, for the user's first-round pick on draft night
// and, from taxpayers, as salary dumps when free agency opens. None is a fleecing: each is at worst
// slightly against the user in neutral value. Offers draw on their own random stream (seeded by
// the league, the date and the purpose), so the league's stream (games, injuries) never moves.
// Also here: the players the user marks untouchable, whom no AI team asks for.

import type { DraftPick, League, Player, Proposal, Team } from '../types';
import { Rng, hashString } from '../random';
import { CAP_FOR, addInbox, andList, contractSeason, curTeamSeason, fmtDate, playerName, sentence, shortName, standardRoster } from './helpers';
import { tradeValue } from './contracts';
import { capPayroll, withHoldsMemo } from './freeAgency';
import { nextPick } from './draft';
import { capSalary, evaluateTrade, executeTrade, pickLabel, tradedAwayBy, untradeable, validateTrade, type TradeOffer } from './trades';
import { dumpPackage, neutralBalance, packageFor } from './tradePackages';
import { makeItWork } from './tradeHelp';
import { plural } from '../format';

/** Offers open at once, at most (one per team). */
export const MAX_OPEN = 4;
/** How far an offer may run against the user in neutral value: this share of what he sends. */
const USER_SLACK = 0.1;
/** Days an in-season or summer offer stands (one is drawn per offer). */
const STANDS = [5, 7] as const;
/** Days before the same pitch (the same player bought or sold, the same team's salary dump) can come again. */
const PITCH_REST = 21;

/** An offer found, before it's posted; `pitch` names what it's about, for the rest between pitches ("sell:812"). */
type Pitch = { tid: number; offer: TradeOffer; kind: Proposal['kind']; note: string; pitch: string };

export const openProposals = (league: League): Proposal[] => league.proposals ?? [];

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

/** Why an offer can't be taken now (it expired, the rules or the other GM's mind changed), or null. */
export function proposalError(league: League, p: Proposal): string | null {
  if (p.offer.a.tid !== league.userTid) return 'That offer was made to another team.';
  if (p.season !== league.season || league.day > p.expires) return 'The offer has expired.';
  const errors = validateTrade(league, p.offer);
  if (errors.length) return errors[0];
  const asked = p.offer.a.pids.find((pid) => isUntouchable(league, pid));
  if (asked !== undefined) return `You made ${playerName(league.players[asked])} untouchable.`;
  return evaluateTrade(league, p.offer).accept ? null : `The ${league.teams[p.tid].name} have changed their minds.`;
}

/** An offer whose mail is still unread stands at least this many days more, up to OFFER_MAX_DAYS days after it was made. */
const UNSEEN_LEFT = STANDS[0];
/** The longest an offer stands: one the user hasn't seen yet, three weeks after it was made (see holdUnseen). */
export const OFFER_MAX_DAYS = PITCH_REST;

/**
 * An offer's days run from when the user could see it: while its mail is unread (a long sim goes
 * on), it stands at least UNSEEN_LEFT days more, up to OFFER_MAX_DAYS days after it was made; the trade
 * deadline (or a pick being made) still ends it.
 */
function holdUnseen(league: League) {
  // (never past the trade deadline: the offer would read as standing after trading closed)
  const last = league.phase === 'regular' ? league.tradeDeadlineDay : Infinity;
  for (const p of openProposals(league)) {
    if (p.kind === 'pick' || p.season !== league.season) continue;
    const unread = league.inbox.some((m) => m.proposal === p.id && !m.read);
    if (unread) p.expires = Math.max(p.expires, Math.min(league.day + UNSEEN_LEFT, p.day + OFFER_MAX_DAYS, last));
    p.expires = Math.min(p.expires, Math.max(last, league.day));
  }
}

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
  const keep = withHoldsMemo(() => open.filter((p) => !proposalError(league, p)));
  if (keep.length !== open.length) league.proposals = keep;
}

/** Take an offer: checked again (rules, value, expiry) before it goes through. */
export function acceptProposal(league: League, id: number): { ok: boolean; reason: string } {
  const p = openProposals(league).find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'That offer is no longer on the table.' };
  const err = proposalError(league, p);
  league.proposals = openProposals(league).filter((x) => x.id !== id);
  if (err) return { ok: false, reason: err };
  executeTrade(league, p.offer);
  // the deal can make other offers impossible (the same player, a full roster)
  cleanProposals(league);
  const t = league.teams[p.tid];
  return { ok: true, reason: `Trade done with the ${t.region} ${t.name}.` };
}

export function declineProposal(league: League, id: number): boolean {
  const before = openProposals(league).length;
  league.proposals = openProposals(league).filter((x) => x.id !== id);
  return league.proposals.length < before;
}

// ---------------------------------------------------------------- making offers

/** At worst slightly against the user in neutral value (the extra players in the bigger half count for less). */
function fair(league: League, offer: TradeOffer, slack = USER_SLACK): boolean {
  const { net, out } = neutralBalance(league, offer);
  return net >= -slack * Math.max(0, out);
}

/** "Name (78)" or a pick's label. */
const assetText = (league: League, side: TradeOffer['a']) =>
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
export function offerSubject(league: League, offer: TradeOffer): string {
  const abbrev = league.teams[offer.b.tid].abbrev;
  const yours = sideHeadline(league, offer.a);
  const theirs = sideHeadline(league, offer.b);
  return yours ? `${abbrev} want ${yours} for ${theirs || 'nothing'}` : `${abbrev} offer ${theirs} for nothing`;
}

/** Post an offer (if it is still one the team accepts and the user would want), with its inbox message. */
function post(league: League, pitch: Pitch, rng: Rng, lastDay?: number): Proposal | null {
  const open = openProposals(league);
  if (open.length >= MAX_OPEN || open.some((p) => p.tid === pitch.tid)) return null;
  // a player is in one open offer at a time (the one it's about, or a part of its package)
  const players = (o: TradeOffer) => [...o.a.pids, ...o.b.pids];
  if (open.some((p) => players(p.offer).some((pid) => players(pitch.offer).includes(pid)))) return null;
  const days = rng.int(STANDS[0], STANDS[1]);
  const p: Proposal = {
    id: league.nextProposalId ?? 1,
    tid: pitch.tid,
    offer: structuredClone(pitch.offer),
    kind: pitch.kind,
    note: pitch.note,
    season: league.season,
    day: league.day,
    expires: Math.max(league.day, Math.min(league.day + days, lastDay ?? Infinity)),
  };
  // every offer is one the team takes and the rules allow, the day it is made
  if (proposalError(league, p)) return null;
  league.nextProposalId = p.id + 1;
  league.proposals = [...open, p];
  const t = league.teams[p.tid];
  const until =
    p.kind === 'pick'
      ? 'It stands until the pick is made.'
      : p.expires === league.day
        ? 'It stands until the end of today.'
        : `It stands until ${fmtDate(league.season, p.expires)}.`;
  const ask = p.offer.a.pids.length || p.offer.a.dpids.length ? `for ${assetText(league, p.offer.a)}` : 'and want nothing back';
  const from = `${t.region} ${t.name} GM`;
  // the same pitch made again this season replaces its earlier mail: one message per pitch, the latest on top
  league.inbox = league.inbox.filter((m) => !(m.season === league.season && m.pitch === pitch.pitch && m.from === from));
  addInbox(league, {
    from,
    subject: offerSubject(league, p.offer),
    pitch: pitch.pitch,
    body: `${p.note}\n${sentence(`We'd send ${assetText(league, p.offer.b)} ${ask}`)} ${until}`,
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
const free = (league: League) => {
  const busy = new Set(openProposals(league).map((p) => p.tid));
  return league.teams.filter((t) => t.tid !== league.userTid && !busy.has(t.tid));
};

/**
 * Is a pitch about this player out already (in an open offer), or was this pitch mailed in the last
 * PITCH_REST days? Then it isn't made again: a player has one live pitch at a time, and a declined
 * or lapsed one rests a while before it comes back.
 */
function pitchedLately(league: League, pid: number, pitch: string): boolean {
  if (openProposals(league).some((p) => p.offer.a.pids.includes(pid) || p.offer.b.pids.includes(pid))) return true;
  return league.inbox.some((m) => m.season === league.season && m.pitch === pitch && league.day - m.day < PITCH_REST);
}

/** A player's spot on the floor, as a GM talks about it. */
const spot = (p: Player) => (p.pos === 'PG' || p.pos === 'SG' ? 'guard' : p.pos === 'C' || p.pos === 'PF' ? 'big' : 'wing');

/**
 * Why a team wants the user's player, in its GM's words: its plan, its record once ten games are in,
 * and a thin spot he'd fill (fewer than two players at his spot within three points of him). One of
 * a few lines, picked by a hash of the day and the player, so the same pitch doesn't always read
 * the same and the league's stream never moves.
 */
function buyNote(league: League, t: Team, target: Player): string {
  const last = shortName(league, target);
  const ts = curTeamSeason(league, t.tid);
  const rec = ts.won + ts.lost >= 10 ? `${ts.won}-${ts.lost}` : null;
  const where = spot(target);
  const thin = standardRoster(league, t.tid).filter((x) => spot(x) === where && x.ovr >= target.ovr - 3).length < 2;
  const lines = (
    t.strategy === 'contend'
      ? [
          `We're going for it this season, and ${last} is the piece we're missing.`,
          rec && ts.won > ts.lost ? `At ${rec} we like our chances, and ${last} makes us better right now.` : `We're built to win now, and ${last} makes us better right away.`,
          thin && `We need another ${where} for a playoff run, and ${last} is the one we want.`,
        ]
      : t.strategy === 'rebuild'
        ? [
            `${last} fits our timeline: we're building around young players.`,
            `${last} is the kind of young player we want to grow with.`,
            thin && `We're short on young ${where}s, and ${last} is one we'd build around.`,
          ]
        : [
            `${last} would fit right in with what we're building.`,
            `We're retooling on the fly, and ${last} is the kind of player we want.`,
            thin && `We're thin at ${where}, and ${last} would fill it.`,
          ]
  ).filter((x): x is string => !!x);
  return lines[hashString(`${league.id}:${league.season}:${league.day}:${target.pid}:note`) % lines.length];
}

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
    for (const t of rng.shuffle(free(league).filter((x) => fits(league, x, target))).slice(0, 6)) {
      const pkg = packageFor(league, t.tid, { pids: [target.pid], dpids: [] });
      if (!pkg || !fair(league, pkg.offer)) continue;
      return { tid: t.tid, offer: pkg.offer, kind: 'buy', note: buyNote(league, t, target), pitch: `buy:${target.pid}` };
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
  // a rebuilding team isn't in the market for veterans
  if (league.teams[user].strategy === 'rebuild') return null;
  const keep = standardRoster(league, user)
    .sort((a, b) => tradeValue(league, b) - tradeValue(league, a))
    .slice(0, 2)
    .map((p) => p.pid);
  for (const t of rng.shuffle(free(league).filter((x) => x.strategy === 'rebuild')).slice(0, 4)) {
    const vets = standardRoster(league, t.tid)
      .filter((p) => p.ovr >= 74 && age(league, p) >= 27 && !untradeable(league, p) && !tradedAwayBy(league, p, user) && !pitchedLately(league, p.pid, `sell:${p.pid}`))
      .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    for (const vet of vets.slice(0, 3)) {
      const ask = makeItWork(league, { a: { tid: user, pids: [], dpids: [] }, b: { tid: t.tid, pids: [vet.pid], dpids: [] } }, keep);
      if (!ask.offer || !fair(league, ask.offer)) continue;
      return {
        tid: t.tid,
        offer: ask.offer,
        kind: 'sell',
        note: `We're rebuilding, and ${shortName(league, vet)} doesn't fit our timeline. He can help a team like yours win now.`,
        pitch: `sell:${vet.pid}`,
      };
    }
  }
  return null;
}

/**
 * A taxpayer offers its worst contract with picks attached, the cheapest first (the cheapest makes
 * way for a better one past three; two firsts at most), until the user comes out ahead in neutral
 * value. The user needs the cap room (or the salary going back) and the roster spot.
 */
function tryDump(league: League, rng: Rng): Pitch | null {
  const user = league.userTid;
  const cs = contractSeason(league);
  const tax = CAP_FOR(league, cs).luxuryTax;
  for (const t of rng.shuffle(free(league).filter((x) => capPayroll(league, x.tid, cs) > tax)).slice(0, 4)) {
    const bad = standardRoster(league, t.tid)
      .filter((p) => capSalary(league, p.pid) > 0 && !untradeable(league, p) && !tradedAwayBy(league, p, user) && tradeValue(league, p) < 0)
      .sort((a, b) => tradeValue(league, a) - tradeValue(league, b))[0];
    if (!bad || pitchedLately(league, bad.pid, `dump:${t.tid}`)) continue;
    const deal = dumpPackage(league, t.tid, user, bad, (o) => fair(league, o, 0));
    if (!deal || !evaluateTrade(league, deal).accept) continue;
    return {
      tid: t.tid,
      offer: deal,
      kind: 'dump',
      note: `We need to get under the luxury tax. Take ${shortName(league, bad)}'s contract and the pick${deal.b.dpids.length > 1 ? 's are' : ' is'} yours.`,
      pitch: `dump:${t.tid}`,
    };
  }
  return null;
}

const TRIES: Record<Proposal['kind'], ((league: League, rng: Rng) => Pitch | null) | null> = { buy: tryBuy, sell: trySell, dump: tryDump, pick: null };

/** One offer, of the first of `kinds` that finds one; `lastDay` caps how long it stands. */
function makeOffer(league: League, rng: Rng, kinds: Proposal['kind'][], lastDay?: number): Proposal | null {
  if (openProposals(league).length >= MAX_OPEN) return null;
  // the searches only read the league: each team's cap holds are worked out once
  const pitch = withHoldsMemo(() => {
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
  const rng = offerRng(league, 'offers');
  if (!rng.chance(league.tradeDeadlineDay - league.day < 10 ? 1 / 3 : 1 / 10)) return;
  makeOffer(league, rng, kindsFor(rng), league.tradeDeadlineDay);
}

/** Around opening night a team calls with an offer. */
export function openingProposal(league: League) {
  if (league.phase !== 'regular' || league.fired) return;
  const rng = offerRng(league, 'opening');
  makeOffer(league, rng, rng.chance(0.6) ? ['buy', 'sell'] : ['sell', 'buy'], league.tradeDeadlineDay);
}

/** Free agency opens: a user with cap room hears from a taxpayer or two that wants to dump salary. */
export function freeAgencyProposals(league: League) {
  if (league.phase !== 'freeAgency' || league.fired) return;
  const cs = contractSeason(league);
  if (capPayroll(league, league.userTid, cs) >= CAP_FOR(league, cs).salaryCap) return;
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
  const found = withHoldsMemo(() =>
    rng
      .shuffle(free(league))
      .slice(0, 8)
      .flatMap((t) => {
        const pkg = packageFor(league, t.tid, { pids: [], dpids: [dp.dpid] });
        return pkg && fair(league, pkg.offer) ? [pkg] : [];
      }),
  );
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
