// Free agency: the mid-level, minimums, roster limits and the market's prices over the summer;
// competing offers for top free agents (W5) and player priorities.
// Fictional leagues with hand-shaped teams keep these fast: each scenario builds the league it needs.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { faAdvance, newSeason, startFreeAgency } from '../league/season';
import { CAP_FOR, contractSeason, curTeamSeason, freeAgents, payroll, prospects, standardRoster, statsLine, teamPlayers } from '../league/helpers';
import {
  EVEN_PREFS,
  FA_DAYS,
  FIRED_REASON,
  MLE_YEARS,
  PREF_KEYS,
  ROTATION_FLOOR,
  SUMMER_FLOOR,
  askingContract,
  summerFloor,
  capSpace,
  decideTeamOption,
  exceptionAmount,
  marketSalary,
  mleRoom,
  nonGuaranteed,
  playerPrefs,
  releaseBlockedReason,
  releaseDeadMoney,
  releasePlayer,
  rookieContract,
  rookieScaleDeal,
  signPlayer,
  signingRoute,
  teamAppeal,
  valueScore,
} from '../league/contracts';
import {
  BID_FLOOR,
  MARKET_HOLD_DAYS,
  MARKET_STEP,
  bidFloor,
  bidStanding,
  faDay,
  faInterest,
  marketMoney,
  marqueeFA,
  mostPayable,
  offerUtility,
  offerBlockedReason,
  offerRoute,
  pendingBid,
  resolveBids,
  userBid,
  userMleRoom,
  userOffer,
  userResign,
  withdrawBid,
} from '../league/freeAgency';
import { walkAwayFor } from '../league/negotiation';
import { draftPlayer, draftStandings } from '../league/draft';
import { CAP } from '../constants';
import { contractExp } from '../playerGen';
import { moneyExact } from '../format';
import { Rng } from '../random';
import type { League, Player } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../types';

const U = 0;
const AI = 1;
const R = 1;

function txLeague(rngSeed = 5): League {
  return createLeague({ name: `tx${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
}

/** Give a player a known value: OVR = POT, age, healthy, and a contract at his market price unless `salary` is set. */
function shape(l: League, p: Player, ovr: number, age: number, salary?: number, years = 2): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.contract = { start: contractSeason(l), salaries: Array.from({ length: years }, () => salary ?? marketSalary(l, p)) };
  // with his team for years: full Bird rights
  p.birdSince = l.season - 4;
  return p;
}

/** This season's prospects still on the board, most valuable first. */
const prospectsBy = (l: League) => prospects(l, l.season).sort((a, b) => valueScore(l, b) - valueScore(l, a));

/** Just over the cap, well under the tax: the mid-level is open. */
function overCap(l: League, tid: number) {
  const s = contractSeason(l);
  l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: s, amount: Math.max(0, CAP_FOR(l, s).salaryCap - payroll(l, tid, s)) + 1_000 });
}

function bidsLeague(rngSeed = 5): League {
  const l = createLeague({ name: `bids${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // priorities and the offer noise hash the league id: a fixed one keeps runs identical
  l.id = `bids_${rngSeed}`;
  return l;
}

/** A free agent of known value: OVR = POT, age, healthy, unsigned, at his market price. */
function freeAgent(l: League, p: Player, ovr: number, age = 27): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  p.contract = { start: l.season, salaries: [0] };
  p.asking = undefined;
  p.asking = askingContract(l, p);
  return p;
}

/**
 * Summer free agency where nobody can bid but the teams opened up: everyone is over the cap with
 * the mid-level used; an opened team plays its roster on minimums (lots of space) and has the
 * record and hype given.
 */
function bidsSummer(rngSeed = 5) {
  const l = bidsLeague(rngSeed);
  l.phase = 'freeAgency';
  l.faDay = 0;
  const s = contractSeason(l);
  const cap = CAP_FOR(l, s);
  for (const t of l.teams) {
    t.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap }];
    // (no mid-level either)
    t.mleSeason = s;
  }
  const open = (tid: number, won: number, hype: number, space?: number) => {
    const t = l.teams[tid];
    t.deadMoney = [];
    t.hype = hype;
    t.pop = 3;
    t.strategy = 'retool';
    for (const p of teamPlayers(l, tid)) p.contract = { start: s, salaries: [cap.vetMin] };
    const ts = curTeamSeason(l, tid);
    ts.won = won;
    ts.lost = 82 - won;
    if (space !== undefined) t.deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, tid, s) - space });
  };
  return { l, s, cap, open };
}

const stars = (l: League, n: number, ovr = 86) =>
  freeAgents(l)
    .slice(0, n)
    .map((p) => freeAgent(l, p, ovr));

const bidAtAsk = (l: League, p: Player) => {
  const ask = askingContract(l, p, U);
  return userBid(l, p.pid, ask.amount, ask.years);
};

