// The paywall on the web edition (clipboardgm.com, built with --mode web): every league's first season
// is free, draft and free agency included, and starting the next one needs the full game, bought once
// on Stripe's checkout page. The proof of purchase is a licence the server signs (license.ts), kept
// on this device and in backups, and checked offline. Other builds (the native apps, a plain build)
// never show it: PAYWALL is false there.
import { create } from 'zustand';
import { readLicense, type LicenseBody } from './license';
import { useStore } from './store';

export const PAYWALL = import.meta.env.VITE_PAYWALL === '1';
const PUBLIC_KEY: string = import.meta.env.VITE_LICENSE_PUBLIC_KEY ?? '';
/**
 * The price before tax, as the game shows it. "US$": Stripe's page shows a buyer abroad his own
 * currency (Adaptive Pricing is always on with Managed Payments), so a bare "$" would read as a
 * Canadian or Australian dollar and the checkout figure would look like a different price.
 */
export const PRICE = 'US$14.99';

const LICENSE = 'cgm:license';
/** A checkout that was opened and hasn't come back paid yet: claimed again at the next launch. */
const PENDING = 'cgm:checkout';
/** When the server last confirmed the licence still stands (a refund takes it back). */
const CHECKED = 'cgm:license-checked';
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

export type PaywallSheet = 'offer' | 'restore' | 'pending' | 'done';

interface UnlockState {
  unlocked: boolean;
  /** The paywall's sheet, when it's open (mounted once in the shell: Paywall.tsx). */
  sheet: PaywallSheet | null;
  busy: boolean;
  error: string | null;
  /** Where Stripe sent the receipt, and its number: the done sheet says so. */
  receipt: { email: string | null; number: string | null } | null;
}

export const useUnlock = create<UnlockState>(() => ({ unlocked: !PAYWALL, sheet: null, busy: false, error: null, receipt: null }));

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // (storage blocked: the licence lasts as long as the page)
  }
};
const str = (x: unknown) => (typeof x === 'string' && x ? x : null);

let license: LicenseBody | null = null;
let ready: Promise<void> = Promise.resolve();

/**
 * Keep a licence the server signed. False for anything that isn't one. `fresh`: the server just
 * issued it, so the purchase was confirmed now (one read back from storage or a backup was not: it
 * must not put off the weekly check, or a refund would never lock the game again).
 */
async function adopt(token: unknown, fresh = false): Promise<boolean> {
  const body = await readLicense(token, PUBLIC_KEY);
  if (!body) return false;
  license = body;
  write(LICENSE, token as string);
  if (fresh) write(CHECKED, String(Date.now()));
  useUnlock.setState({ unlocked: true });
  return true;
}

async function api(path: 'checkout' | 'claim' | 'restore', payload: Record<string, unknown>) {
  // (a hung connection gives up rather than leave a sheet spinning that can't be closed)
  const res = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

/**
 * Ask the server for a checkout session's licence. `back`: the buyer just came back from Stripe's
 * page, so the sheet shows how it went; otherwise it's a quiet retry, with a toast if it came through.
 */
async function claimSession(sid: string, back: boolean): Promise<void> {
  if (back) useUnlock.setState({ sheet: 'pending', busy: true, error: null });
  let r: Awaited<ReturnType<typeof api>> | null = null;
  try {
    r = await api('claim', { sid });
  } catch {
    // offline, or the server is down: the claim waits for the next try
  }
  const state = r?.data.state;
  if (r && state === 'paid' && (await adopt(r.data.license, true))) {
    write(PENDING, null);
    const was = useUnlock.getState().sheet;
    useUnlock.setState({ busy: false, error: null, receipt: { email: str(r.data.email), number: str(r.data.receipt) }, sheet: back || was ? 'done' : null });
    if (!back && !was) useStore.getState().toast('Your payment came through. Every season is unlocked.', 'good');
    return;
  }
  // a payment still clearing, a checkout page still open, or no answer: kept, to claim again later
  write(PENDING, state === 'unpaid' || state === 'revoked' ? null : sid);
  if (!back) return;
  const error =
    state === 'pending'
      ? null
      : state === 'open'
        ? 'Checkout isn’t finished yet. Nothing was charged.'
        : state === 'unpaid'
          ? 'The payment didn’t go through. Nothing was charged.'
          : state === 'revoked'
            ? 'That payment was refunded.'
            : 'Couldn’t confirm the payment yet. Check your connection, then check again.';
  // (a checkout never finished goes back to the offer, to start again: the clearing sheet is for payments made)
  useUnlock.setState({ busy: false, error, sheet: state === 'unpaid' || state === 'revoked' || state === 'open' ? 'offer' : 'pending' });
}

/**
 * At startup: the stored licence, then the return from Stripe's page (?unlock=… before the #route),
 * or a checkout from an earlier visit that never came back.
 */
export function initUnlock(): void {
  if (!PAYWALL) return;
  ready = (async () => {
    const kept = read(LICENSE);
    if (kept && !(await adopt(kept))) write(LICENSE, null);
    const url = new URL(window.location.href);
    const back = url.searchParams.get('unlock');
    if (back !== null) {
      url.searchParams.delete('unlock');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    if (back === 'cancelled') {
      write(PENDING, null);
      useStore.getState().toast('Checkout cancelled. Nothing was charged.', 'neutral');
    } else if (back) await claimSession(back, true);
    else if (!license && read(PENDING)) await claimSession(read(PENDING)!, false);
  })();
  // back to this page without it loading again: the browser kept it (the Back button on Stripe's
  // page), or checkout opened over the installed app, which stayed open underneath
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) returned();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') returned();
  });
  // another tab of the game bought it, or restored it (checkout's return can land in a tab of its own)
  window.addEventListener('storage', (e) => {
    if (e.key !== LICENSE || !e.newValue || license) return;
    void adopt(e.newValue).then((ok) => {
      const { sheet } = useUnlock.getState();
      if (ok && (sheet === 'offer' || sheet === 'pending')) useUnlock.setState({ sheet: 'done', busy: false, error: null });
    });
  });
}

