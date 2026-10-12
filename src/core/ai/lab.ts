// Tactics Lab: run batches of games between two configurations and summarize the result.
// Pure and serializable so it can run in a Web Worker.

import type { DefenseTactics, GameManagement, OffenseTactics, Tactics, Team, TeamBox } from '../types';
import { GameSim, type SimTeamInput } from '../sim/engine';
import { Rng } from '../random';
import { cloneTactics } from '../sim/tactics';

/** A side as real games build it (morale/wear, rest, injury risk), so Lab games play like them. */
export type LabSide = SimTeamInput;

export interface TacticsPatch {
  offense?: Partial<OffenseTactics>;
  defense?: Partial<DefenseTactics>;
  manage?: Partial<GameManagement>;
}

export interface LabRequest {
  a: LabSide;
  b: LabSide;
  games: number;
  seed: number;
  /** Optional patch applied to side A's tactics. */
  patch?: TacticsPatch;
}

export interface ShotProfile {
  rimRate: number;
  threeRate: number;
  ftRate: number;
  efg: number;
  tov: number;
  orb: number;
}

export interface LabSummary {
  games: number;
  wins: number;
  winPct: number;
  ptsFor: number;
  ptsAgainst: number;
  ortg: number;
  drtg: number;
  net: number;
  netSE: number;
  pace: number;
  shot: ShotProfile;
  oppShot: ShotProfile;
  playTypes: Record<string, { freq: number; ppp: number }>;
  oppPlayTypes: Record<string, { freq: number; ppp: number }>;
  players: Record<number, { min: number; pts: number; usg: number; ts: number }>;
  /** Points per game each tactical effect earned each side: both can gain from the same one (each side's drop coverage conceding pull-ups). */
  impacts: Record<string, { us: number; them: number }>;
  /** Per-game point margins (side A minus side B), in seed order, for paired comparisons. */
  margins: number[];
}

/** Paired comparison of two lab runs that used the same seeds. */
export function pairedDelta(base: LabSummary, alt: LabSummary): { delta: number; se: number } {
  const n = Math.min(base.margins.length, alt.margins.length);
  if (!n) return { delta: 0, se: 0 };
  const diffs = Array.from({ length: n }, (_, i) => alt.margins[i] - base.margins[i]);
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const per100 = 100 / Math.max(1, (base.pace + alt.pace) / 2);
  return { delta: mean * per100, se: (sd / Math.sqrt(n)) * per100 };
}

export function applyPatch(t: Tactics, patch?: TacticsPatch): Tactics {
  const out = cloneTactics(t);
  if (!patch) return out;
  if (patch.offense) out.offense = { ...out.offense, ...patch.offense, actions: { ...out.offense.actions, ...(patch.offense.actions ?? {}) } };
  if (patch.defense) out.defense = { ...out.defense, ...patch.defense };
  if (patch.manage) out.manage = { ...out.manage, ...patch.manage };
  return out;
}

function profile(t: TeamBox, o: TeamBox, rimA: number): ShotProfile {
  const fga = Math.max(1, t.t.fga);
  return {
    rimRate: rimA / fga,
    threeRate: t.t.tpa / fga,
    ftRate: t.t.fta / fga,
    efg: (t.t.fgm + 0.5 * t.t.tpm) / fga,
    tov: t.t.tov / Math.max(1, t.poss),
    orb: t.t.orb / Math.max(1, t.t.orb + o.t.drb),
  };
}

