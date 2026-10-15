// The five named settings the screens offer for each 0-100 tactic.
import { describe, expect, it } from 'vitest';
import { DEF_PRESETS, LEVEL_VALUES, OFF_PRESETS, TACTIC_LEVELS, levelIndex, levelName } from '../sim/tactics';

describe('tactic levels', () => {
  it('spreads five settings over 0-100, each with its own short name', () => {
    expect([...LEVEL_VALUES]).toEqual([0, 25, 50, 75, 100]);
    for (const names of Object.values(TACTIC_LEVELS)) {
      expect(names).toHaveLength(5);
      expect(new Set(names).size).toBe(5);
      // a couple of short words: one row of five fits a 360px phone, two lines at most
      for (const n of names) {
        expect(n.length).toBeLessThanOrEqual(14);
        for (const w of n.split(' ')) expect(w.length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('reads any value as the nearest setting, and each setting as itself', () => {
    LEVEL_VALUES.forEach((v, i) => expect(levelIndex(v)).toBe(i));
    expect([0, 12, 13, 37, 38, 62, 63, 87, 88, 100].map(levelIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    // out of range (a nudge past the end) still reads as an end
    expect(levelIndex(-10)).toBe(0);
    expect(levelIndex(130)).toBe(4);
    expect(levelName('pace', 72)).toBe('Up-tempo');
  });

  it('names the presets by what they do', () => {
    const off = (id: string) => OFF_PRESETS.find((p) => p.id === id)!.values;
    const def = (id: string) => DEF_PRESETS.find((p) => p.id === id)!.values;
    expect(levelName('pace', off('paceSpace').pace)).toBe('Run & gun');
    expect(levelName('pace', off('grind').pace)).toBe('Patient');
    expect(levelName('crashBoards', off('grind').crashBoards)).toBe('Crash often');
    expect(levelName('action', off('fiveOut').actions.motion)).toBe('Heavily');
    expect(levelName('help', def('zone').help)).toBe('Pack the paint');
    expect(levelName('pressure', def('chaos').pressure)).toBe('Pressure');
    expect(levelName('pressure', def('switch').pressure)).toBe('Balanced');
  });
});
