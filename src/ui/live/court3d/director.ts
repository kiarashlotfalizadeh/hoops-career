// The broadcast's director: what the picture does besides following the ball (scene.ts aim() asks it).
//
// An instant replay of a big play (a dunk, a three, an and-one, a block, a shot at the buzzer) at the
// next dead ball: the play's last couple of seconds again, slowed round its moment, from another camera,
// a wipe in and out and a bug in the corner; the biggest of them (a shot at the buzzer, and at 1x a dunk)
// a second time, slower and tight on the man. It is drawn from the possession's own script, posed at a
// time of its own (`pose`), through the same scene, so the figures act it out again and are put back on
// their spots when it ends. The game waits for it: the court has finished the possession and is told so
// only once the replay is over (CourtView holds its onDone), so nothing live is missed and nothing in the
// game changes. Never with reduced motion, at 4x, in key plays or a highlight, or while the game is
// stopped (CourtView and Court3D say when it may).
//
// Whatever the camera, a replay never misses its outcome: the man with the ball (a block's shooter and
// blocker), the ball's whole flight and the basket from a little before the release, the ball at and
// through the rim after it, an and-one's contact. Each frame those points are held inside the picture,
// clear of the lower third and the Replay bug (`hold`): the camera's own look turns and widens only as
// much as that takes, up to the widest that camera goes; a camera whose seat could not hold them at the
// moment, or would see the man past the basket's unit (its arm, its board's frame: cameras.ts `fenced`),
// is passed over up front for the next. A shot from range is seen tight from behind and beside the shooter
// (over his shoulder), the man, the flight and the rim in a line; at the rim, his face; a dunk's close
// camera goes by where he took off. A dunk's slowest moment is its slam.
//
// And the picture settles, as an operator's does: it works out how wide to be from what it must show a
// little ahead (the flight drawn in early, the man where he is going) and never starts much tighter than the
// widest the replay will need, so it opens out little; it opens out and comes in at a steady, eased pace, not
// at once; it puts the highest thing it must show near the top of the picture, so the man doesn't sink
// under empty air; and once the ball is there it lets the flight go and settles on him and the basket. A pass
// on its way to him is for the look to come to, eased, not something the picture is held to. Only what the
// easing still leaves out is held at the picture's edge at once.
//
// The cut-aways that are not on a man on the floor (scene.ts says when): a bench and its coach, the crowd,
// the building before the tip.
//
// And the operator's hand on the other cameras: a main camera that is never quite still, a close-up held
// on the shoulder, a bump when the rim takes a dunk.
import type { PerspectiveCamera, Vector3 } from 'three';
import { BASKET, COURT_LEN, toWorld, type Pt, type Script } from '../choreo';
import { HALF_W, pose, SIDE, type Stage } from '../Court';
import { planShot, shotAt, type Shot } from './ballistics';
import { blocked, clearSeat, clutter, fenced, SEAT_X, SEAT_Z, TALL } from './cameras';
import { DUNK_AT } from './clips';
import type { V3 } from './puppet';

const MID = COURT_LEN / 2;
const RIM_H = 10;

/** At most one replay in this long (ms of the game being watched; half as long again above 1x), and none of a play older than this. */
export const REPLAY_GAP = 25000;
const STALE_MS = 14000;
/**
 * Before it, the picture stays on the live floor this long at least (ms) once the possession is over,
 * and while a cut-in has the scorer, this long at most: his moment first, then the replay.
 */
const LEAD_MS = 450;
const LEAD_MAX = 1700;
/** The wipe across the picture (ms): it covers all of it at its middle, where the picture cuts. */
export const WIPE_MS = 640;
/** Out of the replay, the picture waits under the wipe this long at most (ms) for the court's next possession. */
const HANDOVER_MS = 300;
/**
 * How much of the play it shows: from this long before its moment (and no longer) to this long after, in the
 * script's ms. A dunk's moment is the slam, early in its move: it is seen from a little less far back, and to
 * the end of the move (the hang and the drop) as a shot's is.
 */
const BACK = 950;
const BACK_DUNK = 700;
const BACK_MOST = 1500;
const AFTER = 280;
/** A shot at the buzzer is seen to the end of what the court lingers on. */
const AFTER_BUZZER = 700;
/**
 * Slow motion: the play at this share of its 1x pace round its moment and this much away from it, eased
 * over this far before it and this far after (script ms): a ramp down into the moment and a quicker one
 * out of it, as a broadcast's replay machine runs it.
 */
const SLOW = 0.3;
const FAST = 0.85;
const RAMP = 420;
const RAMP_OUT = 240;
/** A replay plays for this long at most (ms): a longer stretch of play runs a little faster. */
const REEL_MOST = 4800;
/**
 * The second look at the biggest plays: the moment's own move, slower still, this long at most (ms),
 * through a quick wipe of its own (ms).
 */
const SLOW_2 = 0.2;
const REEL_2_MOST = 2600;
export const SWAP_MS = 420;
/** The benches (arena.ts): along the far side from this far off the middle to this far, the coach at the near end of his; and how far off the far sideline. */
const BENCH_X = [20, 37.5];
const BENCH_Z = -(HALF_W + SIDE + 2.5);

/** The tight camera stands this far off its man at the rim (ft). */
const TIGHT_OFF = 23;
/** The building's shot before the tip lasts this long (ms). */
export const INTRO_MS = 3400;
/**
 * The near side's replay camera stands this far along the floor from the man (ft), toward the basket: the ball's whole
 * flight across the picture. A picture squarer than TALL has no room across for that (the man at one edge, the rim at
 * the other, and the floor and the stands filling the rest): by the time it is this much squarer the camera stands
 * this far behind him instead (ft, away from the basket), the man, the flight and the rim nearer a line, the flight up it.
 */
const SIDE_OFF = [18, -26];
const SIDE_SPAN = 0.9;
/** And this high (ft), the wide frame's and the tallest's: from higher the floor's depth goes up a tall picture, the men spread up it. */
const SIDE_Y = [11.5, 17];
/** Out across the floor to here (z); a man this much nearer it than that (ft) is too near its lens, at one edge of its picture and the rim at the other. */
const SIDE_Z = 31;
const SIDE_NEAR = 13;

/** What makes a play worth seeing again, and which is kept when a possession has two. */
export type BigKind = 'winner' | 'buzzer' | 'and1' | 'dunk' | 'three' | 'block';
const RANK: Record<BigKind, number> = { winner: 6, buzzer: 5, and1: 4.5, dunk: 4, three: 2, block: 1 };
/** How the lower third names it (plain words). */
export const BIG_WORD: Record<BigKind, string> = { winner: 'Game winner', buzzer: 'Buzzer beater', and1: 'And one', dunk: 'Dunk', three: 'Three', block: 'Block' };
/**
 * Which camera sees it again (taken in turn): low behind the basket, low on the near side off to one
 * side of the man (the ball's whole flight across the picture), or tight on him. Each stands nearer
 * the camera's side than what it looks at: behind the near sideline there are three rows of seats
 * and the dark over them, so nothing looks that way.
 */
type ReelCam = 'base' | 'side' | 'tight' | 'rim' | 'floor' | 'slash';
const CAMS: Record<BigKind, ReelCam[]> = {
  winner: ['side', 'slash'],
  buzzer: ['side', 'slash'],
  and1: ['base', 'slash', 'tight', 'rim'],
  dunk: ['base', 'rim', 'slash', 'floor'],
  three: ['side', 'tight', 'slash'],
  block: ['base', 'slash', 'rim'],
};
/** The cameras at the basket: they only see a play at it (this near its rim, ft). */
const AT_RIM: ReadonlySet<ReelCam> = new Set(['base', 'rim', 'floor']);
const RIM_NEAR = 16;
/** The widest each camera goes (degrees top to bottom, in a wide frame): any wider and it is not that camera's shot, so another is taken. */
const WIDEST: Record<ReelCam, number> = { base: 50, side: 46, tight: 44, rim: 54, floor: 62, slash: 32 };
/**
 * What a replay's picture keeps clear of: the lower third (bottom left) and the Replay bug (top left) as
 * court3d.css sizes them (px across and up, with a little room), and this much of each edge (a share of
 * the half picture across, and up and down).
 */
