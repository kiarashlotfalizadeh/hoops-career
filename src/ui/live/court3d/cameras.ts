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
//
// And where a close camera (a cut-in, a replay's) may stand: where nobody is in front of its man (`blocked`,
// `clearSeat`) and no part of a basket's unit, its arm, its board's frame and pads, its shot clock (`fenced`).
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
/**
 * And the main camera goes this much higher and nearer the floor (ft up, ft in) by the time the frame is this much
 * squarer than TALL (a phone's upright court is about square): looking down more steeply, the floor and the men on it
 * fill a tall picture, not the stands over them.
 */
const TALL_UP = [10, 18];
const TALL_SPAN = 0.6;
/** And its spare room up and down goes this way (as a rig's `sky`): a little under the play, onto the near floor, not over it into the stands. */
const TALL_SKY = -0.2;
/**
 * A picture taller than it is wide (none on the page, which is never narrower than square) holds the men nearer the
 * ball, and its least across is less: this much less by the time it is half as wide as it is tall.
 */
const THIN = 0.3;
/**
 * The floor's camera stands this far along the floor from the middle (ft: in the photographers' row, sideline.ts, between
 * two of them), this high (over their heads, the board over it and the play in one picture), this far off the middle across.
 */
const LOW = [MID + 7.5, 6, 14.3];
/** A backboard's half width (ft): the picture holds its top corners. */
const BOARD_HALF = 3;
/**
 * But a tall picture from there holds the board only this high (ft: its rim, and a little over it), by the time it is
 * TALL_SPAN squarer than TALL: the whole board right over the lens, with the men across it, is a picture of the roof.
 */
