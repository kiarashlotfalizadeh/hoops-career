import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { teamPlayers } from '../league/helpers';
import { CAP } from '../constants';
import { RATING_KEYS } from '../ratings';
import { BBREF_TO_TID } from '../teams';
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

  it("keeps waived players' leftover pay as dead money, not as players on the roster", () => {
    const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 5, preseasonCuts: false });
    // the contracts table lists them under the team still paying them, below any playing contract
    const waived = seed.players.filter((sp) => sp.team && sp.contract && !sp.contract.twoWay && sp.contract.salaries[0] < CAP.minContract);
    expect(waived.length).toBeGreaterThan(0);
    const byId = new Map(Object.values(league.players).map((p) => [p.bbrefId, p]));
    for (const sp of waived) {
      const p = byId.get(sp.id);
      // a free agent if he played in the seed's seasons, else not in the league (Rubio retired in 2024)
      if (sp.stats.some((s) => s.gp > 0)) expect(p?.tid).toBe(FREE_AGENT);
      else expect(p).toBeUndefined();
      expect(league.teams[BBREF_TO_TID[sp.team!]].deadMoney).toContainEqual(
        expect.objectContaining({ name: `${sp.first} ${sp.last}`, season: league.season, amount: sp.contract!.salaries[0] }),
      );
    }
    for (const p of Object.values(league.players)) if (p.tid >= 0 && !p.contract.twoWay) expect(p.contract.salaries[0]).toBeGreaterThanOrEqual(CAP.minContract);
  });

  it('puts first-round picks still on their first deal on the rookie scale', () => {
    const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 5, preseasonCuts: false });
    const byId = new Map(Object.values(league.players).map((p) => [p.bbrefId, p]));
    // the last two classes' first-rounders are all on their rookie deals
    const recent = seed.players.filter((sp) => sp.draft?.round === 1 && sp.draft.year >= league.season - 2 && sp.contract && !sp.contract.twoWay);
    expect(recent.length).toBeGreaterThan(40);
    for (const sp of recent) expect(byId.get(sp.id)!.contract.rookie).toBe(true);
    // so is a third-year pick (Castle's deal runs through next season, the team's option year)
    const castle = byId.get('castlst01');
    if (castle) expect(castle.contract).toMatchObject({ rookie: true, option: 'team' });
    // a first-rounder waived onto a minimum deal, second-rounders and veterans past their four years aren't
    const bufkin = byId.get('bufkiko01');
    if (bufkin) expect(bufkin.contract.rookie).toBeUndefined();
    for (const p of Object.values(league.players)) if (p.contract.rookie) expect([p.draft.round, league.season - 1 - p.draft.year < 4]).toEqual([1, true]);
  });
});
