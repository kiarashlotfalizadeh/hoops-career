import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { realSchedule } from '../league/schedule';
import { dayToDate, teamPlayers } from '../league/helpers';
import { Rng } from '../random';
import { CAP } from '../constants';

const seed = seedJson as unknown as SeedData;
const make = (s: SeedData | null, settings = defaultSettings()) => createLeague({ name: 's', userTid: 0, coachName: 'c', settings, seed: s, rngSeed: 9 });

/** With the NBA Cup, 80 games per team are scheduled up front and two more once the groups are decided. */
function checkSchedule(league: ReturnType<typeof make>) {
  const games = league.schedule.filter((g) => g.type === 'regular');
  const perTeam = league.cup ? 80 : 82;
  expect(games.length).toBe(15 * perTeam);
  for (const t of league.teams) {
    const days = games.filter((g) => g.home === t.tid || g.away === t.tid).map((g) => g.day).sort((a, b) => a - b);
    expect(days.length).toBe(perTeam);
    expect(games.filter((g) => g.home === t.tid).length).toBe(perTeam / 2);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
  }
  expect(games.some((g) => g.day === league.allStarDay)).toBe(false);
  expect(league.tradeDeadlineDay).toBeLessThan(league.allStarDay);
  return games;
}

describe.skipIf(!seed.schedule)('real 2026-27 schedule', () => {
  it('plays the real games and the real NBA Cup groups', () => {
    const league = make(seed);
    const games = checkSchedule(league);
    const ab = (tid: number) => league.teams[tid].abbrev;
    const opening = games.filter((g) => g.day === 0).map((g) => `${ab(g.away)}@${ab(g.home)}`);
    expect(opening).toEqual(seed.schedule!.games.filter((g) => g.startsWith('0:')).map((g) => g.slice(2)));
    expect(opening).toContain('BOS@DET');
    expect(dayToDate(league.season, 0).toISOString().slice(0, 10)).toBe('2026-10-20');
    const real = new Set(seed.schedule!.games);
    expect(games.every((g) => real.has(`${g.day}:${ab(g.away)}@${ab(g.home)}`))).toBe(true);
    if (seed.schedule!.cup) {
      const cup = league.cup!;
      expect(cup.groups.map((g) => g.id)).toEqual(['East A', 'East B', 'East C', 'West A', 'West B', 'West C']);
      expect(cup.groups[0].tids.map(ab).sort()).toEqual(seed.schedule!.cup.groups['East A']);
      expect(games.filter((g) => g.cup === 'group')).toHaveLength(60);
      // knockouts Dec 4-5, semifinals Dec 8, championship Dec 11
      expect([...cup.qfDays, cup.sfDay, cup.finalDay].map((d) => dayToDate(league.season, d).toISOString().slice(5, 10))).toEqual(['12-04', '12-05', '12-08', '12-11']);
    }
    // All-Star Sunday falls in the real February break
    expect(dayToDate(league.season, league.allStarDay).getUTCMonth()).toBe(1);
  });

  it('completes the schedule to 82 games without Cup data', () => {
    const league = make({ ...seed, schedule: { ...seed.schedule!, cup: undefined } });
    expect(league.cup).toBeNull();
    const games = checkSchedule(league);
    const ab = (tid: number) => league.teams[tid].abbrev;
    const real = new Set(seed.schedule!.games);
    const filled = games.filter((g) => !real.has(`${g.day}:${ab(g.away)}@${ab(g.home)}`));
    expect(filled.length).toBe(1230 - seed.schedule!.games.length);
    for (const g of filled) expect(dayToDate(league.season, g.day).getUTCMonth()).toBe(11);
  });

  it('falls back to a generated schedule when the data is missing or for another season', () => {
    checkSchedule(make({ ...seed, schedule: undefined }));
    const teams = make(null).teams;
    expect(realSchedule(teams, { ...seed.schedule!, season: 2028 }, 2027, new Rng(1), 1)).toBeNull();
    expect(realSchedule(teams, { season: 2027, games: seed.schedule!.games.slice(0, 500) }, 2027, new Rng(1), 1)).toBeNull();
  });
});

describe.skipIf(!seed.picks)('real future pick ownership', () => {
  it('has exactly one owner for every pick through the last seeded draft', () => {
    const league = make(seed);
    const through = seed.picksThrough!;
    for (let season = league.season; season <= through; season++) {
      for (const round of [1, 2]) {
        for (const t of league.teams) {
          expect(league.draftPicks.filter((d) => d.season === season && d.round === round && d.originalTid === t.tid)).toHaveLength(1);
        }
      }
    }
    for (const sp of seed.picks!) {
      const orig = league.teams.findIndex((t) => t.abbrev === sp.original || (sp.original === 'BRK' && t.abbrev === 'BKN') || (sp.original === 'CHO' && t.abbrev === 'CHA') || (sp.original === 'PHO' && t.abbrev === 'PHX'));
      const dp = league.draftPicks.find((d) => d.season === sp.season && d.round === sp.round && d.originalTid === orig)!;
      expect(dp.tid).not.toBe(-1);
      expect(dp.protection).toBe(sp.protection);
    }
    // trades happened: some teams hold several extra first-rounders, some have none in a year
    const firsts = league.teams.map((t) => league.draftPicks.filter((d) => d.round === 1 && d.season <= league.season + 5 && d.tid === t.tid).length);
    expect(Math.max(...firsts)).toBeGreaterThanOrEqual(8);
    expect(Math.min(...firsts)).toBeLessThanOrEqual(4);
  });

  it('keeps own picks in fictional leagues', () => {
    const league = make(null);
    expect(league.draftPicks.every((d) => d.tid === d.originalTid && !d.protection)).toBe(true);
  });
});

describe('opening-night injuries and two-way contracts', () => {
  it.skipIf(!seed.players.some((p) => p.injury))('starts listed players injured, counted in their team games', () => {
    const league = make(seed);
    const hurt = Object.values(league.players).filter((p) => p.injury);
    const listed = seed.players.filter((p) => p.injury && p.team);
    expect(hurt.length).toBeGreaterThan(0);
    expect(hurt.length).toBeLessThanOrEqual(listed.length);
    for (const p of hurt) expect(p.injury!.gamesRemaining).toBeGreaterThan(0);
    // injuries off: everyone healthy
    expect(Object.values(make(seed, { ...defaultSettings(), injuries: false }).players).some((p) => p.injury)).toBe(false);
  });

  it.skipIf(!seed.players.some((p) => p.contract?.twoWay))('marks two-way contracts, which AI cuts and the roster limit leave out', () => {
    const league = make(seed);
    const twoWay = Object.values(league.players).filter((p) => p.contract.twoWay);
    expect(twoWay.length).toBeGreaterThan(0);
    for (const t of league.teams) {
      if (t.tid === league.userTid) continue;
      expect(teamPlayers(league, t.tid).filter((p) => !p.contract.twoWay).length).toBeLessThanOrEqual(CAP.rosterMax);
    }
  });
});
