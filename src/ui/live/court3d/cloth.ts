// His shorts as cloth: each leg of them, below where it leaves his seat, a few hoops of knots hung one under the
// other. A hoop hangs from the one above by cords that go slack and never stretch; it falls by its own weight, is
// left behind when he goes and carries on when he stops, is held back by the air, and lies against his thigh (and the
// other one, and his calf) where they are in its way. A hoop keeps its shape, loosely: pushed in on one side it gives,
// and comes back. The first hoop is his thigh's own: the cloth leaves his seat with it.
// Plain numbers, no three.js, in the floor's frame (ft, y up): figure.ts says where his legs are each frame and puts
// a bone at each knot (scripts/blender/figure.py's cloth_share hangs his shorts on them: the same hoops, change both).
// A step is his body's own time, so a replay at a quarter speed swings them at a quarter speed.

/** Knots round a hoop, and hoops under the first (figure.py's CLOTH_R, and its CLOTH_Y less one). */
export const CLOTH = { n: 8, rows: 3 };
/** Knots a leg (the first hoop's with them). */
export const KNOTS = (CLOTH.rows + 1) * CLOTH.n;
/**
 * His thigh under them, as he is built (figure.py prints it: cloth_measure): how far down from his hip joint, where
 * its middle is from the line of the bone there (out from his middle on his left; forward), and how far round that
 * his skin is. The last is his knee.
 */
export const THIGH_R = [
  [0.4, -0.046, 0.122, 0.328],
  [0.76, -0.06, 0.13, 0.323],
  [1.13, -0.066, 0.084, 0.271],
  [1.49, -0.048, -0.004, 0.216],
  [1.62, -0.022, -0.027, 0.213],
] as const;
/** His calf, for the cloth (ft, as built): how thick at his knee and at his ankle. */
export const SHIN_R = [0.2, 0.13] as const;
/**
 * A leg, as figure.ts tells it (FRAME numbers): where his hip joint is, his thigh bone's own three axes (its left, up
 * along it, its front), his knee, his ankle.
 */
export const FRAME = 18;

/**
 * The longest step of the cloth's time (s), and the most of them in a frame: a longer frame's steps are longer. One
 * step to a frame drawn sixty times a second (a little over a sixtieth, so a frame a hair long is still one): two
 * were no better to look at, and ten men's cloth is two thirds of a millisecond a step on a fast machine.
 */
const STEP = 0.018;
const MOST = 6;
/** A frame longer than this (s), or a hip further than this from where it was (ft, and ft a second), is not a move but a cut: the cloth is hung afresh. */
const CUT_SEC = 0.25;
const CUT_FAR = 2.5;
const CUT_FAST = 60;
/** And a thigh turned further than this in a frame (the three axes' agreement added up: 3 is none, some 100 degrees): the game played at four times its speed turns a man round in one. */
const CUT_TURN = 0.65;
/** Times the cords and what is in the cloth's way are put right in a step. */
const PASSES = 3;
/**
 * What cloth weighs (ft a second squared), and the air on it: the air he goes through goes with him, this much of his
 * hips' speed (he is in front of his own shorts); the cloth's speed through that air is taken off it this fast (a
 * second, slow as it is) and this much faster for each ft a second of it (so by the square of it: a breath at a walk,
 * a third of its weight at a sprint). Taken off in proportion alone, at a rate that stills a swing, a man backing up
 * at a jog flew his shorts like a flag, level with his hips.
 */
const WEIGHT = 32;
const WAKE = 0.5;
const AIR = 0.5;
const AIR_FAST = 0.07;
/** How fast any knot takes up the speed of his leg where it is (a second): the cloth rubs on him and on itself, and a swing dies in one or two. */
const RUB = 3.2;
/** How fast the cloth is stilled while it is hung afresh (a second). */
const STILL = 9;
/** How fast a hoop comes back to its own shape (a second), and how hard a knot is drawn to where it hangs as built (a second squared: a little, so a man standing still wears them straight). */
const SHAPE = 34;
const MEMORY = 14;
/** A hoop is never turned further than this from the way his thigh lies (the cosine of it: some 75 degrees). */
const TURNED = 0.26;
/** How much of a hoop's own edge gives when it is pushed in (of 1), and how short a cord down the cloth gets before the cloth is bunched as far as it goes (of its length). */
const EDGE_IN = 0.5;
const BUNCH = 0.72;
/**
 * A man who comes down faster than a thing falls (his jump is drawn, not worked out; let go of the rim he is put on the
 * floor) would leave his shorts behind in the air, up round his waist. The cloth comes down with him: when his hips
 * drop faster than this share of its weight would take it, it drops as fast and that much faster, so it always hangs,
 * lightly at the least. And no drop is counted harder than this many times its weight.
 */
