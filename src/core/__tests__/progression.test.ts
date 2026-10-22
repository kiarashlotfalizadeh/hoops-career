// Player development: training focus trades skills without costing OVR, and the league anchor holds
// the overall talent spread, not just each attribute's.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { anchorRatings, develop, ratingMeans, trajectory } from '../league/progression';
import { OVR_ANCHORS, RATING_KEYS, ovrRaw } from '../ratings';
import { Rng } from '../random';
import { standardRoster } from '../league/helpers';
import type { League, Pos, TrainingFocus } from '../types';

const seed = seedJson as unknown as SeedData;
const league = () => createLeague({ name: 'p', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: seed.players.length ? seed : null, rngSeed: 7 });

describe('player development', () => {
  it('trains, ages, follows a hidden arc and is anchored to the league, in real and fictional leagues alike', () => {
    const l = league();
    const ctx = { coachDev: 50, coachingBudget: 50, practice: 'normal' as const, mpg: 25 };
    const ps = Object.values(l.players).filter((p) => p.tid >= 0);

    // training focus (L12): every focus is within 0.1 OVR a season of balanced training, and gains on its own skills
    {
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
      for (const f of ['shooting', 'finishing', 'playmaking', 'perimeterD', 'interiorD', 'rebounding', 'conditioning'] as const)
        expect(Math.abs(run(f).ovr - balanced.ovr)).toBeLessThan(0.1);
      expect(run('shooting').tp).toBeGreaterThan(balanced.tp + 1);
    }

    // the age curve declines faster each year past 35, so stars fade out of their late 30s
    {
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
    }

    // aging stars: a strong attribute fades faster past the peak than a weak one, with the league means given
    {
      const means = ratingMeans(l);
      // the same players at 33, the summer's draws the same: athleticism lost against how much he had
      const lost = (withMeans: boolean, strong: boolean) => {
        const sel = ps.filter((p) => (strong ? p.ratings.ath > (means.ath ?? 0) + 10 : p.ratings.ath < (means.ath ?? 0) - 10));
        return (
          sel.reduce((sum, p) => {
            const c = structuredClone(p);
            c.bornYear = l.season - 33;
            develop(c, l.season, withMeans ? { ...ctx, means } : ctx, new Rng(300 + p.pid), 1);
            return sum + (p.ratings.ath - c.ratings.ath);
          }, 0) / sel.length
        );
      };
      expect(lost(true, true)).toBeGreaterThan(lost(false, true) + 0.2);
      expect(lost(true, false)).toBeLessThan(lost(true, true) - 0.4);
    }

    // the hidden development arc is the same every summer for a player in a league, differs between leagues, and moves a young player's course
    {
      const p = Object.values(l.players).find((x) => x.tid >= 0)!;
      expect(trajectory(l, p.pid)).toBe(trajectory(l, p.pid));
      expect(trajectory({ id: 'other' }, p.pid)).not.toBe(trajectory(l, p.pid));
      const arcs = Object.values(l.players).map((x) => trajectory(l, x.pid));
      const m = arcs.reduce((a, b) => a + b, 0) / arcs.length;
      expect(Math.abs(m)).toBeLessThan(0.1);
      // three summers at 20-22 with a good arc against a poor one, everything else the same
      const gain = (arc: number) =>
        ps.reduce((sum, x) => {
          const c = structuredClone(x);
          let d = 0;
          for (let k = 0; k < 3; k++) {
            c.bornYear = l.season - 20 - k;
            d += develop(c, l.season, { ...ctx, trajectory: arc }, new Rng(700 + x.pid + k), 1, l.ovrScale);
          }
          return sum + d;
        }, 0) / ps.length;
      expect(gain(1) - gain(-1)).toBeGreaterThan(3);
    }

    // the league anchor (L9) pulls a widened OVR spread back toward the spread at league creation
    {
      const a = structuredClone(l);
      const rostered = () => Object.values(a.players).filter((p) => p.tid >= 0);
      const spread = () => {
        const raws = rostered()
          .map((p) => ovrRaw(p.ratings))
          .sort((x, y) => x - y);
        return raws[Math.round(0.85 * (raws.length - 1))] - raws[Math.round(0.15 * (raws.length - 1))];
      };
      const before = spread();
      // correlated development: good players got better at everything, weak ones worse
      const mean = rostered().reduce((x, p) => x + ovrRaw(p.ratings), 0) / rostered().length;
      for (const p of rostered()) {
        const lift = (ovrRaw(p.ratings) - mean) * 0.3;
        for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] += lift;
      }
      const widened = spread();
      expect(widened).toBeGreaterThan(before * 1.2);
      anchorRatings(a);
      expect(spread()).toBeLessThan(widened - (widened - before) * 0.4);
    }

    // fictional leagues are spread like the real league was before its calibration to the projection's value
    // (REAL_RAW_QUANTILES), so development and aging move OVR about as much there: the value calibration spread
    // the real league's raw OVR about half as wide again, most of it by rating its deep bench below average
    {
      const fict = createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
      // raw OVR from the 15th to the 85th percentile
      const at = (q: number) => OVR_ANCHORS.findIndex(([x]) => x === q);
      const span = (x: League) => x.ovrScale.raw[at(0.85)] - x.ovrScale.raw[at(0.15)];
      expect(span(fict) / span(l)).toBeGreaterThan(0.6);
      expect(span(fict) / span(l)).toBeLessThan(0.8);
      // a season at 21 and at 35, the same players in each league
      const year = (x: League, age: number) => {
        const rostered = Object.values(x.players).filter((p) => p.tid >= 0);
        return (
          rostered.reduce((sum, p) => {
            const c = structuredClone(p);
            c.bornYear = x.season - age;
            return sum + develop(c, x.season, ctx, new Rng(900 + p.pid), 1, x.ovrScale);
          }, 0) / rostered.length
        );
      };
      expect(year(fict, 21)).toBeGreaterThan(year(l, 21) * 0.75);
      expect(year(fict, 35)).toBeLessThan(year(l, 35) * 0.75);
      // players specialise rather than all flattening toward average
      const fps = Object.values(fict.players).filter((p) => p.tid >= 0);
      const m = fps.reduce((a, p) => a + p.ratings.tp, 0) / fps.length;
      expect(Math.sqrt(fps.reduce((a, p) => a + (p.ratings.tp - m) ** 2, 0) / fps.length)).toBeGreaterThan(12);
    }

    // fictional leagues start with real rosters' guards and bigs on every team, and their age mix
    for (const rngSeed of [1, 2, 3]) {
      const f = createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
      const rosters = f.teams.map((t) => standardRoster(f, t.tid).sort((a, b) => b.ovr - a.ovr));
      // drawn independently, a quarter of the teams had one or two bigs, some nine to twelve guards, and a
      // fifth no 6'10" player in their top eight
      for (const roster of rosters) {
        const n = (pos: Pos[]) => roster.filter((p) => pos.includes(p.pos)).length;
        expect(n(['PF', 'C'])).toBeGreaterThanOrEqual(3);
        expect(n(['PG', 'SG'])).toBeLessThanOrEqual(9);
        expect(roster.some((p) => p.heightIn >= 82)).toBe(true);
      }
      expect(rosters.filter((roster) => roster.slice(0, 10).some((p) => p.heightIn >= 82)).length).toBeGreaterThanOrEqual(27);
      // and the real rosters' age mix (28% are 23 or younger): when half were, the anchor held everyone's
      // development back as the league grew older, and players peaked at 24-25
      const ages = Object.values(f.players).flatMap((p) => (p.tid >= 0 ? [f.season - p.bornYear] : []));
      expect(ages.filter((a) => a <= 23).length / ages.length).toBeLessThan(0.36);
      expect(ages.reduce((a, b) => a + b, 0) / ages.length).toBeGreaterThan(25.8);
    }
  });
});
