// Helping a deal along: "what would make this work?" (the players, picks or cash that get an offer
// over the line) and the counter-offers an AI team would take instead of the one on the table.
import type { League, Player } from '../types';
import { seasonLabel } from '../constants';
import { contractExp, salaryFor } from '../playerGen';
import { contractSeason, playerName, rosterMaxNow, standardRoster } from './helpers';
import { summerRoster, tradeValue } from './contracts';
import { neutralBalance } from './tradePackages';
import { money, moneyExact } from '../format';
import {
  TradeLeg,
  TradeOffer,
  TradeSide,
  capSalary,
  cashRoom,
  cashValueFor,
  dealTeams,
  evaluateDeal,
  evaluateTrade,
  findPick,
  matchGap,
  matchInfoOf,
  neutralSplit,
  pickLabel,
  pickDepth,
  pickValueFor,
  playerValueFor,
  salaryMatchGap,
  tradeRoster,
  tradedAwayBy,
  untradeable,
  untradeableReason,
  validateDeal,
  validateTrade,
  withMove,
} from './trades';

// ---------------------------------------------------------------- "what would make this work?"

const withA = (offer: TradeOffer, pids: number[], dpids: number[] = []): TradeOffer => ({
  a: { ...offer.a, pids: [...offer.a.pids, ...pids], dpids: [...offer.a.dpids, ...dpids] },
  b: offer.b,
});

