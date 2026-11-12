// The cameras that follow the play, and the operator on each (scene.ts aim() asks; no three.js here, so
// the framing can be tested as plain numbers).
//
// Five of them, the user's choice (CourtView's camera chip, `settings.courtCam`):
// - Broadcast: the main camera on its gantry at mid-court, high over the near side. It never moves; it
//   pans, tilts and zooms. In the half court it holds all ten and the basket, the play low in the picture
//   and the stands over it; on a break it goes with the ball and looks ahead of it, wider.
// - Sideline: lower and closer, on a dolly along the near side, on the men round the ball.
// - End zone: high behind the offense's own basket, the play going away from it (the coach's view).
// - Baseline: on the floor behind the baseline of the end being attacked, beside the basket, the play coming at it.
// - Overhead: over the floor, nearly straight down.
//
// Each frames what it is shown (`View`: the ball, the men, the end being attacked): the picture that holds
// them with room round them (`fit`), no tighter and no wider than that camera goes. The operator then
// gets there as a hand does: he eases in and settles (a spring with no bounce in it), widens at once and
// tightens slowly, and is never asked to jump (a man who leaves the play is let go of gradually, not
// dropped). Reduced motion: no pans at all, each half of the floor its own still picture and a cut between.
import { BASKET, COURT_LEN } from '../choreo';

export type CamKind = 'tv' | 'side' | 'end' | 'low' | 'top';
export const CAM_KINDS: readonly CamKind[] = ['tv', 'side', 'end', 'low', 'top'];
/** What the camera chip calls each. */
export const CAM_NAME: Record<CamKind, string> = { tv: 'Broadcast', side: 'Sideline', end: 'End zone', low: 'Baseline', top: 'Overhead' };

/** A stored choice, or the default. */
export function camKind(v: unknown): CamKind {
  return CAM_KINDS.includes(v as CamKind) ? (v as CamKind) : 'tv';
}

/** A picture: where the camera stands, what it looks at (the scene's feet), how wide it sees top to bottom (degrees). */
export interface Shot {
  px: number;
  py: number;
  pz: number;
  lx: number;
  ly: number;
  lz: number;
  fov: number;
}
export const shot = (): Shot => ({ px: 0, py: 30, pz: 80, lx: 0, ly: 0, lz: 0, fov: 30 });

/** What an operator is shown. */
export interface View {
  ball: { x: number; y: number; z: number };
  /** The men on the floor: x, z each. */
  men: ArrayLike<number>;
  n: number;
  /** The end being attacked (the sign of its basket's x), or 0: no play is on. */
  end: -1 | 0 | 1;
  /** The picture's shape (width over height). */
  aspect: number;
  /** 0..1: the ball is at the basket (the picture comes in a little), and clutch time (a little more). */
  near: number;
  tight: number;
}

const MID = COURT_LEN / 2;
const RIM_X = MID - BASKET.y;
/** A man's head (ft), with room over it; the top of a backboard, and its clocks. */
const HEAD = 7.6;
const BOARD_TOP = 14.2;
/** A frame this shape or squarer is a phone held upright: its cameras stand higher and frame tighter. */
export const TALL = 1.5;
/** The near side's seats end here (z), this high with the people in them: past them there is nothing built. */
const NEAR_EDGE = 42.5;
const NEAR_TOP = 8.5;

interface Rig {
  /** How far from the ball (ft) a man still counts in full, and where he no longer counts at all. */
  reach: [number, number];
  /** The same for the basket being attacked. */
  rim: [number, number];
  /** The least and the most of the floor the picture holds across, at what it looks at (ft): wide frames, then tall ones. */
  cover: [number, number];
  coverTall: [number, number];
  /** Room round what it holds: each side, over it and under it (shares of what it holds). */
  pad: [number, number, number];
  /** Where the spare room goes: 0 the play in the middle, 1 all of it over the play (the stands), -1 under it. */
  sky: number;
  /** How much of the spare room across goes to keeping the ball in the middle. */
  ball: number;
  /** How long the look takes to get there (s), and the zoom to tighten (it widens three times as fast). */
  follow: number;
  zoom: number;
}

