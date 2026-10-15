// Fixes from the review of restricted free agency: a pending offer sheet (and the user's pending
// offers) holds a spot under the 21-man summer limit on every path that adds a player (re-signing
// one's own restricted free agent, matching, an AI team matching or coming to terms, AI signings);
// free agency goes a day at a time while a sheet on the user's player waits; and a player whose
// trade request a promise only put on hold won't re-sign or extend.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, contractSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers } from '../league/helpers';
import { askingContract, extensionClosedReason, signPlayer, summerRoster } from '../league/contracts';
import { userOffer, userResign } from '../league/freeAgency';
import { aiMatchVerdict, qualifyingOffer, resolveOfferSheets, setRfaHold, sheetDecisionBlocked, signOfferSheet, userDecideSheet } from '../league/rfa';
import { faAdvance } from '../league/season';
import { meetPlayer } from '../league/morale';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const R = 1;
const B = 2;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `sr${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `rfa_${rngSeed}`;
  return l;
}

/** Free agency with every team over the cap and without the mid-level; `open` gives a team room. */
function summer() {
  const l = league();
  l.phase = 'freeAgency';
  l.faDay = 0;
  const s = contractSeason(l);
  const cap = CAP_FOR(l, s);
  for (const t of l.teams) {
    t.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap }];
    t.mleSeason = s;
    t.baeSeason = s;
  }
  const open = (tid: number, space?: number) => {
    const t = l.teams[tid];
    t.deadMoney = [];
    t.strategy = 'retool';
    for (const p of teamPlayers(l, tid)) p.contract = { start: s, salaries: [cap.vetMin] };
    if (space !== undefined) t.deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, tid, s) - space });
  };
  return { l, s, cap, open };
}

/** A restricted free agent of team `tid`: a young 76 off a cheap deal, qualified. */
function rfa(l: League, tid: number): Player {
  const p = freeAgents(l).find((x) => !x.rfa)!;
  p.ovr = p.pot = 76;
  p.bornYear = l.season - 23;
  p.injury = null;
  p.experience = 2;
  p.mood.tradeRequest = false;
  p.mood.score = 2;
  p.contract = { start: l.season - 1, salaries: [3000, 3000] };
  p.draft = { year: l.season - 3, round: 2, pick: 40, tid };
  p.stats = p.stats.filter((x) => x.season !== l.season);
  p.tid = tid;
  statsLine(p, l.season, tid, false).gp = 60;
  p.rfa = { tid, qo: qualifyingOffer(l, p) };
  setRfaHold(l, p);
  p.tid = FREE_AGENT;
  p.asking = undefined;
  p.asking = askingContract(l, p);
  p.faDays = 5;
  return p;
}

const fillTo = (l: League, tid: number, n: number, s: number) => {
  while (standardRoster(l, tid).length < n) signPlayer(l, freeAgents(l).filter((x) => !x.rfa)[0], tid, CAP_FOR(l, s).vetMin, 1, { news: false, start: s });
};
const atAsk = (l: League, p: Player, years: number) => Math.ceil((askingContract(l, p, U).amount * (1 + Math.abs(years - askingContract(l, p, U).years) * 0.03)) / 50) * 50;

describe('a pending offer sheet holds a summer roster spot', () => {
  it("the user's own: re-signing his restricted free agent waits for a spot, so the sheet can't take him to 22", () => {
    const { l, s, cap, open } = summer();
    open(U, 40_000);
    open(R);
    const mine = rfa(l, U);
    const theirs = rfa(l, R);
    // R can't match (its payroll is past what it will spend)
    l.teams[R].deadMoney.push({ pid: -4, name: 'z', season: s, amount: cap.luxuryTax });
    fillTo(l, U, OFFSEASON_ROSTER_MAX - 1, s);
    expect(userOffer(l, theirs.pid, atAsk(l, theirs, 3), 3).ok).toBe(true);
    expect(summerRoster(l, U)).toBe(OFFSEASON_ROSTER_MAX);
    const ask = askingContract(l, mine, U);
    expect(userResign(l, mine.pid, ask.amount, ask.years).reason).toMatch(/roster is full for next season \(21, counting your pending offers and offer sheets\)/);
    // nor can he match a sheet on his own man
    signOfferSheet(l, mine, B, askingContract(l, mine, B).amount, 3, 'min', 0);
    expect(sheetDecisionBlocked(l, mine.pid, true)).toMatch(/Matching needs a roster spot/);
    expect(userDecideSheet(l, mine.pid, true).ok).toBe(false);
    resolveOfferSheets(l);
    expect(theirs.tid).toBe(U);
    expect(standardRoster(l, U).length).toBe(OFFSEASON_ROSTER_MAX);
  });

  it("an AI team with a sheet of its own pending at 20 can't match another, and stays at 21", () => {
    const { l, s, open } = summer();
    open(U, 40_000);
    open(R);
    open(B);
    const rRfa = rfa(l, R);
    const bRfa = rfa(l, B);
    l.teams[B].deadMoney.push({ pid: -4, name: 'z', season: s, amount: CAP_FOR(l, s).luxuryTax });
    fillTo(l, R, OFFSEASON_ROSTER_MAX - 1, s);
    signOfferSheet(l, bRfa, R, askingContract(l, bRfa, R).amount, 3, 'min', 1);
    expect(summerRoster(l, R)).toBe(OFFSEASON_ROSTER_MAX);
    expect(userOffer(l, rRfa.pid, atAsk(l, rRfa, 3), 3).ok).toBe(true);
    expect(aiMatchVerdict(l, rRfa)).toMatchObject({ match: false, why: expect.stringMatching(/no roster spot/) });
    resolveOfferSheets(l);
    expect(rRfa.tid).toBe(U);
    expect(bRfa.tid).toBe(R);
    expect(standardRoster(l, R).length).toBe(OFFSEASON_ROSTER_MAX);
  });
});

describe('free agency waits on an offer sheet', () => {
  it('advancing a week goes a day at a time while a sheet on your restricted free agent waits for your call', () => {
    const { l, open } = summer();
    open(U, 40_000);
    open(B, 40_000);
    const mine = rfa(l, U);
    l.faDay = 3;
    signOfferSheet(l, mine, B, askingContract(l, mine, B).amount, 3, 'space', 3);
    expect(mine.rfa!.sheet!.until).toBe(4);
    faAdvance(l, 7);
    // one day on, his last match day: still his to decide
    expect(l.faDay).toBe(4);
    expect(mine.tid).toBe(FREE_AGENT);
    expect(mine.rfa?.sheet).toBeDefined();
    // left unanswered, the next day lets him go
    faAdvance(l, 7);
    expect(mine.tid).toBe(B);
    expect(l.faDay).toBeGreaterThan(5);
  });
});

describe('a trade request on hold', () => {
  it("a player whose request a promise put on hold won't re-sign or extend while it stands", () => {
    const l = league();
    l.phase = 'resign';
    const p = teamPlayers(l, U)[0];
    p.contract = { start: l.season - 1, salaries: [10_000, 10_000] };
    p.mood.tradeRequest = true;
    p.mood.score = -7;
    p.mood.expectedMin = 30;
    const ask = askingContract(l, p, U);
    expect(userResign(l, p.pid, ask.amount, ask.years).reason).toMatch(/wants out/);
    expect(meetPlayer(l, p.pid, 'role').ok).toBe(true);
    expect(p.mood.tradeRequest).toBe(false);
    expect(p.promise?.request).toBe(true);
    const ask2 = askingContract(l, p, U);
    expect(userResign(l, p.pid, ask2.amount, ask2.years).reason).toMatch(/your promise has him holding off, but he won't re-sign/);
    // an extension the same
    const q = teamPlayers(l, U)[1];
    q.contract = { start: l.season, salaries: [9_000, 9_000] };
    q.tradeLock = undefined;
    q.promise = { kind: 'patience', tid: U, season: l.season, day: l.day, request: true };
    expect(extensionClosedReason(l, q)).toMatch(/while your promise has it on hold/);
  });
});
