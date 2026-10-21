import { useMemo, type DependencyList } from 'react';
import { create } from 'zustand';
import type { InboxMessage, League } from '../core/types';
import { adoptSync, isQuotaError, onDevice, SaveConflictError, saveLeague, setLastLeagueId } from './persistence';
import { checkpointLive, dropLive, liveInProgress, resumeLive } from './live';
import { estimateTotal, isFrontPage, loopSetting, targetDone, type SimProgress, type SimStop, type SimTarget, type TaskOp, type TaskResult } from './simCore';
import { checkpointSimRun, simLeague, stopSimRun, taskLeague } from './simClient';
import { buildDigest, digestMark, type Digest, type DigestMark } from '../ui/today/digest';
import { storyLink } from '../ui/today/front';
import { userGameOnDay } from '../core/league/games';
import { billingFor } from '../core/analysis/gameStory';

export type { SimProgress, SimTarget, TaskOp, TaskResult } from './simCore';
export { allStarStop, loopSetting, MONTH_DAYS, type LoopSettings } from './simCore';

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
  /** An in-app path the toast opens when tapped (a result's report). */
  link?: string;
}

export interface SaveProblem {
  /** 'conflict': another window saved this league after this one loaded it, so only a reload helps. */
  kind: 'quota' | 'conflict' | 'error';
  text: string;
  /** A conflict where the other window deleted the league, so a reload won't find it either. */
  deleted?: boolean;
}

