// Regression tests for the live-game controller: a live game is recorded exactly once, in the
// league that's open, however the user leaves it (Main menu, a reload, the Play menu), and the
// quarter skip stops at the break.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLUTCH_SEC, pendingLive, playedElsewhere, prepareLive, type LiveGame } from '../live';
import { useStore } from '../store';
import { flowActions } from '../../ui/flow';
import { regularGamesLeft, simDay } from '../../core/league/season';
import { releasePlayer, signPlayer } from '../../core/league/contracts';
import { buildGameReport } from '../../core/analysis/gameReport';
import { curTeamSeason } from '../../core/league/helpers';
import type { League } from '../../core/types';
import { testLeague, toGameDay, userGames } from './fixtures';

/** Open the league and start today's game the way the Live screen does. */
function goLive(l: League): LiveGame {
  useStore.getState().setLeague(l);
  let lg: LiveGame | null = null;
  useStore.getState().mutate((x) => (lg = prepareLive(x)));
  if (!lg) throw new Error('no live game');
  return lg;
}

const once = (l: League, gid: number) => l.games.filter((g) => g.gid === gid).length;

beforeEach(() => useStore.getState().setLeague(null));

describe('live game', () => {
  it('plays nothing outside the season: opening night waits for the regular season to start', () => {
    const l = testLeague('pre');
    toGameDay(l);
    l.phase = 'preseason';
    const [day, played] = [l.day, l.games.length];
    expect(prepareLive(l)).toBeNull();
    expect([l.day, l.games.length]).toEqual([day, played]);
  });

  it('reopening the league never resumes the old controller, so the season can end (I1)', () => {
    const a = testLeague('reopen');
    toGameDay(a);
    const old = goLive(a);
    old.simTo('quarter');
    // Main menu, then the same league again: a fresh copy of the save
    const b = structuredClone(a);
    useStore.getState().setLeague(b);
    expect(pendingLive(b)).toBeNull();
    const lg = prepareLive(b)!;
    expect(lg).not.toBe(old);
    const day = b.day;
    const left = regularGamesLeft(b);
    lg.commit(b);
    expect(b.day).toBe(day + 1);
    expect(regularGamesLeft(b)).toBe(left - 1);
    expect(b.schedule.filter((g) => g.day <= day && !g.played)).toEqual([]);
    // the stale controller can't record its game in the open league a second time
    expect(old.commit(b).gid).toBe(lg.game.gid);
    expect(once(b, lg.game.gid)).toBe(1);
    expect(b.day).toBe(day + 1);
  });

  it('a sim from the Play menu finishes the live game once, from its current score (UI1-1)', async () => {
    const l = testLeague('menu');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('quarter');
    const q1 = [lg.sim.T[0].score, lg.sim.T[1].score];
    const day = l.day;
    const played = userGames(l).length;
    await useStore.getState().simulate({ kind: 'days', n: 1 });
    expect(l.day).toBe(day + 1);
    expect(l.schedule.filter((g) => g.day <= day && !g.played)).toEqual([]);
    const res = userGames(l).at(-1)!;
    expect(res.gid).toBe(lg.game.gid);
    expect(userGames(l)).toHaveLength(played + 1);
    expect([res.home.quarters[0], res.away.quarters[0]]).toEqual(q1);
    const ts = curTeamSeason(l, l.userTid);
    expect(ts.won + ts.lost).toBe(played + 1);
    // the Live screen finishing it afterwards records nothing and shows the report it got
    expect(lg.commit(l)).toBe(res);
    expect(playedElsewhere(lg, l)).toBe(res.gid);
    expect(once(l, res.gid)).toBe(1);
    expect(l.day).toBe(day + 1);
  });

  it('a live game whose league went back to its last save (a sim error) is gone, and the save plays it from tip-off', async () => {
    const l = testLeague('reload');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('quarter');
    expect(playedElsewhere(lg, l)).toBeNull();
    // "Finish this game" from the Play menu throws halfway: the store opens the last save in its place
    lg.commit = () => {
      throw new Error('boom');
    };
    await useStore.getState().simulate({ kind: 'days', n: 1 });
    const now = useStore.getState().league!;
    expect(now).not.toBe(l);
    // the Live screen stops animating it (finishing it would throw: its league isn't open any more)
    expect(playedElsewhere(lg, now)).toBe('gone');
    const again = prepareLive(now)!;
    expect(again.game.gid).toBe(lg.game.gid);
    expect([again.sim.T[0].score, again.sim.T[1].score]).toEqual([0, 0]);
    expect(playedElsewhere(again, now)).toBeNull();
    expect(again.commit(now).gid).toBe(lg.game.gid);
    expect(playedElsewhere(again, now)).toBe(lg.game.gid);
    expect(once(now, lg.game.gid)).toBe(1);
  });

  it('a game the Live screen finishes while "Finish this game" is saving is the one day that sim plays', async () => {
    const l = testLeague('race');
    toGameDay(l);
    const lg = goLive(l);
    const day = l.day;
    // the sim saves before its first day, and the court plays its last possession meanwhile
    const running = useStore.getState().simulate({ kind: 'days', n: 1 });
    useStore.getState().mutate((x) => void lg.commit(x));
    await running;
    expect(l.day).toBe(day + 1);
    expect(once(l, lg.game.gid)).toBe(1);
    expect(l.schedule.filter((g) => g.day === day + 1 && g.played)).toEqual([]);
  });

  it('a game played without the controller is not recorded again', () => {
    const l = testLeague('elsewhere');
    toGameDay(l);
    const lg = goLive(l);
    simDay(l);
    const day = l.day;
    expect(pendingLive(l)).toBeNull();
    expect(lg.commit(l).gid).toBe(lg.game.gid);
    expect(once(l, lg.game.gid)).toBe(1);
    expect(l.day).toBe(day);
  });

  it("a switched team never resumes the old team's game", () => {
    const l = testLeague('switch');
    toGameDay(l);
    const lg = goLive(l);
    useStore.getState().mutate((x) => (x.userTid = lg.game.home === x.userTid ? lg.game.away : lg.game.home));
    expect(pendingLive(l)).toBeNull();
  });

  it('a player who leaves the team mid-game keeps the game he played, for the team he played it for', () => {
    const l = testLeague('left');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('quarter');
    const gone = lg.sim.T[lg.userSide].on[0];
    const p = l.players[gone.pid];
    const opp = lg.game.home === l.userTid ? lg.game.away : lg.game.home;
    // released, then signed by the team on the other bench
    releasePlayer(l, p, { news: false });
    signPlayer(l, p, opp, 1500, 1, { news: false });
    const res = lg.commit(l);
    expect(once(l, res.gid)).toBe(1);
    const mine = res.home.tid === l.userTid ? res.home : res.away;
    expect(mine.players.some((b) => b.pid === p.pid && b.min > 0)).toBe(true);
    expect(p.tid).toBe(opp);
    expect(p.stats.find((s) => s.season === l.season && !s.real && s.tid === l.userTid)?.gp).toBe(1);
    expect(p.stats.some((s) => s.season === l.season && s.tid === opp)).toBe(false);
    expect(buildGameReport(l, res)?.grades.some((g) => g.pid === p.pid)).toBe(true);
    // the next day plans without him
    simDay(l);
    expect(l.teams[l.userTid].rotation.order).not.toContain(p.pid);
  });

  it('skipping to the end of a quarter stops at the break (E12)', () => {
    const l = testLeague('quarter');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('quarter');
    expect(lg.sim.q).toBe(1);
    expect(lg.sim.clock).toBeLessThanOrEqual(0.05);
    // from the break, the next skip covers the second quarter
    lg.simTo('quarter');
    expect(lg.sim.q).toBe(2);
    expect(lg.sim.clock).toBeLessThanOrEqual(0.05);
  });

  it('skips to halftime and to clutch time, and plays nothing once past them', () => {
    const l = testLeague('half');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('half');
    expect([lg.sim.q, lg.sim.clock <= 0.05]).toEqual([2, true]);
    // at halftime already: nothing more to play
    expect(lg.simTo('half')).toEqual([]);
    expect(lg.sim.q).toBe(2);
    lg.simTo('clutch');
    expect(lg.sim.q).toBe(4);
    expect(lg.sim.clock).toBeLessThanOrEqual(CLUTCH_SEC);
    // stopped on the possession that crossed 5:00
    expect(lg.sim.clock).toBeGreaterThan(CLUTCH_SEC - 30);
    expect(lg.simTo('clutch')).toEqual([]);
    expect(lg.simTo('half')).toEqual([]);
    lg.simTo('end');
    expect(lg.over).toBe(true);
  });

  it('keeps the tactics it tipped off with (game plan included) for "Reset to game plan"', () => {
    const l = testLeague('planned');
    toGameDay(l);
    const lg = goLive(l);
    const tip = JSON.stringify(lg.planned);
    const t = lg.sim.baseTactics(lg.userSide);
    t.offense.pace = t.offense.pace > 50 ? 10 : 90;
    lg.sim.setTactics(lg.userSide, t);
    lg.simTo('quarter');
    expect(JSON.stringify(lg.planned)).toBe(tip);
    expect(lg.sim.baseTactics(lg.userSide).offense.pace).toBe(t.offense.pace);
  });

  it('describes a game at a break in the present tense, and a finished one as before', () => {
    const l = testLeague('partial');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('half');
    const half = buildGameReport(l, lg.sim.result(), l.userTid, { partial: true, elapsed: lg.sim.elapsed })!;
    expect(half.headline).toMatch(/^Halftime: the .+ (lead|trail) the .+ \d+-\d+\.|^Halftime: the .+ and the .+ are tied at \d+\./);
    expect(half.headline).not.toMatch(/ beat | fell to /);
    if (/Biggest factor/.test(half.headline)) expect(half.headline).toContain('Biggest factor so far:');
    for (const f of half.factors.filter((x) => x.category === 'stars')) expect(f.title).toMatch(/so far/);
    lg.simTo('quarter');
    expect(buildGameReport(l, lg.sim.result(), l.userTid, { partial: true })!.headline).toMatch(/^After Q3: /);
    const res = lg.commit(l);
    const full = buildGameReport(l, res)!;
    expect(full.headline).toMatch(/^The .+ (beat|fell to) the .+ \d+-\d+/);
    // the options only change a report that asks for them
    expect(buildGameReport(l, res, l.userTid, { partial: false })).toEqual(full);
    expect(full.factors.filter((f) => f.category === 'stars').every((f) => /erupted for (3[5-9]|[4-9]\d)/.test(f.title))).toBe(true);
  });

  it('measures a star line at a break against the time played', () => {
    const l = testLeague('star');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('quarter');
    const res = lg.sim.result();
    const mine = res.home.tid === l.userTid ? res.home : res.away;
    const star = [...mine.players].sort((a, b) => b.pts - a.pts)[0];
    // a quarter of a game: 35 points' pace is about 9 (never fewer than 8)
    star.pts = Math.max(12, star.pts);
    const q1 = buildGameReport(l, res, l.userTid, { partial: true })!;
    const f = q1.factors.find((x) => x.category === 'stars' && x.title.startsWith(`${star.name} has ${star.pts} points so far`));
    expect(f?.detail).toBe(`On pace for ${star.pts * 4}.`);
    expect(buildGameReport(l, res)!.factors.some((x) => x.category === 'stars' && x.title.startsWith(star.name))).toBe(false);
  });

  it('the Play menu finishes a game in progress first', () => {
    const l = testLeague('flow');
    toGameDay(l);
    const lg = goLive(l);
    expect(flowActions(l, { onLive: true }).map((a) => a.label)).toEqual(['Finish this game']);
    lg.simTo('quarter');
    const off = flowActions(l);
    expect(off[0].label).toBe('Resume live game');
    const me = lg.sim.T[lg.userSide].score;
    expect(off[0].sub).toBe(`End of Q1 · ${me}-${lg.sim.T[1 - lg.userSide].score}`);
    expect(off.find((a) => a.id === 'quick')?.label).toBe('Finish this game');
  });
});

describe('postseason menu (UI1-17)', () => {
  it('offers "Sim to end of playoffs" once your team is out', () => {
    const l = testLeague('out');
    const other = (l.userTid + 1) % l.teams.length;
    l.phase = 'playoffs';
    l.day = l.regularSeasonDays + 20;
    l.playoffs = [{ id: 'E1-1', round: 1, conf: l.teams[l.userTid].conf, high: other, low: l.userTid, highSeed: 1, lowSeed: 8, highWins: 4, lowWins: 1, winner: other }];
    curTeamSeason(l, l.userTid).playoffRound = 1;
    const a = flowActions(l);
    expect(a[0]).toMatchObject({ label: 'Sim to end of playoffs', primary: true, sim: { kind: 'endPlayoffs' } });
    expect(a.some((x) => x.id === 'next')).toBe(false);
    l.phase = 'playin';
    curTeamSeason(l, l.userTid).playoffRound = -1;
    expect(flowActions(l)[0].sim).toEqual({ kind: 'endPlayoffs' });
    // a top-six seed waiting out the play-in still has a next game
    curTeamSeason(l, l.userTid).playoffRound = 1;
    expect(flowActions(l)[0].id).toBe('next');
  });
});
