// On-device saves in IndexedDB. Each league is one record plus its game results, which live in
// their own store keyed by [league id, gid]: a result doesn't change once played, so a save writes
// only the new ones instead of structured-cloning a season of box scores every time. A small
// index lists the leagues and carries the revision that keeps two windows from overwriting each other.
import { openDB, type IDBPDatabase } from 'idb';
import { ACTIONS, FREE_AGENT, PLAYER_DEFENSES, SET_IDS, type GamePlanItem, type GameResult, type League, type Player, type PlayerDefense, type Tactics } from '../core/types';
import { SAVE_VERSION } from '../core/constants';
import { defaultTactics } from '../core/sim/tactics';
import { FRANCHISES } from '../core/teams';
import { REC_STATS, TEAM_REC_STATS, backfillRecords } from '../core/league/records';
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
    l.teams.every((t, i) => obj(t) && t.tid === i && str(t.abbrev) && str(t.region) && str(t.name) && Array.isArray(t.colors) && Array.isArray(t.seasons) && obj(t.rotation)) &&
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

const SCHEMES = new Set<string>(['man', 'zone23', 'zone32', 'box1', 'tri2']);
const PD = new Set<string>(PLAYER_DEFENSES);

/** Instructions by player in shape (opponent pid -> one of the four), or undefined when nothing valid is left. */
function cleanPlayerD(v: unknown): Record<number, PlayerDefense> | undefined {
  if (!obj(v)) return undefined;
  const out: Record<number, PlayerDefense> = {};
  for (const [k, d] of Object.entries(v)) if (Number.isInteger(Number(k)) && typeof d === 'string' && PD.has(d)) out[Number(k)] = d as PlayerDefense;
  return Object.keys(out).length ? out : undefined;
}

const KNOWN_SETS = new Set<string>(SET_IDS);
/** After-timeout plays: an action or a set. */
const ATOS = new Set<string>([...ACTIONS, ...SET_IDS]);

/**
 * The junk-defense, hunt, instruction, foul-to-give and set settings in a part of some tactics (a
 * whole defense / offense / management block, or a patch's) kept only when in shape: an unknown
 * scheme, chase targets that aren't up to two pids, a hunt target that isn't a pid, damaged
 * instructions, a foul to give that isn't a switch, an after-timeout play that's no action or set
 * (or a player for it who isn't a pid) are dropped (a scheme falls back to man-to-man when `whole`),
 * and a set package keeps the sets this version knows, at most four and each once.
 */
function cleanTacticsParts(o: unknown, d: unknown, m: unknown, whole: boolean) {
  if (obj(d)) {
    if (d.scheme !== undefined && !SCHEMES.has(d.scheme as string)) {
      if (whole) d.scheme = 'man';
      else delete d.scheme;
    }
    if (d.chase !== undefined && !(Array.isArray(d.chase) && d.chase.length <= 2 && d.chase.every(int))) delete d.chase;
    if (d.playerD !== undefined) {
      const pd = cleanPlayerD(d.playerD);
      if (pd) d.playerD = pd;
      else delete d.playerD;
    }
  }
  if (obj(o) && o.huntTarget !== undefined && o.huntTarget !== null && !int(o.huntTarget)) delete o.huntTarget;
  if (obj(o) && o.sets !== undefined) {
    const known = Array.isArray(o.sets)
      ? (o.sets as unknown[]).filter((id, i, all): id is string => typeof id === 'string' && KNOWN_SETS.has(id) && all.indexOf(id) === i).slice(0, 4)
      : [];
    if (known.length) o.sets = known;
    else delete o.sets;
  }
  if (obj(m) && m.foulToGive !== undefined && typeof m.foulToGive !== 'boolean') delete m.foulToGive;
  if (obj(m) && m.ato !== undefined && m.ato !== null && !ATOS.has(m.ato as string)) delete m.ato;
  if (obj(m) && m.atoPid !== undefined && m.atoPid !== null && !int(m.atoPid)) delete m.atoPid;
}

