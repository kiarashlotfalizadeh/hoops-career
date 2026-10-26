// A 0-100 tactic's Levels with what it costs to learn: when the setting sits off the level the team
// has drilled it at, a line under it says where they drilled it and, when learning it costs the five
// more than a sliver, what that costs a game, measured on the next game (learnCost.ts), so the cost of
// a switch is in view before the next game in the unit a change is measured in.
import type { Familiarity, Tactics } from '../../core/types';
import { TACTIC_LEVELS, type LeveledTactic } from '../../core/sim/tactics';
import { Levels } from '../components/ui';
import { habitValue, offHabit, setHabit, type HabitKey } from './fam';
import { tweak } from './edit';
import { learnInline, useLearnCost } from './learnCost';

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
  const h = fam.habit[k];
  const learn = useLearnCost(off && h !== undefined ? setHabit(t, k, h) : t, off ? t : null);
  return (
    <div className="tx-lv">
      <Levels label={label} value={value} mark={mark} names={TACTIC_LEVELS[level]} onChange={(x) => tweak((tt) => set(tt, x))} />
      {off && (
        <div className="tx-lv-fam">
          Drilled at <b>{off.drilled}</b>
          {learn && learnInline(learn)}
        </div>
      )}
    </div>
  );
}
