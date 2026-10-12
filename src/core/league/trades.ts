// Trades: validation (roster size, 125% salary matching when over the cap, cap holds, the Stepien
// rule), AI valuation with team strategy and difficulty, a "what would make this work?" helper,
// AI-to-AI deals and occasional AI-initiated offers.

import type { DraftPick, League, Player } from '../types';
import { CAP, seasonLabel } from '../constants';
import { Rng, clamp } from '../random';
import { contractExp, salaryFor } from '../playerGen';
import {
  CAP_FOR,
  TWO_WAY_MAX,
  contractSeason,
  addInbox,
  addNews,
  curTeamSeason,
  dateToDay,
  fmtDate,
  inSeason,
  playerName,
  prospects,
  rosterMaxNow,
  standardRoster,
  teamPlayers,
  twoWayRoster,
  winPct,
} from './helpers';
import { type Strategy, leaveTeam, marketSalary, pendingOption, rookieContract, salaryForScore, tradeValue, valueScore } from './contracts';
import { capPayroll, withHoldsMemo } from './freeAgency';

export interface TradeSide {
  tid: number;
  pids: number[];
  dpids: number[];
}

export interface TradeOffer {
  a: TradeSide; // usually the user
  b: TradeSide; // counterparty
}

export interface TradeEval {
  ok: boolean;
  errors: string[];
  /** Value the AI side (b) receives minus what it gives, after its biases. */
  delta: number;
  valueIn: number;
  valueOut: number;
  accept: boolean;
  message: string;
}

const findPick = (league: League, dpid: number) => league.draftPicks.find((d) => d.dpid === dpid);

// ---------------------------------------------------------------- draft pick value

/** Expected score of the player taken at overall slot `k` (1-60) of a class nobody has seen yet. */
const futureSlotScore = (k: number) => 85 - 2.2 * Math.log(k) - 0.25 * (k - 1);

const classCache = new WeakMap<League, { key: string; prospects: { v: number; market: number }[] }>();

/** This season's prospects still on the board, best first: their trade value and market salary. */
function classProspects(league: League): { v: number; market: number }[] {
  const key = `${league.season}:${league.phase}:${league.day}:${league.draftPicks.length}`;
  const hit = classCache.get(league);
  if (hit?.key === key) return hit.prospects;
  const list = prospects(league, league.season)
    .map((p) => ({ v: Math.exp((valueScore(league, p) - 60) / 6), market: marketSalary(league, p) }))
    .sort((a, b) => b.v - a.v);
  classCache.set(league, { key, prospects: list });
  return list;
}

/**
 * Trade value of a draft pick: what the player taken there would be worth once drafted, his
 * rookie-scale surplus included (the prospect ranked at its slot in this season's class, in later
 * classes the player a slot usually brings), discounted by the time to its draft: up to 15% over
 * the last year (who will be there, and how he turns out) and 7% for each year before that. So a
 * pick keeps its value from one season into the next, and on the clock is worth the player it
 * becomes. Unknown slots are projected from the original team's record (regressed toward the
 * middle for later years) and averaged over a spread of outcomes. A top-N protected pick held by
 * another team is worth nothing in the slots where it would stay home.
 */
export function pickValue(league: League, dp: DraftPick): number {
  const yearsOut = dp.season - league.season;
  const cls = yearsOut === 0 ? classProspects(league) : [];
  const years = Math.max(0, yearsOut + (dateToDay(league.season, 5, 25) - league.day) / 365);
  const discount = years <= 1 ? 1 - 0.15 * years : 0.85 * Math.pow(0.93, years - 1);
  const valueAt = (inRound: number, known: boolean) => {
    const overall = (dp.round - 1) * 30 + inRound;
    // during the draft the next pick gets the best prospect left
    const idx = known ? league.draftPicks.filter((d) => d.season === dp.season && d.pick !== undefined && (d.round - 1) * 30 + d.pick < overall).length : overall - 1;
    const p = cls[idx] ?? { v: Math.exp((futureSlotScore(overall) - 60) / 6), market: salaryForScore(league, futureSlotScore(overall), 0) };
    const rookie = rookieContract(league, inRound, dp.round, league.season + 1);
    const surplus = rookie.salaries.reduce((a, sal) => a + (p.market - sal) / 1000, 0);
    return Math.max(0, p.v + surplus * 0.1) * discount;
  };
  const prot = dp.protection && dp.tid !== dp.originalTid ? dp.protection : 0;
  if (dp.pick !== undefined) return dp.pick <= prot ? 0 : valueAt(dp.pick, true);
  const orig = league.teams[dp.originalTid];
  const ts = curTeamSeason(league, orig.tid);
  const games = ts.won + ts.lost;
  const prev = orig.seasons.find((s) => s.season === league.season - 1);
  const wp = games >= 15 ? winPct(ts) : prev ? winPct(prev) * 0.6 + 0.2 : 0.5;
  // projected slot in the round (worst record = 1), regressing toward the middle for future years
  const keep = Math.pow(0.75, Math.max(0, yearsOut));
  const center = (1 + clamp(wp, 0, 1) * 29) * keep + 15.5 * (1 - keep);
  const sd = yearsOut <= 0 ? 2 + 6 * (1 - Math.min(1, games / 82)) : 5 + 2 * yearsOut;
  let total = 0;
  let weight = 0;
  for (let k = 1; k <= 30; k++) {
    const w = Math.exp(-((k - center) ** 2) / (2 * sd * sd));
    weight += w;
    if (k > prot) total += w * valueAt(k, false);
  }
  return total / weight;
}