interface AppState {
  league: League | null;
  v: number;
  sim: SimProgress | null;
  stopRequested: boolean;
  toasts: Toast[];
  /** The league has changes that aren't on the device yet. */
  dirty: boolean;
  /** Why the latest save failed; cleared by the next one that works. */
  saveProblem: SaveProblem | null;
  /**
   * "While you were away": what the latest sim of more than a day did (see ui/today/digest.ts),
   * until the next sim. `digestOpen`: it's up on screen (it opens by itself after the sim, unless
   * Settings turns that off, once any big moment has had the screen).
   */
  digest: Digest | null;
  digestOpen: boolean;
  /** A big moment has the screen (Moments.tsx): the digest waits for it. */
  momentUp: boolean;
  showDigest: (open: boolean) => void;
  setLeague: (l: League | null) => void;
  /**
   * Mutate the league in place and re-render. Refused (false) while a sim or a phase change runs:
   * the worker is playing on a copy of the league, which replaces this one when it's done.
   */
  mutate: (fn: (l: League) => void, save?: boolean) => boolean;
  /** Write the league to the device now. Resolves false (see saveProblem) if it didn't get there. */
  save: () => Promise<boolean>;
  /** Save only if something changed since the last save (during a sim, the worker is asked for where it has got to as well). */
  flush: () => Promise<boolean>;
  /**
   * Get the open league's changes onto the device before another league replaces it or the app
   * closes. Resolves false (see saveProblem) if they would be lost, so the caller can offer an
   * export first; a copy another window has saved over has nothing worth keeping.
   */
  saveBeforeLeaving: () => Promise<boolean>;
  /** Sim days in the worker up to `target`; the screens show the league as it stands meanwhile (every few seconds), and it is saved then. */
  simulate: (target: SimTarget) => Promise<void>;
  /** A phase change in the worker, behind the progress bar: buttons that watch `sim` are disabled
   * meanwhile and a second call is ignored. Resolves to its result, or null if it didn't run. */
  task: (label: string, op: TaskOp) => Promise<TaskResult | null>;
  /**
   * `mutate` for league work that mustn't be left half-done and runs outside the progress bar (the
   * Live screen setting up today's game and recording it): if `fn` throws, the league goes back to
   * how it was before it and a toast says `label` hit an error. Returns whether it worked.
   */
  attempt: (label: string, fn: (l: League) => void) => boolean;
  stopSim: () => void;
  toast: (text: string, tone?: Toast['tone'], link?: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every change: a save that started before the latest one leaves the league dirty. */
let changes = 0;
let saving: Promise<boolean> | null = null;
let queued: Promise<boolean> | null = null;
let toastId = 1;

/** A sim that stopped for big news says which, and opens it: the newest important unread mail. */
function newsStop(l: League): [string, Toast['tone'], string] {
  const news = l.inbox.filter((m) => !m.read && m.important).reduce<InboxMessage | null>((a, m) => (!a || m.id > a.id ? m : a), null);
  return [
    news ? `Stopped for news: ${news.subject}` : 'Stopped for news in your inbox.',
    news?.tone === 'bad' || news?.tone === 'alert' ? 'bad' : 'neutral',
    news?.link ?? '/inbox',
  ];
}

/** What a sim that stopped short says, and opens: big news, a front-page story, or a big night ahead. */
function stopToast(l: League, stop: SimStop, newsFrom: number): [string, Toast['tone'], string] | undefined {
  if (stop === 'news') return newsStop(l);
  if (stop === 'frontPage') {
    const n = [...l.news].reverse().find((x) => x.id >= newsFrom && isFrontPage(l, x));
    return [n ? `Front page: ${n.head ?? n.text}` : 'Stopped for a story about your team.', 'neutral', n ? storyLink(n.id) : '/league/news'];
  }
  if (stop === 'bigGame') {
    const g = userGameOnDay(l, l.day);
    const b = g && billingFor(l, g);
    const opp = g && l.teams[g.home === l.userTid ? g.away : g.home];
    return [b && opp ? `Stopped for tonight: ${b.tag} ${g.home === l.userTid ? 'vs' : 'at'} ${opp.name}` : 'Stopped for a big night.', 'neutral', opp ? `/games/${opp.tid}` : '/'];
  }
  return undefined;
}

/** The latest digest is kept on this device, so it's still there after the app is closed and opened again. */
const DIGEST_KEY = 'hc:digest';

function keepDigest(d: Digest | null) {
  try {
    if (d) localStorage.setItem(DIGEST_KEY, JSON.stringify(d));
    else localStorage.removeItem(DIGEST_KEY);
  } catch {
    /* (private mode, storage full: it lasts until the app closes) */
  }
}

function keptDigest(leagueId: string): Digest | null {
  try {
    const d = JSON.parse(localStorage.getItem(DIGEST_KEY) ?? 'null') as Digest | null;
    return d?.leagueId === leagueId ? d : null;
  } catch {
    return null;
  }
}

/** The long offseason steps, which get a digest too. */
const longTask = (op: TaskOp) => (op.kind === 'faAdvance' && op.days >= 7) || op.kind === 'newSeason';
const TASK_SPAN: Partial<Record<TaskOp['kind'], string>> = { faAdvance: 'A week of free agency', newSeason: 'Training camp' };

export function problemOf(e: unknown): SaveProblem {
  if (e instanceof SaveConflictError) return { kind: 'conflict', text: e.message, deleted: e.deleted };
  if (isQuotaError(e)) return { kind: 'quota', text: 'Device storage is full. Free up some space, or export a backup.' };
  return { kind: 'error', text: `Could not save to device storage${e instanceof Error && e.message ? ` (${e.message})` : ''}.` };
}

/** Put a league object back to an earlier copy of itself, keeping its identity (and save tracking). */
function restore(l: League, copy: League) {
  for (const k of Object.keys(l) as (keyof League)[]) if (!(k in copy)) delete (l as Partial<League>)[k];
  Object.assign(l, copy);
}

/**
 * A copy of the league to put back if a change throws halfway, without cloning a season of results:
 * those are only ever added to, apart from an older game of the user's dropping its play-by-play,
 * so the list and those play-by-plays are kept as they are.
 */
function rollbackPoint(l: League): () => void {
  const games = l.games.slice();
  const pbp = games.filter((g) => g.pbp).map((g) => [g, g.pbp] as const);
  const copy = structuredClone({ ...l, games: [] });
  return () => {
    restore(l, { ...copy, games });
    for (const [g, lines] of pbp) g.pbp = lines;
  };
}

const failed = (label: string) => `${label} hit an error, so nothing changed. If it keeps happening, export a backup and report it.`;

/** One write of `l`, recorded in the store while it's still the open league. */
async function write(l: League): Promise<boolean> {
  if (useStore.getState().saveProblem?.kind === 'conflict') return false;
  const at = changes;
  try {
    await saveLeague(l);
    if (useStore.getState().league === l) useStore.setState({ dirty: changes !== at, saveProblem: null });
    return true;
  } catch (e) {
    console.error('save failed', e);
    if (useStore.getState().league === l) useStore.setState({ saveProblem: problemOf(e) });
    return false;
  }
}

/**
 * Another window has saved over this copy of the league: a sim or a phase change here could never be
 * saved, so it isn't started (the save banner offers the reload that picks the other one up).
 */
function stale(): boolean {
  const problem = useStore.getState().saveProblem;
  if (problem?.kind !== 'conflict') return false;
  useStore
    .getState()
    .toast(
      problem.deleted
        ? 'This league was deleted in another window. Export a backup to keep this copy.'
        : 'This league was changed in another window. Reload to pick it up, then sim.',
      'bad',
    );
  return true;
}

/** Bumped by every run in the worker and by opening another league: a run whose token is stale has nothing to hand back. */
let runToken = 0;

/** The league a run in the worker became takes the open one's place (what's on the device carries over). */
function replaceLeague(from: League, to: League) {
  adoptSync(from, to);
  changes++;
  useStore.setState({ league: to, v: useStore.getState().v + 1, dirty: true });
}

export const useStore = create<AppState>((set, get) => ({
  league: null,
  v: 0,
  sim: null,
  stopRequested: false,
  toasts: [],
  dirty: false,
  saveProblem: null,
  digest: null,
  digestOpen: false,
  momentUp: false,
  showDigest: (open) => set({ digestOpen: open && !!get().digest }),
  setLeague: (l) => {
    const old = get().league;
    // another league opened over this one (Back to the main menu, then another save): keep its
    // unsaved changes. A reload of the same league is a way back from them, so it skips this.
    // (callers that can wait use saveBeforeLeaving first, and offer an export when it fails)
    if (old && l && old.id !== l.id && get().dirty && get().saveProblem?.kind !== 'conflict')
      void (saving ?? Promise.resolve())
        .then(() => saveLeague(old))
        .catch((e) => {
          console.error('save failed', e);
          // a copy another window has saved over was stale anyway
          if (!(e instanceof SaveConflictError)) get().toast(`Your latest changes to "${old.name}" could not be saved${isQuotaError(e) ? ': device storage is full' : ''}.`, 'bad');
        });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    // (a live game in progress stays journaled in the league it was in, to pick up when it's opened again)
    dropLive();
    // a sim still running on the old league stops, and has nothing to hand back
    if (get().sim) stopSimRun();
    runToken++;
    // a league that was never saved (just created) counts as a change until its first save works
    // (the digest kept on the device is this league's, or none)
    const digest = l ? (get().digest?.leagueId === l.id ? get().digest : keptDigest(l.id)) : null;
    set({ league: l, v: get().v + 1, sim: null, stopRequested: false, dirty: !!l && !onDevice(l), saveProblem: null, digest, digestOpen: false });
    setLastLeagueId(l?.id ?? null);
  },
  mutate: (fn, save = true) => {
    const l = get().league;
    if (!l || get().sim) return false;
    fn(l);
    changes++;
    set({ v: get().v + 1, dirty: true });
    if (save) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void get().save(), 800);
    }
    return true;
  },
  save: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    // one write at a time; calls made during it share one follow-up write of the newest state
    if (saving) {
      queued ??= saving.then(() => {
        queued = null;
        return get().flush();
      });
      return queued;
    }
    const l = get().league;
    if (!l) return Promise.resolve(true);
    return (saving = write(l).finally(() => (saving = null)));
  },
  flush: () => {
    // a sim in the worker is further on than the league on screen: it sends where it has got to,
    // which is saved when it arrives
    if (get().sim) checkpointSimRun();
    const l = get().league;
    // a live game plays on without a save every possession: where it has got to is a change now
    if (l && checkpointLive(l)) {
      changes++;
      set({ dirty: true });
    }
    return get().dirty ? get().save() : Promise.resolve(true);
  },
  saveBeforeLeaving: async () => (await get().flush()) || get().saveProblem?.kind === 'conflict',
  simulate: async (target) => {
    const l = get().league;
    if (!l || get().sim || stale()) return;
    const token = ++runToken;
    // where the league stands, for the digest once it's done (a new sim retires the last one)
    const mark = digestMark(l);
    set({ sim: { label: 'Simulating', done: 0, total: estimateTotal(l, target) }, stopRequested: false, digest: null, digestOpen: false });
    // what the sim starts from is on the device first
    await get().flush();
    if (runToken !== token) return;
    const done = (toast?: [string, Toast['tone'], string?]) => {
      if (runToken !== token) return;
      set({ sim: null, stopRequested: false, v: get().v + 1, ...digestFor(mark) });
      if (toast) get().toast(...toast);
      void get().save();
    };
    // a live game left mid-way finishes from its current score here first (picked up from its journal
    // if the app was closed since): re-simming it would record it twice. It plays out the day.
    const startDay = l.day;
    const startPhase = l.phase;
    const journaled = liveInProgress(l);
    const live = resumeLive(l);
    if (journaled && !live) get().toast("Your game in progress couldn't be picked up where you left off, so it was played from tip-off.", 'bad');
    if (live && !live.committed) {
      const undo = rollbackPoint(l);
      try {
        live.commit(l);
        changes++;
        set({ dirty: true });
      } catch (e) {
        console.error('finishing the live game failed', e);
        undo();
        done([failed('Finishing the game'), 'bad']);
        return;
      }
      if (targetDone(l, target, startDay, startPhase) || get().stopRequested) return done();
    }
    // the screens keep this league while the worker plays on a copy; checkpoints and the end replace it
    let shown = l;
    try {
      const out = await simLeague(l, target, {
        progress: (p) => void (runToken === token && set({ sim: p })),
        checkpoint: async (x) => {
          if (runToken !== token) return;
          replaceLeague(shown, x);
          shown = x;
          await get().save();
        },
      });
      if (runToken !== token) return;
      replaceLeague(shown, out.league);
      done(stopToast(out.league, out.stop, mark.msgId));
    } catch (e) {
      console.error('sim failed', e);
      // the league on screen is the last good one: before the sim, or its latest checkpoint
      done([`The simulation hit an error, so it stopped at ${shown === l ? 'where it started' : 'its last save'}. If it keeps happening, export a backup and report it.`, 'bad']);
    }
  },
  task: async (label, op) => {
    const l = get().league;
    if (!l || get().sim || stale()) return null;
    const token = ++runToken;
    const mark = longTask(op) ? digestMark(l) : null;
    set({ sim: { label, done: 0, total: 1 }, ...(mark ? { digest: null, digestOpen: false } : {}) });
    await get().flush();
    if (runToken !== token) return null;
    try {
      const out = await taskLeague(l, op);
      if (runToken !== token) return null;
      replaceLeague(l, out.league);
      if (mark) set(digestFor(mark, { long: true, span: TASK_SPAN[op.kind] }));
      return out.result;
    } catch (e) {
      console.error(`${label} failed`, e);
      if (runToken === token) get().toast(failed(label), 'bad');
      return null;
    } finally {
      if (runToken === token) {
        set({ sim: null, v: get().v + 1 });
        void get().save();
      }
    }
  },
  attempt: (label, fn) => {
    const l = get().league;
    if (!l) return false;
    const undo = rollbackPoint(l);
    try {
      return get().mutate(fn);
    } catch (e) {
      console.error(`${label} failed`, e);
      undo();
      set({ v: get().v + 1 });
      get().toast(failed(label), 'bad');
      return false;
    }
  },
  stopSim: () => {
    set({ stopRequested: true });
    stopSimRun();
  },
  toast: (text, tone = 'neutral', link) => {
    const t = { id: toastId++, text, tone, ...(link ? { link } : {}) };
    set({ toasts: [...get().toasts, t] });
    // one with somewhere to go stays up long enough to tap
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), link ? 5000 : 3200);
  },
}));

