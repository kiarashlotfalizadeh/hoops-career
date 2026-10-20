// Tactical familiarity: what a team knows of what it plays, how games, practice and camp build it,
// how it fades, what a game plan prepared for does to it, and what the engine makes of it.
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
import { systemFamiliarity } from '../league/practice';
import { pairedDelta, runLab } from '../ai/lab';
import { simDay } from '../league/season';
import type { Familiarity, League } from '../types';

const user = (l: League) => l.teams[l.userTid];
const roster = (l: League) => teamPlayers(l, l.userTid);

describe('familiarity', () => {
  it('starts drilled in what a team plays, and knows other options only as well as any team does', () => {
    const l = testLeague();
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
  });

  it('costs something to switch: a new coverage, a new shape, sliders off their habits', () => {
    const l = testLeague();
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
  });

  it('a player in a new role pair is a step behind, less so in his natural role or keeping one of his two', () => {
    const l = testLeague();
    const t = user(l);
    const p = roster(l)[0];
    const fam = freshFamiliarity(t, roster(l), 97);
    const known = roleFam(fam, t.tactics, p);
    const next = cloneTactics(t.tactics);
    next.defense.roles = { ...next.defense.roles, [p.pid]: next.defense.roles?.[p.pid] === 'hide' ? 'roamer' : 'hide' };
    expect(roleFam(fam, next, p)).toBeLessThan(known);
    expect(roleFam(fam, next, p)).toBeGreaterThanOrEqual(65);
  });

  it('games build what is played, practice builds it between games, and unused options fade to their floor', () => {
    const l = testLeague();
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
  });

  it('a new arrival learns the system with his minutes, and camp brings a new system most of the way', () => {
    const l = testLeague();
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
  });

  it('a game plan prepared for is drilled for that game, and only that game', () => {
    const l = testLeague();
    const t = user(l);
    const fam = freshFamiliarity(t, roster(l), 97);
    const plan = cloneTactics(t.tactics);
    plan.defense.scheme = 'box1';
    const ready = prepared(fam, t.tactics, plan);
    expect(optValue(ready, 'scheme:box1')).toBeGreaterThanOrEqual(88);
    expect(optValue(fam, 'scheme:box1')).toBeLessThan(30);
  });

  it('labels a figure as the screens say it', () => {
    expect([95, 80, 60, 40, 10].map(famLabel)).toEqual(['Fluid', 'Familiar', 'Learning', 'Awkward', 'New']);
  });

  it('plays an unfamiliar system worse than the same system drilled', () => {
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
  });

  it('every team has a record of what it knows once the season is under way (camp drilled it)', () => {
    const l = testLeague('season fam');
    expect(l.teams.every((t) => systemFamiliarity(l, t.tid).overall >= 85)).toBe(true);
    for (let i = 0; i < 3; i++) simDay(l);
    expect(l.teams.every((t) => !!t.fam && Object.keys(t.fam.know).length >= 10)).toBe(true);
  });
});
