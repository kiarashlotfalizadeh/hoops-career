// Derived stat helpers shared by screens.
import type { League, Player, PlayerStats, TeamSeason } from '../core/types';
import { seasonTotals } from '../core/league/helpers';
import { gameScore } from '../core/league/awards';

export interface PerGame {
  gp: number;
  gs: number;
  min: number;
  pts: number;
  reb: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  tsPct: number;
  efgPct: number;
  usg: number;
  pm: number;
  gmsc: number;
  onOff: number; // on-court net rating
  rimPct: number;
  rimRate: number;
}

export function perGame(s: PlayerStats | null | undefined): PerGame | null {
  if (!s || s.gp === 0) return null;
  const g = s.gp;
  const tsa = s.fga + 0.44 * s.fta;
  const use = s.fga + 0.44 * s.fta + s.tov;
  const teamUse = s.teamFga + 0.44 * s.teamFta + s.teamTov;
  return {
    gp: s.gp,
    gs: s.gs,
    min: s.min / g,
    pts: s.pts / g,
    reb: (s.orb + s.drb) / g,
    orb: s.orb / g,
    drb: s.drb / g,
    ast: s.ast / g,
    stl: s.stl / g,
    blk: s.blk / g,
    tov: s.tov / g,
    pf: s.pf / g,
    fgm: s.fgm / g,
    fga: s.fga / g,
    tpm: s.tpm / g,
    tpa: s.tpa / g,
    ftm: s.ftm / g,
    fta: s.fta / g,
    fgPct: s.fga ? s.fgm / s.fga : 0,
    tpPct: s.tpa ? s.tpm / s.tpa : 0,
    ftPct: s.fta ? s.ftm / s.fta : 0,
    tsPct: tsa ? s.pts / (2 * tsa) : 0,
    efgPct: s.fga ? (s.fgm + 0.5 * s.tpm) / s.fga : 0,
    usg: s.adv ? s.adv.usg / 100 : teamUse ? use / teamUse : 0,
    pm: s.pm / g,
    gmsc: gameScore(s) / g,
    onOff: s.onPoss ? ((s.onPtsFor - s.onPtsAgainst) / s.onPoss) * 100 : 0,
    rimPct: s.rimA ? s.rimM / s.rimA : 0,
    rimRate: s.fga ? s.rimA / s.fga : 0,
  };
}

export function playerSeason(p: Player, season: number, playoffs = false): PerGame | null {
  return perGame(seasonTotals(p, season, playoffs));
}

/** Most recent season with stats (current season first, then previous real seasons). */
export function latestLine(league: League, p: Player): { season: number; pg: PerGame; real: boolean } | null {
  for (let s = league.season; s >= league.season - 4; s--) {
    const t = seasonTotals(p, s, false);
    if (t && t.gp > 0) return { season: s, pg: perGame(t)!, real: !!t.real };
  }
  return null;
}

export function teamRatings(ts: TeamSeason) {
  const g = Math.max(1, ts.won + ts.lost);
  const ortg = ts.poss ? (ts.ptsFor / ts.poss) * 100 : 0;
  const drtg = ts.oppPoss ? (ts.ptsAgainst / ts.oppPoss) * 100 : 0;
  return {
    ppg: ts.ptsFor / g,
    oppg: ts.ptsAgainst / g,
    ortg,
    drtg,
    net: ortg - drtg,
    pace: ts.poss / g,
    efg: ts.t.fga ? (ts.t.fgm + 0.5 * ts.t.tpm) / ts.t.fga : 0,
    tpRate: ts.t.fga ? ts.t.tpa / ts.t.fga : 0,
    tov: ts.poss ? ts.t.tov / ts.poss : 0,
    orb: ts.t.orb + ts.o.drb ? ts.t.orb / (ts.t.orb + ts.o.drb) : 0,
    ftr: ts.t.fga ? ts.t.fta / ts.t.fga : 0,
    oppEfg: ts.o.fga ? (ts.o.fgm + 0.5 * ts.o.tpm) / ts.o.fga : 0,
  };
}

export const f1 = (v: number) => (isFinite(v) ? v.toFixed(1) : '—');
export const f0 = (v: number) => (isFinite(v) ? v.toFixed(0) : '—');
export const p1 = (v: number) => (isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
export const p0 = (v: number) => (isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');
export const signed = (v: number, d = 1) => (isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}` : '—');
/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 101st, 111th. */
export const ordinalSuffix = (n: number) => {
  const v = Math.abs(n) % 100;
  return v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
};
export const ordinal = (n: number) => `${n}${ordinalSuffix(n)}`;
/** Q1..Q4, then OT, 2OT, 3OT. */
export const periodLabel = (q: number) => (q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`);
/** The game clock: "11:42", then tenths in the last minute ("24.3"), cut rather than rounded as an arena clock does. */
export function fmtClock(sec: number) {
  // (a hair added so a stored 24.3 that reads 24.2999… still shows 24.3)
  const s = Math.floor(Math.max(0, sec) * 10 + 1e-6) / 10;
  return s < 60 ? s.toFixed(1) : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
/** Play-by-play lines: substitutions fade back, but stay above 5:1 contrast. */
export const pbpOpacity = (kind?: string) => (kind === 'sub' ? 0.7 : 1);
/** A finished game's scorebug: FINAL, F/OT, F/2OT. */
export const finalLabel = (ot: number) => (ot > 0 ? `F/${periodLabel(4 + ot)}` : 'FINAL');

/**
 * Last names for a roster, with as much of the first name as it takes to tell teammates apart:
 * Jalen, Jaylin and Kenrich Williams on OKC read "Jal. Williams", "Jay. Williams", "K. Williams".
 * `initial` always shows at least the first initial (box scores).
 */
export function rosterNames(players: { pid: number; firstName: string; lastName: string }[], { initial = false } = {}): (pid: number) => string {
  const byLast = new Map<string, { pid: number; firstName: string; lastName: string }[]>();
  for (const p of players) byLast.set(p.lastName, [...(byLast.get(p.lastName) ?? []), p]);
  const names = new Map<number, string>();
  for (const group of byLast.values()) {
    for (const p of group) {
      const first = p.firstName;
      if (!first || (group.length === 1 && !initial)) {
        names.set(p.pid, p.lastName);
        continue;
      }
      const others = group.filter((o) => o !== p).map((o) => o.firstName.toLowerCase());
      let n = 1;
      while (n < first.length && others.some((o) => o.startsWith(first.slice(0, n).toLowerCase()))) n++;
      names.set(p.pid, n < first.length ? `${first.slice(0, n)}. ${p.lastName}` : `${first} ${p.lastName}`);
    }
  }
  return (pid) => names.get(pid) ?? '';
}
