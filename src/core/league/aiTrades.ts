// AI front offices: each team's strategy (contend, retool, rebuild), AI-to-AI trades (through the
// season with a rush at the deadline, on draft night, and over the summer and preseason) and the
// rumours of who is on the block (the AI's offers to the user are in proposals.ts).
import type { DraftPick, League, Player } from '../types';
import { CAP } from '../constants';
import { Rng, clamp } from '../random';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, age, contractSeason, curTeamSeason, dateToDay, inSeason, standardRoster, winPct } from './helpers';
import { DEC_15, extensionRefusal, hardCapLine, tradeValue, valueScore } from './contracts';
import { capPayroll, withHoldsMemo } from './freeAgency';
import { contractExp } from '../playerGen';
import {
  MAX_FIRSTS_OUT,
  TradeOffer,
  capSalary,
  executeTrade,
  findPick,
  pickValue,
  pickValueFor,
  playerValueFor,
  salaryMatchGap,
  stepienError,
  teamDelta,
  tradeRoster,
  tradedAwayBy,
  tradingClosedReason,
  untradeable,
  validateTrade,
} from './trades';
import { MAX_PICKS_OUT, dumpPackage } from './tradePackages';

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

// ---------------------------------------------------------------- how many deals, and when

/**
 * AI-to-AI deals the league expects on a day of the regular season, the NBA's rhythm: a trickle
 * before December 15 (summer signings can't be traded until then), more into January, more again
 * after mid-January, about two a day in the deadline's last week and a rush on deadline day: some
 * 30 a season, nearly half of them in the last week (see aiToAiTrade).
 */
export function aiTradeRate(league: League): number {
  const left = league.tradeDeadlineDay - league.day;
  if (left < 0) return 0;
  if (left === 0) return 6;
  if (left < 7) return 2;
  if (league.day < DEC_15) return 0.06;
  if (league.day < dateToDay(league.season, 0, 15)) return 0.2;
  return 0.36;
}

/** How many of something happen today, at `rate` a day on average (a Poisson draw from the league's stream). */
function draws(rng: Rng, rate: number): number {
  if (rate <= 0) return 0;
  const floor = Math.exp(-rate);
  let k = 0;
  let p = rng.next();
  while (p > floor && k < 20) {
    k++;
    p *= rng.next();
  }
  return k;
}

/** Each regular-season day up to the deadline: the deals the day brings (see aiTradeRate and aiTradeOnce). */
export function aiToAiTrade(league: League, rng: Rng) {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return;
  const n = draws(rng, aiTradeRate(league));
  for (let i = 0; i < n; i++) aiTradeOnce(league, rng);
  // the taxpayers' calls (see aiTaxDumps): once summer signings can be traded, and the last ones
  const left = league.tradeDeadlineDay - league.day;
  if (left === 7 || left === 0 || league.day === DEC_15) aiTaxDumps(league, rng);
}

/**
 * Deals over the summer and the preseason: `rate` expected (see draws), each a veteran sold to a
 * contender for youth and picks, or a taxpayer's salary dump. The trading window is open from
 * the draft (only contracts that run into next season move: see untradeable).
 */
export function aiOffseasonTrades(league: League, rng: Rng, rate: number) {
  if (tradingClosedReason(league)) return;
  const n = draws(rng, rate);
  for (let i = 0; i < n; i++) aiTradeOnce(league, rng);
}

/**
 * One AI-to-AI deal if one is there: a sale (seven times in ten) or a salary dump, the other kind
 * when the first finds nothing. In the two weeks before the deadline, when the tax bills are about
 * to be set, the dumps come first as often as the sales.
 */
function aiTradeOnce(league: League, rng: Rng): boolean {
  const late = league.phase === 'regular' && league.tradeDeadlineDay - league.day < 14;
  const kinds = rng.chance(late ? 0.5 : 0.7) ? [saleDeal, dumpDeal] : [dumpDeal, saleDeal];
  for (const find of kinds) {
    const deal = withHoldsMemo(() => find(league, rng));
    if (deal && draftNightRoom(league, deal)) {
      executeTrade(league, deal);
      return true;
    }
  }
  return false;
}

