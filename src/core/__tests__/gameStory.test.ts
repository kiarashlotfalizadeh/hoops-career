// A game as a story (gameStory.ts): headlines for crafted results (a comeback, overtime, a rout, a
// buzzer-beater, streaks, series states), the billing of games ahead (a rivalry, a revenge game,
// Christmas Day, Game 7), the user's games written into the news, and none of it drawing from the
// league's random stream or changing a game.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague, userGames } from '../../state/__tests__/fixtures';
import { simDay, startRegularSeason } from '../league/season';
import { createLeague, defaultSettings } from '../league/create';
import { billingsFor, christmasDay, gameStoryFor, rivalryOf, RIVALRY, storyGame } from '../analysis/gameStory';
import { streakAfter } from '../analysis/quotes';
import type { GameResult, League, ScheduledGame } from '../types';

function played(name: string, days: number): League {
  const l = testLeague(name);
  for (let i = 0; i < days; i++) simDay(l);
  return l;
}

const side = (l: League, g: GameResult) => (g.home.tid === l.userTid ? g.home : g.away);
const other = (l: League, g: GameResult) => (g.home.tid === l.userTid ? g.away : g.home);

/**
 * A plain night: no play-by-play or flow (so no late shot to find), no overtime, no big leads, a
 * modest scorer, an eight-point result the user's way (or not), no projection kept.
 */
function plain(l: League, g: GameResult, won: boolean) {
  delete g.pbp;
  delete g.flow;
  delete g.flowT;
  delete g.edge;
  delete g.cup;
  g.ot = 0;
  const us = side(l, g);
  const them = other(l, g);
  us.pts = won ? 110 : 102;
  them.pts = won ? 102 : 110;
  us.extra.biggestLead = them.extra.biggestLead = 4;
  for (const b of [...us.players, ...them.players]) b.pts = Math.min(b.pts, 18);
  // (the quarters say where it was won: an even night)
  us.quarters = [27, 27, 28, us.pts - 82];
  them.quarters = [26, 26, 25, them.pts - 77];
}

