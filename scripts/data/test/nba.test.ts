import { describe, expect, it } from 'vitest';
import { splitCsv } from '../nba/csv';
import { rapm } from '../nba/rapm';
import { crosswalk, normName } from '../nba/crosswalk';
import type { Stint } from '../nba/pbp';
import { Rng } from '../../../src/core/random';

describe('NBA.com data pipeline', () => {
  it('splits CSV lines with quoted commas and escaped quotes', () => {
    expect(splitCsv('1,"fastbreak, 2ndchance",x')).toEqual(['1', 'fastbreak, 2ndchance', 'x']);
    expect(splitCsv('"say ""hi""",,3')).toEqual(['say "hi"', '', '3']);
  });

  it('RAPM recovers known offensive and defensive effects from simulated stints', () => {
    // 20 players; player 1 adds +6 per 100 on offense, player 2 prevents 5 on defense
    const rng = new Rng(7);
    const truthO: Record<number, number> = { 1: 6 };
    const truthD: Record<number, number> = { 2: 5 };
    const stints: Stint[] = [];
    for (let i = 0; i < 6000; i++) {
      const ids = Array.from({ length: 20 }, (_, k) => k + 1).sort(() => rng.next() - 0.5);
      const off = ids.slice(0, 5);
      const def = ids.slice(5, 10);
      const poss = 8;
      const rate = 112 + off.reduce((a, p) => a + (truthO[p] ?? 0), 0) - def.reduce((a, p) => a + (truthD[p] ?? 0), 0);
      let pts = 0;
      for (let k = 0; k < poss; k++) pts += rng.chance(rate / 200) ? 2 : 0;
      stints.push({ off, def, home: rng.chance(0.5), poss, pts });
    }
    const r = rapm([{ stints, weight: 1 }], 200);
    expect(r.off[1]).toBeGreaterThan(3);
    expect(r.def[2]).toBeGreaterThan(2.5);
    const others = Array.from({ length: 18 }, (_, k) => k + 3).map((p) => Math.abs(r.off[p]));
    expect(Math.max(...others)).toBeLessThan(r.off[1]);
  });

  it('matches NBA.com names to Basketball Reference ids despite accents, suffixes and nicknames', () => {
    expect(normName('Nikola Jokić')).toBe('nikola jokic');
    expect(normName('Jimmy Butler III')).toBe('jimmy butler');
    const { map, unmatched } = crosswalk(
      [
        { pid: 1, name: 'Nikola Jokić', teams: { 2026: 'DEN' } },
        { pid: 2, name: 'Alex Sarr', teams: { 2026: 'WAS' } },
        { pid: 3, name: 'Jalen Williams', teams: { 2026: 'OKC' } },
        { pid: 4, name: 'Jaylin Williams', teams: { 2026: 'OKC' } },
      ],
      [
        { id: 'jokicni01', name: 'Nikola Jokić', season: 2026, team: 'DEN' },
        { id: 'sarral01', name: 'Alexandre Sarr', season: 2026, team: 'WAS' },
        { id: 'willija06', name: 'Jalen Williams', season: 2026, team: 'OKC' },
        { id: 'willija07', name: 'Jaylin Williams', season: 2026, team: 'OKC' },
      ],
    );
    expect(unmatched).toEqual([]);
    expect(map.get(1)).toBe('jokicni01');
    expect(map.get(2)).toBe('sarral01');
    expect(map.get(3)).toBe('willija06');
    expect(map.get(4)).toBe('willija07');
  });
});
