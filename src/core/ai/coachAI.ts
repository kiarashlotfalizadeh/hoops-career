// Automatic coaching: builds rotations and fits tactics to a roster. Used for AI teams,
// for the user's "Auto" buttons, and by the assistant coach to propose changes.

import type { DefRole, OffRole, OffShape, Player, Pos, Rotation, ShotFreedom, Tactics, Team } from '../types';
import { OFF_SHAPES } from '../types';
import { archetype, composites } from '../ratings';
import { applyDefPreset, applyOffPreset, cloneTactics, defaultTactics } from '../sim/tactics';
import { defRoleFits, fitStars, miscast, roleFits } from '../analysis/system';
import { HANDLER_ROLES } from '../sim/links';
import { defaultMinutesByDepth } from '../sim/rotationPlan';
import { clamp } from '../random';
import { playerAge } from '../playerGen';

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

/**
 * Most minutes a coach plans for a veteran: 36 at 34, a minute less each year after, 30 from 40.
 * Real stars play fewer minutes every season from their mid-thirties whatever their stamina says
 * (Curry 32 at 37, Paul 28 at 39, Conley 25 at 37), so at 36-38 the plan is 32-34 and they play
 * 30-33 (heavy-minute players play a little under their plan). A proven heavier role holds a minute
 * under what he played last season (Durant's 36 at 37, James's 35 at 39), so it fades a season at a
 * time rather than all at once.
 */
export function veteranCeiling(age: number, role: RoleMemory | null): number {
  if (age < VETERAN_AGE) return MAX_PLAN;
  const byAge = Math.max(VETERAN_FLOOR, 36 - (age - VETERAN_AGE));
  return Math.min(MAX_PLAN, Math.max(byAge, role && role.w >= 0.2 ? role.mpg - 1 : 0));
}

/** The age a coach starts holding a player's minutes down (see veteranCeiling). */
const VETERAN_AGE = 34;
/** The veteran ceiling's lowest step: a 40-year-old who still makes the rotation gets 30. */
const VETERAN_FLOOR = 30;

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

/**
 * The fewest minutes a team's two best healthy players play: real teams' top two average about 34
 * and 32, and a plan spread flat (role memory from a small role last season, a roster without a
 * clear star) had them at 27.
 */
const STAR_FLOOR = 33;

/**
 * Minutes in depth order with the two best healthy players (by `q`, the front office's lean
 * included) raised to STAR_FLOOR, their `ceiling` allowing (a veteran's age, a hard cap; a
 * veteran a youth movement is phasing out keeps its lower ceiling, while its two best young players
 * don't: the lean goes down the bench, not out of their minutes). The minutes come from the
 * reserves, the most from those who play the most, then from the other starters.
 */
