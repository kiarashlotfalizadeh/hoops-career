// Importing a backup: the whole league with its results, checked and cleaned before it is stored.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importLeague } from '../backup';
import { loadLeague, SAVE_VERSION } from '../persistence';
import { useStore } from '../store';
import { simDay } from '../../core/league/season';
import type { League } from '../../core/types';
import { testLeague } from './fixtures';

const backup = (l: unknown, name = 'backup.json') => new File([JSON.stringify(l)], name, { type: 'application/json' });

function played(name: string): League {
  const l = testLeague(name);
  for (let i = 0; i < 3; i++) simDay(l);
  return l;
}

afterEach(() => {
  vi.restoreAllMocks();
  useStore.getState().setLeague(null);
});

describe('import', () => {
  it('stores the league and every result, and keeps a league already on the device', async () => {
    const l = played('import');
    const first = await importLeague(backup(l));
    expect(first.id).toBe(l.id);
    expect((await loadLeague(l.id))!.games).toEqual(JSON.parse(JSON.stringify(l.games)));
    const copy = await importLeague(backup(l));
    expect(copy.id).not.toBe(l.id);
    expect(copy.name).toBe('import (imported)');
    expect((await loadLeague(copy.id))!.games).toHaveLength(l.games.length);
    expect((await loadLeague(l.id))!.name).toBe('import');
  });

  it('drops inbox links that are not in-app routes (crafted backups)', async () => {
    const l = played('evil');
    l.inbox.unshift({
      id: 1e6,
      season: l.season,
      day: 0,
      from: 'Owner',
      subject: 'Contract offer',
      body: 'Tap to review',
      read: false,
      link: 'javascript:void(document.title="PWNED")',
    });
    const back = await importLeague(backup(l));
    expect(back.inbox[0].link).toBeUndefined();
    expect((await loadLeague(back.id))!.inbox[0].link).toBeUndefined();
  });

  it('a crafted backup cannot reach the prototypes of the objects it is read into', async () => {
    const l = played('proto');
    const plant = (o: object) => {
      Object.defineProperty(o, '__proto__', { value: { polluted: true }, enumerable: true });
      Object.defineProperty(o, 'constructor', { value: { prototype: { polluted: true } }, enumerable: true });
    };
    const p = Object.values(l.players).find((x) => x.tid === l.userTid)!;
    [l, l.settings, l.teams[l.userTid], l.teams[l.userTid].tactics, l.teams[l.userTid].rotation, p, p.ratings, l.games[0]].forEach(plant);
    const back = await importLeague(backup(l));
    useStore.getState().setLeague(back);
    await useStore.getState().simulate({ kind: 'days', n: 3 });
    useStore.getState().mutate((x) => (x.name = 'saved again'));
    await useStore.getState().save();
    await loadLeague(back.id);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
    expect(back.day).toBe(l.day + 3);
  });

  it('refuses files that are not backups, too big, or from a newer version', async () => {
    await expect(importLeague(new File(['{"nope"'], 'x.json'))).rejects.toThrow('not a Hoops Career backup');
    await expect(importLeague(backup({ id: 'x', teams: [] }))).rejects.toThrow('not a Hoops Career backup');
    const huge = backup({});
    Object.defineProperty(huge, 'size', { value: 65 * 1024 * 1024 });
    await expect(importLeague(huge)).rejects.toThrow('too big');
    const l = played('newer');
    await expect(importLeague(backup({ ...l, version: SAVE_VERSION + 1 }))).rejects.toThrow('newer version');
  });

  it('waits for a running sim, and keeps an open league whose changes could not be saved', async () => {
    const open = played('open');
    useStore.getState().setLeague(open);
    useStore.setState({ sim: { label: 'Simulating', done: 1, total: 7 } });
    await expect(importLeague(backup(played('other')))).rejects.toThrow('simulation');
    useStore.setState({ sim: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    useStore.getState().mutate((x) => (x.name = 'renamed'));
    await expect(importLeague(backup(played('other')))).rejects.toThrow('Export a backup');
    expect(useStore.getState().league).toBe(open);
  });
});
