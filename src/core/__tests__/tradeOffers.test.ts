// Making deals: "what would make this work?", counter-offers, the trade finder and the trading
// block's packages; AI trade offers to the user (proposals) and untouchables, AI-to-AI trades, the
// trade deadline's ramp, rumors and recap, and draft night stopped before every pick. Fictional
// leagues keep these fast and deterministic: each scenario builds the league it needs.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { advanceDay, continueDraft, draftNextPick, startDraft, startRegularSeason, userDraftPick } from '../league/season';
import { CAP_FOR, contractSeason, dateToDay, fmtDate, freeAgents, payroll, prospects, standardRoster } from '../league/helpers';
import { DEC_15, marketSalary, releasePlayer, signPlayer, tradeValue } from '../league/contracts';
import { capPayroll } from '../league/freeAgency';
import {
  MAX_OPEN,
  acceptProposal,
  aiProposals,
  cleanProposals,
  declineProposal,
  draftProposals,
  freeAgencyProposals,
  isUntouchable,
  markOffersSeen,
  offerSubject,
  openProposals,
  proposalError,
  setUntouchable,
} from '../league/proposals';
import { deadlineDay, seasonTrades } from '../league/deadline';
import { agenda } from '../league/agenda';
import {
  MAX_FIRSTS_OUT,
  capSalary,
  evaluateTrade,
  executeTrade,
  neutralSplit,
  salaryMatchGap,
  tradeMatchLimit,
  untradeable,
  validateTrade,
  type TradeOffer,
} from '../league/trades';
import { MAX_PICKS_OUT, neutralBalance, packageFor } from '../league/tradePackages';
import { aiPackage, aiToAiTrade, aiTradeRate, onTheBlock } from '../league/aiTrades';
import { availability, filterTargets, maxTakeBack, tradeTargets, valueTier, type ValueTier } from '../league/tradeFinder';
import { canMakeWork, counterOffers, makeItWork } from '../league/tradeHelp';
import { nextPick, runLottery } from '../league/draft';
import { CAP } from '../constants';
import { Rng } from '../random';
import type { League, Player, Proposal } from '../types';
import { DRAFT_PROSPECT } from '../types';

const U = 0;
const AI = 1;

