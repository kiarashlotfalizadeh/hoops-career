// Rotations: the minute plan that fields five players every minute of a game (minute targets, starters,
// closers, caps, injuries, playoff eights), and the staff's rotation built from ratings and each
// player's remembered role.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { buildMinutePlan, normalizeMinutes, planInputs, planRoles, type PlanPlayer, type PlanSource } from '../sim/rotationPlan';
import { autoRotation, roleMemory, rosterSeason, sortByPosition } from '../ai/coachAI';
import { blankStats, generatePlayer, DEFAULT_SCALE } from '../playerGen';
import { Rng } from '../random';
import type { Player, Rotation } from '../types';

const players: PlanPlayer[] = [36, 34, 33, 31, 29, 24, 20, 16, 12, 5].map((m, i) => ({
  pid: i,
  minutes: m,
  starter: i < 5,
  closer: i < 5,
  guard: i % 2 === 0,
  big: i === 4 || i === 9,
  endurance: 60,
}));

const src: PlanSource[] = Array.from({ length: 12 }, (_, i) => ({ pid: i, available: true, guard: i % 2 === 0, big: i % 5 === 4, endurance: 60 }));
const rotation = (over: Partial<Rotation> = {}): Rotation => ({
  order: src.map((p) => p.pid),
  minutes: Object.fromEntries([36, 34, 33, 31, 29, 24, 20, 16, 12, 5, 0, 0].map((m, i) => [i, m])),
  closers: [],
  restB2B: [],
  caps: {},
  manual: true,
  ...over,
});
const mins = (pp: PlanPlayer[]) => Object.fromEntries(pp.map((p, i) => [p.pid, normalizeMinutes(pp)[i]]));

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

