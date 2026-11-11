// One figure's body, each frame: the plan (choreo.ts) says where he is, where he faces and what
// he's doing; this turns that into a pose. It picks the clip, blends from the last one, walks his
// feet (a planted foot stays where it landed until it steps), and solves his arms and legs to the
// points the pose asks for. It decides nothing about the game.
//
// No three.js here: joints come out as plain numbers in the figure's own frame (x to his left, y up,
// z the way he faces), for the scene to hang meshes on.
import type { Act } from '../choreo';
import { CLIPS, I, mirror, N, sample, span, type ClipId } from './clips';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A figure's size: `s` scales the 6 ft 6 puppet to his height, `bulk` widens him. */
export interface Body {
  s: number;
  bulk: number;
}

/** His build from his listed height and weight (and strength rating): a center still looks like a center. */
export function bodyOf(heightIn: number, weightLb: number, str = 50): Body {
  const h = Math.max(66, Math.min(90, heightIn || 78));
  const bmi = ((weightLb || 215) * 703) / (h * h);
  return { s: h / 78, bulk: Math.max(0.86, Math.min(1.24, 1 + (bmi - 24.8) * 0.045 + (str - 50) * 0.0015)) };
}

// the 6 ft 6 puppet, in feet
export const HIP = 3.35;
export const THIGH = 1.62;
export const SHIN = 1.55;
export const ANKLE = 0.28;
export const TORSO = 1.95;
export const SHOULDER = 0.84;
export const HIP_W = 0.4;
export const UARM = 1.1;
export const FARM = 1.05;
export const HEAD = 0.8;
export const BALL_R = 0.39;
/** The most a stride drops his hips below where the pose has them (a runner's hips stay near level). */
const SINK = 0.16;
/** How far ahead of him or behind a foot is planted, at most. */
const REACH = 1.3;
/** A hand's center sits this far from the ball's. */
const PALM = BALL_R + 0.12;

/** The joints the scene draws between, each three numbers in `Puppet.j`. */
export const J = { hips: 0, chest: 1, head: 2, sl: 3, el: 4, hl: 5, sr: 6, er: 7, hr: 8, jl: 9, kl: 10, fl: 11, jr: 12, kr: 13, fr: 14 } as const;

