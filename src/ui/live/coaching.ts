// The live screen's coaching moves, made through the game so its journal keeps them: a tactics change
// (and "Keep changes after this game", which writes tonight's changes into the saved tactics), a
// substitution, and the staff's fix for an alert.
import { haptic } from '../../native';
import { useStore } from '../../state/store';
import { edit } from '../../state/actions';
import type { LiveGame } from '../../state/live';
import type { Tactics } from '../../core/types';
import { keptTactics } from './keep';
import type { LiveAlert } from './alerts';
import { userSetup } from './session';
import { changesLine, screenChanges } from '../tactics/changes';
import type { LiveSession } from './useLiveGame';

export function coachingMoves(s: LiveSession, openLineup: () => void) {
  const { liveRef, userSide, coach, nameOf, callTimeout, bump, setDismissed } = s;

  /**
   * "Keep changes after this game" (see keptTactics), worked out again after every change: taking
   * one back (or "Reset to game plan") takes it out of the saved tactics too.
   */
  const keep = (lg: LiveGame) => {
    const base = lg.keep;
    if (!base) return;
    const kept = keptTactics(base, lg.planned, lg.sim.baseTactics(lg.userSide));
    edit((l) => {
      l.teams[l.userTid].tactics = kept;
      // this screen made the change: resuming later shouldn't treat it as an outside edit
      lg.markSeen(userSetup(l, lg).seen);
    });
  };

  /**
   * Every in-game tactics change goes through the tactics the coach set (never an in-game overlay on
   * them); `staff`: the staff made it, and why (its moves are marked as the staff's). One the coach
   * makes himself is measured from where he made it (`what` names it; the staff's call he takes,
   * `measured`, has its number already).
   */
  const applyTactics = (fn: (t: Tactics) => void, staff?: string, opts: { what?: string; measured?: boolean } = {}) => {
    const lg = liveRef.current;
    if (!lg) return;
    const before = lg.sim.baseTactics(userSide);
    const t = lg.sim.baseTactics(userSide);
    fn(t);
    coach((g) => g.setTactics(t, false, staff));
    keep(lg);
    if (!staff && !opts.measured) s.staff.changed(lg, before, t, opts.what ?? changesLine(screenChanges(before, t, nameOf).slice(0, 2)));
    bump();
  };

  /** "Keep changes after this game" (kept with the game, so it's still on after the app was closed). */
  const setKeep = (on: boolean) => {
    const lg = liveRef.current;
    if (!lg) return;
    if (on) {
      // what was changed before it was turned on is kept too
      coach((g) => g.setKeep(useStore.getState().league!.teams[g.userTid].tactics));
      keep(lg);
    } else if (lg.keep) {
      // off again: the saved tactics go back to what they were
      const base = lg.keep;
      edit((l) => {
        lg.setKeep(null);
        l.teams[l.userTid].tactics = base;
        lg.markSeen(userSetup(l, lg).seen);
      });
    }
    bump();
  };

  /** A substitution through the game (the court shows it from the next possession). */
  const substitute = (out: number, inn: number, quiet = false) => {
    const ok = !!coach((g) => g.substitute(out, inn));
    if (!ok) useStore.getState().toast(`${nameOf(inn)} can't come in for ${nameOf(out)} right now.`, 'bad');
    else if (!quiet) {
      haptic();
      useStore.getState().toast(`${nameOf(inn)} in for ${nameOf(out)}.`, 'good');
    }
    bump();
    return ok;
  };

  /** The staff's fix for an alert: a timeout, a tactics change, the lineup, or the sub he'd make. */
  const runAlert = (a: LiveAlert) => {
    const lg = liveRef.current;
    const what = a.action;
    if (!lg || !what) return;
    if (what.kind === 'timeout') callTimeout('stop the run');
    else if (what.kind === 'tactics') {
      applyTactics(what.apply);
      haptic();
      useStore.getState().toast(`${what.label}: from the next possession.`, 'good');
    } else if (what.kind === 'subs') openLineup();
    else substitute(what.out, what.in);
    setDismissed((d) => [...d, a.id]);
  };

  return { applyTactics, setKeep, substitute, runAlert };
}
