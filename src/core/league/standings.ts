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

function headToHead(league: League, a: number, b: number): number {
  let aw = 0;
  let bw = 0;
  for (const g of league.games) {
    if (g.type !== 'regular' || g.season !== league.season) continue;
    const isAB = (g.home.tid === a && g.away.tid === b) || (g.home.tid === b && g.away.tid === a);
    if (!isAB) continue;
    const winner = g.home.pts > g.away.pts ? g.home.tid : g.away.tid;
    if (winner === a) aw++;
    else bw++;
  }
  return aw - bw;
}

function compare(league: League, a: { tid: number; ts: TeamSeason }, b: { tid: number; ts: TeamSeason }): number {
  const d = winPct(b.ts) - winPct(a.ts);
  if (Math.abs(d) > 1e-9) return d;
  const h2h = headToHead(league, a.tid, b.tid);
  if (h2h !== 0) return -h2h;
  const confA = a.ts.confWon / Math.max(1, a.ts.confWon + a.ts.confLost);
  const confB = b.ts.confWon / Math.max(1, b.ts.confWon + b.ts.confLost);
  if (Math.abs(confA - confB) > 1e-9) return confB - confA;
  const diffA = a.ts.ptsFor - a.ts.ptsAgainst;
  const diffB = b.ts.ptsFor - b.ts.ptsAgainst;
  if (diffA !== diffB) return diffB - diffA;
  return a.tid - b.tid;
}

export function standings(league: League, season = league.season): StandingRow[] {
  const rows = league.teams.map((t) => ({ tid: t.tid, ts: season === league.season ? curTeamSeason(league, t.tid) : t.seasons.find((s) => s.season === season)! })).filter((r) => r.ts);
  const out: StandingRow[] = [];
  for (const conf of ['E', 'W'] as const) {
    const cr = rows.filter((r) => league.teams[r.tid].conf === conf).sort((a, b) => compare(league, a, b));
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
  // clinch markers based on games remaining
  const remaining = (tid: number) => league.schedule.filter((g) => g.type === 'regular' && !g.played && (g.home === tid || g.away === tid)).length;
  for (const conf of ['E', 'W'] as const) {
    const cr = out.filter((r) => r.conf === conf);
    for (const r of cr) {
      const maxW = r.won + remaining(r.tid);
      const sixth = cr[5];
      const seventh = cr[6];
      const tenth = cr[9];
      const eleventh = cr[10];
      if (r.confRank <= 6 && seventh && r.won > seventh.won + remaining(seventh.tid)) r.clinched = 'x';
      else if (r.confRank <= 10 && eleventh && r.won > eleventh.won + remaining(eleventh.tid)) r.clinched = 'p';
      else if (tenth && maxW < tenth.won) r.clinched = 'e';
      void sixth;
    }
  }
  return out;
}

export function confStandings(league: League, conf: 'E' | 'W', season = league.season) {
  return standings(league, season).filter((r) => r.conf === conf);
}
