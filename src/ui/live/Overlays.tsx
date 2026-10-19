// What goes over the court besides the playback controls: the lower stack (the running call of the
// play, a broadcast graphic, the one banner) and, at a period's end, the break
// card (the period's name, Start the next one, the report, skip ahead).
import { useSyncExternalStore, type CSSProperties } from 'react';
import { FastForward, Play } from 'lucide-react';
import { captionAt, type Script } from './choreo';
import type { Beat } from './ticker';
import type { Graphic } from './graphics';
import { LowerThird } from './LowerThird';
import { Banner, type BannerItem } from './Banner';
import { periodLabel } from '../stats';

/**
 * The lower stack over the backcourt, clear of the basket the play goes to: the running call of the
 * play in the offense's colour (or the key plays line between them), the graphic up now in its
 * team's colour (`kit`), and the one banner.
 */
export function CourtLower({
  drawing,
  ffing,
  beat,
  capColor,
  graphic,
  kit,
  banner,
  onDropBanner,
}: {
  /** The possession the court is drawing. */
  drawing: Script | null;
  /** Key plays: on to the next one without drawing this one. */
  ffing: boolean;
  beat: Beat;
  /** The offense's colour, for the call's edge. */
  capColor?: string;
  graphic: Graphic | null;
  kit: string;
  banner?: BannerItem;
  onDropBanner: () => void;
}) {
  return (
    <div className="lv-lower">
      {(drawing || ffing) && (
        // the offense's colour along its edge, as the court's boards show who has the ball
        <div className="lv-cap" aria-hidden="true" style={drawing ? ({ '--cap-c': capColor } as CSSProperties) : undefined}>
          {drawing ? (
            <Caption script={drawing} beat={beat} />
          ) : (
            <span className="lv-cap-t ff">
              <FastForward size={12} /> Key plays: on to the next one
            </span>
          )}
        </div>
      )}
      {graphic && <LowerThird key={graphic.id} g={graphic} kit={kit} />}
      {banner && <Banner key={banner.id} item={banner} onClose={onDropBanner} />}
    </div>
  );
}

/** The court's running call of the possession it's drawing ('Holmgren screens for Mitchell'), from the frame it has reached. */
function Caption({ script, beat }: { script: Script; beat: Beat }) {
  const i = useSyncExternalStore(beat.subscribe, beat.get);
  return <span className="lv-cap-t">{captionAt(script, i)}</span>;
}

/**
 * A period's end over the court: its name big ("Halftime", "End of Q3", "Overtime" with the tied
 * score), Start the next period, the period report and skip ahead.
 */
export function BreakCard({ q, tied, onStart, onReport, onSkip }: { q: number; tied: number; onStart: () => void; onReport: () => void; onSkip: () => void }) {
  return (
    <div className="lv-break fade-in">
      <div className="lv-break-t">{q >= 4 ? (q === 4 ? 'Overtime' : `Overtime ${q - 3}`) : q === 2 ? 'Halftime' : `End of ${periodLabel(q)}`}</div>
      {q >= 4 && <div className="lv-break-s">Tied at {tied}.</div>}
      <div className="lv-break-go">
        <button className="btn primary" onClick={onStart}>
          <Play size={16} fill="currentColor" aria-hidden="true" /> Start {periodLabel(q + 1)}
        </button>
        <button className="btn lv-break-rep" onClick={onReport} aria-haspopup="dialog">
          Report
        </button>
        <button className="btn lv-break-rep lv-break-skip" onClick={onSkip} aria-label="Skip ahead" aria-haspopup="dialog">
          <FastForward size={17} />
        </button>
      </div>
    </div>
  );
}
