// The staff's live voice, as a hook: at each stop in play the Live screen hands it the game (useLiveGame:
// a period's end, a timeout of either side, a run of theirs, crunch time's dead balls), and it drafts the
// changes the game suggests (calls.ts), measures them in the worker from that spot (never on the main
// thread: playback goes on while it measures) and holds what it found: a call with its number, or the
// line that none cleared. A stop the game will come to a few possessions on is measured from before it
// gets there (ahead): on a slow phone that lead is what keeps the readings full. A change the coach
// makes on the touchline is measured the same way from where he made it.
import { useCallback, useRef, useState } from 'react';
import type { LiveGame } from '../../state/live';
import type { Tactics } from '../../core/types';
import type { GameSim } from '../../core/sim/engine';
import { cancelLive, measureCallsLive, measureChangeLive, nextLiveId, reachLive } from '../../state/simClient';
import { CALL_BUDGET_MS, type CallReading, type CallsMeasured } from '../../state/liveWorth';
import { DECLINED_TRIPS, callBy, callDrafts, callQuiet, confirmGames, spotLabel, type StaffCall } from './calls';
import type { StaffInput } from './staff';

/** Possessions a stop's measurement is left to finish before a later stop of the same weight takes its place. */
const MEASURE_HOLD = 8;
/** Possessions a call stays up before a stop (not a period's end) measures again, and takes it as turned down. */
export const CALL_HOLD = 4;

/** A change the coach made on the touchline, as measured from where he made it (null reading: still measuring). */
export interface ChangeWorth {
  /** What changed, in a few words ("Mentality: Aggressive"). */
  what: string;
  at: string;
  reading: CallReading | null;
  /** The staff's call he took (already measured): its reading is the call's. */
  call?: boolean;
}

/** A stop the game will come to, measured before it gets there: the game played on to it (a copy) and the possessions it'll have played by then. */
export interface StopAhead {
  sim: GameSim;
  steps: number;
}

/** The measurement in flight. */
interface Run {
  id: number;
  /** How much its stop weighs (a period's end most). */
  prio: number;
  /** The possession it's measured from (the game's steps there). */
  steps: number;
  tried: number;
  at: string;
  /** Its budget once the game is at its spot. */
  budget: number;
  /** Started ahead of the game: the moves made by then (one more and it's another game), whether the game has got there, and the reading if it came in before. */
  ahead?: { ops: number; reached: boolean; held?: CallsMeasured | null };
  publish: (m: CallsMeasured | null) => void;
}

