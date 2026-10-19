// The post-game recap's data: the standings move kept with the user's regular-season results (set
// before the first save and kept by it), and quotes that read the same every time without touching
// the league's random stream.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { testLeague, userGames } from '../../state/__tests__/fixtures';
import { loadLeague, saveLeague } from '../../state/persistence';
import { simDay } from '../league/season';
import { buildGameReport, IMPACT_TEXT, impactSentence } from '../analysis/gameReport';
import { isLatestUserGame, postGameQuotes, recapFacts, streakAfter } from '../analysis/quotes';
import { curTeamSeason } from '../league/helpers';
import { migrate } from '../../state/persistence';
import type { GameResult, League } from '../types';

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

describe('post-game quotes', () => {
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
    const other = us.players.find((b) => b.min > 0 && b.pid !== voice && !g.hurt!.includes(b.pid))!;
    const p = l.players[other.pid];
    // kept with the result as it was recorded: whoever it names
    expect(postGameQuotes(l, { ...g, hurt: [other.pid] })[0].text).toContain(p.lastName);
    // an older result, read from the play-by-play
    delete g.hurt;
    delete g.wpLow;
    const ours = (us === g.home ? 0 : 1) as 0 | 1;
    const line = (who: string, t = ours) => [{ q: 2, clock: 300, t, text: `${who} ${p.lastName} is injured and leaves the game.`, hs: 0, as: 0 }];
    g.pbp = line(`${p.firstName.slice(0, 3)}.`);
    expect(postGameQuotes(l, g)[0].text).toContain(p.lastName);
    // another player of that name (not ours) was the one hurt: a teammate told apart, or theirs
    g.pbp = line('Zz.');
    expect(postGameQuotes(l, g)[0].text).not.toContain(p.lastName);
    g.pbp = line('', (1 - ours) as 0 | 1);
    expect(postGameQuotes(l, g)[0].text).not.toContain(p.lastName);
  });

  it("a game's quotes read the same once it isn't the latest, and once its flow is gone", () => {
    const l = played('same', 8);
    // what they read is kept with each of the user's results, and only theirs
    for (const g of l.games) {
      const mine = g.home.tid === l.userTid || g.away.tid === l.userTid;
      expect(g.hurt !== undefined, `game ${g.gid}`).toBe(mine);
      if (!mine) continue;
      const us = g.home.tid === l.userTid ? g.home : g.away;
      for (const pid of g.hurt!) expect(us.players.find((b) => b.pid === pid)!.min).toBeGreaterThan(0);
      expect(recapFacts(g, g.hurt!)).toEqual({ hurt: g.hurt, ...(g.wpLow !== undefined ? { wpLow: g.wpLow } : {}) });
    }
    const g = userGames(l).at(-1)!;
    const quotes = (res: GameResult) => postGameQuotes(l, res, buildGameReport(l, res));
    const before = quotes(g);
    // a teammate who played picks up a fresh injury after it: still not one he got in this game
    const us = g.home.tid === l.userTid ? g.home : g.away;
    const mate = us.players.find((b) => b.min > 0 && b.pid !== before[0].pid && !g.hurt!.includes(b.pid))!;
    l.players[mate.pid].injury = { type: 'Sprained Ankle', gamesRemaining: 6, gamesTotal: 6, severity: 'moderate' };
    expect(quotes(g)).toEqual(before);
    l.players[mate.pid].injury = null;
    // newer games, then a new season taking the flow and play-by-play (see newSeason)
    for (let i = 0; i < 5; i++) simDay(l);
    expect(isLatestUserGame(l, g)).toBe(false);
    const bare: GameResult = { ...g, pbp: undefined, shots: undefined, flow: undefined, flowPeriods: undefined, flowT: undefined, flowPoss: undefined };
    expect(quotes(bare)).toEqual(before);
  });

  it('an upset loss reads as one, and a loss to a much better team does not', () => {
    const l = played('upset', 30);
    const games = userGames(l).filter((g) => g.type === 'regular');
    const last = games.at(-1)!;
    const at = l.games.indexOf(last);
    const opp = last.home.tid === l.userTid ? last.away.tid : last.home.tid;
    const quotes = (userBetter: boolean) => {
      const m = structuredClone(l);
      // every game before it: the user's team wins them all and they lose them all, or the other way round
      for (const g of m.games.slice(0, at)) {
        if (g.type !== 'regular') continue;
        for (const [tid, wins] of [
          [m.userTid, userBetter],
          [opp, !userBetter],
        ] as const) {
          const side = g.home.tid === tid ? g.home : g.away.tid === tid ? g.away : null;
          if (!side) continue;
          const other = side === g.home ? g.away : g.home;
          if (side.pts > other.pts !== wins) [side.pts, other.pts] = [other.pts, side.pts];
        }
      }
      // tonight they win by ten, and nothing else stands out: nobody hurt, no comeback, no 30-point night
      const g = m.games[at];
      const us = g.home.tid === m.userTid ? g.home : g.away;
      const them = us === g.home ? g.away : g.home;
      [us.pts, them.pts] = [100, 110];
      for (const b of [...us.players, ...them.players]) b.pts = Math.min(b.pts, 20);
      g.hurt = [];
      delete g.wpLow;
      for (const p of Object.values(m.players)) if (p.tid === m.userTid) p.injury = null;
      return postGameQuotes(m, g).map((q) => q.text);
    };
    expect(games.length).toBeGreaterThan(11);
    const [voice, coach] = quotes(true);
    expect(voice).toMatch(/can't take anybody lightly|wanted it more/);
    expect(coach).toMatch(/counted us out|gave us a chance/);
    for (const q of quotes(false)) expect(q).not.toMatch(/can't take anybody lightly|wanted it more|counted us out|gave us a chance/);
  });

  it("the streak after a game matches the team's record after the latest one", () => {
    const l = played('streak', 25);
    const last = userGames(l)
      .filter((g) => g.type === 'regular')
      .at(-1)!;
    expect(isLatestUserGame(l, last)).toBe(true);
    expect(streakAfter(l, last)).toBe(curTeamSeason(l, l.userTid).streak);
  });

  it('what the quotes read survives a save, and a damaged one goes', () => {
    const l = played('facts', 6);
    const copy = structuredClone(l);
    const [a, b] = userGames(copy);
    a.hurt = ['x'] as unknown as number[];
    a.wpLow = 3;
    const keep = { hurt: b.hurt, wpLow: b.wpLow };
    const back = migrate(copy);
    const ga = back.games.find((g) => g.gid === a.gid)!;
    expect([ga.hurt, ga.wpLow]).toEqual([undefined, undefined]);
    const gb = back.games.find((g) => g.gid === b.gid)!;
    expect({ hurt: gb.hurt, wpLow: gb.wpLow }).toEqual(keep);
  });
});

describe('post-game report', () => {
  it('names the teams an effect helped and hurt as given, never "you" (their game plan can be the one it beat)', () => {
    for (const key of Object.keys(IMPACT_TEXT)) {
      const s = impactSentence(key, 'the Aces', 'the Bees', ' (Smith)');
      expect(s, key).not.toMatch(/\byou(r)?\b/i);
      expect(s, key).toMatch(/the Aces|the Bees/i);
    }
    expect(impactSentence('pd_under:o', 'the Knicks', 'the Celtics')).toBe('The Knicks made the Celtics pay for going under screens with pull-up jumpers.');
    expect(impactSentence('pd_body:o', 'your team', 'the opposition')).toBe("Your team drew fouls against the opposition's physical defense.");
  });
});
