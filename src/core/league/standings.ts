import type { League, TeamSeason } from '../types';
import { curTeamSeason, winPct } from './helpers';

export interface StandingRow {
  tid: number;
  won: number;
  lost: number;
  pct: number;
  gb: number;
  conf: 'E' | 'W';
  div: string;
  confRank: number;
  leagueRank: number;
  streak: number;
  lastTen: string;
  home: string;
  away: string;
  confRec: string;
  diff: number; // point differential per game
  clinched?: 'x' | 'y' | 'p' | 'o' | 'e'; // x playoffs, p play-in, e eliminated
}

type Entry = { tid: number; ts: TeamSeason };
type Criterion = (e: Entry, group: Entry[]) => number;

const EPS = 1e-9;
const frac = (w: number, l: number) => (w + l ? w / (w + l) : 0);

/** Regular-season wins of one team over another this season, from the stored results. */
function winsOver(league: League, season: number) {
  const beat = new Map<string, number>();
  for (const g of league.games) {
    if (g.type !== 'regular' || g.season !== season) continue;
    const [w, l] = g.home.pts > g.away.pts ? [g.home.tid, g.away.tid] : [g.away.tid, g.home.tid];
    beat.set(`${w}-${l}`, (beat.get(`${w}-${l}`) ?? 0) + 1);
  }
  return (a: number, b: number) => beat.get(`${a}-${b}`) ?? 0;
}

/**
 * The league's random drawing for ties nothing else breaks, made deterministic: a fixed hash of
 * season and team, so the order doesn't favor low team ids and never changes on a reload.
 */
