// Tactical familiarity, as Football Manager keeps it: what a team has drilled, and how well it
// executes what it plays tonight. A team knows each discrete option it could play (a scheme, a
// ball-screen coverage, a shape, a press) to some degree, has its sliders drilled at some values,
// its players know the system (a new arrival has to learn it), and each player knows the role pair
// he's been playing. Games and practice days build all of it; options nobody runs fade back to what
// any NBA team knows of them. In a game, the five on the floor execute their offense and defense at
// a familiarity read from all of that, and below fluid the engine plays them a step slow: worse
// shots and more turnovers on offense, more open shots given up on defense (src/core/sim/engine).

import type { ActionType, Familiarity, OffRole, Player, PrepFocus, Tactics, Team, DefRole } from '../types';
import { ACTIONS } from '../types';
import { clamp } from '../random';
import { archetype } from '../ratings';
import { defRoleOf, shapeOf } from './tactics';
import { duoKey, duoOf, NEW_DUO } from './links';

/** The parts of a system familiarity is kept by, as the screens show them. */
export type FamDim = 'shape' | 'actions' | 'tempo' | 'roles' | 'scheme' | 'coverage' | 'pressure';

export const FAM_DIMS: { id: FamDim; label: string; end: 'off' | 'def'; help: string }[] = [
  { id: 'shape', label: 'Shape', end: 'off', help: 'Your half-court alignment: where the five stand and what each spot does.' },
  { id: 'actions', label: 'Actions & shots', end: 'off', help: 'The mix of actions you run and the shots you look for: how far they are from what the team has drilled.' },
  { id: 'tempo', label: 'Tempo', end: 'off', help: 'Your pace and how hard you push in transition.' },
  { id: 'roles', label: 'Roles', end: 'off', help: 'Each player in his roles at both ends, his minutes counting: a player new to a role is a step slow in it.' },
  { id: 'scheme', label: 'Scheme', end: 'def', help: 'Your base defense: man-to-man, a zone or a junk defense.' },
  { id: 'coverage', label: 'Ball-screen coverage', end: 'def', help: 'How you guard the pick-and-roll: drop, switch, hedge, blitz or ice.' },
  { id: 'pressure', label: 'Pressure & help', end: 'def', help: 'Help, ball pressure, physicality, getting back, and the full-court press.' },
];

/** The weights of each end's parts in its familiarity (roles count at both ends). */
const OFF_W: Partial<Record<FamDim, number>> = { shape: 0.2, actions: 0.35, tempo: 0.15, roles: 0.3 };
const DEF_W: Partial<Record<FamDim, number>> = { scheme: 0.3, coverage: 0.3, pressure: 0.2, roles: 0.2 };

/** At or above this a unit is fluid: no penalty at all. */
export const FLUID = 95;

/** What every NBA team knows of each option without drilling it (a team's memory fades back to this). */
const FLOOR: Record<string, number> = {
  'scheme:man': 75,
  'scheme:zone23': 35,
  'scheme:zone32': 20,
  'scheme:box1': 12,
  'scheme:tri2': 8,
  'pnr:drop': 65,
  'pnr:switch': 60,
  'pnr:hedge': 55,
  'pnr:ice': 45,
  'pnr:blitz': 40,
  'press:afterMade': 35,
  'press:always': 20,
  'shape:fourOut': 70,
  'shape:fiveOut': 45,
  'shape:horns': 50,
  'shape:twoIn': 35,
};

/** The sliders a team drills, by habit key. */
const OFF_HABITS = ['threePoint', 'rimAttack', 'crashBoards'] as const;
const TEMPO_HABITS = ['pace', 'transition'] as const;
const DEF_HABITS = ['help', 'pressure', 'physicality', 'getBack'] as const;
const actionKey = (a: ActionType) => `a_${a}`;
const HABITS = [...TEMPO_HABITS, ...OFF_HABITS, ...DEF_HABITS, ...ACTIONS.map(actionKey)];

/** Familiarity points a habit loses per point the setting is off it. */
const HABIT_COST = 1.6;

/** Knowledge of the system a player who just arrived has. */
export const NEW_KNOW = 35;
/** A role pair never played: a player new to both roles, and one keeping one of the two. */
export const NEW_PAIR = 45;
const HALF_PAIR = 65;
/** ...and one new to them but playing his natural offensive role (his archetype's: he's played it all his career). */
export const NATURAL_PAIR = 70;

