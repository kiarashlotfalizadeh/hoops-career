// On-device saves in IndexedDB. Each league is one record plus its game results, which live in
// their own store keyed by [league id, gid]: a result doesn't change once played, so a save writes
// only the new ones instead of structured-cloning a season of box scores every time. A small
// index lists the leagues and carries the revision that keeps two windows from overwriting each other.
import { openDB, type IDBPDatabase } from 'idb';
import type { GameResult, League } from '../core/types';

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
  /** Bumped by every save; absent on saves from before revisions. */
  rev?: number;
}

/** Format of the league record. Bump it, with a step in migrate(), when that format changes. */
export const SAVE_VERSION = 1;

/** Another window saved (or deleted) this league after this one read it. */
export class SaveConflictError extends Error {
  constructor() {
    super('This league was changed in another window.');
    this.name = 'SaveConflictError';
  }
}

export const isQuotaError = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === DOMException.QUOTA_EXCEEDED_ERR);

/** What this window last read or wrote for a league object: the revision, and the results on disk. */
interface Synced {
  rev: number | undefined;
  games: Map<number, { g: GameResult; pbp: boolean }>;
}
const synced = new WeakMap<League, Synced>();

const tracked = (league: League, rev: number | undefined): Synced => ({ rev, games: new Map(league.games.map((g) => [g.gid, { g, pbp: !!g.pbp }])) });

/** Key range of one league's results. */
const gamesOf = (id: string) => IDBKeyRange.bound([id], [id, []]);

/** Results in the order they were played (gids of Cup knockouts and playoffs come after the regular schedule). */
const playOrder = (a: GameResult, b: GameResult) => a.season - b.season || a.day - b.day || a.gid - b.gid;

let dbp: Promise<IDBPDatabase> | null = null;
let blockedListener: (() => void) | null = null;

/** Called while an older tab holds the database open and keeps this one from upgrading it. */
export function onBlocked(fn: (() => void) | null) {
  blockedListener = fn;
}

function db() {
  if (!dbp) {
    dbp = openDB('hoops-career', 2, {
      async upgrade(d, from, _to, tx) {
        if (from < 1) {
          d.createObjectStore('leagues');
          d.createObjectStore('meta');
        }
        if (from < 2) {
          const games = d.createObjectStore('games');
          // version 1 kept every result inside its league record
          for (let c = await tx.objectStore('leagues').openCursor(); c; c = await c.continue()) {
            const l = c.value as League;
            const id = c.key as string;
            await Promise.all([...(l.games ?? []).map((g) => games.put(g, [id, g.gid])), c.update({ ...l, games: [] })]);
          }
        }
      },
      blocked: () => blockedListener?.(),
      // a newer version wants to upgrade (another tab updated the app): let it, and reopen next time
      blocking: (_cur, _next, e) => {
        (e.target as IDBDatabase).close();
        dbp = null;
      },
      terminated: () => {
        dbp = null;
      },
    }).catch((e) => {
      dbp = null;
      throw e;
    });
  }
  return dbp;
}

let channel: BroadcastChannel | null | undefined;
/** Tells other windows which league changed, so they stop autosaving their stale copy right away. */
function broadcast() {
  if (channel === undefined) channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hoops-career') : null;
  return channel;
}

