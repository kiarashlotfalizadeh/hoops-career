// The coach's saved playbooks (League.playbooks): his own library of tactics, which goes with him
// when he takes over another team. A playbook keeps the schemes, sliders and game management;
// roles, shot freedom and screeners are kept by player and only come back for players still on the
// roster, and the game-specific parts (matchups, the star target) are never saved. Also here: the
// names the screens give a team's playbook, which say "Custom" once the sliders leave the preset.

import { DEF_PRESETS, OFF_PRESETS, type DefPreset, type OffPreset } from './tactics';

// ---------------------------------------------------------------- preset labels

/** Short preset names, for "Custom (Balanced base)". */
const OFF_SHORT: Record<string, string> = { balanced: 'Balanced', helio: 'Heliocentric', fiveOut: 'Five-Out', hub: 'Hub Big', paceSpace: 'Pace & Space', grind: 'Grit & Grind' };
const DEF_SHORT: Record<string, string> = { drop: 'Drop', switch: 'Switch', blitz: 'Blitz', ice: 'Ice', hedge: 'Hedge', zone: '2-3 Zone', chaos: 'Chaos' };

/** Whether tactics still hold every value a preset sets: false once any of its sliders or switches has moved. */
export function presetMatches(values: object, preset: OffPreset | DefPreset): boolean {
  const cur = values as Record<string, unknown>;
  return Object.entries(preset.values).every(([k, v]) =>
    v !== null && typeof v === 'object' ? Object.entries(v).every(([a, x]) => (cur[k] as Record<string, unknown> | undefined)?.[a] === x) : cur[k] === v,
  );
}

/** The offense as the screens name it: the preset's name, or "Custom (Balanced base)" once its sliders have moved. */
export function offenseLabel(t: { offense: object; offPreset: string }): string {
  const p = OFF_PRESETS.find((x) => x.id === t.offPreset);
  if (!p) return 'Custom';
  return presetMatches(t.offense, p) ? p.name : `Custom (${OFF_SHORT[p.id] ?? p.name} base)`;
}

export function defenseLabel(t: { defense: object; defPreset: string }): string {
  const p = DEF_PRESETS.find((x) => x.id === t.defPreset);
  if (!p) return 'Custom';
  return presetMatches(t.defense, p) ? p.name : `Custom (${DEF_SHORT[p.id] ?? p.name} base)`;
}

/** "Heliocentric · Custom (Drop base)": a team's offense and defense, for headers and scouting. */
export function playbookLabel(t: { offense: object; defense: object; offPreset: string; defPreset: string }): string {
  return `${offenseLabel(t)} · ${defenseLabel(t)}`;
}