/** How much of the way to 100 a game played with an option closes, and a habit's way to the setting. */
const GAME_GROW = 0.09;
const GAME_HABIT = 0.1;
const GAME_KNOW = 0.08;
const GAME_ROLE = 0.1;
/** A day's fade of an option nobody on the team runs, toward its floor. */
const FADE = 0.004;
/** How much of the way to 100 a pair's understanding closes for a full game (24 minutes) shared on the floor, and for a practice day in the rotation together (at a balanced focus). */
const DUO_GAME = 0.12;
const DUO_PRACTICE = 0.004;

/** A practice focus's share of a game's learning, for the tactics in play and for the other slots, and of a game's knowledge. */
export const PREP_META: Record<PrepFocus, { label: string; help: string; active: number; alt: number; know: number; rest: number }> = {
  balanced: {
    label: 'Balanced',
    help: 'A bit of everything: the system keeps building between games and the legs get normal rest.',
    active: 0.3,
    alt: 0.12,
    know: 1,
    rest: 0,
  },
  system: {
    label: 'Tactical drills',
    help: 'Walk-throughs of your tactics, all three slots: familiarity and new players’ knowledge build about twice as fast, at no cost to the legs, but no extra rest.',
    active: 0.6,
    alt: 0.35,
    know: 2,
    rest: 0,
  },
  opponent: {
    label: 'Opponent prep',
    help: 'The next opponent’s plays and your plan for them: whatever your game plan changes is drilled for that game (no learning curve on a coverage you only play against them), while the system itself builds slowly.',
    active: 0.15,
    alt: 0.05,
    know: 0.5,
    rest: 0,
  },
  recovery: {
    label: 'Recovery',
    help: 'Rest, treatment and film: wear comes off about twice as fast, but the system doesn’t build between games.',
    active: 0,
    alt: 0,
    know: 0,
    rest: 0.85,
  },
};

const INTENSITY: Record<Team['practice'], number> = { light: 0.75, normal: 1, intense: 1.25 };

// ---------------------------------------------------------------- reading it

export const optKey = {
  scheme: (t: Tactics) => `scheme:${t.defense.scheme}`,
  pnr: (t: Tactics) => `pnr:${t.defense.pnr}`,
  shape: (t: Tactics) => `shape:${shapeOf(t.offense)}`,
  press: (t: Tactics) => (t.defense.press === 'none' ? null : `press:${t.defense.press}`),
};

/** The discrete options tactics play (the press only when there is one). */
export function optionsOf(t: Tactics): string[] {
  const out = [optKey.scheme(t), optKey.pnr(t), optKey.shape(t)];
  const press = optKey.press(t);
  if (press) out.push(press);
  return out;
}

/** How well a team knows an option: what it drilled, or what any team knows. */
export function optValue(fam: Familiarity | undefined, key: string): number {
  if (!fam) return 100;
  return fam.opt[key] ?? FLOOR[key] ?? 50;
}

/** The value a habit's setting has in tactics `t`. */
function setting(t: Tactics, key: string): number {
  if (key.startsWith('a_')) return t.offense.actions[key.slice(2) as ActionType];
  if ((DEF_HABITS as readonly string[]).includes(key)) return t.defense[key as (typeof DEF_HABITS)[number]];
  return t.offense[key as (typeof OFF_HABITS)[number] | (typeof TEMPO_HABITS)[number]];
}

/** Familiarity with a group of sliders: 100 less HABIT_COST for each point they're off what's drilled, on average. */
function habitFam(fam: Familiarity, t: Tactics, keys: readonly string[]): number {
  let off = 0;
  for (const k of keys) {
    const h = fam.habit[k];
    if (h !== undefined) off += Math.abs(setting(t, k) - h);
  }
  return clamp(100 - (HABIT_COST * off) / keys.length, 0, 100);
}

/** A player's role pair as the tactics give it: his offensive role (his archetype's when none is set) and his defensive one. */
export function rolePair(t: Tactics, p: Pick<Player, 'pid' | 'ratings'>): string {
  const off: OffRole = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
  const def: DefRole = defRoleOf(t.defense, p.pid);
  return `${off}|${def}`;
}

/** How well a player knows the role pair the tactics give him. */
export function roleFam(fam: Familiarity | undefined, t: Tactics, p: Pick<Player, 'pid' | 'ratings'>): number {
  if (!fam) return 100;
  const pair = rolePair(t, p);
  const had = fam.roles[p.pid];
  if (had && had[0] === pair) return had[1];
  const [off, def] = pair.split('|');
  const natural = archetype(p.ratings).role === off;
  if (had) {
    const [hOff, hDef] = had[0].split('|');
    // one of the two roles he's already been playing: some of it carries over
    if (hOff === off || hDef === def) return Math.max(natural ? NATURAL_PAIR : HALF_PAIR, Math.min(had[1], 85) - 15);
  }
  return natural ? NATURAL_PAIR : NEW_PAIR;
}

