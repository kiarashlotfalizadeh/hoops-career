// The 2023 CBA's aprons and the real luxury tax: the first and second aprons grow with the cap; the
// mid-level and the bi-annual stop at the first apron and hard-cap the team there, the taxpayer
// mid-level (3.7%, 2 years) takes what the mid-level can't under it and hard-caps the team at the
// second; over the first apron a trade matches dollar for dollar, over the second it can't combine
// salaries or send cash; the buyout market keeps a team over the first apron from big contracts
// waived this season; the tax runs by $5M brackets, higher for a repeater; two-way players play 50
// regular-season games at most. Fictional leagues keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, contractSeason, curTeamSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers, teamSeason } from '../league/helpers';
import {
  EXCEPTIONS,
  TMLE_PCT,
  TWO_WAY_GAMES,
  aiRoute,
  aiTwoWayLimits,
  buyoutBlockedReason,
  claimBlockedReason,
  convertTwoWay,
  exceptionAmount,
  exceptionCovers,
  exceptionRoom,
  exceptionUsedReason,
  hardCap,
  hardCapBlockedReason,
  payrollBudget,
  releasePlayer,
  seasonGames,
  signPlayer,
  signingRoute,
  spendRoute,
  twoWayGamesNote,
  twoWayLimitReached,
} from '../league/contracts';
import { assessLuxuryTax, luxuryTaxBill, taxFor, taxRepeater, taxSeasons } from '../league/finances';
import { offerBlockedReason, offerRoute, userExceptionRoom, userResign } from '../league/freeAgency';
import { acceptQualifyingOffers, aiMatchVerdict, sheetDecisionBlocked } from '../league/rfa';
import { buildSimInput, playGame } from '../league/games';
import { canMakeWork, evaluateTrade, hardCapGap, maxTakeBack, salaryMatchGap, validateTrade, type TradeOffer, type TradeSide } from '../league/trades';
import { tenDayBlockedReason, tenDayOpenDay } from '../league/tenDay';
import { migrate } from '../../state/persistence';
import { CAP } from '../constants';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(phase: League['phase'] = 'freeAgency', rngSeed = 11): League {
  const l = createLeague({ name: 'aprons', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `aprons_${rngSeed}`;
  l.phase = phase;
  l.faDay = 1;
  l.day = 0;
  return l;
}

/** Set a team's payroll for the contract season to exactly `amount` (dead money makes up the rest). */
function payTo(l: League, tid: number, amount: number) {
  const s = contractSeason(l);
  l.teams[tid].deadMoney = [];
  const now = payroll(l, tid, s);
  l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: s, amount: amount - now });
  expect(payroll(l, tid, s)).toBe(amount);
}

function freeAgent(l: League, ovr = 70, i = 0): Player {
  const p = freeAgents(l).filter((x) => !x.rfa)[i];
  p.ovr = p.pot = ovr;
  p.bornYear = l.season - 27;
  p.experience = 5;
  p.injury = null;
  return p;
}

/** A tradeable player of team `tid` (its i-th by salary) paid `salary` this season and next. */
function paid(l: League, tid: number, salary: number, i = 0): Player {
  const p = standardRoster(l, tid).sort((a, b) => b.contract.salaries[0] - a.contract.salaries[0] || a.pid - b.pid)[i];
  p.contract = { start: contractSeason(l), salaries: [salary, salary] };
  delete p.tradeLock;
  return p;
}

const side = (tid: number, x: Partial<TradeSide> = {}): TradeSide => ({ tid, pids: [], dpids: [], ...x });
const deal = (a: Partial<TradeSide>, b: Partial<TradeSide> = {}): TradeOffer => ({ a: side(U, a), b: side(AI, b) });

describe('the aprons', () => {
  it('sit at $209.0M and $222.0M in 2026-27 and grow with the cap like the tax line', () => {
    const l = league();
    const now = CAP_FOR(l, l.startSeason);
    expect([now.apron1, now.apron2, now.taxBracket]).toEqual([209_000, 222_000, 5_000]);
    const later = CAP_FOR(l, l.startSeason + 3);
    const g = Math.pow(1 + CAP.growth, 3);
    expect([later.apron1, later.apron2]).toEqual([Math.round(209_000 * g), Math.round(222_000 * g)]);
    expect(later.apron1 / later.luxuryTax).toBeCloseTo(209 / 201, 4);
  });
});

