import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProjection, matchProjection, ols, parseProjection, projectionNote, seedTeam, shiftSplit } from '../epm-projection';
import { emptyRatings, ovrRaw } from '../../../src/core/ratings';
import type { SeedData, SeedPlayer } from '../../../src/core/league/create';

const HEAD =
  'season,nba_id,name,team,p_mpg,p_usg,oepm,depm,epm,p_pts_100,p_tspct,p_fg2a_100,p_fg2pct,p_fg3a_100,p_fg3pct,p_fta_100,p_ftpct,p_orb_100,p_drb_100,p_ast_100,p_tov_100,p_stl_100,p_blk_100';
const row = (season: number, id: number | '', name: string, team: string, off: number, def: number) =>
  `${season},${id},"${name}","${team}",30.5,0.25,${off},${def},${off + def},28,0.6,15,0.55,8,0.37,7,0.8,1.5,6,6,3,1.5,0.8`;

describe('Dunks & Threes EPM projection', () => {
  it('reads a row per player with its projected box line', () => {
    const rows = parseProjection([HEAD, row(2027, 1628983, 'Shai Gilgeous-Alexander', 'OKC', 7.57, 1.36), row(2027, '', 'No Id', 'OKC', 1, 1)].join('\n'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nbaId: 1628983, team: 'OKC', season: 2027, mpg: 30.5, usg: 0.25, off: 7.57, def: 1.36 });
    expect(rows[0].tot).toBeCloseTo(8.93);
    expect(rows[0].box).toMatchObject({ pts: 28, fg3a: 8, fg3pct: 0.37, ftpct: 0.8, blk: 0.8, tspct: 0.6 });
    // a season export isn't a projection
    expect(() => parseProjection('season,age,seasontype,player_id\n2026,27,2,1')).toThrow(/not a Dunks & Threes EPM projection/);
  });

  it("loads the seed season's rows from every file, the later file winning a player listed twice", () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-proj-'));
    writeFileSync(join(dir, 'a.csv'), [HEAD, row(2027, 1, 'A One', 'BOS', 1, 0), row(2026, 2, 'B Two', 'BOS', 1, 0)].join('\n'));
    writeFileSync(join(dir, 'b.csv'), [HEAD, row(2027, 1, 'A One', 'BOS', 3, 0)].join('\n'));
    const log: string[] = [];
    const rows = loadProjection(2027, dir, (m) => log.push(m));
    expect(rows.map((r) => [r.nbaId, r.off])).toEqual([[1, 3]]);
    expect(log.join('\n')).toMatch(/ignored 1 rows for other seasons/);
    expect(loadProjection(2027, join(dir, 'missing'), () => {})).toEqual([]);
  });

  it("matches the seed's players by NBA.com id, else by name and team", () => {
    const sp = (id: string, first: string, last: string, team: string | null, nbaId?: number) => ({ id, first, last, team, nbaId, stats: [] }) as unknown as SeedPlayer;
    const seed = {
      season: 2027,
      players: [sp('jokicni01', 'Nikola', 'Jokić', 'DEN', 203999), sp('dybanaj01', 'AJ', 'Dybantsa', 'WAS'), sp('lopezka01', 'Karim', 'López', 'MEM')],
    } as unknown as SeedData;
    const rows = parseProjection(
      [
        HEAD,
        row(2027, 203999, 'Nikola Jokic', 'DEN', 7, 1.3),
        row(2027, 1643407, 'AJ Dybantsa', 'WAS', -1.4, 0.3),
        row(2027, 5, 'Karim Lopez', 'MEM', -3, 0),
        row(2027, 6, 'Nobody', 'BKN', -4, 0),
      ].join('\n'),
    );
    const m = matchProjection(rows, seed, () => {});
    expect([...m].map(([nba, p]) => [nba, p.id])).toEqual([
      [203999, 'jokicni01'],
      [1643407, 'dybanaj01'],
      [5, 'lopezka01'],
    ]);
    expect([seedTeam('PHX'), seedTeam('BKN'), seedTeam('CHA'), seedTeam('OKC')]).toEqual(['PHO', 'BRK', 'CHO', 'OKC']);
    expect(projectionNote(2027)).toBe('Dunks & Threes 2026-27 EPM projection');
  });

  it('fits a least-squares line', () => {
    const x = [[1], [2], [3], [4]];
    const [a, b] = ols(
      x,
      x.map(([v]) => 3 + 2 * v),
    );
    expect(a).toBeCloseTo(3);
    expect(b).toBeCloseTo(2);
  });

  it('reaches an OVR through the end of the floor it is told to, leaving the box-score events alone', () => {
    const base = emptyRatings();
    const target = ovrRaw(base) + 4;
    const off = shiftSplit(base, target, 0.8);
    const def = shiftSplit(base, target, 0.2);
    expect(ovrRaw(off)).toBeCloseTo(target, 1);
    expect(ovrRaw(def)).toBeCloseTo(target, 1);
    expect(off.oiq - base.oiq).toBeGreaterThan(def.oiq - base.oiq);
    expect(def.diq - base.diq).toBeGreaterThan(off.diq - base.diq);
    for (const r of [off, def]) for (const k of ['stl', 'blk', 'oreb', 'ft', 'hgt'] as const) expect(r[k]).toBe(base[k]);
    // a rating at its cap leaves the rest of the way to the others
    const capped = shiftSplit({ ...base, oiq: 100, hnd: 100, pas: 100, ins: 100, mid: 100, post: 100, tp: 100, drw: 100 }, target + 8, 1);
    expect(ovrRaw(capped)).toBeCloseTo(target + 8, 1);
  });
});
