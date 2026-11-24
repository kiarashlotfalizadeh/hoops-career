import type { FaBid, League, Player, Team } from '../types';
import { FREE_AGENT } from '../types';
import { Rng, hashString } from '../random';
import { CAP } from '../constants';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import {
  CAP_FOR,
  OFFSEASON_ROSTER_MAX,
  contractSeason,
  addInbox,
  andList,
  freeAgents,
  payroll,
  playerName,
  rosterMaxNow,
  seasonTid,
  standardRoster,
  teamCity,
  teamPlayers,
} from './helpers';
import {
  EXCEPTIONS,
  FA_DAYS,
  FA_PRICE_CUT_DAYS,
  FIRED_REASON,
  type Ask,
  type Exception,
  MLE_YEARS,
  type PlayerPrefs,
  type SigningRoute,
  aiOption,
  aiRoute,
  appealTerms,
  askLean,
  askingContract,
  birdTier,
  nonGuaranteed,
  playerMax,
  releasedBy,
  capSpace,
  exceptionAmount,
  exceptionRoom,
  extendContract,
  extensionAsk,
  extensionClosedReason,
  extensionRefusal,
  isException,
  leaveTeam,
  marketSalary,
  payrollBudget,
  playerPrefs,
  talksSour,
  keepCeiling,
  aiTopLine,
  teamCore,
  preferredYears,
  releaseDeadMoney,
  releasePlayer,
  resignLimit,
  rookieScaleDeal,
  maxYearsWith,
  routeYears,
  signPlayer,
  summerRoster,
  teamAppeal,
  spendRoute,
  SUMMER_FLOOR,
  floorTier,
  summerFloor,
  valueScore,
  aiMleRoom,
  aiSigningRoute,
} from './contracts';
import { type OfferResult, hearOffer } from './negotiation';
import { money, moneyExact, plural } from '../format';
import { askedOutReason, wantsOut } from './pulse';
import { playerSays } from './voices';

export { FA_DAYS };

/** Why the user can't sign a player he released this season (see releasedBy). */
export const RELEASED_REASON = (p: Player) => `You released ${playerName(p)} this season. He can't sign back until next season.`;

/** Free agents sign for four years at most: five is for re-signing one's own player with full Bird rights. */
export const FA_YEARS = 4;
const FA_YEARS_REASON = `Free agents sign for 1 to ${FA_YEARS} years. Five is only for your own player on full Bird rights.`;

/** Why the user can't re-sign him for more than `limit`: his Bird rights with the team (see resignLimit). */
export function resignLimitReason(league: League, p: Player, limit: number): string {
  const tier = birdTier(league, p);
  return tier === 'early'
    ? `Early Bird rights re-sign ${playerName(p)} for up to ${money(limit)}. That's 175% of his salary or 105% of the league average, if more.`
    : `Non-Bird rights re-sign ${playerName(p)} for up to ${money(limit)}, 120% of his salary. Beyond that he's a free agent like any other.`;
}

export function expiringPlayers(league: League, tid: number): Player[] {
  return teamPlayers(league, tid).filter((p) => contractExp(p.contract) <= league.season);
}

/**
 * How far past its payroll budget (see payrollBudget), as a share of the cap, an AI team goes to
 * re-sign its own player worth 80+: a team keeps a good player it has rather than replace him. With
 * stars' prices up to the max (see marketSalary) and contenders getting the first look at the market
 * (see faDay), 54% of expiring 80+ players stayed without it, 61% with it (the NBA's 60-70%).
 */
const RESIGN_STAR_ROOM = 0.04;

/**
 * The expiring players an AI team would keep (if they agree, see `agrees`) and what each asks,
 * best first, within its payroll budget (see payrollBudget). Once 13 players are committed, only
 * core players (the top 8) are kept.
 */
function resignPlan(league: League, t: Team, agrees: (p: Player) => boolean = () => true): { p: Player; ask: Ask }[] {
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  let pay = payroll(league, t.tid, next);
  let committed = standardRoster(league, t.tid).filter((x) => contractExp(x.contract) > league.season).length;
  const byValue = teamPlayers(league, t.tid).sort((a, b) => valueScore(league, b) - valueScore(league, a));
  const core = new Set(byValue.slice(0, 8).map((p) => p.pid));
  const top = teamCore(league, t.tid);
  const plan: { p: Player; ask: Ask }[] = [];
  for (const p of byValue) {
    if (contractExp(p.contract) > league.season) continue;
    // (he asked for a trade and it never came: he leaves, see pulse.ts)
    if (wantsOut(league, p)) continue;
    const v = valueScore(league, p);
    const ask = askingContract(league, p, t.tid);
    // without full Bird rights his team can only pay him so much (see resignLimit): above it he walks
    if (ask.amount > resignLimit(league, p, t.tid)) continue;
    // (and never past the AI's top line: see payrollBudget)
    const budget = Math.min(aiTopLine(cap), payrollBudget(cap, t, v, { core: top.has(p.pid), young: playerAge(p, next) <= 28 }) + (v >= 80 ? cap.salaryCap * RESIGN_STAR_ROOM : 0));
    const worth = v >= 70 || (v >= 66 && committed < 11);
    const needed = core.has(p.pid) || committed < 13;
    // (past 35 only a veteran still playing at 78+, for the year he asks)
    const wants = playerAge(p, next) <= 35 || p.ovr >= 78;
    if (worth && needed && wants && pay + ask.amount < budget && agrees(p)) {
      plan.push({ p, ask });
      pay += ask.amount;
      committed++;
    }
  }
  return plan;
}

/**
 * AI teams decide whether to keep their expiring players (start of free agency). A few test the
 * market anyway, stars less often.
 */
export function aiResign(league: League, rng: Rng) {
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const plan = resignPlan(league, t, (p) => rng.chance(valueScore(league, p) >= 82 ? 0.95 : 0.85));
    for (const { p, ask } of plan) signPlayer(league, p, t.tid, ask.amount, ask.years, { start: league.season + 1, option: aiOption(league, p, ask.amount, ask.years) });
  }
}

/** Share of AI players worth extending who get extended on opening night (a star's, worth 84+, more); the rest go through re-signing in the summer. */
const AI_EXTENSION_SHARE = 0.6;
const AI_STAR_EXTENSION_SHARE = 0.85;

/**
 * Opening night: AI teams extend players worth 76+ in the final season of their deals who are
 * willing (see extensionRefusal) and not past 35 by next season, best first, at their asking price
 * within the payroll budget for next season that re-signing uses. About 60% are, by a roll per
 * player and season that leaves the league's random stream alone.
 */
export function aiExtensions(league: League) {
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    let pay = payroll(league, t.tid, next);
    const top = teamCore(league, t.tid);
    const candidates = teamPlayers(league, t.tid)
      .filter((p) => valueScore(league, p) >= 76 && playerAge(p, next) <= 35 && !extensionClosedReason(league, p) && !extensionRefusal(league, p))
      .sort((a, b) => valueScore(league, b) - valueScore(league, a));
    for (const p of candidates) {
      const share = valueScore(league, p) >= 84 ? AI_STAR_EXTENSION_SHARE : AI_EXTENSION_SHARE;
      if (new Rng(hashString(`${league.id}:${league.season}:aiExtension:${p.pid}`)).next() >= share) continue;
      const ask = extensionAsk(league, p);
      if (pay + ask.amount >= payrollBudget(cap, t, valueScore(league, p), { core: top.has(p.pid), young: playerAge(p, next) <= 28 })) continue;
      extendContract(league, p, ask.amount, ask.years);
      // a veteran's extension can carry his player option on its final season, as a signing's can (see aiOption)
      if (!rookieScaleDeal(p) && aiOption(league, p, ask.amount, ask.years) === 'player') p.contract.option = 'player';
      pay += ask.amount;
    }
  }
}

/**
 * A player whose contract ran out joins the free agent pool like a released one: with an asking
 * price and the price-cut clock, and without the trade-back rule and trade lock of his old deal.
 */
function toFreeAgent(league: League, p: Player) {
  p.tid = FREE_AGENT;
  delete p.tradedFrom;
  delete p.tradeLock;
  p.asking = undefined;
  p.asking = askingContract(league, p);
  p.faDays = FA_PRICE_CUT_DAYS;
}

/** Move all unsigned expiring players into the free agent pool. */
export function releaseExpiring(league: League) {
  for (const p of Object.values(league.players)) {
    if (p.tid >= 0 && contractExp(p.contract) <= league.season) {
      leaveTeam(league.teams[p.tid], p.pid);
      toFreeAgent(league, p);
    }
  }
  // the market opens: every free agent's price starts again from his value
  for (const p of freeAgents(league)) {
    p.asking = undefined;
    p.asking = askingContract(league, p);
    p.faDays = FA_PRICE_CUT_DAYS;
  }
}

