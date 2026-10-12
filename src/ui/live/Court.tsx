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
  /** What the court shows, for screen readers. */
  label: string;
  /** A call between possessions (a timeout) flashed over the court; a new id replays it. */
  banner?: { text: string; id: number } | null;
}

const BANNER_MS = 1600;

const W_FT = 50;
const H_FT = 47;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

export function Court({ script, speed, paused, colors, jersey, onDone, onTick, label, banner }: CourtProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ t: 0, last: 0, script: null as Script | null, done: false, score: null as [number, number] | null });
  const props = useRef({ speed, paused, colors, jersey, onDone, onTick });
  props.current = { speed, paused, colors, jersey, onDone, onTick };
  const flash = useRef<{ text: string; start: number } | null>(null);

  useEffect(() => {
    state.current = { t: 0, last: 0, script, done: false, score: null };
  }, [script]);

  useEffect(() => {
    flash.current = banner ? { text: banner.text, start: performance.now() } : null;
  }, [banner]);

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
      const fl = flash.current;
      const flAge = fl ? now - fl.start : BANNER_MS;
      // paused, finished or waiting for the next possession: nothing moved, so skip the redraw (battery)
      const sig = `${canvas.width}|${s.t}|${s.done}|${flAge < BANNER_MS ? Math.floor(flAge / 16) : ''}`;
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
      if (fl && flAge < BANNER_MS && !still?.matches) drawFlash(ctx, k, fl.text, 'info', 0, 26, Math.min(1, flAge / 150, (BANNER_MS - flAge) / 400));
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
      const offColors = props.current.colors[sc.off];
      const defColors = props.current.colors[1 - sc.off];
      // defense first (under), then offense
      sc.dPids.forEach((pid, j) => drawPlayer(ctx, k, lerpPt(a.d[j], b.d[j], u), defColors, props.current.jersey(pid), false));
      sc.oPids.forEach((pid, j) => drawPlayer(ctx, k, lerpPt(a.o[j], b.o[j], u), offColors, props.current.jersey(pid), true));
      // ball
      const bp = lerpPt(a.ball, b.ball, u);
      const z = b.ballZ ? Math.sin(Math.PI * u) * 7 : 0;
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

function drawFlash(ctx: CanvasRenderingContext2D, k: number, text: string, kind: string, fx: number, fy: number, alpha: number) {
  const x = (fx + W_FT / 2) * k;
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
