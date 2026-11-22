// The style the system's settings start from, over the core settings: how many settings you've moved
// from it across the whole system (with Put back), which also keys the dot that marks the style's own
// setting on each control.
import { useLeague, useLeagueMemo } from '../../state/store';
import { DEF_PRESETS, OFF_PRESETS, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { tacticsChanges } from '../../core/sim/playbooks';
import type { DefenseTactics, OffenseTactics, Tactics } from '../../core/types';
import { plural } from '../../core/format';
import { tweak } from './edit';

/** The preset the user's offense or defense comes from. */
export const offPresetOf = (t: Tactics): OffPreset => OFF_PRESETS.find((p) => p.id === t.offPreset) ?? OFF_PRESETS[0];
export const defPresetOf = (t: Tactics): DefPreset => DEF_PRESETS.find((p) => p.id === t.defPreset) ?? DEF_PRESETS[0];

/** The settings that come from the style: the offensive playbook's and the defensive identity's. */
const STYLE_KEYS: { off: (keyof OffPreset['values'])[]; def: (keyof DefPreset['values'])[] } = {
  off: ['pace', 'actions', 'threePoint', 'rimAttack', 'huntMismatch', 'transition', 'crashBoards'],
  def: ['getBack', 'press', 'scheme', 'pnr', 'help', 'pressure', 'switchOffBall', 'physicality'],
};

/** The style's settings put back as the style has them (in place). */
function putBack(tt: Tactics) {
  const o = offPresetOf(tt).values as unknown as Record<string, unknown>;
  const d = defPresetOf(tt).values as unknown as Record<string, unknown>;
  const off = tt.offense as unknown as Record<string, unknown>;
  const def = tt.defense as unknown as Record<string, unknown>;
  for (const k of STYLE_KEYS.off) off[k] = k === 'actions' ? { ...(o.actions as OffenseTactics['actions']) } : o[k];
  for (const k of STYLE_KEYS.def) def[k] = d[k] as DefenseTactics[keyof DefenseTactics];
}

/** The tactics as the style has them. */
const asStyle = (t: Tactics): Tactics => {
  const out: Tactics = { ...t, offense: { ...t.offense, actions: { ...t.offense.actions } }, defense: { ...t.defense } };
  putBack(out);
  return out;
};

export function PlaybookLine() {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const moved = useLeagueMemo(() => tacticsChanges(asStyle(t), t).length, [t]);
  return (
    <div className="tx-pbline">
      <span className="grow tx-note">{moved ? `${plural(moved, 'setting')} moved from your style` : 'As your style sets it'}</span>
      {moved > 0 && (
        <button className="btn xs" onClick={() => tweak(putBack)}>
          Put back
        </button>
      )}
    </div>
  );
}
