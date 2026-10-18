// IndexedDB saves: results in their own store written incrementally, revisions that stop a stale
// window from overwriting a newer save, and the checks that run on every league read.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteLeague, isLeague, listLeagues, loadLeague, migrate, OldSaveError, onRemoteChange, SAVE_VERSION, saveLeague } from '../persistence';
import { simDay } from '../../core/league/season';
import { createLeague, defaultSettings } from '../../core/league/create';
import { FRANCHISES } from '../../core/teams';
import type { League } from '../../core/types';
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

  it('a save that fails halfway leaves the last one whole, and the next save catches up', async () => {
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
  });

  it('lists every league with its latest record, newest first', async () => {
    const a = await saved('list a', 0);
    const b = await saved('list b', 3);
    const metas = await listLeagues();
    expect(metas.findIndex((m) => m.id === b.id)).toBeLessThan(metas.findIndex((m) => m.id === a.id));
    const ts = b.teams[b.userTid].seasons.find((s) => s.season === b.season)!;
    expect(metas.find((m) => m.id === b.id)).toMatchObject({ name: 'list b', phase: 'regular', season: b.season, record: `${ts.won}-${ts.lost}` });
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
  });
});

describe('a connection the browser dropped', () => {
  /** Safari can lose an idle connection without a close event: the next transaction finds it closed. */
  const dropConnection = () =>
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      this.close();
      return transaction.apply(this, args);
    });

  it('is opened again for the saved-leagues list, loading, saving and deleting', async () => {
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

  it('keeps saves without trade offers as they are, and drops offers whose players or picks are gone', () => {
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
  });

  it('keeps sound pick swaps, cash in trades and promises to players, and drops damaged ones', () => {
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
    const [a, b, c, d] = Object.values(l.players).filter((p) => p.tid === l.userTid);
    a.promise = { kind: 'role', tid: l.userTid, season: l.season, day: 3, request: true, minutes: 30 };
    a.meeting = { season: l.season, day: 3 };
    b.promise = { kind: 'trade', tid: l.userTid, season: l.season, day: 3, request: true } as never;
    c.promise = { kind: 'bribe', tid: l.userTid, season: l.season, day: 3, request: true } as never;
    c.meeting = { season: l.season, day: 'soon' } as never;
    d.meeting = { season: l.season, day: 4, broken: l.season };
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
    expect([a.promise?.kind, b.promise, c.promise, c.meeting, d.meeting?.broken]).toEqual(['role', undefined, undefined, undefined, l.season]);
    expect(back.transactions![0].sides).toEqual([
      { tid: 0, players: [], picks: [], cash: 2_500, swaps: [y] },
      { tid: 1, players: [], picks: [] },
    ]);
    // and again changes nothing
    expect(migrate(structuredClone(back))).toEqual(back);
  });

  it('keeps restricted free agency in shape: damaged rights or offer sheets, or ones out of their phase, are dropped, and so are inbox links that aren’t a player', () => {
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
  });

  it('keeps only #rrggbb team colours, which the screens put in styles as they are', () => {
    const l = testLeague('colours');
    const real = [...l.teams[0].colors];
    // closes a gradient early and pulls in a remote image (Settings' team picker writes `${colour}55`)
    l.teams[0].colors = ['#fff, #fff), url(https://evil.example/t.png), linear-gradient(#ff', '#000000', '#ffffff'];
    (l.teams[1] as { colors: string[] }).colors = l.teams[1].colors.slice(0, 2);
    const back = migrate(l);
    expect(back.teams[0].colors).toEqual(real);
    expect(back.teams[1].colors).toEqual(FRANCHISES[1].colors);
    expect(back.teams[2].colors).toEqual(FRANCHISES[2].colors);
  });

  it('turns away saves from before the redesign (format 4) with a clear reason', () => {
    const l = testLeague('before the redesign');
    const old = JSON.parse(JSON.stringify({ ...l, version: 3 })) as League;
    expect(() => migrate(old)).toThrow(OldSaveError);
    const unversioned = JSON.parse(JSON.stringify(l)) as Partial<League>;
    delete unversioned.version;
    expect(() => migrate(unversioned)).toThrow(/older version/);
    expect(migrate(JSON.parse(JSON.stringify(l))).version).toBe(SAVE_VERSION);
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

  it("reads every team's tactics in real and fictional saves as they are", () => {
    const real = testLeague('tactics as saved');
    for (let i = 0; i < 4; i++) simDay(real);
    // the user's own: a situational plan, a set package, an after-timeout play, hack-a targets
    const mine = real.teams[real.userTid].tactics;
    mine.situations = [{ id: 's1', label: 'Protect a lead', enabled: true, when: { fromQ: 4, maxClock: 300, minLead: 1 }, patch: { offense: { pace: 30 } } }];
    mine.offense.sets = ['horns', 'spain'];
    mine.manage.ato = 'horns';
    mine.manage.hackTargets = [Number(Object.keys(real.players)[0])];
    const fictional = createLeague({ name: 'f', userTid: 3, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 1 });
    for (const l of [real, fictional]) {
      const file = JSON.parse(JSON.stringify(l)) as League;
      const tactics = file.teams.map((t) => structuredClone(t.tactics));
      expect(migrate(file).teams.map((t) => t.tactics)).toEqual(tactics);
      expect(migrate(structuredClone(l)).teams.map((t) => t.tactics)).toEqual(l.teams.map((t) => t.tactics));
    }
  });

  it('rebuilds tactics out of shape from the defaults, keeping what is in shape, so the league plays on', () => {
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
  });
});