/** Side A would end up over the roster limit: sending one more of its players fixes that. */
function aRosterOver(league: League, o: TradeOffer): boolean {
  const std = (pids: number[]) => pids.length;
  const roster = tradeRoster(league, o.a.tid).length;
  // (in free agency the spots pending offers hold count, as validateTrade counts them)
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
    .filter((p) => !o.b.pids.includes(p.pid) && !untradeable(league, p) && !tradedAwayBy(league, p, o.a.tid))
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
 * closed with cash before any pick or player is added. With `best` (the user asking, on demand),
 * up to WORK_FILLERS ways of matching the salary are each topped up and the deal that costs A the
 * least in neutral value is the answer: the least valuable filler alone often meant a star as the
 * only salary that matched and a 2× overpay (Trae Young for Kawhi Leonard), or a bad contract the
 * AI then wanted two firsts to take.
 */
export function makeItWork(league: League, offer: TradeOffer, keep: readonly number[] = [], opts: { cash?: boolean; best?: boolean } = {}): WorkResult {
  return findWork(league, offer, keep, opts);
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

/** Ways of matching the salary "what would make this work?" tries when asked for the best (see makeItWork). */
const WORK_FILLERS = 3;

/**
 * The smallest ask: what the search added to A's side (beyond `base`), dropped again one at a time,
 * the most valuable first, while the deal stays legal and B still takes it. The top-up adds the
 * biggest asset when nothing small covers the gap, and a later round can then cover it alone: the
 * playtest saw a starter and two prospects asked to take a $13M contract (a capologist's "greedy").
 */
function prune(league: League, found: TradeOffer, base: TradeOffer): TradeOffer {
  const ai = found.b.tid;
  const legal = (o: TradeOffer) => validateTrade(league, o).length === 0;
  let cur = found;
  const added = [
    ...cur.a.pids.filter((pid) => !base.a.pids.includes(pid)).map((pid) => ({ kind: 'p' as const, id: pid, v: playerValueFor(league, league.players[pid], ai, true) })),
    ...cur.a.dpids
      .filter((d) => !base.a.dpids.includes(d))
      .map((d) => ({
        kind: 'd' as const,
        id: d,
        v: pickValueFor(
          league,
          league.draftPicks.find((x) => x.dpid === d)!,
          ai,
          true,
        ),
      })),
  ].sort((x, y) => y.v - x.v);
  for (const x of added) {
    const next: TradeOffer = {
      a: { ...cur.a, pids: x.kind === 'p' ? cur.a.pids.filter((p) => p !== x.id) : cur.a.pids, dpids: x.kind === 'd' ? cur.a.dpids.filter((d) => d !== x.id) : cur.a.dpids },
      b: cur.b,
    };
    if (legal(next) && evaluateTrade(league, next).accept) cur = next;
  }
  // (and a cash top-up trimmed to what's still needed)
  if ((cur.a.cash ?? 0) > (base.a.cash ?? 0)) {
    for (let c = base.a.cash ?? 0; c < (cur.a.cash ?? 0); c += 100) {
      const next: TradeOffer = { a: { ...cur.a, cash: c || undefined }, b: cur.b };
      if (legal(next) && evaluateTrade(league, next).accept) {
        cur = next;
        break;
      }
    }
  }
  return cur;
}

function findWork(league: League, offer: TradeOffer, keep: readonly number[] = [], opts: { cash?: boolean; best?: boolean } = {}): WorkResult {
  const r = findWorkRaw(league, offer, keep, opts);
  return r.offer ? { offer: prune(league, r.offer, offer) } : r;
}

function findWorkRaw(league: League, offer: TradeOffer, keep: readonly number[] = [], opts: { cash?: boolean; best?: boolean } = {}): WorkResult {
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
  const spare = (o: TradeOffer) =>
    standardRoster(league, o.a.tid)
      .filter((p) => !o.a.pids.includes(p.pid) && !off.has(p.pid) && !untradeableReason(league, p))
      .map((p) => ({ p, v: tradeValue(league, p, 'retool'), sal: capSalary(league, p.pid) }));
  if (gapA > 0) {
    const pool = spare(cur).filter((x) => x.sal > 0);
    const options: { pids: number[]; v: number }[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].sal >= gapA) options.push({ pids: [pool[i].p.pid], v: pool[i].v });
      for (let j = i + 1; j < pool.length; j++) if (pool[i].sal + pool[j].sal >= gapA) options.push({ pids: [pool[i].p.pid, pool[j].p.pid], v: pool[i].v + pool[j].v });
    }
    const sorted = options.sort((x, y) => x.v - y.v);
    const fix = sorted.find((o) => legal(withA(cur, o.pids)));
    if (!fix) return { offer: null, why: 'salary' };
    if (opts.best) {
      // the least valuable filler, the one nearest no value either way, and the next: each topped up,
      // the one that costs A least in neutral value wins
      const near = [...sorted].sort((x, y) => Math.abs(x.v) - Math.abs(y.v)).find((o) => o !== fix && legal(withA(cur, o.pids)));
      const next = sorted.find((o) => o !== fix && o !== near && legal(withA(cur, o.pids)));
      const tries = [fix, near, next].filter((x): x is { pids: number[]; v: number } => !!x).slice(0, WORK_FILLERS);
      // (each with picks alone first: a team that wants help now would rather pay with picks than
      // with its rotation, and the cheapest of all the versions wins below)
      const done = tries.flatMap((t) => {
        const start = withA(cur, t.pids);
        const byPicks = topUp(league, start, spare, legal, ai, { ...opts, picksOnly: true });
        const r = topUp(league, start, spare, legal, ai, opts);
        return [byPicks.offer, r.offer].filter((o): o is TradeOffer => !!o);
      });
      if (!done.length) return { offer: null, why: 'value' };
      // (each trimmed to its smallest ask before they're compared)
      return { offer: done.map((o) => prune(league, o, offer)).sort((x, y) => neutralBalance(league, y).net - neutralBalance(league, x).net)[0] };
    }
    cur = withA(cur, fix.pids);
  }
  return topUp(league, cur, spare, legal, ai, opts);
}