/** Whole tactics read from a save (see cleanTacticsParts), their situational plans' patches included. */
function cleanTactics(t: unknown) {
  if (!obj(t)) return;
  cleanTacticsParts(t.offense, t.defense, t.manage, true);
  if (Array.isArray(t.situations)) for (const s of t.situations) if (obj(s) && obj(s.patch)) cleanTacticsParts(s.patch.offense, s.patch.defense, s.patch.manage, false);
}

/** The sliders the engine does its arithmetic with, by part of the tactics. */
const OFFENSE_NUMS = ['pace', 'transition', 'threePoint', 'rimAttack', 'crashBoards'] as const;
const DEFENSE_NUMS = ['help', 'pressure', 'getBack', 'physicality'] as const;
const MANAGE_NUMS = ['hackThreshold', 'timeoutRun', 'fatigueSub'] as const;
/** The optional settings each part may carry beyond the defaults' (checked by cleanTacticsParts, or below). */
const OFFENSE_EXTRAS = ['huntTarget', 'sets'] as const;
const DEFENSE_EXTRAS = ['chase', 'playerD'] as const;
const MANAGE_EXTRAS = ['goTo', 'ato', 'atoPid', 'hackTargets', 'hackFromQ', 'assistantAdjusts', 'foulToGive'] as const;

const record = (v: unknown): v is Record<string, unknown> => obj(v) && !Array.isArray(v);
const situationsIntact = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((s) => obj(s) && obj(s.when) && obj(s.patch)));

/**
 * Whole tactics in the shape the engine and the screens read them: the three parts, the sliders as
 * numbers, the action weights, roles, shot freedom and matchups as records, the screeners (and any
 * hack-a targets) as lists of player ids, and situational plans with a trigger and a patch.
 */
function isTactics(t: unknown): t is Tactics {
  if (!record(t) || !record(t.offense) || !record(t.defense) || !record(t.manage)) return false;
  const { offense: o, defense: d, manage: m } = t;
  return (
    OFFENSE_NUMS.every((k) => num(o[k])) &&
    record(o.actions) &&
    ACTIONS.every((a) => num((o.actions as Record<string, unknown>)[a])) &&
    record(o.roles) &&
    record(o.freedom) &&
    nums(o.screeners) &&
    DEFENSE_NUMS.every((k) => num(d[k])) &&
    record(d.matchups) &&
    MANAGE_NUMS.every((k) => num(m[k])) &&
    (m.hackTargets === undefined || nums(m.hackTargets)) &&
    situationsIntact(t.situations)
  );
}

/** A setting read from a save is the same kind of value as the default it stands in for. */
function sameKind(was: unknown, v: unknown): boolean {
  if (was === null) return v === null || int(v);
  if (Array.isArray(was)) return nums(v);
  if (typeof was === 'object') return record(v);
  return typeof v === typeof was && (typeof v !== 'number' || num(v));
}

/** Copy into a default part each of its settings the save has in shape, and the optional ones it carries. */
function keepSettings(into: object, from: unknown, extras: readonly string[]) {
  if (!record(from)) return;
  const to = into as Record<string, unknown>;
  for (const k of Object.keys(to)) if (k !== 'actions' && sameKind(to[k], from[k])) to[k] = from[k];
  for (const k of extras) if (from[k] !== undefined) to[k] = from[k];
}

/**
 * Tactics that aren't in shape (see isTactics), rebuilt from the defaults with whatever settings of
 * theirs still are: a damaged team plays on instead of crashing every game it's in. The roles the
 * defaults lack are filled in before the team's next game (ensureRotation), its assistant refitting
 * the playbook unless the coach set it by hand.
 */
