// Advice wording follows the coaching depth the user plays at.
import { describe, expect, it } from 'vitest';
import { adviceFor } from '../seasonAnalysis';

describe('adviceFor', () => {
  const offense = 'Lean on pull-up shooters (Offense > Actions).';
  const mgmt = 'Raise "Sub out tired players at" (Game Mgmt) to sub tired players out sooner.';
  it('keeps the tab names at Expert depth', () => {
    expect(adviceFor(offense, 'expert')).toBe(offense);
    expect(adviceFor(mgmt, 'expert')).toBe(mgmt);
  });
  it('says which depth a control needs when the screen does not show it', () => {
    expect(adviceFor(offense, 'advanced')).toBe(offense);
    expect(adviceFor(offense, 'simple')).toBe('Lean on pull-up shooters. (Needs Advanced coaching depth, in Settings.)');
    expect(adviceFor(mgmt, 'advanced')).toBe('Raise "Sub out tired players at" to sub tired players out sooner. (Needs Expert coaching depth, in Settings.)');
    expect(adviceFor(`${offense} ${mgmt}`, 'simple')).toMatch(/Needs Expert/);
  });
  it('sends roles to the player page below Expert', () => {
    expect(adviceFor('Shift creation (Tactics > Roles).', 'advanced')).toBe("Shift creation (Set role, on the player's page).");
  });
});
