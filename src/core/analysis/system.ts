// The system report on Team → Tactics: what your system should be good and bad at, from the players
// who'll play its minutes and the settings you give them, graded against the other 29 teams' (each
// with its own rotation and tactics). Seven qualities at each end, each a personnel base (the
// rotation's ratings, minutes-weighted, its best player at it counted extra where one man carries
// it) plus what the settings do to it, in the directions the engine plays them: help packs the paint
// and leaves shooters, a 3-2 zone guards the arc and gives up the glass, crashing the offensive glass
// leaks run-outs, a drop needs a rim protector, a switch needs defenders of a size, pressure forces
// turnovers and gets beaten off the dribble. A projection to tinker against, not a promise: the
// season's numbers (Insights) say what actually happened. Pure.

import type { DefRole, DefScheme, League, OffRole, Player, Tactics } from '../types';
import { clamp } from '../random';
import { composites, type Composites } from '../ratings';
import { teamPlayers } from '../league/helpers';
import { COVERAGE_META, DEF_ROLE_META, SCHEME_META, SHAPE_META, defRoleOf, levelName, shapeOf, withMentality } from '../sim/tactics';

export type QualityId = 'creation' | 'spacing' | 'rim' | 'movement' | 'transition' | 'glass' | 'security' | 'rimD' | 'perimD' | 'pnrD' | 'threeD' | 'boards' | 'transD' | 'forceTo';

export const QUALITY_META: Record<QualityId, { label: string; side: 'off' | 'def'; help: string }> = {
  creation: { label: 'Shot creation', side: 'off', help: 'Getting a good shot when the play breaks down. Your creators, and how much the offense leans on them.' },
  spacing: { label: 'Spacing', side: 'off', help: 'Shooters who make the defense stay home, and a shot profile that uses them.' },
  rim: {
    label: 'Rim pressure',
    side: 'off',
    help: 'Cutters, finishers and players who draw fouls, and how hard you attack. Shooters and ball screens keep it outside.',
  },
  movement: { label: 'Ball movement', side: 'off', help: 'Passers, and actions that move the ball: motion and handoffs. Isolations stop it.' },
  transition: { label: 'Transition', side: 'off', help: 'Speed and athleticism, and how hard you push after stops. Crashing the glass slows the break.' },
  glass: { label: 'Second chances', side: 'off', help: 'Offensive rebounders, and how many you send to the glass.' },
  security: { label: 'Ball security', side: 'off', help: 'Secure handlers, and a pace that doesn’t rush them.' },
  rimD: {
    label: 'Rim protection',
    side: 'def',
    help: 'A shot blocker, interior defenders and help behind the ball. Ball pressure the handlers beat gives up the rim.',
  },
  perimD: { label: 'Perimeter D', side: 'def', help: 'Defenders who stay in front, and how much pressure they put on the ball.' },
  pnrD: {
    label: 'Pick-and-roll D',
    side: 'def',
    help: 'Your ball-screen coverage, and whether the players fit it. A drop needs a rim protector, a switch same-size defenders, a hedge mobile bigs.',
  },
  threeD: { label: 'Three-point D', side: 'def', help: 'Closing out on shooters: help that stays home, and a scheme that guards the arc. A 3-2 zone does, a 2-3 doesn’t.' },
  boards: { label: 'Defensive glass', side: 'def', help: 'Rebounders, and a scheme that boxes out. Zones give up more offensive boards.' },
  transD: { label: 'Transition D', side: 'def', help: 'Getting back: speed, Transition defense, and how many you send to the offensive glass.' },
  forceTo: { label: 'Forcing turnovers', side: 'def', help: 'Hands and pressure: ball pressure, a press, traps on ball screens.' },
};

export const OFF_QUALITIES: QualityId[] = ['creation', 'spacing', 'rim', 'movement', 'transition', 'glass', 'security'];
export const DEF_QUALITIES: QualityId[] = ['rimD', 'perimD', 'pnrD', 'threeD', 'boards', 'transD', 'forceTo'];

/** One thing a quality is made of: a few words, and what it adds or takes away. */
export interface QualityPart {
  text: string;
  v: number;
}

