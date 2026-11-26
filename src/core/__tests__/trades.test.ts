// Trades: AI valuation (consolidation, strategy lenses, liabilities, picks) and the reasons behind
// its verdict; the rules a deal has to pass (picks, trading back, signing locks, aprons, salary
// tiers, traded player exceptions, roster limits); and deal terms beyond players and picks
// (protections, pick swaps, cash). Fictional leagues with hand-shaped players keep these fast and
// deterministic: each scenario builds the league it needs.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { startRegularSeason } from '../league/season';
import { GM_STYLE, gmLine, gmTemper, leagueBusy, takesCalls } from '../league/voices';
import { CAP_FOR, contractSeason, curTeamSeason, dateToDay, freeAgents, payroll, standardRoster, teamCity } from '../league/helpers';
import { DEC_15, DUMP_PER_FIRST, FIRST_VALUE, askingContract, marketSalary, releaseDeadMoney, releasePlayer, signPlayer, tradeValue } from '../league/contracts';
import { changesStarters, tradeImpact } from '../league/tradeImpact';
import { ensureRotation } from '../league/games';
import { decisionThreads } from '../league/legacyReview';
import {
  CASH_PCT,
  PROTECTIONS,
  bookTradedCash,
  cashRoom,
  cashValueFor,
  dealTerms,
  dealDelta,
  dealTeams,
  evaluateDeal,
  STAR_MARKET,
  evaluateTrade,
  executeDeal,
  executeTrade,
  legsOf,
  matchInfoOf,
  neutralSplit,
  pickLabel,
  pickRange,
  pickTermsNote,
  pickValue,
  FIRST_MARKET,
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
  validateDeal,
  validateTrade,
  CORNERSTONE,
  MAX_FIRSTS_OUT,
  USER_RELIEF_SHARE,
  type TradeLeg,
  type TradeOffer,
  type TradeSide,
  FEVER,
  deadlineFever,
} from '../league/trades';
import { counterOffers, dealAddsText, makeDealWork, makeItWork } from '../league/tradeHelp';
import { facilitatedDeal } from '../league/aiTrades';
import { neutralBalance } from '../league/tradePackages';
import { aiChoose, draftPlayer, ensureFuturePicks, lotteryRevealed, nextPick, revealLottery, runLottery } from '../league/draft';
import { shareRevenue } from '../league/finances';
import { txnLine, txnText } from '../league/transactions';
import { CAP } from '../constants';
import { contractExp, playerAge } from '../playerGen';
import { Rng } from '../random';
import type { DraftPick, League, Player } from '../types';
import { leagueBoard, revealOutlook } from '../league/prospects';

const U = 0;
const AI = 1;
const THIRD = 2;

/** Every front office a straight shooter: these tests are about the values, and the tempers (league/voices.ts) have a block of their own. */
function straight(l: League): League {
  l.gm = Object.fromEntries(l.teams.map((t) => [t.tid, 'straight' as const]));
  return l;
}