/** Set as the page leaves for Stripe's checkout: if it's ever shown again, it came back. */
let leftForCheckout = false;
let lastReturnClaim = 0;

function returned(): void {
  if (leftForCheckout) {
    leftForCheckout = false;
    // (the offer was left at "Opening checkout…")
    if (useUnlock.getState().busy) useUnlock.setState({ busy: false });
  }
  const sid = read(PENDING);
  if (license || !sid || Date.now() - lastReturnClaim < 15_000) return;
  lastReturnClaim = Date.now();
  void ready.then(() => (license ? undefined : claimSession(sid, false)));
}

/** Now and then, while online: the server says whether the purchase still stands (refunded: locked again). */
async function recheck(): Promise<void> {
  if (!license || !navigator.onLine || Date.now() - Number(read(CHECKED) ?? 0) < RECHECK_MS) return;
  write(CHECKED, String(Date.now()));
  try {
    const r = await api('claim', { sid: license.sid });
    if (r.data.state === 'revoked') {
      license = null;
      write(LICENSE, null);
      useUnlock.setState({ unlocked: false });
    }
  } catch {
    // (offline: the licence stands until the next check)
  }
}

/** The gate on the new-season command: true to go ahead, false when the paywall opened instead. */
export async function mayStartSeason(): Promise<boolean> {
  if (!PAYWALL) return true;
  await ready;
  if (!license && read(PENDING)) await claimSession(read(PENDING)!, false);
  if (license) {
    void recheck();
    return true;
  }
  useUnlock.setState({ sheet: 'offer', error: null });
  return false;
}

/** "Check again" on a payment still clearing: the checkout kept from before, claimed once more. */
export async function checkAgain(): Promise<void> {
  const sid = read(PENDING);
  if (sid) await claimSession(sid, true);
  else useUnlock.setState({ sheet: license ? 'done' : 'offer', error: null });
}

export const openPaywall = (sheet: PaywallSheet = 'offer') => useUnlock.setState({ sheet, error: null });
export const closePaywall = () => useUnlock.setState({ sheet: null, busy: false, error: null });

/** Save the league, then leave for Stripe's checkout page (it comes back to this screen). */
export async function buy(): Promise<void> {
  useUnlock.setState({ busy: true, error: null });
  const fail = (error: string) => void useUnlock.setState({ busy: false, error });
  if (!(await useStore.getState().saveBeforeLeaving())) return fail('Your league couldn’t be saved, so checkout didn’t open. Try again.');
  let r: Awaited<ReturnType<typeof api>>;
  try {
    r = await api('checkout', { back: window.location.hash });
  } catch {
    return fail('Checkout couldn’t open. Check your connection and try again.');
  }
  const url = str(r.data.url);
  if (!r.ok || !url || !url.startsWith('https://')) return fail(str(r.data.error) ?? 'Checkout couldn’t open. Try again shortly.');
  write(PENDING, str(r.data.id));
  leftForCheckout = true;
  window.location.assign(url);
}

/** The licence again from the email paid with and the receipt's number (another device, cleared storage). */
export async function restorePurchase(email: string, receipt: string): Promise<void> {
  useUnlock.setState({ busy: true, error: null });
  let r: Awaited<ReturnType<typeof api>>;
  try {
    r = await api('restore', { email, receipt });
  } catch {
    useUnlock.setState({ busy: false, error: 'Couldn’t reach the server. Check your connection and try again.' });
    return;
  }
  if (r.data.state === 'paid' && (await adopt(r.data.license, true))) {
    useUnlock.setState({ busy: false, sheet: 'done', receipt: { email: str(r.data.email), number: str(r.data.receipt) } });
    return;
  }
  const error =
    r.data.state === 'pending'
      ? 'That payment is still clearing. Try again later.'
      : r.data.state === 'revoked'
        ? 'That payment was refunded.'
        : (str(r.data.error) ?? 'No purchase matches that email and receipt number.');
  useUnlock.setState({ busy: false, error });
}

/** The licence, for a backup file: it unlocks the game wherever the backup is imported. */
export const licenseForBackup = (): string | undefined => (PAYWALL && license ? (read(LICENSE) ?? undefined) : undefined);

/** A backup's licence, kept if it's genuine (a backup made on an unlocked device unlocks this one). */
export async function adoptFromBackup(token: unknown): Promise<void> {
  if (PAYWALL && !license && token) await adopt(token);
}