describe('the mid-levels', () => {
  it('the mid-level stops at the first apron; past it the taxpayer mid-level pays 3.7% for two years, once, up to the second apron', () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    const p = freeAgent(l);
    // no bi-annual this season, so the mid-levels are the only exceptions
    l.teams[U].baeSeason = s - 1;
    payTo(l, U, cap.apron1 - 3_000);
    const tmle = exceptionAmount(l, 'tmle', s);
    expect(tmle).toBe(Math.round((cap.salaryCap * TMLE_PCT) / 10) * 10);
    expect(EXCEPTIONS.tmle.years).toBe(2);
    expect(exceptionRoom(l, U, 'mle', s)).toBe(3_000);
    expect(exceptionRoom(l, U, 'tmle', s)).toBe(tmle);
    // what the mid-level pays under the first apron is the mid-level's
    expect(signingRoute(l, U, 2_800, s, p)).toBe('mle');
    expect(exceptionCovers(l, U, 'tmle', 2_800, s)).toBe(false);
    expect(signingRoute(l, U, 2_800, s, p, 2, 'tmle')).toBe('mle');
    // past it, the taxpayer mid-level: two years at most, its amount at most
    expect(signingRoute(l, U, 4_000, s, p)).toBe('tmle');
    expect(signingRoute(l, U, 4_000, s, p, 3)).toBeNull();
    expect(signingRoute(l, U, tmle + 10, s, p)).toBeNull();
    // and only up to the second apron
    payTo(l, U, cap.apron2 - 3_000);
    expect(exceptionRoom(l, U, 'mle', s)).toBe(0);
    expect(exceptionRoom(l, U, 'tmle', s)).toBe(3_000);
    expect(signingRoute(l, U, 3_500, s, p)).toBeNull();
    payTo(l, U, cap.apron2 + 1_000);
    expect(exceptionRoom(l, U, 'tmle', s)).toBe(0);
    // well under the first apron the taxpayer mid-level adds nothing the mid-level doesn't pay
    payTo(l, U, cap.salaryCap + 1_000);
    expect(exceptionRoom(l, U, 'tmle', s)).toBe(0);
  });

  it('one mid-level a season, neither after cap space, and the taxpayer one hard-caps the team at the second apron', () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    payTo(l, U, cap.apron1 + 1_000);
    expect(exceptionRoom(l, U, 'tmle', s)).toBe(exceptionAmount(l, 'tmle', s));
    spendRoute(l, U, 'tmle', s);
    expect(l.teams[U].tmleSeason).toBe(s);
    expect(exceptionUsedReason(l, U, 'tmle', s)).toBe('Used this season.');
    expect(exceptionUsedReason(l, U, 'mle', s)).toMatch(/Not after the taxpayer mid-level: a team gets one mid-level a season/);
    expect(exceptionUsedReason(l, U, 'room', s)).toMatch(/Not after a mid-level/);
    expect(hardCap(l, U, s)).toEqual({ amount: cap.apron2, apron: 2, route: 'tmle' });
    // next season it's open again
    expect(exceptionUsedReason(l, U, 'tmle', s + 1)).toBeNull();
    // the mid-level first: no taxpayer mid-level after it
    spendRoute(l, AI, 'mle', s);
    expect(exceptionUsedReason(l, AI, 'tmle', s)).toMatch(/Not after the mid-level/);
    // cap space ends both
    spendRoute(l, 2, 'space', s);
    expect(exceptionUsedReason(l, 2, 'tmle', s)).toMatch(/room exception replaces it/);
    expect(exceptionUsedReason(l, 2, 'mle', s)).toMatch(/room exception replaces it/);
  });

  it("the user's pending offer on one mid-level holds the other, and a taxpayer mid-level offer is routed as one", () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    payTo(l, U, cap.apron1 + 1_000);
    const [star, role] = [freeAgent(l, 80, 0), freeAgent(l, 66, 1)];
    expect(offerRoute(l, role, 4_000, s)).toBe('tmle');
    l.faBids = [{ pid: star.pid, amount: 5_000, years: 2, day: 0, decideDay: 2, route: 'tmle' }];
    expect(userExceptionRoom(l, 'tmle', s, role.pid)).toBe(0);
    expect(userExceptionRoom(l, 'mle', s, role.pid)).toBe(0);
    expect(offerRoute(l, role, 4_000, s)).toBeNull();
    expect(offerBlockedReason(l, role, 4_000, 2)).toMatch(/No cap space/);
  });

  it('AI teams take the taxpayer mid-level only as contenders, and budget by the aprons', () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    const p = freeAgent(l);
    payTo(l, AI, cap.apron1 + 1_000);
    l.teams[AI].strategy = 'contend';
    expect(aiRoute(l, AI, 4_000, s, p, 2)).toBe('tmle');
    l.teams[AI].strategy = 'retool';
    expect(aiRoute(l, AI, 4_000, s, p, 2)).toBeNull();
    const t = l.teams[AI];
    const budget = (strategy: (typeof t)['strategy'], v: number) => payrollBudget(cap, { ...t, strategy }, v);
    expect([budget('contend', 70), budget('contend', 83), budget('contend', 88)]).toEqual([cap.apron1, cap.apron2, cap.apron2 * 1.03]);
    expect([budget('retool', 70), budget('retool', 83), budget('rebuild', 88)]).toEqual([(cap.salaryCap + cap.luxuryTax) / 2, cap.luxuryTax, cap.apron1]);
  });
});

