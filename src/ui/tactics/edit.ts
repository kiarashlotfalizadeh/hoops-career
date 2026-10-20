// How the Tactics tabs change the user's tactics: every edit is the coach's call from then on (the
// assistant stops managing them), and the tactics as a visit found them are what Undo and Compare go
// back to (with the other tactic slots, which a switch between them moves).
import { edit } from '../../state/actions';
import { cloneTactics } from '../../core/sim/tactics';
import type { League, Tactics } from '../../core/types';

export type Edit = (fn: (t: Tactics) => void) => void;

/** A tactics edit: the coach's call from here on (the assistant stops managing them). */
export const tweak: Edit = (fn) =>
  void edit((l) => {
    const tt = l.teams[l.userTid].tactics;
    fn(tt);
    tt.manual = true;
  });

/**
 * The tactics as a signature to tell an edit by: without the saved playbook they came from, since
 * saving them as a playbook (or renaming it) changes no setting and isn't an edit to undo.
 */
export const tacticsSig = (t: Tactics) => JSON.stringify({ ...t, playbook: undefined });

/** Where Undo and Compare go back to: the tactics (and the other slots) as this visit found them. */
export const visitStart = (league: League) => {
  const team = league.teams[league.userTid];
  const tactics = cloneTactics(team.tactics);
  const slots = team.slots ? structuredClone(team.slots) : undefined;
  return { of: league, tactics, slots, sig: tacticsSig(tactics) };
};

/** Undo: the tactics and the slots back as `start` found them. */
export const undoTo = (start: ReturnType<typeof visitStart>) =>
  void edit((l) => {
    const tm = l.teams[l.userTid];
    tm.tactics = cloneTactics(start.tactics);
    if (start.slots) tm.slots = structuredClone(start.slots);
    else delete tm.slots;
  });
