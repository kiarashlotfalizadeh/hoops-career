// The live game's tactical plumbing: a one-tap counter for every tactical edge an opponent can get
// (it always takes the edge away), and tactics diffs that "Keep changes" saves.
import { describe, expect, it } from 'vitest';
import { IMPACT_TEXT } from '../analysis/gameReport';
import { impactCounter } from '../ai/advisor';
import { applyPatch, cloneTactics, defaultTactics, emptyPatch, tacticsDiff } from '../sim/tactics';
import { Rng } from '../random';
import type { DefScheme, PnrCoverage, PressMode, StarPlan, Tactics } from '../types';

/** Tactics with every setting an impact's `uses` reads spread over its range. */
function randomTactics(rng: Rng): Tactics {
  const t = defaultTactics();
  t.defense.scheme = rng.pick<DefScheme>(['man', 'man', 'zone23', 'zone32']);
  t.defense.pnr = rng.pick<PnrCoverage>(['drop', 'switch', 'hedge', 'blitz', 'ice']);
  t.defense.help = rng.int(0, 100);
  t.defense.pressure = rng.int(0, 100);
  t.defense.press = rng.pick<PressMode>(['none', 'afterMade', 'always']);
  t.defense.getBack = rng.int(0, 100);
  t.defense.physicality = rng.int(0, 100);
  t.defense.switchOffBall = rng.chance(0.5);
  t.defense.starPlan = rng.pick<StarPlan>(['none', 'deny', 'double']);
  t.offense.crashBoards = rng.int(0, 100);
  t.offense.transition = rng.int(0, 100);
  t.manage.hackThreshold = rng.chance(0.5) ? 0 : rng.int(40, 65);
  return t;
}

describe('impact counters', () => {
  const keys = Object.keys(IMPACT_TEXT).filter((k) => IMPACT_TEXT[k].uses);

  it('exist for every edge your tactics give away, and take it away; none when they no longer do', () => {
    expect(keys.length).toBeGreaterThan(15);
    const rng = new Rng(2024);
    const used = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const t = randomTactics(rng);
      for (const key of keys) {
        const uses = IMPACT_TEXT[key].uses!;
        const c = impactCounter(key, t);
        if (!uses(t)) {
          expect(c, `${key} on tactics that don't use it`).toBeUndefined();
          continue;
        }
        used.add(key);
        expect(c, `${key} has no counter`).toBeDefined();
        const after = cloneTactics(t);
        c!.apply(after);
        expect(uses(after), `${key}: ${c!.label} leaves it in place`).toBe(false);
      }
    }
    // every key was in play at least once
    expect([...used].sort()).toEqual([...keys].sort());
  });

  it('have nothing for an edge without a tactical cause', () => {
    expect(impactCounter('mismatch_post:o', defaultTactics())).toBeUndefined();
    expect(impactCounter('nonsense', defaultTactics())).toBeUndefined();
  });
});

describe('tactics diffs', () => {
  it('give back the changed tactics when applied, except tonight’s matchups and star target', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const a = randomTactics(rng);
      a.offense.roles = { 5: 'creator' };
      const b = randomTactics(rng);
      b.offense.actions = { ...a.offense.actions, pnr: rng.int(0, 100), motion: rng.int(0, 100) };
      b.offense.roles = rng.chance(0.5) ? { 5: 'creator' } : { 5: 'shooter', 8: 'roller' };
      b.offense.freedom = rng.chance(0.5) ? {} : { 5: 1 };
      b.offense.screeners = rng.chance(0.5) ? [] : [8, 9];
      b.offense.pace = rng.int(0, 100);
      b.offense.hotHand = rng.chance(0.5);
      b.manage.foulTrouble = rng.pick(['loose', 'standard', 'strict'] as const);
      b.manage.fatigueSub = rng.pick([0.5, 0.55, 0.6]);
      b.defense.matchups = { 20: 5 };
      b.defense.starTarget = 21;
      const d = tacticsDiff(a, b);
      expect(d.defense && ('matchups' in d.defense || 'starTarget' in d.defense)).toBeFalsy();
      const back = applyPatch(a, d);
      expect({ ...back, defense: { ...back.defense, matchups: b.defense.matchups, starTarget: b.defense.starTarget } }).toEqual(b);
      expect([back.defense.matchups, back.defense.starTarget]).toEqual([a.defense.matchups, a.defense.starTarget]);
      // the patch owns nothing of b's
      expect(back.offense.roles).not.toBe(b.offense.roles);
    }
  });

  it('are empty between equal tactics, and carry only what changed', () => {
    const a = defaultTactics();
    expect(emptyPatch(tacticsDiff(a, cloneTactics(a)))).toBe(true);
    const b = cloneTactics(a);
    b.defense.pnr = 'hedge';
    b.offense.actions.iso = 90;
    b.defense.matchups = { 3: 4 };
    expect(tacticsDiff(a, b)).toEqual({ offense: { actions: { iso: 90 } }, defense: { pnr: 'hedge' } });
  });
});