/**
 * On draft night a team's picks still to come land on its roster too: an AI deal leaves each side
 * room for them under the offseason limit (OFFSEASON_ROSTER_MAX), counting next season's contracts.
 * Without it a rebuilder with five picks to make took back four players for a veteran and came out
 * of the draft with 22 signed.
 */
function draftNightRoom(league: League, deal: TradeOffer): boolean {
  if (league.phase !== 'draft') return true;
  const bodies = (pids: number[]) => pids.filter((pid) => !league.players[pid]?.contract.twoWay).length;
  for (const [mine, other] of [
    [deal.a, deal.b],
    [deal.b, deal.a],
  ] as const) {
    const signed = standardRoster(league, mine.tid).filter((p) => contractExp(p.contract) > league.season).length;
    const picks = league.draftPicks.filter((d) => d.season === league.season && (d.tid === mine.tid ? !mine.dpids.includes(d.dpid) : other.dpids.includes(d.dpid))).length;
    if (signed + bodies(other.pids) - bodies(mine.pids) + picks > OFFSEASON_ROSTER_MAX) return false;
  }
  return true;
}

// ---------------------------------------------------------------- sales: a veteran for youth and picks

/**
 * An AI team doesn't trade away a player it got in a trade in the last AI_RETRADE_DAYS days (the
 * NBA's two-month wait before a traded player's salary can be combined, as a front office's
 * patience): without it, 16 of 104 players traded in a season moved twice or more, some three
 * times in 40 days, and the news read as noise (round-2 front-office review).
 */
export const AI_RETRADE_DAYS = 60;

/** Did he come to his team in a trade in the last AI_RETRADE_DAYS days (see AI_RETRADE_DAYS)? */
export const justTraded = (league: League, p: Player) =>
  p.tradedFrom?.season === league.season && p.tradedFrom.day !== undefined && league.day - p.tradedFrom.day < AI_RETRADE_DAYS;

/** A retooling team this far under .500 (with 20 games played) is out of it: its veterans are for sale. */
const FADING = { games: 20, pct: 0.45 };

/**
 * Players a team will shop: a rebuilder's veterans (28 or older, 70+, its stars too), and anyone
 * else of 26 or older but its best (a young franchise player stays); a retooling team's 30+
 * outside its three best, and once it is out of it in season (under .450) every player of 28 or
 * older, its stars included; and anyone's star (80+, 26 or older) in the last season of his deal
 * who won't extend there, unless his team contends: better to get something for him now. Only
 * players the rules let move. When rebuilders kept their 26- and 27-year-old starters and fading
 * teams their 28- and 29-year-olds, the teams at the bottom stayed nearly as deep as the middle:
 * over twelve simulated seasons the spread of team talent at the deadline fell a tenth further.
 */
export function sellable(league: League, tid: number): Player[] {
  const t = league.teams[tid];
  if (t.strategy === 'contend') return [];
  const roster = tradeRoster(league, tid).sort((a, b) => valueScore(league, b) - valueScore(league, a));
  const rank = new Map(roster.map((p, i) => [p.pid, i]));
  const cs = contractSeason(league);
  const ts = curTeamSeason(league, tid);
  const fading = league.phase === 'regular' && ts.won + ts.lost >= FADING.games && winPct(ts) < FADING.pct;
  return roster.filter((p) => {
    if (untradeable(league, p) || justTraded(league, p) || p.ovr < 70) return false;
    const a = age(league, p);
    const r = rank.get(p.pid)!;
    const leaving = p.ovr >= 80 && a >= 26 && contractExp(p.contract) === cs && !p.contract.next && !!extensionRefusal(league, p);
    if (leaving) return true;
    if (t.strategy === 'rebuild') return a >= 28 || (a >= 26 && r >= 1);
    return (a >= 30 && r >= 3) || (fading && a >= 28);
  });
}

/** Teams that would buy him: contenders, and retooling teams for a player 76+ who is 30 or younger. */
function buyersFor(league: League, seller: number, p: Player): number[] {
  return league.teams
    .filter((t) => t.tid !== seller && t.tid !== league.userTid && (t.strategy === 'contend' || (t.strategy === 'retool' && p.ovr >= 76 && age(league, p) <= 30)))
    .map((t) => t.tid);
}

