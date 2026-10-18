// The playbook a tab's settings start from, at the top of Offense and Defense: its name, how many of
// its settings you've moved (with Put back), and the key to the dot that marks the playbook's own
// setting on each control below.
import { useLeague, useLeagueMemo } from '../../state/store';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { tacticsChanges } from '../../core/sim/playbooks';
import type { Tactics } from '../../core/types';
import { plural } from '../../core/format';
import { tweak } from './edit';

/** The preset the user's offense or defense comes from. */
export const offPresetOf = (t: Tactics): OffPreset => OFF_PRESETS.find((p) => p.id === t.offPreset) ?? OFF_PRESETS[0];
export const defPresetOf = (t: Tactics): DefPreset => DEF_PRESETS.find((p) => p.id === t.defPreset) ?? DEF_PRESETS[0];

/** The tactics with that end put back as its preset has it. */
const putBack = (t: Tactics, kind: 'off' | 'def'): Tactics =>
  kind === 'off' ? { ...t, offense: applyOffPreset(t.offense, t.offPreset) } : { ...t, defense: applyDefPreset(t.defense, t.defPreset) };

export function PlaybookLine({ kind }: { kind: 'off' | 'def' }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const p = kind === 'off' ? offPresetOf(t) : defPresetOf(t);
  const moved = useLeagueMemo(() => tacticsChanges(putBack(t, kind), t).length, [t, kind]);
  return (
    <div className="tx-pbline">
      <span className="grow">
        <span className="tx-pbline-n">
          <span className="over">{kind === 'off' ? 'Playbook' : 'Identity'}</span> {p.name}
        </span>
        <span className="tx-note">
          {moved ? `${plural(moved, 'setting')} moved from it` : 'As it comes'} · <i className="tx-dot" aria-hidden="true" /> its own setting
        </span>
      </span>
      {moved > 0 && (
        <button
          className="btn xs"
          onClick={() =>
            tweak((tt) => {
              if (kind === 'off') tt.offense = applyOffPreset(tt.offense, tt.offPreset);
              else tt.defense = applyDefPreset(tt.defense, tt.defPreset);
            })
          }
        >
          Put back
        </button>
      )}
    </div>
  );
}
