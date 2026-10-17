// The Rising Stars game on the All-Star day: the best rookies against the best sophomores, names
// and lines kept with the season's awards, an MVP with his award record and the news, all on a
// stream of its own (the league's draws, and every game after it, are the same with or without it),
// no stats counted, and saves.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { migrate } from '../../state/persistence';
import { RISING_ROSTER, risingField, risingStars } from '../league/risingStars';
import { simDay } from '../league/season';
import type { League } from '../types';

describe('the Rising Stars game', () => {
  let l: League;
  let eve: League;
  beforeAll(() => {
    l = testLeague('rising');
    l.id = 'lg_rising';
    while (l.day < l.allStarDay) simDay(l);
    eve = structuredClone(l);
    simDay(l);
  }, 120_000);

  it('is played on the All-Star day: rookies against sophomores, the MVP named and in the news', () => {
    const rs = l.awards.find((a) => a.season === l.season)!.risingStars!;
    expect(rs).toBeDefined();
    expect(rs.rookies).toHaveLength(RISING_ROSTER);
    expect(rs.sophomores).toHaveLength(RISING_ROSTER);
    for (const e of rs.rookies) expect(l.players[e.pid].experience).toBe(0);
    for (const e of rs.sophomores) expect(l.players[e.pid].experience).toBe(1);
    const [r, s] = rs.score;
    expect(r).not.toBe(s);
    expect(r + s).toBeGreaterThan(150);
    // the box adds up to the score
    expect(rs.rookies.reduce((a, e) => a + e.pts, 0)).toBe(r);
    expect(rs.sophomores.reduce((a, e) => a + e.pts, 0)).toBe(s);
    expect([...rs.rookies, ...rs.sophomores].some((e) => e.pid === rs.mvp)).toBe(true);
    expect(l.players[rs.mvp!].awards).toContainEqual({ season: l.season, type: 'Rising Stars MVP' });
    expect(l.news.some((n) => n.kind === 'award' && n.text.startsWith('Rising Stars:'))).toBe(true);
  });

  it('draws on a stream of its own, counts no stats, and plays the same game for the same league', () => {
    const x = structuredClone(eve);
    const before = { rng: x.rng, gp: Object.values(x.players).map((p) => p.stats.reduce((a, s) => a + s.gp, 0)) };
    // the field it would pick that night, and a game played without the rest of the day
    const field = risingField(x);
    expect(field.rookies.length).toBeGreaterThanOrEqual(8);
    if (!x.awards.some((a) => a.season === x.season)) x.awards.push({ season: x.season, allNba: [], allDefense: [], allRookie: [], allStars: { E: [], W: [] } });
    risingStars(x);
    expect(x.rng).toBe(before.rng);
    expect(Object.values(x.players).map((p) => p.stats.reduce((a, s) => a + s.gp, 0))).toEqual(before.gp);
    const y = structuredClone(eve);
    if (!y.awards.some((a) => a.season === y.season)) y.awards.push({ season: y.season, allNba: [], allDefense: [], allRookie: [], allStars: { E: [], W: [] } });
    risingStars(y);
    expect(y.awards.find((a) => a.season === y.season)!.risingStars).toEqual(x.awards.find((a) => a.season === x.season)!.risingStars);
    // once a season
    const again = structuredClone(x);
    risingStars(again);
    expect(again.news.length).toBe(x.news.length);
  });

  it('survives a save, and a damaged game is dropped on load', () => {
    const rs = l.awards.find((a) => a.season === l.season)!.risingStars!;
    expect(migrate(structuredClone(l)).awards.find((a) => a.season === l.season)!.risingStars).toEqual(rs);
    const bad = structuredClone(l);
    const aw = bad.awards.find((a) => a.season === bad.season)!;
    (aw.risingStars as unknown as { score: unknown }).score = [100];
    expect(migrate(bad).awards.find((a) => a.season === bad.season)!.risingStars).toBeUndefined();
    const odd = structuredClone(l);
    odd.awards.find((a) => a.season === odd.season)!.risingStars!.mvp = 999_999;
    expect(migrate(odd).awards.find((a) => a.season === odd.season)!.risingStars).toBeUndefined();
  });
});