function needScore(league: League, tid: number, p: Player): number {
  const roster = teamPlayers(league, tid);
  const better = roster.filter((x) => x.ovr >= p.ovr).length;
  let s = valueScore(league, p) - better * 0.6;
  const bigs = roster.filter((x) => x.ratings.hgt >= 60).length;
  if (bigs < 3 && p.ratings.hgt >= 60) s += 2;
  const guards = roster.filter((x) => x.ratings.hnd >= 60).length;
  if (guards < 3 && p.ratings.hnd >= 60) s += 2;
  return s;
}

/** A team's players on its 15 roster spots. */
const regularRoster = (league: League, tid: number) => standardRoster(league, tid);

/** Dead money ($K) releasing him would leave on the books. */
const deadIfCut = (league: League, p: Player) => releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0);

/** A free agent must beat a swapped-out player by 4 points of value, plus a point per $1M of dead money the release leaves. */
const swapBar = (league: League, p: Player) => valueScore(league, p) + 4 + deadIfCut(league, p) / 1000;

/**
 * The player a full AI roster would give up for a better free agent, or undefined. In season that
 * is a release on the spot, so the dead money it leaves is held to 2.2× the veteran minimum. In
 * the summer the newcomer just joins camp (up to 21) and the cuts come by value on opening night,
 * so the bar is whoever would lose the 15th spot.
 */
function swapCandidate(league: League, tid: number, season: number): Player | undefined {
  const roster = regularRoster(league, tid);
  if (roster.length < CAP.rosterMax) return undefined;
  const byBar = (xs: Player[]) => xs.sort((a, b) => swapBar(league, a) - swapBar(league, b));
  if (season > league.season) return summerRoster(league, tid) < OFFSEASON_ROSTER_MAX ? byBar(roster)[roster.length - CAP.rosterMax] : undefined;
  const limit = CAP_FOR(league, season).vetMin * 2.2;
  return byBar(roster.filter((x) => deadIfCut(league, x) <= limit))[0];
}

/**
 * One AI team's shot at the market: the best fit it can pay (cap space, its mid-level or the
 * minimum). A full roster only adds a clearly better player than the one he'd displace.
 */
function aiSign(league: League, t: Team, rng: Rng, season: number, today = Infinity) {
  const roster = regularRoster(league, t.tid);
  const full = roster.length >= CAP.rosterMax;
  const cut = swapCandidate(league, t.tid, season);
  if (full && !cut) return;
  const size = full ? roster.length - 1 : roster.length;
  const floor = cut ? swapBar(league, cut) : -Infinity;
  let pick: Player | undefined;
  let pickBird = false;
  let bs = -Infinity;
  // a top free agent weighing the user's offer waits for his decision day (see resolveBids), and
  // one who isn't weighs the AI teams' bids on his own (see aiMarquee)
  const weighing = new Set(league.faBids?.map((b) => b.pid));
  const cap = CAP_FOR(league, season);
  const pay = payroll(league, t.tid, season);
  for (const p of freeAgents(league)) {
    if (weighing.has(p.pid) || marqueeFA(league, p) || releasedBy(league, p, t.tid)) continue;
    const v = valueScore(league, p);
    // (a young player with upside asking the minimum clears a lower bar)
    const bar = playerAge(p, season) <= 24 && p.pot >= 70 ? 60 : 64;
    if (v < floor || (size >= 13 && v < bar)) continue;
    // his old team can bring him back on his Bird rights, over the cap, at a price its budget allows (see birdRoom)
    const amount = askingContract(league, p, t.tid).amount;
    const own = seasonTid(p, league.season) === t.tid ? birdRoom(league, p, season) : null;
    const bird = !!own && own.tid === t.tid && amount <= own.room;
    const route = bird ? 'min' : aiSigningRoute(league, t.tid, amount, season, p);
    // over the cap only a contender pays its mid-level into the tax; a rebuilder keeps its room
    // for youth (and the dumps it takes picks for), not veterans on real money; and nobody spends
    // its cap space or its mid-level on a lesser player before the top free
    // agents have decided (their first three days), when those are what an 80+ free agent's
    // price can be paid with (see faInterest)
    if (!route || (isException(route) && t.strategy !== 'contend' && pay + amount > cap.luxuryTax)) continue;
    if (t.strategy === 'rebuild' && route !== 'min' && playerAge(p, season) >= 29) continue;
    // and past 13 players, its spots go to its young players (26 or younger), not veterans
    if (t.strategy === 'rebuild' && size >= 13 && playerAge(p, season) >= 27) continue;
    if ((route === 'space' || route === 'mle') && today <= MARQUEE_DAYS && p.ovr < SUMMER_FLOOR.ovr) continue;
    const s = needScore(league, t.tid, p) + rng.normal(0, 1.5);
    if (s > bs) {
      bs = s;
      pick = p;
      pickBird = bird;
    }
  }
  if (!pick) return;
  const ask = askingContract(league, pick, t.tid);
  // stars sometimes wait for a better offer early in the summer
  const patience = season > league.season && league.faDay < 10 && valueScore(league, pick) >= 78 ? 0.45 : 0.9;
  if (!rng.chance(patience)) return;
  if (pickBird) {
    signPlayer(league, pick, t.tid, ask.amount, ask.years, { start: season, option: aiOption(league, pick, ask.amount, ask.years), bird: true });
    return;
  }
  const route = aiRoute(league, t.tid, ask.amount, season, pick, ask.years)!;
  spendRoute(league, t.tid, route, season);
  // (summer signings just join camp: opening-night cuts trim the roster back to 15)
  if (cut && season === league.season) releasePlayer(league, cut, { news: false });
  // minimum deals are short: a season, two for a young player; an exception's run as long as it allows
  const years = route === 'min' ? (playerAge(pick, season) <= 25 ? 2 : 1) : Math.min(routeYears(route), ask.years);
  signPlayer(league, pick, t.tid, ask.amount, years, { start: season, option: route === 'min' ? undefined : aiOption(league, pick, ask.amount, years) });
}

/** Top free agents decide over the market's first days (see marqueeDay); until then nobody spends cap space on anyone else (see aiSign). */
const MARQUEE_DAYS = 3;

/** The free-agency day (1-3) a top free agent nobody has the user's offer out to decides on: a hash of the league, season and player. */
const marqueeDay = (league: League, p: Player) => 1 + (hashString(`${league.id}:${league.season}:${p.pid}:market`) % MARQUEE_DAYS);

/** A free agent worth this much is a top free agent (see marqueeFA); one his old team won't let walk for nothing (see birdRoom). */
const MARQUEE_VALUE = 78;
/** A star: worth this much, his old team counts him as core in its re-signing budget (see birdRoom). */
const STAR_VALUE = 82;

/**
 * A free agent nobody has signed in the summer market's first days (the top ones' decision days, see
 * marqueeDay) lowers his price every day after, by SUMMER_STEP, toward what the market's money would
 * pay him (see marketMoneyMap: an AI team's cap space or exception, or his old team on his Bird
 * rights, at his interest in it, the best players served first). Never under that: while a team can
 * pay his price he holds it, and the day his price comes within its reach (90%, as the user's offer
 * must, see faInterest) it bids and he signs. Nor under his summer floor (a 72+ player's, see
 * SUMMER_FLOOR): when the money can't pay more than that he goes straight to it, and when it can't
 * pay that he waits, so a team with room that waits gets no more than the floor's discount. So the
 * top of the market clears in its first week or so, near his value where a team has the room or his
 * rights, a mid-level where only that is left. Held to 75% of his value for 20 days and 60% after,
 * with no mid-level cap and no one-year deals, the top ten free agents of a summer of the real league
 * once signed on day 30 as a rule (25 of 60 back with their old teams as the market closed), and
 * their old teams paid past every budget to bring them back; cut to whatever the money left could
 * pay, rotation players worth $8-13M went for the minimum by days 9-13 and an 86 for a tenth of his
 * value.
 */
const SUMMER_STEP = 0.15;

/**
 * What his old team would still pay a free agent to bring him back on his Bird rights, over the
 * cap: what those rights allow (see resignLimit) and its re-signing budget leave (see
 * payrollBudget: a star, or a player who'd be among its three best, counts as core; a player worth
 * 78+ up to keepCeiling, since a team doesn't let a player that good walk for nothing), when it
 * wants him and has the spot. A top free agent weighs it among his bids on his decision day (see
 * faInterest), so a team keeps its good free agents in the market's first days rather than when it
 * closes; anyone else signs when his price comes down to it (see aiSign), though a rebuilder
 * doesn't bring back a veteran of 29 or older that way. Null outside the summer market.
 */
