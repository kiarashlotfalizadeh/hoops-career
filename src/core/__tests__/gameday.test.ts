// Game day: game-time decisions on questionable players (they sit unless the user clears them, and
// a cleared one plays tonight's game as the one he had left, live or simmed, journaled for a
// replay), the projection each of the user's games keeps for win probability, career milestones
// (only for careers the game has whole), storylines that say only what the data shows, the three
// stars and the comeback quotes.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { testLeague, toGameDay, userGames } from '../../state/__tests__/fixtures';
import { clearLive, dropLive, prepareLive, LiveGame } from '../../state/live';
import { migrate } from '../../state/persistence';
import { buildSimInput, ensureRotation, userGameOnDay } from '../league/games';
import { advanceDay, simDay } from '../league/season';
import { GAME_TIME_PERF, clearedToPlay, isQuestionable, setGameTime } from '../league/injuries';
import { statsLine, teamPlayers } from '../league/helpers';
import { matchupPreview } from '../analysis/preview';
import { careerOnRecord, careerTotals, marksCrossed, milestonesIn, newsworthy } from '../analysis/milestones';
import { storylines } from '../analysis/storylines';
import { postGameQuotes, recapFacts, threeStars } from '../analysis/quotes';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { seasonLabel } from '../constants';
import type { GameResult, League, Player, ScheduledGame } from '../types';

afterEach(() => clearLive());

const opponent = (l: League, g: ScheduledGame) => (g.home === l.userTid ? g.away : g.home);
const lineOf = (res: GameResult, pid: number) => [...res.home.players, ...res.away.players].find((b) => b.pid === pid);

/** The user's best player, one game left on a sprained ankle, on today's game day. */
function questionableStar(name: string) {
  const l = testLeague(name);
  toGameDay(l);
  const g = userGameOnDay(l, l.day)!;
  const star = teamPlayers(l, l.userTid).sort((a, b) => b.ovr - a.ovr)[0];
  star.injury = { type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 4, severity: 'minor' };
  ensureRotation(l, g.home);
  ensureRotation(l, g.away);
  return { l, g, star };
}

describe('game-time decisions', () => {
  it('are for players one game from back from a minor or moderate injury, not a concussion or a long one', () => {
    const p = (injury: Player['injury']) => ({ injury }) as Player;
    expect(isQuestionable(p({ type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 3, severity: 'minor' }))).toBe(true);
    expect(isQuestionable(p({ type: 'Hamstring Strain', gamesRemaining: 1, gamesTotal: 9, severity: 'moderate' }))).toBe(true);
    expect(isQuestionable(p({ type: 'Hamstring Strain', gamesRemaining: 2, gamesTotal: 9, severity: 'moderate' }))).toBe(false);
    expect(isQuestionable(p({ type: 'Concussion', gamesRemaining: 1, gamesTotal: 4, severity: 'minor' }))).toBe(false);
    expect(isQuestionable(p({ type: 'Torn Meniscus', gamesRemaining: 1, gamesTotal: 30, severity: 'major' }))).toBe(false);
    expect(isQuestionable(p(null))).toBe(false);
  });

  it('sit him by default; cleared, he starts and plays a step slow, and the game counts as the one he had left', () => {
    const { l, g, star } = questionableStar('gt-play');
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
    expect(lineOf(res, star.pid)!.min).toBeGreaterThan(10);
    expect(lineOf(res, star.pid)!.dnp).toBeUndefined();
    // healed by the game, or hurt again in it (a new injury)
    expect(star.injury === null || star.injury.gamesRemaining === star.injury.gamesTotal).toBe(true);
    expect(l.gameTime).toBeUndefined();
  });

  it("are the user's alone: another team's questionable player sits, whatever the save says", () => {
    const { l, g } = questionableStar('gt-ai');
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
  });

  it('end when their game is played or its day has passed', () => {
    const { l, g, star } = questionableStar('gt-day');
    setGameTime(l, g.gid, star.pid, true);
    l.gameTime = { gid: g.gid + 100000, play: [star.pid] };
    advanceDay(l);
    expect(l.gameTime).toBeUndefined();
  });

  it('play a live game with him, journaled: picked up again it plays him whatever the decision is now', () => {
    const { l, g, star } = questionableStar('gt-live');
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
  });

  it('change nothing in a game until one is made: a healthy player on the list plays the same game', () => {
    const l = testLeague('gt-same');
    const [a, b] = [l.teams[3], l.teams[4]];
    const sim = (play?: number[]) =>
      new GameSim(
        { team: a, players: teamPlayers(l, a.tid), adjust: true, ...(play ? { play } : {}) },
        { team: b, players: teamPlayers(l, b.tid), adjust: true },
        { rng: new Rng(42), type: 'regular', injuries: true },
      ).simToEnd();
    const healthy = teamPlayers(l, a.tid)[0].pid;
    expect(sim([healthy])).toEqual(sim());
  });
});

