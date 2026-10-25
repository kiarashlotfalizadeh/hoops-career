import { describe, expect, it } from 'vitest';
import { formerFranchises, formerNumbers, historyLines, numberSources } from '../careers';
import { countryName, parseAdvanced, parseContracts, parsePerGame, parseRoster, seedDraft, type RosterRow } from '../parse';
import { HISTORY_SEASONS, STAT_SEASONS } from '../sources';
import { BBREF_TO_TID } from '../../../src/core/teams';

const pg = `<div><!-- <table id="per_game_stats"><tbody>
<tr><th data-stat="ranker">1</th><td data-stat="name_display" data-append-csv="gilgesh01"><a href="/players/g/gilgesh01.html">Shai Gilgeous-Alexander</a></td><td data-stat="age">27</td><td data-stat="team_name_abbr">OKC</td><td data-stat="pos">PG</td><td data-stat="games">76</td><td data-stat="games_started">76</td><td data-stat="mp_per_g">34.2</td><td data-stat="fga_per_g">21.8</td><td data-stat="fg3a_per_g">5.7</td><td data-stat="pts_per_g">32.7</td></tr>
<tr class="thead"><th data-stat="ranker" scope="col">Rk</th><th scope="col">Player</th></tr>
<tr><th data-stat="ranker"></th><td data-stat="name_display">League Average</td><td data-stat="fga_per_g">88.6</td></tr>
</tbody></table> --></div>`;

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

