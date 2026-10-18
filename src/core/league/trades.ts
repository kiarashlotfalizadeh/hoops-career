// Trades: validation (roster size, 125% salary matching when over the cap, cap holds, the Stepien
// rule), AI valuation with team strategy and difficulty, the reasons behind a verdict and the
// counter-offers an AI team would take instead, a "what would make this work?" helper, value tiers
// for the trade finder, the best package a team would give for the user's assets, and AI-to-AI
// deals (the AI's offers to the user are in proposals.ts).

import type { DraftPick, League, Player, Pos, TeamSeason } from '../types';
import { preset } from './difficulty';
import { CAP, seasonLabel } from '../constants';
import { Rng, clamp } from '../random';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import {
  CAP_FOR,
  TWO_WAY_MAX,
  contractSeason,
  addNews,
  andList,
  curTeamSeason,
  sentence,
  dateToDay,
  fmtDate,
  inSeason,
  playerName,
  prospects,
  revenueScale,
  rosterMaxNow,
  standardRoster,
  twoWayRoster,
  winPct,
} from './helpers';
import { type Strategy, leaveTeam, marketSalary, pendingOption, rookieContract, salaryForScore, summerRoster, taxCapped, tradeValue, valueScore } from './contracts';
import { capPayroll, withHoldsMemo } from './freeAgency';
import { numberTeam } from './jerseys';
import { logTrade } from './transactions';
import { money, moneyExact } from '../format';

export interface TradeSide {
  tid: number;
  pids: number[];
  dpids: number[];
  /** Protections this team puts on its own firsts it sends: dpid -> top-N (see PROTECTIONS). */
  protect?: Record<number, number>;
  /** Drafts in which this team gives the other the right to swap first-round picks (see swapPicks). */
  swaps?: number[];
  /** Cash this team sends ($K; see cashRoom). */
  cash?: number;
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
  /** How the AI side's verdict adds up. */
  parts: VerdictParts;
  /** The reasons behind the verdict in plain English, the most important first (see tradeNotes). */
  notes: TradeNote[];
}

/** A reason behind an AI verdict: `good` helps the deal, `bad` holds it back, `warn` is a caution for you, `info` worth knowing. */
export interface TradeNote {
  tone: 'good' | 'bad' | 'warn' | 'info';
  text: string;
}

/** One asset in a deal as the judging team sees it: a player, a pick, the right to swap firsts or cash. */
export interface AssetView {
  kind: 'player' | 'pick' | 'swap' | 'cash';
  /** pid, dpid, the swap's draft, or the cash ($K) */
  id: number;
  /** What it counts for in the deal: the team's own view, kept near neutral (see lens). */
  value: number;
  /** League-neutral value. */
  neutral: number;
  /** The team's strategy's own view, before it is kept near neutral. */
  own: number;
  /** Changed hands this season, so it's worth its neutral value to everyone. */
  flipped: boolean;
}