// ---------------------------------------------------------------- AI valuation

/** How each strategy weighs draft picks against their neutral value. */
export const PICK_LENS: Record<Strategy, number> = { contend: 0.7, retool: 1, rebuild: 1.35 };

/**
 * A team's view of an asset it would receive (`incoming`) or send: its strategy's lens, kept
 * within 15% of the league-neutral value, so contenders don't overpay for veterans. Dealing with
 * the user, an AI team never lets its own assets go below neutral: the lens only adds a premium
 * for what it receives (a rebuilder's veteran bought cheap and sold to a contender, or picks the
 * other way, paid up to 1.8x a round trip). Among themselves AI teams sell down to 85%, which is
 * what gets their deals done. An asset that changed hands this season is worth its neutral value
 * to everyone, so it can't be flipped at a second team's premium.
 */
function lens(own: number, neutral: number, incoming: boolean, aiDeal: boolean) {
  return incoming ? Math.min(own, neutral * 1.15) : Math.max(own, neutral * (aiDeal ? 0.85 : 1));
}

const flipped = (league: League, a: Player | DraftPick) => a.tradedFrom?.season === league.season;

/** Did team `tid` trade this player or pick away this season? Then it can't take him (or it) back until next season. */
function tradedAwayBy(league: League, a: Player | DraftPick, tid: number): boolean {
  const t = a.tradedFrom;
  return t?.season === league.season && (t.tid === tid || !!t.also?.includes(tid));
}

/** `tid` trades it away now: remembered along with the teams that already traded it away this season. */
function tradedAway(league: League, a: Player | DraftPick, tid: number): NonNullable<Player['tradedFrom']> {
  const t = a.tradedFrom;
  const also = t?.season === league.season ? [t.tid, ...(t.also ?? [])].filter((x) => x !== tid) : [];
  return also.length ? { tid, season: league.season, also } : { tid, season: league.season };
}

/** What team `tid` thinks a player is worth in a deal (with the user unless `aiDeal`). */
export function playerValueFor(league: League, p: Player, tid: number, incoming: boolean, aiDeal = false): number {
  const neutral = tradeValue(league, p, 'retool');
  return flipped(league, p) ? neutral : lens(tradeValue(league, p, league.teams[tid].strategy), neutral, incoming, aiDeal);
}

/** What team `tid` thinks a draft pick is worth in a deal (with the user unless `aiDeal`). */
export function pickValueFor(league: League, dp: DraftPick, tid: number, incoming: boolean, aiDeal = false): number {
  const neutral = pickValue(league, dp);
  return flipped(league, dp) ? neutral : lens(neutral * PICK_LENS[league.teams[tid].strategy], neutral, incoming, aiDeal);
}

/** Each extra player in the bigger half of a deal counts for less: depth is worth less than talent. */
const DEPTH = [1, 0.7, 0.5, 0.35, 0.25];
/** A pile of incoming picks is worth less than the sum of its parts. */
const PICK_DEPTH = [1, 0.8, 0.65, 0.5, 0.4];

function weighted(values: number[], weights: number[] | null): number {
  return [...values].sort((a, b) => b - a).reduce((a, v, i) => a + (weights && v > 0 ? v * weights[Math.min(i, weights.length - 1)] : v), 0);
}

/** AI teams never send out more than this many first-round picks in one deal. */
export const MAX_FIRSTS_OUT = 2;

/** Trade value per $1M of luxury tax a deal adds (or saves) and of cap room it uses up (or frees). */
const TAX_VALUE = 0.1;
const ROOM_VALUE = 0.04;

/** Salary that counts in trades: two-way pay sits outside the cap, so it neither counts nor matches. */
export function capSalary(league: League, pid: number, s = contractSeason(league)): number {
  const p = league.players[pid];
  return !p || p.contract.twoWay ? 0 : salaryFor(p, s);
}

const sideSalary = (league: League, side: TradeSide) => side.pids.reduce((a, pid) => a + capSalary(league, pid), 0);

function moneyCost(league: League, tid: number, inSal: number, outSal: number): number {
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  const before = capPayroll(league, tid, s);
  const after = before + inSal - outSal;
  const tax = (x: number) => Math.max(0, x - cap.luxuryTax) * CAP.taxRate;
  const room = (x: number) => Math.max(0, cap.salaryCap - x);
  return ((tax(after) - tax(before)) * TAX_VALUE + (room(before) - room(after)) * ROOM_VALUE) / 1000;
}

