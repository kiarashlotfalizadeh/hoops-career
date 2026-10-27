// Regression tests for league rules in season: trades, rosters, signing windows and two-way
// contracts; clinching, tiebreaks and the postseason bracket and calendar; awards and the All-Star
// break; injuries, wear and development. Fast: no full-season sims.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { testLeague } from '../../state/__tests__/fixtures';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { advanceDay, simDay, startRegularSeason } from '../league/season';
import { CAP_FOR, curTeamSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers } from '../league/helpers';
import { askingContract, convertTwoWay, releasePlayer, signPlayer, twoWaySalary, valueScore } from '../league/contracts';
import { signingClosedReason, userOffer, userTwoWayOffer } from '../league/freeAgency';
import { tradingClosedReason, validateTrade } from '../league/trades';
import { ensureRotation, wearInjuryRisk } from '../league/games';
import { rankedPresets } from '../ai/coachAI';
import { finalsHomeCourt, standings } from '../league/standings';
import { champion, playInDone, processPlayInResult, processPlayoffResult, schedulePlayoffDay, startPlayIn, startPlayoffs } from '../league/playoffs';
import { awardRaces, computeRegularSeasonAwards, selectAllStars } from '../league/awards';
import { inSeasonProgression } from '../league/progression';
import { applyInjury, injuryText, rollInjury } from '../league/injuries';
import { RATING_KEYS, ovrRaw, toDisplay } from '../ratings';
import { playerAge, salaryFor } from '../playerGen';
import { CAP } from '../constants';
import { Rng } from '../random';
import type { League, Player, PlayoffSeries } from '../types';
import { FREE_AGENT } from '../types';

const seed = seedJson as unknown as SeedData;
const real = seed.players.length > 0;
const U = 19;

