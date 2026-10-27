// The staff measuring the user's changes (core/ai/tacticEdits.ts), off the screen in the sim worker.
// The Team screens (Roster, Rotation, Tactics, Lineups) keep the team as a visit found it; tapping
// Done on Tactics, or leaving the Team screens, records what changed since as one change and starts
// measuring it over the next few games (10-20 seconds on a phone, the progress on Tactics, which can
// stop it). The result comes back as a line wherever the user is (a toast that opens Tactics →
// Analysis) and stays in the ledger there. A change recorded while a sim was starting is recorded
// when it ends. Later, a change due its check (CHECK_AFTER games played) is measured again on the
// games played and the staff's note goes out once.
//
// One measurement at a time, and never over one the user is waiting on (the matchup page's counters,
// worthLane.ts): a change whose measurement was stopped stays in the ledger unmeasured and is picked
// up again when the lane is free or the Team screens open.
//
// The snapshot is kept in the league too while the Team screens are open (League.editVisit, saved with
// the edit itself), so a change made before the app closes, reloads or is put away is never lost: a
// league that loads with one records the change since then (state/persistence.ts), measured here next.
import { useEffect, useSyncExternalStore } from 'react';
import type { League, TacticEdit } from '../../core/types';
import {
  checkLine,
  checksDue,
  closeEdit,
  editAt,
  editCall,
  editPlan,
  editsOf,
  madeLine,
  readEdit,
  recordEdit,
  revertEdit,
  saveCheck,
  saveMade,
  unmeasured,
  type EditAt,
  type GameReadings,
  type TeamPart,
} from '../../core/ai/tacticEdits';
import { teamPlayers } from '../../core/league/helpers';
import { cancelWorth, measureChanges } from '../../state/simClient';
import { useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { rosterNames } from '../stats';
import { laneBusy, onLaneIdle } from './worthLane';

export interface EditWatch {
  /** The measurement running: the change, which kind, how far it has got (0-1). */
  running: { id: number; kind: 'made' | 'check'; progress: number } | null;
  /** The last one done this session, its line and tone. */
  last: { id: number; kind: 'made' | 'check'; line: string; tone: 'good' | 'bad' | 'neutral' } | null;
}

let state: EditWatch = { running: null, last: null };
const subs = new Set<() => void>();
const put = (p: Partial<EditWatch>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** The staff's measurement of the user's changes: the one running and the last one done. */
export const useEditWatch = () => useSyncExternalStore(subscribe, () => state);

/** What a change is measured from: the user's team as the Team screens found it, or as the last change recorded left it. */
let snap: { id: string; part: TeamPart } | null = null;
/** The Team screens are open: the snapshot goes in the league as well, saved with the next change. */
let visiting = false;
/** Changes the user stopped measuring this session (they stay in the ledger, unmeasured). */
const stopped = new Set<number>();
let stopAsked = false;
/** A newer change came in while one was measured: measure again from the top when this one stops. */
let again = false;

const partOf = (l: League): TeamPart => {
  const t = l.teams[l.userTid];
  return structuredClone({ tactics: t.tactics, rotation: t.rotation });
};
const namesFor = (l: League) => rosterNames(teamPlayers(l, l.userTid));

/** Keep the user's team as it is now as what the next change is measured from. */
export function snapTeam(l: League) {
  snap = { id: l.id, part: partOf(l) };
  // (in place, not a change of its own: it only matters once an edit is saved with it)
  if (visiting) l.editVisit = structuredClone(snap.part);
}

/** Record the change since the snapshot (as `at` says the team was, for one made before a sim), and start measuring it. */
function settle(at?: EditAt): TacticEdit | null {
  const st = useStore.getState();
  const l = st.league;
  if (!l) return null;
  if (st.sim || !snap || snap.id !== l.id) {
    if (!st.sim) snapTeam(l);
    return null;
  }
  const before = snap.part;
  let e: TacticEdit | null = null;
  edit((x) => void (e = recordEdit(x, before, namesFor(x), at)));
  snapTeam(l);
  if (e) {
    // (a newer change goes first: the one in flight stops and is measured again after)
    if (state.running) {
      again = true;
      cancelWorth();
    } else void kick();
  }
  return e;
}

/** Done on Tactics, or leaving the Team screens: the change since the visit started is recorded and measured. */
export const settleEdits = () => settle();

/** Stop the measurement running (the change stays unmeasured until the next session). */
export function stopMeasuring() {
  if (!state.running) return;
  stopAsked = true;
  cancelWorth();
}

/** Put a change back (the check's "want it back?"). */
export function putBackEdit(e: TacticEdit): boolean {
  let ok = false;
  edit((l) => void (ok = revertEdit(l, e)));
  const l = useStore.getState().league;
  if (ok && l) snapTeam(l);
  return ok;
}

/** The next measurement: a change not measured yet (the newest first), else a check that's due. */
async function kick(): Promise<void> {
  const st = useStore.getState();
  const l0 = st.league;
  if (state.running || laneBusy() || !l0 || st.sim) return;
  const made = unmeasured(l0).find((e) => !stopped.has(e.id));
  const e = made ?? checksDue(l0).find((x) => !stopped.has(x.id));
  if (!e) return;
  const kind = made ? 'made' : 'check';
  // the league as it stands now, kept still while it's measured (the user's team copied: edits change it in place)
  const l: League = { ...l0, teams: l0.teams.map((t, i) => (i === l0.userTid ? structuredClone(t) : t)) };
  const { plan, replaced } = editPlan(l, e, kind);
  if (!plan) {
    if (replaced) edit((x) => closeEdit(x, e.id, 'replaced'));
    // (no games to measure it on: the offseason, or the season's end)
    else stopped.add(e.id);
    return kick();
  }
  put({ running: { id: e.id, kind, progress: 0 } });
  const readings: GameReadings = [];
  const n = plan.games.length;
  for (let i = 0; i < n; i++) {
    const g = plan.games[i];
    const out = await measureChanges(l, g.opp, g.gid, plan.changes, (d, t) => put({ running: { id: e.id, kind, progress: (i + d / t) / n } }), plan.perGame).catch(
      (err: unknown) => {
        console.warn('The change could not be measured:', err);
        return null;
      },
    );
    if (!out) {
      // stopped: by the user (not again this session), or by a measurement the user is waiting on (again when it's done)
      if (stopAsked) stopped.add(e.id);
      stopAsked = false;
      put({ running: null });
      if (again) {
        again = false;
        void kick();
      }
      return;
    }
    readings.push({ w: g.w, worth: out });
  }
  const r = readEdit(readings);
  put({ running: null });
  const cur = useStore.getState().league;
  if (cur?.id === l.id && edit((x) => (kind === 'made' ? saveMade(x, e.id, r, plan.count) : saveCheck(x, e.id, r.worth, plan.count)))) {
    const saved = editsOf(cur).find((x) => x.id === e.id)!;
    const line = kind === 'made' ? madeLine(saved) : checkLine(saved);
    const call = editCall(kind === 'made' ? saved.worth : saved.check);
    const tone = call === 'gain' ? 'good' : call === 'cost' ? 'bad' : 'neutral';
    put({ last: { id: e.id, kind, line, tone } });
    useStore.getState().toast(line, tone, '/team/tactics/analysis');
  }
  again = false;
  void kick();
}

onLaneIdle(() => void kick());

/**
 * The Team screens' watch on the user's changes: the team as the visit found it is kept; leaving
 * records the change since (Tactics' Done records it sooner); a sim started meanwhile records it as
 * the team stood before the sim, once it's done. Opening them picks up whatever is waiting: a change
 * not measured yet, a check that's due.
 */
export function useTeamEditWatch() {
  useEffect(() => {
    visiting = true;
    const l = useStore.getState().league;
    if (l) snapTeam(l);
    let before: EditAt | null = null;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.sim && !prev.sim && prev.league) before = editAt(prev.league);
      else if (!s.sim && prev.sim) {
        const at = before;
        before = null;
        // (after the store has finished taking the sim's league)
        setTimeout(() => {
          if (at) settle(at);
          else if (useStore.getState().league) snapTeam(useStore.getState().league!);
          void kick();
        }, 0);
      } else if (s.league && prev.league && s.league.id !== prev.league.id) snapTeam(s.league);
    });
    void kick();
    return () => {
      unsub();
      settle();
      visiting = false;
      const lo = useStore.getState().league;
      if (lo) delete lo.editVisit;
    };
  }, []);
}
