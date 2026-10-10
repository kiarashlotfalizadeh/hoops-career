import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { pairedDelta, runLab } from '../ai/lab';
import { buildGameReport } from '../analysis/gameReport';
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
});
