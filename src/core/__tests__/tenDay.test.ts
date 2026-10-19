// 10-day contracts and the hardship exception: the window (January 5 to the end of the regular
// season), the prorated pay booked when he signs, the contract ending by itself with no dead money,
// two at most with one team, a deal for the rest of the season, the inbox's notice, hardship spots
// beyond 15 with four players out, and AI teams signing them when short of 13 healthy players.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { CAP_FOR, curTeamSeason, freeAgents, payroll, standardRoster } from '../league/helpers';
import { askingContract, releaseDeadMoney, signPlayer } from '../league/contracts';
import { gameFinances } from '../league/finances';
import { untradeableReason } from '../league/trades';
import { txnLine, txnText } from '../league/transactions';
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
import { CAP } from '../constants';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const AI = 1;

function league(): League {
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

describe('10-day contracts', () => {
  it('open on January 5 and close with the regular season', () => {
    const l = league();
    expect(tenDayClosedReason(l)).toBeNull();
    l.day = tenDayOpenDay(l) - 1;
    expect(tenDayClosedReason(l)).toMatch(/open on January 5/);
    l.day = l.regularSeasonDays + 1;
    expect(tenDayClosedReason(l)).toMatch(/end of the regular season/);
    l.phase = 'playoffs';
    expect(tenDayClosedReason(l)).toMatch(/from January 5/);
  });

  it('pay his minimum prorated for ten days, booked when he signs, take a roster spot and end by themselves with no dead money', () => {
    const l = league();
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
    expect(txnText(l, txnLine(t, { tid: U }))).toBe(`Signed ${p.firstName} ${p.lastName} to a 10-day contract ($${(pay / 1000).toFixed(1)}M)`);
    // nine days on: his last day, and the inbox says so with the choices
    for (let i = 0; i < TEN_DAYS - 1; i++) {
      l.day++;
      tenDayDaily(l);
    }
    expect(tenDayLeft(l, p)).toBe(1);
    expect(l.inbox[0]).toMatchObject({ subject: `${p.firstName} ${p.lastName}'s 10-day contract ends tonight`, tenDay: p.pid });
    expect(l.inbox[0].body).toMatch(/Sign him to a second 10-day .* for the rest of the season at his minimum .* or let him go/);
    l.day++;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(l.teams[U].deadMoney.filter((d) => d.pid === p.pid)).toEqual([]);
    expect(p.waivers).toBeUndefined();
    expect(l.transactions!.at(-1)).toMatchObject({ kind: 'tenDay', note: 'ended' });
  });

  it('two with one team a season: a second extends the first, a third is refused', () => {
    const l = league();
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
    expect(tenDayBlockedReason(l, U, p)).toMatch(/had his two 10-day contracts with you/);
    l.day = until + TEN_DAYS;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(tenDayBlockedReason(l, U, p)).toMatch(/had his two/);
    // another team can still give him one
    expect(tenDayBlockedReason(l, AI, p) ?? '').not.toMatch(/had his two/);
  });

  it("counts each team's on their own: a 10-day with another team in between doesn't give a team a third", () => {
    const l = league();
    rosterOf(l, U, 14);
    rosterOf(l, AI, 13);
    const p = minGuy(l);
    // the best free agent who'd take the minimum, so the AI team short of healthy players takes him
    const atMin = () => {
      p.ovr = p.pot = 80;
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
    expect(tenDayBlockedReason(l, U, p)).toMatch(/had his two 10-day contracts with you/);
    expect(tenDayBlockedReason(l, AI, p) ?? '').not.toMatch(/had his two/);
  });

  it('end with the regular season, prorated for the days left', () => {
    const l = league();
    rosterOf(l, U, 14);
    l.day = l.regularSeasonDays - 3;
    const p = minGuy(l);
    userTenDay(l, p.pid);
    expect(p.contract.tenDay!.until).toBe(l.regularSeasonDays + 1);
    expect(p.contract.salaries[0]).toBe(tenDayPay(l, p, 4));
    expect(tenDayBlockedReason(l, U, p)).toMatch(/already runs to the end of the regular season/);
  });

  it('sign him for the rest of the season at his minimum, or let him go while the roster stays at 13', () => {
    const l = league();
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
  });

  it('a 10-day ending that leaves a team under 13 has it sign the best free agent left for the rest of the season', () => {
    const l = league();
    rosterOf(l, U, 12);
    const p = minGuy(l);
    userTenDay(l, p.pid);
    l.day = p.contract.tenDay!.until;
    tenDayDaily(l);
    expect(p.tid).toBe(FREE_AGENT);
    expect(standardRoster(l, U).length).toBe(CAP.rosterMin);
    expect(l.inbox[0].subject).toMatch(/signed to fill the roster/);
    expect(standardRoster(l, U).every((x) => !x.contract.tenDay)).toBe(true);
  });
});

describe('the hardship exception', () => {
  it('with four or more players out (3+ games each) a team can sign 10-days beyond 15, one per player out past three', () => {
    const l = league();
    rosterOf(l, U, 15);
    const a = minGuy(l, 0);
    const b = minGuy(l, 1);
    expect(tenDaySpot(l, U)).toBeNull();
    expect(tenDayBlockedReason(l, U, a)).toMatch(/hardship exception opens spots beyond 15 from 4 players out/);
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
  });

  it('AI teams short of 13 healthy players sign 10-days, beyond 15 only as hardship allows', () => {
    const l = league();
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
  });
});
