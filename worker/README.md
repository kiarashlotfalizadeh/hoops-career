# clipboardgm.com: the web edition and its paywall

The web edition runs on one Cloudflare Worker. `dist/` is served as static files, and `/api/*` runs
`worker/index.ts`. The paywall is on only in `npm run build:web` (`.env.web`). The native apps and
plain builds never show it: app stores require their own billing for digital unlocks.

## How it works

- **Free:** every league's first season, its draft, re-signing and free agency included.
- **Gate:** "Start the next season" (`newSeason` in `src/ui/useFlow.ts`) opens the paywall
  (`src/ui/paywall/Paywall.tsx`) instead. "Not now" keeps the league as it is.
- **Buy:** `POST /api/checkout` opens a Stripe-hosted Checkout Session for the price with lookup key
  `clipboard-gm-full`. It uses Managed Payments, so Stripe is the merchant of record and handles tax,
  receipts and disputes. The league is saved before the page leaves.
- **Back from Stripe:** `/?unlock=cs_…#/route`. The game posts the session id to `/api/claim`. The
  Worker asks Stripe whether it was paid and returns a licence signed with ECDSA P-256. The game
  checks the licence offline with the public key built into it (`src/state/license.ts`).
- **No database.** Stripe is the only record of who paid. The game keeps the id of an unfinished
  checkout and claims it again at the next launch, so a closed tab or a slow bank debit still
  unlocks. A refund or chargeback makes `/api/claim` answer `revoked`. An unlocked game re-checks
  about once a week while online and locks again on `revoked`.
- **Restore:** `/api/restore` takes the email paid with and the receipt (invoice) number, looks
  them up at Stripe, and returns a new licence. Backups carry the licence too.

There's no webhook because nothing happens server-side after a payment. Fulfilment is the
licence, issued on demand after Stripe confirms the payment. Add a webhook
(`checkout.session.completed` plus `checkout.session.async_payment_succeeded`) when the server
starts doing anything on payment, such as sending email or keeping records.

## Local testing (Stripe sandbox)

1. `npm run license:keys` writes a test key pair to `.dev.vars` and `.env.webtest.local`. Both
   files are git-ignored.
2. Add `STRIPE_SECRET_KEY=<sandbox key>` and `SITE_ORIGIN=http://127.0.0.1:8787` to `.dev.vars`.
   The sandbox needs the product and price below, made in test mode.
3. `npm run worker:dev`, then open http://127.0.0.1:8787. Pay with `4242 4242 4242 4242`, any
   future date and any CVC.

## Going live (once)

1. **Stripe, in the Clipboard GM account (live mode):**
   - Settings → Managed Payments: accept the terms. Set **Refund requests** to "Email me for
     approval" and **Include tax in prices** to "Yes". The price is US$14.99 with tax included,
     everywhere.
   - Settings → Public details: set the business name and support email. Checkout shows both.
   - Make the product and price with the Stripe CLI, logged in to that account:
     ```bash
     stripe products create --live --name "Clipboard GM" --description "The full game: every season after your first. One payment, no subscription." --tax-code txcd_10201000
     ```
     ```bash
     stripe prices create --live --product <prod_id> --unit-amount 1499 --currency usd --tax-behavior inclusive --lookup-key clipboard-gm-full
     ```
   - Developers → API keys: create a **restricted key** with write access to Checkout Sessions,
     and read access to Prices, Payment Intents, Charges and Invoices.
2. **Cloudflare:**
   - `npx wrangler login`
   - `npx wrangler secret put STRIPE_SECRET_KEY` and paste the restricted key.
   - `npm run license:keys -- --live` stores the private key as a Worker secret and writes the
     public key to `.env.web`. Commit `.env.web`. Making a new live pair later voids every licence
     already sold.
3. `npm run deploy:web` builds with the paywall and deploys. The first deploy attaches the custom
   domain `clipboardgm.com`.
4. Buy once with a real card, then refund it in the Dashboard. The next claim should answer
   `revoked`.
5. Only then set the GitHub repository variable `SITE_MOVED_TO=https://clipboardgm.com`. The next
   Pages deploy turns the github.io site into a forwarder, and its old offline copy unregisters.