/** How one team's verdict on a deal adds up (see judge). */
export interface VerdictParts {
  incoming: AssetView[];
  outgoing: AssetView[];
  /** Incoming players' value after depth weighting, and the picks' (swap rights with them) after the pile discount. */
  playersIn: number;
  picksIn: number;
  playersOut: number;
  picksOut: number;
  /** Value of the cash coming in and going out. */
  cashIn: number;
  cashOut: number;
  /** Value of the luxury tax and cap room the deal costs (negative: what it saves). */
  money: number;
  /** Salary coming in and going out, and cap payroll before and after the deal ($K). */
  salaryIn: number;
  salaryOut: number;
  payBefore: number;
  payAfter: number;
  /** Luxury tax the deal adds to the bill ($K; negative: what it saves). */
  taxCost: number;
  /** Value of the players the team would have to waive to get down to 15 by opening night, and how many. */
  cut: number;
  cuts: number;
  /** The difficulty's give: positive wants a premium, negative takes a little less than fair. */
  slack: number;
  /** More players coming in than going out, so each extra one counts for less; `depthLoss` is the value that took off. */
  depthApplied: boolean;
  depthLoss: number;
  /** Incoming assets that changed hands this season: face value only. */
  flippedIn: AssetView[];
  tooManyFirsts: boolean;
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

/** Where a pick may land in its round, as its value projects it, and what each slot is worth. */
interface Outlook {
  /** Weight of each slot of the round (index: slot - 1), and their sum; one slot once the order is set. */
  w: number[];
  sum: number;
  /** What the player taken at slot `k` of the round is worth in a trade today. */
  at: (k: number) => number;
}

/**
 * A pick's outlook: what the player taken there would be worth once drafted, his rookie-scale
 * surplus included (the prospect ranked at its slot in this season's class, in later classes the
 * player a slot usually brings), discounted by the time to its draft: up to 15% over the last year
 * (who will be there, and how he turns out) and 7% for each year before that. Unknown slots are
 * projected from the original team's record (regressed toward the middle for later years) and
 * spread over a range of outcomes.
 */
function outlook(league: League, dp: DraftPick): Outlook {
  const yearsOut = dp.season - league.season;
  const cls = yearsOut === 0 ? classProspects(league) : [];
  const years = Math.max(0, yearsOut + (dateToDay(league.season, 5, 25) - league.day) / 365);
  const discount = years <= 1 ? 1 - 0.15 * years : 0.85 * Math.pow(0.93, years - 1);
  const known = dp.pick !== undefined;
  const at = (inRound: number) => {
    const overall = (dp.round - 1) * 30 + inRound;
    // during the draft the next pick gets the best prospect left
    const idx = known ? league.draftPicks.filter((d) => d.season === dp.season && d.pick !== undefined && (d.round - 1) * 30 + d.pick < overall).length : overall - 1;
    const p = cls[idx] ?? { v: Math.exp((futureSlotScore(overall) - 60) / 6), market: salaryForScore(league, futureSlotScore(overall), 0) };
    const rookie = rookieContract(league, inRound, dp.round, league.season + 1);
    const surplus = rookie.salaries.reduce((a, sal) => a + (p.market - sal) / 1000, 0);
    return Math.max(0, p.v + surplus * 0.1) * discount;
  };
  if (known) {
    const w = Array.from({ length: Math.max(30, dp.pick!) }, (_, i) => (i === dp.pick! - 1 ? 1 : 0));
    return { w, sum: 1, at };
  }
  const orig = league.teams[dp.originalTid];
  const ts = curTeamSeason(league, orig.tid);
  const games = ts.won + ts.lost;
  const prev = orig.seasons.find((s) => s.season === league.season - 1);
  const wp = games >= 15 ? winPct(ts) : prev ? winPct(prev) * 0.6 + 0.2 : 0.5;
  // projected slot in the round (worst record = 1), regressing toward the middle for future years
  const keep = Math.pow(0.75, Math.max(0, yearsOut));
  const center = (1 + clamp(wp, 0, 1) * 29) * keep + 15.5 * (1 - keep);
  const sd = yearsOut <= 0 ? 2 + 6 * (1 - Math.min(1, games / 82)) : 5 + 2 * yearsOut;
  const w: number[] = [];
  let sum = 0;
  for (let k = 1; k <= 30; k++) {
    w.push(Math.exp(-((k - center) ** 2) / (2 * sd * sd)));
    sum += w[k - 1];
  }
  return { w, sum, at };
}

/** The protection a pick carries for its holder: top-N, or 0 (back with its original team it has nothing to protect). */
const protectionOf = (dp: DraftPick) => (dp.protection && dp.tid !== dp.originalTid ? dp.protection : 0);

/** A pick's value without any swap riding on it: a top-`prot` protected pick is worth nothing in the slots where it would stay home. */
function ownValue(league: League, dp: DraftPick, prot = protectionOf(dp)): number {
  const o = outlook(league, dp);
  if (dp.pick !== undefined) return dp.pick <= prot ? 0 : o.at(dp.pick);
  let total = 0;
  for (let k = 1; k <= 30; k++) if (k > prot) total += o.w[k - 1] * o.at(k);
  return total / o.sum;
}

/** The pick holding the right to swap for `dp`, if `dp` is subject to a swap. */
export const swapHolder = (league: League, dp: DraftPick): DraftPick | undefined => (dp.round === 1 ? league.draftPicks.find((d) => d.swap === dp.dpid) : undefined);

/** Is this pick in a swap, holding the right or subject to it? */
export const inSwap = (league: League, dp: DraftPick) => dp.swap !== undefined || !!swapHolder(league, dp);

/** Each slot of the round with its chance (a set order: the one slot). */
const slotOdds = (o: Outlook): [number, number][] => o.w.flatMap((w, i) => (w > 0 ? [[i + 1, w / o.sum] as [number, number]] : []));

/**
 * What the right to take pick `other` in place of `own` is worth to the team holding `own` (both
 * firsts of one draft): the expected gain when `other` lands higher, over both picks' projected
 * slots (the projection their values use, taken as independent), and the chance that it does.
 */
export function swapOutlook(league: League, own: DraftPick, other: DraftPick): { gain: number; odds: number } {
  const a = outlook(league, own);
  const b = outlook(league, other);
  // one draft and round: one value per slot
  const at = new Map<number, number>();
  const v = (k: number) => at.get(k) ?? at.set(k, a.at(k)).get(k)!;
  let gain = 0;
  let odds = 0;
  for (const [i, pi] of slotOdds(a))
    for (const [j, pj] of slotOdds(b)) {
      if (j >= i) continue;
      odds += pi * pj;
      gain += pi * pj * Math.max(0, v(j) - v(i));
    }
  return { gain, odds };
}

/**
 * Trade value of a draft pick (see outlook): it keeps its value from one season into the next, and
 * on the clock is worth the player it becomes. A top-N protected pick held by another team is worth
 * nothing in the slots where it would stay home. A swap riding on a first moves value between the
 * two picks: the one holding the right is worth what the swap is expected to gain it, the one
 * subject to it that much less (a team holding both is worth the two picks).
 */
export function pickValue(league: League, dp: DraftPick): number {
  const base = ownValue(league, dp);
  if (dp.round !== 1) return base;
  const other = dp.swap !== undefined ? findPick(league, dp.swap) : undefined;
  const holder = swapHolder(league, dp);
  if (!other && !holder) return base;
  return base + (other ? swapOutlook(league, dp, other).gain : 0) - (holder ? swapOutlook(league, holder, dp).gain : 0);
}

/** The chance a pick lands in the first `n` slots of its round, by the projection its value uses. */
export function topOdds(league: League, dp: DraftPick, n: number): number {
  return slotOdds(outlook(league, dp)).reduce((a, [k, p]) => a + (k <= n ? p : 0), 0);
}

// ---------------------------------------------------------------- AI valuation

/** How each strategy weighs draft picks against their neutral value. */
export const PICK_LENS: Record<Strategy, number> = { contend: 0.7, retool: 1, rebuild: 1.35 };

// ---------------------------------------------------------------- deal terms: protections, swaps, cash

/** The protections a team can put on its own first when it trades it: top 4, 8, 10, 14 (the lottery) or 20. */
export const PROTECTIONS = [4, 8, 10, 14, 20] as const;

/** A team can send, and separately receive, about this share of the cap in cash in trades each (contract) season, as in the NBA (to the $0.1M). */
export const CASH_PCT = 0.05;

/**
 * Trade value of $1M in cash, in the league's first-season money, to a retooling team: about what
 * second-round picks sell for ($2-3M buys a typical one). Rebuilders take it a little more gladly,
 * contenders less. It is far more than a dollar of luxury tax weighs (TAX_VALUE): cash in a trade
 * is a scarce currency for picks, capped by CASH_PCT, not payroll.
 */
const CASH_VALUE = 1;
const CASH_LENS: Record<Strategy, number> = { contend: 0.8, retool: 1, rebuild: 1.1 };

/** League-neutral trade value of cash ($K), in today's money as the cap grows. */
export const cashValue = (league: League, k: number) => (k / 1000 / revenueScale(league, contractSeason(league))) * CASH_VALUE;

/** Cash team `tid` can still send and receive in trades this contract season ($K), and the season's limit. */
export function cashRoom(league: League, tid: number): { send: number; receive: number; limit: number } {
  const s = contractSeason(league);
  // (to the $0.1M cash moves in)
  const limit = Math.round((CAP_FOR(league, s).salaryCap * CASH_PCT) / 100) * 100;
  const used = league.teams[tid].cashTrades;
  const cur = used?.season === s ? used : { sent: 0, received: 0 };
  return { limit, send: Math.max(0, limit - cur.sent), receive: Math.max(0, limit - cur.received) };
}

/** The pick as it would move in a deal: with the protection its team puts on it (held by the team it goes to). */
export function dealPick(dp: DraftPick, side: TradeSide, to: number): DraftPick {
  // back with its original team it has nothing to protect (executeTrade drops the protection)
  if (to === dp.originalTid) return { ...dp, tid: to, protection: undefined };
  const n = side.protect?.[dp.dpid];
  return n ? { ...dp, tid: to, protection: n } : dp;
}

/**
 * A pick in a deal as one side weighs it: the receiver as it will hold it, the sender as it gives it
 * up. They differ only for a protected pick going home: all of it to its original team, but its
 * sender gives up just the slots it held.
 */
const judgedPick = (dp: DraftPick, side: TradeSide, to: number, incoming: boolean) => (!incoming && to === dp.originalTid ? dp : dealPick(dp, side, to));

/** Each team's own first of a draft, which a swap right given by `giver` to `taker` would tie together: the taker's carries the right, the giver's is subject to it. */
export function swapPicks(league: League, giver: number, taker: number, season: number): { right: DraftPick; subject: DraftPick } | null {
  const own = (tid: number) => league.draftPicks.find((d) => d.season === season && d.round === 1 && d.originalTid === tid);
  const right = own(taker);
  const subject = own(giver);
  return right && subject ? { right, subject } : null;
}

/** Drafts in which `giver` could give `taker` the right to swap firsts now: each holds its own first, with no protection, swap or set slot on either. */
export function swapSeasons(league: League, giver: number, taker: number): number[] {
  const seasons = [...new Set(league.draftPicks.filter((d) => d.round === 1 && d.originalTid === giver).map((d) => d.season))].sort((a, b) => a - b);
  return seasons.filter((y) => {
    const sp = swapPicks(league, giver, taker, y);
    return !!sp && [sp.right, sp.subject].every((d) => d.tid === d.originalTid && d.pick === undefined && !d.protection && !inSwap(league, d));
  });
}

/** One of a deal's terms in plain words (see dealTerms). */
export interface DealTerm {
  key: string;
  /** One line for the trade dock. */
  short: string;
  /** What it does, in full. */
  text: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * A deal's terms in plain words, for the trade builder, from side A's (your) point of view: what each
 * protection does (the chance the pick stays home by the projection its value uses, and how much
 * less the other team counts it for), what each swap right does (the chance it's used, and what
 * it's worth to the team that gets it next to the pick it may take) and what the cash is (no
 * salary, off the sender's profit, within its limit for the season).
 */
export function dealTerms(league: League, offer: TradeOffer): DealTerm[] {
  const out: DealTerm[] = [];
  const ab = (tid: number) => league.teams[tid].abbrev;
  for (const [side, other] of [
    [offer.a, offer.b],
    [offer.b, offer.a],
  ] as const) {
    const yours = side === offer.a;
    const whose = yours ? 'your' : `${ab(side.tid)}'s`;
    // the AI side's view: what it takes in, or what it gives up
    const judge = yours ? other.tid : side.tid;
    for (const [k, n] of Object.entries(side.protect ?? {})) {
      const dp = findPick(league, Number(k));
      if (!dp || !side.dpids.includes(dp.dpid)) continue;
      const odds = topOdds(league, dp, n);
      const full = pickValueFor(league, { ...dp, tid: other.tid }, judge, yours);
      const kept = pickValueFor(league, dealPick(dp, side, other.tid), judge, yours);
      const cut = full > 0 ? 1 - kept / full : 0;
      out.push({
        key: `p${dp.dpid}`,
        short: `Top-${n} protection: stays ${yours ? 'yours' : 'theirs'} about ${pct(odds)} of the time; ${yours ? `${ab(judge)} count it ${pct(cut)} lower` : `${pct(cut)} less for ${ab(judge)} to give up`}`,
        text: `Top-${n} protection: ${whose} ${dp.season} 1st stays ${yours ? 'yours' : 'theirs'} if it lands in the top ${n} (about ${pct(odds)} likely on the current projection), and then nothing is owed. ${
          yours ? `${ab(judge)} count it ${pct(cut)} lower for that.` : `It costs ${ab(judge)} ${pct(cut)} less to give up.`
        }`,
      });
    }
    for (const y of side.swaps ?? []) {
      const sp = swapPicks(league, side.tid, other.tid, y);
      if (!sp) continue;
      const { gain, odds } = swapOutlook(league, sp.right, sp.subject);
      const base = ownValue(league, sp.subject);
      const share = base > 0 ? gain / base : 0;
      out.push({
        key: `s${y}`,
        short: `${y} swap: used about ${pct(odds)} of the time; ${yours ? `worth ${pct(share)} of your pick to ${ab(other.tid)}` : `costs ${ab(side.tid)} ${pct(share)} of their pick`}`,
        text: yours
          ? `${y} swap: ${ab(other.tid)} may take your ${y} 1st for theirs if yours lands higher (about ${pct(odds)} likely on the current projection). It's worth about ${pct(share)} of your pick to them.`
          : `${y} swap: you may take ${ab(side.tid)}'s ${y} 1st for yours if theirs lands higher (about ${pct(odds)} likely on the current projection). It costs them about ${pct(share)} of their pick.`,
      });
    }
    const c = side.cash ?? 0;
    if (c > 0) {
      const room = cashRoom(league, side.tid).send - c;
      out.push({
        key: 'cash',
        short: yours
          ? `${moneyExact(c)} cash: not salary, off your profit; ${room > 0 ? `${moneyExact(room)} more allowed` : 'no more allowed'} for ${seasonLabel(contractSeason(league))}`
          : `${moneyExact(c)} cash from ${ab(side.tid)}: not salary, onto your profit`,
        text: yours
          ? `${moneyExact(c)} in cash to ${ab(other.tid)}: not salary (no matching, no cap), and it comes out of your profit. ${room > 0 ? `You can send ${moneyExact(room)} more` : "That's all you can send"} for ${seasonLabel(contractSeason(league))}.`
          : `${moneyExact(c)} in cash from ${ab(side.tid)}: not salary (no matching, no cap), and it adds to your profit.`,
      });
    }
  }
  return out;
}

/**
 * A team's view of an asset it would receive (`incoming`) or send: its strategy's lens, kept
 * within 15% of the league-neutral value, so contenders don't overpay for veterans. Dealing with
 * the user, an AI team never lets its own assets go below neutral: the lens only adds a premium
 * for what it receives (a rebuilder's veteran bought cheap and sold to a contender, or picks the
 * other way, paid up to 1.8x a round trip). Among themselves AI teams sell down to 85%, which is
 * what gets their deals done. A liability's band runs the same way: taken in at most 15% less of a
 * burden than neutral, sent away among AI teams as up to 15% more of one. An asset that changed
 * hands this season is worth its neutral value to everyone, so it can't be flipped at a second
 * team's premium.
 */
function lens(own: number, neutral: number, incoming: boolean, aiDeal: boolean) {
  const band = 0.15 * Math.abs(neutral);
  return incoming ? Math.min(own, neutral + band) : Math.max(own, neutral - (aiDeal ? band : 0));
}

const flipped = (league: League, a: Player | DraftPick) => a.tradedFrom?.season === league.season;

/** Did team `tid` trade this player or pick away this season? Then it can't take him (or it) back until next season. */
export function tradedAwayBy(league: League, a: Player | DraftPick, tid: number): boolean {
  const t = a.tradedFrom;
  return t?.season === league.season && (t.tid === tid || !!t.also?.includes(tid));
}

/** `tid` trades it away now: remembered along with the teams that already traded it away this season. */
function tradedAway(league: League, a: Player | DraftPick, tid: number): NonNullable<Player['tradedFrom']> {
  const t = a.tradedFrom;
  const also = t?.season === league.season ? [t.tid, ...(t.also ?? [])].filter((x) => x !== tid) : [];
  return also.length ? { tid, season: league.season, also } : { tid, season: league.season };
}

/** A player as team `tid` sees him in a deal (with the user unless `aiDeal`). */
function playerView(league: League, p: Player, tid: number, incoming: boolean, aiDeal: boolean): AssetView {
  const neutral = tradeValue(league, p, 'retool');
  const strategy = league.teams[tid].strategy;
  const own = strategy === 'retool' ? neutral : tradeValue(league, p, strategy);
  const f = flipped(league, p);
  return { kind: 'player', id: p.pid, value: f ? neutral : lens(own, neutral, incoming, aiDeal), neutral, own, flipped: f };
}

/** A draft pick as team `tid` sees it in a deal (with the user unless `aiDeal`). */
function pickView(league: League, dp: DraftPick, tid: number, incoming: boolean, aiDeal: boolean): AssetView {
  const neutral = pickValue(league, dp);
  const own = neutral * PICK_LENS[league.teams[tid].strategy];
  const f = flipped(league, dp);
  return { kind: 'pick', id: dp.dpid, value: f ? neutral : lens(own, neutral, incoming, aiDeal), neutral, own, flipped: f };
}

/** The right to swap firsts in draft `season` as team `tid` sees it: a pick-like asset, through its strategy's pick lens. */
function swapView(league: League, gain: number, season: number, tid: number, incoming: boolean, aiDeal: boolean): AssetView {
  const own = gain * PICK_LENS[league.teams[tid].strategy];
  return { kind: 'swap', id: season, value: lens(own, gain, incoming, aiDeal), neutral: gain, own, flipped: false };
}

/** Cash ($K) as team `tid` sees it: a rebuilder a little more gladly, a contender less (never below neutral for what it sends you). */
function cashView(league: League, k: number, tid: number, incoming: boolean, aiDeal: boolean): AssetView {
  const neutral = cashValue(league, k);
  const own = neutral * CASH_LENS[league.teams[tid].strategy];
  return { kind: 'cash', id: k, value: lens(own, neutral, incoming, aiDeal), neutral, own, flipped: false };
}

/** What team `tid` thinks a sum of cash ($K) is worth in a deal with the user. */
export const cashValueFor = (league: League, k: number, tid: number, incoming: boolean) => cashView(league, k, tid, incoming, false).value;

/**
 * Everything a side sends, as team `tid` sees it: its players, its picks with the protections it
 * puts on them, the swap rights it gives and its cash. `to` is the team on the other side.
 */
function sideViews(league: League, side: TradeSide, to: number, tid: number, incoming: boolean, aiDeal: boolean): AssetView[] {
  return [
    ...side.pids.map((pid) => playerView(league, league.players[pid], tid, incoming, aiDeal)),
    ...side.dpids.flatMap((d) => {
      const dp = findPick(league, d);
      return dp ? [pickView(league, judgedPick(dp, side, to, incoming), tid, incoming, aiDeal)] : [];
    }),
    ...(side.swaps ?? []).flatMap((y) => {
      const sp = swapPicks(league, side.tid, to, y);
      return sp ? [swapView(league, swapOutlook(league, sp.right, sp.subject).gain, y, tid, incoming, aiDeal)] : [];
    }),
    ...((side.cash ?? 0) > 0 ? [cashView(league, side.cash!, tid, incoming, aiDeal)] : []),
  ];
}

/** Picks and swap rights count together: a pile of them coming in is worth less than the sum of its parts. */
const pickLike = (a: AssetView) => a.kind === 'pick' || a.kind === 'swap';

/** What team `tid` thinks a player is worth in a deal (with the user unless `aiDeal`). */
export function playerValueFor(league: League, p: Player, tid: number, incoming: boolean, aiDeal = false): number {
  return playerView(league, p, tid, incoming, aiDeal).value;
}

/** What team `tid` thinks a draft pick is worth in a deal (with the user unless `aiDeal`). */
export function pickValueFor(league: League, dp: DraftPick, tid: number, incoming: boolean, aiDeal = false): number {
  return pickView(league, dp, tid, incoming, aiDeal).value;
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

/** What a deal's salary does to a team's books: the value of the luxury tax and cap room it adds (or saves), and the dollars behind it. */
function moneyCost(league: League, tid: number, inSal: number, outSal: number): { value: number; payBefore: number; payAfter: number; taxCost: number } {
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  const before = capPayroll(league, tid, s);
  const after = before + inSal - outSal;
  const tax = (x: number) => Math.max(0, x - cap.luxuryTax) * CAP.taxRate;
  const room = (x: number) => Math.max(0, cap.salaryCap - x);
  const taxCost = tax(after) - tax(before);
  return { value: (taxCost * TAX_VALUE + (room(before) - room(after)) * ROOM_VALUE) / 1000, payBefore: before, payAfter: after, taxCost };
}

/** In the offseason a roster can run to 21 but only 15 make opening night: the value of the extra players a team would have to waive, and how many more it would be. */
function cutCost(league: League, tid: number, out: number[], inc: number[]): { value: number; count: number } {
  if (inSeason(league)) return { value: 0, count: 0 };
  const before = tradeRoster(league, tid);
  const after = [...before.filter((p) => !out.includes(p.pid)), ...inc.map((pid) => league.players[pid]).filter((p) => !p.contract.twoWay)];
  if (after.length <= CAP.rosterMax) return { value: 0, count: 0 };
  const strategy = league.teams[tid].strategy;
  const waived = (roster: Player[]) =>
    roster
      .map((p) => Math.max(0, tradeValue(league, p, strategy)))
      .sort((a, b) => a - b)
      .slice(0, Math.max(0, roster.length - CAP.rosterMax))
      .reduce((a, v) => a + v, 0);
  return { value: Math.max(0, waived(after) - waived(before)), count: Math.max(0, after.length - Math.max(CAP.rosterMax, before.length)) };
}

interface Verdict {
  delta: number;
  valueIn: number;
  valueOut: number;
  accept: boolean;
  tooManyFirsts: boolean;
  parts: VerdictParts;
}

/**
 * One team's verdict on a deal: what it receives (net of the luxury tax and cap room it takes on
 * and the players it would have to waive) against what it sends. `generosity` below 1 accepts a
 * little less than fair value (easy difficulty), above 1 wants a premium.
 */
function judge(league: League, offer: TradeOffer, tid: number, generosity = 1): Verdict {
  const mine = offer.a.tid === tid ? offer.a : offer.b;
  const other = mine === offer.a ? offer.b : offer.a;
  const aiDeal = offer.a.tid !== league.userTid && offer.b.tid !== league.userTid;
  const incoming = sideViews(league, other, mine.tid, tid, true, aiDeal);
  const outgoing = sideViews(league, mine, other.tid, tid, false, aiDeal);
  const values = (xs: AssetView[], kind: (a: AssetView) => boolean) => xs.filter(kind).map((x) => x.value);
  const isPlayer = (a: AssetView) => a.kind === 'player';
  const isCash = (a: AssetView) => a.kind === 'cash';
  const depthApplied = other.pids.length > mine.pids.length;
  const playersIn = weighted(values(incoming, isPlayer), depthApplied ? DEPTH : null);
  const picksIn = weighted(values(incoming, pickLike), PICK_DEPTH);
  const playersOut = weighted(values(outgoing, isPlayer), mine.pids.length > other.pids.length ? DEPTH : null);
  const picksOut = weighted(values(outgoing, pickLike), null);
  // cash isn't salary: it neither matches nor counts against the cap, and it adds up dollar for dollar
  const cashIn = values(incoming, isCash).reduce((a, v) => a + v, 0);
  const cashOut = values(outgoing, isCash).reduce((a, v) => a + v, 0);
  const salaryIn = sideSalary(league, other);
  const salaryOut = sideSalary(league, mine);
  const money = moneyCost(league, tid, salaryIn, salaryOut);
  const cut = cutCost(league, tid, mine.pids, other.pids);
  const valueIn = playersIn + picksIn + cashIn - (money.value + cut.value);
  const valueOut = playersOut + picksOut + cashOut;
  let slack = (generosity - 1) * Math.abs(valueOut);
  if (generosity < 1) {
    // a casual GM's discount covers the other side's own assets, not ones it just traded for:
    // passed along from team to team, it compounded 12% a trade (an 84 became a 93 in three hops)
    // (what a team takes in is valued the same in any deal: aiDeal only changes what it sends)
    const assets = incoming.map((x) => ({ v: x.kind === 'player' ? Math.max(0, x.value) : x.value, flipped: x.flipped }));
    const total = assets.reduce((s, x) => s + x.v, 0);
    if (total > 0) slack *= assets.reduce((s, x) => s + (x.flipped ? 0 : x.v), 0) / total;
  }
  const delta = valueIn - valueOut - slack;
  const tooManyFirsts = mine.dpids.filter((d) => findPick(league, d)?.round === 1).length > MAX_FIRSTS_OUT;
  const parts: VerdictParts = {
    incoming,
    outgoing,
    playersIn,
    picksIn,
    playersOut,
    picksOut,
    cashIn,
    cashOut,
    money: money.value,
    salaryIn,
    salaryOut,
    payBefore: money.payBefore,
    payAfter: money.payAfter,
    taxCost: money.taxCost,
    cut: cut.value,
    cuts: cut.count,
    slack,
    depthApplied,
    depthLoss: depthApplied ? weighted(values(incoming, isPlayer), null) - playersIn : 0,
    flippedIn: incoming.filter((x) => x.flipped),
    tooManyFirsts,
  };
  return { delta, valueIn, valueOut, accept: delta >= 0 && !tooManyFirsts, tooManyFirsts, parts };
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
export function stepienError(league: League, offer: TradeOffer, side: TradeSide): string | null {
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

/** Why no team can trade right now (past the deadline, the postseason), or null while trading is open. */
export function tradingClosedReason(league: League): string | null {
  if (league.phase === 'regular' && league.day > league.tradeDeadlineDay) return 'The trade deadline has passed.';
  if (league.phase === 'playoffs' || league.phase === 'playin') return 'No trades during the postseason.';
  return null;
}

export function validateTrade(league: League, offer: TradeOffer): string[] {
  const errors: string[] = [];
  if (league.fired && (offer.a.tid === league.userTid || offer.b.tid === league.userTid)) errors.push('You were fired: take over another team to make trades.');
  const closed = tradingClosedReason(league);
  if (closed) errors.push(closed);
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
    // (in free agency an offer sheet the team signed, and the user's pending offer to a top free
    // agent, hold a spot until they're decided: see summerRoster)
    const roster = tradeRoster(league, mine.tid).length;
    const held = inc > out && league.phase === 'freeAgency' ? summerRoster(league, mine.tid) - roster : 0;
    const size = roster - out + inc + held;
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
      // (sending nothing, the limit is the $0.1M buffer alone: "125% of $0.0M plus $0.1M ($0.1M)" read garbled)
      // (over the cap after the trade: the 125% rule)
      const limit = outSal > 0 ? `${money(maxIn)} limit (125% of ${money(outSal)} out + $0.1M)` : '$0.1M limit (125% rule, no salary out)';
      errors.push(`Salary doesn't match: ${abbrev} takes in ${money(inSal)}, over its ${limit}.`);
    }
    // the mid-level and the bi-annual are for teams under the tax, so using one caps the team at the tax line for that season
    const tax = CAP_FOR(league, s).luxuryTax;
    if (taxCapped(league.teams[mine.tid], s) && inSal > outSal && capPayroll(league, mine.tid, s) - outSal + inSal > tax)
      errors.push(
        `${abbrev} used the ${league.teams[mine.tid].mleSeason === s ? 'mid-level' : 'bi-annual'} exception this season, so a trade can't take its payroll past the tax line (${money(tax)}).`,
      );
    const stepien = stepienError(league, offer, mine);
    if (stepien) errors.push(stepien);
    errors.push(...termErrors(league, offer, mine, other));
  }
  const something = (x: TradeSide) => x.pids.length || x.dpids.length || x.swaps?.length || (x.cash ?? 0) > 0;
  if (!something(offer.a) && !something(offer.b)) errors.push('The trade is empty.');
  // (a deep link can name a player twice: the AI would count him twice, and he'd move twice)
  const pids = [...offer.a.pids, ...offer.b.pids];
  const dpids = [...offer.a.dpids, ...offer.b.dpids];
  if (new Set(pids).size < pids.length || new Set(dpids).size < dpids.length) errors.push('A player or pick is in the deal twice.');
  if ((offer.a.cash ?? 0) > 0 && (offer.b.cash ?? 0) > 0) errors.push('Cash can only go one way in a deal.');
  for (const y of offer.a.swaps ?? []) if (offer.b.swaps?.includes(y)) errors.push(`The ${y} firsts can only be swapped one way: one swap per pick.`);
  return [...new Set(errors)];
}

/**
 * What the rules say about the terms one side puts on the table. A protection goes only on the
 * team's own first, before its draft order is set and outside any swap (a pick it already holds
 * with a protection, or another team's, keeps its terms). A swap right needs both teams to hold
 * their own firsts of that draft, unprotected, with no slot set and no swap on either (one swap
 * per pick), and neither may change hands in the same deal. Cash stays within what each team can
 * still send and receive this season (see cashRoom).
 */
function termErrors(league: League, offer: TradeOffer, mine: TradeSide, other: TradeSide): string[] {
  const errors: string[] = [];
  const abbrev = league.teams[mine.tid].abbrev;
  for (const [k, n] of Object.entries(mine.protect ?? {})) {
    const dp = findPick(league, Number(k));
    if (!dp || !mine.dpids.includes(dp.dpid)) errors.push("A protection is set on a pick that isn't in the deal.");
    else if (!(PROTECTIONS as readonly number[]).includes(n)) errors.push('A protection covers the top 4, 8, 10, 14 or 20 picks.');
    else if (dp.round !== 1 || dp.originalTid !== mine.tid) errors.push(`${abbrev} can only protect its own first-round picks: the ${pickLabel(league, dp)} keeps its terms.`);
    else if (dp.pick !== undefined) errors.push(`The ${dp.season} draft order is set: the ${pickLabel(league, dp)} can't be protected now.`);
    else if (inSwap(league, dp)) errors.push(`The ${pickLabel(league, dp)} is part of a pick swap, so it can't be protected.`);
  }
  const moving = new Set([...offer.a.dpids, ...offer.b.dpids]);
  const seasons = mine.swaps ?? [];
  if (new Set(seasons).size < seasons.length) errors.push('A swap is in the deal twice.');
  for (const y of seasons) {
    const sp = Number.isInteger(y) ? swapPicks(league, mine.tid, other.tid, y) : null;
    if (!sp) errors.push(`There are no ${y} first-round picks to swap.`);
    else if (sp.subject.tid !== mine.tid || sp.right.tid !== other.tid) errors.push(`A ${y} swap needs both teams to hold their own ${y} first-round picks.`);
    else if (sp.subject.pick !== undefined || sp.right.pick !== undefined) errors.push(`The ${y} draft order is set: those firsts can't be swapped now.`);
    else if (protectionOf(sp.subject) || protectionOf(sp.right) || inSwap(league, sp.subject) || inSwap(league, sp.right))
      errors.push(`A ${y} first in that swap already has a protection or a swap: one swap per pick, and none on a protected pick.`);
    else if (moving.has(sp.subject.dpid) || moving.has(sp.right.dpid)) errors.push(`A ${y} first can't change hands in the same deal that swaps it.`);
  }
  const c = mine.cash;
  if (c !== undefined && c !== 0) {
    if (!Number.isInteger(c) || c < 0) errors.push("The cash in the deal isn't a valid amount.");
    else {
      const s = seasonLabel(contractSeason(league));
      const out = cashRoom(league, mine.tid);
      const into = cashRoom(league, other.tid);
      if (c > out.send)
        errors.push(`${abbrev} can send ${out.send > 0 ? `at most ${moneyExact(out.send)} more` : 'no more'} in cash in trades for ${s} (${moneyExact(out.limit)} a season).`);
      if (c > into.receive)
        errors.push(
          `${league.teams[other.tid].abbrev} can take ${into.receive > 0 ? `at most ${moneyExact(into.receive)} more` : 'no more'} in cash in trades for ${s} (${moneyExact(into.limit)} a season).`,
        );
    }
  }
  return errors;
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
  // on easy AIs accept slightly unfavorable deals; on hard they want a premium
  const generosity = preset(league).tradeAsk;
  const { delta, valueIn, valueOut, accept: likes, tooManyFirsts, parts } = judge(league, offer, offer.b.tid, generosity);
  const accept = errors.length === 0 && likes;
  let message: string;
  if (errors.length) message = errors[0];
  else if (tooManyFirsts) message = `No team gives up more than ${MAX_FIRSTS_OUT} first-round picks in one deal.`;
  else if (accept) message = delta > Math.abs(valueOut) * 0.25 ? 'Deal! (They seem eager.)' : 'Deal!';
  else message = `${valueVerdict({ delta, valueOut }).label}.`;
  const ev = { ok: errors.length === 0, errors, delta, valueIn, valueOut, accept, message, parts };
  return { ...ev, notes: tradeNotes(league, offer, ev) };
}

// ---------------------------------------------------------------- why: notes on a verdict

const STRATEGY_NOUN: Record<Strategy, string> = { contend: 'contender', retool: 'retooling team', rebuild: 'rebuilder' };

/**
 * League-neutral value of what side A gives and gets, weighed the way an AI team weighs a deal:
 * the bigger half's extra players count for less, and so does a pile of incoming picks.
 */
export function neutralSplit(parts: Pick<VerdictParts, 'incoming' | 'outgoing'>, offer: TradeOffer): { give: number; get: number } {
  // parts are side B's view: what it takes in is what A gives
  const sum = (xs: AssetView[], depth: boolean, incoming: boolean) =>
    weighted(
      xs.filter((x) => x.kind === 'player').map((x) => x.neutral),
      depth ? DEPTH : null,
    ) +
    weighted(
      xs.filter(pickLike).map((x) => x.neutral),
      incoming ? PICK_DEPTH : null,
    ) +
    xs.filter((x) => x.kind === 'cash').reduce((a, x) => a + x.neutral, 0);
  return {
    give: sum(parts.incoming, offer.a.pids.length > offer.b.pids.length, false),
    get: sum(parts.outgoing, offer.b.pids.length > offer.a.pids.length, true),
  };
}

/**
 * Short plain-English reasons behind side B's verdict, the ones that move it most first: its
 * strategy's view of the players and picks coming in, the tax and the waivers the deal costs it,
 * depth for talent, assets that changed hands this season, the two-firsts limit, the difficulty
 * deciding a close call, and a warning when side A (you) gives up much more neutral value than it
 * gets: the AI saying yes doesn't make it a good deal. Only what is true of this offer, and big
 * enough to matter.
 */
export function tradeNotes(league: League, offer: TradeOffer, ev: Pick<TradeEval, 'delta' | 'valueIn' | 'valueOut' | 'accept' | 'parts'>): TradeNote[] {
  const t = league.teams[offer.b.tid];
  const x = ev.parts;
  const notes: { tone: TradeNote['tone']; text: string; weight: number }[] = [];
  const add = (tone: TradeNote['tone'], text: string, weight: number) => notes.push({ tone, text, weight });
  // worth a mention: about 3% of the deal, and at least half a point of value (a 60 OVR is worth 1)
  const scale = Math.max(Math.abs(ev.valueOut), Math.abs(ev.valueIn), x.playersIn + x.picksIn);
  const matters = (v: number) => Math.abs(v) >= Math.max(0.5, 0.03 * scale);
  const nameOf = (a: AssetView) =>
    a.kind === 'player'
      ? playerName(league.players[a.id])
      : a.kind === 'pick'
        ? `the ${pickLabel(league, findPick(league, a.id)!)}`
        : a.kind === 'swap'
          ? `the ${a.id} swap right`
          : `${moneyExact(a.id)} in cash`;

  if (offer.a.tid === league.userTid) {
    const { give, get } = neutralSplit(x, offer);
    if (give - get >= Math.max(1, 0.25 * Math.max(0, get))) {
      const ratio = give / get;
      add(
        'warn',
        get <= 0
          ? give > 0
            ? "By neutral value you'd get nothing back for this"
            : "By neutral value you'd take on a bigger burden than you send"
          : ratio < 2
            ? `By neutral value you'd give up about ${Math.round((ratio - 1) * 100)}% more than you get`
            : ratio < 5
              ? `By neutral value you'd give up about ${Math.round(ratio)} times what you get`
              : "By neutral value you'd give up far more than you get",
        2e9,
      );
    }
  }
  if (x.tooManyFirsts) add('bad', `No team gives up more than ${MAX_FIRSTS_OUT} first-round picks in one deal`, 1e9);

  // the team's strategy, for what it takes in (what it sends never goes below neutral)
  if (t.strategy !== 'retool') {
    const noun = STRATEGY_NOUN[t.strategy];
    for (const a of x.incoming) {
      if (a.kind !== 'player' || a.flipped || !matters(a.value - a.neutral)) continue;
      const p = league.players[a.id];
      const who = `${playerName(p)} (${playerAge(p, league.season)})`;
      if (a.value < a.neutral) add('bad', a.neutral > 0 ? `${who} is worth less to a ${noun}` : `${who}'s contract is a bigger burden to a ${noun}`, a.neutral - a.value);
      else add('good', a.neutral > 0 ? `${who} is worth more to a ${noun}` : `${who}'s contract is less of a burden to a ${noun}`, a.value - a.neutral);
    }
    const picks = x.incoming.filter((a) => pickLike(a) && !a.flipped);
    const lift = picks.reduce((s, a) => s + a.value - a.neutral, 0);
    if (picks.length && matters(lift)) add(lift > 0 ? 'good' : 'bad', lift > 0 ? 'Picks count extra for them' : "Picks don't help them win now", Math.abs(lift));
    const cash = x.incoming.find((a) => a.kind === 'cash');
    if (cash && matters(cash.value - cash.neutral))
      add(
        cash.value > cash.neutral ? 'good' : 'bad',
        `${moneyExact(cash.id)} in cash counts ${cash.value > cash.neutral ? 'extra' : 'for less'} to a ${noun}`,
        Math.abs(cash.value - cash.neutral),
      );
  }

  // face value for anything that changed hands this season: no strategy premium, no easy-mode discount
  const discount = Math.max(0, 1 - preset(league).tradeAsk);
  const flips = x.flippedIn.filter((a) => matters(Math.max(0, Math.min(a.own, a.neutral * 1.15) - a.neutral) + discount * Math.max(0, a.neutral)));
  if (flips.length) {
    const names = flips.length > 2 ? `${flips.slice(0, 2).map(nameOf).join(', ')} and ${flips.length - 2} more` : andList(flips.map(nameOf));
    add(
      'info',
      `${names} changed hands this season: face value only`,
      flips.reduce((s, a) => s + Math.abs(a.neutral) * 0.12, 0),
    );
  }

  if (x.depthApplied && matters(x.depthLoss)) add('bad', "Depth doesn't add up to talent for them", x.depthLoss);
  if (x.cuts > 0 && matters(x.cut)) add('bad', `They'd have to waive ${x.cuts === 1 ? 'a player' : `${x.cuts} players`} to get down to ${CAP.rosterMax}`, x.cut);

  if (matters(x.money)) {
    const net = x.salaryIn - x.salaryOut;
    const tax = CAP_FOR(league, contractSeason(league)).luxuryTax;
    if (x.money > 0)
      add(
        'bad',
        x.taxCost > 0
          ? `Taking on ${money(Math.abs(net))} ${x.payBefore <= tax ? `puts them ${money(Math.abs(x.payAfter - tax))} into the tax` : `takes them to ${money(Math.abs(x.payAfter - tax))} over the tax line`}`
          : `Taking on ${money(Math.abs(net))} uses cap room they'd rather keep`,
        x.money,
      );
    else
      add(
        'good',
        x.taxCost < 0 ? `Shedding ${money(Math.abs(net))} saves them ${money(Math.abs(x.taxCost))} in luxury tax` : `Shedding ${money(Math.abs(net))} frees up cap room for them`,
        -x.money,
      );
  }

  // the difficulty decides a close call
  const fair = ev.valueIn - ev.valueOut;
  if (x.slack > 0 && fair >= 0 && ev.delta < 0) add('info', 'Fair value, but on hard they want a premium', x.slack);
  if (x.slack < 0 && fair < 0 && ev.delta >= 0) add('info', 'A little under fair value: on easy they take it', -x.slack);

  return notes.sort((a, b) => b.weight - a.weight).map(({ tone, text }) => ({ tone, text }));
}

export function executeTrade(league: League, offer: TradeOffer) {
  // (logged before anything moves: each pick is named as its sender held it, "2027 1st" for its
  // own, with the protection it goes with)
  logTrade(league, [offer.a, offer.b], (dpid, side) => pickLabel(league, findPick(league, dpid)!, { protection: side.protect?.[dpid] }));
  const move = (pids: number[], to: number) => {
    for (const pid of pids) {
      const p = league.players[pid];
      leaveTeam(league.teams[p.tid], pid);
      p.tradedFrom = tradedAway(league, p, p.tid);
      p.tid = to;
      p.joinedSeason = league.season;
      p.mood.tradeRequest = false;
      p.mood.score = Math.max(p.mood.score, 0);
      // a fresh start: what his old GM promised him, and their meetings, stay behind
      delete p.promise;
      delete p.meeting;
      league.teams[to].rotation.order.push(pid);
    }
  };
  const movePicks = (side: TradeSide, to: number) => {
    for (const dpid of side.dpids) {
      const dp = findPick(league, dpid);
      if (!dp) continue;
      dp.tradedFrom = tradedAway(league, dp, dp.tid);
      dp.tid = to;
      // back with its original team, a protection has nothing left to protect
      if (to === dp.originalTid) delete dp.protection;
      // a team's own first, protected as it goes
      const n = side.protect?.[dpid];
      if (n && to !== dp.originalTid) dp.protection = n;
    }
  };
  move(offer.a.pids, offer.b.tid);
  move(offer.b.pids, offer.a.tid);
  // the arrivals take numbers nobody there wears (nor has retired)
  if (offer.b.pids.length) numberTeam(league, offer.a.tid);
  if (offer.a.pids.length) numberTeam(league, offer.b.tid);
  movePicks(offer.a, offer.b.tid);
  movePicks(offer.b, offer.a.tid);
  for (const [side, to] of [
    [offer.a, offer.b.tid],
    [offer.b, offer.a.tid],
  ] as const) {
    // a swap right rides on the other team's own first of that draft
    for (const y of side.swaps ?? []) {
      const sp = swapPicks(league, side.tid, to, y);
      if (sp) sp.right.swap = sp.subject.dpid;
    }
    payCash(league, side, to);
  }
  // a player the user marked untouchable is unmarked when he leaves
  if (league.untouchable) league.untouchable = league.untouchable.filter((pid) => league.players[pid]?.tid === league.userTid);
  const ta = league.teams[offer.a.tid];
  const tb = league.teams[offer.b.tid];
  const desc = (side: TradeSide) =>
    [
      ...side.pids.map((pid) => playerName(league.players[pid])),
      ...side.dpids.map((dpid) => pickLabel(league, findPick(league, dpid)!)),
      ...(side.swaps ?? []).map((y) => `the right to swap ${y} firsts`),
      ...((side.cash ?? 0) > 0 ? [`${moneyExact(side.cash!)} in cash`] : []),
    ].join(', ') || 'nothing';
  addNews(league, {
    kind: 'trade',
    text: sentence(`Trade: ${ta.abbrev} send ${desc(offer.a)} to ${tb.abbrev} for ${desc(offer.b)}`),
    tids: [ta.tid, tb.tid],
    pids: [...offer.a.pids, ...offer.b.pids],
  });
}

/**
 * Cash a side sends: off its bank balance and onto the other team's, an expense of the sender's
 * season and revenue of the receiver's (kept apart from the local revenue that revenue sharing
 * evens out), and counted against both teams' limits for the contract season.
 */
function payCash(league: League, side: TradeSide, to: number) {
  const c = side.cash ?? 0;
  if (c <= 0) return;
  const s = contractSeason(league);
  const used = (tid: number) => {
    const t = league.teams[tid];
    if (t.cashTrades?.season !== s) t.cashTrades = { season: s, sent: 0, received: 0 };
    return t.cashTrades;
  };
  used(side.tid).sent += c;
  used(to).received += c;
  league.teams[side.tid].cash -= c;
  league.teams[to].cash += c;
  // cash traded after the season counts toward next season's limit, and next season's books: the
  // owner has already judged this one (see bookTradedCash, when next season's books open)
  if (s === league.season) bookCash(curTeamSeason(league, side.tid), curTeamSeason(league, to), c);
}

/** Cash in a trade on the season's books: an expense for the sender, revenue (but not local revenue) for the receiver. */
function bookCash(from: TeamSeason, to: TeamSeason, c: number) {
  from.expenses += c;
  to.revenue += c;
  to.cashIn = (to.cashIn ?? 0) + c;
}

/**
 * The new season's books open: cash traded over the summer (counted against this season's limit,
 * see cashRoom) goes on them. The receiving side's share is booked once per team, with what it
 * received; the senders' with what they sent.
 */
export function bookTradedCash(league: League) {
  for (const t of league.teams) {
    const c = t.cashTrades;
    if (c?.season !== league.season || (!c.sent && !c.received)) continue;
    const ts = curTeamSeason(league, t.tid);
    ts.expenses += c.sent;
    ts.revenue += c.received;
    if (c.received) ts.cashIn = (ts.cashIn ?? 0) + c.received;
  }
}

/**
 * "2027 1st", "2027 2nd #59" once the order is set (overall number), "(BOS)" if acquired, any
 * protection ("· top-10 prot."; `terms.protection`: the one it goes with in a deal) and a swap
 * riding on it ("· swap with BKN" on the pick holding the right, "· BOS may swap" on the one
 * subject to it, naming the team that holds the right).
 */
export function pickLabel(league: League, dp: DraftPick, terms: { protection?: number } = {}) {
  const orig = league.teams[dp.originalTid];
  const slot = dp.pick ? ` #${(dp.round - 1) * 30 + dp.pick}` : '';
  const via = dp.originalTid !== dp.tid ? ` (${orig.abbrev})` : '';
  const n = terms.protection || protectionOf(dp);
  const prot = n ? ` · top-${(dp.round - 1) * 30 + n} prot.` : '';
  return `${dp.season} ${dp.round === 1 ? '1st' : '2nd'}${slot}${via}${prot}${swapLabel(league, dp)}`;
}

function swapLabel(league: League, dp: DraftPick): string {
  const other = dp.swap !== undefined ? findPick(league, dp.swap) : undefined;
  if (other) return ` · swap with ${league.teams[other.originalTid].abbrev}`;
  const holder = swapHolder(league, dp);
  return holder ? ` · ${league.teams[holder.tid].abbrev} may swap` : '';
}

/** A pick's terms in plain words for pick lists ("Stays with BKN if it lands in the top 10."), or null. */
export function pickTermsNote(league: League, dp: DraftPick): string | null {
  const notes: string[] = [];
  const n = protectionOf(dp);
  if (n) notes.push(`Stays with ${league.teams[dp.originalTid].abbrev} if it lands in the top ${n}${dp.round === 2 ? ' of the second round' : ''}.`);
  const other = dp.swap !== undefined ? findPick(league, dp.swap) : undefined;
  if (other) notes.push(`Swaps for ${league.teams[other.originalTid].abbrev}'s ${dp.season} 1st if that one lands higher.`);
  const holder = swapHolder(league, dp);
  if (holder)
    notes.push(
      `${league.teams[holder.tid].abbrev} may take it for ${holder.tid === holder.originalTid ? 'their own' : `${league.teams[holder.originalTid].abbrev}'s`} ${dp.season} 1st if it lands higher.`,
    );
  return notes.length ? notes.join(' ') : null;
}

// ---------------------------------------------------------------- "what would make this work?"

const withA = (offer: TradeOffer, pids: number[], dpids: number[] = []): TradeOffer => ({
  a: { ...offer.a, pids: [...offer.a.pids, ...pids], dpids: [...offer.a.dpids, ...dpids] },
  b: offer.b,
});

/** Side A would end up over the roster limit: sending one more of its players fixes that. */
function aRosterOver(league: League, o: TradeOffer): boolean {
  const std = (pids: number[]) => pids.filter((pid) => !league.players[pid]?.contract.twoWay).length;
  const roster = tradeRoster(league, o.a.tid).length;
  // (in free agency the spots an offer sheet or a pending offer holds count, as validateTrade counts them)
  const held = league.phase === 'freeAgency' ? summerRoster(league, o.a.tid) - roster : 0;
  return std(o.b.pids) > std(o.a.pids) && roster + held - std(o.a.pids) + std(o.b.pids) > rosterMaxNow(league);
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
 * need to send. The user's untouchables are never asked for, nor anyone in `keep`. With `cash`, a
 * gap that a little of A's cash covers (within what both teams can still move this season) is
 * closed with cash before any pick or player is added.
 */
export function makeItWork(league: League, offer: TradeOffer, keep: readonly number[] = [], opts: { cash?: boolean } = {}): WorkResult {
  return withHoldsMemo(() => findWork(league, offer, keep, opts));
}

/**
 * The cash ($K, in $0.1M steps) side A would send in all for side B to see `need` more value, or
 * null when that's more than both teams can still move this season (or B is the one sending cash).
 */
function cashToClose(league: League, o: TradeOffer, need: number): number | null {
  if (!(need > 0) || (o.b.cash ?? 0) > 0) return null;
  const room = Math.min(cashRoom(league, o.a.tid).send, cashRoom(league, o.b.tid).receive);
  // (cash is valued in proportion: what $1M is worth to B)
  const per = cashValueFor(league, 1000, o.b.tid, true);
  const total = (o.a.cash ?? 0) + Math.ceil((need / per) * 10) * 100;
  return per > 0 && total <= room ? total : null;
}

function findWork(league: League, offer: TradeOffer, keep: readonly number[] = [], opts: { cash?: boolean } = {}): WorkResult {
  let cur = withA(offer, []);
  const ai = cur.b.tid;
  const gapA = salaryMatchGap(league, cur, 'a');
  if (!canMakeWork(league, cur)) return { offer: null, why: 'value' };
  const legal = (o: TradeOffer) => validateTrade(league, o).length === 0;
  const off = new Set([...keep, ...(cur.a.tid === league.userTid ? (league.untouchable ?? []) : [])]);
  const spare = () =>
    standardRoster(league, cur.a.tid)
      .filter((p) => !cur.a.pids.includes(p.pid) && !off.has(p.pid) && !untradeableReason(league, p))
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
    // a little cash before a pick or a player
    const c = opts.cash ? cashToClose(league, cur, need) : null;
    if (c !== null) {
      const next: TradeOffer = { a: { ...cur.a, cash: c }, b: cur.b };
      if (legal(next) && evaluateTrade(league, next).accept) return { offer: next };
    }
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

// ---------------------------------------------------------------- counter-offers

/** A deal side B would take instead of the one it turned down: side A adds something, B keeps one of its assets, or B sends a bad contract along. */
export interface CounterOffer {
  offer: TradeOffer;
  kind: 'add' | 'remove' | 'absorb';
  label: string;
}

/**
 * Up to `max` versions of a turned-down deal that side B would accept, the best for side A (by
 * league-neutral value) first: what "what would make this work?" adds from A (or a little cash
 * from A that closes the gap), the deal without one of B's assets (a player, a pick, a swap right
 * or its cash) or without a protection A put on its pick, and B sending one of its bad contracts
 * for A to absorb (the least burden that gets it done; else the worst one with whatever else A
 * would have to add). Each one passes the rules and B's yes as it stands, and moves only assets
 * each side owns. Nothing for a deal B already takes.
 */
export function counterOffers(league: League, offer: TradeOffer, max = 3): CounterOffer[] {
  return withHoldsMemo(() => findCounters(league, offer, max));
}

function findCounters(league: League, offer: TradeOffer, max: number): CounterOffer[] {
  const base = evaluateTrade(league, offer);
  if (base.accept) return [];
  const found: { c: CounterOffer; net: number }[] = [];
  const seen = new Set<string>();
  const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);
  const terms = (x: TradeSide) => [Object.entries(x.protect ?? {}).sort(), sorted(x.swaps ?? []), x.cash ?? 0];
  const consider = (o: TradeOffer, kind: CounterOffer['kind'], label: string) => {
    const key = JSON.stringify([sorted(o.a.pids), sorted(o.a.dpids), sorted(o.b.pids), sorted(o.b.dpids), terms(o.a), terms(o.b)]);
    if (seen.has(key)) return;
    seen.add(key);
    if (validateTrade(league, o).length) return;
    const ev = evaluateTrade(league, o);
    if (!ev.accept) return;
    const { give, get } = neutralSplit(ev.parts, o);
    found.push({ c: { offer: o, kind, label }, net: get - give });
  };
  const assetName = (kind: 'player' | 'pick', id: number) => (kind === 'player' ? playerName(league.players[id]) : pickLabel(league, findPick(league, id)!));
  const added = (from: TradeOffer, to: TradeOffer) => [
    ...to.a.pids.filter((x) => !from.a.pids.includes(x)).map((x) => assetName('player', x)),
    ...to.a.dpids.filter((x) => !from.a.dpids.includes(x)).map((x) => assetName('pick', x)),
  ];

  // what they'd need added from A, or a little cash from A instead
  const work = findWork(league, offer);
  if (work.offer) consider(work.offer, 'add', `Add ${added(offer, work.offer).join(' + ')}`);
  const cash = cashToClose(league, offer, -base.delta);
  if (cash !== null) consider({ a: { ...offer.a, cash }, b: offer.b }, 'add', `Add ${moneyExact(cash - (offer.a.cash ?? 0))} in cash`);

  // A's own pick without the protection A put on it
  for (const [k, n] of Object.entries(offer.a.protect ?? {})) {
    const dp = findPick(league, Number(k));
    if (!dp || !offer.a.dpids.includes(dp.dpid)) continue;
    const protect = { ...offer.a.protect };
    delete protect[dp.dpid];
    consider({ a: { ...offer.a, protect }, b: offer.b }, 'remove', `Without the top-${n} protection on the ${pickLabel(league, dp)}`);
  }

  // one of B's assets stays home (unless that leaves A giving something for nothing)
  const without = (pids: number[], dpids: number[], patch: Partial<TradeSide> = {}): TradeOffer => {
    const b: TradeSide = { ...offer.b, pids, dpids, ...patch };
    // a protection goes with its pick
    if (b.protect) b.protect = Object.fromEntries(Object.entries(b.protect).filter(([d]) => dpids.includes(Number(d))));
    return { a: offer.a, b };
  };
  const aValue = neutralSplit(base.parts, offer).give;
  const drops: [TradeOffer, string][] = [
    ...offer.b.pids.map((pid): [TradeOffer, string] => [
      without(
        offer.b.pids.filter((x) => x !== pid),
        offer.b.dpids,
      ),
      assetName('player', pid),
    ]),
    ...offer.b.dpids.map((d): [TradeOffer, string] => [
      without(
        offer.b.pids,
        offer.b.dpids.filter((x) => x !== d),
      ),
      `the ${assetName('pick', d)}`,
    ]),
    ...(offer.b.swaps ?? []).map((y): [TradeOffer, string] => [
      without(offer.b.pids, offer.b.dpids, { swaps: offer.b.swaps!.filter((x) => x !== y) }),
      `the right to swap ${y} firsts`,
    ]),
    ...((offer.b.cash ?? 0) > 0 ? [[without(offer.b.pids, offer.b.dpids, { cash: 0 }), `the ${moneyExact(offer.b.cash!)} in cash`] as [TradeOffer, string]] : []),
  ];
  for (const [o, name] of drops)
    if (o.b.pids.length + o.b.dpids.length + (o.b.swaps?.length ?? 0) + (o.b.cash ? 1 : 0) > 0 || aValue <= 0) consider(o, 'remove', `Without ${name}`);

  // one of B's bad contracts comes along: the smallest burden that does it, else the worst one plus what A adds
  const s = contractSeason(league);
  const bad = standardRoster(league, offer.b.tid)
    .filter((p) => !offer.b.pids.includes(p.pid) && !untradeable(league, p) && !tradedAwayBy(league, p, offer.a.tid))
    .map((p) => ({ p, v: playerValueFor(league, p, offer.b.tid, false) }))
    .filter((x) => x.v < 0)
    .sort((x, y) => y.v - x.v);
  const take = (p: Player) => `Take ${playerName(p)}'s contract (${money(Math.abs(salaryFor(p, s)))} thru ${seasonLabel(contractExp(p.contract))})`;
  const withB = (p: Player): TradeOffer => ({ a: offer.a, b: { ...offer.b, pids: [...offer.b.pids, p.pid] } });
  const n = found.length;
  for (const { p } of bad) {
    consider(withB(p), 'absorb', take(p));
    if (found.length > n) break;
  }
  if (found.length === n && bad.length) {
    const worst = bad[bad.length - 1].p;
    const r = findWork(league, withB(worst));
    if (r.offer) consider(r.offer, 'absorb', `${take(worst)}, add ${added(offer, r.offer).join(' + ')}`);
  }

  return found
    .sort((x, y) => y.net - x.net)
    .slice(0, max)
    .map((x) => x.c);
}

// ---------------------------------------------------------------- trade finder

export type ValueTier = 'Franchise' | 'All-Star' | 'Starter' | 'Rotation' | 'Depth' | 'Negative';

/** Each tier's share of the league's rostered players, counted from the most valuable: about one franchise player for every two teams, five starters a team. */
const TIER_SHARE: [ValueTier, number][] = [
  ['Franchise', 0.03],
  ['All-Star', 0.09],
  ['Starter', 0.33],
  ['Rotation', 0.6],
];

const tierCache = new WeakMap<League, { key: string; cuts: number[] }>();

/**
 * The neutral trade value that starts each tier (TIER_SHARE order), from everyone on a standard
 * contract. Worked out once a day: every row of a roster asks, and a day's signings and trades
 * barely move the league's percentiles.
 */
function tierCuts(league: League): number[] {
  const key = `${league.season}:${league.phase}:${league.day}`;
  const hit = tierCache.get(league);
  if (hit?.key === key) return hit.cuts;
  const values = Object.values(league.players)
    .filter((p) => p.tid >= 0 && !p.contract.twoWay)
    .map((p) => tradeValue(league, p))
    .sort((a, b) => b - a);
  const cuts = TIER_SHARE.map(([, share]) => (values.length ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * share) - 1))] : Infinity));
  tierCache.set(league, { key, cuts });
  return cuts;
}

function tierOf(league: League, value: number): ValueTier {
  if (value < 0) return 'Negative';
  const cuts = tierCuts(league);
  const i = cuts.findIndex((c) => value >= c);
  return i < 0 ? 'Depth' : TIER_SHARE[i][0];
}

/**
 * Where a player's league-neutral trade value ranks among everyone on a roster: Franchise, All-Star,
 * Starter, Rotation or Depth, or Negative for a contract worth less than nothing. A label only: AI
 * teams value deals as before.
 */
export function valueTier(league: League, p: Player): ValueTier {
  return tierOf(league, tradeValue(league, p));
}

export type Availability = 'franchise' | 'block' | null;

/**
 * How gettable an AI team's player looks: 'franchise' for a young star it builds around (a
 * franchise-tier player 27 or younger, an All-Star 25 or younger), 'block' for a player it would
 * move (he asked for a trade, his contract is worth less than nothing, or he's a rebuilder's
 * veteran of 72+ OVR aged 28 or more), null otherwise and for your own players. A label only.
 */
export function availability(league: League, p: Player): Availability {
  return availabilityAt(league, p, tradeValue(league, p));
}

/** availability for a player whose neutral trade value is known. */
function availabilityAt(league: League, p: Player, value: number): Availability {
  if (p.tid < 0 || p.tid === league.userTid || !league.teams[p.tid]) return null;
  if (p.mood.tradeRequest || value < 0) return 'block';
  const a = playerAge(p, league.season);
  const tier = tierOf(league, value);
  if ((tier === 'Franchise' && a <= 27) || (tier === 'All-Star' && a <= 25)) return 'franchise';
  if (league.teams[p.tid].strategy === 'rebuild' && p.ovr >= 72 && a >= 28) return 'block';
  return null;
}

/** A player the trade finder lists. */
export interface TradeTarget {
  p: Player;
  age: number;
  /** League-neutral trade value. */
  value: number;
  tier: ValueTier;
  avail: Availability;
  /** Salary that counts in trades this contract season ($K; two-way pay doesn't). */
  salary: number;
}

/** Everyone on an AI team who can be traded right now, for the trade finder. */
export function tradeTargets(league: League): TradeTarget[] {
  return Object.values(league.players)
    .filter((p) => p.tid >= 0 && p.tid !== league.userTid && !untradeable(league, p))
    .map((p) => {
      const value = tradeValue(league, p);
      return { p, age: playerAge(p, league.season), value, tier: tierOf(league, value), avail: availabilityAt(league, p, value), salary: capSalary(league, p.pid) };
    });
}

export interface TargetFilter {
  pos?: Pos | 'all';
  minOvr?: number;
  maxAge?: number;
  /** $K */
  maxSalary?: number;
  /** Only players their team would move (availability 'block'). */
  available?: boolean;
  sort?: 'ovr' | 'value' | 'salary';
}

/** The trade finder's filters and sort (best first, the biggest salary first). */
export function filterTargets(rows: TradeTarget[], f: TargetFilter): TradeTarget[] {
  const key = { ovr: (x: TradeTarget) => x.p.ovr, value: (x: TradeTarget) => x.value, salary: (x: TradeTarget) => x.salary }[f.sort ?? 'value'];
  return rows
    .filter(
      (x) =>
        (!f.pos || f.pos === 'all' || x.p.pos === f.pos) &&
        x.p.ovr >= (f.minOvr ?? 0) &&
        x.age <= (f.maxAge ?? Infinity) &&
        x.salary <= (f.maxSalary ?? Infinity) &&
        (!f.available || x.avail === 'block'),
    )
    .sort((a, b) => key(b) - key(a) || b.value - a.value || a.p.pid - b.p.pid);
}

/**
 * The most salary a team can take back in one deal right now, sending at most two of its
 * tradeable contracts (as "what would make this work?" does to match salaries): what fits under
 * the cap after they leave, or 125% of them plus $0.1M, and no more than keeps a team that used the
 * mid-level or the bi-annual at the tax line (or as much as they make, past it).
 */
export function maxTakeBack(league: League, tid: number): number {
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  const pay = capPayroll(league, tid, s);
  const sals = standardRoster(league, tid)
    .filter((p) => !untradeable(league, p))
    .map((p) => capSalary(league, p.pid))
    .sort((a, b) => b - a);
  const out = (sals[0] ?? 0) + (sals[1] ?? 0);
  const most = Math.max(cap.salaryCap - pay + out, out * CAP.tradeMatchPct + CAP.tradeMatchBuffer);
  return taxCapped(league.teams[tid], s) ? Math.min(most, Math.max(out, cap.luxuryTax - pay + out)) : most;
}

// ---------------------------------------------------------------- packages for the user's assets

/** No AI team sends more than this many picks in one package (firsts count toward MAX_FIRSTS_OUT too). */
export const MAX_PICKS_OUT = 3;

export interface Package {
  tid: number;
  offer: TradeOffer;
  /** Value of the package to the user's team (its strategy). */
  myValue: number;
  /** Value of what the user gives, to the user's team. */
  giveValue: number;
}

interface Asset {
  kind: 'p' | 'd';
  id: number;
  ai: number; // value to the AI team
  mine: number; // value to the user
  sal: number;
  first: boolean;
}

/** An asset's value to the user's team: its strategy's view of a player, its pick lens on a pick. */
function mineValue(league: League, a: Player | DraftPick): number {
  const s = league.teams[league.userTid].strategy;
  return 'pid' in a ? tradeValue(league, a, s) : pickValue(league, a) * PICK_LENS[s];
}

/**
 * The best package team `tid` would send for the user's players and picks in `give`: of the deals
 * it accepts, the one worth most to the user. A greedy fill of its most valuable assets (to the
 * user) up to what it thinks the user's are worth, with variants that leave out the top one or two
 * and salary fillers when the money doesn't match. Only assets the rules let move are tried: no
 * recent signings, nothing the user traded away this season, no first that breaks the Stepien
 * rule, two firsts and three picks at most. Null when nothing works.
 */
export function packageFor(league: League, tid: number, give: { pids: number[]; dpids: number[] }): Package | null {
  return withHoldsMemo(() => findPackage(league, tid, give));
}

function findPackage(league: League, tid: number, give: { pids: number[]; dpids: number[] }): Package | null {
  const user = league.userTid;
  if (tid === user || !league.teams[tid] || (!give.pids.length && !give.dpids.length)) return null;
  const players: Player[] = [];
  const picks: DraftPick[] = [];
  // only what is the user's to trade, and what this team may take back
  for (const pid of give.pids) {
    const p = league.players[pid];
    if (!p || p.tid !== user || untradeable(league, p) || tradedAwayBy(league, p, tid)) return null;
    players.push(p);
  }
  for (const d of give.dpids) {
    const dp = findPick(league, d);
    if (!dp || dp.tid !== user || tradedAwayBy(league, dp, tid)) return null;
    picks.push(dp);
  }
  const gives = [...players, ...picks];
  const giveValue = gives.reduce((a, x) => a + mineValue(league, x), 0);
  // what the team thinks it gets (a second player in, or a pile of picks, counts for less)
  const want =
    weighted(
      players.map((p) => playerValueFor(league, p, tid, true)),
      players.length > 1 ? DEPTH : null,
    ) +
    weighted(
      picks.map((d) => pickValueFor(league, d, tid, true)),
      PICK_DEPTH,
    );
  // the easy-mode discount covers the user's own assets, not ones he got in a trade this season
  const own = gives.filter((x) => !flipped(league, x)).length / gives.length;
  const ask = preset(league).tradeAsk;
  const gen = ask < 1 ? 1 - (1 - ask) * own : ask;
  const budget = want / gen;
  // after the season, only next season's contracts take a spot
  const max = rosterMaxNow(league);
  const stdOut = players.filter((p) => !p.contract.twoWay).length;
  // the AI must stay within the roster limit after taking the user's players, and so must the user
  const minPlayersOut = Math.max(0, tradeRoster(league, tid).length + stdOut - max);
  const maxPlayersIn = Math.min(3, max - tradeRoster(league, user).length + stdOut);
  if (maxPlayersIn < minPlayersOut) return null;
  const player = (p: Player): Asset => ({
    kind: 'p',
    id: p.pid,
    ai: playerValueFor(league, p, tid, false),
    mine: mineValue(league, p),
    sal: capSalary(league, p.pid),
    first: false,
  });
  // players it can actually move (no expiring deals after the season, two-ways stay put)
  const roster = standardRoster(league, tid).filter((p) => !untradeable(league, p) && !tradedAwayBy(league, p, user));
  const assets: Asset[] = [
    ...roster.map(player),
    ...league.draftPicks
      .filter((d) => d.tid === tid && !tradedAwayBy(league, d, user))
      .map((d) => ({ kind: 'd' as const, id: d.dpid, ai: pickValueFor(league, d, tid, false), mine: mineValue(league, d), sal: 0, first: d.round === 1 })),
  ]
    // ignore throw-ins worth almost nothing
    .filter((a) => a.mine >= giveValue * 0.06)
    .sort((x, y) => y.mine - x.mine);
  const offerOf = (pkg: Asset[]): TradeOffer => ({
    a: { tid: user, pids: [...give.pids], dpids: [...give.dpids] },
    b: { tid, pids: pkg.filter((x) => x.kind === 'p').map((x) => x.id), dpids: pkg.filter((x) => x.kind === 'd').map((x) => x.id) },
  });
  // the Stepien rule: no first that leaves the team without one in back-to-back drafts
  const stepienOk = (pkg: Asset[]) => {
    const o = offerOf(pkg);
    return !stepienError(league, o, o.b);
  };

  const greedy = (skip: Set<number>): Asset[] => {
    const pkg: Asset[] = [];
    let sum = 0;
    let np = 0;
    let nd = 0;
    let nf = 0;
    for (let i = 0; i < assets.length; i++) {
      if (skip.has(i)) continue;
      const a = assets[i];
      if (a.kind === 'p' && np >= maxPlayersIn) continue;
      // two firsts and three picks at most (second-rounders used to count toward the firsts)
      if (a.kind === 'd' && (nd >= MAX_PICKS_OUT || (a.first && nf >= MAX_FIRSTS_OUT))) continue;
      if (sum + a.ai > budget) continue;
      if (a.first && !stepienOk([...pkg, a])) continue;
      pkg.push(a);
      sum += a.ai;
      if (a.kind === 'p') np++;
      else {
        nd++;
        if (a.first) nf++;
      }
    }
    return pkg;
  };

  // salary fillers: low-value contracts the AI is happy to send to make the money work
  const fillers = roster
    .map(player)
    .filter((a) => a.sal > 0)
    .sort((x, y) => x.ai / x.sal - y.ai / y.sal);

  let best: { pkg: Asset[]; mine: number } | null = null;
  const consider = (pkg: Asset[]) => {
    const nPlayers = pkg.filter((a) => a.kind === 'p').length;
    if (!pkg.length || nPlayers < minPlayersOut || nPlayers > maxPlayersIn) return;
    const ev = evaluateTrade(league, offerOf(pkg));
    if (!ev.accept) return;
    const mine = pkg.reduce((a, x) => a + x.mine, 0);
    if (!best || mine > best.mine) best = { pkg, mine };
  };
  const variants: Set<number>[] = [new Set(), new Set([0]), new Set([1]), new Set([0, 1]), new Set([2])];
  for (const skip of variants) {
    const pkg = greedy(skip);
    consider(pkg);
    // add a salary filler or two if matching fails
    let withFill = [...pkg];
    for (let k = 0; k < 2; k++) {
      // fillers are players: a pick's id can equal a player's
      const used = new Set(withFill.filter((a) => a.kind === 'p').map((a) => a.id));
      const usedAi = withFill.reduce((a, x) => a + x.ai, 0);
      const f = fillers.find((x) => !used.has(x.id) && usedAi + x.ai <= budget);
      if (!f || withFill.filter((a) => a.kind === 'p').length >= maxPlayersIn) break;
      withFill = [...withFill, f];
      consider(withFill);
    }
  }
  const b = best as { pkg: Asset[]; mine: number } | null;
  return b ? { tid, offer: offerOf(b.pkg), myValue: b.mine, giveValue } : null;
}

/**
 * A deal in neutral (league) value from one side's point of view: what it receives less what it
 * sends, the bigger half's extra players and a pile of incoming picks counting for less, as the AI
 * counts them. The AI's offers to the user are held to it, so none of them is a fleecing.
 */
export function neutralBalance(league: League, offer: TradeOffer, side: 'a' | 'b' = 'a'): { net: number; out: number } {
  const mine = offer[side];
  const other = offer[side === 'a' ? 'b' : 'a'];
  const players = (s: TradeSide, depth: boolean) =>
    weighted(
      s.pids.flatMap((pid) => (league.players[pid] ? [tradeValue(league, league.players[pid], 'retool')] : [])),
      depth ? DEPTH : null,
    );
  // picks as they'd go (with their protections) and swap rights count together; cash at face value
  const picks = (s: TradeSide, to: number, incoming: boolean) =>
    weighted(
      [
        ...s.dpids.flatMap((d) => {
          const dp = findPick(league, d);
          return dp ? [pickValue(league, judgedPick(dp, s, to, incoming))] : [];
        }),
        ...(s.swaps ?? []).flatMap((y) => {
          const sp = swapPicks(league, s.tid, to, y);
          return sp ? [swapOutlook(league, sp.right, sp.subject).gain] : [];
        }),
      ],
      incoming ? PICK_DEPTH : null,
    );
  const cash = (s: TradeSide) => ((s.cash ?? 0) > 0 ? cashValue(league, s.cash!) : 0);
  const inc = players(other, other.pids.length > mine.pids.length) + picks(other, mine.tid, true) + cash(other);
  const out = players(mine, mine.pids.length > other.pids.length) + picks(mine, other.tid, false) + cash(mine);
  return { net: inc - out, out };
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

/**
 * A team's chance of an AI-to-AI deal attempt today, and how many it gets: deals cluster toward the
 * deadline (9% a day early, 15% in the last three weeks, 30% in the last week and three tries at
 * 40% on deadline day): about 13 attempts a season, as when the chance was a flat 12%.
 */
export function aiTradeChance(league: League): { p: number; attempts: number } {
  const left = league.tradeDeadlineDay - league.day;
  if (left <= 0) return { p: 0.4, attempts: 3 };
  return { p: left < 7 ? 0.3 : left < 21 ? 0.15 : 0.09, attempts: 1 };
}

/**
 * Players a team will move to a contender: a rebuilder's veterans (27 or older, 74+), and anyone
 * who asked out (72+) on any team. Only players the rules let move.
 */
function sellable(league: League, tid: number): Player[] {
  const rebuilding = league.teams[tid].strategy === 'rebuild';
  return standardRoster(league, tid).filter((p) => (p.mood.tradeRequest ? p.ovr >= 72 : rebuilding && league.season - p.bornYear >= 27 && p.ovr >= 74) && !untradeable(league, p));
}

/**
 * AI-to-AI deals (a few a season, most near the deadline): contenders buy rebuilding teams'
 * veterans and other teams' players who asked out. The buyer matches salary first (without sending
 * an over-the-cap seller more than it can take back, or taking its own payroll past the tax after
 * using the mid-level), then adds its two most valuable young players and picks from the cheapest
 * up (three at most, so better ones replace the cheapest; two firsts at most) until the seller
 * agrees, and the deal only goes through if the buyer likes it too. Only assets the rules let move
 * are offered. Up to three players are tried.
 */
export function aiToAiTrade(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  const { p, attempts } = aiTradeChance(league);
  for (let i = 0; i < attempts; i++) if (rng.chance(p)) aiTradeAttempt(league, rng);
}

function aiTradeAttempt(league: League, rng: Rng) {
  const ai = league.teams.filter((t) => t.tid !== league.userTid);
  const sellers = ai.filter((t) => t.strategy === 'rebuild' || standardRoster(league, t.tid).some((p) => p.mood.tradeRequest));
  const s = sellers.length ? rng.pick(sellers) : undefined;
  const buyers = ai.filter((t) => t.strategy === 'contend' && t !== s);
  if (!s || !buyers.length) return;
  const b = rng.pick(buyers);
  for (const vet of rng.shuffle(sellable(league, s.tid)).slice(0, 3)) {
    const deal = aiPackage(league, b.tid, s.tid, vet);
    if (deal) {
      executeTrade(league, deal);
      return;
    }
  }
}

export interface BlockRumor {
  tid: number;
  pid: number;
  /** Contenders with a deal for him the seller would take. */
  suitors: number[];
}

/**
 * Who AI teams are shopping before the deadline: each seller's best player it would move (see
 * sellable), best first, with the contenders that have a package the seller would take for him
 * (as aiToAiTrade builds them), up to three of each.
 */
export function onTheBlock(league: League, max = 3): BlockRumor[] {
  if (tradingClosedReason(league)) return [];
  return withHoldsMemo(() => {
    const cands = league.teams
      .filter((t) => t.tid !== league.userTid)
      .flatMap((t) => sellable(league, t.tid).map((p) => ({ tid: t.tid, p })))
      .sort((x, y) => y.p.ovr - x.p.ovr || x.p.pid - y.p.pid);
    const seen = new Set<number>();
    const out: BlockRumor[] = [];
    for (const { tid, p } of cands) {
      if (out.length >= max) break;
      if (seen.has(tid)) continue;
      seen.add(tid);
      const suitors = league.teams.filter((b) => b.tid !== tid && b.tid !== league.userTid && b.strategy === 'contend' && aiPackage(league, b.tid, tid, p)).map((b) => b.tid);
      out.push({ tid, pid: p.pid, suitors: suitors.slice(0, 3) });
    }
    return out;
  });
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
  // mid-level or the bi-annual enough that the deal doesn't take it past the tax (as validateTrade
  // has it: one already past it only can't add salary): the smallest contract that covers the gap,
  // else the biggest and keep going
  const s = contractSeason(league);
  const taxGap = () => {
    if (!taxCapped(league.teams[buyer], s)) return 0;
    const net = sal(vet) - pkg.reduce((a, p) => a + sal(p), 0);
    return Math.min(net, capPayroll(league, buyer, s) + net - CAP_FOR(league, s).luxuryTax);
  };
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
      // three picks at most: past that the cheapest one in makes way for this better one (else
      // three second-rounders would be as far as an offer ever got)
      const out = dps.length >= MAX_PICKS_OUT ? dps[0] : null;
      if (x.round === 1 && dps.filter((d) => d !== out && d.round === 1).length >= MAX_FIRSTS_OUT) continue;
      if (out) dps.shift();
      dps.push(x);
      // the Stepien rule: not if it leaves the buyer without a first in back-to-back drafts
      if (stepienError(league, offer(), offer().a)) {
        dps.pop();
        if (out) dps.unshift(out);
      }
    } else if (pkg.length < maxPkg && sellerFits(x)) pkg.push(x);
  }
  const deal = offer();
  return !validateTrade(league, deal).length && teamAccepts(league, deal, seller) && teamAccepts(league, deal, buyer) ? deal : null;
}