/** A player's knowledge of the team's system. */
export const knowOf = (fam: Familiarity | undefined, pid: number) => (fam ? (fam.know[pid] ?? NEW_KNOW) : 100);

/**
 * Familiarity with tactics `t` by part (0-100): each discrete option as drilled, each group of
 * sliders by how far they are off their habits, and the roles over `players` weighted by `weights`
 * (their minutes; equal when none are given).
 */
export function famDims(fam: Familiarity | undefined, t: Tactics, players: Pick<Player, 'pid' | 'ratings'>[] = [], weights?: Record<number, number>): Record<FamDim, number> {
  if (!fam) return { shape: 100, actions: 100, tempo: 100, roles: 100, scheme: 100, coverage: 100, pressure: 100 };
  let rw = 0;
  let rs = 0;
  for (const p of players) {
    const w = weights ? (weights[p.pid] ?? 0) : 1;
    if (w <= 0) continue;
    rw += w;
    rs += w * roleFam(fam, t, p);
  }
  const press = optKey.press(t);
  return {
    shape: optValue(fam, optKey.shape(t)),
    actions: habitFam(fam, t, [...ACTIONS.map(actionKey), ...OFF_HABITS]),
    tempo: habitFam(fam, t, TEMPO_HABITS),
    roles: rw ? rs / rw : 100,
    scheme: optValue(fam, optKey.scheme(t)),
    coverage: optValue(fam, optKey.pnr(t)),
    pressure: 0.7 * habitFam(fam, t, DEF_HABITS) + 0.3 * (press ? optValue(fam, press) : 100),
  };
}

/** Each end's familiarity from its parts. */
export function famEnds(d: Record<FamDim, number>): { off: number; def: number } {
  let off = 0;
  let def = 0;
  for (const [k, w] of Object.entries(OFF_W) as [FamDim, number][]) off += w * d[k];
  for (const [k, w] of Object.entries(DEF_W) as [FamDim, number][]) def += w * d[k];
  return { off, def };
}

/** The whole system's familiarity: both ends, as one figure. */
export function famOverall(d: Record<FamDim, number>): number {
  const e = famEnds(d);
  return (e.off + e.def) / 2;
}

/**
 * How a unit executes: each end's familiarity with the tactics it plays, blended with the five's
 * knowledge of the system (a quarter of it: a new arrival is the one a step behind).
 */
export function execution(fam: Familiarity | undefined, t: Tactics, five: Pick<Player, 'pid' | 'ratings'>[]): { off: number; def: number } {
  if (!fam) return { off: 100, def: 100 };
  const e = famEnds(famDims(fam, t, five));
  const know = five.length ? five.reduce((a, p) => a + knowOf(fam, p.pid), 0) / five.length : 100;
  return { off: 0.75 * e.off + 0.25 * know, def: 0.75 * e.def + 0.25 * know };
}

/** The share of the engine's full familiarity penalty a unit plays at (0 when fluid, 1 when it knows nothing). */
export function famPenalty(eff: number): number {
  return eff >= FLUID ? 0 : Math.pow((FLUID - eff) / FLUID, 1.1);
}

/** A word for a familiarity figure, as the screens say it. */
export function famLabel(v: number): string {
  return v >= FLUID ? 'Fluid' : v >= 80 ? 'Familiar' : v >= 60 ? 'Learning' : v >= 40 ? 'Awkward' : 'New';
}

/** Games of the current routine until a figure reaches `target` (one game and the practice days around it at a balanced focus). */
export function gamesTo(v: number, target = FLUID, perGame = GAME_GROW + 0.3 * GAME_GROW * 1.1): number {
  if (v >= target) return 0;
  return Math.ceil(Math.log((100 - target) / (100 - v)) / Math.log(1 - perGame));
}

// ---------------------------------------------------------------- building it

/** The rotation's weights for the roles part: the minutes the rotation plans (or an even share of the top ten). */
export function rotationWeights(team: Team, roster: Pick<Player, 'pid'>[]): Record<number, number> {
  const out: Record<number, number> = {};
  const mins = team.rotation?.minutes ?? {};
  let any = false;
  for (const p of roster)
    if ((mins[p.pid] ?? 0) > 0) {
      out[p.pid] = mins[p.pid];
      any = true;
    }
  if (!any) for (const pid of (team.rotation?.order ?? roster.map((p) => p.pid)).slice(0, 10)) out[pid] = 24;
  return out;
}

