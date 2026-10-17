// Derived stat helpers shared by screens.
import type { BoxLine, League, Player, PlayerStats, TeamSeason } from '../core/types';
import { seasonTotals } from '../core/league/helpers';
import { gameScore } from '../core/league/awards';
import { seasonAdvanced } from '../core/analysis/advanced';
import { isOut } from '../core/availability';

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

/**
 * A season's all-in-one numbers as the stats tables show them: an imported season's, Basketball
 * Reference's own (BPM and EPM only there), or a regular season played in this league's, computed
 * from its box score totals (`computed`; see src/core/analysis/advanced.ts). Null for the playoffs
 * of a season played here, whose teams' totals aren't kept.
 */
export interface AdvView {
  per: number;
  ws: number;
  ws48: number;
  bpm?: number;
  epm?: number;
  computed?: true;
}

export function advancedView(league: League, p: Player, s: PlayerStats): AdvView | null {
  if (s.adv) return { per: s.adv.per, ws: s.adv.ws, ws48: s.adv.ws48, bpm: s.adv.bpm, ...(s.adv.epm !== undefined ? { epm: s.adv.epm } : {}) };
  if (s.real || s.playoffs) return null;
  const a = seasonAdvanced(league, p, s.season);
  return a ? { per: a.per, ws: a.ws, ws48: a.ws48, computed: true } : null;
}

type Adv = NonNullable<PlayerStats['adv']>;
/** The figures every imported row has (EPM only comes with seeds built with it). */
type AdvKey = Exclude<keyof Adv, 'oepm' | 'depm' | 'epm'>;

/**
 * A season's totals across all his teams, imported advanced numbers included: a player traded
 * during a real season has a row per team, and adding the rows up dropped them (his usage read
 * 0.0, and his page showed his first team's PER, BPM and win shares as the season's).
 */
export function seasonLine(p: Player, season: number, playoffs = false): PlayerStats | null {
  const t = seasonTotals(p, season, playoffs);
  if (!t || t.adv) return t;
  const rows = p.stats.filter((s) => s.season === season && s.playoffs === playoffs && s.adv);
  if (!rows.length) return t;
  // rates by minutes played, counts added up
  const min = rows.reduce((a, r) => a + r.min, 0);
  const rate = (k: AdvKey) => rows.reduce((a, r) => a + r.adv![k] * r.min, 0) / Math.max(1e-9, min);
  const sum = (k: AdvKey) => rows.reduce((a, r) => a + r.adv![k], 0);
  const keys: AdvKey[] = ['per', 'ts', 'usg', 'astPct', 'trbPct', 'stlPct', 'blkPct', 'tovPct', 'obpm', 'dbpm', 'bpm'];
  const adv = Object.fromEntries(keys.map((k) => [k, rate(k)])) as Adv;
  adv.ws = sum('ws');
  adv.vorp = sum('vorp');
  adv.ws48 = min ? (adv.ws * 48) / min : 0;
  // EPM is already the whole season's: every team row carries the same figure
  const e = rows.find((r) => r.adv!.epm !== undefined)?.adv;
  if (e) Object.assign(adv, { oepm: e.oepm, depm: e.depm, epm: e.epm });
  return { ...t, adv };
}

export function playerSeason(p: Player, season: number, playoffs = false): PerGame | null {
  return perGame(seasonLine(p, season, playoffs));
}

/** Most recent season with stats (current season first, then previous real seasons). */
export function latestLine(league: League, p: Player): { season: number; pg: PerGame; real: boolean } | null {
  for (let s = league.season; s >= league.season - 4; s--) {
    const t = seasonLine(p, s, false);
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

/** toFixed, but a value that rounds to zero reads "0.0", not "-0.0" (a -0.03 plus-minus or net rating). */
const fixed = (v: number, d: number) => {
  const s = v.toFixed(d);
  return Number(s) === 0 ? (0).toFixed(d) : s;
};
export const f1 = (v: number) => (isFinite(v) ? fixed(v, 1) : '—');
export const f0 = (v: number) => (isFinite(v) ? fixed(v, 0) : '—');
export const p1 = (v: number) => (isFinite(v) ? `${fixed(v * 100, 1)}%` : '—');
export const p0 = (v: number) => (isFinite(v) ? `${fixed(v * 100, 0)}%` : '—');
/** "+2.4", "-1.3", and "0.0" for anything that rounds to zero (no sign: it favours neither side). */
export const signed = (v: number, d = 1) => {
  if (!isFinite(v)) return '—';
  const s = fixed(v, d);
  return Number(s) > 0 ? `+${s}` : s;
};
/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 101st, 111th. */
export const ordinalSuffix = (n: number) => {
  const v = Math.abs(n) % 100;
  return v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
};
export const ordinal = (n: number) => `${n}${ordinalSuffix(n)}`;
/** Q1..Q4, then OT, 2OT, 3OT. */
export const periodLabel = (q: number) => (q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`);
/**
 * A value worked out by scanning the games played (standings, lineups), kept until a game is played or
 * the date, phase, season or team changes: a slider drag edits the league at every step, and these
 * scans have nothing new to find then.
 */
export function gamesMemo<T>(cache: WeakMap<League, { key: string; value: T }>, league: League, compute: () => T): T {
  const key = `${league.season}|${league.phase}|${league.day}|${league.faDay}|${league.userTid}|${league.games.length}`;
  const hit = cache.get(league);
  if (hit && hit.key === key) return hit.value;
  const value = compute();
  cache.set(league, { key, value });
  return value;
}

/** The game clock: "11:42", then tenths in the last minute ("24.3"), cut rather than rounded as an arena clock does. */
export function fmtClock(sec: number) {
  // (a hair added so a stored 24.3 that reads 24.2999… still shows 24.3)
  const s = Math.floor(Math.max(0, sec) * 10 + 1e-6) / 10;
  return s < 60 ? s.toFixed(1) : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
/** Play-by-play lines: substitutions fade back, but stay above 5:1 contrast. */
export const pbpOpacity = (kind?: string) => (kind === 'sub' ? 0.7 : 1);
/** Box-score minutes as whole numbers that add up to the team's total (the game report's grades quote them too). */
export { wholeMinutes } from '../core/league/helpers';

/**
 * Who starts the next game, from players in depth-chart order: the first five available ones, as the
 * engine starts them (an injured or suspended starter's spot goes to the next man up), as the Rotation
 * screen shows.
 */
export function startingFive(players: { pid: number; injury: { gamesRemaining: number } | null; suspension?: { games: number } }[]): Set<number> {
  return new Set(
    players
      .filter((p) => !isOut(p))
      .slice(0, 5)
      .map((p) => p.pid),
  );
}

/** A box-score line's technicals, flagrants and ejection, as the line marks them: "1 T", "F1", "F2", "Ejected". */
export function disciplineMarks(b: Pick<BoxLine, 'tf' | 'f1' | 'f2' | 'ej'>): string[] {
  const out: string[] = [];
  if (b.tf) out.push(`${b.tf} T`);
  for (const [k, n] of [
    ['F1', b.f1],
    ['F2', b.f2],
  ] as const)
    if (n) out.push(n > 1 ? `${n} ${k}` : k);
  if (b.ej) out.push('Ejected');
  return out;
}

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
