// The court: a full maple floor, both baskets, drawn on a canvas from a possession's script
// (choreo.ts). Teams attack fixed ends and run the floor, so a change of possession is a run back,
// not a cut.
//
// Two views of the same floor, picked by the shape the layout gives the canvas:
// - upright (a phone held upright): a window on the floor that pans with the ball, so the players
//   stay big; a set plays out at one end and a break carries the camera to the other;
// - sideways (wide: a tablet, a desktop, or the compact court at a break): the whole floor at once.
//
// With no possession to draw the court is never empty: the fives line up for the tip, the players
// stand where the last play left them (a huddle, a stop), or the floor shows the shot chart (a break).
import { useEffect, useRef, type MutableRefObject } from 'react';
import { BASKET, COURT_LEN, toWorld, type Frame, type Pt, type Script } from './choreo';
import type { ShotRecord, Team } from '../../core/types';
import { FRANCHISES, type FranchiseDef } from '../../core/teams';
import { inkOn, type MatchKit } from '../teamColors';

/**
 * The floor the game is played on: maple, with the home team's colour painted in both keys and the
 * center circle (its mark there, its name along the baselines), or a neutral one (the Cup final).
 */
export type CourtFloor =
  { kind: 'home'; abbrev: string; name: string; colors: [string, string, string]; paint: string; trim: string; mark: FranchiseDef['mark'] } | { kind: 'neutral'; name: string };

/** The floor of a game at `home`'s arena in tonight's colours (`kit`), or a neutral one; `neutralName` goes along the baselines there. */
export function courtFloor(home: Pick<Team, 'tid' | 'abbrev' | 'name' | 'colors'>, kit: MatchKit, neutral: boolean, neutralName = ''): CourtFloor {
  if (neutral) return { kind: 'neutral', name: neutralName };
  return { kind: 'home', abbrev: home.abbrev, name: home.name, colors: home.colors, paint: kit.color, trim: kit.trim, mark: FRANCHISES[home.tid]?.mark ?? 'circle' };
}

/** What the court shows between possessions. */
export type CourtIdle =
  /** Before the opening tip: both fives around the center circle. */
  | { kind: 'tip'; fives: [number[], number[]] }
  /** A break: every shot so far, each team's at the end it attacks first. */
  | { kind: 'chart'; shots: ShotRecord[] }
  /** A huddle or a stop: the players stay where the last play left them. */
  | { kind: 'hold' };

export interface CourtProps {
  script: Script | null;
  speed: number; // 1 = normal
  paused: boolean;
  /** Tonight's kits, [home, away]: the same colours the scorebug and the graphics wear. */
  kits: [MatchKit, MatchKit];
  jersey: (pid: number) => string;
  onDone: () => void;
  onTick?: (clock: number, score: [number, number] | null) => void;
  /** The last frame the court has reached, as it changes (the call bar's caption follows it). */
  onBeat?: (frame: number) => void;
  /** The ball handler's name tag (none without it). */
  names?: (pid: number) => string;
  /** [home, away], for the shot chart's labels. */
  abbrevs?: [string, string];
  /** Whose floor it is (a plain neutral floor without it). */
  floor?: CourtFloor;
  /** Players on a hot streak: they wear a heat ring. */
  hot?: ReadonlySet<number>;
  /** What to show with no possession to draw (default: hold the last frame). */
  idle?: CourtIdle;
  /** Clutch time: the building's lights come down around the floor. */
  clutch?: boolean;
  /** The game is over: the side that won it (the 3D court's winners celebrate). */
  final?: 0 | 1;
  /** What the court shows, for screen readers. */
  label: string;
  /** Where the play is, written each frame: the 3D court (Court3D.tsx) draws the same moment from it. */
  stage?: MutableRefObject<Stage>;
  /** Something else is drawing the floor (the 3D court): this one keeps the play's time and paints nothing. */
  mute?: boolean;
}

/** The moment the court is at, for another view of it to draw. */
export interface Stage {
  script: Script | null;
  play: Pose | null;
  /** Who stands where between possessions (the court itself), and the ball. */
  standers: Stander[];
  ball: Pt | null;
}
export const emptyStage = (): Stage => ({ script: null, play: null, standers: [], ball: null });

export const HALF_W = 25;
/** The apron around the floor: a band along each sideline and a deeper one behind each baseline. */
export const SIDE = 1.8;
export const END = 3.4;
/** The whole floor in feet, apron included. */
export const FLOOR_W = 2 * HALF_W + 2 * SIDE;
export const FLOOR_L = COURT_LEN + 2 * END;
/** A canvas at least this much wider than tall shows the whole floor sideways. */
const WIDE = 1.6;
/** Upright, the window keeps the ball this far (ft) from its trailing edge: the rest of the view is ahead of it, toward the basket. */
const TRAIL = 8;
/** A player is a disc this many feet across the middle (choreo.ts keeps them at least two of these apart). */
const BODY = 1.45;
/** Nothing written on the court is smaller than this (px). */
const TEXT_MIN = 12;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** The colours the canvas paints with: the app's tokens, read once (tokens.css), with the same values to fall back on. */
export interface Paints {
  wood: string;
  wood2: string;
  seam: string;
  ink: string;
  line: string;
  rim: string;
  ball: string;
  ballSeam: string;
  good: string;
  bad: string;
  warn: string;
}
export function readPaints(el: Element): Paints {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    wood: v('--maple', '#dcae76'),
    wood2: v('--maple-2', '#d4a46b'),
    seam: v('--maple-seam', 'rgba(122, 72, 24, 0.2)'),
    ink: v('--ink', '#121212'),
    line: v('--on-ink', '#ffffff'),
    rim: v('--court-rim', '#e8551c'),
    ball: v('--court-ball', '#e9772a'),
    ballSeam: v('--court-ball-seam', '#3d1c00'),
    // (the app's signals as they read on an ink plate)
    good: v('--good-night', '#7fe3a8'),
    bad: v('--bad-night', '#ff9a8f'),
    warn: v('--warn-night', '#ffc65c'),
  };
}

