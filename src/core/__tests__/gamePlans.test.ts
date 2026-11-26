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
  planSig,
  planWorth,
  removePlanItem,
  setPlanItem,
  setPlanMatchup,
  setPlanScope,
} from '../league/gamePlans';
import { buildSimInput, playGame, userGameOnDay } from '../league/games';
import { migrate } from '../../state/persistence';
import { LiveGame } from '../../state/live';
import { playerName, teamPlayers } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { rosterNames } from '../../ui/stats';
import { GameSim } from '../sim/engine';
import { LOSING_ADJUSTMENTS } from '../sim/engine/coach';
import { Rng } from '../random';
import type { League, PlayoffSeries } from '../types';
import { counterWorth, measureChanges, PLAN_WORTH, shrinkWorth, worthCall, WORTH_MAX } from '../ai/counterWorth';
import {
  CHECK_AFTER,
  RECHECK_AFTER,
  checksDue,
  editMorning,
  editPlan,
  evenText,
  MADE_LINE,
  readEdit,
  recheckAhead,
  recordEdit,
  revertEdit,
  saveCheck,
  type GameReadings,
} from '../ai/tacticEdits';
import { refreshEditThread } from '../league/legacyReview';
import { projectGame } from '../analysis/projection';

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
      // a plan lasts a game unless a series is under way; every plan goes with clearAllPlans
      const l = fresh();
      toGameDay(l);
      const { opp } = opponentOf(l);
      setPlanItem(l, opp, { id: 'cov-blitz', label: 'Blitz', patch: { defense: { pnr: 'blitz' } } });
      expect(setPlanScope(l, opp, 'next')).toBe(true);
      // no series under way: a series scope isn't possible
      expect(setPlanScope(l, opp, 'series')).toBe(false);
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
      // a plan used up ticks the guide's plan step only when it was his: the staff's silent counter isn't
      const l = fresh();
      l.onboarding = { done: [] };
      const game = { gid: 1, day: l.day, home: l.userTid, away: 3, type: 'regular' as const };
      setPlanItem(l, 3, { id: 'cov-ice', label: 'Ice', patch: { defense: { pnr: 'ice' } }, staff: true });
      consumePlans(l, game);
      expect(l.onboarding.done).toEqual([]);
      setPlanItem(l, 3, { id: 'cov-ice', label: 'Ice', patch: { defense: { pnr: 'ice' } } });
      consumePlans(l, game);
      expect(l.onboarding.done).toEqual(['scout']);
    }
    {
      // never keeps tonight's game-specific settings in the saved tactics
      const l = fresh();
      const t = l.teams[l.userTid].tactics;
      t.defense.matchups = { 1: 2 };
      t.defense.starTarget = 3;
      t.defense.chase = [4];
      t.offense.huntTarget = 6;
      t.manage.hackTargets = [7];
      t.manage.foulToGive = true;
      const kept = persistableTactics(t);
      expect([kept.defense.matchups, kept.defense.starTarget, kept.defense.chase, kept.offense.huntTarget, kept.manage.hackTargets]).toEqual([
        {},
        null,
        undefined,
        undefined,
        undefined,
      ]);
      // the foul to give is a setting, not tonight's business
      expect(kept.manage.foulToGive).toBe(true);
    }
    {
      // drops damaged junk-defense, hunt and foul-to-give settings from a save, and keeps good ones; instructions by player and a deny (both cut) go
      const l = fresh();
      const raw = structuredClone(l) as League;
      const t = raw.teams[raw.userTid].tactics as unknown as Record<string, Record<string, unknown>>;
      t.defense.scheme = 'box9';
      t.defense.chase = 'everyone';
      t.defense.playerD = { 12: 'under', 13: 'hug', x: 'sag' };
      t.defense.starPlan = 'deny';
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
          ...({ playerD: { 7: 'tight', 8: 'nope' } } as object),
        },
        6: { oppTid: 6, items: [], ...({ playerD: 'all' } as object) },
      };
      const out = migrate(raw);
      const d = out.teams[out.userTid].tactics.defense;
      expect(d.scheme).toBe('man');
      expect(d.chase).toBeUndefined();
      expect(d).not.toHaveProperty('playerD');
      expect(d.starPlan).toBe('none');
      expect(out.teams[out.userTid].tactics.offense).not.toHaveProperty('huntTarget');
      expect(out.teams[out.userTid].tactics.manage).not.toHaveProperty('foulToGive');
      expect(out.teams[4].tactics.defense).toMatchObject({ scheme: 'tri2', chase: [1, 2] });
      expect(out.gamePlans![5].items[0].patch).toEqual({ defense: { scheme: 'box1', chase: [3] } });
      expect(out.gamePlans![5].items[1].patch).toEqual({ defense: {}, offense: {} });
      expect(out.gamePlans![5]).not.toHaveProperty('playerD');
      expect(out.gamePlans![6]).not.toHaveProperty('playerD');
      // a save without any of it loads as it was
      expect(migrate(structuredClone(l))).toEqual({ ...l, version: out.version });
    }
    {
      // drops damaged plans from a save: one without items or with an unknown scope, damaged items and matchups;
      // a season plan from before plans lasted a game or a series becomes a next-game one, and notes go
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
      expect(out.gamePlans![6]).toEqual({ oppTid: 6, items: [{ id: 'a', label: 'A', patch: { defense: { scheme: 'box1', chase: [3] } } }], matchups: { 10: 11 } });
      expect(out.gamePlans![7]).toEqual({ oppTid: 7, items: [] });
      // and the games against them go on
      expect(planFor(out, 3)).toBeNull();
      expect(planFor(out, 6)?.items).toHaveLength(1);
    }
    {
      // the user's assistant adjusts at breaks in simmed games unless switched off, whoever runs the
      // tactics, deterministically, from the AI coaches' menu (engine/coach.ts) and never with a kind measured
      // as losing (tactics v2, 2026-11-10: LOSING_ADJUSTMENTS holds for everyone, and ASSISTANT_SKIPS is
      // gone). His side blitzing every ball screen here: the trap's 4-on-3 burns it in most games, and he
      // stops blitzing, as an AI coach in his place does
      const l = fresh();
      const opp = (l.userTid + 1) % 30;
      l.teams[l.userTid].tactics.defense = { ...l.teams[l.userTid].tactics.defense, scheme: 'man', pnr: 'blitz' };
      const run = (asAi = false) => {
        const out: string[] = [];
        for (let g = 0; g < 20; g++) {
          const me = buildSimInput(l, l.userTid, l.day, 'regular', opp);
          const mine = asAi ? { ...me, team: { ...me.team, assistant: undefined } } : me;
          const res = new GameSim(mine, buildSimInput(l, opp, l.day, 'regular', l.userTid), { rng: new Rng(30 + g), type: 'regular', injuries: false }).simToEnd();
          for (const a of res.adjustments ?? []) if (a.t === 0) out.push(`${g} Q${a.q} ${a.kind}: ${a.text}`);
        }
        return out;
      };
      const kinds = (xs: string[]) => xs.map((x) => x.split(' ')[2].slice(0, -1));
      for (const manual of [false, true]) {
        l.teams[l.userTid].tactics.manual = manual;
        const me = buildSimInput(l, l.userTid, l.day, 'regular', opp);
        expect(me.adjust).toBe(true);
        expect(me.team.assistant).toBe(true);
      }
      expect(buildSimInput(l, opp, l.day, 'regular', l.userTid).team.assistant).toBeUndefined();
      const first = run();
      expect(first.length).toBeGreaterThan(5);
      expect(run()).toEqual(first);
      expect(kinds(first).some((k) => LOSING_ADJUSTMENTS.has(k))).toBe(false);
      expect(first.filter((x) => / unblitz: stops blitzing ball screens$/.test(x)).length).toBeGreaterThan(5);
      expect(kinds(run(true))).toContain('unblitz');
      // switched off: none
      l.teams[l.userTid].tactics.manage.assistantAdjusts = false;
      expect(buildSimInput(l, l.userTid, l.day, 'regular', opp).adjust).toBe(false);
      expect(run()).toEqual([]);
      l.teams[l.userTid].tactics.manage.assistantAdjusts = true;
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
      // never lets an AI coach play crunch-time calls left on a team it inherits
      const l = fresh();
      const tid = (l.userTid + 3) % 30;
      const t = l.teams[tid].tactics;
      t.manage.goTo = l.teams[tid].rotation.order[0];
      t.manage.ato = 'iso';
      const input = buildSimInput(l, tid, l.day, 'regular', l.userTid);
      expect(input.team.tactics.manage.goTo).toBeUndefined();
      expect(input.team.tactics.manage.ato).toBeUndefined();
      expect(input.adjust).toBe(true);
      // the team keeps them, for a coach who comes back to it
      expect(l.teams[tid].tactics.manage.ato).toBe('iso');
    }
    {
      // the staff's counters, each measured in paired games of the next game (the season's seeds for
      // the opponent: the same numbers every time), shrunk toward even by their noise, leaving the
      // league as it was; a newer run stops an older one
      const l = fresh();
      toGameDay(l);
      const { g, opp } = opponentOf(l);
      const before = JSON.stringify(l);
      const steps: number[] = [];
      const w = (await counterWorth(l, opp, g, { games: 16, onProgress: (d) => steps.push(d) }))!;
      expect(w.length).toBeGreaterThan(0);
      expect(w.length).toBeLessThanOrEqual(WORTH_MAX);
      expect(w.every((x) => Number.isFinite(x.pts) && x.se > 0)).toBe(true);
      // what's shown is the reading shrunk by its noise, never bigger than the reading
      for (const x of w) {
        expect(Math.abs(x.pts)).toBeLessThanOrEqual(Math.abs(x.raw) + 0.05);
        expect(x.pts).toBeCloseTo(shrinkWorth(x.raw, x.se), 0);
      }
      // (a promising reading plays fresh seeds too: more steps than configurations, still one at a time)
      expect(steps.length).toBeGreaterThanOrEqual(w.length + 1);
      expect(steps).toEqual(Array.from({ length: steps.length }, (_, i) => i + 1));
      expect(await counterWorth(l, opp, g, { games: 16 })).toEqual(w);
      expect(JSON.stringify(l)).toBe(before);
      expect(await counterWorth(l, opp, g, { games: 16, cancelled: () => true })).toBeNull();
      // with counters' worth spread wide (the big decisions), a reading of +1.0 at ±0.45 is mostly real: a gain; +0.5 at the same noise, even
      expect(shrinkWorth(1, 0.45)).toBeCloseTo(0.88, 2);
      expect(worthCall({ pts: shrinkWorth(1, 0.45) })).toBe('gain');
      expect(worthCall({ pts: shrinkWorth(0.5, 0.45) })).toBe('even');
      expect(worthCall({ pts: shrinkWorth(-1.2, 0.45) })).toBe('cost');
      // a plan never moves the projection, whatever the staff measured it worth: the chance to win is
      // rosters, results and home court (and checked changes), so it can't be swept for the best plan
      const sim = new GameSim(buildSimInput(l, g.home, g.day, g.type, g.away, g), buildSimInput(l, g.away, g.day, g.type, g.home, g), {
        rng: new Rng(1),
        type: g.type,
        injuries: false,
      });
      const was = projectGame(l, sim, false).margin;
      setPlanItem(l, opp, { id: 'help-high', label: 'Pack the paint', group: 'help', patch: { defense: { help: 78 } }, pts: 1.5 });
      expect(projectGame(l, sim, false).margin).toBe(was);
      setPlanItem(l, opp, { id: 'crash', label: 'Crash', group: 'crash', patch: { offense: { crashBoards: 78 } }, pts: 9 });
      expect(projectGame(l, sim, false).margin).toBe(was);
      // the plan is measured whole (its counters and matchups together, against the same games without
      // it) and each of its items by the games without that one: kept for the game's report
      {
        const read = (await counterWorth(l, opp, g, { games: 16 }))!;
        const whole = read.find((x) => x.id === PLAN_WORTH)!;
        expect(Number.isFinite(whole.pts) && whole.se > 0).toBe(true);
        expect(['help-high', 'crash'].every((id) => read.filter((x) => x.id === id).length === 1)).toBe(true);
        // (a sim's morning budget leaves the plan's own readings out)
        expect((await counterWorth(l, opp, g, { games: 16, plan: false }))!.some((x) => [PLAN_WORTH, 'help-high', 'crash'].includes(x.id))).toBe(false);
        l.gamePlans![opp].worth = { pts: 0.3, raw: 0.4, se: 0.3, sig: planSig(l.gamePlans![opp]) };
        expect(planWorth(l.gamePlans![opp])!.pts).toBe(0.3);
        expect(projectGame(l, sim, false).margin).toBe(was);
        setPlanMatchup(l, opp, teamPlayers(l, opp)[0].pid, teamPlayers(l, l.userTid)[0].pid);
        expect(planWorth(l.gamePlans![opp])).toBeUndefined();
        setPlanMatchup(l, opp, teamPlayers(l, opp)[0].pid, null);
        expect(planWorth(l.gamePlans![opp])!.pts).toBe(0.3);
        // (no plan, nothing of it to measure)
        const bare = { ...l, gamePlans: {} } as League;
        expect((await counterWorth(bare, opp, g, { games: 16 }))!.some((x) => x.id === PLAN_WORTH)).toBe(false);
        // one counter alone is the whole plan: read once, as both
        const one = { ...l, gamePlans: { [opp]: { ...l.gamePlans![opp], items: [l.gamePlans![opp].items[0]] } } } as League;
        const single = (await counterWorth(one, opp, g, { games: 16 }))!;
        expect(single.find((x) => x.id === 'help-high')).toEqual({ ...single.find((x) => x.id === PLAN_WORTH)!, id: 'help-high' });
        l.gamePlans![opp].worth = { pts: Number.NaN, raw: 0, se: 0.3, sig: 'x' };
      }
      // (a damaged number goes with the save check)
      l.gamePlans![opp].items[0].pts = Number.NaN as number;
      const m = migrate(JSON.parse(JSON.stringify(l)) as League);
      expect(m.gamePlans![opp].items[0].pts).toBeUndefined();
      expect(m.gamePlans![opp].worth).toBeUndefined();
      expect(m.gamePlans![opp].items[1].pts).toBe(9);
    }
    {
      // the user's change is kept as the settings it moved, with nothing read of it as it's made; about
      // ten games on it's measured on the games played (each with and without it, pooled), with one staff
      // note; putting it back moves only what it set
      const l = fresh();
      toGameDay(l);
      const me = l.teams[l.userTid];
      const before = structuredClone({ tactics: me.tactics, rotation: me.rotation });
      const was = me.tactics.defense.pnr;
      const cov = was === 'blitz' ? 'drop' : 'blitz';
      me.tactics.defense.pnr = cov;
      me.tactics.manual = true;
      const e = recordEdit(l, before, (pid) => `#${pid}`)!;
      expect(e.diff).toEqual([['tactics.defense.pnr', was, cov]]);
      expect(e.what).toMatch(/→/);
      expect([e.ahead, e.worth]).toEqual([undefined, undefined]);
      expect(MADE_LINE).toBe('Change noted. The staff checks it on played games after 10.');
      // a second change to the same setting the same day, before a game, is the same change
      const cov2 = ['drop', 'blitz', 'hedge'].find((x) => x !== was && x !== cov) as typeof cov;
      me.tactics.defense.pnr = cov2;
      expect(recordEdit(l, structuredClone({ tactics: { ...me.tactics, defense: { ...me.tactics.defense, pnr: cov } }, rotation: me.rotation }), (pid) => `#${pid}`)!.id).toBe(
        e.id,
      );
      expect(l.tacticEdits!.map((x) => x.diff)).toEqual([[['tactics.defense.pnr', was, cov2]]]);
      me.tactics.defense.pnr = cov;
      l.tacticEdits![0].diff = [['tactics.defense.pnr', was, cov]];
      const play = async (plan: NonNullable<ReturnType<typeof editPlan>['plan']>, games: number): Promise<GameReadings> => {
        const out: GameReadings = [];
        for (const g of plan.games)
          out.push({
            w: g.w,
            worth: (await measureChanges(
              l,
              g.opp,
              plan.changes,
              l.schedule.find((x) => x.gid === g.gid),
              { games },
            ))!,
          });
        return out;
      };
      // a change to another setting that day is a change of its own
      const mid = structuredClone({ tactics: me.tactics, rotation: me.rotation });
      me.tactics.offense.pace = me.tactics.offense.pace > 50 ? 20 : 90;
      expect(recordEdit(l, mid, (pid) => `#${pid}`)!.id).toBe(e.id + 1);
      expect(l.tacticEdits!.map((x) => x.diff.map(([p]) => p))).toEqual([['tactics.defense.pnr'], ['tactics.offense.pace']]);
      // its check: once CHECK_AFTER of the user's games have been played since, on those games
      expect(checksDue(l)).toHaveLength(0);
      const mine = l.schedule.filter((g) => !g.played && (g.home === l.userTid || g.away === l.userTid)).slice(0, CHECK_AFTER);
      for (const g of mine) g.played = true;
      expect(checksDue(l).map((x) => x.id)).toEqual([e.id, e.id + 1]);
      const check = editPlan(l, l.tacticEdits![0]).plan!;
      expect(check.count).toBe(CHECK_AFTER);
      expect(check.changes.map((c) => c.id)).toEqual(['without']);
      expect(check.games.reduce((a, x) => a + x.w, 0)).toBeCloseTo(1, 9);
      const mail = l.inbox.length;
      // a season's review kept before the check came in is told again as it now stands
      const legacy = (l.legacy ??= { since: l.season, done: [], milestones: [], wins: [], honors: [], beaten: [], reviews: [] });
      legacy.reviews = [{ season: l.season, tid: l.userTid, threads: [{ title: 'Live coaching', rows: [] }] } as unknown as (typeof legacy.reviews)[number]];
      // checked where the sim runs, in its morning, whatever screen the user is on (staffMorning)
      expect(await editMorning(l)).toEqual({ ok: true, checked: [e.id, e.id + 1] });
      refreshEditThread(l, l.season);
      expect(l.tacticEdits![0].check!.games).toBe(check.count);
      expect(l.inbox.length).toBe(mail + 2);
      const note = l.inbox.find((m) => m.link === '/team/tactics/analysis' && m.body.startsWith(l.tacticEdits![0].what.split(' · ')[0]))!;
      expect(note.subject).toMatch(/^Your change (seems to have helped|seems to have hurt)$|^Your change: too close to call$/);
      expect(note.body).toMatch(/with your change and without it/);
      expect(legacy.reviews[0].threads!.map((t) => t.title)).toEqual(['Tactical changes', 'Live coaching']);
      expect(legacy.reviews[0].threads![0].rows[0][1]).toMatch(/^Checked on 10 games played with it: /);
      const rc = await play(check, 6);
      const w = readEdit(rc).worth;
      // the change against the old way: each game's "without" reading turned round, weighted by its share
      expect(w.raw).toBeCloseTo(-rc.reduce((a, x) => a + x.w * x.worth.find((c) => c.id === 'without')!.raw, 0), 1);
      expect(Math.abs(w.pts)).toBeLessThanOrEqual(Math.abs(w.raw) + 0.05);
      // an even reading is inconclusive, never "no effect": a tight one rules out a big swing, a wide one can't tell
      expect(evenText({ raw: 0.1, se: 0.1 }, 12)).toMatch(/^Too close to call over 12 games: the replays put it between −0\.1 and \+0\.3 points a game, so no big swing/);
      expect(evenText({ raw: 0.1, se: 0.1 }, 12)).toMatch(/That's final: the staff won't look again\./);
      expect(evenText({ raw: 0.2, se: 0.6 }, 12)).toMatch(/^Inconclusive over 12 games: .* one more look after 10 more games/);
      expect(evenText({ raw: 0.2, se: 0.6, recheck: true }, 22)).toMatch(/^Still inconclusive over 22 games: .* last look/);
      // the same first check saved again (the Team screens' and the sim morning's) is kept once
      saveCheck(l, e.id, w, check.count);
      expect(l.inbox.length).toBe(mail + 2);
      expect(checksDue(l)).toHaveLength(0);
      // a wide even check gets one second look RECHECK_AFTER games on, over all of them, and then it's final
      const first = l.tacticEdits![0];
      first.check = { pts: 0.1, raw: 0.2, se: 0.6, games: CHECK_AFTER, day: l.day };
      expect(recheckAhead(first)).toBe(true);
      expect(checksDue(l).map((x) => x.id)).not.toContain(e.id);
      for (const g of l.schedule.filter((x) => !x.played && (x.home === l.userTid || x.away === l.userTid)).slice(0, RECHECK_AFTER)) g.played = true;
      expect(checksDue(l).map((x) => x.id)).toContain(e.id);
      const again = editPlan(l, first).plan!;
      expect(again.count).toBe(CHECK_AFTER + RECHECK_AFTER);
      saveCheck(l, e.id, { ...w, pts: 0, raw: 0.2, se: 0.6 }, again.count);
      expect(first.check).toMatchObject({ games: CHECK_AFTER + RECHECK_AFTER, recheck: true });
      expect(l.inbox.filter((m) => m.subject === 'Your change: still too close to call')).toHaveLength(1);
      expect(recheckAhead(first)).toBe(false);
      expect(checksDue(l).map((x) => x.id)).not.toContain(e.id);
      // put back: the coverage goes back; a setting moved again since stays where the user put it
      me.tactics.offense.pace = 64;
      expect(revertEdit(l, l.tacticEdits![0])).toBe(true);
      expect(me.tactics.defense.pnr).toBe(was);
      expect(me.tactics.offense.pace).toBe(64);
      expect([l.tacticEdits![0].closed, l.tacticEdits![0].closedDay]).toEqual(['reverted', l.day]);
    }
    {
      // a roster move isn't the user's change: a release on the Team screens takes the player's role,
      // minutes and place in the order with him, and only what the user changed himself is recorded
      // (by name, a player who has left since too); a save from before that names him and drops the rest
      const l = fresh();
      toGameDay(l);
      const me = l.teams[l.userTid];
      const roster = teamPlayers(l, l.userTid);
      const gone = roster[roster.length - 1];
      me.tactics.offense.roles[gone.pid] = 'creator';
      me.rotation.minutes[gone.pid] = 12;
      const before = structuredClone({ tactics: me.tactics, rotation: me.rotation });
      releasePlayer(l, gone);
      expect(recordEdit(l, before, rosterNames(teamPlayers(l, l.userTid)))).toBeNull();
      const pace = me.tactics.offense.pace;
      me.tactics.offense.pace = pace > 50 ? 20 : 90;
      const e = recordEdit(l, before, rosterNames(teamPlayers(l, l.userTid)))!;
      expect(e.diff).toEqual([['tactics.offense.pace', pace, me.tactics.offense.pace]]);
      expect(e.what).not.toMatch(/\(role\)|Depth order/);
      // the old way: the release in the ledger, its staff note with no name
      const old = structuredClone(l);
      const t = old.teams[old.userTid];
      old.tacticEdits = [
        {
          ...e,
          what: `(role): Primary Creator → Auto · Depth order · ${e.what}`,
          diff: [['tactics.offense.roles.' + gone.pid, 'creator', undefined], ['rotation.order', [...t.rotation.order, gone.pid], t.rotation.order], ...e.diff],
        },
        { ...e, id: e.id + 1, what: '(role): Primary Creator → Auto', diff: [['tactics.offense.roles.' + gone.pid, 'creator', undefined]] },
      ];
      old.inbox.unshift({ ...old.inbox[0], id: 9999, body: "(role): Primary Creator → Auto and more. I've measured your change…", link: '/team/tactics/analysis' });
      const back = migrate(structuredClone(old));
      expect(back.tacticEdits!.map((x) => [x.diff, x.what])).toEqual([[e.diff, e.what]]);
      expect(back.inbox.find((m) => m.id === 9999)!.body).toMatch(new RegExp(`^${playerName(gone)} \\(role\\): Primary Creator → Auto and more`));
    }
    {
      // a save made while the Team screens were open (the app closed, reloaded or put away before the
      // visit ended) loads with its change recorded, as leaving would have, and the visit gone; a visit
      // with nothing changed records nothing, and a damaged one goes
      const l = fresh();
      toGameDay(l);
      const me = l.teams[l.userTid];
      l.editVisit = structuredClone({ tactics: me.tactics, rotation: me.rotation });
      const pace = me.tactics.offense.pace;
      me.tactics.offense.pace = pace > 50 ? 20 : 90;
      const back = migrate(structuredClone(l));
      expect(back.editVisit).toBeUndefined();
      expect(back.tacticEdits!.map((e) => e.diff)).toEqual([[['tactics.offense.pace', pace, me.tactics.offense.pace]]]);
      // (nothing played with it yet: nothing to check)
      expect(editPlan(back, back.tacticEdits![0]).plan).toBeUndefined();
      me.tactics.offense.pace = pace;
      const still = migrate(structuredClone(l));
      expect([still.editVisit, still.tacticEdits ?? []]).toEqual([undefined, []]);
      const bad = structuredClone(l) as unknown as { editVisit: unknown };
      bad.editVisit = { tactics: 3 };
      expect(migrate(bad).editVisit).toBeUndefined();
    }
  }, 120_000);
});
