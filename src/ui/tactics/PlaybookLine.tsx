// The style a phase's settings start from, at the top of each phase's instructions: how many of that
// phase's settings you've moved from it (with Put back, for that phase's settings only), and the key
// to the dot that marks the style's own setting on each control below.
import type { ReactNode } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { DEF_PRESETS, OFF_PRESETS, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { tacticsChanges } from '../../core/sim/playbooks';
import type { DefenseTactics, OffenseTactics, Tactics } from '../../core/types';
import { plural } from '../../core/format';
import { tweak } from './edit';
import type { Phase } from './fam';

/** The preset the user's offense or defense comes from. */
export const offPresetOf = (t: Tactics): OffPreset => OFF_PRESETS.find((p) => p.id === t.offPreset) ?? OFF_PRESETS[0];
export const defPresetOf = (t: Tactics): DefPreset => DEF_PRESETS.find((p) => p.id === t.defPreset) ?? DEF_PRESETS[0];

/** Each phase's settings that come from the style: the offensive playbook's and the defensive identity's. */
const PHASE_KEYS: Record<Phase, { off: (keyof OffPreset['values'])[]; def: (keyof DefPreset['values'])[] }> = {
  inPoss: { off: ['pace', 'actions', 'threePoint', 'rimAttack', 'huntMismatch'], def: [] },
  inTrans: { off: ['transition', 'crashBoards'], def: ['getBack', 'press'] },
  outPoss: { off: [], def: ['scheme', 'pnr', 'help', 'pressure', 'switchOffBall', 'physicality'] },
};

/** Phase `ph`'s settings put back as the style has them (in place). */
function putBack(tt: Tactics, ph: Phase) {
  const o = offPresetOf(tt).values as unknown as Record<string, unknown>;
  const d = defPresetOf(tt).values as unknown as Record<string, unknown>;
  const off = tt.offense as unknown as Record<string, unknown>;
  const def = tt.defense as unknown as Record<string, unknown>;
  for (const k of PHASE_KEYS[ph].off) off[k] = k === 'actions' ? { ...(o.actions as OffenseTactics['actions']) } : o[k];
  for (const k of PHASE_KEYS[ph].def) def[k] = d[k] as DefenseTactics[keyof DefenseTactics];
}

/** The tactics with phase `ph` as the style has it. */
const asStyle = (t: Tactics, ph: Phase): Tactics => {
  const out: Tactics = { ...t, offense: { ...t.offense, actions: { ...t.offense.actions } }, defense: { ...t.defense } };
  putBack(out, ph);
  return out;
};

export function PlaybookLine({ phase, help }: { phase: Phase; help?: ReactNode }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  // (transition takes from both: the playbook's push and glass, the identity's getting back and press)
  const name = phase === 'inPoss' ? offPresetOf(t).name : phase === 'outPoss' ? defPresetOf(t).name : 'your style';
  const moved = useLeagueMemo(() => tacticsChanges(asStyle(t, phase), t).length, [t, phase]);
  return (
    <div className="tx-pbline">
      <span className="grow tx-note">
        {moved ? `${plural(moved, 'setting')} moved from ${name}` : `As ${name} has it`} · <i className="tx-dot" aria-hidden="true" /> its own setting
      </span>
      {help}
      {moved > 0 && (
        <button className="btn xs" onClick={() => tweak((tt) => putBack(tt, phase))}>
          Put back
        </button>
      )}
    </div>
  );
}
