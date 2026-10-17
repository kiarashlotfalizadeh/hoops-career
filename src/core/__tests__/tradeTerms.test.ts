// Deal terms beyond players and picks: protections a team puts on its own first when it trades it,
// the right to swap firsts (valued over both picks' projected slots, travelling with the pick that
// carries it and settled at the lottery) and cash (capped each season, valued like the second-round
// picks it buys, moving money but never salary). Fictional leagues keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, contractSeason, curTeamSeason, standardRoster } from '../league/helpers';
import { runLottery } from '../league/draft';
import { shareRevenue } from '../league/finances';
import { txnLine, txnText } from '../league/transactions';
import {
  CASH_PCT,
  PROTECTIONS,
  bookTradedCash,
  canMakeWork,
  cashRoom,
  cashValueFor,
  counterOffers,
  dealTerms,
  evaluateTrade,
  executeTrade,
  makeItWork,
  neutralBalance,
  neutralSplit,
  pickLabel,
  pickTermsNote,
  pickValue,
  pickValueFor,
  salaryMatchGap,
  swapOutlook,
  tradeRoster,
  swapPicks,
  swapSeasons,
  topOdds,
  validateTrade,
  type TradeOffer,
  type TradeSide,
} from '../league/trades';
import { signOfferSheet } from '../league/rfa';
import { Rng } from '../random';
import type { DraftPick, League } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;
const THIRD = 2;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `terms${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // a fixed id: the lottery breaks ties on it
  l.id = `terms${rngSeed}`;
  l.settings.difficulty = 'normal';
  l.phase = 'regular';
  l.day = 0;
  for (const t of l.teams) t.strategy = 'retool';
  return l;
}

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

describe('protections you set on picks you trade (G1)', () => {
  it('protects your own first as it goes: valued lower by them, set on the pick, named in labels, the news and the log', () => {
    const l = league();
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
  });

  it("only on your own first, before its order is set and outside any swap; anyone else's pick keeps its terms", () => {
    const l = league();
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
  });

  it('asking for their pick protected costs them less to give up; a protected pick that lands inside it stays home', () => {
    const l = league();
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
  });

  it('a protected pick going home is worth all of it to its original team, and only what it held to the team sending it', () => {
    const l = league();
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
  });

  it('the dock says what a protection does, and a turned-down deal comes back without it', () => {
    const l = league();
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
  });
});

describe('pick swaps (G2)', () => {
  it('needs both teams to hold their own firsts of that draft, unprotected, unswapped and not moving in the deal', () => {
    const l = league();
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
  });

  it('is worth a lot from a much worse team and next to nothing from a much better one, for the holder and against the other', () => {
    const l = league();
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
  });

  it('is settled when the lottery sets the order: the picks change hands only when the other one lands higher', () => {
    for (const used of [true, false]) {
      const l = league(7);
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
  });

  it('travels with the pick that carries it', () => {
    const l = league(9);
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
  });
});

describe('cash (G3)', () => {
  it('each team sends and receives at most 5% of the cap a season, one way per deal', () => {
    const l = league();
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
  });

  it('buys about a second-round pick for $2-3M: worth more to a rebuilder than a contender, and costs the sender as much', () => {
    const l = league();
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
  });

  it('traded over the summer, goes on next season’s books (the one its limit counts for), not the season the owner has already judged', () => {
    const l = league();
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
  });

  it('moves money, not salary: the bank balance and the books, outside salary matching and revenue sharing, logged', () => {
    const l = league();
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
    expect(l.news.at(-1)!.text).toBe(`Trade: ${l.teams[U].abbrev} send $3.0M in cash to ${l.teams[AI].abbrev} for ${second.season} 2nd (${l.teams[AI].abbrev}).`);
  });

  it('"what would make this work?" closes a small gap with a little cash before a pick or a player, and so does a counter', () => {
    const l = league();
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
  });
});

describe('roster spots in free agency', () => {
  it('an offer sheet a team has signed holds one of its spots: a trade can’t take it past the offseason limit', () => {
    const l = league();
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
  });
});

describe('deal terms (G1-G3)', () => {
  it("count in every neutral split: the warning when you'd give up far more than you get", () => {
    const l = league();
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
      `Trade: ${l.teams[U].abbrev} send the right to swap ${y} firsts, $1.0M in cash to ${l.teams[AI].abbrev} for ${l.season + 1} 2nd (${l.teams[AI].abbrev}).`,
    );
    const txn = l.transactions!.at(-1)!;
    expect(txnText(l, txnLine(txn, { tid: AI }))).toBe(`Acquired the right to swap ${y} firsts and $1.0M in cash from ${l.teams[U].abbrev} for a ${l.season + 1} 2nd`);
    expect(swapPicks(l, U, AI, y)!.right.swap).toBe(own(l, U, y).dpid);
  });

  it('leave an offer with none of them exactly as it was valued before', () => {
    const l = league();
    const p = standardRoster(l, AI)[0];
    const dp: DraftPick = own(l, U, l.season + 1);
    const o = deal({ dpids: [dp.dpid] }, { pids: [p.pid] });
    const ev = evaluateTrade(l, o);
    expect([ev.parts.cashIn, ev.parts.cashOut]).toEqual([0, 0]);
    expect(ev.valueIn).toBe(ev.parts.playersIn + ev.parts.picksIn - (ev.parts.money + ev.parts.cut));
    expect(dealTerms(l, o)).toEqual([]);
  });
});
