// Turns motion-capture takes into the figures' clips (src/ui/live/court3d/mocap.gen.ts).
//
// A take is a real body's joints, 120 times a second. The puppet doesn't replay joint angles: a
// pose is where his hands are from his shoulders, how his hips and chest sit, where his head looks
// (clips.ts), and his arms and legs are solved to that (puppet.ts). So each frame of a take is
// measured the same way, on the captured body, and scaled to the puppet's limbs: the hand ends up
// where the real one was, on anyone's build. Feet stay the puppet's own (planted on the floor it's
// actually crossing), so a captured stride can't slide.
//
// The takes are the CMU Motion Capture Database's (mocap.cs.cmu.edu), free to use; they sit in
// data/raw/mocap (not in the repository). Run: npm run mocap:build
import { writeFileSync } from 'node:fs';
import { CHANNELS, I, mirror, N } from '../../src/ui/live/court3d/clips';
import { ANKLE, BALL_R, elbowPole, FARM, HIP, HIP_W, J, SHIN, spine, THIGH, UARM, type V3 } from '../../src/ui/live/court3d/puppet';
import { readBvh, type M3, type Take, type V } from './bvh';

const PALM = BALL_R + 0.12;
const BODY = { s: 1, bulk: 1 };
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The ball through a clip: who has it when (seconds in the take), bouncing between touches. */
interface Touch {
  hand: 'l' | 'r' | 'both';
  from: number;
  to: number;
}

interface Spec {
  id: string;
  src: string;
  kind: 'loop' | 'gait' | 'shot';
  /** The stretch of the take, seconds. A gait finds its own stride inside it. */
  from: number;
  to: number;
  /** A shot's moment (the release): 'peak' finds where the hands are highest. */
  anchor?: number | 'peak';
  /** Play ms for each captured second (the game's plays run a little faster than life). */
  rate?: number;
  grip?: 'side' | 'top' | 'under';
  /** 'dribble' finds each bounce from the hand; a list says who holds it when. */
  ball?: 'dribble' | Touch[];
  /** The other hand does it in the take (or it goes the other way): flip it. */
  mirror?: boolean;
  /** A sideways gait: its stride runs from feet together to feet together. */
  slide?: boolean;
  /** Added to every frame (a captured body that isn't an athlete: jump higher, sit lower). */
  add?: Partial<Record<(typeof CHANNELS)[number], number>>;
  /** A loop played this much faster than it was captured (a slow dribbler). */
  tempo?: number;
  /** Hips above standing, multiplied (a jump made bigger). */
  jump?: number;
}

