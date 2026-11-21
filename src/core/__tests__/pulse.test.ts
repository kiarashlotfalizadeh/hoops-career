// The locker rooms' pulse (league/pulse.ts): the weekly read of each player's role and the core's
// cohesion, a star's trade request and what it does (the agenda, re-signing), and its withdrawal;
// around the league, a star who tires of losing, the block he lands on, and what cohesion is worth
// on the floor.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { agenda, resolveAgenda } from '../league/agenda';
import { extensionRefusal } from '../league/contracts';
import { curTeamSeason, standardRoster } from '../league/helpers';
import {
  ASK_WEEKS,
  COHESION_EDGE,
  LOSING_WEEKS,
  OUT_OF_IT,
  UNHAPPY,
  askedOut,
  cohesionEffect,
  cohesionOf,
  cohesionWord,
  expectedMinutes,
  losingPatience,
  openRequests,
  pulseDay,
  pulseRead,
  roleRead,
  tradeRequests,
  wantsOut,
} from '../league/pulse';
import { onTheBlock, sellable } from '../league/aiTrades';
import { availability } from '../league/tradeFinder';
import { WANTS_OUT, playerValueFor } from '../league/trades';
import { buildSimInput } from '../league/games';
import { K, cohesionLift } from '../sim/engine/constants';
import type { League, Player } from '../types';

const U = 0;

