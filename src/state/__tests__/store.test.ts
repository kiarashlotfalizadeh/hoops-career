// The store's save bookkeeping and how it recovers from a sim or phase change that throws halfway;
// the sim worker's results across the thread boundary, and its client when the worker can't start.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { problemOf, useStore } from '../store';
import { loadLeague, SaveConflictError } from '../persistence';
import { applyGames, diffGames, gamesSig, runSim, runTask, withoutGames, type GamesDelta } from '../simCore';
import { cancelWorth, measureCounters, simLeague, simLocally, taskLeague } from '../simClient';
import { newSeason, simDay } from '../../core/league/season';
import { testLeague } from './fixtures';

vi.mock('../../core/league/season', async (load) => {
  const m = await load<typeof import('../../core/league/season')>();
  return { ...m, simDay: vi.fn(m.simDay), newSeason: vi.fn(m.newSeason) };
});

vi.mock('../persistence', async (load) => {
  const m = await load<typeof import('../persistence')>();
  return { ...m, loadLeague: vi.fn(m.loadLeague), saveLeague: vi.fn(m.saveLeague) };
});

const put = IDBObjectStore.prototype.put;
const st = () => useStore.getState();

/** Count league-record writes until restored. */
function countSaves() {
  const n = { saves: 0 };
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
    if (this.name === 'leagues') n.saves++;
    return put.apply(this, args);
  });
  return n;
}

const failPuts = (e: Error) =>
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw e;
  });

const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/** A Worker whose script never loads: it reports an error and never answers. */
class DeadWorker extends EventTarget {
  static made = 0;
  constructor() {
    super();
    DeadWorker.made++;
    setTimeout(() => this.dispatchEvent(new Event('error')), 5);
  }
  postMessage() {}
  terminate() {}
}

/**
 * The real sim worker, run in this thread: messages to it and back are copied and arrive a task
 * later, as between threads. Its module listens on the global scope (stubbed for the scenario).
 */
class ThreadWorker extends EventTarget {
  static inbox: ((e: MessageEvent) => void) | null = null;
  static current: ThreadWorker | null = null;
  /** What the main thread sent it (Comlink's messages). */
  static sent: { path?: string[]; argumentList?: { value?: unknown }[] }[] = [];
  constructor() {
    super();
    ThreadWorker.current = this;
  }
  postMessage(data: unknown, transfer: Transferable[] = []) {
    const copy = structuredClone(data, { transfer });
    ThreadWorker.sent.push(copy as (typeof ThreadWorker.sent)[number]);
    setTimeout(() => ThreadWorker.inbox?.(new MessageEvent('message', { data: copy })), 0);
  }
  terminate() {}
  static async start() {
    vi.stubGlobal('Worker', ThreadWorker);
    vi.stubGlobal('addEventListener', (type: string, fn: (e: MessageEvent) => void) => type === 'message' && (ThreadWorker.inbox = fn));
    vi.stubGlobal('removeEventListener', () => {});
    vi.stubGlobal('postMessage', (data: unknown, transfer: Transferable[] = []) => {
      const copy = structuredClone(data, { transfer });
      setTimeout(() => ThreadWorker.current?.dispatchEvent(new MessageEvent('message', { data: copy })), 0);
    });
    await import('../../workers/sim.worker');
    simLocally(false);
  }
}

// (a reply the in-thread worker sends after its scenario ended, as on a loaded machine, lands here
// rather than on an unstubbed global: unstubAllGlobals restores this, not undefined)
(globalThis as { postMessage?: unknown }).postMessage ??= () => {};

