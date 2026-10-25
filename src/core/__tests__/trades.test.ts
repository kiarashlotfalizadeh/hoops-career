// Trades: AI valuation (consolidation, strategy lenses, liabilities, picks) and the reasons behind
// its verdict; the rules a deal has to pass (picks, trading back, signing locks, aprons, salary
// tiers, traded player exceptions, roster limits); and deal terms beyond players and picks
// (protections, pick swaps, cash). Fictional leagues with hand-shaped players keep these fast and
// deterministic: each scenario builds the league it needs.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { startRegularSeason } from '../league/season';
import { CAP_FOR, contractSeason, curTeamSeason, dateToDay, freeAgents, payroll, prospects, standardRoster, twoWayRoster } from '../league/helpers';
import { DEC_15, askingContract, marketSalary, releaseDeadMoney, releasePlayer, signPlayer, tradeValue, twoWaySalary, valueScore } from '../league/contracts';
import { capPayroll } from '../league/freeAgency';
import {
  CASH_PCT,
  PROTECTIONS,
  bestTpe,
  bookTradedCash,
  capSalary,
  cashRoom,
  cashValueFor,
  dealTerms,
  evaluateTrade,
  executeTrade,
  neutralSplit,
  pickLabel,
  pickTermsNote,
  pickValue,
  pickValueFor,
  playerValueFor,
  salaryMatchGap,
  swapOutlook,
  swapPicks,
  swapSeasons,
  teamAccepts,
  topOdds,
  tradeHeadline,
  tradeMatchLimit,
  tradeRoster,
  untradeableReason,
  validateTrade,
  type TradeOffer,
  type TradeSide,
} from '../league/trades';
import { canMakeWork, counterOffers, makeItWork } from '../league/tradeHelp';
import { neutralBalance } from '../league/tradePackages';
import { draftPlayer, ensureFuturePicks, runLottery } from '../league/draft';
import { shareRevenue } from '../league/finances';
import { signOfferSheet } from '../league/rfa';
import { txnLine, txnText } from '../league/transactions';
import { CAP } from '../constants';
import { contractExp } from '../playerGen';
import { Rng } from '../random';
import type { DraftPick, League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;
const THIRD = 2;

function txLeague(rngSeed = 5): League {
  return createLeague({ name: `tx${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
}

function negLeague(rngSeed = 5): League {
  const l = createLeague({ name: `neg${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.settings.difficulty = 'normal';
  return l;
}

function termsLeague(rngSeed = 5): League {
  const l = createLeague({ name: `terms${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // a fixed id: the lottery breaks ties on it
  l.id = `terms${rngSeed}`;
  l.settings.difficulty = 'normal';
  l.phase = 'regular';
  l.day = 0;
  for (const t of l.teams) t.strategy = 'retool';
  return l;
}

/** Give a player a known value: OVR = POT, age, healthy, and a contract at his market price unless `salary` is set. */
function shapeAt(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary ?? marketSalary(l, p)) };
  return p;
}

/** shapeAt, and with his team for years: full Bird rights. */
function shape(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  shapeAt(l, p, ovr, age, salary, years);
  p.birdSince = l.season - 4;
  return p;
}

/** This season's prospects still on the board, most valuable first. */
const prospectsBy = (l: League) => prospects(l, l.season).sort((a, b) => valueScore(l, b) - valueScore(l, a));

const offer = (give: number[], get: number[], giveDp: number[] = [], getDp: number[] = [], tid = AI): TradeOffer => ({
  a: { tid: U, pids: give, dpids: giveDp },
  b: { tid, pids: get, dpids: getDp },
});

const texts = (l: League, o: TradeOffer) => evaluateTrade(l, o).notes.map((n) => n.text);

const side = (tid: number, x: Partial<TradeSide> = {}): TradeSide => ({ tid, pids: [], dpids: [], ...x });
const deal = (a: Partial<TradeSide>, b: Partial<TradeSide> = {}, tid = AI): TradeOffer => ({ a: side(U, a), b: side(tid, b) });
const own = (l: League, tid: number, season: number, round: 1 | 2 = 1) => l.draftPicks.find((d) => d.originalTid === tid && d.season === season && d.round === round)!;

/** Set a team's record (and whether it made the playoffs) for this season. */
function record(l: League, tid: number, won: number, lost: number, playoffs = false) {
  const ts = curTeamSeason(l, tid);
  ts.won = won;
  ts.lost = lost;
  ts.playoffRound = playoffs ? 1 : -1;
}

it("valuation and the AI's verdict: talent over depth, strategy lenses within 15%, liabilities, picks, injuries, the tax, easy mode, options, and the reasons it gives", () => {
  // rejects bundles of good players for a star, but takes a fair one-for-one (T3)
  {
    const l = txLeague();
    l.teams[AI].strategy = 'retool';
    const star = shape(l, standardRoster(l, AI)[0], 90, 27);
    const four = standardRoster(l, U)
      .slice(0, 4)
      .map((p) => shape(l, p, 84, 27));
    const sum = four.reduce((a, p) => a + tradeValue(l, p), 0);
    // more raw value than the star, but depth counts for less than talent
    expect(sum).toBeGreaterThan(tradeValue(l, star));
    expect(
      evaluateTrade(
        l,
        offer(
          four.map((p) => p.pid),
          [star.pid],
        ),
      ).accept,
    ).toBe(false);
    const equal = shape(l, standardRoster(l, U)[4], 90, 27);
    expect(evaluateTrade(l, offer([equal.pid], [star.pid])).accept).toBe(true);
  }

  // keeps every team within 15% of neutral value, so stars can't be bought low and sold high (T4)
  {
    const l = txLeague();
    const vet = shape(l, standardRoster(l, AI)[0], 86, 33);
    l.teams[AI].strategy = 'rebuild';
    l.teams[2].strategy = 'contend';
    const neutral = tradeValue(l, vet);
    expect(tradeValue(l, vet, 'rebuild')).toBeLessThan(neutral * 0.85);
    expect(tradeValue(l, vet, 'contend')).toBeGreaterThan(neutral * 1.15);
    // a rebuilder sells him to the user at neutral value, to another AI team down to 85%
    expect(playerValueFor(l, vet, AI, false)).toBeCloseTo(neutral);
    expect(playerValueFor(l, vet, AI, false, true)).toBeCloseTo(neutral * 0.85);
    expect(playerValueFor(l, vet, 2, true)).toBeCloseTo(neutral * 1.15);
    // once he has changed hands this season he is worth neutral value to everyone
    vet.tradedFrom = { tid: 3, season: l.season };
    expect(playerValueFor(l, vet, 2, true)).toBeCloseTo(neutral);
  }

  // keeps a liability within 15% of neutral the same way: no team takes one in as a bigger burden than it sees
  {
    const l = txLeague();
    l.phase = 'regular';
    // an overpaid 76 at 31: a burden to the league, worth having to a contender, a bigger burden to a rebuilder
    const bad = shape(l, standardRoster(l, AI)[0], 76, 31, Math.round(CAP_FOR(l).salaryCap * 0.25), 4);
    const neutral = tradeValue(l, bad);
    expect(neutral).toBeLessThan(0);
    expect(tradeValue(l, bad, 'contend')).toBeGreaterThan(0);
    expect(tradeValue(l, bad, 'rebuild')).toBeLessThan(neutral * 1.15);
    // coming in: a retooling team's own (neutral) view, and a contender's at most 15% better than neutral
    l.teams[2].strategy = 'retool';
    expect(playerValueFor(l, bad, 2, true)).toBeCloseTo(neutral);
    l.teams[2].strategy = 'contend';
    expect(playerValueFor(l, bad, 2, true)).toBeCloseTo(neutral * 0.85);
    // going out: a rebuilder dumps him on the user at neutral, on another AI team for up to 115%
    l.teams[AI].strategy = 'rebuild';
    expect(playerValueFor(l, bad, AI, false)).toBeCloseTo(neutral);
    expect(playerValueFor(l, bad, AI, false, true)).toBeCloseTo(neutral * 1.15);
  }

  // doesn't pay to buy a rebuilder's veteran with picks and sell him to a contender for its picks (T1)
  {
    const l = txLeague();
    l.phase = 'regular';
    l.settings.difficulty = 'normal';
    const C = 2;
    l.teams[AI].strategy = 'rebuild';
    l.teams[C].strategy = 'contend';
    // a near-minimum salary keeps the 125% rule out of the way
    const vet = shape(l, standardRoster(l, AI)[0], 78, 33, 50);
    // the price in (neutral) pick value: what the rebuilder asks for him, then what the contender pays
    const mine = l.draftPicks.find((d) => d.tid === U && d.round === 1)!;
    const buy = evaluateTrade(l, offer([], [vet.pid], [mine.dpid]));
    const price = (buy.valueOut / buy.valueIn) * pickValue(l, mine);
    vet.tid = U;
    vet.tradedFrom = { tid: AI, season: l.season };
    const theirs = l.draftPicks.find((d) => d.tid === C && d.round === 1)!;
    const sale = evaluateTrade(l, { a: { tid: U, pids: [vet.pid], dpids: [] }, b: { tid: C, pids: [], dpids: [theirs.dpid] } });
    const proceeds = (sale.valueIn / sale.valueOut) * pickValue(l, theirs);
    // the rebuilder's 15% premium on picks at most (rebuilders sold at 85%, contenders paid 115% in
    // their own picks valued at 85%: 1.8x a round trip)
    expect(proceeds / price).toBeLessThan(1.16);
    expect(proceeds / price).toBeGreaterThan(1);
  }

  // values bad contracts below zero and charges for absorbing them (T7)
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l);
    const bad = shape(l, standardRoster(l, U)[0], 66, 31, Math.round(cap.salaryCap * 0.25), 4);
    expect(tradeValue(l, bad)).toBeLessThan(0);
    // nobody takes him for nothing...
    expect(evaluateTrade(l, offer([bad.pid], [])).accept).toBe(false);
    // ...but an AI happily dumps its own on us
    const theirs = shape(l, standardRoster(l, AI)[0], 66, 31, Math.round(cap.salaryCap * 0.25), 4);
    expect(teamAccepts(l, offer([], [theirs.pid]), AI)).toBe(true);
  }

  // charges the luxury tax a deal adds
  {
    const l = txLeague();
    l.phase = 'regular';
    const p = shape(l, standardRoster(l, U)[0], 78, 27, 20_000);
    const under = evaluateTrade(l, offer([p.pid], [])).delta;
    l.teams[AI].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).luxuryTax });
    expect(evaluateTrade(l, offer([p.pid], [])).delta).toBeLessThan(under - 2);
  }

  // discounts injured players by the share of the season they miss, most for contenders (T9)
  {
    const l = txLeague();
    l.phase = 'regular';
    const p = shape(l, standardRoster(l, AI)[0], 90, 28);
    const healthy = { contend: tradeValue(l, p, 'contend'), rebuild: tradeValue(l, p, 'rebuild') };
    p.injury = { type: 'Torn ACL', gamesRemaining: 100, gamesTotal: 100, severity: 'severe' };
    expect(tradeValue(l, p, 'contend')).toBeLessThan(healthy.contend * 0.5);
    expect(tradeValue(l, p, 'rebuild') / healthy.rebuild).toBeGreaterThan(tradeValue(l, p, 'contend') / healthy.contend);
    // a player under max level asks less for it (a star worth the max still asks it: see askingContract)
    const q = shape(l, standardRoster(l, AI)[1], 80, 28);
    const ask = askingContract(l, q).amount;
    q.injury = { type: 'Torn ACL', gamesRemaining: 100, gamesTotal: 100, severity: 'severe' };
    expect(askingContract(l, q).amount).toBeLessThan(ask);
  }

  // caps an AI at two outgoing first-round picks per deal (T4)
  {
    const l = txLeague();
    l.phase = 'regular';
    ensureFuturePicks(l, l.season + 6);
    // spread over non-consecutive drafts, and salaries matched with a minimum player each way
    const firsts = l.draftPicks.filter((d) => d.tid === AI && d.round === 1 && (d.season - l.season) % 2 === 0).slice(0, 3);
    const vetMin = CAP_FOR(l).vetMin;
    const star = shape(l, standardRoster(l, U)[0], 95, 25, vetMin);
    const filler = shape(l, standardRoster(l, AI)[0], 60, 30, vetMin);
    const ev = evaluateTrade(
      l,
      offer(
        [star.pid],
        [filler.pid],
        [],
        firsts.map((d) => d.dpid),
      ),
    );
    expect(ev.ok).toBe(true);
    expect(ev.accept).toBe(false);
    expect(ev.message).toMatch(/first-round picks/);
  }

  // prices this year's picks like the prospect they become, protections included (T5)
  {
    const l = txLeague();
    l.phase = 'draftLottery';
    runLottery(l, new Rng(3));
    const picks = l.draftPicks.filter((d) => d.season === l.season && d.round === 1).sort((a, b) => a.pick! - b.pick!);
    const first = pickValue(l, picks[0]);
    expect(first).toBeGreaterThan(pickValue(l, picks[14]));
    expect(pickValue(l, picks[14])).toBeGreaterThan(pickValue(l, picks[29]));
    // the #1 pick is worth a good starter, not a throw-in
    expect(first).toBeGreaterThan(20);
    const future = l.draftPicks.find((d) => d.season === l.season + 2 && d.round === 1)!;
    const before = pickValue(l, future);
    future.protection = 10;
    future.tid = future.originalTid === U ? AI : U;
    expect(pickValue(l, future)).toBeLessThan(before);
  }

  // keeps a pick worth the same from one season into the next, and on the clock worth the player it becomes
  {
    const l = txLeague();
    const firsts = (season: number) => l.draftPicks.filter((d) => d.season === season && d.round === 1).reduce((a, d) => a + pickValue(l, d), 0);
    // this season's firsts in the preseason, priced on the class, against next season's as free
    // agency ends, priced on the slot curve: three months closer to their draft, and a class
    // better or worse than most, but no more the jump of 50% or more at the new season
    const now = firsts(l.season);
    l.phase = 'freeAgency';
    l.day = dateToDay(l.season, 6, 25);
    const summer = firsts(l.season + 1);
    expect(now / summer).toBeGreaterThan(0.95);
    expect(now / summer).toBeLessThan(1.3);
    // draft night: the pick on the clock is worth the player taken with it
    l.phase = 'draftLottery';
    l.day = dateToDay(l.season, 5, 25);
    runLottery(l, new Rng(3));
    l.phase = 'draft';
    for (const dp of l.draftPicks.filter((d) => d.season === l.season && d.round === 1 && d.pick! <= 3).sort((a, b) => a.pick! - b.pick!)) {
      const value = pickValue(l, dp);
      const best = prospectsBy(l)[0];
      draftPlayer(l, dp, best.pid);
      expect(tradeValue(l, best) / value).toBeCloseTo(1, 1);
    }
  }

  // doesn't count a player named twice in a deal (a deep link can repeat one)
  {
    const l = txLeague();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const mine = shape(l, standardRoster(l, U)[0], 80, 27, vetMin);
    const theirs = shape(l, standardRoster(l, AI)[0], 84, 27, vetMin);
    expect(evaluateTrade(l, offer([mine.pid], [theirs.pid])).accept).toBe(false);
    const twice = evaluateTrade(l, offer([mine.pid, mine.pid], [theirs.pid]));
    expect([twice.ok, twice.accept]).toEqual([false, false]);
    expect(twice.message).toMatch(/twice/);
  }

  // gives an easy-mode player's own assets the easy discount, but not ones he just traded for
  {
    const l = txLeague();
    l.settings.difficulty = 'easy';
    l.phase = 'regular';
    l.teams[2].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const mine = shape(l, standardRoster(l, U)[0], 80, 27, vetMin);
    const better = shape(l, standardRoster(l, 2)[0], 80.4, 27, vetMin);
    const deal: TradeOffer = { a: { tid: U, pids: [mine.pid], dpids: [] }, b: { tid: 2, pids: [better.pid], dpids: [] } };
    // a few percent short of fair value: fine on easy from his own roster...
    expect(tradeValue(l, better) / tradeValue(l, mine)).toBeLessThan(1.1);
    expect(evaluateTrade(l, deal).accept).toBe(true);
    // ...but once he arrived in a trade this season, flipping him on is judged at fair value
    mine.tradedFrom = { tid: AI, season: l.season };
    expect(evaluateTrade(l, deal).accept).toBe(false);
  }

  // a player option is settled before he can be traded after the season; a team option is never a burden then
  {
    const l = txLeague();
    const p = shape(l, standardRoster(l, U)[0], 84, 27, 8_000, 2);
    p.contract = { start: l.season, salaries: [8_000, 8_000], option: 'player' };
    const pick = l.draftPicks.find((d) => d.tid === AI && d.round === 2)!;
    const sell = offer([p.pid], [], [], [pick.dpid]);
    l.phase = 'regular';
    expect(validateTrade(l, sell).some((e) => /player option/.test(e))).toBe(false);
    l.phase = 'draft';
    // an underpaid star is about to opt out: he can't be sold at full value first
    expect(validateTrade(l, sell).some((e) => /player option/.test(e))).toBe(true);
    p.contract.option = 'team';
    expect(validateTrade(l, sell).some((e) => /player option/.test(e))).toBe(false);
    // an overpaid team option can be declined, so its year is never a liability: in season only
    // this season's salary counts against him, after the season nothing does
    const bust = shape(l, standardRoster(l, AI)[0], 62, 30, 30_000, 2);
    bust.contract = { start: l.season, salaries: [30_000, 30_000], option: 'team' };
    l.phase = 'regular';
    const withOption = tradeValue(l, bust);
    expect(withOption).toBeLessThan(0);
    delete bust.contract.option;
    expect(tradeValue(l, bust)).toBeLessThan(withOption);
    bust.contract.option = 'team';
    l.phase = 'draft';
    expect(tradeValue(l, bust)).toBeGreaterThan(0);
    // nor is it dead money: a release leaves only the season under way on the books
    expect(releaseDeadMoney(l, bust)).toEqual([]);
    l.phase = 'regular';
    expect(releaseDeadMoney(l, bust).map((d) => d.season)).toEqual([l.season]);
  }

  // counts two-way pay out of trade salary (T13)
  {
    const l = txLeague();
    const tw = twoWayRoster(l, U)[0];
    expect(tw).toBeDefined();
    expect(capSalary(l, tw.pid)).toBe(0);
  }

  // adds up its verdict from the parts it reports
  {
    const l = negLeague();
    expect(startRegularSeason(l)).toEqual([]);
    const r = new Rng(4);
    for (let i = 0; i < 60; i++) {
      const b = 1 + r.int(0, 28);
      const o = offer(
        r
          .shuffle(standardRoster(l, U))
          .slice(0, r.int(0, 2))
          .map((p) => p.pid),
        r
          .shuffle(standardRoster(l, b))
          .slice(0, r.int(1, 2))
          .map((p) => p.pid),
        [],
        [],
        b,
      );
      const ev = evaluateTrade(l, o);
      const x = ev.parts;
      expect(ev.valueIn).toBeCloseTo(x.playersIn + x.picksIn - x.money - x.cut, 9);
      expect(ev.valueOut).toBeCloseTo(x.playersOut + x.picksOut, 9);
      expect(ev.delta).toBeCloseTo(ev.valueIn - ev.valueOut - x.slack, 9);
      expect(x.incoming.map((a) => a.id)).toEqual(o.a.pids);
      expect(x.outgoing.map((a) => a.id)).toEqual(o.b.pids);
    }
  }

  // says when taking on salary puts them into the luxury tax, and what it costs
  {
    const l = negLeague();
    l.phase = 'regular';
    const p = shapeAt(l, standardRoster(l, U)[0], 74, 27, 20_000);
    const tax = CAP_FOR(l).luxuryTax;
    // $1M under the tax line before the deal
    l.teams[AI].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: tax - capPayroll(l, AI, l.season) - 1_000 });
    const ev = evaluateTrade(l, offer([p.pid], []));
    expect(ev.parts.taxCost).toBeGreaterThan(0);
    expect(ev.parts.payAfter - tax).toBeCloseTo(19_000, 0);
    const note = ev.notes.find((n) => /tax/.test(n.text));
    expect(note).toEqual({ tone: 'bad', text: 'Taking on $20.0M puts them $19.0M into the tax' });
    // already over it: how far over the deal takes them
    l.teams[AI].deadMoney.push({ pid: -2, name: 'y', season: l.season, amount: 5_000 });
    expect(texts(l, offer([p.pid], []))).toContain('Taking on $20.0M takes them to $24.0M over the tax line');
    // and shedding salary over the line saves them tax
    const theirs = shapeAt(l, standardRoster(l, AI)[0], 70, 27, 15_000);
    expect(texts(l, offer([], [theirs.pid])).some((t) => /^Shedding \$15\.0M saves them \$[\d.]+M in luxury tax$/.test(t))).toBe(true);
  }

  // gives a rebuilder's and a contender's view of picks for a veteran
  {
    const l = negLeague();
    l.phase = 'regular';
    const vet = shapeAt(l, standardRoster(l, AI)[0], 78, 31, CAP_FOR(l).vetMin);
    const firsts = l.draftPicks
      .filter((d) => d.tid === U && d.round === 1 && d.season > l.season)
      .sort((a, b) => a.season - b.season)
      .filter((_, i) => i % 2 === 0)
      .slice(0, 2)
      .map((d) => d.dpid);
    const deal = offer([], [vet.pid], firsts);
    l.teams[AI].strategy = 'rebuild';
    expect(evaluateTrade(l, deal).notes).toContainEqual({ tone: 'good', text: 'Picks count extra for them' });
    l.teams[AI].strategy = 'contend';
    expect(evaluateTrade(l, deal).notes).toContainEqual({ tone: 'bad', text: "Picks don't help them win now" });
    l.teams[AI].strategy = 'retool';
    expect(texts(l, deal).filter((t) => /Picks/.test(t))).toEqual([]);
    // a veteran coming in is worth less to a rebuilder
    l.teams[AI].strategy = 'rebuild';
    const mine = shapeAt(l, standardRoster(l, U)[0], 80, 31, CAP_FOR(l).vetMin);
    const young = shapeAt(l, standardRoster(l, AI)[1], 74, 23, CAP_FOR(l).vetMin);
    expect(texts(l, offer([mine.pid], [young.pid]))).toContain(`${mine.firstName} ${mine.lastName} (31) is worth less to a rebuilder`);
  }

  // warns you when you'd give up much more than you get, even when they say yes
  {
    const l = negLeague();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const star = shapeAt(l, standardRoster(l, U)[0], 88, 26, vetMin);
    const scrub = shapeAt(l, standardRoster(l, AI)[0], 66, 30, vetMin);
    const ev = evaluateTrade(l, offer([star.pid], [scrub.pid]));
    expect(ev.accept).toBe(true);
    expect(ev.notes[0].tone).toBe('warn');
    expect(ev.notes[0].text).toMatch(/^By neutral value you'd give up /);
    // a fair one-for-one has no such warning
    const equal = shapeAt(l, standardRoster(l, AI)[1], 88, 26, vetMin);
    expect(evaluateTrade(l, offer([star.pid], [equal.pid])).notes.filter((n) => n.tone === 'warn')).toEqual([]);
    // turned down on value, it always says how far apart the sides are as they see it, first
    const mineScrub = shapeAt(l, standardRoster(l, U)[1], 64, 31, vetMin);
    const lop = evaluateTrade(l, offer([mineScrub.pid], [equal.pid]));
    expect(lop.message).toBe('Not even close.');
    expect(lop.notes[0]).toEqual({
      tone: 'bad',
      text: expect.stringMatching(new RegExp(`^They value ${equal.firstName} ${equal.lastName} about \\d+× ${mineScrub.firstName} ${mineScrub.lastName}$`)),
    });
    // a deal they take says nothing of the kind
    expect(ev.notes.some((n) => /^They value /.test(n.text))).toBe(false);
  }

  // names depth for talent, waivers in the offseason and the two-firsts limit
  {
    const l = negLeague();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const star = shapeAt(l, standardRoster(l, AI)[0], 90, 27, vetMin);
    const four = standardRoster(l, U)
      .slice(0, 4)
      .map((p) => shapeAt(l, p, 82, 27, vetMin).pid);
    expect(evaluateTrade(l, offer(four, [star.pid])).notes).toContainEqual({ tone: 'bad', text: "Depth doesn't add up to talent for them" });
    // after the season, with 15 under contract for next season: four players in for one is three to waive
    l.phase = 'draft';
    for (const p of standardRoster(l, AI)) if (contractExp(p.contract) < contractSeason(l)) shapeAt(l, p, 70, 27, vetMin, 3);
    while (tradeRoster(l, AI).length < CAP.rosterMax) {
      const p = freeAgents(l)[0];
      p.tid = AI;
      shapeAt(l, p, 70, 27, vetMin, 3);
    }
    for (const pid of four) shapeAt(l, l.players[pid], 82, 27, vetMin, 3);
    shapeAt(l, star, 90, 27, vetMin, 3);
    const ev = evaluateTrade(l, offer(four, [star.pid]));
    expect(ev.parts.cuts).toBe(3);
    expect(ev.notes.map((n) => n.text)).toContain("They'd have to waive 3 players to get down to 15");
    // the two-firsts limit
    l.phase = 'regular';
    ensureFuturePicks(l, l.season + 6);
    const firsts = l.draftPicks.filter((d) => d.tid === AI && d.round === 1 && (d.season - l.season) % 2 === 0).slice(0, 3);
    expect(
      evaluateTrade(
        l,
        offer(
          [four[0]],
          [],
          [],
          firsts.map((d) => d.dpid),
        ),
      ).notes,
    ).toContainEqual({ tone: 'bad', text: 'No team gives up more than 2 first-round picks in one deal' });
  }
}, 120_000);

it('the rules: back-to-back firsts, protections going home, no trading straight back, signing locks, aprons and matching tiers, traded player exceptions, roster and two-way limits, the news line', () => {
  // won't leave a team without firsts in back-to-back drafts (Stepien rule)
  {
    const l = txLeague();
    l.phase = 'regular';
    const own = l.draftPicks.filter((d) => d.tid === U && d.round === 1 && d.season >= l.season + 1).sort((a, b) => a.season - b.season);
    expect(validateTrade(l, offer([], [], [own[0].dpid, own[1].dpid])).some((e) => /back-to-back/.test(e))).toBe(true);
    expect(validateTrade(l, offer([], [], [own[0].dpid, own[2].dpid])).some((e) => /back-to-back/.test(e))).toBe(false);
  }

  // drops a protection once the pick is back with its original team, and keeps one landing inside it home
  {
    const l = txLeague();
    const dp = l.draftPicks.find((d) => d.originalTid === AI && d.season === l.season + 1 && d.round === 1)!;
    dp.tid = U;
    dp.protection = 10;
    executeTrade(l, offer([], [], [dp.dpid]));
    expect([dp.tid, dp.protection]).toEqual([AI, undefined]);
    // a protected pick that lands inside its protection stays home, and the obligation ends
    const now = l.draftPicks.find((d) => d.originalTid === AI && d.season === l.season && d.round === 1)!;
    now.tid = U;
    now.protection = 30;
    l.phase = 'draftLottery';
    runLottery(l, new Rng(3));
    expect([now.tid, now.protection]).toEqual([AI, undefined]);
  }

  // won't take a player or pick straight back from the team it traded him to, until next season
  {
    const l = txLeague();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const a = shape(l, standardRoster(l, U)[0], 78, 27, vetMin);
    const b = shape(l, standardRoster(l, AI)[0], 78, 27, vetMin);
    const pick = l.draftPicks.find((d) => d.tid === U && d.round === 2)!;
    const there = offer([a.pid], [b.pid], [pick.dpid]);
    expect(evaluateTrade(l, there).accept).toBe(true);
    executeTrade(l, there);
    // on easy a there-and-back pair would pay out a sweetener every time
    const back = offer([b.pid], [a.pid], [], [pick.dpid]);
    expect(validateTrade(l, back).filter((e) => /can't get (him|it) back/.test(e)).length).toBe(3);
    // nor does a pick come straight back as the player it became
    l.phase = 'draft';
    const first = l.draftPicks.find((d) => d.tid === AI && d.round === 1 && d.season === l.season)!;
    first.pick = 10;
    executeTrade(l, offer([], [], [], [first.dpid]));
    const rookie = Object.values(l.players).find((p) => p.tid === -2 && p.draft.year === l.season)!;
    draftPlayer(l, first, rookie.pid);
    expect(validateTrade(l, offer([rookie.pid], [])).some((e) => /can't get him back/.test(e))).toBe(true);
    l.season++;
    expect(validateTrade(l, back).filter((e) => /back until next season/.test(e))).toEqual([]);
  }

  // nor through a third team: every team that traded him away this season waits for next season
  {
    const l = txLeague();
    l.phase = 'regular';
    const C = 2;
    const p = shape(l, standardRoster(l, U)[0], 74, 27, CAP_FOR(l).vetMin);
    const pick = l.draftPicks.find((d) => d.tid === U && d.round === 2)!;
    executeTrade(l, offer([p.pid], [], [pick.dpid]));
    executeTrade(l, { a: { tid: AI, pids: [p.pid], dpids: [pick.dpid] }, b: { tid: C, pids: [], dpids: [] } });
    const back = (tid: number) =>
      validateTrade(l, { a: { tid, pids: [], dpids: [] }, b: { tid: C, pids: [p.pid], dpids: [pick.dpid] } }).filter((e) => /can't get (him|it) back/.test(e)).length;
    expect([back(U), back(AI), back(3)]).toEqual([2, 2, 0]);
    l.season++;
    expect([back(U), back(AI)]).toEqual([0, 0]);
  }

  // a released player can be traded for again once he signs elsewhere: the trade-back rule leaves with his contract
  {
    const l = txLeague();
    l.phase = 'regular';
    const p = shape(l, standardRoster(l, U)[0], 74, 27, CAP_FOR(l).vetMin);
    executeTrade(l, offer([p.pid], []));
    releasePlayer(l, p, { news: false });
    signPlayer(l, p, 2, CAP_FOR(l).vetMin, 1, { news: false });
    // past his new team's trade lock
    l.day = 120;
    expect(
      validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: 2, pids: [p.pid], dpids: [] } }).filter((e) => /can't get (him|it) back|signed recently/.test(e)),
    ).toEqual([]);
  }

  // doesn't trade a signing before December 15, or three months after an in-season signing
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    const summer = freeAgents(l)[0];
    signPlayer(l, summer, U, CAP_FOR(l).vetMin, 1, { start: l.season + 1, news: false });
    expect(validateTrade(l, offer([summer.pid], [])).some((e) => /signed recently/.test(e))).toBe(true);
    // a summer signing waits until December 15 of his first season
    l.season++;
    l.phase = 'regular';
    l.day = DEC_15 - 1;
    expect(untradeableReason(l, summer)).toMatch(/Dec 15/);
    l.day = DEC_15;
    expect(untradeableReason(l, summer)).toBeNull();
    // so does a training-camp signing (not three months from the preseason, into January)
    l.phase = 'preseason';
    l.day = 0;
    const camp = freeAgents(l)[0];
    signPlayer(l, camp, U, CAP_FOR(l).vetMin, 1, { news: false });
    l.phase = 'regular';
    l.day = DEC_15;
    expect(untradeableReason(l, camp)).toBeNull();
    // in season, three months when that runs past December 15
    const fall = freeAgents(l)[0];
    l.day = 40;
    signPlayer(l, fall, U, CAP_FOR(l).vetMin, 1, { news: false });
    l.day = 129;
    expect(untradeableReason(l, fall)).not.toBeNull();
    l.day = 130;
    expect(untradeableReason(l, fall)).toBeNull();
  }

  // past the first apron a team takes back no more salary than it sends; past the second it combines no salaries and sends no cash
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l);
    // just under the first apron, taking a $10M player for a $9M one
    const mine = shape(l, standardRoster(l, U)[0], 70, 27, 9_000);
    const theirs = shape(l, standardRoster(l, AI)[0], 72, 27, 10_000);
    const to = (amount: number) => {
      l.teams[U].deadMoney = l.teams[U].deadMoney.filter((d) => d.pid !== -1);
      l.teams[U].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: amount - payroll(l, U) });
    };
    to(cap.firstApron - 5_000);
    const deal = offer([mine.pid], [theirs.pid]);
    expect(validateTrade(l, deal).filter((e) => /Salary doesn't match/.test(e))).toEqual([]);
    to(cap.firstApron - 500);
    expect(validateTrade(l, deal).find((e) => /Salary doesn't match/.test(e))).toMatch(/100% of \$9\.0M sent, over the first apron/);
    // sending out more than it takes back is always fine
    expect(validateTrade(l, offer([mine.pid], [])).filter((e) => /Salary doesn't match/.test(e))).toEqual([]);
    // over the second apron: two contracts can't add up to take back a bigger one, and no cash goes out
    const second = shape(l, standardRoster(l, U)[1], 66, 27, 2_000);
    theirs.contract.salaries = [10_500, 10_500];
    to(cap.secondApron + 5_000);
    expect(validateTrade(l, offer([mine.pid, second.pid], [theirs.pid])).some((e) => /can't combine salaries/.test(e))).toBe(true);
    expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [], cash: 1_000 }, b: { tid: AI, pids: [], dpids: [] } }).some((e) => /can't send cash/.test(e))).toBe(true);
  }

  // salary matching runs by tiers of what a team sends: 200% of a small salary, plus 4.85% of the cap in the middle, 125% of a big one
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l).salaryCap;
    const buf = Math.round((cap * CAP.tradeMatchBufferPct) / 10) * 10;
    expect(tradeMatchLimit(l, 0)).toBe(buf);
    expect(tradeMatchLimit(l, 5_000)).toBe(10_000 + buf);
    expect(tradeMatchLimit(l, 20_000)).toBe(20_000 + Math.round(cap * 0.0485));
    expect(tradeMatchLimit(l, 40_000)).toBe(50_000 + buf);
    expect(tradeMatchLimit(l, 40_000, l.season, true)).toBe(40_000);
    // a team under the cap before the deal can absorb up to its space plus the buffer: a dump into room just works
    const full = CAP_FOR(l);
    for (const [t, amount] of [
      [U, full.salaryCap + 20_000],
      [AI, full.salaryCap - 30_000],
    ] as const) {
      l.teams[t].deadMoney = [];
      l.teams[t].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: amount - payroll(l, t) });
    }
    const dumped = shape(l, standardRoster(l, U)[0], 72, 27, 30_000 + buf - 10);
    expect(validateTrade(l, offer([dumped.pid], [])).filter((e) => /Salary doesn't match/.test(e))).toEqual([]);
    expect(salaryMatchGap(l, offer([dumped.pid], []), 'b')).toBe(0);
    // past that, the error names its space, and sending back the rest dollar for dollar fixes it
    dumped.contract.salaries = [31_000];
    expect(validateTrade(l, offer([dumped.pid], [])).find((e) => /Salary doesn't match/.test(e))).toMatch(/its \$30\.0M of cap space/);
    expect(salaryMatchGap(l, offer([dumped.pid], []), 'b')).toBe(1_000 - buf);
  }

  // an over-the-cap team's trade that sends out more salary than it takes back leaves a traded player exception for a year, which absorbs a player later
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l);
    // AI over the cap (not near an apron) sends a $12M player for a $4M one to a team with room: an $8M exception
    for (const [t, amount] of [
      [U, cap.salaryCap - 20_000],
      [AI, cap.salaryCap + 10_000],
    ] as const) {
      l.teams[t].deadMoney = [];
      l.teams[t].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: amount - payroll(l, t) });
    }
    const big = shape(l, standardRoster(l, AI)[0], 72, 27, 12_000);
    const small = shape(l, standardRoster(l, U)[0], 70, 27, 4_000);
    const deal = offer([small.pid], [big.pid]);
    expect(validateTrade(l, deal)).toEqual([]);
    executeTrade(l, deal);
    expect(l.teams[AI].tpes).toEqual([{ amount: 8_000, season: l.season, day: l.day }]);
    expect(bestTpe(l, AI)).toBe(8_000);
    // it absorbs a $7M player with nothing going back, and is used up by what it took
    const target = shape(l, standardRoster(l, U)[1], 68, 27, 7_000);
    const dump = offer([target.pid], []);
    expect(validateTrade(l, dump)).toEqual([]);
    executeTrade(l, dump);
    expect(bestTpe(l, AI)).toBeLessThan(8_000);
    // a year on it's gone
    l.teams[AI].tpes = [{ amount: 8_000, season: l.season - 1, day: l.day }];
    expect(bestTpe(l, AI)).toBe(0);
  }

  // counts only next season's contracts against the 21-man offseason limit in trades
  {
    const l = txLeague();
    l.phase = 'draft';
    const cs = contractSeason(l);
    while (standardRoster(l, U).length < 21) signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l, cs).vetMin, 1, { news: false, start: cs });
    // three of them are up this summer: they are leaving or being re-signed, not taking a camp spot
    for (const p of standardRoster(l, U).slice(0, 3)) p.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    const theirs = standardRoster(l, AI).find((p) => contractExp(p.contract) >= cs)!;
    expect(validateTrade(l, offer([], [theirs.pid])).filter((e) => /players \(max/.test(e))).toEqual([]);
  }

  // after the season, an expiring two-way deal doesn't hold one of the three two-way slots in trades
  {
    const l = txLeague();
    l.phase = 'draft';
    const cs = contractSeason(l);
    // two expiring two-ways (the fictional league's) and one signed through next season
    signPlayer(
      l,
      freeAgents(l).find((p) => p.experience <= 2)!,
      U,
      twoWaySalary(l, cs),
      2,
      { start: cs, twoWay: true, news: false },
    );
    expect(twoWayRoster(l, U).length).toBe(3);
    const theirs = twoWayRoster(l, AI)[0];
    theirs.contract = { start: l.season, salaries: [twoWaySalary(l), twoWaySalary(l, cs)], twoWay: true };
    expect(validateTrade(l, offer([], [theirs.pid])).filter((e) => /two-way/.test(e))).toEqual([]);
    // in season all three hold a slot
    l.phase = 'regular';
    expect(validateTrade(l, offer([], [theirs.pid])).some((e) => /4 two-way players \(max 3\)/.test(e))).toBe(true);
  }

  // reads a one-sided deal as what it is: a dump taken off a team's hands, or picks bought for nothing
  {
    expect(tradeHeadline('Hornets', ['Terry Rozier', '2028 2nd'], 1, 'Timberwolves', [], 0)).toBe(
      "the Timberwolves take Terry Rozier off the Hornets' hands, with 2028 2nd for it",
    );
    expect(tradeHeadline('Kings', [], 0, 'Magic', ['Ben Simmons'], 1)).toBe("the Kings take Ben Simmons off the Magic's hands");
    expect(tradeHeadline('Kings', ['2029 2nd'], 0, 'Nets', [], 0)).toBe('the Nets get 2029 2nd from the Kings');
    expect(tradeHeadline('Raptors', ['Scottie Barnes'], 1, 'Knicks', ['Mikal Bridges'], 1)).toBe('the Raptors send Scottie Barnes to the Knicks for Mikal Bridges');
  }

  // an offer sheet a team has signed holds one of its spots: a trade can’t take it past the offseason limit
  {
    const l = termsLeague();
    l.phase = 'freeAgency';
    l.faDay = 1;
    const next = contractSeason(l);
    const cap = CAP_FOR(l, next);
    // the user's roster for next season at 20
    const mine = standardRoster(l, U);
    for (const p of mine) p.contract = { start: next, salaries: [cap.vetMin] };
    const extra = Object.values(l.players).filter((p) => p.tid === FREE_AGENT);
    for (const p of extra.slice(0, 20 - mine.length)) {
      p.tid = U;
      p.contract = { start: next, salaries: [cap.vetMin] };
    }
    expect(tradeRoster(l, U)).toHaveLength(20);
    const theirs = standardRoster(l, AI).find((p) => p.contract.salaries.length > 1)!;
    const o = deal({}, { pids: [theirs.pid] });
    const roster = () => validateTrade(l, o).filter((e) => e.includes('players (max'));
    expect(roster()).toEqual([]);
    // the user signs another team's restricted free agent to an offer sheet: it waits on his team
    const r = extra[30];
    r.rfa = { tid: THIRD, qo: cap.vetMin };
    signOfferSheet(l, r, U, cap.vetMin * 2, 2, 'min', 1);
    expect(roster()).toEqual([`${l.teams[U].abbrev} would have 22 players (max 21 in the offseason).`]);
    // sending one of yours fixes it, so "what would make this work?" is worth asking
    expect(validateTrade(l, o)).toHaveLength(1);
    expect(canMakeWork(l, o)).toBe(true);
  }
}, 120_000);

it('deal terms: protections on your own firsts, pick swaps and cash, and how they count in a deal (G1-G3)', () => {
  // protects your own first as it goes: valued lower by them, set on the pick, named in labels, the news and the log
  {
    const l = termsLeague();
    const dp = own(l, U, l.season + 1);
    const plain = deal({ dpids: [dp.dpid] });
    const prot = deal({ dpids: [dp.dpid], protect: { [dp.dpid]: 10 } });
    expect(validateTrade(l, prot)).toEqual([]);
    // the protected slots count for nothing to them: exactly the pick as it will be, top-10 protected in their hands
    const full = evaluateTrade(l, plain).parts.picksIn;
    const less = evaluateTrade(l, prot).parts.picksIn;
    expect(less).toBeLessThan(full);
    expect(less).toBeCloseTo(pickValueFor(l, { ...dp, tid: AI, protection: 10 }, AI, true), 9);
    // (the slots it keeps are its most valuable: the value falls by more than the odds)
    expect(less / full).toBeLessThan(1 - topOdds(l, dp, 10));
    executeTrade(l, prot);
    expect([dp.tid, dp.protection]).toEqual([AI, 10]);
    expect(pickValue(l, dp)).toBeCloseTo(evaluateTrade(l, deal({}, { dpids: [dp.dpid] })).parts.outgoing[0].neutral, 9);
    expect(pickLabel(l, dp)).toBe(`${dp.season} 1st (${l.teams[U].abbrev}) · top-10 prot.`);
    expect(pickTermsNote(l, dp)).toBe(`Stays with ${l.teams[U].abbrev} if it lands in the top 10.`);
    // frozen as the user sent it
    const txn = l.transactions!.at(-1)!;
    expect(txn.sides![0].picks).toEqual([`${dp.season} 1st · top-10 prot.`]);
    expect(txnText(l, txnLine(txn, { tid: AI }))).toBe(`Acquired a ${dp.season} 1st · top-10 prot. from ${l.teams[U].abbrev}`);
    expect(l.news.at(-1)!.text).toContain('top-10 prot.');
  }

  // only on your own first, before its order is set and outside any swap; anyone else's pick keeps its terms
  {
    const l = termsLeague();
    const mine = own(l, U, l.season + 1);
    const errs = (o: TradeOffer) => validateTrade(l, o);
    expect(errs(deal({ dpids: [mine.dpid], protect: { [mine.dpid]: 9 } }))).toContain('A protection covers the top 4, 8, 10, 14 or 20 picks.');
    expect(errs(deal({ dpids: [], protect: { [mine.dpid]: 10 } }))).toContain("A protection is set on a pick that isn't in the deal.");
    const second = own(l, U, l.season + 1, 2);
    expect(errs(deal({ dpids: [second.dpid], protect: { [second.dpid]: 10 } })).some((e) => /can only protect its own first-round picks/.test(e))).toBe(true);
    // a pick acquired from another team, protected or not, keeps its terms
    const theirs = own(l, THIRD, l.season + 2);
    theirs.tid = U;
    theirs.protection = 14;
    expect(errs(deal({ dpids: [theirs.dpid], protect: { [theirs.dpid]: 4 } })).some((e) => /can only protect its own/.test(e))).toBe(true);
    executeTrade(l, deal({ dpids: [theirs.dpid] }));
    expect([theirs.tid, theirs.protection]).toEqual([AI, 14]);
    // this season's order set by the lottery
    const now = own(l, U, l.season);
    now.pick = 12;
    expect(errs(deal({ dpids: [now.dpid], protect: { [now.dpid]: 14 } })).some((e) => /draft order is set/.test(e))).toBe(true);
    delete now.pick;
    // a first in a swap
    const y = l.season + 2;
    executeTrade(l, deal({ swaps: [y] }));
    const swapped = own(l, U, y);
    expect(errs(deal({ dpids: [swapped.dpid], protect: { [swapped.dpid]: 10 } })).some((e) => /part of a pick swap/.test(e))).toBe(true);
    expect(PROTECTIONS).toEqual([4, 8, 10, 14, 20]);
  }

  // asking for their pick protected costs them less to give up; a protected pick that lands inside it stays home
  {
    const l = termsLeague();
    const theirs = own(l, AI, l.season + 1);
    const cash = 5_000;
    const ev = (o: TradeOffer) => evaluateTrade(l, o);
    const plain = ev(deal({ cash }, { dpids: [theirs.dpid] }));
    const prot = ev(deal({ cash }, { dpids: [theirs.dpid], protect: { [theirs.dpid]: 20 } }));
    expect(prot.parts.picksOut).toBeLessThan(plain.parts.picksOut);
    expect(prot.delta).toBeGreaterThan(plain.delta);
    // this season's first, top-20 protected, through the lottery
    const now = own(l, U, l.season);
    executeTrade(l, deal({ dpids: [now.dpid], protect: { [now.dpid]: 20 } }));
    l.phase = 'draftLottery';
    runLottery(l, new Rng(3));
    expect(now.protection).toBeUndefined();
    expect(now.tid).toBe(now.pick! <= 20 ? U : AI);
  }

  // a protected pick going home is worth all of it to its original team, and only what it held to the team sending it
  {
    const l = termsLeague();
    record(l, AI, 5, 35);
    // the user holds AI's next first, top-10 protected, and sends it home
    const dp = own(l, AI, l.season + 1);
    dp.tid = U;
    dp.protection = 10;
    const o = deal({ dpids: [dp.dpid] });
    const full = pickValue(l, { ...dp, tid: AI, protection: undefined });
    const held = pickValue(l, dp);
    expect(held).toBeLessThan(full * 0.6);
    expect(evaluateTrade(l, o).parts.picksIn).toBeCloseTo(pickValueFor(l, { ...dp, tid: AI, protection: undefined }, AI, true), 6);
    expect(neutralBalance(l, o).out).toBeCloseTo(held, 6);
    executeTrade(l, o);
    expect([dp.tid, dp.protection]).toEqual([AI, undefined]);
  }

  // the dock says what a protection does, and a turned-down deal comes back without it
  {
    const l = termsLeague();
    const dp = own(l, U, l.season + 1);
    const prot = deal({ dpids: [dp.dpid], protect: { [dp.dpid]: 20 } }, { cash: cashRoom(l, AI).send });
    const [term] = dealTerms(l, prot).filter((t) => t.key.startsWith('p'));
    const odds = Math.round(topOdds(l, dp, 20) * 100);
    expect(term.text).toMatch(
      new RegExp(
        `^Top-20 protection: your ${dp.season} 1st stays yours if it lands in the top 20 \\(about ${odds}% likely on the current projection\\), and then nothing is owed\\. ${l.teams[AI].abbrev} count it \\d+% lower for that\\.$`,
      ),
    );
    // their cash for your first: fair unprotected, short protected
    expect(evaluateTrade(l, { ...prot, a: { ...prot.a, protect: {} } }).accept).toBe(true);
    expect(evaluateTrade(l, prot).accept).toBe(false);
    const counter = counterOffers(l, prot).find((c) => c.kind === 'remove' && /protection/.test(c.label));
    expect(counter?.label).toBe(`Without the top-20 protection on the ${pickLabel(l, dp)}`);
    expect(counter?.offer.a.protect).toEqual({});
    expect(evaluateTrade(l, counter!.offer).accept).toBe(true);
  }

  // needs both teams to hold their own firsts of that draft, unprotected, unswapped and not moving in the deal
  {
    const l = termsLeague();
    const y = l.season + 1;
    const ok = deal({ swaps: [y] });
    expect(validateTrade(l, ok)).toEqual([]);
    expect(swapSeasons(l, U, AI)).toContain(y);
    const errs = (o: TradeOffer) => validateTrade(l, o).join(' ');
    // either first moving in the same deal
    expect(errs(deal({ swaps: [y], dpids: [own(l, U, y).dpid] }))).toMatch(/can't change hands in the same deal/);
    // both ways at once, or twice
    expect(errs(deal({ swaps: [y] }, { swaps: [y] }))).toMatch(/one swap per pick/);
    expect(errs(deal({ swaps: [y, y] }))).toMatch(/twice/);
    // a draft with no picks yet, or with its order set
    expect(errs(deal({ swaps: [l.season + 30] }))).toMatch(/no \d+ first-round picks/);
    own(l, U, l.season).pick = 7;
    expect(errs(deal({ swaps: [l.season] }))).toMatch(/draft order is set/);
    delete own(l, U, l.season).pick;
    // one of them traded away
    own(l, AI, y).tid = THIRD;
    expect(errs(ok)).toMatch(/hold their own/);
    expect(swapSeasons(l, U, AI)).not.toContain(y);
    own(l, AI, y).tid = AI;
    // one swap per pick
    executeTrade(l, ok);
    expect(own(l, AI, y).swap).toBe(own(l, U, y).dpid);
    expect(errs(deal({ swaps: [y] }, {}, THIRD))).toMatch(/already has a protection or a swap/);
    expect(swapSeasons(l, U, THIRD)).not.toContain(y);
  }

  // is worth a lot from a much worse team and next to nothing from a much better one, for the holder and against the other
  {
    const l = termsLeague();
    for (const t of l.teams) record(l, t.tid, 20, 20);
    record(l, U, 20, 20);
    record(l, AI, 3, 37);
    record(l, THIRD, 37, 3);
    const y = l.season;
    const worse = swapOutlook(l, own(l, U, y), own(l, AI, y));
    const better = swapOutlook(l, own(l, U, y), own(l, THIRD, y));
    const mine = pickValue(l, own(l, U, y));
    expect(worse.odds).toBeGreaterThan(0.9);
    expect(worse.gain).toBeGreaterThan(0.5 * mine);
    expect(better.odds).toBeLessThan(0.1);
    expect(better.gain).toBeLessThan(0.03 * mine);
    // the worse team gives you the right: it counts as what it's worth to them, against them
    const take = evaluateTrade(l, deal({}, { swaps: [y] }));
    expect(take.parts.outgoing).toEqual([expect.objectContaining({ kind: 'swap', id: y, neutral: worse.gain })]);
    expect(take.parts.picksOut).toBeCloseTo(worse.gain, 9);
    // a rebuilder pays more for it than a contender (the pick lens)
    l.teams[AI].strategy = 'rebuild';
    const reb = evaluateTrade(l, deal({ swaps: [y] })).parts.picksIn;
    l.teams[AI].strategy = 'contend';
    const con = evaluateTrade(l, deal({ swaps: [y] })).parts.picksIn;
    expect(reb).toBeGreaterThan(con);
    // once made, the right moves value from one pick to the other, and the two still add up
    l.teams[AI].strategy = 'retool';
    const before = pickValue(l, own(l, U, y)) + pickValue(l, own(l, AI, y));
    executeTrade(l, deal({}, { swaps: [y] }));
    expect(pickValue(l, own(l, U, y))).toBeCloseTo(mine + worse.gain, 9);
    expect(pickValue(l, own(l, U, y)) + pickValue(l, own(l, AI, y))).toBeCloseTo(before, 9);
    expect(pickLabel(l, own(l, U, y))).toBe(`${y} 1st · swap with ${l.teams[AI].abbrev}`);
    expect(pickLabel(l, own(l, AI, y))).toBe(`${y} 1st · ${l.teams[U].abbrev} may swap`);
    expect(dealTerms(l, deal({}, { swaps: [y + 1] }))[0].text).toMatch(
      new RegExp(
        `^${y + 1} swap: you may take ${l.teams[AI].abbrev}'s ${y + 1} 1st for yours if theirs lands higher \\(about \\d+% likely on the current projection\\)\\. It costs them about \\d+% of their pick\\.$`,
      ),
    );
  }

  // is settled when the lottery sets the order: the picks change hands only when the other one lands higher
  {
    for (const used of [true, false]) {
      const l = termsLeague(7);
      const y = l.season;
      executeTrade(l, deal({}, { swaps: [y] }));
      for (const t of l.teams) record(l, t.tid, 41, 41, t.tid % 2 === 0);
      // the team that gave the right finishes last, or first
      record(l, AI, used ? 10 : 70, used ? 72 : 12, !used);
      record(l, U, used ? 70 : 10, used ? 12 : 72, used);
      const right = own(l, U, y);
      const subject = own(l, AI, y);
      const logged = l.transactions?.length ?? 0;
      l.phase = 'draftLottery';
      runLottery(l, new Rng(3));
      expect(right.swap).toBeUndefined();
      expect(subject.pick! < right.pick!).toBe(used);
      expect([right.tid, subject.tid]).toEqual(used ? [AI, U] : [U, AI]);
      const swaps = (l.transactions ?? []).slice(logged).filter((t) => t.kind === 'swap');
      expect(swaps.length).toBe(used ? 1 : 0);
      if (used) {
        expect(txnText(l, txnLine(swaps[0], { tid: U }))).toBe(`Swapped firsts with ${l.teams[AI].abbrev}: took the ${y} 1st #${subject.pick} for the ${y} 1st #${right.pick}`);
        expect(l.news.some((n) => n.text.startsWith('Pick swap:') && n.text.includes(`pick #${subject.pick} instead of #${right.pick}`))).toBe(true);
      }
      const mail = l.inbox.find((m) => m.subject.startsWith('Pick swap'))!;
      expect(mail.subject).toBe(used ? `Pick swap: we move up to #${subject.pick}` : `Pick swap with ${l.teams[AI].abbrev} not used`);
    }
  }

  // travels with the pick that carries it
  {
    const l = termsLeague(9);
    const y = l.season;
    executeTrade(l, deal({}, { swaps: [y] }));
    const right = own(l, U, y);
    const subject = own(l, AI, y);
    // the right goes to a third team with your first
    executeTrade(l, deal({ dpids: [right.dpid] }, {}, THIRD));
    expect([right.tid, right.swap]).toEqual([THIRD, subject.dpid]);
    expect(pickLabel(l, subject)).toBe(`${y} 1st · ${l.teams[THIRD].abbrev} may swap`);
    expect(pickTermsNote(l, subject)).toBe(`${l.teams[THIRD].abbrev} may take it for ${l.teams[U].abbrev}'s ${y} 1st if it lands higher.`);
    expect(pickLabel(l, right)).toBe(`${y} 1st (${l.teams[U].abbrev}) · swap with ${l.teams[AI].abbrev}`);
    for (const t of l.teams) record(l, t.tid, 41, 41, t.tid % 2 === 0);
    record(l, AI, 10, 72);
    record(l, U, 70, 12, true);
    l.phase = 'draftLottery';
    runLottery(l, new Rng(3));
    // the third team holds the better pick now, the team that gave the right your old one
    expect(subject.tid).toBe(THIRD);
    expect(right.tid).toBe(AI);
  }

  // each team sends and receives at most 5% of the cap a season, one way per deal
  {
    const l = termsLeague();
    const room = cashRoom(l, U);
    expect(room.limit).toBe(Math.round((CAP_FOR(l, contractSeason(l)).salaryCap * CASH_PCT) / 100) * 100);
    expect(room.limit).toBe(8_300);
    expect([room.send, room.receive]).toEqual([room.limit, room.limit]);
    const second = own(l, AI, l.season + 1, 2);
    const errs = (o: TradeOffer) => validateTrade(l, o).join(' ');
    expect(errs(deal({ cash: room.limit + 100 }, { dpids: [second.dpid] }))).toMatch(/can send at most \$8\.3M more in cash in trades for 2026-27 \(\$8\.3M a season\)/);
    expect(errs(deal({ cash: 1_000 }, { cash: 500 }))).toMatch(/Cash can only go one way/);
    expect(errs(deal({ cash: 2.5 }))).toMatch(/isn't a valid amount/);
    expect(errs(deal({ cash: -5 }))).toMatch(/isn't a valid amount/);
    executeTrade(l, deal({ cash: 6_000 }, { dpids: [second.dpid] }));
    expect(cashRoom(l, U).send).toBe(room.limit - 6_000);
    expect(cashRoom(l, AI).receive).toBe(room.limit - 6_000);
    // what the other team can still take counts too
    const third = own(l, THIRD, l.season + 1, 2);
    l.teams[THIRD].cashTrades = { season: contractSeason(l), sent: 0, received: room.limit - 1_300 };
    expect(validateTrade(l, deal({ cash: 2_000 }, { dpids: [third.dpid] }, THIRD))).toEqual([
      `${l.teams[THIRD].abbrev} can take at most $1.3M more in cash in trades for 2026-27 ($8.3M a season).`,
    ]);
    expect(validateTrade(l, deal({ cash: 2_500 }, { dpids: [third.dpid] }, THIRD))[0]).toBe(
      `${l.teams[U].abbrev} can send at most $2.3M more in cash in trades for 2026-27 ($8.3M a season).`,
    );
    // a new contract season starts over
    l.phase = 'draft';
    expect(cashRoom(l, U).send).toBe(Math.round((CAP_FOR(l, contractSeason(l)).salaryCap * CASH_PCT) / 100) * 100);
  }

  // buys about a second-round pick for $2-3M: worth more to a rebuilder than a contender, and costs the sender as much
  {
    const l = termsLeague();
    const second = own(l, AI, l.season + 1, 2);
    const price = (cash: number) => evaluateTrade(l, deal({ cash }, { dpids: [second.dpid] })).accept;
    // the least cash (in $0.1M) that buys it
    let cash = 100;
    while (!price(cash)) cash += 100;
    expect(cash).toBeGreaterThanOrEqual(1_500);
    expect(cash).toBeLessThanOrEqual(3_500);
    expect(cashValueFor(l, 2_500, AI, true)).toBeCloseTo(2.5, 9);
    l.teams[AI].strategy = 'rebuild';
    const reb = cashValueFor(l, 2_500, AI, true);
    l.teams[AI].strategy = 'contend';
    const con = cashValueFor(l, 2_500, AI, true);
    expect(reb).toBeGreaterThan(2.5);
    expect(con).toBeLessThan(2.5);
    // sending it never costs a team less than neutral, and the contender says so
    expect(cashValueFor(l, 2_500, AI, false)).toBeCloseTo(2.5, 9);
    expect(evaluateTrade(l, deal({ cash: 5_000 }, { dpids: [second.dpid] })).notes.map((n) => n.text)).toContain('$5.0M in cash counts for less to a contender');
  }

  // traded over the summer, goes on next season’s books (the one its limit counts for), not the season the owner has already judged
  {
    const l = termsLeague();
    l.phase = 'draftLottery';
    const S = l.season;
    const before = { ...curTeamSeason(l, U) };
    const second = own(l, AI, S + 1, 2);
    const o = deal({ cash: 3_000 }, { dpids: [second.dpid] });
    expect(validateTrade(l, o)).toEqual([]);
    const bank = [l.teams[U].cash, l.teams[AI].cash];
    executeTrade(l, o);
    // the bank balance moves at once and the limit counted is next season's...
    expect([l.teams[U].cash, l.teams[AI].cash]).toEqual([bank[0] - 3_000, bank[1] + 3_000]);
    expect(l.teams[U].cashTrades).toEqual({ season: S + 1, sent: 3_000, received: 0 });
    // ...this season's books are left alone, and no season's books are opened early
    expect([curTeamSeason(l, U).expenses, curTeamSeason(l, U).revenue]).toEqual([before.expenses, before.revenue]);
    expect(l.teams[U].seasons.some((s) => s.season === S + 1)).toBe(false);
    // next season's books take it when they open
    l.season = S + 1;
    const fresh = [curTeamSeason(l, U).expenses, curTeamSeason(l, AI).revenue];
    bookTradedCash(l);
    expect(curTeamSeason(l, U).expenses).toBe(fresh[0] + 3_000);
    expect([curTeamSeason(l, AI).revenue, curTeamSeason(l, AI).cashIn]).toEqual([fresh[1] + 3_000, 3_000]);
  }

  // moves money, not salary: the bank balance and the books, outside salary matching and revenue sharing, logged
  {
    const l = termsLeague();
    const base = structuredClone(l);
    const p = standardRoster(l, AI)[0];
    const plain = deal({}, { pids: [p.pid] });
    const paid = deal({ cash: 3_000 }, { pids: [p.pid] });
    expect(salaryMatchGap(l, paid, 'a')).toBe(salaryMatchGap(l, plain, 'a'));
    expect(evaluateTrade(l, paid).parts.salaryIn).toBe(evaluateTrade(l, plain).parts.salaryIn);
    const second = own(l, AI, l.season + 1, 2);
    const [cu, ca] = [l.teams[U].cash, l.teams[AI].cash];
    executeTrade(l, deal({ cash: 3_000 }, { dpids: [second.dpid] }));
    expect([l.teams[U].cash, l.teams[AI].cash]).toEqual([cu - 3_000, ca + 3_000]);
    expect(curTeamSeason(l, U).expenses).toBe(curTeamSeason(base, U).expenses + 3_000);
    expect([curTeamSeason(l, AI).revenue, curTeamSeason(l, AI).cashIn]).toEqual([curTeamSeason(base, AI).revenue + 3_000, 3_000]);
    // cash taken in a trade isn't local revenue: revenue sharing comes out the same
    expect([...shareRevenue(structuredClone(l))]).toEqual([...shareRevenue(structuredClone(base))]);
    const txn = l.transactions!.at(-1)!;
    expect(txn.sides![0].cash).toBe(3_000);
    expect(txnText(l, txnLine(txn, { tid: U }))).toBe(`Acquired a ${second.season} 2nd from ${l.teams[AI].abbrev} for $3.0M in cash`);
    expect(l.news.at(-1)!.text).toBe(`Trade: the ${l.teams[U].name} send $3.0M in cash to the ${l.teams[AI].name} for ${second.season} 2nd (${l.teams[AI].abbrev}).`);
  }

  // "what would make this work?" closes a small gap with a little cash before a pick or a player, and so does a counter
  {
    const l = termsLeague();
    const second = own(l, AI, l.season + 1, 2);
    const ask = deal({}, { dpids: [second.dpid] });
    const work = makeItWork(l, ask, [], { cash: true }).offer!;
    expect(work.a.pids).toEqual([]);
    expect(work.a.dpids).toEqual([]);
    expect(work.a.cash).toBeGreaterThan(0);
    expect(work.a.cash! % 100).toBe(0);
    expect(evaluateTrade(l, work).accept).toBe(true);
    expect(evaluateTrade(l, { ...work, a: { ...work.a, cash: work.a.cash! - 100 } }).accept).toBe(false);
    // without the option: a pick or a player
    const plain = makeItWork(l, ask).offer!;
    expect(plain.a.cash).toBeUndefined();
    expect(plain.a.pids.length + plain.a.dpids.length).toBeGreaterThan(0);
    const counter = counterOffers(l, ask).find((c) => c.label.endsWith('in cash'));
    expect(counter?.label).toBe(`Add $${(work.a.cash! / 1000).toFixed(1)}M in cash`);
    // no room left this season: no cash
    l.teams[U].cashTrades = { season: contractSeason(l), sent: cashRoom(l, U).limit, received: 0 };
    expect(makeItWork(l, ask, [], { cash: true }).offer?.a.cash).toBeUndefined();
  }

  // count in every neutral split: the warning when you'd give up far more than you get
  {
    const l = termsLeague();
    const dp = own(l, U, l.season + 1);
    // your first for $1M of their cash: a giveaway, and less of one with a protection on it (the cash counts as what you get)
    const split = (protect?: Record<number, number>) => {
      const o = deal({ dpids: [dp.dpid], protect }, { cash: 1_000 });
      return { ...neutralSplit(evaluateTrade(l, o).parts, o), warn: evaluateTrade(l, o).notes.find((n) => n.tone === 'warn')?.text };
    };
    expect(split().warn).toMatch(/give up about \d+ times what you get|far more than you get/);
    expect(split().get).toBeCloseTo(1, 9);
    expect(split({ [dp.dpid]: 20 }).give).toBeLessThan(split().give);
    expect(neutralBalance(l, deal({ dpids: [dp.dpid], protect: { [dp.dpid]: 20 } }, { cash: 1_000 })).net).toBeCloseTo(1 - split({ [dp.dpid]: 20 }).give, 9);
    // the swap and cash show in the news line
    const y = l.season + 2;
    executeTrade(l, deal({ swaps: [y], cash: 1_000 }, { dpids: [own(l, AI, l.season + 1, 2).dpid] }));
    expect(l.news.at(-1)!.text).toBe(
      `Trade: the ${l.teams[U].name} send the right to swap ${y} firsts and $1.0M in cash to the ${l.teams[AI].name} for ${l.season + 1} 2nd (${l.teams[AI].abbrev}).`,
    );
    const txn = l.transactions!.at(-1)!;
    expect(txnText(l, txnLine(txn, { tid: AI }))).toBe(`Acquired the right to swap ${y} firsts and $1.0M in cash from ${l.teams[U].abbrev} for a ${l.season + 1} 2nd`);
    expect(swapPicks(l, U, AI, y)!.right.swap).toBe(own(l, U, y).dpid);
  }

  // leave an offer with none of them exactly as it was valued before
  {
    const l = termsLeague();
    const p = standardRoster(l, AI)[0];
    const dp: DraftPick = own(l, U, l.season + 1);
    const o = deal({ dpids: [dp.dpid] }, { pids: [p.pid] });
    const ev = evaluateTrade(l, o);
    expect([ev.parts.cashIn, ev.parts.cashOut]).toEqual([0, 0]);
    expect(ev.valueIn).toBe(ev.parts.playersIn + ev.parts.picksIn - (ev.parts.money + ev.parts.cut));
    expect(dealTerms(l, o)).toEqual([]);
  }
}, 120_000);
