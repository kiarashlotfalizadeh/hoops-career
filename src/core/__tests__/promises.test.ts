// Meeting a player who asked for a trade (or is unhappy): the promises a GM can make him (a
// bigger role, a trade, patience), how each is kept or broken over the games that follow, and what
// it does to his mood, his request and the locker room. Games are written straight into the league
// where a test needs exact minutes; one test runs the real daily loop.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { curTeamSeason, standardRoster } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { executeTrade } from '../league/trades';
import {
  MEET_DAYS,
  PATIENCE_GAMES,
  ROLE_GAMES,
  lockerRoomPerf,
  meetBlockedReason,
  meetPlayer,
  patienceOdds,
  promiseStatus,
  resolvePromises,
  seasonsWithTeam,
  updateMorale,
} from '../league/morale';
import { archetype } from '../ratings';
import type { GameResult, League, Player } from '../types';

const U = 0;
const AI = 1;

/** A started season, and the user's best player asking for a trade. */
function setup(seed = 5): { l: League; p: Player } {
  const l = createLeague({ name: `promise${seed}`, userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: seed });
  // a fixed id: the other coaches' game plans and the answers to meetings are drawn from it
  l.id = `promise${seed}`;
  l.settings.difficulty = 'normal';
  expect(startRegularSeason(l)).toEqual([]);
  const p = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr)[0];
  p.ovr = Math.max(p.ovr, 76);
  p.mood.score = -7;
  p.mood.tradeRequest = true;
  p.mood.expectedMin = 30;
  return { l, p };
}

type Night = number | 'hurt' | 'rest';

/** The user's team plays one game a day: his minutes each night (0: the coach's decision), then the daily check. */
function play(l: League, p: Player, nights: Night[]) {
  for (const m of nights) {
    const line = {
      pid: p.pid,
      min: typeof m === 'number' ? m : 0,
      dnp: m === 'hurt' ? 'Injured (Ankle Sprain)' : m === 'rest' ? 'Rest' : m === 0 ? "Coach's decision" : undefined,
    };
    l.games.push({
      gid: l.nextGid++,
      season: l.season,
      day: l.day,
      type: 'regular',
      home: { tid: l.userTid, players: [line] },
      away: { tid: AI, players: [] },
    } as unknown as GameResult);
    l.day++;
    resolvePromises(l);
  }
}

const mail = (l: League, subject: string) => l.inbox.find((m) => m.subject === subject);