function txLeague(rngSeed = 5): League {
  return createLeague({ name: `tx${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
}

function negLeague(rngSeed = 5): League {
  const l = createLeague({ name: `neg${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.settings.difficulty = 'normal';
  return l;
}

function prLeague(rngSeed = 5, userTid = U): League {
  const l = createLeague({ name: `pr${rngSeed}`, userTid, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // offers and rumors draw on streams seeded by the league's id, which is made from the clock
  l.id = `pr${rngSeed}`;
  return l;
}

/** A league in its regular season, with the user's roster at 15. */
function prSeason(rngSeed = 5): League {
  const l = prLeague(rngSeed);
  while (standardRoster(l, U).length > 15) releasePlayer(l, standardRoster(l, U)[0], { news: false });
  expect(startRegularSeason(l)).toEqual([]);
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

/** Every counter passes the rules and the AI's yes, moves only what each side owns, and comes best for you first. */
function check(l: League, o: TradeOffer) {
  const cs = counterOffers(l, o);
  let prev = Infinity;
  for (const c of cs) {
    expect(validateTrade(l, c.offer)).toEqual([]);
    const ev = evaluateTrade(l, c.offer);
    expect(ev.accept).toBe(true);
    expect(c.offer.a.tid).toBe(o.a.tid);
    expect(c.offer.b.tid).toBe(o.b.tid);
    for (const side of [c.offer.a, c.offer.b]) {
      for (const pid of side.pids) expect(l.players[pid].tid).toBe(side.tid);
      for (const d of side.dpids) expect(l.draftPicks.find((x) => x.dpid === d)!.tid).toBe(side.tid);
    }
    // nothing of yours that wasn't already in the deal goes away by itself: only what "add" adds
    if (c.kind !== 'add' && !c.label.includes(', add ')) {
      expect(c.offer.a).toEqual(o.a);
    }
    const { give, get } = neutralSplit(ev.parts, c.offer);
    expect(get - give).toBeLessThanOrEqual(prev + 1e-9);
    prev = get - give;
    expect(c.label.length).toBeGreaterThan(0);
  }
  return cs;
}

const RANK: ValueTier[] = ['Franchise', 'All-Star', 'Starter', 'Rotation', 'Depth', 'Negative'];

/** Each AI team's best package for the user's players and picks in `give`, where it has one. */
const packages = (l: League, give: { pids: number[]; dpids: number[] }) =>
  l.teams.flatMap((t) => (t.tid === l.userTid ? [] : [packageFor(l, t.tid, give)].filter((x) => x !== null)));

/** Every offer made on each day up to the deadline (the daily clean-up in between), checked as it is made. */
function offersThroughDeadline(l: League, check: (p: Proposal) => void): Proposal[] {
  const made: Proposal[] = [];
  for (let d = l.day; d <= l.tradeDeadlineDay; d++) {
    l.day = d;
    cleanProposals(l);
    const before = new Set(openProposals(l).map((p) => p.id));
    aiProposals(l);
    for (const p of openProposals(l).filter((x) => !before.has(x.id))) {
      check(p);
      made.push(p);
    }
  }
  return made;
}

/** Days go by (offers made, the daily clean-up) until an open offer matches `want`. */
function waitForOffer(l: League, want: (p: Proposal) => boolean = () => true): Proposal | undefined {
  for (let d = l.day; d <= l.tradeDeadlineDay; d++) {
    l.day = d;
    cleanProposals(l);
    aiProposals(l);
    const p = openProposals(l).find(want);
    if (p) return p;
  }
  return undefined;
}

/** Draft night: the lottery run. */
function lottery(rngSeed = 5): League {
  const l = prLeague(rngSeed);
  l.phase = 'draftLottery';
  runLottery(l, new Rng(3));
  return l;
}
const drafted = (l: League) => Object.values(l.players).filter((p) => p.draft.year === l.season && p.draft.round > 0 && p.tid !== DRAFT_PROSPECT).length;

it('help and the finder: "what would make this work?", counter-offers, value tiers and availability, the finder\'s filters and take-back, the trading block\'s packages', () => {
  // "what would make this work?" fixes our salary matching first (UI2-1)
  {
    const l = txLeague(11);
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    // we're over the cap, asking for a $12M player while sending nothing
    l.teams[U].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).salaryCap });
    const target = shape(l, standardRoster(l, AI)[0], 74, 27, 12_000);
    const ask = offer([], [target.pid]);
    expect(salaryMatchGap(l, ask, 'a')).toBeGreaterThan(0);
    const fixed = makeItWork(l, ask).offer!;
    expect(fixed).not.toBeNull();
    expect(validateTrade(l, fixed)).toEqual([]);
    expect(evaluateTrade(l, fixed).accept).toBe(true);
  }

  // "what would make this work?" has them add a contract when they can't take back our salary
  {
    const l = txLeague(11);
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const cap = CAP_FOR(l).salaryCap;
    const ours = shape(l, standardRoster(l, U)[0], 82, 27, 30_000);
    const theirs = shape(l, standardRoster(l, AI)[0], 66, 27, 3_000);
    shape(l, standardRoster(l, AI)[1], 70, 31, 22_000);
    // both teams a little over the cap: our $30M player for their $3M one breaks their matching
    for (const tid of [U, AI]) l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: cap + 5_000 - payroll(l, tid) });
    const ask = offer([ours.pid], [theirs.pid]);
    expect(salaryMatchGap(l, ask, 'b')).toBeGreaterThan(0);
    expect(canMakeWork(l, ask)).toBe(true);
    const r = makeItWork(l, ask);
    expect(r.offer).not.toBeNull();
    expect(r.offer!.b.pids).toContain(theirs.pid);
    expect(r.offer!.b.pids.length).toBeGreaterThan(1);
    expect(salaryMatchGap(l, r.offer!, 'b')).toBe(0);
    expect(validateTrade(l, r.offer!)).toEqual([]);
    expect(evaluateTrade(l, r.offer!).accept).toBe(true);
  }

  // "what would make this work?" sends a player when the roster is full or picks fall short
  {
    const l = txLeague(11);
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    // only second-round picks left: a pile of them is worth far less than a good starter
    l.draftPicks = l.draftPicks.filter((d) => d.tid !== U || d.round === 2);
    for (const p of standardRoster(l, U)) shape(l, p, 66, 30, vetMin);
    while (standardRoster(l, U).length < CAP.rosterMax) signPlayer(l, freeAgents(l)[0], U, vetMin, 1, { news: false });
    const target = shape(l, standardRoster(l, AI)[0], 80, 26, vetMin);
    const swap = shape(l, standardRoster(l, U)[0], 81, 26, vetMin);
    const ask = offer([], [target.pid]);
    // a 15-man roster can't take him for nothing, but sending a player fixes that
    expect(validateTrade(l, ask).some((e) => e.includes('max 15'))).toBe(true);
    expect(canMakeWork(l, ask)).toBe(true);
    const r = makeItWork(l, ask);
    expect(r.offer?.a.pids).toEqual([swap.pid]);
    expect(evaluateTrade(l, r.offer!).accept).toBe(true);
  }

  // "what would make this work?" doesn't throw in a star to close a modest gap
  {
    const l = txLeague(11);
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    for (const p of standardRoster(l, U)) shape(l, p, 72, 27, vetMin);
    const star = shape(l, standardRoster(l, U)[0], 94, 27, vetMin);
    const target = shape(l, standardRoster(l, AI)[0], 80, 27, vetMin);
    const r = makeItWork(l, offer([], [target.pid]));
    expect(r.offer).not.toBeNull();
    expect(r.offer!.a.pids).not.toContain(star.pid);
    expect(evaluateTrade(l, r.offer!).accept).toBe(true);
  }

  // are always deals the AI takes, with only assets each side owns, best for you first
  {
    const kinds = new Set<string>();
    let n = 0;
    for (const seed of [3, 7]) {
      const l = negLeague(seed);
      expect(startRegularSeason(l)).toEqual([]);
      const r = new Rng(seed);
      for (let i = 0; i < 80; i++) {
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
          r.chance(0.3) ? [r.pick(l.draftPicks.filter((d) => d.tid === U)).dpid] : [],
          r.chance(0.3) ? [r.pick(l.draftPicks.filter((d) => d.tid === b)).dpid] : [],
          b,
        );
        const ev = evaluateTrade(l, o);
        if (!ev.ok) continue;
        const cs = check(l, o);
        if (ev.accept) expect(cs).toEqual([]);
        for (const c of cs) kinds.add(c.kind);
        n += cs.length;
      }
    }
    expect(n).toBeGreaterThan(5);
    expect(kinds.has('add')).toBe(true);
  }

  // can leave one of their assets home, or have you take a bad contract off their hands
  {
    const l = negLeague();
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    const vetMin = CAP_FOR(l).vetMin;
    const mine = shapeAt(l, standardRoster(l, U)[0], 80, 27, vetMin);
    const theirs = shapeAt(l, standardRoster(l, AI)[0], 80, 27, vetMin);
    const extra = shapeAt(l, standardRoster(l, AI)[1], 76, 25, vetMin);
    // a fair swap plus a good young player on top: they'd keep the extra
    const greedy = offer([mine.pid], [theirs.pid, extra.pid]);
    expect(evaluateTrade(l, greedy).accept).toBe(false);
    const cs = check(l, greedy);
    expect(cs.find((c) => c.kind === 'remove')?.label).toBe(`Without ${extra.firstName} ${extra.lastName}`);

    // a little short, and they have an overpaid veteran to move: taking him closes the gap (and
    // your minimum-salary roster has the cap room for him)
    for (const p of standardRoster(l, U)) if (p !== mine) shapeAt(l, p, 70, 27, vetMin);
    const short = shapeAt(
      l,
      standardRoster(l, U).find((p) => p !== mine)!,
      79,
      27,
      vetMin,
    );
    const bad = shapeAt(l, standardRoster(l, AI)[2], 66, 32, Math.round(CAP_FOR(l).salaryCap * 0.2), 3);
    expect(tradeValue(l, bad)).toBeLessThan(-3);
    const ask = offer([short.pid], [theirs.pid]);
    expect(evaluateTrade(l, ask).accept).toBe(false);
    const absorb = check(l, ask).find((c) => c.kind === 'absorb');
    expect(absorb).toBeDefined();
    expect(absorb!.offer.b.pids).toEqual([theirs.pid, bad.pid]);
    expect(absorb!.label).toMatch(new RegExp(`^Take ${bad.firstName} ${bad.lastName}'s contract \\(\\$[\\d.]+M thru \\d{4}-\\d{2}\\)$`));
  }

  // ranks value tiers in order of trade value
  {
    const l = negLeague(9);
    expect(startRegularSeason(l)).toEqual([]);
    // a couple of bad contracts for the bottom tier
    shapeAt(l, standardRoster(l, 4)[0], 64, 33, Math.round(CAP_FOR(l).salaryCap * 0.2), 3);
    shapeAt(l, standardRoster(l, 6)[0], 66, 32, Math.round(CAP_FOR(l).salaryCap * 0.15), 3);
    const players = Object.values(l.players)
      .filter((p) => p.tid >= 0)
      .map((p) => ({ v: tradeValue(l, p), tier: RANK.indexOf(valueTier(l, p)) }))
      .sort((a, b) => b.v - a.v);
    for (let i = 1; i < players.length; i++) expect(players[i].tier).toBeGreaterThanOrEqual(players[i - 1].tier);
    for (const x of players) expect(x.tier === RANK.indexOf('Negative')).toBe(x.v < 0);
    const count = (t: ValueTier) => players.filter((x) => x.tier === RANK.indexOf(t)).length;
    expect(count('Franchise')).toBeGreaterThan(5);
    expect(count('Franchise')).toBeLessThan(count('All-Star'));
    expect(count('Negative')).toBeGreaterThanOrEqual(2);
  }

  // marks who a team would move and who it builds around, never your own players
  {
    const l = negLeague();
    l.phase = 'regular';
    l.teams[AI].strategy = 'rebuild';
    l.teams[2].strategy = 'contend';
    const vet = shapeAt(l, standardRoster(l, AI)[0], 76, 30);
    expect(availability(l, vet)).toBe('block');
    const same = shapeAt(l, standardRoster(l, 2)[0], 76, 30);
    expect(availability(l, same)).toBe(null);
    const kid = shapeAt(l, standardRoster(l, 2)[1], 92, 22);
    expect(availability(l, kid)).toBe('franchise');
    const bad = shapeAt(l, standardRoster(l, 2)[2], 64, 32, Math.round(CAP_FOR(l).salaryCap * 0.2), 3);
    expect(availability(l, bad)).toBe('block');
    const mine = shapeAt(l, standardRoster(l, U)[0], 92, 22);
    expect(availability(l, mine)).toBe(null);
  }

  // lists every tradeable player on AI teams and filters and sorts them
  {
    const l = negLeague(4);
    expect(startRegularSeason(l)).toEqual([]);
    const locked = standardRoster(l, AI)[0];
    locked.tradeLock = { season: l.season, day: l.day + 30 };
    const rows = tradeTargets(l);
    expect(rows.some((x) => x.p.tid === U)).toBe(false);
    expect(rows.some((x) => x.p.pid === locked.pid)).toBe(false);
    const all = Object.values(l.players).filter((p) => p.tid >= 0 && p.tid !== U && !untradeable(l, p));
    expect(rows.length).toBe(all.length);

    const f = filterTargets(rows, { pos: 'C', minOvr: 70, maxAge: 28, maxSalary: 20_000, sort: 'ovr' });
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) {
      expect(x.p.pos).toBe('C');
      expect(x.p.ovr).toBeGreaterThanOrEqual(70);
      expect(x.age).toBeLessThanOrEqual(28);
      expect(x.salary).toBeLessThanOrEqual(20_000);
    }
    for (let i = 1; i < f.length; i++) expect(f[i].p.ovr).toBeLessThanOrEqual(f[i - 1].p.ovr);
    expect(f.length).toBe(rows.filter((x) => x.p.pos === 'C' && x.p.ovr >= 70 && x.age <= 28 && x.salary <= 20_000).length);

    const avail = filterTargets(rows, { available: true, sort: 'salary' });
    expect(avail.length).toBeGreaterThan(0);
    expect(avail.every((x) => x.avail === 'block')).toBe(true);
    for (let i = 1; i < avail.length; i++) expect(avail[i].salary).toBeLessThanOrEqual(avail[i - 1].salary);
    const byValue = filterTargets(rows, {});
    expect(byValue.length).toBe(rows.length);
    for (let i = 1; i < byValue.length; i++) expect(byValue[i].value).toBeLessThanOrEqual(byValue[i - 1].value);
  }

  // presets the salary you can take back to what two of your contracts can match
  {
    const l = negLeague();
    l.phase = 'regular';
    const roster = standardRoster(l, U)
      .filter((p) => !untradeable(l, p))
      .sort((a, b) => capSalary(l, b.pid) - capSalary(l, a.pid));
    const out = capSalary(l, roster[0].pid) + capSalary(l, roster[1].pid);
    const room = CAP_FOR(l).salaryCap - capPayroll(l, U, l.season);
    expect(maxTakeBack(l, U)).toBeCloseTo(Math.max(room + out, out * 1.25 + 100), 6);
    // a recent signing can't go out, so it doesn't count
    roster[0].tradeLock = { season: l.season, day: l.day + 30 };
    expect(maxTakeBack(l, U)).toBeLessThan(Math.max(room + out, out * 1.25 + 100));
  }

  // keeps a team at the first apron: matching by the tiers under it, no more than it sends past it
  {
    const l = negLeague();
    l.phase = 'regular';
    const top = standardRoster(l, U)
      .filter((p) => !untradeable(l, p))
      .sort((a, b) => capSalary(l, b.pid) - capSalary(l, a.pid));
    const cap = CAP_FOR(l);
    const set = (pay: number) => {
      const raise = pay - capPayroll(l, U, l.season);
      top[0].contract = { start: l.season, salaries: [capSalary(l, top[0].pid) + raise, capSalary(l, top[0].pid) + raise] };
    };
    // well under the first apron: what the tiers allow for its two biggest contracts
    set(cap.salaryCap + 1_000);
    const out = () => capSalary(l, top[0].pid) + capSalary(l, top[1].pid);
    expect(maxTakeBack(l, U)).toBeCloseTo(tradeMatchLimit(l, out()), 6);
    // $1M under the first apron: no more than takes it there
    set(cap.firstApron - 1_000);
    expect(maxTakeBack(l, U)).toBeCloseTo(out() + 1_000, 6);
    // the most it allows passes the rules, a dollar more doesn't
    const them = standardRoster(l, AI).sort((a, b) => capSalary(l, b.pid) - capSalary(l, a.pid))[0];
    them.contract = { start: l.season, salaries: [out() + 1_000, out() + 1_000] };
    const deal = offer([top[0].pid, top[1].pid], [them.pid]);
    const matchError = (o: TradeOffer) => validateTrade(l, o).some((e) => e.includes("Salary doesn't match"));
    expect(matchError(deal)).toBe(false);
    them.contract.salaries = [out() + 1_001, out() + 1_001];
    expect(matchError(deal)).toBe(true);
  }

  // send two firsts and three picks at most, and nothing the user traded away this season or that just signed (B3, B6)
  {
    const l = prSeason(5);
    // a star everybody wants: picks pile up
    const star = shapeAt(l, standardRoster(l, U)[0], 92, 24, CAP_FOR(l).vetMin, 3);
    // every team's best player just signed, and the user traded each team's first pick away earlier
    for (const t of l.teams.filter((x) => x.tid !== U)) {
      standardRoster(l, t.tid).sort((a, b) => b.ovr - a.ovr)[0].tradeLock = { season: l.season, day: l.day + 30 };
      const dp = l.draftPicks.find((d) => d.tid === t.tid && d.round === 1)!;
      dp.tradedFrom = { tid: U, season: l.season };
    }
    const offers = packages(l, { pids: [star.pid], dpids: [] });
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const picks = o.offer.b.dpids.map((d) => l.draftPicks.find((x) => x.dpid === d)!);
      expect(picks.length).toBeLessThanOrEqual(MAX_PICKS_OUT);
      expect(picks.filter((d) => d.round === 1).length).toBeLessThanOrEqual(MAX_FIRSTS_OUT);
      expect(picks.some((d) => d.tradedFrom?.tid === U)).toBe(false);
      expect(o.offer.b.pids.some((pid) => l.players[pid].tradeLock)).toBe(false);
      expect(evaluateTrade(l, o.offer).accept).toBe(true);
    }
  }

  // can shop a pick, or a player and a pick together
  {
    const l = prSeason(5);
    const pick = l.draftPicks.find((d) => d.tid === U && d.round === 1)!;
    const forPick = packages(l, { pids: [], dpids: [pick.dpid] });
    expect(forPick.length).toBeGreaterThan(0);
    for (const o of forPick) {
      expect(o.offer.a).toEqual({ tid: U, pids: [], dpids: [pick.dpid] });
      expect(evaluateTrade(l, o.offer).accept).toBe(true);
    }
    const p = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr)[1];
    const both = packages(l, { pids: [p.pid], dpids: [pick.dpid] });
    expect(both.length).toBeGreaterThan(0);
    for (const o of both) expect(evaluateTrade(l, o.offer).accept).toBe(true);
  }
}, 120_000);

