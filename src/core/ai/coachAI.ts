// Automatic coaching: builds rotations and fits tactics to a roster. Used for AI teams,
// for the user's "Auto" buttons, and by the assistant coach to propose changes.

import type { DefRole, OffRole, OffShape, Player, Pos, Rotation, ShotFreedom, Tactics, Team } from '../types';
import { OFF_SHAPES } from '../types';
import { archetype, composites } from '../ratings';
import { applyDefPreset, applyOffPreset, cloneTactics, defaultTactics } from '../sim/tactics';
import { defRoleFits, miscast, roleFits } from '../analysis/system';
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

/** Spacing below which a starting five is called cramped: about the bottom fifth of real NBA starting fives. */
export const CRAMPED_SPACING = 32;

export function evaluateLineup(ps: Player[], cs = ps.map((p) => composites(p.ratings))): LineupEval {
  const ovr = ps.reduce((a, p) => a + p.ovr, 0);
  const spacing = cs.reduce((a, c) => a + c.spacing, 0) / ps.length;
  const creation = Math.max(...cs.map((c) => (c.pnrHandle + c.create) / 2));
  const rimProtection = Math.max(...cs.map((c) => c.rimProt));
  const size = ps.reduce((a, p) => a + p.ratings.hgt, 0) / ps.length;
  const bigs = ps.filter((p) => p.ratings.hgt >= 60).length;
  const handlers = cs.filter((c) => c.ballSec >= 55).length;
  const notes: string[] = [];
  let score = ovr;
  if (spacing < 40) score -= (40 - spacing) * 0.35;
  else score += (spacing - 40) * 0.12;
  if (spacing < CRAMPED_SPACING) notes.push('Cramped spacing');
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

export function bestLineup(players: Player[], pool = 9, roles?: Map<number, RoleMemory | null>, lean?: (p: Player) => number): Player[] {
  // candidates by what each brings to a lineup's score: quality, plus an incumbent's edge (and
  // the front office's lean toward youth, when it has one)
  const bonus = (p: Player) => startBonus(roles?.get(p.pid) ?? null) + (lean?.(p) ?? 0);
  const key = (p: Player) => p.ovr + bonus(p);
  const cands = [...players].sort((a, b) => key(b) - key(a)).slice(0, pool);
  if (cands.length <= 5) return cands;
  let best = cands.slice(0, 5);
  let bs = -Infinity;
  // composites once per candidate, not once per combination (AI teams re-plan before every game)
  const comp = new Map(cands.map((p) => [p, composites(p.ratings)]));
  for (const c of combos(cands, 5)) {
    let s = evaluateLineup(
      c,
      c.map((p) => comp.get(p)!),
    ).score;
    // incumbents: a player who started last season keeps an edge for the job
    if (roles || lean) for (const p of c) s += bonus(p);
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best;
}

const POS_ORDER: Record<Pos, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

/** Sort a lineup into a conventional 1-5 order for display: by position, then size and handling. */
export function sortByPosition(ps: Player[]): Player[] {
  return [...ps].sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || a.ratings.hgt - b.ratings.hgt + (b.ratings.hnd - a.ratings.hnd) * 0.15);
}

/**
 * Minutes per game a player can sustain, from stamina. Real players' stamina comes from the
 * minutes they actually played, so this sits a little above that to leave room for a bigger role.
 */
export function sustainableMinutes(p: Player): number {
  return clamp(22 + (p.ratings.end - 38) / 1.5, 14, 40);
}

// ---------------------------------------------------------------- role memory
//
// Real coaches hand out minutes by role as much as by talent: last season's regular-season
// minutes and starts are a strong prior for this season's (real minutes track stamina, i.e.
// role, far better than OVR). The memory counts once, in each player's minutes (and in who
// keeps a starting job), never in the pecking order those minutes come from. It fades: it
// carries at most 75% of a player's minutes, less when his OVR has moved a lot since or the
// role was a small one (real players under 12 minutes a game who stick around play about 6
// more the next season, almost regardless of last season's number), and none for players
// without a sample, so improved young players still play their way into the rotation and each
// simulated season's minutes become the next season's memory.

/** Most a remembered role can weigh in a player's minutes (the rest follows current quality). */
const ROLE_WEIGHT = 0.75;

export interface RoleMemory {
  /** Minutes per game in the role season. */
  mpg: number;
  /** Share of games started. */
  gs: number;
  /** Weight of the memory in the plan, 0..0.75. */
  w: number;
}

/**
 * The season a roster is in: ratings snapshots are taken when each season starts. Null for
 * players without history (fictional test benches), which turns role memory off.
 */
export function rosterSeason(players: Player[]): number | null {
  let s = -Infinity;
  for (const p of players) {
    const h = p.ratingsHistory?.[p.ratingsHistory.length - 1];
    if (h && h.season > s) s = h.season;
  }
  return Number.isFinite(s) ? s : null;
}

function regSeason(p: Player, season: number) {
  let gp = 0;
  let min = 0;
  let gs = 0;
  for (const st of p.stats) {
    if (st.season !== season || st.playoffs) continue;
    gp += st.gp;
    min += st.min;
    gs += st.gs;
  }
  return { gp, mpg: gp ? min / gp : 0, gs: gp ? gs / gp : 0 };
}

/** Last season's role (real seed seasons count), or the one before if he missed most of it. */
export function roleMemory(p: Player, season: number | null): RoleMemory | null {
  if (season === null) return null;
  let src = regSeason(p, season - 1);
  let roleSeason = season - 1;
  let rel = Math.min(1, src.gp / 45);
  if (src.gp < 20) {
    src = regSeason(p, season - 2);
    roleSeason = season - 2;
    rel = 0.6 * Math.min(1, src.gp / 45);
    if (src.gp < 20) {
      // no prior sample (rookies, long injuries): this season's minutes, once there is a sample
      src = regSeason(p, season);
      roleSeason = season;
      rel = 0.5 * Math.min(1, src.gp / 40);
      if (src.gp < 15) return null;
    }
  }
  // OVR then vs now: a player who has improved (or declined) a lot is judged on his current level
  const hist = p.ratingsHistory ?? [];
  const then = hist.find((h) => h.season >= roleSeason) ?? hist[hist.length - 1];
  const dOvr = then ? Math.abs(p.ovr - then.ovr) : 0;
  // a small role is mostly circumstance: full weight from 12 minutes, 40% at 7 or less
  const w = ROLE_WEIGHT * rel * clamp(1 - (dOvr - 2) / 10, 0.25, 1) * clamp((src.mpg - 4) / 8, 0.4, 1);
  return { mpg: src.mpg, gs: src.gs, w };
}

/** Ceiling for planned minutes: real heavy-minute starters top out around 37-38. */
const MAX_PLAN = 38;

/** Incumbent starters keep an edge for the job (worth ~7 OVR for a full-time starter). */
function startBonus(r: RoleMemory | null): number {
  return r ? (7 * r.w * r.gs) / ROLE_WEIGHT : 0;
}

/**
 * A remembered role as healthy-night minutes. Minutes per game played include the nights
 * teammates sat, so a 20-minute bench role is about 16 minutes when everyone is available,
 * while heavy-minute players play a little under their plan (fouls, blowouts): 34 a game takes
 * a 37-minute plan. Fitted on simulated seasons; it puts memory on the same scale as the
 * depth-chart minutes it blends with, so players without a memory aren't squeezed twice.
 */
function healthyMinutes(mpg: number): number {
  return clamp(1.5 * mpg - 14, 0, MAX_PLAN);
}

/**
 * The fewest minutes a planned reserve plays: a coach doesn't plan a two-minute stint for his 12th
 * man (he plays in blowouts and when others are out), so smaller shares go to the rotation.
 */
const MIN_STINT = 6;

/**
 * Minutes in depth order with the reserves under MIN_STINT taken out of the plan, while nine or more
 * still play: their minutes go to the regulars with room under their caps, reserves first.
 */
function trimRotation(mins: number[], caps: number[]): number[] {
  const out = [...mins];
  if (out.filter((m) => m >= MIN_STINT).length < 9) return out;
  const small = out
    .map((_, i) => i)
    .filter((i) => i >= 5 && out[i] > 0 && out[i] < MIN_STINT)
    .sort((a, b) => out[a] - out[b]);
  for (const i of small) {
    let give = out[i];
    const takers = out.map((_, j) => j).filter((j) => j !== i && out[j] >= MIN_STINT && out[j] < caps[j] - 0.05);
    if (takers.reduce((a, j) => a + caps[j] - out[j], 0) < give) continue;
    out[i] = 0;
    for (let it = 0; it < 6 && give > 0.01; it++) {
      const open = takers.filter((j) => out[j] < caps[j] - 0.05);
      const w = open.map((j) => (caps[j] - out[j]) * (j >= 5 ? 2 : 1));
      const sw = w.reduce((a, b) => a + b, 0);
      if (sw <= 0) break;
      let placed = 0;
      open.forEach((j, k) => {
        const add = Math.min(caps[j] - out[j], (give * w[k]) / sw);
        out[j] += add;
        placed += add;
      });
      give -= placed;
    }
  }
  return out;
}

/** The fewest minutes a starter plays when the reserves have them to give (stamina and hard caps allowing). */
const STARTER_FLOOR = 20;

/** How much worse (in lineup score) a five may be for its starters to be the players who play the most. */
const STARTER_SWAP_TOL = 3;

/**
 * The starting five with a starter the plan gives a bench role (under 22 minutes) swapped for a
 * reserve who plays at least 8 more (or any reserve who plays a starter's 34), when the five that
 * results is about as good: a coach doesn't start a 14-minute player over his 28-minute sixth man
 * unless the five needs him.
 */
function startersByMinutes(starters: Player[], bench: Player[], minutes: Record<number, number>): Player[] {
  let five = [...starters];
  for (let k = 0; k < 2; k++) {
    const low = [...five].sort((a, b) => minutes[a.pid] - minutes[b.pid])[0];
    if (!low) break;
    const cur = evaluateLineup(five).score;
    let best: Player | undefined;
    let bs = -Infinity;
    for (const b of bench) {
      if (five.includes(b) || minutes[b.pid] < minutes[low.pid] + 8 || (minutes[low.pid] >= 22 && minutes[b.pid] < 34)) continue;
      const s = evaluateLineup(five.map((p) => (p === low ? b : p))).score;
      if (s > bs) {
        bs = s;
        best = b;
      }
    }
    if (!best || bs < cur - STARTER_SWAP_TOL) break;
    const swapIn = best;
    five = five.map((p) => (p === low ? swapIn : p));
  }
  return five.every((p, i) => p === starters[i]) ? starters : sortByPosition(five);
}

/**
 * A rotation for the roster. `lean` (OVR points by player) is a front office's lean toward the
 * players it is building around: a rebuilding team out of the race after the deadline plays its
 * young players over its veterans (see youthLean in league/games.ts). It counts as quality in the
 * pecking order and the starting five, and last season's roles count for less. `maxMinutes` holds
 * everyone's plan under it (the minutes go down the bench).
 */
export function autoRotation(players: Player[], prev?: Rotation, opts: { lean?: (p: Player) => number; maxMinutes?: number } = {}): Rotation {
  const { lean, maxMinutes = MAX_PLAN } = opts;
  const healthy = players.filter((p) => !p.injury || p.injury.gamesRemaining <= 0);
  const season = rosterSeason(players);
  const roles = new Map(
    players.map((p) => {
      const r = roleMemory(p, season);
      // a youth movement is a new direction: the old pecking order counts for a third as much
      return [p.pid, r && lean ? { ...r, w: r.w / 3 } : r];
    }),
  );
  let starters = sortByPosition(bestLineup(healthy, 9, roles, lean));
  const q = (p: Player) => p.ovr + (lean?.(p) ?? 0);
  const byOvr = (a: Player, b: Player) => q(b) - q(a);
  // the pecking order is quality alone (starter minutes follow it too, not position); memory
  // comes in below, once
  let depth = [...[...starters].sort(byOvr), ...healthy.filter((p) => !starters.includes(p)).sort(byOvr)];
  const base = defaultMinutesByDepth(depth.length);
  // stars play more, weak starters less: adjust by OVR relative to team
  const avgStarter = starters.reduce((a, p) => a + q(p), 0) / Math.max(1, starters.length);
  let talent = depth.map((p, i) => {
    let m = base[i] ?? 0;
    if (i < 5) m += (q(p) - avgStarter) * 0.3;
    if (i >= 5 && i < 9) m += (q(p) - (depth[4] ? q(depth[4]) : q(p))) * 0.4;
    return Math.max(0, m);
  });
  // role memory: blend toward last season's minutes, as healthy-night minutes
  let want = depth.map((p, i) => {
    const r = roles.get(p.pid);
    return r ? (1 - r.w) * talent[i] + r.w * healthyMinutes(r.mpg) : talent[i];
  });
  // the bench lines up by those minutes, so the deep bench (first to give up time) is the
  // players with the least claim on it
  const benchIx = depth
    .map((_, i) => i)
    .slice(5)
    .sort((a, b) => want[b] - want[a]);
  const reorder = <T>(xs: T[]) => [...xs.slice(0, 5), ...benchIx.map((i) => xs[i])];
  depth = reorder(depth);
  talent = reorder(talent);
  want = reorder(want);
  // hard caps (load management) hold: the minutes go to the others; players who left take theirs along
  const hardCaps: Rotation['caps'] = {};
  for (const p of players) if (prev?.caps?.[p.pid]) hardCaps[p.pid] = prev.caps[p.pid];
  // six or fewer healthy can't fill a game at 38 apiece: the ceiling rises to what does (48 at most)
  const most = clamp(240 / Math.max(1, depth.length), Math.min(MAX_PLAN, maxMinutes), 48);
  const ceiling = depth.map((p) => Math.min(most, hardCaps[p.pid] ?? most));
  // stamina sets what a player can sustain; a proven heavy-minute role counts too
  const caps = depth.map((p, i) => {
    const r = roles.get(p.pid);
    return Math.min(ceiling[i], Math.max(sustainableMinutes(p), r && r.w >= 0.2 ? Math.max(r.mpg + 2, healthyMinutes(r.mpg)) : 0));
  });
  let mins = want.map((m, i) => Math.min(m, caps[i]));
  let total = mins.reduce((a, b) => a + b, 0);
  if (total > 240) {
    // too many claims on the minutes: remembered minutes beyond a player's talent share go
    // first, the deeper on the bench the more (nobody drops below that share or his own claim,
    // whichever is less, so a newcomer's share isn't squeezed twice)
    const floor = mins.map((m, i) => Math.min(m, talent[i]));
    const kept = (lam: number) => mins.map((m, i) => (i < 5 ? m : floor[i] + (m - floor[i]) * clamp(1 - lam * (i - 4), 0, 1)));
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (kept(mid).reduce((a, b) => a + b, 0) > 240) lo = mid;
      else hi = mid;
    }
    mins = kept(hi);
    total = mins.reduce((a, b) => a + b, 0);
    // then the bench gives up its shares, the deep bench most (each keeps at least half), then
    // everyone
    for (let pass = 0; pass < 3 && total > 240.5; pass++) {
      const wts = mins.map((m, i) => (i >= 5 && m > want[i] / 2 + 0.05 ? m * (1 + 0.15 * (i - 5)) : 0));
      const sw = wts.reduce((a, b) => a + b, 0);
      if (sw <= 0) break;
      const excess = total - 240;
      mins = mins.map((m, i) => (wts[i] ? Math.max(Math.min(m, want[i]) / 2, m - (excess * wts[i]) / sw) : m));
      total = mins.reduce((a, b) => a + b, 0);
    }
    if (total > 240) mins = mins.map((m) => (m * 240) / total);
  }
  for (let iter = 0; iter < 12; iter++) {
    total = mins.reduce((a, b) => a + b, 0);
    if (total >= 239.5) break;
    // grow the rotation with headroom in proportion to planned share; when the regulars are
    // capped (several players out), reach further down the bench before stretching anyone
    let open = mins.map((m, i) => (i < 10 && m < caps[i] - 0.05 ? Math.max(m, 4) : 0));
    if (!open.some((x) => x > 0)) open = mins.map((m, i) => (i < 13 && m < Math.min(caps[i], 16) - 0.05 ? Math.max(m, 6) : 0));
    if (!open.some((x) => x > 0)) {
      // everyone is at his stamina cap: stretch the regulars toward the ceiling
      for (let i = 0; i < caps.length; i++) caps[i] = Math.min(ceiling[i], caps[i] + 3);
      open = mins.map((m, i) => (i < 10 && m < caps[i] - 0.05 ? Math.max(m, 4) : 0));
      if (!open.some((x) => x > 0)) break;
    }
    const room = open.reduce((a, b) => a + b, 0);
    const f = (240 - total) / room;
    mins = mins.map((m, i) => (open[i] ? Math.min(caps[i], m + open[i] * f) : m));
  }
  mins = trimRotation(mins, caps);
  const minutes: Record<number, number> = {};
  depth.forEach((p, i) => (minutes[p.pid] = Math.round(mins[i])));
  const injured = players.filter((p) => !healthy.includes(p)).sort(byOvr);
  for (const p of injured) minutes[p.pid] = 0;
  starters = startersByMinutes(starters, depth.slice(5), minutes);
  const five = new Set(starters);
  // a starter the five still needs plays a starter's minutes, from the reserves who play the most
  const capOf = new Map(depth.map((p, i) => [p.pid, caps[i]]));
  for (const s of starters) {
    let short = Math.min(STARTER_FLOOR, Math.floor(capOf.get(s.pid) ?? STARTER_FLOOR)) - minutes[s.pid];
    for (const b of depth.filter((p) => !five.has(p)).sort((x, y) => minutes[y.pid] - minutes[x.pid])) {
      if (short <= 0) break;
      const give = Math.min(short, minutes[b.pid] - STARTER_FLOOR);
      if (give <= 0) break;
      minutes[b.pid] -= give;
      minutes[s.pid] += give;
      short -= give;
    }
  }
  const bench = depth.filter((p) => !five.has(p)).sort((a, b) => minutes[b.pid] - minutes[a.pid]);
  const order = [...starters, ...bench, ...injured].map((p) => p.pid);
  const closers = sortByPosition(bestLineup(healthy, 8, roles, lean)).map((p) => p.pid);
  return {
    order,
    minutes,
    closers,
    restB2B: prev?.restB2B?.filter((pid) => players.some((p) => p.pid === pid)) ?? [],
    caps: hardCaps,
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
  /**
   * The players behind each number, the one who drives it first: the best at it for a best-of (the
   * two top creators for the gap; the 8th man, then the 1st, for depth), and the whole top eight,
   * best first, for an average.
   */
  drivers: Record<ProfileKey, number[]>;
}

/** The roster qualities playbook fits are built from. */
export type ProfileKey = Exclude<keyof RosterProfile, 'drivers'>;

export function rosterProfile(players: Player[]): RosterProfile {
  const top = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  const cs = top.map((p) => ({ p, c: composites(p.ratings) }));
  type X = (typeof cs)[0];
  const creation = (x: X) => (x.c.pnrHandle + x.c.create) / 2;
  const creators = cs.map(creation).sort((a, b) => b - a);
  const bigs = cs.filter((x) => x.p.ratings.hgt >= 58);
  const avg = (f: (x: X) => number) => cs.reduce((a, x) => a + f(x), 0) / Math.max(1, cs.length);
  // players, best first by a quality
  const by = (xs: X[], f: (x: X) => number) => [...xs].sort((a, b) => f(b) - f(a)).map((x) => x.p.pid);
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
    drivers: {
      starCreator: by(cs, creation).slice(0, 1),
      creatorGap: by(cs, creation).slice(0, 2),
      shooting: by(cs, (x) => x.c.spacing),
      passing: by(cs, (x) => x.c.passing),
      bigPassing: by(bigs, (x) => x.c.passing).slice(0, 1),
      postScoring: by(cs, (x) => x.c.postScore).slice(0, 1),
      rimProtection: by(cs, (x) => x.c.rimProt).slice(0, 1),
      athleticism: by(cs, (x) => (x.p.ratings.spd + x.p.ratings.ath) / 2),
      size: by(cs, (x) => x.p.ratings.hgt),
      perimeterD: by(cs, (x) => x.c.perDef),
      depth: [top[7], top[0]].filter((p) => p).map((p) => p.pid),
      steals: by(cs, (x) => x.c.steal),
      bigMobility: by(bigs, (x) => x.p.ratings.spd).slice(0, 1),
    },
  };
}

