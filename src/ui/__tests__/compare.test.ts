// Player comparison: which side a row favours, how its values read, the rows the screen draws for two
// players (one of them missing, or the same player twice), the picker's search and recent comparisons.
import { describe, expect, it } from 'vitest';
import type { Player, PlayerStats } from '../../core/types';
import { RETIRED } from '../../core/types';
import { createLeague, defaultSettings } from '../../core/league/create';
import { blankStats } from '../../core/playerGen';
import { REC_STATS } from '../../core/league/records';
import { RATING_META } from '../../core/ratings';
import { SKILLS, skillPercentiles } from '../playerSkills';
import {
  addRecent,
  better,
  compareHref,
  compareSections,
  counterpart,
  fmtValue,
  loadRecent,
  matchesQuery,
  normName,
  pidParam,
  recentPids,
  rememberComparison,
  rowView,
  type CmpRow,
} from '../compare';

const league = () => createLeague({ name: 'cmp', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 5 });

/** Two different players off the user's roster. */
function two(l: ReturnType<typeof league>): [Player, Player] {
  const roster = Object.values(l.players).filter((p) => p.tid === 0);
  return [roster[0], roster[1]];
}

function line(season: number, tid: number, x: Partial<PlayerStats>): PlayerStats {
  return { ...blankStats(season, tid, false), ...x };
}