describe('hard caps', () => {
  it('after the mid-level or the bi-annual no signing on an exception or trade takes the payroll past the first apron', () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    const p = freeAgent(l);
    spendRoute(l, U, 'bae', s);
    expect(hardCap(l, U, s)).toEqual({ amount: cap.apron1, apron: 1, route: 'bae' });
    payTo(l, U, cap.apron1 - 1_000);
    // the mid-level is open, to the hard cap; the taxpayer mid-level isn't
    expect(exceptionRoom(l, U, 'mle', s)).toBe(1_000);
    expect(exceptionRoom(l, U, 'tmle', s)).toBe(0);
    expect(signingRoute(l, U, 3_000, s, p)).toBeNull();
    // nor a minimum deal (see the next test), but one that fits under it
    expect(signingRoute(l, U, cap.vetMin, s, p)).toBeNull();
    payTo(l, U, cap.apron1 - 3_000);
    expect(signingRoute(l, U, cap.vetMin, s, p)).toBe('min');
    const big = paid(l, AI, 5_000);
    payTo(l, U, cap.apron1 - 3_000);
    payTo(l, AI, cap.salaryCap - 20_000);
    const errs = validateTrade(l, deal({}, { pids: [big.pid] }));
    expect(errs.some((e) => /used the bi-annual exception this season, so it is hard-capped at the first apron: a trade can't take its payroll past \$209\.0M\./.test(e))).toBe(
      true,
    );
    // a deal that sheds salary is fine
    const mine = paid(l, U, 6_000, 3);
    payTo(l, U, cap.apron1 - 3_000);
    expect(validateTrade(l, deal({ pids: [mine.pid] }, { pids: [big.pid] }))).toEqual([]);
  });

  it('after the taxpayer mid-level the hard cap is the second apron', () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    spendRoute(l, U, 'tmle', s);
    const big = paid(l, AI, 5_000);
    payTo(l, U, cap.apron2 - 2_000);
    payTo(l, AI, cap.salaryCap - 20_000);
    const errs = validateTrade(l, deal({}, { pids: [big.pid] }));
    expect(
      errs.some((e) => /used the taxpayer mid-level exception this season, so it is hard-capped at the second apron: a trade can't take its payroll past \$222\.0M\./.test(e)),
    ).toBe(true);
  });
});

