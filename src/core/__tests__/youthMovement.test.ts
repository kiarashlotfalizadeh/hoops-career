import { describe, expect, it } from 'vitest';
import { autoRotation } from '../ai/coachAI';
import { createLeague, defaultSettings } from '../league/create';
import { buildSimInput, restVeterans, youthLean, youthMovement, youthNews } from '../league/games';
import { startRegularSeason } from '../league/season';
import { teamPlayers, teamSeason } from '../league/helpers';
import { playerAge } from '../playerGen';
import type { League } from '../types';

/** A fictional league in the regular season, every team's record set by its tid within its conference (the higher, the worse). */
function league(day: number): League {
  const L = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  startRegularSeason(L);
  L.day = day;
  for (const conf of ['E', 'W'] as const)
    L.teams
      .filter((t) => t.conf === conf)
      .forEach((t, i) => {
        const ts = teamSeason(t, L.season);
        ts.won = 40 - 2 * i;
        ts.lost = 12 + 2 * i;
        t.strategy = i >= 10 ? 'rebuild' : 'retool';
      });
  return L;
}

const bottom = (L: League, conf: 'E' | 'W', k: number) => L.teams.filter((t) => t.conf === conf && t.tid !== L.userTid).slice(-k);

describe('youth movement', () => {
  it('leans to the young and away from the veterans', () => {
    expect(youthLean(20)).toBeGreaterThan(youthLean(24));
    expect(youthLean(24)).toBeGreaterThan(0);
    expect(youthLean(26)).toBe(0);
    expect(youthLean(30)).toBeLessThan(0);
    expect(youthLean(34)).toBeLessThan(youthLean(30));
  });

  it('starts with rebuilding teams at the bottom of their conference, and never with the user', () => {
    const early = league(20);
    expect(early.teams.every((t) => youthMovement(early, t.tid) === 0)).toBe(true);
    const L = league(50);
    for (const conf of ['E', 'W'] as const) {
      // the bottom four rebuild from about 20 games in; the next one up waits for the deadline
      for (const t of bottom(L, conf, 4)) expect(youthMovement(L, t.tid)).toBe(1);
      expect(youthMovement(L, bottom(L, conf, 5)[0].tid)).toBe(0);
    }
    expect(youthMovement(L, L.userTid)).toBe(0);
    // after the deadline, every rebuilder out of the race; a contender never
    const late = league(0);
    late.day = late.tradeDeadlineDay + 1;
    for (const conf of ['E', 'W'] as const) for (const t of bottom(late, conf, 5)) expect(youthMovement(late, t.tid)).toBe(1);
    const contender = bottom(late, 'W', 1)[0];
    contender.strategy = 'contend';
    late.day++;
    expect(youthMovement(late, contender.tid)).toBe(0);
  });

  it('plays the young more, sits veterans some nights, and says so in the news', () => {
    const L = league(0);
    L.day = L.tradeDeadlineDay + 1;
    const t = bottom(L, 'E', 1)[0];
    const ps = teamPlayers(L, t.tid);
    const age = (pid: number) => playerAge(L.players[pid], L.season);
    const youngShare = (m: Record<number, number>) => Object.entries(m).reduce((a, [pid, x]) => a + (age(+pid) <= 23 ? x : 0), 0);
    const plain = autoRotation(ps, t.rotation);
    const youth = autoRotation(ps, t.rotation, { lean: (p) => youthLean(playerAge(p, L.season)), maxMinutes: 30 });
    expect(youngShare(youth.minutes)).toBeGreaterThan(youngShare(plain.minutes));
    expect(Math.max(...Object.values(youth.minutes))).toBeLessThanOrEqual(31);
    // over a week, each veteran of 30 or more sits about every other night
    const vets = ps.filter((p) => playerAge(p, L.season) >= 30);
    const rested = new Map<number, number>();
    for (let d = 0; d < 6; d++) {
      const rest: number[] = [];
      restVeterans(L, ps, L.day + d, rest);
      for (const pid of rest) rested.set(pid, (rested.get(pid) ?? 0) + 1);
    }
    for (const p of vets) expect(rested.get(p.pid)).toBe(3);
    // the engine gets the rest list on a game night
    const input = buildSimInput(L, t.tid, L.day, 'regular');
    const tonight: number[] = [];
    restVeterans(L, ps, L.day, tonight);
    for (const pid of tonight) expect(input.rest).toContain(pid);
    youthNews(L);
    youthNews(L);
    expect(L.news.filter((n) => n.tids[0] === t.tid && n.text.includes('young players'))).toHaveLength(1);
  });
});
