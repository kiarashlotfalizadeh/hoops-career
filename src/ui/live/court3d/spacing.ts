// Where the bodies and a pass go so that nothing is drawn through anything else: men whose paths
// cross step round each other, and a pass with a man in its lane goes over him or round him. No three.js
// here (plain numbers, the scene's x and z), and nothing about the game is decided.

/** Two bodies' middles are never drawn closer than this (ft): men whose paths cross go round each other. */
export const BODY_GAP = 2.3;
/** Each is sent at least this far (ft) to his own side of the crossing. */
const BIAS = 0.7;
/** A step round another man is taken at this speed at most, ft a second: never in one frame. */
const SLIDE = 12;
/** Eased, a step aside can lag two men closing fast. They are never drawn nearer than this (ft), whatever the easing says: the bodies don't meet. */
const BODY_MIN = 2.0;
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

/**
 * Pushes the spots in `at` (x, z each) apart, in place: no two closer than BODY_GAP. `go` is how far
 * this move takes each (x, z): two who pass each other are pushed square to the way they pass, each
 * to his own side, so neither is thrown across the other as he goes through.
 */
export function apart(at: Float32Array, go: Float32Array, n: number) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = at[j * 2] - at[i * 2];
        const dz = at[j * 2 + 1] - at[i * 2 + 1];
        const d = Math.hypot(dx, dz);
        if (d >= BODY_GAP) continue;
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
        const push = (BODY_GAP - d) / 2;
        at[i * 2] -= (px / pl) * push;
        at[i * 2 + 1] -= (pz / pl) * push;
        at[j * 2] += (px / pl) * push;
        at[j * 2 + 1] += (pz / pl) * push;
      }
    }
  }
}

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
   */
  place(at: Float32Array, go: Float32Array, pids: readonly number[], own: number, ease = own, cut = false): Float32Array {
    const n = pids.length;
    const plan = this.plan;
    plan.set(at.subarray(0, n * 2));
    apart(at, go, n);
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
    // what the easing left of two bodies meeting is taken up along the line between them: a short step back, never a change of side
    const eased = this.eased;
    eased.set(at.subarray(0, n * 2));
    if (own > 0)
      for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            let dx = at[j * 2] - at[i * 2];
            let dz = at[j * 2 + 1] - at[i * 2 + 1];
            let d = Math.hypot(dx, dz);
            if (d >= BODY_MIN) continue;
            if (d < 1e-3) [dx, dz, d] = [0, 1, 1];
            const push = (BODY_MIN - Math.hypot(at[j * 2] - at[i * 2], at[j * 2 + 1] - at[i * 2 + 1])) / 2;
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

/** How a pass gets past the men in its way: an arc over (ft), and a swerve round one man near each end at most. */
export interface PassPath {
  lob: number;
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
  const path: PassPath = { lob: 0, round: [] };
  const far = Math.hypot(to.x - from.x, to.z - from.z);
  if (far <= 4) return path;
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
  return path;
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
