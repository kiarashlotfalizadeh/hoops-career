// The matchups a game plan starts from: who the staff would put on each of the opponent's projected
// top eight at tip-off, solved as the engine solves them on the floor (src/core/sim/matchups.ts),
// with the plan's own assignments on top, and what each pairing means.

import type { League, Player, RatingKey, ScheduledGame, Tactics } from '../types';
import { ROLE_USAGE, archetype, attrDisplay, composites } from '../ratings';
import { K, type SimTeamInput } from '../sim/engine';
import { solveMatchups } from '../sim/matchups';
import { defRoleOf } from '../sim/tactics';
import { buildMinutePlan, planInputs, planRoles } from '../sim/rotationPlan';
import { ratingText } from './guarding';
import { buildSimInput } from '../league/games';

export interface MatchupRow {
  /** Their player. */
  pid: number;
  /** In their opening five (else off their bench). */
  starter: boolean;
  /** The defender the staff would choose. */
  auto: number | null;
  /** The defender the plan (or your base tactics) names. */
  planned: number | null;
}

export interface MatchupPreview {
  /** Their projected top eight, the opening five first. */
  theirs: Player[];
  /** Your projected top ten, the opening five first. */
  mine: Player[];
  rows: MatchupRow[];
}

/**
 * How much an offense runs through a player at tip-off (fresh legs, nothing in the box yet): the
 * engine's usage weight for isolations plus pick-and-rolls, which is what its matchups weigh.
 */
/** A player's isolations and ball screens, as the engine's usage weighs them at tip-off. */
function tipOffParts(p: Player, t: Tactics, perf = 1): [number, number] {
  const role = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
  const c = composites(p.ratings);
  const fr = t.offense.freedom[p.pid] ?? 0;
  const freedom = fr === 1 ? K.freedomGreen : fr === -1 ? K.freedomLimited : 1;
  const w = (skill: number) => ROLE_USAGE[role] * freedom * (p.tend?.use ?? 1) * (p.tend?.create ?? 1) * Math.pow(Math.max(5, skill) / 50, K.usageExp) * perf;
  const pnr = role === 'roller' || role === 'stretch' ? c.pnrHandle * 0.55 : c.pnrHandle;
  return [w(0.55 * c.create + 0.45 * Math.max(c.midShot, c.pu3, c.rim)), w(pnr)];
}

/** The engine's split for matchups: a big is guarded by interior defense. */
const isBig = (p: Player) => planRoles(p.ratings, p.pos).big;

/**
 * A side's top `n` as the engine would open the game: the minute plan's first five (the depth
 * chart's first five available, unless the plan balances it), then the rest by planned minutes.
 */
function projected(input: SimTeamInput, n: number, type: ScheduledGame['type']): { opening: Player[]; all: Player[] } {
  const rot = input.team.rotation;
  const rest = new Set(input.rest ?? []);
  const order = new Map(rot.order.map((pid, i) => [pid, i]));
  const roster = [...input.players].sort((a, b) => (order.get(a.pid) ?? 99 + (100 - a.ovr)) - (order.get(b.pid) ?? 99 + (100 - b.ovr)));
  const available = (p: Player) => !(p.injury && p.injury.gamesRemaining > 0) && !rest.has(p.pid);
  const pp = planInputs(
    roster.map((p) => ({ pid: p.pid, available: available(p), ...planRoles(p.ratings, p.pos), endurance: p.ratings.end })),
    rot,
    { playoffs: type === 'playoffs' },
  );
  const plan = pp.length ? buildMinutePlan(pp) : [];
  const byId = new Map(roster.map((p) => [p.pid, p]));
  const opening = (plan[0] ?? []).map((pid) => byId.get(pid)!).filter(Boolean);
  for (const p of roster) if (opening.length < 5 && available(p) && !opening.includes(p)) opening.push(p);
  const minutes = new Map<number, number>();
  for (const slot of plan) for (const pid of slot) minutes.set(pid, (minutes.get(pid) ?? 0) + 1);
  const bench = roster.filter((p) => available(p) && !opening.includes(p)).sort((a, b) => (minutes.get(b.pid) ?? 0) - (minutes.get(a.pid) ?? 0));
  return { opening, all: [...opening, ...bench].slice(0, n) };
}

