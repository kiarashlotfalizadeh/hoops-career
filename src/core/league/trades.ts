// Trades: a deal and what it's worth. Validation (roster size, 125% salary matching when over the
// cap, the Stepien rule), AI valuation with team strategy, deal terms
// (protections, swaps, cash), the reasons behind a verdict, and carrying a deal out. Around it:
// tradeHelp.ts ("what would make this work?", counter-offers), tradeFinder.ts (value tiers and
// targets), tradePackages.ts (the best package for the user's assets), aiTrades.ts (AI front
// offices and AI-to-AI deals); the AI's offers to the user are in proposals.ts.

import { gmStyle } from './voices';
import type { DraftPick, League, Player, TeamSeason } from '../types';
import { CAP, seasonLabel } from '../constants';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import {
  CAP_FOR,
  contractSeason,
  addNews,
  andList,
  curTeamSeason,
  sentence,
  dateToDay,
  fmtDate,
  inSeason,
  payroll,
  playerName,
  prospects,
  revenueScale,
  rosterMaxNow,
  standardRoster,
  teamCity,
} from './helpers';
import {
  type Strategy,
  FIRST_VALUE,
  contractBurden,
  leaveTeam,
  marketSalary,
  pendingOption,
  releaseDeadMoney,
  releasePlayer,
  rookieContract,
  salaryForScore,
  summerRoster,
  tradeValue,
  valueParts,
  valueScore,
} from './contracts';
import { teamTaxBill } from './finances';
import { numberTeam } from './jerseys';
import { logTrade } from './transactions';
import { wantsOut } from './pulse';
import { leagueBoard, revealOutlook } from './prospects';
import { money, moneyExact } from '../format';
import { Rng, hashString, mix32 } from '../random';
import { type PickProjection, pickProjection } from '../analysis/odds';

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

/**
 * One leg of a deal: what team `tid` sends to team `to`. A two-team offer is two legs (a to b, b to
 * a); a three-team deal has up to six. Every rule and every team's verdict reads a deal as its legs,
 * so a team's side of a deal is everything it sends, to anyone, against everything it gets, from anyone.
 */
export interface TradeLeg extends TradeSide {
  to: number;
}

/** A two-team offer as its legs. */
export const legsOf = (offer: TradeOffer): TradeLeg[] => [
  { ...offer.a, to: offer.b.tid },
  { ...offer.b, to: offer.a.tid },
];

/** The teams in a deal, in the order its legs name them. */
export const dealTeams = (legs: TradeLeg[]): number[] => [...new Set(legs.flatMap((l) => [l.tid, l.to]))];

/** Does a leg move anything? */
const moves = (l: TradeSide) => l.pids.length > 0 || l.dpids.length > 0 || (l.swaps?.length ?? 0) > 0 || (l.cash ?? 0) > 0;

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
  /** The sending team's cornerstone (see cornerstoneOf): it counts CORNERSTONE times as much going out. */
  cornerstone?: boolean;
  /** He has asked the sending team for a trade: he counts WANTS_OUT times as much going out. */
  wantsOut?: boolean;
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
  /** What its front office wants on top of an even deal, by its temper (league/voices.ts): counted in what it sends. */
  ask: number;
  /** Value of the luxury tax and cap room the deal costs (negative: what it saves, at most `reliefCap`'s). */
  money: number;
  /** What the salary relief would have counted for, uncapped, when it was held to what dumping that salary costs (`dump`, see reliefCap) or, with the user, to a discount on the good players sent (`discount`, see userReliefCap). */
  reliefFull?: number;
  reliefKind?: 'dump' | 'discount';
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
  /** More players coming in than going out, so each extra one counts for less; `depthLoss` is the value that took off. */
  depthApplied: boolean;
  depthLoss: number;
  /** Incoming assets that changed hands this season: face value only. */
  flippedIn: AssetView[];
  tooManyFirsts: boolean;
}

export const findPick = (league: League, dpid: number) => league.draftPicks.find((d) => d.dpid === dpid);

// ---------------------------------------------------------------- draft pick value

/**
 * Expected score of the player taken at overall slot `k` (1-60) of a class nobody has seen yet:
 * fitted to what a class's picks are priced at on draft night (see classTakes; over 56 simulated
 * drafts, #1 about 55, #15 about 15, #30 about 6), so a pick doesn't jump or drop when its class
 * arrives. The curve before it priced the first pick of a later class at 75, as an 88 read.
 */
const futureSlotScore = (k: number) => 83.5 - 1.9 * Math.log(k) - 0.22 * (k - 1);

const classCache = new WeakMap<League, { key: string; takes: { v: number; market: number }[] }>();

/** Drafts of the rest of the class the league's expectation averages over (see classTakes). */
const TAKE_DRAWS = 200;
/** A team's whim on the night and its nudge toward need, one standard deviation on the draft score (draft.ts's DRAFT_NOISE and draftScore's need). */
const TAKE_WHIM = Math.hypot(0.8, 0.7);
/** How much a team's pick leans toward the room's board, a place on it (draftScore's lean toward the consensus rank). */
const TAKE_LEAN = 0.04;

const drawCache = new WeakMap<League, Map<number, Float64Array>>();

/** A prospect's place on each draw's board for the night (see classTakes), a standard normal a draw: the same all season. */
function takeDraws(league: League, pid: number): Float64Array {
  let by = drawCache.get(league);
  if (!by) drawCache.set(league, (by = new Map()));
  let z = by.get(pid);
  if (!z) {
    const rng = new Rng(mix32(hashString(`${league.id}:take:${pid}`)));
    z = Float64Array.from({ length: TAKE_DRAWS }, () => rng.normal(0, 1));
    by.set(pid, z);
  }
  return z;
}

/**
 * This season's draft as the league expects it to go, from the next pick on: what the player taken
 * with each is worth, his trade value and market salary, once draft night shows his ratings. Each
 * team takes the best on its own board, which strays from the league's (leagueBoard) by as much as
 * the boards do from one another, plus its whim and its needs, so the n-th pick gets about the n-th
 * prospect on the boards and now and then one further down; what he turns out to be is what the
 * boards' read lets the league expect (see revealOutlook). A prospect who slides keeps the picks
 * after him worth what he is. Priced at the best prospect left by the room's read instead, every
 * pick on the clock was worth 1.3-1.6 times the player it became, flat for picks on end where the
 * room's best went untaken (front-office review, round 3): a team sold its pick on the clock and
 * bought the player back cheaper.
 */
function classTakes(league: League): { v: number; market: number }[] {
  const key = `${league.season}:${league.phase}:${league.day}:${league.draftPicks.length}`;
  const hit = classCache.get(league);
  if (hit?.key === key) return hit.takes;
  const { reads, prior } = leagueBoard(league, league.season);
  const items = prospects(league, league.season).map((p) => {
    const r = reads.get(p.pid)!;
    let v = 0;
    let market = 0;
    for (const [q, w] of revealOutlook(p, r, prior)) {
      v += w * Math.exp((valueScore(league, q) - 60) / 6);
      market += w * marketSalary(league, q);
    }
    // where the boards have him, leaning toward his place on the room's: a team's pick strays from
    // it by as much as the boards do from one another, and by its whim
    return { pid: p.pid, v, market, board: r.score - TAKE_LEAN * (p.prospect?.rank ?? 50), sd: Math.hypot(r.spread, TAKE_WHIM) };
  });
  const n = Math.min(items.length, 2 * league.teams.length);
  const takes = Array.from({ length: n }, () => ({ v: 0, market: 0 }));
  const z = items.map((x) => takeDraws(league, x.pid));
  for (let d = 0; d < TAKE_DRAWS; d++) {
    // one board for the night a draw, each prospect's place on it a fixed draw (so a pick made
    // takes him out of every draw and leaves the rest where they were)
    const night = items.map((x, i) => ({ x, s: x.board + x.sd * z[i][d] })).sort((a, b) => b.s - a.s);
    for (let j = 0; j < n; j++) {
      takes[j].v += night[j].x.v / TAKE_DRAWS;
      takes[j].market += night[j].x.market / TAKE_DRAWS;
    }
  }
  classCache.set(league, { key, takes });
  return takes;
}

/** Where a pick may land in its round, as its value projects it, and what each slot is worth. */
interface Outlook {
  /** Weight of each slot of the round (index: slot - 1), and their sum; one slot once the order is set. */
  w: number[];
  sum: number;
  /** What the player taken at slot `k` of the round is worth in a trade today. */
  at: (k: number) => number;
  /** Its value under each top-N protection (see ownValue), kept as asked for while the outlook is cached. */
  own?: Map<number, number>;
}

