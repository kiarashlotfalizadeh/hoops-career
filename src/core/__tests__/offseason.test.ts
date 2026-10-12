import { anchorRatings, ratingMeans } from '../league/progression';
import { RATING_KEYS } from '../ratings';
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { autoDraftUserPick, canStartRegularSeason, finishDraftPhase, startDraft, userDraftPick } from '../league/season';
import { draftOrder, nextPick, runLottery } from '../league/draft';
import { FIRED_REASON, askingContract, marketSalary } from '../league/contracts';
import { faDay } from '../league/freeAgency';
import { freeAgents, CAP_FOR, contractSeason, curTeamSeason, standardRoster } from '../league/helpers';
import { takeOverTeam } from '../league/owner';
import { Rng } from '../random';

describe('offseason regressions', () => {
  it('auto-pick drafts only the current user pick', () => {
    const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
    league.phase = 'draftLottery';
    runLottery(league, new Rng(1));
    const userPicks = draftOrder(league).filter((d) => d.tid === 5).length;
    expect(userPicks).toBe(2);
    startDraft(league);
    expect(nextPick(league)?.tid).toBe(5);
    autoDraftUserPick(league);
    // the user's second-round pick must still be waiting
    expect(draftOrder(league).filter((d) => d.tid === 5).length).toBe(1);
    expect(nextPick(league)?.tid).toBe(5);
  });

  it('refuses a pick of a player who is off the board (a double tap on consecutive picks) instead of throwing', () => {
    const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
    league.phase = 'draftLottery';
    runLottery(league, new Rng(1));
    startDraft(league);
    const first = nextPick(league)!;
    const rostered = standardRoster(league, 0)[0];
    expect(userDraftPick(league, rostered.pid)).toMatch(/no longer on the board/);
    expect(userDraftPick(league, 999_999)).toMatch(/no longer on the board/);
    expect(nextPick(league)).toBe(first);
    const pid = Object.values(league.players).find((p) => p.tid === -2)!.pid;
    expect(userDraftPick(league, pid)).toBeNull();
    // his second-round pick is up: the same tap again names a player who is already his
    expect(nextPick(league)?.tid).toBe(5);
    expect(userDraftPick(league, pid)).toMatch(/no longer on the board/);
  });

  it("a fired coach's league waits: the draft and every later step only move on once he takes over a team", () => {
    const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
    league.phase = 'draftLottery';
    runLottery(league, new Rng(1));
    league.fired = true;
    expect(startDraft(league)).toBe(false);
    expect(league.phase).toBe('draftLottery');
    league.phase = 'draft';
    expect(finishDraftPhase(league)).toBe(false);
    league.phase = 'preseason';
    expect(canStartRegularSeason(league)).toEqual([FIRED_REASON]);
    league.phase = 'draftLottery';
    takeOverTeam(league, 6);
    expect(startDraft(league)).toBe(true);
  });

  it('runs a lottery with nobody in it (every team in the playoffs) without throwing', () => {
    const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
    for (const t of league.teams) curTeamSeason(league, t.tid).playoffRound = 1;
    expect(runLottery(league, new Rng(1)).order).toEqual([]);
    expect(draftOrder(league)).toHaveLength(60);
  });

  it('free agents lower their asking price as the market dries up', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 8 });
    const fa = freeAgents(league).sort((a, b) => b.ovr - a.ovr)[0];
    const before = askingContract(league, fa).amount;
    fa.faDays = 1;
    // nobody signs him: run a day with no AI activity
    faDay(league, new Rng(2), 0);
    if (fa.tid === -1 && before > CAP_FOR(league).minContract) expect(askingContract(league, fa).amount).toBeLessThan(before);
  });

  it("offseason contracts are priced against next season's cap", () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 8 });
    const p = Object.values(league.players)
      .filter((x) => x.tid >= 0)
      .sort((a, b) => b.ovr - a.ovr)[0];
    const inSeason = marketSalary(league, p);
    league.phase = 'freeAgency';
    expect(contractSeason(league)).toBe(league.season + 1);
    expect(marketSalary(league, p)).toBeGreaterThanOrEqual(inSeason);
  });

  it('holds the league talent level steady across seasons', () => {
    const league = createLeague({ name: 'a', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 31 });
    const before = ratingMeans(league);
    // a year of runaway development everywhere
    for (const p of Object.values(league.players)) for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = Math.min(100, p.ratings[k] + 6);
    anchorRatings(league);
    const after = ratingMeans(league);
    for (const k of RATING_KEYS) expect(Math.abs((after[k] ?? 0) - (before[k] ?? 0))).toBeLessThan(0.6);
  });
});
