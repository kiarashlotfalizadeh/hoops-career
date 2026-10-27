// IndexedDB saves: results in their own store written incrementally, revisions that stop a stale
// window from overwriting a newer save, and the checks that run on every league read (the contract
// rules' optional fields among them).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteLeague,
  isLeague,
  listLeagues,
  loadLeague,
  loadRawSnapshot,
  metaFor,
  migrate,
  OldSaveError,
  onRemoteChange,
  restoreSnapshot,
  SAVE_VERSION,
  saveLeague,
  snapshotOf,
} from '../persistence';
import { seasonLabel } from '../../core/constants';
import { simDay } from '../../core/league/season';
import { createLeague, defaultSettings } from '../../core/league/create';
import { FRANCHISES } from '../../core/teams';
import type { League, Talks } from '../../core/types';
import { testLeague, userGames } from './fixtures';

const put = IDBObjectStore.prototype.put;
const del = IDBObjectStore.prototype.delete;
const transaction = IDBDatabase.prototype.transaction;

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

/** Safari can lose an idle connection without a close event: the next transaction finds it closed. */
const dropConnection = () =>
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
    this.close();
    return transaction.apply(this, args);
  });

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => ((r.onsuccess = () => resolve(r.result)), (r.onerror = () => reject(r.error))));

afterEach(() => vi.restoreAllMocks());

async function saved(name: string, days = 5): Promise<League> {
  const l = testLeague(name);
  for (let i = 0; i < days; i++) simDay(l);
  await saveLeague(l);
  return l;
}

const talks = (l: League): Talks => ({
  tid: l.userTid,
  season: l.season,
  kind: 'fa',
  period: 'season',
  patience: 2,
  counter: { amount: 4_000, years: 2, option: 'player' },
  lowballs: 1,
  sour: 0.02,
});

