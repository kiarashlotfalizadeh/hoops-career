// What this device is set to, whatever league is open: the look (Hardwood's paper or Night Court's
// ink, or the system's own choice) and the sound (the game's, the interface's, how loud). Kept in
// the device's own storage, not in a league: a league moves between devices, a phone on a train at
// night does not want the laptop's settings. One small store, read with `useDevice`.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';

export interface DevicePrefs {
  /** The look: the system's choice (the default), Hardwood (light) or Night Court (dark). */
  theme: ThemePref;
  /** The live game's sounds: the ball, the rim, the whistle, the horn, the crowd (default on). */
  gameSound: boolean;
  /** A soft tick under the interface's taps (default off: most play with the sound of a room around them). */
  uiSound: boolean;
  /** How loud, 0..1 (default 0.7). */
  volume: number;
}

const KEY = 'hc:device';
const DEFAULTS: DevicePrefs = { theme: 'auto', gameSound: true, uiSound: false, volume: 0.7 };

function read(): DevicePrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<DevicePrefs>;
    return {
      theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'auto',
      gameSound: p.gameSound !== false,
      uiSound: p.uiSound === true,
      volume: typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

let prefs = read();
const subs = new Set<() => void>();

export const devicePrefs = (): DevicePrefs => prefs;

export function setDevicePref<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) {
  if (prefs[key] === value) return;
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // (private mode, a full disk: the choice holds for this visit)
  }
  subs.forEach((fn) => fn());
}

export function onDevicePrefs(fn: () => void): () => void {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** The device's settings, live. */
export function useDevice(): DevicePrefs {
  return useSyncExternalStore(onDevicePrefs, devicePrefs, () => DEFAULTS);
}
