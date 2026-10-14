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
    <div className="tiny ellipsis" style={{ marginTop: 2 }}>
      <span style={{ color: TIER_COLOR[tier], fontWeight: 700 }}>
        <span className="fo-dot" style={{ background: TIER_COLOR[tier] }} />
        {tier} value
      </span>
      {avail === 'block' && (
        <span className="good" style={{ fontWeight: 700 }}>
          {' '}
          · On the block
        </span>
      )}
      {avail === 'franchise' && <span className="dim2"> · Cornerstone</span>}
    </div>
  );
}

/** The AI's reasons, a colored dot for each: a warning for you reads in the warning color. */
export function TradeNotes({ notes }: { notes: TradeNote[] }) {
  if (!notes.length) return null;
  return (
    <div className="col" style={{ gap: 3 }}>
      {notes.map((n) => (
        <div key={n.text} className={`row top tiny ${n.tone === 'warn' ? 'warn' : 'dim2'}`} style={{ gap: 6, fontWeight: n.tone === 'warn' ? 700 : undefined }}>
          <span className="fo-dot" style={{ background: NOTE_COLOR[n.tone], margin: '4px 0 0', flex: 'none' }} />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  );
}