describe('a hard cap binds every signing', () => {
  /** Team `tid` with `n` healthy players under contract this season and the rest injured. */
  function healthy(l: League, tid: number, n: number) {
    standardRoster(l, tid).forEach((x, i) => (x.injury = i < n ? null : { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' }));
  }

  it('a minimum deal, a 10-day, a waiver claim or a two-way conversion goes past it only to get a team back to 13 healthy players', () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    const p = freeAgent(l);
    while (standardRoster(l, U).length > 14) standardRoster(l, U)[0].tid = FREE_AGENT;
    healthy(l, U, 14);
    spendRoute(l, U, 'mle', s);
    payTo(l, U, cap.apron1 - 1_000);
    const why = `You are hard-capped at the first apron ($209.0M) after the mid-level exception: this would take your payroll to $${((cap.apron1 - 1_000 + cap.vetMin) / 1000).toFixed(1)}M. Only a minimum deal that gets you back to 13 healthy players can go past it.`;
    expect(hardCapBlockedReason(l, U, cap.vetMin, s)).toBe(why);
    expect(signingRoute(l, U, cap.vetMin, s, p)).toBeNull();
    expect(offerBlockedReason(l, p, cap.vetMin, 1)).toBe(why);
    // a bigger offer hears it too, not that the minimum is open
    expect(offerBlockedReason(l, p, 6_000, 2)).toBe(
      `No cap space. Not even his minimum ($${(cap.vetMin / 1000).toFixed(2)}M) fits: you are hard-capped at the first apron ($209.0M) after the mid-level exception, and only a minimum deal that gets you back to 13 healthy players can go past it.`,
    );
    // a 10-day: its pay, prorated
    l.day = tenDayOpenDay(l) + 1;
    p.asking = { amount: cap.vetMin, years: 1 };
    payTo(l, U, cap.apron1 - 50);
    expect(tenDayBlockedReason(l, U, p)).toMatch(/^You are hard-capped at the first apron/);
    // a waiver claim of a minimum deal
    const cut = paid(l, AI, cap.vetMin);
    releasePlayer(l, cut);
    expect(cut.waivers).toBeDefined();
    expect(claimBlockedReason(l, U, cut)).toMatch(/^You are hard-capped at the first apron/);
    // a two-way conversion at his minimum
    const tw = freeAgents(l).filter((x) => !x.rfa && x.pid !== p.pid && x.pid !== cut.pid)[5];
    tw.experience = 1;
    signPlayer(l, tw, U, 600, 1, { twoWay: true, news: false });
    payTo(l, U, cap.apron1 - 50);
    expect(convertTwoWay(l, tw.pid)).toEqual({ ok: false, reason: expect.stringMatching(/^You are hard-capped at the first apron/) });
    // short of 13 healthy players every one of them goes through
    healthy(l, U, 12);
    expect(hardCapBlockedReason(l, U, cap.vetMin, s)).toBeNull();
    expect(signingRoute(l, U, cap.vetMin, s, p)).toBe('min');
    expect(tenDayBlockedReason(l, U, p)).toBeNull();
    expect(claimBlockedReason(l, U, cut)).toBeNull();
    // but not a deal bigger than a minimum one
    expect(hardCapBlockedReason(l, U, cap.vetMin + 1_000, s)).toMatch(/hard-capped/);
    expect(convertTwoWay(l, tw.pid).ok).toBe(true);
    // AI teams are held to it the same way
    spendRoute(l, AI, 'tmle', s);
    payTo(l, AI, cap.apron2 - 1_000);
    healthy(l, AI, 13);
    expect(hardCapBlockedReason(l, AI, cap.vetMin, s)).toMatch(
      new RegExp(`^The ${l.teams[AI].name} are hard-capped at the second apron \\(\\$222\\.0M\\) after the taxpayer mid-level exception`),
    );
    expect(signingRoute(l, AI, cap.vetMin, s, p)).toBeNull();
  });

  it("Bird rights included: a restricted free agent's new deal, a match and a qualifying offer stop at it", () => {
    const l = league('freeAgency');
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    // (theirs worth a contender's going to the second apron for: the hard cap, not the budget, stops the match)
    const [mine, theirs, qo] = [freeAgent(l, 72, 0), freeAgent(l, 86, 1), freeAgent(l, 70, 2)];
    mine.rfa = { tid: U, qo: 3_000, hold: 6_000, sheet: { tid: 2, amount: 6_000, years: 3, route: 'space', day: 1, until: 2 } };
    theirs.rfa = { tid: AI, qo: 3_000, hold: 6_000, sheet: { tid: 2, amount: 6_000, years: 3, route: 'space', day: 1, until: 2 } };
    qo.rfa = { tid: U, qo: 3_000, hold: 3_000 };
    for (const tid of [U, AI]) {
      spendRoute(l, tid, 'mle', s);
      payTo(l, tid, cap.apron1 - 2_000);
    }
    // matching needs no cap room, but the hard cap binds it (next season's first apron, grown with the cap)
    const m = (x: number) => `$${(x / 1000).toFixed(1)}M`;
    expect(sheetDecisionBlocked(l, mine.pid, true)).toContain(
      `You are hard-capped at the first apron (${m(cap.apron1)}) after the mid-level exception: this would take your payroll to ${m(cap.apron1 + 4_000)}.`,
    );
    expect(sheetDecisionBlocked(l, mine.pid, false)).toBeNull();
    l.teams[AI].strategy = 'contend';
    expect(aiMatchVerdict(l, theirs)).toEqual({ match: false, why: 'they are hard-capped at the first apron for the season, and matching would take them past it' });
    // his new deal with Bird rights
    delete mine.rfa.sheet;
    mine.mood.tradeRequest = false;
    mine.contract = { start: l.season, salaries: [1_000] };
    expect(userResign(l, mine.pid, 6_000, 3).reason).toMatch(/^You are hard-capped at the first apron/);
    // at the close a qualifying offer that would break it lapses
    delete mine.rfa;
    delete theirs.rfa;
    l.inbox = [];
    acceptQualifyingOffers(l);
    expect(qo.tid).toBe(FREE_AGENT);
    expect(qo.rfa).toBeUndefined();
    expect(l.inbox[0].body).toMatch(/qualifying offer lapsed: taking him back would have put us past our hard cap, so he's an unrestricted free agent/);
  });

  it('the lower one when two apply: the bi-annual and the taxpayer mid-level cap the team at the first apron', () => {
    const l = league('regular');
    const s = l.season;
    spendRoute(l, U, 'tmle', s);
    expect(hardCap(l, U, s)?.apron).toBe(2);
    spendRoute(l, U, 'bae', s);
    expect(hardCap(l, U, s)).toEqual({ amount: CAP_FOR(l, s).apron1, apron: 1, route: 'bae' });
  });
});

describe('trades by apron', () => {
  it('over the first apron after the trade, no more salary back than out; under it, 125% plus $0.1M', () => {
    const l = league('regular');
    const cap = CAP_FOR(l, l.season);
    const out = paid(l, U, 10_000);
    const back = paid(l, AI, 10_100);
    payTo(l, U, cap.apron1 + 10_000);
    payTo(l, AI, cap.salaryCap - 20_000);
    const o = deal({ pids: [out.pid] }, { pids: [back.pid] });
    expect(validateTrade(l, o)).toEqual([
      `${l.teams[U].abbrev} would be over the first apron ($209.0M) after the trade, so it can take back no more salary than it sends ($10.0M) — incoming is $10.1M.`,
    ]);
    expect(salaryMatchGap(l, o, 'a')).toBe(100);
    back.contract.salaries = [10_000, 10_000];
    expect(validateTrade(l, o)).toEqual([]);
    // landing at or under the first apron, the 125% rule
    back.contract.salaries = [12_000, 12_000];
    payTo(l, U, cap.apron1 - 5_000);
    expect(validateTrade(l, o)).toEqual([]);
    // a little higher it lands past the first apron: sending $1.0M more brings it back to the apron
    payTo(l, U, cap.apron1 - 1_000);
    expect(validateTrade(l, o)[0]).toMatch(/over the first apron/);
    expect(salaryMatchGap(l, o, 'a')).toBe(1_000);
  });

  it('over the second apron after the trade, no combining salaries and no cash', () => {
    const l = league('regular');
    const cap = CAP_FOR(l, l.season);
    const a = paid(l, U, 10_000, 0);
    const b = paid(l, U, 8_000, 1);
    const star = paid(l, AI, 15_000);
    // (a roster spot for the second player they'd take)
    while (standardRoster(l, AI).length > 14) standardRoster(l, AI).find((x) => x !== star)!.tid = FREE_AGENT;
    payTo(l, U, cap.apron2 + 5_000);
    payTo(l, AI, cap.salaryCap - 20_000);
    const two = deal({ pids: [a.pid, b.pid] }, { pids: [star.pid] });
    expect(validateTrade(l, two)).toEqual([
      `${l.teams[U].abbrev} would be over the second apron ($222.0M) after the trade, so it can't combine salaries: nobody coming in may earn more than the best-paid player it sends.`,
    ]);
    // a player paid no more than the best-paid one going out isn't aggregating
    star.contract.salaries = [9_500, 9_500];
    payTo(l, U, cap.apron2 + 10_000);
    expect(validateTrade(l, two)).toEqual([]);
    // landing under the second apron, two for one is fine
    star.contract.salaries = [15_000, 15_000];
    payTo(l, U, cap.apron2 + 1_000);
    expect(validateTrade(l, two)).toEqual([]);
    // and no cash out past it, while taking cash in is fine
    const second = l.draftPicks.find((d) => d.tid === AI && d.round === 2)!;
    payTo(l, U, cap.apron2 + 1_000);
    expect(validateTrade(l, deal({ cash: 1_000 }, { dpids: [second.dpid] }))).toEqual([
      `${l.teams[U].abbrev} would be over the second apron ($222.0M) after the trade, so it can't send cash.`,
    ]);
    const mine = l.draftPicks.find((d) => d.tid === U && d.round === 2)!;
    expect(validateTrade(l, deal({ dpids: [mine.dpid] }, { cash: 1_000 }))).toEqual([]);
    payTo(l, U, cap.apron2 - 1_000);
    expect(validateTrade(l, deal({ cash: 1_000 }, { dpids: [second.dpid] }))).toEqual([]);
  });
});

describe('trade helpers by apron', () => {
  it('"what would make this work?" fixes a hard cap on our side, never theirs', () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    // (roster room for one more on our side, a player to spare on theirs)
    while (standardRoster(l, U).length > 14) standardRoster(l, U)[0].tid = FREE_AGENT;
    while (standardRoster(l, AI).length < 14) signPlayer(l, freeAgents(l)[0], AI, cap.minContract, 1, { news: false });
    const big = paid(l, AI, 5_000);
    spendRoute(l, U, 'bae', s);
    payTo(l, U, cap.apron1 - 3_000);
    payTo(l, AI, cap.salaryCap - 20_000);
    const ask = deal({}, { pids: [big.pid] });
    // dollar for dollar past the first apron, and the hard cap: both ours to fix by sending salary
    expect(hardCapGap(l, ask, 'a')).toBe(2_000);
    expect(salaryMatchGap(l, ask, 'a')).toBe(3_920);
    expect(canMakeWork(l, ask)).toBe(true);
    // the other way round they would have to send it
    delete l.teams[U].baeSeason;
    spendRoute(l, AI, 'mle', s);
    const mine = paid(l, U, 5_000);
    payTo(l, U, cap.salaryCap - 20_000);
    payTo(l, AI, cap.apron1 - 1_000);
    const give = deal({ pids: [mine.pid] });
    expect(hardCapGap(l, give, 'b')).toBe(4_000);
    expect(canMakeWork(l, give)).toBe(false);
  });

  it('the trade finder takes back no more than one contract past the second apron, and stops at a hard cap', () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    for (const x of standardRoster(l, U)) x.contract = { start: s, salaries: [1_000, 1_000] };
    paid(l, U, 20_000, 0);
    paid(l, U, 15_000, 1);
    // past the second apron with both gone too: no aggregating, so one contract's worth
    payTo(l, U, cap.apron2 + 40_000);
    expect(maxTakeBack(l, U)).toBe(20_000);
    // past the first apron (not the second, both gone): dollar for dollar, both of them
    payTo(l, U, cap.apron1 + 10_000);
    expect(maxTakeBack(l, U)).toBe(35_000);
    // under it after the deal: 125% plus $0.1M
    payTo(l, U, cap.salaryCap + 5_000);
    expect(maxTakeBack(l, U)).toBe(Math.min(35_000 * CAP.tradeMatchPct + CAP.tradeMatchBuffer, cap.apron1 - cap.salaryCap - 5_000 + 35_000));
    // hard-capped: no further than the hard cap
    spendRoute(l, U, 'mle', s);
    payTo(l, U, cap.apron1 - 2_000);
    expect(maxTakeBack(l, U)).toBe(37_000);
  });

  it('an AI team counts the tax a deal costs it by the brackets, a repeater at its rates', () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    const t = l.teams[AI];
    for (const k of [1, 2, 3]) teamSeason(t, s - k).tax = 1_000;
    expect(taxRepeater(l, AI, s)).toBe(true);
    // (a player of little value to them, so the money stands out among the reasons)
    const mine = paid(l, U, 4_000);
    mine.ovr = mine.pot = 55;
    mine.bornYear = s - 31;
    payTo(l, AI, cap.luxuryTax + 3_000);
    const ev = evaluateTrade(l, deal({ pids: [mine.pid] }));
    expect(ev.parts.taxCost).toBe(taxFor(7_000, true) - taxFor(3_000, true));
    expect(ev.notes.some((n) => /takes them to \$7\.0M over the tax line at repeater rates/.test(n.text))).toBe(true);
  });
});