function repairTactics(t: unknown): Tactics {
  const src = record(t) ? t : {};
  const out = defaultTactics(str(src.offPreset) ? (src.offPreset as string) : undefined, str(src.defPreset) ? (src.defPreset as string) : undefined);
  keepSettings(out.offense, src.offense, OFFENSE_EXTRAS);
  keepSettings(out.defense, src.defense, DEFENSE_EXTRAS);
  keepSettings(out.manage, src.manage, MANAGE_EXTRAS);
  const actions = record(src.offense) ? src.offense.actions : undefined;
  if (record(actions)) for (const a of ACTIONS) if (num(actions[a])) out.offense.actions[a] = actions[a] as number;
  if (out.manage.hackTargets !== undefined && !nums(out.manage.hackTargets)) delete out.manage.hackTargets;
  if (typeof src.manual === 'boolean') out.manual = src.manual;
  if (src.playbook === null || (record(src.playbook) && str(src.playbook.id) && str(src.playbook.name))) out.playbook = src.playbook as Tactics['playbook'];
  if (Array.isArray(src.situations)) {
    const kept = src.situations.filter((s) => obj(s) && obj(s.when) && obj(s.patch));
    if (kept.length) out.situations = kept as Tactics['situations'];
  }
  return out;
}

/** Game plans' new parts: instructions by player, and their items' patches (see cleanTacticsParts). */
function cleanGamePlans(x: League) {
  if (!obj(x.gamePlans)) {
    if (x.gamePlans !== undefined) delete x.gamePlans;
    return;
  }
  for (const p of Object.values(x.gamePlans)) {
    if (!obj(p)) continue;
    if (p.playerD !== undefined) {
      const pd = cleanPlayerD(p.playerD);
      if (pd) p.playerD = pd;
      else delete p.playerD;
    }
    if (Array.isArray(p.items)) for (const it of p.items) if (obj(it) && obj(it.patch)) cleanTacticsParts(it.patch.offense, it.patch.defense, it.patch.manage, false);
  }
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
  // junk defenses, chase and hunt targets, instructions by player and the foul to give: a damaged
  // setting goes (an unknown scheme is man-to-man), in every team's tactics, the saved playbooks
  // and the game plans; a live journal's tactics are checked with the journal below (one out of
  // shape there drops the journal: its game starts over)
  for (const t of x.teams) {
    // tactics out of shape are rebuilt (see repairTactics), so one damaged team doesn't stop every game it's in
    if (!isTactics(t.tactics)) t.tactics = repairTactics(t.tactics);
    cleanTactics(t.tactics);
  }
  if (Array.isArray(x.playbooks)) for (const pb of x.playbooks) if (obj(pb)) cleanTacticsParts(pb.offense, pb.defense, pb.manage, true);
  cleanGamePlans(x);
  // AI trade offers: a damaged one, or one whose players or picks are gone, is dropped (the
  // inbox then says the offer is closed), and so is an untouchable mark on a player who is gone
  if (x.proposals !== undefined) x.proposals = Array.isArray(x.proposals) ? x.proposals.filter((p) => proposalIntact(x, p)) : [];
  if (x.untouchable !== undefined) x.untouchable = Array.isArray(x.untouchable) ? x.untouchable.filter((pid) => num(pid) && !!x.players[pid]) : [];
  for (const m of x.inbox) if (m.proposal !== undefined && !num(m.proposal)) delete m.proposal;
  // restricted free agency: damaged rights or offer sheets are dropped (see rfaIntact), and so is an
  // inbox message's link to an offer sheet that isn't a player id
  for (const p of Object.values(x.players)) if (p.rfa !== undefined) rfaIntact(x, p);
  for (const m of x.inbox) if (m.sheet !== undefined && !int(m.sheet)) delete m.sheet;
  // a live game's journal that's damaged, or not for today's game any more, goes (the game starts over)
  if (x.live !== undefined && !liveIntact(x, x.live)) delete x.live;
  // the latest live game's highlights: a damaged reel goes (its report then has none)
  if (x.reel !== undefined && !reelIntact(x.reel)) delete x.reel;
  migrateDealTerms(x);
  // game-time decisions in shape (whom they clear is checked again when the game is set up)
  if (x.gameTime !== undefined && !(obj(x.gameTime) && int(x.gameTime.gid) && nums(x.gameTime.play))) delete x.gameTime;
  // win-probability data of the user's games: a damaged list goes (the charts fall back as for older games)
  for (const g of x.games) {
    if (g.sets !== undefined && !setsIntact(g.sets)) delete g.sets;
    // keys to the game: a damaged list goes (the recap then has none)
    if (g.keys !== undefined && !keysIntact(g.keys)) delete g.keys;
    if (g.edge !== undefined && !num(g.edge)) delete g.edge;
    if (g.flowT !== undefined && !(nums(g.flowT) && g.flowT.length === g.flow?.length)) delete g.flowT;
    if (g.flowPoss !== undefined && !(Array.isArray(g.flowPoss) && g.flowPoss.length === g.flowPeriods?.length && g.flowPoss.every((s) => s === 0 || s === 1))) delete g.flowPoss;
  }
  migrateContracts(x);
  migrateRecords(x);
  x.version = SAVE_VERSION;
  return x;
}

