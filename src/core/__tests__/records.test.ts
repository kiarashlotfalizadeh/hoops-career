// The record book: single-game marks kept best first (a tie stays with whoever set it first), the
// league's and each franchise's lists agreeing with the box scores they came from, career highs,
// a book read back from the stored results for a save from before it, single-season and career
// records read from the stats kept for good, and record news only once a full season is behind it;
// a real league's book opened with the NBA's games since 1996-97, and the seasons that match its best.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import { simDay } from '../league/season';
import {
  KEEP,
  REC_STATS,
  TEAM_REC_STATS,
  backfillRecords,
  careerLeaders,
  insertMark,
  lineStat,
  qualifies,
  recordGame,
  recordNews,
  recordWhat,
  recordsHeld,
  seasonRecords,
  teamSeasonRecords,
  careerHighOf,
  freezeRecordNames,
  gameMark,
  markKey,
  mayHoldSeasonRecord,
  teamMark,
  type MarkRow,
  type RecordsData,
} from '../league/records';
import { applyHistory, type HistoryData } from '../league/media/past';
import historyJson from '../../data/history.json';
import recordsJson from '../../data/records.json';
import { blankStats } from '../playerGen';
import type { GameResult, League } from '../types';
import seedJson from '../../data/seed.json';
import type { SeedData } from '../league/create';

const mark = (v: number, gid: number, day = gid): MarkRow => [v, gid, 0, 1, 2027, day, gid];
const ins = (list: MarkRow[], m: MarkRow, keep = 3) => insertMark(list, m, keep, markKey);

