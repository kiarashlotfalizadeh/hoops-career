// The web edition's paywall (state/unlock.ts), mounted once in the shell. It opens when the first
// season's summer is over and "Start the next season" is tapped: by then the player has drafted,
// re-signed and signed a team of his own and hasn't seen it play, so the offer leads with that summer.
// "Not now" always works and the league stays as it is: nothing is taken away, only the next season waits.
import { useState, type FormEvent } from 'react';
import { Check, Lock } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { useStore } from '../../state/store';
import { buy, checkAgain, closePaywall, openPaywall, PAYWALL, PRICE, restorePurchase, useUnlock } from '../../state/unlock';
import { Sheet, Spinner } from '../components/ui';
import { useFlowRunner } from '../useFlow';
import './paywall.css';

/** The user's own moves this summer, newest kind first: the draft, then signings, then re-signings. */
function summerMoves(league: League): string[] {
  const order = { draft: 0, sign: 1, resign: 2 } as const;
  return (league.transactions ?? [])
    .filter((t): t is typeof t & { kind: keyof typeof order } => t.season === league.season && t.tids[0] === league.userTid && t.kind in order && !!t.name)
    .sort((a, b) => order[a.kind] - order[b.kind] || a.id - b.id)
    .slice(0, 4)
    .map((t) => (t.kind === 'draft' ? `Drafted ${t.name}${t.note ? `, ${t.note}` : ''}` : t.kind === 'sign' ? `Signed ${t.name}` : `Re-signed ${t.name}`));
}

const VALUE = ['Every season after this one', 'Every league on this device', 'One payment. No subscription, no ads.'];

export function PaywallHost() {
  const { sheet, busy, error, receipt } = useUnlock();
  const league = useStore((s) => s.league);
  const run = useFlowRunner();
  if (!PAYWALL) return null;
  // the summer is over and the next season is what's waiting
  const summer = !!league && league.phase === 'freeAgency';
  const next = league ? seasonLabel(league.season + 1) : '';
  const close = () => {
    if (!busy) closePaywall();
  };
  const title =
    sheet === 'restore'
      ? 'Restore your purchase'
      : sheet === 'pending'
        ? 'Confirming your payment'
        : sheet === 'done'
          ? 'Every season is yours'
          : summer && league
            ? `Keep building the ${league.teams[league.userTid].name}`
            : 'The full game';
  return (
    <Sheet open={!!sheet} onClose={close} title={title}>
      {sheet === 'offer' && <Offer league={league} summer={summer} busy={busy} error={error} />}
      {sheet === 'restore' && <Restore busy={busy} error={error} />}
      {sheet === 'pending' && (
        <div className="col pw" aria-live="polite">
          {busy ? (
            <p className="pw-lead row" style={{ gap: 10 }}>
              <Spinner /> Checking with Stripe…
            </p>
          ) : (
            <>
              <p className="pw-lead">Some payment methods take a few days to clear. The game unlocks when yours does.</p>
              {error && <p className="small bad pw-err">{error}</p>}
              <button type="button" className="btn primary big block" onClick={() => void checkAgain()}>
                Check again
              </button>
              <button type="button" className="btn block" onClick={close}>
                Close
              </button>
            </>
          )}
        </div>
      )}
      {sheet === 'done' && (
        <div className="col pw" aria-live="polite">
          <p className="pw-lead">Thanks for buying Clipboard GM.</p>
          {/* (the receipt's number may not exist yet on the way back from checkout: the email has it) */}
          <div className="card pw-receipt small">
            {receipt?.email && <div>Stripe sent the receipt to {receipt.email}.</div>}
            <div className="dim2">{receipt?.number ? `Receipt ${receipt.number} restores the game on another device.` : 'Its number restores the game on another device.'}</div>
          </div>
          {summer ? (
            <button
              type="button"
              className="btn primary big block"
              onClick={() => {
                closePaywall();
                void run({ id: 'new', label: `Start ${next} season`, cmd: 'newSeason' });
              }}
            >
              Start {next} season
            </button>
          ) : (
            <button type="button" className="btn primary big block" onClick={close}>
              Back to the game
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Offer({ league, summer, busy, error }: { league: League | null; summer: boolean; busy: boolean; error: string | null }) {
  const moves = summer && league ? summerMoves(league) : [];
  return (
    <div className="col pw">
      <p className="pw-lead">
        {summer ? 'Your first season was free. The next one comes with the full game.' : 'Every league’s first season is free. The full game plays on from there.'}
      </p>
      {moves.length > 0 && (
        <div className="card pw-summer">
          <div className="over">Your summer, not yet played</div>
          <ul>
            {moves.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className="pw-value">
        {VALUE.map((v) => (
          <li key={v}>
            <Check size={16} aria-hidden="true" /> {v}
          </li>
        ))}
      </ul>
      <div className="pw-price">
        <span className="pw-fig num">{PRICE}</span>
        <span className="over">once, plus tax. Checkout shows it in your currency.</span>
      </div>
      {error && (
        <p className="small bad pw-err" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn primary big block" disabled={busy} onClick={() => void buy()}>
        {busy ? <Spinner /> : <Lock size={17} aria-hidden="true" />} {busy ? 'Opening checkout…' : `Unlock for ${PRICE}`}
      </button>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn grow" disabled={busy} onClick={closePaywall}>
          Not now
        </button>
        <button type="button" className="btn grow" disabled={busy} onClick={() => openPaywall('restore')}>
          Restore purchase
        </button>
      </div>
      <p className="tiny dim pw-foot">Secure checkout by Stripe, the seller. Your league stays saved either way.</p>
    </div>
  );
}

function Restore({ busy, error }: { busy: boolean; error: string | null }) {
  const [email, setEmail] = useState('');
  const [receipt, setReceipt] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void restorePurchase(email, receipt);
  };
  return (
    <form className="col pw" onSubmit={submit}>
      <p className="pw-lead">Use the email you paid with and the number on Stripe’s receipt.</p>
      <label className="pw-field">
        <span className="over">Email</span>
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="pw-field">
        <span className="over">Receipt number</span>
        <input className="input" autoCapitalize="characters" autoComplete="off" spellCheck={false} required value={receipt} onChange={(e) => setReceipt(e.target.value)} />
      </label>
      {error && (
        <p className="small bad pw-err" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn primary big block" disabled={busy}>
        {busy ? <Spinner /> : null} {busy ? 'Looking it up…' : 'Restore'}
      </button>
      <button type="button" className="btn block" disabled={busy} onClick={() => openPaywall('offer')}>
        Back
      </button>
    </form>
  );
}