const THIRD_PX = [280, 70];
const BUG_PX = [112, 44];
const EDGE = [0.9, 0.88];
/** A point by the lower third's or the bug's edge is let off it gradually, over this much of the half picture: nothing jumps as it crosses. */
const BAND = 0.25;
/** The look the camera eases toward keeps this much more room inside the safe area (of the half picture), and off the lower third and the bug all the way across, so the easing seldom leaves anything out. */
const ROOM = 0.14;
/** The picture opens out for the flight and the basket this long before the ball leaves his hand (the script's ms); for a dunk this much sooner, so the rim is all in it from his take-off. */
const FLIGHT_LEAD = 400;
const TAKE_OFF = 300;
/** Where along its flight the ball is held in the picture ahead of it (shares of the shot's move: the arc's top is near the middle); after the moment the flight is let go of over this long (the script's ms). */
const ARC_AT = [0.2, 0.4, 0.6, 0.8];
const ARC_GO = 300;
/** Where a seat is tried on the run-up, from the replay's start to the release (shares of it): a man can cross the floor in it. */
const LEAD_AT = [0, 0.35, 0.7];
/** Room over a man's head (ft): his hands and the ball go up there; and half his shoulders' width, with a little room. */
const HEAD_ROOM = 0.8;
const BODY_HALF = 1.3;
/** After a shot's moment the ball counts until it is out of the net (this low, ft), and is let go of over this much more of its drop: on the floor it says nothing. */
const BALL_DONE = 6;
const BALL_GO = 3;
/** A blocked ball counts until it is this far from the blocker (ft), and is let go of over this much farther. */
const SWAT_DONE = 8;
const SWAT_GO = 6;
/**
 * Tight on a man shooting from farther out than this (ft): over his shoulder, behind and to one side of
 * him, this far off (ft, the nearer first), this high, and this far round from straight behind (radians),
 * looking past him at the rim: a longer lens from farther back and a little over his head, so the man, the
 * flight and the rim are in a line and the picture is no wider than this (degrees top to bottom, in a wide
 * frame; a play it can't hold so, or a seat the floor's edges keep from being behind him, as in the corner,
 * is another camera's). A seat more than this far round from behind him (radians) is not behind him.
 */
const SHOULDER_FROM = 11;
const SHOULDER_OFF = [21, 27];
const SHOULDER_Y = 8.8;
const SHOULDER_TURN = [14, 26, 40, 56].map((d) => (d * Math.PI) / 180);
const SHOULDER_WIDEST = 30;
const SHOULDER_ROUND = (50 * Math.PI) / 180;
/** A seat this near (ft) where he is on his way to the shot costs more the nearer. */
const RUN_BY = 12;
/**
 * A seat whose picture is more than this much the basket's unit or a man by the lens (cameras.ts `clutter`) is
 * not that camera's: the next is taken. Short of it, a seat costs this much more for all of its picture so taken
 * (against 1 for needing to go as wide as the camera goes): of two that hold the play, the cleaner picture.
 */
const MESS_MOST = 0.2;
const MESS_COST = 4;
/** A man is by the lens when he is nearer it than this share of the way to the man the replay is on, and this much (ft) nearer; or this near it whatever. */
const FORE = [0.8, 4, 6];
/**
 * Where else the fixed cameras may stand, from their own seat (ft; `seatFor` takes the cleanest picture of them):
 * behind the basket, farther along the baseline and farther back; over the board, higher and off to the near side
 * (not out over the floor: over a man running under it, the picture would whip round); under it, along the baseline
 * either way.
 */
const BASE_TRY = { z: [0, 5, 10], x: [0, 2.5] };
const RIM_TRY = { y: [0, 2.5], z: [0, 3] };
const FLOOR_TRY = { z: [0, 3, -3], x: [0, -2] };
/** Until a replay has been drawn, its picture is taken to be a phone's (the tighter safe area): width over height, and px high. */
const SHAPE = [1.3, 288];
/**
 * Before the shot the ball counts in full this near the man (ft), and is drawn in toward him over this much
 * farther: a pass from across the floor comes into the picture with the ball, it doesn't open the picture out to it.
 */
const BALL_NEAR = 6;
const BALL_FAR = 12;
/** What the picture is held to (not where it is going) has the ball before the shot only this near him (ft), let go of over as far again: in his hands. */
const BALL_HIS = 3;
/**
 * How the picture settles. Where it is going is worked out this far ahead (the script's ms), so it opens out
 * for the flight early and slowly; it opens out no faster than this (degrees a second) and comes in no faster
 * than this, getting up to speed over this long (s); and it is never tighter than the widest the replay will
 * need (from its seat, up front) over this: it starts near enough to how wide it ends that it has little to open.
 */
const AHEAD = 260;
/** And the flight and the basket are drawn in this far ahead (the script's ms) for how wide it is going: it has opened out for a shot from range by the time the ball goes up, not as it does. */
const AHEAD_SHOT = 700;
const WIDEN = 14;
const NARROW = 7;
const SPEED_UP = 0.35;
const ZOOM_MOST = 1.3;
/** And for a shot it is never tighter than that by its release, coming to it over this long before (the script's ms): a replay that picks the play up just before the shot starts nearly as wide as the shot needs, so it has little to open as the ball goes up. */
const RUN_UP = 900;
/** The highest thing it must show is put this high in the picture (-1..1) when there is room: the man doesn't sink under empty air. */
const TOP_AT = 0.66;
/** A camera's own aim moves from one thing to the next over this long (the script's ms), not in a frame. */
const SHIFT = 260;

interface Big {
  sc: Script;
  /** The frame whose move has the moment, and when the moment is (the script's ms). */
  k: number;
  at: number;
  kind: BigKind;
  star: number;
  side: 0 | 1;
  /** How long ago it happened (ms). */
  ago: number;
}

/** A replay: the stretch of the script it plays (the script's ms), where it is, and how it is seen. */
export interface Reel {
  sc: Script;
  t0: number;
  t1: number;
  at: number;
  t: number;
  kind: BigKind;
  star: number;
  side: 0 | 1;
  cam: ReelCam;
  /** The camera of its second look (null: none, or it is on), and how far the wipe into it has got (ms; -1: not started). */
  next: ReelCam | null;
  swap: number;
  /** The frame with the moment, and where its man is then (the scene's feet). */
  k: number;
  x: number;
  z: number;
  /** Its slowest (of the play's 1x pace). */
  slow: number;
  /** How much faster than the ramp it runs, to fit REEL_MOST. */
  rate: number;
  /** Where its camera stands, and the basket the play went at (the scene's feet). */
  seat: V3;
  /** The widest its camera will need to go to hold what must be seen (the tangent of half its picture top to bottom, from `need`). */
  wide: number;
  rim: { x: number; z: number };
  /** The tight camera stands behind him (over his shoulder: a shot from range), not in front of his face. */
  back: boolean;
  /** When the ball leaves his hand (the script's ms), and its flight as the scene throws it (null: a dunk or a block). */
  rel: number;
  flight: Shot | null;
  /** The other man the picture holds: a block's shooter, the man who fouled on an and-one (an index into the script's men; -1: none). */
  other: number;
  /** Where the shot left his hands (the scene's feet; null: nobody had it), and whether it was a dunk. */
  from: { x: number; z: number } | null;
  dunk: boolean;
}

