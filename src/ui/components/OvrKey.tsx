// What an OVR badge's colour means. OvrKey is the one-line key under a list or table of badges (each
// band's colour and where it starts); a tap opens OvrSheet, the whole ladder with its tier names and
// what OVR and POT are. OvrBadge is a badge that opens the same sheet (a player's slab).
import { useState } from 'react';
import { OVR_TIERS, ovrTier, tierLabel } from '../../core/ratings';
import { Sheet } from './ui';
import './ovrKey.css';

/** "89+", "82-88" ... "66 or less": a band's span on the ladder. */
function span(i: number): string {
  const t = OVR_TIERS[i];
  const above = OVR_TIERS[i - 1];
  if (!above) return `${t.min}+`;
  if (!Number.isFinite(t.min)) return `${above.min - 1} or less`;
  return `${t.min}-${above.min - 1}`;
}

/** The ladder in a sheet; `ovr` marks his band. */
export function OvrSheet({ open, onClose, ovr, pot }: { open: boolean; onClose: () => void; ovr?: number; pot?: number }) {
  const mine = ovr === undefined ? undefined : ovrTier(Math.round(ovr));
  return (
    <Sheet open={open} onClose={onClose} title="OVR tiers">
      <p className="ok-lede">
        OVR is how good he is now, on a 40-99 scale: 74 is the median rotation player. POT is where his OVR is projected to peak.
        {ovr !== undefined && pot !== undefined && (
          <>
            {' '}
            This one: <b>{Math.round(ovr)}</b>, {tierLabel(Math.round(ovr))}; potential <b>{pot}</b>.
          </>
        )}
      </p>
      <ul className="ok-ladder" aria-label="OVR tiers, best first">
        {OVR_TIERS.map((t, i) => (
          <li key={t.tone} className={t === mine ? 'on' : undefined} aria-current={t === mine ? 'true' : undefined}>
            <span className="ok-sw" style={{ background: `var(--tier-${t.tone})` }} aria-hidden="true" />
            <span className="ok-span num">{span(i)}</span>
            <span className="ok-names">
              {t.names.map(([min, name], j) => (
                <span key={name}>
                  {j > 0 ? ' · ' : ''}
                  {name}
                  {j === 0 && t.names.length > 1 ? ` (${min}+)` : ''}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** The key: each band's colour with where it starts, one line; a tap opens the ladder. */
export function OvrKey() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ok-key" aria-haspopup="dialog" onClick={() => setOpen(true)} aria-label="OVR tiers: what the badge colours mean">
        <span className="ok-key-k">OVR</span>
        {OVR_TIERS.map((t, i) => (
          <span key={t.tone} className="ok-chip" style={{ background: `var(--tier-${t.tone})` }}>
            {Number.isFinite(t.min) ? `${t.min}${i === 0 ? '+' : ''}` : `<${OVR_TIERS[i - 1].min}`}
          </span>
        ))}
      </button>
      <OvrSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
