import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import * as S from '../league/season';
import { cupTables } from '../league/cup';
import { curTeamSeason, dayToDate, standardRoster } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { CAP } from '../constants';
import type { GameResult, League } from '../types';

const seed = seedJson as unknown as SeedData;
const make = (s: SeedData | null, rngSeed = 5) => createLeague({ name: 'cup', userTid: 3, coachName: 'c', settings: defaultSettings(), seed: s, rngSeed });

/** Play the regular season through the day after the Cup championship. */
function playThroughCup(league: League) {
  // real opening rosters can carry camp deals: cut the user's team to 15 like the AI teams
  const extra = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
  for (const p of extra.slice(0, Math.max(0, extra.length - CAP.rosterMax))) releasePlayer(league, p, { news: false });
  expect(S.startRegularSeason(league)).toEqual([]);
  const end = league.cup!.finalDay + 1;
  while (league.phase === 'regular' && league.day <= end) S.simDay(league);
}

function checkFinalSchedule(league: League) {
  const regular = league.schedule.filter((g) => g.type === 'regular');
  expect(regular).toHaveLength(1230);
  for (const t of league.teams) {
    const mine = regular.filter((g) => g.home === t.tid || g.away === t.tid);
    expect(mine).toHaveLength(82);
    const homes = mine.filter((g) => g.home === t.tid).length;
    expect(homes).toBeGreaterThanOrEqual(40);
    expect(homes).toBeLessThanOrEqual(42);
    const days = league.schedule
      .filter((g) => g.home === t.tid || g.away === t.tid)
      .map((g) => g.day)
      .sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
  }
}

describe('NBA Cup', () => {
  it('draws six groups of five within each conference, everyone hosting two group games on Cup nights', () => {
    const league = make(null);
    const cup = league.cup!;
    expect(cup.groups).toHaveLength(6);
    const all = cup.groups.flatMap((g) => g.tids);
    expect(new Set(all).size).toBe(30);
    for (const g of cup.groups) {
      expect(g.tids).toHaveLength(5);
      for (const tid of g.tids) expect(league.teams[tid].conf).toBe(g.conf);
    }
    const groupGames = league.schedule.filter((g) => g.cup === 'group');
    expect(groupGames).toHaveLength(60);
    for (const tid of all) {
      expect(groupGames.filter((g) => g.home === tid)).toHaveLength(2);
      expect(groupGames.filter((g) => g.away === tid)).toHaveLength(2);
    }
    for (const g of groupGames) {
      expect(cup.nights).toContain(g.day);
      expect([2, 5]).toContain(dayToDate(league.season, g.day).getUTCDay()); // Tuesdays and Fridays
      const grp = cup.groups.find((x) => x.tids.includes(g.home))!;
      expect(grp.tids).toContain(g.away);
    }
  });

  it('plays the knockouts, crowns a champion and leaves every team on 82 games', () => {
    const league = make(null);
    playThroughCup(league);
    const cup = league.cup!;
    expect(cup.seeds!.E).toHaveLength(4);
    expect(cup.seeds!.W).toHaveLength(4);
    // seeds 1-3 are group winners, seed 4 a runner-up
    const tables = cupTables(league);
    const rankOf = (tid: number) => tables.flatMap((t) => t.rows).find((r) => r.tid === tid)!.rank;
    for (const conf of ['E', 'W'] as const) {
      expect(cup.seeds![conf].slice(0, 3).map(rankOf)).toEqual([1, 1, 1]);
      expect(rankOf(cup.seeds![conf][3])).toBe(2);
    }
    expect(cup.bracket.filter((t) => t.round === 'qf')).toHaveLength(4);
    expect(cup.bracket.filter((t) => t.round === 'sf')).toHaveLength(2);
    const final = cup.bracket.find((t) => t.round === 'final')!;
    expect(final.winner).toBeDefined();
    expect(league.teams[final.high].conf).not.toBe(league.teams[final.low].conf);
    expect(cup.champion).toBe(final.winner);
    const aw = league.awards.find((a) => a.season === league.season)!;
    expect(aw.cupWinner).toBe(cup.champion);
    expect(aw.cupMvp).toBeDefined();
    expect(league.players[aw.cupMvp!].awards.some((a) => a.type === 'NBA Cup MVP')).toBe(true);
    checkFinalSchedule(league);

    // the championship doesn't count: records only include regular-season games
    const res = league.games.find((g) => g.gid === final.gid) as GameResult;
    expect(res.type).toBe('cup');
    for (const tid of [final.high, final.low]) {
      const ts = curTeamSeason(league, tid);
      const played = league.schedule.filter((g) => g.type === 'regular' && g.played && (g.home === tid || g.away === tid)).length;
      expect(ts.won + ts.lost).toBe(played);
    }
    const champStar = res.home.players.find((b) => b.min > 0)!;
    const statGames = league.players[champStar.pid].stats.filter((s) => s.season === league.season).reduce((a, s) => a + s.gp, 0);
    const counted = league.games.filter((g) => g.type === 'regular' && [...g.home.players, ...g.away.players].some((b) => b.pid === champStar.pid && b.min > 0)).length;
    expect(statGames).toBe(counted);
  });

  it.skipIf(!seed.schedule?.cup)('runs the real 2026-27 Cup in the real December window', () => {
    const league = make(seed, 9);
    playThroughCup(league);
    expect(league.cup!.champion).toBeDefined();
    checkFinalSchedule(league);
    // the knockout window held only Cup games and the games for teams that didn't advance
    const window = league.schedule.filter((g) => g.day >= league.cup!.qfDays[0] && g.day <= league.cup!.finalDay);
    expect(window.filter((g) => g.cup === 'qf' || g.cup === 'sf' || g.cup === 'final')).toHaveLength(7);
    expect(window.filter((g) => !g.cup)).toHaveLength(24);
  });

  it('carries into the next season with a fresh draw seeded by record', () => {
    const league = make(null, 11);
    playThroughCup(league);
    const prevChamp = league.cup!.champion;
    while (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') S.simDay(league);
    S.startDraft(league);
    S.finishDraftPhase(league);
    S.startFreeAgency(league);
    S.newSeason(league);
    expect(league.cup!.season).toBe(league.season);
    expect(league.cup!.champion).toBeUndefined();
    expect(league.awards.find((a) => a.season === league.season - 1)!.cupWinner).toBe(prevChamp);
    // pots: the three best teams of last season in each conference are in different groups
    for (const conf of ['E', 'W'] as const) {
      const best = league.teams
        .filter((t) => t.conf === conf)
        .map((t) => ({ tid: t.tid, pct: t.seasons.find((s) => s.season === league.season - 1)!.won }))
        .sort((a, b) => b.pct - a.pct);
      const top = best.slice(0, 3);
      // only meaningful without ties at the pot boundary
      if (best[2].pct !== best[3].pct) {
        const groupOf = (tid: number) => league.cup!.groups.find((g) => g.tids.includes(tid))!.id;
        expect(new Set(top.map((x) => groupOf(x.tid))).size).toBe(3);
      }
    }
  }, 30000);
});
