// The unlock server's three calls, apart from the Worker's wiring (index.ts) so tests can hand them a
// stand-in for Stripe. Stripe is the only record of who paid: a licence is issued only after asking it,
// so there is no database, and a payment that never made it back to the game can be claimed later.
import type Stripe from 'stripe';
import { signLicense } from '../src/state/license';

/** Marks the game's own Checkout Sessions (another product on the same account never unlocks it). */
export const APP = 'clipboard-gm';
/** Tags these sessions in the Stripe Dashboard (a label plus eight random letters, as Stripe asks). */
const INTEGRATION = 'clipboard-gm-unlock-qzvkhtrm';

export interface Deps {
  stripe: Pick<Stripe, 'checkout' | 'prices'>;
  /** The licence signing key (a P-256 private JWK). */
  privateKey: JsonWebKey;
  /** The price's lookup key: the same name in the sandbox and live, so no price id to copy between them. */
  priceLookupKey: string;
  /** Stripe as merchant of record (Managed Payments). */
  managedPayments: boolean;
  /** This site, e.g. https://clipboardgm.com: where Stripe sends the buyer back. */
  origin: string;
  now?: () => number;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
/** An in-app screen to come back to ("#/office/free-agents"): nothing that could leave the site. */
const BACK = /^#\/[A-Za-z0-9/_\-?=&.]{0,160}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

const NOT_FOUND = 'No purchase matches that email and receipt number.';

let priceCache: { key: string; id: string } | undefined;

async function priceId(d: Deps): Promise<string> {
  if (priceCache?.key === d.priceLookupKey) return priceCache.id;
  const list = await d.stripe.prices.list({ lookup_keys: [d.priceLookupKey], active: true, limit: 1 });
  const id = list.data[0]?.id;
  if (!id) throw new Error(`No active price with lookup key ${d.priceLookupKey}`);
  priceCache = { key: d.priceLookupKey, id };
  return id;
}

/** Open a Stripe-hosted checkout for the full game. */
export async function createCheckout(d: Deps, back: unknown): Promise<Reply> {
  const hash = typeof back === 'string' && BACK.test(back) ? back : '';
  const price = await priceId(d);
  const session = await d.stripe.checkout.sessions
    .create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      ...(d.managedPayments ? { managed_payments: { enabled: true } } : {}),
      // (the session id rides in the query, before the game's own #route)
      success_url: `${d.origin}/?unlock={CHECKOUT_SESSION_ID}${hash}`,
      cancel_url: `${d.origin}/?unlock=cancelled${hash}`,
      metadata: { app: APP },
      integration_identifier: INTEGRATION,
    })
    .catch((e: unknown) => {
      // (the price may have been replaced under the same lookup key: look it up again next time)
      priceCache = undefined;
      throw e;
    });
  if (!session.url) throw new Error('Checkout Session without a url');
  return { status: 200, body: { id: session.id, url: session.url } };
}

type Verdict = 'paid' | 'pending' | 'open' | 'unpaid' | 'revoked' | 'foreign';

/** Where a session's payment stands, read from the session with its payment intent and charge expanded. */
export function verdict(s: Stripe.Checkout.Session): Verdict {
  if (s.metadata?.app !== APP || s.mode !== 'payment') return 'foreign';
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  // refunded in full, or charged back: the licence is taken back the next time the game checks
  if (charge && (charge.refunded || charge.disputed)) return 'revoked';
  // not finished yet, and still payable for a day (Stripe's checkout page may still be open somewhere)
  if (s.status === 'open') return 'open';
  if (s.status !== 'complete') return 'unpaid';
  if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return 'paid';
  // a delayed method (a bank debit) that failed leaves the intent wanting a new payment method
  if (pi && (pi.status === 'requires_payment_method' || pi.status === 'canceled')) return 'unpaid';
  return 'pending';
}

const EXPAND = ['payment_intent.latest_charge', 'invoice'];

async function licenseFor(d: Deps, s: Stripe.Checkout.Session) {
  return signLicense({ v: 1, sid: s.id, at: (d.now ?? Date.now)() }, d.privateKey);
}

/**
 * The numbers a receipt can show for a session, as printed: the invoice's (Managed Payments numbers
 * one a moment after payment, so the return from checkout may be too early for it) and the charge's.
 */
function receiptNumbers(s: Stripe.Checkout.Session): string[] {
  const inv = s.invoice && typeof s.invoice === 'object' ? s.invoice.number : null;
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const ch = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge.receipt_number : null;
  return [inv, ch].filter((x): x is string => !!x);
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The licence for a paid session (the return from checkout, a payment that came back later, a periodic re-check). */
export async function claim(d: Deps, sid: unknown): Promise<Reply> {
  if (typeof sid !== 'string' || !SESSION_ID.test(sid)) return { status: 400, body: { error: 'That is not a checkout session.' } };
  let s: Stripe.Checkout.Session;
  try {
    s = await d.stripe.checkout.sessions.retrieve(sid, { expand: EXPAND });
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return { status: 404, body: { state: 'unpaid' } };
    throw e;
  }
  const v = verdict(s);
  if (v === 'foreign') return { status: 404, body: { state: 'unpaid' } };
  if (v !== 'paid') return { status: 200, body: { state: v } };
  return { status: 200, body: { state: 'paid', license: await licenseFor(d, s), email: s.customer_details?.email ?? null, receipt: receiptNumbers(s)[0] ?? null } };
}

/** A licence again on another device or after a reset: the email paid with and the receipt's number. */
export async function restore(d: Deps, email: unknown, receipt: unknown): Promise<Reply> {
  const mail = typeof email === 'string' ? email.trim() : '';
  const number = typeof receipt === 'string' ? norm(receipt) : '';
  if (!EMAIL.test(mail) || number.length < 4 || number.length > 40) return { status: 400, body: { error: 'Enter the email you paid with and the receipt number.' } };
  // (Checkout keeps the email as it was typed: try it as given and in lower case)
  const tries = [...new Set([mail, mail.toLowerCase()])];
  for (const e of tries) {
    const list = await d.stripe.checkout.sessions.list({ customer_details: { email: e }, status: 'complete', limit: 20, expand: EXPAND.map((x) => `data.${x}`) });
    const hit = list.data.find((s) => verdict(s) !== 'foreign' && receiptNumbers(s).map(norm).includes(number));
    if (!hit) continue;
    const v = verdict(hit);
    if (v !== 'paid') return { status: 200, body: { state: v } };
    return { status: 200, body: { state: 'paid', license: await licenseFor(d, hit), email: hit.customer_details?.email ?? null, receipt: receiptNumbers(hit)[0] ?? null } };
  }
  return { status: 404, body: { error: NOT_FOUND } };
}