/** One part of a playbook's fit: its starting score, or what one roster quality adds (or takes away). */
export interface FitTerm {
  /** The roster quality behind it; 'base' is the playbook's starting score. */
  key: ProfileKey | 'base';
  /** Fit points it adds (negative: takes away). A fit is exactly the sum of its terms. */
  value: number;
  /** Fit points per point more of the quality, from where it is now (0 for the base). */
  weight: number;
}

/**
 * A playbook's fit model: its starting score and, for each roster quality it leans on, fit points per
 * rating point of it from the level where it's neutral. One fit point is a tenth of a point per 100
 * possessions: the models are fitted to what each playbook was worth in paired engine games over 150
 * real and fictional rosters (healthy and missing their two best players), as a difference from the
 * roster's average playbook, so a fit says what the engine rewards and a gap of 10 is a point per 100.
 */
interface FitModel {
  base: number;
  terms: [key: ProfileKey, weight: number, neutral: number][];
}

const termsOf = (m: FitModel, pr: RosterProfile): FitTerm[] => [
  { key: 'base', value: m.base, weight: 0 },
  ...m.terms.map(([key, weight, neutral]): FitTerm => ({ key, value: (pr[key] - neutral) * weight, weight })),
];
const fitSum = (terms: Record<string, FitTerm[]>): Record<string, number> => Object.fromEntries(Object.entries(terms).map(([k, ts]) => [k, ts.reduce((a, x) => a + x.value, 0)]));