/** In the offseason a roster can run to 21 but only 15 make opening night: the value of the extra players a team would have to waive. */
function cutCost(league: League, tid: number, out: number[], inc: number[]): number {
  if (inSeason(league)) return 0;
  const before = tradeRoster(league, tid);
  const after = [...before.filter((p) => !out.includes(p.pid)), ...inc.map((pid) => league.players[pid]).filter((p) => !p.contract.twoWay)];
  if (after.length <= CAP.rosterMax) return 0;
  const strategy = league.teams[tid].strategy;
  const waived = (roster: Player[]) =>
    roster
      .map((p) => Math.max(0, tradeValue(league, p, strategy)))
      .sort((a, b) => a - b)
      .slice(0, Math.max(0, roster.length - CAP.rosterMax))
      .reduce((a, v) => a + v, 0);
  return Math.max(0, waived(after) - waived(before));
}

interface Verdict {
  delta: number;
  valueIn: number;
  valueOut: number;
  accept: boolean;
  tooManyFirsts: boolean;
}

/**
 * One team's verdict on a deal: what it receives (net of the luxury tax and cap room it takes on
 * and the players it would have to waive) against what it sends. `generosity` below 1 accepts a
 * little less than fair value (casual difficulty), above 1 wants a premium.
 */
function judge(league: League, offer: TradeOffer, tid: number, generosity = 1): Verdict {
  const mine = offer.a.tid === tid ? offer.a : offer.b;
  const other = mine === offer.a ? offer.b : offer.a;
  const aiDeal = offer.a.tid !== league.userTid && offer.b.tid !== league.userTid;
  const players = (side: TradeSide, incoming: boolean, depth: boolean) =>
    weighted(
      side.pids.map((pid) => playerValueFor(league, league.players[pid], tid, incoming, aiDeal)),
      depth ? DEPTH : null,
    );
  const picks = (side: TradeSide, incoming: boolean) =>
    weighted(
      side.dpids.flatMap((d) => {
        const dp = findPick(league, d);
        return dp ? [pickValueFor(league, dp, tid, incoming, aiDeal)] : [];
      }),
      incoming ? PICK_DEPTH : null,
    );
  const costs = moneyCost(league, tid, sideSalary(league, other), sideSalary(league, mine)) + cutCost(league, tid, mine.pids, other.pids);
  const valueIn = players(other, true, other.pids.length > mine.pids.length) + picks(other, true) - costs;
  const valueOut = players(mine, false, mine.pids.length > other.pids.length) + picks(mine, false);
  let slack = (generosity - 1) * Math.abs(valueOut);
  if (generosity < 1) {
    // a casual GM's discount covers the other side's own assets, not ones it just traded for:
    // passed along from team to team, it compounded 12% a trade (an 84 became a 93 in three hops)
    const assets = [
      ...other.pids.map((pid) => ({ a: league.players[pid], v: Math.max(0, playerValueFor(league, league.players[pid], tid, true)) })),
      ...other.dpids.flatMap((d) => {
        const dp = findPick(league, d);
        return dp ? [{ a: dp, v: pickValueFor(league, dp, tid, true) }] : [];
      }),
    ];
    const total = assets.reduce((s, x) => s + x.v, 0);
    if (total > 0) slack *= assets.reduce((s, x) => s + (flipped(league, x.a) ? 0 : x.v), 0) / total;
  }
  const delta = valueIn - valueOut - slack;
  const tooManyFirsts = mine.dpids.filter((d) => findPick(league, d)?.round === 1).length > MAX_FIRSTS_OUT;
  return { delta, valueIn, valueOut, accept: delta >= 0 && !tooManyFirsts, tooManyFirsts };
}

/** Would this team sign off on the deal (rules aside)? AI-to-AI deals need both teams' yes. */
export function teamAccepts(league: League, offer: TradeOffer, tid: number): boolean {
  return judge(league, offer, tid).accept;
}

// ---------------------------------------------------------------- rules

/**
 * Why a player can't be moved right now, or null. After the season, a contract that ends before
 * next season is only a set of Bird rights: he can be re-signed or let go, not traded (otherwise
 * expiring deals are free value one way or the other). The same goes for a player option until he
 * decides after the draft: a star about to opt out would otherwise sell at full value. And a
 * signing waits until December 15 or three months (see signPlayer), as in the NBA.
 */
export function untradeable(league: League, p: Player): { kind: 'expiring' | 'option' | 'signed'; why: string } | null {
  const cs = contractSeason(league);
  if (cs > league.season && p.tid >= 0 && contractExp(p.contract) < cs)
    return { kind: 'expiring', why: `${playerName(p)}'s contract is up: he can be re-signed or let go, not traded.` };
  if (cs > league.season && pendingOption(league, p) === 'player')
    return { kind: 'option', why: `${playerName(p)} decides on his player option after the draft: he can't be traded until then.` };
  const lock = p.tradeLock;
  if (lock && (league.season < lock.season || (league.season === lock.season && league.day < lock.day)))
    return {
      kind: 'signed',
      why: `${playerName(p)} signed recently: he can be traded from ${fmtDate(lock.season, lock.day)}${lock.season > league.season ? ` (${seasonLabel(lock.season)})` : ''}.`,
    };
  return null;
}

