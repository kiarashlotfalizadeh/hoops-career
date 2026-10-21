// The touchline's reading of the coach's tactic slots and of what the team has drilled, in a live
// game: which slot the team plays now, a slot as tonight's game plays it (switching to it), and how
// familiar the team is with a slot or a discrete option (a scheme, a coverage, a shape, a press), from
// the familiarity the game is played with (opponent prep's drilled game plan included). Pure.

import type { Familiarity, League, Player, Tactics, Team } from '../../core/types';
import type { LiveGame } from '../../state/live';
import { chasers, shapeOf, withoutGameSpecific } from '../../core/sim/tactics';
import { SLOT_COUNT, activeSlot, slotTactics, withSlotPlans } from '../../core/sim/slots';
import { famDims, famOverall, optValue, rotationWeights } from '../../core/sim/familiarity';
import { effectiveTactics } from '../../core/league/gamePlans';
import { slotMatcher } from '../../core/analysis/moves';
import { teamPlayers } from '../../core/league/helpers';
import { linksAmong, type Clash, type Link } from '../../core/sim/links';
import { resetToPlan } from './pills';

/** At or above this a figure needs no warning beside an option (the screens' "Fluid"). */
export const FAM_OK = 90;

/** The opponent in a live game. */
const oppOf = (lg: LiveGame) => (lg.userSide === 0 ? lg.game.away : lg.game.home);

/**
 * Slot `i` as tonight's game plays it, switched to from `now`: the slot's tactics with tonight's game
 * plan on top, and tonight's orders on their players carried over as they stand (matchups, the star
 * target, how to guard each of them, the chase, the man to attack, the hack targets), as a switch on
 * the Tactics screen keeps them. Its situational plans that switch slots play from it. Null for an
 * empty slot.
 */
export function slotForGame(league: League, lg: LiveGame, i: number, now: Tactics): Tactics | null {
  const team = league.teams[lg.userTid];
  const src = slotTactics(team, i);
  if (!src) return null;
  const next = effectiveTactics(league, oppOf(lg), lg.game, src);
  const d = now.defense;
  next.defense.matchups = { ...d.matchups };
  next.defense.starTarget = d.starTarget;
  if (d.playerD) next.defense.playerD = { ...d.playerD };
  else delete next.defense.playerD;
  if (d.chase?.length && chasers(next.defense.scheme) > 0) next.defense.chase = d.chase.slice(0, chasers(next.defense.scheme));
  if (now.offense.huntTarget != null) next.offense.huntTarget = now.offense.huntTarget;
  if (now.manage.hackTargets?.length) {
    next.manage.hackTargets = [...now.manage.hackTargets];
    if (now.manage.hackFromQ !== undefined) next.manage.hackFromQ = now.manage.hackFromQ;
  }
  next.manual = now.manual;
  // (its plans that switch to another slot carry that slot's changes, slot i being the one in play)
  const s = team.slots;
  if (!s) return next;
  const stored = s.stored.map((x, k) => (k === i ? null : k === s.active ? withoutGameSpecific(team.tactics) : x));
  return withSlotPlans({ ...team, tactics: next, slots: { ...s, active: i, stored } }, next);
}

/**
 * The slot the team plays now: the last tactics the coach put in that were exactly one of the slots
 * (a switch, or "Reset to game plan"), changes made on it since included; the one the game tipped off
 * with until then.
 */
export function currentSlot(league: League, lg: LiveGame): number {
  const team = league.teams[lg.userTid];
  const tip = activeSlot(team);
  const match = slotMatcher(league, lg.game);
  const ops = lg.journal.ops;
  for (let k = ops.length - 1; k >= 0; k--) {
    const o = ops[k];
    if (o.op !== 'tactics') continue;
    const i = match(o.args.tactics);
    if (i !== null) return i;
  }
  return tip;
}

/** The slot the game tipped off with. */
export const tipSlot = (league: League, lg: LiveGame) => activeSlot(league.teams[lg.userTid]);

/** One slot on the touchline: its index, tactics as tonight plays them (null: empty) and familiarity. */
export interface LiveSlot {
  i: number;
  tactics: Tactics | null;
  /** The team's familiarity with it (0-100), its rotation's roles weighing in. */
  fam: number;
}

/** The team's familiarity with tactics `t` as the game plays them: every part, the rotation's roles by their minutes. */
export function famWith(fam: Familiarity | undefined, team: Team, roster: Player[], t: Tactics): number {
  return famOverall(famDims(fam, t, roster, rotationWeights(team, roster)));
}

/** Every slot as tonight would play it from `now` (the one in play as it is now), with the team's familiarity with each, and the one in play. */
export function liveSlots(league: League, lg: LiveGame, now: Tactics): { cur: number; slots: LiveSlot[] } {
  const team = league.teams[lg.userTid];
  const roster = teamPlayers(league, lg.userTid);
  const fam = lg.sim.T[lg.userSide].fam;
  const cur = currentSlot(league, lg);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = i === cur ? now : slotForGame(league, lg, i, now);
    return { i, tactics: t, fam: t ? famWith(fam, team, roster, t) : 0 };
  });
  return { cur, slots };
}

/** How well the team knows a discrete option ('scheme:zone23', 'pnr:blitz', 'shape:fiveOut', 'press:always'), as tonight's game plays it. */
export function liveOpt(lg: LiveGame, key: string): number {
  return optValue(lg.sim.T[lg.userSide].fam, key);
}

/** " · 35%" beside an option the team hasn't drilled to fluid, '' for one it has. */
export const famSuffix = (v: number) => (v >= FAM_OK ? '' : ` · ${Math.round(v)}%`);

/** The option keys a control's choices map to. */
export const OPT = {
  scheme: (s: string) => `scheme:${s}`,
  pnr: (c: string) => `pnr:${c}`,
  shape: (s: string) => `shape:${s}`,
  press: (p: string) => (p === 'none' ? null : `press:${p}`),
};

/** Tactics `t` with mentality `m`: the game's own value back when it's what the game tipped off with (so "Reset" isn't offered for nothing). */
export function withMentalityOf(x: Tactics, m: number, planned: Tactics) {
  if (m === (planned.mentality ?? 0)) {
    if (planned.mentality === undefined) delete x.mentality;
    else x.mentality = planned.mentality;
  } else x.mentality = m as Tactics['mentality'];
}

/** Tactics `x` in shape `s` (the same care as withMentalityOf). */
export function withShapeOf(x: Tactics, s: Tactics['offense']['shape'], planned: Tactics) {
  if (s === shapeOf(planned.offense)) {
    if (planned.offense.shape === undefined) delete x.offense.shape;
    else x.offense.shape = planned.offense.shape;
  } else x.offense.shape = s;
}

/** Tactics replaced whole (a field the new ones don't have goes: a mentality, a set package). */
export const replaceWith = resetToPlan;

/**
 * The partnerships and clashes of the user's five on the floor, as the engine plays them now (their
 * roles as played, the shape, the understanding the team keeps).
 */
export function floorLinks(lg: LiveGame): { links: Link[]; clashes: Clash[] } {
  const T = lg.sim.T[lg.userSide];
  return linksAmong(
    T.on.map((p) => ({ pid: p.pid, off: p.role, def: p.drole, c: p.c })),
    shapeOf(T.base.offense),
    T.fam,
  );
}
