// On-device saves in IndexedDB. Each league is one record plus its game results, which live in
// their own store keyed by [league id, gid]: a result doesn't change once played, so a save writes
// only the new ones instead of structured-cloning a season of box scores every time. A small
// index lists the leagues and carries the revision that keeps two windows from overwriting each other.
// Each league also keeps one snapshot: a copy of itself as it started the season (see snapshot), the
// way back when its record is damaged or a season went wrong.
import { openDB, type IDBPDatabase } from 'idb';
import type { GameResult, League } from '../core/types';
import { MIN_SAVE_VERSION, SAVE_VERSION, seasonLabel } from '../core/constants';
import { migrate as checkSave, obj } from './saveCheck';

// what a loaded save must look like lives in saveCheck.ts; screens and the backup import it from here
export { isLeague, OldSaveError } from './saveCheck';

const DIFFICULTIES: readonly unknown[] = ['easy', 'normal', 'hard'];

/**
 * A save checked and brought up to date (see saveCheck.ts), and the owner's parts in shape: a setting
 * waiting for opening night that's damaged goes, as if it was never chosen (see applyPendingSettings).
 * Saves from before it load as they are: the owner's newer fields (a goal's edge on the court, his
 * words on a review, a season's difficulty) are optional, read as absent.
 */
export function migrate(x: unknown, notALeague?: string): League {
  const league = checkSave(x, notALeague);
  const p: unknown = league.settings.pending;
  if (p !== undefined) {
    const ok = obj(p) && (p.difficulty === undefined || DIFFICULTIES.includes(p.difficulty)) && (p.jobSecurity === undefined || p.jobSecurity === false);
    if (!ok) delete league.settings.pending;
  }
  return league;
}

export interface LeagueMeta {
  id: string;
  name: string;
  teamName: string;
  teamAbbrev: string;
  colors: [string, string, string];
  /** The user's team id (absent on saves from before it was kept: the list finds the franchise by abbreviation). */
  userTid?: number;
  season: number;
  phase: string;
  record: string;
  updated: number;
  /** Bumped by every save; absent on saves from before revisions. */
  rev?: number;
  /** The save format (absent before format 4): older ones can't be opened (see `openable`). */
  version?: number;
  /** The league's snapshot (see snapshot): the season it started and when it was taken. Absent until the first. */
  snap?: { season: number; at: number };
}

/** Whether this build can open a saved league (the start screen offers older ones for deletion only). */
export const openable = (m: LeagueMeta) => (m.version ?? 0) >= MIN_SAVE_VERSION;

// the save format lives in core, so a new league is stamped with it too
export { SAVE_VERSION };

/** Another window saved (or deleted) this league after this one read it. */
export class SaveConflictError extends Error {
  /** The other window deleted it. */
  readonly deleted: boolean;
  constructor(deleted = false) {
    super(deleted ? 'This league was deleted in another window.' : 'This league was changed in another window.');
    this.name = 'SaveConflictError';
    this.deleted = deleted;
  }
}

export const isQuotaError = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === DOMException.QUOTA_EXCEEDED_ERR);

/**
 * What this window last read or wrote for a league object: the revision, and the results on disk
 * by game id (with whether each still had its play-by-play). Results are only ever added, apart
 * from an older game of the user's dropping its play-by-play, so that is all a save compares; a
 * copy of the league (one coming back from the sim worker) takes it over with `adoptSync`.
 */
interface Synced {
  rev: number | undefined;
  games: Map<number, boolean>;
}
const synced = new WeakMap<League, Synced>();

/** Whether this league object came from the device or has been saved to it from this window. */
export const onDevice = (league: League) => synced.has(league);

const tracked = (league: League, rev: number | undefined): Synced => ({ rev, games: new Map(league.games.map((g) => [g.gid, !!g.pbp])) });

