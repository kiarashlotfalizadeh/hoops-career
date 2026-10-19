import { useEffect, useRef } from 'react';
import type { Frame, Pt, Script } from './choreo';
import type { Team } from '../../core/types';
import { FRANCHISES, type FranchiseDef } from '../../core/teams';
import { inkOn, teamLook } from '../teamColors';

/**
 * The floor the game is played on: the home team's (its colours in the paint and the apron, its mark
 * at center court, its name behind the basket), or a neutral one (the Cup final).
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
      const sig = `${key}|${s.t}|${s.done}`;
      if (sig === drawn && s.script === lastScript) return;
      drawn = sig;
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
      if (i >= sc.frames.length) {
        a = b = sc.frames[sc.frames.length - 1];
        u = 1;
      } else {
        a = sc.frames[i - 1];
        b = sc.frames[i];
        u = b.dur && !still?.matches ? ease(Math.min(1, (s.t - acc) / b.dur)) : 1;
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
      // defense first (under), then offense; the ball handler in a pool of his team's light, a hot shooter in a heat ring
      const hold = u >= 0.5 ? b.hold : a.hold;
      const hotSet = props.current.hot;
      const glow = calm ? 0 : 0.5 + 0.5 * Math.sin(s.t / 160);
      const dAt = sc.dPids.map((_, j) => lerpPt(a.d[j], b.d[j], u));
      const oAt = sc.oPids.map((_, j) => lerpPt(a.o[j], b.o[j], u));
      sc.dPids.forEach((pid, j) =>
        drawPlayer(ctx, k, dAt[j], defColors, props.current.jersey(pid), false, { holder: hold === sc.oPids.length + j, hot: !!hotSet?.has(pid), glow }),
      );
      sc.oPids.forEach((pid, j) => drawPlayer(ctx, k, oAt[j], offColors, props.current.jersey(pid), true, { holder: hold === j, hot: !!hotSet?.has(pid), glow }));
      // the ball handler's name, under him (whoever has it at the end of this move, once he does)
      const nm = props.current.names;
      if (nm && hold !== undefined && hold >= 0) {
        const off = hold < sc.oPids.length;
        const pid = off ? sc.oPids[hold] : sc.dPids[hold - sc.oPids.length];
        const at = off ? oAt[hold] : dAt[hold - sc.oPids.length];
        if (pid !== undefined && at) drawTag(ctx, k, at, nm(pid));
      }
      // ball: its shadow stays on the floor and shrinks as it rises; it spins as it travels
      const bp = lerpPt(a.ball, b.ball, u);
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

/** The colours a floor is painted in: the wood (top, bottom), the paint and apron, the pinstripe, and the lines. */
function palette(floor: CourtFloor | undefined) {
  if (floor?.kind !== 'home') return { wood: ['#a8774a', '#8a5d36'], paint: '#26303b', apron: '#151b22', trim: '#c9a24a', mark: null };
  const look = teamLook(floor.colors);
  // a darker stain under the team's colours, so the paint and the jerseys stand out from the wood
  return { wood: ['#7e5232', '#5f3c22'], paint: look.slab, apron: look.slab, trim: look.trim, mark: floor };
}

