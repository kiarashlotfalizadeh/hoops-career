// The store's save bookkeeping and how it recovers from a sim or phase change that throws halfway.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemOf, useStore } from '../store';
import { loadLeague, SaveConflictError } from '../persistence';
import { simDay } from '../../core/league/season';
import { testLeague } from './fixtures';

vi.mock('../../core/league/season', async (load) => {
  const m = await load<typeof import('../../core/league/season')>();
  return { ...m, simDay: vi.fn(m.simDay) };
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

// the failures below are on purpose
beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => {}));

afterEach(() => {
  vi.restoreAllMocks();
  st().setLeague(null);
});

describe('saving', () => {
  it('reports a failed save, keeps the league dirty, and clears both once a save works', async () => {
    const l = testLeague('quota');
    st().setLeague(l);
    st().mutate((x) => (x.name = 'renamed'));
    failPuts(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    expect(await st().save()).toBe(false);
    expect(st().saveProblem?.kind).toBe('quota');
    expect(st().dirty).toBe(true);
    vi.mocked(IDBObjectStore.prototype.put).mockRestore();
    expect(await st().save()).toBe(true);
    expect(st()).toMatchObject({ saveProblem: null, dirty: false });
    expect((await loadLeague(l.id))!.name).toBe('renamed');
    expect(problemOf(new Error('disk on fire'))).toEqual({ kind: 'error', text: 'Could not save to device storage (disk on fire).' });
  });

  it('runs one save at a time and skips saving when nothing changed', async () => {
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
  });

  it('a new league counts as unsaved until its first save works', async () => {
    const l = testLeague('new');
    st().setLeague(l);
    expect(st().dirty).toBe(true);
    failPuts(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    expect(await st().save()).toBe(false);
    expect(st()).toMatchObject({ dirty: true, saveProblem: { kind: 'quota' } });
    vi.mocked(IDBObjectStore.prototype.put).mockRestore();
    // hiding the app flushes it
    expect(await st().flush()).toBe(true);
    expect(st().dirty).toBe(false);
    expect((await loadLeague(l.id))!.day).toBe(l.day);
    st().setLeague((await loadLeague(l.id))!);
    expect(st().dirty).toBe(false);
  });

  it('opening another league keeps the unsaved changes of the one it replaces', async () => {
    const a = testLeague('replaced');
    st().setLeague(a);
    await st().save();
    st().mutate((x) => (x.name = 'renamed'), false);
    st().setLeague(testLeague('opened'));
    await vi.waitFor(async () => expect((await loadLeague(a.id))!.name).toBe('renamed'));
  });

  it('stops saving a copy another window has saved over', async () => {
    st().setLeague(testLeague('stale'));
    useStore.setState({ saveProblem: problemOf(new SaveConflictError()) });
    const n = countSaves();
    expect(await st().save()).toBe(false);
    expect(n.saves).toBe(0);
  });
});

describe('recovering from errors', () => {
  it('a sim that throws goes back to the last save instead of keeping a half-played day', async () => {
    const l = testLeague('sim error');
    st().setLeague(l);
    await st().save();
    const day = l.day;
    vi.mocked(simDay).mockImplementationOnce((x) => {
      x.day += 3;
      throw new Error('boom');
    });
    await st().simulate({ kind: 'week' });
    const now = st().league!;
    expect(now).not.toBe(l);
    expect(now.day).toBe(day);
    expect(st().sim).toBeNull();
    expect(st().toasts.at(-1)?.text).toMatch(/last save/);
  });

  it('a phase change that throws leaves the league as it was', async () => {
    const l = testLeague('task error');
    st().setLeague(l);
    const before = structuredClone(l);
    const ran = await st().task('Training camp', (x) => {
      x.season += 1;
      x.players = {};
      throw new Error('boom');
    });
    expect(ran).toBe(false);
    expect(st().league).toBe(l);
    expect(l).toEqual(before);
    expect(st().sim).toBeNull();
    expect(st().toasts.at(-1)?.text).toMatch(/nothing changed/);
  });

  it('opening another league stops a sim running on the old one', async () => {
    const l = testLeague('swap');
    st().setLeague(l);
    const day = l.day;
    const running = st().simulate({ kind: 'week' });
    const other = testLeague('other');
    st().setLeague(other);
    await running;
    expect(l.day - day).toBeLessThan(7);
    expect(st()).toMatchObject({ league: other, sim: null });
  });
});
