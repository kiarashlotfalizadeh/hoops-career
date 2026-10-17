import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Latin + Latin Extended cover every player name (Dončić, Şengün, Valančiūnas); other scripts aren't used.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-ext-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-ext-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-ext-800.css';
import './ui/theme.css';
import { App } from './ui/App';
import { Capacitor } from '@capacitor/core';
import { initNative } from './native';
import { useStore } from './state/store';
import { DISC } from './core/sim/discipline';

// QA scripts drive the store directly in dev builds (save, inspect the league), and can make tempers
// flare (the technical and flagrant rates) to see an ejection.
if (import.meta.env.DEV || import.meta.env.VITE_QA === '1') (window as unknown as { __hc: unknown }).__hc = { store: useStore, disc: DISC };

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
    }),
  );
}

// Ask the browser not to evict saved careers under storage pressure (Safari clears idle sites).
void navigator.storage?.persist?.().catch(() => false);
