// Tactical familiarity: what a team knows of what it plays, how games, practice and camp build it,
// how it fades, what a game plan prepared for does to it, the staff's words and cards on it (with the
// practice focus as their one-tap fix), and what the engine makes of it and of partnerships.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import {
  FLUID,
  afterGame,
  execution,
  famDims,
  famEnds,
  famLabel,
  famPenalty,
  freshFamiliarity,
  gamesTo,
  optValue,
  practiceDay,
  prepared,
  roleFam,
  trainingCamp,
} from '../sim/familiarity';
import { cloneTactics } from '../sim/tactics';
import { teamPlayers } from '../league/helpers';
import { createLeague, defaultSettings } from '../league/create';
import { systemFamiliarity, trainingCamps } from '../league/practice';
import { pairedDelta, runLab } from '../ai/lab';
import { simDay } from '../league/season';
import { IMPACT_TEXT, impactSentence } from '../analysis/gameReport';
import { practiceAdvice } from '../analysis/debrief';
import { famReadout, optionName } from '../ai/advisor';
import { applyFix, assistantFeed } from '../ai/assistant';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import type { Familiarity, League, Player, Tactics } from '../types';

const user = (l: League) => l.teams[l.userTid];
const roster = (l: League) => teamPlayers(l, l.userTid);
const baseLeague = testLeague();
const fresh = () => structuredClone(baseLeague);

/** A fictional league after training camp, for the staff's cards. */
const staffBase = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
staffBase.phase = 'regular';
trainingCamps(staffBase);
const staffLeague = () => structuredClone(staffBase);

