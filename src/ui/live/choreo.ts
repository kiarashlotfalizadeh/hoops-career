// Turns an engine possession log into keyframes for the court. The court is a full one: 94 ft
// from baseline to baseline, each team attacking one end (they swap at the half), so the ball has
// to be brought up, a steal runs the other way and a fast break is a run of the floor.
//
// A script's frames are in the offense's own frame of reference: x -25..25 (sideline to sideline),
// y the distance from the baseline it attacks (0..94), its basket at (0, 5.25). `dir` says which
// end of the building that is; `toWorld` turns a point into the court's own coordinates, and
// `standing` reads where a script left everyone, so the next one starts from there (no cut).

import type { PossLog, PossStep } from '../../core/sim/log';
import { madeAtt } from '../../core/format';
import { CLEAR_OUT, SETS } from '../../core/sim/sets';
import { GAME } from '../../core/constants';
import type { LogVoice } from './atmosphere';

/**
 * What a player is doing through a move. The court's 3D figures act it out (court3d/); nothing here is
 * decided there. A shot is two moves: he goes up for it ('jumper', 'floater', 'layup', 'dunk', 'ft':
 * the ball leaves as the move ends), then it's away ('release'); the man on him goes up with him
 * ('contest', 'block') and comes down ('land').
 */
export type Act =
  | 'stand' // waiting: a dead ball, the lane at a free throw, a huddle
  | 'move' // getting somewhere without the ball: spacing, a cut, running the floor
  | 'dribble' // has the ball, on the dribble
  | 'drive' // attacks the basket off the dribble
  | 'hold' // has it in both hands
  | 'inbound' // has it out of bounds, behind the line: over his head, looking for a man
  | 'pass'
  | 'catch'
  | 'screen'
  | 'post'
  | 'jumper'
  | 'floater'
  | 'layup'
  | 'dunk'
  | 'ft'
  | 'release'
  | 'guard' // on the ball, in a stance
  | 'defend' // off the ball
  | 'trap'
  | 'contest'
  | 'block'
  | 'land'
  | 'steal'
  | 'boxout'
  | 'crash' // goes to the glass: after the miss, into the man boxing him out
  | 'rebound'
  | 'tip' // jumps for the opening tip
  | 'celebrate'
  | 'rue';

export interface Pt {
  x: number;
  y: number;
}

export interface Flash {
  text: string;
  kind: 'make' | 'miss' | 'block' | 'to' | 'foul' | 'info';
  x: number;
  y: number;
}

/** The flash a shot clock violation gets (the sound keys on it: live/gameSound.ts). */
export const SHOT_CLOCK = 'Shot clock';

export interface Frame {
  dur: number; // ms to reach this frame from the previous one
  o: Pt[];
  d: Pt[];
  ball: Pt;
  /** A shot's flight into this frame: how high the ball gets, in feet (a layup a couple, a three ten). */
  ballZ?: number;
  flash?: Flash;
  score?: [number, number];
  /** What the court says once this frame is reached ('Holmgren screens for Mitchell'), carried on until the next one says something. */
  cap?: string;
  /** Who has the ball here: an index into [...oPids, ...dPids] (-1: nobody, it's in the air or loose). The court tags him with his name. */
  hold?: number;
  /** A shot landing: the net (a make) or the rim (a miss) reacts. */
  fx?: 'make' | 'miss';
  /** What each player does through the move into this frame: [offense..., defense...]. */
  act: Act[];
  /** A shot going up or away in this move: what the play-by-play's word for it says of how it is made (see Finish). */
  how?: Finish;
  /** A shot from behind the arc, in or not: what the court may say of it while it is in the air (never the flash: that is only a make's). */
  three?: true;
  /** Who shows the ball and brings it back down in this move, a shot fake (an index into [offense..., defense...]). */
  fake?: number;
  /** The ball goes from hand to hand in this move, not thrown: a hand-off, taken out of the big man's hands as the man coming by gets to them. */
  handoff?: true;
  /**
   * One man's body goes into another's in this move, [who, into whom, how hard 0..1] (indices into [offense...,
   * defense...]): a driver's shoulder into the man on him, the foul a whistle is for. The 3D figures brace, take it
   * and recover, if they are near enough to have touched.
   */
  hit?: [number, number, number];
  /** Where each faces as he gets here, [offense..., defense...]: a heading in the offense's frame (radians, atan2(y, x)); `faceWorld` turns it. */
  face: number[];
  /** A blocked shot: who got a hand to it (an index into [offense..., defense...]). */
  swat?: number;
  /** A whistle: who it was on (an index into [offense..., defense...]), for the 3D figures to react. */
  foul?: number;
  /**
   * Who meets whom body to body as the play gets here, two indices into [offense..., defense...]: a screener and
   * the man guarding the one he screens for, a man boxing out and the man he holds off. The 3D court draws them
   * touching (the 2D court leaves them where they are).
   */
  meet?: [number, number][];
}

export interface Script {
  off: 0 | 1;
  oPids: number[];
  dPids: number[];
  frames: Frame[];
  label: string;
  clockStart: number;
  clockEnd: number;
  q: number;
  /** The end the offense attacks: 1 the basket at the court's y = 0 end, -1 the other one. */
  dir: 1 | -1;
  /** The possession's big moment, if it had one: a shot at the buzzer, or one that won the game with it. */
  moment?: 'buzzer' | 'winner';
}

/** Baseline to baseline, and sideline to sideline, in feet. */
export const COURT_LEN = 94;
export const COURT_WID = 50;
/** The basket, in the frame of the team attacking it. */
export const BASKET: Pt = { x: 0, y: 5.25 };

/** Which end a side attacks in a period: the home team goes at the y = 0 end in the first half, and they swap for the second (overtime stays). */
export function attackDir(side: 0 | 1, q: number): 1 | -1 {
  return (side === 0) !== q >= 3 ? 1 : -1;
}

/** A point in an offense's frame, on the court itself (and back: the turn is its own inverse). */
export function toWorld(p: Pt, dir: 1 | -1): Pt {
  return dir === 1 ? { x: p.x, y: p.y } : { x: -p.x, y: COURT_LEN - p.y };
}

/** A heading in an offense's frame, on the court itself (the far end's is turned half round). */
export function faceWorld(a: number, dir: 1 | -1): number {
  return dir === 1 ? a : a + Math.PI;
}

/**
 * What makes a named shot that shot, where its name says so: the 3D figures make it that way and no other (a shot
 * with no such word is a plain one of its kind: a jumper doesn't fade unless the play-by-play said it did).
 *  - 'oop': caught in the air off a lob and put down;   'two': a dunk with both hands
 *  - 'hook': one arm over the top, side on to the rim;   'runner': a floater on the move
 *  - 'tip': tipped back up at the top of his jump for the board;   'putback': down with it and straight back up
 *  - 'under': a fake, then a step under the man who went up for it;   'step': a long step across (a drop step)
 *  - 'reverse': under the rim and back over his head;   'roll': rolled off the fingers, the arm out long
 *  - 'fade': going away from the rim;   'turn': from his back to it;   'stepBack': a step back off the dribble
 *  - 'pullUp': straight up off the dribble;   'set': off the catch
 */
export type Finish = 'oop' | 'two' | 'hook' | 'runner' | 'tip' | 'putback' | 'under' | 'step' | 'reverse' | 'roll' | 'fade' | 'turn' | 'stepBack' | 'pullUp' | 'set';
const FINISHES: [RegExp, Finish][] = [
  [/alley-oop/, 'oop'],
  [/two-handed/, 'two'],
  [/hook/, 'hook'],
  [/tip-in/, 'tip'],
  [/putback(?! dunk)/, 'putback'],
  [/up-and-under/, 'under'],
  [/drop-step/, 'step'],
  [/reverse/, 'reverse'],
  [/finger roll/, 'roll'],
  [/step-back/, 'stepBack'],
  [/turnaround/, 'turn'],
  [/fadeaway/, 'fade'],
  [/pull-up/, 'pullUp'],
  [/floater|runner/, 'runner'],
  [/catch-and-shoot/, 'set'],
];
export function finishOf(d: string | undefined): Finish | undefined {
  return d ? FINISHES.find(([re]) => re.test(d))?.[1] : undefined;
}

/** How a shot is taken, from its zone and the play-by-play's word for it. */
function shotAct(st: PossStep): Act {
  const d = st.d ?? '';
  if (/dunk|alley-oop/.test(d)) return 'dunk';
  // (a hook is a hook wherever it is from: at the rim too)
  if (/hook/.test(d)) return 'floater';
  if (st.zone === 'rim' || /layup|finger roll|putback|tip-in|up-and-under/.test(d)) return 'layup';
  if (/floater|runner/.test(d)) return 'floater';
  return 'jumper';
}

/** Where everyone and the ball stand, on the court itself. */
export interface Standing {
  at: Map<number, Pt>;
  ball: Pt;
}

const NO_WAY: Pt = { x: 0, y: 0 };

/**
 * The velocity (ft a ms) each player carries through each keyframe ([frame][offense..., defense...]), so a run
 * through several frames is one smooth move instead of a stop at each: the court draws his path through them as a
 * cubic Hermite (Court.tsx). He stops at a frame where he stands still on either side of it or turns back; a turn
 * slows him, and he's never faster through a frame than on the slower of the moves either side of it (no overshoot).
 */
export function tangents(f: readonly Frame[], nO: number): Pt[][] {
  const at = (i: number, j: number) => (j < nO ? f[i].o[j] : f[i].d[j - nO]);
  const n = f[0] ? f[0].o.length + f[0].d.length : 0;
  return f.map((_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === 0 || i === f.length - 1) return NO_WAY;
      const dtA = f[i].dur;
      const dtB = f[i + 1].dur;
      const p0 = at(i - 1, j);
      const p1 = at(i, j);
      const p2 = at(i + 1, j);
      if (!dtA || !dtB || !p0 || !p1 || !p2) return NO_WAY;
      const ax = p1.x - p0.x;
      const ay = p1.y - p0.y;
      const bx = p2.x - p1.x;
      const by = p2.y - p1.y;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la < 0.05 || lb < 0.05) return NO_WAY;
      const cos = (ax * bx + ay * by) / (la * lb);
      if (cos <= 0) return NO_WAY;
      const m = { x: (ax / dtA + bx / dtB) / 2, y: (ay / dtA + by / dtB) / 2 };
      const lm = Math.hypot(m.x, m.y) || 1;
      const cap = Math.min(la / dtA, lb / dtB) * cos;
      return { x: (m.x / lm) * cap, y: (m.y / lm) * cap };
    }),
  );
}

/**
 * No man is asked to go faster than a man can (see TOP). A keyframe says where each man is to be, and its `dur`
 * is set by what the play needs (and PACE); this goes through a finished script twice:
 *  - a man with nothing to do but get somewhere (LAGS: not on the ball, not about to have it, not meeting a man
 *    body to body) goes no farther in a move than his legs take him: as fast as he was going, plus what he
 *    gathers, up to RUN. He makes up the rest in the moves after (a defense getting back trails the ball up the
 *    floor), running and facing the way he goes while he does;
 *  - then each move lasts long enough that nobody's path through it, as the court draws it (tangents), is faster
 *    than TOP anywhere: a man who has to be somewhere (the ball, a screen) takes as long as his legs need.
 * What is changed is changed in place.
 */
