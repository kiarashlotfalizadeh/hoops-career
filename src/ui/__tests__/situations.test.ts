import { describe, expect, it } from 'vitest';
import { patchText, screenChanges, changesLine } from '../tactics/changes';
import { SITUATION_TEMPLATES, cloneTactics, defaultTactics } from '../../core/sim/tactics';

describe('situational plan summaries', () => {
  it('says what each template changes, in the Tactics screen words', () => {
    expect(patchText(SITUATION_TEMPLATES.protectLead.patch)).toBe(
      'Pace −25 · Push in transition −20 · Crash the offensive glass −20 · Transition defense +20 · Ball pressure −10 · Physicality −10',
    );
    expect(patchText(SITUATION_TEMPLATES.chasing.patch)).toBe('Press after makes · Pace +25 · Push in transition +20 · Three-point emphasis +15 · Ball pressure +20');
    expect(patchText(SITUATION_TEMPLATES.closeQ.patch)).toBe('Hunt mismatches · Physicality −15 · Isolation +20');
    expect(patchText({ defense: { scheme: 'zone32' } })).toBe('3-2 Zone');
    expect(patchText({ defense: { help: 75 } })).toBe('Help defense: Pack the paint');
    expect(patchText({})).toBe('No changes yet');
  });
});

describe('changes in the screen words', () => {
  it('names each setting as its control on the Tactics screen', () => {
    const a = defaultTactics('balanced', 'drop');
    const b = cloneTactics(a);
    b.defense.pnr = 'hedge';
    b.defense.scheme = 'zone23';
    b.offense.crashBoards = 100;
    expect(changesLine(screenChanges(a, b))).toBe('Crash the offensive glass: Balanced → Crash hard · Base scheme: Man-to-man → 2-3 Zone · Pick-and-roll coverage: Drop → Hedge');
  });
});
