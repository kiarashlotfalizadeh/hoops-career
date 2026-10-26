// The staff's live voice, as a hook: at each stop in play the Live screen hands it the game (useLiveGame:
// a period's end, a timeout of either side, a run of theirs), and it drafts the changes the game
// suggests (calls.ts), measures them in the worker from that spot (never on the main thread: playback
// goes on while it measures) and holds what it found: a call with its number, or the line that none
// cleared. A change the coach makes on the touchline is measured the same way from where he made it.
import { useCallback, useRef, useState } from 'react';
import type { LiveGame } from '../../state/live';
import type { Tactics } from '../../core/types';
import { cancelLive, measureCallsLive, measureChangeLive, nextLiveId } from '../../state/simClient';
import type { CallReading } from '../../state/liveWorth';
import { DECLINED_TRIPS, callBy, callDrafts, callQuiet, confirmGames, spotLabel, type StaffCall } from './calls';
import type { StaffInput } from './staff';

/** Possessions a stop's measurement is left to finish before a later stop of the same weight takes its place. */
const MEASURE_HOLD = 8;

/** A change the coach made on the touchline, as measured from where he made it (null reading: still measuring). */
export interface ChangeWorth {
  /** What changed, in a few words ("Mentality: Aggressive"). */
  what: string;
  at: string;
  reading: CallReading | null;
  /** The staff's call he took (already measured): its reading is the call's. */
  call?: boolean;
}

export function useStaffCall() {
  const [call, setCall] = useState<StaffCall | null>(null);
  const [change, setChange] = useState<ChangeWorth | null>(null);
  const callRef = useRef(call);
  callRef.current = call;
  /** The measurement in flight: its id, how much its stop weighs (a period's end most), and the possession it started at. */
  const run = useRef<{ id: number; prio: number; steps: number } | null>(null);
  const changeRun = useRef(0);
  /** Changes the coach turned down, by draft id, with the possession he did. */
  const declined = useRef(new Map<string, number>());

  /**
   * A stop in play: the staff drafts its changes from `input` (the game as it stands, from the sim) and
   * measures them. `prio` 2 for a period's end (no later stop cuts it short), 1 for a timeout or a run.
   */
  const stop = useCallback((lg: LiveGame, input: StaffInput, slots: Parameters<typeof callDrafts>[2], prio: number) => {
    const cur = run.current;
    if (cur && (cur.prio > prio || (cur.prio === prio && lg.steps - cur.steps < MEASURE_HOLD))) return;
    if (cur) cancelLive(cur.id);
    run.current = null;
    const at = spotLabel(lg.sim.q, lg.sim.clock);
    // (a decided game has nothing to call; the period's last seconds leave the call up as it was)
    const quiet = callQuiet(lg.sim, lg.edge);
    if (quiet) return quiet === 'late' ? undefined : setCall(null);
    const skip = new Set([...declined.current].filter(([, s]) => lg.steps - s < DECLINED_TRIPS).map(([id]) => id));
    const drafts = callDrafts(input, lg.sim, slots, skip);
    if (!drafts.length) return setCall({ state: 'none', tried: 0, at });
    const id = nextLiveId();
    run.current = { id, prio, steps: lg.steps };
    // (a call up stays up while the next stop is measured: the new reading replaces it)
    if (callRef.current?.state !== 'call') setCall({ state: 'measuring', tried: drafts.length, at });
    const base = JSON.stringify(lg.sim.baseTactics(lg.userSide));
    const steps = lg.steps;
    measureCallsLive(
      lg.sim,
      lg.userSide,
      drafts.map((d) => d.choice),
      callBy(input.view),
      confirmGames(input.view),
      id,
    )
      .then((m) => {
        if (run.current?.id !== id) return;
        run.current = null;
        if (!m) return;
        setCall(m.pick !== null ? { state: 'call', draft: drafts[m.pick], m, at, base, steps } : { state: 'none', tried: drafts.length, at, m });
      })
      .catch((e: unknown) => {
        if (run.current?.id === id) run.current = null;
        console.warn('The staff could not measure its call:', e);
      });
  }, []);

  /** The coach turned the call down: that change isn't measured again for a while. */
  const decline = useCallback((draftId: string, steps: number) => {
    declined.current.set(draftId, steps);
    setCall(null);
  }, []);

  /** The coach took the call: its number is the change's (nothing to measure again). */
  const took = useCallback((what: string) => {
    const c = callRef.current;
    if (c?.state === 'call') setChange({ what, at: c.at, reading: c.m.reading, call: true });
    setCall(null);
  }, []);

  /** The coach changed tactics himself: `after` against `before`, from where the game stands now. */
  const changed = useCallback((lg: LiveGame, before: Tactics, after: Tactics, what: string) => {
    if (changeRun.current) cancelLive(changeRun.current);
    changeRun.current = 0;
    if (lg.over || !what) return setChange(null);
    const at = spotLabel(lg.sim.q, lg.sim.clock);
    // (a decided game: nothing a change does reads as anything)
    if (callQuiet(lg.sim, lg.edge) === 'decided') return setChange(null);
    const id = nextLiveId();
    changeRun.current = id;
    setChange({ what, at, reading: null });
    measureChangeLive(lg.sim, lg.userSide, { kind: 'tactics', tactics: before }, { kind: 'tactics', tactics: after }, id)
      .then((r) => {
        if (changeRun.current !== id || !r) return;
        changeRun.current = 0;
        setChange({ what, at, reading: r });
      })
      .catch((e: unknown) => console.warn('The change could not be measured:', e));
  }, []);

  /** The late play call is being measured: the staff's own measurement gives way (the worker is the play call's). */
  const hush = useCallback(() => {
    if (run.current) cancelLive(run.current.id);
    run.current = null;
    setCall((c) => (c?.state === 'measuring' ? null : c));
  }, []);

  /** A new game: nothing in flight, nothing said. */
  const reset = useCallback(() => {
    if (run.current) cancelLive(run.current.id);
    if (changeRun.current) cancelLive(changeRun.current);
    run.current = null;
    changeRun.current = 0;
    declined.current = new Map();
    setCall(null);
    setChange(null);
  }, []);

  return { call, change, stop, decline, took, changed, reset, hush };
}