it('the market: the mid-level, minimums, roster limits, prices over the summer, rookie and camp deals, and the leagues it starts from', () => {
  // lets a team over the cap use the mid-level once a season (T2)
  {
    const l = txLeague();
    l.phase = 'regular';
    while (standardRoster(l, U).length > 12) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    l.teams[U].deadMoney = [];
    overCap(l, U);
    const cap = CAP_FOR(l);
    const mle = mleRoom(l, U);
    expect(mle).toBe(Math.round((cap.salaryCap * 0.085) / 10) * 10);
    // a starter-level free agent asking more than the minimum but less than the mid-level
    // (not the players just released: their old team can't sign them back this season)
    const [a, b] = freeAgents(l)
      .filter((x) => !x.released)
      .sort((x, y) => valueScore(l, y) - valueScore(l, x));
    shape(l, a, 76, 27).asking = undefined;
    expect(askingContract(l, a, U).amount).toBeGreaterThan(cap.vetMin);
    expect(userOffer(l, a.pid, mle, MLE_YEARS + 1).ok).toBe(false);
    expect(userOffer(l, a.pid, mle, 2).ok).toBe(true);
    // used up for the season
    expect(mleRoom(l, U)).toBe(0);
    expect(userOffer(l, b.pid, cap.vetMin * 2, 1).ok).toBe(false);
  }

  // a minimum deal pays each season's minimum, which grows faster than a 5% raise
  {
    const l = txLeague();
    const [vet, young] = freeAgents(l);
    vet.experience = 5;
    young.experience = 1;
    signPlayer(l, vet, U, CAP_FOR(l).vetMin, 3, { news: false });
    signPlayer(l, young, U, CAP_FOR(l).minContract, 2, { news: false });
    expect(vet.contract.salaries).toEqual([0, 1, 2].map((i) => CAP_FOR(l, l.season + i).vetMin));
    expect(young.contract.salaries).toEqual([0, 1].map((i) => CAP_FOR(l, l.season + i).minContract));
  }

  // over the cap, the minimum is the player's own: the veteran minimum only after three seasons
  {
    const l = txLeague();
    l.phase = 'regular';
    while (standardRoster(l, U).length > 13) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    overCap(l, U);
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    l.teams[U].mleSeason = s;
    expect(signingRoute(l, U, cap.minContract, s, { experience: 1 })).toBe('min');
    expect(signingRoute(l, U, cap.vetMin, s, { experience: 1 })).toBeNull();
    expect(signingRoute(l, U, cap.vetMin, s, { experience: 5 })).toBe('min');
    const young = freeAgents(l).find((x) => !x.released)!;
    young.experience = 1;
    young.asking = undefined;
    const no = userOffer(l, young.pid, cap.vetMin, 1);
    expect(no.ok).toBe(false);
    expect(no.reason).toBe(`No cap space. Over the cap, offer his minimum, ${moneyExact(cap.minContract)}.`);
  }

  // a fired coach can't sign, re-sign, release or decide options for his old team (T7)
  {
    const l = txLeague();
    l.phase = 'regular';
    l.fired = true;
    const fa = freeAgents(l)[0];
    expect(userOffer(l, fa.pid, CAP_FOR(l).vetMin, 1).reason).toBe(FIRED_REASON);
    expect(releaseBlockedReason(l, standardRoster(l, U)[0])).toBe(FIRED_REASON);
    l.phase = 'resign';
    const p = standardRoster(l, U)[0];
    p.contract = { start: l.season, salaries: [5_000] };
    expect(userResign(l, p.pid, 50_000, 2).reason).toBe(FIRED_REASON);
    expect(decideTeamOption(l, p.pid, true).reason).toBe(FIRED_REASON);
  }

  // re-signing a player is one news item
  {
    const l = txLeague();
    l.phase = 'resign';
    const p = shape(l, standardRoster(l, U)[0], 74, 27);
    p.contract = { start: l.season, salaries: [5_000] };
    const ask = askingContract(l, p, U);
    expect(userResign(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    expect(l.news.filter((n) => n.pids.includes(p.pid))).toHaveLength(1);
  }

  // allows 21 players in the offseason and 15 in season (T12)
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    const cheap = () => freeAgents(l).find((p) => askingContract(l, p, U).amount <= CAP_FOR(l, contractSeason(l)).vetMin)!;
    while (standardRoster(l, U).length < 16) signPlayer(l, cheap(), U, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    const p = cheap();
    const ask = askingContract(l, p, U);
    expect(userOffer(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    while (standardRoster(l, U).length < 21) signPlayer(l, cheap(), U, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
    const q = cheap();
    expect(userOffer(l, q.pid, askingContract(l, q, U).amount, askingContract(l, q, U).years).reason).toMatch(/full \(21\)/);
  }

  // a re-signing takes one of next season's 21 spots
  {
    const l = txLeague();
    l.phase = 'resign';
    const cs = contractSeason(l);
    const p = shape(l, standardRoster(l, U)[0], 74, 27);
    p.contract = { start: l.season, salaries: [5_000] };
    const signed = () => standardRoster(l, U).filter((x) => contractExp(x.contract) >= cs);
    while (signed().length < 21) signPlayer(l, freeAgents(l)[0], U, CAP_FOR(l, cs).vetMin, 1, { news: false, start: cs });
    const ask = askingContract(l, p, U);
    expect(userResign(l, p.pid, ask.amount, ask.years).reason).toMatch(/full for next season \(21\)/);
    releasePlayer(l, signed()[0], { news: false });
    expect(userResign(l, p.pid, ask.amount, ask.years).ok).toBe(true);
    expect(signed().length).toBe(21);
  }

  // a top free agent holds his price through the market's first days; then, no team able to pay it,
  // it comes down toward the most a team could pay him but never below his summer floor (75% of his
  // value through day 20, 60% on it on a one-year deal, see SUMMER_FLOOR), straight to it when that
  // money is less; past day 20 the floor comes down a little every day, to a quarter of his value on
  // the last, so with only mid-levels left he signs one in the market's last days instead of sitting
  // out the summer (an 85 at $24.4M and an 86 at $17.1M were unsigned on day 30)
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    l.faDay = 0;
    for (const t of l.teams) overCap(l, t.tid);
    const star = shape(l, freeAgents(l)[0], 88, 27);
    star.contract = { start: l.season, salaries: [0] };
    // (a starter's minutes: the market pays for the role he has shown, see roleMpg)
    star.stats = [];
    Object.assign(statsLine(star, l.season, 1, false), { gp: 70, min: 70 * 32 });
    // (his old team let him go: no Bird rights to bring him back on)
    star.released = { tid: 1, season: l.season };
    star.asking = undefined;
    star.asking = askingContract(l, star);
    star.faDays = 1;
    const start = star.asking.amount;
    const rng = new Rng(4);
    faDay(l, rng, 0, 1);
    expect(star.asking.amount).toBe(start);
    // (over the cap everywhere: a mid-level is the most anyone has)
    const money = marketMoney(l, star);
    expect(money).toBeGreaterThan(0);
    expect(money).toBeLessThan(start * BID_FLOOR);
    l.faDay = MARKET_HOLD_DAYS;
    faDay(l, rng, 0, MARKET_HOLD_DAYS + 1);
    expect(star.tid).toBe(FREE_AGENT);
    const m = marketSalary(l, star);
    expect(Math.abs(star.asking!.amount - m * SUMMER_FLOOR.early)).toBeLessThan(20);
    const floors: number[] = [];
    for (let d = MARKET_HOLD_DAYS + 1; d < FA_DAYS && star.tid === FREE_AGENT; d++) {
      const most = marketMoney(l, star);
      l.faDay = d;
      const floor = summerFloor(l, star);
      floors.push(floor);
      if (d === SUMMER_FLOOR.day) expect(Math.abs(floor - m * SUMMER_FLOOR.late)).toBeLessThan(1);
      if (d === FA_DAYS - 1) expect(Math.abs(floor - m * SUMMER_FLOOR.end)).toBeLessThan(1);
      faDay(l, rng, 0, d + 1);
      if (star.tid === FREE_AGENT) {
        expect(star.asking!.amount).toBeGreaterThanOrEqual(Math.min(most, floor) - 20);
        expect(star.asking!.amount).toBeGreaterThanOrEqual(floor - 20);
      }
      // (on the floor's day, held at it, he asks a one-year deal, and no offer under it is considered)
      if (d === SUMMER_FLOOR.day && star.tid === FREE_AGENT) {
        expect(Math.abs(star.asking!.amount - m * SUMMER_FLOOR.late)).toBeLessThan(20);
        expect(star.asking!.years).toBe(1);
        expect(bidFloor(l, star, 1)).toBeGreaterThanOrEqual(m * SUMMER_FLOOR.late - 50);
      }
    }
    // the floor came down a little every day past the floor's day, never back up
    for (let i = 1; i < floors.length; i++) expect(floors[i]).toBeLessThanOrEqual(floors[i - 1] + 1);
    expect(floors.length).toBeGreaterThan(SUMMER_FLOOR.day - MARKET_HOLD_DAYS);
    // and a mid-level signed him before the market closed, for no less than the last day's floor
    expect(star.tid).not.toBe(FREE_AGENT);
    expect(star.contract.salaries[0]).toBeGreaterThanOrEqual(m * SUMMER_FLOOR.end - 50);
    expect(star.contract.salaries[0]).toBeLessThan(m * SUMMER_FLOOR.late);
  }

  // an 80+ free agent's summer floor (75% of his value) holds a keen team's or a ring chaser's ask,
  // whatever the market brought his own price down to; a rotation player's (72-79) is half his value
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    l.faDay = 0;
    const p = shape(l, freeAgents(l)[0], 81, 31);
    p.contract = { start: l.season, salaries: [0] };
    p.stats = [];
    Object.assign(statsLine(p, l.season, 1, false), { gp: 70, min: 70 * 30 });
    p.asking = undefined;
    p.asking = askingContract(l, p);
    const m = marketSalary(l, p);
    l.teams[2].strategy = 'contend';
    expect(Math.abs(summerFloor(l, p) - m * SUMMER_FLOOR.early)).toBeLessThan(1);
    for (const t of l.teams) expect(askingContract(l, p, t.tid).amount).toBeGreaterThanOrEqual(m * SUMMER_FLOOR.early - 50);
    p.asking = { amount: Math.round(m * 0.5), years: 2 };
    expect(Math.abs(summerFloor(l, p) - m * SUMMER_FLOOR.early)).toBeLessThan(1);
    // (a 31-year-old takes less from a contender, see ringChase, but not under his floor)
    expect(askingContract(l, p, 2).amount).toBeGreaterThanOrEqual(m * SUMMER_FLOOR.early - 50);
    expect(walkAwayFor(l, p, 'fa', p.asking.years)).toBeGreaterThanOrEqual(m * SUMMER_FLOOR.early - 50);
    shape(l, p, 76, 31);
    const m2 = marketSalary(l, p);
    expect(Math.abs(summerFloor(l, p) - m2 * ROTATION_FLOOR.early)).toBeLessThan(1);
    l.faDay = SUMMER_FLOOR.day;
    expect(Math.abs(summerFloor(l, p) - m2 * ROTATION_FLOOR.late)).toBeLessThan(1);
    // (and none in season)
    l.phase = 'regular';
    expect(summerFloor(l, p)).toBe(0);
  }

  // a rotation player's summer price holds through the market's first days, then comes down a step a
  // day toward what the market's money would pay him (never below it), on a deal of three years at
  // most, and the market clears (T1)
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    l.faDay = 0;
    for (const t of l.teams) overCap(l, t.tid);
    const star = shape(l, freeAgents(l)[0], 76, 27);
    star.contract = { start: l.season, salaries: [0] };
    star.stats = [];
    Object.assign(statsLine(star, l.season, 1, false), { gp: 70, min: 70 * 26 });
    star.asking = undefined;
    star.asking = askingContract(l, star);
    star.faDays = 5;
    const start = star.asking.amount;
    const rng = new Rng(4);
    for (let d = 1; d <= MARKET_HOLD_DAYS; d++) faDay(l, rng, 0, d);
    expect(star.asking.amount).toBe(start);
    const money = marketMoney(l, star);
    l.faDay = MARKET_HOLD_DAYS;
    faDay(l, rng, 0, MARKET_HOLD_DAYS + 1);
    if (star.tid === FREE_AGENT) {
      expect(star.asking.amount).toBeGreaterThanOrEqual(Math.min(start, money) - 20);
      expect(star.asking.years).toBeLessThanOrEqual(3);
    }
    for (let d = MARKET_HOLD_DAYS + 1; d < 20 && star.tid === FREE_AGENT; d++) {
      l.faDay = d;
      faDay(l, rng, 1, d + 1);
    }
    expect(star.tid).toBeGreaterThanOrEqual(0);
  }

  // only room on teams that would take him holds a free agent's price up
  {
    const l = txLeague();
    l.phase = 'freeAgency';
    const s = contractSeason(l);
    for (const t of l.teams) {
      overCap(l, t.tid);
      t.mleSeason = s;
    }
    // one team has cap space but a full roster he wouldn't crack
    const rich = l.teams[AI];
    rich.deadMoney = [];
    const vetMin = CAP_FOR(l, s).vetMin;
    for (const p of standardRoster(l, AI)) shape(l, p, 85, 27, vetMin, 2);
    while (standardRoster(l, AI).length < CAP.rosterMax) signPlayer(l, freeAgents(l)[0], AI, vetMin, 2, { news: false, start: s });
    for (const p of standardRoster(l, AI)) shape(l, p, 85, 27, vetMin, 2);
    expect(CAP_FOR(l, s).salaryCap - payroll(l, AI, s)).toBeGreaterThan(30_000);
    // (a 71: no summer floor, see SUMMER_FLOOR)
    const fa = shape(l, freeAgents(l)[0], 71, 27);
    fa.contract = { start: l.season, salaries: [0] };
    fa.experience = 5;
    fa.asking = { amount: 20_000, years: 3 };
    fa.faDays = 1;
    // (nobody's money for him: past the market's first days his price comes down a full step)
    expect(marketMoney(l, fa)).toBe(0);
    l.faDay = MARKET_HOLD_DAYS;
    faDay(l, new Rng(2), 0, MARKET_HOLD_DAYS + 1);
    expect(fa.asking.amount).toBe(Math.round((Math.min(20_000, marketSalary(l, fa)) * (1 - MARKET_STEP)) / 10) * 10);
  }

  // a full AI roster adds a clearly better free agent: a swap in season, a camp body in the summer (T1)
  {
    for (const phase of ['regular', 'freeAgency'] as const) {
      const l = txLeague();
      l.phase = phase;
      for (const t of l.teams) {
        overCap(l, t.tid);
        while (standardRoster(l, t.tid).length < CAP.rosterMax)
          signPlayer(l, freeAgents(l).sort((a, b) => a.ovr - b.ovr)[0], t.tid, CAP_FOR(l, contractSeason(l)).vetMin, 1, { news: false, start: contractSeason(l) });
      }
      // (a 71 on a minimum ask: a 72+ holds his summer floor, see SUMMER_FLOOR)
      const fa = shape(l, freeAgents(l)[0], 71, 27);
      fa.contract = { start: l.season, salaries: [0] };
      fa.asking = { amount: CAP_FOR(l, contractSeason(l)).vetMin, years: 1 };
      const rng = new Rng(6);
      for (let d = 0; d < 10 && fa.tid === FREE_AGENT; d++) faDay(l, rng);
      expect(fa.tid).toBeGreaterThanOrEqual(0);
      // in season the weakest cheap player goes now; in the summer the cuts wait for opening night
      // (camp can hold others the team signed meanwhile: nobody is released)
      if (phase === 'regular') expect(standardRoster(l, fa.tid).length).toBe(CAP.rosterMax);
      else {
        expect(standardRoster(l, fa.tid).length).toBeGreaterThanOrEqual(CAP.rosterMax + 1);
        expect((l.transactions ?? []).some((t) => (t.kind === 'release' || t.kind === 'waive') && t.tids.includes(fa.tid))).toBe(false);
      }
    }
  }

  // a released player leaves nothing behind in his old team's rotation or tactics
  {
    const l = txLeague();
    const t = l.teams[U];
    const [a, b] = standardRoster(l, U);
    for (const p of [a, b]) {
      t.rotation.closers.push(p.pid);
      t.rotation.restB2B.push(p.pid);
      t.rotation.caps[p.pid] = 20;
      t.rotation.minutes[p.pid] = 24;
      t.tactics.offense.roles[p.pid] = 'glue';
      t.tactics.offense.freedom[p.pid] = 1;
    }
    releasePlayer(l, a, { news: false });
    releasePlayer(l, b, { news: false });
    for (const pid of [a.pid, b.pid]) {
      expect([t.rotation.order, t.rotation.closers, t.rotation.restB2B].some((xs) => xs.includes(pid))).toBe(false);
      expect([t.rotation.caps[pid], t.rotation.minutes[pid], t.tactics.offense.roles[pid], t.tactics.offense.freedom[pid]]).toEqual([undefined, undefined, undefined, undefined]);
    }
  }

  // rookie deals grow with the cap: a pick drafted two years on signs for 6% a year more
  {
    const l = txLeague();
    const now = rookieContract(l, 1, 1, l.season + 1);
    const later = rookieContract(l, 1, 1, l.season + 3);
    expect(later.salaries[0] / now.salaries[0]).toBeCloseTo((1 + CAP.growth) ** 2, 2);
    // a second-rounder gets each season's minimum
    expect(rookieContract(l, 5, 2, l.season + 3).salaries).toEqual([CAP_FOR(l, l.season + 3).minContract, CAP_FOR(l, l.season + 4).minContract]);
  }

  // only a first-round pick's deal is on the rookie scale (the Office's R tag): a second-rounder's minimum seasons aren't
  {
    const l = txLeague();
    l.phase = 'draft';
    const [first, second] = [1, 2].map((round) => {
      const dp = l.draftPicks.find((d) => d.season === l.season && d.round === round && d.tid === U)!;
      dp.pick = 20;
      const p = prospectsBy(l)[0];
      draftPlayer(l, dp, p.pid);
      return p;
    });
    // both are rookie deals (no contract grumbles, the team wants to keep them)
    expect([first.contract.rookie, second.contract.rookie]).toEqual([true, true]);
    expect(rookieScaleDeal(first)).toBe(true);
    expect(rookieScaleDeal(second)).toBe(false);
    // re-signed, he's off it
    first.contract = { start: l.season + 1, salaries: [10_000] };
    expect(rookieScaleDeal(first)).toBe(false);
  }

  // camp deals are free to cut before opening night; releases count from the contract season (T10, UI2-5)
  {
    const l = txLeague();
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
  }

  // fictional leagues pay by value, with a center, rookie deals and options on every team (T15)
  {
    const l = txLeague(3);
    const cap = CAP_FOR(l);
    const rows = l.teams.map((t) => {
      const r = standardRoster(l, t.tid);
      return {
        talent: [...r]
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, 8)
          .reduce((a, p) => a + p.ovr, 0),
        pay: payroll(l, t.tid),
        hasC: r.some((p) => p.pos === 'C'),
        rookies: r.filter((p) => p.contract.rookie).length,
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
    expect(rows.every((r) => r.hasC && r.rookies >= 2 && r.rookies <= 3 && r.overMax === 0)).toBe(true);
    expect(
      corr(
        rows.map((r) => r.talent),
        rows.map((r) => r.pay),
      ),
    ).toBeGreaterThan(0.4);
    expect(Object.values(l.players).some((p) => p.contract.option && !p.contract.rookie)).toBe(true);
    // only this summer's prospects are still to be drafted: the free-agent veterans aren't next year's rookies
    for (const p of Object.values(l.players)) if (p.tid !== DRAFT_PROSPECT) expect(p.draft.year).toBeLessThan(l.season);
  }

  // breaks lottery ties with a seeded draw, the same on every call (T17)
  {
    const orders = [1, 2, 3, 4].map((seed) => {
      const l = txLeague(seed);
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
  }
}, 120_000);

it('competing offers for top free agents (W5, B2), and the player priorities they weigh', () => {
  // a bid at or a little over his asking price, from a team about as appealing as the field, wins:
  // the money counts against his price (of the market), not each team's own (which its appeal already
  // moved), so an offer at a team's own ask scores about the same as any other team's at its own. With
  // the appeal counted twice, a team he liked 10% less needed 25-45% over its ask to win him
  {
    const { l, open } = bidsSummer(6);
    open(U, 45, 0.5);
    open(2, 47, 0.5);
    l.teams[2].strategy = 'contend';
    open(3, 44, 0.5);
    const ps = stars(l, 6, 84);
    let leads = 0;
    for (const p of ps) {
      const ask = askingContract(l, p, U);
      const st = bidStanding(l, p, Math.round((ask.amount * 1.1) / 50) * 50, ask.years);
      if (st.leads) leads++;
      expect(st.offers.length).toBeGreaterThan(0);
      expect(st.toLead!).toBeLessThan(ask.amount * 1.2);
      for (const tid of [U, 2, 3]) {
        const own = askingContract(l, p, tid);
        const u = offerUtility(l, p, tid, own.amount, own.years, EVEN_PREFS);
        expect(u).toBeGreaterThan(0.9);
        expect(u).toBeLessThan(1.12);
      }
    }
    expect(leads).toBeGreaterThanOrEqual(4);
  }

  // only top free agents weigh offers, and only in the summer
  {
    const { l, open } = bidsSummer();
    open(U, 41, 0.5);
    const [star] = stars(l, 1);
    const role = freeAgent(l, freeAgents(l)[1], 70);
    expect(marqueeFA(l, star)).toBe(true);
    expect(marqueeFA(l, role)).toBe(false);
    // a role player signs on the spot
    const ask = askingContract(l, role, U);
    expect(userOffer(l, role.pid, ask.amount, ask.years).ok).toBe(true);
    expect(role.tid).toBe(U);
    // the star waits for his decision day
    const res = bidAtAsk(l, star);
    expect(res.ok).toBe(true);
    expect(res.reason).toMatch(/decides on day [23]/);
    expect(star.tid).toBe(FREE_AGENT);
    expect(pendingBid(l, star.pid)!.decideDay).toBeGreaterThan(l.faDay);
    l.phase = 'preseason';
    expect(marqueeFA(l, star)).toBe(false);
  }

  // an offer at his asking price beats a team he likes less
  {
    const { l, open } = bidsSummer();
    open(U, 60, 0.9);
    open(R, 22, 0.1);
    const [star] = stars(l, 1);
    expect(faInterest(l, star).map((o) => o.tid)).toEqual([R]);
    expect(teamAppeal(l, U, star)).toBeGreaterThan(teamAppeal(l, R, star) + 0.05);
    const ask = askingContract(l, star, U);
    expect(bidStanding(l, star, ask.amount, ask.years).leads).toBe(true);
    expect(bidAtAsk(l, star).ok).toBe(true);
    resolveBids(l);
    expect(star.tid).toBe(U);
    expect(l.inbox[0].subject).toMatch(/chose us/);
    expect(l.inbox[0].body).toMatch(new RegExp(`over ${l.teams[R].abbrev}`));
    expect(l.faBids).toBeUndefined();
  }

  // a much more appealing team beats an offer at the asking price, and the inbox compares terms
  {
    const { l, open } = bidsSummer();
    open(U, 20, 0.1);
    open(R, 62, 0.95);
    const [star] = stars(l, 1);
    const ask = askingContract(l, star, U);
    const standing = bidStanding(l, star, ask.amount, ask.years);
    expect(standing.leads).toBe(false);
    // (null: not even a max offer would top theirs)
    expect(standing.toLead === null || standing.toLead > ask.amount).toBe(true);
    // the most you can fund is what the advice checks a lead against: it's an offer you can make, and $50K more isn't
    const pay = mostPayable(l, star, ask.years);
    expect(pay.amount).toBeGreaterThan(0);
    expect(offerBlockedReason(l, star, pay.amount, ask.years)).toBeNull();
    if (pay.amount + 50 <= CAP_FOR(l, contractSeason(l)).maxContract(star.experience)) expect(offerBlockedReason(l, star, pay.amount + 50, ask.years)).not.toBeNull();
    expect(bidAtAsk(l, star).ok).toBe(true);
    resolveBids(l);
    expect(star.tid).toBe(R);
    expect(l.inbox[0].subject).toBe(`${star.firstName} ${star.lastName} signed with ${l.teams[R].abbrev}`.trim());
    expect(l.inbox[0].body).toMatch(/Their offer: .* Our offer: /);
  }

  // refuses offers under 90% of his asking price, states his floor, and a raised offer replaces the first
  {
    const { l, open } = bidsSummer();
    open(U, 41, 0.5);
    const [star] = stars(l, 1);
    const ask = askingContract(l, star, U);
    const floor = bidFloor(l, star, ask.years);
    expect(floor).toBeGreaterThanOrEqual(ask.amount * 0.9);
    expect(floor).toBeLessThan(ask.amount);
    const low = userBid(l, star.pid, floor - 50, ask.years);
    expect(low.ok).toBe(false);
    expect(low.reason).toContain(`$${(floor / 1000).toFixed(1)}M`);
    expect(userBid(l, star.pid, floor, ask.years).ok).toBe(true);
    const first = { ...pendingBid(l, star.pid)! };
    l.faDay = 1;
    expect(userBid(l, star.pid, ask.amount, ask.years).reason).toMatch(/^Offer raised/);
    expect(l.faBids).toHaveLength(1);
    expect(pendingBid(l, star.pid)).toMatchObject({ amount: ask.amount, day: first.day, decideDay: first.decideDay });
    expect(withdrawBid(l, star.pid).ok).toBe(true);
    expect(l.faBids).toBeUndefined();
  }

  // below his asking price an offer wins against rival bids he likes less, and alone: with nobody
  // else's money there, he doesn't hold out (to take less a day later)
  {
    for (const rival of [true, false]) {
      const { l, open } = bidsSummer();
      open(U, 60, 0.9);
      if (rival) open(R, 22, 0.1);
      const [star] = stars(l, 1);
      const ask = askingContract(l, star, U);
      const bid = Math.ceil((ask.amount * 0.95) / 50) * 50;
      if (!rival) expect(bidStanding(l, star, bid, ask.years)).toMatchObject({ leads: true, toLead: bidFloor(l, star, ask.years) });
      expect(userBid(l, star.pid, bid, ask.years).ok).toBe(true);
      resolveBids(l);
      expect(star.tid).toBe(U);
    }
  }

  // counts pending offers against cap space, the mid-level and roster spots, so they can't be spent twice
  {
    const { l, s, open } = bidsSummer();
    const [a, b] = stars(l, 2);
    const role = freeAgent(l, freeAgents(l)[2], 75);
    expect(marqueeFA(l, role)).toBe(false);
    const askA = askingContract(l, a, U).amount;
    open(U, 41, 0.5, askA + 5_000);
    expect(bidAtAsk(l, a).ok).toBe(true);
    expect(pendingBid(l, a.pid)!.route).toBe('space');
    // the space a holds is gone for b, and for an on-the-spot signing too
    const second = bidAtAsk(l, b);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/after your pending offers/);
    const roleAsk = askingContract(l, role, U);
    expect(roleAsk.amount).toBeGreaterThan(5_000);
    expect(offerBlockedReason(l, role, roleAsk.amount, roleAsk.years)).toMatch(/after your pending offers/);
    expect(userOffer(l, role.pid, roleAsk.amount, roleAsk.years).ok).toBe(false);
    // the mid-level is still there beside a's offer on space: a third top player can lean on it, and then nothing else can
    l.teams[U].mleSeason = undefined;
    const c = freeAgent(
      l,
      freeAgents(l).find((p) => ![a.pid, b.pid, role.pid].includes(p.pid))!,
      78,
    );
    const cAsk = askingContract(l, c, U);
    expect(marqueeFA(l, c)).toBe(true);
    const mle = userMleRoom(l, s, c.pid);
    expect(mle).toBe(exceptionAmount(l, 'mle', s));
    expect(mle).toBeGreaterThanOrEqual(bidFloor(l, c, cAsk.years));
    expect(userBid(l, c.pid, Math.min(mle, cAsk.amount), cAsk.years).ok).toBe(true);
    expect(pendingBid(l, c.pid)!.route).toBe('mle');
    expect(userMleRoom(l, s)).toBe(0);
    expect(offerBlockedReason(l, role, roleAsk.amount, roleAsk.years)).toMatch(/uses your mid-level exception|after your pending offers/);
    withdrawBid(l, c.pid);
    l.teams[U].mleSeason = s;
    // with a's offer withdrawn, its room is free again
    expect(withdrawBid(l, a.pid).ok).toBe(true);
    expect(userOffer(l, role.pid, roleAsk.amount, roleAsk.years).ok).toBe(true);
    // roster spots: 20 signed and one pending offer fill the 21
    l.teams[U].deadMoney = [];
    expect(bidAtAsk(l, a).ok).toBe(true);
    while (standardRoster(l, U).length < 20)
      signPlayer(l, freeAgents(l).filter((p) => p.pid !== a.pid && p.pid !== b.pid)[0], U, CAP_FOR(l, s).vetMin, 1, { news: false, start: s });
    expect(bidAtAsk(l, b).reason).toMatch(/full \(21\) counting your 1 pending offer/);
  }

  // an offer the user can no longer pay for falls through, with an explanation
  {
    for (const rival of [true, false]) {
      const { l, s, cap, open } = bidsSummer();
      open(U, 60, 0.9);
      if (rival) open(R, 22, 0.1);
      const [star] = stars(l, 1);
      expect(bidAtAsk(l, star).ok).toBe(true);
      // say a trade took on salary meanwhile: the space is gone
      l.teams[U].deadMoney.push({ pid: -3, name: 'z', season: s, amount: cap.salaryCap });
      resolveBids(l);
      expect(star.tid).toBe(rival ? R : FREE_AGENT);
      expect(l.inbox[0].body).toMatch(/fell through: we no longer have the cap space/);
      expect(l.faBids).toBeUndefined();
    }
  }

  // a minimum signing while an offer is pending does not void it: it could have come after
  {
    const { l, s, open } = bidsSummer();
    const [star] = stars(l, 1);
    const ask = askingContract(l, star, U).amount;
    open(U, 60, 0.9, ask + 500);
    expect(bidAtAsk(l, star).ok).toBe(true);
    const cheap = freeAgents(l).find((p) => p.pid !== star.pid && askingContract(l, p, U).amount <= CAP_FOR(l, s).vetMin)!;
    const min = askingContract(l, cheap, U);
    expect(userOffer(l, cheap.pid, min.amount, min.years).reason).toMatch(/signed|accepts/);
    expect(payroll(l, U, s) + ask).toBeGreaterThan(CAP_FOR(l, s).salaryCap);
    resolveBids(l);
    expect(star.tid).toBe(U);
  }

  // a mid-level signing counts against a pending offer on cap space; only a minimum signing could have come after it
  {
    const { l, s, cap, open } = bidsSummer();
    const [star] = stars(l, 1);
    open(U, 41, 0.5);
    const ask = askingContract(l, star, U).amount;
    l.teams[U].deadMoney.push({ pid: -2, name: 'y', season: s, amount: cap.salaryCap - payroll(l, U, s) - ask - 1_000 });
    l.teams[U].mleSeason = undefined;
    expect(bidAtAsk(l, star).ok).toBe(true);
    const others = freeAgents(l).filter((p) => p.pid !== star.pid);
    // (his own minimum: the veteran minimum only after three seasons)
    const cheap = others.find((p) => askingContract(l, p, U).amount <= (p.experience < 3 ? CAP_FOR(l, s).minContract : CAP_FOR(l, s).vetMin))!;
    const role = freeAgent(
      l,
      others.find((p) => p !== cheap)!,
      70,
    );
    const roleAsk = askingContract(l, role, U);
    expect(roleAsk.amount).toBeGreaterThan(1_000);
    expect(roleAsk.amount).toBeLessThanOrEqual(exceptionAmount(l, 'mle', s));
    expect(offerRoute(l, role, roleAsk.amount, s, roleAsk.years)).toBe('mle');
    expect(userOffer(l, role.pid, roleAsk.amount, roleAsk.years).ok).toBe(true);
    expect(l.teams[U].mleSeason).toBe(s);
    expect(pendingBid(l, star.pid)!.slack).toBeUndefined();
    const min = askingContract(l, cheap, U);
    expect(userOffer(l, cheap.pid, min.amount, min.years).ok).toBe(true);
    expect(pendingBid(l, star.pid)!.slack).toBe(cheap.contract.salaries[0]);
  }

  // a contender's offer stays within its cap space, and wins only on a route it can pay with
  {
    const { l, s, cap, open } = bidsSummer();
    open(U, 20, 0.1);
    open(R, 60, 0.9);
    l.teams[R].strategy = 'contend';
    const [star] = stars(l, 1);
    const askR = askingContract(l, star, R);
    // space for his ask, a little short of 5% more
    const more = Math.round((askR.amount * 1.05) / 50) * 50;
    l.teams[R].deadMoney.push({ pid: -5, name: 'v', season: s, amount: cap.salaryCap - payroll(l, R, s) - more + 200 });
    const space = capSpace(l, R, s);
    expect(space).toBeGreaterThanOrEqual(askR.amount);
    expect(space).toBeLessThan(more);
    const [offer] = faInterest(l, star);
    expect(offer).toMatchObject({ tid: R, route: 'space' });
    expect(offer.amount).toBeGreaterThanOrEqual(askR.amount);
    expect(offer.amount).toBeLessThanOrEqual(space);
    // the user's floor loses to it, and R pays with its space
    expect(userBid(l, star.pid, bidFloor(l, star, askR.years), askR.years).ok).toBe(true);
    resolveBids(l);
    expect(star.tid).toBe(R);
    expect(star.contract.salaries[0]).toBe(offer.amount);
    expect(payroll(l, R, s)).toBeLessThanOrEqual(cap.salaryCap);
  }

  // AI teams never sign a player weighing the user's offer before his decision day
  {
    const { l, open } = bidsSummer();
    // every team can pay him
    for (const t of l.teams) open(t.tid, 41, 0.5);
    const [star] = stars(l, 1, 90);
    const control = structuredClone(l);
    expect(bidAtAsk(l, star).ok).toBe(true);
    pendingBid(l, star.pid)!.decideDay = 4;
    const run = (x: League, days: number) => {
      const rng = new Rng(3);
      for (let d = 0; d < days; d++) {
        faDay(x, rng, 5);
        x.faDay++;
      }
    };
    // without the offer somebody signs him within three days
    run(control, 3);
    expect(control.players[star.pid].tid).toBeGreaterThanOrEqual(0);
    run(l, 3);
    expect(star.tid).toBe(FREE_AGENT);
    expect(pendingBid(l, star.pid)).toBeDefined();
    // the fourth day's market opens with his decision
    run(l, 1);
    expect(star.tid).toBeGreaterThanOrEqual(0);
    expect(l.faBids).toBeUndefined();
  }

  // advancing free agency to its end decides every offer, and offers made on the last day are decided as it closes
  {
    const l = bidsLeague(7);
    l.phase = 'resign';
    startFreeAgency(l);
    const s = contractSeason(l);
    const give = () => {
      l.teams[U].deadMoney = [];
      l.teams[U].mleSeason = undefined;
      for (const p of standardRoster(l, U)) p.contract = { start: s, salaries: [CAP_FOR(l, s).vetMin] };
    };
    give();
    const pool = freeAgents(l).sort((a, b) => b.ovr - a.ovr);
    const targets = pool.slice(0, 3).map((p) => freeAgent(l, p, 84));
    for (const p of targets) expect(bidAtAsk(l, p).ok).toBe(true);
    faAdvance(l, 1);
    const late = freeAgent(l, freeAgents(l).filter((p) => !pendingBid(l, p.pid))[0], 84);
    expect(bidAtAsk(l, late).ok).toBe(true);
    faAdvance(l, FA_DAYS);
    expect(l.faBids).toBeUndefined();
    for (const p of [...targets, late]) expect(pendingBid(l, p.pid)).toBeUndefined();
    // the last day: decided when the market closes
    give();
    const last = freeAgent(l, freeAgents(l)[0], 86);
    const res = bidAtAsk(l, last);
    expect(res.reason).toMatch(/when free agency closes/);
    expect(newSeason(l)).toBe(true);
    expect(l.faBids).toBeUndefined();
  }

  // opens free agency for every team at once: AI teams make their first wave of signings with the user, but no top free agent decides before the second day
  {
    const l = bidsLeague(9);
    l.phase = 'resign';
    const before = new Map(Object.values(l.players).map((p) => [p.pid, p.tid]));
    startFreeAgency(l);
    const moved = Object.values(l.players).filter((p) => p.tid >= 0 && p.tid !== l.userTid && before.get(p.pid) !== p.tid);
    expect(moved.length).toBeGreaterThan(0);
    // the top free agents (worth 78+) decide from the market's second day: all still there for the user's bids
    expect(moved.filter((p) => valueScore(l, p) >= 78)).toEqual([]);
    expect(freeAgents(l).some((p) => marqueeFA(l, p))).toBe(true);
  }

  // are fixed for a player in a league, average 1, and price teams as before on average
  {
    const l = bidsLeague();
    const ps = Object.values(l.players).filter((p) => p.tid >= FREE_AGENT);
    expect(ps.length).toBeGreaterThan(300);
    const copy = structuredClone(l);
    for (const p of ps.slice(0, 40)) {
      const w = playerPrefs(l, p);
      expect(playerPrefs(copy, p)).toEqual(w);
      expect(PREF_KEYS.reduce((a, k) => a + w[k], 0) / PREF_KEYS.length).toBeCloseTo(1, 10);
    }
    // another league, another personality
    const other = { ...l, id: 'elsewhere' };
    expect(ps.slice(0, 20).some((p) => playerPrefs(other, p).winning !== playerPrefs(l, p).winning)).toBe(true);
    for (const k of PREF_KEYS) expect(Math.abs(ps.reduce((a, p) => a + playerPrefs(l, p)[k], 0) / ps.length - 1)).toBeLessThan(0.05);
    // shape a spread of records and markets, so the terms the priorities weigh aren't all zero
    l.teams.forEach((t, i) => {
      const ts = curTeamSeason(l, t.tid);
      ts.won = 20 + ((i * 7) % 43);
      ts.lost = 82 - ts.won;
      t.hype = (i % 10) / 10;
    });
    for (const tid of [0, 7, 13, 22]) {
      const mean = (f: (p: Player) => number) => ps.reduce((a, p) => a + f(p), 0) / ps.length;
      expect(Math.abs(mean((p) => teamAppeal(l, tid, p)) - mean((p) => teamAppeal(l, tid, p, EVEN_PREFS)))).toBeLessThan(0.01);
    }
    // a player who cares about winning likes a winner more than one who doesn't
    const p = ps[0];
    const winner = l.teams.map((t) => t.tid).sort((a, b) => curTeamSeason(l, b).won - curTeamSeason(l, a).won)[0];
    expect(teamAppeal(l, winner, p, { ...EVEN_PREFS, winning: 1.6 })).toBeGreaterThan(teamAppeal(l, winner, p, { ...EVEN_PREFS, winning: 0.4 }));
  }
}, 120_000);