const FLOAT = 0.3;
const DROP_MOST = 4;
/**
 * And one who is stopped dead from a run, or thrown into one, in a frame or two (a dunk carries him to the rim and
 * leaves him there) would throw his shorts on ahead of him, up over his waist. Across the floor the cloth is left
 * behind, or carried on, by no more than this (ft a second squared: most of its weight): what his hips' speed changes
 * by past that in a frame, the cloth's changes by too.
 */
const SHOVE = 24;
/** How far off his skin the cloth lies (ft), how far off the other leg's (which has its own cloth round it), and how fast a knot lying on him takes up his leg's own speed (a second). */
const SKIN = 0.035;
const GRIP = 6;
/**
 * A hoop is always bigger round than the thigh it is on, by this much room at the least (ft): the thigh the cloth
 * lies against is a round one, and his own is not, so where the round one would be as big as the hoop (high up, where
 * his thighs meet) it is made smaller. A hoop that fits its thigh tight can't slide on it: lifted with his knee, the
 * cloth stayed bunched at his hip when he stood.
 */
const FIT = 0.02;
/** His other thigh is in the cloth's way only from this far down it (ft, as built: above, his thighs meet and the two legs of his shorts are one cloth), and this much thinner than it is (the cloth round it gives). */
const OTHER_FROM = 0.6;
const OTHER_IN = 0.04;
/** A knot is never this far from where it would be were the cloth his thigh's (ft): past it, something has gone wrong. */
const LOST = 1.6;
/** Steps to hang the cloth afresh, and how long each (s). */
const SETTLE = 26;
const SETTLE_STEP = 1 / 60;

const COS = Array.from({ length: CLOTH.n }, (_, m) => Math.cos((2 * Math.PI * m) / CLOTH.n));
const SIN = Array.from({ length: CLOTH.n }, (_, m) => Math.sin((2 * Math.PI * m) / CLOTH.n));

/** A hoop's own axes from its knots (`p`, from `o`): out from his middle, along the leg, forward, into `out` (9). False if it has none. */
function axes(p: Float32Array, o: number, out: Float64Array): boolean {
  let [ux, uy, uz, wx, wy, wz] = [0, 0, 0, 0, 0, 0];
  for (let m = 0; m < CLOTH.n; m++) {
    const i = o + m * 3;
    ux += COS[m] * p[i];
    uy += COS[m] * p[i + 1];
    uz += COS[m] * p[i + 2];
    wx += SIN[m] * p[i];
    wy += SIN[m] * p[i + 1];
    wz += SIN[m] * p[i + 2];
  }
  const ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-6) return false;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const d = wx * ux + wy * uy + wz * uz;
  wx -= ux * d;
  wy -= uy * d;
  wz -= uz * d;
  const wl = Math.hypot(wx, wy, wz);
  if (wl < 1e-6) return false;
  wx /= wl;
  wy /= wl;
  wz /= wl;
  out[0] = ux;
  out[1] = uy;
  out[2] = uz;
  // (forward crossed with out: along the leg)
  out[3] = wy * uz - wz * uy;
  out[4] = wz * ux - wx * uz;
  out[5] = wx * uy - wy * ux;
  out[6] = wx;
  out[7] = wy;
  out[8] = wz;
  return true;
}

const F = new Float64Array(9);
const R = new Float64Array(9);
const L = [0, 0, 0];

