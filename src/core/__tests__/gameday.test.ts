// Game day, from one real league's first month: a game as a story (headlines for crafted results, the
// user's games written into the news, the billing of games ahead), game-time decisions on questionable
// players (they sit unless the user clears them, and a cleared one plays tonight's game as the one he
// had left, live or simmed, journaled for a replay), the projection each of the user's games keeps for
// win probability, career milestones (only for careers the game has whole), storylines, the three
// stars, the post-game quotes and the standings move kept with each result, and the matchup preview
// (starters, the injury and rest report, the season series). None of it draws from the league's
// random stream or changes a game.
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { testLeague, userGames } from '../../state/__tests__/fixtures';
import { clearLive, dropLive, prepareLive, LiveGame } from '../../state/live';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import { buildSimInput, ensureRotation, userGameOnDay } from '../league/games';
import { advanceDay, simDay } from '../league/season';
import { GAME_TIME_PERF, clearedToPlay, isQuestionable, setGameTime } from '../league/injuries';
import { curTeamSeason, statsLine, teamPlayers } from '../league/helpers';
import { setPlanMatchup } from '../league/gamePlans';
import { createLeague, defaultSettings } from '../league/create';
import { gameProjection, HOME_EDGE, matchupPreview, projectMargin, winChance } from '../analysis/preview';
import { careerOnRecord, careerTotals, marksCrossed, milestonesIn, newsworthy } from '../analysis/milestones';
import { storylines } from '../analysis/storylines';
import { isLatestUserGame, postGameQuotes, recapFacts, streakAfter, threeStars } from '../analysis/quotes';
import { buildGameReport, IMPACT_TEXT, impactSentence } from '../analysis/gameReport';
import { billingsFor, christmasDay, gameStoryFor, rivalryOf, RIVALRY, storyGame } from '../analysis/gameStory';
import { runLab } from '../ai/lab';
import { wpSeries } from '../analysis/winProb';
import { gameStakes } from '../analysis/odds';
import { gameKeys } from '../analysis/keys';
import { previewMatchups } from '../analysis/matchupPreview';
import { scoutData } from '../analysis/scouting';
import { guardingPlan } from '../analysis/guarding';
import { scoutTeam } from '../ai/advisor';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { seasonLabel } from '../constants';
import type { GameResult, League, Player, ScheduledGame } from '../types';

afterEach(() => clearLive());

const opponent = (l: League, g: ScheduledGame) => (g.home === l.userTid ? g.away : g.home);
const lineOf = (res: GameResult, pid: number) => [...res.home.players, ...res.away.players].find((b) => b.pid === pid);
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

function nextGame(l: League) {
  const g = userGameOnDay(l, l.day)!;
  ensureRotation(l, g.home);
  ensureRotation(l, g.away);
  return g;
}

