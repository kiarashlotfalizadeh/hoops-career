import { useEffect, useRef } from 'react';
import type { Frame, Pt, Script } from './choreo';
import type { Team } from '../../core/types';
import { FRANCHISES, type FranchiseDef } from '../../core/teams';
import { inkOn, teamLook } from '../teamColors';

/**
 * The floor the game is played on: maple, with the home team's colours painted in the key and the
 * center circle (its mark there, its name behind the basket), or a neutral one (the Cup final).
 */
export type CourtFloor = { kind: 'home'; abbrev: string; name: string; colors: [string, string, string]; mark: FranchiseDef['mark'] } | { kind: 'neutral'; name: string };

/** The floor of a game at `home`'s arena, or a neutral one; `neutralName` goes behind the basket there. */
export function courtFloor(home: Pick<Team, 'tid' | 'abbrev' | 'name' | 'colors'>, neutral: boolean, neutralName = ''): CourtFloor {
  if (neutral) return { kind: 'neutral', name: neutralName };
  return { kind: 'home', abbrev: home.abbrev, name: home.name, colors: home.colors, mark: FRANCHISES[home.tid]?.mark ?? 'circle' };
}

export interface CourtProps {
  script: Script | null;
  speed: number; // 1 = normal
  paused: boolean;
  colors: [[string, string], [string, string]]; // [home [fill, stroke], away]
  jersey: (pid: number) => string;
  onDone: () => void;
  onTick?: (clock: number, score: [number, number] | null) => void;
  /** The last frame the court has reached, as it changes (the Live screen's captions follow it). */
  onBeat?: (frame: number) => void;
  /** The ball handler's name tag (none without it). */
  names?: (pid: number) => string;
  /** [home, away]: the team with the ball is named along the baseline it attacks. */
  abbrevs?: [string, string];
  /** Whose floor it is (a plain neutral floor without it). */
  floor?: CourtFloor;
  /** Players on a hot streak: they wear a heat ring. */
  hot?: ReadonlySet<number>;
  /** What the court shows, for screen readers. */
  label: string;
}

const W_FT = 50;
const H_FT = 47;
/** The apron around the half court: a band along each sideline, and a deeper one behind the baseline for the scoreboards. */
const SIDE = 1.6;
const TOP = 2.4;
/** The canvas in feet, apron included: the Live screen's layouts size the court by this ratio (live.css). */
const FLOOR_W = W_FT + 2 * SIDE;
const FLOOR_H = H_FT + TOP;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** How long a new possession's opening frame takes to dissolve in over the last one's (ms, at 1×): a broadcast's cut. */
const CUT_MS = 200;

/** Each player's velocity (feet a ms) as he passes through each frame of a script: [frame][offense..., defense...]. */
type Tangents = Pt[][];
const ZERO: Pt = { x: 0, y: 0 };
const tangentCache = new WeakMap<Script, Tangents>();

