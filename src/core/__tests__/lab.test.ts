import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { applyPatch, pairedDelta, runLab } from '../ai/lab';
import { counterCandidates, scoutTeam, teamAlerts } from '../ai/advisor';
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
  it('only offers counters that change something', () => {
    const [mine, opp] = [league.teams[0], league.teams[1]];
    const saved = [mine.tactics, opp.tactics];
    opp.tactics = applyPatch(opp.tactics, { defense: { scheme: 'man', pnr: 'drop' } });
    mine.tactics = applyPatch(mine.tactics, { offense: { actions: { ...mine.tactics.offense.actions, pnr: 60, handoff: 60 } } });
    expect(counterCandidates(league, 0, 1).map((c) => c.id)).toContain('vs-drop');
    mine.tactics = applyPatch(mine.tactics, { offense: { actions: { ...mine.tactics.offense.actions, pnr: 100, handoff: 100 } } });
    expect(counterCandidates(league, 0, 1).map((c) => c.id)).not.toContain('vs-drop');
    [mine.tactics, opp.tactics] = saved;
  });
  it('gives a zone no ball-screen coverage advice, and says when a coverage counter leaves your zone', () => {
    const [mine, opp] = [league.teams[0], league.teams[1]];
    const saved = [mine.tactics, opp.tactics];
    // a zone keeps the coverage it had in man-to-man, but the engine ignores it
    opp.tactics = applyPatch(opp.tactics, { defense: { scheme: 'zone23', pnr: 'drop', switchOffBall: true } });
    const rep = scoutTeam(league, 1);
    expect(rep.defense[0]).toMatch(/no ball-screen coverage/);
    expect(rep.weaknesses.join(' ')).not.toMatch(/Drop|Switching|Blitz/);
    expect(counterCandidates(league, 0, 1).map((c) => c.id)).not.toContain('vs-switch');
    expect(teamAlerts(league, 1).map((a) => a.id)).not.toContain('drop-noprot');
    // from a zone, a coverage counter is a move to man-to-man too, and only Switch switches off the ball
    mine.tactics = applyPatch(mine.tactics, { defense: { scheme: 'zone23', pnr: 'switch', switchOffBall: false } });
    const covs = counterCandidates(league, 0, 1).filter((c) => c.id.startsWith('cov-'));
    expect(covs.map((c) => c.id)).toContain('cov-switch');
    for (const c of covs) {
      expect(c.patch.defense).toMatchObject({ scheme: 'man' });
      expect(c.patch.defense?.switchOffBall).toBe(c.id === 'cov-switch' ? true : undefined);
      expect(c.why).toMatch(/man-to-man instead of your zone/);
    }
    [mine.tactics, opp.tactics] = saved;
  });
  it('scouts in plain English: plural team names, the creator role named once', () => {
    for (let tid = 1; tid < 30; tid++) {
      for (const t of scoutTeam(league, tid).threats) expect(t.why).not.toMatch(/Primary creator \(Primary Creator\)/);
      for (const c of counterCandidates(league, 0, tid)) expect(c.why).not.toMatch(new RegExp(`^${league.teams[tid].name} (is|spaces)\\b`));
    }
  });
});