export function drawLot(season: number, tid: number): number {
  let h = Math.imul(season ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(tid + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Orders teams by win% with the NBA's tiebreak procedures, applied to the whole tied group at once
 * (a pairwise comparator isn't transitive for 3+ way ties). Two teams: head-to-head, division
 * leader, division record (same division only), conference record, record against playoff teams
 * in their own conference, then in the other one, point differential. Three or more: division
 * leader first, then head-to-head among all of them and the rest in the same order. As soon as a
 * criterion separates the group, each still-tied subgroup starts over with the list for its size;
 * a tie nothing breaks goes to the drawing.
 */
function ranker(league: League, season: number, all: Entry[]) {
  const wins = winsOver(league, season);
  const div = (tid: number) => league.teams[tid].div;
  const conf = (tid: number) => league.teams[tid].conf;
  const h2h: Criterion = (e, group) => {
    let w = 0;
    let l = 0;
    for (const o of group) {
      if (o.tid === e.tid) continue;
      w += wins(e.tid, o.tid);
      l += wins(o.tid, e.tid);
    }
    return w + l ? w / (w + l) : 0.5;
  };
  let leaders: Set<number> | null = null;
  const divLeader: Criterion = (e) => {
    leaders ??= new Set(
      [...new Set(all.map((x) => div(x.tid)))].map(
        (d) =>
          order(
            all.filter((x) => div(x.tid) === d),
            true,
          )[0].tid,
      ),
    );
    return leaders.has(e.tid) ? 1 : 0;
  };
  // playoff teams: the top ten of each conference by record (play-in included), ties at the cut too
  const playoffTeams = new Set<number>();
  for (const c of new Set(all.map((x) => conf(x.tid)))) {
    const pcts = all
      .filter((x) => conf(x.tid) === c)
      .map((x) => winPct(x.ts))
      .sort((a, b) => b - a);
    const cut = pcts[Math.min(9, pcts.length - 1)];
    for (const x of all) if (conf(x.tid) === c && winPct(x.ts) >= cut - EPS) playoffTeams.add(x.tid);
  }
  const vsPlayoff =
    (own: boolean): Criterion =>
    (e) => {
      let w = 0;
      let l = 0;
      for (const o of playoffTeams) {
        if (o === e.tid || (conf(o) === conf(e.tid)) !== own) continue;
        w += wins(e.tid, o);
        l += wins(o, e.tid);
      }
      return frac(w, l);
    };
  const divRecord: Criterion = (e, group) => (group.every((o) => div(o.tid) === div(e.tid)) ? frac(e.ts.divWon, e.ts.divLost) : 0);
  const confRecord: Criterion = (e) => frac(e.ts.confWon, e.ts.confLost);
  const pointDiff: Criterion = (e) => e.ts.ptsFor - e.ts.ptsAgainst;
  const rest = [divRecord, confRecord, vsPlayoff(true), vsPlayoff(false), pointDiff];
  const twoTeams = [h2h, divLeader, ...rest];
  const multiTeams = [divLeader, h2h, ...rest];

  /** Split a sorted list into runs of equal score, ordering inside each run with `inner`. */
  function runs<T>(sorted: T[], score: (x: T) => number, inner: (run: T[]) => Entry[]): Entry[] {
    const out: Entry[] = [];
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (j < sorted.length && Math.abs(score(sorted[i]) - score(sorted[j])) < EPS) j++;
      out.push(...inner(sorted.slice(i, j)));
      i = j;
    }
    return out;
  }

  /** `inDivision`: ordering one division to find its leader, so that criterion is skipped. */
  function breakTie(group: Entry[], inDivision: boolean): Entry[] {
    if (group.length < 2) return group;
    for (const crit of group.length === 2 ? twoTeams : multiTeams) {
      if (inDivision && crit === divLeader) continue;
      const scored = group.map((e) => ({ e, v: crit(e, group) })).sort((a, b) => b.v - a.v);
      if (scored[0].v - scored[scored.length - 1].v < EPS) continue;
      return runs(
        scored,
        (x) => x.v,
        (run) =>
          breakTie(
            run.map((x) => x.e),
            inDivision,
          ),
      );
    }
    return [...group].sort((a, b) => drawLot(season, a.tid) - drawLot(season, b.tid));
  }

  function order(list: Entry[], inDivision = false): Entry[] {
    const sorted = [...list].sort((a, b) => winPct(b.ts) - winPct(a.ts));
    return runs(
      sorted,
      (e) => winPct(e.ts),
      (run) => breakTie(run, inDivision),
    );
  }

  return order;
}

/**
 * Home court in the NBA Finals: the better record, then head-to-head, record against the other
 * conference, point differential and the drawing. Returns the team that gets it.
 */
export function finalsHomeCourt(league: League, a: number, b: number, season = league.season): number {
  const wins = winsOver(league, season);
  const ts = (tid: number) => league.teams[tid].seasons.find((s) => s.season === season)!;
  const crits: ((t: number, o: number) => number)[] = [
    (t) => winPct(ts(t)),
    (t, o) => frac(wins(t, o), wins(o, t)),
    (t) => frac(ts(t).won - ts(t).confWon, ts(t).lost - ts(t).confLost),
    (t) => ts(t).ptsFor - ts(t).ptsAgainst,
    (t) => -drawLot(season, t),
  ];
  for (const c of crits) {
    const d = c(a, b) - c(b, a);
    if (Math.abs(d) > EPS) return d > 0 ? a : b;
  }
  return a;
}

export function standings(league: League, season = league.season): StandingRow[] {
  const rows = league.teams
    .map((t) => ({ tid: t.tid, ts: season === league.season ? curTeamSeason(league, t.tid) : t.seasons.find((s) => s.season === season)! }))
    .filter((r) => r.ts);
  const order = ranker(league, season, rows);
  const out: StandingRow[] = [];
  for (const conf of ['E', 'W'] as const) {
    const cr = order(rows.filter((r) => league.teams[r.tid].conf === conf));
    const leader = cr[0]?.ts;
    cr.forEach((r, i) => {
      const t = league.teams[r.tid];
      const g = r.ts.won + r.ts.lost;
      out.push({
        tid: r.tid,
        won: r.ts.won,
        lost: r.ts.lost,
        pct: winPct(r.ts),
        gb: leader ? (leader.won - r.ts.won + (r.ts.lost - leader.lost)) / 2 : 0,
        conf,
        div: t.div,
        confRank: i + 1,
        leagueRank: 0,
        streak: r.ts.streak,
        lastTen: `${r.ts.lastTen.filter((x) => x === 1).length}-${r.ts.lastTen.filter((x) => x === 0).length}`,
        home: `${r.ts.homeWon}-${r.ts.homeLost}`,
        away: `${r.ts.won - r.ts.homeWon}-${r.ts.lost - r.ts.homeLost}`,
        confRec: `${r.ts.confWon}-${r.ts.confLost}`,
        diff: g ? (r.ts.ptsFor - r.ts.ptsAgainst) / g : 0,
      });
    });
  }
  const sorted = [...out].sort((a, b) => b.pct - a.pct || b.diff - a.diff);
  sorted.forEach((r, i) => (r.leagueRank = i + 1));
  // clinch markers based on games remaining: a spot is clinched when nobody below can still
  // reach this team's wins (ties are not assumed won), eliminated when ten teams are out of reach
  const left = new Map<number, number>();
  if (season === league.season) {
    for (const g of league.schedule) {
      if (g.type !== 'regular' || g.played) continue;
      left.set(g.home, (left.get(g.home) ?? 0) + 1);
      left.set(g.away, (left.get(g.away) ?? 0) + 1);
    }
  }
  const maxWins = (r: StandingRow) => r.won + (left.get(r.tid) ?? 0);
  for (const conf of ['E', 'W'] as const) {
    const cr = out.filter((r) => r.conf === conf);
    for (const r of cr) {
      if (r.confRank <= 6 && cr.slice(6).every((o) => maxWins(o) < r.won)) r.clinched = 'x';
      else if (r.confRank <= 10 && cr.slice(10).every((o) => maxWins(o) < r.won)) r.clinched = 'p';
      else if (cr.filter((o) => o.tid !== r.tid && o.won > maxWins(r)).length >= 10) r.clinched = 'e';
    }
  }
  return out;
}

export function confStandings(league: League, conf: 'E' | 'W', season = league.season) {
  return standings(league, season).filter((r) => r.conf === conf);
}
