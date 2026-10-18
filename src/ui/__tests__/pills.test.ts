// The live game's quick changes: a short curated row, each one a real change, a pressed one going
// back to the game plan, a Hack-a only when the engine would send that shooter to the line.
import { describe, expect, it } from 'vitest';
import { defaultTactics, cloneTactics } from '../../core/sim/tactics';
import type { Tactics } from '../../core/types';
import { hackThreshold, livePills, offPlan, resetToPlan, type PillContext } from '../live/pills';

const ctx = (over: Partial<PillContext> = {}): PillContext => ({
  q: 2,
  clock: 400,
  oppOn: [
    { pid: 1, name: 'Shooter', ftPct: 0.88 },
    { pid: 2, name: 'Brick', ftPct: 0.52 },
  ],
  oppThreat: { pid: 1, name: 'Shooter' },
  ...over,
});

const ids = (t: Tactics, c: PillContext) => livePills(t, t, c).map((p) => p.id);
const press = (t: Tactics, plan: Tactics, c: PillContext, id: string) => {
  const p = livePills(t, plan, c).find((x) => x.id === id)!;
  const out = cloneTactics(t);
  p.apply(out);
  return out;
};

describe('live pills', () => {
  it("count a game plan's Hack-a targets: shown on, and pressed off stops them (and the quarter they wait for) too", () => {
    const t = defaultTactics();
    t.manage.hackTargets = [2];
    t.manage.hackFromQ = 3;
    expect(livePills(t, t, ctx()).find((p) => p.id === 'hack')!.on).toBe(true);
    const off = press(t, t, ctx(), 'hack');
    expect(off.manage.hackTargets).toBeUndefined();
    expect(off.manage.hackFromQ).toBeUndefined();
    expect(off.manage.hackThreshold).toBe(0);
    // a plan hacking someone who isn't on the floor: Stop Hack-a-player is offered
    const away = defaultTactics();
    away.manage.hackTargets = [99];
    const stop = livePills(away, away, ctx({ oppOn: [{ pid: 1, name: 'Shooter', ftPct: 0.88 }] })).find((p) => p.id === 'hack')!;
    expect(stop.label).toBe('Stop Hack-a-player');
    // hacking from now on starts a plan's later quarter now
    const later = defaultTactics();
    later.manage.hackFromQ = 4;
    const on = press(later, later, ctx({ q: 2 }), 'hack');
    expect(on.manage.hackThreshold).toBe(hackThreshold(0.52));
    expect(on.manage.hackFromQ).toBe(2);
  });

  it('offer a short curated row, slowing it down instead of pushing only to protect a lead in the fourth', () => {
    const t = defaultTactics();
    expect(ids(t, ctx({ q: 4 }))).toEqual(['zone', 'push', 'pack', 'getback', 'deny', 'double', 'hack']);
    expect(ids(t, ctx({ q: 4, margin: 6 }))).toEqual(['zone', 'slow', 'pack', 'getback', 'deny', 'double', 'hack']);
    // a lead earlier on: still push
    expect(ids(t, ctx({ q: 2, margin: 6 }))).toContain('push');
    // never more than seven
    expect(livePills(t, t, ctx({ q: 4 })).length).toBeLessThanOrEqual(7);
    // the one in effect stays on offer, pressed, whatever the score
    const fast = press(t, t, ctx(), 'push');
    expect(livePills(fast, t, ctx({ q: 4, margin: 6 })).find((p) => p.id === 'push')!.on).toBe(true);
    const slow = press(t, t, ctx({ q: 4, margin: 6 }), 'slow');
    expect(slow.offense.pace).toBe(20);
    expect(livePills(slow, t, ctx({ q: 1, margin: -4 })).find((p) => p.id === 'slow')!.on).toBe(true);
  });

  it('change something, and pressed go back to the game plan', () => {
    const plan = defaultTactics();
    plan.offense.pace = 45;
    const fast = press(plan, plan, ctx(), 'push');
    expect(fast.offense.pace).toBe(80);
    expect(livePills(fast, plan, ctx()).find((p) => p.id === 'push')!.on).toBe(true);
    expect(press(fast, plan, ctx(), 'push').offense.pace).toBe(45);
    const zone = press(plan, plan, ctx(), 'zone');
    expect(zone.defense.scheme).toBe('zone23');
    expect(press(zone, plan, ctx(), 'man').defense.scheme).toBe('man');
    const denied = press(plan, plan, ctx(), 'deny');
    expect([denied.defense.starPlan, denied.defense.starTarget]).toEqual(['deny', 1]);
    expect(press(denied, plan, ctx(), 'deny').defense.starPlan).toBe('none');
  });

  it('offer a Hack-a on their worst free-throw shooter, only while it is legal, at a threshold that targets him', () => {
    const t = defaultTactics();
    const pill = livePills(t, t, ctx()).find((p) => p.id === 'hack')!;
    expect(pill.label).toBe('Hack-a-Brick');
    const after = press(t, t, ctx(), 'hack');
    expect(after.manage.hackThreshold).toBe(hackThreshold(0.52));
    // the engine fouls a player whose FT% × 100 is under the threshold
    expect(0.52 * 100 < after.manage.hackThreshold).toBe(true);
    expect(0.88 * 100 < after.manage.hackThreshold).toBe(false);
    expect(livePills(after, t, ctx()).find((p) => p.id === 'hack')!.on).toBe(true);
    // the last two minutes of a period: no hack (the engine wouldn't foul)
    expect(ids(t, ctx({ clock: 100 }))).not.toContain('hack');
    // nobody bad enough from the line
    expect(ids(t, ctx({ oppOn: [{ pid: 1, name: 'Shooter', ftPct: 0.88 }] }))).not.toContain('hack');
  });

  it('know when the tactics are off the game plan, and the reset gets them back', () => {
    const plan = defaultTactics();
    expect(offPlan(plan, plan)).toBe(false);
    const t = press(press(plan, plan, ctx(), 'push'), plan, ctx(), 'pack');
    t.defense.matchups = { 7: 3 };
    expect(offPlan(t, plan)).toBe(true);
    const back = cloneTactics(t);
    resetToPlan(back, plan);
    expect(back).toEqual(plan);
  });
});