describe('game day', () => {
  /** The league after `n` days of the season (a copy each time), for the days the checks below start from. */
  const days = new Map<number, League>();
  const snap = (n: number) => structuredClone(days.get(n)!);
  /** The first day the user's team plays, and the first it plays a team it has met already. */
  let opener = -1;
  let rematch = -1;
  beforeAll(() => {
    const l = testLeague('gameday');
    const met = (opp: number) => l.games.some((r) => r.type === 'regular' && [r.home.tid, r.away.tid].includes(opp) && [r.home.tid, r.away.tid].includes(l.userTid));
    for (let n = 0; n < 200 && (n <= 30 || rematch < 0); n++) {
      const g = userGameOnDay(l, l.day);
      if (opener < 0 && g) opener = n;
      if (rematch < 0 && g && met(opponent(l, g))) rematch = n;
      if ([0, 3, 4, 6, 8, 10, 12, 20, 24, 25, 30, opener, opener + 1, opener + 6, rematch].includes(n)) days.set(n, structuredClone(l));
      simDay(l);
    }
    expect(opener).toBeGreaterThanOrEqual(0);
    expect(opener).toBeLessThan(10);
  }, 120_000);

  /** The user's best player, one game left on a sprained ankle, on the first game day. */
  function questionableStar() {
    const l = snap(opener);
    const g = userGameOnDay(l, l.day)!;
    const star = teamPlayers(l, l.userTid).sort((a, b) => b.ovr - a.ovr)[0];
    star.injury = { type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 4, severity: 'minor' };
    ensureRotation(l, g.home);
    ensureRotation(l, g.away);
    return { l, g, star };
  }

  it("tells each of the user's games as a story, writes it into the news, and bills the games ahead", () => {
    // every game of the user has a story, the same every time, and none for other teams from his side
    const base = snap(24);
    /** A copy of the league with the user's `n`th game (from the end) changed by `fn`. */
    const craft = (fn: (l: League, g: GameResult) => void, n = 1) => {
      const l = structuredClone(base);
      // (the press's story of the game as played would stand in for the crafted one's)
      l.news = l.news.filter((x) => x.kind !== 'game');
      const g = userGames(l).at(-n)!;
      fn(l, g);
      return { l, g, story: gameStoryFor(l, g.gid)! };
    };
    {
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
    }

    // a comeback, overtime and a rout each lead their headline
    {
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

      // (on a night after a win: ending a skid, or one going on, would be the bigger story, and so would a 4th straight win)
      const games = userGames(base);
      const won = (g: GameResult) => side(base, g).pts > other(base, g).pts;
      const afterWin = 1 + [...games].reverse().findIndex((_, k, rev) => k + 3 < rev.length && won(rev[k + 1]) && !(won(rev[k + 2]) && won(rev[k + 3])));
      const rout = craft((l, g) => {
        plain(l, g, true);
        side(l, g).pts = 135;
      }, afterWin).story;
      expect(rout.head).toMatch(/rout|blow out|off the floor/);

      const routed = craft((l, g) => {
        plain(l, g, false);
        other(l, g).pts = 130;
      }, afterWin).story;
      expect(routed.won).toBe(false);
      expect(routed.head).toMatch(/rout/);
    }

    // a shot at the buzzer names the shooter and makes the front page
    {
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
      // a win at the horn is the front page on any night (it was a story on an ordinary one before the
      // stories round), and so on a big one (Christmas Day)
      expect(story.weight).toBe(3);
      const g = userGames(base).at(-1)!;
      const xmas = structuredClone(base);
      xmas.news = xmas.news.filter((x) => x.kind !== 'game');
      const xg = userGames(xmas).at(-1)!;
      Object.assign(xg, structuredClone(crafted!));
      xg.day = christmasDay(xmas.season);
      expect(xg.gid).toBe(g.gid);
      expect(gameStoryFor(xmas, xg.gid)!.weight).toBe(3);
    }

    // the play you called is named with the shot that won it late, and so is one that tied it for overtime
    {
      const tally = { us: { poss: 1, pts: 2 }, them: { poss: 0, pts: 0 } };
      let last = '';
      const won = craft((l, g) => {
        plain(l, g, true);
        const us = side(l, g);
        other(l, g).pts = 108;
        const shooter = [...us.players].sort((a, b) => b.min - a.min)[0];
        last = l.players[shooter.pid].lastName;
        const homeUs = g.home === us;
        const score = (ours: number, theirs: number) => (homeUs ? { hs: ours, as: theirs } : { hs: theirs, as: ours });
        g.pbp = [
          { q: 4, clock: 30, t: homeUs ? 1 : 0, text: 'Other jumper — good.', ...score(108, 108), kind: 'make' },
          { q: 4, clock: 4.2, t: homeUs ? 0 : 1, text: `${last} step-back jumper — good.`, ...score(110, 108), kind: 'make' },
        ];
        g.moves = [
          { kind: 'play', q: 4, clock: 18, text: `Iso: ${last}`, end: 'off', call: { id: 'iso', pid: shooter.pid, late: { how: 'won', clock: 4.2 } }, before: tally, after: tally },
        ];
      }).story;
      expect(won.head).toContain(last);
      expect(won.dek).toMatch(/ahead with 4 seconds left, on the iso you called for him\.$/);
      expect(won.body).toMatch(/with 4 seconds left, on the iso you called for him\./);
      const tied = craft((l, g) => {
        plain(l, g, true);
        g.ot = 1;
        const pid = [...side(l, g).players].sort((a, b) => b.min - a.min)[0].pid;
        last = l.players[pid].lastName;
        g.moves = [
          { kind: 'play', q: 4, clock: 15, text: `Chicago: ${last}`, end: 'off', call: { id: 'chicago', pid, late: { how: 'tied', clock: 2.4 } }, before: tally, after: tally },
        ];
      }).story;
      expect(tied.dek).toMatch(new RegExp(`The Chicago you called for .*${last} tied it with 2 seconds left in regulation\\.`));
      expect(tied.body).toContain('The Chicago you called for');
      // (a play called that didn't decide it isn't named)
      expect(craft((l, g) => plain(l, g, true)).story.dek).not.toMatch(/you called/);
    }

    // a losing streak ended, a winning streak extended, and the chip agrees with the streak on record
    {
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
    }

    // series states: a 3-1 lead, Game 7 forced, a Game 7 won, eliminated
    {
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
    }

    // two games in a row in the same category never share a headline shape
    {
      // the two latest made into the same plain win: the template rotates
      const { l } = craft((l, g) => {
        plain(l, g, true);
        plain(l, userGames(l).at(-2)!, true);
      });
      const [a, b] = userGames(l).slice(-2);
      const shape = (gid: number) => gameStoryFor(l, gid)!.head.replace(/[A-Z][a-z]+|\d+/g, 'X');
      expect(shape(a.gid)).not.toBe(shape(b.gid));
    }

    // the news writes each of the user's games as a story, and only his
    {
      const l = snap(20);
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
    }

    // writing the story touches nothing but the news and never the random stream
    {
      const l = snap(12);
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
    }

    // the same seed plays the same games and writes the same stories
    {
      const a = snap(10);
      const b = testLeague('gameday');
      for (let i = 0; i < 10; i++) simDay(b);
      expect(b.games.map((g) => [g.home.pts, g.away.pts])).toEqual(a.games.map((g) => [g.home.pts, g.away.pts]));
      const heads = (x: League) => x.news.filter((n) => n.kind === 'game' && n.tids[0] === x.userTid).map((n) => n.head);
      expect(heads(b)).toEqual(heads(a));
      expect(b.rng).toBe(a.rng);
    }

    // billing
    const l = snap(6);
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

    // a name is not a rivalry: Brooklyn and New York need heat to be billed as one
    {
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
    }

    // a real league's first season carries last spring's real series: Boston and New York
    expect(rivalryOf(l, l.userTid, byAbbrev(l, 'BOS')).hot).toBe(true);

    // close games and a playoff series build a rivalry
    {
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
    }

    // Christmas Day, and opening night before the first game
    {
      const lg = structuredClone(l);
      const g = upcoming(lg)[3];
      g.day = christmasDay(lg.season);
      expect(billingsFor(lg, g).map((b) => b.tag)).toContain('Christmas Day');
      const fresh = snap(0);
      const first = upcoming(fresh)[0];
      expect(billingsFor(fresh, first)[0]).toMatchObject({ weight: 3 });
      expect(['Opening night', 'Season opener']).toContain(billingsFor(fresh, first)[0].tag);
    }

    // Game 7, an elimination game and a closeout
    {
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
    }

    // a player facing the team he left, the first time since
    {
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
    }

    // billing draws nothing from the league
    const rng = l.rng;
    for (const g of upcoming(l)) billingsFor(l, g);
    expect(l.rng).toBe(rng);
  }, 120_000);

  it('plays questionable players only when the user clears them, keeps the projection and the post-game facts with each result, and quotes them', async () => {
    // game-time decisions are for players one game from back from a minor or moderate injury, not a concussion or a long one
    {
      const p = (injury: Player['injury']) => ({ injury }) as Player;
      expect(isQuestionable(p({ type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 3, severity: 'minor' }))).toBe(true);
      expect(isQuestionable(p({ type: 'Hamstring Strain', gamesRemaining: 1, gamesTotal: 9, severity: 'moderate' }))).toBe(true);
      expect(isQuestionable(p({ type: 'Hamstring Strain', gamesRemaining: 2, gamesTotal: 9, severity: 'moderate' }))).toBe(false);
      expect(isQuestionable(p({ type: 'Concussion', gamesRemaining: 1, gamesTotal: 4, severity: 'minor' }))).toBe(false);
      expect(isQuestionable(p({ type: 'Torn Meniscus', gamesRemaining: 1, gamesTotal: 30, severity: 'major' }))).toBe(false);
      expect(isQuestionable(p(null))).toBe(false);
    }

    // they sit him by default; cleared, he starts and plays a step slow, and the game counts as the one he had left
    {
      const { l, g, star } = questionableStar();
      const opp = opponent(l, g);
      const sits = buildSimInput(l, l.userTid, g.day, g.type, opp, g);
      expect(sits.play).toBeUndefined();
      expect(matchupPreview(l, g.gid)!.us.questionable).toEqual([expect.objectContaining({ pid: star.pid, cleared: false })]);
      expect(matchupPreview(l, g.gid)!.us.starters.map((p) => p.pid)).not.toContain(star.pid);

      setGameTime(l, g.gid, star.pid, true);
      expect(l.gameTime).toEqual({ gid: g.gid, play: [star.pid] });
      const plays = buildSimInput(l, l.userTid, g.day, g.type, opp, g);
      expect(plays.play).toEqual([star.pid]);
      expect(plays.perf![star.pid]).toBeCloseTo(sits.perf![star.pid] * GAME_TIME_PERF, 10);
      // the staff's rotation plans his minutes as if he were healthy (it had none for him)
      expect(sits.team.rotation.minutes[star.pid] ?? 0).toBe(0);
      expect(plays.team.rotation.minutes[star.pid]).toBeGreaterThan(20);
      // (the saved rotation isn't touched)
      expect(l.teams[l.userTid].rotation.minutes[star.pid] ?? 0).toBe(0);
      const pv = matchupPreview(l, g.gid)!;
      expect(pv.us.questionable).toEqual([expect.objectContaining({ pid: star.pid, cleared: true })]);
      expect(pv.us.out.map((p) => p.pid)).not.toContain(star.pid);
      expect(pv.us.starters.map((p) => p.pid)).toContain(star.pid);

      simDay(l);
      const res = l.games.find((r) => r.gid === g.gid)!;
      // healed by the game, or hurt again in it (a new injury, which can end his night early)
      const hurtAgain = star.injury !== null;
      expect(!hurtAgain || star.injury!.gamesRemaining === star.injury!.gamesTotal).toBe(true);
      expect(lineOf(res, star.pid)!.min).toBeGreaterThan(hurtAgain ? 0 : 10);
      expect(lineOf(res, star.pid)!.dnp).toBeUndefined();
      expect(l.gameTime).toBeUndefined();
    }

    // they're the user's alone: another team's questionable player sits, whatever the save says
    {
      const { l, g } = questionableStar();
      const opp = opponent(l, g);
      const theirs = teamPlayers(l, opp).sort((a, b) => b.ovr - a.ovr)[0];
      theirs.injury = { type: 'Back Spasms', gamesRemaining: 1, gamesTotal: 2, severity: 'minor' };
      // a crafted decision for him does nothing
      l.gameTime = { gid: g.gid, play: [theirs.pid] };
      expect(clearedToPlay(l, g.gid)).toEqual([]);
      expect(buildSimInput(l, opp, g.day, g.type, l.userTid, g).play).toBeUndefined();
      setGameTime(l, g.gid, theirs.pid, true);
      expect(l.gameTime).toBeUndefined();
      simDay(l);
      expect(
        lineOf(
          l.games.find((r) => r.gid === g.gid)!,
          theirs.pid,
        )?.dnp,
      ).toMatch(/^Injured/);
    }

    // they end when their game is played or its day has passed
    {
      const { l, g, star } = questionableStar();
      setGameTime(l, g.gid, star.pid, true);
      l.gameTime = { gid: g.gid + 100000, play: [star.pid] };
      advanceDay(l);
      expect(l.gameTime).toBeUndefined();
    }

    // a live game with him is journaled: picked up again it plays him whatever the decision is now
    {
      const { l, g, star } = questionableStar();
      setGameTime(l, g.gid, star.pid, true);
      const lg = prepareLive(l)!;
      expect(lg.game.gid).toBe(g.gid);
      expect(l.live!.user.play).toEqual([star.pid]);
      expect(l.live!.edge).toBe(lg.edge);
      expect(lg.sim.T[lg.userSide].byId.get(star.pid)!.out).toBe(0);
      for (let i = 0; i < 60; i++) lg.step();
      lg.checkpoint();
      const score = [lg.sim.T[0].score, lg.sim.T[1].score];
      // the app is closed, and the decision changed in the save since: the journal's is the one played
      const copy = structuredClone(l);
      dropLive();
      setGameTime(copy, g.gid, star.pid, false);
      const again = LiveGame.fromJournal(copy) as LiveGame;
      expect(again).toBeInstanceOf(LiveGame);
      expect([again.sim.T[0].score, again.sim.T[1].score]).toEqual(score);
      expect(again.sim.T[again.userSide].byId.get(star.pid)!.out).not.toBe(2);
      expect(again.edge).toBe(lg.edge);
      const res = again.commit(copy);
      expect(res.edge).toBe(lg.edge);
      expect(lineOf(res, star.pid)!.min).toBeGreaterThan(0);
      clearLive();
    }

    // they change nothing in a game until one is made: a healthy player on the list plays the same game
    {
      const l = snap(0);
      const [a, b] = [l.teams[3], l.teams[4]];
      const sim = (play?: number[]) =>
        new GameSim(
          { team: a, players: teamPlayers(l, a.tid), adjust: true, ...(play ? { play } : {}) },
          { team: b, players: teamPlayers(l, b.tid), adjust: true },
          { rng: new Rng(42), type: 'regular', injuries: true },
        ).simToEnd();
      const healthy = teamPlayers(l, a.tid)[0].pid;
      expect(sim([healthy])).toEqual(sim());
    }

    // the projection a game keeps is on the user's results with the possession clock; other teams' games keep none of it
    {
      const l = snap(6);
      const mine = userGames(l);
      expect(mine.length).toBeGreaterThan(0);
      for (const r of mine) {
        expect(typeof r.edge).toBe('number');
        expect(r.flowT).toHaveLength(r.flow!.length);
        expect(r.flowPoss).toHaveLength(r.flowPeriods!.length);
      }
      for (const r of l.games.filter((x) => !mine.includes(x))) expect([r.edge, r.flowT, r.flowPoss, r.flow]).toEqual([undefined, undefined, undefined, undefined]);
    }

    // reading a save drops damaged win-probability data and game-time decisions
    {
      const l = snap(4);
      const r = userGames(l)[0];
      const saved = JSON.parse(JSON.stringify(l)) as League;
      expect(migrate(structuredClone(saved)).games.find((x) => x.gid === r.gid)).toEqual(saved.games.find((x) => x.gid === r.gid));
      const x = structuredClone(saved);
      const g = x.games.find((y) => y.gid === r.gid)!;
      Object.assign(g, { edge: 'big', flowT: g.flowT!.slice(1), flowPoss: [0, 2, 1, 0] });
      (x as unknown as Record<string, unknown>).gameTime = { gid: 'x', play: [1] };
      const m = migrate(x);
      const back = m.games.find((y) => y.gid === r.gid)!;
      expect([back.edge, back.flowT, back.flowPoss, m.gameTime]).toEqual([undefined, undefined, undefined, undefined]);
      expect(back.flow).toEqual(r.flow);
    }

    // career milestones count only careers the game has whole: a real veteran's, when the seed carried it, not his last three seasons
    {
      const l = snap(0);
      const real = Object.values(l.players).filter((p) => p.real && p.tid >= 0);
      const named = (first: string, last: string) => real.find((p) => p.firstName === first && p.lastName === last)!;
      // every season since 2003-04 on record: LeBron's from his first, and a season lost to injury
      // (Durant's 2019-20) or spent overseas leaves a gap, not a hole
      expect(l.careersFrom).toBe(2004);
      for (const p of [named('LeBron', 'James'), named('Kevin', 'Durant'), named('Stephen', 'Curry')]) expect(careerOnRecord(l, p)).toBe(true);
      const durant = named('Kevin', 'Durant');
      expect(new Set(durant.stats.filter((s) => s.real && s.gp > 0).map((s) => s.season)).size).toBeLessThan(durant.experience);
      // a league seeded with only the last three seasons (a save from before) has a veteran's career in part
      const old = structuredClone(l);
      delete old.careersFrom;
      for (const p of Object.values(old.players)) p.stats = p.stats.filter((s) => !s.real || s.season >= old.startSeason - 3);
      const veteran = Object.values(old.players).find((p) => p.real && p.tid >= 0 && p.experience >= 8)!;
      expect(careerOnRecord(old, veteran)).toBe(false);
      // there, a 2023 draftee still has every season on record
      const young = Object.values(old.players).find((p) => p.real && p.draft.year === l.season - 4 && p.stats.filter((s) => !s.playoffs && s.gp > 0).length === 3);
      expect(young).toBeDefined();
      expect(careerOnRecord(old, young!)).toBe(true);
      expect(marksCrossed(990, 1004)).toEqual([1000]);
      expect(marksCrossed(1000, 1999)).toEqual([]);
      const news = (stat: 'pts' | 'reb' | 'ast', mark: number) => newsworthy(stat, mark);
      expect([news('pts', 5000), news('pts', 12000), news('pts', 15000), news('reb', 2500), news('reb', 7500), news('ast', 3000)]).toEqual([true, false, true, false, true, false]);
    }

    // they make the news when a big one is reached, and the recap names the round thousands reached
    {
      const l = snap(opener);
      const g = userGameOnDay(l, l.day)!;
      const opp = opponent(l, g);
      // two players with careers on record a basket from 10,000 points and 1,000 points
      const [a, b] = [teamPlayers(l, l.userTid), teamPlayers(l, opp)].map((ps) => ps.filter((p) => !p.injury).sort((x, y) => y.ovr - x.ovr)[0]);
      for (const [p, pts] of [
        [a, 9999],
        [b, 999],
      ] as const) {
        p.experience = 0;
        p.stats = [];
        Object.assign(statsLine(p, l.season, p.tid, false), { gp: 1, pts });
      }
      // and a board from 7,500 rebounds, a mark between the round thousands
      statsLine(a, l.season, a.tid, false).drb = 7499;
      simDay(l);
      const res = l.games.find((r) => r.gid === g.gid)!;
      const marks = milestonesIn(l, res);
      const scored = (p: Player) => (lineOf(res, p.pid)?.pts ?? 0) > 0;
      expect(marks.some((m) => m.pid === a.pid && m.stat === 'pts' && m.mark === 10000)).toBe(scored(a));
      expect(marks.some((m) => m.pid === b.pid && m.stat === 'pts' && m.mark === 1000)).toBe(scored(b));
      const news = l.news.filter((n) => n.kind === 'milestone' && n.text.includes('career'));
      expect(news.some((n) => n.pids[0] === a.pid && n.text.endsWith('scored his 10,000th career point.'))).toBe(scored(a));
      const rebounded = (p: Player) => (lineOf(res, p.pid)?.orb ?? 0) + (lineOf(res, p.pid)?.drb ?? 0) > 0;
      // (when he got one: a guard can go a night without a board)
      expect(news.some((n) => n.pids[0] === a.pid && n.text.endsWith('grabbed his 7,500th career rebound.'))).toBe(rebounded(a));
      // and the recap names it too
      expect(marks.some((m) => m.pid === a.pid && m.stat === 'reb' && m.mark === 7500)).toBe(rebounded(a));
      // 1,000 is for the recap, not the news
      expect(news.some((n) => n.pids[0] === b.pid)).toBe(false);
      // a later game doesn't move it: the recap counts back from his total now
      for (let i = 0; i < 3; i++) simDay(l);
      expect(milestonesIn(l, res)).toEqual(marks);
      expect(careerTotals(a).pts).toBeGreaterThanOrEqual(9999);
    }

    // storylines say what the data shows: a revenge game, a milestone in reach, a streak, two No. 1 picks
    {
      const l = snap(opener);
      const g = userGameOnDay(l, l.day)!;
      const opp = opponent(l, g);
      const [mine, theirs] = [teamPlayers(l, l.userTid), teamPlayers(l, opp)].map((ps) => ps.filter((p) => !p.injury).sort((x, y) => y.ovr - x.ovr));
      // he played all of last season for them, and hasn't met them since
      const traded = mine[0];
      traded.stats.push({ ...statsLine({ ...traded, stats: [] } as Player, l.season - 1, opp, false), gp: 70, pts: 1400 });
      // a young player 6 points from 1,000 for his career, averaging 15
      const kid = theirs[1];
      kid.experience = 1;
      kid.stats = [{ ...statsLine({ ...kid, stats: [] } as Player, l.season - 1, opp, false), gp: 66, pts: 994 }];
      l.teams[opp].seasons.find((s) => s.season === l.season)!.streak = 5;
      for (const p of [mine[2], theirs[2]]) p.draft = { ...p.draft, round: 1, pick: 1, year: 2020 };
      const stories = storylines(l, g);
      const text = stories.map((s) => s.text);
      expect(text).toContain(`${traded.lastName} faces the ${l.teams[opp].name} for the first time since he left (his team until ${seasonLabel(l.season - 1)}).`);
      // (by his full name when another player in the game shares his last name)
      expect(text.some((t) => [kid.lastName, `${kid.firstName} ${kid.lastName}`].some((n) => t === `${n} needs 6 points for 1,000 in his career (he averages 15.1).`))).toBe(true);
      // (a postseason night doesn't count toward a career's regular-season totals)
      expect(storylines(l, { ...g, type: 'playoffs' }).some((s) => s.kind === 'milestone')).toBe(false);
      expect(text).toContain(`The ${l.teams[opp].name} have won 5 straight.`);
      // (the best No. 1 pick on each side: there may be real ones)
      const picks = stories.find((s) => s.kind === 'picks')!;
      expect(picks.pids.map((pid) => l.players[pid].tid).sort()).toEqual([l.userTid, opp].sort());
      expect(picks.pids.every((pid) => l.players[pid].draft.pick === 1 && l.players[pid].draft.round === 1)).toBe(true);
      // sorted by weight; a player who won't play is left out
      expect(stories.map((s) => s.weight)).toEqual([...stories.map((s) => s.weight)].sort((x, y) => y - x));
      expect(storylines(l, g, new Set([kid.pid])).some((s) => s.pids.includes(kid.pid))).toBe(false);
    }

    // the three stars put the player of the game first, then the best two games on either side
    for (const r of snap(3).games.slice(0, 20)) {
      const stars = threeStars(r);
      expect(stars).toHaveLength(3);
      expect(stars[0].line.pid).toBe(r.pog);
      expect(new Set(stars.map((s) => s.line.pid)).size).toBe(3);
    }

    // a comeback from 15% or less gets its own words, from both sides
    {
      const l = snap(opener + 1);
      const r = structuredClone(userGames(l)[0]);
      const usHome = r.home.tid === l.userTid;
      // down 20 late in the third, won by 3
      const ours = [2, -4, -10, -15, -20, -20, -12, -6, -1, 3];
      r.flow = ours.map((m) => (usHome ? m : -m));
      r.flowPeriods = [0, 2, 4, 7];
      r.flowT = [300, 700, 1000, 1400, 2000, 2150, 2300, 2600, 2850, 2880];
      r.flowPoss = [0, 1, 1, 0];
      r.edge = 0;
      r.ot = 0;
      const [us, them] = usHome ? [r.home, r.away] : [r.away, r.home];
      us.pts = them.pts + 3;
      // (what the quotes read is kept as the game is recorded: taken again from this flow, nobody hurt)
      Object.assign(r, recapFacts(r, []));
      expect(r.wpLow).toBeLessThanOrEqual(0.15);
      l.games[l.games.findIndex((x) => x.gid === r.gid)] = r;
      const [voice, coach] = postGameQuotes(l, r);
      expect([
        'Nobody in here flinched, even when it looked bad. We just kept chipping away.',
        "That's a special win. We were in a deep hole and we climbed out together.",
        "We stopped worrying about the scoreboard and just got stops. That's how you come back.",
      ]).toContain(voice.text);
      expect([
        "We had control of that game and let it get away. That's on me.",
        `Credit to the ${l.teams[l.userTid].name}: they kept coming, and we stopped doing what built the lead.`,
      ]).toContain(coach.text);
    }

    // post-game stakes: only the user's regular-season games carry the standings move
    {
      const l = snap(30);
      for (const g of l.games) {
        const mine = g.home.tid === l.userTid || g.away.tid === l.userTid;
        expect(!!g.stakes, `game ${g.gid}`).toBe(mine && g.type === 'regular');
      }
      expect(userGames(l).length).toBeGreaterThan(5);
      // a win never puts the team further back, a loss never brings it closer
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
      // they survive a save and a reload
      await saveLeague(l);
      const back = (await loadLeague(l.id))!;
      expect(userGames(back).map((g) => g.stakes)).toEqual(userGames(l).map((g) => g.stakes));
      expect(userGames(back).every((g) => g.stakes)).toBe(true);
    }

    // quotes are the same every time for a game and draw nothing from the league
    {
      const l = snap(20);
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
    }

    // they name the teammate hurt in the game, told apart from one with the same last name
    {
      const l = snap(10);
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
    }

    // a game's quotes read the same once it isn't the latest, and once its flow is gone
    {
      const l = snap(8);
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
    }

    // an upset loss reads as one, and a loss to a much better team does not
    {
      const l = snap(30);
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
    }

    // the streak after a game matches the team's record after the latest one
    {
      const l = snap(25);
      const last = userGames(l)
        .filter((g) => g.type === 'regular')
        .at(-1)!;
      expect(isLatestUserGame(l, last)).toBe(true);
      expect(streakAfter(l, last)).toBe(curTeamSeason(l, l.userTid).streak);
    }

    // what the quotes read survives a save, and a damaged one goes
    {
      const copy = snap(6);
      const [a, b] = userGames(copy);
      a.hurt = ['x'] as unknown as number[];
      a.wpLow = 3;
      const keep = { hurt: b.hurt, wpLow: b.wpLow };
      const back = migrate(copy);
      const ga = back.games.find((g) => g.gid === a.gid)!;
      expect([ga.hurt, ga.wpLow]).toEqual([undefined, undefined]);
      const gb = back.games.find((g) => g.gid === b.gid)!;
      expect({ hurt: gb.hurt, wpLow: gb.wpLow }).toEqual(keep);
    }

    // the report names the teams an effect helped and hurt as given, never "you" (their game plan can be the one it beat)
    for (const key of Object.keys(IMPACT_TEXT)) {
      const s = impactSentence(key, 'the Aces', 'the Bees', ' (Smith)');
      expect(s, key).not.toMatch(/\byou(r)?\b/i);
      expect(s, key).toMatch(/the Aces|the Bees/i);
    }
    expect(impactSentence('drop_pop:o', 'the Knicks', 'the Celtics')).toBe("The Knicks' popping big punished the drop with open threes.");
    expect(impactSentence('switch_slip:o', 'your team', 'the opposition')).toBe("Your team's screeners slipped the opposition's switches for rolls to the rim.");
  }, 120_000);

  it('previews a matchup as the game will be played, from the rosters and the results, leaving the league untouched', () => {
    // it projects the starters the live game starts, and leaves the league untouched
    {
      const l = snap(opener);
      const g = nextGame(l);
      const before = { rng: l.rng, games: l.games.length, schedule: JSON.stringify(l.schedule), players: JSON.stringify(l.players) };
      const pv = matchupPreview(l, g.gid)!;
      expect({ rng: l.rng, games: l.games.length, schedule: JSON.stringify(l.schedule), players: JSON.stringify(l.players) }).toEqual(before);
      expect(pv.userGame).toBe(true);
      expect(pv.us.tid).toBe(l.userTid);
      const live = prepareLive(l)!;
      expect(live.game.gid).toBe(g.gid);
      const startersOf = (s: 0 | 1) =>
        live.sim.T[s].players
          .filter((p) => p.starter)
          .map((p) => p.pid)
          .sort();
      const usSide = pv.usHome ? 0 : 1;
      expect(pv.us.starters.map((p) => p.pid).sort()).toEqual(startersOf(usSide));
      expect(pv.them.starters.map((p) => p.pid).sort()).toEqual(startersOf((1 - usSide) as 0 | 1));
      // a threat who starts has one of our starters on him at the tip
      for (const th of pv.threats.filter((x) => x.starts)) expect(pv.us.starters.map((p) => p.pid)).toContain(th.guard?.pid);
      clearLive();
    }

    // it lists the injured as out, the rested on a back-to-back as resting, and keeps both out of the five
    {
      const l = snap(opener);
      const g = nextGame(l);
      const opp = g.home === l.userTid ? g.away : g.home;
      const hurt = teamPlayers(l, opp).sort((a, b) => b.ovr - a.ovr)[0];
      hurt.injury = { type: 'Sprained Ankle', gamesRemaining: 4, gamesTotal: 6, severity: 'moderate' };
      ensureRotation(l, opp);
      // a back-to-back: the user's team played yesterday, and its best player rests on the second night
      const star = teamPlayers(l, l.userTid).sort((a, b) => b.ovr - a.ovr)[0];
      l.teams[l.userTid].rotation.restB2B = [star.pid];
      l.schedule.push({ gid: l.nextGid++, day: g.day - 1, home: l.userTid, away: opp, type: 'regular', played: true });
      const pv = matchupPreview(l, g.gid)!;
      const injured = teamPlayers(l, opp)
        .filter((p) => p.injury)
        .map((p) => p.pid)
        .sort();
      expect(pv.them.out.map((p) => p.pid).sort()).toEqual(injured);
      expect(pv.them.out.find((p) => p.pid === hurt.pid)).toMatchObject({ injury: 'Sprained Ankle', games: 4 });
      expect(pv.them.starters.map((p) => p.pid)).not.toContain(hurt.pid);
      expect(pv.us.b2b).toBe(true);
      expect(pv.us.resting.map((p) => p.pid)).toEqual([star.pid]);
      expect(pv.us.starters.map((p) => p.pid)).not.toContain(star.pid);
      // whoever starts in his place says so
      if (pv.us.starters.some((p) => p.for)) expect(pv.us.starters.map((p) => p.for?.pid)).toContain(star.pid);
    }

    // it counts the season series from the stored results, and follows planned matchups at the tip
    {
      // (the first game day against a team already met)
      const l = snap(rematch);
      const g = nextGame(l);
      const opp = g.home === l.userTid ? g.away : g.home;
      const pv = matchupPreview(l, g.gid)!;
      const meetings = l.games.filter(
        (r) => r.season === l.season && r.type === 'regular' && [r.home.tid, r.away.tid].includes(opp) && [r.home.tid, r.away.tid].includes(l.userTid),
      );
      const won = meetings.filter((r) => (r.home.tid === l.userTid ? r.home.pts > r.away.pts : r.away.pts > r.home.pts)).length;
      expect(meetings.length).toBeGreaterThan(0);
      expect(pv.series.games.map((m) => m.gid)).toEqual(meetings.map((r) => r.gid));
      expect([pv.series.won, pv.series.lost]).toEqual([won, meetings.length - won]);
      expect(pv.series.meeting).toBe(meetings.length + 1);
      // planned matchups: their first threat gets our pick, as the real game would assign him
      const th = pv.threats.find((x) => x.starts);
      if (th) {
        const mine = pv.us.starters.find((p) => p.pid !== th.guard?.pid)!;
        setPlanMatchup(l, opp, th.pid, mine.pid);
        const after = matchupPreview(l, g.gid)!.threats.find((x) => x.pid === th.pid)!;
        expect(after.planned?.pid).toBe(mine.pid);
        expect(after.guard?.pid).toBe(mine.pid);
      }
    }

    // it projects a margin that grows with the net-rating gap, and home court counts for whoever is at home
    {
      let last = -Infinity;
      for (let d = -10; d <= 10; d += 2) {
        const m = projectMargin(d, 0, 100, 0);
        expect(m).toBeGreaterThan(last);
        last = m;
      }
      expect(winChance(0)).toBeCloseTo(0.5, 6);
      expect(winChance(5) + winChance(-5)).toBeCloseTo(1, 6);
      expect(winChance(5)).toBeGreaterThan(winChance(2));
      // the pre-game chance is where the live game's win probability starts: one number, before the tip and at it
      expect(winChance(6)).toBeCloseTo(wpSeries({ flow: [0], flowPeriods: [0], edge: 6, type: 'regular' })![0].wp, 9);
      // the same game with the floors swapped: the edge moves with home court and nothing else does
      const l = snap(opener);
      const g = nextGame(l);
      const a = matchupPreview(l, g.gid)!;
      [g.home, g.away] = [g.away, g.home];
      const b = matchupPreview(l, g.gid)!;
      expect(a.usHome).not.toBe(b.usHome);
      const [home, away] = a.usHome ? [a, b] : [b, a];
      expect(home.projection.edge).toBe(HOME_EDGE);
      expect(away.projection.edge).toBe(-HOME_EDGE);
      expect(home.projection.margin - away.projection.margin).toBeCloseTo(2 * HOME_EDGE, 6);
      expect(home.projection.win).toBeGreaterThan(away.projection.win);
    }

    // a day's scoreboard quotes the preview's own chance to win, for your game and everyone else's
    {
      const l = snap(opener + 6);
      const before = { rng: l.rng, players: JSON.stringify(l.players) };
      const day = l.schedule.filter((x) => x.day === l.day);
      expect(day.length).toBeGreaterThan(1);
      for (const g of day) {
        const pv = matchupPreview(l, g.gid)!;
        const p = gameProjection(l, g);
        // (the preview reads from the user's side in his games, the home side in the rest)
        expect(pv.usHome ? p.win : 1 - p.win).toBeCloseTo(pv.projection.win, 9);
        expect(pv.usHome ? p.margin : -p.margin).toBeCloseTo(pv.projection.margin, 9);
      }
      expect({ rng: l.rng, players: JSON.stringify(l.players) }).toEqual(before);
    }

    // one chance to win, whichever screen asks first: the projection reads both rotations as the game
    // will start them, so nothing the matchup page runs (its preview refreshes the rotations in the
    // league) moves it, and it is the edge the game keeps
    {
      const l = snap(rematch);
      const g = userGameOnDay(l, l.day)!;
      // both teams' best players hurt since their last game: the rotations in the league still play them
      for (const tid of [g.home, g.away])
        teamPlayers(l, tid).sort((a, b) => b.ovr - a.ovr)[0].injury = { type: 'Calf strain', gamesRemaining: 6, gamesTotal: 6, severity: 'moderate' };
      const first = gameProjection(l, g);
      const opp = opponent(l, g);
      const pv = matchupPreview(l, g.gid)!;
      expect(pv.usHome ? first.win : 1 - first.win).toBeCloseTo(pv.projection.win, 12);
      scoutTeam(l, opp);
      scoutData(l, opp);
      previewMatchups(l, opp);
      guardingPlan(l, opp);
      gameKeys(l, g);
      gameStakes(l, g.gid, l.userTid);
      expect(gameProjection(l, g)).toEqual(first);
      ensureRotation(l, g.home);
      ensureRotation(l, g.away);
      expect(gameProjection(l, g)).toEqual(first);
      simDay(l);
      expect(l.games.find((r) => r.gid === g.gid)!.edge).toBe(Math.round(first.margin * 100) / 100);
    }

    // playoff games carry the series: game number, elimination and clinch, and the tag Home shows
    {
      const l = snap(0);
      const opp = (l.userTid + 1) % 30;
      l.playoffs = [{ id: 'E1-0', round: 1, conf: 'E', high: opp, low: l.userTid, highSeed: 1, lowSeed: 8, highWins: 3, lowWins: 1 }];
      const g: ScheduledGame = { gid: l.nextGid++, day: l.day, home: opp, away: l.userTid, type: 'playoffs', seriesId: 'E1-0' };
      l.schedule.push(g);
      ensureRotation(l, opp);
      ensureRotation(l, l.userTid);
      expect(matchupPreview(l, g.gid)!.playoff).toMatchObject({ tag: '1st Round · Game 5', game: 5, wins: 1, losses: 3, elimination: true, clinch: false, homeCourt: false });
      l.playoffs[0].lowWins = 3;
      const pv = matchupPreview(l, g.gid)!;
      expect(pv.playoff).toMatchObject({ tag: '1st Round · Game 7', elimination: true, clinch: true });
      expect(pv.us.tid).toBe(l.userTid);
      expect(pv.usHome).toBe(false);
      expect(pv.projection.edge).toBe(-HOME_EDGE);
    }

    // batch sims play every game at A's floor with venue a, and take turns by default
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    const team = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
    const run = (venue?: 'a' | 'b' | 'neutral') => runLab({ a: team(0), b: team(1), games: 6, seed: 42, venue }).margins;
    const turns = run();
    const atA = run('a');
    const atB = run('b');
    // each game has its own seed: A hosts the even games by default, so those match venue a and the odd ones venue b
    expect(atA.filter((_, i) => i % 2 === 0)).toEqual(turns.filter((_, i) => i % 2 === 0));
    expect(atB.filter((_, i) => i % 2 === 1)).toEqual(turns.filter((_, i) => i % 2 === 1));
    expect(atA.filter((_, i) => i % 2 === 1)).not.toEqual(turns.filter((_, i) => i % 2 === 1));
    expect(run('neutral')).toHaveLength(6);
  }, 120_000);
});
