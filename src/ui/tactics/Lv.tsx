// A 0-100 tactic's Levels with what it costs in familiarity: when the setting sits off the level the
// team has drilled it at, a line under it says where they drilled it and what that part of the
// system loses for the change, so the cost of a switch is in view before the next game.
import type { Familiarity, Tactics } from '../../core/types';
import { TACTIC_LEVELS, type LeveledTactic } from '../../core/sim/tactics';
import { FAM_DIMS } from '../../core/sim/familiarity';
import { Levels } from '../components/ui';
import { habitDim, habitValue, offHabit, type HabitKey } from './fam';
import { tweak } from './edit';

export function Lv({
  label,
  k,
  level,
  t,
  fam,
  mark,
  set,
}: {
  label: string;
  /** The setting's habit key ('pace', 'a_pnr'...). */
  k: HabitKey;
  level: LeveledTactic;
  t: Tactics;
  fam: Familiarity;
  /** The playbook's own setting (its level carries a dot). */
  mark?: number;
  set: (tt: Tactics, v: number) => void;
}) {
  const value = habitValue(t, k);
  const off = offHabit(fam, t, k, level);
  const dim = FAM_DIMS.find((d) => d.id === habitDim(k))!;
  return (
    <div className="tx-lv">
      <Levels label={label} value={value} mark={mark} names={TACTIC_LEVELS[level]} onChange={(x) => tweak((tt) => set(tt, x))} />
      {off && (
        <div className="tx-lv-fam">
          Drilled at <b>{off.drilled}</b>
          {off.cost >= 0.5 && (
            <>
              {' '}
              · <span className="bad">−{Math.round(off.cost)}</span> {dim.label.toLowerCase()} familiarity until it&apos;s drilled
            </>
          )}
        </div>
      )}
    </div>
  );
}
