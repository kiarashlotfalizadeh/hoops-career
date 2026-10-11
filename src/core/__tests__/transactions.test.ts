// Transactions: AI trade valuation (consolidation, lens arbitrage, liabilities, picks, pitches),
// cap holds, the mid-level exception, the free-agent market, roster limits and contracts.
// Fictional leagues with hand-shaped players keep these fast and deterministic.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { startRegularSeason } from '../league/season';
import { CAP_FOR, contractSeason, freeAgents, payroll, standardRoster, teamPlayers, twoWayRoster } from '../league/helpers';
import { MLE_YEARS, askingContract, marketSalary, mleRoom, nonGuaranteed, releaseDeadMoney, releasePlayer, signPlayer, tradeValue, valueScore } from '../league/contracts';
import { capHolds, capPayroll, faDay, renouncePlayer, userOffer } from '../league/freeAgency';
import { aiProposeToUser, capSalary, evaluateTrade, makeItWork, pickValue, playerValueFor, salaryMatchGap, teamAccepts, validateTrade, type TradeOffer } from '../league/trades';
import { draftPlayer, draftStandings, ensureFuturePicks, runLottery } from '../league/draft';
import { CAP } from '../constants';
import { Rng } from '../random';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(rngSeed = 5): League {
  return createLeague({ name: `tx${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
}

/** Give a player a known value: OVR = POT, age, healthy, and a contract at his market price unless `salary` is set. */
function shape(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.mood.tradeRequest = false;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary ?? marketSalary(l, p)) };
  return p;
}

const offer = (give: number[], get: number[], giveDp: number[] = [], getDp: number[] = []): TradeOffer => ({ a: { tid: U, pids: give, dpids: giveDp }, b: { tid: AI, pids: get, dpids: getDp } });

describe('AI trade valuation', () => {
  it('rejects bundles of good players for a star, but takes a fair one-for-one (T3)', () => {
    const l = league();
    l.teams[AI].strategy = 'retool';
    const star = shape(l, standardRoster(l, AI)[0], 90, 27);
    const four = standardRoster(l, U)
      .slice(0, 4)
      .map((p) => shape(l, p, 84, 27));
    const sum = four.reduce((a, p) => a + tradeValue(l, p), 0);
    // more raw value than the star, but depth counts for less than talent
    expect(sum).toBeGreaterThan(tradeValue(l, star));
    expect(evaluateTrade(l, offer(four.map((p) => p.pid), [star.pid])).accept).toBe(false);
    const equal = shape(l, standardRoster(l, U)[4], 90, 27);
    expect(evaluateTrade(l, offer([equal.pid], [star.pid])).accept).toBe(true);
  });

  it('keeps every team within 15% of neutral value, so stars can\'t be bought low and sold high (T4)', () => {
    const l = league();
    const vet = shape(l, standardRoster(l, AI)[0], 86, 33);
    l.teams[AI].strategy = 'rebuild';
    l.teams[2].strategy = 'contend';
    const neutral = tradeValue(l, vet);
    const sellFloor = playerValueFor(l, vet, AI, false);
    const buyCeiling = playerValueFor(l, vet, 2, true);
    expect(tradeValue(l, vet, 'rebuild')).toBeLessThan(neutral * 0.85);
    expect(tradeValue(l, vet, 'contend')).toBeGreaterThan(neutral * 1.15);
    expect(sellFloor).toBeCloseTo(neutral * 0.85);
    expect(buyCeiling).toBeCloseTo(neutral * 1.15);
  });

  it('values bad contracts below zero and charges for absorbing them (T7)', () => {
    const l = league();
    l.phase = 'regular';
    const cap = CAP_FOR(l);
    const bad = shape(l, standardRoster(l, U)[0], 66, 31, Math.round(cap.salaryCap * 0.25), 4);
    expect(tradeValue(l, bad)).toBeLessThan(0);
    // nobody takes him for nothing...
    expect(evaluateTrade(l, offer([bad.pid], [])).accept).toBe(false);
    // ...but an AI happily dumps its own on us
    const theirs = shape(l, standardRoster(l, AI)[0], 66, 31, Math.round(cap.salaryCap * 0.25), 4);
    expect(teamAccepts(l, offer([], [theirs.pid]), AI)).toBe(true);
  });

  it('charges the luxury tax a deal adds', () => {
    const l = league();
    l.phase = 'regular';
    const p = shape(l, standardRoster(l, U)[0], 78, 27, 20_000);
    const under = evaluateTrade(l, offer([p.pid], [])).delta;
    l.teams[AI].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).luxuryTax });
    expect(evaluateTrade(l, offer([p.pid], [])).delta).toBeLessThan(under - 2);
  });

  it('discounts injured players by the share of the season they miss, most for contenders (T9)', () => {
    const l = league();
    l.phase = 'regular';
    const p = shape(l, standardRoster(l, AI)[0], 90, 28);
    const healthy = { contend: tradeValue(l, p, 'contend'), rebuild: tradeValue(l, p, 'rebuild'), ask: askingContract(l, p).amount };
    p.injury = { type: 'Torn ACL', gamesRemaining: 100, gamesTotal: 100, severity: 'severe' };
    expect(tradeValue(l, p, 'contend')).toBeLessThan(healthy.contend * 0.5);
    expect(tradeValue(l, p, 'rebuild') / healthy.rebuild).toBeGreaterThan(tradeValue(l, p, 'contend') / healthy.contend);
    expect(askingContract(l, p).amount).toBeLessThan(healthy.ask);
  });

  it('caps an AI at two outgoing first-round picks per deal (T4)', () => {
    const l = league();
    l.phase = 'regular';
    ensureFuturePicks(l, l.season + 6);
    // spread over non-consecutive drafts, and salaries matched with a minimum player each way
    const firsts = l.draftPicks.filter((d) => d.tid === AI && d.round === 1 && (d.season - l.season) % 2 === 0).slice(0, 3);
    const vetMin = CAP_FOR(l).vetMin;
    const star = shape(l, standardRoster(l, U)[0], 95, 25, vetMin);
    const filler = shape(l, standardRoster(l, AI)[0], 60, 30, vetMin);
    const ev = evaluateTrade(l, offer([star.pid], [filler.pid], [], firsts.map((d) => d.dpid)));
    expect(ev.ok).toBe(true);
    expect(ev.accept).toBe(false);
    expect(ev.message).toMatch(/first-round picks/);
  });

  it('won\'t leave a team without firsts in back-to-back drafts (Stepien rule)', () => {
    const l = league();
    l.phase = 'regular';
    const own = l.draftPicks.filter((d) => d.tid === U && d.round === 1 && d.season >= l.season + 1).sort((a, b) => a.season - b.season);
    expect(validateTrade(l, offer([], [], [own[0].dpid, own[1].dpid])).some((e) => /back-to-back/.test(e))).toBe(true);
    expect(validateTrade(l, offer([], [], [own[0].dpid, own[2].dpid])).some((e) => /back-to-back/.test(e))).toBe(false);
  });

  it('prices this year\'s picks like the prospect they become, protections included (T5)', () => {
    const l = league();
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
  });

  it('only pitches deals the pitching AI would accept (T8)', () => {
    const l = league(9);
    expect(startRegularSeason(l)).toEqual([]);
    for (let i = 0; i < 400; i++) aiProposeToUser(l, new Rng(i + 1));
    const pitches = l.inbox.filter((m) => m.link?.startsWith('/trade?with='));
    expect(pitches.length).toBeGreaterThan(0);
    for (const m of pitches) {
      const q = new URLSearchParams(m.link!.split('?')[1]);
      const ids = (k: string) => q.get(k)!.split(',').map(Number);
      const o: TradeOffer = { a: { tid: U, pids: ids('give'), dpids: [] }, b: { tid: Number(q.get('with')), pids: ids('get'), dpids: [] } };
      expect(evaluateTrade(l, o).accept).toBe(true);
    }
  });

  it('"what would make this work?" fixes our salary matching first (UI2-1)', () => {
    const l = league(11);
    l.phase = 'regular';
    l.teams[AI].strategy = 'retool';
    // we're over the cap, asking for a $12M player while sending nothing
    l.teams[U].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).salaryCap });
    const target = shape(l, standardRoster(l, AI)[0], 74, 27, 12_000);
    const ask = offer([], [target.pid]);
    expect(salaryMatchGap(l, ask, 'a')).toBeGreaterThan(0);
    const fixed = makeItWork(l, ask)!;
    expect(fixed).not.toBeNull();
    expect(validateTrade(l, fixed)).toEqual([]);
    expect(evaluateTrade(l, fixed).accept).toBe(true);
  });

  it('counts two-way pay out of trade salary (T13)', () => {
    const l = league();
    const tw = twoWayRoster(l, U)[0];
    expect(tw).toBeDefined();
    expect(capSalary(l, tw.pid)).toBe(0);
  });
});

describe('cap holds (T7)', () => {
  it('holds room for expiring players until they are renounced', () => {
    const l = league();
    l.phase = 'resign';
    const next = l.season + 1;
    // most of our roster is up this summer
    for (const p of standardRoster(l, U).slice(0, 10)) shape(l, p, 80, 27, 15_000, 1).contract.start = l.season;
    const holds = capHolds(l, U);
    expect(holds.length).toBeGreaterThanOrEqual(10);
    expect(capPayroll(l, U, next)).toBeGreaterThan(payroll(l, U, next));
    // the holds take us over the cap, so taking on salary for nothing breaks the 125% rule
    const target = shape(l, standardRoster(l, AI)[0], 72, 27, 25_000, 3);
    expect(capPayroll(l, U, next) + 25_000).toBeGreaterThan(CAP_FOR(l, next).salaryCap);
    expect(validateTrade(l, offer([], [target.pid])).some((e) => e.includes('125%'))).toBe(true);
    for (const h of holds) expect(renouncePlayer(l, h.p.pid).ok).toBe(true);
    expect(capHolds(l, U)).toEqual([]);
    expect(validateTrade(l, offer([], [target.pid])).filter((e) => e.includes('125%'))).toEqual([]);
  });

  it('holds an AI team\'s room for the players it would re-sign', () => {
    const l = league();
    l.phase = 'draft';
    const keep = shape(l, standardRoster(l, AI)[0], 84, 26, 20_000, 1);
    keep.contract.start = l.season;
    expect(capHolds(l, AI).some((h) => h.p.pid === keep.pid)).toBe(true);
    l.phase = 'freeAgency';
    expect(capHolds(l, AI)).toEqual([]);
  });
});

describe('free agency', () => {
  /** Just over the cap, well under the tax: the mid-level is open. */
  function overCap(l: League, tid: number) {
    const s = contractSeason(l);
    l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: s, amount: Math.max(0, CAP_FOR(l, s).salaryCap - payroll(l, tid, s)) + 1_000 });
  }

  it('lets a team under the tax use the mid-level once a season (T2)', () => {
    const l = league();
    l.phase = 'regular';
    while (standardRoster(l, U).length > 12) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    l.teams[U].deadMoney = [];
    overCap(l, U);
    const cap = CAP_FOR(l);
    const mle = mleRoom(l, U);
    expect(mle).toBe(Math.round((cap.salaryCap * 0.085) / 10) * 10);
    // a starter-level free agent asking more than the minimum but less than the mid-level
    const [a, b] = freeAgents(l).sort((x, y) => valueScore(l, y) - valueScore(l, x));
    shape(l, a, 76, 27).asking = undefined;
    expect(askingContract(l, a, U).amount).toBeGreaterThan(cap.vetMin);
    expect(userOffer(l, a.pid, mle, MLE_YEARS + 1).ok).toBe(false);
    expect(userOffer(l, a.pid, mle, 2).ok).toBe(true);
    // used up for the season
    expect(mleRoom(l, U)).toBe(0);
    expect(userOffer(l, b.pid, cap.vetMin * 2, 1).ok).toBe(false);
  });

  it('allows 21 players in the offseason and 15 in season (T12)', () => {
    const l = league();
    l.phase = 'freeAgency';
    const cheap = () => freeAgents(l).find((p) => askingContract(l, p, U).amount <= CAP_FOR(l, contractSeason(l)).vetMin)!;
    while (standardRoster(l, U).length < 16) signPlayer(l, cheap(), U, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    const p = cheap();
    const ask = askingContract(l, p, U);
    expect(userOffer(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    while (standardRoster(l, U).length < 21) signPlayer(l, cheap(), U, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    const q = cheap();
    expect(userOffer(l, q.pid, askingContract(l, q, U).amount, askingContract(l, q, U).years).reason).toMatch(/full \(21\)/);
  });

  it('cuts prices every 5 days until the market can pay, and the market clears (T1)', () => {
    const l = league();
    l.phase = 'freeAgency';
    l.faDay = 0;
    for (const t of l.teams) overCap(l, t.tid);
    const star = shape(l, freeAgents(l)[0], 88, 27);
    star.contract = { start: l.season, salaries: [0] };
    star.asking = askingContract(l, star);
    star.faDays = 5;
    const start = star.asking.amount;
    const rng = new Rng(4);
    for (let d = 0; d < 4; d++) faDay(l, rng, 0);
    expect(star.asking.amount).toBe(start);
    faDay(l, rng, 0);
    // nobody can pay more than the mid-level, so that's where his price goes
    expect(star.asking.amount).toBeLessThanOrEqual(Math.max(...l.teams.map((t) => mleRoom(l, t.tid))));
    expect(star.asking.years).toBeLessThanOrEqual(3);
    for (let d = 0; d < 10 && star.tid === FREE_AGENT; d++) faDay(l, rng);
    expect(star.tid).toBeGreaterThanOrEqual(0);
  });

  it('a full AI roster swaps its weakest cheap player for a clearly better free agent (T1)', () => {
    const l = league();
    l.phase = 'freeAgency';
    for (const t of l.teams) {
      overCap(l, t.tid);
      while (standardRoster(l, t.tid).length < CAP.rosterMax) signPlayer(l, freeAgents(l).sort((a, b) => a.ovr - b.ovr)[0], t.tid, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    }
    const fa = shape(l, freeAgents(l)[0], 82, 27);
    fa.contract = { start: l.season, salaries: [0] };
    fa.asking = { amount: CAP_FOR(l, contractSeason(l)).vetMin, years: 1 };
    const rng = new Rng(6);
    for (let d = 0; d < 10 && fa.tid === FREE_AGENT; d++) faDay(l, rng);
    expect(fa.tid).toBeGreaterThanOrEqual(0);
    expect(standardRoster(l, fa.tid).length).toBe(CAP.rosterMax);
  });

  it('camp deals are free to cut before opening night; releases count from the contract season (T10, UI2-5)', () => {
    const l = league();
    const p = standardRoster(l, U)[0];
    p.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin, CAP_FOR(l).vetMin] };
    expect(nonGuaranteed(l, p)).toBe(true);
    expect(releaseDeadMoney(l, p)).toEqual([]);
    l.phase = 'regular';
    expect(releaseDeadMoney(l, p).length).toBe(2);
    // after the season, only next season's salary is still owed
    l.phase = 'freeAgency';
    const vet = shape(l, standardRoster(l, U)[1], 75, 30, 10_000, 3);
    vet.contract.start = l.season;
    expect(releaseDeadMoney(l, vet).map((d) => d.season)).toEqual([l.season + 1, l.season + 2]);
  });

  it('AI teams with full rosters stash second-round picks on two-way deals (T10)', () => {
    const l = league();
    l.phase = 'draft';
    ensureFuturePicks(l, l.season);
    const ai = l.teams.find((t) => t.tid !== U && twoWayRoster(l, t.tid).length < 3)!;
    for (const p of standardRoster(l, ai.tid)) if (p.contract.start + p.contract.salaries.length - 1 <= l.season) p.contract.salaries.push(p.contract.salaries[0]);
    while (standardRoster(l, ai.tid).length < 14) signPlayer(l, freeAgents(l)[0], ai.tid, CAP_FOR(l).vetMin, 2, { news: false });
    const dp = l.draftPicks.find((d) => d.season === l.season && d.round === 2 && d.originalTid === ai.tid)!;
    dp.tid = ai.tid;
    dp.pick = 15;
    const prospect = Object.values(l.players).find((p) => p.tid === -2 && p.draft.year === l.season)!;
    draftPlayer(l, dp, prospect.pid);
    expect(prospect.contract.twoWay).toBe(true);
  });
});

describe('league creation and the draft', () => {
  it('fictional leagues pay by value, with a center, rookie deals, options and two-ways on every team (T15)', () => {
    const l = league(3);
    const cap = CAP_FOR(l);
    const rows = l.teams.map((t) => {
      const r = standardRoster(l, t.tid);
      return {
        talent: [...r].sort((a, b) => b.ovr - a.ovr).slice(0, 8).reduce((a, p) => a + p.ovr, 0),
        pay: payroll(l, t.tid),
        hasC: r.some((p) => p.pos === 'C'),
        rookies: r.filter((p) => p.contract.rookie).length,
        twoWays: twoWayRoster(l, t.tid).length,
        overMax: r.filter((p) => p.contract.salaries[0] > cap.maxContract(p.experience)).length,
      };
    });
    const corr = (xs: number[], ys: number[]) => {
      const mx = xs.reduce((a, b) => a + b) / xs.length;
      const my = ys.reduce((a, b) => a + b) / ys.length;
      let n = 0;
      let dx = 0;
      let dy = 0;
      xs.forEach((x, i) => ((n += (x - mx) * (ys[i] - my)), (dx += (x - mx) ** 2), (dy += (ys[i] - my) ** 2)));
      return n / Math.sqrt(dx * dy);
    };
    expect(rows.every((r) => r.hasC && r.rookies >= 2 && r.rookies <= 3 && r.twoWays === 2 && r.overMax === 0)).toBe(true);
    expect(corr(rows.map((r) => r.talent), rows.map((r) => r.pay))).toBeGreaterThan(0.4);
    expect(Object.values(l.players).some((p) => p.contract.option && !p.contract.rookie)).toBe(true);
  });

  it('breaks lottery ties with a seeded draw, the same on every call (T17)', () => {
    const orders = [1, 2, 3, 4].map((seed) => {
      const l = league(seed);
      for (const t of l.teams) {
        const ts = t.seasons[t.seasons.length - 1];
        ts.won = 41;
        ts.lost = 41;
      }
      const a = draftStandings(l).map((x) => x.tid);
      expect(draftStandings(l).map((x) => x.tid)).toEqual(a);
      return a.join();
    });
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
});

void teamPlayers;