function birdRoom(league: League, p: Player, season: number, memo?: Map<number, WantRead>): { tid: number; room: number } | null {
  if (league.phase !== 'freeAgency') return null;
  const old = seasonTid(p, league.season);
  if (old === null || old === league.userTid || releasedBy(league, p, old)) return null;
  const t = league.teams[old];
  if (!aiWants(league, t, p, season, memo) || (t.strategy === 'rebuild' && playerAge(p, season) >= 29 && !marqueeFA(league, p))) return null;
  const v = valueScore(league, p);
  const better = regularRoster(league, old).filter((x) => valueScore(league, x) > v).length;
  const cap = CAP_FOR(league, season);
  const budget = Math.max(payrollBudget(cap, t, v, { core: v >= STAR_VALUE || better < 3, young: playerAge(p, season) <= 28 }), v >= MARQUEE_VALUE ? keepCeiling(cap, t) : 0);
  return { tid: old, room: Math.min(resignLimit(league, p, old), budget - payroll(league, old, season)) };
}

/**
 * Top free agents weigh the AI teams' bids against each other (the user's offer, when he made one,
 * on its own decision day: see resolveBids): on his day (see marqueeDay), each team that wants him
 * and can pay bids (see faInterest), and he signs the one he likes best (see offerUtility), the best
 * players first so the money they take is gone for the next. With no bid he waits for his price to
 * come down.
 */
function aiMarquee(league: League, today: number) {
  const season = contractSeason(league);
  const weighing = new Set(league.faBids?.map((b) => b.pid));
  const stars = freeAgents(league)
    .filter((p) => !weighing.has(p.pid) && marqueeFA(league, p) && marqueeDay(league, p) <= today)
    .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid);
  // (each team's roster read once, and again after it signs one of them: the stars hanging on for their
  // floor are weighed every day)
  const memo = new Map<number, WantRead>();
  for (const p of stars) {
    const best = faInterest(league, p, memo)[0];
    if (!best) continue;
    spendRoute(league, best.tid, best.route, season);
    signPlayer(league, p, best.tid, best.amount, best.years, { start: season, option: aiOption(league, p, best.amount, best.years), bird: best.bird });
    memo.delete(best.tid);
  }
}

/** An AI team with money for a free agent beyond the minimum: the most it could pay one (cap space, or an exception), and the value a newcomer must have to take a spot (see swapBar). */
type Buyer = { t: Team; room: number; bar: number; size: number };

/**
 * The AI teams that could pay a free agent more than the minimum now: a roster spot (or a player
 * he'd clearly beat for one), and cap space or its mid-level (into the tax only for a contender,
 * see aiSign).
 */
function marketBuyers(league: League, season = contractSeason(league)): Buyer[] {
  const cap = CAP_FOR(league, season);
  return league.teams.flatMap((t) => {
    if (t.tid === league.userTid) return [];
    const cut = swapCandidate(league, t.tid, season);
    const n = regularRoster(league, t.tid).length;
    if (n >= CAP.rosterMax && !cut) return [];
    const ex = aiMleRoom(league, t.tid, season);
    const room = Math.max(capSpace(league, t.tid, season), t.strategy === 'contend' ? ex : Math.min(ex, cap.luxuryTax - payroll(league, t.tid, season)));
    return room > 0 ? [{ t, room, bar: cut ? swapBar(league, cut) : -Infinity, size: n >= CAP.rosterMax ? n - 1 : n }] : [];
  });
}

const moneyCache = new WeakMap<League, { key: string; money: Map<number, number> }>();

/**
 * What the market's money would pay each free agent now, as a price from the market (what he asks a
 * team moves with his interest in it, up to 10% either way, see askingContract). The best players
 * first, each takes the smallest room left among the AI teams that would sign him that covers his
 * price (see marketBuyers; a team pays one of them), or the biggest when none does; his old team's
 * on his Bird rights when that's more takes no team's room (see birdRoom), nor does a player worth
 * about the minimum. Counting every team's room for every player, a rotation player's price held at
 * a mid-level only one team had, and half of them were still unsigned when the market closed.
 */
function marketMoneyMap(league: League): Map<number, number> {
  const key = `${league.season}:${league.phase}:${league.day}:${league.faDay}:${league.nextTxnId ?? 0}:${league.faBids?.length ?? 0}`;
  const hit = moneyCache.get(league);
  if (hit?.key === key) return hit.money;
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const buyers = marketBuyers(league, season);
  const used = new Set<number>();
  const money = new Map<number, number>();
  const appeal = (tid: number, p: Player) => Math.min(1.1, Math.max(0.9, teamAppeal(league, tid, p)));
  const pool = freeAgents(league)
    .map((p) => ({ p, v: valueScore(league, p) }))
    .sort((a, b) => b.v - a.v || a.p.pid - b.p.pid);
  for (const { p, v } of pool) {
    const bird = birdRoom(league, p, season);
    const own = bird ? bird.room * appeal(bird.tid, p) : 0;
    const need = askingContract(league, p).amount;
    // (a rebuilder doesn't pay a veteran of 29 or older past the minimum, nor give one of its last
    // spots to a player of 27 or older, see aiSign: counted as money for him, his price held all
    // summer at what no team would spend)
    const a = playerAge(p, season);
    const open = buyers.filter((b) => !used.has(b.t.tid) && v >= b.bar && !(b.t.strategy === 'rebuild' && (a >= 29 || (a >= 27 && b.size >= 13))));
    const covers = open.filter((b) => b.room >= need).sort((a, b) => a.room - b.room)[0];
    const pick = covers ?? open.sort((a, b) => b.room - a.room)[0];
    const theirs = pick ? pick.room * appeal(pick.t.tid, p) : 0;
    if (pick && theirs > own && need > (p.experience >= 3 ? cap.vetMin : cap.minContract) * 1.5) used.add(pick.t.tid);
    money.set(p.pid, Math.max(own, theirs));
  }
  moneyCache.set(league, { key, money });
  return money;
}

/**
 * The most the market's money would pay a free agent now (see marketMoneyMap): his price comes down
 * toward it, never under it (see faDay); 0 when nobody would pay him past the minimum.
 */
export function marketMoney(league: League, p: Player): number {
  return marketMoneyMap(league).get(p.pid) ?? 0;
}

/** The summer market's first days, when prices hold and the top free agents decide (see marqueeDay); prices come down from the day after (see SUMMER_STEP). */
export const MARKET_HOLD_DAYS = MARQUEE_DAYS;
/** How much a free agent's summer price comes down each day after the market's first days, toward what the market's money would pay him. */
export const MARKET_STEP = SUMMER_STEP;

/**
 * One day of free agency: AI teams make offers, players accept the best fit, and unsigned players
 * cut their price (in the summer daily, see
 * SUMMER_STEP; otherwise every 5 days): by 15%, or down to the most an AI team that would take him
 * could still pay (cap space, an exception or his old team on his Bird rights, at his interest in
 * that team), never under his summer floor (see SUMMER_FLOOR), on deals of 3 years at most. In
 * season this runs once a week, so every call is a price cut.
 */
export function faDay(league: League, rng: Rng, intensity = 1, today = league.faDay + 1) {
  // (today 0: the market's opening, when AI teams move with the user and nobody has decided yet)
  if (league.phase === 'freeAgency' && today > 0) {
    // top free agents whose decision day this is choose between the user's offer and AI teams' first
    resolveBids(league, today);
  }
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const offseason = season > league.season;
  // contenders get the first look each day, then retooling teams, then rebuilders (in a random order
  // within each): the free agent a contender wants signs there before a team with room calls, and
  // the veterans who'll take less to win (see ringChase) do. In one random order, a rebuilder with
  // cap space got as many good players as anyone, and every roster ended up about as deep.
  const order = { contend: 0, retool: 1, rebuild: 2 };
  const ai = rng.shuffle(league.teams.filter((t) => t.tid !== league.userTid)).sort((a, b) => order[a.strategy] - order[b.strategy]);
  // price cuts come first, so AI teams get the first look at a new price
  const allotted = marketMoneyMap(league);
  const roomFor = (p: Player) => allotted.get(p.pid) ?? 0;
  const summer = league.phase === 'freeAgency';
  for (const p of freeAgents(league)) {
    if (p.faDays === undefined) continue;
    const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
    const ask = Math.min(p.asking?.amount ?? Infinity, marketSalary(league, p));
    const years = Math.min(3, p.asking?.years ?? preferredYears(league, p));
    // in the summer his price holds through the market's first days, then comes down a step a day
    // toward what the market's money would pay him (see SUMMER_STEP and marketMoneyMap), never under
    // his summer floor (see SUMMER_FLOOR), and straight to it when the money can't pay more (stepping
    // down to a mid-level-sized floor, an 80-82's price reached it a day or two after the mid-levels
    // had gone to lesser players); past the floor's day, one held at it asks a one-year deal
    if (summer) {
      if (today <= MARQUEE_DAYS) continue;
      const money = roomFor(p);
      const floor = summerFloor(league, p);
      const amount = money >= ask ? ask : floor > 0 && money <= floor ? floor : Math.max(ask * (1 - SUMMER_STEP), money, floor);
      const prove = floor > 0 && today > SUMMER_FLOOR.day && amount <= floor + 10;
      p.asking = { amount: Math.max(min, Math.round(amount / 10) * 10), years: prove ? 1 : years };
      p.faDays = 1;
      continue;
    }
    // (saves from before the 5-day clock can still be counting down from 30)
    p.faDays = Math.min(p.faDays, FA_PRICE_CUT_DAYS) - (offseason ? 1 : FA_PRICE_CUT_DAYS);
    if (p.faDays > 0) continue;
    // in season every five days: by 15%, or down to what
    // the market's money would pay him; in the summer only when it couldn't pay his price, and never
    // below it. A player with a summer floor (72+, see SUMMER_FLOOR) left unsigned comes down from it
    // the same way in season, 15% a week: cut straight to what the money left would pay, the stars
    // the summer couldn't pay went for the minimum in the season's first week.
    const money = roomFor(p);
    const cut = !offseason && !floorTier(p) ? Math.min(ask * 0.85, money) : money >= ask ? ask : Math.max(ask * 0.85, money);
    p.asking = { amount: Math.max(min, Math.round(Math.max(cut, summerFloor(league, p)) / 10) * 10), years };
    p.faDays = FA_PRICE_CUT_DAYS;
  }
  // the top free agents whose day it is pick among the AI teams' bids, then the rest of the market moves
  if (league.phase === 'freeAgency' && today > 0) aiMarquee(league, today);
  for (const t of ai) {
    if (freeAgents(league).length && rng.chance(Math.min(1, 0.55 * intensity))) aiSign(league, t, rng, season, league.phase === 'freeAgency' ? today : Infinity);
  }
}

