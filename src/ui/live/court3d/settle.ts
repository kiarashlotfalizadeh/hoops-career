// How a body moves from one frame to the next, once everything has said where it wants it. No three.js here.
//
// Everything a figure does is a path it follows exactly (what is authored: a clip's own motion, its blend into the
// next, the ball where the clip has it) plus what is laid on that path to make it fit the moment: a hand up at a pass,
// a hand on a man, a gesture, a stance kept off a defender, a ball kept out of his own thigh. Those are decided fresh
// each frame, by rules that switch, and a switch is a jump. So nothing laid on a path is ever put where it is wanted:
// it is followed there, as a spring with no bounce, no faster than a body part moves, in a frame and in a second. And
// a body or a ball in its way moves where it *is*, not where it was wanted: a hand pressed against a man rests on him
// and slides over him as either moves, it is never re-placed on his far side because the nearest point of him changed.
//
// Two followers: Follow, for a point (a hand, a ball), and Lay, for the channels of a pose.

/** A point (x, y, z). */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A spring with no bounce (x toward `to`, with speed v, `w` its rate a second, `sec` on): it eases off and eases in. */
export function spring(x: number, v: number, to: number, w: number, sec: number): [number, number] {
  const k = w * sec;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const off = x - to;
  const t = (v + w * off) * sec;
  return [to + (off + t) * e, (v - w * t) * e];
}

/**
 * How a path may move between frames before it is taken for a jump rather than motion: off where it was going by
 * more than JUMP_LEAST ft, or than half PATH_ACC (ft a second, each second) over the frame. Authored motion (a pass
 * whipped through, a stride's arm) is never that sudden at a frame of 1x; a path that is (a blend that restarts, a
 * hand's reference changing) is carried as an offset and comes on to the path over a moment.
 */
const JUMP_LEAST = 0.15;
const PATH_ACC = 250;
/**
 * A path faster than PATH_FASTEST ft a second is not believed (a frame with next to no time in it, MIN_SEC, says
 * nothing of how fast it goes); one that moves more than TELEPORT ft at once has been put somewhere new (a possession
 * picked up elsewhere): that is gone with, not carried (a hand or a ball left yards behind and owed for seconds).
 */
const PATH_FASTEST = 60;
const MIN_SEC = 0.002;
const TELEPORT = 3;
/**
 * Nothing a body does moves a hand or a ball it holds faster than this (ft a second, from its shoulder): a path that does
 * is jumping. And a path that goes farther than PATH_FRAME ft in a drawn frame is carried too, at any speed (it is there a
 * frame or two later): that is all 1x allows anyway, and at 4x a blend of a beat is two frames, and a ball brought down
 * from a rebound into a pass went four feet in one.
 */
const PATH_SPEED = 45;
const PATH_FRAME = 0.9;
const T3 = new Float64Array(3);
const S3 = new Float64Array(3);
const SV3 = new Float64Array(3);

/** How a Follow goes after what is wanted. */
export interface Pace {
  /** Its spring's rate (a second): 1 / its time to get most of the way. */
  w: number;
  /** No faster than this (ft a second of the body's time) ... */
  speed: number;
  /** ... nor farther than this in a drawn frame (ft): played fast, a hand still gets there over frames, not in one. */
  frame: number;
  /** And never farther off its path than this (ft): past it, it is moved on with the path. */
  most: number;
}

/**
 * One point that follows a path (`at`, each frame: authored motion, followed exactly) and is laid off it as far as it
 * is wanted elsewhere (`want`), by an offset that is a spring with no bounce, never a jump. A jump in the path itself
 * is carried by the offset (it goes on where the path was going) and comes back to the path over a moment. A body in
 * the way pushes the point where it is (see push), and that push is part of the offset the next frame starts from.
 * Coordinates are whatever frame the caller keeps (a hand's from its shoulder in his frame, a ball's in his frame).
 */
