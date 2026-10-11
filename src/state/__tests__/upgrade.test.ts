// Opening a version-1 database (every result inside its league record) moves the results out.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { simDay } from '../../core/league/season';
import { metaFor } from '../persistence';
import { testLeague } from './fixtures';

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => ((r.onsuccess = () => resolve(r.result)), (r.onerror = () => reject(r.error))));

it('upgrades a version-1 database without losing a result', async () => {
  globalThis.indexedDB = new IDBFactory();
  const l = testLeague('v1');
  for (let i = 0; i < 4; i++) simDay(l);
  // the version-1 schema and record, as older builds wrote them
  const open = indexedDB.open('hoops-career', 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore('leagues');
    open.result.createObjectStore('meta');
  };
  const v1 = await req(open);
  const tx = v1.transaction(['leagues', 'meta'], 'readwrite');
  tx.objectStore('leagues').put(l, l.id);
  tx.objectStore('meta').put(metaFor(l), l.id);
  await new Promise((r) => (tx.oncomplete = r));
  v1.close();

  const { loadLeague, saveLeague, listLeagues } = await import('../persistence');
  const back = (await loadLeague(l.id))!;
  expect(back.games).toEqual(l.games);
  expect(back.day).toBe(l.day);
  expect((await listLeagues()).map((m) => m.id)).toEqual([l.id]);
  // the record itself no longer carries them, and the league saves as before
  const v2 = await req(indexedDB.open('hoops-career'));
  expect(v2.version).toBe(2);
  expect((await req(v2.transaction('leagues').objectStore('leagues').get(l.id))).games).toEqual([]);
  v2.close();
  simDay(back);
  await saveLeague(back);
  expect((await loadLeague(l.id))!.games).toEqual(back.games);
});
