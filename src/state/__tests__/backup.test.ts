// Backups: the whole league with its results, written gzipped in the current format and checked and cleaned before an import is stored (plain JSON backups too).
// (A backup made mid-draft or in free agency is in flow.test.ts, on the season played there.)
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupDue, exportLeague, importLeague, UnsavedLeagueError } from '../backup';
import { loadLeague, SAVE_VERSION } from '../persistence';
import { useStore } from '../store';
import { simDay } from '../../core/league/season';
import { userGameOnDay } from '../../core/league/games';
import { checkpointLive, prepareLive } from '../live';
import type { League } from '../../core/types';
import { testLeague, toGameDay } from './fixtures';

const backup = (l: unknown, name = 'backup.json') => new File([JSON.stringify(l)], name, { type: 'application/json' });

function played(name: string): League {
  const l = testLeague(name);
  for (let i = 0; i < 3; i++) simDay(l);
  return l;
}

const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/** Export with the browser's download parts stubbed out; returns the file it wrote, as written and its name. */
async function download(l: League): Promise<File> {
  let file: Blob | undefined;
  const a = { download: '', click() {}, remove() {} };
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('document', { createElement: () => a, body: { appendChild() {} } });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    file = b as Blob;
    return 'blob:backup';
  });
  expect(await exportLeague(l)).toBe(true);
  return new File([file!], a.download, { type: file!.type });
}

const gunzip = (f: Blob) => new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();

/** Export with the browser's download parts stubbed out; returns the league in the file it wrote. */
async function exported(l: League): Promise<unknown> {
  return JSON.parse(await gunzip(await download(l)));
}

/** Each scenario starts with no league open and nothing mocked. */
function fresh() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useStore.getState().setLeague(null);
}

afterEach(fresh);

