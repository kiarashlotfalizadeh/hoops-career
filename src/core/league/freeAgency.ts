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
  standardRoster,
  teamPlayers,
  twoWayRoster,
} from './helpers';
import {
  FA_PRICE_CUT_DAYS,
  FIRED_REASON,
  MLE_PCT,
  MLE_YEARS,
  type Ask,
  type PlayerPrefs,
  type SigningRoute,
  askingContract,
  leaveTeam,
  marketSalary,
  mleRoom,
  playerPrefs,
  preferredYears,
  releaseDeadMoney,
  releasePlayer,
  signPlayer,
  signingRoute,
  teamAppeal,
  twoWayEligible,
  twoWaySalary,
  twoWayYears,
  valueScore,
  wantsTwoWay,
  willSign,
} from './contracts';

/** Free agency lasts FA_DAYS days: opening day is day 1 (faDay 0), so the market closes at faDay FA_DAYS - 1. */
export const FA_DAYS = 30;

export function expiringPlayers(league: League, tid: number): Player[] {
  return teamPlayers(league, tid).filter((p) => contractExp(p.contract) <= league.season);
}

/**
 * The expiring players an AI team would keep (if they agree, see `agrees`) and what each asks,
 * best first. Payroll budgets follow the strategy: contenders go a little past the tax, retooling
 * teams stop halfway between cap and tax, rebuilders near the cap. A player worth 82+ stretches
 * the budget to the tax (8% past it for a contender, or for anyone's franchise player at 86+).
 * Once 13 players are committed, only core players (the top 8) are kept.
 */
function resignPlan(league: League, t: Team, agrees: (p: Player) => boolean = () => true): { p: Player; ask: Ask }[] {
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  let pay = payroll(league, t.tid, next);
  let committed = standardRoster(league, t.tid).filter((x) => contractExp(x.contract) > league.season).length;
  const byValue = teamPlayers(league, t.tid).sort((a, b) => valueScore(league, b) - valueScore(league, a));
  const core = new Set(byValue.slice(0, 8).map((p) => p.pid));
  const plan: { p: Player; ask: Ask }[] = [];
  for (const p of byValue) {
    if (contractExp(p.contract) > league.season) continue;
    const v = valueScore(league, p);
    const ask = askingContract(league, p, t.tid);
    const budget =
      v >= 86 || (v >= 82 && t.strategy === 'contend')
        ? cap.luxuryTax * 1.08
        : t.strategy === 'contend'
          ? cap.luxuryTax * 1.02
          : v >= 82
            ? cap.luxuryTax
            : t.strategy === 'retool'
              ? (cap.salaryCap + cap.luxuryTax) / 2
              : cap.salaryCap * 1.05;
    const worth = v >= 70 || (v >= 66 && committed < 11);
    const needed = core.has(p.pid) || committed < 13;
    // coming off a rookie deal he is a restricted free agent: only a trade request gets him out
    const wants = !p.mood.tradeRequest && (p.mood.score > -5 || !!p.contract.rookie) && playerAge(p, next) <= 35;
    if (worth && needed && wants && pay + ask.amount < budget && agrees(p)) {
      plan.push({ p, ask });
      pay += ask.amount;
      committed++;
    }
  }
  return plan;
}

/** AI teams decide whether to keep their expiring players (start of free agency). A few test the market anyway, stars less often. */
export function aiResign(league: League, rng: Rng) {
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    const plan = resignPlan(league, t, (p) => rng.chance(valueScore(league, p) >= 82 ? 0.95 : 0.85));
    for (const { p, ask } of plan) signPlayer(league, p, t.tid, ask.amount, ask.years, { start: league.season + 1 });
  }
}

/**
 * Cap holds: between the end of the season and free agency, a team's own expiring players still
 * count against next season's cap at about their asking price, so that space isn't spent twice
 * (absorbed in a trade, then used again to re-sign them with Bird rights). AI teams hold the
 * players they'd re-sign; the user holds everyone who'd re-sign until he renounces them or free
 * agency opens.
 */
