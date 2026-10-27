// AI front offices in the market: an old team bringing back its own free agent on his Bird rights,
// who a team shops, a star's price on the trade market, and rebuilding teams' youth movements. And
// coaches: their names, the owner's review, taking over a team, and the job market (a fired user
// hears from the openings whose owners would rather have him than the coach they hired, or with no
// openings from the teams likeliest to make a change; a user with a job is approached only when an
// opening rates him clearly above its hire; taking a job is a takeover; declining, the draft and
// saves). Fictional leagues with hand-shaped teams keep most of these fast.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { testLeague } from '../../state/__tests__/fixtures';
import { migrate } from '../../state/persistence';
import { autoRotation } from '../ai/coachAI';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { CAP_FOR, addInbox, contractSeason, curTeamSeason, freeAgents, payroll, standardRoster, statsLine, teamPlayers, teamSeason, winPct } from '../league/helpers';
import { askingContract, releasePlayer, valueScore } from '../league/contracts';
import { bidFloor, faDay, marqueeFA, offerUtility, userBid } from '../league/freeAgency';
import { AI_RETRADE_DAYS, aiPackage, justTraded, sellable } from '../league/aiTrades';
import { buildSimInput, restForPlayoffs, restVeterans, seedLocked, youthLean, youthMovement, youthNews } from '../league/games';
import { ownerEvaluation, takeOverTeam } from '../league/owner';
import { activeCoach, candidateScore, coachCareer, openStint, profileOf, registryProblems, userCoach, type CarouselMoves } from '../league/coaches';
import { declineJob, makeJobOffers, takeJob } from '../league/jobs';
import { faAdvance, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { playerAge } from '../playerGen';
import { CAP } from '../constants';
import { Rng } from '../random';
import type { League, Player } from '../types';
import { FREE_AGENT } from '../types';

const U = 0;
const R = 1;

function league(rngSeed = 5): League {
  const l = createLeague({ name: `fo${rngSeed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
  l.id = `fo_${rngSeed}`;
  return l;
}

/** A player of known value: OVR = POT, age, healthy. */
function shape(l: League, p: Player, ovr: number, age: number): Player {
  p.ovr = ovr;
  p.pot = ovr;
  p.bornYear = l.season - age;
  p.injury = null;
  p.experience = 6;
  return p;
}

/**
 * Summer free agency where nobody can pay more than the minimum: every team over the cap with its
 * exceptions used, except team R, which is a little over the cap and well under what it would pay
 * to keep a role player (see payrollBudget).
 */
function summer(rngSeed = 5) {
  const l = league(rngSeed);
  l.phase = 'freeAgency';
  l.faDay = 0;
  const s = contractSeason(l);
  const cap = CAP_FOR(l, s);
  for (const t of l.teams) {
    t.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap }];
    t.mleSeason = s;
    t.baeSeason = s;
    t.strategy = 'retool';
  }
  const r = l.teams[R];
  for (const p of teamPlayers(l, R)) p.contract = { start: s, salaries: [cap.vetMin] };
  r.deadMoney = [];
  r.deadMoney = [{ pid: -1, name: 'x', season: s, amount: cap.salaryCap * 1.05 - payroll(l, R, s) }];
  return { l, s, cap };
}

/** One of the market's free agents made a role player (worth 75, not a top free agent) who played last season for `tid`. */
function ownFreeAgent(l: League, tid: number): Player {
  const p = shape(l, freeAgents(l)[0], 75, 27);
  p.contract = { start: l.season - 2, salaries: [8_000, 8_000, 8_000] };
  p.birdSince = l.season - 2;
  p.joinedSeason = l.season - 2;
  // (a rotation player's minutes: the market pays for the role he has shown, see roleMpg)
  Object.assign(statsLine(p, l.season, tid, false), { gp: 70, min: 70 * 24 });
  p.asking = undefined;
  p.asking = askingContract(l, p);
  return p;
}

/** Team R in the regular season with `star` its best player, everyone else younger and worse. */
function shop(strategy: 'retool' | 'rebuild', won: number, lost: number, star: { ovr: number; age: number }) {
  const l = league(3);
  l.phase = 'regular';
  const t = l.teams[R];
  t.strategy = strategy;
  const ts = curTeamSeason(l, R);
  ts.won = won;
  ts.lost = lost;
  const roster = standardRoster(l, R).sort((a, b) => b.ovr - a.ovr);
  for (const p of roster) {
    p.tradeLock = undefined;
    p.contract = { start: l.season, salaries: [10_000, 10_000] };
  }
  const best = shape(l, roster[0], star.ovr, star.age);
  // everyone else younger and worse
  for (const p of roster.slice(1)) shape(l, p, Math.min(p.ovr, star.ovr - 6), 23);
  return { l, best };
}

/** A fictional league in the regular season, every team's record set by its tid within its conference (the higher, the worse). */
function youthLeague(day: number): League {
  const L = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  startRegularSeason(L);
  L.day = day;
  for (const conf of ['E', 'W'] as const)
    L.teams
      .filter((t) => t.conf === conf)
      .forEach((t, i) => {
        const ts = teamSeason(t, L.season);
        ts.won = 40 - 2 * i;
        ts.lost = 12 + 2 * i;
        t.strategy = i >= 10 ? 'rebuild' : 'retool';
      });
  return L;
}

const bottom = (L: League, conf: 'E' | 'W', k: number) => L.teams.filter((t) => t.conf === conf && t.tid !== L.userTid).slice(-k);

const seed = seedJson as unknown as SeedData;

/** The real league with the user (team 19) cut to 15 like the AI teams. */
function realLeague(): League {
  const l = createLeague({
    name: 'r',
    userTid: 19,
    coachName: 'c',
    settings: { ...defaultSettings(), stopOnNews: false },
    seed: seed.players.length > 0 ? seed : null,
    rngSeed: 7,
  });
  const std = () => standardRoster(l, 19);
  while (std().length > CAP.rosterMax) releasePlayer(l, std().sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  return l;
}

const aiTeam = (l: League) => l.teams.find((t) => t.tid !== l.userTid)!.tid;

describe('AI front offices', () => {
  it("bring back their own on Bird rights, shop by strategy and record, pay a star's price, and turn to youth (L19)", () => {
    // brings back its own role player over the cap at his price, where nobody else could pay him more than the minimum
    {
      const { l, cap } = summer();
      const p = ownFreeAgent(l, R);
      expect(marqueeFA(l, p)).toBe(false);
      expect(payroll(l, R, contractSeason(l))).toBeGreaterThan(cap.salaryCap);
      const ask = askingContract(l, p, R).amount;
      expect(ask).toBeGreaterThan(cap.vetMin * 2);
      for (let d = 1; d <= 12 && p.tid === FREE_AGENT; d++) {
        faDay(l, new Rng(d), 1, d);
        l.faDay = d;
      }
      expect(p.tid).toBe(R);
      // on his Bird rights: his price (his old team's room holds a cut to 15%), with his Bird clock kept
      expect(p.contract.salaries[0]).toBeGreaterThanOrEqual(ask * 0.85 - 50);
      expect(p.birdSince).toBe(l.season - 2);
    }

    // a real league's summer: a top free agent never signs for less (by the utility his decision
    // weighs) than an offer of ours he turned down, a lone offer at his floor wins, and one he turns
    // down loses to a rival he likes more
    {
      const l = realLeague();
      const U19 = l.userTid;
      l.phase = 'resign';
      startFreeAgency(l);
      const s = contractSeason(l);
      for (const p of standardRoster(l, U19)) p.contract = { start: s, salaries: [CAP_FOR(l, s).vetMin] };
      l.teams[U19].deadMoney = [];
      const targets = freeAgents(l)
        .filter((p) => marqueeFA(l, p))
        .sort((a, b) => valueScore(l, b) - valueScore(l, a));
      for (const p of targets) {
        if ((l.faBids?.length ?? 0) >= 4) break;
        const ask = askingContract(l, p, U19);
        userBid(l, p.pid, bidFloor(l, p, ask.years), ask.years);
      }
      expect(l.faBids!.length).toBeGreaterThanOrEqual(2);
      const declined: { pid: number; at: League; amount: number; years: number }[] = [];
      let ours = 0;
      for (let d = 0; d < 20; d++) {
        const before = structuredClone(l);
        const due = (l.faBids ?? []).filter((b) => b.decideDay <= l.faDay + 1);
        faAdvance(l, 1);
        for (const b of due) {
          const p = l.players[b.pid];
          if (p.tid === U19) ours++;
          else if (p.tid === FREE_AGENT) declined.push({ pid: b.pid, at: before, amount: b.amount, years: b.years });
          else {
            // he chose a rival: one he liked at least as much as ours
            const was = before.players[b.pid];
            expect(offerUtility(before, was, p.tid, p.contract.salaries[0], p.contract.salaries.length)).toBeGreaterThanOrEqual(offerUtility(before, was, U19, b.amount, b.years));
          }
        }
        for (const x of declined) {
          const p = l.players[x.pid];
          if (p.tid < 0) continue;
          const was = x.at.players[x.pid];
          expect(offerUtility(x.at, was, p.tid, p.contract.salaries[0], p.contract.salaries.length)).toBeGreaterThanOrEqual(offerUtility(x.at, was, U19, x.amount, x.years));
        }
      }
      expect(ours).toBeGreaterThan(0);
    }

    // a retooling team out of it sells its veteran star; one in the race keeps him
    {
      const fading = shop('retool', 10, 20, { ovr: 86, age: 31 });
      expect(sellable(fading.l, R).map((p) => p.pid)).toContain(fading.best.pid);
      const racing = shop('retool', 20, 10, { ovr: 86, age: 31 });
      expect(sellable(racing.l, R).map((p) => p.pid)).not.toContain(racing.best.pid);
    }

    // a rebuilder sells its best player once he's 28, and keeps a 27-year-old franchise player
    {
      const old = shop('rebuild', 15, 15, { ovr: 85, age: 28 });
      expect(sellable(old.l, R).map((p) => p.pid)).toContain(old.best.pid);
      // ...but not one it got in a trade in the last 60 days (AI_RETRADE_DAYS), nor another team's package with him
      old.best.tradedFrom = { tid: (R + 1) % 30, season: old.l.season, day: old.l.day - 10 };
      expect(justTraded(old.l, old.best)).toBe(true);
      expect(sellable(old.l, R).map((p) => p.pid)).not.toContain(old.best.pid);
      old.best.tradedFrom.day = old.l.day - AI_RETRADE_DAYS;
      expect(sellable(old.l, R).map((p) => p.pid)).toContain(old.best.pid);
      const young = shop('rebuild', 15, 15, { ovr: 85, age: 27 });
      expect(sellable(young.l, R).map((p) => p.pid)).not.toContain(young.best.pid);
    }

    // a contender sends its third-best player for a star (85+), not for anyone less
    {
      const l = league(17);
      l.phase = 'regular';
      l.day = 60;
      const [S, B] = [3, 4];
      for (const t of l.teams) t.strategy = 'retool';
      l.teams[S].strategy = 'rebuild';
      l.teams[B].strategy = 'contend';
      const cap = CAP_FOR(l);
      const deal = (ovr: number) => {
        const x = structuredClone(l);
        for (const t of [S, B])
          for (const p of standardRoster(x, t)) {
            delete p.tradeLock;
            p.contract = { start: x.season, salaries: [cap.vetMin, cap.vetMin] };
          }
        const star = shape(x, standardRoster(x, S)[0], ovr, 30);
        star.contract = { start: x.season, salaries: [cap.salaryCap * 0.3, cap.salaryCap * 0.3] };
        for (const p of standardRoster(x, S)) if (p !== star) p.ovr = Math.min(p.ovr, 72);
        // the buyer: two better stars, then a young starter paid enough to match, the rest on the minimum
        const roster = standardRoster(x, B);
        roster.forEach((p, i) => shape(x, p, i < 2 ? 92 : i === 2 ? 83 : 70, i === 2 ? 23 : 27));
        roster[2].contract = { start: x.season, salaries: [cap.salaryCap * 0.25, cap.salaryCap * 0.25] };
        roster[2].pot = 90;
        // (the stars on big deals: over the cap, the buyer has to match salaries)
        for (const p of roster.slice(0, 2)) p.contract = { start: x.season, salaries: [cap.salaryCap * 0.3, cap.salaryCap * 0.3] };
        const third = roster[2];
        return { d: aiPackage(x, B, S, star), third };
      };
      const star = deal(88);
      expect(star.d).not.toBeNull();
      expect(star.d!.a.pids).toContain(star.third.pid);
      // a lesser player isn't worth the buyer's third-best: without him the salaries don't match
      const lesser = deal(84);
      expect(lesser.d?.a.pids ?? []).not.toContain(lesser.third.pid);
    }

    // leans to the young and away from the veterans
    {
      expect(youthLean(20)).toBeGreaterThan(youthLean(24));
      expect(youthLean(24)).toBeGreaterThan(0);
      expect(youthLean(26)).toBe(0);
      expect(youthLean(30)).toBeLessThan(0);
      expect(youthLean(34)).toBeLessThan(youthLean(30));
    }

    // starts with rebuilding teams at the bottom of their conference, and never with the user
    {
      const early = youthLeague(20);
      expect(early.teams.every((t) => youthMovement(early, t.tid) === 0)).toBe(true);
      const L = youthLeague(50);
      for (const conf of ['E', 'W'] as const) {
        // the bottom four rebuild from about 20 games in; the next one up waits for the deadline
        for (const t of bottom(L, conf, 4)) expect(youthMovement(L, t.tid)).toBe(1);
        expect(youthMovement(L, bottom(L, conf, 5)[0].tid)).toBe(0);
      }
      expect(youthMovement(L, L.userTid)).toBe(0);
      // after the deadline, every rebuilder out of the race; a contender never
      const late = youthLeague(0);
      late.day = late.tradeDeadlineDay + 1;
      for (const conf of ['E', 'W'] as const) for (const t of bottom(late, conf, 5)) expect(youthMovement(late, t.tid)).toBe(1);
      const contender = bottom(late, 'W', 1)[0];
      contender.strategy = 'contend';
      late.day++;
      expect(youthMovement(late, contender.tid)).toBe(0);
    }

    // plays the young more, sits veterans some nights, and says so in the news
    {
      const L = youthLeague(0);
      L.day = L.tradeDeadlineDay + 1;
      const t = bottom(L, 'E', 1)[0];
      const ps = teamPlayers(L, t.tid);
      const age = (pid: number) => playerAge(L.players[pid], L.season);
      const youngShare = (m: Record<number, number>) => Object.entries(m).reduce((a, [pid, x]) => a + (age(+pid) <= 23 ? x : 0), 0);
      const plain = autoRotation(ps, t.rotation);
      const youth = autoRotation(ps, t.rotation, { lean: (p) => youthLean(playerAge(p, L.season)), maxMinutes: 30 });
      expect(youngShare(youth.minutes)).toBeGreaterThan(youngShare(plain.minutes));
      // its veterans are held under the youth movement's 30; its two best young players keep a star's 33
      // (the lean comes out of the bench's and the veterans' minutes, not theirs)
      expect(Math.max(...ps.filter((p) => youthLean(age(p.pid)) < 0).map((p) => youth.minutes[p.pid] ?? 0))).toBeLessThanOrEqual(31);
      expect(Math.max(...Object.values(youth.minutes))).toBeLessThanOrEqual(34);
      // over a week, each veteran of 30 or more sits about every other night
      const vets = ps.filter((p) => playerAge(p, L.season) >= 30);
      const rested = new Map<number, number>();
      for (let d = 0; d < 6; d++) {
        const rest: number[] = [];
        restVeterans(L, ps, L.day + d, rest);
        for (const pid of rest) rested.set(pid, (rested.get(pid) ?? 0) + 1);
      }
      for (const p of vets) expect(rested.get(p.pid)).toBe(3);
      // ...but never more than two of its five best on one night, however many of them are veterans
      {
        const old = ps.map((p) => ({ ...p, bornYear: L.season - 31 }));
        const top = new Set(
          old
            .filter((p) => !p.contract.twoWay && !p.injury)
            .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
            .slice(0, 5)
            .map((p) => p.pid),
        );
        for (let d = 0; d < 6; d++) {
          const rest: number[] = [];
          restVeterans(L, old, L.day + d, rest);
          expect(rest.filter((pid) => top.has(pid)).length).toBeLessThanOrEqual(2);
          expect(rest.length).toBeGreaterThan(2);
        }
      }
      // the engine gets the rest list on a game night
      const input = buildSimInput(L, t.tid, L.day, 'regular');
      const tonight: number[] = [];
      restVeterans(L, ps, L.day, tonight);
      for (const pid of tonight) expect(input.rest).toContain(pid);
      youthNews(L);
      youthNews(L);
      expect(L.news.filter((n) => n.tids[0] === t.tid && n.text.includes('young players'))).toHaveLength(1);
    }

    // a conference leader nobody can catch saves its stars for the playoffs: its three best each sit
    // every other night
    {
      const L = youthLeague(0);
      const [lead, second] = L.teams.filter((t) => t.conf === 'W' && t.tid !== L.userTid);
      expect(seedLocked(L, lead.tid)).toBe(false);
      L.day = Math.max(...L.schedule.filter((g) => g.type === 'regular').map((g) => g.day));
      teamSeason(lead, L.season).won = 60;
      expect(seedLocked(L, lead.tid)).toBe(true);
      expect(seedLocked(L, second.tid)).toBe(false);
      const ps = teamPlayers(L, lead.tid).filter((p) => !p.contract.twoWay && !p.injury);
      const best = [...ps].sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
      const rested = new Map<number, number>();
      for (let d = 0; d < 6; d++) {
        const rest: number[] = [];
        restForPlayoffs(ps, L.day + d, rest);
        for (const pid of rest) rested.set(pid, (rested.get(pid) ?? 0) + 1);
      }
      for (const p of best.slice(0, 3)) expect(rested.get(p.pid)).toBe(3);
      expect(rested.has(best[3].pid)).toBe(false);
      const tonight: number[] = [];
      restForPlayoffs(ps, L.day, tonight);
      for (const pid of tonight) expect(buildSimInput(L, lead.tid, L.day, 'regular').rest).toContain(pid);
    }
  }, 180_000);
});

describe('coaches', () => {
  let l: League;
  beforeAll(() => {
    l = testLeague('jobs');
    l.id = 'lg_jobs';
    for (let i = 0; i < 400 && l.phase !== 'draftLottery'; i++) simDay(l);
  }, 180_000);

  /** An AI team and the coach in charge there, as if the carousel had just hired him. */
  const hire = (x: League, n = 1): CarouselMoves => {
    const teams = x.teams.filter((t) => t.tid !== x.userTid).slice(0, n);
    return { fired: [], hired: teams.map((t) => ({ tid: t.tid, coach: activeCoach(x, t.tid)!.id, first: false })) };
  };
  const scoreOf = (x: League, tid: number, user: boolean) => {
    const r = user ? userCoach(x)! : activeCoach(x, tid)!;
    return candidateScore(x, tid, { profile: profileOf(r), rec: r, career: coachCareer(x, r) }, user && !!x.fired);
  };

  it("names, the owner's review, taking over a team, and the job market (L11, L19)", () => {
    // every head coach has his own name, the user included
    {
      // these seeds drew two coaches with one name (Quentin Vandermeer twice in seed 7)
      for (const rngSeed of [2, 3, 7]) {
        const l = createLeague({ name: 'c', userTid: 19, coachName: 'Quentin Novak', settings: defaultSettings(), seed: null, rngSeed });
        const names = l.teams.map((t) => (t.tid === l.userTid ? l.coachName : t.coach.name));
        expect(new Set(names).size).toBe(30);
      }
    }

    // the owner fires after the grace period for a bad record, never during it or with job security off
    {
      const l = realLeague();
      const ts = curTeamSeason(l, l.userTid);
      [ts.won, ts.lost, ts.playoffRound] = [15, 67, -1];
      const review = (tenureStart: number, jobSecurity: boolean) => {
        l.fired = false;
        l.ownerMood = { wins: -0.8, playoffs: -0.25, money: 0, total: -0.6 };
        l.tenureStart = tenureStart;
        l.settings.jobSecurity = jobSecurity;
        ownerEvaluation(l);
      };
      // the grace period is the first two seasons in charge
      review(l.season - 1, true);
      expect(l.fired).toBeFalsy();
      review(l.season - 3, false);
      expect(l.fired).toBeFalsy();
      review(l.season - 3, true);
      expect(l.fired).toBe(true);
      expect(l.inbox[0].subject).toBe("You're fired");
      // the third season is the first one that counts
      review(l.season - 2, true);
      expect(l.fired).toBe(true);
    }

    // a fired coach is not reviewed by the owner again; taking over a team clears the old plan and board
    {
      const l = realLeague();
      l.fired = true;
      const mood = { ...l.ownerMood };
      const inbox = l.inbox.length;
      ownerEvaluation(l);
      expect(l.ownerMood).toEqual(mood);
      expect(l.inbox.length).toBe(inbox);
      l.gamePlans = { 3: { oppTid: 3, items: [{ id: 'cov-hedge', label: 'Hedge', patch: { defense: { pnr: 'hedge' } } }] } };
      l.draftBoard = [1, 2, 3];
      takeOverTeam(l, aiTeam(l));
      expect(l.fired).toBe(false);
      expect(l.gamePlans).toBeUndefined();
      expect(l.draftBoard).toBeUndefined();
    }

    // a new job leaves the old job's mail behind, read; the new owner's goals come in unread
    {
      const l = league(13);
      while (standardRoster(l, U).length > 15) releasePlayer(l, standardRoster(l, U)[0], { news: false });
      expect(startRegularSeason(l)).toEqual([]);
      addInbox(l, { from: 'Assistant GM', subject: 'Extension candidates', body: 'x', tone: 'neutral' });
      expect(l.inbox.some((m) => !m.read)).toBe(true);
      takeOverTeam(l, 7);
      const unread = l.inbox.filter((m) => !m.read);
      expect(unread.length).toBeGreaterThan(0);
      expect(unread.every((m) => m.from === 'Owner')).toBe(true);
      expect(l.inbox.find((m) => m.subject === 'Extension candidates')!.read).toBe(true);
    }

    // taking over another team leaves no minute caps or back-to-back rests on the old team's AI-run rotation
    {
      const l = testLeague('takeover-caps');
      const old = l.teams[l.userTid];
      const [a, b] = old.rotation.order;
      old.rotation.caps = { [a]: 24, [b]: 24 };
      old.rotation.restB2B = [a, b];
      takeOverTeam(l, (l.userTid + 1) % l.teams.length);
      expect(old.rotation.caps).toEqual({});
      expect(old.rotation.restB2B).toEqual([]);
      simDay(l);
      expect(old.rotation.caps).toEqual({});
    }

    // a fired user hears from every opening that would rather have him; when none would, the league's two worst records take a chance on him
    const worstTwo = (x: typeof l) =>
      x.teams
        .filter((t) => t.tid !== x.userTid)
        .sort((a, b) => winPct(curTeamSeason(x, a.tid)) - winPct(curTeamSeason(x, b.tid)) || a.tid - b.tid)
        .slice(0, 2)
        .map((t) => t.tid);
    {
      const x = structuredClone(l);
      x.fired = true;
      const moves = hire(x, 4);
      makeJobOffers(x, moves);
      const offers = x.jobOffers!.offers;
      expect(offers.length).toBeGreaterThanOrEqual(1);
      expect(offers.every((o) => o.tid !== x.userTid)).toBe(true);
      const wanted = moves.hired.filter((h) => scoreOf(x, h.tid, true) - scoreOf(x, h.tid, false) >= -0.25).map((h) => h.tid);
      if (wanted.length) {
        expect(offers.map((o) => o.tid).sort()).toEqual(wanted.sort());
        expect(offers.every((o) => o.kind === 'opening')).toBe(true);
      } else expect(offers.map((o) => o.tid)).toEqual(worstTwo(x));
      // the agent says so, and long sims stop for it
      expect(x.inbox.some((m) => m.from === 'Your agent' && m.important && m.link === '/office/career')).toBe(true);
    }

    // with no openings, the league's two worst records take a chance on him, not its best teams
    {
      const x = structuredClone(l);
      x.fired = true;
      makeJobOffers(x, { fired: [], hired: [] });
      const offers = x.jobOffers!.offers;
      expect(offers.map((o) => o.tid)).toEqual(worstTwo(x));
      expect(offers.every((o) => o.kind === 'change')).toBe(true);
    }

    // a user with a job is approached only after two seasons, by an opening that rates him clearly above its hire
    {
      const x = structuredClone(l);
      makeJobOffers(x, hire(x, 6));
      // his first season in charge: nobody calls
      expect(x.jobOffers).toBeUndefined();
      x.tenureStart = x.season - 2;
      const moves = hire(x, 6);
      makeJobOffers(x, moves);
      const want = moves.hired
        .map((h) => ({ tid: h.tid, edge: scoreOf(x, h.tid, true) - scoreOf(x, h.tid, false) }))
        .filter((h) => h.edge >= 0.4)
        .sort((a, b) => b.edge - a.edge)
        .map((h) => h.tid);
      expect((x.jobOffers?.offers ?? []).map((o) => o.tid)).toEqual(want.slice(0, 2));
      expect((x.jobOffers?.offers ?? []).every((o) => o.kind === 'approach')).toBe(true);
    }

    // taking a job is a takeover: the other offers go, the news calls it a hiring, the registry stays whole
    {
      const x = structuredClone(l);
      x.fired = true;
      const old = x.userTid;
      makeJobOffers(x, hire(x, 3));
      const offer = x.jobOffers!.offers[0];
      const displaced = activeCoach(x, offer.tid)!;
      // only an offer is a way in (god mode can put him anywhere)
      const other = x.teams.find((t) => t.tid !== x.userTid && !x.jobOffers!.offers.some((o) => o.tid === t.tid))!.tid;
      expect(takeJob(x, other)).toMatch(/haven't offered you the job/);
      expect(x.userTid).toBe(old);
      // his reputation comes with him: part of the standing that got him fired
      x.ownerMood.total = -0.8;
      expect(takeJob(x, offer.tid)).toBeNull();
      expect(x.ownerMood.total).toBe(-0.3);
      expect(x.userTid).toBe(offer.tid);
      expect(x.fired).toBe(false);
      expect(x.jobOffers).toBeUndefined();
      expect(registryProblems(x)).toEqual([]);
      // the coach in charge there takes the user's old job
      expect(openStint(displaced)?.tid).toBe(old);
      expect(x.news.some((n) => n.kind === 'coach' && n.text.startsWith(`The ${x.teams[offer.tid].name} hired ${x.coachName}`))).toBe(true);
      // and the season can go on to the draft
      expect(startDraft(x)).toBe(true);
    }

    // an offer turned down goes; the draft ends them; saves keep them and drop damaged ones
    {
      const x = structuredClone(l);
      x.fired = true;
      makeJobOffers(x, hire(x, 4));
      expect(migrate(structuredClone(x)).jobOffers).toEqual(x.jobOffers);
      const bad = structuredClone(x) as unknown as { jobOffers: { offers: unknown[] } };
      bad.jobOffers.offers.push({ tid: x.userTid, kind: 'opening', note: 'x' });
      expect(migrate(bad).jobOffers).toBeUndefined();
      for (const o of [...x.jobOffers!.offers]) declineJob(x, o.tid);
      expect(x.jobOffers).toBeUndefined();
      // a user with a job and a standing approach: the draft ends it
      const y = structuredClone(l);
      y.jobOffers = { season: y.season, offers: [{ tid: (y.userTid + 1) % 30, kind: 'approach', note: 'call' }] };
      expect(startDraft(y)).toBe(true);
      expect(y.jobOffers).toBeUndefined();
    }
  }, 180_000);
});
