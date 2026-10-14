// The live game's quick pills: as deep as the coaching depth, each one a real change, a pressed one
// going back to the game plan, a Hack-a only when the engine would send that shooter to the line.
import { describe, expect, it } from 'vitest';
import { defaultTactics, cloneTactics } from '../../core/sim/tactics';
import type { Tactics } from '../../core/types';
import { hackThreshold, livePills, type PillContext } from '../live/pills';

const ctx = (over: Partial<PillContext> = {}): PillContext => ({
  complexity: 'expert',
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
  it('follow the coaching depth', () => {
    const t = defaultTactics();
    const simple = ids(t, ctx({ complexity: 'simple' }));
    expect(simple).toEqual(['push', 'slow', 'zone', 'pack', 'home', 'hot']);
    const adv = ids(t, ctx({ complexity: 'advanced' }));
    expect(adv).toEqual([...simple, 'press', 'crash', 'getback', 'deny', 'double']);
    const expert = ids(t, ctx({ q: 4 }));
    expect(expert).toEqual([...adv, 'hack', 'trailing', 'up3']);
    // the fouling rules are fourth-quarter business
    expect(ids(t, ctx({ q: 2 }))).not.toContain('trailing');
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

  it('offer a reset only once the tactics differ from the game plan, and the reset gets them back', () => {
    const plan = defaultTactics();
    expect(ids(plan, ctx())).not.toContain('reset');
    const t = press(press(plan, plan, ctx(), 'push'), plan, ctx(), 'pack');
    t.defense.matchups = { 7: 3 };
    const back = press(t, plan, ctx(), 'reset');
    expect(back).toEqual(plan);
  });
});