describe('rotations', () => {
  it("plan five players every minute to their targets, starters and closers, caps, injuries and playoff eights, and the staff weighs each player's remembered role", () => {
    {
      // normalizes to exactly 240 minutes
      expect(normalizeMinutes(players).reduce((a, b) => a + b, 0)).toBe(240);
    }
    {
      // fields five players every minute and honors minute targets
      const plan = buildMinutePlan(players);
      expect(plan.length).toBe(48);
      for (const slot of plan) expect(new Set(slot).size).toBe(5);
      const norm = normalizeMinutes(players);
      players.forEach((p, i) => {
        const got = plan.filter((s) => s.includes(p.pid)).length;
        expect(Math.abs(got - norm[i])).toBeLessThanOrEqual(1);
      });
    }
    {
      // starts the starters and closes with the closers
      const plan = buildMinutePlan(players);
      expect([...plan[0]].sort()).toEqual([0, 1, 2, 3, 4]);
      expect([...plan[47]].sort()).toEqual([0, 1, 2, 3, 4]);
    }
    {
      // opens the third quarter with the starters in every team's default rotation, minutes and closers intact
      const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 5 });
      let starters = 0;
      let oneMinute = 0;
      for (const t of league.teams) {
        const pp = planInputs(
          teamPlayers(league, t.tid).map((p) => ({ pid: p.pid, available: !(p.injury && p.injury.gamesRemaining > 0), ...planRoles(p.ratings, p.pos), endurance: p.ratings.end })),
          t.rotation,
        );
        const plan = buildMinutePlan(pp);
        const norm = normalizeMinutes(pp);
        starters += plan[24].filter((pid) => pp.find((p) => p.pid === pid)!.starter).length;
        // nobody takes the floor for the tip only to leave a minute later
        for (const pid of plan[24]) expect(plan[25]).toContain(pid);
        pp.forEach((p, i) => expect(Math.abs(plan.filter((s) => s.includes(p.pid)).length - norm[i])).toBeLessThanOrEqual(1));
        for (const p of pp.filter((x) => x.closer)) for (const slot of plan.slice(44)) expect(slot).toContain(p.pid);
        // one-minute stints within a half stay rare
        for (const p of pp)
          for (let s = 0; s < 48; s++)
            if (plan[s].includes(p.pid) && (s % 24 === 0 || !plan[s - 1].includes(p.pid)) && (s % 24 === 23 || !plan[s + 1].includes(p.pid))) oneMinute++;
      }
      expect(starters / league.teams.length).toBeGreaterThanOrEqual(4);
      expect(oneMinute / league.teams.length).toBeLessThan(4);
    }
    {
      // never lists a player twice when one swap fixes both a missing guard and too many bigs
      // five bigs and no ball handler start: the guard swapped in must not be picked again as the "small"
      const bigs = players.map((p, i) => ({ ...p, guard: i >= 5, big: i < 5 }));
      for (const slot of buildMinutePlan(bigs)) expect(new Set(slot).size).toBe(5);
    }
    {
      // keeps the starting and closing fives the coach picked, however big or small
      // four bigs and no ball handler among the starters, who are also the closers
      const jumbo = players.map((p, i) => ({ ...p, guard: i >= 5, big: i < 4 }));
      const plan = buildMinutePlan(jumbo);
      expect([...plan[0]].sort()).toEqual([0, 1, 2, 3, 4]);
      for (const slot of plan.slice(44)) expect([...slot].sort()).toEqual([0, 1, 2, 3, 4]);
      for (const slot of plan) expect(new Set(slot).size).toBe(5);
    }
    {
      // never sits a player for positions when he needs every minute left, so the minutes still add up
      // a playoff eight with four bigs (a real team's): swapping out a big who had to play every
      // remaining minute of the half left him a minute short and gave a starter two extra
      const spec: [number, number, string, number][] = [
        [34, 42, 'SCg', 49],
        [39, 42, 'SCg', 61.3],
        [30, 42, 'SC', 51.6],
        [24, 24, 'SC', 62.3],
        [42, 42, 'SCb', 61.8],
        [26, 0, 'b', 50.8],
        [23, 0, 'gb', 46.2],
        [22, 0, 'b', 46.5],
      ];
      const pp: PlanPlayer[] = spec.map(([minutes, cap, f, endurance], pid) => ({
        pid,
        minutes,
        cap: cap || undefined,
        starter: f.includes('S'),
        closer: f.includes('C'),
        guard: f.includes('g'),
        big: f.includes('b'),
        endurance,
      }));
      const plan = buildMinutePlan(pp);
      const norm = normalizeMinutes(pp);
      pp.forEach((p, i) => expect(Math.abs(plan.filter((s) => s.includes(p.pid)).length - norm[i])).toBeLessThanOrEqual(1));
    }
    {
      // adds up to 240 when the rotation is capped out: the deep bench, then the caps, take the rest
      // five healthy players: 48 minutes each, past the usual 46 ceiling
      expect(normalizeMinutes(players.slice(0, 5))).toEqual([48, 48, 48, 48, 48]);
      // a six-man rotation with two capped players: the 16 minutes nobody in it can take go to the deep bench
      const six = players.map((p, i) => ({ ...p, minutes: i < 4 ? 40 : i < 6 ? 20 : 0, cap: i === 4 || i === 5 ? 20 : undefined }));
      const m = normalizeMinutes(six);
      expect(m.reduce((a, b) => a + b, 0)).toBe(240);
      expect(m.slice(0, 6)).toEqual([46, 46, 46, 46, 20, 20]);
      expect(m.slice(6).reduce((a, b) => a + b, 0)).toBe(16);
      // nobody with minutes: an even split among the first ten, in whole minutes
      expect(normalizeMinutes(players.slice(0, 7).map((p) => ({ ...p, minutes: 0 })))).toEqual([35, 35, 34, 34, 34, 34, 34]);
    }
    {
      // treats hard caps as hard, handing the rest to teammates
      const pp = planInputs(src, rotation({ caps: { 0: 20 } }));
      const m = mins(pp);
      expect(m[0]).toBeLessThanOrEqual(20);
      expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(240);
      const plan = buildMinutePlan(pp);
      expect(plan.filter((s) => s.includes(0)).length).toBeLessThanOrEqual(20);
    }
    {
      // keeps a starter's short minutes and gives a starter without minutes a starter's share
      const r = rotation();
      r.minutes[4] = 10;
      expect(planInputs(src, r).find((p) => p.pid === 4)!.minutes).toBe(10);
      delete r.minutes[4];
      expect(planInputs(src, r).find((p) => p.pid === 4)!.minutes).toBe(24);
    }
    {
      // hands an injured starter's minutes to his replacement, then the bench
      const pp = planInputs(
        src.map((p) => (p.pid === 1 ? { ...p, available: false } : p)),
        rotation(),
      );
      expect(pp.map((p) => p.pid)).not.toContain(1);
      // the sixth man starts and takes the starter's 34; the next bench players fill up to 22 before anyone else gets more
      expect(pp[4].pid).toBe(5);
      expect(pp.find((p) => p.pid === 5)!.minutes).toBe(34);
      expect(pp.find((p) => p.pid === 7)!.minutes).toBe(22);
      expect(pp.find((p) => p.pid === 0)!.minutes).toBe(36);
    }
    {
      // gives promoted starters the missing starters minutes before the deep bench gets any
      const pp = planInputs(
        src.map((p) => (p.pid >= 1 && p.pid <= 3 ? { ...p, available: false } : p)),
        rotation(),
      );
      const m = mins(pp);
      // reserves 5, 6 and 7 start in place of 1, 2 and 3 and play their 34, 33 and 31
      expect(pp.slice(0, 5).map((p) => p.pid)).toEqual([0, 4, 5, 6, 7]);
      for (const pid of [5, 6, 7]) expect(m[pid]).toBeGreaterThanOrEqual(30);
      for (const pid of [10, 11]) expect(m[pid]).toBeLessThan(Math.min(m[5], m[6], m[7]));
      expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(240);
    }
    {
      // shortens auto-managed playoff rotations to eight, with the top five playing more
      const regular = mins(planInputs(src, rotation({ manual: false })));
      const playoffs = mins(planInputs(src, rotation({ manual: false }), { playoffs: true }));
      expect(Object.values(playoffs).filter((m) => m > 0).length).toBe(8);
      expect(playoffs[0]).toBeGreaterThan(regular[0] + 2);
      expect(Math.max(...Object.values(playoffs))).toBeLessThanOrEqual(42);
      // a user's custom rotation is left alone
      expect(mins(planInputs(src, rotation(), { playoffs: true }))).toEqual(mins(planInputs(src, rotation())));
    }
    {
      // keeps a low-minute starter and a bench closer in the playoff eight, so they still start and finish
      // a 14-minute starting center and a 12-minute closer off the bench, behind seven bigger roles
      const minutes = Object.fromEntries([36, 34, 33, 31, 14, 30, 28, 24, 20, 12, 0, 0].map((m, i) => [i, m]));
      const pp = planInputs(src, rotation({ manual: false, minutes, closers: [0, 1, 2, 3, 9] }), { playoffs: true });
      const m = mins(pp);
      expect(m[4]).toBeGreaterThan(0);
      expect(m[9]).toBeGreaterThan(0);
      expect(Object.values(m).filter((x) => x > 0).length).toBe(8);
      const plan = buildMinutePlan(pp);
      expect(plan[0]).toContain(4);
      for (const slot of plan.slice(44)) expect(slot).toContain(9);
    }
    {
      // reads the season from ratings snapshots and last season from real stats
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
    }
    {
      // gives a proven heavy-minute starter more than his OVR rank, a specialist less
      // player 9 (OVR ~70.5) was a 31-mpg starter; player 2 (OVR 81) a 10-mpg specialist
      const ps = roster(2, (_, i) => (i === 9 ? 31 : i === 2 ? 10 : [34, 33, 0, 30, 29, 25, 22, 18, 14, 0, 9, 6, 4, 3][i]));
      const plain = autoRotation(ps.map((p) => ({ ...p, stats: [], ratingsHistory: [] })));
      const rot = autoRotation(ps);
      expect(rot.minutes[9]).toBeGreaterThan(plain.minutes[9] + 8);
      expect(rot.minutes[2]).toBeLessThan(plain.minutes[2] - 6);
      expect(Math.abs(total(rot.minutes) - 240)).toBeLessThanOrEqual(3);
      expect(Math.max(...Object.values(rot.minutes))).toBeLessThanOrEqual(38);
    }
    {
      // counts a remembered bench role once: the veteran is not buried behind a newcomer
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
    }
    {
      // trusts a small role less than an established one
      const ps = roster(7, (_, i) => (i === 8 ? 20 : i === 9 ? 6 : 25));
      const big = roleMemory(ps[8], SEASON)!;
      const small = roleMemory(ps[9], SEASON)!;
      expect(big.w).toBeCloseTo(0.75, 5);
      expect(small.w).toBeCloseTo(0.75 * 0.4, 5);
    }
    {
      // lets a much-improved young player play his way past an old role
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
    }
    {
      // spreads minutes sensibly when several rotation players are out
      const ps = roster(4, (_, i) => [35, 34, 33, 31, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
      for (const i of [0, 3, 5]) ps[i].injury = { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' };
      const rot = autoRotation(ps);
      for (const i of [0, 3, 5]) expect(rot.minutes[i]).toBe(0);
      const healthy = ps.filter((p) => !p.injury).map((p) => rot.minutes[p.pid]);
      expect(Math.abs(healthy.reduce((a, b) => a + b, 0) - 240)).toBeLessThanOrEqual(3);
      expect(Math.max(...healthy)).toBeLessThanOrEqual(38);
      // at least nine healthy players get a real look
      expect(healthy.filter((m) => m >= 8).length).toBeGreaterThanOrEqual(9);
    }
    {
      // keeps the hard caps it carries over, and drops those of players who have left
      const ps = roster(8, (_, i) => [35, 34, 33, 31, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
      const free = autoRotation(ps);
      expect(free.minutes[0]).toBeGreaterThan(30);
      const rot = autoRotation(ps, { ...free, caps: { 0: 20, 99: 25 } });
      expect(rot.minutes[0]).toBeLessThanOrEqual(20);
      expect(rot.caps).toEqual({ 0: 20 });
      // the minutes go to the others
      expect(Math.abs(total(rot.minutes) - 240)).toBeLessThanOrEqual(3);
      expect(rot.minutes[1]).toBeGreaterThanOrEqual(free.minutes[1]);
    }
    {
      // plans no token stints: a reserve plays real minutes or none
      for (const seed of [1, 2, 3, 4]) {
        const ps = roster(seed, (_, i) => [34, 33, 31, 30, 29, 25, 22, 18, 14, 11, 9, 6, 4, 3][i]);
        const m = Object.values(autoRotation(ps).minutes);
        expect(m.filter((x) => x > 0 && x < 6)).toEqual([]);
        expect(m.filter((x) => x >= 6).length).toBeGreaterThanOrEqual(9);
        expect(Math.abs(total(autoRotation(ps).minutes) - 240)).toBeLessThanOrEqual(3);
      }
    }
    {
      // doesn't start a bench-minutes player over a reserve who plays far more, unless the five needs him
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
    }
    {
      // lists the starters 1 through 5: a tall point guard still comes first
      const ps = roster(6).slice(0, 5);
      (['C', 'SF', 'PG', 'PF', 'SG'] as const).forEach((pos, i) => (ps[i].pos = pos));
      ps[2].ratings.hgt = 70;
      expect(sortByPosition(ps).map((p) => p.pos)).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
    }
    {
      // caps planned minutes even with short-stamina rosters
      const ps = roster(5);
      for (const p of ps) p.ratings.end = 30;
      for (const i of [0, 1, 2, 3]) ps[i].injury = { type: 'Sprained ankle', gamesRemaining: 10, gamesTotal: 10, severity: 'minor' };
      const rot = autoRotation(ps);
      const healthy = ps.filter((p) => !p.injury).map((p) => rot.minutes[p.pid]);
      expect(Math.max(...healthy)).toBeLessThanOrEqual(38);
      expect(Math.abs(healthy.reduce((a, b) => a + b, 0) - 240)).toBeLessThanOrEqual(3);
    }
    {
      // still fills the game when only five or six are healthy (38 apiece would not)
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
    }
  });
});