const RIGS: Record<CamKind, Rig> = {
  tv: { reach: [27, 54], rim: [36, 58], cover: [50, 112], coverTall: [40, 104], pad: [0.07, 0.16, 0.1], sky: 0.45, ball: 0.5, follow: 0.5, zoom: 1.3 },
  side: { reach: [17, 36], rim: [17, 30], cover: [36, 80], coverTall: [29, 70], pad: [0.12, 0.2, 0.2], sky: 0.3, ball: 0.7, follow: 0.42, zoom: 1.1 },
  end: { reach: [60, 110], rim: [80, 120], cover: [56, 70], coverTall: [50, 62], pad: [0.08, 0.14, 0.08], sky: 0.2, ball: 0.3, follow: 0.7, zoom: 1.6 },
  low: { reach: [15, 34], rim: [13, 22], cover: [20, 60], coverTall: [16, 50], pad: [0.16, 0.22, 0.1], sky: 0.4, ball: 0.7, follow: 0.4, zoom: 1.1 },
  top: { reach: [27, 54], rim: [36, 58], cover: [52, 100], coverTall: [42, 96], pad: [0.08, 0.06, 0.06], sky: 0, ball: 0, follow: 0.6, zoom: 1.4 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
const deg = (r: number) => (r * 180) / Math.PI;

/** Where a camera stands: `x` is where the play is along the floor (the dolly and the overhead go with it), `end` the end being attacked. */
export function mount(kind: CamKind, tall: boolean, x: number, end: -1 | 0 | 1, out: Shot): Shot {
  if (kind === 'tv') [out.px, out.py, out.pz] = [0, tall ? 46 : 35, tall ? 80 : 88];
  else if (kind === 'side') [out.px, out.py, out.pz] = [clamp(x * 0.72, -30, 30), tall ? 16 : 13, 50];
  else if (kind === 'end') [out.px, out.py, out.pz] = [-(end || -1) * (MID + 30), tall ? 44 : 36, 0];
  else if (kind === 'low') [out.px, out.py, out.pz] = [(end || -1) * (MID + 7.5), 4.6, 15];
  else [out.px, out.py, out.pz] = [clamp(x, -34, 34), 50, 15];
  return out;
}

/**
 * The points a camera is to hold (x, y, z each, into `pts`; how many numbers): each man's feet and head,
 * the ball and the floor under it, the floor `lead` ft ahead of it, the basket being attacked and the top
 * of its board. A man far from the ball counts for less the farther he is (he is drawn in toward it), so
 * nobody enters or leaves the picture's sums in one frame.
 */
export function gather(kind: CamKind, v: View, lead: number, pts: number[]): number {
  const rig = RIGS[kind];
  const b = v.ball;
  let n = 0;
  const put = (x: number, y: number, z: number) => {
    pts[n++] = x;
    pts[n++] = y;
    pts[n++] = z;
  };
  // (the sideline's and the floor's cameras are on the men round the ball; the others on where it is along the floor)
  const round = kind === 'side' || kind === 'low';
  for (let i = 0; i < v.n; i++) {
    const dx = v.men[i * 2] - b.x;
    const dz = v.men[i * 2 + 1] - b.z;
    const far = round ? Math.hypot(dx, dz) : Math.abs(dx);
    const w = 1 - smooth(clamp((far - rig.reach[0]) / (rig.reach[1] - rig.reach[0]), 0, 1));
    put(b.x + dx * w, 0, b.z + dz * w);
    put(b.x + dx * w, HEAD, b.z + dz * w);
  }
  // (the ball has room either side of it along the floor: it is never at the picture's edge when it sets off)
  const room = round ? 4 : 7;
  put(b.x - room, 0, b.z);
  put(b.x + room, 0, b.z);
  // (a shot's flight is the high cameras' to follow: from the floor it would be a picture of the roof)
  put(b.x, Math.min(b.y, kind === 'low' ? 11 : 19) + 0.8, b.z);
  if (lead) put(clamp(b.x + lead, -MID, MID), 3, b.z);
  if (v.end) {
    const rx = v.end * RIM_X;
    const far = round ? Math.hypot(rx - b.x, b.z) : Math.abs(rx - b.x);
    const w = 1 - smooth(clamp((far - rig.rim[0]) / (rig.rim[1] - rig.rim[0]), 0, 1));
    put(b.x + (rx - b.x) * w, 3 + (BOARD_TOP - 3) * w, b.z * (1 - w));
    // (and the baseline under it: the picture ends past the basket, not on it)
    put(b.x + (v.end * (MID + 1.5) - b.x) * w, 3 - 3 * w, b.z * (1 - w));
  }
  return n;
}

/**
 * The picture from (px, py, pz) that holds the `n` numbers of `pts` with the rig's room round them, no
 * tighter and no wider than it goes. `bx`, `bz`: where the ball is on the floor (the spare room across
 * goes to it).
 */
export function fit(
  kind: CamKind,
  px: number,
  py: number,
  pz: number,
  pts: ArrayLike<number>,
  n: number,
  aspect: number,
  bx: number,
  bz: number,
  squeeze: number,
  out: Shot,
): Shot {
  const rig = RIGS[kind];
  const tall = aspect < TALL;
  // (the overhead is over the middle of what it holds: it never turns, so its picture never rolls)
  if (kind === 'top') {
    let [a, b] = [Infinity, -Infinity];
    for (let i = 0; i < n; i += 3) [a, b] = [Math.min(a, pts[i]), Math.max(b, pts[i])];
    px = (a + b) / 2;
  }
  // (toward their middle to start with)
  let [fx, fy, fz] = [0, 0, 0];
  for (let i = 0; i < n; i += 3) [fx, fy, fz] = [fx + pts[i] - px, fy + pts[i + 1] - py, fz + pts[i + 2] - pz];
  let [x0, x1, y0, y1, depth] = [0, 0, 0, 0, 1];
  let [rx, rz, ux, uy, uz] = [1, 0, 0, 1, 0];
  let tx = 0;
  const turn = (cx: number, cy: number) => {
    fx += rx * cx + ux * cy;
    fy += uy * cy;
    fz += rz * cx + uz * cy;
  };
  const measure = () => {
    const fl = Math.hypot(fx, fy, fz) || 1;
    [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
    // (level, whatever it looks at: right is along the floor; straight down, the picture's top is the far side)
    const flat = Math.hypot(fx, fz);
    [rx, rz] = flat > 1e-3 ? [-fz / flat, fx / flat] : [1, 0];
    [ux, uy, uz] = [-rz * fy, rz * fx - rx * fz, rx * fy];
    [x0, x1, y0, y1, depth] = [Infinity, -Infinity, Infinity, -Infinity, 0];
    for (let i = 0; i < n; i += 3) {
      const [dx, dy, dz] = [pts[i] - px, pts[i + 1] - py, pts[i + 2] - pz];
      const d = Math.max(2, dx * fx + dy * fy + dz * fz);
      const [x, y] = [(dx * rx + dz * rz) / d, (dx * ux + dy * uy + dz * uz) / d];
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
      depth += d;
    }
    depth /= Math.max(1, n / 3);
    const [bdx, bdy, bdz] = [bx - px, 3 - py, bz - pz];
    const bd = Math.max(2, bdx * fx + bdy * fy + bdz * fz);
    tx = (bdx * rx + bdz * rz) / bd;
    const high = y1 - y0;
    y1 += high * rig.pad[1];
    y0 -= high * rig.pad[2];
  };
  for (let i = 0; i < 3; i++) {
    measure();
    turn((x0 + x1) / 2, (y0 + y1) / 2);
  }
  measure();
  const [lo, hi] = tall ? rig.coverTall : rig.cover;
  const halfX = ((x1 - x0) / 2) * (1 + rig.pad[0] * 2);
  const halfY = (y1 - y0) / 2;
  // (how much of the floor it holds across, where it looks: between the rig's least, less a little at the basket and late, and its most)
  const least = (lo * (1 - 0.1 * squeeze)) / 2 / depth / aspect;
  const most = hi / 2 / depth / aspect;
  const tanV = clamp(Math.max(halfY, halfX / aspect), least, Math.max(least, most));
  // the spare room: across, toward the ball; up and down, over the play or under it
  const spareX = Math.max(0, tanV * aspect - halfX);
  const spareY = Math.max(0, tanV - halfY);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  turn(cx + clamp((tx - cx) * rig.ball, -spareX, spareX), cy + spareY * rig.sky);
  measure();
  // (never under the near side's seats, where nothing is built: the picture's foot stays on them)
  let fov = 2 * Math.atan(tanV);
  if (pz > NEAR_EDGE + 4 && py > NEAR_TOP) {
    const deepest = Math.atan2(py - NEAR_TOP, pz - NEAR_EDGE);
    const pitch = Math.asin(clamp(fy, -1, 1));
    const under = -deepest - (pitch - fov / 2);
    if (under > 0) {
      // (it looks up by what it is under; and if the play's top is then out of it, it goes wider, upward)
      const flat = Math.hypot(fx, fz) || 1;
      const p2 = pitch + under;
      [fx, fy, fz] = [(fx / flat) * Math.cos(p2), Math.sin(p2), (fz / flat) * Math.cos(p2)];
      measure();
      const over = y1 - Math.tan(fov / 2);
      if (over > 0) {
        const p3 = p2 + Math.atan(over) / 2;
        fov += Math.atan(over);
        [fx, fy, fz] = [(fx / flat) * Math.cos(p3), Math.sin(p3), (fz / flat) * Math.cos(p3)];
        const fl = Math.hypot(fx, fy, fz);
        [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
      }
    }
  }
  // what it looks at: the floor under the middle of the picture (waist high), or as far off as the play is
  const reach = fy < -0.12 ? (py - 3) / -fy : depth;
  out.px = px;
  out.py = py;
  out.pz = pz;
  out.lx = px + fx * reach;
  out.ly = py + fy * reach;
  out.lz = pz + fz * reach;
  out.fov = deg(fov);
  return out;
}

/** Where a point is in a picture: -1..1 across and up it (inside it between them), and how far in front (ft). */
export function seen(s: Shot, aspect: number, x: number, y: number, z: number): { x: number; y: number; d: number } {
  let [fx, fy, fz] = [s.lx - s.px, s.ly - s.py, s.lz - s.pz];
  const fl = Math.hypot(fx, fy, fz) || 1;
  [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
  const flat = Math.hypot(fx, fz);
  const [rx, rz] = flat > 1e-3 ? [-fz / flat, fx / flat] : [1, 0];
  const [ux, uy, uz] = [-rz * fy, rz * fx - rx * fz, rx * fy];
  const [dx, dy, dz] = [x - s.px, y - s.py, z - s.pz];
  const d = dx * fx + dy * fy + dz * fz;
  const t = Math.tan((s.fov * Math.PI) / 360);
  return { x: (dx * rx + dz * rz) / Math.max(1e-6, d) / (t * aspect), y: (dx * ux + dy * uy + dz * uz) / Math.max(1e-6, d) / t, d };
}

/** The basket's post and its padded arm, behind each baseline: how far past the baseline it starts and ends (ft), and how wide it is taken to be. */
const POST = [0.5, 8];
const POST_R = 2.3;
/** A close-up's camera is asked to stand this near the floor's edges at most (ft past the baselines; z from, to). */
const SEAT_X = MID + 8.5;
const SEAT_Z = [-9, 33];

/**
 * How much of a man at (x, z) a body at (ox, oz) hides from a camera at (cx, cz): 0 none, more the more
 * of him and the nearer the lens it stands (a body there takes the picture).
 */
function hides(x: number, z: number, cx: number, cz: number, ox: number, oz: number): number {
  const far2 = (cx - x) * (cx - x) + (cz - z) * (cz - z);
  const t = ((ox - x) * (cx - x) + (oz - z) * (cz - z)) / (far2 || 1);
  if (t < 0.05 || t > 1) return 0;
  // (the picture is about his height across where he stands, and a point at the lens)
  const off = Math.hypot(ox - x - (cx - x) * t, oz - z - (cz - z) * t);
  return off < 1.2 + 2.2 * (1 - t) ? 1 + 2 * t : 0;
}

/**
 * Where a close-up's camera stands for a man at (x, z) facing `yaw`, `off` ft from him: in front of his
 * face if it can, with nobody of `others` (x, z each, `n` of them) and no basket's post between, and the
 * stands behind him rather than the near side's dark. Into `out` (x, z); what the place costs (under 3: nobody in the way).
 */
export function clearSeat(x: number, z: number, yaw: number, others: ArrayLike<number>, n: number, off: number, out: { x: number; z: number }): number {
  let best = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    const cx = clamp(x + Math.sin(a) * off, -SEAT_X, SEAT_X);
    const cz = clamp(z + Math.cos(a) * off, SEAT_Z[0], SEAT_Z[1]);
    const far = Math.hypot(cx - x, cz - z);
    // (his face, not the back of his head; and not from so near that he fills the lens)
    let cost = 0.6 * (1 - Math.cos(Math.atan2(cx - x, cz - z) - yaw)) + (far < off * 0.6 ? 4 : 0);
    // (it looks away from the near side: three rows of seats and the dark over them)
    if (cz < z) cost += (z - cz) / (far || 1);
    for (let i = 0; i < n; i++) cost += 3 * hides(x, z, cx, cz, others[i * 2], others[i * 2 + 1]);
    for (const e of [-1, 1]) for (let px = MID + POST[0]; px <= MID + POST[1]; px += 2.5) if (hides(x, z, cx, cz, e * px, 0) || Math.hypot(cx - e * px, cz) < POST_R) cost += 6;
    if (cost < best) {
      best = cost;
      out.x = cx;
      out.z = cz;
    }
  }
  return best;
}

/** A man at (x, z) seen from (cx, cz): one of `others` stands in the way. */
export function blocked(x: number, z: number, cx: number, cz: number, others: ArrayLike<number>, n: number): boolean {
  for (let i = 0; i < n; i++) if (hides(x, z, cx, cz, others[i * 2], others[i * 2 + 1])) return true;
  return false;
}

/** A value on its way somewhere: a spring with no bounce in it (it eases off and eases in), there in about `T` seconds. */
interface Eased {
  x: number;
  v: number;
}
function ease(e: Eased, to: number, T: number, sec: number) {
  const w = 2 / T;
  const x = w * sec;
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const off = e.x - to;
  const t = (e.v + w * off) * sec;
  e.v = (e.v - w * t) * k;
  e.x = to + (off + t) * k;
}

/** A still picture of one half of the floor (`half`: the sign of its x), for reduced motion: its corners, heads at them, its basket. */
function halfPts(half: -1 | 1, pts: number[]): number {
  let n = 0;
  for (const x of [half * 3, half * (MID + 1.5)])
    for (const z of [-25.5, 25.5])
      for (const y of [0, HEAD]) {
        pts[n++] = x;
        pts[n++] = y;
        pts[n++] = z;
      }
  pts[n++] = half * RIM_X;
  pts[n++] = BOARD_TOP;
  pts[n++] = 0;
  return n;
}

/** The ball goes this fast along the floor (ft a second) on a break: the operator looks this far ahead of it for each, and at most (ft). */
const LEAD = 0.42;
const LEAD_MOST = 13;
/** A look this far (ft) from the last is not followed: the picture cuts. */
const JUMP = 70;
/** Reduced motion: the ball is this far into the other half (ft) before the picture cuts to it. */
const CALM_OVER = 5;

/** The operator on the camera the user chose: he is shown the play each frame and says where the camera is. */
export class Operator {
  private kind: CamKind = 'tv';
  private readonly lx: Eased = { x: 0, v: 0 };
  private readonly ly: Eased = { x: 0, v: 0 };
  private readonly lz: Eased = { x: 0, v: 0 };
  private readonly px: Eased = { x: 0, v: 0 };
  private readonly fov: Eased = { x: 30, v: 0 };
  private on = false;
  private still = false;
  private end: -1 | 0 | 1 = 0;
  private half: -1 | 1 = -1;
  private ballX = 0;
  private vx = 0;
  private readonly pts: number[] = [];
  private readonly want = shot();

  /** The next picture is his first: he is there, not on his way (the picture has been somewhere else). */
  reset() {
    this.on = this.still = false;
  }

  /**
   * One frame, `real` ms after the last: the picture, into `out`. True when it cut (a new camera, the play
   * somewhere else altogether, the floor's camera changing ends, a new still with reduced motion).
   */
  aim(kind: CamKind, v: View, real: number, calm: boolean, out: Shot): boolean {
    const rig = RIGS[kind];
    const sec = real / 1000;
    const tall = v.aspect < TALL;
    const b = v.ball;
    let cut = !(calm ? this.still : this.on) || kind !== this.kind;
    this.kind = kind;
    // (the floor's camera is at the end being attacked, the end zone's at the other, and they stay where they were while nothing is)
    const end = v.end || this.end || (b.x < 0 ? -1 : 1);
    if ((kind === 'low' || kind === 'end') && end !== this.end && this.end) cut = true;
    this.end = end;
    if (calm) {
      // one half of the floor, still; the other when the ball is well into it
      const half = cut ? (b.x < 0 ? -1 : 1) : this.half * b.x < -CALM_OVER ? (-this.half as -1 | 1) : this.half;
      if (half !== this.half) cut = true;
      this.half = half;
      const w = mount(kind, tall, half * 24, end, this.want);
      fit(kind, w.px, w.py, w.pz, this.pts, halfPts(half, this.pts), v.aspect, half * 24, 0, 0, out);
      this.on = false;
      this.still = true;
      return cut;
    }
    // how fast the ball is going along the floor, eased (a pass is over before he has heard of it; a break is not)
    const vx = sec > 0 && !cut ? clamp((b.x - this.ballX) / sec, -70, 70) : 0;
    this.ballX = b.x;
    this.vx = cut ? 0 : this.vx + (vx - this.vx) * (1 - Math.exp(-real / 320));
    const lead = clamp(this.vx * LEAD, -LEAD_MOST, LEAD_MOST);
    const w = mount(kind, tall, b.x + lead, end, this.want);
    if (cut) this.px.x = w.px;
    else if (sec > 0) ease(this.px, w.px, 0.9, sec);
    this.px.v = cut ? 0 : this.px.v;
    const n = gather(kind, v, Math.abs(lead) > 1.5 ? lead : 0, this.pts);
    fit(kind, this.px.x, w.py, w.pz, this.pts, n, v.aspect, b.x, b.z, clamp(v.near + v.tight * 0.8, 0, 1.6) - 3 * clamp((Math.abs(this.vx) - 8) / 22, 0, 1), w);
    if (!cut && Math.hypot(w.lx - this.lx.x, w.lz - this.lz.x) > JUMP) cut = true;
    if (cut) {
      [this.lx.x, this.ly.x, this.lz.x, this.fov.x] = [w.lx, w.ly, w.lz, w.fov];
      this.lx.v = this.ly.v = this.lz.v = this.fov.v = 0;
    } else if (sec > 0) {
      // (quicker after a ball on its way than round one being held)
      const T = rig.follow * (1 - 0.45 * clamp(Math.abs(this.vx) / 30, 0, 1));
      ease(this.lx, w.lx, T, sec);
      ease(this.ly, w.ly, T, sec);
      ease(this.lz, w.lz, T, sec);
      ease(this.fov, w.fov, w.fov > this.fov.x ? rig.zoom / 3 : rig.zoom, sec);
    }
    this.on = true;
    this.still = false;
    out.px = kind === 'top' ? this.lx.x : this.px.x;
    out.py = w.py;
    out.pz = w.pz;
    out.lx = this.lx.x;
    out.ly = this.ly.x;
    out.lz = this.lz.x;
    out.fov = this.fov.x;
    return cut;
  }
}
