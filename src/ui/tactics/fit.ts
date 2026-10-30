// Playbook fit as the Tactics screen says it: the staff's read of each playbook for this roster (coachAI's
// fits, a tenth of a point a game each, calibrated against the engine) against the playbook in use, in
// the staff's words (core/analysis/staffWords.ts), never the figure; a fit's parts, for what suits the
// roster and what works against it; and the hand-over sheet's line, what the user's own staff would run
// (by that same read: StaffFor in coachAI) and how it compares with his.
import type { League, Tactics } from '../../core/types';
import { autoTactics, defPresetFit, fitRoster, offPresetFit, rosterProfile, type FitTerm } from '../../core/ai/coachAI';
import { leanOf, type Lean } from '../../core/analysis/staffWords';
import { rosterSorted } from '../../core/league/helpers';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';

/** A preset's reading against the one in use, points a game (against an average playbook when no preset is in use). */
const versus = (id: string, fits: Record<string, number>, cur: string) => Math.round(fits[id] - (fits[cur] ?? 0)) / 10;

const TIER: Record<Lean, number> = { gain: 0, even: 1, cost: 2 };

/**
 * The presets by fit against the one in use: better fits, similar ones, worse ones, keeping the list's
 * own order inside each, so the order says no more than the words beside it do.
 */
export function byFit<T extends { id: string }>(presets: T[], fits: Record<string, number>, cur: string): T[] {
  const tier = (p: T) => TIER[leanOf(versus(p.id, fits, cur))];
  return [...presets].sort((a, b) => tier(a) - tier(b));
}

/** The preset the staff reads as the best fit, what it would pick (ties: the list's first). */
export const bestFit = <T extends { id: string }>(presets: T[], fits: Record<string, number>): T => presets.reduce((a, p) => (fits[p.id] > fits[a.id] ? p : a), presets[0]);

export interface ShownFit {
  /** Its lean against the playbook in use (even for that playbook itself). */
  lean: Lean;
  /** The roster qualities that move it, each with which way (parts that round to nothing left out). */
  parts: { term: FitTerm; v: number }[];
}

/** Preset `id`'s fit as shown, against preset `cur` (the one in use). */
export function shownFit(id: string, terms: FitTerm[], fits: Record<string, number>, cur: string): ShownFit {
  const parts = terms
    .filter((t) => t.key !== 'base')
    .map((term) => ({ term, v: Math.round(term.value) }))
    .filter((p) => p.v !== 0);
  return { lean: leanOf(versus(id, fits, cur)), parts };
}

/** The tactics the user's staff would put in for this roster (as the hand-over does). */
export const userStaffTactics = (l: League): Tactics => {
  const tm = l.teams[l.userTid];
  return autoTactics({ ...tm, tactics: { ...tm.tactics, manual: false } }, rosterSorted(l, l.userTid), false, { user: true });
};

/** What the hand-over sheet says the staff would run: its playbooks and how the staff reads them against the user's. */
export function handOverLine(l: League, staff: Tactics): string {
  const t = l.teams[l.userTid].tactics;
  const name = `${OFF_PRESETS.find((p) => p.id === staff.offPreset)?.name ?? 'their offense'} · ${DEF_PRESETS.find((p) => p.id === staff.defPreset)?.name ?? 'their defense'}`;
  if (staff.offPreset === t.offPreset && staff.defPreset === t.defPreset) return `The staff would keep ${name}, with their own settings, roles and shape.`;
  const pr = rosterProfile(fitRoster(rosterSorted(l, l.userTid)));
  const off = offPresetFit(pr);
  const def = defPresetFit(pr);
  // (an end the user runs no playbook at reads as even: the read is of playbooks)
  const vs = (fits: Record<string, number>, mine: string, theirs: string) => (fits[mine] === undefined ? 0 : fits[theirs] - fits[mine]);
  const lean = leanOf(Math.round(vs(off, t.offPreset, staff.offPreset) + vs(def, t.defPreset, staff.defPreset)) / 10);
  const read = lean === 'gain' ? 'Better fit than yours' : lean === 'cost' ? 'Worse fit than yours' : 'About even with yours';
  return `Staff would run ${name}. ${read}, by their read.`;
}
