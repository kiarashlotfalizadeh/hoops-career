// Hidden tendencies of generated players: drawn the way the seed's calibrated ones relate to level
// and size, and following each player's level as he develops, so long careers keep the real
// league's shape (stars carry the offense, the shot diet holds) as real players retire.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { followTendencies, genTendencies } from '../playerGen';
import { Rng } from '../random';
import { DRAFT_PROSPECT, type Player } from '../types';

const seed = seedJson as unknown as SeedData;
const KEYS = ['use', 'three', 'drive', 'pass', 'blk', 'stl', 'orb', 'drb', 'tov', 'pf', 'mid', 'corner', 'create'] as const;
const gmean = (xs: number[]) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const fictional = () => createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });

describe('generated tendencies', () => {
  it('give generated stars the share of the offense real stars have', () => {
    const l = fictional();
    const ps = Object.values(l.players).filter((p) => p.tid >= 0);
    for (const p of ps) for (const k of KEYS) expect(p.tend?.[k]).toBeGreaterThan(0);
    const use = (lo: number, hi: number) => gmean(ps.filter((p) => p.ovr >= lo && p.ovr < hi).map((p) => p.tend!.use));
    // the seed's calibrated 86+ players carry about 2.5x the usage tendency of its 66-74s
    expect(use(86, 100) / use(66, 74)).toBeGreaterThan(1.8);
    expect(use(86, 100) / use(66, 74)).toBeLessThan(3.5);
  });

  it("leave real players' calibrated tendencies alone, and draw a draft class's without touching the league's random stream", () => {
    if (!seed.players.length) return;
    const l = createLeague({ name: 'r', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 7 });
    const byId = new Map(Object.values(l.players).map((p) => [p.bbrefId, p]));
    for (const sp of seed.players) expect(byId.get(sp.id)?.tend).toEqual(sp.tend);
    const prospects = Object.values(l.players).filter((p) => p.tid === DRAFT_PROSPECT);
    expect(prospects.length).toBeGreaterThan(50);
    for (const p of prospects) for (const k of KEYS) expect(p.tend?.[k]).toBeGreaterThan(0);
    const rng = new Rng(42);
    const state = rng.state;
    genTendencies(prospects[0], rng);
    expect(rng.state).toBe(state);
  });

  it("follow a player's level and keep his own style", () => {
    const l = fictional();
    const [a, b] = Object.values(l.players).filter((p) => p.tid >= 0 && p.ovr <= 72);
    // he develops from 70 to 86
    const grow = (p: Player) => {
      p.ovr = 86;
      followTendencies(p, 70, new Rng(1));
    };
    const before = { ...a.tend! };
    const ratio = a.tend!.use / b.tend!.use;
    grow(a);
    grow(b);
    // a role player turned star takes a star's shots and fewer spot-up threes; his style relative to others stays
    expect(a.tend!.use).toBeGreaterThan(before.use * 1.5);
    expect(a.tend!.three).toBeLessThan(before.three);
    expect(a.tend!.use / b.tend!.use).toBeCloseTo(ratio, 1);
    // a player from a save made before tendencies were generated gets a full set
    delete b.tend;
    followTendencies(b, b.ovr, new Rng(2));
    for (const k of KEYS) expect(b.tend?.[k]).toBeGreaterThan(0);
  });
});