/**
 * The record book and career highs: a damaged book is read again from the results the save still
 * has, as is a save's from before the book (see backfillRecords); damaged career highs go.
 */
function migrateRecords(x: League) {
  if (x.records !== undefined && !recordsIntact(x, x.records)) delete x.records;
  for (const p of Object.values(x.players))
    if (p.highs !== undefined && !(obj(p.highs) && Object.entries(p.highs).every(([k, h]) => (REC_STATS as readonly string[]).includes(k) && highIntact(h)))) delete p.highs;
  backfillRecords(x);
}

/** A career high: [value, season, day, opponent, game id], all whole numbers. */
const highIntact = (h: unknown) => Array.isArray(h) && h.length === 5 && h.every(int);

function recordsIntact(x: League, r: unknown): boolean {
  const tid = (v: unknown) => int(v) && !!x.teams[v];
  // a player's night: [value, pid, team, opponent, season, day, game id] and his name once he's gone; a team's: [value, team, opponent, season, day, game id, its points, theirs]
  const mark = (m: unknown) => Array.isArray(m) && (m.length === 7 || (m.length === 8 && str(m[7]))) && m.slice(0, 7).every(int) && tid(m[2]) && tid(m[3]);
  const teamMark = (m: unknown) => Array.isArray(m) && m.length === 8 && m.every(int) && tid(m[1]) && tid(m[2]);
  const list = (keys: readonly string[], o: unknown, ok: (m: unknown) => boolean) =>
    obj(o) && Object.entries(o).every(([k, l]) => keys.includes(k) && Array.isArray(l) && l.length <= 10 && l.every(ok));
  const shelf = (s: unknown) => obj(s) && list(REC_STATS, s.players, mark) && list(TEAM_REC_STATS, s.teams, teamMark);
  const both = (b: unknown) => obj(b) && shelf(b.reg) && shelf(b.post);
  return obj(r) && int(r.since) && both(r.league) && obj(r.teams) && Object.entries(r.teams).every(([tid, b]) => !!x.teams[Number(tid)] && both(b));
}

/** The latest live game's highlights, in shape for the court: possessions with their fives, steps and scores. */
function reelIntact(reel: unknown): boolean {
  if (!obj(reel) || !int(reel.gid) || !Array.isArray(reel.plays) || reel.plays.length > 12) return false;
  return reel.plays.every((p) => {
    if (!obj(p) || !obj(p.log) || !nums(p.before) || p.before.length !== 2) return false;
    const l = p.log;
    return (
      (l.off === 0 || l.off === 1) &&
      num(l.q) &&
      num(l.clockStart) &&
      num(l.clockEnd) &&
      typeof l.label === 'string' &&
      Array.isArray(l.steps) &&
      l.steps.every((st) => obj(st) && typeof st.k === 'string') &&
      Array.isArray(l.on) &&
      l.on.length === 2 &&
      l.on.every((five) => nums(five) && five.length === 5) &&
      obj(l.guards) &&
      nums(l.score) &&
      l.score.length === 2
    );
  });
}

/** A result's keys to the game, in shape: a title and goal to show, a target, and a value and verdict that agree. */
function keysIntact(keys: unknown): boolean {
  return (
    Array.isArray(keys) &&
    keys.length <= 5 &&
    keys.every(
      (k) =>
        obj(k) &&
        typeof k.id === 'string' &&
        typeof k.title === 'string' &&
        typeof k.goal === 'string' &&
        (k.dir === 'max' || k.dir === 'min') &&
        num(k.target) &&
        (k.value === null ? k.met === null : num(k.value) && typeof k.met === 'boolean'),
    )
  );
}