export class ShortsSim {
  /** Where each knot is (the floor's frame): his left leg's hoops from the first down, then his right's. */
  readonly at = new Float32Array(2 * KNOTS * 3);
  /** How each hoop under the first is turned from how it is built (a matrix's rows, 9 numbers): his left leg's, then his right's. */
  readonly turn = new Float32Array(2 * CLOTH.rows * 9);
  /** How far each leg's cloth is bunched up his thigh (of 1: its cords down it shorter than they are long, on the whole). */
  readonly bunch = [0, 0];
  private readonly vel = new Float32Array(2 * KNOTS * 3);
  private readonly was = new Float32Array(2 * KNOTS * 3);
  /** Each knot as built, from his hip joint in his thigh's own axes; and each hoop's axes and middle as built. */
  private readonly rest: Float32Array;
  private readonly rest0 = new Float64Array(2 * (CLOTH.rows + 1) * 9);
  private readonly mid0 = new Float64Array(2 * (CLOTH.rows + 1) * 3);
  /** Where each knot would be were the cloth his thigh's, now, and as this step has it. */
  private readonly home = new Float32Array(2 * KNOTS * 3);
  /** His legs a frame ago, and as this step has them. */
  private readonly legWas = new Float32Array(2 * FRAME);
  private readonly leg = new Float32Array(2 * FRAME);
  /** The cords: the two knots each runs between (a leg's own count), how long it is, and its kind (0 a cord down, 1 one across the cloth, 2 a hoop's own edge). */
  private readonly links: number[] = [];
  private readonly long: Float32Array;
  /** Each leg's thigh, as THIGH_R but his own size; his calf's two ends' thickness. */
  private readonly thigh: number[][][];
  private readonly shin: readonly [number, number];
  private readonly otherFrom: number;
  private readonly otherIn: number;
  /** How far each hoop's middle may be from his thigh's (ft: see around). */
  private readonly slack = new Float32Array(CLOTH.rows + 1);
  /** Which knots lie on him this step. */
  private readonly on = new Uint8Array(2 * KNOTS);
  private fresh = true;
  /** How fast his hips were rising a frame ago (ft a second), and how much harder than its weight the cloth is drawn down this frame (see FLOAT). */
  private rose = 0;
  private drop = 0;
  /** How fast his hips were going across the floor a frame ago (ft a second: x, z; see SHOVE). */
  private readonly went = [0, 0];