describe('the record book', () => {
  /** One league after 6, 10, 12, 30 and 40 days. */
  const at: Record<6 | 10 | 12 | 30 | 40, League> = {} as never;
  beforeAll(() => {
    const l = testLeague('records');
    let days = 0;
    for (const d of [6, 10, 12, 30, 40] as const) {
      for (; days < d; days++) simDay(l);
      at[d] = structuredClone(l);
    }
  }, 180_000);
  const played = (days: 6 | 10 | 12 | 30 | 40) => structuredClone(at[days]);

  it('keeps the best marks from the box scores, reads records from the stats kept, and tells the news once a season is behind it', async () => {
    // insertMark keeps the list best first and at most `keep` long, and says how a mark stands
    {
      const list: MarkRow[] = [];
      expect(ins(list, mark(30, 1))).toBe('record');
      expect(ins(list, mark(40, 2))).toBe('record');
      expect(ins(list, mark(35, 3))).toBe('listed');
      expect(list.map((m) => m[0])).toEqual([40, 35, 30]);
      // not good enough for a full list, and nothing for a zero
      expect(ins(list, mark(30, 4))).toBeNull();
      expect(ins(list, mark(0, 5))).toBeNull();
      expect(ins(list, mark(31, 6))).toBe('listed');
      expect(list.map((m) => m[0])).toEqual([40, 35, 31]);
      // a record tied stays with whoever set it first, and a night recorded twice counts once
      const tied: MarkRow[] = [mark(40, 2)];
      expect(ins(tied, mark(40, 7))).toBe('tie');
      expect(tied.map((m) => m[6])).toEqual([2, 7]);
      expect(ins(tied, mark(40, 7))).toBeNull();
      expect(tied).toHaveLength(2);
    }

    // the book over a stretch of games
    {
      const l = played(40);
      const book = l.records!;
      const counted = l.games.filter((g) => g.type === 'regular');
      // starts with the league
      expect(book.since).toBe(l.startSeason);
      expect(counted.length).toBeGreaterThan(200);

      // each league list is the best of the season's box lines, best first
      for (const stat of REC_STATS) {
        const list = (book.league.reg.players[stat] ?? []).map((r) => gameMark(l, r));
        const all = counted.flatMap((g) => [...g.home.players, ...g.away.players].filter((b) => b.min > 0).map((b) => lineStat(b, stat))).sort((a, b) => b - a);
        expect(list.map((m) => m.v)).toEqual(all.slice(0, KEEP.league.reg).filter((v) => v > 0));
        for (const m of list) {
          const g = counted.find((x) => x.gid === m.gid)!;
          const b = [...g.home.players, ...g.away.players].find((x) => x.pid === m.pid)!;
          expect(lineStat(b, stat), `${stat} ${m.name}`).toBe(m.v);
          expect([g.home.tid, g.away.tid]).toContain(m.tid);
          expect(m.opp).toBe(m.tid === g.home.tid ? g.away.tid : g.home.tid);
        }
      }

      // each franchise's list is its own best and never beats the league's
      for (const t of l.teams) {
        const fr = book.teams[t.tid]?.reg;
        expect(fr, t.abbrev).toBeDefined();
        for (const stat of REC_STATS) {
          const list = (fr!.players[stat] ?? []).map((r) => gameMark(l, r));
          expect(list.length).toBeLessThanOrEqual(KEEP.team.reg);
          for (const m of list) expect(m.tid).toBe(t.tid);
          if (list[0]) expect(list[0].v).toBeLessThanOrEqual(book.league.reg.players[stat]![0][0]);
        }
        for (const stat of TEAM_REC_STATS) for (const m of (fr!.teams[stat] ?? []).map(teamMark)) expect(m.tid).toBe(t.tid);
      }

      // team marks: the most points, the biggest win and the most threes, with the score
      const pts = book.league.reg.teams.pts!.map(teamMark);
      const best = Math.max(...counted.flatMap((g) => [g.home.pts, g.away.pts]));
      expect(pts[0].v).toBe(best);
      expect(pts[0].score[0]).toBe(best);
      const margin = book.league.reg.teams.margin!.map(teamMark);
      expect(margin[0].v).toBe(Math.max(...counted.map((g) => Math.abs(g.home.pts - g.away.pts))));
      expect(margin[0].score[0] - margin[0].score[1]).toBe(margin[0].v);

      // career highs are each player's best stored line, or a real player's high from before the league
      // when the seed brought it (League.realHighs) and it stands above them
      const seeded = new Map((seedJson as unknown as SeedData).players.map((sp) => [sp.id, sp.highs]));
      const own = new Map<number, Record<string, number>>();
      let checked = 0;
      let real = 0;
      for (const p of Object.values(l.players)) {
        const lines = counted.flatMap((g) => [...g.home.players, ...g.away.players].filter((b) => b.pid === p.pid && b.min > 0));
        for (const stat of REC_STATS) {
          const high = Math.max(0, ...lines.map((b) => lineStat(b, stat)));
          if (high > 0) (own.get(p.pid) ?? own.set(p.pid, {}).get(p.pid)!)[stat] = high;
          const before = l.realHighs && p.real ? (seeded.get(p.bbrefId!)?.[stat]?.[0] ?? 0) : 0;
          if (before > high) real++;
          if (Math.max(high, before) > 0) {
            expect(careerHighOf(p, stat)?.v, `${p.lastName} ${stat}`).toBe(Math.max(high, before));
            checked++;
          } else expect(p.highs?.[stat]).toBeUndefined();
        }
      }
      expect(checked).toBeGreaterThan(1000);
      if (l.realHighs) expect(real).toBeGreaterThan(1000);

      // a save from before the book reads it back from the stored results, the same book
      // (it had no real highs either: its players' highs are the book's alone)
      const copy = structuredClone(l);
      delete copy.records;
      delete copy.realHighs;
      for (const p of Object.values(copy.players)) delete p.highs;
      backfillRecords(copy);
      expect(copy.records).toEqual(book);
      for (const p of Object.values(copy.players)) {
        if (l.realHighs && p.real) expect(Object.fromEntries(Object.entries(p.highs ?? {}).map(([k, h]) => [k, h![0]]))).toEqual(own.get(p.pid) ?? {});
        else expect(p.highs).toEqual(l.players[p.pid].highs);
      }

      // survives a save, and a damaged book is rebuilt on load
      await saveLeague(l);
      const back = (await loadLeague(l.id))!;
      expect(back.records).toEqual(book);
      const bad = structuredClone(l);
      (bad.records!.league.reg.players.pts![0] as unknown[])[0] = 'lots';
      const pid = book.league.reg.players.pts![0][1];
      (bad.players[pid] as unknown as { highs: unknown }).highs = { pts: 'x' };
      const fixed = migrate(bad);
      expect(fixed.records).toEqual(book);
      // rebuilt with the book, from the same results (a real player's highs from before the league go with the damage)
      const values = (h: League['players'][number]['highs']) => Object.fromEntries(Object.entries(h ?? {}).map(([k, x]) => [k, x![0]]));
      if (l.realHighs && l.players[pid].real) expect(values(fixed.players[pid].highs)).toEqual(own.get(pid) ?? {});
      else expect(fixed.players[pid].highs).toEqual(l.players[pid].highs);
      // the others' are untouched, the real ones included
      for (const p of Object.values(fixed.players)) if (p.pid !== pid) expect(p.highs).toEqual(l.players[p.pid].highs);
      // damaged highs on their own just go
      const odd = structuredClone(l);
      (odd.players[pid] as unknown as { highs: unknown }).highs = { pts: [3, 2027] };
      expect(migrate(odd).players[pid].highs).toBeUndefined();
    }

    // record news stays quiet in the book's first season, then reports a league record once
    {
      const l = played(6);
      const before = l.news.length;
      const res = structuredClone(l.games.find((g) => g.type === 'regular')!);
      const star = res.home.players.find((b) => b.min > 0)!;
      // (a 60-point night is news even in the first season: BIG_NIGHT)
      {
        const x = structuredClone(l);
        const big: GameResult = { ...structuredClone(res), gid: 999_003 };
        big.home.players.find((b) => b.pid === star.pid)!.pts = 67;
        recordNews(x, big, recordGame(x, big));
        const told = x.news.slice(before).filter((n) => n.kind === 'record');
        expect(told).toHaveLength(1);
        expect(`${told[0].head ?? ''} ${told[0].text}`).toContain('67 points');
        if (told[0].head) expect(told[0].text).toContain('the most in a game in this league');
        expect(recordsHeld(x, big)).toEqual([expect.objectContaining({ scope: 'league', stat: 'pts', v: 67 })]);
      }
      star.pts = 59;
      const first: GameResult = { ...res, gid: 999_001 };
      recordNews(l, first, recordGame(l, first));
      expect(l.news.length).toBe(before);
      expect(recordsHeld(l, first)).toEqual([]);
      // a season later the same night is news (a league record, and the franchise's isn't claimed twice)
      const next: GameResult = { ...structuredClone(first), gid: 999_002, season: l.season + 1 };
      next.home.players.find((b) => b.pid === star.pid)!.pts = 100;
      recordNews(l, next, recordGame(l, next));
      const news = l.news.slice(before).filter((n) => n.kind === 'record');
      expect(news).toHaveLength(1);
      // (another team's: the front page, its headline about the record; the user's own game's story leads with it instead)
      const userGame = next.home.tid === l.userTid || next.away.tid === l.userTid;
      if (userGame) expect(news[0].text).toContain('100 points (a league record)');
      else expect(news[0]).toMatchObject({ head: expect.stringContaining('sets a league record: 100 points'), weight: 3 });
      expect(`${news[0].head ?? ''} ${news[0].text}`).not.toContain('Knicks record');
    }

    // a real league's book opens with the NBA's games since 1996-97 (records.json): its records are
    // measured against them, say how far back they reach, and the 73-9 Warriors' season has its moment
    {
      const real = played(6);
      applyHistory(real, { ...(historyJson as unknown as HistoryData), records: recordsJson as unknown as RecordsData });
      const book = real.records!;
      expect(book.from).toBe((recordsJson as unknown as RecordsData).from);
      expect(book.since).toBe(real.startSeason);
      const pts = book.league.reg.players.pts!.map((r) => gameMark(real, r));
      expect(pts[0].v).toBeGreaterThanOrEqual(81);
      expect(pts.find((m) => m.name === 'Kobe Bryant')).toMatchObject({ v: 81, pid: expect.any(Number) });
      // (a player long gone carries his name under a pid below zero; one still playing is linked)
      expect(pts.filter((m) => m.season < real.startSeason).every((m) => m.pid < 0 === !real.players[m.pid])).toBe(true);
      expect(pts.some((m) => real.players[m.pid])).toBe(true);
      // a save keeps it (the save check takes every row)
      expect(migrate(structuredClone(real)).records!.league.reg.players.pts![0]).toEqual(book.league.reg.players.pts![0]);
      // the book isn't young: a 60-point night in the first week is no league record, and a franchise's says "since 1996-97"
      const res = structuredClone(real.games.find((g) => g.type === 'regular' && g.home.tid !== real.userTid && g.away.tid !== real.userTid)!);
      const star = res.home.players.find((b) => b.min > 0)!;
      const night = (pts: number, gid: number) => {
        const x = structuredClone(real);
        const g: GameResult = { ...structuredClone(res), gid };
        g.home.players.find((b) => b.pid === star.pid)!.pts = pts;
        const before = x.news.length;
        recordNews(x, g, recordGame(x, g));
        return x.news.slice(before).filter((n) => n.kind === 'record');
      };
      const sixty = night(60, 999_201);
      expect(sixty.every((n) => !n.head && !n.text.includes('league record') && n.text.includes('record since 1996-97'))).toBe(true);
      // past Bam Adebayo's 83 but short of Wilt Chamberlain's 100: the most since 1996-97, and the record still his
      const ninety = night(90, 999_202);
      expect(ninety[0]).toMatchObject({ head: expect.stringContaining('scores 90 points, the most since 1996-97'), weight: 3 });
      expect(ninety[0].text).toContain("The record is still Wilt Chamberlain's 100 for the Philadelphia Warriors in 1961-62");
      expect(night(101, 999_203)[0]).toMatchObject({ head: expect.stringContaining('sets a league record: 101 points') });
      // the wins that equal or pass the most in a season, and the streak that equals the Lakers' 33
      const wins = (won: number, streak = 1) => {
        const x = structuredClone(real);
        const g = structuredClone(res);
        g.home.pts = g.away.pts + 5;
        Object.assign(
          x.teams[g.home.tid].seasons.find((s) => s.season === g.season)!,
          { won, lost: 9, streak },
        );
        const before = x.news.length;
        recordNews(x, g, []);
        return x.news.slice(before).map((n) => `${n.head} ${n.text}`);
      };
      expect(wins(71)).toEqual([]);
      expect(wins(72)[0]).toContain('level with the 1995-96 Chicago Bulls (72-10). Only the 2015-16 Golden State Warriors (73-9) won more');
      expect(wins(73)[0]).toMatch(/^73 wins: the .+ tie the record/);
      expect(wins(74)[0]).toMatch(/^74 wins: the .+ pass the record.*past the 2015-16 Golden State Warriors \(73-9\)/);
      expect(wins(40, 33)[0]).toContain('level with the 1971-72 Los Angeles Lakers (33)');
    }

    // what one game did to the book
    {
      const l = played(6);
      const base = l.games.find((g) => g.type === 'regular')!;
      /** The same night, a season later (the book's news counts by then), with these points for the home side's first players in box order. */
      const night = (gid: number, pts: number[], type: GameResult['type'] = 'regular'): GameResult => {
        const g: GameResult = { ...structuredClone(base), gid, season: l.season + 1, type };
        g.home.players.filter((b) => b.min > 0).forEach((b, i) => (b.pts = pts[i] ?? 0));
        return g;
      };

      // the night's best mark on a list is its record, not every man who passed the old best in turn
      {
        const x = structuredClone(l);
        const g = night(999_201, [100, 120, 110]);
        // (the home side's notes: the away side replays its own night from the book, and its top scorer can
        // tie the franchise best he set that night)
        const notes = recordGame(x, g).filter((n) => n.stat === 'pts' && !n.team && n.tid === g.home.tid);
        const [, second] = g.home.players.filter((b) => b.min > 0);
        expect(notes.map((n) => [n.scope, n.kind, n.pid, n.v])).toEqual([
          ['league', 'record', second.pid, 120],
          ['team', 'record', second.pid, 120],
        ]);
      }

      // a list the book had nothing on yet only starts: no franchise playoff "record" on its first postseason night
      {
        const x = structuredClone(l);
        expect(x.records!.league.post.players.pts).toBeUndefined();
        // (the away side held to nothing: its top scorer's night in the shared game would start the list too)
        const quiet = (g: GameResult) => (g.away.players.forEach((b) => (b.pts = 0)), g);
        expect(recordGame(x, quiet(night(999_202, [12, 25, 8], 'playoffs')))).toEqual([]);
        // the next night that beats it is one
        const notes = recordGame(x, quiet(night(999_203, [40], 'playoffs'))).filter((n) => n.stat === 'pts' && !n.team);
        expect(notes.map((n) => [n.scope, n.kind, n.v])).toEqual([
          ['league', 'record', 40],
          ['team', 'record', 40],
        ]);
      }

      // a share of the league's record that's also a franchise record names the number once
      {
        const x = structuredClone(l);
        const g = night(999_204, [150]);
        recordGame(x, g);
        // the other side's man matches it a season later still: the league's tied, his franchise's set
        const t: GameResult = { ...structuredClone(base), gid: 999_205, season: l.season + 2 };
        const him = t.away.players.find((b) => b.min > 0)!;
        him.pts = 150;
        const before = x.news.length;
        recordNews(x, t, recordGame(x, t));
        const text = x.news.slice(before).find((n) => n.pids.includes(him.pid))!.text;
        expect(text).toContain(`150 points (tying the league record, a ${x.teams[t.away.tid].name} record)`);
        expect(text.match(/150 points/g)).toHaveLength(1);
      }

      // a save from before the book reads back this season's results only: last season's are just the user's games
      {
        const x = structuredClone(l);
        delete x.records;
        const old: GameResult = { ...structuredClone(base), gid: 999_206, season: l.season - 1 };
        old.home.players.find((b) => b.min > 0)!.pts = 140;
        x.games.unshift(old);
        backfillRecords(x);
        expect(x.records!.since).toBe(l.season);
        expect(x.records!.league.reg.players.pts![0][0]).toBe(l.records!.league.reg.players.pts![0][0]);
      }

      // a retiree whose season can stand in the single-season lists is one compaction keeps
      const p = { stats: [{ ...blankStats(2020, 0, false), gp: 40 }] } as unknown as Parameters<typeof mayHoldSeasonRecord>[1];
      expect(mayHoldSeasonRecord(l, p)).toBe(false);
      // (a season without a stored team record counts 82 games; split between teams it counts whole)
      p.stats.push({ ...blankStats(2020, 1, false), gp: 20 });
      expect(mayHoldSeasonRecord(l, p)).toBe(true);
      expect(mayHoldSeasonRecord(l, { stats: [{ ...blankStats(2027, 0, true), gp: 4 }] } as unknown as Parameters<typeof mayHoldSeasonRecord>[1])).toBe(true);
      // real seasons are history from before the league
      expect(mayHoldSeasonRecord(l, { stats: [{ ...blankStats(2026, 0, false), gp: 80, real: true }] } as unknown as Parameters<typeof mayHoldSeasonRecord>[1])).toBe(false);
    }

    // single-season and career records: per-game and percentage records need 70% of the games and enough makes; totals need none
    {
      const s = { ...blankStats(2027, 0, false), gp: 57, fgm: 400, fga: 800, tpm: 90, tpa: 200, ftm: 200, fta: 220 };
      expect(qualifies(s, 'ppg', 82, false)).toBe(false);
      expect(qualifies({ ...s, gp: 58 }, 'ppg', 82, false)).toBe(true);
      expect(qualifies({ ...s, gp: 58, tpm: 81 }, 'tp', 82, false)).toBe(false);
      expect(qualifies(s, 'pts', 82, false)).toBe(true);
      // a season part-way through counts its games so far
      expect(qualifies({ ...s, gp: 14, fgm: 75 }, 'fg', 20, false)).toBe(true);
    }
    // read from the stats every player keeps, best first, real seasons left out
    {
      const l = at[30];
      const rows = seasonRecords(l, 'pts');
      expect(rows.length).toBe(10);
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].v).toBeGreaterThanOrEqual(rows[i].v);
      expect(rows.every((r) => r.season === l.season)).toBe(true);
      const careers = careerLeaders(l, 'pts');
      expect(careers[0].v).toBe(rows[0].v);
      // franchise lists are its own lines
      const tid = l.userTid;
      for (const r of seasonRecords(l, 'pts', { tid })) expect(r.tid).toBe(tid);
    }
    // team seasons count only once the regular season is over
    expect(teamSeasonRecords(at[10], 'wins')).toEqual([]);

    // the recap names the records a game holds once the book has a season behind it
    {
      const l = played(6);
      const res = structuredClone(l.games.find((g) => g.type === 'regular')!);
      const star = res.home.players.find((b) => b.min > 0)!;
      // (under BIG_NIGHT: a first season's 59 holds nothing yet)
      star.pts = 59;
      const first: GameResult = { ...res, gid: 999_101 };
      recordGame(l, first);
      expect(recordsHeld(l, first)).toEqual([]);
      const next: GameResult = { ...structuredClone(first), gid: 999_102, season: l.season + 1 };
      next.home.players.find((b) => b.pid === star.pid)!.pts = 101;
      recordGame(l, next);
      const held = recordsHeld(l, next);
      expect(held.find((r) => r.stat === 'pts' && !r.team)).toMatchObject({ scope: 'league', pid: star.pid, v: 101 });
      // named once, as the league's, not also as the franchise's
      expect(held.filter((r) => r.stat === 'pts' && !r.team)).toHaveLength(1);
      expect(recordWhat({ stat: 'margin', team: true, v: 41 })).toBe('a 41-point win');
      expect(recordWhat({ stat: 'margin', team: true, v: 18 })).toBe('an 18-point win');
      expect(recordWhat({ stat: 'reb', v: 25 })).toBe('25 rebounds');
    }

    // a player who leaves the save leaves his name on his marks, and the book reads the same
    {
      const l = played(12);
      const row = l.records!.league.reg.players.pts![0];
      const p = l.players[row[1]];
      const before = gameMark(l, row);
      freezeRecordNames(l, p);
      delete l.players[p.pid];
      expect(gameMark(l, row)).toEqual(before);
      expect(row[7]).toBe(before.name);
    }
  }, 120_000);
});