const SPECS: Spec[] = [
  // standing: three men don't stand the same way
  { id: 'idle', src: '127_03', kind: 'loop', from: 0, to: 0.8 },
  { id: 'idle2', src: '127_04', kind: 'loop', from: 0, to: 0.9 },
  { id: 'idle3', src: '124_06', kind: 'loop', from: 4.45, to: 5.0 },
  // getting around
  { id: 'walk', src: '06_01', kind: 'gait', from: 0.5, to: 4 },
  { id: 'run', src: '127_04', kind: 'gait', from: 1.6, to: 3.8, add: { lean: -0.18, hip: 0.22 } },
  { id: 'sprint', src: '127_06', kind: 'gait', from: 0, to: 1.5, add: { lean: -0.12, hip: 0.26 } },
  // guarding (the slide is captured going right; the clip goes left, and the puppet flips it back)
  { id: 'shuffle', src: '102_27', kind: 'gait', from: 0.5, to: 1.3, slide: true, mirror: true },
  { id: 'stance', src: '102_24', kind: 'loop', from: 1.85, to: 2.25 },
  { id: 'ready', src: '102_24', kind: 'loop', from: 2.25, to: 2.65 },
  // with the ball
  { id: 'dribble', src: '86_14', kind: 'loop', from: 22.0, to: 25.6, ball: 'dribble', grip: 'top', tempo: 1.5, add: { hip: -0.18, lean: 0.06 } },
  { id: 'dribbleRun', src: '06_04', kind: 'loop', from: 0.4, to: 3.0, ball: 'dribble', grip: 'top', add: { hip: -0.1, lean: 0.05 } },
  {
    id: 'crossover',
    src: '06_14',
    kind: 'shot',
    from: 0.05,
    to: 0.95,
    anchor: 0.05,
    rate: 520,
    grip: 'top',
    ball: [
      { hand: 'r', from: -1, to: 0.36 },
      { hand: 'l', from: 0.56, to: 2 },
    ],
    add: { hip: -0.3, lean: 0.1 },
  },
  // a chest pass (0: it leaves his hands)
  { id: 'pass', src: '15_12', kind: 'shot', from: 17.3, to: 17.95, anchor: 17.36, rate: 620, ball: [{ hand: 'both', from: -1, to: 17.36 }] },
  // shots (0: the release)
  { id: 'jumper', src: '124_05', kind: 'shot', from: 2.8, to: 4.3, anchor: 'peak', rate: 780, grip: 'under', ball: [{ hand: 'both', from: -1, to: 99 }], jump: 1.5 },
  { id: 'freeThrow', src: '124_04', kind: 'shot', from: 3.5, to: 5.45, anchor: 'peak', rate: 620, grip: 'under', ball: [{ hand: 'both', from: -1, to: 99 }] },
  { id: 'layup', src: '124_06', kind: 'shot', from: 2.72, to: 4.5, anchor: 'peak', rate: 760, grip: 'under', ball: [{ hand: 'both', from: -1, to: 99 }], jump: 1.2 },
];

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A series smoothed (a bell `sigma` frames wide). */
function smoothed(v: number[], sigma: number): number[] {
  const r = Math.ceil(sigma * 3);
  return v.map((_, i) => {
    let sum = 0;
    let wt = 0;
    for (let d = -r; d <= r; d++) {
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      sum += v[clamp(i + d, 0, v.length - 1)] * w;
      wt += w;
    }
    return sum / wt;
  });
}

/** A take, measured: everything a frame's pose needs, in the puppet's units. */
function measure(take: Take, byHead = false) {
  const ix = take.index;
  const rest = take.pos[0];
  const d = (a: string, b: string) => len(sub(rest[ix[a]], rest[ix[b]]));
  // the captured body's legs and arms against the puppet's
  const k = (THIGH + SHIN) / ((d('LeftUpLeg', 'LeftLeg') + d('LeftLeg', 'LeftFoot') + d('RightUpLeg', 'RightLeg') + d('RightLeg', 'RightFoot')) / 2);
  const ka = (UARM + FARM) / ((d('LeftArm', 'LeftForeArm') + d('LeftForeArm', 'LeftHand') + d('RightArm', 'RightForeArm') + d('RightForeArm', 'RightHand')) / 2);
  const F = take.frames;
  const P = (f: number, name: string) => take.pos[f + 1][ix[name]];
  // the floor: where his ankles rest
  const ank: number[] = [];
  for (let f = 0; f < F; f++) ank.push(Math.min(P(f, 'LeftFoot')[1], P(f, 'RightFoot')[1]));
  const floorAnkle = [...ank].sort((a, b) => a - b)[Math.floor(F * 0.1)];
  // the way he faces (across his hips), and where he is, both without the wobble of a stride
  const yawRaw: number[] = [];
  for (let f = 0; f < F; f++) {
    const pl = sub(P(f, 'LeftUpLeg'), P(f, 'RightUpLeg'));
    const y = Math.atan2(-pl[2], pl[0]);
    yawRaw.push(f ? yawRaw[f - 1] + wrap(y - yawRaw[f - 1]) : y);
  }
  const sig = 0.22 / take.dt;
  // (a shooter stands turned from his target and looks at it: his head says where he's facing)
  let yaw = smoothed(yawRaw, sig);
  if (byHead) {
    const hy: number[] = [];
    for (let f = 0; f < F; f++) {
      const r = take.rot[f + 1][ix.Head];
      const y = Math.atan2(r[2], r[8]);
      hy.push(f ? hy[f - 1] + wrap(y - hy[f - 1]) : y);
    }
    yaw = smoothed(hy, sig * 1.6);
    // (kept on the same turn as the hips)
    const turns = Math.round((yaw[0] - yawRaw[0]) / (Math.PI * 2));
    yaw = yaw.map((y) => y - turns * Math.PI * 2);
  }
  const rx = smoothed(
    Array.from({ length: F }, (_, f) => P(f, 'Hips')[0]),
    sig,
  );
  const rz = smoothed(
    Array.from({ length: F }, (_, f) => P(f, 'Hips')[2]),
    sig,
  );
  // (standing, the trunk's line tips a little back; and each body's head sits its own way: the take's usual is level)
  const lean0 = -0.08;
  const nods: number[] = [];
  for (let f = 0; f < F; f++) {
    const r = take.rot[f + 1][ix.Head];
    nods.push(Math.asin(clamp(r[5], -1, 1)));
  }
  const nod0 = [...nods].sort((a, b) => a - b)[Math.floor(F / 2)];
  return { take, ix, k, ka, F, P, floorAnkle, yawRaw, yaw, rx, rz, lean0, nod0 };
}
type Measured = ReturnType<typeof measure>;

