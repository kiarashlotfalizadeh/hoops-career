import { useEffect, useRef } from 'react';
import type { Frame, Pt, Script } from './choreo';
import { inkOn } from '../teamColors';

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
  /** What the court shows, for screen readers. */
  label: string;
}

const W_FT = 50;
const H_FT = 47;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

export function Court({ script, speed, paused, colors, jersey, onDone, onTick, onBeat, names, abbrevs, label }: CourtProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ t: 0, last: 0, script: null as Script | null, done: false, score: null as [number, number] | null, beat: -1 });
  const props = useRef({ speed, paused, colors, jersey, onDone, onTick, onBeat, names, abbrevs });
  props.current = { speed, paused, colors, jersey, onDone, onTick, onBeat, names, abbrevs };

  // how far each possession got: a replay shown in between doesn't make the one it interrupted start over
  // (or a finished one play again)
  const progress = useRef(new WeakMap<Script, { t: number; done: boolean }>());
  useEffect(() => {
    const was = state.current;
    if (was.script) progress.current.set(was.script, { t: was.t, done: was.done });
    const back = script ? progress.current.get(script) : undefined;
    state.current = { t: back?.t ?? 0, last: 0, script, done: back?.done ?? false, score: null, beat: -1 };
  }, [script]);

  useEffect(() => {
    let raf = 0;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let drawn = '';
    let lastScript: typeof state.current.script | undefined;
    // the floor, its lines and the vignette never change: drawn once per canvas size, then copied each frame
    const floor = document.createElement('canvas');
    // reduced motion: players and the ball jump from spot to spot instead of gliding, and nothing flashes over the court
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = (cssW * H_FT) / W_FT;
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = `${cssH}px`;
      }
      const dt = s.last ? Math.min(100, now - s.last) : 0;
      s.last = now;
      if (!props.current.paused && !s.done) s.t += dt * props.current.speed;
      // paused, finished or waiting for the next possession: nothing moved, so skip the redraw (battery)
      const sig = `${canvas.width}|${s.t}|${s.done}`;
      if (sig === drawn && s.script === lastScript) return;
      drawn = sig;
      lastScript = s.script;
      const k = cssW / W_FT;
      if (floor.width !== canvas.width || floor.height !== canvas.height) {
        floor.width = canvas.width;
        floor.height = canvas.height;
        const fctx = floor.getContext('2d')!;
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCourt(fctx, cssW, cssH, k);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // (a hidden, zero-size canvas can't be copied, but the possession still has to play out)
      if (floor.width && floor.height) ctx.drawImage(floor, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sc = s.script;
      if (sc && sc.frames.length > 0) drawScript(sc);
    };
    const drawScript = (sc: Script) => {
      const s = state.current;
      const k = canvas.clientWidth / W_FT;
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
      // the team with the ball, along the baseline it attacks
      const ab = props.current.abbrevs;
      if (ab) drawBaseline(ctx, k, ab[sc.off], offColors);
      const calm = !!still?.matches;
      // the net or the rim answers a shot as it lands, and a moment after
      const fx = b.fx && u > 0.72 ? { kind: b.fx, p: (u - 0.72) / 0.28 } : a.fx && u < 0.5 && i > 1 ? { kind: a.fx, p: 1 + u / 0.5 } : null;
      if (fx && !calm) drawRim(ctx, k, fx.kind, fx.p);
      // defense first (under), then offense
      const dAt = sc.dPids.map((_, j) => lerpPt(a.d[j], b.d[j], u));
      const oAt = sc.oPids.map((_, j) => lerpPt(a.o[j], b.o[j], u));
      sc.dPids.forEach((pid, j) => drawPlayer(ctx, k, dAt[j], defColors, props.current.jersey(pid), false));
      sc.oPids.forEach((pid, j) => drawPlayer(ctx, k, oAt[j], offColors, props.current.jersey(pid), true));
      // the ball handler's name, under him (whoever has it at the end of this move, once he does)
      const nm = props.current.names;
      const hold = u >= 0.5 ? b.hold : a.hold;
      if (nm && hold !== undefined && hold >= 0) {
        const off = hold < sc.oPids.length;
        const pid = off ? sc.oPids[hold] : sc.dPids[hold - sc.oPids.length];
        const at = off ? oAt[hold] : dAt[hold - sc.oPids.length];
        if (pid !== undefined && at) drawTag(ctx, k, at, nm(pid));
      }
      // ball
      const bp = lerpPt(a.ball, b.ball, u);
      const z = b.ballZ ? Math.sin(Math.PI * u) * 7 : 0;
      // a shot's flight leaves a faint trail behind the ball
      if (b.ballZ && !calm && u > 0 && u < 1) drawTrail(ctx, k, a.ball, b.ball, u);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(bp.x * k + (W_FT / 2) * k + 2, bp.y * k + 2, 0.55 * k, 0.4 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8c2b';
      ctx.strokeStyle = '#5a2a00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bp.x * k + (W_FT / 2) * k, (bp.y - z) * k, (0.62 + z * 0.04) * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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

  return <canvas ref={ref} role="img" aria-label={label} style={{ width: '100%', display: 'block', borderRadius: 12, touchAction: 'pan-y' }} />;
}

function drawCourt(ctx: CanvasRenderingContext2D, w: number, h: number, k: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#c58a52');
  g.addColorStop(1, '#a8703f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // planks
  ctx.strokeStyle = 'rgba(80,40,10,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += k * 2.2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  const X = (x: number) => (x + W_FT / 2) * k;
  const Y = (y: number) => y * k;
  // paint
  ctx.fillStyle = 'rgba(30, 20, 60, 0.35)';
  ctx.fillRect(X(-8), Y(0), 16 * k, 19 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.5, k * 0.17);
  ctx.strokeRect(X(-8), Y(0), 16 * k, 19 * k);
  // FT circle
  ctx.beginPath();
  ctx.arc(X(0), Y(19), 6 * k, 0, Math.PI * 2);
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
  // half court
  ctx.beginPath();
  ctx.moveTo(0, Y(46.8));
  ctx.lineTo(w, Y(46.8));
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
  // vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.9);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

function drawPlayer(ctx: CanvasRenderingContext2D, k: number, p: Pt, colors: [string, string], num: string, offense: boolean) {
  const x = (p.x + W_FT / 2) * k;
  const y = p.y * k;
  const r = 1.45 * k;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[0];
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = Math.max(2, k * 0.28);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!offense) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = inkOn(colors[0]);
  ctx.font = `800 ${Math.max(10, r * 1.05)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, x, y + 0.5);
}

/** The team with the ball, in its colours, on the baseline under the basket it attacks (both sides of the backboard). */
function drawBaseline(ctx: CanvasRenderingContext2D, k: number, abbrev: string, colors: [string, string]) {
  const h = 1.15 * k;
  const w = 7 * k;
  ctx.font = `800 ${Math.max(9, h * 0.78)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cx of [-14.5, 14.5]) {
    const x = (cx + W_FT / 2) * k - w / 2;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.roundRect?.(x, 0, w, h, [0, 0, h / 2, h / 2]);
    if (!ctx.roundRect) ctx.rect(x, 0, w, h);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = inkOn(colors[0]);
    ctx.fillText(abbrev, x + w / 2, h / 2 + 0.5);
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
  ctx.font = `700 ${Math.max(10, k * 1.25)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 8;
  const h = Math.max(14, k * 1.75);
  ctx.fillStyle = 'rgba(6,8,12,0.78)';
  ctx.beginPath();
  ctx.roundRect?.(x - w / 2, y - h / 2, w, h, h / 2);
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
  ctx.font = `800 ${Math.max(16, k * 2.6)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const color = kind === 'make' ? '#2fd27a' : kind === 'miss' ? '#ffffff' : kind === 'block' || kind === 'to' ? '#ff5468' : kind === 'foul' ? '#ffb547' : '#e8ecf3';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}
