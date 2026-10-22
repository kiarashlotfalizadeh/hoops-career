import { describe, expect, it } from 'vitest';
import { deriveRatings, popStats, type Agg } from '../derive';
import type { PbpAgg } from '../nba/profile';

describe("projected EPM in the derived ratings", () => {
  const base = (epm?: { off: number; def: number }): Agg => ({
    wMin: 2400,
    rawMin: 2400,
    games: 70,
    mpg: 30,
    per36: { fga: 15, fg3a: 6, fg3: 2.2, fg2a: 9, fg2: 4.8, fta: 4, ft: 3.2, orb: 1, drb: 5, ast: 4, stl: 1.1, blk: 0.6, tov: 2, pf: 2.5, pts: 18 },
    fg3Pct: 0.36,
    fg2Pct: 0.53,
    ftPct: 0.8,
    adv: { usg: 21, ast: 16, orb: 4, drb: 15, stl: 1.6, blk: 1.4, tov: 11, obpm: 0.5, dbpm: 0, bpm: 0.5, ts: 0.58, ws48: 0.1, vorp: 1 },
    lastAge: 26,
    pos: 'SF',
    epm: epm && { ...epm, tot: epm.off + epm.def },
  });
  // a population spread in projected EPM and box plus-minus alike
  const pop = popStats(
    Array.from({ length: 40 }, (_, i) => {
      const a = base({ off: (i % 9) - 4, def: (i % 5) - 2 });
      a.adv = { ...a.adv, obpm: ((i * 7) % 9) - 4, dbpm: ((i * 3) % 5) - 2 };
      return a;
    }),
  );
  const bio = { heightIn: 79, weightLb: 220, age: 26, pos: 'SF' };

  it('lifts the impact ratings of the player the projection rates higher, and falls back to box plus-minus without it', () => {
    const good = deriveRatings(base({ off: 3, def: 1.5 }), bio, pop, 'x').r;
    const poor = deriveRatings(base({ off: -3, def: -1.5 }), bio, pop, 'x').r;
    for (const k of ['oiq', 'diq', 'perD', 'intD'] as const) expect(good[k]).toBeGreaterThan(poor[k]);
    expect(good.oiq - poor.oiq).toBeGreaterThan(8);
    // skills EPM doesn't speak to stay as the box score says
    for (const k of ['tp', 'pas', 'hnd', 'stl', 'blk'] as const) expect(good[k]).toBe(poor[k]);
    // without a projection, box plus-minus carries the impact ratings again
    const none = deriveRatings(base(), bio, pop, 'x').r;
    const better = base();
    better.adv = { ...better.adv, obpm: 3, dbpm: 1.5 };
    const boxed = deriveRatings(better, bio, pop, 'x').r;
    expect(boxed.oiq).toBeGreaterThan(none.oiq + 5);
    expect(boxed.diq).toBeGreaterThan(none.diq + 2);
  });

  // a player with an NBA.com play-by-play profile, where projected EPM sits beside RAPM
  const zone = (rim: number, paint: number, mid: number, c3: number, ab3: number) => ({ rim, paint, mid, c3, ab3 });
  const pbp = (i = 0): PbpAgg => ({
    nbaId: 1,
    mins: 2400,
    fga: zone(300, 120, 90, 80, 250),
    fgm: zone(200, 52, 38, 30, 88),
    astFgm: 240,
    pullup: 100,
    pullup3: 40,
    drive: 150,
    cut: 40,
    putback: 20,
    post: 20,
    trans: 70,
    dunk: 30,
    lob: 10,
    fta: 220,
    sfDrawn: 120,
    ast: 200,
    astRim: 80,
    ast3: 70,
    tov: 100,
    tovBadPass: 40,
    tovLostBall: 30,
    orb: 60,
    drb: 260,
    orbChances: 1400,
    drbChances: 1500,
    stl: 60,
    blk: 40,
    blkRim: 25,
    pf: 150,
    chargesDrawn: 3,
    offPoss: 4800,
    defPoss: 4800,
    oppFga: 3800,
    oppRimA: 1100 + (i % 4) * 40,
    oppRimM: 700,
    teamFga: 3800,
    mdSaved: ((i * 3) % 5) - 2,
    mdPoss: 1500,
    rapmO: ((i * 7) % 9) / 3 - 1.3,
    rapmD: ((i * 2) % 5) / 3 - 0.7,
    rapmPoss: 9000,
  });
  const withPbp = (epm?: { off: number; def: number }, i = 0): Agg => ({ ...base(epm), pbp: pbp(i) });
  const pbpPop = popStats(Array.from({ length: 40 }, (_, i) => withPbp({ off: (i % 9) - 4, def: (i % 5) - 2 }, i)));

  it('puts projected EPM beside RAPM in all four impact ratings, and in nothing else', () => {
    const keys = ['oiq', 'diq', 'perD', 'intD'] as const;
    const good = deriveRatings(withPbp({ off: 3, def: 1.5 }), bio, pbpPop, 'x').r;
    const poor = deriveRatings(withPbp({ off: -3, def: -1.5 }), bio, pbpPop, 'x').r;
    for (const k of keys) expect(good[k]).toBeGreaterThan(poor[k]);
    for (const k of Object.keys(good) as (keyof typeof good)[]) if (!(keys as readonly string[]).includes(k)) expect(good[k]).toBe(poor[k]);
    // a thin sample's projection is regressed toward the mean with the rest of his line
    const thin = (epm: { off: number; def: number }) => deriveRatings({ ...withPbp(epm), wMin: 200, rawMin: 200 }, bio, pbpPop, 'x').r;
    expect(thin({ off: 3, def: 1.5 }).oiq - thin({ off: -3, def: -1.5 }).oiq).toBeLessThan(good.oiq - poor.oiq);
  });
});
