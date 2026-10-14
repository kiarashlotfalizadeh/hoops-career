// The post-game recap's data: the standings move kept with the user's regular-season results (set
// before the first save and kept by it), quotes that read the same every time without touching the
// league's random stream, and a press conference that moves the user's locker room once per game.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { testLeague, userGames } from '../../state/__tests__/fixtures';
import { loadLeague, saveLeague } from '../../state/persistence';
import { simDay } from '../league/season';
import { buildGameReport } from '../analysis/gameReport';
import { holdPress, isLatestUserGame, postGameQuotes, pressEffects, pressOpen, pressOptions, streakAfter } from '../analysis/quotes';
import { curTeamSeason } from '../league/helpers';
import type { League } from '../types';

function played(name: string, days: number): League {
  const l = testLeague(name);
  for (let i = 0; i < days; i++) simDay(l);
  return l;
}

describe('post-game stakes', () => {
  const l = played('stakes', 30);

  it("only the user's regular-season games carry the standings move", () => {
    for (const g of l.games) {
      const mine = g.home.tid === l.userTid || g.away.tid === l.userTid;
      expect(!!g.stakes, `game ${g.gid}`).toBe(mine && g.type === 'regular');
    }
    expect(userGames(l).length).toBeGreaterThan(5);
  });

  it('a win never puts the team further back, a loss never brings it closer', () => {
    for (const g of userGames(l)) {
      const s = g.stakes!;
      const us = g.home.tid === l.userTid ? g.home : g.away;
      const won = us.pts > (us === g.home ? g.away : g.home).pts;
      if (won) expect(s.after.gb).toBeLessThanOrEqual(s.before.gb);
      else expect(s.after.gb).toBeGreaterThanOrEqual(s.before.gb);
      expect(s.tid).toBe(l.userTid);
    }
    // the latest game's line is where the team stands now
    const last = userGames(l).at(-1)!.stakes!.after;
    expect(last.rank).toBeGreaterThan(0);
  });

  it('survives a save and a reload', async () => {
    await saveLeague(l);
    const back = (await loadLeague(l.id))!;
    expect(userGames(back).map((g) => g.stakes)).toEqual(userGames(l).map((g) => g.stakes));
    expect(userGames(back).every((g) => g.stakes)).toBe(true);
  });
});

describe('post-game quotes and the press conference', () => {
  it('quotes are the same every time for a game and draw nothing from the league', () => {
    const l = played('quotes', 20);
    const rng = l.rng;
    for (const g of userGames(l)) {
      const a = postGameQuotes(l, g, buildGameReport(l, g));
      const b = postGameQuotes(l, g, buildGameReport(l, g));
      expect(a).toEqual(b);
      expect(a.length).toBe(2);
      expect(a[0].tid).toBe(l.userTid);
      expect(a[1].tid).not.toBe(l.userTid);
      for (const q of a) expect(q.text.length).toBeGreaterThan(10);
    }
    expect(l.rng).toBe(rng);
    // not the user's game: nothing to say
    const other = l.games.find((g) => g.home.tid !== l.userTid && g.away.tid !== l.userTid)!;
    expect(postGameQuotes(l, other)).toEqual([]);
  });

  it('names the teammate hurt in the game, told apart from one with the same last name', () => {
    const l = played('hurt', 10);
    const g = structuredClone(userGames(l).at(-1)!);
    const us = g.home.tid === l.userTid ? g.home : g.away;
    const voice = postGameQuotes(l, g)[0].pid;
    const other = us.players.find((b) => b.min > 0 && b.pid !== voice)!;
    const p = l.players[other.pid];
    const line = (who: string) => [{ q: 2, clock: 300, t: (us === g.home ? 0 : 1) as 0 | 1, text: `${who} ${p.lastName} is injured and leaves the game.`, hs: 0, as: 0 }];
    g.pbp = line(`${p.firstName.slice(0, 3)}.`);
    expect(postGameQuotes(l, g)[0].text).toContain(p.lastName);
    // another player of that name (not ours) was the one hurt
    g.pbp = line('Zz.');
    expect(postGameQuotes(l, g)[0].text).not.toContain(p.lastName);
  });

  it("the streak after a game matches the team's record after the latest one", () => {
    const l = played('streak', 25);
    const last = userGames(l)
      .filter((g) => g.type === 'regular')
      .at(-1)!;
    expect(streakAfter(l, last)).toBe(curTeamSeason(l, l.userTid).streak);
  });

  it("the press conference moves only the user's players, once, for the latest game", () => {
    const l = played('press', 12);
    const games = userGames(l);
    const last = games.at(-1)!;
    expect(isLatestUserGame(l, last)).toBe(true);
    expect(pressOpen(l, games[0])).toBe(false);
    expect(holdPress(l, games[0], 'group')).toBeNull();
    const us = last.home.tid === l.userTid ? last.home : last.away;
    const lost = us.pts < (us === last.home ? last.away : last.home).pts;
    expect(pressOptions(l, last).some((o) => o.id === 'challenge')).toBe(lost);
    const before = Object.fromEntries(Object.values(l.players).map((p) => [p.pid, p.mood.score]));
    const rng = l.rng;
    const choice = lost ? 'challenge' : 'pog';
    const fx = holdPress(l, last, choice)!;
    expect(fx.length).toBeGreaterThan(0);
    expect(fx).toEqual(pressEffects(l, last, choice));
    for (const p of Object.values(l.players)) {
      const d = Math.round((p.mood.score - before[p.pid]) * 10) / 10;
      const e = fx.find((x) => x.pid === p.pid);
      if (!e) expect(d, `${p.pid}`).toBe(0);
      else {
        expect(p.tid).toBe(l.userTid);
        expect(Math.abs(e.delta)).toBeGreaterThanOrEqual(0.2);
        expect(Math.abs(e.delta)).toBeLessThanOrEqual(0.6);
        // (a mood at the scale's end can't move past it)
        if (Math.abs(before[p.pid]) < 9.4) expect(d).toBeCloseTo(e.delta, 6);
      }
    }
    expect(l.press).toEqual({ gid: last.gid, choice });
    expect(l.rng).toBe(rng);
    // once per game
    const after = Object.fromEntries(Object.values(l.players).map((p) => [p.pid, p.mood.score]));
    expect(pressOpen(l, last)).toBe(false);
    expect(holdPress(l, last, 'group')).toBeNull();
    expect(Object.fromEntries(Object.values(l.players).map((p) => [p.pid, p.mood.score]))).toEqual(after);
  });
});
