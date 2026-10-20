// Game day and the staff on the tactics overhaul: the report's words for the engine's familiarity,
// shape and out-of-possession role tags, the staff's cards on familiarity (with the practice focus as
// their one-tap fix), the shape and the roles, and the debrief's word on practice.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { trainingCamps } from '../league/practice';
import { IMPACT_TEXT, impactSentence } from '../analysis/gameReport';
import { practiceAdvice } from '../analysis/debrief';
import { famReadout, optionName } from '../ai/advisor';
import { applyFix, assistantFeed } from '../ai/assistant';
import type { League } from '../types';

function league(): League {
  const l = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
  l.phase = 'regular';
  trainingCamps(l);
  return l;
}

describe('the staff on familiarity', () => {
  it('has words for every new engine tag', () => {
    for (const key of [
      'fam_off:d',
      'fam_def:o',
      'shape_glass:o',
      'shape_glass:d',
      'shape_space:o',
      'shape_space:d',
      'shape_tov:o',
      'role_poa:d',
      'role_stopper:d',
      'role_anchor:d',
      'role_anchor:o',
      'role_roam:d',
      'role_roam:o',
    ]) {
      expect(IMPACT_TEXT[key], key).toBeDefined();
      expect(impactSentence(key, 'the Aces', 'the Bees', ' (Smith)')).toMatch(/^[A-Z].*\.$/);
    }
    expect(optionName('pnr:blitz')).toBe('the blitz');
    expect(optionName('scheme:zone23')).toBe('the 2-3 zone');
  });

  it('flags an option the team hasn’t drilled, with tactical drills one tap away', () => {
    const l = league();
    expect(famReadout(l).risks).toEqual([]);
    const t = l.teams[0].tactics;
    t.manual = true;
    t.defense.scheme = 'zone23';
    const r = famReadout(l);
    expect(r.risks[0]).toMatchObject({ key: 'scheme:zone23', plan: false });
    const card = assistantFeed(l).find((c) => c.id === 'alert:fam-opt-scheme:zone23');
    expect(card?.area).toBe('tactics');
    expect(card?.fix).toEqual({ kind: 'prep', focus: 'system', label: 'Tactical drills' });
    expect(applyFix(l, card!.fix!)).toMatch(/Tactical drills/);
    expect(l.teams[0].prep).toBe('system');
    // with the drills on, the card has no fix left to offer
    expect(assistantFeed(l).find((c) => c.id === 'alert:fam-opt-scheme:zone23')?.fix).toBeUndefined();
  });

  it('marks what tonight’s plan brings apart from the system', () => {
    const l = league();
    const opp = 1;
    l.gamePlans = { [opp]: { oppTid: opp, items: [{ id: 'z', label: 'Zone', group: 'coverage', patch: { defense: { scheme: 'zone32' } } }] } } as League['gamePlans'];
    const r = famReadout(l, opp);
    expect(r.risks.find((x) => x.key === 'scheme:zone32')?.plan).toBe(true);
  });

  it('talks practice after a game a step slow cost, and not over a small cost', () => {
    const l = league();
    expect(practiceAdvice(l, 0.3)).toBeNull();
    // the system is learned: the plan was the gap
    expect(practiceAdvice(l, 1.2)).toMatchObject({ id: 'prep-opponent', prep: 'opponent' });
    l.teams[0].tactics.defense.scheme = 'zone23';
    const a = practiceAdvice(l, 1.2)!;
    expect(a).toMatchObject({ id: 'prep-system', prep: 'system', label: 'Tactical drills' });
    l.teams[0].prep = 'system';
    const b = practiceAdvice(l, 1.2)!;
    expect(b.title).toBe('Stick with the system');
    expect(b.prep).toBeUndefined();
  });
});