describe('the buyout market', () => {
  it("a player waived in the regular season off a deal over the mid-level can't join a team over the first apron", () => {
    const l = league('regular');
    const s = l.season;
    const cap = CAP_FOR(l, s);
    const mle = exceptionAmount(l, 'mle', s);
    const p = paid(l, AI, mle + 5_000);
    p.bornYear = s - 31;
    releasePlayer(l, p);
    expect(p.waivers).toBeDefined();
    expect(p.waivedSalary).toEqual({ season: s, salary: mle + 5_000 });
    payTo(l, U, cap.apron1 - 1_000);
    expect(buyoutBlockedReason(l, U, p, cap.vetMin)).toBe(
      `${p.firstName} ${p.lastName} was waived this season off a $${((mle + 5_000) / 1000).toFixed(1)}M deal, more than the mid-level: a team over the first apron ($209.0M) with him on its payroll can't add him.`,
    );
    // he cleared waivers and would take the minimum: still not for a team over the first apron, the 10-day included
    delete p.waivers;
    p.asking = { amount: cap.vetMin, years: 1 };
    payTo(l, U, cap.apron1 + 1_000);
    expect(offerBlockedReason(l, p, cap.vetMin, 1)).toMatch(/waived this season off a/);
    l.day = 90;
    expect(tenDayBlockedReason(l, U, p)).toMatch(/waived this season off a/);
    // a team that stays under it can sign him
    payTo(l, U, cap.apron1 - 5_000);
    expect(buyoutBlockedReason(l, U, p, cap.vetMin)).toBeNull();
    // signing anywhere ends it; next season (and the summer before it) it's gone
    payTo(l, U, cap.apron1 - 1_000);
    l.phase = 'freeAgency';
    expect(buyoutBlockedReason(l, U, p, cap.vetMin)).toBeNull();
  });

  it('a buyout counts as a waiver; a release off a deal under the mid-level, or in the preseason, leaves no mark', () => {
    const l = league('regular');
    const s = l.season;
    const mle = exceptionAmount(l, 'mle', s);
    const vet = paid(l, AI, mle + 2_000, 0);
    releasePlayer(l, vet, { giveback: 0.1 });
    expect(vet.waivers).toBeUndefined();
    expect(vet.waivedSalary).toEqual({ season: s, salary: mle + 2_000 });
    signPlayer(l, vet, 2, CAP_FOR(l).vetMin, 1);
    expect(vet.waivedSalary).toBeUndefined();
    const small = paid(l, AI, mle - 1_000, 1);
    releasePlayer(l, small);
    expect(small.waivedSalary).toBeUndefined();
    l.phase = 'preseason';
    const camp = paid(l, AI, mle + 2_000, 2);
    releasePlayer(l, camp);
    expect(camp.waivedSalary).toBeUndefined();
  });
});