/**
 * A seller shops its best three sellable players to every team that would buy them (see
 * buyersFor) and takes the deal it likes best. Rebuilders are three times as likely to be the one
 * shopping as retooling teams; up to three sellers are tried.
 */
function saleDeal(league: League, rng: Rng): TradeOffer | null {
  const sellers = league.teams.filter((t) => t.tid !== league.userTid && t.strategy !== 'contend').map((t) => ({ t, list: sellable(league, t.tid) }));
  const pool = sellers.filter((x) => x.list.length);
  for (let k = 0; k < 3 && pool.length; k++) {
    const { t, list } = pool.splice(rng.weighted(pool.map((x) => (x.t.strategy === 'rebuild' ? 3 : 1))), 1)[0];
    let best: { deal: TradeOffer; v: number } | null = null;
    for (const p of list.slice(0, 3)) {
      for (const b of buyersFor(league, t.tid, p)) {
        const deal = aiPackage(league, b, t.tid, p);
        if (!deal) continue;
        const v = teamDelta(league, deal, t.tid);
        if (!best || v > best.v) best = { deal, v };
      }
    }
    if (best) return best.deal;
  }
  return null;
}

export interface BlockRumor {
  tid: number;
  pid: number;
  /** Teams with a deal for him the seller would take. */
  suitors: number[];
}

/**
 * Who AI teams are shopping before the deadline: each seller's best player it would move (see
 * sellable), best first, with the teams that have a package the seller would take for him (as the
 * AI's deals build them), up to three of each.
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
      const suitors = buyersFor(league, tid, p).filter((b) => aiPackage(league, b, tid, p));
      out.push({ tid, pid: p.pid, suitors: suitors.slice(0, 3) });
    }
    return out;
  });
}

/** A player this good is worth a buyer's third-best player (see aiPackage). */
const STAR_TARGET = 85;

/**
 * The buyer's offer for one player: salary that matches first (without sending an over-the-cap
 * seller more than it can take back, or taking a hard-capped buyer past its apron), then its two
 * most valuable young players and picks from the cheapest up (three at most, so better ones
 * replace the cheapest; two firsts at most) until the seller agrees; null unless both teams sign
 * off and the rules allow it. The buyer's three best players are off the table (its two best for
 * a star, 85+), and it keeps 13 in season; up to four of its players go (a 2-for-1 or 3-for-1
 * consolidates its depth into one better player), the seller waiving its end of the bench to make
 * room (see waiveForTrade).
 */