export const untradeableReason = (league: League, p: Player): string | null => untradeable(league, p)?.why ?? null;

/**
 * The standard roster a trade counts: after the season, only players under contract for next
 * season (expiring deals are leaving, or are re-signed into their own spot).
 */
export function tradeRoster(league: League, tid: number): Player[] {
  const cs = contractSeason(league);
  return standardRoster(league, tid).filter((p) => contractExp(p.contract) >= cs);
}

/** "the 2028 1st" or a player's name, for rule messages. */
const assetName = (league: League, a: Player | DraftPick) => ('pid' in a ? playerName(a) : `the ${pickLabel(league, a)}`);

/**
 * Extra salary a side must send for its team to pass the 125% rule (0 when it passes). Payroll
 * includes cap holds between the season and free agency.
 */
export function salaryMatchGap(league: League, offer: TradeOffer, side: 'a' | 'b'): number {
  const mine = offer[side];
  const other = offer[side === 'a' ? 'b' : 'a'];
  const s = contractSeason(league);
  const outSal = sideSalary(league, mine);
  const inSal = sideSalary(league, other);
  if (capPayroll(league, mine.tid, s) - outSal + inSal <= CAP_FOR(league, s).salaryCap) return 0;
  return Math.max(0, (inSal - CAP.tradeMatchBuffer) / CAP.tradeMatchPct - outSal);
}

/**
 * The Stepien rule: a team can't trade itself out of first-round picks in back-to-back future
 * drafts (only checked for teams sending firsts, so inherited gaps don't block other deals).
 */
function stepienError(league: League, offer: TradeOffer, side: TradeSide): string | null {
  if (!side.dpids.some((d) => findPick(league, d)?.round === 1)) return null;
  const moves = new Map<number, number>([...offer.a.dpids.map((d) => [d, offer.b.tid] as const), ...offer.b.dpids.map((d) => [d, offer.a.tid] as const)]);
  const firsts = league.draftPicks.filter((d) => d.round === 1 && !(d.season === league.season && league.phase === 'draft'));
  const years = new Set(firsts.map((d) => d.season));
  const owns = (y: number, after: boolean) => firsts.some((d) => d.season === y && (after ? (moves.get(d.dpid) ?? d.tid) : d.tid) === side.tid);
  for (const y of [...years].sort((a, b) => a - b)) {
    if (!years.has(y + 1)) continue;
    if (!owns(y, true) && !owns(y + 1, true) && (owns(y, false) || owns(y + 1, false))) {
      return `${league.teams[side.tid].abbrev} can't be left without a first-round pick in back-to-back drafts (${y} and ${y + 1}).`;
    }
  }
  return null;
}

