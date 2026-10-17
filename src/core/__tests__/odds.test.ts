// The season forecast: chances that add up (six top-six seeds and eight playoff teams a conference,
// one champion, one No. 1 pick, fourteen lottery teams), never a draw from the league's random stream
// and the same forecast for the same league, clinched and eliminated teams at exactly 100% and 0%,
// the playoffs read from the series as they stand, a game taken as won helping the team that won
// it, the user's weekly trail, and saves.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { migrate } from '../../state/persistence';
import { forecast, forecastable, gameStakes, leagueForecast, pct, rosterWorth, type Forecast } from '../analysis/odds';
import { simDay } from '../league/season';
import { standings } from '../league/standings';
import { userGameOnDay } from '../league/games';
import type { League, Player } from '../types';

const sum = (f: Forecast, k: (t: Forecast['teams'][number]) => number, conf?: 'E' | 'W', l?: League) =>
  f.teams.filter((t) => !conf || l!.teams[t.tid].conf === conf).reduce((a, t) => a + k(t), 0);

function expectConsistent(l: League, f: Forecast) {
  for (const conf of ['E', 'W'] as const) {
    expect(sum(f, (t) => t.top6, conf, l)).toBeCloseTo(6, 6);
    expect(sum(f, (t) => t.reach[0], conf, l)).toBeCloseTo(8, 6);
    expect(sum(f, (t) => t.seed1, conf, l)).toBeCloseTo(1, 6);
  }
  expect(sum(f, (t) => t.reach[1])).toBeCloseTo(8, 6);
  expect(sum(f, (t) => t.reach[2])).toBeCloseTo(4, 6);
  expect(sum(f, (t) => t.reach[3])).toBeCloseTo(2, 6);
  expect(sum(f, (t) => t.reach[4])).toBeCloseTo(1, 6);
  expect(sum(f, (t) => t.pick1)).toBeCloseTo(1, 6);
  expect(sum(f, (t) => t.top4)).toBeCloseTo(4, 6);
  expect(sum(f, (t) => t.lottery)).toBeCloseTo(14, 6);
  for (const t of f.teams) {
    // each stage is a subset of the one before
    for (let r = 1; r < 5; r++) expect(t.reach[r]).toBeLessThanOrEqual(t.reach[r - 1] + 1e-12);
    expect(t.lo).toBeLessThanOrEqual(t.w + 1e-9);
    expect(t.hi).toBeGreaterThanOrEqual(t.w - 1e-9);
    expect(t.reach[0] + t.lottery).toBeCloseTo(1, 6);
  }
}