/**
 * Outlooks of picks whose slot isn't set, by draft, round and the record they're projected from:
 * kept for a day, a phase and a class as classProspects keeps it (the slots' values depend on
 * nothing else), so a deal search prices each pick once instead of on every look.
 */
const outlookCache = new WeakMap<League, { key: string; proj: PickProjection; byPick: Map<string, Outlook> }>();

/** How much of a team's projected place in the standings carries into each later draft (the rest regresses to the middle): NBA records keep about this much from one season to the next. */
const PLACE_KEEP = 0.75;

/**
 * A pick's outlook: what the player taken there would be worth once drafted, his rookie-scale
 * surplus included (in this season's class the player the boards would take there, see
 * classTakes; in later classes the player a slot usually brings), discounted by the time to its
 * draft: up to 15% over the last year (who will be there, and how he turns out) and 7% for each
 * year before that. Unknown slots come from the original team's projected strength (see
 * pickProjection): in the next draft to be ordered, its chance at each slot, the lottery's draw
 * included; in a later one, a spread of outcomes around its expected place regressed toward the
 * middle (PLACE_KEEP a season), wider each year out. On opening night every first used to be priced at the middle's value (the record of
 * 0-0 projected .500), so the worst team's first sold for a contender's.
 */
function outlook(league: League, dp: DraftPick): Outlook {
  const yearsOut = dp.season - league.season;
  const cls = yearsOut === 0 ? classTakes(league) : [];
  const years = Math.max(0, yearsOut + (dateToDay(league.season, 5, 25) - league.day) / 365);
  const discount = years <= 1 ? 1 - 0.15 * years : 0.85 * Math.pow(0.93, years - 1);
  const known = dp.pick !== undefined;
  const slot = (inRound: number) => {
    const overall = (dp.round - 1) * 30 + inRound;
    // during the draft: the picks still to be made before it
    const idx = known ? league.draftPicks.filter((d) => d.season === dp.season && d.pick !== undefined && (d.round - 1) * 30 + d.pick < overall).length : overall - 1;
    const p = cls[idx] ?? { v: Math.exp((futureSlotScore(overall) - 60) / 6), market: salaryForScore(league, futureSlotScore(overall), 0) };
    const rookie = rookieContract(league, inRound, dp.round, league.season + 1);
    const surplus = rookie.salaries.reduce((a, sal) => a + (p.market - sal) / 1000, 0);
    return Math.max(0, p.v + surplus * 0.1) * discount;
  };
  if (known) {
    const w = Array.from({ length: Math.max(30, dp.pick!) }, (_, i) => (i === dp.pick! - 1 ? 1 : 0));
    return { w, sum: 1, at: slot };
  }
  const proj = pickProjection(league);
  // (classProspects' key: one class per entry; the projection's own key moves with every game and roster move)
  const key = `${league.season}:${league.phase}:${league.day}:${league.draftPicks.length}`;
  let hit = outlookCache.get(league);
  if (hit?.key !== key || hit.proj !== proj) outlookCache.set(league, (hit = { key, proj, byPick: new Map() }));
  const pickKey = `${dp.season}:${dp.round}:${dp.originalTid}`;
  const cached = hit.byPick.get(pickKey);
  if (cached) return cached;
  const values: number[] = [];
  const at = (k: number) => (values[k - 1] ??= slot(k));
  const n = league.teams.length;
  let w: number[];
  if (dp.season === proj.season) w = (dp.round === 1 ? proj.first : proj.second)[dp.originalTid].slice();
  else {
    // a later draft: the expected place now, regressing toward the middle a season at a time
    const out = Math.max(1, dp.season - proj.season);
    const keep = Math.pow(PLACE_KEEP, out);
    const center = proj.rank[dp.originalTid] * keep + ((n + 1) / 2) * (1 - keep);
    const sd = 5 + 2 * out;
    w = Array.from({ length: n }, (_, i) => Math.exp(-((i + 1 - center) ** 2) / (2 * sd * sd)));
  }
  const sum = w.reduce((a, x) => a + x, 0) || 1;
  const o = { w, sum, at, own: new Map<number, number>() };
  hit.byPick.set(pickKey, o);
  return o;
}

/** The protection a pick carries for its holder: top-N, or 0 (back with its original team it has nothing to protect). */
const protectionOf = (dp: DraftPick) => (dp.protection && dp.tid !== dp.originalTid ? dp.protection : 0);

