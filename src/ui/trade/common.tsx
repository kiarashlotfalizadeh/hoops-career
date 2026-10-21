// Shared pieces of the Trade screen's negotiation tools: a player's value tier and availability,
// and the AI's reasons for its verdict.
import type { TradeNote } from '../../core/league/trades';
import type { Availability, ValueTier } from '../../core/league/tradeFinder';
import '../office/office.css';

const NOTE_COLOR: Record<TradeNote['tone'], string> = { good: 'var(--good)', bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };

/**
 * "Starter value · On the block": where a player's neutral trade value ranks league-wide, and
 * whether his team looks ready to move him (or builds around him). A line of its own, or `inline`
 * at the end of a row's details. Plain text: trade value is its own scale, so it doesn't borrow the
 * OVR badge's colours (only a contract worth less than nothing reads in the bad colour).
 */
export function TierLine({ tier, avail, inline = false }: { tier: ValueTier; avail?: Availability; inline?: boolean }) {
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag className={inline ? 'fo-tier inline' : 'fo-tier'}>
      <span className={`fo-tier-v ${tier === 'Negative' ? 'bad' : ''}`}>{tier} value</span>
      {avail === 'block' && <span className="good bold"> · On the block</span>}
      {avail === 'franchise' && <span className="dim2"> · Cornerstone</span>}
    </Tag>
  );
}

/** Whether his team looks ready to move him, or builds around him, as a flag after his name (nothing for anyone else). */
export function AvailFlag({ avail }: { avail: Availability }) {
  if (avail === 'block') return <span className="fo-flag good">On the block</span>;
  if (avail === 'franchise') return <span className="fo-flag">Cornerstone</span>;
  return null;
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
