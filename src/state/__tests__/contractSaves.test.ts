// Saves and the contract rules added with talks, the stretch provision, the room and bi-annual
// exceptions and 10-day contracts: all optional, so older saves load as they are, and damaged
// values are dropped by migrate.
import { describe, expect, it } from 'vitest';
import { migrate } from '../persistence';
import type { League, Talks } from '../../core/types';
import { testLeague } from './fixtures';

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

describe('contract saves', () => {
  it('loads a save from before talks, stretched dead money, the new exceptions and 10-day contracts', () => {
    const l = testLeague('before');
    // (opening night's signings can use an exception: a save from before had none)
    for (const t of l.teams) {
      delete t.roomSeason;
      delete t.baeSeason;
    }
    const back = migrate(JSON.parse(JSON.stringify(l)) as League);
    expect(Object.values(back.players).some((p) => p.talks || p.tenDays || p.contract.tenDay)).toBe(false);
    expect(back.teams.some((t) => t.roomSeason !== undefined || t.baeSeason !== undefined || t.deadMoney.some((d) => d.stretched))).toBe(false);
  });

  it('keeps sound talks, 10-day contracts, stretched dead money and exception seasons, and drops damaged ones', () => {
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
  });

  it('keeps sound traded player exceptions, Bird clocks, releases and taxpayer mid-level seasons, and drops damaged ones', () => {
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
  });
});
