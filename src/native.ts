// Native integrations when running inside the Capacitor shell (no-ops on the web).
import { Capacitor } from '@capacitor/core';
import { useStore } from './state/store';
import { canGoBack } from './ui/nav';

/** Resolves once no sim or phase change is running (a sim is asked to stop first). */
function idle(): Promise<void> {
  const st = useStore.getState();
  if (!st.sim) return Promise.resolve();
  st.stopSim();
  return new Promise((resolve) => {
    const off = useStore.subscribe((s) => {
      if (s.sim) return;
      off();
      resolve();
    });
  });
}

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ App }, { StatusBar, Style }] = await Promise.all([import('@capacitor/app'), import('@capacitor/status-bar')]);
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: '#06080c' });
  } catch {
    /* status bar not available */
  }
  // a second Back soon after a failed save (while its warning shows) leaves anyway
  let leaveUnsavedUntil = 0;
  const exit = async () => {
    const pressed = Date.now();
    await idle();
    if ((await useStore.getState().saveBeforeLeaving()) || pressed < leaveUnsavedUntil) {
      await App.exitApp();
      return;
    }
    leaveUnsavedUntil = Date.now() + 4000;
    useStore.getState().toast('Your league is not saved. Export a backup from the banner, or press Back again to leave anyway.', 'bad');
  };
  // Android hardware back: close sheets/navigate back; exit from the root screen once the league is saved.
  await App.addListener('backButton', () => {
    // sheets open on top of each other in DOM order: close the topmost one
    const backdrops = document.querySelectorAll<HTMLElement>('.sheet-backdrop');
    const backdrop = backdrops[backdrops.length - 1];
    if (backdrop) {
      backdrop.click();
      return;
    }
    const hash = window.location.hash.replace('#', '') || '/';
    if (hash === '/' || hash === '/start') void exit();
    // after a reload there's no earlier screen, and history.back() would do nothing
    else if (canGoBack()) window.history.back();
    else window.location.replace('#/');
  });
  // the OS may end a backgrounded app without warning
  await App.addListener('pause', () => void useStore.getState().flush());
}

/** A short haptic cue on phones (native app only; no-op on the web). */
export function haptic(kind: 'tap' | 'success' | 'warning' = 'tap') {
  if (!Capacitor.isNativePlatform()) return;
  void import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle, NotificationType }) =>
      kind === 'tap' ? Haptics.impact({ style: ImpactStyle.Light }) : Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning }),
    )
    .catch(() => {});
}
