// The season forecast: each team's projected record and its chances to make the playoffs (by the
// top six or the play-in), reach each round and win the title, and a lottery team's chances at the
// top picks. The rest of the season is played out many times, game by game on the real schedule,
// from each team's strength as the pre-game projection reads it (projection.ts: this season's net
// rating regressed toward what its roster is worth, here counting injured players for the games
// they'll be back for), with the strength itself uncertain (more so early in the season), then the
// play-in, the 2-2-1-1-1 playoffs and the lottery's drawing. It runs on a stream of its own seeded
// from the league and the day: a pure read of the league, the same on every screen and after a
// reload, and nothing in it touches the league's random stream or knows how the games will go.

import type { League, Player } from '../types';
import { Rng, clamp, hashString, mix32 } from '../random';
import { HOME_EDGE, MARGIN_SD, PRIOR_GAMES, blendNet, leagueRatings, phi } from './projection';
import { LOTTERY_ODDS } from '../league/draft';
import { drawLot, finalsHomeCourt, standings } from '../league/standings';

/** Simulated seasons in a forecast the screens show, and in the weekly point of the user's trail. */
export const FORECAST_SIMS = 1000;
export const TRAIL_SIMS = 250;
/**
 * Uncertainty in a team's true strength (net points per 100 possessions) before it has played: the
 * talent prior misses a season's final net by about this much. Each game played shrinks it as the
 * blend weighs the games (sd · √(PRIOR_GAMES / (gp + PRIOR_GAMES))).
 */
export const STRENGTH_SD = 2.5;
/** Minutes by OVR rank in a typical rotation (240 in all), for what a roster is worth with its injured players out or back. */
const SLOTS = [35, 34, 32, 30, 28, 24, 20, 16, 12, 9];
/** 2-2-1-1-1 from the higher seed's view, as the playoffs schedule it. */
const HOME_PATTERN = [true, true, false, false, true, false, true];
/** Injured players whose absences are played out exactly (each one in or out), the most valuable first; the rest count as out when they'll miss most of what's left. */
const EXACT_INJURIES = 4;

export interface TeamOdds {
  tid: number;
  /** Projected regular-season record (the mean) and the 10th-90th percentile of wins. */
  w: number;
  l: number;
  lo: number;
  hi: number;
  /** Chance of the conference's No. 1 seed, a top-six seed (straight into the playoffs) and a play-in place (seeds 7-10). */
  seed1: number;
  top6: number;
  playIn: number;
  /** Chance to reach each stage: [the playoffs (through the play-in too), the second round, the conference finals, the Finals, the title]. */
  reach: [number, number, number, number, number];
  /** Chance to be in the lottery, and of its own pick landing first and in the top four; the pick's expected number when it's in the lottery. */
  lottery: number;
  pick1: number;
  top4: number;
  pick: number | null;
  /** Sure of a playoff place (clinched, or already in the bracket), or out of the running for the title (eliminated): a 100% or a 0% that is no rounding. */
  clinched: boolean;
  out: boolean;
}

export interface Forecast {
  season: number;
  day: number;
  /** Simulated seasons it's read from (0: nothing left to forecast). */
  sims: number;
  /** Before the season's first game: strength is the rosters' talent alone. */
  preseason: boolean;
  /** The regular season is over: the seeds are the standings'. */
  seeded: boolean;
  teams: TeamOdds[];
}

/** Whether there is a season left to forecast: from the preseason until the Finals are won. */
export function forecastable(league: League): boolean {
  if (!['preseason', 'regular', 'playin', 'playoffs'].includes(league.phase)) return false;
  return !league.playoffs.some((s) => s.round === 4 && s.winner !== undefined);
}

/**
 * What a team's players are worth on the floor over what's left of its season (its OVR weighted by
 * a typical rotation's minutes): each injured player out for the games he'll miss and back after,
 * every combination of the most valuable ones weighed by how much of the stretch it covers.
 */
