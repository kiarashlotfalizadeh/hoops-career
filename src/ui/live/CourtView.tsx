// The court as the page shows it: the 3D broadcast picture, or the 2D floor seen from straight
// above. One tap on the camera button switches, and the chip beside it goes round the 3D picture's
// cameras (cameras.ts); the 2D court is always there underneath (it keeps
// the play's time, draws the break's shot chart, and is what a device without WebGL gets).
// An instant replay holds the play's clock: the court's word that a possession is over waits here
// until the replay of its big play has been shown (a tap on the court skips it), so the game never
// moves on behind it. A tap on a man in the 3D picture tags him for a while, and is only that.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Grid2x2, SwitchCamera, Video } from 'lucide-react';
import { Court, emptyStage, type CourtProps, type GameInfo } from './Court';
import type { Script } from './choreo';
import type { Cast } from './Court3D';
import { CAM_KINDS, CAM_NAME, camKind, type CamKind } from './court3d/cameras';
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
/** A replay never holds the court longer than this (ms), whatever happens to the picture. */
const REPLAY_MOST = 10000;

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
  /** The 3D picture's camera (the broadcast's main one when not said), and the chip that goes round them. */
  cam?: CamKind;
  onCam?: (cam: CamKind) => void;
  /** Each player's build, for his figure. */
  body: (pid: number) => Body;
  /** The game as the court has played it, asked for each frame (the 3D building's boards show it). */
  game?: () => GameInfo;
  /** Instant replays of big plays may hold the court at a dead ball (the live game, not in key plays: never a highlight). */
  replays?: boolean;
  /** The court has played the possession out, before any replay of it: what is felt as it happens (a buzzer-beater's buzz) goes here, not in onDone. */
  onReached?: () => void;
}

export function CourtView({ look, onLook, cam, onCam, body, game, replays, onReached, ...court }: CourtViewProps) {
  const kind = camKind(cam);
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
  // a replay: never at 4x, while the game is stopped, or off the 3D picture
  const cast = useRef<Cast | null>(null);
  const held = useRef<{ sc: Script | null; timer: number } | null>(null);
  const latest = useRef({ onDone: court.onDone, script: court.script });
  latest.current = { onDone: court.onDone, script: court.script };
  const may = shown && !!replays && court.speed < 4 && !court.paused;
  const letGo = useCallback(() => {
    const h = held.current;
    if (!h) return;
    held.current = null;
    clearTimeout(h.timer);
    // (unless the game has moved on without it: a skip)
    if (h.sc === latest.current.script) latest.current.onDone();
  }, []);
  const onDone = () => {
    if (held.current) return;
    onReached?.();
    if (may && cast.current?.replay(letGo)) {
      held.current = {
        sc: court.script,
        timer: window.setTimeout(() => {
          cast.current?.end();
          letGo();
        }, REPLAY_MOST),
      };
      return;
    }
    court.onDone();
  };
  // the game stopped or sped up, or the picture went: the replay goes at once and the court goes on
  useEffect(() => {
    if (!may && held.current) {
      cast.current?.end();
      letGo();
    }
  }, [may, letGo]);
  // a new possession without that one's word (a skip): nothing is owed, and the replay goes
  useEffect(() => {
    const h = held.current;
    if (h && h.sc !== court.script) {
      held.current = null;
      clearTimeout(h.timer);
      cast.current?.end();
    }
  }, [court.script]);
  useEffect(
    () => () => {
      if (held.current) clearTimeout(held.current.timer);
      held.current = null;
    },
    [],
  );
  const flat = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlow(false);
    setReady(false);
    onLook('flat');
  };
  return (
    <div
      className="court-view"
      data-look={shown ? '3d' : 'flat'}
      onClick={(e) => {
        // (a tap during a replay skips it, and is only that; so is a tap on a man, which tags him)
        if (held.current) {
          e.stopPropagation();
          cast.current?.skip();
        } else if (shown && cast.current?.tap(e.clientX, e.clientY)) e.stopPropagation();
      }}
    >
      <Court {...court} speed={speed} stage={stage} mute={shown} onDone={onDone} />
      {on && (
        <Suspense fallback={null}>
          <Court3D
            key={mount}
            stage={stage}
            kits={court.kits}
            jersey={court.jersey}
            body={body}
            names={court.names}
            game={game}
            hot={court.hot}
            final={court.final}
            floor={court.floor}
            clutch={court.clutch}
            cam={kind}
            speed={speed}
            own={court.speed}
            paused={court.paused}
            hide={hide}
            replays={may}
            cast={cast}
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
      {shown && onCam && (
        <button
          className="court-cam court-cam-kind"
          onClick={(e) => {
            e.stopPropagation();
            onCam(CAM_KINDS[(CAM_KINDS.indexOf(kind) + 1) % CAM_KINDS.length]);
          }}
          aria-label={`Camera: ${CAM_NAME[kind]}. Switch to the next camera`}
          title="Next camera"
        >
          <SwitchCamera size={15} aria-hidden="true" />
          <span>{CAM_NAME[kind]}</span>
        </button>
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
        <div className="court-slow m-drop" role="status" onClick={(e) => e.stopPropagation()}>
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