export class Follow {
  /** How far it is off the path (x, y, z) and how fast that is changing (ft a second). */
  readonly off = new Float64Array(3);
  readonly v = new Float64Array(3);
  /** The path last frame and how fast it was going: what a jump in it is told from. */
  private readonly was = new Float64Array(3);
  private readonly wasV = new Float64Array(3);
  /** Where it is now (after `step` and any `push`). */
  readonly at: P3 = { x: 0, y: 0, z: 0 };
  /** It has been placed: before that, and after `reset`, it is put where it is wanted. */
  on = false;
  private readonly path = new Float64Array(3);
  /** The path jumped last frame: how fast it goes is to be found again. */
  private fresh = false;

  /** Put it where it is wanted on its next step (a body put somewhere new, the first frame). */
  reset() {
    this.on = false;
  }

  /**
   * One frame on: the path is at (ax, ay, az), it is wanted at (wx, wy, wz). `sec`: the body's time (s); `drawn`: the
   * drawn frame's (s), for Pace.frame; `scale`: the body's size (Pace and JUMP_LEAST are the 6 ft 6 puppet's). Returns
   * where it is (also `this.at`).
   */
  step(ax: number, ay: number, az: number, wx: number, wy: number, wz: number, sec: number, drawn: number, pace: Pace, scale = 1): P3 {
    const O = this.off;
    const V = this.v;
    const W = this.was;
    const WV = this.wasV;
    const A = this.path;
    A[0] = ax;
    A[1] = ay;
    A[2] = az;
    if (!this.on) {
      this.on = true;
      O[0] = wx - ax;
      O[1] = wy - ay;
      O[2] = wz - az;
      V.fill(0);
      W.set(A);
      WV.fill(0);
    } else if (sec > 0) {
      // (the path where it was going: off that by more than motion moves it, or moving faster than a body moves it, it
      // jumped, and the jump is carried; put somewhere else altogether, it is gone with. A frame after a jump, how fast
      // it goes is not known, and is found again from it: only a step faster than PATH_SPEED is a jump then. Kept from
      // before the jump, a path that turned sharply (a ball off the floor) would be off it every frame after)
      const fresh = this.fresh;
      const px = W[0] + (fresh ? 0 : WV[0] * sec);
      const py = W[1] + (fresh ? 0 : WV[1] * sec);
      const pz = W[2] + (fresh ? 0 : WV[2] * sec);
      const dev = Math.hypot(ax - px, ay - py, az - pz);
      const moved = Math.hypot(ax - W[0], ay - W[1], az - W[2]);
      const fastest = Math.min(PATH_SPEED * sec + JUMP_LEAST, PATH_FRAME * Math.max(1, drawn * 60)) * scale;
      if (moved > (TELEPORT + PATH_SPEED * sec) * scale) {
        WV.fill(0);
        this.fresh = true;
      } else if (moved > fastest || (!fresh && dev > Math.max(JUMP_LEAST * scale, 0.5 * PATH_ACC * scale * sec * sec))) {
        O[0] += px - ax;
        O[1] += py - ay;
        O[2] += pz - az;
        this.fresh = true;
      } else if (sec >= MIN_SEC) {
        this.fresh = false;
        for (let a = 0; a < 3; a++) WV[a] = (A[a] - W[a]) / sec;
        const fast = Math.hypot(WV[0], WV[1], WV[2]);
        const most = PATH_FASTEST * scale;
        if (fast > most) for (let a = 0; a < 3; a++) WV[a] *= most / fast;
      }
      W.set(A);
      // (the offset to where it is wanted, as a spring, no faster than pace allows)
      let ex = 0;
      T3[0] = wx - ax;
      T3[1] = wy - ay;
      T3[2] = wz - az;
      for (let a = 0; a < 3; a++) {
        const [x, v] = spring(O[a], V[a], T3[a], pace.w, sec);
        S3[a] = x - O[a];
        SV3[a] = v;
        ex += S3[a] * S3[a];
      }
      const S = S3;
      const SV = SV3;
      const far = Math.sqrt(ex);
      const most = Math.min(pace.speed * sec, pace.frame * Math.max(1, drawn * 60)) * scale;
      if (far > most) {
        const k = most / far;
        for (let a = 0; a < 3; a++) {
          O[a] += S[a] * k;
          V[a] = (S[a] * k) / sec;
        }
      } else
        for (let a = 0; a < 3; a++) {
          O[a] += S[a];
          V[a] = SV[a];
        }
      // (never farther off the path than pace allows)
      const off = Math.hypot(O[0], O[1], O[2]);
      const out = pace.most * scale;
      if (off > out) for (let a = 0; a < 3; a++) O[a] *= out / off;
    }
    this.at.x = ax + O[0];
    this.at.y = ay + O[1];
    this.at.z = az + O[2];
    return this.at;
  }