describe('saves', () => {
  it('round-trip incrementally, survive a failed save, a stale window and a dropped connection, and upgrade from version 1', { timeout: 120_000 }, async () => {
    // round-trips a league with its results, in the order they were played
    {
      const l = await saved('round trip');
      const back = (await loadLeague(l.id))!;
      expect(back.games.length).toBeGreaterThan(30);
      expect(back.games).toEqual(l.games);
      expect(back).toEqual(l);
      expect(back.version).toBe(SAVE_VERSION);
      expect((await listLeagues()).find((m) => m.id === l.id)?.rev).toBe(1);
    }

    // writes only the results that are new since the last save
    {
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
      vi.restoreAllMocks();
    }

    // rewrites a result that lost its play-by-play, and deletes pruned results
    {
      const l = (await loadLeague((await saved('prune', 12)).id))!;
      const g = userGames(l)[0];
      g.pbp = [{ q: 1, clock: 720, t: -1, text: 'Start of 1st quarter.', hs: 0, as: 0 }];
      await saveLeague(l);
      delete g.pbp;
      const n = countWrites();
      await saveLeague(l);
      expect(n['put games']).toBe(1);
      vi.restoreAllMocks();
      expect((await loadLeague(l.id))!.games.find((x) => x.gid === g.gid)?.pbp).toBeUndefined();
      // and one changed after it was saved (the night's moves measured once the final is in)
      const worth = { pts: 0.5, raw: 0.6, se: 0.9, win: 0.01, winSe: 0.02, n: 120, moves: 2 };
      g.movesWorth = worth;
      const m = countWrites();
      await saveLeague(l);
      expect(m['put games']).toBe(1);
      vi.restoreAllMocks();
      expect((await loadLeague(l.id))!.games.find((x) => x.gid === g.gid)?.movesWorth).toEqual(worth);
      // the season rollover keeps only some results
      const kept = l.games.slice(10);
      l.games = kept;
      await saveLeague(l);
      expect((await loadLeague(l.id))!.games.map((x) => x.gid)).toEqual(kept.map((x) => x.gid));
    }

    // a save that fails halfway leaves the last one whole, and the next save catches up
    {
      const l = (await loadLeague((await saved('halfway')).id))!;
      const day = l.day;
      const before = l.games.length;
      simDay(l);
      simDay(l);
      // the league record goes in first; a result IndexedDB can't store fails after it
      const bad = l.games.at(-1)! as unknown as { fn?: () => void };
      bad.fn = () => {};
      await expect(saveLeague(l)).rejects.toThrow();
      const disk = (await loadLeague(l.id))!;
      expect(disk.day).toBe(day);
      expect(disk.games).toHaveLength(before);
      delete bad.fn;
      await saveLeague(l);
      const back = (await loadLeague(l.id))!;
      expect(back.day).toBe(l.day);
      expect(back.games).toEqual(l.games);
    }

    // lists every league with its latest record, newest first
    {
      const a = await saved('list a', 0);
      const b = await saved('list b', 3);
      const metas = await listLeagues();
      expect(metas.findIndex((m) => m.id === b.id)).toBeLessThan(metas.findIndex((m) => m.id === a.id));
      const ts = b.teams[b.userTid].seasons.find((s) => s.season === b.season)!;
      expect(metas.find((m) => m.id === b.id)).toMatchObject({ name: 'list b', phase: 'regular', season: b.season, record: `${ts.won}-${ts.lost}` });
    }

    // deleting a league removes its results too
    {
      const l = await saved('delete');
      await deleteLeague(l.id);
      expect(await loadLeague(l.id)).toBeUndefined();
      // a new league under that id starts with no stale results
      const again = testLeague('delete');
      again.id = l.id;
      await saveLeague(again);
      expect((await loadLeague(l.id))!.games).toEqual([]);
    }

    // the season's first save keeps a snapshot of the league, without play-by-play, replaced by the next
    // season's; one that can't be written leaves the save whole; restored, it's a league of its own; a delete takes it
    {
      const l = await saved('snapshot', 3);
      const first = (await listLeagues()).find((m) => m.id === l.id)!.snap!;
      expect(first.season).toBe(l.season);
      expect(await snapshotOf(l.id)).toEqual(first);
      expect(((await loadRawSnapshot(l.id)) as League).games.map((g) => g.gid)).toEqual(l.games.map((g) => g.gid));
      // later saves of the season leave it be
      userGames(l)[0].pbp = [{ q: 1, clock: 720, t: -1, text: 'Start of 1st quarter.', hs: 0, as: 0 }];
      simDay(l);
      const n = countWrites();
      await saveLeague(l);
      expect(n['put snapshots']).toBeUndefined();
      vi.restoreAllMocks();
      // the next season's first save takes a new one; storage too full for it, the save goes in all the same
      l.season++;
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'snapshots') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return put.apply(this, args);
      });
      await saveLeague(l);
      expect([(await loadLeague(l.id))!.season, (await snapshotOf(l.id))!.season]).toEqual([l.season, l.season - 1]);
      vi.restoreAllMocks();
      await saveLeague(l);
      expect((await snapshotOf(l.id))!.season).toBe(l.season);
      const snap = (await loadRawSnapshot(l.id)) as League;
      expect([snap.day, snap.games.some((g) => g.pbp)]).toEqual([l.day, false]);
      const copy = await restoreSnapshot(l.id);
      expect([copy.id === l.id, copy.name, copy.day]).toEqual([false, `snapshot (${seasonLabel(l.season)} start)`, l.day]);
      expect((await loadLeague(copy.id))!.games.map((g) => g.gid)).toEqual(l.games.map((g) => g.gid));
      expect((await loadLeague(l.id))!.name).toBe('snapshot');
      await deleteLeague(l.id);
      expect([await loadRawSnapshot(l.id), await snapshotOf(l.id)]).toEqual([undefined, undefined]);
      await expect(restoreSnapshot(l.id)).rejects.toThrow('no season snapshot');
    }

    // a connection the browser dropped is opened again for the saved-leagues list, loading, saving and deleting
    {
      const l = await saved('dropped');
      dropConnection();
      expect((await listLeagues()).some((m) => m.id === l.id)).toBe(true);
      dropConnection();
      expect((await loadLeague(l.id))!.games).toEqual(l.games);
      simDay(l);
      dropConnection();
      await saveLeague(l);
      expect((await loadLeague(l.id))!.day).toBe(l.day);
      dropConnection();
      await deleteLeague(l.id);
      expect(await loadLeague(l.id)).toBeUndefined();
      vi.restoreAllMocks();
    }

    // two windows on one league: refuses to save a copy that another window has saved over, and tells it right away
    {
      const l = await saved('two tabs');
      vi.resetModules();
      const other = await import('../persistence');
      const mine = (await loadLeague(l.id))!;
      const theirs = (await other.loadLeague(l.id))!;
      const heard = vi.fn();
      const off = onRemoteChange(heard);
      simDay(theirs);
      await other.saveLeague(theirs);
      await vi.waitFor(() => expect(heard).toHaveBeenCalledWith(l.id, false));
      off();
      simDay(mine);
      simDay(mine);
      await expect(saveLeague(mine)).rejects.toThrow('changed in another window');
      expect((await loadLeague(l.id))!.day).toBe(theirs.day);
      // the window that saved last keeps saving
      simDay(theirs);
      await other.saveLeague(theirs);
      // and one that deleted the league stops the other from bringing it back, and says it was deleted
      const told = vi.fn();
      const off2 = other.onRemoteChange(told);
      await deleteLeague(l.id);
      await vi.waitFor(() => expect(told).toHaveBeenCalledWith(l.id, true));
      off2();
      await expect(other.saveLeague(theirs)).rejects.toThrow('deleted in another window');
      expect(await loadLeague(l.id)).toBeUndefined();
    }

    // opening a version-1 database (every result inside its league record) moves the results out without losing one
    {
      // (a database of its own, opened by a fresh copy of the module)
      globalThis.indexedDB = new IDBFactory();
      vi.resetModules();
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

      const fresh = await import('../persistence');
      const back = (await fresh.loadLeague(l.id))!;
      expect(back.games).toEqual(l.games);
      expect(back.day).toBe(l.day);
      expect((await fresh.listLeagues()).map((m) => m.id)).toEqual([l.id]);
      // the record itself no longer carries them, and the league saves as before
      const v2 = await req(indexedDB.open('hoops-career'));
      // (and on to version 3, with its snapshots, the first of them taken by the first save)
      expect([v2.version, v2.objectStoreNames.contains('snapshots')]).toEqual([3, true]);
      expect((await req(v2.transaction('leagues').objectStore('leagues').get(l.id))).games).toEqual([]);
      v2.close();
      simDay(back);
      await fresh.saveLeague(back);
      expect((await fresh.loadLeague(l.id))!.games).toEqual(back.games);
      expect((await fresh.snapshotOf(l.id))!.season).toBe(back.season);
    }
  });
});

