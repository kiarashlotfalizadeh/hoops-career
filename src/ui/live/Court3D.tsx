// The 3D court's canvas, over the 2D court's (which keeps the play's time and is not painted while
// this is up: see CourtView.tsx). It loads the scene on demand, draws the moment the 2D court's clock
// is at, and says so when it can't: no WebGL (onFail), or frames too slow to watch (onSlow). A phone
// takes the drawing context away from an app in the background: the 2D court shows meanwhile (onLost)
// and the scene is built again when the context is back.
import { useEffect, useRef, type MutableRefObject } from 'react';
import { FLOOR_L, paintFloor, readPaints, type CourtFloor, type Stage } from './Court';
import type { MatchKit } from '../teamColors';
import type { Body } from './court3d/puppet';
import { loadModels, type Models } from './court3d/models';
import type { CourtScene } from './court3d/scene';

export interface Court3DProps {
  stage: MutableRefObject<Stage>;
  kits: [MatchKit, MatchKit];
  jersey: (pid: number) => string;
  body: (pid: number) => Body;
  names?: (pid: number) => string;
  hot?: ReadonlySet<number>;
  floor?: CourtFloor;
  clutch?: boolean;
  /** The play's speed (the 2D court's clock runs on it), and the bodies' (see COURT3D_PACE). */
  speed: number;
  own: number;
  paused: boolean;
  /** Mounted but out of sight (the shot chart is on the 2D floor): nothing is drawn. */
  hide: boolean;
  /** The first frame is on the screen. */
  onReady: () => void;
  /** The picture can't be drawn here (no WebGL, or its context went and didn't come back). */
  onFail: () => void;
  /** The drawing context was taken away: nothing is drawn until it's back. */
  onLost: () => void;
  onSlow: () => void;
}

/** Slower than this a frame (ms), on average, is not worth watching. */
const SLOW_MS = 38;
/** Slower than this (under 40 a second) the shadows and the floor's mirror go: a phone held at 30 is spared them. */
const LITE_MS = 25;
/** No more than 60 pictures a second, whatever the screen's rate (battery, heat): the gap between two, ms. */
const FRAME_MS = 1000 / 60 - 2;
/** A lost context that isn't back after this long in view (ms) is not coming back. */
const GONE_MS = 3000;

export default function Court3D(props: Court3DProps) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const canvas = glRef.current!;
    const paints = readPaints(canvas);
    const warn = getComputedStyle(canvas).getPropertyValue('--warn-night').trim() || '#ffc65c';
    const calmQ = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let scene: CourtScene | null = null;
    let Scene: typeof CourtScene | null = null;
    let models: Models | null = null;
    let gone = -1;
    let raf = 0;
    let dead = false;
    let last = 0;
    let floorKey = '';
    let fontsIn = 0;
    document.fonts?.ready.then(() => void (fontsIn = 1));
    const floorCv = document.createElement('canvas');
    // how sharp it's drawn: full, or less on a device that can't keep up
    let quality = 1;
    let plain = false;
    let sized = '';
    let frames = 0;
    let spent = 0;
    let told = false;
    let shown = false;
    let still = 0;
    const build = () => {
      scene?.dispose();
      scene = new Scene!(canvas, paints.ball, paints.ballSeam, models!);
      scene.lite(plain);
      sized = floorKey = '';
      shown = false;
    };
    // (the default is to never give it back: asked for here)
    const lost = (e: Event) => {
      e.preventDefault();
      gone = 0;
      live.current.onLost();
    };
    const back = () => {
      if (dead || !Scene) return;
      gone = -1;
      try {
        build();
      } catch {
        live.current.onFail();
      }
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', back);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last && now - last < FRAME_MS) return;
      const p = live.current;
      const real = last ? Math.min(100, now - last) : 0;
      last = now;
      if (gone >= 0) {
        // (frames only come while the page is in view, so this is time spent looking at it)
        gone += real;
        if (gone > GONE_MS) {
          gone = -1;
          cancelAnimationFrame(raf);
          p.onFail();
        }
        return;
      }
      if (!scene || p.hide) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1) * quality;
      const size = `${w}x${h}@${ratio}`;
      let dirty = false;
      if (size !== sized) {
        sized = size;
        scene.size(w, h, ratio);
        dirty = true;
      }
      const fl = p.floor;
      const key = `${fl ? JSON.stringify(fl) : ''}|${fontsIn}`;
      if (key !== floorKey) {
        floorKey = key;
        // (the whole floor, sideways, as the 2D court paints it: its mark faces the camera)
        const k = Math.min(16, Math.max(10, (Math.max(w, 700) * 2) / FLOOR_L));
        paintFloor(floorCv, { wide: true, k, w: 0, h: 0, top: 0, ox: 0, oy: 0 }, 1, fl, paints);
        scene.setFloor(floorCv);
        dirty = true;
      }
      const dt = p.paused ? 0 : real * p.speed;
      // paused, nothing moves: a few frames for the camera to settle, then none (battery)
      still = dt > 0 || dirty ? 0 : still + 1;
      if (still > 40) return;
      const labels = scene.frame(
        p.stage.current,
        { kits: p.kits, jersey: p.jersey, body: p.body, names: p.names, hot: p.hot, board: fl?.kind === 'home' ? fl.paint : paints.ink, warn },
        dt,
        real,
        !!calmQ?.matches,
        p.paused ? 0 : real * p.own,
      );
      place(tagRef.current, labels.tag, 1);
      place(flashRef.current, labels.flash, labels.flash?.alpha ?? 0);
      if (flashRef.current && labels.flash) flashRef.current.dataset.kind = labels.flash.kind;
      if (!shown) {
        shown = true;
        p.onReady();
      }
      // too slow to watch: first drawn less sharp, then the page is told (it offers the 2D court)
      if (dt > 0 && real > 0) {
        frames++;
        spent += real;
        if (frames >= 90) {
          const avg = spent / frames;
          frames = spent = 0;
          if (!plain) {
            // (first without the shadows and the floor's mirror, then less sharp)
            if (avg > LITE_MS) {
              plain = true;
              scene.lite(true);
            }
          } else if (avg > SLOW_MS) {
            if (quality === 1 && (window.devicePixelRatio || 1) > 1) quality = 0.5;
            else if (!told) {
              told = true;
              p.onSlow();
            }
          }
        }
      }
    };

    // (the code and the models it draws, the players, the baskets, the benches, are asked for together: neither waits for the other)
    Promise.all([import('./court3d/scene'), loadModels()])
      .then(([{ CourtScene }, got]) => {
        if (dead) return;
        models = got;
        Scene = CourtScene;
        build();
        raf = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!dead) live.current.onFail();
      });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', back);
      scene?.dispose();
    };
  }, []);

  return (
    <div className="c3d" hidden={props.hide} aria-hidden="true">
      <canvas ref={glRef} className="c3d-gl" />
      <span ref={tagRef} className="c3d-pill c3d-tag" />
      <span ref={flashRef} className="c3d-pill c3d-flash" />
      {props.clutch && <div className="c3d-lights" />}
    </div>
  );
}

/** A label at its point of the picture (or out of sight). */
function place(el: HTMLElement | null, at: { x: number; y: number; text: string } | null, alpha: number) {
  if (!el) return;
  if (!at || !at.text) {
    el.style.opacity = '0';
    return;
  }
  if (el.textContent !== at.text) el.textContent = at.text;
  el.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, 0)`;
}
