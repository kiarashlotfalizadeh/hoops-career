import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { CAP } from '../constants';
import { teamPlayers } from '../league/helpers';
import { BODIES_KEPT, seasonHonors } from '../league/media';

describe('the press over a whole season', () => {
  it('honors the last month, previews every round and the Finals, wraps the season, and keeps its size', () => {
    const league = createLeague({ name: 'press', userTid: 12, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 5 });
    league.id = 'press_season';
    for (const p of teamPlayers(league, 12).slice(CAP.rosterMax)) p.tid = -1;
    expect(startRegularSeason(league)).toEqual([]);
    let guard = 0;
    while (['regular', 'playin', 'playoffs'].includes(league.phase) && guard++ < 500) simDay(league);
    expect(league.phase).toBe('draftLottery');
    const m = league.media!;
    // each round previewed once, and the season wrapped
    expect(m.done?.keys).toEqual(expect.arrayContaining(['surprises', 'midseason', 'r1', 'r2', 'r3', 'r4', 'wrap']));
    expect(league.news.some((n) => n.kind === 'preview' && n.weight === 3 && n.head?.includes('Finals'))).toBe(true);
    // the monthly honors close out the regular season too, once
    expect(m.month?.done).toBe(true);
    const months = new Set(
      seasonHonors(league)
        .filter((h) => h.kind === 'potm')
        .map((h) => h.day),
    );
    expect(months.size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...months)).toBeGreaterThan(league.regularSeasonDays - 5);
    // proportion: front pages are the exception
    const press = league.news.filter((n) => n.head && n.kind !== 'game');
    expect(press.filter((n) => n.weight === 3).length).toBeLessThan(press.length / 3);
    // front pages about the user's team stop a long sim: the press keeps its own to a handful (game day's and the career's are theirs)
    const PRESS = ['power', 'honor', 'column', 'preview', 'rumor', 'trade'];
    const mineBig = league.news.filter(
      (n) => n.weight === 3 && PRESS.includes(n.kind) && (n.tids.includes(league.userTid) || n.pids.some((pid) => league.players[pid]?.tid === league.userTid)),
    );
    expect(mineBig.length).toBeLessThanOrEqual(5);
    // and the save stays sane: bodies only on the latest stories, roundups a fortnight
    expect(league.news.filter((n) => n.body).length).toBeLessThanOrEqual(BODIES_KEPT);
    expect(league.news.filter((n) => n.text.startsWith('Around the league')).every((n) => n.day >= league.day - 15)).toBe(true);
    expect(JSON.stringify(m).length).toBeLessThan(30_000);
  }, 240_000);
});
