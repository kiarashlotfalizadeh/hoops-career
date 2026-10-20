// Tactic slots (A, B, C), shapes, out-of-possession roles and mentality: the parts of the tactics the
// Football Manager-style overhaul added, as the coach and the staff use them.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { activeSlot, clearSlot, copyToSlot, renameSlot, slotLabel, slotPatch, slotTactics, switchSlot, withSlotPlans } from '../sim/slots';
import { applyPatch, cloneTactics, situationFromTemplate, withMentality } from '../sim/tactics';
import { solveMatchups } from '../sim/matchups';
import { autoDefRoles, autoShape, autoTactics, shapeFits } from '../ai/coachAI';
import { defRoleFits } from '../analysis/system';
import { teamPlayers } from '../league/helpers';
import { loadPlaybook, tacticsChanges, toPlaybook } from '../sim/playbooks';
import type { Player } from '../types';

describe('tactic slots', () => {
  it('switches between whole tactics, keeping the other in its slot and tonight’s matchups with the team', () => {
    const l = testLeague();
    const t = l.teams[l.userTid];
    t.tactics.defense.matchups = { 1: 2 };
    const a = cloneTactics(t.tactics);
    expect(activeSlot(t)).toBe(0);
    expect(switchSlot(t, 1)).toBe(true);
    // an empty slot starts as a copy
    expect(t.tactics.offense.pace).toBe(a.offense.pace);
    t.tactics.offense.pace = 95;
    t.tactics.defense.scheme = 'zone23';
    expect(t.tactics.defense.matchups).toEqual({ 1: 2 });
    switchSlot(t, 0);
    expect(t.tactics.offense.pace).toBe(a.offense.pace);
    expect(slotTactics(t, 1)!.offense.pace).toBe(95);
    // a stored slot keeps no opponent-specific parts
    expect(slotTactics(t, 1)!.defense.matchups).toEqual({});
    renameSlot(t, 1, '  Zone   look  ');
    expect(slotLabel(t, 1)).toBe('B · Zone look');
    expect(switchSlot(t, 3)).toBe(false);
  });

  it('a situational plan can switch to a slot: its patch is the slot’s changes', () => {
    const l = testLeague();
    const t = l.teams[l.userTid];
    copyToSlot(t, 2);
    t.slots!.stored[2]!.offense.pace = 100;
    t.slots!.stored[2]!.defense.press = 'always';
    const plan = { ...situationFromTemplate('chasing'), slot: 2 };
    t.tactics.situations = [plan];
    const patch = slotPatch(t, t.tactics, plan)!;
    const played = applyPatch(t.tactics, patch);
    expect(played.offense.pace).toBe(100);
    expect(played.defense.press).toBe('always');
    expect(withSlotPlans(t, t.tactics).situations![0].patch).toEqual(patch);
    clearSlot(t, 2);
    expect(t.tactics.situations![0].slot).toBeUndefined();
  });
});

describe('mentality', () => {
  it('nudges the risk the whole system takes, and balanced plays the settings as they are', () => {
    const l = testLeague();
    const t = cloneTactics(l.teams[l.userTid].tactics);
    expect(withMentality(t)).toBe(t);
    t.mentality = 2;
    const hot = withMentality(t);
    expect(hot.offense.pace).toBeGreaterThan(t.offense.pace);
    expect(hot.defense.getBack).toBeLessThan(t.defense.getBack);
    t.mentality = -2;
    const cold = withMentality(t);
    expect(cold.offense.crashBoards).toBeLessThan(t.offense.crashBoards);
    expect(applyPatch(t, { mentality: 1 }).mentality).toBe(1);
  });
});

