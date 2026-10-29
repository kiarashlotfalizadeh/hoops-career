// Named offensive sets (src/core/sim/sets.ts): who each is for and the look it creates, its edges
// against the defenses it beats and its weakness against those that kill it, defenses reading a set
// a little better every run, after-timeout sets (user only: AI teams run none), and the reports.
// Games that run no set play exactly as before.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { buildSimInput } from '../league/games';
import { GameSim, type SimTeamInput } from '../sim/engine';
import type { PossLog } from '../sim/log';
import { applyPatch, type TacticsPatch } from '../ai/lab';
import { Rng } from '../random';
import { cloneTactics, hasCoachPlans, tacticsDiff, withoutCoachPlans, withoutGameSpecific } from '../sim/tactics';
import { tacticsChanges } from '../sim/playbooks';
import { SETS, SET_IDS, SET_K, READ_ON_IT, castFor, readAfter, readRate, setEdges, setFit, setLook, type DefRead, type FitPlayer } from '../sim/sets';
import { buildGameReport, setLineText, setLines } from '../analysis/gameReport';
import { impactCounter } from '../ai/advisor';
import type { CallId, SetId, Tactics } from '../types';

/** The tactics without the overhaul's shape and out-of-possession roles: the games these numbers were taken from. */
function basic(t: Tactics): Tactics {
  const out = structuredClone(t);
  delete out.offense.shape;
  delete out.defense.roles;
  return out;
}

const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
const side = (tid: number, patch?: TacticsPatch, tactics?: Tactics): SimTeamInput => ({
  team: { ...league.teams[tid], tactics: applyPatch(basic(tactics ?? league.teams[tid].tactics), patch) },
  players: teamPlayers(league, tid),
});
const opts = (seed: number, record = false) => ({ rng: new Rng(seed), type: 'regular' as const, record, injuries: false });
// (an even glass too: a defense that sends fewer to the offensive glass is set when the ball comes up, which takes some of every set's look away)
const MAN: TacticsPatch = { defense: { scheme: 'man', pnr: 'hedge', switchOffBall: false, help: 50, pressure: 50 }, offense: { crashBoards: 50 } };
const DEF: Record<string, TacticsPatch> = {
  drop: { defense: { ...MAN.defense, pnr: 'drop' } },
  hedge: MAN,
  switch: { defense: { ...MAN.defense, pnr: 'switch', switchOffBall: true } },
  zone23: { defense: { scheme: 'zone23', help: 50, pressure: 50 } },
  zone32: { defense: { scheme: 'zone32', help: 50, pressure: 50 } },
};

type SP = FitPlayer & { name: string; on: boolean };
type ST = { on: SP[]; nextSet: { id: SetId; pid: number | null } | null; setRuns: Map<SetId, number>; score: number };
type In = { T: ST[]; poss: 0 | 1; q: number; clock: number; inTransition: boolean; setStats: Map<string, { runs: number; pts: number; readAt?: number }> };
const inn = (sim: GameSim) => sim as unknown as In;

/** A copy of a game in progress that plays on by itself (the possession streams are the game's seed and counts). */
function fork(sim: GameSim): GameSim {
  const { rng, fx, opts: o, ...data } = sim as unknown as Record<string, unknown>;
  void rng;
  void fx;
  const c = Object.assign(Object.create(Object.getPrototypeOf(sim)), structuredClone(data)) as Record<string, unknown>;
  c.rng = new Rng(1);
  c.fx = new Rng(2);
  c.opts = o;
  return c as unknown as GameSim;
}

/** The team (of a few) whose starting five fits set `id` best. */
function teamFor(id: SetId, def = 9): number {
  let best = -1;
  let bestFit = -1;
  for (const tid of [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]) {
    const sim = new GameSim(side(tid), side(def), opts(1));
    const fit = setFit(id, castFor(id, inn(sim).T[0].on)!.star);
    if (fit > bestFit) [best, bestFit] = [tid, fit];
  }
  return best;
}

/**
 * Possession-paired value of running set `id` (its `prior` earlier runs read) over the trip the team
 * would have run: before each of the offense's quiet half-court trips (Q1-Q3), a fork of the game
 * queues the set while the game itself plays on; both draw that possession's stream.
 */
