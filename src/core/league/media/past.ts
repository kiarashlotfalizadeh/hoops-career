// The NBA's past, for a real league: every Finals since 1947 and every MVP (League.past), and each
// seed player's real honours (his MVPs, Finals MVPs, All-NBA and All-Star selections, titles...) put
// on his record before the first season, so his cards, his farewell, the Hall of Fame and the
// press's "his third MVP" read true from day one, and the league opens with a defending champion.
// Written by `npm run data:history` (scripts/data/history-apply.ts) to src/data/history.json from what
// the build has on disk, loaded with the seed (seedLoader.ts) and applied once at creation
// (create.ts). A fictional league has no past: its first champion is its first.
import type { League, PastFinal } from '../../types';

/** A Finals as history.json keeps it: like PastFinal, with franchise codes ('' a franchise long gone) in place of tids. */
export type HistoryFinal = [season: number, champ: string, runner: string, w: number, l: number, mvp: string, champAs?: string | null, runnerAs?: string | null];

/** src/data/history.json. */
export interface HistoryData {
  through: number;
  honoursFrom: number;
  finals: HistoryFinal[];
  mvps: [number, string][];
  /** By Basketball Reference id: "AS:2005-2026;MVP:2009,2010" (codes in CODE_TYPE). */
  players: Record<string, string>;
}

/** history.json's honour codes to the award's name on a player's record. */
export const CODE_TYPE: Record<string, string> = {
  MVP: 'MVP',
  FMVP: 'Finals MVP',
  DPOY: 'Defensive Player of the Year',
  ROY: 'Rookie of the Year',
  '6MOY': 'Sixth Man of the Year',
  MIP: 'Most Improved Player',
  NBA1: 'All-NBA 1st Team',
  NBA2: 'All-NBA 2nd Team',
  NBA3: 'All-NBA 3rd Team',
  DEF1: 'All-Defensive 1st Team',
  DEF2: 'All-Defensive 2nd Team',
  AS: 'All-Star',
  CH: 'Champion',
};

/** "2005-2008,2011" back to its seasons. */
function seasonsOf(runs: string): number[] {
  const out: number[] = [];
  for (const part of runs.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let s = a; s <= (b || a); s++) out.push(s);
  }
  return out;
}

/**
 * Give a new real league its past: the Finals and MVPs (League.past) and each seeded player's
 * honours before its first season, oldest first ahead of any he has. Only seasons before the league
 * count (a later history.json can't add to a league already playing).
 */
export function applyHistory(league: League, data: HistoryData) {
  const tidOf = new Map(league.teams.map((t) => [t.abbrev, t.tid]));
  const before = league.startSeason;
  const finals: PastFinal[] = data.finals
    .filter((f) => f[0] < before)
    .map(([s, c, r, w, l, mvp, cAs, rAs]) => {
      const row: PastFinal = [s, c ? (tidOf.get(c) ?? -1) : -1, r ? (tidOf.get(r) ?? -1) : -1, w, l, mvp];
      if (cAs || rAs) row.push(cAs ?? null, rAs ?? null);
      return row;
    });
  league.past = { through: Math.min(data.through, before - 1), honoursFrom: data.honoursFrom, finals, mvps: data.mvps.filter((m) => m[0] < before) };
  for (const p of Object.values(league.players)) {
    const code = p.bbrefId ? data.players[p.bbrefId] : undefined;
    if (!code) continue;
    const real: { season: number; type: string }[] = [];
    for (const part of code.split(';')) {
      const [k, runs] = part.split(':');
      const type = CODE_TYPE[k];
      if (!type || !runs) continue;
      for (const season of seasonsOf(runs)) if (season < before) real.push({ season, type });
    }
    real.sort((a, b) => a.season - b.season);
    p.awards = [...real, ...p.awards.filter((a) => a.season >= before)];
  }
}

/** The seasons a franchise won the title before the league began, oldest first (none for a fictional league). */
export function pastTitles(league: League, tid: number): number[] {
  return (league.past?.finals ?? []).filter((f) => f[1] === tid).map((f) => f[0]);
}

/** The Finals of a season before the league, if the league knows it. */
export const pastFinal = (league: League, season: number): PastFinal | undefined => league.past?.finals.find((f) => f[0] === season);

/** The champion's name in a past Finals when the franchise went by another ("Seattle SuperSonics"), else null. */
export const pastName = (f: PastFinal): string | null => f[6] ?? null;

/**
 * The reigning champion: the last Finals played (this league's, or the real one before its first
 * season), with its season, the runner-up, the series and its Finals MVP's name. Null in a fictional
 * league before its first Finals.
 */
export function defendingChampion(league: League): { tid: number; season: number; runner: number; w: number; l: number; mvp?: string } | null {
  const last = league.awards.filter((a) => a.champion !== undefined).sort((a, b) => b.season - a.season)[0];
  if (last) {
    const fin = chronicleFinal(league, last.season);
    const mvp = last.finalsMvp !== undefined ? league.players[last.finalsMvp] : undefined;
    const [w, l] = fin ? (fin[1] === last.champion ? [fin[3], fin[4]] : [fin[4], fin[3]]) : [4, 0];
    return { tid: last.champion!, season: last.season, runner: last.runnerUp ?? -1, w, l, ...(mvp ? { mvp: `${mvp.firstName} ${mvp.lastName}` } : {}) };
  }
  const f = league.past?.finals.at(-1);
  if (!f || f[1] < 0) return null;
  return { tid: f[1], season: f[0], runner: f[2], w: f[3], l: f[4], ...(f[5] ? { mvp: f[5] } : {}) };
}

/** A season's Finals in this league as [round, high, low, highWins, lowWins]: the playoffs while they're on, then the chronicle. */
function chronicleFinal(league: League, season: number) {
  if (season === league.season) {
    const s = league.playoffs.find((x) => x.round === 4);
    if (s) return [4, s.high, s.low, s.highWins, s.lowWins] as const;
  }
  return league.chronicle?.find((c) => c.season === season)?.series.find((x) => x[0] === 4);
}

/**
 * A franchise's titles in all, the NBA's before the league and this league's: the count, and its last
 * before `season` with the name it won it under when that was another ("the 1979 SuperSonics").
 */
export function franchiseTitles(league: League, tid: number, season = league.season + 1): { n: number; last?: number; lastAs?: string } {
  const past = (league.past?.finals ?? []).filter((f) => f[1] === tid && f[0] < season);
  const here = league.awards.filter((a) => a.champion === tid && a.season < season).map((a) => a.season);
  const all = [...past.map((f) => f[0]), ...here].sort((a, b) => a - b);
  const last = all.at(-1);
  const lastPast = past.find((f) => f[0] === last);
  const as = lastPast?.[6];
  return { n: all.length, ...(last !== undefined ? { last } : {}), ...(as ? { lastAs: as } : {}) };
}

/** "1979" or "the 1979 SuperSonics": a past title's season as the press names it. */
export function titleYear(season: number, as?: string): string {
  return as ? `the ${season} ${as.split(' ').slice(-1)[0]}` : String(season);
}