describe('the luxury tax', () => {
  it('runs by $5.0M brackets: 1.5, 1.75, 2.5, 3.25, then 0.5 more each; a repeater 2.5, 2.75, 3.5, 4.25 and up', () => {
    expect(taxFor(0, false)).toBe(0);
    expect(taxFor(-3_000, false)).toBe(0);
    expect(taxFor(1_000, false)).toBe(1_500);
    expect(taxFor(5_000, false)).toBe(7_500);
    expect(taxFor(12_000, false)).toBe(7_500 + 8_750 + 2_000 * 2.5);
    expect(taxFor(25_000, false)).toBe(7_500 + 8_750 + 12_500 + 16_250 + 5_000 * 3.75);
    expect(taxFor(31_000, false)).toBe(7_500 + 8_750 + 12_500 + 16_250 + 5_000 * 3.75 + 5_000 * 4.25 + 1_000 * 4.75);
    expect(taxFor(12_000, true)).toBe(12_500 + 13_750 + 2_000 * 3.5);
    expect(taxFor(23_000, true)).toBe(12_500 + 13_750 + 17_500 + 21_250 + 3_000 * 4.75);
    // brackets grow with the cap
    expect(taxFor(10_600, false, 1.06)).toBe(5_300 * 1.5 + 5_300 * 1.75);
  });

  it('a repeater paid tax in 3 of the 4 seasons before, by the bill recorded or, before bills were, by payroll against the tax line', () => {
    const l = league('regular');
    const s = l.season;
    const t = l.teams[3];
    const tax = (season: number) => CAP_FOR(l, season).luxuryTax;
    teamSeason(t, s - 1).tax = 4_000;
    teamSeason(t, s - 2).tax = 0;
    // (from before bills were recorded: payroll over that season's tax line counts)
    teamSeason(t, s - 3).payroll = tax(s - 3) + 1_000;
    teamSeason(t, s - 4).payroll = tax(s - 4) - 1_000;
    // five seasons back doesn't count
    teamSeason(t, s - 5).tax = 9_000;
    expect(taxSeasons(l, 3, s)).toBe(2);
    expect(taxRepeater(l, 3, s)).toBe(false);
    teamSeason(t, s - 4).tax = 1;
    expect(taxSeasons(l, 3, s)).toBe(3);
    expect(taxRepeater(l, 3, s)).toBe(true);
    expect(luxuryTaxBill(l, 3, tax(s) + 12_000, s)).toBe(taxFor(12_000, true));
    expect(luxuryTaxBill(l, 4, tax(s) + 12_000, s)).toBe(taxFor(12_000, false));
    // the end of the regular season: a repeater's bill, recorded for the next one
    payTo(l, 3, tax(s) + 12_000);
    const cash = t.cash;
    const bill = assessLuxuryTax(l).find((b) => b.tid === 3)!;
    expect(bill.tax).toBe(12_500 + 13_750 + 2_000 * 3.5);
    expect(curTeamSeason(l, 3).tax).toBe(bill.tax);
    expect(t.cash).toBeLessThanOrEqual(cash - bill.tax);
  });
});

