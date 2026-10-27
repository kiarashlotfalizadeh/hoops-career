// The staff's change to the playbook it runs, said the same way wherever the tactics show it (the
// hero, the style picker, the phase's instructions): what moved, that the staff moved it, when, what
// it measured in paired games, and Undo (staffLever.ts). Without one in force, nothing.
import { edit } from '../../state/actions';
import { useLeague, useLeagueMemo } from '../../state/store';
import { moveLine, staffMoveNow, undoStaffMove, type StaffMove } from '../../core/league/staffLever';
import type { Phase } from './fam';

/** The phase of the instructions a move's settings are in (transition: the push and the glass, getting back and the press). */
export function movePhase(m: StaffMove): Phase {
  const off = Object.keys(m.patch.offense ?? {});
  const def = Object.keys(m.patch.defense ?? {});
  if (off.some((k) => k === 'transition' || k === 'crashBoards') || def.some((k) => k === 'getBack' || k === 'press')) return 'inTrans';
  return def.length ? 'outPoss' : 'inPoss';
}

/** The staff's change in force, with Undo; `only` keeps it to one side of the ball (the picker's) or one phase. */
export function StaffMoveNote({ only }: { only?: 'off' | 'def' | Phase }) {
  const league = useLeague();
  const m = useLeagueMemo(() => staffMoveNow(league), [league]);
  if (!m) return null;
  if (only === 'off' && !m.patch.offense) return null;
  if (only === 'def' && !m.patch.defense) return null;
  if (only && only !== 'off' && only !== 'def' && movePhase(m) !== only) return null;
  return (
    <div className="tx-pbline tx-move">
      <span className="grow tx-note">{moveLine(league, m)}</span>
      <button className="btn xs" onClick={() => edit((l) => void undoStaffMove(l, m.day))}>
        Undo
      </button>
    </div>
  );
}
