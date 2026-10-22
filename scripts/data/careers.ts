// Real careers in the seed. Each player's real seasons are stored as stat lines (PlayerStats, marked
// real): the stat seasons' lines, which his ratings are derived from, and the history before them
// (HISTORY_SEASONS, back to 2003-04), which only completes his career on record, from per-game and
// advanced tables alone (no NBA.com shot locations that far back). Also the numbers he wore at
// franchises he gave LEGEND_SEASONS seasons and has since left, so one can retire his number when he
// retires (jerseys.ts): read from that team's roster page for his last season there.
import type { PlayerStats } from '../../src/core/types';
import { BBREF_TO_TID, FRANCHISES } from '../../src/core/teams';
import { LEGEND_SEASONS } from '../../src/core/league/jerseys';
import { parseAdvanced, parseContracts, parsePerGame, type AdvRow, type ContractRow, type PerGameRow, type RosterRow } from './parse';
import { COMBINED } from './positions';
import { HISTORY_SEASONS, ROSTER_SEASONS, SEED_SEASON, STAT_SEASONS, rosterSource, type Source } from './sources';

/** A cached page's HTML by source key, or null. */
export type ReadPage = (key: string) => string | null;

/** A season's shot locations (made and attempted at the rim and from midrange), where NBA.com has them. */
export interface Zones {
  rimM: number;
  rimA: number;
  midM: number;
  midA: number;
}

/** One team's line in a real season, as the seed stores it (totals from the per-game averages). */
export function realLine(r: PerGameRow, a: AdvRow | undefined, zones?: Zones): PlayerStats {
  const g = r.g;
  const t = (v: number) => Math.round(v * g);
  return {
    season: r.season,
    tid: BBREF_TO_TID[r.team] ?? -1,
    playoffs: false,
    real: true,
    gp: g,
    gs: r.gs,
    min: Math.round(r.mp * g),
    fgm: t(r.fg),
    fga: t(r.fga),
    tpm: t(r.fg3),
    tpa: t(r.fg3a),
    ftm: t(r.ft),
    fta: t(r.fta),
    orb: t(r.orb),
    drb: t(r.drb),
    ast: t(r.ast),
    stl: t(r.stl),
    blk: t(r.blk),
    tov: t(r.tov),
    pf: t(r.pf),
    pts: t(r.pts),
    pm: 0,
    rimM: zones?.rimM ?? 0,
    rimA: zones?.rimA ?? 0,
    midM: zones?.midM ?? 0,
    midA: zones?.midA ?? 0,
    onPoss: 0,
    onPtsFor: 0,
    onPtsAgainst: 0,
    teamFga: 0,
    teamFta: 0,
    teamTov: 0,
    adv: a
      ? {
          per: a.per,
          ts: a.ts,
          usg: a.usgPct,
          astPct: a.astPct,
          trbPct: a.trbPct,
          stlPct: a.stlPct,
          blkPct: a.blkPct,
          tovPct: a.tovPct,
          ws: a.ws,
          ws48: a.ws48,
          obpm: a.obpm,
          dbpm: a.dbpm,
          bpm: a.bpm,
          vorp: a.vorp,
        }
      : undefined,
  };
}

/** Per-game and advanced rows for these seasons, and the pages missing from the cache. */
export function loadSeasons(read: ReadPage, seasons: number[]): { perGame: PerGameRow[]; adv: AdvRow[]; missing: string[] } {
  const perGame: PerGameRow[] = [];
  const adv: AdvRow[] = [];
  const missing: string[] = [];
  for (const s of seasons) {
    const pg = read(`per_game_${s}`);
    const ad = read(`advanced_${s}`);
    if (!pg || !ad) {
      missing.push(...(pg ? [] : [`per_game_${s}`]), ...(ad ? [] : [`advanced_${s}`]));
      continue;
    }
    perGame.push(...parsePerGame(pg, s).rows);
    adv.push(...parseAdvanced(ad, s));
  }
  return { perGame, adv, missing };
}