export function capHolds(league: League, tid: number): { p: Player; amount: number }[] {
  if (league.phase !== 'draftLottery' && league.phase !== 'draft' && league.phase !== 'resign') return [];
  if (tid !== league.userTid) return resignPlan(league, league.teams[tid]).map(({ p, ask }) => ({ p, amount: ask.amount }));
  return expiringPlayers(league, tid)
    .filter((p) => !p.contract.twoWay && !p.mood.tradeRequest)
    .map((p) => ({ p, amount: askingContract(league, p, tid).amount }));
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

/** Payroll for cap purposes: committed salary and dead money, plus cap holds for next season during the draft and re-signing window. */
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
  leaveTeam(league.teams[p.tid], pid);
  p.tid = FREE_AGENT;
  return { ok: true, reason: `${playerName(p)} is renounced: he becomes a free agent when the market opens.` };
}

/** Move all unsigned expiring players into the free agent pool. */
export function releaseExpiring(league: League) {
  for (const p of Object.values(league.players)) {
    if (p.tid >= 0 && contractExp(p.contract) <= league.season) {
      leaveTeam(league.teams[p.tid], p.pid);
      p.tid = FREE_AGENT;
    }
  }
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
  const roster = standardRoster(league, tid);
  if (roster.length < CAP.rosterMax) return undefined;
  const byBar = (xs: Player[]) => xs.sort((a, b) => swapBar(league, a) - swapBar(league, b));
  if (season > league.season) return roster.length < OFFSEASON_ROSTER_MAX ? byBar(roster)[roster.length - CAP.rosterMax] : undefined;
  const limit = CAP_FOR(league, season).vetMin * 2.2;
  return byBar(roster.filter((x) => deadIfCut(league, x) <= limit))[0];
}

/**
 * One AI team's shot at the market: the best fit it can pay (cap space, the mid-level exception
 * or the minimum). A full roster only adds a clearly better player than the one he'd displace.
 */
function aiSign(league: League, t: Team, rng: Rng, season: number) {
  const roster = standardRoster(league, t.tid);
  const full = roster.length >= CAP.rosterMax;
  const cut = swapCandidate(league, t.tid, season);
  if (full && !cut) return;
  const size = full ? roster.length - 1 : roster.length;
  const floor = cut ? swapBar(league, cut) : -Infinity;
  let pick: Player | undefined;
  let bs = -Infinity;
  // a top free agent weighing the user's offer waits for his decision day (see resolveBids)
  const weighing = new Set(league.faBids?.map((b) => b.pid));
  for (const p of freeAgents(league)) {
    if (weighing.has(p.pid)) continue;
    const v = valueScore(league, p);
    if (v < floor || (size >= 13 && v < 64)) continue;
    if (!signingRoute(league, t.tid, askingContract(league, p, t.tid).amount, season, p)) continue;
    const s = needScore(league, t.tid, p) + rng.normal(0, 1.5);
    if (s > bs) {
      bs = s;
      pick = p;
    }
  }
  if (!pick) return;
  const ask = askingContract(league, pick, t.tid);
  // stars sometimes wait for a better offer early in the summer
  const patience = season > league.season && league.faDay < 10 && valueScore(league, pick) >= 78 ? 0.45 : 0.9;
  if (!rng.chance(patience)) return;
  const route = signingRoute(league, t.tid, ask.amount, season, pick);
  if (route === 'mle') t.mleSeason = season;
  // (summer signings just join camp: opening-night cuts trim the roster back to 15)
  if (cut && season === league.season) releasePlayer(league, cut, { news: false });
  // minimum deals are short: a season, two for a young player
  const years = route === 'min' ? (playerAge(pick, season) <= 25 ? 2 : 1) : route === 'mle' ? Math.min(MLE_YEARS, ask.years) : ask.years;
  signPlayer(league, pick, t.tid, ask.amount, years, { start: season });
}

/**
 * One day of free agency: AI teams make offers, players accept the best fit, open two-way slots
 * go to young minimum-level players, and unsigned players cut their price every 5 days: by 15%, or
 * down to the most an AI team that would take him could still pay (cap space or mid-level, at his
 * interest in that team), on deals of 3 years at most. In season this runs once a week, so every
 * call is a price cut.
 */
