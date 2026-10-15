// Negotiating with a player's agent (negotiation.ts): his ask is open and signs him on the spot,
// a hidden walk-away price a little under it signs him too, below it he counters and his patience
// drops (twice as fast for a lowball, which also costs some of his interest), and out of patience
// talks break down by the period (a few free-agency days, the rest of the summer after lowballs, a
// week in season, a firm ask in the re-sign period, 30 days for an extension). Options move his
// price; AI teams never negotiate and their prices never move.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, contractSeason, freeAgents, standardRoster, teamPlayers, teamSeason } from '../league/helpers';
import { askingContract, extensionAsk, marketSalary, signPlayer, teamAppeal, valueScore } from '../league/contracts';
import { userOffer, userResign } from '../league/freeAgency';
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
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(phase: League['phase'] = 'regular', rngSeed = 7): League {
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

/** A free agent of known value: OVR = POT, 27, healthy, content, asking his market price. */
function freeAgent(l: League, ovr = 74, age = 27, i = 0): Player {
  const p = freeAgents(l).filter((x) => !x.rfa)[i];
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.experience = 5;
  p.injury = null;
  p.mood.tradeRequest = false;
  p.mood.score = 0;
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
  p.mood.tradeRequest = false;
  p.mood.score = 0;
  p.contract = { start: l.season - 1, salaries: [8_000, 8_000] };
  return p;
}

const round50 = (x: number) => Math.round(x / 50) * 50;

describe('his ask and his walk-away price', () => {
  it('his ask on his terms signs him on the spot; a little under it (at his walk-away price) too', () => {
    const l = league();
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
  });

  it('is the same however often you ask, differs from player to player, and stays within 0-12% of the ask', () => {
    const l = league();
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
  });

  it('a player keen on the team, older, or later in the summer gives more; a money-first star less', () => {
    const l = league('freeAgency');
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
  });

  it('a player option takes 4% off his price and a team option adds 6%; each year away from his length 3%', () => {
    const ask = { amount: 10_000, years: 3 };
    expect(termsFactor(ask, 3)).toBe(1);
    expect(termsFactor(ask, 3, 'player')).toBeCloseTo(0.96);
    expect(termsFactor(ask, 3, 'team')).toBeCloseTo(1.06);
    expect(termsFactor(ask, 5)).toBeCloseTo(1.06);
    const l = league();
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
  });
});

describe('counters and patience', () => {
  it('below his walk-away price he counters on the length he wants, between the offer and his ask, and his counter signs him', () => {
    const l = league();
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
  });

  it('a lowball costs two patience and a little interest: his ask from you goes up, AI teams see no change', () => {
    const l = league();
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
  });

  it("out of patience in season, he won't take your calls for a week", () => {
    const l = league();
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
  });

  it('in free agency, a few days off; after two lowballs, the rest of the summer', () => {
    const l = league('freeAgency');
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
  });

  it('in the re-sign period his ask goes up and he takes nothing less for the rest of it', () => {
    const l = league('resign');
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
  });

  it("a player who wants a trade still won't re-sign", () => {
    const l = league('resign');
    const p = expiring(l);
    p.mood.tradeRequest = true;
    const ask = talkAsk(l, p, 'resign');
    expect(userResign(l, p.pid, ask.amount * 2, ask.years).reason).toMatch(/wants out and won't re-sign/);
  });

  it('extensions: the same talks on his extension ask, and 30 days off when they break down', () => {
    const l = league('regular');
    const p = standardRoster(l, U)[1];
    p.ovr = p.pot = 76;
    p.bornYear = l.season - 27;
    p.experience = 5;
    p.mood.score = 0;
    p.mood.tradeRequest = false;
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
  });

  it('a new period starts talks over, and signing anywhere ends them', () => {
    const l = league('resign');
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
  });

  it('AI teams sign at the ask: nothing in their signings reads the talks', () => {
    const l = league();
    const p = freeAgent(l);
    const before = askingContract(l, p, AI);
    userOffer(l, p.pid, round50(talkAsk(l, p, 'fa').amount * 0.6), 2);
    expect(askingContract(l, p, AI)).toEqual(before);
    expect(teamPlayers(l, AI).every((x) => !x.talks)).toBe(true);
  });
});
