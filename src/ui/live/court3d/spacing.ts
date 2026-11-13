// Where the bodies and a pass go so that nothing is drawn through anything else: men whose paths
// cross step round each other, and a pass with a man in its lane goes over him or round him. No three.js
// here (plain numbers, the scene's x and z), and nothing about the game is decided.

/** Two bodies' middles are never drawn closer than this (ft): men whose paths cross go round each other. */
export const BODY_GAP = 2.7;
/** Each is sent at least this far (ft) to his own side of the crossing. */
const BIAS = 0.7;
/** A step round another man is taken at this speed at most, ft a second: never in one frame. */
const SLIDE = 12;
/** Eased, a step aside can lag two men closing fast. They are never drawn nearer than this (ft), whatever the easing says: the bodies don't meet. */
const BODY_MIN = 2.3;
/** And that last step is taken at this speed at most, ft a second. */
const SHOVE = 21;
/** A plan spot this far (ft) from the last frame's is a new start whoever says so: his step aside starts again there. */
const CUT = 14;
/** A pass that would go through a defender goes over him: this high (ft) where it passes him, and no arc taller than LOB_MAX. */
const CLEAR_H = 8.3;
const LOB_MAX = 4.5;
/** He is in a pass's way when it comes this near his middle (ft). */
const LANE = 1.1;
/** A pass that can't go over a man goes round him, this far (ft) from his middle. */
const ROUND = 1.3;
/** A man by either end of it (this much of its way) is given more room: the hands it leaves and the hands it goes to are still moving. */
const END_ZONE = 0.3;
const END_LANE = 1.9;
/** How many points along a pass are looked at for who it meets. */
const LOOKS = 24;
/** A pass this long (ft) past a defender in the middle of its lane may be a bounce pass under his hands (about this share of them) instead of a lob over. */
const BOUNCE_FAR: [number, number] = [8, 26];
const BOUNCE_SHARE = 0.5;
/** It hits the floor this far past him (of its way), never sooner or later than these. */
const BOUNCE_PAST = 0.12;
const BOUNCE_AT: [number, number] = [0.45, 0.75];

/**
 * Pushes the spots in `at` (x, z each) apart, in place: no two closer than BODY_GAP (`gap`: two who are to
 * meet may be nearer). `go` is how far this move takes each (x, z): two who pass each other are pushed
 * square to the way they pass, each to his own side, so neither is thrown across the other as he goes through.
 */
export function apart(at: Float32Array, go: Float32Array, n: number, gap: (i: number, j: number) => number = () => BODY_GAP) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = at[j * 2] - at[i * 2];
        const dz = at[j * 2 + 1] - at[i * 2 + 1];
        const d = Math.hypot(dx, dz);
        const want = gap(i, j);
        if (d >= want) continue;
        // square to the way they pass each other (two standing still: across the floor)
        let nx = -(go[j * 2 + 1] - go[i * 2 + 1]);
        let nz = go[j * 2] - go[i * 2];
        const nl = Math.hypot(nx, nz);
        if (nl < 0.5) [nx, nz] = [0, 1];
        else [nx, nz] = [nx / nl, nz / nl];
        // how far to that side he already is, and the rest of the gap (along the way they pass)
        let c = dx * nx + dz * nz;
        const ax = dx - c * nx;
        const az = dz - c * nz;
        // (never less than BIAS to one side: with the two all but level the push would have no direction, and spin)
        c += BIAS;
        if (Math.abs(c) < BIAS) c = c < 0 ? -BIAS : BIAS;
        const px = ax + c * nx;
        const pz = az + c * nz;
        const pl = Math.hypot(px, pz);
        const push = (want - d) / 2;
        at[i * 2] -= (px / pl) * push;
        at[i * 2 + 1] -= (pz / pl) * push;
        at[j * 2] += (px / pl) * push;
        at[j * 2 + 1] += (pz / pl) * push;
      }
    }
  }
}

/**
 * Two men who meet body to body through this move (a screen and the man it is set on, a box-out and the man held
 * off): `i`, `j` index the spots; `w` how far into it (0: as the plan has them, 1: touching); `near` how far apart
 * their middles are when they touch (ft); `share` how much of the coming together is `j`'s (the man screened runs
 * into the screener, who stands his ground).
 */
export interface Meet {
  i: number;
  j: number;
  w: number;
  near: number;
  share: number;
}