describe('Basketball Reference pages and careers', () => {
  it('parses per-game, contract and roster pages, flags and draft classes, and files careers before the stat seasons under franchises', () => {
    // per-game rows from commented tables
    const sga = parsePerGame(pg, 2026);
    expect(sga.rows).toHaveLength(1);
    expect(sga.rows[0]).toMatchObject({ id: 'gilgesh01', name: 'Shai Gilgeous-Alexander', team: 'OKC', g: 76, mp: 34.2, pts: 32.7 });
    expect(sga.league?.fga).toBe(88.6);

    // contracts with options
    const curry = `<table id="player-contracts"><thead><tr><th data-stat="y1">2026-27</th></tr></thead><tbody><tr><th data-stat="ranker">1</th><td data-stat="player" data-append-csv="curryst01"><a>Stephen Curry</a></td><td data-stat="team_id">GSW</td><td data-stat="y1" class="right">$62,587,158</td><td data-stat="y2" class="right salary-pl">$64,000,000</td><td data-stat="y3"></td></tr></tbody></table>`;
    expect(parseContracts(curry)[0]).toMatchObject({ id: 'curryst01', team: 'GSW', salaries: [62587, 64000], options: [null, 'player'] });

    // roster bios
    const roster = `<table id="roster"><tbody><tr><th data-stat="number">2</th><td data-stat="player" data-append-csv="gilgesh01"><a>Shai Gilgeous-Alexander</a></td><td data-stat="pos">PG</td><td data-stat="height">6-6</td><td data-stat="weight">195</td><td data-stat="birth_date" csk="19980712">July 12, 1998</td><td data-stat="flag">ca</td><td data-stat="years_experience">7</td><td data-stat="college">Kentucky</td></tr></tbody></table>`;
    expect(parseRoster(roster, 'OKC', 2027)[0]).toMatchObject({ id: 'gilgesh01', heightIn: 78, weightLb: 195, birthDate: '19980712', country: 'CA', exp: 7 });
    // "R" is a rookie; a page without the column says nothing (not "rookie")
    expect(parseRoster(roster.replace('>7<', '>R<'), 'OKC', 2027)[0].exp).toBe(0);
    expect(parseRoster(roster.replace('<td data-stat="years_experience">7</td>', ''), 'OKC', 2027)[0].exp).toBeNull();

    // every flag code is named: the short list first, any other region in English
    expect(countryName('CA')).toBe('Canada');
    expect(countryName('CD')).toBe('DR Congo');
    // Neemias Queta and Henri Veesaar's codes aren't on the short list: no "PT" or "EE" on their Player pages
    expect(countryName('PT')).toBe('Portugal');
    expect(countryName('EE')).toBe('Estonia');
    expect(countryName('')).toBe('USA');
    expect(countryName(undefined)).toBe('USA');
    expect(countryName('1')).toBe('1');

    // undrafted players get their entry class, so their experience and rookie year are right
    const ros = (season: number, exp: number | null) => ({ season, exp }) as RosterRow;
    const lebron = { id: 'jamesle01', name: 'LeBron James', year: 2003, pick: 1, round: 1, team: 'CLE', college: '' };
    expect(seedDraft(lebron, ros(2027, 23))).toEqual({ year: 2003, round: 1, pick: 1, team: 'CLE' });
    // the game numbers picks within the round: Cam Spencer, #53 overall in 2024, is round 2, pick 23
    expect(seedDraft({ id: 'spenc01', name: 'Cam Spencer', year: 2024, pick: 53, round: 2, team: 'DET', college: 'UConn' }, ros(2027, 2))).toMatchObject({ round: 2, pick: 23 });
    // Fred VanVleet: undrafted in 2016, ten seasons before 2026-27 → round 0 of the 2016 class
    expect(seedDraft(undefined, ros(2027, 10))).toEqual({ year: 2016, round: 0, pick: 0 });
    // an undrafted rookie is in this year's class; a free agent last seen on a 2025-26 roster counts from then
    expect(seedDraft(undefined, ros(2027, 0))).toEqual({ year: 2026, round: 0, pick: 0 });
    expect(seedDraft(undefined, ros(2026, 4))).toEqual({ year: 2021, round: 0, pick: 0 });
    expect(seedDraft(undefined, ros(2027, null))).toBeNull();
    expect(seedDraft(undefined, undefined)).toBeNull();

    // the old team codes go under today's franchises
    expect([BBREF_TO_TID.SEA, BBREF_TO_TID.NJN, BBREF_TO_TID.NOH, BBREF_TO_TID.NOK, BBREF_TO_TID.CHA]).toEqual([
      BBREF_TO_TID.OKC,
      BBREF_TO_TID.BRK,
      BBREF_TO_TID.NOP,
      BBREF_TO_TID.NOP,
      BBREF_TO_TID.CHO,
    ]);

    // one history line per team in a season, totals from the averages, with no shot locations (a season the game files don't have him in falls back to these)
    const before = rows('duranke01').filter((r) => r.season < STAT_SEASONS[0]);
    const adv = HISTORY_SEASONS.flatMap((s) => parseAdvanced(read(`advanced_${s}`)!, s));
    const lines = historyLines(before, adv);
    expect(lines.map((l) => l.season)).toEqual([2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2023]);
    expect(lines[0]).toMatchObject({ tid: BBREF_TO_TID.OKC, real: true, playoffs: false, gp: 80, min: 2840, pts: 2184, fga: 1544, rimA: 0, midA: 0 });
    expect(lines[0].adv).toMatchObject({ ws: 9.1, bpm: 6.4 });
    // the season he was traded: Brooklyn's line and Phoenix's, no combined one
    expect(lines.slice(-2).map((l) => [l.tid, l.gp])).toEqual([
      [BBREF_TO_TID.BRK, 39],
      [BBREF_TO_TID.PHO, 8],
    ]);

    // former franchises: five seasons given and left, with his last season there under its code then
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

    // only the roster pages that aren't fetched for every team anyway:
    // Durant's last Thunder season; Giannis's last Bucks season is last season's page
    expect(numberSources(read).map((s) => [s.key, s.url])).toEqual([['roster_OKC_2016', 'https://www.basketball-reference.com/teams/OKC/2016.html']]);
    expect(numberSources((key) => (key === 'per_game_2010' ? null : read(key))).length).toBe(1);
    expect(numberSources((key) => (key === 'contracts' ? null : read(key)))).toEqual([]);

    // former numbers keyed by the franchise's code today, leaving out a page or number that is missing
    const row = (jersey: string) => ({ jersey }) as RosterRow;
    const seattle = rows('duranke01').filter((r) => r.season <= 2012);
    // his last Thunder season of these was 2012: the page for it gives the number
    expect(formerNumbers(seattle, 'HOU', (team, season) => (team === 'OKC' && season === 2012 ? row('35') : undefined))).toEqual({ OKC: '35' });
    expect(formerNumbers(seattle.slice(0, 1), 'HOU', () => row('35'))).toEqual({});
    expect(formerNumbers(rows('duranke01'), 'HOU', () => undefined)).toEqual({});
    expect(formerNumbers(rows('duranke01'), 'HOU', () => row(''))).toEqual({});
  });
});