describe('game stories', () => {
  let base: League;
  beforeAll(() => {
    base = played('story', 24);
  }, 120_000);
  /** A copy of the league with the user's `n`th game (from the end) changed by `fn`. */
  const craft = (fn: (l: League, g: GameResult) => void, n = 1) => {
    const l = structuredClone(base);
    // (the press's story of the game as played would stand in for the crafted one's)
    l.news = l.news.filter((x) => x.kind !== 'game');
    const g = userGames(l).at(-n)!;
    fn(l, g);
    return { l, g, story: gameStoryFor(l, g.gid)! };
  };

  it('every game of the user has a story, the same every time, and none for other teams from his side', () => {
    const rng = base.rng;
    for (const g of userGames(base)) {
      const a = gameStoryFor(base, g.gid)!;
      expect(a, `game ${g.gid}`).toBeTruthy();
      expect(a).toEqual(gameStoryFor(base, g.gid));
      expect(a.head.length).toBeGreaterThan(8);
      expect(a.dek.length).toBeGreaterThan(8);
      expect(a.body.split('\n\n').length).toBeGreaterThanOrEqual(2);
      expect([1, 2, 3]).toContain(a.weight);
      expect(a.means.length).toBeLessThanOrEqual(4);
      expect(a.won).toBe(side(base, g).pts > other(base, g).pts);
      expect(side(base, g).players.some((b) => b.pid === a.hero)).toBe(true);
    }
    const theirs = base.games.find((g) => g.home.tid !== base.userTid && g.away.tid !== base.userTid)!;
    expect(gameStoryFor(base, theirs.gid)).toBeNull();
    expect(base.rng).toBe(rng);
  });

  it('a comeback, overtime and a rout each lead their headline', () => {
    const comeback = craft((l, g) => {
      plain(l, g, true);
      other(l, g).extra.biggestLead = 19;
    }).story;
    expect(comeback.head).toMatch(/19/);
    expect(comeback.head).toMatch(/deficit|down/);
    expect(comeback.weight).toBeGreaterThanOrEqual(2);

    const ot = craft((l, g) => {
      plain(l, g, true);
      g.ot = 2;
    }).story;
    expect(ot.head).toMatch(/double overtime/);

    const rout = craft((l, g) => {
      plain(l, g, true);
      side(l, g).pts = 135;
    }).story;
    expect(rout.head).toMatch(/rout|blow out|off the floor/);

    const routed = craft((l, g) => {
      plain(l, g, false);
      other(l, g).pts = 130;
    }).story;
    expect(routed.won).toBe(false);
    expect(routed.head).toMatch(/rout/);
  });

  it('a shot at the buzzer names the shooter and makes the front page', () => {
    let last = '';
    let crafted: GameResult | undefined;
    const { story } = craft((l, g) => {
      plain(l, g, true);
      const us = side(l, g);
      // tied at 107 with half a minute left, then his three as time ran out: 110-107
      other(l, g).pts = 107;
      const shooter = [...us.players].sort((a, b) => b.min - a.min)[0];
      last = l.players[shooter.pid].lastName;
      const homeUs = g.home === us;
      const score = (ours: number, theirs: number) => (homeUs ? { hs: ours, as: theirs } : { hs: theirs, as: ours });
      g.pbp = [
        { q: 4, clock: 31, t: homeUs ? 0 : 1, text: 'Someone layup — good.', ...score(107, 105), kind: 'make' },
        { q: 4, clock: 30, t: homeUs ? 1 : 0, text: 'Other jumper — good.', ...score(107, 107), kind: 'make' },
        { q: 4, clock: 0.3, t: homeUs ? 0 : 1, text: `${last} pull-up three — good.`, ...score(110, 107), kind: 'make' },
      ];
      crafted = g;
    });
    expect(story.head).toContain(last);
    expect(story.head).toMatch(/buzzer|horn/);
    expect(story.body).toMatch(/at the buzzer/);
    // a story on an ordinary night; the front page on a big one (Christmas Day)
    expect(story.weight).toBe(2);
    const g = userGames(base).at(-1)!;
    const xmas = structuredClone(base);
    xmas.news = xmas.news.filter((x) => x.kind !== 'game');
    const xg = userGames(xmas).at(-1)!;
    Object.assign(xg, structuredClone(crafted!));
    xg.day = christmasDay(xmas.season);
    expect(xg.gid).toBe(g.gid);
    expect(gameStoryFor(xmas, xg.gid)!.weight).toBe(3);
  });

  it('a losing streak ended, a winning streak extended, and the chip agrees with the streak on record', () => {
    // the four before it lost, this one won: the skid ends
    const ended = craft((l, g) => {
      const mine = userGames(l).filter((x) => x.type === 'regular');
      plain(l, mine.at(-6)!, true);
      for (const x of mine.slice(-5, -1)) plain(l, x, false);
      plain(l, g, true);
    }).story;
    expect(ended.head).toMatch(/4-game (skid|losing streak)/);
    expect(ended.means).toContain('Ended a 4-game skid');

    const run = craft((l, g) => {
      const mine = userGames(l).filter((x) => x.type === 'regular');
      plain(l, mine.at(-7)!, false);
      for (const x of mine.slice(-6, -1)) plain(l, x, true);
      plain(l, g, true);
    });
    expect(run.story.head).toMatch(/6 straight|6 in a row|6th straight/);
    expect(run.story.means).toContain('6th straight win');
    expect(streakAfter(run.l, run.g)).toBe(6);
  });

  it('series states: a 3-1 lead, Game 7 forced, a Game 7 won, eliminated', () => {
    /** The user's last `results.length` games as a playoff series (true a win), the last one the game told. */
    const series = (results: boolean[]) =>
      craft((l) => {
        const mine = userGames(l).slice(-results.length);
        mine.forEach((x, i) => {
          plain(l, x, results[i]);
          x.type = 'playoffs';
          x.seriesId = 'E2-0';
          delete x.stakes;
        });
      }).story;
    const lead = series([true, false, true, true]);
    expect(lead.head).toMatch(/3-1|within a win/);
    expect(lead.means).toContain('Lead the series 3-1');
    expect(lead.kicker).toBe('East Semifinals · Game 4');

    // a loss that leaves the user ahead isn't "falling behind"; a win that leaves him behind isn't "a lead"
    const missed = series([true, true, false, true, false]);
    expect(missed.won).toBe(false);
    expect(missed.head).toMatch(/3-2|close out/);
    expect(missed.head).not.toMatch(/behind/);
    expect(missed.means).toContain('Lead the series 3-2');
    const cut = series([false, false, true]);
    expect(cut.head).toMatch(/2-1/);
    expect(cut.head).not.toMatch(/lead over|go up/);
    expect(cut.means).toContain('Trail the series 2-1');

    const forced = series([true, false, false, true, false, true]);
    expect(forced.head).toMatch(/force Game 7/);
    expect(forced.means).toContain('Series tied 3-3');
    // (a story: the front page waits for Game 7 itself)
    expect(forced.weight).toBe(2);

    const won7 = series([true, false, false, true, false, true, true]);
    expect(won7.head).toMatch(/Game 7/);
    expect(won7.kicker).toBe('Game 7');
    expect(won7.means).toContain('Won the series 4-3');

    const out = series([false, false, true, false, false]);
    expect(out.won).toBe(false);
    expect(out.head).toMatch(/season|eliminated|Season over/);
    expect(out.means).toContain('Lost the series 4-1');
    expect(out.weight).toBe(3);
  });

  it('two games in a row in the same category never share a headline shape', () => {
    // the two latest made into the same plain win: the template rotates
    const { l } = craft((l, g) => {
      plain(l, g, true);
      plain(l, userGames(l).at(-2)!, true);
    });
    const [a, b] = userGames(l).slice(-2);
    const shape = (gid: number) => gameStoryFor(l, gid)!.head.replace(/[A-Z][a-z]+|\d+/g, 'X');
    expect(shape(a.gid)).not.toBe(shape(b.gid));
  });
});

