// The court as the page shows it: the 3D broadcast picture, or the 2D floor seen from straight
// above. One tap on the camera button switches; the 2D court is always there underneath (it keeps
// the play's time, draws the break's shot chart, and is what a device without WebGL gets).
import { lazy, Suspense, useRef, useState } from 'react';
import { Grid2x2, Video } from 'lucide-react';
import { Court, emptyStage, type CourtProps } from './Court';
import type { Body } from './court3d/puppet';
import './styles/court3d.css';

const Court3D = lazy(() => import('./Court3D'));

export type CourtLook = '3d' | 'flat';

/**
 * How fast the 3D court plays a possession, of the 2D court's pace. Discs can cross the floor in a
 * second; bodies that do look fast-forwarded, and their legs can't keep up (the gait tops out near
 * 39 ft/s, the plan moves a player at up to 85). The bodies keep their own time: see Puppet.update.
 * Measured over a game: a planted foot slides in 4.2% of player-time at 1, 0.8% at a half.
 */
export const COURT3D_PACE = 0.5;

let probed: boolean | null = null;
/** This device draws WebGL 2 (asked once). */
export function canDraw3D(): boolean {
  if (probed === null) {
    try {
      probed = typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2');
    } catch {
      probed = false;
    }
  }
  return probed;
}

export interface CourtViewProps extends CourtProps {
  look: CourtLook;
  onLook: (look: CourtLook) => void;
  /** Each player's build, for his figure. */
  body: (pid: number) => Body;
}

export function CourtView({ look, onLook, body, ...court }: CourtViewProps) {
  const stage = useRef(emptyStage());
  // (this session only: the picture came up, the device couldn't draw it, or drew it too slowly)
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // (a context that went and didn't come back: a new canvas is tried, twice, before 3D is given up)
  const [mount, setMount] = useState(0);
  const tries = useRef(0);
  const [slow, setSlow] = useState(false);
  const can = canDraw3D() && !failed;
  const on = can && look === '3d';
  // the shot chart is the 2D floor's
  const hide = court.idle?.kind === 'chart';
  const shown = on && ready && !hide;
  const speed = shown ? court.speed * COURT3D_PACE : court.speed;
  const flat = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlow(false);
    setReady(false);
    onLook('flat');
  };
  return (
    <div className="court-view" data-look={shown ? '3d' : 'flat'}>
      <Court {...court} speed={speed} stage={stage} mute={shown} />
      {on && (
        <Suspense fallback={null}>
          <Court3D
            key={mount}
            stage={stage}
            kits={court.kits}
            jersey={court.jersey}
            body={body}
            names={court.names}
            hot={court.hot}
            floor={court.floor}
            clutch={court.clutch}
            speed={speed}
            own={court.speed}
            paused={court.paused}
            hide={hide}
            onReady={() => {
              tries.current = 0;
              setReady(true);
            }}
            onLost={() => setReady(false)}
            onFail={() => {
              setReady(false);
              if (tries.current++ < 2) setMount((m) => m + 1);
              else setFailed(true);
            }}
            onSlow={() => setSlow(true)}
          />
        </Suspense>
      )}
      {can && !hide && (
        <button
          className="court-cam"
          onClick={(e) => {
            if (on) flat(e);
            else {
              e.stopPropagation();
              onLook('3d');
            }
          }}
          aria-label={on ? 'Switch to the view from above' : 'Switch to the broadcast camera'}
          title={on ? 'View from above' : 'Broadcast camera'}
        >
          {on ? <Grid2x2 size={16} aria-hidden="true" /> : <Video size={16} aria-hidden="true" />}
        </button>
      )}
      {on && slow && !hide && (
        <div className="court-slow" role="status" onClick={(e) => e.stopPropagation()}>
          <span>3D is running slowly on this device.</span>
          <button className="btn xs" onClick={flat}>
            Use 2D
          </button>
          <button className="btn xs ghost" onClick={() => setSlow(false)}>
            Keep 3D
          </button>
        </div>
      )}
    </div>
  );
}
