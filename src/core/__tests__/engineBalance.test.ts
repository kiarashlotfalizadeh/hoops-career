import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { buildSimInput, ensureRotation } from '../league/games';
import { teamPlayers } from '../league/helpers';
import { pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../ai/lab';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';

const seed = seedJson as unknown as SeedData;

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
  /**
   * Seed sets the games are played over: one game's noise is as big as some effects, so a measure averages several
   * (ten: over five, a seed rebuild flipped the off-ball switching case, +0.06 measured against +0.45 over ten).
   */
  const SEEDS = Array.from({ length: 10 }, (_, i) => i * 1000);
  const baseOf = new Map<number, LabSummary[]>();
  const base = (off: number) => {
    let b = baseOf.get(off);
    if (!b) baseOf.set(off, (b = pairs.map(([a, bb]) => runLab({ a: side(a, bb), b: side(bb, a), games, seed: 4242 + a + off }))));
    return b;
  };
  const tags = (r: LabSummary, prefixes: string[]) => Object.entries(r.impacts).reduce((s, [k, v]) => s + (prefixes.some((p) => k.startsWith(p)) ? v.us - v.them : 0), 0);
  /** Measured change (points per game, paired) and the change in the matching tags, over the seed sets `seeds`. */
  const measure = (patch: TacticsPatch, prefixes: string[], seeds = [0]) => {
    const rows = seeds.flatMap((off) =>
      pairs.map(([a, b], i) => {
        const was = base(off)[i];
        const r = runLab({ a: side(a, b), b: side(b, a), games, seed: 4242 + a + off, patch });
        const d = pairedDelta(was, r);
        const perGame = (x: number) => (x * (r.pace + was.pace)) / 200;
        return { delta: perGame(d.delta), se: perGame(d.se), tags: tags(r, prefixes) - tags(was, prefixes) };
      }),
    );
    return {
      delta: rows.reduce((s, x) => s + x.delta, 0) / rows.length,
      se: Math.sqrt(rows.reduce((s, x) => s + x.se ** 2, 0)) / rows.length,
      tags: rows.reduce((s, x) => s + x.tags, 0) / rows.length,
    };
  };

  it('tags each tactic about as much as it is worth', () => {
    const cases: [TacticsPatch, string[]][] = [
      [{ defense: { pressure: 0 } }, ['pressure_']],
      [{ offense: { crashBoards: 0 } }, ['crash_']],
      [{ offense: { transition: 0 } }, ['transition']],
      [{ defense: { pnr: 'switch', switchOffBall: true } }, ['drop_', 'switch_', 'hedge_', 'ice_', 'blitz_']],
      // switching off the ball: handoffs denied, mismatches (and boards) handed out; AI defenses switch, so
      // the change measured is not switching
      [{ defense: { switchOffBall: false } }, ['drop_', 'switch_', 'hedge_', 'ice_', 'blitz_']],
      [{ defense: { physicality: 100 } }, ['physicality', 'clean_defense']],
    ];
    for (const [patch, prefixes] of cases) {
      const m = measure(patch, prefixes, SEEDS);
      // within the measurement's noise, or within half of it; and the right sign when it's clear
      expect(Math.abs(m.tags - m.delta)).toBeLessThan(2 * m.se + 0.5 * Math.abs(m.delta));
      if (Math.abs(m.delta) > 2 * m.se) expect(Math.sign(m.tags)).toBe(Math.sign(m.delta));
    }
  }, 600_000);

  it('has no dominant extreme, NBA-like game-to-game variance, and teams as far apart as their real plus-minus says', () => {
    // has no dominant extreme: pressing, crashing, blitzing, pressing full court and switching off the ball or not all cost something
    {
      for (const patch of [
        { defense: { pressure: 100 } },
        { offense: { crashBoards: 100 } },
        { defense: { pnr: 'blitz' as const, switchOffBall: false } },
        { defense: { press: 'always' as const } },
        // (AI defenses switch off the ball: not switching is the extreme left to try)
        { defense: { switchOffBall: false } },
      ]) {
        expect(measure(patch, []).delta).toBeLessThan(2.5);
      }
    }

    // plays NBA-like game-to-game variance: shared conditions and score effects
    {
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
    }

    // spreads teams as far apart as their players' real plus-minus says
    {
      // each team's projection: its players' real box plus-minus (three seasons) at their planned minutes
      const W: Record<number, number> = { 2026: 1, 2025: 0.6, 2024: 0.3 };
      const proj = league.teams.map((t) =>
        teamPlayers(league, t.tid).reduce((a, p) => {
          let v = 0;
          let m = 0;
          for (const s of p.stats)
            if (s.real && !s.playoffs && W[s.season] && s.adv) {
              v += s.adv.bpm * s.min * W[s.season];
              m += s.min * W[s.season];
            }
          return a + ((m >= 300 ? v / m : -2) * (t.rotation.minutes[p.pid] ?? 0)) / 48;
        }, 0),
      );
      const pts = league.teams.map(() => ({ diff: 0, poss: 0 }));
      let n = 0;
      for (let h = 0; h < 30; h++)
        for (let a = 0; a < 30; a++) {
          if (a === h) continue;
          const res = new GameSim(side(h, a), side(a, h), { rng: new Rng(++n), type: 'regular', injuries: false }).simToEnd();
          for (const [t, o] of [
            [res.home, res.away],
            [res.away, res.home],
          ]) {
            pts[t.tid].diff += t.pts - o.pts;
            pts[t.tid].poss += t.poss;
          }
        }
      const net = pts.map((x) => (x.diff / x.poss) * 100);
      const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
      const cov = (x: number[], y: number[]) => x.reduce((a, v, i) => a + (v - mean(x)) * (y[i] - mean(y)), 0) / (x.length - 1);
      const slope = cov(net, proj) / cov(proj, proj);
      expect(slope).toBeGreaterThan(0.65);
      expect(slope).toBeLessThan(1.35);
      expect(cov(net, proj) / Math.sqrt(cov(net, net) * cov(proj, proj))).toBeGreaterThan(0.75);
    }
  }, 180_000);
});