/** A frame of the replay for the scene to draw in place of the live one (`cut`: everyone is put on his spot, not walked there). */
export interface Feed {
  stage: Stage;
  dt: number;
  own: number;
  cut: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** A point on the court, in the scene (as scene.ts has it). */
const sx = (p: Pt) => p.y - MID;
const sz = (p: Pt) => -p.x;

/** When the move into frame `k` starts (the script's ms): see `pose`. */
function startOf(sc: Script, k: number) {
  let t = 0;
  for (let i = 1; i < k && i < sc.frames.length; i++) t += sc.frames[i].dur;
  return t;
}

/** Where a replay's picture may hold what it must show (see THIRD_PX): the lower third's right edge and top, and the bug's right edge and foot (-1..1 across and up). */
interface Safe {
  tr: number;
  tt: number;
  br: number;
  bb: number;
}
/** A look: what it looks at, and the tangent of half the picture top to bottom. */
interface Aim {
  x: number;
  y: number;
  z: number;
  tan: number;
}
// (hold's working numbers: each point across and up the picture before its width, and how low and how high it may sit (limits))
const U: number[] = [];
const V: number[] = [];
const LO: number[] = [];
const HI: number[] = [];

/**
 * How low and how high in the picture (-1..1) each of the `n` numbers of `pts` may sit, with `room` more to
 * spare, into LO and HI: over the lower third and under the bug where it is across the picture from `seat`
 * looking at `look` (`tan`: half its height), let off them over BAND past their edges. Taken from a picture
 * already drawn, not the one being worked out, so a point near an edge never sets the width and the width
 * the point (no picture: off them all the way across).
 */
function limits(seat: V3, look: V3 | null, tan: number, pts: ArrayLike<number>, n: number, aspect: number, sa: Safe, room: number) {
  let [fx, fy, fz] = look ? [look.x - seat.x, look.y - seat.y, look.z - seat.z] : [0, 0, 0];
  const fl = Math.hypot(fx, fy, fz) || 1;
  [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
  const flat = Math.hypot(fx, fz) || 1e-6;
  const [rx, rz] = [-fz / flat, fx / flat];
  for (let i = 0; i < n / 3; i++) {
    const [dx, dy, dz] = [pts[i * 3] - seat.x, pts[i * 3 + 1] - seat.y, pts[i * 3 + 2] - seat.z];
    const nx = look ? (dx * rx + dz * rz) / Math.max(1, dx * fx + dy * fy + dz * fz) / (tan * aspect) : -1;
    LO[i] = sa.tt + room + (-EDGE[1] - sa.tt) * smooth(clamp((nx - sa.tr - room) / BAND, 0, 1));
    HI[i] = sa.bb - room + (EDGE[1] - sa.bb) * smooth(clamp((nx - sa.br - room) / BAND, 0, 1));
  }
}

/**
 * The look from `seat` that holds the `n` numbers of `pts` (x, y, z each) inside the picture, each as low
 * and as high as `limits` let it, as near the look the camera asks for (`want`, at least `tan0` wide) as
 * that allows: it turns as little and widens as little as it must, and no wider than `most` (past that they
 * are centred as well as they go), with `room` more to spare across. With `top`, up and down it puts the
 * highest of them that high in the picture (-1..1) instead, as near as they let it. Into `out`, looking as
 * far off as `want` is.
 */
function hold(seat: V3, want: V3, tan0: number, pts: ArrayLike<number>, n: number, aspect: number, most: number, out: Aim, room = 0, top?: number): Aim {
  const ex = EDGE[0] - room;
  let [fx, fy, fz] = [want.x - seat.x, want.y - seat.y, want.z - seat.z];
  const reach = Math.hypot(fx, fy, fz) || 1;
  const m = n / 3;
  let tan = tan0;
  for (let it = 0; it < 5; it++) {
    const fl = Math.hypot(fx, fy, fz) || 1;
    [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
    // (level, as three's lookAt has it: right is along the floor)
    const flat = Math.hypot(fx, fz) || 1e-6;
    const [rx, rz] = [-fz / flat, fx / flat];
    const [ux, uy, uz] = [-rz * fy, rz * fx - rx * fz, rx * fy];
    const at = (x: number, y: number, z: number, i: number) => {
      const [dx, dy, dz] = [x - seat.x, y - seat.y, z - seat.z];
      // (a point behind the lens counts as far off to its side: the look turns toward it)
      const d = Math.max(1, dx * fx + dy * fy + dz * fz);
      U[i] = (dx * rx + dz * rz) / d;
      V[i] = (dx * ux + dy * uy + dz * uz) / d;
    };
    for (let i = 0; i < m; i++) at(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], i);
    at(want.x, want.y, want.z, m);
    const [wu, wv] = [U[m], V[m]];
    let [u0, u1] = [Infinity, -Infinity];
    for (let i = 0; i < m; i++) [u0, u1] = [Math.min(u0, U[i]), Math.max(u1, U[i])];
    tan = Math.max(tan0, (u1 - u0) / (2 * ex * aspect));
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (V[i] > V[j]) tan = Math.max(tan, (V[i] - V[j]) / (HI[i] - LO[j]));
    tan = Math.min(tan, most);
    const [xa, xb] = [u1 - ex * tan * aspect, u0 + ex * tan * aspect];
    const cu = xa <= xb ? clamp(wu, xa, xb) : (xa + xb) / 2;
    let [ya, yb] = [-Infinity, Infinity];
    let hi = -Infinity;
    for (let i = 0; i < m; i++) [ya, yb, hi] = [Math.max(ya, V[i] - HI[i] * tan), Math.min(yb, V[i] - LO[i] * tan), Math.max(hi, V[i])];
    const cv = ya <= yb ? clamp(top === undefined ? wv : hi - top * tan, ya, yb) : (ya + yb) / 2;
    if (it === 4) break;
    [fx, fy, fz] = [fx + rx * cu + ux * cv, fy + uy * cv, fz + rz * cu + uz * cv];
  }
  out.x = seat.x + fx * reach;
  out.y = seat.y + fy * reach;
  out.z = seat.z + fz * reach;
  out.tan = tan;
  return out;
}

/** A seat behind a man at (x, z) shooting at `rim`, over his shoulder: not too far round from his back, nor pulled in on him (SHOULDER_ROUND). */
function behind(seat: V3, x: number, z: number, rim: { x: number; z: number }) {
  const a = Math.atan2(seat.x - x, seat.z - z) - Math.atan2(x - rim.x, z - rim.z);
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= SHOULDER_ROUND && Math.hypot(seat.x - x, seat.z - z) >= SHOULDER_OFF[0] * 0.6;
}

/**
 * Where the trail referee keeps with the ball at (bx, bz), the basket being attacked at the `e` end (sideline.ts officiate):
 * this far behind it along the floor, no farther up it than this (ft from the middle); across, this far out toward the far
 * side, this much more for each ft the ball is out, between these (x, z).
 */
const TRAIL = { back: 13, most: 15, z: [-7, 0.4, -15, -3] };
function trail(bx: number, bz: number, e: number): [number, number] {
  return [e * Math.min(e * bx - TRAIL.back, TRAIL.most), clamp(TRAIL.z[0] + bz * TRAIL.z[1], TRAIL.z[2], TRAIL.z[3])];
}

/** A smooth wobble, -1..1: two slow waves that never line up (a hand on a camera, not a machine). */
function wob(t: number, a: number, b: number, phase: number) {
  return Math.sin(t * a + phase) * 0.62 + Math.sin(t * b + phase * 2.3 + 1.1) * 0.38;
}

export class Director {
  /** The director's own clock (ms): the hand on the cameras moves on it. */
  private t = 0;
  private big: Big | null = null;
  private gap = REPLAY_GAP;
  private n = 0;
  phase: 'off' | 'wait' | 'in' | 'on' | 'out' = 'off';
  private ms = 0;
  reel: Reel | null = null;
  /** The court may go on: no replay, or the replay is past its last frame (the wipe is over the picture). */
  released = true;
  /** The possession just replayed: its end is not news again (no second cut-in, no second net). */
  replayed: Script | null = null;
  // out of the replay: back on the live picture (when, ms into the phase); a replay ended at once owes the live picture a cut
  private swapped = -1;
  private owed = false;
  /** How far the wipe is across the picture (0..1), or null. */
  wipe: number | null = null;
  // the replay camera: where it looks, how wide and how fast that is changing (degrees a second), and whether it has a first frame yet
  private readonly look = { x: 0, y: 0, z: 0 };
  private fov = 30;
  private fv = 0;
  private set = false;
  // where the man was last frame, and when (the script's ms)
  private readonly was = { x: 0, y: 0, z: 0, t: 0, vx: 0, vy: 0, vz: 0 };
  // what it must show this frame (and AHEAD of it, for where the picture is going), and at a few times of the replay (for choosing a
  // seat: where each time's points end); the picture's shape and height (px) as last drawn
  private readonly pts: number[] = [];
  private readonly soon: number[] = [];
  // what must be seen past a basket's unit (x, y, z each): the run-up's, then from `seeCut` the moment's, `seeN` numbers in all
  private readonly see: number[] = [];
  private seeCut = 0;
  private seeN = 0;
  // where the man is on the run-up, at LEAD_AT (x, z each): a close camera doesn't stand where he runs by it
  private readonly run: number[] = [];
  private readonly chk: number[] = [];
  // the others on the floor at the moment (x, z each); and at each of the times `moment` tries, the others and where the
  // man is and when (x, the script's ms, z): what may stand by a replay camera's lens, how near it is, what it looks at
  private readonly men: number[] = [];
  private readonly crowd: number[][] = [];
  // the referees where the play left them (x, z each): they stand by a lens as much as the ten do
  private readonly refs: number[] = [];
  private readonly at: number[] = [];
  // what a seat's picture comes to (`judge`)
  private readonly verdict = { need: 0, mess: 0 };
  // what a replay camera looks at, and how much of the scene it keeps there (`framing`)
  private readonly frameAt0 = { x: 0, y: 0, z: 0, span: 0 };
  private readonly cuts: number[] = [];
  private aspect = SHAPE[0];
  private high = SHAPE[1];
  private readonly sa: Safe = { tr: 0, tt: 0, br: 0, bb: 0 };
  private readonly aim: Aim = { x: 0, y: 0, z: 0, tan: 0 };
  private readonly stage: Stage = { script: null, play: null, standers: [], ball: null };
  // the rim taking a dunk: how long ago (ms)
  private kicked = 1e9;
  /** The play's pace against the bodies' (COURT3D_PACE in CourtView), as the live frames have it: a replay keeps it. */
  private pace = 0.5;
  /** The speed chip, as the live frames have it (the bodies' time against the clock's). */
  private speed = 1;

  /** The replay has the picture (not the wipe's first half in, nor the wait for the live floor out). */
  get onAir() {
    return this.phase === 'on' || (this.phase === 'out' && this.swapped < 0);
  }

  /** A big play has happened in this possession (the frame `k` has its moment): the best of them is kept for the next dead ball. */
  note(sc: Script, k: number, kind: BigKind, star: number, side: 0 | 1) {
    if (this.phase !== 'off') return;
    const b = this.big;
    if (b && b.sc === sc && (RANK[b.kind] > RANK[kind] || (b.k === k && b.kind === kind))) return;
    const f = sc.frames[k];
    // (the ball goes through most of the way along a shot's move; a block meets it a third of the way)
    const at = startOf(sc, k) + f.dur * (f.swat !== undefined && kind === 'block' ? 0.32 : 0.86);
    this.big = { sc, k, at, kind, star, side, ago: 0 };
  }

  /**
   * The court has finished `sc`: a replay of its big play starts if there is one worth it (and none was
   * shown in the last REPLAY_GAP). True: the court is to wait until `released`. `refs`: where the referees
   * are (x, z each; the replay has them about where they were), for its camera to stand clear of.
   */
  start(sc: Script | null, refs: ArrayLike<number> = []): boolean {
    const b = this.big;
    if (this.phase !== 'off' || !sc || !b || b.sc !== sc || b.ago > STALE_MS || this.gap < REPLAY_GAP * (this.speed > 1.05 ? 1.5 : 1)) return false;
    // the shot: who let it go and how (a dunk's moment is its slam, the bodies' DUNK_AT into its move)
    const g = sc.frames[b.k - 1];
    const shooter = g.hold ?? -1;
    const how = shooter >= 0 ? g.act[shooter] : 'jumper';
    const dunk = how === 'dunk';
    const at = dunk && b.kind !== 'block' ? startOf(sc, b.k) + DUNK_AT * this.pace : b.at;
    const t1 = Math.min(startOf(sc, sc.frames.length), b.at + (b.kind === 'buzzer' || b.kind === 'winner' ? AFTER_BUZZER : AFTER));
    // it picks the play up where the ball is in a man's hands (so it leaves them as it did), as near BACK before the moment as there is
    const want = at - (dunk ? BACK_DUNK : BACK);
    let t0 = -1;
    let best = Infinity;
    for (let j = 1; j <= b.k; j++) {
      const a = sc.frames[j - 1];
      const f = sc.frames[j];
      if (a.hold === undefined || a.hold < 0 || f.fx) continue;
      const s = startOf(sc, j);
      const t = clamp(want, s, s + f.dur - 1);
      if (t > at - 300 || t < at - BACK_MOST) continue;
      if (Math.abs(t - want) < best) {
        best = Math.abs(t - want);
        t0 = t;
      }
    }
    if (t0 < 0) t0 = Math.max(0, want);
    if (t1 - t0 < 400) return false;
    this.refs.length = 0;
    for (let i = 0; i < refs.length; i++) this.refs.push(refs[i]);
    const cams = CAMS[b.kind];
    const pids = [...sc.oPids, ...sc.dPids];
    const j = pids.indexOf(b.star);
    const fk = sc.frames[b.k];
    const nO = sc.oPids.length;
    const spot = toWorld(j < 0 ? fk.ball : j < nO ? fk.o[j] : fk.d[j - nO], sc.dir);
    const rimPt = toWorld(BASKET, sc.dir);
    const rim = { x: sx(rimPt), z: sz(rimPt) };
    // its flight as the scene will throw it (from about where his hands are)
    const from = shooter >= 0 ? toWorld(shooter < nO ? g.o[shooter] : g.d[shooter - nO], sc.dir) : spot;
    const flight =
      b.kind !== 'block' && fk.fx && !dunk
        ? planShot({
            from: { x: sx(from), y: how === 'layup' ? 9 : 8.6, z: sz(from) },
            rim,
            kind: how === 'layup' || how === 'floater' ? how : 'jumper',
            made: fk.fx === 'make',
            secs: fk.dur / 1000 / this.pace,
            next: null,
            r: [0.5, 0.5, 0.5],
          })
        : null;
    // (the whistle on an and-one comes a move or two after the make)
    const whistle = b.kind === 'and1' ? sc.frames.slice(b.k + 1, b.k + 3).find((f) => f.foul !== undefined) : undefined;
    // (the biggest are seen twice: a shot at the buzzer, and with time to spare a dunk)
    const twice = b.kind === 'winner' || b.kind === 'buzzer' || (b.kind === 'dunk' && this.speed <= 1.05);
    const r: Reel = {
      sc,
      t0,
      t1,
      at,
      t: t0,
      kind: b.kind,
      star: b.star,
      side: b.side,
      cam: 'slash',
      next: null,
      swap: -1,
      k: b.k,
      x: sx(spot),
      z: sz(spot),
      slow: SLOW,
      // (a longer stretch is played a little faster)
      rate: Math.max(1, this.runs(t0, t1, at, SLOW) / REEL_MOST),
      seat: { x: 0, y: 0, z: 0 },
      wide: 0,
      rim,
      back: false,
      rel: startOf(sc, b.k),
      flight,
      other: b.kind === 'block' ? shooter : (whistle?.foul ?? -1),
      from: shooter >= 0 ? { x: sx(from), z: sz(from) } : null,
      dunk,
    };
    this.moment(r);
    // the camera whose turn it is, if it sees this play and its seat can hold what must be seen at the moment; else the next that can
    const turn = this.n % cams.length;
    for (const c of [...cams.slice(turn), ...cams.slice(0, turn), 'side', 'tight', 'slash'] as ReelCam[]) if (this.take(c, r)) break;
    r.next = twice ? (r.cam === 'tight' ? 'slash' : 'tight') : null;
    this.reel = r;
    this.big = null;
    this.n++;
    this.phase = 'wait';
    this.ms = 0;
    this.released = false;
    this.swapped = -1;
    this.wipe = null;
    this.set = false;
    return true;
  }

  /** A tap on the court: the replay goes, through its wipe if it is on the picture, at once if it isn't yet. */
  skip() {
    if (this.phase === 'wait' || this.phase === 'in') this.end();
    else if (this.phase === 'on') {
      this.phase = 'out';
      this.ms = 0;
    }
  }

  /** Gone at once (the game paused, sped up, the picture went): the live picture is back next frame. */
  end() {
    if (this.phase === 'off') return;
    this.owed = this.onAir;
    this.phase = 'off';
    this.reel = null;
    this.released = true;
    this.wipe = null;
    this.gap = 0;
  }

  /** The rim took a dunk: the camera takes a little of it. */
  kick() {
    this.kicked = 0;
  }

  /** The picture's shape (width over height) and height (px): a replay's seat is chosen for it. */
  size(aspect: number, high: number) {
    if (aspect > 0 && high > 0) [this.aspect, this.high] = [aspect, high];
  }

  /** The play's pace in the replay at `t` (of its 1x pace), `slow` at its moment. */
  private slow(t: number, at: number, slow: number) {
    return slow + (FAST - slow) * smooth(clamp(t < at ? (at - t) / RAMP : (t - at) / RAMP_OUT, 0, 1));
  }

  /** How long the stretch `t0`..`t1` of a play runs on the ramp (ms). */
  private runs(t0: number, t1: number, at: number, slow: number) {
    let real = 0;
    for (let t = t0; t < t1; real += 16) t += 16 * this.pace * this.slow(t, at, slow);
    return real;
  }

  /**
   * One frame (before the scene draws anything): the replay's moment to draw in place of the live one,
   * the live one with a cut on the frame the picture comes back to it, or null (the live picture).
   * `busy`: a cut-in still has the scorer.
   */
  feed(live: Stage, dt: number, own: number, real: number, busy: boolean): Feed | null {
    this.t += real;
    this.kicked += real;
    if (this.big) this.big.ago += real;
    // (the play's clock against the bodies' at 1x is the same at any speed: dt is the clock times the speed times the pace)
    if (this.phase === 'off' && dt > 0 && own > 0) this.pace = clamp(dt / own, 0.2, 1);
    if (this.phase === 'off' && real > 0 && own > 0) this.speed = own / real;
    if (this.phase === 'off') {
      this.gap += real;
      if (!this.owed) return null;
      this.owed = false;
      return { stage: live, dt, own, cut: true };
    }
    const r = this.reel!;
    this.ms += real;
    const half = WIPE_MS / 2;
    if (this.phase === 'wait') {
      if (this.ms < LEAD_MAX && (this.ms < LEAD_MS || busy)) return null;
      this.phase = 'in';
      this.ms = 0;
    }
    if (this.phase === 'in') {
      this.wipe = this.ms / WIPE_MS;
      if (this.ms < half) return null;
      // covered: the picture cuts to the replay's first frame
      this.phase = 'on';
      this.ms = half;
      this.wipe = 0.5;
      this.replayed = r.sc;
      return this.frameAt(0, true);
    }
    if (this.phase === 'on') {
      this.wipe = this.ms < WIPE_MS ? this.ms / WIPE_MS : null;
      if (r.swap >= 0) {
        // the second look: a quick wipe over the first's last frame, the picture cutting under it to the play again, tight and slower
        r.swap += real;
        this.wipe = r.swap < SWAP_MS ? r.swap / SWAP_MS : null;
        if (r.next && r.swap >= SWAP_MS / 2) {
          // (from the end of the move before the moment's: the ball is in a man's hands there, and leaves them as it did)
          r.t = r.t0 = Math.max(r.t0, startOf(r.sc, r.k) - 8);
          this.moment(r);
          if (!this.take(r.next, r)) this.take('slash', r);
          r.next = null;
          r.slow = SLOW_2;
          r.rate = Math.max(1, this.runs(r.t0, r.t1, r.at, SLOW_2) / REEL_2_MOST);
          this.set = false;
          return this.frameAt(0, true);
        }
        if (r.swap >= SWAP_MS) r.swap = -1;
        if (r.next) return this.frameAt(0, false, real * 0.25);
      }
      const step = (real * this.pace * this.slow(r.t, r.at, r.slow)) / r.rate;
      const was = r.t;
      r.t = Math.min(r.t1, r.t + step);
      if (r.t >= r.t1) {
        if (r.next) r.swap = 0;
        else {
          this.phase = 'out';
          this.ms = 0;
        }
      }
      return this.frameAt(r.t - was, false);
    }
    // out: the wipe comes over the replay's last frame; under it the court is told it may go on, and the
    // live picture comes back once the court is on its next possession (or after HANDOVER_MS anyway)
    if (this.swapped < 0) {
      this.wipe = Math.min(0.5, this.ms / WIPE_MS);
      if (this.ms >= half) this.released = true;
      if (this.released && (live.script !== r.sc || this.ms >= half + HANDOVER_MS)) {
        this.swapped = this.ms;
        return { stage: live, dt, own, cut: true };
      }
      // (held, the bodies still breathe: a still frame under a wipe reads as a fault)
      return this.frameAt(0, false, real * 0.25);
    }
    this.wipe = 0.5 + (this.ms - this.swapped) / WIPE_MS;
    if (this.wipe >= 1) {
      this.phase = 'off';
      this.reel = null;
      this.wipe = null;
      this.gap = 0;
    }
    return null;
  }

  private frameAt(step: number, cut: boolean, own = step / this.pace): Feed {
    const r = this.reel!;
    const st = this.stage;
    st.script = r.sc;
    st.play = pose(r.sc, r.t, false);
    return { stage: st, dt: step, own, cut };
  }

  /**
   * The replay is seen from `cam` if that camera sees this play at all (the basket's cameras only a play
   * at it; the near side's not with the man in the corner, where it would stand past the baseline with the
   * basket's post across its picture, nor with him by its lens, SIDE_NEAR) and its seat can hold what must be seen at the moment (the gantry's
   * long lens always can).
   */
  private take(cam: ReelCam, r: Reel): boolean {
    if (AT_RIM.has(cam) && Math.hypot(r.x - r.rim.x, r.z - r.rim.z) > RIM_NEAR) return false;
    if (cam === 'side' && (Math.abs(this.sideSeat(r.x, r.rim.x < 0 ? -1 : 1).x) > MID + 3 || SIDE_Z - r.z < SIDE_NEAR)) return false;
    const seat = this.seatFor(cam, r);
    const { need, mess } = this.judge(seat, cam, r);
    if (cam !== 'slash' && (need > this.widest(cam, r.back) || this.fenced(seat) || mess > MESS_MOST)) return false;
    // (over his shoulder only from behind him, with nobody between him and the lens at the shot, nor a referee (the last
    // of each crowd: those where the play left them, and the trail) on the way to it: they stand where they stand, the players go by)
    const nr = this.refs.length / 2 + 1;
    const by = (m: number[], c: number, refs: boolean) => blocked(this.at[c * 3], this.at[c * 3 + 2], seat.x, seat.z, refs ? m.slice(-nr * 2) : m, refs ? nr : m.length / 2);
    if (cam === 'tight' && r.back && (!behind(seat, r.x, r.z, r.rim) || this.crowd.some((m, c) => by(m, c, c < this.crowd.length - 1)))) return false;
    r.cam = cam;
    r.seat = seat;
    r.wide = need;
    return true;
  }

  /** The man at the replay's moment (his head, the ball in his hands) is seen from `seat` past a basket's unit (`fenced`), or more than a little of his run-up is. */
  private fenced(seat: V3): boolean {
    const E = this.see;
    let run = 0;
    for (let i = 0; i < this.seeN; i += 3)
      if (fenced(seat.x, seat.y, seat.z, E[i], E[i + 1], E[i + 2])) {
        if (i >= this.seeCut) return true;
        run += 3;
      }
    return run > this.seeCut / 4;
  }

  /** Where the near side's camera stands for a man at `x` going at the `e` end, in a picture this shape (SIDE_OFF, SIDE_Y). */
  private sideSeat(x: number, e: number): V3 {
    const u = smooth(clamp((TALL - this.aspect) / SIDE_SPAN, 0, 1));
    return { x: x + e * (SIDE_OFF[0] + (SIDE_OFF[1] - SIDE_OFF[0]) * u), y: SIDE_Y[0] + (SIDE_Y[1] - SIDE_Y[0]) * u, z: SIDE_Z };
  }

  /** The most a camera opens out (`back`: the tight one over his shoulder): the tangent of half its picture top to bottom. */
  private widest(cam: ReelCam, back = false) {
    return Math.tan(((cam === 'tight' && back ? SHOULDER_WIDEST : WIDEST[cam]) * Math.PI) / 360 / Math.min(1, this.aspect));
  }

  /**
   * What a picture from `seat` comes to, at the times `moment` tries: how wide it must be to hold what the replay
   * must show, at the widest of them (`need`: the tangent of half of it top to bottom); and how much of it the
   * basket's units and the men by its lens take, at the worst of them (`mess`: cameras.ts `clutter`, the picture
   * as wide as it must be there, the units as far as half as far again past what it looks at). Not `mess`: the
   * width alone (the dearer half left out).
   */
  private judge(seat: V3, cam: ReelCam, r: Reel, mess = true): { need: number; mess: number } {
    const sa = this.safe(this.aspect, this.high);
    const out = this.verdict;
    [out.need, out.mess] = [0, 0];
    for (let c = 0, from = 0; c < this.cuts.length; from = this.cuts[c++]) {
      const P = this.chk.slice(from, this.cuts[c]);
      const m = P.length / 3;
      const mid = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < m; i++) [mid.x, mid.y, mid.z] = [mid.x + P[i * 3] / m, mid.y + P[i * 3 + 1] / m, mid.z + P[i * 3 + 2] / m];
      limits(seat, null, 1, P, P.length, this.aspect, sa, 0);
      out.need = Math.max(out.need, hold(seat, mid, 0, P, P.length, this.aspect, Infinity, this.aim).tan);
      if (!mess) continue;
      // (the picture as the camera takes it: its own, turned and opened out as little as holds what it must show)
      const man = { x: this.at[c * 3], y: 4.6, z: this.at[c * 3 + 2] };
      const F = this.framing(cam, r, man, null, man, this.at[c * 3 + 1]);
      const d = Math.hypot(seat.x - F.x, seat.y - F.y, seat.z - F.z);
      const own = Math.tan((clamp((2 * Math.atan(F.span / 2 / d) * 180) / Math.PI / Math.min(1, this.aspect), 9, WIDEST[cam]) * Math.PI) / 360);
      const A = hold(seat, F, own, P, P.length, this.aspect, this.widest(cam), this.aim);
      const far = Math.hypot(A.x - seat.x, A.y - seat.y, A.z - seat.z) * 1.5 + 6;
      const to = Math.hypot(man.x - seat.x, man.z - seat.z);
      const fore = Math.max(FORE[2], Math.min(to * FORE[0], to - FORE[1]));
      const men = this.crowd[c];
      out.mess = Math.max(out.mess, clutter(seat.x, seat.y, seat.z, A.x, A.y, A.z, A.tan, this.aspect, far, men, men.length / 2, fore));
    }
    return out;
  }

  /** Of `seats`, the one whose picture holds the play tightest with the least of it a basket's unit or a man by the lens (MESS_COST), and nothing of a unit in front of the man (`fenced`). */
  private cleanest(seats: V3[], cam: ReelCam, r: Reel): V3 {
    let [best, low] = [seats[0], Infinity];
    for (const seat of seats) {
      // (its picture's make-up only when the rest of it leaves the seat a chance)
      let cost = this.judge(seat, cam, r, false).need / this.widest(cam);
      cost += (cost > 1 ? 10 : 0) + (this.fenced(seat) ? 6 : 0);
      if (cost < low) cost += MESS_COST * this.judge(seat, cam, r).mess;
      if (cost < low) [best, low] = [seat, cost];
    }
    return best;
  }

  /**
   * What a replay must show, from the script (for choosing a seat up front), a few times over (`cuts`): on
   * the run-up, the man with the ball and the man it is on (and a block's shooter), and the basket and the
   * flight as `must` draws them in; at the moment, the man where he let the ball go and where the moment
   * finds him, up in the air for it, and the basket and the ball's flight to it for a shot; a block's
   * shooter and the ball at the blocker's hand; an and-one's foul.
   */
  private moment(r: Reel) {
    const P = this.chk;
    let n = 0;
    const put = (x: number, y: number, z: number) => {
      P[n++] = x;
      P[n++] = y;
      P[n++] = z;
    };
    // (a man: his shoulders' width at `lo`, whichever way he is seen, and up to `hi`)
    const man = (x: number, z: number, lo: number, hi: number) => {
      for (const [dx, dz] of [
        [-BODY_HALF, 0],
        [BODY_HALF, 0],
        [0, -BODY_HALF],
        [0, BODY_HALF],
      ])
        put(x + dx, lo, z + dz);
      put(x, hi, z);
    };
    this.cuts.length = 0;
    this.run.length = 0;
    this.men.length = this.crowd.length = this.at.length = 0;
    for (const p of [...r.sc.frames[r.k].o, ...r.sc.frames[r.k].d]) {
      const w = toWorld(p, r.sc.dir);
      if (Math.hypot(sx(w) - r.x, sz(w) - r.z) > 0.5) this.men.push(sx(w), sz(w));
    }
    // (the referees where the play left them, and the trail where he was as the ball went up)
    const e0 = r.rim.x < 0 ? -1 : 1;
    const go = r.from ?? r;
    this.men.push(...this.refs, ...trail(go.x, go.z, e0));
    // (and what must be seen past a basket's unit: his chest and head on the run-up, at the moment his head and the ball
    // in his hands, at the rim for a dunk)
    const E = this.see;
    let e = 0;
    const eye = (x: number, y: number, z: number) => {
      E[e++] = x;
      E[e++] = y;
      E[e++] = z;
    };
    const nO = r.sc.oPids.length;
    const pids = [...r.sc.oPids, ...r.sc.dPids];
    const B: V3 = { x: 0, y: 0, z: 0 };
    for (const u of LEAD_AT) {
      const t = r.t0 + (Math.max(r.t0, r.rel) - r.t0) * u;
      const pl = pose(r.sc, t, false);
      const j = pids.indexOf(r.star);
      const s = toWorld(j < 0 ? pl.ball : j < nO ? pl.o[j] : pl.d[j - nO], r.sc.dir);
      man(sx(s), sz(s), 3, 6.6 + HEAD_ROOM);
      eye(sx(s), 4.6, sz(s));
      this.run.push(sx(s), sz(s));
      this.at.push(sx(s), t, sz(s));
      this.crowd.push([
        ...[...pl.o, ...pl.d].flatMap((p, i) => {
          const w = toWorld(p, r.sc.dir);
          return i === j ? [] : [sx(w), sz(w)];
        }),
        ...this.refs,
        ...trail(sx(toWorld(pl.ball, r.sc.dir)), sz(toWorld(pl.ball, r.sc.dir)), e0),
      ]);
      eye(sx(s), 6.8, sz(s));
      // (the ball's man drawn in toward him from far off, as `must` has the ball)
      const bw = toWorld(pl.ball, r.sc.dir);
      const near = 1 - smooth(clamp((Math.hypot(sx(bw) - sx(s), sz(bw) - sz(s)) - BALL_NEAR) / BALL_FAR, 0, 1));
      man(sx(s) + (sx(bw) - sx(s)) * near, sz(s) + (sz(bw) - sz(s)) * near, 3, 6.6 + HEAD_ROOM);
      if (r.other >= 0) {
        const o = toWorld(r.other < nO ? pl.o[r.other] : pl.d[r.other - nO], r.sc.dir);
        man(sx(o), sz(o), 3, 6.6 + HEAD_ROOM);
      }
      const w = r.kind === 'block' ? 0 : smooth(clamp((t - r.rel + (r.dunk ? TAKE_OFF : 0) + FLIGHT_LEAD) / FLIGHT_LEAD, 0, 1));
      const drawn = (x: number, y: number, z: number) => put(sx(s) + (x - sx(s)) * w, 4.4 + (y - 4.4) * w, sz(s) + (z - sz(s)) * w);
      if (w > 0) {
        drawn(r.rim.x, RIM_H + 0.6, r.rim.z);
        if (r.flight) for (const a of ARC_AT) drawn(shotAt(r.flight, a, B).x, B.y, B.z);
      }
      this.cuts.push(n);
    }
    const up = r.dunk ? 3 : r.kind === 'block' ? 2.4 : 1.2;
    this.seeCut = e;
    for (const at of r.from ? [r.from, r] : [r]) {
      man(at.x, at.z, 4.4, 6.6 + up + HEAD_ROOM);
      eye(at.x, 6.6 + up, at.z);
      if (!r.dunk) eye(at.x, 7.6 + up, at.z);
    }
    if (r.dunk) {
      // (his hands and the ball at the front of the rim, and the ball going through it)
      const l = Math.hypot(r.x - r.rim.x, r.z - r.rim.z) || 1;
      eye(r.rim.x + ((r.x - r.rim.x) / l) * 0.8, RIM_H + 0.3, r.rim.z + ((r.z - r.rim.z) / l) * 0.8);
      eye(r.rim.x, RIM_H - 0.4, r.rim.z);
    } else if (r.kind !== 'block') eye(r.rim.x, RIM_H, r.rim.z);
    this.seeN = e;
    if (r.kind === 'block') put(r.x, RIM_H, r.z);
    else {
      put(r.rim.x, RIM_H + 0.6, r.rim.z);
      put(r.rim.x, RIM_H - 2.2, r.rim.z);
    }
    if (r.flight) for (const u of ARC_AT) put(shotAt(r.flight, u, B).x, B.y, B.z);
    if (r.other >= 0) {
      const f = r.sc.frames[Math.min(r.k + 1, r.sc.frames.length - 1)];
      const p = toWorld(r.other < nO ? f.o[r.other] : f.d[r.other - nO], r.sc.dir);
      man(sx(p), sz(p), 3.5, 8);
    }
    this.cuts.push(n);
    this.at.push(r.x, r.at, r.z);
    this.crowd.push(this.men);
  }

  /** The safe area of a picture this shape and this many px high: clear of the lower third and the bug (see THIRD_PX). */
  private safe(aspect: number, high: number): Safe {
    const wide = aspect * high;
    const s = this.sa;
    s.tr = -1 + (2 * THIRD_PX[0]) / wide;
    s.tt = Math.min(-0.2, -1 + (2 * THIRD_PX[1]) / high);
    s.br = -1 + (2 * BUG_PX[0]) / wide;
    s.bb = Math.max(0.2, 1 - (2 * BUG_PX[1]) / high);
    return s;
  }

  /**
   * Where a replay's camera stands: past the baseline and low, nearer the camera's side than the man
   * (and clear of the basket's post); on the near side's apron, low, up the floor of the man (a squarer
   * picture: down it, SIDE_OFF); over the board, looking down on the rim; on the floor under the basket, looking
   * up; beside the main camera on its gantry, a long lens; or low and close on him where nobody stands
   * between: at the rim in front of his face, from range (or a face that can't be seen with the basket)
   * over his shoulder. A dunk's close camera goes by where he took off, not where he lands (under the rim,
   * where behind him is behind the basket).
   */
  private seatFor(cam: ReelCam, r: Reel): V3 {
    const { rim } = r;
    const [x, z] = cam === 'tight' && r.dunk && r.from ? [r.from.x, r.from.z] : [r.x, r.z];
    const e = rim.x < 0 ? -1 : 1;
    r.back = false;
    if (cam === 'base')
      return this.cleanest(
        BASE_TRY.z.flatMap((dz) => BASE_TRY.x.map((dx) => ({ x: e * (MID + 2.5 + dx), y: 3.6, z: clamp(z + 9, 13, 24) + dz }))),
        cam,
        r,
      );
    if (cam === 'side') {
      return this.sideSeat(x, e);
    }
    if (cam === 'rim')
      return this.cleanest(
        RIM_TRY.y.flatMap((dy) => RIM_TRY.z.map((dz) => ({ x: e * (MID - 4.7), y: 15.6 + dy, z: 3.6 + dz }))),
        cam,
        r,
      );
    if (cam === 'floor')
      return this.cleanest(
        FLOOR_TRY.z.flatMap((dz) => FLOOR_TRY.x.map((dx) => ({ x: e * (MID + 1 + dx), y: 1.1, z: 7 + dz }))),
        cam,
        r,
      );
    // (as high as the main camera, beside it: lower, its picture would take in the side of the platform's cut in the stands)
    if (cam === 'slash') return { x: e * 6, y: 36, z: 81 };
    const others = this.men;
    // (he went at the basket: his face is toward it, and so is the camera's first choice; but not from behind the
    // basket's unit, its arm or its board across him, and nobody in front of him)
    if (Math.hypot(x - rim.x, z - rim.z) <= SHOULDER_FROM) {
      const at = { x, z: z + TIGHT_OFF };
      const cost = clearSeat(x, z, Math.atan2(rim.x - x, rim.z - z), others, others.length / 2, TIGHT_OFF, at, 5.2, this.see, this.seeN);
      const seat = { x: at.x, y: 5.2, z: at.z };
      const { need, mess } = this.judge(seat, 'tight', r);
      if (cost < 3 && !this.fenced(seat) && need <= this.widest('tight') && mess <= MESS_MOST) return seat;
    }
    // over his shoulder: behind him and to one side, so he hides none of the flight, the rim past him; the
    // seat that holds it all tightest, with nobody in front of him or the rim and its back to the near side's dark
    r.back = true;
    const back = Math.atan2(x - rim.x, z - rim.z);
    const most = this.widest('tight', true);
    const all = [...others, x, z];
    const seat = { x: 0, y: SHOULDER_Y, z: 0 };
    const best = { x: x, y: SHOULDER_Y, z: z + SHOULDER_OFF[0] };
    let low = Infinity;
    for (const off of SHOULDER_OFF)
      for (const turn of SHOULDER_TURN)
        for (const way of [-1, 1]) {
          const a = back + way * turn;
          seat.x = clamp(x + Math.sin(a) * off, -SEAT_X, SEAT_X);
          seat.z = clamp(z + Math.cos(a) * off, SEAT_Z[0], SEAT_Z[1]);
          const { need } = this.judge(seat, 'tight', r, false);
          const [lx, lz] = [(rim.x + x) / 2 - seat.x, (rim.z + z) / 2 - seat.z];
          let cost = need / most + (need > most ? 10 : 0) + Math.max(0, lz / (Math.hypot(lx, lz) || 1)) * 1.5;
          if (blocked(x, z, seat.x, seat.z, others, others.length / 2)) cost += 3;
          if (blocked(rim.x, rim.z, seat.x, seat.z, all, all.length / 2)) cost += 2;
          if (this.fenced(seat)) cost += 6;
          // (a seat the floor's edges have pulled round off his back is not over his shoulder)
          if (!behind(seat, x, z, rim)) cost += 10;
          // (nor where he runs by it on the way: the picture would whip round after him)
          for (let i = 0; i < this.run.length; i += 2) cost += 3 * Math.max(0, 1 - Math.hypot(seat.x - this.run[i], seat.z - this.run[i + 1]) / RUN_BY);
          // (and its picture's make-up, only when the rest leaves it a chance)
          if (cost < low) cost += MESS_COST * this.judge(seat, 'tight', r).mess;
          if (cost < low) {
            low = cost;
            [best.x, best.z] = [seat.x, seat.z];
          }
        }
    return best;
  }

  /** A picture this many degrees across, as the camera's own (top to bottom) in a frame of this shape. */
  private across(deg: number, aspect: number) {
    return (2 * Math.atan(Math.tan((deg * Math.PI) / 360) / aspect) * 180) / Math.PI;
  }

  /** `side`'s bench can be seen from its cut-away's camera: none of `men` (x, z each) stands in front of it. */
  benchClear(side: 0 | 1, men: ArrayLike<number>, n: number) {
    const e = side ? 1 : -1;
    for (let i = 0; i < n; i++) if (men[i * 2 + 1] < -9 && e * men[i * 2] > 2) return false;
    return true;
  }

  /**
   * A bench: from the floor by the scorer's table along it, its coach in front and his men behind him,
   * coming in a little over `ms`.
   */
  aimBench(cam: PerspectiveCamera, side: 0 | 1, ms: number, aspect: number) {
    const e = side ? 1 : -1;
    const u = Math.min(1, ms / 2400);
    cam.fov = this.across(aspect < 1.5 ? 36 : 44, aspect) * (1 - 0.07 * u);
    cam.position.set(e * (BENCH_X[0] - 15 + u) + this.hand(0, 0.08), 5.6 + this.hand(1, 0.06), BENCH_Z + 17 + this.hand(2, 0.08));
    cam.lookAt(e * (BENCH_X[0] + 6.5), 3.4, BENCH_Z - 0.6);
    cam.updateProjectionMatrix();
  }

  /** The crowd: from over the floor at the far side's seats on `side`'s half, panning along them a little over `ms`. */
  aimCrowd(cam: PerspectiveCamera, side: 0 | 1, ms: number, aspect: number) {
    const e = side ? 1 : -1;
    const u = Math.min(1, ms / 2400);
    cam.fov = this.across(aspect < 1.5 ? 40 : 50, aspect);
    cam.position.set(e * 4 + this.hand(0, 0.08), 12 + this.hand(1, 0.06), 4);
    cam.lookAt(e * (16 + 5 * u), 13, -60);
    cam.updateProjectionMatrix();
  }

  /** The building before the tip: from high off a near corner, coming down and round over `ms`. */
  aimIntro(cam: PerspectiveCamera, ms: number, aspect: number) {
    const u = smooth(Math.min(1, ms / INTRO_MS));
    cam.fov = this.across(aspect < 1.5 ? 48 : 56, aspect);
    cam.position.set(-86 + u * 22, 60 - u * 16, 84 + u * 4);
    cam.lookAt(-6 + u * 4, 6 - u * 3, -10);
    cam.updateProjectionMatrix();
  }

  /**
   * What the replay must show this frame, into `P` (x, y, z each; how many numbers): the man (`s`, his
   * chest, and over his head) and the ball (before the shot drawn in toward him from far off, BALL_NEAR; after
   * a shot's moment or a slam until it is out of the net, after a block until it is well away); for a shot
   * the basket and the ball's flight to it, drawn out from him over FLIGHT_LEAD before the release (so
   * nothing enters the picture's sums in one frame), or as it will be `lead` ms on; the other man (a block's
   * shooter, an and-one's foul) where the play has him. Not `loose`: the ball before the shot is his (what the
   * picture is held to; a pass on its way to him is for the look to come to, eased).
   */
  private must(r: Reel, s: V3, head: V3 | null, ball: V3, P: number[], lead = 0, loose = true): number {
    let n = 0;
    const put = (x: number, y: number, z: number) => {
      P[n++] = x;
      P[n++] = y;
      P[n++] = z;
    };
    // (his shoulders whichever way he is seen, and over his head)
    for (const [dx, dz] of [
      [-BODY_HALF, 0],
      [BODY_HALF, 0],
      [0, -BODY_HALF],
      [0, BODY_HALF],
    ])
      put(s.x + dx, s.y, s.z + dz);
    put(head?.x ?? s.x, (head?.y ?? s.y + 2) + HEAD_ROOM, head?.z ?? s.z);
    // (a dunk is done when the rim takes it, at its moment; a block once the ball is well off his hand)
    if (r.kind === 'block') {
      const w = r.t < r.at ? 1 : 1 - smooth(clamp((Math.hypot(ball.x - s.x, ball.z - s.z) - SWAT_DONE) / SWAT_GO, 0, 1));
      const top = (head?.y ?? s.y + 2) + HEAD_ROOM;
      put(s.x + (ball.x - s.x) * w, top + (ball.y - top) * w, s.z + (ball.z - s.z) * w);
      // (a block at the rim has the rim in it too: drawn in as he gets near it)
      const near = 1 - smooth(clamp((Math.hypot(s.x - r.rim.x, s.z - r.rim.z) - 6) / 8, 0, 1));
      put(s.x + (r.rim.x - s.x) * near, top + (RIM_H + 0.6 - top) * near, s.z + (r.rim.z - s.z) * near);
    } else if (r.t < r.rel) {
      const w = 1 - smooth(clamp((Math.hypot(ball.x - s.x, ball.z - s.z) - (loose ? BALL_NEAR : BALL_HIS)) / (loose ? BALL_FAR : BALL_HIS), 0, 1));
      put(s.x + (ball.x - s.x) * w, s.y + (ball.y - s.y) * w, s.z + (ball.z - s.z) * w);
    } else if (r.t < r.at) put(ball.x, ball.y, ball.z);
    else {
      // (drawn in to the net as it drops to the floor)
      const w = smooth(clamp((ball.y - BALL_DONE + BALL_GO) / BALL_GO, 0, 1));
      put(r.rim.x + (ball.x - r.rim.x) * w, RIM_H - 2.2 + (ball.y - RIM_H + 2.2) * w, r.rim.z + (ball.z - r.rim.z) * w);
    }
    if (r.kind !== 'block') {
      const w = smooth(clamp((r.t + lead - r.rel + (r.dunk ? TAKE_OFF : 0) + FLIGHT_LEAD) / FLIGHT_LEAD, 0, 1));
      const drawn = (x: number, y: number, z: number) => put(s.x + (x - s.x) * w, s.y + (y - s.y) * w, s.z + (z - s.z) * w);
      drawn(r.rim.x, RIM_H + 0.6, r.rim.z);
      drawn(r.rim.x, RIM_H - 2.2, r.rim.z);
      const B: V3 = { x: 0, y: 0, z: 0 };
      // (once the ball is there, its flight is let go of, into the rim: the picture settles on him and the basket)
      const g = smooth(clamp((r.t + lead - r.at) / ARC_GO, 0, 1));
      if (r.flight)
        for (const u of ARC_AT) {
          shotAt(r.flight, u, B);
          drawn(B.x + (r.rim.x - B.x) * g, B.y + (RIM_H + 0.6 - B.y) * g, B.z + (r.rim.z - B.z) * g);
        }
    }
    const pl = this.stage.play;
    if (r.other >= 0 && pl) {
      const nO = r.sc.oPids.length;
      const p = toWorld(r.other < nO ? pl.o[r.other] : pl.d[r.other - nO], r.sc.dir);
      put(sx(p), 3.5, sz(p));
      put(sx(p), 8, sz(p));
    }
    return n;
  }

  /**
   * What `cam` looks at (x, y, z) and how much of the scene it keeps top to bottom there (`span`, ft), with the
   * man's chest at `s`, his head at `head` (null: not known), the ball at `ball`, `t` into the script: low behind
   * the basket on the man and the rim over him, low on the near side on the ball and the rim it is going at, over
   * the board on the rim, from the floor under it, the gantry's long lens on the lane, or tight on the man.
   */
  private framing(cam: ReelCam, r: Reel, s: V3, head: V3 | null, ball: V3, t: number): { x: number; y: number; z: number; span: number } {
    const F = this.frameAt0;
    // (after the moment, eased over SHIFT)
    const past = smooth(clamp((t - r.at - 120 + SHIFT / 2) / SHIFT, 0, 1));
    if (cam === 'base') {
      // (the rim stays in it on the way up; after the moment it lets him have the picture)
      const w = 0.34 - 0.16 * past;
      F.x = s.x + (r.rim.x - s.x) * w;
      F.y = Math.max(4.4, s.y + (RIM_H - s.y) * w);
      F.z = s.z + (r.rim.z - s.z) * w;
      F.span = clamp(Math.hypot(s.x - r.rim.x, s.z - r.rim.z) * 0.55 + 10, 11, 24);
    } else if (cam === 'side') {
      // (the ball and the rim it is going at, low in the picture: the flight goes over them inside it, not the camera up after it)
      F.x = ball.x + (r.rim.x - ball.x) * 0.35;
      F.y = clamp(ball.y * 0.35 + 3, 4, 7.5);
      F.z = ball.z + (r.rim.z - ball.z) * 0.35;
      F.span = clamp(Math.max(Math.hypot(ball.x - r.rim.x, ball.z - r.rim.z) * 0.45 + 9, (ball.y - F.y) * 2 + 6), 11, 28);
    } else if (cam === 'rim') {
      // (over the board: the rim under it, the man coming up at it)
      F.x = r.rim.x + (s.x - r.rim.x) * 0.45;
      F.y = Math.min(RIM_H - 0.5, Math.max(6.5, s.y + 1.5));
      F.z = r.rim.z + (s.z - r.rim.z) * 0.45;
      F.span = clamp(Math.hypot(s.x - r.rim.x, s.z - r.rim.z) * 0.8 + 9, 9, 17);
    } else if (cam === 'floor') {
      // (from the floor under it: the rim against the roof, the man going up into the picture)
      F.x = r.rim.x + (s.x - r.rim.x) * 0.5;
      F.y = (RIM_H + Math.max(5, s.y)) / 2 + 0.5;
      F.z = r.rim.z + (s.z - r.rim.z) * 0.5;
      F.span = clamp(Math.hypot(s.x - r.rim.x, s.z - r.rim.z) * 0.9 + 11, 11, 20);
    } else if (cam === 'slash') {
      // (the gantry's second camera, a long lens: the man and the basket he is going at, the lane between them)
      F.x = s.x + (r.rim.x - s.x) * 0.4;
      F.y = 4.5 + Math.max(0, ball.y - 9) * 0.3;
      F.z = s.z + (r.rim.z - s.z) * 0.4;
      F.span = clamp(Math.hypot(s.x - r.rim.x, s.z - r.rim.z) * 0.5 + 11, 12, 24);
    } else if (r.back) {
      // (over his shoulder: past his head toward the rim, the flight between them)
      const face = head ? head.y : s.y + 2;
      F.x = s.x + (r.rim.x - s.x) * 0.4;
      F.y = face + (RIM_H + 1.5 - face) * 0.5;
      F.z = s.z + (r.rim.z - s.z) * 0.4;
      F.span = 9;
    } else {
      // (on him, from his waist to over his head; at the rim on his way up, the rim too)
      const w = clamp(1 - (Math.hypot(s.x - r.rim.x, s.z - r.rim.z) - 4) / 8, 0, 1) * 0.35 * (1 - past);
      const face = head ? head.y - 1.1 : s.y + 0.6;
      F.x = s.x + (r.rim.x - s.x) * w;
      F.y = Math.max(3.8, face + (RIM_H - face) * w);
      F.z = s.z + (r.rim.z - s.z) * w;
      F.span = 6.6 + w * 14;
    }
    return F;
  }

  /**
   * The replay's camera: low behind the basket on the man and the rim over him, low on the near side on
   * the ball and the rim it is going at, or tight on the man (on the shoulder). `star`: his chest (null: he
   * isn't on the floor). Whatever it frames, what the replay must show is held in the picture clear of the
   * lower third and the bug (`hold`); `high`: the picture's height (px), which says how much of it they cover.
   */
  aimReel(cam: PerspectiveCamera, star: V3 | null, head: V3 | null, ball: Vector3, aspect: number, real: number, high: number) {
    const r = this.reel!;
    const s = star ?? ball;
    this.aspect = aspect;
    this.high = high;
    const { x: tx, y: ty, z: tz, span } = this.framing(r.cam, r, s, head, ball, r.t);
    // where the picture is going: the camera's own picture, opened out only as much as holds what it must show a
    // little ahead (AHEAD), and never tighter than ZOOM_MOST in from the widest the replay will need; turned only
    // as much as holds what it must show now, the highest of it TOP_AT up the picture
    const sa = this.safe(aspect, high);
    const most = this.widest(r.cam);
    const T = { x: tx, y: ty, z: tz };
    const d = Math.hypot(r.seat.x - tx, r.seat.y - ty, r.seat.z - tz);
    const own = (clamp((2 * Math.atan(span / 2 / d) * 180) / Math.PI / Math.min(1, aspect), 9, WIDEST[r.cam]) * Math.PI) / 360;
    const L = this.look;
    // (where he will be: as fast as he has been going (ft a ms of the script, eased: not his stride's bob)
    const W = this.was;
    const dt = r.t - W.t;
    if (!this.set) W.vx = W.vy = W.vz = 0;
    else if (dt > 0) {
      const e = 1 - Math.exp(-dt / 120);
      [W.vx, W.vy, W.vz] = [W.vx + ((s.x - W.x) / dt - W.vx) * e, W.vy + ((s.y - W.y) / dt - W.vy) * e, W.vz + ((s.z - W.z) / dt - W.vz) * e];
    }
    [W.x, W.y, W.z, W.t] = [s.x, s.y, s.z, r.t];
    const [ax, ay, az] = [clamp(W.vx * AHEAD, -8, 8), clamp(W.vy * AHEAD, -2, 2), clamp(W.vz * AHEAD, -8, 8)];
    const ahead = { x: s.x + ax, y: s.y + ay, z: s.z + az };
    const top = head ? { x: head.x + ax, y: head.y + ay, z: head.z + az } : null;
    const m = this.must(r, ahead, top, ball, this.soon, AHEAD_SHOT);
    // (off the lower third and the bug all the way across: room for the easing to lag in)
    limits(r.seat, null, 1, this.soon, m, aspect, sa, ROOM);
    // (a shot: the nearer the release, the nearer the widest it will need with the easing's room, RUN_UP; and back out of it as the flight is let go of)
    const shot = !r.flight ? 0 : r.t < r.rel ? clamp(1 - (r.rel - r.t) / RUN_UP, 0, 1) : 1 - smooth(clamp((r.t - r.at) / ARC_GO, 0, 1));
    const zoom = ZOOM_MOST - (ZOOM_MOST - 1) * shot;
    const soon = hold(r.seat, T, Math.max(Math.tan(own), Math.min(most, (r.wide * (1 + ROOM * shot)) / zoom)), this.soon, m, aspect, most, this.aim, ROOM).tan;
    const n = this.must(r, s, head, ball, this.pts);
    limits(r.seat, null, 1, this.pts, n, aspect, sa, ROOM);
    const A = hold(r.seat, T, soon, this.pts, n, aspect, most, this.aim, ROOM, TOP_AT);
    // eased there: the look on the camera's own time; the width getting up to speed and no faster than WIDEN out, NARROW in
    const k = this.set ? 1 - Math.exp(-real / (r.cam === 'side' ? 170 : 210)) : 1;
    L.x += (A.x - L.x) * k;
    L.y += (A.y - L.y) * k;
    L.z += (A.z - L.z) * k;
    const want = (2 * Math.atan(A.tan) * 180) / Math.PI;
    if (!this.set) [this.fov, this.fv] = [want, 0];
    else {
      const sec = real / 1000;
      const goal = clamp((want - this.fov) / SPEED_UP, -NARROW, WIDEN);
      this.fv += clamp(goal - this.fv, (-WIDEN / SPEED_UP) * sec, (WIDEN / SPEED_UP) * sec);
      this.fov += this.fv * sec;
    }
    this.set = true;
    // and what it must show now is held whatever the easing has left behind, at the picture's edge (a pass on its
    // way to him is the look's to come to, not this)
    const h = this.must(r, s, head, ball, this.pts, 0, false);
    limits(r.seat, L, Math.tan((this.fov * Math.PI) / 360), this.pts, h, aspect, sa, 0);
    hold(r.seat, L, Math.tan((this.fov * Math.PI) / 360), this.pts, h, aspect, most, A);
    [L.x, L.y, L.z] = [A.x, A.y, A.z];
    this.fov = (2 * Math.atan(A.tan) * 180) / Math.PI;
    // (the tight camera and the floor's are held by hand; the board's is bolted on; the others are on heads, an operator's hand on them)
    const hand = r.cam === 'tight' || r.cam === 'floor' ? 1 : r.cam === 'rim' ? 0 : 0.4;
    cam.fov = this.fov;
    cam.position.set(r.seat.x + this.hand(0, 0.1 * hand), r.seat.y + this.hand(1, 0.07 * hand) - this.bump(r.cam === 'rim' ? 0.5 : 0.3), r.seat.z + this.hand(2, 0.1 * hand));
    cam.lookAt(L.x + this.hand(3, 0.05 * hand), L.y + this.hand(4, 0.04 * hand), L.z);
    cam.updateProjectionMatrix();
  }

  /** A camera held by hand: a slow sway and a little tremor, `amt` ft at most (`axis` keeps the axes apart). */
  hand(axis: number, amt: number) {
    const s = this.t / 1000;
    return amt * (wob(s, 1.9 + axis * 0.37, 4.3 + axis * 0.61, axis * 1.7) * 0.8 + wob(s, 0.45 + axis * 0.11, 0.73, axis) * 0.6);
  }

  /** The main camera's operator: he is never quite still on the play, a slow drift of the frame, `amt` ft at most. */
  drift(axis: number, amt: number) {
    const s = this.t / 1000;
    return amt * wob(s, 0.61 + axis * 0.17, 1.13 + axis * 0.23, 2 + axis * 1.3);
  }

  /** The rim taking a dunk, felt in the camera: a quick dip and an eased return, `amt` at its deepest (0 after ~0.4 s). */
  bump(amt: number) {
    const u = this.kicked / 70;
    return u > 7 ? 0 : amt * u * Math.exp(1 - u);
  }
}
