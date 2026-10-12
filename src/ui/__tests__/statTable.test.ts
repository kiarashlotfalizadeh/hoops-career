// Sortable tables: the order a tapped column header gives.
import { describe, expect, it } from 'vitest';
import { compareCells } from '../components/ui';

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
