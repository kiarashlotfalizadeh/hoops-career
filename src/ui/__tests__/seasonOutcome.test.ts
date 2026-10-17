// How a team's season reads on its page and in the history (seasonOutcome): a playoff team that has
// won its series waits for the next round's draw, which comes once every series of the round is over.
import { describe, expect, it } from 'vitest';
import type { League, PlayoffSeries } from '../../core/types';
import { createLeague, defaultSettings } from '../../core/league/create';
import { curTeamSeason } from '../../core/league/helpers';
import { seasonOutcome } from '../league/shared';

const series = (id: string, round: number, high: number, low: number, highWins: number, lowWins: number, winner?: number): PlayoffSeries => ({
  id,
  round,
  conf: 'E',
  high,
  low,
  highSeed: 1,
  lowSeed: 8,
  highWins,
  lowWins,
  ...(winner !== undefined ? { winner } : {}),
});

/** The first round under way: 0 swept 1 and waits, 2 and 3 still play. */
function midFirstRound(): League {
  const league = createLeague({ name: 'out', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
  league.phase = 'playoffs';
  league.playoffs = [series('E1-0', 1, 0, 1, 4, 0, 0), series('E1-1', 1, 2, 3, 2, 1)];
  curTeamSeason(league, 0).playoffRound = 2;
  curTeamSeason(league, 1).playoffRound = 1;
  curTeamSeason(league, 2).playoffRound = 1;
  curTeamSeason(league, 3).playoffRound = 1;
  return league;
}

const outcome = (league: League, tid: number) => seasonOutcome(league, tid, curTeamSeason(league, tid)).short;

describe('seasonOutcome', () => {
  it('a series winner waiting for the next round is still in it, not out in it', () => {
    const league = midFirstRound();
    expect(outcome(league, 0)).toBe('In 2nd Round');
    expect(outcome(league, 1)).toBe('Lost 1st Round');
    expect(outcome(league, 2)).toBe('In 1st Round');
    expect(outcome(league, 3)).toBe('In 1st Round');
  });

  it('once the playoffs are over, the rounds read as they ended', () => {
    const league = midFirstRound();
    league.playoffs.push(series('F4-0', 4, 0, 2, 4, 3, 0));
    curTeamSeason(league, 0).playoffRound = 5;
    curTeamSeason(league, 2).playoffRound = 4;
    league.phase = 'draftLottery';
    expect(outcome(league, 0)).toBe('Champion');
    expect(outcome(league, 2)).toBe('Lost Finals');
    expect(outcome(league, 1)).toBe('Lost 1st Round');
  });
});