describe('reading a league', () => {
  it('turns away saves it cannot read, keeps what is in shape and drops or rebuilds what is damaged', { timeout: 60_000 }, () => {
    // refuses saves from a newer version of the app
    expect(() => migrate({ ...testLeague('future'), version: SAVE_VERSION + 1 })).toThrow('newer version');

    // turns away saves from before the redesign with a clear reason
    {
      const l = testLeague('before the redesign');
      const old = JSON.parse(JSON.stringify({ ...l, version: 3 })) as League;
      expect(() => migrate(old)).toThrow(OldSaveError);
      const unversioned = JSON.parse(JSON.stringify(l)) as Partial<League>;
      delete unversioned.version;
      expect(() => migrate(unversioned)).toThrow(/older version/);
      expect(migrate(JSON.parse(JSON.stringify(l))).version).toBe(SAVE_VERSION);
    }

    // turns away saves from before the tactics overhaul (format 7): a clean break
    {
      const l = testLeague('before the overhaul');
      for (const version of [4, 5, 6]) expect(() => migrate(JSON.parse(JSON.stringify({ ...l, version })))).toThrow(OldSaveError);
    }

    // accepts real and fictional leagues, as saved or as backup files
    const fictional = createLeague({ name: 'f', userTid: 3, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 1 });
    {
      expect(isLeague(JSON.parse(JSON.stringify(testLeague('real'))))).toBe(true);
      expect(isLeague(structuredClone(fictional))).toBe(true);
      expect(isLeague(JSON.parse(JSON.stringify(fictional)))).toBe(true);
    }

    // rejects damaged leagues instead of crashing on them later
    {
      const l = testLeague('damaged');
      expect(isLeague(structuredClone(l))).toBe(true);
      const noSeasons = structuredClone(l) as unknown as { teams: { seasons?: unknown }[] };
      delete noSeasons.teams[3].seasons;
      expect(isLeague(noSeasons)).toBe(false);
      expect(isLeague({ ...l, phase: 'halftime' })).toBe(false);
      expect(isLeague({ ...l, schedule: [{ gid: 'x' }] })).toBe(false);
      expect(isLeague(null)).toBe(false);
      expect(() => migrate({ id: 'x' })).toThrow('damaged');
    }

    // a setting waiting for opening night loads as it was; a damaged one goes, as if never chosen
    {
      const l = testLeague('pending');
      l.settings.pending = { difficulty: 'hard', jobSecurity: false };
      expect(migrate(structuredClone(l)).settings.pending).toEqual({ difficulty: 'hard', jobSecurity: false });
      (l.settings as { pending?: unknown }).pending = { difficulty: 'nightmare' };
      expect(migrate(structuredClone(l)).settings.pending).toBeUndefined();
    }

    // keeps only in-app routes as inbox links
    {
      const l = testLeague('links');
      const links = ['/roster', '/', '/trade?with=3', 'javascript:alert(1)', '//evil.example', '/\\evil.example', 'https://evil.example', 42];
      l.inbox = links.map((link, i) => ({ id: i, season: l.season, day: 0, from: 'x', subject: 's', body: 'b', read: false, link: link as string }));
      expect(migrate(l).inbox.map((m) => m.link)).toEqual(['/roster', '/', '/trade?with=3', undefined, undefined, undefined, undefined, undefined]);
    }

    // keeps saves without trade offers as they are, and drops offers whose players or picks are gone
    {
      const l = testLeague('offers');
      // a version-2 save has none of the fields
      const plain = structuredClone(l);
      delete plain.proposals;
      delete plain.nextProposalId;
      delete plain.untouchable;
      for (const m of plain.inbox) delete m.proposal;
      const old = structuredClone(plain);
      expect(migrate(plain)).toEqual({ ...old, version: SAVE_VERSION });
      const mine = l.teams[l.userTid];
      const pid = Object.values(l.players).find((p) => p.tid === mine.tid)!.pid;
      const theirs = Object.values(l.players).find((p) => p.tid === 3)!.pid;
      const dp = l.draftPicks.find((d) => d.tid === 3)!.dpid;
      const offer = (b: number[], dpids: number[]) => ({ a: { tid: l.userTid, pids: [pid], dpids: [] }, b: { tid: 3, pids: b, dpids } });
      const base = { tid: 3, kind: 'buy' as const, note: '', season: l.season, day: 0, expires: 5 };
      l.proposals = [
        { ...base, id: 1, offer: offer([theirs], [dp]) },
        { ...base, id: 2, offer: offer([999_999], []) },
        { ...base, id: 3, offer: offer([], [999_999]) },
        { ...base, id: 4, offer: null as never },
      ];
      l.untouchable = [pid, 999_999];
      l.inbox[0].proposal = 'x' as never;
      l.inbox[1].proposal = 1;
      const once = migrate(l);
      expect(once.proposals!.map((p) => p.id)).toEqual([1]);
      expect(once.untouchable).toEqual([pid]);
      expect([once.inbox[0].proposal, once.inbox[1].proposal]).toEqual([undefined, 1]);
      // and again changes nothing
      expect(migrate(structuredClone(once))).toEqual(once);
    }

    // keeps sound pick swaps and cash in trades, and drops damaged ones
    {
      const l = testLeague('terms');
      // a save from before them comes through as it was
      const before = structuredClone(l);
      expect(migrate(structuredClone(l))).toEqual({ ...before, version: SAVE_VERSION });
      const first = (tid: number, season: number) => l.draftPicks.find((d) => d.originalTid === tid && d.season === season && d.round === 1)!;
      const y = l.season + 1;
      // sound: 0's first may swap for 1's; damaged: a swap to a missing pick, to a second-rounder, to another
      // draft, a second right on 1's first, and a chain through a pick that is itself subject to one
      first(0, y).swap = first(1, y).dpid;
      first(2, y).swap = 999_999;
      first(3, y).swap = l.draftPicks.find((d) => d.originalTid === 4 && d.season === y && d.round === 2)!.dpid;
      first(5, y).swap = first(6, y + 1).dpid;
      first(7, y).swap = first(1, y).dpid;
      first(8, y).swap = first(0, y).dpid;
      l.teams[0].cashTrades = { season: l.season, sent: 2_500, received: 0 };
      l.teams[1].cashTrades = { season: l.season, sent: -5, received: 0 };
      (l.teams[2] as { cashTrades?: unknown }).cashTrades = 'lots';
      l.teams[1].seasons[0].cashIn = 2_500;
      (l.teams[3].seasons[0] as { cashIn?: unknown }).cashIn = 'x';
      l.transactions = [
        {
          id: 1,
          season: l.season,
          day: 1,
          phase: 'regular',
          kind: 'trade',
          tids: [0, 1],
          sides: [
            { tid: 0, players: [], picks: [], cash: 2_500, swaps: [y] },
            { tid: 1, players: [], picks: [], cash: 'x' as never, swaps: ['y'] as never },
          ],
        },
      ];
      const back = migrate(l);
      expect(back.draftPicks.filter((p) => p.swap !== undefined).map((p) => [p.originalTid, p.swap])).toEqual([[0, first(1, y).dpid]]);
      expect(back.teams.slice(0, 3).map((t) => t.cashTrades)).toEqual([{ season: l.season, sent: 2_500, received: 0 }, undefined, undefined]);
      expect([back.teams[1].seasons[0].cashIn, back.teams[3].seasons[0].cashIn]).toEqual([2_500, undefined]);
      expect(back.transactions![0].sides).toEqual([
        { tid: 0, players: [], picks: [], cash: 2_500, swaps: [y] },
        { tid: 1, players: [], picks: [] },
      ]);
      // and again changes nothing
      expect(migrate(structuredClone(back))).toEqual(back);
    }

    // keeps restricted free agency in shape: damaged rights or offer sheets, or ones out of their phase, are dropped, and so are inbox links that aren’t a player
    {
      const l = testLeague('rfa');
      l.phase = 'freeAgency';
      const [a, b, c, d] = Object.values(l.players).filter((p) => p.tid === -1);
      const rostered = Object.values(l.players).find((p) => p.tid === 3)!;
      const sheet = { tid: 4, amount: 9_000, years: 3, route: 'space' as const, day: 2, until: 3 };
      a.rfa = { tid: 3, qo: 5_000, hold: 9_000, sheet };
      b.rfa = { tid: 3, qo: 5_000, hold: 9_000, sheet: { ...sheet, years: 9 } };
      c.rfa = { tid: 999, qo: 5_000, sheet };
      d.rfa = { tid: 3, qo: -1 };
      rostered.rfa = { tid: 3, qo: 5_000 };
      l.inbox[0].sheet = 'x' as never;
      l.inbox[1].sheet = a.pid;
      const once = migrate(l);
      const by = (pid: number) => once.players[pid].rfa;
      expect(by(a.pid)).toEqual({ tid: 3, qo: 5_000, hold: 9_000, sheet });
      expect(by(b.pid)).toEqual({ tid: 3, qo: 5_000, hold: 9_000 });
      expect([by(c.pid), by(d.pid), by(rostered.pid)]).toEqual([undefined, undefined, undefined]);
      expect([once.inbox[0].sheet, once.inbox[1].sheet]).toEqual([undefined, a.pid]);
      expect(migrate(structuredClone(once))).toEqual(once);
      // nothing of it outlives the summer, nor does an offer sheet before free agency
      const later = structuredClone(once);
      later.phase = 'preseason';
      expect(Object.values(migrate(later).players).some((p) => p.rfa)).toBe(false);
      const resign = structuredClone(once);
      resign.phase = 'resign';
      resign.players[rostered.pid].rfa = { tid: 3, qo: 5_000, sheet };
      expect(migrate(resign).players[rostered.pid].rfa).toEqual({ tid: 3, qo: 5_000 });
    }

    // loads a save from before talks, stretched dead money, the new exceptions and 10-day contracts
    {
      const l = testLeague('before');
      // (opening night's signings can use an exception: a save from before had none)
      for (const t of l.teams) {
        delete t.roomSeason;
        delete t.baeSeason;
      }
      const back = migrate(JSON.parse(JSON.stringify(l)) as League);
      expect(Object.values(back.players).some((p) => p.talks || p.tenDays || p.contract.tenDay)).toBe(false);
      expect(back.teams.some((t) => t.roomSeason !== undefined || t.baeSeason !== undefined || t.deadMoney.some((d) => d.stretched))).toBe(false);
    }

    // keeps sound talks, 10-day contracts, stretched dead money and exception seasons, and drops damaged ones
    {
      const l = testLeague('damaged');
      const fa = Object.values(l.players).filter((p) => p.tid === -1);
      const mine = Object.values(l.players).filter((p) => p.tid === l.userTid);
      const [a, b, c, d, e] = fa;
      a.talks = { ...talks(l), closed: { season: l.season, day: l.day + 3 } };
      b.talks = { ...talks(l), patience: 9 };
      c.talks = { ...talks(l), counter: { amount: 4_000, years: 0 } };
      d.talks = { ...talks(l), kind: 'trade' as never };
      e.talks = { ...talks(l), tid: 99 };
      // (c and d: counts out of shape, from before they were kept by team)
      a.tenDays = { season: l.season, by: { 3: 2, 7: 1 } };
      b.tenDays = { season: l.season, by: { 3: 3 } };
      c.tenDays = { tid: 3, season: l.season, n: 2 } as never;
      d.tenDays = { tid: 99, season: l.season, n: 1 } as never;
      e.tenDays = { season: l.season, by: { 99: 1 } };
      mine[0].contract.tenDay = { until: l.day + 5, hardship: true };
      mine[1].contract.tenDay = { until: l.day + 5, hardship: 'yes' as never };
      const t = l.teams[l.userTid];
      t.deadMoney = [
        { pid: -1, name: 'Stretched', season: l.season, amount: 1_000, stretched: true },
        { pid: -2, name: 'Bad flag', season: l.season, amount: 1_000, stretched: 'yes' as never },
      ];
      t.roomSeason = l.season;
      t.baeSeason = 'x' as never;
      l.inbox[0].tenDay = mine[0].pid;
      l.inbox[1].tenDay = 'x' as never;
      const once = migrate(l);
      const by = (pid: number) => once.players[pid];
      expect(by(a.pid).talks).toEqual({ ...talks(l), closed: { season: l.season, day: l.day + 3 } });
      expect([b, c, d, e].map((p) => by(p.pid).talks)).toEqual([undefined, undefined, undefined, undefined]);
      expect([a, b, c, d, e].map((p) => by(p.pid).tenDays)).toEqual([{ season: l.season, by: { 3: 2, 7: 1 } }, undefined, undefined, undefined, undefined]);
      expect([by(mine[0].pid).contract.tenDay, by(mine[1].pid).contract.tenDay]).toEqual([{ until: l.day + 5, hardship: true }, undefined]);
      expect(once.teams[l.userTid].deadMoney.map((x) => x.stretched)).toEqual([true, undefined]);
      expect([once.teams[l.userTid].roomSeason, once.teams[l.userTid].baeSeason]).toEqual([l.season, undefined]);
      expect([once.inbox[0].tenDay, once.inbox[1].tenDay]).toEqual([mine[0].pid, undefined]);
      expect(migrate(structuredClone(once))).toEqual(once);
      // a 10-day contract doesn't outlive the regular season
      const later = structuredClone(once);
      later.phase = 'playoffs';
      expect(migrate(later).players[mine[0].pid].contract.tenDay).toBeUndefined();
    }

    // keeps sound traded player exceptions, Bird clocks, releases and taxpayer mid-level seasons, and drops damaged ones
    {
      const l = testLeague('cba');
      const [a, b, c, d] = Object.values(l.players).filter((p) => p.tid === l.userTid);
      a.birdSince = l.season - 2;
      b.birdSince = 'long ago' as never;
      c.released = { tid: 3, season: l.season };
      d.released = { tid: 99, season: l.season };
      const t = l.teams[l.userTid];
      t.tpes = [
        { amount: 8_000, season: l.season, day: 30 },
        { amount: -5, season: l.season, day: 30 },
        { amount: 2_000, season: 'x' as never, day: 1 },
      ];
      t.taxMleSeason = l.season;
      l.teams[2].tpes = [{ amount: 0, season: l.season, day: 1 }];
      l.teams[3].taxMleSeason = 'x' as never;
      const once = migrate(JSON.parse(JSON.stringify(l)) as League);
      const by = (pid: number) => once.players[pid];
      expect([by(a.pid).birdSince, by(b.pid).birdSince]).toEqual([l.season - 2, undefined]);
      expect([by(c.pid).released, by(d.pid).released]).toEqual([{ tid: 3, season: l.season }, undefined]);
      expect(once.teams[l.userTid].tpes).toEqual([{ amount: 8_000, season: l.season, day: 30 }]);
      expect(once.teams[l.userTid].taxMleSeason).toBe(l.season);
      expect(once.teams[2].tpes).toBeUndefined();
      expect(once.teams[3].taxMleSeason).toBeUndefined();
      expect(migrate(structuredClone(once))).toEqual(once);
    }

    // keeps only #rrggbb team colours, which the screens put in styles as they are
    {
      const l = testLeague('colours');
      const real = [...l.teams[0].colors];
      // closes a gradient early and pulls in a remote image (Settings' team picker writes `${colour}55`)
      l.teams[0].colors = ['#fff, #fff), url(https://evil.example/t.png), linear-gradient(#ff', '#000000', '#ffffff'];
      (l.teams[1] as { colors: string[] }).colors = l.teams[1].colors.slice(0, 2);
      const back = migrate(l);
      expect(back.teams[0].colors).toEqual(real);
      expect(back.teams[1].colors).toEqual(FRANCHISES[1].colors);
      expect(back.teams[2].colors).toEqual(FRANCHISES[2].colors);
    }

    // keeps a team's tactic slots, familiarity and practice focus in shape, and drops damaged ones
    {
      const l = testLeague('system');
      const t = l.teams[l.userTid];
      t.slots = { active: 1, names: ['Main', 'Small ball', 'Plan C'], stored: [structuredClone(t.tactics), null, null] };
      t.prep = 'opponent';
      t.tactics.mentality = 2;
      t.tactics.offense.shape = 'fiveOut';
      t.tactics.defense.roles = { [Object.values(l.players).find((p) => p.tid === l.userTid)!.pid]: 'poa' };
      const back = migrate(JSON.parse(JSON.stringify(l)));
      expect(back.teams[l.userTid].slots?.active).toBe(1);
      expect(back.teams[l.userTid].prep).toBe('opponent');
      expect(back.teams[l.userTid].tactics.mentality).toBe(2);
      expect(back.teams[l.userTid].tactics.offense.shape).toBe('fiveOut');
      const bad = JSON.parse(JSON.stringify(l)) as League;
      const bt = bad.teams[l.userTid] as unknown as Record<string, unknown>;
      bt.slots = { active: 5, names: [], stored: [] };
      bt.prep = 'yoga';
      bt.fam = { opt: { 'pnr:drop': 'lots' } };
      (bt.tactics as Record<string, unknown>).mentality = 9;
      (bt.tactics as { offense: Record<string, unknown> }).offense.shape = 'diamond';
      (bt.tactics as { defense: Record<string, unknown> }).defense.roles = { 1: 'goalie' };
      const fixed = migrate(bad).teams[l.userTid];
      expect(fixed.slots).toBeUndefined();
      expect(fixed.prep).toBeUndefined();
      expect(fixed.tactics.mentality).toBeUndefined();
      expect(fixed.tactics.offense.shape).toBeUndefined();
      expect(fixed.tactics.defense.roles).toBeUndefined();
      expect(Object.values(fixed.fam!.opt).every((v) => typeof v === 'number')).toBe(true);
    }

    // reads every team's tactics in real and fictional saves as they are
    {
      const real = testLeague('tactics as saved');
      for (let i = 0; i < 4; i++) simDay(real);
      // the user's own: a situational plan, a set package, an after-timeout play, hack-a targets
      const mine = real.teams[real.userTid].tactics;
      mine.situations = [{ id: 's1', label: 'Protect a lead', enabled: true, when: { fromQ: 4, maxClock: 300, minLead: 1 }, patch: { offense: { pace: 30 } } }];
      mine.offense.sets = ['horns', 'spain'];
      mine.manage.ato = 'horns';
      mine.manage.hackTargets = [Number(Object.keys(real.players)[0])];
      for (const l of [real, fictional]) {
        const file = JSON.parse(JSON.stringify(l)) as League;
        const tactics = file.teams.map((t) => structuredClone(t.tactics));
        expect(migrate(file).teams.map((t) => t.tactics)).toEqual(tactics);
        expect(migrate(structuredClone(l)).teams.map((t) => t.tactics)).toEqual(l.teams.map((t) => t.tactics));
      }
    }

    // rebuilds tactics out of shape from the defaults, keeping what is in shape, so the league plays on
    {
      const l = testLeague('hollow tactics');
      const [a, b, c] = [1, 2, 4].map((k) => (l.userTid + k) % l.teams.length);
      const file = JSON.parse(JSON.stringify(l));
      // hollowed out, partly damaged (the sliders and roles it still has stay), and missing altogether
      file.teams[a].tactics = { offense: {}, defense: {}, manage: {} };
      Object.assign(file.teams[b].tactics.offense, { pace: 77, screeners: 'x', roles: null });
      file.teams[b].tactics.manage.hackTargets = 5;
      file.teams[b].tactics.situations = [{ id: 'broken' }];
      const roles = file.teams[c].tactics.offense.roles;
      file.teams[c].tactics.defense.matchups = [];
      file.teams[c].tactics.offense.actions = { pnr: 'lots' };
      file.teams[(l.userTid + 5) % l.teams.length].tactics = null;
      const back = migrate(file);
      const tb = back.teams[b].tactics;
      expect([tb.offense.pace, tb.offense.screeners, tb.offense.roles, tb.manage.hackTargets, tb.situations]).toEqual([77, [], {}, undefined, undefined]);
      expect(back.teams[c].tactics.offense.roles).toEqual(roles);
      expect(back.teams[c].tactics.defense.matchups).toEqual({});
      expect(Object.values(back.teams[c].tactics.offense.actions).every((v) => typeof v === 'number')).toBe(true);
      expect(back.teams[a].tactics).toMatchObject({ offense: { roles: {}, freedom: {}, screeners: [] }, defense: { matchups: {} }, manage: { timeoutRun: 8 } });
      // every game those teams are in is played (the assistants fill in the roles first)
      for (let i = 0; i < 8; i++) simDay(back);
      expect(back.games.length).toBeGreaterThan(l.games.length);
      expect(Object.keys(back.teams[a].tactics.offense.roles).length).toBeGreaterThan(0);
    }
  });
});