/** The offensive playbooks' fit models (see FitModel). */
const OFF_FIT: Record<string, FitModel> = {
  balanced: { base: 51.7, terms: [] },
  helio: { base: 49.4, terms: [['starCreator', 0.31, 64]] },
  fiveOut: {
    base: 52.4,
    terms: [
      ['size', -0.66, 47],
      ['creatorGap', -0.29, 5],
    ],
  },
  hub: {
    base: 53.7,
    terms: [
      ['starCreator', -0.26, 64],
      ['passing', 0.22, 52],
      ['shooting', 0.12, 33],
    ],
  },
  paceSpace: {
    base: 51.4,
    terms: [
      ['perimeterD', 0.52, 52],
      ['passing', 0.27, 52],
    ],
  },
  grind: { base: 41.3, terms: [['size', 0.58, 47]] },
};

/** The defensive playbooks' fit models (see FitModel). */
const DEF_FIT: Record<string, FitModel> = {
  drop: { base: 56.4, terms: [['steals', -0.61, 50]] },
  switch: { base: 53.9, terms: [['steals', -0.7, 50]] },
  blitz: { base: 50.3, terms: [['steals', 1.06, 50]] },
  ice: { base: 56.9, terms: [['steals', -0.49, 50]] },
  hedge: {
    base: 53.2,
    terms: [
      ['size', -0.21, 47],
      ['rimProtection', 0.11, 67],
      ['steals', -0.15, 50],
    ],
  },
  zone: { base: 43, terms: [['steals', -0.62, 50]] },
  chaos: {
    base: 36.4,
    terms: [
      ['steals', 1.44, 50],
      ['depth', 0.47, -14],
      ['athleticism', 0.34, 54],
    ],
  },
};

