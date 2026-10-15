// Around the league: the night's other games tick along with the user's live game, each tipping at
// its home team's local time and read from its quarters, the ones that matter to the user first.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import { clearLive, prepareLive } from '../../state/live';
import { simDay } from '../../core/league/season';
import { broadcastTime, otherGames, scoreAt, tipLabel, tipMinute, type OtherGame } from '../live/scoreboard';
import type { GameResult } from '../../core/types';

afterEach(() => clearLive());

const game = (home: number[], away: number[], offset = 0): OtherGame => ({
  res: {
    gid: 1,
    home: { tid: 0, quarters: home, pts: home.reduce((a, b) => a + b, 0) },
    away: { tid: 1, quarters: away, pts: away.reduce((a, b) => a + b, 0) },
  } as unknown as GameResult,
  offset,
});

describe('around the league', () => {
  it('tips each game at its home team’s local 7:00 or 7:30, in Eastern time', () => {
    const l = testLeague('sb-tips');
    const tid = (ab: string) => l.teams.find((t) => t.abbrev === ab)!.tid;
    expect(tipMinute(l, tid('BOS'), 2)).toBe(0);
    expect(tipMinute(l, tid('BOS'), 3)).toBe(30);
    expect(tipMinute(l, tid('SAS'), 2)).toBe(60);
    expect(tipMinute(l, tid('DEN'), 2)).toBe(120);
    expect(tipMinute(l, tid('LAL'), 3)).toBe(210);
    expect(tipLabel(0)).toBe('7:00 PM');
    expect(tipLabel(210)).toBe('10:30 PM');
  });

  it('counts the breaks on the broadcast clock: two minutes between quarters, fifteen at the half', () => {
    expect(broadcastTime(0)).toBe(0);
    expect(broadcastTime(720)).toBe(720);
    expect(broadcastTime(721)).toBe(720 + 43 + 1);
    expect(broadcastTime(1441)).toBe(1440 + 43 + 320 + 1);
  });

  it('reads a game from its quarters: not yet on, its periods and breaks in order, never above its final, and final at the end', () => {
    const g = game([30, 25, 28, 22], [20, 30, 26, 27]);
    expect(scoreAt(game([30], [20], 30), 100).state).toBe('pre');
    const at = (t: number) => scoreAt(g, t);
    expect(at(360)).toMatchObject({ state: 'live', q: 1, clock: 360, score: [15, 10] });
    // tipped together, both are in the 2nd after the user's first quarter; one that tipped half a minute later is still at its break
    expect(at(721)).toMatchObject({ state: 'live', q: 2 });
    expect(scoreAt(game([30, 25, 28, 22], [20, 30, 26, 27], 0.5), 721)).toMatchObject({ state: 'break', q: 1, score: [30, 20] });
    // the user's game at the start of the 3rd: the other one (same tip) too, past its halftime
    expect(at(1441).state).toBe('live');
    expect(at(1441).q).toBe(3);
    let last: [number, number] = [0, 0];
    for (let t = 0; t <= 2880; t += 30) {
      const s = at(t).score;
      expect(s[0] >= last[0] && s[1] >= last[1]).toBe(true);
      expect(s[0] <= 105 && s[1] <= 103).toBe(true);
      last = s;
    }
    expect(at(2880)).toMatchObject({ state: 'final', score: [105, 103] });
    // a game that started an hour earlier ends before the user's does
    expect(scoreAt(game([30, 25, 28, 22], [20, 30, 26, 27], -60), 1800).state).toBe('final');
    // overtime, and the night over once the user's game is
    const ot = game([25, 25, 25, 25, 10], [25, 25, 25, 25, 8]);
    expect(scoreAt(ot, 2700).state).toBe('live');
    expect(scoreAt(ot, 0, true)).toMatchObject({ state: 'final', ot: 1, score: [110, 108] });
  });

  it("lists the night's other games once they're played, the ones that matter to the user first", () => {
    const l = testLeague('sb-night', 3);
    for (let i = 0; i < 25; i++) simDay(l);
    toGameDay(l);
    const lg = prepareLive(l)!;
    const list = otherGames(l, lg.game.gid, lg.game.day, l.userTid);
    const day = l.games.filter((g) => g.day === lg.game.day && g.season === l.season);
    expect(list.length).toBe(day.length);
    expect(list.every((o) => o.res.gid !== lg.game.gid)).toBe(true);
    const firstPlain = list.findIndex((o) => !o.why);
    if (firstPlain >= 0) expect(list.slice(firstPlain).every((o) => !o.why)).toBe(true);
  });
});
