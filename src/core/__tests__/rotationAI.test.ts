import { describe, expect, it } from 'vitest';
import { autoRotation, roleMemory, rosterSeason, sortByPosition } from '../ai/coachAI';
import { blankStats, generatePlayer, DEFAULT_SCALE } from '../playerGen';
import { Rng } from '../random';
import type { Player } from '../types';

const SEASON = 2027;

/** A 14-man roster with a ratings snapshot for this season and (optionally) last season's minutes. */
function roster(seed: number, lastMpg?: (p: Player, i: number) => number | null): Player[] {
  const rng = new Rng(seed);
  const ps: Player[] = [];
  for (let i = 0; i < 14; i++) {
    const talent = i < 3 ? 1.2 : i < 8 ? 0.3 : -0.6;
    const p = generatePlayer(rng, { pid: i, season: SEASON, tid: 0, age: 26, talent: talent - i * 0.02, scale: DEFAULT_SCALE });
    p.ovr = 84 - i * 1.5;
    p.ratings.end = 55;
    p.ratingsHistory = [{ season: SEASON, ovr: p.ovr, pot: p.ovr, r: { ...p.ratings } }];
    const mpg = lastMpg?.(p, i);
    if (mpg != null) {
      const s = blankStats(SEASON - 1, 0, false);
      s.real = true;
      s.gp = 70;
      s.min = mpg * 70;
      s.gs = mpg >= 28 ? 70 : 0;
      p.stats.push(s);
    }
    ps.push(p);
  }
  return ps;
}

const total = (m: Record<number, number>) => Object.values(m).reduce((a, b) => a + b, 0);

