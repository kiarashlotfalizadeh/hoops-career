// The 3D court's canvas, over the 2D court's (which keeps the play's time and is not painted while
// this is up: see CourtView.tsx). It loads the scene on demand, draws the moment the 2D court's clock
// is at, and says so when it can't: no WebGL (onFail), or frames too slow to watch (onSlow). A phone
// takes the drawing context away from an app in the background: the 2D court shows meanwhile (onLost)
// and the scene is built again when the context is back. Over the picture, the broadcast's graphics:
// the tags over the handler and a tapped man, the play's word, the lower third on a cut-in or a replay, the replay's bug and wipe
// (written each frame from what the scene says, no re-render). The tags and the word are seated each frame where they
// leave clear what the scene says is being played (the ball, its way to the rim, the rim, the faces and hands round it).
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Rewind } from 'lucide-react';
import { FLOOR_L, paintFloor, readPaints, venueOf, type CourtFloor, type GameInfo, type Stage } from './Court';
import type { MatchKit } from '../teamColors';
import type { CamKind } from './court3d/cameras';
import type { Body } from './court3d/puppet';
import { loadModels, type Models } from './court3d/models';
import type { CourtScene, Disc, Labels, Lite } from './court3d/scene';
import { localPoint } from './turn';
import type { Occasion } from './occasion';

/** Where CourtView reaches the broadcast: an instant replay at a possession's end, and its end. */
export interface Cast {
  /** The court has finished a possession: true if a replay of it starts (`done` is called once the court may go on). */
  replay(done: () => void): boolean;
  /** A tap on the court: the replay goes, through its wipe. */
  skip(): void;
  /** A tap on the page at (x, y): true if it was on a man in the picture (he is tagged for a while). */
  tap(x: number, y: number): boolean;
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
  /** And what kind of win it is. */
  occasion?: Occasion;
  floor?: CourtFloor;
  clutch?: boolean;
  /** The camera that follows the play. */
  cam?: CamKind;
  /** Each side's players, [home, away] (player ids): those not on the floor sit on its bench as themselves. */
  bench?: [number[], number[]];
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
/** Frames are timed over stretches this long, or this many ms if that comes first (a device at five frames a second is not kept there twelve seconds a step). */
const STRETCH = 60;
const STRETCH_MS = 1500;
const STRETCH_LEAST = 8;
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
 * Where a phone or a tablet starts (a screen worked by touch): without the shadows, at three quarters of
 * its sharpness. The top step draws some four and a half million triangles and finishes the picture after:
 * a phone made to start there spent its first seconds on frames it could not draw, a step at a time. One
 * that keeps up is given the steps back (see FAST_RUN).
 */
const TOUCH_START = 3;
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
  const tag2Ref = useRef<HTMLSpanElement>(null);
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
    let level = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? TOUCH_START : 0;
    let sized = '';
    let camWas = live.current.cam;
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
      tap: (x, y) => {
        // (on the canvas's own box: a phone's page may be turned a quarter round, see turn.ts)
        const at = localPoint(canvas, x, y);
        return !!scene && gone < 0 && !live.current.hide && scene.tap(at.x, at.y);
      },
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
      // (a camera picked while the game is stopped is drawn at once: the chip's name and the picture never disagree)
      if (p.cam !== camWas) {
        camWas = p.cam;
        dirty = true;
      }
      const fl = p.floor;
      const key = `${fl ? JSON.stringify(fl) : ''}|${fontsIn}`;
      if (key !== floorKey) {
        floorKey = key;
        // (the whole floor, sideways, as the 2D court paints it: its mark faces the camera)
        const k = Math.min(16, Math.max(10, (Math.max(w, 700) * 2) / FLOOR_L));
        paintFloor(floorCv, { wide: true, k, w: 0, h: 0, top: 0, ox: 0, oy: 0 }, 1, fl, paints, true);
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
          occasion: p.occasion,
          clutch: p.clutch,
          cam: p.cam,
          bench: p.bench,
          board: fl?.kind === 'home' ? fl.paint : paints.ink,
          venue: venueOf(fl),
          warn,
        },
        dt,
        real,
        !!calmQ?.matches,
        p.paused ? (idle ? real : 0) : real * p.own,
      );
      paint(labels, [tagRef.current, tag2Ref.current], flashRef.current, thirdRef.current, bugRef.current, wipeRef.current, w, h);
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
        if (frames >= STRETCH || (spent >= STRETCH_MS && frames >= STRETCH_LEAST)) {
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
      {[tagRef, tag2Ref].map((ref, i) => (
        <span key={i} ref={ref} className="c3d-tag">
          <b className="c3d-tag-n" />
          <span className="c3d-tag-name" />
        </span>
      ))}
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

/** A tag's foot is this far (px, at its full size) over the point over his head: its notch is between. */
const TAG_FOOT = 5;
/** A tag is drawn no smaller than this of its own size, so its name stays readable (where it is short of room it gives up the name: BRIEF_NEAR). */
const TAG_LEAST = 0.84;
/** Two words, or a word and a word's box, are at least this far apart (px). */
const WORD_GAP = 4;
/**
 * Where a tag may stand: over his head, a row higher, beside his head on either side, two rows higher, up to
 * either side (the nearest that is clear is taken; of two as near, the first). Each is how far across (its half
 * width and most of its height) and how far up or down (its height and the gap).
 */
const TAG_SEATS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [-1, 0.75],
  [1, 0.75],
  [0, -2],
  [-1, -0.75],
  [1, -0.75],
];
/** And a play's word: on its point, over it, either side of it, two rows over, under it, up to either side, three rows over. */
const FLASH_SEATS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, -2],
  [0, 1],
  [-1, -1],
  [1, -1],
  [0, -3],
];
/**
 * A seat counts this much against itself for each px it is off the first (in px of overlap): a word goes farther
 * from its point only to be clearer. And the seat it has counts this much for itself: it doesn't hop between two.
 */
