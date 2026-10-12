import { useMemo, type DependencyList } from 'react';
import { create } from 'zustand';
import type { League } from '../core/types';
import { isQuotaError, loadLeague, onDevice, SaveConflictError, saveLeague, setLastLeagueId } from './persistence';
import { clearLive, pendingLive } from './live';
import { simDay, regularGamesLeft } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { schedulePlayoffDay } from '../core/league/playoffs';

export type SimTarget =
  | { kind: 'days'; n: number }
  | { kind: 'untilUserGame' }
  | { kind: 'week' }
  | { kind: 'allStar' }
  | { kind: 'deadline' }
  | { kind: 'endRegular' }
  | { kind: 'endPostseason' }
  /** Through the play-in and the playoffs in one go (for teams that are out). */
  | { kind: 'endPlayoffs' };

export interface SimProgress {
  label: string;
  done: number;
  total: number;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
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
  setLeague: (l: League | null) => void;
  /** Mutate the league in place and re-render. */
  mutate: (fn: (l: League) => void, save?: boolean) => void;
  /** Write the league to the device now. Resolves false (see saveProblem) if it didn't get there. */
  save: () => Promise<boolean>;
  /** Save only if something changed since the last save. */
  flush: () => Promise<boolean>;
  /**
   * Get the open league's changes onto the device before another league replaces it or the app
   * closes. Resolves false (see saveProblem) if they would be lost, so the caller can offer an
   * export first; a copy another window has saved over has nothing worth keeping.
   */
  saveBeforeLeaving: () => Promise<boolean>;
  simulate: (target: SimTarget) => Promise<void>;
  /** Heavy one-shot league work (phase changes) behind the progress bar: buttons that watch `sim`
   * are disabled meanwhile and a second call is ignored. Resolves false if it didn't run. */
  task: (label: string, fn: (l: League) => void) => Promise<boolean>;
  stopSim: () => void;
  toast: (text: string, tone?: Toast['tone']) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every change: a save that started before the latest one leaves the league dirty. */
let changes = 0;
let saving: Promise<boolean> | null = null;
let queued: Promise<boolean> | null = null;
let toastId = 1;

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export function problemOf(e: unknown): SaveProblem {
  if (e instanceof SaveConflictError) return { kind: 'conflict', text: e.message, deleted: e.deleted };
  if (isQuotaError(e)) return { kind: 'quota', text: 'Device storage is full. Free up some space, or export a backup.' };
  return { kind: 'error', text: `Could not save to device storage${e instanceof Error && e.message ? ` (${e.message})` : ''}.` };
}

/** Day "Sim to All-Star break" lands on: the day before the All-Star Game, so the user can act first. */
export function allStarStop(l: League) {
  return l.allStarDay - 1;
}

function targetDone(l: League, target: SimTarget, startDay: number, startPhase: string): boolean {
  if (target.kind === 'endPlayoffs') return l.phase !== 'playin' && l.phase !== 'playoffs';
  if (l.phase !== startPhase) return true;
  if (!(l.phase === 'regular' || l.phase === 'playin' || l.phase === 'playoffs')) return true;
  switch (target.kind) {
    case 'days':
      return l.day - startDay >= target.n;
    case 'week':
      return l.day - startDay >= 7;
    case 'untilUserGame':
      if (l.day === startDay) return false;
      if (l.phase === 'playoffs') schedulePlayoffDay(l);
      return !!userGameOnDay(l, l.day);
    case 'allStar':
      // stop the day before the All-Star Game (played at the end of allStarDay), mid-break
      return l.phase !== 'regular' || l.day >= allStarStop(l);
    case 'deadline':
      // deadline day itself is the last day trades are allowed
      return l.phase !== 'regular' || l.day >= l.tradeDeadlineDay;
    case 'endRegular':
      return l.phase !== 'regular' || regularGamesLeft(l) === 0;
    case 'endPostseason':
      return false;
  }
}

function estimateTotal(l: League, target: SimTarget): number {
  switch (target.kind) {
    case 'days':
      return target.n;
    case 'week':
      return 7;
    case 'untilUserGame':
      return 3;
    case 'allStar':
      return Math.max(1, allStarStop(l) - l.day);
    case 'deadline':
      return Math.max(1, l.tradeDeadlineDay - l.day);
    case 'endRegular':
      return Math.max(1, l.regularSeasonDays - l.day + 1);
    case 'endPostseason':
    case 'endPlayoffs':
      return 60;
  }
}

/** Put a league object back to an earlier copy of itself, keeping its identity (and save tracking). */
function restore(l: League, copy: League) {
  for (const k of Object.keys(l) as (keyof League)[]) if (!(k in copy)) delete (l as Partial<League>)[k];
  Object.assign(l, copy);
}

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

/** After a sim threw halfway: go back to the last save rather than keep a half-played day. */
async function reloadLastSave(l: League) {
  let last: League | undefined;
  try {
    last = await loadLeague(l.id);
  } catch (e) {
    console.error(e);
  }
  const st = useStore.getState();
  st.setLeague(last ?? null);
  st.toast(last ? 'The simulation hit an error, so your league went back to its last save.' : 'The simulation hit an error. Open your league again from the main menu.', 'bad');
}

export const useStore = create<AppState>((set, get) => ({
  league: null,
  v: 0,
  sim: null,
  stopRequested: false,
  toasts: [],
  dirty: false,
  saveProblem: null,
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
    clearLive();
    // a sim still running on the old league sees the swap and stops
    // a league that was never saved (just created) counts as a change until its first save works
    set({ league: l, v: get().v + 1, sim: null, stopRequested: false, dirty: !!l && !onDevice(l), saveProblem: null });
    setLastLeagueId(l?.id ?? null);
  },
  mutate: (fn, save = true) => {
    const l = get().league;
    if (!l) return;
    fn(l);
    changes++;
    set({ v: get().v + 1, dirty: true });
    if (save) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void get().save(), 800);
    }
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
  flush: () => (get().dirty ? get().save() : Promise.resolve(true)),
  saveBeforeLeaving: async () => (await get().flush()) || get().saveProblem?.kind === 'conflict',
  simulate: async (target) => {
    const l = get().league;
    if (!l || get().sim) return;
    const startDay = l.day;
    const startPhase = l.phase;
    const total = estimateTotal(l, target);
    const bigNews = () => l.inbox.filter((m) => !m.read && m.important).length;
    const inboxBefore = bigNews();
    set({ sim: { label: 'Simulating', done: 0, total }, stopRequested: false });
    // a sim that throws falls back to the last save: make that the state it starts from
    await get().flush();
    // a live game left mid-way finishes from its current score: re-simming it would record it twice
    const live = pendingLive(l);
    let days = 0;
    try {
      for (;;) {
        if (get().stopRequested || get().league !== l) break;
        if (live && !live.committed) live.commit(l);
        else simDay(l);
        days++;
        changes++;
        // re-render league views weekly during long sims; the progress bar updates daily
        const sim = { label: 'Simulating', done: days, total: Math.max(total, days) };
        set(days % 7 === 0 || total <= 7 ? { sim, dirty: true, v: get().v + 1 } : { sim, dirty: true });
        if (targetDone(l, target, startDay, startPhase)) break;
        // smart stop: big news for your team during a long sim (routine injuries just land in the inbox)
        if (l.settings.stopOnNews !== false && days > 1 && target.kind !== 'days' && bigNews() > inboxBefore) {
          get().toast('Stopped: something needs your attention (see Inbox).', 'neutral');
          break;
        }
        if (days % 20 === 0) await get().save();
        await nextFrame();
      }
    } catch (e) {
      console.error('sim failed', e);
      if (get().league === l) await reloadLastSave(l);
      return;
    }
    // the league was swapped out mid-sim: leave both alone
    if (get().league !== l) return;
    set({ sim: null, stopRequested: false, v: get().v + 1 });
    await get().save();
  },
  task: async (label, fn) => {
    const l = get().league;
    if (!l || get().sim) return false;
    set({ sim: { label, done: 0, total: 1 } });
    // let the disabled buttons and the progress bar paint before the main thread is busy
    await new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));
    if (get().league !== l) return false;
    // phase changes touch most of the league: keep a copy to put back if one throws halfway
    const before = structuredClone(l);
    try {
      get().mutate(fn);
      return true;
    } catch (e) {
      console.error(`${label} failed`, e);
      restore(l, before);
      get().toast(`${label} hit an error, so nothing changed. If it keeps happening, export a backup and report it.`, 'bad');
      return false;
    } finally {
      if (get().league === l) set({ sim: null, v: get().v + 1 });
    }
  },
  stopSim: () => set({ stopRequested: true }),
  toast: (text, tone = 'neutral') => {
    const t = { id: toastId++, text, tone };
    set({ toasts: [...get().toasts, t] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 3200);
  },
}));

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
