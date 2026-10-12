// Regression tests for league rules: trades, rosters, experience, clinching, options, signing
// windows, draft order, two-way contracts, phase guards, tiebreaks, the playoff calendar, awards,
// the owner, morale and wear. Fast: no full-season sims.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { advanceDay, faAdvance, faDayNumber, faOver, finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { CAP_FOR, curTeamSeason, dayToDate, freeAgents, payroll, standardRoster, statsLine, teamPlayers, winPct, withRng } from '../league/helpers';
import { askingContract, convertTwoWay, decideTeamOption, pendingOption, releasePlayer, signPlayer, twoWaySalary, valueScore } from '../league/contracts';
import { expiringPlayers, signingClosedReason, userOffer, userTwoWayOffer } from '../league/freeAgency';
import { validateTrade } from '../league/trades';
import { buildSimInput, ensureRotation, wearInjuryRisk } from '../league/games';
import { rankedPresets } from '../ai/coachAI';
import { finalsHomeCourt, standings } from '../league/standings';
import { champion, playInDone, processPlayInResult, processPlayoffResult, schedulePlayoffDay, startPlayIn, startPlayoffs } from '../league/playoffs';
import { awardRaces, computeRegularSeasonAwards, selectAllStars } from '../league/awards';
import { ownerEvaluation, takeOverTeam } from '../league/owner';
import { inSeasonProgression } from '../league/progression';
import { injuryText } from '../league/injuries';
import { updateMorale } from '../league/morale';
import { generateDraftClass, lotteryOdds, runLottery } from '../league/draft';
import { RATING_KEYS } from '../ratings';
import { contractExp, playerAge, salaryFor } from '../playerGen';
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

const aiTeam = (l: League) => l.teams.find((t) => t.tid !== l.userTid)!.tid;

describe('trades', () => {
  it('expiring contracts cannot be traded after the season (bug 1)', () => {
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
  });

  it('roster limits: 13-man floor in season, 15 only binds teams adding bodies, 21 in the offseason (bug 2)', () => {
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
  });

  it('AI teams are trimmed to 15 before opening night, keeping big contracts (bugs 2, 7)', () => {
    const l = league();
    const ai = aiTeam(l);
    for (const p of freeAgents(l).slice(0, 3)) signPlayer(l, p, ai, CAP.minContract, 1, { news: false });
    const big = standardRoster(l, ai).sort((a, b) => salaryFor(b, l.season) - salaryFor(a, l.season))[0];
    big.ovr = 40; // worst player on the team, but owed a fortune
    expect(standardRoster(l, ai).length).toBeGreaterThan(CAP.rosterMax);
    expect(startRegularSeason(l)).toEqual([]);
    for (const t of l.teams) expect(standardRoster(l, t.tid).length).toBeLessThanOrEqual(CAP.rosterMax);
    expect(big.tid).toBe(ai);
  });
});

describe('simulation targets (bug 4)', () => {
  it('stops on deadline day (trades still open) and the day before the All-Star Game', async () => {
    const { vi } = await import('vitest');
    vi.doMock('../../state/persistence', () => ({ saveLeague: async () => {}, setLastLeagueId: () => {} }));
    const { useStore } = await import('../../state/store');
    const { flowActions } = await import('../../ui/flow');
    const l = league();
    expect(startRegularSeason(l)).toEqual([]);
    useStore.setState({ league: l });
    l.day = l.tradeDeadlineDay - 3;
    await useStore.getState().simulate({ kind: 'deadline' });
    expect(l.day).toBe(l.tradeDeadlineDay);
    expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: aiTeam(l), pids: [], dpids: [] } }).some((e) => e.includes('deadline'))).toBe(false);
    expect(flowActions(l).some((a) => a.id === 'deadline')).toBe(false);
    l.day = l.allStarDay - 4;
    await useStore.getState().simulate({ kind: 'allStar' });
    expect(l.day).toBe(l.allStarDay - 1);
    expect(l.awards.find((a) => a.season === l.season)?.allStarMvp).toBeUndefined();
    expect(flowActions(l).some((a) => a.id === 'allstar')).toBe(false);
  });
});