export function validateTrade(league: League, offer: TradeOffer): string[] {
  const errors: string[] = [];
  if (league.fired && (offer.a.tid === league.userTid || offer.b.tid === league.userTid)) errors.push('You were fired: take over another team to make trades.');
  if (league.phase === 'regular' && league.day > league.tradeDeadlineDay) errors.push('The trade deadline has passed.');
  if (league.phase === 'playoffs' || league.phase === 'playin') errors.push('No trades during the postseason.');
  const twoWay = (pid: number) => !!league.players[pid]?.contract.twoWay;
  const maxSize = rosterMaxNow(league);
  const s = contractSeason(league);
  for (const [key, mine, other] of [
    ['a', offer.a, offer.b],
    ['b', offer.b, offer.a],
  ] as const) {
    const abbrev = league.teams[mine.tid].abbrev;
    for (const pid of mine.pids) {
      const p = league.players[pid];
      if (!p || p.tid !== mine.tid) errors.push('A player in the deal is no longer on that team.');
      else {
        const why = untradeableReason(league, p);
        if (why) errors.push(why);
      }
    }
    for (const dpid of mine.dpids) {
      const dp = findPick(league, dpid);
      if (!dp || dp.tid !== mine.tid) errors.push('A draft pick in the deal is no longer owned by that team.');
    }
    // nothing goes back to a team that traded it away this season, directly or through another
    // team: a there-and-back pair of trades shouldn't pay out (a casual discount, a pick bought
    // cheap on draft night and sold back as the player)
    for (const a of [...other.pids.map((pid) => league.players[pid]), ...other.dpids.map((d) => findPick(league, d))]) {
      if (a && tradedAwayBy(league, a, mine.tid))
        errors.push(`${abbrev} traded ${assetName(league, a)} away this season and can't get ${'pid' in a ? 'him' : 'it'} back until next season.`);
    }
    // standard roster spots: the cap only binds a team taking in bodies, the floor one sending them out
    const out = mine.pids.filter((pid) => !twoWay(pid)).length;
    const inc = other.pids.filter((pid) => !twoWay(pid)).length;
    const size = tradeRoster(league, mine.tid).length - out + inc;
    if (inc > out && size > maxSize) errors.push(`${abbrev} would have ${size} players (max ${maxSize}${inSeason(league) ? '' : ' in the offseason'}).`);
    if (inSeason(league) && out > inc && size < CAP.rosterMin) errors.push(`${abbrev} would drop to ${size} players (minimum ${CAP.rosterMin} during the season).`);
    const twIn = other.pids.filter(twoWay).length;
    // (after the season, as on the standard roster, only next season's two-way deals hold a slot)
    const twAfter = twoWayRoster(league, mine.tid).filter((p) => contractExp(p.contract) >= s).length - mine.pids.filter(twoWay).length + twIn;
    if (twIn > 0 && twAfter > TWO_WAY_MAX) errors.push(`${abbrev} would have ${twAfter} two-way players (max ${TWO_WAY_MAX}).`);
    const inSal = sideSalary(league, other);
    const outSal = sideSalary(league, mine);
    if (salaryMatchGap(league, offer, key) > 0) {
      const maxIn = outSal * CAP.tradeMatchPct + CAP.tradeMatchBuffer;
      errors.push(
        `${abbrev} would be over the cap after the trade, so it can take back at most 125% of outgoing salary plus $0.1M ($${(maxIn / 1000).toFixed(1)}M) — incoming is $${(inSal / 1000).toFixed(1)}M.`,
      );
    }
    // the mid-level is for teams under the tax, so using it caps the team at the tax line for that season
    const tax = CAP_FOR(league, s).luxuryTax;
    if (league.teams[mine.tid].mleSeason === s && inSal > outSal && capPayroll(league, mine.tid, s) - outSal + inSal > tax)
      errors.push(`${abbrev} used the mid-level exception this season, so a trade can't take its payroll past the tax line ($${(tax / 1000).toFixed(1)}M).`);
    const stepien = stepienError(league, offer, mine);
    if (stepien) errors.push(stepien);
  }
  if (!offer.a.pids.length && !offer.a.dpids.length && !offer.b.pids.length && !offer.b.dpids.length) errors.push('The trade is empty.');
  // (a deep link can name a player twice: the AI would count him twice, and he'd move twice)
  const pids = [...offer.a.pids, ...offer.b.pids];
  const dpids = [...offer.a.dpids, ...offer.b.dpids];
  if (new Set(pids).size < pids.length || new Set(dpids).size < dpids.length) errors.push('A player or pick is in the deal twice.');
  return [...new Set(errors)];
}

export function evaluateTrade(league: League, offer: TradeOffer): TradeEval {
  return withHoldsMemo(() => evaluate(league, offer));
}

/**
 * How far a deal is from what the AI side wants: the share of the value it sends that is still
 * missing (0 once it's there), and how its GM puts it.
 */
export function valueVerdict(ev: { delta: number; valueOut: number }): { gap: number; label: string } {
  const missing = Math.max(0, -ev.delta);
  const gap = ev.valueOut > 0 ? missing / ev.valueOut : missing > 0 ? 1 : 0;
  return { gap, label: gap > 0.6 ? 'Not even close' : gap > 0.25 ? 'You need to add significant value' : 'Close — add a little more' };
}

function evaluate(league: League, offer: TradeOffer): TradeEval {
  const errors = validateTrade(league, offer);
  const diff = league.settings.difficulty;
  // casual AIs accept slightly unfavorable deals; hard AIs want a premium
  const generosity = diff === 'casual' ? 0.88 : diff === 'hard' ? 1.12 : 1.0;
  const { delta, valueIn, valueOut, accept: likes, tooManyFirsts } = judge(league, offer, offer.b.tid, generosity);
  const accept = errors.length === 0 && likes;
  let message: string;
  if (errors.length) message = errors[0];
  else if (tooManyFirsts) message = `No team gives up more than ${MAX_FIRSTS_OUT} first-round picks in one deal.`;
  else if (accept) message = delta > Math.abs(valueOut) * 0.25 ? 'Deal! (They seem eager.)' : 'Deal!';
  else message = `${valueVerdict({ delta, valueOut }).label}.`;
  return { ok: errors.length === 0, errors, delta, valueIn, valueOut, accept, message };
}

