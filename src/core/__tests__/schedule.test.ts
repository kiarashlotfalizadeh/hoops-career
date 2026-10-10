import { describe, expect, it } from 'vitest';
import { generateSchedule } from '../league/schedule';
import { FRANCHISES } from '../teams';
import { makeTeam } from '../teamFactory';
import { Rng } from '../random';

describe('schedule', () => {
  const rng = new Rng(1);
  const teams = FRANCHISES.map((_, i) => makeTeam(i, 2027, rng));
  const { games, lastDay, allStarDay } = generateSchedule(teams, 2027, new Rng(7), 1);
  it('has 1230 games, 82 per team, 41 at home', () => {
    expect(games.length).toBe(1230);
    for (const t of teams) {
      const mine = games.filter((g) => g.home === t.tid || g.away === t.tid);
      expect(mine.length).toBe(82);
      expect(games.filter((g) => g.home === t.tid).length).toBe(41);
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
  it('plays division rivals four times', () => {
    const a = teams[0];
    const rival = teams.find((t) => t.div === a.div && t.tid !== a.tid)!;
    expect(games.filter((g) => (g.home === a.tid && g.away === rival.tid) || (g.home === rival.tid && g.away === a.tid)).length).toBe(4);
  });
});
