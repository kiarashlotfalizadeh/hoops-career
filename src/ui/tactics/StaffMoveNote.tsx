// The staff's change to the playbook it runs, on the Tactic section under the assistant's switch (its
// one home): what moved, that the staff moved it, when, a verdict and one number, and Undo
// (staffLever.ts). Without one in force, nothing.
import { edit } from '../../state/actions';
import { useLeague, useLeagueMemo } from '../../state/store';
import { moveLine, staffMoveNow, undoStaffMove } from '../../core/league/staffLever';

/** The staff's change in force, with Undo. */
export function StaffMoveNote() {
  const league = useLeague();
  const m = useLeagueMemo(() => staffMoveNow(league), [league]);
  if (!m) return null;
  return (
    <div className="tx-pbline tx-move">
      <span className="grow tx-note">{moveLine(league, m)}</span>
      <button className="btn xs" onClick={() => edit((l) => void undoStaffMove(l, m.day))}>
        Undo
      </button>
    </div>
  );
}
