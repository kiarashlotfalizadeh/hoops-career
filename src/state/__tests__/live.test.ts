// Regression tests for the live-game controller: a live game is recorded exactly once, in the
// league that's open, however the user leaves it (Main menu, a reload, the Play menu), and the
// quarter skip stops at the break.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { pendingLive, playedElsewhere, prepareLive, type LiveGame } from '../live';
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