describe('the front page', () => {
  /** The user's front-page game stories in a regular season played through. */
  const frontPages = (l: League) => {
    while (l.phase === 'regular') simDay(l);
    return l.news.filter((n) => n.kind === 'game' && n.tids[0] === l.userTid && n.weight === 3 && n.day <= l.regularSeasonDays);
  };

  it("is rare in a regular season: a handful of the user's nights, a real league and a fictional one", () => {
    const real = frontPages(testLeague('front'));
    expect(real.length).toBeGreaterThanOrEqual(1);
    expect(real.length, real.map((n) => n.head).join(' | ')).toBeLessThanOrEqual(8);
    const fic = createLeague({ name: 'fiction', userTid: 3, coachName: 'c', settings: { ...defaultSettings(), stopOnNews: false }, seed: null, rngSeed: 21 });
    if (startRegularSeason(fic).length) return;
    const made = frontPages(fic);
    expect(made.length, made.map((n) => n.head).join(' | ')).toBeLessThanOrEqual(8);
  }, 180_000);
});

describe('the news', () => {
  it("writes each of the user's games as a story, and only his", () => {
    const l = played('news', 20);
    // (the press's stories of other teams' games are media.ts's)
    const stories = l.news.filter((n) => n.kind === 'game' && n.tids[0] === l.userTid);
    expect(stories.length).toBe(userGames(l).length);
    for (const n of stories) {
      expect(n.tids[0]).toBe(l.userTid);
      expect(n.head).toBeTruthy();
      expect(n.body?.includes('\n\n')).toBe(true);
      expect([1, 2, 3]).toContain(n.weight);
    }
    // the report reads the story the press ran
    const g = userGames(l).at(-1)!;
    const s = gameStoryFor(l, g.gid)!;
    expect(s.newsId).toBe(stories.at(-1)!.id);
    expect(s.head).toBe(stories.at(-1)!.head);
  });

  it('touches nothing but the news and never the random stream', () => {
    const l = played('pure', 12);
    const g = userGames(l).at(-1)!;
    const before = structuredClone(l);
    // (once the story is in, another call is a no-op)
    l.news = l.news.filter((n) => n.kind !== 'game' || n.day !== g.day);
    before.news = structuredClone(l.news);
    const sg: ScheduledGame = { gid: g.gid, day: g.day, home: g.home.tid, away: g.away.tid, type: g.type, played: true };
    storyGame(l, sg);
    storyGame(l, sg);
    expect(l.news.length).toBe(before.news.length + 1);
    const { news: _a, nextMsgId: _b, ...rest } = l;
    const { news: _c, nextMsgId: _d, ...restBefore } = before;
    void _a;
    void _b;
    void _c;
    void _d;
    expect(rest).toEqual(restBefore);
  });

  it('the same seed plays the same games and writes the same stories', () => {
    const a = played('same', 10);
    const b = played('same', 10);
    expect(b.games.map((g) => [g.home.pts, g.away.pts])).toEqual(a.games.map((g) => [g.home.pts, g.away.pts]));
    const heads = (x: League) => x.news.filter((n) => n.kind === 'game' && n.tids[0] === x.userTid).map((n) => n.head);
    expect(heads(b)).toEqual(heads(a));
    expect(b.rng).toBe(a.rng);
  });
});