export function rosterWorth(players: Player[], gamesLeft: number): number {
  const sorted = [...players].sort((a, b) => b.ovr - a.ovr);
  const miss = (p: Player) => (p.injury ? clamp(p.injury.gamesRemaining / Math.max(1, gamesLeft), 0, 1) : 0);
  const hurt = sorted.filter((p) => miss(p) > 0);
  const exact = hurt.slice(0, EXACT_INJURIES);
  // the rest: out when they'll miss most of it
  const gone = new Set(hurt.slice(EXACT_INJURIES).filter((p) => miss(p) >= 0.5));
  const worth = (out: Set<Player>) => {
    let sum = 0;
    let min = 0;
    let i = 0;
    for (const p of sorted) {
      if (out.has(p) || gone.has(p)) continue;
      const m = SLOTS[i++];
      if (m === undefined) break;
      sum += p.ovr * m;
      min += m;
    }
    return min ? sum / min : 0;
  };
  let total = 0;
  for (let mask = 0; mask < 1 << exact.length; mask++) {
    const out = new Set<Player>();
    let w = 1;
    exact.forEach((p, k) => {
      const m = miss(p);
      if (mask & (1 << k)) {
        out.add(p);
        w *= m;
      } else w *= 1 - m;
    });
    if (w > 0) total += w * worth(out);
  }
  return total;
}

interface Setup {
  n: number;
  conf: ('E' | 'W')[];
  /** Point estimate of each team's net rating and its spread. */
  net: number[];
  sd: number[];
  pace: number[];
  wins: number[];
  losses: number[];
  /** Regular-season games each team hasn't scheduled yet (the NBA Cup's last two before the groups are decided), played against an average team. */
  extra: number[];
  /** The regular-season games still to play: home, away, and the margin a point of net rating between them is worth, in standard deviations. */
  home: Int32Array;
  away: Int32Array;
  scale: Float64Array;
  /** This season's regular-season wins of one team over another (h2h[a * n + b]). */
  h2h: Int32Array;
}

function setup(league: League, fixed: { gid: number; homeWon: boolean } | undefined, spread: number): Setup {
  const n = league.teams.length;
  const ratings = leagueRatings(league);
  const left = new Array(n).fill(0);
  const sched = new Array(n).fill(0);
  const games: [number, number][] = [];
  const wins = league.teams.map((t) => t.seasons.find((s) => s.season === league.season)?.won ?? 0);
  const losses = league.teams.map((t) => t.seasons.find((s) => s.season === league.season)?.lost ?? 0);
  for (const g of league.schedule) {
    if (g.type !== 'regular') continue;
    sched[g.home]++;
    sched[g.away]++;
    if (g.played) continue;
    // "what if": a game taken as won or lost before the rest are played
    if (fixed && g.gid === fixed.gid) {
      const [w, l] = fixed.homeWon ? [g.home, g.away] : [g.away, g.home];
      wins[w]++;
      losses[l]++;
      continue;
    }
    left[g.home]++;
    left[g.away]++;
    games.push([g.home, g.away]);
  }
  // with an NBA Cup, everyone plays 82: two of them aren't on the calendar until the groups are decided
  const target = league.cup?.season === league.season ? 82 : Math.max(0, ...sched);
  const extra = sched.map((s) => Math.max(0, target - s));
  const players = new Map<number, Player[]>();
  for (const p of Object.values(league.players)) if (p.tid >= 0 && p.tid < n) (players.get(p.tid) ?? players.set(p.tid, []).get(p.tid)!).push(p);
  const worth = league.teams.map((t) => rosterWorth(players.get(t.tid) ?? [], Math.max(1, left[t.tid] + extra[t.tid])));
  const avg = worth.reduce((a, w) => a + w, 0) / Math.max(1, n);
  const net = league.teams.map((t) => {
    const r = ratings.rows[t.tid];
    return blendNet(r.gp ? r.net : 0, r.gp, worth[t.tid] - avg);
  });
  const sd = ratings.rows.map((r) => spread * Math.sqrt(PRIOR_GAMES / (r.gp + PRIOR_GAMES)));
  const paces = ratings.rows.filter((r) => r.gp > 0).map((r) => r.pace);
  const leaguePace = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 100;
  const pace = ratings.rows.map((r) => (r.gp ? r.pace : leaguePace));
  const h2h = new Int32Array(n * n);
  for (const g of league.games) {
    if (g.type !== 'regular' || g.season !== league.season) continue;
    const [w, l] = g.home.pts > g.away.pts ? [g.home.tid, g.away.tid] : [g.away.tid, g.home.tid];
    h2h[w * n + l]++;
  }
  if (fixed) {
    const g = league.schedule.find((x) => x.gid === fixed.gid);
    if (g && g.type === 'regular') h2h[(fixed.homeWon ? g.home : g.away) * n + (fixed.homeWon ? g.away : g.home)]++;
  }
  return {
    n,
    conf: league.teams.map((t) => t.conf),
    net,
    sd,
    pace,
    wins,
    losses,
    extra,
    home: Int32Array.from(games, (g) => g[0]),
    away: Int32Array.from(games, (g) => g[1]),
    // a game's margin per point of net rating between the two: their pace, over the spread of margins
    scale: Float64Array.from(games, ([h, a]) => (pace[h] + pace[a]) / 200 / MARGIN_SD),
    h2h,
  };
}

