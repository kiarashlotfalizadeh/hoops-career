import { describe, expect, it } from 'vitest';
import { generateSchedule } from '../league/schedule';
import { FRANCHISES } from '../teams';
import { makeTeam } from '../teamFactory';
import { Rng } from '../random';
import { dayToDate } from '../league/helpers';

describe('schedule', () => {
  const rng = new Rng(1);
  const teams = FRANCHISES.map((_, i) => makeTeam(i, 2027, rng));
  const { games, lastDay, allStarDay, cup } = generateSchedule(teams, 2027, new Rng(7), 1);
  it('has 80 games per team up front (40 at home); the Cup window holds the last two', () => {
    expect(games.length).toBe(1200);
    for (const t of teams) {
      const mine = games.filter((g) => g.home === t.tid || g.away === t.tid);
      expect(mine.length).toBe(80);
      expect(games.filter((g) => g.home === t.tid).length).toBe(40);
    }
    expect(cup).toBeDefined();
    expect(games.some((g) => g.day >= cup!.qfDays[0] && g.day <= cup!.finalDay)).toBe(false);
  });
  it('keeps every team off back-to-backs into the knockout window and out of the championship night', () => {
    // anyone might play a quarterfinal on the first night or the championship on the last
    const on = (t: number, d: number) => games.some((g) => g.day === d && (g.home === t || g.away === t));
    for (const t of teams) {
      expect(on(t.tid, cup!.qfDays[0] - 2) && on(t.tid, cup!.qfDays[0] - 1)).toBe(false);
      expect(on(t.tid, cup!.finalDay + 1) && on(t.tid, cup!.finalDay + 2)).toBe(false);
    }
  });
  it('never has a team play three days running', () => {
    for (const t of teams) {
      const days = games
        .filter((g) => g.home === t.tid || g.away === t.tid)
        .map((g) => g.day)
        .sort((a, b) => a - b);
      for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
    }
  });
  it('never has a team play four games in five nights', () => {
    for (const t of teams) {
      const days = games
        .filter((g) => g.home === t.tid || g.away === t.tid)
        .map((g) => g.day)
        .sort((a, b) => a - b);
      for (let i = 3; i < days.length; i++) expect(days[i] - days[i - 3]).toBeGreaterThan(4);
    }
  });
  it('follows the NBA calendar: the All-Star Game on a Sunday, the deadline the Thursday ten days before, dark on Thanksgiving and Christmas Eve', () => {
    for (const season of [2027, 2028, 2031]) {
      const s = generateSchedule(teams, season, new Rng(season), 1);
      expect(dayToDate(season, s.allStarDay).getUTCDay()).toBe(0);
      expect(dayToDate(season, s.allStarDay).getUTCMonth()).toBe(1);
      expect(dayToDate(season, s.tradeDeadlineDay).getUTCDay()).toBe(4);
      expect(s.allStarDay - s.tradeDeadlineDay).toBe(10);
      for (const g of s.games) {
        const d = dayToDate(season, g.day);
        expect(d.getUTCMonth() === 11 && d.getUTCDate() === 24).toBe(false);
        expect(d.getUTCMonth() === 10 && d.getUTCDay() === 4 && d.getUTCDate() >= 22).toBe(false);
      }
    }
  });
  it('never schedules a team twice on one day and leaves the All-Star break empty', () => {
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
  });
  it('plays division rivals three or four times and the other conference twice', () => {
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
  });
});
