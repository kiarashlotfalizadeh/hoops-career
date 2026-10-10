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

export async function loadLeague(id: string): Promise<League | undefined> {
  const d = await db();
  return d.get('leagues', id);
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
