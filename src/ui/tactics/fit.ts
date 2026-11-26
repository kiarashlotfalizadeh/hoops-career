// Playbook fit as the Tactics screen says it: for each playbook, the roster qualities that suit it and
// the ones that work against it (coachAI's fit terms), with the players behind each. The reasons only.
// The staff's own total for a playbook (a tenth of a point a game each, calibrated against the engine)
// isn't shown, and the list isn't ordered or tagged by it: until 2026-11-26 every playbook carried
// "Better fit" or "Worse fit" against the one in use, best first, and picking a style was reading the
// top row. Which playbook the roster should run is the coach's call from the reasons; his staff
// still goes by its total when he hands the tactics over (StaffFor in coachAI), and the hand-over
// sheet names what it would run.
import type { League, Tactics } from '../../core/types';
import { autoTactics, type FitTerm } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';

/** The roster qualities that move a playbook's fit, each with which way (parts that round to nothing left out). */
export type FitParts = { term: FitTerm; v: number }[];

/** A playbook's fit as shown: what suits the roster and what works against it. */
export function fitParts(terms: FitTerm[]): FitParts {
  return terms
    .filter((t) => t.key !== 'base')
    .map((term) => ({ term, v: Math.round(term.value) }))
    .filter((p) => p.v !== 0);
}

/** The tactics the user's staff would put in for this roster (as the hand-over does). */
export const userStaffTactics = (l: League): Tactics => {
  const tm = l.teams[l.userTid];
  return autoTactics({ ...tm, tactics: { ...tm.tactics, manual: false } }, rosterSorted(l, l.userTid), false, { user: true });
};

/** What the hand-over sheet says the staff would run: its playbooks by name (its pick, not a grade of his). */
export function handOverLine(l: League, staff: Tactics): string {
  const t = l.teams[l.userTid].tactics;
  const name = `${OFF_PRESETS.find((p) => p.id === staff.offPreset)?.name ?? 'their offense'} · ${DEF_PRESETS.find((p) => p.id === staff.defPreset)?.name ?? 'their defense'}`;
  if (staff.offPreset === t.offPreset && staff.defPreset === t.defPreset) return `The staff would keep ${name}, with their own settings, roles and shape.`;
  return `Staff would run ${name}, with their own settings, roles and shape.`;
}