function starMinutes(mins: number[], depth: Player[], q: (p: Player) => number, ceiling: (p: Player) => number): number[] {
  const out = [...mins];
  const top = depth
    .map((_, i) => i)
    .sort((a, b) => q(depth[b]) - q(depth[a]))
    .slice(0, 2);
  for (const i of top) {
    let short = Math.min(STAR_FLOOR, ceiling(depth[i])) - out[i];
    for (const from of [(j: number) => j >= 5, (j: number) => j < 5]) {
      const givers = out.map((_, j) => j).filter((j) => !top.includes(j) && from(j) && out[j] > 0);
      const pool = givers.reduce((a, j) => a + out[j], 0);
      if (short <= 0 || pool <= 0) continue;
      const take = Math.min(short, pool / 2);
      for (const j of givers) out[j] -= (take * out[j]) / pool;
      out[i] += take;
      short -= take;
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
  // (and veterans play fewer, unless there aren't the players to give the minutes to)
  const fill = 240 / Math.max(1, depth.length);
  const vet = (p: Player) => (season === null ? most : Math.max(fill, veteranCeiling(playerAge(p, season), roles.get(p.pid) ?? null)));
  const ceiling = depth.map((p) => Math.min(most, vet(p), hardCaps[p.pid] ?? most));
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
  mins = starMinutes(mins, depth, q, (p) => Math.min(MAX_PLAN, vet(p), hardCaps[p.pid] ?? MAX_PLAN, (lean?.(p) ?? 0) < 0 ? maxMinutes : MAX_PLAN));
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
 * rating point of it from the level where it's neutral (about the average roster's). One fit point is a
 * tenth of a point a game: the models are fitted (2026-10-26, scripts/style-fit.ts, from
 * scripts/style-check.ts's runs) to what each playbook was worth in paired engine games, fully drilled,
 * against every other team, as a difference from the roster's average playbook: the real league's 30
 * rosters (696 games each over four seed sets) and two fictional leagues' 60 (348 each), the
 * qualities' weights shared and the start the real league's (a fictional league's rosters shoot less,
 * and its starts differ: Five-Out, Pace & Space and Drop are worth more there), each term picked one at
 * a time while it predicts rosters left out better, from the qualities a playbook's style leans on. So a
 * fit is the staff's read of what the engine rewards, and a gap of 10 is a point a game. Over the real
 * league it tracks the measured worth at r 0.92 on defense and 0.55 on offense (slope 1.0 at both ends:
 * no more and no less than the engine gives). The offensive playbooks are close (none worth more than
 * about 0.2 a game over a roster's average): their read is mostly a few tenths either way, which is
 * about all the engine says the choice is worth.
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

/**
 * The offensive playbooks' fit models (see FitModel), on the playbooks as rebalanced 2026-10-26 (see
 * OFF_PRESETS): Heliocentric pays a lead creator, Five-Out a roster of passers with no one creator,
 * Hub Big passers too (and is still the weakest for nearly every roster), Grit & Grind pays size and
 * costs a post scorer it would only feed (he scores in any playbook), and Pace & Space is about as good
 * for every roster (nothing about a roster moved it more than the games' noise).
 */
const OFF_FIT: Record<string, FitModel> = {
  balanced: { base: -0.4, terms: [] },
  helio: { base: 0.8, terms: [['starCreator', 0.32, 67]] },
  fiveOut: {
    base: 0,
    terms: [
      ['starCreator', -0.5, 67],
      ['passing', 0.41, 54],
    ],
  },
  hub: {
    base: -3.6,
    terms: [
      ['passing', 0.34, 54],
      ['starCreator', -0.19, 67],
      ['bigPassing', 0.04, 45],
    ],
  },
  paceSpace: { base: 1.5, terms: [] },
  grind: {
    base: 0,
    terms: [
      ['size', 0.39, 47],
      ['postScoring', -0.24, 64],
      ['starCreator', 0.17, 67],
    ],
  },
};

/**
 * The defensive playbooks' fit models (see FitModel; from the same runs, on the roster's defensive
 * qualities). Quick hands are most of it: trapping and the press pay them (blitz +0.41 and chaos +1.85
 * fit points a point of steals, the blitz more with perimeter defenders, the press with speed and depth)
 * and the coverages that stay home don't; Switch, Ice, Hedge and the zone are the more worth it the
 * slower the roster. Since the 2-3 zone was made to give up what an NBA zone does (2026-10-26,
 * K.zoneFit: taller walls with length, beaten by ball movement, the high post, the glass and shooters)
 * it pays a big roster (+0.43 a point of size) and costs a small one; it had been the best defense for
 * 22 of the real league's 30 rosters, with AI staffs kept off it.
 */
const DEF_FIT: Record<string, FitModel> = {
  drop: {
    base: 4.5,
    terms: [
      ['steals', -0.66, 52],
      ['depth', -0.19, -15],
    ],
  },
  switch: {
    base: 3.2,
    terms: [
      ['steals', -0.39, 52],
      ['athleticism', -0.28, 56],
    ],
  },
  blitz: {
    base: -1.3,
    terms: [
      ['steals', 0.41, 52],
      ['size', -0.25, 47],
      ['perimeterD', 0.53, 54],
    ],
  },
  ice: {
    base: 1.9,
    terms: [
      ['steals', -0.41, 52],
      ['athleticism', -0.35, 56],
    ],
  },
  hedge: {
    base: 2.4,
    terms: [
      ['steals', -0.35, 52],
      ['rimProtection', 0.12, 67],
      ['athleticism', -0.29, 56],
    ],
  },
  zone: {
    base: 2.3,
    terms: [
      ['size', 0.43, 47],
      ['steals', -0.46, 52],
      ['athleticism', -0.45, 56],
    ],
  },
  chaos: {
    base: -10.6,
    terms: [
      ['steals', 1.85, 52],
      ['athleticism', 1.48, 56],
      ['depth', 0.78, -15],
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
 * An AI coach's lean toward his own playbooks (the user's staff has none: StaffFor), in fit points:
 * enough to play his own style where another fits about as well (inside what the fits can tell apart),
 * never one the roster plays clearly worse.
 * Measured over the real league (each playbook for each team, 696 paired games, 2026-10-26, the zone
 * retuned and the reads refit): at 8 no playbook is more than 7 AI staffs' pick on offense or 9 on
 * defense, every style but Chaos has its staffs, and the picks run 0.5 a game under each team's best
 * (the read alone: 0.3, with up to 9 and 10 staffs on one playbook; at 4: 0.3, up to 10). Before the
 * zone was retuned the lean was what kept the league's styles spread (at none, 0.5 under the best with
 * twenty-one zones, which gave scouting nothing to find); now it keeps each coach's identity, which is
 * what scouting reads, at the price of a few tenths a game the AI's staffs leave on the table.
 */
const PHILOSOPHY_LEAN = { off: 8, def: 8 };

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
 * How well each shape fits a roster, in fit points against four-out, one-in (a tenth of a point a
 * game, as the playbooks' fits), the staff's read of what the engine says it's worth: fitted
 * (2026-10-26) to each shape played for the real league's rosters (two seed sets) and a fictional
 * league's against every other team (696 paired games each, fully drilled), on the parts of the five
 * that move it (shapeInputs), picked one at a time while they predict rosters left out better, the
 * weights shared and the start the real league's. Five-out pays a roster that shoots (the top eight's
 * spacing) and costs most rosters a few tenths; horns pays a big five (its two bigs at the elbows); the
 * double post pays each inside big in the five (Rim Runners, Post Hubs: two of them crowd the paint in
 * any other shape). Over the real league the fit tracks the measured worth at r 0.58.
 */
export function shapeFits(players: Player[], tactics?: Pick<Tactics, 'offense'>, order?: number[]): Record<OffShape, number> {
  const x = shapeInputs(players, tactics, order);
  return {
    fourOut: 0,
    fiveOut: -1.8 + 0.45 * (x.spacing - 35),
    horns: -1.5 + 0.32 * (x.size - 46),
    twoIn: 0.1 + INSIDE_FIT * (x.inside - 1),
  };
}

/**
 * What a shape's fit is read from: the top eight's average spacing, the better passer of the five's two
 * bigs, how many of the five play inside (Rim Runners, Post Hubs: they crowd the paint in every shape but
 * the double post, see sim/links.ts), and the five's averages a refit may try (its size, its best creator,
 * its offensive rebounding and its post scoring, and its own spacing).
 */
export function shapeInputs(players: Player[], tactics?: Pick<Tactics, 'offense'>, order?: number[]) {
  const { five, eight } = shapeUnits(players, order);
  const cs = five.map((p) => composites(p.ratings));
  const avg = (f: (i: number) => number) => cs.reduce((a, _, i) => a + f(i), 0) / Math.max(1, cs.length);
  const spacing = eight.reduce((a, p) => a + composites(p.ratings).spacing, 0) / Math.max(1, eight.length);
  const bigs = five
    .map((p, i) => ({ p, c: cs[i] }))
    .sort((a, b) => b.p.ratings.hgt - a.p.ratings.hgt || b.c.orb - a.c.orb)
    .slice(0, 2);
  const bigPass = Math.max(0, ...bigs.map((x) => x.c.passing));
  const inside = five.filter((p) => {
    const r = tactics?.offense.roles[p.pid] ?? archetype(p.ratings).role;
    return r === 'roller' || r === 'post';
  }).length;
  return {
    spacing,
    bigPass,
    inside,
    size: avg((i) => five[i].ratings.hgt),
    creator: Math.max(0, ...cs.map((c) => (c.pnrHandle + c.create) / 2)),
    orb: avg((i) => cs[i].orb),
    post: Math.max(0, ...cs.map((c) => c.postScore)),
    spacing5: avg((i) => cs[i].spacing),
  };
}

/** What the double post is worth for each inside big in the five (two crowd the paint in any other shape), in fit points. */
const INSIDE_FIT = 2.4;

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

/**
 * The staff's roles, with the starting five's partnerships in mind (see sim/links.ts), in place: a big
 * who can play a role outside as well as the one inside moves out of a crowded paint, and a big with
 * a handler beside him who can play Rim Runner or Stretch Big as well as his role takes it, for a
 * two-man game or a pick-and-pop. Never the two focal players (their roles keep the ball in scoring
 * spots), never anyone cast worse, and the double post stays the answer for two bigs who can't.
 */
export function partnerRoles(roles: Record<number, OffRole>, players: Player[], order?: number[]) {
  const { five } = shapeUnits(players, order);
  const focal = new Set(
    [...players]
      .sort((a, b) => b.ovr + 8 * Math.log(clamp(b.tend?.use ?? 1, 0.3, 4)) - (a.ovr + 8 * Math.log(clamp(a.tend?.use ?? 1, 0.3, 4))))
      .slice(0, 2)
      .map((p) => p.pid),
  );
  const role = (p: Player) => roles[p.pid] ?? archetype(p.ratings).role;
  const stars = (p: Player, r: OffRole) => fitStars(roleFits(p)[r]);
  const inside = (r: OffRole) => r === 'roller' || r === 'post';
  // a crowded paint: every inside big but the best at it moves out if he loses nothing by it
  const bigs = five.filter((p) => inside(role(p))).sort((a, b) => stars(b, role(b)) - stars(a, role(a)));
  for (const p of bigs.slice(1)) {
    if (focal.has(p.pid)) continue;
    const out = (['stretch', 'hub', 'glue'] as const).reduce((a, r) => (stars(p, r) > stars(p, a) ? r : a), 'stretch' as OffRole);
    if (stars(p, out) >= stars(p, role(p))) roles[p.pid] = out;
  }
  // a handler with no big to work with: a big who's as good a Rim Runner or Stretch Big as he is in his role
  const handlers = five.filter((p) => HANDLER_ROLES.includes(role(p)));
  if (!handlers.length || five.some((p) => role(p) === 'roller' || role(p) === 'stretch')) return;
  const crowded = five.filter((p) => inside(role(p))).length;
  let best: { p: Player; r: OffRole; v: number } | null = null;
  for (const p of five) {
    if (focal.has(p.pid) || p.ratings.hgt < 55 || HANDLER_ROLES.includes(role(p))) continue;
    for (const r of ['roller', 'stretch'] as const) {
      // (a second big inside would crowd the paint)
      if (r === 'roller' && crowded >= 1 && !inside(role(p))) continue;
      const v = roleFits(p)[r];
      if (stars(p, r) >= stars(p, role(p)) && (!best || v > best.v)) best = { p, r, v };
    }
  }
  if (best) roles[best.p.pid] = best.r;
}

/** The players a playbook is fitted to: a knock of five games or fewer doesn't swing the fits, nor do injuries that leave fewer than eight. */
export function fitRoster(players: Player[]): Player[] {
  const healthy = players.filter((p) => !p.injury || p.injury.gamesRemaining <= 5);
  return healthy.length >= 8 ? healthy : players;
}

/**
 * Whose staff picks. An AI team's leans toward its coach's own playbooks (PHILOSOPHY_LEAN), which keeps
 * the league's styles spread as an NBA league's are. The user's own staff ('user') picks by its read
 * alone, the one the style picker shows (best for the roster first): a staff that passed over its own
 * best read for a coach's habit would knowingly cost him points. (Until 2026-10-26 AI staffs also kept
 * off the 2-3 zone unless it was their coach's, as the engine's zone was the best defense for 22 of the
 * real league's 30 rosters; the zone now gives up what an NBA zone does, K.zoneFit, and no style is
 * the best for more than a third of the league: scripts/style-gate.ts holds that in CI.)
 */
export interface StaffFor {
  user?: boolean;
}

/**
 * Each preset's fit for this roster: for an AI staff, his philosophy's lean included; for the user's
 * staff, the read as the style picker shows it (StaffFor).
 */
export function presetScores(team: Team, players: Player[], staff: StaffFor = {}): { off: Record<string, number>; def: Record<string, number> } {
  const pr = rosterProfile(fitRoster(players));
  if (staff.user) return { off: offPresetFit(pr), def: defPresetFit(pr) };
  const lean = (fits: Record<string, number>, mine: string, by: number) => Object.fromEntries(Object.entries(fits).map(([k, v]) => [k, v + (k === mine ? by : 0)]));
  return { off: lean(offPresetFit(pr), team.coach.offPhilosophy, PHILOSOPHY_LEAN.off), def: lean(defPresetFit(pr), team.coach.defPhilosophy, PHILOSOPHY_LEAN.def) };
}

/** Offensive and defensive presets ranked by fit for this roster and coach (or the user's staff: StaffFor), best first. */
export function rankedPresets(team: Team, players: Player[], staff: StaffFor = {}): { off: string[]; def: string[] } {
  const sc = presetScores(team, players, staff);
  const rank = (fits: Record<string, number>) =>
    Object.entries(fits)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  return { off: rank(sc.off), def: rank(sc.def) };
}

/**
 * In season, how much better (in fit points, a tenth of a point a game each) another playbook or
 * shape has to fit before the staff changes to it: a new system costs familiarity for weeks (see
 * src/core/sim/familiarity.ts), so a marginal gain isn't worth relearning for. The style picker says
 * so when it's keeping the user's staff on one (PresetPicker).
 */
export const STICK = { preset: 8, shape: 6 };

/** The playbook a staff picks from fits `fits`: the best, or in season (`sticky`) the one it runs (`cur`) unless another fits better by STICK. */
export function staffPick(fits: Record<string, number>, cur: string | undefined, sticky = false): string {
  const top = Object.entries(fits).sort((a, b) => b[1] - a[1])[0][0];
  return sticky && cur && fits[cur] !== undefined && fits[top] - fits[cur] < STICK.preset ? cur : top;
}

/**
 * The staff's tactics for a roster: the best-fitting playbooks, roles and shot freedom at both ends,
 * and the shape. `sticky` (in season): the team keeps the playbooks and shape it runs unless another
 * fits better by STICK. `links`: the user's own staff also casts the starting five for partnerships
 * (partnerRoles). `user`: the user's own staff, which picks by its read (StaffFor).
 */
export function autoTactics(team: Team, players: Player[], keepManual = true, opts: { sticky?: boolean; links?: boolean } & StaffFor = {}): Tactics {
  if (keepManual && team.tactics.manual) return team.tactics;
  const sc = presetScores(team, players, opts);
  const best = (fits: Record<string, number>, cur: string | undefined) => staffPick(fits, cur, opts.sticky);
  const off = best(sc.off, team.tactics?.offPreset);
  const def = best(sc.def, team.tactics?.defPreset);
  const base = team.tactics ? cloneTactics(team.tactics) : defaultTactics(off, def);
  base.offense = applyOffPreset(base.offense, off);
  base.defense = applyDefPreset(base.defense, def);
  base.offPreset = off;
  base.defPreset = def;
  const { roles, freedom } = autoRoles(players);
  if (opts.links) partnerRoles(roles, fitRoster(players), team.rotation?.order);
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