/** How far a man's trunk reaches (ft) toward a way across the floor (`ux`, `uz`, a unit): out to his sides `wide`, to his front and back `deep`, turned by his heading `yaw` (NaN: as far every way). */
export function reach(ux: number, uz: number, wide: number, deep: number, yaw: number): number {
  if (!Number.isFinite(yaw)) return wide;
  const f = ux * Math.sin(yaw) + uz * Math.cos(yaw);
  return Math.sqrt(wide * wide * (1 - f * f) + deep * deep * f * f);
}

/** Two men side by side keep this much (ft) between their shoulders' reach. */
const SKIN = 0.08;
/** Two who meet are drawn this far (ft) toward each other at most: a man left farther off by the play goes round. */
const MEET_MOST = 3;

/** The men kept apart from frame to frame: each one's step aside is eased, so a push that changes its mind never throws him. */
export class Spacing {
  private readonly off = new Map<number, [number, number]>();
  private readonly was = new Map<number, [number, number]>();
  private readonly plan = new Float32Array(40);
  private readonly eased = new Float32Array(40);

  /**
   * `at`: where the plan has each of `pids` (x, z each), overwritten with where he is drawn.
   * `own`: the bodies' time since the last frame, ms (none: everyone stays as he was). `ease`: the time
   * the steps aside are taken on (near the clock's, so they are little bigger a frame when the game is played fast).
   * `cut`: the men have been put on fresh spots (a highlight, a skip), so every step aside starts again.
   * `meets`: the men who come body to body this move (see Meet): drawn together, and kept from going through each
   * other no further than touching. `build`: each man's trunk as `reach` measures it (wide, deep, heading: three a
   * man), so two big men side by side are kept as far apart as their shoulders need.
   */
  place(at: Float32Array, go: Float32Array, pids: readonly number[], own: number, ease = own, cut = false, meets: readonly Meet[] = [], build?: Float32Array): Float32Array {
    const n = pids.length;
    const plan = this.plan;
    // (two who meet are drawn to each other: the man the move is on takes his share of the way, the other the rest)
    for (const m of meets) {
      const dx = at[m.j * 2] - at[m.i * 2];
      const dz = at[m.j * 2 + 1] - at[m.i * 2 + 1];
      const d = Math.hypot(dx, dz);
      if (d < 1e-3 || m.w <= 0) continue;
      const pull = Math.min(d - m.near, MEET_MOST) * m.w;
      at[m.j * 2] -= (dx / d) * pull * m.share;
      at[m.j * 2 + 1] -= (dz / d) * pull * m.share;
      at[m.i * 2] += (dx / d) * pull * (1 - m.share);
      at[m.i * 2 + 1] += (dz / d) * pull * (1 - m.share);
    }
    const met = (i: number, j: number) => meets.find((m) => (m.i === i && m.j === j) || (m.i === j && m.j === i));
    plan.set(at.subarray(0, n * 2));
    apart(at, go, n, (i, j) => {
      const m = met(i, j);
      return m ? BODY_GAP + (Math.min(BODY_GAP, m.near) - BODY_GAP) * m.w : BODY_GAP;
    });
    const most = (SLIDE * ease) / 1000;
    for (let j = 0; j < n; j++) {
      const wx = at[j * 2] - plan[j * 2];
      const wz = at[j * 2 + 1] - plan[j * 2 + 1];
      let o = this.off.get(pids[j]);
      const was = this.was.get(pids[j]);
      // (a man new to the floor, or to this end of it, is put where he goes)
      if (!o) this.off.set(pids[j], (o = [wx, wz]));
      else if (cut || (was && Math.hypot(plan[j * 2] - was[0], plan[j * 2 + 1] - was[1]) > CUT)) [o[0], o[1]] = [wx, wz];
      if (was) [was[0], was[1]] = [plan[j * 2], plan[j * 2 + 1]];
      else this.was.set(pids[j], [plan[j * 2], plan[j * 2 + 1]]);
      const far = Math.hypot(wx - o[0], wz - o[1]);
      if (far <= most) [o[0], o[1]] = [wx, wz];
      else {
        o[0] += ((wx - o[0]) / far) * most;
        o[1] += ((wz - o[1]) / far) * most;
      }
      at[j * 2] = plan[j * 2] + o[0];
      at[j * 2 + 1] = plan[j * 2 + 1] + o[1];
    }
    // what the easing left of two bodies meeting is taken up along the line between them: a short step back, never
    // a change of side. As far apart as their trunks reach toward each other (BODY_MIN at least); two who meet, touching
    const least = (i: number, j: number, ux: number, uz: number) => {
      let gap = BODY_MIN;
      if (build) gap = Math.max(gap, reach(ux, uz, build[i * 3], build[i * 3 + 1], build[i * 3 + 2]) + reach(ux, uz, build[j * 3], build[j * 3 + 1], build[j * 3 + 2]) + SKIN);
      const m = met(i, j);
      return m ? gap + (Math.min(gap, m.near) - gap) * m.w : gap;
    };
    const eased = this.eased;
    eased.set(at.subarray(0, n * 2));
    if (own > 0)
      for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            let dx = at[j * 2] - at[i * 2];
            let dz = at[j * 2 + 1] - at[i * 2 + 1];
            let d = Math.hypot(dx, dz);
            if (d >= BODY_MIN * 1.3) continue;
            if (d < 1e-3) [dx, dz, d] = [0, 1, 1];
            const want = least(i, j, dx / d, dz / d);
            if (d >= want) continue;
            const push = (want - d) / 2;
            at[i * 2] -= (dx / d) * push;
            at[i * 2 + 1] -= (dz / d) * push;
            at[j * 2] += (dx / d) * push;
            at[j * 2 + 1] += (dz / d) * push;
          }
    // (on fresh spots there is no last frame to step from: they are put apart)
    const shove = cut ? Infinity : (SHOVE * ease) / 1000;
    for (let j = 0; j < n; j++) {
      const far = Math.hypot(at[j * 2] - eased[j * 2], at[j * 2 + 1] - eased[j * 2 + 1]);
      if (far > shove) {
        at[j * 2] = eased[j * 2] + ((at[j * 2] - eased[j * 2]) / far) * shove;
        at[j * 2 + 1] = eased[j * 2 + 1] + ((at[j * 2 + 1] - eased[j * 2 + 1]) / far) * shove;
      }
      const o = this.off.get(pids[j])!;
      o[0] = at[j * 2] - plan[j * 2];
      o[1] = at[j * 2 + 1] - plan[j * 2 + 1];
    }
    if (this.off.size > n)
      for (const pid of [...this.off.keys()])
        if (!pids.includes(pid)) {
          this.off.delete(pid);
          this.was.delete(pid);
        }
    return at;
  }
}

interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A man a pass might meet: where he is, how far the rest of this move takes him, his height against the 6 ft 6 puppet. */
export interface Man {
  x: number;
  z: number;
  gx: number;
  gz: number;
  s: number;
  /** One of the passer's own side: he isn't reaching for it, so it never goes over him, only round. */
  mate: boolean;
}

/** A swerve round one man: how far to the side (x, z) where the pass goes by him, and where along the pass that is (0..1). */
export interface Round {
  x: number;
  z: number;
  at: number;
}

/** How a pass gets past the men in its way: an arc over (ft), or a bounce off the floor (where along it, 0: none), and a swerve round one man near each end at most. */
export interface PassPath {
  lob: number;
  bounce: number;
  round: Round[];
}

/**
 * The way through for a pass from `from` to `to` (`gx`, `gz`: how far the catcher still has to go). It is
 * followed to where each man will be when it gets to him. A defender well down its line is cleared by an
 * arc; a man it can't go over (a teammate, one too near either end, one too tall for LOB_MAX) by a swerve
 * to the side of him it was already passing on: the widest one needed in each half of its way (the man on
 * the passer, the man on the catcher). Nobody in the way, or a short pass: flat and straight.
 */
export function passPath(from: P3, to: P3, gx: number, gz: number, men: Iterable<Man>): PassPath {
  const path: PassPath = { lob: 0, bounce: 0, round: [] };
  const far = Math.hypot(to.x - from.x, to.z - from.z);
  if (far <= 4) return path;
  // (a bounce pass or a lob is the passer's own choice: the same pass from the same spot is always the same one)
  const bounces = far >= BOUNCE_FAR[0] && far <= BOUNCE_FAR[1] && Math.abs(Math.sin(from.x * 12.9898 + from.z * 78.233) * 43758.5453) % 1 < BOUNCE_SHARE;
  const wide = [0, 0];
  const best: (Round | null)[] = [null, null];
  for (const m of men) {
    // the nearest it comes to him, both moving
    let near = Infinity;
    let t = 0;
    let ox = 0;
    let oz = 0;
    for (let k = 1; k < LOOKS; k++) {
      const u = k / LOOKS;
      const dx = from.x + (to.x + gx * u - from.x) * u - (m.x + m.gx * u);
      const dz = from.z + (to.z + gz * u - from.z) * u - (m.z + m.gz * u);
      const d = Math.hypot(dx, dz);
      if (d < near) [near, t, ox, oz] = [d, u, dx, dz];
    }
    const ends = !m.mate && (t < END_ZONE || t > 1 - END_ZONE);
    if (near > (ends ? END_LANE : LANE)) continue;
    if (!m.mate && t >= 0.15 && t <= 0.85) {
      // (under his hands off the floor, just past him)
      if (bounces && t >= 0.25 && t <= 0.65) {
        path.bounce = Math.max(path.bounce, Math.max(BOUNCE_AT[0], Math.min(BOUNCE_AT[1], t + BOUNCE_PAST)));
        continue;
      }
      const need = (CLEAR_H * m.s - (from.y + (to.y - from.y) * t)) / (4 * t * (1 - t));
      if (need <= LOB_MAX) {
        path.lob = Math.max(path.lob, need);
        continue;
      }
    }
    const half = t < 0.5 ? 0 : 1;
    const round = (ends ? END_LANE : ROUND) * Math.sqrt(m.s) - near;
    if (round <= wide[half]) continue;
    wide[half] = round;
    // (dead on him: to the side square to the pass)
    if (near < 0.05) [ox, oz, near] = [-(to.z - from.z), to.x - from.x, far];
    best[half] = { x: (ox / near) * round, z: (oz / near) * round, at: Math.max(0.08, Math.min(0.92, t)) };
  }
  for (const r of best) if (r) path.round.push(r);
  // (a bounce pass goes under any lob it would have needed)
  if (path.bounce) path.lob = 0;
  return path;
}

