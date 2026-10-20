// The coach's three tactics, as Football Manager keeps them: Tactic A, B and C. The active one is the
// team's tactics (what every game, screen and the staff read); the others wait in Team.slots and are
// drilled in practice too (a little less), so switching to one in a game, or in a situational plan,
// plays it at the familiarity the team has built with it. A slot is a whole tactic: shape, roles at
// both ends, every instruction.

import type { SituationalPlan, Tactics, TacticSlots, Team, TacticsPatch } from '../types';
import { cloneTactics, tacticsDiff, withoutGameSpecific } from './tactics';

export const SLOT_COUNT = 3;
export const SLOT_LETTERS = ['A', 'B', 'C'] as const;
const DEFAULT_NAMES = ['Main', 'Plan B', 'Plan C'];

/** The team's slots, made if it has none (A is its tactics, B and C empty). */
export function ensureSlots(team: Team): TacticSlots {
  return (team.slots ??= { active: 0, names: [...DEFAULT_NAMES], stored: [null, null, null] });
}

/** Slot `i`'s tactics: the team's own for the active one, the stored copy for another (null when empty). */
export function slotTactics(team: Team, i: number): Tactics | null {
  const s = team.slots;
  if (!s || i === s.active) return i === (s?.active ?? 0) ? team.tactics : null;
  return s.stored[i] ?? null;
}

/** A slot's name: "Main", "Plan B", or what the coach called it. */
export const slotName = (team: Team, i: number): string => team.slots?.names[i] ?? DEFAULT_NAMES[i];

/** A slot's label: "A · Main". */
export function slotLabel(team: Team, i: number): string {
  return `${SLOT_LETTERS[i]} · ${slotName(team, i)}`;
}

/** The active slot's index (0 when the team keeps one tactic). */
export const activeSlot = (team: Team) => team.slots?.active ?? 0;

/**
 * Make slot `i` the team's tactics: the active ones go back to their slot, and an empty slot starts
 * as a copy of them. Tonight's opponent-specific parts (matchups, hunt and chase targets) stay with
 * the team. False when `i` isn't a slot.
 */
export function switchSlot(team: Team, i: number): boolean {
  if (i < 0 || i >= SLOT_COUNT) return false;
  const s = ensureSlots(team);
  if (i === s.active) return true;
  const cur = team.tactics;
  const next = s.stored[i] ? cloneTactics(s.stored[i]!) : cloneTactics(cur);
  // (the coach's tonight-only choices carry over: they're his for this opponent, whatever the system)
  next.defense.matchups = { ...cur.defense.matchups };
  next.defense.starTarget = cur.defense.starTarget;
  next.manual = cur.manual;
  s.stored[s.active] = withoutGameSpecific(cur);
  s.stored[i] = null;
  s.active = i;
  team.tactics = next;
  return true;
}

/** Copy the active tactics into slot `i` (a fresh start for B or C). */
export function copyToSlot(team: Team, i: number): boolean {
  const s = ensureSlots(team);
  if (i < 0 || i >= SLOT_COUNT || i === s.active) return false;
  s.stored[i] = withoutGameSpecific(team.tactics);
  return true;
}

/** Empty slot `i` (not the active one). */
export function clearSlot(team: Team, i: number): boolean {
  const s = ensureSlots(team);
  if (i < 0 || i >= SLOT_COUNT || i === s.active) return false;
  s.stored[i] = null;
  // a situational plan that switched to it has nothing to switch to
  for (const t of [team.tactics, ...s.stored]) for (const sit of t?.situations ?? []) if (sit.slot === i) delete sit.slot;
  return true;
}

/** Rename slot `i` (trimmed, at most 24 characters; empty: its default name). */
export function renameSlot(team: Team, i: number, name: string) {
  const s = ensureSlots(team);
  if (i < 0 || i >= SLOT_COUNT) return;
  s.names[i] = name.trim().replace(/\s+/g, ' ').slice(0, 24) || DEFAULT_NAMES[i];
}

/**
 * The patch a situational plan that switches to a slot plays: everything the slot changes from the
 * base tactics, as tacticsDiff carries it (the slot's own situational plans aren't played: one plan
 * at a time). Null when it has no slot or the slot is empty.
 */
export function slotPatch(team: Team, base: Tactics, sit: SituationalPlan): TacticsPatch | null {
  if (sit.slot === undefined) return null;
  const to = sit.slot === activeSlot(team) ? null : team.slots?.stored[sit.slot];
  if (!to) return null;
  const target = cloneTactics(to);
  delete target.situations;
  const from = cloneTactics(base);
  delete from.situations;
  return tacticsDiff(from, target);
}

/** Tactics whose situational plans that switch slots carry the slot's changes as their patch, ready for a game. */
export function withSlotPlans(team: Team, t: Tactics): Tactics {
  if (!t.situations?.some((s) => s.slot !== undefined)) return t;
  const out = cloneTactics(t);
  out.situations = out.situations!.map((s) => {
    const patch = slotPatch(team, t, s);
    return patch ? { ...s, patch } : s;
  });
  return out;
}