/** A pick's value without any swap riding on it: a top-`prot` protected pick is worth nothing in the slots where it would stay home. */
function ownValue(league: League, dp: DraftPick, prot = protectionOf(dp)): number {
  const o = outlook(league, dp);
  if (dp.pick !== undefined) return dp.pick <= prot ? 0 : o.at(dp.pick);
  const hit = o.own?.get(prot);
  if (hit !== undefined) return hit;
  let total = 0;
  for (let k = 1; k <= 30; k++) if (k > prot) total += o.w[k - 1] * o.at(k);
  const value = total / o.sum;
  o.own?.set(prot, value);
  return value;
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
 * on the clock is worth what the player the boards would take with it can be expected to be. A
 * top-N protected pick held by another team is worth nothing in the slots where it would stay home.
 * A swap riding on a first moves value between the two picks: the one holding the right is worth
 * what the swap is expected to gain it, the one subject to it that much less (a team holding both
 * is worth the two picks).
 */
export function pickValue(league: League, dp: DraftPick): number {
  const base = ownValue(league, dp);
  if (dp.round !== 1) return base;
  const other = dp.swap !== undefined ? findPick(league, dp.swap) : undefined;
  const holder = swapHolder(league, dp);
  if (!other && !holder) return base;
  return base + (other ? swapOutlook(league, dp, other).gain : 0) - (holder ? swapOutlook(league, holder, dp).gain : 0);
}

/** Share of a pick's projected outcomes its range leaves out at each end (see pickRange): the range holds it three times in five. */
const RANGE_TAIL = 0.2;

/**
 * Where a pick projects, by the same slot chances that price it (see outlook): its overall numbers
 * from the 20th to the 80th percentile (`lo`-`hi`, "proj. #6-12") and the expected one (`mean`,
 * for ordering). Null once its slot is set: its name carries the number.
 */
export function pickRange(league: League, dp: DraftPick): { lo: number; hi: number; mean: number } | null {
  if (dp.pick !== undefined) return null;
  const o = outlook(league, dp);
  const base = (dp.round - 1) * league.teams.length;
  let acc = 0;
  let lo = 0;
  let hi = 0;
  let mean = 0;
  o.w.forEach((w, i) => {
    const p = w / o.sum;
    mean += p * (i + 1);
    if (!lo && acc + p > RANGE_TAIL) lo = i + 1;
    acc += p;
    if (!hi && acc >= 1 - RANGE_TAIL) hi = i + 1;
  });
  return { lo: base + (lo || 1), hi: base + (hi || o.w.length), mean: base + mean };
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
export const judgedPick = (dp: DraftPick, side: TradeSide, to: number, incoming: boolean) => (!incoming && to === dp.originalTid ? dp : dealPick(dp, side, to));

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
        short: `Top-${n} protection: stays ${yours ? 'yours' : 'theirs'} about ${pct(odds)} of the time · ${yours ? `${ab(judge)} count it ${pct(cut)} lower` : `${pct(cut)} less for ${ab(judge)} to give up`}`,
        text: `Top-${n} protection: ${whose} ${dp.season} 1st stays ${yours ? 'yours' : 'theirs'} if it lands in the top ${n}, and then nothing is owed. That's about ${pct(odds)} likely today. ${
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
        short: `${y} swap: used about ${pct(odds)} of the time · ${yours ? `worth ${pct(share)} of your pick to ${ab(other.tid)}` : `costs ${ab(side.tid)} ${pct(share)} of their pick`}`,
        text: yours
          ? `${y} swap: ${ab(other.tid)} may take your ${y} 1st for theirs if yours lands higher. That's about ${pct(odds)} likely today. It's worth about ${pct(share)} of your pick to them.`
          : `${y} swap: you may take ${ab(side.tid)}'s ${y} 1st for yours if theirs lands higher. That's about ${pct(odds)} likely today. It costs them about ${pct(share)} of their pick.`,
      });
    }
    const c = side.cash ?? 0;
    if (c > 0) {
      const room = cashRoom(league, side.tid).send - c;
      out.push({
        key: 'cash',
        short: yours
          ? `${moneyExact(c)} cash: not salary, off your profit · ${room > 0 ? `${moneyExact(room)} more allowed` : 'no more allowed'} for ${seasonLabel(contractSeason(league))}`
          : `${moneyExact(c)} cash from ${ab(side.tid)}: not salary, onto your profit`,
        text: yours
          ? `${moneyExact(c)} in cash to ${ab(other.tid)}. It isn't salary, so no matching and no cap, and it comes out of your profit. ${room > 0 ? `${moneyExact(room)} more is allowed` : "That's the most allowed"} for ${seasonLabel(contractSeason(league))}.`
          : `${moneyExact(c)} in cash from ${ab(side.tid)}. It isn't salary, so no matching and no cap, and it adds to your profit.`,
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
/** A star, to a front office that pays up for one (OVR), and the seasons after which a player is one of its own (see GmStyle). */
const GM_STAR = 86;
const GM_CORE_SEASONS = 3;

function lens(own: number, neutral: number, incoming: boolean, aiDeal: boolean) {
  const band = 0.15 * Math.abs(neutral);
  return incoming ? Math.min(own, neutral + band) : Math.max(own, neutral - (aiDeal ? band : 0));
}

export const flipped = (league: League, a: Player | DraftPick) => a.tradedFrom?.season === league.season;

/** Did team `tid` trade this player or pick away this season? Then it can't take him (or it) back until next season. */
export function tradedAwayBy(league: League, a: Player | DraftPick, tid: number): boolean {
  const t = a.tradedFrom;
  return t?.season === league.season && (t.tid === tid || !!t.also?.includes(tid));
}

/** `tid` trades it away now: remembered along with the teams that already traded it away this season. */
function tradedAway(league: League, a: Player | DraftPick, tid: number): NonNullable<Player['tradedFrom']> {
  const t = a.tradedFrom;
  const also = t?.season === league.season ? [t.tid, ...(t.also ?? [])].filter((x) => x !== tid) : [];
  return also.length ? { tid, season: league.season, also, day: league.day } : { tid, season: league.season, day: league.day };
}

/**
 * What a team's cornerstone counts for going out, over what he'd count for otherwise: a team builds
 * around its franchise player, and a few good players don't replace him. With depth only discounted
 * (see DEPTH), Minnesota took Ty Jerome, Cam Spencer and Cameron Boozer for Anthony Edwards (round-2
 * front-office review).
 */
export const CORNERSTONE = 1.3;
/**
 * What a player who has asked for a trade (pulse.ts) counts for going out, to the team he asked: it
 * has to move him and everyone knows it. He is nobody's cornerstone while the request stands.
 */
export const WANTS_OUT = 0.9;
/** A cornerstone is 26 or younger and worth this much (see cornerstoneOf). */
const CORNERSTONE_VALUE = 82;

const cornerCache = new WeakMap<League, { key: string; by: Map<number, number | null> }>();

/** A team's cornerstone: its most valuable player, when he is 26 or younger and worth 82+; null when it has none. */
export function cornerstoneOf(league: League, tid: number): number | null {
  const key = `${league.season}:${league.phase}:${league.day}:${league.nextTxnId ?? 0}`;
  let hit = cornerCache.get(league);
  if (hit?.key !== key) cornerCache.set(league, (hit = { key, by: new Map() }));
  if (hit.by.has(tid)) return hit.by.get(tid)!;
  const best = standardRoster(league, tid).sort((a, b) => valueScore(league, b) - valueScore(league, a) || a.pid - b.pid)[0];
  const pid = best && playerAge(best, league.season) <= 26 && valueScore(league, best) >= CORNERSTONE_VALUE ? best.pid : null;
  hit.by.set(tid, pid);
  return pid;
}

/**
 * Deadline fever: in the last `days` days up to the deadline (its day included), a front office with
 * the temper for it (voices.ts's `fever`: a gunslinger, a tinkerer) goes past an even deal among AI
 * teams for a trade that brings it the deal's best player, one of `ovr` or better: the players
 * contenders are after. So deadline week now and then lands a deal nobody would make in December.
 */
export const FEVER = { days: 5, ovr: 80 };

/** What team `tid` gives past even in this deal for the deadline's sake (a share of what it sends): see FEVER. */
export function deadlineFever(league: League, tid: number, inPids: number[], outPids: number[]): number {
  const left = league.tradeDeadlineDay - league.day;
  if (league.phase !== 'regular' || left < 0 || left >= FEVER.days || tid === league.userTid) return 0;
  const fever = gmStyle(league, tid).fever;
  if (!fever) return 0;
  const best = (pids: number[]) => pids.reduce((a, pid) => Math.max(a, league.players[pid]?.ovr ?? 0), 0);
  const got = best(inPids);
  return got >= FEVER.ovr && got > best(outPids) ? fever : 0;
}

/**
 * What an AI team asks the user for an old star, at least: STAR_MARKET of what a contender would pay
 * for him (its lens counts what he does now over his age), for a player rated STAR_FROM + STAR_RAMP
 * or more, ramping in from STAR_FROM, and 30 or older (in full from 32). Its own lens or the league's neutral value alone priced an old
 * star by his age and his expiring deal: a 33-year-old 90 in his last season went for 121 to a team
 * that valued him at 190, three firsts' worth less than a 30-year-old 90, and his team "would jump
 * at" a lesser, younger star for him (the playtest, 2026-11-23). There is one user and a league of
 * contenders: the price of a star who helps now is what the best of them would pay, not what a
 * seller with no use for him would take.
 */
export const STAR_MARKET = 0.85;
const STAR_FROM = 84;
const STAR_RAMP = 4;
/** ...and from this age, in full STAR_OLD_RAMP years on: the age his value starts to be discounted for (contracts.ts valueScore). */
const STAR_OLD = 29;
const STAR_OLD_RAMP = 3;

function starMarket(league: League, p: Player, neutral: number): number {
  // (an old star's: a contender's lens and the league's agree on a player in his prime, give or take
  // its small premium for anyone who helps now, and an even one-for-one of two of those stays one)
  const old = Math.min(1, Math.max(0, (playerAge(p, league.season) - STAR_OLD) / STAR_OLD_RAMP));
  const share = Math.min(1, Math.max(0, (p.ovr - STAR_FROM) / STAR_RAMP)) * old;
  if (share <= 0) return -Infinity;
  const market = STAR_MARKET * tradeValue(league, p, 'contend');
  return market > neutral ? neutral + share * (market - neutral) : -Infinity;
}

/** A player as team `tid` sees him in a deal (with the user unless `aiDeal`). */
function playerView(league: League, p: Player, tid: number, incoming: boolean, aiDeal: boolean): AssetView {
  const neutral = tradeValue(league, p, 'retool');
  const strategy = league.teams[tid].strategy;
  // (its front office's own way of doing business: a gunslinger pays up for a star, a loyalist
  // hates to move a player who has been his for years: league/voices.ts. The user's team has none,
  // and the lens below still holds every team to the same band around the league's value)
  const gm = tid === league.userTid ? null : gmStyle(league, tid);
  const bias = !gm ? 1 : incoming ? (p.ovr >= GM_STAR ? gm.star : 1) : p.tid === tid && league.season - p.joinedSeason >= GM_CORE_SEASONS ? gm.ownCore : 1;
  const base = strategy === 'retool' ? neutral : tradeValue(league, p, strategy);
  const own = base > 0 ? base * bias : base;
  const f = flipped(league, p);
  let value = f ? neutral : lens(own, neutral, incoming, aiDeal);
  // (a star it sends the user is priced at what a contender would pay for him: see STAR_MARKET)
  if (!incoming && !aiDeal && !f && p.tid === tid) value = Math.max(value, starMarket(league, p, neutral));
  // (he asked out: it has to move him, see WANTS_OUT)
  if (!incoming && value > 0 && p.tid === tid && wantsOut(league, p)) return { kind: 'player', id: p.pid, value: value * WANTS_OUT, neutral, own, flipped: f, wantsOut: true };
  // (its cornerstone going out counts for more: see CORNERSTONE)
  if (!incoming && value > 0 && p.tid === tid && cornerstoneOf(league, tid) === p.pid)
    return { kind: 'player', id: p.pid, value: value * CORNERSTONE, neutral, own, flipped: f, cornerstone: true };
  return { kind: 'player', id: p.pid, value, neutral, own, flipped: f };
}

/**
 * What a first-round pick counts for in a deal with the user, over the player it's expected to
 * become: both ways, the picks he sends and the ones he's sent, so nothing can be run in a circle
 * for value. A pick priced at its expected player alone put a late first level with a 74 (a 13th
 * man in this league's ratings) where the NBA's market pays a rotation player for one (a 77-78: 1.7
 * times that here; a mid first a low-end starter, 1.6): a 64-win contender's four firsts bought
 * nothing better than a 79, and "trade picks for help" was a dead lever (the playtest's contender,
 * 2026-11-24: four firsts 37 against an 81 at 41 to a rebuilding seller; now 55). Not a pick on the
 * clock in the draft under way: there it is the player. Among AI teams picks stay at 1, the market
 * their deals were measured on.
 */
export const FIRST_MARKET = 1.5;
/** A pick's value on the user's market: pickValue, a first at FIRST_MARKET (what every team counts it for in a deal with him). */
export const marketPickValue = (league: League, dp: DraftPick) => pickValue(league, dp) * (firstOnMarket(league, dp) ? FIRST_MARKET : 1);
const firstOnMarket = (league: League, dp: DraftPick) => dp.round === 1 && !(league.phase === 'draft' && dp.season === league.season && dp.pick !== undefined);

/** A draft pick as team `tid` sees it in a deal (with the user unless `aiDeal`). */
function pickView(league: League, dp: DraftPick, tid: number, incoming: boolean, aiDeal: boolean): AssetView {
  const neutral = aiDeal ? pickValue(league, dp) : marketPickValue(league, dp);
  // (a pick hoarder's own picks are worth more to him going out: league/voices.ts)
  const gm = tid === league.userTid || incoming || dp.originalTid !== tid ? 1 : gmStyle(league, tid).ownPick;
  const own = neutral * PICK_LENS[league.teams[tid].strategy] * gm;
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
export const DEPTH = [1, 0.7, 0.5, 0.35, 0.25];
/** A pile of incoming picks is worth less than the sum of its parts. */
export const PICK_DEPTH = [1, 0.8, 0.65, 0.5, 0.4];
/**
 * ...but less so to a rebuilding team dealing with the user, whose currency picks are: it sells for
 * the pile. With one discount for everyone, five of a 42-12 contender's own firsts were worth 38 to
 * a 17-35 seller (11, 9, 8, 6, 4): no pile of picks bought more than a role player, and a contender
 * could only pay with its rotation (the playtest, 2026-11-23). Now 44. Among AI teams the one
 * discount stays: with the flatter one a rebuilder hoarded picks past its roster (23 players under
 * contract on draft night, the invariants run found).
 */
const PICK_DEPTH_REBUILD = [1, 0.9, 0.8, 0.7, 0.6];
/** The pile discount a team applies to the picks coming to it (see PICK_DEPTH). */
export const pickDepth = (league: League, tid: number) => (league.teams[tid]?.strategy === 'rebuild' ? PICK_DEPTH_REBUILD : PICK_DEPTH);

export function weighted(values: number[], weights: number[] | null): number {
  return [...values].sort((a, b) => b - a).reduce((a, v, i) => a + (weights && v > 0 ? v * weights[Math.min(i, weights.length - 1)] : v), 0);
}

/** AI teams never send out more than this many first-round picks in one deal. */
export const MAX_FIRSTS_OUT = 2;

/**
 * Trade value per $1M of luxury tax a deal adds (or saves), and of cap room it uses up (or frees),
 * by strategy: a team out of contention minds the tax most (it buys no wins), and a rebuilder keeps
 * its room for the dumps it takes picks for.
 */
const TAX_VALUE: Record<Strategy, number> = { contend: 0.5, retool: 0.75, rebuild: 1 };
const ROOM_VALUE: Record<Strategy, number> = { contend: 0.02, retool: 0.04, rebuild: 0.1 };
/**
 * Crossing the tax line costs more than the tax itself: a team under it shares in the league's tax
 * pot (see assessLuxuryTax), so a deal that takes a team over (or back under) moves about 5% of the
 * cap besides, valued like the tax.
 */
const TAX_LINE_SHARE = 0.05;

/** A player's salary as a trade counts it (0 for one who is gone). */
export function capSalary(league: League, pid: number, s = contractSeason(league)): number {
  const p = league.players[pid];
  return p ? salaryFor(p, s) : 0;
}

/**
 * Next season's luxury tax a deal adds (or saves) counts at this share of this season's: a contract
 * that runs on keeps a team in the tax next season too unless it sheds salary over the summer, which
 * it has a summer to do (and the bill is a year off).
 */
const NEXT_TAX_WEIGHT = 0.5;

/** Committed payroll per team for next season, kept for a day and a roster move (see moneyCost). */
const nextPayCache = new WeakMap<League, { key: string; pay: Map<number, number> }>();

function nextPayroll(league: League, tid: number, s: number): number {
  const key = `${league.season}:${league.phase}:${league.day}:${league.nextTxnId ?? 0}`;
  let hit = nextPayCache.get(league);
  if (hit?.key !== key) nextPayCache.set(league, (hit = { key, pay: new Map() }));
  let pay = hit.pay.get(tid);
  if (pay === undefined) hit.pay.set(tid, (pay = payroll(league, tid, s)));
  return pay;
}

/**
 * What a deal's salary does to a team's books: the value of the luxury tax (its progressive
 * brackets, a repeater's included) and cap room it adds (or saves), the tax line crossed either
 * way, and the dollars behind it. A contract running past this season adds next season's tax on the
 * team's committed payroll then, at NEXT_TAX_WEIGHT: a burden is dearer to a team it keeps in the tax.
 */
function moneyCost(
  league: League,
  tid: number,
  inSal: number,
  outSal: number,
  inNext = 0,
  outNext = 0,
): { value: number; lines: number; payBefore: number; payAfter: number; taxCost: number } {
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  const before = payroll(league, tid, s);
  const after = before + inSal - outSal;
  const tax = (x: number) => teamTaxBill(league, tid, x, s);
  const room = (x: number) => Math.max(0, cap.salaryCap - x);
  const taxCost = tax(after) - tax(before);
  const strategy = league.teams[tid].strategy;
  const line = (cap.salaryCap * TAX_LINE_SHARE * TAX_VALUE[strategy]) / 1000;
  const over = (x: number) => (x > cap.luxuryTax ? line : 0);
  let nextTax = 0;
  if (inNext !== outNext) {
    const next = nextPayroll(league, tid, s + 1);
    // (in next season's money, brought back to this season's as the burden is)
    nextTax = ((teamTaxBill(league, tid, next + inNext - outNext, s + 1) - teamTaxBill(league, tid, next, s + 1)) * revenueScale(league, s)) / revenueScale(league, s + 1);
  }
  return {
    value: ((taxCost + NEXT_TAX_WEIGHT * nextTax) * TAX_VALUE[strategy] + (room(before) - room(after)) * ROOM_VALUE[strategy]) / 1000 + over(after) - over(before),
    lines: over(after) - over(before),
    payBefore: before,
    payAfter: after,
    taxCost,
  };
}

/**
 * Salary relief counts for what it saves a team (its tax, its room), but no more than what
 * shedding that salary costs on the market: the price of a salary dump (a first-round pick per
 * DUMP_PER_FIRST of the cap, see contractBurden, at a neutral lens) on the salary shed this season
 * and, at NEXT_TAX_WEIGHT, next season, as the tax savings count them. A team past the tax still
 * sells a good player at a discount to get under it, as the NBA's do, but not at a fire-sale price:
 * counting its whole tax bill (Orlando saving $48.1M by sending Jalen Suggs out was worth 48 value
 * to it), a team with cap room took an 85-rated 25-year-old for about a third of his value and sold
 * him on at once for three firsts' worth more (the round-2 front-office review).
 */
function reliefCap(league: League, salaryIn: number, salaryOut: number, inNext: number, outNext: number): number {
  const shed = Math.max(0, salaryOut - salaryIn) + NEXT_TAX_WEIGHT * Math.max(0, outNext - inNext);
  return contractBurden(league, shed, 'retool');
}

/**
 * In a deal with the user, relief (all of it: the tax, the room, the lines crossed) counts for no
 * more than the burden of the contracts the team sends (what they're overpaid, see valueParts) and
 * USER_RELIEF_SHARE of the value of the good players it sends: a taxpayer sells the user a good
 * player at a discount, not for what his salary costs it. Priced at the dump rate alone (reliefCap),
 * Miami would still have let a team with room have Bam Adebayo (worth 69) for about 15. Among AI
 * teams the dump rate holds: their dumps are how taxpayers get under the tax.
 */
export const USER_RELIEF_SHARE = 0.25;

function userReliefCap(league: League, pids: number[]): number {
  let burden = 0;
  let good = 0;
  for (const pid of pids) {
    const p = league.players[pid];
    if (!p) continue;
    const v = valueParts(league, p, 'retool');
    burden += v.burden;
    good += Math.max(0, v.player - v.burden);
  }
  return burden + USER_RELIEF_SHARE * good;
}

/** A value in first-round picks, as the dock says it: "half a first", "a first", "two firsts". */
function asFirsts(v: number): string {
  const n = Math.max(0.5, Math.round((v / FIRST_VALUE) * 2) / 2);
  if (n === 0.5) return 'half a first';
  if (n === 1) return 'a first';
  return `${Number.isInteger(n) ? (['two', 'three', 'four', 'five'][n - 2] ?? n) : n} firsts`;
}

/**
 * The value of the players a team would have to waive to get down to 15 (by opening night in the
 * offseason, when a roster can run to 21; at once in season), and how many more it would be: their
 * game (a waived contract's burden is owed as dead money all the same, see valueParts).
 */
function cutCost(league: League, tid: number, out: number[], inc: number[]): { value: number; count: number } {
  const before = tradeRoster(league, tid);
  const after = [...before.filter((p) => !out.includes(p.pid)), ...inc.map((pid) => league.players[pid])];
  if (after.length <= CAP.rosterMax) return { value: 0, count: 0 };
  const strategy = league.teams[tid].strategy;
  const waived = (roster: Player[]) =>
    roster
      .map((p) => Math.max(0, valueParts(league, p, strategy).player))
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
 * and the players it would have to waive) against what it sends.
 */
function judge(league: League, offer: TradeOffer, tid: number): Verdict {
  const mine = offer.a.tid === tid ? offer.a : offer.b;
  const other = mine === offer.a ? offer.b : offer.a;
  const aiDeal = offer.a.tid !== league.userTid && offer.b.tid !== league.userTid;
  return judgeLegs(league, tid, [{ ...other, to: mine.tid }], [{ ...mine, to: other.tid }], aiDeal);
}

/**
 * A team's verdict on a deal read as its legs: everything coming to it (`ins`, from one team or two)
 * against everything it sends (`outs`). A two-team offer is one leg each way.
 */
function judgeLegs(league: League, tid: number, ins: TradeLeg[], outs: TradeLeg[], aiDeal: boolean): Verdict {
  const incoming = ins.flatMap((l) => sideViews(league, l, tid, tid, true, aiDeal));
  const outgoing = outs.flatMap((l) => sideViews(league, l, l.to, tid, false, aiDeal));
  const inPids = ins.flatMap((l) => l.pids);
  const outPids = outs.flatMap((l) => l.pids);
  const outDpids = outs.flatMap((l) => l.dpids);
  const values = (xs: AssetView[], kind: (a: AssetView) => boolean) => xs.filter(kind).map((x) => x.value);
  const isPlayer = (a: AssetView) => a.kind === 'player';
  const isCash = (a: AssetView) => a.kind === 'cash';
  const depthApplied = inPids.length > outPids.length;
  const playersIn = weighted(values(incoming, isPlayer), depthApplied ? DEPTH : null);
  // (a rebuilder's flatter pile discount is the user's to buy with: among themselves AI teams keep the one their market was measured on)
  const picksIn = weighted(values(incoming, pickLike), aiDeal ? PICK_DEPTH : pickDepth(league, tid));
  const playersOut = weighted(values(outgoing, isPlayer), outPids.length > inPids.length ? DEPTH : null);
  const picksOut = weighted(values(outgoing, pickLike), null);
  // cash isn't salary: it neither matches nor counts against the cap, and it adds up dollar for dollar
  const cashIn = values(incoming, isCash).reduce((a, v) => a + v, 0);
  const cashOut = values(outgoing, isCash).reduce((a, v) => a + v, 0);
  const salaryOf = (pids: number[], season = contractSeason(league)) => pids.reduce((a, pid) => a + capSalary(league, pid, season), 0);
  const salaryIn = salaryOf(inPids);
  const salaryOut = salaryOf(outPids);
  const next = contractSeason(league) + 1;
  const inNext = salaryOf(inPids, next);
  const outNext = salaryOf(outPids, next);
  const money = moneyCost(league, tid, salaryIn, salaryOut, inNext, outNext);
  // (the tax and room it saves count up to what shedding that salary costs on the market, see
  // reliefCap; getting back under the tax line counts on top)
  const saved = -(money.value - money.lines);
  const most = saved > 0 ? reliefCap(league, salaryIn, salaryOut, inNext, outNext) : Infinity;
  let reliefFull = saved > most ? -money.value : undefined;
  let reliefKind: VerdictParts['reliefKind'] = reliefFull !== undefined ? 'dump' : undefined;
  if (reliefFull !== undefined) money.value = money.lines - most;
  // (with the user, all of it no more than a discount on the good players it sends: see userReliefCap)
  if (!aiDeal && money.value < 0) {
    const cap = userReliefCap(league, outPids);
    if (-money.value > cap) {
      reliefFull ??= -money.value;
      reliefKind = 'discount';
      money.value = -cap;
    }
  }
  const cut = cutCost(league, tid, outPids, inPids);
  const valueIn = playersIn + picksIn + cashIn - (money.value + cut.value);
  // (what its front office wants beyond an even deal: a shark more, a tinkerer a little less among AI
  // teams; never less than even from the user, so no deal with him can be run in a circle for value)
  // In the deadline's last days a gunslinger or a tinkerer buying the deal's best player gives a little more still (see FEVER).
  const edge = tid === league.userTid ? 0 : aiDeal ? gmStyle(league, tid).edge - deadlineFever(league, tid, inPids, outPids) : Math.max(0, gmStyle(league, tid).edge);
  const sent = playersOut + picksOut + cashOut;
  const ask = edge * Math.abs(sent);
  const valueOut = sent + ask;
  const delta = valueIn - valueOut;
  const tooManyFirsts = outDpids.filter((d) => findPick(league, d)?.round === 1).length > MAX_FIRSTS_OUT;
  const parts: VerdictParts = {
    incoming,
    outgoing,
    playersIn,
    picksIn,
    playersOut,
    picksOut,
    cashIn,
    cashOut,
    ask,
    money: money.value,
    ...(reliefFull !== undefined ? { reliefFull, reliefKind } : {}),
    salaryIn,
    salaryOut,
    payBefore: money.payBefore,
    payAfter: money.payAfter,
    taxCost: money.taxCost,
    cut: cut.value,
    cuts: cut.count,
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

/** How much this team likes the deal (rules aside): what it gets less what it gives, as it sees them; -Infinity for one it won't do at any price (too many firsts out). */
export function teamDelta(league: League, offer: TradeOffer, tid: number): number {
  const v = judge(league, offer, tid);
  return v.tooManyFirsts ? -Infinity : v.delta;
}

/**
 * How much team `tid` likes a deal read as its legs (two teams or three): everything it gets, from
 * anyone, less everything it sends; -Infinity for one it won't do at any price (too many firsts
 * out). The same judge as teamDelta: a deal with the user's team in it is judged as one with him.
 */
export function dealDelta(league: League, legs: TradeLeg[], tid: number): number {
  const v = judgeLegs(
    league,
    tid,
    legs.filter((l) => l.to === tid),
    legs.filter((l) => l.tid === tid),
    !dealTeams(legs).includes(league.userTid),
  );
  return v.tooManyFirsts ? -Infinity : v.delta;
}

/** A deal's legs with one more thing going from `from` to `to` (a new leg when nothing went that way yet). */
export function withMove(legs: TradeLeg[], from: number, to: number, add: { pid?: number; dpid?: number }): TradeLeg[] {
  const has = legs.some((l) => l.tid === from && l.to === to);
  const next = has ? legs : [...legs, { tid: from, to, pids: [], dpids: [] }];
  return next.map((l) =>
    l.tid === from && l.to === to ? { ...l, pids: add.pid !== undefined ? [...l.pids, add.pid] : l.pids, dpids: add.dpid !== undefined ? [...l.dpids, add.dpid] : l.dpids } : l,
  );
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
 * The roster a trade counts: after the season, only players under contract for next season
 * (expiring deals are leaving, or are re-signed into their own spot).
 */
export function tradeRoster(league: League, tid: number): Player[] {
  const cs = contractSeason(league);
  return standardRoster(league, tid).filter((p) => contractExp(p.contract) >= cs);
}

/** Players an AI team may waive to make room for a trade's arrivals: up to this many past the limit. */
export const TRADE_WAIVE_MAX = 3;

// ---------------------------------------------------------------- salary matching

/** Trade matching's buffer ($K): 0.16% of the cap. */
const matchBuffer = (league: League, s: number) => Math.round((CAP_FOR(league, s).salaryCap * CAP.tradeMatchBufferPct) / 10) * 10;

/** The most salary a team over the cap after a trade may take back for `out` sent: 125% of it plus the buffer. */
export function tradeMatchLimit(league: League, out: number, s = contractSeason(league)): number {
  return Math.round(out * CAP.tradeMatch) + matchBuffer(league, s);
}

/** The least salary a team must send to take back `inSal` (the inverse of tradeMatchLimit). */
function matchNeeds(league: League, inSal: number, s: number): number {
  return inSal <= 0 ? 0 : Math.max(0, (inSal - matchBuffer(league, s)) / CAP.tradeMatch);
}

/**
 * How a side's salary works out in a deal: payroll after it and what it may take in. That's the
 * most of matching (125% of what it sends, plus the buffer) and, for a team under the cap before
 * the deal, its room: what it sends plus its cap space plus the buffer (`room`, 0 for a team already
 * over the cap).
 */
export function matchInfo(league: League, offer: TradeOffer, side: 'a' | 'b'): { inSal: number; outSal: number; after: number; overCap: boolean; room: number; limit: number } {
  return matchInfoOf(league, offer[side].tid, offer[side].pids, offer[side === 'a' ? 'b' : 'a'].pids);
}

/** A team's salary in a deal of any shape: what it sends (`out`) against everything it takes in (see matchInfo). */
export function matchInfoOf(league: League, tid: number, out: number[], inc: number[]): ReturnType<typeof matchInfo> {
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  const sum = (pids: number[]) => pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
  const outSal = sum(out);
  const inSal = sum(inc);
  const before = payroll(league, tid, s);
  const after = before - outSal + inSal;
  const room = before < cap.salaryCap ? outSal + cap.salaryCap - before + matchBuffer(league, s) : 0;
  return { inSal, outSal, after, overCap: after > cap.salaryCap, room, limit: Math.max(room, tradeMatchLimit(league, outSal, s)) };
}

/** "the 2028 1st" or a player's name, for rule messages. */
export const assetName = (league: League, a: Player | DraftPick) => ('pid' in a ? playerName(a) : `the ${pickLabel(league, a)}`);

/**
 * Extra salary a side must send for its team to pass salary matching (0 when it passes): see
 * tradeMatchLimit, or its cap room.
 */
export function salaryMatchGap(league: League, offer: TradeOffer, side: 'a' | 'b'): number {
  return matchGap(league, matchInfo(league, offer, side));
}

/** The same from a team's salary in a deal of any shape (see matchInfoOf). */
export function matchGap(league: League, m: ReturnType<typeof matchInfo>): number {
  if (!m.overCap || m.inSal <= m.limit) return 0;
  const byMatch = Math.max(0, matchNeeds(league, m.inSal, contractSeason(league)) - m.outSal);
  // (a team with room can instead send the rest dollar for dollar)
  return m.room > 0 ? Math.min(byMatch, m.inSal - m.room) : byMatch;
}

/**
 * The Stepien rule: a team can't trade itself out of first-round picks in back-to-back future
 * drafts (only checked for teams sending firsts, so inherited gaps don't block other deals).
 */
export function stepienError(league: League, offer: TradeOffer, side: TradeSide): string | null {
  return stepienOf(league, legsOf(offer), side.tid, side.dpids);
}

/** The Stepien rule for one team in a deal read as its legs: `sent` are the picks it sends, to anyone. */
function stepienOf(league: League, legs: TradeLeg[], tid: number, sent: number[]): string | null {
  if (!sent.some((d) => findPick(league, d)?.round === 1)) return null;
  const side = { tid };
  const moves = new Map<number, number>(legs.flatMap((l) => l.dpids.map((d) => [d, l.to] as const)));
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
  return validateDeal(league, legsOf(offer));
}

/** One team's side of a deal read as its legs: everything it sends (its cash added up) and everything it gets. */
function sidesOf(legs: TradeLeg[], tid: number): { mine: TradeSide; other: { pids: number[]; dpids: number[] }; outs: TradeLeg[] } {
  const outs = legs.filter((l) => l.tid === tid);
  const ins = legs.filter((l) => l.to === tid);
  const cash = outs.reduce((a, l) => a + (l.cash ?? 0), 0);
  return {
    mine: { tid, pids: outs.flatMap((l) => l.pids), dpids: outs.flatMap((l) => l.dpids), ...(cash > 0 ? { cash } : {}) },
    other: { pids: ins.flatMap((l) => l.pids), dpids: ins.flatMap((l) => l.dpids) },
    outs,
  };
}

/**
 * What the rules say about a deal of two teams or three, read as its legs (see TradeLeg): each
 * team's roster, salary matching and picks are checked on everything it sends
 * against everything it gets, whoever from; a leg's own terms (a protection, a swap, cash) between
 * the two teams it joins.
 */
export function validateDeal(league: League, legs: TradeLeg[]): string[] {
  const errors: string[] = [];
  const tids = dealTeams(legs);
  if (league.fired && tids.includes(league.userTid)) errors.push('You were fired: take over another team to make trades.');
  const closed = tradingClosedReason(league);
  if (closed) errors.push(closed);
  const maxSize = rosterMaxNow(league);
  const moving = new Set(legs.flatMap((l) => l.dpids));
  for (const tid of tids) {
    const { mine, other, outs } = sidesOf(legs, tid);
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
    // roster spots: the cap only binds a team taking in bodies, the floor one sending them out
    const out = mine.pids.length;
    const inc = other.pids.length;
    // (in free agency the user's pending offer to a top free agent holds a spot until it's decided: see summerRoster)
    const roster = tradeRoster(league, mine.tid).length;
    const held = inc > out && league.phase === 'freeAgency' ? summerRoster(league, mine.tid) - roster : 0;
    const size = roster - out + inc + held;
    // in season an AI team waives its end of the bench to make room for arrivals (see waiveForTrade)
    const waives = inSeason(league) && mine.tid !== league.userTid ? TRADE_WAIVE_MAX : 0;
    if (inc > out && size > maxSize + waives)
      errors.push(
        waives
          ? `${abbrev} would have to waive ${size - maxSize} players to make room (${waives} at most).`
          : `${abbrev} would have ${size} players. The most is ${maxSize}${inSeason(league) ? '' : ' in the offseason'}.`,
      );
    if (inSeason(league) && out > inc && size < CAP.rosterMin) errors.push(`${abbrev} would drop to ${size} players. The in-season minimum is ${CAP.rosterMin}.`);
    const m = matchInfoOf(league, mine.tid, mine.pids, other.pids);
    const { inSal } = m;
    if (matchGap(league, m) > 0) errors.push(`Salary doesn't match: ${abbrev} takes in ${money(inSal)} against a ${matchLimitText(league, m)}.`);
    const stepien = stepienOf(league, legs, mine.tid, mine.dpids);
    if (stepien) errors.push(stepien);
    // each leg's own terms, between the two teams it joins; its cash against all the team sends
    for (const leg of outs) errors.push(...termErrors(league, moving, leg, leg.to, mine.cash ?? 0));
    // a third team is in the deal for something: it sends or it gets
    if (tids.length > 2 && !mine.pids.length && !mine.dpids.length && !other.pids.length && !other.dpids.length && !outs.some(moves) && !legs.some((l) => l.to === tid && moves(l)))
      errors.push(`${abbrev} sends nothing and gets nothing: take it out of the deal.`);
  }
  if (!legs.some(moves)) errors.push('The trade is empty.');
  // (a deep link can name a player twice: the AI would count him twice, and he'd move twice)
  const pids = legs.flatMap((l) => l.pids);
  const dpids = legs.flatMap((l) => l.dpids);
  if (new Set(pids).size < pids.length || new Set(dpids).size < dpids.length) errors.push('A player or pick is in the deal twice.');
  // between any two teams, cash and a draft's swap right go one way
  for (const x of legs) {
    const back = legs.find((l) => l !== x && l.tid === x.to && l.to === x.tid);
    if (!back) continue;
    if ((x.cash ?? 0) > 0 && (back.cash ?? 0) > 0) errors.push('Cash can only go one way in a deal.');
    for (const y of x.swaps ?? []) if (back.swaps?.includes(y)) errors.push(`The ${y} firsts can only be swapped one way: one swap per pick.`);
  }
  return [...new Set(errors)];
}

/** "a $17.8M limit, 125% of $14.0M sent + $0.3M": what salary matching lets a side take back, in words. */
function matchLimitText(league: League, m: ReturnType<typeof matchInfo>): string {
  const s = contractSeason(league);
  const buf = matchBuffer(league, s);
  if (m.room > 0 && m.room >= m.limit) {
    const space = m.room - m.outSal - buf;
    return `${money(m.limit)} limit, ${m.outSal > 0 ? `${money(m.outSal)} sent + ` : ''}its ${money(space)} of cap space + ${money(buf)}`;
  }
  return `${money(m.limit)} limit, ${m.outSal <= 0 ? 'the buffer alone with no salary sent' : `125% of ${money(m.outSal)} sent + ${money(buf)}`}`;
}

/**
 * What the rules say about the terms one side puts on the table. A protection goes only on the
 * team's own first, before its draft order is set and outside any swap (a pick it already holds
 * with a protection, or another team's, keeps its terms). A swap right needs both teams to hold
 * their own firsts of that draft, unprotected, with no slot set and no swap on either (one swap
 * per pick), and neither may change hands in the same deal. Cash stays within what each team can
 * still send and receive this season (see cashRoom).
 */
function termErrors(league: League, moving: Set<number>, mine: TradeSide, to: number, cashOut = mine.cash ?? 0): string[] {
  const other = { tid: to };
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
  const seasons = mine.swaps ?? [];
  if (new Set(seasons).size < seasons.length) errors.push('A swap is in the deal twice.');
  for (const y of seasons) {
    const sp = Number.isInteger(y) ? swapPicks(league, mine.tid, other.tid, y) : null;
    if (!sp) errors.push(`There are no ${y} first-round picks to swap.`);
    else if (sp.subject.tid !== mine.tid || sp.right.tid !== other.tid) errors.push(`A ${y} swap needs both teams to hold their own ${y} first-round picks.`);
    else if (sp.subject.pick !== undefined || sp.right.pick !== undefined) errors.push(`The ${y} draft order is set: those firsts can't be swapped now.`);
    else if (protectionOf(sp.subject) || protectionOf(sp.right) || inSwap(league, sp.subject) || inSwap(league, sp.right))
      errors.push(`A ${y} first in that swap already has a protection or a swap. One swap per pick, and none on a protected pick.`);
    else if (moving.has(sp.subject.dpid) || moving.has(sp.right.dpid)) errors.push(`A ${y} first can't change hands in the same deal that swaps it.`);
  }
  const c = mine.cash;
  if (c !== undefined && c !== 0) {
    if (!Number.isInteger(c) || c < 0) errors.push("The cash in the deal isn't a valid amount.");
    else {
      const s = seasonLabel(contractSeason(league));
      const out = cashRoom(league, mine.tid);
      const into = cashRoom(league, other.tid);
      // (a team sending cash to two teams in one deal: all of it against what it may still send)
      if (Math.max(c, cashOut) > out.send)
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
  return evaluate(league, offer);
}

/**
 * How far a deal is from what the AI side wants: the share of the value it sends that is still
 * missing (0 once it's there), and how its GM puts it.
 */
export function valueVerdict(ev: { delta: number; valueOut: number }): { gap: number; label: string } {
  const missing = Math.max(0, -ev.delta);
  const gap = ev.valueOut > 0 ? missing / ev.valueOut : missing > 0 ? 1 : 0;
  return { gap, label: gap > 0.6 ? 'Not even close' : gap > 0.25 ? 'They want a lot more' : 'Close: add a little more' };
}

function evaluate(league: League, offer: TradeOffer): TradeEval {
  const errors = validateTrade(league, offer);
  const { delta, valueIn, valueOut, accept: likes, tooManyFirsts, parts } = judge(league, offer, offer.b.tid);
  const accept = errors.length === 0 && likes;
  let message: string;
  if (errors.length) message = errors[0];
  else if (tooManyFirsts) message = `No team gives up more than ${MAX_FIRSTS_OUT} first-round picks in one deal.`;
  else if (accept) message = delta > Math.abs(valueOut) * 0.25 ? 'Deal! They seem eager.' : 'Deal!';
  else message = `${valueVerdict({ delta, valueOut }).label}.`;
  const ev = { ok: errors.length === 0, errors, delta, valueIn, valueOut, accept, message, parts };
  return { ...ev, notes: tradeNotes(league, offer, ev) };
}

/** One team's answer to a deal of three teams (see evaluateDeal). */
export interface DealVerdict {
  tid: number;
  /** It would do the deal, the rules aside. */
  accept: boolean;
  delta: number;
  valueIn: number;
  valueOut: number;
  /** How its GM puts it: "They'd take it", "Close: add a little more". */
  message: string;
  parts: VerdictParts;
}

export interface DealEval {
  ok: boolean;
  errors: string[];
  /** Every team but the user's, in the deal's order. */
  teams: DealVerdict[];
  /** The rules allow it and every other team says yes. */
  accept: boolean;
}

/**
 * A deal of three teams as its other GMs see it: the rules on the whole deal, then each team's own
 * verdict on everything it gets against everything it sends, whoever from and to. All of them must
 * say yes. A team in a deal with the user judges it as it judges any deal with him (see judge).
 */
export function evaluateDeal(league: League, legs: TradeLeg[]): DealEval {
  const errors = validateDeal(league, legs);
  const tids = dealTeams(legs);
  const aiDeal = !tids.includes(league.userTid);
  const teams = tids
    .filter((tid) => tid !== league.userTid)
    .map((tid): DealVerdict => {
      const v = judgeLegs(
        league,
        tid,
        legs.filter((l) => l.to === tid),
        legs.filter((l) => l.tid === tid),
        aiDeal,
      );
      const message = v.tooManyFirsts
        ? `No more than ${MAX_FIRSTS_OUT} firsts out in one deal`
        : v.accept
          ? v.delta > Math.abs(v.valueOut) * 0.25
            ? "They'd jump at it"
            : "They'd take it"
          : valueVerdict(v).label;
      return { tid, accept: v.accept, delta: v.delta, valueIn: v.valueIn, valueOut: v.valueOut, message, parts: v.parts };
    });
  return { ok: errors.length === 0, errors, teams, accept: errors.length === 0 && teams.length > 0 && teams.every((t) => t.accept) };
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
 * strategy's view of the players and picks coming in, the tax and the releases the deal costs it,
 * depth for talent, assets that changed hands this season, the two-firsts limit, and a warning when side A (you) gives up much more neutral value than it
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
            ? "By neutral value you'd give up more than you get"
            : ratio < 5
              ? "By neutral value you'd give up much more than you get"
              : "By neutral value you'd give up far more than you get",
        2e9,
      );
    }
  }
  if (x.tooManyFirsts) add('bad', `No team gives up more than ${MAX_FIRSTS_OUT} first-round picks in one deal`, 1e9);

  // a deal turned down on value always says how far apart the sides are, as they see it, ahead of
  // the reasons that only shade it
  if (!ev.accept && ev.delta < 0) {
    const label = (xs: AssetView[], all: string) => (xs.length === 1 ? nameOf(xs[0]) : all);
    const theirs = label(x.outgoing, "what they'd send");
    const yours = label(x.incoming, 'your side');
    const ratio = ev.valueIn > 0 ? ev.valueOut / ev.valueIn : Infinity;
    // (an even swap of value turned down for the money or the roster says so in those notes instead)
    const text =
      ev.valueOut <= 0
        ? `They'd want something for taking on ${yours}`
        : ev.valueIn <= 0
          ? `They see no value in ${yours} for ${theirs}`
          : ratio >= 1.5
            ? `They value ${theirs} ${ratio >= 3 ? 'far' : 'much'} more than ${yours}`
            : ratio >= 1.03
              ? `They value ${theirs} more than ${yours}`
              : null;
    if (text) add('bad', text, 9e8);
  }

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

  // face value for anything that changed hands this season: no strategy premium
  const flips = x.flippedIn.filter((a) => matters(Math.max(0, Math.min(a.own, a.neutral * 1.15) - a.neutral)));
  if (flips.length) {
    const names = flips.length > 2 ? `${flips.slice(0, 2).map(nameOf).join(', ')} and ${flips.length - 2} more` : andList(flips.map(nameOf));
    add(
      'info',
      `${names} changed hands this season: face value only`,
      flips.reduce((s, a) => s + Math.abs(a.neutral) * 0.12, 0),
    );
  }

  if (x.depthApplied && matters(x.depthLoss)) add('bad', "Depth doesn't add up to talent for them", x.depthLoss);
  const leaving = x.outgoing.find((a) => a.wantsOut);
  if (leaving) add('good', `${nameOf(leaving)} has asked out: they'd take a little less for him`, leaving.value / WANTS_OUT - leaving.value);
  const corner = x.outgoing.find((a) => a.cornerstone);
  if (corner) add('bad', `They build around ${nameOf(corner)}: he counts ${Math.round((CORNERSTONE - 1) * 100)}% more to them`, corner.value - corner.value / CORNERSTONE);
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
        x.taxCost < 0
          ? `Shedding ${money(Math.abs(net))} saves them ${money(Math.abs(x.taxCost))} in luxury tax${
              x.reliefKind === 'discount'
                ? `, but they take ${Math.round(USER_RELIEF_SHARE * 100)}% off a good player's value for it at most`
                : x.reliefKind === 'dump'
                  ? `, but they count only what dumping that salary would cost them, about ${asFirsts(-x.money)}`
                  : ''
            }`
          : `Shedding ${money(Math.abs(net))} frees up cap room for them`,
        -x.money,
      );
  }

  return notes.sort((a, b) => b.weight - a.weight).map(({ tone, text }) => ({ tone, text }));
}

export function executeTrade(league: League, offer: TradeOffer) {
  executeDeal(league, legsOf(offer));
}

/** What a leg sends, in words: players first, then picks, swap rights and cash. */
const legWords = (league: League, leg: TradeSide) => [
  ...leg.pids.map((pid) => playerName(league.players[pid])),
  ...leg.dpids.map((dpid) => pickLabel(league, findPick(league, dpid)!)),
  ...(leg.swaps ?? []).map((y) => `the right to swap ${y} firsts`),
  ...((leg.cash ?? 0) > 0 ? [`${moneyExact(leg.cash!)} in cash`] : []),
];

/**
 * A three-team deal in words, by what each team ends up with: "Oklahoma City gets Anthony Davis from
 * Dallas. Dallas gets Lu Dort from Oklahoma City and a 2029 1st (PHX) from Phoenix. ..."
 * Read after the deal is done (a pick's label is its new holder's).
 */
export function dealHeadline(league: League, legs: TradeLeg[]): string {
  const name = (tid: number) => teamCity(league, tid);
  return dealTeams(legs)
    .map((tid) => {
      const from = legs.filter((l) => l.to === tid && moves(l)).map((l) => `${andList(legWords(league, l))} from ${name(l.tid)}`);
      return from.length ? `${name(tid)} gets ${andList(from)}` : '';
    })
    .filter(Boolean)
    .join('. ');
}

/**
 * Is this news item a trade as executeDeal tells it (one item a deal: "Trade: ..." for two teams,
 * "Three-team trade: ..." for three)? What counts the season's trades reads this, not the words.
 */
export const isTradeNews = (n: { kind: string; text: string }): boolean => n.kind === 'trade' && (n.text.startsWith('Trade: ') || n.text.startsWith('Three-team trade: '));

/** Make a deal of two teams or three, read as its legs (see TradeLeg): everything moves at once. */
export function executeDeal(league: League, legs: TradeLeg[]) {
  const tids = dealTeams(legs);
  const sides = tids.map((tid) => sidesOf(legs, tid));
  // (logged before anything moves: each pick is named as its sender held it, "2027 1st" for its
  // own, with the protection it goes with)
  const protection = (dpid: number) => legs.find((l) => l.dpids.includes(dpid))?.protect?.[dpid];
  logTrade(
    league,
    sides.map((x) => ({ ...x.mine, swaps: x.outs.flatMap((l) => l.swaps ?? []) })),
    (dpid) => pickLabel(league, findPick(league, dpid)!, { protection: protection(dpid) }),
  );
  const move = (pids: number[], to: number) => {
    for (const pid of pids) {
      const p = league.players[pid];
      leaveTeam(league.teams[p.tid], pid);
      p.tradedFrom = tradedAway(league, p, p.tid);
      p.tid = to;
      p.joinedSeason = league.season;
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
  for (const leg of legs) move(leg.pids, leg.to);
  // the arrivals take numbers nobody there wears (nor has retired); the user's side first, as ever
  for (const x of sides) if (x.other.pids.length) numberTeam(league, x.mine.tid);
  for (const leg of legs) movePicks(leg, leg.to);
  for (const leg of legs) {
    // a swap right rides on the other team's own first of that draft
    for (const y of leg.swaps ?? []) {
      const sp = swapPicks(league, leg.tid, leg.to, y);
      if (sp) sp.right.swap = sp.subject.dpid;
    }
    payCash(league, leg, leg.to);
  }
  // a player the user marked untouchable is unmarked when he leaves
  if (league.untouchable) league.untouchable = league.untouchable.filter((pid) => league.players[pid]?.tid === league.userTid);
  const pids = legs.flatMap((l) => l.pids);
  if (tids.length === 2) {
    const none = (tid: number): TradeSide => ({ tid, pids: [], dpids: [] });
    const a = legs.find((l) => l.tid === tids[0]) ?? none(tids[0]);
    const b = legs.find((l) => l.tid === tids[1]) ?? none(tids[1]);
    const ta = league.teams[a.tid];
    const tb = league.teams[b.tid];
    addNews(league, {
      kind: 'trade',
      text: sentence(`Trade: ${tradeHeadline(teamCity(league, ta), legWords(league, a), a.pids.length, teamCity(league, tb), legWords(league, b), b.pids.length)}`),
      tids: [ta.tid, tb.tid],
      pids,
    });
  } else addNews(league, { kind: 'trade', text: sentence(`Three-team trade: ${dealHeadline(league, legs)}`), tids, pids });
  // an AI team over 15 waives its end of the bench (the user's rosters are held to the limit)
  for (const tid of tids) waiveForTrade(league, tid);
}

/** "Charlotte's", "Dallas'": a team's name in the possessive. */
const teamPossessive = (name: string) => `${name}${name.endsWith('s') ? "'" : "'s"}`;

/**
 * A trade in words, the teams by city: "Toronto sends Scottie Barnes and a 2027 1st (TOR) to
 * New York for ...". When one side sends nothing back, it reads as what it is: a salary dump
 * ("Minnesota takes Terry Rozier off Charlotte's hands, with a 2028 2nd for it") or picks or
 * cash bought for nothing ("Brooklyn gets a 2029 2nd from Sacramento"). `x` lists what each side sends
 * (players first), `xPlayers` how many of them are players.
 */
export function tradeHeadline(a: string, aList: string[], aPlayers: number, b: string, bList: string[], bPlayers: number): string {
  const one = (giver: string, list: string[], players: number, taker: string) => {
    if (!players) return `${taker} gets ${andList(list)} from ${giver}`;
    const extra = list.slice(players);
    return `${taker} takes ${andList(list.slice(0, players))} off ${teamPossessive(giver)} hands${extra.length ? `, with ${andList(extra)} for it` : ''}`;
  };
  if (aList.length && !bList.length) return one(a, aList, aPlayers, b);
  if (bList.length && !aList.length) return one(b, bList, bPlayers, a);
  // a short swap reads in one breath; a bigger one gets a sentence a side
  return aList.length + bList.length > 2 ? `${a} sends ${andList(aList)} to ${b}. ${b} sends back ${andList(bList)}` : `${a} sends ${andList(aList)} to ${b} for ${andList(bList)}`;
}

/**
 * In season, an AI team a trade left over 15 waives the players it would miss least: value, less
 * for a release that leaves little dead money (a minimum deal, an expiring one), so a big contract
 * stays unless he's clearly the worst.
 */
export function waiveForTrade(league: League, tid: number) {
  if (tid === league.userTid || !inSeason(league)) return;
  const keep = (p: Player) => valueScore(league, p) + (0.4 * releaseDeadMoney(league, p).reduce((a, d) => a + d.amount, 0)) / 1000;
  const roster = tradeRoster(league, tid).sort((a, b) => keep(a) - keep(b) || a.pid - b.pid);
  while (roster.length > CAP.rosterMax) releasePlayer(league, roster.shift()!);
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
