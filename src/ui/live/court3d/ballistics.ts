// How the ball flies: a shot's way from the hand to the rim and what it does there (through clean, off the
// front of the iron and in, round the ring and down, off the glass; or off the iron and away), a blocked
// shot's way off the hand, the ball's spin, and the springs the rim and the unit ring on. The script says
// where a move starts, how long it has and how it ends; this makes the path between a thrown ball's.
// Plain numbers (the scene's feet, the bodies' seconds), no three.js, and nothing about the game is decided.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** The rim's height, the ring's radius to the middle of its bar, the ball's radius, and how far behind the ring's middle the glass is (ft). */
export const RIM_H = 10;
const RING = 0.776;
const BALL = 0.39;
const GLASS = 1.25;
/** The board's half width (ft). */
const BOARD_HALF = 3;
/** What pulls a thrown ball down, ft a second squared, in the bodies' time. */
export const GRAVITY = 32;
/** A shot's arc for the kind it is: a floater is lobbed, a free throw climbs, a three is thrown flatter for its length. */
const LOFT = { layup: 0.55, jumper: 1.12, three: 0.96, floater: 1.75, ft: 1.3 };
/** The most a shot climbs over the straight line from the hand to the rim: this (ft), and this for each foot it is from. */
const ARC_MOST = [3, 0.22];
/** A three is a jumper from this far (ft). */
const THREE_FT = 22;
/** How far below the ring's height the ball's middle is when it is out of the net (ft). */
const NET_DROP = 1.6;

export type ShotKind = 'layup' | 'floater' | 'jumper' | 'ft';
/** How a shot ends: clean, off the front of the rim and in, off the back and in, round the ring and down, off the glass and in; or out, off the front, the back, the side, round the ring and out, short of everything, hard off the glass, off the board's edge. */
export type How = 'swish' | 'kiss' | 'backIn' | 'roll' | 'bank' | 'front' | 'back' | 'side' | 'round' | 'air' | 'glass' | 'edge';

/** A stretch of a shot's way, from `u0` of the move to `u1`: thrown (it falls as a ball does), round the ring, or down through the net. */
type Leg =
  | { kind: 'fly'; u0: number; u1: number; p: V3; v: V3; g: number }
  | { kind: 'ring'; u0: number; u1: number; cx: number; cz: number; a0: number; turn: number; r0: number; r1: number; y0: number; y1: number }
  | { kind: 'net'; u0: number; u1: number; x0: number; z0: number; x1: number; z1: number; y0: number; drop: number };

/** What the ball meets, at `u` of the move, and how hard (1: a firm shot's; a dunk is more). */
export interface Hit {
  u: number;
  what: 'rim' | 'board' | 'net';
  power: number;
}

export interface Shot {
  how: How;
  made: boolean;
  /** The move's length, s. */
  secs: number;
  legs: Leg[];
  hits: Hit[];
  /** What was asked for (the labs plan it again another way). */
  ask: ShotAsk;
}

