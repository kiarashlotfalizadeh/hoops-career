// IndexedDB saves: results in their own store written incrementally, revisions that stop a stale
// window from overwriting a newer save, and the checks that run on every league read.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteLeague, isLeague, listLeagues, loadLeague, migrate, onRemoteChange, SAVE_VERSION, saveLeague } from '../persistence';
import { simDay } from '../../core/league/season';
import { createLeague, defaultSettings } from '../../core/league/create';
import type { League } from '../../core/types';
import { testLeague, userGames } from './fixtures';

const put = IDBObjectStore.prototype.put;
const del = IDBObjectStore.prototype.delete;

/** Count the puts and deletes each object store receives until restored. */
function countWrites() {
  const n: Record<string, number> = {};
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
    n[`put ${this.name}`] = (n[`put ${this.name}`] ?? 0) + 1;
    return put.apply(this, args);
  });
  vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['delete']>) {
    n[`delete ${this.name}`] = (n[`delete ${this.name}`] ?? 0) + 1;
    return del.apply(this, args);
  });
  return n;
}

afterEach(() => vi.restoreAllMocks());

async function saved(name: string, days = 5): Promise<League> {
  const l = testLeague(name);
  for (let i = 0; i < days; i++) simDay(l);
  await saveLeague(l);
  return l;
}

describe('saves', () => {
  it('round-trips a league with its results, in the order they were played', async () => {
    const l = await saved('round trip');
    const back = (await loadLeague(l.id))!;
    expect(back.games.length).toBeGreaterThan(30);
    expect(back.games).toEqual(l.games);
    expect(back).toEqual(l);
    expect(back.version).toBe(SAVE_VERSION);
    expect((await listLeagues()).find((m) => m.id === l.id)?.rev).toBe(1);
  });

  it('writes only the results that are new since the last save', async () => {
    const l = (await loadLeague((await saved('incremental')).id))!;
    const before = l.games.length;
    simDay(l);
    const n = countWrites();
    await saveLeague(l);
    expect(n['put games']).toBe(l.games.length - before);
    expect(n['put leagues']).toBe(1);
    // nothing new: the league record and index only
    const m = countWrites();
    await saveLeague(l);
    expect(m['put games']).toBeUndefined();
  });

  it('rewrites a result that lost its play-by-play, and deletes pruned results', async () => {
    const l = (await loadLeague((await saved('prune', 12)).id))!;
    const g = userGames(l)[0];
    g.pbp = [{ q: 1, clock: 720, t: -1, text: 'Start of 1st quarter.', hs: 0, as: 0 }];
    await saveLeague(l);
    delete g.pbp;
    const n = countWrites();
    await saveLeague(l);
    expect(n['put games']).toBe(1);
    expect((await loadLeague(l.id))!.games.find((x) => x.gid === g.gid)?.pbp).toBeUndefined();
    // the season rollover keeps only some results
    const kept = l.games.slice(10);
    l.games = kept;
    await saveLeague(l);
    expect((await loadLeague(l.id))!.games.map((x) => x.gid)).toEqual(kept.map((x) => x.gid));
  });

  it('deleting a league removes its results too', async () => {
    const l = await saved('delete');
    await deleteLeague(l.id);
    expect(await loadLeague(l.id)).toBeUndefined();
    // a new league under that id starts with no stale results
    const again = testLeague('delete');
    again.id = l.id;
    await saveLeague(again);
    expect((await loadLeague(l.id))!.games).toEqual([]);
  });
});

describe('two windows on one league', () => {
  it('refuses to save a copy that another window has saved over, and tells it right away', async () => {
    const l = await saved('two tabs');
    vi.resetModules();
    const other = await import('../persistence');
    const mine = (await loadLeague(l.id))!;
    const theirs = (await other.loadLeague(l.id))!;
    const heard = vi.fn();
    const off = onRemoteChange(heard);
    simDay(theirs);
    await other.saveLeague(theirs);
    await vi.waitFor(() => expect(heard).toHaveBeenCalledWith(l.id));
    off();
    simDay(mine);
    simDay(mine);
    await expect(saveLeague(mine)).rejects.toThrow('changed in another window');
    expect((await loadLeague(l.id))!.day).toBe(theirs.day);
    // the window that saved last keeps saving
    simDay(theirs);
    await other.saveLeague(theirs);
    // and one that deleted the league stops the other from bringing it back
    await deleteLeague(l.id);
    await expect(other.saveLeague(theirs)).rejects.toThrow('changed in another window');
    expect(await loadLeague(l.id)).toBeUndefined();
  });
});

describe('reading a league', () => {
  it('refuses saves from a newer version of the app', async () => {
    const l = testLeague('future');
    expect(() => migrate({ ...l, version: SAVE_VERSION + 1 })).toThrow('newer version');
  });

  it('keeps only in-app routes as inbox links', () => {
    const l = testLeague('links');
    const links = ['/roster', '/', '/trade?with=3', 'javascript:alert(1)', '//evil.example', '/\\evil.example', 'https://evil.example', 42];
    l.inbox = links.map((link, i) => ({ id: i, season: l.season, day: 0, from: 'x', subject: 's', body: 'b', read: false, link: link as string }));
    expect(migrate(l).inbox.map((m) => m.link)).toEqual(['/roster', '/', '/trade?with=3', undefined, undefined, undefined, undefined, undefined]);
  });

  it('accepts real and fictional leagues, as saved or as backup files', () => {
    expect(isLeague(JSON.parse(JSON.stringify(testLeague('real'))))).toBe(true);
    const fictional = createLeague({ name: 'f', userTid: 3, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 1 });
    expect(isLeague(structuredClone(fictional))).toBe(true);
    expect(isLeague(JSON.parse(JSON.stringify(fictional)))).toBe(true);
  });

  it('rejects damaged leagues instead of crashing on them later', () => {
    const l = testLeague('damaged');
    expect(isLeague(structuredClone(l))).toBe(true);
    const noSeasons = structuredClone(l) as unknown as { teams: { seasons?: unknown }[] };
    delete noSeasons.teams[3].seasons;
    expect(isLeague(noSeasons)).toBe(false);
    expect(isLeague({ ...l, phase: 'halftime' })).toBe(false);
    expect(isLeague({ ...l, schedule: [{ gid: 'x' }] })).toBe(false);
    expect(isLeague(null)).toBe(false);
    expect(() => migrate({ id: 'x' })).toThrow('damaged');
  });
});