const U: V3 = { x: 0, y: 1, z: 0 };
const Fr: V3 = { x: 0, y: 0, z: 1 };
const L: V3 = { x: 1, y: 0, z: 0 };
const POLE: V3 = { x: 0, y: 0, z: 0 };
const JT = new Float32Array(15 * 3);

/** A frame of a take as a pose (`f` may fall between frames). Returns the pose and where its hands ended up (the puppet's, his own frame). */
function poseAt(m: Measured, ft: number, spec: Spec): { pose: Float32Array; hands: { l: V; r: V } } {
  const f0 = clamp(Math.floor(ft), 0, m.F - 1);
  const f1 = Math.min(m.F - 1, f0 + 1);
  const w = clamp(ft - f0, 0, 1);
  const mix = (a: number, b: number) => a + (b - a) * w;
  const at = (name: string): V => {
    const a = m.P(f0, name);
    const b = m.P(f1, name);
    return [mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])];
  };
  const yaw = mix(m.yaw[f0], m.yaw[f1]);
  const root: V = [mix(m.rx[f0], m.rx[f1]), 0, mix(m.rz[f0], m.rz[f1])];
  const fw: V = [Math.sin(yaw), 0, Math.cos(yaw)];
  const lf: V = [Math.cos(yaw), 0, -Math.sin(yaw)];
  /** A direction of the take, in his own frame (x to his left, z ahead). */
  const dir = (v: V): V => [dot(v, lf), v[1], dot(v, fw)];
  const P = new Float32Array(N);
  const hips = at('Hips');
  const own = dir(sub(hips, root));
  // (measured at the hip joints: the take's own root sits above them)
  let hip = ((at('LeftUpLeg')[1] + at('RightUpLeg')[1]) / 2 - m.floorAnkle) * m.k + ANKLE - HIP;
  if (spec.jump && hip > 0) hip *= spec.jump;
  P[I.hip] = hip;
  P[I.sway] = own[0] * m.k;
  P[I.surge] = own[2] * m.k;
  P[I.pyaw] = wrap(mix(m.yawRaw[f0], m.yawRaw[f1]) - yaw);
  const pl = sub(at('LeftUpLeg'), at('RightUpLeg'));
  P[I.proll] = Math.asin(clamp(pl[1] / len(pl), -1, 1));
  // the trunk's line: from between the hip joints to between the shoulders
  const lj = at('LeftUpLeg');
  const rj = at('RightUpLeg');
  const ls = at('LeftArm');
  const rs = at('RightArm');
  const up = dir([(ls[0] + rs[0] - lj[0] - rj[0]) / 2, (ls[1] + rs[1] - lj[1] - rj[1]) / 2, (ls[2] + rs[2] - lj[2] - rj[2]) / 2]);
  const ul = len(up);
  P[I.tilt] = Math.asin(clamp(up[0] / ul, -1, 1));
  P[I.lean] = Math.asin(clamp(up[2] / ul, -1, 1)) - m.lean0;
  const hipY = HIP + P[I.hip];
  spine(P, BODY, hipY, JT, U, Fr, L);
  const sl = dir(sub(at('LeftArm'), at('RightArm')));
  P[I.twist] = Math.atan2(-(sl[0] * Fr.x + sl[1] * Fr.y + sl[2] * Fr.z), sl[0] * L.x + sl[1] * L.y + sl[2] * L.z);
  spine(P, BODY, hipY, JT, U, Fr, L);
  // where his head looks, against his chest
  const R = (name: string): M3 => m.take.rot[f0 + 1][m.ix[name]];
  const hr = R('Head');
  const hf = dir([hr[2], hr[5], hr[8]]);
  const cu = hf[0] * U.x + hf[1] * U.y + hf[2] * U.z;
  P[I.nod] = clamp(Math.asin(clamp(cu, -1, 1)) - m.nod0, -0.8, 0.5);
  P[I.turn] = clamp(Math.atan2(hf[0] * L.x + hf[1] * L.y + hf[2] * L.z, hf[0] * Fr.x + hf[1] * Fr.y + hf[2] * Fr.z), -1.2, 1.2);
  // hands from their shoulders, on the puppet's arms; elbows by how far they swing from hanging
  const hands = { l: [0, 0, 0] as V, r: [0, 0, 0] as V };
  for (const side of [1, -1] as const) {
    const S = side > 0 ? 'Left' : 'Right';
    const sh = at(`${S}Arm`);
    const v = dir(sub(at(`${S}Hand`), sh)).map((x) => x * m.ka) as V;
    // v = a (left, to his side) + b (up) + c (front)
    const a: V = [L.x * side, L.y * side, L.z * side];
    const c: V = [Fr.x, Fr.y, Fr.z];
    const det = a[0] * c[2] - a[2] * c[0];
    const pa = (v[0] * c[2] - v[2] * c[0]) / det;
    const pc = (a[0] * v[2] - a[2] * v[0]) / det;
    const pb = v[1] - pa * a[1] - pc * c[1];
    P[side > 0 ? I.lx : I.rx] = pa;
    P[side > 0 ? I.ly : I.ry] = pb;
    P[side > 0 ? I.lz : I.rz] = pc;
    const e = dir(sub(at(`${S}ForeArm`), sh));
    const p0 = elbowPole(L, Fr, side, v[0], v[1], v[2], 0, POLE);
    const dl = len(v) || 1;
    const dn: V = [v[0] / dl, v[1] / dl, v[2] / dl];
    const ed = dot(e, dn);
    const ep: V = [e[0] - dn[0] * ed, e[1] - dn[1] * ed, e[2] - dn[2] * ed];
    const cr: V = [dn[1] * p0.z - dn[2] * p0.y, dn[2] * p0.x - dn[0] * p0.z, dn[0] * p0.y - dn[1] * p0.x];
    // (an arm out straight has no elbow to speak of: it hangs)
    const bent = clamp((len(ep) / (len(e) || 1) - 0.12) / 0.2, 0, 1);
    P[side > 0 ? I.lsw : I.rsw] = Math.atan2(dot(ep, cr), ep[0] * p0.x + ep[1] * p0.y + ep[2] * p0.z) * bent;
    const k3 = (side > 0 ? J.sl : J.sr) * 3;
    hands[side > 0 ? 'l' : 'r'] = [JT[k3] + v[0], JT[k3 + 1] + v[1], JT[k3 + 2] + v[2]];
  }
  // feet: how far apart he stands; off the floor, where they hang
  const la = at('LeftFoot');
  const ra = at('RightFoot');
  const lo = dir(sub(la, root));
  const ro = dir(sub(ra, root));
  P[I.wide] = clamp(((Math.abs(lo[0] - ro[0]) * m.k) / 2 - HIP_W - 0.08) / 0.6, 0, 1.1);
  const jump = Math.max(0, P[I.hip]);
  const scale = spec.jump && hip > 0 ? spec.jump : 1;
  P[I.flu] = Math.max(0, (la[1] - m.floorAnkle) * m.k * scale - jump);
  P[I.fru] = Math.max(0, (ra[1] - m.floorAnkle) * m.k * scale - jump);
  P[I.flf] = lo[2] * m.k;
  P[I.frf] = ro[2] * m.k;
  const off = (Math.min(la[1], ra[1]) - m.floorAnkle) * m.k;
  P[I.air] = clamp((off - 0.12) / 0.3, 0, 1);
  // (where the ball would be, when no one has said: at his chest)
  P[I.bx] = 0.1;
  P[I.by] = 4.2;
  P[I.bz] = 0.85;
  for (const [c, v] of Object.entries(spec.add ?? {})) P[I[c as keyof typeof I]] += v;
  return { pose: P, hands };
}

