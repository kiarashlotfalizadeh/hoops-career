// Regression tests for the live-game controller: a live game is recorded exactly once, in the
// league that's open, however the user leaves it (Main menu, a reload, the Play menu), the
// quarter skip stops at the break, and a game in progress survives the app being closed (its
// journal plays it back to where it was saved).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLUTCH_SEC, checkpointLive, clearLive, liveInProgress, pendingLive, playedElsewhere, prepareLive, type LiveGame } from '../live';
import { useStore } from '../store';
import { loadLeague, migrate } from '../persistence';
import { flowActions } from '../../ui/flow';
import { regularGamesLeft, simDay } from '../../core/league/season';
import { releasePlayer, signPlayer } from '../../core/league/contracts';
import { buildGameReport } from '../../core/analysis/gameReport';
import { curTeamSeason } from '../../core/league/helpers';
import type { League, LiveJournal } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import { oppPlanIn } from '../../core/ai/opponentPlan';
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

  it('a live game whose league went back to its last save (a sim error) is gone, and the save picks it up where it was saved', async () => {
    const l = testLeague('reload');
    toGameDay(l);
    const lg = goLive(l);
    lg.simTo('quarter');
    const q1 = [lg.sim.T[0].score, lg.sim.T[1].score];
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
    // the sim saved the league before it started: the game went into that save as far as the break
    expect(again.resumed).toBe('journal');
    expect([again.sim.q, again.sim.clock <= 0.05, [again.sim.T[0].score, again.sim.T[1].score]]).toEqual([1, true, q1]);
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

/** Today's game with every kind of coaching move along the way, into the second half, with a play call still waiting. */
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
  expect(lg.callPlay({ kind: 'three' })).toBe(true);
  play(3);
  lg.cancelPlay();
  lg.setManualSubs(false);
  expect(lg.callPlay({ kind: 'iso', pid: t.on[1].pid })).toBe(true);
  lg.simTo('half');
  play(7);
  expect(lg.callPlay({ kind: 'hold' })).toBe(true);
  return lg;
}

describe('a live game survives the app being closed (W12)', () => {
  it('picks up where it was saved, with the same score, clock and box, and records the game it would have been', async () => {
    const l = testLeague('journal');
    toGameDay(l);
    const lg = coachedGame(l);
    lg.setKeep(l.teams[l.userTid].tactics);
    lg.markSeen([1, 2]);
    // the app is hidden (then closed): the store saves where the game is
    await useStore.getState().flush();
    expect(l.live).toMatchObject({ gid: lg.game.gid, tid: l.userTid, steps: lg.steps, q: lg.sim.q, clock: lg.sim.clock, score: [lg.sim.T[0].score, lg.sim.T[1].score] });
    expect(l.live!.ops.map((o) => o.op)).toEqual(['sub', 'tactics', 'manualSubs', 'timeout', 'call', 'cancelCall', 'manualSubs', 'call', 'call']);
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
    expect(again.sim.pbp).toEqual(lg.sim.pbp);
    expect(again.planned).toEqual(lg.planned);
    expect(again.sim.baseTactics(again.userSide)).toEqual(lg.sim.baseTactics(lg.userSide));
    expect([again.manualSubs, again.pendingCall, again.sim.T[again.userSide].timeouts]).toEqual([lg.manualSubs, { kind: 'hold' }, lg.sim.T[lg.userSide].timeouts]);
    expect([again.keep, again.seen]).toEqual([lg.keep, [1, 2]]);
    // the rest of the game, and its record, are what the game left open would have had
    const res = again.commit(back);
    expect(res).toEqual(lg.commit(l));
    expect([back.live, l.live, once(back, res.gid)]).toEqual([undefined, undefined, 1]);
  });

  it('takes a timeout asked for in their live ball at the next dead ball, and plays it back from the journal', async () => {
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
  });

  it('keeps a call made at the buzzer for the next period, refuses a timeout there, and plays both back from the journal', async () => {
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
    expect(lg.callPlay({ kind: 'set', set: 'horns' })).toBe(true);
    await useStore.getState().flush();
    const back = (await loadLeague(l.id))!;
    useStore.getState().setLeague(back);
    const again = prepareLive(back)!;
    expect(again.resumed).toBe('journal');
    expect(again.pendingCall).toEqual({ kind: 'set', set: 'horns' });
    // the second quarter's first half-court trip of ours runs it, the same in both
    let ran: PossLog | undefined;
    for (let i = 0; i < 12 && !ran; i++) {
      const logs = lg.step();
      expect(again.step()).toEqual(logs);
      ran = logs.find((x) => x.off === me && x.kind === 'half');
    }
    expect(ran?.q).toBe(2);
    expect(ran?.call).toEqual({ kind: 'set', set: 'horns', t: me });
    expect([lg.pendingCall, again.pendingCall]).toEqual([null, null]);
    expect(again.sim.T[me].timeouts).toBe(left);
  });

  it("starts the game over from tip-off when its journal doesn't play back to where it says", () => {
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
  });

  it('a save made between checkpoints picks up from the last one, and every move is a checkpoint', () => {
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
  });

  it('ends the journal when the game is recorded or abandoned, but not when its league is closed', () => {
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
    const fresh = prepareLive(l)!;
    expect(fresh.resumed).toBeUndefined();
    expect(l.live).toBe(fresh.journal);
    fresh.commit(l);
    expect(l.live).toBeUndefined();
    // a game recorded without its controller (the Play menu's sims) ends its journal too
    toGameDay(l);
    const next = goLive(l);
    useStore.getState().setLeague(null);
    simDay(l);
    expect(once(l, next.game.gid)).toBe(1);
    expect(l.live).toBeUndefined();
  });

  it('a journaled game is in progress for the Play menu and the screens waiting on it, and "Finish this game" plays on from where it was', async () => {
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
    expect(menu[0]).toMatchObject({ label: 'Resume live game', sub: `End of Q1 · ${q1[me]}-${q1[1 - me]}`, cmd: 'watchLive' });
    expect(menu.find((a) => a.id === 'quick')?.label).toBe('Finish this game');
    expect(flowActions(back, { onLive: true }).map((a) => a.label)).toEqual(['Finish this game']);
    const day = back.day;
    await useStore.getState().simulate({ kind: 'days', n: 1 });
    expect(back.day).toBe(day + 1);
    const res = userGames(back).at(-1)!;
    expect(res.gid).toBe(lg.game.gid);
    expect([res.home.quarters[0], res.away.quarters[0]]).toEqual(q1);
    expect([once(back, res.gid), back.live, liveInProgress(back)]).toEqual([1, undefined, null]);
  });

  it("plays the other coach's game plan again, and the result keeps it, on hard", async () => {
    const l = testLeague('opp-plan');
    // a dozen days in, so the other coaches have games of yours to plan against; on hard, every one does
    for (let i = 0; i < 12; i++) simDay(l);
    l.settings.difficulty = 'hard';
    toGameDay(l);
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
  });

  it("picks the game up with the other coach's plan as it tipped off, after a difficulty change or under a new league id", async () => {
    const l = testLeague('opp-plan-keep');
    for (let i = 0; i < 12; i++) simDay(l);
    l.settings.difficulty = 'hard';
    toGameDay(l);
    const lg = goLive(l);
    const them = (1 - lg.userSide) as 0 | 1;
    const plan = oppPlanIn(lg.sim, them);
    expect(plan?.items.length).toBeGreaterThan(0);
    lg.simTo('quarter');
    for (let i = 0; i < 10; i++) lg.step();
    await useStore.getState().flush();
    const back = (await loadLeague(l.id))!;
    // casual coaches never plan, and a backup imported as a copy gets a new id (plans are drawn from it)
    back.settings.difficulty = 'casual';
    back.id = `${back.id}-copy`;
    useStore.getState().setLeague(back);
    const again = prepareLive(back)!;
    expect(again.resumed).toBe('journal');
    expect(oppPlanIn(again.sim, them)).toEqual(plan);
    expect(again.sim.baseTactics(them)).toEqual(lg.sim.baseTactics(them));
    expect(again.commit(back).oppPlan).toEqual(plan!.items.map((it) => it.text));
  });

  it("reading a save drops a damaged journal, and one that isn't for the game still to play today", () => {
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
      ['a play call that is not one', (j) => void Object.assign(j.ops.find((o) => o.op === 'call')!.args, { call: { kind: 'dunk' } })],
      ['far too many moves', (j) => void (j.ops = Array.from({ length: 6000 }, () => ({ at: 0, op: 'cancelCall', args: {} })))],
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
