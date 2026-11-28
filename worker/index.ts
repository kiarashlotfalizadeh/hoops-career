// clipboardgm.com: one Cloudflare Worker. The game's files are static assets served straight from
// dist/ (wrangler.jsonc); only /api/* reaches this code, which talks to Stripe (api.ts).
import Stripe from 'stripe';
import { claim, createCheckout, restore, type Deps, type Reply } from './api';

export interface Env {
  ASSETS: Fetcher;
  /** A restricted key: Checkout Sessions write; Prices, Payment Intents, Charges and Invoices read. */
  STRIPE_SECRET_KEY: string;
  /** The licence signing key, a P-256 private JWK as JSON (npm run license:keys). */
  LICENSE_PRIVATE_KEY: string;
  STRIPE_PRICE_LOOKUP_KEY?: string;
  /** "0" sells without Stripe as merchant of record. */
  MANAGED_PAYMENTS?: string;
  /**
   * The site's own address, where Stripe sends the buyer back (https://clipboardgm.com; .dev.vars
   * sets the local one). Set, not read from the request: wrangler dev reports the route's host, and a
   * forged Host header must not choose where a payment returns to.
   */
  SITE_ORIGIN?: string;
  /** At most a few tries a minute from one address: a receipt number can't be guessed by brute force. */
  RESTORE_LIMITER?: RateLimit;
}

const json = (r: Reply) => new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const routes: Record<string, (d: Deps, body: Record<string, unknown>) => Promise<Reply>> = {
  '/api/checkout': (d, b) => createCheckout(d, b.back),
  '/api/claim': (d, b) => claim(d, b.sid),
  '/api/restore': (d, b) => restore(d, b.email, b.receipt),
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = routes[url.pathname];
    if (!route) return url.pathname.startsWith('/api/') ? json({ status: 404, body: { error: 'Not found.' } }) : env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ status: 405, body: { error: 'POST only.' } });
    // only the game's own pages call it
    const site = env.SITE_ORIGIN || url.origin;
    const from = request.headers.get('origin');
    if (from && from !== site && from !== url.origin) return json({ status: 403, body: { error: 'Wrong origin.' } });
    if (url.pathname !== '/api/checkout' && env.RESTORE_LIMITER) {
      const { success } = await env.RESTORE_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
      if (!success) return json({ status: 429, body: { error: 'Too many tries. Wait a minute, then try again.' } });
    }
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > 4096) throw new Error('too long');
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!body || typeof body !== 'object') throw new Error('not an object');
    } catch {
      return json({ status: 400, body: { error: 'Bad request.' } });
    }
    try {
      // (inside the try: a missing secret is logged and answered like any other failure)
      const deps: Deps = {
        stripe: new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 10_000, appInfo: { name: 'clipboard-gm', url: 'https://clipboardgm.com' } }),
        privateKey: JSON.parse(env.LICENSE_PRIVATE_KEY) as JsonWebKey,
        priceLookupKey: env.STRIPE_PRICE_LOOKUP_KEY || 'clipboard-gm-full',
        managedPayments: env.MANAGED_PAYMENTS !== '0',
        origin: site,
      };
      return json(await route(deps, body));
    } catch (e) {
      // (Stripe's message and request id go to the Worker's logs, never to the page)
      console.error(url.pathname, e instanceof Error ? e.message : e, (e as { requestId?: string }).requestId ?? '');
      return json({ status: 502, body: { error: 'Payments are unreachable for a moment. Try again shortly.' } });
    }
  },
} satisfies ExportedHandler<Env>;
