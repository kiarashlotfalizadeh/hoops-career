// Regression tests for the live-game controller: a live game is recorded exactly once, in the
// league that's open, however the user leaves it (Main menu, a reload, the Play menu), the
// skips stop at the break, and a game in progress survives the app being closed (its journal plays
// it back to where it was saved, sets included).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLUTCH_SEC, checkpointLive, clearLive, dropLive, liveInProgress, pendingLive, playedElsewhere, prepareLive, type LiveGame } from '../live';
import { useStore } from '../store';
import { loadLeague, migrate } from '../persistence';
import { flowActions } from '../../ui/flow';
import { regularGamesLeft, simDay } from '../../core/league/season';
import { releasePlayer, signPlayer } from '../../core/league/contracts';
import { buildGameReport } from '../../core/analysis/gameReport';
import { REEL_MAX } from '../../core/analysis/highlights';
import { curTeamSeason } from '../../core/league/helpers';
import { guideDone } from '../../core/league/agenda';
import type { League, LiveJournal, Rotation } from '../../core/types';
import { gamesOnDay } from '../../core/league/games';
import { emptyPatch, tacticsDiff } from '../../core/sim/tactics';
import { snapshot, subsLine } from '../../ui/live/drawn';
import { resetToPlan, withMentalityOf } from '../../ui/live/pills';
import type { PossLog } from '../../core/sim/log';
import { oppPlanIn, preparesPlan } from '../../core/ai/opponentPlan';
import { userGameOnDay } from '../../core/league/games';
import { testLeague, toGameDay, userGames } from './fixtures';
import { applyOp, forkSim, measureChoices, nightWorth, playOut, type LiveChoice } from '../liveWorth';

/** Open the league and start today's game the way the Live screen does. */
function goLive(l: League): LiveGame {
  useStore.getState().setLeague(l);
  let lg: LiveGame | null = null;
  useStore.getState().mutate((x) => (lg = prepareLive(x)));
  if (!lg) throw new Error('no live game');
  return lg;
}

/**
 * A dozen days in, so the other coaches have games of yours to plan against, every AI coach at the top of
 * the tactics scale, on to the next game of yours whose coach game-plans for it.
 */
function toPlannedGame(l: League) {
  for (let i = 0; i < 12; i++) simDay(l);
  for (const t of l.teams) if (t.tid !== l.userTid) t.coach.tactics = 99;
  toGameDay(l);
  for (let g = userGameOnDay(l, l.day)!; !preparesPlan(l, g.home === l.userTid ? g.away : g.home, g.gid); g = userGameOnDay(l, l.day)!) {
    simDay(l);
    toGameDay(l);
  }
}
const once = (l: League, gid: number) => l.games.filter((g) => g.gid === gid).length;

/** Each scenario starts with no league open and no game in this session. */
function fresh() {
  vi.restoreAllMocks();
  useStore.getState().setLeague(null);
  clearLive();
}

afterEach(fresh);

/** Today's game with every kind of coaching move along the way, into the second half. */
function coachedGame(l: League): LiveGame {
  const lg = goLive(l);
  const play = (n: number) => {
    for (let i = 0; i < n; i++) lg.step();
  };
  play(12);
  const t = lg.sim.T[lg.userSide];
  const out = t.on[0].pid;
  expect(lg.substitute(out, t.players.find((p) => !p.on && p.out === 0)!.pid)).toBe(true);
  play(20);
  const tactics = lg.sim.baseTactics(lg.userSide);
  tactics.offense.pace = tactics.offense.pace > 50 ? 15 : 90;
  tactics.defense.pressure = 80;
  lg.setTactics(tactics);
  lg.setManualSubs(true);
  play(25);
  expect(lg.callTimeout('test')).toBe(true);
  play(3);
  lg.setManualSubs(false);
  lg.simTo('half');
  play(7);
  return lg;
}

/** A live game coached with sets: an after-timeout set, timeouts to run it, a set called out of the huddle, and a clear-out called from the bench for the go-to player. */
function setsGame(l: League): LiveGame {
  const lg = goLive(l);
  const play = (n: number) => {
    for (let i = 0; i < n && !lg.over; i++) lg.step();
  };
  play(10);
  const t = lg.sim.baseTactics(lg.userSide);
  t.manage.ato = 'elevator';
  t.manage.goTo = lg.sim.T[lg.userSide].on[0].pid;
  lg.setTactics(t);
  play(15);
  expect(lg.callTimeout()).toBe(true);
  play(8);
  lg.callTimeout();
  // a play called out of the huddle: queued for the next half-court trip, in place of the after-timeout set
  expect(lg.callPlay('hammer')).toBe(true);
  expect(lg.calledPlay?.set).toBe('hammer');
  play(6);
  lg.simTo('half');
  play(9);
  // (no timeout: shouted from the bench, for the closer the late call is built around)
  expect(lg.callPlay('iso', lg.sim.closer(lg.sim.T[lg.userSide])!.pid)).toBe(true);
  play(6);
  return lg;
}