export function faDay(league: League, rng: Rng, intensity = 1) {
  // top free agents whose decision day this is choose between the user's offer and AI teams' first
  if (league.phase === 'freeAgency') resolveBids(league, league.faDay + 1);
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const offseason = season > league.season;
  const ai = rng.shuffle(league.teams.filter((t) => t.tid !== league.userTid));
  // price cuts come first, so AI teams get the first look at a new price. Buyers are the teams with
  // a roster spot, or a player he'd clearly beat for one, and money beyond the minimum.
  const buyers = ai.flatMap((t) => {
    const cut = swapCandidate(league, t.tid, season);
    if (standardRoster(league, t.tid).length >= CAP.rosterMax && !cut) return [];
    const room = Math.max(cap.salaryCap - payroll(league, t.tid, season), mleRoom(league, t.tid, season));
    return room > 0 ? [{ t, room, bar: cut ? swapBar(league, cut) : -Infinity }] : [];
  });
  // what a player is asking a team is his price over his interest in it (see askingContract)
  const roomFor = (p: Player) => Math.max(0, ...buyers.filter((b) => valueScore(league, p) >= b.bar).map((b) => b.room * teamAppeal(league, b.t.tid, p)));
  for (const p of freeAgents(league)) {
    if (p.faDays === undefined) continue;
    // (saves from before the 5-day clock can still be counting down from 30)
    p.faDays = Math.min(p.faDays, FA_PRICE_CUT_DAYS) - (offseason ? 1 : FA_PRICE_CUT_DAYS);
    if (p.faDays > 0) continue;
    const ask = Math.min(p.asking?.amount ?? Infinity, marketSalary(league, p));
    const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
    p.asking = { amount: Math.max(min, Math.round(Math.min(ask * 0.85, roomFor(p)) / 10) * 10), years: Math.min(3, p.asking?.years ?? preferredYears(league, p)) };
    p.faDays = FA_PRICE_CUT_DAYS;
  }
  for (const t of ai) {
    if (freeAgents(league).length && rng.chance(0.55 * intensity)) aiSign(league, t, rng, season);
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

/** Make sure every AI team can field a legal roster (13+) with minimum signings. */
export function fillRosters(league: League, rng: Rng, season = league.season) {
  const cap = CAP_FOR(league, season);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    let size = standardRoster(league, t.tid).length;
    while (size < CAP.rosterMin) {
      const pool = freeAgents(league).sort((a, b) => valueScore(league, b) - valueScore(league, a));
      const p = pool[Math.min(pool.length - 1, Math.floor(rng.uniform(0, 4)))];
      if (!p) break;
      signPlayer(league, p, t.tid, p.experience >= 3 ? cap.vetMin : cap.minContract, 1, { news: false, start: season });
      size++;
    }
  }
}

/**
 * Trim AI rosters to 15 standard players and 3 two-ways (two-ways never cost a standard spot).
 * Cuts go mainly by value; a release that leaves dead money counts a little against cutting him
 * (0.3 points per $1M), so camp deals go first among near equals and a big contract survives
 * unless he is clearly the worst player.
 */
export function trimRosters(league: League, release: (p: Player) => void, standardMax: number = CAP.rosterMax) {
  const keep = (p: Player) => valueScore(league, p) + (0.3 * releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0)) / 1000;
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

/** Why the user can't offer free agent `p` this much at all (roster or cap, his pending offers counted), or null. Asking price aside. */
export function offerBlockedReason(league: League, p: Player, amount: number, years: number): string | null {
  const tid = league.userTid;
  const season = contractSeason(league);
  const max = rosterMaxNow(league);
  const pending = otherBids(league, p.pid).length;
  if (standardRoster(league, tid).length + pending >= max)
    return pending
      ? `Your roster is full (${max}) counting your ${pending} pending offer${pending > 1 ? 's' : ''}. Release or trade someone, or withdraw an offer.`
      : `Your roster is full (${max}). Release or trade someone first.`;
  const route = offerRoute(league, p, amount, season);
  if (route === 'mle' && years > MLE_YEARS) return `Mid-level exception deals run ${MLE_YEARS} years at most.`;
  if (route) return null;
  const cap = CAP_FOR(league, season);
  const held = bidHolds(league, p.pid);
  const pay = payroll(league, tid, season) + held;
  const space = Math.max(0, cap.salaryCap - pay);
  // a space signing that fits, but would take a pending mid-level offer past the tax line
  const mleBid = otherBids(league, p.pid).find((b) => b.route === 'mle');
  if (mleBid && pay + amount <= cap.salaryCap)
    return `That would take your pending mid-level offer to ${playerName(league.players[mleBid.pid])} past the tax line. Withdraw it first, or offer less.`;
  const mle = userMleRoom(league, season, p.pid);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  return `${space >= 50 ? `Not enough cap space ($${(space / 1000).toFixed(1)}M)` : 'No cap space'}${held > 0 ? ' after your pending offers' : ''}. Over the cap you can offer his minimum ($${(min / 1000).toFixed(2)}M)${mle > 0 ? ` or up to $${(mle / 1000).toFixed(1)}M with your mid-level exception` : ''}.`;
}

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
  if (league.phase !== 'freeAgency' || p.tid !== FREE_AGENT || p.waivers) return false;
  return valueScore(league, p) >= 78 || askingContract(league, p).amount >= CAP_FOR(league, contractSeason(league)).salaryCap * MARQUEE_ASK;
}

