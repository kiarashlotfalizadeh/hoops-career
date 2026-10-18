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

const busy = () => {
  const st = useStore.getState();
  if (!st.sim) return false;
  st.toast('Wait for the sim to finish.', 'neutral');
  return true;
};

/** A league action, all or nothing. Returns whether it went through. */
export function act(label: string, fn: (l: League) => void): boolean {
  if (busy()) return false;
  return useStore.getState().attempt(label, fn);
}

/** A light change (a setting, a tactics level, a read mark). Returns whether it went through. */
export function edit(fn: (l: League) => void): boolean {
  if (busy()) return false;
  return useStore.getState().mutate(fn);
}

/** A change that isn't worth saving on its own (a read mark as a screen opens): saved with the next one. */
export function touch(fn: (l: League) => void): boolean {
  return useStore.getState().mutate(fn, false);
}
