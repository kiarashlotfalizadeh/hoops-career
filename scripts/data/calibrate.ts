// Engine-in-the-loop calibration: simulate games with the derived ratings, compare each
// player's simulated per-36 profile with his real one, and nudge ratings/tendencies.
// After a few passes, players reproduce their real shot volume, shot mix, efficiency,
// playmaking, rebounding and defensive event rates inside the game engine.

import type { League, Player } from '../../src/core/types';
import { GameSim } from '../../src/core/sim/engine';
import { Rng, clamp } from '../../src/core/random';
import { autoRotation, autoTactics } from '../../src/core/ai/coachAI';
import { clampRatings } from '../../src/core/ratings';
import { refreshPlayerDerived } from '../../src/core/playerGen';
import { teamPlayers } from '../../src/core/league/helpers';
import type { Agg } from './derive';

interface SimAcc {
  sec: number;
  fga: number;
  fg3a: number;
  fg3: number;
  fg2a: number;
  fg2: number;
  fta: number;
  ft: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pts: number;
  pf: number;
}

const blank = (): SimAcc => ({ sec: 0, fga: 0, fg3a: 0, fg3: 0, fg2a: 0, fg2: 0, fta: 0, ft: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pts: 0, pf: 0 });

export function simulateBatch(league: League, gamesPerTeam: number, seed: number): Map<number, SimAcc> {
  const rng = new Rng(seed);
  const acc = new Map<number, SimAcc>();
  const rosters = league.teams.map((t) => teamPlayers(league, t.tid));
  for (const t of league.teams) {
    t.rotation = autoRotation(rosters[t.tid], t.rotation);
    t.tactics = autoTactics(t, rosters[t.tid], false);
  }
  const n = league.teams.length;
  const total = (gamesPerTeam * n) / 2;
  for (let g = 0; g < total; g++) {
    const h = g % n;
    let a = (h + 1 + Math.floor(rng.next() * (n - 1))) % n;
    if (a === h) a = (a + 1) % n;
    const sim = new GameSim({ team: league.teams[h], players: rosters[h] }, { team: league.teams[a], players: rosters[a] }, { rng, type: 'regular', injuries: false });
    sim.simToEnd();
    for (const rb of sim.rawBoxes()) {
      if (rb.b.sec <= 0) continue;
      const e = acc.get(rb.pid) ?? blank();
      const b = rb.b;
      e.sec += b.sec;
      e.fga += b.fga;
      e.fg3a += b.tpa;
      e.fg3 += b.tpm;
      e.fg2a += b.fga - b.tpa;
      e.fg2 += b.fgm - b.tpm;
      e.fta += b.fta;
      e.ft += b.ftm;
      e.orb += b.orb;
      e.drb += b.drb;
      e.ast += b.ast;
      e.stl += b.stl;
      e.blk += b.blk;
      e.tov += b.tov;
      e.pts += b.pts;
      e.pf += b.pf;
      acc.set(rb.pid, e);
    }
  }
  return acc;
}

const ln = (a: number, b: number) => Math.log((a + 0.05) / (b + 0.05));

export interface CalibReport {
  iter: number;
  players: number;
  err: Record<string, number>;
}

