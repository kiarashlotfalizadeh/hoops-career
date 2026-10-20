// Helping a deal along: "what would make this work?" (the players, picks or cash that get an offer
// over the line) and the counter-offers an AI team would take instead of the one on the table.
import type { League, Player } from '../types';
import { seasonLabel } from '../constants';
import { contractExp, salaryFor } from '../playerGen';
import { contractSeason, playerName, rosterMaxNow, standardRoster } from './helpers';
import { summerRoster, tradeValue } from './contracts';
import { withHoldsMemo } from './freeAgency';
import { money, moneyExact } from '../format';
import {
  TradeOffer,
  TradeSide,
  capSalary,
  cashRoom,
  cashValueFor,
  evaluateTrade,
  findPick,
  neutralSplit,
  pickLabel,
  pickValueFor,
  playerValueFor,
  salaryMatchGap,
  tradeRoster,
  tradedAwayBy,
  untradeable,
  untradeableReason,
  validateTrade,
} from './trades';

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

/**
 * Is "what would make this work?" worth asking: are the deal's only rule problems ones that adding
 * players can fix (either side's salary matching: side B adds a contract it would move, side A
 * players; a full roster on A's side)?
 */
export function canMakeWork(league: League, o: TradeOffer): boolean {
  const n = (salaryMatchGap(league, o, 'a') > 0 ? 1 : 0) + (salaryMatchGap(league, o, 'b') > 0 ? 1 : 0) + (aRosterOver(league, o) ? 1 : 0);
  return validateTrade(league, o).length <= n;
}

/**
 * A deal the AI would take, or why none was found: no player (or pair) of A's fixes A's salary
 * matching ('salary'), none of B's fixes B's ('theirSalary'), or not enough value.
 */
export type WorkResult = { offer: TradeOffer; why?: undefined } | { offer: null; why: 'salary' | 'theirSalary' | 'value' };

const withB = (offer: TradeOffer, pids: number[]): TradeOffer => ({ a: offer.a, b: { ...offer.b, pids: [...offer.b.pids, ...pids] } });

/**
 * Side B takes back more salary than matching lets it: the contract (or pair) of its own it would
 * most like to move that covers the gap, added to what it sends (null when none does). B's
 * players in the deal already, its untradeable ones and any A traded away this season stay out.
 */
function theirFiller(league: League, o: TradeOffer, gap: number): number[] | null {
  const pool = tradeRoster(league, o.b.tid)
    .filter((p) => !o.b.pids.includes(p.pid) && !p.contract.twoWay && !untradeable(league, p) && !tradedAwayBy(league, p, o.a.tid))
    .map((p) => ({ pid: p.pid, sal: capSalary(league, p.pid), v: playerValueFor(league, p, o.b.tid, false) }))
    .filter((x) => x.sal > 0);
  const options: { pids: number[]; v: number }[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].sal >= gap) options.push({ pids: [pool[i].pid], v: pool[i].v });
    for (let j = i + 1; j < pool.length; j++)
      if (pool[i].sal < gap && pool[j].sal < gap && pool[i].sal + pool[j].sal >= gap) options.push({ pids: [pool[i].pid, pool[j].pid], v: pool[i].v + pool[j].v });
  }
  const fix = options.sort((x, y) => x.v - y.v).find((x) => salaryMatchGap(league, withB(o, x.pids), 'b') === 0 && canMakeWork(league, withB(o, x.pids)));
  return fix?.pids ?? null;
}

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
  if (!canMakeWork(league, cur)) return { offer: null, why: 'value' };
  // their side first: a contract they'd move that lets them take back what A sends
  const gapB = salaryMatchGap(league, cur, 'b');
  if (gapB > 0) {
    const fill = theirFiller(league, cur, gapB);
    if (!fill) return { offer: null, why: 'theirSalary' };
    cur = withB(cur, fill);
  }
  const gapA = salaryMatchGap(league, cur, 'a');
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
  const plusB = (p: Player): TradeOffer => withB(offer, [p.pid]);
  const n = found.length;
  for (const { p } of bad) {
    consider(plusB(p), 'absorb', take(p));
    if (found.length > n) break;
  }
  if (found.length === n && bad.length) {
    const worst = bad[bad.length - 1].p;
    const r = findWork(league, plusB(worst));
    if (r.offer) consider(r.offer, 'absorb', `${take(worst)}, add ${added(offer, r.offer).join(' + ')}`);
  }

  return found
    .sort((x, y) => y.net - x.net)
    .slice(0, max)
    .map((x) => x.c);
}