/**
 * Make sure every AI team can field a legal roster (13+) with minimum signings: from the free agents
 * who'd take the minimum (one of the best four), else the best one worth under 76 (a better player
 * holds out for real money). Never a player the team released this season.
 */
export function fillRosters(league: League, rng: Rng, season = league.season) {
  const cap = CAP_FOR(league, season);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    let size = standardRoster(league, t.tid).length;
    while (size < CAP.rosterMin) {
      const free = freeAgents(league).filter((p) => !releasedBy(league, p, t.tid));
      const willing = free.filter((p) => askingContract(league, p, t.tid).amount <= (p.experience >= 3 ? cap.vetMin : cap.minContract) + 1);
      const pool = (willing.length ? willing : free.filter((p) => valueScore(league, p) < 76)).sort((a, b) => valueScore(league, b) - valueScore(league, a));
      const p = pool[Math.min(pool.length - 1, Math.floor(rng.uniform(0, 4)))];
      if (!p) break;
      signPlayer(league, p, t.tid, p.experience >= 3 ? cap.vetMin : cap.minContract, 1, { news: false, start: season });
      size++;
    }
  }
}

/** How much an AI team would rather keep a player when trimming: his value, and 0.3 points for each $1M of dead money releasing him would leave. */
const rosterKeep = (league: League, p: Player) => valueScore(league, p) + (0.3 * releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0)) / 1000;

/**
 * Trim AI rosters to 15 players. Cuts go mainly by value; a release that leaves dead money counts a
 * little against cutting him (0.3 points per $1M), so camp deals go first among near equals and a
 * big contract survives unless he is clearly the worst player.
 */
export function trimRosters(league: League, release: (p: Player) => void, max: number = CAP.rosterMax) {
  const keep = (p: Player) => rosterKeep(league, p);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const roster = standardRoster(league, t.tid).sort((a, b) => keep(a) - keep(b));
    while (roster.length > max) release(roster.shift()!);
  }
}

/**
 * After the draft and the options: an AI team with more players signed for next season than the summer
 * allows (picks and picked-up options on top of a full roster) lets the least of them go, as trimRosters
 * does when free agency opens. Its expiring deals aren't counted: they are decided in the re-sign window.
 */
export function trimSigned(league: League, release: (p: Player) => void) {
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const signed = standardRoster(league, t.tid)
      .filter((p) => contractExp(p.contract) > league.season)
      .sort((a, b) => rosterKeep(league, a) - rosterKeep(league, b));
    while (signed.length > OFFSEASON_ROSTER_MAX) release(signed.shift()!);
  }
}

/**
 * Opening night, after the cuts: a free agent left who is worth 66+ or rated 70+ (a camp's cut, a
 * veteran) joins the team whose last man he most clearly beats (by 2 points or more; a team that
 * isn't rebuilding counts a veteran's game now as much as his value) when letting that man go costs little (a camp
 * deal, or dead money of 2.2× the veteran minimum at most), or a team with a spot open, on a
 * one-year deal at his price if the team can pay it (its mid-level into the tax only for a
 * contender), else at the minimum, best players first: a good player left unsigned on opening
 * night is rare.
 */
export function openingSwaps(league: League) {
  const season = league.season;
  const cap = CAP_FOR(league, season);
  const pool = freeAgents(league)
    .filter((p) => valueScore(league, p) >= 66 || p.ovr >= 70)
    .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid);
  // (a team out to win weighs a veteran's game now as much as his value: see winNow)
  const winNow = (t: Team, p: Player) => (t.strategy !== 'rebuild' ? (valueScore(league, p) + p.ovr) / 2 : valueScore(league, p));
  for (const p of pool) {
    const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
    let best: { tid: number; margin: number; amount: number; route: SigningRoute; cut?: Player } | null = null;
    for (const t of league.teams) {
      if (t.tid === league.userTid || releasedBy(league, p, t.tid)) continue;
      const roster = regularRoster(league, t.tid);
      // (a taxpayer carrying 14 keeps the spot open: see taxTeamsTrim)
      const full = roster.length >= CAP.rosterMax || (roster.length >= CAP.rosterMax - 1 && payroll(league, t.tid, season) > cap.luxuryTax);
      const cut = full ? roster.filter((x) => deadIfCut(league, x) <= cap.vetMin * 2.2).sort((a, b) => winNow(t, a) - winNow(t, b))[0] : undefined;
      if (full && !cut) continue;
      const margin = winNow(t, p) - (cut ? winNow(t, cut) + (0.3 * deadIfCut(league, cut)) / 1000 : 60);
      if (margin < 2 || (best && margin <= best.margin)) continue;
      // with the summer's money spent he takes what's left: his price if the team can pay it, else
      // the most its cap space or best exception still reaches, down to his summer floor (a 72+
      // player's: see SUMMER_FLOOR; a team that can't pay that doesn't get him), else the minimum
      let amount = askingContract(league, p, t.tid).amount;
      let route = aiSigningRoute(league, t.tid, amount, season, p, 1);
      const intoTax = (r: SigningRoute | null, x: number) => isException(r) && t.strategy !== 'contend' && payroll(league, t.tid, season) + x > cap.luxuryTax;
      if (!route || intoTax(route, amount)) {
        const floor = summerFloor(league, p);
        const most = floor > min ? Math.floor(Math.min(amount, Math.max(capSpace(league, t.tid, season), aiMleRoom(league, t.tid, season))) / 50) * 50 : 0;
        const via = most >= floor - 50 && most > min ? aiSigningRoute(league, t.tid, most, season, p, 1) : null;
        if (via && !intoTax(via, most)) {
          amount = most;
          route = via;
        } else if (floor > min) continue;
        else {
          amount = min;
          route = 'min';
        }
      }
      best = { tid: t.tid, margin, amount, route, cut };
    }
    if (!best) continue;
    if (best.cut) releasePlayer(league, best.cut, { news: false });
    spendRoute(league, best.tid, best.route, season);
    signPlayer(league, p, best.tid, best.amount, 1, { start: season });
  }
}

/** Opening night, after the cuts: an AI taxpayer carrying 15 lets its last man go when his deal isn't guaranteed yet (a camp deal), saving his salary and the tax on it. */
export function taxTeamsTrim(league: League) {
  const tax = CAP_FOR(league, league.season).luxuryTax;
  for (const t of league.teams) {
    if (t.tid === league.userTid || payroll(league, t.tid) <= tax) continue;
    const roster = regularRoster(league, t.tid);
    if (roster.length < CAP.rosterMax) continue;
    const last = roster.sort((a, b) => rosterKeep(league, a) - rosterKeep(league, b))[0];
    if (last && nonGuaranteed(league, last)) releasePlayer(league, last, { news: false });
  }
}

/** Why the user can't sign free agents right now, or null when the window is open. */
export function signingClosedReason(league: League): string | null {
  switch (league.phase) {
    case 'playin':
    case 'playoffs':
      return 'Free agents can be signed through the end of the regular season. The market reopens in free agency.';
    case 'draftLottery':
    case 'draft':
      return 'Signings are frozen until free agency opens after the draft and re-signing period.';
    case 'resign':
      return 'Re-signing period: only your own players for now. Free agency opens next.';
    default:
      return null;
  }
}

