// Hidden tendencies of generated players: drawn the way the seed's calibrated ones relate to level
// and size, and following each player's level as he develops, so long careers keep the real
// league's shape (stars carry the offense, the shot diet holds) as real players retire; a calibrated
// player's role settles toward his level's as his teammates change.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { followTendencies, genTendencies } from '../playerGen';
import { Rng } from '../random';
import { DRAFT_PROSPECT, type Player, type Tendencies } from '../types';

const seed = seedJson as unknown as SeedData;
const KEYS = ['use', 'three', 'drive', 'pass', 'blk', 'stl', 'orb', 'drb', 'tov', 'pf', 'mid', 'corner', 'create'] as const;
const gmean = (xs: number[]) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const fictional = () => createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
/** How much of the offense runs through him: usage times self-creation. */
const role = (t: Tendencies) => t.use * (t.create ?? 1);

describe('generated tendencies', () => {
  it("draw generated players' tendencies like the seed's, follow a player's level, and leave real players' alone until their teammates change", () => {
    // let generated stars carry the offense without scoring like nobody ever has
    {
      const l = fictional();
      const ps = Object.values(l.players).filter((p) => p.tid >= 0);
      for (const p of ps) for (const k of KEYS) expect(p.tend?.[k]).toBeGreaterThan(0);
      const of = (f: (p: Player) => boolean) => gmean(ps.filter(f).map((p) => role(p.tend!)));
      // stars lean on their own shot more than role players do, and small guards more than bigs, but
      // their ratings already make them the first option and the ball handlers: drawn like the seed's
      // calibrated ones (86+ at 2.8x the 66-74s' usage, styles up to 25) they averaged 50-60 a game,
      // and with the fit's whole size term small guards had 6x the bigs' usage and self-creation
      const stars = of((p) => p.ovr >= 86) / of((p) => p.ovr >= 66 && p.ovr < 74);
      expect(stars).toBeGreaterThan(1.15);
      expect(stars).toBeLessThan(2);
      const guards = of((p) => p.ratings.hgt < 35) / of((p) => p.ratings.hgt >= 60);
      expect(guards).toBeGreaterThan(1.2);
      expect(guards).toBeLessThan(3);
      expect(Math.max(...ps.map((p) => p.tend!.use))).toBeLessThan(4);
      // the first weeks of a season (they had a 59-a-game scorer, 21 50-point games and 12 of 60; with
      // the fit's whole size term still a 46-a-game scorer and 8 50-point games)
      expect(startRegularSeason(l)).toEqual([]);
      for (let d = 0; d < 20; d++) simDay(l);
      const lines = l.games.flatMap((g) => [...g.home.players, ...g.away.players]).filter((b) => b.min > 0);
      const games = new Map<number, number[]>();
      for (const b of lines) games.set(b.pid, [...(games.get(b.pid) ?? []), b.pts]);
      const best = Math.max(...[...games.values()].filter((g) => g.length >= 5).map((g) => g.reduce((a, x) => a + x, 0) / g.length));
      expect(best).toBeLessThan(42);
      expect(lines.filter((b) => b.pts >= 50).length).toBeLessThan(5);
      expect(lines.filter((b) => b.pts >= 60).length).toBeLessThanOrEqual(1);
    }

    // leave real players' calibrated tendencies alone, and draw a draft class's without touching the league's random stream
    if (seed.players.length) {
      const l = createLeague({ name: 'r', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 7 });
      const byId = new Map(Object.values(l.players).map((p) => [p.bbrefId, p]));
      // (waived players a team still pays are its dead money, and not in the league unless they played)
      const inLeague = seed.players.filter((sp) => byId.has(sp.id));
      expect(inLeague.length).toBeGreaterThan(seed.players.length - 5);
      for (const sp of inLeague) expect(byId.get(sp.id)!.tend).toEqual(sp.tend);
      const prospects = Object.values(l.players).filter((p) => p.tid === DRAFT_PROSPECT);
      expect(prospects.length).toBeGreaterThan(50);
      for (const p of prospects) for (const k of KEYS) expect(p.tend?.[k]).toBeGreaterThan(0);
      const rng = new Rng(42);
      const state = rng.state;
      genTendencies(prospects[0], rng);
      expect(rng.state).toBe(state);
    }

    // follow a player's level and keep his own shot diet
    {
      const l = fictional();
      const [a, b] = Object.values(l.players).filter((p) => p.tid >= 0 && p.ovr <= 72);
      // the same 70 develops into an 86, or stays a 70
      const grow = (p: Player, ovr: number) => {
        const c = structuredClone(p);
        c.ovr = ovr;
        followTendencies(c, 70, new Rng(1));
        return c;
      };
      const [star, same] = [grow(a, 86), grow(a, 70)];
      // a role player turned star takes more of the shots, creates more of them and takes fewer spot-up threes
      expect(star.tend!.use).toBeGreaterThan(same.tend!.use * 1.05);
      expect(star.tend!.create).toBeGreaterThan(same.tend!.create!);
      expect(star.tend!.three).toBeLessThan(same.tend!.three * 0.8);
      // his shot diet relative to others stays
      expect(star.tend!.three / grow(b, 86).tend!.three).toBeCloseTo(a.tend!.three / b.tend!.three, 1);
      // a player from a save made before tendencies were generated gets a full set
      delete b.tend;
      followTendencies(b, b.ovr, new Rng(2));
      for (const k of KEYS) expect(b.tend?.[k]).toBeGreaterThan(0);
    }

    // settle a calibrated player's role toward his level's as his teammates change
    if (seed.players.length) {
      const l = createLeague({ name: 'r', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 7 });
      // the most ball-dominant fit for his level (Morant's is 37 times what generated players of his
      // level and size have; Dončić's and Reaves's, 15 times each, split the Lakers' shots)
      const p = Object.values(l.players)
        .filter((x) => x.tid >= 0 && x.bbrefId)
        .sort((x, y) => role(y.tend!) - role(x.tend!))[0];
      const level = gmean(Array.from({ length: 40 }, (_, i) => role(genTendencies({ ...p, pid: i }, new Rng(i)))));
      expect(role(p.tend!) / level).toBeGreaterThan(10);
      // kept whole, Dončić's took 49% of his team's possessions once Reaves and Sexton had left; after
      // six offseasons at the same level he plays like a player of that level, and keeps his shot diet
      const c = structuredClone(p);
      for (let i = 0; i < 6; i++) followTendencies(c, c.ovr, new Rng(i));
      expect(role(c.tend!) / level).toBeLessThan(2.5);
      expect(c.tend!.three).toBe(p.tend!.three);
    }
  });
});