function pairedValue(id: SetId, o: number, def: TacticsPatch, games: number, seed: number, prior = 0) {
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  for (let g = 0; g < games; g++) {
    const sim = new GameSim(side(o), side(9, def), opts(seed + g));
    while (!sim.over) {
      const s = inn(sim);
      if (!(s.poss === 0 && s.q <= 3 && s.clock > 30 && s.clock < 700)) {
        sim.step();
        continue;
      }
      const f = fork(sim);
      inn(f).T[0].setRuns = new Map(prior ? [[id, prior]] : []);
      f.runSet(0, id);
      const [a, b] = [inn(f).T[0].score, s.T[0].score];
      f.step();
      sim.step();
      if (inn(sim).inTransition) continue;
      const d = inn(f).T[0].score - a - (inn(sim).T[0].score - b);
      n++;
      sum += d;
      sum2 += d * d;
    }
  }
  const mean = sum / n;
  return { mean, se: Math.sqrt((sum2 / n - mean * mean) / n), n };
}

describe('the set library', () => {
  const read = (d: Partial<DefRead>): DefRead => ({ cov: 'hedge', scheme: 'man', switches: false, help: 0, pressure: 0, locked: false, ...d });
  const shooter = { c: { c3: 80 } } as FitPlayer;
  const edge = (id: SetId, d: Partial<DefRead>, mode?: 'pop' | 'elbow') => setEdges({ id, mode, c: shooter }, read(d));
  const sum = (e: Record<string, number | undefined>) => Object.values(e).reduce((a: number, x) => a + (x ?? 0), 0);

  it('documents, edges, reads and casts every set, and goes with it around the game: diffs, Keep changes and reports', () => {
    {
      // documents every set: its action, who it is for, its look, what beats it, its time and how fast it is read
      expect(SET_IDS).toHaveLength(7);
      for (const id of SET_IDS) {
        const s = SETS[id];
        for (const k of ['name', 'short', 'forWho', 'what', 'look', 'beats', 'killedBy'] as const) expect(s[k].length, `${id}.${k}`).toBeGreaterThan(3);
        expect(s.time).toBeGreaterThan(0);
        expect(s.read).toBeGreaterThanOrEqual(1);
      }
      // the hardest look to stop is the easiest to read
      expect(SETS.elevator.read).toBe(2);
    }
    {
      // edges for the defenses each set beats and against it for the ones that kill it
      // Spain: the back screen catches the big in drop, hedge, blitz and ice; a switch takes it away, a zone waits for the roll
      for (const cov of ['drop', 'hedge', 'blitz', 'ice'] as const) expect(edge('spain', { cov }).roll).toBeGreaterThan(0.4);
      expect(edge('spain', { cov: 'drop' }).roll).toBeGreaterThan(edge('spain', { cov: 'blitz' }).roll!);
      expect(sum(edge('spain', { cov: 'switch' }))).toBe(0);
      expect(edge('spain', { cov: 'zone', scheme: 'zone23' }).roll).toBeLessThan(0);
      // ... and it needs a shooter to set the back screen
      expect(setEdges({ id: 'spain', c: { c: { c3: 30 } } as FitPlayer }, read({ cov: 'drop' })).roll!).toBeLessThan(edge('spain', { cov: 'drop' }).roll! / 2);
      // Floppy: open off the screens against man, the curl against a top-lock; switched or in a zone it's gone
      expect(edge('floppy', { cov: 'drop' }).three).toBeGreaterThan(edge('floppy', {}).three!);
      expect(edge('floppy', { locked: true }).rim).toBeGreaterThan(0.4);
      expect(sum(edge('floppy', { switches: true }))).toBeLessThan(-0.8);
      expect(edge('floppy', { cov: 'zone', scheme: 'zone23' }).three).toBeLessThan(0);
      // Elevator: open against any man defense, a switch included; a top-lock or the 3-2 kills it
      expect(edge('elevator', {}).three).toBeGreaterThan(0.6);
      expect(edge('elevator', { switches: true }).three).toBeGreaterThan(0);
      expect(edge('elevator', { locked: true }).three).toBeLessThan(-0.5);
      expect(edge('elevator', { cov: 'zone', scheme: 'zone32' }).three).toBeLessThan(-0.5);
      // Hammer: the more they help, the more open the corner; staying home or switching the screen kills it
      expect(edge('hammer', { help: 0.8 }).kick!).toBeGreaterThan(edge('hammer', {}).kick! + 0.5);
      expect(edge('hammer', { help: -0.8 }).kick).toBeLessThan(-0.5);
      expect(edge('hammer', { switches: true }).kick).toBeLessThan(-0.5);
      expect(edge('hammer', { cov: 'zone', scheme: 'zone23' }).kick).toBeGreaterThan(0.4);
      // Chicago: best against drop, switched twice it's gone
      expect(sum(edge('chicago', { cov: 'drop' }))).toBeGreaterThan(sum(edge('chicago', {})));
      expect(sum(edge('chicago', { switches: true }))).toBeLessThan(-1.5);
      // Post split: help on the post opens the split; switching it or staying home kills it
      expect(edge('postSplit', { help: 0.8 }).cut!).toBeGreaterThan(edge('postSplit', {}).cut! + 0.5);
      expect(edge('postSplit', { switches: true }).cut).toBeLessThan(0);
      expect(edge('postSplit', { help: -0.8 }).cut).toBeLessThan(0);
      // Horns: a passing big's elbow handoff beats pressure and help; a zone on the elbows takes both kinds away
      expect(edge('horns', { pressure: 0.8 }, 'elbow').rim!).toBeGreaterThan(edge('horns', {}, 'elbow').rim!);
      expect(edge('horns', { cov: 'drop' }, 'pop').pop).toBeGreaterThan(0);
      expect(sum(edge('horns', { cov: 'zone', scheme: 'zone23' }, 'pop'))).toBeLessThan(0);
      expect(sum(edge('horns', { cov: 'zone', scheme: 'zone23' }, 'elbow'))).toBeLessThan(0);
    }
    {
      // read a little better each run, faster by a better coach, twice as fast for Elevator, up to a cap
      expect(readAfter('floppy', 0, 50)).toBe(0);
      expect(readAfter('floppy', 2, 50)).toBeCloseTo(2 * readRate('floppy', 50));
      expect(readRate('floppy', 90)).toBeGreaterThan(readRate('floppy', 50));
      expect(readRate('floppy', 20)).toBeLessThan(readRate('floppy', 50));
      expect(readRate('elevator', 50)).toBeCloseTo(2 * readRate('floppy', 50));
      expect(readAfter('floppy', 50, 100)).toBe(SET_K.readMax);
      // a usual set is on their radar by its third run, Elevator by its second
      expect(readAfter('floppy', 2, 50)).toBeGreaterThanOrEqual(READ_ON_IT);
      expect(readAfter('floppy', 1, 50)).toBeLessThan(READ_ON_IT);
      expect(readAfter('elevator', 1, 50)).toBeGreaterThanOrEqual(READ_ON_IT);
    }
    {
      // casts each set: who it is for (named or the best fit), and the parts the others play
      const sim = new GameSim(side(4), side(9), opts(1));
      const five = inn(sim).T[0].on;
      for (const id of SET_IDS) {
        const c = castFor(id, five)!;
        // the best fit by default, and five different players in the parts
        expect(setFit(id, c.star)).toBe(Math.max(...five.map((p) => setFit(id, p))));
        const parts = [c.a, c.b, c.c, c.d].filter(Boolean);
        expect(new Set(parts).size).toBe(parts.length);
        expect(parts).toContain(c.star);
        // or anyone named
        for (const p of five) expect(castFor(id, five, p)!.star).toBe(p);
      }
      expect(castFor('floppy', five.slice(0, 4))).toBeNull();
      // what the team goes for: the look up, the rest down
      expect(setLook({ id: 'elevator' }).three).toBeGreaterThan(2);
      expect(setLook({ id: 'floppy' }, true).rim).toBeGreaterThan(setLook({ id: 'floppy' }).rim!);
    }
    {
      // the after-timeout set is kept by tactics diffs and Keep changes, named in diffs, and never game-specific
      const a = cloneTactics(league.teams[0].tactics);
      const b = cloneTactics(a);
      b.manage.ato = 'floppy';
      b.manage.atoPid = 77;
      expect(tacticsDiff(a, b).manage).toMatchObject({ ato: 'floppy', atoPid: 77 });
      expect(applyPatchTactics(a, tacticsDiff(a, b)).manage.ato).toBe('floppy');
      // the after-timeout play's player is the coach's own: kept outside tonight's game
      expect(withoutGameSpecific(b).manage.atoPid).toBe(77);
      const changes = tacticsChanges(a, b, (pid) => `P${pid}`);
      expect(changes).toContainEqual({ label: 'After-timeout play', from: '—', to: 'Floppy' });
      expect(changes).toContainEqual({ label: 'After-timeout play for', from: 'Best fit', to: 'P77' });
    }
    {
      // the reports give each set's runs, points per possession and the run it was read by
      const res = {
        sets: [
          { t: 0 as const, id: 'elevator' as const, runs: 3, pts: 2, readAt: 3 },
          { t: 0 as const, id: 'iso' as const, runs: 1, pts: 2 },
          { t: 1 as const, id: 'floppy' as const, runs: 5, pts: 4 },
        ],
      };
      const lines = setLines(res, 0);
      expect(lines.map((l) => l.name)).toEqual(['Elevator doors', 'Clear-out iso']);
      expect(setLineText(lines[0])).toBe('3 runs, 0.67 PPP, read by the 3rd');
      expect(setLineText(lines[1])).toBe('1 run, 2.00 PPP');
      // a real game's report lists them
      const o = teamFor('floppy');
      const sim = new GameSim(side(o), side(9, MAN), opts(3));
      while (!sim.over) {
        if (inn(sim).poss === 0 && inn(sim).q === 1) sim.runSet(0, 'floppy');
        sim.step();
      }
      const g = { ...sim.result(), gid: 1, season: league.season, day: 1 };
      const rep = buildGameReport(league, g, league.teams[o].tid)!;
      expect(rep.sets[0].id).toBe('floppy');
      expect(rep.sets[0].runs).toBeGreaterThan(5);
      // a set their defense took away has no one-tap fix: the coach just calls something else
      expect(impactCounter('set_floppy:d', cloneTactics(league.teams[0].tactics))).toBeUndefined();
    }
  });
});

