// Playbook fits as named terms ("Why fit 72"): the terms add up to the fit exactly, so the scores the
// Tactics screen shows and the assistant's preset choices are the same numbers.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { defPresetFit, defPresetTerms, fitRoster, fitScale, offPresetFit, offPresetTerms, rosterProfile, type ProfileKey, type RosterProfile } from '../ai/coachAI';
import { composites } from '../ratings';
import { Rng } from '../random';

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
      for (const [terms, fits] of [
        [offPresetTerms(pr), offPresetFit(pr)],
        [defPresetTerms(pr), defPresetFit(pr)],
      ] as const) {
        expect(Object.keys(fits).sort()).toEqual(Object.keys(terms).sort());
        for (const k of Object.keys(fits)) {
          expect(terms[k].reduce((a, x) => a + x.value, 0)).toBe(fits[k]);
          expect(terms[k][0].key).toBe('base');
          expect(Number.isFinite(fits[k])).toBe(true);
        }
        // the shown scale runs from 45 for the worst to 100 for the best
        const scale = fitScale(fits);
        const shown = Object.keys(fits).map(scale);
        expect(Math.max(...shown)).toBe(100);
        expect(Math.min(...shown)).toBe(45);
      }
    }
  });

  it('follows what the engine rewards: quick hands trap, size grinds, a lead creator keeps the ball', () => {
    const at = (v: Partial<RosterProfile>) => ({
      ...rosterProfile([]),
      starCreator: 64,
      creatorGap: 5,
      shooting: 33,
      passing: 52,
      bigPassing: 42,
      postScoring: 62,
      rimProtection: 67,
      athleticism: 54,
      size: 47,
      perimeterD: 52,
      depth: -14,
      steals: 50,
      bigMobility: 48,
      ...v,
    });
    const def = (v: Partial<RosterProfile>) => defPresetFit(at(v));
    const off = (v: Partial<RosterProfile>) => offPresetFit(at(v));
    // (since the trap's turnovers come from the trappers' hands alone, trapping pays only the league's
    // quickest: the Thunder's 60, not a good 57)
    expect(def({ steals: 60 }).blitz).toBeGreaterThan(def({ steals: 60 }).drop);
    expect(def({ steals: 60 }).blitz - def({ steals: 60 }).drop).toBeGreaterThan(def({ steals: 52 }).blitz - def({ steals: 52 }).drop);
    expect(def({ steals: 44 }).drop).toBeGreaterThan(def({ steals: 44 }).blitz);
    expect(off({ size: 53 }).grind - off({ size: 53 }).fiveOut).toBeGreaterThan(off({ size: 41 }).grind - off({ size: 41 }).fiveOut);
    expect(off({ starCreator: 74 }).helio - off({ starCreator: 74 }).hub).toBeGreaterThan(off({ starCreator: 56 }).helio - off({ starCreator: 56 }).hub);
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
