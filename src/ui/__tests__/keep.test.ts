// "Keep changes after this game": tonight's changes go into the saved tactics, the game plan for
// tonight's opponent and tonight's matchups don't, and taking a change back takes it out again.
import { describe, expect, it } from 'vitest';
import { applyPatch, cloneTactics, defaultTactics } from '../../core/sim/tactics';
import { keptTactics } from '../live/keep';

describe('kept tactics', () => {
  const saved = defaultTactics();
  saved.defense.matchups = { 40: 2 };
  // tonight's game plan: hedge their ball screens, and who guards whom
  const planned = applyPatch(saved, { defense: { pnr: 'hedge' } });
  planned.defense.matchups = { 7: 3 };

  it('take in what changed tonight, from before it was turned on too', () => {
    const now = cloneTactics(planned);
    now.offense.pace = 85;
    now.defense.help = 20;
    const kept = keptTactics(saved, planned, now);
    expect([kept.offense.pace, kept.defense.help, kept.manual]).toEqual([85, 20, true]);
    // the plan's coverage stays the plan's
    expect(kept.defense.pnr).toBe(saved.defense.pnr);
  });

  it("never save tonight's matchups or star target", () => {
    const now = cloneTactics(planned);
    now.defense.matchups = { 7: 4, 9: 1 };
    now.defense.starPlan = 'deny';
    now.defense.starTarget = 7;
    const kept = keptTactics(saved, planned, now);
    expect(kept.defense.matchups).toEqual({ 40: 2 });
    expect([kept.defense.starPlan, kept.defense.starTarget]).toEqual(['deny', null]);
  });

  it('go back to the saved tactics when tonight is back to the plan', () => {
    const now = cloneTactics(planned);
    now.offense.pace = 85;
    expect(keptTactics(saved, planned, now)).not.toEqual(saved);
    expect(keptTactics(saved, planned, cloneTactics(planned))).toEqual(saved);
  });
});