export const pendingBid = (league: League, pid: number): FaBid | undefined => league.faBids?.find((b) => b.pid === pid);
const otherBids = (league: League, pid: number) => (league.faBids ?? []).filter((b) => b.pid !== pid);

/** Cap room the user's pending offers on cap space hold (all but `exceptPid`'s): they come before any exception. */
export function bidHolds(league: League, exceptPid = -1): number {
  return otherBids(league, exceptPid).reduce((a, b) => a + (b.route === 'space' ? b.amount : 0), 0);
}

/** The user's mid-level room for an offer to `exceptPid`: none while another pending offer leans on it. */
export function userMleRoom(league: League, season = contractSeason(league), exceptPid = -1): number {
  const tid = league.userTid;
  if (league.teams[tid].mleSeason === season || otherBids(league, exceptPid).some((b) => b.route === 'mle')) return 0;
  const cap = CAP_FOR(league, season);
  return Math.max(0, Math.min(Math.round((cap.salaryCap * MLE_PCT) / 10) * 10, cap.luxuryTax - payroll(league, tid, season) - bidHolds(league, exceptPid)));
}

/**
 * How the user can pay free agent `p` this much, with his pending offers committed: cap space
 * net of what offers on space hold, the mid-level unless an offer has it, or the minimum. Without
 * pending offers this is signingRoute.
 */
export function offerRoute(league: League, p: Player, amount: number, season = contractSeason(league)): SigningRoute | null {
  const tid = league.userTid;
  if (!otherBids(league, p.pid).length) return signingRoute(league, tid, amount, season, p);
  const cap = CAP_FOR(league, season);
  if (amount <= (p.experience < 3 ? cap.minContract : cap.vetMin) + 1) return 'min';
  const pay = payroll(league, tid, season) + bidHolds(league, p.pid);
  const mleBid = otherBids(league, p.pid).find((b) => b.route === 'mle');
  // a pending mid-level offer has to stay under the tax with this one signed first
  if (pay + amount <= cap.salaryCap) return !mleBid || pay + amount + mleBid.amount <= cap.luxuryTax ? 'space' : null;
  return amount <= userMleRoom(league, season, p.pid) ? 'mle' : null;
}

/** The user signed someone over the cap (minimum or mid-level): his pending offers on space (and, for a minimum, the mid-level) could have come first, so it doesn't count against them. */
function slackForBids(league: League, route: SigningRoute | null, salary: number) {
  if (route === 'space' || !route) return;
  for (const b of league.faBids ?? []) if (b.route === 'space' || (route === 'min' && b.route === 'mle')) b.slack = (b.slack ?? 0) + salary;
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
  /** How much he likes it: see offerUtility. */
  utility: number;
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
  const roster = standardRoster(league, t.tid);
  const full = roster.length >= CAP.rosterMax;
  const cut = swapCandidate(league, t.tid, season);
  if (full && !cut) return false;
  const size = full ? roster.length - 1 : roster.length;
  const v = valueScore(league, p);
  return !(cut && v < swapBar(league, cut)) && !(size >= 13 && v < 64);
}

