import { describe, expect, it } from 'vitest';
import { buildMinutePlan, normalizeMinutes, type PlanPlayer } from '../sim/rotationPlan';

const players: PlanPlayer[] = [36, 34, 33, 31, 29, 24, 20, 16, 12, 5].map((m, i) => ({ pid: i, minutes: m, starter: i < 5, closer: i < 5, guard: i % 2 === 0, big: i === 4 || i === 9, endurance: 60 }));

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
