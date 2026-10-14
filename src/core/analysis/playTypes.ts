// Play types (how possessions finish: P&R ball handler, spot-up, cut...) across a season's stored
// games: the league's points per possession for each, and one team's offense and defense by type.

import type { League } from '../types';

/** Engine-typical points per possession by play type, for types without enough of this season's games yet. */
export const DEFAULT_PPP: Record<string, number> = {
  pnrBH: 0.85,
  pnrRoll: 1.3,
  iso: 0.95,
  post: 1.0,
  spotup: 1.05,
  offscreen: 1.05,
  handoff: 1.0,
  cut: 1.35,
  transition: 1.3,
  putback: 1.4,
  misc: 0.2,
};

/** Per-type points per possession across this season's stored games (both teams), with engine-typical fallbacks. */
export function playTypeBaselines(league: League): Record<string, number> {
  const sum: Record<string, { poss: number; pts: number }> = {};
  for (const g of league.games) {
    if (g.season !== league.season) continue;
    for (const box of [g.home, g.away]) {
      for (const [k, v] of Object.entries(box.playTypes ?? {})) {
        const e = (sum[k] ??= { poss: 0, pts: 0 });
        e.poss += v.poss;
        e.pts += v.pts;
      }
    }
  }
  const out = { ...DEFAULT_PPP };
  for (const [k, v] of Object.entries(sum)) if (v.poss >= 300) out[k] = v.pts / v.poss;
  return out;
}

/** How unusual a play type's points are against its baseline, in standard errors (scores are mostly 2s and 3s). */
export function zScore(v: { poss: number; pts: number }, base: number) {
  const sd = Math.sqrt(Math.max(0.5, 2.3 * base - base * base));
  return (v.pts / v.poss - base) / (sd / Math.sqrt(v.poss));
}

export interface PlayTypeAgg {
  key: string;
  off: { poss: number; pts: number };
  def: { poss: number; pts: number };
}

export function seasonPlayTypes(league: League, tid = league.userTid): PlayTypeAgg[] {
  const m = new Map<string, PlayTypeAgg>();
  for (const g of league.games) {
    if (g.season !== league.season) continue;
    const mine = g.home.tid === tid ? g.home : g.away.tid === tid ? g.away : null;
    if (!mine) continue;
    const opp = mine === g.home ? g.away : g.home;
    for (const [k, v] of Object.entries(mine.playTypes)) {
      const e = m.get(k) ?? { key: k, off: { poss: 0, pts: 0 }, def: { poss: 0, pts: 0 } };
      e.off.poss += v.poss;
      e.off.pts += v.pts;
      m.set(k, e);
    }
    for (const [k, v] of Object.entries(opp.playTypes)) {
      const e = m.get(k) ?? { key: k, off: { poss: 0, pts: 0 }, def: { poss: 0, pts: 0 } };
      e.def.poss += v.poss;
      e.def.pts += v.pts;
      m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.off.poss + b.def.poss - (a.off.poss + a.def.poss));
}
