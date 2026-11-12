// The 3D court's canvas, over the 2D court's (which keeps the play's time and is not painted while
// this is up: see CourtView.tsx). It loads the scene on demand, draws the moment the 2D court's clock
// is at, and says so when it can't: no WebGL (onFail), or frames too slow to watch (onSlow). A phone
// takes the drawing context away from an app in the background: the 2D court shows meanwhile (onLost)
// and the scene is built again when the context is back. Over the picture, the broadcast's graphics:
// the handler's tag, the play's word, the lower third on a cut-in or a replay, the replay's bug and wipe
// (written each frame from what the scene says, no re-render).
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Rewind } from 'lucide-react';
import { FLOOR_L, paintFloor, readPaints, type CourtFloor, type GameInfo, type Stage } from './Court';
import type { MatchKit } from '../teamColors';
import type { Body } from './court3d/puppet';
import { loadModels, type Models } from './court3d/models';
import type { CourtScene, Labels, Lite } from './court3d/scene';

/** Where CourtView reaches the broadcast: an instant replay at a possession's end, and its end. */
export interface Cast {
  /** The court has finished a possession: true if a replay of it starts (`done` is called once the court may go on). */
  replay(done: () => void): boolean;
  /** A tap on the court: the replay goes, through its wipe. */
  skip(): void;
  /** The replay goes at once (the game stopped or sped up, the picture went), and `done` with it. */
  end(): void;
}

export interface Court3DProps {
  stage: MutableRefObject<Stage>;
  kits: [MatchKit, MatchKit];
  jersey: (pid: number) => string;
  body: (pid: number) => Body;
  names?: (pid: number) => string;
  /** The game as the court has played it (asked for each frame). */
  game?: () => GameInfo;
  hot?: ReadonlySet<number>;
  /** The game is over: the side that won it. */
  final?: 0 | 1;
  floor?: CourtFloor;
  clutch?: boolean;
  /** The play's speed (the 2D court's clock runs on it), and the bodies' (see COURT3D_PACE). */
  speed: number;
  own: number;
  paused: boolean;
  /** Mounted but out of sight (the shot chart is on the 2D floor): nothing is drawn. */
  hide: boolean;
  /** Instant replays may hold the court at a possession's end (CourtView says when). */
  replays?: boolean;
  cast?: MutableRefObject<Cast | null>;
  /** The first frame is on the screen. */
  onReady: () => void;
  /** The picture can't be drawn here (no WebGL, or its context went and didn't come back). */
  onFail: () => void;
  /** The drawing context was taken away: nothing is drawn until it's back. */
  onLost: () => void;
  onSlow: () => void;
}

/** Slower than this a frame (ms), on average, with everything already given up, is not worth watching: the page offers the 2D court. */
const SLOW_MS = 31;
/** Slower than this (under 45 a second) the picture gives something up, a step at a time (see STEPS). */
const LITE_MS = 22;
/** Frames are timed over stretches this long. */
const STRETCH = 60;
/**
 * What a device that can't keep up gives up, in order, the least missed first: the picture's finish (its
 * glow and grade, drawn straight to the screen), a little sharpness, the thrown shadows, the floor's mirror
 * and its fine wood, then half the sharpness. Each is how sharp it is drawn (of the screen's own, 2 at
 * most) and the scene's `lite` level.
 */
const STEPS: readonly (readonly [number, Lite])[] = [
  [1, 0],
  [1, 1],
  [0.75, 1],
  [0.75, 2],
  [0.75, 3],
  [0.5, 3],
];
/**
 * No more than 60 pictures a second, whatever the screen's rate (battery, heat): the gap between two, ms.
 * Kept as a schedule, not a least gap: a 75, 90 or 144 Hz screen then draws 60 of its frames a second
 * (a least gap would make it every second or third one: 37 to 48).
 */
const FRAME_MS = 1000 / 60;
/** A frame this close (ms) to when the next picture is due draws it. */
const EARLY_MS = 2;
/** A step is taken back after this many fast stretches in a row (under FAST_MS a frame), three times at most. */
const FAST_MS = 18.5;
const FAST_RUN = 5;
/** A lost context that isn't back after this long in view (ms) is not coming back. */
const GONE_MS = 3000;
/**
 * A dead ball held on the clock (a timeout, a huddle, between possessions with the game paused): the men
 * still breathe and shift their weight, drawn at half the rate, for this many frame slots at most (a
 * minute), then nothing (battery). A pause in the middle of a move still freezes the picture.
 */
const REST_SLOTS = 3600;
/** A cut between two cameras is this short a dissolve (ms): it doesn't jump, and it isn't a mix. */
const DISSOLVE_MS = 150;

