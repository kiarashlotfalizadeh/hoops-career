// A 0-100 tactic's Levels, its setting's names from TACTIC_LEVELS, the edit made as the coach's call (tweak).
import type { Tactics } from '../../core/types';
import { TACTIC_LEVELS, type LeveledTactic } from '../../core/sim/tactics';
import { Levels } from '../components/ui';
import { tweak } from './edit';

export function Lv({
  label,
  level,
  value,
  mark,
  set,
}: {
  label: string;
  level: LeveledTactic;
  /** The setting's value now. */
  value: number;
  /** The playbook's own setting (its level carries a dot). */
  mark?: number;
  set: (tt: Tactics, v: number) => void;
}) {
  return (
    <div className="tx-lv">
      <Levels label={label} value={value} mark={mark} names={TACTIC_LEVELS[level]} onChange={(x) => tweak((tt) => set(tt, x))} />
    </div>
  );
}