export function executeTrade(league: League, offer: TradeOffer) {
  const move = (pids: number[], to: number) => {
    for (const pid of pids) {
      const p = league.players[pid];
      leaveTeam(league.teams[p.tid], pid);
      p.tradedFrom = tradedAway(league, p, p.tid);
      p.tid = to;
      p.joinedSeason = league.season;
      p.mood.tradeRequest = false;
      p.mood.score = Math.max(p.mood.score, 0);
      league.teams[to].rotation.order.push(pid);
    }
  };
  const movePicks = (dpids: number[], to: number) => {
    for (const dpid of dpids) {
      const dp = findPick(league, dpid);
      if (!dp) continue;
      dp.tradedFrom = tradedAway(league, dp, dp.tid);
      dp.tid = to;
      // back with its original team, a protection has nothing left to protect
      if (to === dp.originalTid) delete dp.protection;
    }
  };
  move(offer.a.pids, offer.b.tid);
  move(offer.b.pids, offer.a.tid);
  movePicks(offer.a.dpids, offer.b.tid);
  movePicks(offer.b.dpids, offer.a.tid);
  const ta = league.teams[offer.a.tid];
  const tb = league.teams[offer.b.tid];
  const desc = (side: TradeSide) =>
    [...side.pids.map((pid) => playerName(league.players[pid])), ...side.dpids.map((dpid) => pickLabel(league, findPick(league, dpid)!))].join(', ') || 'nothing';
  addNews(league, {
    kind: 'trade',
    text: `Trade: ${ta.abbrev} send ${desc(offer.a)} to ${tb.abbrev} for ${desc(offer.b)}.`,
    tids: [ta.tid, tb.tid],
    pids: [...offer.a.pids, ...offer.b.pids],
  });
}

/** "2027 1st", "2027 2nd #59" once the order is set (overall number), "(BOS)" if acquired, and any protection. */
export function pickLabel(league: League, dp: DraftPick) {
  const orig = league.teams[dp.originalTid];
  const slot = dp.pick ? ` #${(dp.round - 1) * 30 + dp.pick}` : '';
  const via = dp.originalTid !== dp.tid ? ` (${orig.abbrev})` : '';
  const prot = dp.protection && dp.originalTid !== dp.tid ? ` · top-${(dp.round - 1) * 30 + dp.protection} prot.` : '';
  return `${dp.season} ${dp.round === 1 ? '1st' : '2nd'}${slot}${via}${prot}`;
}

// ---------------------------------------------------------------- "what would make this work?"

const withA = (offer: TradeOffer, pids: number[], dpids: number[] = []): TradeOffer => ({
  a: { ...offer.a, pids: [...offer.a.pids, ...pids], dpids: [...offer.a.dpids, ...dpids] },
  b: offer.b,
});

/** Side A would end up over the roster limit: sending one more of its players fixes that. */
function aRosterOver(league: League, o: TradeOffer): boolean {
  const std = (pids: number[]) => pids.filter((pid) => !league.players[pid]?.contract.twoWay).length;
  return std(o.b.pids) > std(o.a.pids) && tradeRoster(league, o.a.tid).length - std(o.a.pids) + std(o.b.pids) > rosterMaxNow(league);
}

/** Is "what would make this work?" worth asking: are the deal's only rule problems ones that adding side A's players can fix (its salary matching, a full roster)? */
export function canMakeWork(league: League, o: TradeOffer): boolean {
  if (salaryMatchGap(league, o, 'b') > 0) return false;
  return validateTrade(league, o).length <= (salaryMatchGap(league, o, 'a') > 0 ? 1 : 0) + (aRosterOver(league, o) ? 1 : 0);
}

/** A deal the AI would take, or why none was found: no player (or pair) of A's fixes the salary matching, or not enough value. */
export type WorkResult = { offer: TradeOffer; why?: undefined } | { offer: null; why: 'salary' | 'value' };

/**
 * Ask the AI what it would need from side A to accept. When A is over the cap and takes back too
 * much salary, first add the least valuable player (or pair) whose salary fixes the matching, then
 * top up the value: each round adds the smallest pick or player that covers what's missing, else
 * the most valuable one (a full roster takes a player). See salaryMatchGap for the salary A would
 * need to send.
 */
export function makeItWork(league: League, offer: TradeOffer): WorkResult {
  return withHoldsMemo(() => findWork(league, offer));
}

function findWork(league: League, offer: TradeOffer): WorkResult {
  let cur = withA(offer, []);
  const ai = cur.b.tid;
  const gapA = salaryMatchGap(league, cur, 'a');
  if (!canMakeWork(league, cur)) return { offer: null, why: 'value' };
  const legal = (o: TradeOffer) => validateTrade(league, o).length === 0;
  const spare = () =>
    standardRoster(league, cur.a.tid)
      .filter((p) => !cur.a.pids.includes(p.pid) && !untradeableReason(league, p))
      .map((p) => ({ p, v: tradeValue(league, p, 'retool'), sal: capSalary(league, p.pid) }));
  if (gapA > 0) {
    const pool = spare().filter((x) => x.sal > 0);
    const options: { pids: number[]; v: number }[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].sal >= gapA) options.push({ pids: [pool[i].p.pid], v: pool[i].v });
      for (let j = i + 1; j < pool.length; j++) if (pool[i].sal + pool[j].sal >= gapA) options.push({ pids: [pool[i].p.pid, pool[j].p.pid], v: pool[i].v + pool[j].v });
    }
    const fix = options.sort((x, y) => x.v - y.v).find((o) => legal(withA(cur, o.pids)));
    if (!fix) return { offer: null, why: 'salary' };
    cur = withA(cur, fix.pids);
  }
  for (let iter = 0; iter < 6; iter++) {
    const ev = evaluateTrade(league, cur);
    if (ev.accept) return { offer: cur };
    if (!ev.ok && !canMakeWork(league, cur)) break;
    const need = -ev.delta;
    const picks = league.draftPicks
      .filter((d) => d.tid === cur.a.tid && !cur.a.dpids.includes(d.dpid) && legal(withA(cur, [], [d.dpid])))
      .map((d) => ({ next: withA(cur, [], [d.dpid]), v: pickValueFor(league, d, ai, true) }));
    const players = spare()
      .map(({ p }) => ({ next: withA(cur, [p.pid]), v: playerValueFor(league, p, ai, true) }))
      .filter((c) => c.v > 0 && legal(c.next));
    // picks and players together: a pile of picks alone often can't reach a good player's value
    const cands = [...picks, ...players];
    if (!cands.length) break;
    // smallest asset that covers the gap, unless that is a big overpay (a star for a role player's
    // worth of value) and something smaller can close most of it; else the biggest one
    const covering = cands.filter((c) => c.v >= need).sort((a, b) => a.v - b.v);
    const short = cands.filter((c) => c.v < need).sort((a, b) => b.v - a.v);
    cur = (covering[0] && (covering[0].v <= need * 1.5 + 2 || !short.length) ? covering[0] : short[0]).next;
  }
  return evaluateTrade(league, cur).accept ? { offer: cur } : { offer: null, why: 'value' };
}

