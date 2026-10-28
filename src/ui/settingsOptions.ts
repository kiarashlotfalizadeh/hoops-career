// Settings choices that are also offered elsewhere (New League, the live game), defined once so the
// screens always agree.
import type { Settings } from '../core/types';

/** The help line for teaching, the same in Settings and New League. */
export const TEACHING_HELP = "The first-week guide on Today, its welcome mail and Today's Glossary link. Every ? and glossary word stays.";

/** Whether new leagues start with teaching on: this device remembers the last choice. */
export function teachingDefault(): boolean {
  try {
    return localStorage.getItem('hc:teaching') !== '0';
  } catch {
    return true;
  }
}

export function rememberTeaching(on: boolean) {
  try {
    localStorage.setItem('hc:teaching', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Live game playback speeds (1 = normal). */
export const LIVE_SPEEDS: { id: number; label: string }[] = [1, 2, 4].map((id) => ({ id, label: `${id}×` }));

/** Where a live game stops for a break with a period report. */
export const LIVE_BREAKS: { id: NonNullable<Settings['liveBreaks']>; label: string }[] = [
  { id: 'quarters', label: 'Quarters' },
  { id: 'half', label: 'Halftime' },
  { id: 'off', label: 'None' },
];
