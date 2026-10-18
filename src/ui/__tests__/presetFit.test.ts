import { describe, expect, it } from 'vitest';
import { fitScale, offPresetFit, offPresetTerms, defPresetFit, defPresetTerms, type RosterProfile } from '../../core/ai/coachAI';
import { byFit, fitTone, shownFit } from '../tactics/fit';
import { OFF_PRESETS } from '../../core/sim/tactics';

/** A roster profile with every quality at `v` (and a given lead creator), no players behind them. */
function profile(v: number, starCreator = v): RosterProfile {
  const keys = [
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
  const pr = Object.fromEntries(keys.map((k) => [k, v])) as unknown as RosterProfile;
  return { ...pr, starCreator, creatorGap: 8, depth: 5, drivers: Object.fromEntries(keys.map((k) => [k, []])) } as unknown as RosterProfile;
}

describe('playbook fit on the shown scale', () => {
  it('adds its start and parts up to the fit on the row, for every preset', () => {
    for (const pr of [profile(50), profile(62, 85), profile(40, 70)]) {
      for (const [terms, fits] of [
        [offPresetTerms(pr), offPresetFit(pr)],
        [defPresetTerms(pr), defPresetFit(pr)],
      ] as const) {
        const scale = fitScale(fits);
        for (const id of Object.keys(fits)) {
          const f = shownFit(id, terms[id], fits);
          expect(f.shown).toBe(scale(id));
          expect(f.start + f.parts.reduce((a, p) => a + p.v, 0)).toBe(f.shown);
        }
      }
    }
  });

  it('ranks the best first, as 100, and the worst as 45', () => {
    const fits = offPresetFit(profile(62, 85));
    const order = byFit(OFF_PRESETS, fits);
    const scale = fitScale(fits);
    expect(scale(order[0].id)).toBe(100);
    expect(scale(order[order.length - 1].id)).toBe(45);
    expect(shownFit(order[0].id, offPresetTerms(profile(62, 85))[order[0].id], fits).rank).toBe(1);
  });

  it('reads 85 and up as good and under 60 as bad', () => {
    expect([fitTone(100), fitTone(85), fitTone(84), fitTone(60), fitTone(59)]).toEqual(['good', 'good', '', '', 'bad']);
  });
});