export function aiPackage(league: League, buyer: number, seller: number, vet: Player): TradeOffer | null {
  const sal = (p: Player) => capSalary(league, p.pid);
  // nothing the rules hold back: a recent signing, or an asset the seller traded away this season
  const movable = (a: Player | DraftPick) => !tradedAwayBy(league, a, seller) && !('pid' in a && (untradeable(league, a) || justTraded(league, a)));
  const roster = tradeRoster(league, buyer).sort((x, y) => y.ovr - x.ovr);
  // (for a star, 85+, only its two best: a contender gives up its third-best player to land one)
  const avail = roster.slice(vet.ovr >= STAR_TARGET ? 2 : 3).filter((p) => p.ovr < vet.ovr && movable(p));
  // the buyer keeps 13 in season; the seller waives to make room for what comes back
  const maxPkg = inSeason(league) ? Math.min(4, roster.length - CAP.rosterMin + 1) : 4;
  if (maxPkg < 1) return null;
  const pkg: Player[] = [];
  const dps: DraftPick[] = [];
  const offer = (p?: Player): TradeOffer => ({
    a: { tid: buyer, pids: [...pkg, ...(p ? [p] : [])].map((x) => x.pid), dpids: dps.map((d) => d.dpid) },
    b: { tid: seller, pids: [vet.pid], dpids: [] },
  });
  // an over-the-cap seller can only take back so much salary
  const sellerFits = (p: Player) => salaryMatchGap(league, offer(p), 'b') === 0;
  // an over-the-cap buyer must send back salary first, and a hard-capped one (it used an exception)
  // enough that the deal doesn't take it past its apron (as validateTrade has it: one already past
  // it only can't add salary): the smallest contract that covers the gap, else the biggest and keep going
  const s = contractSeason(league);
  const line = hardCapLine(league, buyer, s);
  const capGap = () => {
    if (!line) return 0;
    const net = sal(vet) - pkg.reduce((a, p) => a + sal(p), 0);
    return Math.min(net, capPayroll(league, buyer, s) + net - line.amount);
  };
  const gapNow = () => Math.max(salaryMatchGap(league, offer(), 'a'), capGap());
  while (gapNow() > 0) {
    const gap = gapNow();
    const rest = avail.filter((x) => !pkg.includes(x) && sellerFits(x));
    const p = rest.filter((x) => sal(x) >= gap).sort((x, y) => sal(x) - sal(y))[0] ?? rest.sort((x, y) => sal(y) - sal(x))[0];
    if (!p || pkg.length >= maxPkg) return null;
    pkg.push(p);
  }
  // then value, until the seller says yes: young players first, then picks from the cheapest up
  const youth = avail
    .filter((p) => !pkg.includes(p) && age(league, p) <= 25)
    .sort((x, y) => playerValueFor(league, y, seller, true, true) - playerValueFor(league, x, seller, true, true));
  const picks = league.draftPicks
    .filter((d) => d.tid === buyer && movable(d))
    .sort((x, y) => pickValueFor(league, x, seller, true, true) - pickValueFor(league, y, seller, true, true));
  const sellerYes = () => teamDelta(league, offer(), seller) >= 0;
  for (const x of [...youth.slice(0, 2), ...picks]) {
    if (sellerYes()) break;
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
  return sellerYes() && teamDelta(league, deal, buyer) >= 0 && !pastSecondApron(league, deal, buyer) && !validateTrade(league, deal).length ? deal : null;
}

/**
 * Would this deal take team `tid` past the second apron, or further past it? AI teams don't buy
 * their way past it (the repeater tax, the frozen first and the lost tools aren't worth a player to
 * a front office minding its owner's money); a team past it can still shed salary.
 */
export function pastSecondApron(league: League, deal: TradeOffer, tid: number): boolean {
  const s = contractSeason(league);
  const sal = (pids: number[]) => pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
  const [mine, other] = deal.a.tid === tid ? [deal.a, deal.b] : [deal.b, deal.a];
  const net = sal(other.pids) - sal(mine.pids);
  return net > 0 && capPayroll(league, tid, s) + net > CAP_FOR(league, s).secondApron;
}

// ---------------------------------------------------------------- salary dumps

/** The least a salary dump that can't get a team under the tax line saves it, as a share of the cap (about $5M). */
const PARTIAL_DUMP = 0.03;

/**
 * A team over the tax line sheds salary, as the NBA's deadline and summer dumps go: the contract that
 * gets it under the line at the least cost in value (a player outside its eight best; a retooling
 * team's outside its five best; a rebuilder's veteran outside its three best) to a team that can
 * absorb it (cap room, or a traded player exception that covers it) for nothing back, or failing
 * that for a cheaper player of the taker's that still leaves it under and lets the taker match the
 * salary, with picks attached from the cheapest up until the taker would do it. When no taker can
 * get it under, or no one contract would, a step toward the line: a contract worth shedding that
 * saves at least PARTIAL_DUMP of the cap (else its worst contract). The giver signs off when the
 * tax it saves is worth what it gives (see moneyCost). The teams nearest the line, which a deal
 * gets under most easily, are likelier to be tried: up to three, each with up to six takers
 * (`only`: that team's dump, see aiTaxDumps). The partial steps and the matching-aware player back
 * took season-end taxpayers from 12.2 to 10.6 a season (50 seasons a side).
 */
function dumpDeal(league: League, rng: Rng, only?: number): TradeOffer | null {
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  const ai = league.teams.filter((t) => t.tid !== league.userTid);
  const over = ai.map((t) => ({ t, over: capPayroll(league, t.tid, s) - cap.luxuryTax })).filter((x) => x.over > 0 && (only === undefined || x.t.tid === only));
  const givers: typeof over = [];
  while (givers.length < 3 && over.length) givers.push(over.splice(rng.weighted(over.map((x) => 1 / (1 + x.over / (cap.salaryCap * 0.05)))), 1)[0]);
  for (const { t, over } of givers) {
    const roster = tradeRoster(league, t.tid).filter((p) => capSalary(league, p.pid) > 0 && !untradeable(league, p) && !justTraded(league, p));
    // what it won't give up to get under: its eight best; a retooling team its five best; a
    // rebuilder only its three best and its young players (25 or under, worth 70+). Past the first
    // apron a contender keeps its six best; past the second, a contender its five best and anyone
    // else its three: a team that far over moves a rotation player rather than stay there
    const ranked = [...roster].sort((a, b) => valueScore(league, b) - valueScore(league, a));
    const pay = capPayroll(league, t.tid, s);
    const past = pay > cap.secondApron;
    const keep = new Set(
      (t.strategy === 'rebuild'
        ? ranked.filter((p, i) => i < 3 || (!past && age(league, p) <= 25 && valueScore(league, p) >= 70))
        : ranked.slice(0, past ? (t.strategy === 'contend' ? 5 : 3) : t.strategy === 'retool' ? 5 : pay > cap.firstApron ? 6 : 8)
      ).map((p) => p.pid),
    );
    const under = roster.filter((p) => !keep.has(p.pid) && capSalary(league, p.pid) >= over).sort((a, b) => tradeValue(league, a) - tradeValue(league, b))[0];
    // a step toward the line: the least valuable contract outside the ones it keeps that a taker
    // can match while saving at least PARTIAL_DUMP of the cap (about half his salary at most)
    const step = Math.min(over, cap.salaryCap * PARTIAL_DUMP);
    const partial = roster.filter((p) => !keep.has(p.pid) && capSalary(league, p.pid) >= step * 2).sort((a, b) => tradeValue(league, a) - tradeValue(league, b))[0];
    const worst = roster.filter((p) => tradeValue(league, p) < 0).sort((a, b) => tradeValue(league, a) - tradeValue(league, b))[0];
    // the contract that gets it under first; if no taker can absorb that, a step closer
    const tries: { bad: Player; saves: number }[] = [
      ...(under ? [{ bad: under, saves: over }] : []),
      ...(partial && (partial !== under || step < over) ? [{ bad: partial, saves: step }] : []),
    ];
    if (!tries.length && worst) tries.push({ bad: worst, saves: over });
    for (const { bad, saves } of tries) {
      const takers = rng.shuffle(ai.filter((x) => x.tid !== t.tid && !tradedAwayBy(league, bad, x.tid))).slice(0, past ? ai.length : 6);
      const sal = capSalary(league, bad.pid);
      for (const x of takers) {
        const taker = (o: TradeOffer) => teamDelta(league, o, x.tid) >= 0;
        const deal = dumpPackage(league, t.tid, x.tid, bad, taker);
        if (deal && teamDelta(league, deal, t.tid) >= 0 && !pastSecondApron(league, deal, x.tid)) return deal;
        // for a cheaper player back: the taker's least valuable one whose salary still leaves the giver
        // under the line (or a step closer) and lets the taker match the salary it takes in
        const swap = (b: Player): TradeOffer => ({ a: { tid: x.tid, pids: [b.pid], dpids: [] }, b: { tid: t.tid, pids: [bad.pid], dpids: [] } });
        const back = tradeRoster(league, x.tid)
          .filter(
            (p) => capSalary(league, p.pid) > 0 && capSalary(league, p.pid) <= sal - saves && !untradeable(league, p) && !justTraded(league, p) && !tradedAwayBy(league, p, t.tid),
          )
          .sort((a, b) => tradeValue(league, a) - tradeValue(league, b))
          .find((p) => salaryMatchGap(league, swap(p), 'a') === 0);
        if (!back) continue;
        const shed = dumpPackage(league, t.tid, x.tid, bad, taker, [back]);
        if (shed && teamDelta(league, shed, t.tid) >= 0 && !pastSecondApron(league, shed, x.tid)) return shed;
      }
    }
  }
  return null;
}

/**
 * A team over the tax line that isn't contending, or a contender past the first apron, works at
 * getting under it when the deals are there: on the summer market's third day (while some cap
 * space is still open), in the preseason, on December 15, and a week before the deadline
 * and on deadline day, it tries up to two salary dumps (see dumpDeal), the second while it is
 * still over; a team past the second apron up to three, offered to every other team. With only
 * contenders past the second apron working at it, and six takers asked, 10-16 teams paid the tax a
 * season and two or three opened past the second apron.
 */
export function aiTaxDumps(league: League, rng: Rng) {
  if (tradingClosedReason(league)) return;
  const s = contractSeason(league);
  const cap = CAP_FOR(league, s);
  for (const t of league.teams) {
    if (t.tid === league.userTid) continue;
    for (let i = 0; i < 3; i++) {
      const pay = capPayroll(league, t.tid, s);
      if (pay <= cap.luxuryTax || (t.strategy === 'contend' && pay <= cap.firstApron) || (i === 2 && pay <= cap.secondApron)) break;
      const deal = withHoldsMemo(() => dumpDeal(league, rng, t.tid));
      if (!deal) break;
      executeTrade(league, deal);
    }
  }
}

// ---------------------------------------------------------------- draft night

/** What a pick on the clock is worth over its value to a team that wants the player it would take (see aiDraftTrade). */
const COVET = 0.25;

/**
 * Draft night, before an AI team picks: now and then it trades down or out of the pick. In the
 * first round (about one pick in eight) a team with a later first this draft moves up into it,
 * adding its cheapest picks until the team on the clock likes the deal; in the second (one in
 * ten) a team buys the pick with a future second. The team moving up covets a player on the board
 * (the pick is worth COVET more to it); both teams sign off and the rules allow it, as for any AI
 * deal.
 */
export function aiDraftTrade(league: League, rng: Rng, dp: DraftPick) {
  if (league.phase !== 'draft' || dp.tid === league.userTid || dp.pick === undefined) return;
  if (!rng.chance(dp.round === 1 ? 0.12 : 0.1)) return;
  const deal = withHoldsMemo(() => {
    const seller = dp.tid;
    const later = (tid: number) =>
      league.draftPicks.filter(
        (d) => d.tid === tid && d.season === league.season && d.round === dp.round && d.pick !== undefined && d.pick > dp.pick! && !tradedAwayBy(league, d, seller),
      );
    const buyers = rng.shuffle(league.teams.filter((t) => t.tid !== seller && t.tid !== league.userTid)).slice(0, 8);
    for (const b of buyers) {
      const base = dp.round === 1 ? later(b.tid)[0] : undefined;
      if (dp.round === 1 && !base) continue;
      const extra = league.draftPicks
        .filter((d) => d.tid === b.tid && d !== base && !tradedAwayBy(league, d, seller) && (dp.round === 1 || (d.round === 2 && d.season > league.season)))
        .sort((x, y) => pickValue(league, x) - pickValue(league, y) || x.dpid - y.dpid);
      const dps: DraftPick[] = base ? [base] : [];
      const offer = (): TradeOffer => ({ a: { tid: b.tid, pids: [], dpids: dps.map((d) => d.dpid) }, b: { tid: seller, pids: [], dpids: [dp.dpid] } });
      for (const x of extra) {
        if (dps.length && teamDelta(league, offer(), seller) >= 0) break;
        if (dps.length >= MAX_PICKS_OUT) break;
        if (x.round === 1 && dps.filter((d) => d.round === 1).length >= MAX_FIRSTS_OUT) continue;
        dps.push(x);
        if (stepienError(league, offer(), offer().a)) dps.pop();
      }
      const o = offer();
      // (the team moving up has a player it likes on the board: the pick is worth a quarter more to it tonight)
      if (dps.length && teamDelta(league, o, seller) >= 0 && teamDelta(league, o, b.tid) + COVET * pickValue(league, dp) >= 0 && !validateTrade(league, o).length) return o;
    }
    return null;
  });
  if (deal && findPick(league, dp.dpid)) executeTrade(league, deal);
}
