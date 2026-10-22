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
import { askingContract, marketSalary, preferredYears } from '../league/contracts';
import { registryProblems } from '../league/coaches';
import { simDay } from '../league/season';
import { contractExp, followTendencies, salaryFor } from '../playerGen';
import { Rng } from '../random';
import { RATING_KEYS } from '../ratings';
import type { League, Player } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../types';

const base = testLeague('god');
const fresh = () => structuredClone(base);
const A = (base.userTid + 1) % 30;
const B = (base.userTid + 2) % 30;
const best = (l: League, tid: number) => teamPlayers(l, tid).sort((x, y) => y.ovr - x.ovr);
const worst = (l: League, tid: number) => best(l, tid).reverse();

describe('god mode', () => {
  it('edits players and teams, creates players and forces trades, checked whole first, and leaves a league that saves, loads and plays on', async () => {
    // player edits
    // new ratings bring OVR, potential, archetype and tendencies with them, and the edit is counted
    {
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
    }

    // tendencies move with his level once: an edit and its undoing leave them as they were, and next summer doesn't count the edit again
    {
      const l = fresh();
      const p = best(l, A)[3];
      const [tend, ratings, ovr] = [{ ...p.tend! }, { ...p.ratings }, p.ovr];
      editPlayer(l, p.pid, { ratings: Object.fromEntries(RATING_KEYS.filter((k) => k !== 'hgt').map((k) => [k, p.ratings[k] + 12])) });
      expect(p.ovr).toBeGreaterThan(ovr + 5);
      // this season's snapshot holds him as edited: the level his tendencies are now set for
      expect(p.ratingsHistory.at(-1)).toMatchObject({ season: l.season, ovr: p.ovr, pot: p.pot });
      const edited = { ...p.tend! };
      // a summer without a change in level moves the level-driven ones no further
      const summer = structuredClone(p);
      followTendencies(summer, summer.ratingsHistory.at(-1)!.ovr, new Rng(1));
      expect(summer.tend!.three).toBeCloseTo(edited.three, 3);
      expect(summer.tend!.pass).toBeCloseTo(edited.pass, 3);
      editPlayer(l, p.pid, { ratings });
      expect(p.ovr).toBe(ovr);
      for (const k of ['use', 'create', 'three', 'pass'] as const) expect(p.tend![k]).toBeCloseTo(tend[k]!, 2);
    }

    // bio and health: age moves his birth year, an injury keeps him out and healing clears it
    {
      const l = fresh();
      const p = best(l, A)[0];
      editPlayer(l, p.pid, { firstName: ' Zed ', lastName: 'Quill', age: 21, heightIn: 90, pos: 'C', injury: { type: 'Torn ACL', games: 80 } });
      expect(playerName(p)).toBe('Zed Quill');
      expect(l.season - p.bornYear).toBe(21);
      expect(p.injury).toMatchObject({ type: 'Torn ACL', gamesRemaining: 80, gamesTotal: 80, severity: 'severe' });
      editPlayer(l, p.pid, { injury: null, wear: 0 });
      expect(p.injury).toBeNull();
      expect(p.wear).toBe(0);
    }

    // a bad edit throws and changes nothing
    {
      const l = fresh();
      const [p, mate] = best(l, A);
      const before = structuredClone(p);
      for (const e of [{ firstName: '' }, { age: 70 }, { jersey: mate.jersey }, { jersey: '123' }, { tid: 99 }, { contract: { years: 9 } }]) {
        expect(checkPlayerEdit(l, p, { ...e, ratings: { tp: 99 } }).errors.length).toBeGreaterThan(0);
        expect(() => editPlayer(l, p.pid, { ...e, ratings: { tp: 99 } })).toThrow();
      }
      expect(p).toEqual(before);
      expect(l.godEdits).toBeUndefined();
    }

    // a team's retired number can't be given out
    {
      const l = fresh();
      const p = best(l, A)[0];
      l.teams[A].retired = [{ jersey: '77', pid: 1, name: 'Old Legend', season: 2000 }];
      expect(checkPlayerEdit(l, p, { jersey: '77' }).errors[0]).toMatch(/retired No. 77/);
      // a leading zero would make a second 7; 00 is a number of its own
      expect(checkPlayerEdit(l, p, { jersey: '07' }).errors[0]).toMatch(/0 to 99/);
      expect(checkPlayerEdit(l, p, { jersey: '00' }).errors).toEqual(teamPlayers(l, A).some((x) => x.jersey === '00') ? [expect.stringMatching(/wears No. 00/)] : []);
      // (a team that isn't there is named as the problem, not checked for numbers)
      expect(checkPlayerEdit(l, p, { tid: 99, jersey: '5' }).errors[0]).toMatch(/doesn't exist/);
      editPlayer(l, p.pid, { jersey: '78' });
      expect(p.jersey).toBe('78');
      expect(p.jerseys?.[A]).toBe('78');
    }

    // moving players
    // to another team: his contract goes with him, off one rotation and onto the other, with a free number
    {
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
    }

    // a free agent joins on his asking deal; a player sent to free agency leaves no dead money
    {
      const l = fresh();
      const [fa, cut] = freeAgents(l).sort((x, y) => y.ovr - x.ovr);
      editPlayer(l, fa.pid, { tid: B });
      expect(fa.tid).toBe(B);
      expect(salaryFor(fa, contractSeason(l))).toBeGreaterThan(0);
      expect(fa.asking).toBeUndefined();
      // one whose price came down as the market dried up signs at it, as the editor shows it
      cut.asking = { amount: Math.round(askingContract(l, cut).amount * 0.7), years: 2 };
      const shown = askingContract(l, cut, B);
      editPlayer(l, cut.pid, { tid: B });
      expect([salaryFor(cut, contractSeason(l)), contractExp(cut.contract) - contractSeason(l) + 1]).toEqual([shown.amount, shown.years]);
      // an edit that changes what an unsigned one is worth keeps his markdown: his price stays as far under his market value
      const third = createPlayer(l, { age: 26, heightIn: 79, ovr: 84, growth: 0, tid: FREE_AGENT });
      third.asking = { amount: Math.round(marketSalary(l, third) * 0.6), years: 2 };
      editPlayer(l, third.pid, { injury: { type: 'Sprained Ankle', games: 20 } });
      expect(third.asking!.amount / marketSalary(l, third)).toBeCloseTo(0.6, 1);
      expect(third.asking!.years).toBe(2);
      const p = best(l, A)[0];
      const dead = l.teams[A].deadMoney.length;
      const pay = payroll(l, A);
      editPlayer(l, p.pid, { tid: FREE_AGENT });
      expect(p.tid).toBe(FREE_AGENT);
      expect(l.teams[A].deadMoney.length).toBe(dead);
      expect(payroll(l, A)).toBeLessThan(pay);
      expect(p.asking?.amount).toBeGreaterThan(0);
    }

    // rosters can go past the limits with a warning, but never below five to dress in season
    {
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
    }

    // draft prospects and retired players can't be moved
    {
      const l = fresh();
      const prospect = Object.values(l.players).find((x) => x.tid === DRAFT_PROSPECT);
      if (prospect) expect(checkPlayerEdit(l, prospect, { tid: A }).errors[0]).toMatch(/through the draft/);
    }

    // contracts
    // a new salary and length is a new deal from the contract season, with raises; options and two-way deals switch
    {
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
    }

    // a free agent joining with an option gets it on his asking deal; a new salary on a deal that is up runs his asking length
    {
      const l = fresh();
      const fa = freeAgents(l).find((x) => l.season - x.bornYear <= 30)!;
      expect(checkPlayerEdit(l, fa, { tid: B, contract: { option: 'player' } }).errors).toEqual([]);
      editPlayer(l, fa.pid, { tid: B, contract: { option: 'player' } });
      expect(yearsLeft(l, fa)).toBeGreaterThanOrEqual(2);
      expect(fa.contract.option).toBe('player');
      // the re-sign period: a deal that ran out with the season
      l.phase = 'resign';
      const up = Object.values(l.players).find((x) => x.tid >= 0 && contractExp(x.contract) === l.season && l.season - x.bornYear <= 31)!;
      expect(yearsLeft(l, up)).toBe(0);
      expect(checkPlayerEdit(l, up, { contract: { option: 'team' } }).errors[0]).toMatch(/two seasons or more/);
      editPlayer(l, up.pid, { contract: { amount: 9_000 } });
      expect(salaryFor(up, contractSeason(l))).toBe(9_000);
      expect(yearsLeft(l, up)).toBe(preferredYears(l, up));
      expect(yearsLeft(l, up)).toBeGreaterThanOrEqual(3);
    }

    // team edits
    // names, abbreviation, colours, money and hype; the coach changes with his registry entry
    {
      const l = fresh();
      editTeam(l, A, {
        region: 'Seattle',
        name: 'Storm',
        abbrev: 'sea',
        colors: ['#00FF00', '#112233', '#ffffff'],
        cash: 500_000,
        hype: 1,
        coach: { development: 99, tactics: 98 },
      });
      const t = l.teams[A];
      expect([t.region, t.name, t.abbrev]).toEqual(['Seattle', 'Storm', 'SEA']);
      expect(t.colors).toEqual(['#00ff00', '#112233', '#ffffff']);
      expect([t.cash, t.hype, t.coach.development, t.coach.tactics]).toEqual([500_000, 1, 99, 98]);
      expect(registryProblems(l)).toEqual([]);
      expect(checkTeamEdit(l, B, { abbrev: 'SEA' })[0]).toMatch(/another team's/);
      expect(checkTeamEdit(l, B, { colors: ['red', '#000000', '#ffffff'] }).length).toBe(1);
      expect(() => editTeam(l, B, { name: '' })).toThrow();
    }

    // heal everyone on a team; the owner can be talked round
    {
      const l = fresh();
      for (const p of teamPlayers(l, A).slice(0, 3)) p.injury = { type: 'Sprained Ankle', gamesRemaining: 4, gamesTotal: 4, severity: 'minor' };
      expect(healTeam(l, A)).toBeGreaterThanOrEqual(3);
      expect(teamPlayers(l, A).every((p) => !p.injury && p.wear === 0)).toBe(true);
      setOwnerConfidence(l, 5);
      expect(l.ownerMood.total).toBe(1);
      expect(() => setOwnerConfidence(l, NaN)).toThrow();
      expect(l.ownerMood.total).toBe(1);
    }

    // created players
    // at the OVR, age and height asked for, on his own random stream, as a free agent or on a team
    {
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
      // one with no experience is a rookie in the season he'll play: this one's, in the summer the next one's
      expect(createPlayer(l, { age: 19, heightIn: 78, ovr: 60, growth: 0.5, tid: FREE_AGENT }).draft.year).toBe(l.season - 1);
      const phase = l.phase;
      l.phase = 'freeAgency';
      expect(createPlayer(l, { age: 19, heightIn: 78, ovr: 60, growth: 0.5, tid: FREE_AGENT }).draft.year).toBe(l.season);
      l.phase = phase;
      expect(q.firstName.length).toBeGreaterThan(0);
      expect(salaryFor(q, contractSeason(l))).toBeGreaterThan(0);
      expect(l.teams[A].rotation.order).toContain(q.pid);
    }

    // forced trades
    // a deal the AI turns down goes through; one out of shape does not
    {
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
    }

    // the arrivals' roles are set at once; a swap needs both teams' own firsts, staying put
    {
      const l = fresh();
      const p = best(l, A)[1];
      forceTrade(l, { a: { tid: B, pids: [], dpids: [] }, b: { tid: A, pids: [p.pid], dpids: [] } });
      expect(l.teams[B].tactics.offense.roles[p.pid]).toBeDefined();
      expect(l.teams[A].tactics.offense.roles[p.pid]).toBeUndefined();
      const y = l.season + 2;
      const own = (tid: number) => l.draftPicks.find((d) => d.season === y && d.round === 1 && d.originalTid === tid && d.tid === tid);
      expect(own(A) && own(B)).toBeTruthy();
      const swap = { a: { tid: A, pids: [], dpids: [], swaps: [y] }, b: { tid: B, pids: [], dpids: [] } };
      expect(checkForceTrade(l, swap).errors).toEqual([]);
      // the pick it rides on can't move in the same deal, nor the swap go both ways
      expect(checkForceTrade(l, { ...swap, b: { tid: B, pids: [], dpids: [own(B)!.dpid] } }).errors[0]).toMatch(/pick swap/);
      expect(checkForceTrade(l, { ...swap, b: { tid: B, pids: [], dpids: [], swaps: [y] } }).errors[0]).toMatch(/pick swap/);
    }

    // an edited league
    // saves, loads and plays on; a damaged count of edits is dropped on load
    {
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
    }
  });
});