export interface Quality {
  id: QualityId;
  /** The quality's score, on the ratings' scale plus what the settings add. */
  raw: number;
  /** 1 is the league's best. */
  rank: number;
  of: number;
  grade: Grade;
  parts: QualityPart[];
}

export type Grade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';

/** A grade from a rank among `of` teams: the top tenth A+, then A, B+, B, C+, C, D, and the bottom tenth F. */
export function gradeOf(rank: number, of: number): Grade {
  const p = (rank - 0.5) / of;
  return p < 0.1 ? 'A+' : p < 0.22 ? 'A' : p < 0.36 ? 'B+' : p < 0.5 ? 'B' : p < 0.64 ? 'C+' : p < 0.78 ? 'C' : p < 0.9 ? 'D' : 'F';
}

/** The good-to-poor colour of a grade, as the OVR tiers read. */
export const gradeTone = (g: Grade) => (g === 'A+' || g === 'A' ? 'good' : g === 'B+' || g === 'B' ? 'ok' : g === 'C+' || g === 'C' ? 'meh' : 'bad');

/** The players who'll play a team's minutes, with their share of them (from its rotation; the best eight when it has none). */
function rotationOf(league: League, tid: number): { p: Player; c: Composites; w: number }[] {
  const team = league.teams[tid];
  const ps = teamPlayers(league, tid).filter((p) => !(p.injury?.gamesRemaining ?? 0) || (p.injury?.gamesRemaining ?? 0) <= 0);
  const mins = team.rotation?.minutes ?? {};
  let rows = ps.map((p) => ({ p, c: composites(p.ratings), w: mins[p.pid] ?? 0 })).filter((x) => x.w > 0);
  if (rows.length < 5)
    rows = [...ps]
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 8)
      .map((p, i) => ({ p, c: composites(p.ratings), w: [34, 32, 32, 30, 30, 26, 22, 18][i] }));
  const total = rows.reduce((a, x) => a + x.w, 0) || 1;
  return rows.map((x) => ({ ...x, w: x.w / total }));
}

type Row = ReturnType<typeof rotationOf>[number];
const wavg = (rows: Row[], f: (x: Row) => number) => rows.reduce((a, x) => a + x.w * f(x), 0);
/** The best at something among those with real minutes (a tenth of them at least). */
const best = (rows: Row[], f: (x: Row) => number) => [...rows].filter((x) => x.w >= 0.06).sort((a, b) => f(b) - f(a))[0];
/** The two who carry a quality most: minutes times the rating. */
const leaders = (rows: Row[], f: (x: Row) => number, name: (p: Player) => string) =>
  [...rows]
    .sort((a, b) => b.w * f(b) - a.w * f(a))
    .slice(0, 2)
    .map((x) => name(x.p))
    .join(', ');
/** A setting's step from the middle, -1 to 1. */
const step = (v: number) => (v - 50) / 50;
const lvl = (k: Parameters<typeof levelName>[0], v: number) => levelName(k, v);

const ZONE_RIM: Record<DefScheme, number> = { man: 0, zone23: 6, zone32: -3, box1: 2, tri2: 1 };
const ZONE_ARC: Record<DefScheme, number> = { man: 0, zone23: -7, zone32: 6, box1: -5, tri2: -7 };
const ZONE_GLASS: Record<DefScheme, number> = { man: 0, zone23: -5, zone32: -6, box1: -4, tri2: -5 };