/**
 * The velocity a player carries through a frame, so a run through several frames is one smooth move
 * instead of a stop at each (the frames are a few hundred ms apart). He stops at a frame where he
 * stands still on either side of it, turns back, or the move is a cut (no time to get there); a turn
 * slows him, and he's never faster through a frame than on the slower of the moves either side of it
 * (no overshoot).
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
      const va = { x: ax / dtA, y: ay / dtA };
      const vb = { x: bx / dtB, y: by / dtB };
      const m = { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 };
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

export function Court({ script, speed, paused, colors, jersey, onDone, onTick, onBeat, names, abbrevs, floor, hot, label }: CourtProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ t: 0, last: 0, script: null as Script | null, done: false, score: null as [number, number] | null, beat: -1 });
  const props = useRef({ speed, paused, colors, jersey, onDone, onTick, onBeat, names, abbrevs, floor, hot });
  props.current = { speed, paused, colors, jersey, onDone, onTick, onBeat, names, abbrevs, floor, hot };

  // each possession is drawn from its start
  useEffect(() => {
    state.current = { t: 0, last: 0, script, done: false, score: null, beat: -1 };
  }, [script]);

  useEffect(() => {
    let raf = 0;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let drawn = '';
    let lastScript: typeof state.current.script | undefined;
    // the floor, its lines and its marks never change: drawn once per canvas size, then copied each frame
    const floor = document.createElement('canvas');
    let floorKey = '';
    let floorWas: CourtFloor | undefined;
    let floorId = '';
    // the floor's lettering waits for the font: drawn again once it's in
    let fontsIn = 0;
    document.fonts?.ready.then(() => void (fontsIn = 1));
    // reduced motion: players and the ball jump from spot to spot instead of gliding, and nothing flashes over the court
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    // a new possession (or the court clearing for a break) dissolves in over the last frame of the one before
    const cut = document.createElement('canvas');
    let cutAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = (cssW * FLOOR_H) / FLOOR_W;
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = `${cssH}px`;
      }
      const dt = s.last ? Math.min(100, now - s.last) : 0;
      s.last = now;
      if (!props.current.paused && !s.done) s.t += dt * props.current.speed;
      const fl = props.current.floor;
      if (fl !== floorWas) {
        floorWas = fl;
        floorId = fl ? JSON.stringify(fl) : '';
      }
      const key = `${canvas.width}x${canvas.height}|${fontsIn}|${floorId}`;
      // paused, finished or waiting for the next possession: nothing moved, so skip the redraw (battery)
      const cutting = cutAt > 0 && now - cutAt < CUT_MS;
      const sig = `${key}|${s.t}|${s.done}|${cutting ? now : ''}`;
      if (sig === drawn && s.script === lastScript) return;
      drawn = sig;
      if (s.script !== lastScript && lastScript !== undefined && !still?.matches && canvas.width && canvas.height) {
        // (what's on the canvas now is the last frame of the possession before)
        cut.width = canvas.width;
        cut.height = canvas.height;
        cut.getContext('2d')!.drawImage(canvas, 0, 0);
        cutAt = now;
      }
      lastScript = s.script;
      const k = cssW / FLOOR_W;
      if (key !== floorKey) {
        floorKey = key;
        floor.width = canvas.width;
        floor.height = canvas.height;
        const fctx = floor.getContext('2d')!;
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawFloor(fctx, cssW, cssH, k, fl);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // (a hidden, zero-size canvas can't be copied, but the possession still has to play out)
      if (floor.width && floor.height) ctx.drawImage(floor, 0, 0);
      // everything on the floor is placed in court feet, from the corner where the baseline meets the left sideline
      ctx.setTransform(dpr, 0, 0, dpr, SIDE * k * dpr, TOP * k * dpr);
      const sc = s.script;
      if (sc && sc.frames.length > 0) drawScript(sc);
      const p = cutAt ? (now - cutAt) / CUT_MS : 1;
      if (p < 1 && cut.width === canvas.width) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - ease(Math.max(0, p));
        ctx.drawImage(cut, 0, 0);
        ctx.globalAlpha = 1;
      }
    };
    const drawScript = (sc: Script) => {
      const s = state.current;
      const k = canvas.clientWidth / FLOOR_W;
      // locate segment
      let acc = 0;
      let i = 1;
      for (; i < sc.frames.length; i++) {
        if (s.t < acc + sc.frames[i].dur) break;
        acc += sc.frames[i].dur;
      }
      const total = sc.frames.reduce((a, f) => a + f.dur, 0);
      let a: Frame;
      let b: Frame;
      let u: number;
      // (the move's time, linear: the players' paths run on it; `u`, eased, times the ball, the flashes and the rim)
      let lu: number;
      if (i >= sc.frames.length) {
        a = b = sc.frames[sc.frames.length - 1];
        u = lu = 1;
      } else {
        a = sc.frames[i - 1];
        b = sc.frames[i];
        lu = b.dur && !still?.matches ? Math.min(1, (s.t - acc) / b.dur) : 1;
        u = ease(lu);
      }
      // score/clock callbacks
      const reached = sc.frames.slice(0, i + (u >= 1 ? 1 : 0)).filter((f) => f.score);
      const lastScore = reached.length ? reached[reached.length - 1].score! : null;
      const clock = lerp(sc.clockStart, sc.clockEnd, Math.min(1, s.t / Math.max(1, total)));
      props.current.onTick?.(clock, lastScore);
      const beat = Math.min(sc.frames.length - 1, u >= 1 ? i : i - 1);
      if (beat !== s.beat) {
        s.beat = beat;
        props.current.onBeat?.(beat);
      }
      const offColors = props.current.colors[sc.off];
      const defColors = props.current.colors[1 - sc.off];
      // the team with the ball, on the boards behind the baseline it attacks
      const ab = props.current.abbrevs;
      if (ab) drawBaseline(ctx, k, ab[sc.off], offColors);
      const calm = !!still?.matches;
      // the net or the rim answers a shot as it lands, and a moment after
      const fx = b.fx && u > 0.72 ? { kind: b.fx, p: (u - 0.72) / 0.28 } : a.fx && u < 0.5 && i > 1 ? { kind: a.fx, p: 1 + u / 0.5 } : null;
      // the net under the rim, swaying on a make
      drawNet(ctx, k, !calm && fx?.kind === 'make' ? fx.p : 0);
      if (fx && !calm) drawRim(ctx, k, fx.kind, fx.p);
      // defense first (under), then offense; a hot shooter in a ring of the warning colour
      const hold = u >= 0.5 ? b.hold : a.hold;
      const hotSet = props.current.hot;
      // each player along a smooth path through the frames (see tangentsOf); reduced motion: from spot to spot
      const bi = Math.min(i, sc.frames.length - 1);
      const tan = tangentsOf(sc);
      const nO = sc.oPids.length;
      const path = (pa: Pt, pb: Pt, j: number) => (lu >= 1 || calm ? pb : hermite(pa, pb, tan[bi - 1]?.[j] ?? ZERO, tan[bi]?.[j] ?? ZERO, lu, b.dur));
      const dAt = sc.dPids.map((_, j) => path(a.d[j], b.d[j], nO + j));
      const oAt = sc.oPids.map((_, j) => path(a.o[j], b.o[j], j));
      sc.dPids.forEach((pid, j) => drawPlayer(ctx, k, dAt[j], defColors, props.current.jersey(pid), false, !!hotSet?.has(pid)));
      sc.oPids.forEach((pid, j) => drawPlayer(ctx, k, oAt[j], offColors, props.current.jersey(pid), true, !!hotSet?.has(pid)));
      // the ball handler's name, under him (whoever has it at the end of this move, once he does)
      const nm = props.current.names;
      if (nm && hold !== undefined && hold >= 0) {
        const off = hold < sc.oPids.length;
        const pid = off ? sc.oPids[hold] : sc.dPids[hold - sc.oPids.length];
        const at = off ? oAt[hold] : dAt[hold - sc.oPids.length];
        if (pid !== undefined && at) drawTag(ctx, k, at, nm(pid));
      }
      // ball: its shadow stays on the floor and shrinks as it rises; it spins as it travels
      // (in one man's hands from frame to frame, it goes where he goes)
      const carried = a.hold !== undefined && a.hold >= 0 && a.hold === b.hold ? (a.hold < nO ? oAt[a.hold] : dAt[a.hold - nO]) : undefined;
      const bp = carried ?? lerpPt(a.ball, b.ball, u);
      const z = b.ballZ ? Math.sin(Math.PI * u) * 7 : 0;
      // a shot's flight leaves a faint trail behind the ball
      if (b.ballZ && !calm && u > 0 && u < 1) drawTrail(ctx, k, a.ball, b.ball, u);
      const shadow = 1 / (1 + z * 0.12);
      ctx.fillStyle = `rgba(0,0,0,${0.42 * shadow})`;
      ctx.beginPath();
      ctx.ellipse(bp.x * k + (W_FT / 2) * k + 2, bp.y * k + 2, 0.6 * k * shadow, 0.42 * k * shadow, 0, 0, Math.PI * 2);
      ctx.fill();
      const travel = Math.hypot(b.ball.x - a.ball.x, b.ball.y - a.ball.y);
      drawBall(ctx, bp.x * k + (W_FT / 2) * k, (bp.y - z) * k, (0.62 + z * 0.04) * k, calm ? 0 : (s.t / 90 + travel * u * 0.9) % (Math.PI * 2));
      // flash
      const fl = (u > 0.35 ? b.flash : undefined) ?? (u <= 0.35 ? a.flash : undefined);
      if (fl && !still?.matches) {
        const alpha = fl === b.flash ? Math.min(1, (u - 0.35) / 0.25) : 1 - u / 0.35;
        drawFlash(ctx, k, fl.text, fl.kind, fl.x, fl.y, alpha);
      }
      if (s.t >= total + 220 && !s.done) {
        s.done = true;
        props.current.onDone();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="court-cv" role="img" aria-label={label} style={{ width: '100%', display: 'block', touchAction: 'pan-y' }} />;
}

/** A small, steady hash: each plank and joint of the floor sits in the same place on every draw. */
const grain = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The maple floor every game is played on, flat as a broadcast graphic draws it (no lighting, no gloss):
 * the boards, their joints, the darker stain of the apron around the court. The Hardwood look's floor;
 * the tactics board's half court paints the same colours (from the --maple tokens in tokens.css).
 */