export default function Court3D(props: Court3DProps) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const cutRef = useRef<HTMLCanvasElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const thirdRef = useRef<HTMLDivElement>(null);
  const bugRef = useRef<HTMLSpanElement>(null);
  const wipeRef = useRef<HTMLDivElement>(null);
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
    let due = 0;
    let fast = 0;
    let backs = 0;
    let floorKey = '';
    let fontsIn = 0;
    document.fonts?.ready.then(() => void (fontsIn = 1));
    const floorCv = document.createElement('canvas');
    // how sharp it's drawn: full, or less on a device that can't keep up
    let level = 0;
    let sized = '';
    let frames = 0;
    let spent = 0;
    let told = false;
    let shown = false;
    let still = 0;
    let owed = 0;
    // a cut dissolves from the last camera's picture, kept on a canvas over this one (when, ms)
    const cutCv = cutRef.current!;
    let cutAt = 0;
    const snap = () => {
      if (cutCv.width !== canvas.width || cutCv.height !== canvas.height) {
        cutCv.width = canvas.width;
        cutCv.height = canvas.height;
      }
      const ctx = cutCv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0);
      cutAt = performance.now();
      cutCv.style.opacity = '1';
    };
    // a possession the court has finished while its replay plays: told it may go on when the replay is over
    let held: (() => void) | null = null;
    const letGo = () => {
      const done = held;
      held = null;
      done?.();
    };
    const cast: Cast = {
      replay: (done) => {
        const p = live.current;
        if (!scene || held || gone >= 0 || !p.replays || p.paused || p.hide || calmQ?.matches || !scene.replay(p.stage.current.script)) return false;
        held = done;
        return true;
      },
      skip: () => scene?.skipReplay(),
      end: () => {
        scene?.endReplay();
        letGo();
      },
    };
    const castRef = live.current.cast;
    if (castRef) castRef.current = cast;
    const build = () => {
      scene?.dispose();
      scene = new Scene!(canvas, paints.ball, paints.ballSeam, models!);
      scene.lite(STEPS[level][1]);
      sized = floorKey = '';
      shown = false;
      // (the dev server's QA scripts look at the broadcast through this, as at the store through __hc)
      if (import.meta.env.DEV) (window as unknown as { __hc3d: unknown }).__hc3d = scene;
      // (a scene built again has no replay on: the court is not kept waiting for one)
      letGo();
    };
    // (the default is to never give it back: asked for here)
    const lost = (e: Event) => {
      e.preventDefault();
      gone = 0;
      cast.end();
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
      if (now < due - EARLY_MS) return;
      // (the next is due one gap after this one was; a frame that came late doesn't owe a burst)
      due = Math.max(due + FRAME_MS, now);
      const p = live.current;
      // (frames skipped while resting are owed to the next one drawn, so the men breathe at their own pace)
      const real = (last ? Math.min(100, now - last) : 0) + owed;
      owed = 0;
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
      // (a screen of one dot a point has no sharpness to give: its steps are the shadows and the mirror)
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * STEPS[level][0]);
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
      // the play's clock stopped with no play in the middle of a move (a timeout, a break, the buzzer): the men
      // are not statues, they finish what they were doing and come to a stand
      const at = p.stage.current.play;
      const idle = !at || at.a === at.b;
      // paused, nothing moves: a few frames for the camera (and the men) to settle, then none (battery)
      still = dt > 0 || dirty || held ? 0 : still + 1;
      if (still > (idle ? (p.final === undefined ? 150 : 600) : 40)) {
        const resting = idle && p.final === undefined && !calmQ?.matches && still <= REST_SLOTS;
        if (!resting) return;
        if (still % 2) {
          owed = Math.min(100, owed + real);
          return;
        }
      }
      // (a dissolve costs a second render on the frame of the cut: only a device that keeps up at the top step has them)
      scene.cutHook = level === 0 && !calmQ?.matches ? snap : null;
      const labels = scene.frame(
        p.stage.current,
        {
          kits: p.kits,
          jersey: p.jersey,
          body: p.body,
          names: p.names,
          game: p.game?.(),
          hot: p.hot,
          final: p.final,
          clutch: p.clutch,
          board: fl?.kind === 'home' ? fl.paint : paints.ink,
          warn,
        },
        dt,
        real,
        !!calmQ?.matches,
        p.paused ? (idle ? real : 0) : real * p.own,
      );
      paint(labels, tagRef.current, flashRef.current, thirdRef.current, bugRef.current, wipeRef.current, w, h);
      if (cutAt) {
        const a = 1 - (performance.now() - cutAt) / DISSOLVE_MS;
        if (a <= 0) cutAt = 0;
        cutCv.style.opacity = a > 0 ? a.toFixed(3) : '0';
      }
      if (held && scene.released) letGo();
      if (!shown) {
        shown = true;
        p.onReady();
      }
      // too slow: the picture gives up a step, and with none left the page is told (it offers the 2D court)
      if (dt > 0 && real > 0) {
        frames++;
        spent += real;
        if (frames >= STRETCH) {
          const avg = spent / frames;
          frames = spent = 0;
          const last = STEPS.length - 1;
          if (avg > LITE_MS && level < last) {
            fast = 0;
            scene.lite(STEPS[++level][1]);
          } else if (avg > SLOW_MS && level === last) {
            if (!told) {
              told = true;
              p.onSlow();
            }
          } else if (level > 0 && avg < FAST_MS && backs < 3) {
            // (it was a bad stretch, not a slow device: a step comes back)
            if (++fast >= FAST_RUN) {
              fast = 0;
              backs++;
              scene.lite(STEPS[--level][1]);
            }
          } else fast = 0;
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
      cast.end();
      if (castRef?.current === cast) castRef.current = null;
      scene?.dispose();
    };
  }, []);

  return (
    <div className="c3d" hidden={props.hide} aria-hidden="true">
      <canvas ref={glRef} className="c3d-gl" />
      <canvas ref={cutRef} className="c3d-gl c3d-cut" />
      <span ref={tagRef} className="c3d-pill c3d-tag">
        <b className="c3d-tag-n" />
        <span className="c3d-tag-name" />
      </span>
      <span ref={flashRef} className="c3d-pill c3d-flash" />
      {props.clutch && <div className="c3d-lights" />}
      <div ref={thirdRef} className="c3d-third">
        <b className="c3d-third-n" />
        <span className="c3d-third-t">
          <span className="c3d-third-name" />
          <span className="c3d-third-sub" />
        </span>
      </div>
      <span ref={bugRef} className="c3d-bug">
        <Rewind size={13} strokeWidth={2.4} aria-hidden="true" />
        Replay
      </span>
      <div ref={wipeRef} className="c3d-wipe">
        <div className="c3d-wipe-run">
          <span className="c3d-wipe-word">Replay</span>
        </div>
      </div>
    </div>
  );
}