function league(rngSeed = 7): League {
  const l = createLeague({ name: 'r', userTid: U, coachName: 'c', settings: { ...defaultSettings(), stopOnNews: false }, seed: real ? seed : null, rngSeed });
  // real contract lists carry camp bodies: cut the user to 15 like the AI teams
  const std = () => standardRoster(l, U);
  while (std().length > CAP.rosterMax) releasePlayer(l, std().sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  return l;
}

const fictional = (rngSeed: number, userTid = 19) => createLeague({ name: 'r', userTid, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });

const aiTeam = (l: League) => l.teams.find((t) => t.tid !== l.userTid)!.tid;

describe('trades, rosters and signings', () => {
  it('trading and signing windows, roster limits, sim stops and two-way contracts (bugs 1, 2, 4, 7, 12)', async () => {
    // expiring contracts cannot be traded after the season (bug 1)
    {
      const l = league();
      const mine = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr);
      const p = mine[0];
      p.contract = { start: l.season, salaries: [20_000] }; // up this summer
      const pick = l.draftPicks.find((d) => d.tid === aiTeam(l) && d.round === 2)!;
      const offer = { a: { tid: U, pids: [p.pid], dpids: [] }, b: { tid: aiTeam(l), pids: [], dpids: [pick.dpid] } };
      l.phase = 'regular';
      expect(validateTrade(l, offer).some((e) => e.includes('contract is up'))).toBe(false);
      for (const phase of ['draftLottery', 'draft', 'resign'] as const) {
        l.phase = phase;
        expect(validateTrade(l, offer).some((e) => e.includes('contract is up'))).toBe(true);
      }
      // nor can the user pick up another team's expiring player's rights
      const theirs = standardRoster(l, aiTeam(l))[0];
      theirs.contract = { start: l.season, salaries: [5_000] };
      expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: aiTeam(l), pids: [theirs.pid], dpids: [] } }).some((e) => e.includes('contract is up'))).toBe(true);
    }

    // roster limits: 13-man floor in season, 15 only binds teams adding bodies, 21 in the offseason (bug 2)
    {
      const l = league();
      const ai = aiTeam(l);
      const minDeal = (p: Player) => (p.contract = { start: l.season, salaries: [CAP.minContract, CAP.minContract] });
      const mine = standardRoster(l, U).sort((a, b) => a.ovr - b.ovr);
      const theirs = standardRoster(l, ai).sort((a, b) => a.ovr - b.ovr);
      [...mine, ...theirs].forEach(minDeal);
      // offseason: a 16-man team can swap 1-for-1 and take on a player (limit 21)
      l.phase = 'resign';
      const fa = freeAgents(l)[0];
      signPlayer(l, fa, U, CAP.minContract, 2, { news: false, start: l.season });
      expect(standardRoster(l, U).length).toBe(16);
      expect(validateTrade(l, { a: { tid: U, pids: [mine[0].pid], dpids: [] }, b: { tid: ai, pids: [theirs[0].pid], dpids: [] } })).toEqual([]);
      expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: ai, pids: [theirs[0].pid], dpids: [] } }).filter((e) => /players/.test(e))).toEqual([]);
      // in season the same 0-for-1 breaks the 15-man limit
      l.phase = 'regular';
      releasePlayer(l, fa, { news: false });
      expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: ai, pids: [theirs[0].pid], dpids: [] } }).some((e) => e.includes('max 15'))).toBe(true);
      // ...and a 2-for-1 can't take a 13-man roster to 12
      while (standardRoster(l, U).length > CAP.rosterMin) releasePlayer(l, standardRoster(l, U).sort((a, b) => a.ovr - b.ovr)[0], { news: false });
      const two = standardRoster(l, U)
        .slice(0, 2)
        .map((p) => p.pid);
      expect(validateTrade(l, { a: { tid: U, pids: two, dpids: [] }, b: { tid: ai, pids: [theirs[1].pid], dpids: [] } }).some((e) => e.includes('minimum 13'))).toBe(true);
    }

    // AI teams are trimmed to 15 before opening night, keeping big contracts (bugs 2, 7)
    {
      const l = league();
      const ai = aiTeam(l);
      for (const p of freeAgents(l).slice(0, 3)) signPlayer(l, p, ai, CAP.minContract, 1, { news: false });
      const big = standardRoster(l, ai).sort((a, b) => salaryFor(b, l.season) - salaryFor(a, l.season))[0];
      big.ovr = 40; // worst player on the team, but owed a fortune
      expect(standardRoster(l, ai).length).toBeGreaterThan(CAP.rosterMax);
      expect(startRegularSeason(l)).toEqual([]);
      for (const t of l.teams) expect(standardRoster(l, t.tid).length).toBeLessThanOrEqual(CAP.rosterMax);
      expect(big.tid).toBe(ai);
    }

    // sims stop on deadline day (trades still open) and the day before the All-Star Game (bug 4)
    {
      const { runSim } = await import('../../state/simCore');
      const { flowActions } = await import('../../ui/flow');
      const l = league();
      expect(startRegularSeason(l)).toEqual([]);
      l.day = l.tradeDeadlineDay - 3;
      await runSim(l, { kind: 'deadline' });
      expect(l.day).toBe(l.tradeDeadlineDay);
      expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: aiTeam(l), pids: [], dpids: [] } }).some((e) => e.includes('deadline'))).toBe(false);
      expect(flowActions(l).some((a) => a.id === 'deadline')).toBe(false);
      l.day = l.allStarDay - 4;
      await runSim(l, { kind: 'allStar' });
      expect(l.day).toBe(l.allStarDay - 1);
      expect(l.awards.find((a) => a.season === l.season)?.allStarMvp).toBeUndefined();
      expect(flowActions(l).some((a) => a.id === 'allstar')).toBe(false);
    }

    // trading closes the day after the deadline and through the postseason, for every screen that asks
    {
      const l = league();
      expect(startRegularSeason(l)).toEqual([]);
      const empty = { a: { tid: U, pids: [], dpids: [] }, b: { tid: aiTeam(l), pids: [], dpids: [] } };
      l.day = l.tradeDeadlineDay;
      expect(tradingClosedReason(l)).toBeNull();
      l.day++;
      expect(tradingClosedReason(l)).toMatch(/deadline/);
      expect(validateTrade(l, empty)).toContain(tradingClosedReason(l));
      for (const phase of ['playin', 'playoffs'] as const) {
        l.phase = phase;
        expect(tradingClosedReason(l)).toMatch(/postseason/);
      }
      // it reopens with the lottery
      l.phase = 'draftLottery';
      expect(tradingClosedReason(l)).toBeNull();
    }

    // free agents can be signed in the preseason, regular season and free agency only (bug 12)
    {
      const l = league();
      while (standardRoster(l, U).length > 14) releasePlayer(l, standardRoster(l, U).sort((a, b) => a.ovr - b.ovr)[0], { news: false });
      const fa = freeAgents(l).sort((a, b) => a.ovr - b.ovr)[0];
      for (const phase of ['playin', 'playoffs', 'draftLottery', 'draft', 'resign'] as const) {
        l.phase = phase;
        expect(signingClosedReason(l)).toBeTruthy();
        expect(userOffer(l, fa.pid, CAP_FOR(l).maxContract(10), 1).ok).toBe(false);
      }
      l.phase = 'regular';
      expect(signingClosedReason(l)).toBeNull();
      const ask = askingContract(l, fa, U);
      expect(ask.amount).toBeLessThanOrEqual(CAP_FOR(l).vetMin);
      expect(userOffer(l, fa.pid, ask.amount, ask.years).ok).toBe(true);
    }

    // two-way players sit outside the 15, the cap and the trade roster count
    {
      const l = league();
      const young = freeAgents(l)
        .filter((p) => p.experience <= 3)
        .sort((a, b) => a.ovr - b.ovr)[0];
      const pay = payroll(l, U);
      const n = standardRoster(l, U).length;
      expect(userTwoWayOffer(l, young.pid).ok).toBe(true);
      expect(young.contract.twoWay).toBe(true);
      expect(salaryFor(young, l.season)).toBe(twoWaySalary(l));
      expect(standardRoster(l, U).length).toBe(n);
      expect(teamPlayers(l, U).length).toBe(n + 1);
      expect(payroll(l, U)).toBe(pay);
      // in season (the offseason allows 21) at 15 standard players he can't be converted; with a spot open he takes the minimum
      l.phase = 'regular';
      expect(standardRoster(l, U).length).toBe(CAP.rosterMax);
      expect(convertTwoWay(l, young.pid).ok).toBe(false);
      releasePlayer(l, standardRoster(l, U).sort((a, b) => a.ovr - b.ovr)[0], { news: false });
      expect(convertTwoWay(l, young.pid).ok).toBe(true);
      expect(young.contract.twoWay).toBeUndefined();
      expect(salaryFor(young, l.season)).toBeGreaterThanOrEqual(CAP_FOR(l).minContract);
      // only young players qualify
      const vet = freeAgents(l).find((p) => p.experience > 3)!;
      expect(userTwoWayOffer(l, vet.pid).ok).toBe(false);
      expect(vet.tid).toBe(FREE_AGENT);
    }
  }, 180_000);
});