describe('the two-way games limit', () => {
  /** A young free agent signed to team `tid` on a two-way deal, with `games` regular-season games played this season. */
  function twoWay(l: League, tid: number, games: number, minutes = games * 5): Player {
    const p = freeAgents(l).filter((x) => !x.rfa)[tid + 3];
    p.experience = 1;
    signPlayer(l, p, tid, 600, 1, { twoWay: true, news: false });
    const line = statsLine(p, l.season, tid, false);
    line.gp = games;
    line.min = minutes;
    return p;
  }

  it('after 50 regular-season games he sits, on any team, with a DNP note, until he is converted', () => {
    const l = league('regular');
    const mine = twoWay(l, U, TWO_WAY_GAMES);
    const theirs = twoWay(l, AI, TWO_WAY_GAMES - 1);
    expect(seasonGames(mine, l.season)).toBe(TWO_WAY_GAMES);
    expect(twoWayLimitReached(l, mine)).toBe(true);
    expect(twoWayLimitReached(l, theirs)).toBe(false);
    const input = buildSimInput(l, U, l.day, 'regular', AI);
    expect(input.rest).toContain(mine.pid);
    expect(input.dnp).toEqual({ [mine.pid]: 'Two-way limit' });
    // the postseason isn't the regular season
    expect(buildSimInput(l, U, l.day, 'playoffs', AI).rest).not.toContain(mine.pid);
    // in the user's game his box line says why, and he doesn't add a game
    const team = l.teams[U];
    team.rotation.manual = true;
    team.rotation.order = [mine.pid, ...team.rotation.order.filter((x) => x !== mine.pid)];
    team.rotation.minutes[mine.pid] = 30;
    const g = l.schedule.find((x) => !x.played && x.type === 'regular' && (x.home === U || x.away === U))!;
    const res = playGame(l, g);
    const line = (res.home.tid === U ? res.home : res.away).players.find((b) => b.pid === mine.pid);
    expect(line?.dnp).toBe('Two-way limit');
    expect(seasonGames(mine, l.season)).toBe(TWO_WAY_GAMES);
    // converted, he plays again
    expect(convertTwoWay(l, mine.pid).ok).toBe(true);
    expect(twoWayLimitReached(l, mine)).toBe(false);
    expect(buildSimInput(l, U, l.day, 'regular', AI).rest ?? []).not.toContain(mine.pid);
  });

  it('the user hears at 40 games and at 50', () => {
    const l = league('regular');
    const p = twoWay(l, U, 39);
    const team = l.teams[U];
    team.rotation.manual = true;
    team.rotation.order = [p.pid, ...team.rotation.order.filter((x) => x !== p.pid)];
    team.rotation.minutes[p.pid] = 30;
    const g = l.schedule.find((x) => !x.played && x.type === 'regular' && (x.home === U || x.away === U))!;
    playGame(l, g);
    expect(seasonGames(p, l.season)).toBe(40);
    expect(l.inbox[0].subject).toMatch(/: 10 two-way games left/);
    statsLine(p, l.season, U, false).gp = 50;
    twoWayGamesNote(l, p);
    expect(l.inbox[0].subject).toMatch(/reached the two-way limit/);
    const n = l.inbox.length;
    statsLine(p, l.season, U, false).gp = 45;
    twoWayGamesNote(l, p);
    expect(l.inbox.length).toBe(n);
  });

  it('an AI team converts a two-way player it leans on when it has a roster spot, and sits him otherwise', () => {
    const l = league('regular');
    while (standardRoster(l, AI).length > 14) standardRoster(l, AI)[0].tid = FREE_AGENT;
    const relied = twoWay(l, AI, TWO_WAY_GAMES, TWO_WAY_GAMES * 14);
    aiTwoWayLimits(l);
    expect(relied.contract.twoWay).toBeUndefined();
    expect(standardRoster(l, AI).length).toBe(15);
    // a full roster, or a player it hardly plays: he sits
    const other = twoWay(l, AI, TWO_WAY_GAMES, TWO_WAY_GAMES * 14);
    const spare = twoWay(l, 2, TWO_WAY_GAMES, TWO_WAY_GAMES * 4);
    while (standardRoster(l, 2).length > 14) standardRoster(l, 2)[0].tid = FREE_AGENT;
    aiTwoWayLimits(l);
    expect(other.contract.twoWay).toBe(true);
    expect(spare.contract.twoWay).toBe(true);
    expect(teamPlayers(l, AI).filter((x) => x.contract.twoWay).length).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  it('keep the taxpayer mid-level season, a recorded tax bill and the buyout mark, and drop damaged ones', () => {
    const l = league('regular');
    const s = l.season;
    const [a, b] = Object.values(l.players).filter((p) => p.tid === FREE_AGENT);
    l.teams[0].tmleSeason = s;
    l.teams[1].tmleSeason = 'x' as never;
    teamSeason(l.teams[0], s).tax = 12_500;
    teamSeason(l.teams[1], s).tax = -5;
    teamSeason(l.teams[2], s).tax = 1.5;
    a.waivedSalary = { season: s, salary: 20_000 };
    b.waivedSalary = { season: 'x', salary: 20_000 } as never;
    const back = migrate(JSON.parse(JSON.stringify(l)) as League);
    expect([back.teams[0].tmleSeason, back.teams[1].tmleSeason]).toEqual([s, undefined]);
    expect([0, 1, 2].map((tid) => back.teams[tid].seasons.find((x) => x.season === s)?.tax)).toEqual([12_500, undefined, undefined]);
    expect([back.players[a.pid].waivedSalary, back.players[b.pid].waivedSalary]).toEqual([{ season: s, salary: 20_000 }, undefined]);
    expect(migrate(structuredClone(back))).toEqual(back);
  });

  it('keeps an offer sheet on the taxpayer mid-level', () => {
    const l = league('freeAgency');
    const p = freeAgent(l, 72);
    p.rfa = { tid: 2, qo: 3_000, hold: 3_000, sheet: { tid: U, amount: 4_000, years: 2, route: 'tmle', day: 1, until: 2 } };
    const back = migrate(JSON.parse(JSON.stringify(l)) as League);
    expect(back.players[p.pid].rfa?.sheet?.route).toBe('tmle');
  });
});
