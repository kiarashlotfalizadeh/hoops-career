import { describe, expect, it } from 'vitest';
import { countryName, parseContracts, parsePerGame, parseRoster, seedDraft, type RosterRow } from '../parse';

const pg = `<div><!-- <table id="per_game_stats"><tbody>
<tr><th data-stat="ranker">1</th><td data-stat="name_display" data-append-csv="gilgesh01"><a href="/players/g/gilgesh01.html">Shai Gilgeous-Alexander</a></td><td data-stat="age">27</td><td data-stat="team_name_abbr">OKC</td><td data-stat="pos">PG</td><td data-stat="games">76</td><td data-stat="games_started">76</td><td data-stat="mp_per_g">34.2</td><td data-stat="fga_per_g">21.8</td><td data-stat="fg3a_per_g">5.7</td><td data-stat="pts_per_g">32.7</td></tr>
<tr class="thead"><th data-stat="ranker" scope="col">Rk</th><th scope="col">Player</th></tr>
<tr><th data-stat="ranker"></th><td data-stat="name_display">League Average</td><td data-stat="fga_per_g">88.6</td></tr>
</tbody></table> --></div>`;

describe('bbref parsers', () => {
  it('reads per-game rows from commented tables', () => {
    const { rows, league } = parsePerGame(pg, 2026);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'gilgesh01', name: 'Shai Gilgeous-Alexander', team: 'OKC', g: 76, mp: 34.2, pts: 32.7 });
    expect(league?.fga).toBe(88.6);
  });
  it('reads contracts with options', () => {
    const html = `<table id="player-contracts"><thead><tr><th data-stat="y1">2026-27</th></tr></thead><tbody><tr><th data-stat="ranker">1</th><td data-stat="player" data-append-csv="curryst01"><a>Stephen Curry</a></td><td data-stat="team_id">GSW</td><td data-stat="y1" class="right">$62,587,158</td><td data-stat="y2" class="right salary-pl">$64,000,000</td><td data-stat="y3"></td></tr></tbody></table>`;
    const c = parseContracts(html);
    expect(c[0]).toMatchObject({ id: 'curryst01', team: 'GSW', salaries: [62587, 64000], options: [null, 'player'] });
  });
  it('reads roster bios', () => {
    const html = `<table id="roster"><tbody><tr><th data-stat="number">2</th><td data-stat="player" data-append-csv="gilgesh01"><a>Shai Gilgeous-Alexander</a></td><td data-stat="pos">PG</td><td data-stat="height">6-6</td><td data-stat="weight">195</td><td data-stat="birth_date" csk="19980712">July 12, 1998</td><td data-stat="flag">ca</td><td data-stat="years_experience">7</td><td data-stat="college">Kentucky</td></tr></tbody></table>`;
    const r = parseRoster(html, 'OKC', 2027);
    expect(r[0]).toMatchObject({ id: 'gilgesh01', heightIn: 78, weightLb: 195, birthDate: '19980712', country: 'CA', exp: 7 });
    // "R" is a rookie; a page without the column says nothing (not "rookie")
    expect(parseRoster(html.replace('>7<', '>R<'), 'OKC', 2027)[0].exp).toBe(0);
    expect(parseRoster(html.replace('<td data-stat="years_experience">7</td>', ''), 'OKC', 2027)[0].exp).toBeNull();
  });
  it('names every flag code: the short list first, any other region in English', () => {
    expect(countryName('CA')).toBe('Canada');
    expect(countryName('CD')).toBe('DR Congo');
    // Neemias Queta and Henri Veesaar's codes aren't on the short list: no "PT" or "EE" on their Player pages
    expect(countryName('PT')).toBe('Portugal');
    expect(countryName('EE')).toBe('Estonia');
    expect(countryName('')).toBe('USA');
    expect(countryName(undefined)).toBe('USA');
    expect(countryName('1')).toBe('1');
  });
  it('gives undrafted players their entry class, so their experience and rookie year are right', () => {
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
  });
});