const modelTerms = (models: Record<string, FitModel>, pr: RosterProfile) => Object.fromEntries(Object.entries(models).map(([k, m]) => [k, termsOf(m, pr)]));

/** What each offensive preset's fit is made of. */
export function offPresetTerms(pr: RosterProfile): Record<string, FitTerm[]> {
  return modelTerms(OFF_FIT, pr);
}

/** What each defensive preset's fit is made of. */
export function defPresetTerms(pr: RosterProfile): Record<string, FitTerm[]> {
  return modelTerms(DEF_FIT, pr);
}

/** Score how well each offensive preset fits a roster (higher = better): the sum of its terms. */
export function offPresetFit(pr: RosterProfile): Record<string, number> {
  return fitSum(offPresetTerms(pr));
}

export function defPresetFit(pr: RosterProfile): Record<string, number> {
  return fitSum(defPresetTerms(pr));
}

/**
 * A coach's lean toward his own playbooks, in fit points: enough to pick his among playbooks about as
 * good for the roster (a few tenths of a point per 100), never one the roster plays clearly worse.
 */
const PHILOSOPHY_LEAN = 3;

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
  // nobody stays miscast (two stars short of his best role, as the Tactics screen marks it), except
  // the lead creator, and not into a second creator's role
  for (const p of sorted) {
    if (roles[p.pid] === 'creator') continue;
    const better = miscast(roleFits(p), roles[p.pid]);
    if (!better || (better === 'creator' && creators++ > 0)) continue;
    roles[p.pid] = better;
  }
  // green light for the top two options, limited for poor shooters
  sorted.forEach((p, i) => {
    const c = composites(p.ratings);
    if (i < 2 && p.ovr >= 75) freedom[p.pid] = 1;
    else if (c.c3 < 35 && c.midShot < 40 && c.create < 40) freedom[p.pid] = -1;
    else freedom[p.pid] = 0;
  });
  return { roles, freedom };
}

