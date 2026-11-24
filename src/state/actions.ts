// How screens change the league. Every change goes through one of these, never through the store's
// `mutate` directly:
//
// - `act(label, fn)`: a league action (a signing, a trade, a release, a pick, a game plan, an
//   agenda decision). It runs whole or not at all: if `fn` throws, the league goes back to how it
//   was and a toast says `label` hit an error.
// - `edit(fn)`: a light change that can't leave the league half-done (a setting, a tactics level,
//   a read mark). No rollback, so no copy of the league is taken.
//
// Both are refused while a sim or a phase change runs (the worker is playing on a copy of the
// league that will replace this one), and say so. Several steps that belong together (execute a
// trade, then move the draft on) go in one `act`, in an action module next to this one, so a screen
// calls one function and the steps can't come apart.
import type { League } from '../core/types';
import { useStore } from './store';
import { ensureRotation } from '../core/league/games';

/** The user's roster, as a key: a change to it (a trade, a signing, a release) brings the rotation up to date at once. */
const rosterKey = (l: League) =>
  Object.values(l.players)
    .filter((p) => p.tid === l.userTid)
    .map((p) => p.pid)
    .sort((a, b) => a - b)
    .join(',');

/**
 * `fn`, then the rotation brought up to date if it changed who's on the roster: a player traded for or
 * signed plays his minutes on the Rotation screen right away, not from the next game on (the playtest
 * saw new arrivals at 0 until then).
 */
const withRotation = (fn: (l: League) => void) => (l: League) => {
  const before = rosterKey(l);
  fn(l);
  if (l.teams[l.userTid] && rosterKey(l) !== before) ensureRotation(l, l.userTid);
};

const busy = () => {
  const st = useStore.getState();
  if (!st.sim) return false;
  st.toast('Wait for the sim to finish.', 'neutral');
  return true;
};

/** A league action, all or nothing. Returns whether it went through. */
export function act(label: string, fn: (l: League) => void): boolean {
  if (busy()) return false;
  return useStore.getState().attempt(label, withRotation(fn));
}

/** A light change (a setting, a tactics level, a read mark). Returns whether it went through. */
export function edit(fn: (l: League) => void): boolean {
  if (busy()) return false;
  return useStore.getState().mutate(withRotation(fn));
}

/** A change that isn't worth saving on its own (a read mark as a screen opens): saved with the next one. */
export function touch(fn: (l: League) => void): boolean {
  return useStore.getState().mutate(fn, false);
}
