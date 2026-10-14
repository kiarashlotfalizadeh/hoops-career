// Contract bookkeeping around free agency: a player whose deal ran out leaves his trade history
// behind, and a converted two-way isn't a new signing.
// Fictional leagues with hand-shaped players keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, contractSeason, freeAgents, standardRoster, twoWayRoster } from '../league/helpers';
import { convertTwoWay, signPlayer } from '../league/contracts';
import { releaseExpiring, renouncePlayer, signedThisSummer } from '../league/freeAgency';
import { executeTrade, validateTrade } from '../league/trades';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(rngSeed = 5): League {
  return createLeague({ name: `ext${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
}

/**
 * A player in the final season of a two-year deal signed last season (next season's deal in the
 * offseason), happy, healthy, with a known value: OVR = POT and his age.
 */
function finalYear(l: League, p: Player, ovr: number, age: number, salary = 10_000): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.mood.score = 0;
  p.mood.tradeRequest = false;
  p.experience = Math.max(p.experience, 4);
  p.draft = { year: l.season - 6, round: 2, pick: 40, tid: null };
  p.contract = { start: contractSeason(l) - 1, salaries: [salary, salary] };
  return p;
}

describe('free agents leave their old team behind', () => {
  /** Team `from` traded him to team `to` this season. */
  function tradedThisSeason(l: League, p: Player, to: number) {
    const from = p.tid;
    executeTrade(l, { a: { tid: from, pids: [p.pid], dpids: [] }, b: { tid: to, pids: [], dpids: [] } });
    expect(p.tradedFrom).toEqual({ tid: from, season: l.season });
  }

  const tradeBack = (l: League, p: Player, from: number, to: number) =>
    validateTrade(l, { a: { tid: from, pids: [p.pid], dpids: [] }, b: { tid: to, pids: [], dpids: [] } }).filter((e) => /away this season/.test(e));

  it('a renounced player, signed elsewhere, can be traded back to the team that traded him away', () => {
    const l = league();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, AI)[0], 76, 27);
    tradedThisSeason(l, p, U);
    l.phase = 'resign';
    p.contract = { start: l.season - 1, salaries: [10_000, 10_000] };
    expect(renouncePlayer(l, p.pid).ok).toBe(true);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.tradedFrom).toBeUndefined();
    expect(p.tradeLock).toBeUndefined();
    // a free agent like any other: an asking price and the price-cut clock
    expect(p.asking?.amount).toBeGreaterThan(0);
    expect(p.faDays).toBeGreaterThan(0);
    l.phase = 'freeAgency';
    signPlayer(l, p, 2, p.asking!.amount, 2, { news: false, start: l.season + 1 });
    expect(tradeBack(l, p, 2, AI)).toEqual([]);
  });

  it('so can a player whose deal ran out', () => {
    const l = league();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, AI)[0], 70, 33);
    tradedThisSeason(l, p, 2);
    p.contract = { start: l.season - 1, salaries: [10_000, 10_000] };
    p.tradeLock = { season: l.season, day: 100 };
    l.phase = 'resign';
    releaseExpiring(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.tradedFrom).toBeUndefined();
    expect(p.tradeLock).toBeUndefined();
    l.phase = 'freeAgency';
    signPlayer(l, p, 3, CAP_FOR(l, l.season + 1).vetMin, 1, { news: false, start: l.season + 1 });
    expect(tradeBack(l, p, 3, AI)).toEqual([]);
  });

  it('a signing with a new team drops the trade-back rule; a re-signing keeps it', () => {
    const l = league();
    l.phase = 'resign';
    const [stay, go] = standardRoster(l, U);
    for (const p of [stay, go]) p.tradedFrom = { tid: AI, season: l.season };
    signPlayer(l, stay, U, 10_000, 2, { news: false, start: l.season + 1 });
    expect(stay.tradedFrom).toEqual({ tid: AI, season: l.season });
    go.tid = FREE_AGENT;
    signPlayer(l, go, 2, 10_000, 2, { news: false, start: l.season + 1 });
    expect(go.tradedFrom).toBeUndefined();
  });

  it("a two-way converted in the re-signing period isn't listed as signed this summer", () => {
    const l = league();
    l.phase = 'resign';
    const tw = twoWayRoster(l, U)[0];
    tw.contract = { start: l.season, salaries: [600, 600], twoWay: true };
    const fa = freeAgents(l)[0];
    signPlayer(l, fa, U, CAP_FOR(l, l.season + 1).vetMin, 1, { news: false, start: l.season + 1 });
    expect(convertTwoWay(l, tw.pid).ok).toBe(true);
    expect(tw.contract.start).toBe(l.season + 1);
    expect(signedThisSummer(l).map((p) => p.pid)).toEqual([fa.pid]);
  });
});