const LOW_TALL = 11;
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
  side: { reach: [17, 36], rim: [23, 34], cover: [36, 80], coverTall: [29, 70], pad: [0.12, 0.2, 0.2], sky: 0.3, ball: 0.7, follow: 0.42, zoom: 1.1 },
  end: { reach: [60, 110], rim: [80, 120], cover: [56, 70], coverTall: [50, 62], pad: [0.08, 0.14, 0.08], sky: 0.2, ball: 0.3, follow: 0.7, zoom: 1.6 },
  low: { reach: [15, 34], rim: [24, 38], cover: [20, 60], coverTall: [16, 50], pad: [0.16, 0.22, 0.1], sky: 0.4, ball: 0.7, follow: 0.4, zoom: 1.1 },
  top: { reach: [27, 54], rim: [36, 58], cover: [52, 100], coverTall: [42, 96], pad: [0.08, 0.06, 0.06], sky: 0, ball: 0, follow: 0.6, zoom: 1.4 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Where a camera stands: `x` is where the play is along the floor (the dolly and the overhead go with it), `end` the
 * end being attacked; `aspect`, the picture's shape.
 */
export function mount(kind: CamKind, aspect: number, x: number, end: -1 | 0 | 1, out: Shot): Shot {
  const tall = aspect < TALL;
  // (the main camera stands on the broadcast's platform in the near stands, bowl.ts DECK_ROWS: over the heads in front of
  // it; for a tall picture higher and nearer, the taller the more (TALL_UP), so the floor fills it rather than the stands)
  const up = smooth(clamp((TALL - aspect) / TALL_SPAN, 0, 1));
  if (kind === 'tv') [out.px, out.py, out.pz] = [0, tall ? 46 + TALL_UP[0] * up : 36, tall ? 80 - TALL_UP[1] * up : 81];
  else if (kind === 'side') [out.px, out.py, out.pz] = [clamp(x * 0.72, -30, 30), tall ? 16 : 13, 50];
  else if (kind === 'end') [out.px, out.py, out.pz] = [-(end || -1) * (MID + 30), tall ? 44 : 36, 0];
  else if (kind === 'low') [out.px, out.py, out.pz] = [(end || -1) * LOW[0], LOW[1], LOW[2]];
  else [out.px, out.py, out.pz] = [clamp(x, -34, 34), 50, 15];
  return out;
}

/**
 * The points a camera is to hold (x, y, z each, into `pts`; how many numbers): each man's feet and head,
 * the ball and the floor under it, the floor `lead` ft ahead of it, the basket being attacked and the top
 * corners of its board. A man far from the ball counts for less the farther he is (he is drawn in toward it), so
 * nobody enters or leaves the picture's sums in one frame.
 */
export function gather(kind: CamKind, v: View, lead: number, pts: number[]): number {
  const rig = RIGS[kind];
  // (a picture taller than it is wide holds the men nearer the ball, THIN)
  const thin = 1 - THIN * clamp((1 - v.aspect) / 0.5, 0, 1);
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
    const w = 1 - smooth(clamp((far - rig.reach[0] * thin) / ((rig.reach[1] - rig.reach[0]) * thin), 0, 1));
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
    // (the floor's camera, under the board, in a tall picture: only up to the rim, not the board over it, LOW_TALL)
    const top = kind === 'low' ? BOARD_TOP + (LOW_TALL - BOARD_TOP) * smooth(clamp((TALL - v.aspect) / TALL_SPAN, 0, 1)) : BOARD_TOP;
    put(b.x + (rx - b.x) * w, 3 + (top - 3) * w, b.z * (1 - w) - BOARD_HALF * w);
    put(b.x + (rx - b.x) * w, 3 + (top - 3) * w, b.z * (1 - w) + BOARD_HALF * w);
    // (and the baseline under it: the picture ends past the basket, not on it; the floor's camera is past it already, and
    // the floor at its feet would turn it down onto the photographers by it)
    if (kind !== 'low') put(b.x + (v.end * (MID + 1.5) - b.x) * w, 3 - 3 * w, b.z * (1 - w));
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
  const thin = 1 - THIN * clamp((1 - aspect) / 0.5, 0, 1);
  const halfX = ((x1 - x0) / 2) * (1 + rig.pad[0] * 2);
  const halfY = (y1 - y0) / 2;
  // (how much of the floor it holds across, where it looks: between the rig's least, less a little at the basket and late, and its most)
  const least = (lo * thin * (1 - 0.1 * squeeze)) / 2 / depth / aspect;
  const most = hi / 2 / depth / aspect;
  // (the most only ever lets go of men out to the sides: what it holds up and down, the ball's flight, a head, is never cut)
  const tanV = Math.max(least, halfY, Math.min(halfX / aspect, Math.max(least, most)));
  // the spare room: across, toward the ball; up and down, over the play or under it
  const spareX = Math.max(0, tanV * aspect - halfX);
  const spareY = Math.max(0, tanV - halfY);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // (the floor's camera keeps the play in the middle of a tall one: under it is the floor at its feet and the
  // photographers by it, over it the roof)
  turn(cx + clamp((tx - cx) * rig.ball, -spareX, spareX), cy + spareY * (!tall ? rig.sky : kind === 'low' ? 0 : TALL_SKY));
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
export const SEAT_X = MID + 8.5;
export const SEAT_Z = [-9, 33];
/**
 * A close-up's picture as `clearSeat` judges it: looking this high on him (ft), this much of him over and under that
 * (ft), this shape; a seat costs this much more for all of it a basket's unit or a man by the lens (`clutter`).
 */
const SEAT_LOOK = [4.8, 3.4, 1.6];
const SEAT_MESS = 6;

/**
 * The basket's unit as something that hides what is behind it (scripts/blender/arena.py hoop(), a little
 * fuller), in feet behind its rim along the floor (b), up (y) and across (z, the same either side): boxes
 * [b0, b1, y0, y1, z0, z1] for the base on the floor, the board's mount, the board's frame and pads round its
 * glass (the glass itself is seen through), the plate under the rim and the shot clock over the board; each a
 * few inches fuller than it is, so a line that grazes it counts.
 */
const UNIT: readonly (readonly number[])[] = [
  [8.3, 14.5, 0, 3.7, 0, 2.05],
  [1.15, 2.35, 9.5, 11.6, 0, 0.75],
  [1.05, 1.8, 9.15, 9.95, 0, 3.3],
  [1.05, 1.8, 12.55, 13.25, 0, 3.3],
  [1.05, 1.8, 9.95, 12.55, 2.55, 3.3],
  [1.0, 1.5, 9.45, 10.2, 0, 0.5],
  [1.2, 2.05, 12.8, 15.15, 0, 1.3],
];
/** The arm from the base up to the board: from here (b, y), this far along it (ft) this way (b, y), this thick each side of its line (ft, its pad under it), this wide. */
const ARM = { b: 10.75, y: 2.14, long: 11.7, db: -0.7497, dy: 0.6638, t: [-0.45, 1.4], z: 0.8 };
/** And the steel braces from it to the board's corners: each from (b, y, z) to (b, y, z), this thick (ft). */
const BRACES: readonly (readonly number[])[] = [
  [6.72, 7.25, 0.32, 1.43, 12.82, 1.9],
  [4.78, 8.23, 0.44, 1.43, 10.9, 2.82],
];
const BRACE_R = 0.3;

/** How far apart two lines are at their nearest: (a0..a1) and (c0..c1), x, y, z each. */
function apart(a: readonly number[], c: readonly number[]): number {
  const u = [a[3] - a[0], a[4] - a[1], a[5] - a[2]];
  const v = [c[3] - c[0], c[4] - c[1], c[5] - c[2]];
  const w = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const [uu, uv, vv, uw, vw] = [dot(u, u), dot(u, v), dot(v, v), dot(u, w), dot(v, w)];
  const den = uu * vv - uv * uv;
  let s = den > 1e-9 ? clamp((uv * vw - vv * uw) / den, 0, 1) : 0;
  const t = clamp((uv * s + vw) / (vv || 1), 0, 1);
  s = clamp((uv * t - uw) / (uu || 1), 0, 1);
  return Math.hypot(w[0] + u[0] * s - v[0] * t, w[1] + u[1] * s - v[1] * t, w[2] + u[2] * s - v[2] * t);
}

/** The line (p0..p1, three numbers each, in some box's own frame) crosses the box (lo, hi: three numbers each). */
function through(p0: readonly number[], p1: readonly number[], lo: readonly number[], hi: readonly number[]): boolean {
  let [a, b] = [0, 1];
  for (let i = 0; i < 3; i++) {
    const d = p1[i] - p0[i];
    if (Math.abs(d) < 1e-9) {
      if (p0[i] < lo[i] || p0[i] > hi[i]) return false;
      continue;
    }
    let [t0, t1] = [(lo[i] - p0[i]) / d, (hi[i] - p0[i]) / d];
    if (t0 > t1) [t0, t1] = [t1, t0];
    [a, b] = [Math.max(a, t0), Math.min(b, t1)];
    if (a > b) return false;
  }
  return true;
}

/**
 * The basket's unit at either end stands between a camera at (cx, cy, cz) and a point (px, py, pz): its base,
 * its arm, its board's frame, pads and braces, its shot clock (UNIT). The glass is seen through.
 */
export function fenced(cx: number, cy: number, cz: number, px: number, py: number, pz: number): boolean {
  for (const e of [-1, 1]) {
    // (in the unit's own frame: behind its rim, up, across)
    const [b0, b1] = [e * cx - RIM_X, e * px - RIM_X];
    if (b0 < 0 && b1 < 0) continue;
    const p0 = [b0, cy, cz];
    const p1 = [b1, py, pz];
    for (const k of UNIT)
      for (const s of [-1, 1]) {
        const [z0, z1] = s < 0 ? [-k[5], -k[4]] : [k[4], k[5]];
        if (through(p0, p1, [k[0], k[2], z0], [k[1], k[3], z1])) return true;
      }
    // (the arm, in its own frame: along it, out from its line, across)
    const arm = (b: number, y: number, z: number) => [(b - ARM.b) * ARM.db + (y - ARM.y) * ARM.dy, (b - ARM.b) * ARM.dy - (y - ARM.y) * ARM.db, z];
    if (through(arm(b0, cy, cz), arm(b1, py, pz), [0, ARM.t[0], -ARM.z], [ARM.long, ARM.t[1], ARM.z])) return true;
    for (const k of BRACES) for (const s of [-1, 1]) if (apart([b0, cy, cz, b1, py, pz], [k[0], k[1], s * k[2], k[3], k[4], s * k[5]]) < BRACE_R) return true;
  }
  return false;
}

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
 * stands behind him rather than the near side's dark. Standing `high` ft up, it must see `see` (x, y, z each,
 * `m` numbers: his head and his hands, the rim) with no part of a basket's unit in front of them (`fenced`).
 * Into `out` (x, z); what the place costs (under 3: nobody and nothing in the way).
 */
export function clearSeat(
  x: number,
  z: number,
  yaw: number,
  others: ArrayLike<number>,
  n: number,
  off: number,
  out: { x: number; z: number },
  high = 0,
  see: ArrayLike<number> = [],
  m = 0,
): number {
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
    for (let i = 0; i < m; i += 3)
      if (fenced(cx, high, cz, see[i], see[i + 1], see[i + 2])) {
        cost += 6;
        break;
      }
    // (and a picture of him that is not mostly a basket's unit or a man by the lens: his waist to over his head, across a wide frame)
    const fore = Math.max(6, Math.min(far * 0.8, far - 4));
    cost += SEAT_MESS * clutter(cx, high, cz, x, Math.max(high, SEAT_LOOK[0]), z, SEAT_LOOK[1] / far, SEAT_LOOK[2], far + 25, others, n, fore);
    if (cost < best) {
      best = cost;
      out.x = cx;
      out.z = cz;
    }
  }
  return best;
}

