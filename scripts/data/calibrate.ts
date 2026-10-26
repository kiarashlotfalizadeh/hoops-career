// Engine-in-the-loop calibration against two targets at once. Simulate games with the derived
// ratings, then for each player compare:
//   1. His style: his simulated per-36 profile with his real one (shot volume, shot mix,
//      efficiency, playmaking, rebounding and defensive event rates), nudging his shooting ratings
//      and hidden tendencies.
//   2. His value: what his team gains with him on the floor in the simulated games (RAPM over the
//      batch's stints, value.ts) with his projected impact (games/impact.ts), nudging only the
//      skills whose evidence is his impact (valueWeights), with his own scoring held where it was.
// After a few passes both match: each player reproduces his real line and is worth on the floor
// what his impact says, its gaps between players included.

import type { League, Player, RatingKey, Ratings, Tactics, Team } from '../../src/core/types';
import { GameSim, type Stint } from '../../src/core/sim/engine';
import { Rng, clamp } from '../../src/core/random';
import { autoRotation, autoTactics, rankedPresets } from '../../src/core/ai/coachAI';
import { applyDefPreset, applyOffPreset, cloneTactics } from '../../src/core/sim/tactics';
import { clampRatings } from '../../src/core/ratings';
import { refreshPlayerDerived } from '../../src/core/playerGen';
import { teamPlayers } from '../../src/core/league/helpers';
import type { Agg } from './derive';
import { rapm, type OnCourt } from './value';

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

