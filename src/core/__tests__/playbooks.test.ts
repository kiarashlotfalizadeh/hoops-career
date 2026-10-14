// Saved playbooks: the coach's library of tactics, loaded onto whatever roster he has, and the
// labels that say "Custom" once a preset's sliders have moved.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import {
  MAX_PLAYBOOKS,
  applyPlaybook,
  changeText,
  defenseLabel,
  deletePlaybook,
  findPlaybook,
  loadPlaybook,
  offenseLabel,
  overwritePlaybook,
  playbookDiff,
  playbookLabel,
  playbookStatus,
  presetMatches,
  renamePlaybook,
  savePlaybook,
  tacticsChanges,
  toPlaybook,
} from '../sim/playbooks';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, cloneTactics, situationFromTemplate } from '../sim/tactics';
import { teamPlayers } from '../league/helpers';
import { takeOverTeam } from '../league/owner';
import type { League } from '../types';

const tactics = (l: League) => l.teams[l.userTid].tactics;
const roster = (l: League) => teamPlayers(l, l.userTid).map((p) => p.pid);
const saved = { season: 2027, day: 3 };

describe('saved playbooks', () => {
  it('a playbook loads back what was saved, without game-by-game choices, and marks where the tactics came from', () => {
    const l = testLeague();
    const t = tactics(l);
    const [a, b] = roster(l);
    t.offense.pace = 80;
    t.offense.actions.post = 12;
    t.defense.pnr = 'hedge';
    t.manage.hackThreshold = 45;
    t.offense.roles[a] = 'creator';
    t.offense.freedom[a] = 1;
    t.offense.screeners = [b];
    t.defense.matchups = { 999: a };
    t.defense.starTarget = 999;
    expect(savePlaybook(l, '  Run   and gun ')).toBeNull();
    const pb = l.playbooks![0];
    expect(pb.name).toBe('Run and gun');
    expect(t.playbook).toEqual({ id: pb.id, name: 'Run and gun' });
    expect(pb.offense).not.toHaveProperty('roles');
    expect(pb.defense).not.toHaveProperty('matchups');
    expect(pb.defense).not.toHaveProperty('starTarget');
    expect(pb.roles![a]).toBe('creator');
    expect(pb.screeners).toEqual([b]);
    const before = cloneTactics(t);
    // edit everything back, then load
    t.offense.pace = 30;
    t.offense.actions.post = 70;
    t.defense.pnr = 'drop';
    t.manage.hackThreshold = 0;
    t.offense.roles[a] = 'glue';
    t.offense.freedom[a] = -1;
    t.offense.screeners = [];
    t.defense.matchups = {};
    t.defense.starTarget = null;
    t.manual = false;
    expect(applyPlaybook(l, pb.id)).toBe(true);
    const after = tactics(l);
    expect(tacticsChanges(before, after)).toEqual([]);
    expect(after.offense.pace).toBe(80);
    expect(after.defense.pnr).toBe('hedge');
    expect(after.offense.roles[a]).toBe('creator');
    expect(after.offense.screeners).toEqual([b]);
    // matchups and the star target are tonight's business: loading leaves them as they are
    expect(after.defense.matchups).toEqual({});
    expect(after.defense.starTarget).toBeNull();
    expect(after.manual).toBe(true);
    expect(after.playbook).toEqual({ id: pb.id, name: pb.name });
  });

  it('roles, shot freedom and screeners only come back for players still on the roster', () => {
    const l = testLeague();
    const t = tactics(l);
    const [a, b, c] = roster(l);
    t.offense.roles[a] = 'post';
    t.offense.roles[b] = 'hub';
    t.offense.freedom[b] = 1;
    t.offense.screeners = [b, c];
    const pb = toPlaybook(t, { id: 'x', name: 'X', saved });
    // b has left since; a and c are still here
    t.offense.roles[a] = 'glue';
    t.offense.roles[b] = 'glue';
    t.offense.freedom[b] = 0;
    const out = loadPlaybook(t, pb, [a, c]);
    expect(out.offense.roles[a]).toBe('post');
    expect(out.offense.roles[b]).toBe('glue');
    expect(out.offense.freedom[b]).toBe(0);
    expect(out.offense.screeners).toEqual([c]);
  });

  it('shares no objects with the library, either way', () => {
    const l = testLeague();
    const t = tactics(l);
    const pb = toPlaybook(t, { id: 'x', name: 'X', saved });
    t.offense.actions.pnr = 1;
    t.offense.roles[roster(l)[0]] = 'post';
    t.manage.timeoutRun = 13;
    expect(pb.offense.actions.pnr).not.toBe(1);
    expect(pb.manage.timeoutRun).not.toBe(13);
    const out = loadPlaybook(t, pb, roster(l));
    for (const [x, y] of [
      [out.offense.actions, pb.offense.actions],
      [out.offense.roles, pb.roles],
      [out.offense.freedom, pb.freedom],
      [out.offense.screeners, pb.screeners],
      [out.manage, pb.manage],
    ])
      expect(x).not.toBe(y);
    out.offense.actions.iso = 99;
    out.manage.foulTrouble = 'strict';
    expect(pb.offense.actions.iso).not.toBe(99);
    expect(pb.manage.foulTrouble).not.toBe('strict');
    // nor with the tactics it was loaded onto
    expect(out.offense.roles).not.toBe(t.offense.roles);
    expect(out.defense.matchups).not.toBe(t.defense.matchups);
  });

  it('keeps at most twelve playbooks, with names that are unique whatever their case', () => {
    const l = testLeague();
    for (let i = 1; i <= MAX_PLAYBOOKS; i++) expect(savePlaybook(l, `Set ${i}`)).toBeNull();
    expect(savePlaybook(l, 'One more')).toMatch(/12 playbooks/);
    expect(l.playbooks).toHaveLength(MAX_PLAYBOOKS);
    deletePlaybook(l, l.playbooks![0].id);
    expect(savePlaybook(l, '  set 2 ')).toMatch(/already have a playbook called "Set 2"/);
    expect(savePlaybook(l, '   ')).toMatch(/name/);
    expect(savePlaybook(l, 'x'.repeat(31))).toMatch(/30 characters/);
    expect(savePlaybook(l, 'Fresh')).toBeNull();
    const ids = l.playbooks!.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fresh = l.playbooks!.find((p) => p.name === 'Fresh')!;
    expect(tactics(l).playbook?.id).toBe(fresh.id);
    expect(renamePlaybook(l, fresh.id, 'SET 3')).toMatch(/already/);
    // renaming to itself (another case) is fine, and the tactics' link follows
    expect(renamePlaybook(l, fresh.id, 'FRESH')).toBeNull();
    expect(tactics(l).playbook).toEqual({ id: fresh.id, name: 'FRESH' });
    deletePlaybook(l, fresh.id);
    expect(findPlaybook(l, fresh.id)).toBeUndefined();
    expect(tactics(l).playbook).toBeNull();
  });

  it('overwriting keeps the name and takes the current tactics', () => {
    const l = testLeague();
    savePlaybook(l, 'Base');
    const id = l.playbooks![0].id;
    tactics(l).offense.pace = 91;
    tactics(l).playbook = null;
    expect(overwritePlaybook(l, id)).toBe(true);
    expect(l.playbooks![0]).toMatchObject({ id, name: 'Base', offense: { pace: 91 } });
    expect(tactics(l).playbook).toEqual({ id, name: 'Base' });
    expect(overwritePlaybook(l, 'nope')).toBe(false);
  });

  it('the library belongs to the coach: it comes along when he takes over another team', () => {
    const l = testLeague();
    tactics(l).offense.roles[roster(l)[0]] = 'post';
    savePlaybook(l, 'Old team');
    savePlaybook(l, 'Another');
    const oldRoster = roster(l);
    const other = (l.userTid + 1) % 30;
    takeOverTeam(l, other);
    expect(l.userTid).toBe(other);
    expect(l.playbooks!.map((p) => p.name)).toEqual(['Old team', 'Another']);
    const theirRoles = { ...tactics(l).offense.roles };
    expect(applyPlaybook(l, l.playbooks![0].id)).toBe(true);
    // the old roster's roles stay behind
    expect(tactics(l).offense.roles).toEqual(theirRoles);
    expect(oldRoster.some((pid) => tactics(l).offense.roles[pid] !== undefined && theirRoles[pid] === undefined)).toBe(false);
    expect(tactics(l).playbook?.name).toBe('Old team');
  });

  it('says what loading would change, in Tactics-screen terms', () => {
    const l = testLeague();
    const t = tactics(l);
    const a = roster(l)[0];
    const names = (pid: number) => (pid === a ? 'Smith' : `#${pid}`);
    t.offense.pace = 80;
    t.defense.scheme = 'man';
    t.defense.pnr = 'hedge';
    t.offense.huntMismatch = true;
    t.manage.fatigueSub = 0.6;
    t.offense.roles[a] = 'creator';
    const pb = toPlaybook(t, { id: 'x', name: 'X', saved });
    const cur = cloneTactics(t);
    cur.offense.pace = 62;
    cur.defense.pnr = 'drop';
    cur.offense.huntMismatch = false;
    cur.manage.fatigueSub = 0.55;
    cur.offense.roles[a] = 'shooter';
    const lines = playbookDiff(cur, pb, roster(l), names).map(changeText);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Pace 62 → 80',
        'Coverage Drop → Hedge',
        'Hunt mismatches Off → On',
        'Sub out tired players at 55% energy → 60% energy',
        'Smith (role) Movement Shooter → Primary Creator',
      ]),
    );
    expect(lines).toHaveLength(5);
    expect(playbookDiff(t, pb, roster(l))).toEqual([]);
  });

  it('carries parts of the tactics it has no name for (newer features) through a save and a load', () => {
    const l = testLeague();
    // situations and a go-to player are newer than the playbook format: they still come through
    const t = tactics(l);
    const [goTo, other] = roster(l);
    const plan = situationFromTemplate('protectLead');
    t.situations = [plan];
    t.manage.goTo = goTo;
    const pb = toPlaybook(t, { id: 'x', name: 'X', saved });
    t.situations = [];
    t.manage.goTo = other;
    expect(playbookDiff(t, pb, roster(l)).map(changeText)).toEqual([`Go-to player #${other} → #${goTo}`, 'Situations changed']);
    const out = loadPlaybook(t, pb, roster(l));
    expect(out.situations).toEqual([plan]);
    expect(out.manage.goTo).toBe(goTo);
    expect(out.situations).not.toBe(pb.extra!.situations);
  });

  it('tells whether the tactics have moved since the playbook they came from', () => {
    const l = testLeague();
    expect(playbookStatus(l)).toBeNull();
    tactics(l).offense.pace = 80;
    savePlaybook(l, 'Mine');
    expect(playbookStatus(l)?.changes).toEqual([]);
    tactics(l).offense.pace = 70;
    expect(playbookStatus(l)?.changes.map(changeText)).toEqual(['Pace 80 → 70']);
    // a player who joins later isn't in the playbook: his role doesn't count as an edit
    const pb = l.playbooks![0];
    const newcomer = teamPlayers(l, (l.userTid + 1) % 30)[0];
    newcomer.tid = l.userTid;
    tactics(l).offense.roles[newcomer.pid] = 'glue';
    delete pb.roles![newcomer.pid];
    expect(playbookStatus(l)?.changes.map(changeText)).toEqual(['Pace 80 → 70']);
  });
});

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