/** The rays across a picture `clutter` tries (across, up): a coarse grid, enough to tell a share of a tenth from a third. */
const RAYS = [8, 5];
/** A man near a lens, as `clutter` has him: a post this high (ft) and this thick each side of his middle. */
const BODY = [6.8, 1.1];
// (clutter's working numbers: a ray as a line, x, y, z at each end; a man as one)
const RAY = [0, 0, 0, 0, 0, 0];
const MAN = [0, 0, 0, 0, BODY[0], 0];

/**
 * How much of a picture the basket's units and the men near its lens take (0..1): the picture from (cx, cy, cz)
 * looking at (lx, ly, lz), `tan` the tangent of half of it top to bottom, `aspect` its shape. A ray of a coarse
 * grid across it counts when a unit stands on it within `far` ft (`fenced`: its base, its arm, its board's frame
 * and pads, its shot clock), or one of `men` (x, z each, `n` of them) nearer the lens than `fore` ft does: a
 * picture that is mostly padded steel or a man's back is a poor one, whatever it holds.
 */
export function clutter(
  cx: number,
  cy: number,
  cz: number,
  lx: number,
  ly: number,
  lz: number,
  tan: number,
  aspect: number,
  far: number,
  men: ArrayLike<number> = [],
  n = 0,
  fore = 0,
): number {
  let [fx, fy, fz] = [lx - cx, ly - cy, lz - cz];
  const fl = Math.hypot(fx, fy, fz) || 1;
  [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
  // (level, as three's lookAt has it: right is along the floor)
  const flat = Math.hypot(fx, fz) || 1e-6;
  const [rx, rz] = [-fz / flat, fx / flat];
  const [ux, uy, uz] = [-rz * fy, rz * fx - rx * fz, rx * fy];
  let hit = 0;
  [RAY[0], RAY[1], RAY[2]] = [cx, cy, cz];
  for (let j = 0; j < RAYS[1]; j++)
    for (let i = 0; i < RAYS[0]; i++) {
      const a = (((i + 0.5) / RAYS[0]) * 2 - 1) * tan * aspect;
      const b = (((j + 0.5) / RAYS[1]) * 2 - 1) * tan;
      let [dx, dy, dz] = [fx + rx * a + ux * b, fy + uy * b, fz + rz * a + uz * b];
      const dl = Math.hypot(dx, dy, dz);
      [dx, dy, dz] = [dx / dl, dy / dl, dz / dl];
      if (fenced(cx, cy, cz, cx + dx * far, cy + dy * far, cz + dz * far)) {
        hit++;
        continue;
      }
      [RAY[3], RAY[4], RAY[5]] = [cx + dx * fore, cy + dy * fore, cz + dz * fore];
      for (let k = 0; k < n; k++) {
        [MAN[0], MAN[2], MAN[3], MAN[5]] = [men[k * 2], men[k * 2 + 1], men[k * 2], men[k * 2 + 1]];
        if (apart(RAY, MAN) < BODY[1]) {
          hit++;
          break;
        }
      }
    }
  return hit / (RAYS[0] * RAYS[1]);
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
/**
 * The picture's shape changed by more than this share (the device turned, the window was resized): he is there at
 * once, not on his way (the frame is laid out again, it is not a pan; eased, the men would be off the new picture's
 * sides for a second, and a game paused at the time would keep that picture).
 */
const RESHAPE = 0.02;

/**
 * The floor's camera keeps its picture's side this far (a share of the half picture across) clear of a basket's arm,
 * and the ball no farther out than this toward it (it has room to go on into), the rim and its board's corners this.
 */
const ARM_CLEAR = 0.04;
const KEEP_IN = [0.5, 0.72];
/** And turns at most this far (radians) to do it. */
const ARM_TURN = 0.6;
// (the arm and its base as points, x, y, z each, and where they are in the picture: see clearArm)
const ARM_PTS: number[] = [];

/**
 * The floor's camera stands beside a basket's post: the play out on the floor (a ball brought up, men spread
 * wide) is a wide picture with the padded arm and base up its side. The picture turns away from them (`s`, in
 * place) as far as the ball, and the rim while the ball is near it, can go and stay inside it: what is behind the
 * arm is not seen anyway, and the picture is the play's, not the steel's.
 */
function clearArm(s: Shot, aspect: number, b: { x: number; y: number; z: number }, end: -1 | 1) {
  let n = 0;
  for (let i = 0; i <= 4; i++) {
    const t = (ARM.long * i) / 4;
    ARM_PTS[n++] = end * (RIM_X + ARM.b + ARM.db * t);
    ARM_PTS[n++] = ARM.y + ARM.dy * t;
    ARM_PTS[n++] = 0;
  }
  for (const k of [UNIT[0][0], UNIT[0][1]]) [ARM_PTS[n++], ARM_PTS[n++], ARM_PTS[n++]] = [end * (RIM_X + k), UNIT[0][3], 0];
  // (which side of the picture the unit is on, and the nearest of it to the middle; and the farthest toward it of the
  // ball and, with the ball near it, the rim and its board's top corners, which stay in)
  const [fx, fz] = [s.lx - s.px, s.lz - s.pz];
  const T = TURNED;
  Object.assign(T, s);
  const rim = Math.hypot(end * RIM_X - b.x, b.z) < RIGS.low.rim[0] + 8;
  const at = (yaw: number, side: number) => {
    T.lx = s.px + fx * Math.cos(yaw) - fz * Math.sin(yaw);
    T.lz = s.pz + fx * Math.sin(yaw) + fz * Math.cos(yaw);
    let [near, keep] = [Infinity, -Infinity];
    for (let i = 0; i < n; i += 3) {
      const p = seen(T, aspect, ARM_PTS[i], ARM_PTS[i + 1], ARM_PTS[i + 2]);
      if (p.d > 0 && Math.abs(p.y) < 1.2 && Math.abs(p.x) < Math.abs(near)) near = p.x;
    }
    const k = (x: number, y: number, z: number, most: number) => {
      const p = seen(T, aspect, x, y, z);
      if (p.d > 0) keep = Math.max(keep, side * p.x - most);
    };
    k(b.x, b.y, b.z, KEEP_IN[0]);
    k(b.x, 0, b.z, KEEP_IN[0]);
    if (rim) for (const z of [-BOARD_HALF, 0, BOARD_HALF]) k(end * (RIM_X + 1.25), z ? BOARD_TOP - 0.7 : 10, z, KEEP_IN[1]);
    return [near, keep];
  };
  const [near] = at(0, 1);
  if (!Number.isFinite(near) || Math.abs(near) >= 1 + ARM_CLEAR) return;
  const side = Math.sign(near);
  // (the way to turn that moves the unit out of the picture's side)
  const way = Math.abs(at(0.01, side)[0]) > Math.abs(near) ? 1 : -1;
  // the least turn that clears it, and no more than keeps the ball (and the rim) in: halving the step each time
  let [lo, hi] = [0, ARM_TURN];
  if (at(way * hi, side)[1] <= 0 && side * at(way * hi, side)[0] < 1 + ARM_CLEAR) lo = hi;
  else
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const [x, keep] = at(way * mid, side);
      if (keep <= 0 && side * x < 1 + ARM_CLEAR) lo = mid;
      else hi = mid;
    }
  if (lo <= 0) return;
  if (at(way * lo, side)[1] > 0) return;
  [s.lx, s.lz] = [T.lx, T.lz];
}
const TURNED = shot();

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
  private aspect = 0;
  private readonly pts: number[] = [];
  private readonly want = shot();

  /** The next picture is his first: he is there, not on his way (the picture has been somewhere else). */
  reset() {
    this.on = this.still = false;
  }

  /**
   * One frame, `real` ms after the last: the picture, into `out`. True when it cut (a new camera, the play
   * somewhere else altogether, the floor's camera changing ends, a new still with reduced motion, a new shape: RESHAPE).
   */
  aim(kind: CamKind, v: View, real: number, calm: boolean, out: Shot): boolean {
    const rig = RIGS[kind];
    const sec = real / 1000;
    const b = v.ball;
    let cut = !(calm ? this.still : this.on) || kind !== this.kind || Math.abs(v.aspect / (this.aspect || v.aspect) - 1) > RESHAPE;
    this.kind = kind;
    this.aspect = v.aspect;
    // (the floor's camera is at the end being attacked, the end zone's at the other, and they stay where they were while nothing is)
    const end = v.end || this.end || (b.x < 0 ? -1 : 1);
    if ((kind === 'low' || kind === 'end') && end !== this.end && this.end) cut = true;
    this.end = end;
    if (calm) {
      // one half of the floor, still; the other when the ball is well into it
      const half = cut ? (b.x < 0 ? -1 : 1) : this.half * b.x < -CALM_OVER ? (-this.half as -1 | 1) : this.half;
      if (half !== this.half) cut = true;
      this.half = half;
      const w = mount(kind, v.aspect, half * 24, end, this.want);
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
    const w = mount(kind, v.aspect, b.x + lead, end, this.want);
    if (cut) this.px.x = w.px;
    else if (sec > 0) ease(this.px, w.px, 0.9, sec);
    this.px.v = cut ? 0 : this.px.v;
    const n = gather(kind, v, Math.abs(lead) > 1.5 ? lead : 0, this.pts);
    fit(kind, this.px.x, w.py, w.pz, this.pts, n, v.aspect, b.x, b.z, clamp(v.near + v.tight * 0.8, 0, 1.6) - 3 * clamp((Math.abs(this.vx) - 8) / 22, 0, 1), w);
    if (kind === 'low') clearArm(w, v.aspect, b, end);
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
