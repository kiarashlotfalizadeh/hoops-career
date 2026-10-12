import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { buildMinutePlan, normalizeMinutes, planInputs, planRoles, type PlanPlayer, type PlanSource } from '../sim/rotationPlan';
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
  it("opens the third quarter with the starters in every team's default rotation, minutes and closers intact", () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 5 });
    let starters = 0;
    let oneMinute = 0;
    for (const t of league.teams) {
      const pp = planInputs(
        teamPlayers(league, t.tid).map((p) => ({ pid: p.pid, available: !(p.injury && p.injury.gamesRemaining > 0), ...planRoles(p.ratings, p.pos), endurance: p.ratings.end })),
        t.rotation,
      );
      const plan = buildMinutePlan(pp);
      const norm = normalizeMinutes(pp);
      starters += plan[24].filter((pid) => pp.find((p) => p.pid === pid)!.starter).length;
      // nobody takes the floor for the tip only to leave a minute later
      for (const pid of plan[24]) expect(plan[25]).toContain(pid);
      pp.forEach((p, i) => expect(Math.abs(plan.filter((s) => s.includes(p.pid)).length - norm[i])).toBeLessThanOrEqual(1));
      for (const p of pp.filter((x) => x.closer)) for (const slot of plan.slice(44)) expect(slot).toContain(p.pid);
      // one-minute stints within a half stay rare
      for (const p of pp)
        for (let s = 0; s < 48; s++) if (plan[s].includes(p.pid) && (s % 24 === 0 || !plan[s - 1].includes(p.pid)) && (s % 24 === 23 || !plan[s + 1].includes(p.pid))) oneMinute++;
    }
    expect(starters / league.teams.length).toBeGreaterThanOrEqual(4);
    expect(oneMinute / league.teams.length).toBeLessThan(4);
  });
  it('never lists a player twice when one swap fixes both a missing guard and too many bigs', () => {
    // five bigs and no ball handler start: the guard swapped in must not be picked again as the "small"
    const bigs = players.map((p, i) => ({ ...p, guard: i >= 5, big: i < 5 }));
    for (const slot of buildMinutePlan(bigs)) expect(new Set(slot).size).toBe(5);
  });
  it('adds up to 240 when the rotation is capped out: the deep bench, then the caps, take the rest', () => {
    // five healthy players: 48 minutes each, past the usual 46 ceiling
    expect(normalizeMinutes(players.slice(0, 5))).toEqual([48, 48, 48, 48, 48]);
    // a six-man rotation with two capped players: the 16 minutes nobody in it can take go to the deep bench
    const six = players.map((p, i) => ({ ...p, minutes: i < 4 ? 40 : i < 6 ? 20 : 0, cap: i === 4 || i === 5 ? 20 : undefined }));
    const m = normalizeMinutes(six);
    expect(m.reduce((a, b) => a + b, 0)).toBe(240);
    expect(m.slice(0, 6)).toEqual([46, 46, 46, 46, 20, 20]);
    expect(m.slice(6).reduce((a, b) => a + b, 0)).toBe(16);
    // nobody with minutes: an even split among the first ten, in whole minutes
    expect(normalizeMinutes(players.slice(0, 7).map((p) => ({ ...p, minutes: 0 })))).toEqual([35, 35, 34, 34, 34, 34, 34]);
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

  it("hands an injured starter's minutes to his replacement, then the bench", () => {
    const pp = planInputs(
      src.map((p) => (p.pid === 1 ? { ...p, available: false } : p)),
      rot(),
    );
    expect(pp.map((p) => p.pid)).not.toContain(1);
    // the sixth man starts and takes the starter's 34; the next bench players fill up to 22 before anyone else gets more
    expect(pp[4].pid).toBe(5);
    expect(pp.find((p) => p.pid === 5)!.minutes).toBe(34);
    expect(pp.find((p) => p.pid === 7)!.minutes).toBe(22);
    expect(pp.find((p) => p.pid === 0)!.minutes).toBe(36);
  });

  it('gives promoted starters the missing starters minutes before the deep bench gets any', () => {
    const pp = planInputs(
      src.map((p) => (p.pid >= 1 && p.pid <= 3 ? { ...p, available: false } : p)),
      rot(),
    );
    const m = mins(pp);
    // reserves 5, 6 and 7 start in place of 1, 2 and 3 and play their 34, 33 and 31
    expect(pp.slice(0, 5).map((p) => p.pid)).toEqual([0, 4, 5, 6, 7]);
    for (const pid of [5, 6, 7]) expect(m[pid]).toBeGreaterThanOrEqual(30);
    for (const pid of [10, 11]) expect(m[pid]).toBeLessThan(Math.min(m[5], m[6], m[7]));
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(240);
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
