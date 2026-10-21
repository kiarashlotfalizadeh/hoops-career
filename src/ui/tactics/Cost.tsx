// What a decision that moves several drilled settings at once costs (Play through: the five action
// weights; When a shot goes up: the glass and getting back): where the team drilled them, and what
// each part of familiarity loses for the change until practice drills it. One line under the control,
// as Lv has for a single setting.
import { FAM_DIMS, famDims, type FamDim } from '../../core/sim/familiarity';
import { levelIndex } from '../../core/sim/tactics';
import type { Familiarity, Tactics } from '../../core/types';
import { habitValue, setHabit, type HabitKey } from './fam';

/** Tactics `t` with settings `keys` back where the team drilled them. */
export function drilledAt(fam: Familiarity, t: Tactics, keys: HabitKey[]): Tactics {
  let out = t;
  for (const k of keys) {
    const h = fam.habit[k];
    if (h !== undefined) out = setHabit(out, k, h);
  }
  return out;
}

/** The parts of familiarity settings `keys` cost where they sit now, against where they're drilled (none when every one reads as drilled). */
export function habitsCost(fam: Familiarity, t: Tactics, keys: HabitKey[]): { dim: FamDim; cost: number }[] | null {
  const off = keys.some((k) => fam.habit[k] !== undefined && levelIndex(fam.habit[k]!) !== levelIndex(habitValue(t, k)));
  if (!off) return null;
  const now = famDims(fam, t);
  const at = famDims(fam, drilledAt(fam, t, keys));
  return FAM_DIMS.map((d) => ({ dim: d.id, cost: Math.max(0, at[d.id] - now[d.id]) })).filter((x) => x.cost >= 0.5);
}

/** "Drilled at Balanced · −4 actions & shots familiarity until it's drilled", under a control that moves `keys`. */
export function CostLine({ fam, t, keys, drilled }: { fam: Familiarity; t: Tactics; keys: HabitKey[]; drilled: (dt: Tactics) => string }) {
  const cost = habitsCost(fam, t, keys);
  if (!cost) return null;
  return (
    <div className="tx-lv-fam">
      Drilled at <b>{drilled(drilledAt(fam, t, keys))}</b>
      {cost.length > 0 && (
        <>
          {' '}
          ·{' '}
          {cost.map((c, i) => (
            <span key={c.dim}>
              {i > 0 && ', '}
              <span className="bad">−{Math.round(c.cost)}</span> {FAM_DIMS.find((d) => d.id === c.dim)!.label.toLowerCase()}
            </span>
          ))}{' '}
          familiarity until it&apos;s drilled
        </>
      )}
    </div>
  );
}