/** onGame is called after every simulated game (progress reporting). */
export function runLab(req: LabRequest, onGame?: () => void): LabSummary {
  const teamA: Team = { ...req.a.team, tactics: applyPatch(req.a.team.tactics, req.patch) };
  const teamB: Team = req.b.team;
  const margins: number[] = [];
  let wins = 0;
  let pf = 0;
  let pa = 0;
  let possA = 0;
  let possB = 0;
  const sp: ShotProfile[] = [];
  const osp: ShotProfile[] = [];
  const pt: Record<string, { poss: number; pts: number }> = {};
  const opt: Record<string, { poss: number; pts: number }> = {};
  const pl: Record<number, { sec: number; pts: number; use: number; teamUse: number; fga: number; fta: number }> = {};
  const impacts: Record<string, { us: number; them: number }> = {};
  for (let g = 0; g < req.games; g++) {
    // each game gets its own seed so two configurations can be compared game by game
    const rng = new Rng((req.seed + Math.imul(g + 1, 2654435761)) >>> 0);
    const aHome = g % 2 === 0;
    const A = { ...req.a, team: teamA };
    const B = { ...req.b, team: teamB };
    const sim = new GameSim(aHome ? A : B, aHome ? B : A, { rng, type: 'regular', injuries: false });
    const res = sim.simToEnd();
    const a = aHome ? res.home : res.away;
    const b = aHome ? res.away : res.home;
    const aSide = aHome ? 0 : 1;
    if (a.pts > b.pts) wins++;
    margins.push(a.pts - b.pts);
    pf += a.pts;
    pa += b.pts;
    possA += a.poss;
    possB += b.poss;
    let rimA = 0;
    let orimA = 0;
    for (const rb of sim.rawBoxes()) {
      if (rb.tid !== teamA.tid) {
        orimA += rb.b.rimA;
        continue;
      }
      rimA += rb.b.rimA;
      const e = (pl[rb.pid] ??= { sec: 0, pts: 0, use: 0, teamUse: 0, fga: 0, fta: 0 });
      e.sec += rb.b.sec;
      e.pts += rb.b.pts;
      e.use += rb.b.fga + 0.44 * rb.b.fta + rb.b.tov;
      e.teamUse += rb.b.tFga + 0.44 * rb.b.tFta + rb.b.tTov;
      e.fga += rb.b.fga;
      e.fta += rb.b.fta;
    }
    sp.push(profile(a, b, rimA));
    osp.push(profile(b, a, orimA));
    for (const [k, v] of Object.entries(a.playTypes)) {
      const e = (pt[k] ??= { poss: 0, pts: 0 });
      e.poss += v.poss;
      e.pts += v.pts;
    }
    for (const [k, v] of Object.entries(b.playTypes)) {
      const e = (opt[k] ??= { poss: 0, pts: 0 });
      e.poss += v.poss;
      e.pts += v.pts;
    }
    for (const im of res.impacts ?? []) {
      const e = (impacts[im.key] ??= { us: 0, them: 0 });
      if (im.t === aSide) e.us += im.pts;
      else e.them += im.pts;
    }
    onGame?.();
  }
  const n = req.games;
  const mean = margins.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(margins.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, n - 1));
  const avgProfile = (arr: ShotProfile[]): ShotProfile => {
    const out: ShotProfile = { rimRate: 0, threeRate: 0, ftRate: 0, efg: 0, tov: 0, orb: 0 };
    for (const p of arr) for (const k of Object.keys(out) as (keyof ShotProfile)[]) out[k] += p[k] / arr.length;
    return out;
  };
  const freq = (m: Record<string, { poss: number; pts: number }>) => {
    const total = Object.values(m).reduce((x, y) => x + y.poss, 0) || 1;
    const out: Record<string, { freq: number; ppp: number }> = {};
    for (const [k, v] of Object.entries(m)) out[k] = { freq: v.poss / total, ppp: v.poss ? v.pts / v.poss : 0 };
    return out;
  };
  const playerOut = (m: typeof pl) => {
    const out: LabSummary['players'] = {};
    for (const [pid, e] of Object.entries(m)) {
      if (e.sec <= 0) continue;
      out[+pid] = { min: e.sec / 60 / n, pts: e.pts / n, usg: e.teamUse ? e.use / e.teamUse : 0, ts: e.fga + 0.44 * e.fta ? e.pts / (2 * (e.fga + 0.44 * e.fta)) : 0 };
    }
    return out;
  };
  const ortg = (pf / Math.max(1, possA)) * 100;
  const drtg = (pa / Math.max(1, possB)) * 100;
  for (const e of Object.values(impacts)) {
    e.us /= n;
    e.them /= n;
  }
  return {
    games: n,
    wins,
    winPct: wins / n,
    ptsFor: pf / n,
    ptsAgainst: pa / n,
    ortg,
    drtg,
    net: ortg - drtg,
    netSE: (sd / Math.sqrt(n)) * (100 / Math.max(1, (possA + possB) / (2 * n))),
    pace: (possA + possB) / (2 * n),
    shot: avgProfile(sp),
    oppShot: avgProfile(osp),
    playTypes: freq(pt),
    oppPlayTypes: freq(opt),
    players: playerOut(pl),
    impacts,
    margins,
  };
}

export interface Candidate {
  id: string;
  label: string;
  why: string;
  patch: TacticsPatch;
}

export interface CandidateResult {
  id: string;
  label: string;
  why: string;
  patch: TacticsPatch;
  net: number;
  delta: number;
  se: number;
  winPct: number;
}

/** Evaluate candidate patches against a baseline using common random numbers. */
export function evaluateCandidates(
  a: LabSide,
  b: LabSide,
  candidates: Candidate[],
  games: number,
  seed: number,
  onGame?: () => void,
): { base: LabSummary; results: CandidateResult[] } {
  const base = runLab({ a, b, games, seed }, onGame);
  const results = candidates.map((c) => {
    const r = runLab({ a, b, games, seed, patch: c.patch }, onGame);
    const { delta, se } = pairedDelta(base, r);
    return { id: c.id, label: c.label, why: c.why, patch: c.patch, net: r.net, delta, se, winPct: r.winPct };
  });
  results.sort((x, y) => y.delta - x.delta);
  return { base, results };
}
