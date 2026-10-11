import { anchorRatings, ratingMeans } from '../league/progression';
import { RATING_KEYS } from '../ratings';
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { autoDraftUserPick, startDraft } from '../league/season';
import { draftOrder, nextPick, runLottery } from '../league/draft';
import { askingContract, marketSalary } from '../league/contracts';
import { faDay } from '../league/freeAgency';
import { freeAgents, CAP_FOR, contractSeason } from '../league/helpers';
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
