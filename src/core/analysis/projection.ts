// Game projections: what a matchup is worth before tip-off, from each team's net rating this season
// regressed toward what its rotation tonight is worth, at the two teams' pace, plus home court. The
// pre-game screen shows it, and the game keeps it (GameResult.edge) as the point win probability
// starts from. Pure reads of the league: nothing here draws from its random stream.

import type { League } from '../types';
import type { GameSim } from '../sim/engine';
import { courtPoints } from '../league/difficulty';
import { planFor } from '../league/gamePlans';

/**
 * Net rating per point of a rotation's minutes-weighted OVR above the league's (fitted over simulated
 * seasons, r ≈ 0.8). Six real-league seasons measured 2.0 before the big decisions were made to matter
 * and 2.2 after (a decision's open looks count by who takes them, so skill tells a little more), from
 * the 1.7 first fitted; at 2.2 the owner's win targets ran two wins over what the league won (his
 * floors and the payroll's raise only push them up), so it sits at 2.0.
 */
export const TALENT_NET = 2;
/** Games of this season's net rating that weigh as much as the talent prior (the blend predicts a season's final net best). */
export const PRIOR_GAMES = 15;
/** Points a home team gains in the engine (measured over 2,460 simulated games: 1.8, a 55% home win rate). */
export const HOME_EDGE = 1.8;
/** Spread of game margins for a given matchup (the engine's, like the NBA's, is near 13). */
export const MARGIN_SD = 13;

/** A season number and where it ranks in the league (1 = best; 0 before the team has played). */
export interface Ranked {
  v: number;
  rank: number;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
export function phi(x: number) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * A team's net rating estimate: this season's per-100 net, weighted by games played against a
 * prior from tonight's rotation talent (`talent`: its minutes-weighted OVR above the league's), at
 * `perPoint` net a point of it (TALENT_NET for a game's planned rotation).
 */
export function blendNet(net: number, gp: number, talent: number, perPoint = TALENT_NET) {
  const w = gp / (gp + PRIOR_GAMES);
  return w * net + (1 - w) * talent * perPoint;
}

/** The projected margin for `us`: the net ratings' difference at the game's pace, plus home court (`edge`). */
export function projectMargin(netUs: number, netThem: number, pace: number, edge: number) {
  return ((netUs - netThem) * pace) / 100 + edge;
}

/** Season ratings of every team that has played, ranked. */
export function leagueRatings(league: League) {
  const rows = league.teams.map((t) => {
    const ts = t.seasons.find((s) => s.season === league.season);
    const gp = ts ? ts.won + ts.lost : 0;
    const ortg = ts?.poss ? (ts.ptsFor / ts.poss) * 100 : 0;
    const drtg = ts?.oppPoss ? (ts.ptsAgainst / ts.oppPoss) * 100 : 0;
    return { tid: t.tid, gp, ortg, drtg, net: ortg - drtg, pace: gp && ts ? ts.poss / gp : 0, threes: gp && ts ? ts.t.tpa / gp : 0 };
  });
  const played = rows.filter((r) => r.gp > 0);
  const rank = (tid: number, key: 'ortg' | 'drtg' | 'net' | 'pace' | 'threes', higherFirst = true): Ranked => {
    const r = rows[tid];
    if (!r.gp) return { v: 0, rank: 0 };
    const better = played.filter((o) => (higherFirst ? o[key] > r[key] : o[key] < r[key])).length;
    return { v: r[key], rank: better + 1 };
  };
  return { rows, rank };
}

/**
 * The projection for a game set up in `sim` (both rotations planned for the tip, as the real game
 * will start them): each side's net rating this season regressed toward what its rotation tonight is
 * worth, at the two teams' pace, plus home court and the user's game plan (see planPoints). From the
 * home side: `margin` is the projected home margin (what win probability starts from at tip-off, see
 * GameResult.edge), `edge` the home-court points in it, `plan` the game plan's. Reads the league only.
 */
export function projectGame(league: League, sim: GameSim, neutral: boolean, ratings = leagueRatings(league)) {
  const avgTalent = league.teams.reduce((a, t) => a + rotationTalent(league, t.tid), 0) / Math.max(1, league.teams.length);
  const tonight = (s: 0 | 1) => {
    let sum = 0;
    let min = 0;
    for (const p of sim.T[s].players) {
      if (p.out || !p.planMin) continue;
      sum += (league.players[p.pid]?.ovr ?? 0) * p.planMin;
      min += p.planMin;
    }
    return min ? sum / min - avgTalent : 0;
  };
  const row = (s: 0 | 1) => ratings.rows[sim.T[s].tid];
  const est = (s: 0 | 1) => blendNet(row(s).gp ? row(s).net : 0, row(s).gp, tonight(s));
  const netHome = est(0);
  const netAway = est(1);
  const paces = [row(0), row(1)].filter((r) => r.gp > 0).map((r) => r.pace);
  const pace = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 100;
  // home court, and the difficulty's edge in a game of the user's (see courtPoints)
  const edge = (neutral ? 0 : HOME_EDGE) + courtPoints(league, sim.T[0].tid, sim.T[1].tid);
  // the user's game plan for tonight, at what the staff measured it worth
  const plan = planPoints(league, sim.T[0].tid, sim.T[1].tid);
  return { margin: projectMargin(netHome, netAway, pace, edge) + plan, netHome, netAway, edge, plan };
}

/** Most points a game a plan's measured counters add to a projection: each was measured alone, and together they overlap. */
export const PLAN_MAX_PTS = 4;

/**
 * Points a game the user's plan against the other team adds to the home side's projected margin
 * (under 0 for the user away): its counters' measured worth (GamePlanItem.pts), at most PLAN_MAX_PTS
 * either way. Nothing in a game the user isn't in.
 */
export function planPoints(league: League, home: number, away: number): number {
  const me = league.userTid;
  if (home !== me && away !== me) return 0;
  const opp = home === me ? away : home;
  const items = planFor(league, opp)?.items ?? [];
  const pts = items.reduce((a, it) => a + (it.pts ?? 0), 0);
  const capped = Math.max(-PLAN_MAX_PTS, Math.min(PLAN_MAX_PTS, pts));
  return home === me ? capped : -capped;
}

/** Minutes-weighted OVR of every team's healthy rotation, for the league average the talent prior is measured from. */
function rotationTalent(league: League, tid: number) {
  const rot = league.teams[tid].rotation;
  let sum = 0;
  let min = 0;
  for (const pid of rot.order) {
    const p = league.players[pid];
    const m = rot.minutes[pid] ?? 0;
    if (!p || p.tid !== tid || p.injury || m <= 0) continue;
    sum += p.ovr * m;
    min += m;
  }
  return min ? sum / min : 0;
}