const TALK_KINDS = new Set(['fa', 'resign', 'extend']);
const TALK_PERIODS = new Set(['resign', 'fa', 'season']);
const OPTIONS = new Set(['player', 'team']);

/**
 * Contract talks, 10-day contracts, the stretch provision and the exceptions (all optional): a
 * damaged piece is dropped. Talks need a real team, season, kind and period, patience 0-5, a
 * counter with a positive salary for 1-5 years, and lost interest and a firm ask in range; a 10-day
 * contract is only kept on a rostered player in the regular season (without it, his one prorated
 * salary runs to the season's end like any deal); the 10-day count names a real team and one or two
 * contracts; a dead-money entry's stretch mark is `true` or gone; the seasons a team used cap space
 * or an exception are whole numbers; and an inbox message's 10-day link is a player id.
 */
function migrateContracts(x: League) {
  const teamOk = (v: unknown) => int(v) && !!x.teams[v];
  for (const p of Object.values(x.players)) {
    const t = p.talks as unknown;
    if (t !== undefined) {
      const c = obj(t) ? t.counter : undefined;
      const ok =
        obj(t) &&
        teamOk(t.tid) &&
        int(t.season) &&
        TALK_KINDS.has(t.kind as string) &&
        TALK_PERIODS.has(t.period as string) &&
        int(t.patience) &&
        t.patience >= 0 &&
        t.patience <= 5 &&
        (c === undefined ||
          (obj(c) && num(c.amount) && (c.amount as number) > 0 && int(c.years) && c.years >= 1 && c.years <= 5 && (c.option === undefined || OPTIONS.has(c.option as string)))) &&
        (t.lowballs === undefined || (int(t.lowballs) && t.lowballs >= 0)) &&
        (t.sour === undefined || (num(t.sour) && (t.sour as number) >= 0 && (t.sour as number) <= 0.1)) &&
        (t.closed === undefined || (obj(t.closed) && int(t.closed.season) && int(t.closed.day))) &&
        (t.firm === undefined || (num(t.firm) && (t.firm as number) >= 1 && (t.firm as number) <= 1.2));
      if (!ok) delete p.talks;
    }
    const n = p.tenDays as unknown;
    if (n !== undefined && !(obj(n) && teamOk(n.tid) && int(n.season) && int(n.n) && n.n >= 1 && n.n <= 2)) delete p.tenDays;
    const td = p.contract?.tenDay as unknown;
    if (td !== undefined && !(obj(td) && int(td.until) && (td.hardship === undefined || td.hardship === true) && p.tid >= 0 && x.phase === 'regular')) delete p.contract.tenDay;
    if (p.waivers && Array.isArray(p.waivers.dead)) for (const d of p.waivers.dead) if (obj(d) && d.stretched !== undefined && d.stretched !== true) delete d.stretched;
  }
  for (const t of x.teams) {
    for (const d of Array.isArray(t.deadMoney) ? t.deadMoney : []) if (obj(d) && d.stretched !== undefined && d.stretched !== true) delete d.stretched;
    for (const k of ['mleSeason', 'spaceSeason', 'roomSeason', 'baeSeason'] as const) if (t[k] !== undefined && !int(t[k])) delete t[k];
  }
  for (const m of x.inbox) if (m.tenDay !== undefined && !int(m.tenDay)) delete m.tenDay;
}

/** A result's set tallies in shape (see SetStat): a side, a known set or 'iso', runs and points, and the run it was read by. */
function setsIntact(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (s) =>
        obj(s) &&
        (s.t === 0 || s.t === 1) &&
        (s.id === 'iso' || KNOWN_SETS.has(s.id as string)) &&
        int(s.runs) &&
        (s.runs as number) > 0 &&
        int(s.pts) &&
        (s.pts as number) >= 0 &&
        (s.readAt === undefined || int(s.readAt)),
    )
  );
}

