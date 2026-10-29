// Keys to the game: three numbers for tonight read from the games before it, the same on the
// pre-game screen, in the live game and in the stored result, graded with the result. And the
// coach's moves in a live game and what each did (analysis/moves.ts): each measured while it was
// in effect against the stretch before it, and called better, worse or early against the noise.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { testLeague, toGameDay } from '../../state/__tests__/fixtures';
import { clearLive, prepareLive } from '../../state/live';
import { migrate } from '../../state/persistence';
import { userGameOnDay } from '../league/games';
import { teamSeason } from '../league/helpers';
import { simDay } from '../league/season';
import { gameKeys, gradeKey, keyState, keyValue } from '../analysis/keys';
import { coachMoves, moveRate, moveText, MOVE_BASE_TRIPS, MOVE_MIN_TRIPS } from '../analysis/moves';
import { defaultTactics, cloneTactics } from '../sim/tactics';
import type { PossLog } from '../sim/log';
import type { CoachMove, GameResult, League, LiveOp, ScheduledGame } from '../types';
import { nightLine, seasonCoaching, seasonCoachingLine } from '../analysis/debrief';

afterEach(() => clearLive());

/** A possession log: who had it, its points and how it finished. */
const trip = (off: 0 | 1, pts: number, finish: PossLog['finish'] = 'spotup'): PossLog => ({
  off,
  q: 1,
  clockStart: 600,
  clockEnd: 590,
  kind: 'half',
  finish,
  steps: [],
  pts,
  score: [0, 0],
  label: '',
  lines: [],
  on: [[], []],
  guards: {},
  scheme: 'man',
  help: 50,
});

