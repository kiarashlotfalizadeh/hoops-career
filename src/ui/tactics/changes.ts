// What a change to the tactics does, in the words of the Tactics screen's own controls, wherever it
// is shown: a saved playbook against the tactics now, a game plan's items, the staff's counters, a
// situational plan. One name for each setting everywhere.
import { tacticsChanges, type TacticsChange } from '../../core/sim/playbooks';
import { ACTION_META, COVERAGE_META, MENTALITY_META, PRESS_META, SCHEME_META, STAR_PLAN_META, levelName, type LeveledTactic } from '../../core/sim/tactics';
import type { Tactics, TacticsPatch } from '../../core/types';

/** Every setting that differs from `a` to `b` (core/sim/playbooks names each as the Tactics screen does). */
export const screenChanges = (a: Tactics, b: Tactics, nameOf?: (pid: number) => string) => tacticsChanges(a, b, nameOf);

/** "Help defense: Balanced → Pack the paint · Star plan: Play straight → Deny". */
export const changesLine = (list: TacticsChange[]) => list.map((c) => (c.from || c.to ? `${c.label}: ${c.from} → ${c.to}` : `${c.label} changes`)).join(' · ');

/** Each 0-100 tactic a situational plan can move, as its control is named. */
const LEVELED: Record<string, { label: string; level: LeveledTactic }> = {
  pace: { label: 'Pace', level: 'pace' },
  transition: { label: 'Push in transition', level: 'transition' },
  threePoint: { label: 'Three-point emphasis', level: 'threePoint' },
  rimAttack: { label: 'Attack the rim', level: 'rimAttack' },
  crashBoards: { label: 'Crash the offensive glass', level: 'crashBoards' },
  help: { label: 'Help defense', level: 'help' },
  pressure: { label: 'Ball pressure', level: 'pressure' },
  getBack: { label: 'Transition defense', level: 'getBack' },
  physicality: { label: 'Physicality', level: 'physicality' },
};

const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}`;

/**
 * A patch's changes, a few words each: the mentality it plays ("Mentality: Very aggressive"), a
 * setting it sets reads as its level ("Pace: Run & gun"), one it moves as the move ("Pace −25"), a
 * scheme or press by name.
 */
export function patchParts(p: TacticsPatch): string[] {
  const out: string[] = [];
  if (p.mentality !== undefined) out.push(`Mentality: ${MENTALITY_META[p.mentality].label}`);
  const { actions, ...off } = p.offense ?? {};
  if (off.huntMismatch) out.push('Hunt mismatches');
  for (const [k, v] of Object.entries(off)) if (typeof v === 'number' && LEVELED[k]) out.push(`${LEVELED[k].label}: ${levelName(LEVELED[k].level, v)}`);
  for (const [k, v] of Object.entries(actions ?? {})) out.push(`${ACTION_META[k as keyof typeof ACTION_META].label}: ${levelName('action', v as number)}`);
  const d = p.defense ?? {};
  if (d.scheme) out.push(SCHEME_META[d.scheme].label);
  if (d.pnr) out.push(`${COVERAGE_META[d.pnr].label} coverage`);
  if (d.press) out.push(d.press === 'none' ? 'No press' : `Press ${PRESS_META[d.press].label.toLowerCase()}`);
  if (d.starPlan) out.push(`Star plan: ${STAR_PLAN_META[d.starPlan].label}`);
  for (const [k, v] of Object.entries(d)) if (typeof v === 'number' && LEVELED[k]) out.push(`${LEVELED[k].label}: ${levelName(LEVELED[k].level, v)}`);
  const n = p.nudge ?? {};
  for (const [k, v] of [...Object.entries(n.offense ?? {}), ...Object.entries(n.defense ?? {})]) if (v) out.push(`${LEVELED[k]?.label ?? k} ${signed(v)}`);
  for (const [k, v] of Object.entries(n.actions ?? {})) if (v) out.push(`${ACTION_META[k as keyof typeof ACTION_META].label} ${signed(v)}`);
  return out;
}

/** What a situational plan changes, in a few words: "Pace −25 · Transition defense +20 · 3-2 Zone". */
export function patchText(p: TacticsPatch): string {
  const out = patchParts(p);
  return out.length ? out.join(' · ') : 'No changes yet';
}