/** A copy of a league (from the sim worker) takes over what this window knows the device holds for the original. */
export function adoptSync(from: League, to: League) {
  const s = synced.get(from);
  if (s) synced.set(to, s);
}

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
    dbp = openDB('hoops-career', 3, {
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
        // one snapshot per league, keyed by its id (a league's first save on version 3 takes it)
        if (from < 3) d.createObjectStore('snapshots');
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

/**
 * Run one operation on the database. The browser may close or lose an idle connection without
 * telling (Safari does, to a home-screen app left in the background): a failure reopens it and
 * tries once more, so neither saves nor the saved-leagues list stay broken until a restart.
 */
async function withDb<T>(op: (d: IDBPDatabase) => Promise<T>): Promise<T> {
  const p = db();
  try {
    return await op(await p);
  } catch (e) {
    if (e instanceof SaveConflictError || isQuotaError(e)) throw e;
    // (unless another operation already reopened it)
    if (dbp === p) {
      dbp = null;
      void p.then((d) => d.close()).catch(() => {});
    }
    return op(await db());
  }
}

let channel: BroadcastChannel | null | undefined;
/** Tells other windows which league changed, so they stop autosaving their stale copy right away. */
function broadcast() {
  if (channel === undefined) channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hoops-career') : null;
  return channel;
}

/** Subscribe to saves and deletions made in other windows; returns the unsubscribe. */
export function onRemoteChange(fn: (id: string, deleted: boolean) => void): () => void {
  const ch = broadcast();
  // a save posts the league's id, a deletion { id, deleted: true }
  const h = (e: MessageEvent<unknown>) => {
    if (typeof e.data === 'string') fn(e.data, false);
    else if (obj(e.data) && typeof e.data.id === 'string') fn(e.data.id, e.data.deleted === true);
  };
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
    userTid: league.userTid,
    season: league.season,
    phase: league.phase,
    record: ts ? `${ts.won}-${ts.lost}` : '0-0',
    updated: Date.now(),
    version: SAVE_VERSION,
  };
}

/** Write the league; resolves whether its snapshot is due (none yet of this season: see snapshot). */
async function write(d: IDBPDatabase, league: League): Promise<boolean> {
  const tx = d.transaction(['leagues', 'meta', 'games'], 'readwrite');
  // a failed write rejects through the awaited requests below
  tx.done.catch(() => {});
  const metas = tx.objectStore('meta');
  const games = tx.objectStore('games');
  const prev = synced.get(league);
  const cur = (await metas.get(league.id)) as LeagueMeta | undefined;
  // checked inside the write transaction, so no other window can save in between
  if ((cur ? (cur.rev ?? 0) : undefined) !== prev?.rev) throw new SaveConflictError(!cur);
  const rev = (prev?.rev ?? 0) + 1;
  const next = new Map<number, boolean>();
  const ops: Promise<unknown>[] = [];
  try {
    league.version = SAVE_VERSION;
    ops.push(tx.objectStore('leagues').put({ ...league, games: [] }, league.id));
    // a league this window didn't read (new or imported) replaces whatever results its id had
    if (!prev) ops.push(games.delete(gamesOf(league.id)));
    for (const g of league.games) {
      // played results only change when an older game of yours drops its play-by-play
      if (prev?.games.get(g.gid) !== !!g.pbp) ops.push(games.put(g, [league.id, g.gid]));
      next.set(g.gid, !!g.pbp);
    }
    for (const gid of prev?.games.keys() ?? []) if (!next.has(gid)) ops.push(games.delete([league.id, gid]));
    // (the snapshot's entry stays as it was: only a snapshot writes it)
    ops.push(metas.put({ ...metaFor(league), rev, ...(cur?.snap && { snap: cur.snap }) }, league.id));
  } catch (e) {
    // a value IndexedDB can't store: write nothing rather than half a league
    void Promise.allSettled(ops);
    tx.abort();
    throw e;
  }
  await Promise.all([...ops, tx.done]);
  synced.set(league, { rev, games: next });
  broadcast()?.postMessage(league.id);
  return cur?.snap?.season !== league.season;
}

export async function saveLeague(league: League) {
  const due = await withDb((d) => write(d, league));
  // the season's first save keeps a copy of the league as it starts it. The save itself is done
  // either way: a snapshot that can't be written (the device short of space) is tried again next save
  if (due)
    await snapshot(league).catch((e) => {
      if (!isQuotaError(e)) console.warn('The season snapshot could not be saved:', e);
    });
}

/**
 * Keep a copy of the league as it stands, replacing its last one: taken by the first save of each
 * season, so a new season (its preseason, as the rollover saves it) starts with one. It shares the
 * device with the save, so it's no help when the browser clears the whole site, but it is when the
 * league's own record is damaged or a season went wrong: the main menu and Settings restore it as a
 * copy (see restoreSnapshot), or export it. Kept small: results without their play-by-play, shot
 * charts and flow, and no highlights reel (a new season has dropped them anyway).
 */
async function snapshot(league: League) {
  // built now, as the league stands: the put clones it before anything can change it
  const copy: Partial<League> = {
    ...league,
    games: league.games.map((g) => ({ ...g, pbp: undefined, shots: undefined, flow: undefined, flowPeriods: undefined, flowT: undefined, flowPoss: undefined })),
  };
  delete copy.reel;
  const snap = { season: league.season, at: Date.now() };
  await withDb(async (d) => {
    const tx = d.transaction(['snapshots', 'meta'], 'readwrite');
    tx.done.catch(() => {});
    const meta = (await tx.objectStore('meta').get(league.id)) as LeagueMeta | undefined;
    // deleted meanwhile (in another window): nothing to keep a copy of
    if (!meta) return;
    await Promise.all([tx.objectStore('snapshots').put(copy, league.id), tx.objectStore('meta').put({ ...meta, snap }, league.id), tx.done]);
  });
  // a career a season or more along is worth asking the browser to keep through a storage squeeze
  // (Safari and Chrome may otherwise clear a site's storage; Firefox asks the player, once)
  if (league.season > league.startSeason) keepStorage();
}

let askedToKeep = false;
/** Ask the browser, once a session, not to clear this site's storage when the device runs short. */
function keepStorage() {
  if (askedToKeep) return;
  askedToKeep = true;
  try {
    void globalThis.navigator?.storage?.persist?.().catch(() => {});
  } catch {
    /* (no storage manager: nothing to ask) */
  }
}

/** The league's snapshot as stored, unchecked (to export it as it is). */
export async function loadRawSnapshot(id: string): Promise<unknown> {
  return withDb((d) => d.get('snapshots', id));
}

/** When the league's snapshot was taken and the season it starts, if it has one. */
export async function snapshotOf(id: string): Promise<LeagueMeta['snap']> {
  const meta = (await withDb((d) => d.get('meta', id))) as LeagueMeta | undefined;
  return meta?.snap;
}

/**
 * Store the league's snapshot as a league of its own, beside the league (which may be the damaged
 * one, or simply further on): named for the season it starts, under an id of its own, so restoring
 * never overwrites anything. Resolves to the new league.
 */
export async function restoreSnapshot(id: string): Promise<League> {
  const raw = await loadRawSnapshot(id);
  if (raw === undefined) throw new Error('There is no season snapshot of that league on this device.');
  const league = migrate(raw, 'The season snapshot is damaged.');
  league.id = `${id}-${Date.now().toString(36)}`;
  league.name = `${league.name} (${seasonLabel(league.season)} start)`;
  await saveLeague(league);
  return league;
}

function readAll(id: string) {
  return withDb(async (d) => {
    const tx = d.transaction(['leagues', 'meta', 'games']);
    const [raw, meta, games] = await Promise.all([
      tx.objectStore('leagues').get(id),
      tx.objectStore('meta').get(id) as Promise<LeagueMeta | undefined>,
      tx.objectStore('games').getAll(gamesOf(id)) as Promise<GameResult[]>,
      tx.done,
    ]);
    return { raw: raw as Record<string, unknown> | undefined, meta, games: games.sort(playOrder) };
  });
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
  const all = (await withDb((d) => d.getAll('meta'))) as LeagueMeta[];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function deleteLeague(id: string) {
  await withDb(async (d) => {
    const tx = d.transaction(['leagues', 'meta', 'games', 'snapshots'], 'readwrite');
    // (its snapshot goes with it)
    await Promise.all([
      tx.objectStore('leagues').delete(id),
      tx.objectStore('meta').delete(id),
      tx.objectStore('games').delete(gamesOf(id)),
      tx.objectStore('snapshots').delete(id),
      tx.done,
    ]);
  });
  broadcast()?.postMessage({ id, deleted: true });
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