describe('offseason', () => {
  it('experience only grows for players who played that season; draftees start at 0 (bug 5)', () => {
    const l = league();
    const [played, idle] = standardRoster(l, U);
    const fa = freeAgents(l)[0];
    statsLine(played, l.season, U, false).gp = 40;
    statsLine(fa, l.season, U, false).gp = 12; // played, then waived: still a season
    const rookie = Object.values(l.players).find((p) => p.tid === -2)!;
    rookie.tid = U;
    rookie.draft = { year: l.season, round: 1, pick: 5, tid: U };
    rookie.contract = { start: l.season + 1, salaries: [8_000, 8_400, 8_800, 9_200], rookie: true, option: 'team' };
    const before = { played: played.experience, idle: idle.experience, fa: fa.experience, rookie: rookie.experience };
    l.phase = 'freeAgency';
    expect(newSeason(l)).toBe(true);
    expect(played.experience).toBe(before.played + 1);
    expect(idle.experience).toBe(before.idle);
    expect(fa.experience).toBe(before.fa + 1);
    expect(rookie.experience).toBe(0);
  });

  it('second round goes by record across all 30 teams (bug 13)', () => {
    const l = league();
    const rng = new Rng(3);
    l.teams.forEach((t, i) => {
      const ts = curTeamSeason(l, t.tid);
      ts.won = 20 + ((i * 7) % 30) + (i % 3);
      ts.lost = 82 - ts.won;
      // conference imbalance: some playoff teams have worse records than lottery teams
      ts.playoffRound = i % 2 === 0 ? 1 : -1;
    });
    l.phase = 'draftLottery';
    runLottery(l, rng);
    const r2 = l.draftPicks.filter((d) => d.season === l.season && d.round === 2).sort((a, b) => a.pick! - b.pick!);
    expect(r2.length).toBe(30);
    const pct = r2.map((d) => winPct(curTeamSeason(l, d.originalTid)));
    for (let i = 1; i < pct.length; i++) expect(pct[i]).toBeGreaterThanOrEqual(pct[i - 1]);
  });

  it('teams tied for lottery places split their chances', () => {
    const l = league();
    // two worst teams level at 15 wins, three more level at 20, the rest apart; the top 16 in the playoffs
    const wins = [15, 15, 20, 20, 20, ...Array.from({ length: 25 }, (_, i) => 22 + i)];
    l.teams.forEach((t, i) => {
      const ts = curTeamSeason(l, t.tid);
      ts.won = wins[i];
      ts.lost = 82 - wins[i];
      ts.playoffRound = i >= 14 ? 1 : -1;
    });
    const odds = new Map(lotteryOdds(l).map((x) => [x.tid, x.w]));
    expect(odds.get(0)).toBe(140);
    expect(odds.get(1)).toBe(140);
    for (const tid of [2, 3, 4]) expect(odds.get(tid)).toBeCloseTo((140 + 125 + 105) / 3);
    expect(odds.get(5)).toBe(90);
    expect([...odds.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1000);
  });

  it('a new arrival whose number is taken picks a free one; nobody joins sharing a name', () => {
    const l = league();
    const tid = aiTeam(l);
    const [vet] = teamPlayers(l, tid);
    const newcomer = teamPlayers(l, tid === 5 ? 6 : 5)[0];
    const number = vet.jersey;
    newcomer.jersey = number;
    // as a trade or signing brings him in: on the team and in its rotation order
    newcomer.tid = tid;
    l.teams[tid].rotation.order.push(newcomer.pid);
    ensureRotation(l, tid);
    const numbers = teamPlayers(l, tid).map((p) => p.jersey);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(vet.jersey).toBe(number);
    expect(newcomer.jersey).not.toBe(number);
    withRng(l, (rng) => generateDraftClass(l, l.season + 1, rng));
    const names = Object.values(l.players).map((p) => `${p.firstName} ${p.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('contract options: opt-outs, AI and user team options (bug 10)', () => {
    const l = league();
    const ai = aiTeam(l);
    const [a1, a2] = standardRoster(l, ai).sort((x, y) => y.ovr - x.ovr);
    const [weak, a3] = standardRoster(l, ai).sort((x, y) => x.ovr - y.ovr);
    const [u1, u2] = standardRoster(l, U).sort((x, y) => y.ovr - x.ovr);
    const cap = CAP_FOR(l, l.season + 1);
    const opt = (p: Player, kind: 'player' | 'team', next: number) => (p.contract = { start: l.season, salaries: [next, next], option: kind });
    opt(a1, 'player', cap.minContract); // underpaid star: opts out
    opt(weak, 'player', cap.maxContract(10)); // overpaid: opts in
    opt(a2, 'team', cap.minContract); // bargain: exercised
    opt(a3, 'team', cap.maxContract(10)); // overpaid: declined
    opt(u1, 'team', cap.minContract);
    opt(u2, 'team', cap.minContract);
    l.phase = 'draftLottery';
    runLottery(l, new Rng(2));
    expect(startDraft(l)).toBe(true);
    expect(finishDraftPhase(l)).toBe(true);
    expect(contractExp(a1.contract)).toBe(l.season);
    expect(expiringPlayers(l, ai)).toContain(a1);
    expect(contractExp(weak.contract)).toBe(l.season + 1);
    expect(weak.contract.option).toBeUndefined();
    expect(contractExp(a2.contract)).toBe(l.season + 1);
    expect(contractExp(a3.contract)).toBe(l.season);
    // the user's team options wait for his call
    expect(pendingOption(l, u1)).toBe('team');
    expect(decideTeamOption(l, u2.pid, false).ok).toBe(true);
    expect(expiringPlayers(l, U)).toContain(u2);
    // left open: the staff exercises the bargain when free agency opens
    expect(startFreeAgency(l)).toBe(true);
    expect(pendingOption(l, u1)).toBeNull();
    expect(u1.tid).toBe(U);
    expect(contractExp(u1.contract)).toBe(l.season + 1);
  });

  it('phase changes are no-ops outside their phase (bug 11)', () => {
    const l = league();
    const season = l.season;
    expect(newSeason(l)).toBe(false);
    expect(startDraft(l)).toBe(false);
    expect(finishDraftPhase(l)).toBe(false);
    expect(startFreeAgency(l)).toBe(false);
    expect(startRegularSeason(l)).toEqual([]);
    expect(startRegularSeason(l).length).toBe(1);
    expect(l.season).toBe(season);
    expect(l.phase).toBe('regular');
  });
});

describe('clinching (bug 6)', () => {
  it('needs every team below the cut out of reach, not just the next one', () => {
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
  });

  it('marks every seed once the regular season is over, ties at the cuts included', () => {
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
  });
});

describe('standings tiebreaks (bug 14)', () => {
  it('breaks a 3-way tie on head-to-head among all tied teams', () => {
    const l = league();
    const east = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
    east.forEach((tid, i) => {
      const ts = curTeamSeason(l, tid);
      [ts.won, ts.lost] = i < 3 ? [40, 40] : [62 - i, 20 + i];
    });
    const [a, b, c] = east;
    const game = (w: number, lo: number) => ({ type: 'regular', season: l.season, home: { tid: w, pts: 110 }, away: { tid: lo, pts: 100 } });
    // A 2-0 vs B, B 2-0 vs C, A and C split: A .750, B .500, C .250 among the three
    l.games = [game(a, b), game(a, b), game(b, c), game(b, c), game(a, c), game(c, a)] as unknown as League['games'];
    const order = standings(l)
      .filter((r) => r.won === 40)
      .map((r) => r.tid);
    expect(order).toEqual([a, b, c]);
  });
});

describe('injuries (bug 15)', () => {
  it('free agents heal during the season', () => {
    const l = league();
    expect(startRegularSeason(l)).toEqual([]);
    const fa = freeAgents(l).sort((x, y) => valueScore(l, x) - valueScore(l, y))[0];
    fa.injury = { type: 'Torn ACL', gamesRemaining: 40, gamesTotal: 40, severity: 'severe' };
    for (let d = 0; d < 10; d++) simDay(l);
    expect(fa.injury?.gamesRemaining ?? 0).toBeLessThanOrEqual(36);
  });
});

describe('signing window (bug 12) and two-way contracts', () => {
  it('free agents can be signed in the preseason, regular season and free agency only', () => {
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
  });

  it('two-way players sit outside the 15, the cap and the trade roster count', () => {
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
  });
});

describe('standings tiebreaks: NBA procedure (L5, L18)', () => {
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
  const game = (l: League, w: number, lo: number) => ({ type: 'regular', season: l.season, home: { tid: w, pts: 110 }, away: { tid: lo, pts: 100 } });
  const eastOrder = (l: League) =>
    standings(l)
      .filter((r) => r.conf === 'E')
      .map((r) => r.tid);

  it('3+ tied teams: division leader before head-to-head; the rest restart as a two-team tie', () => {
    const { l, A, B, C } = tied();
    // A lost all four to B and C; C won the B-C season series
    l.games = [game(l, B, A), game(l, B, A), game(l, C, A), game(l, C, A), game(l, C, B), game(l, C, B)] as unknown as League['games'];
    expect(eastOrder(l).filter((tid) => [A, B, C].includes(tid))).toEqual([A, C, B]);
  });

  it('2 tied teams: head-to-head before division leader', () => {
    const { l, A, B, C } = tied();
    curTeamSeason(l, C).won = 49;
    curTeamSeason(l, C).lost = 33;
    l.games = [game(l, B, A), game(l, B, A)] as unknown as League['games'];
    expect(eastOrder(l).filter((tid) => tid === A || tid === B)).toEqual([B, A]);
  });

  it('a tie nothing breaks goes to a fixed drawing, not the lowest team id', () => {
    const l = league();
    for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [41, 41];
    l.games = [];
    const order = eastOrder(l);
    expect(eastOrder(l)).toEqual(order);
    expect(order).not.toEqual([...order].sort((a, b) => a - b));
  });

  it('Finals home court between equal records goes by head-to-head, not to the East', () => {
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
  });
});

describe('play-in and playoff bracket (L19)', () => {
  /** Win the next game of a series for `winner`, through the scheduled game. */
  function win(l: League, id: string, winner: number) {
    schedulePlayoffDay(l);
    const g = l.schedule.find((x) => x.seriesId === id && !x.played)!;
    g.played = true;
    processPlayoffResult(l, g, g.home === winner);
  }

  it('seeds 1-6, plays 7v8 and 9v10, then the last spot, and pairs 1-8, 4-5, 3-6, 2-7 with higher seeds first', () => {
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
  });
});

describe('playoff calendar (L10)', () => {
  it('series play every other day with two days off between rounds', () => {
    const l = league();
    const [a, b, c, d] = l.teams.filter((t) => t.conf === 'E').map((t) => t.tid);
    l.phase = 'playoffs';
    l.schedule = [];
    l.day = 100;
    const series = (id: string, round: number, high: number, low: number): PlayoffSeries => ({ id, round, conf: 'E', high, low, highSeed: 1, lowSeed: 8, highWins: 0, lowWins: 0 });
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
  });

  it("the next game, and the next round's opener, are on the calendar as soon as a result is in", () => {
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
  });

  it('wear recovers on postseason days too', () => {
    const l = league();
    l.phase = 'playoffs';
    l.playoffs = [];
    l.schedule = [];
    const p = standardRoster(l, U)[0];
    p.wear = 40;
    advanceDay(l);
    expect(p.wear).toBeCloseTo(39.25);
  });
});

describe('awards (L13, L18)', () => {
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

  it('Sixth Man needs more games off the bench than as a starter (half and half is out)', () => {
    const l = league();
    const line = seasonOf(l);
    const [half, bench] = standardRoster(l, U);
    line(half, 70, 35, 30);
    line(bench, 70, 34, 25);
    expect(computeRegularSeasonAwards(l).smoy).toBe(bench.pid);
  });

  it("Sixth Man isn't held to the 65-game rule (50 games do), and the race shows what the vote will do", () => {
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
  });

  it('All-Stars come four guards and six frontcourt players at least, plus two wild cards', () => {
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
  });

  it('All-Rookie has a 1st and a 2nd team', () => {
    const l = league();
    seasonOf(l);
    const aw = computeRegularSeasonAwards(l);
    expect(aw.allRookie.length).toBe(10);
    expect(new Set(aw.allRookie).size).toBe(10);
    expect(l.players[aw.allRookie[0]].awards.some((a) => a.type === 'All-Rookie 1st Team')).toBe(true);
    expect(l.players[aw.allRookie[9]].awards.some((a) => a.type === 'All-Rookie 2nd Team')).toBe(true);
  });

  it('an injured All-Star keeps the honor and gets a replacement from his conference', () => {
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
  });

  it('award mail reads as one sentence: Coach of the Year alone, three All-Stars', () => {
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
    expect(news.tids).toEqual([U]);
    // three of the user's players have All-Star seasons
    const stars = standardRoster(l, U).slice(0, 3);
    for (const p of stars) line(p, 70, 70, 40);
    const as = selectAllStars(l);
    const names = [...as.E, ...as.W].filter((pid) => l.players[pid].tid === U).map((pid) => `${l.players[pid].firstName} ${l.players[pid].lastName}`);
    expect(names).toHaveLength(3);
    expect(l.inbox[0].body).toBe(`${names[0]}, ${names[1]} and ${names[2]} made the All-Star team.`);
  });

  it('a knock the All-Star break heals costs nobody his place', () => {
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
  });

  it("Most Improved needs last season's numbers: nobody wins it in a fictional league's first season", () => {
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
  });

  it('MVP needs 65 games and 20 minutes; Rookie of the Year goes to a rookie (L19)', () => {
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
  });
});

describe('free agency calendar (UI2-22)', () => {
  it('advancing past day 30 stops on day 30', () => {
    const l = league();
    l.phase = 'freeAgency';
    l.faDay = 26;
    faAdvance(l, 7);
    expect(faDayNumber(l)).toBe(30);
    expect(faOver(l)).toBe(true);
    // the last day is the last: nothing left to advance
    const day = l.day;
    faAdvance(l, 1);
    expect(l.day).toBe(day);
    expect(faDayNumber(l)).toBe(30);
  });

  it('the summer has dates: draft night in late June, free agency from June 30, a day per free-agency day', () => {
    const l = league();
    l.phase = 'draftLottery';
    l.day = 238; // Finals night, mid-June
    runLottery(l, new Rng(2));
    expect(startDraft(l)).toBe(true);
    const md = () => [dayToDate(l.season, l.day).getUTCMonth(), dayToDate(l.season, l.day).getUTCDate()];
    expect(md()).toEqual([5, 25]);
    expect(l.news[l.news.length - 1].day).toBe(l.day);
    expect(finishDraftPhase(l)).toBe(true);
    expect(startFreeAgency(l)).toBe(true);
    expect(md()).toEqual([5, 30]);
    faAdvance(l, 3);
    expect(md()).toEqual([6, 3]);
    expect(l.inbox[0].day).toBeLessThanOrEqual(l.day);
  });
});

describe('owner (L11, L19)', () => {
  it('fires after the grace period for a bad record, never during it or with job security off', () => {
    const l = league();
    const ts = curTeamSeason(l, U);
    [ts.won, ts.lost, ts.playoffRound] = [15, 67, -1];
    const review = (tenureStart: number, jobSecurity: boolean) => {
      l.ownerMood = { wins: -0.8, playoffs: -0.25, money: 0, total: -0.6 };
      l.tenureStart = tenureStart;
      l.settings.jobSecurity = jobSecurity;
      ownerEvaluation(l);
    };
    review(l.season - 1, true);
    expect(l.fired).toBeFalsy();
    review(l.season - 3, false);
    expect(l.fired).toBeFalsy();
    review(l.season - 3, true);
    expect(l.fired).toBe(true);
    expect(l.inbox[0].subject).toBe("You're fired");
  });

  it('a fired coach is not reviewed again; taking over a team clears the old plan and board', () => {
    const l = league();
    l.fired = true;
    const mood = { ...l.ownerMood };
    const inbox = l.inbox.length;
    ownerEvaluation(l);
    expect(l.ownerMood).toEqual(mood);
    expect(l.inbox.length).toBe(inbox);
    l.gamePlan = { oppTid: 3, items: [] };
    l.draftBoard = [1, 2, 3];
    takeOverTeam(l, aiTeam(l));
    expect(l.fired).toBe(false);
    expect(l.gamePlan).toBeNull();
    expect(l.draftBoard).toBeUndefined();
  });
});

describe('development (L14)', () => {
  it("in-season development counts this season's minutes, not last season's", () => {
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
  });
});

describe('morale and wear (L17)', () => {
  it('a player who asked out weighs on his teammates', () => {
    const l = league();
    const [star, mate] = standardRoster(l, U);
    for (const p of teamPlayers(l, U)) p.mood = { ...p.mood, score: 0, tradeRequest: false };
    const before = buildSimInput(l, U, 0, 'regular').perf!;
    star.mood.tradeRequest = true;
    const after = buildSimInput(l, U, 0, 'regular').perf!;
    expect(after[mate.pid]).toBeCloseTo(before[mate.pid] * 0.994);
    expect(after[star.pid]).toBeCloseTo(before[star.pid]);
  });

  it('a rookie-scale deal never leaves a player feeling underpaid; a cheap veteran deal does', () => {
    const l = league();
    const star = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr)[0];
    star.contract = { start: l.season, salaries: [CAP.minContract, CAP.minContract], rookie: true, option: 'team' };
    updateMorale(l, U);
    expect(star.mood.notes).not.toContain('Feels underpaid');
    expect(star.mood.contractComponent).toBe(0);
    delete star.contract.rookie;
    updateMorale(l, U);
    expect(star.mood.notes).toContain('Feels underpaid');
  });

  it('injury names read as English in messages', () => {
    expect(injuryText('Torn ACL', true)).toBe('a torn ACL');
    expect(injuryText('MCL Sprain', true)).toBe('an MCL sprain');
    expect(injuryText('Back Spasms', true)).toBe('back spasms');
    expect(injuryText('Plantar Fasciitis', true)).toBe('plantar fasciitis');
    expect(injuryText('Ruptured Achilles')).toBe('ruptured Achilles');
  });

  it("an assistant-run playbook follows long injuries; the user's own tactics stay put", () => {
    const l = league();
    l.teams[U].tactics.manual = true;
    const mine = structuredClone(l.teams[U].tactics);
    const before = l.teams.map((t) => t.tactics.offPreset + t.tactics.defPreset);
    // every team loses its two best players for a month
    for (const t of l.teams)
      for (const p of teamPlayers(l, t.tid)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 2))
        p.injury = { type: 'Calf Strain', gamesRemaining: 30, gamesTotal: 30, severity: 'moderate' };
    for (const t of l.teams) ensureRotation(l, t.tid);
    for (const t of l.teams.filter((x) => x.tid !== U)) {
      const best = rankedPresets(t, teamPlayers(l, t.tid));
      expect([t.tactics.offPreset, t.tactics.defPreset]).toEqual([best.off[0], best.def[0]]);
    }
    expect(l.teams.some((t, i) => t.tid !== U && t.tactics.offPreset + t.tactics.defPreset !== before[i])).toBe(true);
    expect(l.teams[U].tactics).toEqual(mine);
  });

  it('worn-down players carry extra injury risk', () => {
    const p = standardRoster(league(), U)[0];
    p.wear = 30;
    expect(wearInjuryRisk(p)).toBe(0);
    p.wear = 70;
    expect(wearInjuryRisk(p)).toBeCloseTo(0.3);
    p.wear = 100;
    expect(wearInjuryRisk(p)).toBeCloseTo(0.6);
  });

  it('trade requests that still apply survive the summer', () => {
    const l = league();
    const [angry, calmer] = standardRoster(l, U);
    const fa = freeAgents(l)[0];
    for (const [p, score] of [
      [angry, -8],
      [calmer, -3],
      [fa, -8],
    ] as const)
      p.mood = { ...p.mood, score, tradeRequest: true };
    l.phase = 'freeAgency';
    l.faDay = 30;
    expect(newSeason(l)).toBe(true);
    expect(angry.mood.tradeRequest).toBe(angry.tid === U);
    expect(calmer.mood.tradeRequest).toBe(false);
    expect(fa.mood.tradeRequest).toBe(false);
  });
});
