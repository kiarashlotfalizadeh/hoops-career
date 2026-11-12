// One figure's body, each frame: the plan (choreo.ts) says where he is, where he faces and what
// he's doing; this turns that into a pose. It picks the clip, blends from the last one, walks his
// feet (a planted foot stays where it landed until it steps), and solves his arms and legs to the
// points the pose asks for. It decides nothing about the game.
//
// Getting around is one stride blended from the captured gaits either side of his speed (a walk, a jog, a
// run, a sprint), at a man's cadence for that speed and his own build; a planted foot is never dragged
// (he is in the air between strides when he's going faster than it can cover). For the body to read, and
// not yet read by it: `feet[k].pitch` (the roll from heel to toe) and `trail` / `trailSlow` (how far his
// cloth and hair lag his hips).
//
// No three.js here: joints come out as plain numbers in the figure's own frame (x to his left, y up,
// z the way he faces), for the scene to hang meshes on.
import type { Act } from '../choreo';
import {
  ARMS,
  bounces,
  CLIPS,
  DUNK_AT,
  DUNKS,
  FOLLOW,
  GESTURES,
  HANG_UNTIL,
  I,
  isDunk,
  mirror,
  N,
  PASSES,
  REST_POSE,
  sample,
  span,
  TRUNK,
  type ClipId,
  type Gesture,
} from './clips';

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
/** A dunker's middle stays this far from the rim's (on the 6 ft 6 puppet), and he walks back from a leap at this speed, ft a second. */
const DUNK_OFF = 2.0;
/** Which way out from the rim he hangs: the way he came, tipped this much (ft) toward the open floor, away from the board. */
const DUNK_OPEN = 1.5;
const BACK = 9;
/** The rim's height, ft. */
const RIM_Y = 10;
/**
 * A dunker's hands get to the rim: he jumps as high as that takes. The dunk clip's own jump (its highest
 * `hip` key), what he has above his hips at the slam (chest, and an arm up and out to the ring) on the
 * 6 ft 6 puppet, and the most the jump is stretched for a short man.
 */
const DUNK_HIP = 2.3;
const DUNK_ARM = 3.19;
const DUNK_RISE = 1.6;
/** The ball starts for the rim this long (ms) before the slam, and is level with the ring at it. */
const DUNK_REACH = 150;
/** A plan spot this far (ft) from the last frame's is a new possession from fresh spots, not a move (the scene says so of nearer ones: `Drive.cut`). */
const CUT = 14;
/** One pose eases into the next over this long (ms): longer into the buzzer's (arms going up are not thrown up). */
const BLEND_MS = 130;
const BLEND_SLOW = 380;
const BLEND_GAIT = 220;
/** A hand that goes up or down past his shoulder by more than this (ft) swings out in front of him on the way, this far at most. */
const ARC_FROM = 1.5;
const ARC = 0.9;
/** Sliding sideways, the feet keep this much of the floor between them: the trailing one never crosses the leading one. */
const FEET_GAP = 0.5;
/** One way of standing eases into another over this long (ms): hands go to the hips, they aren't thrown there. */
const BLEND_REST = 420;
/**
 * Where he looks. His head turns up to HEAD_MAX (radians) on his shoulders and his chest turns the rest, up to
 * CHEST_MAX and a share of the whole, when his hands are free; LOOK_MAX in all (LOOK_RUN running: a runner looks
 * where he's going). A thing farther round than LOOK_BACK is behind him: he doesn't look for it.
 */
const HEAD_MAX = 1.05;
const CHEST_MAX = 0.3;
const CHEST_SHARE = 0.3;
const LOOK_MAX = 1.35;
const LOOK_RUN = 0.8;
const LOOK_BACK = 2.4;
/** His eyes find a thing in about this long (s): quick, but a turn of the head, not a snap. */
const GAZE_S = 0.13;
/** How hard he has been going, 0..1: running builds it (this much a second for each ft a second), standing lets it go (this much a second). */
const EFFORT_UP = 0.0075;
const EFFORT_DOWN = 0.045;
/** Late in a close game he is at least this tired. */
const TIRED_LATE = 0.45;
/** His breath, standing: the chest lifts this much (radians) at rest, and this much more when he's spent. */
const BREATH = 0.012;
const BREATH_HARD = 0.032;
/** A defender's hands: how far they move about (ft), never still. */
const FLUTTER = 0.08;
/** Starting he leans into it, stopping back against it: radians for each ft a second gained or lost, and at most. */
const LEAN_GO = 0.011;
const LEAN_MAX = 0.13;
/** A jumper's follow-through is held from this long after the release (ms) until the ball gets there. */
const FOLLOW_FROM = 60;
/** A shot's lead-in (the gather, the dip) is played at most this many times quicker to fit a short move. */
const LEAD_IN = 1.6;
/** A dribbler standing with it crosses it over now and then: every this long (ms), give or take half again. */
const CROSS_EVERY = 1500;
/** The most of the floor a planted foot covers under him, from where it lands ahead to where it leaves behind (ft on the 6 ft 6 puppet): past that he is in the air between strides. */
const CONTACT = 2.4;
/** Walking, a foot is down this much of its stride (both are, between steps). */
const DOWN_WALK = 0.56;
/** The gaits going ahead, and the speed (ft a second) each was captured near: between two, he moves as a blend of both on the one stride. */
const AHEAD: readonly [ClipId, number][] = [
  ['walk', 4],
  ['jog', 10],
  ['run', 18],
  ['sprint', 30],
];
const FORWARD = new Set<ClipId>(AHEAD.map((g) => g[0]));
/** Round a bend he leans into it: radians for each ft a second squared across his path, and at most. */
const BANK = 0.0032;
const BANK_MAX = 0.17;
/** With a dead ball a man fidgets (wipes his brow, pulls at his shorts) about this often (ms). */
const FIDGET_EVERY = 2800;

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
  /** He has been put on a fresh spot (a highlight, a skip): he is there, however near it is, not on his way to it. */
  cut?: boolean;
  /** What he looks at (the scene's point, ft): his head turns to it, and his chest a little when his hands are free. */
  look?: V3;
  /** The ball is dead (the line, a timeout, a whistle, the walk up): standing, he may rest. */
  rest?: boolean;
  /** Late in a close game: he shows it when he stands. */
  tired?: boolean;
  /** How long (ms) until the free throw he holds goes up: he bounces it and sets. */
  ft?: number;
  /** The nearest man guarding him when he has the ball, if one is close (the scene's point): he keeps it away from him. */
  press?: { x: number; z: number };
  /** How long (ms) until he passes the ball he has: he draws it in and steps into it. */
  pass?: number;
  /** The game is over (he celebrates or rues it his own way). */
  over?: boolean;
  /** At the buzzer, the teammate he chest-bumps faces him: they go up together. */
  bump?: boolean;
  /** Whose body this is (his player id): what differs from man to man (a dunk, how he stands, a celebration) is his own. */
  who?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const IDLES: ClipId[] = ['idle', 'idle2', 'idle3'];
