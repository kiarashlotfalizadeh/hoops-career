import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { App } from './ui/App';
import { Capacitor } from '@capacitor/core';
import { initNative } from './native';
import { useStore } from './state/store';

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
  void import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      onNeedRefresh: () => useStore.getState().toast('Update downloaded: it applies next time you open the app.', 'neutral'),
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
    }),
  );
}

// Ask the browser not to evict saved careers under storage pressure (Safari clears idle sites).
void navigator.storage?.persist?.().catch(() => false);
