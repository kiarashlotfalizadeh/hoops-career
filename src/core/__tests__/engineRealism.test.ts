import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, engineDiag, resetEngineDiag } from '../sim/engine';
import { dpoyScore } from '../league/awards';
import { blankStats, generatePlayer, DEFAULT_SCALE } from '../playerGen';
import { Rng } from '../random';

describe('engine realism', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 21 });
  const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
  const blk = new Map<number, Map<number, number>>();
  let ast = 0;
  let teamGames = 0;
  resetEngineDiag();
  const rng = new Rng(9);
  for (let g = 0; g < 90; g++) {
    const h = g % 30;
    const a = (h + 7) % 30;
    const sim = new GameSim(side(h), side(a), { rng, type: 'regular' });
    const res = sim.simToEnd();
    for (const tb of [res.home, res.away]) {
      ast += tb.t.ast;
      teamGames++;
      const m = blk.get(tb.tid) ?? new Map<number, number>();
      for (const pl of tb.players) m.set(pl.pid, (m.get(pl.pid) ?? 0) + pl.blk);
      blk.set(tb.tid, m);
    }
  }

  it('credits assists at NBA rates: most threes assisted, about two thirds at the rim', () => {
    const share = (z: 'rim' | 'paint' | 'mid' | 'three') => engineDiag.ast[z] / engineDiag.made[z];
    expect(share('three')).toBeGreaterThan(0.72);
    expect(share('rim')).toBeGreaterThan(0.55);
    expect(share('rim')).toBeLessThan(0.78);
    expect(share('mid')).toBeGreaterThan(0.25);
    expect(ast / teamGames).toBeGreaterThan(23);
    expect(ast / teamGames).toBeLessThan(30);
  });

  it('spreads rim contests: no team gets nearly all its blocks from one anchor', () => {
    const shares = [...blk.values()].map((m) => {
      const vals = [...m.values()];
      const tot = vals.reduce((a, b) => a + b, 0);
      return tot ? Math.max(...vals) / tot : 0;
    });
    const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(avg).toBeLessThan(0.55);
    expect(Math.max(...shares)).toBeLessThan(0.8);
  });
});

describe('DPOY score', () => {
  const rng = new Rng(4);
  const mk = (pid: number, tid: number, o: { stl: number; blk: number; mpg: number; onPA?: number }) => {
    const p = generatePlayer(rng, { pid, season: 2027, tid, age: 27, talent: 0.8, scale: DEFAULT_SCALE });
    const s = blankStats(2027, tid, false);
    s.gp = 75;
    s.min = o.mpg * 75;
    s.stl = o.stl * 75;
    s.blk = o.blk * 75;
    s.drb = 6 * 75;
    s.onPoss = 2000;
    s.onPtsAgainst = (o.onPA ?? 110) * 20;
    return { p, s, gp: 75, mpg: o.mpg, gmsc: 12, winPct: 0.55, pmPerGame: 0 };
  };
  const ctx = { lgDRtg: 114, teamDRtg: new Map([[1, 108], [2, 118]]) };

  it('caps event stats and weighs team defense', () => {
    const anchor = mk(1, 1, { stl: 0.9, blk: 2.4, mpg: 32, onPA: 106 });
    const gambler = mk(2, 2, { stl: 3.2, blk: 3.2, mpg: 32, onPA: 120 });
    // same ratings for both, so only production and team context differ
    gambler.p.ratings = { ...anchor.p.ratings };
    expect(dpoyScore(anchor, ctx)).toBeGreaterThan(dpoyScore(gambler, ctx));
  });

  it('favors a starter over a backup with the same per-game events', () => {
    const starter = mk(3, 1, { stl: 1, blk: 2, mpg: 33 });
    const backup = mk(4, 1, { stl: 1, blk: 2, mpg: 20 });
    backup.p.ratings = { ...starter.p.ratings };
    expect(dpoyScore(starter, ctx)).toBeGreaterThan(dpoyScore(backup, ctx));
  });
});