function paced(frames: Frame[], nO: number) {
  if (frames.length < 2) return;
  const n = frames[0].o.length + frames[0].d.length;
  const at = (i: number, j: number) => (j < nO ? frames[i].o[j] : frames[i].d[j - nO]);
  const put = (i: number, j: number, p: Pt) => {
    if (j < nO) frames[i].o[j] = p;
    else frames[i].d[j - nO] = p;
  };
  // where each man is (after falling behind), where the plan had him, and how fast he went into it (ft a ms)
  const now = Array.from({ length: n }, (_, j) => ({ ...at(0, j) }));
  const plan = now.map((p) => ({ ...p }));
  const went = new Float64Array(n);
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    const next = frames[i + 1];
    const want = Array.from({ length: n }, (_, j) => at(i, j));
    const to = want.map((w, j) => {
      const far = dist(w, now[j]);
      const most = f.dur * Math.min(RUN, went[j] + GAIN * f.dur);
      const free = f.dur > 0 && LAGS.has(f.act[j]) && f.hold !== j && next?.hold !== j && !f.meet?.some((m) => m.includes(j));
      return free && far > most ? { x: now[j].x + ((w.x - now[j].x) * most) / far, y: now[j].y + ((w.y - now[j].y) * most) / far } : w;
    });
    // (never closer to another man than the plan has anyone: one who would be stops short of it on his way, or, if
    // nowhere on it is clear, is where the plan has him after all)
    const clear = (k: number, p: Pt) => to.every((q, j) => j === k || dist(p, q) >= APART);
    for (let again = true, rounds = 0; again && rounds < 4 * n; rounds++) {
      again = false;
      for (let k = 0; k < n; k++) {
        if (to[k] === want[k] || clear(k, to[k])) continue;
        const far = dist(want[k], now[k]);
        const got = dist(to[k], now[k]);
        let spot: Pt = want[k];
        for (const u of SHORT) {
          const p = { x: now[k].x + ((want[k].x - now[k].x) * got * u) / far, y: now[k].y + ((want[k].y - now[k].y) * got * u) / far };
          if (clear(k, p)) {
            spot = p;
            break;
          }
        }
        to[k] = spot;
        again = true;
      }
    }
    for (let j = 0; j < n; j++) {
      const was = now[j];
      const run = dist(to[j], was);
      if (to[j] !== want[j] || dist(was, plan[j]) > 0.05) {
        // (behind the plan, or catching up on it: he runs, and faces the way he goes)
        if (to[j] !== want[j]) put(i, j, to[j]);
        if (f.act[j] === 'move' || run > (j < nO ? 1.5 : 12)) f.act[j] = 'move';
        if (f.act[j] === 'move' && run > 2) f.face[j] = Math.atan2(to[j].y - was.y, to[j].x - was.x);
      }
      plan[j] = { ...want[j] };
      went[j] = f.dur > 0 ? run / f.dur : 0;
      now[j] = { ...to[j] };
    }
  }
  // each move as long as its fastest path needs (a longer move slows the paths either side of it too: again, until none is too fast)
  for (let pass = 0; pass < 8; pass++) {
    const m = tangents(frames, nO);
    let slowed = false;
    for (let i = 1; i < frames.length; i++) {
      const dt = frames[i].dur;
      if (!dt) continue;
      let peak = 0;
      for (let j = 0; j < n; j++) {
        const a = at(i - 1, j);
        const b = at(i, j);
        const ma = m[i - 1][j];
        const mb = m[i][j];
        // (the Hermite's speed along the way: its pull from a to b, and the velocities it leaves and arrives with)
        for (let k = 0; k <= 10; k++) {
          const u = k / 10;
          const g = (6 * u * (1 - u)) / dt;
          const h0 = 3 * u * u - 4 * u + 1;
          const h1 = 3 * u * u - 2 * u;
          peak = Math.max(peak, Math.hypot(g * (b.x - a.x) + h0 * ma.x + h1 * mb.x, g * (b.y - a.y) + h0 * ma.y + h1 * mb.y));
        }
      }
      if (peak > TOP * 1.005) {
        frames[i].dur = Math.ceil(dt * Math.min(3, peak / TOP));
        slowed = true;
      }
    }
    if (!slowed) break;
  }
}

/** Where a script leaves the ten players and the ball: the next possession picks up from here. */
export function standing(script: Script): Standing {
  const f = script.frames[script.frames.length - 1];
  const at = new Map<number, Pt>();
  script.oPids.forEach((pid, i) => at.set(pid, toWorld(f.o[i], script.dir)));
  script.dPids.forEach((pid, i) => at.set(pid, toWorld(f.d[i], script.dir)));
  return { at, ball: toWorld(f.ball, script.dir) };
}

/**
 * Both fives round the centre circle for the opening tip (the court itself, as Court.tsx stands them while it
 * waits): the two jumpers in it, each team on the side it defends, the home team's first.
 */
export function tipSpots([home, away]: [number[], number[]]): Map<number, Pt> {
  const mid = COURT_LEN / 2;
  const ring: Pt[] = [
    { x: 0, y: 1.7 },
    { x: -8.5, y: 3.5 },
    { x: 8.5, y: 3.5 },
    { x: -5, y: 12 },
    { x: 5, y: 12 },
  ];
  const at = new Map<number, Pt>();
  const five = (pids: number[], sign: 1 | -1) => [...pids].reverse().forEach((pid, i) => at.set(pid, { x: ring[i % 5].x, y: mid + sign * ring[i % 5].y }));
  five(home, 1);
  five(away, -1);
  return at;
}

