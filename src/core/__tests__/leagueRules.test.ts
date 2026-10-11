// Regression tests for league rules: trades, rosters, experience, clinching, options, signing
// windows, draft order, two-way contracts, phase guards and tiebreaks. Fast: no full-season sims.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { CAP_FOR, curTeamSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers, winPct } from '../league/helpers';
import { askingContract, convertTwoWay, decideTeamOption, pendingOption, releasePlayer, signPlayer, twoWaySalary, valueScore } from '../league/contracts';
import { expiringPlayers, signingClosedReason, userOffer, userTwoWayOffer } from '../league/freeAgency';
import { validateTrade } from '../league/trades';
import { finalsHomeCourt, standings } from '../league/standings';
import { runLottery } from '../league/draft';
import { contractExp, salaryFor } from '../playerGen';
import { CAP } from '../constants';
import { Rng } from '../random';
import type { League, Player } from '../types';
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
    const two = standardRoster(l, U).slice(0, 2).map((p) => p.pid);
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
      [60, 14, 8], [58, 16, 8], [56, 18, 8], [54, 20, 8], [52, 22, 8],
      [44, 30, 8], // 6th: the 7th place team can't catch him, but the 9th can
      [42, 40, 0], [38, 40, 4], [30, 32, 20], [20, 60, 2],
      [19, 61, 2], [14, 46, 22], // 12th can still reach the 9th's 30 wins
      [13, 67, 2], [12, 68, 2], [11, 69, 2],
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
    // at 15 standard players he can't be converted; with a spot open he takes the minimum
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
  const eastOrder = (l: League) => standings(l).filter((r) => r.conf === 'E').map((r) => r.tid);

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
