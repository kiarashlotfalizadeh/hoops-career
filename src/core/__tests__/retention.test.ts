// What the save keeps: box scores of other teams' games, retired players' records, the Hall of Fame, the news.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { hallOfFameScore, newSeason, simDay, startRegularSeason } from '../league/season';
import { addNews, curTeamSeason, standardRoster, statsLine, teamPlayers } from '../league/helpers';
import { releasePlayer, valueScore } from '../league/contracts';
import { gameFinances } from '../league/finances';
import { CAP } from '../constants';
import type { League, Player } from '../types';
import { RETIRED } from '../types';

const seed = seedJson as unknown as SeedData;
const real = seed.players.length > 0;

function league(rngSeed = 5): League {
  const l = createLeague({ name: 'k', userTid: 0, coachName: 'c', settings: { ...defaultSettings(), stopOnNews: false }, seed: real ? seed : null, rngSeed });
  while (standardRoster(l, 0).length > CAP.rosterMax) releasePlayer(l, standardRoster(l, 0).sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  return l;
}

describe('box scores (L3)', () => {
  it("other teams' games keep only players who got on the floor; the user's keep everyone", () => {
    const l = league();
    expect(startRegularSeason(l)).toEqual([]);
    for (let d = 0; d < 6 && !l.games.some((g) => g.home.tid === 0 || g.away.tid === 0); d++) simDay(l);
    const user = l.games.find((g) => g.home.tid === 0 || g.away.tid === 0)!;
    const mine = user.home.tid === 0 ? user.home : user.away;
    expect(mine.players.length).toBe(teamPlayers(l, 0).length);
    const ai = l.games.filter((g) => g.home.tid !== 0 && g.away.tid !== 0);
    expect(ai.length).toBeGreaterThan(0);
    for (const g of ai) for (const b of [...g.home.players, ...g.away.players]) expect(b.min).toBeGreaterThan(0);
    // season minutes are stored to a tenth
    for (const p of Object.values(l.players)) for (const s of p.stats) if (!s.real) expect(Math.round(s.min * 10) / 10).toBe(s.min);
  });
});

describe('attendance (L7)', () => {
  it('postseason gates earn revenue but are not counted as regular-season attendance', () => {
    const l = league();
    const team = l.teams[1];
    const ts = curTeamSeason(l, 1);
    gameFinances(l, team, true, true);
    expect(ts.attendance).toBe(0);
    expect(ts.revenue).toBeGreaterThan(0);
    const crowd = gameFinances(l, team, true, false);
    expect(ts.attendance).toBe(crowd);
  });
});

describe('retired players (L4)', () => {
  function retiree(l: League, p: Player, yearsAgo: number, games: number, award = false) {
    p.tid = RETIRED;
    p.retiredSeason = l.season - yearsAgo;
    p.contract = { start: l.season, salaries: [0] };
    p.awards = award ? [{ season: l.season - yearsAgo, type: 'Sixth Man of the Year' }] : [];
    p.stats = [];
    const s = statsLine(p, l.season - yearsAgo, 1, false);
    Object.assign(s, {
      gp: games,
      min: games * 21.123456,
      pts: games * 9,
      pm: 37,
      onPoss: 4321,
      onPtsFor: 4800,
      onPtsAgainst: 4700,
      rimM: 120,
      rimA: 200,
      midM: 50,
      midA: 120,
      teamFga: 5000,
      teamFta: 1500,
      teamTov: 900,
    });
    p.mood.score = -4;
    p.mood.notes = ['Wants more minutes'];
    return p;
  }

  it('keeps career tables, drops engine-only detail, and lets fringe careers go after five seasons', () => {
    const l = league();
    const pool = Object.values(l.players).filter((p) => p.tid === -1);
    // newSeason moves the calendar a year on, so "3 years ago" becomes 4 and "4" becomes 5
    const vet = retiree(l, pool[0], 2, 500);
    const fringe = retiree(l, pool[1], 4, 60);
    const decorated = retiree(l, pool[2], 4, 60, true);
    const recent = retiree(l, pool[3], 2, 60);
    l.phase = 'freeAgency';
    expect(newSeason(l)).toBe(true);
    expect(l.players[fringe.pid]).toBeUndefined();
    expect(l.players[decorated.pid]).toBeDefined();
    expect(l.players[recent.pid]).toBeDefined();
    const s = vet.stats[0];
    expect([s.onPoss, s.onPtsFor, s.onPtsAgainst, s.rimM, s.rimA, s.midM, s.midA]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // usage and plus-minus still show in his career table
    expect([s.teamFga, s.teamFta, s.teamTov, s.pm, s.pts]).toEqual([5000, 1500, 900, 37, 4500]);
    expect(s.min).toBe(Math.round(500 * 21.123456 * 10) / 10);
    expect(vet.mood.notes).toEqual([]);
    expect(vet.mood.score).toBe(0);
  });
});

describe('news', () => {
  it("injuries and big games make way first, so the season's story stays; the latest of them still show", () => {
    const l = { news: [], nextMsgId: 1, season: 2027, day: 0 } as unknown as League;
    const add = (kind: 'award' | 'injury' | 'milestone' | 'signing', text: string) => addNews(l, { kind, text, tids: [], pids: [] });
    add('award', 'The Cup');
    for (let i = 0; i < 600; i++) add(i % 3 ? 'injury' : 'milestone', `knock ${i}`);
    expect(l.news).toHaveLength(400);
    expect(l.news[0].text).toBe('The Cup');
    // a summer of signings: the oldest injuries and big games still go first
    for (let i = 0; i < 250; i++) add('signing', `signing ${i}`);
    expect(l.news[0].text).toBe('The Cup');
    // ...but the latest 100 always stay
    for (let i = 250; i < 850; i++) add('signing', `signing ${i}`);
    expect(l.news).toHaveLength(400);
    expect(l.news.filter((n) => n.kind === 'injury' || n.kind === 'milestone')).toHaveLength(100);
    expect(l.news.some((n) => n.text === 'knock 599')).toBe(true);
    expect(l.news.some((n) => n.text === 'signing 849')).toBe(true);
  });
});

describe('ratings history', () => {
  it('keeps OVR for every season but full ratings only on the latest two snapshots', () => {
    const l = league();
    for (let i = 0; i < 2; i++) {
      l.phase = 'freeAgency';
      expect(newSeason(l)).toBe(true);
    }
    const hist = Object.values(l.players).filter((p) => p.tid >= 0 && p.ratingsHistory.length >= 3);
    expect(hist.length).toBeGreaterThan(100);
    for (const p of hist) {
      const h = p.ratingsHistory;
      expect(h.map((x) => x.ovr).every(Number.isFinite)).toBe(true);
      expect(h.slice(0, -2).every((x) => x.r === undefined)).toBe(true);
      expect(h.slice(-2).every((x) => x.r !== undefined)).toBe(true);
    }
  });
});

describe.runIf(real)('Hall of Fame (L6)', () => {
  const l = league();
  const named = (first: string, last: string) => Object.values(l.players).find((p) => p.firstName === first && p.lastName === last)!;

  it('real legends carry their careers before the league began', () => {
    for (const [f, n] of [
      ['LeBron', 'James'],
      ['Stephen', 'Curry'],
      ['Kevin', 'Durant'],
      ['James', 'Harden'],
      ['Giannis', 'Antetokounmpo'],
      ['Anthony', 'Davis'],
      ['Kawhi', 'Leonard'],
    ])
      expect(hallOfFameScore(l, named(f, n))).toBeGreaterThanOrEqual(22);
  });

  it('long-serving role players get next to nothing', () => {
    for (const [f, n] of [
      ['Taj', 'Gibson'],
      ['Nicolas', 'Batum'],
      ['DeAndre', 'Jordan'],
    ])
      expect(hallOfFameScore(l, named(f, n))).toBeLessThan(2);
    const credited = Object.values(l.players).filter((p) => hallOfFameScore(l, p) >= 22);
    expect(credited.length).toBeLessThanOrEqual(12);
  });
});