/** The five a shape is fitted to, and the rest of the top eight: the rotation's starters (the best five by OVR without one). */
function shapeUnits(players: Player[], order?: number[]): { five: Player[]; eight: Player[] } {
  const byId = new Map(players.map((p) => [p.pid, p]));
  const ranked = [...(order ?? []).map((pid) => byId.get(pid)).filter((p): p is Player => !!p && !p.injury), ...[...players].sort((a, b) => b.ovr - a.ovr)];
  const seen = new Set<number>();
  const eight: Player[] = [];
  for (const p of ranked) {
    if (seen.has(p.pid) || eight.length >= 8) continue;
    seen.add(p.pid);
    eight.push(p);
  }
  return { five: eight.slice(0, 5), eight };
}

/**
 * How well each shape fits a roster, in fit points against four-out, one-in (a tenth of a point per
 * 100 possessions, as the playbooks' fits), from what each shape does in the engine (K.shape) for its
 * starting five: five-out's open paint, worth less for each non-shooter in the five, against the
 * offensive boards it gives up; the double post's two bigs on the glass and finishing inside, against
 * the crowded paint (more so when they're shooters, wasted inside); horns' handoffs from a passing
 * elbow big and its fewer turnovers. Each shape's value at the league's average roster is its measured
 * one (scripts/system-impact.ts: about −0.1, +0.2 and +0.3 per 100); real rosters vary less than the
 * games' noise, so the slopes come from rosters built to the extremes (all shooters, two post bigs, a
 * non-shooting center).
 */
