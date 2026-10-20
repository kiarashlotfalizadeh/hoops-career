import type { FaBid, League, Player, Team } from '../types';
import { FREE_AGENT } from '../types';
import { Rng, hashString } from '../random';
import { CAP } from '../constants';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import {
  CAP_FOR,
  OFFSEASON_ROSTER_MAX,
  TWO_WAY_MAX,
  contractSeason,
  addInbox,
  andList,
  freeAgents,
  payroll,
  playerName,
  rosterMaxNow,
  seasonTid,
  standardRoster,
  teamPlayers,
  twoWayRoster,
} from './helpers';
import {
  EXCEPTIONS,
  EXCEPTION_ORDER,
  FA_DAYS,
  FA_PRICE_CUT_DAYS,
  FIRED_REASON,
  type Ask,
  type Exception,
  type PlayerPrefs,
  type SigningRoute,
  aiOption,
  aiRoute,
  askingContract,
  birdTier,
  nonGuaranteed,
  playerMax,
  releasedBy,
  bestExceptionRoom,
  capSpace,
  exceptionRoom,
  extendContract,
  extensionAsk,
  extensionClosedReason,
  extensionRefusal,
  isException,
  leaveTeam,
  marketHolds,
  marketSalary,
  payrollBudget,
  playerPrefs,
  teamCore,
  preferredYears,
  releaseDeadMoney,
  releasePlayer,
  resignLimit,
  rookieScaleDeal,
  maxYearsWith,
  routeYears,
  signPlayer,
  signingRoute,
  summerRoster,
  teamAppeal,
  twoWayEligible,
  twoWaySalary,
  twoWayYears,
  spendRoute,
  valueScore,
  wantsTwoWay,
  willSign,
} from './contracts';
import { type OfferResult, hearOffer } from './negotiation';
import {
  AI_SHEET_PENALTY,
  AI_SHEET_VALUE,
  MATCH_DAYS,
  SHEET_MIN_YEARS,
  aiQualify,
  aiRfaTerms,
  deadlineLabel,
  matchDeadline,
  pendingSheets,
  resolveOfferSheets,
  setRfaHold,
  sheetBlockedReason,
  signOfferSheet,
} from './rfa';
import { logMove } from './transactions';
import { money, moneyExact } from '../format';

export { FA_DAYS };

/** Why the user can't sign a player he released this season (see releasedBy). */
export const RELEASED_REASON = (p: Player) => `You released ${playerName(p)} this season: you can't sign him again until next season.`;

/** Free agents sign for four years at most: five is for re-signing one's own player with full Bird rights. */
export const FA_YEARS = 4;
const FA_YEARS_REASON = `Free agents sign for 1 to ${FA_YEARS} years: five is only for re-signing your own player with full Bird rights.`;

