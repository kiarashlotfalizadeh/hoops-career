import { describe, expect, it } from 'vitest';
import { patchText } from '../tactics/SituationsCard';
import { SITUATION_TEMPLATES } from '../../core/sim/tactics';

describe('situational plan summaries', () => {
  it('says what each template changes, in the Tactics screen words', () => {
    expect(patchText(SITUATION_TEMPLATES.protectLead.patch)).toBe('Pace −25 · Transition −20 · Crash glass −20 · Get back +20 · Pressure −10 · Physicality −10');
    expect(patchText(SITUATION_TEMPLATES.chasing.patch)).toBe('Press after makes · Pace +25 · Transition +20 · Threes +15 · Pressure +20');
    expect(patchText(SITUATION_TEMPLATES.closeQ.patch)).toBe('Hunt mismatches · Physicality −15 · Isolation +20');
    expect(patchText({ defense: { scheme: 'zone32' } })).toBe('3-2 Zone');
    expect(patchText({})).toBe('No changes yet');
  });
});
