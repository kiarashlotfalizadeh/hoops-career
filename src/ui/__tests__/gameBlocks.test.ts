// The team comparison the game report and the live box score share: away first, percentages from
// the made and attempted shots, turnovers the one count where fewer is better.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';
import { teamComparison } from '../components/gameBlocks';

describe('team comparison', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const sim = new GameSim(
    { team: league.teams[0], players: teamPlayers(league, 0) },
    { team: league.teams[1], players: teamPlayers(league, 1) },
    { rng: new Rng(9), type: 'regular' },
  );
  const g = sim.simToEnd();

  it('puts the away team first and reads the box score', () => {
    const rows = teamComparison(g);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row('fg').a).toBeCloseTo((g.away.t.fgm / g.away.t.fga) * 100);
    expect(row('fg').b).toBeCloseTo((g.home.t.fgm / g.home.t.fga) * 100);
    expect([row('reb').a, row('reb').b]).toEqual([g.away.t.orb + g.away.t.drb, g.home.t.orb + g.home.t.drb]);
    expect([row('tov').a, row('tov').higherBetter]).toEqual([g.away.t.tov, false]);
    expect(rows.filter((r) => r.pct).map((r) => r.id)).toEqual(['fg', 'tp']);
    expect(rows.every((r) => r.id === 'tov' || r.higherBetter)).toBe(true);
  });

  it('leaves out fast breaks for games stored before they were tracked, and survives a box without attempts', () => {
    const old = structuredClone(g);
    old.home.extra.fastBreak = 0;
    old.away.extra.fastBreak = 0;
    expect(teamComparison(old).some((r) => r.id === 'fastBreak')).toBe(false);
    old.home.t.fga = 0;
    old.home.t.fgm = 0;
    expect(teamComparison(old).find((r) => r.id === 'fg')!.b).toBe(0);
  });
});