/** Subscribe to saves and deletions made in other windows; returns the unsubscribe. */
export function onRemoteChange(fn: (id: string) => void): () => void {
  const ch = broadcast();
  const h = (e: MessageEvent) => typeof e.data === 'string' && fn(e.data);
  ch?.addEventListener('message', h);
  return () => ch?.removeEventListener('message', h);
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

async function write(league: League) {
  const d = await db();
  const tx = d.transaction(['leagues', 'meta', 'games'], 'readwrite');
  // a failed write rejects through the awaited requests below
  tx.done.catch(() => {});
  const metas = tx.objectStore('meta');
  const games = tx.objectStore('games');
  const prev = synced.get(league);
  const cur = (await metas.get(league.id)) as LeagueMeta | undefined;
  // checked inside the write transaction, so no other window can save in between
  if ((cur ? (cur.rev ?? 0) : undefined) !== prev?.rev) throw new SaveConflictError();
  const rev = (prev?.rev ?? 0) + 1;
  const next = new Map<number, { g: GameResult; pbp: boolean }>();
  const ops: Promise<unknown>[] = [];
  try {
    league.version = SAVE_VERSION;
    ops.push(tx.objectStore('leagues').put({ ...league, games: [] }, league.id));
    // a league this window didn't read (new or imported) replaces whatever results its id had
    if (!prev) ops.push(games.delete(gamesOf(league.id)));
    for (const g of league.games) {
      const was = prev?.games.get(g.gid);
      // played results only change when an older game of yours drops its play-by-play
      if (was?.g !== g || was.pbp !== !!g.pbp) ops.push(games.put(g, [league.id, g.gid]));
      next.set(g.gid, { g, pbp: !!g.pbp });
    }
    for (const gid of prev?.games.keys() ?? []) if (!next.has(gid)) ops.push(games.delete([league.id, gid]));
    ops.push(metas.put({ ...metaFor(league), rev }, league.id));
  } catch (e) {
    // a value IndexedDB can't store: write nothing rather than half a league
    void Promise.allSettled(ops);
    tx.abort();
    throw e;
  }
  await Promise.all([...ops, tx.done]);
  synced.set(league, { rev, games: next });
  broadcast()?.postMessage(league.id);
}

export async function saveLeague(league: League) {
  try {
    await write(league);
  } catch (e) {
    if (e instanceof SaveConflictError || isQuotaError(e)) throw e;
    // the browser may close or lose an idle connection (Safari does): reopen it once
    void dbp?.then((d) => d.close()).catch(() => {});
    dbp = null;
    await write(league);
  }
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown) => typeof v === 'string';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const PHASES = new Set(['preseason', 'regular', 'playin', 'playoffs', 'draftLottery', 'draft', 'resign', 'freeAgency']);

/** Structural check so a damaged or foreign file never becomes the active league (or crashes the screens that read it). */
export function isLeague(x: unknown): x is League {
  if (!obj(x)) return false;
  const l = x as Partial<League>;
  return (
    str(l.id) &&
    str(l.name) &&
    num(l.season) &&
    num(l.day) &&
    str(l.phase) &&
    PHASES.has(l.phase as string) &&
    num(l.userTid) &&
    obj(l.settings) &&
    Array.isArray(l.teams) &&
    l.teams.length >= 2 &&
    l.teams.every(
      (t, i) => obj(t) && t.tid === i && str(t.abbrev) && str(t.region) && str(t.name) && Array.isArray(t.colors) && Array.isArray(t.seasons) && obj(t.rotation) && obj(t.tactics),
    ) &&
    !!l.teams[l.userTid as number] &&
    obj(l.players) &&
    Object.values(l.players).every((p) => obj(p) && num(p.pid) && num(p.tid) && str(p.firstName) && str(p.lastName) && obj(p.ratings) && Array.isArray(p.stats)) &&
    Array.isArray(l.schedule) &&
    l.schedule.every((g) => obj(g) && num(g.gid) && num(g.day) && num(g.home) && num(g.away) && str(g.type)) &&
    Array.isArray(l.games) &&
    l.games.every((g) => obj(g) && num(g.gid) && num(g.season) && num(g.day) && obj(g.home) && obj(g.away) && num(g.home.tid) && num(g.away.tid)) &&
    [l.inbox, l.news, l.awards, l.draftPicks, l.playoffs, l.playIn].every(Array.isArray) &&
    (l.inbox as unknown[]).every((m) => obj(m) && str(m.subject) && str(m.body))
  );
}

/** In-app routes only: inbox links come from the save file, which may have been crafted. */
const isRoute = (s: unknown) => typeof s === 'string' && /^\/(?![/\\])/.test(s);

/**
 * Bring a league read from the device or a backup up to the current format. Refuses saves from a
 * newer version of the app (they may hold data this one would drop) and anything that isn't a league.
 */
export function migrate(x: unknown, notALeague = 'This save is damaged or from an incompatible version.'): League {
  const version = obj(x) ? x.version : undefined;
  if (num(version) && (version as number) > SAVE_VERSION) throw new Error('This league was saved by a newer version of Hoops Career. Update the app to open it.');
  if (!isLeague(x)) throw new Error(notALeague);
  for (const m of x.inbox) if (m.link !== undefined && !isRoute(m.link)) delete m.link;
  x.version = SAVE_VERSION;
  return x;
}

async function readAll(id: string) {
  const d = await db();
  const tx = d.transaction(['leagues', 'meta', 'games']);
  const [raw, meta, games] = await Promise.all([
    tx.objectStore('leagues').get(id),
    tx.objectStore('meta').get(id) as Promise<LeagueMeta | undefined>,
    tx.objectStore('games').getAll(gamesOf(id)) as Promise<GameResult[]>,
    tx.done,
  ]);
  return { raw: raw as Record<string, unknown> | undefined, meta, games: games.sort(playOrder) };
}

export async function loadLeague(id: string): Promise<League | undefined> {
  const { raw, meta, games } = await readAll(id);
  if (raw === undefined) return undefined;
  const league = migrate({ ...raw, games });
  synced.set(league, tracked(league, meta ? (meta.rev ?? 0) : undefined));
  return league;
}

/** The stored league as it is, unchecked: lets the player keep a save this version can't open. */
export async function loadRawLeague(id: string): Promise<unknown> {
  const { raw, games } = await readAll(id);
  return raw && { ...raw, games };
}

export async function listLeagues(): Promise<LeagueMeta[]> {
  const d = await db();
  const all = (await d.getAll('meta')) as LeagueMeta[];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function deleteLeague(id: string) {
  const d = await db();
  const tx = d.transaction(['leagues', 'meta', 'games'], 'readwrite');
  await Promise.all([tx.objectStore('leagues').delete(id), tx.objectStore('meta').delete(id), tx.objectStore('games').delete(gamesOf(id)), tx.done]);
  broadcast()?.postMessage(id);
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
