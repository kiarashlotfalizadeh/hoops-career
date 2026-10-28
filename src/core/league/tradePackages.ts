// Packages for the user's assets: the best offer each AI team would make for what the user puts
// up, and how a deal balances in league-neutral value.
import type { DraftPick, League, Player } from '../types';
import { rosterMaxNow, standardRoster } from './helpers';
import { tradeValue } from './contracts';
import { withHoldsMemo } from './freeAgency';
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
  frozenFirst,
  judgedPick,
  matchInfo,
  pickValue,
  pickValueFor,
  playerValueFor,
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
  const budget = want;
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
  // (past the second apron after the deal, its latest first is frozen: picks don't move salary, so that's known now)
  const frozen = matchInfo(league, offer(), 'b').apron2 ? frozenFirst(league, from) : undefined;
  const picks = league.draftPicks
    .filter((d) => d.tid === from && d !== frozen && !tradedAwayBy(league, d, to))
    .sort((x, y) => pickValue(league, x) - pickValue(league, y) || x.dpid - y.dpid);
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
