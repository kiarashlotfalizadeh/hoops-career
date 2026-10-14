// Shared pieces of the Trade screen's negotiation tools: the AI's reasons for its verdict.
import type { TradeNote } from '../../core/league/trades';
import '../office/office.css';

const NOTE_COLOR: Record<TradeNote['tone'], string> = { good: 'var(--good)', bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };

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
