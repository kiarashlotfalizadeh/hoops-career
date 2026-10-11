import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { applyPatch, pairedDelta, runLab } from '../ai/lab';
import { buildGameReport, impactAdvice } from '../analysis/gameReport';
import { playGame } from '../league/games';

describe('tactics lab & reports', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  const side = (tid: number) => ({ team: league.teams[tid], players: teamPlayers(league, tid) });
  it('is deterministic and paired', () => {
    const a = runLab({ a: side(0), b: side(1), games: 6, seed: 42 });
    const b = runLab({ a: side(0), b: side(1), games: 6, seed: 42 });
    expect(pairedDelta(a, b)).toEqual({ delta: 0, se: 0 });
    const c = runLab({ a: side(0), b: side(1), games: 6, seed: 42, patch: { defense: { pnr: 'blitz' } } });
    expect(c.margins.length).toBe(6);
  });
  it('builds a post-game report for the user team', () => {
    const g = league.schedule.find((x) => x.home === 0 || x.away === 0)!;
    league.phase = 'regular';
    const res = playGame(league, g);
    const rep = buildGameReport(league, res)!;
    expect(rep.headline.length).toBeGreaterThan(10);
    expect(rep.playTypes.length).toBeGreaterThan(3);
    expect(rep.grades.length).toBeGreaterThan(4);
  });
  it('only gives advice the team still needs: no "try Hedge" for a team already hedging', () => {
    const t = league.teams[0].tactics;
    const drop = applyPatch(t, { defense: { scheme: 'man', pnr: 'drop', starPlan: 'none' } });
    const hedge = applyPatch(t, { defense: { scheme: 'man', pnr: 'hedge', starPlan: 'none' } });
    expect(impactAdvice('drop_pullup:o', drop)).toMatch(/Hedge/);
    expect(impactAdvice('drop_pullup:o', hedge)).toBeUndefined();
    expect(impactAdvice('blitz_4v3:o', hedge)).toBeUndefined();
    expect(impactAdvice('blitz_4v3:o', applyPatch(hedge, { defense: { starPlan: 'double' } }))).toMatch(/Star plan/);
    expect(impactAdvice('fatigue:d', hedge)).toMatch(/sooner/);
    // in the post-game report, against the user's current plan
    league.phase = 'regular';
    const g = playGame(
      league,
      league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
    );
    const opp: 0 | 1 = g.home.tid === 0 ? 1 : 0;
    const res = { ...g, impacts: [{ key: 'drop_pullup:o', t: opp, count: 12, pts: 3.2, players: {} }] };
    league.teams[0].tactics = hedge;
    expect(buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up'))!.advice).toBeUndefined();
    league.teams[0].tactics = drop;
    expect(buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up'))!.advice).toMatch(/Hedge/);
    league.teams[0].tactics = t;
  });
});