export const MAPLE = { wood: '#dcae76', light: 'rgba(255,246,228,', dark: 'rgba(122,72,24,', joint: 'rgba(122,72,24,0.2)', apron: '#b07a46' } as const;

/** The colours a floor is painted in: the paint (the key and the center circle), the pinstripe, the lines. */
function palette(floor: CourtFloor | undefined) {
  // a neutral floor (the Cup final): the paint in ink, a gold pinstripe
  if (floor?.kind !== 'home') return { paint: '#1c1b19', trim: '#c9a24a', mark: null };
  const look = teamLook(floor.colors);
  return { paint: look.slab, trim: look.trim, mark: floor };
}

function drawFloor(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, floor: CourtFloor | undefined) {
  const pal = palette(floor);
  ctx.fillStyle = MAPLE.wood;
  ctx.fillRect(0, 0, w, h);
  // boards along the court's length, each a shade apart, their joints staggered
  const plank = k * 1.15;
  for (let i = 0, x = 0; x < w; i++, x += plank) {
    const r = grain(i);
    ctx.fillStyle = r > 0.5 ? `${MAPLE.light}${((r - 0.5) * 0.34).toFixed(3)})` : `${MAPLE.dark}${((0.5 - r) * 0.16).toFixed(3)})`;
    ctx.fillRect(x, 0, plank, h);
    ctx.fillStyle = MAPLE.joint;
    ctx.fillRect(x, 0, 1, h);
    for (let y = -grain(i + 99) * 11 * k; y < h; y += 11 * k) ctx.fillRect(x, y, plank, 1);
  }
  const X = (x: number) => (x + W_FT / 2 + SIDE) * k;
  const Y = (y: number) => (y + TOP) * k;
  // the apron: the sidelines' bands and the deeper one behind the baseline, stained darker, a pinstripe
  // in the home team's trim where it meets the court
  ctx.fillStyle = MAPLE.apron;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, w, Y(0));
  ctx.fillRect(0, Y(0), X(-25), h - Y(0));
  ctx.fillRect(X(25), Y(0), w - X(25), h - Y(0));
  ctx.globalAlpha = 1;
  const pin = 0.35 * k;
  ctx.strokeStyle = pal.paint;
  ctx.lineWidth = Math.max(1.5, k * 0.2);
  ctx.beginPath();
  ctx.moveTo(X(-25) - pin, h);
  ctx.lineTo(X(-25) - pin, Y(0) - pin);
  ctx.lineTo(X(25) + pin, Y(0) - pin);
  ctx.lineTo(X(25) + pin, h);
  ctx.stroke();
  // the home team's name behind the basket, between the scoreboards, painted in its colour
  if (floor?.name) {
    setFont(ctx, 860, Math.max(9, TOP * k * 0.52));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(floor.name.toUpperCase(), X(0), Y(0) / 2 - pin / 2 + 0.5);
  }
  // the paint, solid in the home team's colour
  ctx.fillStyle = pal.paint;
  ctx.fillRect(X(-8), Y(0), 16 * k, 19 * k);
  // center court: the circle painted in the team's colour, its mark in the half this end shows
  ctx.beginPath();
  ctx.arc(X(0), Y(47), 6 * k, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  const markR = 2.9;
  if (pal.mark) drawMark(ctx, X(0), Y(H_FT - markR - 0.35), markR * 2 * k, pal.mark);
  else drawNeutralMark(ctx, X(0), Y(H_FT - markR - 0.35), markR * k, pal.trim, pal.paint);
  // the lines, white
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, k * 0.19);
  ctx.lineJoin = 'miter';
  // baseline and sidelines
  ctx.beginPath();
  ctx.moveTo(X(-25), Y(47));
  ctx.lineTo(X(-25), Y(0));
  ctx.lineTo(X(25), Y(0));
  ctx.lineTo(X(25), Y(47));
  ctx.stroke();
  ctx.strokeRect(X(-8), Y(0), 16 * k, 19 * k);
  // FT circle: its half away from the basket (the half inside the lane is dashed, below)
  ctx.beginPath();
  ctx.arc(X(0), Y(19), 6 * k, 0, Math.PI);
  ctx.stroke();
  // three point line
  const arcR = 23.75;
  const by = 5.25;
  const cornerY = by + Math.sqrt(arcR * arcR - 22 * 22);
  ctx.beginPath();
  ctx.moveTo(X(-22), Y(0));
  ctx.lineTo(X(-22), Y(cornerY));
  const ang = Math.atan2(cornerY - by, -22);
  ctx.arc(X(0), Y(by), arcR * k, ang, Math.PI - ang, true);
  ctx.lineTo(X(22), Y(0));
  ctx.stroke();
  // restricted area
  ctx.beginPath();
  ctx.arc(X(0), Y(by), 4 * k, 0, Math.PI);
  ctx.stroke();
  // the lane's hash marks and blocks, and the dashed lower half of the free-throw circle
  ctx.lineWidth = Math.max(1, k * 0.14);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (const hy of [7, 11, 14, 17]) {
      ctx.moveTo(X(side * 8), Y(hy));
      ctx.lineTo(X(side * 8.7), Y(hy));
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const side of [-1, 1]) ctx.fillRect(Math.min(X(side * 8), X(side * 8.7)), Y(7.6), 0.7 * k, 1 * k);
  ctx.setLineDash([k * 0.9, k * 0.9]);
  ctx.beginPath();
  ctx.arc(X(0), Y(19), 6 * k, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1.5, k * 0.19);
  // half court
  ctx.beginPath();
  ctx.moveTo(X(-25), Y(46.8));
  ctx.lineTo(X(25), Y(46.8));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(0), Y(47), 6 * k, Math.PI, 0);
  ctx.stroke();
  // backboard & rim
  ctx.strokeStyle = '#f2f2f2';
  ctx.lineWidth = Math.max(2, k * 0.3);
  ctx.beginPath();
  ctx.moveTo(X(-3), Y(4));
  ctx.lineTo(X(3), Y(4));
  ctx.stroke();
  ctx.strokeStyle = '#ff5a1f';
  ctx.lineWidth = Math.max(2, k * 0.22);
  ctx.beginPath();
  ctx.arc(X(0), Y(by), 0.75 * k, 0, Math.PI * 2);
  ctx.stroke();
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
  ctx.globalAlpha = 0.95;
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