describe('live game', () => {
  it('is recorded exactly once, in the league that is open, however it is left, and the league goes on from it', { timeout: 180_000 }, async () => {
    fresh();

    // plays nothing outside the season: opening night waits for the regular season to start
    {
      const l = testLeague('pre');
      toGameDay(l);
      l.phase = 'preseason';
      const [day, played] = [l.day, l.games.length];
      expect(prepareLive(l)).toBeNull();
      expect([l.day, l.games.length]).toEqual([day, played]);
    }

    // reopening the league never resumes the old controller, so the season can end (I1)
    {
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
      fresh();
    }

    // the Play menu finishes a game in progress first
    {
      const l = testLeague('flow');
      toGameDay(l);
      const lg = goLive(l);
      expect(flowActions(l, { onLive: true }).map((a) => a.label)).toEqual(['Finish this game']);
      lg.simTo('quarter');
      const off = flowActions(l);
      expect(off[0].label).toBe('Resume live game');
      const me = lg.sim.T[lg.userSide].score;
      // where the game stands: the break, and the score from the user's side (however the menu words it)
      expect(off[0].sub).toMatch(new RegExp(`^End of Q1 · .*\\b${me}-${lg.sim.T[1 - lg.userSide].score}$`));
      expect(off.find((a) => a.id === 'quick')?.label).toBe('Finish this game');
      fresh();
    }

    // a sim from the Play menu finishes the live game once, from its current score (UI1-1)
    {
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
      fresh();
    }

    // a live game that throws as "Finish this game" plays it out stays where it was, and finishes once later
    {
      const l = testLeague('reload');
      toGameDay(l);
      const lg = goLive(l);
      lg.simTo('quarter');
      const day = l.day;
      expect(playedElsewhere(lg, l)).toBeNull();
      // "Finish this game" from the Play menu throws halfway: the league goes back to how it was before it
      const commit = lg.commit.bind(lg);
      lg.commit = () => {
        throw new Error('boom');
      };
      await useStore.getState().simulate({ kind: 'days', n: 1 });
      expect(useStore.getState().league).toBe(l);
      expect(l.day).toBe(day);
      expect(once(l, lg.game.gid)).toBe(0);
      expect(useStore.getState().toasts.at(-1)?.text).toMatch(/hit an error/);
      // the game is still today's to finish, and finishing it records it once
      expect(playedElsewhere(lg, l)).toBeNull();
      lg.commit = commit;
      expect(lg.commit(l).gid).toBe(lg.game.gid);
      expect(playedElsewhere(lg, l)).toBe(lg.game.gid);
      expect(once(l, lg.game.gid)).toBe(1);
      fresh();
    }

    // a game the Live screen finishes while "Finish this game" is saving is the one day that sim plays
    {
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
      fresh();
    }

    // a game played without the controller is not recorded again
    {
      const l = testLeague('elsewhere');
      toGameDay(l);
      const lg = goLive(l);
      simDay(l);
      const day = l.day;
      expect(pendingLive(l)).toBeNull();
      expect(lg.commit(l).gid).toBe(lg.game.gid);
      expect(once(l, lg.game.gid)).toBe(1);
      expect(l.day).toBe(day);
      fresh();
    }

    // a switched team never resumes the old team's game
    {
      const l = testLeague('switch');
      toGameDay(l);
      const lg = goLive(l);
      useStore.getState().mutate((x) => (x.userTid = lg.game.home === x.userTid ? lg.game.away : lg.game.home));
      expect(pendingLive(l)).toBeNull();
      fresh();
    }

    // a player who leaves the team mid-game keeps the game he played, for the team he played it for
    {
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
      fresh();
    }

    // (the failures below are on purpose)
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // recording it throws halfway: the league goes back to before the game, nothing half-done is saved, and the game can still be finished
    {
      const l = testLeague('record error');
      toGameDay(l);
      const lg = goLive(l);
      lg.simTo('quarter');
      await useStore.getState().flush();
      // the rest is played before anything breaks (an overtime reads the rotation's closers: one played
      // after the rotation is gone would throw before the recording does)
      lg.simTo('end');
      const day = l.day;
      // something in playing out the day throws (here the assistant's rotation update for the user's team)
      const rot = l.teams[l.userTid].rotation;
      l.teams[l.userTid].rotation = null as unknown as Rotation;
      const before = structuredClone(l);
      expect(useStore.getState().attempt('Recording the game', (x) => void lg.commit(x))).toBe(false);
      expect(l).toEqual(before);
      expect(useStore.getState().toasts.at(-1)?.text).toMatch(/^Recording the game hit an error, so nothing changed/);
      // (the screen goes Home: the game is still there to pick up)
      dropLive();
      l.teams[l.userTid].rotation = rot;
      expect(liveInProgress(l)?.gid).toBe(lg.game.gid);
      // the next save has the league as it was: no game recorded on a day that never ended
      useStore.getState().mutate((x) => (x.name = 'next change'));
      await useStore.getState().save();
      const back = (await loadLeague(l.id))!;
      expect([back.day, once(back, lg.game.gid), back.schedule.find((g) => g.gid === lg.game.gid)!.played, back.live?.gid]).toEqual([day, 0, undefined, lg.game.gid]);
      // and "Finish this game" plays it from where it was saved, as the coached game would have gone
      await useStore.getState().simulate({ kind: 'days', n: 1 });
      expect([l.day, once(l, lg.game.gid)]).toEqual([day + 1, 1]);
      const res = l.games.find((g) => g.gid === lg.game.gid)!;
      expect([res.home.pts, res.away.pts]).toEqual([lg.sim.T[0].score, lg.sim.T[1].score]);
      useStore.getState().setLeague(null);
      clearLive();
    }

    // setting it up throws while the day's other games are played: they are put back
    {
      const l = testLeague('setup error');
      toGameDay(l);
      useStore.getState().setLeague(l);
      const others = gamesOnDay(l, l.day).filter((g) => g.home !== l.userTid && g.away !== l.userTid);
      expect(others.length).toBeGreaterThan(1);
      // the last of them throws, after the others are played
      const broken = others.at(-1)!.home;
      const rot = l.teams[broken].rotation;
      l.teams[broken].rotation = null as unknown as Rotation;
      const before = structuredClone(l);
      expect(useStore.getState().attempt('Setting up the game', (x) => void prepareLive(x))).toBe(false);
      dropLive();
      expect(l).toEqual(before);
      expect([pendingLive(l), liveInProgress(l)]).toEqual([null, null]);
      // set up again once nothing throws: each of the day's games is played once
      l.teams[broken].rotation = rot;
      const lg = goLive(l);
      expect(others.map((g) => once(l, g.gid))).toEqual(others.map(() => 1));
      expect(once(l, lg.game.gid)).toBe(0);
    }
  });

  it('coaching it: skips stop at the break, the reports and Subs sheet as the game stands, the highlights kept', { timeout: 180_000 }, () => {
    fresh();

    // skipping to the end of a quarter stops at the break (E12)
    {
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
      // and stops sooner, on the first possession something calls for it (a starter of yours hurt: useLiveGame.skip)
      const steps = lg.steps;
      lg.simTo('quarter', () => lg.steps >= steps + 3);
      expect(lg.steps).toBe(steps + 3);
      fresh();
    }

    // skips to halftime and to clutch time, and plays nothing once past them
    {
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
      // stopped on the possession that crossed 5:00 (one with two offensive boards runs 24 + 14 + 14 seconds,
      // and a team well ahead now walks it up and runs the clock)
      expect(lg.sim.clock).toBeGreaterThan(CLUTCH_SEC - 55);
      expect(lg.simTo('clutch')).toEqual([]);
      expect(lg.simTo('half')).toEqual([]);
      lg.simTo('end');
      expect(lg.over).toBe(true);
      fresh();
      // with your subs on, nobody makes them along a skip: the Live screen hands them to the staff for it
      // and back where it stops (useLiveGame.skip). Held, a starter plays all 43 minutes to clutch time (handed, 35 at most)
      const most = (hand: boolean) => {
        const l = testLeague('half');
        toGameDay(l);
        const g = goLive(l);
        g.setManualSubs(true);
        if (hand) g.setManualSubs(false);
        g.simTo('clutch');
        if (hand) g.setManualSubs(true);
        expect(g.manualSubs).toBe(true);
        const sec = Math.max(...g.sim.T[g.userSide].players.map((p) => p.b.sec));
        fresh();
        return sec;
      };
      const [held, handed] = [most(false), most(true)];
      expect(held).toBeGreaterThan(40 * 60);
      expect(handed).toBeLessThan(held - 5 * 60);
    }

    // keeps the tactics it tipped off with (game plan included) for "Reset to game plan"
    {
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
      fresh();
    }

    // replaces tactics whole, and puts a mentality back to the game's own value
    {
      const l = testLeague('reset');
      toGameDay(l);
      const lg = goLive(l);
      const x = lg.sim.baseTactics(lg.userSide);
      x.mentality = 2;
      resetToPlan(x, lg.planned);
      expect(x.mentality).toBe(lg.planned.mentality);
      withMentalityOf(x, 1, lg.planned);
      expect(x.mentality).toBe(1);
      withMentalityOf(x, lg.planned.mentality ?? 0, lg.planned);
      expect(emptyPatch(tacticsDiff(lg.planned, x))).toBe(true);
      expect(JSON.stringify(x)).toBe(JSON.stringify(lg.planned));
      fresh();
    }

    // describes a game at a break in the present tense, and a finished one as before
    {
      const l = testLeague('partial');
      toGameDay(l);
      const lg = goLive(l);
      lg.simTo('half');
      const half = buildGameReport(l, lg.sim.result(), l.userTid, { partial: true, elapsed: lg.sim.elapsed })!;
      expect(half.headline).toMatch(/^Halftime: the .+ (lead|trail) the .+ \d+-\d+\.|^Halftime: the .+ and the .+ are tied at \d+\./);
      expect(half.headline).not.toMatch(/ beat | fell to /);
      if (/Biggest factor/.test(half.headline)) expect(half.headline).toContain('Biggest factor so far:');
      expect(half.factors.some((x) => x.category === 'stars')).toBe(false);
      lg.simTo('quarter');
      expect(buildGameReport(l, lg.sim.result(), l.userTid, { partial: true })!.headline).toMatch(/^After Q3: /);
      const res = lg.commit(l);
      const full = buildGameReport(l, res)!;
      expect(full.headline).toMatch(/^The .+ (beat|fell to) the .+ \d+-\d+/);
      // the options only change a report that asks for them
      expect(buildGameReport(l, res, l.userTid, { partial: false })).toEqual(full);
      expect(full.factors.filter((f) => f.category === 'stars').every((f) => /erupted for (3[5-9]|[4-9]\d)/.test(f.title))).toBe(true);
      fresh();
    }

    // a star line at a break isn't what's deciding the game: a quarter's points on pace for 50 are a few
    // shots falling (the luck line beside it counts them), and there's nothing to double for them
    {
      const l = testLeague('star');
      toGameDay(l);
      const lg = goLive(l);
      lg.simTo('quarter');
      const res = lg.sim.result();
      const mine = res.home.tid === l.userTid ? res.home : res.away;
      const star = [...mine.players].sort((a, b) => b.pts - a.pts)[0];
      star.pts = Math.max(14, star.pts);
      const q1 = buildGameReport(l, res, l.userTid, { partial: true })!;
      expect(q1.factors.some((x) => x.category === 'stars')).toBe(false);
      expect(buildGameReport(l, res)!.factors.some((x) => x.category === 'stars' && x.title.startsWith(star.name))).toBe(false);
      fresh();
    }

    // the Subs sheet reads each player's numbers and whether he's out from the game as the court has drawn it, not the possession still being drawn
    {
      const l = testLeague('subs sheet');
      toGameDay(l);
      const lg = goLive(l);
      for (let i = 0; i < 40; i++) lg.step();
      // the court finished drawing here; the sim then plays the next possession, which the court is drawing
      const view = snapshot(lg.sim);
      lg.step();
      const t = lg.sim.T[lg.userSide];
      const p = t.on[0];
      // (as if he fouled out in it: the court hasn't shown that yet)
      p.out = 1;
      p.fouls = 6;
      const drawn = view.sides[lg.userSide].players.find((x) => x.pid === p.pid)!;
      const box = (lg.userSide === 0 ? view.box.home : view.box.away).players.find((x) => x.pid === p.pid)!;
      expect(subsLine(view, lg.userSide, p)).toEqual({
        energy: Math.round(drawn.energy * 100),
        fouls: drawn.fouls,
        pts: drawn.pts,
        min: Math.round(box.min),
        out: 0,
      });
      expect(Math.round(box.min)).toBeLessThanOrEqual(Math.round(p.b.sec / 60));
      fresh();
    }

    // the highlights are kept with the save once the game is recorded, without their play-by-play, and replaced by the next live game
    {
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
      // neither game, skipped to its end with no move made, coached one for the first-week guide; a quarter's worth watched does
      expect(guideDone(l).has('coach')).toBe(false);
      simDay(l);
      toGameDay(l);
      const watched = prepareLive(l)!;
      while (watched.sim.q === 1) watched.step();
      watched.commit(l);
      expect(guideDone(l).has('coach')).toBe(true);
    }
  });

  it('survives the app being closed (W12): its journal plays it back to where it was saved, or starts it over, and a damaged one is dropped', { timeout: 180_000 }, async () => {
    fresh();

    // picks up where it was saved, with the same score, clock and box, and records the game it would have been
    {
      const l = testLeague('journal');
      toGameDay(l);
      const lg = coachedGame(l);
      lg.setKeep(l.teams[l.userTid].tactics);
      lg.markSeen([1, 2]);
      // the app is hidden (then closed): the store saves where the game is
      await useStore.getState().flush();
      expect(l.live).toMatchObject({ gid: lg.game.gid, tid: l.userTid, steps: lg.steps, q: lg.sim.q, clock: lg.sim.clock, score: [lg.sim.T[0].score, lg.sim.T[1].score] });
      expect(l.live!.ops.map((o) => o.op)).toEqual(['sub', 'tactics', 'manualSubs', 'timeout', 'manualSubs']);
      // opened again: the league as it was saved, and no game open in this session
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      expect(pendingLive(back)).toBeNull();
      const again = prepareLive(back)!;
      expect(again).not.toBe(lg);
      expect(again.resumed).toBe('journal');
      expect([again.steps, again.sim.q, again.sim.clock, again.sim.T[0].score, again.sim.T[1].score]).toEqual([
        lg.steps,
        lg.sim.q,
        lg.sim.clock,
        lg.sim.T[0].score,
        lg.sim.T[1].score,
      ]);
      expect(again.sim.result()).toEqual(lg.sim.result());
      expect(again.logs).toEqual(lg.logs);
      // the night's moves, each with the logs before it, read the same after the playback
      expect(lg.marks.map((m) => m.op.op)).toEqual(['sub', 'tactics', 'timeout']);
      expect(lg.marks[1].before?.defense.pressure).not.toBe(80);
      expect(lg.marks.every((m, i) => m.log <= lg.logs.length && (i === 0 || m.log >= lg.marks[i - 1].log))).toBe(true);
      expect(again.marks).toEqual(lg.marks);
      expect(again.sim.pbp).toEqual(lg.sim.pbp);
      expect(again.planned).toEqual(lg.planned);
      expect(again.sim.baseTactics(again.userSide)).toEqual(lg.sim.baseTactics(lg.userSide));
      expect([again.manualSubs, again.sim.T[again.userSide].timeouts]).toEqual([lg.manualSubs, lg.sim.T[lg.userSide].timeouts]);
      expect([again.keep, again.seen]).toEqual([lg.keep, [1, 2]]);
      // a copy of the game (state/liveWorth.ts) plays on as the game itself does; a choice measured from
      // here reads the same every time, and the game as it stands reads even against itself
      const side = again.userSide;
      const end = playOut(forkSim(again.sim), side);
      const choices: LiveChoice[] = [
        { kind: 'none' },
        { kind: 'noPlay' },
        { kind: 'tactics', tactics: { ...again.sim.baseTactics(side), defense: { ...again.sim.baseTactics(side).defense, scheme: 'zone23' } } },
      ];
      const read = (await measureChoices(again.sim, side, choices, { games: 24 }))!;
      expect(read.slice(0, 2).map((r) => [r.pts, r.win, r.n])).toEqual([
        [0, 0, 24],
        [0, 0, 24],
      ]);
      expect(await measureChoices(again.sim, side, choices, { games: 24 })).toEqual(read);
      // the rest of the game, and its record, are what the game left open would have had
      const res = again.commit(back);
      expect(res).toEqual(lg.commit(l));
      expect(end.pts).toBe(side === 0 ? res.home.pts - res.away.pts : res.away.pts - res.home.pts);
      // the game at tip-off, kept with it, played on the same seed with the journal's moves where they
      // were made is tonight's game; the night's moves are measured from it, with them and without
      {
        const tip = forkSim(lg.tip);
        const ops = lg.journal.ops;
        let at = 0;
        let k = 0;
        while (!tip.over) {
          while (k < ops.length && ops[k].at <= at) applyOp(tip, side, ops[k++]);
          tip.step();
          at++;
        }
        expect([tip.T[0].score, tip.T[1].score]).toEqual([res.home.pts, res.away.pts]);
        expect(lg.tip.T[0].score + lg.tip.T[1].score).toBe(0);
        const w = (await nightWorth(lg.tip, side, ops, { games: 30 }))!;
        // (switching the subs to you and back isn't a move: it's how the game was run, either way)
        expect([w.n, w.moves]).toEqual([30, 3]);
        expect(Math.abs(w.pts)).toBeLessThanOrEqual(Math.abs(w.raw));
        expect(w.se).toBeGreaterThan(0);
        expect(await nightWorth(lg.tip, side, ops, { games: 30 })).toEqual(w);
        expect(
          await nightWorth(
            lg.tip,
            side,
            ops.filter((o) => o.op === 'manualSubs'),
          ),
        ).toBeNull();
      }
      expect([back.live, l.live, once(back, res.gid)]).toEqual([undefined, undefined, 1]);
      // the result keeps the night's moves and the scoring around each
      expect(res.moves!.map((m) => m.kind)).toEqual(['sub', 'tactics', 'timeout']);
      expect(res.moves![1].text).toMatch(/Ball pressure|Pace/);
      const all = res.moves![1];
      expect(all.before.us.poss + all.after.us.poss + all.before.them.poss + all.after.them.poss).toBe(lg.logs.length);
      fresh();
    }

    // closed between saves: picked up from the last one, saying how many possessions it went back; a clean pick-up says nothing of the kind
    {
      const kept = new Map<string, string>();
      vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) });
      const l = testLeague('rewind');
      toGameDay(l);
      const lg = goLive(l);
      // saved at the end of the first quarter (as the Live screen saves every period's end), then played on
      lg.simTo('quarter');
      await useStore.getState().flush();
      const at = lg.steps;
      for (let i = 0; i < 9; i++) lg.step();
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      const again = prepareLive(back)!;
      expect([again.resumed, again.steps, again.sim.q, again.rewound]).toEqual(['journal', at, 1, 9]);
      // opened again with nothing played since: where it left off, nothing lost
      const third = (await loadLeague(l.id))!;
      useStore.getState().setLeague(third);
      expect([prepareLive(third)!.resumed, prepareLive(third)!.rewound]).toEqual(['journal', undefined]);
      vi.unstubAllGlobals();
      fresh();
    }

    // takes a timeout asked for in their live ball at the next dead ball, and plays it back from the journal
    {
      const l = testLeague('waitTO');
      toGameDay(l);
      const lg = goLive(l);
      const s = lg.sim as unknown as { poss: number; ctx: string; clock: number };
      const me = lg.userSide;
      // they have the ball after a steal or a defensive board
      while (!lg.over && !(s.poss !== me && (s.ctx === 'steal' || s.ctx === 'dreb') && s.clock > 60)) lg.step();
      const left = lg.sim.T[me].timeouts;
      expect(lg.callTimeout('test')).toBe(true);
      expect([lg.timeoutWaiting, lg.sim.T[me].timeouts]).toEqual([true, left]);
      // their trip plays on; the timeout comes at the dead ball after it, and opens ours (the huddle's cue)
      const [theirs] = lg.step();
      expect(theirs.off).not.toBe(me);
      expect(theirs.steps.some((st) => st.k === 'timeout' && st.t === me)).toBe(false);
      expect([lg.timeoutWaiting, lg.sim.T[me].timeouts, lg.sim.timeoutOpens()]).toEqual([false, left - 1, me]);
      const [mine] = lg.step();
      expect([mine.off, mine.steps[0], mine.kind === 'transition']).toEqual([me, { k: 'timeout', t: me }, false]);
      // asked for again and saved while it waits: the journal plays it back the same
      while (!lg.over && !(s.poss !== me && (s.ctx === 'steal' || s.ctx === 'dreb') && s.clock > 60 && lg.sim.T[me].timeouts > 1)) lg.step();
      expect(lg.callTimeout()).toBe(true);
      expect(lg.timeoutWaiting).toBe(true);
      await useStore.getState().flush();
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      const again = prepareLive(back)!;
      expect(again.resumed).toBe('journal');
      expect([again.timeoutWaiting, again.sim.T[me].timeouts]).toEqual([true, lg.sim.T[me].timeouts]);
      for (let i = 0; i < 3; i++) expect(again.step()).toEqual(lg.step());
      expect(again.sim.result()).toEqual(lg.sim.result());
      fresh();
    }

    // refuses a timeout at the buzzer, and plays a change made at the break back from the journal
    {
      const l = testLeague('buzzer');
      toGameDay(l);
      const lg = goLive(l);
      const me = lg.userSide;
      // the Live screen stops at the end of the first quarter: the sim is at the buzzer
      lg.simTo('quarter');
      expect([lg.sim.q, lg.sim.clock <= 0.05]).toEqual([1, true]);
      const left = lg.sim.T[me].timeouts;
      expect(lg.callTimeout()).toBe(false);
      expect(lg.sim.T[me].timeouts).toBe(left);
      const t = lg.sim.baseTactics(me);
      t.defense.scheme = 'zone23';
      lg.setTactics(t);
      await useStore.getState().flush();
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      const again = prepareLive(back)!;
      expect(again.resumed).toBe('journal');
      // the second quarter plays the zone, the same in both
      let ran: PossLog | undefined;
      for (let i = 0; i < 12 && !ran; i++) {
        const logs = lg.step();
        expect(again.step()).toEqual(logs);
        ran = logs.find((x) => x.off !== me && x.kind === 'half');
      }
      expect(ran?.q).toBe(2);
      expect(ran?.scheme).toBe('zone23');
      expect(again.sim.T[me].timeouts).toBe(left);
      fresh();
    }

    // sets: an after-timeout set and the plays called are journaled and played back exactly
    {
      const l = testLeague('sets-journal');
      toGameDay(l);
      const lg = setsGame(l);
      // the game ran sets (the after-timeout play, the call)
      expect(lg.logs.filter((x) => x.set && x.off === lg.userSide).length).toBeGreaterThan(1);
      // the call is journaled, ran on a trip of ours, and is one of the night's moves
      expect(l.live!.ops.some((o) => o.op === 'play' && o.args.set === 'hammer')).toBe(true);
      expect(lg.calledPlay).toBeNull();
      expect(lg.logs.some((x) => x.off === lg.userSide && x.set?.id === 'hammer')).toBe(true);
      // the clear-out is journaled and ran as his isolation
      const iso = l.live!.ops.find((o) => o.op === 'play' && o.args.set === 'iso');
      const ran = lg.logs.find((x) => x.off === lg.userSide && x.iso !== undefined);
      expect(iso?.op === 'play' && iso.args.pid).toBe(ran?.iso);
      expect(ran?.action).toBe('iso');
      await useStore.getState().flush();
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      expect(pendingLive(back)).toBeNull();
      const again = prepareLive(back)!;
      expect(again.resumed).toBe('journal');
      expect(again.sim.result()).toEqual(lg.sim.result());
      expect(again.logs).toEqual(lg.logs);
      expect(again.sim.setReads(again.userSide)).toEqual(lg.sim.setReads(lg.userSide));
      const res = lg.commit(l);
      expect(again.commit(back)).toEqual(res);
      expect(res.moves?.find((m) => m.call?.id === 'iso')).toMatchObject({ kind: 'play', call: { pid: ran!.iso }, after: { us: { poss: 1 } } });
      fresh();
    }

    // plays the other coach's game plan again, and the result keeps it
    {
      const l = testLeague('opp-plan');
      toPlannedGame(l);
      const lg = goLive(l);
      const them = (1 - lg.userSide) as 0 | 1;
      const plan = oppPlanIn(lg.sim, them);
      expect(plan?.items.length).toBeGreaterThan(0);
      lg.simTo('quarter');
      lg.setManualSubs(true);
      for (let i = 0; i < 15; i++) lg.step();
      await useStore.getState().flush();
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      const again = prepareLive(back)!;
      expect(again.resumed).toBe('journal');
      expect(oppPlanIn(again.sim, them)).toEqual(plan);
      expect(again.sim.baseTactics(them)).toEqual(lg.sim.baseTactics(them));
      const res = again.commit(back);
      expect(res.oppPlan).toEqual(plan!.items.map((it) => it.text));
      expect(res).toEqual(lg.commit(l));
      fresh();
    }

    // picks the game up with the other coach's plan as it tipped off, after his tactics rating changed or under a new league id
    {
      const l = testLeague('opp-plan-keep');
      toPlannedGame(l);
      const lg = goLive(l);
      const them = (1 - lg.userSide) as 0 | 1;
      const plan = oppPlanIn(lg.sim, them);
      expect(plan?.items.length).toBeGreaterThan(0);
      lg.simTo('quarter');
      for (let i = 0; i < 10; i++) lg.step();
      await useStore.getState().flush();
      const back = (await loadLeague(l.id))!;
      // a coach at the bottom of the scale plans less often, and a backup imported as a copy gets a new id (plans are drawn from it)
      back.teams[lg.sim.T[them].tid].coach.tactics = 0;
      back.id = `${back.id}-copy`;
      useStore.getState().setLeague(back);
      const again = prepareLive(back)!;
      expect(again.resumed).toBe('journal');
      expect(oppPlanIn(again.sim, them)).toEqual(plan);
      expect(again.sim.baseTactics(them)).toEqual(lg.sim.baseTactics(them));
      expect(again.commit(back).oppPlan).toEqual(plan!.items.map((it) => it.text));
      fresh();
    }

    // a journaled game is in progress for the Play menu and the screens waiting on it, and "Finish this game" plays on from where it was
    {
      const l = testLeague('menu-journal');
      toGameDay(l);
      const lg = goLive(l);
      lg.simTo('quarter');
      const q1 = [lg.sim.T[0].score, lg.sim.T[1].score];
      const me = lg.userSide;
      await useStore.getState().flush();
      const back = (await loadLeague(l.id))!;
      useStore.getState().setLeague(back);
      expect(pendingLive(back)).toBeNull();
      expect(liveInProgress(back)).toEqual({ gid: lg.game.gid, q: 1, clock: lg.sim.clock, score: [q1[me], q1[1 - me]] });
      const menu = flowActions(back);
      expect(menu[0]).toMatchObject({ label: 'Resume live game', sub: expect.stringMatching(new RegExp(`^End of Q1 · .*\\b${q1[me]}-${q1[1 - me]}$`)), cmd: 'watchLive' });
      expect(menu.find((a) => a.id === 'quick')?.label).toBe('Finish this game');
      expect(flowActions(back, { onLive: true }).map((a) => a.label)).toEqual(['Finish this game']);
      const day = back.day;
      await useStore.getState().simulate({ kind: 'days', n: 1 });
      expect(back.day).toBe(day + 1);
      const res = userGames(back).at(-1)!;
      expect(res.gid).toBe(lg.game.gid);
      expect([res.home.quarters[0], res.away.quarters[0]]).toEqual(q1);
      expect([once(back, res.gid), back.live, liveInProgress(back)]).toEqual([1, undefined, null]);
      fresh();
    }

    // ends the journal when the game is recorded or abandoned, but not when its league is closed
    {
      const l = testLeague('ends');
      toGameDay(l);
      const lg = goLive(l);
      expect(l.live?.gid).toBe(lg.game.gid);
      // Main menu (or another league): the game stays journaled in this one, to pick up when it's opened again
      useStore.getState().setLeague(null);
      expect(pendingLive(l)).toBeNull();
      expect(l.live?.gid).toBe(lg.game.gid);
      expect(goLive(l).resumed).toBe('journal');
      clearLive();
      expect([pendingLive(l), l.live, liveInProgress(l)]).toEqual([null, undefined, null]);
      const anew = prepareLive(l)!;
      expect(anew.resumed).toBeUndefined();
      expect(l.live).toBe(anew.journal);
      anew.commit(l);
      expect(l.live).toBeUndefined();
      // a game recorded without its controller (the Play menu's sims) ends its journal too
      toGameDay(l);
      const next = goLive(l);
      useStore.getState().setLeague(null);
      simDay(l);
      expect(once(l, next.game.gid)).toBe(1);
      expect(l.live).toBeUndefined();
    }
    fresh();

    // a save made between checkpoints picks up from the last one, and every move is a checkpoint
    {
      const l = testLeague('between');
      toGameDay(l);
      const lg = goLive(l);
      lg.simTo('quarter');
      checkpointLive(l);
      const q1 = [lg.steps, lg.sim.clock, lg.sim.T[0].score, lg.sim.T[1].score];
      // played on, but no break, pause or move yet when the league was saved
      for (let i = 0; i < 9; i++) lg.step();
      const copy = structuredClone(l);
      lg.callTimeout();
      expect(l.live!.steps).toBe(lg.steps);
      clearLive();
      const again = prepareLive(copy)!;
      expect(again.resumed).toBe('journal');
      expect([again.steps, again.sim.clock, again.sim.T[0].score, again.sim.T[1].score]).toEqual(q1);
      fresh();
    }

    // starts the game over from tip-off when its journal doesn't play back to where it says
    {
      const l = testLeague('mismatch');
      toGameDay(l);
      const lg = coachedGame(l);
      checkpointLive(l);
      const damaged: [string, (j: LiveJournal) => void][] = [
        ['another score', (j) => void (j.score = [j.score[0] + 2, j.score[1]])],
        ['another clock', (j) => void (j.clock += 1)],
        ['another seed', (j) => void (j.seed = (j.seed + 1) >>> 0)],
        ['without its moves', (j) => void (j.ops = [])],
        ['a move from later on', (j) => void (j.ops[0].at = j.steps + 5)],
        ['tactics that are not tactics', (j) => void Object.assign(j.user, { tactics: {} })],
        ['more possessions than the game has', (j) => void (j.steps = 900)],
      ];
      // (each a copy of the league as saved, opened with no game open in this session)
      const copies = damaged.map(() => structuredClone(l));
      clearLive();
      damaged.forEach(([why, damage], i) => {
        const copy = copies[i];
        damage(copy.live!);
        const again = prepareLive(copy)!;
        expect(again.resumed, why).toBe('restarted');
        expect([again.game.gid, again.steps, again.sim.q, again.sim.T[0].score + again.sim.T[1].score], why).toEqual([lg.game.gid, 0, 1, 0]);
        // with a journal of its own, and the day's other games left as they were
        expect(copy.live, why).toMatchObject({ gid: lg.game.gid, steps: 0, ops: [] });
        expect([copy.games.length, once(copy, lg.game.gid)], why).toEqual([l.games.length, 0]);
        clearLive();
      });
      fresh();
    }

    // reading a save turns "Keep changes" off when its base is out of shape, and the game goes on
    {
      const l = testLeague('keep damaged');
      toGameDay(l);
      const lg = goLive(l);
      lg.setKeep(l.teams[l.userTid].tactics);
      lg.simTo('quarter');
      checkpointLive(l);
      const file = JSON.parse(JSON.stringify(l)) as League;
      const sound = JSON.parse(JSON.stringify(l)) as League;
      clearLive();
      // a crafted backup: tactics with nothing in them (any change with Keep on, or turning it off, would crash on them)
      (file.live as { keep: unknown }).keep = { offense: {}, defense: {}, manage: {} };
      const back = migrate(file);
      expect(back.live).toBeDefined();
      expect(back.live!.keep).toBeUndefined();
      useStore.getState().setLeague(back);
      const again = prepareLive(back)!;
      expect([again.resumed, again.keep, again.steps]).toEqual(['journal', null, lg.steps]);
      // a sound one stays
      expect(migrate(sound).live!.keep).toEqual(lg.keep);
      fresh();
    }

    // reading a save drops a damaged journal, and one that isn't for the game still to play today
    {
      const l = testLeague('read');
      toGameDay(l);
      coachedGame(l);
      checkpointLive(l);
      const saved = JSON.parse(JSON.stringify(l)) as League;
      expect(migrate(structuredClone(saved)).live).toEqual(saved.live);
      const later = l.schedule.find((g) => g.day > l.day && (g.home === l.userTid || g.away === l.userTid))!;
      const bad: [string, (j: LiveJournal) => void][] = [
        ['no seed', (j) => void delete (j as Partial<LiveJournal>).seed],
        ['negative steps', (j) => void (j.steps = -1)],
        ['far too many steps', (j) => void (j.steps = 1e9)],
        ['a score that is not two numbers', (j) => void Object.assign(j, { score: [1] })],
        ['a rotation without its order', (j) => void delete (j.user.rotation as Partial<LiveJournal['user']['rotation']>).order],
        ['tactics that are not tactics', (j) => void Object.assign(j.user, { tactics: 'x' })],
        ['moves out of order', (j) => void j.ops.reverse()],
        ['a move after the checkpoint', (j) => void (j.ops[j.ops.length - 1].at = j.steps + 1)],
        ['an unknown move', (j) => void Object.assign(j.ops[0], { op: 'eject' })],
        ['a sub without players', (j) => void Object.assign(j.ops[0], { args: {} })],
        [
          'a play call (retired: it can no longer play back)',
          (j) => void j.ops.push({ at: j.steps, op: 'call', args: { call: { kind: 'three' } } } as unknown as LiveJournal['ops'][number]),
        ],
        ['far too many moves', (j) => void (j.ops = Array.from({ length: 6000 }, () => ({ at: 0, op: 'manualSubs' as const, args: { on: false } })))],
        ['a game already played', (j) => void (j.gid = l.games[0].gid)],
        ["another day's game", (j) => void (j.gid = later.gid)],
        ['another team', (j) => void (j.tid = (j.tid + 1) % l.teams.length)],
      ];
      for (const [why, damage] of bad) {
        const x = structuredClone(saved);
        damage(x.live!);
        expect(migrate(x).live, why).toBeUndefined();
      }
      const x = structuredClone(saved) as unknown as Record<string, unknown>;
      x.live = 'x';
      expect(migrate(x).live).toBeUndefined();
      fresh();
    }

    // reading a save keeps the sets this version knows and drops the rest
    {
      const l = testLeague('sets-read');
      toGameDay(l);
      const lg = setsGame(l);
      checkpointLive(l);
      const saved = JSON.parse(JSON.stringify(l)) as League;
      expect(migrate(structuredClone(saved)).live).toEqual(saved.live);
      // tactics: a damaged after-timeout play goes
      const z = structuredClone(saved);
      const ut = z.teams[z.userTid].tactics as unknown as { offense: Record<string, unknown>; manage: Record<string, unknown> };
      ut.manage.ato = 'flex';
      ut.manage.atoPid = 'x';
      const ai = z.teams[(z.userTid + 1) % z.teams.length].tactics as unknown as { offense: Record<string, unknown>; manage: Record<string, unknown> };
      ai.manage.ato = 'spain';
      const m = migrate(z);
      expect(m.teams[m.userTid].tactics.manage.ato).toBeUndefined();
      expect(m.teams[m.userTid].tactics.manage.atoPid).toBeUndefined();
      expect(m.teams[(m.userTid + 1) % m.teams.length].tactics.manage.ato).toBe('spain');
      // a result's set tallies in shape, or dropped
      const res = lg.commit(l);
      expect(res.sets!.length).toBeGreaterThan(0);
      const w = JSON.parse(JSON.stringify(l)) as League;
      const g = w.games.find((r) => r.gid === res.gid)!;
      expect(migrate(structuredClone(w)).games.find((r) => r.gid === res.gid)!.sets).toEqual(res.sets);
      // and its moves, the plays called among them
      expect(res.moves!.filter((m) => m.kind === 'play').length).toBe(2);
      expect(migrate(structuredClone(w)).games.find((r) => r.gid === res.gid)!.moves).toEqual(res.moves);
      Object.assign(g.sets![0], { id: 'flex' });
      expect(migrate(w).games.find((r) => r.gid === res.gid)!.sets).toBeUndefined();
    }
  });
});
