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

/** How a shot is taken, from its zone and the play-by-play's word for it. */
function shotAct(st: PossStep): Act {
  const d = st.d ?? '';
  if (/dunk|alley-oop/.test(d)) return 'dunk';
  if (st.zone === 'rim' || /layup|finger roll|putback|tip-in|up-and-under/.test(d)) return 'layup';
  if (/floater|runner|hook/.test(d)) return 'floater';
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
/** A man catching a pass at his spot steps to it, this far (ft). */
const MEET = 1.3;
/** The opening tip: the ball is in the air this long before the jumpers get a hand to it, and the tap takes this long to come down (ms). */
const TIP_UP = 280;
const TIP_TAP = 210;
/** Where the man who throws it in after a basket stands: this far behind the baseline (ft), and for this long with it (ms). */
const OUT = 1.6;
const INBOUND_MS = 420;
/** A shot from nearer the rim than this (ft), a layup or a dunk is contested from beside the rim, this far from it. */
const RIM_NEAR = 3.5;
const BESIDE = 3.2;
/** Where a dunker hangs from the rim (puppet.ts: this far from it, the way he came tipped this much up the floor), and how far from where he lands everyone else is kept (ft). */
const DUNK_OFF = 2;
const DUNK_OPEN = 1.5;
const LAND = 3.1;
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
  const spots = baseSpots(oInfo, holder);
  const guardOf = new Map<number, number>(Object.entries(log.guards).map(([o, d]) => [Number(o), d]));
  const manOf = new Map<number, number>([...guardOf].map(([o, d]) => [d, o]));
  const zone = log.scheme === 'zone32' ? ZONE32 : log.scheme === 'zone23' ? ZONE23 : null;
  // a junk defense: its chasers stay with their men, the others hold the box or triangle
  const junk = log.scheme === 'box1' ? BOX : log.scheme === 'tri2' ? TRIANGLE : null;
  const chasers = new Map<number, number>();
  if (junk) for (const c of log.chase ?? []) if (guardOf.has(c)) chasers.set(guardOf.get(c)!, c);
  const zoneSlot = new Map<number, number>();
  if (junk) dPids.filter((pid) => !chasers.has(pid)).forEach((pid, i) => zoneSlot.set(pid, i));

  // where everyone is now
  const o = new Map<number, Pt>();
  const d = new Map<number, Pt>();
  let ball: Pt;
  const defendSpot = (dpid: number, i: number): Pt => {
    if (zone) return zone[i] ?? { x: 0, y: 10 };
    if (junk) {
      const man = chasers.get(dpid);
      const op = man !== undefined ? o.get(man) : undefined;
      if (op) return man === holder ? guardSpot(op, true, log.help) : chaseSpot(op, o.get(holder) ?? op);
      return junk[zoneSlot.get(dpid) ?? 0] ?? { x: 0, y: 10 };
    }
    const man = manOf.get(dpid);
    const op = man !== undefined ? o.get(man) : undefined;
    return op ? guardSpot(op, man === holder, log.help) : { x: 0, y: 12 };
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
    dPids.forEach((pid, i) => d.set(pid, { ...defendSpot(pid, i), y: defendSpot(pid, i).y + 6 }));
    ball = { ...o.get(holder)! };
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
    dPids.forEach((pid, i) => d.set(pid, defendSpot(pid, i)));
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
    if (passer < 0) {
      const near = oPids.filter((p) => p !== pid).sort((a, b) => dist(o.get(a)!, ball) - dist(o.get(b)!, ball))[0];
      if (near !== undefined) {
        // (after a basket, from behind that baseline: he steps out with it, has a look, and throws it in)
        const made = ball.y > 80;
        if (made) outside.add(near);
        o.set(near, made ? { x: clamp(ball.x + 4, -24, 24), y: COURT_LEN + OUT } : { x: clamp(ball.x, -24.5, 24.5), y: clamp(ball.y, 0.5, COURT_LEN - 0.5) });
        ball = { ...o.get(near)! };
        does(near, 'hold', at);
        snap(200);
        if (made) {
          does(near, 'inbound', at);
          snap(INBOUND_MS);
        }
        passer = oPids.indexOf(near);
      }
    }
    const from = passer >= 0 ? all[passer] : undefined;
    if (from !== undefined && from !== pid) does(from, 'pass', at);
    does(pid, 'catch', { ...ball });
    ball = { ...at };
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

  /** The offense in its half-court spots (Horns: the two bigs at the elbows), the ball with the handler, the defense matched up. */
  function setUp() {
    for (const pid of oPids) moveTo(pid, spots.get(pid)!);
    if (log.set?.id === 'horns') {
      const other = oInfo.filter((p) => p.pid !== log.set!.pid && p.pid !== holder).sort((a, b) => b.hgt - a.hgt)[0];
      moveTo(log.set.pid, { x: -6, y: 19.5 });
      if (other) moveTo(other.pid, { x: 6, y: 19.5 });
    }
    ball = { ...o.get(holder)! };
    follow();
  }

  function stepFrames(st: PossStep) {
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
            o.set(pid, pid === holder ? { x: clamp(w.x * 0.4, -8, 8), y: 50 } : { x: (e.x + w.x) / 2, y: Math.min(w.y, e.y + 20) });
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
        const hp = o.get(h)!;
        moveTo(scr, { x: hp.x + 3, y: hp.y - 1.5 });
        follow();
        does(scr, 'screen', hp);
        snap(480, screens(scr, h));
        moveTo(h, { x: hp.x - 4, y: hp.y - 6 });
        moveTo(scr, { x: hp.x + 1, y: 12 });
        follow();
        // (the weak side tags the roller)
        help(o.get(scr)!, scr, h);
        snap(520, {
          ...(log.coverage && { flash: { text: title(log.coverage), kind: 'info' as const, x: hp.x, y: hp.y + 3 } }),
          ...cap(`${N(scr)} screens for ${N(h)}${log.coverage && log.coverage !== 'zone' ? `: they ${COVER_VERB[log.coverage]}` : ''}`),
        });
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
        const p = o.get(pid)!;
        moveTo(pid, { x: p.x * 0.35, y: 10 });
        follow();
        // (the nearest help steps in front of him)
        help(o.get(pid)!, pid);
        does(pid, 'drive');
        snap(620, cap(`${N(pid)} drives`));
        break;
      }
      case 'post': {
        const pid = st.pid!;
        const side = (o.get(pid)!.x >= 0 ? 1 : -1) * 7;
        moveTo(pid, { x: side, y: 8 });
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
        moveTo(big, { x: side * 9, y: 21 });
        follow();
        snap(480);
        if (holder !== big) {
          does(holder, 'pass', o.get(big));
          does(big, 'catch', o.get(holder));
        }
        give(big);
        moveTo(sh, { x: side * 11, y: 24 });
        does(big, doing.get(big) ?? 'hold');
        snap(380);
        does(big, 'pass', o.get(sh));
        does(sh, 'catch', o.get(big));
        give(sh);
        moveTo(sh, { x: side * 13, y: 25 });
        follow();
        snap(380, cap(`${N(big)} hands off to ${N(sh)}`));
        break;
      }
      case 'pass': {
        const to = st.pid2!;
        const was = st.pid ?? holder;
        if (was !== to) meet(to, was);
        give(to);
        follow();
        if (was !== to) {
          does(was, 'pass', o.get(to));
          does(to, 'catch', o.get(was));
        }
        snap(360, cap(was !== to ? `${N(was)} finds ${N(to)}` : `${N(to)} has it`));
        break;
      }
      case 'shot': {
        const pid = st.pid!;
        const target = { x: st.x ?? 0, y: st.y ?? 10 };
        moveTo(pid, target);
        give(pid);
        follow();
        // contest: nearest defender closes out to a hand's length, on the basket side
        // (a blocked shot: the man who blocks it is the one who goes up with him)
        const next = steps[at + 1];
        const blocker = next?.k === 'block' && next.pid !== undefined && d.has(next.pid) ? next.pid : undefined;
        const near = blocker ?? [...dPids].sort((a, b) => dist(d.get(a)!, target) - dist(d.get(b)!, target))[0];
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
          for (const [who, spot] of [...o, ...d]) {
            const gap = dist(spot, land);
            if (who === pid || gap >= LAND) continue;
            const [ax, ay] = gap > 0.01 ? [(spot.x - land.x) / gap, (spot.y - land.y) / gap] : [1, 0];
            spot.x = land.x + ax * LAND;
            spot.y = land.y + ay * LAND;
          }
        };
        clearLanding();
        const what = st.d ?? (st.v === 3 ? 'three' : 'jumper');
        does(pid, how, BASKET);
        does(near, blocker !== undefined ? 'block' : 'contest', target);
        snap(300, cap(`${N(pid)}, ${what}…`));
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
        for (const p of dPids) does(p, p === near ? 'land' : boxing.has(p) ? 'boxout' : 'stand', BASKET);
        snap(st.zone === 'rim' ? 380 : Math.round(520 + far * 7), {
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
        const pt = { x: (Math.random() - 0.5) * 8, y: 7 + Math.random() * 4 };
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
        snap(420, {
          flash: { text: st.k === 'steal' ? 'Steal' : 'Turnover', kind: 'to', x: ball.x * 0.5, y: ball.y + 3 },
          ...cap(st.k === 'steal' && stl !== undefined ? (voiced() ?? `${N(stl)} steals it from ${N(st.pid)}!`) : `Turnover, ${N(st.pid ?? holder)}`),
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
        snap(380, {
          ...(on >= 0 && { foul: on }),
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