describe('player comparison', () => {
  it('judges and reads each row, builds the sections for any pair, and picks and remembers players', () => {
    // better: the higher value, or the lower one where less is better (turnovers, fouls, age)
    expect(better(27.4, 21.3, 'high')).toBe('a');
    expect(better(21.3, 27.4, 'high')).toBe('b');
    expect(better(2.1, 3.4, 'low')).toBe('a');
    expect(better(3.4, 2.1, 'low')).toBe('b');
    expect(better(22, 31, 'low', 'int')).toBe('a');
    // neither side in a row with no better way (height, games played)
    expect(better(80, 75, 'none', 'height')).toBeNull();
    // a tie when the two read the same, at the precision the row shows
    expect(better(10, 10, 'high')).toBeNull();
    // both read 27.4
    expect(better(27.43, 27.38, 'high', 'f1')).toBeNull();
    // both read 47.3 (a percentage to a tenth of a point)
    expect(better(0.4732, 0.4728, 'high', 'pct')).toBeNull();
    expect(better(0.474, 0.472, 'high', 'pct')).toBe('a');
    // percentiles and ratings in whole numbers
    expect(better(52.4, 51.6, 'high', 'pctile')).toBeNull();
    expect(better(0.3, -0.3, 'high', 'f1')).toBe('a');
    expect(better(0.04, -0.04, 'high', 'signed')).toBeNull();
    // neither side when a value is missing
    expect(better(null, 3, 'high')).toBeNull();
    expect(better(3, undefined, 'low')).toBeNull();
    expect(better(NaN, 3, 'high')).toBeNull();
    expect(better(3, Infinity, 'high')).toBeNull();
    expect(better(null, null, 'high')).toBeNull();

    // fmtValue reads each format, and a missing value as "—"
    expect(fmtValue(null, 'f1')).toBe('—');
    expect(fmtValue(NaN, 'int')).toBe('—');
    expect(fmtValue(25431, 'int')).toBe('25,431');
    expect(fmtValue(27.43, 'f1')).toBe('27.4');
    expect(fmtValue(0.4732, 'pct')).toBe('47.3');
    expect(fmtValue(3.21, 'signed')).toBe('+3.2');
    expect(fmtValue(-0.04, 'signed')).toBe('0.0');
    expect(fmtValue(52, 'pctile')).toBe('52nd');
    expect(fmtValue(78, 'height')).toBe(`6'6"`);
    expect(fmtValue(231.6, 'lb')).toBe('232 lb');
    // an honor he doesn't have reads "—" but still counts as none against the other's
    expect(fmtValue(0, 'count')).toBe('—');
    expect(fmtValue(3, 'count')).toBe('3');

    // rowView pairs the readings with the side the row favours, a text override first
    {
      const r: CmpRow = { key: 'tov', label: 'Turnovers', a: 3.42, b: 1.9, dir: 'low', fmt: 'f1' };
      expect(rowView(r)).toEqual({ a: '3.4', b: '1.9', win: 'b' });
      const s: CmpRow = { key: 'season', label: 'Season', a: 2027, b: null, dir: 'none', fmt: 'int', text: ['2026-27', null] };
      expect(rowView(s)).toEqual({ a: '2026-27', b: '—', win: null });
      expect(rowView({ key: 'x', label: 'x', a: 0, b: 2, dir: 'high', fmt: 'count' })).toEqual({ a: '—', b: '2', win: 'b' });
    }

    // every skill, every rating in the Ratings tab groups, and the lower-is-better rows the right way round
    {
      const l = league();
      const [a, b] = two(l);
      a.stats.push(line(l.season, 0, { gp: 10, gs: 10, min: 320, pts: 210, fgm: 80, fga: 170, tpm: 20, tpa: 55, ftm: 30, fta: 36, tov: 18, pf: 30, ast: 50, orb: 10, drb: 40 }));
      b.stats.push(line(l.season, 0, { gp: 10, gs: 0, min: 210, pts: 90, fgm: 35, fga: 80, tpm: 5, tpa: 20, ftm: 15, fta: 20, tov: 30, pf: 20, ast: 20, orb: 5, drb: 25 }));
      const secs = compareSections(l, a, b, skillPercentiles(l));
      const sec = (id: string) => secs.find((s) => s.id === id)!;
      expect(sec('skills').rows.map((r) => r.key)).toEqual(SKILLS.map((s) => s.key));
      expect(sec('ratings').rows).toHaveLength(RATING_META.length);
      expect(
        sec('ratings')
          .rows.filter((r) => r.group)
          .map((r) => r.group),
      ).toEqual(['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding']);
      const row = (id: string, key: string) => sec(id).rows.find((r) => r.key === key)!;
      // lower is better: a turns it over less (1.8 a game against 3.0), b fouls less (2.0 against 3.0)
      expect(rowView(row('season', 'tov')).win).toBe('a');
      expect(rowView(row('season', 'pf')).win).toBe('b');
      expect(rowView(row('season', 'pts'))).toEqual({ a: '21.0', b: '9.0', win: 'a' });
      // games played and usage are shown, not judged
      expect(rowView(row('season', 'gp')).win).toBeNull();
      expect(rowView(row('season', 'usg')).win).toBeNull();
      expect(row('career', 'cgp').dir).toBe('none');
      // both from this season: no season row; PER and win shares exist for neither (no team's season to measure them against), so they're left out
      expect(sec('season').rows.some((r) => r.key === 'season' || r.key === 'per' || r.key === 'ws')).toBe(false);
      expect(row('overview', 'age').dir).toBe('low');
    }

    // a player's latest season shown before his first game, saying which season it is
    {
      const l = league();
      const [a, b] = two(l);
      a.stats.push(line(l.season - 1, 0, { gp: 60, min: 1800, pts: 1200, fga: 900, fgm: 420 }));
      b.stats.push(line(l.season, 0, { gp: 5, min: 150, pts: 60, fga: 50, fgm: 22, fta: 10, ftm: 8 }));
      const season = compareSections(l, a, b, skillPercentiles(l)).find((s) => s.id === 'season')!;
      expect(season.rows[0].key).toBe('season');
      expect(rowView(season.rows[0]).win).toBeNull();
      expect(season.rows.find((r) => r.key === 'pts')!.a).toBeCloseTo(20);
      // no free throws attempted: no percentage, so no verdict; no threes by either: no row at all
      expect(rowView(season.rows.find((r) => r.key === 'ft')!)).toEqual({ a: '—', b: '80.0', win: null });
      expect(season.rows.some((r) => r.key === 'tp')).toBe(false);
    }

    // every row kept with a missing player, his side "—" and never favoured
    {
      const l = league();
      const [a] = two(l);
      a.stats.push(line(l.season, 0, { gp: 3, min: 90, pts: 40 }));
      for (const s of compareSections(l, a, undefined, skillPercentiles(l))) {
        for (const r of s.rows) {
          expect(r.b).toBeNull();
          expect(rowView(r).b).toBe('—');
          expect(rowView(r).win).toBeNull();
        }
      }
      // nobody on either side: nothing to show
      expect(compareSections(l, undefined, undefined, skillPercentiles(l)).every((s) => !s.rows.length)).toBe(true);
    }

    // every row a tie for the same player on both sides
    {
      const l = league();
      const [a] = two(l);
      a.stats.push(line(l.season, 0, { gp: 3, min: 90, pts: 40, tov: 4 }));
      for (const s of compareSections(l, a, a, skillPercentiles(l))) for (const r of s.rows) expect(rowView(r).win).toBeNull();
    }

    // being younger doesn't count against a retired player
    {
      const l = league();
      const [a, b] = two(l);
      b.tid = RETIRED;
      const age = compareSections(l, a, b, skillPercentiles(l))
        .find((s) => s.id === 'overview')!
        .rows.find((r) => r.key === 'age')!;
      expect(age.dir).toBe('none');
    }

    // career highs read 0 for a stat he never put up, and "—" for a player with no games in the book
    {
      const l = league();
      const [a, b] = two(l);
      const h = (v: number): [number, number, number, number, number] => [v, l.season, 3, 1, 7];
      a.highs = { pts: h(41), blk: h(4) };
      const highs = () => compareSections(l, a, b, skillPercentiles(l)).find((s) => s.id === 'highs')!.rows;
      expect(highs().map((r) => r.key)).toEqual(REC_STATS.map((k) => `hi-${k}`));
      expect(highs().every((r) => r.b === null && rowView(r).win === null)).toBe(true);
      b.highs = { pts: h(33) };
      const blk = highs().find((r) => r.key === 'hi-blk')!;
      expect([blk.a, blk.b, rowView(blk).win]).toEqual([4, 0, 'a']);
    }

    // the honors either has, in order of prestige, none counting against the other
    {
      const l = league();
      const [a, b] = two(l);
      a.awards = [
        { season: 2027, type: 'All-Star' },
        { season: 2028, type: 'All-Star' },
      ];
      b.awards = [
        { season: 2027, type: 'All-Star' },
        { season: 2027, type: 'MVP' },
      ];
      const honors = compareSections(l, a, b, skillPercentiles(l)).find((s) => s.id === 'honors')!.rows;
      expect(honors.map((r) => [r.label, r.a, r.b, rowView(r).win])).toEqual([
        ['MVP', 0, 1, 'b'],
        ['All-Star', 2, 1, 'a'],
      ]);
    }

    // picking: a name without its accents, case or punctuation, and a team by its abbreviation
    {
      expect(normName('Luka Dončić')).toBe('luka doncic');
      expect(normName("Royce O'Neale")).toBe('royce oneale');
      expect(normName('Nikola Đurišić')).toBe('nikola durisic');
      const l = league();
      const [p] = two(l);
      expect(matchesQuery(l, p, p.lastName.toUpperCase())).toBe(true);
      expect(matchesQuery(l, p, l.teams[0].abbrev.toLowerCase())).toBe(true);
      expect(matchesQuery(l, p, '   ')).toBe(false);
      // a player weighed against the user's best other player at his position
      const c = counterpart(l, p);
      const same = Object.values(l.players).filter((x) => x.tid === 0 && x.pos === p.pos && x.pid !== p.pid);
      if (!same.length) expect(c).toBeNull();
      else expect(c?.ovr).toBe(Math.max(...same.map((x) => x.ovr)));
      expect(c?.pid).not.toBe(p.pid);
    }

    // a pid read off the query, anything else as no player
    expect(pidParam('12')).toBe(12);
    expect(pidParam('0')).toBe(0);
    expect(pidParam('abc')).toBeNull();
    expect(pidParam('1.5')).toBeNull();
    expect(pidParam('')).toBeNull();
    expect(pidParam(null)).toBeNull();
    expect(compareHref(3, 9)).toBe('/compare?a=3&b=9');
    expect(compareHref(3, null)).toBe('/compare?a=3');
    expect(compareHref()).toBe('/compare');

    // recent comparisons latest first, each pair once whichever way round
    let list = addRecent([], 1, 2);
    list = addRecent(list, 3, 4);
    list = addRecent(list, 2, 1);
    expect(list).toEqual([
      [2, 1],
      [3, 4],
    ]);
    expect(recentPids(list, [4])).toEqual([2, 1, 3]);
    for (let i = 0; i < 20; i++) list = addRecent(list, 100 + i, 200 + i);
    expect(list).toHaveLength(8);
    // no storage (a test, a private window): nothing remembered, and nothing thrown
    expect(() => rememberComparison('x', 1, 2)).not.toThrow();
    expect(loadRecent('x')).toEqual([]);
  });
});