export function shapeFits(players: Player[], tactics?: Pick<Tactics, 'offense'>, order?: number[]): Record<OffShape, number> {
  const { five } = shapeUnits(players, order);
  const cs = five.map((p) => composites(p.ratings));
  const n = Math.max(1, cs.length);
  const exposed = cs.reduce((a, c) => a + Math.max(0, 40 - c.spacing) / 40, 0);
  const orb = cs.reduce((a, c) => a + c.orb, 0) / n;
  const bigs = five
    .map((p, i) => ({ p, c: cs[i] }))
    .sort((a, b) => b.p.ratings.hgt - a.p.ratings.hgt || b.c.orb - a.c.orb)
    .slice(0, 2);
  const bigOrb = bigs.reduce((a, x) => a + x.c.orb, 0) / Math.max(1, bigs.length);
  const waste = bigs.reduce((a, x) => a + Math.max(0, x.c.spacing - 25), 0);
  const bigPass = Math.max(0, ...bigs.map((x) => x.c.passing));
  const a = tactics?.offense.actions;
  const lean = (k: 'pnr' | 'handoff' | 'motion' | 'post') => (a ? (a[k] - 50) / 50 : 0);
  const drives = tactics ? (tactics.offense.rimAttack - 50) / 50 : 0;
  return {
    fourOut: 0,
    fiveOut: 20 * (1 - 0.75 * exposed) * (1 + 0.3 * drives) - 9 * (orb / 46.5) - 3 * lean('post'),
    horns: 1.5 + 0.15 * (bigPass - 55) + 2 * lean('handoff') + 1 * lean('pnr') - 2 * lean('motion'),
    twoIn: 8 * (bigOrb / 50) + 2 - 9.5 * (1 + 0.3 * drives) - 0.1 * waste + 3 * lean('post'),
  };
}