/** How far the wipe's panels lean (degrees): the travel past each edge it needs to cover the corners too. */
const WIPE_LEAN = 14;
/** The wipe's run, as wide as the picture this many times (the ink, then its team's colour on the leading edge). */
const WIPE_RUN = 1.62;

/** The graphics over the picture this frame (each written only when it changes). */
function paint(l: Labels, tag: HTMLElement | null, flash: HTMLElement | null, third: HTMLElement | null, bug: HTMLElement | null, wipe: HTMLElement | null, w: number, h: number) {
  if (tag) {
    const t = l.tag;
    if (t && t.text && tag.dataset.key !== `${t.num}/${t.text}`) {
      tag.dataset.key = `${t.num}/${t.text}`;
      tag.children[0].textContent = t.num;
      tag.children[1].textContent = t.text;
      tag.style.setProperty('--c3d-team', t.color);
    }
    place(tag, t, 1);
  }
  // (a play's word lands: it comes up to its size as it comes in)
  if (flash) {
    if (l.flash && flash.textContent !== l.flash.text) flash.textContent = l.flash.text;
    place(flash, l.flash, l.flash?.alpha ?? 0, true);
    if (l.flash) flash.dataset.kind = l.flash.kind;
  }
  if (third) {
    const t = l.third;
    if (t && third.dataset.key !== t.key) {
      third.dataset.key = t.key;
      third.children[0].textContent = t.num;
      third.querySelector('.c3d-third-name')!.textContent = t.name;
      third.querySelector('.c3d-third-sub')!.textContent = t.team ? `${t.team} · ${t.word}` : t.word;
      third.style.setProperty('--c3d-team', t.color);
    }
    if (third.classList.contains('on') !== !!t) third.classList.toggle('on', !!t);
  }
  if (bug && bug.classList.contains('on') !== l.replay) bug.classList.toggle('on', l.replay);
  if (wipe) {
    const at = l.wipe?.at;
    if (at === undefined || at <= 0 || at >= 1) {
      if (wipe.style.visibility !== 'hidden') wipe.style.visibility = 'hidden';
      return;
    }
    wipe.style.visibility = 'visible';
    wipe.style.setProperty('--c3d-team', l.wipe!.color);
    wipe.style.setProperty('--c3d-trim', l.wipe!.trim);
    // (left to right, past each edge by its lean: at the middle it covers the whole picture, and the picture cuts under it)
    const lean = (h / 2) * Math.tan((WIPE_LEAN * Math.PI) / 180);
    const run = w * WIPE_RUN;
    const x = -(run + lean) + (w + run + 2 * lean) * at;
    (wipe.firstElementChild as HTMLElement).style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) skewX(-${WIPE_LEAN}deg)`;
  }
}

/** A label at its point of the picture (or out of sight). */
function place(el: HTMLElement, at: { x: number; y: number; text: string } | null, alpha: number, grow = false) {
  if (!at || !at.text) {
    el.style.opacity = '0';
    return;
  }
  const a = Math.max(0, Math.min(1, alpha));
  el.style.opacity = String(a);
  el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, 0)${grow && a < 1 ? ` scale(${(0.84 + 0.16 * a).toFixed(3)})` : ''}`;
}