const SEAT_COST = 0.1;
const SEAT_STAY = 2;
/** A px of a word on a head or a hand counts this much against its seat (a px off the picture two). */
const SOFT_COST = 2;
/**
 * A tag's number alone counts this much against it (px of overlap): little in a crowd or on a small picture (it
 * keeps close to its man rather than going far with his name), a lot elsewhere (it goes beside him first).
 */
const BRIEF_NEAR = 2;
const BRIEF_FAR = 8;
/** A picture narrower or shorter than this (px) is a small one (as court3d.css has it). */
const SMALL_W = 600;
const SMALL_H = 360;
/** A word keeps a new seat at least this long (ms) while it stays clear: it doesn't twitch back and forth. */
const SEAT_HOLD = 450;
/** A word goes to a new seat over this long (ms): it slides there, it doesn't jump (unless the slide would cross the ball). */
const SEAT_MS = 70;

/** A box on the picture (px): its left, top, right and bottom. */
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
/**
 * Where a word sits: its size at its full size (measured as it comes on), the seat it has and since when, how far
 * it is off its first seat (eased), when it was last put.
 */
interface Seat {
  key: string;
  w: number;
  h: number;
  /** A tag's number alone, how wide (its brief form). */
  nw: number;
  i: number;
  since: number;
  ox: number;
  oy: number;
  on: boolean;
  at: number;
}
const seats = new WeakMap<HTMLElement, Seat>();
const seatOf = (el: HTMLElement) => {
  let s = seats.get(el);
  if (!s) seats.set(el, (s = { key: '', w: 0, h: 0, nw: 0, i: 0, since: 0, ox: 0, oy: 0, on: false, at: 0 }));
  return s;
};
/** How much the seat a word has is preferred to the others (px of overlap): all of it while it is new. */
const stay = (s: Seat) => (s.on && performance.now() - s.since < SEAT_HOLD ? 1e6 : SEAT_STAY);

/**
 * How much a box lies on what it must leave clear (px): never on a hard disc nor another word (Infinity); how far
 * into a soft one (SOFT_COST); what of it is off the picture, twice.
 */