/** The value top-up of findWork: each round adds the smallest pick or player that covers what's missing, else the biggest (see makeItWork); `picksOnly`: picks alone. */
function topUp(
  league: League,
  start: TradeOffer,
  spare: (o: TradeOffer) => { p: Player; v: number; sal: number }[],
  legal: (o: TradeOffer) => boolean,
  ai: number,
  opts: { cash?: boolean; picksOnly?: boolean },
): WorkResult {
  let cur = start;
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
    const players = opts.picksOnly
      ? []
      : spare(cur)
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

/**
 * Why no version of a deal works for the other team, in its own numbers: how many first-round picks
 * like the asker's best it sees its side as worth, what it sees his side as, and what all the picks
 * he could add come to as a pile. "ATL can't find a version of this they'd take. Ask for less." had
 * been the whole answer.
 */
export function noVersionWhy(league: League, offer: TradeOffer): string {
  const ai = offer.b.tid;
  const abbrev = league.teams[ai].abbrev;
  const ev = evaluateTrade(league, offer);
  const mine = league.draftPicks
    .filter((d) => d.tid === offer.a.tid && d.round === 1)
    .map((d) => pickValueFor(league, d, ai, true))
    .sort((x, y) => y - x);
  const first = mine[0] ?? 0;
  if (!(first > 0) || !(ev.valueOut > 0)) return `${abbrev} can't find a version of this they'd take. Ask for less.`;
  const depth = pickDepth(league, ai);
  const pile = mine.slice(0, 5).reduce((a, v, i) => a + v * depth[Math.min(i, depth.length - 1)], 0);
  const n = (v: number) => {
    const x = v / first;
    return x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '');
  };
  const side = Math.max(0, ev.valueIn);
  return `${abbrev} rate what they'd send at about ${n(ev.valueOut)} first-round picks like your best one, and your side at ${n(side)}. ${
    mine.length ? `All of your firsts in one pile come to ${n(pile)} for them (each extra pick counts for less)` : 'You have no first to add'
  }. It needs a player they rate, or a smaller ask.`;
}

// ---------------------------------------------------------------- "what would make this work?", three teams

/** One thing "make it work" added to a three-team deal: what, from whom and to whom. */
export interface DealAdd {
  kind: 'player' | 'pick';
  id: number;
  from: number;
  to: number;
}

/**
 * A three-team deal every other team takes, or why none was found: the rules block it whatever is
 * added ('rules'), no contract of the asking team's matches the salary ('salary'), another team
 * can't send back enough ('theirSalary'), the asking team hasn't the value ('value'), or a team
 * (`idle`) has no part in the deal and none could be found for it ('idle': it is a two-team deal).
 */
export type DealWork = { legs: TradeLeg[]; added: DealAdd[]; why?: undefined } | { legs: null; why: 'rules' | 'salary' | 'theirSalary' | 'value' | 'idle'; idle?: number };

/** A team in the deal with nothing going either way (the builder keeps its card: the rules say to take it out). */
const idleIn = (legs: TradeLeg[]) => dealTeams(legs).filter((tid) => !legs.some((l) => (l.tid === tid || l.to === tid) && l.pids.length + l.dpids.length > 0));

/** Would the asking team end up over the roster limit: sending one more of its players fixes that. */
function rosterOver(league: League, legs: TradeLeg[], from: number): boolean {
  const std = (pids: number[]) => pids.length;
  const out = std(legs.filter((l) => l.tid === from).flatMap((l) => l.pids));
  const inc = std(legs.filter((l) => l.to === from).flatMap((l) => l.pids));
  return inc > out && tradeRoster(league, from).length - out + inc > rosterMaxNow(league);
}

/** The rule problems adding players can fix: each team's salary matching, a full roster on the asking side, a team with no part yet. */
function fixable(league: League, legs: TradeLeg[], from: number): number {
  let n = idleIn(legs).length + (rosterOver(league, legs, from) ? 1 : 0);
  for (const tid of dealTeams(legs)) {
    const out = legs.filter((l) => l.tid === tid).flatMap((l) => l.pids);
    const inc = legs.filter((l) => l.to === tid).flatMap((l) => l.pids);
    if (matchGap(league, matchInfoOf(league, tid, out, inc)) > 0) n++;
  }
  return n;
}

/**
 * "What would make this work?" for a deal of three teams, asked by team `from` (the user): what it
 * adds so that the rules allow the deal and both other teams say yes. Salary first, as in a
 * two-team deal: a team taking back more than matching allows sends its least wanted contract that
 * covers the gap to the asking team; the asking team sends its least valuable one that does to
 * whichever team can take it, one with no part in the deal yet first (a third team with the room
 * for it is what a three-team deal is for). Then value: each round, the team furthest from yes gets
 * the asking team's smallest pick or player that covers what it is missing, else its most valuable
 * one (a full roster sends a player). The asking team's untouchables are never added, and nothing
 * already in the deal moves. A team left with no part in it is said so: that deal is for two teams.
 */
