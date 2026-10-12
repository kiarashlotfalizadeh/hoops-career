// Hidden tendencies of generated players: drawn the way the seed's calibrated ones relate to level
// and size, and following each player's level as he develops, so long careers keep the real
// league's shape (stars carry the offense, the shot diet holds) as real players retire.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { followTendencies, genTendencies } from '../playerGen';
import { Rng } from '../random';
import { DRAFT_PROSPECT, type Player } from '../types';

const seed = seedJson as unknown as SeedData;
const KEYS = ['use', 'three', 'drive', 'pass', 'blk', 'stl', 'orb', 'drb', 'tov', 'pf', 'mid', 'corner', 'create'] as const;
const gmean = (xs: number[]) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const fictional = () => createLeague({ name: 'f', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });

describe('generated tendencies', () => {
  it('let generated stars carry the offense without scoring like nobody ever has', () => {
    const l = fictional();
    const ps = Object.values(l.players).filter((p) => p.tid >= 0);
    for (const p of ps) for (const k of KEYS) expect(p.tend?.[k]).toBeGreaterThan(0);
    const use = (lo: number, hi: number) => gmean(ps.filter((p) => p.ovr >= lo && p.ovr < hi).map((p) => p.tend!.use));
    // stars lean on their own shot more than role players do, but their ratings already make them
    // the first option: drawn like the seed's calibrated ones (86+ at 2.8x the 66-74s, styles up to
    // 25) they averaged 50-60 a game
    expect(use(86, 100) / use(66, 74)).toBeGreaterThan(1.15);
    expect(use(86, 100) / use(66, 74)).toBeLessThan(2);
    expect(Math.max(...ps.map((p) => p.tend!.use))).toBeLessThan(8);
    // the first weeks of a season: nobody near 50 a game, no 60-point nights
    expect(startRegularSeason(l)).toEqual([]);
    for (let d = 0; d < 20; d++) simDay(l);
    const lines = l.games.flatMap((g) => [...g.home.players, ...g.away.players]).filter((b) => b.min > 0);
    const games = new Map<number, number[]>();
    for (const b of lines) games.set(b.pid, [...(games.get(b.pid) ?? []), b.pts]);
    const best = Math.max(...[...games.values()].filter((g) => g.length >= 5).map((g) => g.reduce((a, x) => a + x, 0) / g.length));
    expect(best).toBeLessThan(45);
    expect(lines.filter((b) => b.pts >= 50).length).toBeLessThan(10);
    expect(lines.filter((b) => b.pts >= 60)).toEqual([]);
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
    // a role player turned star takes more of the shots and fewer spot-up threes; his style relative to others stays
    expect(a.tend!.use).toBeGreaterThan(before.use * 1.15);
    expect(a.tend!.three).toBeLessThan(before.three);
    expect(a.tend!.use / b.tend!.use).toBeCloseTo(ratio, 1);
    // a player from a save made before tendencies were generated gets a full set
    delete b.tend;
    followTendencies(b, b.ovr, new Rng(2));
    for (const k of KEYS) expect(b.tend?.[k]).toBeGreaterThan(0);
  });
});