// ---------------------------------------------------------------- AI front offices

/**
 * Strategy by league rank, not fixed thresholds: real rosters bunch within a few OVR points, so
 * thresholds put nearly everyone in one bucket and nobody sells. Talent (top-8 OVR) decides in
 * the preseason; as games are played the record counts too, up to about two-thirds by the trade
 * deadline. About ten teams contend, the bottom nine (and young mid-table teams) rebuild, the
 * rest retool.
 */
export function teamStrategyUpdate(league: League) {
  const rows = league.teams.map((t) => {
    const top = standardRoster(league, t.tid)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 8);
    const ts = curTeamSeason(league, t.tid);
    return {
      t,
      talent: top.reduce((a, p) => a + p.ovr, 0) / Math.max(1, top.length),
      ageAvg: top.reduce((a, p) => a + (league.season - p.bornYear), 0) / Math.max(1, top.length),
      wp: winPct(ts),
      gp: ts.won + ts.lost,
    };
  });
  const z = (xs: number[]) => {
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length) || 1;
    return xs.map((x) => (x - mean) / sd);
  };
  const w = clamp(rows.reduce((a, r) => a + r.gp, 0) / rows.length / 75, 0, 0.65);
  const zt = z(rows.map((r) => r.talent));
  const zw = z(rows.map((r) => r.wp));
  const ranked = rows.map((r, i) => ({ ...r, score: zt[i] * (1 - w) + zw[i] * w })).sort((a, b) => b.score - a.score || a.t.tid - b.t.tid);
  ranked.forEach(({ t, ageAvg }, i) => {
    t.strategy = i < 10 ? 'contend' : i >= 21 || (i >= 15 && ageAvg <= 24.5) ? 'rebuild' : 'retool';
  });
}

/** Occasionally an AI team pitches a trade to the user: only packages it would accept itself. */
export function aiProposeToUser(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  if (!rng.chance(0.06)) return;
  const user = league.userTid;
  const mine = teamPlayers(league, user).filter((p) => p.ovr >= 70 && !p.contract.twoWay);
  if (!mine.length) return;
  const target = rng.pick(mine);
  const t = rng.pick(league.teams.filter((x) => x.tid !== user));
  const want = playerValueFor(league, target, t.tid, true);
  const userStrategy = league.teams[user].strategy;
  const theirs = standardRoster(league, t.tid)
    .filter((p) => p.ovr < target.ovr + 3)
    .map((p) => ({ p, v: playerValueFor(league, p, t.tid, false) }))
    .sort((a, b) => b.v - a.v);
  // a package of roughly equal value to them, worth the user's time
  const pkg: Player[] = [];
  let v = 0;
  for (const x of theirs) {
    if (x.v <= 0 || v + x.v > want) continue;
    pkg.push(x.p);
    v += x.v;
    if (v >= want * 0.85 || pkg.length >= 3) break;
  }
  if (!pkg.length) return;
  const offer: TradeOffer = { a: { tid: user, pids: [target.pid], dpids: [] }, b: { tid: t.tid, pids: pkg.map((p) => p.pid), dpids: [] } };
  if (!evaluateTrade(league, offer).accept) return;
  if (pkg.reduce((a, p) => a + tradeValue(league, p, userStrategy), 0) < tradeValue(league, target, userStrategy) * 0.85) return;
  addInbox(league, {
    from: `${t.region} ${t.name} GM`,
    subject: `Interest in ${playerName(target)}`,
    body: `We'd offer ${pkg.map((p) => `${playerName(p)} (${p.ovr})`).join(', ')} for ${playerName(target)} (${target.ovr}). Open the Trade screen to review.`,
    tone: 'neutral',
    link: `/trade?with=${t.tid}&give=${target.pid}&get=${pkg.map((p) => p.pid).join(',')}`,
  });
}