export function simulateBatch(league: League, gamesPerTeam: number, seed: number, stints?: Stint[]): Map<number, SimAcc> {
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
      const a = (h + 1 + Math.floor(rng.next() * (n - 1))) % n;
      const sim = new GameSim(lineup(sides[h]), lineup(sides[a]), { rng, type: 'regular', injuries: false, stints: !!stints });
      sim.simToEnd();
      if (stints) stints.push(...sim.stints!.values());
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

/**
 * The usage-efficiency trade-off, which the engine leaves out: a shooter who takes three times the
 * threes takes them against tighter defense, off the dribble and late in the clock, so the same
 * percentage on more of them is the better shooter (and a 47% on two a game from a role player is
 * not a 99). Each zone's make-rate target gets `x` per unit of log volume over the league's
 * (attempt-weighted, so the league's makes stay where they were), at most ±`cap`: the ratings rank
 * shooters, finishers and foul-drawers the way their volume and efficiency together do, and the
 * engine, which lacks the trade-off, plays a high-volume player a little above his percentage and a
 * low-volume one a little below. Free throws per shot scale by exp(x × log volume over the league's).
 */
export const VOLUME_TRADE: Record<'three' | 'rim' | 'mid' | 'ftr', { x: number; cap: number; low?: number }> = {
  // (a big who takes two threes a game loses at most 2.5 points of percentage, or his threes dry up)
  three: { x: 0.07, cap: 0.05, low: 0.025 },
  rim: { x: 0.035, cap: 0.04 },
  mid: { x: 0.04, cap: 0.04 },
  ftr: { x: 0.3, cap: 0.4 },
};
/** The most a three-point tendency goes to: a big who shoots a few threes on a low rating needs a lot of it. */
export const THREE_TEND_MAX = 10;
/** Free throws per shot: shrunk toward the league's rate by `k` field-goal attempts. */
const FTR_PRIOR = { p: 0.245, k: 150 };
/** Attempts of shrinkage toward the league's rate on the rim and mid-range make-rate targets (play-by-play). */
const ZONE_PRIOR = { rim: { p: 0.655, k: 100 }, mid: { p: 0.42, k: 80 } };

/** Per-36 volume of a player's zone (log of 1 + attempts per 36). */
const logVol = (att: number, mins: number) => Math.log1p((att / Math.max(1, mins)) * 36);

/** The league's attempt-weighted mean log volume of each zone over the targets (see VOLUME_TRADE). */
function volumeRefs(targets: Map<number, StyleTarget>) {
  const acc = { three: [0, 0], rim: [0, 0], mid: [0, 0], ftr: [0, 0] };
  const add = (k: keyof typeof acc, v: number, w: number) => {
    acc[k][0] += v * w;
    acc[k][1] += w;
  };
  for (const { agg } of targets.values()) {
    const p = agg.per36;
    add('three', Math.log1p(p.fg3a), (p.fg3a * agg.wMin) / 36);
    add('ftr', Math.log1p(p.fta), (p.fta * agg.wMin) / 36);
    const b = agg.pbp;
    if (b && b.mins >= 60) {
      add('rim', logVol(b.fga.rim, b.mins), (b.fga.rim / b.mins) * agg.wMin);
      add('mid', logVol(b.fga.mid, b.mins), (b.fga.mid / b.mins) * agg.wMin);
    }
  }
  const ref = {
    three: acc.three[0] / (acc.three[1] || 1),
    rim: acc.rim[0] / (acc.rim[1] || 1),
    mid: acc.mid[0] / (acc.mid[1] || 1),
    ftr: acc.ftr[0] / (acc.ftr[1] || 1),
    ftrNorm: 1,
  };
  // (free throws scale by a factor, whose free-throw-weighted mean is over 1: divided back out)
  let fw = 0;
  let fs = 0;
  for (const { agg } of targets.values()) {
    const w = (agg.per36.fta * agg.wMin) / 36;
    fw += w;
    fs += w * ftrFactor(Math.log1p(agg.per36.fta), ref.ftr, 1);
  }
  ref.ftrNorm = fw ? fs / fw : 1;
  return ref;
}

/** His free throws per shot target's volume factor (see VOLUME_TRADE), the league's mean factor divided out. */
function ftrFactor(v: number, ref: number, norm: number) {
  return Math.exp(clamp(VOLUME_TRADE.ftr.x * (v - ref), -VOLUME_TRADE.ftr.cap, VOLUME_TRADE.ftr.cap)) / norm;
}

/** A player's style target: his real line (aggregated stat seasons), how much his sample counts, and his ratings as his evidence derived them. */
export interface StyleTarget {
  agg: Agg;
  rel: number;
  from?: Ratings;
}

/**
 * Attempts (recency-weighted, all stat seasons) at which a zone's make rate counts for half against his
 * derived rating: below that, a hot or cold handful of shots moves his rating only part of the way, and
 * the rest of each pass pulls it back toward what his evidence derived (a center's 30 mid-range shots
 * at 55% are not a 99). Free throws per shot by his field-goal attempts.
 */
export const SHOT_SAMPLE = { tp: 150, mid: 120, ins: 120, drw: 400 };
/** How far each pass pulls a thin-sample zone rating back toward its derived value (times the damping and his share of doubt). */
const SAMPLE_PULL = 0.5;

/** A zone's volume adjustment to its make-rate target (see VOLUME_TRADE). */
const volAdj = (k: 'three' | 'rim' | 'mid', v: number, ref: number) => clamp(VOLUME_TRADE[k].x * (v - ref), -(VOLUME_TRADE[k].low ?? VOLUME_TRADE[k].cap), VOLUME_TRADE[k].cap);

export interface CalibReport {
  iter: number;
  players: number;
  err: Record<string, number>;
}

/** A player's value target, his projected impact at each end, and the defensive skills a miss there moves, by how much of it each takes. */
export interface ValueTarget {
  off: number;
  def: number;
  defW: Partial<Record<RatingKey, number>>;
  /** His ratings as his evidence derived them: value moves each skill at most VALUE_BAND from there. */
  from: Ratings;
}

/**
 * The skills that carry a player's value: the ones whose evidence is his impact (derive.ts reads
 * them from box plus-minus, RAPM, matchup and rim defense) and whose part in the engine is what his
 * teammates get, not his own line. At the offensive end that is feel (offensive IQ, which lifts every
 * shot the five take); at the defensive end team defense (defensive IQ), then the perimeter or the
 * interior with rim contests by where he defends, from his derived ratings. Shooting, handling,
 * passing, free throws, rebounding, steals, size and athleticism never move for value: his real line
 * pins them.
 */
export function valueWeights(r: Ratings): Pick<ValueTarget, 'defW'> {
  const inside = clamp(0.5 + (r.intD + r.blk + r.hgt - r.perD - r.stl - r.spd) / 120, 0.15, 0.85);
  // (shot blocking is his box score's, like steals: the blocks he gets pin it, and fans read it as his
  // blocks; a rim protector the engine values above his impact gives it back in interior defense)
  return { defW: { diq: 1, perD: 1.4 * (1 - inside), intD: 1.7 * inside } };
}

/**
 * Rating points per point per 100 of value missed: about what moves his simulated RAPM by one
 * (feel is worth about 0.1 a point with his own scoring held still; team, perimeter and interior
 * defense with rim contests together about 0.11).
 */
const VALUE_GAIN = { off: 10, def: 9 };
/** The most a value step moves a skill in one pass. */
const VALUE_STEP_MAX = 6;
/**
 * The most value moves a skill from where his evidence put it, all passes together: about one
 * standard deviation of a rating across the league. The engine values some players far from their
 * impact whatever their skills (a high-usage scorer's efficient volume above it, a non-scoring
 * role player's below, a rim protector's blocks and boards above, a small guard's defense below),
 * and closing those gaps entirely would push their feel and defense to the ends of the scale; within
 * the band they close as far as their evidence allows, and the build reports what is left.
 */
export const VALUE_BAND = 15;
/** Possessions of simulated RAPM at which a value miss counts for half (it is noisy below). */
const VALUE_POSS = 8000;
/** How much each older batch of stints counts in the value fit (ratings have moved since). */
const VALUE_DECAY = 0.5;

/**
 * Feel also enters a player's own scoring: through the composites his finishing, mid-range and
 * threes read (ratings.ts), the creation and pick-and-roll handling that open his own shots up, and
 * the five's feel, which lifts his own makes with everyone's (0.6 of his offensive IQ over five, at
 * K.feel per 50 points: half a point of make rate per ten points of IQ). What a value step gives his
 * offensive IQ comes back out of finishing, mid-range, threes and handling in the proportions that
 * hold each zone's make rate and his creation where they were, so his level never spills into his
 * scoring (the style targets then hold his line there).
 */
export const FEEL_IN_SCORING: Partial<Record<RatingKey, number>> = { ins: 0.61, mid: 0.455, tp: 0.38, hnd: 0.6 };

/** Move his value skills by `moves`, each within the band around his evidence, what his feel gains coming back out of his scoring. */
function shiftValue(r: Ratings, from: Ratings, moves: Partial<Record<RatingKey, number>>) {
  const was = r.oiq;
  for (const [k, x] of Object.entries(moves) as [RatingKey, number][]) r[k] = clamp(r[k] + x, from[k] - VALUE_BAND, from[k] + VALUE_BAND);
  clampRatings(r);
  for (const [k, w] of Object.entries(FEEL_IN_SCORING) as [RatingKey, number][]) r[k] -= w * (r.oiq - was);
  clampRatings(r);
}

/** Step a player's value skills by his miss at each end (points per 100) times `d`, his scoring held where it was. */
export function valueStep(r: Ratings, t: Pick<ValueTarget, 'defW' | 'from'>, miss: { off: number; def: number }, d: number) {
  const dO = clamp(VALUE_GAIN.off * miss.off * d, -VALUE_STEP_MAX, VALUE_STEP_MAX);
  const dD = clamp(VALUE_GAIN.def * miss.def * d, -VALUE_STEP_MAX, VALUE_STEP_MAX);
  const moves: Partial<Record<RatingKey, number>> = { oiq: dO };
  for (const [k, w] of Object.entries(t.defW) as [RatingKey, number][]) moves[k] = w * dD;
  shiftValue(r, t.from, moves);
}

const VALUE_SKILLS: RatingKey[] = ['oiq', 'diq', 'perD', 'intD'];

export function calibrate(
  league: League,
  targets: Map<number, StyleTarget>,
  value: Map<number, ValueTarget>,
  passes: { games: number; damp: number }[],
  log = console.log,
): CalibReport[] {
  const reports: CalibReport[] = [];
  const batches: { stints: Stint[]; w: number }[] = [];
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
  const vref = volumeRefs(targets);
  log(`  volume references (log 1 + per 36): three ${vref.three.toFixed(2)}, rim ${vref.rim.toFixed(2)}, mid ${vref.mid.toFixed(2)}, free throws ${vref.ftr.toFixed(2)}`);
  passes.forEach((pass, iter) => {
    for (const b of batches) b.w *= VALUE_DECAY;
    const stints: Stint[] = [];
    const acc = simulateBatch(league, pass.games, 1000 + iter, value.size ? stints : undefined);
    batches.push({ stints, w: 1 });
    while (batches.length && batches[0].w < 0.1) batches.shift();
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
      const wm0 = t.agg.wMin / 36;
      const tgt = {
        use: real.fga + 0.44 * real.fta + real.tov,
        tpar: real.fga ? Math.min(0.97, (real.fg3a / real.fga) * threeTrend) : 0,
        ftr: real.fga ? ((real.fta * wm0 + FTR_PRIOR.p * FTR_PRIOR.k) / (real.fga * wm0 + FTR_PRIOR.k)) * ftrFactor(Math.log1p(real.fta), vref.ftr, vref.ftrNorm) : 0,
        fg3: t.agg.fg3Pct + volAdj('three', Math.log1p(real.fg3a), vref.three),
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
      else tend.three = clamp(tend.three * Math.exp(ln(tgt.tpar * 10, sim.tpar * 10) * 0.8 * d), 0.02, THREE_TEND_MAX);
      const r = p.ratings;
      // (each zone's step counts by its sample, see SHOT_SAMPLE; the rest pulls toward his derived rating)
      const wm = t.agg.wMin / 36;
      const relOf = (n: number, k: number) => n / (n + k);
      const relS = { tp: relOf(real.fg3a * wm, SHOT_SAMPLE.tp), drw: relOf(real.fga * wm, SHOT_SAMPLE.drw), mid: 0, ins: 0 };
      r.drw += relS.drw * clamp(16 * ln(tgt.ftr * 10, sim.ftr * 10) * d, -8, 8);
      if (real.fg3a >= 0.8 && s.fg3a >= 25) r.tp += relS.tp * clamp(((tgt.fg3 - sim.fg3) / 0.002) * 0.45 * d, -8, 8);
      const b = t.agg.pbp;
      const bFga = b ? b.fga.rim + b.fga.paint + b.fga.mid + b.fga.c3 + b.fga.ab3 : 0;
      if (b && bFga >= 60 && s.fga >= 40) {
        // shot diet and shot-making by zone, from NBA.com play-by-play
        zoneCount.n++;
        const bFgm = b.fgm.rim + b.fgm.paint + b.fgm.mid + b.fgm.c3 + b.fgm.ab3;
        const simFgm = s.fg2 + s.fg3;
        const zr = ZONE_PRIOR.rim;
        const zt = {
          rim: b.fga.rim / bFga,
          mid: b.fga.mid / bFga,
          unast: bFgm ? 1 - b.astFgm / bFgm : 0.5,
          rimPct: (b.fgm.rim + zr.p * zr.k) / (b.fga.rim + zr.k) + volAdj('rim', logVol(b.fga.rim, b.mins), vref.rim),
        };
        const zs = { rim: s.rimA / s.fga, mid: s.midA / s.fga, unast: simFgm ? 1 - s.astM / simFgm : 0.5, rimPct: s.rimA ? s.rimM / s.rimA : zt.rimPct };
        for (const k of ['rim', 'mid', 'unast', 'rimPct'] as const) err[k] += Math.abs(zt[k] - zs[k]);
        tend.drive = clamp(tend.drive * Math.exp(ln(zt.rim * 10, zs.rim * 10) * 0.9 * d), 0.15, 5);
        tend.mid = clamp((tend.mid ?? 1) * Math.exp(ln(zt.mid * 10, zs.mid * 10) * 0.9 * d), 0.05, 6);
        tend.create = clamp((tend.create ?? 1) * Math.exp(ln(zt.unast * 10, zs.unast * 10) * 1.2 * d), 0.15, 5);
        const t3 = b.fga.c3 + b.fga.ab3;
        if (t3 >= 30 && s.fg3a >= 25) tend.corner = clamp((tend.corner ?? 1) * Math.exp(ln((b.fga.c3 / t3) * 10, (s.c3A / s.fg3a) * 10) * 0.8 * d), 0.1, 6);
        relS.ins = relOf(b.fga.rim, SHOT_SAMPLE.ins);
        relS.mid = relOf(b.fga.mid, SHOT_SAMPLE.mid);
        if (s.rimA >= 20) r.ins += relS.ins * clamp(((zt.rimPct - zs.rimPct) / 0.0028) * 0.45 * d, -8, 8);
        const zm = ZONE_PRIOR.mid;
        const midT = (b.fgm.mid + zm.p * zm.k) / (b.fga.mid + zm.k) + volAdj('mid', logVol(b.fga.mid, b.mins), vref.mid);
        if (s.midA >= 15 && b.fga.mid >= 15) r.mid += relS.mid * clamp(((midT - s.midM / s.midA) / 0.0035) * 0.45 * d, -8, 8);
        // floaters and short paint shots: what rim and mid leave over. Their mid-range half goes to his
        // mid-range only as far as he takes mid-range shots (a center's hooks are not a jumper): what it
        // leaves on his short shots is a few hundredths of a point a game
        const paintT = (b.fgm.paint + 0.45 * 50) / (b.fga.paint + 50);
        const sPaintA = s.fg2a - s.rimA - s.midA;
        const sPaintM = s.fg2 - s.rimM - s.midM;
        if (sPaintA >= 20 && b.fga.paint >= 20) {
          const step = clamp(((paintT - sPaintM / sPaintA) / 0.003) * 0.3 * d, -5, 5);
          r.ins += step * 0.5;
          r.mid += step * 0.5 * clamp((2 * b.fga.mid) / (b.fga.mid + b.fga.paint), 0, 1);
        }
      } else if (real.fg2a >= 1.5 && s.fg2a >= 25) {
        const step = clamp(((tgt.fg2 - sim.fg2) / 0.0028) * 0.45 * d, -8, 8);
        r.ins += step;
        r.mid += step * 0.35;
      }
      if (t.from) {
        const from = t.from;
        const pull = (k: 'tp' | 'mid' | 'ins' | 'drw', rel: number) => (r[k] += (1 - rel) * SAMPLE_PULL * d * (from[k] - r[k]));
        pull('tp', relS.tp);
        pull('drw', relS.drw);
        if (b && bFga >= 60) {
          pull('mid', relS.mid);
          pull('ins', relS.ins);
        }
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
    if (value.size) Object.assign(err, valuePass(league, value, rapm(batches), pass.damp));
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

/**
 * One value pass: each player's simulated RAPM against his target, and his value skills stepped by
 * the miss. RAPM is relative to the league's rate and the impact estimate to its own players, so the
 * misses are put on one level first, weighted as the steps are (possessions, times how much his
 * sample counts), and after the steps each value skill's league mean (the rostered players') goes
 * back to where the evidence put it: value moves players only against each other and leaves the
 * league's level to the style targets. Returns the mean absolute misses over players with a solid sample, before the step.
 */
function valuePass(league: League, value: Map<number, ValueTarget>, sim: Map<number, OnCourt>, damp: number) {
  const rows = [...value].flatMap(([pid, t]) => {
    const s = sim.get(pid);
    const p = league.players[pid];
    return s && p ? [{ p, t, s, d: damp * (s.poss / (s.poss + VALUE_POSS)) }] : [];
  });
  let sw = 0;
  const level = { off: 0, def: 0 };
  for (const { t, s, d } of rows) {
    sw += s.poss * d;
    level.off += (s.off - t.off) * s.poss * d;
    level.def += (s.def - t.def) * s.poss * d;
  }
  level.off /= sw || 1;
  level.def /= sw || 1;
  let n = 0;
  const err = { valOff: 0, valDef: 0 };
  for (const { p, t, s, d } of rows) {
    const miss = { off: t.off + level.off - s.off, def: t.def + level.def - s.def };
    if (s.poss >= 2 * VALUE_POSS) {
      n++;
      err.valOff += Math.abs(miss.off);
      err.valDef += Math.abs(miss.def);
    }
    valueStep(p.ratings, t, miss, d);
  }
  // (a step spreads a defensive miss inside or out by where he defends, and the band and the scale's
  // ends clip some: each value skill's mean over the rostered players' floor time goes back to where
  // the evidence put it, everyone moving by the same amount)
  const rostered = rows.filter(({ p }) => p.tid >= 0);
  const floor = rostered.reduce((a, { s }) => a + s.poss, 0) || 1;
  for (const k of VALUE_SKILLS) {
    const drift = rostered.reduce((a, { p, t, s }) => a + s.poss * (p.ratings[k] - t.from[k]), 0) / floor;
    for (const { p, t } of rows) shiftValue(p.ratings, t.from, { [k]: -drift });
  }
  err.valOff /= n || 1;
  err.valDef /= n || 1;
  return err;
}