/** A home team's chance against an away team at these strengths (net per 100) and paces. */
function homeChance(netH: number, netA: number, paceH: number, paceA: number, neutral: boolean): number {
  return phi((((netH - netA) * (paceH + paceA)) / 200 + (neutral ? 0 : HOME_EDGE)) / MARGIN_SD);
}

/** phi by table, for the regular season's hundreds of thousands of simulated games: margins within ±5 SD, to within 0.0003. */
const PHI_STEPS = 4096;
const PHI_RANGE = 5;
const PHI_TABLE = Float64Array.from({ length: PHI_STEPS + 1 }, (_, i) => phi(-PHI_RANGE + (2 * PHI_RANGE * i) / PHI_STEPS));
function fastPhi(z: number): number {
  const x = ((z + PHI_RANGE) * PHI_STEPS) / (2 * PHI_RANGE);
  return x <= 0 ? 0 : x >= PHI_STEPS ? 1 : PHI_TABLE[Math.round(x)];
}

/** Best of seven from `hw`-`lw`: the higher seed at home in games 1, 2, 5 and 7. Returns whether the higher seed wins. */
function playSeries(rng: Rng, pHome: number, pAway: number, hw = 0, lw = 0): boolean {
  let n = hw + lw;
  while (hw < 4 && lw < 4) {
    if (rng.next() < (HOME_PATTERN[n] ? pHome : pAway)) hw++;
    else lw++;
    n++;
  }
  return hw === 4;
}

/**
 * The forecast for the league as it stands (null when there is no season left to forecast): `sims`
 * simulated seasons, and with `fixed` one game of today's schedule taken as won or lost first (the
 * preview's "a win takes you to..."), drawn from the same stream so the two read side by side.
 */