describe('sets in the engine', () => {
  /** Logs of the home side's trips over `games` games, queueing the set `call(sim)` names before each of its quiet trips (Q1-Q3), reads cleared when `fresh`. */
  function trips(o: number, def: TacticsPatch, games: number, seed: number, call: (sim: GameSim) => { set: CallId; pid?: number } | null, fresh = true): PossLog[] {
    const out: PossLog[] = [];
    for (let g = 0; g < games; g++) {
      const sim = new GameSim(side(o), side(9, def), opts(seed + g, true));
      while (!sim.over) {
        const s = inn(sim);
        if (s.poss === 0 && s.q <= 3 && s.clock > 30 && !s.T[0].nextSet) {
          if (fresh) s.T[0].setRuns.clear();
          const c = call(sim);
          if (c) sim.runSet(0, c.set, c.pid);
        }
        sim.step();
        out.push(...sim.drainLogs().filter((l) => l.off === 0));
      }
    }
    return out;
  }

  it('runs each set for its player and goes for its look, has its edge against the defenses it beats, is read every run, runs after-timeout sets, and changes nothing when no set is run', () => {
    {
      // runs each set for the player it's queued for, records it on the possession, and goes for its look
      for (const id of SET_IDS) {
        const o = teamFor(id);
        const logs = trips(o, MAN, 3, 300, (sim) => ({ set: id, pid: castFor(id, inn(sim).T[0].on)!.star.pid })).filter((l) => l.set);
        expect(logs.length, id).toBeGreaterThan(60);
        for (const l of logs) {
          expect(l.set!.id).toBe(id);
          expect(l.on[0]).toContain(l.set!.pid);
        }
        // (a switch or a double changes the headline, never the set it came out of)
        expect(logs.filter((l) => l.label.startsWith(`${SETS[id].short}: `)).length / logs.length, id).toBeGreaterThan(0.7);
        const by = (pids: (l: PossLog) => number[], zones?: string[]) => {
          let n = 0;
          let all = 0;
          for (const l of logs)
            for (const st of l.steps)
              if (st.k === 'shot') {
                all++;
                if (pids(l).includes(st.pid!) && (!zones || zones.includes(st.zone!))) n++;
              }
          return n / Math.max(1, all);
        };
        const star = (l: PossLog) => [l.set!.pid];
        if (id === 'spain') {
          // the roll man finishes, or the shooter who set the back screen gets his three
          const backScreen = (l: PossLog) => l.steps.filter((st) => st.k === 'pin').map((st) => st.pid!);
          expect(by(star, ['rim', 'paint']) + by(backScreen, ['c3', 'ab3']), id).toBeGreaterThan(0.45);
          expect(logs.filter((l) => l.steps.some((st) => st.k === 'pin' && st.pid2 === l.set!.pid)).length / logs.length).toBeGreaterThan(0.7);
        }
        if (id === 'floppy') expect(by(star, ['c3', 'ab3', 'rim']), id).toBeGreaterThan(0.55);
        if (id === 'elevator') expect(by(star, ['ab3']), id).toBeGreaterThan(0.5);
        // (0.46 of them before the staff's rotations gave the two best players a star's minutes, 0.43 since: other fives around him)
        if (id === 'hammer') expect(by(star, ['c3']), id).toBeGreaterThan(0.4);
        if (id === 'chicago') expect(by(star), id).toBeGreaterThan(0.55);
        if (id === 'horns') expect(logs.filter((l) => l.steps.some((st) => st.pid === l.set!.pid || st.pid2 === l.set!.pid)).length / logs.length, id).toBeGreaterThan(0.9);
        if (id === 'postSplit') {
          // the ball comes out of the post to the pair splitting around him (a third of the runs and more:
          // 0.32-0.34 since the playbooks were rebalanced and the AI's staffs refit, 2026-10-26, 0.35+ before)
          const passes = logs.filter((l) => l.steps.some((st) => st.k === 'pass' && st.pid === l.set!.pid)).length;
          expect(passes / logs.length, id).toBeGreaterThan(0.3);
        }
      }
    }
    {
      // has its edge against the defenses it beats and loses it against those that kill it
      const cases: [SetId, string, string][] = [
        ['floppy', 'drop', 'switch'],
        ['spain', 'hedge', 'switch'],
        ['elevator', 'hedge', 'zone32'],
        ['chicago', 'drop', 'switch'],
      ];
      for (const [id, beats, kills] of cases) {
        const o = teamFor(id);
        // (Chicago's gap is the smallest, about 0.19 a run: forty games measure it to 0.05, ten only to 0.1;
        // Spain's against hedge came out about 0.05-0.14 over ten games when the playbooks were rebalanced, 2026-10-26)
        const games = id === 'chicago' ? 40 : id === 'spain' ? 30 : 10;
        const a = pairedValue(id, o, DEF[beats], games, 500);
        const b = pairedValue(id, o, DEF[kills], games, 500);
        expect(a.mean, `${id} vs ${beats}`).toBeGreaterThan(0);
        expect(a.mean - b.mean, `${id}: ${beats} vs ${kills}`).toBeGreaterThan(2 * Math.hypot(a.se, b.se));
      }
      // the more the defense helps, the more open Hammer's corner
      const o = teamFor('hammer');
      const hi = pairedValue('hammer', o, { defense: { ...MAN.defense, help: 90 } }, 10, 500);
      const lo = pairedValue('hammer', o, { defense: { ...MAN.defense, help: 10 } }, 10, 500);
      expect(hi.mean - lo.mean).toBeGreaterThan(2 * Math.hypot(hi.se, lo.se));
    }
    {
      // is read a little better every run: its look gets less open, and a spammed set costs points
      const o = teamFor('floppy');
      const first = pairedValue('floppy', o, MAN, 10, 700, 0);
      const late = pairedValue('floppy', o, MAN, 10, 700, 7);
      expect(first.mean).toBeGreaterThan(0);
      expect(late.mean).toBeLessThan(0);
      expect(first.mean - late.mean).toBeGreaterThan(2 * Math.hypot(first.se, late.se));
      // run on every trip, its tally shows the run it was read by, and the reads are tagged against it
      const sim = new GameSim(side(o), side(9, MAN), opts(7));
      while (!sim.over) {
        if (inn(sim).poss === 0) sim.runSet(0, 'floppy');
        sim.step();
      }
      const res = sim.result();
      const st = res.sets!.find((s) => s.t === 0 && s.id === 'floppy')!;
      expect(st.runs).toBeGreaterThan(40);
      expect(st.readAt).toBe(3);
      expect(res.impacts!.find((im) => im.key === 'set_read:d' && im.t === 1)!.pts).toBeGreaterThan(3);
    }
    {
      // plays games with no sets exactly as before: AI teams never run one
      // box-score fingerprints taken from the engine before sets (the same games as engineDefense's default ones,
      // and a coached side with an after-timeout action, a go-to player and two timeouts), taken again
      // when side-out fouls started restarting the shot clock and timeouts started stopping play, and when
      // tactics were made to matter twice as much (K.tacticEdge), when the late game, crunch-time touches,
      // home court and the staff's substitutions were polished, and when the AI's playbooks were recalibrated
      // and the league's rates recentred, and again when a side-out foul's inbound started taking its seconds, a narrow late lead stopped reaching in and offensive fouls came up to the NBA's rate, and when the off-ball switches' tags were weighed by what they're worth, and when pressure and the blitz were cut to a realistic size and the league's turnovers, fouls and blocks recentred, and when a player's share of his team's possessions was made to level off past 32%, and when the credit for assisted twos was trimmed to the NBA's rate, and when the big decisions were made to matter (K.matchup, the coverages' sizes, the AI coaches' own defenses), and when crunch time came to need a game still in reach, the AI's rotations floored their two best players' minutes and severe injuries were made rarer, and when a shooter's threes came to level off past his share of the shots and his skill to count for less at the top of the scale, and a defender's steals to come less often past his second of the night, and all again when the AI's staffs were refit to what each style measures, the league's threes, fouls and turnovers recentred and a switched ball screen's tags weighed by what they're worth, and again 2026-10-26, when the zones came to play to the two fives on the floor, the playbooks were rebalanced and the AI's staffs refit with no zone ban
      // (all of them again 2026-10-27, when a shooter past his share of the threes came to get tougher ones: K.threeUse.contest; and again for K.useCeil;
      // and again 2026-10-28, when the threes were recentred: K.recenter.three, and again that day, when Five-Out,
      // Pace & Space, Ice and the 2-3 zone were retuned and the staffs' reads refit)
      const expected = {
        ai: [
          [115, 114, 85, 38, 11, 17, 13, 0],
          [122, 113, 82, 18, 6, 26, 13, 0],
          [111, 106, 97, 43, 7, 16, 11, 0],
        ],
        // (taken again when play calls from the bench were retired, and the first and third games when garbage time came for both benches from late in the third quarter, with the team up big easing off and calling off its press)
        coached: [
          [121, 106, 89, 32, 14, 20, 11, 0],
          [113, 125, 77, 31, 7, 29, 16, 0],
          [95, 109, 75, 32, 11, 31, 19, 0],
        ],
      };
      const fp = (res: ReturnType<GameSim['result']>) => [res.home.pts, res.away.pts, res.home.t.fga, res.away.t.tpa, res.home.t.orb, res.away.t.fta, res.home.t.tov, res.ot];
      const adj = (s: SimTeamInput) => ({ ...s, adjust: true });
      for (let g = 0; g < 3; g++) {
        expect(fp(new GameSim(adj(side(10 + g)), adj(side(20 + g)), { rng: new Rng(800 + g), type: 'regular', injuries: true }).simToEnd())).toEqual(expected.ai[g]);
        const home = adj(side(3 + g, { manage: { ato: 'pnr', goTo: league.teams[3 + g].rotation.order[0] } }));
        const sim = new GameSim(home, adj(side(13 + g)), { rng: new Rng(900 + g), type: 'regular', record: true, injuries: true });
        let i = 0;
        while (sim.step()) {
          i++;
          if (i === 40 || i === 130) sim.callTimeout(0);
        }
        expect(fp(sim.result())).toEqual(expected.coached[g]);
      }
      // an AI coach on a team the user left with an after-timeout set plays its playbook without it
      const t = cloneTactics(league.teams[1].tactics);
      t.manage.ato = 'floppy';
      expect(hasCoachPlans(t)).toBe(true);
      expect(withoutCoachPlans(t).manage.ato).toBeUndefined();
      const l2 = structuredClone(league);
      l2.teams[1].tactics = t;
      const input = buildSimInput(l2, 1, 1, 'regular', 2);
      expect(input.team.tactics.manage.ato).toBeUndefined();
      const withAto = new GameSim(input, buildSimInput(l2, 2, 1, 'regular', 1), opts(5)).simToEnd();
      const without = new GameSim(buildSimInput(league, 1, 1, 'regular', 2), buildSimInput(league, 2, 1, 'regular', 1), opts(5)).simToEnd();
      expect(JSON.stringify(withAto)).toBe(JSON.stringify(without));
      expect(withAto.sets).toBeUndefined();
    }
    {
      // runs an after-timeout set for the player it names (the best fit when he sits)
      const o = teamFor('elevator');
      let ran = 0;
      for (let g = 0; g < 16; g++) {
        const sim = new GameSim(side(o), side(9, MAN), opts(1300 + g, true));
        const star = castFor('elevator', inn(sim).T[0].on)!.star.pid;
        const t = sim.baseTactics(0);
        t.manage.ato = 'elevator';
        t.manage.atoPid = star;
        sim.setTactics(0, t);
        for (let i = 0; i < 20 + 7 * g && !sim.over; i++) sim.step();
        sim.drainLogs();
        const q = inn(sim).q;
        if (!sim.callTimeout(0)) continue;
        // the trip out of the timeout (an inbound: no run-out), after the other side's when it had a live ball
        let l: PossLog | undefined;
        for (let i = 0; i < 6 && !l; i++) {
          sim.step();
          l = sim.drainLogs().find((x) => x.off === 0);
        }
        // (a timeout at a period's end: its after-timeout play goes with the period)
        if (!l || l.kind !== 'half' || !l.action || l.q !== q) continue;
        expect(l.set?.id).toBe('elevator');
        if (l.on[0].includes(star)) expect(l.set!.pid).toBe(star);
        ran++;
      }
      // (most of the sixteen timeouts lead to a half-court trip with its action: 10 of them since the
      // playbooks were rebalanced, 2026-10-26, 11 before)
      expect(ran).toBeGreaterThan(9);
    }
    {
      // a clear-out called for the go-to player (the late play call's first) is his isolation on the
      // trip it's called for, the after-timeout isolation's path, counted with the night's clear-outs
      const o = teamFor('chicago');
      const star = league.teams[o].rotation.order[0];
      const sim0 = new GameSim(side(o, { manage: { goTo: star } }), side(9, MAN), opts(1));
      expect(sim0.closer(sim0.T[0])!.pid).toBe(star);
      const logs = trips(o, MAN, 2, 1400, (sim) => ({ set: 'iso', pid: sim.closer(sim.T[0])!.pid }));
      const ran = logs.filter((l) => l.kind === 'half' && l.iso !== undefined);
      expect(ran.length).toBeGreaterThan(60);
      for (const l of ran) {
        expect(l.action).toBe('iso');
        expect(l.on[0]).toContain(l.iso);
        expect(l.steps.find((x) => x.k === 'drive')?.pid).toBe(l.iso);
      }
      // (the home side's go-to is named: while he's on the floor the call is for him)
      const home = new GameSim(side(o, { manage: { goTo: star } }), side(9, MAN), opts(1400, true));
      let n = 0;
      while (!home.over) {
        const s = inn(home);
        if (s.poss === 0 && s.q <= 3 && s.clock > 30 && !s.T[0].nextSet && s.T[0].on.some((p) => p.pid === star)) home.runSet(0, 'iso', star);
        home.step();
        n += home.drainLogs().filter((l) => l.off === 0 && l.iso === star).length;
      }
      expect(n).toBeGreaterThan(20);
      expect(home.result().sets?.find((x) => x.t === 0 && x.id === 'iso')?.runs).toBeGreaterThanOrEqual(n);
    }
  }, 180_000);
});

/** Tactics with a patch applied, as the live game's Keep changes applies a diff. */
function applyPatchTactics(t: Tactics, patch: TacticsPatch): Tactics {
  return applyPatch(t, patch);
}