function txLeague(rngSeed = 5): League {
  return straight(createLeague({ name: `tx${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed }));
}

function negLeague(rngSeed = 5): League {
  return straight(createLeague({ name: `neg${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed }));
}

function termsLeague(rngSeed = 5): League {
  const l = straight(createLeague({ name: `terms${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed }));
  // a fixed id: the lottery breaks ties on it
  l.id = `terms${rngSeed}`;
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
  // a point margin to go with it (about 40 points per 100 possessions per unit of win%), as a
  // season's games would leave it: the pick projection reads the net rating as well as the record
  const gp = won + lost;
  const margin = gp ? 40 * (won / gp - 0.5) : 0;
  ts.poss = ts.oppPoss = 100 * gp;
  ts.ptsFor = (110 + margin / 2) * gp;
  ts.ptsAgainst = (110 - margin / 2) * gp;
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
    // (as long in the league as the star, so his max, and so his salary, is the star's)
    const equal = shape(l, Object.assign(standardRoster(l, U)[4], { experience: star.experience }), 90, 27);
    expect(evaluateTrade(l, offer([equal.pid], [star.pid])).accept).toBe(true);
  }

  // the seasons of a player a deal brings: a 25-year-old 84 signed for four more seasons is worth
  // clearly more than a 28-year-old 85 on an expiring deal, to every team (AI Orlando gave Franz Wagner
  // and a first for Michael Porter Jr.'s last season); an old star is priced for his age but a 90 at
  // 33 doesn't go for an 87 at 29; a rebuilder sells a 30-year-old 82 for two firsts
  {
    const l = txLeague();
    l.phase = 'regular';
    const young = shape(l, standardRoster(l, AI)[0], 84, 25, undefined, 4);
    const rental = shape(l, standardRoster(l, THIRD)[0], 85, 28, undefined, 1);
    for (const st of ['contend', 'retool', 'rebuild'] as const) expect(tradeValue(l, young, st)).toBeGreaterThan(tradeValue(l, rental, st) * 1.1);
    l.teams[AI].strategy = 'contend';
    l.teams[THIRD].strategy = 'rebuild';
    const first = own(l, AI, l.season + 1);
    const swap: TradeOffer = { a: { tid: AI, pids: [young.pid], dpids: [first.dpid] }, b: { tid: THIRD, pids: [rental.pid], dpids: [] } };
    expect(teamAccepts(l, swap, AI)).toBe(false);
    expect(teamAccepts(l, { ...swap, a: { ...swap.a, dpids: [] } }, AI)).toBe(false);
    // the user's expiring 85 for their young 84: no
    const mine = shape(l, standardRoster(l, U)[0], 85, 28, undefined, 1);
    expect(teamAccepts(l, offer([mine.pid], [young.pid]), AI)).toBe(false);
    // an old star
    const star = shape(l, standardRoster(l, AI)[1], 90, 33, undefined, 1);
    const lesser = shape(l, standardRoster(l, U)[1], 87, 29, undefined, 2);
    for (const st of ['contend', 'retool'] as const) {
      l.teams[AI].strategy = st;
      expect(teamAccepts(l, offer([lesser.pid], [star.pid]), AI)).toBe(false);
    }
    expect(tradeValue(l, star)).toBeLessThan(tradeValue(l, shape(l, standardRoster(l, U)[2], 90, 27, undefined, 1)));
    // a rebuilder's veteran for two firsts
    l.teams[AI].strategy = 'rebuild';
    const vet = shape(l, standardRoster(l, AI)[2], 82, 30);
    const firsts = l.draftPicks
      .filter((d) => d.tid === U && d.round === 1 && d.season > l.season)
      .sort((a, b) => a.season - b.season)
      .filter((_, i) => i % 2 === 0)
      .slice(0, 2)
      .map((d) => d.dpid);
    expect(teamAccepts(l, offer([], [vet.pid], firsts), AI)).toBe(true);
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
    // a rebuilder sells him to another AI team down to 85% of neutral value; to the user never under
    // it, and an old star (86 at 33: half the way) toward what a contender would pay for him
    // (STAR_MARKET: one user, a league of contenders)
    const market = STAR_MARKET * tradeValue(l, vet, 'contend');
    expect(playerValueFor(l, vet, AI, false)).toBeCloseTo(neutral + 0.5 * (market - neutral));
    // (a lesser veteran at neutral value)
    {
      const m = structuredClone(l);
      const role = shape(m, m.players[vet.pid], 82, 33);
      expect(playerValueFor(m, role, AI, false)).toBeCloseTo(tradeValue(m, role));
    }
    expect(playerValueFor(l, vet, AI, false, true)).toBeCloseTo(neutral * 0.85);
    expect(playerValueFor(l, vet, 2, true)).toBeCloseTo(neutral * 1.15);
    // once he has changed hands this season he is worth neutral value to everyone
    vet.tradedFrom = { tid: 3, season: l.season };
    expect(playerValueFor(l, vet, 2, true)).toBeCloseTo(neutral);
  }

  // a bad contract carries its cost: a season of dead money at DUMP_PER_FIRST of the cap is worth about
  // minus a typical first, no team takes it (or a talented 33-year-old overpaid by two firsts) for
  // nothing, and a team with room takes it with picks attached; the tax makes it dearer still
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l).salaryCap;
    const dead = shape(l, standardRoster(l, U)[0], 45, 33, Math.round(cap * DUMP_PER_FIRST), 1);
    expect(tradeValue(l, dead)).toBeLessThan(-FIRST_VALUE * 0.85);
    expect(tradeValue(l, dead)).toBeGreaterThan(-FIRST_VALUE * 1.05);
    const dump = (tid: number, dpids: number[] = []): TradeOffer => ({ a: { tid: U, pids: [dead.pid], dpids }, b: { tid, pids: [], dpids: [] } });
    for (const t of l.teams) if (t.tid !== U) expect(teamAccepts(l, dump(t.tid), t.tid)).toBe(false);
    const star = shape(l, standardRoster(l, U)[1], 84, 33, Math.round(cap * 0.35), 2);
    expect(tradeValue(l, star)).toBeLessThan(0);
    for (const t of l.teams) if (t.tid !== U && t.strategy !== 'contend') expect(teamAccepts(l, { ...dump(t.tid), a: { tid: U, pids: [star.pid], dpids: [] } }, t.tid)).toBe(false);
    // a rebuilder with room is paid to absorb it: two firsts do it
    const room = l.teams.find((t) => t.tid !== U)!.tid;
    l.teams[room].strategy = 'rebuild';
    for (const p of standardRoster(l, room).slice(4)) p.contract = { start: l.season, salaries: [CAP_FOR(l).minContract] };
    const firsts = l.draftPicks
      .filter((d) => d.tid === U && d.round === 1)
      .slice(0, 2)
      .map((d) => d.dpid);
    expect(teamAccepts(l, dump(room, firsts), room)).toBe(true);
  }

  // keeps a liability within 15% of neutral the same way: no team takes one in as a bigger burden than it sees
  {
    const l = txLeague();
    l.phase = 'regular';
    // an overpaid 76 at 31: a burden to the league, worth having to a contender, a bigger burden to a rebuilder
    const bad = shape(l, standardRoster(l, AI)[0], 76, 31, Math.round(CAP_FOR(l).salaryCap * 0.12), 2);
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

  // a taxpayer sells the user a good player at a discount, not for his salary's worth of relief:
  // the relief counts for a quarter of his value at most (USER_RELIEF_SHARE), and a franchise player
  // going out counts CORNERSTONE times as much; the dock says both
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l);
    const [star, ...rest] = standardRoster(l, AI);
    shape(l, star, 85, 24, Math.round(cap.salaryCap * 0.2), 3);
    for (const p of rest) shape(l, p, 74, 28, cap.vetMin * 3, 2);
    // far past the AI teams' top line, and the user with room for him
    for (const p of standardRoster(l, U)) p.contract = { start: l.season, salaries: [cap.minContract] };
    l.teams[U].deadMoney = [];
    l.teams[AI].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: cap.spendTop + 20_000 - payroll(l, AI) });
    const v = tradeValue(l, star);
    const ev = evaluateTrade(l, offer([], [star.pid]));
    expect(ev.parts.reliefKind).toBe('discount');
    expect(-ev.parts.money).toBeLessThanOrEqual(v * USER_RELIEF_SHARE + 0.01);
    expect(ev.parts.reliefFull!).toBeGreaterThan(-ev.parts.money);
    expect(ev.delta).toBeLessThanOrEqual(-(CORNERSTONE - USER_RELIEF_SHARE) * v + 1);
    const notes = ev.notes.map((n) => n.text);
    expect(notes.some((t) => /saves them .* in luxury tax, but they take 25% off a good player's value for it at most/.test(t))).toBe(true);
    expect(notes.some((t) => /^They build around .*: he counts 30% more to them$/.test(t))).toBe(true);
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
    // (this class reads a little weaker than most: across leagues the two average out within 5%)
    expect(now / summer).toBeGreaterThan(0.85);
    expect(now / summer).toBeLessThan(1.3);
    // draft night: the pick on the clock is worth what the player the boards would take can be
    // expected to be once draft night shows his ratings (their read shrunk toward the class), not
    // the best prospect left by the room's read: over the first round the two agree, and the picks
    // lose value as the night goes (front-office review, round 3: the clock summed 588 against 378
    // for the players taken, #9-#14 all about 31)
    l.phase = 'draftLottery';
    l.day = dateToDay(l.season, 5, 25);
    runLottery(l, new Rng(3));
    l.phase = 'draft';
    const board = leagueBoard(l, l.season);
    const rng = new Rng(4);
    const clock: number[] = [];
    let expected = 0;
    for (let dp = nextPick(l); dp && dp.round === 1; dp = nextPick(l)) {
      clock.push(pickValue(l, dp));
      const p = aiChoose(l, dp.tid, rng)!;
      const outlook = revealOutlook(p, board.reads.get(p.pid)!, board.prior);
      draftPlayer(l, dp, p.pid);
      expected += outlook.reduce((a, [q, w]) => a + w * tradeValue(l, { ...l.players[p.pid], ovr: q.ovr, pot: q.pot }), 0);
    }
    const sum = clock.reduce((a, x) => a + x, 0);
    expect(sum / expected).toBeGreaterThan(0.85);
    expect(sum / expected).toBeLessThan(1.15);
    expect(clock[0]).toBeGreaterThan(clock[14]);
    expect(clock[14]).toBeGreaterThan(clock[29]);
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

  // front offices have tempers (league/voices.ts): a shark wants more than an even deal, a hoarder holds his own
  // picks dearer, a gunslinger pays up for a star, and none takes less than even from the user
  {
    const l = negLeague();
    expect(startRegularSeason(l)).toEqual([]);
    const mine = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr);
    const theirs = standardRoster(l, AI).sort((a, b) => b.ovr - a.ovr);
    const o = offer([mine[3].pid], [theirs[3].pid]);
    const as = (temper: NonNullable<League['gm']>[number], off = o) => {
      l.gm = { ...l.gm, [AI]: temper };
      return evaluateTrade(l, off);
    };
    const even = as('straight');
    expect(even.parts.ask).toBe(0);
    const shark = as('shark');
    expect(shark.parts.ask).toBeCloseTo(GM_STYLE.shark.edge * Math.abs(shark.valueOut - shark.parts.ask), 9);
    expect(shark.parts.ask).toBeGreaterThan(0);
    expect(shark.delta).toBeLessThan(even.delta);
    expect(shark.valueOut).toBeCloseTo(shark.parts.playersOut + shark.parts.picksOut + shark.parts.cashOut + shark.parts.ask, 9);
    // (a tinkerer deals for a little less among AI teams, never with the user)
    expect(as('tinkerer').parts.ask).toBe(0);
    expect(as('tinkerer').delta).toBeLessThanOrEqual(even.delta + 1e-9);
    // his own first going out: dearer to a hoarder, and never under what it's worth to anyone
    const first = l.draftPicks.find((d) => d.round === 1 && d.tid === AI && d.originalTid === AI)!;
    const withPick = offer([mine[0].pid], [theirs[6].pid], [], [first.dpid]);
    expect(as('hoarder', withPick).parts.picksOut).toBeGreaterThanOrEqual(as('straight', withPick).parts.picksOut);
    expect(as('gunslinger', withPick).parts.picksOut).toBeGreaterThanOrEqual(pickValue(l, first) - 1e-9);
    // a star coming in: a gunslinger pays more for him than a straight shooter, inside the same 15% band
    const star = mine[0];
    star.ovr = Math.max(star.ovr, 90);
    const forStar = offer([star.pid], [theirs[0].pid]);
    const paid = as('gunslinger', forStar).parts.playersIn;
    expect(paid).toBeGreaterThanOrEqual(as('straight', forStar).parts.playersIn);
    expect(paid).toBeLessThanOrEqual(tradeValue(l, star, 'retool') * 1.15 + 1e-9);
    // every team of a new league has one, and says how it deals
    const made = createLeague({ name: 'gm', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
    expect(Object.keys(made.gm!).length).toBe(made.teams.length);
    for (const t of made.teams) expect(gmLine(made, t)).toContain(GM_STYLE[gmTemper(made, t.tid)].label);
    expect(new Set(Object.values(made.gm!)).size).toBeGreaterThan(3);
    // how busy a front office is: a league of one temper is in the market every day, and deals at the plain rate
    const days = Array.from({ length: 300 }, (_, d) => d);
    const inMarket = (lg: League, tid: number) => days.filter((day) => takesCalls({ ...lg, day }, tid)).length / days.length;
    l.gm = Object.fromEntries(l.teams.map((t) => [t.tid, 'straight' as const]));
    expect(leagueBusy(l)).toBe(1);
    expect(inMarket(l, AI)).toBe(1);
    // with a tinkerer in the league he is the one always in it; a loyalist sits out the days his `busy` is short of the tinkerer's
    l.gm = { ...l.gm, [AI]: 'loyalist', 2: 'tinkerer', 3: 'gunslinger' };
    expect(inMarket(l, 2)).toBe(1);
    const share = (k: 'loyalist' | 'gunslinger' | 'straight') => GM_STYLE[k].busy / GM_STYLE.tinkerer.busy;
    expect(Math.abs(inMarket(l, AI) - share('loyalist'))).toBeLessThan(0.08);
    expect(Math.abs(inMarket(l, 3) - share('gunslinger'))).toBeLessThan(0.08);
    expect(Math.abs(inMarket(l, 4) - share('straight'))).toBeLessThan(0.08);
    expect(inMarket(l, AI)).toBeLessThan(inMarket(l, 4));
    // (the same answer all day)
    expect(takesCalls(l, AI)).toBe(takesCalls(l, AI));
    expect(leagueBusy(l)).toBeGreaterThan(1);
    // deadline fever: in the deadline's last days a gunslinger or a tinkerer gives past even for a deal that
    // brings him its best player (80+); nobody else does, nor he earlier, nor for a lesser player, nor ever with the user
    {
      const [big, small] = [theirs[0], theirs[5]];
      big.ovr = Math.max(big.ovr, FEVER.ovr + 2);
      small.ovr = Math.min(small.ovr, FEVER.ovr - 4);
      const at = (left: number, temper: NonNullable<League['gm']>[number], inP = big, outP = small) => {
        l.gm = { ...l.gm, 5: temper };
        l.day = l.tradeDeadlineDay - left;
        return deadlineFever(l, 5, [inP.pid], [outP.pid]);
      };
      expect(at(0, 'gunslinger')).toBe(GM_STYLE.gunslinger.fever);
      expect(at(FEVER.days - 1, 'tinkerer')).toBe(GM_STYLE.tinkerer.fever);
      expect(GM_STYLE.gunslinger.fever).toBeGreaterThan(0);
      expect(at(FEVER.days, 'gunslinger')).toBe(0);
      expect(at(-1, 'gunslinger')).toBe(0);
      expect(at(1, 'straight')).toBe(0);
      expect(at(1, 'shark')).toBe(0);
      // (selling the better player, or buying one under the bar: no fever)
      expect(at(1, 'gunslinger', small, big)).toBe(0);
      const lesser = theirs[6];
      lesser.ovr = FEVER.ovr - 6;
      expect(at(1, 'gunslinger', small, lesser)).toBe(0);
      l.day = l.tradeDeadlineDay - 1;
      expect(deadlineFever(l, U, [big.pid], [small.pid])).toBe(0);
      // and a deal with the user is weighed as on any other day
      l.gm = { ...l.gm, [AI]: 'gunslinger' };
      expect(evaluateTrade(l, o).parts.ask).toBeGreaterThanOrEqual(0);
    }
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
      expect(ev.delta).toBeCloseTo(ev.valueIn - ev.valueOut, 9);
      expect(x.incoming.map((a) => a.id)).toEqual(o.a.pids);
      expect(x.outgoing.map((a) => a.id)).toEqual(o.b.pids);
    }
  }

  // says when taking on salary puts them into the luxury tax, and what it costs
  {
    const l = negLeague();
    l.phase = 'regular';
    const p = shapeAt(l, standardRoster(l, U)[0], 74, 27, 20_000);
    // (theirs to shed below, shaped before their payroll is set against the line)
    const theirs = shapeAt(l, standardRoster(l, AI)[0], 70, 27, 15_000);
    const tax = CAP_FOR(l).luxuryTax;
    // $1M under the tax line before the deal
    l.teams[AI].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: tax - payroll(l, AI, l.season) - 1_000 });
    const ev = evaluateTrade(l, offer([p.pid], []));
    expect(ev.parts.taxCost).toBeGreaterThan(0);
    expect(ev.parts.payAfter - tax).toBeCloseTo(19_000, 0);
    const note = ev.notes.find((n) => /tax/.test(n.text));
    expect(note).toEqual({ tone: 'bad', text: 'Taking on $20.0M puts them $19.0M into the tax' });
    // already over it: how far over the deal takes them
    l.teams[AI].deadMoney.push({ pid: -2, name: 'y', season: l.season, amount: 5_000 });
    expect(texts(l, offer([p.pid], []))).toContain('Taking on $20.0M takes them to $24.0M over the tax line');
    // and shedding salary over the line saves them tax
    expect(texts(l, offer([], [theirs.pid])).some((t) => /^Shedding \$15\.0M saves them \$[\d.]+M in luxury tax/.test(t))).toBe(true);
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
      text: expect.stringMatching(new RegExp(`^They value ${equal.firstName} ${equal.lastName} far more than ${mineScrub.firstName} ${mineScrub.lastName}$`)),
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

  // salary matching: a team over the cap after a trade takes back 125% of what it sends plus the buffer, whatever its payroll
  {
    const l = txLeague();
    l.phase = 'regular';
    const cap = CAP_FOR(l).salaryCap;
    const buf = Math.round((cap * CAP.tradeMatchBufferPct) / 10) * 10;
    expect(tradeMatchLimit(l, 0)).toBe(buf);
    expect(tradeMatchLimit(l, 5_000)).toBe(6_250 + buf);
    expect(tradeMatchLimit(l, 40_000)).toBe(50_000 + buf);
    // deep in the tax the rule is the same: a $9M player brings back 125% of it plus the buffer, and not a dollar more
    {
      const mine = shape(l, standardRoster(l, U)[0], 70, 27, 9_000);
      const theirs = shape(l, standardRoster(l, AI)[0], 72, 27, tradeMatchLimit(l, 9_000));
      l.teams[U].deadMoney = [{ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).luxuryTax + 30_000 - payroll(l, U) }];
      const deal = offer([mine.pid], [theirs.pid]);
      const mismatch = (o: typeof deal) => validateTrade(l, o).filter((e) => /Salary doesn't match/.test(e));
      expect(mismatch(deal)).toEqual([]);
      theirs.contract.salaries = theirs.contract.salaries.map((x) => x + 10);
      expect(mismatch(deal)).toHaveLength(1);
      // sending out more than it takes back is always fine, and so is cash
      expect(mismatch(offer([mine.pid], []))).toEqual([]);
      expect(validateTrade(l, { a: { tid: U, pids: [], dpids: [], cash: 1_000 }, b: { tid: AI, pids: [], dpids: [] } }).filter((e) => /cash/.test(e))).toEqual([]);
    }
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

  // reads a one-sided deal as what it is: a dump taken off a team's hands, or picks bought for nothing
  {
    expect(tradeHeadline('Charlotte', ['Terry Rozier', '2028 2nd'], 1, 'Minnesota', [], 0)).toBe("Minnesota takes Terry Rozier off Charlotte's hands, with 2028 2nd for it");
    expect(tradeHeadline('Sacramento', [], 0, 'Dallas', ['Ben Simmons'], 1)).toBe("Sacramento takes Ben Simmons off Dallas' hands");
    expect(tradeHeadline('Sacramento', ['2029 2nd'], 0, 'Brooklyn', [], 0)).toBe('Brooklyn gets 2029 2nd from Sacramento');
    expect(tradeHeadline('Toronto', ['Scottie Barnes'], 1, 'New York', ['Mikal Bridges'], 1)).toBe('Toronto sends Scottie Barnes to New York for Mikal Bridges');
  }

  // three-team deals: a deal is its legs, and every team is judged on all it sends against all it gets
  {
    const l = termsLeague();
    const [mine, ...restU] = standardRoster(l, U);
    const [theirs] = standardRoster(l, AI);
    const [third, third2] = standardRoster(l, THIRD);
    for (const p of [mine, theirs, third]) shape(l, p, 78, 26, 20000);
    shape(l, third2, 60, 30, 2000);
    // a two-team offer read as legs says what the offer says
    const two = offer([mine.pid], [theirs.pid]);
    expect(validateDeal(l, legsOf(two))).toEqual(validateTrade(l, two));
    expect(dealTeams(legsOf(two))).toEqual([U, AI]);
    const ev2 = evaluateTrade(l, two);
    const ed2 = evaluateDeal(l, legsOf(two));
    expect(ed2.teams.map((t) => t.tid)).toEqual([AI]);
    expect(ed2.teams[0].delta).toBeCloseTo(ev2.delta, 9);
    expect(ed2.accept).toBe(ev2.accept);
    // a triangle of equal players at equal pay: each team sends one and gets one, so the salaries match all round
    const leg = (tid: number, to: number, x: Partial<TradeSide> = {}): TradeLeg => ({ tid, to, pids: [], dpids: [], ...x });
    const ring = [leg(U, AI, { pids: [mine.pid] }), leg(AI, THIRD, { pids: [theirs.pid] }), leg(THIRD, U, { pids: [third.pid] })];
    expect(dealTeams(ring)).toEqual([U, AI, THIRD]);
    expect(validateDeal(l, ring)).toEqual([]);
    const ring3 = evaluateDeal(l, ring);
    expect(ring3.teams.map((t) => t.tid)).toEqual([AI, THIRD]);
    // (each AI team takes in the player the leg into it carries, and sends its own)
    expect(ring3.teams[0].parts.incoming.map((a) => a.id)).toEqual([mine.pid]);
    expect(ring3.teams[0].parts.outgoing.map((a) => a.id)).toEqual([theirs.pid]);
    expect(ring3.teams[1].parts.incoming.map((a) => a.id)).toEqual([theirs.pid]);
    // a team that only gives is told so by its verdict: all three must say yes
    const robbed = [leg(U, AI, { pids: [mine.pid] }), leg(AI, U, { pids: [theirs.pid] }), leg(THIRD, U, { pids: [third.pid] })];
    const bad = evaluateDeal(l, robbed);
    expect(bad.teams.find((t) => t.tid === THIRD)!.accept).toBe(false);
    expect(bad.accept).toBe(false);
    // salary is matched on a team's whole side: the user takes in two $20M players for one
    expect(matchInfoOf(l, U, [mine.pid], [theirs.pid, third.pid])).toMatchObject({ inSal: 40000, outSal: 20000 });
    expect(bad.teams.find((t) => t.tid === THIRD)!.parts).toMatchObject({ salaryIn: 0, salaryOut: 20000 });
    // a third team with nothing to do is told to leave; an asset can't go two ways
    expect(validateDeal(l, [leg(U, AI, { pids: [mine.pid] }), leg(AI, U, { pids: [theirs.pid] }), leg(THIRD, U)])).toContain(
      `${l.teams[THIRD].abbrev} sends nothing and gets nothing: take it out of the deal.`,
    );
    expect(validateDeal(l, [...ring, leg(U, THIRD, { pids: [mine.pid] })])).toContain('A player or pick is in the deal twice.');
    // the Stepien rule follows a pick to wherever its leg sends it
    const f1 = own(l, U, l.season + 1);
    const f2 = own(l, U, l.season + 2);
    expect(
      validateDeal(l, [leg(U, AI, { dpids: [f1.dpid] }), leg(U, THIRD, { dpids: [f2.dpid] }), leg(AI, U, { pids: [theirs.pid] })]).some((e) => e.includes('back-to-back drafts')),
    ).toBe(true);
    // "what would make this work?", three teams: the user adds until the rules pass and both other GMs say yes
    {
      const stuck = evaluateDeal(l, robbed);
      expect(stuck.accept).toBe(false);
      const work = makeDealWork(l, robbed);
      if (!work.legs) throw new Error(`no way found: ${work.why}`);
      const got = work.legs;
      expect(validateDeal(l, got)).toEqual([]);
      expect(evaluateDeal(l, got).accept).toBe(true);
      // everything that was in the deal still is, where it was going; what was added says who sends it and who gets it
      for (const x of robbed) for (const pid of x.pids) expect(got.find((y) => y.tid === x.tid && y.to === x.to)!.pids).toContain(pid);
      expect(work.added.length).toBeGreaterThan(0);
      // (the team that only gave is paid by the user: nobody else's assets are spent for him, but a contract an AI team sends back to match)
      expect(work.added.some((a) => a.from === U && a.to === THIRD)).toBe(true);
      expect(work.added.filter((a) => a.from !== U).every((a) => a.to === U && a.kind === 'player')).toBe(true);
      expect(dealAddsText(l, work.added)).toContain(` to ${l.teams[THIRD].abbrev}`);
      // a deal they take as it is needs nothing; an untouchable is never spent; rules no asset fixes say so
      expect(makeDealWork(l, ring)).toMatchObject({ legs: ring, added: [] });
      const spent = work.added.filter((a) => a.from === U && a.kind === 'player').map((a) => a.id);
      l.untouchable = spent;
      const again = makeDealWork(l, robbed);
      if (again.legs) for (const pid of spent) expect(again.legs.flatMap((x) => x.pids)).not.toContain(pid);
      delete l.untouchable;
      expect(makeDealWork(l, [...ring, leg(U, THIRD, { pids: [mine.pid] })])).toEqual({ legs: null, why: 'rules' });
    }
    // an AI three-team deal: a buyer over the cap gets a star, and a third team with room takes the salary the seller can't
    {
      const g = termsLeague(7);
      const [B, S, F] = [3, 4, 5];
      g.teams[B].strategy = 'contend';
      g.teams[S].strategy = 'rebuild';
      // (a retooling third team: a rebuilder wants more than two late picks for two years of a 29-year-old's overpay)
      g.teams[F].strategy = 'retool';
      const rb = standardRoster(g, B).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
      const rs = standardRoster(g, S).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
      // the buyer: three good players it keeps, a mid contract to send out, and youth the seller would want
      rb.slice(0, 3).forEach((p) => shape(g, p, 86, 27, 38000));
      shape(g, rb[3], 74, 29, 24000);
      shape(g, rb[4], 76, 21, 4000, 3);
      shape(g, rb[5], 74, 22, 3500, 3);
      rb.slice(6).forEach((p) => shape(g, p, 62, 27, 2500, 1));
      // the seller: a star on a big deal, and a payroll that can't take a mid contract back
      const vet = shape(g, rs[0], 85, 31, 30000);
      rs.slice(1, 6).forEach((p) => shape(g, p, 78, 26, 30000));
      rs.slice(6).forEach((p) => shape(g, p, 62, 24, 2500, 1));
      // the third team: nothing on its books
      standardRoster(g, F).forEach((p) => shape(g, p, 66, 24, 2500, 1));
      const legs = facilitatedDeal(g, B, S, vet);
      expect(legs).not.toBeNull();
      expect(new Set(dealTeams(legs!))).toEqual(new Set([B, S, F]));
      expect(validateDeal(g, legs!)).toEqual([]);
      // all three sign off on all they send against all they get
      for (const tid of [B, S, F]) expect(dealDelta(g, legs!, tid)).toBeGreaterThanOrEqual(0);
      expect(evaluateDeal(g, legs!).accept).toBe(true);
      // the star to the buyer; the salary to the third team, paid for in picks; the seller paid in youth and picks
      expect(legs!.find((x) => x.tid === S && x.to === B)!.pids).toEqual([vet.pid]);
      const toThird = legs!.find((x) => x.tid === B && x.to === F)!;
      expect(toThird.pids).toEqual([rb[3].pid]);
      expect(legs!.some((x) => x.tid === F)).toBe(false);
      const toSeller = legs!.find((x) => x.tid === B && x.to === S)!;
      expect(toSeller.pids.length + toSeller.dpids.length).toBeGreaterThan(0);
      expect(toSeller.pids.every((pid) => playerAge(g.players[pid], g.season) <= 25)).toBe(true);
      // (its best stay home, and no more than two firsts leave in all)
      for (const p of rb.slice(0, 3)) expect(legs!.flatMap((x) => x.pids)).not.toContain(p.pid);
      const firsts = legs!.flatMap((x) => x.dpids).filter((d) => g.draftPicks.find((x) => x.dpid === d)!.round === 1).length;
      expect(firsts).toBeLessThanOrEqual(MAX_FIRSTS_OUT);
      executeDeal(g, legs!);
      expect([vet.tid, rb[3].tid]).toEqual([B, F]);
      expect(g.news[g.news.length - 1].text.startsWith('Three-team trade: ')).toBe(true);
      // a buyer with the room to take him needs no third team: that is a two-team deal
      const h = termsLeague(7);
      standardRoster(h, B).forEach((p) => shape(h, p, 66, 24, 2500, 1));
      expect(facilitatedDeal(h, B, S, shape(h, standardRoster(h, S)[0], 85, 31, 30000))).toBeNull();
    }
    // made: everyone lands where his leg sent him, the picks too, and the news tells it by who got what
    const pick = own(l, THIRD, l.season + 3, 2);
    const done = [...ring.slice(0, 2), leg(THIRD, U, { pids: [third.pid], dpids: [pick.dpid] })];
    expect(validateDeal(l, done)).toEqual([]);
    const txns = l.transactions?.length ?? 0;
    executeDeal(l, done);
    expect([mine.tid, theirs.tid, third.tid, pick.tid]).toEqual([AI, THIRD, U, U]);
    expect(l.teams[U].rotation.order).toContain(third.pid);
    expect(l.teams[U].rotation.order).not.toContain(mine.pid);
    expect(mine.tradedFrom?.tid).toBe(U);
    const news = l.news[l.news.length - 1];
    expect(news.text.startsWith(`Three-team trade: ${teamCity(l, U)} gets `)).toBe(true);
    expect(news.tids).toEqual([U, AI, THIRD]);
    expect(news.text).toContain(`${mine.firstName} ${mine.lastName} from ${teamCity(l, U)}`);
    expect((l.transactions?.length ?? 0) - txns).toBe(1);
    expect(l.transactions![l.transactions!.length - 1].tids).toEqual([U, AI, THIRD]);
    // (and nobody he sent away comes straight back through a third team)
    expect(validateDeal(l, [leg(AI, U, { pids: [mine.pid] }), leg(U, AI, { pids: [restU[0].pid] })]).some((e) => e.includes("can't get him back until next season"))).toBe(true);
  }
}, 120_000);

it('deal terms: protections on your own firsts, pick swaps and cash, and how they count in a deal (G1-G3)', () => {
  // the last look's account of a deal (tradeImpact): your best player sent away leaves the starting
  // five and someone takes his place, your own first and the swap right are the future given up
  {
    const l = termsLeague();
    const best = [...standardRoster(l, U)].sort((a, b) => b.ovr - a.ovr)[0];
    // (done growing: a young one still growing is part of the future too)
    best.pot = best.ovr;
    const dp = own(l, U, l.season + 1);
    const swapYear = l.season + 2;
    const im = tradeImpact(l, deal({ pids: [best.pid], dpids: [dp.dpid], swaps: [swapYear] }, { pids: [standardRoster(l, AI).sort((a, b) => a.ovr - b.ovr)[0].pid] }));
    const gone = im.moves.find((m) => m.pid === best.pid)!;
    expect(gone).toMatchObject({ dealt: 'out', to: 0 });
    if (gone.startsNow) expect(changesStarters(im) && im.moves.some((m) => m.startsWith && !m.startsNow)).toBe(true);
    expect(im.future).toEqual([`Your ${dp.season} first`, `The right to swap firsts in ${swapYear}`]);
    expect(im.manual).toBe(false);
  }

  // a rotation he runs himself: the read is the game's (his order and minutes kept, the newcomer at
  // the end with none), not the staff's, and after the deal the game plays it that way
  {
    const l = termsLeague();
    const team = l.teams[U];
    team.rotation.manual = true;
    const theirs = [...standardRoster(l, AI)].sort((a, b) => b.ovr - a.ovr)[0];
    const mine = [...standardRoster(l, U)].sort((a, b) => a.ovr - b.ovr)[0];
    const o = deal({ pids: [mine.pid] }, { pids: [theirs.pid] });
    const im = tradeImpact(l, o);
    expect(im.manual).toBe(true);
    const inc = im.moves.find((m) => m.pid === theirs.pid);
    expect(inc?.startsWith ?? false).toBe(false);
    expect(inc?.to ?? 0).toBeLessThan(12);
    executeTrade(l, o);
    ensureRotation(l, U);
    expect(team.rotation.order.at(-1)).toBe(theirs.pid);
    expect(team.rotation.minutes[theirs.pid] ?? 0).toBe(0);
    // a need a deal filled is kept on its log line, in the shape the review reads
    const need = l.transactions!.at(-1)!.need;
    if (need) expect(need.rankTo).toBeLessThan(need.rankFrom);
  }

  // the season's review keeps a deal of picks alone, each pick named as sent, flagged while its draft
  // is still to come, and the cash; a player's role reads as games, minutes, his line and the net on court
  {
    const l = termsLeague();
    const dp = own(l, U, l.season + 1);
    const theirs = own(l, AI, l.season + 2, 2);
    executeTrade(l, deal({ dpids: [dp.dpid], cash: 500 }, { dpids: [theirs.dpid] }));
    const threads = decisionThreads(l, l.season, U);
    // (one thread a move, each part said once: what came in, what it cost, and the picks still open)
    expect(threads[0]).toEqual({
      title: `Trade with ${l.teams[AI].abbrev}`,
      // (its takeaway in a line, the rows its evidence)
      summary: 'No players: 2 picks still to come.',
      rows: [
        ['In', `the ${l.teams[AI].abbrev} ${theirs.season} 2nd`],
        ['Cost', `your ${dp.season} 1st, $0.5M cash`],
        ['Open', `Draft still to come: the ${l.teams[AI].abbrev} ${theirs.season} 2nd (coming to you), your ${dp.season} 1st (owed).`],
      ],
    });
    // a training focus is graded on the skills it trains and what the rest of his game gave up, not his OVR
    // (one young enough to develop at the season's check-ins)
    const p = [...standardRoster(l, U)].filter((x) => playerAge(x, l.season) <= 26).sort((a, b) => b.ovr - a.ovr)[0];
    p.training = 'shooting';
    const r0 = { ...p.ratings };
    p.ratingsHistory = [
      { season: l.season - 1, ovr: p.ovr, pot: p.pot, r: { ...r0, tp: r0.tp - 3, mid: r0.mid - 3, ft: r0.ft - 3 } },
      { season: l.season, ovr: p.ovr, pot: p.pot, r: r0, focus: 'shooting' },
    ];
    // (how long it ran, what its skills did, and no claim against balanced work it never saw)
    const training = () => decisionThreads(l, l.season, U).find((t) => t.title === 'Training focus')!;
    expect(training().rows[0]).toEqual([
      `${p.firstName} ${p.lastName}, shooting`,
      "In place since last summer: its skills +3.0, the rest of his game 0.0. The focused skills grew; what balanced work would have done isn't known.",
    ]);
    // a focus that no development step has run under (set after the season's last check-in) isn't
    // read as progress: it says so, and when the next one is
    p.ratingsHistory[1] = { ...p.ratingsHistory[1], focus: 'balanced' };
    l.devWatch = { season: l.season, start: {}, checks: [{ day: l.day - 50, ovr: {} }], told: [] };
    p.trainingSince = { season: l.season, day: l.day - 40, r: { ...r0, tp: r0.tp - 1, mid: r0.mid - 1, ft: r0.ft - 1 } };
    expect(training().rows[0][1]).toMatch(
      /^Set 40 days ago: no development step has run under it yet, so there is nothing to read\. The next is (the summer|the check-in on .+)\.$/,
    );
    expect(training().summary).toBe('1 focus: no development step yet.');
    // one that has had a check-in: a focus set days ago isn't read at all
    l.devWatch.checks.push({ day: l.day, ovr: {} });
    p.trainingSince = { season: l.season, day: l.day };
    expect(training().rows[0][1]).toBe('Set 0 days ago: too soon to read.');
    // read from his ratings the day it was set: what his shooting did before it (here +3 since opening night) isn't its doing
    p.ratingsHistory[1] = { ...p.ratingsHistory[1], r: { ...r0, tp: r0.tp - 3, mid: r0.mid - 3, ft: r0.ft - 3 } };
    p.trainingSince = { season: l.season, day: l.day - 40, r: { ...r0, tp: r0.tp - 1, mid: r0.mid - 1, ft: r0.ft - 1 } };
    expect(training().rows[0][1]).toBe(
      "Set 40 days ago: its skills +1.0, the rest of his game 0.0. The focused skills barely moved; what balanced work would have done isn't known.",
    );
    // a tactical change read only as it was made is a forecast, never told as what happened; a check is
    l.tacticEdits = [
      { id: 1, season: l.season, day: 1, what: 'Tempo: Balanced → Up-tempo', diff: [], ahead: [], worth: { pts: 2, raw: 2, se: 0.5, games: 5 } },
      {
        id: 2,
        season: l.season,
        day: 2,
        what: 'Help defense: Balanced → Stay home',
        diff: [],
        ahead: [],
        worth: { pts: 2, raw: 2, se: 0.5, games: 5 },
        check: { pts: -2, raw: -2, se: 0.5, games: 10, day: 30 },
      },
    ];
    expect(decisionThreads(l, l.season, U).find((t) => t.title === 'Tactical changes')!.summary).toBe('2 changes: 1 hurt, 1 not checked.');
    expect(training().summary).toBe('1 focus: barely moved.');
    expect(decisionThreads(l, l.season, U).find((t) => t.title === 'Tactical changes')!.rows).toEqual([
      ['Help defense: Balanced → Stay home', 'Checked on 10 games played with it: seems to hurt.'],
      ['Tempo: Balanced → Up-tempo', 'No games played with it, so nothing to check.'],
    ]);
  }

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
    // (in a deal with the user a first counts at the market's rate: FIRST_MARKET over the player it's expected to become)
    expect(pickValue(l, dp) * FIRST_MARKET).toBeCloseTo(evaluateTrade(l, deal({}, { dpids: [dp.dpid] })).parts.outgoing[0].neutral, 9);
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
    // (the user's side of it at his market's rate for a first: FIRST_MARKET)
    expect(neutralBalance(l, o).out).toBeCloseTo(held * FIRST_MARKET, 6);
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
        `^Top-20 protection: your ${dp.season} 1st stays yours if it lands in the top 20, and then nothing is owed\\. That's about ${odds}% likely today\\. ${l.teams[AI].abbrev} count it \\d+% lower for that\\.$`,
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

  // a pick is priced from projected strength from opening night: the worst roster's own first well
  // above the best's before a game is played (every first was priced at the middle's value then),
  // with a range for every pick ("proj. #lo-hi", the slot once it's set)
  {
    const l = termsLeague();
    const roster = (tid: number, d: number) => {
      for (const p of standardRoster(l, tid)) p.ovr = Math.max(40, Math.min(99, p.ovr + d));
    };
    roster(AI, -10);
    roster(THIRD, 10);
    const y = l.season;
    const weak = pickValue(l, own(l, AI, y));
    const strong = pickValue(l, own(l, THIRD, y));
    expect(weak).toBeGreaterThan(strong * 1.5);
    expect(topOdds(l, own(l, AI, y), 4)).toBeGreaterThan(topOdds(l, own(l, THIRD, y), 4));
    const a = pickRange(l, own(l, AI, y))!;
    const b = pickRange(l, own(l, THIRD, y))!;
    expect(a.lo).toBeLessThanOrEqual(a.hi);
    expect(a.hi).toBeLessThan(b.lo);
    // a later draft drifts toward the middle
    const later = pickRange(l, own(l, AI, y + 2))!;
    expect(later.mean).toBeGreaterThan(a.mean);
    // a second-rounder's range is in the second round
    const second = l.draftPicks.find((d) => d.season === y && d.round === 2 && d.originalTid === AI)!;
    expect(pickRange(l, second)!.lo).toBeGreaterThan(30);
    own(l, AI, y).pick = 3;
    expect(pickRange(l, own(l, AI, y))).toBeNull();
    delete own(l, AI, y).pick;
  }

  // is worth a lot from a much worse team and next to nothing from a much better one, for the holder and against the other
  {
    const l = termsLeague();
    // (a full season's records: the projection reads the rosters too until the games are in)
    for (const t of l.teams) record(l, t.tid, 41, 41);
    record(l, U, 41, 41);
    record(l, AI, 6, 76);
    record(l, THIRD, 76, 6);
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
        `^${y + 1} swap: you may take ${l.teams[AI].abbrev}'s ${y + 1} 1st for yours if theirs lands higher\\. That's about \\d+% likely today\\. It costs them about \\d+% of their pick\\.$`,
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
      // what the drawing made news of waits for the user's reveal of it, so nothing tells his slot first
      expect(l.inbox.some((m) => m.subject.startsWith('Pick swap')) || l.news.some((n) => n.text.startsWith('Pick swap:'))).toBe(false);
      expect(lotteryRevealed(l)).toBe(false);
      revealLottery(l);
      expect(lotteryRevealed(l)).toBe(true);
      if (used) {
        expect(txnText(l, txnLine(swaps[0], { tid: U }))).toBe(`Swapped firsts with ${l.teams[AI].abbrev}: took the ${y} 1st #${subject.pick} for the ${y} 1st #${right.pick}`);
        expect(l.news.some((n) => n.text.startsWith('Pick swap:') && n.text.includes(`picks #${subject.pick} instead of #${right.pick}`))).toBe(true);
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
    expect(txnText(l, txnLine(txn, { tid: U }))).toBe(`Acquired a ${second.season} 2nd from ${l.teams[AI].abbrev}. Sent $3.0M in cash`);
    expect(l.news.at(-1)!.text).toBe(`Trade: ${teamCity(l, U)} sends $3.0M in cash to ${teamCity(l, AI)} for ${second.season} 2nd (${l.teams[AI].abbrev}).`);
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
    expect(split().warn).toMatch(/give up (much|far) more than you get/);
    expect(split().get).toBeCloseTo(1, 9);
    expect(split({ [dp.dpid]: 20 }).give).toBeLessThan(split().give);
    expect(neutralBalance(l, deal({ dpids: [dp.dpid], protect: { [dp.dpid]: 20 } }, { cash: 1_000 })).net).toBeCloseTo(1 - split({ [dp.dpid]: 20 }).give, 9);
    // the swap and cash show in the news line
    const y = l.season + 2;
    executeTrade(l, deal({ swaps: [y], cash: 1_000 }, { dpids: [own(l, AI, l.season + 1, 2).dpid] }));
    expect(l.news.at(-1)!.text).toBe(
      `Trade: ${teamCity(l, U)} sends the right to swap ${y} firsts and $1.0M in cash to ${teamCity(l, AI)}. ${teamCity(l, AI)} sends back ${l.season + 1} 2nd (${l.teams[AI].abbrev}).`,
    );
    const txn = l.transactions!.at(-1)!;
    expect(txnText(l, txnLine(txn, { tid: AI }))).toBe(`Acquired the right to swap ${y} firsts and $1.0M in cash from ${l.teams[U].abbrev}. Sent a ${l.season + 1} 2nd`);
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
