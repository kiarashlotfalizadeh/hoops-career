// Settings choices that are also offered elsewhere (New League, the live game), defined once so the
// screens always agree.
import type { Settings } from '../core/types';
import { DIFFICULTIES, DIFFICULTY } from '../core/league/difficulty';

/** Live game playback speeds (1 = normal). */
export const LIVE_SPEEDS: { id: number; label: string }[] = [1, 2, 4].map((id) => ({ id, label: `${id}×` }));

/** The difficulty presets as picker options (the numbers live in core/league/difficulty.ts). */
export const DIFFICULTY_OPTIONS: { id: Settings['difficulty']; label: string; help: string }[] = DIFFICULTIES.map((id) => ({
  id,
  label: DIFFICULTY[id].label,
  help: DIFFICULTY[id].line,
}));

export const helpFor = <T extends string>(list: { id: T; help: string }[], id: T) => list.find((x) => x.id === id)?.help ?? '';