/** What the plan says about him this frame. Positions are the scene's (x along the floor, z across it). */
export interface Drive {
  x: number;
  z: number;
  /** The heading he should have: 0 faces +z, turning toward +x. */
  yaw: number;
  act: Act;
  /** Time into this move and its length, ms. */
  ms: number;
  dur: number;
  /** The ball is his through this move. */
  ball: boolean;
  /** The rim he's going at (a layup or a dunk carries him to it). */
  aim?: { x: number; z: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const IDLES: ClipId[] = ['idle', 'idle2', 'idle3'];
/** The clips with the ball in one hand: they flip when it's in his left. */
const HANDED = new Set<ClipId>(['dribble', 'dribbleRun', 'crossover']);
/** A drive opens with a crossover: it can start this far into the move, ms. */
const CROSS_MS = 320;
const smooth = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** Moves around a moment of the play: the clip, and whether that moment is the move's end or its start. */
const ONE: Partial<Record<Act, [ClipId, 'end' | 'start']>> = {
  pass: ['pass', 'start'],
  catch: ['catch', 'end'],
  jumper: ['jumper', 'end'],
  floater: ['floater', 'end'],
  layup: ['layup', 'end'],
  dunk: ['dunk', 'end'],
  ft: ['freeThrow', 'end'],
  contest: ['contest', 'end'],
  block: ['block', 'end'],
  steal: ['steal', 'end'],
  rebound: ['rebound', 'end'],
};

/** The clip for a man not in the middle of one of those: by what he's doing and how he's moving (ft a second: ahead, and overall). */
export function baseClip(act: Act, ball: boolean, sp: number, vf: number, vs: number): ClipId {
  const moving = sp > 2.5;
  if (ball)
    return act === 'hold' || act === 'pass' || act === 'stand'
      ? 'hold'
      : moving && sp > 7
        ? 'dribbleRun'
        : act === 'dribble' || act === 'drive' || act === 'post'
          ? 'dribble'
          : 'hold';
  const ahead = vf > 0.6 * sp;
  const gait: ClipId = ahead ? (sp > 32 ? 'sprint' : sp > 9 ? 'run' : 'walk') : vf < -0.45 * sp ? 'backpedal' : Math.abs(vs) > 0.7 * sp ? 'shuffle' : 'walk';
  switch (act) {
    case 'guard':
    case 'trap':
      return moving ? (ahead && sp > 22 ? 'run' : 'shuffle') : 'stance';
    case 'defend':
    case 'land':
    case 'contest':
    case 'block':
    case 'steal':
      return moving ? (gait === 'walk' ? 'shuffle' : gait) : 'ready';
    case 'screen':
      return moving ? gait : 'screen';
    case 'post':
      return moving ? gait : 'postUp';
    case 'boxout':
      return moving ? 'shuffle' : 'boxout';
    case 'celebrate':
      return 'celebrate';
    case 'rue':
      return moving ? gait : 'rue';
    default:
      return moving ? gait : 'idle';
  }
}

/** Two bones from `a` reaching for `t` (pulled in if it's too far): writes the middle joint, bent toward `pole`. */
function reach(j: Float32Array, a: number, mid: number, t: number, l1: number, l2: number, px: number, py: number, pz: number) {
  const ax = j[a * 3];
  const ay = j[a * 3 + 1];
  const az = j[a * 3 + 2];
  let dx = j[t * 3] - ax;
  let dy = j[t * 3 + 1] - ay;
  let dz = j[t * 3 + 2] - az;
  let d = Math.hypot(dx, dy, dz) || 1e-6;
  const max = (l1 + l2) * 0.995;
  const min = Math.abs(l1 - l2) + 0.05;
  const want = clamp(d, min, max);
  if (want !== d) {
    j[t * 3] = ax + (dx / d) * want;
    j[t * 3 + 1] = ay + (dy / d) * want;
    j[t * 3 + 2] = az + (dz / d) * want;
    d = want;
  }
  dx = (j[t * 3] - ax) / d;
  dy = (j[t * 3 + 1] - ay) / d;
  dz = (j[t * 3 + 2] - az) / d;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  // the pole, square to the limb
  const dot = px * dx + py * dy + pz * dz;
  let qx = px - dx * dot;
  let qy = py - dy * dot;
  let qz = pz - dz * dot;
  const ql = Math.hypot(qx, qy, qz);
  if (ql < 1e-4) [qx, qy, qz] = [0, 0, 1];
  else [qx, qy, qz] = [qx / ql, qy / ql, qz / ql];
  j[mid * 3] = ax + dx * along + qx * out;
  j[mid * 3 + 1] = ay + dy * along + qy * out;
  j[mid * 3 + 2] = az + dz * along + qz * out;
}

/**
 * The trunk for a pose: hips, hip joints, chest, head and shoulders into `j`, and the chest's axes
 * (its spine `u`, its front `f`, its left `l`) in his own frame. `vf`/`vs`: a little more lean for
 * his speed ahead and aside.
 */
export function spine(P: Float32Array, body: Body, hipY: number, j: Float32Array, u: V3, f: V3, l: V3, vf = 0, vs = 0) {
  const { s, bulk } = body;
  const put = (k: number, x: number, y: number, z: number) => {
    j[k * 3] = x;
    j[k * 3 + 1] = y;
    j[k * 3 + 2] = z;
  };
  // the hips: shifted over a planted foot, turned and tipped with the stride
  const hx = P[I.sway] * s;
  const hz = P[I.surge] * s;
  const cy = Math.cos(P[I.pyaw]);
  const sy = Math.sin(P[I.pyaw]);
  const cr = Math.cos(P[I.proll]);
  const w = HIP_W * s;
  put(J.hips, hx, hipY, hz);
  put(J.jl, hx + cy * cr * w, hipY + Math.sin(P[I.proll]) * w, hz - sy * cr * w);
  put(J.jr, hx - cy * cr * w, hipY - Math.sin(P[I.proll]) * w, hz + sy * cr * w);
  // the chest: leaning into a run and a turn
  const lean = P[I.lean] + clamp(vf * 0.0045, -0.08, 0.2);
  const tilt = P[I.tilt] - clamp(vs * 0.003, -0.14, 0.14);
  u.x = Math.sin(tilt);
  u.z = Math.sin(lean);
  u.y = Math.sqrt(Math.max(0.2, 1 - u.x * u.x - u.z * u.z));
  const T = TORSO * s;
  put(J.chest, hx + u.x * T, hipY + u.y * T, hz + u.z * T);
  // its front (square to its spine) and its left, turned by the twist
  const fzn = Math.hypot(u.y, u.z) || 1;
  const f0y = -u.z / fzn;
  const f0z = u.y / fzn;
  const l0x = u.y * f0z - u.z * f0y;
  const l0y = -u.x * f0z;
  const l0z = u.x * f0y;
  const ct = Math.cos(P[I.twist]);
  const st = Math.sin(P[I.twist]);
  f.x = l0x * st;
  f.y = f0y * ct + l0y * st;
  f.z = f0z * ct + l0z * st;
  l.x = l0x * ct;
  l.y = l0y * ct - f0y * st;
  l.z = l0z * ct - f0z * st;
  const cx = j[J.chest * 3];
  const cyy = j[J.chest * 3 + 1];
  const cz = j[J.chest * 3 + 2];
  const hd = HEAD * s;
  const nod = P[I.nod];
  put(J.head, cx + u.x * hd + f.x * -nod * 0.3 * s, cyy + u.y * hd - Math.abs(nod) * 0.08 * s, cz + u.z * hd + f.z * -nod * 0.3 * s);
  const sw = SHOULDER * s * (0.92 + 0.08 * bulk);
  const drop = 0.14 * s;
  put(J.sl, cx + l.x * sw - u.x * drop, cyy + l.y * sw - u.y * drop, cz + l.z * sw - u.z * drop);
  put(J.sr, cx - l.x * sw - u.x * drop, cyy - l.y * sw - u.y * drop, cz - l.z * sw - u.z * drop);
}

/** An elbow's pole for a hand offset: down, out and a little back, swung round the arm by `swivel`. */
export function elbowPole(l: V3, f: V3, side: 1 | -1, ax: number, ay: number, az: number, swivel: number, out: V3): V3 {
  let px = l.x * side * 0.7 - f.x * 0.45;
  let py = -1;
  let pz = l.z * side * 0.7 - f.z * 0.45;
  const d = Math.hypot(ax, ay, az) || 1;
  const dx = ax / d;
  const dy = ay / d;
  const dz = az / d;
  const dot = px * dx + py * dy + pz * dz;
  px -= dx * dot;
  py -= dy * dot;
  pz -= dz * dot;
  // (Rodrigues, about the arm's own line: the pole is already square to it)
  const c = Math.cos(swivel);
  const sn = Math.sin(swivel);
  out.x = px * c + (dy * pz - dz * py) * sn;
  out.y = py * c + (dz * px - dx * pz) * sn;
  out.z = pz * c + (dx * py - dy * px) * sn;
  return out;
}

interface Foot {
  /** Where it is on the floor (the scene's x, z), and how high. */
  x: number;
  z: number;
  up: number;
  swing: boolean;
  /** Where its swing started, from him. */
  fx: number;
  fz: number;
}

export class Puppet {
  readonly body: Body;
  x = 0;
  z = 0;
  yaw = 0;
  /** Joints in his own frame (see J). */
  readonly j = new Float32Array(15 * 3);
  /** His chest's axes in his own frame: its left, and its front. */
  readonly left: V3 = { x: 1, y: 0, z: 0 };
  readonly front: V3 = { x: 0, y: 0, z: 1 };
  readonly up: V3 = { x: 0, y: 1, z: 0 };
  readonly pose = new Float32Array(N);
  clip: ClipId = 'idle';
  /** The move he's in the middle of (a shot, a catch), and where in it (ms around its moment). */
  one: { id: ClipId; tau: number } | null = null;
  readonly feet: [Foot, Foot] = [
    { x: 0, z: 0, up: 0, swing: false, fx: 0, fz: 0 },
    { x: 0, z: 0, up: 0, swing: false, fx: 0, fz: 0 },
  ];
  private vx = 0;
  private vz = 0;
  /** His speed ahead and to his right, ft a second (the chest leans into them). */
  vf = 0;
  vs = 0;
  private phase = 0;
  private loopT = 0;
  private dwell = 0;
  private blend = 1;
  private readonly from = new Float32Array(N);
  private readonly want = new Float32Array(N);
  /** He has been put on the floor (until then he has no heading of his own). */
  placed = false;
  private ax = 0;
  private az = 0;
  private hasAim = false;
  /** The ball is in his left hand (a crossover puts it there, the next brings it back). */
  lefty = false;
  private flip = 0;
  /** How he stands when he's standing: no two quite alike. */
  private idle: ClipId = IDLES[Math.floor(Math.random() * IDLES.length)];

  constructor(body: Body) {
    this.body = body;
    // (each starts his idle on his own beat)
    this.loopT = Math.random() * 2000;
  }

  /** The way he faces and his right, on the floor. */
  private dirs(): [number, number, number, number] {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return [s, c, -c, s];
  }

  /** A point on the floor, in his frame. */
  private local(wx: number, wz: number): [number, number] {
    const dx = wx - this.x;
    const dz = wz - this.z;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
  }

  /** A point in his frame, in the scene. */
  world(lx: number, ly: number, lz: number, out: V3): V3 {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    out.x = this.x + lx * c + lz * s;
    out.y = ly;
    out.z = this.z - lx * s + lz * c;
    return out;
  }

  /**
   * One frame on: `dt` is the play's time (ms), which his moves are keyed to. `own` is his body's
   * time (ms): his speed is measured on it and his legs turn over on it. The 3D court plays the play
   * slower than his body runs (COURT3D_PACE), so his feet keep up with where the plan has him.
   */
  update(d: Drive, dt: number, own = dt) {
    const { s } = this.body;
    const P = this.pose;
    if (d.aim) {
      this.ax = d.aim.x;
      this.az = d.aim.z;
      this.hasAim = true;
    }
    // where the plan has him, carried toward the rim by a leap
    let rx = d.x;
    let rz = d.z;
    const leap = P[I.leap];
    if (leap > 0.001 && this.hasAim) {
      const gx = this.ax - d.x;
      const gz = this.az - d.z;
      const g = Math.hypot(gx, gz);
      const go = Math.max(0, g - 1.0 * s);
      if (g > 0.01) {
        rx += (gx / g) * go * leap;
        rz += (gz / g) * go * leap;
      }
    }
    const jumped = !this.placed || Math.hypot(rx - this.x, rz - this.z) > 14;
    if (jumped) {
      this.x = rx;
      this.z = rz;
      this.yaw = d.yaw;
      this.vx = this.vz = 0;
      this.one = null;
      this.blend = 1;
      this.settle();
    } else if (own > 0) {
      const k = 1 - Math.exp(-own / 70);
      this.vx += ((rx - this.x) / own - this.vx) * k;
      this.vz += ((rz - this.z) / own - this.vz) * k;
      this.x = rx;
      this.z = rz;
      this.yaw += wrap(d.yaw - this.yaw) * (1 - Math.exp(-own / (ONE[d.act] ? 45 : 95)));
    }
    if (own <= 0 && this.placed && !jumped) return;
    this.placed = true;

    const [fx, fz, sx, sz] = this.dirs();
    const sp = Math.hypot(this.vx, this.vz) * 1000;
    const vf = (this.vx * fx + this.vz * fz) * 1000;
    const vs = (this.vx * sx + this.vz * sz) * 1000;

    // the move he's in the middle of
    const one = ONE[d.act];
    if (one) this.one = { id: one[0], tau: one[1] === 'end' ? d.ms - d.dur : d.ms };
    else if (d.act === 'release' || d.act === 'land') this.one = { id: this.one?.id ?? (d.act === 'release' ? 'jumper' : 'contest'), tau: Math.max(this.one?.tau ?? 0, d.ms) };
    else if (d.act === 'drive' && d.ball && d.ms < CROSS_MS) this.one = { id: 'crossover', tau: d.ms };
    else if (this.one) this.one.tau += dt;
    if (this.one && this.one.tau > span(CLIPS[this.one.id])[1]) {
      // (a crossover leaves the ball in his other hand)
      if (this.one.id === 'crossover') this.lefty = !this.lefty;
      this.one = null;
    }
    if (!d.ball && !this.one) this.lefty = false;
    const acting = this.one && this.one.tau >= span(CLIPS[this.one.id])[0] ? this.one : null;

    let id = acting ? acting.id : baseClip(d.act, d.ball, sp, vf, vs);
    if (id === 'idle') {
      if (this.clip !== this.idle && Math.random() < 0.5) this.idle = IDLES[Math.floor(Math.random() * IDLES.length)];
      id = this.idle;
    }
    // (a gait isn't swapped for another on a flicker of speed)
    this.dwell += own;
    if (!acting && id !== this.clip && CLIPS[this.clip].kind !== 'shot' && this.dwell < 140) id = this.clip;
    if (id !== this.clip) {
      this.from.set(P);
      this.blend = 0;
      this.clip = id;
      this.dwell = 0;
    }
    const c = CLIPS[id];
    this.loopT += own;
    sample(c, c.kind === 'shot' ? acting!.tau : c.kind === 'gait' ? this.phase : this.loopT / c.dur, this.want);
    if (this.lefty && HANDED.has(id)) mirror(this.want);
    // (a slide is one clip, going left: going right it's flipped, eased over so he doesn't snap)
    this.flip += ((id === 'shuffle' && vs > 0 ? 1 : 0) - this.flip) * (1 - Math.exp(-own / 110));
    if (this.flip > 0.01) {
      FLIP.set(this.want);
      mirror(FLIP);
      for (let i = 0; i < N; i++) this.want[i] += (FLIP[i] - this.want[i]) * this.flip;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + own / 130);
      const w = smooth(this.blend);
      for (let i = 0; i < N; i++) P[i] = this.from[i] + (this.want[i] - this.from[i]) * w;
    } else P.set(this.want);

    this.step(own, sp);
    this.solve(vf, vs);
  }

  /** Both feet under him, planted. */
  private settle() {
    const [, , sx, sz] = this.dirs();
    const w = (HIP_W + 0.08) * this.body.s;
    this.feet.forEach((f, k) => {
      const side = k ? 1 : -1;
      f.x = this.x + sx * w * side;
      f.z = this.z + sz * w * side;
      f.up = 0;
      f.swing = false;
    });
  }

  /** The gait: one foot swings to where the next stride will need it while the other stays where it landed. */
  private step(dt: number, sp: number) {
    const { s } = this.body;
    const [, , sx, sz] = this.dirs();
    const w = (HIP_W + 0.08 + this.pose[I.wide] * 0.6) * s;
    const homeX = (k: number) => this.x + sx * w * (k ? 1 : -1);
    const homeZ = (k: number) => this.z + sz * w * (k ? 1 : -1);
    const stride = clamp(sp * 0.17, 1.1, 6) * s;
    let cadence = sp > 1.2 ? Math.min(sp / stride, 6.5) : 0;
    if (!cadence) {
      // standing: a foot left out of place (or caught mid-step) finishes a step home
      const off = this.feet.some((f, k) => f.swing || Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > 0.5 * s);
      if (off) cadence = 3.4;
    }
    const cycle = cadence ? 2 / cadence : 0;
    this.phase += cadence ? dt / 1000 / cycle : 0;
    const lift = clamp(0.3 + sp * 0.022, 0.3, 1.25) * s;
    // walking, a foot is down half the time; running, less (both are off the floor between strides)
    const down = clamp(0.5 - (sp - 8) * 0.008, 0.3, 0.5);
    this.feet.forEach((f, k) => {
      const p = this.phase + (k ? 0.5 : 0);
      const q = (p - Math.floor(p)) / (1 - down);
      const swinging = cadence > 0 && q < 1;
      if (swinging && !f.swing) {
        // (where it leaves the floor, measured from him: it swings through under him however fast he goes)
        f.fx = f.x - this.x;
        f.fz = f.z - this.z;
      }
      f.swing = swinging;
      if (swinging) {
        // it lands ahead of him by half of what he'll cover while it's down
        // (never farther than a leg reaches without sinking him: less in a crouch, a stride's own dip aside)
        const ahead = ((1 - q) * (1 - down) + down / 2) * cycle * 1000;
        const lead = Math.min(1, (REACH * s * (1 + Math.min(0, this.pose[I.hip] + 0.13) * 0.6)) / (Math.hypot(this.vx, this.vz) * ahead || 1));
        const e = smooth(q);
        f.x = this.x + f.fx + (homeX(k) - this.x + this.vx * ahead * lead - f.fx) * e;
        f.z = this.z + f.fz + (homeZ(k) - this.z + this.vz * ahead * lead - f.fz) * e;
        f.up = Math.sin(Math.PI * q) * lift;
      } else f.up = 0;
      // (faster than his legs can turn over: the foot is dragged along)
      const dx = f.x - this.x;
      const dz = f.z - this.z;
      const far = Math.hypot(dx, dz);
      const max = (REACH + 0.3) * s + w;
      if (far > max) {
        f.x = this.x + (dx / far) * max;
        f.z = this.z + (dz / far) * max;
      }
    });
  }

  /** Hips, chest, head, legs: everything but the arms (they wait for the ball). */
  private solve(vf: number, vs: number) {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    const air = clamp(P[I.air], 0, 1);
    const put = (k: number, x: number, y: number, z: number) => {
      j[k * 3] = x;
      j[k * 3 + 1] = y;
      j[k * 3 + 2] = z;
    };
    // feet, in his frame: planted where they are on the floor, or hanging from a jump
    const w = (HIP_W + 0.08 + P[I.wide] * 0.6) * s;
    const jump = Math.max(0, P[I.hip]) * s;
    const fl: [number, number, number][] = [];
    this.feet.forEach((f, k) => {
      const [lx, lz] = this.local(f.x, f.z);
      const ax = (k ? -1 : 1) * w;
      const au = jump + P[k ? I.fru : I.flu] * s;
      const af = P[k ? I.frf : I.flf] * s;
      const x = lx + (ax - lx) * air;
      const z = lz + (af - lz) * air;
      const y = ANKLE * s + f.up * (1 - air) + au * air;
      fl.push([x, y, z]);
      if (air > 0.5) {
        // (in the air his feet go with him: he lands where he comes down)
        const o = this.world(ax, 0, af, TMP);
        f.x = o.x;
        f.z = o.z;
        f.up = 0;
        f.swing = false;
      }
    });
    // hips: as high as the pose says, never higher than both legs can reach from
    const want = (HIP + P[I.hip]) * s;
    let hipY = want;
    const legs = (THIGH + SHIN) * s * 0.985;
    if (air < 0.5) {
      fl.forEach(([x, y, z], k) => {
        // (a foot in the air holds nothing down: its leg folds to follow)
        if (this.feet[k].swing) return;
        const dh = Math.hypot(x - ((k ? -1 : 1) * HIP_W + P[I.sway]) * s, z - P[I.surge] * s);
        hipY = Math.min(hipY, Math.sqrt(Math.max(0.5, legs * legs - dh * dh)) + y);
      });
      // a long stride sinks him a little, no more: past that the heel comes off the floor instead
      hipY = Math.max(hipY, want - SINK * s, 1.7 * s);
    }
    // (a captured clip leans as the runner did: only a keyed one is leaned by his speed)
    const keyed = CLIPS[this.clip].dense ? 0 : 1;
    spine(P, this.body, hipY, j, this.up, this.front, this.left, vf * keyed, vs * keyed);
    put(J.fl, fl[0][0], fl[0][1], fl[0][2]);
    put(J.fr, fl[1][0], fl[1][1], fl[1][2]);
    reach(j, J.jl, J.kl, J.fl, THIGH * s, SHIN * s, 0.25, 0.1, 1);
    reach(j, J.jr, J.kr, J.fr, THIGH * s, SHIN * s, -0.25, 0.1, 1);
    this.vf = vf;
    this.vs = vs;
  }

  /** Where the ball is when it's his, in the scene: where the pose puts it, never out of the reach of the hand that has it. */
  carry(out: V3): V3 {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    let x = -P[I.bx] * s;
    let y = P[I.by] * s + Math.max(0, P[I.hip]) * s;
    let z = P[I.bz] * s;
    const g = Math.max(P[I.gl], P[I.gr]);
    if (g > 0.5) {
      const k = (P[I.gr] >= P[I.gl] ? J.sr : J.sl) * 3;
      const dx = x - j[k];
      const dy = y - j[k + 1];
      const dz = z - j[k + 2];
      const d = Math.hypot(dx, dy, dz);
      const max = (UARM + FARM) * s * 0.97 - PALM;
      if (d > max) {
        x = j[k] + (dx / d) * max;
        y = j[k + 1] + (dy / d) * max;
        z = j[k + 2] + (dz / d) * max;
      }
    }
    return this.world(x, Math.max(BALL_R, y), z, out);
  }

  /** His arms: to where the pose has his hands, or onto the ball (the scene's point) as far as each hand has hold of it. */
  arms(ball: V3 | null) {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    const l = this.left;
    const f = this.front;
    let bx = 0;
    let by = 0;
    let bz = 0;
    if (ball) {
      [bx, bz] = this.local(ball.x, ball.z);
      by = ball.y;
    }
    const grip = CLIPS[this.clip].grip;
    for (const side of [1, -1] as const) {
      const sh = (side > 0 ? J.sl : J.sr) * 3;
      const el = side > 0 ? J.el : J.er;
      const ha = side > 0 ? J.hl : J.hr;
      const ox = P[side > 0 ? I.lx : I.rx] * s * side;
      const oy = P[side > 0 ? I.ly : I.ry] * s;
      const oz = P[side > 0 ? I.lz : I.rz] * s;
      let x = j[sh] + l.x * ox + f.x * oz;
      let y = j[sh + 1] + oy + l.y * ox + f.y * oz;
      let z = j[sh + 2] + l.z * ox + f.z * oz;
      const g = ball ? clamp(P[side > 0 ? I.gl : I.gr], 0, 1) : 0;
      if (g > 0) {
        // on its side (two hands), on top of it (a dribble), or under and behind it (a shot)
        let hx = bx;
        let hy = by;
        let hz = bz;
        if (grip === 'top') hy += PALM;
        else if (grip === 'under' && side < 0) {
          hy -= PALM * 0.7;
          hz -= PALM * 0.7;
        } else hx += side * PALM;
        x += (hx - x) * g;
        y += (hy - y) * g;
        z += (hz - z) * g;
      }
      j[ha * 3] = x;
      j[ha * 3 + 1] = Math.max(0.2 * s, y);
      j[ha * 3 + 2] = z;
      // the elbow: down, out and a little back, swung the way the pose has it
      const k = (side > 0 ? J.sl : J.sr) * 3;
      const pole = elbowPole(l, f, side, x - j[k], j[ha * 3 + 1] - j[k + 1], z - j[k + 2], P[side > 0 ? I.lsw : I.rsw], POLE);
      reach(j, side > 0 ? J.sl : J.sr, el, ha, UARM * s, FARM * s, pole.x, pole.y, pole.z);
    }
  }
}

const TMP: V3 = { x: 0, y: 0, z: 0 };
const POLE: V3 = { x: 0, y: 0, z: 0 };
const FLIP = new Float32Array(N);
