// Engine-in-the-loop calibration: simulate games with the derived ratings, compare each
// player's simulated per-36 profile with his real one, and nudge ratings/tendencies.
// After a few passes, players reproduce their real shot volume, shot mix, efficiency,
// playmaking, rebounding and defensive event rates inside the game engine.

import type { League, Player, Tactics, Team } from '../../src/core/types';
import { GameSim } from '../../src/core/sim/engine';
import { Rng, clamp } from '../../src/core/random';
import { autoRotation, autoTactics, rankedPresets } from '../../src/core/ai/coachAI';
import { applyDefPreset, applyOffPreset, cloneTactics } from '../../src/core/sim/tactics';
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
  rimA: number;
  rimM: number;
  midA: number;
  midM: number;
  c3A: number;
  astM: number;
}

const blank = (): SimAcc => ({
  sec: 0,
  fga: 0,
  fg3a: 0,
  fg3: 0,
  fg2a: 0,
  fg2: 0,
  fta: 0,
  ft: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pts: 0,
  pf: 0,
  rimA: 0,
  rimM: 0,
  midA: 0,
  midM: 0,
  c3A: 0,
  astM: 0,
});

/** Share of games a player misses in calibration (real regulars miss roughly one game in eight). */
const ABSENCE = 0.1;

/** One calibration roster: a team, its players and the tactical setups its coach might use. */
interface CalibSide {
  team: Team;
  players: Player[];
  setups: { t: Tactics; w: number }[];
}

/**
 * Tactical variety: tendencies fitted under a single draw of coach tactics overfit that context
 * (a heliocentric offense routes a big's usage through the handler's passes), so every game
 * draws each team's offense from its three best-fitting presets (the AI coach's own choice most
 * of the time) and its defense from its two best.
 */
function tacticSetups(team: Team, players: Player[]): { t: Tactics; w: number }[] {
  const base = autoTactics(team, players, false);
  const ranked = rankedPresets(team, players);
  const out: { t: Tactics; w: number }[] = [];
  const offW = [0.6, 0.25, 0.15];
  const defW = [0.7, 0.3];
  ranked.off.slice(0, 3).forEach((off, i) =>
    ranked.def.slice(0, 2).forEach((def, j) => {
      const t = cloneTactics(base);
      t.offense = applyOffPreset(t.offense, off);
      t.defense = applyDefPreset(t.defense, def);
      t.offPreset = off;
      t.defPreset = def;
      out.push({ t, w: offW[i] * defW[j] });
    }),
  );
  return out;
}

/**
 * Two roster contexts, half the games each: next season's rosters (where the players will
 * actually play) and the 2025-26 teams the real stats come from (main team by minutes), so a
 * player who changed teams is not fitted to a role he never had. Players without a 2025-26
 * sample (rookies, a season lost to injury) stay with their current team in both.
 */
function calibSides(league: League): { next: CalibSide[]; real: CalibSide[] } {
  const realSeason = league.season - 1;
  const next = league.teams.map((t) => ({ team: t, players: teamPlayers(league, t.tid), setups: [] as { t: Tactics; w: number }[] }));
  const realRoster = new Map<number, Player[]>(league.teams.map((t) => [t.tid, []]));
  for (const p of Object.values(league.players)) {
    const rows = p.stats.filter((s) => s.real && s.season === realSeason && !s.playoffs && s.tid >= 0);
    let tid = p.tid;
    if (rows.length) tid = rows.reduce((a, b) => (b.min > a.min ? b : a)).tid;
    if (tid >= 0 && realRoster.has(tid)) realRoster.get(tid)!.push(p);
  }
  const real = league.teams.map((t) => ({
    team: { ...t, tactics: cloneTactics(t.tactics), rotation: { ...t.rotation } },
    players: realRoster.get(t.tid)!,
    setups: [] as { t: Tactics; w: number }[],
  }));
  for (const side of [...next, ...real]) {
    if (side.players.length < 5) continue;
    side.team.rotation = autoRotation(side.players, side.team.rotation);
    side.team.tactics = autoTactics(side.team, side.players, false);
    side.setups = tacticSetups(side.team, side.players);
  }
  return { next: next.filter((s) => s.players.length >= 5), real: real.filter((s) => s.players.length >= 5) };
}