/**
 * Their top eight against your top ten for the game plan against `opp`, as the next meeting would
 * open (rest days and wear included): opening fives against each other, then their bench
 * against yours, each unit solved as the staff would at tip-off, honouring the planned pairs within
 * it; a planned matchup across the units stands as planned.
 */
export function previewMatchups(league: League, opp: number): MatchupPreview {
  const me = league.userTid;
  const g = league.schedule.filter((x) => !x.played && ((x.home === me && x.away === opp) || (x.away === me && x.home === opp))).sort((a, b) => a.day - b.day)[0];
  const day = g?.day ?? league.day;
  const type = g?.type ?? 'regular';
  const mineIn = buildSimInput(league, me, day, type, opp, g);
  const theirIn = buildSimInput(league, opp, day, type, me, g);
  const mine = projected(mineIn, 10, type);
  const theirs = projected(theirIn, 8, type);
  const manual = mineIn.team.tactics.defense.matchups;
  const scorer = (p: Player) => {
    const [iso, pnr] = tipOffParts(p, theirIn.team.tactics, theirIn.perf?.[p.pid] ?? 1);
    return { pid: p.pid, hgt: p.ratings.hgt, big: isBig(p), threat: iso + pnr, handle: pnr, shoot: composites(p.ratings).spacing };
  };
  const defender = (p: Player) => {
    const c = composites(p.ratings);
    return { pid: p.pid, hgt: p.ratings.hgt, intDef: c.intDef, perDef: c.perDef, role: defRoleOf(mineIn.team.tactics.defense, p.pid) };
  };
  const auto = new Map<number, number>();
  const solve = (off: Player[], def: Player[]) => {
    const pick = solveMatchups(off.map(scorer), def.map(defender), manual);
    off.forEach((o, i) => pick[i] >= 0 && auto.set(o.pid, def[pick[i]].pid));
  };
  solve(theirs.opening, mine.opening);
  solve(
    theirs.all.filter((p) => !theirs.opening.includes(p)),
    mine.all.filter((p) => !mine.opening.includes(p)),
  );
  const rows = theirs.all.map((p) => ({ pid: p.pid, starter: theirs.opening.includes(p), auto: auto.get(p.pid) ?? null, planned: manual[p.pid] ?? null }));
  return { theirs: theirs.all, mine: mine.all, rows };
}

export interface MatchupNote {
  text: string;
  tone: 'good' | 'warn' | 'bad';
}

/**
 * What a pairing means, from your defender's side: the size gap, and his rating with the ball against
 * your defender's at his spot, his first, by their names and values on the Ratings tab ("Ball handling
 * 81 vs perimeter defense 69"; post play or finishing against interior defense). Green is your edge,
 * yellow worth watching, red a mismatch to fix.
 */
export function matchupNotes(them: Player, me: Player): MatchupNote[] {
  const out: MatchupNote[] = [];
  const gap = Math.round(them.heightIn - me.heightIn);
  if (gap >= 3) out.push({ text: `Your defender gives up ${gap} inches`, tone: gap >= 6 ? 'bad' : 'warn' });
  else if (gap <= -4) out.push({ text: `Your defender has ${-gap} inches on him`, tone: 'good' });
  const big = isBig(them);
  const his: RatingKey = big ? (them.ratings.post > them.ratings.ins ? 'post' : 'ins') : 'hnd';
  const yours: RatingKey = big ? 'intD' : 'perD';
  const gapR = attrDisplay(them.ratings[his]) - attrDisplay(me.ratings[yours]);
  // (always his then yours, as the row reads left to right: the colour says whose edge it is)
  const vs = `${ratingText(them, his).replace(/^./, (c) => c.toUpperCase())} vs ${ratingText(me, yours)}`;
  if (gapR >= 6) out.push({ text: vs, tone: gapR >= 12 ? 'bad' : 'warn' });
  else if (gapR <= -6) out.push({ text: vs, tone: 'good' });
  return out;
}
