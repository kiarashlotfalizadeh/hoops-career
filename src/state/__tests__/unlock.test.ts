// The web edition's paywall: the licence the server signs is the only thing that opens the game, and
// the server signs one only for a paid checkout of this game, found again by email and receipt number.
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { readLicense, signLicense, toB64u } from '../license';
import { claim, restore, type Deps } from '../../../worker/api';

async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicKey: toB64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  };
}

/** A completed checkout of the game: paid by card unless told otherwise. */
function session(id: string, o: { app?: string; paid?: boolean; refunded?: boolean; email?: string; invoice?: string; status?: string } = {}): Stripe.Checkout.Session {
  return {
    id: `cs_test_${id}`,
    mode: 'payment',
    status: o.status ?? 'complete',
    payment_status: o.paid === false ? 'unpaid' : 'paid',
    metadata: { app: o.app ?? 'clipboard-gm' },
    customer_details: { email: o.email ?? 'fan@example.com' },
    invoice: { number: o.invoice ?? 'AB12CD34-0001' },
    payment_intent: { status: o.paid === false ? 'processing' : 'succeeded', latest_charge: { refunded: !!o.refunded, disputed: false, receipt_number: null } },
  } as unknown as Stripe.Checkout.Session;
}

function deps(sessions: Stripe.Checkout.Session[], privateKey: JsonWebKey): Deps {
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async (id: string) => {
          const s = sessions.find((x) => x.id === id);
          if (!s) throw Object.assign(new Error('No such checkout.session'), { statusCode: 404 });
          return s;
        },
        // (as Stripe does: by email, and only the status asked for)
        list: async (p: { customer_details: { email: string }; status?: string }) => ({
          data: sessions.filter((s) => s.customer_details?.email === p.customer_details.email && (!p.status || s.status === p.status)),
        }),
      },
    },
  };
  return { stripe: stripe as unknown as Deps['stripe'], privateKey, priceLookupKey: 'clipboard-gm-full', managedPayments: true, origin: 'https://clipboardgm.com', now: () => 1 };
}

describe('unlock', () => {
  it('opens the game only with a licence signed by its own key', async () => {
    const mine = await keys();
    const other = await keys();
    const token = await signLicense({ v: 1, sid: 'cs_test_abc', at: 1 }, mine.privateKey);
    expect(await readLicense(token, mine.publicKey)).toEqual({ v: 1, sid: 'cs_test_abc', at: 1 });
    // another key's licence (a sandbox's on the live site), or one edited by hand, opens nothing
    expect(await readLicense(await signLicense({ v: 1, sid: 'cs_test_abc', at: 1 }, other.privateKey), mine.publicKey)).toBeNull();
    const [, sig] = token.split('.');
    const forged = `${toB64u(new TextEncoder().encode(JSON.stringify({ v: 1, sid: 'cs_test_free', at: 1 })))}.${sig}`;
    expect(await readLicense(forged, mine.publicKey)).toBeNull();
    expect(await readLicense('not a licence', mine.publicKey)).toBeNull();
  });

  it('signs a licence only for a paid checkout of this game, and finds it again by email and receipt', async () => {
    const { privateKey, publicKey } = await keys();
    const d = deps(
      [
        session('paidpaidpaid'),
        session('slowbankdebit', { paid: false, email: 'slow@example.com', invoice: 'AB12CD34-0002' }),
        session('refundedrefund', { refunded: true, email: 'back@example.com', invoice: 'AB12CD34-0003' }),
        session('otherproduct1', { app: 'another-shop', email: 'shop@example.com', invoice: 'AB12CD34-0004' }),
        session('stillonstripe', { paid: false, status: 'open', email: 'open@example.com', invoice: 'AB12CD34-0005' }),
        session('leftforadayx', { paid: false, status: 'expired', email: 'gone@example.com', invoice: 'AB12CD34-0006' }),
      ],
      privateKey,
    );
    const paid = await claim(d, 'cs_test_paidpaidpaid');
    expect(paid.body).toMatchObject({ state: 'paid', email: 'fan@example.com', receipt: 'AB12CD34-0001' });
    expect(await readLicense(paid.body.license, publicKey)).toMatchObject({ sid: 'cs_test_paidpaidpaid' });
    // a bank debit still clearing waits; a refund takes it back; another product never unlocks it
    expect((await claim(d, 'cs_test_slowbankdebit')).body).toEqual({ state: 'pending' });
    expect((await claim(d, 'cs_test_refundedrefund')).body).toEqual({ state: 'revoked' });
    // a checkout page still open can still be paid (kept, to claim later); one left to expire can't
    expect((await claim(d, 'cs_test_stillonstripe')).body).toEqual({ state: 'open' });
    expect((await claim(d, 'cs_test_leftforadayx')).body).toEqual({ state: 'unpaid' });
    expect(await claim(d, 'cs_test_otherproduct1')).toMatchObject({ status: 404 });
    expect(await claim(d, 'cs_test_nosuchsession')).toMatchObject({ status: 404 });
    expect(await claim(d, 'https://evil.example')).toMatchObject({ status: 400 });

    // restore: the receipt number as printed, in any case and spacing; a wrong one finds nothing
    const back = await restore(d, 'fan@example.com', ' ab12cd34-0001 ');
    expect(await readLicense(back.body.license, publicKey)).toMatchObject({ sid: 'cs_test_paidpaidpaid' });
    expect(await restore(d, 'fan@example.com', 'AB12CD34-0009')).toMatchObject({ status: 404 });
    expect(await restore(d, 'shop@example.com', 'AB12CD34-0004')).toMatchObject({ status: 404 });
    expect((await restore(d, 'back@example.com', 'AB12CD34-0003')).body).toEqual({ state: 'revoked' });
    // a checkout never finished has no purchase to restore
    expect(await restore(d, 'open@example.com', 'AB12CD34-0005')).toMatchObject({ status: 404 });
  });
});
