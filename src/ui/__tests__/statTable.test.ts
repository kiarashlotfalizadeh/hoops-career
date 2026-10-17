// Sortable tables: the order a tapped column header gives.
import { describe, expect, it } from 'vitest';
import { compareCells, fmtNum } from '../components/ui';

describe('compareCells', () => {
  it('puts missing numbers last in either direction (a PER column mixing real and simulated seasons)', () => {
    // simulated seasons have no PER: NaN made the comparator answer NaN and scrambled the real ones
    const per = [NaN, 18.2, NaN, 25.1, 9.4, NaN];
    expect([...per].sort((a, b) => compareCells(a, b, -1))).toEqual([25.1, 18.2, 9.4, NaN, NaN, NaN]);
    expect([...per].sort((a, b) => compareCells(a, b, 1))).toEqual([9.4, 18.2, 25.1, NaN, NaN, NaN]);
    // a player with no line reads "—" and sorts last, also when sorted up
    expect([3, -Infinity, 1].sort((a, b) => compareCells(a, b, 1))).toEqual([1, 3, -Infinity]);
  });
  it('sorts text alphabetically', () => {
    expect(['Webb', 'Hart', 'King'].sort((a, b) => compareCells(a, b, 1))).toEqual(['Hart', 'King', 'Webb']);
  });
});

describe('fmtNum', () => {
  it('reads a value that rounds to zero as 0.0, not -0.0, and a missing one as a dash', () => {
    expect(fmtNum(-0.03)).toBe('0.0');
    expect(fmtNum(-0.06)).toBe('-0.1');
    expect(fmtNum(12)).toBe('12');
    expect(fmtNum(NaN)).toBe('—');
  });
});