describe('meeting a player who wants out', () => {
  it('is for your players who asked out or are unhappy, once every two weeks, never while a promise is open', () => {
    const { l, p } = setup();
    expect(meetBlockedReason(l, p)).toBeNull();
    const fine = standardRoster(l, U).find((x) => x !== p)!;
    fine.mood.score = 1;
    fine.mood.tradeRequest = false;
    expect(meetBlockedReason(l, fine)).toBe(`${fine.lastName} has nothing to raise with you.`);
    // unhappy is enough to talk (not to be promised a trade)
    fine.mood.score = -3.5;
    expect(meetBlockedReason(l, fine)).toBeNull();
    expect(meetPlayer(l, fine.pid, 'trade')).toEqual({ ok: false, text: `${fine.lastName} hasn't asked for a trade.` });
    const theirs = standardRoster(l, AI)[0];
    theirs.mood.tradeRequest = true;
    expect(meetPlayer(l, theirs.pid, 'patience').ok).toBe(false);
    // a promise is open: no other meeting until it's settled
    expect(meetPlayer(l, p.pid, 'role').ok).toBe(true);
    expect(meetBlockedReason(l, p)).toBe(`Promised a bigger role: 0 of ${ROLE_GAMES} games played; he expects about 30.`);
    expect(meetPlayer(l, p.pid, 'patience').ok).toBe(false);
    // after a meeting with nothing promised (he refused to be patient), two weeks
    const q = refusing(l, fine);
    expect(q.agreed).toBe(false);
    expect(meetBlockedReason(l, fine)).toMatch(new RegExp(`^You met ${fine.lastName} on .+: he'll talk again from .+\\.$`));
    l.day += MEET_DAYS;
    expect(meetBlockedReason(l, fine)).toBeNull();
  });

  it("a bigger role, kept: he holds off while you play him what he expects over his next 15 games (games he misses hurt or rested don't count)", () => {
    const { l, p } = setup();
    const before = p.mood.score;
    expect(meetPlayer(l, p.pid, 'role')).toEqual({ ok: true, text: `${p.lastName} will hold off. Play him about 30 minutes a night over his next ${ROLE_GAMES} games.` });
    expect([p.mood.tradeRequest, p.promise?.kind, p.promise?.minutes]).toEqual([false, 'role', 30]);
    // still miserable after a week, but holding off: no new request while it runs
    const ts = curTeamSeason(l, U);
    [ts.won, ts.lost] = [10, 14];
    updateMorale(l, U);
    p.mood.score = -7;
    updateMorale(l, U);
    expect(p.mood.tradeRequest).toBe(false);
    play(l, p, [31, 32, 'hurt', 'hurt', 30, 29, 33, 'rest', 31, 30, 32, 30, 31, 29, 30]);
    expect(p.promise?.kind).toBe('role');
    expect(promiseStatus(l, p)).toMatch(/^Promised a bigger role: 12 of 15 games played, 30\.\d minutes a night; he expects about 30\.$/);
    play(l, p, [31, 30, 32]);
    expect(p.promise).toBeUndefined();
    expect(p.mood.tradeRequest).toBe(false);
    expect(p.mood.score).toBeGreaterThan(before);
    expect(p.mood.score).toBeGreaterThanOrEqual(0);
    expect(mail(l, `${p.firstName} ${p.lastName} likes his new role`)?.body).toMatch(/He has dropped his trade request\.$/);
  });

  it("a bigger role, broken: the request comes back angrier, and he won't take another promise this season", () => {
    const { l, p } = setup();
    meetPlayer(l, p.pid, 'role');
    const before = p.mood.score;
    // a coach's decision counts as no minutes
    play(l, p, [24, 22, 0, 25, 26, 20, 22, 24, 23, 25, 21, 22, 24, 26, 25]);
    expect(p.promise).toBeUndefined();
    expect(p.mood.tradeRequest).toBe(true);
    expect(p.mood.score).toBeCloseTo(before - 2.5, 9);
    expect(p.meeting?.broken).toBe(l.season);
    expect(meetBlockedReason(l, p)).toBe(`You broke your word to ${p.lastName} this season: he won't take another promise until next season.`);
    const m = mail(l, `${p.firstName} ${p.lastName} says you broke your word`)!;
    expect(m.important).toBe(true);
    expect(m.body).toMatch(
      /^You promised .+ about 30 minutes a night, and he got 21\.9 over his last 15 games\. He wants a trade again, angrier than before, and he won't take your word again this season\.$/,
    );
  });

  it('a bigger role means the ball too for a creator', () => {
    const { l } = setup(9);
    // a natural creator on the user's team, played as a spot-up shooter
    const creator = Object.values(l.players).find((x) => x.tid >= 0 && archetype(x.ratings).role === 'creator')!;
    l.userTid = creator.tid;
    creator.mood.tradeRequest = true;
    creator.mood.score = -7;
    creator.mood.expectedMin = 30;
    l.teams[creator.tid].tactics.offense.roles[creator.pid] = 'shooter';
    meetPlayer(l, creator.pid, 'role');
    play(l, creator, Array(ROLE_GAMES).fill(34));
    expect(creator.mood.tradeRequest).toBe(true);
    expect(mail(l, `${creator.firstName} ${creator.lastName} says you broke your word`)?.body).toContain('and the ball in his hands');
  });

  it("a trade: he weighs on the locker room half as much, and if he isn't moved by the deadline he goes public", () => {
    const { l, p } = setup();
    const mate = standardRoster(l, U).find((x) => x !== p)!;
    const roster = standardRoster(l, U);
    expect(lockerRoomPerf(roster, mate)).toBeCloseTo(0.994, 9);
    const r = meetPlayer(l, p.pid, 'trade');
    expect(r.ok).toBe(true);
    expect(p.promise).toMatchObject({ kind: 'trade', by: 'deadline', request: true });
    expect(p.mood.tradeRequest).toBe(true);
    expect(lockerRoomPerf(roster, mate)).toBeCloseTo(0.997, 9);
    const score = p.mood.score;
    l.day = l.tradeDeadlineDay;
    resolvePromises(l);
    expect(p.promise).toBeDefined();
    l.day++;
    resolvePromises(l);
    expect(p.promise).toBeUndefined();
    expect(p.mood.score).toBeCloseTo(score - 2, 9);
    expect(p.mood.tradeRequest).toBe(true);
    expect(p.meeting?.broken).toBe(l.season);
    expect(l.news.at(-1)!.text).toBe(
      `${p.firstName} ${p.lastName} goes public: the ${l.teams[U].region} ${l.teams[U].name} told him they would trade him by the deadline, and he's still here.`,
    );
    expect(mail(l, `${p.firstName} ${p.lastName} goes public`)?.important).toBe(true);
    expect(lockerRoomPerf(roster, mate)).toBeCloseTo(0.994, 9);
  });

  it('a trade kept, and one promised over the summer that is due by opening night', () => {
    const { l, p } = setup();
    meetPlayer(l, p.pid, 'trade');
    const news = l.news.length;
    executeTrade(l, { a: { tid: U, pids: [p.pid], dpids: [] }, b: { tid: AI, pids: [], dpids: [] } });
    expect([p.promise, p.meeting]).toEqual([undefined, undefined]);
    resolvePromises(l);
    expect(l.news.slice(news).some((n) => n.text.includes('goes public'))).toBe(false);
    // the summer: by opening night
    const { l: s, p: q } = setup(7);
    s.phase = 'draft';
    expect(meetPlayer(s, q.pid, 'trade').text).toBe(`${q.lastName} expects to be moved by next opening night. Until then he keeps it in-house.`);
    s.phase = 'freeAgency';
    resolvePromises(s);
    s.season++;
    s.phase = 'preseason';
    resolvePromises(s);
    expect(q.promise?.kind).toBe('trade');
    s.phase = 'regular';
    s.day = 0;
    resolvePromises(s);
    expect(q.promise).toBeUndefined();
    expect(s.news.at(-1)!.text).toContain('told him they would trade him over the summer');
  });

  it('patience: likelier from a veteran who has been here a while on a winning team, drawn once per meeting day', () => {
    const { l, p } = setup();
    const ts = curTeamSeason(l, U);
    [ts.won, ts.lost] = [28, 12];
    p.bornYear = l.season - 32;
    p.joinedSeason = l.season - 4;
    const vet = patienceOdds(l, p);
    expect(vet.reasons.map((r) => r.text)).toEqual(['4 seasons with you', 'a 28-12 team', 'a veteran (32)', 'he has already asked out']);
    [ts.won, ts.lost] = [12, 28];
    p.bornYear = l.season - 22;
    p.joinedSeason = l.season;
    const kid = patienceOdds(l, p);
    expect(kid.reasons.map((r) => [r.text, r.up])).toEqual([
      ['new to the team', false],
      ['a 12-28 team', false],
      ['young (22)', false],
      ['he has already asked out', false],
    ]);
    expect(vet.chance).toBeGreaterThan(0.75);
    expect(kid.chance).toBeLessThan(0.15);
    // the same day gives the same answer
    const a = structuredClone(l);
    const b = structuredClone(l);
    expect(meetPlayer(a, p.pid, 'patience')).toEqual(meetPlayer(b, p.pid, 'patience'));
  });

  it("counts a real player's seasons with his team before the league began, from his record", () => {
    const { l, p } = setup();
    const row = (season: number, tid: number) => ({ ...p.stats[0], season, tid, playoffs: false, real: true, gp: 60 });
    p.stats = [row(l.season - 3, U), row(l.season - 2, U), row(l.season - 1, U)];
    expect(seasonsWithTeam(l, p)).toBe(3);
    // a season elsewhere breaks the run
    p.stats = [row(l.season - 3, U), row(l.season - 2, AI), row(l.season - 1, U)];
    expect(seasonsWithTeam(l, p)).toBe(1);
  });

  it('patience agreed: on hold for 20 games, then settled or back; refused: it costs mood', () => {
    for (const settles of [true, false]) {
      const { l, p } = setup();
      const yes = agreeing(l, p);
      expect(yes.text).toBe(`${p.lastName} agrees to give it ${PATIENCE_GAMES} games.`);
      expect([p.mood.tradeRequest, p.promise?.kind]).toEqual([false, 'patience']);
      play(l, p, Array(PATIENCE_GAMES - 1).fill(30));
      expect(p.promise?.kind).toBe('patience');
      p.mood.score = settles ? 0 : -4;
      play(l, p, [30]);
      expect(p.promise).toBeUndefined();
      expect(p.mood.tradeRequest).toBe(!settles);
      expect(mail(l, `${p.firstName} ${p.lastName} ${settles ? 'has settled down' : 'wants a trade again'}`)).toBeDefined();
    }
    const { l, p } = setup();
    const before = p.mood.score;
    const no = refusing(l, p);
    expect(no.text).toBe(`${p.lastName} isn't having it, and he's angrier for being asked.`);
    expect(p.mood.score).toBeCloseTo(before - 1.5, 9);
    expect([p.mood.tradeRequest, p.promise]).toEqual([true, undefined]);
  });

  it("ends with his release, and AI teams' players never get one", () => {
    const { l, p } = setup();
    meetPlayer(l, p.pid, 'role');
    releasePlayer(l, p, { news: false });
    resolvePromises(l);
    expect(p.promise).toBeUndefined();
    expect(Object.values(l.players).every((x) => x.tid === U || !x.promise)).toBe(true);
  });

  it('runs through the daily loop: a bigger role kept with real games', () => {
    const { l, p } = setup(11);
    // (a long injury would only put the verdict off)
    l.settings.injuries = false;
    const rot = l.teams[U].rotation;
    rot.manual = true;
    rot.order = [p.pid, ...rot.order.filter((x) => x !== p.pid)];
    meetPlayer(l, p.pid, 'role');
    const target = p.promise!.minutes!;
    // the coach gives him what was promised and a little more
    rot.minutes[p.pid] = Math.min(40, target + 4);
    p.injury = null;
    for (let i = 0; i < 60 && p.promise; i++) simDay(l);
    expect(p.promise).toBeUndefined();
    expect(mail(l, `${p.firstName} ${p.lastName} likes his new role`)).toBeDefined();
  });
});

/** Meet him on the first day from today where he agrees to be patient (or refuses), and return what he said. */
function agreeing(l: League, p: Player) {
  return answer(l, p, true);
}
function refusing(l: League, p: Player) {
  return answer(l, p, false);
}
function answer(l: League, p: Player, agree: boolean) {
  const odds = patienceOdds(l, p).chance;
  expect(odds).toBeGreaterThan(0);
  for (let d = l.day; d < l.day + 200; d++) {
    const c = structuredClone(l);
    c.day = d;
    if (meetPlayer(c, p.pid, 'patience').agreed === agree) {
      l.day = d;
      return meetPlayer(l, p.pid, 'patience');
    }
  }
  throw new Error('no such day');
}
