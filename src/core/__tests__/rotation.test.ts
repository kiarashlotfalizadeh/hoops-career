import { describe, expect, it } from 'vitest';
import { buildMinutePlan, normalizeMinutes, planInputs, type PlanPlayer, type PlanSource } from '../sim/rotationPlan';
import type { Rotation } from '../types';

const players: PlanPlayer[] = [36, 34, 33, 31, 29, 24, 20, 16, 12, 5].map((m, i) => ({
  pid: i,
  minutes: m,
  starter: i < 5,
  closer: i < 5,
  guard: i % 2 === 0,
  big: i === 4 || i === 9,
  endurance: 60,
}));

describe('rotation plan', () => {
  it('normalizes to exactly 240 minutes', () => {
    expect(normalizeMinutes(players).reduce((a, b) => a + b, 0)).toBe(240);
  });
  it('fields five players every minute and honors minute targets', () => {
    const plan = buildMinutePlan(players);
    expect(plan.length).toBe(48);
    for (const slot of plan) expect(new Set(slot).size).toBe(5);
    const norm = normalizeMinutes(players);
    players.forEach((p, i) => {
      const got = plan.filter((s) => s.includes(p.pid)).length;
      expect(Math.abs(got - norm[i])).toBeLessThanOrEqual(1);
    });
  });
  it('starts the starters and closes with the closers', () => {
    const plan = buildMinutePlan(players);
    expect([...plan[0]].sort()).toEqual([0, 1, 2, 3, 4]);
    expect([...plan[47]].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('plan inputs', () => {
  const src: PlanSource[] = Array.from({ length: 12 }, (_, i) => ({ pid: i, available: true, guard: i % 2 === 0, big: i % 5 === 4, endurance: 60 }));
  const rot = (over: Partial<Rotation> = {}): Rotation => ({
    order: src.map((p) => p.pid),
    minutes: Object.fromEntries([36, 34, 33, 31, 29, 24, 20, 16, 12, 5, 0, 0].map((m, i) => [i, m])),
    closers: [],
    restB2B: [],
    caps: {},
    manual: true,
    ...over,
  });
  const mins = (pp: PlanPlayer[]) => Object.fromEntries(pp.map((p, i) => [p.pid, normalizeMinutes(pp)[i]]));

  it('treats hard caps as hard, handing the rest to teammates', () => {
    const pp = planInputs(src, rot({ caps: { 0: 20 } }));
    const m = mins(pp);
    expect(m[0]).toBeLessThanOrEqual(20);
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(240);
    const plan = buildMinutePlan(pp);
    expect(plan.filter((s) => s.includes(0)).length).toBeLessThanOrEqual(20);
  });

  it("keeps a starter's short minutes and gives a starter without minutes a starter's share", () => {
    const r = rot();
    r.minutes[4] = 10;
    expect(planInputs(src, r).find((p) => p.pid === 4)!.minutes).toBe(10);
    delete r.minutes[4];
    expect(planInputs(src, r).find((p) => p.pid === 4)!.minutes).toBe(24);
  });

  it("hands an injured starter's minutes to the bench first", () => {
    const pp = planInputs(
      src.map((p) => (p.pid === 1 ? { ...p, available: false } : p)),
      rot(),
    );
    expect(pp.map((p) => p.pid)).not.toContain(1);
    // the sixth man starts; the next bench players fill up to 22 before anyone else gets more
    expect(pp[4].pid).toBe(5);
    expect(pp.find((p) => p.pid === 7)!.minutes).toBe(22);
    expect(pp.find((p) => p.pid === 0)!.minutes).toBe(36);
  });

  it('shortens auto-managed playoff rotations to eight, with the top five playing more', () => {
    const regular = mins(planInputs(src, rot({ manual: false })));
    const playoffs = mins(planInputs(src, rot({ manual: false }), { playoffs: true }));
    expect(Object.values(playoffs).filter((m) => m > 0).length).toBe(8);
    expect(playoffs[0]).toBeGreaterThan(regular[0] + 2);
    expect(Math.max(...Object.values(playoffs))).toBeLessThanOrEqual(42);
    // a user's custom rotation is left alone
    expect(mins(planInputs(src, rot(), { playoffs: true }))).toEqual(mins(planInputs(src, rot())));
  });
});
