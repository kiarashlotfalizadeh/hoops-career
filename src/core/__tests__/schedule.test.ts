// The schedule: a generated one that keeps the NBA's rules and calendar, and the real 2026-27 one
// from the seed (its games and NBA Cup groups, completed or replaced when the data falls short).
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { generateSchedule, realSchedule } from '../league/schedule';
import { cupCalendar } from '../league/cup';
import { FRANCHISES } from '../teams';
import { makeTeam } from '../teamFactory';
import { Rng } from '../random';
import { dayToDate } from '../league/helpers';

const seed = seedJson as unknown as SeedData;
const make = (s: SeedData | null) => createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: s, rngSeed: 9 });

/** With the NBA Cup, 80 games per team are scheduled up front and two more once the groups are decided. */
function checkSchedule(league: ReturnType<typeof make>) {
  const games = league.schedule.filter((g) => g.type === 'regular');
  const perTeam = league.cup ? 80 : 82;
  expect(games.length).toBe(15 * perTeam);
  for (const t of league.teams) {
    const days = games
      .filter((g) => g.home === t.tid || g.away === t.tid)
      .map((g) => g.day)
      .sort((a, b) => a - b);
    expect(days.length).toBe(perTeam);
    expect(games.filter((g) => g.home === t.tid).length).toBe(perTeam / 2);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
  }
  expect(games.some((g) => g.day === league.allStarDay)).toBe(false);
  expect(league.tradeDeadlineDay).toBeLessThan(league.allStarDay);
  return games;
}