/** The ways of standing (alert, at rest, spent). */
const STANDING = new Set<ClipId>(['idle', 'idle2', 'idle3', 'shift', 'hips', 'knees']);
/** Clips he holds still in: what breathing shows on. */
const STILL = new Set<ClipId>([...STANDING, 'ready', 'stance', 'hold', 'slump', 'rue', 'screen', 'boxout', 'postUp']);
/** A number from 0 to 1 for a man and a count: the same every time (his own way of doing a thing). */
export function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** A spring with no bounce (x toward `to`, with speed v, `w` its rate a second, `sec` on): it eases off and eases in. */
function spring(x: number, v: number, to: number, w: number, sec: number): [number, number] {
  const k = w * sec;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const off = x - to;
  const t = (v + w * off) * sec;
  return [to + (off + t) * e, (v - w * t) * e];
}
/** The clips with the ball in one hand: they flip when it's in his left. */
const HANDED = new Set<ClipId>(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack', 'crossover', 'hesi']);
/** The dribbles. */
const DRIBBLES = new Set<ClipId>(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack']);
/** A man guarding him nearer than PRESS_NEAR (ft) is on him; farther than PRESS_FAR he is left alone. The ball is kept this far (ft, on the 6 ft 6 puppet) from that man's middle. */
const PRESS_NEAR = 3;
const PRESS_FAR = 5.5;
const PRESS_CLEAR = 1.32;
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
  // (the buzzer is everyone's: the man who had the ball lets go of it, see the scene)
  if (act === 'celebrate') return 'celebrate';
  if (ball)
    return act === 'hold' || act === 'pass' || act === 'stand'
      ? 'hold'
      : moving && sp > 7 && vf > 0
        ? 'dribbleRun'
        : act === 'dribble' || act === 'drive' || act === 'post'
          ? !moving
            ? 'dribble'
            : vf < -0.45 * sp
              ? 'dribbleBack'
              : 'dribbleWalk'
          : 'hold';
  const ahead = vf > 0.6 * sp;
  const gait: ClipId = ahead ? (sp > 28 ? 'sprint' : sp > 14 ? 'run' : sp > 6.5 ? 'jog' : 'walk') : vf < -0.45 * sp ? 'backpedal' : Math.abs(vs) > 0.7 * sp ? 'shuffle' : 'walk';
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
  /** Where its swing started, from him, and when (the stride's count: whole strides and the part of this one). */
  fx: number;
  fz: number;
  p0: number;
  /** It came up ahead of its turn (he sped up or turned over it): the stride whose swing it carries on into, or 0. */
  early: number;
  /** How its toes point (radians, down from level): the heel coming up as he pushes off it, toes up before the heel strikes. For the body's foot bone. */
  pitch: number;
}

/**
 * A dribble, for whoever flies the ball between his hand's touches: which hand (1 his left), how far through the
 * bounce it is (0 as the hand lets it go downward, 1 once a hand has it again: held, it stays 1 and the rest
 * describe the bounce to come), how long the bounce lasts (the bodies' ms), where the hand lets it go and where
 * it meets the floor (the scene's points). `hand` changes only as a hand takes it (a crossover's catch).
 */
export interface Dribble {
  hand: 1 | -1;
  phase: number;
  period: number;
  push: V3;
  floor: { x: number; z: number };
}

/**
 * What hangs off him and moves a beat late (his shorts' hem, his vest, his hair), for the body to read: how far
 * behind his hips it trails, in his own frame (ft: `x` to his left, `y` up, `z` ahead). It swings back through
 * zero as he settles.
 */
export interface Trail {
  x: number;
  y: number;
  z: number;
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
    { x: 0, z: 0, up: 0, swing: false, fx: 0, fz: 0, p0: 0, early: 0, pitch: 0 },
    { x: 0, z: 0, up: 0, swing: false, fx: 0, fz: 0, p0: 0, early: 0, pitch: 0 },
  ];
  /** His cloth and hair, a beat behind him (see Trail): a loose thing and a heavier one. */
  readonly trail: Trail = { x: 0, y: 0, z: 0 };
  readonly trailSlow: Trail = { x: 0, y: 0, z: 0 };
  private readonly tw = new Float64Array(12);
  /** His own way of moving: how quick his feet are for his speed, how he carries his chest and his head, how far his arms swing, how fast his stance ticks over. */
  private tempo = 1;
  private carry0 = 0;
  private nod0 = 0;
  private armK = 1;
  private beat = 1;
  private styled = -1;
  /** His speed, eased (what the blend of gaits goes by), which way he was going a beat ago, and the bank that gives. */
  private spLag = 0;
  private pvx = 0;
  private pvz = 0;
  private bank = 0;
  /** When he next fidgets (ms of his own time). */
  private fidgetIn = FIDGET_EVERY * (0.4 + Math.random());
  /** The man on him (the scene's point), how hard he is pressed (0..1, eased), and how long since he last switched hands for it (ms). */
  private px0 = 0;
  private pz0 = 0;
  private pressed = 0;
  private switched = 0;
  /** A landing: how far into its give he is (ms), and whether he was in the air last frame. */
  private giveT = 1e9;
  private flew = false;
  /** The ball is his this frame, and how many of the bodies' ms go by for one of the play's. */
  private has = false;
  private pace = 1;
  private readonly drib: Dribble = { hand: -1, phase: 1, period: 500, push: { x: 0, y: 0, z: 0 }, floor: { x: 0, z: 0 } };
  /** He has been knocked over (see stumble). */
  private knocked = false;
  private vx = 0;
  private vz = 0;
  /** His speed ahead and to his right, ft a second (the chest leans into them). */
  vf = 0;
  vs = 0;
  private phase = 0;
  private loopT = 0;
  private dwell = 0;
  private blend = 1;
  private blendMs = BLEND_MS;
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
  /** How far a leap has carried him from where the plan has him. */
  private cx = 0;
  private cz = 0;
  /** How long his own time has run with the play's stopped, ms. */
  private over = 0;
  /** The move that time belongs to: what he was doing and how far into it, last frame. */
  private act: Act = 'stand';
  private at = 0;
  /** Where the plan had him last frame. */
  private px = 0;
  private pz = 0;
  /** How much higher than the clip's a dunk's jump is, for his size. */
  private readonly rise: number;
  /** How he stands when he's standing: no two quite alike. */
  private idle: ClipId = IDLES[Math.floor(Math.random() * IDLES.length)];
  /** How long he keeps standing that way (ms), whether it's at rest, and how many ways he has stood. */
  private standMs = 0;
  private resting = false;
  private standN = 0;
  /** Whose body this is (see Drive.who), the dunk he's going up for, and how many he has. */
  private who = 0;
  private dunk: ClipId = 'dunk';
  private dunks = 0;
  /** The pass he's about to make, or making (from his chest, one hand, over his head), and how many he has. */
  private passId: ClipId = 'pass';
  private passes = 0;
  private winding = false;
  /** The pose before what is laid over it (his gaze, a gesture, his breath): what the next clip eases from. */
  private readonly base = new Float32Array(N);
  /** Where he's looking: a heading on the floor and how far up, eased, and how fast each is turning. */
  private gw = 0;
  private gwv = 0;
  private gp = 0;
  private gpv = 0;
  /** How hard he has been going (0..1), his breath, his speed ahead a beat ago and the lean it gives. */
  effort = 0;
  private breath = Math.random();
  private vfLag = 0;
  private leanGo = 0;
  /** A little reset in a stance: when the next one comes (ms), and how far into one he is. */
  private resetIn = 1500 + Math.random() * 2000;
  private resetT = 1e9;
  /** A dribbler's next crossover (play ms), the shot he last took, and how far his follow-through is held. */
  private crossIn = CROSS_EVERY * (0.5 + Math.random());
  private shot: ClipId | null = null;
  private fw = 0;
  /** He has gone up for his chest bump at the buzzer. */
  private bumped = false;
  /** A gesture asked for (made as soon as he's free), the one he's making, and where its hand goes (his teammate's for a five). */
  private wish: { id: Gesture; mate: Puppet | null; age: number; wait: number } | null = null;
  private gest: { id: Gesture; t: number; mate: Puppet | null; w: number } | null = null;
  private reach: { x: number; y: number; z: number; w: number; side: 1 | -1 } | null = null;

  constructor(body: Body) {
    this.body = body;
    this.rise = clamp(((RIM_Y - 0.15) / body.s - DUNK_ARM - HIP) / DUNK_HIP, 1, DUNK_RISE);
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
   * slower than his body runs (COURT3D_PACE), so his feet keep up with where the plan has him. `ease`
   * is the clock's own time (ms): he turns and his arms go up at the buzzer on it, no faster a frame
   * when the game is played fast.
   */
  update(d: Drive, dt: number, own = dt, ease = own) {
    const { s } = this.body;
    const P = this.pose;
    // a new possession from fresh spots (a highlight, a skip, a quarter that ended on his dunk): he is put there, and
    // whatever he was in the middle of is dropped. (A leap is measured from the rim: left running, it would hold
    // him at the old basket and walk him the length of the floor.)
    const cut = this.placed && (!!d.cut || Math.hypot(d.x - this.px, d.z - this.pz) > CUT);
    this.px = d.x;
    this.pz = d.z;
    if (cut) {
      this.hasAim = false;
      this.cx = this.cz = 0;
      P[I.leap] = 0;
      P[I.air] = 0;
    }
    if (d.aim) {
      this.ax = d.aim.x;
      this.az = d.aim.z;
      this.hasAim = true;
    }
    // where the plan has him, carried toward the rim by a leap
    // (a dunker hangs from the rim at arm's length: any nearer and his head is in the net)
    let cx = 0;
    let cz = 0;
    const leap = P[I.leap];
    if (leap > 0.001 && this.hasAim) {
      const gx = this.ax - d.x;
      const gz = this.az - d.z;
      const g = Math.hypot(gx, gz);
      if (isDunk(this.clip)) {
        // (wherever the plan has him, under the rim too: he is carried out to arm's length from it, on the side he came from)
        const ox = -gx + (this.ax < 0 ? DUNK_OPEN : -DUNK_OPEN) * s;
        const ol = Math.hypot(ox, gz) || 1;
        // (out there before he is head-high: the jump gets him up sooner than the clip's leap gets him out)
        const out = Math.min(1, leap * 1.4);
        cx = (gx + (ox / ol) * DUNK_OFF * s) * out;
        cz = (gz + (-gz / ol) * DUNK_OFF * s) * out;
      } else if (g > 0.01) {
        const go = Math.max(0, g - s);
        cx = (gx / g) * go * leap;
        cz = (gz / g) * go * leap;
      }
    }
    // (the leap takes him there; coming down he is where he landed, and walks back from it)
    const back = Math.hypot(cx - this.cx, cz - this.cz);
    const most = Math.hypot(cx, cz) >= Math.hypot(this.cx, this.cz) || P[I.air] > 0.5 ? Infinity : (BACK * own) / 1000;
    if (back <= most) [this.cx, this.cz] = [cx, cz];
    else {
      this.cx += ((cx - this.cx) / back) * most;
      this.cz += ((cz - this.cz) / back) * most;
    }
    const rx = d.x + this.cx;
    const rz = d.z + this.cz;
    const jumped = !this.placed || cut || Math.hypot(rx - this.x, rz - this.z) > CUT;
    if (jumped) {
      this.x = rx;
      this.z = rz;
      this.yaw = d.yaw;
      this.vx = this.vz = 0;
      this.one = null;
      this.blend = 1;
      this.cx = this.cz = 0;
      this.gw = d.yaw;
      this.gwv = 0;
      this.gest = this.wish = null;
      this.settle();
    } else if (own > 0) {
      const k = 1 - Math.exp(-own / 70);
      this.vx += ((rx - this.x) / own - this.vx) * k;
      this.vz += ((rz - this.z) / own - this.vz) * k;
      this.x = rx;
      this.z = rz;
      // (a dunker turns to the rim as he goes up: his hands go where he is looking)
      const up = isDunk(this.clip) && this.hasAim && leap > 0.2;
      const face = up ? Math.atan2(this.ax - rx, this.az - rz) : d.yaw;
      // (in the air he turns in his own time: played fast, he still has the rim in front of him when he gets to it)
      this.yaw += wrap(face - this.yaw) * (1 - Math.exp(-(up ? Math.max(ease, own * 0.6) : ease) / (ONE[d.act] ? 45 : 95)));
    }
    if (own <= 0 && this.placed && !jumped) return;
    this.placed = true;

    const [fx, fz, sx, sz] = this.dirs();
    const sp = Math.hypot(this.vx, this.vz) * 1000;
    const vf = (this.vx * fx + this.vz * fz) * 1000;
    const vs = (this.vx * sx + this.vz * sz) * 1000;

    // the move he's in the middle of
    // (the play's clock stopped under him, a timeout or the buzzer: he finishes it on his own time, and comes to a stand)
    // (that time stays his until the next move: the play going on again doesn't take him back to where its clock stopped)
    this.has = d.ball;
    if (dt > 0 && own > 0) this.pace = own / dt;
    if (d.who !== undefined) this.who = d.who;
    if (this.styled !== this.who) this.style();
    // (each dunk is one of his: two hands, one, or hanging on the rim)
    if (d.act === 'dunk' && this.act !== 'dunk') this.dunk = DUNKS[Math.floor(hash(this.who, ++this.dunks) * DUNKS.length)];
    // (each pass is one of his: picked as he draws it in, or as it goes if he had no time to)
    const winds = d.ball && d.pass !== undefined && d.act !== 'pass';
    if ((winds && !this.winding) || (d.act === 'pass' && this.act !== 'pass' && !this.winding))
      this.passId = PASSES[Math.floor(hash(this.who, 40 + ++this.passes) * PASSES.length)];
    this.winding = winds || (this.winding && d.act === 'pass');
    if (d.act !== this.act || d.ms < this.at) this.over = 0;
    else if (dt <= 0) this.over += own;
    this.act = d.act;
    this.at = d.ms;
    if (!d.over) this.bumped = false;
    const ms = d.ms + this.over;
    const one = ONE[d.act];
    if (one) {
      const id = one[0] === 'dunk' ? this.dunk : one[0] === 'pass' ? this.passId : one[0];
      // (a move shorter than the clip's lead-in plays the lead-in quicker, up to LEAD_IN times: a shooter still
      // gathers and dips before he rises, he doesn't start halfway up)
      const lead = -span(CLIPS[id])[0];
      const tau = one[1] === 'end' ? ms - d.dur : ms;
      this.one = { id, tau: tau < 0 && d.dur > 0 ? Math.max(-lead, tau * clamp(lead / d.dur, 1, LEAD_IN)) : tau };
    } else if (d.act === 'release' || d.act === 'land') this.one = { id: this.one?.id ?? (d.act === 'release' ? 'jumper' : 'contest'), tau: Math.max(this.one?.tau ?? 0, ms) };
    else if (d.act === 'drive' && d.ball && d.ms < CROSS_MS) this.one = { id: 'crossover', tau: d.ms };
    // (at the line: his routine, timed to end as the shot's own move begins)
    else if (d.ball && d.ft !== undefined && d.ft <= -span(CLIPS.ftRoutine)[0]) this.one = { id: 'ftRoutine', tau: -d.ft };
    // (about to pass: the wind-up, timed to end as the pass's own move begins)
    else if (winds && d.pass! <= -span(CLIPS[this.passId])[0]) this.one = { id: this.passId, tau: -d.pass! };
    else if (d.bump && !this.bumped) {
      this.one = { id: 'bump', tau: 0 };
      this.bumped = true;
    } else if (this.one) this.one.tau += dt > 0 ? dt : own;
    // (standing with it, he crosses it over now and then)
    else if (d.act === 'dribble' && d.ball && sp < 7 && (this.crossIn -= dt) <= 0) {
      // (or a hesitation: up out of it and back down)
      // (never across into a man who is on him)
      this.one = { id: this.pressed > 0.5 || hash(this.who, 60 + this.standN) < 0.4 ? 'hesi' : 'crossover', tau: 0 };
      this.crossIn = CROSS_EVERY * (0.5 + hash(this.who, this.standN++));
    }
    // knocked over, as soon as he's on the floor and free
    if (this.knocked && (!this.one || this.one.id === 'stop' || this.one.id === 'closeout') && P[I.air] < 0.3 && !d.ball) {
      this.one = { id: 'stumble', tau: 0 };
      this.knocked = false;
    }
    // pulling up out of a run: the stop is a take's (a defender's ends down in his stance)
    const plain = baseClip(d.act, d.ball, sp, vf, vs);
    if (!this.one && !d.ball && !d.over && sp < 2.5 && this.spLag > 8 && CLIPS[this.clip].kind === 'gait')
      this.one = { id: plain === 'ready' || plain === 'stance' ? 'closeout' : 'stop', tau: 0 };
    else if (this.one && (this.one.id === 'stop' || this.one.id === 'closeout') && sp > 6) this.one = null;
    if (this.one && (this.one.id === 'jumper' || this.one.id === 'freeThrow')) this.shot = this.one.id;
    else if (d.act !== 'release') this.shot = null;
    if (this.one && this.one.tau > span(CLIPS[this.one.id])[1]) {
      // (a crossover leaves the ball in his other hand)
      if (this.one.id === 'crossover') this.lefty = !this.lefty;
      this.one = null;
    }
    if (!d.ball && !this.one) this.lefty = false;
    const acting = this.one && this.one.tau >= span(CLIPS[this.one.id])[0] ? this.one : null;

    let id = acting ? acting.id : plain;
    if (id === 'idle') id = this.stand(d, own);
    // (the buzzer: each man takes it his own way)
    else if (id === 'celebrate' && d.over) id = hash(this.who, 7) < 0.5 ? 'celebrate' : 'cheer';
    else if (id === 'rue' && d.over) id = (['rue', 'slump', 'hips'] as const)[Math.floor(hash(this.who, 11) * 3)];
    // (a gait isn't swapped for another on a flicker of speed)
    this.dwell += own;
    if (!acting && id !== this.clip && CLIPS[this.clip].kind !== 'shot' && this.dwell < 140) id = this.clip;
    if (id !== this.clip && FORWARD.has(id) && FORWARD.has(this.clip)) {
      // (a walk into a jog into a run is one stride blended by his speed: nothing to ease between)
      this.clip = id;
      this.dwell = 0;
    } else if (id !== this.clip) {
      this.from.set(this.base);
      this.blend = 0;
      const rest = STANDING.has(id) && (STANDING.has(this.clip) || id === 'knees' || id === 'hips');
      // (into and out of a run takes a stride, not a snap)
      const gait = CLIPS[id].kind === 'gait' || CLIPS[this.clip].kind === 'gait';
      this.clip = id;
      this.dwell = 0;
      this.blendMs = id === 'celebrate' || id === 'rue' || id === 'cheer' || id === 'slump' ? BLEND_SLOW : rest ? BLEND_REST : gait && !acting ? BLEND_GAIT : BLEND_MS;
    }
    // (put somewhere new, he is in his new pose: nothing of the old one is eased out of)
    if (cut) this.blend = 1;
    const c = CLIPS[id];
    // (each man's stance ticks over at his own rate: ten of them never breathe as one)
    this.loopT += own * this.beat;
    this.spLag += (sp - this.spLag) * (1 - Math.exp(-own / 160));
    if (FORWARD.has(id)) this.stride(this.spLag, this.want);
    else sample(c, c.kind === 'shot' ? acting!.tau : c.kind === 'gait' ? this.phase : this.loopT / c.dur, this.want);
    if (this.lefty && HANDED.has(id)) mirror(this.want);
    // (a slide is one clip, going left: going right it's flipped, eased over so he doesn't snap)
    this.flip += ((id === 'shuffle' && vs > 0 ? 1 : 0) - this.flip) * (1 - Math.exp(-own / 110));
    if (this.flip > 0.01) {
      FLIP.set(this.want);
      mirror(FLIP);
      for (let i = 0; i < N; i++) this.want[i] += (FLIP[i] - this.want[i]) * this.flip;
    }
    const B = this.base;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + (this.blendMs === BLEND_SLOW ? ease : own) / this.blendMs);
      const w = smooth(this.blend);
      for (let i = 0; i < N; i++) B[i] = this.from[i] + (this.want[i] - this.from[i]) * w;
      // (a hand going from his side to over his head goes round in front of him: straight up it would pass
      // through his own shoulder, and the elbow would whip round it)
      const out = Math.sin(Math.PI * w) * ARC;
      B[I.lz] += out * clamp((Math.abs(this.want[I.ly] - this.from[I.ly]) - ARC_FROM) / ARC_FROM, 0, 1);
      B[I.rz] += out * clamp((Math.abs(this.want[I.ry] - this.from[I.ry]) - ARC_FROM) / ARC_FROM, 0, 1);
    } else B.set(this.want);
    // (a dunk's jump, as high as his arms need)
    if (isDunk(id) && B[I.hip] > 0) B[I.hip] *= this.rise;
    // what is laid over the pose: a held follow-through, a gesture, his breath and his hands, where he looks
    P.set(B);
    this.manner(id);
    this.shield(d, id, own);
    this.land(own);
    this.follow(d, own);
    this.gesture(d, own);
    this.life(d, id, sp, vf, own);
    this.gaze(d, ease, sp);

    this.step(own, sp);
    this.solve(vf, vs);
    this.trails(own);
  }

  /** The bounce he's dribbling, or null when he isn't (see Dribble). Read after `update`. */
  get dribble(): Dribble | null {
    const id = this.clip;
    if (!this.has || !(DRIBBLES.has(id) || id === 'crossover' || id === 'hesi')) return null;
    const c = CLIPS[id];
    const loop = c.kind !== 'shot';
    const all = bounces(c);
    if (!all.length || (!loop && !this.one)) return null;
    const t = loop ? this.loopT / c.dur - Math.floor(this.loopT / c.dur) : this.one!.tau;
    // (the one he's in, else the next to come: round to the loop's first, or a one-off's last, done)
    const b = all.find((x) => t <= x.on) ?? (loop ? all[0] : all[all.length - 1]);
    const out = this.drib;
    const flying = t >= b.off && t <= b.on;
    out.phase = flying ? clamp((t - b.off) / (b.on - b.off || 1), 0, 1) : 1;
    out.period = (b.on - b.off) * (loop ? c.dur / this.beat : this.pace);
    const mine = this.lefty ? 1 : -1;
    out.hand = (b.cross && t > b.on ? -mine : mine) as 1 | -1;
    const { s } = this.body;
    const flip = this.lefty && HANDED.has(id) ? -1 : 1;
    sample(c, b.off, MIX);
    this.world(-MIX[I.bx] * flip * s, (MIX[I.by] + Math.max(0, MIX[I.hip])) * s + PALM, MIX[I.bz] * s, out.push);
    sample(c, b.low, MIX);
    const f = this.world(-MIX[I.bx] * flip * s, 0, MIX[I.bz] * s, TMP);
    out.floor.x = f.x;
    out.floor.z = f.z;
    return out;
  }

  /** A hanging dunk: his hands are on the ring (from the slam until he lets go). The rim's spring holds down while they are. */
  get onRim(): boolean {
    return this.clip === 'dunkHang' && this.hasAim && !!this.one && this.one.tau >= DUNK_AT && this.one.tau <= HANG_UNTIL;
  }

  /** Knocked off his feet (a foul): he staggers, goes down onto a hand and gets up, as soon as he's free to. */
  stumble() {
    this.knocked = true;
  }

  /**
   * A man on him: he keeps his body between that man and the ball. It goes to the hand away from him (a
   * crossover, if it's in the wrong one), his chest turns that way, he sits lower and his free arm comes up as a bar.
   */
  private shield(d: Drive, id: ClipId, own: number) {
    const P = this.pose;
    let want = 0;
    let lx = 0;
    if (d.ball && d.press) {
      this.px0 = d.press.x;
      this.pz0 = d.press.z;
      let lz: number;
      [lx, lz] = this.local(d.press.x, d.press.z);
      want = clamp((PRESS_FAR * this.body.s - Math.hypot(lx, lz)) / ((PRESS_FAR - PRESS_NEAR) * this.body.s), 0, 1);
    }
    this.pressed += (want - this.pressed) * (1 - Math.exp(-own / 160));
    this.switched += own;
    const w = this.pressed;
    if (w < 0.02 || !DRIBBLES.has(id)) return;
    // (the ball's side: 1 his left. The man on that side of him: it goes across)
    const side = this.lefty ? 1 : -1;
    if (lx * side > 0.4 && w > 0.5 && !this.one && this.switched > 900) {
      this.one = { id: 'crossover', tau: 0 };
      this.switched = 0;
    }
    if (lx * side > 0) return;
    P[I.twist] += side * 0.32 * w;
    P[I.hip] -= 0.1 * w;
    P[I.lean] += 0.05 * w;
    const [ax, ay, az] = side > 0 ? [I.rx, I.ry, I.rz] : [I.lx, I.ly, I.lz];
    P[ax] += (0.8 - P[ax]) * w * 0.8;
    P[ay] += (-0.85 - P[ay]) * w * 0.8;
    P[az] += (0.8 - P[az]) * w * 0.8;
  }

  /** Coming down from a jump his legs give: a dip of his hips as his feet take him, less where the clip has its own. */
  private land(own: number) {
    const P = this.pose;
    const up = P[I.air] > 0.5;
    if (this.flew && !up) this.giveT = 0;
    this.flew = up;
    if (this.giveT > 320) return;
    this.giveT += own;
    P[I.hip] -= 0.26 * Math.sin((Math.PI * Math.min(320, this.giveT)) / 320) * clamp((P[I.hip] + 0.4) / 0.4, 0, 1) * (1 - clamp(P[I.air], 0, 1));
  }

  /** What is his own: by who he is and how he's built, the same every game. A big man's feet turn over slower; no two carry themselves alike. */
  private style() {
    const w = this.who;
    this.styled = w;
    const { s, bulk } = this.body;
    this.tempo = (1 + (hash(w, 21) - 0.5) * 0.14) / (Math.sqrt(s) * (1 + (bulk - 1) * 0.3));
    this.carry0 = (hash(w, 22) - 0.5) * 0.07;
    this.nod0 = (hash(w, 23) - 0.5) * 0.1;
    this.armK = 0.82 + hash(w, 24) * 0.36;
    this.beat = 0.84 + hash(w, 25) * 0.32;
  }

  /** The stride at a speed: the two captured gaits either side of it, on the one phase, mixed. */
  private stride(sp: number, out: Float32Array) {
    let k = 0;
    while (k < AHEAD.length - 2 && sp > AHEAD[k + 1][1]) k++;
    const w = smooth(clamp((sp - AHEAD[k][1]) / (AHEAD[k + 1][1] - AHEAD[k][1]), 0, 1));
    sample(CLIPS[AHEAD[k][0]], this.phase, out);
    if (w <= 0) return;
    sample(CLIPS[AHEAD[k + 1][0]], this.phase, MIX);
    for (let i = 0; i < N; i++) out[i] += (MIX[i] - out[i]) * w;
  }

  /** His own carriage laid on the clip's: how upright he is, how his head sits, how far his arms swing in a gait. */
  private manner(id: ClipId) {
    const P = this.pose;
    const ground = 1 - clamp(P[I.air], 0, 1);
    P[I.lean] += this.carry0 * ground;
    P[I.nod] += this.nod0;
    if (CLIPS[id].kind === 'gait' && id !== 'shuffle') {
      P[I.lz] *= this.armK;
      P[I.rz] *= this.armK;
      P[I.twist] *= this.armK;
    }
  }

  /** His cloth and hair: two springs towed by his hips, a quick one and a heavy one, read in his own frame. */
  private trails(own: number) {
    const sec = Math.min(0.05, own / 1000);
    const j = this.j;
    const h = this.world(j[J.hips * 3], j[J.hips * 3 + 1], j[J.hips * 3 + 2], TMP);
    const tw = this.tw;
    const c = Math.cos(this.yaw);
    const sn = Math.sin(this.yaw);
    for (const [o, w, out] of [
      [0, 16, this.trail],
      [6, 9, this.trailSlow],
    ] as const) {
      const far = Math.hypot(tw[o] - h.x, tw[o + 1] - h.y, tw[o + 2] - h.z);
      if (sec <= 0 || far > 3 || !Number.isFinite(far)) {
        tw[o] = h.x;
        tw[o + 1] = h.y;
        tw[o + 2] = h.z;
        tw[o + 3] = tw[o + 4] = tw[o + 5] = 0;
      } else
        for (let a = 0; a < 3; a++) {
          const to = a === 0 ? h.x : a === 1 ? h.y : h.z;
          // (a little springy: it swings past and back once)
          tw[o + 3 + a] += ((to - tw[o + a]) * w * w - tw[o + 3 + a] * w * 1.1) * sec;
          tw[o + a] += tw[o + 3 + a] * sec;
        }
      const dx = tw[o] - h.x;
      const dz = tw[o + 2] - h.z;
      out.x = dx * c - dz * sn;
      out.y = tw[o + 1] - h.y;
      out.z = dx * sn + dz * c;
    }
  }

  /**
   * How he stands, for as long as he does: alert while the ball is live; at rest while it's dead, hands on his
   * hips or his weight on one leg, bent over with his hands on his knees when he's just run the floor or it's
   * late; and now and then a change.
   */
  private stand(d: Drive, own: number): ClipId {
    const rest = !!d.rest;
    const fresh = !STANDING.has(this.clip) || rest !== this.resting;
    this.standMs -= own;
    if (!fresh && this.standMs > 0) return this.idle;
    this.resting = rest;
    const r = hash(this.who, ++this.standN);
    const tired = Math.max(this.effort, d.tired ? TIRED_LATE : 0);
    if (!rest) this.idle = IDLES[Math.floor(r * IDLES.length)];
    else if (fresh && tired > 0.5) this.idle = 'knees';
    else if (tired > 0.3) this.idle = r < 0.6 ? 'hips' : 'shift';
    else this.idle = r < 0.3 ? 'hips' : r < 0.65 ? 'shift' : r < 0.85 ? 'idle' : 'idle3';
    this.standMs = this.idle === 'knees' ? 1600 + r * 1200 : 2600 + r * 3200;
    return this.idle;
  }

  /** A gesture for his arms and head (see GESTURES): made as soon as his hands are free, or dropped if they aren't within `wait` ms. `mate`: whose hand he slaps for a five. */
  cue(id: Gesture, mate: Puppet | null = null, wait = 2500) {
    if (this.gest?.id === id || this.wish?.id === id) return;
    this.wish = { id, mate, age: 0, wait };
  }

  /** The gesture he's making, if any. */
  get gesturing(): Gesture | null {
    return this.gest?.id ?? null;
  }

  /** A jumper's or a free throw's follow-through, held: the arm stays up until the ball gets there. */
  private follow(d: Drive, own: number) {
    const P = this.pose;
    const up = this.shot === 'jumper' || this.shot === 'freeThrow';
    const on = up && ((this.one !== null && this.one.tau > FOLLOW_FROM) || (this.one === null && d.act === 'release'));
    this.fw += ((on ? 1 : 0) - this.fw) * (1 - Math.exp(-own / (on ? 90 : 240)));
    if (this.fw < 0.005) return;
    for (const [c, v] of FOLLOWED) P[c] += (v - P[c]) * this.fw;
  }

  /** His arms (and a little of his head) taken over by the gesture he's making, eased in and out of whatever he's doing. */
  private gesture(d: Drive, own: number) {
    const P = this.pose;
    this.reach = null;
    // (busy: the ball in his hands, a shot or a catch, off the floor)
    const busy = d.ball || (this.one !== null && this.one.id !== 'bump') || P[I.air] > 0.3;
    if (this.wish) {
      this.wish.age += own;
      if (!busy && !this.gest) {
        this.gest = { id: this.wish.id, t: 0, mate: this.wish.mate, w: 0 };
        this.wish = null;
      } else if (this.wish.age > this.wish.wait) this.wish = null;
    }
    const g = this.gest;
    if (!g) return;
    const c = GESTURES[g.id];
    g.t += own;
    const [, end] = span(c);
    if (g.t >= end) {
      this.gest = null;
      return;
    }
    // (in over its first key, out over its last; let go at once if the ball comes to him)
    const into = c.at[1];
    const outOf = end - c.at[c.at.length - 2];
    const env = smooth(clamp(g.t / into, 0, 1)) * smooth(clamp((end - g.t) / outOf, 0, 1));
    g.w += ((busy ? 0 : env) - g.w) * (busy ? 1 - Math.exp(-own / 60) : 1);
    if (busy && g.w < 0.02) {
      this.gest = null;
      return;
    }
    sample(c, g.t, G);
    // (a five is slapped with the hand nearer him)
    let side: 1 | -1 = -1;
    if (g.mate) {
      const [mx] = this.local(g.mate.x, g.mate.z);
      if (mx > 0) {
        mirror(G);
        side = 1;
      }
      // (where the two hands meet: between them, above their heads, moving with them)
      const peak = clamp(1 - Math.abs(g.t - 360) / 220, 0, 1);
      this.reach = { x: (this.x + g.mate.x) / 2, y: 7.3 * ((this.body.s + g.mate.body.s) / 2), z: (this.z + g.mate.z) / 2, w: smooth(peak) * g.w, side };
    }
    for (const k of ARMS) P[k] += (G[k] - P[k]) * g.w;
    for (const k of TRUNK) P[k] += (G[k] - REST_POSE[k]) * g.w;
  }

  /**
   * What keeps a man alive between the moves the plan gives him: his breath (deeper and quicker the harder he
   * has been going), a defender's hands that are never still and the little reset he makes in his stance,
   * and the lean of starting and stopping.
   */
  private life(d: Drive, id: ClipId, sp: number, vf: number, own: number) {
    const P = this.pose;
    const k = own / 1000;
    this.effort = clamp(this.effort + (sp > 12 ? k * sp * EFFORT_UP : -k * EFFORT_DOWN), 0, 1);
    const tired = Math.max(this.effort, d.tired ? TIRED_LATE : 0);
    this.breath += k * (0.24 + 0.42 * tired);
    const b = Math.sin(this.breath * Math.PI * 2);
    const deep = (BREATH + BREATH_HARD * tired) * (STILL.has(id) ? 1 : 0.3);
    P[I.lean] -= b * deep;
    P[I.nod] += b * deep * 0.6;
    if (!d.ball && !this.one) {
      P[I.ly] += b * deep * 0.9;
      P[I.ry] += b * deep * 0.9;
    }
    const t = this.loopT / 1000;
    const ph = this.who * 0.37;
    if (id === 'stance' || id === 'ready' || id === 'shuffle') {
      const a = FLUTTER * (id === 'shuffle' ? 0.5 : 1);
      P[I.ly] += a * Math.sin(t * 10.7 + ph);
      P[I.lz] += a * 0.7 * Math.sin(t * 8.3 + ph * 2);
      P[I.ry] += a * Math.sin(t * 11.9 + ph * 3);
      P[I.rz] += a * 0.7 * Math.sin(t * 7.6 + ph * 5);
      if (id !== 'shuffle' && (this.resetIn -= own) <= 0) {
        this.resetT = 0;
        this.resetIn = 2200 + hash(this.who, this.standN++) * 2400;
      }
    }
    if (this.resetT < 340) {
      this.resetT += own;
      P[I.hip] -= 0.08 * Math.sin((Math.PI * Math.min(340, this.resetT)) / 340);
    }
    // (starting he leans into it, stopping back against it; not in a shot or in the air)
    const gain = vf - this.vfLag;
    this.vfLag += gain * (1 - Math.exp(-own / 220));
    const want = this.one || P[I.air] > 0.2 ? 0 : clamp(gain * LEAN_GO, -LEAN_MAX * 0.75, LEAN_MAX);
    this.leanGo += (want - this.leanGo) * (1 - Math.exp(-own / 90));
    P[I.lean] += this.leanGo;
    // (round a bend he leans into it: by how hard his path is turning, never from a stop or a start)
    let bank = 0;
    if (own > 0 && sp > 6 && !this.one && P[I.air] < 0.2) {
      const [, , sx, sz] = this.dirs();
      const across = (((this.vx - this.pvx) * sx + (this.vz - this.pvz) * sz) * 1e6) / own;
      bank = clamp(-across * BANK, -BANK_MAX, BANK_MAX);
    }
    this.pvx = this.vx;
    this.pvz = this.vz;
    this.bank += (bank - this.bank) * (1 - Math.exp(-own / 200));
    P[I.tilt] += this.bank;
    P[I.proll] += this.bank * 0.4;
    // (left to himself with a dead ball he wipes his brow or pulls at his shorts)
    if (this.gest || this.wish || d.ball || this.one || d.over) return;
    if (d.rest && STANDING.has(id) && id !== 'knees' && (this.fidgetIn -= own) <= 0) {
      this.fidgetIn = FIDGET_EVERY * (0.5 + hash(this.who, this.standN++));
      this.cue(tired > 0.35 && hash(this.who, this.standN) < 0.6 ? 'wipe' : 'tug', null, 400);
    }
  }

  /**
   * Where he looks: his head turns to the thing (Drive.look), his chest a little with it when his hands are
   * free, and up or down to it. Eased on the clock as a heading on the floor, so his eyes stay on it as his
   * body turns; a runner keeps his eyes nearer the way he's going, and a thing behind him isn't looked for.
   */
  private gaze(d: Drive, ease: number, sp: number) {
    const P = this.pose;
    const { s } = this.body;
    let to = this.yaw;
    let pitch = 0;
    if (d.look) {
      const dx = d.look.x - this.x;
      const dz = d.look.z - this.z;
      const flat = Math.hypot(dx, dz);
      const head = Math.atan2(dx, dz);
      if (flat > 0.8 && Math.abs(wrap(head - this.yaw)) < LOOK_BACK) {
        to = head;
        const eye = (HIP + TORSO + 0.6 + Math.max(-0.8, P[I.hip])) * s;
        pitch = Math.atan2(d.look.y - eye, flat);
      }
    }
    const lim = sp > 14 ? LOOK_RUN : LOOK_MAX;
    const sec = ease / 1000;
    if (sec > 0) {
      const w = 2 / GAZE_S;
      [this.gw, this.gwv] = spring(this.gw, this.gwv, this.gw + wrap(to - this.gw), w, sec);
      [this.gp, this.gpv] = spring(this.gp, this.gpv, clamp(pitch, -0.55, 0.75), w, sec);
    }
    // (never wound round farther than he can look)
    const rel = clamp(wrap(this.gw - this.yaw), -lim, lim);
    this.gw = this.yaw + rel;
    const free = !d.ball && !this.one ? 1 - clamp(P[I.air], 0, 1) : 0;
    const chest = clamp(rel * CHEST_SHARE, -CHEST_MAX, CHEST_MAX) * free;
    // (the head is turned from where his chest faces, which his clip may be swinging: it stays on the thing)
    P[I.turn] += clamp(rel - chest - P[I.twist], -HEAD_MAX, HEAD_MAX);
    P[I.twist] += chest;
    P[I.nod] += clamp(this.gp, -0.55, 0.75) * 1.05;
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
      f.early = 0;
      f.pitch = 0;
    });
  }

  /**
   * The gait: one foot swings to where the next stride will need it while the other stays where it landed.
   * His feet turn over as a man's do for his speed (a walker's two steps a second, a sprinter's four and a
   * half), and no faster: what a planted foot can't cover he covers in the air between strides.
   */
  private step(dt: number, sp: number) {
    const { s } = this.body;
    const [, , sx, sz] = this.dirs();
    const w = (HIP_W + 0.08 + this.pose[I.wide] * 0.6) * s;
    const homeX = (k: number) => this.x + sx * w * (k ? 1 : -1);
    const homeZ = (k: number) => this.z + sz * w * (k ? 1 : -1);
    const going = sp > 1.2;
    const ahead = this.vf > 0.6 * sp;
    const back = this.vf < -0.45 * sp;
    // steps a second: a walk's, easing into a run's
    const walk = 1.45 + 0.1 * sp;
    const run = 2.6 + (sp - 7) * 0.055;
    const rate = Math.min(4.6, walk + (run - walk) * smooth(clamp((sp - 5.5) / 3.5, 0, 1))) * this.tempo;
    // (backing up or sliding he takes short quick steps: a long one would cross his feet or turn his hips)
    const reachOf = ahead ? Infinity : (back ? 2.4 : 2) * s;
    const away = (f: Foot, k: number) => Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > 0.5 * s;
    let cadence = going ? Math.min(Math.max(rate, sp / reachOf), 6.5) : 0;
    // standing: a foot left out of place (or caught mid-step) takes one step home, and then both stay down
    if (!going && this.feet.some((f, k) => f.swing || away(f, k))) cadence = 3.4;
    const cycle = cadence ? 2 / cadence : 0;
    this.phase += cadence ? dt / 1000 / cycle : 0;
    // how much of its stride a foot is down: a walker's more than half, a runner's only as long as it can stay under him
    // (less in a crouch: a bent leg reaches less far)
    const crouch = 1 + Math.min(0, this.pose[I.hip] + 0.13) * 0.6;
    const down = going ? clamp((CONTACT * s * crouch) / (sp * cycle), 0.08, DOWN_WALK) : 0.5;
    const pace = ahead ? clamp((sp - 6) / 12, 0, 1) : 0;
    const lift = (ahead ? clamp(0.3 + sp * 0.05, 0.3, 1.9) : clamp(0.3 + sp * 0.022, 0.3, 0.8)) * s;
    const sideways = Math.abs(this.vs) > Math.abs(this.vf) && sp > 1.2;
    const vl = Math.hypot(this.vx, this.vz) || 1;
    this.feet.forEach((f, k) => {
      const p = this.phase + (k ? 0.5 : 0);
      const n = Math.floor(p);
      const q = (p - n) / (1 - down);
      // (a planted foot he has left behind, or turned away from, comes up now, ahead of its turn: he sped up, or cut.
      // It is never dragged to keep time)
      if (!f.swing && !f.early && going && q >= 1 && Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > (CONTACT / 2 + 0.3) * s) f.early = n + 1;
      const end = (f.early || n) + (1 - down);
      if (f.early && (p >= end || !cadence)) f.early = 0;
      // (standing, a foot that is home stays down, and one that isn't waits for the start of its stride)
      const swinging = f.early ? true : cadence > 0 && q < 1 && (going || f.swing || (q < 0.5 && away(f, k)));
      if (swinging && !f.swing) {
        // (where it leaves the floor, measured from him: it swings through under him however fast he goes)
        f.fx = f.x - this.x;
        f.fz = f.z - this.z;
        f.p0 = p;
      }
      // (the frame its stride ends it is put down where the step was going: not left hanging short of it)
      const landing = f.swing && !swinging && cadence > 0;
      f.swing = swinging;
      let toes = 0;
      if (swinging || landing) {
        // it lands ahead of him by half of what he'll cover while it's down
        // (never farther than a leg reaches without sinking him)
        const till = ((landing ? 0 : end - p) + down / 2) * cycle * 1000;
        const lead = Math.min(1, (REACH * s * crouch) / (Math.hypot(this.vx, this.vz) * till || 1));
        // (a stride picked up partway through still starts from where the foot was)
        const u = landing || end - f.p0 < 0.01 ? 1 : clamp((p - f.p0) / (end - f.p0), 0, 1);
        const tx = homeX(k) - this.x + this.vx * till * lead;
        const tz = homeZ(k) - this.z + this.vz * till * lead;
        // it leaves the floor still (so it trails behind him a moment, the heel coming up) and is still again as it
        // lands (drawn back under him, not thrown down ahead and dragged): a curve from one to the other
        const span = Math.hypot(tx - f.fx, tz - f.fz);
        const swingMs = Math.max(0, end - f.p0) * cycle * 1000;
        const m = going ? Math.min(vl * swingMs, span * 0.9) / vl : 0;
        const u2 = u * u;
        const u3 = u2 * u;
        const h01 = 3 * u2 - 2 * u3;
        const h1 = u3 - 2 * u2 + u + (u3 - u2);
        f.x = this.x + f.fx + (tx - f.fx) * h01 - this.vx * m * h1;
        f.z = this.z + f.fz + (tz - f.fz) * h01 - this.vz * m * h1;
        // (a runner's foot comes up behind him early and reaches down late; a walker's just clears the floor)
        f.up = Math.sin(Math.PI * Math.pow(u, 1 - 0.38 * pace)) * lift;
        // (toes down as it trails, up as it reaches for the floor)
        toes = going ? 0.95 - 1.25 * smooth(clamp((u - 0.2) / 0.55, 0, 1)) + 0.15 * clamp((u - 0.85) / 0.15, 0, 1) : 0.4 * Math.sin(Math.PI * u);
        if (sideways) {
          // (a slide: it comes down on its own side of the other foot)
          const o = this.feet[1 - k];
          const lat = ((f.x - o.x) * sx + (f.z - o.z) * sz) * (k ? 1 : -1);
          const gap = FEET_GAP * s;
          if (lat < gap) {
            f.x += sx * (gap - lat) * (k ? 1 : -1);
            f.z += sz * (gap - lat) * (k ? 1 : -1);
          }
        }
      } else {
        f.up = Math.max(0, f.up - dt * 0.006 * s);
        // (down: flat until it is behind him, then the heel comes up as he goes over it)
        if (going && ahead) toes = 0.75 * clamp((-((f.x - this.x) * this.vx + (f.z - this.z) * this.vz) / vl - 0.35 * s) / (0.9 * s), 0, 1);
      }
      // (faster than his legs can turn over: the foot can't stay where it landed. It comes off the floor and skips after him, not dragged along it)
      const dx = f.x - this.x;
      const dz = f.z - this.z;
      const far = Math.hypot(dx, dz);
      const max = (REACH + 0.3) * s + w;
      if (far > max) {
        f.x = this.x + (dx / far) * max;
        f.z = this.z + (dz / far) * max;
        if (!swinging) f.up = Math.min(0.3 * s, f.up + dt * 0.012 * s);
      }
      // (in the air his toes point)
      if (this.pose[I.air] > 0.5) toes = 0.6;
      f.pitch += (toes - f.pitch) * (1 - Math.exp(-dt / 45));
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
      // (knocked down he goes all the way to the floor: his seat on it, his knees up)
      hipY = Math.max(hipY, want - SINK * s, (this.clip === 'stumble' ? 0.72 : 1.7) * s);
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
    if (isDunk(this.clip) && this.hasAim && this.one) {
      // a dunk: the ball goes to the rim, as far as his hands can take it (each on its side of the ball)
      const w = smooth(clamp((this.one.tau - (DUNK_AT - DUNK_REACH)) / DUNK_REACH, 0, 1));
      const [rx, rz] = this.local(this.ax, this.az);
      x += (rx - x) * w;
      y += (RIM_Y - 0.1 - y) * w;
      z += (rz - z) * w;
      const max = (UARM + FARM) * s * 0.97;
      for (let pass = 0; pass < 2; pass++)
        for (const side of [1, -1]) {
          if (P[side > 0 ? I.gl : I.gr] <= 0.5) continue;
          const k = (side > 0 ? J.sl : J.sr) * 3;
          const dx = x + side * PALM - j[k];
          const dy = y - j[k + 1];
          const dz = z - j[k + 2];
          const far = Math.hypot(dx, dy, dz);
          if (far <= max) continue;
          x -= (dx / far) * (far - max);
          y -= (dy / far) * (far - max);
          z -= (dz / far) * (far - max);
        }
    } else if (g > 0.5) {
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
    if (this.pressed > 0.02 && !isDunk(this.clip)) {
      // (kept out of the man on him: pushed away from his middle, as far as he is pressed)
      const [px, pz] = this.local(this.px0, this.pz0);
      const dx = x - px;
      const dz = z - pz;
      const far = Math.hypot(dx, dz);
      const clear = PRESS_CLEAR * s;
      if (far < clear) {
        const out = (clear - far) * Math.min(1, this.pressed * 3);
        // (straight back toward himself when it is dead centre on the man)
        const [ux, uz] = far > 0.05 ? [dx / far, dz / far] : [-px / (Math.hypot(px, pz) || 1), -pz / (Math.hypot(px, pz) || 1)];
        x += ux * out;
        z += uz * out;
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
      // (hanging on the rim: each hand on the ring, either side of its middle)
      if (this.onRim) {
        const [rx, rz] = this.local(this.ax, this.az);
        x = rx + side * 0.5 * s;
        y = RIM_Y;
        z = rz;
      }
      // (a five: the hand goes to where it meets his teammate's)
      const r = this.reach;
      if (r && r.side === side && r.w > 0) {
        const [rx, rz] = this.local(r.x, r.z);
        x += (rx - x) * r.w;
        y += (r.y - y) * r.w;
        z += (rz - z) * r.w;
      }
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
const MIX = new Float32Array(N);
const G = new Float32Array(N);
const FOLLOWED = Object.entries(FOLLOW).map(([c, v]) => [I[c as keyof typeof I], v] as [number, number]);