export function byId<T extends { id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.id) ?? [];
    list.push(r);
    m.set(r.id, list);
  }
  return m;
}

/**
 * The seed's players: everyone under contract, plus the 140 unsigned players with the most minutes
 * last season (250 at least).
 */
export function seedIds(contracts: ContractRow[], perGame: PerGameRow[]): Set<string> {
  const ids = new Set<string>(contracts.map((c) => c.id));
  const fa = [...byId(perGame).entries()]
    .filter(([id, rows]) => !ids.has(id) && rows.some((r) => r.season === SEED_SEASON - 1 && r.g * r.mp >= 250))
    .map(([id, rows]) => ({ id, min: rows.filter((r) => r.season === SEED_SEASON - 1 && !COMBINED.test(r.team)).reduce((a, r) => a + r.g * r.mp, 0) }))
    .sort((a, b) => b.min - a.min)
    .slice(0, 140);
  for (const f of fa) ids.add(f.id);
  return ids;
}

/** His history lines, oldest first: one per team (a season split between teams has no combined line, as in the stat seasons). */
export function historyLines(rows: PerGameRow[], adv: AdvRow[]): PlayerStats[] {
  return rows
    .filter((r) => !COMBINED.test(r.team))
    .map((r) =>
      realLine(
        r,
        adv.find((x) => x.season === r.season && x.team === r.team),
      ),
    );
}

/**
 * Franchises he gave LEGEND_SEASONS seasons other than his current one (a free agent's: all of them),
 * with the last season he played for each and the team code he played under then (SEA for the
 * Thunder's 2007-08).
 */
export function formerFranchises(rows: PerGameRow[], current: string | null): { tid: number; season: number; team: string }[] {
  const by = new Map<number, { seasons: Set<number>; season: number; team: string }>();
  for (const r of rows) {
    const tid = BBREF_TO_TID[r.team];
    if (tid === undefined || COMBINED.test(r.team) || r.g <= 0) continue;
    const f = by.get(tid) ?? { seasons: new Set<number>(), season: 0, team: r.team };
    f.seasons.add(r.season);
    if (r.season >= f.season) Object.assign(f, { season: r.season, team: r.team });
    by.set(tid, f);
  }
  const cur = current ? BBREF_TO_TID[current] : undefined;
  return [...by].filter(([tid, f]) => tid !== cur && f.seasons.size >= LEGEND_SEASONS).map(([tid, f]) => ({ tid, season: f.season, team: f.team }));
}

/**
 * The roster pages with the numbers the seed's players wore at their former franchises: their last
 * season at each, unless it is one of ROSTER_SEASONS (fetched for every team anyway). Read from the
 * cached contracts and per-game pages, so the fetcher asks for these once those are in.
 */
export function numberSources(read: ReadPage): Source[] {
  const html = read('contracts');
  if (!html) return [];
  const contracts = parseContracts(html);
  const recent = loadSeasons(read, STAT_SEASONS);
  if (recent.missing.length) return [];
  const all = byId([...loadSeasons(read, HISTORY_SEASONS).perGame, ...recent.perGame]);
  const team = new Map(contracts.map((c) => [c.id, c.team]));
  const out = new Map<string, Source>();
  for (const id of seedIds(contracts, recent.perGame))
    for (const f of formerFranchises(all.get(id) ?? [], team.get(id) ?? null))
      if (!ROSTER_SEASONS.includes(f.season)) {
        const s = rosterSource(f.team, f.season);
        out.set(s.key, s);
      }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The number he last wore at each former franchise, keyed by its code today (OKC for Seattle's), from
 * the roster pages of his last season there; franchises whose page or number is missing are left out.
 */
export function formerNumbers(rows: PerGameRow[], current: string | null, rosterRow: (team: string, season: number) => RosterRow | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of formerFranchises(rows, current)) {
    const number = rosterRow(f.team, f.season)?.jersey;
    if (number) out[FRANCHISES[f.tid].bbref] = number;
  }
  return out;
}
