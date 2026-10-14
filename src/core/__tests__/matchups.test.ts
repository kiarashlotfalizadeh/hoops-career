// The matchup solver the engine and the game plan screen share: planned pairs hold, the result is
// the cheapest assignment, and the engine plays exactly as it did with its own copy of the search.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim } from '../sim/engine';
import { solveMatchups, type MatchupDefender, type MatchupScorer } from '../sim/matchups';
import { Rng } from '../random';

function randomUnit(rng: Rng, n: number, m: number) {
  const off: MatchupScorer[] = Array.from({ length: n }, (_, i) => ({ pid: 100 + i, hgt: rng.int(30, 90), big: rng.chance(0.4), threat: rng.uniform(0, 3) }));
  const def: MatchupDefender[] = Array.from({ length: m }, (_, j) => ({ pid: 200 + j, hgt: rng.int(30, 90), intDef: rng.int(30, 90), perDef: rng.int(30, 90) }));
  return { off, def };
}

/** Every assignment of distinct defenders, the same costs, the lowest total. */
function bruteForce(off: MatchupScorer[], def: MatchupDefender[], manual: Record<number, number>) {
  const maxThreat = Math.max(...off.map((o) => o.threat)) || 1;
  const cost = (o: MatchupScorer, d: MatchupDefender) =>
    Math.abs(o.hgt - d.hgt) * 0.09 - (o.threat / maxThreat) * ((o.big ? d.intDef : d.perDef) - 50) * 0.06 + (manual[o.pid] === undefined ? 0 : manual[o.pid] === d.pid ? -50 : 4);
  let best = Infinity;
  const rec = (i: number, used: Set<number>, sum: number) => {
    if (i === off.length) return void (best = Math.min(best, sum));
    def.forEach((d, j) => {
      if (used.has(j)) return;
      rec(i + 1, new Set([...used, j]), sum + cost(off[i], d));
    });
  };
  rec(0, new Set(), 0);
  return { best, cost };
}

describe('matchup solver', () => {
  it('finds the cheapest assignment, five on five and for smaller and bigger groups', () => {
    const rng = new Rng(5);
    for (const [n, m] of [
      [5, 5],
      [3, 5],
      [2, 4],
      [4, 6],
    ]) {
      for (let k = 0; k < 15; k++) {
        const { off, def } = randomUnit(rng, n, m);
        const manual: Record<number, number> = k % 3 === 0 ? { [off[1].pid]: def[m - 1].pid } : {};
        const got = solveMatchups(off, def, manual);
        expect(new Set(got).size).toBe(n);
        const { best, cost } = bruteForce(off, def, manual);
        const total = got.reduce((a, j, i) => a + cost(off[i], def[j]), 0);
        expect(total).toBeCloseTo(best, 9);
      }
    }
  });

  it('honours planned pairs', () => {
    const rng = new Rng(8);
    for (let k = 0; k < 20; k++) {
      const { off, def } = randomUnit(rng, 5, 5);
      // the weakest perimeter defender on their biggest threat: the staff would never choose it
      const star = off.reduce((a, b) => (b.threat > a.threat ? b : a));
      const worst = def.reduce((a, b) => (b.perDef < a.perDef ? b : a));
      const got = solveMatchups(off, def, { [star.pid]: worst.pid });
      expect(def[got[off.indexOf(star)]].pid).toBe(worst.pid);
    }
  });

  it('hands defenders out in turn when there are fewer of them than scorers', () => {
    const { off, def } = randomUnit(new Rng(1), 5, 3);
    expect(solveMatchups(off, def)).toEqual([0, 1, 2, 0, 1]);
  });

  it('leaves game results exactly as the engine made them with its own copy of the search', () => {
    // the engine's matchup search as it was before it moved to the solver
    const PERMS5: number[][] = [];
    const perm = (cur: number[], rest: number[]) => {
      if (!rest.length) return void PERMS5.push(cur);
      rest.forEach((x, i) => perm([...cur, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
    };
    perm([], [0, 1, 2, 3, 4]);
    interface SP {
      pid: number;
      big: boolean;
      r: { hgt: number };
      c: { intDef: number; perDef: number };
    }
    interface ST {
      on: SP[];
      guardOf: Map<number, SP>;
      t: { defense: { matchups: Record<number, number> } };
    }
    type Sim = { usageWeight(p: SP, t: ST, a: string): number };
    function legacy(this: Sim, def: ST, off: ST) {
      def.guardOf.clear();
      const O = off.on;
      const D = def.on;
      if (O.length < 5 || D.length < 5) {
        O.forEach((o, i) => def.guardOf.set(o.pid, D[i % D.length]));
        return;
      }
      const manual = def.t.defense.matchups;
      const threat = O.map((o) => this.usageWeight(o, off, 'iso') + this.usageWeight(o, off, 'pnr'));
      const maxThreat = Math.max(...threat) || 1;
      const cost: number[] = new Array(25);
      for (let i = 0; i < 5; i++) {
        const o = O[i];
        const m = manual[o.pid];
        for (let j = 0; j < 5; j++) {
          const d = D[j];
          let c = Math.abs(o.r.hgt - d.r.hgt) * 0.09;
          const quality = o.big ? d.c.intDef : d.c.perDef;
          c -= (threat[i] / maxThreat) * (quality - 50) * 0.06;
          if (m !== undefined) c += m === d.pid ? -50 : 4;
          cost[i * 5 + j] = c;
        }
      }
      let best = PERMS5[0];
      let bestCost = Infinity;
      for (const p of PERMS5) {
        const c = cost[p[0]] + cost[5 + p[1]] + cost[10 + p[2]] + cost[15 + p[3]] + cost[20 + p[4]];
        if (c < bestCost) {
          bestCost = c;
          best = p;
        }
      }
      O.forEach((o, i) => def.guardOf.set(o.pid, D[best[i]]));
    }
    const proto = GameSim.prototype as unknown as { assignMatchups: unknown };
    const current = proto.assignMatchups;
    const play = (seed: number) => {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: seed });
      return [0, 1, 2].map((g) => {
        const side = (tid: number) => ({ team: structuredClone(league.teams[tid]), players: teamPlayers(league, tid) });
        const a = side(g);
        const b = side(g + 10);
        // planned matchups on one side: three of their players on three of our bench
        const theirs = teamPlayers(league, g + 10).slice(0, 3);
        const mine = teamPlayers(league, g).slice(3, 6);
        if (g > 0) a.team.tactics.defense.matchups = Object.fromEntries(theirs.map((p, i) => [p.pid, mine[i].pid]));
        return JSON.stringify(new GameSim(a, b, { rng: new Rng(seed * 100 + g), type: g === 2 ? 'playoffs' : 'regular', record: true, keepShots: true }).simToEnd());
      });
    };
    for (const seed of [1, 2, 3]) {
      const now = play(seed);
      proto.assignMatchups = legacy;
      try {
        expect(play(seed)).toEqual(now);
      } finally {
        proto.assignMatchups = current;
      }
    }
  });
});