/** A neutral floor's center: a disc in the apron's colour with a star. */
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

function drawPlayer(ctx: CanvasRenderingContext2D, k: number, p: Pt, colors: [string, string], num: string, offense: boolean, hot = false) {
  const x = (p.x + W_FT / 2) * k;
  const y = p.y * k;
  const r = 1.45 * k;
  // a hot shooter wears a steady ring in the warning colour, edged in ink so it reads on the maple and the
  // paint alike (the scorebug's run and the feed's flame are its words)
  if (hot) {
    const hr = r + Math.max(3.5, k * 0.55);
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = Math.max(3.5, k * 0.42);
    ctx.beginPath();
    ctx.arc(x, y, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffb21e';
    ctx.lineWidth = Math.max(2, k * 0.26);
    ctx.stroke();
  }
  // the jersey, flat in its colours
  ctx.fillStyle = colors[0];
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = Math.max(2, k * 0.28);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // an ink hairline around the trim: a light jersey still reads on the maple
  ctx.strokeStyle = 'rgba(18,18,18,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + Math.max(1, k * 0.14), 0, Math.PI * 2);
  ctx.stroke();
  // the defense: a faint ink ring a step out
  if (!offense) {
    ctx.strokeStyle = 'rgba(18,18,18,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = inkOn(colors[0]);
  setFont(ctx, 760, Math.max(10, r * 1.1));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, x, y + 0.5);
}

/** The ball: orange with its seams, turned by `spin`. */
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.fillStyle = '#f07a22';
  ctx.strokeStyle = '#3d1c00';
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
  ctx.strokeStyle = 'rgba(40,16,0,0.75)';
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

/** The net under the rim; `sway` (0..2 over a make and the moment after) makes it ripple out and settle. */
function drawNet(ctx: CanvasRenderingContext2D, k: number, sway: number) {
  const x = (W_FT / 2) * k;
  const y = 5.25 * k;
  const top = 0.75 * k;
  const len = 1.7 * k;
  // the net hangs below the rim as a broadcast angle shows it (toward the court); a make pulls it long and wide
  const t = sway > 0 ? Math.sin(Math.min(1, sway / 2) * Math.PI) : 0;
  const bottom = top * (0.55 + 0.3 * t);
  const drop = len * (1 + 0.5 * t);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(0.8, k * 0.08);
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const f = i / 6;
    const ax = x - top + 2 * top * f;
    const bx = x - bottom + 2 * bottom * f + Math.sin(sway * 9 + i) * 0.12 * k * t;
    ctx.moveTo(ax, y);
    ctx.lineTo(bx, y + drop);
  }
  ctx.moveTo(x - bottom, y + drop);
  ctx.lineTo(x + bottom, y + drop);
  ctx.moveTo(x - (top + bottom) / 2, y + drop / 2);
  ctx.lineTo(x + (top + bottom) / 2, y + drop / 2);
  ctx.stroke();
}

