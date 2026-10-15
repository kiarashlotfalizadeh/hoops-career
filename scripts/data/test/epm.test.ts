import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateEpm, epmByBbref, epmFields, epmShift, loadEpm, matchEpm, parseEpm } from '../epm';
import { SEASON_WEIGHT, deriveRatings, popStats, type Agg } from '../derive';

const HEAD =
  'season,age,seasontype,team_id,team_alias,team_alias_all,player_id,player_name,pos_text,gp,roster_games,start,mp,rookie_year,inches,weight,mpg,off,def,tot,ewins,usg,tspct';
const row = (season: number, id: number, name: string, team: string, all: string, mp: number, off: number, def: number, type = 2) =>
  `${season},27,${type},1610612760,"${team}","${all}",${id},"${name}","PG",68,82,68,${mp},2018,78,195,33.2,${off},${def},${off + def},19.1,0.32,0.67`;

describe('Dunks & Threes EPM', () => {
  it('reads regular-season rows, with every team of a traded player', () => {
    const rows = parseEpm(
      [
        HEAD,
        row(2026, 1628983, 'Shai Gilgeous-Alexander', 'OKC', 'OKC', 2259.2, 7.33, 2.01),
        row(2025, 1629029, 'Luka Doncic', 'LAL', 'DAL,LAL', 1768.2, 4.84, 1.35),
        // a playoff row would count his season twice
        row(2026, 1628983, 'Shai Gilgeous-Alexander', 'OKC', 'OKC', 600, 9, 1, 4),
        '2026,27,2,,"OKC","OKC",,"No Id","PG"',
      ].join('\n'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ nbaId: 1628983, season: 2026, teams: ['OKC'], min: 2259.2, off: 7.33, def: 2.01 });
    expect(rows[0].tot).toBeCloseTo(9.34);
    expect(rows[1].teams).toEqual(['DAL', 'LAL']);
    expect(() => parseEpm('season,player_id\n2026,1')).toThrow(/not a Dunks & Threes EPM export/);
  });

  it('loads every export in the folder by its rows, the later file winning a season exported twice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-epm-'));
    writeFileSync(join(dir, 'a.csv'), [HEAD, row(2026, 1, 'A One', 'BOS', 'BOS', 1000, 1, 1), row(2025, 1, 'A One', 'BOS', 'BOS', 900, 2, 0)].join('\n'));
    writeFileSync(join(dir, 'b.csv'), [HEAD, row(2026, 1, 'A One', 'BOS', 'BOS', 1100, 3, 1)].join('\n'));
    // a season before the stats the seed uses is left out
    writeFileSync(join(dir, 'old.csv'), [HEAD, row(2019, 1, 'A One', 'BOS', 'BOS', 1000, 5, 5)].join('\n'));
    writeFileSync(join(dir, 'notes.txt'), 'not an export');
    const log: string[] = [];
    const rows = loadEpm(dir, (m) => log.push(m));
    expect(rows.map((r) => [r.season, r.min])).toEqual([
      [2025, 900],
      [2026, 1100],
    ]);
    expect(log.join('\n')).toMatch(/ignored 2019/);
    expect(loadEpm(join(dir, 'missing'), () => {})).toEqual([]);
  });

  it('matches players through the NBA.com ids the play-by-play already has, else by name and team', () => {
    const rows = parseEpm(
      [
        HEAD,
        row(2026, 11, 'Nikola Jokic', 'DEN', 'DEN', 2265, 7.5, 0.7),
        row(2026, 22, 'Alperen Sengun', 'HOU', 'HOU', 2100, 3, 1),
        row(2026, 33, 'Nobody Here', 'BKN', 'BKN', 300, -2, 0),
      ].join('\n'),
    );
    const bbref = [
      { id: 'jokicni01', name: 'Nikola Jokić', season: 2026, team: 'DEN' },
      { id: 'sengual01', name: 'Alperen Şengün', season: 2026, team: 'HOU' },
    ];
    const ids = matchEpm(rows, bbref, new Map([[11, 'jokicni01']]), () => {});
    expect(ids.get(11)).toBe('jokicni01');
    expect(ids.get(22)).toBe('sengual01');
    expect(ids.has(33)).toBe(false);
    expect(epmByBbref(rows, ids).get('sengual01')?.get(2026)?.off).toBe(3);
  });

  it('weights seasons by recency and minutes, like the advanced stats', () => {
    const [last, prev] = [2026, 2025];
    const rows = parseEpm([HEAD, row(last, 1, 'A', 'BOS', 'BOS', 1000, 4, 0), row(prev, 1, 'A', 'BOS', 'BOS', 1000, 0, 2)].join('\n'));
    const a = aggregateEpm(rows)!;
    const w = SEASON_WEIGHT[prev] / SEASON_WEIGHT[last];
    expect(a.off).toBeCloseTo(4 / (1 + w));
    expect(a.def).toBeCloseTo((2 * w) / (1 + w));
    expect(a.min).toBe(2000);
    expect(aggregateEpm([])).toBeUndefined();
  });

  const base = (epm?: { off: number; def: number }): Agg => ({
    wMin: 2400,
    rawMin: 2400,
    games: 70,
    mpg: 30,
    per36: { fga: 15, fg3a: 6, fg3: 2.2, fg2a: 9, fg2: 4.8, fta: 4, ft: 3.2, orb: 1, drb: 5, ast: 4, stl: 1.1, blk: 0.6, tov: 2, pf: 2.5, pts: 18 },
    fg3Pct: 0.36,
    fg2Pct: 0.53,
    ftPct: 0.8,
    adv: { usg: 21, ast: 16, orb: 4, drb: 15, stl: 1.6, blk: 1.4, tov: 11, obpm: 0.5, dbpm: 0, bpm: 0.5, ts: 0.58, ws48: 0.1, vorp: 1 },
    lastAge: 26,
    pos: 'SF',
    epm: epm && { ...epm, tot: epm.off + epm.def, min: 2400 },
  });
  // a population spread in EPM and box plus-minus alike
  const pop = popStats(
    Array.from({ length: 40 }, (_, i) => {
      const a = base({ off: (i % 9) - 4, def: (i % 5) - 2 });
      a.adv = { ...a.adv, obpm: ((i * 7) % 9) - 4, dbpm: ((i * 3) % 5) - 2 };
      return a;
    }),
  );
  const bio = { heightIn: 79, weightLb: 220, age: 26, pos: 'SF' };

  it('lifts the impact ratings of the player EPM rates higher, and falls back to box plus-minus without it', () => {
    const good = deriveRatings(base({ off: 3, def: 1.5 }), bio, pop, 'x').r;
    const poor = deriveRatings(base({ off: -3, def: -1.5 }), bio, pop, 'x').r;
    for (const k of ['oiq', 'diq', 'perD', 'intD'] as const) expect(good[k]).toBeGreaterThan(poor[k]);
    expect(good.oiq - poor.oiq).toBeGreaterThan(8);
    // skills EPM doesn't speak to stay as the box score says
    for (const k of ['tp', 'pas', 'hnd', 'stl', 'blk'] as const) expect(good[k]).toBe(poor[k]);
    // without EPM, box plus-minus carries the impact ratings again
    const none = deriveRatings(base(), bio, pop, 'x').r;
    const better = base();
    better.adv = { ...better.adv, obpm: 3, dbpm: 1.5 };
    const boxed = deriveRatings(better, bio, pop, 'x').r;
    expect(boxed.oiq).toBeGreaterThan(none.oiq + 5);
    expect(boxed.diq).toBeGreaterThan(none.diq + 2);
  });

  it('moves a seed built without EPM by what EPM changes in the impact ratings, less for a thin sample', () => {
    const d = epmShift(base({ off: 3, def: 1.5 }), bio, pop, 'x');
    expect(Object.keys(d).sort()).toEqual(['diq', 'intD', 'oiq', 'perD']);
    expect(d.oiq).toBeGreaterThan(0);
    // the same player in a quarter of the minutes moves less (the build blends him with a prior), and without EPM not at all
    const thin = base({ off: 3, def: 1.5 });
    Object.assign(thin, { wMin: 100, rawMin: 100 });
    expect(Math.abs(epmShift(thin, bio, pop, 'x').oiq ?? 0)).toBeLessThan(Math.abs(d.oiq!) / 4);
    expect(epmShift(base(), bio, pop, 'x')).toEqual({});
    expect(epmFields({ nbaId: 1, name: 'A', season: 2026, teams: ['OKC'], min: 2000, off: 7.334, def: 2.013, tot: 9.347 })).toEqual({ oepm: 7.3, depm: 2, epm: 9.3 });
  });
});