describe('billing', () => {
  let l: League;
  beforeAll(() => {
    l = played('billing', 6);
  }, 120_000);
  const upcoming = (lg: League) => lg.schedule.filter((g) => !g.played && g.type === 'regular' && (g.home === lg.userTid || g.away === lg.userTid)).sort((a, b) => a.day - b.day);
  const byAbbrev = (lg: League, ab: string) => lg.teams.find((t) => t.abbrev === ab)!.tid;

  /** `n` close meetings of the user's team with `opp` added to last season's results. */
  const closeGames = (lg: League, opp: number, n: number) => {
    const tmpl = userGames(lg)[0];
    for (let i = 0; i < n; i++) {
      const g = structuredClone(tmpl);
      g.gid = 800000 + i;
      g.season = lg.season - 1;
      g.type = 'regular';
      g.home.tid = opp;
      g.away.tid = lg.userTid;
      g.home.pts = 101;
      g.away.pts = 99;
      lg.games.unshift(g);
    }
  };

  it('a name is not a rivalry: Brooklyn and New York need heat to be billed as one', () => {
    // (the test league's user team is the Knicks)
    expect(l.teams[l.userTid].abbrev).toBe('NYK');
    const bkn = byAbbrev(l, 'BKN');
    // (an old division rivalry, but no playoff series between them in the real league's last spring)
    expect(rivalryOf(l, l.userTid, bkn).hot).toBe(false);
    const g = upcoming(l).find((x) => x.home === bkn || x.away === bkn)!;
    expect(billingsFor(l, g, l.userTid, { light: true }).map((x) => x.tag)).not.toContain('Rivalry');
    // three close meetings make it one
    const lg = structuredClone(l);
    closeGames(lg, bkn, 3);
    const r = rivalryOf(lg, lg.userTid, bkn);
    expect(r.hot).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(RIVALRY);
    expect(billingsFor(lg, g, lg.userTid, { light: true })).toContainEqual(expect.objectContaining({ tag: 'Rivalry', weight: 2 }));
    // but not against a bad team
    const ts = lg.teams[bkn].seasons.find((x) => x.season === lg.season)!;
    ts.won = 2;
    ts.lost = 12;
    closeGames(lg, bkn, 1);
    expect(rivalryOf(lg, lg.userTid, bkn).hot).toBe(false);
  });

  it("a real league's first season carries last spring's real series: Boston and New York", () => {
    const r = rivalryOf(l, l.userTid, byAbbrev(l, 'BOS'));
    expect(r.hot).toBe(true);
  });

  it('close games and a playoff series build a rivalry', () => {
    const lg = structuredClone(l);
    const opp = lg.teams.find((t) => t.conf !== lg.teams[lg.userTid].conf && rivalryOf(lg, lg.userTid, t.tid).score === 0)!.tid;
    // last season's series: four of their wins to three, all close
    const tmpl = userGames(lg)[0];
    for (let i = 0; i < 7; i++) {
      const g = structuredClone(tmpl);
      g.gid = 900000 + i;
      g.season = lg.season - 1;
      g.type = 'playoffs';
      g.seriesId = 'F4-0';
      g.home.tid = opp;
      g.away.tid = lg.userTid;
      g.home.pts = 100 + (i < 4 ? 3 : -3);
      g.away.pts = 100;
      lg.games.unshift(g);
    }
    const r = rivalryOf(lg, lg.userTid, opp);
    expect(r.hot).toBe(true);
    expect(r.reasons[0]).toMatch(/knocked you out of last season's NBA Finals, 4-3/);
    const g = upcoming(lg).find((x) => x.home === opp || x.away === opp)!;
    expect(billingsFor(lg, g)[0]).toMatchObject({ tag: 'Rivalry', weight: 2 });
  });

  it('Christmas Day, and opening night before the first game', () => {
    const lg = structuredClone(l);
    const g = upcoming(lg)[3];
    g.day = christmasDay(lg.season);
    expect(billingsFor(lg, g).map((b) => b.tag)).toContain('Christmas Day');
    const fresh = testLeague('opener');
    const first = upcoming(fresh)[0];
    expect(billingsFor(fresh, first)[0]).toMatchObject({ weight: 3 });
    expect(['Opening night', 'Season opener']).toContain(billingsFor(fresh, first)[0].tag);
  });

  it('Game 7, an elimination game and a closeout', () => {
    const lg = structuredClone(l);
    const opp = upcoming(lg)[0].home === lg.userTid ? upcoming(lg)[0].away : upcoming(lg)[0].home;
    lg.playoffs = [{ id: 'E1-0', round: 1, conf: 'E', high: lg.userTid, low: opp, highSeed: 1, lowSeed: 8, highWins: 3, lowWins: 3 }];
    const g: ScheduledGame = { gid: 999999, day: lg.day + 1, home: lg.userTid, away: opp, type: 'playoffs', seriesId: 'E1-0' };
    expect(billingsFor(lg, g)[0]).toMatchObject({ tag: 'Game 7', weight: 3 });
    lg.playoffs[0].highWins = 2;
    expect(billingsFor(lg, g)[0]).toMatchObject({ tag: 'Elimination game', weight: 3 });
    lg.playoffs[0].highWins = 3;
    lg.playoffs[0].lowWins = 1;
    expect(billingsFor(lg, g)[0].tag).toBe('Closeout game');
  });

  it('a player facing the team he left, the first time since', () => {
    const lg = structuredClone(l);
    const g = upcoming(lg).find(
      (x) => !lg.games.some((r) => [r.home.tid, r.away.tid].includes(x.home === lg.userTid ? x.away : x.home) && [r.home.tid, r.away.tid].includes(lg.userTid)),
    )!;
    const opp = g.home === lg.userTid ? g.away : g.home;
    // their best player spent last season with the user's team
    const p = Object.values(lg.players)
      .filter((x) => x.tid === opp && !x.injury)
      .sort((a, b) => b.ovr - a.ovr)[0];
    const row = structuredClone(p.stats.find((s) => s.gp > 0) ?? p.stats[0]);
    p.stats = p.stats.filter((s) => s.season !== lg.season - 1);
    const at = p.stats.findIndex((s) => s.season >= lg.season);
    p.stats.splice(at < 0 ? p.stats.length : at, 0, { ...row, season: lg.season - 1, tid: lg.userTid, gp: 60, playoffs: false });
    const b = billingsFor(lg, g);
    const rev = b.find((x) => x.tag === 'Revenge game')!;
    expect(rev).toBeTruthy();
    expect(rev.line).toContain(p.lastName);
    expect(rev.line).toMatch(/first time/);
    // (left out of a light billing: it can change before then)
    expect(billingsFor(lg, g, lg.userTid, { light: true }).some((x) => x.tag === 'Revenge game')).toBe(false);
  });

  it('draws nothing from the league', () => {
    const rng = l.rng;
    for (const g of upcoming(l)) billingsFor(l, g);
    expect(l.rng).toBe(rng);
  });
});