/** Left foot at its farthest behind him, each time, in frames (it leaves the floor there): a stride runs from one to the next. */
function liftoffs(m: Measured, from: number, to: number): number[] {
  const z = smoothed(
    Array.from({ length: m.F }, (_, f) => {
      const d = sub(m.P(f, 'LeftFoot'), m.P(f, 'Hips'));
      return d[0] * Math.sin(m.yaw[f]) + d[2] * Math.cos(m.yaw[f]);
    }),
    0.025 / m.take.dt,
  );
  const out: number[] = [];
  const gap = Math.round(0.14 / m.take.dt);
  for (let f = Math.max(gap, from); f < Math.min(m.F - gap, to); f++) {
    let low = true;
    for (let d = -gap; d <= gap && low; d++) if (z[f + d] < z[f]) low = false;
    if (low && (!out.length || f - out[out.length - 1] > gap)) out.push(f);
  }
  return out;
}

/** Feet at their closest, each time, in frames: a slide's stride (the lead foot steps out from there). */
function together(m: Measured, from: number, to: number): number[] {
  const sep = smoothed(
    Array.from({ length: m.F }, (_, f) => {
      const d = sub(m.P(f, 'LeftFoot'), m.P(f, 'RightFoot'));
      return Math.abs(d[0] * Math.cos(m.yaw[f]) - d[2] * Math.sin(m.yaw[f]));
    }),
    0.02 / m.take.dt,
  );
  const out: number[] = [];
  const gap = Math.round(0.12 / m.take.dt);
  for (let f = Math.max(gap, from); f < Math.min(m.F - gap, to); f++) {
    let low = true;
    for (let d = -gap; d <= gap && low; d++) if (sep[f + d] < sep[f]) low = false;
    if (low && (!out.length || f - out[out.length - 1] > gap)) out.push(f);
  }
  return out;
}

