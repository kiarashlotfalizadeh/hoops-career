// Contracts with the user's own players and the ones he lets go. Negotiating with an agent: his ask
// signs him on the spot, a hidden walk-away price a little under it too, below it he counters and
// his patience drops, and out of patience talks break down by the period; AI teams never negotiate.
// Extensions: who and when, what he asks, how one shows on the books and the season it takes over.
// Releases: waivers and buyouts (W10), the stretch provision, 10-day contracts and the hardship
// exception. Fictional leagues with hand-shaped players keep these fast: each scenario builds its own.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { newSeason, startRegularSeason } from '../league/season';
import { CAP_FOR, age, contractSeason, curTeamSeason, freeAgents, payroll, revenueScale, standardRoster, teamPlayers, teamSeason, twoWayRoster } from '../league/helpers';
import {
  DEC_15,
  FIRED_REASON,
  WAIVER_DAYS,
  aiBuyouts,
  askingContract,
  buyoutTerms,
  claimBlockedReason,
  convertTwoWay,
  decideTeamOption,
  extensionAsk,
  extensionBlockedReason,
  extensionRefusal,
  injuryShare,
  marketSalary,
  roleMpg,
  onWaivers,
  releaseDeadMoney,
  releasePlayer,
  releaseSchedule,
  resolveWaivers,
  rookieContract,
  signPlayer,
  stretchDeadMoney,
  stretchPhrase,
  teamAppeal,
  contractBurden,
  tradeValue,
  userBuyout,
  userClaim,
  valueScore,
  waiverOrder,
  willExtend,
  type Strategy,
} from '../league/contracts';
import {
  COOL_EXTEND,
  COOL_FA,
  COOL_SEASON,
  FIRM_BUMP,
  LOWBALL,
  PATIENCE,
  askFor,
  breakdownRule,
  initialPatience,
  patienceText,
  talkAsk,
  talkState,
  termsFactor,
  userExtend,
  walkAwayDiscount,
  walkAwayFor,
} from '../league/negotiation';
import { aiExtensions, capHolds, expiringPlayers, releaseExpiring, renouncePlayer, signedThisSummer, userOffer, userResign } from '../league/freeAgency';
import { executeTrade, untradeableReason, validateTrade } from '../league/trades';
import {
  HARDSHIP_OUT,
  TEN_DAYS,
  hardship,
  tenDayBlockedReason,
  tenDayClosedReason,
  tenDayDaily,
  tenDayEndBlockedReason,
  tenDayLeft,
  tenDayOpenDay,
  tenDayPay,
  tenDaySpot,
  tenDaysWith,
  userEndTenDay,
  userTenDay,
  userTenDayRest,
} from '../league/tenDay';
import { gameFinances } from '../league/finances';
import { takeOverTeam } from '../league/owner';
import { txnLine, txnText } from '../league/transactions';
import { CAP } from '../constants';
import { blankStats, contractExp, extensionStart, salaryFor } from '../playerGen';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function talksLeague(phase: League['phase'] = 'regular', rngSeed = 7): League {
  const l = createLeague({ name: `neg${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // the walk-away price hashes the league id: a fixed one keeps runs identical
  l.id = `neg_${rngSeed}`;
  l.phase = phase;
  l.day = phase === 'regular' ? 20 : l.day;
  // a cheap roster of 13: spots and room under the cap for any free agent here
  const s = contractSeason(l);
  for (const p of standardRoster(l, U).slice(13)) p.tid = FREE_AGENT;
  for (const p of standardRoster(l, U)) p.contract = { start: s - 1, salaries: [CAP_FOR(l, s).vetMin, CAP_FOR(l, s).vetMin, CAP_FOR(l, s).vetMin] };
  l.teams[U].deadMoney = [];
  return l;
}

/** A free agent of known value: OVR = POT, 27, healthy, asking his market price. */
function freeAgent(l: League, ovr = 74, age = 27, i = 0): Player {
  const p = freeAgents(l).filter((x) => !x.rfa)[i];
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.experience = 5;
  p.injury = null;
  p.contract = { start: l.season, salaries: [0] };
  p.asking = undefined;
  p.asking = askingContract(l, p);
  return p;
}

/** One of the user's players whose deal runs out this season (re-sign period). */
function expiring(l: League, ovr = 74, age = 27): Player {
  const p = standardRoster(l, U)[0];
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.experience = 5;
  p.injury = null;
  p.contract = { start: l.season - 1, salaries: [8_000, 8_000] };
  return p;
}

const round50 = (x: number) => Math.round(x / 50) * 50;

function extLeague(rngSeed = 5): League {
  const l = createLeague({ name: `ext${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  // a fixed id: the AI's extension rolls are drawn from it (a league's own id reads the clock)
  l.id = `ext${rngSeed}`;
  return l;
}

/**
 * A player in the final season of a two-year deal signed last season (next season's deal in the
 * offseason), healthy, with a known value: OVR = POT and his age.
 */
function finalYear(l: League, p: Player, ovr: number, age: number, salary = 10_000): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
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

/** Team `from` traded him to team `to` this season. */
function tradedThisSeason(l: League, p: Player, to: number) {
  const from = p.tid;
  executeTrade(l, { a: { tid: from, pids: [p.pid], dpids: [] }, b: { tid: to, pids: [], dpids: [] } });
  expect(p.tradedFrom).toEqual({ tid: from, season: l.season, day: l.day });
}

const tradeBack = (l: League, p: Player, from: number, to: number) =>
  validateTrade(l, { a: { tid: from, pids: [p.pid], dpids: [] }, b: { tid: to, pids: [], dpids: [] } }).filter((e) => /away this season/.test(e));

function waiversLeague(rngSeed = 11): League {
  const l = createLeague({ name: `w${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `waivers_${rngSeed}`;
  l.phase = 'regular';
  l.day = 20;
  // everyone 10-10, so a test can make the team it wants first in the waiver order
  for (const t of l.teams) Object.assign(curTeamSeason(l, t.tid), { won: 10, lost: 10 });
  return l;
}

const record = (l: League, tid: number, won: number) => Object.assign(curTeamSeason(l, tid), { won, lost: 20 - won });

/** A player of known value and contract (`salary` a season, `years` from this season). */
function shape(l: League, p: Player, ovr: number, age: number, salary: number, years: number): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  p.contract = { start: l.season, salaries: Array.from({ length: years }, () => salary) };
  return p;
}

/** Bring a team to `n` standard players: preseason cuts (no waivers), or free agents on minimum deals. */
function cutTo(l: League, tid: number, n: number) {
  const phase = l.phase;
  l.phase = 'preseason';
  while (standardRoster(l, tid).length > n) releasePlayer(l, standardRoster(l, tid)[0], { news: false });
  l.phase = phase;
  while (standardRoster(l, tid).length < n) signPlayer(l, freeAgents(l)[0], tid, CAP_FOR(l).vetMin, 1, { news: false });
}

const deadFor = (l: League, tid: number, pid: number) => l.teams[tid].deadMoney.filter((d) => d.pid === pid).reduce((a, d) => a + d.amount, 0);
const passDays = (l: League, n: number) => {
  for (let i = 0; i < n; i++) {
    l.day++;
    resolveWaivers(l);
  }
};

function stretchLeague(phase: League['phase'] = 'regular'): League {
  const l = createLeague({ name: 'stretch', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
  l.id = 'stretch_3';
  l.phase = phase;
  l.day = phase === 'regular' ? 30 : l.day;
  for (const t of l.teams) Object.assign(curTeamSeason(l, t.tid), { won: 10, lost: 10 });
  return l;
}

/** One of the user's players on `salary` a season from `start` for `years`. */
function signed(l: League, salary: number, years: number, start = l.season, age = 27): Player {
  const p = standardRoster(l, U)[0];
  p.ovr = p.pot = 70;
  p.bornYear = l.season - age;
  p.experience = 6;
  p.injury = null;
  p.contract = { start, salaries: Array.from({ length: years }, () => salary) };
  return p;
}

const sum = (xs: { amount: number }[]) => xs.reduce((a, d) => a + d.amount, 0);
const deadOf = (l: League, pid: number) => l.teams[U].deadMoney.filter((d) => d.pid === pid).sort((a, b) => a.season - b.season);

function tenLeague(): League {
  const l = createLeague({ name: 'ten', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 4 });
  l.id = 'ten_4';
  l.phase = 'regular';
  l.day = tenDayOpenDay(l);
  return l;
}

/** Bring a team to `n` healthy standard players (the rest become free agents, or free agents join on minimum deals). */
function rosterOf(l: League, tid: number, n: number) {
  for (const p of standardRoster(l, tid).slice(n)) p.tid = FREE_AGENT;
  while (standardRoster(l, tid).length < n)
    signPlayer(
      l,
      freeAgents(l)
        .filter((x) => !x.rfa)
        .at(-1)!,
      tid,
      CAP_FOR(l).vetMin,
      1,
      { news: false },
    );
  for (const p of standardRoster(l, tid)) p.injury = null;
  l.teams[tid].rotation.order = standardRoster(l, tid).map((p) => p.pid);
}

/** A free agent who'd sign for the minimum. */
function minGuy(l: League, i = 0): Player {
  const p = freeAgents(l).filter((x) => !x.rfa)[i];
  p.ovr = p.pot = 62;
  p.experience = 4;
  p.injury = null;
  p.asking = { amount: CAP_FOR(l).vetMin, years: 1 };
  expect(askingContract(l, p, U).amount).toBe(CAP_FOR(l).vetMin);
  return p;
}

const out = (p: Player, games = 10) => (p.injury = { type: 'Sprained Ankle', gamesRemaining: games, gamesTotal: games, severity: 'minor' });

it('negotiation and extensions: the ask, the walk-away price, counters and patience; the extension window, its ask and the books; free agents leave their trade history behind', () => {
  // his ask on his terms signs him on the spot; a little under it (at his walk-away price) too
  {
    const l = talksLeague();
    const p = freeAgent(l);
    const ask = talkAsk(l, p, 'fa');
    expect(ask).toEqual(askingContract(l, p, U));
    const walk = walkAwayFor(l, p, 'fa', ask.years);
    expect(walk).toBeLessThanOrEqual(ask.amount);
    expect(walk).toBeGreaterThanOrEqual(ask.amount * 0.88 - 1);
    expect(userOffer(l, p.pid, Math.ceil(walk / 50) * 50, ask.years).ok).toBe(true);
    expect(p.tid).toBe(U);
    // signed: the talks are gone
    expect(p.talks).toBeUndefined();
    const q = freeAgent(l, 74, 27, 1);
    const a2 = talkAsk(l, q, 'fa');
    expect(userOffer(l, q.pid, a2.amount, a2.years).ok).toBe(true);
  }

  // is the same however often you ask, differs from player to player, and stays within 0-12% of the ask
  {
    const l = talksLeague();
    const ds = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const p = freeAgent(l, 72, 27, i);
      const d = walkAwayDiscount(l, p, 'fa');
      expect(walkAwayDiscount(l, p, 'fa')).toBe(d);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(0.12);
      ds.add(Math.round(d * 1000));
    }
    expect(ds.size).toBeGreaterThan(4);
  }

  // a player keen on the team, older, or later in the summer gives more; a money-first star less
  {
    const l = talksLeague('freeAgency');
    l.faDay = 0;
    const p = freeAgent(l, 72, 27);
    const base = walkAwayDiscount(l, p, 'fa');
    l.faDay = 25;
    expect(walkAwayDiscount(l, p, 'fa')).toBeGreaterThan(base);
    l.faDay = 0;
    p.bornYear = l.season + 1 - 33;
    expect(walkAwayDiscount(l, p, 'fa')).toBeGreaterThan(base);
    p.bornYear = l.season + 1 - 27;
    // a winning, buzzing team
    l.teams[U].hype = 1;
    Object.assign(teamSeason(l.teams[U], l.season - 1), { won: 65, lost: 17 });
    expect(teamAppeal(l, U, p)).toBeGreaterThan(1);
    expect(walkAwayDiscount(l, p, 'fa')).toBeGreaterThan(base);
    // a star: less room
    p.ovr = p.pot = 84;
    expect(valueScore(l, p)).toBeGreaterThanOrEqual(82);
    expect(walkAwayDiscount(l, p, 'fa')).toBeLessThan(walkAwayDiscount(l, { ...p, ovr: 72, pot: 72 }, 'fa'));
  }

  // a player option takes 4% off his price and a team option adds 6%; each year away from his length 3%
  {
    const ask = { amount: 10_000, years: 3 };
    expect(termsFactor(ask, 3)).toBe(1);
    expect(termsFactor(ask, 3, 'player')).toBeCloseTo(0.96);
    expect(termsFactor(ask, 3, 'team')).toBeCloseTo(1.06);
    expect(termsFactor(ask, 5)).toBeCloseTo(1.06);
    const l = talksLeague();
    const p = freeAgent(l);
    const a = talkAsk(l, p, 'fa');
    expect(askFor(l, p, 'fa', a.years, 'player')).toBeLessThan(askFor(l, p, 'fa', a.years));
    expect(askFor(l, p, 'fa', a.years, 'team')).toBeGreaterThan(askFor(l, p, 'fa', a.years));
    // an option needs two years; his ask with a team option signs him with it
    expect(userOffer(l, p.pid, askFor(l, p, 'fa', 1, 'team'), 1, { option: 'team' }).reason).toMatch(/two years or more/);
    const years = Math.max(2, a.years);
    expect(userOffer(l, p.pid, askFor(l, p, 'fa', years, 'team'), years, { option: 'team' }).ok).toBe(true);
    expect(p.contract.option).toBe('team');
    expect(p.contract.salaries.length).toBe(years);
  }

  // below his walk-away price he counters on the length he wants, between the offer and his ask, and his counter signs him
  {
    const l = talksLeague();
    const p = freeAgent(l);
    const ask = talkAsk(l, p, 'fa');
    // two years where he wants more: 3% a year more, and a counter on his own length
    const years = ask.years > 2 ? 2 : ask.years + 1;
    const offer = round50(askFor(l, p, 'fa', years) * 0.87);
    expect(offer).toBeLessThan(walkAwayFor(l, p, 'fa', years));
    const res = userOffer(l, p.pid, offer, years);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/counters at \$[\d.]+M a season over \d years?/);
    const c = res.counter!;
    expect(c.years).toBe(ask.years);
    expect(c.option).toBeUndefined();
    expect(c.amount).toBeLessThanOrEqual(askFor(l, p, 'fa', c.years));
    expect(c.amount).toBeGreaterThanOrEqual(walkAwayFor(l, p, 'fa', c.years) - 50);
    expect(p.talks).toMatchObject({ tid: U, kind: 'fa', period: 'season', patience: initialPatience(l, p) - 1, counter: c });
    expect(patienceText(p.talks!.patience)).toMatch(/more offers? below his price and talks break down/);
    // a second offer below his price: a counter no higher than the first
    const again = userOffer(l, p.pid, round50(ask.amount * 0.88), ask.years);
    expect(again.counter!.amount).toBeLessThanOrEqual(c.amount);
    // his counter, as offered, signs him
    expect(userOffer(l, p.pid, again.counter!.amount, again.counter!.years).ok).toBe(true);
    expect(p.tid).toBe(U);
  }

  // a lowball costs two patience and a little interest: his ask from you goes up, AI teams see no change
  {
    const l = talksLeague();
    const p = freeAgent(l);
    const ask = talkAsk(l, p, 'fa');
    const aiAsk = askingContract(l, p, AI);
    const appeal = teamAppeal(l, U, p);
    const res = userOffer(l, p.pid, round50(ask.amount * (LOWBALL - 0.1)), ask.years);
    expect(res.reason).toMatch(/lowball: he's less keen/);
    expect(p.talks!.patience).toBe(initialPatience(l, p) - 2);
    expect(p.talks!.lowballs).toBe(1);
    expect(teamAppeal(l, U, p)).toBeLessThan(appeal);
    expect(askingContract(l, p, U).amount).toBeGreaterThan(ask.amount);
    expect(askingContract(l, p, AI)).toEqual(aiAsk);
    expect(teamAppeal(l, AI, p)).toBe(teamAppeal(l, AI, { ...p, talks: undefined }));
  }

  // out of patience in season, he won't take your calls for a week
  {
    const l = talksLeague();
    const p = freeAgent(l, 72);
    const ask = talkAsk(l, p, 'fa');
    expect(breakdownRule(l, 'fa')).toMatch(/a week/);
    let last = { ok: true, reason: '' };
    for (let i = 0; i < PATIENCE + 2 && p.talks?.closed === undefined; i++) last = userOffer(l, p.pid, round50(ask.amount * 0.87), ask.years);
    expect(last.reason).toMatch(/Talks broke down: .* won't take your calls until/);
    expect(p.talks!.closed).toEqual({ season: l.season, day: l.day + COOL_SEASON });
    // even his ask isn't heard now
    expect(userOffer(l, p.pid, ask.amount, ask.years).reason).toMatch(/isn't taking your calls/);
    expect(talkState(l, p, 'fa').closed).toBeDefined();
    l.day += COOL_SEASON;
    // talks are on again, patience back (the interest lost stays)
    expect(talkState(l, p, 'fa')).toMatchObject({ patience: initialPatience(l, p), started: false });
    expect(userOffer(l, p.pid, askingContract(l, p, U).amount, ask.years).ok).toBe(true);
  }

  // in free agency, a few days off; after two lowballs, the rest of the summer
  {
    const l = talksLeague('freeAgency');
    l.faDay = 3;
    const p = freeAgent(l, 72);
    const q = freeAgent(l, 72, 27, 1);
    const ask = talkAsk(l, p, 'fa');
    for (let i = 0; i < PATIENCE + 2 && !p.talks?.closed; i++) userOffer(l, p.pid, round50(ask.amount * 0.87), ask.years);
    expect(p.talks!.closed).toEqual({ season: l.season, day: l.day + COOL_FA });
    const qa = talkAsk(l, q, 'fa');
    const r1 = userOffer(l, q.pid, round50(qa.amount * 0.6), qa.years);
    expect(r1.ok).toBe(false);
    const r2 = userOffer(l, q.pid, round50(qa.amount * 0.6), qa.years);
    expect(r2.reason).toMatch(/after two lowballs, .* won't talk to you again this summer/);
    expect(q.talks!.closed).toEqual({ season: l.season + 1, day: 0 });
    l.day += 20;
    expect(userOffer(l, q.pid, qa.amount * 2, qa.years).reason).toMatch(/isn't taking your calls until the preseason/);
  }

  // in the re-sign period his ask goes up and he takes nothing less for the rest of it
  {
    const l = talksLeague('resign');
    const p = expiring(l);
    const ask = talkAsk(l, p, 'resign');
    for (let i = 0; i < PATIENCE + 2 && !p.talks?.firm; i++) userResign(l, p.pid, round50(ask.amount * 0.87), ask.years);
    expect(p.talks!.firm).toBe(FIRM_BUMP);
    const firm = talkAsk(l, p, 'resign');
    expect(firm.amount).toBe(Math.ceil((ask.amount * FIRM_BUMP) / 50) * 50);
    expect(walkAwayDiscount(l, p, 'resign')).toBe(0);
    // his old ask isn't enough any more, and it costs nothing to hear
    const r = userResign(l, p.pid, ask.amount, ask.years);
    expect(r.reason).toMatch(/will only sign at his ask now/);
    expect(p.talks!.patience).toBe(0);
    expect(userResign(l, p.pid, firm.amount, firm.years).ok).toBe(true);
    expect(p.contract.start).toBe(l.season + 1);
  }

  // extensions: the same talks on his extension ask, and 30 days off when they break down
  {
    const l = talksLeague('regular');
    const p = standardRoster(l, U)[1];
    p.ovr = p.pot = 76;
    p.bornYear = l.season - 27;
    p.experience = 5;
    p.injury = null;
    p.contract = { start: l.season - 2, salaries: [9_000, 9_000, 9_000] };
    p.tradeLock = undefined;
    const ask = extensionAsk(l, p);
    expect(talkAsk(l, p, 'extend')).toEqual(ask);
    expect(breakdownRule(l, 'extend')).toMatch(/30 days/);
    for (let i = 0; i < PATIENCE + 2 && !p.talks?.closed; i++) userExtend(l, p.pid, round50(ask.amount * 0.87), ask.years);
    expect(p.talks!.closed).toEqual({ season: l.season, day: l.day + COOL_EXTEND });
    expect(userExtend(l, p.pid, ask.amount, ask.years).ok).toBe(false);
    l.day += COOL_EXTEND;
    expect(userExtend(l, p.pid, extensionAsk(l, p).amount, ask.years).ok).toBe(true);
    expect(p.contract.next).toBeDefined();
    expect(p.talks).toBeUndefined();
  }

  // a new period starts talks over, and signing anywhere ends them
  {
    const l = talksLeague('resign');
    const p = expiring(l);
    const ask = talkAsk(l, p, 'resign');
    userResign(l, p.pid, round50(ask.amount * 0.87), ask.years);
    expect(talkState(l, p, 'resign').patience).toBe(initialPatience(l, p) - 1);
    // free agency opens: he's a free agent, and talks start over
    l.phase = 'freeAgency';
    p.tid = FREE_AGENT;
    expect(talkState(l, p, 'fa')).toMatchObject({ patience: initialPatience(l, p), started: false });
    signPlayer(l, p, AI, marketSalary(l, p), 2, { news: false, start: l.season + 1 });
    expect(p.talks).toBeUndefined();
  }

  // AI teams sign at the ask: nothing in their signings reads the talks
  {
    const l = talksLeague();
    const p = freeAgent(l);
    const before = askingContract(l, p, AI);
    userOffer(l, p.pid, round50(talkAsk(l, p, 'fa').amount * 0.6), 2);
    expect(askingContract(l, p, AI)).toEqual(before);
    expect(teamPlayers(l, AI).every((x) => !x.talks)).toBe(true);
  }

  // opens in the final season of a deal, for the user, from the re-signing period through the regular season
  {
    const l = extLeague();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, U)[0], 78, 27);
    expect(extensionBlockedReason(l, p)).toBeNull();
    // a year left after this one: not yet
    p.contract.salaries.push(10_000);
    expect(extensionBlockedReason(l, p)).toMatch(/final season of his deal/);
    p.contract.salaries.pop();
    // not someone else's player, not a two-way, not for a fired coach
    expect(extensionBlockedReason(l, finalYear(l, standardRoster(l, AI)[0], 78, 27))).toMatch(/your own players/);
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
  }

  // not on a deal he signed this season, and only once
  {
    const l = extLeague();
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
  }

  // a first-round pick in the last season of his rookie deal becomes eligible once his team option is exercised
  {
    const l = extLeague();
    l.phase = 'resign';
    const p = standardRoster(l, U)[0];
    p.draft = { year: l.season - 3, round: 1, pick: 4, tid: U };
    p.experience = 3;
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
  }

  // asks his market value in the money of the extension's first season, less for security, more for a young star
  {
    const l = extLeague();
    l.phase = 'regular';
    const [a, b, c] = standardRoster(l, U);
    const mid = finalYear(l, a, 78, 27);
    const vet = finalYear(l, b, 78, 32);
    const star = finalYear(l, c, 84, 24);
    const cap = CAP_FOR(l, l.season + 1);
    // his market value with the cap's growth, the discount or premium, moved by his interest in the team (10% at most either way)
    const interest = (p: Player) => Math.min(1 / 0.9, Math.max(1 / 1.1, 1 / teamAppeal(l, U, p)));
    const expected = (p: Player, f: number) =>
      Math.min(cap.maxContract(p.experience), Math.round((((marketSalary(l, p) * revenueScale(l, l.season + 1)) / revenueScale(l, l.season)) * f * interest(p)) / 50) * 50);
    expect(extensionAsk(l, mid).amount).toBe(expected(mid, 1));
    expect(extensionAsk(l, vet).amount).toBe(expected(vet, 0.95));
    expect(extensionAsk(l, star).amount).toBe(expected(star, 1.05));
    expect(extensionAsk(l, star).amount).toBeGreaterThan(extensionAsk(l, mid).amount);
    // a veteran's extension runs four years at most
    expect(extensionAsk(l, finalYear(l, a, 78, 23)).years).toBeLessThanOrEqual(4);
  }

  // a star on a team he doesn't fancy gives the same answer all season
  {
    const l = extLeague();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, U)[0], 86, 27);
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
  }

  // counts in next season's payroll, keeps him off the expiring list and cap holds, and adds its years to dead money
  {
    const l = extLeague();
    l.phase = 'regular';
    const p = finalYear(l, standardRoster(l, U)[0], 79, 27, 12_000);
    const before = payroll(l, U, l.season + 1);
    const amount = agreed(l, p, 3);
    // under any walk-away price (12% at most) he counters (see the negotiation checks above)
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
  }

  // takes over when the deal ends, without the rookie scale or an option
  {
    const l = extLeague();
    l.phase = 'regular';
    const p = standardRoster(l, U)[0];
    p.draft = { year: l.season - 4, round: 1, pick: 10, tid: U };
    p.experience = 3;
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
  }

  // picks up an option still on the deal: it would read as the extension's last season
  {
    const l = extLeague();
    l.phase = 'regular';
    // a seed contract whose option season is under way (already settled)
    const p = finalYear(l, standardRoster(l, U)[0], 78, 28);
    p.contract.option = 'player';
    expect(userExtend(l, p.pid, agreed(l, p, 2), 2).ok).toBe(true);
    expect(p.contract.option).toBeUndefined();
  }

  // counts the extension in trade value: a fair one adds little, an overpay makes him a burden
  {
    const l = extLeague();
    l.phase = 'regular';
    const [a, b] = standardRoster(l, U);
    const fair = finalYear(l, a, 79, 27);
    const over = finalYear(l, b, 79, 27);
    const v0 = tradeValue(l, fair);
    expect(userExtend(l, fair.pid, agreed(l, fair, 4), 4).ok).toBe(true);
    expect(userExtend(l, over.pid, CAP_FOR(l, l.season + 1).maxContract(over.experience), 4).ok).toBe(true);
    expect(Math.abs(tradeValue(l, fair) - v0)).toBeLessThan(Math.abs(v0) * 0.25 + 1);
    expect(tradeValue(l, over)).toBeLessThan(tradeValue(l, fair) - 3);
  }

  // values normal contracts as before, within about 2% (season by season now, so an extension's years
  // count); an overpay's burden at DUMP_PER_FIRST of the cap a first, not 0.1 a $1M (see contractBurden)
  {
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
      const counted = optionYear && surplus < 0 ? yrs - 1 : Math.min(yrs, 4);
      return surplus >= 0 ? v + surplus * counted * (strategy === 'rebuild' ? 0.18 : 0.1) : v - contractBurden(l, -surplus * 1000 * counted, strategy);
    };
    for (const seed of [1, 2]) {
      const l = extLeague(seed);
      for (const phase of ['preseason', 'resign'] as const) {
        l.phase = phase;
        for (const p of Object.values(l.players).filter((x) => x.tid >= 0))
          for (const st of ['retool', 'contend', 'rebuild'] as const) {
            const was = old(l, p, st);
            // (a burden counted season by season moves more with a raise in a later year than 0.1 a $1M did)
            const burdened = marketSalary(l, p) < salaryFor(p, contractSeason(l));
            expect(Math.abs(tradeValue(l, p, st) - was)).toBeLessThanOrEqual(Math.abs(was) * (burdened ? 0.1 : 0.02) + (burdened ? 1 : 0.1));
          }
      }
    }
  }

  // opening night: AI teams extend some of their good players in a final season, without touching the league's random stream
  {
    const l = extLeague(3);
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
  }

  // happens when the regular season starts
  {
    const l = extLeague(3);
    for (const t of l.teams.slice(1, 11)) finalYear(l, standardRoster(l, t.tid)[0], 82, 26, 15_000);
    while (standardRoster(l, U).length > 15) releasePlayer(l, standardRoster(l, U)[0], { news: false });
    expect(startRegularSeason(l)).toEqual([]);
    expect(Object.values(l.players).some((p) => p.contract.next)).toBe(true);
  }

  // a renounced player, signed elsewhere, can be traded back to the team that traded him away
  {
    const l = extLeague();
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
  }

  // so can a player whose deal ran out
  {
    const l = extLeague();
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
  }

  // a signing with a new team drops the trade-back rule; a re-signing keeps it
  {
    const l = extLeague();
    l.phase = 'resign';
    const [stay, go] = standardRoster(l, U);
    for (const p of [stay, go]) p.tradedFrom = { tid: AI, season: l.season };
    signPlayer(l, stay, U, 10_000, 2, { news: false, start: l.season + 1 });
    expect(stay.tradedFrom).toMatchObject({ tid: AI, season: l.season });
    go.tid = FREE_AGENT;
    signPlayer(l, go, 2, 10_000, 2, { news: false, start: l.season + 1 });
    expect(go.tradedFrom).toBeUndefined();
  }

  // a two-way converted in the re-signing period isn't listed as signed this summer
  {
    const l = extLeague();
    l.phase = 'resign';
    const tw = twoWayRoster(l, U)[0];
    tw.contract = { start: l.season, salaries: [600, 600], twoWay: true };
    const fa = freeAgents(l)[0];
    signPlayer(l, fa, U, CAP_FOR(l, l.season + 1).vetMin, 1, { news: false, start: l.season + 1 });
    expect(convertTwoWay(l, tw.pid).ok).toBe(true);
    expect(tw.contract.start).toBe(l.season + 1);
    expect(signedThisSummer(l).map((p) => p.pid)).toEqual([fa.pid]);
  }

  // the market pays for the role he has shown (ROLE_PAY): an 80 the staff played 3.7 minutes a game in
  // 21 games asks a bench player's money, not star money; at 32 minutes a game he asks his full price
  {
    const l = talksLeague();
    const p = freeAgent(l, 80, 25);
    const full = marketSalary(l, p);
    p.stats.push({ ...blankStats(l.season, AI, false), gp: 21, min: 78 });
    expect(roleMpg(l, p)).toBeCloseTo(3.7, 1);
    expect(marketSalary(l, p)).toBeLessThan(0.05 * CAP_FOR(l, l.season).salaryCap);
    p.stats[p.stats.length - 1] = { ...blankStats(l.season, AI, false), gp: 60, min: 60 * 32 };
    expect(marketSalary(l, p)).toBe(full);
  }
}, 120_000);

it('releases: waivers and buyouts (W10), the stretch provision, 10-day contracts and the hardship exception', () => {
  // a claim takes over the contract, and the dead money comes off the old team's books
  {
    const l = waiversLeague();
    const vetMin = CAP_FOR(l).vetMin;
    const p = shape(l, standardRoster(l, U)[0], 70, 26, vetMin, 2);
    const claimer = 5;
    cutTo(l, claimer, 14);
    record(l, claimer, 2);
    releasePlayer(l, p);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toMatchObject({ from: U, until: l.day + WAIVER_DAYS });
    expect(deadFor(l, U, p.pid)).toBe(2 * vetMin);
    // on waivers he can be claimed, not signed
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(false);
    expect(onWaivers(l).map((x) => x.pid)).toEqual([p.pid]);
    expect(userOffer(l, p.pid, vetMin, 1).reason).toMatch(/waivers/);
    passDays(l, WAIVER_DAYS - 1);
    expect(p.tid).toBe(FREE_AGENT);
    passDays(l, 1);
    expect(p.tid).toBe(claimer);
    expect(p.waivers).toBeUndefined();
    expect(p.contract.salaries).toEqual([vetMin, vetMin]);
    expect(l.teams[claimer].rotation.order).toContain(p.pid);
    expect(deadFor(l, U, p.pid)).toBe(0);
    expect(l.inbox[0].subject).toMatch(/claimed off waivers/);
  }

  // a claim takes over the contract's trade lock
  {
    const l = waiversLeague();
    const vetMin = CAP_FOR(l).vetMin;
    const p = shape(l, standardRoster(l, 5)[0], 74, 27, vetMin * 3, 1);
    // signed this season: he can't be traded until the lock is up, nor extended this season
    p.tradeLock = { season: l.season, day: l.day + 60 };
    cutTo(l, U, 14);
    record(l, U, 1);
    releasePlayer(l, p);
    expect(userClaim(l, p.pid).ok).toBe(true);
    passDays(l, WAIVER_DAYS);
    expect(p.tid).toBe(U);
    expect(p.tradeLock).toEqual({ season: l.season, day: l.day + 60 - WAIVER_DAYS });
    expect(extensionBlockedReason(l, p)).toMatch(/signed this deal this season/);
  }

  // taking over another team leaves the old team's waiver claims (and free-agent offers) behind
  {
    const l = waiversLeague();
    const p = shape(l, standardRoster(l, 5)[0], 70, 26, CAP_FOR(l).vetMin, 2);
    cutTo(l, U, 14);
    releasePlayer(l, p);
    expect(userClaim(l, p.pid).ok).toBe(true);
    l.faBids = [{ pid: p.pid, amount: 1, years: 1, day: 0, decideDay: 1, route: 'space' }];
    takeOverTeam(l, 7);
    expect(p.waivers?.claim).toBeUndefined();
    expect(l.faBids).toBeUndefined();
  }

  // a contract nobody wants clears to free agency, and its dead money stays
  {
    const l = waiversLeague();
    const p = shape(l, standardRoster(l, U)[0], 62, 31, 30_000, 3);
    releasePlayer(l, p);
    expect(p.waivers).toBeDefined();
    passDays(l, WAIVER_DAYS);
    expect(p.waivers).toBeUndefined();
    expect(p.tid).toBe(FREE_AGENT);
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(true);
    expect(deadFor(l, U, p.pid)).toBe(90_000);
    expect(l.inbox[0].subject).toMatch(/cleared waivers/);
  }

  // the user claims in waiver order: a worse record goes first
  {
    for (const worseAi of [false, true]) {
      const l = waiversLeague();
      const vetMin = CAP_FOR(l).vetMin;
      const from = 7;
      const p = shape(l, standardRoster(l, from)[0], 69, 25, vetMin, 2);
      cutTo(l, U, 14);
      record(l, U, 3);
      const rival = 9;
      cutTo(l, rival, 14);
      if (worseAi) record(l, rival, 1);
      releasePlayer(l, p);
      expect(claimBlockedReason(l, from, p)).toMatch(/released/);
      expect(userClaim(l, p.pid).ok).toBe(true);
      expect(waiverOrder(l)[0].tid).toBe(worseAi ? rival : U);
      passDays(l, WAIVER_DAYS);
      expect(p.tid).toBe(worseAi ? rival : U);
      expect(deadFor(l, from, p.pid)).toBe(0);
      if (worseAi) expect(l.inbox[0].body).toMatch(/ahead of us/);
    }
  }

  // a claim needs a roster spot and room for this season's salary unless it's a minimum
  {
    const l = waiversLeague();
    const from = 7;
    const p = shape(l, standardRoster(l, from)[0], 75, 27, 25_000, 2);
    releasePlayer(l, p);
    cutTo(l, U, 14);
    l.teams[U].deadMoney.push({ pid: -1, name: 'x', season: l.season, amount: CAP_FOR(l).salaryCap });
    expect(userClaim(l, p.pid).reason).toMatch(/cap space/);
    l.teams[U].deadMoney = [];
    while (standardRoster(l, U).length < 15) {
      const fa = freeAgents(l)[0];
      fa.tid = U;
      fa.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    }
    expect(claimBlockedReason(l, U, p)).toMatch(/roster spot/);
  }

  // preseason cuts and minimum camp deals don't go through waivers
  {
    const l = waiversLeague();
    l.phase = 'preseason';
    const p = shape(l, standardRoster(l, U)[0], 70, 26, 10_000, 2);
    const camp = shape(l, standardRoster(l, U)[1], 66, 26, CAP_FOR(l).vetMin, 1);
    releasePlayer(l, p);
    releasePlayer(l, camp);
    expect(p.waivers).toBeUndefined();
    expect(camp.waivers).toBeUndefined();
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(true);
  }

  // claims close with the regular season: a player still on waivers in the play-in clears, and a claim on him falls through
  {
    const l = waiversLeague();
    const vetMin = CAP_FOR(l).vetMin;
    const from = 7;
    const p = shape(l, standardRoster(l, from)[0], 70, 26, vetMin, 2);
    // a team that would claim him first, and the user's claim
    const claimer = 5;
    cutTo(l, claimer, 14);
    record(l, claimer, 2);
    cutTo(l, U, 14);
    releasePlayer(l, p);
    expect(userClaim(l, p.pid).ok).toBe(true);
    // the regular season ends while he's on waivers
    l.phase = 'playin';
    expect(claimBlockedReason(l, U, p)).toMatch(/close with the regular season/);
    expect(claimBlockedReason(l, claimer, p)).toMatch(/close with the regular season/);
    passDays(l, 1);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toBeUndefined();
    expect(deadFor(l, from, p.pid)).toBe(2 * vetMin);
    expect(l.inbox[0].body).toMatch(/fell through\. Waiver claims close with the regular season, as signings do\. He is a free agent now\.$/);
  }

  // everyone left on waivers clears when the season is over
  {
    const l = waiversLeague();
    const p = shape(l, standardRoster(l, U)[0], 70, 26, CAP_FOR(l).vetMin, 2);
    releasePlayer(l, p);
    l.phase = 'draftLottery';
    resolveWaivers(l);
    expect(p.waivers).toBeUndefined();
    expect(p.tid).toBe(FREE_AGENT);
  }

  // cuts the dead money by what he gives back, with no waivers
  {
    const l = waiversLeague();
    const p = shape(l, standardRoster(l, U)[0], 74, 31, 20_000, 2);
    l.teams[U].strategy = 'contend';
    const base = buyoutTerms(l, p)!;
    expect(base.owed).toBe(40_000);
    expect(base.giveback).toBeGreaterThanOrEqual(0);
    expect(base.giveback).toBeLessThanOrEqual(0.35);
    // older, or on a team that isn't contending: he gives back more
    p.bornYear = l.season - 33;
    const older = buyoutTerms(l, p)!;
    expect(older.giveback).toBeGreaterThan(base.giveback);
    l.teams[U].strategy = 'rebuild';
    const most = buyoutTerms(l, p)!;
    expect(most.giveback).toBeGreaterThan(older.giveback);
    expect(most.giveback).toBeLessThanOrEqual(0.35);
    const res = userBuyout(l, p.pid);
    expect(res.ok).toBe(true);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toBeUndefined();
    expect(deadFor(l, U, p.pid)).toBe(most.dead);
    expect(Math.abs(most.dead - most.owed * (1 - most.giveback))).toBeLessThanOrEqual(20);
    expect(most.saved).toBeGreaterThan(0);
  }

  // is for veterans with guaranteed money left
  {
    const l = waiversLeague();
    const young = shape(l, standardRoster(l, U)[0], 74, 26, 20_000, 2);
    expect(buyoutTerms(l, young)).toBeNull();
    expect(userBuyout(l, young.pid).ok).toBe(false);
    const camp = shape(l, standardRoster(l, U)[1], 70, 30, CAP_FOR(l).vetMin, 1);
    l.phase = 'preseason';
    expect(buyoutTerms(l, camp)).toBeNull();
  }

  // AI rebuilders buy out veterans after the deadline but never go under 14 players
  {
    const l = waiversLeague();
    const before = new Map<number, number>();
    for (const t of l.teams) {
      if (t.tid === U) continue;
      t.strategy = 'rebuild';
      cutTo(l, t.tid, 13 + (t.tid % 3));
      const vet = standardRoster(l, t.tid)[0];
      shape(l, vet, 75, 32, 12_000, 1);
      expect(contractExp(vet.contract)).toBe(l.season);
      before.set(t.tid, standardRoster(l, t.tid).length);
    }
    let bought = 0;
    for (let d = 0; d < 6; d++) {
      l.day = l.tradeDeadlineDay + 1 + d;
      const fa = freeAgents(l).length;
      aiBuyouts(l);
      bought += freeAgents(l).length - fa;
      for (const [tid, n] of before) expect(standardRoster(l, tid).length).toBeGreaterThanOrEqual(Math.min(n, 14));
    }
    expect(bought).toBeGreaterThan(0);
    for (const [tid, n] of before) if (n < 15) expect(standardRoster(l, tid).length).toBe(n);
    expect(onWaivers(l)).toEqual([]);
  }

  // in season: this season is paid as usual, the seasons after it spread over twice their number plus one
  {
    const l = stretchLeague();
    const p = signed(l, 12_000, 3);
    const sched = stretchDeadMoney(l, releaseSchedule(l, p))!;
    expect(sched[0]).toEqual({ season: l.season, amount: 12_000 });
    const rest = sched.slice(1);
    expect(rest.map((d) => d.season)).toEqual([1, 2, 3, 4, 5].map((i) => l.season + i));
    expect(rest.every((d) => d.stretched)).toBe(true);
    expect(sum(rest)).toBe(24_000);
    expect(rest.slice(0, -1).every((d) => d.amount === 4_800)).toBe(true);
    const before = payroll(l, U, l.season + 1);
    releasePlayer(l, p, { stretch: true });
    // waived in season with guaranteed money: the stretched schedule is what a claim would wipe
    expect(p.waivers?.dead).toEqual(sched);
    expect(deadOf(l, p.pid).map(({ season, amount }) => ({ season, amount }))).toEqual(sched.map(({ season, amount }) => ({ season, amount })));
    expect(payroll(l, U, l.season + 1) - before).toBe(4_800 - 12_000);
    expect(stretchPhrase(l, 5)).toBe("this season's as usual and the rest stretched over 5 seasons");
  }

  // in the summer every season left is stretched, from next season; amounts in $10K steps, the total unchanged
  {
    const l = stretchLeague('freeAgency');
    const p = signed(l, 10_010, 2, l.season + 1);
    const sched = stretchDeadMoney(l, releaseSchedule(l, p))!;
    expect(sched.map((d) => d.season)).toEqual([1, 2, 3, 4, 5].map((i) => l.season + i));
    expect(sum(sched)).toBe(20_020);
    expect(sched.slice(0, -1).every((d) => d.amount % 10 === 0 && d.amount === 4_000)).toBe(true);
    expect(sched[4].amount).toBe(4_020);
    expect(stretchPhrase(l, 5)).toBe('stretched over 5 seasons');
    // one season left in the summer: over three
    const q = signed(l, 9_000, 1, l.season + 1);
    expect(stretchDeadMoney(l, releaseSchedule(l, q))!.map((d) => d.amount)).toEqual([3_000, 3_000, 3_000]);
  }

  // nothing to stretch in season on a deal that ends this season, so the release is the usual one
  {
    const l = stretchLeague();
    const p = signed(l, 8_000, 1);
    expect(stretchDeadMoney(l, releaseSchedule(l, p))).toBeNull();
    expect(releaseSchedule(l, p, { stretch: true })).toEqual([{ season: l.season, amount: 8_000 }]);
  }

  // a buyout stretches what is left after he gives some back, and the log says so
  {
    const l = stretchLeague();
    const p = signed(l, 10_000, 3, l.season, 33);
    const terms = buyoutTerms(l, p)!;
    expect(terms.giveback).toBeGreaterThan(0);
    const plain = releaseSchedule(l, p, { giveback: terms.giveback });
    const res = userBuyout(l, p.pid, true);
    expect(res.reason).toMatch(/this season's as usual and the rest stretched over 5 seasons/);
    const dead = deadOf(l, p.pid);
    expect(sum(dead)).toBe(sum(plain));
    expect(dead).toHaveLength(6);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.waivers).toBeUndefined();
    const t = l.transactions!.at(-1)!;
    expect(t).toMatchObject({ kind: 'buyout', note: 'stretched', years: 5 });
    expect(txnText(l, txnLine(t, { tid: U }))).toMatch(/, the rest stretched over 5 seasons$/);
  }

  // a waiver claim takes over the contract and wipes the stretched dead money
  {
    const l = stretchLeague();
    const p = signed(l, 3_000, 3);
    p.ovr = p.pot = 78;
    // an AI team with room and a spot, first in the waiver order
    Object.assign(curTeamSeason(l, AI), { won: 2, lost: 18 });
    l.teams[AI].deadMoney = [];
    while (standardRoster(l, AI).length > 13) {
      const x = standardRoster(l, AI)[0];
      x.tid = FREE_AGENT;
    }
    for (const x of standardRoster(l, AI)) x.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    releasePlayer(l, p, { stretch: true });
    expect(deadOf(l, p.pid).length).toBe(6);
    const t = l.transactions!.at(-1)!;
    expect(t).toMatchObject({ kind: 'waive', note: 'stretched', years: 5, amount: 9_000 });
    expect(txnText(l, txnLine(t, { tid: U }))).toMatch(/ · \$9\.0M in dead money, stretched over 5 seasons$/);
    l.day += 2;
    resolveWaivers(l);
    expect(p.tid).toBe(AI);
    expect(deadOf(l, p.pid)).toEqual([]);
  }

  // the user's own claim works the same way on another team's stretched release
  {
    const l = stretchLeague();
    const p = standardRoster(l, AI)[0];
    p.ovr = p.pot = 60;
    p.injury = null;
    p.experience = 6;
    p.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin * 2, CAP_FOR(l).vetMin * 2] };
    releasePlayer(l, p, { stretch: true });
    expect(l.teams[AI].deadMoney.filter((d) => d.pid === p.pid && d.stretched)).toHaveLength(3);
    while (standardRoster(l, U).length > 14) standardRoster(l, U)[0].tid = FREE_AGENT;
    l.teams[U].deadMoney = [];
    for (const x of standardRoster(l, U)) x.contract = { start: l.season, salaries: [CAP_FOR(l).vetMin] };
    Object.assign(curTeamSeason(l, U), { won: 1, lost: 19 });
    expect(userClaim(l, p.pid).ok).toBe(true);
    l.day += 2;
    resolveWaivers(l);
    expect(p.tid).toBe(U);
    expect(l.teams[AI].deadMoney.filter((d) => d.pid === p.pid)).toEqual([]);
    // (a fresh signing for comparison: no stretch, nothing left behind)
    const fa = freeAgents(l)[0];
    signPlayer(l, fa, U, CAP_FOR(l).vetMin, 1, { news: false });
    expect(fa.contract.salaries).toEqual([CAP_FOR(l).vetMin]);
  }

  // open on January 5 and close with the regular season
  {
    const l = tenLeague();
    expect(tenDayClosedReason(l)).toBeNull();
    l.day = tenDayOpenDay(l) - 1;
    expect(tenDayClosedReason(l)).toMatch(/open on January 5/);
    l.day = l.regularSeasonDays + 1;
    expect(tenDayClosedReason(l)).toMatch(/end of the regular season/);
    l.phase = 'playoffs';
    expect(tenDayClosedReason(l)).toMatch(/from January 5/);
  }

  // pay his minimum prorated for ten days, booked when he signs, take a roster spot and end by themselves with no dead money
  {
    const l = tenLeague();
    rosterOf(l, U, 14);
    const p = minGuy(l);
    const pay = tenDayPay(l, p, TEN_DAYS);
    expect(pay).toBe(Math.round((CAP_FOR(l).vetMin * 10) / (l.regularSeasonDays + 1) / 10) * 10);
    const ts = curTeamSeason(l, U);
    const [exp0, cash0, pay0] = [ts.expenses, l.teams[U].cash, payroll(l, U)];
    expect(userTenDay(l, p.pid).reason).toMatch(/signs a 10-day contract: through/);
    expect(p.tid).toBe(U);
    expect(p.contract).toEqual({ start: l.season, salaries: [pay], tenDay: { until: l.day + TEN_DAYS } });
    expect(ts.expenses - exp0).toBe(pay);
    expect(cash0 - l.teams[U].cash).toBe(pay);
    expect(payroll(l, U) - pay0).toBe(pay);
    expect(tenDayLeft(l, p)).toBe(TEN_DAYS);
    expect(releaseDeadMoney(l, p)).toEqual([]);
    expect(untradeableReason(l, p)).toMatch(/signed recently/);
    // the per-game payroll leaves him out: he's paid already
    const before = ts.expenses;
    gameFinances(l, l.teams[U], false, false);
    const perGame = ts.expenses - before;
    p.contract.tenDay = undefined;
    const ts2 = curTeamSeason(l, U);
    const b2 = ts2.expenses;
    gameFinances(l, l.teams[U], false, false);
    expect(ts2.expenses - b2 - perGame).toBeCloseTo(pay / 82, 5);
    p.contract.tenDay = { until: l.day + TEN_DAYS };
    // the log
    const t = l.transactions!.at(-1)!;
    expect(t).toMatchObject({ kind: 'tenDay', amount: pay });
    expect(txnText(l, txnLine(t, { tid: U }))).toBe(`Signed ${p.firstName} ${p.lastName} to a 10-day contract · $${(pay / 1000).toFixed(1)}M`);
    // nine days on: his last day, and the inbox says so with the choices
    for (let i = 0; i < TEN_DAYS - 1; i++) {
      l.day++;
      tenDayDaily(l);
    }
    expect(tenDayLeft(l, p)).toBe(1);
    expect(l.inbox[0]).toMatchObject({ subject: `${p.firstName} ${p.lastName}'s 10-day contract ends tonight`, tenDay: p.pid });
    expect(l.inbox[0].body).toMatch(/Sign him to a second 10-day.* or for the rest of the season at .*Doing nothing lets him go/);
    l.day++;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(l.teams[U].deadMoney.filter((d) => d.pid === p.pid)).toEqual([]);
    expect(p.waivers).toBeUndefined();
    expect(l.transactions!.at(-1)).toMatchObject({ kind: 'tenDay', note: 'ended' });
  }

  // two with one team a season: a second extends the first, a third is refused
  {
    const l = tenLeague();
    rosterOf(l, U, 14);
    const p = minGuy(l);
    userTenDay(l, p.pid);
    const until = p.contract.tenDay!.until;
    const first = p.contract.salaries[0];
    l.day += 4;
    expect(userTenDay(l, p.pid).reason).toMatch(/signs a second 10-day contract/);
    expect(p.contract.tenDay!.until).toBe(until + TEN_DAYS);
    expect(p.contract.salaries[0]).toBe(first + tenDayPay(l, p, TEN_DAYS));
    expect(p.tenDays).toEqual({ season: l.season, by: { [U]: 2 } });
    expect(l.transactions!.at(-1)).toMatchObject({ kind: 'tenDay', note: 'second' });
    expect(tenDayBlockedReason(l, U, p)).toMatch(/had his two 10-days with you/);
    l.day = until + TEN_DAYS;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(tenDayBlockedReason(l, U, p)).toMatch(/had his two/);
    // another team can still give him one
    expect(tenDayBlockedReason(l, AI, p) ?? '').not.toMatch(/had his two/);
  }

  // counts each team's on their own: a 10-day with another team in between doesn't give a team a third
  {
    const l = tenLeague();
    rosterOf(l, U, 14);
    rosterOf(l, AI, 13);
    const p = minGuy(l);
    // the best free agent who'd take the minimum, so the AI team short of healthy players takes him
    // (a 79: an 80+ the summer left unsigned holds 55% of his value in season, see SUMMER_FLOOR)
    const atMin = () => {
      p.ovr = p.pot = 79;
      p.asking = { amount: CAP_FOR(l).vetMin, years: 1 };
    };
    expect(userTenDay(l, p.pid).ok).toBe(true);
    l.day = p.contract.tenDay!.until;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    atMin();
    out(standardRoster(l, AI)[0]);
    tenDayDaily(l);
    expect(p.tid).toBe(AI);
    expect([tenDaysWith(l, p, U), tenDaysWith(l, p, AI)]).toEqual([1, 1]);
    for (const x of standardRoster(l, AI)) x.injury = null;
    l.day = p.contract.tenDay!.until;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    // back with the user: his second there, and no third
    atMin();
    expect(userTenDay(l, p.pid).reason).toMatch(/signs a second 10-day contract/);
    expect(p.tenDays).toEqual({ season: l.season, by: { [U]: 2, [AI]: 1 } });
    l.day = p.contract.tenDay!.until;
    tenDayDaily(l);
    atMin();
    expect(tenDayBlockedReason(l, U, p)).toMatch(/had his two 10-days with you/);
    expect(tenDayBlockedReason(l, AI, p) ?? '').not.toMatch(/had his two/);
  }

  // end with the regular season, prorated for the days left
  {
    const l = tenLeague();
    rosterOf(l, U, 14);
    l.day = l.regularSeasonDays - 3;
    const p = minGuy(l);
    userTenDay(l, p.pid);
    expect(p.contract.tenDay!.until).toBe(l.regularSeasonDays + 1);
    expect(p.contract.salaries[0]).toBe(tenDayPay(l, p, 4));
    expect(tenDayBlockedReason(l, U, p)).toMatch(/already runs to the end of the regular season/);
  }

  // sign him for the rest of the season at his minimum, or let him go while the roster stays at 13
  {
    const l = tenLeague();
    rosterOf(l, U, 13);
    const p = minGuy(l);
    const q = minGuy(l, 1);
    userTenDay(l, p.pid);
    userTenDay(l, q.pid);
    expect(userTenDayRest(l, p.pid).ok).toBe(true);
    expect(p.contract).toEqual({ start: l.season, salaries: [CAP_FOR(l).vetMin] });
    expect(l.transactions!.at(-1)).toMatchObject({ kind: 'sign', amount: CAP_FOR(l).vetMin, years: 1 });
    expect(userEndTenDay(l, q.pid).ok).toBe(true);
    expect(q.tid).toBe(FREE_AGENT);
    // at 13 he can't go
    const r = minGuy(l, 2);
    for (const x of standardRoster(l, U).slice(0, 2)) x.tid = FREE_AGENT;
    userTenDay(l, r.pid);
    expect(standardRoster(l, U).length).toBe(CAP.rosterMin);
    expect(tenDayEndBlockedReason(l, r)).toMatch(/at least 13/);
  }

  // a 10-day ending that leaves a team under 13 has it sign the best free agent left for the rest of the season
  {
    const l = tenLeague();
    rosterOf(l, U, 12);
    const p = minGuy(l);
    userTenDay(l, p.pid);
    l.day = p.contract.tenDay!.until;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(standardRoster(l, U).length).toBe(CAP.rosterMin);
    expect(l.inbox[0].subject).toMatch(/signed to fill the roster/);
    expect(standardRoster(l, U).every((x) => !x.contract.tenDay)).toBe(true);
  }

  // with four or more players out (3+ games each) a team can sign 10-days beyond 15, one per player out past three
  {
    const l = tenLeague();
    rosterOf(l, U, 15);
    const a = minGuy(l, 0);
    const b = minGuy(l, 1);
    expect(tenDaySpot(l, U)).toBeNull();
    expect(tenDayBlockedReason(l, U, a)).toMatch(/Hardship spots past 15 open with 4 players out 3\+ games/);
    const roster = standardRoster(l, U);
    for (const p of roster.slice(0, HARDSHIP_OUT)) out(p);
    // two games to go doesn't count
    out(roster[HARDSHIP_OUT], 2);
    expect(hardship(l, U)).toEqual({ out: 4, spots: 1, used: 0 });
    expect(userTenDay(l, a.pid).reason).toMatch(/\(hardship\)/);
    expect(a.contract.tenDay!.hardship).toBe(true);
    expect(standardRoster(l, U).length).toBe(16);
    expect(tenDayBlockedReason(l, U, b)).toMatch(/allows 1 beyond 15 with 4 players out/);
    expect(l.transactions!.at(-1)).toMatchObject({ kind: 'tenDay', note: 'hardship' });
    // healthy again: no second hardship 10-day, nor a regular deal without a regular spot
    for (const p of roster) p.injury = null;
    expect(tenDayBlockedReason(l, U, a)).toMatch(/No roster spot/);
    l.day = a.contract.tenDay!.until;
    tenDayDaily(l);
    expect(a.tid).toBe(FREE_AGENT);
    expect(standardRoster(l, U).length).toBe(15);
  }

  // AI teams short of 13 healthy players sign 10-days, beyond 15 only as hardship allows
  {
    const l = tenLeague();
    rosterOf(l, AI, 15);
    const roster = standardRoster(l, AI);
    for (const p of roster.slice(0, 5)) out(p, 20);
    tenDayDaily(l);
    // 10 healthy, five out: two hardship spots, so 12 healthy
    const tens = standardRoster(l, AI).filter((p) => p.contract.tenDay);
    expect(tens).toHaveLength(2);
    expect(tens.every((p) => p.contract.tenDay!.hardship)).toBe(true);
    // AI 10-days are roster filler: not in the log
    expect((l.transactions ?? []).some((t) => t.kind === 'tenDay' && t.tids.includes(AI))).toBe(false);
    // healthy again, the 10-days run out and the roster is back to 15
    for (const p of roster) p.injury = null;
    l.day = tens[0].contract.tenDay!.until;
    tenDayDaily(l);
    expect(standardRoster(l, AI)).toHaveLength(15);
  }
}, 120_000);