export function forecast(league: League, opts: { sims?: number; fixed?: { gid: number; homeWon: boolean }; sd?: number } = {}): Forecast | null {
  if (!forecastable(league)) return null;
  const sims = opts.sims ?? FORECAST_SIMS;
  const S = setup(league, opts.fixed, opts.sd ?? STRENGTH_SD);
  const { n } = S;
  const played = league.games.length;
  const base = hashString(`${league.id}:${league.season}:${league.phase}:${league.day}:${played}:odds`);
  const seeded = league.phase === 'playin' || league.phase === 'playoffs';
  // the conferences' seeds once the regular season is over: the standings' (their tiebreakers settled)
  const realSeeds = seeded
    ? (['E', 'W'] as const).map((c) =>
        standings(league)
          .filter((r) => r.conf === c)
          .map((r) => r.tid),
      )
    : null;

  const count = {
    seed1: new Float64Array(n),
    top6: new Float64Array(n),
    playIn: new Float64Array(n),
    reach: [0, 1, 2, 3, 4].map(() => new Float64Array(n)),
    lottery: new Float64Array(n),
    pick1: new Float64Array(n),
    top4: new Float64Array(n),
    pickSum: new Float64Array(n),
    wins: new Float64Array(n),
  };
  const winDist = Array.from({ length: n }, () => [] as number[]);

  const str = new Float64Array(n);
  const w = new Int32Array(n);
  const h2h = new Int32Array(n * n);
  for (let s = 0; s < sims; s++) {
    // each simulated season on a stream of its own: playoff series of different lengths in one don't shift the next, so a
    // forecast with one game fixed differs from the one without only where that game made the difference
    const rng = new Rng(mix32(base + Math.imul(s + 1, 0x9e3779b1)));
    for (let t = 0; t < n; t++) {
      str[t] = S.net[t] + rng.normal(0, S.sd[t]);
      w[t] = S.wins[t];
    }
    let seeds: number[][];
    if (realSeeds) seeds = realSeeds;
    else {
      h2h.set(S.h2h);
      const edge = HOME_EDGE / MARGIN_SD;
      for (let i = 0; i < S.home.length; i++) {
        const h = S.home[i];
        const a = S.away[i];
        if (rng.next() < fastPhi((str[h] - str[a]) * S.scale[i] + edge)) {
          w[h]++;
          h2h[h * n + a]++;
        } else {
          w[a]++;
          h2h[a * n + h]++;
        }
      }
      for (let t = 0; t < n; t++) {
        const p = phi((str[t] * S.pace[t]) / 100 / MARGIN_SD);
        for (let k = 0; k < S.extra[t]; k++) if (rng.next() < p) w[t]++;
      }
      seeds = (['E', 'W'] as const).map((c) => seedConf(S, c, w, h2h, str, league.season));
    }
    for (let t = 0; t < n; t++) {
      count.wins[t] += w[t];
      winDist[t].push(w[t]);
    }
    // the play-in: 7 hosts 8 for the seventh seed, 9 hosts 10, the 7-8 loser hosts the 9-10 winner for the eighth
    const bracket = seeds.map((order, ci) => {
      const conf = ci === 0 ? 'E' : 'W';
      count.seed1[order[0]]++;
      for (let i = 0; i < Math.min(6, order.length); i++) count.top6[order[i]]++;
      for (let i = 6; i < Math.min(10, order.length); i++) count.playIn[order[i]]++;
      if (order.length < 10) return order.slice(0, 8);
      const game = (id: string, home: number, away: number) => {
        const done = league.playIn.find((p) => p.id === `${conf}-${id}` && p.winner !== undefined);
        if (done) return { win: done.winner!, lose: done.loser! };
        const hw = rng.next() < homeChance(str[home], str[away], S.pace[home], S.pace[away], false);
        return hw ? { win: home, lose: away } : { win: away, lose: home };
      };
      const g78 = game('78', order[6], order[7]);
      const g910 = game('910', order[8], order[9]);
      const g8 = game('8', g78.lose, g910.win);
      return [...order.slice(0, 6), g78.win, g8.win];
    });
    const alive: number[] = [];
    for (const b of bracket) for (const tid of b) alive.push(tid);
    for (const tid of alive) count.reach[0][tid]++;

    // the playoffs: the real series as they stand, the rest simulated round by round
    const finalists: { tid: number; seed: number }[] = [];
    bracket.forEach((b, ci) => {
      const conf = ci === 0 ? 'E' : 'W';
      // round one: 1-8, 4-5, 3-6, 2-7 (seeds are positions 1-8)
      let round: { tid: number; seed: number }[][] = [
        [1, 8],
        [4, 5],
        [3, 6],
        [2, 7],
      ].map(([h, l]) => [
        { tid: b[h - 1], seed: h },
        { tid: b[l - 1], seed: l },
      ]);
      for (let r = 1; r <= 3; r++) {
        const winners = round.map(([hi, lo], i) => {
          const real = league.playoffs.find((x) => x.id === `${conf}${r}-${i}`);
          if (real?.winner !== undefined) return real.winner === real.high ? { tid: real.high, seed: real.highSeed } : { tid: real.low, seed: real.lowSeed };
          const [high, low] = real
            ? [
                { tid: real.high, seed: real.highSeed },
                { tid: real.low, seed: real.lowSeed },
              ]
            : [hi, lo];
          const pH = homeChance(str[high.tid], str[low.tid], S.pace[high.tid], S.pace[low.tid], false);
          const pA = 1 - homeChance(str[low.tid], str[high.tid], S.pace[low.tid], S.pace[high.tid], false);
          return playSeries(rng, pH, pA, real?.highWins ?? 0, real?.lowWins ?? 0) ? high : low;
        });
        for (const x of winners) count.reach[r][x.tid]++;
        if (r === 3) finalists.push(winners[0]);
        else {
          round = [];
          for (let i = 0; i < winners.length; i += 2) {
            const [a, c] = [winners[i], winners[i + 1]];
            // the better seed hosts; the same seed (never in a conference) goes to the better record
            round.push(a.seed < c.seed || (a.seed === c.seed && w[a.tid] >= w[c.tid]) ? [a, c] : [c, a]);
          }
        }
      }
    });
    if (finalists.length === 2) {
      const real = league.playoffs.find((x) => x.round === 4);
      const [e, wst] = finalists;
      let high: number;
      let low: number;
      if (real) [high, low] = [real.high, real.low];
      else {
        // home court to the better record, then (as near as the simulation knows) the stronger team
        const eFirst = seeded ? finalsHomeCourt(league, e.tid, wst.tid) === e.tid : w[e.tid] > w[wst.tid] || (w[e.tid] === w[wst.tid] && str[e.tid] >= str[wst.tid]);
        [high, low] = eFirst ? [e.tid, wst.tid] : [wst.tid, e.tid];
      }
      const pH = homeChance(str[high], str[low], S.pace[high], S.pace[low], false);
      const pA = 1 - homeChance(str[low], str[high], S.pace[low], S.pace[high], false);
      count.reach[4][playSeries(rng, pH, pA, real?.highWins ?? 0, real?.lowWins ?? 0) ? high : low]++;
    }

    // the lottery: everyone not in the playoffs, worst record first (a tie drawn), four picks drawn by the 2019 odds
    const inPlayoffs = new Set(alive);
    const lottery = [];
    for (let t = 0; t < n; t++) if (!inPlayoffs.has(t)) lottery.push({ t, key: w[t] + rng.next() * 0.5 });
    lottery.sort((a, b) => a.key - b.key);
    const pool = lottery.map((x, i) => ({ t: x.t, odds: LOTTERY_ODDS[i] ?? 0 }));
    const order: number[] = [];
    for (let k = 0; k < 4 && pool.length; k++) {
      const total = pool.reduce((a, x) => a + x.odds, 0);
      let r = rng.next() * total;
      let i = 0;
      while (i < pool.length - 1 && r >= pool[i].odds) r -= pool[i++].odds;
      order.push(pool[i].t);
      pool.splice(i, 1);
    }
    for (const x of pool) order.push(x.t);
    order.forEach((t, i) => {
      count.lottery[t]++;
      count.pickSum[t] += i + 1;
      if (i === 0) count.pick1[t]++;
      if (i < 4) count.top4[t]++;
    });
  }

  const left = new Int32Array(n);
  for (let i = 0; i < S.home.length; i++) {
    left[S.home[i]]++;
    left[S.away[i]]++;
  }
  // what is already certain: a playoff place clinched or won, a team eliminated (the standings' clinch marks before the play-in)
  const marks = seeded ? null : new Map(standings(league).map((r) => [r.tid, r.clinched]));
  const certain = (tid: number) => {
    const ts = league.teams[tid].seasons.find((x) => x.season === league.season);
    if (marks) return { clinched: marks.get(tid) === 'x', out: marks.get(tid) === 'e' };
    const lost = league.playoffs.some((x) => x.winner !== undefined && (x.high === tid || x.low === tid) && x.winner !== tid);
    return { clinched: (ts?.playoffRound ?? -1) >= 1, out: (ts?.playoffRound ?? -1) < 0 || lost };
  };
  const teams: TeamOdds[] = league.teams.map((t) => {
    const tid = t.tid;
    const d = winDist[tid].sort((a, b) => a - b);
    const games = S.wins[tid] + S.losses[tid] + left[tid] + S.extra[tid];
    const mean = count.wins[tid] / sims;
    const lot = count.lottery[tid];
    return {
      tid,
      w: mean,
      l: games - mean,
      lo: d[Math.floor(0.1 * (d.length - 1))] ?? 0,
      hi: d[Math.ceil(0.9 * (d.length - 1))] ?? 0,
      seed1: count.seed1[tid] / sims,
      top6: count.top6[tid] / sims,
      playIn: count.playIn[tid] / sims,
      reach: count.reach.map((r) => r[tid] / sims) as TeamOdds['reach'],
      lottery: lot / sims,
      pick1: count.pick1[tid] / sims,
      top4: count.top4[tid] / sims,
      pick: lot ? count.pickSum[tid] / lot : null,
      ...certain(tid),
    };
  });
  return { season: league.season, day: league.day, sims, preseason: !league.games.some((g) => g.season === league.season), seeded, teams };
}

