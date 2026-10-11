// Automatic coaching: builds rotations and fits tactics to a roster. Used for AI teams,
// for the user's "Auto" buttons, and by the assistant coach to propose changes.

import type { OffRole, Player, Rotation, ShotFreedom, Tactics, Team } from '../types';
import { archetype, composites } from '../ratings';
import { applyDefPreset, applyOffPreset, cloneTactics, defaultTactics } from '../sim/tactics';
import { defaultMinutesByDepth } from '../sim/rotationPlan';
import { clamp } from '../random';

export interface LineupEval {
  score: number;
  spacing: number;
  creation: number;
  rimProtection: number;
  size: number;
  notes: string[];
}

export function evaluateLineup(ps: Player[]): LineupEval {
  const cs = ps.map((p) => composites(p.ratings));
  const ovr = ps.reduce((a, p) => a + p.ovr, 0);
  const spacing = cs.reduce((a, c) => a + c.spacing, 0) / ps.length;
  const creation = Math.max(...cs.map((c) => (c.pnrHandle + c.create) / 2));
  const rimProtection = Math.max(...cs.map((c) => c.rimProt));
  const size = ps.reduce((a, p) => a + p.ratings.hgt, 0) / ps.length;
  const bigs = ps.filter((p) => p.ratings.hgt >= 60).length;
  const handlers = cs.filter((c) => c.ballSec >= 55).length;
  const notes: string[] = [];
  let score = ovr;
  if (spacing < 40) {
    score -= (40 - spacing) * 0.35;
    notes.push('Cramped spacing');
  } else score += (spacing - 40) * 0.12;
  if (creation < 55) {
    score -= (55 - creation) * 0.4;
    notes.push('No real creator');
  }
  if (rimProtection < 50) {
    score -= (50 - rimProtection) * 0.25;
    notes.push('No rim protection');
  }
  if (bigs > 2) {
    score -= (bigs - 2) * 6;
    notes.push('Too many bigs');
  }
  if (bigs === 0) {
    score -= 4;
    notes.push('Very small');
  }
  if (handlers === 0) {
    score -= 6;
    notes.push('No secure ball handler');
  }
  return { score, spacing, creation, rimProtection, size, notes };
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

export function bestLineup(players: Player[], pool = 9): Player[] {
  const cands = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, pool);
  if (cands.length <= 5) return cands;
  let best = cands.slice(0, 5);
  let bs = -Infinity;
  for (const c of combos(cands, 5)) {
    const s = evaluateLineup(c).score;
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best;
}

/** Sort a lineup into a conventional 1-5 order for display. */
export function sortByPosition(ps: Player[]): Player[] {
  return [...ps].sort((a, b) => a.ratings.hgt - b.ratings.hgt + (b.ratings.hnd - a.ratings.hnd) * 0.15);
}

/** Minutes per game a player can sustain, from stamina (calibrated so real players match their real MPG). */
export function sustainableMinutes(p: Player): number {
  return clamp(19.5 + (p.ratings.end - 38) / 1.5, 12, 40);
}

export function autoRotation(players: Player[], prev?: Rotation): Rotation {
  const healthy = players.filter((p) => !p.injury || p.injury.gamesRemaining <= 0);
  const starters = sortByPosition(bestLineup(healthy));
  const bench = healthy.filter((p) => !starters.includes(p)).sort((a, b) => b.ovr - a.ovr);
  const injured = players.filter((p) => !healthy.includes(p)).sort((a, b) => b.ovr - a.ovr);
  const order = [...starters, ...bench, ...injured].map((p) => p.pid);
  // starter minutes follow quality, not position: the best starter gets the biggest share
  const depth = [...[...starters].sort((a, b) => b.ovr - a.ovr), ...bench];
  const base = defaultMinutesByDepth(depth.length);
  // stars play more, weak starters less: adjust by OVR relative to team
  const avgStarter = starters.reduce((a, p) => a + p.ovr, 0) / Math.max(1, starters.length);
  const want = depth.map((p, i) => {
    let m = base[i] ?? 0;
    if (i < 5) m += (p.ovr - avgStarter) * 0.3;
    if (i >= 5 && i < 9) m += (p.ovr - (depth[4]?.ovr ?? p.ovr)) * 0.4;
    return Math.max(0, m);
  });
  // stamina sets what a player can sustain; minutes he can't carry flow down the bench
  const caps = depth.map((p) => sustainableMinutes(p));
  let mins = want.map((m, i) => Math.min(m, caps[i]));
  for (let iter = 0; iter < 8; iter++) {
    const total = mins.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 240) < 0.5) break;
    if (total > 240) {
      mins = mins.map((m) => (m * 240) / total);
      break;
    }
    // grow everyone in the rotation with headroom, in proportion to their planned share
    const open = mins.map((m, i) => (i < 11 && m < caps[i] - 0.05 ? Math.max(m, i < 10 ? 4 : 0) : 0));
    const room = open.reduce((a, b) => a + b, 0);
    if (room <= 0) break;
    const f = (240 - total) / room;
    mins = mins.map((m, i) => (open[i] ? Math.min(caps[i], m + open[i] * f) : m));
  }
  const minutes: Record<number, number> = {};
  depth.forEach((p, i) => (minutes[p.pid] = Math.round(mins[i])));
  for (const p of injured) minutes[p.pid] = 0;
  const closers = sortByPosition(bestLineup(healthy, 8)).map((p) => p.pid);
  return {
    order,
    minutes,
    closers,
    restB2B: prev?.restB2B?.filter((pid) => players.some((p) => p.pid === pid)) ?? [],
    caps: prev?.caps ?? {},
    manual: false,
  };
}