/** How the captions say a ball-screen coverage: 'they drop', 'they switch'. */
const COVER_VERB: Record<string, string> = { drop: 'drop', switch: 'switch', hedge: 'hedge', blitz: 'blitz him', ice: 'ice it' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Two players are never drawn closer than this (a player is a 1.45 ft disc): a crowd at the rim spreads into a ring. */
const APART = 2.92;
/**
 * A hand-off: the man it is for goes by the big this far off him (ft, middle to middle) as it changes hands, on a run
 * this long through the hand-off's move (ft), the ball changing hands 0.3 of the way along it (the 3D court's
 * HANDOFF_AT). Either end of the run is APART off the big.
 */
const HANDOFF_BY = 2.3;
const HANDOFF_RUN = 6.2;
/** The gap the man on the ball gives him (ft): in the post, and out on the floor. */
const ON_BALL: [number, number] = [2.92, 4];
/** A jump shot is contested from this far (ft): a hand up at the ball, not a chest in the shooter's. */
const CONTEST = 3.7;
/** Help off the ball as a man drives or a big rolls: the nearest defender steps into his way this far at most (ft, and this share of the way), the others a step toward it. */
const STUNT = 5;
const SINK = 2;
/** A shot is up: an offensive player this near the rim (ft) may go to the glass (the two nearest do), this far in (ft) and never nearer the rim than CRASH_TO; the rest start back. */
const CRASH_FROM = 21;
const CRASH = 4.5;
const CRASH_TO = 6.5;
const GET_BACK = 3.5;
/** A rebound comes off the rim the way of the man who gets it: he steps in this far (ft) toward it, and takes it no nearer the rim than REB_NEAR, no farther than REB_FAR. */
const REB_STEP = 2.5;
const REB_NEAR = 4;
const REB_FAR = 15;
/** A man catching a pass at his spot steps to it, this far (ft). */
const MEET = 1.3;
/**
 * A jump shot goes up from where he stands: a shooter farther than SHOT_SET ft from the spot he shoots from gets
 * there first, in a move of SHOT_GO ms or as long as his legs need (see paced): on the dribble, or, catching and
 * shooting, before the pass is thrown to him there.
 */
const SHOT_SET = 2;
const SHOT_GO = 320;
/** How hard a driver's shoulder goes into the man on him, a man fouling a shooter into him, and a foul on the floor (0..1: see Frame.hit); a man this far from the one he fouls (ft) or nearer gets to him. */
const DRIVE_BUMP = 0.35;
const SHOT_BUMP = 0.6;
const FOUL_BUMP = 0.7;
const FOUL_REACH = 9;
/** An alley-oop's lob is in the air this long (ms): he goes up under it and takes it at the top. A shot fake takes this long. */
const LOB_MS = 460;
const FAKE_MS = 300;
/** The opening tip: the ball is in the air this long before the jumpers get a hand to it, and the tap takes this long to come down (ms). */
const TIP_UP = 280;
const TIP_TAP = 210;
/** Where the man who throws it in after a basket stands: this far behind the baseline (ft), and for this long with it (ms). */
const OUT = 1.6;
const INBOUND_MS = 420;
/**
 * While the ball is thrown in after a basket, the men with no part in that go up the floor at a jog (ft a ms of the
 * play), no farther than this (ft from the basket they are going to: a step over half court).
 */
const LEAK = 0.024;
/** Coming up the floor in two moves, a man without the ball is this much of the way across to his own spot's side of it by the end of the first. */
const LANE = 0.72;
const LEAK_TO = 44;
/** A shot from nearer the rim than this (ft), a layup or a dunk is contested from beside the rim, this far from it. */
const RIM_NEAR = 3.5;
const BESIDE = 3.2;
/** Where a dunker hangs from the rim (puppet.ts: this far from it, the way he came tipped this much up the floor), and how far from where he lands everyone else is kept (ft). */
const DUNK_OFF = 2;
const DUNK_OPEN = 1.5;
const LAND = 3.1;
/** A putback goes up out of the crowd that went for the board: they give him this much (ft) to come down in, not LAND (they were on him as he landed, and through his first steps after). */
const LAND_PUT = 4.3;
/** The quickest anyone crosses the floor, in feet a millisecond at 1× (a broadcast's pace, not a stopwatch's). */
const PACE = 0.085;
/**
 * A man's legs, on the play's clock (ft a ms, and ft a ms squared). The 3D court plays the play at half a body's
 * time (CourtView's COURT3D_PACE), so the play's 1× is a man's 2×: TOP is a sprint's 27 ft a second, never
 * passed anywhere on his path (see paced); RUN the most a man who is only getting somewhere goes on a stretch of it,
 * a beat under that, his path's swing through a keyframe making up the rest; GAIN how fast he gets up to it, about
 * 20 ft a second squared of his own time.
 */
const TOP = 0.054;
const RUN = 0.043;
const GAIN = 0.00008;
/** A man fallen behind who would be on top of another stops this much of the way short instead, the first that is clear. */
const SHORT = [0.85, 0.7, 0.55, 0.4, 0.25];
/** What a man may be doing and fall behind the plan: running somewhere, guarding, standing about. */
const LAGS = new Set<Act>(['move', 'defend', 'guard', 'stand']);

interface PInfo {
  pid: number;
  hgt: number;
  shoot: number;
  handle: number;
}

/** A half-court offense's spots: the handler up top, shooters in the corners and on the wings, the big at the elbow or the block. */
function baseSpots(players: PInfo[], handler: number): Map<number, Pt> {
  const spots = new Map<number, Pt>();
  const rest = players.filter((p) => p.pid !== handler);
  const big = [...rest].sort((a, b) => b.hgt - a.hgt)[0];
  spots.set(handler, { x: 0, y: 29 });
  const wings = rest.filter((p) => p !== big).sort((a, b) => b.shoot - a.shoot);
  const slots: Pt[] = [
    { x: 21.5, y: 4 },
    { x: -16.5, y: 22 },
    { x: 16.5, y: 22 },
    { x: -21.5, y: 4 },
  ];
  wings.forEach((p, i) => spots.set(p.pid, slots[i] ?? { x: 0, y: 20 }));
  if (big) spots.set(big.pid, big.shoot > 55 ? { x: -8, y: 24 } : { x: -6.5, y: 7 });
  return spots;
}

/** A man-to-man defender: between his man and the basket, tight on the ball, sagging off it with the help setting. */
function guardSpot(o: Pt, onBall: boolean, help: number): Pt {
  const k = onBall ? 0.12 : 0.22 + (help / 100) * 0.18;
  const d = dist(BASKET, o);
  // a step off him at least, so a man near the basket isn't drawn under his defender
  // (the man on the ball has a gap of his own: an arm's length and a step out on the floor, body to body in the post)
  const least = onBall ? ON_BALL[0] + (ON_BALL[1] - ON_BALL[0]) * clamp((d - 8) / 10, 0, 1) : 2;
  const gap = d > 0.5 ? Math.max(k * d, least) / d : 0;
  return gap ? { x: o.x + (BASKET.x - o.x) * gap, y: o.y + (BASKET.y - o.y) * gap } : { x: o.x, y: o.y - 2 };
}

const ZONE23: Pt[] = [
  { x: -7, y: 18 },
  { x: 7, y: 18 },
  { x: -12, y: 7 },
  { x: 12, y: 7 },
  { x: 0, y: 7 },
];
// three across the top, two on the blocks
const ZONE32: Pt[] = [
  { x: -12, y: 20 },
  { x: 0, y: 23 },
  { x: 12, y: 20 },
  { x: -7, y: 8 },
  { x: 7, y: 8 },
];
// the junk defenses' zones behind their chasers: a 2-2 box (box-and-one), a triangle with its point
// at the free-throw line and its base on the blocks (triangle-and-two)
const BOX: Pt[] = [
  { x: -8, y: 17 },
  { x: 8, y: 17 },
  { x: -4.5, y: 9 },
  { x: 4.5, y: 9 },
];
const TRIANGLE: Pt[] = [
  { x: 0, y: 18 },
  { x: -4.5, y: 9 },
  { x: 4.5, y: 9 },
];

/**
 * A zone moves with the ball. Each of its men slides across the floor a share of how far off the middle the ball is,
 * and out or in a share of how far out it is past the free-throw line (the front line more than the back: across,
 * then out); the men on the side away from the ball give up this much of their own side for the lane; and the one of
 * them nearest the ball, if it is within ZONE_OUT of his spot, goes out to it. A zone that stood on its marks while
 * the ball went round it was five men guarding paint.
 */
const ZONE_FRONT: [number, number] = [0.34, 0.2];
const ZONE_BACK: [number, number] = [0.22, 0.1];
const ZONE_PINCH = 0.22;
const ZONE_OUT = 13;
/**
 * A junk defense's box or triangle is behind its chasers: it shifts this much of what a zone does, and its nearest man
 * goes out to a ball that nobody is chasing from this far, once the ball is below the top of the key (JUNK_UNDER:
 * out past it, the box stays round the paint).
 */
const JUNK_SHIFT = 0.5;
const JUNK_OUT = 16;
const JUNK_UNDER = 26;
function zoneSpots(slots: readonly Pt[], front: number, at: Pt, much = 1): Pt[] {
  // (a ball still coming up the floor: the zone is set as for one at the top of it)
  const b = { x: clamp(at.x, -24, 24), y: clamp(at.y, BASKET.y, 32) };
  return slots.map((p, i) => {
    const [kx, ky] = i < front ? ZONE_FRONT : ZONE_BACK;
    const weak = p.x * b.x < 0 ? ZONE_PINCH * Math.min(1, Math.abs(b.x) / 14) * much : 0;
    return { x: clamp(p.x * (1 - weak) + kx * much * b.x, -22, 22), y: clamp(p.y + ky * much * (b.y - 19), BASKET.y + 1.2, 30) };
  });
}

/** A point `ft` from `a` toward `b` (`b` itself, if it is nearer than that). */
function toward(a: Pt, b: Pt, ft: number): Pt {
  const far = dist(a, b);
  return far <= ft || far < 0.01 ? { ...b } : { x: a.x + ((b.x - a.x) * ft) / far, y: a.y + ((b.y - a.y) * ft) / far };
}

/**
 * A man `ft` along the arc he is on about the basket from where he stands: up it toward the top of the floor
 * (`ft` over 0: he lifts), or down it toward the corner on his own side (under 0: he drifts). No farther than the
 * top, or a step in from the baseline.
 */
function alongArc(p: Pt, ft: number): Pt {
  const r = dist(p, BASKET);
  if (r < 1) return { ...p };
  const side = p.x >= 0 ? 1 : -1;
  // (his angle from the baseline on his own side: 0 in the corner, a quarter turn at the top)
  const a = clamp(Math.atan2(p.y - BASKET.y, Math.abs(p.x - BASKET.x)) + ft / r, Math.asin(clamp((3 - BASKET.y) / r, -1, 1)), Math.PI / 2);
  return { x: BASKET.x + side * Math.cos(a) * r, y: BASKET.y + Math.sin(a) * r };
}

/** A man `ft` round the arc he is on about the basket, the way that takes him from `from` (the ball): across the top of the floor if that is the way, no farther than a step in from either baseline. */
function awayOnArc(p: Pt, from: Pt, ft: number): Pt {
  const r = dist(p, BASKET);
  if (r < 1) return { ...p };
  const low = Math.asin(clamp((3 - BASKET.y) / r, -1, 1));
  const a = Math.atan2(p.y - BASKET.y, p.x - BASKET.x);
  const b = Math.atan2(from.y - BASKET.y, from.x - BASKET.x);
  // (the ball straight over or under him: toward the top, where there is room)
  const way = Math.abs(a - b) > 0.05 ? Math.sign(a - b) : a < Math.PI / 2 ? 1 : -1;
  const to = clamp(a + (way * ft) / r, low, Math.PI - low);
  return { x: BASKET.x + Math.cos(to) * r, y: BASKET.y + Math.sin(to) * r };
}

/**
 * A ball screen, as each coverage plays it (ft, in the screen's own frame: `s` the side it is set on, down the floor
 * toward the basket). The screener sets it SCREEN_AT off the handler, on his man's hip. The handler comes off it
 * over the top (USE), then turns the corner downhill (TURN) while the screener rolls to ROLL_Y. What the two
 * defenders do with that is the coverage:
 *  - drop: the big sinks DROP ft under the ball, between it and the rim; the guard goes over and trails (TRAIL);
 *  - hedge: the big jumps out into the handler's way a beat (SHOW) and strings him out (STRUNG), then gets back;
 *  - blitz: both go at the ball (TRAP_OFF each side of it) and he backs out of it (BACK_OUT); the roller stops
 *    short (SHORT_ROLL_Y) and the weak side's nearest man takes him;
 *  - ice: the guard jumps to the screen's side of the ball (ICE_ON) and sends it down the sideline away from the
 *    screen (ICED, then ICED_ON), where the big is waiting (ICE_WALL under the ball);
 *  - switch: the big takes the ball, the guard the roller, and they keep them for the rest of the possession.
 */
const SCREEN_AT: [number, number] = [2.8, -2.9];
const SCREEN_ICE: [number, number] = [3.6, -2.2];
const USE: [number, number] = [5.4, -0.6];
const TURN: [number, number] = [6, -6];
const ROLL_Y = 12;
const DROP = 9;
const TRAIL: [number, number] = [-3.1, 0.3];
const SHOW: [number, number] = [8, -1.8];
const STRUNG: [number, number] = [5, 1];
const SLOWED: [number, number] = [6.5, -4];
const TRAP_OFF: [number, number] = [2.3, -1.9];
const TRAPPED: [number, number] = [4.2, 1.2];
const BACK_OUT: [number, number] = [3.5, 3.5];
const SHORT_ROLL_Y = 17;
const ICE_ON: [number, number] = [2.4, 1.9];
const ICED: [number, number] = [-3.5, -3.5];
const ICED_ON: [number, number] = [-5, -8];
const ICE_WALL = 7;
/** A man coming off a screen away from the ball: the man guarding him is caught on it, and trails him by this (ft). */
const CHASE = 3.2;
/**
 * Off the ball, as a teammate goes to work (ft): the man nearest the spot a driver left fills this much of the way
 * to it (FILL of it, FILL_MOST at the most); a man on a wing drifts DRIFT down the arc toward his corner, and one
 * in a corner the drive is coming at lifts LIFT up it; a big by the lane on the driver's side goes to the far
 * block (DUNKER). A man who has just passed slides SPACE along the arc away from the ball.
 */
const FILL = 0.6;
const FILL_MOST = 9;
/** A man goes this far at the most (ft) in one move toward where his shot is coming: the rest when the pass is on its way. */
const AHEAD_MOST = 12;
const DRIFT = 3.5;
const LIFT = 5;
const SPACE = 3.5;
const DUNKER: Pt = { x: 6.5, y: 6.5 };

/** The sets whose man starts from a place of the set's own, not from his spot in the offense (see setUp). */
const FORMED: ReadonlySet<string> = new Set(['floppy', 'elevator', 'chicago']);

/** A chaser face-guarding his man off the ball: between him and the ball, a step off him. */
function chaseSpot(o: Pt, ball: Pt): Pt {
  const dx = ball.x - o.x;
  const dy = ball.y - o.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: o.x + (dx / d) * 2.2, y: o.y + (dy / d) * 2.2 };
}

/** How long the shooter stands at the line with the ball before it goes up (ms). */
const FT_SET = 900;
// free throws: the defense takes the spots nearest the basket and the top ones, the shooter's
// teammates the middle ones, one defender stays back for the break
const FT_OFF: Pt[] = [
  { x: -9.5, y: 11 },
  { x: 9.5, y: 11 },
  { x: -16, y: 28 },
  { x: 16, y: 28 },
];
const FT_DEF: Pt[] = [
  { x: -9.5, y: 7.5 },
  { x: 9.5, y: 7.5 },
  { x: -9.5, y: 14.5 },
  { x: 9.5, y: 14.5 },
  { x: 0, y: 32 },
];

/**
 * Keyframes for one possession.
 *
 * `before` is the score it started from: its log keeps only the score it ended on and its own points,
 * which leave out a technical free throw, so working back from those is only right when no technical
 * was made. `teams` are the [home, away] abbreviations, to say whose timeout it is. `name` names the
 * players in the captions (without it the court shows the play's label throughout). `voice` is the
 * night's calls for the possession's steps (see atmosphere.ts): a made basket, a block or a steal is
 * captioned in its words, the same the play-by-play gets.
 *
 * `from` is where the possession before left everyone (`standing`): the players start there and
 * run the floor. Without it (the opening tip, a highlight, after a break) the court cuts to the
 * offense coming over half court.
 */
