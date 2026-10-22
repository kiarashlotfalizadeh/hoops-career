import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitCsv, tarCsvRows } from '../nba/csv';
import { rapm } from '../nba/rapm';
import { crosswalk, normName } from '../nba/crosswalk';
import { findCollege, type CollegeAgg } from '../nba/college';
import type { Stint } from '../nba/pbp';
import { Rng } from '../../../src/core/random';

describe('NBA.com data pipeline', () => {
  it('reads CSVs out of .tar.xz archives, recovers RAPM effects, and matches NBA.com names and college seasons to players', async () => {
    // CSV lines with quoted commas and escaped quotes
    expect(splitCsv('1,"fastbreak, 2ndchance",x')).toEqual(['1', 'fastbreak, 2ndchance', 'x']);
    expect(splitCsv('"say ""hi""",,3')).toEqual(['say "hi"', '', '3']);

    // rows stream out of a .tar.xz; an archive tar cannot read fails instead of reading no rows
    const dir = mkdtempSync(join(tmpdir(), 'hc-csv-'));
    writeFileSync(join(dir, 'pbp.csv'), 'gameId,desc\n1,"Jump, ball"\n2,Dunk\n');
    execFileSync('tar', ['-cJf', join(dir, 'ok.tar.xz'), '-C', dir, 'pbp.csv']);
    const read = async (f: string) => {
      const rows: string[] = [];
      for await (const get of tarCsvRows(join(dir, f))) rows.push(`${get('gameId')}:${get('desc')}`);
      return rows;
    };
    expect(await read('ok.tar.xz')).toEqual(['1:Jump, ball', '2:Dunk']);
    // say a large-file pointer or an error page saved in place of the archive
    writeFileSync(join(dir, 'bad.tar.xz'), 'version https://example.com/spec/v1\n');
    await expect(read('bad.tar.xz')).rejects.toThrow(/could not read/);
    await expect(read('missing.tar.xz')).rejects.toThrow(/could not read/);

    // RAPM recovers known effects from simulated stints:
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

    // NBA.com names find Basketball Reference ids despite accents, suffixes and nicknames
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

    // exact names claim their ids before near-miss spellings, whatever the order:
    // "Jeff Green" has no row of his own; surname + initial on the same team must not hand him Jalen's id
    const greens = crosswalk(
      [
        { pid: 1, name: 'Jeff Green', teams: { 2026: 'HOU' } },
        { pid: 2, name: 'Jalen Green', teams: { 2026: 'HOU' } },
      ],
      [{ id: 'greenja05', name: 'Jalen Green', season: 2026, team: 'HOU' }],
    );
    expect(greens.map.get(2)).toBe('greenja05');
    expect(greens.map.has(1)).toBe(false);
    expect(greens.unmatched.map((p) => p.pid)).toEqual([1]);

    // a transfer's latest college season, telling same-name players apart
    const season = (athleteId: string, team: string, s: number, min: number) => ({ ...blankCollege, athleteId, name: 'Sam Smith', team, season: s, min });
    const all = new Map([
      [
        'sam smith',
        [
          season('1', 'Santa Clara Broncos', 2025, 700),
          season('1', 'Ohio State Buckeyes', 2026, 800),
          season('2', 'North Carolina Tar Heels', 2026, 900),
          season('2', 'Arizona Wildcats', 2025, 750),
        ],
      ],
    ]);
    // the roster page lists every school; the latest season wins
    expect(findCollege(all, 'Sam Smith', 'Santa Clara, Ohio State')).toMatchObject({ athleteId: '1', season: 2026 });
    // "UNC" doesn't spell North Carolina, but the Arizona season identifies the same athlete
    expect(findCollege(all, 'Sam Smith', 'Arizona, UNC')).toMatchObject({ athleteId: '2', team: 'North Carolina Tar Heels' });
    expect(findCollege(all, 'Sam Smith', undefined)).toMatchObject({ athleteId: '2', season: 2026 });
  });
});

const blankCollege: CollegeAgg = {
  athleteId: '',
  name: '',
  team: '',
  teamId: '',
  season: 0,
  games: 30,
  min: 0,
  fgm: 0,
  fga: 0,
  tpm: 0,
  tpa: 0,
  ftm: 0,
  fta: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pf: 0,
  pts: 0,
  teamFga: 0,
  teamFta: 0,
  teamTov: 0,
  teamMin: 0,
};
