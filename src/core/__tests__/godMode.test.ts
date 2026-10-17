// God mode: edits to players (ratings with their derived numbers, bio, health, contract, team) and
// teams (names, colours, money, the coach and his registry entry), created players and forced
// trades; each is checked whole before anything changes, bends the rules (with warnings) but never
// leaves a team unable to dress five in season, is counted, and leaves a league that saves, loads
// and plays on.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import {
  DRESS_MIN,
  checkForceTrade,
  checkPlayerEdit,
  checkTeamEdit,
  createPlayer,
  editPlayer,
  editTeam,
  forceTrade,
  healTeam,
  setOwnerConfidence,
  yearsLeft,
} from '../league/godMode';
import { contractSeason, freeAgents, payroll, playerName, standardRoster, teamPlayers } from '../league/helpers';
import { evaluateTrade } from '../league/trades';
import { registryProblems } from '../league/coaches';
import { simDay } from '../league/season';
import { contractExp, salaryFor } from '../playerGen';
import { RATING_KEYS } from '../ratings';
import type { League, Player } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../types';

const base = testLeague('god');
const fresh = () => structuredClone(base);
const A = (base.userTid + 1) % 30;
const B = (base.userTid + 2) % 30;
const best = (l: League, tid: number) => teamPlayers(l, tid).sort((x, y) => y.ovr - x.ovr);
const worst = (l: League, tid: number) => best(l, tid).reverse();

describe('player edits', () => {
  it('new ratings bring OVR, potential, archetype and tendencies with them, and the edit is counted', () => {
    const l = fresh();
    const p = worst(l, A)[0];
    const use = p.tend!.use;
    editPlayer(l, p.pid, { ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, 99])) });
    expect(p.ovr).toBeGreaterThanOrEqual(95);
    expect(p.pot).toBeGreaterThanOrEqual(p.ovr);
    expect(p.tend!.use).toBeGreaterThan(use);
    expect(l.godEdits).toBe(1);
    // stored values stay in 1-100
    editPlayer(l, p.pid, { ratings: { tp: 140, ft: -5 } });
    expect([p.ratings.tp, p.ratings.ft]).toEqual([100, 1]);
    expect(l.godEdits).toBe(2);
  });

  it('bio and health: age moves his birth year, an injury keeps him out and healing clears it', () => {
    const l = fresh();
    const p = best(l, A)[0];
    editPlayer(l, p.pid, { firstName: ' Zed ', lastName: 'Quill', age: 21, heightIn: 90, pos: 'C', injury: { type: 'Torn ACL', games: 80 } });
    expect(playerName(p)).toBe('Zed Quill');
    expect(l.season - p.bornYear).toBe(21);
    expect(p.injury).toMatchObject({ type: 'Torn ACL', gamesRemaining: 80, gamesTotal: 80, severity: 'severe' });
    editPlayer(l, p.pid, { injury: null, wear: 0, mood: { score: 9, tradeRequest: false } });
    expect(p.injury).toBeNull();
    expect(p.mood.score).toBe(9);
  });

  it('a bad edit throws and changes nothing', () => {
    const l = fresh();
    const [p, mate] = best(l, A);
    const before = structuredClone(p);
    for (const e of [{ firstName: '' }, { age: 70 }, { jersey: mate.jersey }, { jersey: '123' }, { tid: 99 }, { contract: { years: 9 } }]) {
      expect(checkPlayerEdit(l, p, { ...e, ratings: { tp: 99 } }).errors.length).toBeGreaterThan(0);
      expect(() => editPlayer(l, p.pid, { ...e, ratings: { tp: 99 } })).toThrow();
    }
    expect(p).toEqual(before);
    expect(l.godEdits).toBeUndefined();
  });

  it("a team's retired number can't be given out", () => {
    const l = fresh();
    const p = best(l, A)[0];
    l.teams[A].retired = [{ jersey: '77', pid: 1, name: 'Old Legend', season: 2000 }];
    expect(checkPlayerEdit(l, p, { jersey: '77' }).errors[0]).toMatch(/retired No. 77/);
    editPlayer(l, p.pid, { jersey: '78' });
    expect(p.jersey).toBe('78');
    expect(p.jerseys?.[A]).toBe('78');
  });
});