export interface RosterProfile {
  starCreator: number; // best creator composite
  creatorGap: number; // star creator vs second
  shooting: number; // avg spacing of top 8
  passing: number; // avg passing of top 8
  bigPassing: number; // best passing among bigs
  postScoring: number;
  rimProtection: number;
  athleticism: number;
  size: number;
  perimeterD: number;
  depth: number; // ovr of 8th man relative to 1st
  steals: number;
  bigMobility: number;
}

export function rosterProfile(players: Player[]): RosterProfile {
  const top = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  const cs = top.map((p) => ({ p, c: composites(p.ratings) }));
  const creators = cs.map((x) => (x.c.pnrHandle + x.c.create) / 2).sort((a, b) => b - a);
  const bigs = cs.filter((x) => x.p.ratings.hgt >= 58);
  const avg = (f: (x: (typeof cs)[0]) => number) => cs.reduce((a, x) => a + f(x), 0) / Math.max(1, cs.length);
  return {
    starCreator: creators[0] ?? 50,
    creatorGap: (creators[0] ?? 50) - (creators[1] ?? 50),
    shooting: avg((x) => x.c.spacing),
    passing: avg((x) => x.c.passing),
    bigPassing: Math.max(0, ...bigs.map((x) => x.c.passing)),
    postScoring: Math.max(0, ...cs.map((x) => x.c.postScore)),
    rimProtection: Math.max(0, ...cs.map((x) => x.c.rimProt)),
    athleticism: avg((x) => (x.p.ratings.spd + x.p.ratings.ath) / 2),
    size: avg((x) => x.p.ratings.hgt),
    perimeterD: avg((x) => x.c.perDef),
    depth: (top[7]?.ovr ?? 60) - (top[0]?.ovr ?? 70),
    steals: avg((x) => x.c.steal),
    bigMobility: bigs.length ? Math.max(...bigs.map((x) => x.p.ratings.spd)) : 50,
  };
}

/** Score how well each offensive preset fits a roster (higher = better). */
export function offPresetFit(pr: RosterProfile): Record<string, number> {
  return {
    balanced: 50,
    helio: 40 + (pr.starCreator - 62) * 1.4 + pr.creatorGap * 0.8 + (pr.shooting - 50) * 0.4,
    fiveOut: 38 + (pr.shooting - 50) * 1.3 + (pr.passing - 50) * 0.8 - pr.creatorGap * 0.3,
    hub: 30 + (pr.bigPassing - 55) * 1.5 + (pr.passing - 50) * 0.4,
    paceSpace: 38 + (pr.athleticism - 52) * 1.1 + (pr.shooting - 50) * 0.6 + pr.depth * 0.2,
    grind: 32 + (pr.postScoring - 55) * 1.0 + (pr.size - 50) * 0.6 - (pr.shooting - 45) * 0.8,
  };
}