/** The raw score and parts of every quality for a team playing `t` with its rotation. */
function qualities(league: League, tid: number, tactics: Tactics, name: (p: Player) => string): Record<QualityId, { raw: number; parts: QualityPart[] }> {
  const rows = rotationOf(league, tid);
  // (the settings as the mentality plays them)
  const t = withMentality(tactics);
  const o = t.offense;
  const d = t.defense;
  const sys = systemMods(tactics, rows, name);
  const out = {} as Record<QualityId, { raw: number; parts: QualityPart[] }>;
  const set = (id: QualityId, base: number, who: string, mods: [string, number][]) => {
    const parts: QualityPart[] = [{ text: who, v: base }];
    let raw = base;
    for (const [text, v] of [...mods, ...(sys[id] ?? [])]) {
      if (Math.abs(v) < 0.4) continue;
      parts.push({ text, v });
      raw += v;
    }
    out[id] = { raw, parts };
  };
  const creation = (x: Row) => (x.c.create + x.c.pnrHandle) / 2;
  const star = best(rows, creation);
  const starC = star ? creation(star) : 50;
  set('creation', 0.55 * starC + 0.45 * wavg(rows, creation), `Creators: ${leaders(rows, creation, name)}`, [
    [`Pick-and-roll: ${lvl('action', o.actions.pnr)}`, step(o.actions.pnr) * (starC - 60) * 0.25],
    [`Isolation: ${lvl('action', o.actions.iso)}`, step(o.actions.iso) * (starC - 62) * 0.3],
    ['Hunt mismatches', o.huntMismatch ? 2 : 0],
  ]);
  const shooters = rows.filter((x) => x.c.c3 >= 66).reduce((a, x) => a + x.w, 0);
  set('spacing', 0.75 * wavg(rows, (x) => x.c.spacing) + 30 * shooters, `Shooters: ${leaders(rows, (x) => x.c.c3, name)}`, [
    [`Shot profile: ${lvl('threePoint', o.threePoint)}`, step(o.threePoint) * 6],
    [`Post-up: ${lvl('action', o.actions.post)}`, -step(o.actions.post) * 3],
    [`Motion & cuts: ${lvl('action', o.actions.motion)}`, step(o.actions.motion) * 2],
  ]);
  // (in the engine the rim comes from cutters and finishers, the drawn fouls with it, while shooters take
  // their shots outside and ball screens turn into pull-ups and kick-outs: fitted to each team's rim
  // attempts and free throws a shot against every other team, it ranks them at Spearman 0.65-0.79 a
  // league, where a creator-and-roll-man base ranked them at 0.32-0.73)
  const driver = (x: Row) => 0.6 * x.c.cut + 0.4 * x.c.rim;
  set('rim', wavg(rows, driver) - 0.4 * wavg(rows, (x) => x.c.c3) + 0.2 * wavg(rows, (x) => x.p.ratings.drw), `Finishers: ${leaders(rows, driver, name)}`, [
    [`Attack the rim: ${lvl('rimAttack', o.rimAttack)}`, step(o.rimAttack) * 6],
    [`Pick-and-roll: ${lvl('action', o.actions.pnr)}`, -step(o.actions.pnr) * 6],
  ]);
  set(
    'movement',
    wavg(rows, (x) => x.c.passing),
    `Passers: ${leaders(rows, (x) => x.c.passing, name)}`,
    [
      [`Motion & cuts: ${lvl('action', o.actions.motion)}`, step(o.actions.motion) * 6],
      [`Handoffs & screens: ${lvl('action', o.actions.handoff)}`, step(o.actions.handoff) * 4],
      [`Isolation: ${lvl('action', o.actions.iso)}`, -step(o.actions.iso) * 6],
    ],
  );
  const speed = (x: Row) => (x.p.ratings.spd + x.p.ratings.ath) / 2;
  set('transition', wavg(rows, speed), `Runners: ${leaders(rows, speed, name)}`, [
    [`After a stop: ${lvl('transition', o.transition)}`, step(o.transition) * 10],
    [`Tempo: ${lvl('pace', o.pace)}`, step(o.pace) * 5],
    [`Crash the offensive glass: ${lvl('crashBoards', o.crashBoards)}`, -step(o.crashBoards) * 4],
  ]);
  set(
    'glass',
    wavg(rows, (x) => x.c.orb),
    `Rebounders: ${leaders(rows, (x) => x.c.orb, name)}`,
    [[`Crash the offensive glass: ${lvl('crashBoards', o.crashBoards)}`, step(o.crashBoards) * 12]],
  );
  set(
    'security',
    wavg(rows, (x) => x.c.ballSec),
    `Handlers: ${leaders(rows, (x) => x.c.ballSec, name)}`,
    [
      [`Tempo: ${lvl('pace', o.pace)}`, -step(o.pace) * 3],
      [`Isolation: ${lvl('action', o.actions.iso)}`, -step(o.actions.iso) * 2],
    ],
  );

  // defense
  const bigs = rows.filter((x) => x.p.ratings.hgt >= 58);
  const anchor = best(bigs.length ? bigs : rows, (x) => x.c.rimProt);
  const anchorP = anchor ? anchor.c.rimProt : 45;
  const man = d.scheme === 'man';
  // (the rim is protected by the help behind the ball as much as by the anchor, and given up by
  // pressure the handlers beat: fitted to what each team gives up at the rim a shot against every other
  // team, it ranks them at Spearman 0.41-0.66 a league, the anchor-first base at 0.25-0.36)
  set('rimD', 0.25 * anchorP + 0.5 * wavg(rows, (x) => x.c.helpD) + 0.25 * wavg(rows, (x) => x.c.intDef), anchor ? `Anchor: ${name(anchor.p)}` : 'No rim protector', [
    [`Help defense: ${lvl('help', d.help)}`, step(d.help) * 5],
    [`Scheme: ${SCHEME_META[d.scheme].label}`, ZONE_RIM[d.scheme]],
    [`Ball-screen coverage: ${COVERAGE_META[d.pnr].label}`, man ? (d.pnr === 'drop' ? 6 : d.pnr === 'switch' ? -3 : 0) : 0],
    [`Ball pressure: ${lvl('pressure', d.pressure)}`, -step(d.pressure) * 12],
  ]);
  set(
    'perimD',
    wavg(rows, (x) => x.c.perDef),
    `Stoppers: ${leaders(rows, (x) => x.c.perDef, name)}`,
    [
      [`Ball pressure: ${lvl('pressure', d.pressure)}`, step(d.pressure) * 5],
      ['Switch off-ball screens', d.switchOffBall ? 2 : 0],
      [`Physicality: ${lvl('physicality', d.physicality)}`, step(d.physicality) * 2],
    ],
  );
  // the coverage and whether the players fit it
  const perim = wavg(rows, (x) => x.c.perDef);
  const top5 = [...rows].sort((a, b) => b.w - a.w).slice(0, 5);
  const spread = Math.max(...top5.map((x) => x.c.perDef)) - Math.min(...top5.map((x) => x.c.perDef));
  const bigSpd = bigs.length ? Math.max(...bigs.map((x) => x.p.ratings.spd)) : 45;
  const fit: Record<string, [number, string]> = {
    drop: [0.5 * anchorP + 0.5 * perim - 2, anchor ? `${name(anchor.p)} anchors the drop` : 'A drop with no rim protector'],
    switch: [perim + 18 - 0.45 * spread, spread <= 22 ? 'Defenders of a size to switch' : 'Mismatches when you switch'],
    hedge: [0.5 * perim + 0.5 * bigSpd + 2, `Bigs' mobility ${Math.round(bigSpd)}`],
    blitz: [0.5 * wavg(rows, (x) => x.c.steal) + 0.5 * wavg(rows, (x) => x.c.helpD) + 2, 'Hands and help behind the trap'],
    ice: [0.5 * perim + 0.5 * wavg(rows, (x) => x.c.helpD) + 3, 'Discipline to send it baseline'],
  };
  const [pnrBase, pnrWho] = man ? fit[d.pnr] : [0.5 * wavg(rows, (x) => x.c.helpD) + 0.5 * perim, `Your ${SCHEME_META[d.scheme].label} plays their ball screens`];
  set('pnrD', pnrBase, `${man ? `${COVERAGE_META[d.pnr].label}: ` : ''}${pnrWho}`, [[`Help defense: ${lvl('help', d.help)}`, man ? step(d.help) * 2 : 0]]);
  set('threeD', 0.6 * perim + 0.4 * wavg(rows, (x) => x.p.ratings.spd), `Closeouts: ${leaders(rows, (x) => x.c.perDef, name)}`, [
    [`Help defense: ${lvl('help', d.help)}`, -step(d.help) * 8],
    [`Scheme: ${SCHEME_META[d.scheme].label}`, ZONE_ARC[d.scheme]],
  ]);
  set(
    'boards',
    wavg(rows, (x) => x.c.drb),
    `Rebounders: ${leaders(rows, (x) => x.c.drb, name)}`,
    [[`Scheme: ${SCHEME_META[d.scheme].label}`, ZONE_GLASS[d.scheme]]],
  );
  set(
    'transD',
    wavg(rows, (x) => x.p.ratings.spd),
    'Your speed getting back',
    [
      [`Transition defense: ${lvl('getBack', d.getBack)}`, step(d.getBack) * 10],
      [`Crash the offensive glass: ${lvl('crashBoards', o.crashBoards)}`, -step(o.crashBoards) * 6],
      ['Full-court press: Always', d.press === 'always' ? -3 : 0],
    ],
  );
  set(
    'forceTo',
    wavg(rows, (x) => x.c.steal),
    `Hands: ${leaders(rows, (x) => x.c.steal, name)}`,
    [
      [`Ball pressure: ${lvl('pressure', d.pressure)}`, step(d.pressure) * 8],
      [d.press === 'always' ? 'Full-court press: Always' : 'Full-court press: After makes', d.press === 'always' ? 7 : d.press === 'afterMade' ? 4 : 0],
      ['Blitzing ball screens', man && d.pnr === 'blitz' ? 4 : 0],
      ['Star plan: Double-team', d.starPlan === 'double' ? 2 : 0],
    ],
  );
  return out;
}