export function makeDealWork(league: League, legs: TradeLeg[], from = league.userTid): DealWork {
  const r = findDealWork(league, legs, from);
  if (!r.legs) return r;
  // the smallest ask, as in a two-team deal: each thing added dropped again (the most valuable to its taker first) while every GM still says yes
  const build = (adds: DealAdd[]) => adds.reduce((l, a) => withMove(l, a.from, a.to, a.kind === 'player' ? { pid: a.id } : { dpid: a.id }), legs);
  let kept = [...r.added];
  const worth = (a: DealAdd) =>
    a.kind === 'player'
      ? playerValueFor(league, league.players[a.id], a.to, true)
      : pickValueFor(
          league,
          league.draftPicks.find((d) => d.dpid === a.id)!,
          a.to,
          true,
        );
  for (const a of [...r.added].sort((x, y) => worth(y) - worth(x))) {
    const without = kept.filter((x) => x !== a);
    const next = build(without);
    if (validateDeal(league, next).length === 0 && evaluateDeal(league, next).accept) kept = without;
  }
  return { legs: build(kept), added: kept };
}

function findDealWork(league: League, start: TradeLeg[], from: number): DealWork {
  let cur = start;
  const added: DealAdd[] = [];
  const others = dealTeams(cur).filter((t) => t !== from);
  if (!others.length) return { legs: null, why: 'rules' };
  const broken = (legs: TradeLeg[]) => validateDeal(league, legs).length;
  if (broken(cur) > fixable(league, cur, from)) return { legs: null, why: 'rules' };
  const inDeal = (legs: TradeLeg[]) => ({ pids: new Set(legs.flatMap((l) => l.pids)), dpids: new Set(legs.flatMap((l) => l.dpids)) });
  const off = new Set(from === league.userTid ? (league.untouchable ?? []) : []);
  const gapOf = (legs: TradeLeg[], tid: number) =>
    matchGap(
      league,
      matchInfoOf(
        league,
        tid,
        legs.filter((l) => l.tid === tid).flatMap((l) => l.pids),
        legs.filter((l) => l.to === tid).flatMap((l) => l.pids),
      ),
    );
  const add = (legs: TradeLeg[], a: DealAdd) => withMove(legs, a.from, a.to, a.kind === 'player' ? { pid: a.id } : { dpid: a.id });
  const spare = (legs: TradeLeg[]) => {
    const used = inDeal(legs);
    return standardRoster(league, from).filter((p) => !used.pids.has(p.pid) && !off.has(p.pid) && !untradeableReason(league, p));
  };
  // ---- salary, in rounds (one side's fix can open the other's): the asking team's own, then theirs
  for (let round = 0; round < 3; round++) {
    if (dealTeams(cur).every((tid) => gapOf(cur, tid) === 0)) break;
    // the asking team takes back too much: its least valuable contract that covers the gap (else its biggest, and
    // another round), to a team that can take it without breaking its own matching, one with no part in the deal first
    for (let i = 0; i < 2 && gapOf(cur, from) > 0; i++) {
      const gap = gapOf(cur, from);
      const pool = spare(cur)
        .map((p) => ({ p, v: tradeValue(league, p, 'retool'), sal: capSalary(league, p.pid) }))
        .filter((x) => x.sal > 0)
        .sort((x, y) => x.v - y.v);
      const tries = [...pool.filter((x) => x.sal >= gap), ...[...pool].sort((x, y) => y.sal - x.sal).slice(0, 1)];
      const idle = idleIn(cur);
      const dests = [...others].sort((x, y) => Number(idle.includes(y)) - Number(idle.includes(x)));
      const moves = dests.flatMap((to) => tries.map((x) => ({ kind: 'player' as const, id: x.p.pid, from, to })));
      // (of the ones that help, the one its taker can best match: no gap of its own, else the smallest)
      const fill = moves
        .filter((m) => broken(add(cur, m)) <= broken(cur) && gapOf(add(cur, m), from) < gap)
        .map((m) => ({ m, theirs: gapOf(add(cur, m), m.to) }))
        .sort((x, y) => x.theirs - y.theirs)[0]?.m;
      if (!fill) return { legs: null, why: 'salary' };
      cur = add(cur, fill);
      added.push(fill);
    }
    if (gapOf(cur, from) > 0) return { legs: null, why: 'salary' };
    // another team takes back too much: the contract it would most like to move that covers the gap, to the asking team
    for (const tid of others) {
      const gap = gapOf(cur, tid);
      if (gap <= 0) continue;
      const used = inDeal(cur);
      const fill = tradeRoster(league, tid)
        .filter((p) => !used.pids.has(p.pid) && !untradeable(league, p) && !tradedAwayBy(league, p, from) && capSalary(league, p.pid) >= gap)
        .map((p) => ({ a: { kind: 'player' as const, id: p.pid, from: tid, to: from }, v: playerValueFor(league, p, tid, false) }))
        .sort((x, y) => x.v - y.v)
        .find((x) => gapOf(add(cur, x.a), tid) === 0 && broken(add(cur, x.a)) <= broken(cur));
      if (!fill) return { legs: null, why: 'theirSalary' };
      cur = add(cur, fill.a);
      added.push(fill.a);
    }
  }
  if (dealTeams(cur).some((tid) => gapOf(cur, tid) > 0)) return { legs: null, why: gapOf(cur, from) > 0 ? 'salary' : 'theirSalary' };
  // a team with no part in the deal, and no salary found its way to it: nothing that follows gives it one
  const out = idleIn(cur).filter((t) => t !== from);
  if (out.length) return { legs: null, why: 'idle', idle: out[0] };
  // ---- value: the team furthest from yes gets what covers its gap (a full roster sends a player)
  for (let iter = 0; iter < 8; iter++) {
    const ev = evaluateDeal(league, cur);
    if (ev.accept) return { legs: cur, added };
    const no = ev.teams.filter((t) => !t.accept).sort((x, y) => x.delta - y.delta)[0];
    // (too many firsts out of their side: nothing added to it changes that)
    if (no?.parts.tooManyFirsts) return { legs: null, why: 'value' };
    const full = rosterOver(league, cur, from);
    if (!no && !full) break;
    const idle = idleIn(cur).filter((t) => t !== from);
    // who gets it: the team that says no; with everyone at yes and a player to shed, a team with no part yet, else any
    const tos = no ? [no.tid] : idle.length ? idle : others;
    const need = no ? -no.delta : 0;
    const errs = broken(cur);
    const used = inDeal(cur);
    const picks = full
      ? []
      : league.draftPicks
          .filter((d) => d.tid === from && !used.dpids.has(d.dpid))
          .flatMap((d) => tos.map((to) => ({ a: { kind: 'pick' as const, id: d.dpid, from, to }, v: pickValueFor(league, d, to, true) })));
    const players = spare(cur).flatMap((p) => tos.map((to) => ({ a: { kind: 'player' as const, id: p.pid, from, to }, v: playerValueFor(league, p, to, true) })));
    const cands = [...picks, ...players].filter((c) => (full || c.v > 0) && broken(add(cur, c.a)) <= errs);
    if (!cands.length) break;
    const covering = cands.filter((c) => c.v >= need).sort((x, y) => x.v - y.v);
    const short = cands.filter((c) => c.v < need).sort((x, y) => y.v - x.v);
    const pick = covering[0] && (covering[0].v <= need * 1.5 + 2 || !short.length) ? covering[0] : short[0];
    cur = add(cur, pick.a);
    added.push(pick.a);
  }
  const last = evaluateDeal(league, cur);
  if (last.accept) return { legs: cur, added };
  // every GM at yes and the rules passing but for a team with no part in it: this is a two-team deal
  const idle = idleIn(cur).filter((t) => t !== from);
  if (idle.length && broken(cur) === idle.length && last.teams.every((t) => t.accept || idle.includes(t.tid))) return { legs: null, why: 'idle', idle: idle[0] };
  // (a GM still at no is the reason, whatever rule is also open: more value was what it took)
  return { legs: null, why: last.teams.some((t) => !t.accept) || !broken(cur) ? 'value' : 'rules' };
}

/** What "make it work" added, in words: "Lu Dort to ATL and a 2029 2nd to BOS". */
export function dealAddsText(league: League, added: DealAdd[]): string {
  const name = (a: DealAdd) => (a.kind === 'player' ? playerName(league.players[a.id]) : `the ${pickLabel(league, findPick(league, a.id)!)}`);
  const parts = added.map((a) => `${name(a)} to ${league.teams[a.to].abbrev}`);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
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
  return findCounters(league, offer, max);
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