/** A pass's height at `u` of its way (0..1) that bounces at `at`: down to the floor, off it, and up into his hands. */
export function bounced(fromY: number, toY: number, floor: number, at: number, u: number): number {
  if (u < at) {
    const v = u / at;
    return fromY + (floor - fromY) * Math.pow(v, 1.25);
  }
  const v = (u - at) / (1 - at);
  return floor + (toY - floor) * (1 - Math.pow(1 - v, 1.7));
}

/**
 * A pass's swerve at `u` of its way (0..1), into `out` (x, z): none at either end, all of each man's where
 * it goes by him, eased out to him and back in from him. So a pass round the man on the passer leaves the
 * hands wide of him and straightens on its way to the catcher, and one round the catcher's man curls in.
 */
export function swerve(path: PassPath, u: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = out.z = 0;
  const v = Math.max(0, Math.min(1, u));
  for (const r of path.round) {
    const w = Math.sin((Math.PI / 2) * (v < r.at ? v / r.at : (1 - v) / (1 - r.at)));
    out.x += r.x * w;
    out.z += r.z * w;
  }
  return out;
}

/**
 * A body as round shapes a ball or another body can't go through, each a joint to a joint (the puppet's J, both
 * the same for a ball: his head) and how thick about that line (ft, on the 6 ft 6 puppet; his trunk and his limbs
 * wider by the root of his bulk). A little inside the skin (figure.py's sections), so what is counted as inside a
 * man is inside him, not grazing him.
 */
export const SHAPES: readonly (readonly [number, number, number, boolean])[] = [
  // (joints from puppet.ts's J: hips 0, chest 1, head 2, sl 3, el 4, hl 5, sr 6, er 7, hr 8, jl 9, kl 10, fl 11, jr 12, kr 13, fr 14)
  // [from, to, thick, a limb]
  [0, 1, 0.36, false],
  [3, 6, 0.3, false],
  [9, 12, 0.24, false],
  [2, 2, 0.36, false],
  [3, 4, 0.17, true],
  [4, 5, 0.13, true],
  [6, 7, 0.17, true],
  [7, 8, 0.13, true],
  [9, 10, 0.22, true],
  [10, 11, 0.15, true],
  [12, 13, 0.22, true],
  [13, 14, 0.15, true],
];

