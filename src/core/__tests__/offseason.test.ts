// The offseason: the lottery and the draft order, user picks, a fired coach's league waiting, the
// mock draft (AI picks read the way the real draft makes them, a mock that never touches the league,
// picks with their owners, protections and swaps, the user's big board, the real order after the
// lottery); then the summer: phase guards, experience, jersey numbers and names, contract options,
// the calendar, free agents' prices and the league's talent level.
import { beforeAll, describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { testLeague } from '../../state/__tests__/fixtures';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { anchorRatings, ratingMeans } from '../league/progression';
import { RATING_KEYS } from '../ratings';
import {
  autoDraftUserPick,
  canStartRegularSeason,
  faAdvance,
  faDayNumber,
  faOver,
  finishDraftPhase,
  newSeason,
  simDay,
  startDraft,
  startFreeAgency,
  startRegularSeason,
  userDraftPick,
} from '../league/season';
import { aiChoose, draftOrder, draftPlayer, generateDraftClass, lotteryOdds, nextPick, runLottery } from '../league/draft';
import { mockAvailable, mockDraft } from '../league/mockDraft';
import { FIRED_REASON, askingContract, decideTeamOption, marketSalary, pendingOption, releasePlayer, valueScore } from '../league/contracts';
import { expiringPlayers, faDay } from '../league/freeAgency';
import { CAP_FOR, contractSeason, curTeamSeason, dayToDate, freeAgents, prospects, standardRoster, statsLine, teamPlayers, winPct, withRng } from '../league/helpers';
import { ensureRotation } from '../league/games';
import { takeOverTeam } from '../league/owner';
import { contractExp } from '../playerGen';
import { CAP } from '../constants';
import { Rng } from '../random';
import type { League, Player } from '../types';

const seed = seedJson as unknown as SeedData;
const real = seed.players.length > 0;
const U = 19;

function league(rngSeed = 7): League {
  const l = createLeague({ name: 'r', userTid: U, coachName: 'c', settings: { ...defaultSettings(), stopOnNews: false }, seed: real ? seed : null, rngSeed });
  // real contract lists carry camp bodies: cut the user to 15 like the AI teams
  const std = () => standardRoster(l, U);
  while (std().length > CAP.rosterMax) releasePlayer(l, std().sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  return l;
}

const aiTeam = (l: League) => l.teams.find((t) => t.tid !== l.userTid)!.tid;

/** aiChoose as it was before its scoring was shared with the mock draft. */
function oldChoose(league: League, tid: number, rng: Rng): Player | undefined {
  const avail = prospects(league, league.season);
  if (!avail.length) return undefined;
  const roster = teamPlayers(league, tid);
  const bigs = roster.filter((p) => p.ratings.hgt >= 60).length;
  const guards = roster.filter((p) => p.ratings.hnd >= 60).length;
  let best: Player | undefined;
  let bs = -Infinity;
  for (const p of avail) {
    let s = p.pot * 0.65 + p.ovr * 0.35 + rng.normal(0, 1.5);
    if (bigs <= 2 && p.ratings.hgt >= 60) s += 1;
    if (guards <= 2 && p.ratings.hnd >= 60) s += 1;
    s -= (p.prospect?.rank ?? 50) * 0.04;
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

describe('the draft', () => {
  let l: League;
  beforeAll(() => {
    l = testLeague('mock');
    l.id = 'lg_mock';
    for (let i = 0; i < 20; i++) simDay(l);
  }, 60_000);

  it('the lottery and draft order, user picks, a fired coach waiting, and the mock draft (bug 13)', () => {
    // auto-pick drafts only the current user pick
    {
      const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      league.phase = 'draftLottery';
      runLottery(league, new Rng(1));
      const userPicks = draftOrder(league).filter((d) => d.tid === 5).length;
      expect(userPicks).toBe(2);
      startDraft(league);
      expect(nextPick(league)?.tid).toBe(5);
      autoDraftUserPick(league);
      // the user's second-round pick must still be waiting
      expect(draftOrder(league).filter((d) => d.tid === 5).length).toBe(1);
      expect(nextPick(league)?.tid).toBe(5);
    }

    // a pick of a player who is off the board (a double tap on consecutive picks) is refused instead of throwing
    {
      const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      league.phase = 'draftLottery';
      runLottery(league, new Rng(1));
      startDraft(league);
      const first = nextPick(league)!;
      const rostered = standardRoster(league, 0)[0];
      expect(userDraftPick(league, rostered.pid)).toMatch(/no longer on the board/);
      expect(userDraftPick(league, 999_999)).toMatch(/no longer on the board/);
      expect(nextPick(league)).toBe(first);
      const pid = Object.values(league.players).find((p) => p.tid === -2)!.pid;
      expect(userDraftPick(league, pid)).toBeNull();
      // his second-round pick is up: the same tap again names a player who is already his
      expect(nextPick(league)?.tid).toBe(5);
      expect(userDraftPick(league, pid)).toMatch(/no longer on the board/);
    }

    // a fired coach's league waits: the draft and every later step only move on once he takes over a team
    {
      const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      league.phase = 'draftLottery';
      runLottery(league, new Rng(1));
      league.fired = true;
      expect(startDraft(league)).toBe(false);
      expect(league.phase).toBe('draftLottery');
      league.phase = 'draft';
      expect(finishDraftPhase(league)).toBe(false);
      league.phase = 'preseason';
      expect(canStartRegularSeason(league)).toEqual([FIRED_REASON]);
      league.phase = 'draftLottery';
      takeOverTeam(league, 6);
      expect(startDraft(league)).toBe(true);
    }

    // a lottery with nobody in it (every team in the playoffs) runs without throwing
    {
      const league = createLeague({ name: 't', userTid: 5, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      for (const t of league.teams) curTeamSeason(league, t.tid).playoffRound = 1;
      expect(runLottery(league, new Rng(1)).order).toEqual([]);
      expect(draftOrder(league)).toHaveLength(60);
    }

    // the second round goes by record across all 30 teams (bug 13)
    {
      const l = league();
      const rng = new Rng(3);
      l.teams.forEach((t, i) => {
        const ts = curTeamSeason(l, t.tid);
        ts.won = 20 + ((i * 7) % 30) + (i % 3);
        ts.lost = 82 - ts.won;
        // conference imbalance: some playoff teams have worse records than lottery teams
        ts.playoffRound = i % 2 === 0 ? 1 : -1;
      });
      l.phase = 'draftLottery';
      runLottery(l, rng);
      const r2 = l.draftPicks.filter((d) => d.season === l.season && d.round === 2).sort((a, b) => a.pick! - b.pick!);
      expect(r2.length).toBe(30);
      const pct = r2.map((d) => winPct(curTeamSeason(l, d.originalTid)));
      for (let i = 1; i < pct.length; i++) expect(pct[i]).toBeGreaterThanOrEqual(pct[i - 1]);
    }

    // teams on the same record pick in reverse order in the second round
    {
      const l = createLeague({ name: 'r', userTid: 7, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 5 });
      for (const t of l.teams) {
        const w = t.tid === 20 || t.tid === 21 ? 50 : 10 + t.tid * 2;
        Object.assign(curTeamSeason(l, t.tid), { won: w, lost: 82 - w, playoffRound: w >= 46 ? 1 : -1 });
      }
      runLottery(l, new Rng(3));
      const pick = (tid: number, round: number) => l.draftPicks.find((d) => d.season === l.season && d.round === round && d.originalTid === tid)!.pick!;
      const [first, second] = pick(20, 1) < pick(21, 1) ? [20, 21] : [21, 20];
      expect(pick(second, 2)).toBeLessThan(pick(first, 2));
    }

    // teams tied for lottery places split their chances
    {
      const l = league();
      // two worst teams level at 15 wins, three more level at 20, the rest apart; the top 16 in the playoffs
      const wins = [15, 15, 20, 20, 20, ...Array.from({ length: 25 }, (_, i) => 22 + i)];
      l.teams.forEach((t, i) => {
        const ts = curTeamSeason(l, t.tid);
        ts.won = wins[i];
        ts.lost = 82 - wins[i];
        ts.playoffRound = i >= 14 ? 1 : -1;
      });
      const odds = new Map(lotteryOdds(l).map((x) => [x.tid, x.w]));
      expect(odds.get(0)).toBe(140);
      expect(odds.get(1)).toBe(140);
      for (const tid of [2, 3, 4]) expect(odds.get(tid)).toBeCloseTo((140 + 125 + 105) / 3);
      expect(odds.get(5)).toBe(90);
      expect([...odds.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1000);
    }

    // the mock draft: the real draft picks exactly as it did before its scoring was shared
    for (let tid = 0; tid < l.teams.length; tid++) {
      const a = new Rng(1000 + tid);
      const b = new Rng(1000 + tid);
      expect(aiChoose(l, tid, a)?.pid).toBe(oldChoose(l, tid, b)?.pid);
      expect(a.state).toBe(b.state);
    }

    // it reads the same for the same league and never touches it
    {
      expect(mockAvailable(l)).toBe(true);
      const before = JSON.stringify(l);
      const a = mockDraft(l)!;
      const b = mockDraft(l)!;
      expect(JSON.stringify(l)).toBe(before);
      expect(a.slots).toEqual(b.slots);
      expect(a.slots.length).toBe(60);
      expect(a.slots.every((s) => s.projected)).toBe(true);
      // a prospect goes once a draft: his shares over the slots add up to at most every draft
      const shares = new Map<number, number>();
      for (const s of a.slots) {
        expect(s.options.length).toBeGreaterThan(0);
        // the alternatives after the slot's pick, likeliest first
        for (let i = 2; i < s.options.length; i++) expect(s.options[i].p).toBeLessThanOrEqual(s.options[i - 1].p);
        for (const o of s.options) shares.set(o.pid, (shares.get(o.pid) ?? 0) + o.p);
      }
      for (const v of shares.values()) expect(v).toBeLessThanOrEqual(1 + 1e-9);
      // it reads as one draft: nobody is the pick twice
      const picks = a.slots.map((s) => s.options[0].pid);
      expect(new Set(picks).size).toBe(picks.length);
      for (const r of a.range.values()) {
        expect(r.lo).toBeLessThanOrEqual(r.med);
        expect(r.med).toBeLessThanOrEqual(r.hi);
      }
      // the best prospects go early, and they're gone before the late picks
      const best = prospects(l, l.season).sort((x, y) => (x.prospect?.rank ?? 99) - (y.prospect?.rank ?? 99))[0];
      expect(a.range.get(best.pid)!.med).toBeLessThanOrEqual(10);
      expect(a.goneBefore(best.pid, 31)).toBeGreaterThan(0.95);
    }

    // each pick goes to its owner, and a protected pick inside its protection stays home
    {
      const x = structuredClone(l);
      const first = mockDraft(x)!.slots[0];
      const dp = x.draftPicks.find((d) => d.season === x.season && d.round === 1 && d.originalTid === first.orig)!;
      const buyer = (first.orig + 1) % 30;
      dp.tid = buyer;
      expect(mockDraft(x)!.slots[0]).toMatchObject({ tid: buyer, orig: first.orig });
      dp.protection = 4;
      expect(mockDraft(x)!.slots[0]).toMatchObject({ tid: first.orig, orig: first.orig });
    }

    // a swap right takes the other first when that one projects higher, as the lottery settles it
    {
      const x = structuredClone(l);
      // (the top pick, and the first from the eleventh on that another team owns: a trade can put two firsts with one team)
      const slots = mockDraft(x)!.slots;
      const hi = slots[0];
      const at = slots.findIndex((s, i) => i >= 10 && s.tid !== hi.tid);
      const lo = slots[at];
      expect(hi.tid).not.toBe(lo.tid);
      const own = (tid: number) => x.draftPicks.find((d) => d.season === x.season && d.round === 1 && d.originalTid === tid)!;
      // the right rides on the lower pick: used
      own(lo.orig).swap = own(hi.orig).dpid;
      let m = mockDraft(x)!.slots;
      expect([m[0], m[at]]).toMatchObject([
        { tid: lo.tid, orig: hi.orig },
        { tid: hi.tid, orig: lo.orig },
      ]);
      // on the higher pick: it lapses
      delete own(lo.orig).swap;
      own(hi.orig).swap = own(lo.orig).dpid;
      m = mockDraft(x)!.slots;
      expect([m[0], m[at]]).toMatchObject([
        { tid: hi.tid, orig: hi.orig },
        { tid: lo.tid, orig: lo.orig },
      ]);
    }

    // the user's picks follow his big board
    {
      const x = structuredClone(l);
      const mine = mockDraft(x)!.slots.find((s) => s.tid === x.userTid)!;
      // the class's lowest-ranked prospect: nobody else takes him first
      const sleeper = prospects(x, x.season).sort((a, b) => (b.prospect?.rank ?? 0) - (a.prospect?.rank ?? 0))[0];
      x.draftBoard = [sleeper.pid];
      const m = mockDraft(x)!;
      expect(m.slots.find((s) => s.tid === x.userTid && s.overall === mine.overall)!.options[0]).toEqual({ pid: sleeper.pid, p: 1 });
    }

    // after the lottery it drafts in the real order, and on draft night from the picks already made
    {
      const x = structuredClone(l);
      runLottery(x, new Rng(5));
      x.phase = 'draftLottery';
      const m = mockDraft(x)!;
      expect(m.slots.every((s) => !s.projected)).toBe(true);
      const order = draftOrder(x);
      expect(m.slots.map((s) => [s.round, s.pick, s.tid])).toEqual(order.map((d) => [d.round, d.pick, d.tid]));
      x.phase = 'draft';
      const took = prospects(x, x.season)[0];
      draftPlayer(x, order[0], took.pid);
      const after = mockDraft(x)!;
      expect(after.slots[0].overall).toBe(2);
      expect(after.slots.some((s) => s.options.some((o) => o.pid === took.pid))).toBe(false);
    }

    // it is quick enough to work out when the screen opens
    const t0 = performance.now();
    mockDraft(l);
    expect(performance.now() - t0).toBeLessThan(2500);
  }, 180_000);
});

describe('the summer', () => {
  it('phase guards, experience, numbers and names, contract options, the calendar, prices and the talent level (bugs 5, 10, 11; UI2-22)', () => {
    // phase changes are no-ops outside their phase (bug 11)
    {
      const l = league();
      const season = l.season;
      expect(newSeason(l)).toBe(false);
      expect(startDraft(l)).toBe(false);
      expect(finishDraftPhase(l)).toBe(false);
      expect(startFreeAgency(l)).toBe(false);
      expect(startRegularSeason(l)).toEqual([]);
      expect(startRegularSeason(l).length).toBe(1);
      expect(l.season).toBe(season);
      expect(l.phase).toBe('regular');
    }

    // experience only grows for players who played that season; draftees start at 0 (bug 5)
    {
      const l = league();
      const [played, idle] = standardRoster(l, U);
      const fa = freeAgents(l)[0];
      statsLine(played, l.season, U, false).gp = 40;
      statsLine(fa, l.season, U, false).gp = 12; // played, then waived: still a season
      const rookie = Object.values(l.players).find((p) => p.tid === -2)!;
      rookie.tid = U;
      rookie.draft = { year: l.season, round: 1, pick: 5, tid: U };
      rookie.contract = { start: l.season + 1, salaries: [8_000, 8_400, 8_800, 9_200], rookie: true, option: 'team' };
      const before = { played: played.experience, idle: idle.experience, fa: fa.experience, rookie: rookie.experience };
      l.phase = 'freeAgency';
      expect(newSeason(l)).toBe(true);
      expect(played.experience).toBe(before.played + 1);
      expect(idle.experience).toBe(before.idle);
      expect(fa.experience).toBe(before.fa + 1);
      expect(rookie.experience).toBe(0);
    }

    // a new arrival whose number is taken picks a free one; nobody joins sharing a name
    {
      const l = league();
      const tid = aiTeam(l);
      const [vet] = teamPlayers(l, tid);
      const newcomer = teamPlayers(l, tid === 5 ? 6 : 5)[0];
      const number = vet.jersey;
      newcomer.jersey = number;
      // as a trade or signing brings him in: on the team and in its rotation order
      newcomer.tid = tid;
      l.teams[tid].rotation.order.push(newcomer.pid);
      ensureRotation(l, tid);
      const numbers = teamPlayers(l, tid).map((p) => p.jersey);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(vet.jersey).toBe(number);
      expect(newcomer.jersey).not.toBe(number);
      withRng(l, (rng) => generateDraftClass(l, l.season + 1, rng));
      const names = Object.values(l.players).map((p) => `${p.firstName} ${p.lastName}`);
      expect(new Set(names).size).toBe(names.length);
    }

    // contract options: opt-outs, AI and user team options (bug 10)
    {
      const l = league();
      const ai = aiTeam(l);
      const [a1, a2] = standardRoster(l, ai).sort((x, y) => y.ovr - x.ovr);
      const [weak, a3] = standardRoster(l, ai).sort((x, y) => x.ovr - y.ovr);
      const [u1, u2] = standardRoster(l, U).sort((x, y) => y.ovr - x.ovr);
      const cap = CAP_FOR(l, l.season + 1);
      const opt = (p: Player, kind: 'player' | 'team', next: number) => (p.contract = { start: l.season, salaries: [next, next], option: kind });
      opt(a1, 'player', cap.minContract); // underpaid star: opts out
      opt(weak, 'player', cap.maxContract(10)); // overpaid: opts in
      opt(a2, 'team', cap.minContract); // bargain: exercised
      opt(a3, 'team', cap.maxContract(10)); // overpaid: declined
      opt(u1, 'team', cap.minContract);
      opt(u2, 'team', cap.minContract);
      l.phase = 'draftLottery';
      runLottery(l, new Rng(2));
      expect(startDraft(l)).toBe(true);
      expect(finishDraftPhase(l)).toBe(true);
      expect(contractExp(a1.contract)).toBe(l.season);
      expect(expiringPlayers(l, ai)).toContain(a1);
      expect(contractExp(weak.contract)).toBe(l.season + 1);
      expect(weak.contract.option).toBeUndefined();
      expect(contractExp(a2.contract)).toBe(l.season + 1);
      expect(contractExp(a3.contract)).toBe(l.season);
      // the user's team options wait for his call
      expect(pendingOption(l, u1)).toBe('team');
      expect(decideTeamOption(l, u2.pid, false).ok).toBe(true);
      expect(expiringPlayers(l, U)).toContain(u2);
      // left open: the staff exercises the bargain when free agency opens
      expect(startFreeAgency(l)).toBe(true);
      expect(pendingOption(l, u1)).toBeNull();
      expect(u1.tid).toBe(U);
      expect(contractExp(u1.contract)).toBe(l.season + 1);
    }

    // advancing free agency past day 30 stops on day 30 (UI2-22)
    {
      const l = league();
      l.phase = 'freeAgency';
      l.faDay = 26;
      faAdvance(l, 7);
      expect(faDayNumber(l)).toBe(30);
      expect(faOver(l)).toBe(true);
      // the last day is the last: nothing left to advance
      const day = l.day;
      faAdvance(l, 1);
      expect(l.day).toBe(day);
      expect(faDayNumber(l)).toBe(30);
    }

    // the summer has dates: draft night in late June, free agency from June 30, a day per free-agency day
    {
      const l = league();
      l.phase = 'draftLottery';
      l.day = 238; // Finals night, mid-June
      runLottery(l, new Rng(2));
      expect(startDraft(l)).toBe(true);
      const md = () => [dayToDate(l.season, l.day).getUTCMonth(), dayToDate(l.season, l.day).getUTCDate()];
      expect(md()).toEqual([5, 25]);
      expect(l.news[l.news.length - 1].day).toBe(l.day);
      expect(finishDraftPhase(l)).toBe(true);
      expect(startFreeAgency(l)).toBe(true);
      expect(md()).toEqual([5, 30]);
      faAdvance(l, 3);
      expect(md()).toEqual([6, 3]);
      expect(l.inbox[0].day).toBeLessThanOrEqual(l.day);
    }

    // free agents lower their asking price as the market dries up
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 8 });
      const fa = freeAgents(league).sort((a, b) => b.ovr - a.ovr)[0];
      const before = askingContract(league, fa).amount;
      fa.faDays = 1;
      // nobody signs him: run a day with no AI activity
      faDay(league, new Rng(2), 0);
      if (fa.tid === -1 && before > CAP_FOR(league).minContract) expect(askingContract(league, fa).amount).toBeLessThan(before);
    }

    // offseason contracts are priced against next season's cap
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 8 });
      const p = Object.values(league.players)
        .filter((x) => x.tid >= 0)
        .sort((a, b) => b.ovr - a.ovr)[0];
      const inSeason = marketSalary(league, p);
      league.phase = 'freeAgency';
      expect(contractSeason(league)).toBe(league.season + 1);
      expect(marketSalary(league, p)).toBeGreaterThanOrEqual(inSeason);
    }

    // the league talent level holds steady across seasons
    {
      const league = createLeague({ name: 'a', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 31 });
      const before = ratingMeans(league);
      // a year of runaway development everywhere
      for (const p of Object.values(league.players)) for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = Math.min(100, p.ratings[k] + 6);
      anchorRatings(league);
      const after = ratingMeans(league);
      for (const k of RATING_KEYS) expect(Math.abs((after[k] ?? 0) - (before[k] ?? 0))).toBeLessThan(0.6);
    }
  }, 180_000);
});