/**
 * One conference's seeds in a simulated season: by wins, a tie broken by head-to-head (among all the
 * tied teams for three or more), then the stronger team in that simulation (as the point differential
 * would most often say), then the league's drawing. The real tiebreakers' division and conference
 * records aren't simulated; the regular season's last day goes to the standings themselves.
 */
function seedConf(S: Setup, conf: 'E' | 'W', w: Int32Array, h2h: Int32Array, str: Float64Array, season: number): number[] {
  const { n } = S;
  const tids: number[] = [];
  for (let t = 0; t < n; t++) if (S.conf[t] === conf) tids.push(t);
  tids.sort((a, b) => w[b] - w[a]);
  const out: number[] = [];
  for (let i = 0; i < tids.length;) {
    let j = i + 1;
    while (j < tids.length && w[tids[j]] === w[tids[i]]) j++;
    const group = tids.slice(i, j);
    if (group.length > 1) {
      const vs = (t: number) => {
        let won = 0;
        let lost = 0;
        for (const o of group) {
          if (o === t) continue;
          won += h2h[t * n + o];
          lost += h2h[o * n + t];
        }
        return won + lost ? won / (won + lost) : 0.5;
      };
      const key = new Map(group.map((t) => [t, vs(t)]));
      group.sort((a, b) => key.get(b)! - key.get(a)! || str[b] - str[a] || drawLot(season, a) - drawLot(season, b));
    }
    out.push(...group);
    i = j;
  }
  return out;
}

