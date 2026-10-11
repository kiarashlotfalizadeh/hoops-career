import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { buildSimInput, ensureRotation } from '../league/games';
import { pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../ai/lab';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';

const seed = seedJson as unknown as SeedData;

describe('lab pairing', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  for (const t of league.teams) ensureRotation(league, t.tid);
  const corr = (x: number[], y: number[]) => {
    const mx = x.reduce((a, b) => a + b, 0) / x.length;
    const my = y.reduce((a, b) => a + b, 0) / y.length;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    return sxy / Math.sqrt(sxx * syy);
  };

  it('pairs games possession by possession: a small change keeps margins correlated', () => {
    const a = buildSimInput(league, 0, 1, 'regular', 1);
    const b = buildSimInput(league, 1, 1, 'regular', 0);
    const base = runLab({ a, b, games: 60, seed: 7 });
    const noop = runLab({ a, b, games: 60, seed: 7, patch: { manage: { hackThreshold: 5 } } });
    expect(noop.margins).toEqual(base.margins);
    const help = runLab({ a, b, games: 60, seed: 7, patch: { defense: { help: Math.min(100, a.team.tactics.defense.help + 10) } } });
    expect(corr(base.margins, help.margins)).toBeGreaterThan(0.5);
  });
});

describe.skipIf(seed.players.length === 0)('tactic balance and "why" tags (real league)', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 7 });
  for (const t of league.teams) ensureRotation(league, t.tid);
  const pairs = [
    [5, 9],
    [13, 22],
  ];
  const games = 150;
  // the AI coaches' in-game adjustments would react to the change being measured
  const side = (tid: number, opp: number) => ({ ...buildSimInput(league, tid, 1, 'regular', opp), adjust: false });
  const base = pairs.map(([a, b]) => runLab({ a: side(a, b), b: side(b, a), games, seed: 4242 + a }));
  const tags = (r: LabSummary, prefixes: string[]) => Object.entries(r.impacts).reduce((s, [k, v]) => s + (prefixes.some((p) => k.startsWith(p)) ? v : 0), 0);
  /** Measured change (points per game, paired) and the change in the matching tags. */
  const measure = (patch: TacticsPatch, prefixes: string[]) => {
    const rs = pairs.map(([a, b]) => runLab({ a: side(a, b), b: side(b, a), games, seed: 4242 + a, patch }));
    const d = rs.map((r, i) => pairedDelta(base[i], r));
    const perGame = (x: number, i: number) => (x * (rs[i].pace + base[i].pace)) / 200;
    return {
      delta: d.reduce((s, x, i) => s + perGame(x.delta, i), 0) / d.length,
      se: Math.sqrt(d.reduce((s, x, i) => s + perGame(x.se, i) ** 2, 0)) / d.length,
      tags: rs.reduce((s, r, i) => s + tags(r, prefixes) - tags(base[i], prefixes), 0) / rs.length,
    };
  };

  it('tags each tactic about as much as it is worth', () => {
    const cases: [TacticsPatch, string[]][] = [
      [{ defense: { pressure: 0 } }, ['pressure_']],
      [{ offense: { crashBoards: 0 } }, ['crash_']],
      [{ offense: { transition: 0 } }, ['transition']],
      [{ defense: { pnr: 'switch', switchOffBall: true } }, ['drop_', 'switch_', 'hedge_', 'ice_', 'blitz_']],
      [{ defense: { physicality: 100 } }, ['physicality', 'clean_defense']],
    ];
    for (const [patch, prefixes] of cases) {
      const m = measure(patch, prefixes);
      // within the measurement's noise, or within half of it; and the right sign when it's clear
      expect(Math.abs(m.tags - m.delta)).toBeLessThan(2 * m.se + 0.5 * Math.abs(m.delta));
      if (Math.abs(m.delta) > 2 * m.se) expect(Math.sign(m.tags)).toBe(Math.sign(m.delta));
    }
  });

  it('has no dominant extreme: pressing, crashing, blitzing and pressing full court all cost something', () => {
    for (const patch of [
      { defense: { pressure: 100 } },
      { offense: { crashBoards: 100 } },
      { defense: { pnr: 'blitz' as const, switchOffBall: false } },
      { defense: { press: 'always' as const } },
    ]) {
      expect(measure(patch, []).delta).toBeLessThan(2.5);
    }
  });

  it('plays NBA-like game-to-game variance: shared conditions and score effects', () => {
    const margins: number[] = [];
    const hs: number[] = [];
    const as: number[] = [];
    for (let g = 0; g < 240; g++) {
      const res = new GameSim(side(13, 22), side(22, 13), { rng: new Rng(500 + g), type: 'regular', injuries: false }).simToEnd();
      margins.push(res.home.pts - res.away.pts);
      hs.push(res.home.pts);
      as.push(res.away.pts);
    }
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    const sd = (x: number[]) => Math.sqrt(x.reduce((a, b) => a + (b - mean(x)) ** 2, 0) / (x.length - 1));
    const corr = hs.reduce((a, h, i) => a + (h - mean(hs)) * (as[i] - mean(as)), 0) / (hs.length - 1) / sd(hs) / sd(as);
    expect(sd(margins)).toBeLessThan(15.5);
    expect(corr).toBeGreaterThan(0.15);
  });
});