  /**
   * `rest`: each knot as he is built, his left leg's then his right's (KNOTS each; x, y, z from his hip joint, his own
   * size). `wide`, `tall`: how much thicker and longer than the model's his thighs are; `calf`: his calves.
   */
  constructor(rest: Float32Array, wide: number, tall: number, calf: number) {
    this.rest = Float32Array.from(rest);
    this.thigh = [1, -1].map((s) => THIGH_R.map(([d, x, z, r]) => [d * tall, s * x * wide, z * wide, r * wide]));
    this.shin = [SHIN_R[0] * calf, SHIN_R[1] * calf];
    this.otherFrom = OTHER_FROM * tall;
    this.otherIn = OTHER_IN * wide;
    const { n, rows } = CLOTH;
    // (each hoop goes round its thigh with room to spare: see FIT)
    for (let leg = 0; leg < 2; leg++)
      for (let k = 0; k <= rows; k++) {
        const T = this.thigh[leg][k];
        for (let m = 0; m < n; m++) {
          const o = (leg * KNOTS + k * n + m) * 3;
          T[3] = Math.min(T[3], Math.hypot(rest[o] - T[1], rest[o + 2] - T[2]) - SKIN - FIT);
        }
      }
    for (let k = 1; k <= rows; k++)
      for (let m = 0; m < n; m++) {
        const b = k * n + m;
        this.links.push((k - 1) * n + m, b, 0);
        this.links.push((k - 1) * n + ((m + 1) % n), b, 1);
        this.links.push((k - 1) * n + ((m + n - 1) % n), b, 1);
        this.links.push(b, k * n + ((m + 1) % n), 2);
      }
    // (how far a hoop can go to one side before his thigh is against the other: as far as it is bigger round than his
    // thigh, and no less than it is off his thigh's middle as built)
    for (let k = 1; k <= rows; k++) {
      const T = this.thigh[0][k];
      let [mx, mz, round] = [0, 0, 0];
      for (let m = 0; m < n; m++) {
        mx += rest[(k * n + m) * 3] / n;
        mz += rest[(k * n + m) * 3 + 2] / n;
      }
      for (let m = 0; m < n; m++) round += Math.hypot(rest[(k * n + m) * 3] - mx, rest[(k * n + m) * 3 + 2] - mz) / n;
      this.slack[k] = Math.max(round - T[3] - SKIN, Math.hypot(mx - T[1], mz - T[2]) + FIT);
    }
    // (a cord is as long on his right leg as on his left: the two are built the same)
    this.long = new Float32Array(this.links.length / 3);
    for (let l = 0; l < this.long.length; l++) {
      const [a, b] = [this.links[l * 3] * 3, this.links[l * 3 + 1] * 3];
      this.long[l] = Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]);
    }
    for (let leg = 0; leg < 2; leg++)
      for (let k = 0; k <= rows; k++) {
        const o = (leg * KNOTS + k * n) * 3;
        const h = leg * (rows + 1) + k;
        if (!axes(this.rest, o, F)) throw new Error('cloth: a hoop with no shape');
        this.rest0.set(F, h * 9);
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let m = 0; m < n; m++) sum += this.rest[o + m * 3 + c];
          this.mid0[h * 3 + c] = sum / n;
        }
      }
    for (let h = 0; h < 2 * rows; h++) this.turn.set([1, 0, 0, 0, 1, 0, 0, 0, 1], h * 9);
  }

  /** The cloth is hung afresh the next time it is stepped (he was out of the picture, or put somewhere else). */
  forget() {
    this.fresh = true;
  }

  /** A point of a leg (from his hip joint, in his thigh's axes) in the floor's frame, into `out` at `o`. */
  private out(f: Float32Array, leg: number, x: number, y: number, z: number, out: Float32Array | number[], o: number) {
    const b = leg * FRAME;
    out[o] = f[b] + f[b + 3] * x + f[b + 6] * y + f[b + 9] * z;
    out[o + 1] = f[b + 1] + f[b + 4] * x + f[b + 7] * y + f[b + 10] * z;
    out[o + 2] = f[b + 2] + f[b + 5] * x + f[b + 8] * y + f[b + 11] * z;
  }

  /** Where each knot would be were the cloth his thigh's, with his legs as `f` has them. */
  private homes(f: Float32Array) {
    for (let leg = 0; leg < 2; leg++)
      for (let i = 0; i < KNOTS; i++) {
        const o = (leg * KNOTS + i) * 3;
        this.out(f, leg, this.rest[o], this.rest[o + 1], this.rest[o + 2], this.home, o);
      }
  }

  /**
   * `sec` on (his body's time), his legs now as `legs` has them (his left's FRAME numbers, then his right's). A frame
   * with no time in it leaves the cloth as it hangs, unless he has been moved under it.
   */
  step(sec: number, legs: Float32Array) {
    const far = Math.hypot(legs[0] - this.legWas[0], legs[1] - this.legWas[1], legs[2] - this.legWas[2]);
    // (how far each thigh has turned since: all the way round is 3, a quarter turn 1)
    let turned = 3;
    for (let b = 3; b < 2 * FRAME; b += FRAME) {
      let same = 0;
      for (let i = 0; i < 9; i++) same += legs[b + i] * this.legWas[b + i];
      turned = Math.min(turned, same);
    }
    if (this.fresh || sec > CUT_SEC || far > Math.max(CUT_FAR, CUT_FAST * sec) || turned < CUT_TURN || !Number.isFinite(far)) {
      this.hang(legs);
      return;
    }
    if (sec <= 0) {
      if (far > 0.02) this.hang(legs);
      return;
    }
    const rise = (legs[1] - this.legWas[1]) / sec;
    this.drop = Math.max(0, Math.min(DROP_MOST * WEIGHT, -(rise - this.rose) / sec - (1 - FLOAT) * WEIGHT));
    this.rose = rise;
    // (his hips' speed across the floor, the middle of the two joints', and what it has changed by past SHOVE)
    const gx = (legs[0] + legs[FRAME] - this.legWas[0] - this.legWas[FRAME]) / 2 / sec;
    const gz = (legs[2] + legs[FRAME + 2] - this.legWas[2] - this.legWas[FRAME + 2]) / 2 / sec;
    const [cx, cz] = [gx - this.went[0], gz - this.went[1]];
    const jolt = Math.hypot(cx, cz);
    if (jolt > SHOVE * sec) {
      const k = 1 - (SHOVE * sec) / jolt;
      for (let i = 0; i < this.vel.length; i += 3) {
        this.vel[i] += cx * k;
        this.vel[i + 2] += cz * k;
      }
    }
    this.went[0] = gx;
    this.went[1] = gz;
    const steps = Math.min(MOST, Math.ceil(sec / STEP));
    const h = sec / steps;
    for (let st = 1; st <= steps; st++) {
      const w = st / steps;
      for (let i = 0; i < 2 * FRAME; i++) this.leg[i] = this.legWas[i] + (legs[i] - this.legWas[i]) * w;
      if (steps > 1) this.square();
      this.advance(h, sec, legs);
    }
    this.legWas.set(legs);
    this.read();
    if (this.lost()) this.hang(legs);
  }

  /**
   * This step's thighs' axes made square and a foot long again: half way between a thigh as it was and as it is, turned
   * a third of the way round in one long frame, they are neither, and the first hoop on them was a size smaller.
   */
  private square() {
    const f = this.leg;
    for (let b = 3; b < 2 * FRAME; b += FRAME) {
      const yl = Math.hypot(f[b + 3], f[b + 4], f[b + 5]) || 1;
      for (let c = 3; c < 6; c++) f[b + c] /= yl;
      const d = f[b] * f[b + 3] + f[b + 1] * f[b + 4] + f[b + 2] * f[b + 5];
      for (let c = 0; c < 3; c++) f[b + c] -= f[b + 3 + c] * d;
      const xl = Math.hypot(f[b], f[b + 1], f[b + 2]) || 1;
      for (let c = 0; c < 3; c++) f[b + c] /= xl;
      f[b + 6] = f[b + 1] * f[b + 5] - f[b + 2] * f[b + 4];
      f[b + 7] = f[b + 2] * f[b + 3] - f[b] * f[b + 5];
      f[b + 8] = f[b] * f[b + 4] - f[b + 1] * f[b + 3];
    }
  }

  /** The cloth as it hangs on him where he is, still. */
  private hang(legs: Float32Array) {
    this.fresh = false;
    this.rose = this.drop = 0;
    this.went[0] = this.went[1] = 0;
    this.legWas.set(legs);
    this.leg.set(legs);
    this.homes(legs);
    this.at.set(this.home);
    this.vel.fill(0);
    // (let down from his thigh's own shape onto him: thick air, so it comes to rest and doesn't swing)
    for (let st = 0; st < SETTLE; st++) this.advance(SETTLE_STEP, 0, legs);
    this.vel.fill(0);
    this.read();
    if (this.lost()) {
      this.at.set(this.home);
      this.read();
    }
  }

  private lost(): boolean {
    const { at, home } = this;
    for (let i = 0; i < at.length; i += 3) {
      const d = Math.hypot(at[i] - home[i], at[i + 1] - home[i + 1], at[i + 2] - home[i + 2]);
      if (!(d < LOST)) return true;
    }
    return false;
  }

  /** One step of `h` s, his legs as `this.leg` has them (`sec`: the frame they moved over, 0 for still; `legs`: where they end it). */
  private advance(h: number, sec: number, legs: Float32Array) {
    const { at, vel, was, home, on } = this;
    const { n, rows } = CLOTH;
    this.homes(this.leg);
    const still = sec > 0 ? 1 : Math.exp(-h * STILL);
    for (let leg = 0; leg < 2; leg++) {
      const base = leg * KNOTS * 3;
      // (the air about this leg: going his hips' way)
      const b = leg * FRAME;
      const wx = sec > 0 ? (WAKE * (legs[b] - this.legWas[b])) / sec : 0;
      const wy = sec > 0 ? (WAKE * (legs[b + 1] - this.legWas[b + 1])) / sec : 0;
      const wz = sec > 0 ? (WAKE * (legs[b + 2] - this.legWas[b + 2])) / sec : 0;
      // (the first hoop is his thigh's)
      for (let i = 0; i < n * 3; i++) at[base + i] = was[base + i] = home[base + i];
      for (let i = n; i < KNOTS; i++) {
        const o = base + i * 3;
        let vx = vel[o] + (home[o] - at[o]) * MEMORY * h - wx;
        let vy = vel[o + 1] + ((home[o + 1] - at[o + 1]) * MEMORY - WEIGHT - this.drop) * h - wy;
        let vz = vel[o + 2] + (home[o + 2] - at[o + 2]) * MEMORY * h - wz;
        const keep = still / (1 + h * (AIR + AIR_FAST * Math.hypot(vx, vy, vz)));
        vx = vx * keep + wx;
        vy = vy * keep + wy;
        vz = vz * keep + wz;
        for (let c = 0; c < 3; c++) was[o + c] = at[o + c];
        vel[o] = vx;
        vel[o + 1] = vy;
        vel[o + 2] = vz;
        at[o] += vx * h;
        at[o + 1] += vy * h;
        at[o + 2] += vz * h;
      }
    }
    on.fill(0);
    for (let pass = 0; pass < PASSES; pass++)
      for (let leg = 0; leg < 2; leg++) {
        const base = leg * KNOTS * 3;
        for (let l = 0; l < this.long.length; l++) {
          const a = base + this.links[l * 3] * 3;
          const b = base + this.links[l * 3 + 1] * 3;
          const kind = this.links[l * 3 + 2];
          const dx = at[b] - at[a];
          const dy = at[b + 1] - at[a + 1];
          const dz = at[b + 2] - at[a + 2];
          const d = Math.hypot(dx, dy, dz);
          // (a cord goes slack, but the cloth it stands for only bunches up so far; a hoop's own edge is as long as it is)
          const long = d > this.long[l] || kind === 2 ? this.long[l] : kind === 0 && d < BUNCH * this.long[l] ? BUNCH * this.long[l] : d;
          if (d < 1e-6 || long === d) continue;
          // (a knot of the first hoop doesn't give: the one under it takes all of it)
          const fixed = a - base < n * 3;
          const k = ((d - long) / d) * (fixed ? 1 : 0.5) * (d < long && kind === 2 ? EDGE_IN : 1);
          if (!fixed) {
            at[a] += dx * k;
            at[a + 1] += dy * k;
            at[a + 2] += dz * k;
          }
          at[b] -= dx * k;
          at[b + 1] -= dy * k;
          at[b + 2] -= dz * k;
        }
        for (let i = n; i < KNOTS; i++) {
          const o = base + i * 3;
          if (this.thighOff(leg, o, SKIN, 0)) on[leg * KNOTS + i] = 1;
          this.thighOff(1 - leg, o, -this.otherIn, this.otherFrom);
          // (his calf comes up under the lower of the cloth only, his knee folded)
          if (i >= 2 * n && this.shinOff(leg, o)) on[leg * KNOTS + i] = 1;
        }
      }
    for (let leg = 0; leg < 2; leg++) for (let k = 1; k <= rows; k++) this.around(leg, k);
    // each hoop toward its own shape, where it is and as it is turned
    const gives = 1 - Math.exp(-h * SHAPE);
    for (let leg = 0; leg < 2; leg++)
      for (let k = 1; k <= rows; k++) {
        const o = (leg * KNOTS + k * n) * 3;
        if (!this.turned(leg, k)) continue;
        // (a hoop turned right over on his thigh, its front behind him: a leg thrown through it in a frame can leave
        // it so, and it would keep the shape, its cords crossed and the hem a hand up his thigh for good. Past TURNED
        // from the way his thigh lies it is put straight, where it is)
        const f = this.leg;
        const b = leg * FRAME + 3;
        let same = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) same += R[i * 3 + j] * f[b + j * 3 + i];
        const over = (same - 1) / 2 < TURNED;
        if (over) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = f[b + j * 3 + i];
        const give = over ? 1 : gives;
        const m0 = (leg * (rows + 1) + k) * 3;
        let [cx, cy, cz] = [0, 0, 0];
        for (let m = 0; m < n; m++) {
          cx += at[o + m * 3];
          cy += at[o + m * 3 + 1];
          cz += at[o + m * 3 + 2];
        }
        cx /= n;
        cy /= n;
        cz /= n;
        for (let m = 0; m < n; m++) {
          const i = o + m * 3;
          const x = this.rest[i] - this.mid0[m0];
          const y = this.rest[i + 1] - this.mid0[m0 + 1];
          const z = this.rest[i + 2] - this.mid0[m0 + 2];
          at[i] += (cx + R[0] * x + R[1] * y + R[2] * z - at[i]) * give;
          at[i + 1] += (cy + R[3] * x + R[4] * y + R[5] * z - at[i + 1]) * give;
          at[i + 2] += (cz + R[6] * x + R[7] * y + R[8] * z - at[i + 2]) * give;
        }
      }
    // what speed each knot has now, and some of his leg's where its hoop is: more of it, lying on him
    const grip = 1 - Math.exp(-h * GRIP);
    const rub = 1 - Math.exp(-h * RUB);
    for (let leg = 0; leg < 2; leg++)
      for (let k = 1; k <= rows; k++) {
        const o = (leg * KNOTS + k * n) * 3;
        // (the point of his leg the hoop's middle is at: where it was a frame ago, and where it is at the frame's end)
        let [lx, ly, lz] = [0, 0, 0];
        if (sec > 0) {
          let [cx, cy, cz] = [0, 0, 0];
          for (let m = 0; m < n; m++) {
            cx += at[o + m * 3] / n;
            cy += at[o + m * 3 + 1] / n;
            cz += at[o + m * 3 + 2] / n;
          }
          this.local(this.leg, leg, cx, cy, cz);
          const [x, y, z] = L;
          this.out(this.legWas, leg, x, y, z, L, 0);
          const [px, py, pz] = L;
          this.out(legs, leg, x, y, z, L, 0);
          lx = (L[0] - px) / sec;
          ly = (L[1] - py) / sec;
          lz = (L[2] - pz) / sec;
        }
        for (let m = 0; m < n; m++) {
          const i = o + m * 3;
          const take = on[leg * KNOTS + k * n + m] ? grip : rub;
          vel[i] = (at[i] - was[i]) / h;
          vel[i + 1] = (at[i + 1] - was[i + 1]) / h;
          vel[i + 2] = (at[i + 2] - was[i + 2]) / h;
          vel[i] += (lx - vel[i]) * take;
          vel[i + 1] += (ly - vel[i + 1]) * take;
          vel[i + 2] += (lz - vel[i + 2]) * take;
        }
      }
  }

  /** A point of the floor's frame from a leg's hip joint in its thigh's axes, into L. */
  private local(f: Float32Array, leg: number, x: number, y: number, z: number) {
    const b = leg * FRAME;
    x -= f[b];
    y -= f[b + 1];
    z -= f[b + 2];
    L[0] = x * f[b + 3] + y * f[b + 4] + z * f[b + 5];
    L[1] = x * f[b + 6] + y * f[b + 7] + z * f[b + 8];
    L[2] = x * f[b + 9] + y * f[b + 10] + z * f[b + 11];
  }

  /** The knot at `o` put off leg `leg`'s thigh, `room` off his skin, from `from` down it. True if it was in it. */
  private thighOff(leg: number, o: number, room: number, from: number): boolean {
    const { at } = this;
    const T = this.thigh[leg];
    this.local(this.leg, leg, at[o], at[o + 1], at[o + 2]);
    const down = -L[1];
    const last = T.length - 1;
    // (above his hip joint there is no thigh; past his knee, its round end)
    if (down < from) return false;
    let [cx, cz, r] = [T[last][1], T[last][2], T[last][3]];
    let dy = 0;
    if (down <= T[0][0]) [cx, cz, r] = [T[0][1], T[0][2], T[0][3]];
    else if (down < T[last][0]) {
      let k = 0;
      while (down > T[k + 1][0]) k++;
      const u = (down - T[k][0]) / (T[k + 1][0] - T[k][0]);
      cx = T[k][1] + (T[k + 1][1] - T[k][1]) * u;
      cz = T[k][2] + (T[k + 1][2] - T[k][2]) * u;
      r = T[k][3] + (T[k + 1][3] - T[k][3]) * u;
    } else dy = down - T[last][0];
    const dx = L[0] - cx;
    const dz = L[2] - cz;
    const d = Math.hypot(dx, dy, dz);
    const want = r + room;
    if (d >= want || d < 1e-6) return false;
    const k = want / d;
    this.out(this.leg, leg, cx + dx * k, -(down - dy) - dy * k, cz + dz * k, at, o);
    return true;
  }

  /**
   * A hoop is round his thigh, whatever has happened: its middle is never further from his thigh's than it is bigger
   * round than his thigh (all of it is moved back). Its knots alone are put off his thigh one at a time, each out the
   * side it is nearest: a leg thrown a foot in a frame went through them, half out one side and half out the other,
   * and then the hoop was beside his thigh and not round it, held there by its cords, the hem up at his hip.
   */
  private around(leg: number, k: number) {
    const { at } = this;
    const { n } = CLOTH;
    const o = (leg * KNOTS + k * n) * 3;
    let [x, y, z] = [0, 0, 0];
    for (let m = 0; m < n; m++) {
      x += at[o + m * 3] / n;
      y += at[o + m * 3 + 1] / n;
      z += at[o + m * 3 + 2] / n;
    }
    this.local(this.leg, leg, x, y, z);
    const T = this.thigh[leg];
    const last = T.length - 1;
    const down = Math.max(T[0][0], Math.min(T[last][0], -L[1]));
    let i = 0;
    while (i < last - 1 && down > T[i + 1][0]) i++;
    const u = (down - T[i][0]) / (T[i + 1][0] - T[i][0]);
    const dx = L[0] - (T[i][1] + (T[i + 1][1] - T[i][1]) * u);
    const dz = L[2] - (T[i][2] + (T[i + 1][2] - T[i][2]) * u);
    const d = Math.hypot(dx, dz);
    if (d <= this.slack[k]) return;
    const back = (d - this.slack[k]) / d;
    const f = this.leg;
    const b = leg * FRAME;
    const mx = -(f[b + 3] * dx + f[b + 9] * dz) * back;
    const my = -(f[b + 4] * dx + f[b + 10] * dz) * back;
    const mz = -(f[b + 5] * dx + f[b + 11] * dz) * back;
    for (let m = 0; m < n; m++) {
      at[o + m * 3] += mx;
      at[o + m * 3 + 1] += my;
      at[o + m * 3 + 2] += mz;
    }
  }

  /** The knot at `o` put off leg `leg`'s calf. True if it was in it. */
  private shinOff(leg: number, o: number): boolean {
    const { at } = this;
    const f = this.leg;
    const b = leg * FRAME;
    const [ax, ay, az] = [f[b + 12], f[b + 13], f[b + 14]];
    const [ex, ey, ez] = [f[b + 15] - ax, f[b + 16] - ay, f[b + 17] - az];
    const [px, py, pz] = [at[o] - ax, at[o + 1] - ay, at[o + 2] - az];
    const len = ex * ex + ey * ey + ez * ez;
    if (len < 1e-6) return false;
    const t = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / len));
    const [dx, dy, dz] = [px - ex * t, py - ey * t, pz - ez * t];
    const d = Math.hypot(dx, dy, dz);
    const want = this.shin[0] + (this.shin[1] - this.shin[0]) * t + SKIN;
    if (d >= want || d < 1e-6) return false;
    const k = want / d - 1;
    at[o] += dx * k;
    at[o + 1] += dy * k;
    at[o + 2] += dz * k;
    return true;
  }

  /** How hoop `k` of a leg is turned from how it is built, into R (a matrix's rows). False if it has no shape now. */
  private turned(leg: number, k: number): boolean {
    if (!axes(this.at, (leg * KNOTS + k * CLOTH.n) * 3, F)) return false;
    const r0 = (leg * (CLOTH.rows + 1) + k) * 9;
    const A0 = this.rest0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = F[i] * A0[r0 + j] + F[3 + i] * A0[r0 + 3 + j] + F[6 + i] * A0[r0 + 6 + j];
    return true;
  }

  /** Each hoop's turn, for the bones; and how far each leg is bunched up. */
  private read() {
    const { at } = this;
    for (let leg = 0; leg < 2; leg++) {
      for (let k = 1; k <= CLOTH.rows; k++) if (this.turned(leg, k)) this.turn.set(R, (leg * CLOTH.rows + k - 1) * 9);
      let [short, n] = [0, 0];
      const base = leg * KNOTS * 3;
      for (let l = 0; l < this.long.length; l++) {
        if (this.links[l * 3 + 2] !== 0) continue;
        const a = base + this.links[l * 3] * 3;
        const b = base + this.links[l * 3 + 1] * 3;
        short += Math.max(0, 1 - Math.hypot(at[b] - at[a], at[b + 1] - at[a + 1], at[b + 2] - at[a + 2]) / this.long[l]);
        n++;
      }
      this.bunch[leg] = short / n;
    }
  }
}
