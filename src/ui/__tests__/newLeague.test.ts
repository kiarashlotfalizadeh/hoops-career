// New League's team step: the roster size it reads from the seed is the one the league is built with.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../../core/league/create';
import { standardRoster } from '../../core/league/helpers';
import { CAP } from '../../core/constants';
import { rosterLine, seedRosterSizes } from '../newLeague';

const seed = seedJson as unknown as SeedData;

describe.skipIf(!seed.players.length)('New League roster sizes', () => {
  it('counts the standard contracts each team opens camp with', () => {
    const sizes = seedRosterSizes(seed);
    expect(Object.keys(sizes)).toHaveLength(30);
    // no preseason cuts, so every team keeps its camp roster (a team under the minimum is filled)
    const league = createLeague({ name: 'n', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 3, preseasonCuts: false });
    for (const t of league.teams) {
      const n = sizes[t.tid] ?? 0;
      if (n >= CAP.rosterMin) expect(standardRoster(league, t.tid).length, t.abbrev).toBe(n);
    }
  });
});

describe('rosterLine', () => {
  it('says what opening night needs', () => {
    expect(rosterLine(CAP.rosterMax + 1)).toBe(`${CAP.rosterMax + 1} players · 1 to cut before opening night`);
    expect(rosterLine(CAP.rosterMax)).toBe(`${CAP.rosterMax} players`);
    expect(rosterLine(CAP.rosterMax - 2)).toBe(`${CAP.rosterMax - 2} players · 2 open spots`);
    expect(rosterLine(CAP.rosterMin - 1)).toBe(`${CAP.rosterMin - 1} players · 1 to sign before opening night`);
  });
});