/** The team with the ball, in its colours, on the boards behind the baseline it attacks (both sides of the basket). */
function drawBaseline(ctx: CanvasRenderingContext2D, k: number, abbrev: string, colors: [string, string]) {
  // ink boards, lit in the team's jersey colour along the bottom: the broadcast's graphics on the apron
  const h = (TOP - 0.6) * k;
  const w = 7 * k;
  const bar = Math.max(2, 0.28 * k);
  setFont(ctx, 760, Math.max(9, h * 0.66));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cx of [-14.5, 14.5]) {
    const x = (cx + W_FT / 2) * k - w / 2;
    const y = -TOP * k + 0.2 * k;
    ctx.fillStyle = '#121212';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colors[0];
    ctx.fillRect(x, y + h - bar, w, bar);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(abbrev, x + w / 2, y + (h - bar) / 2 + 0.5);
  }
}

/** A made shot ripples the net; a miss rattles the rim. `p` runs 0..2 over the landing and the moment after. */
function drawRim(ctx: CanvasRenderingContext2D, k: number, kind: 'make' | 'miss', p: number) {
  const x = (W_FT / 2) * k;
  const y = 5.25 * k;
  const t = Math.min(1, p / 2);
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.lineWidth = Math.max(1.5, k * 0.18);
  if (kind === 'make') {
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, (0.9 + t * 2.2) * k, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#ff8c2b';
    const j = Math.sin(p * Math.PI * 6) * 0.25 * k;
    ctx.beginPath();
    ctx.arc(x + j, y, 0.95 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The ball's arc so far on a shot (u: how far along). */
function drawTrail(ctx: CanvasRenderingContext2D, k: number, from: Pt, to: Pt, u: number) {
  ctx.fillStyle = '#c4531a';
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const v = (u * i) / (n + 1);
    const p = lerpPt(from, to, v);
    const z = Math.sin(Math.PI * v) * 7;
    ctx.globalAlpha = 0.1 + (0.4 * i) / n;
    ctx.beginPath();
    ctx.arc((p.x + W_FT / 2) * k, (p.y - z) * k, 0.16 * k + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The ball handler's name, in a small tag under his circle. */
function drawTag(ctx: CanvasRenderingContext2D, k: number, p: Pt, name: string) {
  if (!name) return;
  const x = (p.x + W_FT / 2) * k;
  const y = p.y * k + 1.45 * k + Math.max(7, k * 1.05);
  setFont(ctx, 700, Math.max(10.5, k * 1.3), 'semi-condensed');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 10;
  const h = Math.max(15, k * 1.85);
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.roundRect?.(x - w / 2, y - h / 2, w, h, h / 2);
  if (!ctx.roundRect) ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, x, y + 0.5);
}

/** A play's call on the floor ("+3", "Block", "Foul"): an ink pill with the word in its signal's colour, as the broadcast's graphics have it. */
function drawFlash(ctx: CanvasRenderingContext2D, k: number, text: string, kind: string, fx: number, fy: number, alpha: number) {
  // (kept off the sidelines: a ball thrown out of bounds would put it under the playback buttons)
  const x = (clamp(fx, -13, 13) + W_FT / 2) * k;
  const y = fy * k;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  const px = Math.max(15, k * 2.3);
  setFont(ctx, 860, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // (the app's signals, lifted to read on ink: a make green, a block or turnover red, a foul amber)
  const color = kind === 'make' ? '#7fe3a8' : kind === 'block' || kind === 'to' ? '#ff9a8f' : kind === 'foul' ? '#ffd27a' : '#ffffff';
  const w = ctx.measureText(text).width + px * 0.9;
  const h = px * 1.35;
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.roundRect?.(x - w / 2, y - h / 2, w, h, h / 2);
  if (!ctx.roundRect) ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
  ctx.globalAlpha = 1;
}
