// The labels that say "Custom" once a preset's sliders have moved.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { defenseLabel, offenseLabel, playbookLabel, presetMatches } from '../sim/playbooks';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset } from '../sim/tactics';
import type { League } from '../types';

const tactics = (l: League) => l.teams[l.userTid].tactics;

describe('preset labels', () => {
  it('a preset matches right after it is picked and not after a slider moves', () => {
    const l = testLeague();
    const t = tactics(l);
    for (const p of OFF_PRESETS) {
      t.offense = applyOffPreset(t.offense, p.id);
      t.offPreset = p.id;
      expect(presetMatches(t.offense, p)).toBe(true);
      expect(offenseLabel(t)).toBe(p.name);
    }
    for (const p of DEF_PRESETS) {
      t.defense = applyDefPreset(t.defense, p.id);
      t.defPreset = p.id;
      expect(presetMatches(t.defense, p)).toBe(true);
      expect(defenseLabel(t)).toBe(p.name);
    }
    t.offense = applyOffPreset(t.offense, 'balanced');
    t.offPreset = 'balanced';
    t.offense.actions.iso += 1;
    expect(presetMatches(t.offense, OFF_PRESETS[0])).toBe(false);
    t.defense = applyDefPreset(t.defense, 'drop');
    t.defPreset = 'drop';
    expect(playbookLabel(t)).toBe('Custom (Balanced base) · Drop & Protect');
    t.defense.help -= 5;
    expect(playbookLabel(t)).toBe('Custom (Balanced base) · Custom (Drop base)');
    // roles and game management aren't part of a preset
    t.offense = applyOffPreset(t.offense, 'helio');
    t.offPreset = 'helio';
    t.offense.roles[1] = 'post';
    t.offense.hotHand = !t.offense.hotHand;
    expect(offenseLabel(t)).toBe('Heliocentric');
    t.offPreset = 'gone';
    expect(offenseLabel(t)).toBe('Custom');
  });
});
