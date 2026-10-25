// The tactics model the screens and the engine share: the five named settings for each 0-100 tactic;
// playbook fits as named terms ("Why fit 72") that add up to the fit exactly, so the scores the
// Tactics screen shows and the assistant's preset choices are the same numbers; and the matchup
// solver the engine and the game plan screen share: planned pairs hold, the result is the cheapest
// assignment, and the engine plays exactly as it did with its own copy of the search.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { defPresetFit, defPresetTerms, fitRoster, offPresetFit, offPresetTerms, rosterProfile, type ProfileKey, type RosterProfile } from '../ai/coachAI';
import { ensureRotation } from '../league/games';
import { freshFamiliarity } from '../sim/familiarity';
import { applyDefPreset, applyOffPreset, cloneTactics } from '../sim/tactics';
import type { Tactics } from '../types';
import { composites } from '../ratings';
import { GameSim } from '../sim/engine';
import { solveMatchups, type MatchupDefender, type MatchupScorer } from '../sim/matchups';
import { DEF_PRESETS, LEVEL_VALUES, OFF_PRESETS, TACTIC_LEVELS, levelIndex, levelName } from '../sim/tactics';
import { Rng } from '../random';

const KEYS: ProfileKey[] = [
  'starCreator',
  'creatorGap',
  'shooting',
  'passing',
  'bigPassing',
  'postScoring',
  'rimProtection',
  'athleticism',
  'size',
  'perimeterD',
  'depth',
  'steals',
  'bigMobility',
];

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