/**
 * A team's familiarity as it would be after a training camp with its tactics (and its other slots,
 * a little less): what a new league and an old save start from.
 */
export function freshFamiliarity(team: Team, roster: Pick<Player, 'pid' | 'ratings'>[], level = 97): Familiarity {
  const fam: Familiarity = { opt: {}, habit: {}, know: {}, roles: {} };
  for (const s of team.slots?.stored ?? []) if (s) for (const k of optionsOf(s)) fam.opt[k] = Math.max(fam.opt[k] ?? 0, level - 15);
  for (const k of optionsOf(team.tactics)) fam.opt[k] = level;
  for (const k of HABITS) fam.habit[k] = setting(team.tactics, k);
  for (const p of roster) {
    fam.know[p.pid] = level - 1;
    fam.roles[p.pid] = [rolePair(team.tactics, p), level - 3];
  }
  fam.duo = {};
  const rot = rotationPids(team, roster);
  for (let i = 0; i < rot.length; i++) for (let j = i + 1; j < rot.length; j++) fam.duo[duoKey(rot[i], rot[j])] = level - 7;
  return fam;
}

/** The players in the team's rotation (the ones its plan gives minutes, or its top ten). */
function rotationPids(team: Team, roster: Pick<Player, 'pid'>[]): number[] {
  return Object.keys(rotationWeights(team, roster)).map(Number);
}

/** The team's familiarity, made fresh if it has none (a save from before it was kept). */
export function ensureFam(team: Team, roster: Pick<Player, 'pid' | 'ratings'>[]): Familiarity {
  return (team.fam ??= freshFamiliarity(team, roster));
}

const grow = (v: number, rate: number) => v + (100 - v) * clamp(rate, 0, 1);

/** Learning from tactics played for a share `rate` of a game: their options and habits, and the role pairs of `players`. */
function learn(fam: Familiarity, t: Tactics, rate: number, players: Pick<Player, 'pid' | 'ratings'>[], roleRate: number) {
  if (rate <= 0) return;
  for (const k of optionsOf(t)) fam.opt[k] = grow(optValue(fam, k), GAME_GROW * rate);
  for (const k of HABITS) {
    const h = fam.habit[k];
    const v = setting(t, k);
    fam.habit[k] = h === undefined ? v : h + (v - h) * clamp(GAME_HABIT * rate, 0, 1);
  }
  for (const p of players) {
    if (roleRate <= 0) continue;
    const pair = rolePair(t, p);
    const now = roleFam(fam, t, p);
    fam.roles[p.pid] = [pair, grow(now, GAME_ROLE * roleRate)];
  }
}

/**
 * After a game: the tactics it was played with are drilled a game's worth, each player who played
 * learns the system and his roles by his minutes (a full game's worth at 24 minutes), and each pair
 * who shared the floor understands each other better by their minutes together (`shared`, seconds by duoKey).
 */
export function afterGame(fam: Familiarity, t: Tactics, roster: Pick<Player, 'pid' | 'ratings'>[], secs: Record<number, number>, shared: Record<string, number> = {}) {
  learn(fam, t, 1, [], 0);
  for (const p of roster) {
    const share = Math.min(1, (secs[p.pid] ?? 0) / 1440);
    if (share <= 0) continue;
    fam.know[p.pid] = grow(knowOf(fam, p.pid), GAME_KNOW * share);
    fam.roles[p.pid] = [rolePair(t, p), grow(roleFam(fam, t, p), GAME_ROLE * share)];
  }
  const duo = (fam.duo ??= {});
  for (const [k, sec] of Object.entries(shared)) {
    const [a, b] = k.split('-').map(Number);
    duo[k] = grow(duoOf(fam, a, b), DUO_GAME * Math.min(1, sec / 1440));
  }
}

/** Seconds each pair of a side's players shared on the floor, by duoKey, from a game's lineup tallies. */
export function sharedSeconds(lineups: { t: 0 | 1; pids: number[]; sec: number }[], side: 0 | 1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ls of lineups) {
    if (ls.t !== side || ls.sec <= 0) continue;
    for (let i = 0; i < ls.pids.length; i++)
      for (let j = i + 1; j < ls.pids.length; j++) {
        const k = duoKey(ls.pids[i], ls.pids[j]);
        out[k] = (out[k] ?? 0) + ls.sec;
      }
  }
  return out;
}

/**
 * A day without a game: practice at the team's focus and intensity builds the tactics in play, its
 * other slots (less) and the players' knowledge; options no slot plays fade toward their floor, and
 * players who have left are forgotten.
 */