/** Each player's velocity (feet a ms) as he passes through each frame of a script: [frame][offense..., defense...]. */
type Tangents = Pt[][];
const ZERO: Pt = { x: 0, y: 0 };
const tangentCache = new WeakMap<Script, Tangents>();

/**
 * The velocity a player carries through a frame, so a run through several frames is one smooth move
 * instead of a stop at each. He stops at a frame where he stands still on either side of it or turns
 * back; a turn slows him, and he's never faster through a frame than on the slower of the moves
 * either side of it (no overshoot).
 */
function tangentsOf(sc: Script): Tangents {
  const hit = tangentCache.get(sc);
  if (hit) return hit;
  const f = sc.frames;
  const at = (i: number, j: number) => (j < sc.oPids.length ? f[i].o[j] : f[i].d[j - sc.oPids.length]);
  const n = sc.oPids.length + sc.dPids.length;
  const out: Tangents = f.map((_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === 0 || i === f.length - 1) return ZERO;
      const dtA = f[i].dur;
      const dtB = f[i + 1].dur;
      const p0 = at(i - 1, j);
      const p1 = at(i, j);
      const p2 = at(i + 1, j);
      if (!dtA || !dtB || !p0 || !p1 || !p2) return ZERO;
      const ax = p1.x - p0.x;
      const ay = p1.y - p0.y;
      const bx = p2.x - p1.x;
      const by = p2.y - p1.y;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la < 0.05 || lb < 0.05) return ZERO;
      const cos = (ax * bx + ay * by) / (la * lb);
      if (cos <= 0) return ZERO;
      const m = { x: (ax / dtA + bx / dtB) / 2, y: (ay / dtA + by / dtB) / 2 };
      const lm = Math.hypot(m.x, m.y) || 1;
      const cap = Math.min(la / dtA, lb / dtB) * cos;
      return { x: (m.x / lm) * cap, y: (m.y / lm) * cap };
    }),
  );
  tangentCache.set(sc, out);
  return out;
}

/** Cubic Hermite between two frames: `u` 0..1 of the move's time, `dt` its length (ms), `ma`/`mb` the velocities through each end. */
function hermite(a: Pt, b: Pt, ma: Pt, mb: Pt, u: number, dt: number): Pt {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return { x: h00 * a.x + h10 * dt * ma.x + h01 * b.x + h11 * dt * mb.x, y: h00 * a.y + h10 * dt * ma.y + h01 * b.y + h11 * dt * mb.y };
}

/** Canvas text in the app's face, condensed like its scoreboard figures. */
function setFont(ctx: CanvasRenderingContext2D, weight: number, px: number, stretch: 'condensed' | 'semi-condensed' = 'condensed') {
  // (an engine that doesn't take the width keyword in the shorthand ignores that line and keeps the first;
  // the property says it again where there is one)
  ctx.font = `${weight} ${px}px "Archivo Variable", system-ui, sans-serif`;
  ctx.font = `${weight} ${stretch} ${px}px "Archivo Variable", system-ui, sans-serif`;
  if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = stretch;
}

/** How the floor sits on the canvas this frame: feet to pixels, either view. */
export interface View {
  wide: boolean;
  /** Pixels a foot. */
  k: number;
  w: number;
  h: number;
  /** Upright: the court y at the top edge of the window. Sideways: the margins that center the floor. */
  top: number;
  ox: number;
  oy: number;
}
const project = (v: View, p: Pt): Pt =>
  v.wide ? { x: v.ox + (p.y + END) * v.k, y: v.oy + (HALF_W + SIDE - p.x) * v.k } : { x: (p.x + HALF_W + SIDE) * v.k, y: (p.y - v.top) * v.k };

/** A player standing on the floor between possessions. */
export interface Stander {
  pid: number;
  side: 0 | 1;
  at: Pt;
}