/**
 * Why the user can't offer free agent `p` this much for this long at all (roster or cap, his pending
 * offers counted), or null. Asking price aside.
 */
export function offerBlockedReason(league: League, p: Player, amount: number, years: number): string | null {
  const tid = league.userTid;
  const season = contractSeason(league);
  const max = rosterMaxNow(league);
  const pending = pendingOffers(league, p.pid);
  // (in the offseason it's the camp's 21 that's full, not opening night's 15)
  const which = max > CAP.rosterMax ? 'offseason roster' : 'roster';
  if (standardRoster(league, tid).length + pending >= max)
    return pending
      ? `Your ${which} is full (${max}) counting your ${pending} pending offer${pending > 1 ? 's' : ''}. Release or trade someone, or withdraw an offer.`
      : `Your ${which} is full (${max}). Release or trade someone first.`;
  if (offerRoute(league, p, amount, season, years)) return null;
  const mle = userMleRoom(league, season, p.pid);
  // the mid-level covers the money, not the length
  if (amount <= mle && years > MLE_YEARS) return `Mid-level exception deals run ${MLE_YEARS} years at most.`;
  const cap = CAP_FOR(league, season);
  const offers = bidHolds(league, p.pid);
  const space = Math.max(0, cap.salaryCap - payroll(league, tid, season) - offers);
  // the mid-level would pay him, but a pending offer has it
  const mleBid = bidOnException(league, 'mle', p.pid);
  if (mleBid && years <= MLE_YEARS && amount <= exceptionRoom(league, tid, 'mle', season))
    return `Your pending offer to ${playerName(league.players[mleBid.pid])} uses your mid-level exception. Withdraw that offer first.`;
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  return `${space >= 50 ? `Not enough cap space, ${money(space)}` : 'No cap space'}${offers > 0 ? ' after your pending offers' : ''}. Over the cap, offer his minimum, ${moneyExact(min)}${mle > 0 ? `, or up to ${money(mle)} with your mid-level exception` : ''}.`;
}

/** The user's pending offers to top free agents but `exceptPid`'s, each holding a roster spot until decided. */
const pendingOffers = (league: League, exceptPid: number) => otherBids(league, exceptPid).length;

// ---------------------------------------------------------------- offers to top free agents (W5)

/** Share of the cap from which a free agent's asking price makes him a top free agent. */
const MARQUEE_ASK = 0.08;
/** Below this share of his asking price a top free agent won't consider an offer. */
export const BID_FLOOR = 0.9;

/**
 * A top free agent weighs offers in the summer instead of taking the first at his price: worth
 * 78+, or asking 8% of the cap or more. Everything else (in season, the preseason, cheaper
 * players) signs on the spot.
 */
export function marqueeFA(league: League, p: Player): boolean {
  if (league.phase !== 'freeAgency' || p.tid !== FREE_AGENT) return false;
  return valueScore(league, p) >= MARQUEE_VALUE || askingContract(league, p).amount >= CAP_FOR(league, contractSeason(league)).salaryCap * MARQUEE_ASK;
}

export const pendingBid = (league: League, pid: number): FaBid | undefined => league.faBids?.find((b) => b.pid === pid);
const otherBids = (league: League, pid: number) => (league.faBids ?? []).filter((b) => b.pid !== pid);

/** Cap room the user's pending offers on cap space hold (all but `exceptPid`'s). */
export function bidHolds(league: League, exceptPid = -1): number {
  return otherBids(league, exceptPid).reduce((a, b) => a + (b.route === 'space' ? b.amount : 0), 0);
}

/** The user's pending offer (but `exceptPid`'s) made on the mid-level: it keeps the exception from another signing. */
export function bidOnException(league: League, kind: Exception, exceptPid = -1): FaBid | undefined {
  return otherBids(league, exceptPid).find((b) => b.route === kind);
}

/** The user's room on his mid-level for an offer to `exceptPid`: none while another pending offer has it (see bidOnException). */
export function userExceptionRoom(league: League, kind: Exception = 'mle', season = contractSeason(league), exceptPid = -1): number {
  return bidOnException(league, kind, exceptPid) ? 0 : exceptionRoom(league, league.userTid, kind, season);
}

/** The user's mid-level room for an offer to `exceptPid` (see userExceptionRoom). */
export const userMleRoom = (league: League, season = contractSeason(league), exceptPid = -1) => userExceptionRoom(league, 'mle', season, exceptPid);

/**
 * How the user can pay free agent `p` this much, with his pending offers committed: the minimum, cap
 * space net of what his offers on space hold, or the mid-level when no pending offer has it (`years`:
 * only for a deal it allows). Without pending offers this is signingRoute.
 */