export function practiceDay(team: Team, roster: Pick<Player, 'pid' | 'ratings'>[]) {
  const fam = ensureFam(team, roster);
  const focus = PREP_META[team.prep ?? 'balanced'];
  const x = INTENSITY[team.practice] ?? 1;
  const alts = (team.slots?.stored ?? []).filter((s): s is Tactics => !!s);
  const live = new Set([...optionsOf(team.tactics), ...alts.flatMap(optionsOf)]);
  for (const [k, v] of Object.entries(fam.opt)) {
    if (live.has(k)) continue;
    const floor = FLOOR[k] ?? 50;
    if (v > floor) fam.opt[k] = v - (v - floor) * FADE;
  }
  for (const s of alts) learn(fam, s, focus.alt * x, [], 0);
  learn(fam, team.tactics, focus.active * x, roster, focus.active * x);
  const on = new Set(roster.map((p) => p.pid));
  for (const p of roster) fam.know[p.pid] = grow(knowOf(fam, p.pid), 0.03 * focus.know * x);
  for (const pid of Object.keys(fam.know)) if (!on.has(+pid)) delete fam.know[+pid];
  for (const pid of Object.keys(fam.roles)) if (!on.has(+pid)) delete fam.roles[+pid];
  // the rotation's pairs work together in practice too; pairs with a player gone are forgotten
  const duo = (fam.duo ??= {});
  const rate = DUO_PRACTICE * focus.know * x;
  if (rate > 0) {
    const rot = rotationPids(team, roster);
    for (let i = 0; i < rot.length; i++)
      for (let j = i + 1; j < rot.length; j++) {
        const k = duoKey(rot[i], rot[j]);
        duo[k] = grow(duoOf(fam, rot[i], rot[j]), rate);
      }
  }
  for (const k of Object.keys(duo)) {
    const [a, b] = k.split('-').map(Number);
    if (!on.has(a) || !on.has(b) || duo[k] <= NEW_DUO) delete duo[k];
  }
}

/** Training camp: three weeks of tactical drills before opening night. */
export function trainingCamp(team: Team, roster: Pick<Player, 'pid' | 'ratings'>[], days = 21) {
  const prep = team.prep;
  team.prep = 'system';
  for (let i = 0; i < days; i++) practiceDay(team, roster);
  if (prep === undefined) delete team.prep;
  else team.prep = prep;
}

/**
 * Familiarity for a game played with a game plan the team prepared for (opponent prep, or an AI
 * coach's plan against the user): whatever the plan changes from the base tactics is drilled for
 * this game (a copy: what the team keeps is unchanged).
 */
export function prepared(fam: Familiarity, base: Tactics, plan: Tactics): Familiarity {
  const out = structuredClone(fam);
  const was = new Set(optionsOf(base));
  for (const k of optionsOf(plan)) if (!was.has(k)) out.opt[k] = Math.max(optValue(out, k), 88);
  for (const k of HABITS) if (setting(plan, k) !== setting(base, k)) out.habit[k] = setting(plan, k);
  return out;
}

/**
 * Familiarity as it would be if the team knew tactics `want` as well as it knows `have` (a copy):
 * each option `want` plays that `have` doesn't, known as well as the one of its kind `have` plays
 * (a coverage for a coverage); each drilled slider as far off `want`'s setting as it is off
 * `have`'s; each player in his `want` role pair as well as in his `have` one. What a change is
 * worth once it's drilled (against what learning it costs tonight), and the other way round: the old
 * way known as well as the new (see core/ai/tacticEdits.ts).
 */
export function drilledAs(fam: Familiarity, have: Tactics, want: Tactics, players: Pick<Player, 'pid' | 'ratings'>[]): Familiarity {
  const out = structuredClone(fam);
  const kinds: (keyof typeof optKey)[] = ['scheme', 'pnr', 'shape', 'press'];
  for (const k of kinds) {
    const w = optKey[k](want);
    if (!w || w === optKey[k](have)) continue;
    const h = optKey[k](have);
    // (no press before: a press known as well as the man-to-man it's played over)
    const level = h ? optValue(fam, h) : optValue(fam, optKey.scheme(have));
    out.opt[w] = Math.max(optValue(fam, w), level);
  }
  for (const k of HABITS) {
    const h = fam.habit[k];
    if (h !== undefined) out.habit[k] = clamp(setting(want, k) + (h - setting(have, k)), 0, 100);
  }
  for (const p of players) {
    const pair = rolePair(want, p);
    if (pair !== rolePair(have, p)) out.roles[p.pid] = [pair, Math.max(roleFam(fam, want, p), roleFam(fam, have, p))];
  }
  return out;
}
