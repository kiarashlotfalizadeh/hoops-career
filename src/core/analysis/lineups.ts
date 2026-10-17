// Lineups over a season's stored games: five-man units, and the pairs and trios inside them (every
// five-man stint counts for each pair and trio on the floor), and each player's on/off split from his
// season line against his team's. Also the two Rotation edits the lineup screen makes: a unit as the
// starters (by the Rotation screen's own swap of depth-chart spots) or as the closers.

import type { League, LineupStat, Player, Rotation } from '../types';
import { isOut } from '../availability';

/** Possessions under which a unit's ratings are mostly noise: a net rating over 100 possessions has a standard error of about 16. */
export const LOW_SAMPLE_POSS = 100;

/** Standard error of a net rating (per 100 possessions) over `poss` possessions: about 1.15 points of spread a trip, at each end. */
export const netSE = (poss: number) => (poss > 0 ? (100 * Math.SQRT2 * 1.15) / Math.sqrt(poss) : Infinity);

export interface LineupAgg {
  /** The players' ids, sorted and joined with '-'. */
  key: string;
  pids: number[];
  min: number;
  poss: number;
  ptsFor: number;
  ptsAgainst: number;
  /** Points scored and allowed per 100 of the unit's own possessions (it defends about as many). */
  ortg: number;
  drtg: number;
  net: number;
}

/** Per 100 possessions. */
const per100 = (pts: number, poss: number) => (poss > 0 ? (pts / poss) * 100 : 0);

/** A team's lineup stints in a season's stored games (the user's games keep them). */
function stints(league: League, tid: number, season: number): LineupStat[] {
  const out: LineupStat[] = [];
  for (const g of league.games) {
    if (g.season !== season || !g.lineups) continue;
    const side = g.home.tid === tid ? 0 : g.away.tid === tid ? 1 : -1;
    if (side < 0) continue;
    for (const l of g.lineups) if (l.t === side) out.push(l);
  }
  return out;
}

/** Every `k`-player group from `pids`, in order. */
function groups(pids: number[], k: number): number[][] {
  const out: number[][] = [];
  const rec = (from: number, cur: number[]) => {
    if (cur.length === k) return void out.push([...cur]);
    for (let i = from; i < pids.length; i++) rec(i + 1, [...cur, pids[i]]);
  };
  rec(0, []);
  return out;
}

/**
 * A team's units of `size` players in a season (five-man lineups, or the trios and pairs inside them),
 * most minutes first. A five-man unit lists its players as they first took the floor together; trios
 * and pairs by id.
 */
export function lineupUnits(league: League, tid: number, size: 2 | 3 | 5, season = league.season): LineupAgg[] {
  const m = new Map<string, LineupAgg>();
  for (const l of stints(league, tid, season)) {
    const sorted = [...l.pids].sort((a, b) => a - b);
    for (const pids of size >= l.pids.length ? [l.pids] : groups(sorted, size)) {
      const key = [...pids].sort((a, b) => a - b).join('-');
      let e = m.get(key);
      if (!e) m.set(key, (e = { key, pids: [...pids], min: 0, poss: 0, ptsFor: 0, ptsAgainst: 0, ortg: 0, drtg: 0, net: 0 }));
      e.min += l.sec / 60;
      e.poss += l.poss;
      e.ptsFor += l.ptsFor;
      e.ptsAgainst += l.ptsAgainst;
    }
  }
  const out = [...m.values()];
  for (const e of out) {
    e.ortg = per100(e.ptsFor, e.poss);
    e.drtg = per100(e.ptsAgainst, e.poss);
    e.net = e.poss ? ((e.ptsFor - e.ptsAgainst) / e.poss) * 100 : 0;
  }
  return out.sort((a, b) => b.min - a.min);
}

/** A team's five-man lineups in a season, most minutes first. */
export function seasonLineups(league: League, tid = league.userTid, season = league.season): LineupAgg[] {
  return lineupUnits(league, tid, 5, season);
}

export interface Split {
  poss: number;
  ptsFor: number;
  ptsAgainst: number;
  ortg: number;
  drtg: number;
  net: number;
}

export interface OnOff {
  pid: number;
  gp: number;
  min: number;
  /** The team with him on the floor, and with him off it (the rest of its season). */
  on: Split;
  off: Split;
  /** On minus off, in net rating. */
  diff: number;
}

