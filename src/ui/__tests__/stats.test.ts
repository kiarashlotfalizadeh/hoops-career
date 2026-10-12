// Display helpers shared by the screens.
import { describe, expect, it } from 'vitest';
import { finalLabel, ordinal, ordinalSuffix } from '../stats';

describe('ordinal', () => {
  it('reads 1st, 2nd, 3rd and the teens as "th" (scouting percentiles printed "52th")', () => {
    const cases: [number, string][] = [
      [1, '1st'],
      [2, '2nd'],
      [3, '3rd'],
      [4, '4th'],
      [11, '11th'],
      [12, '12th'],
      [13, '13th'],
      [21, '21st'],
      [22, '22nd'],
      [23, '23rd'],
      [52, '52nd'],
      [99, '99th'],
      [101, '101st'],
      [111, '111th'],
      [112, '112th'],
    ];
    for (const [n, s] of cases) expect(ordinal(n)).toBe(s);
    expect(ordinalSuffix(53)).toBe('rd');
  });
});

describe('finalLabel', () => {
  it('marks overtime finals as the game report does', () => {
    expect(finalLabel(0)).toBe('FINAL');
    expect(finalLabel(1)).toBe('F/OT');
    expect(finalLabel(2)).toBe('F/2OT');
  });
});