describe('keys to the game and coach moves', () => {
  it('set keys from the right numbers and grade them, and measure and name the coach’s moves', () => {
    // keys to the game: on opening night come from the other coach and his roster: three at most, never two on one number
    {
      const l = testLeague('keys-open');
      const g = userGameOnDay(l, l.day) ?? l.schedule.find((x) => !x.played && (x.home === l.userTid || x.away === l.userTid))!;
      const keys = gameKeys(l, g);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.length).toBeLessThanOrEqual(3);
      expect(new Set(keys.map((k) => `${k.side}:${k.stat}`)).size).toBe(keys.length);
      for (const k of keys) {
        expect(k.target).toBeGreaterThan(0);
        expect(k.goal).toMatch(/\d/);
        expect(k.why.length).toBeGreaterThan(5);
      }
      // only the user's games have keys
      const other = l.schedule.find((x) => x.home !== l.userTid && x.away !== l.userTid)!;
      expect(gameKeys(l, other)).toEqual([]);
    }

    // read the season once there are games, stay put through the day, and are graded with the result as the preview set them
    {
      const l = testLeague('keys-season', 5);
      for (let i = 0; i < 30; i++) simDay(l);
      toGameDay(l);
      let g = userGameOnDay(l, l.day)!;
      let before = gameKeys(l, g);
      // (a night against an opponent that stands out on three numbers, as most do a month in)
      for (let next = 0; before.length < 3 && next < 5; next++) {
        simDay(l);
        toGameDay(l);
        g = userGameOnDay(l, l.day)!;
        before = gameKeys(l, g);
      }
      expect(before.length).toBe(3);
      // the season's own numbers name a rank or a scorer's average
      expect(before.some((k) => /of 30|a game/.test(k.why))).toBe(true);
      // the day's other games (played before the live game) don't move them
      const lg = prepareLive(l)!;
      expect(gameKeys(l, g)).toEqual(before);
      lg.simTo('end');
      const res = lg.commit(l);
      expect(res.keys?.map((k) => k.goal)).toEqual(before.map((k) => k.goal));
      for (const [i, k] of before.entries()) {
        const v = keyValue(k, res, lg.userSide);
        expect(res.keys![i].value).toBe(v);
        if (v !== null) expect(res.keys![i].met).toBe(k.dir === 'max' ? v <= k.target : v >= k.target);
      }
      clearLive();
    }

    // on a new season's first nights read last season's team totals, not the few meetings its results keep
    {
      const l = testLeague('keys-last', 4);
      for (let i = 0; i < 30; i++) simDay(l);
      // what was played becomes last season, its results kept as a new season keeps them: the user's only
      const S = l.season;
      for (const t of l.teams) for (const s of t.seasons) s.season = S - 1;
      for (const p of Object.values(l.players)) for (const s of p.stats) if (s.season === S) s.season = S - 1;
      l.games = l.games.filter((g) => g.home.tid === l.userTid || g.away.tid === l.userTid).map((g) => ({ ...g, season: S - 1 }));
      for (const t of l.teams) teamSeason(t, S);
      // (an opponent the user met whose numbers last season give a full set of three keys)
      const against = (opp: number): ScheduledGame => ({ gid: l.nextGid, day: 0, home: l.userTid, away: opp, type: 'regular' });
      const met = [...new Set(l.games.filter((g) => g.type === 'regular').map((g) => (g.home.tid === l.userTid ? g.away.tid : g.home.tid)))];
      const opp = met.find((t) => gameKeys(l, against(t)).length === 3)!;
      expect(opp).toBeDefined();
      // five meetings with it (the Cup can make five): enough for a team's own sample
      const meeting = l.games.find((g) => g.type === 'regular' && (g.home.tid === opp || g.away.tid === opp))!;
      for (let i = l.games.filter((g) => g.home.tid === opp || g.away.tid === opp).length; i < 5; i++) l.games.push({ ...structuredClone(meeting), gid: l.nextGid++ });
      const g: ScheduledGame = { ...against(opp), gid: l.nextGid++ };
      const keys = gameKeys(l, g);
      expect(keys.length).toBe(3);
      expect(keys.some((k) => /of 30 last season|last season, the most/.test(k.why))).toBe(true);
      // the same with no results kept at all: they come from the season's totals
      expect(gameKeys({ ...l, games: [] }, g)).toEqual(keys);
    }

    // say where a key stands live: decided early, on pace, behind, and void for a player who sat
    {
      const max = { dir: 'max' as const, target: 10 };
      const min = { dir: 'min' as const, target: 27 };
      expect(keyState(max, 11, 0.5, false)).toBe('missed');
      expect(keyState(max, 4, 0.5, false)).toBe('on');
      expect(keyState(max, 7, 0.5, false)).toBe('behind');
      expect(keyState(max, 10, 1, true)).toBe('met');
      expect(keyState(min, 27, 0.7, false)).toBe('met');
      expect(keyState(min, 10, 0.5, false)).toBe('behind');
      expect(keyState(min, 14, 0.5, false)).toBe('on');
      expect(keyState(min, 26, 1, true)).toBe('missed');
      expect(keyState(max, null, 1, true)).toBe('void');
      // a scorer who didn't play: no verdict
      const res = { home: { players: [{ pid: 9, min: 0, pts: 0 }] }, away: { players: [] } } as unknown as GameResult;
      const grade = gradeKey(
        { id: 'star', title: 'Make him work', goal: 'Hold him to 24 points or fewer', why: '', side: 'them', stat: 'pts', pid: 9, dir: 'max', target: 24 },
        res,
        1,
      );
      expect(grade).toMatchObject({ value: null, met: null });
    }

    // read the offensive glass as a share of the misses, never decided before the end
    {
      const box = (orb: number, drb: number) => ({ t: { orb, drb }, players: [] });
      const res = { home: box(9, 30), away: box(12, 36) } as unknown as GameResult;
      // the user is home: his 9 offensive rebounds of the 9 + 36 chances on his misses
      expect(keyValue({ side: 'us', stat: 'orb' }, res, 0)).toBe(20);
      expect(keyValue({ side: 'them', stat: 'orb' }, res, 0)).toBe(29);
      const glass = { dir: 'max' as const, target: 27, stat: 'orb' as const };
      expect(keyState(glass, 29, 0.25, false)).toBe('behind');
      expect(keyState(glass, 25, 0.25, false)).toBe('on');
      expect(keyState(glass, 29, 1, true)).toBe('missed');
      const grade = gradeKey(
        { id: 'glass', title: 'Keep them off the glass', goal: 'Hold BOS to 27% of their misses or fewer', why: '', side: 'them', stat: 'orb', dir: 'max', target: 27 },
        res,
        0,
      );
      expect(grade).toMatchObject({ value: 29, met: false, pct: true });
    }

    // a damaged list in a save goes
    {
      const l = testLeague('keys-save');
      for (let i = 0; i < 6; i++) simDay(l);
      const mine = l.games.filter((g) => g.keys);
      expect(mine.length).toBeGreaterThan(0);
      const copy = structuredClone(l);
      const [a, b] = copy.games.filter((g) => g.keys);
      (a.keys as unknown[])[0] = { id: 'x', title: 3 };
      const keep = structuredClone(b.keys);
      const back = migrate(copy);
      expect(back.games.find((g) => g.gid === a.gid)!.keys).toBeUndefined();
      expect(back.games.find((g) => g.gid === b.gid)!.keys).toEqual(keep);
    }
    // coach moves
    {
      const names = (pid: number) => `P${pid}`;

      // what the night's moves were worth (measured after the final), in a line: worth so many points when
      // clear of even, too close to say inside two standard errors, the move that mattered most when one
      // clearly did; and the season's added up where it was measured
      {
        const worth = (pts: number, raw: number, se: number, top?: { text: string; pts: number; se: number }) =>
          ({ home: { tid: 3 }, away: { tid: 4 }, season: 2026, movesWorth: { pts, raw, se, win: 0.05, n: 200, moves: 4, ...(top && { top }) } }) as unknown as GameResult;
        // (a verdict and one number: the ± and how it was measured are the detail, a tap down)
        expect(nightLine(worth(1.8, 2.6, 0.9))).toMatchObject({ text: 'Your moves helped: about +1.8 points tonight', tone: 'good' });
        expect(nightLine(worth(-1.4, -2.2, 1.0), true)!.text).toBe("The staff's moves hurt: about −1.4 points tonight");
        const close = nightLine(worth(0.3, 0.5, 0.9, { text: 'Pick-and-roll coverage: Hedge → Drop', pts: 1.4, se: 0.6 }))!;
        expect(close).toMatchObject({ text: 'Your moves: too close to say tonight, +0.3 points', tone: 'dim' });
        expect(close.detail).toBe(
          'Measured to about ±0.9. The rest of the game was played 200 times, with 4 moves and without. Mattered most · Pick-and-roll coverage: Hedge → Drop · +1.4.',
        );
        expect(nightLine({ ...worth(0, 0, 1), movesWorth: undefined })).toBeNull();
        // moves only in crunch time (a late play call) are judged by the win chance, as the bench's late
        // calls are: a call that won it moves the margin a point and the result far more
        {
          const play = {
            kind: 'play',
            q: 4,
            clock: 5,
            text: 'Isolation: P5',
            end: 'off',
            before: { us: { poss: 0, pts: 0 }, them: { poss: 0, pts: 0 } },
            after: { us: { poss: 1, pts: 2 }, them: { poss: 0, pts: 0 } },
          };
          const late = (win: number, winSe: number | undefined, moves: object[] = [play]) => {
            const g = worth(0.2, 0.2, 0.3);
            return { ...g, moves, movesWorth: { ...g.movesWorth!, moves: moves.length, win, ...(winSe !== undefined && { winSe }) } } as GameResult;
          };
          expect(nightLine(late(0.09, 0.02))).toMatchObject({ text: 'Your call helped: +9% to win tonight', tone: 'good' });
          expect(nightLine(late(0.09, 0.06))).toMatchObject({ text: 'Your call: too close to say tonight, +9% to win', tone: 'dim' });
          expect(nightLine(late(0.09, 0.06))!.detail).toMatch(/^Measured to about ±6%\./);
          // (a reading from before its noise was kept: by the points)
          expect(nightLine(late(0.09, undefined))!.text).toBe('Your call: too close to say tonight, +0.2 points');
          // earlier moves: by the points, unless the win chance reads clearer
          const early = { ...play, kind: 'tactics', q: 2, clock: 300 };
          expect(nightLine(late(0.01, 0.02, [early, play]))!.text).toBe('Your moves: too close to say tonight, +0.2 points');
          expect(nightLine(late(-0.08, 0.02, [early, play]), true)).toMatchObject({ text: "The staff's moves hurt: −8% to win tonight", tone: 'bad' });
        }
        const league = {
          season: 2026,
          userTid: 3,
          games: [worth(1.8, 2.6, 0.9), worth(0.3, 0.5, 1.2), { ...worth(2, 2, 1), season: 2025 }, { ...worth(0, 0, 1), movesWorth: undefined }],
        } as unknown as League;
        expect(seasonCoaching(league)).toEqual({ pts: 2.1, raw: 3.1, se: 1.5, games: 2 });
        expect(seasonCoachingLine(league)).toBe('Your live coaching this season: +2.1 points over 2 games');
        expect(seasonCoachingLine({ ...league, games: league.games.slice(0, 1) })).toBeNull();
        expect(seasonCoaching({ ...league, userTid: 9 })).toBeNull();
      }

      // measure a change of coverage on their pick-and-roll trips while it was in effect, and name it as Tactics does
      {
        const before = defaultTactics();
        const after = cloneTactics(before);
        after.defense.pnr = 'hedge';
        // 20 trips each way before: their P&R scores 2 a trip; 20 after: 0.5
        const logs: PossLog[] = [];
        for (let i = 0; i < 20; i++) logs.push(trip(0, 1), trip(1, 2, 'pnrBH'));
        const at = logs.length;
        for (let i = 0; i < 20; i++) logs.push(trip(0, 1), trip(1, i % 2 ? 1 : 0, 'pnrBH'));
        const op: LiveOp = { at: 0, op: 'tactics', args: { tactics: after } };
        const [m] = coachMoves([{ op, log: at, q: 2, clock: 431.6, before }], logs, 0, names);
        expect(m).toMatchObject({ kind: 'tactics', q: 2, clock: 432, end: 'def', text: 'Ball-screen coverage: Drop → Hedge' });
        expect(m.before.focus).toEqual({ poss: 20, pts: 40 });
        expect(m.after.focus).toEqual({ poss: 20, pts: 10 });
        expect(moveRate(m)).toEqual({ what: 'focus', now: 0.5, was: 2, trips: 20 });
      }

      // measure a substitution over the stint it started, and a timeout over the trips either side of it
      {
        const logs: PossLog[] = [];
        for (let i = 0; i < 30; i++) logs.push(trip(0, i < 15 ? 0 : 2), trip(1, i < 15 ? 2 : 0));
        const moves = coachMoves(
          [
            { op: { at: 0, op: 'sub', args: { out: 1, in: 2 } }, log: 30, q: 1, clock: 300 },
            { op: { at: 0, op: 'timeout', args: {} }, log: 30, q: 1, clock: 300 },
          ],
          logs,
          0,
          names,
        );
        expect(moves.map((m) => m.text)).toEqual(['P2 in for P1', 'Timeout']);
        expect(moves[0].after).toMatchObject({ us: { poss: 15, pts: 30 }, them: { poss: 15, pts: 0 } });
        expect(moveRate(moves[0])).toMatchObject({ what: 'margin', now: 2 });
        // a timeout reads the eight trips each way either side of it
        expect(moves[1].before.us.poss + moves[1].before.them.poss).toBe(16);
        expect(moves[1].after.us.poss + moves[1].after.them.poss).toBe(16);
        // with the five on the floor known: only the trips the player brought in was on the floor (he
        // checks in at the next dead ball, two trips later, and goes off five trips after that)
        const on = logs.map((l, k) => ({ ...l, on: [k >= 32 && k < 42 ? [2, 3, 4, 5, 6] : [1, 3, 4, 5, 6], [7, 8, 9, 10, 11]] as [number[], number[]] }));
        const [sub] = coachMoves([{ op: { at: 0, op: 'sub', args: { out: 1, in: 2 } }, log: 30, q: 1, clock: 300 }], on, 0, names);
        expect(sub.after.us.poss + sub.after.them.poss).toBe(10);
        expect(sub.closed).toBe(true);
      }

      // the stretch before a move reaches back at least MOVE_BASE_TRIPS: a change a few trips after
      // another isn't "too early" for the rest of the night
      {
        const before = defaultTactics();
        const mid = cloneTactics(before);
        mid.defense.pnr = 'hedge';
        const after = cloneTactics(mid);
        after.defense.help = 80;
        const logs: PossLog[] = [];
        for (let i = 0; i < 60; i++) logs.push(trip(0, 1), trip(1, i < 30 ? 2 : 0));
        const moves = coachMoves(
          [
            { op: { at: 0, op: 'tactics', args: { tactics: mid } }, log: 50, q: 1, clock: 300, before },
            { op: { at: 0, op: 'tactics', args: { tactics: after } }, log: 60, q: 1, clock: 200, before: mid },
          ],
          logs,
          0,
          names,
          true,
        );
        expect(moves).toHaveLength(2);
        expect(moves[1].before.them.poss).toBeGreaterThanOrEqual(MOVE_BASE_TRIPS);
        expect(moveRate(moves[1]).was).not.toBeNull();
      }

      // a move reads as its rate since against the stretch before, and nothing more: no verdict. (A move
      // made after a hot stretch reads better afterwards whatever it did, the rate falling back toward
      // the usual either way: the replayed night says whether it worked.) What it's aimed at is the
      // rate once it has the trips, each side of it; a baseline of a few trips falls back to that end of the floor
      {
        const t = { poss: MOVE_MIN_TRIPS - 1, pts: MOVE_MIN_TRIPS };
        const m: CoachMove = { kind: 'tactics', q: 1, clock: 100, text: 'x', end: 'off', before: { us: { poss: 20, pts: 22 }, them: t }, after: { us: t, them: t } };
        expect(moveRate(m)).toEqual({ what: 'us', now: MOVE_MIN_TRIPS / (MOVE_MIN_TRIPS - 1), was: 1.1, trips: MOVE_MIN_TRIPS - 1 });
        expect(Object.keys(moveRate(m))).not.toContain('verdict');
        // (a hot stretch of theirs, 2.00 a trip over 12, then the usual 1.10 over 20 with nothing changed: the line has the two numbers only)
        const hot: CoachMove = {
          kind: 'tactics',
          q: 2,
          clock: 300,
          text: 'x',
          end: 'def',
          aim: 'pick-and-roll',
          before: { us: { poss: 30, pts: 33 }, them: { poss: 30, pts: 36 }, focus: { poss: 12, pts: 24 } },
          after: { us: { poss: 30, pts: 33 }, them: { poss: 30, pts: 33 }, focus: { poss: 20, pts: 22 } },
        };
        expect(moveRate(hot)).toEqual({ what: 'focus', now: 1.1, was: 2, trips: 20 });
        hot.before.focus = { poss: 3, pts: 6 };
        expect(moveRate(hot).what).toBe('them');
        // (a move on the game's first trips: no "0.00 before" off two of them)
        expect(moveRate({ ...m, before: { us: { poss: 2, pts: 0 }, them: { poss: 2, pts: 3 } } }).was).toBeNull();
      }

      // moves made together at a break are one move, measured from the break to the next one of
      // their kind against the stretch before (one by one, each had an empty stretch and stayed early)
      {
        const logs: PossLog[] = [];
        for (let i = 0; i < 40; i++) logs.push(trip(0, i < 20 ? 0 : 2), trip(1, i < 20 ? 2 : 0));
        const t0 = defaultTactics();
        const t1 = cloneTactics(t0);
        t1.defense.pnr = 'hedge';
        const t2 = cloneTactics(t1);
        t2.defense.help = 80;
        const at = (op: LiveOp) => ({ op, log: 40, q: 2, clock: 0 });
        const moves = coachMoves(
          [
            at({ at: 0, op: 'sub', args: { out: 1, in: 2 } }),
            at({ at: 0, op: 'tactics', args: { tactics: t1 } }),
            at({ at: 0, op: 'sub', args: { out: 3, in: 4 } }),
            { ...at({ at: 0, op: 'tactics', args: { tactics: t2 } }), log: 42 },
          ].map((m, i) => ({ ...m, before: i === 1 ? t0 : i === 3 ? t1 : undefined })),
          logs,
          0,
          names,
        );
        expect(moves.map((m) => m.kind)).toEqual(['sub', 'tactics']);
        expect(moves[0].text).toBe('P2 in for P1 · P4 in for P3');
        expect(moves[0].before.us.poss).toBe(20);
        expect(moves[0].after.us.poss).toBe(20);
        expect(moveRate(moves[0])).toMatchObject({ what: 'margin', now: 2, was: -2 });
        // (the two tactics changes two logs apart: one move, from the first's tactics to the last's)
        expect(moves[1].text).toContain('Hedge');
        expect(moves[1].after.us.poss + moves[1].after.them.poss).toBe(38);
      }

      // a late move: its stretch runs to the final buzzer, short of the trips one in effect waits for,
      // and once the game is over it's judged on what it had; a play called is the trip it ran on
      {
        const logs: PossLog[] = [];
        for (let i = 0; i < 40; i++) logs.push(trip(0, 1), trip(1, 2));
        // (the last eight trips each, in the fourth quarter)
        for (let i = 0; i < 8; i++) logs.push({ ...trip(0, 1), q: 4, ...(i === 0 ? { set: { id: 'horns' as const, pid: 5, n: 1 }, pts: 3 } : {}) }, { ...trip(1, 0), q: 4 });
        const marks = [
          { op: { at: 0, op: 'sub', args: { out: 1, in: 2 } } as LiveOp, log: 80, q: 4, clock: 120 },
          { op: { at: 0, op: 'play', args: { set: 'horns' } } as LiveOp, log: 80, q: 4, clock: 120 },
        ];
        const [live, play] = coachMoves(marks, logs, 0, names);
        expect(live.closed).toBeUndefined();
        const [late] = coachMoves(marks, logs, 0, names, true);
        expect(late.closed).toBe(true);
        expect(moveRate(late)).toMatchObject({ what: 'margin', trips: 8 });
        expect(play).toMatchObject({ kind: 'play', text: 'Horns: P5', call: { id: 'horns', pid: 5 }, after: { us: { poss: 1, pts: 3 } } });
        // a clear-out called late is the trip that ran it; once the game is over, one whose basket put us
        // ahead for good in the last shot clock won it, and one that tied it there sent it to overtime
        const end = (q: number, clockEnd: number, pts: number, score: [number, number], off: 0 | 1 = 0, more: Partial<PossLog> = {}): PossLog => ({
          ...trip(off, pts),
          q,
          clockEnd,
          score,
          ...more,
        });
        const iso = { op: { at: 0, op: 'play', args: { set: 'iso', pid: 5 } } as LiveOp, log: 1, q: 4, clock: 14 };
        const won = [end(4, 20, 2, [100, 100], 1), end(4, 3, 2, [102, 100], 0, { iso: 5 }), end(4, 0, 0, [102, 100], 1)];
        expect(coachMoves([iso], won, 0, names, true)[0]).toMatchObject({
          text: 'Iso: P5',
          call: { id: 'iso', pid: 5, late: { how: 'won', clock: 3 } },
          after: { us: { poss: 1, pts: 2 } },
        });
        // (not before the game is over, nor when they answered)
        expect(coachMoves([iso], won, 0, names)[0].call?.late).toBeUndefined();
        expect(coachMoves([iso], [...won.slice(0, 2), end(4, 0, 3, [102, 103], 1)], 0, names, true)[0].call?.late).toBeUndefined();
        const tied = [end(4, 20, 2, [98, 100], 1), end(4, 3, 2, [100, 100], 0, { iso: 5 }), end(4, 0, 0, [100, 100], 1), end(5, 280, 3, [103, 100])];
        expect(coachMoves([iso], tied, 0, names, true)[0].call?.late).toEqual({ how: 'tied', clock: 3 });
      }

      // name game-specific orders: a matchup, a hunt
      {
        const a = defaultTactics();
        const b = cloneTactics(a);
        b.defense.matchups = { 7: 3 };
        b.offense.huntTarget = 11;
        expect(moveText(a, b, names)).toBe('P3 guards P7 · Attack P11');
      }
    }
  }, 120_000);
});
