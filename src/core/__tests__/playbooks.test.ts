// The names the screens give a team's playbook, which say "Custom" once a preset's settings have
// moved, and the list of what changed between two sets of tactics in the Tactics screen's words.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { changeText, defenseLabel, offenseLabel, playbookLabel, presetMatches, tacticsChanges } from '../sim/playbooks';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, cloneTactics } from '../sim/tactics';
import { teamPlayers } from '../league/helpers';
import type { League } from '../types';

const tactics = (l: League) => l.teams[l.userTid].tactics;
const roster = (l: League) => teamPlayers(l, l.userTid).map((p) => p.pid);
const baseLeague = testLeague();
const fresh = () => structuredClone(baseLeague);

describe('playbook labels and changes', () => {
  it('say what changed in Tactics-screen terms, and label presets', () => {
    {
      // says what changed between two sets of tactics, in Tactics-screen terms
      const l = fresh();
      const t = tactics(l);
      const a = roster(l)[0];
      const names = (pid: number) => (pid === a ? 'Smith' : `#${pid}`);
      t.offense.pace = 80;
      t.defense.scheme = 'man';
      t.defense.pnr = 'hedge';
      t.offense.huntMismatch = true;
      t.manage.fatigueSub = 0.6;
      t.offense.roles[a] = 'creator';
      const cur = cloneTactics(t);
      cur.offense.pace = 62;
      cur.defense.pnr = 'drop';
      cur.offense.huntMismatch = false;
      cur.manage.fatigueSub = 0.55;
      cur.offense.roles[a] = 'shooter';
      const lines = tacticsChanges(cur, t, names).map(changeText);
      expect(lines).toEqual(
        expect.arrayContaining([
          'Tempo Balanced → Up-tempo',
          'Ball-screen coverage Drop → Hedge',
          'Hunt mismatches Off → On',
          'Sub out tired players at 55% energy → 60% energy',
          'Smith (role) Movement Shooter → Primary Creator',
        ]),
      );
      expect(lines).toHaveLength(5);
      expect(tacticsChanges(t, cloneTactics(t))).toEqual([]);
      // a player the names don't know has left: his settings went with him, no line with an empty name
      expect(tacticsChanges(cur, t, (pid) => (pid === a ? '' : `#${pid}`)).map(changeText)).not.toEqual(expect.arrayContaining([expect.stringMatching(/role/)]));
    }
    {
      // a preset matches right after it is picked and not after a slider moves
      const l = fresh();
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
      expect(playbookLabel(t)).toBe('Custom Balanced · Drop & Protect');
      t.defense.help -= 5;
      expect(playbookLabel(t)).toBe('Custom Balanced · Custom Drop');
      // roles and game management aren't part of a preset
      t.offense = applyOffPreset(t.offense, 'helio');
      t.offPreset = 'helio';
      t.offense.roles[1] = 'post';
      t.offense.hotHand = !t.offense.hotHand;
      expect(offenseLabel(t)).toBe('Heliocentric');
      t.offPreset = 'gone';
      expect(offenseLabel(t)).toBe('Custom');
    }
  });
});
