// Sets in a saved live game and in saves: an after-timeout set and a set package are journaled and
// played back exactly after the app was closed, and reading a save keeps only the sets this version
// knows (an unknown one in tactics or a result is dropped).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkpointLive, pendingLive, prepareLive, type LiveGame } from '../live';
import { useStore } from '../store';
import { loadLeague, migrate } from '../persistence';
import type { League } from '../../core/types';
import { testLeague, toGameDay } from './fixtures';

function goLive(l: League): LiveGame {
  useStore.getState().setLeague(l);
  let lg: LiveGame | null = null;
  useStore.getState().mutate((x) => (lg = prepareLive(x)));
  if (!lg) throw new Error('no live game');
  return lg;
}

/** A live game coached with sets: a package and an after-timeout set, and timeouts to run it. */
function setsGame(l: League): LiveGame {
  const lg = goLive(l);
  const play = (n: number) => {
    for (let i = 0; i < n && !lg.over; i++) lg.step();
  };
  play(10);
  const t = lg.sim.baseTactics(lg.userSide);
  t.offense.sets = ['floppy', 'spain', 'hammer'];
  t.manage.ato = 'elevator';
  lg.setTactics(t);
  play(15);
  expect(lg.callTimeout()).toBe(true);
  play(8);
  lg.callTimeout();
  play(6);
  lg.simTo('half');
  play(9);
  return lg;
}

beforeEach(() => useStore.getState().setLeague(null));

describe('sets in a live game', () => {
  it('are journaled and played back exactly after the app was closed', async () => {
    const l = testLeague('sets-journal');
    toGameDay(l);
    const lg = setsGame(l);
    // the game ran sets (its package, the after-timeout play)
    expect(lg.logs.filter((x) => x.set && x.off === lg.userSide).length).toBeGreaterThan(1);
    await useStore.getState().flush();
    const back = (await loadLeague(l.id))!;
    useStore.getState().setLeague(back);
    expect(pendingLive(back)).toBeNull();
    const again = prepareLive(back)!;
    expect(again.resumed).toBe('journal');
    expect(again.sim.result()).toEqual(lg.sim.result());
    expect(again.logs).toEqual(lg.logs);
    expect(again.sim.setReads(again.userSide)).toEqual(lg.sim.setReads(lg.userSide));
    expect(again.commit(back)).toEqual(lg.commit(l));
  });

  it('reading a save keeps the sets this version knows and drops the rest', () => {
    const l = testLeague('sets-read');
    toGameDay(l);
    const lg = setsGame(l);
    checkpointLive(l);
    const saved = JSON.parse(JSON.stringify(l)) as League;
    expect(migrate(structuredClone(saved)).live).toEqual(saved.live);
    // tactics: unknown sets go, the package keeps four at most and each once; a damaged after-timeout play goes
    const z = structuredClone(saved);
    const ut = z.teams[z.userTid].tactics as unknown as { offense: Record<string, unknown>; manage: Record<string, unknown> };
    ut.offense.sets = ['flex', 'floppy', 'floppy', 'spain', 'horns', 'hammer', 'chicago'];
    ut.manage.ato = 'flex';
    ut.manage.atoPid = 'x';
    const ai = z.teams[(z.userTid + 1) % z.teams.length].tactics as unknown as { offense: Record<string, unknown>; manage: Record<string, unknown> };
    ai.offense.sets = 'floppy';
    ai.manage.ato = 'spain';
    const m = migrate(z);
    expect(m.teams[m.userTid].tactics.offense.sets).toEqual(['floppy', 'spain', 'horns', 'hammer']);
    expect(m.teams[m.userTid].tactics.manage.ato).toBeUndefined();
    expect(m.teams[m.userTid].tactics.manage.atoPid).toBeUndefined();
    expect(m.teams[(m.userTid + 1) % m.teams.length].tactics.offense.sets).toBeUndefined();
    expect(m.teams[(m.userTid + 1) % m.teams.length].tactics.manage.ato).toBe('spain');
    // a result's set tallies in shape, or dropped
    const res = lg.commit(l);
    expect(res.sets!.length).toBeGreaterThan(0);
    const w = JSON.parse(JSON.stringify(l)) as League;
    const g = w.games.find((r) => r.gid === res.gid)!;
    expect(migrate(structuredClone(w)).games.find((r) => r.gid === res.gid)!.sets).toEqual(res.sets);
    Object.assign(g.sets![0], { id: 'flex' });
    expect(migrate(w).games.find((r) => r.gid === res.gid)!.sets).toBeUndefined();
  });
});