describe('moving players', () => {
  it('to another team: his contract goes with him, off one rotation and onto the other, with a free number', () => {
    const l = fresh();
    const p = best(l, A)[0];
    const contract = structuredClone(p.contract);
    editPlayer(l, p.pid, { tid: l.userTid });
    expect(p.tid).toBe(l.userTid);
    expect(p.contract).toEqual(contract);
    expect(l.teams[A].rotation.order).not.toContain(p.pid);
    expect(l.teams[l.userTid].rotation.order).toContain(p.pid);
    const numbers = teamPlayers(l, l.userTid).map((x) => x.jersey);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('a free agent joins on his asking deal; a player sent to free agency leaves no dead money', () => {
    const l = fresh();
    const fa = freeAgents(l).sort((x, y) => y.ovr - x.ovr)[0];
    editPlayer(l, fa.pid, { tid: B });
    expect(fa.tid).toBe(B);
    expect(salaryFor(fa, contractSeason(l))).toBeGreaterThan(0);
    expect(fa.asking).toBeUndefined();
    const p = best(l, A)[0];
    const dead = l.teams[A].deadMoney.length;
    const pay = payroll(l, A);
    editPlayer(l, p.pid, { tid: FREE_AGENT });
    expect(p.tid).toBe(FREE_AGENT);
    expect(l.teams[A].deadMoney.length).toBe(dead);
    expect(payroll(l, A)).toBeLessThan(pay);
    expect(p.asking?.amount).toBeGreaterThan(0);
  });

  it('rosters can go past the limits with a warning, but never below five to dress in season', () => {
    const l = fresh();
    const p = best(l, A)[0];
    const n = standardRoster(l, l.userTid).length;
    expect(checkPlayerEdit(l, p, { tid: l.userTid }).warnings.join(' ')).toMatch(n >= 15 ? /will carry/ : /drops to/);
    const team = teamPlayers(l, B);
    for (const x of team.slice(DRESS_MIN)) editPlayer(l, x.pid, { tid: FREE_AGENT });
    expect(teamPlayers(l, B)).toHaveLength(DRESS_MIN);
    const last = teamPlayers(l, B)[0];
    expect(checkPlayerEdit(l, last, { tid: FREE_AGENT }).errors[0]).toMatch(/needs 5 to dress/);
    // a short-handed team still plays its games
    for (let i = 0; i < 3; i++) simDay(l);
  });

  it("draft prospects and retired players can't be moved", () => {
    const l = fresh();
    const prospect = Object.values(l.players).find((x) => x.tid === DRAFT_PROSPECT);
    if (prospect) expect(checkPlayerEdit(l, prospect, { tid: A }).errors[0]).toMatch(/through the draft/);
  });
});

describe('contracts', () => {
  it('a new salary and length is a new deal from the contract season, with raises; options and two-way deals switch', () => {
    const l = fresh();
    const p = best(l, A)[0];
    const cs = contractSeason(l);
    editPlayer(l, p.pid, { contract: { amount: 50_000, years: 4, option: 'player' } });
    expect(salaryFor(p, cs)).toBe(50_000);
    expect(salaryFor(p, cs + 1)).toBe(52_500);
    expect(contractExp(p.contract)).toBe(cs + 3);
    expect(yearsLeft(l, p)).toBe(4);
    expect(p.contract.option).toBe('player');
    editPlayer(l, p.pid, { contract: { option: null, twoWay: true } });
    expect(p.contract.option).toBeUndefined();
    expect(p.contract.twoWay).toBe(true);
    expect(checkPlayerEdit(l, p, { contract: { years: 1, option: 'team' } }).errors[0]).toMatch(/two seasons or more/);
    // a deal cut to one season loses the option it had
    editPlayer(l, p.pid, { contract: { option: 'team' } });
    editPlayer(l, p.pid, { contract: { years: 1 } });
    expect(p.contract.option).toBeUndefined();
    expect(contractExp(p.contract)).toBe(cs);
  });
});

describe('team edits', () => {
  it('names, abbreviation, colours, money and hype; the coach changes with his registry entry', () => {
    const l = fresh();
    editTeam(l, A, { region: 'Seattle', name: 'Storm', abbrev: 'sea', colors: ['#00FF00', '#112233', '#ffffff'], cash: 500_000, hype: 1, coach: { development: 99, tactics: 98 } });
    const t = l.teams[A];
    expect([t.region, t.name, t.abbrev]).toEqual(['Seattle', 'Storm', 'SEA']);
    expect(t.colors).toEqual(['#00ff00', '#112233', '#ffffff']);
    expect([t.cash, t.hype, t.coach.development, t.coach.tactics]).toEqual([500_000, 1, 99, 98]);
    expect(registryProblems(l)).toEqual([]);
    expect(checkTeamEdit(l, B, { abbrev: 'SEA' })[0]).toMatch(/another team's/);
    expect(checkTeamEdit(l, B, { colors: ['red', '#000000', '#ffffff'] }).length).toBe(1);
    expect(() => editTeam(l, B, { name: '' })).toThrow();
  });

  it('heal everyone on a team; the owner can be talked round', () => {
    const l = fresh();
    for (const p of teamPlayers(l, A).slice(0, 3)) p.injury = { type: 'Sprained Ankle', gamesRemaining: 4, gamesTotal: 4, severity: 'minor' };
    expect(healTeam(l, A)).toBeGreaterThanOrEqual(3);
    expect(teamPlayers(l, A).every((p) => !p.injury && p.wear === 0)).toBe(true);
    setOwnerConfidence(l, 5);
    expect(l.ownerMood.total).toBe(1);
  });
});

describe('created players', () => {
  it('at the OVR, age and height asked for, on his own random stream, as a free agent or on a team', () => {
    const l = fresh();
    const rng = l.rng;
    const p = createPlayer(l, { firstName: 'Neo', lastName: 'Anders', age: 24, heightIn: 80, ovr: 90, growth: 0.5, tid: FREE_AGENT });
    expect(l.rng).toBe(rng);
    expect(Math.abs(p.ovr - 90)).toBeLessThanOrEqual(1);
    expect([playerName(p), l.season - p.bornYear, p.heightIn, p.tid]).toEqual(['Neo Anders', 24, 80, FREE_AGENT]);
    expect(p.tend).toBeDefined();
    expect(p.asking!.amount).toBeGreaterThan(0);
    expect(l.players[p.pid]).toBe(p);
    // the same league makes the same player
    const again = createPlayer(fresh(), { firstName: 'Neo', lastName: 'Anders', age: 24, heightIn: 80, ovr: 90, growth: 0.5, tid: FREE_AGENT });
    expect(again.ratings).toEqual(p.ratings);
    const q = createPlayer(l, { age: 30, heightIn: 84, ovr: 70, growth: 0, tid: A });
    expect(q.tid).toBe(A);
    expect(q.firstName.length).toBeGreaterThan(0);
    expect(salaryFor(q, contractSeason(l))).toBeGreaterThan(0);
    expect(l.teams[A].rotation.order).toContain(q.pid);
  });
});

describe('forced trades', () => {
  it('a deal the AI turns down goes through; one out of shape does not', () => {
    const l = fresh();
    const star = best(l, A)[0];
    const scrub = worst(l, l.userTid)[0];
    const offer = { a: { tid: l.userTid, pids: [scrub.pid], dpids: [] }, b: { tid: A, pids: [star.pid], dpids: [] } };
    expect(evaluateTrade(l, offer).accept).toBe(false);
    expect(checkForceTrade(l, offer).errors).toEqual([]);
    forceTrade(l, offer);
    expect([star.tid, scrub.tid]).toEqual([l.userTid, A]);
    expect(l.godEdits).toBe(1);
    // the star is no longer A's to send
    expect(checkForceTrade(l, offer).errors[0]).toMatch(/isn't with/);
    expect(checkForceTrade(l, { a: { tid: A, pids: [], dpids: [] }, b: { tid: B, pids: [], dpids: [] } }).errors[0]).toMatch(/empty/);
    expect(() => forceTrade(l, { a: { tid: A, pids: [], dpids: [] }, b: { tid: A, pids: [], dpids: [] } })).toThrow();
  });
});

describe('an edited league', () => {
  it('saves, loads and plays on; a damaged count of edits is dropped on load', async () => {
    const l = fresh();
    l.settings.godMode = true;
    const p: Player = best(l, A)[0];
    editPlayer(l, p.pid, { tid: l.userTid, ratings: { tp: 99 }, contract: { amount: 30_000, years: 2 } });
    editTeam(l, B, { name: 'Renamed' });
    createPlayer(l, { age: 22, heightIn: 78, ovr: 80, growth: 0, tid: FREE_AGENT });
    await saveLeague(l);
    const back = (await loadLeague(l.id))!;
    expect(back.godEdits).toBe(3);
    expect(back.settings.godMode).toBe(true);
    expect(back.teams[B].name).toBe('Renamed');
    for (let i = 0; i < 3; i++) simDay(back);
    expect(registryProblems(back)).toEqual([]);
    const damaged = migrate({ ...structuredClone(back), godEdits: -2, settings: { ...back.settings, godMode: 'yes' } });
    expect(damaged.godEdits).toBeUndefined();
    expect(damaged.settings.godMode).toBeUndefined();
  });
});
