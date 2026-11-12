// The broadcast's director: what the picture does besides following the ball (scene.ts aim() asks it).
//
// An instant replay of a big play (a dunk, a three, an and-one, a block, a shot at the buzzer) at the
// next dead ball: the play's last couple of seconds again, slowed round its moment, from another camera,
// a wipe in and out and a bug in the corner. It is drawn from the possession's own script, posed at a
// time of its own (`pose`), through the same scene, so the figures act it out again and are put back on
// their spots when it ends. The game waits for it: the court has finished the possession and is told so
// only once the replay is over (CourtView holds its onDone), so nothing live is missed and nothing in the
// game changes. Never with reduced motion, at 4x, in key plays or a highlight, or while the game is
// stopped (CourtView and Court3D say when it may).
//
// And the operator's hand on the other cameras: a main camera that is never quite still, a close-up held
// on the shoulder, a bump when the rim takes a dunk.
import type { PerspectiveCamera, Vector3 } from 'three';
import { BASKET, COURT_LEN, toWorld, type Pt, type Script } from '../choreo';
import { pose, type Stage } from '../Court';
import type { V3 } from './puppet';

const MID = COURT_LEN / 2;
const RIM_H = 10;

/** At most one replay in this long (ms of the game being watched), and none of a play older than this. */
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
/** How much of the play it shows: from this long before its moment (and no longer) to this long after, in the script's ms. */
const BACK = 950;
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
/** A body takes the picture this far in front of the lens (ft), and the cut-in's camera stands this far off its man. */
const BERTH = 2.4;
const TIGHT_OFF = 23;
/** The near side's replay camera stands this far along the floor from the man (ft). */
const SIDE_OFF = 18;

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
type ReelCam = 'base' | 'side' | 'tight';
const CAMS: Record<BigKind, ReelCam[]> = {
  winner: ['side', 'tight'],
  buzzer: ['side', 'tight'],
  and1: ['base', 'tight'],
  dunk: ['base', 'tight'],
  three: ['side', 'tight'],
  block: ['base', 'side'],
};

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
  /** How much faster than the ramp it runs, to fit REEL_MOST. */
  rate: number;
  /** Where its camera stands, and the basket the play went at (the scene's feet). */
  seat: V3;
  rim: { x: number; z: number };
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
  // the replay camera: where it looks, how wide, and whether it has a first frame yet
  private readonly look = { x: 0, y: 0, z: 0 };
  private fov = 30;
  private set = false;
  private readonly stage: Stage = { script: null, play: null, standers: [], ball: null };
  // the rim taking a dunk: how long ago (ms)
  private kicked = 1e9;
  /** The play's pace against the bodies' (COURT3D_PACE in CourtView), as the live frames have it: a replay keeps it. */
  private pace = 0.5;

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
   * shown in the last REPLAY_GAP). True: the court is to wait until `released`.
   */
  start(sc: Script | null): boolean {
    const b = this.big;
    if (this.phase !== 'off' || !sc || !b || b.sc !== sc || b.ago > STALE_MS || this.gap < REPLAY_GAP) return false;
    const t1 = Math.min(startOf(sc, sc.frames.length), b.at + (b.kind === 'buzzer' || b.kind === 'winner' ? AFTER_BUZZER : AFTER));
    // it picks the play up where the ball is in a man's hands (so it leaves them as it did), as near BACK before the moment as there is
    const want = b.at - BACK;
    let t0 = -1;
    let best = Infinity;
    for (let j = 1; j <= b.k; j++) {
      const a = sc.frames[j - 1];
      const f = sc.frames[j];
      if (a.hold === undefined || a.hold < 0 || f.fx) continue;
      const s = startOf(sc, j);
      const t = clamp(want, s, s + f.dur - 1);
      if (t > b.at - 300 || t < b.at - BACK_MOST) continue;
      if (Math.abs(t - want) < best) {
        best = Math.abs(t - want);
        t0 = t;
      }
    }
    if (t0 < 0) t0 = Math.max(0, want);
    if (t1 - t0 < 400) return false;
    // (how long it would run on the ramp: a longer stretch is played a little faster)
    let real = 0;
    for (let t = t0; t < t1; real += 16) t += 16 * this.pace * this.slow(t, b.at);
    const cams = CAMS[b.kind];
    const pids = [...sc.oPids, ...sc.dPids];
    const j = pids.indexOf(b.star);
    const fk = sc.frames[b.k];
    const nO = sc.oPids.length;
    const spot = toWorld(j < 0 ? fk.ball : j < nO ? fk.o[j] : fk.d[j - nO], sc.dir);
    const rimPt = toWorld(BASKET, sc.dir);
    const rim = { x: sx(rimPt), z: sz(rimPt) };
    let cam = cams[this.n % cams.length];
    // (low behind the basket only sees a play at it)
    if (cam === 'base' && Math.abs(sx(spot) - rim.x) > 16) cam = 'side';
    this.reel = {
      sc,
      t0,
      t1,
      at: b.at,
      t: t0,
      kind: b.kind,
      star: b.star,
      side: b.side,
      cam,
      rate: Math.max(1, real / REEL_MOST),
      seat: this.seatFor(cam, sc, b.k, sx(spot), sz(spot), rim),
      rim,
    };
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

  /** The play's pace in the replay at `t` (of its 1x pace). */
  private slow(t: number, at: number) {
    return SLOW + (FAST - SLOW) * smooth(clamp(t < at ? (at - t) / RAMP : (t - at) / RAMP_OUT, 0, 1));
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
      const step = (real * this.pace * this.slow(r.t, r.at)) / r.rate;
      const was = r.t;
      r.t = Math.min(r.t1, r.t + step);
      if (r.t >= r.t1) {
        this.phase = 'out';
        this.ms = 0;
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
   * Where a replay's camera stands: past the baseline and low, nearer the camera's side than the man
   * (and clear of the basket's post); on the near side's apron, low, up the floor of the man or (a man in
   * the corner) down it; or low and close on him where nobody stands between.
   */
  private seatFor(cam: ReelCam, sc: Script, k: number, x: number, z: number, rim: { x: number; z: number }): V3 {
    const e = rim.x < 0 ? -1 : 1;
    if (cam === 'base') return { x: e * (MID + 7), y: 3.8, z: clamp(z + 7, 4.5, 24) };
    if (cam === 'side') {
      const up = x + e * SIDE_OFF;
      return { x: Math.abs(up) <= MID + 3 ? up : x - e * (SIDE_OFF + 4), y: 11.5, z: 31 };
    }
    const f = sc.frames[k];
    const others = [...f.o, ...f.d].map((p) => toWorld(p, sc.dir)).filter((p) => Math.hypot(sx(p) - x, sz(p) - z) > 0.5);
    let best = Infinity;
    let seat: V3 = { x, y: 5.2, z: z + TIGHT_OFF };
    for (const turn of [0.35, -0.35, 0.8, -0.8, 0, 1.2, -1.2]) {
      // (from the near side, round toward the basket he went at)
      const a = turn * -e;
      const cx = clamp(x + Math.sin(a) * TIGHT_OFF, -(MID + 8.5), MID + 8.5);
      const cz = clamp(z + Math.cos(a) * TIGHT_OFF, -8, 32);
      const far = Math.hypot(cx - x, cz - z);
      let cost = far < 11 ? 5 : 0;
      for (const p of others) {
        const t = ((sx(p) - x) * (cx - x) + (sz(p) - z) * (cz - z)) / (far * far);
        if (t > 0.04 && t < 1 && Math.hypot(sx(p) - x - (cx - x) * t, sz(p) - z - (cz - z) * t) < BERTH + 4 * t) cost += 1 + 2 * t;
      }
      if (cost < best) {
        best = cost;
        seat = { x: cx, y: 5.2, z: cz };
      }
    }
    return seat;
  }

  /**
   * The replay's camera: low behind the basket on the man and the rim over him, low on the near side on
   * the ball and the rim it is going at, or tight on the man (on the shoulder). `star`: his chest (null: he
   * isn't on the floor).
   */
  aimReel(cam: PerspectiveCamera, star: V3 | null, ball: Vector3, aspect: number, real: number) {
    const r = this.reel!;
    const s = star ?? ball;
    let tx: number;
    let ty: number;
    let tz: number;
    // how much of the scene it keeps top to bottom (ft)
    let span: number;
    if (r.cam === 'base') {
      // (the rim stays in it on the way up; after the moment it lets him have the picture)
      const w = r.t > r.at + 120 ? 0.18 : 0.34;
      tx = s.x + (r.rim.x - s.x) * w;
      ty = Math.max(4.4, s.y + (RIM_H - s.y) * w);
      tz = s.z + (r.rim.z - s.z) * w;
      span = clamp(Math.hypot(s.x - r.rim.x, s.z - r.rim.z) * 0.55 + 10, 11, 24);
    } else if (r.cam === 'side') {
      // (the ball and the rim it is going at, low in the picture: the flight goes over them inside it, not the camera up after it)
      tx = ball.x + (r.rim.x - ball.x) * 0.35;
      ty = clamp(ball.y * 0.35 + 3, 4, 7.5);
      tz = ball.z + (r.rim.z - ball.z) * 0.35;
      span = clamp(Math.max(Math.hypot(ball.x - r.rim.x, ball.z - r.rim.z) * 0.45 + 9, (ball.y - ty) * 2 + 6), 11, 28);
    } else {
      // (on him, his height and a bit; at the rim on his way up, the rim too)
      const w = r.t < r.at + 120 ? clamp(1 - (Math.hypot(s.x - r.rim.x, s.z - r.rim.z) - 4) / 8, 0, 1) * 0.35 : 0;
      tx = s.x + (r.rim.x - s.x) * w;
      ty = Math.max(3.8, s.y + (RIM_H - s.y) * w);
      tz = s.z + (r.rim.z - s.z) * w;
      span = 7.8 + w * 14;
    }
    const k = this.set ? 1 - Math.exp(-real / (r.cam === 'side' ? 170 : 210)) : 1;
    const L = this.look;
    L.x += (tx - L.x) * k;
    L.y += (ty - L.y) * k;
    L.z += (tz - L.z) * k;
    const d = Math.hypot(r.seat.x - L.x, r.seat.y - L.y, r.seat.z - L.z);
    const want = clamp((2 * Math.atan(span / 2 / d) * 180) / Math.PI / Math.min(1, aspect), 9, 48);
    this.fov = this.set ? this.fov + (want - this.fov) * (1 - Math.exp(-real / 300)) : want;
    this.set = true;
    // (the tight camera is held by hand; the others are on heads, an operator's hand on them)
    const hand = r.cam === 'tight' ? 1 : 0.4;
    cam.fov = this.fov;
    cam.position.set(r.seat.x + this.hand(0, 0.1 * hand), r.seat.y + this.hand(1, 0.07 * hand) - this.bump(0.3), r.seat.z + this.hand(2, 0.1 * hand));
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