/**
 * The AI teams that would bid for a top free agent now, most attractive offer first: each one
 * that wants him and can pay his asking price for it offers that, a contender up to 5% more if
 * its space or mid-level covers it.
 */
export function faInterest(league: League, p: Player): FaOffer[] {
  const season = contractSeason(league);
  const cap = CAP_FOR(league, season);
  const prefs = playerPrefs(league, p);
  const out: FaOffer[] = [];
  for (const t of league.teams) {
    if (t.tid === league.userTid || !aiWants(league, t, p, season)) continue;
    const ask = askingContract(league, p, t.tid);
    const route = signingRoute(league, t.tid, ask.amount, season, p);
    if (!route) continue;
    let amount = ask.amount;
    if (t.strategy === 'contend' && route !== 'min') {
      const room = route === 'space' ? cap.salaryCap - payroll(league, t.tid, season) : mleRoom(league, t.tid, season);
      amount = Math.max(ask.amount, Math.min(Math.round((ask.amount * 1.05) / 50) * 50, room, cap.maxContract(p.experience)));
    }
    const years = route === 'mle' ? Math.min(MLE_YEARS, ask.years) : ask.years;
    out.push({ tid: t.tid, amount, years, utility: offerUtility(league, p, t.tid, amount, years, prefs) });
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
  if (!marqueeFA(league, p)) return userOffer(league, pid, amount, years);
  if (years < 1 || years > 5) return { ok: false, reason: 'Contracts must be 1 to 5 years.' };
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years);
  if (closed) return { ok: false, reason: closed };
  const floor = bidFloor(league, p, years);
  if (amount < floor)
    return {
      ok: false,
      reason: `${playerName(p)} won't consider less than $${(floor / 1000).toFixed(1)}M a season over ${years} year${years > 1 ? 's' : ''} (he's asking $${(askingContract(league, p, league.userTid).amount / 1000).toFixed(1)}M).`,
    };
  const route = offerRoute(league, p, amount)!;
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
  // over-the-cap signings made while it was pending (its slack) could have come after it
  const pay = payroll(league, tid, season) - (b.slack ?? 0) + bidHolds(league, b.pid);
  if (pay + b.amount <= cap.salaryCap) return { route: 'space', why: '' };
  const room =
    league.teams[tid].mleSeason === season || otherBids(league, b.pid).some((x) => x.route === 'mle')
      ? 0
      : Math.min(Math.round((cap.salaryCap * MLE_PCT) / 10) * 10, cap.luxuryTax - pay);
  if (b.amount <= room && b.years <= MLE_YEARS) return { route: 'mle', why: '' };
  const space = Math.max(0, cap.salaryCap - pay);
  return {
    route: null,
    why: `we no longer have the cap space for it ($${(space / 1000).toFixed(1)}M left)${room > 0 ? ` and the mid-level only reaches $${(room / 1000).toFixed(1)}M` : ''}`,
  };
}

