// The system report (analysis/system.ts): every quality graded against the league's other systems,
// moving with the settings the way the engine plays them, and each player's fit for each role.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { DEF_QUALITIES, OFF_QUALITIES, fitStars, gradeChanges, gradeOf, roleFits, systemReport } from '../analysis/system';
import { cloneTactics } from '../sim/tactics';

const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });

describe('the system report', () => {
  it('grades seven qualities at each end, ranked among the league', () => {
    const r = systemReport(league, 0);
    expect(r.off.map((q) => q.id)).toEqual(OFF_QUALITIES);
    expect(r.def.map((q) => q.id)).toEqual(DEF_QUALITIES);
    for (const q of [...r.off, ...r.def]) {
      expect(q.of).toBe(league.teams.length);
      expect(q.rank).toBeGreaterThanOrEqual(1);
      expect(q.rank).toBeLessThanOrEqual(q.of);
      expect(q.grade).toBe(gradeOf(q.rank, q.of));
      // its first part is who carries it; the rest are settings, each worth something
      expect(q.parts[0].text.length).toBeGreaterThan(3);
    }
    expect(gradeOf(1, 30)).toBe('A+');
    expect(gradeOf(30, 30)).toBe('F');
  });

  it('moves with the settings as the engine plays them, each a trade-off', () => {
    const t = league.teams[0].tactics;
    const base = systemReport(league, 0);
    const crash = cloneTactics(t);
    crash.offense.crashBoards = 100;
    const c = systemReport(league, 0, crash, base.others);
    const q = (r: typeof base, id: string) => [...r.off, ...r.def].find((x) => x.id === id)!.raw;
    expect(q(c, 'glass')).toBeGreaterThan(q(base, 'glass'));
    expect(q(c, 'transD')).toBeLessThan(q(base, 'transD'));
    const pack = cloneTactics(t);
    pack.defense.help = 100;
    const p = systemReport(league, 0, pack, base.others);
    expect(q(p, 'rimD')).toBeGreaterThan(q(base, 'rimD'));
    expect(q(p, 'threeD')).toBeLessThan(q(base, 'threeD'));
    const zone = cloneTactics(t);
    zone.defense.scheme = 'zone32';
    const z = systemReport(league, 0, zone, base.others);
    expect(q(z, 'threeD')).toBeGreaterThan(q(base, 'threeD'));
    expect(q(z, 'boards')).toBeLessThan(q(base, 'boards'));
    // the same tactics, the same report; the change lists what moved
    expect(gradeChanges(base, systemReport(league, 0, cloneTactics(t), base.others))).toEqual([]);
    expect(gradeChanges(base, c).every((x) => typeof x.up === 'boolean')).toBe(true);
  });

  it('fits each player to each role by what it asks of him', () => {
    const ps = teamPlayers(league, 0);
    const shooter = [...ps].sort((a, b) => b.ratings.tp - a.ratings.tp)[0];
    const big = [...ps].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
    const fs = roleFits(shooter);
    const fb = roleFits(big);
    expect(fs.shooter).toBeGreaterThan(fs.roller);
    expect(fb.roller).toBeGreaterThan(fb.shooter - 10);
    for (const v of Object.values(fs)) expect(fitStars(v)).toBeGreaterThanOrEqual(1);
    expect(fitStars(90)).toBe(5);
  });
});
