// The locker room's pulse (league/pulse.ts): the weekly read of each player's role and the core's
// cohesion, a star's trade request and what it does (the agenda, re-signing), and its withdrawal.
import { expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { agenda, resolveAgenda } from '../league/agenda';
import { extensionRefusal } from '../league/contracts';
import { curTeamSeason, standardRoster } from '../league/helpers';
import { ASK_WEEKS, UNHAPPY, askedOut, cohesionWord, expectedMinutes, openRequests, pulseDay, pulseRead, roleRead } from '../league/pulse';
import type { League, Player } from '../types';

const U = 0;

function pulseLeague(): League {
  const l = createLeague({ name: 'pulse', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  l.phase = 'regular';
  l.day = 0;
  return l;
}

/** Play `games` more team games in a week, each player getting `mpg(p)` minutes a game. */
function week(l: League, games: number, mpg: (p: Player) => number, wins = games) {
  const ts = curTeamSeason(l, U);
  ts.won += wins;
  ts.lost += games - wins;
  for (const p of standardRoster(l, U)) {
    let row = p.stats.find((s) => s.season === l.season && !s.playoffs && s.tid === U);
    if (!row) {
      row = { ...p.stats[0], season: l.season, tid: U, playoffs: false, gp: 0, gs: 0, min: 0 } as Player['stats'][number];
      // (a generated player may have no stats row to copy: the fields the pulse reads are these)
      p.stats.push(row);
    }
    const m = mpg(p);
    row.gp += m > 0 ? games : 0;
    row.min += m * games;
  }
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
  expect(Object.values(l.pulse!.low).every((n) => n === 0)).toBe(true);
  expect(Object.values(l.pulse!.mood).every((m) => m >= 0)).toBe(true);
  expect(l.pulse!.core).toHaveLength(5);
  expect(l.pulse!.core).toContain(star.pid);
  expect(pulseRead(l).roles).toEqual([]);
  const early = l.pulse!.cohesion;
  for (let i = 0; i < 6; i++) week(l, 4, fair);
  expect(l.pulse!.cohesion).toBeGreaterThan(early);
  expect(l.pulse!.mood[star.pid]).toBeGreaterThan(0);
  expect(cohesionWord(0.8)).toBe('Tight group');
  expect(cohesionWord(0.2)).toBe('Strangers');

  // the star is sat down: he wants more, then is unhappy, and after three short weeks asks out
  const benched = (p: Player) => (p.pid === star.pid ? 12 : fair(p));
  let weeks = 0;
  while (!askedOut(l, star) && weeks < 12) {
    week(l, 4, benched, 2);
    weeks++;
    if (!askedOut(l, star) && l.pulse!.mood[star.pid] <= UNHAPPY) expect(['Wants more minutes', 'Unhappy with his role']).toContain(roleRead(l, star)!.word);
  }
  expect(askedOut(l, star)).toBe(true);
  expect(weeks).toBeGreaterThanOrEqual(ASK_WEEKS);
  expect(weeks).toBeLessThan(12);
  expect(roleRead(l, star)).toMatchObject({ word: 'Asked for a trade', tone: 'bad', asked: true });
  // (a role player short of minutes grumbles, but only a star asks out)
  expect(askedOut(l, sixth)).toBe(false);
  // it is news, mail that stops a sim, a line on Team and a decision on the agenda
  const story = l.news[l.news.length - 1];
  expect(story.head).toContain('asks the');
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
  const tight = l.pulse!.cohesion;
  second.tid = 1;
  l.teams[U].rotation.order = l.teams[U].rotation.order.filter((pid) => pid !== second.pid);
  week(l, 4, fair);
  expect(l.pulse!.cohesion).toBeLessThan(tight);
  expect(l.pulse!.mood[second.pid]).toBeUndefined();
  expect(l.pulse!.core).not.toContain(second.pid);
  expect([third, fourth, fifth].every((p) => roleRead(l, p) === null || roleRead(l, p)!.word === 'Content')).toBe(true);

  // the off-season: nothing is read
  const day = l.pulse!.day;
  l.phase = 'draft';
  l.day += 30;
  pulseDay(l);
  expect(l.pulse!.day).toBe(day);
}, 60_000);
