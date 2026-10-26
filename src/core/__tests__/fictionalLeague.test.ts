// Two seasons of a fictional league. The coaching carousel and coach histories: a registry that stays
// in step with the teams' coaches through seasons, offseasons and takeovers (one open job per team,
// held by its coach; the user's with his team; unique names), records that add up to the teams'
// seasons (a mid-season takeover splits one at the day it happened), a few firings and hirings a
// season that never draw on the league's random stream, Coach of the Year credited to the right man,
// renames, and saves. And a season start to finish: the NBA Cup's draw, knockouts and carry-over, the
// champion and the awards, the press over the season, the front page, the draft and the rollover;
// trades checked against value and the roster limits.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { autoDraftUserPick, finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { nextPick } from '../league/draft';
import { stockMove } from '../league/prospects';
import { cupTables } from '../league/cup';
import { curTeamSeason, dayToDate, freeAgents, prospects, standardRoster, teamPlayers } from '../league/helpers';
import { askingContract, releasePlayer, valueScore } from '../league/contracts';
import { userOffer } from '../league/freeAgency';
import { takeOverTeam } from '../league/owner';
import { evaluateTrade, validateTrade } from '../league/trades';
import { makeItWork } from '../league/tradeHelp';
import { BODIES_KEPT, seasonHonors } from '../league/media';
import {
  FULL_SEASONS,
  activeCoach,
  coachCareer,
  coachingCarousel,
  coachNameTaken,
  coachStatus,
  coyWinners,
  openStint,
  registryProblems,
  renameUserCoach,
  seasonOver,
  stintSeasons,
  userCoach,
  type CoachRecord,
} from '../league/coaches';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import { CAP } from '../constants';
import type { GameResult, League, NewsItem } from '../types';

const inSeason = (l: League) => ['regular', 'playin', 'playoffs'].includes(l.phase);

