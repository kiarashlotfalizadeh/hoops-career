// What goes over the court besides the playback controls: the lower stack (the running call of the
// play, a broadcast graphic, the one banner).
import { useSyncExternalStore, type CSSProperties } from 'react';
import { FastForward } from 'lucide-react';
import { captionAt, type Script } from './choreo';
import type { Beat } from './ticker';
import type { Graphic } from './graphics';
import { LowerThird } from './LowerThird';
import { Banner, type BannerItem } from './Banner';

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