describe('familiarity', () => {
  it('starts drilled in what a team plays, costs something to switch, builds with games, practice and camp, fades unused, and the staff says so', () => {
    {
      // drilled in what it plays, and knows other options only as well as any team does
      const l = fresh();
      const t = user(l);
      t.tactics.defense.pnr = 'drop';
      const fam = freshFamiliarity(t, roster(l), 97);
      expect(optValue(fam, 'pnr:drop')).toBe(97);
      expect(optValue(fam, 'pnr:blitz')).toBeLessThan(50);
      expect(optValue(fam, 'scheme:tri2')).toBeLessThan(optValue(fam, 'scheme:zone23'));
      // fluid at both ends: no penalty for what it plays
      const e = execution(fam, t.tactics, roster(l).slice(0, 5));
      expect(famPenalty(e.off)).toBe(0);
      expect(famPenalty(e.def)).toBe(0);
    }
    {
      // a switch costs something: a new coverage, a new shape, sliders off their habits
      const l = fresh();
      const t = user(l);
      const fam = freshFamiliarity(t, roster(l), 97);
      const base = famDims(fam, t.tactics);
      const next = cloneTactics(t.tactics);
      next.defense.pnr = t.tactics.defense.pnr === 'blitz' ? 'ice' : 'blitz';
      next.offense.shape = 'twoIn';
      next.offense.pace = Math.min(100, t.tactics.offense.pace + 40);
      const d = famDims(fam, next);
      expect(d.coverage).toBeLessThan(base.coverage - 30);
      expect(d.shape).toBeLessThan(base.shape - 30);
      expect(d.tempo).toBeLessThan(base.tempo - 20);
      expect(famEnds(d).off).toBeLessThan(famEnds(base).off);
      expect(famPenalty(famEnds(d).def)).toBeGreaterThan(0);
    }
    {
      // a player in a new role pair is a step behind, less so in his natural role or keeping one of his two
      const l = fresh();
      const t = user(l);
      const p = roster(l)[0];
      const fam = freshFamiliarity(t, roster(l), 97);
      const known = roleFam(fam, t.tactics, p);
      const next = cloneTactics(t.tactics);
      next.defense.roles = { ...next.defense.roles, [p.pid]: next.defense.roles?.[p.pid] === 'hide' ? 'roamer' : 'hide' };
      expect(roleFam(fam, next, p)).toBeLessThan(known);
      expect(roleFam(fam, next, p)).toBeGreaterThanOrEqual(65);
    }
    {
      // games build what is played, practice builds it between games, and unused options fade to their floor
      const l = fresh();
      const t = user(l);
      t.tactics.defense.pnr = 'blitz';
      t.fam = freshFamiliarity({ ...t, tactics: { ...t.tactics, defense: { ...t.tactics.defense, pnr: 'drop' } } }, roster(l), 97);
      const fam = t.fam;
      const start = optValue(fam, 'pnr:blitz');
      const drop = optValue(fam, 'pnr:drop');
      const secs = Object.fromEntries(roster(l).map((p) => [p.pid, 1800]));
      for (let i = 0; i < 10; i++) afterGame(fam, t.tactics, roster(l), secs);
      const afterTen = optValue(fam, 'pnr:blitz');
      expect(afterTen).toBeGreaterThan(start + 25);
      expect(gamesTo(start, 90)).toBeGreaterThan(10);
      // drills: faster than a balanced week, and recovery builds nothing
      const a = structuredClone(fam);
      const b = structuredClone(fam);
      const c = structuredClone(fam);
      for (const [f, prep] of [
        [a, 'balanced'],
        [b, 'system'],
        [c, 'recovery'],
      ] as [Familiarity, 'balanced' | 'system' | 'recovery'][]) {
        const team = { ...t, fam: f, prep };
        for (let i = 0; i < 5; i++) practiceDay(team, roster(l));
      }
      expect(optValue(b, 'pnr:blitz')).toBeGreaterThan(optValue(a, 'pnr:blitz'));
      expect(optValue(c, 'pnr:blitz')).toBe(afterTen);
      // the drop nobody plays any more fades, never below what any team knows
      for (let i = 0; i < 400; i++) practiceDay(t, roster(l));
      expect(optValue(fam, 'pnr:drop')).toBeLessThan(drop);
      expect(optValue(fam, 'pnr:drop')).toBeGreaterThanOrEqual(65);
    }
    {
      // a new arrival learns the system with his minutes, and camp brings a new system most of the way
      const l = fresh();
      const t = user(l);
      t.fam = freshFamiliarity(t, roster(l), 97);
      const newcomer = roster(l)[0];
      delete t.fam.know[newcomer.pid];
      expect(systemFamiliarity(l, l.userTid).players.find((x) => x.pid === newcomer.pid)!.know).toBe(35);
      // a whole new defense, then camp
      t.tactics.defense.scheme = 'zone32';
      t.tactics.defense.pnr = 'blitz';
      const before = systemFamiliarity(l, l.userTid).def;
      trainingCamp(t, roster(l));
      const after = systemFamiliarity(l, l.userTid);
      expect(after.def).toBeGreaterThan(before + 15);
      expect(after.def).toBeLessThan(FLUID);
      expect(after.players.find((x) => x.pid === newcomer.pid)!.know).toBeGreaterThan(70);
    }
    {
      // a game plan prepared for is drilled for that game, and only that game
      const l = fresh();
      const t = user(l);
      const fam = freshFamiliarity(t, roster(l), 97);
      const plan = cloneTactics(t.tactics);
      plan.defense.scheme = 'box1';
      const ready = prepared(fam, t.tactics, plan);
      expect(optValue(ready, 'scheme:box1')).toBeGreaterThanOrEqual(88);
      expect(optValue(fam, 'scheme:box1')).toBeLessThan(30);
    }
    // labels a figure as the screens say it
    expect([95, 80, 60, 40, 10].map(famLabel)).toEqual(['Fluid', 'Familiar', 'Learning', 'Awkward', 'New']);
    {
      // every team has a record of what it knows once the season is under way (camp drilled it)
      const l = testLeague('season fam');
      expect(l.teams.every((t) => systemFamiliarity(l, t.tid).overall >= 85)).toBe(true);
      for (let i = 0; i < 3; i++) simDay(l);
      expect(l.teams.every((t) => !!t.fam && Object.keys(t.fam.know).length >= 10)).toBe(true);
    }

    // the staff has words for every new engine tag: familiarity, shape and out-of-possession roles
    for (const key of [
      'fam_off:d',
      'fam_def:o',
      'shape_glass:o',
      'shape_glass:d',
      'shape_space:o',
      'shape_space:d',
      'shape_tov:o',
      'role_poa:d',
      'role_stopper:d',
      'role_anchor:d',
      'role_anchor:o',
      'role_roam:d',
      'role_roam:o',
    ]) {
      expect(IMPACT_TEXT[key], key).toBeDefined();
      expect(impactSentence(key, 'the Aces', 'the Bees', ' (Smith)')).toMatch(/^[A-Z].*\.$/);
    }
    expect(optionName('pnr:blitz')).toBe('the blitz');
    expect(optionName('scheme:zone23')).toBe('the 2-3 zone');
    {
      // flags an option the team hasn't drilled, with tactical drills one tap away (a 3-2 zone: the
      // user's staff may base on the 2-3)
      const l = staffLeague();
      expect(famReadout(l).risks).toEqual([]);
      const t = l.teams[0].tactics;
      t.manual = true;
      t.defense.scheme = 'zone32';
      const r = famReadout(l);
      expect(r.risks[0]).toMatchObject({ key: 'scheme:zone32', plan: false });
      const card = assistantFeed(l).find((c) => c.id === 'alert:fam-opt-scheme:zone32');
      expect(card?.area).toBe('tactics');
      expect(card?.fix).toEqual({ kind: 'prep', focus: 'system', label: 'Tactical drills' });
      expect(applyFix(l, card!.fix!)).toMatch(/Tactical drills/);
      expect(l.teams[0].prep).toBe('system');
      // with the drills on, the card has no fix left to offer
      expect(assistantFeed(l).find((c) => c.id === 'alert:fam-opt-scheme:zone32')?.fix).toBeUndefined();
    }
    {
      // marks what tonight's plan brings apart from the system
      const l = staffLeague();
      const opp = 1;
      l.gamePlans = { [opp]: { oppTid: opp, items: [{ id: 'z', label: 'Zone', group: 'coverage', patch: { defense: { scheme: 'zone32' } } }] } } as League['gamePlans'];
      const r = famReadout(l, opp);
      expect(r.risks.find((x) => x.key === 'scheme:zone32')?.plan).toBe(true);
    }
    {
      // talks practice after a game a step slow cost, and not over a small cost
      const l = staffLeague();
      expect(practiceAdvice(l, 0.3)).toBeNull();
      // the system is learned: the plan was the gap
      expect(practiceAdvice(l, 1.2)).toMatchObject({ id: 'prep-opponent', prep: 'opponent' });
      l.teams[0].tactics.defense.scheme = 'zone32';
      const a = practiceAdvice(l, 1.2)!;
      expect(a).toMatchObject({ id: 'prep-system', prep: 'system', label: 'Tactical drills' });
      l.teams[0].prep = 'system';
      const b = practiceAdvice(l, 1.2)!;
      expect(b.title).toBe('Stick with the system');
      expect(b.prep).toBeUndefined();
    }
  });

  it('is played by the engine: an unfamiliar system worse than the same system drilled, partnerships only with a record of understanding', () => {
    {
      const l = testLeague('fam engine');
      const t = user(l);
      const opp = l.teams[(l.userTid + 5) % 30];
      const ps = roster(l);
      const fluid = freshFamiliarity(t, ps, 100);
      const raw: Familiarity = { opt: {}, habit: Object.fromEntries(Object.entries(fluid.habit).map(([k, v]) => [k, Math.max(0, v - 45)])), know: {}, roles: {} };
      const side = (fam: Familiarity) => ({ team: { ...t, fam }, players: ps });
      const b = { team: { ...opp, fam: undefined }, players: teamPlayers(l, opp.tid) };
      const a = runLab({ a: side(fluid), b, games: 120, seed: 31 });
      const z = runLab({ a: side(raw), b, games: 120, seed: 31 });
      const d = pairedDelta(a, z);
      expect(d.delta).toBeLessThan(-1);
      expect(z.impacts['fam_off:o']?.them ?? z.impacts['fam_off:d']?.them ?? 0).toBeGreaterThan(0);
    }
    {
      // a creator and a roller link in the engine only once the pair has understanding, and the link is tagged for the reports
      const l = fresh();
      const ps = roster(l);
      const starters = l.teams[l.userTid].rotation.order.slice(0, 5).map((pid) => ps.find((p) => p.pid === pid)!);
      const [a, b] = starters;
      const tactics = cast(user(l).tactics, starters, { [a.pid]: 'creator', [b.pid]: 'roller' });
      const team = { ...user(l), tactics };
      const opp = l.teams.find((t) => t.tid !== l.userTid)!;
      // (three games: a playbook that runs fewer ball screens than another can go a night without the pair's)
      const play = (fam: ReturnType<typeof freshFamiliarity> | undefined) =>
        [41, 42, 43].flatMap((seed) => {
          const sim = new GameSim(
            { team: { ...team, fam }, players: ps },
            { team: { ...opp, fam: undefined }, players: teamPlayers(l, opp.tid) },
            { rng: new Rng(seed), type: 'regular' },
          );
          sim.simToEnd();
          return [...sim.impacts.keys()].filter((k) => k.startsWith('link_') || k.startsWith('clash_'));
        });
      expect(play(undefined)).toEqual([]);
      expect(play(freshFamiliarity(team, ps, 97)).some((k) => k.startsWith('link_twoMan:o'))).toBe(true);
      const strangers = freshFamiliarity(team, ps, 97);
      strangers.duo = {};
      expect(play(strangers).some((k) => k.startsWith('link_twoMan'))).toBe(false);
    }
  });
});

/** Tactics with every one of `ps` a Glue Guy and a Position Defender but the roles given. */
function cast(t: Tactics, ps: Player[], off: Record<number, string>, def: Record<number, string> = {}): Tactics {
  const out = cloneTactics(t);
  for (const p of ps) out.offense.roles[p.pid] = (off[p.pid] ?? 'glue') as never;
  out.defense.roles = Object.fromEntries(ps.map((p) => [p.pid, (def[p.pid] ?? 'standard') as never]));
  delete out.offense.shape;
  return out;
}