const yrs = (n: number) => `${n} yr${n > 1 ? 's' : ''}`;
const money = (k: number) => `$${(k / 1000).toFixed(1)}M`;
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
    if (route === 'mle') league.teams[tid].mleSeason = season;
    signPlayer(league, p, tid, b.amount, b.years, { start: season });
    slackForBids(league, route, salaryFor(p, season));
    const rivals = offers.map((o) => league.teams[o.tid].abbrev);
    addInbox(league, {
      from: 'Assistant GM',
      subject: `${name} chose us`,
      body: `${name} ${rivals.length ? `chose us over ${andList(rivals.slice(0, 4))}${rivals.length > 4 ? ` and ${rivals.length - 4} more` : ''}` : 'accepted our offer'}: ${yrs(b.years)} at ${money(b.amount)} per season${route === 'mle' ? ', using our mid-level exception for the season' : ''}. He has been added to the end of your rotation.`,
      tone: 'good',
      link: `/player/${p.pid}`,
    });
    return;
  }
  const ours = `Our offer: ${yrs(b.years)} at ${money(b.amount)}.`;
  if (best) {
    const t = league.teams[best.tid];
    const aiRoute = signingRoute(league, t.tid, best.amount, season, p);
    if (aiRoute === 'mle') t.mleSeason = season;
    const years = aiRoute === 'mle' ? Math.min(MLE_YEARS, best.years) : best.years;
    signPlayer(league, p, t.tid, best.amount, years, { start: season });
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
    link: '/free-agents',
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

export function userOffer(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  if (p.waivers) return { ok: false, reason: `${playerName(p)} is on waivers: put in a claim instead.` };
  // a top free agent in the summer weighs offers
  if (marqueeFA(league, p)) return userBid(league, pid, amount, years);
  const season = contractSeason(league);
  const tid = league.userTid;
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years);
  if (closed) return { ok: false, reason: closed };
  const res = willSign(league, p, tid, amount, years);
  if (!res.ok) return res;
  const route = offerRoute(league, p, amount, season);
  const mle = route === 'mle';
  if (mle) league.teams[tid].mleSeason = season;
  signPlayer(league, p, tid, amount, years, { start: season });
  slackForBids(league, route, salaryFor(p, season));
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signed`,
    body: `${playerName(p)} agreed to ${years} year${years > 1 ? 's' : ''} at $${(amount / 1000).toFixed(1)}M per season${mle ? ', using our mid-level exception for the season' : ''}. He has been added to the end of your rotation.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} accepts!` };
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
  const closed = signingClosedReason(league);
  if (closed) return { ok: false, reason: closed };
  const tid = league.userTid;
  if (!twoWayEligible(p)) return { ok: false, reason: `${playerName(p)} has too much experience for a two-way deal (3 seasons max).` };
  if (twoWayRoster(league, tid).length >= TWO_WAY_MAX) return { ok: false, reason: `All ${TWO_WAY_MAX} two-way slots are taken.` };
  const season = contractSeason(league);
  if (!wantsTwoWay(league, p, tid))
    return { ok: false, reason: `${playerName(p)} wants a standard contract (asking $${(askingContract(league, p, tid).amount / 1000).toFixed(1)}M).` };
  const amount = twoWaySalary(league, season);
  const years = twoWayYears(p);
  signPlayer(league, p, tid, amount, years, { start: season, twoWay: true });
  addInbox(league, {
    from: 'Assistant GM',
    subject: `${playerName(p)} signed (two-way)`,
    body: `${playerName(p)} signed a ${years}-year two-way deal at $${(amount / 1000).toFixed(2)}M. He doesn't take a roster spot or count against the cap, and sits at the end of the bench unless we run short. If he earns it, he can be converted to a standard contract when a roster spot is open.`,
    tone: 'good',
    link: `/player/${p.pid}`,
  });
  return { ok: true, reason: `${playerName(p)} signs a two-way deal!` };
}

/** The user's standard players signed for next season: what the offseason limit counts while expiring deals are re-signed or let go. */
export const resignRoster = (league: League) => standardRoster(league, league.userTid).filter((p) => contractExp(p.contract) > league.season).length;

export function userResign(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (league.phase !== 'resign') return { ok: false, reason: 'Re-signing happens between the draft and free agency.' };
  if (!p || p.tid !== league.userTid) return { ok: false, reason: 'Not on your team.' };
  if (contractExp(p.contract) > league.season) return { ok: false, reason: `${playerName(p)} is still under contract.` };
  // a new deal takes one of next season's 21 spots, like any other signing
  if (resignRoster(league) >= OFFSEASON_ROSTER_MAX) return { ok: false, reason: `Your roster is full for next season (${OFFSEASON_ROSTER_MAX}). Release or trade someone first.` };
  const res = willSign(league, p, league.userTid, amount, years);
  if (!res.ok) return res;
  signPlayer(league, p, league.userTid, amount, years, { start: league.season + 1 });
  return { ok: true, reason: `${playerName(p)} re-signs!` };
}
