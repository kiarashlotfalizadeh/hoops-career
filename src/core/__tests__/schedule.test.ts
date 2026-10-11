import { describe, expect, it } from 'vitest';
import { generateSchedule } from '../league/schedule';
import { FRANCHISES } from '../teams';
import { makeTeam } from '../teamFactory';
import { Rng } from '../random';

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
  it('never has a team play three days running', () => {
    for (const t of teams) {
      const days = games.filter((g) => g.home === t.tid || g.away === t.tid).map((g) => g.day).sort((a, b) => a - b);
      for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
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