export function calibrate(league: League, targets: Map<number, { agg: Agg; rel: number }>, passes: { games: number; damp: number }[], log = console.log): CalibReport[] {
  const reports: CalibReport[] = [];
  passes.forEach((pass, iter) => {
    const acc = simulateBatch(league, pass.games, 1000 + iter);
    const err: Record<string, number> = { use: 0, tpar: 0, fg3: 0, fg2: 0, ftr: 0, ast: 0, tov: 0, orb: 0, drb: 0, stl: 0, blk: 0, pf: 0 };
    let count = 0;
    for (const [pid, t] of targets) {
      const p = league.players[pid];
      const s = acc.get(pid);
      if (!p || !s || s.sec < 60 * 120) continue;
      count++;
      const k = 2160 / s.sec; // per 36
      const real = t.agg.per36;
      const d = pass.damp * t.rel;
      const sim = {
        use: (s.fga + 0.44 * s.fta + s.tov) * k,
        tpar: s.fga ? s.fg3a / s.fga : 0,
        ftr: s.fga ? s.fta / s.fga : 0,
        fg3: s.fg3a ? s.fg3 / s.fg3a : 0,
        fg2: s.fg2a ? s.fg2 / s.fg2a : 0,
        ast: s.ast * k,
        tov: s.tov * k,
        orb: s.orb * k,
        drb: s.drb * k,
        stl: s.stl * k,
        blk: s.blk * k,
        pf: s.pf * k,
      };
      const tgt = {
        use: real.fga + 0.44 * real.fta + real.tov,
        tpar: real.fga ? real.fg3a / real.fga : 0,
        ftr: real.fga ? real.fta / real.fga : 0,
        fg3: t.agg.fg3Pct,
        fg2: t.agg.fg2Pct,
        ast: real.ast,
        tov: real.tov,
        orb: real.orb,
        drb: real.drb,
        stl: real.stl,
        blk: real.blk,
        pf: real.pf,
      };
      for (const key of Object.keys(err)) err[key] += Math.abs((sim as Record<string, number>)[key] - (tgt as Record<string, number>)[key]);
      const tend = (p.tend ??= { use: 1, three: 1, drive: 1, pass: 1 });
      // usage responds sublinearly (a star's share saturates), so step harder than for rates
      tend.use = clamp(tend.use * Math.exp(ln(tgt.use, sim.use) * 1.4 * d), 0.15, 10);
      if (tgt.tpar < 0.02) tend.three = clamp(tend.three * 0.6, 0.02, 3);
      else tend.three = clamp(tend.three * Math.exp(ln(tgt.tpar * 10, sim.tpar * 10) * 0.8 * d), 0.02, 3.5);
      const r = p.ratings;
      r.drw += clamp(16 * ln(tgt.ftr * 10, sim.ftr * 10) * d, -8, 8);
      if (real.fg3a >= 0.8 && s.fg3a >= 25) r.tp += clamp(((tgt.fg3 - sim.fg3) / 0.002) * 0.45 * d, -8, 8);
      if (real.fg2a >= 1.5 && s.fg2a >= 25) {
        const step = clamp(((tgt.fg2 - sim.fg2) / 0.0028) * 0.45 * d, -8, 8);
        r.ins += step;
        r.mid += step * 0.35;
      }
      // playmaking, ball security, glass and defensive events: visible ratings stay as derived
      // from the real rate stats; hidden tendencies absorb role and opportunity
      tend.pass = clamp(tend.pass * Math.exp(ln(tgt.ast, sim.ast) * 0.7 * d), 0.25, 4);
      tend.tov = clamp((tend.tov ?? 1) * Math.exp(ln(tgt.tov, sim.tov) * 0.9 * d), 0.3, 3.5);
      tend.orb = clamp((tend.orb ?? 1) * Math.exp(ln(tgt.orb, sim.orb) * 0.9 * d), 0.08, 5);
      tend.drb = clamp((tend.drb ?? 1) * Math.exp(ln(tgt.drb, sim.drb) * 0.9 * d), 0.08, 5);
      tend.stl = clamp((tend.stl ?? 1) * Math.exp(ln(tgt.stl, sim.stl) * 0.9 * d), 0.2, 5);
      tend.blk = clamp((tend.blk ?? 1) * Math.exp(ln(tgt.blk, sim.blk) * 0.9 * d), 0.15, 6);
      tend.pf = clamp((tend.pf ?? 1) * Math.exp(ln(tgt.pf, sim.pf) * 0.9 * d), 0.15, 3);
      clampRatings(r);
    }
    for (const key of Object.keys(err)) err[key] = count ? err[key] / count : 0;
    for (const p of Object.values(league.players)) refreshPlayerDerived(p as Player, league.season, league.ovrScale);
    reports.push({ iter, players: count, err });
    log(`  pass ${iter + 1}: ${count} players · mean abs error ` + Object.entries(err).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '));
  });
  return reports;
}
