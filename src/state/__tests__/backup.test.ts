// Backups: the whole league with its results, written in the current format and checked and cleaned before an import is stored.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportLeague, importLeague } from '../backup';
import { loadLeague, SAVE_VERSION } from '../persistence';
import { useStore } from '../store';
import { faAdvance, finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency } from '../../core/league/season';
import { nextPick } from '../../core/league/draft';
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

  it('a league exported mid-game, mid-draft or in free agency plays on after import', { timeout: 180_000 }, async () => {
    const l = testLeague('states');
    /** What Export writes, read back the way Import reads it. */
    const roundTrip = async () => {
      const back = await importLeague(backup(l));
      expect(back).toEqual(JSON.parse(JSON.stringify({ ...l, id: back.id, name: back.name })));
      return back;
    };
    toGameDay(l);
    useStore.getState().setLeague(l);
    useStore.getState().mutate((x) => void prepareLive(x)!.simTo('quarter'));
    // (as Export does: the game in progress goes in as far as it has got)
    checkpointLive(l);
    const live = await roundTrip();
    useStore.getState().setLeague(live);
    const lg = prepareLive(live)!;
    expect(lg.game.gid).toBe(userGameOnDay(l, l.day)!.gid);
    // picked up at the end of the first quarter, where it was exported
    expect([lg.resumed, lg.sim.q, lg.sim.clock <= 0.05, [lg.sim.T[0].score, lg.sim.T[1].score]]).toEqual(['journal', 1, true, l.live!.score]);
    lg.commit(live);
    expect(live.games.filter((g) => g.gid === lg.game.gid)).toHaveLength(1);
    expect(live.schedule.filter((g) => g.day < live.day && !g.played)).toEqual([]);
    useStore.getState().setLeague(null);

    for (let i = 0; i < 400 && l.phase !== 'draftLottery'; i++) simDay(l);
    startDraft(l);
    const draft = await roundTrip();
    expect(finishDraftPhase(draft)).toBe(true);
    expect(draft.phase).toBe('resign');
    expect(nextPick(draft)).toBeUndefined();

    finishDraftPhase(l);
    startFreeAgency(l);
    faAdvance(l, 3);
    const fa = await roundTrip();
    faAdvance(fa, 7);
    expect(fa.faDay).toBe(10);
    expect(newSeason(fa)).toBe(true);
    expect(fa.phase).toBe('preseason');
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
    // a file that isn't a backup says so first
    await expect(importLeague(backup({ id: 'x', teams: [] }))).rejects.toThrow('not a Hoops Career backup');
  });

  it('says so when the device has no room for the import', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    await expect(importLeague(backup(played('full')))).rejects.toThrow('Device storage is full. Free up some space, then import again.');
  });
});

describe('export', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes a league that was never saved in the current format, so an older build refuses it', async () => {
    const l = testLeague('fresh');
    let file: Blob | undefined;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('document', { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      file = b as Blob;
      return 'blob:backup';
    });
    expect(await exportLeague(l)).toBe(true);
    expect(JSON.parse(await file!.text())).toMatchObject({ id: l.id, version: SAVE_VERSION });
  });

  it('exporting the open league mid-game brings its save on the device as far as the file', async () => {
    const l = testLeague('export live');
    toGameDay(l);
    useStore.getState().setLeague(l);
    let lg: ReturnType<typeof prepareLive> = null;
    useStore.getState().mutate((x) => void (lg = prepareLive(x)));
    await useStore.getState().save();
    // played on, with no break, pause or move to bring the journal up to date
    for (let i = 0; i < 25; i++) lg!.step();
    let file: Blob | undefined;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('document', { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      file = b as Blob;
      return 'blob:backup';
    });
    expect(await exportLeague(l)).toBe(true);
    expect((JSON.parse(await file!.text()) as League).live?.steps).toBe(lg!.steps);
    // the app is then closed: what it saves on the way has the game where the file has it
    await useStore.getState().flush();
    expect((await loadLeague(l.id))!.live?.steps).toBe(lg!.steps);
  });
});
