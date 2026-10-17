// Advanced numbers for seasons played in this league, from their box scores as Basketball Reference
// works them out: PER averaging 15 over the league's minutes, win shares adding up to about the
// wins each team had, believable leaders, a season split between teams combined as a "TOT" line,
// imported seasons left as they came, nothing for the playoffs, and no change to the league.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { seasonAdvanced, type Advanced } from '../analysis/advanced';
import { simDay } from '../league/season';
import { advancedView } from '../../ui/stats';
import type { League, Player } from '../types';

describe('advanced numbers for a season played here', () => {
  let l: League;
  let rows: { p: Player; a: Advanced; min: number }[];
  beforeAll(() => {
    l = testLeague('advanced');
    for (let i = 0; i < 400 && l.phase === 'regular'; i++) simDay(l);
    rows = Object.values(l.players).flatMap((p) => {
      const a = seasonAdvanced(l, p, l.season);
      const min = p.stats.filter((s) => s.season === l.season && !s.playoffs && !s.real).reduce((x, s) => x + s.min, 0);
      return a ? [{ p, a, min }] : [];
    });
  }, 120_000);

  it("PER averages 15 over the league's minutes", () => {
    expect(rows.length).toBeGreaterThan(400);
    const per = rows.reduce((x, r) => x + r.a.per * r.min, 0) / rows.reduce((x, r) => x + r.min, 0);
    expect(per).toBeCloseTo(15, 6);
  });

  it("win shares add up to about each team's wins", () => {
    const byTeam = new Map<number, number>();
    for (const { p, a } of rows) {
      const lines = p.stats.filter((s) => s.season === l.season && !s.playoffs && !s.real && s.min > 0);
      const tot = lines.reduce((x, s) => x + s.min, 0);
      for (const s of lines) byTeam.set(s.tid, (byTeam.get(s.tid) ?? 0) + (a.ws * s.min) / tot);
    }
    let se = 0;
    let ws = 0;
    let wins = 0;
    for (const t of l.teams) {
      const won = t.seasons.find((s) => s.season === l.season)!.won;
      se += ((byTeam.get(t.tid) ?? 0) - won) ** 2;
      ws += byTeam.get(t.tid) ?? 0;
      wins += won;
    }
    expect(Math.abs(ws - wins) / wins).toBeLessThan(0.05);
    expect(Math.sqrt(se / l.teams.length)).toBeLessThan(5);
  });

  it('leaders look like a season of the NBA', () => {
    const full = rows.filter((r) => r.min >= 1500);
    const top = (f: (a: Advanced) => number) => Math.max(...full.map((r) => f(r.a)));
    expect(top((a) => a.ws)).toBeGreaterThan(8);
    expect(top((a) => a.ws)).toBeLessThan(22);
    expect(top((a) => a.per)).toBeGreaterThan(22);
    expect(top((a) => a.per)).toBeLessThan(40);
    expect(top((a) => a.ws48)).toBeLessThan(0.4);
    for (const { a } of full) {
      expect(a.ws).toBeCloseTo(a.ows + a.dws, 9);
      for (const k of ['usg', 'astPct', 'trbPct', 'stlPct', 'blkPct', 'tovPct'] as const) expect(a[k] >= 0 && a[k] <= 100, k).toBe(true);
      expect(a.ortg).toBeGreaterThan(70);
      expect(a.ortg).toBeLessThan(160);
    }
  });

  it('a season split between teams reads as the two lines combined', () => {
    const { p } = rows.find((r) => r.min > 1500 && r.p.stats.filter((s) => s.season === l.season && !s.playoffs).length === 1)!;
    const line = p.stats.find((s) => s.season === l.season && !s.playoffs)!;
    const other = (line.tid + 1) % l.teams.length;
    const half = (k: number) => Math.round(k / 2);
    const keys = ['gp', 'gs', 'min', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const;
    const first = { ...line };
    const second = { ...line, tid: other };
    for (const k of keys) {
      first[k] = half(line[k]);
      second[k] = line[k] - first[k];
    }
    const split = { ...p, stats: [first, second] };
    const a = seasonAdvanced(l, split, l.season)!;
    const one = seasonAdvanced(l, { ...p, stats: [first] }, l.season)!;
    const two = seasonAdvanced(l, { ...p, stats: [second] }, l.season)!;
    expect(a.ws).toBeCloseTo(one.ws + two.ws, 9);
    expect(a.per).toBeCloseTo((one.per * first.min + two.per * second.min) / (first.min + second.min), 9);
    expect(a.ws48).toBeCloseTo(((one.ws + two.ws) * 48) / (first.min + second.min), 9);
  });

  it("imported seasons keep Basketball Reference's numbers; the playoffs have none; the league is only read", () => {
    const vet = Object.values(l.players).find((p) => p.stats.some((s) => s.real && s.adv && !s.playoffs))!;
    const real = vet.stats.find((s) => s.real && s.adv && !s.playoffs)!;
    expect(seasonAdvanced(l, vet, real.season)).toBeNull();
    expect(advancedView(l, vet, real)).toMatchObject({ per: real.adv!.per, ws: real.adv!.ws, bpm: real.adv!.bpm });
    const sim = rows[0];
    const line = sim.p.stats.find((s) => s.season === l.season && !s.playoffs)!;
    expect(advancedView(l, sim.p, line)).toMatchObject({ per: sim.a.per, ws: sim.a.ws, computed: true });
    expect(advancedView(l, sim.p, { ...line, playoffs: true })).toBeNull();
    const before = JSON.stringify(l);
    for (const r of rows.slice(0, 50)) seasonAdvanced(l, r.p, l.season);
    expect(JSON.stringify(l)).toBe(before);
  });

  it("a whole league's season works out quickly", () => {
    const t0 = performance.now();
    for (const p of Object.values(l.players)) seasonAdvanced(l, p, l.season);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
