// The look the app wears: Hardwood (warm paper, black ink) by day, Night Court (the same poster on
// dark stock, bone ink) by night. The device's setting picks one or follows the system (ui/device.ts);
// the choice is written on the root as `data-theme`, and styles/night.css turns the tokens over. The
// colours worked out in script (a team's colour as text, the accent: ui/teamColors.ts) are told too,
// since they are darkened to read on paper by day and lightened to read on the dark stock by night.
import { useEffect, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { devicePrefs, onDevicePrefs, type ThemePref } from './device';
import { setNight } from './teamColors';

export type Theme = 'light' | 'dark';

/** The browser's bar and the installed app's frame, by theme: the page's own ground. */
const CHROME: Record<Theme, string> = { light: '#f3efe7', dark: '#171512' };

const system = () => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const resolveTheme = (pref: ThemePref): Theme => (pref === 'auto' ? system() : pref);

let current: Theme = 'light';
const subs = new Set<() => void>();

function apply() {
  const next = resolveTheme(devicePrefs().theme);
  const root = document.documentElement;
  if (root.dataset.theme === next && current === next) return;
  current = next;
  root.dataset.theme = next;
  setNight(next === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[next]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next);
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/status-bar')
      .then(async ({ StatusBar, Style }) => {
        await StatusBar.setStyle({ style: next === 'dark' ? Style.Dark : Style.Light });
        if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: CHROME[next] });
      })
      .catch(() => {});
  }
  subs.forEach((fn) => fn());
}

/** Set the look before the first paint (main.tsx), so a night-time launch never flashes paper. */
export function initTheme() {
  if (typeof document === 'undefined') return;
  apply();
  onDevicePrefs(apply);
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};

/** The look now. A screen that works a colour out in script reads it so it draws again when the look changes. */
export function useTheme(): Theme {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'light' as Theme,
  );
  // (a tree mounted before main.tsx set it up, as a test does)
  useEffect(() => {
    if (!document.documentElement.dataset.theme) apply();
  }, []);
  return theme;
}