describe('standings and the postseason', () => {
  const game = (l: League, w: number, lo: number) => ({ type: 'regular', season: l.season, home: { tid: w, pts: 110 }, away: { tid: lo, pts: 100 } });
  const eastOrder = (l: League) =>
    standings(l)
      .filter((r) => r.conf === 'E')
      .map((r) => r.tid);
  // three East teams tied at 50-32; A leads its division, B and C trail better teams in theirs
  function tied() {
    const l = league();
    const east = l.teams.filter((t) => t.conf === 'E');
    const divs = [...new Set(east.map((t) => t.div))];
    const inDiv = (d: number) => east.filter((t) => t.div === divs[d]).map((t) => t.tid);
    const [A, B, C] = [inDiv(0)[0], inDiv(1)[1], inDiv(2)[1]];
    const rec = (tid: number, w: number) => ([curTeamSeason(l, tid).won, curTeamSeason(l, tid).lost] = [w, 82 - w]);
    for (const t of east) rec(t.tid, 30);
    [A, B, C].forEach((tid) => rec(tid, 50));
    rec(inDiv(1)[0], 60);
    rec(inDiv(2)[0], 58);
    return { l, A, B, C };
  }
  /** Win the next game of a series for `winner`, through the scheduled game. */
  function win(l: League, id: string, winner: number) {
    schedulePlayoffDay(l);
    const g = l.schedule.find((x) => x.seriesId === id && !x.played)!;
    g.played = true;
    processPlayoffResult(l, g, g.home === winner);
  }

  it('clinching, NBA tiebreaks, the play-in and bracket, and the playoff calendar (bugs 6, 14; L5, L10, L18, L19)', () => {
    // clinching needs every team below the cut out of reach, not just the next one (bug 6)
    {
      const l = league();
      const east = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
      const west = l.teams.filter((t) => t.conf === 'W').map((t) => t.tid);
      // [won, lost, games left] in rank order
      const recs: [number, number, number][] = [
        [60, 14, 8],
        [58, 16, 8],
        [56, 18, 8],
        [54, 20, 8],
        [52, 22, 8],
        [44, 30, 8], // 6th: the 7th place team can't catch him, but the 9th can
        [42, 40, 0],
        [38, 40, 4],
        [30, 32, 20],
        [20, 60, 2],
        [19, 61, 2],
        [14, 46, 22], // 12th can still reach the 9th's 30 wins
        [13, 67, 2],
        [12, 68, 2],
        [11, 69, 2],
      ];
      l.schedule = [];
      let gid = 1;
      east.forEach((tid, i) => {
        const ts = curTeamSeason(l, tid);
        [ts.won, ts.lost] = recs[i];
        for (let k = 0; k < recs[i][2]; k++) l.schedule.push({ gid: gid++, day: 100 + k, home: tid, away: west[k % west.length], type: 'regular' });
      });
      const st = standings(l).filter((r) => r.conf === 'E');
      const at = (rank: number) => st[rank - 1];
      expect(at(1).tid).toBe(east[0]);
      expect(at(1).clinched).toBe('x');
      expect(at(6).tid).toBe(east[5]);
      expect(at(6).clinched).not.toBe('x');
      expect(at(9).clinched).not.toBe('p');
      expect(at(10).clinched).not.toBe('e');
      expect(at(13).clinched).toBe('e');
    }

    // every seed is marked once the regular season is over, ties at the cuts included
    {
      const l = league();
      const east = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
      // 6th and 7th finish level, as do 10th and 11th: the tiebreakers decide, nothing is left to clinch
      const wins = [60, 55, 50, 48, 46, 44, 44, 42, 40, 38, 38, 30, 25, 20, 15];
      east.forEach((tid, i) => {
        const ts = curTeamSeason(l, tid);
        [ts.won, ts.lost] = [wins[i], 82 - wins[i]];
      });
      l.schedule = l.schedule.map((g) => ({ ...g, played: true }));
      const st = standings(l).filter((r) => r.conf === 'E');
      expect(st.map((r) => r.clinched)).toEqual([...'xxxxxxppppeeeee']);
      // before opening night nobody is marked
      l.schedule = l.schedule.map((g) => ({ ...g, played: false }));
      for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [0, 0];
      expect(standings(l).some((r) => r.clinched)).toBe(false);
    }

    // a 3-way tie is broken on head-to-head among all tied teams (bug 14)
    {
      const l = league();
      const east = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
      east.forEach((tid, i) => {
        const ts = curTeamSeason(l, tid);
        [ts.won, ts.lost] = i < 3 ? [40, 40] : [62 - i, 20 + i];
      });
      const [a, b, c] = east;
      // A 2-0 vs B, B 2-0 vs C, A and C split: A .750, B .500, C .250 among the three
      l.games = [game(l, a, b), game(l, a, b), game(l, b, c), game(l, b, c), game(l, a, c), game(l, c, a)] as unknown as League['games'];
      const order = standings(l)
        .filter((r) => r.won === 40)
        .map((r) => r.tid);
      expect(order).toEqual([a, b, c]);
    }

    // 3+ tied teams: division leader before head-to-head; the rest restart as a two-team tie
    {
      const { l, A, B, C } = tied();
      // A lost all four to B and C; C won the B-C season series
      l.games = [game(l, B, A), game(l, B, A), game(l, C, A), game(l, C, A), game(l, C, B), game(l, C, B)] as unknown as League['games'];
      expect(eastOrder(l).filter((tid) => [A, B, C].includes(tid))).toEqual([A, C, B]);
    }

    // 2 tied teams: head-to-head before division leader
    {
      const { l, A, B, C } = tied();
      curTeamSeason(l, C).won = 49;
      curTeamSeason(l, C).lost = 33;
      l.games = [game(l, B, A), game(l, B, A)] as unknown as League['games'];
      expect(eastOrder(l).filter((tid) => tid === A || tid === B)).toEqual([B, A]);
    }

    // a tie nothing breaks goes to a fixed drawing, not the lowest team id
    {
      const l = league();
      for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [41, 41];
      l.games = [];
      const order = eastOrder(l);
      expect(eastOrder(l)).toEqual(order);
      expect(order).not.toEqual([...order].sort((a, b) => a - b));
    }

    // three teams on the same record skip the other-conference step: point differential decides
    {
      const l = fictional(7);
      const east = l.teams.filter((t) => t.conf === 'E');
      const west = l.teams.filter((t) => t.conf === 'W');
      const divs = [...new Set(east.map((t) => t.div))];
      const inDiv = (d: number) => east.filter((t) => t.div === divs[d]).map((t) => t.tid);
      // one non-leader from each East division, all 41-41 with the same conference record
      const [A, B, C] = [inDiv(0)[1], inDiv(1)[1], inDiv(2)[1]];
      const rec = (tid: number, w: number, cw: number) => Object.assign(curTeamSeason(l, tid), { won: w, lost: 82 - w, confWon: cw, confLost: 52 - cw });
      for (const t of l.teams) rec(t.tid, 30, 20);
      for (const d of [0, 1, 2]) rec(inDiv(d)[0], 60, 40);
      for (const t of west) rec(t.tid, 50, 30);
      for (const tid of [A, B, C]) rec(tid, 41, 26);
      Object.assign(curTeamSeason(l, A), { ptsFor: 9000, ptsAgainst: 9100 });
      Object.assign(curTeamSeason(l, B), { ptsFor: 9000, ptsAgainst: 9000 });
      Object.assign(curTeamSeason(l, C), { ptsFor: 9100, ptsAgainst: 9000 });
      // against the West's playoff teams A won one, B lost one (a two-team tie would read this)
      l.games = [game(l, A, west[0].tid), game(l, west[1].tid, B)] as unknown as League['games'];
      expect(
        standings(l)
          .filter((r) => [A, B, C].includes(r.tid))
          .map((r) => r.tid),
      ).toEqual([C, B, A]);
    }

    // Finals home court between equal records goes by head-to-head, not to the East
    {
      const l = league();
      const e = l.teams.find((t) => t.conf === 'E')!.tid;
      const w = l.teams.find((t) => t.conf === 'W')!.tid;
      for (const tid of [e, w]) [curTeamSeason(l, tid).won, curTeamSeason(l, tid).lost] = [55, 27];
      l.games = [game(l, w, e), game(l, w, e)] as unknown as League['games'];
      expect(finalsHomeCourt(l, e, w)).toBe(w);
      // season series split: record against the other conference
      l.games = [game(l, e, w), game(l, w, e)] as unknown as League['games'];
      curTeamSeason(l, e).confWon = 30;
      curTeamSeason(l, w).confWon = 40;
      expect(finalsHomeCourt(l, e, w)).toBe(e);
    }

    // seeds 1-6, plays 7v8 and 9v10, then the last spot, and pairs 1-8, 4-5, 3-6, 2-7 with higher seeds first
    {
      const l = league();
      for (const conf of ['E', 'W'] as const)
        l.teams.filter((t) => t.conf === conf).forEach((t, i) => ([curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [60 - i * 2, 22 + i * 2]));
      const east = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
      l.games = [];
      startPlayIn(l);
      expect(east.slice(0, 6).map((tid) => curTeamSeason(l, tid).seed)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(l.playIn.filter((p) => p.conf === 'E').map((p) => [p.home, p.away])).toEqual([
        [east[6], east[7]],
        [east[8], east[9]],
      ]);
      // 8 beats 7, 10 beats 9: 7 hosts 10 for the last spot, and 10 takes it
      const play = (id: string, homeWon: boolean) => {
        const g = l.schedule.find((x) => x.seriesId === id && !x.played)!;
        g.played = true;
        processPlayInResult(l, g, homeWon);
      };
      for (const conf of ['E', 'W']) {
        play(`${conf}-78`, false);
        play(`${conf}-910`, false);
      }
      const last = l.playIn.find((p) => p.id === 'E-8')!;
      expect([last.home, last.away]).toEqual([east[6], east[9]]);
      play('E-8', false);
      play('W-8', true);
      expect(playInDone(l)).toBe(true);
      expect(curTeamSeason(l, east[7]).seed).toBe(7);
      expect(curTeamSeason(l, east[9]).seed).toBe(8);
      expect(curTeamSeason(l, east[6]).playoffRound).toBe(-1);
      startPlayoffs(l);
      const r1 = l.playoffs.filter((s) => s.conf === 'E');
      expect(r1.map((s) => [s.highSeed, s.lowSeed])).toEqual([
        [1, 8],
        [4, 5],
        [3, 6],
        [2, 7],
      ]);
      // upsets everywhere but 4-5: the 8 seed meets the 4 seed with home court going to the 4
      for (const s of l.playoffs.filter((x) => x.round === 1)) for (let i = 0; i < 4; i++) win(l, s.id, s.highSeed === 4 ? s.high : s.low);
      const r2 = l.playoffs.find((s) => s.id === 'E2-0')!;
      expect([r2.highSeed, r2.lowSeed]).toEqual([4, 8]);
      expect(r2.high).toBe(east[3]);
      expect(l.playoffs.filter((s) => s.round === 2).length).toBe(4);
      for (const round of [2, 3]) for (const s of l.playoffs.filter((x) => x.round === round)) for (let i = 0; i < 4; i++) win(l, s.id, s.high);
      const finals = l.playoffs.find((s) => s.round === 4)!;
      for (let i = 0; i < 4; i++) win(l, finals.id, finals.low);
      expect(champion(l)).toBe(finals.low);
      expect(curTeamSeason(l, finals.low).playoffRound).toBe(5);
      expect(curTeamSeason(l, finals.high).playoffRound).toBe(4);
    }

    // series play every other day with two days off between rounds
    {
      const l = league();
      const [a, b, c, d] = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
      l.phase = 'playoffs';
      l.schedule = [];
      l.day = 100;
      const series = (id: string, round: number, high: number, low: number): PlayoffSeries => ({
        id,
        round,
        conf: 'E',
        high,
        low,
        highSeed: 1,
        lowSeed: 8,
        highWins: 0,
        lowWins: 0,
      });
      l.playoffs = [series('E1-0', 1, a, b), series('E1-1', 1, c, d)];
      schedulePlayoffDay(l);
      expect(l.schedule.map((g) => g.day)).toEqual([100, 100]);
      for (const g of l.schedule) g.played = true;
      l.playoffs.forEach((s) => (s.highWins = 1));
      l.day = 101;
      schedulePlayoffDay(l);
      expect(l.schedule.filter((g) => !g.played).map((g) => g.day)).toEqual([102, 102]);
      // round 1 over on day 110: round 2 tips off on day 113
      for (const g of l.schedule) g.played = true;
      l.schedule.push({ gid: 999, day: 110, home: a, away: b, type: 'playoffs', seriesId: 'E1-0', played: true });
      l.playoffs.forEach((s) => ((s.highWins = 4), (s.winner = s.high)));
      l.playoffs.push(series('E2-0', 2, a, c));
      l.day = 111;
      schedulePlayoffDay(l);
      expect(l.schedule.filter((g) => !g.played).map((g) => g.day)).toEqual([113]);
    }

    // the next game, and the next round's opener, are on the calendar as soon as a result is in
    {
      const l = league();
      const east = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
      l.phase = 'playoffs';
      l.schedule = [];
      l.day = 100;
      // the East semifinals are done; one conference final is under way
      l.playoffs = [
        { id: 'E2-0', round: 2, conf: 'E', high: east[0], low: east[1], highSeed: 1, lowSeed: 4, highWins: 4, lowWins: 1, winner: east[0] },
        { id: 'E2-1', round: 2, conf: 'E', high: east[2], low: east[3], highSeed: 2, lowSeed: 3, highWins: 3, lowWins: 3 },
      ];
      const game7 = { gid: 1, day: 100, home: east[2], away: east[3], type: 'playoffs' as const, seriesId: 'E2-1', played: true };
      l.schedule.push(game7);
      processPlayoffResult(l, game7, true);
      // East finals wait for the West; with no West bracket here, the opener follows the semis
      const opener = l.schedule.filter((g) => !g.played);
      expect(opener.map((g) => [g.seriesId, g.day])).toEqual([['E3-0', 103]]);
      opener[0].played = true;
      processPlayoffResult(l, opener[0], true);
      expect(l.schedule.filter((g) => !g.played).map((g) => g.day)).toEqual([105]);
    }

    // wear recovers on postseason days too, free agents included
    {
      const l = league();
      l.phase = 'playoffs';
      l.playoffs = [];
      l.schedule = [];
      const p = standardRoster(l, U)[0];
      const fa = freeAgents(l)[0];
      p.wear = fa.wear = 40;
      advanceDay(l);
      expect(p.wear).toBeCloseTo(39.25);
      expect(fa.wear).toBeCloseTo(39.25);
    }
  }, 180_000);
});

describe('awards and the All-Star break', () => {
  /** Every rostered player gets a 70-game line (half of them starters); returns a setter for one line. */
  function seasonOf(l: League) {
    for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [41, 41];
    const line = (p: Player, gp: number, gs: number, ppg: number) => {
      const s = statsLine(p, l.season, p.tid, false);
      Object.assign(s, { gp, gs, min: 24 * gp, pts: ppg * gp, fgm: (ppg / 2.2) * gp, fga: (ppg / 1.1) * gp });
    };
    for (const p of Object.values(l.players)) if (p.tid >= 0) line(p, 70, (p.pid % 2) * 70, 6);
    return line;
  }

  it('award eligibility, races, All-Star selection and replacements, award mail, and the break healing knocks (L13, L18, L19)', () => {
    // the Rookie and Sixth Man ladders pro-rate their 50 games during the season, as the 65-game rule's do
    {
      const l = league();
      const line = seasonOf(l);
      // 70 games in: 43 of them for Rookie of the Year (a flat 50 would leave him off until the vote)
      for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [35, 35];
      const [rookie, short] = standardRoster(l, U);
      rookie.draft.year = short.draft.year = l.season - 1;
      line(rookie, 45, 45, 30);
      line(short, 42, 42, 35);
      const roy = awardRaces(l).roy.map((x) => x.c.p.pid);
      expect(roy[0]).toBe(rookie.pid);
      expect(roy).not.toContain(short.pid);
    }

    // Sixth Man needs more games off the bench than as a starter (half and half is out)
    {
      const l = league();
      const line = seasonOf(l);
      const [half, bench] = standardRoster(l, U);
      line(half, 70, 35, 30);
      line(bench, 70, 34, 25);
      expect(computeRegularSeasonAwards(l).smoy).toBe(bench.pid);
    }

    // Sixth Man isn't held to the 65-game rule (50 games do), and the race shows what the vote will do
    {
      const l = league();
      const line = seasonOf(l);
      const [sixth, short] = standardRoster(l, U);
      line(sixth, 55, 0, 25);
      line(short, 45, 0, 30);
      const race = awardRaces(l);
      expect(race.smoy[0].c.p.pid).toBe(sixth.pid);
      expect(race.mvp.some((x) => x.c.p.pid === sixth.pid)).toBe(false);
      const aw = computeRegularSeasonAwards(l);
      expect(aw.smoy).toBe(sixth.pid);
      expect(aw.mvp).toBe(race.mvp[0].c.p.pid);
      // the Coach of the Year is remembered by name, whoever coaches that team later
      const coach = aw.coy === U ? l.coachName : l.teams[aw.coy!].coach.name;
      l.teams[aw.coy!].coach.name = 'Someone Else';
      expect(l.awards.find((a) => a.season === l.season)!.coyCoach).toBe(coach);
    }

    // All-Stars come four guards and six frontcourt players at least, plus two wild cards
    {
      const l = league();
      const line = seasonOf(l);
      for (const p of Object.values(l.players)) p.injury = null;
      // the East's guards have the best seasons by far
      const east = Object.values(l.players).filter((p) => p.tid >= 0 && l.teams[p.tid].conf === 'E');
      for (const p of east) if (p.pos === 'PG' || p.pos === 'SG') line(p, 70, 70, 35);
      const as = selectAllStars(l);
      const guards = as.E.filter((pid) => ['PG', 'SG'].includes(l.players[pid].pos)).length;
      expect(as.E.length).toBe(12);
      expect(guards).toBeGreaterThanOrEqual(4);
      expect(guards).toBeLessThanOrEqual(6);
    }

    // All-Rookie has a 1st and a 2nd team
    {
      const l = league();
      seasonOf(l);
      const aw = computeRegularSeasonAwards(l);
      expect(aw.allRookie.length).toBe(10);
      expect(new Set(aw.allRookie).size).toBe(10);
      expect(l.players[aw.allRookie[0]].awards.some((a) => a.type === 'All-Rookie 1st Team')).toBe(true);
      expect(l.players[aw.allRookie[9]].awards.some((a) => a.type === 'All-Rookie 2nd Team')).toBe(true);
    }

    // an injured All-Star keeps the honor and gets a replacement from his conference
    {
      const l = league();
      const line = seasonOf(l);
      const star = Object.values(l.players).find((p) => p.tid >= 0 && l.teams[p.tid].conf === 'E')!;
      line(star, 70, 70, 40);
      for (const p of Object.values(l.players)) p.injury = null;
      star.injury = { type: 'Sprained Ankle', gamesRemaining: 5, gamesTotal: 6, severity: 'minor' };
      const as = selectAllStars(l);
      expect(as.E).toContain(star.pid);
      expect(as.E.length).toBe(13);
      expect(as.W.length).toBe(12);
      const sub = l.players[as.E[12]];
      expect(sub.injury).toBeNull();
      expect(l.teams[sub.tid].conf).toBe('E');
      expect(l.news.some((n) => n.text.includes(`replaces the injured ${star.firstName} ${star.lastName}`))).toBe(true);
    }

    // award mail reads as one sentence: Coach of the Year alone, three All-Stars
    {
      const l = league();
      const line = seasonOf(l);
      for (const p of Object.values(l.players)) p.injury = null;
      // the user's team wins big with nobody playing enough to win anything
      [curTeamSeason(l, U).won, curTeamSeason(l, U).lost] = [70, 12];
      for (const p of teamPlayers(l, U)) line(p, 10, 0, 6);
      expect(computeRegularSeasonAwards(l).coy).toBe(U);
      expect(l.inbox[0].body).toBe('Your team collected hardware: Coach of the Year (you).');
      const news = l.news[l.news.length - 1];
      expect(news.text).toContain(`COY ${l.coachName} (${l.teams[U].abbrev}).`);
      expect(news.tids).toContain(U);
      // three of the user's players have All-Star seasons
      const stars = standardRoster(l, U).slice(0, 3);
      for (const p of stars) line(p, 70, 70, 40);
      const as = selectAllStars(l);
      const names = [...as.E, ...as.W].filter((pid) => l.players[pid].tid === U).map((pid) => `${l.players[pid].firstName} ${l.players[pid].lastName}`);
      expect(names).toHaveLength(3);
      expect(l.inbox[0].body).toBe(`${names[0]}, ${names[1]} and ${names[2]} made the All-Star team.`);
    }

    // a star already out when the coaches voted is passed over; one hurt since is picked and replaced
    {
      const l = league();
      const line = seasonOf(l);
      const [out, since] = Object.values(l.players).filter((p) => p.tid >= 0 && l.teams[p.tid].conf === 'E');
      line(out, 70, 70, 40);
      line(since, 70, 70, 40);
      for (const p of Object.values(l.players)) p.injury = null;
      // a month into a torn meniscus, three weeks still to go
      out.injury = { type: 'Torn Meniscus', gamesRemaining: 12, gamesTotal: 30, severity: 'major' };
      // a broken hand in the last game before the break
      since.injury = { type: 'Broken Hand', gamesRemaining: 20, gamesTotal: 20, severity: 'moderate' };
      const as = selectAllStars(l);
      expect(as.E).not.toContain(out.pid);
      expect(as.E.slice(0, 12)).toContain(since.pid);
      expect(as.E.length).toBe(13);
      const news = l.news.find((n) => n.text.startsWith('All-Star replacements'))!.text;
      expect(news).toContain(`replaces the injured ${since.firstName} ${since.lastName}`);
      expect(news).not.toContain(out.lastName);
    }

    // a knock the All-Star break heals costs nobody his place
    {
      const l = league();
      const line = seasonOf(l);
      const star = Object.values(l.players).find((p) => p.tid >= 0 && l.teams[p.tid].conf === 'E')!;
      line(star, 70, 70, 40);
      for (const p of Object.values(l.players)) p.injury = null;
      star.injury = { type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 2, severity: 'minor' };
      const as = selectAllStars(l);
      expect(as.E).toContain(star.pid);
      expect(as.E.length).toBe(12);
      expect(l.news.some((n) => n.text.startsWith('All-Star replacements'))).toBe(false);
    }

    // Most Improved needs last season's numbers: nobody wins it in a fictional league's first season
    {
      const l = createLeague({ name: 'f', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
      const line = seasonOf(l);
      const aw = computeRegularSeasonAwards(l);
      expect(aw.mip).toBeUndefined();
      expect(aw.mvp).toBeDefined();
      expect(Object.values(l.players).some((p) => p.awards.some((a) => a.type === 'Most Improved Player'))).toBe(false);
      // a breakout from a real baseline wins it
      const p = standardRoster(l, U).find((x) => x.draft.year !== l.season - 1)!;
      Object.assign(statsLine(p, l.season - 1, U, false), { gp: 60, min: 60 * 20, pts: 60 * 8, fgm: 60 * 3, fga: 60 * 7 });
      line(p, 70, 70, 20);
      expect(computeRegularSeasonAwards(l).mip).toBe(p.pid);
    }

    // MVP needs 65 games and 20 minutes; Rookie of the Year goes to a rookie (L19)
    {
      const l = league();
      const line = seasonOf(l);
      const [short, full] = standardRoster(l, U).filter((p) => p.draft.year !== l.season - 1);
      line(short, 64, 64, 40);
      line(full, 65, 65, 30);
      const vet = standardRoster(l, aiTeam(l)).find((p) => p.draft.year !== l.season - 1)!;
      line(vet, 70, 0, 28);
      vet.experience = 0;
      const aw = computeRegularSeasonAwards(l);
      expect(aw.mvp).toBe(full.pid);
      expect(l.players[aw.roy!].draft.year).toBe(l.season - 1);
      expect(aw.allNba.flat()).not.toContain(short.pid);
    }

    // the break heals a knock short enough to keep an All-Star his place, for everyone; a longer injury still counts games
    {
      const l = testLeague('all-star-knock');
      // (the break moved up: 15 games in, enough for All-Star candidates)
      while (l.day < 32) simDay(l);
      l.allStarDay = l.day;
      // (the break moved onto a game day: a longer injury on a team that plays still heals a game, so it's one that doesn't)
      const playing = new Set(l.schedule.filter((g) => g.day === l.day).flatMap((g) => [g.home, g.away]));
      const pool = Object.values(l.players).filter((p) => p.tid >= 0 && !p.injury && !playing.has(p.tid));
      const knocked = pool.slice(0, 5);
      for (const p of knocked) p.injury = { type: 'Sprained Ankle', gamesRemaining: 2, gamesTotal: 2, severity: 'minor' };
      const longer = pool[5];
      longer.injury = { type: 'Hamstring Strain', gamesRemaining: 6, gamesTotal: 8, severity: 'moderate' };
      simDay(l);
      for (const p of knocked) expect(p.injury, p.lastName).toBeNull();
      // a longer injury still counts games
      expect(longer.injury?.gamesRemaining).toBe(6);
      const aw = l.awards.find((a) => a.season === l.season)!;
      expect(aw.allStarMvp).toBeDefined();
    }
  }, 180_000);
});

describe('injuries, wear and development', () => {
  it('healing, lasting damage, wear, injury names, staff-run rotations and playbooks, and in-season growth (bug 15; L14, L17)', () => {
    // free agents heal during the season (bug 15)
    {
      const l = league();
      expect(startRegularSeason(l)).toEqual([]);
      const fa = freeAgents(l).sort((x, y) => valueScore(l, x) - valueScore(l, y))[0];
      fa.injury = { type: 'Torn ACL', gamesRemaining: 40, gamesTotal: 40, severity: 'severe' };
      for (let d = 0; d < 10; d++) simDay(l);
      expect(fa.injury?.gamesRemaining ?? 0).toBeLessThanOrEqual(36);
    }

    // an assistant-run rotation takes a player back the day he's cleared, not at the next game
    {
      const l = league();
      expect(startRegularSeason(l)).toEqual([]);
      const star = teamPlayers(l, U).sort((a, b) => b.ovr - a.ovr)[0];
      star.injury = { type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 3, severity: 'minor' };
      // his team's next game sits him and clears him
      for (let d = 0; d < 10 && star.injury; d++) simDay(l);
      expect(star.injury).toBeNull();
      const rot = l.teams[U].rotation;
      expect(rot.manual).toBe(false);
      expect(rot.minutes[star.pid]).toBeGreaterThan(30);
      expect(rot.order.slice(0, 5)).toContain(star.pid);
    }

    // lasting injury damage shows in his OVR at once
    {
      const l = fictional(11);
      const rng = new Rng(5);
      let hit = false;
      for (const p of Object.values(l.players).filter((x) => x.tid >= 0)) {
        const before = { ...p.ratings };
        applyInjury(l, p, rng);
        if (p.ratings.spd < before.spd) {
          hit = true;
          expect(p.ovr).toBe(toDisplay(ovrRaw(p.ratings), l.ovrScale));
        }
        p.injury = null;
      }
      expect(hit).toBe(true);
      // a ruptured Achilles costs at most 95 games, even an injury-prone 33-year-old's on the leanest medical budget
      const old = Object.values(l.players).find((x) => x.tid >= 0)!;
      old.bornYear = l.season - 33;
      old.injuryProne = 1;
      l.teams[old.tid].budget.health = 1;
      const rolls = Array.from({ length: 4000 }, () => rollInjury(l, old, rng));
      const achilles = rolls.filter((x) => x.type === 'Ruptured Achilles');
      expect(achilles.length).toBeGreaterThan(0);
      expect(Math.max(...achilles.map((x) => x.gamesTotal))).toBeLessThanOrEqual(95);
    }

    // in-season development counts this season's minutes, not last season's (L14)
    {
      const base = league();
      base.phase = 'regular';
      const young = standardRoster(base, U).find((p) => playerAge(p, base.season) <= 23)!;
      const grow = (mpg: number) => {
        const l = structuredClone(base);
        const p = l.players[young.pid];
        Object.assign(statsLine(p, l.season, U, false), { gp: 20, min: 20 * mpg });
        inSeasonProgression(l, new Rng(5));
        return RATING_KEYS.reduce((a, k) => a + p.ratings[k], 0);
      };
      expect(grow(32)).toBeGreaterThan(grow(3));
    }

    // injury names read as English in messages (L17)
    expect(injuryText('Torn ACL', true)).toBe('a torn ACL');
    expect(injuryText('MCL Sprain', true)).toBe('an MCL sprain');
    expect(injuryText('Back Spasms', true)).toBe('back spasms');
    expect(injuryText('Plantar Fasciitis', true)).toBe('plantar fasciitis');
    expect(injuryText('Ruptured Achilles')).toBe('ruptured Achilles');

    // an assistant-run playbook follows long injuries; the user's own tactics stay put
    {
      const l = league();
      l.teams[U].tactics.manual = true;
      const mine = structuredClone(l.teams[U].tactics);
      const before = l.teams.map((t) => t.tactics.offPreset + t.tactics.defPreset);
      // every team loses its four best players for a month
      for (const t of l.teams)
        for (const p of teamPlayers(l, t.tid)
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, 4))
          p.injury = { type: 'Calf Strain', gamesRemaining: 30, gamesTotal: 30, severity: 'moderate' };
      for (const t of l.teams) ensureRotation(l, t.tid);
      for (const t of l.teams.filter((x) => x.tid !== U)) {
        const best = rankedPresets(t, teamPlayers(l, t.tid));
        expect([t.tactics.offPreset, t.tactics.defPreset]).toEqual([best.off[0], best.def[0]]);
      }
      expect(l.teams.some((t, i) => t.tid !== U && t.tactics.offPreset + t.tactics.defPreset !== before[i])).toBe(true);
      expect(l.teams[U].tactics).toEqual(mine);
    }

    // worn-down players carry extra injury risk
    {
      const p = standardRoster(league(), U)[0];
      p.wear = 30;
      expect(wearInjuryRisk(p)).toBe(0);
      p.wear = 70;
      expect(wearInjuryRisk(p)).toBeCloseTo(0.3);
      p.wear = 100;
      expect(wearInjuryRisk(p)).toBeCloseTo(0.6);
    }
  }, 180_000);
});
