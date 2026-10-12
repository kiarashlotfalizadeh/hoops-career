import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';

describe('game engine', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
  it('produces internally consistent box scores', () => {
    const sim = new GameSim(side(0), side(1), { rng: new Rng(3), type: 'regular', record: true });
    const res = sim.simToEnd();
    expect(res.home.pts).not.toBe(res.away.pts);
    for (const tb of [res.home, res.away]) {
      expect(tb.players.reduce((a, p) => a + p.pts, 0)).toBe(tb.pts);
      expect(tb.t.fgm * 2 + tb.t.tpm + tb.t.ftm).toBe(tb.pts);
      expect(tb.t.fgm).toBeLessThanOrEqual(tb.t.fga);
      expect(Math.round(tb.players.reduce((a, p) => a + p.min, 0) * 10)).toBe(10 * 5 * (48 + 5 * res.ot));
      expect(tb.players.reduce((a, p) => a + p.pm, 0)).toBe((tb.pts - (tb === res.home ? res.away.pts : res.home.pts)) * 5);
    }
    expect(res.pbp!.length).toBeGreaterThan(200);
  });
  it('lands near NBA league averages', () => {
    const rng = new Rng(5);
    let pts = 0;
    let poss = 0;
    let tpa = 0;
    let fga = 0;
    const n = 120;
    for (let g = 0; g < n; g++) {
      const h = g % 30;
      const a = (h + 1 + (g % 29)) % 30;
      const res = new GameSim(side(h), side(a === h ? (h + 1) % 30 : a), { rng, type: 'regular' }).simToEnd();
      for (const tb of [res.home, res.away]) {
        pts += tb.pts;
        poss += tb.poss;
        tpa += tb.t.tpa;
        fga += tb.t.fga;
      }
    }
    const ortg = (pts / poss) * 100;
    expect(poss / (2 * n)).toBeGreaterThan(94);
    expect(poss / (2 * n)).toBeLessThan(106);
    expect(ortg).toBeGreaterThan(106);
    expect(ortg).toBeLessThan(122);
    expect(tpa / fga).toBeGreaterThan(0.33);
    expect(tpa / fga).toBeLessThan(0.5);
  });
  it('responds to tactics: packing the paint gives up more threes', () => {
    const base = league.teams[1];
    const packed = { ...base, tactics: { ...base.tactics, defense: { ...base.tactics.defense, help: 95, scheme: 'man' as const } } };
    const home = { ...base, tactics: { ...base.tactics, defense: { ...base.tactics.defense, help: 5, scheme: 'man' as const } } };
    let open = 0;
    let packedImp = 0;
    for (let g = 0; g < 40; g++) {
      const r1 = new GameSim(side(0), { team: home, players: teamPlayers(league, 1) }, { rng: new Rng(100 + g), type: 'regular' }).simToEnd();
      const r2 = new GameSim(side(0), { team: packed, players: teamPlayers(league, 1) }, { rng: new Rng(100 + g), type: 'regular' }).simToEnd();
      open += r1.home.t.tpa;
      packedImp += r2.home.t.tpa;
    }
    expect(packedImp).toBeGreaterThan(open);
  });
});
