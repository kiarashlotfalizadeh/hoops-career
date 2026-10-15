// Keys to the game: three numbers for tonight read from the games before it, the same on the
// pre-game screen, in the live game and in the stored result, graded with the result.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import { clearLive, prepareLive } from '../../state/live';
import { migrate } from '../../state/persistence';
import { userGameOnDay } from '../league/games';
import { simDay } from '../league/season';
import { gameKeys, gradeKey, keyState, keyValue } from '../analysis/keys';
import type { GameResult } from '../types';

afterEach(() => clearLive());

describe('keys to the game', () => {
  it('on opening night come from the other coach and his roster: three at most, never two on one number', () => {
    const l = testLeague('keys-open');
    const g = userGameOnDay(l, l.day) ?? l.schedule.find((x) => !x.played && (x.home === l.userTid || x.away === l.userTid))!;
    const keys = gameKeys(l, g);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBeLessThanOrEqual(3);
    expect(new Set(keys.map((k) => `${k.side}:${k.stat}`)).size).toBe(keys.length);
    for (const k of keys) {
      expect(k.target).toBeGreaterThan(0);
      expect(k.goal).toMatch(/\d/);
      expect(k.why.length).toBeGreaterThan(5);
    }
    // only the user's games have keys
    const other = l.schedule.find((x) => x.home !== l.userTid && x.away !== l.userTid)!;
    expect(gameKeys(l, other)).toEqual([]);
  });

  it('read the season once there are games, stay put through the day, and are graded with the result as the preview set them', () => {
    const l = testLeague('keys-season', 5);
    for (let i = 0; i < 30; i++) simDay(l);
    toGameDay(l);
    const g = userGameOnDay(l, l.day)!;
    const before = gameKeys(l, g);
    expect(before.length).toBe(3);
    // the season's own numbers name a rank or a scorer's average
    expect(before.some((k) => /of 30|a game/.test(k.why))).toBe(true);
    // the day's other games (played before the live game) don't move them
    const lg = prepareLive(l)!;
    expect(gameKeys(l, g)).toEqual(before);
    lg.simTo('end');
    const res = lg.commit(l);
    expect(res.keys?.map((k) => k.goal)).toEqual(before.map((k) => k.goal));
    for (const [i, k] of before.entries()) {
      const v = keyValue(k, res, lg.userSide);
      expect(res.keys![i].value).toBe(v);
      if (v !== null) expect(res.keys![i].met).toBe(k.dir === 'max' ? v <= k.target : v >= k.target);
    }
  });

  it('say where a key stands live: decided early, on pace, behind, and void for a player who sat', () => {
    const max = { dir: 'max' as const, target: 10 };
    const min = { dir: 'min' as const, target: 27 };
    expect(keyState(max, 11, 0.5, false)).toBe('missed');
    expect(keyState(max, 4, 0.5, false)).toBe('on');
    expect(keyState(max, 7, 0.5, false)).toBe('behind');
    expect(keyState(max, 10, 1, true)).toBe('met');
    expect(keyState(min, 27, 0.7, false)).toBe('met');
    expect(keyState(min, 10, 0.5, false)).toBe('behind');
    expect(keyState(min, 14, 0.5, false)).toBe('on');
    expect(keyState(min, 26, 1, true)).toBe('missed');
    expect(keyState(max, null, 1, true)).toBe('void');
    // a scorer who didn't play: no verdict
    const res = { home: { players: [{ pid: 9, min: 0, pts: 0 }] }, away: { players: [] } } as unknown as GameResult;
    const grade = gradeKey(
      { id: 'star', title: 'Make him work', goal: 'Hold him to 24 points or fewer', why: '', side: 'them', stat: 'pts', pid: 9, dir: 'max', target: 24 },
      res,
      1,
    );
    expect(grade).toMatchObject({ value: null, met: null });
  });

  it('read the offensive glass as a share of the misses, never decided before the end', () => {
    const box = (orb: number, drb: number) => ({ t: { orb, drb }, players: [] });
    const res = { home: box(9, 30), away: box(12, 36) } as unknown as GameResult;
    // the user is home: his 9 offensive rebounds of the 9 + 36 chances on his misses
    expect(keyValue({ side: 'us', stat: 'orb' }, res, 0)).toBe(20);
    expect(keyValue({ side: 'them', stat: 'orb' }, res, 0)).toBe(29);
    const glass = { dir: 'max' as const, target: 27, stat: 'orb' as const };
    expect(keyState(glass, 29, 0.25, false)).toBe('behind');
    expect(keyState(glass, 25, 0.25, false)).toBe('on');
    expect(keyState(glass, 29, 1, true)).toBe('missed');
    const grade = gradeKey(
      { id: 'glass', title: 'Keep them off the glass', goal: 'Hold BOS to 27% of their misses or fewer', why: '', side: 'them', stat: 'orb', dir: 'max', target: 27 },
      res,
      0,
    );
    expect(grade).toMatchObject({ value: 29, met: false, pct: true });
  });

  it('a damaged list in a save goes', () => {
    const l = testLeague('keys-save');
    for (let i = 0; i < 6; i++) simDay(l);
    const mine = l.games.filter((g) => g.keys);
    expect(mine.length).toBeGreaterThan(0);
    const copy = structuredClone(l);
    const [a, b] = copy.games.filter((g) => g.keys);
    (a.keys as unknown[])[0] = { id: 'x', title: 3 };
    const keep = structuredClone(b.keys);
    const back = migrate(copy);
    expect(back.games.find((g) => g.gid === a.gid)!.keys).toBeUndefined();
    expect(back.games.find((g) => g.gid === b.gid)!.keys).toEqual(keep);
  });
});