describe('tactics model', () => {
  it('names five levels for each tactic, adds every playbook fit up from named terms, and solves matchups as the engine always did', () => {
    // tactic levels: spreads five settings over 0-100, each with its own short name
    {
      expect([...LEVEL_VALUES]).toEqual([0, 25, 50, 75, 100]);
      for (const names of Object.values(TACTIC_LEVELS)) {
        expect(names).toHaveLength(5);
        expect(new Set(names).size).toBe(5);
        // a couple of short words: one row of five fits a 360px phone, two lines at most
        for (const n of names) {
          expect(n.length).toBeLessThanOrEqual(14);
          for (const w of n.split(' ')) expect(w.length).toBeLessThanOrEqual(8);
        }
      }
    }

    // reads any value as the nearest setting, and each setting as itself
    {
      LEVEL_VALUES.forEach((v, i) => expect(levelIndex(v)).toBe(i));
      expect([0, 12, 13, 37, 38, 62, 63, 87, 88, 100].map(levelIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
      // out of range (a nudge past the end) still reads as an end
      expect(levelIndex(-10)).toBe(0);
      expect(levelIndex(130)).toBe(4);
      expect(levelName('pace', 72)).toBe('Up-tempo');
    }

    // names the presets by what they do
    {
      const off = (id: string) => OFF_PRESETS.find((p) => p.id === id)!.values;
      const def = (id: string) => DEF_PRESETS.find((p) => p.id === id)!.values;
      expect(levelName('pace', off('paceSpace').pace)).toBe('Run & gun');
      expect(levelName('pace', off('grind').pace)).toBe('Patient');
      expect(levelName('crashBoards', off('grind').crashBoards)).toBe('Crash often');
      expect(levelName('action', off('fiveOut').actions.motion)).toBe('Heavily');
      // (the zone is its own help: the 2-3 playbook doesn't pack the paint on top of it)
      expect(levelName('help', def('zone').help)).toBe('Balanced');
      expect(levelName('help', def('blitz').help)).toBe('Balanced');
      expect(levelName('pressure', def('chaos').pressure)).toBe('Pressure');
      expect(levelName('pressure', def('switch').pressure)).toBe('Balanced');
    }
    // fit terms
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
      // every team's roster, plus made-up profiles well outside them
      const rng = new Rng(5);
      const profiles: RosterProfile[] = [
        ...league.teams.map((t) => rosterProfile(fitRoster(teamPlayers(league, t.tid)))),
        ...Array.from({ length: 300 }, () => {
          const pr = rosterProfile([]);
          for (const k of KEYS) pr[k] = k === 'depth' ? rng.uniform(-40, 0) : k === 'creatorGap' ? rng.uniform(0, 40) : rng.uniform(5, 95);
          return pr;
        }),
      ];

      // each fit is the sum of its terms, to the last bit, for every preset
      {
        for (const pr of profiles) {
          for (const [terms, fits] of [
            [offPresetTerms(pr), offPresetFit(pr)],
            [defPresetTerms(pr), defPresetFit(pr)],
          ] as const) {
            expect(Object.keys(fits).sort()).toEqual(Object.keys(terms).sort());
            for (const k of Object.keys(fits)) {
              expect(terms[k].reduce((a, x) => a + x.value, 0)).toBe(fits[k]);
              expect(terms[k][0].key).toBe('base');
              expect(Number.isFinite(fits[k])).toBe(true);
            }
          }
        }
      }

      // follows what the engine rewards: quick hands trap, size grinds, a lead creator keeps the ball
      {
        const at = (v: Partial<RosterProfile>) => ({
          ...rosterProfile([]),
          starCreator: 64,
          creatorGap: 5,
          shooting: 33,
          passing: 52,
          bigPassing: 42,
          postScoring: 62,
          rimProtection: 67,
          athleticism: 54,
          size: 47,
          perimeterD: 52,
          depth: -14,
          steals: 50,
          bigMobility: 48,
          ...v,
        });
        const def = (v: Partial<RosterProfile>) => defPresetFit(at(v));
        const off = (v: Partial<RosterProfile>) => offPresetFit(at(v));
        // (since the trap's turnovers come from the trappers' hands alone, trapping pays only the league's
        // quickest: the Thunder's 60, not an average 54)
        expect(def({ steals: 60 }).blitz).toBeGreaterThan(def({ steals: 60 }).drop);
        expect(def({ steals: 54 }).drop).toBeGreaterThan(def({ steals: 54 }).blitz);
        expect(def({ steals: 60 }).blitz - def({ steals: 60 }).drop).toBeGreaterThan(def({ steals: 52 }).blitz - def({ steals: 52 }).drop);
        expect(def({ steals: 44 }).drop).toBeGreaterThan(def({ steals: 44 }).blitz);
        expect(off({ size: 53 }).grind - off({ size: 53 }).fiveOut).toBeGreaterThan(off({ size: 41 }).grind - off({ size: 41 }).fiveOut);
        expect(off({ starCreator: 74 }).helio - off({ starCreator: 74 }).hub).toBeGreaterThan(off({ starCreator: 56 }).helio - off({ starCreator: 56 }).hub);
      }

      // a term rises with its quality as its weight says
      {
        const pr = profiles[0];
        for (const [k, terms] of Object.entries({ ...offPresetTerms(pr), ...defPresetTerms(pr) })) {
          for (const t of terms) {
            if (t.key === 'base') continue;
            const more = { ...pr, [t.key]: pr[t.key] + 1 };
            const again = { ...offPresetTerms(more), ...defPresetTerms(more) }[k].find((x) => x.key === t.key)!;
            expect(again.value - t.value).toBeCloseTo(t.weight, 6);
          }
        }
      }

      // names the players behind each quality
      {
        for (const t of league.teams.slice(0, 6)) {
          const players = fitRoster(teamPlayers(league, t.tid));
          const pr = rosterProfile(players);
          const top = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, 8);
          const c = (pid: number) => composites(players.find((p) => p.pid === pid)!.ratings);
          const creation = (pid: number) => (c(pid).pnrHandle + c(pid).create) / 2;
          expect(creation(pr.drivers.starCreator[0])).toBeCloseTo(pr.starCreator, 10);
          expect(c(pr.drivers.rimProtection[0]).rimProt).toBeCloseTo(pr.rimProtection, 10);
          expect(pr.drivers.creatorGap).toHaveLength(2);
          expect(pr.drivers.shooting).toHaveLength(top.length);
          // best first: the first shooter spaces the floor at least as well as the last
          expect(c(pr.drivers.shooting[0]).spacing).toBeGreaterThanOrEqual(c(pr.drivers.shooting[top.length - 1]).spacing);
          expect(pr.drivers.depth).toEqual([top[7].pid, top[0].pid]);
        }
      }

      // says what the engine says (the fast version of scripts/style-check.ts, which fitted them): paired
      // games by shot value, fully drilled (partnerships and all, as the fits were measured), against a
      // spread of opponents. Pace & Space beats Grit & Grind, the playbooks the fits set furthest apart,
      // for most rosters, by about what the fits say on average (Heliocentric against Hub Big, which they
      // read at about 0.4, measures about 0.1 on the engine since a shooter's threes level off: too close
      // for a check this size); full-court chaos pays the team with the quickest hands far more than the
      // one with the slowest, as its steals term says
      {
        for (const t of league.teams) ensureRotation(league, t.tid);
        const worth = (tid: number, a: Tactics, b: Tactics, n: number) => {
          let d = 0;
          const opps = league.teams.filter((o) => o.tid !== tid).slice(0, 10);
          const players = teamPlayers(league, tid);
          const side = (t: Tactics) => {
            const team = { ...league.teams[tid], tactics: t };
            return { team, players, adjust: true, fam: freshFamiliarity(team, players, 100) };
          };
          for (const o of opps)
            for (let g = 0; g < n; g++) {
              const them = { team: o, players: teamPlayers(league, o.tid), adjust: true };
              const play = (t: Tactics) => {
                const home = g % 2 === 0;
                const sim = new GameSim(home ? side(t) : them, home ? them : side(t), {
                  rng: new Rng(9001 + tid * 7919 + o.tid * 104729 + g),
                  type: 'regular',
                  injuries: false,
                });
                const r = sim.simToEnd();
                const f = sim.xFouledMiss;
                const v = [r.xShots![0].pts + f[0] + r.home.t.ftm, r.xShots![1].pts + f[1] + r.away.t.ftm];
                return home ? v[0] - v[1] : v[1] - v[0];
              };
              d += play(b) - play(a);
            }
          return d / (opps.length * n);
        };
        const off = (tid: number, id: string) => {
          const x = cloneTactics(league.teams[tid].tactics);
          x.offense = applyOffPreset(x.offense, id);
          return x;
        };
        const def = (tid: number, id: string) => {
          const x = cloneTactics(league.teams[tid].tactics);
          x.defense = applyDefPreset(x.defense, id);
          return x;
        };
        const fitOf = (tid: number) => rosterProfile(fitRoster(teamPlayers(league, tid)));
        // (AI teams: the user's team in a new league runs what he hasn't set yet)
        const seven = [3, 7, 10, 14, 17, 21, 25];
        const pace = seven.map((tid) => worth(tid, off(tid, 'grind'), off(tid, 'paceSpace'), 10));
        const said = seven.map((tid) => (offPresetFit(fitOf(tid)).paceSpace - offPresetFit(fitOf(tid)).grind) / 10);
        const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
        expect(pace.filter((x) => x > 0).length).toBeGreaterThanOrEqual(5);
        expect(avg(pace)).toBeGreaterThan(0.4 * avg(said));
        const bySteals = league.teams.map((t) => t.tid).sort((a, b) => fitOf(a).steals - fitOf(b).steals);
        const slow = bySteals.slice(0, 2);
        const quick = bySteals.slice(-2);
        const chaos = (tid: number) => worth(tid, def(tid, 'switch'), def(tid, 'chaos'), 10);
        const chaosSaid = (tid: number) => (defPresetFit(fitOf(tid)).chaos - defPresetFit(fitOf(tid)).switch) / 10;
        const gap = avg(quick.map(chaos)) - avg(slow.map(chaos));
        const gapSaid = avg(quick.map(chaosSaid)) - avg(slow.map(chaosSaid));
        expect(gapSaid).toBeGreaterThan(1);
        expect(gap).toBeGreaterThan(0.4 * gapSaid);
      }
    }
    // matchup solver: finds the cheapest assignment, five on five and for smaller and bigger groups
    {
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
    }

    // honours planned pairs
    {
      const rng = new Rng(8);
      for (let k = 0; k < 20; k++) {
        const { off, def } = randomUnit(rng, 5, 5);
        // the weakest perimeter defender on their biggest threat: the staff would never choose it
        const star = off.reduce((a, b) => (b.threat > a.threat ? b : a));
        const worst = def.reduce((a, b) => (b.perDef < a.perDef ? b : a));
        const got = solveMatchups(off, def, { [star.pid]: worst.pid });
        expect(def[got[off.indexOf(star)]].pid).toBe(worst.pid);
      }
    }

    // hands defenders out in turn when there are fewer of them than scorers
    {
      const { off, def } = randomUnit(new Rng(1), 5, 3);
      expect(solveMatchups(off, def)).toEqual([0, 1, 2, 0, 1]);
    }

    // leaves game results exactly as the engine made them with its own copy of the search
    {
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
          const side = (tid: number) => {
            const team = structuredClone(league.teams[tid]);
            // (the legacy search has no out-of-possession roles)
            delete team.tactics.defense.roles;
            return { team, players: teamPlayers(league, tid) };
          };
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
    }
  });
});