function cost(x: Box, keep: readonly Disc[], taken: readonly Box[], w: number, h: number): number {
  let n = 0;
  for (const d of keep) {
    const into = d.r - Math.hypot(Math.max(x.l - d.x, 0, d.x - x.r), Math.max(x.t - d.y, 0, d.y - x.b));
    if (into <= 0) continue;
    if (!d.soft) return Infinity;
    n += into * SOFT_COST;
  }
  for (const o of taken) if (x.l < o.r + WORD_GAP && o.l < x.r + WORD_GAP && x.t < o.b + WORD_GAP && o.t < x.b + WORD_GAP) return Infinity;
  return n + 2 * (Math.max(0, -x.l) + Math.max(0, x.r - w) + Math.max(0, -x.t) + Math.max(0, x.b - h));
}

/**
 * The seat for a word of this size (px, as drawn) whose point is (x, y): `over` it by that much (a tag's foot) or
 * on it (null: a play's word's middle). The first in `list` that is clear, unless the one it `had` is clear too
 * (it is preferred by `hold`), and what it costs; null if every one lies on something it must leave clear. (`pw`,
 * `ph`: the picture's size.)
 */
function seatFor(
  list: readonly (readonly [number, number])[],
  had: number,
  hold: number,
  x: number,
  y: number,
  w: number,
  h: number,
  over: number | null,
  keep: readonly Disc[],
  taken: readonly Box[],
  pw: number,
  ph: number,
): { i: number; box: Box; n: number } | null {
  let best: { i: number; box: Box; n: number } | null = null;
  let least = Infinity;
  list.forEach(([u, v], i) => {
    const cx = x + u * (w / 2 + 0.7 * h);
    const t = (over === null ? y - h / 2 : y - over - h) + v * (h + WORD_GAP);
    const box = { l: cx - w / 2, t, r: cx + w / 2, b: t + h };
    const c = cost(box, keep, taken, pw, ph);
    // (a new seat is held only while it is all clear)
    const n = c + Math.hypot(cx - x, v * (h + WORD_GAP)) * SEAT_COST - (i === had ? (c > 0 ? SEAT_STAY : hold) : 0);
    if (n < least) [least, best] = [n, { i, box, n }];
  });
  return best;
}

/**
 * A word to its seat `box` (the first seat's is `first`): slid there from the one it had, or put straight there if
 * it wasn't showing or the slide would take it over the ball, its way or the rim (`keep`); drawn `size` of its own
 * size, and `grow` of that about its middle (a play's word coming in).
 */
function sit(el: HTMLElement, s: Seat, i: number, box: Box, first: Box, keep: readonly Disc[], size: number, alpha: number, grow = 1) {
  const now = performance.now();
  const tx = box.l - first.l;
  const ty = box.t - first.t;
  const k = s.on ? 1 - Math.exp(-Math.min(100, now - s.at) / SEAT_MS) : 1;
  s.ox += (tx - s.ox) * k;
  s.oy += (ty - s.oy) * k;
  const dx = first.l + s.ox - box.l;
  const dy = first.t + s.oy - box.t;
  if ((dx || dy) && cost({ l: box.l + dx, t: box.t + dy, r: box.r + dx, b: box.b + dy }, keep, [], Infinity, Infinity) === Infinity) [s.ox, s.oy] = [tx, ty];
  if (i !== s.i || !s.on) s.since = now;
  s.i = i;
  s.on = true;
  s.at = now;
  const gx = ((box.r - box.l) * (1 - grow)) / 2;
  const gy = ((box.b - box.t) * (1 - grow)) / 2;
  el.style.opacity = alpha >= 1 ? '1' : alpha.toFixed(3);
  el.style.transform = `translate3d(${Math.round(first.l + s.ox + gx)}px, ${Math.round(first.t + s.oy + gy)}px, 0) scale(${(size * grow).toFixed(3)})`;
}

/** A word out of sight. */
function hide(el: HTMLElement, s: Seat) {
  s.on = false;
  if (el.style.opacity !== '0') el.style.opacity = '0';
}