const memo = new WeakMap<League, { key: string; value: Forecast | null }>();

/**
 * The forecast the screens share: worked out once for the league as it is (a game played, a new day,
 * a roster move, an injury), not on every render.
 */
export function leagueForecast(league: League): Forecast | null {
  const hurt = Object.values(league.players).reduce((a, p) => a + (p.tid >= 0 && p.injury ? p.pid * 7 + p.injury.gamesRemaining : 0), 0);
  const key = `${league.season}|${league.phase}|${league.day}|${league.games.length}|${league.nextTxnId ?? 0}|${league.playIn.length}|${hurt}|${league.userTid}`;
  const hit = memo.get(league);
  if (hit && hit.key === key) return hit.value;
  const value = forecast(league);
  memo.set(league, { key, value });
  return value;
}

/** The user's team's odds over the season (League.oddsTrail): a point a week of the regular season, kept as tenths of a percent. */
export type TrailPoint = [day: number, playoffs: number, title: number];

/** Add this week's point to the user's trail (a new season or team starts a new one), from a lighter forecast of its own. */
export function recordTrail(league: League) {
  if (league.phase !== 'regular') return;
  const f = forecast(league, { sims: TRAIL_SIMS });
  if (!f) return;
  const t = f.teams[league.userTid];
  const trail = league.oddsTrail;
  const pt: TrailPoint = [league.day, Math.round(t.reach[0] * 1000), Math.round(t.reach[4] * 1000)];
  if (!trail || trail.season !== league.season || trail.tid !== league.userTid) league.oddsTrail = { season: league.season, tid: league.userTid, pts: [pt] };
  else if (trail.pts[trail.pts.length - 1]?.[0] !== league.day) trail.pts.push(pt);
}

/**
 * A chance as the screens show it: "64%", ">99%" and "<1%" at the ends, "100%" and "—" only when
 * `sure` (a place clinched, a team out of it): no simulated count is taken for a certainty.
 */
export function pct(p: number, sure = false): string {
  if (sure && p >= 1) return '100%';
  if (sure && p <= 0) return '—';
  if (p >= 0.995) return '>99%';
  if (p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

/** Simulated seasons each side of a game's stakes: a sharper read isn't worth the wait when the preview opens. */
export const STAKES_SIMS = 600;

/**
 * What one regular-season game is worth to a team (the preview's stakes): its playoff odds with the
 * game won and with it lost, each from the same simulated seasons. Null for any other game.
 */
export function gameStakes(league: League, gid: number, tid: number): { win: number; loss: number } | null {
  const g = league.schedule.find((x) => x.gid === gid);
  if (!g || g.played || g.type !== 'regular' || (g.home !== tid && g.away !== tid) || !forecastable(league)) return null;
  const at = (won: boolean) => forecast(league, { sims: STAKES_SIMS, fixed: { gid, homeWon: won === (g.home === tid) } })!.teams[tid].reach[0];
  return { win: at(true), loss: at(false) };
}