it("AI deals: offers to the user, AI-to-AI trades, the deadline's ramp, rumors and recap, and draft night", () => {
  // are deals the offering team accepts and the rules allow, never far against the user, four open at most and one per team, with one headline each
  {
    let n = 0;
    for (const seed of [5, 9]) {
      const l = prSeason(seed);
      const made = offersThroughDeadline(l, (p) => {
        expect(validateTrade(l, p.offer)).toEqual([]);
        expect(evaluateTrade(l, p.offer).accept).toBe(true);
        expect(proposalError(l, p)).toBeNull();
        const { net, out } = neutralBalance(l, p.offer);
        expect(net).toBeGreaterThanOrEqual(-0.1 * Math.max(0, out) - 1e-9);
        expect(p.offer.a.tid).toBe(U);
        expect(p.expires - p.day).toBeLessThanOrEqual(7);
        expect(l.inbox.some((m) => m.proposal === p.id)).toBe(true);
        const open = openProposals(l);
        expect(open.length).toBeLessThanOrEqual(MAX_OPEN);
        expect(new Set(open.map((x) => x.tid)).size).toBe(open.length);
        // one headline naming both sides, the same in the inbox and on the agenda, and the pitch in the other GM's name
        const subject = offerSubject(l, p.offer);
        expect(subject.startsWith(`${l.teams[p.tid].abbrev} `)).toBe(true);
        // every player in the deal is named, on either side
        for (const pid of [...p.offer.a.pids, ...p.offer.b.pids]) expect(subject).toContain(l.players[pid].lastName);
        expect(l.inbox.find((m) => m.proposal === p.id)!.subject).toBe(subject);
        const item = agenda(l).find((i) => i.id === `tradeOffer:${p.id}`)!;
        expect(item.title).toBe(subject);
        expect(item.line.startsWith(`${l.teams[p.tid].abbrev} GM: `)).toBe(true);
      });
      n += made.length;
      expect(new Set(made.map((p) => p.kind)).has('buy')).toBe(true);
    }
    expect(n).toBeGreaterThan(4);
  }

  // pitch a player once at a time and rest a pitch three weeks before it comes back, one mail for each
  {
    for (const seed of [5, 9]) {
      const l = prSeason(seed);
      // the day each pitch (what its mail is about) was made
      const days = new Map<string, number[]>();
      // every offer turned down at once: the same pitch would otherwise come straight back
      const made = offersThroughDeadline(l, (p) => {
        const players = (x: Proposal) => [...x.offer.a.pids, ...x.offer.b.pids];
        const others = openProposals(l).filter((x) => x.id !== p.id);
        expect(players(p).some((pid) => others.some((x) => players(x).includes(pid)))).toBe(false);
        const pitch = l.inbox.find((m) => m.proposal === p.id)!.pitch!;
        days.set(pitch, [...(days.get(pitch) ?? []), p.day]);
        declineProposal(l, p.id);
      });
      expect(made.length).toBeGreaterThan(0);
      for (const ds of days.values()) for (let i = 1; i < ds.length; i++) expect(ds[i] - ds[i - 1]).toBeGreaterThanOrEqual(21);
      // each pitch has one mail, however often it was made
      const mail = l.inbox.filter((m) => m.proposal !== undefined).map((m) => `${m.from}|${m.pitch}`);
      expect(new Set(mail).size).toBe(mail.length);
    }
  }

  // never ask for a player the user made untouchable, nor does 'what would make this work?'
  {
    const l = prSeason(9);
    const off = standardRoster(l, U)
      .sort((a, b) => tradeValue(l, b) - tradeValue(l, a))
      .slice(0, 6);
    for (const p of off) setUntouchable(l, p.pid, true);
    expect(off.every((p) => isUntouchable(l, p.pid))).toBe(true);
    const made = offersThroughDeadline(l, (p) => expect(p.offer.a.pids.some((pid) => off.some((x) => x.pid === pid))).toBe(false));
    expect(made.length).toBeGreaterThan(0);
    // asked what it would take for their best player, no team asks for an untouchable
    for (const t of l.teams.slice(1, 8)) {
      const best = standardRoster(l, t.tid).sort((a, b) => b.ovr - a.ovr)[0];
      const r = makeItWork(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: t.tid, pids: [best.pid], dpids: [] } });
      for (const pid of r.offer?.a.pids ?? []) expect(isUntouchable(l, pid)).toBe(false);
    }
  }

  // marking a player untouchable withdraws an offer for him, and the mark goes when he leaves
  {
    const l = prSeason(5);
    const p = waitForOffer(l, (x) => x.offer.a.pids.length > 0);
    expect(p).toBeDefined();
    const pid = p!.offer.a.pids[0];
    setUntouchable(l, pid, true);
    expect(openProposals(l).some((x) => x.id === p!.id)).toBe(false);
    releasePlayer(l, l.players[pid], { news: false });
    expect(l.untouchable).not.toContain(pid);
  }

  // expire after their last day, counted from when the user could see them
  {
    const l = prSeason(5);
    const p = waitForOffer(l)!;
    expect(p).toBeDefined();
    // unseen (its mail unread through a long sim), it keeps standing a few days more, three weeks at most
    const first = p.expires;
    l.day = first + 1;
    cleanProposals(l);
    expect(openProposals(l)).toContain(p);
    expect(p.expires).toBeGreaterThan(first);
    l.day = p.day + 30;
    cleanProposals(l);
    expect(openProposals(l)).not.toContain(p);
    // seen, it ends on its last day
    const q = waitForOffer(l, (x) => x.id !== p.id)!;
    expect(q).toBeDefined();
    for (const m of l.inbox) m.read = true;
    l.day = q.expires;
    cleanProposals(l);
    expect(openProposals(l)).toContain(q);
    l.day = q.expires + 1;
    expect(proposalError(l, q)).toMatch(/expired/);
    cleanProposals(l);
    expect(openProposals(l)).not.toContain(q);
    // once it has been in front of him (on Today with Accept and Turn down), its date stands as
    // shown, mail unread or not; one held while unseen says its new date in its mail
    const r = waitForOffer(l, (x) => x.id !== p.id && x.id !== q.id)!;
    expect(r).toBeDefined();
    const mail = l.inbox.find((m) => m.proposal === r.id)!;
    mail.read = false;
    const shown = r.expires;
    markOffersSeen(l);
    l.day = shown;
    cleanProposals(l);
    expect(r.expires).toBe(shown);
    const s = waitForOffer(l, (x) => ![p.id, q.id, r.id].includes(x.id))!;
    expect(s).toBeDefined();
    l.day = s.expires;
    cleanProposals(l);
    expect(s.expires).toBeGreaterThan(l.day);
    expect(l.inbox.find((m) => m.proposal === s.id)!.body).toContain(`It stands until ${fmtDate(l.season, s.expires)}.`);
  }

  // accepting one goes through; a stale one fails cleanly and changes nothing
  {
    const l = prSeason(9);
    const good = waitForOffer(l)!;
    expect(good).toBeDefined();
    // one goes through: the user's assets move to the offering team
    const r = acceptProposal(l, good.id);
    expect(r.ok).toBe(true);
    for (const pid of good.offer.a.pids) expect(l.players[pid].tid).toBe(good.tid);
    for (const pid of good.offer.b.pids) expect(l.players[pid].tid).toBe(U);
    expect(openProposals(l)).not.toContain(good);
    // another goes stale: a player in it moves elsewhere first
    const l2 = prSeason(5);
    const stale = waitForOffer(l2, (p) => p.offer.b.pids.length > 0)!;
    expect(stale).toBeDefined();
    const moved = stale.offer.b.pids[0];
    const other = l2.teams.find((t) => t.tid !== U && t.tid !== stale.tid)!.tid;
    executeTrade(l2, { a: { tid: stale.tid, pids: [moved], dpids: [] }, b: { tid: other, pids: [], dpids: [] } });
    const owners = new Map(Object.values(l2.players).map((p) => [p.pid, p.tid]));
    const res = acceptProposal(l2, stale.id);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no longer on that team/);
    expect(Object.values(l2.players).every((p) => owners.get(p.pid) === p.tid)).toBe(true);
    expect(openProposals(l2)).not.toContain(stale);
    expect(acceptProposal(l2, stale.id).reason).toMatch(/no longer on the table/);
    expect(declineProposal(l2, 999_999)).toBe(false);
  }

  // taxpayers' salary dumps leave the user ahead in neutral value
  {
    const l = prLeague(7);
    l.phase = 'freeAgency';
    l.day = dateToDay(l.season, 5, 30);
    const cs = contractSeason(l);
    const cap = CAP_FOR(l, cs);
    // the user has room; three AI teams are over the tax, each with a bad contract
    for (const p of standardRoster(l, U)) shapeAt(l, p, p.ovr, 26, cap.vetMin);
    let n = 0;
    for (const tid of [3, 8, 14]) {
      shapeAt(l, standardRoster(l, tid)[0], 66, 31, Math.round(cap.salaryCap * 0.12), 3);
      l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: cs, amount: cap.luxuryTax });
    }
    freeAgencyProposals(l);
    for (const p of openProposals(l)) {
      expect(p.kind).toBe('dump');
      expect(neutralBalance(l, p.offer).net).toBeGreaterThanOrEqual(0);
      expect(evaluateTrade(l, p.offer).accept).toBe(true);
      expect(p.offer.b.dpids.length).toBeLessThanOrEqual(MAX_PICKS_OUT);
      n++;
    }
    expect(n).toBeGreaterThan(0);
  }

  // AI teams trade among themselves only deals the rules allow, with two firsts at most
  {
    const l = txLeague(2);
    expect(startRegularSeason(l)).toEqual([]);
    // some fresh signings that can't move yet, and contenders that used the mid-level
    for (const p of Object.values(l.players).filter((x) => x.tid > 0 && x.pid % 3 === 0)) p.tradeLock = { season: l.season, day: DEC_15 };
    for (const t of l.teams.filter((x) => x.strategy === 'contend')) t.mleSeason = l.season;
    let trades = 0;
    for (let i = 0; i < 150; i++) {
      const before: League = structuredClone(l);
      const logged = l.transactions?.length ?? 0;
      aiToAiTrade(l, new Rng(i + 1));
      // (a team over 15 waives its end of the bench after the deal: those go to free agency, not the other side)
      const moved = Object.values(l.players).filter((p) => before.players[p.pid]?.tid !== p.tid && p.tid >= 0);
      const picks = l.draftPicks.filter((d) => before.draftPicks.find((x) => x.dpid === d.dpid)!.tid !== d.tid);
      if (!moved.length) continue;
      // a day that brought two deals can't be told apart from its moves: each is checked on a day of its own
      if ((l.transactions ?? []).slice(logged).filter((t) => t.kind === 'trade').length > 1) continue;
      trades++;
      // the buyer sends players and picks for one veteran
      const from = (p: Player) => before.players[p.pid].tid;
      const sides = [...new Set(moved.map(from))];
      const buyer = picks.length ? before.draftPicks.find((x) => x.dpid === picks[0].dpid)!.tid : (sides.find((t) => moved.filter((p) => from(p) === t).length > 1) ?? sides[0]);
      const seller = sides.find((t) => t !== buyer)!;
      const deal: TradeOffer = {
        a: { tid: buyer, pids: moved.filter((p) => from(p) === buyer).map((p) => p.pid), dpids: picks.map((d) => d.dpid) },
        b: { tid: seller, pids: moved.filter((p) => from(p) === seller).map((p) => p.pid), dpids: [] },
      };
      expect(validateTrade(before, deal)).toEqual([]);
      expect(picks.filter((d) => d.round === 1).length).toBeLessThanOrEqual(MAX_FIRSTS_OUT);
    }
    expect(trades).toBeGreaterThan(0);
  }

  // an AI buyer holding its own second-rounders still offers firsts: the cheapest picks make way for better ones
  {
    const l = txLeague();
    l.phase = 'regular';
    const [S, B] = [1, 2];
    for (const t of l.teams) t.strategy = 'retool';
    l.teams[S].strategy = 'rebuild';
    l.teams[B].strategy = 'contend';
    // the rebuilder's one veteran (31: only a contender buys him), on a minimum deal so the
    // salaries match with anyone; the contender has no young players to offer, only picks
    const vet = shape(l, standardRoster(l, S)[0], 80, 31, CAP_FOR(l).vetMin);
    for (const p of standardRoster(l, S)) if (p !== vet) p.ovr = Math.min(p.ovr, 73);
    for (const p of standardRoster(l, B)) p.bornYear = Math.min(p.bornYear, l.season - 27);
    expect(l.draftPicks.filter((d) => d.tid === B && d.round === 2).length).toBeGreaterThanOrEqual(3);
    const owner = new Map(l.draftPicks.map((d) => [d.dpid, d.tid]));
    const deal = aiPackage(l, B, S, vet);
    expect(deal).not.toBeNull();
    executeTrade(l, deal!);
    // three seconds are nowhere near him: the deal takes firsts (two at most)
    expect(vet.tid).toBe(B);
    const rounds = l.draftPicks.filter((d) => owner.get(d.dpid) !== d.tid).map((d) => d.round);
    expect(rounds).toContain(1);
    expect(rounds.length).toBeLessThanOrEqual(3);
    expect(rounds.filter((r) => r === 1).length).toBeLessThanOrEqual(MAX_FIRSTS_OUT);
  }

  // ramps AI-to-AI deals toward the deadline: some 25-35 a season, nearly half of them in the last week
  {
    const l = prLeague(5);
    l.phase = 'regular';
    const D = l.tradeDeadlineDay;
    const at = (d: number) => {
      l.day = d;
      return aiTradeRate(l);
    };
    let total = 0;
    let lastWeek = 0;
    for (let d = 0; d <= D; d++) {
      total += at(d);
      if (D - d < 7) lastWeek += at(d);
    }
    expect(total).toBeGreaterThan(25);
    expect(total).toBeLessThan(40);
    expect(lastWeek / total).toBeGreaterThan(0.35);
    expect(lastWeek / total).toBeLessThan(0.6);
    expect(at(D)).toBeGreaterThan(at(D - 3));
    expect(at(D - 3)).toBeGreaterThan(at(D - 40));
    expect(at(D + 1)).toBe(0);
    // and the trades themselves cluster: more a day in the last three weeks than before
    const early: number[] = [];
    const late: number[] = [];
    for (const seed of [2, 3, 4]) {
      const s = prSeason(seed);
      const ids = () => s.news.filter((n) => n.text.startsWith('Trade: ')).length;
      const rng = new Rng(seed);
      for (let d = 0; d <= s.tradeDeadlineDay; d++) {
        s.day = d;
        const before = ids();
        aiToAiTrade(s, rng);
        (s.tradeDeadlineDay - d < 21 ? late : early).push(ids() - before);
      }
    }
    const rate = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(rate(late)).toBeGreaterThan(rate(early));
  }

  // lets a contender that used the mid-level, already past the tax, buy for as much salary as it sends
  {
    const l = prSeason(5);
    const [S, B] = [1, 2];
    for (const t of l.teams) t.strategy = t.tid === S ? 'rebuild' : t.tid === B ? 'contend' : 'retool';
    for (const p of Object.values(l.players)) if (p.tid === S || p.tid === B) delete p.tradeLock;
    const vetMin = CAP_FOR(l).vetMin;
    for (const p of standardRoster(l, S)) shapeAt(l, p, 66, 30, vetMin);
    const vet = shapeAt(l, standardRoster(l, S)[0], 84, 30, 10_000);
    // three stars (off the table), a young player paid what the veteran is, the rest on the minimum
    const roster = standardRoster(l, B);
    roster.forEach((p, i) => shapeAt(l, p, i < 3 ? 88 : 70, i < 3 ? 28 : 31, vetMin));
    shapeAt(l, roster[3], 76, 24, 10_000);
    // $5M past the tax: the deal may not add salary, but it needn't get under the line either
    shapeAt(l, roster[0], 88, 28, vetMin + CAP_FOR(l).luxuryTax + 5_000 - capPayroll(l, B, l.season));
    l.teams[B].mleSeason = l.season;
    // (every team's top name on the block, not just the three best: others' expiring stars can outrank him)
    const rumor = onTheBlock(l, 30).find((r) => r.pid === vet.pid);
    expect(rumor?.suitors).toContain(B);
  }

  // posts weekly rumors in the last three weeks, a deadline-day briefing and one recap the day after
  {
    const l = prSeason(5);
    const D = l.tradeDeadlineDay;
    for (const d of [D - 22, D - 15, D - 8, D - 1, D, D + 1]) {
      l.day = d;
      advanceDay(l);
    }
    const rumors = l.news.filter((n) => n.kind === 'rumor');
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors.every((n) => [D - 21, D - 14, D - 7].includes(n.day) && /are listening on/.test(n.text))).toBe(true);
    expect(l.inbox.filter((m) => m.subject === 'Deadline day' && m.day === D)).toHaveLength(1);
    // the recap counts the season's trades, once, however often the day is looked at
    deadlineDay(l);
    l.day = D + 1;
    deadlineDay(l);
    const recaps = l.news.filter((n) => n.text.startsWith('Trade deadline recap'));
    expect(recaps).toHaveLength(1);
    expect(recaps[0].day).toBe(D + 1);
    expect(recaps[0].text).toContain(seasonTrades(l).length === 1 ? 'one trade' : seasonTrades(l).length ? `${seasonTrades(l).length} trades` : 'no trades');
    expect(l.inbox.filter((m) => m.subject === 'Deadline recap')).toHaveLength(1);
  }

  // stopped before every pick, starts with #1 on the clock; the next pick is exactly one
  {
    const l = lottery();
    l.settings.draftPause = true;
    expect(startDraft(l)).toBe(true);
    expect([nextPick(l)?.round, nextPick(l)?.pick]).toEqual([1, 1]);
    expect(drafted(l)).toBe(0);
    for (let i = 1; i <= 5; i++) {
      const dp = nextPick(l)!;
      if (dp.tid === l.userTid) {
        expect(draftNextPick(l)).toBe(false);
        // the user's own pick stops before the next one too
        expect(userDraftPick(l, prospects(l, l.season)[0].pid)).toBeNull();
      } else expect(draftNextPick(l)).toBe(true);
      expect(drafted(l)).toBe(i);
      expect(nextPick(l)!.pick).toBe(i + 1);
    }
    // off again, the draft runs on to the user's next pick
    l.settings.draftPause = false;
    continueDraft(l);
    expect(nextPick(l)?.tid).toBe(l.userTid);
    // and outside the draft nothing happens
    l.phase = 'resign';
    expect(draftNextPick(l)).toBe(false);
  }

  // without the pause, runs to the user's pick as before, where teams call to move up into it
  {
    const l = lottery(7);
    expect(startDraft(l)).toBe(true);
    const dp = nextPick(l);
    expect(dp?.tid).toBe(l.userTid);
    if (dp?.round === 1) {
      draftProposals(l);
      for (const p of openProposals(l)) {
        expect(p.kind).toBe('pick');
        expect(p.offer.a.dpids).toEqual([dp.dpid]);
        expect(evaluateTrade(l, p.offer).accept).toBe(true);
        expect(p.expires).toBe(l.day);
      }
      // turned down, they don't call again that night (after another trade, say)
      expect(openProposals(l).length).toBeGreaterThan(0);
      const mail = l.inbox.length;
      for (const p of openProposals(l)) declineProposal(l, p.id);
      draftProposals(l);
      expect(openProposals(l)).toEqual([]);
      expect(l.inbox.length).toBe(mail);
    }
  }
}, 180_000);