export interface ShotAsk {
  /** Where it leaves the hand. */
  from: V3;
  /** The ring's middle on the floor. */
  rim: { x: number; z: number };
  kind: ShotKind;
  made: boolean;
  /** How long the move has (the bodies' seconds). */
  secs: number;
  /** Where the play takes the ball after it (a rebounder's hands, say), if anywhere. */
  next: V3 | null;
  /** Three numbers in 0..1, the shot's own: which way it ends, which side, how much. */
  r: [number, number, number];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One of `table`'s names, by their weights, for `r` in 0..1. */
function pick(table: [How, number][], r: number): How {
  let all = 0;
  for (const [, w] of table) all += w;
  let at = r * all;
  for (const [name, w] of table) if ((at -= w) < 0) return name;
  return table[0][0];
}

/** Thrown from `p` to land on `q` after `t` seconds under `g`. */
function thrown(u0: number, u1: number, p: V3, q: V3, t: number, g: number): Leg {
  const s = Math.max(0.02, t);
  return { kind: 'fly', u0, u1, p: { ...p }, v: { x: (q.x - p.x) / s, y: (q.y - p.y) / s + (g * s) / 2, z: (q.z - p.z) / s }, g };
}

/** A shot's whole way, worked out as it leaves the hand. */
export function planShot(ask: ShotAsk): Shot {
  const { from, rim, made, secs, next } = ask;
  const [r0, r1, r2] = ask.r;
  const dx = from.x - rim.x;
  const dz = from.z - rim.z;
  const far = Math.hypot(dx, dz) || 1;
  // toward the shooter from the rim, square to that (to one side or the other, the shot's own), and out of the board toward the floor
  const ux = dx / far;
  const uz = dz / far;
  const turn = r1 < 0.5 ? 1 : -1;
  const px = uz * turn;
  const pz = -ux * turn;
  const out = rim.x < 0 ? 1 : -1;
  // (how square to the glass he is: 1 straight on, 0 from the baseline)
  const square = ux * out;
  const kind = ask.kind === 'jumper' && far > THREE_FT ? 'three' : ask.kind;
  const g = GRAVITY * LOFT[kind];
  const at = (along: number, side: number, y: number): V3 => ({ x: rim.x + ux * along + px * side, y: RIM_H + y, z: rim.z + uz * along + pz * side });
  // where the ball's middle is as it meets the glass on its way to `aimZ`, the ring's middle seen in it as in a mirror
  const faceX = rim.x - out * (GLASS - BALL);
  const glassAt = (aimZ: number, y: number): V3 => {
    const mx = 2 * faceX - rim.x;
    const s = clamp((faceX - from.x) / (mx - from.x || 1e-6), 0, 1);
    return { x: faceX, y: RIM_H + y, z: clamp(from.z + (aimZ - from.z) * s, rim.z - BOARD_HALF + 0.5, rim.z + BOARD_HALF - 0.5) };
  };
  const inFront = (from.x - faceX) * out > 1.4;
  const canBank = inFront && square > 0.3 && square < 0.93 && far < 16;
  const legs: Leg[] = [];
  const hits: Hit[] = [];
  // (no shot climbs more than ARC_MOST over the line from the hand to the rim, however long the move gives it)
  const fly = (u0: number, u1: number, p: V3, q: V3, gg = Math.min(g, (8 * (ARC_MOST[0] + far * ARC_MOST[1])) / ((u1 - u0) * secs) ** 2)) =>
    legs.push(thrown(u0, u1, p, q, (u1 - u0) * secs, gg));
  /** Down through the net from `u0`: the cords slow it. */
  const net = (u0: number, p: V3, power: number) => {
    const to = at(-0.06, 0, 0);
    legs.push({ kind: 'net', u0, u1: 1, x0: p.x, z0: p.z, x1: to.x, z1: to.z, y0: p.y, drop: p.y - (RIM_H - NET_DROP) });
    hits.push({ u: u0, what: 'net', power });
  };
  /** Off the iron at `p` from `u0` to the move's end and on: up, and away along `way` (pulled toward where the play takes it). */
  const off = (u0: number, p: V3, wayX: number, wayZ: number, speed: number, up: number) => {
    let [wx, wz] = [wayX, wayZ];
    if (next) {
      const tx = next.x - p.x;
      const tz = next.z - p.z;
      const tl = Math.hypot(tx, tz) || 1;
      wx = wx * 0.45 + (tx / tl) * 0.55;
      wz = wz * 0.45 + (tz / tl) * 0.55;
    }
    const wl = Math.hypot(wx, wz) || 1;
    legs.push({ kind: 'fly', u0, u1: 1, p: { ...p }, v: { x: (wx / wl) * speed, y: up, z: (wz / wl) * speed }, g: GRAVITY });
  };

  let how: How;
  if (made) {
    const close = ask.kind === 'layup';
    how = pick(
      close && canBank
        ? [
            ['bank', 70],
            ['kiss', 12],
            ['swish', 10],
            ['roll', 8],
          ]
        : [
            ['swish', close ? 35 : ask.kind === 'ft' ? 62 : 50],
            ['kiss', close ? 30 : 16],
            ['backIn', 14],
            ['roll', close ? 20 : 9],
            ['bank', canBank && ask.kind !== 'ft' && far < 15 ? 16 : 0],
          ],
      r0,
    );
    if (how === 'swish') {
      const p = at(-0.08 - 0.1 * r2, (r1 - 0.5) * 0.16, 0.02);
      fly(0, 0.84, from, p);
      net(0.84, p, 1);
    } else if (how === 'kiss') {
      // (the ball's underside on the front of the iron: it is knocked on over the ring and drops)
      const p = at(0.43, (r1 - 0.5) * 0.2, 0.2);
      const q = at(-0.1, 0, -0.05);
      fly(0, 0.76, from, p);
      hits.push({ u: 0.76, what: 'rim', power: 0.4 });
      fly(0.76, 0.86, p, q, GRAVITY);
      net(0.86, q, 0.7);
    } else if (how === 'backIn') {
      const p = at(-0.42, (r1 - 0.5) * 0.2, 0.2);
      const q = at(0.04, 0, -0.05);
      fly(0, 0.74, from, p);
      hits.push({ u: 0.74, what: 'rim', power: 0.6 });
      fly(0.74, 0.87, p, q, GRAVITY);
      net(0.87, q, 0.6);
    } else if (how === 'roll') {
      // (onto the ring to one side of its front, round the inside of it as it slows, and down)
      const a0 = Math.atan2(uz, ux) + turn * 0.9;
      const p: V3 = { x: rim.x + Math.cos(a0) * 0.42, y: RIM_H + 0.2, z: rim.z + Math.sin(a0) * 0.42 };
      const total = turn * (5.2 + r2 * 3.4);
      fly(0, 0.62, from, p);
      hits.push({ u: 0.62, what: 'rim', power: 0.45 }, { u: 0.74, what: 'rim', power: 0.25 });
      legs.push({ kind: 'ring', u0: 0.62, u1: 0.88, cx: rim.x, cz: rim.z, a0, turn: total, r0: 0.42, r1: 0.1, y0: p.y, y1: RIM_H - 0.04 });
      const a1 = a0 + total;
      net(0.88, { x: rim.x + Math.cos(a1) * 0.1, y: RIM_H - 0.04, z: rim.z + Math.sin(a1) * 0.1 }, 0.45);
    } else {
      // off the glass: high on the square from out on the floor, low by its near corner from close in
      const b = glassAt(rim.z, clamp(0.5 + far * 0.055, 0.6, 1.35));
      const q = at(-0.05, 0, 0.0);
      fly(0, 0.74, from, b);
      hits.push({ u: 0.74, what: 'board', power: 0.5 });
      fly(0.74, 0.86, b, q, GRAVITY);
      net(0.86, q, 0.75);
    }
  } else {
    const close = ask.kind === 'layup';
    const long = ask.kind === 'jumper' || ask.kind === 'floater';
    how = pick(
      [
        ['front', close ? 24 : 34],
        ['back', close ? 14 : 27],
        ['side', 14],
        ['round', close ? 20 : 11],
        ['air', long && far > 15 ? 5 : 0],
        ['glass', inFront && square > 0.45 && far < 20 && ask.kind !== 'ft' ? (close ? 26 : 7) : 0],
        ['edge', long && inFront && square < 0.28 && far > 8 ? 9 : 0],
      ],
      r0,
    );
    const hard = 0.8 + r2 * 0.5;
    if (how === 'front') {
      const p = at(RING + 0.3, (r1 - 0.5) * 0.5, 0.24);
      fly(0, 0.8, from, p);
      hits.push({ u: 0.8, what: 'rim', power: hard });
      off(0.8, p, ux, uz, 5 + 4 * r2, 8 + 4 * r2);
    } else if (how === 'back') {
      // (over the front and onto the back of the iron: it comes up and back toward him)
      const p = at(-RING + 0.14, (r1 - 0.5) * 0.4, 0.3);
      fly(0, 0.8, from, p);
      hits.push({ u: 0.8, what: 'rim', power: hard * 1.2 });
      off(0.8, p, ux, uz, 4 + 4 * r2, 11 + 4 * r2);
    } else if (how === 'side') {
      const p = at(0.15, RING + 0.26, 0.25);
      fly(0, 0.8, from, p);
      hits.push({ u: 0.8, what: 'rim', power: hard });
      off(0.8, p, px, pz, 5 + 3 * r2, 7 + 4 * r2);
    } else if (how === 'round') {
      // (in, round the ring and out again the way it was going)
      const a0 = Math.atan2(uz, ux) + turn * 0.5;
      const total = turn * (3.6 + r2 * 2.2);
      const p: V3 = { x: rim.x + Math.cos(a0) * 0.45, y: RIM_H + 0.2, z: rim.z + Math.sin(a0) * 0.45 };
      fly(0, 0.64, from, p);
      hits.push({ u: 0.64, what: 'rim', power: 0.5 }, { u: 0.78, what: 'rim', power: 0.3 });
      legs.push({ kind: 'ring', u0: 0.64, u1: 0.9, cx: rim.x, cz: rim.z, a0, turn: total, r0: 0.45, r1: 0.66, y0: p.y, y1: RIM_H + 0.3 });
      const a1 = a0 + total;
      off(0.9, { x: rim.x + Math.cos(a1) * 0.66, y: RIM_H + 0.3, z: rim.z + Math.sin(a1) * 0.66 }, -Math.sin(a1) * turn, Math.cos(a1) * turn, 4.5, 4);
    } else if (how === 'air') {
      // (short of the rim and under it: nothing to meet)
      fly(0, 1, from, at(1.5 + r2, (r1 - 0.5) * 1.6, -0.9));
    } else if (how === 'glass') {
      // (too hard off the glass: over the ring and out the front)
      const b = glassAt(rim.z + pz * 0.5, 1.5 + 0.6 * r2);
      fly(0, 0.76, from, b);
      hits.push({ u: 0.76, what: 'board', power: 1 });
      off(0.76, b, out, pz * 0.4, 7 + 3 * r2, 2.5);
    } else {
      // (off the edge of the board, on his side of it)
      const sideZ = Math.sign(from.z - rim.z || 1);
      const b: V3 = { x: rim.x - out * (GLASS - 0.1), y: RIM_H + 0.9 + r2, z: rim.z + sideZ * (BOARD_HALF + BALL * 0.7) };
      fly(0, 0.8, from, b);
      hits.push({ u: 0.8, what: 'board', power: 1.1 });
      off(0.8, b, ux * 0.4 + out * 0.4, sideZ, 6 + 3 * r2, 3);
    }
  }
  return { how, made, secs, legs, hits, ask };
}

/** Where a shot's ball is at `u` of its move (past 1: on along its last stretch), into `out`. */
export function shotAt(shot: Shot, u: number, out: V3): V3 {
  let leg = shot.legs[0];
  for (const l of shot.legs) if (u >= l.u0) leg = l;
  if (leg.kind === 'fly') {
    const t = (u - leg.u0) * shot.secs;
    out.x = leg.p.x + leg.v.x * t;
    out.y = leg.p.y + leg.v.y * t - (leg.g * t * t) / 2;
    out.z = leg.p.z + leg.v.z * t;
    return out;
  }
  const w = clamp((u - leg.u0) / (leg.u1 - leg.u0), 0, 1);
  if (leg.kind === 'ring') {
    // (fast at first, slower as the ring takes its pace)
    const a = leg.a0 + leg.turn * w * (1.55 - 0.55 * w);
    const r = leg.r0 + (leg.r1 - leg.r0) * w * w;
    out.x = leg.cx + Math.cos(a) * r;
    out.y = leg.y0 + (leg.y1 - leg.y0) * w * w;
    out.z = leg.cz + Math.sin(a) * r;
    return out;
  }
  // (the net: fast in, slowed by the cords)
  const e = (w * (1 - 0.3 * w)) / 0.7;
  out.x = leg.x0 + (leg.x1 - leg.x0) * w;
  out.y = leg.y0 - leg.drop * e;
  out.z = leg.z0 + (leg.z1 - leg.z0) * w;
  return out;
}

const A: V3 = { x: 0, y: 0, z: 0 };
const B: V3 = { x: 0, y: 0, z: 0 };

/** How fast a shot's ball is going at `u` (ft a second), into `out`. */
export function shotSpeed(shot: Shot, u: number, out: V3): V3 {
  const e = 0.004;
  const lo = Math.max(0, u - e);
  shotAt(shot, lo, A);
  shotAt(shot, u + e, B);
  const t = (u + e - lo) * shot.secs || 1;
  out.x = (B.x - A.x) / t;
  out.y = (B.y - A.y) / t;
  out.z = (B.z - A.z) / t;
  return out;
}

/**
 * A blocked shot, off the hand at `hand`: how fast it goes (ft a second), into `out`. Toward where the play
 * takes it next when it is known (so it is there about `secs` on, having come down and bounced), else back
 * the way it came and to one side; down more than up, as a ball swatted is.
 */
export function swat(hand: V3, from: V3, next: V3 | null, secs: number, r: number, out: V3): V3 {
  let dx = hand.x - from.x;
  let dz = hand.z - from.z;
  let speed = 13 + 5 * r;
  if (next) {
    dx = next.x - hand.x;
    dz = next.z - hand.z;
    // (a bounce or two on the way takes some of its pace)
    speed = clamp((Math.hypot(dx, dz) / Math.max(0.3, secs)) * 1.25, 5, 24);
  } else {
    // (off the hand of a man coming across it: back, and up to a third of the way round)
    const turn = (r - 0.5) * 2.2;
    [dx, dz] = [-dx * Math.cos(turn) + dz * Math.sin(turn), -dx * Math.sin(turn) - dz * Math.cos(turn)];
  }
  const l = Math.hypot(dx, dz) || 1;
  out.x = (dx / l) * speed;
  out.y = 2 - 6 * r;
  out.z = (dz / l) * speed;
  return out;
}

/** What the ball is doing, for its spin. */
export type Spin = 'shot' | 'ft' | 'pass' | 'dribble' | 'held' | 'roll' | 'loose';

/**
 * How the ball turns: into `out`, the axis it turns about times how fast (radians a second, the right-hand
 * way). `vx`, `vz`: how fast it goes along the floor. A shot spins back, a free throw a little slower; a pass
 * spins back and tumbles; off the dribble it rolls forward; on the floor it rolls as fast as it goes; in a
 * man's hands it is still. `null` (loose in the air): as it was.
 */
export function spinFor(kind: Spin, vx: number, vz: number, out: V3): V3 | null {
  if (kind === 'loose') return null;
  const v = Math.hypot(vx, vz);
  if (kind === 'held' || v < 0.05) {
    out.x = out.y = out.z = 0;
    return out;
  }
  // (rolling forward: about the line across its way)
  const ax = vz / v;
  const az = -vx / v;
  if (kind === 'pass') {
    const rate = 5 + Math.min(6, v * 0.25);
    out.x = -ax * rate + (vx / v) * rate * 0.35;
    out.y = rate * 0.45;
    out.z = -az * rate + (vz / v) * rate * 0.35;
    return out;
  }
  const rate = kind === 'shot' ? -15 : kind === 'ft' ? -11.5 : kind === 'dribble' ? 4 + Math.min(9, v * 0.6) : v / BALL;
  out.x = ax * rate;
  out.y = 0;
  out.z = az * rate;
  return out;
}

/**
 * Something that is knocked and rings back to rest (the rim on its hinge, the unit on its base): `x` is how
 * far off rest it is, `hz` how fast it rings, `damp` how soon it stops (1: without ringing at all).
 */
export class Spring {
  x = 0;
  v = 0;
  constructor(
    private readonly hz: number,
    private readonly damp: number,
  ) {}
  kick(v: number) {
    this.v += v;
  }
  /** `sec` on; `rest`: where it is held to for now (a man hanging on the rim), 0 when nothing holds it. */
  step(sec: number, rest = 0) {
    if (this.x === 0 && this.v === 0 && rest === 0) return;
    const w = 2 * Math.PI * this.hz;
    // (in steps short enough for how fast it rings)
    let left = Math.min(sec, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      this.v += (-w * w * (this.x - rest) - 2 * this.damp * w * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    if (rest === 0 && Math.abs(this.x) < 1e-5 && Math.abs(this.v) < 1e-4) this.x = this.v = 0;
  }
  still() {
    this.x = this.v = 0;
  }
}

/**
 * A ball picked up out of the air (a rebound off the iron, a loose ball) on its way somewhere `dx`, `dz` off:
 * how far off the straight line it is at `u` of the move, for having been going `vx`, `vz` (ft a second)
 * when the move began. It starts the way it was going and ends where it is wanted. Into `out` (x, z).
 */
export function veer(dx: number, dz: number, vx: number, vz: number, secs: number, u: number, out: { x: number; z: number }) {
  const k = u * (1 - u) * (1 - u);
  out.x = (vx * secs - dx) * k;
  out.z = (vz * secs - dz) * k;
  return out;
}

/** A basket, for a loose ball: the ring's middle on the floor, and which way the board faces along x. */
export interface Hoop {
  x: number;
  z: number;
  out: 1 | -1;
}

/** The rim's bar (ft), how much of its speed a ball keeps off iron and off glass, and how soon the net's cords take a ball's speed (a second). */
const BAR = 0.03;
const OFF_IRON = 0.55;
const OFF_GLASS = 0.6;
const NET_SLOW = 9;
/** The board, from the floor (ft): its foot and its top. */
const BOARD_LOW = 9.5;
const BOARD_TOP = 13;
/** The net hangs this far under the ring, and is this wide round a ball in it (ft). */
const NET_LEN = 1.4;
const NET_IN = 0.5;

/**
 * A loose ball at `p` going `v` (ft a second) meets what is there: the iron of either rim, the glass, the
 * cords of the net (which slow it and draw it under the ring). Both are put right in place; `sec` is the step
 * it has just taken. What comes back is how hard it met iron (above 0) or glass (below 0), 0 for neither.
 */
export function meets(p: V3, v: V3, sec: number, hoops: readonly Hoop[]): number {
  let hard = 0;
  for (const h of hoops) {
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    const r = Math.hypot(dx, dz);
    if (r > 6) continue;
    // the ring: the nearest point of its bar
    if (r > 1e-3) {
      const cx = h.x + (dx / r) * RING;
      const cz = h.z + (dz / r) * RING;
      const nx = p.x - cx;
      const ny = p.y - RIM_H;
      const nz = p.z - cz;
      const d = Math.hypot(nx, ny, nz);
      if (d < BALL + BAR && d > 1e-4) {
        const k = (BALL + BAR) / d;
        p.x = cx + nx * k;
        p.y = RIM_H + ny * k;
        p.z = cz + nz * k;
        const into = (v.x * nx + v.y * ny + v.z * nz) / d;
        if (into < 0) {
          v.x -= ((1 + OFF_IRON) * into * nx) / d;
          v.y -= ((1 + OFF_IRON) * into * ny) / d;
          v.z -= ((1 + OFF_IRON) * into * nz) / d;
          hard = Math.max(hard, Math.min(1.3, -into / 12));
        }
      }
    }
    // the glass: its face, and the ball in front of it
    const face = h.x - h.out * GLASS;
    const off = (p.x - face) * h.out;
    if (off < BALL && off > -BALL && p.y > BOARD_LOW - 0.2 && p.y < BOARD_TOP + 0.2 && Math.abs(dz) < BOARD_HALF + 0.2) {
      p.x = face + h.out * BALL;
      if (v.x * h.out < 0) {
        if (!hard) hard = -Math.min(1.3, Math.abs(v.x) / 12);
        v.x = -v.x * OFF_GLASS;
      }
    }
    // the net: a ball in it is slowed, and drawn under the middle of the ring
    if (r < NET_IN && p.y < RIM_H - 0.15 && p.y > RIM_H - NET_LEN) {
      const k = Math.exp(-sec * NET_SLOW);
      v.x *= k;
      v.z *= k;
      if (v.y < -5) v.y = -5 + (v.y + 5) * k;
      p.x -= dx * (1 - k);
      p.z -= dz * (1 - k);
    }
  }
  return hard;
}

/**
 * A bounce pass's height at `u` of its way: thrown down from `fromY` to meet the floor (`floor`: the ball's
 * middle there) at `at` of the way, and up off it to `toY`, falling as a ball does on both legs. `secs`: how
 * long the pass has.
 */
export function bouncePass(fromY: number, toY: number, floor: number, at: number, u: number, secs: number): number {
  const down = u < at;
  const t = (down ? u : u - at) * secs;
  const all = Math.max(0.02, (down ? at : 1 - at) * secs);
  const y0 = down ? fromY : floor;
  const y1 = down ? floor : toY;
  return Math.max(floor, y0 + ((y1 - y0) / all + (GRAVITY * all) / 2) * t - (GRAVITY * t * t) / 2);
}

/** How high over the straight line between two hands a pass thrown flat sags and is thrown up to make good: for `secs` in the air (ft). */
export function passArc(secs: number): number {
  return (GRAVITY * secs * secs) / 8;
}

/** A fast ball is drawn a little long the way it goes: how much longer (0: round) at this speed (ft a second). */
export function stretch(speed: number): number {
  return clamp((speed - 28) / 110, 0, 0.16);
}