/**
 * The digest of a sim that started at `mark`, built once from the league it ended on, and whether
 * it opens by itself (Settings → While you were away). A short sim has none.
 */
function digestFor(mark: DigestMark, opts?: { long?: boolean; span?: string }): Pick<AppState, 'digest' | 'digestOpen'> {
  const l = useStore.getState().league;
  let digest: Digest | null = null;
  try {
    digest = l ? buildDigest(mark, l, opts) : null;
  } catch (e) {
    // (a digest that can't be read is no reason to lose the sim)
    console.error('the digest failed', e);
  }
  keepDigest(digest);
  return { digest, digestOpen: !!digest && !!l && loopSetting(l, 'digest') };
}

/** Subscribe to league changes; returns the league (asserted non-null inside the game shell). */
export function useLeague(): League {
  const league = useStore((s) => s.league);
  useStore((s) => s.v);
  return league as League;
}

export function useVersion(): number {
  return useStore((s) => s.v);
}

/**
 * useMemo for values read from the league. The league mutates in place, so the value is also
 * recomputed on every league change; list the other inputs as usual (the lint rule checks them).
 */
export function useLeagueMemo<T>(compute: () => T, deps: DependencyList): T {
  const v = useVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's deps, checked at each call site (additionalHooks), plus the version
  return useMemo(compute, [v, ...deps]);
}