const PROMISES = new Set(['role', 'trade', 'patience']);

/**
 * Pick swaps, cash in trades and promises to players (all optional): a damaged one is dropped. A
 * swap must tie a first to another team's first of the same draft, neither protected, each pick in
 * one swap at most; cash records and logged cash are amounts of money; a promise or meeting has
 * its kind and dates.
 */
function migrateDealTerms(x: League) {
  const picks = new Map(x.draftPicks.filter(obj).map((d) => [d.dpid, d]));
  const swapOk = (d: League['draftPicks'][number]) => {
    const o = picks.get(d.swap as number);
    return int(d.swap) && !!o && o !== d && d.round === 1 && o.round === 1 && o.season === d.season && o.originalTid !== d.originalTid && !d.protection && !o.protection;
  };
  // one swap per pick, the first one kept: no pick both holds a right and is subject to one, or is in two
  const inOne = new Set<number>();
  for (const d of picks.values()) {
    if (d.swap === undefined) continue;
    if (!swapOk(d) || inOne.has(d.dpid) || inOne.has(d.swap)) delete d.swap;
    else inOne.add(d.dpid).add(d.swap);
  }
  const money = (v: unknown) => num(v) && (v as number) >= 0;
  for (const t of x.teams) {
    const c = t.cashTrades;
    if (c !== undefined && !(obj(c) && int(c.season) && money(c.sent) && money(c.received))) delete t.cashTrades;
    for (const s of t.seasons) if (obj(s) && s.cashIn !== undefined && !money(s.cashIn)) delete s.cashIn;
  }
  for (const p of Object.values(x.players)) {
    const pr = p.promise;
    if (
      pr !== undefined &&
      !(
        obj(pr) &&
        PROMISES.has(pr.kind as string) &&
        int(pr.tid) &&
        int(pr.season) &&
        int(pr.day) &&
        typeof pr.request === 'boolean' &&
        (pr.kind !== 'role' || (num(pr.minutes) && (pr.minutes as number) > 0)) &&
        (pr.kind !== 'trade' || pr.by === 'deadline' || pr.by === 'opening')
      )
    )
      delete p.promise;
    const m = p.meeting;
    if (m !== undefined && !(obj(m) && int(m.season) && int(m.day) && (m.broken === undefined || int(m.broken)))) delete p.meeting;
  }
  for (const t of Array.isArray(x.transactions) ? x.transactions : []) {
    for (const s of obj(t) && Array.isArray(t.sides) ? t.sides : []) {
      if (!obj(s)) continue;
      if (s.cash !== undefined && !money(s.cash)) delete s.cash;
      if (s.swaps !== undefined && !(Array.isArray(s.swaps) && s.swaps.every(int))) delete s.swaps;
    }
  }
}

const int = (v: unknown): v is number => Number.isInteger(v);
const nums = (v: unknown): v is number[] => Array.isArray(v) && v.every(num);
const numValues = (v: unknown) => obj(v) && Object.values(v).every(num);
/** More moves than any coach makes in a game: a journal with more was crafted. */
const MAX_LIVE_OPS = 5000;
const PLAY_CALLS = new Set(['three', 'two', 'hold', 'foul', 'iso', 'set']);

