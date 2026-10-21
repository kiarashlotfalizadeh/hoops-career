// The player's journey between screens: what a long sim says when it stops (simSummary), how a game in
// progress reads on the Continue bar, what free agency's last step warns about, and which draft
// picks take the screen as a moment, and what the unread badge counts.
import { describe, expect, it } from 'vitest';
import type { GameResult, League, PlayoffSeries } from '../../core/types';
import { createLeague, defaultSettings } from '../../core/league/create';
import { curTeamSeason, standardRoster } from '../../core/league/helpers';
import { CAP } from '../../core/constants';
import { flowActions, liveScoreText, simStart, simSummary } from '../flow';
import { currentMoments } from '../moments';
import { NEWS_DAYS, needsYou } from '../today/messages';

const make = (): League => createLeague({ name: 'j', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });

/** A finished game, as much of one as the summary reads. */
const game = (l: League, home: number, away: number, hp: number, ap: number) =>
  ({ gid: 90_000 + l.games.length, season: l.season, home: { tid: home, pts: hp }, away: { tid: away, pts: ap } }) as unknown as GameResult;

const series = (round: number, high: number, low: number, highWins: number, lowWins: number, winner?: number): PlayoffSeries => ({
  id: `S${round}-${high}-${low}`,
  round,
  conf: round === 4 ? 'F' : 'E',
  high,
  low,
  highSeed: 1,
  lowSeed: 4,
  highWins,
  lowWins,
  ...(winner !== undefined ? { winner } : {}),
});

describe('simSummary', () => {
  it('says how a stretch of the regular season went, and the record when it differs', () => {
    const l = make();
    l.phase = 'regular';
    l.day = 20;
    const before = simStart(l);
    l.games.push(game(l, 0, 1, 110, 100), game(l, 2, 0, 99, 90), game(l, 0, 3, 120, 101), game(l, 4, 5, 100, 90));
    const ts = curTeamSeason(l, 0);
    ts.won = 12;
    ts.lost = 9;
    const s = simSummary(before, l)!;
    expect(s.text).toMatch(/^2-1 since \w{3} \d+ · now 12-9$/);
    expect(s.tone).toBe('good');
    // the first week: the stretch is the whole record, said once
    ts.won = 2;
    ts.lost = 1;
    expect(simSummary(before, l)!.text).not.toContain('now');
  });

  it('says nothing for a sim that played fewer than two of your games', () => {
    const l = make();
    l.phase = 'regular';
    const before = simStart(l);
    l.games.push(game(l, 0, 1, 110, 100), game(l, 2, 3, 99, 90));
    expect(simSummary(before, l)).toBeNull();
  });

  it('says how the season ended when a sim runs past it, and who won the title', () => {
    const l = make();
    l.phase = 'playoffs';
    l.playoffs = [series(1, 2, 0, 4, 1)];
    curTeamSeason(l, 0).playoffRound = 1;
    const before = simStart(l);
    expect(before.alive).toBe(true);
    l.playoffs[0].winner = 2;
    l.playoffs.push(series(4, 2, 17, 4, 2, 2));
    l.phase = 'draftLottery';
    const s = simSummary(before, l)!;
    expect(s.text).toBe(`Out in the first round: ${l.teams[2].abbrev} won 4-1 · ${l.teams[2].abbrev} won the title`);
    expect(s.tone).toBe('bad');
    expect(s.link).toBe('/league/playoffs');
  });

  it('names the champion once when he lost the Finals to it', () => {
    const l = make();
    l.phase = 'playoffs';
    l.playoffs = [series(4, 17, 0, 3, 3)];
    curTeamSeason(l, 0).playoffRound = 4;
    const before = simStart(l);
    l.playoffs[0].highWins = 4;
    l.playoffs[0].winner = 17;
    l.phase = 'draftLottery';
    expect(simSummary(before, l)!.text).toBe(`Lost the NBA Finals: ${l.teams[17].abbrev} won 4-3`);
  });

  it('leaves a title to its moment', () => {
    const l = make();
    l.phase = 'playoffs';
    l.playoffs = [series(4, 0, 17, 3, 2)];
    curTeamSeason(l, 0).playoffRound = 4;
    const before = simStart(l);
    l.playoffs[0].highWins = 4;
    l.playoffs[0].winner = 0;
    l.phase = 'draftLottery';
    expect(simSummary(before, l)).toBeNull();
  });
});

describe('the Continue bar', () => {
  it('reads a game in progress from your side', () => {
    const l = make();
    const ab = l.teams[0].abbrev;
    expect(liveScoreText(l, { score: [11, 10] })).toBe(`${ab} up 11-10`);
    expect(liveScoreText(l, { score: [88, 92] })).toBe(`${ab} down 88-92`);
    expect(liveScoreText(l, { score: [50, 50] })).toBe('Tied 50-50');
  });

  it("warns at free agency's end when the roster is short of opening night's minimum", () => {
    const l = make();
    l.phase = 'freeAgency';
    const std = standardRoster(l, 0);
    for (const p of std.slice(CAP.rosterMin - 2)) p.tid = -1;
    const next = flowActions(l).find((a) => a.id === 'new')!;
    expect(next.sub).toBe('Sign 2 more players by opening night.');
  });
});

describe('moments', () => {
  it("draft picks aren't moments: the draft screen's announcer card has them", () => {
    const l = make();
    const [a, b] = Object.values(l.players).filter((p) => p.tid === 0);
    a.draft = { ...a.draft, year: l.season, round: 1, pick: 12 };
    b.draft = { ...b.draft, year: l.season, round: 2, pick: 44 };
    l.transactions = [
      { id: 1, season: l.season, day: 0, phase: 'draft', kind: 'draft', tids: [0], pid: a.pid, name: 'A' },
      { id: 2, season: l.season, day: 0, phase: 'draft', kind: 'draft', tids: [0], pid: b.pid, name: 'B' },
    ];
    const keys = currentMoments(l)
      .filter((m) => m.kind === 'draft')
      .map((m) => m.pid);
    expect(keys).toEqual([]);
  });
});

describe('the unread badge', () => {
  it('counts mail that needs the user: big news and decisions still open', () => {
    const base = { season: 2027, day: 1, from: 'x', subject: 's', body: 'b' };
    const open = new Map([['tradeOffer:4', true]]);
    expect(needsYou({ ...base, id: 1, read: false }, open)).toBe(false);
    expect(needsYou({ ...base, id: 2, read: false, important: true }, open)).toBe(true);
    expect(needsYou({ ...base, id: 3, read: true, important: true }, open)).toBe(false);
    expect(needsYou({ ...base, id: 4, read: false, proposal: 4 }, open)).toBe(true);
    // an offer that closed is just mail
    expect(needsYou({ ...base, id: 5, read: false, proposal: 9 }, open)).toBe(false);
  });

  it('lets big news go stale: two weeks on, or a new season', () => {
    const news = { season: 2027, day: 200, from: 'x', subject: 's', body: 'b', id: 1, read: false, important: true };
    const open = new Map<string, boolean>();
    expect(needsYou(news, open, { season: 2027, day: 210 })).toBe(true);
    expect(needsYou(news, open, { season: 2027, day: 200 + NEWS_DAYS + 1 })).toBe(false);
    expect(needsYou(news, open, { season: 2028, day: 0 })).toBe(false);
    // a decision still open needs him however old it is
    expect(needsYou({ ...news, important: false, proposal: 4 }, new Map([['tradeOffer:4', true]]), { season: 2028, day: 0 })).toBe(true);
  });
});
