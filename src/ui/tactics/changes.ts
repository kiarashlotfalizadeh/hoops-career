// What a change to the tactics does, in the words of the Tactics screen's own controls, wherever it
// is shown: a game plan's items, the staff's counters, a live game's changes. One name for each
// setting everywhere.
import { tacticsChanges, type TacticsChange } from '../../core/sim/playbooks';
import type { Tactics } from '../../core/types';

/** Every setting that differs from `a` to `b` (core/sim/playbooks names each as the Tactics screen does). */
export const screenChanges = (a: Tactics, b: Tactics, nameOf?: (pid: number) => string) => tacticsChanges(a, b, nameOf);

/** "Help defense: Balanced → Pack the paint · Star plan: Play straight → Double-team". */
export const changesLine = (list: TacticsChange[]) => list.map((c) => (c.from || c.to ? `${c.label}: ${c.from} → ${c.to}` : `${c.label} changes`)).join(' · ');