/**
 * What the overhaul's levers add to each quality, as the engine plays them: the shape (five-out's open
 * paint as far as the five can shoot, and its glass; horns' handoffs and ball security; the double
 * post's glass and crowded paint), out-of-possession roles and glass duties.
 */
function systemMods(t: Tactics, rows: Row[], name: (p: Player) => string): Partial<Record<QualityId, [string, number][]>> {
  const out: Partial<Record<QualityId, [string, number][]>> = {};
  const add = (id: QualityId, text: string, v: number) => void (out[id] ??= []).push([text, v]);
  const five = [...rows].sort((a, b) => b.w - a.w).slice(0, 5);
  const shape = shapeOf(t.offense);
  const label = `Shape: ${SHAPE_META[shape].label}`;
  if (shape === 'fiveOut') {
    const exposed = five.reduce((a, x) => a + Math.max(0, 40 - x.c.spacing) / 40, 0);
    const open = 1 - 0.75 * exposed;
    add('spacing', label, 6 * open);
    // (its open paint is for the cutters it has; the shots it takes are threes: five-out teams got to
    // the rim on 29% of their shots against every other team, four-out ones 34%)
    add('rim', label, -4);
    add('glass', label, -5);
  } else if (shape === 'horns') {
    const bigPass = Math.max(0, ...five.filter((x) => x.p.ratings.hgt >= 58).map((x) => x.c.passing));
    add('movement', label, 2 + (bigPass - 55) / 8);
    add('security', label, 2);
    add('spacing', label, -1);
  } else if (shape === 'twoIn') {
    const bigs = [...five].sort((a, b) => b.p.ratings.hgt - a.p.ratings.hgt).slice(0, 2);
    const orb = bigs.reduce((a, x) => a + x.c.orb, 0) / Math.max(1, bigs.length);
    add('glass', label, 3 + (orb - 50) / 6);
    add('spacing', label, -5);
  }
  for (const x of five) {
    const role = defRoleOf(t.defense, x.p.pid);
    const who = `${name(x.p)}: ${DEF_ROLE_META[role].short}`;
    if (role === 'poa') {
      add('perimD', who, 2 + (x.c.perDef - 60) / 10);
      add('forceTo', who, 2);
    } else if (role === 'stopper') add('perimD', who, 2 + (x.c.perDef - 60) / 10);
    else if (role === 'anchor') {
      add('rimD', who, 2 + (x.c.rimProt - 60) / 8);
      add('pnrD', who, 1);
    } else if (role === 'roamer') {
      add('rimD', who, 2);
      add('threeD', who, -2);
    }
    const g = t.offense.glass?.[x.p.pid] ?? 0;
    if (g) {
      add('glass', `${name(x.p)}: ${g > 0 ? 'crashes' : 'gets back'}`, 2.5 * g);
      add('transD', `${name(x.p)}: ${g > 0 ? 'crashes' : 'gets back'}`, -1.5 * g);
    }
  }
  return out;
}

