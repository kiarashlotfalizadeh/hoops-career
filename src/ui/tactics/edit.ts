// How the Tactics tabs change the user's tactics: every edit is the coach's call from then on (the
// assistant stops managing them), and the tactics as a visit found them are what Undo and Compare go
// back to.
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

/** Where Undo and Compare go back to: the tactics as this visit found them. */
export const visitStart = (league: League) => {
  const tactics = cloneTactics(league.teams[league.userTid].tactics);
  return { of: league, tactics, sig: tacticsSig(tactics) };
};
