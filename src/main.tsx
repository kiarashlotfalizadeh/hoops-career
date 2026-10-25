import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { App } from './ui/App';
import { Capacitor } from '@capacitor/core';
import { initNative } from './native';
import { useStore } from './state/store';
import { noteStorageKept } from './state/backup';
import { watchInstall } from './ui/components/InstallRow';

// QA scripts drive the store directly in dev builds (save, inspect the league).
if (import.meta.env.DEV || import.meta.env.VITE_QA === '1') (window as unknown as { __hc: unknown }).__hc = { store: useStore };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initNative();

// Offline support on the web. Inside the native app the files ship with the APK, so no service worker.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && !import.meta.env.DEV) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    /** A new version is downloaded and waiting for this tab to let it in. */
    let waiting = false;
    /** This tab let it in (while hidden, with the league saved): the reload it takes over with is due now. */
    let switching = false;
    /** Another tab let it in: this one reloads into it the next time it's left. */
    let reloadDue = false;
    // a home-screen app is rarely closed, so "next launch" could be weeks away: the update goes in
    // the next time the app is left instead, while nobody's looking and once the league is safely
    // saved (the reload opens it on the same screen). Never mid-sim, in a live game or a new
    // league's setup: those wait for the next time.
    const safeToReload = async () => {
      const st = useStore.getState();
      const route = window.location.hash.replace(/^#/, '') || '/';
      if (st.sim || /^\/(live|new)(\/|$)/.test(route)) return false;
      return st.saveBeforeLeaving();
    };
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        waiting = true;
        useStore.getState().toast('Update downloaded: it goes in the next time you leave the app.', 'neutral');
      },
      onNeedReload: () => {
        if (switching) window.location.reload();
        else reloadDue = true;
      },
      // the browser looks for a new version when the app is opened, but a home-screen app can stay
      // open in the background for days: look again when it comes back to the front (at most hourly)
      onRegisteredSW: (_url, reg) => {
        if (!reg) return;
        let looked = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - looked < 60 * 60 * 1000) return;
          looked = Date.now();
          void reg.update().catch(() => {});
        });
      },
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden' || (!waiting && !reloadDue)) return;
      void safeToReload().then((ok) => {
        // (not if the app is back in front by the time the save is done)
        if (!ok || document.visibilityState !== 'hidden') return;
        if (reloadDue) {
          window.location.reload();
          return;
        }
        switching = true;
        void update();
      });
    });
  });
}

// Ask the browser not to evict saved careers under storage pressure (Safari clears idle sites). On
// the web, where it won't promise (or can't be asked), Today asks for a backup a season sooner and
// offers to install the app (see InstallRow, which needs the install prompt from the start).
if (Capacitor.isNativePlatform()) void navigator.storage?.persist?.().catch(() => false);
else {
  watchInstall();
  void (async () => {
    let kept = false;
    try {
      kept = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
    } catch {
      /* not answered: as not kept */
    }
    noteStorageKept(kept);
  })();
}
