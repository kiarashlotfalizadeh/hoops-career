import { AlertTriangle, Lightbulb, X } from 'lucide-react';

/** Something to say over the court for a moment: an injury, a foul-out, the other coach's change, or the assistant's word. */
export interface BannerItem {
  id: string;
  tone: 'bad' | 'warn' | 'info';
  /** "Injury", "Fouled out", "Adjustment", "Staff". */
  kicker: string;
  title: string;
  line?: string;
}

/**
 * The one banner over the court's bottom edge, styled like the assistant's rows elsewhere: a tone on
 * its edge, the headline and one line. Its fix, when it has one, is the staff's call on the Bench.
 */
export function Banner({ item, onClose }: { item: BannerItem; onClose: () => void }) {
  const Icon = item.tone === 'info' ? Lightbulb : AlertTriangle;
  return (
    <div className={`lv-banner tone-${item.tone}`} role="status">
      <Icon size={16} className="lv-banner-ic" aria-hidden="true" />
      <div className="grow lv-banner-body">
        <div className="lv-banner-t">
          <span className="lv-banner-k">{item.kicker}</span> {item.title}
        </div>
        {item.line && <div className="lv-banner-l">{item.line}</div>}
      </div>
      <button className="lv-banner-x" onClick={onClose} aria-label="Hide">
        <X size={16} />
      </button>
    </div>
  );
}
