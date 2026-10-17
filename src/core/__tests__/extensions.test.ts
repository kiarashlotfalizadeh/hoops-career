// Contract extensions: who can be extended and when, what he asks and whether he'll talk, how an
// extension shows up on the books (payroll, expiring lists, cap holds, dead money, trade value),
// and the season it takes over. Plus the free-agent bookkeeping that came with them: a player whose
// deal ran out leaves his trade history behind, and a converted two-way isn't a new signing.
// Fictional leagues with hand-shaped players keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { newSeason, startRegularSeason } from '../league/season';
import { CAP_FOR, age, contractSeason, freeAgents, payroll, revenueScale, standardRoster, teamPlayers, twoWayRoster } from '../league/helpers';
import {
  DEC_15,
  FIRED_REASON,
  convertTwoWay,
  decideTeamOption,
  extensionAsk,
  extensionBlockedReason,
  extensionRefusal,
  injuryShare,
  marketSalary,
  releaseDeadMoney,
  releasePlayer,
  rookieContract,
  signPlayer,
  teamAppeal,
  tradeValue,
  valueScore,
  willExtend,
  type Strategy,
} from '../league/contracts';
import { userExtend } from '../league/negotiation';
import { aiExtensions, capHolds, expiringPlayers, releaseExpiring, renouncePlayer, signedThisSummer } from '../league/freeAgency';
import { executeTrade, validateTrade } from '../league/trades';
import { contractExp, extensionStart, salaryFor } from '../playerGen';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `ext${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // a fixed id: the AI's extension rolls are drawn from it (a league's own id reads the clock)
  l.id = `ext${rngSeed}`;
  return l;
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

/** Enough for him to sign an extension of `years` (each year away from what he wants adds ~3%). */
function agreed(l: League, p: Player, years: number): number {
  const ask = extensionAsk(l, p);
  return Math.ceil(ask.amount * (1 + Math.abs(years - ask.years) * 0.03));
}

describe('the extension window', () => {
  it('opens in the final season of a deal, for the user, from the re-signing period through the regular season', () => {
    const l = league();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, U)[0], 78, 27);
    expect(extensionBlockedReason(l, p)).toBeNull();
    // a year left after this one: not yet
    p.contract.salaries.push(10_000);
    expect(extensionBlockedReason(l, p)).toMatch(/final season of his deal/);
    p.contract.salaries.pop();
    // not someone else's player, not a two-way, not while he wants out, not for a fired coach
    expect(extensionBlockedReason(l, finalYear(l, standardRoster(l, AI)[0], 78, 27))).toMatch(/your own players/);
    p.mood.tradeRequest = true;
    expect(extensionBlockedReason(l, p)).toMatch(/wants a trade/);
    p.mood.tradeRequest = false;
    l.fired = true;
    expect(extensionBlockedReason(l, p)).toBe(FIRED_REASON);
    l.fired = false;
    const tw = twoWayRoster(l, U)[0];
    tw.contract = { start: l.season - 1, salaries: [600, 600], twoWay: true };
    expect(extensionBlockedReason(l, tw)).toMatch(/Two-way/);
    // postseason, lottery and draft: closed; the summer: next season's deal is the final one
    for (const phase of ['playoffs', 'draftLottery', 'draft'] as const) {
      l.phase = phase;
      expect(extensionBlockedReason(l, p)).toMatch(/reopen/);
    }
    l.phase = 'resign';
    expect(extensionBlockedReason(l, p)).toMatch(/contract is up/);
    finalYear(l, p, 78, 27);
    expect(extensionBlockedReason(l, p)).toBeNull();
    l.phase = 'freeAgency';
    expect(extensionBlockedReason(l, p)).toBeNull();
  });

  it('not on a deal he signed this season, and only once', () => {
    const l = league();
    l.phase = 'regular';
    const fa = freeAgents(l)[0];
    signPlayer(l, fa, U, CAP_FOR(l).vetMin, 1, { news: false });
    expect(extensionBlockedReason(l, fa)).toMatch(/signed this deal this season/);
    const p = finalYear(l, standardRoster(l, U)[0], 78, 27);
    expect(userExtend(l, p.pid, agreed(l, p, 2), 2).ok).toBe(true);
    expect(extensionBlockedReason(l, p)).toMatch(/already extended through/);
    // a new league's deals all start in its first season, but weren't signed in it
    const seed = finalYear(l, standardRoster(l, U)[1], 78, 27);
    seed.contract = { start: l.season, salaries: [10_000] };
    expect(extensionBlockedReason(l, seed)).toBeNull();
  });

  it('a first-round pick in the last season of his rookie deal becomes eligible once his team option is exercised', () => {
    const l = league();
    l.phase = 'resign';
    const p = standardRoster(l, U)[0];
    p.draft = { year: l.season - 3, round: 1, pick: 4, tid: U };
    p.experience = 3;
    p.mood.tradeRequest = false;
    p.mood.score = 0;
    // four seasons from three summers ago: the option year is next season
    p.contract = rookieContract(l, 4, 1, l.season - 2);
    expect(contractExp(p.contract)).toBe(l.season + 1);
    expect(extensionBlockedReason(l, p)).toMatch(/Decide his team option/);
    expect(decideTeamOption(l, p.pid, true).ok).toBe(true);
    expect(extensionBlockedReason(l, p)).toBeNull();
    // coming off a rookie-scale deal: up to five years, at a discount for the security
    expect(extensionAsk(l, p).years).toBeLessThanOrEqual(5);
    expect(willExtend(l, p, CAP_FOR(l, l.season + 2).maxContract(3), 5).reason).not.toMatch(/1 to 4/);
    const vet = finalYear(l, standardRoster(l, U)[1], 78, 27);
    expect(willExtend(l, vet, CAP_FOR(l, l.season + 2).maxContract(5), 5).reason).toMatch(/1 to 4 years/);
  });
});

describe('what he asks, and whether he talks', () => {
  it("asks his market value in the money of the extension's first season, less for security, more for a young star", () => {
    const l = league();
    l.phase = 'regular';
    l.settings.difficulty = 'normal';
    const [a, b, c] = standardRoster(l, U);
    const mid = finalYear(l, a, 78, 27);
    const vet = finalYear(l, b, 78, 32);
    const star = finalYear(l, c, 84, 24);
    const cap = CAP_FOR(l, l.season + 1);
    // his market value with the cap's growth, the discount or premium, over his interest in the team
    const expected = (p: Player, f: number) =>
      Math.min(cap.maxContract(p.experience), Math.round((((marketSalary(l, p) * revenueScale(l, l.season + 1)) / revenueScale(l, l.season)) * f) / teamAppeal(l, U, p) / 50) * 50);
    expect(extensionAsk(l, mid).amount).toBe(expected(mid, 1));
    expect(extensionAsk(l, vet).amount).toBe(expected(vet, 0.95));
    expect(extensionAsk(l, star).amount).toBe(expected(star, 1.05));
    expect(extensionAsk(l, star).amount).toBeGreaterThan(extensionAsk(l, mid).amount);
    // on a casual setting the user's own players ask 10% less
    l.settings.difficulty = 'casual';
    expect(extensionAsk(l, mid).amount).toBe(expected(mid, 0.9));
    // a veteran's extension runs four years at most
    expect(extensionAsk(l, finalYear(l, a, 78, 23)).years).toBeLessThanOrEqual(4);
  });

  it("an unhappy player won't talk, and a star on a team he doesn't fancy gives the same answer all season", () => {
    const l = league();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, U)[0], 86, 27);
    p.mood.score = -3;
    expect(extensionRefusal(l, p)).toMatch(/unhappy/);
    expect(willExtend(l, p, CAP_FOR(l, l.season + 1).maxContract(10), extensionAsk(l, p).years).ok).toBe(false);
    p.mood.score = 0;
    // a losing team with no buzz
    const t = l.teams[U];
    t.hype = 0;
    t.pop = 1;
    t.seasons.push({ ...t.seasons[0], season: l.season - 1, won: 12, lost: 70 });
    const answers = new Set<string | null>();
    for (let d = 0; d < 60; d += 7) {
      l.day = d;
      answers.add(extensionRefusal(l, p));
    }
    expect(answers.size).toBe(1);
    // the roll differs from player to player (and league to league): some test the market, some sign
    const outcomes = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      l.id = `ext-${i}`;
      outcomes.add(extensionRefusal(l, p) !== null);
    }
    expect([...outcomes].sort()).toEqual([false, true]);
  });
});

describe('an extension on the books', () => {
  it("counts in next season's payroll, keeps him off the expiring list and cap holds, and adds its years to dead money", () => {
    const l = league();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, U)[0], 79, 27, 12_000);
    const before = payroll(l, U, l.season + 1);
    const amount = agreed(l, p, 3);
    // under any walk-away price (12% at most) he counters (see negotiation.test.ts)
    expect(userExtend(l, p.pid, Math.floor((amount * 0.86) / 50) * 50, 3).ok).toBe(false);
    expect(p.contract.next).toBeUndefined();
    expect(userExtend(l, p.pid, amount, 3).ok).toBe(true);
    expect(extensionStart(p.contract)).toBe(l.season + 1);
    expect(contractExp(p.contract)).toBe(l.season + 3);
    expect(salaryFor(p, l.season)).toBe(12_000);
    expect(salaryFor(p, l.season + 1)).toBe(p.contract.next!.salaries[0]);
    expect(Math.abs(p.contract.next!.salaries[0] - amount)).toBeLessThanOrEqual(10);
    expect(p.contract.next!.salaries[2]).toBeGreaterThan(p.contract.next!.salaries[0]);
    expect(payroll(l, U, l.season + 1)).toBe(before + p.contract.next!.salaries[0]);
    // like a signing: no trading him for three months
    expect(p.tradeLock).toEqual({ season: l.season, day: Math.max(DEC_15, l.day + 90) });
    expect(l.inbox[0].subject).toMatch(new RegExp(`${p.lastName} signs a 3-year, \\$[0-9.]+M extension`));
    expect(l.news.at(-1)?.text).toMatch(/extension with the/);
    // released, he leaves this season's salary and the extension's on the books
    expect(releaseDeadMoney(l, p).map((d) => d.season)).toEqual([0, 1, 2, 3].map((i) => l.season + i));
    // after the season he isn't up for re-signing
    l.phase = 'resign';
    expect(expiringPlayers(l, U).map((x) => x.pid)).not.toContain(p.pid);
    expect(capHolds(l, U).map((h) => h.p.pid)).not.toContain(p.pid);
    releaseExpiring(l);
    expect(p.tid).toBe(U);
  });

  it('takes over when the deal ends, without the rookie scale or an option', () => {
    const l = league();
    l.phase = 'regular';
    const p = standardRoster(l, U)[0];
    p.draft = { year: l.season - 4, round: 1, pick: 10, tid: U };
    p.experience = 3;
    p.mood.score = 0;
    p.mood.tradeRequest = false;
    p.contract = { ...rookieContract(l, 10, 1, l.season - 3) };
    delete p.contract.option;
    expect(extensionBlockedReason(l, p)).toBeNull();
    expect(userExtend(l, p.pid, agreed(l, p, 4), 4).ok).toBe(true);
    const next = p.contract.next!.salaries;
    l.phase = 'freeAgency';
    l.faDay = 30;
    expect(newSeason(l)).toBe(true);
    expect(p.contract).toEqual({ start: l.season, salaries: next });
    expect(contractExp(p.contract)).toBe(l.season + 3);
  });

  it("picks up an option still on the deal: it would read as the extension's last season", () => {
    const l = league();
    l.phase = 'regular';
    // a seed contract whose option season is under way (already settled)
    const p = finalYear(l, standardRoster(l, U)[0], 78, 28);
    p.contract.option = 'player';
    expect(userExtend(l, p.pid, agreed(l, p, 2), 2).ok).toBe(true);
    expect(p.contract.option).toBeUndefined();
  });

  it('counts the extension in trade value: a fair one adds little, an overpay makes him a burden', () => {
    const l = league();
    l.phase = 'regular';
    const [a, b] = standardRoster(l, U);
    const fair = finalYear(l, a, 79, 27);
    const over = finalYear(l, b, 79, 27);
    const v0 = tradeValue(l, fair);
    expect(userExtend(l, fair.pid, agreed(l, fair, 4), 4).ok).toBe(true);
    expect(userExtend(l, over.pid, CAP_FOR(l, l.season + 1).maxContract(over.experience), 4).ok).toBe(true);
    expect(Math.abs(tradeValue(l, fair) - v0)).toBeLessThan(Math.abs(v0) * 0.25 + 1);
    expect(tradeValue(l, over)).toBeLessThan(tradeValue(l, fair) - 3);
  });

  it("values normal contracts as before, within about 2% (season by season now, so an extension's years count)", () => {
    // the old formula: this season's surplus times the seasons left (up to four)
    const old = (l: League, p: Player, strategy: Strategy) => {
      let s = valueScore(l, p);
      const a = age(l, p);
      if (strategy === 'rebuild') {
        if (a <= 24) s += 2;
        if (a >= 29) s -= 3 + (a - 29) * 0.8;
      } else if (strategy === 'contend') s = s * 0.6 + p.ovr * 0.4 + (p.ovr >= 75 ? 1.5 : 0);
      let v = Math.exp((s - 60) / 6);
      if (s > 85) v *= 1 + (s - 85) * 0.05;
      v *= 1 - injuryShare(l, p) * (strategy === 'contend' ? 0.55 : strategy === 'retool' ? 0.3 : 0.1);
      const cs = contractSeason(l);
      const yrs = Math.max(1, contractExp(p.contract) - cs + 1);
      const surplus = (marketSalary(l, p) - salaryFor(p, cs)) / 1000;
      const optionYear = p.contract.option === 'team' && contractExp(p.contract) > l.season && yrs <= 4;
      return v + surplus * (optionYear && surplus < 0 ? yrs - 1 : Math.min(yrs, 4)) * (strategy === 'rebuild' ? 0.18 : 0.1);
    };
    for (const seed of [1, 2]) {
      const l = league(seed);
      for (const phase of ['preseason', 'resign'] as const) {
        l.phase = phase;
        for (const p of Object.values(l.players).filter((x) => x.tid >= 0))
          for (const st of ['retool', 'contend', 'rebuild'] as const) {
            const was = old(l, p, st);
            expect(Math.abs(tradeValue(l, p, st) - was)).toBeLessThanOrEqual(Math.abs(was) * 0.02 + 0.1);
          }
      }
    }
  });
});

describe('AI extensions', () => {
  it("opening night: AI teams extend some of their good players in a final season, without touching the league's random stream", () => {
    const l = league(3);
    for (const t of l.teams.slice(1, 11)) finalYear(l, standardRoster(l, t.tid)[0], 82, 26, 15_000);
    const rng = l.rng;
    aiExtensions(l);
    expect(l.rng).toBe(rng);
    const extended = l.teams.slice(1, 11).filter((t) => standardRoster(l, t.tid)[0].contract.next);
    expect(extended.length).toBeGreaterThanOrEqual(2);
    expect(extended.length).toBeLessThanOrEqual(9);
    for (const t of extended) {
      const p = standardRoster(l, t.tid)[0];
      const s = extensionStart(p.contract)!;
      expect(s).toBe(l.season + 1);
      expect(p.contract.next!.salaries[0]).toBeLessThanOrEqual(CAP_FOR(l, s).maxContract(p.experience));
      expect(p.contract.next!.salaries.length).toBeLessThanOrEqual(4);
    }
    // the user's own players are his call
    expect(teamPlayers(l, U).some((p) => p.contract.next)).toBe(false);
  });

  it('happens when the regular season starts', () => {
    const l = league(3);
    for (const t of l.teams.slice(1, 11)) finalYear(l, standardRoster(l, t.tid)[0], 82, 26, 15_000);
    while (standardRoster(l, U).length > 15) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    expect(startRegularSeason(l)).toEqual([]);
    expect(Object.values(l.players).some((p) => p.contract.next)).toBe(true);
  });
});

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
