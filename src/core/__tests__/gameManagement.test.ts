// The user's game management in simmed games: the assistant's adjustments at breaks, hack-a-player
// targets from a game plan, and what an AI coach plays when it inherits the user's team.
import { describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import { LiveGame } from '../../state/live';
import { persistableTactics, setPlanItem } from '../league/gamePlans';
import { buildSimInput, playGame, userGameOnDay } from '../league/games';
import { GameSim } from '../sim/engine';
import { situationFromTemplate } from '../sim/tactics';
import { Rng } from '../random';
import type { League } from '../types';

const opponentOf = (l: League) => {
  const g = userGameOnDay(l, l.day)!;
  return { g, opp: g.home === l.userTid ? g.away : g.home };
};

describe('game management', () => {
  it("lets the user's assistant adjust at breaks in simmed games only when asked, deterministically", () => {
    const l = testLeague();
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
  });

  it('plays a game-plan item with hack-a-player targets from the chosen quarter, and keeps it out of the base tactics', () => {
    const l = testLeague();
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
  });

  it('never lets an AI coach play situational plans or crunch-time calls left on a team it inherits', () => {
    const l = testLeague();
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
  });
});