describe('the season forecast', () => {
  let l: League;
  let mid: League;
  let late: League;
  let playoffs: League;
  beforeAll(() => {
    l = testLeague('odds');
    // (the league's streams of its own are seeded from its id, which reads the clock: pinned, every run plays the same season)
    l.id = 'lg_odds';
    for (let i = 0; i < 30; i++) simDay(l);
    mid = structuredClone(l);
    while (l.day < 150) simDay(l);
    late = structuredClone(l);
    for (let i = 0; i < 500 && l.phase !== 'playoffs'; i++) simDay(l);
    // a few days into the playoffs: series under way
    for (let i = 0; i < 4; i++) simDay(l);
    playoffs = l;
  }, 120_000);

  it('before the first game reads the rosters, and adds up', () => {
    const pre = testLeague('odds-pre');
    pre.id = 'lg_odds_pre';
    expect(forecastable(pre)).toBe(true);
    const f = forecast(pre)!;
    expect(f.preseason).toBe(true);
    expectConsistent(pre, f);
    // the most talented roster is a favourite; the projected records add up to a league's worth
    expect(Math.abs(sum(f, (t) => t.w) - 41 * 30)).toBeLessThan(5);
    const best = [...f.teams].sort((a, b) => b.reach[4] - a.reach[4])[0];
    expect(best.reach[4]).toBeGreaterThan(1 / 30);
  });

  it("never draws from the league's random stream, and the same league gets the same forecast", () => {
    const x = structuredClone(mid);
    const before = JSON.stringify(x);
    const a = forecast(x)!;
    const b = forecast(x)!;
    expect(JSON.stringify(x)).toBe(before);
    expect(a).toEqual(b);
    expectConsistent(x, a);
    // the screens share one, worked out once for the league as it is
    expect(leagueForecast(x)).toBe(leagueForecast(x));
  });

  it('mid-season, a better record and roster mean better odds', () => {
    const f = forecast(mid)!;
    const st = standings(mid);
    const rank = new Map(st.map((r) => [r.tid, r.confRank]));
    for (const conf of ['E', 'W'] as const) {
      const rows = f.teams.filter((t) => mid.teams[t.tid].conf === conf);
      const top = rows.filter((t) => rank.get(t.tid)! <= 3);
      const bottom = rows.filter((t) => rank.get(t.tid)! >= 13);
      const avg = (xs: typeof rows) => xs.reduce((a, t) => a + t.reach[0], 0) / xs.length;
      expect(avg(top)).toBeGreaterThan(avg(bottom));
    }
  });

  it('late in the season, a clinched place reads 100% and an eliminated team 0%, exactly', () => {
    const f = forecast(late)!;
    expectConsistent(late, f);
    const marks = new Map(standings(late).map((r) => [r.tid, r.clinched]));
    expect([...marks.values()].some(Boolean)).toBe(true);
    for (const t of f.teams) {
      if (marks.get(t.tid) === 'x') expect([t.top6, t.reach[0], t.clinched]).toEqual([1, 1, true]);
      if (marks.get(t.tid) === 'p') expect(t.top6 + t.playIn).toBeCloseTo(1, 9);
      if (marks.get(t.tid) === 'e') expect([t.reach[0], t.lottery, t.out]).toEqual([0, 1, true]);
    }
  });

  it('in the playoffs, starts from the series as they stand', () => {
    const f = forecast(playoffs)!;
    expect(f.seeded).toBe(true);
    expectConsistent(playoffs, f);
    for (const s of playoffs.playoffs.filter((x) => x.round === 1)) {
      for (const tid of [s.high, s.low]) {
        expect(f.teams[tid].reach[0]).toBe(1);
        expect(f.teams[tid].clinched).toBe(true);
      }
      // a series a team has won, or lost, is settled
      if (s.winner !== undefined) {
        expect(f.teams[s.winner].reach[1]).toBe(1);
        expect(f.teams[s.winner === s.high ? s.low : s.high].reach[1]).toBe(0);
      }
    }
    // up three games or more, a team is a big favourite in its series
    const up = playoffs.playoffs.find((s) => s.winner === undefined && Math.abs(s.highWins - s.lowWins) >= 2);
    if (up) {
      const lead = up.highWins > up.lowWins ? up.high : up.low;
      expect(f.teams[lead].reach[up.round]).toBeGreaterThan(0.5);
    }
    // the lottery's fourteen are settled too
    const out = playoffs.teams.filter((t) => !playoffs.playoffs.some((s) => s.round === 1 && (s.high === t.tid || s.low === t.tid)));
    for (const t of out) expect(f.teams[t.tid].lottery).toBe(1);
  });

  it('a game taken as won helps the team that won it, from the same stream', () => {
    const x = structuredClone(mid);
    const g = userGameOnDay(x, x.day) ?? x.schedule.find((s) => s.type === 'regular' && !s.played)!;
    const win = forecast(x, { fixed: { gid: g.gid, homeWon: true } })!;
    const loss = forecast(x, { fixed: { gid: g.gid, homeWon: false } })!;
    // every simulated season is the same but for that game: exactly one more win, and (but for the play-in's draws) better odds
    expect(win.teams[g.home].w - loss.teams[g.home].w).toBeCloseTo(1, 9);
    expect(win.teams[g.home].reach[0]).toBeGreaterThanOrEqual(loss.teams[g.home].reach[0] - 0.01);
    expect(win.teams[g.away].reach[0]).toBeLessThanOrEqual(loss.teams[g.away].reach[0] + 0.01);
    // the preview's stakes, from the team's side; nothing for a game it isn't in, or one already played
    const st = gameStakes(x, g.gid, g.away)!;
    expect(st.win).toBeGreaterThanOrEqual(st.loss - 0.01);
    expect(gameStakes(x, g.gid, x.teams.find((t) => t.tid !== g.home && t.tid !== g.away)!.tid)).toBeNull();
    const played = x.schedule.find((s) => s.played)!;
    expect(gameStakes(x, played.gid, played.home)).toBeNull();
  });

  it("keeps a weekly trail of the user's odds, and a damaged one goes on load", () => {
    const tr = late.oddsTrail!;
    expect(tr.season).toBe(late.season);
    expect(tr.tid).toBe(late.userTid);
    // a point a week, in tenths of a percent
    expect(tr.pts.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < tr.pts.length; i++) expect(tr.pts[i][0] - tr.pts[i - 1][0]).toBe(7);
    for (const p of tr.pts) for (const v of [p[1], p[2]]) expect(v >= 0 && v <= 1000 && Number.isInteger(v)).toBe(true);
    expect(JSON.stringify(tr).length).toBeLessThan(800);
    expect(migrate(structuredClone(late)).oddsTrail).toEqual(tr);
    const bad = structuredClone(late) as unknown as { oddsTrail: { pts: unknown[] } };
    bad.oddsTrail.pts.push([1, 2000, 0]);
    expect(migrate(bad).oddsTrail).toBeUndefined();
  });

  it('a forecast is quick enough to work out when a screen opens', () => {
    const t0 = performance.now();
    forecast(mid);
    expect(performance.now() - t0).toBeLessThan(2500);
  });

  it('nothing to forecast once the Finals are won', () => {
    const done = structuredClone(playoffs);
    for (let i = 0; i < 80 && forecastable(done); i++) simDay(done);
    expect(forecastable(done)).toBe(false);
    expect(forecast(done)).toBeNull();
  });
});

describe('what a roster is worth over the games left', () => {
  const p = (pid: number, ovr: number, out = 0) => ({ pid, ovr, injury: out ? { type: 'x', gamesRemaining: out, gamesTotal: out, severity: 'minor' } : null }) as unknown as Player;
  it('an injured star counts for the games he will be back for', () => {
    const team = [p(1, 90), ...Array.from({ length: 11 }, (_, i) => p(i + 2, 72 - i))];
    const healthy = rosterWorth(team, 40);
    const outAll = rosterWorth([p(1, 90, 60), ...team.slice(1)], 40);
    const outHalf = rosterWorth([p(1, 90, 20), ...team.slice(1)], 40);
    expect(outAll).toBeLessThan(outHalf);
    expect(outHalf).toBeLessThan(healthy);
    expect(outHalf).toBeCloseTo((healthy + outAll) / 2, 6);
  });

  it('reads chances the way the screens show them', () => {
    expect(pct(0.643)).toBe('64%');
    expect(pct(1)).toBe('>99%');
    expect(pct(1, true)).toBe('100%');
    expect(pct(0)).toBe('<1%');
    expect(pct(0, true)).toBe('—');
    expect(pct(0.003)).toBe('<1%');
  });
});
