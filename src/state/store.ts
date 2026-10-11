import { create } from 'zustand';
import type { League } from '../core/types';
import { saveLeague, setLastLeagueId } from './persistence';
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

interface AppState {
  league: League | null;
  v: number;
  sim: SimProgress | null;
  stopRequested: boolean;
  toasts: Toast[];
  setLeague: (l: League | null) => void;
  /** Mutate the league in place and re-render. */
  mutate: (fn: (l: League) => void, save?: boolean) => void;
  save: () => Promise<void>;
  simulate: (target: SimTarget) => Promise<void>;
  /** Heavy one-shot league work (phase changes) behind the progress bar: buttons that watch `sim`
   * are disabled meanwhile and a second call is ignored. Resolves false if it didn't run. */
  task: (label: string, fn: (l: League) => void) => Promise<boolean>;
  stopSim: () => void;
  toast: (text: string, tone?: Toast['tone']) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

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

export const useStore = create<AppState>((set, get) => ({
  league: null,
  v: 0,
  sim: null,
  stopRequested: false,
  toasts: [],
  setLeague: (l) => {
    clearLive();
    set({ league: l, v: get().v + 1 });
    setLastLeagueId(l?.id ?? null);
  },
  mutate: (fn, save = true) => {
    const l = get().league;
    if (!l) return;
    fn(l);
    set({ v: get().v + 1 });
    if (save) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void get().save(), 800);
    }
  },
  save: async () => {
    const l = get().league;
    if (!l) return;
    try {
      await saveLeague(l);
    } catch (e) {
      console.error('save failed', e);
      get().toast('Could not save to device storage.', 'bad');
    }
  },
  simulate: async (target) => {
    const l = get().league;
    if (!l || get().sim) return;
    const startDay = l.day;
    const startPhase = l.phase;
    const total = estimateTotal(l, target);
    const bigNews = () => l.inbox.filter((m) => !m.read && m.important).length;
    const inboxBefore = bigNews();
    set({ sim: { label: 'Simulating', done: 0, total }, stopRequested: false });
    // a live game left mid-way finishes from its current score: re-simming it would record it twice
    const live = pendingLive(l);
    let days = 0;
    try {
      for (;;) {
        if (get().stopRequested) break;
        if (live && !live.committed) live.commit(l);
        else simDay(l);
        days++;
        // re-render league views weekly during long sims; the progress bar updates daily
        const refresh = days % 7 === 0 || total <= 7;
        set(refresh ? { sim: { label: 'Simulating', done: days, total: Math.max(total, days) }, v: get().v + 1 } : { sim: { label: 'Simulating', done: days, total: Math.max(total, days) } });
        if (targetDone(l, target, startDay, startPhase)) break;
        // smart stop: big news for your team during a long sim (routine injuries just land in the inbox)
        if (l.settings.stopOnNews !== false && days > 1 && target.kind !== 'days' && bigNews() > inboxBefore) {
          get().toast('Stopped: something needs your attention (see Inbox).', 'neutral');
          break;
        }
        if (days % 20 === 0) await get().save();
        await nextFrame();
      }
    } finally {
      set({ sim: null, stopRequested: false, v: get().v + 1 });
      await get().save();
    }
  },
  task: async (label, fn) => {
    if (!get().league || get().sim) return false;
    set({ sim: { label, done: 0, total: 1 } });
    // let the disabled buttons and the progress bar paint before the main thread is busy
    await new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));
    try {
      get().mutate(fn);
    } finally {
      set({ sim: null, v: get().v + 1 });
    }
    return true;
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
