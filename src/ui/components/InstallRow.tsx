// Today's one-time ask to install the web app (never in the native app). Safari in a tab clears a
// site's saves after a week unvisited, a Home Screen app's it keeps: on an iPhone or iPad in Safari
// the row says how (Safari has no install prompt), and where the browser offers its own install
// prompt (Chrome on Android) it's one tap. Dismissed, it never comes back on this device.
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, Share } from 'lucide-react';
import './agenda.css';

const DISMISSED = 'hc-install-row';

/** Chrome's install prompt, held back so the row can offer it (main.tsx starts listening at load: it fires once, early). */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let held: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    held = e as InstallPrompt;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    held = null;
    changed();
  });
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Safari on an iPhone or iPad (an iPad's Safari says it's a Mac, with a touch screen), in a tab. Other iOS browsers' menus differ. */
function iosSafariTab(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) && !standalone();
}

function dismissedHere(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

export function InstallRow() {
  const [, redraw] = useState(0);
  const [gone, setGone] = useState(dismissedHere);
  useEffect(() => {
    const f = () => redraw((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  if (gone || Capacitor.isNativePlatform() || standalone()) return null;
  const ios = iosSafariTab();
  if (!ios && !held) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* private mode: gone for this visit */
    }
    setGone(true);
  };
  const install = async () => {
    const p = held;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    held = null;
    if (outcome === 'accepted') dismiss();
    else changed();
  };
  return (
    <div className="td-need">
      <div className="ag-row">
        <div className="ag-head">
          <div className="grow">
            <div className="ag-title">{ios ? 'Add to Home Screen to keep your league safe' : 'Install the app to keep your league safe'}</div>
            <div className="ag-line">
              {ios ? (
                <>
                  Safari can clear a site’s saves after a week away. Tap <Share size={13} aria-label="Share" style={{ verticalAlign: '-2px' }} />, then Add to Home Screen.
                </>
              ) : (
                'Installed, it opens full screen and offline, and the browser keeps its saves.'
              )}
            </div>
          </div>
        </div>
        <div className="ag-acts">
          {!ios && (
            <button className="btn xs primary" onClick={() => void install()}>
              <Download size={14} aria-hidden="true" /> Install
            </button>
          )}
          <button className="btn xs" onClick={dismiss}>
            {ios ? 'Got it' : 'Not now'}
          </button>
        </div>
      </div>
    </div>
  );
}
