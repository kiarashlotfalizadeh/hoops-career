// Packages for the user's assets: the best offer each AI team would make for what the user puts
// up, and how a deal balances in league-neutral value.
import type { DraftPick, League, Player } from '../types';
import { rosterMaxNow, standardRoster } from './helpers';
import { tradeValue } from './contracts';
import {
  DEPTH,
  MAX_FIRSTS_OUT,
  PICK_DEPTH,
  PICK_LENS,
  TradeOffer,
  TradeSide,
  capSalary,
  cashValue,
  evaluateTrade,
  findPick,
  judgedPick,
  marketPickValue,
  pickValue,
  pickValueFor,
  playerValueFor,
  salaryMatchGap,
  stepienError,
  swapOutlook,
  swapPicks,
  tradeRoster,
  tradedAwayBy,
  untradeable,
  validateTrade,
  weighted,
} from './trades';

// ---------------------------------------------------------------- packages for the user's assets

/** No AI team sends more than this many picks in one package (firsts count toward MAX_FIRSTS_OUT too). */
export const MAX_PICKS_OUT = 3;
/** Ways to make the money match that a package puts to the other team, the ones worth most to the user first (see findPackage). */
const FILL_TRIES = 4;

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
  return findPackage(league, tid, give);
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
  const budget = want;
  // after the season, only next season's contracts take a spot
  const max = rosterMaxNow(league);
  const stdOut = players.length;
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
  // players it can actually move (no expiring deals after the season)
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

  /** Its assets worth most to the user, within `room` of what it thinks the user's side is worth, on top of `base`; `only`: of one kind. */
  const greedy = (skip: Set<number>, only?: Asset['kind'], room = budget, base: Asset[] = []): Asset[] => {
    const pkg: Asset[] = [];
    let sum = 0;
    let np = base.filter((a) => a.kind === 'p').length;
    let nd = 0;
    let nf = 0;
    for (let i = 0; i < assets.length; i++) {
      if (skip.has(i)) continue;
      const a = assets[i];
      if (only && a.kind !== only) continue;
      if (a.kind === 'p' && np >= maxPlayersIn) continue;
      // two firsts and three picks at most (second-rounders used to count toward the firsts)
      if (a.kind === 'd' && (nd >= MAX_PICKS_OUT || (a.first && nf >= MAX_FIRSTS_OUT))) continue;
      if (sum + a.ai > room) continue;
      if (a.first && !stepienOk([...base, ...pkg, a])) continue;
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

  // salary fillers: contracts of its that make the money match (any it can move: the ones it values least cost the package least)
  const fillers = roster.map(player).filter((a) => a.sal > 0);
  /** Both teams pass salary matching with `pkg` coming back. */
  const moneyWorks = (pkg: Asset[]) => {
    const o = offerOf(pkg);
    return salaryMatchGap(league, o, 'a') === 0 && salaryMatchGap(league, o, 'b') === 0;
  };
  const aiOf = (xs: Asset[]) => xs.reduce((a, x) => a + x.ai, 0);
  const mineOf = (xs: Asset[]) => xs.reduce((a, x) => a + x.mine, 0);
  /** One or two of its players (`free`) that make the money match on top of `pkg`, costing it no more than `room`. */
  const moneyFits = (pkg: Asset[], room: number): Asset[][] => {
    const used = new Set(pkg.filter((a) => a.kind === 'p').map((a) => a.id));
    const spots = maxPlayersIn - used.size;
    const free = fillers.filter((x) => !used.has(x.id));
    const fits: Asset[][] = [];
    if (spots >= 1) for (const f of free) if (f.ai <= room && moneyWorks([...pkg, f])) fits.push([f]);
    if (spots >= 2)
      for (let i = 0; i < free.length; i++)
        for (let j = i + 1; j < free.length; j++) if (free[i].ai + free[j].ai <= room && moneyWorks([...pkg, free[i], free[j]])) fits.push([free[i], free[j]]);
    return fits;
  };

  let best: { pkg: Asset[]; mine: number } | null = null;
  const consider = (pkg: Asset[]): boolean => {
    const nPlayers = pkg.filter((a) => a.kind === 'p').length;
    if (!pkg.length || nPlayers < minPlayersOut || nPlayers > maxPlayersIn) return false;
    const ev = evaluateTrade(league, offerOf(pkg));
    if (!ev.accept) return false;
    const mine = mineOf(pkg);
    if (!best || mine > best.mine) best = { pkg, mine };
    return true;
  };
  const variants: Set<number>[] = [new Set(), new Set([0]), new Set([1]), new Set([0, 1]), new Set([2])];
  for (const skip of variants) {
    const pkg = greedy(skip);
    consider(pkg);
    if (moneyWorks(pkg)) continue;
    // the money doesn't match: one or two of its players that make it match, within what it thinks
    // the user's side is worth; of those, the FILL_TRIES worth most to the user are put to it
    const fits = moneyFits(pkg, budget - aiOf(pkg));
    for (const fit of fits.sort((x, y) => mineOf(y) - mineOf(x)).slice(0, FILL_TRIES)) consider([...pkg, ...fit]);
  }
  // The money first, then its picks. A team over the cap can't take a salary in for a pick alone, and
  // a package filled by value up to its budget left no room for the contract that makes the money
  // match: every contender a rebuilding team offered a veteran to came back with nothing (the other
  // half of "no contender pays a first for a veteran", 2026-11-24). So: the ways its players make the
  // money match, the ones it gives up least for first, each topped up with its picks within what's
  // left; and since its verdict counts more than the assets (the tax a salary adds, a roster spot
  // it has to cut, its front office's edge), a pick comes off at a time until it says yes.
  const base: Asset[][] = moneyWorks([]) ? [[]] : moneyFits([], budget);
  for (const fit of base.sort((x, y) => aiOf(x) - aiOf(y)).slice(0, FILL_TRIES)) {
    const picks = greedy(new Set(), 'd', budget - aiOf(fit), fit);
    while (picks.length && !consider([...fit, ...picks])) picks.sort((x, y) => y.ai - x.ai).pop();
  }
  const b = best as { pkg: Asset[]; mine: number } | null;
  return b ? { tid, offer: offerOf(b.pkg), myValue: b.mine, giveValue } : null;
}

/**
 * A salary dump: team `from` sends player `bad` to team `to` for nothing (or, `back`, for cheaper
 * players of its), with its picks attached from the cheapest up (the cheapest makes way for a
 * better one past three; two firsts at most; no first that breaks the Stepien rule) until `done`
 * says the deal works. `to` is side A. Null when the rules don't allow the deal (the taker can't
 * absorb the salary) or no picks get it done.
 */
export function dumpPackage(league: League, from: number, to: number, bad: Player, done: (o: TradeOffer) => boolean, back: Player[] = []): TradeOffer | null {
  const dps: DraftPick[] = [];
  const offer = (): TradeOffer => ({ a: { tid: to, pids: back.map((p) => p.pid), dpids: [] }, b: { tid: from, pids: [bad.pid], dpids: dps.map((d) => d.dpid) } });
  if (validateTrade(league, offer()).length) return null;
  const picks = league.draftPicks.filter((d) => d.tid === from && !tradedAwayBy(league, d, to)).sort((x, y) => pickValue(league, x) - pickValue(league, y) || x.dpid - y.dpid);
  for (const x of picks) {
    if (done(offer())) break;
    const out = dps.length >= MAX_PICKS_OUT ? dps[0] : null;
    if (x.round === 1 && dps.filter((d) => d !== out && d.round === 1).length >= MAX_FIRSTS_OUT) continue;
    if (out) dps.shift();
    dps.push(x);
    const o = offer();
    if (stepienError(league, o, o.b)) {
      dps.pop();
      if (out) dps.unshift(out);
    }
  }
  return done(offer()) ? offer() : null;
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
          // (on the user's market: a first counts for what every team counts it in a deal with him, trades.ts FIRST_MARKET)
          return dp ? [marketPickValue(league, judgedPick(dp, s, to, incoming))] : [];
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
