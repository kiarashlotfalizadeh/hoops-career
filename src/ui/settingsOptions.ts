// Settings choices that are also offered elsewhere (New League, the live game), defined once so the
// screens always agree.
import type { Settings } from '../core/types';
import type { Role } from '../core/league/create';

/** The help line for teaching, the same in Settings and New League. */
export const TEACHING_HELP = "The first-week guide on Today, its mail and Today's Glossary link. Every ? and glossary word stays.";

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

/** A new career's role (core/league/create.ts's Role), as New League offers it. */
export const ROLES: { id: Role; label: string; line: string }[] = [
  { id: 'coach', label: 'GM + Head Coach', line: 'You run the front office and the bench. The staff brings you its calls.' },
  { id: 'gm', label: 'GM only', line: 'You run the front office. The staff coaches: rotation, playbook and in-game calls.' },
];

/** The role new leagues start on: this device remembers the last choice. */
export function roleDefault(): Role {
  try {
    return localStorage.getItem('hc:role') === 'gm' ? 'gm' : 'coach';
  } catch {
    return 'coach';
  }
}

export function rememberRole(role: Role) {
  try {
    localStorage.setItem('hc:role', role);
  } catch {
    /* ignore */
  }
}

/** Live game playback speeds (1 = normal). */
export const LIVE_SPEEDS: { id: number; label: string }[] = [1, 2, 4, 8].map((id) => ({ id, label: `${id}×` }));

/** Where a live game stops for a break with a period report. */
export const LIVE_BREAKS: { id: NonNullable<Settings['liveBreaks']>; label: string }[] = [
  { id: 'quarters', label: 'Quarters' },
  { id: 'half', label: 'Halftime' },
  { id: 'off', label: 'None' },
];