export interface SystemReport {
  off: Quality[];
  def: Quality[];
}

/**
 * Your system's report: each quality's grade and rank among the league's teams (theirs with their own
 * rotations and tactics), with `tactics` in place of your own when given (what a change would do).
 * `others` can carry the other teams' raw scores from an earlier call, so tinkering only works out yours.
 */
export function systemReport(
  league: League,
  tid: number,
  tactics?: Tactics,
  others?: Map<number, Record<QualityId, number>>,
  name: (p: Player) => string = (p) => p.lastName,
): SystemReport & { others: Map<number, Record<QualityId, number>> } {
  const theirs = others ?? new Map<number, Record<QualityId, number>>();
  if (!others)
    for (const tm of league.teams) {
      if (tm.tid === tid) continue;
      const q = qualities(league, tm.tid, tm.tactics, name);
      theirs.set(tm.tid, Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.raw])) as Record<QualityId, number>);
    }
  const mine = qualities(league, tid, tactics ?? league.teams[tid].tactics, name);
  const of = theirs.size + 1;
  const make = (id: QualityId): Quality => {
    const raw = mine[id].raw;
    const rank = 1 + [...theirs.values()].filter((x) => x[id] > raw).length;
    return { id, raw, rank, of, grade: gradeOf(rank, of), parts: mine[id].parts };
  };
  return { off: OFF_QUALITIES.map(make), def: DEF_QUALITIES.map(make), others: theirs };
}

