// The staff's debrief (analysis/debrief.ts): the verdict, the edges that decided it, and what to do
// next time, each fix a real change to the tactics as they are now, for the plan or for good.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { playGame } from '../league/games';
import { buildGameReport, decidingFactors } from '../analysis/gameReport';
import { debrief } from '../analysis/debrief';
import { applyPatch } from '../sim/tactics';

describe('the debrief', () => {
  it('leads with the verdict and the edges, and its fixes change the tactics as they are now', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    league.phase = 'regular';
    let fixes = 0;
    for (let i = 0; i < 8; i++) {
      const g = league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!;
      const res = playGame(league, g);
      const rep = buildGameReport(league, res)!;
      const d = debrief(league, res, rep);
      // the staff's read says how it went in words: the final above it has the score
      expect(d.headline).not.toContain(`${res.home.pts}-${res.away.pts}`);
      expect(d.headline).not.toContain(`${res.away.pts}-${res.home.pts}`);
      expect(d.headline).toMatch(/^[A-Z].+\.$/);
      // and the next-time rows don't repeat a key's number (the keys' list has it)
      for (const a of d.advice) expect(a.title).not.toMatch(/goal [≤≥]/);
      expect(d.decided.length).toBeLessThanOrEqual(3);
      expect(d.opp).toBe(res.home.tid === 0 ? res.away.tid : res.home.tid);
      expect(d.advice.length).toBeLessThanOrEqual(5);
      const t = league.teams[0].tactics;
      for (const a of d.advice) {
        if (!a.patch) continue;
        fixes++;
        expect(a.label).toBeTruthy();
        expect(JSON.stringify(applyPatch(t, a.patch))).not.toBe(JSON.stringify(t));
      }
      // a simmed game has no live moves
      expect(d.moves).toBeNull();
    }
    expect(fixes).toBeGreaterThan(0);
  });
  it("offers no fix for a setting's cost that the same setting won back that night", () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    league.phase = 'regular';
    const g = league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!;
    const res = playGame(league, g);
    const me: 0 | 1 = res.home.tid === 0 ? 0 : 1;
    const them = (1 - me) as 0 | 1;
    league.teams[0].tactics = applyPatch(league.teams[0].tactics, { defense: { scheme: 'man', pnr: 'drop' } });
    const im = (key: string, t: 0 | 1, pts: number) => ({ key, t, pts, count: 8, players: {} });
    const factor = () => buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up jumpers'))!;
    // drop gave up 2.5 in pull-ups and won 3.1 back at the rim: no reason to leave it
    res.impacts = [im('drop_pullup:o', them, 2.5), im('drop_rim:d', me, 3.1)];
    expect(factor()).toMatchObject({ pts: -2.5, detail: 'Over 8 plays. Your drop coverage won 3.1 back.' });
    expect(factor().key).toBeUndefined();
    expect(factor().advice).toBeUndefined();
    expect(debrief(league, res, buildGameReport(league, res)!).advice.some((a) => a.id === 'fix-drop_pullup:o')).toBe(false);
    // it won back only 0.4: the fix stands
    res.impacts = [im('drop_pullup:o', them, 2.5), im('drop_rim:d', me, 0.4)];
    expect(factor()).toMatchObject({ key: 'drop_pullup:o', detail: 'Over 8 plays.' });
    expect(debrief(league, res, buildGameReport(league, res)!).advice.find((a) => a.id === 'fix-drop_pullup:o')?.label).toBe('Switch to Hedge');
  });
  it('tells each deciding edge once: a won-back setting in one row, an edge that is part of another under it', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    league.phase = 'regular';
    const g = league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!;
    const res = playGame(league, g);
    const me: 0 | 1 = res.home.tid === 0 ? 0 : 1;
    const them = (1 - me) as 0 | 1;
    league.teams[0].tactics = applyPatch(league.teams[0].tactics, { defense: { scheme: 'man', pnr: 'blitz' } });
    const im = (key: string, t: 0 | 1, pts: number) => ({ key, t, pts, count: 20, players: {} });
    // the blitz gave up 8.9 in 4-on-3s and won 8.8 back in turnovers: one row carries both numbers
    res.impacts = [im('blitz_4v3:o', them, 8.9), im('blitz_to:d', me, 8.8), im('help_kick:o', me, 2)];
    const rep = buildGameReport(league, res)!;
    expect(rep.factors.some((f) => f.won === 'blitzing')).toBe(true);
    const told = decidingFactors(rep.factors, rep.factors.length);
    expect(told.some((f) => f.won === 'blitzing')).toBe(false);
    expect(told.find((f) => f.paid === 'blitzing')?.detail).toMatch(/won 8\.8 back/);
    // traps that forced turnovers under a turnover battle won the same way: the battle is told, the traps give way
    res.impacts = [im('blitz_to:d', me, 5)];
    const f = buildGameReport(league, res)!.factors;
    const battle = f.find((x) => x.category === 'turnovers' && x.title.startsWith('Turnover battle'));
    const traps = f.find((x) => x.key === 'blitz_to:d')!;
    expect(traps.topic).toBe('turnovers');
    if (battle && battle.pts > 0) expect(decidingFactors(f, f.length).filter((x) => x.topic === 'turnovers')).toHaveLength(1);
    // the debrief's edges are the deciding ones
    expect(debrief(league, res, buildGameReport(league, res)!).decided).toEqual(decidingFactors(buildGameReport(league, res)!.factors));
  });
});
