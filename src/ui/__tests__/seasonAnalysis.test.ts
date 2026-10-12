// Season aggregates behind the Tactics screen's Insights tab.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { simDay, startRegularSeason } from '../../core/league/season';
import { seasonImpacts, seasonPlayTypes } from '../seasonAnalysis';

describe('seasonImpacts', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
  startRegularSeason(league);
  for (let i = 0; i < 6; i++) simDay(league);
  const played = (tid: number) => league.games.filter((g) => g.home.tid === tid || g.away.tid === tid).length;

  it('counts every game that tracked effects, however small each effect is', () => {
    const { games, effects } = seasonImpacts(league);
    expect(games).toBe(played(0));
    expect(games).toBeGreaterThan(0);
    // the Insights tab lists only the bigger ones: its "N games" can't come from that list
    expect(effects.some((x) => x.perGame < 0.3)).toBe(true);
  });

  it('a team taken over mid-season has play types from before, but no tracked games', () => {
    const other = league.teams.find((t) => t.tid !== 0 && played(t.tid) > 0)!.tid;
    expect(seasonPlayTypes(league, other).length).toBeGreaterThan(0);
    expect(seasonImpacts(league, other)).toEqual({ games: 0, effects: [] });
  });
});