/** Fit points another shape has to win by before the staff leaves four-out, the shape every player knows. */
const SHAPE_EDGE = 4;

/** The shape the staff would play with this roster: the best fit, if it beats four-out by SHAPE_EDGE. */
export function autoShape(players: Player[], tactics?: Pick<Tactics, 'offense'>, order?: number[]): OffShape {
  const fits = shapeFits(players, tactics, order);
  const best = OFF_SHAPES.reduce((b, s) => (fits[s] > fits[b] ? s : b), 'fourOut' as OffShape);
  return fits[best] >= SHAPE_EDGE ? best : 'fourOut';
}

/** A defensive role fit the staff gives the role at, at least. */
const DEF_ROLE_MIN = 66;

/**
 * The staff's out-of-possession roles for the rotation's top ten: a point-of-attack stopper, a wing
 * stopper and a rim anchor among the starters where one suits it well (each at most once), the same
 * for the bench unit, and everyone else a position defender.
 */
export function autoDefRoles(players: Player[], rotation?: Pick<Rotation, 'order'>): Record<number, DefRole> {
  const byId = new Map(players.map((p) => [p.pid, p]));
  const order = (rotation?.order ?? []).map((pid) => byId.get(pid)).filter((p): p is Player => !!p);
  const ranked = order.length >= 5 ? order : [...players].sort((a, b) => b.ovr - a.ovr);
  const out: Record<number, DefRole> = {};
  const unit = (ps: Player[]) => {
    const fits = new Map(ps.map((p) => [p.pid, defRoleFits(p)]));
    for (const role of ['anchor', 'poa', 'stopper'] as const) {
      const pick = ps.filter((p) => !out[p.pid]).sort((a, b) => fits.get(b.pid)![role] - fits.get(a.pid)![role])[0];
      if (pick && fits.get(pick.pid)![role] >= DEF_ROLE_MIN) out[pick.pid] = role;
    }
  };
  unit(ranked.slice(0, 5));
  unit(ranked.slice(5, 10));
  return out;
}