export function defPresetFit(pr: RosterProfile): Record<string, number> {
  return {
    drop: 45 + (pr.rimProtection - 60) * 1.2 - (pr.bigMobility - 45) * 0.2,
    switch: 35 + (pr.perimeterD - 52) * 1.0 + (pr.bigMobility - 45) * 0.9 - Math.abs(pr.size - 52) * 0.3,
    blitz: 34 + (pr.steals - 50) * 0.9 + (pr.athleticism - 52) * 0.6 + (pr.bigMobility - 45) * 0.3,
    ice: 42 + (pr.perimeterD - 52) * 0.6 + (pr.rimProtection - 55) * 0.4,
    hedge: 38 + (pr.bigMobility - 45) * 1.0 + (pr.perimeterD - 50) * 0.3,
    zone: 30 + (pr.size - 52) * 0.7 + (pr.rimProtection - 60) * 0.6 - (pr.perimeterD - 50) * 0.6,
    chaos: 22 + (pr.athleticism - 55) * 0.8 + (pr.steals - 52) * 0.8 + pr.depth * 0.3,
  };
}

const PHILOSOPHY_BIAS: Record<string, Record<string, number>> = {
  balanced: {},
  helio: { helio: 8 },
  fiveOut: { fiveOut: 8 },
  hub: { hub: 8 },
  paceSpace: { paceSpace: 8 },
  grind: { grind: 8 },
};

export function bestPreset(fits: Record<string, number>, bias?: Record<string, number>): string {
  let best = 'balanced';
  let bs = -Infinity;
  for (const [k, v] of Object.entries(fits)) {
    const s = v + (bias?.[k] ?? 0);
    if (s > bs) {
      bs = s;
      best = k;
    }
  }
  return best;
}

export function autoRoles(players: Player[]): { roles: Record<number, OffRole>; freedom: Record<number, ShotFreedom> } {
  const roles: Record<number, OffRole> = {};
  const freedom: Record<number, ShotFreedom> = {};
  // focal score: quality, plus how much of an offense this player has actually carried
  const focal = (p: Player) => p.ovr + 8 * Math.log(clamp(p.tend?.use ?? 1, 0.3, 4));
  const sorted = [...players].sort((a, b) => focal(b) - focal(a));
  let creators = 0;
  sorted.forEach((p, i) => {
    const c = composites(p.ratings);
    let role = archetype(p.ratings).role;
    // the top two options get the ball in scoring spots, whatever their position
    if (i < 2 && p.ovr >= 78 && (p.tend?.use ?? 1) >= 1.1) {
      if (role === 'roller' || role === 'stretch' || role === 'glue' || role === 'shooter' || role === 'slasher') role = c.postScore > c.create + 4 ? 'post' : 'scorer';
      // only an elite passer stays a pure hub; other star bigs attack
      else if (role === 'hub' && c.passing < 80) role = c.postScore > c.create + 4 ? 'post' : 'creator';
      else if (role === 'playmaker' && i === 0) role = 'creator';
    }
    if (role === 'creator') {
      creators++;
      if (creators > 1) role = 'scorer';
    }
    roles[p.pid] = role;
  });
  // green light for the top two options, limited for poor shooters
  sorted.forEach((p, i) => {
    const c = composites(p.ratings);
    if (i < 2 && p.ovr >= 75) freedom[p.pid] = 1;
    else if (c.c3 < 35 && c.midShot < 40 && c.create < 40) freedom[p.pid] = -1;
    else freedom[p.pid] = 0;
  });
  return { roles, freedom };
}

export function autoTactics(team: Team, players: Player[], keepManual = true): Tactics {
  if (keepManual && team.tactics.manual) return team.tactics;
  const healthy = players.filter((p) => !p.injury || p.injury.gamesRemaining <= 5);
  const pr = rosterProfile(healthy.length >= 8 ? healthy : players);
  const offBias = PHILOSOPHY_BIAS[team.coach.offPhilosophy] ?? {};
  const defBias: Record<string, number> = { [team.coach.defPhilosophy]: 7 };
  const off = bestPreset(offPresetFit(pr), offBias);
  const def = bestPreset(defPresetFit(pr), defBias);
  const base = team.tactics ? cloneTactics(team.tactics) : defaultTactics(off, def);
  base.offense = applyOffPreset(base.offense, off);
  base.defense = applyDefPreset(base.defense, def);
  base.offPreset = off;
  base.defPreset = def;
  const { roles, freedom } = autoRoles(players);
  base.offense.roles = roles;
  base.offense.freedom = freedom;
  base.offense.screeners = [];
  base.defense.matchups = {};
  base.defense.starPlan = 'none';
  base.defense.starTarget = null;
  base.manual = false;
  return base;
}
