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

/**
 * Orders teams by win% with NBA-style tiebreaks applied to the whole tied group at once (a
 * pairwise comparator isn't transitive for 3+ way ties): head-to-head win% among the tied teams,
 * division leader, division record (same division only), conference record, point differential.
 * As soon as a criterion separates the group, each still-tied subgroup starts over from the top.
 */
function ranker(league: League, season: number, all: Entry[]) {
  const beat = new Map<string, number>();
  for (const g of league.games) {
    if (g.type !== 'regular' || g.season !== season) continue;
    const [w, l] = g.home.pts > g.away.pts ? [g.home.tid, g.away.tid] : [g.away.tid, g.home.tid];
    beat.set(`${w}-${l}`, (beat.get(`${w}-${l}`) ?? 0) + 1);
  }
  const wins = (a: number, b: number) => beat.get(`${a}-${b}`) ?? 0;
  const div = (tid: number) => league.teams[tid].div;
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
    leaders ??= new Set([...new Set(all.map((x) => div(x.tid)))].map((d) => order(all.filter((x) => div(x.tid) === d), withoutLeader)[0].tid));
    return leaders.has(e.tid) ? 1 : 0;
  };
  const divRecord: Criterion = (e, group) => (group.every((o) => div(o.tid) === div(e.tid)) ? frac(e.ts.divWon, e.ts.divLost) : 0);
  const confRecord: Criterion = (e) => frac(e.ts.confWon, e.ts.confLost);
  const pointDiff: Criterion = (e) => e.ts.ptsFor - e.ts.ptsAgainst;
  const criteria = [h2h, divLeader, divRecord, confRecord, pointDiff];
  const withoutLeader = [h2h, divRecord, confRecord, pointDiff];

  /** Split a sorted list into runs of equal score, ordering inside each run with `inner`. */
  function runs<T>(sorted: T[], score: (x: T) => number, inner: (run: T[]) => Entry[]): Entry[] {
    const out: Entry[] = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && Math.abs(score(sorted[i]) - score(sorted[j])) < EPS) j++;
      out.push(...inner(sorted.slice(i, j)));
      i = j;
    }
    return out;
  }

  function breakTie(group: Entry[], crits: Criterion[]): Entry[] {
    if (group.length < 2) return group;
    for (const crit of crits) {
      const scored = group.map((e) => ({ e, v: crit(e, group) })).sort((a, b) => b.v - a.v);
      if (scored[0].v - scored[scored.length - 1].v < EPS) continue;
      return runs(scored, (x) => x.v, (run) => breakTie(run.map((x) => x.e), crits));
    }
    return [...group].sort((a, b) => a.tid - b.tid);
  }

  function order(list: Entry[], crits = criteria): Entry[] {
    const sorted = [...list].sort((a, b) => winPct(b.ts) - winPct(a.ts));
    return runs(sorted, (e) => winPct(e.ts), (run) => breakTie(run, crits));
  }

  return order;
}

export function standings(league: League, season = league.season): StandingRow[] {
  const rows = league.teams.map((t) => ({ tid: t.tid, ts: season === league.season ? curTeamSeason(league, t.tid) : t.seasons.find((s) => s.season === season)! })).filter((r) => r.ts);
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