/** A journaled coaching move's arguments in shape. */
function liveArgs(op: unknown, a: Record<string, unknown>): boolean {
  switch (op) {
    case 'sub':
      return int(a.out) && int(a.in);
    case 'tactics':
      if (!isTactics(a.tactics) || (a.plan !== undefined && typeof a.plan !== 'boolean')) return false;
      cleanTactics(a.tactics);
      return true;
    case 'timeout':
      return a.reason === undefined || (str(a.reason) && (a.reason as string).length <= 80);
    case 'manualSubs':
      return typeof a.on === 'boolean';
    case 'call':
      return (
        obj(a.call) &&
        PLAY_CALLS.has(a.call.kind as string) &&
        (a.call.kind !== 'iso' || int(a.call.pid)) &&
        (a.call.kind !== 'set' || (KNOWN_SETS.has(a.call.set as string) && (a.call.pid === undefined || int(a.call.pid))))
      );
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
  if (j.seen !== undefined && !(nums(j.seen) && j.seen.length === 2)) return false;
  // "Keep changes" with a base out of shape is turned off (the saved tactics already hold what it kept): the game goes on
  if (j.keep !== undefined && !isTactics(j.keep)) delete j.keep;
  const o = j.opp;
  if (
    o !== undefined &&
    !(obj(o) && isTactics(o.tactics) && (o.plan === undefined || (obj(o.plan) && Array.isArray(o.plan.items) && o.plan.items.every((it) => obj(it) && obj(it.patch)))))
  )
    return false;
  if (!Array.isArray(j.ops) || j.ops.length > MAX_LIVE_OPS) return false;
  // a set call this version doesn't know is dropped (the replay then has to land on the journal's
  // score and clock without it, or the game starts over)
  j.ops = j.ops.filter((x) => !(obj(x) && x.op === 'call' && obj(x.args) && obj(x.args.call) && x.args.call.kind === 'set' && !KNOWN_SETS.has(x.args.call.set as string)));
  for (const t of [u.tactics, j.keep, obj(o) ? o.tactics : undefined]) cleanTactics(t);
  if (obj(o) && obj(o.plan) && Array.isArray(o.plan.items))
    for (const it of o.plan.items) if (obj(it) && obj(it.patch)) cleanTacticsParts(it.patch.offense, it.patch.defense, it.patch.manage, false);
  let at = 0;
  for (const o of j.ops as unknown[]) {
    if (!obj(o) || !int(o.at) || o.at < at || o.at > j.steps || !obj(o.args) || !liveArgs(o.op, o.args)) return false;
    at = o.at;
  }
  const g = l.schedule.find((x) => x.gid === j.gid);
  return j.tid === l.userTid && !!g && !g.played && g.day === l.day && (g.home === j.tid || g.away === j.tid);
}

const SHEET_ROUTES = new Set(['min', 'space', 'mle', 'room', 'bae']);

/**
 * A restricted free agent's rights in shape (see src/core/league/rfa.ts), or dropped: a qualifying
 * offer from a real team, for a positive amount, on that team's player in the re-sign period or on
 * a free agent in free agency; an offer sheet only in free agency, from another real team, 2-5
 * years at a positive salary, paid for by a known route, its match days in order. A damaged sheet
 * goes alone (his team keeps his rights); damaged rights take the sheet with them, and he is an
 * unrestricted free agent.
 */
function rfaIntact(l: League, p: Player) {
  const r = p.rfa as unknown;
  const ok =
    obj(r) &&
    int(r.tid) &&
    !!l.teams[r.tid] &&
    num(r.qo) &&
    (r.qo as number) > 0 &&
    (r.hold === undefined || (num(r.hold) && (r.hold as number) >= 0)) &&
    (l.phase === 'resign' ? p.tid === r.tid : l.phase === 'freeAgency' && p.tid === FREE_AGENT);
  if (!ok) {
    delete p.rfa;
    return;
  }
  const s = r.sheet;
  if (s === undefined) return;
  const sheetOk =
    obj(s) &&
    l.phase === 'freeAgency' &&
    int(s.tid) &&
    s.tid !== r.tid &&
    !!l.teams[s.tid] &&
    num(s.amount) &&
    (s.amount as number) > 0 &&
    int(s.years) &&
    s.years >= 2 &&
    s.years <= 5 &&
    SHEET_ROUTES.has(s.route as string) &&
    int(s.day) &&
    int(s.until) &&
    s.until >= s.day;
  if (!sheetOk) delete p.rfa!.sheet;
}

/**
 * A stored trade offer with both sides in shape, and every player and pick in it still in the
 * league. AI teams' offers never carry protections, swap rights or cash: one that does was crafted.
 */
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
      s.dpids.every((d) => num(d) && pick.has(d as number)) &&
      s.protect === undefined &&
      s.swaps === undefined &&
      s.cash === undefined,
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
