// Player development: training focus trades skills without costing OVR, and the league anchor holds
// the overall talent spread, not just each attribute's.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { anchorRatings, annualProgression, develop, ratingMeans, trajectory } from '../league/progression';
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
        // (below the stars, whose own fade from 33 is the next block's)
        const sel = ps.filter((p) => p.ovr < 87 && (strong ? p.ratings.ath > (means.ath ?? 0) + 10 : p.ratings.ath < (means.ath ?? 0) - 10));
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

    // stars fade harder from 33: the same ratings lose more as a 92 than as an 84, and a summer takes 90+ players at 34 down 2+ OVR on average, 1 at least
    {
      const means = ratingMeans(l);
      const stars = ps.filter((p) => p.ovr >= 90);
      expect(stars.length).toBeGreaterThan(3);
      const raw = (ovr: number, age: number) =>
        stars.reduce((sum, p) => {
          const c = structuredClone(p);
          c.bornYear = l.season - age;
          c.ovr = ovr;
          develop(c, l.season, { ...ctx, means }, new Rng(700 + p.pid), 0.8);
          return sum + ovrRaw(p.ratings) - ovrRaw(c.ratings);
        }, 0) / stars.length;
      expect(raw(92, 34)).toBeGreaterThan(raw(84, 34) + 0.5);
      // (not yet at 32)
      expect(Math.abs(raw(92, 32) - raw(84, 32))).toBeLessThan(0.05);
      const c = structuredClone(l);
      for (const p of stars) c.players[p.pid].bornYear = c.season - 34;
      annualProgression(c, new Rng(9));
      const drops = stars.map((p) => p.ovr - c.players[p.pid].ovr);
      expect(drops.reduce((a, d) => a + d, 0) / drops.length).toBeGreaterThanOrEqual(2);
      expect(Math.min(...drops)).toBeGreaterThanOrEqual(1);
    }

    // the shot holds longest while the volume goes: a summer at 35 takes much less off a shooter's three-point
    // rating than off his mid-range (half, before the league's anchor gives some back to both), and the veterans
    // get to the rim less and create less of their own (by 7% and 14% here)
    {
      const c = structuredClone(l);
      const vets = ps.filter((p) => p.tend?.create !== undefined && p.ratings.tp > 70);
      expect(vets.length).toBeGreaterThan(20);
      for (const p of vets) c.players[p.pid].bornYear = c.season - 35;
      annualProgression(c, new Rng(11));
      const mean = (f: (before: (typeof ps)[number], after: (typeof ps)[number]) => number) => vets.reduce((a, p) => a + f(p, c.players[p.pid]), 0) / vets.length;
      const tp = mean((p, q) => p.ratings.tp - q.ratings.tp);
      const mid = mean((p, q) => p.ratings.mid - q.ratings.mid);
      expect(tp).toBeLessThan(mid * 0.75);
      expect(mean((p, q) => q.tend!.drive / p.tend!.drive)).toBeLessThan(0.95);
      expect(mean((p, q) => q.tend!.create! / p.tend!.create!)).toBeLessThan(0.97);
    }

    // a season of threes past 18% of his team's shots on the floor brings a shooter's three-point
    // tendency down for the next ((0.18 / share)^1.5: 0.61 at a quarter of them); one under it keeps his
    {
      const c = structuredClone(l);
      const shooters = ps.filter((p) => p.tend && p.ratings.tp > 60 && (p.stats.find((s) => s.season === c.season - 1 && !s.playoffs)?.teamFga ?? 0) >= 2000).slice(0, 40);
      expect(shooters.length).toBe(40);
      const heavy = shooters.filter((_, i) => i % 2 === 0);
      for (const p of heavy) for (const s of c.players[p.pid].stats) if (s.season === c.season - 1 && !s.playoffs) s.tpa = Math.round(0.25 * s.teamFga);
      const light = shooters.filter((p, i) => i % 2 === 1 && p.stats.filter((s) => s.season === c.season - 1 && !s.playoffs).every((s) => s.tpa < 0.17 * s.teamFga));
      annualProgression(c, new Rng(12));
      const ratio = (xs: typeof ps) => xs.reduce((a, p) => a + c.players[p.pid].tend!.three / p.tend!.three, 0) / xs.length;
      expect(ratio(heavy)).toBeLessThan(0.75);
      expect(ratio(heavy)).toBeLessThan(0.75 * ratio(light));
    }

    // ...and a season using more than 35% of his team's possessions on the floor brings his usage
    // tendency down for the next ((0.35 / share)^3: 0.66 at 40%)
    {
      const c = structuredClone(l);
      const stars = ps.filter((p) => p.tend && (p.stats.find((s) => s.season === c.season - 1 && !s.playoffs)?.teamFga ?? 0) >= 2000).slice(0, 20);
      for (const p of stars)
        for (const s of c.players[p.pid].stats)
          if (s.season === c.season - 1 && !s.playoffs) Object.assign(s, { fga: Math.round(0.4 * (s.teamFga + 0.44 * s.teamFta + s.teamTov)), fta: 0, tov: 0 });
      annualProgression(c, new Rng(13));
      const ratio = stars.reduce((a, p) => a + c.players[p.pid].tend!.use / p.tend!.use, 0) / stars.length;
      expect(ratio).toBeLessThan(0.8);
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
      // (toward the spread the display scale was built on at creation, before preseason cuts: what it holds the league to)
      const q = (f: number) => a.ovrScale.raw[OVR_ANCHORS.findIndex(([x]) => x === f)];
      expect(spread()).toBeLessThan(widened - (widened - (q(0.85) - q(0.15))) * 0.4);
    }

    // fictional leagues are spread like the real league (REAL_RAW_QUANTILES), so development and aging move OVR
    // about as much there (with OVR weighted on feel and defense, the value calibration had spread the real league
    // half as wide again, and fictional leagues were held to 0.6-0.8 of it; weighted on impact, production and role
    // as fans read it, the calibration hardly widens it)
    {
      const fict = createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
      // raw OVR from the 15th to the 85th percentile
      const at = (q: number) => OVR_ANCHORS.findIndex(([x]) => x === q);
      const span = (x: League) => x.ovrScale.raw[at(0.85)] - x.ovrScale.raw[at(0.15)];
      expect(span(fict) / span(l)).toBeGreaterThan(0.85);
      expect(span(fict) / span(l)).toBeLessThan(1.1);
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