/** The nearest two points of two segments come within this (ft): the closest distance between them. */
function between(j: ArrayLike<number>, a: number, b: number, k: ArrayLike<number>, c: number, d: number): number {
  const px = j[a * 3];
  const py = j[a * 3 + 1];
  const pz = j[a * 3 + 2];
  const ux = j[b * 3] - px;
  const uy = j[b * 3 + 1] - py;
  const uz = j[b * 3 + 2] - pz;
  const qx = k[c * 3];
  const qy = k[c * 3 + 1];
  const qz = k[c * 3 + 2];
  const vx = k[d * 3] - qx;
  const vy = k[d * 3 + 1] - qy;
  const vz = k[d * 3 + 2] - qz;
  const wx = px - qx;
  const wy = py - qy;
  const wz = pz - qz;
  const aa = ux * ux + uy * uy + uz * uz;
  const bb = ux * vx + uy * vy + uz * vz;
  const cc = vx * vx + vy * vy + vz * vz;
  const dd = ux * wx + uy * wy + uz * wz;
  const ee = vx * wx + vy * wy + vz * wz;
  const den = aa * cc - bb * bb;
  let s = aa > 1e-9 && den > 1e-9 ? Math.max(0, Math.min(1, (bb * ee - cc * dd) / den)) : 0;
  let t = cc > 1e-9 ? (bb * s + ee) / cc : 0;
  if (t < 0 || t > 1) {
    t = Math.max(0, Math.min(1, t));
    s = aa > 1e-9 ? Math.max(0, Math.min(1, (bb * t - dd) / aa)) : 0;
  }
  return Math.hypot(wx + ux * s - vx * t, wy + uy * s - vy * t, wz + uz * s - vz * t);
}

/**
 * How far apart two bodies are (ft, the nearest any two of their SHAPES come; under 0: inside each other by
 * that much). `a`, `b`: each one's joints in the scene (15 × 3, as the puppet's `j` once put in the scene), his
 * size (`s`) and bulk. `limbs` false: only trunks and heads are measured (an arm across a man is a hand on him).
 */
export function clearance(a: ArrayLike<number>, sa: number, ba: number, b: ArrayLike<number>, sb: number, bb: number, limbs = true): number {
  // (two men whose middles are far apart can't be touching)
  const far = Math.hypot(a[0] - b[0], a[2] - b[2]) - 4.5 * Math.max(sa, sb);
  if (far > 0) return far;
  let near = Infinity;
  for (const [p, q, r, limb] of SHAPES) {
    if (limb && !limbs) continue;
    const ra = r * sa * (limb && p !== 9 && p !== 12 ? 1 : Math.sqrt(ba));
    for (const [u, v, w, limb2] of SHAPES) {
      if (limb2 && !limbs) continue;
      const rb = w * sb * (limb2 && u !== 9 && u !== 12 ? 1 : Math.sqrt(bb));
      near = Math.min(near, between(a, p, q, b, u, v) - ra - rb);
    }
  }
  return near;
}

/** How far two bodies are inside each other (ft, 0 if they aren't): see `clearance`. */
export const sunk = (a: ArrayLike<number>, sa: number, ba: number, b: ArrayLike<number>, sb: number, bb: number, limbs = true): number =>
  Math.max(0, -clearance(a, sa, ba, b, sb, bb, limbs));

/** How far a ball (its middle, ft) is inside a body (see `sunk`): `arms` false leaves his arms out (it is in his hands). */
export function ballIn(ball: P3, j: ArrayLike<number>, s: number, bulk: number, r: number, arms = true): number {
  const at = [ball.x, ball.y, ball.z];
  let deep = 0;
  for (const [p, q, w, limb] of SHAPES) {
    if (!arms && limb && p < 9) continue;
    const rr = w * s * (limb && p !== 9 && p !== 12 ? 1 : Math.sqrt(bulk));
    deep = Math.max(deep, rr + r - between(j, p, q, at, 0, 0));
  }
  return deep;
}

/**
 * A ball in the air is never drawn inside a body: if it is nearer than `r` (ft) to the line of his trunk
 * (`a` to `b`), it is moved out to `r`, the way it already is from him. `soft`: it starts to give way that
 * far (ft) before it gets to him, a little at first, so it bends round him and never jumps. Says whether it moved.
 */
export function clearOf(ball: P3, a: P3, b: P3, r: number, soft = 0): boolean {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((ball.x - a.x) * ux + (ball.y - a.y) * uy + (ball.z - a.z) * uz) / (ux * ux + uy * uy + uz * uz || 1)));
  const dx = ball.x - (a.x + ux * t);
  const dy = ball.y - (a.y + uy * t);
  const dz = ball.z - (a.z + uz * t);
  const far = Math.hypot(dx, dy, dz);
  if (far >= r + soft) return false;
  const want = soft > 0 ? r + (far / (r + soft)) * soft : r;
  // (out along the floor: a ball pushed up or down a man's chest would climb him)
  const flat = Math.hypot(dx, dz);
  const reach = Math.sqrt(Math.max(0, want * want - dy * dy));
  if (flat < 1e-3) ball.x += reach;
  else {
    ball.x += (dx / flat) * (reach - flat);
    ball.z += (dz / flat) * (reach - flat);
  }
  return true;
}
