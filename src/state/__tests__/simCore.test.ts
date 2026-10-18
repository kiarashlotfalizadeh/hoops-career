// The sim worker's bookkeeping for results: only what the other side lacks crosses over, and a list
// rebuilt from a delta is the list it was made from, through a season's added games and the new
// season's copies without their play-by-play.
import { describe, expect, it } from 'vitest';
import { applyGames, diffGames, gamesSig, runSim, runTask, withoutGames } from '../simCore';
import { testLeague } from './fixtures';

describe('results across the thread boundary', () => {
  it('sends only the games added since, and rebuilds the same list from them', async () => {
    const l = testLeague('delta');
    await runSim(l, { kind: 'days', n: 3 });
    const sent = gamesSig(l.games);
    // (a sim adds to the same list: keep a copy of it as it was)
    const before = l.games.slice();
    await runSim(l, { kind: 'days', n: 4 });
    const d = diffGames(sent, l.games);
    expect(d.keep).toBe(before.length);
    expect(d.tail.length).toBe(l.games.length - before.length);
    expect(applyGames(before, d).map((g) => g.gid)).toEqual(l.games.map((g) => g.gid));
  });

  it('a list the other side has never seen goes whole', async () => {
    const l = testLeague('fresh');
    await runSim(l, { kind: 'days', n: 1 });
    expect(l.games.length).toBeGreaterThan(0);
    expect(diffGames(null, l.games)).toEqual({ keep: 0, tail: l.games });
  });

  it('a game that dropped its play-by-play is sent again, and so is everything after it', () => {
    const l = testLeague('pbp');
    const games = [
      { ...l.games[0], gid: 1, pbp: ['a'] },
      { ...l.games[0], gid: 2, pbp: ['b'] },
      { ...l.games[0], gid: 3 },
    ] as unknown as typeof l.games;
    const sig = gamesSig(games);
    const after = [games[0], { ...games[1], pbp: undefined }, games[2]];
    const d = diffGames(sig, after);
    expect(d.keep).toBe(1);
    expect(d.tail.map((g) => g.gid)).toEqual([2, 3]);
    expect(applyGames(games, d)[1].pbp).toBeUndefined();
  });

  it('a phase change hands back a league whose results line up with what it was given', async () => {
    const l = testLeague('task');
    await runSim(l, { kind: 'days', n: 1 });
    const core = withoutGames(l);
    expect(core.games).toEqual([]);
    expect(l.games).not.toEqual([]);
    const r = runTask(l, { kind: 'faAdvance', days: 1 });
    // (no-op outside free agency, but it still reports)
    expect(r).toEqual({ done: true });
  });
});
