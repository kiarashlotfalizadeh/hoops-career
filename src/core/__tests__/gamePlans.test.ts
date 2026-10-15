// Per-opponent game plans: items replace their group, matchups and how to guard each player are
// planned per opponent, and each plan lasts as long as its scope (the next game, a playoff series,
// the season).
import { describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import {
  clearAllPlans,
  consumePlans,
  effectiveTactics,
  persistableTactics,
  planFor,
  removePlanItem,
  setPlanItem,
  setPlanMatchup,
  setPlanPlayerD,
  setPlanScope,
} from '../league/gamePlans';
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

  it('plans how to guard their players: one instruction each, on top of the base tactics, for this opponent only', () => {
    const l = testLeague();
    const [a, b] = teamPlayers(l, 3);
    setPlanPlayerD(l, 3, a.pid, 'under');
    setPlanPlayerD(l, 3, b.pid, 'sag');
    setPlanPlayerD(l, 3, a.pid, 'tight');
    expect(effectiveTactics(l, 3).defense.playerD).toEqual({ [a.pid]: 'tight', [b.pid]: 'sag' });
    expect(effectiveTactics(l, 4).defense.playerD).toBeUndefined();
    // the instructions alone keep the plan; taking the last one off ends it
    expect(planFor(l, 3)).not.toBeNull();
    setPlanPlayerD(l, 3, a.pid, null);
    setPlanPlayerD(l, 3, b.pid, null);
    expect(l.gamePlans?.[3]).toBeUndefined();
  });

  it("never keeps tonight's game-specific settings in the saved tactics", () => {
    const l = testLeague();
    const t = l.teams[l.userTid].tactics;
    t.defense.matchups = { 1: 2 };
    t.defense.starTarget = 3;
    t.defense.chase = [4];
    t.defense.playerD = { 5: 'body' };
    t.offense.huntTarget = 6;
    t.manage.hackTargets = [7];
    t.manage.foulToGive = true;
    const kept = persistableTactics(t);
    expect([kept.defense.matchups, kept.defense.starTarget, kept.defense.chase, kept.defense.playerD, kept.offense.huntTarget, kept.manage.hackTargets]).toEqual([
      {},
      null,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    // the foul to give is a setting, not tonight's business
    expect(kept.manage.foulToGive).toBe(true);
  });

  it('drops damaged junk-defense, hunt, instruction and foul-to-give settings from a save, and keeps good ones', () => {
    const l = testLeague();
    const raw = structuredClone(l) as League;
    const t = raw.teams[raw.userTid].tactics as unknown as Record<string, Record<string, unknown>>;
    t.defense.scheme = 'box9';
    t.defense.chase = 'everyone';
    t.defense.playerD = { 12: 'under', 13: 'hug', x: 'sag' };
    t.offense.huntTarget = 'him';
    t.manage.foulToGive = 'yes';
    const other = raw.teams[4].tactics;
    other.defense.scheme = 'tri2';
    other.defense.chase = [1, 2];
    raw.gamePlans = {
      5: {
        oppTid: 5,
        items: [
          { id: 'junk', label: 'Box', group: 'coverage', patch: { defense: { scheme: 'box1', chase: [3] } } },
          { id: 'bad', label: 'Bad', patch: { defense: { scheme: 'nope' as never, chase: [1, 2, 3] }, offense: { huntTarget: 'x' as never } } },
        ],
        playerD: { 7: 'tight', 8: 'nope' as never },
      },
      6: { oppTid: 6, items: [], playerD: 'all' as never },
    };
    const out = migrate(raw);
    const d = out.teams[out.userTid].tactics.defense;
    expect(d.scheme).toBe('man');
    expect(d.chase).toBeUndefined();
    expect(d.playerD).toEqual({ 12: 'under' });
    expect(out.teams[out.userTid].tactics.offense).not.toHaveProperty('huntTarget');
    expect(out.teams[out.userTid].tactics.manage).not.toHaveProperty('foulToGive');
    expect(out.teams[4].tactics.defense).toMatchObject({ scheme: 'tri2', chase: [1, 2] });
    expect(out.gamePlans![5].items[0].patch).toEqual({ defense: { scheme: 'box1', chase: [3] } });
    expect(out.gamePlans![5].items[1].patch).toEqual({ defense: {}, offense: {} });
    expect(out.gamePlans![5].playerD).toEqual({ 7: 'tight' });
    expect(out.gamePlans![6]).not.toHaveProperty('playerD');
    // a save without any of it loads as it was
    expect(migrate(structuredClone(l))).toEqual({ ...l, version: out.version });
  });
});