/** The qualities whose grade differs between two reports, as "Second chances B → A". */
export function gradeChanges(a: SystemReport, b: SystemReport): { id: QualityId; from: Grade; to: Grade; up: boolean }[] {
  const out: { id: QualityId; from: Grade; to: Grade; up: boolean }[] = [];
  const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];
  for (const [x, y] of [...a.off.map((q, i) => [q, b.off[i]] as const), ...a.def.map((q, i) => [q, b.def[i]] as const)])
    if (x.grade !== y.grade) out.push({ id: x.id, from: x.grade, to: y.grade, up: ORDER.indexOf(y.grade) > ORDER.indexOf(x.grade) });
  return out;
}

/** How well a player suits each offensive role (0-100, on the ratings' scale): what the role asks of him, his size counted where it matters. */
export function roleFits(p: Player): Record<OffRole, number> {
  const c = composites(p.ratings);
  const h = p.ratings.hgt;
  const small = (n: number) => (h < 55 ? n : 0);
  return {
    creator: 0.4 * c.create + 0.35 * c.pnrHandle + 0.25 * c.pu3,
    scorer: 0.35 * c.create + 0.25 * c.midShot + 0.2 * c.pu3 + 0.2 * c.c3,
    playmaker: 0.55 * c.passing + 0.45 * c.pnrHandle,
    shooter: 0.6 * c.c3 + 0.4 * c.offBall,
    slasher: 0.4 * c.cut + 0.35 * c.rim + 0.25 * c.create,
    roller: 0.5 * c.roll + 0.25 * c.orb + 0.25 * c.rim - small(15),
    stretch: 0.6 * c.pop + 0.4 * c.c3 - small(15),
    post: c.postScore - (h < 50 ? 10 : 0),
    hub: 0.6 * c.passing + 0.4 * p.ratings.oiq - small(15),
    glue: 0.35 * c.c3 + 0.35 * c.perDef + 0.3 * c.passing,
  };
}

/**
 * How well a player suits each out-of-possession role (0-100): the point-of-attack stopper's feet
 * and hands on the ball, the wing stopper's on-ball defense and length, the rim anchor's rim
 * protection (a small one can't be one), the roamer's reads and help. A hidden defender suits the
 * role as much as he doesn't suit the others, and a position defender is his defense in general.
 */
export function defRoleFits(p: Player): Record<DefRole, number> {
  const c = composites(p.ratings);
  const r = p.ratings;
  const small = (n: number) => (r.hgt < 55 ? n : 0);
  const big = (n: number) => (r.hgt >= 62 ? n : 0);
  const general = 0.45 * c.perDef + 0.3 * c.intDef + 0.25 * c.helpD;
  return {
    standard: general,
    poa: 0.55 * c.perDef + 0.25 * c.steal + 0.2 * r.spd - big(15),
    stopper: 0.6 * c.perDef + 0.2 * r.diq + 0.2 * Math.min(r.hgt, 65) - big(8),
    anchor: 0.6 * c.rimProt + 0.4 * c.intDef - small(20),
    roamer: 0.55 * c.helpD + 0.25 * c.steal + 0.2 * c.rimProt,
    hide: clamp(110 - general, 30, 75),
  };
}