/** The dribbling hand's lowest points (it lets the ball go there), in frames. */
function pushes(m: Measured, hand: string, from: number, to: number): number[] {
  const y = smoothed(
    Array.from({ length: m.F }, (_, f) => m.P(f, hand)[1]),
    0.03 / m.take.dt,
  );
  const out: number[] = [];
  const gap = Math.round(0.3 / m.take.dt);
  for (let f = Math.max(gap, from - gap); f < Math.min(m.F - gap, to + gap); f++) {
    let low = true;
    for (let d = -gap; d <= gap && low; d++) if (y[f + d] < y[f]) low = false;
    if (low && (!out.length || f - out[out.length - 1] > gap)) out.push(f);
  }
  return out;
}

interface Built {
  kind: Spec['kind'];
  dur: number;
  grip: 'side' | 'top' | 'under';
  at: number[];
  poses: Float32Array[];
}

function build(spec: Spec): Built {
  const take = readBvh(`data/raw/mocap/${spec.src}.bvh`, 2);
  const m = measure(take, spec.kind === 'shot' && spec.id !== 'crossover');
  const dt = take.dt;
  const fr = (sec: number) => sec / dt;
  let from = fr(spec.from);
  let to = fr(spec.to);
  let right = true;
  let touches: Touch[] | null = Array.isArray(spec.ball) ? spec.ball : null;

  if (spec.kind === 'gait') {
    const lifts = spec.slide ? together(m, Math.round(from), Math.round(to)) : liftoffs(m, Math.round(from), Math.round(to));
    if (lifts.length < 2) throw new Error(`${spec.id}: no full stride in ${spec.src} (${lifts.length} lift-offs)`);
    // (the stride nearest the middle of the stretch)
    const mid = (from + to) / 2;
    let best = 0;
    for (let i = 1; i < lifts.length - 1; i++) if (Math.abs((lifts[i] + lifts[i + 1]) / 2 - mid) < Math.abs((lifts[best] + lifts[best + 1]) / 2 - mid)) best = i;
    from = lifts[best];
    to = lifts[best + 1];
  }
  if (spec.ball === 'dribble') {
    // whichever hand works harder has the ball; the loop runs from one push to a later one
    const range = (h: string) => {
      const ys = Array.from({ length: Math.round(to - from) }, (_, i) => m.P(Math.round(from) + i, h)[1]);
      return Math.max(...ys) - Math.min(...ys);
    };
    right = range('RightHand') >= range('LeftHand');
    const ps = pushes(m, right ? 'RightHand' : 'LeftHand', Math.round(from), Math.round(to));
    const inside = ps.filter((p) => p >= from - 2 && p <= to + 2);
    if (inside.length < 3) throw new Error(`${spec.id}: fewer than two dribbles in ${spec.src}`);
    // (the loop is cut while the ball is in his hand, not at a bounce: the join is then a quiet one)
    const last = inside.length - 1;
    from = inside[0] + (inside[1] - inside[0]) * 0.72;
    to = inside[last - 1] + (inside[last] - inside[last - 1]) * 0.72;
    touches = [];
    for (let i = 0; i + 1 < ps.length; i++) {
      const T = ps[i + 1] - ps[i];
      touches.push({ hand: right ? 'r' : 'l', from: (ps[i] + T * 0.46) * dt, to: ps[i + 1] * dt });
    }
  }

  // sampled 30 times a second (a gait: 16 times a stride)
  const n = spec.kind === 'gait' ? 16 : Math.max(4, Math.round(((to - from) * dt) / (1 / 30)));
  const step = (to - from) / n;
  // (a loop's join is eased over its first frames: a fifth of a second, a quarter of a stride)
  const fade =
    spec.kind === 'shot' ? 0 : Math.min(Math.max(2, Math.round(spec.kind === 'gait' ? n * 0.25 : Math.min(n * 0.3, 0.2 / (step * dt)))), Math.floor((m.F - 1 - to) / step));
  const raw: { pose: Float32Array; hands: { l: V; r: V }; sec: number }[] = [];
  const count = spec.kind === 'shot' ? n + 1 : n + fade;
  for (let i = 0; i < count; i++) {
    const ft = from + i * step;
    raw.push({ ...poseAt(m, ft, spec), sec: ft * dt });
  }
  if (spec.kind === 'gait') for (const r of raw) r.pose[I.air] = 0;

  // the ball: in a hand, or bouncing from the last hand to the next
  if (touches) {
    const palm = (r: (typeof raw)[number], hand: Touch['hand']): V => {
      if (hand === 'both') {
        if ((spec.grip ?? 'side') === 'under') return [r.hands.r[0], r.hands.r[1] + PALM * 0.7, r.hands.r[2] + PALM * 0.7];
        return [(r.hands.l[0] + r.hands.r[0]) / 2, (r.hands.l[1] + r.hands.r[1]) / 2, (r.hands.l[2] + r.hands.r[2]) / 2];
      }
      const h = r.hands[hand];
      return [h[0], h[1] - PALM, h[2]];
    };
    const handAt = (sec: number, hand: Touch['hand']): V => palm({ ...poseAt(m, sec / dt, spec), sec }, hand);
    for (const r of raw) {
      const t = r.sec;
      const P = r.pose;
      const cur = touches.find((x) => t >= x.from && t <= x.to);
      let b: V;
      if (cur) {
        b = palm(r, cur.hand);
        const edge = Math.min(1, (t - cur.from) / 0.06, (cur.to - t) / 0.04 + 0.35);
        if (cur.hand !== 'l') P[I.gr] = clamp(edge, 0, 1);
        if (cur.hand !== 'r') P[I.gl] = clamp(edge, 0, 1);
      } else {
        const prev = [...touches].reverse().find((x) => x.to < t);
        const next = touches.find((x) => x.from > t);
        if (!prev || !next) {
          b = prev ? handAt(prev.to, prev.hand) : next ? handAt(next.from, next.hand) : [0.1, 4.2, 0.85];
        } else {
          // down to the floor and back up to the hand that takes it. It lands on one of the clip's
          // own frames (the one nearest 45% of the way), so the bounce is on the floor, not above it
          const u = (t - prev.to) / (next.from - prev.to);
          const a = handAt(prev.to, prev.hand);
          const c = handAt(next.from, next.hand);
          let ub = 0.45;
          let off = Infinity;
          for (const o of raw) {
            const ou = (o.sec - prev.to) / (next.from - prev.to);
            if (ou > 0.1 && ou < 0.9 && Math.abs(ou - 0.45) < off) {
              off = Math.abs(ou - 0.45);
              ub = ou;
            }
          }
          const y = u < ub ? BALL_R + (a[1] - BALL_R) * Math.pow(1 - u / ub, 1.15) : BALL_R + (c[1] - BALL_R) * Math.pow((u - ub) / (1 - ub), 0.85);
          b = [a[0] + (c[0] - a[0]) * u, y, a[2] + (c[2] - a[2]) * u];
        }
      }
      P[I.bx] = -b[0];
      P[I.by] = Math.max(BALL_R, b[1] - Math.max(0, P[I.hip]));
      P[I.bz] = b[2];
    }
  }
  if (spec.mirror || !right) raw.forEach((r) => mirror(r.pose));

  if (spec.kind === 'shot') {
    let anchor = typeof spec.anchor === 'number' ? spec.anchor : spec.from;
    if (spec.anchor === 'peak') {
      // the release: the shooting hand at its highest
      let top = -1;
      for (const r of raw) {
        const y = Math.max(r.hands.l[1], r.hands.r[1]);
        if (y > top) {
          top = y;
          anchor = r.sec;
        }
      }
      // (it's out of his hands from there)
      for (const r of raw) {
        const g = clamp(1 - (r.sec - anchor) / 0.05, 0, 1);
        r.pose[I.gl] *= g;
        r.pose[I.gr] *= g;
      }
    }
    const rate = spec.rate ?? 800;
    return { kind: 'shot', dur: 0, grip: spec.grip ?? 'side', at: raw.map((r) => Math.round((r.sec - anchor) * rate)), poses: raw.map((r) => r.pose) };
  }
  // a loop: its first frames are the take carrying on past its end, eased into its own start
  const poses = raw.slice(0, n).map((r) => r.pose);
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    const past = raw[n + i].pose;
    for (let c = 0; c < N; c++) poses[i][c] = past[c] + (poses[i][c] - past[c]) * w;
  }
  // (and it ends where it began)
  poses.push(Float32Array.from(poses[0]));
  return { kind: spec.kind, dur: Math.round(((to - from) * dt * 1000) / (spec.tempo ?? 1)), grip: spec.grip ?? 'side', at: poses.map((_, i) => Number((i / n).toFixed(4))), poses };
}