/**
 * Occasional AI-to-AI deals (a few a season): contenders buy rebuilding teams' veterans. The buyer
 * matches salary first (without sending an over-the-cap seller more than it can take back, or
 * taking its own payroll past the tax after using the mid-level), then adds its two most valuable
 * young players and picks from the cheapest up (two firsts at most) until the seller agrees, and
 * the deal only goes through if the buyer likes it too. Only assets the rules let move are
 * offered. Up to three veterans are tried.
 */
export function aiToAiTrade(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  // ~13 attempts before the deadline
  if (!rng.chance(0.12)) return;
  const sellers = league.teams.filter((t) => t.tid !== league.userTid && t.strategy === 'rebuild');
  const buyers = league.teams.filter((t) => t.tid !== league.userTid && t.strategy === 'contend');
  if (!sellers.length || !buyers.length) return;
  const s = rng.pick(sellers);
  const b = rng.pick(buyers);
  const vets = rng.shuffle(standardRoster(league, s.tid).filter((p) => league.season - p.bornYear >= 27 && p.ovr >= 74 && !untradeable(league, p)));
  for (const vet of vets.slice(0, 3)) {
    const deal = aiPackage(league, b.tid, s.tid, vet);
    if (deal) {
      executeTrade(league, deal);
      return;
    }
  }
}

function aiPackage(league: League, buyer: number, seller: number, vet: Player): TradeOffer | null {
  const sal = (p: Player) => capSalary(league, p.pid);
  // nothing the rules hold back: a recent signing, or an asset the seller traded away this season
  const movable = (a: Player | DraftPick) => !tradedAwayBy(league, a, seller) && !('pid' in a && untradeable(league, a));
  // the buyer's three best players are off the table
  const roster = standardRoster(league, buyer).sort((x, y) => y.ovr - x.ovr);
  const avail = roster.slice(3).filter((p) => p.ovr < vet.ovr && movable(p));
  // bodies going out for one coming back: keep the seller at 15 and the buyer at 13 or more
  const maxPkg = Math.min(4, CAP.rosterMax - standardRoster(league, seller).length + 1, roster.length - CAP.rosterMin + 1);
  if (maxPkg < 1) return null;
  const pkg: Player[] = [];
  const dps: DraftPick[] = [];
  const offer = (p?: Player): TradeOffer => ({
    a: { tid: buyer, pids: [...pkg, ...(p ? [p] : [])].map((x) => x.pid), dpids: dps.map((d) => d.dpid) },
    b: { tid: seller, pids: [vet.pid], dpids: [] },
  });
  // an over-the-cap seller can only take back so much salary
  const sellerFits = (p: Player) => salaryMatchGap(league, offer(p), 'b') === 0;
  // an over-the-cap buyer must send back salary first (125% rule), and one that used the
  // mid-level enough to stay under the tax: the smallest contract that covers the gap, else the
  // biggest and keep going
  const s = contractSeason(league);
  const taxGap = () => (league.teams[buyer].mleSeason === s ? capPayroll(league, buyer, s) + sal(vet) - pkg.reduce((a, p) => a + sal(p), 0) - CAP_FOR(league, s).luxuryTax : 0);
  const gapNow = () => Math.max(salaryMatchGap(league, offer(), 'a'), taxGap());
  while (gapNow() > 0) {
    const gap = gapNow();
    const rest = avail.filter((x) => !pkg.includes(x) && sellerFits(x));
    const p = rest.filter((x) => sal(x) >= gap).sort((x, y) => sal(x) - sal(y))[0] ?? rest.sort((x, y) => sal(y) - sal(x))[0];
    if (!p || pkg.length >= maxPkg) return null;
    pkg.push(p);
  }
  // then value, until the seller says yes: young players first, then picks from the cheapest up
  const youth = avail
    .filter((p) => !pkg.includes(p) && league.season - p.bornYear <= 25)
    .sort((x, y) => playerValueFor(league, y, seller, true) - playerValueFor(league, x, seller, true));
  const picks = league.draftPicks.filter((d) => d.tid === buyer && movable(d)).sort((x, y) => pickValueFor(league, x, seller, true) - pickValueFor(league, y, seller, true));
  for (const x of [...youth.slice(0, 2), ...picks]) {
    if (teamAccepts(league, offer(), seller)) break;
    if (!('pid' in x)) {
      if (dps.length < 3 && (x.round === 2 || dps.filter((d) => d.round === 1).length < MAX_FIRSTS_OUT)) {
        dps.push(x);
        // the Stepien rule: not if it leaves the buyer without a first in back-to-back drafts
        if (stepienError(league, offer(), offer().a)) dps.pop();
      }
    } else if (pkg.length < maxPkg && sellerFits(x)) pkg.push(x);
  }
  const deal = offer();
  return !validateTrade(league, deal).length && teamAccepts(league, deal, seller) && teamAccepts(league, deal, buyer) ? deal : null;
}
