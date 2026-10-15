// The signing exceptions: the mid-level (8.5% of the cap, 4 years, under the tax), the room
// exception that replaces it once a team has used cap space (5.7%, 2 years) and the bi-annual
// (3.3%, 2 years, under the tax, not two seasons running, not after the room exception). Signings
// look for the smallest exception that covers them; AI teams use them too; offer sheets reserve
// them; the user's pending offers hold them; the mid-level and the bi-annual cap trades at the tax.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, contractSeason, freeAgents, payroll, standardRoster } from '../league/helpers';
import {
  BAE_PCT,
  EXCEPTIONS,
  MLE_PCT,
  ROOM_PCT,
  aiRoute,
  exceptionAmount,
  exceptionRoom,
  exceptionUsedReason,
  mleRoom,
  routeYears,
  signingRoute,
  taxCapped,
  spendRoute,
} from '../league/contracts';
import { offerBlockedReason, offerRoute, userExceptionRoom, userOffer } from '../league/freeAgency';
import { signOfferSheet, resolveOfferSheets } from '../league/rfa';
import { validateTrade } from '../league/trades';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;
const R = 2;

function league(phase: League['phase'] = 'freeAgency'): League {
  const l = createLeague({ name: 'exc', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  l.id = 'exc_9';
  l.phase = phase;
  l.faDay = 1;
  return l;
}

/** Set a team's payroll for the contract season to exactly `amount` (dead money makes up the rest). */
function payTo(l: League, tid: number, amount: number) {
  const s = contractSeason(l);
  l.teams[tid].deadMoney = [];
  const now = payroll(l, tid, s);
  l.teams[tid].deadMoney.push({ pid: -1, name: 'x', season: s, amount: amount - now });
  expect(payroll(l, tid, s)).toBe(amount);
}

function freeAgent(l: League, ovr = 70, i = 0): Player {
  const p = freeAgents(l).filter((x) => !x.rfa)[i];
  p.ovr = p.pot = ovr;
  p.bornYear = l.season - 27;
  p.experience = 5;
  p.injury = null;
  return p;
}

describe('the room exception', () => {
  it('replaces the mid-level once a team has signed a free agent with cap space: 5.7% of the cap, two years, once', () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    payTo(l, U, cap.salaryCap - 5_000);
    const p = freeAgent(l);
    expect(exceptionAmount(l, 'room', s)).toBe(Math.round((cap.salaryCap * ROOM_PCT) / 10) * 10);
    expect(exceptionRoom(l, U, 'room', s)).toBe(0);
    expect(exceptionUsedReason(l, U, 'room', s)).toMatch(/Only after signing a free agent with cap space/);
    expect(mleRoom(l, U, s)).toBe(Math.round((cap.salaryCap * MLE_PCT) / 10) * 10);
    expect(signingRoute(l, U, 4_000, s, p)).toBe('space');
    spendRoute(l, U, 'space', s);
    expect(l.teams[U].spaceSeason).toBe(s);
    expect(mleRoom(l, U, s)).toBe(0);
    expect(exceptionUsedReason(l, U, 'mle', s)).toMatch(/room exception replaces it/);
    expect(exceptionRoom(l, U, 'room', s)).toBe(exceptionAmount(l, 'room', s));
    // beyond the space left: the room exception, for two years at most
    const amount = exceptionAmount(l, 'bae', s) + 500;
    expect(signingRoute(l, U, amount, s, p, 2)).toBe('room');
    expect(signingRoute(l, U, amount, s, p, 3)).toBeNull();
    spendRoute(l, U, 'room', s);
    expect(exceptionRoom(l, U, 'room', s)).toBe(0);
    // and no bi-annual after it that season
    expect(exceptionUsedReason(l, U, 'bae', s)).toMatch(/Not after the room exception/);
    expect(signingRoute(l, U, amount, s, p, 2)).toBeNull();
  });

  it('a team that used the mid-level first gets no room exception', () => {
    const l = league();
    const s = contractSeason(l);
    spendRoute(l, U, 'mle', s);
    spendRoute(l, U, 'space', s);
    expect(exceptionUsedReason(l, U, 'room', s)).toMatch(/one or the other/);
  });
});

describe('the bi-annual exception', () => {
  it('3.3% of the cap for two years, under the tax after signing, the smallest exception first', () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    payTo(l, U, cap.salaryCap + 1_000);
    const p = freeAgent(l);
    const bae = Math.round((cap.salaryCap * BAE_PCT) / 10) * 10;
    expect(exceptionRoom(l, U, 'bae', s)).toBe(bae);
    expect(EXCEPTIONS.bae.years).toBe(2);
    // a cheap signing doesn't use up the mid-level; a longer or bigger one does
    expect(signingRoute(l, U, bae, s, p)).toBe('bae');
    expect(signingRoute(l, U, bae, s, p, 3)).toBe('mle');
    expect(signingRoute(l, U, bae + 10, s, p)).toBe('mle');
    expect(signingRoute(l, U, bae, s, p, 2, 'mle')).toBe('mle');
    // the tax line
    payTo(l, U, cap.luxuryTax - 2_000);
    expect(exceptionRoom(l, U, 'bae', s)).toBe(2_000);
    expect(mleRoom(l, U, s)).toBe(2_000);
  });

  it('not two seasons running, and it caps trades at the tax like the mid-level', () => {
    const l = league('regular');
    const s = l.season;
    spendRoute(l, U, 'bae', s);
    expect(exceptionUsedReason(l, U, 'bae', s)).toBe('Used this season.');
    expect(exceptionUsedReason(l, U, 'bae', s + 1)).toMatch(/not two seasons running/);
    expect(exceptionUsedReason(l, U, 'bae', s + 2)).toBeNull();
    expect(taxCapped(l.teams[U], s)).toBe(true);
    // a trade that takes the payroll past the tax line is refused
    const cap = CAP_FOR(l, s);
    payTo(l, U, cap.luxuryTax - 1_000);
    const big = standardRoster(l, AI).sort((a, b) => b.contract.salaries[0] - a.contract.salaries[0])[0];
    big.contract = { start: s, salaries: [20_000, 20_000] };
    big.tradeLock = undefined;
    const errs = validateTrade(l, { a: { tid: U, pids: [], dpids: [] }, b: { tid: AI, pids: [big.pid], dpids: [] } });
    expect(errs.some((e) => /used the bi-annual exception this season, so a trade can't take its payroll past the tax line/.test(e))).toBe(true);
  });
});

describe('exceptions in the market', () => {
  it('AI teams take the exception that allows the length a player wants, cut to the longest otherwise', () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    payTo(l, AI, cap.salaryCap + 1_000);
    const p = freeAgent(l);
    const bae = exceptionAmount(l, 'bae', s);
    expect(aiRoute(l, AI, bae, s, p, 2)).toBe('bae');
    expect(aiRoute(l, AI, bae, s, p, 3)).toBe('mle');
    expect(aiRoute(l, AI, bae, s, p, 5)).toBe('mle');
    expect(routeYears('mle')).toBe(4);
    spendRoute(l, AI, 'mle', s);
    expect(aiRoute(l, AI, bae, s, p, 4)).toBe('bae');
  });

  it("an offer sheet on an exception reserves it, and gets it back when it's matched", () => {
    const l = league();
    const s = contractSeason(l);
    payTo(l, U, CAP_FOR(l, s).salaryCap + 1_000);
    const p = freeAgent(l, 74);
    p.bornYear = l.season - 23;
    p.rfa = { tid: R, qo: 3_000, hold: 3_000 };
    // a young player on a cheap sheet: his team matches
    signOfferSheet(l, p, U, 3_000, 2, 'bae', l.faDay);
    expect(l.teams[U].baeSeason).toBe(s);
    expect(exceptionRoom(l, U, 'bae', s)).toBe(0);
    resolveOfferSheets(l);
    expect(p.tid).toBe(R);
    expect(l.teams[U].baeSeason).toBeUndefined();
  });

  it("a pending offer leans on its exception, and cap space can't be used while one needs the mid-level", () => {
    const l = league();
    const s = contractSeason(l);
    const cap = CAP_FOR(l, s);
    payTo(l, U, cap.salaryCap - 20_000);
    const star = freeAgent(l, 80, 0);
    const role = freeAgent(l, 66, 1);
    l.faBids = [{ pid: star.pid, amount: 12_000, years: 3, day: 0, decideDay: 2, route: 'mle' }];
    expect(userExceptionRoom(l, 'mle', s, role.pid)).toBe(0);
    expect(userExceptionRoom(l, 'bae', s, role.pid)).toBe(exceptionAmount(l, 'bae', s));
    expect(offerRoute(l, role, 4_000, s)).toBeNull();
    expect(offerBlockedReason(l, role, 4_000, 2)).toMatch(/cost you the mid-level exception .* pending mid-level offer to/);
    l.faBids = [];
    expect(offerRoute(l, role, 4_000, s)).toBe('space');
  });

  it('a user signing on the bi-annual records it and says so', () => {
    const l = league('regular');
    const s = l.season;
    while (standardRoster(l, U).length > 13) standardRoster(l, U)[0].tid = FREE_AGENT;
    payTo(l, U, CAP_FOR(l, s).salaryCap + 1_000);
    const p = freeAgent(l, 66);
    p.asking = { amount: 4_000, years: 2 };
    const ask = { amount: 4_000, years: 2 };
    const res = userOffer(l, p.pid, ask.amount + 1_000, 2);
    expect(res.ok).toBe(true);
    expect(l.teams[U].baeSeason).toBe(s);
    expect(l.teams[U].mleSeason).toBeUndefined();
    expect(l.inbox[0].body).toMatch(/using our bi-annual exception/);
  });
});