const split = (poss: number, ptsFor: number, ptsAgainst: number): Split => ({
  poss,
  ptsFor,
  ptsAgainst,
  ortg: per100(ptsFor, poss),
  drtg: per100(ptsAgainst, poss),
  net: poss ? ((ptsFor - ptsAgainst) / poss) * 100 : 0,
});

/**
 * Each player's on/off split for a team's regular season, from his season line's on-court numbers
 * against the team's season (so it works for any team, and for seasons whose games are gone).
 * Ratings are per 100 of the team's own possessions at each end, as the lineup tables have them.
 */
export function onOffSplits(league: League, tid: number, season = league.season): OnOff[] {
  const ts = league.teams[tid]?.seasons.find((s) => s.season === season);
  if (!ts || ts.poss <= 0) return [];
  const m = new Map<number, { gp: number; min: number; poss: number; pf: number; pa: number }>();
  for (const p of Object.values(league.players)) {
    for (const s of p.stats) {
      if (s.season !== season || s.tid !== tid || s.playoffs || s.real || !(s.onPoss > 0)) continue;
      const e = m.get(p.pid) ?? { gp: 0, min: 0, poss: 0, pf: 0, pa: 0 };
      e.gp += s.gp;
      e.min += s.min;
      e.poss += s.onPoss;
      e.pf += s.onPtsFor;
      e.pa += s.onPtsAgainst;
      m.set(p.pid, e);
    }
  }
  return [...m.entries()]
    .map(([pid, e]) => {
      const on = split(e.poss, e.pf, e.pa);
      const off = split(ts.poss - e.poss, ts.ptsFor - e.pf, ts.ptsAgainst - e.pa);
      return { pid, gp: e.gp, min: e.min, on, off, diff: on.net - off.net };
    })
    .sort((a, b) => b.min - a.min);
}

// ---------------------------------------------------------------- putting a unit on the floor

/** The depth chart as the Rotation screen lists it: the saved order for players on the roster, then anyone it misses. */
export function depthOrder(r: Rotation, roster: { pid: number }[]): number[] {
  const on = new Set(roster.map((p) => p.pid));
  const order = r.order.filter((pid) => on.has(pid));
  for (const p of roster) if (!order.includes(p.pid)) order.push(p.pid);
  return order;
}

/** Trade two players' depth-chart spots, and their minutes with them: the role moves with the spot. */
export function swapSpots(r: Rotation, order: number[], a: number, b: number) {
  const o = order.slice();
  const i = o.indexOf(a);
  const j = o.indexOf(b);
  if (i < 0 || j < 0) return;
  [o[i], o[j]] = [o[j], o[i]];
  r.order = o;
  const mine = r.minutes[a] ?? 0;
  r.minutes[a] = r.minutes[b] ?? 0;
  r.minutes[b] = mine;
}

type RosterPlayer = Pick<Player, 'pid' | 'injury' | 'suspension'>;

/**
 * Make a five-man unit the starters: each of them not starting trades spots (and minutes) with a
 * starter outside the unit, as a swap on the Rotation screen does, and the rotation becomes the
 * coach's. False (nothing changed) when one of them isn't on the roster or is out (hurt or suspended).
 */
export function unitToStarters(r: Rotation, roster: RosterPlayer[], unit: number[]): boolean {
  const byId = new Map(roster.map((p) => [p.pid, p]));
  if (unit.length !== 5 || unit.some((pid) => !byId.get(pid) || isOut(byId.get(pid)!))) return false;
  let order = depthOrder(r, roster);
  // the engine starts the first five healthy players
  const starters = order.filter((pid) => !isOut(byId.get(pid)!)).slice(0, 5);
  const incoming = unit.filter((pid) => !starters.includes(pid)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const outgoing = starters.filter((pid) => !unit.includes(pid));
  incoming.forEach((pid, i) => {
    swapSpots(r, order, pid, outgoing[i]);
    order = r.order;
  });
  r.manual = true;
  return true;
}

/** Make a five-man unit the closers (in depth-chart order). False when one of them isn't on the roster. */
export function unitToClosers(r: Rotation, roster: RosterPlayer[], unit: number[]): boolean {
  if (unit.length !== 5 || unit.some((pid) => !roster.some((p) => p.pid === pid))) return false;
  const order = depthOrder(r, roster);
  r.closers = [...unit].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  r.manual = true;
  return true;
}
