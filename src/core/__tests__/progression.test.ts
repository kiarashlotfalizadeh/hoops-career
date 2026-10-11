// Player development: training focus trades skills without costing OVR, and the league anchor holds
// the overall talent spread, not just each attribute's.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { anchorRatings, develop } from '../league/progression';
import { RATING_KEYS, ovrRaw } from '../ratings';
import { Rng } from '../random';
import type { TrainingFocus } from '../types';

const seed = seedJson as unknown as SeedData;
const league = () => createLeague({ name: 'p', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: seed.players.length ? seed : null, rngSeed: 7 });

describe('training focus (L12)', () => {
  it('every focus is within 0.1 OVR a season of balanced training, and gains on its own skills', () => {
    const l = league();
    const ps = Object.values(l.players).filter((p) => p.tid >= 0);
    const ctx = { coachDev: 50, coachingBudget: 50, practice: 'normal' as const, mpg: 25 };
    const run = (focus: TrainingFocus) => {
      let ovr = 0;
      let tp = 0;
      for (const p of ps) {
        const c = structuredClone(p);
        c.training = focus;
        ovr += develop(c, l.season + 1, ctx, new Rng(1000 + p.pid), 0.8, l.ovrScale);
        tp += c.ratings.tp - p.ratings.tp;
      }
      return { ovr: ovr / ps.length, tp: tp / ps.length };
    };
    const balanced = run('balanced');
    for (const f of ['shooting', 'finishing', 'playmaking', 'perimeterD', 'interiorD', 'rebounding', 'conditioning'] as const) expect(Math.abs(run(f).ovr - balanced.ovr)).toBeLessThan(0.1);
    expect(run('shooting').tp).toBeGreaterThan(balanced.tp + 1);
  });
});

describe('age curve', () => {
  it('declines faster each year past 35, so stars fade out of their late 30s', () => {
    const l = league();
    const ctx = { coachDev: 50, coachingBudget: 50, practice: 'normal' as const, mpg: 25 };
    const ps = Object.values(l.players).filter((p) => p.tid >= 0);
    // the same players aged to 34, 37 and 40: average one-year OVR change at each age
    const at = (age: number) =>
      ps.reduce((sum, p) => {
        const c = structuredClone(p);
        c.bornYear = l.season - age;
        return sum + develop(c, l.season, ctx, new Rng(500 + p.pid), 1, l.ovrScale);
      }, 0) / ps.length;
    const [a34, a37, a40] = [at(34), at(37), at(40)];
    expect(a37).toBeLessThan(a34 - 0.8);
    expect(a40).toBeLessThan(a37 - 0.8);
  });
});

describe('league anchor (L9)', () => {
  it('pulls a widened OVR spread back toward the spread at league creation', () => {
    const l = league();
    const rostered = () => Object.values(l.players).filter((p) => p.tid >= 0);
    const spread = () => {
      const raws = rostered().map((p) => ovrRaw(p.ratings)).sort((a, b) => a - b);
      return raws[Math.round(0.85 * (raws.length - 1))] - raws[Math.round(0.15 * (raws.length - 1))];
    };
    const before = spread();
    // correlated development: good players got better at everything, weak ones worse
    const mean = rostered().reduce((a, p) => a + ovrRaw(p.ratings), 0) / rostered().length;
    for (const p of rostered()) {
      const lift = (ovrRaw(p.ratings) - mean) * 0.3;
      for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] += lift;
    }
    const widened = spread();
    expect(widened).toBeGreaterThan(before * 1.2);
    anchorRatings(l);
    expect(spread()).toBeLessThan(widened - (widened - before) * 0.4);
  });
});