const out: string[] = [];
for (const spec of SPECS) {
  const b = build(spec);
  const hips = b.poses.map((p) => p[I.hip]);
  const hand = b.poses.map((p) => Math.max(p[I.ly], p[I.ry]));
  const mean = (c: number) => (b.poses.reduce((t, p) => t + p[c], 0) / b.poses.length).toFixed(2);
  console.log(
    `${spec.id.padEnd(11)} ${spec.src.padEnd(7)} ${b.kind.padEnd(5)} ${String(b.poses.length).padStart(3)} keys  ${b.kind === 'shot' ? `${b.at[0]}..${b.at[b.at.length - 1]} ms` : `${b.dur} ms`}  hip ${Math.min(...hips).toFixed(2)}..${Math.max(...hips).toFixed(2)}  hand ${Math.max(...hand).toFixed(2)}  lean ${mean(I.lean)} turn ${mean(I.turn)} nod ${mean(I.nod)} sw ${mean(I.lsw)}/${mean(I.rsw)} wide ${mean(I.wide)} ball ${mean(I.bx)},${mean(I.by)},${mean(I.bz)}`,
  );
  const rows = b.poses.map((p) => `[${Array.from(p, (v) => Number(v.toFixed(3))).join(',')}]`).join(',\n      ');
  out.push(`  ${spec.id}: {\n    kind: '${b.kind}',\n    dur: ${b.dur},\n    grip: '${b.grip}',\n    at: [${b.at.join(',')}],\n    poses: [\n      ${rows},\n    ],\n  },`);
}
writeFileSync(
  'src/ui/live/court3d/mocap.gen.ts',
  `// Written by \`npm run mocap:build\` from the motion-capture takes in data/raw/mocap. Not edited by hand.
// The motion is the CMU Graphics Lab Motion Capture Database's (mocap.cs.cmu.edu).
export const MOCAP_CHANNELS: string[] = ${JSON.stringify([...CHANNELS])};
export const MOCAP: Record<string, { kind: 'loop' | 'gait' | 'shot'; dur: number; grip: 'side' | 'top' | 'under'; at: number[]; poses: number[][] }> = {
${out.join('\n')}
};
`,
);
