// The latest live game's highlights stay in the save for its game report, until the next live game.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from './fixtures';
import { clearLive, prepareLive } from '../live';
import { migrate } from '../persistence';
import { simDay } from '../../core/league/season';
import { REEL_MAX } from '../../core/analysis/highlights';

afterEach(() => clearLive());

describe("a live game's highlights", () => {
  it('are kept with the save once the game is recorded, without their play-by-play, and replaced by the next live game', () => {
    const l = testLeague('reel');
    toGameDay(l);
    const lg = prepareLive(l)!;
    lg.simTo('end');
    lg.commit(l);
    const reel = l.reel!;
    expect(reel.gid).toBe(lg.game.gid);
    expect(reel.plays.length).toBeGreaterThan(0);
    expect(reel.plays.length).toBeLessThanOrEqual(REEL_MAX);
    for (const p of reel.plays) {
      expect(p.log.lines).toEqual([]);
      expect(p.before).toHaveLength(2);
    }
    // through a save round trip, whole; damaged, gone
    expect(migrate(structuredClone(l)).reel).toEqual(reel);
    const bad = structuredClone(l);
    (bad.reel!.plays[0].log as { on: unknown }).on = [[1, 2]];
    expect(migrate(bad).reel).toBeUndefined();
    // a simmed game leaves it be; the next live game takes its place
    simDay(l);
    toGameDay(l);
    const next = prepareLive(l)!;
    next.simTo('end');
    next.commit(l);
    expect(l.reel!.gid).toBe(next.game.gid);
  });
});