export function offerRoute(league: League, p: Player, amount: number, season = contractSeason(league), years?: number): SigningRoute | null {
  const tid = league.userTid;
  const cap = CAP_FOR(league, season);
  if (amount <= (p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return 'min';
  if (payroll(league, tid, season) + bidHolds(league, p.pid) + amount <= cap.salaryCap) return 'space';
  if ((years === undefined || years <= MLE_YEARS) && amount <= userMleRoom(league, season, p.pid)) return 'mle';
  return null;
}

/**
 * The user signed someone for the minimum: his pending offers (on cap space or the mid-level) could
 * have come first, since a minimum deal fits over the cap, so it doesn't count against them.
 */
function slackForBids(league: League, route: SigningRoute | null, salary: number) {
  if (route !== 'min') return;
  for (const b of league.faBids ?? []) if (b.route === 'space' || isException(b.route)) b.slack = (b.slack ?? 0) + salary;
}

/** The least a top free agent will consider from the user for this many years: 90% of his asking price, never under his summer floor. */
export function bidFloor(league: League, p: Player, years: number): number {
  const ask = askingContract(league, p, league.userTid);
  const cap = CAP_FOR(league, contractSeason(league));
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  // (never under his summer floor, see SUMMER_FLOOR)
  return Math.max(min, Math.ceil((Math.max(ask.amount * BID_FLOOR, summerFloor(league, p)) * (1 + Math.abs(years - ask.years) * 0.03)) / 50) * 50);
}

/** The faDay a new offer to him would be decided on: a day or two out (a hash), the last day at the latest; a raised offer keeps the first one's. */
export function bidDecideDay(league: League, pid: number): number {
  const old = pendingBid(league, pid);
  if (old) return old.decideDay;
  return Math.min(FA_DAYS - 1, league.faDay + 1 + (hashString(`${league.id}:${league.season}:${pid}:decide`) % 2));
}

/** An AI team's offer for a top free agent. */
export interface FaOffer {
  tid: number;
  amount: number;
  years: number;
  /** How the team pays for it: a route the rules allow for this money and length now (see aiRoute). */
  route: SigningRoute;
  /** How much he likes it: see offerUtility. */
  utility: number;
  /** His old team bringing him back on his Bird rights (over the cap: no exception used, `route` is 'min'). */
  bird?: true;
}

/**
 * How much a player likes an offer: the money against what he'd ask of that team (his market price
 * moved by the team's appeal, up to 10% either way: contracts.ts's askLean, the same rate his asking
 * price uses), to the power of how much money matters to him × how close the years are to what he
 * wants of that team (3% a year, as asking prices count it) × a small noise of his own (±2%, a hash)
 * and a tie-break by the team's appeal past what its price already says. So an offer at a team's own
 * asking price scores about the same as another team's at its own, equal money goes to the team he
 * likes better, and what a bad team must pay over a good one is bounded: about a fifth at the
 * extremes. Until 2026-11-24 the appeal multiplied the utility on top of the money (0.75 to 1.25,
 * against a price that moved 10%), and the money counted to the power of his priority for it (as low
 * as 0.3): a 15-67 team's bid had to be 140% of a top free agent's market price to lead his field at
 * the median, 170% for a quarter of them and 326% for one (measured over a summer's top 25; the
 * playtest's rebuilder won his man at 40% over). Now 119% at the median and 123% at most, where
 * its own asking price is 111%: the rest is a contender's bid over its own price (CONTENDER_BID).
 */
export function offerUtility(league: League, p: Player, tid: number, amount: number, years: number, prefs: PlayerPrefs = playerPrefs(league, p)): number {
  const price = askingContract(league, p).amount;
  const fit = 1 / (1 + Math.abs(years - askingContract(league, p, tid).years) * 0.03);
  const noise = 0.98 + 0.04 * (hashString(`${league.id}:${league.season}:${p.pid}:${tid}:offer`) / 4294967296);
  const lean = askLean(league, p, tid);
  // (what its appeal says past the 10% its price moves: a tie-break between equal offers, never a price)
  const liked = Math.pow(teamAppeal(league, tid, p, prefs) * lean, APPEAL_TIE);
  return Math.pow(amount / (price * lean), moneyPower(prefs)) * liked * fit * noise;
}

/**
 * The power his money counts to in an offer's utility: his priority for it, never under 1. A player
 * who cares little for money still takes the dollar-for-dollar better offer of two he likes alike:
 * under 1, the tie-break and the noise (a few percent of utility) cost a team twice that in salary.
 */
export const moneyPower = (prefs: Pick<PlayerPrefs, 'money'>) => Math.max(1, prefs.money);

/** How much of a team's appeal past its price's 10% still counts between offers (an exponent: a tie-break). */
const APPEAL_TIE = 0.05;

/** A team's roster as aiWants reads it, kept by aiMarquee while the team signs nobody: no spot to give (`shut`), the bar a newcomer must clear, and the roster's size with that spot. */
type WantRead = { shut: boolean; bar: number; size: number };

function wantRead(league: League, t: Team, season: number): WantRead {
  const roster = regularRoster(league, t.tid);
  const full = roster.length >= CAP.rosterMax;
  const cut = swapCandidate(league, t.tid, season);
  return { shut: full && !cut, bar: cut ? swapBar(league, cut) : -Infinity, size: full ? roster.length - 1 : roster.length };
}

/** Whether AI team `t` would go after him at all: aiSign's roster and value criteria, without its dice (`memo`: each team's roster read, see aiMarquee). */
function aiWants(league: League, t: Team, p: Player, season: number, memo?: Map<number, WantRead>): boolean {
  let w = memo?.get(t.tid);
  if (!w) {
    w = wantRead(league, t, season);
    memo?.set(t.tid, w);
  }
  if (w.shut) return false;
  const v = valueScore(league, p);
  return !(v < w.bar) && !(w.size >= 13 && v < 64);
}

/**
 * The market closes: a free agent worth 78+ (or rated 72+, with a summer floor: see SUMMER_FLOOR)
 * still unsigned whose old team holds his Bird rights goes back to it, as a holdout ends, on a deal
 * of two years at most at his price now, when those rights reach his floor (short
 * rights would bring him back at a fifth of his value), it wants him, has the spot (see aiWants)
 * and stays within what it would pay to keep him (just under its top line for 78+, see
 * aiTopLine; its re-signing budget for anyone else, see payrollBudget): a team doesn't let a player
 * that good walk for nothing, nor the summer floors sit him out (see SUMMER_FLOOR), but it
 * doesn't go past its top line for him either (brought back past every budget, the top free
 * agents took AI payrolls to 1.8× the cap).
 */
export function aiLateReturns(league: League) {
  if (league.phase !== 'freeAgency') return;
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const left = freeAgents(league)
    .filter((p) => valueScore(league, p) >= MARQUEE_VALUE || summerFloor(league, p) > 0)
    .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid);
  for (const p of left) {
    const old = seasonTid(p, league.season);
    if (old === null || old === league.userTid || releasedBy(league, p, old) || !aiWants(league, league.teams[old], p, season)) continue;
    const ask = askingContract(league, p, old);
    const amount = Math.min(ask.amount, resignLimit(league, p, old));
    if (amount < summerFloor(league, p) - 50) continue;
    const t = league.teams[old];
    const v = valueScore(league, p);
    // (a player worth 78+ no other team could pay: up to just under its top line, see aiTopLine)
    const ceiling = v >= MARQUEE_VALUE ? aiTopLine(cap) : payrollBudget(cap, t, v, { core: false, young: playerAge(p, season) <= 28 });
    if (payroll(league, old, season) + amount > ceiling) continue;
    signPlayer(league, p, old, amount, Math.min(2, ask.years), { start: season, bird: true });
  }
}

/**
 * The AI teams that would bid for a top free agent now, most attractive offer first: each one
 * that wants him and can pay his asking price for it offers that, a contender up to CONTENDER_BID more if
 * its space (net of what the summer market holds, see capSpace) or its exception covers it; one
 * that can't pay his price offers the most its space or best exception reaches when that's at
 * least 90% of his price and his summer floor (an 80+ player's: see SUMMER_FLOOR), so the
 * mid-levels and the room left bid on the good players as their price comes within reach. Every offer is one the team
 * can make: `route` pays for it as it stands.
 */
/**
 * How much over his price a contender with the room bids for a top free agent. At 10%, with the
 * appeal a winning team already has, a bid at the user's asking price led a fictional league's top
 * free agents' fields 1% of the time and one 10% over it 18%: a playtester won his man at 40% over.
 */
const CONTENDER_BID = 0.05;

export function faInterest(league: League, p: Player, memo?: Map<number, WantRead>): FaOffer[] {
  const season = contractSeason(league);
  const prefs = playerPrefs(league, p);
  const out: FaOffer[] = [];
  const bird = birdRoom(league, p, season, memo);
  const floor = summerFloor(league, p);
  for (const t of league.teams) {
    if (t.tid === league.userTid || releasedBy(league, p, t.tid) || !aiWants(league, t, p, season, memo)) continue;
    const ask = askingContract(league, p, t.tid);
    // his old team can still bring him back on his Bird rights, over the cap (see birdRoom; his price
    // came down to its room at his interest in it, so within a rounding of it)
    if (bird && t.tid === bird.tid && ask.amount <= bird.room + 100) {
      const amount = Math.max(Math.min(ask.amount, Math.floor(bird.room / 10) * 10), Math.min(ask.amount, CAP_FOR(league, season).vetMin));
      out.push({ tid: t.tid, amount, years: ask.years, route: 'min', bird: true, utility: offerUtility(league, p, t.tid, amount, ask.years, prefs) });
      continue;
    }
    let amount = ask.amount;
    let route = aiRoute(league, t.tid, amount, season, p, ask.years);
    // (a rebuilder pays a veteran of 29 or older the minimum at most, see aiSign)
    if (route !== 'min' && t.strategy === 'rebuild' && playerAge(p, season) >= 29) continue;
    // a good free agent's price a little past what a team can pay: it bids the most its cap space or
    // best exception reaches, when that's at least 90% of his price (the least he considers from the
    // user, see bidFloor) and his summer floor (see SUMMER_FLOOR); he weighs it against the others
    const need = Math.max(floor, ask.amount * BID_FLOOR);
    // (past the mid-level only cap space can reach, and that's checked first)
    if (!route && need <= Math.max(exceptionAmount(league, 'mle', season), CAP_FOR(league, season).salaryCap - payroll(league, t.tid, season))) {
      const most = Math.floor(Math.min(ask.amount, Math.max(capSpace(league, t.tid, season), aiMleRoom(league, t.tid, season))) / 50) * 50;
      if (most >= need) {
        amount = most;
        route = aiRoute(league, t.tid, amount, season, p, ask.years);
      }
    }
    if (!route) continue;
    const years = route === 'min' ? ask.years : Math.min(routeYears(route), ask.years);
    let paid: SigningRoute = route;
    if (t.strategy === 'contend' && route !== 'min' && amount === ask.amount) {
      const room = route === 'space' ? capSpace(league, t.tid, season) : aiMleRoom(league, t.tid, season);
      const more = Math.max(ask.amount, Math.min(Math.round((ask.amount * (1 + CONTENDER_BID)) / 50) * 50, room, playerMax(league, p, season, t.tid)));
      // (and only as much more as a route the rules allow for that length still pays)
      const r = more > ask.amount ? aiSigningRoute(league, t.tid, more, season, p, years) : route;
      if (r) {
        amount = more;
        paid = r;
      }
    }
    out.push({ tid: t.tid, amount, years, route: paid, utility: offerUtility(league, p, t.tid, amount, years, prefs) });
  }
  return out.sort((a, b) => b.utility - a.utility || a.tid - b.tid);
}

/**
 * The offers a top free agent weighs against the user's on his decision day: the AI teams' (see
 * faInterest), and his old team's on his Bird rights even when its budget can't reach his price
 * (what it can pay, see birdRoom), all scored by the same offerUtility as the user's. Without it, a
 * star who passed on the user's offer could take his old team's lower one a day later, once his
 * price had come down to it. Never under his summer floor (see SUMMER_FLOOR), as no AI signing is:
 * his price doesn't come down past it, and a Bird offer under it signed a rival for 35% of his
 * value the day the user's offer lost (one that left him unsigned with no offer at all).
 */
export function bidRivals(league: League, p: Player): FaOffer[] {
  const offers = faInterest(league, p);
  const season = contractSeason(league);
  const bird = birdRoom(league, p, season);
  const cap = CAP_FOR(league, season);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  if (!bird || offers.some((o) => o.tid === bird.tid)) return offers;
  const amount = Math.floor(bird.room / 50) * 50;
  // (within a rounding of it, as aiLateReturns and aiSign take it)
  if (amount <= min || amount < summerFloor(league, p) - 50) return offers;
  const years = askingContract(league, p, bird.tid).years;
  offers.push({ tid: bird.tid, amount, years, route: 'min', bird: true, utility: offerUtility(league, p, bird.tid, amount, years) });
  return offers.sort((a, b) => b.utility - a.utility || a.tid - b.tid);
}

/**
 * Where an offer from the user would stand against the offers he weighs now (see bidRivals): his
 * utility for it, whether it wins (with no rival offer, any he'll consider: his floor, see
 * bidFloor), and about what would lead the field today (null when even the max wouldn't), never
 * under the least he'll consider from the user. Today's offers: a rival's can move by his decision
 * day (its room spent or freed), so it's the staff's read, not a promise.
 */
export function bidStanding(
  league: League,
  p: Player,
  amount: number,
  years: number,
  offers: FaOffer[] = bidRivals(league, p),
): { offers: FaOffer[]; leads: boolean; toLead: number | null } {
  const tid = league.userTid;
  const prefs = playerPrefs(league, p);
  const best = offers[0];
  const floor = bidFloor(league, p, years);
  if (!best) return { offers, leads: amount >= floor, toLead: floor };
  const mine = offerUtility(league, p, tid, amount, years, prefs);
  // the amount whose utility matches the best rival's (utility is a power of the amount), and
  // nothing he wouldn't consider (a rival's low offer once led to a figure under the floor)
  const need = Math.max(floor, Math.ceil((amount * Math.pow(best.utility / mine, 1 / moneyPower(prefs))) / 50) * 50);
  const max = CAP_FOR(league, contractSeason(league)).maxContract(p.experience);
  return { offers, leads: amount >= floor && mine >= best.utility, toLead: need <= max ? need : null };
}

/** The most the user can offer a free agent over `years`, and how it's paid for (null: not even his minimum). */
export interface Payable {
  amount: number;
  route: SigningRoute | null;
}

/**
 * The most the user can offer `p` over `years` as things stand (cap space, an exception that allows
 * the length, the minimum; his pending offers committed, the owner's freeze), in $50K steps: what
 * offerBlockedReason lets through. Advice that names a figure (BidPanel's "Lead with") checks it
 * against this first, so it never recommends an offer the user can't make.
 */
export function mostPayable(league: League, p: Player, years: number): Payable {
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const ok = (a: number) => !offerBlockedReason(league, p, a, years);
  if (!ok(min)) return { amount: 0, route: null };
  // payable is a ceiling (space, or an exception's room): the largest step under it
  let lo = Math.ceil(min / 50);
  let hi = Math.floor(playerMax(league, p, season) / 50);
  if (ok(hi * 50)) lo = hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ok(mid * 50)) lo = mid;
    else hi = mid;
  }
  const amount = lo * 50 <= min ? min : lo * 50;
  return { amount, route: offerRoute(league, p, amount, season, years) };
}

