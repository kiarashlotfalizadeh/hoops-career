import { describe, expect, it } from 'vitest';
import { formerFranchises, formerNumbers, historyLines, numberSources } from '../careers';
import { parseAdvanced, parsePerGame, type RosterRow } from '../parse';
import { HISTORY_SEASONS, STAT_SEASONS } from '../sources';
import { BBREF_TO_TID } from '../../../src/core/teams';

type Spell = [season: number, team: string, games: number];
const cell = (stat: string, v: string | number) => `<td data-stat="${stat}">${v}</td>`;
const name = (id: string) => `<td data-stat="name_display" data-append-csv="${id}"><a href="/players/x/${id}.html">${id}</a></td>`;
/** A season's per-game and advanced pages with these players' lines (a combined line first for a traded one, as Basketball Reference lists it). */
function pages(season: number, players: Record<string, Spell[]>) {
  const rows = Object.entries(players).flatMap(([id, spells]) => {
    const mine = spells.filter(([s]) => s === season);
    const total = mine.reduce((a, [, , g]) => a + g, 0);
    return [...(mine.length > 1 ? [[id, '2TM', total] as const] : []), ...mine.map(([, team, g]) => [id, team, g] as const)];
  });
  const pg = rows.map(
    ([id, team, g]) =>
      `<tr>${name(id)}${cell('team_name_abbr', team)}${cell('games', g)}${cell('games_started', g)}${cell('mp_per_g', 35.5)}${cell('fga_per_g', 19.3)}${cell('pts_per_g', 27.3)}</tr>`,
  );
  const adv = rows.map(([id, team, g]) => `<tr>${name(id)}${cell('team_name_abbr', team)}${cell('games', g)}${cell('ws', 9.1)}${cell('bpm', 6.4)}</tr>`);
  return {
    perGame: `<table id="per_game_stats"><tbody>${pg.join('')}</tbody></table>`,
    advanced: `<table id="advanced"><tbody>${adv.join('')}</tbody></table>`,
  };
}

// Durant: drafted by Seattle, the Thunder's to Basketball Reference; a season lost to injury; Phoenix
// for three seasons; Houston now. Giannis: twelve seasons in Milwaukee through last season, Miami now.
const durant: Spell[] = [
  [2008, 'SEA', 80],
  ...[2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016].map((s): Spell => [s, 'OKC', 72]),
  ...[2017, 2018, 2019].map((s): Spell => [s, 'GSW', 68]),
  ...[2021, 2022].map((s): Spell => [s, 'BRK', 55]),
  [2023, 'BRK', 39],
  [2023, 'PHO', 8],
  [2024, 'PHO', 75],
  [2025, 'PHO', 62],
  [2026, 'HOU', 70],
];
const giannis: Spell[] = Array.from({ length: 13 }, (_, i): Spell => [2014 + i, 'MIL', 70]);
const players = { duranke01: durant, antetgi01: giannis };
const contracts = `<table id="player-contracts"><thead><tr><th data-stat="y1">2026-27</th></tr></thead><tbody>${[
  ['duranke01', 'HOU'],
  ['antetgi01', 'MIA'],
]
  .map(([id, team]) => `<tr><td data-stat="player" data-append-csv="${id}"><a>${id}</a></td>${cell('team_id', team)}${cell('y1', '$50,000,000')}</tr>`)
  .join('')}</tbody></table>`;
const cache = new Map<string, string>([['contracts', contracts]]);
for (const s of [...HISTORY_SEASONS, ...STAT_SEASONS]) {
  const p = pages(s, players);
  cache.set(`per_game_${s}`, p.perGame);
  cache.set(`advanced_${s}`, p.advanced);
}
const read = (key: string) => cache.get(key) ?? null;
const rows = (id: string) => [...HISTORY_SEASONS, ...STAT_SEASONS].flatMap((s) => parsePerGame(read(`per_game_${s}`)!, s).rows.filter((r) => r.id === id));

describe('careers before the stat seasons', () => {
  it("files the old team codes under today's franchises", () => {
    expect([BBREF_TO_TID.SEA, BBREF_TO_TID.NJN, BBREF_TO_TID.NOH, BBREF_TO_TID.NOK, BBREF_TO_TID.CHA]).toEqual([
      BBREF_TO_TID.OKC,
      BBREF_TO_TID.BRK,
      BBREF_TO_TID.NOP,
      BBREF_TO_TID.NOP,
      BBREF_TO_TID.CHO,
    ]);
  });

  it('stores one line per team in a season, totals from the averages, with no shot locations or EPM', () => {
    const before = rows('duranke01').filter((r) => r.season < STAT_SEASONS[0]);
    const adv = HISTORY_SEASONS.flatMap((s) => parseAdvanced(read(`advanced_${s}`)!, s));
    const lines = historyLines(before, adv);
    expect(lines.map((l) => l.season)).toEqual([2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2023]);
    expect(lines[0]).toMatchObject({ tid: BBREF_TO_TID.OKC, real: true, playoffs: false, gp: 80, min: 2840, pts: 2184, fga: 1544, rimA: 0, midA: 0 });
    expect(lines[0].adv).toMatchObject({ ws: 9.1, bpm: 6.4 });
    expect(lines[0].adv?.epm).toBeUndefined();
    // the season he was traded: Brooklyn's line and Phoenix's, no combined one
    expect(lines.slice(-2).map((l) => [l.tid, l.gp])).toEqual([
      [BBREF_TO_TID.BRK, 39],
      [BBREF_TO_TID.PHO, 8],
    ]);
  });

  it('finds the franchises a player gave five seasons and left, with his last season there under its code then', () => {
    expect(formerFranchises(rows('duranke01'), 'HOU')).toEqual([{ tid: BBREF_TO_TID.OKC, season: 2016, team: 'OKC' }]);
    // only Seattle's season: under five
    expect(
      formerFranchises(
        rows('duranke01').filter((r) => r.season === 2008),
        null,
      ),
    ).toEqual([]);
    expect(formerFranchises(rows('antetgi01'), 'MIA')).toEqual([{ tid: BBREF_TO_TID.MIL, season: 2026, team: 'MIL' }]);
    // still there: not a former franchise
    expect(formerFranchises(rows('antetgi01'), 'MIL')).toEqual([]);
  });

  it("fetches only the roster pages that aren't fetched for every team anyway", () => {
    // Durant's last Thunder season; Giannis's last Bucks season is last season's page
    expect(numberSources(read).map((s) => [s.key, s.url])).toEqual([['roster_OKC_2016', 'https://www.basketball-reference.com/teams/OKC/2016.html']]);
    expect(numberSources((key) => (key === 'per_game_2010' ? null : read(key))).length).toBe(1);
    expect(numberSources((key) => (key === 'contracts' ? null : read(key)))).toEqual([]);
  });

  it("keys the numbers by the franchise's code today, leaving out a page or number that is missing", () => {
    const row = (jersey: string) => ({ jersey }) as RosterRow;
    const seattle = rows('duranke01').filter((r) => r.season <= 2012);
    // his last Thunder season of these was 2012: the page for it gives the number
    expect(formerNumbers(seattle, 'HOU', (team, season) => (team === 'OKC' && season === 2012 ? row('35') : undefined))).toEqual({ OKC: '35' });
    expect(formerNumbers(seattle.slice(0, 1), 'HOU', () => row('35'))).toEqual({});
    expect(formerNumbers(rows('duranke01'), 'HOU', () => undefined)).toEqual({});
    expect(formerNumbers(rows('duranke01'), 'HOU', () => row(''))).toEqual({});
  });
});
