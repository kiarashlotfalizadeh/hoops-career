// Per-opponent game plans: items replace their group, matchups are planned per opponent, and each
// plan lasts as long as its scope (the next game, a playoff series, the season).
import { describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import { clearAllPlans, consumePlans, effectiveTactics, planFor, removePlanItem, setPlanItem, setPlanMatchup, setPlanScope } from '../league/gamePlans';
import { buildSimInput, playGame, userGameOnDay } from '../league/games';
import { migrate } from '../../state/persistence';
import { teamPlayers } from '../league/helpers';
import type { League, PlayoffSeries } from '../types';

const opponentOf = (l: League) => {
  const g = userGameOnDay(l, l.day)!;
  return { g, opp: g.home === l.userTid ? g.away : g.home };
};

describe('game plans', () => {
  it('items in the same group replace each other; action boosts in different items both apply', () => {
    const l = testLeague();
    const base = l.teams[l.userTid].tactics;
    setPlanItem(l, 3, { id: 'cov-hedge', label: 'Hedge', group: 'coverage', patch: { defense: { scheme: 'man', pnr: 'hedge' } } });
    setPlanItem(l, 3, { id: 'cov-ice', label: 'Ice', group: 'coverage', patch: { defense: { scheme: 'man', pnr: 'ice' } } });
    setPlanItem(l, 3, { id: 'more-pnr', label: 'More P&R', patch: { nudge: { actions: { pnr: 20 } } } });
    setPlanItem(l, 3, { id: 'more-post', label: 'More post-ups', patch: { nudge: { actions: { post: 20 } } } });
    expect(l.gamePlans![3].items.map((x) => x.id)).toEqual(['cov-ice', 'more-pnr', 'more-post']);
    const t = effectiveTactics(l, 3);
    expect(t.defense.pnr).toBe('ice');
    expect(t.offense.actions.pnr).toBe(Math.min(100, base.offense.actions.pnr + 20));
    expect(t.offense.actions.post).toBe(Math.min(100, base.offense.actions.post + 20));
    // relative items build on whatever playbook the team runs now
    l.teams[l.userTid].tactics.offense.actions.pnr = 30;
    expect(effectiveTactics(l, 3).offense.actions.pnr).toBe(50);
    // against anyone else the base tactics play
    expect(effectiveTactics(l, 4)).toEqual(l.teams[l.userTid].tactics);
    removePlanItem(l, 3, 'cov-ice');
    removePlanItem(l, 3, 'more-pnr');
    removePlanItem(l, 3, 'more-post');
    expect(l.gamePlans?.[3]).toBeUndefined();
  });

  it('planned matchups go on top of the base tactics, one assignment per defender', () => {
    const l = testLeague();
    const theirs = teamPlayers(l, 3).slice(0, 2);
    const mine = teamPlayers(l, l.userTid)[0];
    setPlanMatchup(l, 3, theirs[0].pid, mine.pid);
    setPlanMatchup(l, 3, theirs[1].pid, mine.pid);
    expect(effectiveTactics(l, 3).defense.matchups).toEqual({ [theirs[1].pid]: mine.pid });
    setPlanMatchup(l, 3, theirs[1].pid, null);
    expect(l.gamePlans?.[3]).toBeUndefined();
  });

  it('the sim takes the plan for that opponent only, and a next-game plan is used up by the game', () => {
    const l = testLeague();
    toGameDay(l);
    const { g, opp } = opponentOf(l);
    setPlanItem(l, opp, { id: 'cov-blitz', label: 'Blitz', group: 'coverage', patch: { defense: { scheme: 'man', pnr: 'blitz' } } });
    expect(buildSimInput(l, l.userTid, g.day, g.type, opp, g).team.tactics.defense.pnr).toBe('blitz');
    const other = (opp + 1) % 30 === l.userTid ? (opp + 2) % 30 : (opp + 1) % 30;
    expect(buildSimInput(l, l.userTid, g.day, g.type, other).team.tactics.defense.pnr).toBe(l.teams[l.userTid].tactics.defense.pnr);
    playGame(l, g);
    expect(planFor(l, opp)).toBeNull();
  });

  it('a note keeps a plan alive when its last item goes', () => {
    const l = testLeague();
    setPlanItem(l, 3, { id: 'cov-hedge', label: 'Hedge', patch: { defense: { pnr: 'hedge' } } });
    l.gamePlans![3].note = 'Their guards are slow';
    removePlanItem(l, 3, 'cov-hedge');
    expect(l.gamePlans?.[3]?.note).toBe('Their guards are slow');
  });

  it('a season plan stays after the game', () => {
    const l = testLeague();
    toGameDay(l);
    const { g, opp } = opponentOf(l);
    setPlanItem(l, opp, { id: 'cov-blitz', label: 'Blitz', patch: { defense: { pnr: 'blitz' } } });
    expect(setPlanScope(l, opp, 'season')).toBe(true);
    // no series under way: a series scope isn't possible
    expect(setPlanScope(l, opp, 'series')).toBe(false);
    playGame(l, g);
    expect(planFor(l, opp)?.items.length).toBe(1);
    clearAllPlans(l);
    expect(l.gamePlans).toBeUndefined();
  });

  it('a series plan lasts through its series and goes when the series is decided', () => {
    const l = testLeague();
    const opp = 3;
    const s: PlayoffSeries = { id: 'E-1', round: 1, conf: 'E', high: l.userTid, low: opp, highSeed: 1, lowSeed: 8, highWins: 0, lowWins: 0 };
    l.playoffs = [s];
    setPlanItem(l, opp, { id: 'cov-hedge', label: 'Hedge', patch: { defense: { pnr: 'hedge' } } });
    expect(l.gamePlans![opp].scope).toBe('series');
    const game = { gid: 1, day: l.day, home: l.userTid, away: opp, type: 'playoffs' as const, seriesId: 'E-1' };
    consumePlans(l, game);
    expect(planFor(l, opp, game)).not.toBeNull();
    // not for a game outside its series
    expect(planFor(l, opp, { seriesId: undefined })).toBeNull();
    s.highWins = 4;
    s.winner = l.userTid;
    expect(planFor(l, opp, game)).toBeNull();
    consumePlans(l, game);
    expect(l.gamePlans).toBeUndefined();
  });

  it('migrates a version-2 plan to the opponent it was for, and drops matchups kept in the base tactics', () => {
    const l = testLeague();
    const raw = structuredClone(l) as League & { gamePlan?: unknown };
    raw.version = 2;
    raw.gamePlan = { oppTid: 5, items: [{ id: 'cov-ice', label: 'Ice', patch: { defense: { pnr: 'ice' } } }] };
    delete raw.gamePlans;
    raw.teams[raw.userTid].tactics.defense.matchups = { 1: 2 };
    const out = migrate(raw);
    expect((out as League & { gamePlan?: unknown }).gamePlan).toBeUndefined();
    expect(out.gamePlans).toEqual({ 5: { oppTid: 5, items: [{ id: 'cov-ice', label: 'Ice', patch: { defense: { pnr: 'ice' } } }], scope: 'next' } });
    expect(out.teams[out.userTid].tactics.defense.matchups).toEqual({});
    // a version-3 league is left alone
    const again = migrate(structuredClone(out));
    expect(again.gamePlans).toEqual(out.gamePlans);
  });
});