/** The user's roster to 13-15 (the cheapest cut, the best free agent who'll sign) and the season started. */
function start(l: League) {
  const std = () => standardRoster(l, l.userTid);
  while (std().length > CAP.rosterMax) releasePlayer(l, std().sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  for (const p of freeAgents(l).sort((a, b) => b.ovr - a.ovr)) {
    if (std().length >= CAP.rosterMin) break;
    userOffer(l, p.pid, askingContract(l, p, l.userTid).amount, 1);
  }
  const errs = startRegularSeason(l);
  if (errs.length) throw new Error(errs.join('; '));
}

/** Each team season's record, summed over the coaches' seasons with it, and how many of them its playoff run went to. */
function coachedSeasons(l: League) {
  const out = new Map<string, { won: number; lost: number; runs: number }>();
  for (const r of l.coaches!)
    for (const s of r.stints)
      for (const x of stintSeasons(l, s)) {
        const key = `${x.tid}:${x.season}`;
        const o = out.get(key) ?? { won: 0, lost: 0, runs: 0 };
        o.won += x.won;
        o.lost += x.lost;
        if (x.round !== undefined) o.runs++;
        out.set(key, o);
      }
  return out;
}

/** Every team season's record is its coaches' (to the game), and once it's over its playoff run went to one of them (before, at most one). */
function expectRecordsAddUp(l: League) {
  const got = coachedSeasons(l);
  for (const t of l.teams)
    for (const ts of t.seasons) {
      if (ts.won + ts.lost === 0) continue;
      const g = got.get(`${t.tid}:${ts.season}`);
      expect({ won: g?.won, lost: g?.lost }, `${t.abbrev} ${ts.season}`).toEqual({ won: ts.won, lost: ts.lost });
      if (ts.season < l.season || seasonOver(l, t.tid)) expect(g?.runs, `${t.abbrev} ${ts.season}`).toBe(1);
      else expect(g!.runs).toBeLessThanOrEqual(1);
    }
}

/** A finished regular schedule: 1,230 games, 82 a team, 40-42 at home, never two on a day or three in three days. */
function checkFinalSchedule(league: League) {
  const regular = league.schedule.filter((g) => g.type === 'regular');
  expect(regular).toHaveLength(1230);
  for (const t of league.teams) {
    const mine = regular.filter((g) => g.home === t.tid || g.away === t.tid);
    expect(mine).toHaveLength(82);
    const homes = mine.filter((g) => g.home === t.tid).length;
    expect(homes).toBeGreaterThanOrEqual(40);
    expect(homes).toBeLessThanOrEqual(42);
    const days = league.schedule
      .filter((g) => g.home === t.tid || g.away === t.tid)
      .map((g) => g.day)
      .sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
  }
}

describe('two seasons of a fictional league', () => {
  const SEASONS = 2;
  const userTid = 3;
  let l: League;
  /** The league as created, and 25 days into its first season. */
  let created: League;
  let day25: League;
  const problems: string[] = [];
  const moves: { season: number; fired: number; hired: number; first: number }[] = [];
  /** The league on the morning of each season's last playoff day, and right after each season's playoffs. */
  const finals: League[] = [];
  const ends: League[] = [];
  /** The first season the day after the Cup final, its front pages for the user, its draft class, and the next season before opening night. */
  let afterCup: League;
  let frontPages: NewsItem[] | undefined;
  let rookies = 0;
  let rolled: League;

  beforeAll(() => {
    // (the user keeps his job: the owner's review is tested elsewhere)
    l = createLeague({ name: 'carousel', userTid, coachName: 'The User', settings: { ...defaultSettings(), jobSecurity: false }, seed: null, rngSeed: 21 });
    l.id = 'carousel_test';
    created = structuredClone(l);
    const check = () => problems.push(...registryProblems(l).map((p) => `${l.season} ${l.phase}: ${p}`));
    for (let s = 0; s < SEASONS; s++) {
      start(l);
      check();
      let morning: League | undefined;
      for (let g = 0; inSeason(l) && g < 500; g++) {
        if (s === 0 && g === 25) day25 = structuredClone(l);
        if (s === 0 && !afterCup && l.day > l.cup!.finalDay + 1) afterCup = structuredClone(l);
        // the Finals are on: keep the morning, which may be the last day
        if (l.phase === 'playoffs' && l.playoffs.some((x) => x.round === 4)) morning = structuredClone(l);
        simDay(l);
        if (s === 0 && !frontPages && l.phase !== 'regular')
          frontPages = l.news.filter((n) => n.kind === 'game' && n.tids[0] === l.userTid && n.weight === 3 && n.day <= l.regularSeasonDays);
        if (l.day % 40 === 0) check();
      }
      check();
      finals.push(morning!);
      const news = l.news.filter((n) => n.kind === 'coach' && n.season === l.season);
      moves.push({
        season: l.season,
        fired: news.filter((n) => / (fired|parted ways with) /.test(n.text)).length,
        hired: news.filter((n) => / hired /.test(n.text)).length,
        first: news.filter((n) => n.text.includes('first-time')).length,
      });
      ends.push(structuredClone(l));
      startDraft(l);
      for (let g = 0; nextPick(l) && g < 100; g++) autoDraftUserPick(l);
      finishDraftPhase(l);
      if (s === 0) rookies = Object.values(l.players).filter((p) => p.draft.year === l.season && p.draft.round > 0).length;
      startFreeAgency(l);
      newSeason(l);
      if (s === 0) rolled = structuredClone(l);
      check();
    }
  }, 600_000);

  it('runs the coaching carousel: a registry in step with the teams, records that add up, a few firings a season off the random stream, Coach of the Year, renames, takeovers and saves', async () => {
    // a new league starts the registry: every team's coach in charge from the first season, the user's flagged, no two names alike
    {
      const l = created;
      expect(registryProblems(l)).toEqual([]);
      expect(l.coaches).toHaveLength(30);
      for (const t of l.teams) {
        const r = activeCoach(l, t.tid)!;
        expect(r.name).toBe(t.coach.name);
        expect(r.stints).toEqual([{ tid: t.tid, from: l.startSeason }]);
      }
      expect(userCoach(l)).toMatchObject({ name: 'The User', user: true, stints: [{ tid: userTid, from: l.startSeason }] });
      // compact: about 100 bytes a coach
      expect(JSON.stringify(l.coaches).length).toBeLessThan(30 * 130);
    }

    // it keeps the registry in step with the teams through every phase
    expect(problems).toEqual([]);
    expect(registryProblems(l)).toEqual([]);

    // it fires and hires a few coaches a season, never the user, and every opening is filled
    {
      const fired = moves.reduce((a, m) => a + m.fired, 0);
      // about 3-6 a season (the NBA averages about 6); the first offseason reviews everyone at half the odds
      expect(fired).toBeGreaterThanOrEqual(3);
      expect(fired).toBeLessThanOrEqual(14);
      for (const m of moves) {
        expect(m.hired, String(m.season)).toBe(m.fired);
        expect(m.fired, String(m.season)).toBeLessThanOrEqual(10);
      }
      // some openings go to first-time head coaches, with new names
      expect(moves.reduce((a, m) => a + m.first, 0)).toBeGreaterThan(0);
      expect(l.coaches!.length).toBeGreaterThan(30);
      const me = userCoach(l)!;
      expect(me.stints).toEqual([{ tid: userTid, from: l.startSeason }]);
      expect(l.teams[userTid].coach.name).toBe('The User');
    }

    // a coach's record is his teams' seasons: every team season adds up, its playoff run counted once
    expectRecordsAddUp(l);
    for (const r of l.coaches!) {
      const k = coachCareer(l, r);
      expect(k.won + k.lost).toBe(k.lines.reduce((a, x) => a + x.won + x.lost, 0));
      expect(k.titles).toBe(k.lines.filter((x) => x.round === 5).length);
    }
    // a champion a season, a title a season
    expect(l.coaches!.reduce((a, r) => a + coachCareer(l, r).titles, 0)).toBe(SEASONS);

    // a fired coach had two full seasons (one for the first coaches), his job ends with the season and its playoff run
    {
      const ended = l.coaches!.flatMap((r) => r.stints.filter((s) => s.to && !r.user).map((s) => ({ r, s })));
      expect(ended.length).toBeGreaterThan(0);
      for (const { s } of ended) {
        expect(s.to!.post).toBe(true);
        const ts = l.teams[s.tid].seasons.find((x) => x.season === s.to!.season)!;
        expect(s.to!.wl).toEqual([ts.won, ts.lost]);
        const full = s.to!.season - s.from + 1;
        expect(full).toBeGreaterThanOrEqual(s.from === l.startSeason ? FULL_SEASONS - 1 : FULL_SEASONS);
      }
      // the next coach starts with the next season
      for (const { s } of ended) {
        const next = l.coaches!.flatMap((r) => r.stints).find((x) => x.tid === s.tid && x.from === s.to!.season + 1);
        expect(next, `${l.teams[s.tid].abbrev} after ${s.to!.season}`).toBeDefined();
      }
    }

    // it keeps names unique, and a coach out of work five seasons is retired
    {
      const names = l.coaches!.map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);
      const out = (last: number): CoachRecord => ({
        id: 0,
        name: 'X',
        off: 'balanced',
        def: 'drop',
        dev: 50,
        tac: 50,
        stints: [{ tid: 0, from: 2027, to: { season: last, wl: [40, 42], post: true } }],
      });
      expect(coachStatus(l, out(l.season - 4))).toBe('available');
      expect(coachStatus(l, out(l.season - 5))).toBe('retired');
      for (const r of l.coaches!) expect(coachStatus(l, r)).toBe(openStint(r) ? 'active' : 'available');
    }

    // it never draws on the league's random stream: the playoffs end with the same state with or without it
    {
      let fired = 0;
      for (const [i, morning] of finals.entries()) {
        // the carousel on its own leaves the league's stream where it was
        const direct = structuredClone(morning);
        const before = direct.rng;
        coachingCarousel(direct);
        expect(direct.rng).toBe(before);
        // and the last day of the playoffs, with every AI coach made too new to fire, ends on the same state
        const a = structuredClone(morning);
        const b = structuredClone(morning);
        for (const r of b.coaches!) {
          const s = openStint(r);
          if (s && !r.user) Object.assign(s, { from: b.season, at: [0, 0] });
        }
        let days = 0;
        while (a.phase === 'playoffs' && days++ < 3) {
          simDay(a);
          simDay(b);
        }
        expect(a.phase, `season ${i}`).toBe('draftLottery');
        expect(b.rng).toBe(a.rng);
        const changes = (x: League) => x.news.filter((n) => n.kind === 'coach' && n.season === x.season).length;
        expect(changes(b)).toBe(0);
        fired += changes(a);
      }
      expect(fired).toBeGreaterThan(0);
    }

    // it credits each Coach of the Year to the coach who had that team
    {
      const coy = coyWinners(l);
      for (const aw of l.awards.filter((a) => a.coy !== undefined)) {
        const r = l.coaches!.find((c) => c.id === coy.get(aw.season))!;
        expect(r.name).toBe(aw.coyCoach);
        expect(r.stints.some((s) => s.tid === aw.coy && s.from <= aw.season && (!s.to || s.to.season >= aw.season))).toBe(true);
        expect(coachCareer(l, r, coy).coy).toContain(aw.season);
      }
    }

    // a fired user keeps his job open until he takes over a team; then both coaches' jobs start next season
    {
      const x = structuredClone(ends[SEASONS - 1]);
      x.fired = true;
      expect(registryProblems(x)).toEqual([]);
      const me = userCoach(x)!;
      expect(openStint(me)!.tid).toBe(userTid);
      const to = x.teams.find((t) => t.tid !== userTid && !activeCoach(x, t.tid)!.stints.some((s) => s.from > x.season))!.tid;
      const them = activeCoach(x, to)!;
      const theirs = openStint(them)!;
      const profile = { ...x.teams[to].coach };
      takeOverTeam(x, to);
      expect(registryProblems(x)).toEqual([]);
      expect(openStint(me)).toEqual({ tid: to, from: x.season + 1 });
      const old = me.stints[me.stints.length - 2];
      expect(old.to).toEqual({ season: x.season, wl: [curTeamSeason(x, userTid).won, curTeamSeason(x, userTid).lost], post: true });
      // he takes the old job with his own profile, and a playbook from his own roots
      expect(theirs.to?.post).toBe(true);
      expect(openStint(them)).toEqual({ tid: userTid, from: x.season + 1 });
      expect(x.teams[userTid].coach).toEqual(profile);
      expect(x.teams[userTid].tactics.manual).toBe(false);
      expect(x.teams[to].coach.name).toBe('The User');
      expectRecordsAddUp(x);
    }

    // it renames the user everywhere, refuses a name another coach has had, and keeps his Coach of the Year
    {
      const x = structuredClone(l);
      const other = x.coaches!.find((r) => !r.user)!.name;
      expect(coachNameTaken(x, other)).toBe(true);
      expect(renameUserCoach(x, other)).toBe(false);
      expect(x.coachName).toBe('The User');
      // a Coach of the Year he won under his old name stays his
      const aw = x.awards[0];
      Object.assign(aw, { coy: userTid, coyCoach: 'The User' });
      expect(renameUserCoach(x, 'New Name')).toBe(true);
      expect(registryProblems(x)).toEqual([]);
      expect(userCoach(x)!.name).toBe('New Name');
      expect(x.teams[userTid].coach.name).toBe('New Name');
      expect(coachCareer(x, userCoach(x)!).coy).toContain(aw.season);
      // his old name stays with him: no new coach is given it, so an award that named him can't go to one
      expect(userCoach(x)!.aka).toEqual(['The User']);
      const ai = x.coaches!.find((r) => !r.user)!;
      const before = ai.name;
      ai.name = 'The User';
      expect(coyWinners(x).get(aw.season)).toBe(userCoach(x)!.id);
      ai.name = before;
      // and he can take it back: the name he leaves is the one kept
      expect(renameUserCoach(x, 'The User')).toBe(true);
      expect(userCoach(x)!.aka).toEqual(['New Name']);
      expect(coachCareer(x, userCoach(x)!).coy).toContain(aw.season);
      // former names survive a save
      expect(migrate(structuredClone(x)).coaches).toEqual(x.coaches);
    }

    // the registry survives a save; a save from before the registry, or a damaged one, starts it again from the coaches in charge
    {
      await saveLeague(l);
      const back = (await loadLeague(l.id))!;
      expect(back.coaches).toEqual(l.coaches);
      const fresh = (x: League, userFrom: number) => {
        expect(registryProblems(x)).toEqual([]);
        for (const t of x.teams) expect(openStint(activeCoach(x, t.tid)!)).toEqual({ tid: t.tid, from: t.tid === x.userTid ? userFrom : x.startSeason });
        expect(x.coaches).toHaveLength(30);
      };
      const old = structuredClone(l);
      delete old.coaches;
      old.tenureStart = old.season - 1;
      fresh(migrate(old), old.season - 1);
      const damaged = structuredClone(l);
      (damaged.coaches![0] as unknown as { stints: unknown }).stints = 'lots';
      fresh(migrate(damaged), damaged.startSeason);
      // out of step with the teams (two coaches in charge of one) counts as damaged too
      const twice = structuredClone(l);
      const extra: CoachRecord = { ...structuredClone(activeCoach(twice, 0)!), id: 999, name: 'Some Body' };
      twice.coaches!.push(extra);
      fresh(migrate(twice), twice.startSeason);
      // a save from before the registry where two coaches share a name: the later one gets a new name
      const dup = structuredClone(l);
      delete dup.coaches;
      dup.teams[8].coach.name = dup.teams[7].coach.name;
      // ...and a Coach of the Year the renamed one won under the shared name stays his, as does the other's
      const [early, late] = dup.awards;
      Object.assign(early, { coy: 8, coyCoach: dup.teams[7].coach.name });
      Object.assign(late, { coy: 7, coyCoach: dup.teams[7].coach.name });
      const fixed = migrate(dup);
      expect(registryProblems(fixed)).toEqual([]);
      expect(fixed.teams[7].coach.name).toBe(l.teams[7].coach.name);
      expect(fixed.teams[8].coach.name).not.toBe(fixed.teams[7].coach.name);
      expect(coyWinners(fixed).get(early.season)).toBe(activeCoach(fixed, 8)!.id);
      expect(coyWinners(fixed).get(late.season)).toBe(activeCoach(fixed, 7)!.id);
    }

    // a takeover in the middle of a season splits the season between the coaches at the day it happened, and the displaced coach takes the user's old job
    {
      const l = structuredClone(day25);
      const from = l.userTid;
      const to = (from + 5) % 30;
      const a = { ...curTeamSeason(l, from) };
      const b = { ...curTeamSeason(l, to) };
      expect(a.won + a.lost).toBeGreaterThan(0);
      const them = activeCoach(l, to)!;
      takeOverTeam(l, to);
      expect(registryProblems(l)).toEqual([]);
      const me = userCoach(l)!;
      expect(me.stints).toEqual([
        { tid: from, from: l.season, to: { season: l.season, wl: [a.won, a.lost] } },
        { tid: to, from: l.season, at: [b.won, b.lost] },
      ]);
      expect(them.stints).toEqual([
        { tid: to, from: l.season, to: { season: l.season, wl: [b.won, b.lost] } },
        { tid: from, from: l.season, at: [a.won, a.lost] },
      ]);
      for (let i = 0; i < 25; i++) simDay(l);
      const a2 = curTeamSeason(l, from);
      const b2 = curTeamSeason(l, to);
      const k = coachCareer(l, me);
      expect([k.won, k.lost]).toEqual([a.won + b2.won - b.won, a.lost + b2.lost - b.lost]);
      expect(k.seasons).toBe(1);
      expect(k.lines.every((x) => x.part)).toBe(true);
      const t = coachCareer(l, them);
      expect([t.won, t.lost]).toEqual([b.won + a2.won - a.won, b.lost + a2.lost - a.lost]);
      expectRecordsAddUp(l);
      // a job taken and left again before a game leaves nothing behind
      takeOverTeam(l, (to + 1) % 30);
      takeOverTeam(l, (to + 2) % 30);
      expect(registryProblems(l)).toEqual([]);
      expect(me.stints.map((s) => s.tid)).toEqual([from, to, (to + 2) % 30]);
      expectRecordsAddUp(l);
    }
  }, 300_000);

  it('plays a season start to finish: the Cup, the champion and awards, the press, the front page, the draft and the rollover; trades by value and roster limits', () => {
    // the NBA Cup draws six groups of five within each conference, everyone hosting two group games on Cup nights
    {
      const league = created;
      const cup = league.cup!;
      expect(cup.groups).toHaveLength(6);
      const all = cup.groups.flatMap((g) => g.tids);
      expect(new Set(all).size).toBe(30);
      for (const g of cup.groups) {
        expect(g.tids).toHaveLength(5);
        for (const tid of g.tids) expect(league.teams[tid].conf).toBe(g.conf);
      }
      const groupGames = league.schedule.filter((g) => g.cup === 'group');
      expect(groupGames).toHaveLength(60);
      for (const tid of all) {
        expect(groupGames.filter((g) => g.home === tid)).toHaveLength(2);
        expect(groupGames.filter((g) => g.away === tid)).toHaveLength(2);
      }
      for (const g of groupGames) {
        expect(cup.nights).toContain(g.day);
        expect([2, 5]).toContain(dayToDate(league.season, g.day).getUTCDay()); // Tuesdays and Fridays
        const grp = cup.groups.find((x) => x.tids.includes(g.home))!;
        expect(grp.tids).toContain(g.away);
      }
    }

    // it plays the knockouts, crowns a champion and leaves every team on 82 games
    {
      const league = afterCup;
      const cup = league.cup!;
      expect(cup.seeds!.E).toHaveLength(4);
      expect(cup.seeds!.W).toHaveLength(4);
      // seeds 1-3 are group winners, seed 4 a runner-up
      const tables = cupTables(league);
      const rankOf = (tid: number) => tables.flatMap((t) => t.rows).find((r) => r.tid === tid)!.rank;
      for (const conf of ['E', 'W'] as const) {
        expect(cup.seeds![conf].slice(0, 3).map(rankOf)).toEqual([1, 1, 1]);
        expect(rankOf(cup.seeds![conf][3])).toBe(2);
      }
      expect(cup.bracket.filter((t) => t.round === 'qf')).toHaveLength(4);
      expect(cup.bracket.filter((t) => t.round === 'sf')).toHaveLength(2);
      const final = cup.bracket.find((t) => t.round === 'final')!;
      expect(final.winner).toBeDefined();
      expect(league.teams[final.high].conf).not.toBe(league.teams[final.low].conf);
      expect(cup.champion).toBe(final.winner);
      const aw = league.awards.find((a) => a.season === league.season)!;
      expect(aw.cupWinner).toBe(cup.champion);
      expect(aw.cupMvp).toBeDefined();
      expect(league.players[aw.cupMvp!].awards.some((a) => a.type === 'NBA Cup MVP')).toBe(true);
      checkFinalSchedule(league);

      // the championship doesn't count: records only include regular-season games
      const res = league.games.find((g) => g.gid === final.gid) as GameResult;
      expect(res.type).toBe('cup');
      for (const tid of [final.high, final.low]) {
        const ts = curTeamSeason(league, tid);
        const played = league.schedule.filter((g) => g.type === 'regular' && g.played && (g.home === tid || g.away === tid)).length;
        expect(ts.won + ts.lost).toBe(played);
      }
      const champStar = res.home.players.find((b) => b.min > 0)!;
      const statGames = league.players[champStar.pid].stats.filter((s) => s.season === league.season).reduce((a, s) => a + s.gp, 0);
      const counted = league.games.filter((g) => g.type === 'regular' && [...g.home.players, ...g.away.players].some((b) => b.pid === champStar.pid && b.min > 0)).length;
      expect(statGames).toBe(counted);
    }

    // a full season crowns a champion and hands out the awards
    const league = ends[0];
    expect(league.phase).toBe('draftLottery');
    const wins = league.teams.reduce((a, t) => a + curTeamSeason(league, t.tid).won, 0);
    expect(wins).toBe(1230);
    const aw = league.awards.find((a) => a.season === league.season)!;
    expect(aw.champion).toBeDefined();
    expect(aw.mvp).toBeDefined();
    expect(aw.allNba.flat().length).toBe(15);

    // the press honors the last month, previews every round and the Finals, wraps the season, and keeps its size
    {
      const m = league.media!;
      // each round previewed once, and the season wrapped
      expect(m.done?.keys).toEqual(expect.arrayContaining(['surprises', 'midseason', 'r1', 'r2', 'r3', 'r4', 'wrap']));
      expect(league.news.some((n) => n.kind === 'preview' && n.weight === 3 && n.head?.includes('Finals'))).toBe(true);
      // the monthly honors close out the regular season too, once
      expect(m.month?.done).toBe(true);
      const months = new Set(
        seasonHonors(league)
          .filter((h) => h.kind === 'potm')
          .map((h) => h.day),
      );
      expect(months.size).toBeGreaterThanOrEqual(5);
      expect(Math.max(...months)).toBeGreaterThan(league.regularSeasonDays - 5);
      // proportion: front pages are the exception
      const press = league.news.filter((n) => n.head && n.kind !== 'game');
      expect(press.filter((n) => n.weight === 3).length).toBeLessThan(press.length / 3);
      // front pages about the user's team stop a long sim: the press keeps its own to a handful (game day's and the career's are theirs)
      const PRESS = ['power', 'honor', 'column', 'preview', 'rumor', 'trade'];
      const mineBig = league.news.filter(
        (n) => n.weight === 3 && PRESS.includes(n.kind) && (n.tids.includes(league.userTid) || n.pids.some((pid) => league.players[pid]?.tid === league.userTid)),
      );
      expect(mineBig.length).toBeLessThanOrEqual(5);
      // and the save stays sane: bodies only on the latest stories, roundups a fortnight
      expect(league.news.filter((n) => n.body).length).toBeLessThanOrEqual(BODIES_KEPT);
      expect(league.news.filter((n) => n.text.startsWith('Around the league')).every((n) => n.day >= league.day - 15)).toBe(true);
      expect(JSON.stringify(m).length).toBeLessThan(30_000);
      // a season of injuries doesn't push the Cup out of the news
      expect(league.news.some((n) => n.season === league.season && (n.head ?? n.text).includes('win the NBA Cup'))).toBe(true);
    }

    // the user's games make the front page on a handful of nights of a fictional league's regular season
    expect(frontPages).toBeDefined();
    expect(frontPages!.length, frontPages!.map((n) => n.head).join(' | ')).toBeLessThanOrEqual(8);

    // the class lived through the season (prospects.ts): five monthly moves and the combine, risers
    // and fallers on the board, the news of the big ones, the user's mail about them kept sparing,
    // and the staff's scouts on the prospects near his pick
    {
      const cls = prospects(league, league.season);
      expect(league.scouting).toMatchObject({ season: league.season, moves: 5, combine: true });
      expect(cls.filter((p) => p.prospect?.moves?.length).length).toBeGreaterThan(cls.length / 4);
      expect(cls.filter((p) => stockMove(p)).length).toBeGreaterThan(cls.length / 2);
      const stock = league.news.filter((n) => n.season === league.season && n.text.startsWith('Draft stock'));
      expect(stock.length).toBeGreaterThan(0);
      expect(stock.length).toBeLessThanOrEqual(10);
      const mail = league.inbox.filter((m) => m.season === league.season && m.from === 'Scouting Department');
      expect(mail.length).toBeLessThanOrEqual(8);
      expect(Object.values(league.scouting!.looks).reduce((a, d) => a + d, 0)).toBeGreaterThan(200);
      expect(cls.every((p) => p.prospect?.combine)).toBe(true);
    }

    // it drafts and rolls over: two rounds of rookies, 80 games per team up front (the NBA Cup knockout window adds the last two per team)
    expect(rookies).toBe(60);
    expect(rolled.season).toBe(2028);
    expect(rolled.schedule.length).toBe(1200);
    expect(rolled.cup?.season).toBe(2028);
    for (const t of rolled.teams) if (t.tid !== rolled.userTid) expect(teamPlayers(rolled, t.tid).length).toBeGreaterThanOrEqual(CAP.rosterMin);

    // the Cup carries into the next season with a fresh draw seeded by record
    expect(rolled.cup!.season).toBe(rolled.season);
    expect(rolled.cup!.champion).toBeUndefined();
    expect(rolled.awards.find((a) => a.season === rolled.season - 1)!.cupWinner).toBe(afterCup.cup!.champion);
    // pots: the three best teams of last season in each conference are in different groups
    for (const conf of ['E', 'W'] as const) {
      const best = rolled.teams
        .filter((t) => t.conf === conf)
        .map((t) => ({ tid: t.tid, pct: t.seasons.find((s) => s.season === rolled.season - 1)!.won }))
        .sort((a, b) => b.pct - a.pct);
      const top = best.slice(0, 3);
      // only meaningful without ties at the pot boundary
      if (best[2].pct !== best[3].pct) {
        const groupOf = (tid: number) => rolled.cup!.groups.find((g) => g.tids.includes(tid))!.id;
        expect(new Set(top.map((x) => groupOf(x.tid))).size).toBe(3);
      }
    }

    // trades: lopsided deals are rejected and a fair version can be found
    {
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 4 });
      const [us, them] = [0, 1];
      const mine = teamPlayers(league, us).sort((a, b) => a.ovr - b.ovr);
      const theirs = teamPlayers(league, them).sort((a, b) => b.ovr - a.ovr);
      const offer = { a: { tid: us, pids: [mine[0].pid], dpids: [] }, b: { tid: them, pids: [theirs[0].pid], dpids: [] } };
      const ev = evaluateTrade(league, offer);
      expect(ev.accept).toBe(false);
      const fixed = makeItWork(league, offer).offer;
      if (fixed) expect(evaluateTrade(league, fixed).accept).toBe(true);
      // roster limits: 15 is the in-season limit (the offseason allows 21)
      const three = {
        a: { tid: us, pids: [], dpids: [] },
        b: {
          tid: them,
          pids: teamPlayers(league, them)
            .slice(0, 3)
            .map((p) => p.pid),
          dpids: [],
        },
      };
      league.phase = 'regular';
      if (teamPlayers(league, us).length + 3 > CAP.rosterMax) expect(validateTrade(league, three).some((e) => e.includes('max'))).toBe(true);
    }
  });
});
