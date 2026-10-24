// Per-opponent game plans: items replace their group, matchups and how to guard each player are
// planned per opponent, and each plan lasts as long as its scope (the next game, a playoff series,
// the season); the user's game management in simmed games: the assistant's adjustments at breaks,
// hack-a-player targets from a game plan, and what an AI coach plays when it inherits the user's team.
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
import { LiveGame } from '../../state/live';
import { teamPlayers } from '../league/helpers';
import { GameSim } from '../sim/engine';
import { situationFromTemplate } from '../sim/tactics';
import { Rng } from '../random';
import type { League, PlayoffSeries } from '../types';
import { counterWorth, worthCall, WORTH_MAX } from '../ai/counterWorth';
import { PLAN_MAX_PTS, planPoints, projectGame } from '../analysis/projection';

const opponentOf = (l: League) => {
  const g = userGameOnDay(l, l.day)!;
  return { g, opp: g.home === l.userTid ? g.away : g.home };
};
const baseLeague = testLeague();
const fresh = () => structuredClone(baseLeague);

describe('game plans', () => {
  it('plan items, matchups and instructions per opponent on top of the base tactics, last as long as their scope, stay out of the saved tactics, and survive a damaged save; the staff manages simmed games; the staff measures its counters and the plan counts in the projection', async () => {
    {
      // items in the same group replace each other; action boosts in different items both apply
      const l = fresh();
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
    }
    {
      // planned matchups go on top of the base tactics, one assignment per defender
      const l = fresh();
      const theirs = teamPlayers(l, 3).slice(0, 2);
      const mine = teamPlayers(l, l.userTid)[0];
      setPlanMatchup(l, 3, theirs[0].pid, mine.pid);
      setPlanMatchup(l, 3, theirs[1].pid, mine.pid);
      expect(effectiveTactics(l, 3).defense.matchups).toEqual({ [theirs[1].pid]: mine.pid });
      setPlanMatchup(l, 3, theirs[1].pid, null);
      expect(l.gamePlans?.[3]).toBeUndefined();
    }
    {
      // plans how to guard their players: one instruction each, on top of the base tactics, for this opponent only
      const l = fresh();
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
    }
    {
      // a note keeps a plan alive when its last item goes
      const l = fresh();
      setPlanItem(l, 3, { id: 'cov-hedge', label: 'Hedge', patch: { defense: { pnr: 'hedge' } } });
      l.gamePlans![3].note = 'Their guards are slow';
      removePlanItem(l, 3, 'cov-hedge');
      expect(l.gamePlans?.[3]?.note).toBe('Their guards are slow');
    }
    {
      // the sim takes the plan for that opponent only, and a next-game plan is used up by the game
      const l = fresh();
      toGameDay(l);
      const { g, opp } = opponentOf(l);
      setPlanItem(l, opp, { id: 'cov-blitz', label: 'Blitz', group: 'coverage', patch: { defense: { scheme: 'man', pnr: 'blitz' } } });
      expect(buildSimInput(l, l.userTid, g.day, g.type, opp, g).team.tactics.defense.pnr).toBe('blitz');
      const other = (opp + 1) % 30 === l.userTid ? (opp + 2) % 30 : (opp + 1) % 30;
      expect(buildSimInput(l, l.userTid, g.day, g.type, other).team.tactics.defense.pnr).toBe(l.teams[l.userTid].tactics.defense.pnr);
      playGame(l, g);
      expect(planFor(l, opp)).toBeNull();
    }
    {
      // a season plan stays after the game
      const l = fresh();
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
    }
    {
      // a series plan lasts through its series and goes when the series is decided
      const l = fresh();
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
    }
    {
      // never keeps tonight's game-specific settings in the saved tactics
      const l = fresh();
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
    }
    {
      // drops damaged junk-defense, hunt, instruction and foul-to-give settings from a save, and keeps good ones
      const l = fresh();
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
    }
    {
      // drops damaged plans from a save: one without items or with an unknown scope, damaged items, matchups and notes
      const l = fresh();
      const raw = structuredClone(l) as unknown as { gamePlans: Record<number, unknown> };
      raw.gamePlans = {
        3: { oppTid: 3, scope: 'next' },
        4: 5,
        5: { oppTid: 5, items: [], scope: 'forever' },
        6: {
          oppTid: 6,
          scope: 'season',
          items: [{ id: 'a', label: 'A', patch: { defense: { scheme: 'box1', chase: [3] } } }, { id: 'b' }, 7],
          matchups: { 10: 11, 12: 'x' },
          note: 4,
        },
        7: { oppTid: 7, items: [], matchups: [1, 2], note: 'keep' },
      };
      const out = migrate(raw);
      expect(Object.keys(out.gamePlans!).sort()).toEqual(['6', '7']);
      expect(out.gamePlans![6]).toEqual({ oppTid: 6, scope: 'season', items: [{ id: 'a', label: 'A', patch: { defense: { scheme: 'box1', chase: [3] } } }], matchups: { 10: 11 } });
      expect(out.gamePlans![7]).toEqual({ oppTid: 7, items: [], note: 'keep' });
      // and the games against them go on
      expect(planFor(out, 3)).toBeNull();
      expect(planFor(out, 6)?.items).toHaveLength(1);
    }
    {
      // the user's assistant adjusts at breaks in simmed games while the staff runs the tactics, or when asked, deterministically
      const l = fresh();
      const opp = (l.userTid + 1) % 30;
      const run = () => {
        const out: string[] = [];
        for (let g = 0; g < 20; g++) {
          const me = buildSimInput(l, l.userTid, l.day, 'regular', opp);
          const res = new GameSim(me, buildSimInput(l, opp, l.day, 'regular', l.userTid), { rng: new Rng(30 + g), type: 'regular', injuries: false }).simToEnd();
          for (const a of res.adjustments ?? []) if (a.t === 0) out.push(`${g} Q${a.q} ${a.text}`);
        }
        return out;
      };
      // the staff runs the tactics: it adjusts, as AI coaches do
      l.teams[l.userTid].tactics.manual = false;
      expect(buildSimInput(l, l.userTid, l.day, 'regular', opp).adjust).toBe(true);
      // the user runs them: only when asked
      l.teams[l.userTid].tactics.manual = true;
      expect(buildSimInput(l, l.userTid, l.day, 'regular', opp).adjust).toBe(false);
      expect(run()).toEqual([]);
      l.teams[l.userTid].tactics.manage.assistantAdjusts = true;
      expect(buildSimInput(l, l.userTid, l.day, 'regular', opp).adjust).toBe(true);
      const first = run();
      expect(first.length).toBeGreaterThan(0);
      expect(run()).toEqual(first);
      // with a game plan for that opponent too
      setPlanItem(l, opp, { id: 'pace', label: 'Push', patch: { nudge: { offense: { pace: 10 } } } });
      expect(buildSimInput(l, l.userTid, l.day, 'regular', opp).adjust).toBe(true);
      // a live game is the user's to coach
      toGameDay(l);
      const lg = new LiveGame(l, userGameOnDay(l, l.day)!);
      const T = (lg.sim as unknown as { T: { adjust: number }[] }).T;
      expect(T[lg.userSide].adjust).toBe(0);
      expect(T[1 - lg.userSide].adjust).toBeGreaterThan(0);
    }
    {
      // plays a game-plan item with hack-a-player targets from the chosen quarter, and keeps it out of the base tactics
      const l = fresh();
      toGameDay(l);
      const { g, opp } = opponentOf(l);
      const target = l.teams[opp].rotation.order[0];
      setPlanItem(l, opp, { id: 'hack', label: 'Hack their star', group: 'hack', patch: { manage: { hackTargets: [target], hackFromQ: 2 } } });
      const me = buildSimInput(l, l.userTid, g.day, g.type, opp, g);
      expect(me.team.tactics.manage.hackTargets).toEqual([target]);
      expect(me.team.tactics.manage.hackFromQ).toBe(2);
      expect(l.teams[l.userTid].tactics.manage.hackTargets).toBeUndefined();
      // tonight's targets never become the tactics kept for every game
      expect(persistableTactics(me.team.tactics).manage.hackTargets).toBeUndefined();
      const them = buildSimInput(l, opp, g.day, g.type, l.userTid, g);
      const name = l.players[target].lastName;
      let hacks = 0;
      for (let k = 0; k < 4; k++) {
        const [home, away] = g.home === l.userTid ? [me, them] : [them, me];
        const sim = new GameSim(home, away, { rng: new Rng(90 + k), type: g.type, record: true, injuries: false });
        sim.simToEnd();
        for (const log of sim.drainLogs()) {
          if (!log.label.startsWith('Hack-a-')) continue;
          expect(log.label).toBe(`Hack-a-${name}`);
          expect(log.q).toBeGreaterThanOrEqual(2);
          expect(log.clockStart).toBeGreaterThanOrEqual(120);
          hacks++;
        }
      }
      expect(hacks).toBeGreaterThan(4);
      // and the real game takes it
      const res = playGame(l, g);
      expect(res.home.pts + res.away.pts).toBeGreaterThan(0);
    }
    {
      // never lets an AI coach play situational plans or crunch-time calls left on a team it inherits
      const l = fresh();
      const tid = (l.userTid + 3) % 30;
      const t = l.teams[tid].tactics;
      t.situations = [situationFromTemplate('protectLead')];
      t.manage.goTo = l.teams[tid].rotation.order[0];
      t.manage.ato = 'iso';
      const input = buildSimInput(l, tid, l.day, 'regular', l.userTid);
      expect(input.team.tactics.situations).toBeUndefined();
      expect(input.team.tactics.manage.goTo).toBeUndefined();
      expect(input.team.tactics.manage.ato).toBeUndefined();
      expect(input.adjust).toBe(true);
      // the team keeps them, for a coach who comes back to it
      expect(l.teams[tid].tactics.situations).toHaveLength(1);
    }
    {
      // the staff's counters, each measured in paired games of the next game (the same numbers
      // every time for the same day), leaving the league as it was; a newer run stops an older one
      const l = fresh();
      toGameDay(l);
      const { g, opp } = opponentOf(l);
      const before = JSON.stringify(l);
      const steps: number[] = [];
      const w = (await counterWorth(l, opp, g, { games: 16, onProgress: (d) => steps.push(d) }))!;
      expect(w.length).toBeGreaterThan(0);
      expect(w.length).toBeLessThanOrEqual(WORTH_MAX);
      expect(w.every((x) => Number.isFinite(x.pts) && x.se > 0)).toBe(true);
      expect(steps).toEqual(Array.from({ length: w.length + 1 }, (_, i) => i + 1));
      expect(await counterWorth(l, opp, g, { games: 16 })).toEqual(w);
      expect(JSON.stringify(l)).toBe(before);
      expect(await counterWorth(l, opp, g, { games: 16, cancelled: () => true })).toBeNull();
      expect(worthCall({ pts: 1, se: 0.4 })).toBe('gain');
      expect(worthCall({ pts: 0.5, se: 0.4 })).toBe('even');
      expect(worthCall({ pts: -1, se: 0.4 })).toBe('cost');
      // a counter in the plan counts in the projection at its measured worth, for the user's side, capped
      const sim = new GameSim(buildSimInput(l, g.home, g.day, g.type, g.away, g), buildSimInput(l, g.away, g.day, g.type, g.home, g), {
        rng: new Rng(1),
        type: g.type,
        injuries: false,
      });
      const was = projectGame(l, sim, false).margin;
      setPlanItem(l, opp, { id: 'help-high', label: 'Pack the paint', group: 'help', patch: { defense: { help: 78 } }, pts: 1.5 });
      const sign = g.home === l.userTid ? 1 : -1;
      expect(projectGame(l, sim, false).margin - was).toBeCloseTo(1.5 * sign, 6);
      setPlanItem(l, opp, { id: 'crash', label: 'Crash', group: 'crash', patch: { offense: { crashBoards: 78 } }, pts: 9 });
      expect(planPoints(l, g.home, g.away)).toBe(PLAN_MAX_PTS * sign);
      // (a damaged number goes with the save check)
      l.gamePlans![opp].items[0].pts = Number.NaN as number;
      const m = migrate(JSON.parse(JSON.stringify(l)) as League);
      expect(m.gamePlans![opp].items[0].pts).toBeUndefined();
      expect(m.gamePlans![opp].items[1].pts).toBe(9);
    }
  }, 120_000);
});