function drawFloor(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, floor: CourtFloor | undefined) {
  const pal = palette(floor);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.wood[0]);
  g.addColorStop(1, pal.wood[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // planks along the court's length, each a shade apart, with their joints staggered
  const plank = k * 1.9;
  for (let i = 0, x = 0; x < w; i++, x += plank) {
    const r = grain(i);
    ctx.fillStyle = r > 0.5 ? `rgba(255,236,210,${(r - 0.5) * 0.09})` : `rgba(30,12,0,${(0.5 - r) * 0.12})`;
    ctx.fillRect(x, 0, plank, h);
    ctx.fillStyle = 'rgba(30,12,0,0.22)';
    ctx.fillRect(x, 0, 1, h);
    for (let y = -grain(i + 99) * 14 * k; y < h; y += 14 * k) ctx.fillRect(x, y, plank, 1);
  }
  const X = (x: number) => (x + W_FT / 2 + SIDE) * k;
  const Y = (y: number) => (y + TOP) * k;
  // the apron: the sidelines' bands and the deeper one behind the baseline, a pinstripe where it meets the court
  ctx.fillStyle = pal.apron;
  ctx.globalAlpha = 0.94;
  ctx.fillRect(0, 0, w, Y(0));
  ctx.fillRect(0, Y(0), X(-25), h - Y(0));
  ctx.fillRect(X(25), Y(0), w - X(25), h - Y(0));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = Math.max(1, k * 0.12);
  ctx.beginPath();
  const pin = 0.35 * k;
  ctx.moveTo(X(-25) - pin, h);
  ctx.lineTo(X(-25) - pin, Y(0) - pin);
  ctx.lineTo(X(25) + pin, Y(0) - pin);
  ctx.lineTo(X(25) + pin, h);
  ctx.stroke();
  // the home team's name behind the basket, between the scoreboards
  if (floor?.name) {
    setFont(ctx, 800, Math.max(9, TOP * k * 0.5));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.72;
    ctx.fillText(floor.name.toUpperCase(), X(0), Y(0) / 2 - pin / 2 + 0.5);
    ctx.globalAlpha = 1;
  }
  // the paint
  ctx.fillStyle = pal.paint;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(X(-8), Y(0), 16 * k, 19 * k);
  ctx.globalAlpha = 1;
  // center court: the mark in the half of the circle this end shows
  const markR = 2.9;
  if (pal.mark) drawMark(ctx, X(0), Y(H_FT - markR - 0.35), markR * 2 * k, pal.mark);
  else drawNeutralMark(ctx, X(0), Y(H_FT - markR - 0.35), markR * k, pal.trim, pal.paint);
  // the lines
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.5, k * 0.17);
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
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const side of [-1, 1]) ctx.fillRect(Math.min(X(side * 8), X(side * 8.7)), Y(7.6), 0.7 * k, 1 * k);
  ctx.setLineDash([k * 0.9, k * 0.9]);
  ctx.beginPath();
  ctx.arc(X(0), Y(19), 6 * k, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1.5, k * 0.17);
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
  // the floor's gloss: a band of the arena's lights across the wood
  const gloss = ctx.createLinearGradient(0, h * 0.2, w, h * 0.75);
  gloss.addColorStop(0, 'rgba(255,255,255,0)');
  gloss.addColorStop(0.45, 'rgba(255,248,235,0.07)');
  gloss.addColorStop(0.55, 'rgba(255,248,235,0.07)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, Y(0), w, h - Y(0));
  // arena light: brighter under the basket, falling off toward the corners
  const v = ctx.createRadialGradient(X(0), Y(12), h * 0.15, X(0), Y(16), h * 0.95);
  v.addColorStop(0, 'rgba(255,240,220,0.05)');
  v.addColorStop(0.55, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
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
  setFont(ctx, 800, text.length === 3 ? 30 : 36);
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

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  k: number,
  p: Pt,
  colors: [string, string],
  num: string,
  offense: boolean,
  mark: { holder: boolean; hot: boolean; glow: number } = { holder: false, hot: false, glow: 0 },
) {
  const x = (p.x + W_FT / 2) * k;
  const y = p.y * k;
  const r = 1.45 * k;
  // the ball handler stands in a pool of his team's light
  if (mark.holder) {
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
    g.addColorStop(0, hexA(colors[0], 0.45));
    g.addColorStop(1, hexA(colors[0], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // a hot shooter wears a flickering heat ring
  if (mark.hot) {
    ctx.strokeStyle = `rgba(255,${Math.round(120 + 60 * mark.glow)},40,${0.55 + 0.35 * mark.glow})`;
    ctx.lineWidth = Math.max(2, k * 0.32);
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(3, k * 0.5) + mark.glow * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = colors[0];
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = Math.max(2, k * 0.28);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // a sheen on the jersey, lit from above
  const sheen = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
  sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // a dark hairline around the trim: a dark jersey still reads on the stained wood
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + Math.max(1, k * 0.14), 0, Math.PI * 2);
  ctx.stroke();
  if (!offense) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = inkOn(colors[0]);
  setFont(ctx, 800, Math.max(10, r * 1.1));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, x, y + 0.5);
}

/** A colour as rgba at `a` (#rgb, #rrggbb, or any other colour left as it is). */
function hexA(c: string, a: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/** The ball: orange with its seams, turned by `spin`. */
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, '#ffb066');
  g.addColorStop(1, '#e8701a');
  ctx.fillStyle = g;
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
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
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
  // dark boards, lit in the team's jersey colour along the bottom: they read on any apron
  const h = (TOP - 0.6) * k;
  const w = 7 * k;
  const bar = Math.max(2, 0.28 * k);
  setFont(ctx, 800, Math.max(9, h * 0.66));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cx of [-14.5, 14.5]) {
    const x = (cx + W_FT / 2) * k - w / 2;
    const y = -TOP * k + 0.2 * k;
    ctx.fillStyle = 'rgba(8,10,14,0.88)';
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
  ctx.fillStyle = '#ffd2a6';
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const v = (u * i) / (n + 1);
    const p = lerpPt(from, to, v);
    const z = Math.sin(Math.PI * v) * 7;
    ctx.globalAlpha = 0.12 + (0.3 * i) / n;
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
  ctx.fillStyle = 'rgba(6,8,12,0.84)';
  ctx.beginPath();
  ctx.roundRect?.(x - w / 2, y - h / 2, w, h, 3);
  if (!ctx.roundRect) ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, x, y + 0.5);
}

function drawFlash(ctx: CanvasRenderingContext2D, k: number, text: string, kind: string, fx: number, fy: number, alpha: number) {
  // (kept off the sidelines: a ball thrown out of bounds would put it under the playback buttons)
  const x = (clamp(fx, -13, 13) + W_FT / 2) * k;
  const y = fy * k;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  setFont(ctx, 800, Math.max(17, k * 2.8));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const color = kind === 'make' ? '#2fd27a' : kind === 'miss' ? '#ffffff' : kind === 'block' || kind === 'to' ? '#ff5468' : kind === 'foul' ? '#ffb547' : '#e8ecf3';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}