/**
 * Make (or raise) an offer to a top free agent in the summer: he weighs it against the AI teams'
 * on his decision day (see resolveBids). Same gates as userOffer, with the user's other pending
 * offers counted against his cap space, mid-level and roster spots; under 90% of his asking
 * price he won't consider it. Anyone else is offered on the spot (userOffer).
 */
export function userBid(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  if (releasedBy(league, p, league.userTid)) return { ok: false, reason: RELEASED_REASON(p) };
  if (!marqueeFA(league, p)) return userOffer(league, pid, amount, years);
  if (years < 1 || years > FA_YEARS) return { ok: false, reason: FA_YEARS_REASON };
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years);
  if (closed) return { ok: false, reason: closed };
  const floor = bidFloor(league, p, years);
  if (amount < floor)
    return {
      ok: false,
      reason: `${playerName(p)} won't consider less than ${money(floor)} a season over ${years} year${years > 1 ? 's' : ''}. He asks ${money(askingContract(league, p, league.userTid).amount)}.`,
    };
  const route = offerRoute(league, p, amount, contractSeason(league), years)!;
  const old = pendingBid(league, pid);
  const bid: FaBid = { pid, amount, years, day: old?.day ?? league.faDay, decideDay: bidDecideDay(league, pid), route };
  if (old?.slack) bid.slack = old.slack;
  league.faBids = [...otherBids(league, pid), bid];
  const when = bid.decideDay > league.faDay ? `on day ${bid.decideDay + 1}` : 'when free agency closes';
  return { ok: true, reason: `${old ? 'Offer raised' : 'Offer submitted'}: ${playerName(p)} decides ${when}.` };
}

export function withdrawBid(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (!pendingBid(league, pid)) return { ok: false, reason: 'No pending offer to him.' };
  league.faBids = otherBids(league, pid);
  if (!league.faBids.length) delete league.faBids;
  return { ok: true, reason: `Offer to ${p ? playerName(p) : 'him'} withdrawn.` };
}