describe('the projection a game keeps', () => {
  it("is on the user's results with the possession clock; other teams' games keep none of it", () => {
    const l = testLeague('edge');
    for (let i = 0; i < 6; i++) simDay(l);
    const mine = userGames(l);
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) {
      expect(typeof r.edge).toBe('number');
      expect(r.flowT).toHaveLength(r.flow!.length);
      expect(r.flowPoss).toHaveLength(r.flowPeriods!.length);
    }
    for (const r of l.games.filter((x) => !mine.includes(x))) expect([r.edge, r.flowT, r.flowPoss, r.flow]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('reading a save drops damaged win-probability data and game-time decisions', () => {
    const l = testLeague('edge-save');
    for (let i = 0; i < 4; i++) simDay(l);
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
  });
});

describe('career milestones', () => {
  it("count only careers the game has whole: a real veteran's three seasons on record aren't his career", () => {
    const l = testLeague('careers');
    const real = Object.values(l.players).filter((p) => p.real && p.tid >= 0);
    const veteran = real.find((p) => p.experience >= 8)!;
    expect(careerOnRecord(veteran, l.season)).toBe(false);
    // a 2023 draftee has every season on record
    const young = real.find((p) => p.draft.year === l.season - 4 && p.stats.filter((s) => !s.playoffs && s.gp > 0).length === 3);
    expect(young).toBeDefined();
    expect(careerOnRecord(young!, l.season)).toBe(true);
    expect(marksCrossed(990, 1004)).toEqual([1000]);
    expect(marksCrossed(1000, 1999)).toEqual([]);
    const news = (stat: 'pts' | 'reb' | 'ast', mark: number) => newsworthy(stat, mark);
    expect([news('pts', 5000), news('pts', 12000), news('pts', 15000), news('reb', 2500), news('reb', 7500), news('ast', 3000)]).toEqual([true, false, true, false, true, false]);
  });

  it('make the news when a big one is reached, and the recap names the round thousands reached', () => {
    const l = testLeague('marks');
    toGameDay(l);
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
    expect(rebounded(a)).toBe(true);
    expect(news.some((n) => n.pids[0] === a.pid && n.text.endsWith('grabbed his 7,500th career rebound.'))).toBe(true);
    // and the recap names it too
    expect(marks.some((m) => m.pid === a.pid && m.stat === 'reb' && m.mark === 7500)).toBe(true);
    // 1,000 is for the recap, not the news
    expect(news.some((n) => n.pids[0] === b.pid)).toBe(false);
    // a later game doesn't move it: the recap counts back from his total now
    for (let i = 0; i < 3; i++) simDay(l);
    expect(milestonesIn(l, res)).toEqual(marks);
    expect(careerTotals(a).pts).toBeGreaterThanOrEqual(9999);
  });
});

describe('storylines', () => {
  it('say what the data shows: a revenge game, a milestone in reach, a streak, two No. 1 picks', () => {
    const l = testLeague('stories');
    toGameDay(l);
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
    expect(text).toContain(`${kid.lastName} needs 6 points for 1,000 in his career (he averages 15.1).`);
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
  });
});

describe('the three stars and the comeback quotes', () => {
  it('put the player of the game first, then the best two games on either side', () => {
    const l = testLeague('stars');
    for (let i = 0; i < 3; i++) simDay(l);
    for (const r of l.games.slice(0, 20)) {
      const stars = threeStars(r);
      expect(stars).toHaveLength(3);
      expect(stars[0].line.pid).toBe(r.pog);
      expect(new Set(stars.map((s) => s.line.pid)).size).toBe(3);
    }
  });

  it('a comeback from 15% or less gets its own words, from both sides', () => {
    const l = testLeague('comeback');
    toGameDay(l);
    simDay(l);
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
  });
});
