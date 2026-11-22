// Contracts with the user's own players and the ones he lets go. Negotiating with an agent: his ask
// signs him on the spot, a hidden walk-away price a little under it too, below it he counters and
// his patience drops, and out of patience talks break down by the period; AI teams never negotiate.
// Extensions: who and when, what he asks, how one shows on the books and the season it takes over.
// Releases and buyouts: a free agent at once, the dead money on the books, what a veteran gives
// back. Fictional leagues with hand-shaped players keep these fast: each scenario builds its own.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { newSeason, startRegularSeason } from '../league/season';
import { CAP_FOR, age, contractSeason, curTeamSeason, freeAgents, payroll, revenueScale, standardRoster, teamPlayers, teamSeason } from '../league/helpers';
import {
  DEC_15,
  FIRED_REASON,
  aiBuyouts,
  askingContract,
  buyoutTerms,
  decideTeamOption,
  extensionAsk,
  extensionBlockedReason,
  extensionRefusal,
  injuryShare,
  marketSalary,
  roleMpg,
  releaseDeadMoney,
  releasePlayer,
  rookieContract,
  signPlayer,
  teamAppeal,
  contractBurden,
  tradeValue,
  userBuyout,
  valueScore,
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
  talkSalaries,
} from '../league/negotiation';
import { aiExtensions, expiringPlayers, releaseExpiring, userOffer, userResign } from '../league/freeAgency';
import { executeTrade, validateTrade } from '../league/trades';
import { takeOverTeam } from '../league/owner';
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
  const p = freeAgents(l)[i];
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
  for (const t of l.teams) Object.assign(curTeamSeason(l, t.tid), { won: 10, lost: 10 });
  return l;
}

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

/** Bring a team to `n` standard players: preseason cuts, or free agents on minimum deals. */
function cutTo(l: League, tid: number, n: number) {
  const phase = l.phase;
  l.phase = 'preseason';
  while (standardRoster(l, tid).length > n) releasePlayer(l, standardRoster(l, tid)[0], { news: false });
  l.phase = phase;
  while (standardRoster(l, tid).length < n) signPlayer(l, freeAgents(l)[0], tid, CAP_FOR(l).vetMin, 1, { news: false });
}

const deadFor = (l: League, tid: number, pid: number) => l.teams[tid].deadMoney.filter((d) => d.pid === pid).reduce((a, d) => a + d.amount, 0);
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

  // his counter's total as the sheet shows it (talkSalaries) is the deal signed: re-signing on Bird
  // rights writes 8% raises, not the 5% a plain total would (a 5-year counter showed $72.1M, signed $76.55M)
  {
    const l = talksLeague('resign');
    const p = expiring(l);
    // (full Bird rights: three seasons with the team)
    p.birdSince = l.season - 3;
    const ask = talkAsk(l, p, 'resign');
    const r = userResign(l, p.pid, round50(ask.amount * 0.86), ask.years);
    const c = r.counter!;
    expect(c).toBeDefined();
    const shown = talkSalaries(l, p, 'resign', c.amount, c.years);
    // (Bird rights: 8% raises in what the sheet shows)
    if (c.years > 1) expect(shown[1]).toBeGreaterThan(shown[0] * 1.07);
    expect(userResign(l, p.pid, c.amount, c.years).ok).toBe(true);
    expect(p.contract.salaries).toEqual(shown);
    // an extension's preview is its signed salaries too
    const e = extLeague();
    e.phase = 'regular';
    const q = finalYear(e, standardRoster(e, U)[0], 78, 27);
    const amt = agreed(e, q, 3);
    const preview = talkSalaries(e, q, 'extend', amt, 3);
    expect(userExtend(e, q.pid, amt, 3).ok).toBe(true);
    expect(q.contract.next!.salaries).toEqual(preview);
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
    // not someone else's player, not for a fired coach
    expect(extensionBlockedReason(l, finalYear(l, standardRoster(l, AI)[0], 78, 27))).toMatch(/your own players/);
    l.fired = true;
    expect(extensionBlockedReason(l, p)).toBe(FIRED_REASON);
    l.fired = false;
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
    expect(l.news.at(-1)?.text).toMatch(/extension with [A-Z]/);
    // released, he leaves this season's salary and the extension's on the books
    expect(releaseDeadMoney(l, p).map((d) => d.season)).toEqual([0, 1, 2, 3].map((i) => l.season + i));
    // after the season he isn't up for re-signing
    l.phase = 'resign';
    expect(expiringPlayers(l, U).map((x) => x.pid)).not.toContain(p.pid);
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

  // a player whose deal ran out, signed elsewhere, can be traded back to the team that traded him away
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

it('releases and buyouts: a free agent at once, the dead money on the books, what a veteran gives back', () => {
  // a release in season: a free agent at once, what he's owed left on the books season by season, and any other team can sign him that day
  {
    const l = waiversLeague();
    const p = shape(l, standardRoster(l, U)[0], 70, 26, 10_000, 2);
    releasePlayer(l, p);
    expect(p.tid).toBe(FREE_AGENT);
    expect(p.asking?.amount).toBeGreaterThan(0);
    expect(l.teams[U].deadMoney.filter((d) => d.pid === p.pid).map((d) => d.season)).toEqual([l.season, l.season + 1]);
    const dead = deadFor(l, U, p.pid);
    expect(dead).toBeGreaterThan(10_000);
    expect(l.transactions?.some((t) => t.kind === 'release' && t.pid === p.pid)).toBe(true);
    cutTo(l, AI, 14);
    signPlayer(l, p, AI, CAP_FOR(l).vetMin, 1, { news: false });
    expect(p.tid).toBe(AI);
    expect(deadFor(l, U, p.pid)).toBe(dead);
  }

  // a preseason cut of a minimum camp deal leaves no dead money; a guaranteed deal does
  {
    const l = waiversLeague();
    l.phase = 'preseason';
    const p = shape(l, standardRoster(l, U)[0], 70, 26, 10_000, 2);
    const camp = shape(l, standardRoster(l, U)[1], 66, 26, CAP_FOR(l).vetMin, 1);
    releasePlayer(l, p);
    releasePlayer(l, camp);
    expect(deadFor(l, U, p.pid)).toBe(20_000);
    expect(deadFor(l, U, camp.pid)).toBe(0);
    expect(freeAgents(l).some((x) => x.pid === p.pid)).toBe(true);
  }

  // taking over another team leaves the old team's free-agent offers behind
  {
    const l = waiversLeague();
    const p = freeAgents(l)[0];
    l.faBids = [{ pid: p.pid, amount: 1, years: 1, day: 0, decideDay: 1, route: 'space' }];
    takeOverTeam(l, 7);
    expect(l.faBids).toBeUndefined();
  }

  // a buyout cuts the dead money by what he gives back
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
  }
}, 120_000);
