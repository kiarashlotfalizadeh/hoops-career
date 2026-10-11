// On-device saves in IndexedDB. Each league is one record; a small index lists them.
import { openDB, type IDBPDatabase } from 'idb';
import type { League } from '../core/types';

export interface LeagueMeta {
  id: string;
  name: string;
  teamName: string;
  teamAbbrev: string;
  colors: [string, string, string];
  season: number;
  phase: string;
  record: string;
  updated: number;
}

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB('hoops-career', 1, {
      upgrade(d) {
        d.createObjectStore('leagues');
        d.createObjectStore('meta');
      },
    });
  }
  return dbp;
}

export function metaFor(league: League): LeagueMeta {
  const t = league.teams[league.userTid];
  const ts = t.seasons.find((s) => s.season === league.season);
  return {
    id: league.id,
    name: league.name,
    teamName: `${t.region} ${t.name}`,
    teamAbbrev: t.abbrev,
    colors: t.colors,
    season: league.season,
    phase: league.phase,
    record: ts ? `${ts.won}-${ts.lost}` : '0-0',
    updated: Date.now(),
  };
}

export async function saveLeague(league: League) {
  const d = await db();
  const tx = d.transaction(['leagues', 'meta'], 'readwrite');
  await tx.objectStore('leagues').put(league, league.id);
  await tx.objectStore('meta').put(metaFor(league), league.id);
  await tx.done;
}

/** Cheap structural check so a damaged or foreign file never becomes the active league. */
export function isLeague(x: unknown): x is League {
  const l = x as Partial<League> | null;
  return (
    !!l &&
    typeof l === 'object' &&
    typeof l.id === 'string' &&
    typeof l.season === 'number' &&
    typeof l.phase === 'string' &&
    typeof l.userTid === 'number' &&
    Array.isArray(l.teams) &&
    l.teams.length >= 2 &&
    !!l.teams[l.userTid] &&
    !!l.players &&
    typeof l.players === 'object' &&
    Array.isArray(l.schedule) &&
    !!l.settings
  );
}

export async function loadLeague(id: string): Promise<League | undefined> {
  const d = await db();
  const l: unknown = await d.get('leagues', id);
  if (l === undefined) return undefined;
  if (!isLeague(l)) throw new Error('This save is damaged or from an incompatible version.');
  return l;
}

export async function listLeagues(): Promise<LeagueMeta[]> {
  const d = await db();
  const all = (await d.getAll('meta')) as LeagueMeta[];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function deleteLeague(id: string) {
  const d = await db();
  const tx = d.transaction(['leagues', 'meta'], 'readwrite');
  await tx.objectStore('leagues').delete(id);
  await tx.objectStore('meta').delete(id);
  await tx.done;
}

export function lastLeagueId(): string | null {
  try {
    return localStorage.getItem('hc:last');
  } catch {
    return null;
  }
}

export function setLastLeagueId(id: string | null) {
  try {
    if (id) localStorage.setItem('hc:last', id);
    else localStorage.removeItem('hc:last');
  } catch {
    /* ignore */
  }
}
