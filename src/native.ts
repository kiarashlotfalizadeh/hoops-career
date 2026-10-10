// Native integrations when running inside the Capacitor shell (no-ops on the web).
import { Capacitor } from '@capacitor/core';
import { useStore } from './state/store';

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ App }, { StatusBar, Style }] = await Promise.all([import('@capacitor/app'), import('@capacitor/status-bar')]);
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: '#06080c' });
  } catch {
    /* status bar not available */
  }
  // Android hardware back: close sheets/navigate back; exit from the root screen.
  await App.addListener('backButton', () => {
    const backdrop = document.querySelector('.sheet-backdrop') as HTMLElement | null;
    if (backdrop) {
      backdrop.click();
      return;
    }
    const hash = window.location.hash.replace('#', '') || '/';
    if (hash === '/' || hash === '/start') void App.exitApp();
    else window.history.back();
  });
  // Persist when the app is backgrounded.
  await App.addListener('pause', () => {
    void useStore.getState().save();
  });
}