export function simulateBatch(league: League, gamesPerTeam: number, seed: number): Map<number, SimAcc> {
  const rng = new Rng(seed);
  const acc = new Map<number, SimAcc>();
  const ctxs = calibSides(league);
  const pick = (s: CalibSide) => s.setups[rng.weighted(s.setups.map((x) => x.w))]?.t ?? s.team.tactics;
  // Real lines were produced with teammates missing games (injuries, rest): each player sits a
  // game now and then, and the coach re-plans the rotation around whoever is available.
  const lineup = (s: CalibSide) => {
    const here = s.players.filter(() => !rng.chance(ABSENCE));
    const players = here.length >= 9 ? here : s.players;
    const rotation = players === s.players ? s.team.rotation : autoRotation(players, s.team.rotation);
    return { team: { ...s.team, tactics: pick(s), rotation }, players };
  };
  for (const sides of [ctxs.next, ctxs.real]) {
    const n = sides.length;
    const total = Math.round((gamesPerTeam * n) / 4);
    for (let g = 0; g < total; g++) {
      const h = g % n;
      let a = (h + 1 + Math.floor(rng.next() * (n - 1))) % n;
      if (a === h) a = (a + 1) % n;
      const sim = new GameSim(lineup(sides[h]), lineup(sides[a]), { rng, type: 'regular', injuries: false });
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
        e.rimA += b.rimA;
        e.rimM += b.rimM;
        e.midA += b.midA;
        e.midM += b.midM;
        e.c3A += b.c3A;
        e.astM += b.astM;
        acc.set(rb.pid, e);
      }
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
  // Targets blend three seasons, which lags the league's drift toward the three: scale each
  // player's three-point share by how far the latest season ran ahead of the blend.
  let r3a = 0;
  let rfga = 0;
  let b3a = 0;
  let bfga = 0;
  for (const [pid, t] of targets) {
    const p = league.players[pid];
    const last = p?.stats.filter((x) => x.real && x.season === league.season - 1) ?? [];
    const min = last.reduce((a, x) => a + x.min, 0);
    if (min <= 0) continue;
    r3a += last.reduce((a, x) => a + x.tpa, 0);
    rfga += last.reduce((a, x) => a + x.fga, 0);
    b3a += (t.agg.per36.fg3a * min) / 36;
    bfga += (t.agg.per36.fga * min) / 36;
  }
  const threeTrend = rfga > 0 && b3a > 0 ? clamp(r3a / rfga / (b3a / bfga), 0.95, 1.08) : 1;
  log(`  three-point trend factor ${threeTrend.toFixed(3)}`);
  passes.forEach((pass, iter) => {
    const acc = simulateBatch(league, pass.games, 1000 + iter);
    const err: Record<string, number> = { use: 0, tpar: 0, fg3: 0, fg2: 0, ftr: 0, ast: 0, tov: 0, orb: 0, drb: 0, stl: 0, blk: 0, pf: 0, rim: 0, mid: 0, unast: 0, rimPct: 0 };
    const zoneCount = { n: 0 };
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
        tpar: real.fga ? Math.min(0.97, (real.fg3a / real.fga) * threeTrend) : 0,
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
      for (const key of Object.keys(err)) if (key in tgt) err[key] += Math.abs((sim as Record<string, number>)[key] - (tgt as Record<string, number>)[key]);
      const tend = (p.tend ??= { use: 1, three: 1, drive: 1, pass: 1 });
      // usage responds sublinearly (a star's share saturates), so step harder than for rates
      tend.use = clamp(tend.use * Math.exp(ln(tgt.use, sim.use) * 1.7 * d), 0.1, 25);
      if (tgt.tpar < 0.02) tend.three = clamp(tend.three * 0.6, 0.02, 3);
      else tend.three = clamp(tend.three * Math.exp(ln(tgt.tpar * 10, sim.tpar * 10) * 0.8 * d), 0.02, 5);
      const r = p.ratings;
      r.drw += clamp(16 * ln(tgt.ftr * 10, sim.ftr * 10) * d, -8, 8);
      if (real.fg3a >= 0.8 && s.fg3a >= 25) r.tp += clamp(((tgt.fg3 - sim.fg3) / 0.002) * 0.45 * d, -8, 8);
      const b = t.agg.pbp;
      const bFga = b ? b.fga.rim + b.fga.paint + b.fga.mid + b.fga.c3 + b.fga.ab3 : 0;
      if (b && bFga >= 60 && s.fga >= 40) {
        // shot diet and shot-making by zone, from NBA.com play-by-play
        zoneCount.n++;
        const bFgm = b.fgm.rim + b.fgm.paint + b.fgm.mid + b.fgm.c3 + b.fgm.ab3;
        const simFgm = s.fg2 + s.fg3;
        const zt = { rim: b.fga.rim / bFga, mid: b.fga.mid / bFga, unast: bFgm ? 1 - b.astFgm / bFgm : 0.5, rimPct: (b.fgm.rim + 0.655 * 60) / (b.fga.rim + 60) };
        const zs = { rim: s.rimA / s.fga, mid: s.midA / s.fga, unast: simFgm ? 1 - s.astM / simFgm : 0.5, rimPct: s.rimA ? s.rimM / s.rimA : zt.rimPct };
        for (const k of ['rim', 'mid', 'unast', 'rimPct'] as const) err[k] += Math.abs(zt[k] - zs[k]);
        tend.drive = clamp(tend.drive * Math.exp(ln(zt.rim * 10, zs.rim * 10) * 0.9 * d), 0.15, 5);
        tend.mid = clamp((tend.mid ?? 1) * Math.exp(ln(zt.mid * 10, zs.mid * 10) * 0.9 * d), 0.05, 6);
        tend.create = clamp((tend.create ?? 1) * Math.exp(ln(zt.unast * 10, zs.unast * 10) * 1.2 * d), 0.15, 5);
        const t3 = b.fga.c3 + b.fga.ab3;
        if (t3 >= 30 && s.fg3a >= 25) tend.corner = clamp((tend.corner ?? 1) * Math.exp(ln((b.fga.c3 / t3) * 10, (s.c3A / s.fg3a) * 10) * 0.8 * d), 0.1, 6);
        if (s.rimA >= 20) r.ins += clamp(((zt.rimPct - zs.rimPct) / 0.0028) * 0.45 * d, -8, 8);
        const midT = (b.fgm.mid + 0.42 * 50) / (b.fga.mid + 50);
        if (s.midA >= 15 && b.fga.mid >= 15) r.mid += clamp(((midT - s.midM / s.midA) / 0.0035) * 0.45 * d, -8, 8);
        // floaters and short paint shots: what rim and mid leave over
        const paintT = (b.fgm.paint + 0.45 * 50) / (b.fga.paint + 50);
        const sPaintA = s.fg2a - s.rimA - s.midA;
        const sPaintM = s.fg2 - s.rimM - s.midM;
        if (sPaintA >= 20 && b.fga.paint >= 20) {
          const step = clamp(((paintT - sPaintM / sPaintA) / 0.003) * 0.3 * d, -5, 5);
          r.ins += step * 0.5;
          r.mid += step * 0.5;
        }
      } else if (real.fg2a >= 1.5 && s.fg2a >= 25) {
        const step = clamp(((tgt.fg2 - sim.fg2) / 0.0028) * 0.45 * d, -8, 8);
        r.ins += step;
        r.mid += step * 0.35;
      }
      // playmaking, ball security, glass and defensive events: visible ratings stay as derived
      // from the real rate stats; hidden tendencies absorb role and opportunity
      tend.pass = clamp(tend.pass * Math.exp(ln(tgt.ast, sim.ast) * 0.7 * d), 0.25, 6);
      // turnovers as a share of his usage: with everyone healthy a lineup can't deliver every
      // player's full real usage, and his turnovers should shrink with his touches
      tend.tov = clamp((tend.tov ?? 1) * Math.exp(ln((10 * tgt.tov) / tgt.use, (10 * sim.tov) / Math.max(0.5, sim.use)) * 0.9 * d), 0.3, 3.5);
      tend.orb = clamp((tend.orb ?? 1) * Math.exp(ln(tgt.orb, sim.orb) * 0.9 * d), 0.08, 5);
      tend.drb = clamp((tend.drb ?? 1) * Math.exp(ln(tgt.drb, sim.drb) * 0.9 * d), 0.08, 5);
      tend.stl = clamp((tend.stl ?? 1) * Math.exp(ln(tgt.stl, sim.stl) * 0.9 * d), 0.2, 5);
      tend.blk = clamp((tend.blk ?? 1) * Math.exp(ln(tgt.blk, sim.blk) * 0.9 * d), 0.15, 6);
      tend.pf = clamp((tend.pf ?? 1) * Math.exp(ln(tgt.pf, sim.pf) * 0.9 * d), 0.15, 3);
      // free throws are his own: pin the rating to his real (regressed) FT% after any leveling
      r.ft = clamp((t.agg.ftPct - 0.42) / 0.0052, 1, 100);
      clampRatings(r);
    }
    for (const key of Object.keys(err)) err[key] = ['rim', 'mid', 'unast', 'rimPct'].includes(key) ? (zoneCount.n ? err[key] / zoneCount.n : 0) : count ? err[key] / count : 0;
    for (const p of Object.values(league.players)) refreshPlayerDerived(p as Player, league.season, league.ovrScale);
    reports.push({ iter, players: count, err });
    log(
      `  pass ${iter + 1}: ${count} players · mean abs error ` +
        Object.entries(err)
          .map(([k, v]) => `${k} ${v.toFixed(3)}`)
          .join(', '),
    );
  });
  return reports;
}
