// The staff acts on the season's evidence when it runs the user's tactics: a setting whose trade-off
// the games say costs more than it wins back is changed, as the trade-off card would change it.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { seasonAdjust, seasonLevers, staffLeverChanges, staffTactics } from '../ai/advisor';
import { autoTactics } from '../ai/coachAI';
import { cloneTactics } from '../sim/tactics';
import { teamPlayers } from '../league/helpers';
import type { League, TacticImpact } from '../types';

/** A fictional league a few weeks in, with every user game's trade-offs replaced by `impacts(side)`. */
function league(impacts: (us: 0 | 1) => TacticImpact[]): League {
  const l = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
  startRegularSeason(l);
  l.teams[0].tactics.manual = false;
  for (let d = 0; d < 24; d++) simDay(l);
  for (const g of l.games) {
    const side = g.home.tid === 0 ? 0 : g.away.tid === 0 ? 1 : -1;
    if (side >= 0) g.impacts = impacts(side as 0 | 1);
  }
  return l;
}

const im = (key: string, t: 0 | 1, pts: number): TacticImpact => ({ key, t, pts, count: 1, players: {} });

describe('the staff acts on the season', () => {
  // crashing gives up 3 a game in run-outs and wins 1 back; sitting off the ball gives up 2.5 in turnovers not forced
  const costly = (us: 0 | 1): TacticImpact[] => {
    const them = (1 - us) as 0 | 1;
    return [im('crash_leak:o', them, 3), im('crash_orb:o', us, 1), im('pressure_to:o', them, 2.5)];
  };

  it("reads each trade-off over the season, changes a costly setting it runs and names the change once, and leaves the user's own tactics, a quiet season and AI teams alone", () => {
    const costlyLeague = league(costly);
    {
      // each trade-off over the season, worst first
      const l = structuredClone(costlyLeague);
      const levers = seasonLevers(l, 0);
      expect(levers.slice(0, 2).map((e) => [e.what, e.net])).toEqual([
        ['soft ball pressure', -2.5],
        ['crashing', -2],
      ]);
    }
    {
      // changes a costly setting the staff runs
      const l = structuredClone(costlyLeague);
      const t = cloneTactics(autoTactics(l.teams[0], teamPlayers(l, 0), false));
      t.offense.crashBoards = 80;
      t.defense.pressure = 40;
      const out = seasonAdjust(l, 0, t);
      expect(out.offense.crashBoards).toBeLessThanOrEqual(50);
      expect(out.defense.pressure).toBeGreaterThanOrEqual(60);
      // (a copy: the tactics it was given are left alone)
      expect(t.offense.crashBoards).toBe(80);
    }
    {
      // leaves the user's own tactics, a quiet season and AI teams alone
      const l = structuredClone(costlyLeague);
      l.teams[0].tactics.manual = true;
      const mine = structuredClone(l.teams[0].tactics);
      expect(staffTactics(l, 0)).toEqual(mine);
      // (in season the staff keeps the shape and playbooks it runs unless another fits clearly better: sticky)
      const ai = l.teams[1];
      expect(staffTactics(l, 1)).toEqual(autoTactics(ai, teamPlayers(l, 1), true, { sticky: true }));
      const quiet = league(() => []);
      expect(staffTactics(quiet, 0)).toEqual(autoTactics(quiet.teams[0], teamPlayers(quiet, 0), true, { sticky: true }));
    }
    {
      // names each change it makes once, with what the setting cost
      const l = structuredClone(costlyLeague);
      // the staff ran a playbook that crashes and sits off the ball, both costing it this season
      const base = cloneTactics(autoTactics(l.teams[0], teamPlayers(l, 0), true));
      base.offense.crashBoards = 80;
      base.defense.pressure = 40;
      const next = staffTactics(l, 0);
      const changes = staffLeverChanges(l, 0, base, next);
      expect(changes.length).toBeGreaterThan(0);
      for (const c of changes) {
        expect(c.lost).toBeGreaterThan(c.won);
        expect(c.games).toBeGreaterThan(0);
        expect(c.label.length).toBeGreaterThan(0);
      }
      // a change already in force isn't news again next week, and the user's own tactics aren't the staff's
      expect(staffLeverChanges(l, 0, next, staffTactics(l, 0))).toEqual([]);
      expect(staffLeverChanges(l, 0, { ...base, manual: true }, next)).toEqual([]);
    }
  }, 120_000);
});