describe('shapes and out-of-possession roles', () => {
  const shooters = (ps: Player[]) => ps.map((p) => ({ ...p, ratings: { ...p.ratings, tp: Math.max(p.ratings.tp, 85) }, injury: null }));
  const bruisers = (ps: Player[]) =>
    ps.map((p) => ({ ...p, ratings: { ...p.ratings, ...(p.ratings.hgt >= 55 ? { tp: 10, reb: 90, ins: 85, post: 85 } : { tp: Math.min(p.ratings.tp, 35) }) }, injury: null }));

  it('the staff’s shape follows the roster: five-out for five shooters, never for non-shooters', () => {
    const l = testLeague();
    const ps = teamPlayers(l, l.userTid);
    const order = l.teams[l.userTid].rotation.order;
    expect(shapeFits(shooters(ps), undefined, order).fiveOut).toBeGreaterThan(shapeFits(bruisers(ps), undefined, order).fiveOut + 15);
    expect(shapeFits(bruisers(ps), undefined, order).twoIn).toBeGreaterThan(shapeFits(shooters(ps), undefined, order).twoIn);
    expect(autoShape(bruisers(ps), undefined, order)).not.toBe('fiveOut');
  });

  it('roles send their players to the man their job is', () => {
    const off = [
      { pid: 1, hgt: 30, big: false, threat: 10, handle: 9, shoot: 70 },
      { pid: 2, hgt: 45, big: false, threat: 8, handle: 1, shoot: 60 },
      { pid: 3, hgt: 50, big: false, threat: 2, handle: 0, shoot: 5 },
      { pid: 4, hgt: 60, big: true, threat: 3, handle: 0, shoot: 60 },
      { pid: 5, hgt: 75, big: true, threat: 2, handle: 0, shoot: 5 },
    ];
    const d = (pid: number, hgt: number, role?: 'poa' | 'stopper' | 'anchor' | 'roamer' | 'hide') => ({ pid, hgt, intDef: 55, perDef: 55, ...(role && { role }) });
    // the anchor is the tallest and guards the non-shooting big; the roamer leaves the non-shooting wing
    const def = [d(11, 40, 'poa'), d(12, 46, 'stopper'), d(13, 50, 'roamer'), d(14, 62), d(15, 76, 'anchor')];
    const pick = solveMatchups(off, def);
    expect(def[pick[0]].pid).toBe(11);
    expect(def[pick[1]].pid).toBe(12);
    expect(def[pick[2]].pid).toBe(13);
    expect(def[pick[4]].pid).toBe(15);
  });

  it('the staff gives each role to a player who suits it, at most once a unit', () => {
    const l = testLeague();
    const ps = teamPlayers(l, l.userTid);
    const roles = autoDefRoles(ps, l.teams[l.userTid].rotation);
    const byId = new Map(ps.map((p) => [p.pid, p]));
    for (const [pid, r] of Object.entries(roles)) expect(defRoleFits(byId.get(+pid)!)[r]).toBeGreaterThanOrEqual(66);
    const starters = l.teams[l.userTid].rotation.order.slice(0, 5);
    const starterRoles = starters.map((pid) => roles[pid]).filter(Boolean);
    expect(new Set(starterRoles).size).toBe(starterRoles.length);
  });

  it('in season the staff keeps its system unless another fits clearly better', () => {
    const l = testLeague();
    const t = l.teams[(l.userTid + 3) % 30];
    const ps = teamPlayers(l, t.tid);
    const best = autoTactics(t, ps, false);
    // a playbook about as good as the best stays; a much worse one doesn't
    const kept = autoTactics({ ...t, tactics: { ...best, offPreset: best.offPreset } }, ps, false, { sticky: true });
    expect(kept.offPreset).toBe(best.offPreset);
  });

  it('saved playbooks carry the shape, mentality, glass duties and roles, for players still on the roster', () => {
    const l = testLeague();
    const t = cloneTactics(l.teams[l.userTid].tactics);
    const [a] = teamPlayers(l, l.userTid);
    t.offense.shape = 'horns';
    t.mentality = -1;
    t.offense.glass = { [a.pid]: 1 };
    t.defense.roles = { [a.pid]: 'poa', 999999: 'anchor' };
    const pb = toPlaybook(t, { id: 'x', name: 'X', saved: { season: 2027, day: 1 } });
    const plain = cloneTactics(l.teams[l.userTid].tactics);
    delete plain.offense.shape;
    delete plain.defense.roles;
    const out = loadPlaybook(plain, pb, [a.pid]);
    expect(out.offense.shape).toBe('horns');
    expect(out.mentality).toBe(-1);
    expect(out.offense.glass).toEqual({ [a.pid]: 1 });
    expect(out.defense.roles).toEqual({ [a.pid]: 'poa' });
    const labels = tacticsChanges(plain, out).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['Mentality', 'Shape']));
    expect(labels.some((x) => x.includes('defensive role'))).toBe(true);
  });
});