describe('schedule', () => {
  it('generates a season by the NBA rules and calendar, and plays the real one when the seed has it', () => {
    const rng = new Rng(1);
    const teams = FRANCHISES.map((_, i) => makeTeam(i, 2027, rng));
    const { games, lastDay, allStarDay, cup } = generateSchedule(teams, 2027, new Rng(7), 1);
    const on = (t: number, d: number) => games.some((g) => g.day === d && (g.home === t || g.away === t));

    // 80 games per team up front (40 at home); the Cup window holds the last two
    expect(games.length).toBe(1200);
    expect(cup).toBeDefined();
    expect(games.some((g) => g.day >= cup!.qfDays[0] && g.day <= cup!.finalDay)).toBe(false);
    for (const t of teams) {
      const days = games
        .filter((g) => g.home === t.tid || g.away === t.tid)
        .map((g) => g.day)
        .sort((a, b) => a - b);
      expect(days.length).toBe(80);
      expect(games.filter((g) => g.home === t.tid).length).toBe(40);
      // every team off back-to-backs into the knockout window and out of the championship night (anyone
      // might play a quarterfinal on the first night or the championship on the last)
      expect(on(t.tid, cup!.qfDays[0] - 2) && on(t.tid, cup!.qfDays[0] - 1)).toBe(false);
      expect(on(t.tid, cup!.finalDay + 1) && on(t.tid, cup!.finalDay + 2)).toBe(false);
      // never three days running, never four games in five nights
      for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
      for (let i = 3; i < days.length; i++) expect(days[i] - days[i - 3]).toBeGreaterThan(4);
    }
    // never a team twice on one day, and the All-Star break empty
    const seen = new Set<string>();
    for (const g of games) {
      for (const t of [g.home, g.away]) {
        const k = `${g.day}-${t}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    expect(games.some((g) => g.day === allStarDay)).toBe(false);
    expect(lastDay).toBeLessThan(200);
    // division rivals three or four times and the other conference twice
    const meetings = (a: number, b: number) => games.filter((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)).length;
    for (const a of teams) {
      for (const b of teams) {
        if (a.tid >= b.tid) continue;
        const n = meetings(a.tid, b.tid);
        if (a.conf !== b.conf) expect(n).toBe(2);
        else if (a.div === b.div) expect([3, 4]).toContain(n);
        else expect([2, 3, 4]).toContain(n);
      }
    }

    // the NBA calendar: the All-Star Game on a Sunday, the deadline the Thursday ten days before, dark on Thanksgiving and Christmas Eve
    for (const season of [2027, 2028, 2030, 2031]) {
      const s = generateSchedule(teams, season, new Rng(season), 1);
      expect(dayToDate(season, s.allStarDay).getUTCDay()).toBe(0);
      expect(dayToDate(season, s.allStarDay).getUTCMonth()).toBe(1);
      expect(dayToDate(season, s.tradeDeadlineDay).getUTCDay()).toBe(4);
      expect(s.allStarDay - s.tradeDeadlineDay).toBe(10);
      for (const g of s.games) {
        const d = dayToDate(season, g.day);
        expect(d.getUTCMonth() === 11 && d.getUTCDate() === 24).toBe(false);
        // Thanksgiving is the fourth Thursday
        expect(d.getUTCMonth() === 10 && d.getUTCDay() === 4 && d.getUTCDate() >= 22 && d.getUTCDate() <= 28).toBe(false);
      }
      // a fifth Thursday in November (2029-30) is a game night like any other
      const fifth = [29, 30].find((x) => new Date(Date.UTC(season - 1, 10, x)).getUTCDay() === 4);
      if (fifth) expect(s.games.some((g) => dayToDate(season, g.day).getUTCMonth() === 10 && dayToDate(season, g.day).getUTCDate() === fifth)).toBe(true);
    }
    // the Cup's group stage ends on the day after Thanksgiving every season, whatever day November starts on
    for (let season = 2027; season <= 2045; season++) {
      const { nights } = cupCalendar(season);
      for (const d of nights) expect(dayToDate(season, d).getUTCMonth()).toBe(10);
      const thanksgiving = dayToDate(season, nights[4] - 1);
      expect(thanksgiving.getUTCDay()).toBe(4);
      expect(thanksgiving.getUTCDate()).toBeGreaterThanOrEqual(22);
      expect(thanksgiving.getUTCDate()).toBeLessThanOrEqual(28);
    }

    if (!seed.schedule) return;
    // the real 2026-27 schedule: the real games and the real NBA Cup groups
    {
      const league = make(seed);
      const real = checkSchedule(league);
      const ab = (tid: number) => league.teams[tid].abbrev;
      const opening = real.filter((g) => g.day === 0).map((g) => `${ab(g.away)}@${ab(g.home)}`);
      expect(opening).toEqual(seed.schedule.games.filter((g) => g.startsWith('0:')).map((g) => g.slice(2)));
      expect(opening).toContain('BOS@DET');
      expect(dayToDate(league.season, 0).toISOString().slice(0, 10)).toBe('2026-10-20');
      const listed = new Set(seed.schedule.games);
      expect(real.every((g) => listed.has(`${g.day}:${ab(g.away)}@${ab(g.home)}`))).toBe(true);
      if (seed.schedule.cup) {
        const c = league.cup!;
        expect(c.groups.map((g) => g.id)).toEqual(['East A', 'East B', 'East C', 'West A', 'West B', 'West C']);
        expect(c.groups[0].tids.map(ab).sort()).toEqual(seed.schedule.cup.groups['East A']);
        expect(real.filter((g) => g.cup === 'group')).toHaveLength(60);
        // knockouts Dec 4-5, semifinals Dec 8, championship Dec 11
        expect([...c.qfDays, c.sfDay, c.finalDay].map((d) => dayToDate(league.season, d).toISOString().slice(5, 10))).toEqual(['12-04', '12-05', '12-08', '12-11']);
      }
      // All-Star Sunday falls in the real February break
      expect(dayToDate(league.season, league.allStarDay).getUTCMonth()).toBe(1);
    }
    // completes the schedule to 82 games without Cup data
    {
      const league = make({ ...seed, schedule: { ...seed.schedule, cup: undefined } });
      expect(league.cup).toBeNull();
      const real = checkSchedule(league);
      const ab = (tid: number) => league.teams[tid].abbrev;
      const listed = new Set(seed.schedule.games);
      const filled = real.filter((g) => !listed.has(`${g.day}:${ab(g.away)}@${ab(g.home)}`));
      expect(filled.length).toBe(1230 - seed.schedule.games.length);
      for (const g of filled) expect(dayToDate(league.season, g.day).getUTCMonth()).toBe(11);
    }
    // falls back to a generated schedule when the data is missing or for another season
    checkSchedule(make({ ...seed, schedule: undefined }));
    const fictional = make(null).teams;
    expect(realSchedule(fictional, { ...seed.schedule, season: 2028 }, 2027, new Rng(1), 1)).toBeNull();
    expect(realSchedule(fictional, { season: 2027, games: seed.schedule.games.slice(0, 500) }, 2027, new Rng(1), 1)).toBeNull();
  });
});
