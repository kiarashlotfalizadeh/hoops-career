// The trade finder: value tiers, who is available (a franchise player, on the block), the league's
// targets with their filters, and how much salary a team can take back.
import type { League, Player, Pos } from '../types';
import { CAP } from '../constants';
import { playerAge } from '../playerGen';
import { CAP_FOR, contractSeason, standardRoster } from './helpers';
import { taxCapped, tradeValue } from './contracts';
import { capPayroll } from './freeAgency';
import { capSalary, untradeable } from './trades';

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