/** The graphics over the picture this frame (each written only when it changes). */
function paint(
  l: Labels,
  tags: (HTMLElement | null)[],
  flash: HTMLElement | null,
  third: HTMLElement | null,
  bug: HTMLElement | null,
  wipe: HTMLElement | null,
  w: number,
  h: number,
) {
  // the lower third (the words over the play keep off it, and it gives way to the ball when the ball is under it)
  let under: Box | null = null;
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
    if (t) {
      under = { l: third.offsetLeft, t: third.offsetTop, r: third.offsetLeft + third.offsetWidth, b: third.offsetTop + third.offsetHeight };
      const ball = l.ball;
      const on = !!ball && cost(under, [ball], [], w, h) === Infinity;
      if (third.classList.contains('under') !== on) third.classList.toggle('under', on);
    }
  }
  const taken: Box[] = under ? [under] : [];
  // the tags: each in the first seat round his head that leaves the ball, its way and the rim clear (and the heads and
  // hands round it if it can), and not on the other; its number alone if only that fits near him (BRIEF_NEAR); none
  // if nothing does
  const size = Math.max(TAG_LEAST, l.size);
  tags.forEach((tag, i) => {
    if (!tag) return;
    const s = seatOf(tag);
    const t = l.tags[i] ?? null;
    if (!t || !t.text) return hide(tag, s);
    const key = `${t.num}/${t.text}`;
    if (tag.dataset.key !== key || !s.on) {
      if (tag.dataset.key !== key) {
        tag.dataset.key = key;
        tag.children[0].textContent = t.num;
        tag.children[1].textContent = t.text;
        tag.style.setProperty('--c3d-team', t.color);
      }
      // (its size, whole: measured as it comes on, so the fonts are in)
      tag.dataset.brief = '0';
      s.key = key;
      s.w = tag.offsetWidth;
      s.h = tag.offsetHeight;
      s.nw = (tag.children[0] as HTMLElement).offsetWidth;
    }
    if ((tag.dataset.late === '1') !== t.late) tag.dataset.late = t.late ? '1' : '0';
    const hh = s.h * size;
    const foot = TAG_FOOT * size;
    const was = tag.dataset.brief === '1';
    const whole = seatFor(TAG_SEATS, was ? -1 : s.i, stay(s), t.x, t.y, s.w * size, hh, foot, l.keep, taken, w, h);
    const brief = seatFor(TAG_SEATS, was ? s.i : -1, stay(s), t.x, t.y, s.nw * size, hh, foot, l.keep, taken, w, h);
    const giveUp = l.crowd || w < SMALL_W || h < SMALL_H ? BRIEF_NEAR : BRIEF_FAR;
    const short = !whole || (!!brief && brief.n + giveUp < whole.n);
    const seat = short ? brief : whole;
    if (!seat) return hide(tag, s);
    if ((tag.dataset.brief === '1') !== short) tag.dataset.brief = short ? '1' : '0';
    // (beside his head, the notch points at nothing)
    const side = TAG_SEATS[seat.i][0] !== 0;
    if ((tag.dataset.side === '1') !== side) tag.dataset.side = side ? '1' : '0';
    const ww = (short ? s.nw : s.w) * size;
    sit(tag, s, seat.i, seat.box, { l: t.x - ww / 2, t: t.y - foot - hh, r: t.x + ww / 2, b: t.y - foot }, l.keep, size, 1);
    taken.push(seat.box);
  });
  // (a play's word lands where it covers nothing being played: it comes up to its size as it comes in)
  if (flash) {
    const f = l.flash;
    const s = seatOf(flash);
    if (!f || !f.text || f.alpha <= 0) hide(flash, s);
    else {
      if (flash.textContent !== f.text) flash.textContent = f.text;
      flash.dataset.kind = f.kind;
      if (s.key !== f.text || !s.on) {
        s.key = f.text;
        s.w = flash.offsetWidth;
        s.h = flash.offsetHeight;
      }
      const a = Math.min(1, f.alpha);
      const fw = s.w * l.size;
      const fh = s.h * l.size;
      const seat = seatFor(FLASH_SEATS, s.i, stay(s), f.x, f.y, fw, fh, null, l.keep, taken, w, h);
      if (!seat) hide(flash, s);
      else sit(flash, s, seat.i, seat.box, { l: f.x - fw / 2, t: f.y - fh / 2, r: f.x + fw / 2, b: f.y + fh / 2 }, l.keep, l.size, a, a < 1 ? 0.84 + 0.16 * a : 1);
    }
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
