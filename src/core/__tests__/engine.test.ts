import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import { GAME } from '../constants';

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
  it('keeps the books straight with short benches, injuries, foul-outs, hacks and presses', () => {
    const rng = new Rng(77);
    for (let g = 0; g < 24; g++) {
      const make = (tid: number) => {
        const team = structuredClone(league.teams[tid]);
        const players = structuredClone(teamPlayers(league, tid));
        // six to nine healthy players, a physical defense, hacking and pressing now and then
        const healthy = new Set(rng.shuffle(team.rotation.order.slice()).slice(0, rng.int(6, 9)));
        for (const p of players) p.injury = healthy.has(p.pid) ? null : { type: 'Sprained ankle', gamesRemaining: 2, gamesTotal: 2, severity: 'minor' };
        team.tactics.defense.physicality = rng.int(50, 100);
        team.tactics.defense.press = rng.pick(['none', 'afterMade', 'always'] as const);
        team.tactics.manage.hackThreshold = rng.chance(0.3) ? 65 : 0;
        return { team, players, injuryMult: 20 };
      };
      const sim = new GameSim(make(g % 30), make((g + 9) % 30), { rng: new Rng(g), type: g % 3 ? 'regular' : 'playoffs', keepShots: true });
      const res = sim.simToEnd();
      expect(res.home.pts).not.toBe(res.away.pts);
      for (const [i, tb] of [res.home, res.away].entries()) {
        const opp = i ? res.home : res.away;
        const t = sim.T[i];
        for (const k of ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const)
          expect(tb.players.reduce((a, p) => a + p[k], 0)).toBe(tb.t[k]);
        for (const p of tb.players) expect(2 * p.fgm + p.tpm + p.ftm).toBe(p.pts);
        expect(tb.t.pts).toBe(tb.pts);
        expect(tb.quarters.reduce((a, b) => a + b, 0)).toBe(tb.pts);
        expect(Math.round(tb.players.reduce((a, p) => a + p.min, 0) * 10)).toBe(10 * 5 * (48 + 5 * res.ot));
        expect(tb.players.reduce((a, p) => a + p.pm, 0)).toBe(5 * (tb.pts - opp.pts));
        expect(tb.players.filter((p) => p.gs).length).toBe(5);
        // assists only on makes, blocks and boards only off misses, steals only on turnovers
        expect(tb.t.ast).toBeLessThanOrEqual(tb.t.fgm);
        expect(tb.t.blk).toBeLessThanOrEqual(opp.t.fga - opp.t.fgm);
        expect(tb.t.stl).toBeLessThanOrEqual(opp.t.tov);
        expect(tb.t.orb + opp.t.drb).toBeLessThanOrEqual(tb.t.fga - tb.t.fgm + tb.t.fta - tb.t.ftm);
        // every possession ends once, in one play type and one lineup
        expect(Object.values(tb.playTypes).reduce((a, x) => a + x.poss, 0)).toBe(tb.poss);
        const lineups = [...sim.lineups.values()].filter((l) => l.t === i);
        expect(lineups.reduce((a, l) => a + l.poss, 0)).toBe(tb.poss);
        expect(lineups.reduce((a, l) => a + l.ptsFor, 0)).toBe(tb.pts);
        expect(res.shots!.filter((s) => s.t === i).length).toBe(tb.t.fga);
        // nobody sits out disqualified or hurt while a healthy teammate could take his place
        for (const p of t.players) if (p.fouls >= GAME.foulOut) expect(p.out).not.toBe(0);
        if (t.players.filter((p) => p.out === 0).length >= 5) expect(t.on.every((p) => p.out === 0)).toBe(true);
      }
      expect(res.flow!.length).toBe(res.home.poss + res.away.poss);
    }
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
