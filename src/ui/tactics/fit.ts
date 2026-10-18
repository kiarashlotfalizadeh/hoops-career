// Playbook fit as the Tactics screen shows it: one scale (100 for the playbook that suits the roster
// best, 45 for the one that suits it least), its colour bands, and a fit broken into the parts it is
// made of on that same scale, so the parts add up to the number on the row.
import { fitScale, type FitTerm } from '../../core/ai/coachAI';

/** A fit's band: great (85 and up) reads good, poor (under 60) bad, the rest plain. */
export const fitTone = (v: number): '' | 'good' | 'bad' => (v >= 85 ? 'good' : v < 60 ? 'bad' : '');

/** The presets by shown fit, best first (ties keep the list's own order). */
export function byFit<T extends { id: string }>(presets: T[], fits: Record<string, number>): T[] {
  return [...presets].sort((a, b) => fits[b.id] - fits[a.id]);
}

export interface ShownFit {
  /** The fit on the row. */
  shown: number;
  /** Its place among the presets, 1 for the best. */
  rank: number;
  /** What the playbook starts from before the roster's qualities move it. */
  start: number;
  /** Each roster quality's part, on the shown scale (parts that round to nothing left out). */
  parts: { term: FitTerm; v: number }[];
}

/**
 * Preset `id`'s fit on the shown scale. The scale is a straight line from the raw fit points, so each
 * part scales the same way; the start takes what's left, and start + parts is the shown fit exactly.
 */
export function shownFit(id: string, terms: FitTerm[], fits: Record<string, number>): ShownFit {
  const vals = Object.values(fits);
  const k = 55 / Math.max(1, Math.max(...vals) - Math.min(...vals));
  const shown = fitScale(fits)(id);
  const parts = terms
    .filter((t) => t.key !== 'base')
    .map((term) => ({ term, v: Math.round(term.value * k) }))
    .filter((p) => p.v !== 0);
  const rank = 1 + vals.filter((x) => x > fits[id]).length;
  return { shown, rank, start: shown - parts.reduce((a, p) => a + p.v, 0), parts };
}
