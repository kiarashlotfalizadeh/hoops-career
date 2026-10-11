import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { teamPlayers } from '../league/helpers';
import { CAP } from '../constants';
import { RATING_KEYS } from '../ratings';
import { FREE_AGENT } from '../types';

const seed = seedJson as unknown as SeedData;
const real = seed.players.length > 0;

describe.skipIf(!real)('real-player seed', () => {
  it('rates the league the way the league rates itself', () => {
    const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 5 });
    const players = Object.values(league.players).filter((p) => p.real);
    expect(players.length).toBeGreaterThan(400);
    for (const p of players) for (const k of RATING_KEYS) expect(p.ratings[k]).toBeGreaterThanOrEqual(1);
    const top = [...players]
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 10)
      .map((p) => p.bbrefId);
    for (const id of ['jokicni01', 'gilgesh01', 'doncilu01', 'wembavi01']) expect(top).toContain(id);
    // efficient bench bigs no longer outrank stars
    const kessler = players.find((p) => p.bbrefId === 'kesslwa01');
    if (kessler) expect(kessler.ovr).toBeLessThan(88);
    // careers: experience never contradicts the seasons on record; an undrafted veteran already playing when the
    // record begins isn't a third-year player; undrafted rookies are rookies; LeBron's draft is unknown
    const firstRecord = Math.min(...players.flatMap((p) => p.stats.filter((s) => s.real).map((s) => s.season)));
    for (const p of players) {
      const seasons = [...new Set(p.stats.filter((s) => s.real && s.gp > 0).map((s) => s.season))];
      expect(p.experience).toBeGreaterThanOrEqual(seasons.length);
      if (!p.draft.round && p.tid >= 0 && league.season - p.bornYear >= 27 && p.experience <= 3) expect(Math.min(...seasons)).toBeGreaterThan(firstRecord);
      if (p.draft.round === 2) expect(p.draft.pick).toBeLessThanOrEqual(30);
    }
    const vanVleet = players.find((p) => p.bbrefId === 'vanvlfr01');
    if (vanVleet) expect(vanVleet.experience).toBeGreaterThanOrEqual(8);
    const lebron = players.find((p) => p.bbrefId === 'jamesle01');
    if (lebron && !lebron.draft.round) {
      expect(lebron.experience).toBeGreaterThanOrEqual(15);
      expect(lebron.draft.year).toBe(0);
    }
    const undraftedRookies = players.filter((p) => !p.draft.round && !p.stats.some((s) => s.real && s.gp > 0) && league.season - p.bornYear <= 25);
    expect(undraftedRookies.length).toBeGreaterThan(0);
    for (const p of undraftedRookies) expect([p.experience, p.draft.year]).toEqual([0, league.season - 1]);
    // AI teams make preseason cuts (two-way contracts don't count); every roster can field a team
    for (const t of league.teams) {
      const roster = teamPlayers(league, t.tid);
      expect(roster.length).toBeGreaterThanOrEqual(CAP.rosterMin);
      if (t.tid !== league.userTid) expect(roster.filter((p) => !p.contract.twoWay).length).toBeLessThanOrEqual(CAP.rosterMax);
    }
  });

  it('plays real-player games with sane box scores', () => {
    const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 6 });
    for (const p of teamPlayers(league, 0)
      .sort((a, b) => a.ovr - b.ovr)
      .slice(0, Math.max(0, teamPlayers(league, 0).length - CAP.rosterMax)))
      p.tid = FREE_AGENT;
    expect(startRegularSeason(league)).toEqual([]);
    for (let d = 0; d < 20; d++) simDay(league);
    const games = league.games.filter((g) => g.type === 'regular');
    expect(games.length).toBeGreaterThan(100);
    const avg = games.reduce((a, g) => a + g.home.pts + g.away.pts, 0) / (games.length * 2);
    expect(avg).toBeGreaterThan(100);
    expect(avg).toBeLessThan(130);
  });
});