/** Each scenario starts with no league open and nothing mocked but console.error (the failures below are on purpose). */
function fresh() {
  // (messages still on their way to or from the in-thread worker are dropped)
  ThreadWorker.inbox = null;
  ThreadWorker.current = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  simLocally(true);
  st().setLeague(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(fresh);

describe('the store', () => {
  it('saves one at a time and says when it cannot, sims on a copy, recovers from a sim that throws, and falls back to this thread', { timeout: 180_000 }, async () => {
    fresh();

    // reports a failed save, keeps the league dirty, and clears both once a save works
    {
      const l = testLeague('quota');
      st().setLeague(l);
      st().mutate((x) => (x.name = 'renamed'));
      failPuts(quotaError());
      expect(await st().save()).toBe(false);
      expect(st().saveProblem?.kind).toBe('quota');
      expect(st().dirty).toBe(true);
      vi.mocked(IDBObjectStore.prototype.put).mockRestore();
      expect(await st().save()).toBe(true);
      expect(st()).toMatchObject({ saveProblem: null, dirty: false });
      expect((await loadLeague(l.id))!.name).toBe('renamed');
      expect(problemOf(new Error('disk on fire'))).toEqual({ kind: 'error', text: 'Could not save to device storage (disk on fire).' });
      fresh();
    }

    // runs one save at a time and skips saving when nothing changed
    {
      st().setLeague(testLeague('in flight'));
      const n = countSaves();
      const first = st().save();
      st().mutate((x) => (x.name = 'changed during the save'));
      const [a, b, c] = await Promise.all([first, st().save(), st().save()]);
      expect([a, b, c]).toEqual([true, true, true]);
      expect(n.saves).toBe(2);
      expect(st().dirty).toBe(false);
      await st().flush();
      expect(n.saves).toBe(2);
      fresh();
    }

    // a new league counts as unsaved until its first save works
    {
      const l = testLeague('new');
      st().setLeague(l);
      expect(st().dirty).toBe(true);
      failPuts(quotaError());
      expect(await st().save()).toBe(false);
      expect(st()).toMatchObject({ dirty: true, saveProblem: { kind: 'quota' } });
      vi.mocked(IDBObjectStore.prototype.put).mockRestore();
      // hiding the app flushes it
      expect(await st().flush()).toBe(true);
      expect(st().dirty).toBe(false);
      expect((await loadLeague(l.id))!.day).toBe(l.day);
      st().setLeague((await loadLeague(l.id))!);
      expect(st().dirty).toBe(false);
      fresh();
    }

    // opening another league keeps the unsaved changes of the one it replaces
    {
      const a = testLeague('replaced');
      st().setLeague(a);
      await st().save();
      st().mutate((x) => (x.name = 'renamed'), false);
      st().setLeague(testLeague('opened'));
      // the replaced league saves in the background: a full league's write can take a while on a busy machine
      await vi.waitFor(async () => expect((await loadLeague(a.id))!.name).toBe('renamed'), { timeout: 10_000 });
      fresh();
    }

    // says so when the league another one replaces could not be saved
    {
      const a = testLeague('full');
      st().setLeague(a);
      await st().save();
      st().mutate((x) => (x.name = 'renamed'), false);
      failPuts(quotaError());
      st().setLeague(testLeague('next'));
      await vi.waitFor(() => expect(st().toasts.at(-1)?.text).toBe('Your latest changes to "renamed" could not be saved: device storage is full.'), { timeout: 10_000 });
      fresh();
    }

    // saves the open league before leaving it, and says when it could not
    {
      st().setLeague(testLeague('leaving'));
      expect(await st().saveBeforeLeaving()).toBe(true);
      st().mutate((x) => (x.name = 'changed'), false);
      failPuts(quotaError());
      expect(await st().saveBeforeLeaving()).toBe(false);
      expect(st().saveProblem?.kind).toBe('quota');
      // a copy another window has saved over has nothing worth keeping
      useStore.setState({ saveProblem: problemOf(new SaveConflictError()) });
      expect(await st().saveBeforeLeaving()).toBe(true);
      fresh();
    }

    // stops saving a copy another window has saved over
    {
      st().setLeague(testLeague('stale'));
      useStore.setState({ saveProblem: problemOf(new SaveConflictError()) });
      const n = countSaves();
      expect(await st().save()).toBe(false);
      expect(n.saves).toBe(0);
      fresh();
    }

    // simming hands back a new league and leaves the one it started from as it was
    {
      const l = testLeague('sim');
      st().setLeague(l);
      const day = l.day;
      const before = structuredClone(l);
      await st().simulate({ kind: 'days', n: 2 });
      const now = st().league!;
      expect(now).not.toBe(l);
      expect(now.day).toBe(day + 2);
      expect(l).toEqual(before);
      expect(st().sim).toBeNull();
      fresh();
    }

    // refuses changes while a sim runs: the sim is playing on a copy that will replace them
    {
      const l = testLeague('busy');
      st().setLeague(l);
      const running = st().simulate({ kind: 'days', n: 2 });
      expect(st().mutate((x) => void (x.name = 'edited'))).toBe(false);
      await running;
      expect(st().league!.name).not.toBe('edited');
      expect(st().mutate((x) => void (x.name = 'edited'))).toBe(true);
      expect(st().league!.name).toBe('edited');
      fresh();
    }

    // a sim that throws leaves the league where it started, with nothing of the half-played day
    {
      const l = testLeague('sim error');
      st().setLeague(l);
      await st().save();
      const day = l.day;
      vi.mocked(simDay).mockImplementationOnce((x) => {
        x.day += 3;
        throw new Error('boom');
      });
      await st().simulate({ kind: 'week' });
      expect(st().league).toBe(l);
      expect(l.day).toBe(day);
      expect(st().sim).toBeNull();
      expect(st().toasts.at(-1)?.text).toMatch(/hit an error/);
      fresh();
    }

    // a sim that throws after a checkpoint keeps the league as of that checkpoint, saved
    {
      const l = testLeague('sim error later');
      st().setLeague(l);
      const day = l.day;
      const sim = vi.mocked(simDay).getMockImplementation()!;
      let n = 0;
      vi.mocked(simDay).mockImplementation((x, o) => {
        if (++n === 25) throw new Error('boom');
        sim(x, o);
      });
      try {
        await st().simulate({ kind: 'endRegular' });
      } finally {
        vi.mocked(simDay).mockImplementation(sim);
      }
      const now = st().league!;
      expect(now.day).toBe(day + 20);
      expect(st().toasts.at(-1)?.text).toMatch(/last save/);
      expect((await loadLeague(l.id))!.day).toBe(day + 20);
      fresh();
    }

    // a phase change that throws leaves the league as it was
    {
      const l = testLeague('task error');
      st().setLeague(l);
      const before = structuredClone(l);
      vi.mocked(newSeason).mockImplementationOnce((x) => {
        x.season += 1;
        x.players = {};
        throw new Error('boom');
      });
      const ran = await st().task('Training camp', { kind: 'newSeason' });
      expect(ran).toBeNull();
      expect(st().league).toBe(l);
      expect(l).toEqual(before);
      expect(st().sim).toBeNull();
      expect(st().toasts.at(-1)?.text).toMatch(/nothing changed/);
      fresh();
    }

    // opening another league stops a sim running on the old one, which hands nothing back
    {
      const l = testLeague('swap');
      st().setLeague(l);
      const running = st().simulate({ kind: 'week' });
      const other = testLeague('other');
      st().setLeague(other);
      await running;
      expect(st()).toMatchObject({ league: other, sim: null });
      fresh();
    }

    // results across the thread boundary: only the games added since are sent, and the same list is rebuilt from them
    {
      const l = testLeague('delta');
      await runSim(l, { kind: 'days', n: 3 });
      const sent = gamesSig(l.games);
      // (a sim adds to the same list: keep a copy of it as it was)
      const before = l.games.slice();
      await runSim(l, { kind: 'days', n: 4 });
      const d = diffGames(sent, l.games);
      expect(d.keep).toBe(before.length);
      expect(d.tail.length).toBe(l.games.length - before.length);
      expect(applyGames(before, d).map((g) => g.gid)).toEqual(l.games.map((g) => g.gid));
      // a list the other side has never seen goes whole
      expect(l.games.length).toBeGreaterThan(0);
      expect(diffGames(null, l.games)).toEqual({ keep: 0, tail: l.games });
      // a game that dropped its play-by-play is sent again, and so is everything after it
      const games = [
        { ...l.games[0], gid: 1, pbp: ['a'] },
        { ...l.games[0], gid: 2, pbp: ['b'] },
        { ...l.games[0], gid: 3 },
      ] as unknown as typeof l.games;
      const sig = gamesSig(games);
      const after = [games[0], { ...games[1], pbp: undefined }, games[2]];
      const dd = diffGames(sig, after);
      expect(dd.keep).toBe(1);
      expect(dd.tail.map((g) => g.gid)).toEqual([2, 3]);
      expect(applyGames(games, dd)[1].pbp).toBeUndefined();
      // a phase change hands back a league whose results line up with what it was given
      const core = withoutGames(l);
      expect(core.games).toEqual([]);
      expect(l.games).not.toEqual([]);
      // (no-op outside free agency, but it still reports)
      expect(runTask(l, { kind: 'faAdvance', days: 1 })).toEqual({ done: true });
    }

    // the worker keeps its own copy of the results between runs: a measurement sent before a live
    // game is recorded (the league's results added to in place) and answered after it doesn't leave
    // the client thinking the worker has that game, so the next sim goes through (it failed with
    // "lost track of the results" after watched playoff games)
    {
      await ThreadWorker.start();
      const l = (await simLeague(testLeague('worker'), { kind: 'days', n: 2 }, { progress: () => {}, checkpoint: () => {} })).league;
      const opp = l.schedule.find((g) => !g.played && (g.home === l.userTid || g.away === l.userTid))!;
      const counters = measureCounters(l, opp.home === l.userTid ? opp.away : opp.home, opp.gid, () => {});
      cancelWorth();
      const before = l.games.length;
      simDay(l);
      expect(l.games.length).toBeGreaterThan(before);
      await counters;
      const warn = vi.spyOn(console, 'warn');
      const out = await simLeague(l, { kind: 'days', n: 2 }, { progress: () => {}, checkpoint: () => {} });
      expect(out.league.day).toBe(l.day + 2);
      // (sent as a delta, not whole again)
      expect(warn).not.toHaveBeenCalled();
      expect(out.league.games.slice(0, l.games.length)).toEqual(l.games);
      // a result changed after it went over (the night's moves measured) goes again
      const g = out.league.games[0];
      g.movesWorth = { pts: 1, raw: 1, se: 0.5, win: 0.02, n: 100, moves: 1 };
      const t = await taskLeague(out.league, { kind: 'faAdvance', days: 1 });
      const task = ThreadWorker.sent.filter((m) => m.path?.[0] === 'task').at(-1);
      expect((task?.argumentList?.[1].value as GamesDelta).keep).toBe(0);
      expect(t.league.games[0].movesWorth).toEqual(g.movesWorth);
      // the worker going away (here: its error) drops it; the next run starts another
      ThreadWorker.current!.dispatchEvent(new Event('error'));
      fresh();
    }

    // a sim worker that cannot start: the sim runs in this thread instead, and so do later runs
    {
      DeadWorker.made = 0;
      vi.stubGlobal('Worker', DeadWorker);
      simLocally(false);
      const l = testLeague('dead worker');
      const day = l.day;
      const out = await simLeague(l, { kind: 'days', n: 2 }, { progress: () => {}, checkpoint: () => {} });
      expect(out.league.day).toBe(day + 2);
      // the league handed in is never changed
      expect(l.day).toBe(day);
      const t = await taskLeague(out.league, { kind: 'faAdvance', days: 1 });
      expect(t.result).toEqual({ done: true });
      // one try at a worker, then this thread for good
      expect(DeadWorker.made).toBe(1);
    }
  });
});