function pulseLeague(): League {
  const l = createLeague({ name: 'pulse', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  l.phase = 'regular';
  l.day = 0;
  return l;
}

/** Team `tid` plays `games` more games, each player getting `mpg(p)` minutes a game. */
function play(l: League, tid: number, games: number, mpg: (p: Player) => number, wins = games) {
  const ts = curTeamSeason(l, tid);
  ts.won += wins;
  ts.lost += games - wins;
  for (const p of standardRoster(l, tid)) {
    let row = p.stats.find((s) => s.season === l.season && !s.playoffs && s.tid === tid);
    if (!row) {
      row = { ...p.stats[0], season: l.season, tid, playoffs: false, gp: 0, gs: 0, min: 0 } as Player['stats'][number];
      // (a generated player may have no stats row to copy: the fields the pulse reads are these)
      p.stats.push(row);
    }
    const m = mpg(p);
    row.gp += m > 0 ? games : 0;
    row.min += m * games;
  }
}

/** A week of the user's team (see play), then the week's read. */
function week(l: League, games: number, mpg: (p: Player) => number, wins = games) {
  play(l, U, games, mpg, wins);
  l.day += 7;
  pulseDay(l);
}

it('the locker room: roles read from minutes, a core that grows together, a star who asks out and is settled again', () => {
  const l = pulseLeague();
  const roster = standardRoster(l, U).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  const [star, second, third, fourth, fifth, sixth] = roster;
  for (const p of roster) {
    p.injury = null;
    p.bornYear = l.season - 27;
  }
  star.ovr = 92;
  second.ovr = 86;
  // what a player of his standing plays: a star's minutes, a starter's, the bench's, nobody's
  expect(expectedMinutes(l, star)).toBe(32);
  expect(expectedMinutes(l, third)).toBe(third.ovr >= 74 ? 24 : third.ovr >= 70 ? 14 : 0);
  expect(expectedMinutes(l, roster[roster.length - 1])).toBe(0);
  star.bornYear = l.season - 35;
  expect(expectedMinutes(l, star)).toBe(27);
  star.bornYear = l.season - 27;
  // nothing is read before the season has ten games, and nothing off the regular season
  expect(roleRead(l, star)).toMatchObject({ word: 'Content', expects: 32, asked: false });
  expect(pulseRead(l).core).toEqual([]);

  // everyone plays his minutes and the team wins: a content room, a core that tightens week by week
  const fair = (p: Player) => expectedMinutes(l, p) || 4;
  week(l, 4, fair);
  week(l, 4, fair);
  week(l, 4, fair);
  // (the first read only takes its bearings: nobody is judged on a week that wasn't measured)
  expect(Object.values(l.pulse!.rooms[U].low).every((n) => n === 0)).toBe(true);
  expect(Object.values(l.pulse!.rooms[U].mood).every((m) => m >= 0)).toBe(true);
  expect(l.pulse!.rooms[U].core).toHaveLength(5);
  expect(l.pulse!.rooms[U].core).toContain(star.pid);
  expect(pulseRead(l).roles).toEqual([]);
  const early = l.pulse!.rooms[U].cohesion;
  for (let i = 0; i < 6; i++) week(l, 4, fair);
  expect(l.pulse!.rooms[U].cohesion).toBeGreaterThan(early);
  expect(l.pulse!.rooms[U].mood[star.pid]).toBeGreaterThan(0);
  expect(cohesionWord(0.8)).toBe('Tight group');
  expect(cohesionWord(0.2)).toBe('Strangers');

  // the star is sat down: he wants more, then is unhappy, and after three short weeks asks out
  const benched = (p: Player) => (p.pid === star.pid ? 12 : fair(p));
  let weeks = 0;
  while (!askedOut(l, star) && weeks < 12) {
    week(l, 4, benched, 2);
    weeks++;
    if (!askedOut(l, star) && l.pulse!.rooms[U].mood[star.pid] <= UNHAPPY) expect(['Wants more minutes', 'Unhappy with his role']).toContain(roleRead(l, star)!.word);
  }
  expect(askedOut(l, star)).toBe(true);
  expect(weeks).toBeGreaterThanOrEqual(ASK_WEEKS);
  expect(weeks).toBeLessThan(12);
  expect(roleRead(l, star)).toMatchObject({ word: 'Asked for a trade', tone: 'bad', asked: true });
  // (a role player short of minutes grumbles, but only a star asks out)
  expect(askedOut(l, sixth)).toBe(false);
  // it is news, mail that stops a sim, a line on Team and a decision on the agenda
  const story = l.news[l.news.length - 1];
  expect(story.head).toMatch(/ asks [A-Z].+ for a trade$/);
  expect(story.weight).toBe(3);
  expect(story.pids).toEqual([star.pid]);
  expect(l.inbox[0]).toMatchObject({ important: true, link: `/player/${star.pid}` });
  expect(pulseRead(l).line).toBe('One player has asked for a trade.');
  const item = agenda(l).find((i) => i.kind === 'tradeRequest')!;
  expect(item.id).toBe(`tradeRequest:${star.pid}`);
  expect(item.choices!.map((c) => c.label)).toEqual(['Set his minutes', 'Shop him', 'He stays']);
  // he signs nothing while it stands
  expect(extensionRefusal(l, star)).toContain('has asked for a trade');
  // answered, it leaves the agenda and stands on Team
  expect(resolveAgenda(l, item.choices![2].action).ok).toBe(true);
  expect(openRequests(l)).toEqual([]);
  expect(agenda(l).some((i) => i.kind === 'tradeRequest')).toBe(false);
  expect(askedOut(l, star)).toBe(true);

  // his minutes back, he withdraws it
  let back = 0;
  while (askedOut(l, star) && back < 12) {
    week(l, 4, fair);
    back++;
  }
  expect(askedOut(l, star)).toBe(false);
  expect(l.news[l.news.length - 1].text).toContain('withdrawn his trade request');
  expect(extensionRefusal(l, star) ?? '').not.toContain('asked for a trade');

  // a core member traded away: the group starts again, and whoever left takes his standing with him
  const tight = l.pulse!.rooms[U].cohesion;
  second.tid = 1;
  l.teams[U].rotation.order = l.teams[U].rotation.order.filter((pid) => pid !== second.pid);
  week(l, 4, fair);
  expect(l.pulse!.rooms[U].cohesion).toBeLessThan(tight);
  expect(l.pulse!.rooms[U].mood[second.pid]).toBeUndefined();
  expect(l.pulse!.rooms[U].core).not.toContain(second.pid);
  expect([third, fourth, fifth].every((p) => roleRead(l, p) === null || roleRead(l, p)!.word === 'Content')).toBe(true);

  // ---- around the league: every team has a room, read the same week
  const T = 5;
  expect(l.pulse!.rooms[T]).toBeDefined();
  {
    // what a group's cohesion is worth on the floor: nothing until it is settled, then a touch more with every step, the same for every team
    expect(cohesionLift(undefined)).toBe(0);
    expect(cohesionLift(COHESION_EDGE - 0.1)).toBe(0);
    expect(cohesionLift(0.8)).toBeGreaterThan(0);
    expect(cohesionLift(0.8)).toBeLessThan(cohesionLift(1));
    expect(cohesionLift(1)).toBeCloseTo(K.cohesion.fg, 10);
    // (small on purpose: under half a percentage point of shooting at the very top)
    expect(K.cohesion.fg).toBeLessThanOrEqual(0.005);
    expect(K.cohesion.from).toBe(COHESION_EDGE);
    expect(cohesionEffect(0.4)).toBe('No lift on the floor yet.');
    expect(cohesionEffect(0.6)).toBe('Executes a little better on the floor.');
    expect(pulseRead(l).effect).toBe(cohesionEffect(l.pulse!.rooms[U].cohesion));
    // the sim is handed each side's cohesion as the pulse last read it
    expect(buildSimInput(l, U, l.day, 'regular').cohesion).toBe(l.pulse!.rooms[U].cohesion);
    expect(buildSimInput(l, T, l.day, 'regular').cohesion).toBe(cohesionOf(l, T));
  }
  {
    // a star in his prime on a team that is out of it: after his patience runs out he asks for a trade, and his team puts him on the block
    const theirs = standardRoster(l, T).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    for (const p of theirs) {
      p.injury = null;
      p.bornYear = l.season - 29;
      p.joinedSeason = l.season - 2;
    }
    // (some stars ride it out: the test takes one who wouldn't)
    const rider = theirs.find((p) => losingPatience(l, p) === Infinity)!;
    const star2 = theirs.find((p) => losingPatience(l, p) < Infinity)!;
    const patience = losingPatience(l, star2);
    expect(patience).toBeGreaterThanOrEqual(LOSING_WEEKS[0]);
    expect(patience).toBeLessThanOrEqual(LOSING_WEEKS[1]);
    for (const p of theirs) p.ovr = Math.min(p.ovr, 80);
    star2.ovr = 93;
    rider.ovr = 90;
    // (a kid, or a player who only just arrived, never asks over the record)
    star2.bornYear = l.season - 22;
    expect(losingPatience(l, star2)).toBe(Infinity);
    star2.bornYear = l.season - 29;
    star2.joinedSeason = l.season;
    expect(losingPatience(l, star2)).toBe(Infinity);
    star2.joinedSeason = l.season - 2;
    l.teams[T].strategy = 'contend';
    expect(sellable(l, T)).toEqual([]);
    const before = playerValueFor(l, star2, T, false, true);
    const mail = l.inbox.length;
    const theirFair = (p: Player) => expectedMinutes(l, p) || 4;
    let weeks = 0;
    while (!wantsOut(l, star2) && weeks < 20) {
      // everyone plays his minutes: it is the losing, not the role
      play(l, T, 4, theirFair, 1);
      week(l, 4, fair);
      weeks++;
    }
    expect(wantsOut(l, star2)).toBe(true);
    // (out of it from twenty games in: his patience is counted from there)
    expect(weeks).toBeGreaterThanOrEqual(Math.ceil(OUT_OF_IT.games / 4) + patience - 1);
    expect(wantsOut(l, rider)).toBe(false);
    expect(l.pulse!.rooms[T].asked[star2.pid]).toMatchObject({ why: 'losing' });
    expect(tradeRequests(l).map((p) => p.pid)).toEqual([star2.pid]);
    // league news, not the user's mail or his agenda
    const told = l.news.filter((n) => n.pids?.includes(star2.pid)).pop()!;
    expect(told.head).toMatch(/ asks [A-Z].+ for a trade$/);
    expect(told.text).toContain('wants to play for a winner');
    expect(told.weight).toBe(2);
    expect(l.inbox.length).toBe(mail);
    expect(openRequests(l)).toEqual([]);
    expect(askedOut(l, star2)).toBe(false);
    // on the block, a contender's too: the rumor mill and the finder say he asked, he counts for a little less going out, and he signs nothing there
    expect(sellable(l, T).map((p) => p.pid)).toEqual([star2.pid]);
    // (the test's weeks ran past the deadline: the block is read while deals can be made)
    l.tradeDeadlineDay = l.day + 30;
    expect(onTheBlock(l, 30)[0]).toMatchObject({ tid: T, pid: star2.pid, asked: true });
    expect(availability(l, star2)).toBe('asked');
    expect(roleRead(l, star2)).toMatchObject({ word: 'Asked for a trade', why: 'losing' });
    expect(roleRead(l, rider)).toBeNull();
    const after = playerValueFor(l, star2, T, false, true);
    expect(after).toBeLessThan(before * (WANTS_OUT + 0.05));
    expect(extensionRefusal(l, star2)).toContain("won't sign a new deal while the team is losing");
    // the team climbs back: he withdraws it
    let back = 0;
    while (wantsOut(l, star2) && back < 30) {
      play(l, T, 4, theirFair, 4);
      week(l, 4, fair);
      back++;
    }
    expect(wantsOut(l, star2)).toBe(false);
    expect(l.news.filter((n) => n.pids?.includes(star2.pid)).pop()!.text).toContain('is winning again');
    expect(sellable(l, T)).toEqual([]);
  }

  // the off-season: nothing is read
  const day = l.pulse!.day;
  l.phase = 'draft';
  l.day += 30;
  pulseDay(l);
  expect(l.pulse!.day).toBe(day);
}, 60_000);
