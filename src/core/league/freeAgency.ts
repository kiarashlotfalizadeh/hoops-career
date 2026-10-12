import type { League, Player, Team } from '../types';
import { FREE_AGENT } from '../types';
import { Rng } from '../random';
import { CAP } from '../constants';
import { contractExp, playerAge } from '../playerGen';
import {
  CAP_FOR,
  OFFSEASON_ROSTER_MAX,
  TWO_WAY_MAX,
  contractSeason,
  addInbox,
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
  MLE_YEARS,
  type Ask,
  askingContract,
  leaveTeam,
  marketSalary,
  mleRoom,
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
  for (const p of freeAgents(league)) {
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

/** Why the user can't offer free agent `p` this much at all (roster or cap), or null. Asking price aside. */
export function offerBlockedReason(league: League, p: Player, amount: number, years: number): string | null {
  const tid = league.userTid;
  const season = contractSeason(league);
  const max = rosterMaxNow(league);
  if (standardRoster(league, tid).length >= max) return `Your roster is full (${max}). Release or trade someone first.`;
  const route = signingRoute(league, tid, amount, season, p);
  if (route === 'mle' && years > MLE_YEARS) return `Mid-level exception deals run ${MLE_YEARS} years at most.`;
  if (route) return null;
  const cap = CAP_FOR(league, season);
  const space = Math.max(0, cap.salaryCap - payroll(league, tid, season));
  const mle = mleRoom(league, tid, season);
  const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
  return `${space >= 50 ? `Not enough cap space ($${(space / 1000).toFixed(1)}M)` : 'No cap space'}. Over the cap you can offer his minimum ($${(min / 1000).toFixed(2)}M)${mle > 0 ? ` or up to $${(mle / 1000).toFixed(1)}M with your mid-level exception` : ''}.`;
}

export function userOffer(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (!p || p.tid !== FREE_AGENT) return { ok: false, reason: 'Not a free agent.' };
  const season = contractSeason(league);
  const tid = league.userTid;
  const closed = signingClosedReason(league) ?? offerBlockedReason(league, p, amount, years);
  if (closed) return { ok: false, reason: closed };
  const res = willSign(league, p, tid, amount, years);
  if (!res.ok) return res;
  const mle = signingRoute(league, tid, amount, season, p) === 'mle';
  if (mle) league.teams[tid].mleSeason = season;
  signPlayer(league, p, tid, amount, years, { start: season });
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

export function userResign(league: League, pid: number, amount: number, years: number): { ok: boolean; reason: string } {
  const p = league.players[pid];
  if (league.fired) return { ok: false, reason: FIRED_REASON };
  if (league.phase !== 'resign') return { ok: false, reason: 'Re-signing happens between the draft and free agency.' };
  if (!p || p.tid !== league.userTid) return { ok: false, reason: 'Not on your team.' };
  if (contractExp(p.contract) > league.season) return { ok: false, reason: `${playerName(p)} is still under contract.` };
  const res = willSign(league, p, league.userTid, amount, years);
  if (!res.ok) return res;
  signPlayer(league, p, league.userTid, amount, years, { start: league.season + 1 });
  return { ok: true, reason: `${playerName(p)} re-signs!` };
}
