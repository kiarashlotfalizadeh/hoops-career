import { describe, expect, it } from 'vitest';
import { autoRotation, roleMemory, rosterSeason } from '../ai/coachAI';
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
    expect(r.w).toBeCloseTo(0.6, 5);
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

  it('lets a much-improved young player play his way past an old role', () => {
    const ps = roster(3, (_, i) => [34, 33, 31, 30, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
    // player 10 was a 9-mpg backup; he has since jumped to the team's best OVR
    const before = autoRotation(ps).minutes[10];
    ps[10].ratingsHistory = [{ season: SEASON - 1, ovr: 70, pot: 80, r: { ...ps[10].ratings } }, { season: SEASON, ovr: 70, pot: 80, r: { ...ps[10].ratings } }];
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
    // at least ten healthy players get a real look
    expect(healthy.filter((m) => m >= 8).length).toBeGreaterThanOrEqual(9);
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
});
