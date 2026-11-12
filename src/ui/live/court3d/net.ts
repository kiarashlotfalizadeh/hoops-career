// The net as cord: a lattice of knots hung from the rim's twelve hooks, each cord a length that can go
// slack but not stretch, moved a step at a time (verlet) by its own weight, by the ball going through it
// and by the rim it hangs from. Plain numbers, no three.js: props.ts draws what this works out, and a
// device that can't keep up draws the net Blender made instead (scripts/blender/arena.py `net`, the same
// lattice as it hangs: change both).

/** Cords round the net, rows of knots down it; how long it hangs (ft), how wide its mouth, how it narrows; the hooks' ring. */
export const NET = { n: 12, k: 7, len: 1.3, mouth: 0.37, taper: 1.6, tieY: -0.06, tieR: 0.776 };
/** How far in front of its hinge at the board the ring's middle is (ft): the rim tips about the hinge, and the hooks with it. */
export const RIM_HINGE = 1.2;
/** The ball, for the cords (ft): its radius and half a cord's. */
const BALL = 0.39 + 0.012;
/** A hand and wrist on the rim, for the cords (ft). */
const HAND = 0.2;
const NONE: readonly P3[] = [];
/** A step of the cords' time (s), and the most of them in a frame: past that the net runs slow, it doesn't blow up. */
const STEP = 1 / 240;
const MOST = 10;
/** Times the cords' lengths are put right in a step. */
const PASSES = 2;
/** How much of a cord's stretch is taken up in a pass: under 1 it gives like cord, and springs back. */
const GIVE = 0.55;
/** What a cord weighs it down by (ft a second squared), how much of its speed a knot keeps a step, and how hard it is drawn back to where it hangs (a cord's own stiffness). */
const WEIGHT = 32;
const KEEP = 0.978;
const STIFF = 130;
/** How much of the ball's own speed a knot it touches takes up: it drags the net down with it. */
const DRAG = 0.7;
/** And no faster than this (ft a second): a dunk goes through quicker than cord can follow. */
const DRAG_MOST = 9;
/** How much of the ball's push on a knot is lost: all but this is the knot thrown clear. */
const SOFT = 0.8;
/** Still for this many frames with the ball away, the net is left alone until something moves it. */
const REST_FRAMES = 30;
const STILL = 0.0004;
/** The ball wakes the net from this far off the ring's middle (ft). */
const NEAR = 3;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Where knot `m` of row `k` hangs (the ring's middle at the origin, y up): x, y, z into `out` at `o`. */
export function hangs(k: number, m: number, out: Float32Array | number[], o: number) {
  const t = k / NET.k;
  const r = NET.mouth + (NET.tieR - NET.mouth) * (1 - t) ** NET.taper;
  const a = (2 * Math.PI * (m + 0.5 * (k % 2))) / NET.n;
  out[o] = r * Math.cos(a);
  out[o + 1] = NET.tieY - NET.len * t;
  out[o + 2] = r * Math.sin(a);
}

export class NetSim {
  /** How many knots, and where each is (x, y, z; the ring's middle as it hangs at rest is the origin, +x away from the board). */
  readonly count = (NET.k + 1) * NET.n;
  readonly at = new Float32Array(this.count * 3);
  /** The cords: the two knots each runs between. */
  readonly links: Uint16Array;
  private readonly was = new Float32Array(this.count * 3);
  private readonly home = new Float32Array(this.count * 3);
  private readonly to = new Float32Array(this.count * 3);
  private readonly long: Float32Array;
  private readonly ballWas: P3 = { x: 0, y: 99, z: 0 };
  private owed = 0;
  private quiet = REST_FRAMES;
  private tipWas = 0;
  /** Something has moved it since it was last drawn at rest. */
  awake = false;

  constructor() {
    const { n, k: rows } = NET;
    for (let k = 0; k <= rows; k++) for (let m = 0; m < n; m++) hangs(k, m, this.home, (k * n + m) * 3);
    this.at.set(this.home);
    this.was.set(this.home);
    this.to.set(this.home);
    const links: number[] = [];
    for (let k = 0; k < rows; k++)
      for (let m = 0; m < n; m++) {
        const a = k * n + m;
        links.push(a, (k + 1) * n + m, a, (k + 1) * n + ((m + (k % 2 ? 1 : n - 1)) % n));
      }
    this.links = Uint16Array.from(links);
    this.long = new Float32Array(links.length / 2);
    for (let l = 0; l < this.long.length; l++) this.long[l] = this.far(this.home, links[l * 2], links[l * 2 + 1]);
  }

  private far(p: Float32Array, a: number, b: number) {
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }

  /** The net as it hangs, still. */
  reset() {
    this.at.set(this.home);
    this.was.set(this.home);
    this.to.set(this.home);
    this.ballWas.y = 99;
    this.tipWas = 0;
    this.owed = 0;
    this.quiet = REST_FRAMES;
    this.awake = false;
  }

  /**
   * `sec` on (the bodies' time). `ball`: where the ball's middle is in the net's frame (null: nowhere near);
   * `tip`: how far the rim is tipped about its hinge (radians, under 0 is down); `hands`: a dunker's, on the rim
   * (the cords are pushed off them). True when a knot moved.
   */
  step(sec: number, ball: P3 | null, tip: number, hands: readonly P3[] = NONE): boolean {
    const near = !!ball && Math.hypot(ball.x, ball.z) < NEAR && ball.y > -NEAR && ball.y < NEAR;
    if (near || hands.length || Math.abs(tip - this.tipWas) > 1e-5) this.quiet = 0;
    if (this.quiet >= REST_FRAMES) {
      this.awake = false;
      this.ballWas.y = 99;
      return false;
    }
    this.awake = true;
    // where each knot would hang from the rim as it is tipped (the hooks are there; the rest are drawn toward theirs)
    if (tip !== this.tipWas) {
      const c = Math.cos(tip);
      const s = Math.sin(tip);
      for (let i = 0; i < this.count; i++) {
        const x = this.home[i * 3] + RIM_HINGE;
        const y = this.home[i * 3 + 1];
        this.to[i * 3] = x * c - y * s - RIM_HINGE;
        this.to[i * 3 + 1] = x * s + y * c;
      }
    }
    this.tipWas = tip;
    const n = NET.n;
    const { at, was, to, links, long } = this;
    this.owed = Math.min(this.owed + sec, STEP * MOST);
    const steps = Math.floor(this.owed / STEP);
    this.owed -= steps * STEP;
    // (the ball goes from where it was to where it is over the frame's steps; a ball that has just come is where it is)
    const b0 = this.ballWas;
    const fresh = !near || b0.y > 90 || Math.hypot(ball!.x - b0.x, ball!.y - b0.y, ball!.z - b0.z) > 3;
    let moved = 0;
    for (let st = 1; st <= steps; st++) {
      const w = st / steps;
      const bx = near ? (fresh ? ball!.x : b0.x + (ball!.x - b0.x) * w) : 0;
      const by = near ? (fresh ? ball!.y : b0.y + (ball!.y - b0.y) * w) : 0;
      const bz = near ? (fresh ? ball!.z : b0.z + (ball!.z - b0.z) * w) : 0;
      // (how far the ball goes in a step: what a knot on it is dragged by)
      const went = near && !fresh ? Math.hypot(ball!.x - b0.x, ball!.y - b0.y, ball!.z - b0.z) / steps : 0;
      const drag = went > 0 ? DRAG * Math.min(1, (DRAG_MOST * STEP) / went) : 0;
      const gx = drag ? ((ball!.x - b0.x) / steps) * drag : 0;
      const gy = drag ? ((ball!.y - b0.y) / steps) * drag : 0;
      const gz = drag ? ((ball!.z - b0.z) / steps) * drag : 0;
      for (let i = 0; i < n * 3; i++) at[i] = was[i] = to[i];
      for (let i = n; i < this.count; i++) {
        const o = i * 3;
        for (let c = 0; c < 3; c++) {
          const p = at[o + c];
          const v = (p - was[o + c]) * KEEP;
          was[o + c] = p;
          at[o + c] = p + v + ((to[o + c] - p) * STIFF - (c === 1 ? WEIGHT : 0)) * STEP * STEP;
        }
      }
      for (let pass = 0; pass < PASSES; pass++) {
        for (let l = 0; l < long.length; l++) {
          const a = links[l * 2] * 3;
          const b = links[l * 2 + 1] * 3;
          const dx = at[b] - at[a];
          const dy = at[b + 1] - at[a + 1];
          const dz = at[b + 2] - at[a + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d <= long[l]) continue;
          // (a hook doesn't give: the knot under it takes all of it)
          const fixed = a < n * 3;
          const k = ((d - long[l]) / d) * (fixed ? 1 : 0.5) * GIVE;
          if (!fixed) {
            at[a] += dx * k;
            at[a + 1] += dy * k;
            at[a + 2] += dz * k;
          }
          at[b] -= dx * k;
          at[b + 1] -= dy * k;
          at[b + 2] -= dz * k;
        }
        for (const hand of hands)
          for (let i = n; i < this.count; i++) {
            const o = i * 3;
            const dx = at[o] - hand.x;
            const dy = at[o + 1] - hand.y;
            const dz = at[o + 2] - hand.z;
            const d = Math.hypot(dx, dy, dz);
            if (d >= HAND || d < 1e-6) continue;
            const k = HAND / d;
            // (moved off his wrist, with no speed of its own from it)
            was[o] += dx * (k - 1);
            was[o + 1] += dy * (k - 1);
            was[o + 2] += dz * (k - 1);
            at[o] = hand.x + dx * k;
            at[o + 1] = hand.y + dy * k;
            at[o + 2] = hand.z + dz * k;
          }
        if (!near) continue;
        for (let i = n; i < this.count; i++) {
          const o = i * 3;
          const dx = at[o] - bx;
          const dy = at[o + 1] - by;
          const dz = at[o + 2] - bz;
          const d = Math.hypot(dx, dy, dz);
          if (d >= BALL || d < 1e-6) continue;
          const k = BALL / d;
          // (put off the ball, not thrown off it: most of the push is no speed of the knot's own)
          const dead = (k - 1) * SOFT;
          was[o] += dx * dead;
          was[o + 1] += dy * dead;
          was[o + 2] += dz * dead;
          at[o] = bx + dx * k;
          at[o + 1] = by + dy * k;
          at[o + 2] = bz + dz * k;
          if (pass === 0) {
            was[o] -= gx;
            was[o + 1] -= gy;
            was[o + 2] -= gz;
          }
        }
      }
      if (st === steps) for (let i = n * 3; i < at.length; i++) moved = Math.max(moved, Math.abs(at[i] - was[i]));
    }
    if (near) {
      b0.x = ball!.x;
      b0.y = ball!.y;
      b0.z = ball!.z;
    } else b0.y = 99;
    if (steps > 0) this.quiet = near || moved > STILL ? 0 : this.quiet + 1;
    return steps > 0;
  }
}

/** How many corners a cord is drawn with, and its radius (ft: thicker than a real cord, which the sideline camera would lose). */
export const CORD_SIDES = 3;
export const CORD_R = 0.015;

/** The corners of every cord's triangles (fixed: only the points move). */
export function cordIndex(links: number): Uint16Array {
  const out = new Uint16Array(links * CORD_SIDES * 6);
  for (let l = 0; l < links; l++)
    for (let j = 0; j < CORD_SIDES; j++) {
      const a = l * CORD_SIDES * 2 + j;
      const a1 = l * CORD_SIDES * 2 + ((j + 1) % CORD_SIDES);
      out.set([a, a1, a1 + CORD_SIDES, a, a1 + CORD_SIDES, a + CORD_SIDES], (l * CORD_SIDES + j) * 6);
    }
  return out;
}

/**
 * Every cord as a thin bar between its two knots: its points into `pos` and which way each faces into
 * `nor` (2 x CORD_SIDES points a cord, x, y, z each), one side of each facing out of the net.
 */
export function cords(sim: NetSim, pos: Float32Array, nor: Float32Array) {
  const { at, links } = sim;
  for (let l = 0; l < links.length / 2; l++) {
    const a = links[l * 2] * 3;
    const b = links[l * 2 + 1] * 3;
    let dx = at[b] - at[a];
    let dy = at[b + 1] - at[a + 1];
    let dz = at[b + 2] - at[a + 2];
    const d = Math.hypot(dx, dy, dz) || 1;
    dx /= d;
    dy /= d;
    dz /= d;
    // out of the net at the cord's middle, made square to the cord; and square to both
    let ox = at[a] + at[b];
    let oz = at[a + 2] + at[b + 2];
    const ol = Math.hypot(ox, oz);
    if (ol < 1e-4) [ox, oz] = [1, 0];
    else [ox, oz] = [ox / ol, oz / ol];
    const along = ox * dx + oz * dz;
    let px = ox - dx * along;
    let py = -dy * along;
    let pz = oz - dz * along;
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl;
    py /= pl;
    pz /= pl;
    const qx = dy * pz - dz * py;
    const qy = dz * px - dx * pz;
    const qz = dx * py - dy * px;
    for (let j = 0; j < CORD_SIDES; j++) {
      const ang = (2 * Math.PI * j) / CORD_SIDES;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const nx = px * c + qx * s;
      const ny = py * c + qy * s;
      const nz = pz * c + qz * s;
      for (let e = 0; e < 2; e++) {
        const o = (l * CORD_SIDES * 2 + e * CORD_SIDES + j) * 3;
        const k = e ? b : a;
        pos[o] = at[k] + nx * CORD_R;
        pos[o + 1] = at[k + 1] + ny * CORD_R;
        pos[o + 2] = at[k + 2] + nz * CORD_R;
        nor[o] = nx;
        nor[o + 1] = ny;
        nor[o + 2] = nz;
      }
    }
  }
}