/** Why a pending offer can no longer be signed as made, or how it would be paid for now. */
function bidRouteNow(league: League, b: FaBid, p: Player): { route: SigningRoute | null; why: string } {
  const tid = league.userTid;
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const max = rosterMaxNow(league);
  if (league.fired) return { route: null, why: 'we no longer run the team' };
  if (standardRoster(league, tid).length >= max) return { route: null, why: `our roster is full (${max})` };
  if (b.amount <= (p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return { route: 'min', why: '' };
  // (minimum signings made while it was pending, its slack, could have come after it)
  const pay = payroll(league, tid, season) - (b.slack ?? 0) + bidHolds(league, b.pid);
  if (pay + b.amount <= cap.salaryCap) return { route: 'space', why: '' };
  const mle = userMleRoom(league, season, b.pid);
  if (b.amount <= mle && b.years <= MLE_YEARS) return { route: 'mle', why: '' };
  const space = Math.max(0, cap.salaryCap - pay);
  return {
    route: null,
    why: `we no longer have the cap space for it (${money(space)} left)${mle > 0 ? ` and our mid-level exception only reaches ${money(mle)}${b.years > MLE_YEARS ? ` for ${MLE_YEARS} years` : ''}` : ''}`,
  };
}

const yrs = (n: number) => `${n} yr${n > 1 ? 's' : ''}`;

/**
 * Why he took the other offer, in the terms he weighed them (offerUtility): the money, what he asks
 * of each team (his price moves up to 10% with a team's appeal: its record, its market, the role it
 * has for him), the years against the years he wanted, and a small pull of his own. Every part that
 * leaned their way is named, biggest first, with what it would have taken to win him: a losing bid
 * that paid more had read only "they chose them" with "money matters most" under it (four of the
 * playtest's ten lost one that way, 2026-11-24).
 */
function lostWhy(
  league: League,
  p: Player,
  prefs: PlayerPrefs,
  us: { tid: number; amount: number; years: number; utility: number },
  them: { tid: number; amount: number; years: number; utility: number },
): string {
  const abbrev = league.teams[them.tid].abbrev;
  const power = moneyPower(prefs);
  const parts: { size: number; text: string }[] = [];
  // the money itself
  if (them.amount > us.amount) parts.push({ size: Math.pow(them.amount / us.amount, power), text: `${abbrev} paid more` });
  // what he asks of each team: the same salary is worth more to him from the team he rates higher
  const [leanU, leanT] = [askLean(league, p, us.tid), askLean(league, p, them.tid)];
  if (leanU > leanT * 1.005) {
    const [a, b] = [appealTerms(league, us.tid, p), appealTerms(league, them.tid, p)];
    const gaps = (
      [
        ['winning', prefs.winning * (b.winning - a.winning), `their record (${pct3(b.wp)} against our ${pct3(a.wp)})`],
        ['role', prefs.role * (b.role - a.role), 'a bigger role there'],
        ['market', prefs.market * (b.market - a.market), 'their market'],
      ] as [string, number, string][]
    )
      .filter((g) => g[1] > 0.004)
      .sort((x, y) => y[1] - x[1]);
    const sour = talksSour(league, us.tid, p) > 0 ? ' and our low offers earlier soured him on us' : '';
    const over = Math.round((leanU / leanT - 1) * 100);
    parts.push({
      size: Math.pow(leanU / leanT, power),
      text: `he rates ${abbrev} higher${gaps.length ? `, for ${gaps.map((g) => g[2]).join(' and ')}` : ''}${sour}, so the same salary counts for about ${Math.max(1, over)}% more from them`,
    });
  }
  // the years against what he wanted of each
  const want = (tid: number) => askingContract(league, p, tid).years;
  const fit = (tid: number, years: number) => 1 / (1 + Math.abs(years - want(tid)) * 0.03);
  const [fitU, fitT] = [fit(us.tid, us.years), fit(them.tid, them.years)];
  if (fitT > fitU * 1.005) parts.push({ size: fitT / fitU, text: `he wanted ${plural(want(us.tid), 'year')} from us and we offered ${us.years}` });
  parts.sort((x, y) => y.size - x.size);
  // what would have won him: our money raised until our offer scored as theirs did
  const need = Number.isFinite(us.utility) && us.utility > 0 ? Math.ceil((us.amount * Math.pow(them.utility / us.utility, 1 / power)) / 50) * 50 : 0;
  const why = parts.length
    ? `${parts
        .map((x) => x.text)
        .join('; ')
        .replace(/^./, (c) => c.toUpperCase())}.`
    : 'The two offers were as good as level to him, and he leaned their way: between offers this close it comes down to the player.';
  return `${why}${need > us.amount ? ` Winning him would have taken about ${money(need)} a season from us.` : ''}`;
}

const pct3 = (x: number) => x.toFixed(3).replace(/^0/, '');

/**
 * He decides on the user's offer: the user's (if it still fits) against the offers he weighs (see
 * bidRivals), best utility wins; alone, an offer he'd consider (90% of his price and up, see
 * userBid) wins, since nobody else's money is there for him to hold out for.
 */
function decideBid(league: League, b: FaBid) {
  const p = league.players[b.pid];
  if (!p || p.tid !== FREE_AGENT) return;
  const tid = league.userTid;
  const season = contractSeason(league);
  const name = playerName(p);
  const prefs = playerPrefs(league, p);
  const offers = bidRivals(league, p);
  const best = offers[0];
  const { route, why } = bidRouteNow(league, b, p);
  const mine = route ? offerUtility(league, p, tid, b.amount, b.years, prefs) : -Infinity;
  if (route && (!best || mine >= best.utility)) {
    spendRoute(league, tid, route, season);
    signPlayer(league, p, tid, b.amount, b.years, { start: season });
    slackForBids(league, route, salaryFor(p, season));
    const rivals = offers.map((o) => league.teams[o.tid].abbrev);
    addInbox(league, {
      from: 'Assistant GM',
      subject: `${name} chose us`,
      body: `${name} ${rivals.length ? `chose us over ${andList(rivals.slice(0, 4))}${rivals.length > 4 ? ` and ${rivals.length - 4} more` : ''}` : 'accepted our offer'}: ${yrs(b.years)} at ${money(b.amount)} per season${isException(route) ? `, using our ${EXCEPTIONS[route].name} for the season` : ''}. He has been added to the end of your rotation.`,
      tone: 'good',
      link: `/player/${p.pid}`,
    });
    return;
  }
  const ours = `Our offer: ${yrs(b.years)} at ${money(b.amount)}.`;
  if (best) {
    // (on the route faInterest found for it just now: every offer there is one the team can make)
    const t = league.teams[best.tid];
    const years = best.years;
    spendRoute(league, t.tid, best.route, season);
    signPlayer(league, p, t.tid, best.amount, years, { start: season, option: aiOption(league, p, best.amount, years), bird: best.bird });
    const lost = route
      ? ` ${lostWhy(league, p, prefs, { tid, amount: b.amount, years: b.years, utility: mine }, { tid: t.tid, amount: best.amount, years, utility: best.utility })}`
      : '';
    addInbox(league, {
      from: 'Assistant GM',
      subject: `${name} signed with ${t.abbrev}`,
      body: `${route ? `${name} chose ${teamCity(league, t)} over us` : `Our offer to ${name} fell through: ${why}. He signed with ${teamCity(league, t)}`}. Their offer: ${yrs(years)} at ${money(best.amount)}. ${ours}${lost}`,
      tone: 'bad',
      link: `/player/${p.pid}`,
    });
    return;
  }
  addInbox(league, {
    from: 'Assistant GM',
    subject: `Our offer to ${name} fell through`,
    body: `Our offer to ${name} fell through: ${why}. ${ours} He's still on the market.`,
    tone: 'neutral',
    link: '/office/free-agents',
  });
}

/** Top free agents whose decision day is `through` or earlier decide on the user's offers (all of them when free agency closes). */
export function resolveBids(league: League, through = Infinity) {
  const due = (league.faBids ?? []).filter((b) => b.decideDay <= through).sort((a, b) => a.decideDay - b.decideDay || a.day - b.day || a.pid - b.pid);
  for (const b of due) {
    // out of the pending list first: it no longer holds room against itself
    league.faBids = otherBids(league, b.pid);
    decideBid(league, b);
  }
  if (league.faBids && !league.faBids.length) delete league.faBids;
}

/** How the user would like to sign a free agent beyond the money and years: an option on the final season (a two-year deal or longer; not on an extension). */
export interface OfferExtras {
  option?: 'player' | 'team';
}

/**
 * The user offers a free agent a contract. A top free agent in the summer weighs it against other
 * teams' (userBid); anyone else negotiates (see hearOffer): at or above his walk-away price he signs
 * on the spot, below it he counters and his patience drops.
 */
export function userOffer(league: League, pid: number, amount: number, years: number, extras: OfferExtras = {}): OfferResult {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  if (releasedBy(league, p, league.userTid)) return { ok: false, reason: RELEASED_REASON(p) };
  // a top free agent in the summer weighs offers
  if (marqueeFA(league, p)) return userBid(league, pid, amount, years);
  const season = contractSeason(league);
  const tid = league.userTid;
  if (years < 1 || years > FA_YEARS) return { ok: false, reason: FA_YEARS_REASON };
  if (extras.option && years < 2) return { ok: false, reason: 'An option needs a deal of two years or more.' };
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years);
  if (closed) return { ok: false, reason: closed };
  const route = offerRoute(league, p, amount, season, years)!;
  const h = hearOffer(league, p, 'fa', { amount, years, option: extras.option }, { min: 1, max: routeYears(route) });
  if (!h.accept) return { ok: false, reason: h.text, counter: h.counter };
  spendRoute(league, tid, route, season);
  signPlayer(league, p, tid, amount, years, { start: season, option: extras.option });
  slackForBids(league, route, salaryFor(p, season));
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signed`,
    body: `“${playerSays(league, p, 'deal', `${season}:sign`)}”\n${playerName(p)} agreed to ${years} year${years > 1 ? 's' : ''} at ${money(amount)} per season${extras.option ? `, with a ${extras.option} option on the last` : ''}${isException(route) ? `, using our ${EXCEPTIONS[route].name} for the season` : ''}. He has been added to the end of your rotation.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} accepts!` };
}

/** The user's new contracts this summer, re-signings and free agents (not draft picks' rookie deals). */
export const signedThisSummer = (league: League) => teamPlayers(league, league.userTid).filter((p) => p.contract.start === league.season + 1 && !p.contract.rookie);

/**
 * The user's roster as the offseason limit counts it while expiring deals are re-signed or let go:
 * his players signed for next season, and in free agency his pending offers, each holding a spot
 * (see summerRoster).
 */
export const resignRoster = (league: League) => summerRoster(league, league.userTid);

/**
 * The user re-signs one of his expiring players with Bird rights (no cap limit), in the re-sign
 * period. A negotiation like any other (see hearOffer), options included.
 */
export function userResign(league: League, pid: number, amount: number, years: number, extras: Pick<OfferExtras, 'option'> = {}): OfferResult {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (league.phase !== 'resign') return { ok: false, reason: 'Re-signing happens between the draft and free agency.' };
  if (!p || p.tid !== league.userTid) return { ok: false, reason: 'Not on your team.' };
  if (contractExp(p.contract) > league.season) return { ok: false, reason: `${playerName(p)} is still under contract.` };
  // (he asked for a trade and never got his role back: he leaves, see pulse.ts)
  const out = askedOutReason(league, p);
  if (out) return { ok: false, reason: out };
  // a new deal takes one of next season's 21 spots, like any other signing (pending offers hold theirs)
  if (resignRoster(league) >= OFFSEASON_ROSTER_MAX)
    return {
      ok: false,
      reason: `Your roster is full for next season (${OFFSEASON_ROSTER_MAX}${league.faBids?.length ? ', counting your pending offers' : ''}). Release or trade someone first.`,
    };
  const most = maxYearsWith(league, p, league.userTid);
  if (years < 1 || years > most)
    return { ok: false, reason: most === 5 ? 'Contracts must be 1 to 5 years.' : `Without full Bird rights, three seasons with you, he re-signs for 4 years at most.` };
  if (extras.option && years < 2) return { ok: false, reason: 'An option needs a deal of two years or more.' };
  const limit = resignLimit(league, p, league.userTid);
  // a player worth more than his Bird rights allow goes to the market
  if (amount > limit || askingContract(league, p, league.userTid).amount > limit) return { ok: false, reason: resignLimitReason(league, p, limit) };
  const h = hearOffer(league, p, 'resign', { amount, years, option: extras.option }, { min: 1, max: most });
  if (!h.accept) return { ok: false, reason: h.text, counter: h.counter };
  signPlayer(league, p, league.userTid, amount, years, { start: league.season + 1, option: extras.option });
  return { ok: true, reason: `${playerName(p)} re-signs! “${playerSays(league, p, 'deal', `${league.season}:resign`)}”` };
}