export function Court({ script, speed, paused, kits, jersey, onDone, onTick, onBeat, names, abbrevs, floor, hot, idle, clutch, label, stage, mute }: CourtProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ t: 0, last: 0, script: null as Script | null, done: false, beat: -1 });
  const props = useRef({ speed, paused, kits, jersey, onDone, onTick, onBeat, names, abbrevs, floor, hot, idle, clutch, stage, mute });
  props.current = { speed, paused, kits, jersey, onDone, onTick, onBeat, names, abbrevs, floor, hot, idle, clutch, stage, mute };

  // each possession is drawn from its start
  useEffect(() => {
    state.current = { t: 0, last: 0, script, done: false, beat: -1 };
  }, [script]);

  useEffect(() => {
    let raf = 0;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const paints = readPaints(canvas);
    // the floor, its lines and its marks never change: painted once a canvas size, then copied each frame
    const floorCv = document.createElement('canvas');
    let floorKey = '';
    let floorWas: CourtFloor | undefined;
    let floorId = '';
    // the floor's lettering waits for the font: painted again once it's in
    let fontsIn = 0;
    document.fonts?.ready.then(() => void (fontsIn = 1));
    // reduced motion: the players still move (that is the game), but the camera cuts instead of panning
    // and nothing spins, shakes, trails or fades
    const calmQ = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let drawn = '';
    let lastScript: Script | null | undefined;
    // the window's top edge (upright), and where the ball and the players were last drawn (on the court itself)
    let cam: number | null = null;
    let ballAt: Pt | null = null;
    let standers: Stander[] = [];

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      const p = props.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const dt = s.last ? Math.min(100, now - s.last) : 0;
      s.last = now;
      if (!p.paused && !s.done) s.t += dt * p.speed;
      const calm = !!calmQ?.matches;
      const sc = s.script && s.script.frames.length ? s.script : null;
      const cut = sc !== lastScript;
      lastScript = sc;

      // the view: the whole floor sideways when the canvas is wide, a window on it upright
      const wide = w >= h * WIDE;
      const k = wide ? Math.min(w / FLOOR_L, h / FLOOR_W) : w / FLOOR_W;
      const view: View = { wide, k, w, h, top: 0, ox: wide ? (w - FLOOR_L * k) / 2 : 0, oy: wide ? (h - FLOOR_W * k) / 2 : 0 };
      const play = sc ? pose(sc, s.t, calm) : null;
      // where everyone is, for the 3D court and for the floor between possessions
      if (sc && play) {
        const W = (pt: Pt) => toWorld(pt, sc.dir);
        standers = [...sc.oPids.map((pid, j) => ({ pid, side: sc.off, at: W(play.o[j]) })), ...sc.dPids.map((pid, j) => ({ pid, side: (1 - sc.off) as 0 | 1, at: W(play.d[j]) }))];
        ballAt = W(play.ball);
      }
      const tip = !sc && p.idle?.kind === 'tip' ? tipOff(p.idle.fives) : null;
      if (p.stage) {
        const st = p.stage.current;
        st.script = sc;
        st.play = play;
        st.standers = tip ?? standers;
        st.ball = tip ? { x: 0, y: COURT_LEN / 2 } : ballAt;
      }
      if (p.mute) {
        // (the 3D court is drawing this: the possession still has to play out)
        if (play) report(play);
        drawn = '';
        return;
      }
      // (the view just turned upright: the window finds the play again)
      if (wide) cam = null;
      if (!wide) {
        const len = h / k;
        const lo = -END;
        const hi = Math.max(lo, COURT_LEN + END - len);
        let want: number;
        if (play && sc) {
          // most of the window ahead of the ball, toward the basket it's headed for
          // (so a set plays out with the window pinned to the baseline, and a break carries it up the floor)
          const local = clamp(play.ball.y - (len - TRAIL), -END, COURT_LEN + END - len);
          want = sc.dir === 1 ? local : COURT_LEN - local - len;
        } else if (p.idle?.kind === 'chart') want = lo;
        else if (p.idle?.kind === 'tip' || !ballAt) want = COURT_LEN / 2 - len / 2;
        // (a huddle or a stop: the window stays where it was, or finds the ball if the view has just turned upright)
        else want = cam ?? ballAt.y - len / 2;
        want = clamp(want, lo, hi);
        // a new possession that doesn't pick up where the last one ended (a highlight, after a break) is a cut
        const jump =
          cam === null || calm || (cut && sc && (!ballAt || Math.hypot(ballAt.x - toWorld(sc.frames[0].ball, sc.dir).x, ballAt.y - toWorld(sc.frames[0].ball, sc.dir).y) > 10));
        cam = jump ? want : cam! + (want - cam!) * (1 - Math.exp((-dt * Math.max(1, p.speed)) / 170));
        if (Math.abs(want - cam) < 0.02) cam = want;
        view.top = cam;
      }

      const fl = p.floor;
      if (fl !== floorWas) {
        floorWas = fl;
        floorId = fl ? JSON.stringify(fl) : '';
      }
      const key = `${canvas.width}x${canvas.height}|${wide}|${fontsIn}|${floorId}`;
      // paused, finished or waiting for the next possession: nothing moved, so skip the redraw (battery)
      const idleKey = sc ? '' : `${p.idle?.kind ?? 'hold'}|${p.idle?.kind === 'chart' ? p.idle.shots.length : p.idle?.kind === 'tip' ? p.idle.fives.join('/') : standers.length}`;
      const sig = `${key}|${s.t}|${s.done}|${view.top}|${idleKey}|${p.clutch}|${p.hot?.size ?? 0}`;
      if (sig === drawn && !cut) return;
      drawn = sig;
      if (!canvas.width || !canvas.height) {
        // (a hidden, zero-size canvas can't be painted, but the possession still has to play out)
        if (play) report(play);
        return;
      }
      if (key !== floorKey) {
        floorKey = key;
        paintFloor(floorCv, view, dpr, fl, paints);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (wide) {
        ctx.fillStyle = paints.ink;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(floorCv, Math.round(view.ox * dpr), Math.round(view.oy * dpr));
      } else ctx.drawImage(floorCv, 0, Math.round((view.top + END) * k * dpr), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (sc && play) {
        drawPlay(sc, play, view, calm, s.t);
        report(play);
      } else if (p.idle?.kind === 'chart') drawChart(ctx, view, p.idle.shots, p.kits, p.abbrevs, paints);
      else {
        const who = tip ?? standers;
        for (const st of who) drawPlayer(ctx, view, st.at, p.kits[st.side], p.jersey(st.pid), false, !!p.hot?.has(st.pid), paints);
        const b = p.idle?.kind === 'tip' ? { x: 0, y: COURT_LEN / 2 } : ballAt;
        if (b) drawBall(ctx, view, b, 0, 0, paints);
      }
      if (p.clutch) drawLights(ctx, view);
    };

    /** The callbacks a possession owes the screen as it plays: the clock and score, the beat, and the end. */
    const report = (play: Pose) => {
      const s = state.current;
      const p = props.current;
      p.onTick?.(play.clock, play.score);
      if (play.beat !== s.beat) {
        s.beat = play.beat;
        p.onBeat?.(play.beat);
      }
      if (s.t >= play.total + 180 && !s.done) {
        s.done = true;
        p.onDone();
      }
    };

    // the shot the possession on the floor has taken (its mark stays until the next possession)
    let shot: { sc: Script; at: Pt; made: boolean } | null = null;
    const drawPlay = (sc: Script, play: Pose, view: View, calm: boolean, t: number) => {
      const p = props.current;
      const { a, b, u } = play;
      const kitO = p.kits[sc.off];
      const kitD = p.kits[1 - sc.off];
      const W = (pt: Pt) => toWorld(pt, sc.dir);
      // the net or the rim answers a shot as it lands, and a moment after
      const fx = b.fx && u > 0.72 ? { kind: b.fx, p: (u - 0.72) / 0.28 } : a.fx && u < 0.5 && play.i > 1 ? { kind: a.fx, p: 1 + u / 0.5 } : null;
      if (fx && !calm) drawRimFx(ctx, view, W(BASKET), fx.kind, fx.p, paints);
      // where a shot was taken from, once it lands: the mark the break's chart will keep (a dot, a
      // cross), on the boards under the players
      if (b.fx && b.ballZ) shot = { sc, at: W(a.ball), made: b.fx === 'make' };
      if (shot && shot.sc === sc && !(b.fx && u < 0.72)) drawShotMark(ctx, view, shot.at, kitO, shot.made, b.fx ? (u - 0.72) / 0.2 : 1, paints);
      // defense first (under), then offense; the man with the ball last, ringed and named
      const hold = u >= 0.5 ? b.hold : a.hold;
      const nO = sc.oPids.length;
      const dW = play.d.map(W);
      const oW = play.o.map(W);
      sc.dPids.forEach((pid, j) => drawPlayer(ctx, view, dW[j], kitD, p.jersey(pid), hold === nO + j, !!p.hot?.has(pid), paints));
      sc.oPids.forEach((pid, j) => drawPlayer(ctx, view, oW[j], kitO, p.jersey(pid), hold === j, !!p.hot?.has(pid), paints));
      if (p.names && hold !== undefined && hold >= 0) {
        const pid = hold < nO ? sc.oPids[hold] : sc.dPids[hold - nO];
        const at = hold < nO ? oW[hold] : dW[hold - nO];
        if (pid !== undefined && at) drawTag(ctx, view, at, p.names(pid), paints);
      }
      // the ball: carried, it goes where its man goes; passed, it lifts a little; shot, it climbs with the distance
      const from = W(a.ball);
      const to = W(b.ball);
      let bw = W(play.ball);
      // (in a man's hands it's held out toward the basket he's going at, off his number)
      if (play.carried) {
        const rim = W(BASKET);
        const away = Math.hypot(rim.x - bw.x, rim.y - bw.y) || 1;
        const reach = (bodyR(view.k) * 0.95) / view.k;
        bw = { x: bw.x + ((rim.x - bw.x) / away) * reach, y: bw.y + ((rim.y - bw.y) / away) * reach };
      }
      const travel = Math.hypot(to.x - from.x, to.y - from.y);
      const peak = b.ballZ ?? (play.carried || travel < 3 ? 0 : Math.min(2.2, travel * 0.07));
      const z = peak ? Math.sin(Math.PI * u) * peak : 0;
      if (b.ballZ && !calm && u > 0 && u < 1) drawTrail(ctx, view, from, to, u, b.ballZ, paints);
      // a pass: a line behind the ball from the hands it left, gone as it's caught
      else if (!b.ballZ && !play.carried && travel >= 6 && !calm && u > 0.04 && u < 1) drawPass(ctx, view, from, bw, u, paints);
      drawBall(ctx, view, bw, z, calm ? 0 : (t / 90 + travel * u * 0.9) % (Math.PI * 2), paints);
      // the play's label: it fades in and out, or just shows (reduced motion)
      const fl = (u > 0.35 ? b.flash : undefined) ?? (u <= 0.35 ? a.flash : undefined);
      if (fl) {
        const alpha = calm ? 1 : fl === b.flash ? Math.min(1, (u - 0.35) / 0.25) : 1 - u / 0.35;
        drawFlash(ctx, view, W({ x: fl.x, y: fl.y }), fl.text, fl.kind, alpha, paints);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // (its shape comes from the layout: --court-ar, upright by default; see live/styles/page.css)
  return (
    <canvas ref={ref} className="court-cv" role="img" aria-label={label} style={{ width: '100%', aspectRatio: 'var(--court-ar, 1.3)', display: 'block', touchAction: 'pan-y' }} />
  );
}

/** Where a possession is at time `t`: the two frames it's between, everyone's spot (in the offense's frame), the clock and the score reached. */
export interface Pose {
  i: number;
  /** Time into the move toward `b`, and its length (ms): past its end on the last frame, the time goes on counting. */
  ms: number;
  dur: number;
  a: Frame;
  b: Frame;
  /** The move's time, eased: it times the ball, the labels and the rim. */
  u: number;
  o: Pt[];
  d: Pt[];
  ball: Pt;
  /** The ball is in one man's hands through this move. */
  carried: boolean;
  beat: number;
  clock: number;
  score: [number, number] | null;
  total: number;
}

export function pose(sc: Script, t: number, calm: boolean): Pose {
  const f = sc.frames;
  let acc = 0;
  let i = 1;
  for (; i < f.length; i++) {
    if (t < acc + f[i].dur) break;
    acc += f[i].dur;
  }
  let total = 0;
  for (const fr of f) total += fr.dur;
  const end = i >= f.length;
  const a = end ? f[f.length - 1] : f[i - 1];
  const b = end ? a : f[i];
  // (the players' paths run on the move's own time; the ball and the labels on it eased)
  const lu = end || !b.dur ? 1 : Math.min(1, (t - acc) / b.dur);
  const u = calm ? lu : ease(lu);
  const bi = Math.min(i, f.length - 1);
  const tan = tangentsOf(sc);
  const nO = sc.oPids.length;
  const path = (pa: Pt, pb: Pt, j: number) => (lu >= 1 ? pb : hermite(pa, pb, tan[bi - 1]?.[j] ?? ZERO, tan[bi]?.[j] ?? ZERO, lu, b.dur));
  const o = sc.oPids.map((_, j) => path(a.o[j], b.o[j], j));
  const d = sc.dPids.map((_, j) => path(a.d[j], b.d[j], nO + j));
  const carrier = a.hold !== undefined && a.hold >= 0 && a.hold === b.hold ? (a.hold < nO ? o[a.hold] : d[a.hold - nO]) : undefined;
  let score: [number, number] | null = null;
  for (let j = 0; j < i + (u >= 1 ? 1 : 0) && j < f.length; j++) if (f[j].score) score = f[j].score!;
  return {
    i,
    ms: end ? a.dur + (t - total) : t - acc,
    dur: b.dur,
    a,
    b,
    u,
    o,
    d,
    ball: carrier ?? lerpPt(a.ball, b.ball, u),
    carried: !!carrier,
    beat: Math.min(f.length - 1, u >= 1 ? i : i - 1),
    clock: lerp(sc.clockStart, sc.clockEnd, Math.min(1, t / Math.max(1, total))),
    score,
    total,
  };
}

/** Both fives around the center circle for the opening tip: the two jumpers in it, the home team on the side it defends. */
function tipOff([home, away]: [number[], number[]]): Stander[] {
  const mid = COURT_LEN / 2;
  const ring: Pt[] = [
    { x: 0, y: 1.7 },
    { x: -8.5, y: 3.5 },
    { x: 8.5, y: 3.5 },
    { x: -5, y: 12 },
    { x: 5, y: 12 },
  ];
  // (the tallest is listed last in neither five for sure: whoever is fifth jumps, as good a guess as any)
  const five = (pids: number[], side: 0 | 1, sign: 1 | -1): Stander[] =>
    [...pids].reverse().map((pid, i) => ({ pid, side, at: { x: ring[i % 5].x, y: mid + sign * ring[i % 5].y } }));
  return [...five(home, 0, 1), ...five(away, 1, -1)];
}

/** A small, steady hash: each board and joint of the floor sits in the same place on every paint. */
const grain = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The floor, painted once at the canvas's size: maple boards along its length, the darker apron,
 * the home team's paint in both keys and the center circle, the lines, the baskets, its mark at
 * center court. Flat, as a broadcast graphic draws it (no lighting, no gloss).
 */
export function paintFloor(cv: HTMLCanvasElement, view: View, dpr: number, floor: CourtFloor | undefined, paints: Paints) {
  const { k, wide } = view;
  cv.width = Math.max(1, Math.round((wide ? FLOOR_L : FLOOR_W) * k * dpr));
  cv.height = Math.max(1, Math.round((wide ? FLOOR_W : FLOOR_L) * k * dpr));
  const ctx = cv.getContext('2d')!;
  // everything below is drawn in feet, on the court itself (x across, y along): the view turns it
  const s = k * dpr;
  if (wide) ctx.setTransform(0, -s, s, 0, END * s, (HALF_W + SIDE) * s);
  else ctx.setTransform(s, 0, 0, s, (HALF_W + SIDE) * s, END * s);
  const px = (n: number) => n / k;
  // a neutral floor (the Cup final): the paint in ink, a gold pinstripe
  const home = floor?.kind === 'home' ? floor : null;
  const paint = home?.paint ?? paints.ink;
  const trim = home?.trim ?? '#c9a24a';

  // boards along the court's length, each a shade apart, their joints staggered
  ctx.fillStyle = paints.wood;
  ctx.fillRect(-HALF_W - SIDE, -END, FLOOR_W, FLOOR_L);
  const board = 1.15;
  for (let i = 0, x = -HALF_W - SIDE; x < HALF_W + SIDE; i++, x += board) {
    const r = grain(i);
    ctx.globalAlpha = r > 0.5 ? (r - 0.5) * 0.5 : (0.5 - r) * 0.9;
    ctx.fillStyle = r > 0.5 ? '#fff6e4' : paints.wood2;
    ctx.fillRect(x, -END, board, FLOOR_L);
    ctx.globalAlpha = 1;
    ctx.fillStyle = paints.seam;
    ctx.fillRect(x, -END, px(1), FLOOR_L);
    for (let y = -END - grain(i + 99) * 11; y < COURT_LEN + END; y += 11) ctx.fillRect(x, y, board, px(1));
  }
  // the apron: stained darker all round, a pinstripe in the trim where it meets the court
  ctx.fillStyle = 'rgba(96, 54, 16, 0.42)';
  ctx.beginPath();
  ctx.rect(-HALF_W - SIDE, -END, FLOOR_W, FLOOR_L);
  ctx.rect(-HALF_W, 0, 2 * HALF_W, COURT_LEN);
  ctx.fill('evenodd');
  ctx.strokeStyle = trim;
  ctx.lineWidth = Math.max(px(1.5), 0.18);
  ctx.strokeRect(-HALF_W - 0.45, -0.45, 2 * HALF_W + 0.9, COURT_LEN + 0.9);

  // the paint: both keys and the center circle, solid in the home team's colour
  ctx.fillStyle = paint;
  ctx.fillRect(-8, 0, 16, 19);
  ctx.fillRect(-8, COURT_LEN - 19, 16, 19);
  ctx.beginPath();
  ctx.arc(0, COURT_LEN / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // the lines
  ctx.strokeStyle = paints.line;
  ctx.fillStyle = paints.line;
  const line = Math.max(px(1.5), 0.19);
  const thin = Math.max(px(1), 0.14);
  ctx.lineWidth = line;
  ctx.lineJoin = 'miter';
  ctx.strokeRect(-HALF_W, 0, 2 * HALF_W, COURT_LEN);
  ctx.beginPath();
  ctx.moveTo(-HALF_W, COURT_LEN / 2);
  ctx.lineTo(HALF_W, COURT_LEN / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, COURT_LEN / 2, 6, 0, Math.PI * 2);
  ctx.stroke();
  // each end the same, turned about center court
  for (const turn of [0, 1]) {
    ctx.save();
    if (turn) {
      ctx.translate(0, COURT_LEN);
      ctx.scale(-1, -1);
    }
    ctx.lineWidth = line;
    ctx.strokeStyle = paints.line;
    ctx.strokeRect(-8, 0, 16, 19);
    // the free-throw circle: solid away from the basket, dashed inside the lane
    ctx.beginPath();
    ctx.arc(0, 19, 6, 0, Math.PI);
    ctx.stroke();
    ctx.lineWidth = thin;
    ctx.setLineDash([0.9, 0.9]);
    ctx.beginPath();
    ctx.arc(0, 19, 6, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // the three-point line: straight in the corners, the arc above them
    ctx.lineWidth = line;
    const arcR = 23.75;
    const cornerY = BASKET.y + Math.sqrt(arcR * arcR - 22 * 22);
    const ang = Math.atan2(cornerY - BASKET.y, -22);
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-22, cornerY);
    ctx.arc(0, BASKET.y, arcR, ang, Math.PI - ang, true);
    ctx.lineTo(22, 0);
    ctx.stroke();
    // the restricted area, the lane's hash marks and blocks
    ctx.beginPath();
    ctx.arc(0, BASKET.y, 4, 0, Math.PI);
    ctx.stroke();
    ctx.lineWidth = thin;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      for (const hy of [7, 11, 14, 17]) {
        ctx.moveTo(side * 8, hy);
        ctx.lineTo(side * 8.7, hy);
      }
    }
    ctx.stroke();
    for (const side of [-1, 1]) ctx.fillRect(side > 0 ? 8 : -8.7, 7.6, 0.7, 1);
    // the backboard, the rim and its net (seen from above: a ring inside the ring)
    ctx.strokeStyle = paints.line;
    ctx.lineWidth = Math.max(px(2), 0.3);
    ctx.beginPath();
    ctx.moveTo(-3, 4);
    ctx.lineTo(3, 4);
    ctx.stroke();
    ctx.lineWidth = Math.max(px(1), 0.1);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(0, BASKET.y, 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = paints.rim;
    ctx.lineWidth = Math.max(px(2), 0.22);
    ctx.beginPath();
    ctx.arc(0, BASKET.y, 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // the lettering and the mark are drawn upright on the screen, whichever way the floor is turned
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const at = (p: Pt) => project({ ...view, top: -END, ox: 0, oy: 0 }, p);
  const name = floor?.name ?? '';
  const size = END * k * 0.56;
  if (name && size >= TEXT_MIN - 1) {
    setFont(ctx, 820, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = paints.line;
    for (const y of [-END / 2 - 0.25, COURT_LEN + END / 2 + 0.25]) {
      const p = at({ x: 0, y });
      ctx.save();
      ctx.translate(p.x, p.y);
      // (sideways, it runs up the baseline it's painted along)
      if (wide) ctx.rotate(-Math.PI / 2);
      ctx.fillText(name, 0, 0.5);
      ctx.restore();
    }
  }
  const c = at({ x: 0, y: COURT_LEN / 2 });
  if (home) drawMark(ctx, c.x, c.y, 8.6 * k, home);
  else drawNeutralMark(ctx, c.x, c.y, 4.3 * k, trim, paint);
}

/** The team's mark as TeamLogo draws it (its shape in its colours, the abbreviation inside), `size` across. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, f: Extract<CourtFloor, { kind: 'home' }>) {
  const [c1, c2, c3] = f.colors;
  const ring = c2.toLowerCase() === c1.toLowerCase() ? c3 : c2;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  // (TeamLogo's shapes, in its 100-unit square)
  const shape = new Path2D();
  switch (f.mark) {
    case 'shield':
      shape.addPath(new Path2D('M50 4 L92 16 L88 58 Q84 82 50 96 Q16 82 12 58 L8 16 Z'));
      break;
    case 'hex':
      shape.addPath(new Path2D('M50 4 L91 27 L91 73 L50 96 L9 73 L9 27 Z'));
      break;
    case 'diamond':
      shape.addPath(new Path2D('M50 3.3 L96.7 50 L50 96.7 L3.3 50 Z'));
      break;
    case 'round-square':
      shape.addPath(new Path2D('M31 7 H69 A24 24 0 0 1 93 31 V69 A24 24 0 0 1 69 93 H31 A24 24 0 0 1 7 69 V31 A24 24 0 0 1 31 7 Z'));
      break;
    default:
      shape.arc(50, 50, 44, 0, Math.PI * 2);
  }
  ctx.fillStyle = c1;
  ctx.fill(shape);
  ctx.lineWidth = 6;
  ctx.strokeStyle = ring;
  ctx.stroke(shape);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 62);
  ctx.quadraticCurveTo(50, 40, 78, 62);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const text = f.abbrev.slice(0, 3);
  setFont(ctx, 760, text.length === 3 ? 30 : 36);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = inkOn(c1);
  ctx.fillText(text, 50, 58);
  ctx.restore();
}

/** A neutral floor's center: a disc with a star. */
function drawNeutralMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, trim: string, fill: string) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = trim;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = trim;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.26 : r * 0.62;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** A player's disc on screen: never smaller than a fingertip reads. */
const bodyR = (k: number) => Math.max(BODY * k, 7.5);

/**
 * A player: his team's disc, ringed, his number on it. The home team wears white trimmed in its
 * colour, the visitors their colour solid, so the two never look alike. The man with the ball gets a
 * second, bright ring; a hot shooter a ring in the warning colour.
 */
function drawPlayer(ctx: CanvasRenderingContext2D, view: View, at: Pt, kit: MatchKit, num: string, ball: boolean, hot: boolean, paints: Paints) {
  const { x, y } = project(view, at);
  const k = view.k;
  const r = bodyR(k);
  const ring = Math.max(2, k * 0.32);
  // his shadow on the boards
  ctx.fillStyle = 'rgba(40, 20, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.12, y + r * 0.22, r * 1.02, r * 0.96, 0, 0, Math.PI * 2);
  ctx.fill();
  if (hot || ball) {
    // (edged in ink so the ring reads on the maple and the paint alike)
    const hr = r + ring + Math.max(2, k * 0.3);
    ctx.strokeStyle = paints.ink;
    ctx.lineWidth = Math.max(3.5, k * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hot ? paints.warn : paints.line;
    ctx.lineWidth = Math.max(2, k * 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = kit.token.fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = kit.token.ring;
  ctx.lineWidth = ring;
  ctx.beginPath();
  ctx.arc(x, y, r - ring / 2, 0, Math.PI * 2);
  ctx.stroke();
  // an ink hairline around him: a white disc still reads on the maple, a dark one on the paint
  ctx.strokeStyle = 'rgba(18, 18, 18, 0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.5, 0, Math.PI * 2);
  ctx.stroke();
  // his number, when the disc has room for one that reads
  const size = Math.max(TEXT_MIN, r * 1.02);
  if (r < 9.5) return;
  ctx.fillStyle = kit.token.num;
  setFont(ctx, 800, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, x, y + 0.5);
}

/** The ball `z` feet up: its shadow stays on the floor and shrinks as it rises; it turns by `spin`. */
function drawBall(ctx: CanvasRenderingContext2D, view: View, at: Pt, z: number, spin: number, paints: Paints) {
  const p = project(view, at);
  const k = view.k;
  const shade = 1 / (1 + z * 0.12);
  const base = Math.max(0.62 * k, 4);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * shade})`;
  ctx.beginPath();
  ctx.ellipse(p.x + 1.5, p.y + 2, base * shade, base * 0.7 * shade, 0, 0, Math.PI * 2);
  ctx.fill();
  const x = p.x;
  const y = p.y - z * k;
  const r = base * (1 + z * 0.045);
  ctx.fillStyle = paints.ball;
  ctx.strokeStyle = paints.ballSeam;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(0.6, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 1.25, 0, r * 0.95, -0.9, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.9, Math.PI + 0.9);
  ctx.stroke();
  ctx.restore();
}

/** A shot's flight so far (u: how far along), a dotted arc behind the ball. */
function drawTrail(ctx: CanvasRenderingContext2D, view: View, from: Pt, to: Pt, u: number, peak: number, paints: Paints) {
  ctx.fillStyle = paints.ballSeam;
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const v = (u * i) / (n + 1);
    const p = project(view, lerpPt(from, to, v));
    ctx.globalAlpha = 0.08 + (0.34 * i) / n;
    ctx.beginPath();
    ctx.arc(p.x, p.y - Math.sin(Math.PI * v) * peak * view.k, 0.16 * view.k + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A pass in the air: a line from where it was thrown to the ball, fading toward the thrower and gone as it arrives. */
function drawPass(ctx: CanvasRenderingContext2D, view: View, from: Pt, ball: Pt, u: number, paints: Paints) {
  const a = project(view, from);
  const b = project(view, ball);
  // (the tail follows the ball: it never trails more than a few feet)
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const keep = Math.min(len, 9 * view.k);
  if (len < 2) return;
  const tx = b.x - ((b.x - a.x) / len) * keep;
  const ty = b.y - ((b.y - a.y) / len) * keep;
  const g = ctx.createLinearGradient(tx, ty, b.x, b.y);
  g.addColorStop(0, 'rgba(255, 255, 255, 0)');
  g.addColorStop(1, paints.line);
  ctx.globalAlpha = 0.7 * Math.min(1, (1 - u) / 0.25);
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1.5, view.k * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

/** Where a shot was taken from, as the break's chart marks it: a dot in the team's colour for a make, a cross for a miss, both edged in white. */
function drawShotMark(ctx: CanvasRenderingContext2D, view: View, at: Pt, kit: MatchKit, made: boolean, alpha: number, paints: Paints) {
  const p = project(view, at);
  const r = Math.max(0.6 * view.k, 3);
  ctx.globalAlpha = clamp(alpha, 0, 1) * 0.9;
  ctx.beginPath();
  if (made) {
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = kit.color;
    ctx.fill();
    ctx.strokeStyle = paints.line;
    ctx.lineWidth = Math.max(1.5, r * 0.3);
    ctx.stroke();
  } else {
    const a = r * 0.8;
    ctx.lineCap = 'round';
    ctx.moveTo(p.x - a, p.y - a);
    ctx.lineTo(p.x + a, p.y + a);
    ctx.moveTo(p.x + a, p.y - a);
    ctx.lineTo(p.x - a, p.y + a);
    ctx.strokeStyle = paints.line;
    ctx.lineWidth = Math.max(4, r * 0.95);
    ctx.stroke();
    ctx.strokeStyle = kit.color;
    ctx.lineWidth = Math.max(2, r * 0.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  ctx.globalAlpha = 1;
}

/** A made shot sends a ring out from the net; a miss rattles the rim. `p` runs 0..2 over the landing and the moment after. */
function drawRimFx(ctx: CanvasRenderingContext2D, view: View, basket: Pt, kind: 'make' | 'miss', p: number, paints: Paints) {
  const { x, y } = project(view, basket);
  const k = view.k;
  const t = Math.min(1, p / 2);
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.lineWidth = Math.max(1.5, k * 0.18);
  if (kind === 'make') {
    ctx.strokeStyle = paints.line;
    for (const lag of [0, 0.35]) {
      const tt = Math.max(0, t - lag);
      if (!tt) continue;
      ctx.beginPath();
      ctx.arc(x, y, (0.8 + tt * 2.6) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    // the net snaps: the rim itself shows white for the moment the ball drops through
    ctx.globalAlpha = Math.max(0, 1 - t * 2.2);
    ctx.lineWidth = Math.max(2.5, k * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, 0.75 * k, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = paints.rim;
    const j = Math.sin(p * Math.PI * 6) * 0.25 * k;
    ctx.beginPath();
    ctx.arc(x + j, y, 0.95 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** An ink pill with a word on it, centered at (x, y) but kept whole inside the canvas. */
function pill(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, text: string, px: number, color: string, paints: Paints, weight = 800) {
  setFont(ctx, weight, px, 'semi-condensed');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + px * 1.1;
  const h = px * 1.55;
  const cx = clamp(x, w / 2 + 4, view.w - w / 2 - 4);
  const cy = clamp(y, h / 2 + 4, view.h - h / 2 - 4);
  ctx.fillStyle = paints.ink;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  else ctx.rect(cx - w / 2, cy - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy + 0.5);
}

/** The ball handler's name, in a small tag under his disc. */
function drawTag(ctx: CanvasRenderingContext2D, view: View, at: Pt, name: string, paints: Paints) {
  if (!name) return;
  const p = project(view, at);
  const px = Math.max(TEXT_MIN, view.k * 1.3);
  pill(ctx, view, p.x, p.y + bodyR(view.k) + Math.max(4, view.k * 0.5) + px * 0.95, name, px, paints.line, paints, 700);
}

/** A play's label on the floor ("+3", "Blocked", "Foul"): an ink pill, the word in its signal's colour. */
function drawFlash(ctx: CanvasRenderingContext2D, view: View, at: Pt, text: string, kind: string, alpha: number, paints: Paints) {
  const p = project(view, at);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const color = kind === 'make' ? paints.good : kind === 'block' || kind === 'to' ? paints.bad : kind === 'foul' ? paints.warn : paints.line;
  pill(ctx, view, p.x, p.y, text, Math.max(14, view.k * 2.1), color, paints);
  ctx.globalAlpha = 1;
}

/**
 * The shot chart a break shows on the floor: each team's shots at the end it attacks first (upright,
 * both at the one end in view), a made
 * one a dot in its colour and a miss a cross in it, both edged in white, with its count beside center
 * court. (Told apart by shape, not by which is filled: on a key painted the team's own colour a
 * filled dot reads as a ring and a white one as the solid mark.)
 */
function drawChart(ctx: CanvasRenderingContext2D, view: View, shots: ShotRecord[], kits: [MatchKit, MatchKit], abbrevs: [string, string] | undefined, paints: Paints) {
  const k = view.k;
  const r = Math.max(0.85 * k, 3.5);
  // (upright, the window shows one end: both teams' shots go on it, told apart by colour)
  const dirOf = (t: 0 | 1) => (t === 0 || !view.wide ? 1 : -1) as 1 | -1;
  // misses under makes: a make is a dot in the team's colour, a miss a cross in it
  ctx.lineCap = 'round';
  for (const made of [false, true]) {
    for (const sh of shots) {
      if (sh.made !== made) continue;
      const p = project(view, toWorld({ x: sh.x, y: sh.y }, dirOf(sh.t)));
      const kit = kits[sh.t];
      ctx.beginPath();
      if (made) {
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = kit.color;
        ctx.fill();
        ctx.strokeStyle = paints.line;
        ctx.lineWidth = Math.max(1.5, r * 0.3);
        ctx.stroke();
        continue;
      }
      const a = r * 0.8;
      ctx.moveTo(p.x - a, p.y - a);
      ctx.lineTo(p.x + a, p.y + a);
      ctx.moveTo(p.x + a, p.y - a);
      ctx.lineTo(p.x - a, p.y + a);
      // (white under the colour: the cross keeps its edge on any paint)
      ctx.strokeStyle = paints.line;
      ctx.lineWidth = Math.max(4, r * 0.95);
      ctx.stroke();
      ctx.strokeStyle = kit.color;
      ctx.lineWidth = Math.max(2, r * 0.5);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  // each team's count, on its half's sideline beside center court (clear of the arc and the mark)
  for (const t of [0, 1] as const) {
    const mine = shots.filter((s) => s.t === t);
    if (!mine.length) continue;
    const made = mine.filter((s) => s.made).length;
    const p = project(view, view.wide ? toWorld({ x: 21 * dirOf(t), y: 37 }, dirOf(t)) : { x: t === 0 ? -13 : 13, y: 36 });
    pill(ctx, view, p.x, p.y, `${abbrevs?.[t] ?? (t === 0 ? 'Home' : 'Away')} ${made} of ${mine.length}`, Math.max(TEXT_MIN, Math.min(15, k * 2.6)), paints.line, paints, 700);
  }
}

/** Clutch time: the building's lights come down around the floor. */
function drawLights(ctx: CanvasRenderingContext2D, view: View) {
  const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.42, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.78);
  g.addColorStop(0, 'rgba(8, 6, 4, 0)');
  g.addColorStop(1, 'rgba(8, 6, 4, 0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
}