export function useStaffCall() {
  const [call, setCall] = useState<StaffCall | null>(null);
  const [change, setChange] = useState<ChangeWorth | null>(null);
  const callRef = useRef(call);
  callRef.current = call;
  const run = useRef<Run | null>(null);
  const changeRun = useRef(0);
  /** Changes the coach turned down (with ×, or by leaving the call up to the next stop), by draft id, with the possession he did. */
  const declined = useRef(new Map<string, number>());

  /** A call still up when the game gets to the next stop went untaken: it's turned down as × would (no banner for it stop after stop). */
  const passOver = useCallback((steps: number) => {
    const up = callRef.current;
    if (up?.state === 'call') declined.current.set(up.draft.id, steps);
  }, []);

  /** The game got to the spot measured ahead: the budget starts now, and a reading already in is said. */
  const reach = useCallback(
    (lg: LiveGame, r: Run) => {
      r.ahead!.reached = true;
      passOver(lg.steps);
      if (r.ahead!.held !== undefined) {
        run.current = null;
        return r.publish(r.ahead!.held);
      }
      reachLive(r.id, r.budget);
      if (callRef.current?.state !== 'call') setCall({ state: 'measuring', tried: r.tried, at: r.at });
    },
    [passOver],
  );

  /**
   * A stop in play: the staff drafts its changes from `input` (the game as it stands, from the sim) and
   * measures them in `budget` ms. `prio` 2 for a period's end (no later stop cuts it short), 1 for the
   * others. With `ahead`, a stop the game will come to: measured from the copy played on to it, and
   * nothing said until the game is there (the next stop() call for that spot).
   */
  const stop = useCallback(
    (lg: LiveGame, input: StaffInput, prio: number, budget = CALL_BUDGET_MS, ahead?: StopAhead) => {
      const sim = ahead?.sim ?? lg.sim;
      const steps = ahead?.steps ?? lg.steps;
      const ops = lg.journal.ops.length;
      const cur = run.current;
      if (!ahead && cur?.ahead && !cur.ahead.reached) {
        // measured ahead for this very spot, with no move made since: the game is there
        if (cur.steps === lg.steps && cur.ahead.ops === ops) return reach(lg, cur);
        cancelLive(cur.id);
        run.current = null;
      }
      // a call up only a few possessions stays up (a period's end measures again all the same)
      const up = callRef.current;
      if (prio < 2 && up?.state === 'call' && steps - up.steps < CALL_HOLD) return;
      const now = run.current;
      if (now && (ahead || now.prio > prio || (now.prio === prio && steps - now.steps < MEASURE_HOLD))) return;
      if (now) cancelLive(now.id);
      run.current = null;
      if (!ahead) passOver(steps);
      const at = spotLabel(sim.q, sim.clock);
      // (a decided game has nothing to call; the period's last seconds leave the call up as it was)
      const quiet = callQuiet(sim, lg.edge);
      if (quiet) return ahead || quiet === 'late' ? undefined : setCall(null);
      // (ahead, the call up now is turned down by the time the game is there)
      const skip = new Set([...declined.current].filter(([, s]) => steps - s < DECLINED_TRIPS).map(([id]) => id));
      if (ahead && up?.state === 'call') skip.add(up.draft.id);
      const drafts = callDrafts(input, sim, skip);
      if (!drafts.length) return ahead ? undefined : setCall({ state: 'none', tried: 0, at });
      const id = nextLiveId();
      const base = JSON.stringify(sim.baseTactics(lg.userSide));
      const r: Run = {
        id,
        prio,
        steps,
        tried: drafts.length,
        at,
        budget,
        ahead: ahead && { ops, reached: false },
        publish: (m) => {
          if (m) setCall(m.pick !== null ? { state: 'call', draft: drafts[m.pick], m, at, base, steps } : { state: 'none', tried: drafts.length, at, m, steps });
        },
      };
      run.current = r;
      // (a call up stays up while the next stop is measured: the new reading replaces it)
      if (!ahead && callRef.current?.state !== 'call') setCall({ state: 'measuring', tried: drafts.length, at });
      measureCallsLive(
        sim,
        lg.userSide,
        drafts.map((d) => d.choice),
        callBy(input.view),
        confirmGames(input.view),
        id,
        undefined,
        budget,
        !!ahead,
      )
        .then((m) => {
          if (run.current?.id !== id) return;
          // (in before the game is there: held until it is)
          if (r.ahead && !r.ahead.reached) return void (r.ahead.held = m);
          run.current = null;
          r.publish(m);
        })
        .catch((e: unknown) => {
          if (run.current?.id === id) run.current = null;
          console.warn('The staff could not measure its call:', e);
        });
    },
    [passOver, reach],
  );

  /**
   * Whether a measurement is in flight (none: the staff can look ahead for its next stop). One measured
   * ahead for a spot the game went past without stopping, or made another game since (a move), is given up.
   */
  const busy = useCallback((lg: LiveGame) => {
    const cur = run.current;
    if (cur?.ahead && !cur.ahead.reached && (lg.steps >= cur.steps || cur.ahead.ops !== lg.journal.ops.length)) {
      cancelLive(cur.id);
      run.current = null;
    }
    return !!run.current;
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

  return { call, change, stop, busy, decline, took, changed, reset, hush };
}