  /**
   * Something in the way moves it by (dx, dy, dz), no farther than `most` ft: where it is, not where it was wanted.
   * What of its speed went into the push is lost (it rests on what stopped it). Returns how far it moved.
   */
  push(dx: number, dy: number, dz: number, most = Infinity): number {
    const far = Math.hypot(dx, dy, dz);
    if (far < 1e-9) return 0;
    const k = Math.min(1, most / far);
    const O = this.off;
    const V = this.v;
    O[0] += dx * k;
    O[1] += dy * k;
    O[2] += dz * k;
    this.at.x += dx * k;
    this.at.y += dy * k;
    this.at.z += dz * k;
    const nx = dx / far;
    const ny = dy / far;
    const nz = dz / far;
    const into = V[0] * nx + V[1] * ny + V[2] * nz;
    if (into < 0) {
      V[0] -= nx * into;
      V[1] -= ny * into;
      V[2] -= nz * into;
    }
    return far * k;
  }

  /** It is moved with its path by (dx, dy, dz) and nothing carries over (the path's frame of reference changed under it). */
  shift(dx: number, dy: number, dz: number) {
    this.was[0] += dx;
    this.was[1] += dy;
    this.was[2] += dz;
  }
}

/**
 * What is laid over a clip, followed: each channel of a pose is its clip's own value (followed exactly: the clip, and
 * its blend from the last one, are authored motion) plus what everything else lays on it (a gesture, a stance kept off
 * a man, a shot's own style, a lean into a contact), and that is followed, not set: a spring with no bounce (LAY_W),
 * no faster than its group's speed in a second of the body's time nor than its share in a drawn frame. A rule that
 * switches (an arm raised on whichever side a man is, a gesture that drops out for a frame) is then a motion, never a
 * pop, and a rule that flickers is felt as a flutter, a twentieth of its size. Channels with no speed are left as laid.
 */
export class Lay {
  private readonly d: Float32Array;
  private readonly v: Float32Array;
  private on = false;
  constructor(
    n: number,
    /** Each channel's speed (units a second; 0: not followed) and its most in a drawn frame. */
    private readonly speed: Float32Array,
    private readonly frame: Float32Array,
    private readonly w: number,
  ) {
    this.d = new Float32Array(n);
    this.v = new Float32Array(n);
  }
  reset() {
    this.on = false;
  }
  /**
   * `pose` is the clip's values with everything laid on them; `clip` the clip's own. The pose becomes the clip's
   * values plus what was laid on them, followed.
   */
  step(pose: Float32Array, clip: Float32Array, sec: number, frameSec: number) {
    const D = this.d;
    const V = this.v;
    const n = D.length;
    if (!this.on) {
      this.on = true;
      for (let i = 0; i < n; i++) {
        D[i] = pose[i] - clip[i];
        V[i] = 0;
      }
      return;
    }
    if (sec <= 0) {
      for (let i = 0; i < n; i++) if (this.speed[i] > 0) pose[i] = clip[i] + D[i];
      return;
    }
    for (let i = 0; i < n; i++) {
      const sp = this.speed[i];
      if (sp <= 0) continue;
      const want = pose[i] - clip[i];
      const [x, v] = spring(D[i], V[i], want, this.w, sec);
      const most = Math.min(sp * sec, this.frame[i] * Math.max(1, frameSec * 60));
      const st = x - D[i];
      if (Math.abs(st) > most) {
        D[i] += Math.sign(st) * most;
        V[i] = (Math.sign(st) * most) / sec;
      } else {
        D[i] = x;
        V[i] = v;
      }
      pose[i] = clip[i] + D[i];
    }
  }
}