/** A number in 0..1 from two others, the same for the same two (no Math.random: a possession drawn twice is drawn the same). */
function jitter(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function buildScript(
  log: PossLog,
  info: (pid: number) => PInfo,
  before?: [number, number],
  teams?: [string, string],
  name?: (pid: number) => string,
  voice?: LogVoice,
  from?: Standing,
): Script {
  const off = log.off;
  const dir = attackDir(off, log.q);
  const oPids = log.on[off];
  const dPids = log.on[1 - off];
  const oInfo = oPids.map(info);
  const steps = log.steps;
  // the game's first possession opens with the tip: both fives start round the centre circle (see `tip`)
  const tipped = !from && log.q === 1 && log.clockStart >= GAME.quarterSec - 0.5 && oPids.length === 5 && dPids.length === 5;
  const start = from ?? (tipped ? { at: tipSpots(log.on), ball: { x: 0, y: COURT_LEN / 2 } } : undefined);
  const first = steps.find((s) => s.pid !== undefined && oPids.includes(s.pid));
  let holder = first?.pid ?? oPids[0];
  /** The man who throws the lob for the alley-oop that comes next (its pass is made in the shot's move). */
  let lobFrom: number | undefined;
  const spots = baseSpots(oInfo, holder);
  const guardOf = new Map<number, number>(Object.entries(log.guards).map(([o, d]) => [Number(o), d]));
  const manOf = new Map<number, number>([...guardOf].map(([o, d]) => [d, o]));
  const zone = log.scheme === 'zone32' ? ZONE32 : log.scheme === 'zone23' ? ZONE23 : null;
  // a junk defense: its chasers stay with their men, the others hold the box or triangle
  const junk = log.scheme === 'box1' ? BOX : log.scheme === 'tri2' ? TRIANGLE : null;
  /** How many of a zone's spots are its front line (zoneSpots: they slide farther). */
  const front = log.scheme === 'zone32' ? 3 : log.scheme === 'tri2' ? 1 : 2;
  const chasers = new Map<number, number>();
  if (junk) for (const c of log.chase ?? []) if (guardOf.has(c)) chasers.set(guardOf.get(c)!, c);
  const zoneSlot = new Map<number, number>();
  if (junk) dPids.filter((pid) => !chasers.has(pid)).forEach((pid, i) => zoneSlot.set(pid, i));

  // where everyone is now
  const o = new Map<number, Pt>();
  const d = new Map<number, Pt>();
  let ball: Pt;
  /**
   * Where the defense is, with the ball where it is now: each man on his own (man to man: guardOf, which a switch
   * changes), or a zone's spots as they have slid to the ball, its nearest man out on it; a junk defense's chasers
   * with their men and the rest in their box or triangle, which shifts a little and stays where it is.
   */
  const defense = (): Pt[] => {
    const hp = o.get(holder) ?? ball;
    if (zone) {
      const at = zoneSpots(zone, front, hp);
      // (the one nearest the ball goes out to it, once it is in their half)
      let out = -1;
      if (hp.y < 36) at.forEach((p, i) => (out = dist(p, hp) < (out < 0 ? ZONE_OUT : dist(at[out], hp)) ? i : out));
      if (out >= 0) at[out] = guardSpot(hp, true, log.help);
      return dPids.map((_, i) => at[i] ?? { x: 0, y: 10 });
    }
    const held = junk ? zoneSpots(junk, front, hp, JUNK_SHIFT) : null;
    if (held && hp.y < JUNK_UNDER && ![...chasers.values()].includes(holder)) {
      let out = -1;
      held.forEach((p, i) => (out = dist(p, hp) < (out < 0 ? JUNK_OUT : dist(held[out], hp)) ? i : out));
      if (out >= 0) held[out] = guardSpot(hp, true, log.help);
    }
    return dPids.map((dpid) => {
      const man = held ? chasers.get(dpid) : manOf.get(dpid);
      const op = man !== undefined ? o.get(man) : undefined;
      if (held) return op ? (man === holder ? guardSpot(op, true, log.help) : chaseSpot(op, hp)) : (held[zoneSlot.get(dpid) ?? 0] ?? { x: 0, y: 10 });
      return op ? guardSpot(op, man === holder, log.help) : { x: 0, y: 12 };
    });
  };
  /** Carried on from the last possession: the players run the floor from where they stood. */
  const live = !!start;
  if (start) {
    // (a man just checked in comes on at the scorer's table, at half court)
    let subs = 0;
    const begin = (pid: number): Pt => {
      const w = start.at.get(pid);
      return w ? toWorld(w, dir) : { x: -24 * dir, y: COURT_LEN / 2 + (subs++ - 1) * 3.2 };
    };
    oPids.forEach((pid) => o.set(pid, begin(pid)));
    dPids.forEach((pid) => d.set(pid, begin(pid)));
    ball = toWorld(start.ball, dir);
  } else {
    oPids.forEach((pid) => {
      const s = spots.get(pid)!;
      o.set(pid, { x: s.x * 0.6, y: clamp(s.y + 16, 0, log.kind === 'transition' ? 44 : 42) });
    });
    ball = { ...o.get(holder)! };
    defense().forEach((p, i) => d.set(dPids[i], { x: p.x, y: p.y + 6 }));
  }

  const frames: Frame[] = [];
  // who has the ball: whoever stands where it is (nobody while it's in the air or at the rim)
  const holding = (): number => {
    const at = (p: Pt | undefined) => !!p && Math.abs(p.x - ball.x) < 0.01 && Math.abs(p.y - ball.y) < 0.01;
    const i = oPids.findIndex((p) => at(o.get(p)));
    if (i >= 0) return i;
    const j = dPids.findIndex((p) => at(d.get(p)));
    return j >= 0 ? oPids.length + j : -1;
  };
  /** Who is out of bounds with the ball (throwing it in): the one man not kept inside the lines. */
  const outside = new Set<number>();
  /** Nobody stands on anybody: players too close step apart (the man with the ball keeps his spot). */
  const spread = (keep: number) => {
    const all = [...oPids.map((p) => o.get(p)!), ...dPids.map((p) => d.get(p)!)];
    const who = [...oPids, ...dPids];
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i];
          const b = all[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let gap = Math.hypot(dx, dy);
          if (gap >= APART) continue;
          // (one on top of the other: apart along the sideline, by their order, so it's the same every time)
          if (gap < 0.01) [dx, dy, gap] = [1, 0, 1];
          const push = APART - gap;
          const wa = i === keep ? 0 : j === keep ? 1 : 0.5;
          a.x -= (dx / gap) * push * wa;
          a.y -= (dy / gap) * push * wa;
          b.x += (dx / gap) * push * (1 - wa);
          b.y += (dy / gap) * push * (1 - wa);
          moved = true;
        }
      }
      all.forEach((p, i) => {
        p.x = clamp(p.x, -24.5, 24.5);
        p.y = clamp(p.y, 0.5, outside.has(who[i]) ? COURT_LEN + OUT : COURT_LEN - 0.5);
      });
      if (!moved) break;
    }
  };
  let lastO = oPids.map((p) => ({ ...o.get(p)! }));
  let lastD = dPids.map((p) => ({ ...d.get(p)! }));
  // what the next keyframe says a player is doing and where he looks, when a step has something to say
  // (the rest follows from who has the ball and who is guarding whom)
  const doing = new Map<number, Act>();
  const looks = new Map<number, Pt>();
  const does = (pid: number | undefined, act: Act, look?: Pt) => {
    if (pid === undefined) return;
    doing.set(pid, act);
    if (look) looks.set(pid, { ...look });
  };
  const all = [...oPids, ...dPids];
  const nO = oPids.length;
  let lastFace: number[] = all.map((_, j) => (j < nO ? -Math.PI / 2 : Math.PI / 2));
  const heading = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
  /** A keyframe of where everyone is now, `dur` ms after the last (longer when somebody has a long way to run). */
  const snap = (dur: number, extra: Partial<Frame> = {}) => {
    const hold = holding();
    spread(hold);
    const fo = oPids.map((p) => ({ ...o.get(p)! }));
    const fd = dPids.map((p) => ({ ...d.get(p)! }));
    const now = [...fo, ...fd];
    const was = [...lastO, ...lastD];
    let far = 0;
    now.forEach((p, i) => (far = Math.max(far, dist(p, was[i]))));
    // the man on the ball: its nearest defender, if he's close
    let onBall = -1;
    if (hold >= 0 && hold < nO) {
      fd.forEach((p, j) => {
        if (dist(p, now[hold]) < (onBall < 0 ? 8 : dist(now[onBall], now[hold]))) onBall = nO + j;
      });
    }
    const act = all.map((pid, j): Act => {
      const said = doing.get(pid);
      // (standing with the ball is holding it)
      if (said) return said === 'stand' && j === hold ? 'hold' : said;
      if (j === hold) return 'dribble';
      const run = dist(now[j], was[j]);
      if (j < nO) return run > 1.5 ? 'move' : 'stand';
      // (a long way to go: he turns and runs back)
      return run > 12 ? 'move' : j === onBall ? 'guard' : 'defend';
    });
    const face = all.map((pid, j) => {
      const p = now[j];
      const run = dist(p, was[j]);
      let to = looks.get(pid);
      if (!to) {
        const a = act[j];
        // running, he faces where he's going
        if (run > 2 && (a === 'move' || ((a === 'dribble' || a === 'drive') && run > 6))) return heading(was[j], p);
        if (j < nO) to = j === hold || hold < 0 ? BASKET : now[hold];
        else {
          // a defender sees his man and the ball (in a zone, the ball)
          const man = manOf.get(pid);
          const mp = man !== undefined && !zone ? o.get(man) : undefined;
          to = a === 'guard' || !mp ? (hold >= 0 ? now[hold] : ball) : { x: (mp.x + ball.x) / 2, y: (mp.y + ball.y) / 2 };
        }
      }
      return dist(p, to) > 0.4 ? heading(p, to) : lastFace[j];
    });
    doing.clear();
    looks.clear();
    lastFace = face;
    lastO = fo;
    lastD = fd;
    frames.push({ dur: dur > 0 ? Math.round(Math.max(dur, far / PACE)) : 0, o: fo, d: fd, ball: { ...ball }, hold, act, face, ...extra });
  };
  // captions name the players (without names, the court shows the play's label throughout)
  const N = (pid: number | undefined) => (pid === undefined || !name ? '' : name(pid));
  const cap = (text: string) => (name ? { cap: text } : {});
  const abbrev = (side: 0 | 1) => teams?.[side] ?? (side === 0 ? 'Home' : 'Away');
  const follow = () => {
    defense().forEach((p, i) => d.set(dPids[i], p));
  };
  /** A screener and the man he screens (the one guarding `freed`, man to man), as a frame's `meet`. */
  const screens = (scr: number, freed: number): Partial<Frame> => {
    const on = zone || junk ? undefined : guardOf.get(freed);
    return on !== undefined && dPids.includes(on) ? { meet: [[oPids.indexOf(scr), nO + dPids.indexOf(on)]] } : {};
  };
  const moveTo = (pid: number, p: Pt) => {
    const at = { x: clamp(p.x, -24, 24), y: clamp(p.y, 0.5, COURT_LEN - 1) };
    outside.delete(pid);
    if (o.has(pid)) o.set(pid, at);
    else if (d.has(pid)) d.set(pid, at);
    if (pid === holder) ball = { ...o.get(pid)! };
  };
  const give = (pid: number) => {
    holder = pid;
    ball = { ...o.get(pid)! };
  };
  /** A man waiting at his spot steps to the pass coming to him (once: he doesn't creep off his spot pass after pass). */
  const meet = (pid: number, passer: number) => {
    const at = o.get(pid);
    const spot = spots.get(pid);
    const src = o.get(passer);
    if (!at || !spot || !src || dist(at, spot) > 0.6) return;
    const far = dist(at, src);
    if (far > 8) moveTo(pid, { x: at.x + ((src.x - at.x) / far) * MEET, y: at.y + ((src.y - at.y) / far) * MEET });
  };
  /**
   * Help off the ball, man to man: as a man drives or a big rolls to `to`, the nearest defender who isn't on one
   * of `on` steps into his way (a stunt at the driver, a tag on the roller) and the others sink a step toward it.
   * They go back to their own men with the next move.
   */
  const help = (to: Pt, ...on: number[]) => {
    if (zone || junk) return;
    const own = new Set(on.map((p) => guardOf.get(p)));
    const rest = dPids.filter((p) => !own.has(p)).sort((a, b) => dist(d.get(a)!, to) - dist(d.get(b)!, to));
    rest.forEach((p, i) => {
      const at = d.get(p)!;
      const far = dist(at, to);
      if (far < 0.5) return;
      const step = i === 0 ? Math.min(STUNT, far * 0.5) : Math.min(SINK, far * 0.25);
      d.set(p, { x: at.x + ((to.x - at.x) / far) * step, y: at.y + ((to.y - at.y) / far) * step });
    });
  };
  /**
   * Where the play will find a man who is off the ball now: the spot he shoots his next jump shot from, if the next
   * thing the log has him do is catch a pass and shoot it (or shoot it), with nobody else's shot before then. He
   * gets there while the ball is being worked, not in a dash as the pass is thrown.
   */
  const shotAhead = (pid: number): Pt | undefined => {
    for (let k = at + 1; k < steps.length; k++) {
      const st = steps[k];
      if (st.k === 'shot') return st.pid === pid && shotAct(st) === 'jumper' && st.x !== undefined && st.y !== undefined ? { x: st.x, y: st.y } : undefined;
      if (st.k === 'pass' && st.pid2 === pid) continue;
      if (st.pid === pid || st.pid2 === pid || st.k === 'reb' || st.k === 'to' || st.k === 'steal' || st.k === 'ft') return undefined;
    }
    return undefined;
  };
  /** A man off the ball goes to `to` and makes it his spot (where he waits, and steps to a pass from). */
  const relocate = (pid: number, to: Pt) => {
    if (pid === holder || !o.has(pid)) return;
    moveTo(pid, to);
    spots.set(pid, { ...o.get(pid)! });
  };
  /**
   * The others while one of them works (`busy`: the men the action is theirs, left where it has them). Each who has
   * a shot coming goes to where it will find him (shotAhead). For a drive from `left` to `to`: the man out on the
   * floor nearest the spot the driver left fills in behind him; a man on a wing drifts down toward his corner, and
   * one in the corner the drive is coming at lifts out of it; a big by the lane on the driver's side goes across to
   * the far block. `lift`: only the corner on that side of the floor lifts (behind a roll to the rim, away from a
   * post-up), the rest as they are.
   */
  const space = (busy: number[], drive?: { left: Pt; to: Pt }, lift?: 1 | -1) => {
    const rest = oPids.filter((p) => p !== holder && !busy.includes(p));
    const out = (p: number) => dist(o.get(p)!, BASKET) >= 15;
    const fill = drive
      ? rest.filter((p) => out(p) && o.get(p)!.y > 14 && shotAhead(p) === undefined).sort((a, b) => dist(o.get(a)!, drive.left) - dist(o.get(b)!, drive.left))[0]
      : undefined;
    for (const p of rest) {
      const was = o.get(p)!;
      const shot = shotAhead(p);
      if (shot) relocate(p, toward(was, shot, AHEAD_MOST));
      else if (lift) {
        if (out(p) && was.y < 10 && was.x * lift > 0) relocate(p, alongArc(was, LIFT));
      } else if (!drive) continue;
      else if (!out(p)) {
        // (a big in the lane the driver is coming down: across to the other block, out of his way and behind the help)
        const side = drive.left.x >= 0 ? 1 : -1;
        if (dist(was, BASKET) < 13 && (was.x * side > 0 || Math.abs(was.x - drive.to.x) < 5)) relocate(p, { x: -side * DUNKER.x, y: DUNKER.y });
      } else if (p === fill) {
        const far = dist(was, drive.left);
        relocate(p, toward(was, drive.left, Math.min(FILL_MOST, far * FILL)));
      } else if (was.y < 10) {
        if (was.x * drive.left.x > 0 && Math.abs(drive.left.x) > 4) relocate(p, alongArc(was, LIFT));
      } else relocate(p, alongArc(was, -DRIFT));
    }
  };
  /** What a man does once he has given the ball up (see the pass): done as the next step starts, if he is still off the ball and it isn't his. */
  let after: (() => void) | null = null;
  // the log leaves out the pass that starts an action for a man off the ball (an isolation, a post
  // entry, a ball screen for someone else): it finds him first
  const catchBall = (pid: number) => {
    if (pid === holder || !o.has(pid)) return;
    const was = holder;
    meet(pid, was);
    give(pid);
    follow();
    does(was, 'pass', o.get(pid));
    does(pid, 'catch', o.get(was));
    snap(360, cap(`${N(was)} finds ${N(pid)}`));
  };
  /** The ball gets to the man who starts the possession: the inbound after a basket, the outlet after a stop. */
  const outlet = (pid: number) => {
    holder = pid;
    const at = o.get(pid);
    if (!at || dist(at, ball) < 0.01) return;
    // nobody has it (it dropped through the net, or went out): the nearest teammate picks it up and gets it in
    let passer = holding();
    let leak: ((ms: number) => void) | undefined;
    if (passer < 0) {
      const near = oPids.filter((p) => p !== pid).sort((a, b) => dist(o.get(a)!, ball) - dist(o.get(b)!, ball))[0];
      if (near !== undefined) {
        // (after a basket, from behind that baseline: he steps out with it, has a look, and throws it in)
        const made = ball.y > 80;
        if (made) outside.add(near);
        o.set(near, made ? { x: clamp(ball.x + 4, -24, 24), y: COURT_LEN + OUT } : { x: clamp(ball.x, -24.5, 24.5), y: clamp(ball.y, 0.5, COURT_LEN - 0.5) });
        ball = { ...o.get(near)! };
        does(near, 'hold', at);
        // (after a basket nobody else waits to see it thrown in: the three with no part in that are on their way up
        // the floor from the moment he steps out with it, each toward his own side of it)
        if (made)
          leak = (ms: number) => oPids.forEach((p) => p !== near && p !== pid && moveTo(p, toward(o.get(p)!, { x: spots.get(p)?.x ?? o.get(p)!.x, y: LEAK_TO }, LEAK * ms)));
        leak?.(200);
        snap(200);
        if (made) {
          does(near, 'inbound', at);
          leak?.(INBOUND_MS);
          snap(INBOUND_MS);
        }
        passer = oPids.indexOf(near);
      }
    }
    const from = passer >= 0 ? all[passer] : undefined;
    if (from !== undefined && from !== pid) does(from, 'pass', at);
    does(pid, 'catch', { ...ball });
    ball = { ...at };
    leak?.(240);
    snap(240);
  };

  snap(0, name ? { cap: log.label } : {});
  if (tipped) tip();
  // a set's off-ball screens, in order: where each sends its man depends on the set
  let pins = 0;
  // the score before this possession, so makes can tick it up
  const score: [number, number] = before ? [...before] : [log.score[0] - (off === 0 ? log.pts : 0), log.score[1] - (off === 1 ? log.pts : 0)];
  // the possession's last shot, if it went in as the clock ran out: at the buzzer, and in the 4th or
  // overtime from behind or level into the lead, the shot that won it
  const lastShot = [...steps].reverse().find((st) => st.k === 'shot');
  const buzzer = !!lastShot?.made && log.clockEnd <= 0.05;
  let moment: Script['moment'];
  let prev: PossStep | undefined;

  // the step being drawn, for its call
  let at = 0;
  for (const st of steps) {
    stepFrames(st);
    prev = st;
    at++;
  }
  /** The night's caption for the step being drawn, if it has one (and the court names players). */
  function voiced(): string | undefined {
    return name ? voice?.[at]?.cap : undefined;
  }
  // a made technical free throw has no step of its own: the court ends on the scoreboard's score anyway
  if (score[0] !== log.score[0] || score[1] !== log.score[1]) snap(600, { flash: { text: 'Tech FT', kind: 'make', x: 0, y: 9 }, score: [...log.score] });
  if (frames.length === 1) snap(500);
  paced(frames, oPids.length);
  return { off, oPids, dPids, frames, label: log.label, clockStart: log.clockStart, clockEnd: log.clockEnd, q: log.q, dir, ...(moment && { moment }) };

  /**
   * The opening tip: the two centres go up for it in the circle, and it is tapped back to the man who starts
   * the play (to a guard behind him, if he was the one who jumped). The court's referee throws it up (sideline.ts).
   */
  function tip() {
    const jump = [oPids[oPids.length - 1], dPids[dPids.length - 1]];
    const mid = { x: 0, y: COURT_LEN / 2 };
    const to = holder !== jump[0] ? holder : oPids.filter((p) => p !== jump[0]).sort((a, b) => o.get(b)!.y - o.get(a)!.y)[0];
    for (const p of all) does(p, jump.includes(p) ? 'tip' : 'stand', mid);
    snap(TIP_UP);
    for (const p of all) does(p, jump.includes(p) ? 'land' : p === to ? 'catch' : 'stand', mid);
    holder = to;
    ball = { ...o.get(to)! };
    snap(TIP_TAP, cap(`${N(jump[0])} wins the tip`));
  }

  /**
   * The offense in its half-court spots, the ball with the handler, the defense matched up. A set that starts from a
   * shape of its own comes up the floor into that shape: Horns' two bigs at the elbows; the man a Floppy is for under
   * the basket, an Elevator's at the foot of the lane, a Chicago's on the block on his own side (each where his first
   * screen finds him: he was walked to a wing first and then sent there, a detour the play doesn't have).
   */
  function setUp() {
    for (const pid of oPids) moveTo(pid, spots.get(pid)!);
    const set = log.set;
    if (set?.id === 'horns') {
      const other = oInfo.filter((p) => p.pid !== set.pid && p.pid !== holder).sort((a, b) => b.hgt - a.hgt)[0];
      moveTo(set.pid, { x: -6, y: 19.5 });
      if (other) moveTo(other.pid, { x: 6, y: 19.5 });
    }
    if (set && set.pid !== holder && o.has(set.pid)) {
      const side = o.get(set.pid)!.x >= 0 ? 1 : -1;
      if (set.id === 'floppy') moveTo(set.pid, { x: 4.5, y: 2 });
      if (set.id === 'elevator') moveTo(set.pid, { x: 0, y: 13 });
      if (set.id === 'chicago') moveTo(set.pid, { x: side * 9, y: 6 });
      if (FORMED.has(set.id)) spots.set(set.pid, { ...o.get(set.pid)! });
    }
    ball = { ...o.get(holder)! };
    follow();
  }

  function stepFrames(st: PossStep) {
    const then = after;
    after = null;
    then?.();
    switch (st.k) {
      case 'advance': {
        // (a set or a clear-out called for a player says so as the ball comes up)
        const call = log.set ? cap(`${SETS[log.set.id].name} for ${N(log.set.pid)}`) : log.iso !== undefined ? cap(`${CLEAR_OUT.name} for ${N(log.iso)}`) : {};
        if (live) outlet(st.pid ?? holder);
        else holder = st.pid ?? holder;
        // from the far end, the floor is crossed in two moves: over half court, then into the set
        if (live && o.get(holder)!.y > 54) {
          const wasO = new Map(o);
          setUp();
          const endO = new Map(o);
          const endD = new Map(d);
          for (const pid of oPids) {
            const e = endO.get(pid)!;
            const w = wasO.get(pid)!;
            // (the handler walks it over the line; the others are ahead of him, on their way to their spots)
            // (each in his own lane by half court: most of the way across to his side of the floor before he is most of the way up it)
            o.set(pid, pid === holder ? { x: clamp(w.x * 0.4, -8, 8), y: 50 } : { x: e.x * LANE + w.x * (1 - LANE), y: Math.min(w.y, e.y + 20) });
          }
          for (const pid of dPids) {
            const e = endD.get(pid)!;
            d.set(pid, { x: e.x, y: Math.min(d.get(pid)!.y, e.y + 12) });
          }
          ball = { ...o.get(holder)! };
          snap(460);
          for (const pid of oPids) o.set(pid, endO.get(pid)!);
          for (const pid of dPids) d.set(pid, endD.get(pid)!);
          ball = { ...o.get(holder)! };
          snap(560, call);
          break;
        }
        setUp();
        snap(750, call);
        break;
      }
      case 'press': {
        const pressing = cap(`${abbrev((1 - off) as 0 | 1)} press full court`);
        if (live) {
          // they pick up in the backcourt: every defender on his man, the ball trapped at the inbound
          outlet(st.pid ?? holder);
          dPids.forEach((pid) => {
            const man = manOf.get(pid);
            const op = (man !== undefined ? o.get(man) : undefined) ?? o.get(holder)!;
            d.set(pid, { x: op.x, y: op.y - 3 });
          });
          snap(450, pressing);
        } else {
          dPids.forEach((pid, i) => d.set(pid, { x: (i - 2) * 9, y: 40 + (i % 2) * 3 }));
          snap(450, pressing);
        }
        for (const pid of oPids) moveTo(pid, { x: spots.get(pid)!.x, y: spots.get(pid)!.y + 6 });
        follow();
        snap(700);
        break;
      }
      case 'transition': {
        if (live) outlet(st.pid ?? holder);
        else holder = st.pid ?? holder;
        moveTo(holder, { x: 0, y: 30 });
        // (a lane each for the other four: counted among them, two never share one; i % 4 in case the log names no one of the five)
        oPids.filter((pid) => pid !== holder).forEach((pid, i) => moveTo(pid, { x: [-20, 20, -10, 10][i % 4], y: 14 + (i % 2) * 6 }));
        if (live) {
          // the nearest defenders get back; the rest are still chasing the play
          const back = [...dPids].sort((a, b) => d.get(a)!.y - d.get(b)!.y);
          back.forEach((pid, i) => {
            const now = d.get(pid)!;
            d.set(pid, i < 3 ? { x: (i - 1) * 7, y: 15 + i * 4 } : { x: now.x * 0.6, y: Math.min(now.y, 34 + (i - 3) * 5) });
          });
        } else dPids.forEach((pid, i) => d.set(pid, { x: (i - 2) * 6, y: 18 + i * 3 }));
        ball = { ...o.get(holder)! };
        snap(650, cap(`${N(holder)} pushes it in transition`));
        moveTo(holder, { x: 2, y: 16 });
        snap(450);
        break;
      }
      case 'screen': {
        const scr = st.pid!;
        const h = st.pid2 ?? holder;
        // a ball screen is for the man with the ball, out on the floor: one in the corner or under the
        // basket comes up for it (or the screen would send him over the baseline)
        const up = o.get(h)!;
        if (up.y < 22) {
          moveTo(h, { x: clamp(up.x, -15, 15), y: 26 });
          follow();
          snap(420);
        }
        catchBall(h);
        const hp = { ...o.get(h)! };
        // the side it is set on: the middle's, for a ball out on one side of the floor; in the middle, the side the
        // screener comes from. A point of the screen's own frame (see SCREEN_AT), on the floor:
        const s = Math.abs(hp.x) > 5 ? (hp.x > 0 ? -1 : 1) : o.get(scr)!.x >= hp.x ? 1 : -1;
        const P = ([across, down]: [number, number]): Pt => ({ x: hp.x + s * across, y: hp.y + down });
        // (man to man, the two men the coverage is played by: the handler's and the screener's)
        const cov = zone || junk || !log.coverage || log.coverage === 'zone' ? undefined : log.coverage;
        const [hd, sd] = [guardOf.get(h), guardOf.get(scr)];
        const played = cov !== undefined && hd !== undefined && sd !== undefined && hd !== sd && d.has(hd) && d.has(sd) ? cov : undefined;
        const says = {
          ...(log.coverage && { flash: { text: title(log.coverage), kind: 'info' as const, x: hp.x, y: hp.y + 3 } }),
          ...cap(`${N(scr)} screens for ${N(h)}${log.coverage && log.coverage !== 'zone' ? `: they ${COVER_VERB[log.coverage]}` : ''}`),
        };

        // the screen is set, and each of the two is where his coverage has him as it is
        moveTo(scr, P(played === 'ice' ? SCREEN_ICE : SCREEN_AT));
        follow();
        const set = o.get(scr)!;
        if (played === 'drop') d.set(sd!, toward(set, BASKET, DROP - 2));
        else if (played === 'switch') d.set(sd!, toward(set, BASKET, APART));
        else if (played === 'hedge' || played === 'blitz') d.set(sd!, { x: set.x + s * 2.6, y: set.y + 0.6 });
        else if (played === 'ice') {
          d.set(hd!, P(ICE_ON));
          d.set(sd!, toward(P(ICED), BASKET, ICE_WALL));
        }
        does(scr, 'screen', hp);
        // (iced, the screen never gets its man: he is on the other side of the ball from it)
        snap(480, played === 'ice' ? {} : screens(scr, h));

        // the handler comes off it (or is sent away from it), and the coverage is played
        const roll: Pt = { x: clamp(hp.x + s * 1.2, -7, 7), y: ROLL_Y };
        if (played === 'blitz') {
          moveTo(h, P(TRAPPED));
          follow();
          const hb = o.get(h)!;
          d.set(hd!, { x: hb.x - s * TRAP_OFF[0], y: hb.y + TRAP_OFF[1] });
          d.set(sd!, { x: hb.x + s * TRAP_OFF[0], y: hb.y + TRAP_OFF[1] });
          does(hd, 'trap', hb);
          does(sd, 'trap', hb);
          does(scr, 'screen');
          snap(400, says);
          // (he backs out of it with the two still on him; the screener stops short, where the pass out finds him,
          // and the weak side's nearest man comes over to him: the rest are a man short behind it)
          moveTo(h, P(BACK_OUT));
          moveTo(scr, { x: roll.x, y: SHORT_ROLL_Y });
          space([scr, h], undefined, -s as 1 | -1);
          follow();
          const hr = o.get(h)!;
          d.set(hd!, { x: hr.x - s * TRAP_OFF[0], y: hr.y + TRAP_OFF[1] });
          d.set(sd!, { x: hr.x + s * TRAP_OFF[0], y: hr.y + TRAP_OFF[1] });
          does(hd, 'trap', hr);
          does(sd, 'trap', hr);
          const tag = dPids.filter((p) => p !== hd && p !== sd).sort((a, b) => dist(d.get(a)!, o.get(scr)!) - dist(d.get(b)!, o.get(scr)!))[0];
          if (tag !== undefined) d.set(tag, guardSpot(o.get(scr)!, false, log.help));
          help(o.get(scr)!, scr, h, ...(tag !== undefined && manOf.has(tag) ? [manOf.get(tag)!] : []));
          snap(440);
          break;
        }
        if (played === 'ice') {
          moveTo(h, P(ICED));
          follow();
          const hi = o.get(h)!;
          d.set(hd!, { x: hi.x + s * ICE_ON[0], y: hi.y + ICE_ON[1] });
          d.set(sd!, toward(hi, BASKET, ICE_WALL));
          does(scr, 'screen');
          snap(400, says);
          // (down the side, the guard on his top hand, the big between him and the rim; the screener, with nobody to
          // screen, turns and rolls)
          moveTo(h, P(ICED_ON));
          moveTo(scr, roll);
          space([scr, h], undefined, s as 1 | -1);
          follow();
          const hl = o.get(h)!;
          d.set(hd!, { x: hl.x + s * ICE_ON[0], y: hl.y + ICE_ON[1] });
          d.set(sd!, toward(hl, BASKET, ICE_WALL - 1.5));
          help(o.get(scr)!, scr, h);
          snap(440);
          break;
        }
        moveTo(h, P(played === 'hedge' ? STRUNG : USE));
        if (played === 'switch') {
          // (they change men: the big out on the ball, the guard with the roller, from here on)
          guardOf.set(h, sd!);
          guardOf.set(scr, hd!);
          manOf.set(sd!, h);
          manOf.set(hd!, scr);
        }
        follow();
        const hu = o.get(h)!;
        if (played === 'drop') {
          d.set(sd!, toward(hu, BASKET, DROP));
          d.set(hd!, { x: hu.x + s * TRAIL[0], y: hu.y + TRAIL[1] });
        } else if (played === 'hedge') {
          d.set(sd!, P(SHOW));
          d.set(hd!, { x: hu.x + s * TRAIL[0], y: hu.y - 0.6 });
        } else if (played === 'switch') d.set(hd!, toward(set, BASKET, APART));
        does(scr, 'screen');
        snap(400, says);
        // he turns the corner and the screener rolls; behind the roll the weak side's corner lifts, and its nearest
        // defender tags the roller
        moveTo(h, P(played === 'hedge' ? SLOWED : TURN));
        moveTo(scr, roll);
        space([scr, h], undefined, -s as 1 | -1);
        follow();
        const ht = o.get(h)!;
        if (played === 'drop') {
          // (the big keeps backing off between the ball and the rim; the guard is still behind the play)
          d.set(sd!, toward(ht, BASKET, DROP - 1.5));
          d.set(hd!, { x: ht.x - s * 2.2, y: ht.y + 2.4 });
        }
        help(o.get(scr)!, scr, h);
        snap(440);
        break;
      }
      case 'pin': {
        // an off-ball screen: the screener gets to his spot, then his man comes off it
        const scr = st.pid!;
        const cut = st.pid2!;
        const sp = o.get(scr);
        const cp = o.get(cut);
        if (!sp || !cp) break;
        const n = pins++;
        const side = cp.x >= 0 ? 1 : -1;
        let spot: Pt;
        let to: Pt;
        switch (log.set?.id) {
          case 'floppy':
            // from the baseline under the basket, past a screen on one block, off the stagger on the
            // other side and out to that wing
            if (n === 0) {
              moveTo(cut, { x: 4.5, y: 2 });
              spot = { x: 6.5, y: 8.5 };
              to = { x: 4.5, y: 2 };
            } else {
              spot = { x: -6, y: 10.5 };
              to = { x: -16.5, y: 20.5 };
            }
            break;
          case 'elevator':
            // two screeners side by side at the top of the key; he comes up between them, the passer
            // swinging out to the wing to find him
            if (n === 0) {
              if (holder !== cut && holder !== scr) moveTo(holder, { x: 16.5, y: 21 });
              moveTo(cut, { x: 0, y: 13 });
              spot = { x: -1.6, y: 23 };
              to = { x: 0, y: 13 };
            } else {
              spot = { x: 1.6, y: 23 };
              to = { x: 0, y: 26 };
            }
            break;
          case 'chicago':
            // a pin-down on the block, and he curls up toward the handoff
            moveTo(cut, { x: side * 9, y: 6 });
            spot = { x: side * 8.5, y: 11 };
            to = { x: side * 12, y: 22 };
            break;
          case 'hammer':
            // the hammer screen on the help defender frees his corner
            spot = { x: side * 9, y: 7 };
            to = { x: side * 22, y: 3 };
            break;
          case 'spain':
            // a back screen on the roll man's defender as he dives
            spot = { x: cp.x - 1.6, y: cp.y + 1.4 };
            to = { x: cp.x * 0.3, y: 7.5 };
            break;
          case 'postSplit':
            // the split: one screens for the other, who cuts (the screener flares)
            spot = { x: cp.x + side * -2, y: cp.y };
            to = { x: cp.x * 0.5, y: cp.y - 4 };
            break;
          default:
            spot = { x: cp.x - side * 2, y: cp.y - 1.5 };
            to = { x: side * 16.5, y: 21 };
        }
        moveTo(scr, spot);
        follow();
        does(scr, 'screen', o.get(cut));
        snap(420);
        moveTo(cut, to);
        if (log.set?.id === 'postSplit') moveTo(scr, { x: -side * 18, y: 20 });
        else does(scr, 'screen');
        follow();
        // (the man guarding him was caught on the screen: he comes round it behind him, not between him and the rim)
        const chaser = zone || junk ? undefined : guardOf.get(cut);
        if (chaser !== undefined && d.has(chaser) && dist(cp, o.get(cut)!) > CHASE + 1) d.set(chaser, toward(o.get(cut)!, cp, CHASE));
        // (the set's name once, on its first screen)
        snap(480, {
          ...screens(scr, cut),
          ...(n === 0 && log.set && { flash: { text: SETS[log.set.id].short, kind: 'info' as const, x: spot.x, y: spot.y + 3 } }),
          ...cap(`${N(scr)} screens for ${N(cut)}`),
        });
        break;
      }
      case 'trap': {
        const h = st.pid ?? holder;
        const hp = o.get(h)!;
        const near = [...dPids].sort((a, b) => dist(d.get(a)!, hp) - dist(d.get(b)!, hp)).slice(0, 2);
        near.forEach((pid, i) => d.set(pid, { x: hp.x + (i ? 2.2 : -2.2), y: hp.y - 2 }));
        near.forEach((pid) => does(pid, 'trap', hp));
        does(h, 'hold');
        snap(420, { flash: { text: 'Trap', kind: 'info', x: hp.x, y: hp.y + 4 }, ...cap(`${N(h)} is trapped`) });
        break;
      }
      case 'drive': {
        const pid = st.pid!;
        catchBall(pid);
        const p = { ...o.get(pid)! };
        moveTo(pid, { x: p.x * 0.35, y: 10 });
        // (the others make room and make themselves a pass: see space)
        space([pid], { left: p, to: o.get(pid)! });
        follow();
        // (the nearest help steps in front of him)
        help(o.get(pid)!, pid);
        does(pid, 'drive');
        // (he gets a shoulder into the man on him on his way by)
        const on = zone || junk ? undefined : guardOf.get(pid);
        snap(620, {
          ...(on !== undefined && dPids.includes(on) && { hit: [oPids.indexOf(pid), nO + dPids.indexOf(on), DRIVE_BUMP] as [number, number, number] }),
          ...cap(`${N(pid)} drives`),
        });
        break;
      }
      case 'post': {
        const pid = st.pid!;
        const side = (o.get(pid)!.x >= 0 ? 1 : -1) * 7;
        moveTo(pid, { x: side, y: 8 });
        // (the corner on his side lifts out of it: the block is his, and the double has farther to come)
        space([pid], undefined, side > 0 ? 1 : -1);
        follow();
        // (his back to the basket)
        does(pid, 'post', { x: side * 3, y: 8 + (8 - BASKET.y) * 2 });
        snap(560, cap(`${N(pid)} posts up`));
        // the entry pass once he has his spot
        catchBall(pid);
        break;
      }
      case 'cut': {
        const pid = st.pid!;
        const p = o.get(pid)!;
        moveTo(pid, { x: Math.sign(p.x || 1) * 3, y: 7 });
        snap(520, cap(`${N(pid)} cuts to the rim`));
        break;
      }
      case 'handoff': {
        const big = st.pid!;
        const sh = st.pid2!;
        const side = o.get(sh)!.x >= 0 ? 1 : -1;
        const spot = { x: side * 9, y: 21 };
        moveTo(big, spot);
        follow();
        snap(480);
        if (holder !== big) {
          does(holder, 'pass', o.get(big));
          does(big, 'catch', o.get(holder));
        }
        give(big);
        // (the man it is for runs at the big and on past him, HANDOFF_BY off him on the side away from the rim as it
        // changes hands, HANDOFF_AT through the hand-off's move (the 3D court's), and on the way he was going after)
        const r0 = o.get(sh)!;
        const far = dist(r0, spot);
        const ux = far > 4 ? (spot.x - r0.x) / far : -side * 0.86;
        const uy = far > 4 ? (spot.y - r0.y) / far : -0.51;
        const n = (spot.x - BASKET.x) * -uy + (spot.y - BASKET.y) * ux >= 0 ? 1 : -1;
        const by = { x: spot.x - uy * n * HANDOFF_BY, y: spot.y + ux * n * HANDOFF_BY };
        moveTo(sh, { x: by.x - ux * HANDOFF_RUN * 0.3, y: by.y - uy * HANDOFF_RUN * 0.3 });
        // (already holding it: he turns to where it is taken as the man comes, not as he gets there)
        does(big, doing.get(big) ?? 'hold', doing.has(big) ? undefined : by);
        snap(380);
        // (he takes it on the run, looking where he is going: past the big, not back at him)
        does(big, 'pass', by);
        does(sh, 'catch', { x: by.x + ux * HANDOFF_RUN * 2, y: by.y + uy * HANDOFF_RUN * 2 });
        give(sh);
        moveTo(sh, { x: by.x + ux * HANDOFF_RUN * 0.7, y: by.y + uy * HANDOFF_RUN * 0.7 });
        follow();
        snap(380, { handoff: true, ...cap(`${N(big)} hands off to ${N(sh)}`) });
        break;
      }
      case 'pass': {
        const to = st.pid2!;
        const was = st.pid ?? holder;
        // (a catch and shoot: the ball is thrown to him at the spot he shoots from, and one from somewhere else gets
        // there first)
        const next = steps[at + 1];
        // (an alley-oop: the lob goes up as he does, and he takes it in the air: the pass is the shot's own first move)
        // (thrown by the man who has it: the log leaves out a pass that got it to the man it names)
        if (next?.k === 'shot' && next.pid === to && holder !== to && o.has(to) && o.has(holder) && finishOf(next.d) === 'oop') {
          lobFrom = holder;
          break;
        }
        const spot = next?.k === 'shot' && next.pid === to && shotAct(next) === 'jumper' ? { x: next.x ?? 0, y: next.y ?? 10 } : undefined;
        if (spot && was !== to && o.has(to)) {
          const far = dist(o.get(to)!, spot) > SHOT_SET;
          moveTo(to, spot);
          if (far) {
            follow();
            snap(SHOT_GO);
          }
        } else if (was !== to) meet(to, was);
        give(to);
        follow();
        if (was !== to) {
          does(was, 'pass', o.get(to));
          does(to, 'catch', o.get(was));
        }
        snap(360, cap(was !== to ? `${N(was)} finds ${N(to)}` : `${N(to)} has it`));
        // (the ball gone, a man out on the floor doesn't stand where he threw it from: to where his own shot is
        // coming, or a few steps along the arc away from the ball. With the next step, unless it is his)
        if (was !== to && o.has(was)) {
          const then = steps[at + 1];
          after = () => {
            if (was === holder || then?.pid === was || then?.pid2 === was || then?.k === 'ft' || then?.k === 'timeout') return;
            const from = o.get(was)!;
            const shot = shotAhead(was);
            if (shot) relocate(was, toward(from, shot, AHEAD_MOST));
            // (out on the floor: round the arc, away from the man who has it)
            else if (dist(from, BASKET) >= 15 && o.has(holder)) relocate(was, awayOnArc(from, o.get(holder)!, SPACE));
          };
        }
        break;
      }
      case 'shot': {
        const pid = st.pid!;
        const target = { x: st.x ?? 0, y: st.y ?? 10 };
        // (a jumper goes up from where he stands: a man away from his spot gets there on the dribble first)
        const from = o.get(pid);
        const fin = finishOf(st.d);
        let lob = lobFrom;
        lobFrom = undefined;
        // (an alley-oop the log gives no pass for, a missed one: thrown by whoever has it; his own, he gives it to
        // the man farthest out and goes to the rim for it back)
        if (fin === 'oop' && lob === undefined) {
          if (holder !== pid && o.has(holder)) lob = holder;
          else {
            const out = oPids.filter((p) => p !== pid).sort((a, b) => dist(o.get(b)!, BASKET) - dist(o.get(a)!, BASKET))[0];
            if (out !== undefined) {
              catchBall(out);
              lob = out;
            }
          }
        }
        if (shotAct(st) === 'jumper' && from && dist(from, target) > SHOT_SET) {
          moveTo(pid, target);
          give(pid);
          follow();
          snap(SHOT_GO);
        }
        // (a turnaround starts with his back to the rim: he has it there, as the move before this one ends)
        const j0 = all.indexOf(pid);
        const last = frames[frames.length - 1];
        if (fin === 'turn' && last && last.hold === j0 && from && dist(from, target) < 6 && (last.act[j0] === 'post' || last.act[j0] === 'hold' || last.act[j0] === 'dribble')) {
          last.face[j0] = heading(BASKET, from) + (from.x >= 0 ? 0.5 : -0.5);
          lastFace[j0] = last.face[j0];
        }
        // (a tip-in is tipped at the top of his jump for the board: he never comes down with it)
        const tipped = fin === 'tip' && !!last && last.hold === j0 && last.act[j0] === 'rebound';
        if (!tipped) moveTo(pid, target);
        give(pid);
        follow();
        // contest: nearest defender closes out to a hand's length, on the basket side
        // (a blocked shot: the man who blocks it is the one who goes up with him)
        const next = steps[at + 1];
        const blocker = next?.k === 'block' && next.pid !== undefined && d.has(next.pid) ? next.pid : undefined;
        // (fouled on it: the man the whistle is on is the one who goes up with him, and into him)
        const hacker = next?.k === 'foul' && next.pid !== undefined && d.has(next.pid) ? next.pid : undefined;
        const near = blocker ?? hacker ?? [...dPids].sort((a, b) => dist(d.get(a)!, target) - dist(d.get(b)!, target))[0];
        const toRim = dist(target, BASKET);
        const [ux, uy] = toRim > 0.5 ? [(BASKET.x - target.x) / toRim, (BASKET.y - target.y) / toRim] : [0, -1];
        const how = shotAct(st);
        if (near !== undefined) {
          if (how === 'dunk' || how === 'layup' || toRim < RIM_NEAR) {
            // a shot at the rim takes the shooter to it: his man goes up beside the rim, square to the way he
            // comes in (the side he is already on), never where the shooter comes down and never behind the board
            const was = d.get(near)!;
            const sides = [1, -1].map((k) => ({ x: BASKET.x - uy * k * BESIDE, y: BASKET.y + ux * k * BESIDE }));
            const open = sides.filter((p) => p.y >= BASKET.y - 0.6);
            d.set(near, (open.length ? open : sides).sort((a, b) => dist(a, was) - dist(b, was))[0]);
          } else d.set(near, { x: target.x + ux * CONTEST, y: Math.max(0.5, target.y + uy * CONTEST) });
        }
        const clearLanding = () => {
          if (how !== 'dunk' && how !== 'layup') return;
          // (he comes down short of the rim, on the side he came from, a dunker out toward the open floor: see
          // puppet.ts. Nobody is left standing where he lands)
          const out = how === 'dunk' ? { x: target.x - BASKET.x, y: target.y - BASKET.y + DUNK_OPEN } : { x: -ux, y: -uy };
          const ol = Math.hypot(out.x, out.y) || 1;
          const off = how === 'dunk' ? DUNK_OFF : Math.min(toRim, 1);
          const land = { x: BASKET.x + (out.x / ol) * off, y: BASKET.y + (out.y / ol) * off };
          const room = fin === 'putback' || fin === 'tip' ? LAND_PUT : LAND;
          for (const [who, spot] of [...o, ...d]) {
            const gap = dist(spot, land);
            if (who === pid || gap >= room) continue;
            const [ax, ay] = gap > 0.01 ? [(spot.x - land.x) / gap, (spot.y - land.y) / gap] : [1, 0];
            spot.x = land.x + ax * room;
            spot.y = land.y + ay * room;
          }
        };
        clearLanding();
        const what = st.d ?? (st.v === 3 ? 'three' : 'jumper');
        // (an up-and-under: he shows it, the man on him goes up, and he steps under him as he comes down)
        const bit = fin === 'under' && near !== undefined && blocker === undefined;
        if (bit) {
          does(pid, 'hold', BASKET);
          does(near, 'contest', target);
          snap(FAKE_MS, { fake: j0, ...cap(`${N(pid)} shows it…`) });
        }
        if (!tipped) {
          does(pid, how, BASKET);
          if (lob !== undefined && o.has(lob)) does(lob, 'pass', target);
          does(near, bit ? 'land' : blocker !== undefined ? 'block' : 'contest', target);
          snap(lob !== undefined ? LOB_MS : 300, {
            ...(fin && { how: fin }),
            ...(hacker !== undefined && { hit: [nO + dPids.indexOf(hacker), j0, SHOT_BUMP] as [number, number, number] }),
            ...cap(lob !== undefined ? `${N(lob)} lobs it up for ${N(pid)}…` : `${N(pid)}, ${what}…`),
          });
        }
        // (the shooter's own spot, as the crowd around him left it)
        const release = o.get(pid)!;
        ball = { ...BASKET };
        const made = !!st.made;
        const lead = score[off] - score[1 - off];
        if (made) score[off] += st.v ?? 2;
        const now = score[off] - score[1 - off];
        // in the last two minutes of the 4th or overtime, a make that changes who leads says so
        const late = log.q >= 4 && log.clockEnd <= 120;
        const swing =
          made && late ? (lead <= 0 && now > 0 ? ` ${abbrev(off)} lead ${Math.max(...score)}-${Math.min(...score)}!` : lead < 0 && now === 0 ? ` Tied at ${score[0]}!` : '') : '';
        const atBuzzer = buzzer && st === lastShot;
        if (atBuzzer) moment = log.q >= 4 && lead <= 0 && now > 0 ? 'winner' : 'buzzer';
        const flashText = atBuzzer ? (moment === 'winner' ? 'Game winner' : 'Buzzer beater') : `+${st.v ?? 2}`;
        // a layup barely leaves the hand; a jumper climbs with its distance
        const far = dist(release, BASKET);
        // it's away: he follows through and his man comes down. The two of his side nearest the rim go to the
        // glass and the rest start back; each man who crashes is met by the nearest free defender, who puts his
        // back into him and holds him there; the other defenders turn and look for the ball
        const glass = oPids
          .filter((p) => p !== pid && dist(o.get(p)!, BASKET) < CRASH_FROM)
          .sort((a, b) => dist(o.get(a)!, BASKET) - dist(o.get(b)!, BASKET))
          .slice(0, 2);
        const boxing = new Set<number>();
        const held: [number, number][] = [];
        for (const p of oPids) {
          if (p === pid) continue;
          const at = o.get(p)!;
          const r = dist(at, BASKET);
          if (glass.includes(p)) {
            const go = Math.min(CRASH, Math.max(0, r - CRASH_TO));
            if (r > 0.5) o.set(p, { x: at.x + ((BASKET.x - at.x) / r) * go, y: at.y + ((BASKET.y - at.y) / r) * go });
          } else if (at.y > 18) o.set(p, { x: at.x * 0.92, y: at.y + GET_BACK });
        }
        for (const g of glass) {
          const m = o.get(g)!;
          const r = dist(m, BASKET);
          const by = dPids.filter((p) => p !== near && !boxing.has(p)).sort((a, b) => dist(d.get(a)!, m) - dist(d.get(b)!, m))[0];
          if (by === undefined || r < 0.5 || dist(d.get(by)!, m) > 9) continue;
          boxing.add(by);
          held.push([nO + dPids.indexOf(by), oPids.indexOf(g)]);
          d.set(by, { x: m.x + ((BASKET.x - m.x) / r) * APART, y: m.y + ((BASKET.y - m.y) / r) * APART });
        }
        clearLanding();
        for (const p of oPids) does(p, p === pid ? 'release' : glass.includes(p) ? 'crash' : dist(o.get(p)!, BASKET) > 18 ? 'move' : 'stand', BASKET);
        // (the man who went up for a fake is down already, and nobody went up with a tip)
        for (const p of dPids) does(p, p === near && !bit && !tipped ? 'land' : boxing.has(p) ? 'boxout' : 'stand', BASKET);
        snap(st.zone === 'rim' ? 380 : Math.round(520 + far * 7), {
          ...(fin && { how: fin }),
          ...(st.v === 3 && { three: true as const }),
          ...(blocker !== undefined && { swat: nO + dPids.indexOf(blocker) }),
          ...(held.length && { meet: held }),
          ballZ: st.zone === 'rim' ? 2.4 : 4.5 + far * 0.24,
          fx: made ? 'make' : 'miss',
          flash: made ? { text: flashText, kind: 'make', x: 0, y: 10 } : { text: 'Miss', kind: 'miss', x: 0, y: 10 },
          score: [...score] as [number, number],
          ...cap(made ? (voiced() ?? `${N(pid)} ${what}: good!${st.pid2 !== undefined ? ` (${N(st.pid2)} assist)` : ''}${swing}`) : `${N(pid)} misses the ${what}`),
        });
        // at the buzzer, the court lingers on it
        if (atBuzzer) {
          for (const p of oPids) does(p, 'celebrate');
          for (const p of dPids) does(p, 'rue');
          snap(900);
        }
        break;
      }
      case 'block': {
        snap(260, { flash: { text: 'Blocked', kind: 'block', x: 0, y: 11 }, ...cap(voiced() ?? `Blocked by ${N(st.pid)}!`) });
        break;
      }
      case 'reb': {
        // no pid: a team rebound (out of bounds, or the ball loose after a free throw)
        const pid = st.pid;
        // (where it comes off is the same every time this possession is drawn: a replay, a skip back, the lab)
        const rnd = (k: number) => jitter(log.q * 7919 + log.clockStart * 131 + log.score[0] * 17 + log.score[1] * 29 + steps.indexOf(st) * 3, k);
        let pt = { x: (rnd(1) - 0.5) * 8, y: 7 + rnd(2) * 4 };
        // (it comes off the rim his way: he steps in toward it and goes up for it, he doesn't run the lane to it)
        const from = pid === undefined ? undefined : (o.get(pid) ?? d.get(pid));
        if (from) {
          const r = clamp(dist(from, BASKET) - REB_STEP, REB_NEAR, REB_FAR) + (rnd(3) - 0.5) * 1.5;
          const a = Math.atan2(from.y - BASKET.y, from.x - BASKET.x) + (rnd(4) - 0.5) * 0.3;
          pt = { x: BASKET.x + Math.cos(a) * r, y: Math.max(BASKET.y + 1, BASKET.y + Math.sin(a) * r) };
        }
        const offensive = pid !== undefined && o.has(pid);
        if (offensive) {
          moveTo(pid, pt);
          holder = pid;
        } else if (pid !== undefined && d.has(pid)) d.set(pid, pt);
        ball = { ...pt };
        does(pid, 'rebound', BASKET);
        // (the board everyone expects needs no label; the one that keeps a possession alive gets one)
        const flash: Flash | undefined =
          pid === undefined ? { text: 'Team rebound', kind: 'info', x: pt.x, y: pt.y + 4 } : offensive ? { text: 'Off. rebound', kind: 'info', x: pt.x, y: pt.y + 4 } : undefined;
        snap(420, {
          ...(flash && { flash }),
          ...cap(pid === undefined ? `${abbrev(off)} keep it` : offensive ? `Offensive rebound, ${N(pid)}` : `${N(pid)} rebounds`),
        });
        break;
      }
      case 'to':
      case 'steal': {
        const stl = st.pid2;
        const stolen = stl !== undefined && d.has(stl);
        if (stolen) {
          does(stl, 'steal', o.get(st.pid ?? holder));
          ball = { ...d.get(stl)! };
        } else {
          does(st.pid ?? holder, 'rue');
          ball = { x: 25, y: ball.y };
        }
        // (the shot clock running out is the buzzer's, not a lost ball: the court and the sound say which)
        const clockOut = st.k === 'to' && st.d === 'shot clock violation';
        snap(420, {
          flash: { text: st.k === 'steal' ? 'Steal' : clockOut ? SHOT_CLOCK : 'Turnover', kind: 'to', x: ball.x * 0.5, y: ball.y + 3 },
          ...cap(
            st.k === 'steal' && stl !== undefined
              ? (voiced() ?? `${N(stl)} steals it from ${N(st.pid)}!`)
              : clockOut
                ? `Shot clock violation, ${abbrev(off)}`
                : `Turnover, ${N(st.pid ?? holder)}`,
          ),
        });
        // he's off the other way with it (the next possession picks him up from there)
        if (stolen && live) {
          const p = d.get(stl)!;
          d.set(stl, { x: p.x * 0.8, y: Math.min(COURT_LEN - 1, p.y + 9) });
          ball = { ...d.get(stl)! };
          snap(300);
        }
        break;
      }
      case 'foul': {
        // fouled on a make: and one
        const andOne = prev?.k === 'shot' && !!prev.made;
        const on = st.pid === undefined ? -1 : all.indexOf(st.pid);
        // (a foul on the floor is a body into a body: the man it is on gets into the man with the ball (reaching in,
        // or riding him), or, his own side's, into the man guarding him (a charge, a moving screen). One on a shot was
        // made as it went up: see the shot)
        let hit: [number, number, number] | undefined;
        if (on >= 0 && prev?.k !== 'shot') {
          const fouler = st.pid!;
          const into = d.has(fouler) ? holder : guardOf.get(fouler);
          const a = d.get(fouler) ?? o.get(fouler);
          const b = into === undefined ? undefined : (o.get(into) ?? d.get(into));
          if (a && b && into !== fouler && dist(a, b) < FOUL_REACH) {
            const far = dist(a, b);
            // (he closes on him, to an arm's length: the 3D court draws them touching)
            if (d.has(fouler) && far > APART) d.set(fouler, { x: b.x + ((a.x - b.x) / far) * APART, y: b.y + ((a.y - b.y) / far) * APART });
            hit = [on, all.indexOf(into!), FOUL_BUMP];
          }
        }
        snap(380, {
          ...(on >= 0 && { foul: on }),
          ...(hit && { hit, meet: [[hit[0], hit[1]]] as [number, number][] }),
          flash: { text: andOne ? 'And one!' : 'Foul', kind: andOne ? 'make' : 'foul', x: ball.x, y: ball.y + 3 },
          ...cap(andOne ? `And one! Foul on ${N(st.pid)}` : `Foul on ${N(st.pid)}`),
        });
        break;
      }
      case 'ft': {
        const pid = st.pid!;
        holder = pid;
        moveTo(pid, { x: 0, y: 19 });
        oPids.filter((p) => p !== pid).forEach((p, i) => moveTo(p, FT_OFF[i] ?? { x: 0, y: 30 }));
        dPids.forEach((p, i) => d.set(p, FT_DEF[i] ?? { x: 0, y: 32 }));
        ball = { ...o.get(pid)! };
        for (const p of all) does(p, p === pid ? 'hold' : 'stand', BASKET);
        // (long enough for his routine: two bounces, a breath, and he sets)
        snap(FT_SET);
        // (one trip to the line is one motion here, however many he shoots)
        for (const p of all) does(p, p === pid ? 'ft' : 'stand', BASKET);
        snap(260);
        ball = { ...BASKET };
        for (const p of all) does(p, p === pid ? 'release' : 'stand', BASKET);
        score[off] += st.v ?? 0;
        // "1-2 FT": made-attempted, as a box score writes it (a log without attempts just counts the makes)
        snap(520, {
          ballZ: 6,
          fx: (st.v ?? 0) > 0 ? 'make' : 'miss',
          flash: { text: st.n ? `${madeAtt(st.v ?? 0, st.n)} FT` : `${st.v ?? 0} FT`, kind: (st.v ?? 0) > 0 ? 'make' : 'miss', x: 0, y: 10 },
          score: [...score] as [number, number],
          ...cap(`${N(pid)} ${st.n ? `${st.v ?? 0} of ${st.n}` : `${st.v ?? 0}`} at the line`),
        });
        // (it's down and the ball is the other side's: the two of his own on the lane step in and slap his hand)
        if ((st.v ?? 0) > 0 && steps[at + 1] === undefined) {
          oPids
            .filter((p) => p !== pid)
            .slice(0, 2)
            .forEach((p, i) => moveTo(p, { x: i ? 3.2 : -3.2, y: 17.4 }));
          for (const p of all) does(p, 'stand', o.get(pid));
          snap(400);
        }
        break;
      }
      case 'timeout':
        // the one flash a timeout gets, naming the team that called it
        for (const p of all) does(p, 'stand');
        snap(900, {
          flash: { text: st.t !== undefined && teams ? `Timeout ${teams[st.t]}` : 'Timeout', kind: 'info', x: 0, y: 26 },
          ...cap(st.t !== undefined ? `Timeout, ${abbrev(st.t)}` : 'Timeout'),
        });
        break;
      default:
        break;
    }
  }
}

/** What the court says at frame `i`: the last caption reached, or the play's label before any (and without names). */
export function captionAt(script: Script, i: number): string {
  for (let j = Math.min(i, script.frames.length - 1); j >= 0; j--) {
    const c = script.frames[j].cap;
    if (c) return c;
  }
  return script.label;
}
