// Shared pieces of the Trade screen's negotiation tools: a player's value tier and availability,
// and the AI's reasons for its verdict.
import type { Availability, TradeNote, ValueTier } from '../../core/league/trades';
import '../office/office.css';

/** The theme's tier palette, best to worst; a contract worth less than nothing in the bad color. */
export const TIER_COLOR: Record<ValueTier, string> = {
  Franchise: 'var(--tier-elite)',
  'All-Star': 'var(--tier-star)',
  Starter: 'var(--tier-good)',
  Rotation: 'var(--tier-avg)',
  Depth: 'var(--tier-low)',
  Negative: 'var(--bad)',
};

const NOTE_COLOR: Record<TradeNote['tone'], string> = { good: 'var(--good)', bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };

/** "Starter value · On the block": where a player's neutral trade value ranks league-wide, and whether his team looks ready to move him (or builds around him). */
export function TierLine({ tier, avail }: { tier: ValueTier; avail: Availability }) {
  return (
    <div className="fo-tier" style={{ ['--tier' as string]: TIER_COLOR[tier] }}>
      <span className="fo-tier-v">{tier} value</span>
      {avail === 'block' && <span className="good bold"> · On the block</span>}
      {avail === 'franchise' && <span className="dim2"> · Cornerstone</span>}
    </div>
  );
}

/** The AI's reasons, a colored dot for each: a warning for you reads in the warning color. */
export function TradeNotes({ notes }: { notes: TradeNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="fo-notes">
      {notes.map((n) => (
        <li key={n.text} className={n.tone === 'warn' ? 'warn' : ''} style={{ ['--note' as string]: NOTE_COLOR[n.tone] }}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}