/** The players a playbook is fitted to: a knock of five games or fewer doesn't swing the fits, nor do injuries that leave fewer than eight. */
export function fitRoster(players: Player[]): Player[] {
  const healthy = players.filter((p) => !p.injury || p.injury.gamesRemaining <= 5);
  return healthy.length >= 8 ? healthy : players;
}

/** Fit scores as the Tactics screen shows them: 100 for the playbook that fits best, 45 for the worst. */
export function fitScale(fits: Record<string, number>): (k: string) => number {
  const vals = Object.values(fits);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return (k: string) => Math.round(45 + ((fits[k] - min) / Math.max(1, max - min)) * 55);
}

/** Each preset's fit for this roster and coach, his philosophy's lean included. */
export function presetScores(team: Team, players: Player[]): { off: Record<string, number>; def: Record<string, number> } {
  const pr = rosterProfile(fitRoster(players));
  const lean = (fits: Record<string, number>, mine: string) => Object.fromEntries(Object.entries(fits).map(([k, v]) => [k, v + (k === mine ? PHILOSOPHY_LEAN : 0)]));
  return { off: lean(offPresetFit(pr), team.coach.offPhilosophy), def: lean(defPresetFit(pr), team.coach.defPhilosophy) };
}

/** Offensive and defensive presets ranked by fit for this roster and coach, best first. */
export function rankedPresets(team: Team, players: Player[]): { off: string[]; def: string[] } {
  const sc = presetScores(team, players);
  const rank = (fits: Record<string, number>) =>
    Object.entries(fits)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  return { off: rank(sc.off), def: rank(sc.def) };
}

/**
 * In season, how much better (in fit points, a tenth of a point per 100 each) another playbook or
 * shape has to fit before the staff changes to it: a new system costs familiarity for weeks (see
 * src/core/sim/familiarity.ts), so a marginal gain isn't worth relearning for.
 */
export const STICK = { preset: 8, shape: 6 };

/**
 * The staff's tactics for a roster: the best-fitting playbooks, roles and shot freedom at both ends,
 * and the shape. `sticky` (in season): the team keeps the playbooks and shape it runs unless another
 * fits better by STICK.
 */
export function autoTactics(team: Team, players: Player[], keepManual = true, opts: { sticky?: boolean } = {}): Tactics {
  if (keepManual && team.tactics.manual) return team.tactics;
  const sc = presetScores(team, players);
  const best = (fits: Record<string, number>, cur: string | undefined) => {
    const top = Object.entries(fits).sort((a, b) => b[1] - a[1])[0][0];
    return opts.sticky && cur && fits[cur] !== undefined && fits[top] - fits[cur] < STICK.preset ? cur : top;
  };
  const off = best(sc.off, team.tactics?.offPreset);
  const def = best(sc.def, team.tactics?.defPreset);
  const base = team.tactics ? cloneTactics(team.tactics) : defaultTactics(off, def);
  base.offense = applyOffPreset(base.offense, off);
  base.defense = applyDefPreset(base.defense, def);
  base.offPreset = off;
  base.defPreset = def;
  const { roles, freedom } = autoRoles(players);
  base.offense.roles = roles;
  base.offense.freedom = freedom;
  base.offense.screeners = [];
  delete base.offense.glass;
  const healthy = fitRoster(players);
  const fits = shapeFits(healthy, base, team.rotation?.order);
  const cur = team.tactics?.offense.shape ?? 'fourOut';
  const shape = autoShape(healthy, base, team.rotation?.order);
  base.offense.shape = opts.sticky && fits[shape] - fits[cur] < STICK.shape ? cur : shape;
  if (base.offense.shape === 'fourOut') delete base.offense.shape;
  const droles = autoDefRoles(healthy, team.rotation);
  if (Object.keys(droles).length) base.defense.roles = droles;
  else delete base.defense.roles;
  base.defense.matchups = {};
  base.defense.starPlan = 'none';
  base.defense.starTarget = null;
  base.manual = false;
  return base;
}