describe('backups', () => {
  it(
    'import stores the league and its results, checked and cleaned; export writes it in the current format, as far as a game in progress has got',
    { timeout: 120_000 },
    async () => {
      // import stores the league and every result, and keeps a league already on the device
      const l = played('import');
      const first = await importLeague(backup(l));
      expect(first.id).toBe(l.id);
      expect((await loadLeague(l.id))!.games).toEqual(JSON.parse(JSON.stringify(l.games)));
      const copy = await importLeague(backup(l));
      expect(copy.id).not.toBe(l.id);
      expect(copy.name).toBe('import (imported)');
      expect((await loadLeague(copy.id))!.games).toHaveLength(l.games.length);
      expect((await loadLeague(l.id))!.name).toBe('import');

      // drops inbox links that are not in-app routes (crafted backups)
      const evil = played('evil');
      evil.inbox.unshift({
        id: 1e6,
        season: evil.season,
        day: 0,
        from: 'Owner',
        subject: 'Contract offer',
        body: 'Tap to review',
        read: false,
        link: 'javascript:void(document.title="PWNED")',
      });
      const cleaned = await importLeague(backup(evil));
      expect(cleaned.inbox[0].link).toBeUndefined();
      expect((await loadLeague(cleaned.id))!.inbox[0].link).toBeUndefined();

      // a league exported mid-game plays on after import, picked up where it was exported
      const states = testLeague('states');
      toGameDay(states);
      useStore.getState().setLeague(states);
      useStore.getState().mutate((x) => void prepareLive(x)!.simTo('quarter'));
      // (as Export does: the game in progress goes in as far as it has got)
      checkpointLive(states);
      const live = await importLeague(backup(states));
      expect(live).toEqual(JSON.parse(JSON.stringify({ ...states, id: live.id, name: live.name })));
      useStore.getState().setLeague(live);
      const lg = prepareLive(live)!;
      expect(lg.game.gid).toBe(userGameOnDay(states, states.day)!.gid);
      // at the end of the first quarter, where it was exported
      expect([lg.resumed, lg.sim.q, lg.sim.clock <= 0.05, [lg.sim.T[0].score, lg.sim.T[1].score]]).toEqual(['journal', 1, true, states.live!.score]);
      lg.commit(live);
      expect(live.games.filter((g) => g.gid === lg.game.gid)).toHaveLength(1);
      expect(live.schedule.filter((g) => g.day < live.day && !g.played)).toEqual([]);
      fresh();

      // a crafted backup cannot reach the prototypes of the objects it is read into
      const proto = played('proto');
      const plant = (o: object) => {
        Object.defineProperty(o, '__proto__', { value: { polluted: true }, enumerable: true });
        Object.defineProperty(o, 'constructor', { value: { prototype: { polluted: true } }, enumerable: true });
      };
      const p = Object.values(proto.players).find((x) => x.tid === proto.userTid)!;
      [proto, proto.settings, proto.teams[proto.userTid], proto.teams[proto.userTid].tactics, proto.teams[proto.userTid].rotation, p, p.ratings, proto.games[0]].forEach(plant);
      const planted = await importLeague(backup(proto));
      useStore.getState().setLeague(planted);
      await useStore.getState().simulate({ kind: 'days', n: 3 });
      useStore.getState().mutate((x) => (x.name = 'saved again'));
      await useStore.getState().save();
      await loadLeague(planted.id);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
      expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
      expect(useStore.getState().league!.day).toBe(proto.day + 3);
      fresh();

      // refuses files that are not backups, too big, or from a newer version
      await expect(importLeague(new File(['{"nope"'], 'x.json'))).rejects.toThrow('not a Hoops Career backup');
      await expect(importLeague(backup({ id: 'x', teams: [] }))).rejects.toThrow('not a Hoops Career backup');
      const huge = backup({});
      Object.defineProperty(huge, 'size', { value: 65 * 1024 * 1024 });
      await expect(importLeague(huge)).rejects.toThrow('too big');
      await expect(importLeague(backup({ ...played('newer'), version: SAVE_VERSION + 1 }))).rejects.toThrow('newer version');

      // waits for a running sim, and keeps an open league whose changes could not be saved
      const open = played('open');
      useStore.getState().setLeague(open);
      useStore.setState({ sim: { label: 'Simulating', done: 1, total: 7 } });
      await expect(importLeague(backup(played('other')))).rejects.toThrow('simulation');
      useStore.setState({ sim: null });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
        throw quotaError();
      });
      useStore.getState().mutate((x) => (x.name = 'renamed'));
      await expect(importLeague(backup(played('other')))).rejects.toThrow('Export a backup');
      await expect(importLeague(backup(played('other')))).rejects.toBeInstanceOf(UnsavedLeagueError);
      expect(useStore.getState().league).toBe(open);
      // a file that isn't a backup says so first
      await expect(importLeague(backup({ id: 'x', teams: [] }))).rejects.toThrow('not a Hoops Career backup');
      // offered an export and told to go ahead, it imports without saving the open league first
      vi.mocked(IDBObjectStore.prototype.put).mockImplementation(function (this: IDBObjectStore, ...args) {
        if (JSON.stringify(args[0] ?? null).includes('"renamed"')) throw quotaError();
        return put.apply(this, args);
      });
      const other = await importLeague(backup(played('other')), { force: true });
      expect(await loadLeague(other.id)).toMatchObject({ id: other.id });
      fresh();

      // says so when the device has no room for the import
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
        throw quotaError();
      });
      await expect(importLeague(backup(played('full')))).rejects.toThrow('Device storage is full. Free up some space, then import again.');
      fresh();

      // export writes a league that was never saved in the current format, so an older build refuses it
      const unsaved = testLeague('fresh');
      expect(await exported(unsaved)).toMatchObject({ id: unsaved.id, version: SAVE_VERSION, lastBackup: { season: unsaved.season } });
      // the file says it's a backup, and so does the league from then on (an import of the file too)
      expect(unsaved.lastBackup).toEqual({ at: expect.any(Number), season: unsaved.season });
      fresh();

      // the file is gzipped JSON, a few times smaller, and imports as the plain file does (every
      // import above is of a plain one, as backups were before); where the browser can't compress, plain JSON
      {
        const l = played('gzip');
        const gz = await download(l);
        const plain = JSON.stringify({ ...l, version: SAVE_VERSION, lastBackup: l.lastBackup });
        expect([gz.name, gz.type, [...new Uint8Array(await gz.slice(0, 2).arrayBuffer())]]).toEqual([`hoops-career-gzip-${l.season}.json.gz`, 'application/gzip', [0x1f, 0x8b]]);
        expect(gz.size).toBeLessThan(plain.length / 4);
        const back = await importLeague(gz);
        expect(back).toEqual(await importLeague(backup(JSON.parse(plain))).then((x) => ({ ...x, id: back.id, name: back.name })));
        // a damaged one isn't a backup; one that unpacks to more than any league is too big
        await expect(importLeague(new File([(await gz.arrayBuffer()).slice(0, 200)], 'cut.json.gz'))).rejects.toThrow('not a Hoops Career backup');
        const bomb = new Response(new Blob([new Uint8Array(65 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream('gzip')));
        await expect(importLeague(new File([await bomb.arrayBuffer()], 'bomb.json.gz'))).rejects.toThrow('too big');
        fresh();
        vi.stubGlobal('CompressionStream', undefined);
        const old = await download(testLeague('no gzip'));
        expect([old.name.endsWith('.json'), JSON.parse(await old.text()).name]).toEqual([true, 'no gzip']);
        fresh();
      }

      // a cancelled share sheet is no backup
      {
        const l = testLeague('cancelled');
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')) });
        expect(await exportLeague(l)).toBe(false);
        expect(l.lastBackup).toBeUndefined();
        fresh();
      }

      // Today asks once a season, from the league's second on, until a backup or a "not now" that season
      {
        const l = testLeague('ask');
        expect(backupDue(l)).toBe(false);
        l.season++;
        expect(backupDue(l)).toBe(true);
        l.backupAsked = l.season;
        expect(backupDue(l)).toBe(false);
        l.season++;
        expect(backupDue(l)).toBe(true);
        l.lastBackup = { at: Date.now(), season: l.season };
        expect(backupDue(l)).toBe(false);
        // where the browser may clear the saves (no persistent storage), from a month into the first season
        const first = testLeague('unkept');
        expect([backupDue(first, false), backupDue(first, true)]).toEqual([false, false]);
        first.day = 30;
        expect([backupDue(first, false), backupDue(first, true)]).toEqual([true, false]);
        first.backupAsked = first.season;
        expect(backupDue(first, false)).toBe(false);
      }

      // exporting the open league mid-game brings its save on the device as far as the file
      const mid = testLeague('export live');
      toGameDay(mid);
      useStore.getState().setLeague(mid);
      let game: ReturnType<typeof prepareLive> = null;
      useStore.getState().mutate((x) => void (game = prepareLive(x)));
      await useStore.getState().save();
      // played on, with no break, pause or move to bring the journal up to date
      for (let i = 0; i < 25; i++) game!.step();
      expect(((await exported(mid)) as League).live?.steps).toBe(game!.steps);
      // the app is then closed: what it saves on the way has the game where the file has it, and the backup noted
      await useStore.getState().flush();
      const disk = (await loadLeague(mid.id))!;
      expect([disk.live?.steps, disk.lastBackup?.season]).toEqual([game!.steps, mid.season]);
    },
  );
});