/**
 * A role fit on the fits' own scale, one to five (a fit of 70 or more is five): what the staff's own
 * rules compare (miscast, the AI's role picks). Not what the screens show: fits cluster at 45-65, so
 * on this scale a 3x All-NBA big read two stars at his natural roles. The screens rank a fit against
 * the league's rotation players at that role instead (roleStars).
 */
export const fitStars = (v: number) => Math.max(1, Math.min(5, Math.round((v - 30) / 10)));

/**
 * Stars another role has to be ahead by before a player counts as miscast. One star is inside what the
 * fits can tell apart: measured over the real league (paired seeds against every team), moving every
 * player one star short of his best role to it played no better, while moving the ones two or more
 * short won a little.
 */
export const MISCAST_STARS = 2;

/**
 * His best role among `fits` when it's MISCAST_STARS or more ahead of the one he plays (`cur`), else
 * null. Never Hidden: its fit is how poor a defender he is, not a role he'd play better in.
 */
export function miscast<R extends string>(fits: Record<R, number>, cur: R): R | null {
  const best = (Object.keys(fits) as R[]).reduce((a, r) => (r !== 'hide' && fits[r] > fits[a] ? r : a), cur);
  return fitStars(fits[best]) - fitStars(fits[cur]) >= MISCAST_STARS ? best : null;
}

/** Players a team counts for the role scale: its best nine by OVR, injured or not (about the league's rotation players). */
const SCALE_NINE = 9;

/** Each role's fits over the league's rotation players, sorted low to high: what a fit's stars are read against (roleStars). */
export interface RoleScale {
  off: Record<OffRole, number[]>;
  def: Record<DefRole, number[]>;
}

const scales = new WeakMap<League, { key: string; scale: RoleScale }>();

/** The league's role scale (worked out once a day: the league changes in place). */
export function roleScale(league: League): RoleScale {
  const key = `${league.season}:${league.phase}:${league.day}`;
  const memo = scales.get(league);
  if (memo?.key === key) return memo.scale;
  const off = {} as Record<OffRole, number[]>;
  const def = {} as Record<DefRole, number[]>;
  for (const t of league.teams) {
    const nine = teamPlayers(league, t.tid)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, SCALE_NINE);
    for (const p of nine) {
      for (const [r, v] of Object.entries(roleFits(p)) as [OffRole, number][]) (off[r] ??= []).push(v);
      for (const [r, v] of Object.entries(defRoleFits(p)) as [DefRole, number][]) (def[r] ??= []).push(v);
    }
  }
  for (const xs of [...Object.values(off), ...Object.values(def)]) xs.sort((a, b) => a - b);
  const scale = { off, def };
  scales.set(league, { key, scale });
  return scale;
}

/** Shares of the league's rotation players a fit has to be ahead of for two, three, four and five stars. */
const STAR_CUTS = [0.2, 0.45, 0.7, 0.9];

/**
 * A fit as the screens' stars, against the league's rotation players at that role (`scale`, sorted):
 * five for its top fifth, four for the next, down to one for its bottom fifth. So a player's natural
 * roles read three to five stars and a role he has no business in one or two (Towns, 2026-10: two
 * stars as a Rim Runner on the fits' own scale, five on this one).
 */
export function roleStars(scale: number[] | undefined, v: number): number {
  if (!scale?.length) return fitStars(v);
  let lo = 0;
  let hi = scale.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scale[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  const pct = lo / scale.length;
  return 1 + STAR_CUTS.filter((c) => pct >= c).length;
}

/**
 * The role the screens flag as a better fit ("Better fit"): miscast by the staff's rule (two stars on
 * the fits' scale, never Hidden) and ahead on the screens' stars too, so the flag never points at a
 * role that shows no more stars than his own.
 */
export function betterFit<R extends string>(scale: Record<R, number[]>, fits: Record<R, number>, cur: R): R | null {
  const best = miscast(fits, cur);
  return best && roleStars(scale[best], fits[best]) > roleStars(scale[cur], fits[cur]) ? best : null;
}