/** Why the user can't re-sign him for more than `limit`: his Bird rights with the team (see resignLimit). */
export function resignLimitReason(league: League, p: Player, limit: number): string {
  const tier = birdTier(league, p);
  return tier === 'early'
    ? `With Early Bird rights (two seasons with you) you can re-sign ${playerName(p)} for up to ${money(limit)}: 175% of his salary or 105% of the league's average, whichever is more.`
    : `Without Bird rights (a season with you) you can re-sign ${playerName(p)} for up to ${money(limit)}: 120% of his salary. Beyond that he's a free agent like any other.`;
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
    const v = valueScore(league, p);
    const ask = askingContract(league, p, t.tid);
    // without full Bird rights his team can only pay him so much (see resignLimit): above it he walks
    if (ask.amount > resignLimit(league, p, t.tid)) continue;
    const budget = payrollBudget(cap, t, v, { core: top.has(p.pid), young: playerAge(p, next) <= 28 }) + (v >= 80 ? cap.salaryCap * RESIGN_STAR_ROOM : 0);
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
 * market anyway, stars less often. Then each qualifies the young players it let go but would want
 * back, so they become restricted free agents (see aiQualify).
 */
export function aiResign(league: League, rng: Rng) {
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const plan = resignPlan(league, t, (p) => rng.chance(valueScore(league, p) >= 82 ? 0.95 : 0.85));
    for (const { p, ask } of plan) signPlayer(league, p, t.tid, ask.amount, ask.years, { start: league.season + 1, option: aiOption(league, p, ask.amount, ask.years) });
    aiQualify(league, t);
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
 * Cap holds: between the end of the season and free agency, a team's own expiring players still
 * count against next season's cap at about their asking price, so that space isn't spent twice
 * (absorbed in a trade, then used again to re-sign them with Bird rights). AI teams hold the
 * players they'd re-sign; the user holds everyone who'd re-sign until he renounces them or free
 * agency opens, and a player he has qualified at the larger of the qualifying offer and his ask.
 * In free agency the holds left are the
 * market's (see marketHolds): restricted free agents' and pending offer sheets', for every team.
 */
export function capHolds(league: League, tid: number): { p: Player; amount: number }[] {
  if (league.phase === 'freeAgency') return marketHolds(league, tid);
  if (league.phase !== 'draftLottery' && league.phase !== 'draft' && league.phase !== 'resign') return [];
  if (tid !== league.userTid) return resignPlan(league, league.teams[tid]).map(({ p, ask }) => ({ p, amount: ask.amount }));
  return expiringPlayers(league, tid)
    .filter((p) => !p.contract.twoWay)
    .map((p) => ({ p, amount: Math.max(p.rfa?.qo ?? 0, askingContract(league, p, tid).amount) }));
}

let holdsMemo: Map<number, number> | null = null;

/**
 * Run a read-only batch (trade evaluations) with each team's cap holds worked out once: an AI
 * team's holds replay its whole re-signing plan, which made the trading block slow in the summer.
 */
export function withHoldsMemo<T>(fn: () => T): T {
  if (holdsMemo) return fn();
  holdsMemo = new Map();
  try {
    return fn();
  } finally {
    holdsMemo = null;
  }
}

/** Payroll for cap purposes: committed salary and dead money, plus cap holds for next season during the draft and re-signing window, and the market's in free agency. */
export function capPayroll(league: League, tid: number, season = contractSeason(league)): number {
  const pay = payroll(league, tid, season);
  if (season !== league.season + 1) return pay;
  let holds = holdsMemo?.get(tid);
  if (holds === undefined) {
    holds = capHolds(league, tid).reduce((a, h) => a + h.amount, 0);
    holdsMemo?.set(tid, holds);
  }
  return pay + holds;
}

/** Give up the rights to an expiring player during the re-signing window: he hits the market and his cap hold goes away. */
export function renouncePlayer(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (league.phase !== 'resign') return { ok: false, reason: 'Rights can be renounced during the re-signing period.' };
  if (!p || p.tid !== league.userTid || contractExp(p.contract) > league.season) return { ok: false, reason: 'Not one of your expiring players.' };
  logMove(league, 'renounce', p.tid, p);
  leaveTeam(league.teams[p.tid], pid);
  // his rights go, a qualifying offer with them
  delete p.rfa;
  toFreeAgent(league, p);
  return { ok: true, reason: `${playerName(p)} is renounced: he becomes a free agent when the market opens.` };
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

/**
 * Move all unsigned expiring players into the free agent pool. A qualified one goes as a
 * restricted free agent, his team's cap hold for him set as he leaves its roster (see setRfaHold).
 */
export function releaseExpiring(league: League) {
  for (const p of Object.values(league.players)) {
    if (p.tid >= 0 && contractExp(p.contract) <= league.season) {
      setRfaHold(league, p);
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

/**
 * A team's standard players on its 15 regular spots: hardship 10-day players sit beyond them (see
 * tenDay.ts), so they neither fill a spot an AI signing could use nor get cut to make one.
 */
const regularRoster = (league: League, tid: number) => standardRoster(league, tid).filter((p) => !p.contract.tenDay?.hardship);

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
  // (the offer sheets it has signed hold their spots under the summer limit)
  if (season > league.season) return summerRoster(league, tid) < OFFSEASON_ROSTER_MAX ? byBar(roster)[roster.length - CAP.rosterMax] : undefined;
  const limit = CAP_FOR(league, season).vetMin * 2.2;
  return byBar(roster.filter((x) => deadIfCut(league, x) <= limit))[0];
}

/**
 * An AI team's offer sheet for a restricted free agent: his asking price from it for at least two
 * seasons (each year away from the length he wants adds 3%, as willSign counts it), paid for like
 * any signing (an exception's deal cut to its length); null when it can't pay for one.
 */
function aiSheetTerms(league: League, t: Team, p: Player, season: number): { amount: number; years: number; route: SigningRoute } | null {
  const ask = askingContract(league, p, t.tid);
  const max = CAP_FOR(league, season).maxContract(p.experience);
  const price = (y: number) => Math.min(max, Math.ceil((ask.amount * (1 + Math.abs(y - ask.years) * 0.03)) / 50) * 50);
  let years = Math.max(SHEET_MIN_YEARS, ask.years);
  let route = signingRoute(league, t.tid, price(years), season, p, years);
  // an exception's shorter deal costs a little more a season: price it at the length it allows
  for (const y of [4, 3, 2]) {
    if (route || y >= years || y < SHEET_MIN_YEARS) continue;
    route = signingRoute(league, t.tid, price(y), season, p, y);
    if (route) years = y;
  }
  return route ? { amount: price(years), years, route } : null;
}

/**
 * One AI team's shot at the market: the best fit it can pay (cap space, an exception or the
 * minimum). A full roster only adds a clearly better player than the one he'd displace. A
 * restricted free agent gets an offer sheet instead of a contract (see rfa.ts): a team is a bit
 * pickier about one his team may match (worth 72+, and 2 points off its interest), signs one at
 * a time, and only while the market leaves his team its full two days to decide.
 */
function aiSign(league: League, t: Team, rng: Rng, season: number, today = Infinity) {
  const roster = regularRoster(league, t.tid);
  const full = roster.length >= CAP.rosterMax;
  const cut = swapCandidate(league, t.tid, season);
  if (full && !cut) return;
  const size = full ? roster.length - 1 : roster.length;
  const floor = cut ? swapBar(league, cut) : -Infinity;
  // (AI moves land on the next free-agency day: see faAdvance)
  const sheetDay = league.faDay + 1;
  const sheets = league.phase === 'freeAgency' && matchDeadline(sheetDay) === sheetDay + MATCH_DAYS - 1 && !pendingSheets(league, t.tid).length;
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
    const r = p.rfa;
    // his own team waits for offer sheets to match; one who has signed a sheet is spoken for
    if (r && (!sheets || r.tid === t.tid || r.sheet)) continue;
    const v = valueScore(league, p);
    // (a young player with upside asking the minimum clears a lower bar)
    const bar = playerAge(p, season) <= 24 && p.pot >= 70 ? 60 : 64;
    if (v < floor || (size >= 13 && v < bar) || (r && v < AI_SHEET_VALUE)) continue;
    // his old team can bring him back on his Bird rights, over the cap, at a price its budget allows (see birdRoom)
    let bird = false;
    if (r) {
      if (!aiSheetTerms(league, t, p, season)) continue;
    } else {
      const amount = askingContract(league, p, t.tid).amount;
      const own = seasonTid(p, league.season) === t.tid ? birdRoom(league, p, season) : null;
      bird = !!own && own.tid === t.tid && amount <= own.room;
      const route = bird ? 'min' : signingRoute(league, t.tid, amount, season, p);
      // over the cap only a contender pays an exception into the tax; a rebuilder keeps its room
      // for youth (and the dumps it takes picks for), not veterans on real money; and nobody spends
      // its cap space before the top free agents have decided (their first three days)
      if (!route || (isException(route) && t.strategy !== 'contend' && pay + amount > cap.luxuryTax)) continue;
      if (t.strategy === 'rebuild' && route !== 'min' && playerAge(p, season) >= 29) continue;
      // and past 13 players, its spots go to its young players (26 or younger), not veterans
      if (t.strategy === 'rebuild' && size >= 13 && playerAge(p, season) >= 27) continue;
      if (route === 'space' && today <= MARQUEE_DAYS) continue;
    }
    const s = needScore(league, t.tid, p) + rng.normal(0, 1.5) - (r ? AI_SHEET_PENALTY : 0);
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
  if (pick.rfa) {
    const terms = aiSheetTerms(league, t, pick, season)!;
    signOfferSheet(league, pick, t.tid, terms.amount, terms.years, terms.route, sheetDay);
    return;
  }
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

/**
 * A star (worth 82+) holds his price in the summer: no cut at all before day 15 (space can still
 * open up, and his old team can still bring him back, see faInterest), then 15% a cut down to 60%
 * of his value at most, whatever teams can pay now; from day 25, with the summer's money nearly
 * spent, he takes what is left like anyone (see faDay). A star no team could pay 60% of his value
 * once the marquee days are over doesn't hold: he takes the best money there is (a mid-level from
 * a contender, as a rule) before it's spent on others, rather than the minimum a month in (80+
 * free agents signing for about the minimum: 3.1 → 2.6 a summer; 50 seasons a side).
 */
const STAR_HOLD = { value: 82, day: 15, floor: 0.6, late: 25 };

/**
 * What his old team would still pay a free agent to bring him back on his Bird rights, over the
 * cap: what those rights allow (see resignLimit) and its re-signing budget leave (see
 * payrollBudget: a star, or a player who'd be among its three best, counts as core), when it wants
 * him and has the spot. A top free agent weighs it among his bids (see faInterest); anyone else
 * signs when his price comes down to it (see aiSign), though a rebuilder doesn't bring back a
 * veteran of 29 or older that way. Null for a restricted free agent (his team holds his rights
 * another way) and outside the summer market.
 */
function birdRoom(league: League, p: Player, season: number): { tid: number; room: number } | null {
  if (league.phase !== 'freeAgency' || p.rfa) return null;
  const old = seasonTid(p, league.season);
  if (old === null || old === league.userTid || releasedBy(league, p, old)) return null;
  const t = league.teams[old];
  if (!aiWants(league, t, p, season) || (t.strategy === 'rebuild' && playerAge(p, season) >= 29 && !marqueeFA(league, p))) return null;
  const v = valueScore(league, p);
  const better = regularRoster(league, old).filter((x) => valueScore(league, x) > v).length;
  const budget = payrollBudget(CAP_FOR(league, season), t, v, { core: v >= STAR_HOLD.value || better < 3, young: playerAge(p, season) <= 28 });
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
  for (const p of stars) {
    const best = faInterest(league, p)[0];
    if (!best) continue;
    spendRoute(league, best.tid, best.route, season);
    signPlayer(league, p, best.tid, best.amount, best.years, { start: season, option: aiOption(league, p, best.amount, best.years), bird: best.bird });
  }
}

/**
 * One day of free agency: AI teams make offers, players accept the best fit, open two-way slots
 * go to young minimum-level players, and unsigned players cut their price every 5 days: by 15%, or
 * down to the most an AI team that would take him could still pay (cap space, an exception or his
 * old team on his Bird rights, at his interest in that team), on deals of 3 years at most. In season this runs once a week, so every
 * call is a price cut.
 */
export function faDay(league: League, rng: Rng, intensity = 1, today = league.faDay + 1) {
  // (today 0: the market's opening, when AI teams move with the user and nobody has decided yet)
  if (league.phase === 'freeAgency' && today > 0) {
    // top free agents whose decision day this is choose between the user's offer and AI teams' first
    resolveBids(league, today);
    // offer sheets whose last match day was the one ending now are decided, and AI teams' restricted
    // free agents who went ten days without one come to terms
    resolveOfferSheets(league, league.faDay);
    aiRfaTerms(league);
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
  // price cuts come first, so AI teams get the first look at a new price. Buyers are the teams with
  // a roster spot, or a player he'd clearly beat for one, and money beyond the minimum.
  const buyers = ai.flatMap((t) => {
    const cut = swapCandidate(league, t.tid, season);
    if (regularRoster(league, t.tid).length >= CAP.rosterMax && !cut) return [];
    // (only a contender pays an exception into the tax, see aiSign)
    const ex = bestExceptionRoom(league, t.tid, season);
    const room = Math.max(capSpace(league, t.tid, season), t.strategy === 'contend' ? ex : Math.min(ex, cap.luxuryTax - payroll(league, t.tid, season)));
    return room > 0 ? [{ t, room, bar: cut ? swapBar(league, cut) : -Infinity }] : [];
  });
  // what a player asks a team moves with his interest in it, up to 10% either way (see askingContract);
  // his old team can also pay him on his Bird rights (see birdRoom)
  const asks = (tid: number, p: Player, room: number) => room * Math.min(1.1, Math.max(0.9, teamAppeal(league, tid, p)));
  const roomFor = (p: Player) => {
    const bird = birdRoom(league, p, season);
    return Math.max(0, bird ? asks(bird.tid, p, bird.room) : 0, ...buyers.filter((b) => valueScore(league, p) >= b.bar).map((b) => asks(b.t.tid, p, b.room)));
  };
  for (const p of freeAgents(league)) {
    // (a restricted free agent who has signed an offer sheet is waiting on his team, not the market)
    if (p.faDays === undefined || p.rfa?.sheet) continue;
    // (saves from before the 5-day clock can still be counting down from 30)
    p.faDays = Math.min(p.faDays, FA_PRICE_CUT_DAYS) - (offseason ? 1 : FA_PRICE_CUT_DAYS);
    if (p.faDays > 0) continue;
    const ask = Math.min(p.asking?.amount ?? Infinity, marketSalary(league, p));
    const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
    // (a star nobody could pay most of his value once the first days have passed takes the best
    // money there is, an exception from a contender as a rule, rather than wait for it to be spent)
    const room = offseason && league.faDay >= MARQUEE_DAYS ? roomFor(p) : Infinity;
    const star = offseason && valueScore(league, p) >= STAR_HOLD.value && league.faDay < STAR_HOLD.late && room >= marketSalary(league, p) * STAR_HOLD.floor;
    const cut = !star ? Math.min(ask * 0.85, roomFor(p)) : league.faDay < STAR_HOLD.day ? ask : Math.max(ask * 0.85, marketSalary(league, p) * STAR_HOLD.floor);
    p.asking = { amount: Math.max(min, Math.round(cut / 10) * 10), years: Math.min(3, p.asking?.years ?? preferredYears(league, p)) };
    p.faDays = FA_PRICE_CUT_DAYS;
  }
  // the top free agents whose day it is pick among the AI teams' bids, then the rest of the market moves
  if (league.phase === 'freeAgency' && today > 0) aiMarquee(league, today);
  for (const t of ai) {
    if (freeAgents(league).length && rng.chance(Math.min(1, 0.55 * intensity))) aiSign(league, t, rng, season, league.phase === 'freeAgency' ? today : Infinity);
  }
  const twoWayPool = freeAgents(league)
    .filter((x) => wantsTwoWay(league, x))
    .sort((a, b) => valueScore(league, b) - valueScore(league, a));
  for (const t of ai) {
    if (!twoWayPool.length || twoWayRoster(league, t.tid).length >= TWO_WAY_MAX || !rng.chance(0.3 * intensity)) continue;
    const [p] = twoWayPool.splice(Math.min(twoWayPool.length - 1, rng.int(0, 2)), 1);
    signPlayer(league, p, t.tid, twoWaySalary(league, season), twoWayYears(p), { start: season, twoWay: true, news: false });
  }
}

/**
 * Make sure every AI team can field a legal roster (13+) with minimum signings: from the free agents
 * who'd take the minimum (one of the best four), else the best one worth under 76 (a better player
 * holds out for real money). Never a restricted free agent (his team holds his rights), nor a player
 * the team released this season.
 */
export function fillRosters(league: League, rng: Rng, season = league.season) {
  const cap = CAP_FOR(league, season);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    let size = standardRoster(league, t.tid).length;
    while (size < CAP.rosterMin) {
      const free = freeAgents(league).filter((p) => !p.rfa && !releasedBy(league, p, t.tid));
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
 * Trim AI rosters to 15 standard players and 3 two-ways (two-ways never cost a standard spot).
 * Cuts go mainly by value; a release that leaves dead money counts a little against cutting him
 * (0.3 points per $1M), so camp deals go first among near equals and a big contract survives
 * unless he is clearly the worst player.
 */
export function trimRosters(league: League, release: (p: Player) => void, standardMax: number = CAP.rosterMax) {
  const keep = (p: Player) => rosterKeep(league, p);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    for (const [roster, max] of [
      [standardRoster(league, t.tid), standardMax],
      [twoWayRoster(league, t.tid), TWO_WAY_MAX],
    ] as const) {
      roster.sort((a, b) => keep(a) - keep(b));
      while (roster.length > max) release(roster.shift()!);
    }
  }
}

/**
 * Opening night, after the cuts: a free agent left who is worth 66+ or rated 70+ (a camp's cut, a
 * veteran) joins the team whose last man he most clearly beats (by 2 points or more; a team that
 * isn't rebuilding counts a veteran's game now as much as his value) when letting that man go costs little (a camp
 * deal, or dead money of 2.2× the veteran minimum at most), or a team with a spot open, on a
 * one-year deal at his price if the team can pay it (an exception into the tax only for a
 * contender), else at the minimum, best players first: a good player left unsigned on opening
 * night is rare.
 */
export function openingSwaps(league: League) {
  const season = league.season;
  const cap = CAP_FOR(league, season);
  const pool = freeAgents(league)
    .filter((p) => !p.rfa && (valueScore(league, p) >= 66 || p.ovr >= 70))
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
      // with the summer's money spent he takes what's left: his price if the team can pay it, else the minimum
      let amount = askingContract(league, p, t.tid).amount;
      let route = signingRoute(league, t.tid, amount, season, p, 1);
      if (!route || (isException(route) && t.strategy !== 'contend' && payroll(league, t.tid, season) + amount > cap.luxuryTax)) {
        amount = min;
        route = 'min';
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
      return 'Re-signing period: you can only negotiate with your own players. Free agency opens next.';
    default:
      return null;
  }
}

/**
 * Why the user can't offer free agent `p` this much for this long at all (roster or cap, his pending
 * offers and offer sheets counted, and his restricted free agents' cap holds), or null. Asking price
 * aside. `via`: the exception he'd rather pay with when more than one covers it.
 */
export function offerBlockedReason(league: League, p: Player, amount: number, years: number, via?: Exception): string | null {
  const tid = league.userTid;
  const season = contractSeason(league);
  const max = rosterMaxNow(league);
  const pending = pendingOffers(league, p.pid);
  if (standardRoster(league, tid).length + pending >= max)
    return pending
      ? `Your roster is full (${max}) counting your ${pending} pending offer${pending > 1 ? 's' : ''}. Release or trade someone, or withdraw an offer.`
      : `Your roster is full (${max}). Release or trade someone first.`;
  if (offerRoute(league, p, amount, season, years, via)) return null;
  // an exception covers the money, not the length
  const covering = EXCEPTION_ORDER.filter((k) => amount <= userExceptionRoom(league, k, season, p.pid)).sort((a, b) => EXCEPTIONS[b].years - EXCEPTIONS[a].years)[0];
  if (covering && years > EXCEPTIONS[covering].years) {
    const name = EXCEPTIONS[covering].name;
    return `${name[0].toUpperCase()}${name.slice(1)} deals run ${EXCEPTIONS[covering].years} years at most.`;
  }
  const cap = CAP_FOR(league, season);
  const market = userHeld(league, season);
  const offers = bidHolds(league, p.pid) + market.sheets;
  const pay = payroll(league, tid, season) + offers + market.rfa;
  const space = Math.max(0, cap.salaryCap - pay);
  // a space signing that fits, but would end the mid-level a pending offer needs, or take a pending offer on the bi-annual past the tax line
  if (pay + amount <= cap.salaryCap) {
    const others = otherBids(league, p.pid);
    const mleBid = others.find((b) => b.route === 'mle');
    if (mleBid)
      return `Signing him with cap space would cost you the mid-level exception (a team that uses its space gets the smaller room exception instead), and your pending mid-level offer to ${playerName(league.players[mleBid.pid])} needs it. Withdraw that offer first.`;
    const baeBid = others.find((b) => b.route === 'bae');
    if (baeBid) return `That would take your pending bi-annual offer to ${playerName(league.players[baeBid.pid])} past the tax line. Withdraw it first, or offer less.`;
  }
  // the mid-level would pay him, but a pending offer on cap space has ended it
  const spaceBid = bidOnException(league, 'mle', p.pid);
  const exceptionBids = otherBids(league, p.pid).reduce((a, b) => a + (isException(b.route) ? b.amount : 0), 0);
  if (spaceBid?.route === 'space' && years <= EXCEPTIONS.mle.years && amount <= exceptionRoom(league, tid, 'mle', season, bidHolds(league, p.pid) + exceptionBids))
    return `Your pending offer to ${playerName(league.players[spaceBid.pid])} uses your cap space, and a team that uses its space loses the mid-level exception (it gets the smaller room exception instead). Withdraw that offer first.`;
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const rooms = EXCEPTION_ORDER.map((k) => ({ k, room: userExceptionRoom(league, k, season, p.pid) }))
    .filter((r) => r.room > 0)
    .map((r) => `up to ${money(r.room)} with your ${EXCEPTIONS[r.k].name}`);
  const after = [offers > 0 ? 'your pending offers' : '', market.rfa > 0 ? `your restricted free agents' cap holds` : ''].filter(Boolean).join(' and ');
  return `${space >= 50 ? `Not enough cap space (${money(space)})` : 'No cap space'}${after ? ` after ${after}` : ''}. Over the cap you can offer his minimum (${moneyExact(min)})${rooms.length ? `, or ${andList(rooms).replace(/ and up to/, ' or up to')}` : ''}.`;
}

/** The user's market holds (see marketHolds): his restricted free agents' cap holds, which count against his cap space, and his pending offer sheets, which count against the tax line too. */
function userHeld(league: League, season = contractSeason(league)): { rfa: number; sheets: number } {
  const out = { rfa: 0, sheets: 0 };
  for (const h of marketHolds(league, league.userTid, season)) out[h.kind === 'rfa' ? 'rfa' : 'sheets'] += h.amount;
  return out;
}

/** The user's pending commitments in the summer market but `exceptPid`'s, each holding a roster spot until decided: offers to top free agents, and offer sheets he signed. */
const pendingOffers = (league: League, exceptPid: number) => otherBids(league, exceptPid).length + pendingSheets(league, league.userTid).filter((p) => p.pid !== exceptPid).length;

// ---------------------------------------------------------------- offers to top free agents (W5)

/** Share of the cap from which a free agent's asking price makes him a top free agent. */
const MARQUEE_ASK = 0.08;
/** Below this share of his asking price a top free agent won't consider an offer. */
export const BID_FLOOR = 0.9;

/**
 * A top free agent weighs offers in the summer instead of taking the first at his price: worth
 * 78+, or asking 8% of the cap or more. Everything else (in season, the preseason, cheaper
 * players) signs on the spot. A restricted free agent signs an offer sheet his team can match
 * instead (see rfa.ts).
 */
export function marqueeFA(league: League, p: Player): boolean {
  if (league.phase !== 'freeAgency' || p.tid !== FREE_AGENT || p.waivers || p.rfa) return false;
  return valueScore(league, p) >= 78 || askingContract(league, p).amount >= CAP_FOR(league, contractSeason(league)).salaryCap * MARQUEE_ASK;
}

export const pendingBid = (league: League, pid: number): FaBid | undefined => league.faBids?.find((b) => b.pid === pid);
const otherBids = (league: League, pid: number) => (league.faBids ?? []).filter((b) => b.pid !== pid);

/** Cap room the user's pending offers on cap space hold (all but `exceptPid`'s): they come before any exception. */
export function bidHolds(league: League, exceptPid = -1): number {
  return otherBids(league, exceptPid).reduce((a, b) => a + (b.route === 'space' ? b.amount : 0), 0);
}

/**
 * The user's pending offer (but `exceptPid`'s) that keeps an exception from another signing: one
 * made on it, or for the mid-level one on cap space (using the space ends the mid-level, so while
 * an offer holds the space the mid-level is gone, as a pending mid-level offer keeps the space shut).
 */
export function bidOnException(league: League, kind: Exception, exceptPid = -1): FaBid | undefined {
  // (the mid-level and the taxpayer mid-level are one exception: a team uses one or the other)
  const mid = (k: string | undefined) => k === 'mle' || k === 'tmle';
  return otherBids(league, exceptPid).find((b) => b.route === kind || (mid(kind) && (b.route === 'space' || mid(b.route))));
}

/**
 * The user's room on an exception for an offer to `exceptPid`: none while another pending offer
 * leans on it (see bidOnException); for the mid-level and the bi-annual, his pending offers on cap
 * space and on the other exceptions count against the tax line too, since they land on his payroll
 * if they're taken.
 */
export function userExceptionRoom(league: League, kind: Exception, season = contractSeason(league), exceptPid = -1): number {
  if (bidOnException(league, kind, exceptPid)) return 0;
  const others = otherBids(league, exceptPid);
  const extra = bidHolds(league, exceptPid) + others.reduce((a, b) => a + (isException(b.route) ? b.amount : 0), 0);
  return exceptionRoom(league, league.userTid, kind, season, extra);
}

/** The user's mid-level room for an offer to `exceptPid` (see userExceptionRoom). */
export const userMleRoom = (league: League, season = contractSeason(league), exceptPid = -1) => userExceptionRoom(league, 'mle', season, exceptPid);

/**
 * How the user can pay free agent `p` this much, with his pending offers committed: cap space net
 * of what offers on space hold (and the market's holds: his restricted free agents' and his offer
 * sheets'), an exception no pending offer has (`years`, `via`: as signingRoute takes them), or the
 * minimum. Cap space isn't open while a pending offer needs the mid-level (using space would end
 * it), nor when it would take a pending bi-annual offer past the tax. Without pending offers this
 * is signingRoute.
 */
export function offerRoute(league: League, p: Player, amount: number, season = contractSeason(league), years?: number, via?: Exception): SigningRoute | null {
  const tid = league.userTid;
  const others = otherBids(league, p.pid);
  if (!others.length) return signingRoute(league, tid, amount, season, p, years, via);
  const cap = CAP_FOR(league, season);
  if (amount <= (p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return 'min';
  const market = userHeld(league, season);
  const taxPay = payroll(league, tid, season) + bidHolds(league, p.pid) + market.sheets;
  if (taxPay + market.rfa + amount <= cap.salaryCap)
    return others.some((b) => b.route === 'mle' || (b.route === 'bae' && taxPay + amount + b.amount > cap.luxuryTax)) ? null : 'space';
  for (const k of via ? [via, ...EXCEPTION_ORDER.filter((x) => x !== via)] : EXCEPTION_ORDER)
    if ((years === undefined || years <= EXCEPTIONS[k].years) && amount <= userExceptionRoom(league, k, season, p.pid)) return k;
  return null;
}

/**
 * The user signed someone for the minimum: his pending offers (on cap space or an exception) could
 * have come first, since a minimum deal fits over the cap and past the tax, so it doesn't count
 * against them. An exception signing does count: it is only legal over the cap, so had a pending
 * space offer come first it would have been made on what was left (the mid-level not at all).
 */
function slackForBids(league: League, route: SigningRoute | null, salary: number) {
  if (route !== 'min') return;
  for (const b of league.faBids ?? []) if (b.route === 'space' || isException(b.route)) b.slack = (b.slack ?? 0) + salary;
}

/** The least a top free agent will consider from the user for this many years: 90% of his asking price. */
export function bidFloor(league: League, p: Player, years: number): number {
  const ask = askingContract(league, p, league.userTid);
  const cap = CAP_FOR(league, contractSeason(league));
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  return Math.max(min, Math.ceil((ask.amount * (1 + Math.abs(years - ask.years) * 0.03) * BID_FLOOR) / 50) * 50);
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
 * How much a player likes an offer: the money against what he asks that team (to the power of
 * how much money matters to him) × the team's appeal (weighted by his priorities) × how close
 * the years are to what he wants (3% a year, as asking prices count it) × a small noise of his
 * own (±2%, a hash). An offer at a team's asking price scores its appeal.
 */
export function offerUtility(league: League, p: Player, tid: number, amount: number, years: number, prefs: PlayerPrefs = playerPrefs(league, p)): number {
  const ask = askingContract(league, p, tid);
  const fit = 1 / (1 + Math.abs(years - ask.years) * 0.03);
  const noise = 0.98 + 0.04 * (hashString(`${league.id}:${league.season}:${p.pid}:${tid}:offer`) / 4294967296);
  return Math.pow(amount / ask.amount, prefs.money) * teamAppeal(league, tid, p, prefs) * fit * noise;
}

/** Whether AI team `t` would go after him at all: aiSign's roster and value criteria, without its dice. */
function aiWants(league: League, t: Team, p: Player, season: number): boolean {
  const roster = regularRoster(league, t.tid);
  const full = roster.length >= CAP.rosterMax;
  const cut = swapCandidate(league, t.tid, season);
  if (full && !cut) return false;
  const size = full ? roster.length - 1 : roster.length;
  const v = valueScore(league, p);
  return !(cut && v < swapBar(league, cut)) && !(size >= 13 && v < 64);
}

/**
 * The market closes: a free agent worth 78+ still unsigned whose old team holds his Bird rights
 * goes back to it, as a holdout ends, on a deal of two years at most at his price now (within what
 * his rights allow), when it wants him and has the spot (see aiWants): past its budget even, since
 * nobody else could pay him and a team doesn't let a player that good walk for nothing.
 */
export function aiLateReturns(league: League) {
  if (league.phase !== 'freeAgency') return;
  const season = contractSeason(league);
  const left = freeAgents(league)
    .filter((p) => !p.rfa && !p.waivers && valueScore(league, p) >= 78)
    .sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid);
  for (const p of left) {
    const old = seasonTid(p, league.season);
    if (old === null || old === league.userTid || releasedBy(league, p, old) || !aiWants(league, league.teams[old], p, season)) continue;
    const ask = askingContract(league, p, old);
    signPlayer(league, p, old, Math.min(ask.amount, resignLimit(league, p, old)), Math.min(2, ask.years), { start: season, bird: true });
  }
}

/**
 * The AI teams that would bid for a top free agent now, most attractive offer first: each one
 * that wants him and can pay his asking price for it offers that, a contender up to 10% more if
 * its space (net of what the summer market holds, see capSpace) or its exception covers it. Every
 * offer is one the team can make: `route` pays for it as it stands.
 */
export function faInterest(league: League, p: Player): FaOffer[] {
  const season = contractSeason(league);
  const prefs = playerPrefs(league, p);
  const out: FaOffer[] = [];
  const bird = birdRoom(league, p, season);
  for (const t of league.teams) {
    if (t.tid === league.userTid || releasedBy(league, p, t.tid) || !aiWants(league, t, p, season)) continue;
    const ask = askingContract(league, p, t.tid);
    // his old team can still bring him back on his Bird rights, over the cap (see birdRoom)
    if (bird && t.tid === bird.tid && ask.amount <= bird.room) {
      out.push({ tid: t.tid, amount: ask.amount, years: ask.years, route: 'min', bird: true, utility: offerUtility(league, p, t.tid, ask.amount, ask.years, prefs) });
      continue;
    }
    const route = aiRoute(league, t.tid, ask.amount, season, p, ask.years);
    if (!route) continue;
    const years = route === 'min' ? ask.years : Math.min(routeYears(route), ask.years);
    let amount = ask.amount;
    let paid: SigningRoute = route;
    if (t.strategy === 'contend' && route !== 'min') {
      const room = route === 'space' ? capSpace(league, t.tid, season) : exceptionRoom(league, t.tid, route, season);
      const more = Math.max(ask.amount, Math.min(Math.round((ask.amount * 1.1) / 50) * 50, room, playerMax(league, p, season, t.tid)));
      // (and only as much more as a route the rules allow for that length still pays)
      const r = more > ask.amount ? signingRoute(league, t.tid, more, season, p, years) : route;
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
 * Where an offer from the user would stand against the AI teams bidding now: his utility for it,
 * whether it wins (with no rival bids, only at his asking price), and about what would lead the
 * field (null when even the max wouldn't).
 */
export function bidStanding(
  league: League,
  p: Player,
  amount: number,
  years: number,
  offers: FaOffer[] = faInterest(league, p),
): { offers: FaOffer[]; leads: boolean; toLead: number | null } {
  const tid = league.userTid;
  const prefs = playerPrefs(league, p);
  const best = offers[0];
  if (!best) {
    const ask = askingContract(league, p, tid);
    const atAsk = Math.ceil((ask.amount * (1 + Math.abs(years - ask.years) * 0.03)) / 50) * 50;
    return { offers, leads: willSign(league, p, tid, amount, years).ok, toLead: atAsk };
  }
  const mine = offerUtility(league, p, tid, amount, years, prefs);
  // the amount whose utility matches the best rival's (utility is a power of the amount)
  const need = Math.ceil((amount * Math.pow(best.utility / mine, 1 / prefs.money)) / 50) * 50;
  const max = CAP_FOR(league, contractSeason(league)).maxContract(p.experience);
  return { offers, leads: mine >= best.utility, toLead: need <= max ? need : null };
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
  if (!p || p.tid !== FREE_AGENT || p.waivers) return { ok: false, reason: 'Not a free agent.' };
  if (releasedBy(league, p, league.userTid)) return { ok: false, reason: RELEASED_REASON(p) };
  if (!marqueeFA(league, p)) return userOffer(league, pid, amount, years);
  if (years < 1 || years > FA_YEARS) return { ok: false, reason: FA_YEARS_REASON };
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years);
  if (closed) return { ok: false, reason: closed };
  const floor = bidFloor(league, p, years);
  if (amount < floor)
    return {
      ok: false,
      reason: `${playerName(p)} won't consider less than ${money(floor)} a season over ${years} year${years > 1 ? 's' : ''} (he's asking ${money(askingContract(league, p, league.userTid).amount)}).`,
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
  // (offer sheets we signed hold their roster spots)
  if (standardRoster(league, tid).length + pendingSheets(league, tid).length >= max) return { route: null, why: `our roster is full (${max})` };
  if (b.amount <= (p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return { route: 'min', why: '' };
  // minimum signings made while it was pending (its slack) could have come after it; our
  // restricted free agents' cap holds count against the cap, our offer sheets against the tax too
  const market = userHeld(league, season);
  const others = otherBids(league, b.pid);
  const taxPay = payroll(league, tid, season) - (b.slack ?? 0) + bidHolds(league, b.pid) + market.sheets;
  const pay = taxPay + market.rfa;
  if (pay + b.amount <= cap.salaryCap) return { route: 'space', why: '' };
  // the exception it was made on first, then the others that cover it (each other pending offer
  // keeps the one it leans on, and they all count against the tax line)
  const extra = bidHolds(league, b.pid) + others.reduce((a, x) => a + (isException(x.route) ? x.amount : 0), 0) - (b.slack ?? 0);
  const room = (k: Exception) => (bidOnException(league, k, b.pid) ? 0 : exceptionRoom(league, tid, k, season, extra));
  const order = isException(b.route) ? [b.route, ...EXCEPTION_ORDER.filter((k) => k !== b.route)] : EXCEPTION_ORDER;
  const fits = order.find((k) => b.amount <= room(k) && b.years <= EXCEPTIONS[k].years);
  if (fits) return { route: fits, why: '' };
  const space = Math.max(0, cap.salaryCap - pay);
  const best = order.map((k) => ({ k, room: room(k) })).sort((x, y) => y.room - x.room)[0];
  return {
    route: null,
    why: `we no longer have the cap space for it (${money(space)} left)${best.room > 0 ? ` and our ${EXCEPTIONS[best.k].name} only reaches ${money(best.room)}${b.years > EXCEPTIONS[best.k].years ? ` for ${EXCEPTIONS[best.k].years} years` : ''}` : ''}`,
  };
}

const yrs = (n: number) => `${n} yr${n > 1 ? 's' : ''}`;
const PREF_LABEL: Record<keyof PlayerPrefs, string> = { winning: 'winning', money: 'money', role: 'playing time', market: 'market size' };

/** He decides on the user's offer: the user's (if it still fits) against the AI teams' bids, best utility wins. */
function decideBid(league: League, b: FaBid) {
  const p = league.players[b.pid];
  if (!p || p.tid !== FREE_AGENT) return;
  const tid = league.userTid;
  const season = contractSeason(league);
  const name = playerName(p);
  const prefs = playerPrefs(league, p);
  const offers = faInterest(league, p);
  const best = offers[0];
  const { route, why } = bidRouteNow(league, b, p);
  const mine = route ? offerUtility(league, p, tid, b.amount, b.years, prefs) : -Infinity;
  if (route && (best ? mine >= best.utility : willSign(league, p, tid, b.amount, b.years).ok)) {
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
    const top = (Object.keys(PREF_LABEL) as (keyof PlayerPrefs)[]).sort((x, y) => prefs[y] - prefs[x])[0];
    const appealT = teamAppeal(league, t.tid, p, prefs);
    const appealU = teamAppeal(league, tid, p, prefs);
    const reasons = [best.amount > b.amount ? 'they paid more' : '', appealT > appealU + 0.02 ? 'he liked their situation better' : ''].filter(Boolean);
    addInbox(league, {
      from: 'Assistant GM',
      subject: `${name} signed with ${t.abbrev}`,
      body: `${route ? `${name} chose the ${t.region} ${t.name} over us` : `Our offer to ${name} fell through: ${why}. He signed with the ${t.region} ${t.name}`}. Their offer: ${yrs(years)} at ${money(best.amount)}. ${ours}${route && reasons.length ? ` ${reasons.join(', and ').replace(/^./, (c) => c.toUpperCase())}; ${PREF_LABEL[top]} matters most to him.` : ''}`,
      tone: 'bad',
      link: `/player/${p.pid}`,
    });
    return;
  }
  const ask = askingContract(league, p, tid);
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${name} turned us down`,
    body: route
      ? `No other team bid for ${name}, so he's holding out for his asking price (${yrs(ask.years)} at ${money(ask.amount)}) rather than take ours. ${ours} He's still on the market.`
      : `Our offer to ${name} fell through: ${why}. He's still on the market.`,
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

/**
 * How the user would like to sign a free agent beyond the money and years: an option on the final
 * season (a two-year deal or longer; not on an offer sheet or an extension), and the exception to
 * pay with when more than one covers it.
 */
export interface OfferExtras {
  option?: 'player' | 'team';
  via?: Exception;
}

/**
 * The user offers a free agent a contract. A restricted free agent gets an offer sheet (or, his
 * own, a re-signing), a top free agent in the summer weighs it against other teams' (userBid);
 * anyone else negotiates (see hearOffer): at or above his walk-away price he signs on the spot,
 * below it he counters and his patience drops.
 */
export function userOffer(league: League, pid: number, amount: number, years: number, extras: OfferExtras = {}): OfferResult {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  if (p.waivers) return { ok: false, reason: `${playerName(p)} is on waivers: put in a claim instead.` };
  if (releasedBy(league, p, league.userTid)) return { ok: false, reason: RELEASED_REASON(p) };
  // a restricted free agent: his own team re-signs him with Bird rights, anyone else signs an offer sheet
  if (p.rfa) return p.rfa.tid === league.userTid ? userResign(league, pid, amount, years, extras) : userOfferSheet(league, pid, amount, years, extras.via);
  // a top free agent in the summer weighs offers
  if (marqueeFA(league, p)) return userBid(league, pid, amount, years);
  const season = contractSeason(league);
  const tid = league.userTid;
  if (years < 1 || years > FA_YEARS) return { ok: false, reason: FA_YEARS_REASON };
  if (extras.option && years < 2) return { ok: false, reason: 'An option needs a deal of two years or more.' };
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years, extras.via);
  if (closed) return { ok: false, reason: closed };
  const route = offerRoute(league, p, amount, season, years, extras.via)!;
  const h = hearOffer(league, p, 'fa', { amount, years, option: extras.option }, { min: 1, max: routeYears(route) });
  if (!h.accept) return { ok: false, reason: h.text, counter: h.counter };
  spendRoute(league, tid, route, season);
  signPlayer(league, p, tid, amount, years, { start: season, option: extras.option });
  slackForBids(league, route, salaryFor(p, season));
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signed`,
    body: `${playerName(p)} agreed to ${years} year${years > 1 ? 's' : ''} at ${money(amount)} per season${extras.option ? `, with a ${extras.option} option on the last` : ''}${isException(route) ? `, using our ${EXCEPTIONS[route].name} for the season` : ''}. He has been added to the end of your rotation.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} accepts!` };
}

/**
 * The user signs another team's restricted free agent to an offer sheet (see rfa.ts): two to five
 * seasons, no options, negotiated on what he asks of the user (see hearOffer), paid for like any
 * signing with the user's other pending offers counted (offerBlockedReason). His team has until the
 * end of the next day to match; meanwhile the sheet holds the cap room (or the exception) and a
 * roster spot it needs.
 */
export function userOfferSheet(league: League, pid: number, amount: number, years: number, via?: Exception): OfferResult {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT || !p.rfa) return { ok: false, reason: 'Not a restricted free agent.' };
  if (p.rfa.tid === league.userTid) return { ok: false, reason: `${playerName(p)} is your restricted free agent: re-sign him instead.` };
  const closed = signingClosedReason(league) ?? sheetBlockedReason(league, p, years) ?? offerBlockedReason(league, p, amount, years, via);
  if (closed) return { ok: false, reason: closed };
  const route = offerRoute(league, p, amount, contractSeason(league), years, via)!;
  const h = hearOffer(league, p, 'fa', { amount, years }, { min: SHEET_MIN_YEARS, max: routeYears(route) });
  if (!h.accept) return { ok: false, reason: h.text, counter: h.counter };
  signOfferSheet(league, p, league.userTid, amount, years, route, league.faDay);
  const own = league.teams[p.rfa.tid];
  return { ok: true, reason: `Offer sheet signed: the ${own.name} have until the end of ${deadlineLabel(p.rfa.sheet!.until)} to match.` };
}

/**
 * Two-way offer: young players (3 seasons or fewer) who are minimum-level on the open market take
 * a two-way slot at the fixed two-way salary, outside the 15-man roster and the cap.
 */
export function userTwoWayOffer(league: League, pid: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  if (p.waivers) return { ok: false, reason: `${playerName(p)} is on waivers: put in a claim instead.` };
  if (p.rfa)
    return {
      ok: false,
      reason:
        p.rfa.tid === league.userTid
          ? `${playerName(p)} is your restricted free agent: re-sign him to a standard deal.`
          : `${playerName(p)} is a restricted free agent: only an offer sheet the ${league.teams[p.rfa.tid].name} can match signs him.`,
    };
  const closed = signingClosedReason(league);
  if (closed) return { ok: false, reason: closed };
  const tid = league.userTid;
  if (!twoWayEligible(p)) return { ok: false, reason: `${playerName(p)} has too much experience for a two-way deal (3 seasons max).` };
  if (twoWayRoster(league, tid).length >= TWO_WAY_MAX) return { ok: false, reason: `All ${TWO_WAY_MAX} two-way slots are taken.` };
  const season = contractSeason(league);
  if (!wantsTwoWay(league, p, tid)) return { ok: false, reason: `${playerName(p)} wants a standard contract (asking ${money(askingContract(league, p, tid).amount)}).` };
  const amount = twoWaySalary(league, season);
  const years = twoWayYears(p);
  signPlayer(league, p, tid, amount, years, { start: season, twoWay: true });
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signed (two-way)`,
    body: `${playerName(p)} signed a ${years}-year two-way deal at ${moneyExact(amount)}. He doesn't take a roster spot or count against the cap, and sits at the end of the bench unless we run short. If he earns it, he can be converted to a standard contract when a roster spot is open.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} signs a two-way deal!` };
}

/**
 * The user's new contracts this summer, re-signings and free agents (not draft picks' rookie deals,
 * nor a two-way deal converted to a standard one: that's the same contract).
 */
export const signedThisSummer = (league: League) =>
  teamPlayers(league, league.userTid).filter((p) => p.contract.start === league.season + 1 && !p.contract.rookie && !p.contract.converted);

/**
 * The user's roster as the offseason limit counts it while expiring deals are re-signed or let go:
 * his standard players signed for next season, and in free agency his pending offers and offer
 * sheets, each holding a spot (see summerRoster).
 */
export const resignRoster = (league: League) => summerRoster(league, league.userTid);

/**
 * The user re-signs one of his players with Bird rights (no cap limit): an expiring one in the
 * re-sign period, or his restricted free agent in free agency until he signs an offer sheet. A
 * negotiation like any other (see hearOffer), options included.
 */
export function userResign(league: League, pid: number, amount: number, years: number, extras: Pick<OfferExtras, 'option'> = {}): OfferResult {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  const rfa = !!p && p.tid === FREE_AGENT && p.rfa?.tid === league.userTid && league.phase === 'freeAgency';
  if (league.phase !== 'resign' && !rfa) return { ok: false, reason: 'Re-signing happens between the draft and free agency.' };
  if (!p || (p.tid !== league.userTid && !rfa)) return { ok: false, reason: 'Not on your team.' };
  if (rfa && p.rfa!.sheet) return { ok: false, reason: `${playerName(p)} has signed an offer sheet with the ${league.teams[p.rfa!.sheet.tid].name}: match it or let him go.` };
  if (contractExp(p.contract) > league.season) return { ok: false, reason: `${playerName(p)} is still under contract.` };
  // a new deal takes one of next season's 21 spots, like any other signing (pending offers and sheets hold theirs)
  if (resignRoster(league) >= OFFSEASON_ROSTER_MAX)
    return {
      ok: false,
      reason: `Your roster is full for next season (${OFFSEASON_ROSTER_MAX}${league.faBids?.length || pendingSheets(league, league.userTid).length ? ', counting your pending offers and offer sheets' : ''}). Release or trade someone first.`,
    };
  const most = maxYearsWith(league, p, league.userTid);
  if (years < 1 || years > most)
    return { ok: false, reason: most === 5 ? 'Contracts must be 1 to 5 years.' : `Without full Bird rights (three seasons with you) he re-signs for 4 years at most.` };
  if (extras.option && years < 2) return { ok: false, reason: 'An option needs a deal of two years or more.' };
  const limit = resignLimit(league, p, league.userTid);
  // a player worth more than his Bird rights allow goes to the market
  if (amount > limit || askingContract(league, p, league.userTid).amount > limit) return { ok: false, reason: resignLimitReason(league, p, limit) };
  const h = hearOffer(league, p, 'resign', { amount, years, option: extras.option }, { min: 1, max: most });
  if (!h.accept) return { ok: false, reason: h.text, counter: h.counter };
  signPlayer(league, p, league.userTid, amount, years, { start: league.season + 1, option: extras.option });
  return { ok: true, reason: `${playerName(p)} re-signs!` };
}
