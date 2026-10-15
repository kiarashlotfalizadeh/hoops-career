// On-device saves in IndexedDB. Each league is one record plus its game results, which live in
// their own store keyed by [league id, gid]: a result doesn't change once played, so a save writes
// only the new ones instead of structured-cloning a season of box scores every time. A small
// index lists the leagues and carries the revision that keeps two windows from overwriting each other.
import { openDB, type IDBPDatabase } from 'idb';
import type { GamePlanItem, GameResult, League } from '../core/types';
import { SAVE_VERSION } from '../core/constants';
import { FRANCHISES } from '../core/teams';
import { MAX_STEPS } from './live';

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

/** What this window last read or wrote for a league object: the revision, and the results on disk. */
interface Synced {
  rev: number | undefined;
  games: Map<number, { g: GameResult; pbp: boolean }>;
}
const synced = new WeakMap<League, Synced>();

/** Whether this league object came from the device or has been saved to it from this window. */
export const onDevice = (league: League) => synced.has(league);

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
    season: league.season,
    phase: league.phase,
    record: ts ? `${ts.won}-${ts.lost}` : '0-0',
    updated: Date.now(),
  };
}

async function write(d: IDBPDatabase, league: League) {
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
  await withDb((d) => write(d, league));
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
/** Team colours go into the screens' styles as they are: from a crafted save, one could pull in a remote url(). */
const isColor = (s: unknown) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

/**
 * Version 2 kept one game plan (`gamePlan`, for the next game against one opponent); version 3
 * keeps one per opponent. Version-2 plans also left tonight's opponent's matchups in the user's
 * own tactics when live changes were kept: those name players of one opponent, so they go.
 */
function migrateGamePlan(x: League, fromV2: boolean) {
  const user = x.teams[x.userTid];
  if (fromV2 && user && obj(user.tactics) && obj(user.tactics.defense)) user.tactics.defense.matchups = {};
  const old = (x as League & { gamePlan?: unknown }).gamePlan;
  if (old === undefined) return;
  delete (x as League & { gamePlan?: unknown }).gamePlan;
  if (!obj(old) || !num(old.oppTid) || !Array.isArray(old.items) || !old.items.length || !x.teams[old.oppTid as number]) return;
  const items = (old.items as unknown[]).filter((it): it is GamePlanItem => obj(it) && str(it.id) && str(it.label) && obj(it.patch));
  if (items.length) x.gamePlans = { ...x.gamePlans, [old.oppTid as number]: { oppTid: old.oppTid as number, items, scope: 'next' } };
}

/**
 * Bring a league read from the device or a backup up to the current format. Refuses saves from a
 * newer version of the app (they may hold data this one would drop) and anything that isn't a league.
 */
export function migrate(x: unknown, notALeague = 'This save is damaged or from an incompatible version.'): League {
  const version = obj(x) ? x.version : undefined;
  if (num(version) && (version as number) > SAVE_VERSION) throw new Error('This league was saved by a newer version of Hoops Career. Update the app to open it.');
  if (!isLeague(x)) throw new Error(notALeague);
  for (const m of x.inbox) if (m.link !== undefined && !isRoute(m.link)) delete m.link;
  for (const t of x.teams) {
    if (t.colors.length === 3 && t.colors.every(isColor)) continue;
    const [a, b, c] = FRANCHISES[t.tid]?.colors ?? ['#334155', '#94a3b8', '#ffffff'];
    t.colors = [a, b, c];
  }
  // 1 → 2: nothing to change (version-1 snapshots all carry full ratings)
  // 2 → 3: new data is optional (absent in older saves); the steps below read old data into it
  migrateGamePlan(x, !num(version) || (version as number) < 3);
  // AI trade offers: a damaged one, or one whose players or picks are gone, is dropped (the
  // inbox then says the offer is closed), and so is an untouchable mark on a player who is gone
  if (x.proposals !== undefined) x.proposals = Array.isArray(x.proposals) ? x.proposals.filter((p) => proposalIntact(x, p)) : [];
  if (x.untouchable !== undefined) x.untouchable = Array.isArray(x.untouchable) ? x.untouchable.filter((pid) => num(pid) && !!x.players[pid]) : [];
  for (const m of x.inbox) if (m.proposal !== undefined && !num(m.proposal)) delete m.proposal;
  // a live game's journal that's damaged, or not for today's game any more, goes (the game starts over)
  if (x.live !== undefined && !liveIntact(x, x.live)) delete x.live;
  // game-time decisions in shape (whom they clear is checked again when the game is set up)
  if (x.gameTime !== undefined && !(obj(x.gameTime) && int(x.gameTime.gid) && nums(x.gameTime.play))) delete x.gameTime;
  // win-probability data of the user's games: a damaged list goes (the charts fall back as for older games)
  for (const g of x.games) {
    if (g.edge !== undefined && !num(g.edge)) delete g.edge;
    if (g.flowT !== undefined && !(nums(g.flowT) && g.flowT.length === g.flow?.length)) delete g.flowT;
    if (g.flowPoss !== undefined && !(Array.isArray(g.flowPoss) && g.flowPoss.length === g.flowPeriods?.length && g.flowPoss.every((s) => s === 0 || s === 1))) delete g.flowPoss;
  }
  x.version = SAVE_VERSION;
  return x;
}

const int = (v: unknown): v is number => Number.isInteger(v);
const nums = (v: unknown): v is number[] => Array.isArray(v) && v.every(num);
const numValues = (v: unknown) => obj(v) && Object.values(v).every(num);
const isTactics = (t: unknown) => obj(t) && obj(t.offense) && obj(t.defense) && obj(t.manage);
/** More moves than any coach makes in a game: a journal with more was crafted. */
const MAX_LIVE_OPS = 5000;
const PLAY_CALLS = new Set(['three', 'two', 'hold', 'foul', 'iso']);

/** A journaled coaching move's arguments in shape. */
function liveArgs(op: unknown, a: Record<string, unknown>): boolean {
  switch (op) {
    case 'sub':
      return int(a.out) && int(a.in);
    case 'tactics':
      return isTactics(a.tactics) && (a.plan === undefined || typeof a.plan === 'boolean');
    case 'timeout':
      return a.reason === undefined || (str(a.reason) && (a.reason as string).length <= 80);
    case 'manualSubs':
      return typeof a.on === 'boolean';
    case 'call':
      return obj(a.call) && PLAY_CALLS.has(a.call.kind as string) && (a.call.kind !== 'iso' || int(a.call.pid));
    case 'cancelCall':
      return true;
  }
  return false;
}

/**
 * A live game's journal (League.live) in shape, for the user's game today that's still to be
 * played. The save may have been crafted: whatever passes still has to play back to the score and
 * clock it records before the game is picked up from it (see LiveGame.fromJournal).
 */
function liveIntact(l: League, j: unknown): boolean {
  if (!obj(j) || !int(j.gid) || !int(j.tid) || !num(j.seed) || typeof j.injuries !== 'boolean') return false;
  if (!int(j.steps) || j.steps < 0 || j.steps > MAX_STEPS || !int(j.q) || j.q < 1 || !num(j.clock) || !nums(j.score) || j.score.length !== 2) return false;
  const u = j.user;
  if (!obj(u) || !isTactics(u.tactics) || !numValues(u.perf) || !nums(u.rest) || !num(u.injuryMult) || (u.play !== undefined && !nums(u.play))) return false;
  if (j.edge !== undefined && !num(j.edge)) return false;
  const r = u.rotation;
  if (!obj(r) || !nums(r.order) || !numValues(r.minutes) || !nums(r.closers) || !nums(r.restB2B) || !numValues(r.caps)) return false;
  if ((j.keep !== undefined && !isTactics(j.keep)) || (j.seen !== undefined && !(nums(j.seen) && j.seen.length === 2))) return false;
  const o = j.opp;
  if (
    o !== undefined &&
    !(obj(o) && isTactics(o.tactics) && (o.plan === undefined || (obj(o.plan) && Array.isArray(o.plan.items) && o.plan.items.every((it) => obj(it) && obj(it.patch)))))
  )
    return false;
  if (!Array.isArray(j.ops) || j.ops.length > MAX_LIVE_OPS) return false;
  let at = 0;
  for (const o of j.ops as unknown[]) {
    if (!obj(o) || !int(o.at) || o.at < at || o.at > j.steps || !obj(o.args) || !liveArgs(o.op, o.args)) return false;
    at = o.at;
  }
  const g = l.schedule.find((x) => x.gid === j.gid);
  return j.tid === l.userTid && !!g && !g.played && g.day === l.day && (g.home === j.tid || g.away === j.tid);
}

/** A stored trade offer with both sides in shape, and every player and pick in it still in the league. */
function proposalIntact(l: League, p: unknown): boolean {
  if (!obj(p) || !num(p.id) || !num(p.tid) || !num(p.season) || !num(p.expires) || !obj(p.offer)) return false;
  const pick = new Set(l.draftPicks.map((d) => d.dpid));
  return [p.offer.a, p.offer.b].every(
    (s) =>
      obj(s) &&
      num(s.tid) &&
      !!l.teams[s.tid as number] &&
      Array.isArray(s.pids) &&
      Array.isArray(s.dpids) &&
      s.pids.every((pid) => num(pid) && !!l.players[pid as number]) &&
      s.dpids.every((d) => num(d) && pick.has(d as number)),
  );
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
    const tx = d.transaction(['leagues', 'meta', 'games'], 'readwrite');
    await Promise.all([tx.objectStore('leagues').delete(id), tx.objectStore('meta').delete(id), tx.objectStore('games').delete(gamesOf(id)), tx.done]);
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
