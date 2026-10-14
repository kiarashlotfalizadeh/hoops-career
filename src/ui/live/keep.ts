import type { Tactics } from '../../core/types';
import { applyPatch, cloneTactics, emptyPatch, tacticsDiff } from '../../core/sim/tactics';

/**
 * "Keep changes after this game": the saved tactics (as they were when it was turned on) with
 * tonight's changes on top, everything `now` does differently from what the game tipped off with
 * (`planned`, the saved tactics with tonight's game plan). Tonight's game plan, matchups and star
 * target never end up in them; with nothing changed they're the saved tactics as they were.
 */
export function keptTactics(saved: Tactics, planned: Tactics, now: Tactics): Tactics {
  const diff = tacticsDiff(planned, now);
  return emptyPatch(diff) ? cloneTactics(saved) : { ...applyPatch(saved, diff), manual: true };
}