describe('rotation AI: role memory', () => {
  it('reads the season from ratings snapshots and last season from real stats', () => {
    const ps = roster(1, () => 30);
    expect(rosterSeason(ps)).toBe(SEASON);
    const r = roleMemory(ps[0], SEASON)!;
    expect(r.mpg).toBeCloseTo(30, 5);
    expect(r.gs).toBe(1);
    expect(r.w).toBeCloseTo(0.75, 5);
    // from the second season on, the simulated season is the memory
    ps[1].stats[0].real = false;
    ps[1].stats[0].min = 22 * 70;
    expect(roleMemory(ps[1], SEASON)!.mpg).toBeCloseTo(22, 5);
    // a fictional roster with no history has no memory
    expect(rosterSeason(ps.map((p) => ({ ...p, ratingsHistory: [] })))).toBeNull();
  });

  it('gives a proven heavy-minute starter more than his OVR rank, a specialist less', () => {
    // player 9 (OVR ~70.5) was a 31-mpg starter; player 2 (OVR 81) a 10-mpg specialist
    const ps = roster(2, (_, i) => (i === 9 ? 31 : i === 2 ? 10 : [34, 33, 0, 30, 29, 25, 22, 18, 14, 0, 9, 6, 4, 3][i]));
    const plain = autoRotation(ps.map((p) => ({ ...p, stats: [], ratingsHistory: [] })));
    const rot = autoRotation(ps);
    expect(rot.minutes[9]).toBeGreaterThan(plain.minutes[9] + 8);
    expect(rot.minutes[2]).toBeLessThan(plain.minutes[2] - 6);
    expect(Math.abs(total(rot.minutes) - 240)).toBeLessThanOrEqual(3);
    expect(Math.max(...Object.values(rot.minutes))).toBeLessThanOrEqual(38);
  });

  it('counts a remembered bench role once: the veteran is not buried behind a newcomer', () => {
    // player 5 (OVR 76.5) was an 18-mpg reserve; player 7 (73.5) missed last season; the deep
    // bench all played real minutes elsewhere, so the claims overfill 240
    const ps = roster(6, (_, i) => [34, 33, 31, 30, 29, 18, 24, null, 22, 20, 18, 17, 16, 15][i]);
    const plain = autoRotation(ps.map((p) => ({ ...p, stats: [] })));
    const rot = autoRotation(ps);
    // his memory pulls him toward a bench role, but not twice: he stays ahead of the lesser
    // newcomer and of the deep bench, at no less than his own blended claim
    expect(rot.minutes[5]).toBeGreaterThan(rot.minutes[7]);
    expect(rot.order.indexOf(5)).toBeLessThan(rot.order.indexOf(7));
    expect(rot.minutes[5]).toBeGreaterThanOrEqual(14);
    for (const i of [9, 10, 11, 12, 13]) expect(rot.minutes[5]).toBeGreaterThan(rot.minutes[i]);
    // a newcomer's talent share is already a healthy-night share: it isn't squeezed again
    expect(rot.minutes[7]).toBeGreaterThanOrEqual(plain.minutes[7] - 1);
    expect(Math.abs(total(rot.minutes) - 240)).toBeLessThanOrEqual(3);
  });

  it('trusts a small role less than an established one', () => {
    const ps = roster(7, (_, i) => (i === 8 ? 20 : i === 9 ? 6 : 25));
    const big = roleMemory(ps[8], SEASON)!;
    const small = roleMemory(ps[9], SEASON)!;
    expect(big.w).toBeCloseTo(0.75, 5);
    expect(small.w).toBeCloseTo(0.75 * 0.4, 5);
  });

  it('lets a much-improved young player play his way past an old role', () => {
    const ps = roster(3, (_, i) => [34, 33, 31, 30, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
    // player 10 was a 9-mpg backup; he has since jumped to the team's best OVR
    const before = autoRotation(ps).minutes[10];
    ps[10].ratingsHistory = [
      { season: SEASON - 1, ovr: 70, pot: 80, r: { ...ps[10].ratings } },
      { season: SEASON, ovr: 70, pot: 80, r: { ...ps[10].ratings } },
    ];
    ps[10].ovr = 86;
    const after = autoRotation(ps).minutes[10];
    expect(roleMemory(ps[10], SEASON)!.w).toBeLessThan(0.25);
    expect(after).toBeGreaterThan(before + 12);
    expect(after).toBeGreaterThanOrEqual(28);
    expect(autoRotation(ps).order.slice(0, 5)).toContain(10);
  });

  it('spreads minutes sensibly when several rotation players are out', () => {
    const ps = roster(4, (_, i) => [35, 34, 33, 31, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
    for (const i of [0, 3, 5]) ps[i].injury = { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' };
    const rot = autoRotation(ps);
    for (const i of [0, 3, 5]) expect(rot.minutes[i]).toBe(0);
    const healthy = ps.filter((p) => !p.injury).map((p) => rot.minutes[p.pid]);
    expect(Math.abs(healthy.reduce((a, b) => a + b, 0) - 240)).toBeLessThanOrEqual(3);
    expect(Math.max(...healthy)).toBeLessThanOrEqual(38);
    // at least nine healthy players get a real look
    expect(healthy.filter((m) => m >= 8).length).toBeGreaterThanOrEqual(9);
  });

  it('keeps the hard caps it carries over, and drops those of players who have left', () => {
    const ps = roster(8, (_, i) => [35, 34, 33, 31, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
    const free = autoRotation(ps);
    expect(free.minutes[0]).toBeGreaterThan(30);
    const rot = autoRotation(ps, { ...free, caps: { 0: 20, 99: 25 } });
    expect(rot.minutes[0]).toBeLessThanOrEqual(20);
    expect(rot.caps).toEqual({ 0: 20 });
    // the minutes go to the others
    expect(Math.abs(total(rot.minutes) - 240)).toBeLessThanOrEqual(3);
    expect(rot.minutes[1]).toBeGreaterThanOrEqual(free.minutes[1]);
  });

  it('plans no token stints: a reserve plays real minutes or none', () => {
    for (const seed of [1, 2, 3, 4]) {
      const ps = roster(seed, (_, i) => [34, 33, 31, 30, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
      const m = Object.values(autoRotation(ps).minutes);
      expect(m.filter((x) => x > 0 && x < 6)).toEqual([]);
      expect(m.filter((x) => x >= 6).length).toBeGreaterThanOrEqual(9);
      expect(Math.abs(total(autoRotation(ps).minutes) - 240)).toBeLessThanOrEqual(3);
    }
  });

  it("doesn't start a bench-minutes player over a reserve who plays far more, unless the five needs him", () => {
    // player 3 (OVR 79.5) was a 12-minute player last season; player 6 (75) a 30-minute sixth man
    const ps = roster(10, (_, i) => [34, 33, 31, 12, 29, 25, 30, 18, 14, 11, 9, 6, 4, 3][i]);
    const rot = autoRotation(ps);
    const starters = rot.order.slice(0, 5);
    const bench = rot.order.slice(5);
    // every starter plays a starter's minutes (20 or more), or no reserve plays 8 more than he does
    for (const pid of starters) {
      const most = Math.max(...bench.map((b) => rot.minutes[b] ?? 0));
      expect(rot.minutes[pid] >= 20 || most < rot.minutes[pid] + 8).toBe(true);
    }
  });

  it('lists the starters 1 through 5: a tall point guard still comes first', () => {
    const ps = roster(6).slice(0, 5);
    (['C', 'SF', 'PG', 'PF', 'SG'] as const).forEach((pos, i) => (ps[i].pos = pos));
    ps[2].ratings.hgt = 70;
    expect(sortByPosition(ps).map((p) => p.pos)).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
  });

  it('caps planned minutes even with short-stamina rosters', () => {
    const ps = roster(5);
    for (const p of ps) p.ratings.end = 30;
    for (const i of [0, 1, 2, 3]) ps[i].injury = { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' };
    const rot = autoRotation(ps);
    const healthy = ps.filter((p) => !p.injury).map((p) => rot.minutes[p.pid]);
    expect(Math.max(...healthy)).toBeLessThanOrEqual(38);
    expect(Math.abs(healthy.reduce((a, b) => a + b, 0) - 240)).toBeLessThanOrEqual(3);
  });

  it('still fills the game when only five or six are healthy (38 apiece would not)', () => {
    for (const [n, each] of [
      [5, 48],
      [6, 40],
    ]) {
      const ps = roster(9);
      for (const p of ps.slice(n)) p.injury = { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' };
      const rot = autoRotation(ps);
      expect(total(rot.minutes)).toBe(240);
      for (const p of ps.slice(0, n)) expect(rot.minutes[p.pid]).toBe(each);
    }
    // four can't fill it: they play every minute
    const ps = roster(9);
    for (const p of ps.slice(4)) p.injury = { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' };
    expect(total(autoRotation(ps).minutes)).toBe(192);
  });
});
