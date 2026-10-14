// Playbook fits as named terms ("Why fit 72"): the terms add up to the fit exactly, so the scores the
// Tactics screen shows and the assistant's preset choices are what they were.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { defPresetFit, defPresetTerms, fitRoster, fitScale, offPresetFit, offPresetTerms, rosterProfile, type ProfileKey, type RosterProfile } from '../ai/coachAI';
import { composites } from '../ratings';
import { Rng } from '../random';

// the formulas as they were written before they became terms
function oldOff(pr: RosterProfile): Record<string, number> {
  return {
    balanced: 50,
    helio: 40 + (pr.starCreator - 62) * 1.4 + pr.creatorGap * 0.8 + (pr.shooting - 50) * 0.4,
    fiveOut: 40 + (pr.shooting - 47) * 1.3 + (pr.passing - 50) * 0.8 - pr.creatorGap * 0.3,
    hub: 30 + (pr.bigPassing - 55) * 1.5 + (pr.passing - 50) * 0.4,
    paceSpace: 40 + (pr.athleticism - 52) * 1.1 + (pr.shooting - 47) * 0.6 + pr.depth * 0.2,
    grind: 27 + (pr.postScoring - 58) * 1.0 + (pr.size - 50) * 0.6 - (pr.shooting - 45) * 0.8,
  };
}
function oldDef(pr: RosterProfile): Record<string, number> {
  return {
    drop: 45 + (pr.rimProtection - 60) * 1.2 - (pr.bigMobility - 45) * 0.2,
    switch: 35 + (pr.perimeterD - 52) * 1.0 + (pr.bigMobility - 45) * 0.9 - Math.abs(pr.size - 52) * 0.3,
    blitz: 34 + (pr.steals - 50) * 0.9 + (pr.athleticism - 52) * 0.6 + (pr.bigMobility - 45) * 0.3,
    ice: 42 + (pr.perimeterD - 52) * 0.6 + (pr.rimProtection - 55) * 0.4,
    hedge: 38 + (pr.bigMobility - 45) * 1.0 + (pr.perimeterD - 50) * 0.3,
    zone: 30 + (pr.size - 52) * 0.7 + (pr.rimProtection - 60) * 0.6 - (pr.perimeterD - 50) * 0.6,
    chaos: 22 + (pr.athleticism - 55) * 0.8 + (pr.steals - 52) * 0.8 + pr.depth * 0.3,
  };
}

const KEYS: ProfileKey[] = [
  'starCreator',
  'creatorGap',
  'shooting',
  'passing',
  'bigPassing',
  'postScoring',
  'rimProtection',
  'athleticism',
  'size',
  'perimeterD',
  'depth',
  'steals',
  'bigMobility',
];

describe('fit terms', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  // every team's roster, plus made-up profiles well outside them
  const rng = new Rng(5);
  const profiles: RosterProfile[] = [
    ...league.teams.map((t) => rosterProfile(fitRoster(teamPlayers(league, t.tid)))),
    ...Array.from({ length: 300 }, () => {
      const pr = rosterProfile([]);
      for (const k of KEYS) pr[k] = k === 'depth' ? rng.uniform(-40, 0) : k === 'creatorGap' ? rng.uniform(0, 40) : rng.uniform(5, 95);
      return pr;
    }),
  ];

  it('each fit is the sum of its terms, to the last bit, for every preset', () => {
    for (const pr of profiles) {
      for (const [terms, fits, old] of [
        [offPresetTerms(pr), offPresetFit(pr), oldOff(pr)],
        [defPresetTerms(pr), defPresetFit(pr), oldDef(pr)],
      ] as const) {
        expect(Object.keys(fits).sort()).toEqual(Object.keys(old).sort());
        for (const k of Object.keys(old)) {
          expect(fits[k]).toBe(old[k]);
          expect(terms[k].reduce((a, x) => a + x.value, 0)).toBe(old[k]);
          expect(terms[k][0].key).toBe('base');
        }
        // the scores the Tactics screen shows don't move
        const [now, was] = [fitScale(fits), fitScale(old)];
        for (const k of Object.keys(old)) expect(now(k)).toBe(was(k));
      }
    }
  });

  it('a term rises with its quality as its weight says', () => {
    const pr = profiles[0];
    for (const [k, terms] of Object.entries({ ...offPresetTerms(pr), ...defPresetTerms(pr) })) {
      for (const t of terms) {
        if (t.key === 'base') continue;
        const more = { ...pr, [t.key]: pr[t.key] + 1 };
        const again = { ...offPresetTerms(more), ...defPresetTerms(more) }[k].find((x) => x.key === t.key)!;
        expect(again.value - t.value).toBeCloseTo(t.weight, 6);
      }
    }
  });

  it('names the players behind each quality', () => {
    for (const t of league.teams.slice(0, 6)) {
      const players = fitRoster(teamPlayers(league, t.tid));
      const pr = rosterProfile(players);
      const top = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, 8);
      const c = (pid: number) => composites(players.find((p) => p.pid === pid)!.ratings);
      const creation = (pid: number) => (c(pid).pnrHandle + c(pid).create) / 2;
      expect(creation(pr.drivers.starCreator[0])).toBeCloseTo(pr.starCreator, 10);
      expect(c(pr.drivers.rimProtection[0]).rimProt).toBeCloseTo(pr.rimProtection, 10);
      expect(pr.drivers.creatorGap).toHaveLength(2);
      expect(pr.drivers.shooting).toHaveLength(top.length);
      // best first: the first shooter spaces the floor at least as well as the last
      expect(c(pr.drivers.shooting[0]).spacing).toBeGreaterThanOrEqual(c(pr.drivers.shooting[top.length - 1]).spacing);
      expect(pr.drivers.depth).toEqual([top[7].pid, top[0].pid]);
    }
  });
});
