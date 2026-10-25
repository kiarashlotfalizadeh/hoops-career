// Playbook fit as the Tactics screen shows it: the staff's read of what each playbook is worth a game
// for this roster (coachAI's fits, a tenth of a point a game each, calibrated against the engine),
// against the playbook in use, in the same unit a change is measured in when it's made (editWatch); and
// a fit broken into the parts it's made of, in points a game too, so its start and parts add up to what
// it's worth against an average playbook.
import type { FitTerm } from '../../core/ai/coachAI';
import { WORTH_MIN } from '../../core/ai/counterWorth';

/** A read's tone: half a point a game or more either way reads as a gain or a cost, as a measured change does. */
export const fitTone = (pts: number): '' | 'good' | 'bad' => (pts >= WORTH_MIN ? 'good' : pts <= -WORTH_MIN ? 'bad' : '');

/** "+0.6", "−1.2", "0.0": a read in points a game. */
export const readText = (pts: number) => (pts > 0 ? `+${pts.toFixed(1)}` : pts < 0 ? `−${Math.abs(pts).toFixed(1)}` : '0.0');

/** The presets by their fit, best first (ties keep the list's own order). */
export function byFit<T extends { id: string }>(presets: T[], fits: Record<string, number>): T[] {
  return [...presets].sort((a, b) => fits[b.id] - fits[a.id]);
}

export interface ShownFit {
  /** Points a game against the playbook in use (0 for it). */
  vs: number;
  /** Its place among the presets, 1 for the best. */
  rank: number;
  /** What it's worth against an average playbook for this roster, points a game: start + parts, exactly. */
  total: number;
  /** What it's worth for a typical roster, before this roster's qualities move it. */
  start: number;
  /** Each roster quality's part, points a game (parts that round to nothing left out). */
  parts: { term: FitTerm; v: number }[];
}

/**
 * Preset `id`'s fit as shown, against preset `cur` (the one in use). Worked in tenths of a point so
 * the start takes what the rounded parts leave and start + parts is the total exactly.
 */
export function shownFit(id: string, terms: FitTerm[], fits: Record<string, number>, cur: string): ShownFit {
  const parts = terms
    .filter((t) => t.key !== 'base')
    .map((term) => ({ term, v10: Math.round(term.value) }))
    .filter((p) => p.v10 !== 0);
  const total10 = Math.round(fits[id]);
  const start10 = total10 - parts.reduce((a, p) => a + p.v10, 0);
  const rank = 1 + Object.values(fits).filter((x) => x > fits[id]).length;
  return {
    vs: Math.round(fits[id] - (fits[cur] ?? fits[id])) / 10,
    rank,
    total: total10 / 10,
    start: start10 / 10,
    parts: parts.map(({ term, v10 }) => ({ term, v: v10 / 10 })),
  };
}
