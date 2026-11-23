// One figure's body, each frame: the plan (choreo.ts) says where he is, where he faces and what
// he's doing; this turns that into a pose. It picks the clip, blends from the last one, walks his
// feet (a planted foot stays where it landed until it steps), and solves his arms and legs to the
// points the pose asks for. It decides nothing about the game.
//
// Getting around is one stride blended from the captured gaits either side of his speed (a walk, a jog, a
// run, a sprint), at a man's cadence for that speed and his own build. Going ahead his legs are a runner's
// as measured off the same takes (stride.ts): how long each foot is down, where it lands ahead of him, the
// way it swings through behind and under him, and how his hips ride over it; from a jog up his arms are a
// runner's too (Puppet.pump). A planted foot is never dragged
// (he is in the air between strides when he's going faster than it can cover), nor turned flat on the floor:
// it keeps its own heading as his body turns over it, and past what a hip and a knee turn he pivots on its
// ball or picks it up. For the body to read: `feet[k].turn` and `.pitch` (which way each shoe points and its
// roll from heel to toe) and `trail` / `trailSlow` (how far his cloth and hair lag his hips).
//
// No three.js here: joints come out as plain numbers in the figure's own frame (x to his left, y up,
// z the way he faces), for the scene to hang meshes on.
import type { Act, Finish } from '../choreo';
import {
  ARMS,
  CHANNELS,
  bounces,
  CLIPS,
  DUNK_AT,
  DUNKS,
  DUNKS_PLAIN,
  DUNKS_TWO,
  FOLLOW,
  GESTURES,
  HANG_UNTIL,
  I,
  isDunk,
  isMove,
  mirror,
  FANCY,
  MOVES,
  MOVES_SAME,
  N,
  PASS_FOLLOW,
  PASSES,
  REST_POSE,
  sample,
  span,
  SWITCHES,
  SWITCH_DRIVE,
  SWITCH_STILL,
  TRUNK,
  type ClipId,
  type Gesture,
} from './clips';
import { Follow, Lay, type Pace } from './settle';
import { clearOf, SHAPES } from './spacing';
import { downOver, hipsMean, hipsOver, landsAhead, scaled, stancePitch, strideAt, swingAlong, swingEnds, swingPitch, swingUp, type Stride } from './stride';

/**
 * What is laid over a clip is followed, not set (see Lay): a spring at LAY_W a second, no faster than each channel's
 * speed in a second of his time (ft on the 6 ft 6 puppet, radians, a grip's share) nor than its share in a drawn frame.
 * His hands and the ball quickest, his grips a little slower, his elbows, feet and head slower, his chest slower still.
 * His hips (their height, their sway and turn, his stance's width) are as laid, like the jump and the leap to the rim:
 * they go with his feet on the floor, a landing's give on the frame the foot comes down, and followed a beat behind it
 * his knees caught up with a snap.
 */
const LAY_W = 45;
const LAY_SPEED = new Float32Array(N);
const LAY_FRAME = new Float32Array(N);
for (const c of [I.lx, I.ly, I.lz, I.rx, I.ry, I.rz, I.bx, I.by, I.bz]) [LAY_SPEED[c], LAY_FRAME[c]] = [14, 0.4];
for (const c of [I.gl, I.gr]) [LAY_SPEED[c], LAY_FRAME[c]] = [10, 0.35];
for (const c of [I.lsw, I.rsw, I.flu, I.flf, I.fru, I.frf, I.turn]) [LAY_SPEED[c], LAY_FRAME[c]] = [9, 0.3];
for (const c of [I.lean, I.twist, I.tilt, I.nod]) [LAY_SPEED[c], LAY_FRAME[c]] = [6, 0.25];

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** The ball when it isn't his, for his hands to keep out of its way: where it is, and how fast it is going (ft a second of the bodies' time). */
export interface Loose {
  at: V3;
  v: V3;
}

/**
 * A figure's size: `s` scales the 6 ft 6 puppet to his height, `bulk` widens him. And what kind of mover he is, each
 * -1..1 about an average player (0 when not known): how quick, how much spring in his legs, how strong for his size,
 * how skilled with the ball. They pick the way he moves (see Puppet.style), not how well.
 */
export interface Body {
  s: number;
  bulk: number;
  /** How broad across the shoulders, against a man of this size and bulk (none: 1). A woman on the sideline is narrower there: her frame, not only less of her. */
  shoulders?: number;
  quick?: number;
  spring?: number;
  power?: number;
  skill?: number;
}

/** His build from his listed height and weight (and strength rating): a center still looks like a center. `r`: his ratings (speed, athleticism, handle, shooting), for the way he moves. */
export function bodyOf(heightIn: number, weightLb: number, str = 50, r?: { spd?: number; ath?: number; hnd?: number; sht?: number }): Body {
  const h = Math.max(66, Math.min(90, heightIn || 78));
  const bmi = ((weightLb || 215) * 703) / (h * h);
  const bulk = Math.max(0.86, Math.min(1.24, 1 + (bmi - 24.8) * 0.045 + (str - 50) * 0.0015));
  if (!r) return { s: h / 78, bulk };
  const about = (v: number | undefined) => (v === undefined ? 0 : Math.max(-1, Math.min(1, (v - 55) / 25)));
  return {
    s: h / 78,
    bulk,
    quick: about(r.spd),
    spring: about(r.ath),
    power: Math.max(-1, Math.min(1, (bulk - 1) / 0.2 + (str - 55) / 50)),
    skill: about(r.hnd === undefined && r.sht === undefined ? undefined : Math.max(r.hnd ?? 0, r.sht ?? 0)),
  };
}

// the 6 ft 6 puppet, in feet
export const HIP = 3.35;
export const THIGH = 1.62;
export const SHIN = 1.55;
export const ANKLE = 0.28;
export const TORSO = 1.95;
/** His ribs are pitched no farther than this from the line of his trunk (radians: see `spine`). */
export const CURL_MOST = 0.5;
/**
 * His pelvis pitches forward by this share of his trunk's lean (and by the pose's `ptip` more: figure.ts turns the
 * bone, a take's own is measured against it in scripts/mocap/build.ts). A ballplayer leans from his hips, his seat
 * going back as his chest comes forward.
 */
export const PELVIS_LEAN = 0.5;
export const SHOULDER = 0.84;
export const HIP_W = 0.4;
export const UARM = 1.1;
export const FARM = 1.05;
export const HEAD = 0.8;
export const BALL_R = 0.39;
/** The most a stride drops his hips below where the pose has them (a runner's hips stay near level). */
const SINK = 0.16;
/** How far ahead of him or behind a foot is planted, at most. */
const REACH = 1.3;
/** A hand's center sits this far from the ball's. */
const PALM = BALL_R + 0.12;
/**
 * A hand on the ball's side: its wrist this far out from the ball's middle (ft), and down from it as far as the middle
 * of its palm is from the wrist: its palm on the leather and its fingers up the ball (figure.ts lays them there), not
 * its wrist on the ball's middle and its fingers in the air over it.
 */
const SIDE_GRIP = [0.48, -0.17, 0] as const;
/** From this high (ft, on the 6 ft 6 puppet) and lower, a hand on the ball's side is level with its middle (see SIDE_GRIP): all of it 0.6 ft higher. */
const SIDE_LOW = 4.2;
/** The ball lifted up over his head to throw it in takes this much longer (ms) for each ft it goes up, up to LIFT_MS in all. */
const LIFT_PER = 130;
const LIFT_MS = 520;
/** His two sides: 1 his left, -1 his right. */
const SIDES = [1, -1] as const;
/**
 * A defender on the ball within GUARD_NEAR ft of it (all of it GUARD_EASE ft nearer, on the 6 ft 6 puppet): the hand on
 * its side GUARD_LOW from its shoulder (out to that side, up, ahead: low at it) and GUARD_TO_BALL of the way across to
 * it, the other GUARD_UP (up in the passing lane), GUARD_K of the way from where his stance has them (GUARD_SLIDE of
 * that sliding with his man). Set in his stance, with the ball
 * within SWIPE_NEAR ft and under SWIPE_LOW ft, the low hand takes a swipe at it every SWIPE_EVERY ms or so, over SWIPE_MS
 * (it comes up beside the ball, never through it: see dodge).
 */
const GUARD_NEAR = 7;
const GUARD_EASE = 2;
const GUARD_LOW: readonly [number, number, number] = [0.45, -1.45, 1.25];
const GUARD_UP: readonly [number, number, number] = [0.8, 0.45, 0.65];
const GUARD_TO_BALL = 0.15;
const GUARD_K = 0.85;
const GUARD_SLIDE = 0.55;
const SWIPE_NEAR = 4.2;
const SWIPE_LOW = 3.8;
const SWIPE_EVERY = 1700;
const SWIPE_MS = 260;
/**
 * A contest within VERT_NEAR ft of a man going up at the rim (AT_RIM) is both arms straight up (all of it 0.8 ft
 * nearer); otherwise the hand on the ball's side goes up at it (CONTEST_TOWARD of the way out to it, high, and never
 * nearer it than CONTEST_SHORT ft: in the shooter's sight, not reached through his arms), and the other, if the move
 * had that one up, comes down to CONTEST_LOW from its shoulder.
 */
const VERT_NEAR = 3.4;
/** The shots taken at the rim, that a man contests with his arms straight up (see VERT_NEAR). */
const AT_RIM = new Set<ClipId>(['layup', 'putback', ...DUNKS, 'hook', 'floater']);
const CONTEST_LOW: readonly [number, number, number] = [0.8, -0.6, 0.6];
const CONTEST_SHORT = 1.0;
const CONTEST_TOWARD = 0.6;
/** A defender getting about (these clips) with a man driving by him within CHECK_NEAR ft has a hand on his hip, CHECK_K of the way. */
const CHECKS = new Set<ClipId>(['stance', 'shuffle', 'backpedal', 'jog', 'run', 'closeout']);
const CHECK_NEAR = 3.4;
const CHECK_K = 0.75;
/** Leaning on a man (a box-out, the man boxed out, a post), his hands are on him this far (0..1, by how hard he is leaning). */
const LEAN_HANDS = 0.85;
/** ...and they go to him over this long (ms, his own) from when he took the lean up; and come off him over LEAN_OUT once he goes up for the ball, not the frame he does. */
const LEAN_IN = 260;
const LEAN_OUT = 180;
/** Leaning on a man, a foot is put down no nearer either of the other man's than this (ft, on the 6 ft 6 puppet: two shins and a little). */
const FOOT_OFF = 0.55;
/** A screener's hands, in across his chest (the screen clip's: each from its shoulder, out, up, ahead: ft, on the 6 ft 6 puppet): the left's and the right's. */
const SCREEN_ARMS: readonly [readonly [number, number, number], readonly [number, number, number]] = [
  [-0.55, -0.95, 0.5],
  [-0.55, -1.1, 0.42],
];
/**
 * His hands' going from where his move has the ball to where it is in the scene (coming to him, leaving him), and back:
 * all the way in no less than 1 / BALL_TO seconds of his own time, nor more than BALL_TO_FRAME of it in a drawn frame.
 */
const BALL_TO = 7;
const BALL_TO_FRAME = 0.2;
/**
 * A boxer's hands, each from its shoulder (out, up, ahead: ft, on the 6 ft 6 puppet); the man boxed out's hand on the
 * boxer's side (how far out from the boxer's middle, how high, and no nearer ahead of his own middle than this), and
 * his other hand up over him for the ball (from its shoulder: out, up, ahead). The hand on him is the one on the side
 * the boxer is, changed once the boxer is BAR_SWAP ft across to the other, and never across his own middle past BAR_IN.
 */
const BOX_HANDS: readonly [number, number, number] = [1.5, 0.1, 0.3];
const CRASH_BAR: readonly [number, number, number] = [0.75, 3.7, 1.2];
const BAR_SWAP = 0.6;
const BAR_IN = 0.15;
const CRASH_UP: readonly [number, number, number] = [0.7, 1.85, 0.35];
/** A hand after something (see guard) is kept at least this far from its shoulder (ft, on the 6 ft 6 puppet). */
const AIM_NEAR = 1.3;
/** A hand on the ball is never nearer its shoulder than this (ft, the 6 ft 6 puppet's): its elbow bent no tighter than about 45 degrees. */
const HOLD_NEAR = 0.85;
/** The ball crosses this far (ft) to his other side before the hand on its side changes (see guard). */
const SIDE_SWAP = 0.45;
/** A hand let hang from its shoulder (ft, out to its side, up, ahead): where a move that holds the ball has his hands while it isn't his. */
const HANG: readonly [number, number, number] = [0.3, -1.95, 0.2];
/** A hand goes from one side of the ball to another (a catch into a dribble) over about this long (ms). */
const GRIP_MS = 55;
/** A dribble picked up with the ball off his hand comes on up off the floor into his hands over this long (ms of his own), slowing as it gets there. */
const PICK_MS = 260;
/** A gathered dribble is in his hands this long (the move's ms) before the catch's moment: they have it by then. */
const GATHER_LATE = 60;
/** With less time than this to it (ms), the ball is not bounced first. */
const GATHER_LEAST = 150;
/** The ball is kept in the reach of the hand that has it from REACH_FROM of a hold on (half a hold in a dribble), all of it REACH_TAKE more of a hold later. */
const REACH_FROM = 0.02;
const REACH_TAKE = 0.2;
/**
 * A forearm is this thick (ft from its line, on the 6 ft 6 puppet: spacing.ts's), the ball in his hands may lie
 * this far onto it (the wrist and fingers on the leather), and it is moved off it this far at most.
 */
const FOREARM = 0.13;
const FORE_ON = 0.06;
const FORE_MOST = 0.25;
/** A dunker's middle stays this far from the rim's (on the 6 ft 6 puppet), and he walks back from a leap at this speed, ft a second. */
const DUNK_OFF = 2.0;
/** Which way out from the rim he hangs: the way he came, tipped this much (ft) toward the open floor, away from the board. */
const DUNK_OPEN = 1.5;
const BACK = 9;
/** The rim's height, ft. */
const RIM_Y = 10;
/**
 * A dunker's hands get to the rim: he jumps as high as that takes. The dunk clip's own jump (its highest
 * `hip` key), what he has above his hips at the slam (chest, and an arm up and out to the ring) on the
 * 6 ft 6 puppet, and the most the jump is stretched for a short man.
 */
const DUNK_HIP = 2.3;
const DUNK_ARM = 3.19;
const DUNK_RISE = 1.6;
/** The ball starts for the rim this long (ms) before the slam, and is level with the ring at it. */
const DUNK_REACH = 150;
/** A blocked dunk gets this much of the way from his chest to the rim before the hand meets it. */
const STUFFED = 0.5;
/** A plan spot this far (ft) from the last frame's is a new possession from fresh spots, not a move (the scene says so of nearer ones: `Drive.cut`). */
const CUT = 14;
/** One pose eases into the next over this long (ms): longer into the buzzer's (arms going up are not thrown up). */
const BLEND_MS = 130;
/**
 * And a blend goes by his own time only up to this many times the clock's (his pose time: `soft` in update): played at
 * 4x a frame is 67 ms of his time, and a blend of 130 was over in two of them (a pose thrown, not eased: dribble to pass,
 * rebound to outlet, slide to run). The stride's mix by his speed, a slide's flip and a brace go by it too (the mix: a
 * fifth fewer pops in a steady gait at 4x, for a few more of his head's). Not what decides what he does (a braking
 * step, a push-off: on it, men braked out of a walk), nor his lean into a start.
 */
const BLEND_PACE = 2;
const BLEND_SLOW = 380;
const BLEND_GAIT = 220;
/** A hand with more than ARM_FAR (ft) to go into a stance or a stride takes BLEND_FT ms more for each ft over, up to BLEND_FAR ms in all. */
const ARM_FAR = 0.6;
const BLEND_FT = 120;
const BLEND_FAR = 320;
/** A ball more than BALL_FAR ft below an overhead pass's wind-up (taken up off a dribble) takes twice BLEND_FT ms more for each ft over. */
const BALL_FAR = 2.5;
/** A hand that goes up or down past his shoulder by more than this (ft) swings out in front of him on the way, this far at most. */
const ARC_FROM = 1.5;
const ARC = 0.9;
/**
 * Sliding sideways, the feet keep this much of the floor between them: the trailing one never crosses the leading one
 * (a swinging foot eased out to its own side over about SIDE_MS ms, and back in over SIDE_BACK_MS).
 * A slide's step covers no more than SLIDE_REACH ft of his way (on the 6 ft 6 puppet), each foot down no more than
 * SLIDE_DOWN of its stride: the lead foot out and down, the other pushed off and closed, not a long stride that lets
 * him pass over the foot ahead of him.
 */
const FEET_GAP = 0.7;
const SIDE_MS = 25;
const SIDE_BACK_MS = 80;
/** And by no more than this (ft) in a drawn frame, however fast the game is played: at 4x it was most of the gap in one. */
const SIDE_FRAME = 0.12;
/**
 * A planted foot is picked up the frame before his body, going the way it goes, would have its leg straighter than
 * this at the knee (radians): not left down until its turn comes and then thrown the length of his stride in a frame
 * or two (at 4x a slide's trailing knee went 105 to 158 to 84 degrees). A runner's push-off is about this straight.
 */
const LOCK_KNEE = 2.8;
/**
 * Going, or getting up to, faster than LEAD_FROM ft a second (all of it LEAD_SPAN on), his way more than LEAD_OFF radians
 * round from the way he faces (all of it LEAD_OFF_SPAN past that), his hips and legs come round toward it ahead of his body, as a
 * defender opens his hips to run with his man while his eyes stay on him: up to LEAD_MAX radians, over LEAD_MS ms of
 * his own time and no more than LEAD_FRAME a frame. His feet step and point that way, his knees over them, and his
 * pelvis turns LEAD_PELVIS of it. His chest, head and arms stay with the way he faces, which turns as it did. So a turn
 * the clock holds back at 4x is never a ten-foot sideways run on a slide's legs.
 */
const LEAD_FROM = 8;
const LEAD_SPAN = 6;
const LEAD_OFF = 0.45;
const LEAD_OFF_SPAN = 0.5;
const LEAD_MAX = 1.0;
const LEAD_MS = 80;
const LEAD_FRAME = 0.2;
const LEAD_PELVIS = 0.8;
const SLIDE_REACH = 1.2;
const SLIDE_DOWN = 0.4;
/** One way of standing eases into another over this long (ms): hands go to the hips, they aren't thrown there. */
const BLEND_REST = 420;
/**
 * Where he looks. His head turns up to HEAD_MAX (radians) on his shoulders and his chest turns the rest, up to
 * CHEST_MAX and a share of the whole, when his hands are free; LOOK_MAX in all (LOOK_RUN running: a runner looks
 * where he's going). A thing farther round than LOOK_BACK is behind him: he doesn't look for it.
 */
const HEAD_MAX = 1.05;
const CHEST_MAX = 0.3;
const CHEST_SHARE = 0.3;
const LOOK_MAX = 1.35;
const LOOK_RUN = 0.8;
const LOOK_BACK = 2.4;
/** His eyes find a thing in about this long (s): quick, but a turn of the head, not a snap. */
const GAZE_S = 0.13;
/** His chest turns with his eyes once his hands are free, coming to it over about this long (ms). */
const FREE_MS = 110;
/** How hard he has been going, 0..1: running builds it (this much a second for each ft a second), standing lets it go (this much a second). */
const EFFORT_UP = 0.0075;
const EFFORT_DOWN = 0.045;
/** Late in a close game he is at least this tired. */
const TIRED_LATE = 0.45;
/** His breath, standing: the chest lifts this much (radians) at rest, and this much more when he's spent. */
const BREATH = 0.012;
const BREATH_HARD = 0.032;
/** A defender's hands: how far they move about (ft), never still. */
const FLUTTER = 0.08;
/** Starting he leans into it, stopping back against it: radians for each ft a second gained or lost, and at most. */
const LEAN_GO = 0.011;
const LEAN_MAX = 0.13;
/** A jumper's follow-through is held from this long after the release (ms) until the ball gets there, and is taken up over about this long. */
const FOLLOW_FROM = 30;
const FOLLOW_IN = 110;
/** Held, his guide hand is this far further out from the shot's line (ft) for a man whose guide hand flies off the most. */
const GUIDE_OUT = 0.22;
/** A spring (see spring) at this rate over a number of ms gets all but there in that many ms: EASE_OVER / ms. */
const EASE_OVER = 4000;
/** A pass's arms go on after the ball from PASS_FROM ms after it leaves, held until PASS_HOLD, and let go of over about PASS_LET ms. */
const PASS_FROM = 30;
const PASS_HOLD = 230;
const PASS_LET = 230;
/** A shot's lead-in (the gather, the dip) is played at most this many times quicker to fit a short move. */
const LEAD_IN = 1.6;
/** A hand-off is planned to change hands this far through its move (the play's): see exchange.ts for when it does. */
export const HANDOFF_AT = 0.3;
/** A hand-off is held out no farther round him than this (radians, either way from where he faces): see ballWant. */
const OFFER_ARC = 1.35;
/** A dribbler standing with it crosses it over now and then: every this long (ms), give or take half again. */
const CROSS_EVERY = 1500;
/** The most of the floor a planted foot covers under him, from where it lands ahead to where it leaves behind (ft on the 6 ft 6 puppet): past that he is in the air between strides. */
const CONTACT = 2.4;
/** Walking, a foot is down this much of its stride (both are, between steps). */
const DOWN_WALK = 0.56;
/** The gaits going ahead, and the speed (ft a second) each was captured near: between two, he moves as a blend of both on the one stride. */
const AHEAD: readonly [ClipId, number][] = [
  ['walk', 4],
  ['jog', 10],
  ['run', 18],
  ['sprint', 30],
];
const FORWARD = new Set<ClipId>(AHEAD.map((g) => g[0]));
/** The throws: from the move's start the ball is on its way, out of his hands. */
const THROWN = new Set<ClipId>(PASSES);
/**
 * Where in each captured forward gait the take's left foot is down, the middle of its time on the floor (a fraction of
 * the stride): his feet are his own stride's (see step), and the take's hips and arms go by the take's feet, so each is
 * sampled that far off his phase. His hips are then lowest over the foot he has down and his arms at their swing's ends
 * as a foot lands, as a runner's are, not a quarter of a stride out.
 */
const STANCE = new Map<ClipId, number>();
function stanceOf(id: ClipId): number {
  let at = STANCE.get(id);
  if (at !== undefined) return at;
  const c = CLIPS[id];
  const n = 80;
  const up: number[] = [];
  const out = new Float32Array(N);
  for (let i = 0; i < n; i++) up.push(sample(c, i / n, out)[I.flu]);
  const lo = Math.min(...up);
  const hi = Math.max(...up);
  // (the middle of the stretch it is lowest, round the loop)
  let sx = 0;
  let sy = 0;
  up.forEach((u, i) => {
    if (u > lo + 0.15 * (hi - lo)) return;
    sx += Math.cos((2 * Math.PI * i) / n);
    sy += Math.sin((2 * Math.PI * i) / n);
  });
  at = (Math.atan2(sy, sx) / (2 * Math.PI) + 1) % 1;
  STANCE.set(id, at);
  let hip = 0;
  for (let i = 0; i < n; i++) hip += sample(c, i / n, out)[I.hip] / n;
  HIP_MEAN.set(id, hip);
  return at;
}
/** Each forward gait's hips through its stride, on average: what his bob goes up and down about (see stride). */
const HIP_MEAN = new Map<ClipId, number>();
/**
 * Played fast his hips bob less, down to BOB_FAST of the take's at a frame of BOB_FAST_MS (the bodies' ms): the take's
 * dip over the foot he has down comes in a frame or two there, and his knee would fold with it in one.
 */
const BOB_FAST = 0.35;
/** And his chest turns against his hips this much less at that speed. */
const TWIST_FAST = 0.5;
/** At 4x a foot backing up or sliding comes up no higher than this (ft, the 6 ft 6 puppet's): see step. */
const BACK_LIFT_FAST = 0.3;
/**
 * A foot in the air comes no nearer its hip in a drawn frame than this (ft, on the 6 ft 6 puppet: about 40 degrees of
 * knee); one that was more than KNEE_FOLD_FAR ft from where it is now wanted (a man put somewhere new) is left alone.
 */
const KNEE_FOLD = 0.4;
const KNEE_FOLD_FAR = 5;
const BOB_FROM_MS = 17;
const BOB_FAST_MS = 67;
/** Round a bend he leans into it: radians for each ft a second squared across his path, and at most. */
const BANK = 0.0032;
const BANK_MAX = 0.17;
/** A man on his way up the floor says something to a teammate, or points him somewhere, about this often (ms of walking). */
const TALK_EVERY = 1900;
/** A defender closing out breaks his run down into short quick steps: this many times his cadence, sat this much lower (ft). */
const CHOP_RATE = 1.75;
const CHOP_SIT = 0.17;
/**
 * A hard change of direction at a run (ft a second squared across his path): he plants, sinks (ft) and goes, over this
 * long (ms); his feet turn over up to PLANT_SLOW slower through it (a beat on the foot he plants, his weight going onto
 * it), and that foot comes down flat, not on its heel.
 */
const PLANT_AT = 70;
const PLANT_SINK = 0.2;
const PLANT_MS = 300;
const PLANT_SLOW = 0.25;
/**
 * A cut is made one of three ways (see CUTS), a stop one of three, a landing one of four: which is his own and the
 * moment's, chosen as it begins and kept through it. A cut harder than PLANT_HARD (ft a second squared across his path)
 * is planted and driven out of, or stuttered into; a softer one is rounded off, or planted. Each: how deep he sinks into
 * it and how far his hips go over the foot (against PLANT_SINK and the plain plant's), how long his head stays on the
 * way he was going, and how hard he drives out of it (his chest into the new way, the arm on that side punched through).
 *   0 plant and drive   1 rounded off at speed   2 stuttered: short quick steps into it, then away   3 the plain plant
 */
const PLANT_HARD = 115;
const CUTS: readonly { sink: number; sway: number; head: number; out: number }[] = [
  { sink: 1.2, sway: 1.2, head: 1, out: 1 },
  { sink: 0.5, sway: 0.55, head: 0.35, out: 0.25 },
  { sink: 0.9, sway: 0.8, head: 0.7, out: 0.6 },
  { sink: 1, sway: 1, head: 1, out: 0 },
];
/** A cut made with a man nearer than this (ft, middle to middle, on the 6 ft 6 puppet) is the plain plant (the last of CUTS). */
const CUT_ROOM = 3.6;
/** A step of his own (see stepOut) is its whole length with the nearest man STEP_ROOM ft off or more, and not taken with him nearer than STEP_TIGHT. */
const STEP_ROOM = 4.2;
const STEP_TIGHT = 2.8;
/** Short quick steps under him (a stutter into a cut or a stop) last this long (ms), and come and go over STUTTER_EASE. */
const STUTTER_MS = 260;
const STUTTER_EASE = 70;
/** Coming down still going faster than this (ft a second) he takes a step the way he was going, LAND_CARRY_FT ft for each ft a second, between LAND_STEP_LEAST and LAND_STEP_MOST (on the 6 ft 6 puppet). */
const LAND_CARRY = 3;
const LAND_CARRY_FT = 0.055;
const LAND_STEP_LEAST = 0.3;
const LAND_STEP_MOST = 0.85;
/** From standing, a man going this fast (ft a second) before his eased speed is half of it has set off at a run: his first step is the captured one. */
const START_AT = 7.5;
/** Setting off from a stand his push-off lasts this long (ms of his own): his chest PUSH_LEAN radians further into it and his hips PUSH_SIT ft lower, at its height (his arms drive harder as he gets going anyway: see manner). */
const PUSH_MS = 420;
const PUSH_LEAN = 0.16;
const PUSH_SIT = 0.12;
/** Coming down out of a run below this (ft a second) he plants to stop (see the stop clip). */
const STOP_AT = 2.5;
/**
 * After the buzzer (see life): his first beat of it ENCORE_FIRST ms or so after it goes, the rest ENCORE_MS or so apart,
 * each his own; the gestures of a man glad of it (in a clip of joy) and of one sore about it.
 */
const ENCORE_FIRST = 1400;
const ENCORE_MS = 1700;
const GLAD = new Set<ClipId>(['celebrate', 'cheer', 'idle', 'idle2', 'idle3']);
const SORE = new Set<ClipId>(['rue', 'slump', 'hips', 'crouch']);
const GLAD_BEATS: Gesture[] = ['fist', 'roar', 'point', 'clap', 'flex'];
const SORE_BEATS: Gesture[] = ['wipe', 'tug', 'head'];
/** A step-back jumper: how far ahead of his spot (ft) he starts, leaning in, before he hops back onto it. */
const STEP_BACK = 1.15;
/** A man standing on the weak side (the ball farther off than this, ft) may stand tall with a hand on his hip; nearer it he is ready. */
const WEAK_SIDE = 24;
/** A catch's last beat (the ball down on his hip) is dropped if he is already going, this fast (ft a second), this long after it (ms). */
const CATCH_GO = 4;
const CATCH_HELD = 200;
/** With a dead ball a man fidgets (wipes his brow, pulls at his shorts) about this often (ms). */
const FIDGET_EVERY = 2800;
/** Coming down from a jump: how far his hips give at most (ft, for a jump of LAND_HIGH ft or more), over how long (ms): down fast, a beat at the bottom, up slower. */
const LAND_DIP = 0.3;
const LAND_HIGH = 1.6;
const LAND_MS = 380;
/** Starting and stopping he leans no more than LEAN_MAX, and less going slower than this (ft a second). */
const LEAN_FULL = 14;
/** A slide keeps him low: his hips this far down (ft), the clip's bob kept to this share of itself. */
const SLIDE_HIP = -0.56;
const SLIDE_BOB = 0.45;
/** A defender whose man has got by him: past this speed (ft a second) going this far round from where he faces (radians), a slide can't keep up and he opens his hips and runs, his eyes still on the play; into it and out of it over about this long (ms). */
const BEATEN_AT = 13;
const BEATEN_ROUND = 1.1;
const BEATEN_MS = 130;
/** Body to body (Drive.touch): he sits this much lower to take it (ft), comes to it over about this long (ms), and the two push and give at about this rate (radians a ms). */
const CONTACT_SIT = 0.12;
const CONTACT_MS = 110;
const SHOVE_RATE = 0.012;
/** Two pushing and giving as one (see contact): how far each one's hips go along the line to the other (on the pose's scale) and how much more he leans into him as he gives (radians). */
const SHOVE_GO = 0.06;
const SHOVE_LEAN = 0.04;
/**
 * A knock (Puppet.hit) throws his trunk at up to JOLT_V ft a second, and it comes back as a spring of JOLT_W radians a
 * second, JOLT_DAMP of the way to not overshooting (a little under: it rocks back past once): about a sixth of a ft
 * at its hardest, back in about a third of a second.
 */
const JOLT_V = 4.2;
/** A man set for a knock (a screener, a man sat in his box-out) is thrown this share as far; and he meets it his way over this long (ms: see braced). */
const BRACED = 0.5;
const MEET_SHOW = 420;
const JOLT_W = 13;
const JOLT_DAMP = 0.55;
/** A hard knock throws him this much farther again, at full power (a share; half power, half of it). */
const JOLT_HARD = 0.7;
/** His head follows a knock's throw of his trunk on a spring this slow (radians a second), nodding by this much for each ft it lags (radians). */
const HEAD_LATE_W = 7;
const HEAD_LATE = 1.1;
/** A knock this hard (or harder) and he takes a step to it: the foot out that way this far at full power (ft, on the 6 ft 6 puppet), taken within this long (ms) or not at all. */
const CATCH_FROM = 0.5;
/** And from this hard in a screen, a box-out or a drive, unless he is the man set for it (see hit). */
const CATCH_MET = 0.3;
/** A man going slower than this (ft a second) when a driver runs into him is set for it: he holds his ground. */
const STAND_SET = 3;
const CATCH_FT = 1.0;
const CATCH_MS = 450;
/**
 * And that step is taken once his body has taken the knock (ms, his own: see knock): it sits into it first, so the
 * contact and the step that recovers from it are two beats, not one.
 */
const CATCH_LAG = 110;
/**
 * A step on its turn is not begun with less of its swing left than this many drawn frames: played fast, a foot that
 * missed the start of its swing went the whole of its step in one frame. It waits for its next turn (or is picked up
 * when it must be: see LOCK_KNEE).
 */
const SWING_LEAST_FRAMES = 1.6;
/**
 * How far apart his feet go under him follows his pose's width over WIDE_MS ms of his own time, and by no more than
 * WIDE_FRAME a drawn frame: a slide's own clip widens and closes with each step, and at 4x, sampled a fifth of a stride
 * apart, the place each foot goes moved half a foot sideways in a frame and the foot with it.
 */
const WIDE_MS = 90;
const WIDE_FRAME = 0.12;
/** Another man's trunk, head and thighs are looked at for a hand of his within this (ft, on the 6 ft 6 puppet), and a hand and an arm are this thick (ft, the same). */
const CROWD = 4;
const HAND_R = 0.13;
const ARM_R = 0.15;
/** His fingers, past the wrist, are this thick (ft, the same): for keeping them off the ball (see clearArm). */
const FINGERS_R = 0.1;
/** Out of another man a hand comes no faster than PULL_IN (ft a second, the 6 ft 6 puppet's). */
const PULL_IN = 14;
/** An arm starts to give way to a man this far before it gets to him (ft), a little at first: it bends round him, it isn't knocked off him in a frame. */
const PULL_SOFT = 0.22;
/** His elbow and forearm looked at again, and the hand drawn back off a man, up to this many times a frame. */
const ARM_PASSES = 3;
/** Where along his forearm it is looked at for another man (0 the elbow, 1 the wrist). */
const PULL_AT = [0, 0.5, 1] as const;
/** The first joint of each of SHAPES's arm bones (a shoulder, an elbow): a hand rests on a man's arm, not in it. */
const ARM_SHAPE = new Set([3, 4, 6, 7]);
/**
 * A free hand keeps out of the ball's way when the ball isn't his: out of where it is and where it will be DODGE_S
 * seconds on (the bodies' time), by DODGE_GAP ft more than the ball and a hand. A contest comes up beside the shot, a
 * hand in a passing lane comes off the pass: near it, never through it. Looked for only with the ball within reach.
 */
const DODGE_S = 0.12;
/** Where along his arm it is kept out of the ball (see clearArm): under 0 down the upper arm from the shoulder, 0..1 down the forearm, past 1 the hand. */
const CLEAR_AT: readonly number[] = [-0.5, 0, 0.5, 1, 1.4];
/** The middle of an upper arm in the ball's way is moved off it by moving the hand this many times as far. */
const UPPER_LEVER = 3;
const DODGE_GAP = 0.06;
const DODGE_SOFT = 0.3;
/**
 * A fast ball caught is given with: the hands (and the ball in them) go on the way it came, toward his chest, for
 * GIVE_IN ms and come back over GIVE_OUT; by GIVE_PER of its speed (ft for each ft a second), past GIVE_FROM ft a
 * second, and GIVE_MOST ft at most (on the 6 ft 6 puppet).
 */
const GIVE_IN = 120;
const GIVE_OUT = 200;
const GIVE_PER = 0.011;
const GIVE_FROM = 12;
const GIVE_MOST = 0.42;
/**
 * A pass on its way to him is met, not grabbed at: his hands go out (from as soon as his catch has a share of
 * CATCH_SHOW of a hold of it) to where it will come to them, CATCH_OUT ft (on the 6 ft 6 puppet) out from where he
 * takes it toward where it is coming from, and wait for it there: it is flown into them there, and comes on in with
 * them to where he takes it over about CATCH_IN ms.
 */
const CATCH_OUT = 0.85;
const CATCH_SHOW = 0.45;
const CATCH_IN = 160;
/**
 * Hands out for a pass go no farther to a side of him than CATCH_WIDE of the way they go out (it is met in front of him);
 * a low one has his knees bend for it, his hips CATCH_SIT ft lower for each ft lower his hands are out for it, and he
 * leans over it CATCH_LEAN radians for each.
 */
const CATCH_WIDE = 0.5;
const CATCH_SIT = 0.9;
const CATCH_LEAN = 0.3;
const CATCH_SIT_MS = 90;
/** A ball held still somewhere (a referee's hands) slower than this (ft a second) isn't reached out to: he waits for it where it will be put. */
const CATCH_STILL = 4;
/**
 * A rebound is taken as high as the ball is when he gets to it: from REB_LOW ft (his chest: no jump for it) to
 * REB_TOP (both arms up at the top of his jump, the clip's own), on the 6 ft 6 puppet; and drawn in to where the clip
 * holds it over REB_IN ms. Taken low, his hands go no higher than REB_HANDS (from his shoulders, ft) before it comes.
 */
const REB_LOW = 4.9;
const REB_TOP = 9.9;
const REB_IN = 320;
/** Out of the rebound before that (straight back up with it, or a pass), what is left of it goes over about this long (ms). */
const REB_OUT = 140;
const REB_HANDS = 0.3;
/** A five changes hands once his teammate is this far (ft) over to his other side. */
const FIVE_SWAP = 0.8;
/** A swinging foot covers the floor no faster than this many times his speed, and this much more (ft a second). */
const FOOT_SWING = 2.6;
const FOOT_SWING_MIN = 9;
/**
 * And it gathers speed or gives it up no quicker than this (ft a second, each second), and this much more for each ft
 * a second he goes: a foot in the air is swung, it doesn't jump back a foot for a frame and forward again as his stride
 * is laid out anew under it (into a run out of a slide, his cadence changing).
 */
const FOOT_ACC = 500;
/**
 * A stride going ahead (see stride.ts). As he leaves a foot behind him his heel is up, and his ankle this far nearer
 * him and this much higher than the foot's place on the floor (ft on the puppet): his leg straightens to there before the foot is
 * picked up ahead of its turn (see LOCK_KNEE). Its pitch follows a runner's over STRIDE_ROLL ms. And at 4x, where a
 * stride is four drawn frames, its heel comes up this much less far.
 */
const STRIDE_HEEL = [0.45, 0.35] as const;
/** At a run his feet come down this much nearer his middle than he stands (a share of his stance's half-width), and a swinging leg's knee goes this far out from straight ahead (the pole's sideways part; KNEE_OUT standing). */
const STRIDE_NARROW = 0.55;
/** A swinging foot's ankle comes no nearer under his hips than this (ft on the puppet). */
const STRIDE_UNDER = 1.0;
/**
 * Reaching for the floor a runner's foot goes out past where it will land and is drawn back onto it. The puppet's goes
 * this share of that far: all of it, his leg was dead straight in front of him (the takes' runners' nearly were), and
 * its knee shut in the frame his weight came onto it.
 */
const STRIDE_OVER = 0.55;
/** A stride's foot gathers the speed its swing begins at over about this long (ms), from rest on the floor. */
const STRIDE_PEEL = 65;
/** No more of a rise than this is taken off its first frame (ft a ms). And where it is to land ahead of him follows his stride over this long (ms). */
const STRIDE_PEEL_UP = 0.022;
const STRIDE_LAND_MS = 110;
const KNEE_OUT = 0.25;
const KNEE_OUT_RUN = 0.08;
/**
 * A runner's arms (see Puppet.pump): his own from PUMP_FROM ft a second, all of the way by PUMP_FULL, driven hardest
 * at PUMP_SPRINT. The upper arm hangs PUMP_HANG from straight down (radians, forward) and swings PUMP_SWING each way
 * (at a run, flat out); the forearm is bent PUMP_BEND up from it, and PUMP_SHUT more in front of him, as much less
 * behind. The hand is PUMP_OUT outside its shoulder (ft on the puppet), and comes PUMP_IN in toward his middle in
 * front. And it is farthest back as the knee on its side is farthest through: PUMP_KNEE of the way through that foot's swing.
 * At 4x it swings PUMP_FAST less far.
 */
const PUMP_FROM = 5.5;
const PUMP_FULL = 10;
const PUMP_SPRINT = 27;
const PUMP_HANG = -0.3;
const PUMP_SWING = [0.4, 0.85] as const;
const PUMP_BEND = [1.42, 1.62] as const;
const PUMP_SHUT = 0.24;
const PUMP_OUT = 0.3;
const PUMP_IN = 0.42;
const PUMP_KNEE = 0.78;
const PUMP_FAST = 0.45;
const STRIDE_ROLL = 22;
const STRIDE_FAST = 0.35;
/** A runner's stride is taken up to this far toward a 4x frame (see BOB_FAST_MS): 2x is 0.32 of the way. */
const STRIDE_UNTIL = 0.6;
const FOOT_ACC_SP = 45;
/** Where the two hands meet that far behind him (ft), he doesn't reach back for it. */
const FIVE_BACK = 1.2;
/** A hand on its way somewhere is never carried nearer its own shoulder than this (ft), unless that is where it is going: an arm folded that far whips its elbow round. */
const HAND_NEAR = 1.0;
/** His head turns aside off another man's by this much at most (ft). */
const HEAD_GIVE_FT = 0.35;
/**
 * Where a hand is wanted off its path (see settle.ts) it gets to over about HAND_MS, no faster than HAND_SPEED ft a
 * second; on the ball, over about HAND_HELD_MS.
 */
const HAND_MS = 90;
const HAND_HELD_MS = 25;
const HAND_SPEED = 16;
/**
 * A hand going onto a hand-off gets there over about HAND_TAKE_MS, no faster than HAND_TAKE_SPEED ft a second; the ball
 * is in a hand only as far as it has got to it (see holds: TAKE_FAR).
 */
const HAND_TAKE_MS = 85;
const HAND_TAKE_SPEED = 20;
/** His hands are sent out to a hand-off held out to him over no less than this long (ms, his own). */
const TAKE_OUT_MS = 90;
/** A hand sent to a hand-off is on it, and goes with it wherever it goes, once it is within this (ft) of its place on it. */
const STICK = 0.45;
/**
 * A hand laid off its path (see settle.ts): free, its spring is HAND_MS's (his handK's), no faster than HAND_SPEED ft a
 * second nor FREE_FRAME ft a drawn frame; on the ball HAND_HELD_MS's, HELD_SPEED and HELD_FRAME; on the ring RIM_*.
 */
const HELD_SPEED = 40;
const FREE_FRAME = 0.45;
const HELD_FRAME = 0.9;
const RIM_W = 60;
const RIM_SPEED = 40;
const RIM_FRAME = 1;
const HAND_PACE: Pace = { w: 1, speed: 1, frame: 1, most: 3 };
/** A hand goes from where his clip has it onto the ball, or back, no faster than this (ft a second), nor farther than GRIP_FRAME in a drawn frame: see arms. */
const GRIP_SPEED = 14;
const GRIP_FRAME = 0.75;
/** Drawn off a man no faster than PULL_IN ft a second, PULL_LEAST a frame at the least and PULL_FRAME a drawn frame at the most. */
const PULL_LEAST = 0.06;
const PULL_FRAME = 0.75;
/** A hand pushed off a man is pushed at most this much farther each drawn frame than the frame before (ft): from rest it moves a little the first frame, more the next. */
const PUSH_GROW = 0.14;
/** A free hand starts to give way to a man this far before it gets to him (ft): it comes to rest on him, it isn't knocked off him. */
const HAND_SOFT = 0.12;
/** A ball more than BALL_NEAR ft off where he would have it is not gone to by his hands; twice as far, not at all (see arms). */
const BALL_NEAR = 1.2;
const TAKE_FAR = 1.0;
/**
 * The ball he has, or will (see settleBall): a jump in where he wants it is come back from at BALL_PACE; off his own
 * body it is pushed no faster than BALL_OUT ft a second (BALL_OUT_LEAST a frame at the least).
 */
const BALL_PACE: Pace = { w: 30, speed: 20, frame: 0.45, most: 2.5 };
const BALL_OUT = 20;
const BALL_OUT_LEAST = 0.12;
/** What is left of the ball in his hands in his own body is taken out of it no faster than this (ft a second: see clearHeld). */
const HELD_OUT = 12;
/**
 * An elbow's point (where it bends out to, square to the line from shoulder to hand) turns no faster than ELBOW_TURN
 * radians a second: a hand that passes by the line its elbow hangs on doesn't flip the elbow over in a frame. Its
 * swing round the arm goes no farther than SWIVEL_MAX (radians) either way from where it hangs; and a hand on the
 * ball has its elbow put (GRIP_POLE of the way) where the forearm needn't twist for the palm to face the ball.
 */
const ELBOW_TURN = 11;
/**
 * A man's trunk within TUCK_FROM ft of a free arm's shoulder, to that side (see crowded), has the arm come in to him
 * (the hand to TUCK from that shoulder: ft out to that side, up, ahead) or, a hand already up, go on up (TUCK_UP),
 * all the way by TUCK_SPAN ft nearer: in a crowd arms are kept in or up, not through the next man.
 */
const TUCK_FROM = 1.15;
const TUCK_SPAN = 0.6;
const TUCK: readonly [number, number, number] = [-0.12, -1.45, 0.55];
const TUCK_UP: readonly [number, number, number] = [0.12, 1.85, 0.25];
const SWIVEL_MAX = 1.8;
/** An arm pointing this far down (the share of its line, shoulder to hand) has its elbow behind that line, never ahead of it: see elbow. */
const HINGE_DOWN = 0.5;
/** No hand is nearer its shoulder than this (ft): nearer, the elbow is folded shut through itself. */
const FOLD_LEAST = 0.62;
const GRIP_POLE = 0.75;
/** Getting up off the floor, or out of a deep crouch, takes this much longer (ms) for each ft his hips rise past HIP_FAR, up to BLEND_UP ms in all. */
const HIP_FAR = 0.45;
const BLEND_HIP = 220;
const BLEND_UP = 560;
/** A leg past this share of its length straightens the rest of the way softly (it never locks in a frame), and a stride's sink comes in over about SINK_IN ms and goes over SINK_OUT. */
const KNEE_SOFT = 0.96;
const SINK_IN = 55;
const SINK_OUT = 90;
/** A stride's shape (how long a foot is down, how high it goes) follows his speed over about this long (ms). */
const STRIDE_MS = 90;
/** Each stride's turnover is its own, up to this much quicker or slower than his even run's (all of it, either way). */
const STRIDE_JIT = 0.07;
/** How far one man's set point (ft up or down) and shot pocket (ft across) can be from another's, all told. */
const SET_PT = 0.5;
const POCKET = 0.24;
/**
 * How fast his feet turn over follows what it's to be over about CADENCE_MS: a step isn't hurried or held up in a
 * frame. Driving off from a stand (see DRIVE_RATE), his quicker steps come at once.
 */
const CADENCE_MS = 70;
/**
 * A runner's steps a second for his speed (ft a second, on a 6 ft 6 man): RUN_RATE at RUN_FROM, rising RUN_RISE
 * each ft a second, and faster still near a sprint (RUN_TOP each ft a second past SPRINT_FROM, squared), so his
 * step grows to about 7 ft and no farther: past that he goes faster by turning his feet over faster, as a man does.
 */
const RUN_RATE = 2.55;
const RUN_FROM = 7;
const RUN_RISE = 0.04;
const RUN_TOP = 0.005;
const SPRINT_FROM = 18;
/**
 * Getting going or pulling up (ft a second squared, eased over GAIN_MS ms; GAIN_FULL is all of it): setting off,
 * his feet turn over as for the speed he'll have in GAIN_AHEAD seconds (short, quick driving steps); pulling up,
 * BRAKE_RATE more of them than at an even run for his speed. Setting off he leans into it (GO_LEAN radians) and drives
 * lower (GO_SIT ft); pulling up he leans back against it (BRAKE_LEAN) and sits (BRAKE_SIT).
 */
const GAIN_MS = 80;
/** His speed is read off his travel eased over this long (ms). */
const VEL_MS = 70;
/**
 * At FLY_FROM ft a second or more, both feet off the floor, he goes on as he was going (see update): at most FLY_MOST ft
 * off the plan's spot, made up over the next foot down as a spring of FLY_W; not in frames longer than FLY_OWN_MOST ms
 * (a play run at 4x, where a stride is four frames).
 */
const FLY_FROM = 9;
const FLY_MOST = 0.4;
/** Two men's middles are never nearer than this for it (ft): see `room`. */
const FLY_CLEAR = 3;
const FLY_W = 28;
const FLY_OWN_MOST = 40;
/**
 * Where the plan takes him next is known (see Drive.ahead): his getting going and pulling up are read from that, not
 * from where he has been, and so is the bend his trunk leans into. A step round a man is a push one way and back in a
 * fifth of a second: leaned into after the fact, his trunk rocked the wrong way behind it. His feet still answer it:
 * the bend they plant for is this much the plan's, the rest his travel's.
 */
const LED_BEND = 0.5;
/** And the lean of it, forward or back: radians for each ft a second squared he is about to gain, toward the way he faces. */
const LED_LEAN = 0.22;
/** Round a bend his lean comes over about this long (ms): led, it is over as his path turns; not, it follows the turn. */
const BANK_MS = 200;
const BANK_LED_MS = 110;
/** What his body does with it (the lean, the sit) is eased again over this long (ms): it gathers and gives up its lean as a body does, never in a frame. */
const GAIN_BODY_MS = 110;
const GAIN_FULL = 22;
const GAIN_AHEAD = 0.5;
const BRAKE_RATE = 0.3;
const GO_LEAN = 0.24;
/** (no farther forward than this with it: a man setting off at a run already leans into his first steps) */
const GO_MOST = 0.4;
const GO_SIT = 0.09;
/** Getting going at GAIN_FULL from a stand, each foot is down at least DRIVE_DOWN of its stride (a share: he drives off it) and his feet turn over DRIVE_RATE quicker again; both less as he gets up to DRIVE_UNTIL ft a second. */
const DRIVE_DOWN = 0.5;
const DRIVE_RATE = 0.4;
const DRIVE_UNTIL = 14;
const DOWN_DROP_MS = 260;
const BRAKE_LEAN = 0.2;
const BRAKE_SIT = 0.07;
/**
 * His weight on his feet (see weigh): it goes onto a foot put down over TRANSFER_MS (ms), onto the one he has down over
 * WEIGH_MS, and back onto both as he stands over STAND_WEIGH_MS. His hips go over to it WEIGH_OVER of the way (at a walk;
 * less at a run), no farther than WEIGH_MOST (ft); the hip over it higher by WEIGH_LIST (radians); turned forward with the
 * leg ahead WEIGH_PYAW (radians a ft, at most WEIGH_PYAW_MOST). At 4x WEIGH_FAST less of it all.
 */
const TRANSFER_MS = 70;
const WEIGH_MS = 50;
/** ...and his hips swing over to it over this long (ms). */
const WEIGH_EASE_MS = 35;
const STAND_WEIGH_MS = 260;
const WEIGH_OVER = 0.4;
const WEIGH_MOST = 0.3;
const WEIGH_LIST = 0.06;
const WEIGH_PYAW = 0.07;
const WEIGH_PYAW_MOST = 0.12;
const WEIGH_FAST = 0.6;
/** How much of a captured stride's own hips (over and tipped) his feet's weight takes the place of; how his slowing is eased (ms). */
const WEIGH_OWN = 0.75;
const WEIGH_OWN_MS = 140;
/** Body to body (see contact), this much less of it. */
const WEIGH_FELT = 0.8;
const SLOWING_MS = 60;
/**
 * A foot put down from ABSORB_FROM ft a second takes him (his hips sink into it, on the pose's scale): ABSORB_RUN at a
 * run, and ABSORB_BRAKE more pulling up at ABSORB_FULL ft a second squared; into it over ABSORB_IN ms, out over ABSORB_OUT.
 */
const ABSORB_FROM = 3;
const ABSORB_RUN = 0.025;
const ABSORB_BRAKE = 0.14;
const ABSORB_FULL = 30;
const ABSORB_IN = 90;
const ABSORB_OUT = 200;
/** Pulling up hard, his free arms' swing is this much (0..1) gone. */
const BRAKE_ARMS = 0.5;
/**
 * At a run his body comes round on a planted foot, not in the air: he turns this much quicker with a foot down and
 * this much slower with both up (eased over TURN_GATE_MS ms, so a step's turn doesn't start or stop in a frame),
 * from TURN_GATE_FROM ft a second. The foot he plants for a cut lands this much wider on its side (ft for each ft a
 * second squared his path turns, at most PLANT_WIDE).
 */
const TURN_DOWN = 1.25;
const TURN_UP = 0.55;
const TURN_GATE_MS = 60;
const TURN_GATE_FROM = 8;
const PLANT_OUT = 0.006;
const PLANT_WIDE = 0.45;
/**
 * A big turn (past TURN_BIG radians, all of it at twice that), turned away from the way he is going: past PIVOT_UNDER
 * ft a second it comes round slower, by TURN_SLOWED of the most at TURN_CARRIED and over (he's carried on: no
 * turntable); under PIVOT_UNDER with a foot down he plants and pivots, up to PIVOT_MAX radians a second from a stand.
 */
const TURN_BIG = 0.7;
const TURN_SLOWED = 0.6;
const TURN_CARRIED = 18;
const PIVOT_UNDER = 7;
const PIVOT_MAX = 12;
/** A foot's heel peels off over this much of its swing (see step), up to PEEL_FAST ft a second. */
const PEEL = 0.2;
const PEEL_FAST = 28;
/** A runner's foot is at its highest this far through its swing (a share of it): a sprinter's heel comes up to his seat as it passes under him. */
const SWING_TOP = 0.42;
/**
 * A shoe on the floor rolls up onto its ball (BALL ft ahead of his ankle, on the 6 ft 6 puppet) or back onto its heel
 * (HEEL behind it), and whichever is on the floor stays where it is: his ankle comes up and over it.
 */
export const BALL = 0.62;
export const HEEL = 0.3;
/**
 * The shoe doesn't bend at its ball: rolled all the way up onto it (TAKE_TOES), the point it rolls about has come this
 * much farther forward (ft), onto the front of the sole under his toes, so its toe box comes to rest on the floor and
 * is never pushed through it.
 */
const TOE_ROLL = 0.06;
/** A knee goes out over its toes: its pole turns this much of the way a foot is turned from square. */
const KNEE_TRACK = 0.7;
/**
 * Standing, his toes turn out this much from the way he faces (radians). A foot on the floor keeps its own heading
 * as his body turns over it, up to FOOT_OUT farther out or FOOT_IN farther in; past that he pivots on its ball (its
 * heel up by PIVOT_HEEL radians), no faster than PIVOT_SPIN radians a second; turned past that by FOOT_STEP more, it
 * is picked up and put down again. A swinging foot comes round to his heading by the time it lands, no faster than
 * SWING_SPIN radians a second.
 */
const TOE_OUT = 0.14;
const FOOT_OUT = 0.7;
const FOOT_IN = 0.4;
const PIVOT_HEEL = 0.45;
const PIVOT_SPIN = 9;
const FOOT_STEP = 0.5;
const SWING_SPIN = 16;
/**
 * Leaving the floor his heels come up (TAKE_TOES radians) as his hips drive up out of his crouch, faster than
 * TAKE_RATE ft a second (all of it at twice that) over the last TAKE_HIP ft of the way, and as they rise past where he
 * stands, by TAKE_HIP ft (on the 6 ft 6 puppet), quicker than a stride rolls a foot (TAKE_MS, ms): he goes up off his
 * toes and comes down onto them. In the air his toes stay pointed until he lands.
 */
const TAKE_TOES = 0.85;
const TAKE_HIP = 0.35;
const TAKE_RATE = 4;
const TAKE_MS = 20;
/** Coming down from a jump he stays on both feet for this long (ms) before a foot steps: a beat to take his weight. */
const LAND_STILL = 150;
/** The moves he goes up for off one foot and comes down from onto it (see land); the other foot comes down after it, over about this long (ms), its knee up by as much as LAND_LATE_UP ft (on the 6 ft 6 puppet) as the first lands. */
const ONE_FOOT = new Set<ClipId>(['layup', 'floater', 'hook', 'dunk1', 'dunkSide', 'dunkMill']);
const LAND_LATE_MS = 120;
const LAND_LATE_UP = 0.6;
/**
 * In the air his feet go to where the move has them over about this long (ms, in his own frame): leaving the floor
 * and coming back to it, a foot is never put somewhere else in a frame. However little a hop takes him up, once he is
 * half in the air the lowest of each shoe clears the floor by this much (ft, on the 6 ft 6 puppet): it is off it, not
 * drawn along it.
 */
const AIR_FEET_MS = 45;
const AIR_CLEAR = 0.25;
/**
 * And no faster than this (ft a second, on the 6 ft 6 puppet, in his own frame): a foot tucked under him, not thrown
 * there; getting up to it over his first AIR_FEET_RAMP ms off the floor, so a foot that was still on it a frame ago
 * isn't moving at full speed the frame it leaves it.
 */
const AIR_FEET_FAST = 22;
const AIR_FEET_RAMP = 90;
/**
 * Body to body (Drive.touch) he holds his ground with short quick steps: a foot this far (ft, on the 6 ft 6 puppet)
 * from where it should be under him is stepped back under him at CONTACT_RATE steps a second, lifted no higher than
 * CONTACT_LIFT (ft).
 */
const CONTACT_AWAY = 0.22;
const CONTACT_RATE = 5.5;
const CONTACT_LIFT = 0.22;
/**
 * A step taken where he stands (not a stride: home under him, a shuffle body to body, a pivot's) goes up before it
 * goes over and comes down after: its foot leaves the floor and meets it again within LIFT_FIRST of its swing either
 * side, where it is, and crosses the floor in between, not drawn along it.
 */
const LIFT_FIRST = 0.18;
/**
 * Holding the ball (caught, held, wound up to pass) he keeps one foot down, his pivot: his body turns round on its
 * ball however far he goes, within PIVOT_KEEP (radians) of the way he faces, and the other foot steps round it in an
 * arc. In his stance that one is out in front of him, STAGGER ft (on the 6 ft 6 puppet); it steps PASS_STEP ft toward
 * a pass as it goes, and now and then, the man on him, it jabs JAB ft at him and back (over JAB_MS, about every
 * JAB_EVERY ms of being pressed). Moved by the plan faster than PIVOT_GO ft a second, he has to go: the pivot is let go.
 */
const PIVOT_KEEP = 0.25;
const STAGGER = 0.45;
const PASS_STEP = 0.75;
const JAB = 0.85;
const JAB_MS = 320;
const JAB_EVERY = 1700;
const PIVOT_GO = 4;
/** On his pivot he sits this much lower (ft, the man on him; three fifths of it without), his feet wider. */
const PIVOT_SIT = 0.22;
/**
 * Turning on his pivot his hips go ORBIT of the way round its ball (the rest is his legs turning under him), and no
 * farther than PIVOT_FAR ft (on the 6 ft 6 puppet) from where the plan has him.
 */
const ORBIT = 0.6;
const PIVOT_FAR = 1;
/** A free foot stepping round the pivot comes down no nearer it than this (ft, on the 6 ft 6 puppet), at this many steps a second. */
const PIVOT_NEAR = 0.7;
const PIVOT_RATE = 4.6;
/**
 * Set on his feet (on his pivot, or loading a jump off two), he holds his ground: the plan's spot goes on without him,
 * his own way on dying away over SET_STOP_MS. Let go, he goes after it no faster than SET_BACK ft a second on the
 * floor and SET_FLY in the air (a jump carries him there); set more than SET_MOST ft (on the 6 ft 6 puppet) from it,
 * he is let go.
 */
const SET_STOP_MS = 70;
const SET_BACK = 9;
const SET_FLY = 16;
const SET_MOST = 3;
/**
 * A jump off two feet is loaded from both: from LOAD_MS (his own ms) before he leaves the floor, they are set under
 * him (square, the foot on his shooting side LOAD_STAGGER ft ahead for a jumper); a foot out of place is stepped
 * there at LOAD_RATE steps a second (a gather step, his hips still going with the plan) while there is GATHER_LEFT ms
 * to go, and then both stay down and he holds his ground. Coming into it at a run faster than JUMP_STOP ft a second, or
 * off the catch or a dribble (PULL_HOP of pull-ups), it is a jump stop: a hop of HOP_MS (AIR_HOP of the way to the
 * air) onto both, together, set from its start.
 */
const LOAD_MS = 380;
const LOAD_STAGGER = 0.22;
const LOAD_RATE = 6.5;
const GATHER_LEFT = 210;
const JUMP_STOP = 6;
const HOP_MS = 170;
const AIR_HOP = 0.72;
const PULL_HOP = 0.7;
/** The jumps off two feet, and the moves he goes up for off one (see ONE_FOOT): each loaded or stepped into its own way. */
const TWO_FOOT = new Set<ClipId>(['jumper', 'rebound', 'block', 'contest', 'tip', 'putback', 'dunk', 'dunkHang', 'dunkBack', 'dunkRev']);
/**
 * A defender still on his way (faster than this, ft a second) as he goes up for a contest or a block leaps off his
 * stride, one foot: he isn't held back on his spot (the plan's already moving him out of the way of the man he goes up
 * with), nor stopped dead with a hop.
 */
const RUNNING_LEAP = 4;
/**
 * Off one foot (a layup, a runner) his last two steps are timed to the jump: the second, the foot opposite the hand he
 * finishes with, is down as he leaves the floor (the 1-2), well into its time on it, his feet turning over up to
 * STEP_QUICK quicker (short, choppy gather steps) or STEP_SLOW slower (a long one) to get it there; in a euro the two go
 * out EURO_WIDE ft to either side, the way his hips go.
 */
const STEP_QUICK = 1.1;
/** Off one foot, the foot he goes up off stays down once it is down this long (ms, his own) before he leaves the floor. */
const TAKE_HOLD = 160;
const STEP_SLOW = 0.7;
const EURO_WIDE = 0.55;
/** Up off one foot, the other knee drives up (its foot KNEE_UP ft higher and KNEE_FWD ft farther forward than the move has it), easing back over KNEE_HOLD ms of the move after he leaves the floor. */
const KNEE_UP = 0.6;
const KNEE_FWD = 0.2;
const KNEE_HOLD = 260;
/** A step-back jumper is pushed off the foot on his ball side: planted this far (ft) out in front as he leans in. */
const BACK_PLANT = 0.9;
/**
 * How a foot on the floor turns as his body turns over it (see FOOT_OUT): in a defensive stance he keeps his feet
 * under him, picking one up sooner (STANCE_OUT, STANCE_IN); boxing out he turns into the man on the balls of his feet
 * (BOX_OUT, out and in).
 */
const STANCE_OUT = 0.45;
const STANCE_IN = 0.3;
const BOX_OUT = 1.1;
/** Coming down from a jump off two feet, his feet go this much wider (the pose's `wide`, at full height) to take it. */
const LAND_WIDE = 0.28;

/** The joints the scene draws between, each three numbers in `Puppet.j`. */
export const J = { hips: 0, chest: 1, head: 2, sl: 3, el: 4, hl: 5, sr: 6, er: 7, hr: 8, jl: 9, kl: 10, fl: 11, jr: 12, kr: 13, fr: 14 } as const;

/** What the plan says about him this frame. Positions are the scene's (x along the floor, z across it). */
export interface Drive {
  x: number;
  z: number;
  /** The heading he should have: 0 faces +z, turning toward +x. */
  yaw: number;
  act: Act;
  /** Time into this move and its length, ms. */
  ms: number;
  dur: number;
  /** The ball is his through this move. */
  ball: boolean;
  /** The ball is to be his but is still a referee's, on its way to him: he stands ready for it, and is not knocked down meanwhile. */
  waits?: boolean;
  /** The rim he's going at (a layup or a dunk carries him to it). */
  aim?: { x: number; z: number };
  /** He has been put on a fresh spot (a highlight, a skip): he is there, however near it is, not on his way to it. */
  cut?: boolean;
  /** What he looks at (the scene's point, ft): his head turns to it, and his chest a little when his hands are free. */
  look?: V3;
  /** The ball is dead (the line, a timeout, a whistle, the walk up): standing, he may rest. */
  rest?: boolean;
  /** Late in a close game: he shows it when he stands. */
  tired?: boolean;
  /** How long (ms) until the free throw he holds goes up: he bounces it and sets. */
  ft?: number;
  /** The nearest man guarding him when he has the ball, if one is close (the scene's point): he keeps it away from him. */
  press?: { x: number; z: number };
  /** How long (ms) until he passes the ball he has: he draws it in and steps into it. */
  pass?: number;
  /** The game is over (he celebrates or rues it his own way). */
  over?: boolean;
  /** At the buzzer, the teammate he chest-bumps faces him: they go up together. */
  bump?: boolean;
  /** At the buzzer, what the scene has him do in place of his act's own way (a hug, down on his knees, a crouch). */
  party?: ClipId;
  /** Whose body this is (his player id): what differs from man to man (a dunk, how he stands, a celebration) is his own. */
  who?: number;
  /** A man meeting him body to body (a screen, a box-out: the scene's point), and how far into it (0..1); and that man's feet, where they are on the floor. */
  touch?: { x: number; z: number; w: number; who?: number; feet?: readonly { x: number; z: number }[] };
  /** A shot he is going up for or has let go: what its name says of how it is made (choreo's Finish). None: a plain one. */
  how?: Finish;
  /** He shows the ball through this move and brings it back down (a shot fake). */
  fake?: boolean;
  /** The shot he is going up with won't go down: missed, or blocked (a hand gets to it on its way up). */
  fails?: 'miss' | 'block';
  /**
   * A hand-off he is in (see exchange.ts): giving it or taking it; where its move is (ms: 0 as it changes hands, held
   * there until it has); and, giving it, where he holds it out (the scene's point) and how far (0..1).
   */
  swap?: { give: boolean; tau: number; at?: V3; w?: number };
  /**
   * The possession's record of how its moves were made (see Tape) and which move of it this is: the script's frame
   * (`k`), and the frame his act began in (`k0`). What a man chooses once (which dunk, which pass, which hand) is
   * kept there, and made the same way when the move is played again.
   */
  tape?: Tape;
  k?: number;
  k0?: number;
  /** How far into the possession it is (the script's ms, from its first frame). */
  t?: number;
  /**
   * How far the plan takes him over the next `ms` of his own time, and over twice that (ft, the scene's axes): his
   * weight goes where he is about to go (the lean of a start or a stop, the bank of a bend), as it comes and not after it.
   */
  ahead?: { x: number; z: number; x2: number; z2: number; ms: number };
}

/**
 * How the moves of one possession were made, by man and move: written the first time each is played, read every time
 * after. `again`: it is being played again (an instant replay): nothing in it is new, and nothing he does of his own
 * accord between the play's moves (a crossover as he stands) happens unless it happened then.
 */
/** What kind of meeting a knock is (see Puppet.hit): a screen, a drive into a man set in the way, a box-out's seal, or a body into a body. */
export type Contact = 'screen' | 'drive' | 'seal' | 'bump';

export interface Tape {
  takes: Map<string, unknown>;
  again: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const IDLES: ClipId[] = ['idle', 'idle2', 'idle3'];
/** How a man off the ball waits with the play live (see stand, and wait for what he does in them). */
const WAITS = new Set<ClipId>(['spot', 'spot2', 'spot3']);
/**
 * Waiting, his weight is on one leg (his hips over its foot and its hip up: see weigh), his chest tipped back a little
 * over it (WEIGHT_TILT radians, all on the one leg), the other knee easy; held a while and then put over onto the other
 * one (or back between them). How long it is held (ms, at the least and the most), and how quickly it goes over (ms:
 * about the time to get most of the way).
 */
const WEIGHT_TILT = 0.035;
const WEIGHT_HOLD: [number, number] = [1300, 4300];
const WEIGHT_MS = 520;
/** The ways of standing (alert, at rest, spent). */
const STANDING = new Set<ClipId>(['idle', 'idle2', 'idle3', 'shift', 'hips', 'knees', 'spot', 'spot2', 'spot3']);
/** He turns to face a thing no faster than this (radians a second), and his head on his shoulders no faster than this: a turn, not a snap. */
const TURN_MAX = 10;
/** A spin move's turn: from this long into the move to this (ms), all the way round. And how good his handle must be for a spin or a behind-the-back at all (Body.skill, -1 to 1). */
const SPIN: [number, number] = [70, 560];
const FANCY_SKILL = -0.15;
/** And no more than this in one frame (radians), at any playback speed: a quarter of a radian is a whipped head. */
const TURN_FRAME = 0.2;
/** A spin's own turn in one frame, at the most (radians): faster than he squares up, and still under a whip. */
const SPIN_FRAME = 0.25;
/** And gathers that speed, or gives it up, no quicker than this (radians a second, each second): quicker in a move (squaring up to the rim, to a pass). */
const TURN_ACC = 90;
const TURN_ACC_MOVE = 160;
const HEAD_RATE = 8;
/** His head, body and all, comes round no faster than this (radians a second); his neck gives this much past HEAD_MAX to keep it so. */
const HEAD_WHIP = 13;
const HEAD_GIVE = 0.3;
/** A defender off the ball has the arm nearer it out in the passing lane: this far up and out (ft from his shoulder). */
const DENY: [number, number, number] = [1.25, -0.3, 0.7];
/** A dribbler rides the bounce: his shoulder dips with the push (radians) and his hips give (ft). */
const RIDE_TILT = 0.045;
const RIDE_HIP = 0.05;
/** A finger roll: the ball and his arm this much farther out in front of him (ft), and the ball this much higher, at the top. */
const ROLL_OUT = 0.45;
const ROLL_UP = 0.3;
/** A jump shot's fade: how far back his chest goes (radians) and his feet ahead (ft), at most. */
const FADE_LEAN = 0.2;
const FADE_FEET = 0.5;
/** An alley-oop's dunk runs this far ahead of its move (ms): the lob gets to his hands when he is well off the floor, a beat before the slam (DUNK_AT). */
const OOP_EARLY = 105;
/** The ball in front of him, from his chest (FRONT_FROM ft up, on the 6 ft 6 puppet) to the top of his head (FRONT_TO), is at least this far out from his middle (ft): see carry. */
const FRONT_FROM = 3.4;
const FRONT_TO = 6.75;
const FRONT_MIN = 0.55;
/** A ball this low (ft, on the 6 ft 6 puppet) is down by his legs (see legsOff). */
export const OWN_LEGS_UP = 2.6;
/**
 * A ball below his hips is kept out of his own legs (see legsOff): a thigh's (LEG_THIGH, wider by the root of his bulk)
 * and a shin's (LEG_SHIN) thickness and its own. What it has been moved off them is let go of over LEG_LET_MS (ms, his
 * own), and a leg come into it pushes it no faster than LEG_PUSH ft a second (LEG_PUSH_LEAST a frame at the least).
 */
const LEG_THIGH = 0.24;
const LEG_SHIN = 0.17;
const LEG_LET_MS = 140;
const LEG_PUSH = 20;
const LEG_PUSH_LEAST = 0.1;
/** A layup from farther than this (ft) to the side of the rim goes up off the hand on that side. */
const LAYUP_SIDE = 1.2;
/** A hand's channels (see ARM_FAR). */
const ARM_AT = [I.lx, I.ly, I.lz, I.rx, I.ry, I.rz];
/** Clips he holds still in: what breathing shows on. */
const STILL = new Set<ClipId>([...STANDING, 'ready', 'stance', 'hold', 'slump', 'rue', 'screen', 'boxout', 'postUp', 'crash', 'inbound']);
/** A number from 0 to 1 for a man and a count: the same every time (his own way of doing a thing). */
/** How much of a foot's sink (see weigh) is on him `t` ms after it was put down (0..1): quickly into it, then out over its time down. */
function absorbed(t: number): number {
  return t < ABSORB_IN ? smooth(t / ABSORB_IN) : 1 - smooth(clamp((t - ABSORB_IN) / ABSORB_OUT, 0, 1));
}

export function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** A spring with no bounce (x toward `to`, with speed v, `w` its rate a second, `sec` on): it eases off and eases in. */
function spring(x: number, v: number, to: number, w: number, sec: number): [number, number] {
  const k = w * sec;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const off = x - to;
  const t = (v + w * off) * sec;
  return [to + (off + t) * e, (v - w * t) * e];
}
/** The clips with the ball in one hand: they flip when it's in his left. */
const HANDED = new Set<ClipId>(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack', ...MOVES]);
/** His off arm's own way over a dribble (see style) comes in over this long (ms) once he dribbles in the one hand. */
const OFF_IN_MS = 350;
/** The dribbles whose ball goes from hand to hand in their own loop. */
const CROSSES = new Set<ClipId>([...HANDED].filter((id) => bounces(CLIPS[id]).some((b) => b.cross)));
/** The dribbles. */
const DRIBBLES = new Set<ClipId>(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack']);
/** A man guarding him nearer than PRESS_NEAR (ft) is on him; farther than PRESS_FAR he is left alone. The ball is kept this far (ft, on the 6 ft 6 puppet) from that man's middle. */
const PRESS_NEAR = 3;
const PRESS_FAR = 5.5;
const PRESS_CLEAR = 1.32;
/** A drive opens with a crossover: it can start this far into the move, ms. */
const CROSS_MS = 320;
/** The longest of a dribbler's moves (ms): one begun this long ago or less may still be going. */
const MOVE_LONG = Math.max(...MOVES.map((id) => span(CLIPS[id])[1]));
/** How many of a man's drives open with an in-and-out, not a crossover (times his own liking for it: some never, some half the time), and how many of the moves he makes standing with it keep it in the hand it is in. */
const IN_OUT = 0.3;
const STAND_SAME = 0.55;
/** How thick his shoulders are, one to the other, to a ball he has (ft: see keepOut). */
const COLLAR_R = 0.26;
/** A move begun again while it plays, or jumped on through itself by more than this (ms), is eased into like any other: see `fresh`. */
const TAU_JUMP = 60;
/**
 * Going up at the rim with a man on him (see protect): the finishes it is for; the ball goes PROTECT_BALL (the pose's
 * units) to the side away from the man and his chest turns PROTECT_TURN radians, from PROTECT_FROM ms before the
 * release; the man is to one side of him once he is PROTECT_SIDE ft across his front. Stood with it, the ball goes
 * SECURE_BALL away, his chest SECURE_TURN, and he sits SECURE_SIT lower and SECURE_WIDE wider. Pressed more than
 * LAND_FOUGHT going up, he lands off balance.
 */
const FINISHES = new Set<ClipId>(['layup', 'putback', 'floater', 'hook']);
const PROTECT_BALL = 0.4;
const PROTECT_TURN = 0.3;
const PROTECT_FROM = 330;
const PROTECT_SIDE = 0.6;
const PROTECT_MS = 130;
const SECURE_BALL = 0.3;
const SECURE_TURN = 0.26;
const SECURE_SIT = 0.1;
const SECURE_WIDE = 0.14;
const LAND_FOUGHT = 0.35;
const smooth = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
/** The greater of two, rounded where they cross over `k`: a thing resting on another comes to it, it isn't met at a corner. */
const softMax = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
  return b + (a - b) * h + k * h * (1 - h);
};
/**
 * The four ways a jump shot is shot (see Puppet.rhythm, and `form` in style): how far his legs are ahead of the move's
 * own time (ms: ahead, he is higher as it goes), how far his arms are ahead of it half way from his dip to the release
 * (ahead: at his set point early, and held; behind: one unbroken motion), how far ahead they are after it (ahead: they
 * come down sooner), and how high his jump is against the clip's.
 *   0 set: two motions, let go at the top    1 flow: one motion, on the way up
 *   2 high: let go late and high, held       3 push: a short hop, pushed from his chest
 */
const SHOT_FORMS: readonly { leg: number; arm: number; after: number; jump: number }[] = [
  { leg: 55, arm: 45, after: -40, jump: 1.05 },
  { leg: -60, arm: -35, after: 55, jump: 0.9 },
  { leg: 10, arm: -25, after: -75, jump: 1.1 },
  { leg: -45, arm: 15, after: 30, jump: 0.6 },
];
/** His arms' own time is laid over this long before the release (ms: see rhythm). */
const RHYTHM_LEAD = 240;
/** What of a pose is his legs' and his jump's (see rhythm). */
const LEG_CHANNELS = [I.hip, I.air, I.flu, I.flf, I.fru, I.frf, I.wide, I.leap];
/** A dribble is on the floor this far through its bounce (the push down is quicker than the rise), and is brought onto where his move has it over the bounce's last part, from BOUNCE_ON. */
const BOUNCE_DOWN = 0.44;
const BOUNCE_ON = 0.88;
/** A hand over a dribble coming up to it starts to give with it this far (ft) before the ball's top gets to it. */
const PALM_SOFT = 0.3;
/**
 * The ends of each bounce in a clip, as the clip's hands have the ball there (the pose's units): how high it is as a
 * hand takes it, how fast it is rising then, and how fast it was falling as the hand let it go (for the whole of the
 * bounce's time). Kept by clip and bounce.
 */
const BOUNCE_ENDS = new WeakMap<object, [number, number, number]>();
function bounceEnds(c: (typeof CLIPS)[ClipId], b: { off: number; on: number }): [number, number, number] {
  let e = BOUNCE_ENDS.get(b);
  if (e) return e;
  const T = b.on - b.off || 1;
  const h = Math.abs(T) * 0.06;
  const y = (t: number) => {
    sample(c, t, MIX);
    return MIX[I.by] + Math.max(0, MIX[I.hip]);
  };
  const on = y(b.on);
  e = [on, ((y(b.on + h) - on) / h) * T, ((y(b.off) - y(b.off - h)) / h) * T];
  BOUNCE_ENDS.set(b, e);
  return e;
}
/** When a move leaves the floor (its ms: the first its feet are in the air, as the clip has it; NaN for one that doesn't), kept. */
const TAKEOFF = new Map<ClipId, number>();
function takeoff(id: ClipId): number {
  let at = TAKEOFF.get(id);
  if (at !== undefined) return at;
  const c = CLIPS[id];
  at = Number.NaN;
  if (c.kind === 'shot') {
    const [from, to] = span(c);
    for (let t = from, was = 1; t <= to; t += 2) {
      const air = sample(c, t, MIX)[I.air];
      if (air > 0.5 && was <= 0.5) {
        at = t;
        break;
      }
      was = air;
    }
  }
  TAKEOFF.set(id, at);
  return at;
}

/** Moves around a moment of the play: the clip, and whether that moment is the move's end or its start. */
const ONE: Partial<Record<Act, [ClipId, 'end' | 'start']>> = {
  pass: ['pass', 'start'],
  catch: ['catch', 'end'],
  jumper: ['jumper', 'end'],
  floater: ['floater', 'end'],
  layup: ['layup', 'end'],
  dunk: ['dunk', 'end'],
  ft: ['freeThrow', 'end'],
  contest: ['contest', 'end'],
  block: ['block', 'end'],
  steal: ['steal', 'end'],
  rebound: ['rebound', 'end'],
  tip: ['tip', 'end'],
};

/** A defender slides no faster than this (ft a second): past it, going the way he faces, he runs (see BEATEN_AT). */
const SLIDE_MOST = 13;
/** A man boxing out, or going to the glass into one, keeps that way of standing up to this speed (ft a second): they move a step at a time, leaning on each other. */
const HELD_UP = 7;
/** The clip for a man not in the middle of one of those: by what he's doing and how he's moving (ft a second: ahead, and overall). */
export function baseClip(act: Act, ball: boolean, sp: number, vf: number, vs: number): ClipId {
  const moving = sp > 2.5;
  // (the buzzer is everyone's: the man who had the ball lets go of it, see the scene)
  if (act === 'celebrate') return 'celebrate';
  if (ball)
    return act === 'inbound'
      ? 'inbound'
      : act === 'hold' || act === 'pass' || act === 'stand'
        ? 'hold'
        : moving && sp > 7 && vf > 0
          ? 'dribbleRun'
          : act === 'dribble' || act === 'drive' || act === 'post'
            ? !moving
              ? 'dribble'
              : vf < -0.45 * sp
                ? 'dribbleBack'
                : 'dribbleWalk'
            : 'hold';
  const ahead = vf > 0.6 * sp;
  const gait: ClipId = ahead ? (sp > 28 ? 'sprint' : sp > 14 ? 'run' : sp > 6.5 ? 'jog' : 'walk') : vf < -0.45 * sp ? 'backpedal' : Math.abs(vs) > 0.7 * sp ? 'shuffle' : 'walk';
  switch (act) {
    // (faster than a man slides, going the way he faces: he has opened up and runs with him)
    case 'guard':
    case 'trap':
      return moving ? (ahead && sp > SLIDE_MOST ? gait : 'shuffle') : 'stance';
    case 'defend':
    case 'land':
    case 'contest':
    case 'block':
    case 'steal':
      return moving ? (gait === 'walk' ? 'shuffle' : gait) : 'ready';
    case 'screen':
      return moving ? gait : 'screen';
    case 'post':
      return moving ? gait : 'postUp';
    // (two leaning on each other for the ball are pushed about a step at a time: they keep the way they stand)
    case 'boxout':
      return sp > HELD_UP ? 'shuffle' : 'boxout';
    case 'crash':
      return sp > HELD_UP ? gait : 'crash';
    case 'rue':
      return moving ? gait : 'rue';
    default:
      return moving ? gait : 'idle';
  }
}

/**
 * Two bones from `a` reaching for `t` (pulled in if it's too far): writes the middle joint, bent toward `pole`.
 * `soft`: past that share of its length the limb straightens the rest of the way softly, short of the point by a
 * hair, so a knee never goes from bending to locked in a frame.
 */
function reach(j: Float32Array, a: number, mid: number, t: number, l1: number, l2: number, px: number, py: number, pz: number, soft = 1) {
  const ax = j[a * 3];
  const ay = j[a * 3 + 1];
  const az = j[a * 3 + 2];
  let dx = j[t * 3] - ax;
  let dy = j[t * 3 + 1] - ay;
  let dz = j[t * 3 + 2] - az;
  let d = Math.hypot(dx, dy, dz) || 1e-6;
  const max = (l1 + l2) * 0.995;
  const min = Math.abs(l1 - l2) + 0.05;
  const from = (l1 + l2) * soft;
  const want = from < max && d > from ? from + (max - from) * (1 - Math.exp(-(d - from) / (max - from))) : clamp(d, min, max);
  if (want !== d) {
    j[t * 3] = ax + (dx / d) * want;
    j[t * 3 + 1] = ay + (dy / d) * want;
    j[t * 3 + 2] = az + (dz / d) * want;
    d = want;
  }
  dx = (j[t * 3] - ax) / d;
  dy = (j[t * 3 + 1] - ay) / d;
  dz = (j[t * 3 + 2] - az) / d;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  // the pole, square to the limb
  const dot = px * dx + py * dy + pz * dz;
  let qx = px - dx * dot;
  let qy = py - dy * dot;
  let qz = pz - dz * dot;
  const ql = Math.hypot(qx, qy, qz);
  if (ql < 1e-4) [qx, qy, qz] = [0, 0, 1];
  else [qx, qy, qz] = [qx / ql, qy / ql, qz / ql];
  j[mid * 3] = ax + dx * along + qx * out;
  j[mid * 3 + 1] = ay + dy * along + qy * out;
  j[mid * 3 + 2] = az + dz * along + qz * out;
}

/**
 * The trunk for a pose: hips, hip joints, chest, head and shoulders into `j`, and the chest's axes
 * (its spine `u`, its front `f`, its left `l`) in his own frame. `vf`/`vs`: a little more lean for
 * his speed ahead and aside. His chest is at the end of his trunk's line (`line`, if asked for: from
 * between his hips to between his shoulders, leant and tipped as the pose has it), and his ribs sit on
 * the end of it pitched as his back is curved (the pose's `curl`): rounded forward past the line, or
 * arched back from it. His neck, head and shoulders go with his ribs.
 */
export function spine(P: Float32Array, body: Body, hipY: number, j: Float32Array, u: V3, f: V3, l: V3, vf = 0, vs = 0, line?: V3) {
  const { s, bulk } = body;
  const put = (k: number, x: number, y: number, z: number) => {
    j[k * 3] = x;
    j[k * 3 + 1] = y;
    j[k * 3 + 2] = z;
  };
  // the hips: shifted over a planted foot, turned and tipped with the stride
  const hx = P[I.sway] * s;
  const hz = P[I.surge] * s;
  const cy = Math.cos(P[I.pyaw]);
  const sy = Math.sin(P[I.pyaw]);
  const cr = Math.cos(P[I.proll]);
  const w = HIP_W * s;
  put(J.hips, hx, hipY, hz);
  put(J.jl, hx + cy * cr * w, hipY + Math.sin(P[I.proll]) * w, hz - sy * cr * w);
  put(J.jr, hx - cy * cr * w, hipY - Math.sin(P[I.proll]) * w, hz + sy * cr * w);
  // the chest: leaning into a run and a turn
  const lean = P[I.lean] + clamp(vf * 0.0045, -0.08, 0.2);
  const tilt = P[I.tilt] - clamp(vs * 0.003, -0.14, 0.14);
  u.x = Math.sin(tilt);
  u.z = Math.sin(lean);
  u.y = Math.sqrt(Math.max(0.2, 1 - u.x * u.x - u.z * u.z));
  const T = TORSO * s;
  put(J.chest, hx + u.x * T, hipY + u.y * T, hz + u.z * T);
  if (line) [line.x, line.y, line.z] = [u.x, u.y, u.z];
  // its front (square to its spine) and its left, turned by the twist
  const fzn = Math.hypot(u.y, u.z) || 1;
  const f0y = -u.z / fzn;
  const f0z = u.y / fzn;
  const l0x = u.y * f0z - u.z * f0y;
  const l0y = -u.x * f0z;
  const l0z = u.x * f0y;
  const ct = Math.cos(P[I.twist]);
  const st = Math.sin(P[I.twist]);
  f.x = l0x * st;
  f.y = f0y * ct + l0y * st;
  f.z = f0z * ct + l0z * st;
  l.x = l0x * ct;
  l.y = l0y * ct - f0y * st;
  l.z = l0z * ct - f0z * st;
  // (and his ribs pitched about that left, as his back is curved: his shoulders' line stays where the twist put it)
  const curl = clamp(P[I.curl], -CURL_MOST, CURL_MOST);
  if (curl) {
    const cc = Math.cos(curl);
    const sc = Math.sin(curl);
    const [ux, uy, uz] = [u.x, u.y, u.z];
    u.x = ux * cc + f.x * sc;
    u.y = uy * cc + f.y * sc;
    u.z = uz * cc + f.z * sc;
    f.x = f.x * cc - ux * sc;
    f.y = f.y * cc - uy * sc;
    f.z = f.z * cc - uz * sc;
  }
  const cx = j[J.chest * 3];
  const cyy = j[J.chest * 3 + 1];
  const cz = j[J.chest * 3 + 2];
  const hd = HEAD * s;
  const nod = P[I.nod];
  put(J.head, cx + u.x * hd + f.x * -nod * 0.3 * s, cyy + u.y * hd - Math.abs(nod) * 0.08 * s, cz + u.z * hd + f.z * -nod * 0.3 * s);
  const sw = SHOULDER * s * (0.92 + 0.08 * bulk) * (body.shoulders ?? 1);
  const drop = 0.14 * s;
  put(J.sl, cx + l.x * sw - u.x * drop, cyy + l.y * sw - u.y * drop, cz + l.z * sw - u.z * drop);
  put(J.sr, cx - l.x * sw - u.x * drop, cyy - l.y * sw - u.y * drop, cz - l.z * sw - u.z * drop);
}

/** An elbow's pole for a hand offset: down, out and a little back, swung round the arm by `swivel`. */
export function elbowPole(l: V3, f: V3, side: 1 | -1, ax: number, ay: number, az: number, swivel: number, out: V3): V3 {
  let px = l.x * side * 0.7 - f.x * 0.45;
  let py = -1;
  let pz = l.z * side * 0.7 - f.z * 0.45;
  const d = Math.hypot(ax, ay, az) || 1;
  const dx = ax / d;
  const dy = ay / d;
  const dz = az / d;
  const dot = px * dx + py * dy + pz * dz;
  px -= dx * dot;
  py -= dy * dot;
  pz -= dz * dot;
  // (Rodrigues, about the arm's own line: the pole is already square to it)
  const c = Math.cos(swivel);
  const sn = Math.sin(swivel);
  out.x = px * c + (dy * pz - dz * py) * sn;
  out.y = py * c + (dz * px - dx * pz) * sn;
  out.z = pz * c + (dx * py - dy * px) * sn;
  return out;
}

interface Foot {
  /** Where it is on the floor (the scene's x, z), and how high. */
  x: number;
  z: number;
  up: number;
  swing: boolean;
  /** Where its swing started, from him, and when (the stride's count: whole strides and the part of this one). */
  fx: number;
  fz: number;
  p0: number;
  /**
   * Its swing: when it comes down (the stride's count, `p1`: as his stride has it), the stride whose turn it took
   * (`n`: it is not picked up again on that one); and fixed as it leaves the floor, whether it is a step where he stands (`st`: lifted,
   * carried over and put down, along the floor) or a stride (swung through under him, from him), and whether he was
   * going (`go`): what changes under it in the air doesn't change how it is swung.
   */
  p1: number;
  n: number;
  st: boolean;
  go: boolean;
  /** Its swing is a stride's, going ahead: swung as a runner's foot is at his speed (see stride.ts), not stepped. */
  run: boolean;
  /**
   * A stride's foot comes off the floor from rest: how fast its swing would have it going in its first frame (ft a ms:
   * along the floor, and up), and how long ago that was (ms; under 0: not yet taken). See STRIDE_PEEL.
   */
  kx: number;
  kz: number;
  ky: number;
  kt: number;
  /** How fast he was going as it left the floor (ft a second): a stride's foot is swung through as fast as that needs, though he stops dead under it. */
  sp0: number;
  /** How far ahead of him its stride is to land (ft): set as it leaves the floor, and followed from there, not jumped to as his cadence changes under it. */
  land: number;
  /** How far through its swing it is (0..1), and the stride's count when that was last moved on. */
  u: number;
  pw: number;
  /**
   * How its toes point (radians, down from level): the heel coming up as he pushes off it, toes up before the heel
   * strikes. It rolls on the floor about its ball (toes down) or its heel (toes up): what is on the floor stays put.
   * For the body's foot bone.
   */
  pitch: number;
  /** How much wider than his hips it is to land, the outside foot of a cut (ft): set as it leaves the floor, kept through its swing. */
  wide: number;
  /** Which way it points on the floor (a heading, as `Puppet.yaw`): its own while it is down, whichever way his body turns over it. */
  yaw: number;
  /** As drawn, for the body's foot bone: how far it is turned from the way he faces (radians, to his left). */
  turn: number;
  /** How far up its heel is for a pivot on its ball (0..1, eased), and how high the body has its ankle above where it stands (ft: in the air, its toes point by it). */
  heel: number;
  lift: number;
  /** Where its swing started on the floor (the scene's x, z): a step round his pivot goes round it from there. */
  wx: number;
  wz: number;
  /** How far out to its own side a slide's step is put (ft, eased): see FEET_GAP. */
  side: number;
  /** How fast it went along the floor last frame in its swing (ft a second): see FOOT_ACC. */
  vx: number;
  vz: number;
}

/**
 * A dribble, for whoever flies the ball between his hand's touches: which hand (1 his left), how far through the
 * bounce it is (0 as the hand lets it go downward, 1 once a hand has it again: held, it stays 1 and the rest
 * describe the bounce to come), how long the bounce lasts (the bodies' ms), where the hand lets it go and where
 * it meets the floor (the scene's points). `hand` changes only as a hand takes it (a crossover's catch).
 */
export interface Dribble {
  hand: 1 | -1;
  /** The hand it is on its way to (the other one, across his body; else the same). */
  to: 1 | -1;
  phase: number;
  /** While a hand has it: how far through that touch (0 as it comes up into the hand, 1 as the hand lets it go). */
  touch: number;
  period: number;
  push: V3;
  floor: { x: number; z: number };
  /**
   * How high the hand that takes it has it as it comes back up into it (ft), how fast it is going up then, and how
   * fast it was going down as the hand let it go (ft for the whole of the bounce's time): the bounce leaves the one
   * hand and meets the other as the hands themselves are moving (see bounce).
   */
  catchY: number;
  catchV: number;
  pushV: number;
}

/**
 * What hangs off him and moves a beat late (his shorts' hem, his vest, his hair), for the body to read: how far
 * behind his hips it trails, in his own frame (ft: `x` to his left, `y` up, `z` ahead). It swings back through
 * zero as he settles.
 */
export interface Trail {
  x: number;
  y: number;
  z: number;
}

export class Puppet {
  /** This frame's pose time (ms): see BLEND_PACE. */
  private softMs = 0;
  readonly body: Body;
  x = 0;
  z = 0;
  yaw = 0;
  /** Joints in his own frame (see J). */
  readonly j = new Float32Array(15 * 3);
  /** His chest's axes in his own frame: its left, and its front. */
  readonly left: V3 = { x: 1, y: 0, z: 0 };
  readonly front: V3 = { x: 0, y: 0, z: 1 };
  readonly up: V3 = { x: 0, y: 1, z: 0 };
  /** The line of his trunk, from between his hips to his chest (his ribs' own up is `up`: see `spine`). */
  readonly line: V3 = { x: 0, y: 1, z: 0 };
  readonly pose = new Float32Array(N);
  clip: ClipId = 'idle';
  /** The move he's in the middle of (a shot, a catch), and where in it (ms around its moment). */
  one: { id: ClipId; tau: number } | null = null;
  readonly feet: [Foot, Foot] = [
    {
      x: 0,
      z: 0,
      up: 0,
      swing: false,
      fx: 0,
      fz: 0,
      p0: 0,
      p1: 0,
      n: NaN,
      st: false,
      go: false,
      run: false,
      kx: 0,
      kz: 0,
      ky: 0,
      kt: -1,
      sp0: 0,
      land: 0,
      u: 0,
      pw: 0,
      pitch: 0,
      wide: 0,
      yaw: 0,
      turn: 0,
      heel: 0,
      lift: 0,
      wx: 0,
      wz: 0,
      side: 0,
      vx: 0,
      vz: 0,
    },
    {
      x: 0,
      z: 0,
      up: 0,
      swing: false,
      fx: 0,
      fz: 0,
      p0: 0,
      p1: 0,
      n: NaN,
      st: false,
      go: false,
      run: false,
      kx: 0,
      kz: 0,
      ky: 0,
      kt: -1,
      sp0: 0,
      land: 0,
      u: 0,
      pw: 0,
      pitch: 0,
      wide: 0,
      yaw: 0,
      turn: 0,
      heel: 0,
      lift: 0,
      wx: 0,
      wz: 0,
      side: 0,
      vx: 0,
      vz: 0,
    },
  ];
  /** His cloth and hair, a beat behind him (see Trail): a loose thing and a heavier one. */
  readonly trail: Trail = { x: 0, y: 0, z: 0 };
  readonly trailSlow: Trail = { x: 0, y: 0, z: 0 };
  private readonly tw = new Float64Array(12);
  /** His own way of moving: how quick his feet are for his speed, how he carries his chest and his head, how far his arms swing, how fast his stance ticks over. */
  private tempo = 1;
  private carry0 = 0;
  private nod0 = 0;
  private armK = 1;
  private beat = 1;
  /**
   * And how he runs: how high his knees come (kneeK), how much his hips rise and fall each stride (bounceK), how far
   * forward he runs (runLean), how wide his elbows are carried (elbowK, out under 0... in).
   */
  private kneeK = 1;
  private bounceK = 1;
  private runLean = 0;
  private elbowK = 0;
  /**
   * And how he shoots and comes down: his set point (ft higher than the clip's, lower under 0), his shot pocket (ft out
   * to his shooting side), whether he hops into a shot off the catch or sets his feet, and how his legs take a landing
   * (landK: how deep he gives, landW: how wide his feet go).
   */
  private setPt = 0;
  private pocket = 0;
  private hopper = true;
  private landK = 1;
  private landW = 1;
  /**
   * And what is his own in his moves, the same every night (see style): how often his jumper kicks a leg out and how
   * often he euro-steps; his gather (the ball ripped up to his chin or carried low, out to his outside hip or in at his
   * middle, and how deep he sits into the step); his release (his guide hand flying off it or still, his shooting
   * elbow in under the ball or flared, his knees up in the air or his legs hanging, his follow-through held long or
   * short); his dribble (how low he sits over it, how far forward, his off arm up as a bar or down); and how he guards
   * (his stance's width and depth, his hands up or low, how often he swipes, how long his slide's step is).
   */
  private kickLike = 0.3;
  private euroLike = 0.3;
  private gatherHi = 0;
  private gatherSide = 0;
  private gatherLow = 0.05;
  /** A spin move's turn (radians, signed: see update): how far round the move has asked him to be, how much of that he has yet to turn, and how much he has turned. */
  private spinAsk = 0;
  private spinOwed = 0;
  private spinPaid = 0;
  private guideK = 0;
  private elbowSet = 0;
  private tuckK = 0;
  private followK = 1;
  private dribLow = 0;
  private dribLean = 0;
  private offArm = 0;
  private offW = 0;
  private standW = 0;
  /** How he waits off the ball (see wait): his own. */
  private weightK = 1;
  private weightSlow = 1;
  private waitFoot = 0;
  private waitAhead = 0.2;
  private waitLow = 0;
  private wantsK = 0.4;
  /** Where his weight is going (-1: on his right leg, 1: his left), where it is and how fast it is going there, and how long until he moves it. */
  private weightTo = 1;
  private weightAt = 0;
  private weightV = 0;
  private weightIn = 0;
  private weightN = 0;
  private standLow = 0;
  private handsUp = 0;
  private swipeK = 1;
  private slideK = 1;
  private styled = -1;
  /** His speed, eased (what the blend of gaits goes by), which way he was going a beat ago, and the bank that gives. */
  private spLag = 0;
  /** His speed as his stride's mix has it: eased on his pose time (see BLEND_PACE). */
  private spPose = 0;
  private pvx = 0;
  private pvz = 0;
  private bank = 0;
  /** When he next fidgets (ms of his own time). */
  private fidgetIn = FIDGET_EVERY;
  /** The man on him (the scene's point), how hard he is pressed (0..1, eased), and how long since he last switched hands for it (ms). */
  private px0 = 0;
  private pz0 = 0;
  private pressed = 0;
  private switched = 0;
  private across = false;
  /** A landing: how far into its give he is (ms), whether he was in the air last frame, how high he went, how hard he comes down (0..1.25) and on which foot first (1 his left, -1 his right, 0 both). */
  private giveT = 1e9;
  /** He came down from a jump this frame: his stride starts again from both feet down (see step). And how far in the air the foot he comes down on last still is (see LAND_LATE_MS). */
  private landed = false;
  private lateAir = 0;
  /** How long he has been off the floor (ms, his own; see AIR_FEET_RAMP), and how far his feet have gone with him going up (see AIR_FEET_MS). */
  private airMs = 0;
  private airFeet = 0;
  /** His hips as the pose had them last frame (ft, on the 6 ft 6 puppet): how fast they rise (see TAKE_RATE). */
  private hipWas = 0;
  private flew = false;
  private peak = 0;
  private hard = 0;
  private foot = 0;
  /** How far he has opened his hips to run with a man who got by him (0..1, eased), and how hard he is meeting a man body to body (0..1, eased) and where that man is. */
  private opened = 0;
  private felt = 0;
  private tx = 0;
  private tz = 0;
  /** A knock (see hit): how far his trunk is thrown (ft, his frame: to his left, ahead) and how fast that is going (ft a second); then his head's, which follows it late. */
  private readonly jolt = new Float32Array(8);
  /** The last knock, for how he meets it (see braced): its kind, the way it pushed him (his frame), how hard, and how long ago (ms). */
  private met2: { kind: Contact; hx: number; hz: number; k: number; t: number; stood: boolean } | null = null;
  /** A hard knock's step to take it (see hit): which foot (-1 none), how far out of its place it goes (the scene's ft), and how long it has to be taken (ms). */
  private catchK = -1;
  private catchX = 0;
  private catchZ = 0;
  private catchMs = 0;
  private catchLand = false;
  /** The ball is his this frame, and how many of the bodies' ms go by for one of the play's. */
  private has = false;
  /** How far through its move he was last frame (ms; NaN in none), and whether it was played mirrored: see `again`. */
  private tauWas = NaN;
  private mirrored = false;
  private pace = 1;
  /** How high the ball was when his hand last had it (ft): where its bounce starts from. */
  private heldY = 3;
  /** A dribble picked up while the ball was off his hand: how high it was (ft; under 0: none) and how long ago (his ms). */
  private pickY = -1;
  private pickMs = 0;
  /** His own dribble gathered (a catch with the ball already his): how long its bounce takes (the move's ms; 0: none) and how high it was as it began (ft). */
  private gatherMs = 0;
  private gatherY = 3;
  /** A fast ball caught (see caught): how long ago (his ms; past GIVE_IN + GIVE_OUT, none), and how far his hands give with it at the most (ft, his frame: to his left, up, ahead). */
  private catchT = 1e9;
  private readonly catchD: V3 = { x: 0, y: 0, z: 0 };
  /** A rebound (see rebound): how high he takes it, from at his chest (0) to as high as he reaches (1, the clip's own). */
  private takeK = 1;
  private rebW = 0;
  private readonly drib: Dribble = { hand: -1, to: -1, phase: 1, touch: 0, period: 500, push: { x: 0, y: 0, z: 0 }, floor: { x: 0, z: 0 }, catchY: 3, catchV: 0, pushV: 0 };
  /** He has been knocked over (see stumble). */
  private knocked = false;
  private vx = 0;
  private vz = 0;
  /** His speed ahead and to his right, ft a second (the chest leans into them). */
  vf = 0;
  vs = 0;
  private phase = 0;
  private loopT = 0;
  private dwell = 0;
  private blend = 1;
  private blendMs = BLEND_MS;
  /** That blend is a slow one on the clock's time (the buzzer's), and into a move (a shot, a catch: as quick as the move). */
  private slow = false;
  private into = false;
  /** What is left of the pose he was in when he went into this clip: how far it was from the new one, dying away under it. */
  private readonly off = new Float32Array(N);
  private fresh = false;
  private readonly want = new Float32Array(N);
  /** How fast he is turning (radians a second), how far round he may look (eased), and the arm he has out to deny a pass (1 his left, eased). */
  private yawV = 0;
  private lim = LOOK_MAX;
  private deny = 0;
  /** The shot he is taking: its count, how much it fades, whether a leg kicks out, and whether it is off his left hand (a layup from that side) or a step across first. */
  private shots = 0;
  private fade = 0;
  private kick = 0;
  private south = false;
  private euro = 0;
  /** More of what makes a shot his: a step back first, a hop into one off the catch, a layup finished on the far side of the rim, a put-back, a big man's hook. */
  private stepBack = 0;
  private hop = 0;
  private reverse = 0;
  private put = false;
  private hooks = false;
  /** A closeout's short steps (0..1, eased), a hard cut's plant (ms into it, and which way: 1 to his right), and when he next talks on the walk up. */
  private chop = 0;
  private plantT = 1e9;
  /** How he makes this cut (see CUTS), and how many he has made; his stops and his landings, counted the same. */
  private cutKind = 0;
  private cuts = 0;
  private stops = 0;
  private lands = 0;
  /** Short quick steps under him (0..1, eased), and how long they have left (ms). */
  private stutter = 0;
  private stutterMs = 0;
  /** Braced across his way to stop (0..1, eased), and how long it has left (ms). */
  private brace = 0;
  private braceMs = 0;
  /** The way he was last going at a run (a unit, the scene's x and z). */
  private wayX = 0;
  private wayZ = 1;
  private plantSide = 1;
  private talkIn = TALK_EVERY;
  /** He has been put on the floor (until then he has no heading of his own). */
  placed = false;
  /** His pivot foot while he holds the ball (0 his left, 1 his right, -1 none: see PIVOT_KEEP), when he next jabs with the other (his ms of being pressed) and how far into one he is. */
  private pivotK = -1;
  private jabIn = JAB_EVERY;
  private jabT = 1e9;
  /** Set on his feet (see SET_STOP_MS): whether he is, how far he stands from where the plan has him (ft, the scene's), and his own way on still (ft a ms). */
  private setOn = false;
  /** The plan took him off his set (see SET_MOST): not set again until what set him is over. */
  private torn = false;
  private ox = 0;
  private oz = 0;
  private svx = 0;
  private svz = 0;
  /** How fast the plan is taking him (ft a second, eased), whatever his set holds him to. */
  private planSp = 0;
  /**
   * A jump's footwork (see footwork): loading it off both feet (and still in time to step a foot into place), how far
   * through a jump stop's hop (0..1; -1 not yet decided, -2 none this move), and off one foot the one to be down last
   * as he leaves the floor (-1 none, -2 whichever comes) and how long until he does (his ms).
   */
  private loading = false;
  private gathering = false;
  private hopU = -1;
  private lockK = -1;
  private lockMs = 0;
  /** The foot he went up off for a one-foot move (see ONE_FOOT): the one he comes down on. */
  private offK = 0;
  /** He was going last frame (see step: setting off sideways), and how far out in front each foot goes under him (see ahead). */
  private wasGoing = false;
  /** How fast his feet turn over (steps a second), eased (see CADENCE_MS). */
  private cadE = 0;
  private readonly fore = new Float32Array(2);
  /** How far he is sat into his stance on his pivot (0..1, eased: see PIVOT_SIT). */
  private sat = 0;
  /** His jumper is off the dribble (a pull-up: see PULL_HOP). */
  private pullUp = false;
  /** A step-back's plant: how far out in front the foot on his ball side is put (ft, on the 6 ft 6 puppet). */
  private plantFwd = 0;
  /** The move's clock against his own (its ms a ms of his), and his move last frame. */
  private tauRate = 0.5;
  private oneWas: ClipId | null = null;
  /**
   * His dribble, for the body's hands (read after `arms`): the hand over it (1 his left, -1 his right, 0: no dribble),
   * and how far through its bounce it is (0..1 his hand's touch on it, 1..2 the ball off it and back: -1 none).
   */
  overBall: 1 | -1 | 0 = 0;
  push = -1;
  /** Where each free hand goes other than his move's, and how far (see guard: the left's x, y, z, w, then the right's); a defender's swipe at the ball (ms into it, and until the next). */
  private readonly aims = new Float32Array(8);
  /** How far his hands are kept to where his move has the ball, not where the scene has it (0..1), and how far each hand's path is on the scene's ball: each paced, see BALL_TO. */
  private farE = 0;
  private readonly onE = new Float32Array(2);
  /** What he was last leaning on a man as (a box-out, going to the glass into one, a post): his hands keep to it until he is off him. */
  private leanAs: ClipId | null = null;
  /** ...and how long he has been at that (ms, his own). */
  private leanMs = 0;
  /** How long he has been in a move of his own while leaning on a man (ms: see LEAN_OUT), and which hand is on him going to the glass (1 his left: see BAR_SWAP). */
  private leanOneMs = 0;
  private barSide = 0;
  private swipeT = 1e9;
  private swipeIn = 0;
  /** The side the ball is on, for a defender's hands (1 his left; see SIDE_SWAP). */
  private bside: 1 | -1 = -1;
  /** Where each hand sits on the ball (left x, y, z, then right), eased from one grip to another; whether it has been yet; the bodies' ms of the last frame. */
  private readonly grips = new Float32Array(6);
  private gripped = false;
  private ownMs = 16;
  /**
   * Each hand (the left's, then the right's), from its shoulder in his frame: the path it follows exactly (his clip's
   * hand, onto the ball as far as his clip's grip has it) and how far it is laid off that path to where everything
   * else wants it, followed (see settle.ts); and how far each is from where it is wanted (ft: a hand still on its way
   * to taking hold of the ball doesn't hold it yet, see holds).
   */
  private readonly handF: readonly [Follow, Follow] = [new Follow(), new Follow()];
  private readonly handOff = new Float64Array(2);
  /** How far each hand's path is onto the ball (his clip's grip, paced: see GRIP_SPEED). */
  private readonly gripS = new Float64Array(2);
  /** How far each hand is wanted off where it would be for its arm to keep off the ball that isn't his (see clearArm). */
  private readonly armDodge = new Float64Array(6);
  /** How far each hand was pushed off a man last frame (ft, the 6 ft 6 puppet's: see PUSH_GROW). */
  private readonly pushV = new Float64Array(2);
  /** How long since he set off at a run (his ms: see PUSH_MS), how hard he pushes off and plants (his family's), and his jumper's form (see shoot: 0 set, 1 flow, 2 high, 3 push). */
  private pushT = 1e9;
  private pushK = 1;
  private stopK = 1;
  private form = 0;
  /** Since the buzzer (his ms), and when his next beat of it is (see encore). */
  private overT = 0;
  private encoreAt = 0;
  /** The ball as his hands have it, or will (his frame): where he wants it, followed (see settleBall). */
  private readonly ballF = new Follow();
  private readonly ballAt: V3 = { x: 0, y: 0, z: 0 };
  /** What is laid over his clip, followed (see Lay). */
  private readonly lay = new Lay(N, LAY_SPEED, LAY_FRAME, LAY_W);
  /** The clock's ms of the last frame (a drawn frame's: see Pace.frame). */
  private easeMs = 16;
  /** Each ankle as it was drawn last frame (his frame: x, y, z) and how far it was from its hip (0: not known): see KNEE_FOLD. */
  private readonly legWas = new Float32Array(8);
  /** Where the ball was last frame on its way to him (the scene's x, y, z), and whether it was (see CATCH_STILL). */
  private readonly ballWas = new Float64Array(4);
  /** Where his hands are out to meet a pass, from where he takes it (ft, his frame), and how long since they were (his ms: see CATCH_IN). */
  private readonly met: V3 = { x: 0, y: 0, z: 0 };
  private metT = 1e9;
  /** Where each elbow pointed (see ELBOW_TURN): his frame, the left's then the right's. */
  private readonly elbows = new Float32Array(6);
  /** How long since his last move ended (the bodies' ms, see ARM_RELAX). */
  private loose = 1e9;
  /** How far a stride has his hips sunk below the pose's (ft, eased), and what that was going into this frame. */
  private sink = 0;
  private sinkFrom = 0;
  /** His stride, eased (see step): how much of it a foot is down, how early it is up, how high it goes (ft). */
  private downE = 0.5;
  /** The stride his legs take going ahead (see stride.ts): for the speed he is getting up to, eased (`strideV`, ft a second). */
  private gait: Stride = { k: 0, w: 0 };
  private strideV = 0;
  /** His legs took a runner's stride last frame (going ahead, played at 2x or under: see STRIDE_UNTIL). */
  private strode = false;
  private linedE = 0;
  private kneeOut = [KNEE_OUT, KNEE_OUT];
  private paceE = 0;
  private liftE = 0.3;
  private ax = 0;
  private az = 0;
  private hasAim = false;
  /** The ball is in his left hand (a crossover puts it there, the next brings it back). */
  lefty = false;
  private flip = 0;
  /** How far a leap has carried him from where the plan has him. */
  private cx = 0;
  private cz = 0;

  /** How long his own time has run with the play's stopped, ms. */
  private over = 0;
  /** The move that time belongs to: what he was doing and how far into it, last frame. */
  private act: Act = 'stand';
  private at = 0;
  /** Where the plan had him last frame, and how far the scene moved him off that (see nudge). */
  private px = 0;
  private pz = 0;
  private nx = 0;
  private nz = 0;
  /** How much higher than the clip's a dunk's jump is, for his size. */
  private readonly rise: number;
  /** How he stands when he's standing: no two quite alike. */
  private idle: ClipId = 'idle';
  /** How long he keeps standing that way (ms), whether it's at rest, and how many ways he has stood. */
  private standMs = 0;
  private resting = false;
  private standN = 0;
  /** His drives so far (each opens his own way: see IN_OUT). */
  private drives = 0;
  /** Whose body this is (see Drive.who), the dunk he's going up for, and how many he has. */
  private who = 0;
  /** Whose body this is (his player id; 0: not said): what is his own, a hand's shape, goes by it. */
  get me(): number {
    return this.who;
  }
  private dunk: ClipId = 'dunk';
  /** The shot he is going up with won't go down (see Drive.fails). */
  private fails: 'miss' | 'block' | undefined;
  private dunks = 0;
  /** The finish his shot is named for (Drive.how), from going up for it until he is on to something else. */
  private how: Finish | undefined;
  /** The move of the script he was last in (Drive.k), and whether he has shown this move's fake. */
  private kWas = -1;
  /** The shot he last went up with (a jumper, a floater, a layup, a dunk...): what its release is, see update. */
  private lastShot: ClipId | null = null;
  /** Cut into a replay on a frame with no time: what the tape puts back is still to be put back (see update). */
  private reload = false;
  /** The possession's time last frame (Drive.t), the hand the ball was in, and the possession it was (see Tape). */
  private tWas = 0;
  private handWas = false;
  private tapeWas: Map<string, unknown> | undefined;
  private faked = false;
  /** A pull-up's hop into the shot (decided as he goes up, see land). */
  private hops = false;
  /** The pass he's about to make, or making (from his chest, one hand, over his head), and how many he has. */
  private passId: ClipId = 'pass';
  private passes = 0;
  private winding = false;
  /** The pose he was in, all but where he looks: what the next clip eases from. */
  private readonly base = new Float32Array(N);
  /** Where he's looking: a heading on the floor and how far up, eased, and how fast each is turning. */
  private gw = 0;
  private gwv = 0;
  private headWas = 0;
  private headed = false;
  private gp = 0;
  private gpv = 0;
  /** How far off (ft, from his eyes) the thing he looks at is, or Infinity: his eyes turn in for it (figure.ts). */
  lookFar = Infinity;
  /** Where that thing is (the scene's point, while lookFar is not Infinity): his eyes find it (figure.ts). */
  readonly seen = { x: 0, y: 0, z: 0 };
  /** How free his chest is to turn with his eyes (0..1, eased). */
  private freed = 0;
  /** How fast he is getting going (ft a second squared, eased: less than none pulling up), his speed a frame ago, how quick his turn is for his feet (see TURN_DOWN), and how hard his path is turning (ft a second squared, to his right). */
  private acc = 0;
  /**
   * His weight on his feet (see weigh): the share of it on his left foot (0..1, eased); each foot down last frame and how
   * long since it was put down (ms, his own); and the sink of the foot last put down into it (on the 6 ft 6 puppet's
   * scale, as the pose's hip) and how long since (ms).
   */
  /** The man he last met body to body (his player id; -1 none): see contact. */
  private mate = -1;
  /** ...and where that man's feet are (this frame; none when no one is on him): he doesn't step on them (see FOOT_OFF). */
  private mateFeet: readonly { x: number; z: number }[] | null = null;
  private loadL = 0.5;
  private downWas = [true, true];
  private strikeMs = [1e9, 1e9];
  private absorbK = 0;
  private absorbT = 1e9;
  private absorbK0 = 0;
  private absorbT0 = 1e9;
  private slowing = 0;
  private spW = 0;
  private overW = 0;
  private accBody = 0;
  private spWas = 0;
  private gate = 1;
  private bend = 0;
  private bvx = 0;
  private bvz = 0;
  /** How hard he has been going (0..1), his breath, his speed ahead a beat ago and the lean it gives. */
  effort = 0;
  breath = 0;
  private vfLag = 0;
  /** Where he is about to go is known this frame (Drive.ahead), and how hard it will push him the way he faces (ft a second squared, eased). */
  private led = false;
  private urge = 0;
  /** And how hard the plan's path is about to turn to his right (ft a second squared, eased). */
  private curve = 0;
  private leanGo = 0;
  /** A little reset in a stance: when the next one comes (ms), and how far into one he is. */
  private resetIn = 1500;
  private resetT = 1e9;
  /** A dribbler's next crossover (play ms), the shot he last took, and how far his follow-through is held. */
  private crossIn = CROSS_EVERY;
  private shot: ClipId | null = null;
  private fw = 0;
  private fwv = 0;
  /** A pass's follow-through (see follow): how far into it (and how fast that is going), and which pass it was. */
  private pw = 0;
  private pwv = 0;
  private passed: ClipId = 'pass';
  /** He has gone up for his chest bump at the buzzer. */
  private bumped = false;
  /** A gesture asked for (made as soon as he's free), the one he's making, and where its hand goes (his teammate's for a five). */
  private wish: { id: Gesture; mate: Puppet | null; age: number; wait: number } | null = null;
  private gest: { id: Gesture; t: number; mate: Puppet | null; w: number; side: 1 | -1 } | null = null;
  private reach: { x: number; y: number; z: number; w: number; side: 1 | -1 } | null = null;

  constructor(body: Body) {
    this.body = body;
    this.rise = clamp(((RIM_Y - 0.15) / body.s - DUNK_ARM - HIP) / DUNK_HIP, 1, DUNK_RISE);
  }

  /** The way he faces and his right, on the floor. */
  private dirs(): [number, number, number, number] {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return [s, c, -c, s];
  }

  /** The way his legs go, as dirs: his heading, and his hips' lead round from it (see LEAD_FROM). */
  private legDirs(): [number, number, number, number] {
    const s = Math.sin(this.yaw + this.hipLead);
    const c = Math.cos(this.yaw + this.hipLead);
    return [s, c, -c, s];
  }
  /** How far his hips and legs are round from the way he faces (radians, as yaw): see LEAD_FROM. */
  hipLead = 0;
  /** How wide he stands, as his feet go by it (the pose's I.wide, followed: see WIDE_MS). */
  private wideE = Number.NaN;

  /** A point on the floor, in his frame. */
  private local(wx: number, wz: number): [number, number] {
    const dx = wx - this.x;
    const dz = wz - this.z;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
  }

  /** A point in his frame, in the scene. */
  world(lx: number, ly: number, lz: number, out: V3): V3 {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    out.x = this.x + lx * c + lz * s;
    out.y = ly;
    out.z = this.z - lx * s + lz * c;
    return out;
  }

  /**
   * One frame on: `dt` is the play's time (ms), which his moves are keyed to. `own` is his body's
   * time (ms): his speed is measured on it and his legs turn over on it. The 3D court plays the play
   * slower than his body runs (COURT3D_PACE), so his feet keep up with where the plan has him. `ease`
   * is the clock's own time (ms): his head turns and his arms go up at the buzzer on it, no faster a frame
   * when the game is played fast; `turn` (ms) is what his body's turns go by, between the two (the scene's TURN_PACE).
   */
  update(d: Drive, dt: number, own = dt, ease = own, turn = ease) {
    const { s } = this.body;
    const P = this.pose;
    // (what one pose eases into another by: his own time, up to BLEND_PACE times the clock's)
    const soft = Math.min(own, ease * BLEND_PACE);
    this.softMs = soft;
    // a new possession from fresh spots (a highlight, a skip, a quarter that ended on his dunk): he is put there, and
    // whatever he was in the middle of is dropped. (A leap is measured from the rim: left running, it would hold
    // him at the old basket and walk him the length of the floor.)
    const cut = this.placed && (!!d.cut || Math.hypot(d.x - this.px, d.z - this.pz) > CUT);
    // (how fast the plan takes him, whatever his feet hold him to: see SET_STOP_MS)
    if (this.placed && !cut && own > 0) this.planSp += ((Math.hypot(d.x - this.px, d.z - this.pz) * 1000) / own - this.planSp) * (1 - Math.exp(-own / 90));
    this.px = d.x;
    this.pz = d.z;
    if (cut) {
      this.hasAim = false;
      this.cx = this.cz = 0;
      P[I.leap] = 0;
      P[I.air] = 0;
    }
    if (d.aim) {
      this.ax = d.aim.x;
      this.az = d.aim.z;
      this.hasAim = true;
    }
    // where the plan has him, carried toward the rim by a leap
    // (a dunker hangs from the rim at arm's length: any nearer and his head is in the net)
    let cx = 0;
    let cz = 0;
    const leap = P[I.leap];
    if (leap > 0.001 && this.hasAim) {
      const gx = this.ax - d.x;
      const gz = this.az - d.z;
      const g = Math.hypot(gx, gz);
      if (isDunk(this.clip)) {
        // (wherever the plan has him, under the rim too: he is carried out to arm's length from it, on the side he came from)
        const ox = -gx + (this.ax < 0 ? DUNK_OPEN : -DUNK_OPEN) * s;
        const ol = Math.hypot(ox, gz) || 1;
        // (out there before he is head-high: the jump gets him up sooner than the clip's leap gets him out)
        const out = Math.min(1, leap * 1.4);
        cx = (gx + (ox / ol) * DUNK_OFF * s) * out;
        cz = (gz + (-gz / ol) * DUNK_OFF * s) * out;
      } else if (g > 0.01) {
        const go = Math.max(0, g - s);
        cx = (gx / g) * go * leap;
        cz = (gz / g) * go * leap;
      }
    }
    // (the leap takes him there; coming down he is where he landed, and walks back from it)
    const back = Math.hypot(cx - this.cx, cz - this.cz);
    const most = Math.hypot(cx, cz) >= Math.hypot(this.cx, this.cz) || P[I.air] > 0.5 ? Infinity : (BACK * own) / 1000;
    if (back <= most) [this.cx, this.cz] = [cx, cz];
    else {
      this.cx += ((cx - this.cx) / back) * most;
      this.cz += ((cz - this.cz) / back) * most;
    }
    // (set on his feet he holds his ground, and goes after the plan's spot once he is free)
    if (this.placed && !cut) this.hold(d.x + this.cx, d.z + this.cz, own);
    let rx = d.x + this.cx + this.ox;
    let rz = d.z + this.cz + this.oz;
    const jumped = !this.placed || cut || Math.hypot(rx - this.x, rz - this.z) > CUT;
    // A body's way changes only through a foot on the floor. The plan's path bends and slows as it likes, in the air
    // between two strides as much as over a foot; he doesn't. At a run, with both feet off the floor, he goes on as he
    // was going, dead straight and no slower; what that leaves him off the plan's spot (never more than FLY_MOST) he
    // makes up over the foot he comes down on, as a push: so a cut is a plant and a drive off it, and pulling up is
    // braking steps, each taking some of his speed. How fast the plan itself has him going is kept apart (`lvx`): what
    // he leans and banks by is the path, not each push.
    if (jumped) this.flx = this.flz = this.flvx = this.flvz = this.lvx = this.lvz = this.rvx = this.rvz = 0;
    else if (own > 0) {
      const kq = 1 - Math.exp(-own / VEL_MS);
      const [px0, pz0] = [rx - this.planX, rz - this.planZ];
      this.lvx += (px0 / own - this.lvx) * kq;
      this.lvz += (pz0 / own - this.lvz) * kq;
      const sec = own / 1000;
      const flying =
        own <= FLY_OWN_MOST &&
        !this.one &&
        !this.setOn &&
        this.pivotK < 0 &&
        P[I.air] < 0.2 &&
        this.felt < 0.05 &&
        this.feet.every((f) => f.swing) &&
        Math.hypot(this.lvx, this.lvz) * 1000 > FLY_FROM;
      // (as he was going: unless that takes him farther off his spot than he may be, by a man no farther than half the room
      // there is between them past their bodies, since each may be as far off his own; then, as over a foot, he comes back to it)
      const fx = this.flx + this.rvx * own - px0;
      const fz = this.flz + this.rvz * own - pz0;
      if (flying && Math.hypot(fx, fz) <= clamp((this.room / s - FLY_CLEAR) / 2, 0, FLY_MOST) * s) {
        [this.flvx, this.flvz] = [(fx - this.flx) / sec, (fz - this.flz) / sec];
        [this.flx, this.flz] = [fx, fz];
      } else {
        [this.flx, this.flvx] = spring(this.flx, this.flvx, 0, FLY_W, sec);
        [this.flz, this.flvz] = spring(this.flz, this.flvz, 0, FLY_W, sec);
      }
    }
    if (jumped || own > 0) [this.planX, this.planZ] = [rx, rz];
    rx += this.flx;
    rz += this.flz;
    const nx = this.nx;
    const nz = this.nz;
    this.nx = this.nz = 0;
    const yaw0 = this.yaw;
    if (jumped) {
      // (put somewhere new he is there, on his own two feet: nothing set or pivoted on is carried there)
      this.x = rx - this.ox;
      this.z = rz - this.oz;
      this.ox = this.oz = this.svx = this.svz = 0;
      this.setOn = false;
      this.pivotK = -1;
      this.yaw = d.yaw;
      this.yawV = 0;
      this.vx = this.vz = 0;
      this.one = null;
      this.blend = 1;
      this.cx = this.cz = 0;
      this.gw = d.yaw;
      this.gwv = 0;
      this.headed = false;
      this.gest = this.wish = null;
      this.settle();
      // (and his pose and his hands are where they are wanted, from here)
      this.lay.reset();
      this.ballF.reset();
      this.handF[0].reset();
      this.handF[1].reset();
    } else if (own > 0) {
      // (how fast the plan has him going: where he was moved off its spot last frame (see nudge) is no step of his)
      const k = 1 - Math.exp(-own / VEL_MS);
      this.vx += ((rx - this.x + nx) / own - this.vx) * k;
      this.vz += ((rz - this.z + nz) / own - this.vz) * k;
      // (and how fast he went this frame, as it was: what he carries through the air)
      this.rvx = (rx - this.x + nx) / own;
      this.rvz = (rz - this.z + nz) / own;
      this.x = rx;
      this.z = rz;
      // (a dunker turns to the rim as he goes up: his hands go where he is looking)
      const up = isDunk(this.clip) && this.hasAim && leap > 0.2;
      // (a defender his man has got by: faster than a slide goes, the way he's going far round from the way he faces, he
      // opens his hips and runs with him, and squares up again once he's caught up. So does any man without the ball
      // sent somewhere faster than a man slides or backs up, away from the way he faces: a screener on his way to set it
      // turns and runs there. Not in a move, or leaning on a man for the ball)
      // (the way the plan has him going, not each push of his own: see `lvx`)
      const sp0 = Math.hypot(this.lvx, this.lvz) * 1000;
      const run = Math.atan2(this.lvx, this.lvz);
      const loose = !ONE[d.act] && d.act !== 'boxout' && d.act !== 'crash' && d.act !== 'release' && d.act !== 'land' && d.act !== 'inbound';
      const beaten = loose && (!d.ball || d.act === 'hold') && sp0 > BEATEN_AT && Math.abs(wrap(run - d.yaw)) > BEATEN_ROUND;
      this.opened += ((beaten ? 1 : 0) - this.opened) * (1 - Math.exp(-turn / BEATEN_MS));
      // (a spin: all the way round on his front foot, his back to the man through the middle of it, over his shoulder
      // on the side away from the ball; once round he faces where he did, so nothing is unwound after it. The turn is
      // the move's own, counted as it is asked for and laid on his heading (see spin): it is never a place for his
      // turning to catch up with. Asked for that way it was the short way round to wherever the spin had got to, and
      // played at 4x, where a frame is more of the spin than a man may turn in one, he fell half a turn behind it,
      // the short way became the way back, and he unwound out of a spin he was a third of the way round)
      let paid = this.spinPaid;
      if (this.one?.id === 'spin') {
        const ask = (this.lefty ? -1 : 1) * 2 * Math.PI * smooth(clamp((this.one.tau - SPIN[0]) / (SPIN[1] - SPIN[0]), 0, 1));
        this.spinOwed += ask - this.spinAsk;
        this.spinAsk = ask;
      } else if (this.spinAsk !== 0) {
        // (the move over. Past half way round when it ended (all of it, but for a move cut short or a frame so long
        // it stepped over the end of it): the rest of the turn is his to finish, the way it was going. Short of half
        // way: he is where he is, and comes round to where he should face the short way, as from any other turn)
        if (Math.abs(this.spinAsk) < Math.PI) this.spinOwed = this.spinPaid = paid = 0;
        else this.spinOwed += Math.sign(this.spinAsk) * 2 * Math.PI - this.spinAsk;
        this.spinAsk = 0;
      }
      // (what is owed is paid no faster than a body may turn in a frame: at 4x he finishes the spin a few frames
      // after the move does, still going the same way round)
      const spin = clamp(this.spinOwed, -SPIN_FRAME, SPIN_FRAME);
      this.spinOwed -= spin;
      this.spinPaid = this.spinAsk === 0 && this.spinOwed === 0 ? 0 : this.spinPaid + spin;
      const face = up ? Math.atan2(this.ax - rx, this.az - rz) : this.opened > 0.01 ? d.yaw + wrap(run - d.yaw) * this.opened : d.yaw;
      // (the heading his turning is after: his own without what the spin has put on it)
      const base = this.yaw - paid;
      // (in the air he turns in his own time: played fast, he still has the rim in front of him when he gets to it)
      // (he turns as a body does: it gathers speed, and no faster than a man spins. A dunker in the air has the rim in front of him whatever)
      // (and his turns keep up with a play run fast: `turn` is more of his own time than the clock's then. He still
      // gathers the turn and gives it up on the clock, so it starts and ends as gently a frame as at 1x)
      const sec = (up ? Math.max(ease, own * 0.6) : turn) / 1000;
      const gather = Math.min(sec, ease / 1000);
      if (sec > 0 && up) {
        const [to, v] = spring(0, this.yawV, wrap(face - base), 30, sec);
        this.yaw += to;
        this.yawV = clamp(v, -TURN_MAX, TURN_MAX);
      } else if (sec > 0) {
        // (the speed he'd turn at to get there: no faster than a man spins, and slow enough to stop on it; a move's
        // turn, squaring up to the rim or to a pass, is quicker. He gathers that speed and gives it up as a body
        // does, never all in a frame: a turn starts with a step into it and ends with him set)
        const off = wrap(face - base);
        const down = this.feet.some((f) => !f.swing) && P[I.air] < 0.5;
        const [most, acc] = this.turning(off, wrap(face - run), sp0, !!ONE[d.act], down);
        const want = Math.sign(off) * Math.min(most, Math.sqrt((1.6 * acc * Math.abs(off) * gather) / sec), Math.abs(off) * (ONE[d.act] ? 30 : 13));
        this.yawV += clamp(want - this.yawV, -acc * gather, acc * gather);
        // (at a run his body comes round over a planted foot: quicker with one down, slower with both up)
        const running = sp0 > TURN_GATE_FROM && (!this.one || this.one.id === 'start');
        this.gate += ((running ? (down ? TURN_DOWN : TURN_UP) : 1) - this.gate) * (1 - Math.exp(-own / TURN_GATE_MS));
        let step = this.yawV * sec * this.gate;
        if (step * off > 0 && Math.abs(step) > Math.abs(off)) [step, this.yawV] = [off, 0];
        // (never more of a turn in one frame than a man's fastest is at 1x, however fast the play is run)
        this.yaw += clamp(step, -TURN_FRAME, TURN_FRAME);
      }
      this.yaw += spin;
      // (on his pivot, his body goes round on its ball as he turns)
      if (this.pivotK >= 0 && this.setOn) this.orbit(wrap(this.yaw - yaw0));
      // his hips and legs ahead of him into a run far round from the way he faces: see LEAD_FROM. (Going straight
      // back, the side they have already begun to open to)
      const off = wrap(run - this.yaw);
      const side = Math.abs(off) > 2.6 && Math.abs(this.hipLead) > 0.05 ? Math.sign(this.hipLead) : Math.sign(off);
      const free = loose && !d.ball && !this.one && P[I.air] < 0.5 && this.pivotK < 0;
      const lead = free
        ? side *
          Math.min(Math.abs(off), LEAD_MAX) *
          smooth(clamp((this.going(sp0) - LEAD_FROM) / LEAD_SPAN, 0, 1)) *
          smooth(clamp((Math.abs(off) - LEAD_OFF) / LEAD_OFF_SPAN, 0, 1))
        : 0;
      this.hipLead += clamp((lead - this.hipLead) * (1 - Math.exp(-own / LEAD_MS)), -LEAD_FRAME, LEAD_FRAME);
    }
    if (jumped) this.hipLead = 0;
    this.ownMs = Math.max(0, own);
    // (a replay cut into, or a body first put on the floor in one: what it puts back from the tape, the hand the ball was in
    // and a crossover he was in the middle of, is put back on the first frame with time in it, not lost with a frame
    // that has none, nor skipped for a body that was never placed)
    if (!d.tape?.again) this.reload = false;
    else if (cut || !this.placed) this.reload = true;
    if (own <= 0 && this.placed && !jumped) return;
    this.placed = true;
    if (jumped) this.gripped = false;

    const [fx, fz, sx, sz] = this.dirs();
    // (how fast he is going, and which way across himself, as the plan has him: what he does goes by that. His feet go
    // by how he is in fact going, pushes and all: see step)
    const sp = Math.hypot(this.lvx, this.lvz) * 1000;
    const vf = (this.lvx * fx + this.lvz * fz) * 1000;
    const vs = (this.lvx * sx + this.lvz * sz) * 1000;
    const lsp = sp;
    // how fast he is getting going or pulling up, and how hard his path is turning to his right (ft a second squared, eased on his own time)
    if (jumped) this.acc = this.accBody = this.bend = this.urge = this.curve = 0;
    else if (own > 0) {
      const k = 1 - Math.exp(-own / GAIN_MS);
      // (the plan's own, not his pushes': see `lvx`)
      let acc = ((lsp - this.spWas) * 1000) / own;
      let bend = (((this.lvx - this.bvx) * sx + (this.lvz - this.bvz) * sz) * 1e6) / own;
      let urge = 0;
      let curve = 0;
      // (what is coming, with what has been: a body shifts its weight to make a start, a stop or a cut, so it is on its
      // way over before his path shows it. What he does that the plan doesn't know of, a step round a man, is still felt)
      const a = d.ahead;
      this.led = !!a && a.ms > 0 && !cut;
      if (a && this.led) {
        // (how his travel changes from the beat coming to the one after it: ft a second squared, a beat ahead of him,
        // which is about as long as his body takes to answer it)
        const h = a.ms / 1000;
        const ax = (a.x2 - 2 * a.x) / (h * h);
        const az = (a.z2 - 2 * a.z) / (h * h);
        acc = (Math.hypot(a.x2 - a.x, a.z2 - a.z) - Math.hypot(a.x, a.z)) / (h * h);
        curve = ax * sx + az * sz;
        bend += (curve - bend) * LED_BEND;
        urge = ax * fx + az * fz;
      }
      this.acc += (acc - this.acc) * k;
      this.accBody += (this.acc - this.accBody) * (1 - Math.exp(-own / GAIN_BODY_MS));
      this.bend += (bend - this.bend) * k;
      this.urge += (urge - this.urge) * k;
      this.curve += (curve - this.curve) * k;
    }
    this.spWas = lsp;
    this.bvx = this.lvx;
    this.bvz = this.lvz;

    // the move he's in the middle of
    // (the play's clock stopped under him, a timeout or the buzzer: he finishes it on his own time, and comes to a stand)
    // (that time stays his until the next move: the play going on again doesn't take him back to where its clock stopped)
    this.has = d.ball;
    if (dt > 0 && own > 0) this.pace = own / dt;
    if (d.who !== undefined) this.who = d.who;
    if (this.styled !== this.who) this.style();
    // what he chooses for a move is chosen once, as he goes into it, and kept with the possession (see Tape): the
    // same dunk, pass, hand and footwork whenever that move is played again
    const took = <T>(kind: string, k: number | undefined, make: () => T): T => {
      if (!d.tape || k === undefined) return make();
      const key = `${this.who}:${kind}:${k}`;
      if (d.tape.takes.has(key)) return d.tape.takes.get(key) as T;
      const t = make();
      d.tape.takes.set(key, t);
      return t;
    };
    // (the hand his dribble is in as each move begins: a replay cut into the middle of the play has it where it was)
    if (d.k !== undefined && d.k !== this.kWas) this.faked = false;
    // (played again, and put into the middle of it: the ball is in the hand it was in then, and a crossover he was in
    // the middle of he is in the middle of)
    const T = d.tape;
    const t = d.t ?? 0;
    const due = (from: number): { t: number; id: ClipId } | undefined =>
      (T?.takes.get(`${this.who}:own`) as { t: number; id: ClipId }[] | undefined)?.find((x) => x.t > from && x.t <= t);
    if (T?.again && (cut || this.reload)) {
      this.reload = false;
      let hand = false;
      for (const h of (T.takes.get(`${this.who}:hands`) as { t: number; lefty: boolean }[] | undefined) ?? []) if (h.t <= t) hand = h.lefty;
      this.lefty = hand;
      // (the last he began before here: one after another, the first of two in its time is long over)
      const mid = d.ball ? (T.takes.get(`${this.who}:own`) as { t: number; id: ClipId }[] | undefined)?.filter((x) => x.t > t - MOVE_LONG && x.t <= t).pop() : undefined;
      if (mid && t - mid.t < span(CLIPS[mid.id])[1]) this.one = { id: mid.id, tau: t - mid.t };
      // (and the tape's crossovers to come are the ones after here: not one he had done and finished before the cut,
      // played again from its start off a clock left from wherever he was before)
      this.tWas = t;
    }
    this.kWas = d.k ?? -1;
    const shoots = d.act === 'dunk' || d.act === 'jumper' || d.act === 'floater' || d.act === 'layup';
    if (shoots && this.act !== d.act) this.how = d.how;
    else if (!shoots && d.act !== 'release') this.how = undefined;
    // (each dunk is one of his: two hands, one, or hanging on the rim. One named for its two hands has them; a lob is
    // put down, not hung on)
    // (nor is one that doesn't go down: a miss is jammed off the iron and a block stuffed, and he comes straight down)
    if (shoots && this.act !== d.act) this.fails = d.fails;
    else if (!shoots && d.act !== 'release') this.fails = undefined;
    if (d.act === 'dunk' && this.act !== 'dunk')
      this.dunk = took('dunk', d.k0, () => {
        const r = hash(this.who, ++this.dunks);
        const mine = DUNKS[Math.floor(r * DUNKS.length)];
        // (called two-handed, one of the two-handers; a lob taken in the air, or one that doesn't go down, a plain one
        // with as many hands as his own had: there is no time in either to take it back behind his head or out wide)
        if (d.how === 'two') return DUNKS_TWO[Math.floor(r * DUNKS_TWO.length)];
        // (called a reverse, it is one)
        if (d.how === 'reverse' && !d.fails) return 'dunkRev';
        if (d.how === 'oop' || d.fails) return DUNKS_PLAIN.includes(mine) ? mine : DUNKS_PLAIN[ONE_FOOT.has(mine) || (d.fails && mine === 'dunkHang') ? 1 : 0];
        return mine;
      });
    // (each pass is one of his: picked as he draws it in, or as it goes if he had no time to)
    const swap = d.swap;
    const winds = !swap && d.ball && d.pass !== undefined && d.act !== 'pass';
    // (thrown in from out of bounds, it comes from over his head, where he has it)
    if (!swap && ((winds && !this.winding) || (d.act === 'pass' && this.act !== 'pass' && !this.winding)))
      this.passId = took('pass', d.act === 'pass' ? d.k0 : d.k === undefined ? undefined : d.k + 1, () =>
        d.act === 'inbound' || this.act === 'inbound' ? 'passOver' : this.passOf(d.act === 'pass' ? this.act : d.act),
      );
    this.winding = winds || (this.winding && d.act === 'pass' && !swap);
    // (a hand-off he gives: where he holds it out, and how far: see ballWant)
    if (swap?.give && swap.at) {
      this.offerAt.x = swap.at.x;
      this.offerAt.y = swap.at.y;
      this.offerAt.z = swap.at.z;
      this.offerW = clamp(swap.w ?? 1, 0, 1);
    } else this.offerW = 0;
    // (each shot is one of his, as far as its name leaves it to him: a jumper fades, steps back or turns only when it is
    // called that; what is his own is a kicked leg, and a hop into it. A layup goes up off the hand on its side of the rim)
    if (d.act === 'jumper' && this.act !== 'jumper') {
      const t = took('jumper', d.k0, () => {
        const r = hash(this.who, 80 + ++this.shots);
        const off = DRIBBLES.has(this.clip) || isMove(this.clip);
        const how = d.how;
        return {
          fade: how === 'fade' ? 0.75 + 0.3 * r : how === 'turn' ? 0.4 + 0.2 * r : 0,
          // (whether he kicks a leg out is his: some men on every one, most hardly ever)
          kick: hash(this.who, 85 + this.shots) < this.kickLike || how === 'fade' ? 1 : 0,
          // (off the dribble he steps back for it; off the catch he hops into it)
          stepBack: how === 'stepBack' ? 1 : 0,
          // (and only if he is a man who hops into it: others set their feet as it comes)
          hop: how !== 'stepBack' && !off && ((this.hopper && (this.clip === 'catch' || this.act === 'catch')) || how === 'set') ? 1 : 0,
          pullUp: off || how === 'pullUp',
          hops: hash(this.who, 90 + this.shots) < PULL_HOP,
        };
      });
      this.fade = t.fade;
      this.kick = t.kick;
      this.stepBack = t.stepBack;
      this.hop = t.hop;
      this.pullUp = t.pullUp;
      this.hops = t.hops;
    }
    // (a hook is a hook because the play calls it one; with no word for it at all, a big man's runner is one)
    if (d.act === 'floater' && this.act !== 'floater') this.hooks = took('floater', d.k0, () => (d.how ? d.how === 'hook' : s > 1.03 && hash(this.who, 160 + ++this.shots) < 0.75));
    if (d.act === 'layup' && this.act !== 'layup') {
      const t = took('layup', d.k0, () => {
        const side = d.aim ? (d.z - d.aim.z) * (d.aim.x < 0 ? 1 : -1) : 0;
        const r = hash(this.who, 120 + ++this.shots);
        const how = d.how;
        // (he has just come down with the board: straight back up with it)
        const put = how === 'putback' || (!how && (this.act === 'rebound' || this.one?.id === 'rebound'));
        return {
          south: side > LAYUP_SIDE * s,
          // (a step across on his way up: a drop step's and an up-and-under's always; his own, now and then, on a plain one)
          euro: how === 'step' || how === 'under' ? (r < 0.5 ? 1 : -1) : !how && r < this.euroLike ? (r < this.euroLike / 2 ? 1 : -1) : 0,
          put,
          // (under the rim and back over his head only when that is what it was)
          reverse: !put && how === 'reverse' ? 1 : 0,
        };
      });
      this.south = t.south;
      this.euro = t.euro;
      this.put = t.put;
      this.reverse = t.reverse;
    }
    if (d.act !== this.act || d.ms < this.at) this.over = 0;
    else if (dt <= 0) this.over += own;
    this.act = d.act;
    this.at = d.ms;
    if (!d.over) this.bumped = false;
    const ms = d.ms + this.over;
    // (a crossover that ends within the time this frame covers is over, the ball in his other hand, before whatever
    // starts in it: a move begun on that frame took its place and left the ball in the hand it was leaving, or not, by
    // where the frames fell, live one way and played again the other)
    const cr = this.one;
    if (cr && SWITCHES.has(cr.id) && cr.tau + (dt > 0 ? dt : own) > span(CLIPS[cr.id])[1]) {
      this.lefty = !this.lefty;
      this.one = null;
    }
    const one = ONE[d.act];
    // (a hand-off, either end of it: one move, on the exchange's own clock, whatever the play has him doing meanwhile:
    // the man it is for has his hands out for it as he runs in, the man who has it holds it out and lets go once it is taken)
    if (swap) this.one = { id: swap.give ? 'handoff' : 'take', tau: swap.tau };
    else if (one) {
      const id =
        one[0] === 'dunk' ? this.dunk : one[0] === 'pass' ? this.passId : one[0] === 'layup' && this.put ? 'putback' : one[0] === 'floater' && this.hooks ? 'hook' : one[0];
      // (a move shorter than the clip's lead-in plays the lead-in quicker, up to LEAD_IN times: a shooter still
      // gathers and dips before he rises, he doesn't start halfway up)
      if (shoots) this.lastShot = id;
      const lead = -span(CLIPS[id])[0];
      // (an alley-oop: he is up in the air as the lob gets to him, not leaving the floor: his dunk is that much ahead of its move)
      const end = d.dur;
      const tau = one[1] === 'end' ? ms - end + (this.how === 'oop' ? OOP_EARLY : 0) : ms;
      this.one = { id, tau: tau < 0 && end > 0 ? Math.max(-lead, tau * clamp(lead / end, 1, LEAD_IN)) : tau };
    } else if (d.act === 'release' || d.act === 'land')
      // (after the shot, the shot he took: a floater's or a layup's man isn't put into a jumper because his move ran out first)
      this.one = {
        id: this.one?.id ?? (d.act === 'release' ? (this.lastShot ?? 'jumper') : 'contest'),
        tau: Math.max(this.one?.tau ?? 0, ms + (this.how === 'oop' ? OOP_EARLY : 0)),
      };
    // (a shot fake: up with it and back down, once in its move)
    else if (d.fake && d.ball && !this.faked) {
      this.one = { id: 'pump', tau: 0 };
      this.faked = true;
    }
    // (a drive opens with a crossover, as soon as the ball is back in his hand: never snatched out of the air)
    else if (d.act === 'drive' && d.ball && d.ms < CROSS_MS && this.one && isMove(this.one.id)) this.one.tau += dt > 0 ? dt : own;
    // (played again, he crosses it over where he did then, and nowhere else: see Tape)
    else if (T?.again && d.ball && !this.one && due(this.tWas)) this.one = { id: due(this.tWas)!.id, tau: 0 };
    // (his own way of starting one: most cross it over, some go in and out and keep it in the hand it is in)
    else if (!T?.again && d.act === 'drive' && d.ball && d.ms < CROSS_MS && (this.drib.phase >= 1 || !DRIBBLES.has(this.clip)))
      this.own(d, hash(this.who, 75 + this.drives++) < IN_OUT * this.inOutK ? 'inOut' : this.across2(SWITCH_DRIVE, 175 + this.drives));
    // (at the line: his routine, timed to end as the shot's own move begins)
    else if (d.ball && d.ft !== undefined && d.ft <= -span(CLIPS.ftRoutine)[0]) this.one = { id: 'ftRoutine', tau: -d.ft };
    // (about to pass: the wind-up, timed to end as the pass's own move begins)
    else if (winds && d.pass! <= -span(CLIPS[this.passId])[0]) this.one = { id: this.passId, tau: -d.pass! };
    else if (d.bump && !this.bumped) {
      this.one = { id: 'bump', tau: 0 };
      this.bumped = true;
    } else if (this.one) this.one.tau += dt > 0 ? dt : own;
    // (standing with it, he crosses it over now and then)
    else if (!T?.again && d.act === 'dribble' && d.ball && sp < 7 && !this.across && (this.crossIn -= dt) <= 0 && this.drib.phase >= 1) {
      // (or a hesitation: up out of it and back down)
      // (never across into a man who is on him)
      // (pressed, one that keeps it where it is: a hesitation, an in-and-out or a snatch back, whichever is his turn;
      // with room, any of his moves)
      const r = hash(this.who, 60 + this.standN);
      this.own(
        d,
        this.pressed > 0.5 || r < STAND_SAME ? MOVES_SAME[Math.floor(hash(this.who, 160 + this.standN) * MOVES_SAME.length)] : this.across2(SWITCH_STILL, 260 + this.standN),
      );
      this.crossIn = CROSS_EVERY * this.crossK * (0.5 + hash(this.who, this.standN++));
    }
    this.tWas = t;
    // knocked over, as soon as he's on the floor and free
    if (this.knocked && d.waits) this.knocked = false;
    if (this.knocked && (!this.one || this.one.id === 'stop' || this.one.id === 'closeout') && P[I.air] < 0.3 && !d.ball) {
      this.one = { id: 'stumble', tau: 0 };
      this.knocked = false;
    }
    // pulling up out of a run: the braking plant, as he comes down out of it, not once he has stopped (a defender's ends
    // down in his stance)
    // (waiting for a referee to hand it to him: stood ready for it, not at his ease with his hands on his knees)
    // (the way his legs go, his hips opened ahead of him or not: see LEAD_FROM)
    const [cl, sl] = [Math.cos(this.hipLead), Math.sin(this.hipLead)];
    const plain = d.waits && sp < 2.5 && !ONE[d.act] ? 'spot' : baseClip(d.act, d.ball, sp, vf * cl - vs * sl, vs * cl + vf * sl);
    if (sp > 5) [this.wayX, this.wayZ] = [(this.lvx * 1000) / sp, (this.lvz * 1000) / sp];
    if (!this.one && !d.ball && !d.over && sp < STOP_AT && this.spLag > 8 && CLIPS[this.clip].kind === 'gait') {
      this.one = { id: plain === 'ready' || plain === 'stance' ? 'closeout' : 'stop', tau: 0 };
      this.brakes();
    } else if (this.one && (this.one.id === 'stop' || this.one.id === 'closeout') && sp > 6) this.one = null;
    // from standing into a run: his first steps are a push-off (he drops, leans into it and drives his arms; see manner).
    // (a man who only walks off doesn't: it is for setting off at a run)
    this.pushT += own;
    if (this.pushT > PUSH_MS && !this.one && !d.ball && !d.over && sp > START_AT && this.spLag < START_AT / 2 && vf > 0.75 * sp && FORWARD.has(plain) && plain !== 'walk')
      this.pushT = 0;
    // (a man who caught it and is already going doesn't carry it on his hip first)
    if (this.one?.id === 'catch' && this.one.tau > CATCH_HELD && sp > CATCH_GO) this.one = null;
    // (a defender coming to a man out of a run breaks his steps down before he gets there)
    const closing = (d.act === 'defend' || d.act === 'guard' || d.act === 'contest') && !this.one && sp > 3 && sp < 15 && sp < this.spLag - 1.2;
    this.chop += ((closing ? 1 : 0) - this.chop) * (1 - Math.exp(-own / (closing ? 70 : 160)));
    if (this.one && (this.one.id === 'jumper' || this.one.id === 'freeThrow')) this.shot = this.one.id;
    else if (d.act !== 'release') this.shot = null;
    if (this.one && this.one.tau > span(CLIPS[this.one.id])[1]) {
      // (a crossover leaves the ball in his other hand)
      if (SWITCHES.has(this.one.id)) this.lefty = !this.lefty;
      this.one = null;
    }
    if (!d.ball && !this.one) this.lefty = false;
    // (the hand it is in, each time that changes, kept with the possession: see Tape)
    if (T && !T.again && (this.lefty !== this.handWas || T.takes !== this.tapeWas)) {
      const key = `${this.who}:hands`;
      const l = (T.takes.get(key) as { t: number; lefty: boolean }[] | undefined) ?? [];
      if (!l.length) T.takes.set(key, l);
      l.push({ t, lefty: this.lefty });
    }
    this.handWas = this.lefty;
    this.tapeWas = T?.takes;
    const acting = this.one && this.one.tau >= span(CLIPS[this.one.id])[0] ? this.one : null;

    let id = acting ? acting.id : plain;
    // (the same move begun again, or picked up somewhere else in itself: a crossover straight after a crossover began
    // at its first frame with the ball two feet from where the last one's end had it, the other hand's mirror image
    // besides. It is a new pose to ease into, as much as another clip's would be)
    const tauNow = acting ? acting.tau : NaN;
    const again =
      !!acting && id === this.clip && !cut && (this.mirrored !== (this.lefty && HANDED.has(id)) || Math.abs(tauNow - (this.tauWas + (dt > 0 ? dt : own))) > TAU_JUMP + own);
    this.tauWas = tauNow;
    this.mirrored = this.lefty && HANDED.has(id);
    if (id === 'idle') id = this.stand(d, own);
    // (the buzzer: each man takes it his own way)
    else if (id === 'celebrate' && d.over) id = hash(this.who, 7) < 0.5 ? 'celebrate' : 'cheer';
    else if (id === 'rue' && d.over) id = (['rue', 'slump', 'hips'] as const)[Math.floor(hash(this.who, 11) * 3)];
    if (d.over && d.party && !acting) id = d.party;
    // (a gait isn't swapped for another on a flicker of speed)
    this.dwell += own;
    if (!acting && id !== this.clip && CLIPS[this.clip].kind !== 'shot' && this.dwell < 140) id = this.clip;
    if (id !== this.clip && FORWARD.has(id) && FORWARD.has(this.clip)) {
      // (a walk into a jog into a run is one stride blended by his speed: nothing to ease between)
      this.clip = id;
      this.dwell = 0;
    } else if (id !== this.clip || again) {
      this.fresh = true;
      this.blend = 0;
      if (DRIBBLES.has(id)) this.rephase(id);
      const rest = STANDING.has(id) && (STANDING.has(this.clip) || id === 'knees' || id === 'hips');
      // (into and out of a run takes a stride, not a snap)
      const gait = CLIPS[id].kind === 'gait' || CLIPS[this.clip].kind === 'gait';
      this.clip = id;
      this.dwell = 0;
      this.slow = id === 'celebrate' || id === 'rue' || id === 'cheer' || id === 'slump' || id === d.party;
      this.blendMs = this.slow ? BLEND_SLOW : (rest ? BLEND_REST : gait && !acting ? BLEND_GAIT : BLEND_MS) * this.blendK;
      this.into = !!acting;
    }
    // (put somewhere new, he is in his new pose: nothing of the old one is eased out of)
    if (cut) {
      this.blend = 1;
      this.fresh = false;
    }
    const c = CLIPS[id];
    // (each man's stance ticks over at his own rate: ten of them never breathe as one)
    this.loopT += own * this.beat;
    this.spLag += (sp - this.spLag) * (1 - Math.exp(-own / 160));
    // (the stride he is shown in comes round to his speed on his pose time: what he does by how fast he was going, a
    // braking step, a push-off, goes by his own, as it did)
    this.spPose = jumped ? sp : this.spPose + (sp - this.spPose) * (1 - Math.exp(-soft / 160));
    if (FORWARD.has(id)) this.stride(this.spPose, this.want);
    else sample(c, c.kind === 'shot' ? acting!.tau : c.kind === 'gait' ? this.phase : this.loopT / c.dur, this.want);
    // (a jump shot is taken in his own rhythm: see rhythm)
    if (id === 'jumper' && acting) this.rhythm(c, acting.tau);
    else this.legLead = 0;
    if ((this.lefty && HANDED.has(id)) || (this.south && id === 'layup')) mirror(this.want);
    // (a slide is one clip, going left: going right it's flipped, eased over so he doesn't snap)
    // (into a slide or out of one, the new pose is the one blended to: a flip fading under some other clip would swing its arms across him)
    const flipTo = id === 'shuffle' && vs > 0 ? 1 : 0;
    if (this.fresh) this.flip = flipTo;
    else this.flip += (flipTo - this.flip) * (1 - Math.exp(-soft / 110));
    if (this.flip > 0.01) {
      FLIP.set(this.want);
      mirror(FLIP);
      for (let i = 0; i < N; i++) this.want[i] += (FLIP[i] - this.want[i]) * this.flip;
    }
    // (a dunk's jump, as high as his arms need)
    if (isDunk(id) && this.want[I.hip] > 0) this.want[I.hip] *= this.rise;
    // what is laid over the clip: his own carriage, what makes a shot his, the ball kept from the man on him, the ride
    // of his dribble, a landing's give, a held follow-through, a gesture, his breath and his hands
    P.set(this.want);
    this.manner(id);
    this.sign(id);
    this.shoot(id);
    this.crouch(id);
    this.shield(d, id, own);
    this.protect(id);
    this.ride(id);
    this.land(own);
    this.follow(d, own);
    this.gesture(d, own);
    this.life(d, id, sp, vf, own);
    this.contact(d, id, own);
    this.footwork(d, id, own);
    // (all of that laid on the clip is followed, not set: a rule that switches moves him, it never pops him. See Lay. Into
    // a new clip it is taken as it is: what is laid on a clip is laid on that clip's own values, and the blend below
    // carries the whole of the pose he was in into the new one)
    if (this.fresh) this.lay.reset();
    this.lay.step(P, this.want, own / 1000, ease / 1000);
    // (how much of a low rebound's height his hands still have it at: see carry)
    const rb = this.one?.id === 'rebound' && this.takeK < 1 ? 1 - smooth(clamp(this.one.tau / REB_IN, 0, 1)) : 0;
    this.rebW = rb > 0 || cut ? rb : this.rebW * Math.exp(-own / REB_OUT);
    // (a new clip plays from its first frame as itself, with all that is laid on it: what he carries over from the
    // last is how far the pose he was in was from this one, laid on it and dying away. Nothing waits on a frozen
    // pose, and nothing pops: not the clip, nor what is laid on one clip and not the next, a stride's arms, a
    // stance's busy hands)
    const B = this.base;
    if (this.fresh) {
      for (let i = 0; i < N; i++) this.off[i] = B[i] - P[i];
      // (an elbow's swing round its arm is an angle: it goes the short way round)
      this.off[I.lsw] = wrap(this.off[I.lsw]);
      this.off[I.rsw] = wrap(this.off[I.rsw]);
      this.fresh = false;
      // (a hand that has far to go, into a stance or a stride, takes longer over it: an arm is swung round, not flung. Into a move it is as quick as the move)
      if (!this.into && !this.slow) {
        let far = 0;
        for (const c of ARM_AT) far = Math.max(far, Math.abs(this.off[c]));
        this.blendMs = Math.max(this.blendMs, Math.min(BLEND_FAR, BLEND_MS + (far - ARM_FAR) * BLEND_FT));
      }
      // (the ball taken up off a dribble over his head for a pass is lifted there over its wind-up, not snatched up)
      const low = Math.abs(this.off[I.by]) - BALL_FAR;
      if (this.into && id === 'passOver' && low > 0) this.blendMs = Math.max(this.blendMs, Math.min(BLEND_FAR, BLEND_MS + low * 2 * BLEND_FT));
      // (and up over his head to throw it in from out of bounds, once it is in his hands: lifted, both hands on it)
      if (id === 'inbound' && !this.into) this.blendMs = Math.max(this.blendMs, Math.min(LIFT_MS, BLEND_MS + Math.abs(this.off[I.by]) * LIFT_PER));
      // (getting up off the floor, or out of a crouch, takes a moment whatever he is going into: up from sitting into a catch is not a spring)
      const up = -this.off[I.hip] - HIP_FAR;
      if (up > 0 && !this.slow) this.blendMs = Math.max(this.blendMs, Math.min(BLEND_UP, BLEND_MS + up * BLEND_HIP));
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + (this.slow ? ease : soft) / this.blendMs);
      const w = smooth(this.blend);
      for (let i = 0; i < N; i++) P[i] += this.off[i] * (1 - w);
      // (a hand going from his side to over his head goes round in front of him: straight up it would pass
      // through his own shoulder, and the elbow would whip round it)
      const out = Math.sin(Math.PI * w) * ARC;
      P[I.lz] += out * clamp((Math.abs(this.off[I.ly]) - ARC_FROM) / ARC_FROM, 0, 1);
      P[I.rz] += out * clamp((Math.abs(this.off[I.ry]) - ARC_FROM) / ARC_FROM, 0, 1);
    }
    B.set(P);
    this.held();
    // where he looks, on top of it all
    this.gaze(d, ease, sp);

    this.step(own, sp);
    this.weigh(own, sp);
    this.sinkFrom = jumped ? 0 : this.sink;
    this.solve(vf, vs, own);
    this.trails(own);
    this.easeMs = ease;
    this.settleBall();
  }

  /** The bounce he's dribbling, or null when he isn't (see Dribble). Read after `update`. */
  get dribble(): Dribble | null {
    const id = this.clip;
    if (!this.has || !(DRIBBLES.has(id) || isMove(id))) return null;
    const c = CLIPS[id];
    const loop = c.kind !== 'shot';
    const all = bounces(c);
    if (!all.length || (!loop && !this.one)) return null;
    const t = loop ? this.loopT / c.dur - Math.floor(this.loopT / c.dur) : this.one!.tau;
    // (the one he's in, else the next to come: round to the loop's first, or a one-off's last, done)
    let n = 0;
    while (n < all.length && t > all[n].on) n++;
    const b = n < all.length ? all[n] : loop ? all[0] : all[all.length - 1];
    const out = this.drib;
    const flying = t >= b.off && t <= b.on;
    out.phase = flying ? clamp((t - b.off) / (b.on - b.off || 1), 0, 1) : 1;
    // (how far through his hand's time on it: from the bounce before coming up into it to this one leaving it)
    const wrapped = n >= all.length && loop;
    const off = wrapped ? b.off + 1 : b.off;
    const prev = n > 0 ? all[n - 1].on : loop ? all[all.length - 1].on - 1 : b.off - (b.on - b.off);
    out.touch = flying ? 1 : clamp((t - prev) / (off - prev || 1), 0, 1);
    out.period = (b.on - b.off) * (loop ? c.dur / this.beat : this.pace);
    const mine = this.lefty ? 1 : -1;
    out.hand = (b.cross && t > b.on ? -mine : mine) as 1 | -1;
    out.to = (b.cross ? -mine : mine) as 1 | -1;
    const { s } = this.body;
    const flip = this.lefty && HANDED.has(id) ? -1 : 1;
    sample(c, b.off, MIX);
    this.world(-MIX[I.bx] * flip * s, (MIX[I.by] + Math.max(0, MIX[I.hip])) * s + PALM, MIX[I.bz] * s, out.push);
    sample(c, b.low, MIX);
    const f = this.world(-MIX[I.bx] * flip * s, 0, MIX[I.bz] * s, TMP);
    out.floor.x = f.x;
    out.floor.z = f.z;
    // (the hands at either end of it, as the clip has them moving: see bounce)
    const ends = bounceEnds(c, b);
    out.catchY = ends[0] * s;
    out.catchV = ends[1] * s;
    out.pushV = ends[2] * s;
    return out;
  }

  /**
   * A dribbled ball between the hand and the hand: `at` is where the clip has it (see `carry`), and here it goes
   * down as it was pushed (faster and faster), comes off the floor and slows as it rises back to the palm, so it
   * is the floor it bounces on and not a line it is drawn along. Written into `at`.
   */
  bounced(at: V3): V3 {
    const d = this.dribble;
    const one = this.one;
    const gathering = !d && one?.id === 'catch' && one.tau < -GATHER_LATE && this.has;
    if (!gathering) this.gatherMs = 0;
    else {
      // (his own dribble gathered: his hands come off it to take it, and it goes down once in front of him and comes
      // up into them as they close on it, from where it was as he began; with no time for that, it stays as it is)
      const left = -one.tau - GATHER_LATE;
      if (this.gatherMs === 0) {
        this.gatherMs = left >= GATHER_LEAST ? left : -1;
        this.gatherY = at.y;
      }
      if (this.gatherMs > 0) {
        const u = clamp(1 - left / this.gatherMs, 0, 1);
        const y = this.bounce(u, this.gatherY, at.y, 0, 0);
        at.y = y + (at.y - y) * smooth(clamp((u - BOUNCE_ON) / (1 - BOUNCE_ON), 0, 1));
        this.heldY = at.y;
        // (it comes up into his hands by its own bounce: the dribble he picked it up off is done with, and isn't
        // picked up again from the floor once it is in them)
        this.pickY = -1;
        return this.keepOut(at);
      }
    }
    if (!d || d.phase >= 1) {
      // (a dribble picked up while the ball was down by the floor: it comes on up into his hands as a bounce comes up,
      // it isn't snatched up to them in a frame)
      if (this.pickY >= 0) {
        this.pickMs += this.ownMs;
        const u = clamp(this.pickMs / PICK_MS, 0, 1);
        if (u >= 1 || at.y <= this.pickY) this.pickY = -1;
        else {
          at.y = this.pickY + (at.y - this.pickY) * (1 - (1 - u) * (1 - u));
          this.keepOut(at);
        }
      }
      this.heldY = at.y;
      return at;
    }
    // (from where the palm let it go, as fast as it was pushed, up into the hand that takes it as that hand is going;
    // and onto where his move has it, which is all but there by then, over its last tenth)
    const u = d.phase;
    // (no lower than the hand that takes it can go for it)
    const y = this.bounce(u, this.heldY, Math.max(d.catchY, this.reachLow, BALL_R + 0.6), d.catchV, d.pushV);
    at.y = y + (at.y - y) * smooth(clamp((u - BOUNCE_ON) / (1 - BOUNCE_ON), 0, 1));
    this.pickY = u < 0.8 ? at.y : -1;
    this.pickMs = 0;
    return at;
  }

  /**
   * The ball he has (`at`, the scene's, moved in place) kept out of his own legs: one rule, whatever he is doing with it
   * (in his hand or off it, a dribble, a crossover, a ball brought down to pass), once a frame, last of all: after it
   * has given way to the men round him (the scene's), which is what pushes it back into his own knee.
   *
   * Where it is is where his move has it and what it has been moved off his legs, which is kept from frame to frame and
   * let go of as they leave it room. A thigh or a shin come into where it *is* pushes it out the way it already is
   * from that leg, as fast as a hand moves a ball and no faster. Put back where its move has it each frame and pushed out from there, it went
   * to a swinging leg's front one frame and its back the next; and with one rule for a crossover and another for a
   * dribble (as it was), what the one had moved it was thrown away the frame the other took over: a foot, in a frame,
   * with the hand on it.
   */
  legsOff(at: V3): V3 {
    const { s } = this.body;
    const O = this.legOff;
    const k = Math.exp(-this.ownMs / LEG_LET_MS);
    O.x *= k;
    O.z *= k;
    const [lx, lz] = this.local(at.x, at.z);
    OWN.x = lx + O.x;
    OWN.y = at.y;
    OWN.z = lz + O.z;
    const [qx, qz] = [OWN.x, OWN.z];
    if (this.legsOut()) {
      let [mx, mz] = [OWN.x - qx, OWN.z - qz];
      const far = Math.hypot(mx, mz);
      const most = Math.max(LEG_PUSH_LEAST, (LEG_PUSH * this.ownMs) / 1000) * s;
      if (far > most) [mx, mz] = [(mx * most) / far, (mz * most) / far];
      O.x += mx;
      O.z += mz;
    }
    return this.world(lx + O.x, at.y, lz + O.z, at);
  }
  /** OWN (a ball's middle, his frame) moved out of his thighs and his shins as they are, along the floor; says whether it moved. */
  private legsOut(): boolean {
    const { s, bulk } = this.body;
    const j = this.j;
    if (OWN.y >= j[J.jl * 3 + 1] + BALL_R) return false;
    let moved = false;
    for (const [hip, knee, ankle] of LEGS) {
      SA.x = j[hip * 3];
      SA.y = j[hip * 3 + 1];
      SA.z = j[hip * 3 + 2];
      SB.x = j[knee * 3];
      SB.y = j[knee * 3 + 1];
      SB.z = j[knee * 3 + 2];
      moved = clearOf(OWN, SA, SB, LEG_THIGH * s * Math.sqrt(bulk) + BALL_R) || moved;
      SA.x = j[ankle * 3];
      SA.y = j[ankle * 3 + 1];
      SA.z = j[ankle * 3 + 2];
      moved = clearOf(OWN, SB, SA, LEG_SHIN * s + BALL_R) || moved;
    }
    return moved;
  }
  /** How far the ball he has has been moved off his own legs (his frame, x and z: see legsOff). */
  private readonly legOff = { x: 0, z: 0 };

  /**
   * A bounce `u` of the way through (0..1): from `from` (ft up, where the hand let it go) down to the floor, pushed
   * (`pushV`: how fast it left the hand, ft over the bounce's whole time, down), and back up to `to`, where the hand
   * that takes it has it, going up as that hand is (`catchV`, the same units).
   *
   * One curve each way, with no corner in it but the floor: down it gathers speed from the push it was given; up it
   * loses the speed it came off the floor with, and has just the hand's own left as it gets there. So it comes into a
   * palm that is going its way at its speed: it is not stopped short of the hand and then run up to it (which is a
   * foot in a frame at the top of every bounce), and the hand has nothing to snap to.
   */
  private bounce(u: number, from: number, to: number, catchV: number, pushV: number): number {
    const top = Math.max(from, BALL_R + 0.6);
    const down = BOUNCE_DOWN;
    if (u < down) {
      // (from the hand: as fast as it was pushed, and faster as it falls; never slower as it goes)
      const D = top - BALL_R;
      const k = clamp((-pushV * down) / D, 0, 1);
      const t = u / down;
      return top - D * (k * t + (1 - k) * t * t);
    }
    // (off the floor: quickest there, down to the hand's own speed as it gets to it)
    const H = Math.max(0.3, to - BALL_R);
    const m = clamp(catchV * (1 - down), 0, H);
    const t = (u - down) / (1 - down);
    return BALL_R + (2 * H - m) * t + (m - H) * t * t;
  }

  /**
   * The ball he has (the scene's point, moved in place) kept out of his own body: his head, his trunk and his legs
   * as spacing.ts shapes them. Over his head it goes round in front of his face, low it goes round his knees; his
   * arms are what carry it, so they are left out.
   */
  keepOut(at: V3): V3 {
    const [lx, lz] = this.local(at.x, at.z);
    OWN.x = lx;
    OWN.y = at.y;
    OWN.z = lz;
    return this.ownOut() ? this.world(OWN.x, Math.max(BALL_R, OWN.y), OWN.z, at) : at;
  }
  /** OWN (a ball's middle, his frame) moved out of his own body (see keepOut); says whether it moved. */
  private ownOut(): boolean {
    const { s, bulk } = this.body;
    const j = this.j;
    let moved = false;
    // (not his arms, which carry it; nor his legs, which have one rule of their own for whatever he is doing with it: see
    // legsOff)
    for (const [p, q, r, limb] of SHAPES) {
      if (limb) continue;
      const need = r * s * Math.sqrt(bulk) + BALL_R;
      if (p === q) {
        // (his head: straight out from it, the way the ball already is from it)
        const dx = OWN.x - j[p * 3];
        const dy = OWN.y - j[p * 3 + 1];
        const dz = OWN.z - j[p * 3 + 2];
        const far = Math.hypot(dx, dy, dz);
        if (far >= need) continue;
        const [ux, uy, uz] = far > 1e-3 ? [dx / far, dy / far, dz / far] : [0, 0, 1];
        OWN.x = j[p * 3] + ux * need;
        OWN.y = j[p * 3 + 1] + uy * need;
        OWN.z = j[p * 3 + 2] + uz * need;
        moved = true;
        continue;
      }
      SA.x = j[p * 3];
      SA.y = j[p * 3 + 1];
      SA.z = j[p * 3 + 2];
      SB.x = j[q * 3];
      SB.y = j[q * 3 + 1];
      SB.z = j[q * 3 + 2];
      moved = clearOf(OWN, SA, SB, need) || moved;
    }
    // (and his shoulders, from one to the other: a ball handed to him as he ran by came down through the point of his
    // shoulder to get in front of him, his arm folded shut round it)
    this.collar();
    moved = clearOf(OWN, SA, SB, COLLAR_R * s * Math.sqrt(bulk) + BALL_R) || moved;
    return moved;
  }
  /** The line of his shoulders, into SA and SB (his frame). */
  private collar() {
    const j = this.j;
    SA.x = j[J.sl * 3];
    SA.y = j[J.sl * 3 + 1];
    SA.z = j[J.sl * 3 + 2];
    SB.x = j[J.sr * 3];
    SB.y = j[J.sr * 3 + 1];
    SB.z = j[J.sr * 3 + 2];
  }
  /**
   * Where his hands have the ball as they are drawn (read after `arms`, which may not have got them all the way to
   * it: a hand still on its way, an arm that can't reach): each wrist less the way that hand lies on the ball, so the
   * ball's middle as that hand holds it, the surer hand counting the more. Written into `out` (in the scene); says
   * how far the surer hand has hold of it (0: neither has, a dribble in the air, hands on the rim: `out` untouched).
   */
  holds(out: V3): number {
    if (this.onRim) return 0;
    const P = this.pose;
    const j = this.j;
    const dr = CLIPS[this.clip].grip === 'top' ? this.dribble : null;
    if (dr && dr.phase < 1) return 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let sum = 0;
    let most = 0;
    for (const side of SIDES) {
      // (a hand still on its way to taking hold of it holds it only as far as it has got there: see TAKE_FAR)
      const there = 1 - smooth(clamp(this.handOff[side > 0 ? 0 : 1] / (TAKE_FAR * this.body.s), 0, 1));
      const g = dr && dr.hand === side ? 1 : clamp(P[side > 0 ? I.gl : I.gr], 0, 1) * there;
      if (g <= 0.02) continue;
      const h = (side > 0 ? J.hl : J.hr) * 3;
      const go = side > 0 ? 0 : 3;
      x += (j[h] - this.grips[go]) * g * g;
      y += (j[h + 1] - this.grips[go + 1]) * g * g;
      z += (j[h + 2] - this.grips[go + 2]) * g * g;
      sum += g * g;
      most = Math.max(most, g);
    }
    if (!sum) return 0;
    [x, y, z] = [x / sum, y / sum, z / sum];
    // (and off his forearms: a hand over it or under it lies on it, its arm doesn't go through it)
    const r = FOREARM * this.body.s + BALL_R - FORE_ON;
    for (const side of [1, -1] as const) {
      const e = (side > 0 ? J.el : J.er) * 3;
      const h = (side > 0 ? J.hl : J.hr) * 3;
      const ux = j[h] - j[e];
      const uy = j[h + 1] - j[e + 1];
      const uz = j[h + 2] - j[e + 2];
      const t = clamp(((x - j[e]) * ux + (y - j[e + 1]) * uy + (z - j[e + 2]) * uz) / (ux * ux + uy * uy + uz * uz || 1), 0, 1);
      const dx = x - (j[e] + ux * t);
      const dy = y - (j[e + 1] + uy * t);
      const dz = z - (j[e + 2] + uz * t);
      const far = Math.hypot(dx, dy, dz);
      if (far >= r || far < 1e-4) continue;
      const k = Math.min(r - far, FORE_MOST) / far;
      x += dx * k;
      y += dy * k;
      z += dz * k;
    }
    this.world(x, y, z, out);
    return most;
  }

  /**
   * A hand-off he is taking: his hands go onto the ball (where `arms` is given it) this far (0..1), this frame only,
   * and hold it that far (see holds), whatever his clip's own grip.
   */
  taking(w: number) {
    this.takeW = clamp(w, 0, 1);
  }
  private takeW = 0;
  /** ...as his hands have been sent so far: they are sent no quicker than over TAKE_MS, whenever he is first told of it. */
  private takeE = 0;
  /** The lowest the hand a dribble is coming back to can have it (ft up: see ballWant). */
  private reachLow = 0;
  /** Where he holds out a hand-off he is giving (the scene's point), and how far he has it there (0..1): see Drive.swap. */
  private readonly offerAt: V3 = { x: 0, y: 0, z: 0 };
  private offerW = 0;
  /**
   * A ball taken out of another man's hands is his from where it is (`at`, the scene's): his own ball (see settleBall) goes
   * on from there, and comes on to where his move has it like anything else it follows.
   */
  seize(at: V3) {
    const [lx, lz] = this.local(at.x, at.z);
    this.ballF.put(lx, at.y, lz);
    this.ballAt.x = lx;
    this.ballAt.y = at.y;
    this.ballAt.z = lz;
  }
  /** How far he is off the plan's spot for having gone straight on through the air (x, z, and how fast that changes, ft a second); the plan's spot last frame; how fast the plan has him going, eased, and how fast he went last frame (ft a ms). */
  private room = Infinity;
  private flx = 0;
  private flz = 0;
  private flvx = 0;
  private flvz = 0;
  private planX = 0;
  private planZ = 0;
  private lvx = 0;
  private lvz = 0;
  private rvx = 0;
  private rvz = 0;
  /** How far he is down for a low pass (ft lower his hands are out for it, eased: see CATCH_SIT). */
  private lowE = 0;
  /**
   * A hand-off he is giving (this frame only): his hands hold it this far (1 until it is taken, then let go of: see
   * Exchange.grip), on it wherever it is drawn, in the other man's hands too.
   */
  giving(k: number, held = true) {
    this.giveK = clamp(k, 0, 1);
    this.giveHeld = held;
  }
  private giveK = -1;
  /** ...and it is still his: taken out of his hands, they open where they are and don't go after it. */
  private giveHeld = true;

  /**
   * The ball where his hands have it (`at`, the scene's, moved in place) out of his own body (see keepOut), from where it
   * is: what is left of it in him once his ball and his hands have followed (a pass wound up quicker than they come round),
   * a little each frame and never to his far side, since it was by him, not through him. The hands on it go with it, their
   * arms solved again, so it isn't seen off his palms.
   */
  clearHeld(at: V3) {
    const { s } = this.body;
    const [lx, lz] = this.local(at.x, at.z);
    OWN.x = lx;
    OWN.y = at.y;
    OWN.z = lz;
    // (his trunk, and his legs as they are: his hands have brought it where they are, and they go with it out of him)
    const out = this.ownOut();
    if (!this.legsOut() && !out) return;
    let [dx, dy, dz] = [OWN.x - lx, OWN.y - at.y, OWN.z - lz];
    const far = Math.hypot(dx, dy, dz);
    const most = Math.max(PULL_LEAST, (HELD_OUT * this.ownMs) / 1000) * s;
    if (far > most) [dx, dy, dz] = [(dx * most) / far, (dy * most) / far, (dz * most) / far];
    this.world(lx + dx, Math.max(BALL_R, at.y + dy), lz + dz, at);
    const P = this.pose;
    const j = this.j;
    const E = this.elbows;
    for (const side of SIDES) {
      const w = smooth(clamp((P[side > 0 ? I.gl : I.gr] - 0.3) / 0.4, 0, 1));
      if (w <= 0) continue;
      const go = side > 0 ? 0 : 3;
      const ha = (side > 0 ? J.hl : J.hr) * 3;
      j[ha] += dx * w;
      j[ha + 1] = Math.max(0.2 * s, j[ha + 1] + dy * w);
      j[ha + 2] += dz * w;
      reach(j, side > 0 ? J.sl : J.sr, side > 0 ? J.el : J.er, ha / 3, UARM * s, FARM * s, E[go], E[go + 1], E[go + 2]);
    }
  }

  /** Where the scene has put the ball in his hands (`holds`), ft up: a dribble's next push goes down from there. */
  heldAt(y: number) {
    this.heldY = y;
  }

  /**
   * A ball he has just caught out of the air, going `v` (ft a second, the scene's): a fast one is given with, his
   * hands and the ball in them going on the way it came, toward his chest (mostly along the floor), and back (see carry).
   */
  caught(v: V3) {
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < GIVE_FROM) return;
    const [lx, lz] = this.local(this.x + v.x, this.z + v.z);
    const ly = v.y * 0.6;
    const far = Math.hypot(lx, ly, lz) || 1;
    const k = (Math.min(GIVE_MOST, GIVE_PER * speed) * this.body.s) / far;
    this.catchD.x = lx * k;
    this.catchD.y = ly * k;
    this.catchD.z = lz * k;
    this.catchT = 0;
  }

  /** A rebound coming to him: how high he takes it, 0 (at his chest, no jump for it) to 1 (at the top of his jump, both arms up). */
  rebound(high: number) {
    this.takeK = clamp(high, 0, 1);
  }

  /**
   * Into a dribble from another, or from a move that ended with the ball in his hand: the new one is picked up
   * where the ball is (as far through its bounce, or just caught), so it never jumps between his hand and the air.
   */
  private rephase(id: ClipId) {
    const to = CLIPS[id];
    const b = bounces(to)[0];
    if (!b) return;
    const u = DRIBBLES.has(this.clip) ? this.drib.phase : 1;
    this.loopT = (u < 1 ? b.off + (b.on - b.off) * u : b.on + 0.01) * to.dur;
  }

  /** His own way over his dribble and in his stance (see style): laid on the clip's, which is every man's. */
  private sign(id: ClipId) {
    const P = this.pose;
    const ground = 1 - clamp(P[I.air], 0, 1);
    if (DRIBBLES.has(id)) {
      // (how low and how far forward he sits over it; his off arm up between him and the man, or down by him)
      P[I.hip] -= this.dribLow * ground;
      P[I.lean] += this.dribLean * ground;
      // (his off arm: see arms, which knows which hand the ball is in as they are solved)
    } else if (id === 'stance' || id === 'ready' || id === 'shuffle' || id === 'closeout') {
      // (his stance: wider or narrower, deeper or taller; his hands up and busy or low)
      P[I.wide] += this.standW * ground;
      P[I.hip] -= this.standLow * ground;
      if (id !== 'ready') {
        if (P[I.gl] <= 0.5) P[I.ly] += this.handsUp * 0.5;
        if (P[I.gr] <= 0.5) P[I.ry] += this.handsUp * 0.5;
      }
    }
  }

  /** How long his follow-through is held, against everyone's (see figure.ts FLICK_HOLD): his own, the same every night. */
  get followHold(): number {
    return this.followK;
  }

  /** His body rides his dribble: the shoulder over the ball dips as he pushes it down and comes up with it, his hips give a little each bounce. */
  private ride(id: ClipId) {
    if (!DRIBBLES.has(id)) return;
    const d = this.dribble;
    if (!d) return;
    const P = this.pose;
    // (down with the push, back up as it rises: once a bounce)
    const w = d.phase < 1 ? Math.sin(Math.PI * Math.pow(d.phase, 0.7)) : 0;
    P[I.tilt] += d.hand * RIDE_TILT * w;
    P[I.hip] -= RIDE_HIP * w;
    P[I.lean] += 0.025 * w;
    // (pushing it up the floor at a run, his hips ride over his feet as a runner's do: the take he dribbles in is a
    // walk's, and its hips are level)
    if (id === 'dribbleRun' && clamp((this.ownMs - BOB_FROM_MS) / (BOB_FAST_MS - BOB_FROM_MS), 0, 1) < STRIDE_UNTIL)
      P[I.hip] += (this.rides(1) - hipsMean(this.gait)) * clamp((this.spLag - 7) / 6, 0, 1);
  }

  /** What makes a shot his own (see `fade`, `kick`, `euro`): laid on the clip around its release. */
  /** Down for a low pass coming to him (see CATCH_SIT), whatever else he is in. */
  private crouch(id: ClipId) {
    const P = this.pose;
    // (a low pass: down to it with his knees, his hands out in front of his belt, not reached down for at his hip; and
    // up out of it as his hands bring it in, see carry. Eased both ways: his hands are told where it comes a frame after
    // his catch begins, and he was sat half a foot lower in that one frame; let go the frame it got to him, he came up as fast)
    const low = id === 'catch' && this.metT < CATCH_IN && this.met.y < 0 ? (-this.met.y / this.body.s) * (1 - smooth(this.metT / CATCH_IN)) : 0;
    this.lowE += (low - this.lowE) * (1 - Math.exp(-this.ownMs / CATCH_SIT_MS));
    if (this.lowE > 0.003) {
      P[I.hip] -= CATCH_SIT * this.lowE;
      P[I.lean] += CATCH_LEAN * this.lowE;
    }
  }
  /**
   * A jump shot's rhythm, his own (see SHOT_FORMS): one clip is every man's jumper, and laid on it only where the ball
   * and his chest are, every man's legs left the floor at the same moment before it left his hand, and every man's arm
   * came down at the same moment after. So the clip is read at two times, his legs' and his arms': a set shooter's legs
   * are ahead of his arms (he is at the top of his jump as it goes), a one-motion shooter's behind (it goes on his way
   * up), a pusher's hop is short and late; his arms get to the set point early and wait, or late and go straight
   * through; and after it they stay up or come down in their own time. All of it nothing by the clip's ends.
   */
  private rhythm(c: (typeof CLIPS)[ClipId], tau: number) {
    const F = SHOT_FORMS[this.form];
    const W = this.want;
    // (his arms: off the clip's time between his dip and the release, on it at both; and again after it)
    const mid = Math.sin(Math.PI * clamp((tau + RHYTHM_LEAD) / RHYTHM_LEAD, 0, 1));
    const after = smooth(clamp(tau / 120, 0, 1)) * (1 - smooth(clamp((tau - 330) / 200, 0, 1)));
    const arm = F.arm * mid + F.after * after;
    // (his legs: off it from his dip to his landing)
    const on = smooth(clamp((tau + 350) / 110, 0, 1)) * (1 - smooth(clamp((tau - 400) / 150, 0, 1)));
    const leg = F.leg * on;
    this.legLead = leg;
    if (arm !== 0) sample(c, tau + arm, W);
    if (leg !== 0) {
      sample(c, tau + leg, MIX);
      for (const i of LEG_CHANNELS) W[i] = MIX[i];
    }
    // (and how high it takes him)
    if (W[I.hip] > 0) W[I.hip] *= 1 + (F.jump - 1) * on;
  }
  /** How far ahead of his move's own time his legs are in a jump shot (ms: see rhythm). */
  private legLead = 0;

  private shoot(id: ClipId) {
    const one = this.one;
    if (!one) return;
    const P = this.pose;
    if (id === 'jumper' && (this.fade > 0 || this.kick > 0)) {
      // (from the dip to coming down)
      const e = smooth(clamp((one.tau + 150) / 170, 0, 1)) * (1 - smooth(clamp((one.tau - 260) / 220, 0, 1)));
      P[I.lean] -= FADE_LEAN * this.fade * e;
      P[I.surge] -= 0.22 * this.fade * e;
      P[I.flf] += FADE_FEET * this.fade * e;
      P[I.frf] += (FADE_FEET * this.fade + 0.55 * this.kick) * e;
      P[I.fru] += 0.12 * this.kick * e;
    }
    if (id === 'jumper' || id === 'freeThrow') {
      // (his own set point and pocket: the ball up and away from his face or low and in front, out over his shooting
      // shoulder or nearer his middle, from his dip to his release; his hands go with it)
      const e = smooth(clamp((one.tau + 260) / 200, 0, 1)) * (1 - smooth(clamp((one.tau - 40) / 160, 0, 1)));
      P[I.by] += this.setPt * e;
      P[I.bx] += this.pocket * e;
      // (his shooting elbow in under it or out; once it has gone, where his guide hand goes is his follow-through's: see held)
      P[I.rsw] += this.elbowSet * e;
      // (in the air: his knees drawn up a little, or his legs hanging long)
      const air = clamp(P[I.air], 0, 1);
      P[I.flu] += this.tuckK * air;
      P[I.fru] += this.tuckK * air;
      // (and the way he shoots it, his own from the dip to the release: a free throw a little of it)
      const k = id === 'freeThrow' ? 0.5 : 1;
      const tau = one.tau;
      const dip = smooth(clamp((tau + 330) / 110, 0, 1)) * (1 - smooth(clamp((tau + 140) / 110, 0, 1))) * k;
      const top = smooth(clamp((tau + 140) / 120, 0, 1)) * (1 - smooth(clamp((tau - 60) / 140, 0, 1))) * k;
      const up = e * k;
      if (this.form === 0) {
        // (two motions: the ball up to a set point high at his forehead and held there a beat, and away off the top of
        // his jump; a deep dip into it, his chest square)
        P[I.by] += 0.28 * up;
        P[I.bz] -= 0.05 * up;
        P[I.lean] -= 0.03 * up;
        P[I.hip] -= 0.05 * dip;
        P[I.twist] *= 1 - 0.5 * up;
      } else if (this.form === 1) {
        // (one motion: it never stops, up from low and out in front and away on the way up; a short dip, his chest a
        // little turned)
        P[I.by] -= 0.18 * up;
        P[I.bz] += 0.12 * up;
        P[I.hip] += 0.05 * dip;
        P[I.lean] += 0.04 * up;
        P[I.twist] += 0.08 * up;
      } else if (this.form === 2) {
        // (a high release: the ball let go well over his head, his head up and his chest back off it)
        P[I.by] += 0.42 * top;
        P[I.lean] -= 0.07 * top;
        P[I.nod] -= 0.06 * top;
      } else {
        // (a push from his chest: low and out in front, his legs doing the work and his chest over it)
        P[I.by] -= 0.3 * up;
        P[I.bz] += 0.25 * up;
        P[I.bx] -= 0.1 * up;
        P[I.hip] -= 0.08 * dip;
        P[I.lean] += 0.08 * up;
      }
      // (and how he comes down from it, from the release to his feet under him again: each form its own shape in the air)
      if (id === 'jumper') {
        const down = smooth(clamp(tau / 130, 0, 1)) * (1 - smooth(clamp((tau - 430) / 190, 0, 1)));
        const air2 = clamp(P[I.air], 0, 1);
        if (this.form === 0) {
          // (straight up and straight down: tall, his legs long under him, on the spot he left)
          P[I.lean] -= 0.02 * down;
          P[I.flu] -= 0.08 * down * air2;
          P[I.fru] -= 0.08 * down * air2;
        } else if (this.form === 1) {
          // (his feet swing through under him and his shoulders go back: he lands ahead of where he left)
          P[I.flf] += 0.38 * down;
          P[I.frf] += 0.3 * down;
          P[I.lean] -= 0.1 * down;
          P[I.surge] += 0.1 * down;
          P[I.nod] += 0.04 * down;
        } else if (this.form === 2) {
          // (back off it, his chest open and his head up after it, a foot trailing)
          P[I.lean] -= 0.07 * down;
          P[I.surge] -= 0.08 * down;
          P[I.nod] -= 0.05 * down;
          P[I.flf] += 0.14 * down * air2;
        } else {
          // (he goes after it: a step on the way it went, his chest over his front foot)
          P[I.frf] += 0.42 * down;
          P[I.flf] -= 0.12 * down;
          P[I.surge] += 0.14 * down;
          P[I.lean] += 0.07 * down;
          P[I.wide] += 0.06 * down;
        }
      }
    }
    if ((id === 'layup' || id === 'floater') && !this.reverse && !this.put) {
      // (his gather, over his last two steps: the ball ripped up toward his chin or carried low, out by his outside hip or
      // in at his middle, his knees bending into it as far as he sits into a gather)
      const e = smooth(clamp((one.tau + 460) / 160, 0, 1)) * (1 - smooth(clamp((one.tau + 120) / 140, 0, 1)));
      P[I.by] += this.gatherHi * e;
      P[I.bx] += this.gatherSide * (this.south ? -1 : 1) * e;
      P[I.hip] -= this.gatherLow * e * (1 - clamp(P[I.air], 0, 1));
    }
    if (id === 'jumper' && this.stepBack > 0) {
      // (leaning in ahead of his spot as if to go by, then a hop back onto it and up)
      const u = clamp((one.tau + 380) / 210, 0, 1);
      const e = (1 - smooth(u)) * this.stepBack;
      const hopped = Math.sin(Math.PI * u) * this.stepBack;
      P[I.surge] += STEP_BACK * e;
      P[I.lean] += 0.2 * e;
      P[I.hip] += 0.1 * hopped - 0.12 * e;
      P[I.air] = Math.max(P[I.air], 0.75 * hopped);
      P[I.flf] += 0.5 * hopped;
      P[I.frf] += 0.2 * hopped;
    } else if (id === 'layup' && this.reverse) {
      // (under the rim and up on its far side: his back to where he came from, the ball laid back over his head)
      const e = smooth(clamp((one.tau + 150) / 150, 0, 1)) * (1 - smooth(clamp((one.tau - 150) / 190, 0, 1)));
      const k = this.south ? -1 : 1;
      P[I.twist] += 0.85 * k * e;
      P[I.turn] -= 0.45 * k * e;
      P[I.lean] -= 0.2 * e;
      P[I.nod] += 0.25 * e;
      P[I.bz] -= 0.55 * e;
      P[I.bx] -= 0.3 * k * e;
    } else if (id === 'layup' && this.how === 'roll') {
      // (a finger roll: the ball carried up on his palm out in front of him, the arm reaching long and high for the rim,
      // and rolled off his fingers at the top of it; the arm stays out there after it, the palm up)
      const e = smooth(clamp((one.tau + 140) / 160, 0, 1)) * (1 - smooth(clamp((one.tau - 180) / 200, 0, 1)));
      const after = smooth(clamp(one.tau / 60, 0, 1));
      const [x, y, z] = this.south ? [I.lx, I.ly, I.lz] : [I.rx, I.ry, I.rz];
      P[I.bz] += ROLL_OUT * e;
      P[I.by] += ROLL_UP * e;
      P[z] += (ROLL_OUT + 0.25 * after) * e;
      P[y] += 0.12 * e;
      P[x] -= 0.08 * e;
      P[I.lean] += 0.1 * e;
      P[I.nod] -= 0.12 * e;
    } else if (id === 'layup' && this.euro) {
      // (a long step one way and the next the other, before he goes up: his last two, the second the one he leaves the
      // floor off, see step)
      const u = clamp((one.tau + 425) / 210, 0, 1);
      const w = Math.sin(Math.PI * 2 * u) * (1 - u * 0.4);
      P[I.sway] += 0.4 * this.euro * w;
      P[I.tilt] += 0.12 * this.euro * w;
      P[I.proll] -= 0.06 * this.euro * w;
    }
    if (id === 'rebound' && this.takeK < 1) {
      // (a rebound taken low: no jump for it, and his hands out for it, not over his head; part of that for one taken part way up)
      const low = 1 - this.takeK;
      P[I.hip] -= Math.max(0, P[I.hip]) * low;
      P[I.air] *= this.takeK;
      P[I.ly] -= Math.max(0, P[I.ly] - REB_HANDS) * low;
      P[I.ry] -= Math.max(0, P[I.ry] - REB_HANDS) * low;
    }
  }

  /**
   * Moved a little across the floor after `update` (a man he is leaning on was nearer than their bodies allow, or
   * had a leg in his): his feet go with him and his legs are solved again. After `update`; after `arms` too (his arms
   * go with him).
   */
  nudge(dx: number, dz: number) {
    this.x += dx;
    this.z += dz;
    this.nx += dx;
    this.nz += dz;
    // (a planted foot stays where it is on the floor: he is moved over it, and steps it back under him (see step);
    // in the air his feet go with him)
    if (this.pose[I.air] > 0.5)
      for (const f of this.feet) {
        f.x += dx;
        f.z += dz;
      }
    // (his head as it was: moved there off a man by `arms` if this comes after them; the same place otherwise)
    const h = J.head * 3;
    const [hx, hy, hz] = [this.j[h], this.j[h + 1], this.j[h + 2]];
    this.solve(this.vf, this.vs);
    [this.j[h], this.j[h + 1], this.j[h + 2]] = [hx, hy, hz];
  }

  /** How many of the bodies' ms the last frame took (what a thing eased on his own clock, his wrists, goes by). */
  get frameMs(): number {
    return this.ownMs;
  }

  /** A hanging dunk: his hands are on the ring (from the slam until he lets go). The rim's spring holds down while they are. */
  get onRim(): boolean {
    return this.clip === 'dunkHang' && this.hasAim && !!this.one && this.one.tau >= DUNK_AT && this.one.tau <= HANG_UNTIL;
  }

  /** Knocked off his feet (a foul): he staggers, goes down onto a hand and gets up, as soon as he's free to. */
  stumble() {
    this.knocked = true;
  }

  /** How long he has been going down or sat on the floor (the play's ms into his fall), or -1 when he's on his feet. */
  get floored(): number {
    return this.one?.id === 'stumble' ? this.one.tau : this.knocked ? 0 : -1;
  }

  /**
   * Knocked by another man's body (the scene's: a screen run into, a drive into a man set, two going for one spot):
   * `dx`, `dz` the way it pushes him (the scene's), `power` how hard (0..1). His trunk is thrown that way and comes
   * back (see JOLT_W); the ground he gives is the scene's to say.
   */
  hit(dx: number, dz: number, power: number, kind: Contact = 'bump') {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || power <= 0) return;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // (a hard one throws him farther than a soft one does by its power alone: he is off balance)
    const k = clamp(power, 0, 1);
    // (set for it, he gives less: a screener on his feet, a man sat down in a box-out)
    const set = (kind === 'screen' && this.clip === 'screen') || (kind === 'seal' && this.clip === 'boxout') ? BRACED : 1;
    const v = JOLT_V * k * (1 + JOLT_HARD * k) * set;
    const [hx, hz] = [(dx * c - dz * s) / d, (dx * s + dz * c) / d];
    this.jolt[2] += hx * v;
    this.jolt[3] += hz * v;
    // (and he meets it as that kind of meeting is met: see braced)
    // (a body into a body with neither set for it: the one stood still sits wider into it, and steps only to a hard one)
    const stood = kind === 'bump' && !this.has && this.spLag < STAND_SET && this.pose[I.air] < 0.3;
    this.met2 = { kind, hx, hz, k, t: 0, stood };
    // (set for it, his feet stay where they are and go wider under him as he sits into it (braced); the man who runs
    // into him, or is held off, gives ground with a step, sooner for it than for a plain bump: their feet answer each other)
    const holds = set < 1 || (kind === 'drive' && !this.has && this.spLag < STAND_SET);
    // (a hard one he takes a step to: the foot farthest the way it pushes him goes farther that way)
    if (holds || k < (kind === 'bump' ? CATCH_FROM : CATCH_MET) || this.pose[I.air] > 0.3 || this.catchK >= 0) return;
    const [ux, uz] = [dx / d, dz / d];
    const along = (f: Foot) => (f.x - this.x) * ux + (f.z - this.z) * uz;
    this.catchK = along(this.feet[1]) > along(this.feet[0]) ? 1 : 0;
    // (on the move, half as far: his stride already carries him on)
    const far = CATCH_FT * this.body.s * k * (1 - 0.5 * clamp(this.spLag / 16, 0, 1));
    [this.catchX, this.catchZ, this.catchMs] = [ux * far, uz * far, CATCH_MS];
  }

  /**
   * A knock's way through him (see hit), laid on the pose: his trunk goes with it and his head lags it, his hips go
   * with it and dip as his knees take it, a free arm goes out for his balance; then it all comes back, past a little.
   */
  private knock(own: number) {
    const J4 = this.jolt;
    if (J4.every((v) => Math.abs(v) < 3e-5)) return;
    // (a spring, a little under damped, in steps short enough to stay put)
    const w = JOLT_W;
    for (let left = own / 1000; left > 1e-6;) {
      const h = Math.min(left, 0.012);
      left -= h;
      for (const a of [0, 1]) {
        J4[a + 2] += (-w * w * J4[a] - 2 * JOLT_DAMP * w * J4[a + 2]) * h;
        J4[a] += J4[a + 2] * h;
      }
    }
    // (his head follows his trunk late, on a slower spring: it stays as the trunk goes, then comes after it, past a little)
    for (let left = own / 1000; left > 1e-6;) {
      const h = Math.min(left, 0.012);
      left -= h;
      for (const a of [0, 1]) {
        J4[a + 6] += (-HEAD_LATE_W * HEAD_LATE_W * (J4[a + 4] - J4[a]) - 2 * JOLT_DAMP * HEAD_LATE_W * J4[a + 6]) * h;
        J4[a + 4] += J4[a + 6] * h;
      }
    }
    const P = this.pose;
    const [jx, jz] = [J4[0], J4[1]];
    const far = Math.hypot(jx, jz);
    P[I.lean] += jz * 1.3;
    P[I.nod] += jz * 0.25 + (J4[5] - jz) * HEAD_LATE;
    P[I.surge] += jz * 0.7;
    P[I.tilt] += jx * 1.1;
    P[I.sway] += jx * 0.8;
    P[I.twist] += jx * 0.5;
    P[I.hip] -= far * 0.55;
    // (a free hand goes out and up a little, for his balance)
    for (const [g, x, y] of [
      [I.gl, I.lx, I.ly],
      [I.gr, I.rx, I.ry],
    ] as const) {
      if (P[g] > 0.5) continue;
      P[x] += far * 1.4;
      P[y] += far * 1.1;
    }
  }

  /**
   * How he meets a knock (see hit), by what kind of meeting it is and what he is doing in it, laid on the pose for a
   * moment: a screener braced, hands in to his chest, and the man run into it turning a shoulder in and fending with
   * the near arm; a driver's shoulder dipped into his man, and the man set in his way going straight up, arms up; a man
   * boxing out sat down and driving his seat back into the man behind him, and that man's hands into his back.
   */
  private braced(id: ClipId, own: number) {
    const m = this.met2;
    if (!m) return;
    m.t += own;
    if (m.t > MEET_SHOW) {
      this.met2 = null;
      return;
    }
    const P = this.pose;
    const e = smooth(clamp(m.t / 60, 0, 1)) * (1 - smooth(clamp((m.t - 140) / (MEET_SHOW - 140), 0, 1))) * clamp(0.5 + m.k, 0, 1.2);
    // (the other man is the way it pushed him from: behind the push)
    const [ox, oz] = [-m.hx, -m.hz];
    const near = ox >= 0 ? 1 : -1;
    const arm = (side: 1 | -1, x: number, y: number, z: number, w: number) => {
      const [g, cx, cy, cz] = side > 0 ? [I.gl, I.lx, I.ly, I.lz] : [I.gr, I.rx, I.ry, I.rz];
      if (P[g] > 0.5) return;
      P[cx] += (x - P[cx]) * w;
      P[cy] += (y - P[cy]) * w;
      P[cz] += (z - P[cz]) * w;
    };
    if (m.kind === 'screen' && id === 'screen') {
      // (he takes it on his chest, set: sat down a little, his feet wider, leaning back into the man a touch)
      P[I.hip] -= 0.1 * e;
      P[I.wide] += 0.14 * e;
      P[I.surge] += 0.08 * oz * e;
      P[I.sway] += 0.08 * ox * e;
      arm(1, -0.05, -1.05, 0.5, 0.8 * e);
      arm(-1, -0.05, -1.05, 0.5, 0.8 * e);
    } else if (m.kind === 'screen') {
      // (his shoulder turned into it to fight over the top, the near forearm up between them, low to get through)
      P[I.twist] += 0.32 * near * e;
      P[I.hip] -= 0.06 * e;
      P[I.lean] += 0.1 * e;
      P[I.tilt] += 0.08 * near * e;
      arm(near, 0.15, -0.55, 0.85, 0.75 * e);
    } else if (m.kind === 'drive' && this.has) {
      // (into him with his shoulder, low, the ball on the far side of him)
      P[I.tilt] += 0.16 * near * e;
      P[I.twist] += 0.22 * near * e;
      P[I.lean] += 0.14 * e;
      P[I.hip] -= 0.08 * e;
    } else if (m.kind === 'drive') {
      // (straight up, chest square to him, both hands up out of it: he took it on his chest, his feet wide under him)
      P[I.lean] -= 0.1 * e;
      P[I.hip] -= 0.06 * e;
      P[I.wide] += 0.1 * e;
      arm(1, 0.25, 1.55, 0.35, 0.85 * e);
      arm(-1, 0.25, 1.55, 0.35, 0.85 * e);
    } else if (m.kind === 'seal' && id === 'boxout') {
      P[I.hip] -= 0.12 * e;
      P[I.wide] += 0.12 * e;
      P[I.surge] += 0.16 * oz * e;
      P[I.sway] += 0.16 * ox * e;
      arm(1, 0.85, -0.9, 0.2, 0.5 * e);
      arm(-1, 0.85, -0.9, 0.2, 0.5 * e);
    } else if (m.kind === 'seal') {
      // (his hands into the back of the man holding him off, his weight on them, a shoulder turned to get round him)
      P[I.lean] += 0.12 * e;
      P[I.twist] += 0.14 * near * e;
      P[I.hip] -= 0.05 * e;
      arm(1, 0.2, -0.75, 1.05, 0.8 * e);
      arm(-1, 0.2, -0.75, 1.05, 0.8 * e);
    } else if (m.kind === 'bump') {
      // (two bodies come together, neither set: each takes the other on the near shoulder, turned into him, that
      // forearm up between them if he is in front, his knees giving under it; the one stood still sits wider
      // into it. Both do it, each from his own side, so the two answer each other)
      const front = smooth(clamp(oz * 1.5 + 0.5, 0, 1));
      P[I.twist] += 0.2 * near * e * front;
      P[I.tilt] += 0.06 * near * e;
      P[I.hip] -= (m.stood ? 0.1 : 0.06) * e;
      if (m.stood) P[I.wide] += 0.12 * e;
      arm(near, 0.2, -0.6, 0.75, 0.6 * e * front);
    }
  }

  /** He has the ball (his own hands, as the play has it). */
  get carrying(): boolean {
    return this.has;
  }

  /** He gives a hand to a man on the floor in front of him and pulls him up (if his own hands are free). */
  lend() {
    if (!this.one && !this.has) this.one = { id: 'pull', tau: 0 };
  }

  /**
   * A man on him: he keeps his body between that man and the ball. It goes to the hand away from him (a
   * crossover, if it's in the wrong one), his chest turns that way, he sits lower and his free arm comes up as a bar.
   */
  private shield(d: Drive, id: ClipId, own: number) {
    const P = this.pose;
    let want = 0;
    let lx = 0;
    if (d.ball && d.press) {
      this.px0 = d.press.x;
      this.pz0 = d.press.z;
      let lz: number;
      [lx, lz] = this.local(d.press.x, d.press.z);
      want = clamp((PRESS_FAR * this.body.s - Math.hypot(lx, lz)) / ((PRESS_FAR - PRESS_NEAR) * this.body.s), 0, 1);
    }
    this.pressed += (want - this.pressed) * (1 - Math.exp(-this.softMs / 160));
    this.switched += own;
    const w = this.pressed;
    if (w < 0.02 || !DRIBBLES.has(id)) {
      this.across = false;
      return;
    }
    // (the ball's side: 1 his left. The man on that side of him: it goes across)
    const side = this.lefty ? 1 : -1;
    // (the man is on the ball's side: it is going across, as soon as his hand has it. Nothing else first)
    this.across = lx * side > 0.4 && w > 0.5;
    // (kept with the possession like any crossover of his own: played again, it comes from the tape where it came, and
    // the man on him then doesn't start another; see Tape)
    if (this.across && !this.one && this.switched > 900 && this.drib.phase >= 1 && !d.tape?.again) {
      // (away from a man on the ball's side: in front of him, or through his legs or behind him where he has the handle)
      this.own(d, this.across2(SWITCH_STILL, 360 + this.shots + this.drives));
      this.switched = 0;
    }
    if (lx * side > 0) return;
    P[I.twist] += side * 0.32 * w;
    P[I.hip] -= 0.1 * w;
    P[I.lean] += 0.05 * w;
    const [ax, ay, az] = side > 0 ? [I.rx, I.ry, I.rz] : [I.lx, I.ly, I.lz];
    P[ax] += (0.8 - P[ax]) * w * 0.8;
    P[ay] += (-0.85 - P[ay]) * w * 0.8;
    P[az] += (0.8 - P[az]) * w * 0.8;
  }

  /**
   * Coming down from a jump his legs give: his hips drop as his feet take him (fast), stay down a beat and come
   * back up (slower), his chest over his knees and his feet wider; as far as he came down from (a rebound or a
   * block heavy, a hop light), less where the clip has its own. Off a layup or a runner he comes down on the foot
   * he went up off and steps onto the other: his weight goes over the one, then back between them.
   */
  /**
   * The ball looked after with a man on him, other than in his dribble (shield): going up at the rim he takes it up
   * on the side away from the man, his near shoulder turned in between them, and hangs a little for it; down with a
   * rebound or stood holding it, he sits wider over it and turns it away. How hard he was pressed going up is kept
   * for how he comes down (land).
   */
  private protect(id: ClipId) {
    const P = this.pose;
    const w = this.has ? this.pressed : 0;
    const one = this.one;
    const ground = 1 - clamp(P[I.air] / 0.3, 0, 1);
    const holding = id === 'hold' || (id === 'rebound' && !!one && one.tau > REB_IN) || (id === 'catch' && !!one && one.tau > CATCH_HELD);
    this.secure += ((holding ? w * ground : 0) - this.secure) * (1 - Math.exp(-this.ownMs / 140));
    if (w < 0.03 && this.secure < 0.02) return;
    const { s } = this.body;
    const [lx] = this.local(this.px0, this.pz0);
    // (the side away from the man, 1 his left: eased across as the man crosses his front, never flipped)
    // (and once he is up, the side he went up on: a man going by under him doesn't swing him round in the air)
    const up = !!one && FINISHES.has(id) && P[I.air] > 0.5;
    if (!up) this.awayE += (-clamp(lx / (PROTECT_SIDE * s), -1, 1) - this.awayE) * (1 - Math.exp(-this.ownMs / PROTECT_MS));
    const away = this.awayE;
    if (one && FINISHES.has(id) && one.id === id) {
      // (from his gather until just before it leaves his hand: the release is his shot's own)
      const e = smooth(clamp((one.tau + PROTECT_FROM) / 160, 0, 1)) * (1 - smooth(clamp((one.tau + 110) / 90, 0, 1)));
      if (P[I.air] > 0.5) this.fought = Math.max(this.fought, w);
      if (e <= 0) return;
      P[I.bx] -= away * PROTECT_BALL * w * e;
      P[I.twist] += away * PROTECT_TURN * w * e;
      P[I.lean] -= 0.05 * w * e;
      return;
    }
    const k = this.secure;
    if (k < 0.02) return;
    P[I.bx] -= away * SECURE_BALL * k;
    P[I.twist] += away * SECURE_TURN * k;
    P[I.hip] -= SECURE_SIT * k;
    P[I.wide] += SECURE_WIDE * k;
    P[I.lean] += 0.04 * k;
  }
  /** How hard he was pressed going up at the rim (0..1, see protect), and how far he has the ball secured from a man on him, stood with it. */
  private awayE = 0;
  private fought = 0;
  private secure = 0;
  /**
   * A foot put out (ux, uz: a unit, the scene's) `ft` ft from where it would stand, the one already farther that way:
   * a step taken to it (see step: catchK), within CATCH_MS or not at all.
   */
  private stepOut(ux: number, uz: number, ft: number) {
    if (this.catchK >= 0) return;
    // (not into a man: with one within STEP_ROOM ft of his middle (on the 6 ft 6 puppet) the step is shorter, and none
    // at all with him against him)
    const room = clamp((this.room / this.body.s - STEP_TIGHT) / (STEP_ROOM - STEP_TIGHT), 0, 1);
    if (room < 0.3) return;
    ft *= room;
    const along = (f: Foot) => (f.x - this.x) * ux + (f.z - this.z) * uz;
    this.catchK = along(this.feet[1]) > along(this.feet[0]) ? 1 : 0;
    [this.catchX, this.catchZ, this.catchMs] = [ux * ft, uz * ft, CATCH_MS];
  }
  /**
   * Pulling up out of a run (the stop clip is every man's chest and arms): how his feet do it is one of three ways, his
   * own and the moment's. A long last step planted out in front of him, the faster he came the longer; short quick
   * steps, his speed taken off over three or four of them; or a foot thrown out wide of his way, braced across it.
   */
  private brakes() {
    // (with a man against him or right by him he just stops: no room for a long step, a stutter or a foot thrown wide)
    if (this.felt > 0.05 || this.room < CUT_ROOM * this.body.s) return;
    const r = hash(this.who, 800 + ++this.stops);
    const like = hash(this.who, 73) - 0.5;
    const fast = clamp((this.spLag - 8) / 10, 0, 1);
    if (r < 0.42 + 0.3 * like) this.stepOut(this.wayX, this.wayZ, (0.4 + 0.45 * fast) * this.stopK * this.body.s);
    else if (r < 0.78) this.stutterMs = STUTTER_MS * (0.9 + 0.5 * fast);
    else {
      // (a foot thrown out wide of his way to brace on: he stops across it, his feet apart)
      const side = hash(this.who, 810 + this.stops) < 0.5 ? 1 : -1;
      this.stepOut(-this.wayZ * side * 0.8 + this.wayX * 0.6, this.wayX * side * 0.8 + this.wayZ * 0.6, (0.35 + 0.3 * fast) * this.body.s);
      this.braceMs = STUTTER_MS;
    }
  }

  private land(own: number) {
    const P = this.pose;
    const up = P[I.air] > 0.5;
    if (up) this.peak = Math.max(this.peak, P[I.hip]);
    if (this.flew && !up) {
      this.giveT = 0;
      this.landed = true;
      this.hard = clamp(this.peak / LAND_HIGH, 0.3, 1.25);
      const id = this.one?.id;
      this.foot = id && ONE_FOOT.has(id) ? (this.offK ? -1 : 1) : 0;
      this.peak = 0;
      // (down from a finish a man fought him for, or with a rebound in a crowd: he comes down harder, off balance, and
      // takes a step away from the man to get his feet back under him)
      const fight = Math.max(this.fought, id === 'rebound' ? this.pressed : 0);
      this.fought = 0;
      if (fight > LAND_FOUGHT) {
        this.hard = Math.min(1.5, this.hard * (1 + 0.3 * fight));
        const [ux, uz] = [this.x - this.px0, this.z - this.pz0];
        const far = Math.hypot(ux, uz);
        if (this.catchK < 0 && far > 0.05) {
          const along = (f: Foot) => ((f.x - this.x) * ux + (f.z - this.z) * uz) / far;
          this.catchK = along(this.feet[1]) > along(this.feet[0]) ? 1 : 0;
          const step = CATCH_FT * 0.7 * this.body.s * fight;
          [this.catchX, this.catchZ, this.catchMs] = [(ux / far) * step, (uz / far) * step, CATCH_MS];
        }
      }
      // (and with nobody to get away from, down as the jump left him: still going, a step the way he was going; a
      // defender down from a contest, a step back off the man to be in front of him again; and now and then, down on
      // his spot, a foot put back under him. Off one foot he has his own step coming: see `foot`)
      if (this.catchK < 0 && !this.foot) {
        const sp = Math.hypot(this.lvx, this.lvz) * 1000;
        const r = hash(this.who, 900 + ++this.lands);
        const { s } = this.body;
        if (sp > LAND_CARRY) this.stepOut((this.lvx * 1000) / sp, (this.lvz * 1000) / sp, clamp(sp * LAND_CARRY_FT, LAND_STEP_LEAST, LAND_STEP_MOST) * s);
        else if (id === 'contest' || id === 'block') {
          const [fx, fz] = this.dirs();
          this.stepOut(-fx, -fz, (0.3 + 0.25 * this.hard) * s);
        } else if (r < 0.45) {
          const a = (r / 0.45) * Math.PI * 2;
          this.stepOut(Math.sin(a), Math.cos(a), (0.22 + 0.12 * this.hard) * s);
        }
      }
    }
    this.flew = up;
    const long = LAND_MS * (0.75 + 0.25 * this.hard);
    if (this.giveT > long) return;
    this.giveT += own;
    const u = Math.min(1, this.giveT / long);
    const dip = u < 0.28 ? smooth(u / 0.28) : u < 0.4 ? 1 : 1 - smooth((u - 0.4) / 0.6);
    const k = dip * this.hard * clamp((P[I.hip] + 0.4) / 0.4, 0, 1) * (1 - clamp(P[I.air], 0, 1));
    // (as his own legs take it: some sink deep into it, some land light; feet wide or near together)
    P[I.hip] -= LAND_DIP * k * this.landK;
    P[I.lean] += 0.09 * k * this.landK;
    // (off two feet he comes down wide on both, to take it)
    P[I.wide] += (this.foot ? 0.1 : LAND_WIDE * this.landW) * k;
    if (this.foot) {
      // (over the foot he lands on, then onto both)
      const over = Math.sin(Math.PI * Math.min(1, u * 1.6)) * this.hard;
      P[I.sway] += 0.14 * this.foot * over;
      P[I.proll] += 0.05 * this.foot * over;
      P[I.tilt] -= 0.04 * this.foot * over;
    }
  }

  /**
   * A man meeting him body to body (Drive.touch): he gets lower and wider to take it and leans into him: his chest
   * and a forearm into a man in front of him (the man screened meeting the screener, the man boxed out pushing for
   * position), his seat into a man behind him (boxing out), his shoulder into a man beside him; and the two push and
   * give, a little, back and forth. Nothing in the air. The screener keeps his arms crossed in front of him.
   */
  private contact(d: Drive, id: ClipId, own: number) {
    const P = this.pose;
    this.knock(own);
    this.braced(id, own);
    const t = d.touch;
    if (t) [this.tx, this.tz, this.mate] = [t.x, t.z, t.who ?? -1];
    this.mateFeet = t?.feet ?? null;
    this.felt += ((t ? t.w : 0) - this.felt) * (1 - Math.exp(-own / CONTACT_MS));
    const w = this.felt * (1 - clamp(P[I.air] / 0.3, 0, 1));
    if (w < 0.01) return;
    const [lx, lz] = this.local(this.tx, this.tz);
    const far = Math.hypot(lx, lz) || 1;
    const ahead = lz / far;
    const aside = lx / far;
    // (the two push and give as one, on the pair's own beat (the possession's clock, the same for both): as one's hips
    // go into the other the other's go back from him, and then the other way; each leans into it, harder as he gives
    // ground. Not each on a beat of his own, two shoving at nothing)
    const m = this.mate;
    const pair = m >= 0 ? hash(Math.min(this.who, m), Math.max(this.who, m) + 7) : hash(this.who, 9);
    const into = m < 0 || this.who < m ? 1 : -1;
    const shove = Math.sin((d.t !== undefined ? d.t * 2 : this.loopT) * SHOVE_RATE + pair * Math.PI * 2) * into;
    P[I.hip] -= CONTACT_SIT * w;
    P[I.wide] += 0.14 * w;
    P[I.lean] += (ahead > 0 ? 0.12 * ahead : -0.04 * ahead) * w + SHOVE_LEAN * Math.max(0, -shove) * Math.sign(ahead) * w;
    // (his hips along the line to him: toward him as he drives, back as he gives)
    P[I.surge] += (ahead > 0 ? 0.08 * ahead : 0.16 * ahead) * w + SHOVE_GO * shove * ahead * w;
    P[I.sway] += 0.07 * aside * w + SHOVE_GO * shove * aside * w;
    P[I.tilt] += 0.11 * aside * w;
    // (the forearm on his side of the man comes up into him; dead ahead of him, both do, part of the way: never the one
    // and then the other as the man crosses his middle)
    // (not going to the glass into a boxer: his forearm is on the boxer's back and his other hand up, see guard)
    if (!d.ball && id !== 'screen' && id !== 'crash' && !this.one) {
      const front = w * smooth(clamp((ahead - 0.15) / 0.35, 0, 1)) * 0.85;
      for (const side of SIDES) {
        const k = front * smooth(clamp((aside * side + 0.25) / 0.5, 0, 1));
        if (k <= 0) continue;
        const [ax, ay, az] = side > 0 ? [I.lx, I.ly, I.lz] : [I.rx, I.ry, I.rz];
        P[ax] += (0.3 - P[ax]) * k;
        P[ay] += (-0.5 - P[ay]) * k;
        P[az] += (1.0 - P[az]) * k;
      }
    }
  }

  /**
   * His footwork for what he is doing (see step). Holding the ball, a pivot foot (PIVOT_KEEP), chosen as he gathers
   * it: the one down, else the one behind him, else his left. A jump off two feet loaded from both, set under him
   * (LOAD_MS), off a hop if he comes into it at a run, off the catch or off the dribble (a jump stop); off one, his last two steps timed
   * to it (the 1-2: STEP_TIME). A step-back's plant. And set on his feet (SET_STOP_MS) through a pivot or a load.
   */
  private footwork(d: Drive, id: ClipId, own: number) {
    const P = this.pose;
    const one = this.one;
    const { s } = this.body;
    // (the move's clock against his own: its lead-in played quicker to fit a short move, as update has it)
    if (!one || one.id !== this.oneWas) this.hopU = -1;
    this.oneWas = one?.id ?? null;
    const lead = one ? -span(CLIPS[one.id])[0] : 0;
    this.tauRate = (one && one.tau < 0 && d.dur > 0 && ONE[d.act]?.[1] === 'end' ? clamp(lead / d.dur, 1, LEAD_IN) : 1) / Math.max(0.25, this.pace);
    // (the move's ms until he leaves the floor, and his own; under 0, none to come. A jump stop's hop is no leaving it)
    // (when he leaves the floor, in his move's time: a jump shot's legs are on their own, see rhythm)
    const take = one ? takeoff(one.id) - (one.id === 'jumper' ? this.legLead : 0) : Number.NaN;
    const air = P[I.air] > 0.5 && !(this.hopU >= 0 && this.hopU < 1);
    const before = one && !air && one.tau < take ? take - one.tau : -1;
    const left = before >= 0 ? before / Math.max(0.05, this.tauRate) : -1;
    // off one foot: the 1-2, the foot opposite the hand he finishes with (a euro's second step, the way his hips go last)
    const oneFoot = !!one && ONE_FOOT.has(one.id) && before >= 0;
    if (oneFoot) this.offK = one.id === 'layup' && this.euro ? (this.euro > 0 ? 1 : 0) : one.id === 'layup' && this.south ? 1 : 0;
    // off two: loaded from both, set under him; a defender closing out hard leaps off his stride
    const running = (one?.id === 'contest' || one?.id === 'block') && this.planSp > RUNNING_LEAP;
    const two = !!one && before >= 0 && TWO_FOOT.has(one.id) && !running && !(one.id === 'jumper' && this.stepBack > 0 && left > GATHER_LEFT);
    this.lockK = oneFoot ? this.offK : running && before >= 0 ? -2 : -1;
    this.lockMs = left;
    // (into it at a run, or off the catch or the dribble: a hop, onto both together. Decided once, as the load comes)
    if (two && this.hopU === -1 && left < LOAD_MS) {
      const shot = one.id === 'jumper' && !this.stepBack && (this.hop > 0 || (this.pullUp && this.hops));
      this.hopU = (this.planSp > JUMP_STOP && one.id !== 'contest' && one.id !== 'block') || shot ? 0 : -2;
    }
    if (this.hopU >= 0 && this.hopU < 1) {
      this.hopU = Math.min(1, this.hopU + own / HOP_MS);
      const w = Math.sin(Math.PI * this.hopU);
      P[I.air] = Math.max(P[I.air], AIR_HOP * w);
      P[I.hip] += 0.1 * w;
    }
    // (braced across his way to stop: his feet a little wider under him while he does: see brakes)
    this.braceMs -= own;
    this.brace += ((this.braceMs > 0 ? 1 : 0) - this.brace) * (1 - Math.exp(-this.softMs / 110));
    P[I.wide] += 0.1 * this.brace;
    this.loading = two && (left < LOAD_MS || this.hopU >= 0);
    this.gathering = this.loading && left > GATHER_LEFT && this.hopU < 0;
    // up off one foot, the other knee drives up and through; the foot he left the floor off trails (the move's own
    // legs, swapped where it went up off the other: a euro's second step)
    if (one && ONE_FOOT.has(one.id) && P[I.air] > 0.02 && Number.isFinite(take)) {
      // (the take's layup goes up off its left foot, mirrored off its right; the keyed runner, hook and one-hand dunk
      // drive their left knee)
      if ((one.id === 'layup' ? (this.south ? 1 : 0) : 1) !== this.offK) {
        [P[I.flu], P[I.fru]] = [P[I.fru], P[I.flu]];
        [P[I.flf], P[I.frf]] = [P[I.frf], P[I.flf]];
      }
      // (the take's knee hardly comes up: the keyed ones' do)
      const e = one.id === 'layup' ? smooth(clamp((one.tau - take + 30) / 110, 0, 1)) * (1 - smooth(clamp((one.tau - take) / KNEE_HOLD, 0, 1))) : 0;
      P[this.offK ? I.flu : I.fru] += KNEE_UP * e;
      P[this.offK ? I.flf : I.frf] += KNEE_FWD * e;
    }
    // (a step-back: the foot on his ball side out in front as he leans in, to push back off)
    this.plantFwd = one?.id === 'jumper' && this.stepBack > 0 ? BACK_PLANT * (1 - smooth(clamp((one.tau + 380) / 180, 0, 1))) : 0;
    // holding the ball (not dribbling it, not on his way up with it): one foot down, his pivot
    const holding =
      d.ball && P[I.air] < 0.5 && !DRIBBLES.has(id) && !isMove(id) && !this.loading && !this.plantFwd && !(one && ONE_FOOT.has(one.id)) && this.planSp < PIVOT_GO && !this.torn;
    if (!holding) this.pivotK = -1;
    else if (this.pivotK < 0) {
      const [a, b] = this.feet;
      if (a.swing !== b.swing) this.pivotK = a.swing ? 1 : 0;
      else if (!a.swing) {
        const [fx, fz] = this.dirs();
        const fore = (a.x - b.x) * fx + (a.z - b.z) * fz;
        this.pivotK = Math.abs(fore) > 0.15 * s ? (fore < 0 ? 0 : 1) : 0;
      }
      this.jabIn = JAB_EVERY * (0.5 + hash(this.who, 500 + this.standN));
    }
    // (on his pivot with the man on him, now and then he jabs at him)
    if (this.pivotK >= 0 && this.pressed > 0.45 && !this.winding && this.jabT > JAB_MS && (this.jabIn -= own) <= 0) {
      this.jabT = 0;
      this.jabIn = JAB_EVERY * (0.6 + hash(this.who, 520 + this.standN++));
    }
    // (on his pivot he sits into his stance: lower, wider, the ball his to protect)
    this.sat += ((this.pivotK >= 0 ? 1 : 0) - this.sat) * (1 - Math.exp(-own / 150));
    P[I.hip] -= PIVOT_SIT * this.sat * (0.6 + 0.4 * this.pressed);
    P[I.wide] += 0.12 * this.sat;
    // set on his feet through it all, once there are no more steps to take into it (and not again, once the plan has
    // torn him off his spot, until he is free)
    const set = this.pivotK >= 0 || (this.loading && !this.gathering);
    if (!set) this.torn = false;
    if (set && !this.setOn && !this.torn) {
      this.svx = this.vx;
      this.svz = this.vz;
    }
    this.setOn = set && !this.torn;
  }

  /**
   * Where he stands while he is set on his feet (see SET_STOP_MS), against the plan's spot (`px`, `pz`, with a leap's
   * carry): set, his own way on dies away and the spot goes on without him; let go, he goes after it.
   */
  private hold(px: number, pz: number, own: number) {
    if (own <= 0) return;
    if (this.setOn) {
      const k = Math.exp(-own / SET_STOP_MS);
      const go = SET_STOP_MS * (1 - k);
      this.ox = this.x + this.svx * go - px;
      this.oz = this.z + this.svz * go - pz;
      this.svx *= k;
      this.svz *= k;
      // (set too far from it: he has to go)
      if (Math.hypot(this.ox, this.oz) > SET_MOST * this.body.s) [this.setOn, this.torn, this.pivotK] = [false, true, -1];
      return;
    }
    const far = Math.hypot(this.ox, this.oz);
    if (far < 1e-3) {
      this.ox = this.oz = 0;
      return;
    }
    // (eased off: from a stand he sets off after it, he isn't snatched there)
    const most = Math.min(((this.pose[I.air] > 0.5 ? SET_FLY : SET_BACK) * own) / 1000, far * (1 - Math.exp(-own / 160)));
    this.ox -= (this.ox / far) * most;
    this.oz -= (this.oz / far) * most;
  }

  /** On his pivot (see PIVOT_KEEP) his body goes round the ball of that foot as he turns `a` (radians, as his heading does). */
  private orbit(a: number) {
    if (Math.abs(a) < 1e-6) return;
    const f = this.feet[this.pivotK];
    const { s } = this.body;
    const bx = f.x + Math.sin(f.yaw) * BALL * s;
    const bz = f.z + Math.cos(f.yaw) * BALL * s;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const dx = this.x - bx;
    const dz = this.z - bz;
    // (part of the way, and no farther off the plan's spot than PIVOT_FAR: the floor round him is the plan's to keep)
    let mx = (bx + dx * c + dz * sn - this.x) * ORBIT;
    let mz = (bz - dx * sn + dz * c - this.z) * ORBIT;
    const most = PIVOT_FAR * s;
    const far = Math.hypot(this.ox + mx, this.oz + mz);
    if (far > most && far > Math.hypot(this.ox, this.oz)) [mx, mz] = [0, 0];
    this.x += mx;
    this.z += mz;
    this.ox += mx;
    this.oz += mz;
  }

  /** How far a foot on the floor turns with his body (out, in: see FOOT_OUT) before he pivots on its ball, for how he stands. */
  private turns(): [number, number] {
    const id = this.clip;
    if (id === 'stance' || id === 'ready' || id === 'shuffle' || id === 'closeout') return [STANCE_OUT, STANCE_IN];
    if (id === 'boxout' || id === 'crash') return [BOX_OUT, BOX_OUT];
    return [FOOT_OUT, FOOT_IN];
  }

  /**
   * How far out in front of him (ft, on the 6 ft 6 puppet; behind, under 0) each foot goes under him, his left's then
   * his right's: on his pivot the other foot in front in his stance, stepping into a pass or jabbing at the man on him;
   * loaded to shoot, the foot on his shooting side a little ahead; leaning in for a step-back, the foot on his ball side
   * out in front, to push back off.
   */
  private ahead(dt: number): Float32Array {
    const F = this.fore;
    F[0] = F[1] = 0;
    this.jabT += dt;
    const one = this.one;
    if (this.pivotK >= 0) {
      // (into a pass, from late in its wind-up to just after it has gone)
      const passing = one && PASSES.includes(one.id) ? smooth(clamp((one.tau + 180) / 160, 0, 1)) * (1 - smooth(clamp((one.tau - 120) / 200, 0, 1))) : 0;
      const jab = this.jabT < JAB_MS ? Math.sin((Math.PI * this.jabT) / JAB_MS) : 0;
      F[1 - this.pivotK] = STAGGER + PASS_STEP * passing + JAB * jab;
    } else if (this.loading && one?.id === 'jumper') {
      F[1] = LOAD_STAGGER / 2;
      F[0] = -LOAD_STAGGER / 2;
    } else if (WAITS.has(this.clip) && !one) {
      // (waiting, his feet aren't side by side: one a little ahead, the same one every time, by his own way of standing)
      F[this.waitFoot] = this.waitAhead / 2;
      F[1 - this.waitFoot] = -this.waitAhead / 2;
    }
    if (this.plantFwd > 0) F[this.lefty ? 0 : 1] = this.plantFwd;
    return F;
  }

  /**
   * Which pass he throws: off the dribble, one out of it (two hands brought up onto it, or now and then, as he likes
   * to, a one-handed push off the bounce: never taken up over his head from his hip in the time a dribble gives him);
   * held, any of his, the one he likes the most often.
   */
  private passOf(act: Act): ClipId {
    const r = hash(this.who, 40 + ++this.passes);
    const likes = hash(this.who, 33);
    // (the move he throws it out of, not the clip he is still in: a drive begun off the catch is a dribble already)
    if (act === 'drive' || act === 'dribble' || DRIBBLES.has(this.clip) || isMove(this.clip)) return r < 0.1 + 0.25 * likes ? 'passOne' : 'pass';
    // (held: his own favourite half the time, any of them the rest)
    return r < 0.5 ? PASSES[Math.floor(likes * PASSES.length)] : PASSES[Math.floor(((r - 0.5) / 0.5) * PASSES.length)];
  }

  /** What is his own: by who he is and how he's built, the same every game. A big man's feet turn over slower; no two carry themselves alike. */
  /** How much of each kind of mover he is (explosive, glider, heavy, craftsman: 0..1 each, see style), and what that does to his timing. */
  family: readonly number[] = [0, 0, 0, 0];
  private turnK = 1;
  private blendK = 1;
  private handK = 1;
  private driveK = 1;
  private crossK = 1;
  /** How much he likes to go in and out where another man would cross it over (0 never, 2 as often as not): a craftsman's move. */
  private inOutK = 1;
  private style() {
    const w = this.who;
    this.styled = w;
    const { s, bulk } = this.body;
    this.tempo = (1 + (hash(w, 21) - 0.5) * 0.2) / (Math.sqrt(s) * (1 + (bulk - 1) * 0.3));
    this.carry0 = (hash(w, 22) - 0.5) * 0.07;
    this.nod0 = (hash(w, 23) - 0.5) * 0.1;
    this.armK = 0.82 + hash(w, 24) * 0.36;
    this.beat = 0.84 + hash(w, 25) * 0.32;
    // (a big man runs flatter and more upright, his knees lower: a guard's stride bounces and leans)
    const big = clamp((s - 1) / 0.08, -1, 1);
    this.kneeK = 0.8 + hash(w, 34) * 0.3 - 0.08 * big;
    this.bounceK = 0.7 + hash(w, 35) * 0.6 - 0.15 * big;
    this.runLean = (hash(w, 36) - 0.5) * 0.09 - 0.02 * big;
    this.elbowK = (hash(w, 37) - 0.5) * 0.24;
    this.setPt = (hash(w, 38) - 0.5) * SET_PT;
    this.pocket = (hash(w, 39) - 0.5) * POCKET;
    this.hopper = hash(w, 41) < 0.55;
    this.landK = 0.75 + hash(w, 40) * 0.5;
    this.landW = 0.6 + hash(w, 42) * 0.8;
    // (his moves: a few men kick a leg out on nearly every jumper and euro-step most layups, most hardly ever; a big man
    // sits less over his dribble and stands taller in his stance; each the same every night)
    const r = (k: number) => hash(w, k);
    this.kickLike = r(43) < 0.3 ? 0.75 + 0.2 * r(44) : 0.04 + 0.14 * r(44);
    this.euroLike = r(45) < 0.25 ? 0.45 + 0.3 * r(46) : 0.04 + 0.14 * r(46);
    this.gatherHi = (r(47) - 0.4) * 0.9;
    this.gatherSide = (r(48) - 0.3) * 0.6;
    this.gatherLow = 0.03 + r(49) * 0.14;
    this.guideK = r(50) < 0.35 ? 0.35 + 0.35 * r(51) : 0.06 * r(51);
    this.elbowSet = (r(54) - 0.5) * 0.8;
    this.tuckK = (r(52) - 0.5) * 0.5;
    this.followK = 0.6 + 0.9 * r(53);
    this.dribLow = clamp(0.03 + r(55) * 0.18 - 0.06 * big, 0, 0.22);
    this.dribLean = (r(56) - 0.3) * 0.14;
    this.offArm = (r(58) - 0.4) * 0.5;
    this.standW = (r(59) - 0.5) * 0.3 - 0.04 * big;
    this.standLow = clamp(0.02 + r(60) * 0.15 - 0.04 * big, 0, 0.17);
    this.handsUp = (r(61) - 0.4) * 0.7;
    this.swipeK = 0.6 + r(62) * 0.9;
    this.slideK = 0.85 + r(63) * 0.3;
    // (and the kind of mover he is, from his build and what he can do: his habits above are his own, but they come in
    // families, and a family is told by how its men are organised and timed, not by one habit. An explosive man is low,
    // quick off his first step, bouncy, snaps from one thing to the next and lands light; a long glider takes fewer,
    // longer strides, upright, his arms quiet, and flows between things; a heavy man runs flat, turns and changes
    // slowly, stands wide, bars his arm and lands deep on both feet; a craftsman sits over the ball, is busy with it and
    // with his hands, and holds his follow-through. Each man is some of each, as far as he is built for it)
    const { quick = 0, spring = 0, power = 0, skill = 0 } = this.body;
    const kinds = [
      Math.max(0, 0.55 * quick + 0.55 * spring - 0.3 * big),
      Math.max(0, 0.5 * big + 0.45 * quick - 0.45 * power),
      Math.max(0, 0.65 * power + 0.35 * big - 0.35 * quick),
      Math.max(0, 0.75 * skill - 0.3 * spring - 0.2 * power),
    ];
    const all = Math.max(1, kinds[0] + kinds[1] + kinds[2] + kinds[3]);
    const [burst, glide, heavy, craft] = kinds.map((k) => k / all);
    this.family = [burst, glide, heavy, craft];
    this.tempo *= 1 + 0.1 * burst - 0.08 * glide - 0.06 * heavy;
    this.kneeK += 0.12 * burst - 0.05 * glide - 0.1 * heavy;
    this.bounceK += 0.2 * burst - 0.15 * glide - 0.25 * heavy;
    this.runLean += 0.03 * burst - 0.025 * glide;
    this.armK *= 1 - 0.1 * glide + 0.1 * heavy;
    this.elbowK += 0.1 * heavy - 0.05 * glide;
    this.dribLow = clamp(this.dribLow + 0.05 * burst + 0.06 * craft - 0.03 * heavy, 0, 0.26);
    this.dribLean += 0.04 * craft;
    this.standW += 0.12 * heavy;
    this.standLow = clamp(this.standLow + 0.04 * burst - 0.03 * glide + 0.03 * heavy, 0, 0.2);
    this.landK += 0.25 * heavy - 0.12 * burst - 0.05 * glide;
    this.landW += 0.3 * heavy;
    this.offArm += 0.25 * heavy;
    this.handsUp += 0.2 * craft;
    this.swipeK += 0.3 * craft + 0.2 * burst;
    this.followK += 0.3 * glide + 0.4 * craft;
    this.euroLike = clamp(this.euroLike + 0.25 * glide + 0.1 * craft, 0, 0.9);
    this.kickLike = clamp(this.kickLike + 0.15 * craft, 0, 0.95);
    this.gatherLow += 0.04 * craft + 0.05 * heavy - 0.02 * burst;
    if (heavy > 0.5) this.hopper = false;
    else if (burst > 0.5) this.hopper = true;
    this.beat *= 1 + 0.1 * craft + 0.06 * burst - 0.08 * heavy;
    // (and how he waits off the ball: how far his weight goes over and how long he keeps it there, which foot he
    // stands with ahead of the other and by how much, how much he sits, and how often he shows his hands for it)
    this.weightK = clamp(0.6 + 0.65 * r(168) + 0.15 * glide - 0.2 * heavy, 0.4, 1.3);
    this.weightSlow = 0.7 + 0.7 * r(169) + 0.2 * heavy - 0.15 * burst;
    this.waitFoot = r(170) < 0.5 ? 0 : 1;
    this.waitAhead = 0.1 + 0.32 * r(171);
    this.waitLow = clamp((r(172) - 0.3) * 0.1 + 0.05 * burst - 0.03 * glide, -0.03, 0.09);
    this.wantsK = clamp(0.25 + 0.35 * r(173) + 0.2 * craft + 0.1 * burst, 0.1, 0.8);
    this.weightTo = r(174) < 0.5 ? 1 : -1;
    this.weightIn = WEIGHT_HOLD[0] * r(175);
    // (and his timing: how fast he turns, how quickly he is into his next thing, how quick his hands are, how hard he
    // drives off his first step, how often he changes hands standing with it)
    this.turnK = 1 + 0.15 * burst - 0.05 * glide - 0.15 * heavy;
    // (never quicker than a pose can change without a pop, which is what everyone's already is: only slower)
    this.blendK = 1 + 0.12 * glide + 0.22 * heavy;
    this.handK = 1 + 0.08 * glide + 0.18 * heavy;
    this.driveK = 1 + 0.3 * burst - 0.2 * heavy;
    this.crossK = 1 - 0.3 * craft + 0.2 * heavy;
    this.inOutK = clamp(0.5 + 1.2 * craft + 0.4 * glide - 0.6 * heavy + (r(67) - 0.5), 0, 2);
    this.pushK = 1 + 0.35 * burst - 0.25 * glide - 0.1 * heavy + (r(65) - 0.5) * 0.3;
    this.stopK = 1 + 0.25 * burst + 0.1 * heavy - 0.3 * glide + (r(66) - 0.5) * 0.3;
    // (his jumper is one of a few ways of shooting, each its own from the dip to the release (see shoot): a craftsman's
    // two-motion set shot, an athlete's one-motion flow, a long man's high release, a big man's push from his chest)
    const forms = [0.25 + craft, 0.2 + burst, 0.15 + glide, 0.08 + heavy * 0.8 + Math.max(0, 0.4 - skill)];
    let pick = r(64) * (forms[0] + forms[1] + forms[2] + forms[3]);
    this.form = 0;
    while (this.form < 3 && pick > forms[this.form]) pick -= forms[this.form++];
    // (what would be chance is his own too: each starts on his own beat, and the same one every time the game is played)
    this.loopT = hash(w, 26) * 2000;
    this.fidgetIn = FIDGET_EVERY * (0.4 + hash(w, 27));
    this.breath = hash(w, 28);
    this.resetIn = 1500 + hash(w, 29) * 2000;
    this.crossIn = CROSS_EVERY * this.crossK * (0.5 + hash(w, 30));
    this.idle = IDLES[Math.floor(hash(w, 31) * IDLES.length)];
  }

  /**
   * How fast he may turn (radians a second) and how quickly he gathers it (radians a second, each second), for a
   * turn `off` from the way he faces to the way he's to face, that way `against` from the way he is going. A big
   * turn away from his run is no turntable: going fast he comes round slower; from a walk or a stand he plants and
   * pivots, quicker than he turns on the move.
   */
  private turning(off: number, against: number, sp: number, move: boolean, down: boolean): [number, number] {
    // (as quick as his kind turns: see style)
    const acc = (move ? TURN_ACC_MOVE : TURN_ACC) * this.turnK;
    if (move) return [TURN_MAX, acc];
    const big = smooth(clamp((Math.abs(off) - TURN_BIG) / TURN_BIG, 0, 1));
    const carried = smooth(clamp((Math.abs(against) - TURN_BIG) / TURN_BIG, 0, 1)) * clamp((sp - PIVOT_UNDER) / (TURN_CARRIED - PIVOT_UNDER), 0, 1);
    const pivot = down ? big * clamp((PIVOT_UNDER - sp) / PIVOT_UNDER, 0, 1) : 0;
    return [TURN_MAX * Math.min(1, this.turnK) * (1 - TURN_SLOWED * carried * big) + (PIVOT_MAX - TURN_MAX) * pivot, acc];
  }

  /** The speed he is getting up to (ft a second): setting off hard, his body and legs are a runner's before his speed is. */
  private going(sp: number): number {
    return this.has ? sp : sp + clamp(this.accBody, 0, GAIN_FULL) * GAIN_AHEAD;
  }

  /** The stride at a speed: the two captured gaits either side of it, on the one phase, mixed (by the speed he is getting up to: see going). */
  private stride(at: number, out: Float32Array) {
    const sp = this.going(at);
    let k = 0;
    while (k < AHEAD.length - 2 && sp > AHEAD[k + 1][1]) k++;
    const w = smooth(clamp((sp - AHEAD[k][1]) / (AHEAD[k + 1][1] - AHEAD[k][1]), 0, 1));
    // (his left foot is down from 1 - downE of his stride to its end: see step)
    const mid = 1 - this.downE / 2;
    const fast = clamp((this.ownMs - BOB_FROM_MS) / (BOB_FAST_MS - BOB_FROM_MS), 0, 1);
    const bob = 1 - (1 - BOB_FAST) * fast;
    // (and the take's hips and arms are kept to his feet less: at 4x a frame is a quarter of a stride, and the dip over
    // the foot he has down would be taken in one)
    const keep = 1 - fast;
    const flat = (id: ClipId, o: Float32Array) => {
      const m = HIP_MEAN.get(id) ?? o[I.hip];
      // (his own bounce too, but not at 4x, where the bob is flattened: see BOB_FAST)
      o[I.hip] = m + (o[I.hip] - m) * bob * (1 + (this.bounceK - 1) * keep);
      // (his chest's turn against his hips each stride too: at 4x it would swing his head a quarter radian a frame)
      o[I.twist] *= 1 - TWIST_FAST * fast;
    };
    sample(CLIPS[AHEAD[k][0]], this.phase + (stanceOf(AHEAD[k][0]) - mid) * keep, out);
    flat(AHEAD[k][0], out);
    if (w > 0) {
      sample(CLIPS[AHEAD[k + 1][0]], this.phase + (stanceOf(AHEAD[k + 1][0]) - mid) * keep, MIX);
      flat(AHEAD[k + 1][0], MIX);
      for (let i = 0; i < N; i++) out[i] += (MIX[i] - out[i]) * w;
    }
    // (his hips ride over his own feet, as a runner's do at his speed: lowest just after each comes down, highest
    // between them. The takes' upper bodies are mixed above; their hips went over their own feet. See stride.ts)
    // (not at 4x, where his legs are stepped compactly and the takes' own hips, flattened above, go with them)
    if (fast < STRIDE_UNTIL) out[I.hip] = this.rides(bob * (1 + (this.bounceK - 1) * keep));
    this.pump(out, sp);
  }

  /**
   * A runner's arms, in place of the takes' from a jog up (PUMP_FROM..PUMP_FULL ft a second): each swings from its
   * shoulder against the leg on its side, its elbow bent near square, farther and more shut the faster he goes. The
   * hand comes up in front of his chest, in toward his middle, as the knee across from it drives through, and goes
   * back past his hip as that foot pushes off. Worked out as the two bones are (upper arm from straight down, forearm
   * from the upper arm), so the hand is where an arm bent that way has it.
   */
  private pump(out: Float32Array, sp: number) {
    const v = scaled(sp, this.body.s);
    const k = smooth(clamp((v - PUMP_FROM) / (PUMP_FULL - PUMP_FROM), 0, 1));
    if (k <= 0) return;
    const hard = clamp((v - PUMP_FULL) / (PUMP_SPRINT - PUMP_FULL), 0, 1);
    // (played at 4x, where a stride is four drawn frames, they swing less far: an arm at each end of its swing in turn is a flicker)
    const fast = clamp((this.ownMs - BOB_FROM_MS) / (BOB_FAST_MS - BOB_FROM_MS), 0, 1);
    const swing = (PUMP_SWING[0] + (PUMP_SWING[1] - PUMP_SWING[0]) * hard) * (1 - PUMP_FAST * fast);
    const bend = PUMP_BEND[0] + (PUMP_BEND[1] - PUMP_BEND[0]) * hard;
    // (his left knee is farthest through this far into his stride: his right hand is up in front of him then, his left back)
    const q = Math.cos(2 * Math.PI * (this.phase - PUMP_KNEE * (1 - this.downE)));
    for (const side of [1, -1] as const) {
      const fore = side > 0 ? -q : q;
      const th = PUMP_HANG + swing * fore;
      const ga = th + bend + PUMP_SHUT * fore;
      const z = UARM * Math.sin(th) + FARM * Math.sin(ga);
      const y = -UARM * Math.cos(th) - FARM * Math.cos(ga);
      const x = PUMP_OUT - PUMP_IN * Math.max(0, fore);
      const [cx, cy, cz, cs] = side > 0 ? [I.lx, I.ly, I.lz, I.lsw] : [I.rx, I.ry, I.rz, I.rsw];
      out[cx] += (x - out[cx]) * k;
      out[cy] += (y - out[cy]) * k;
      out[cz] += (z - out[cz]) * k;
      out[cs] *= 1 - k;
    }
  }

  /** His hips through his stride (the pose's `hip`), their rise and fall `k` times a runner's at his speed: by his own feet (see step). */
  private rides(k: number): number {
    const m = hipsMean(this.gait);
    // (his left foot comes down 1 - downE through his stride, his right half a stride on)
    return m + (hipsOver(this.gait, (this.phase - (1 - this.downE)) * 2) - m) * k;
  }

  /** His own carriage laid on the clip's: how upright he is, how his head sits, how far his arms swing in a gait. */
  private manner(id: ClipId) {
    const P = this.pose;
    const ground = 1 - clamp(P[I.air], 0, 1);
    P[I.lean] += this.carry0 * ground;
    P[I.nod] += this.nod0;
    if (id === 'start') {
      // (the take is a man setting off flat out: one who only jogs away drives less)
      const k = clamp(this.spLag / 11, 0.45, 1) * this.armK;
      for (const c of [I.lz, I.rz, I.twist]) P[c] = REST_POSE[c] + (P[c] - REST_POSE[c]) * k;
      P[I.lean] = REST_POSE[I.lean] + (P[I.lean] - REST_POSE[I.lean]) * (0.5 + 0.5 * k);
      // (and the man in the take sat lower into it than a ballplayer does)
      P[I.hip] *= 0.6;
    }
    // (setting off at a run: his push-off. Down and leaning into it over his first two or three steps; an explosive man
    // more so, a long glider less)
    if (FORWARD.has(id) && this.pushT < PUSH_MS) {
      const u = this.pushT / PUSH_MS;
      const e = smooth(clamp(u / 0.2, 0, 1)) * (1 - smooth(clamp((u - 0.45) / 0.55, 0, 1))) * this.pushK * ground;
      P[I.lean] += PUSH_LEAN * e;
      P[I.hip] -= PUSH_SIT * e;
    }
    // (his braking plant as deep as he plants: an explosive man stops hard and low, a glider rolls to a stop)
    if (id === 'stop') {
      const k = this.stopK;
      P[I.hip] = -0.3 + (P[I.hip] + 0.3) * k;
      P[I.lean] = 0.13 + (P[I.lean] - 0.13) * k;
      P[I.surge] *= k;
    }
    // (sliding he stays down in his stance, his head level: the take's man bobbed)
    if (id === 'shuffle') P[I.hip] = SLIDE_HIP + (P[I.hip] - SLIDE_HIP) * SLIDE_BOB;
    if (CLIPS[id].kind === 'gait' && id !== 'shuffle') {
      // (getting going he drives: lower, his arms pumping farther than they will once he is up to speed)
      const drive = FORWARD.has(id) ? clamp(this.leanGo / LEAN_MAX, 0, 1) : 0;
      const k = this.armK * (1 + 0.45 * drive);
      P[I.lz] *= k;
      P[I.rz] *= k;
      P[I.twist] *= k;
      P[I.hip] -= 0.1 * drive;
    }
    // (getting going he leans into it and drives low; pulling up out of a run he leans back against it and sits, as
    // far as he was going fast: eased, as his speed is)
    if (FORWARD.has(id) || id === 'start' || id === 'stop') {
      const go = clamp(this.accBody / GAIN_FULL, 0, 1) * ground;
      const brake = clamp(-this.accBody / GAIN_FULL, 0, 1) * ground * clamp(this.spLag / 10, 0, 1) * (1 - this.chop);
      P[I.lean] += Math.max(0, Math.min(GO_LEAN * go, GO_MOST - P[I.lean])) - BRAKE_LEAN * brake;
      P[I.hip] -= GO_SIT * go + BRAKE_SIT * brake;
      // (pulling up, his arms' swing dies, his chest stops turning over his hips and his feet go wider under him: he is
      // stopping, not running)
      if (brake > 0.02) {
        const b = brake * BRAKE_ARMS;
        if (P[I.gl] <= 0.5) P[I.lz] = REST_POSE[I.lz] + (P[I.lz] - REST_POSE[I.lz]) * (1 - b);
        if (P[I.gr] <= 0.5) P[I.rz] = REST_POSE[I.rz] + (P[I.rz] - REST_POSE[I.rz]) * (1 - b);
        P[I.twist] *= 1 - b;
        P[I.wide] += 0.12 * brake;
      }
    }
    // (his own carriage at a run: forward or upright, elbows tucked or out)
    if (FORWARD.has(id) && id !== 'walk') {
      const run = clamp((this.spLag - 6) / 8, 0, 1) * ground;
      P[I.lean] += this.runLean * run;
      if (P[I.gl] <= 0.5) P[I.lx] += this.elbowK * run;
      if (P[I.gr] <= 0.5) P[I.rx] += this.elbowK * run;
    }
  }

  /** His cloth and hair: two springs towed by his hips, a quick one and a heavy one, read in his own frame. */
  private trails(own: number) {
    const sec = Math.min(0.05, own / 1000);
    const j = this.j;
    const h = this.world(j[J.hips * 3], j[J.hips * 3 + 1], j[J.hips * 3 + 2], TMP);
    const tw = this.tw;
    const c = Math.cos(this.yaw);
    const sn = Math.sin(this.yaw);
    for (const [o, w, out] of [
      [0, 16, this.trail],
      [6, 9, this.trailSlow],
    ] as const) {
      const far = Math.hypot(tw[o] - h.x, tw[o + 1] - h.y, tw[o + 2] - h.z);
      if (sec <= 0 || far > 3 || !Number.isFinite(far)) {
        tw[o] = h.x;
        tw[o + 1] = h.y;
        tw[o + 2] = h.z;
        tw[o + 3] = tw[o + 4] = tw[o + 5] = 0;
      } else
        for (let a = 0; a < 3; a++) {
          const to = a === 0 ? h.x : a === 1 ? h.y : h.z;
          // (a little springy: it swings past and back once)
          tw[o + 3 + a] += ((to - tw[o + a]) * w * w - tw[o + 3 + a] * w * 1.1) * sec;
          tw[o + a] += tw[o + 3 + a] * sec;
        }
      const dx = tw[o] - h.x;
      const dz = tw[o + 2] - h.z;
      out.x = dx * c - dz * sn;
      out.y = tw[o + 1] - h.y;
      out.z = dx * sn + dz * c;
    }
  }

  /**
   * How he stands, for as long as he does: alert while the ball is live; at rest while it's dead, hands on his
   * hips or his weight on one leg, bent over with his hands on his knees when he's just run the floor or it's
   * late; and now and then a change.
   */
  private stand(d: Drive, own: number): ClipId {
    const rest = !!d.rest;
    // (and a breather taken as the buzzer went is over with it: see below)
    const fresh = !STANDING.has(this.clip) || rest !== this.resting || (!!d.over && this.idle === 'knees');
    this.standMs -= own;
    if (!fresh && this.standMs > 0) return this.idle;
    this.resting = rest;
    const r = hash(this.who, ++this.standN);
    const tired = Math.max(this.effort, d.tired ? TIRED_LATE : 0);
    // (the play is live and the ball isn't his: ready for it. Holding it, or between whistles, he stands as he stands)
    if (!rest) {
      if (d.act !== 'stand' && d.act !== 'move') this.idle = IDLES[Math.floor(r * IDLES.length)];
      else {
        // (near the ball he is loose or wanting it, by how much he likes to show his hands; on the far side he may stand
        // tall with his hands on his hips, or, late and blown, bend over with them on his knees)
        const far = !!d.look && Math.hypot(d.look.x - this.x, d.look.z - this.z) > WEAK_SIDE;
        const wants = this.wantsK * (far ? 0.4 : 1);
        if (far && tired > 0.35 && r < 0.22) this.idle = 'knees';
        else if (far && r < 0.32) this.idle = 'spot3';
        else this.idle = hash(this.who, 3000 + this.standN) < wants ? 'spot2' : 'spot';
      }
    }
    // (late in a close one a dead ball is a chance to get his breath: hands on his knees. Not once it is over: he is
    // shaking a hand or holding a teammate, and two bent over face to face put their heads together)
    else if (fresh && !d.over && (tired > 0.5 || (!!d.tired && r < 0.4))) this.idle = 'knees';
    else if (tired > 0.3) this.idle = r < 0.6 ? 'hips' : 'shift';
    else this.idle = r < 0.3 ? 'hips' : r < 0.65 ? 'shift' : r < 0.85 ? 'idle' : 'idle3';
    this.standMs = this.idle === 'knees' ? 1600 + r * 1200 : WAITS.has(this.idle) ? 3200 + r * 4400 : 2600 + r * 3200;
    return this.idle;
  }

  /** A gesture for his arms and head (see GESTURES): made as soon as his hands are free, or dropped if they aren't within `wait` ms. `mate`: whose hand he slaps for a five. */
  cue(id: Gesture, mate: Puppet | null = null, wait = 2500) {
    if (this.gest?.id === id || this.wish?.id === id) return;
    this.wish = { id, mate, age: 0, wait };
  }

  /** The gesture he's making, if any. */
  get gesturing(): Gesture | null {
    return this.gest?.id ?? null;
  }

  /**
   * A jumper's or a free throw's follow-through, held: how far it is (see held, which makes it his pose). A pass's: the
   * arms go on after the ball for PASS_HOLD ms of it, then are let go of over a beat (PASS_LET ms or so).
   */
  private follow(d: Drive, own: number) {
    const P = this.pose;
    const up = this.shot === 'jumper' || this.shot === 'freeThrow';
    const on = up && ((this.one !== null && this.one.tau > FOLLOW_FROM) || (this.one === null && d.act === 'release'));
    // (taken up and let go of as an arm is moved: easing into it and out of it, never off at full speed)
    [this.fw, this.fwv] = spring(this.fw, this.fwv, on ? 1 : 0, EASE_OVER / (on ? FOLLOW_IN : 240), own / 1000);
    this.fw = clamp(this.fw, 0, 1);
    const pass = this.one && PASS_FOLLOW[this.one.id] ? this.one : null;
    if (pass) this.passed = pass.id;
    const going = !!pass && pass.tau > PASS_FROM && pass.tau < PASS_HOLD;
    [this.pw, this.pwv] = spring(this.pw, this.pwv, going ? 1 : 0, EASE_OVER / (going ? 60 : PASS_LET), own / 1000);
    this.pw = clamp(this.pw, 0, 1);
    const key = PASS_FOLLOW[this.passed];
    if (this.pw < 0.005 || !key) return;
    for (const c of ARM_AT) {
      const v = key[CHANNELS[c] as keyof typeof key];
      if (v !== undefined) P[c] += (v - P[c]) * this.pw;
    }
  }

  /**
   * The held follow-through, as his pose: his shooting arm up after the ball, and his guide hand where the ball left
   * it, beside the line it went on and by his brow, its elbow down under it, until the ball gets there (see follow).
   * It is the pose itself, taken up and let go of by its own spring: laid on the clip as something added to it, it
   * had to chase a clip whose arms drop to his sides a fifth of a second after the release, and both arms sank to
   * his waist and came back up. And it is held on the shot's line, not his chest's (FOLLOW): his hands are put where
   * that has them and then read from his shoulders as his chest is turned now, so they stay over the line while he
   * turns under them. The form is his own: held high and still; let fall as he lands; reached up after a high one;
   * both hands gone out after a push. How far his guide hand drifts out from the line is his too (guideK).
   */
  private held() {
    const k = this.fw;
    if (k < 0.005) return;
    const P = this.pose;
    const [rx, ry, rz] = FOLLOW.r;
    const [lx, ly, lz] = FOLLOW.l;
    // (each hand from the middle of his chest: out to its own side of the line, up, on toward the rim)
    const R = HELD_R;
    const L = HELD_L;
    R[0] = rx;
    R[1] = ry;
    R[2] = rz;
    L[0] = lx + GUIDE_OUT * this.guideK;
    L[1] = ly;
    L[2] = lz;
    if (this.shot === 'jumper') {
      const late = this.one ? smooth(clamp((this.one.tau - 230) / 200, 0, 1)) : 1;
      if (this.form === 0) L[1] -= 0.08;
      else if (this.form === 1) {
        R[1] -= 0.55 * late;
        R[2] += 0.25 * late;
        L[1] -= 0.55 * late;
        L[2] += 0.1 * late;
      } else if (this.form === 2) {
        R[1] += 0.14;
        R[2] -= 0.15;
        L[1] += 0.22;
        L[2] -= 0.1;
      } else {
        R[1] -= 0.55;
        R[2] += 0.45;
        L[0] = 0.42;
        L[1] = 0.82;
        L[2] = 1.5;
      }
    }
    // (his shoulders, as his chest is turned: its left is his own turned by the twist, the left one going back)
    const ct = Math.cos(P[I.twist]);
    const st = Math.sin(P[I.twist]);
    const sw = SHOULDER * (0.92 + 0.08 * this.body.bulk) * (this.body.shoulders ?? 1);
    const H = HELD;
    let [vx, vz] = [L[0] - sw * ct, L[2] + sw * st];
    H[I.lx] = vx * ct - vz * st;
    H[I.ly] = L[1];
    H[I.lz] = vx * st + vz * ct;
    [vx, vz] = [sw * ct - R[0], R[2] - sw * st];
    H[I.rx] = -(vx * ct - vz * st);
    H[I.ry] = R[1];
    H[I.rz] = vx * st + vz * ct;
    for (const c of HELD_AT) P[c] += (H[c] - P[c]) * k;
    // (an elbow's swing round its arm is an angle: taken the short way round)
    P[I.lsw] += wrap(FOLLOW.lsw - P[I.lsw]) * k;
    P[I.rsw] += wrap(FOLLOW.rsw + 0.3 * this.elbowSet - P[I.rsw]) * k;
  }

  /** How far his follow-through is held now (0: not at all, 1: all of it): his shooting hand's wrist stays dropped over for as long (figure.ts FLICK). */
  get following(): number {
    return this.fw;
  }

  /** His arms (and a little of his head) taken over by the gesture he's making, eased in and out of whatever he's doing. */
  private gesture(d: Drive, own: number) {
    const P = this.pose;
    this.reach = null;
    // (busy: the ball in his hands, a shot or a catch, off the floor)
    const busy = d.ball || (this.one !== null && this.one.id !== 'bump') || P[I.air] > 0.3;
    if (this.wish) {
      this.wish.age += own;
      if (!busy && !this.gest) {
        // (a five is slapped with the hand nearer him)
        const mate = this.wish.mate;
        this.gest = { id: this.wish.id, t: 0, mate, w: 0, side: mate && this.local(mate.x, mate.z)[0] > 0 ? 1 : -1 };
        this.wish = null;
      } else if (this.wish.age > this.wish.wait) this.wish = null;
    }
    const g = this.gest;
    if (!g) return;
    const c = GESTURES[g.id];
    g.t += own;
    const [, end] = span(c);
    if (g.t >= end) {
      this.gest = null;
      return;
    }
    // (in over its first key, out over its last; let go at once if the ball comes to him)
    const into = c.at[1];
    const outOf = end - c.at[c.at.length - 2];
    const env = smooth(clamp(g.t / into, 0, 1)) * smooth(clamp((end - g.t) / outOf, 0, 1));
    g.w += ((busy ? 0 : env) - g.w) * (busy ? 1 - Math.exp(-own / 60) : 1);
    if (busy && g.w < 0.02) {
      this.gest = null;
      return;
    }
    sample(c, g.t, G);
    // (a five is slapped with the hand nearer him: it changes hands only once he is well over to the other side, and
    // then the two hands trade places as hands do, see toward; reaching across his face, the elbow would flip over)
    if (g.mate) {
      const [mx] = this.local(g.mate.x, g.mate.z);
      if (mx * g.side < -FIVE_SWAP * this.body.s) g.side = g.side > 0 ? -1 : 1;
    }
    const side = g.side;
    if (g.mate) {
      if (side > 0) mirror(G);
      // (where the two hands meet: between them, above their heads, moving with them)
      const peak = clamp(1 - Math.abs(g.t - 360) / 220, 0, 1);
      this.reach = { x: (this.x + g.mate.x) / 2, y: 7.3 * ((this.body.s + g.mate.body.s) / 2), z: (this.z + g.mate.z) / 2, w: smooth(peak) * g.w, side };
    }
    for (const k of ARMS) P[k] += (G[k] - P[k]) * g.w;
    for (const k of TRUNK) P[k] += (G[k] - REST_POSE[k]) * g.w;
  }

  /**
   * A man waiting off the ball, his own way (see WAITS): sat down his own amount; his weight on one leg, held there a
   * while (his own while, never the same twice) and then put over onto the other, or back between them, swung over
   * and settled as a body's weight is, not rocked from side to side on a beat; his hands never quite still. Out of
   * it, his weight comes back between his feet.
   */
  private wait(d: Drive, id: ClipId, own: number, t: number, ph: number) {
    const P = this.pose;
    const waiting = WAITS.has(id) && !this.one && !d.ball;
    if (waiting && (this.weightIn -= own) <= 0) {
      const q = hash(this.who, 1000 + ++this.weightN);
      const q2 = hash(this.who, 2000 + this.weightN);
      const side = this.weightTo >= 0 ? 1 : -1;
      // (over onto the other leg, mostly; now and then back between them, or harder onto the one he is on)
      this.weightTo = q < 0.68 ? -side * (0.65 + 0.35 * q2) : q < 0.86 ? side * 0.15 * q2 : side;
      this.weightIn = (WEIGHT_HOLD[0] + (WEIGHT_HOLD[1] - WEIGHT_HOLD[0]) * q2) * this.weightSlow;
    }
    const to = waiting ? this.weightTo : 0;
    const w = 1000 / WEIGHT_MS;
    const k = Math.min(own, 50) / 1000;
    this.weightV += ((to - this.weightAt) * w * w - 2 * w * this.weightV) * k;
    this.weightAt += this.weightV * k;
    // (his hips go over the foot he is on as weigh puts them; his chest leans back the other way over it)
    P[I.tilt] -= WEIGHT_TILT * clamp(this.weightAt * this.weightK, -1, 1);
    if (!waiting) return;
    P[I.hip] -= this.waitLow;
    // (his hands: never quite still, each on its own slow time)
    P[I.lz] += 0.035 * Math.sin(t * 0.83 + ph);
    P[I.rz] += 0.035 * Math.sin(t * 0.67 + ph * 2.3);
    P[I.ly] += 0.025 * Math.sin(t * 0.59 + ph * 3.1);
    P[I.ry] += 0.025 * Math.sin(t * 0.71 + ph * 1.7);
  }

  /**
   * What keeps a man alive between the moves the plan gives him: his breath (deeper and quicker the harder he
   * has been going), a defender's hands that are never still and the little reset he makes in his stance,
   * and the lean of starting and stopping.
   */
  private life(d: Drive, id: ClipId, sp: number, vf: number, own: number) {
    const P = this.pose;
    const k = own / 1000;
    this.effort = clamp(this.effort + (sp > 12 ? k * sp * EFFORT_UP : -k * EFFORT_DOWN), 0, 1);
    const tired = Math.max(this.effort, d.tired ? TIRED_LATE : 0);
    this.breath += k * (0.24 + 0.42 * tired);
    const b = Math.sin(this.breath * Math.PI * 2);
    const deep = (BREATH + BREATH_HARD * tired) * (STILL.has(id) ? 1 : 0.3);
    P[I.lean] -= b * deep;
    P[I.nod] += b * deep * 0.6;
    if (!d.ball && !this.one) {
      P[I.ly] += b * deep * 0.9;
      P[I.ry] += b * deep * 0.9;
    }
    const t = this.loopT / 1000;
    const ph = this.who * 0.37;
    this.wait(d, id, own, t, ph);
    if (id === 'stance' || id === 'ready' || id === 'shuffle') {
      const a = FLUTTER * (id === 'shuffle' ? 0.5 : 1);
      P[I.ly] += a * Math.sin(t * 10.7 + ph);
      P[I.lz] += a * 0.7 * Math.sin(t * 8.3 + ph * 2);
      P[I.ry] += a * Math.sin(t * 11.9 + ph * 3);
      P[I.rz] += a * 0.7 * Math.sin(t * 7.6 + ph * 5);
      if (id !== 'shuffle' && (this.resetIn -= own) <= 0) {
        this.resetT = 0;
        this.resetIn = 2200 + hash(this.who, this.standN++) * 2400;
      }
    }
    // (off the ball, the arm nearer it is out in the lane to it; a little, or a lot, by the man)
    let deny = 0;
    if (id === 'ready' && d.look && !this.one) {
      const [lx, lz] = this.local(d.look.x, d.look.z);
      const round = Math.atan2(lx, lz);
      deny = Math.sign(round) * smooth(clamp((Math.abs(round) - 0.35) / 0.6, 0, 1)) * (0.45 + 0.55 * hash(this.who, 33));
    }
    this.deny += (deny - this.deny) * (1 - Math.exp(-own / 260));
    if (Math.abs(this.deny) > 0.01) {
      const [ax, ay, az] = this.deny > 0 ? [I.lx, I.ly, I.lz] : [I.rx, I.ry, I.rz];
      const w = Math.abs(this.deny);
      P[ax] += (DENY[0] - P[ax]) * w;
      P[ay] += (DENY[1] - P[ay]) * w;
      P[az] += (DENY[2] - P[az]) * w;
    }
    if (this.resetT < 340) {
      this.resetT += own;
      P[I.hip] -= 0.08 * Math.sin((Math.PI * Math.min(340, this.resetT)) / 340);
    }
    // (starting he leans into it, stopping back against it; not in a shot or in the air)
    const gained = vf - this.vfLag;
    this.vfLag += gained * (1 - Math.exp(-own / 220));
    // (as much as he is about to gain, where the plan says: into his first step as he takes it, back before he has slowed)
    const gain = this.led ? this.urge * LED_LEAN : gained;
    // (no more than his speed gives him: a man stepping off leans a little, one setting off at a run a lot)
    // (and as much as the speed he is getting up to gives him: one setting off hard leans into his very first step)
    const cap = LEAN_MAX * clamp(Math.max(sp, this.spLag, this.going(sp)) / LEAN_FULL, 0.25, 1);
    const want = this.one || P[I.air] > 0.2 ? 0 : clamp(gain * LEAN_GO, -cap * 0.75, cap);
    this.leanGo += (want - this.leanGo) * (1 - Math.exp(-own / 90));
    P[I.lean] += this.leanGo;
    // (round a bend he leans into it: by how hard his path is turning, never from a stop or a start)
    let bank = 0;
    if (own > 0 && sp > 6 && !this.one && P[I.air] < 0.2) {
      const [, , sx, sz] = this.dirs();
      const across = this.led ? this.curve : (((this.lvx - this.pvx) * sx + (this.lvz - this.pvz) * sz) * 1e6) / own;
      bank = clamp(-across * BANK, -BANK_MAX, BANK_MAX);
    }
    // (a hard cut at a run: he plants his outside foot and sinks over it, his head still on the way he was going for a beat)
    if (own > 0 && sp > 9 && !this.one && !d.ball && P[I.air] < 0.2 && this.plantT > PLANT_MS + 250) {
      const [, , sx, sz] = this.dirs();
      const across = (((this.lvx - this.pvx) * sx + (this.lvz - this.pvz) * sz) * 1e6) / own;
      if (Math.abs(across) > PLANT_AT) {
        this.plantT = 0;
        this.plantSide = Math.sign(across);
        // (how he makes it: his own way, and what the cut asks)
        const r = hash(this.who, 700 + ++this.cuts);
        const like = hash(this.who, 71) - 0.5;
        // (with a man against him or right by him it is the plain plant: no room to throw his hips over a foot)
        const tight = this.felt > 0.05 || this.room < CUT_ROOM * this.body.s;
        this.cutKind = tight ? 3 : Math.abs(across) > PLANT_HARD ? (r < 0.6 + 0.3 * like ? 0 : 2) : r < 0.55 - 0.3 * like ? 1 : 0;
        if (this.cutKind === 2) this.stutterMs = STUTTER_MS;
      }
    }
    this.pvx = this.lvx;
    this.pvz = this.lvz;
    this.bank += (bank - this.bank) * (1 - Math.exp(-own / (this.led ? BANK_LED_MS : BANK_MS)));
    P[I.tilt] += this.bank;
    P[I.proll] += this.bank * 0.4;
    if (this.plantT < PLANT_MS) {
      this.plantT += own;
      const u = Math.min(1, this.plantT / PLANT_MS);
      // (sinking from the first frame of it, not dropped into it)
      const w = Math.sin(Math.PI * Math.pow(u, 0.7)) * smooth(clamp(u / 0.25, 0, 1));
      const K = CUTS[this.cutKind];
      P[I.hip] -= PLANT_SINK * K.sink * w;
      P[I.sway] += 0.16 * K.sway * this.plantSide * w;
      P[I.turn] += 0.4 * K.head * this.plantSide * w * (1 - u);
      P[I.twist] += 0.14 * K.head * this.plantSide * w * (1 - u);
      // (and out of it, over its second half: his chest into the new way, up off the foot, the arm on that side through)
      const out = smooth(clamp((u - 0.38) / 0.22, 0, 1)) * (1 - smooth(clamp((u - 0.72) / 0.28, 0, 1))) * K.out;
      if (out > 0) {
        P[I.lean] += 0.08 * out;
        P[I.tilt] -= 0.05 * this.plantSide * out;
        const [g, az, ay] = this.plantSide > 0 ? [I.gr, I.rz, I.ry] : [I.gl, I.lz, I.ly];
        if (P[g] <= 0.5) {
          P[az] += 0.32 * out;
          P[ay] += 0.14 * out;
        }
      }
    } else this.plantT += own;
    // (short quick steps under him, into a cut or a stop: sat into them)
    this.stutterMs -= own;
    this.stutter += ((this.stutterMs > 0 ? 1 : 0) - this.stutter) * (1 - Math.exp(-own / STUTTER_EASE));
    if (this.stutter > 0.02) {
      P[I.hip] -= CHOP_SIT * 0.5 * this.stutter;
      P[I.wide] += 0.05 * this.stutter;
    }
    // (closing out: sat down into his short steps, a hand coming up at the man)
    if (this.chop > 0.02) {
      const w = this.chop;
      P[I.hip] -= CHOP_SIT * w;
      P[I.lean] -= 0.07 * w;
      P[I.rx] += (0.2 - P[I.rx]) * w * 0.7;
      P[I.ry] += (1.05 - P[I.ry]) * w * 0.7;
      P[I.rz] += (0.95 - P[I.rz]) * w * 0.7;
    }
    // (on his way up the floor with nothing to do yet, he says something to a teammate or points him somewhere)
    if (
      (id === 'walk' || id === 'jog') &&
      sp < 9 &&
      !d.ball &&
      !this.one &&
      !this.gest &&
      !this.wish &&
      !d.over &&
      (d.act === 'move' || d.act === 'stand') &&
      (this.talkIn -= own) <= 0
    ) {
      const r = hash(this.who, 300 + this.standN++);
      this.talkIn = TALK_EVERY * (0.5 + r);
      if (r < 0.75) this.cue(r < 0.5 ? 'talk' : 'direct', null, 300);
    }
    // (after the buzzer each man goes on with it his own way, a beat at a time and on his own clock: a fist, a roar, a
    // point at the crowd, a clap for the winners; a hand to his brow or his shorts, his hands on his head, for the others.
    // Never ten men frozen in the one pose)
    if (d.over) {
      this.overT += own;
      if (!this.gest && !this.wish && !this.one && this.overT >= this.encoreAt) {
        const n = this.standN++;
        this.encoreAt = this.overT + ENCORE_MS * (0.55 + hash(this.who, 500 + n) * 0.9);
        const pool = GLAD.has(id) ? GLAD_BEATS : SORE.has(id) ? SORE_BEATS : null;
        if (pool && hash(this.who, 600 + n) < (pool === GLAD_BEATS ? 0.8 : 0.55)) this.cue(pool[Math.floor(hash(this.who, 700 + n) * pool.length)], null, 900);
      }
    } else {
      this.overT = 0;
      this.encoreAt = ENCORE_FIRST * (0.6 + hash(this.who, 499) * 0.8);
    }
    // (left to himself with a dead ball he wipes his brow or pulls at his shorts)
    if (this.gest || this.wish || d.ball || this.one || d.over) return;
    if (d.rest && STANDING.has(id) && id !== 'knees' && (this.fidgetIn -= own) <= 0) {
      this.fidgetIn = FIDGET_EVERY * (0.5 + hash(this.who, this.standN++));
      this.cue(tired > 0.35 && hash(this.who, this.standN) < 0.6 ? 'wipe' : 'tug', null, 400);
    }
  }

  /**
   * Where he looks: his head turns to the thing (Drive.look), his chest a little with it when his hands are
   * free, and up or down to it. Eased on the clock as a heading on the floor, so his eyes stay on it as his
   * body turns; a runner keeps his eyes nearer the way he's going, and a thing behind him isn't looked for.
   */
  private gaze(d: Drive, ease: number, sp: number) {
    const P = this.pose;
    const { s } = this.body;
    let to = this.yaw;
    let pitch = 0;
    this.lookFar = Infinity;
    if (d.look) {
      const dx = d.look.x - this.x;
      const dz = d.look.z - this.z;
      const flat = Math.hypot(dx, dz);
      const head = Math.atan2(dx, dz);
      if (flat > 0.8 && Math.abs(wrap(head - this.yaw)) < LOOK_BACK) {
        to = head;
        const eye = (HIP + TORSO + 0.6 + Math.max(-0.8, P[I.hip])) * s;
        pitch = Math.atan2(d.look.y - eye, flat);
        this.lookFar = Math.hypot(flat, d.look.y - eye);
        Object.assign(this.seen, d.look);
      }
    }
    const sec = ease / 1000;
    // (how far round he looks narrows as he gets up to a run, it doesn't jump)
    this.lim += ((sp > 14 ? LOOK_RUN : LOOK_MAX) - this.lim) * (1 - Math.exp(-ease / 220));
    const lim = this.lim;
    // (his head on his shoulders before, to turn it no faster than a neck does)
    const was = wrap(this.gw - this.yaw);
    if (sec > 0) {
      const w = 2 / GAZE_S;
      [this.gw, this.gwv] = spring(this.gw, this.gwv, this.gw + wrap(to - this.gw), w, sec);
      [this.gp, this.gpv] = spring(this.gp, this.gpv, clamp(pitch, -0.55, 0.75), w, sec);
    }
    // (never wound round farther than he can look)
    const most = sec > 0 ? HEAD_RATE * sec : Infinity;
    const rel = clamp(clamp(wrap(this.gw - this.yaw), was - most, was + most), -lim, lim);
    this.gw = this.yaw + rel;
    // (his chest goes with it as his hands come free, and comes back as they're taken: eased, not in a frame)
    const free = !d.ball && !this.one ? 1 - clamp(P[I.air], 0, 1) : 0;
    this.freed += (free - this.freed) * (1 - Math.exp(-ease / FREE_MS));
    const chest = clamp(rel * CHEST_SHARE, -CHEST_MAX, CHEST_MAX) * this.freed;
    // (the head is turned from where his chest faces, which his clip may be swinging: it stays on the thing)
    P[I.turn] += clamp(rel - chest - P[I.twist], -HEAD_MAX, HEAD_MAX);
    P[I.twist] += chest;
    // (whatever his body and his chest are doing under it, a spin on his heel or a clip that swings his shoulders,
    // his head comes round no faster than a head does: the neck gives what is over)
    const head = this.yaw + P[I.twist] + P[I.turn];
    if (sec > 0 && this.headed) {
      const d = wrap(head - this.headWas);
      const cap = HEAD_WHIP * sec;
      if (Math.abs(d) > cap) P[I.turn] = clamp(P[I.turn] - (d - Math.sign(d) * cap), -HEAD_MAX - HEAD_GIVE, HEAD_MAX + HEAD_GIVE);
    }
    this.headWas = this.yaw + P[I.twist] + P[I.turn];
    this.headed = true;
    P[I.nod] += clamp(this.gp, -0.55, 0.75) * 1.05;
  }

  /** Both feet under him, planted. */
  private settle() {
    this.catchK = -1;
    this.wideE = Number.NaN;
    this.downE = 0.5;
    this.strideV = 0;
    this.linedE = 0;
    this.paceE = 0;
    this.liftE = 0.3 * this.body.s;
    const [, , sx, sz] = this.dirs();
    const w = (HIP_W + 0.08) * this.body.s;
    this.feet.forEach((f, k) => {
      const side = k ? 1 : -1;
      f.x = this.x + sx * w * side;
      f.z = this.z + sz * w * side;
      f.up = 0;
      f.swing = false;
      f.n = NaN;
      f.pitch = 0;
      f.wide = 0;
      f.yaw = this.yaw - side * TOE_OUT;
      f.turn = -side * TOE_OUT;
      f.heel = 0;
      f.lift = 0;
    });
    // (put somewhere new: how fast his hips were going is no rise of his, nor how fast he went a stop to take; his weight is on both feet)
    this.hipWas = Number.NaN;
    [this.spW, this.slowing, this.loadL, this.overW, this.absorbK, this.absorbK0] = [0, 0, 0.5, 0, 0, 0];
    this.downWas = [true, true];
  }

  /**
   * The gait: one foot swings to where the next stride will need it while the other stays where it landed.
   * His feet turn over as a man's do for his speed (a walker's two steps a second, a sprinter's four and a
   * half), and no faster: what a planted foot can't cover he covers in the air between strides.
   */
  private step(dt: number, sp: number) {
    const { s } = this.body;
    // (the way his legs go: his hips may have opened ahead of him, see LEAD_FROM)
    const [hx, hz, sx, sz] = this.legDirs();
    const [lc, ls] = [Math.cos(this.hipLead), Math.sin(this.hipLead)];
    const vfL = this.vf * lc - this.vs * ls;
    const vsL = this.vs * lc + this.vf * ls;
    // (how wide he stands, followed: see WIDE_MS)
    this.wideE = !Number.isFinite(this.wideE) ? this.pose[I.wide] : this.wideE + clamp((this.pose[I.wide] - this.wideE) * (1 - Math.exp(-dt / WIDE_MS)), -WIDE_FRAME, WIDE_FRAME);
    // (going ahead his feet come down nearer under his middle the faster he goes, as a runner's do: see STRIDE_NARROW)
    const lined = this.vf > 0.6 * sp && this.strode ? STRIDE_NARROW * smooth(clamp((sp - 3) / 9, 0, 1)) * (1 - clamp(this.felt, 0, 1)) : 0;
    this.linedE += (lined - this.linedE) * (1 - Math.exp(-dt / STRIDE_MS));
    const w = (HIP_W + 0.08 + this.wideE * 0.6) * s * (1 - this.linedE);
    // (a hard knock's step: that foot's place is out the way he was pushed until it is put down there)
    if (this.catchK >= 0 && (this.catchMs -= dt) <= 0 && !this.feet[this.catchK].swing) this.catchK = -1;
    // (where each foot goes under him: out in front of him, or behind, as his footwork has it (see ahead), and to the
    // side his hips go in a euro)
    const fore = this.ahead(dt);
    const out = this.euro && this.one?.id === 'layup' ? (this.pose[I.sway] * EURO_WIDE * s) / 0.4 : 0;
    // (a knock's step, once his body has taken it: see CATCH_LAG)
    const ck = this.catchK >= 0 && CATCH_MS - this.catchMs >= CATCH_LAG ? this.catchK : -1;
    const homeX = (k: number) => this.x + sx * (w * (k ? 1 : -1) - out) + hx * fore[k] * s + (k === ck ? this.catchX : 0);
    const homeZ = (k: number) => this.z + sz * (w * (k ? 1 : -1) - out) + hz * fore[k] * s + (k === ck ? this.catchZ : 0);
    // (where each foot's toes point, standing square: a little out from the way he faces)
    const nat = (k: number) => this.yaw + this.hipLead + (k ? -TOE_OUT : TOE_OUT);
    // (how far a foot on the floor is turned out from that, past what his hip and knee take: in, under 0. How far that
    // is goes by how he stands: see STANCE_OUT)
    const outOf = (f: Foot, k: number) => wrap(f.yaw - nat(k)) * (k ? -1 : 1);
    const [turnOut, turnIn] = this.turns();
    const twisted = (f: Foot, k: number) => {
      const o = outOf(f, k);
      return k !== this.pivotK && (o > turnOut + FOOT_STEP || o < -turnIn - FOOT_STEP);
    };
    // (a foot he keeps down whatever: his pivot, or both as he loads a jump, once there is no time left to step one)
    // (and off one foot, the foot he goes up off, once it is down in the last TAKE_HOLD ms before he leaves the floor: it
    // is the one he leaves it off, never lifted early into a hop off neither)
    const kept = (k: number) =>
      this.pose[I.air] < 0.5 && (k === this.pivotK || (this.loading && !this.gathering) || (k === this.lockK && this.lockMs >= 0 && this.lockMs < TAKE_HOLD));
    // (how fast his hips are going up, ft a second on the 6 ft 6 puppet: see TAKE_RATE)
    const rise = dt > 0 && !Number.isNaN(this.hipWas) ? ((this.pose[I.hip] - this.hipWas) * 1000) / dt : 0;
    this.hipWas = this.pose[I.hip];
    // (body to body, he keeps his feet under him: short quick steps, as soon as one is a little out of place)
    const held = smooth(clamp(this.felt, 0, 1)) * (1 - clamp(this.pose[I.air] / 0.3, 0, 1));
    const going = sp > 1.2;
    const ahead = vfL > 0.6 * sp;
    const back = vfL < -0.45 * sp;
    // steps a second: a walk's, easing into a run's (whose steps stop growing near a sprint: see RUN_RATE)
    const rateAt = (v: number) => {
      const walk = 1.45 + 0.1 * v;
      const run = RUN_RATE + (v - RUN_FROM) * RUN_RISE + RUN_TOP * Math.max(0, v - SPRINT_FROM) ** 2;
      return Math.min(4.6, walk + (run - walk) * smooth(clamp((v - 5.5) / 3.5, 0, 1)));
    };
    // (getting going, his feet turn over as for the speed he is getting up to: short quick driving steps. Pulling up,
    // quicker still for his speed. Closing out, shorter and quicker than either. A dribbler's feet keep his bounce's time)
    const urged = ahead && !this.has && this.chop < 0.5;
    const soon = urged ? sp + clamp(this.accBody, 0, GAIN_FULL) * GAIN_AHEAD : sp;
    const brake = urged ? BRAKE_RATE * clamp(-this.accBody / GAIN_FULL, 0, 1) : 0;
    const chopK = this.tempo * (1 + (CHOP_RATE - 1) * Math.max(this.chop, this.stutter));
    // (his legs' stride for that speed, as a man his size takes it: see stride.ts)
    this.strideV += (soon - this.strideV) * (1 - Math.exp(-dt / STRIDE_MS));
    const G = strideAt(scaled(this.strideV, s), this.gait);
    // (and his first steps from a stand quicker again: short, driving ones, up to DRIVE_RATE more of them, gone by DRIVE_UNTIL ft a second)
    const quick = urged ? DRIVE_RATE * this.driveK * clamp(this.accBody / GAIN_FULL, 0, 1) * clamp(1 - sp / DRIVE_UNTIL, 0, 1) : 0;
    // (planting for a cut: a beat on the foot he plants)
    const planting = this.plantT < PLANT_MS ? Math.sin((Math.PI * this.plantT) / PLANT_MS) : 0;
    // (and no two of his strides quite alike: each a little longer or shorter than the last, as a man's are)
    // (not at 4x, where a stride is four frames: see BOB_FAST)
    const fast4 = clamp((this.ownMs - BOB_FROM_MS) / (BOB_FAST_MS - BOB_FROM_MS), 0, 1);
    // (nor getting going or pulling up, where each step is driven or braked: an even run's)
    const even1 = 1 - clamp((Math.abs(this.accBody) / GAIN_FULL) * 3, 0, 1);
    // (each the difference of two draws, this stride's and the last's: over a few strides they come to his even run's)
    const sn = Math.floor(this.phase) % 97;
    const own1 = 1 + (hash(this.who, 500 + sn) - hash(this.who, 500 + ((sn + 96) % 97))) * 0.5 * STRIDE_JIT * (1 - fast4) * even1;
    const rate = Math.min(4.6, rateAt(soon) * (1 + brake + quick) * own1) * chopK * (1 - PLANT_SLOW * planting);
    // (backing up or sliding he takes short quick steps: a long one would cross his feet or turn his hips)
    // (sliding, shorter and quicker still: a slide's step is a push and a close, see SLIDE_REACH)
    const slides = !ahead && !back && Math.abs(vsL) > Math.abs(vfL);
    const reachOf = ahead ? Infinity : (back ? 2.4 : slides ? SLIDE_REACH * this.slideK : 2) * s;
    // (a step round his pivot, or into his load, goes when its foot is any way out of place: there is no time to wait)
    const awayAt = (this.pivotK >= 0 || this.gathering ? CONTACT_AWAY : 0.5 + (CONTACT_AWAY - 0.5) * held) * s;
    const away = (f: Foot, k: number) => !kept(k) && (k === ck || Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > awayAt || twisted(f, k));
    let cadence = going ? Math.min(Math.max(rate, sp / reachOf), 6.5) : 0;
    // standing: a foot left out of place (or caught mid-step, or turned past what he can turn over it) takes one step
    // home, and then both stay down; body to body, quicker; round his pivot or into his load, quicker again
    if (!going && this.feet.some((f, k) => f.swing || away(f, k))) cadence = this.gathering ? LOAD_RATE : this.pivotK >= 0 ? PIVOT_RATE : 3.4 + (CONTACT_RATE - 3.4) * held;
    // (just down from a jump, stood, he takes his weight on both feet before either steps)
    if (!going && this.giveT < LAND_STILL && !this.feet.some((f) => f.swing)) cadence = 0;
    // (stepping into a load on the move, his steps are gather steps: quick, so each is down before he goes up)
    if (going && this.gathering) cadence = Math.max(cadence, LOAD_RATE);
    // (from one rate to the next over a few frames; from a stand, stood again, driving off, round his pivot or into his
    // load, at once: see CADENCE_MS)
    if (cadence > 0 && this.cadE > 0 && !(quick > 0 && cadence > this.cadE) && this.pivotK < 0 && !this.gathering)
      cadence = this.cadE += (cadence - this.cadE) * (1 - Math.exp(-dt / CADENCE_MS));
    else this.cadE = cadence;
    // (off one foot, his last steps are timed to the jump: the foot he goes up off is down at the end of its time on the
    // floor as he leaves it, the other on its way through, his knee driving: whichever comes, for a running leap)
    if (going && this.lockK !== -1 && this.lockMs > dt) {
      const at = this.phase + (cadence * this.lockMs) / 2000;
      const end = 1 - this.downE * 0.4 - (this.lockK === 1 ? 0.5 : 0);
      const to = this.lockK === -2 ? end + 0.5 * Math.round((at - end) / 0.5) : end + Math.round(at - end);
      cadence = clamp(((to - this.phase) * 2000) / this.lockMs, cadence * (1 - STEP_SLOW), cadence * (1 + STEP_QUICK));
    }
    const cycle = cadence ? 2 / cadence : 0;
    // (setting off sideways from a stand, the foot on the side he goes leaves first: a slide's lead foot, a beaten
    // man's drop step)
    // (by how he is going this frame: vf and vs are last frame's)
    const across = this.vx * sx + this.vz * sz;
    const sideways = Math.abs(across) > Math.abs(this.vx * hx + this.vz * hz) && sp > 1.2;
    const lead = across > 0 ? 1 : 0;
    // (the other still down: its stride not yet begun, however short a time each foot is down)
    if (going && !this.wasGoing && sideways && !this.feet.some((f) => f.swing)) this.phase = Math.ceil(this.phase + lead * 0.5) - lead * 0.5 + Math.max(0, 0.51 - this.downE);
    this.wasGoing = going;
    // (a foot to be stepped now, round his pivot or into his load, both down: its stride starts this frame)
    if (!going && (this.pivotK >= 0 || this.gathering) && !this.feet.some((f) => f.swing)) {
      const k = this.feet.findIndex((f, n) => away(f, n));
      if (k >= 0) this.phase = Math.ceil(this.phase + (k ? 0.5 : 0)) - (k ? 0.5 : 0);
    }
    // (just down from a jump, both feet on the floor: his stride takes up from there, the foot ahead down for its
    // share of it and the other swinging through from where it landed, never partway through a step it never took)
    if (this.landed) {
      this.landed = false;
      const fore = (this.feet[1].x - this.feet[0].x) * this.vx + (this.feet[1].z - this.feet[0].z) * this.vz > 0;
      // (off one foot, the one he comes down on first; else the one ahead)
      const lead = (this.foot ? (this.foot > 0 ? 0 : 1) : fore ? 1 : 0) * 0.5;
      this.phase = Math.round(this.phase + lead) + (1 - this.downE) - lead;
      for (const f of this.feet) f.n = NaN;
    }
    // (stood, he takes it now: that foot's stride starts this frame)
    if (ck >= 0 && !going && !this.feet[ck].swing && !this.feet[1 - ck].swing) this.phase = Math.ceil(this.phase + (ck ? 0.5 : 0)) - (ck ? 0.5 : 0);
    this.phase += cadence ? dt / 1000 / cycle : 0;
    // how much of its stride a foot is down: a walker's more than half, a runner's only as long as it can stay under him
    // (less in a crouch: a bent leg reaches less far)
    const crouch = 1 + Math.min(0, this.pose[I.hip] + 0.13) * 0.6;
    // (each eased: setting off, pulling up or slowing to a jog, a foot in the air finishes its step as a step, it isn't
    // thrown up higher or slammed down in a frame as his speed changes under it)
    const ke = 1 - Math.exp(-dt / STRIDE_MS);
    // (how much of it a foot is down goes by his stride at an even run for his speed: getting going or pulling up his
    // feet only turn over quicker, a swing is never cut short)
    const even = going ? 2 / Math.min(Math.max(rateAt(sp) * chopK, sp / reachOf), 6.5) : cycle;
    // (getting going hard from a stand he drives: each foot down longer, pushing, as a sprinter's first steps are, so
    // his first swing is short and quick; by DRIVE_UNTIL it is an even run's)
    const drive = urged ? DRIVE_DOWN * clamp(this.accBody / GAIN_FULL, 0, 1) * clamp(1 - sp / DRIVE_UNTIL, 0, 1) : 0;
    // (and as he gets up to speed it shrinks to a runner's no quicker than over DOWN_DROP_MS: a swing isn't stretched
    // by much under its foot, his steps grow one by one)
    // (going ahead a foot is down as long as a runner's is at his speed, and covers what floor that takes it over: see
    // stride.ts. Backing up or sliding, CONTACT of it)
    // (played at 4x a stride is four or five drawn frames, and a runner's, sampled that few times, is a leg straight
    // behind him in one frame and shut under him in the next. There his legs are stepped compactly, as they are backing
    // up: down over CONTACT under his hips, swung straight through, the heel low. At 2x and under, a runner's as measured)
    const strides = ahead && fast4 < STRIDE_UNTIL;
    this.strode = strides;
    const reachFt = (strides ? downOver(G) : CONTACT) * s * crouch;
    const downTo = going ? Math.max(drive, clamp(reachFt / (sp * even), 0.08, slides ? SLIDE_DOWN : DOWN_WALK)) : 0.5;
    this.downE += (downTo - this.downE) * (downTo < this.downE ? 1 - Math.exp(-dt / DOWN_DROP_MS) : ke);
    // (how much floor that is, as he is going now: under a walk's pace his feet turn over no slower, and are down over less)
    // (stopped under a foot still in the air, none: it comes down under him)
    const coverFt = going && cycle ? Math.min(reachFt, this.downE * cycle * sp) : 0;
    // (and it comes down this far ahead of him: a runner's share of the floor it is down over)
    const landFt = (landsAhead(G) * s * crouch * coverFt) / reachFt;
    const rollK = smooth(clamp((sp - 1.2) / 2.5, 0, 1));
    // (a runner's swing and knee lift go by the speed he is getting up to: his first steps from a stand drive his knees)
    this.paceE += ((ahead ? clamp((soon - 6) / 12, 0, 1) : 0) - this.paceE) * ke;
    // (a jog's foot only clears the floor and a run's comes up to his calf: it is at a sprint that the heel comes up
    // toward his seat. Higher than that at a run, his shin folds up behind him and hangs there)
    // (and as high as his own stride takes it: some men's knees come up more than others')
    // (at 4x, where a stride is four frames, the take's own height: lower, his knee straightens and folds in a frame)
    const lifts = (0.25 + soon * 0.026) * this.kneeK + (0.28 + soon * 0.03 - (0.25 + soon * 0.026) * this.kneeK) * fast4;
    // (backing up or sliding his foot comes up as his speed takes it; at 4x, where his stride is four frames, little
    // higher than a slide's: lifted as high as a run's back step, the knee was straight one frame and folded the next)
    const liftTo = ahead ? clamp(lifts + Math.max(0, soon - 20) * 0.045, 0.28, 1.6) : clamp(0.3 + sp * 0.022, 0.3, 0.8 - (0.8 - BACK_LIFT_FAST) * fast4);
    this.liftE += ((liftTo + (Math.min(liftTo, CONTACT_LIFT) - liftTo) * held) * s - this.liftE) * ke;
    const pace = this.paceE;
    const lift = this.liftE;
    const vl = Math.hypot(this.vx, this.vz) || 1;
    // (a step where he stands, not a stride: up before it goes over, see LIFT_FIRST)
    const stood = !going || (!ahead && sp < 8);
    // (how far from his hip, along the floor, a planted foot is with that leg straight to LOCK_KNEE: see strained)
    const T = THIGH * s;
    const S = SHIN * s;
    const tall = (HIP + this.pose[I.hip]) * s - ANKLE * s;
    const lockR2 = T * T + S * S - 2 * T * S * Math.cos(LOCK_KNEE) - tall * tall;
    // (in a stride going ahead he goes right over it and off its toes, his leg straight behind him: his heel is up by
    // then, and his ankle that much higher and nearer him than the foot's place on the floor. See STRIDE_HEEL)
    const tallRun = tall - STRIDE_HEEL[1] * s;
    const lockRun2 = (T + S) * (T + S) * 0.98 - tallRun * tallRun;
    // (where he will be a frame from now, going as he goes)
    const [nx, nz] = [this.vx * dt, this.vz * dt];
    this.feet.forEach((f, k) => {
      const down = this.downE;
      const p = this.phase + (k ? 0.5 : 0);
      const n = Math.floor(p);
      const q = (p - n) / (1 - down);
      // (a swing ends as his stride now has it: as he gets going or pulls up his foot is down for less or more of it.
      // How far through it the foot is goes on from where it was (see Foot.u), never thrown on or back as that moves)
      let swinging: boolean;
      if (f.swing) {
        f.p1 = f.n + (1 - down);
        swinging = cadence > 0 && p < f.p1;
      } else {
        // (its turn: once a stride, at the stride's start. Standing, a foot that is home stays down, and one that isn't
        // waits for the start of its stride)
        // (and not with less of its swing left than SWING_LEAST_FRAMES drawn frames: it waits for its next turn. Round his
        // pivot, into his load, or timed to his jump, there is no next turn to wait for)
        const timed = this.pivotK >= 0 || this.gathering || this.lockK !== -1;
        const turn = cadence > 0 && q < 1 && n !== f.n && (going || (q < 0.5 && away(f, k))) && (timed || (1 - down) * (1 - q) * cycle * 1000 >= SWING_LEAST_FRAMES * dt);
        // (or now, ahead of its turn: a planted foot his body is leaving, its leg straight by the next frame (see
        // LOCK_KNEE), is picked up now: never dragged to keep time, nor left until its leg is locked and then thrown
        // after him. Standing, one left a stride behind him is stepped after him. Not one he keeps down)
        let strained = false;
        if (!turn && cadence > 0 && !kept(k)) {
          if (!going) strained = q >= 1 && Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > REACH * s;
          else if (lockR2 > 0) {
            const jx = this.x + nx + sx * HIP_W * s * (k ? 1 : -1);
            const jz = this.z + nz + sz * HIP_W * s * (k ? 1 : -1);
            let [ex, ez] = [f.x - jx, f.z - jz];
            if (strides) {
              ex += (this.vx / vl) * STRIDE_HEEL[0] * s;
              ez += (this.vz / vl) * STRIDE_HEEL[0] * s;
            }
            // (his weight still coming onto it, out in front of him, it is a foot he lands on: the next step is the other's)
            strained = ex * ex + ez * ez > (strides ? lockRun2 : lockR2) && ex * nx + ez * nz < 0;
          }
        }
        swinging = !kept(k) && (turn || strained);
        // (picked up ahead of its turn, it is its next turn's swing begun early: it comes down when that one would)
        if (swinging) {
          f.n = turn ? n : n + 1;
          f.p1 = f.n + (1 - down);
          f.u = 0;
          f.pw = p;
        }
      }
      const end = f.p1;
      if (swinging && !f.swing) {
        // (where it leaves the floor, measured from him and on it: it swings through under him however fast he goes)
        f.fx = f.x - this.x;
        f.fz = f.z - this.z;
        f.wx = f.x;
        f.wz = f.z;
        f.p0 = p;
        f.vx = f.vz = 0;
        f.st = stood;
        f.go = going;
        f.run = going && strides && !stood;
        f.kt = -1;
        f.sp0 = f.run ? sp : 0;
        f.land = landFt;
        // (cutting at a run, the foot on the outside of the turn goes down wide: he pushes off it into the new way)
        f.wide = going && ahead && sp > TURN_GATE_FROM && (k ? 1 : -1) * this.bend < 0 ? Math.min(PLANT_WIDE, Math.abs(this.bend) * PLANT_OUT) * s * (k ? 1 : -1) : 0;
      }
      // (the frame its stride ends it is put down where the step was going: not left hanging short of it)
      const landing = f.swing && !swinging && cadence > 0;
      if (landing && k === this.catchK) this.catchLand = true;
      f.swing = swinging;
      let toes = 0;
      let roll = 45;
      if (swinging || landing) {
        const x0 = f.x;
        const z0 = f.z;
        // it lands ahead of him by half of what he'll cover while it's down
        // (never farther than a leg reaches without sinking him)
        const till = ((landing ? 0 : end - p) + down / 2) * cycle * 1000;
        const lead = Math.min(1, (REACH * s * crouch) / (Math.hypot(this.vx, this.vz) * till || 1));
        // (a stride picked up partway through still starts from where the foot was; and goes on through what is left of
        // it in the time left of it)
        if (landing) f.u = 1;
        else {
          const left = end - f.pw;
          f.u += (1 - f.u) * (left > 0.005 ? clamp((p - f.pw) / left, 0, 1) : 1);
        }
        f.pw = p;
        const u = f.u;
        // (a stride's: where a runner's foot comes down at his speed, ahead of him as he is then; its swing is measured
        // from him all the way, see below)
        f.land += (landFt - f.land) * (1 - Math.exp(-dt / STRIDE_LAND_MS));
        let tx = homeX(k) - this.x + (f.run ? (this.vx / vl) * f.land : this.vx * till * lead) + sx * f.wide;
        let tz = homeZ(k) - this.z + (f.run ? (this.vz / vl) * f.land : this.vz * till * lead) + sz * f.wide;
        // (body to body with a man (see contact) he doesn't put his foot down on the other man's: the two stand one
        // behind the other, their feet under them the same way, and a step taken where he stood landed shin in shin.
        // It goes down FOOT_OFF clear of each of the other's feet, on its own side of it)
        if (this.mateFeet && this.felt > 0.05)
          for (const o of this.mateFeet) {
            const off = FOOT_OFF * s * Math.min(1, this.felt * 2);
            const [ox, oz] = [this.x + tx - o.x, this.z + tz - o.z];
            const od = Math.hypot(ox, oz);
            if (od >= off) continue;
            // (straight away from it; right on it, back toward his own middle)
            const [ux, uz] = od > 0.05 ? [ox / od, oz / od] : [-(tx || 1e-3) / (Math.hypot(tx, tz) || 1), -tz / (Math.hypot(tx, tz) || 1)];
            tx += ux * (off - od);
            tz += uz * (off - od);
          }
        // it leaves the floor still (so it trails behind him a moment, the heel coming up) and is still again as it
        // lands (drawn back under him, not thrown down ahead and dragged): a curve from one to the other, on the floor
        // (where it went up from to where it goes down), whatever his body does under it meanwhile. A stride's is
        // carried on ahead of that by his stride as it goes (e): as fast as he was going as it left the floor, never
        // more than most of its way
        const swingMs = Math.max(0, end - f.p0) * cycle * 1000;
        // (a step where he stands goes up off the floor before it goes over, and over before it comes down: it is
        // still on the floor as it leaves it and as it meets it, from where it was to where it goes)
        const first = f.go ? LIFT_FIRST / 2 : LIFT_FIRST;
        const uh = f.st ? clamp((u - first) / (1 - 2 * first), 0, 1) : u;
        const u2 = uh * uh;
        const u3 = u2 * uh;
        const h01 = 3 * u2 - 2 * u3;
        if (f.st && this.pivotK === 1 - k) {
          // (round his pivot: an arc about the ball of the foot he keeps down, never in over it)
          const pv = this.feet[this.pivotK];
          const cx = pv.x + Math.sin(pv.yaw) * BALL * s * 0.5;
          const cz = pv.z + Math.cos(pv.yaw) * BALL * s * 0.5;
          const a0 = Math.atan2(f.wx - cx, f.wz - cz);
          const a1 = Math.atan2(this.x + tx - cx, this.z + tz - cz);
          const near = PIVOT_NEAR * s;
          const r0 = Math.max(near, Math.hypot(f.wx - cx, f.wz - cz));
          const r1 = Math.max(near, Math.hypot(this.x + tx - cx, this.z + tz - cz));
          const a = a0 + wrap(a1 - a0) * h01;
          const r = r0 + (r1 - r0) * h01;
          f.x = cx + Math.sin(a) * r;
          f.z = cz + Math.cos(a) * r;
        } else if (f.st) {
          f.x = f.wx + (this.x + tx - f.wx) * h01;
          f.z = f.wz + (this.z + tz - f.wz) * h01;
        } else if (f.run) {
          // (a stride going ahead: from where it left the floor to where it comes down, both measured from him, along
          // the way a runner's foot goes at his speed. It trails on behind him as the heel comes up, comes through
          // under his hips, reaches past where it will land and is drawn back to meet the floor: see stride.ts. And it
          // is still on the floor as it meets it: over the last of its swing it is drawn back under him exactly as
          // fast as he is going over it, whatever his stride's time is now)
          const far = Math.max(0.5 * s, ((tx - f.fx) * this.vx + (tz - f.fz) * this.vz) / vl);
          const still = -(Math.hypot(this.vx, this.vz) * swingMs) / far - swingEnds(G);
          const measured = swingAlong(G, u);
          const along = measured > 1 ? 1 + (measured - 1) * STRIDE_OVER : measured;
          const e = along + still * (u - 1) * u2 * u2 * u2;
          f.x = this.x + f.fx + (tx - f.fx) * e;
          f.z = this.z + f.fz + (tz - f.fz) * e;
          // (and it comes off the floor from rest. The stride was measured from the moment a toe was already going: taken
          // as it is, the foot was still one frame and at a third of his speed the next, and his knee, straightening
          // behind him, shut with a snap. What its first frame would have it doing is taken off it and given back over
          // STRIDE_PEEL ms: it gathers that speed over three or four frames, and is on its way as measured after that)
          // (taken in the first frame it is on its way: in the frame it is picked up it is where it was)
          if (dt > 0 && !landing && u > 0) {
            if (f.kt < 0) {
              // (no more than he is going himself: a foot put somewhere new in that frame is not a speed)
              const kv = Math.hypot(f.x - x0, f.z - z0) / dt;
              const kk = kv > vl ? vl / kv : 1;
              [f.kx, f.kz, f.kt] = [((f.x - x0) / dt) * kk, ((f.z - z0) / dt) * kk, 0];
            }
            f.kt += dt;
            const lag = f.kt * Math.exp(-f.kt / STRIDE_PEEL);
            f.x -= f.kx * lag;
            f.z -= f.kz * lag;
          }
        } else {
          // (a stride's is measured from him: where it left the floor, and where it goes down, which goes with him; drawn
          // back from that by how far he goes as it swings, most at the start, so it is still on the floor as it leaves it
          // and as it meets it)
          const span = Math.hypot(tx - f.fx, tz - f.fz);
          const m = Math.min(vl * swingMs, span * 0.9) / vl;
          const h1 = u3 - 2 * u2 + uh + (u3 - u2);
          f.x = this.x + f.fx + (tx - f.fx) * h01 - this.vx * m * h1;
          f.z = this.z + f.fz + (tz - f.fz) * h01 - this.vz * m * h1;
        }
        // (a runner's foot comes up behind him early and reaches down late; a walker's just clears the floor. It
        // leaves the floor at a speed, not all at once: the top a third of the way through. The heel peels off first, so
        // the knee that was straightening as he went over it starts to bend over a frame or two, it doesn't fold at once;
        // not when the plan has him going faster than a man runs, where there is no time for it. A step where he stands
        // is quickly clear of the floor and down onto it at the last: see LIFT_FIRST)
        const peel = f.go ? PEEL * (1 - clamp((sp - PEEL_FAST) / 8, 0, 1)) : 0;
        const walk = f.st ? Math.pow(Math.sin(Math.PI * u), 0.6) : Math.sin(Math.PI * (u + 0.76 * pace * u * (1 - u))) * (peel > 0 ? smooth(clamp(u / peel, 0, 1)) : 1);
        // (a runner's heel comes up to his seat as a swing, not a flick: it rises over the first SWING_TOP of the
        // stride, gathering speed and giving it up, so his knee folds over four or five frames, never most of the
        // way in one; then it reaches down for the floor and meets it moving)
        const top = SWING_TOP;
        const run = u < top ? (1 - Math.cos((Math.PI * u) / top)) / 2 : Math.cos(((Math.PI / 2) * (u - top)) / (1 - top));
        f.up = (walk + (run - walk) * pace) * lift;
        // (toes down as it trails, up as it reaches for the floor)
        toes = going ? 0.95 - 1.25 * smooth(clamp((u - 0.2) / 0.55, 0, 1)) + 0.15 * clamp((u - 0.85) / 0.15, 0, 1) : 0.4 * Math.sin(Math.PI * u);
        if (f.run) {
          // (a stride's: as high as a runner's heel comes at his speed, and as his own stride has it; body to body, low;
          // at 4x, where a stride is four frames, lower: see BOB_FAST)
          let high = swingUp(G, u) * s * (1 + (this.kneeK - 1) * 0.6) * (1 - STRIDE_FAST * fast4);
          toes = swingPitch(G, u) * rollK;
          // (never folded up tight under his seat: his ankle stays STRIDE_UNDER below his hips, however low he is
          // sitting into a start or a stop. A leg shut that far has no way for its knee to point, and it flickered)
          const cap = (HIP + this.pose[I.hip] - STRIDE_UNDER) * s - (ANKLE * Math.cos(f.pitch) + BALL * Math.sin(Math.max(0, f.pitch))) * s;
          const soft = 0.2 * s;
          if (high > cap - soft) high = Math.max(0, cap - soft * Math.exp(-(high - (cap - soft)) / soft));
          f.up = high + (Math.min(high, CONTACT_LIFT * s * Math.sin(Math.PI * u)) - high) * held;
          // (up off the floor from rest too: see STRIDE_PEEL)
          if (dt > 0 && !landing && f.kt >= 0) {
            if (f.kt <= dt) f.ky = Math.min(f.up / dt, STRIDE_PEEL_UP);
            f.up = Math.max(0, f.up - f.ky * f.kt * Math.exp(-f.kt / STRIDE_PEEL));
          }
          roll = 45 + (STRIDE_ROLL - 45) * clamp((sp - 6) / 8, 0, 1);
        }
        // (the foot he plants for a cut comes down flat: his weight goes straight onto it)
        if (f.wide && u > 0.6) toes = Math.max(toes, 0);
        // (a slide, or going any way in his slide's stance: it comes down on its own side of the other foot, eased out
        // to it over a frame or two, never thrown across in one; and out of his slide back in, slower, not pulled back
        // in a frame as it lands)
        const o = this.feet[1 - k];
        const lat = ((f.x - o.x) * sx + (f.z - o.z) * sz) * (k ? 1 : -1);
        const need = sideways || (this.clip === 'shuffle' && Math.abs(this.hipLead) < 0.3) ? Math.max(0, FEET_GAP * s - lat) : 0;
        f.side += clamp((need - f.side) * (1 - Math.exp(-dt / (need > f.side ? SIDE_MS : SIDE_BACK_MS))), -SIDE_FRAME * s, SIDE_FRAME * s);
        f.x += sx * f.side * (k ? 1 : -1);
        f.z += sz * f.side * (k ? 1 : -1);
        // (and on its way there it goes round the other man's feet, not through them: see FOOT_OFF)
        if (this.mateFeet && this.felt > 0.05)
          for (const o of this.mateFeet) {
            const off = FOOT_OFF * s * Math.min(1, this.felt * 2);
            const od = Math.hypot(f.x - o.x, f.z - o.z);
            if (od >= off || od < 0.02) continue;
            f.x += ((f.x - o.x) / od) * (off - od);
            f.z += ((f.z - o.z) / od) * (off - od);
          }
        // (no faster than a foot is swung: a stride caught late in its turn as he sets off from a stand is not thrown
        // down the floor in a frame; it is put down short, and the next one makes it up)
        const moved = Math.hypot(f.x - x0, f.z - z0);
        const most = ((FOOT_SWING * Math.max(sp, this.spLag, f.sp0) + FOOT_SWING_MIN) * s * dt) / 1000;
        if (moved > most) {
          f.x = x0 + ((f.x - x0) * most) / moved;
          f.z = z0 + ((f.z - z0) * most) / moved;
        }
        if (dt > 0) {
          const sec = dt / 1000;
          const nvx = (f.x - x0) / sec;
          const nvz = (f.z - z0) / sec;
          const dv = Math.hypot(nvx - f.vx, nvz - f.vz);
          const acc = (FOOT_ACC + FOOT_ACC_SP * Math.max(sp, this.spLag, f.sp0)) * sec;
          const k2 = dv > acc ? acc / dv : 1;
          f.vx += (nvx - f.vx) * k2;
          f.vz += (nvz - f.vz) * k2;
          f.x = x0 + f.vx * sec;
          f.z = z0 + f.vz * sec;
        }
        // (it comes round to the way he faces as it swings, all of the way by the time it is down)
        const left = Math.max(dt, landing ? 0 : (end - p) * cycle * 1000);
        const spin = (SWING_SPIN * dt) / 1000;
        f.yaw += clamp((wrap(nat(k) - f.yaw) * dt) / left, -spin, spin);
        f.heel = 0;
      } else {
        f.up = Math.max(0, f.up - dt * 0.006 * s);
        f.side = 0;
        // (down: flat until it is behind him, then the heel comes up as he goes over it)
        // (in a stride: as a runner's foot is through its time down, by how far he has gone over it. Onto its heel
        // first at a walk, flat at a run, and up onto its ball as it goes behind him)
        if (going && ahead) toes = 0.75 * clamp((-((f.x - this.x) * this.vx + (f.z - this.z) * this.vz) / vl - 0.35 * s) / (0.9 * s), 0, 1);
        if (going && strides) {
          // (a walk's roll from heel to toe comes in over his first steps: a man edging off his spot hasn't a heel in the air)
          toes = stancePitch(G, (landFt - ((f.x - this.x) * this.vx + (f.z - this.z) * this.vz) / vl) / Math.max(0.5 * s, coverFt)) * rollK;
          // (it goes by where the foot is under him, which moves as he does: followed closely at a run, or at a sprint,
          // down for six or seven frames, his heel was still coming up as the foot left the floor)
          roll = 45 + (STRIDE_ROLL / 2 - 45) * clamp((sp - 6) / 8, 0, 1);
        }
        // (going up off the floor: his heels come up as his hips drive up out of his crouch, and as they rise past where
        // he stands, his toes the last of him to leave it; coming down, the first of him on it)
        const air = this.pose[I.air];
        const hip = this.pose[I.hip];
        const drive = going ? 0 : clamp((rise - TAKE_RATE) / TAKE_RATE, 0, 1) * clamp((hip + TAKE_HIP) / TAKE_HIP, 0, 1);
        const up = air > 0.02 ? clamp(hip / TAKE_HIP, 0, 1) * clamp(air / 0.5, 0, 1) : 0;
        if (drive > 0 || up > 0) {
          toes = Math.max(toes, TAKE_TOES * Math.max(drive, up));
          if (drive > 0) roll = TAKE_MS;
        }
        // (his body turning over it: it keeps its heading as far as his hip and knee turn; past that he pivots on its
        // ball, its heel up, as fast as it is up; past that again it is picked up and put down: see twisted)
        // (his pivot turns with him on its ball: once it is up on it, all the way round to the way he faces)
        const o = outOf(f, k);
        const [bo, bi] = k === this.pivotK ? (f.heel > 0.5 ? [0.04, 0.04] : [PIVOT_KEEP, PIVOT_KEEP]) : [turnOut, turnIn];
        const over = air < 0.5 ? (o > bo ? o - bo * (k === this.pivotK ? 0 : 1) : o < -bi ? o + bi * (k === this.pivotK ? 0 : 1) : 0) : 0;
        if (over) {
          const most = ((PIVOT_SPIN * dt) / 1000) * f.heel;
          const by = -clamp(over, -most, most) * (k ? -1 : 1);
          const bx = f.x + Math.sin(f.yaw) * BALL * s;
          const bz = f.z + Math.cos(f.yaw) * BALL * s;
          f.yaw += by;
          f.x = bx - Math.sin(f.yaw) * BALL * s;
          f.z = bz - Math.cos(f.yaw) * BALL * s;
        }
        f.heel += ((over ? 1 : 0) - f.heel) * (1 - Math.exp(-dt / (over ? 40 : 120)));
        toes = Math.max(toes, PIVOT_HEEL * f.heel);
      }
      // (faster than his legs can turn over: the foot can't stay where it landed. It comes off the floor and skips after him, not dragged along it)
      const dx = f.x - this.x;
      const dz = f.z - this.z;
      const far = Math.hypot(dx, dz);
      // (in a stride he goes right over it: it is behind him by all of its time down before it is his to pick up)
      const max = Math.max((REACH + 0.3) * s + w, f.run || (strides && going) ? downOver(G) * s * crouch - landFt + 0.7 * s : 0);
      if (far > max) {
        f.x = this.x + (dx / far) * max;
        f.z = this.z + (dz / far) * max;
        if (!swinging) f.up = Math.min(0.3 * s, f.up + dt * 0.012 * s);
      }
      // (in the air his toes point, as far as his foot hangs from him, and no less than as he left the floor)
      if (this.pose[I.air] > 0.5) toes = Math.max(Math.min(0.95, f.lift * 0.75), Math.min(f.pitch, TAKE_TOES));
      f.pitch += (toes - f.pitch) * (1 - Math.exp(-dt / roll));
    });
    // (put down where the knock sent it, it is his own foot again: he steps back under himself when he next can)
    if (this.catchLand) [this.catchK, this.catchLand] = [-1, false];
  }

  /**
   * His weight on his feet, after they are stepped (see step) and before he is solved on them. It is on the foot he has
   * down, and goes over to the one he puts down as it is put down (TRANSFER_MS), onto both as he stands: his hips go over
   * to it (WEIGH_OVER, less at a run, whose feet come down near under him), the hip over it a little higher than the
   * other's (WEIGH_LIST), turned forward with the leg that is forward (WEIGH_PYAW). Each foot put down at a run takes him
   * a little; one put down while he is pulling up takes as much more as he is slowing (ABSORB_*): his hips sink into it
   * fast and come back up over the rest of its time down. At 4x, where a frame is a quarter of a stride, less of it.
   */
  /** How far his hips' own way over his feet has taken the place of a stride's (0..1): see weigh. */
  private ownW = 0;
  private weigh(own: number, sp: number) {
    const P = this.pose;
    const { s } = this.body;
    const ground = 1 - clamp(P[I.air] / 0.3, 0, 1);
    const down = [!this.feet[0].swing, !this.feet[1].swing];
    // (how hard he is slowing now, his own travel's: what the foot put down has to take)
    if (own > 0) this.slowing += (((this.spW - sp) * 1000) / own - this.slowing) * (1 - Math.exp(-own / SLOWING_MS));
    this.spW = sp;
    for (const k of [0, 1]) {
      const put = down[k] && !this.downWas[k];
      this.strikeMs[k] = put ? 0 : this.strikeMs[k] + own;
      if (put && ground > 0.5 && sp > ABSORB_FROM) {
        const brake = clamp(Math.max(this.slowing, -this.acc) / ABSORB_FULL, 0, 1.3);
        const k2 = ABSORB_RUN * clamp(sp / 20, 0, 1) + ABSORB_BRAKE * brake;
        // (the last's sink goes on, and he is no higher than it has him until this one is deeper: one foot after another
        // each takes him on from where the last has him, never up out of it as the next comes down)
        [this.absorbK0, this.absorbT0] = [this.absorbK, this.absorbT];
        [this.absorbK, this.absorbT] = [k2, 0];
      }
    }
    this.downWas = down;
    let want = this.loadL;
    let tau = WEIGH_MS;
    if (down[0] !== down[1]) want = down[0] ? 1 : 0;
    else if (down[0]) {
      const last = this.strikeMs[0] <= this.strikeMs[1] ? 0 : 1;
      const still = sp < 1.5 && Math.min(...this.strikeMs) > TRANSFER_MS * 2;
      // (stood still he is on both, or, waiting off the ball, on the leg his own way of waiting has him on: see wait)
      const waits = still && WAITS.has(this.clip) && !this.one;
      want = waits ? 0.5 + 0.5 * clamp(this.weightAt * this.weightK, -1, 1) : still ? 0.5 : last ? 0 : 1;
      tau = waits ? WEIGH_MS : still ? STAND_WEIGH_MS : TRANSFER_MS;
    }
    if (own > 0) this.loadL += (want - this.loadL) * (1 - Math.exp(-own / tau));
    const fast = clamp((this.ownMs - BOB_FROM_MS) / (BOB_FAST_MS - BOB_FROM_MS), 0, 1);
    // (body to body his weight is on the other man as much as on his feet: see contact)
    const k = ground * (1 - WEIGH_FAST * fast) * (1 - WEIGH_FELT * clamp(this.felt, 0, 1));
    if (k <= 0.01) return;
    // (each foot in his frame: to his left, ahead)
    const [hx, hz, sx, sz] = this.dirs();
    const lx = (f: Foot) => -((f.x - this.x) * sx + (f.z - this.z) * sz);
    const lz = (f: Foot) => (f.x - this.x) * hx + (f.z - this.z) * hz;
    const [a, b] = this.feet;
    const over = WEIGH_OVER * (1 - 0.6 * clamp(sp / 20, 0, 1));
    const to = clamp(over * (this.loadL * lx(a) + (1 - this.loadL) * lx(b)), -WEIGH_MOST * s, WEIGH_MOST * s);
    // (his hips swing over, they aren't put over: eased as a body's weight goes from foot to foot)
    if (own > 0) this.overW += (to - this.overW) * (1 - Math.exp(-own / WEIGH_EASE_MS));
    const at = this.overW;
    // (a captured stride's own hips went over its own man's feet, not his: in a stride they go over his, in place of most of the take's)
    // (taken up over a stride's start, not in the frame his stop became a walk: his pelvis jumped across with it)
    const striding = CLIPS[this.clip].kind === 'gait' && FORWARD.has(this.clip) ? 1 : 0;
    this.ownW = own > 0 ? this.ownW + (striding - this.ownW) * (1 - Math.exp(-own / WEIGH_OWN_MS)) : striding;
    const mine = WEIGH_OWN * k * this.ownW;
    P[I.sway] += (at / s) * k - P[I.sway] * mine;
    P[I.proll] += WEIGH_LIST * (2 * this.loadL - 1) * k - P[I.proll] * mine;
    P[I.pyaw] -= clamp((WEIGH_PYAW * (lz(a) - lz(b))) / s, -WEIGH_PYAW_MOST, WEIGH_PYAW_MOST) * k * clamp(sp / 4, 0, 1);
    // (the foot put down taking him)
    this.absorbT += own;
    this.absorbT0 += own;
    P[I.hip] -= Math.max(this.absorbK * absorbed(this.absorbT), this.absorbK0 * absorbed(this.absorbT0)) * k;
  }

  /** Hips, chest, head, legs: everything but the arms (they wait for the ball). `dt`: the bodies' ms gone by (none, solved again in the same frame). */
  private solve(vf: number, vs: number, dt = 0) {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    const air = clamp(P[I.air], 0, 1);
    const put = (k: number, x: number, y: number, z: number) => {
      j[k * 3] = x;
      j[k * 3 + 1] = y;
      j[k * 3 + 2] = z;
    };
    // feet, in his frame: on the floor where they are, or hanging from a jump (as wide as his steps have them: see WIDE_MS)
    const w = (HIP_W + 0.08 + (Number.isFinite(this.wideE) ? this.wideE : P[I.wide]) * 0.6) * s;
    const jump = Math.max(0, P[I.hip]) * s;
    const fl = FL;
    // (off one foot he comes down on that one first, and the other after it: see LAND_LATE_MS)
    const id = this.one?.id;
    const first = id && ONE_FOOT.has(id) ? this.offK : -1;
    // (going up for a jump, his feet go from his stride's to the move's over AIR_FEET_MS, not in the frame his hips
    // leave the floor; a runner's stride, and coming down, as they are)
    if (dt > 0) this.airFeet = air > this.airFeet && air > 0.3 ? this.airFeet + (air - this.airFeet) * (1 - Math.exp(-dt / AIR_FEET_MS)) : air;
    const airF = this.airFeet;
    if (dt > 0) this.lateAir = first >= 0 ? Math.max(airF, this.lateAir - dt / LAND_LATE_MS) : airF;
    if (dt > 0) this.airMs = air > 0.5 ? this.airMs + dt : 0;
    this.feet.forEach((f, k) => {
      const airK = k === 1 - first ? Math.max(airF, this.lateAir) : airF;
      const ax = (k ? -1 : 1) * w;
      const au = jump + P[k ? I.fru : I.flu] * s;
      const af = P[k ? I.frf : I.flf] * s;
      // (rolled up onto its ball, or back onto its heel: that stays where it is on the floor, and his ankle comes up and
      // over it)
      const th = f.pitch;
      const pz = th >= 0 ? BALL + TOE_ROLL * smooth(clamp(th / TAKE_TOES, 0, 1)) : -HEEL;
      const fwd = (pz * (1 - Math.cos(th)) + ANKLE * Math.sin(th)) * s;
      let [lx, lz] = this.local(f.x + Math.sin(f.yaw) * fwd, f.z + Math.cos(f.yaw) * fwd);
      if (air > 0.5 && dt > 0) {
        // (in the air his feet go with him, to where the move has them, and come round to the way he faces: he lands
        // where he comes down. They get there as a foot is swung, never in a frame)
        const e = 1 - Math.exp(-dt / AIR_FEET_MS);
        const go = Math.hypot(ax - lx, af - lz) * e;
        const most = (AIR_FEET_FAST * s * dt * Math.min(1, this.airMs / AIR_FEET_RAMP)) / 1000;
        const k2 = go > most ? (e * most) / go : e;
        lx += (ax - lx) * k2;
        lz += (af - lz) * k2;
        const o = this.world(lx, 0, lz, TMP);
        f.yaw += wrap(this.yaw + (k ? -TOE_OUT : TOE_OUT) - f.yaw) * e;
        f.x = o.x - Math.sin(f.yaw) * fwd;
        f.z = o.z - Math.cos(f.yaw) * fwd;
        f.up = 0;
        f.swing = false;
        f.heel = 0;
      }
      // (and however it hangs from him, its toes are never through the floor, nor along it once he is off it)
      const low = (ANKLE * Math.cos(th) + Math.abs(pz * Math.sin(th))) * s;
      const y = Math.max(low + AIR_CLEAR * s * Math.min(1, 2 * airK), (f.up + low) * (1 - airK) + (ANKLE * s + au + LAND_LATE_UP * s * Math.max(0, airK - air)) * airK);
      fl[k * 3] = lx;
      fl[k * 3 + 1] = y;
      fl[k * 3 + 2] = lz;
      f.turn = wrap(f.yaw - this.yaw);
      f.lift = y / s - ANKLE;
    });
    // hips: as high as the pose says, never higher than both legs can reach from
    const want = (HIP + P[I.hip]) * s;
    let hipY = want;
    const legs = (THIGH + SHIN) * s * 0.985;
    // (no lower than this, ever: his seat on the floor knocked down, else well up; never above where the pose has him, as he gets up out of a fall)
    const floorY = Math.min((this.clip === 'stumble' ? 0.72 : 1.7) * s, want);
    if (air < 0.5) {
      for (let k = 0; k < 2; k++) {
        // (a foot in the air holds nothing down: its leg folds to follow)
        if (this.feet[k].swing || (k === 1 - first && this.lateAir > 0.5)) continue;
        const dh = Math.hypot(fl[k * 3] - ((k ? -1 : 1) * HIP_W + P[I.sway]) * s, fl[k * 3 + 2] - P[I.surge] * s);
        hipY = Math.min(hipY, Math.sqrt(Math.max(0.5, legs * legs - dh * dh)) + fl[k * 3 + 1]);
      }
      // a long stride sinks him a little, no more: past that the heel comes off the floor instead
      // (knocked down he goes all the way to the floor: his seat on it, his knees up)
      hipY = Math.max(hipY, want - SINK * s, floorY);
    }
    // (that sink comes in over a frame or two and goes over a few: a foot put down far ahead doesn't jerk his hips
    // down for one frame and up the next. The leg reaching for it straightens softly the rest of the way)
    const need = want - hipY;
    this.sink = this.sinkFrom + (need - this.sinkFrom) * (1 - Math.exp(-this.ownMs / (need > this.sinkFrom ? SINK_IN : SINK_OUT)));
    hipY = Math.max(want - this.sink, floorY);
    // (a foot in the air is drawn no farther in under him, in one drawn frame, than a knee folds in one: KNEE_FOLD ft
    // nearer its hip than it was. Played at 4x a slide's whole step is three frames, and the frame the foot went by
    // under his hips its knee was shut, between two frames of a straight leg: a flick. It is drawn part of the way from
    // where it was instead, low, and is where its step has it the frame after; its step itself, and the floor it comes
    // down on, are not changed. At 1x and 2x no knee folds that fast, and nothing is)
    const LW = this.legWas;
    const fold = KNEE_FOLD * s * Math.max(1, this.easeMs * 0.06);
    for (let k = 0; k < 2; k++) {
      const hx = ((k ? -1 : 1) * HIP_W + P[I.sway]) * s;
      const hz = P[I.surge] * s;
      const o = k * 4;
      const far = (x: number, y: number, z: number) => Math.hypot(x - hx, y - hipY, z - hz);
      let L = far(fl[k * 3], fl[k * 3 + 1], fl[k * 3 + 2]);
      const least = LW[o + 3] - fold;
      if (this.feet[k].swing && air < 0.5 && LW[o + 3] > 0 && L < least && Math.hypot(fl[k * 3] - LW[o], fl[k * 3 + 2] - LW[o + 2]) < KNEE_FOLD_FAR * s) {
        let [lo, hi] = [0, 1];
        for (let n = 0; n < 7; n++) {
          const t = (lo + hi) / 2;
          if (far(fl[k * 3] + (LW[o] - fl[k * 3]) * t, fl[k * 3 + 1] + (LW[o + 1] - fl[k * 3 + 1]) * t, fl[k * 3 + 2] + (LW[o + 2] - fl[k * 3 + 2]) * t) >= least) hi = t;
          else lo = t;
        }
        for (let a = 0; a < 3; a++) fl[k * 3 + a] += (LW[o + a] - fl[k * 3 + a]) * hi;
        L = far(fl[k * 3], fl[k * 3 + 1], fl[k * 3 + 2]);
      }
      [LW[o], LW[o + 1], LW[o + 2], LW[o + 3]] = [fl[k * 3], fl[k * 3 + 1], fl[k * 3 + 2], this.ownMs > 0 ? L : 0];
    }
    // (a captured clip leans as the runner did: only a keyed one is leaned by his speed)
    const keyed = CLIPS[this.clip].dense ? 0 : 1;
    // (his pelvis turned with his legs, opened ahead of him: see LEAD_FROM; his chest stays with the way he faces)
    const pyaw = P[I.pyaw];
    P[I.pyaw] += this.hipLead * LEAD_PELVIS;
    spine(P, this.body, hipY, j, this.up, this.front, this.left, vf * keyed, vs * keyed, this.line);
    P[I.pyaw] = pyaw;
    put(J.fl, fl[0], fl[1], fl[2]);
    put(J.fr, fl[3], fl[4], fl[5]);
    // (each knee goes out over its toes: its pole turned with the foot, as far as that is turned from square, most of the
    // way; square being the way his legs go, opened ahead of him or not)
    for (let k = 0; k < 2; k++) {
      const a = this.hipLead + KNEE_TRACK * wrap(this.feet[k].turn - this.hipLead - (k ? -TOE_OUT : TOE_OUT));
      const out = this.feet[k].run && this.feet[k].swing ? KNEE_OUT_RUN : KNEE_OUT;
      this.kneeOut[k] += (out - this.kneeOut[k]) * (dt > 0 ? 1 - Math.exp(-dt / STRIDE_MS) : 1);
      const px = k ? -this.kneeOut[k] : this.kneeOut[k];
      reach(j, k ? J.jr : J.jl, k ? J.kr : J.kl, k ? J.fr : J.fl, THIGH * s, SHIN * s, px * Math.cos(a) + Math.sin(a), 0.1, -px * Math.sin(a) + Math.cos(a), KNEE_SOFT);
    }
    this.vf = vf;
    this.vs = vs;
  }

  /** Where the ball is when it's his, in the scene: where the pose puts it, never out of the reach of the hand that has it. */
  carry(out: V3): V3 {
    // (asked where it will be his while it isn't yet: a dribble he lost on its way down is long gone)
    if (!this.has) {
      this.pickY = -1;
      this.legOff.x = this.legOff.z = 0;
    }
    return this.world(this.ballAt.x, this.ballAt.y, this.ballAt.z, out);
  }

  /**
   * The ball as his hands have it, or will (see carry), once this frame's pose is solved: where he wants it (ballWant),
   * followed (a jump in that is carried and comes on over a moment: see Follow), and out of his own body where it *is*:
   * pushed off the part of him it has come against, never re-placed on that part's far side.
   */
  private settleBall() {
    const { s } = this.body;
    const w = this.ballWant();
    const F = this.ballF;
    // (where it goes, out of his own body: a pass wound up past his hip has its way round it, not through it. Not a dribble
    // off his hand: that is the bounce's to keep out of him (see bounced), and his ball follows his clip exactly till it is back)
    const dr = this.dribble;
    const inHand = !dr || dr.phase >= 1;
    if (inHand) {
      OWN.x = BP.x;
      OWN.y = BP.y;
      OWN.z = BP.z;
      if (this.ownOut()) {
        const [dx, dy, dz] = [OWN.x - BP.x, OWN.y - BP.y, OWN.z - BP.z];
        [BP.x, BP.y, BP.z] = [OWN.x, OWN.y, OWN.z];
        w.x += dx;
        w.y += dy;
        w.z += dz;
      }
    }
    F.step(BP.x, BP.y, BP.z, w.x, w.y, w.z, this.ownMs / 1000, this.easeMs / 1000, BALL_PACE, s);
    // (kept off the man on him from where it *is*, too: where it is wanted swings round him as his clip takes it across
    // his front, and followed there it would go through his middle; pushed off it from where it is, it goes round)
    // (one budget for both pushes: two at once moved it a foot in a frame, and his hand on it with it)
    let left = Math.max(BALL_OUT_LEAST, (BALL_OUT * this.ownMs) / 1000) * s;
    // (not a hand-off held out: that is put where the man coming by takes it, and kept off his own man it was pushed
    // into the taker, the giver's arms through him)
    if (this.pressed > 0.02 && !isDunk(this.clip) && this.offerW < 1) {
      const [px, pz] = this.local(this.px0, this.pz0);
      const dx = F.at.x - px;
      const dz = F.at.z - pz;
      const far = Math.hypot(dx, dz);
      const clear = PRESS_CLEAR * s * Math.min(1, this.pressed * 3) * (1 - this.offerW);
      if (far < clear && far > 1e-3) left -= F.push((dx / far) * (clear - far), 0, (dz / far) * (clear - far), left);
    }
    // (and out of him from where it *is*, so it stays on the side of him it came by)
    OWN.x = F.at.x;
    OWN.y = F.at.y;
    OWN.z = F.at.z;
    if (inHand && left > 0 && this.ownOut()) F.push(OWN.x - F.at.x, OWN.y - F.at.y, OWN.z - F.at.z, left);
    this.ballAt.x = F.at.x;
    this.ballAt.y = Math.max(BALL_R, F.at.y);
    this.ballAt.z = F.at.z;
  }

  /** Where he wants the ball this frame (his frame, into BW): where his clip has it, and all that is done to that. */
  private ballWant(): V3 {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    let x = -P[I.bx] * s;
    let y = P[I.by] * s + Math.max(0, P[I.hip]) * s;
    let z = P[I.bz] * s;
    if (this.offerW > 0) {
      // (a hand-off held out: between him and the man coming by for it (see exchange.ts), as far round him as his arms
      // hold a ball out, OFFER_ARC either way from where he faces; the rest is his body's to turn)
      const [ox, oz] = this.local(this.offerAt.x, this.offerAt.z);
      const far = Math.hypot(ox, oz);
      const round = clamp(Math.atan2(ox, oz), -OFFER_ARC, OFFER_ARC);
      const w = this.offerW;
      x += (Math.sin(round) * far - x) * w;
      y += (this.offerAt.y - y) * w;
      z += (Math.cos(round) * far - z) * w;
    }
    // (taken up past his chest and his face it goes up in front of them: a pose on its way from his hip to over his
    // head (an overhead pass wound up off the dribble) would take it through him, and it would be thrown out of him a
    // foot in a frame. Out at his side, or up over his head, it goes where the pose has it)
    const mid = smooth(clamp((y / s - FRONT_FROM) / 0.6, 0, 1)) * (1 - smooth(clamp((y / s - FRONT_TO) / 0.5, 0, 1))) * (1 - smooth(clamp((Math.abs(x) / s - 0.5) / 0.4, 0, 1)));
    if (mid > 0) z = Math.max(z, FRONT_MIN * s * mid);
    const g = Math.max(P[I.gl], P[I.gr]);
    if (isDunk(this.clip) && this.hasAim && this.one) {
      // a dunk: the ball goes to the rim, as far as his hands can take it (each on its side of the ball)
      // (a dunk that is blocked never gets there: the hand meets it on its way up)
      const w = smooth(clamp((this.one.tau - (DUNK_AT - DUNK_REACH)) / DUNK_REACH, 0, 1)) * (this.fails === 'block' ? STUFFED : 1);
      const [rx, rz] = this.local(this.ax, this.az);
      x += (rx - x) * w;
      y += (RIM_Y - 0.1 - y) * w;
      z += (rz - z) * w;
      const max = (UARM + FARM) * s * 0.97;
      for (let pass = 0; pass < 2; pass++)
        for (const side of [1, -1]) {
          if (P[side > 0 ? I.gl : I.gr] <= 0.5) continue;
          const k = (side > 0 ? J.sl : J.sr) * 3;
          const dx = x + side * PALM - j[k];
          const dy = y - j[k + 1];
          const dz = z - j[k + 2];
          const far = Math.hypot(dx, dy, dz);
          if (far <= max) continue;
          x -= (dx / far) * (far - max);
          y -= (dy / far) * (far - max);
          z -= (dz / far) * (far - max);
        }
    } else if (g > 0.5 || (g > REACH_FROM && !DRIBBLES.has(this.clip) && !isMove(this.clip))) {
      const sd = P[I.gr] >= P[I.gl] ? -1 : 1;
      const k = (sd > 0 ? J.sl : J.sr) * 3;
      // (a dribbler's palm is on top of it: it is his hand that must reach, and the ball hangs under it; a hand on its
      // side of it the same, the ball's middle a palm on past it: held up over his head it goes as high as his arms do)
      const hold = CLIPS[this.clip].grip;
      const top = hold === 'top' ? PALM : 0;
      const by = hold === 'side' ? sd * PALM : 0;
      const dx = x + by - j[k];
      const dy = y + top - j[k + 1];
      const dz = z - j[k + 2];
      const d = Math.hypot(dx, dy, dz);
      const max = (UARM + FARM) * s * 0.97 - (hold === 'under' ? PALM : 0);
      // (nor so near his shoulder that the arm holding it folds shut: a ball held in at his chest or up by his ear is
      // out from it as far as an elbow bent HOLD_NEAR's way puts it)
      const min = HOLD_NEAR * s;
      if (d > max || (d < min && d > 1e-3)) {
        // (as far as a hand is on it: all of it from a little hold on, so a ball let go of at the rim is not where his clip
        // throws it, yards on from his hand, while the hand is still letting go of it. His ball follows: see settleBall)
        const dribbling = DRIBBLES.has(this.clip) || isMove(this.clip);
        const w = smooth(clamp((g - (dribbling ? 0.5 : REACH_FROM)) / REACH_TAKE, 0, 1));
        const to = d > max ? max : min;
        x += (j[k] + (dx / d) * to - by - x) * w;
        y += (j[k + 1] + (dy / d) * to - top - y) * w;
        z += (j[k + 2] + (dz / d) * to - z) * w;
      }
    } else if (DRIBBLES.has(this.clip) || isMove(this.clip)) {
      // (a dribble between touches: where it will come back to his hand is no lower than his hand can go)
      const k = (this.drib.to > 0 ? J.sl : J.sr) * 3;
      const max = (UARM + FARM) * s * 0.97;
      this.reachLow = j[k + 1] - Math.sqrt(Math.max(0.3, max * max - (x - j[k]) ** 2 - (z - j[k + 2]) ** 2)) - PALM;
      y = Math.max(y, this.reachLow);
    }
    if (this.rebW > 0.001 && this.takeK < 1) {
      // (a rebound comes to his hands as high as it is when he gets to it, and is drawn in from there as the clip draws it;
      // straight back up with it, a putback or a pass, it goes on from there, not from where the next clip has it)
      const take = (REB_LOW + (REB_TOP - REB_LOW) * this.takeK) * s;
      y += (take - y) * this.rebW;
    }
    if (this.catchT < GIVE_IN + GIVE_OUT && !isDunk(this.clip)) {
      // (a fast ball caught: on the way it came, toward his chest, and back)
      const t = this.catchT;
      // (quickest as it comes, as the ball's own speed is taken off it, and easing to the end of the give)
      // (not once he is holding it out to hand off: it is where the man coming by takes it, see ballWant's offer)
      const e = (t < GIVE_IN ? 1 - (1 - t / GIVE_IN) ** 3 : 1 - smooth((t - GIVE_IN) / GIVE_OUT)) * (1 - this.offerW);
      x += this.catchD.x * e;
      y += this.catchD.y * e;
      z += this.catchD.z * e;
    }
    // (all of that is where his move has it, and it goes there as his move goes: BP. What is laid on that for the moment,
    // his hands out for a pass and the ball kept off the man on him, is where he wants it (BW), and it is followed there:
    // see settleBall)
    BP.x = x;
    BP.y = Math.max(BALL_R, y);
    BP.z = z;
    if (this.metT < CATCH_IN) {
      // (a pass is flown to where his hands are out for it, and comes on in with them from there)
      const e = (1 - smooth(this.metT / CATCH_IN)) * (1 - this.offerW);
      x += this.met.x * e;
      y += this.met.y * e;
      z += this.met.z * e;
    }
    if (this.pressed > 0.02 && !isDunk(this.clip)) {
      // (kept out of the man on him: pushed away from his middle, as far as he is pressed)
      const [px, pz] = this.local(this.px0, this.pz0);
      const dx = x - px;
      const dz = z - pz;
      const far = Math.hypot(dx, dz);
      const clear = PRESS_CLEAR * s;
      if (far < clear) {
        const out = (clear - far) * Math.min(1, this.pressed * 3) * (1 - this.offerW);
        // (straight back toward himself when it is dead centre on the man)
        const [ux, uz] = far > 0.05 ? [dx / far, dz / far] : [-px / (Math.hypot(px, pz) || 1), -pz / (Math.hypot(px, pz) || 1)];
        x += ux * out;
        z += uz * out;
      }
    }
    BW.x = x;
    BW.y = Math.max(BALL_R, y);
    BW.z = z;
    return BW;
  }

  /**
   * His elbow's pole for a hand `hx`, `hy`, `hz` from its shoulder (his frame): where it hangs (elbowPole) swung round
   * by the pose as far as SWIVEL_MAX; a hand on the ball (`grip`) has it put where the palm faces the ball without the
   * forearm twisting (GRIP_POLE of the way); and it turns from where it pointed last frame no faster than ELBOW_TURN.
   */
  private elbow(side: 1 | -1, hx: number, hy: number, hz: number, swivel: number, grip: number): V3 {
    const pole = elbowPole(this.left, this.front, side, hx, hy, hz, clamp(swivel, -SWIVEL_MAX, SWIVEL_MAX), POLE);
    const d = Math.hypot(hx, hy, hz) || 1;
    const [dx, dy, dz] = [hx / d, hy / d, hz / d];
    // (square to the arm, and its length)
    const flat = (v: V3) => {
      const a = v.x * dx + v.y * dy + v.z * dz;
      v.x -= dx * a;
      v.y -= dy * a;
      v.z -= dz * a;
      const l = Math.hypot(v.x, v.y, v.z);
      if (l > 1e-6) [v.x, v.y, v.z] = [v.x / l, v.y / l, v.z / l];
      return l;
    };
    flat(pole);
    // (an elbow is a hinge, and folds the forearm forward of the upper arm: a hand low and behind his hip had the
    // elbow out in front of the line to it, the forearm folded back behind a hanging upper arm. There the elbow goes
    // back, as an arm swung behind him has it)
    const ahead = pole.x * this.front.x + pole.y * this.front.y + pole.z * this.front.z;
    if (ahead > 0 && grip < 1) {
      const k = 2 * ahead * smooth(clamp(-dy / HINGE_DOWN, 0, 1)) * (1 - grip);
      pole.x -= this.front.x * k;
      pole.y -= this.front.y * k;
      pole.z -= this.front.z * k;
      flat(pole);
    }
    if (grip > 0) {
      // (the palm faces the ball: its across, side times where the hand sits on the ball, is the elbow's hinge, so the
      // elbow points that crossed with the arm)
      const g = side > 0 ? 0 : 3;
      const gl = Math.hypot(this.grips[g], this.grips[g + 1], this.grips[g + 2]) || 1;
      GRIP_AT.x = (side * this.grips[g]) / gl;
      GRIP_AT.y = (side * this.grips[g + 1]) / gl;
      GRIP_AT.z = (side * this.grips[g + 2]) / gl;
      // (a palm that faces along the arm says nothing of where the elbow goes)
      const w = flat(GRIP_AT) * grip * GRIP_POLE;
      const [mx, my, mz] = [GRIP_AT.y * dz - GRIP_AT.z * dy, GRIP_AT.z * dx - GRIP_AT.x * dz, GRIP_AT.x * dy - GRIP_AT.y * dx];
      pole.x += (mx - pole.x) * w;
      pole.y += (my - pole.y) * w;
      pole.z += (mz - pole.z) * w;
      flat(pole);
    }
    // (from where it pointed last frame, square to the arm as it is now)
    const E = this.elbows;
    const k = side > 0 ? 0 : 3;
    ELB_WAS.x = E[k];
    ELB_WAS.y = E[k + 1];
    ELB_WAS.z = E[k + 2];
    if (this.gripped && this.ownMs > 0 && flat(ELB_WAS) > 0.2) {
      const th = Math.acos(clamp(ELB_WAS.x * pole.x + ELB_WAS.y * pole.y + ELB_WAS.z * pole.z, -1, 1));
      const most = (ELBOW_TURN * this.ownMs) / 1000;
      if (th > most) {
        // (the arm's own line is square to both: turned about it)
        const [ax, ay, az] = th > 3.1 ? [dx, dy, dz] : [ELB_WAS.y * pole.z - ELB_WAS.z * pole.y, ELB_WAS.z * pole.x - ELB_WAS.x * pole.z, ELB_WAS.x * pole.y - ELB_WAS.y * pole.x];
        const al = Math.hypot(ax, ay, az) || 1;
        const [ux, uy, uz] = [ax / al, ay / al, az / al];
        const c = Math.cos(most);
        const sn = Math.sin(most);
        pole.x = ELB_WAS.x * c + (uy * ELB_WAS.z - uz * ELB_WAS.y) * sn;
        pole.y = ELB_WAS.y * c + (uz * ELB_WAS.x - ux * ELB_WAS.z) * sn;
        pole.z = ELB_WAS.z * c + (ux * ELB_WAS.y - uy * ELB_WAS.x) * sn;
      }
    }
    E[k] = pole.x;
    E[k + 1] = pole.y;
    E[k + 2] = pole.z;
    return pole;
  }

  /**
   * A point of his (in his frame, moved in place) kept out of the trunks, heads and thighs of the men in `near`
   * (spacing.ts's shapes, and `r` ft of his own round it): put on the nearest, resting on him, on the side toward himself (a hand
   * reaching into a man is drawn back off him, never flicked through him). Says how far it was moved (ft).
   */
  private rest(at: V3, r: number, near: readonly Puppet[], arms = false, soft = 0): number {
    const w = this.world(at.x, at.y, at.z, WP);
    const x0 = w.x;
    const y0 = w.y;
    const z0 = w.z;
    for (const o of near) {
      if (o === this || !o.placed || Math.hypot(o.x - w.x, o.z - w.z) > CROWD * o.body.s) continue;
      const oj = o.j;
      const d = Math.hypot(this.x - o.x, this.z - o.z) || 1;
      MINE.x = (this.x - o.x) / d;
      MINE.z = (this.z - o.z) / d;
      for (const [p, q, t, limb] of SHAPES) {
        // (his thighs; and, for a hand, his arms too: a contest's hand goes by the shooter's forearm, not through it)
        if (limb && p !== J.jl && p !== J.jr && !(arms && ARM_SHAPE.has(p))) continue;
        o.world(oj[p * 3], oj[p * 3 + 1], oj[p * 3 + 2], SA);
        o.world(oj[q * 3], oj[q * 3 + 1], oj[q * 3 + 2], SB);
        clearOf(w, SA, SB, t * o.body.s * Math.sqrt(o.body.bulk) + r, soft, MINE);
      }
    }
    const moved = Math.hypot(w.x - x0, w.y - y0, w.z - z0);
    if (moved > 0) {
      [at.x, at.z] = this.local(w.x, w.z);
      at.y = w.y;
    }
    return moved;
  }

  /**
   * How far (0..1) a man in `near` is up against his `side`: the nearest trunk (hips to chest, as thick as SHAPES has
   * it) to that shoulder, inside TUCK_FROM ft of it and to that side of him or ahead of it, eased in over TUCK_SPAN.
   */
  private crowded(side: 1 | -1, near: readonly Puppet[]): number {
    const { s } = this.body;
    const j = this.j;
    const k = (side > 0 ? J.sl : J.sr) * 3;
    const sh = this.world(j[k], j[k + 1], j[k + 2], SA);
    let most = 0;
    for (const o of near) {
      if (o === this || !o.placed || Math.hypot(o.x - this.x, o.z - this.z) > CROWD * s) continue;
      const oj = o.j;
      const a = o.world(oj[J.hips * 3], oj[J.hips * 3 + 1], oj[J.hips * 3 + 2], SB);
      const [ax, ay, az] = [a.x, a.y, a.z];
      const b = o.world(oj[J.chest * 3], oj[J.chest * 3 + 1], oj[J.chest * 3 + 2], SB);
      const [ux, uy, uz] = [b.x - ax, b.y - ay, b.z - az];
      const t = clamp(((sh.x - ax) * ux + (sh.y - ay) * uy + (sh.z - az) * uz) / (ux * ux + uy * uy + uz * uz || 1), 0, 1);
      const [px, pz] = [ax + ux * t, az + uz * t];
      const room = Math.hypot(sh.x - px, sh.y - (ay + uy * t), sh.z - pz) - SHAPES[0][2] * o.body.s * Math.sqrt(o.body.bulk);
      // (on that side of him, or ahead: not a man behind his other shoulder)
      const [lx, lz] = this.local(px, pz);
      const d = Math.hypot(lx, lz) || 1;
      const toward = (lx * side) / d + Math.max(0, lz / d) * 0.5;
      if (toward < 0.2) continue;
      most = Math.max(most, smooth(clamp((TUCK_FROM * s - room) / (TUCK_SPAN * s), 0, 1)) * clamp((toward - 0.2) / 0.4, 0, 1));
    }
    return most;
  }

  /**
   * His head kept out of another man's head and trunk (a low drive into a man leaning on him, two going up for the
   * same ball): turned aside off him, a head's give at most, half of it his where it is head on head.
   */
  private heads(near: readonly Puppet[]) {
    const { s, bulk } = this.body;
    const j = this.j;
    const r = SHAPES[3][2] * s * Math.sqrt(bulk);
    HEAD_AT.x = j[J.head * 3];
    HEAD_AT.y = j[J.head * 3 + 1];
    HEAD_AT.z = j[J.head * 3 + 2];
    const x0 = HEAD_AT.x;
    const y0 = HEAD_AT.y;
    const z0 = HEAD_AT.z;
    this.rest(HEAD_AT, r, near);
    let dx = HEAD_AT.x - x0;
    let dy = HEAD_AT.y - y0;
    let dz = HEAD_AT.z - z0;
    const far = Math.hypot(dx, dy, dz);
    if (far <= 0) return;
    const most = HEAD_GIVE_FT * s;
    if (far > most) [dx, dy, dz] = [(dx * most) / far, (dy * most) / far, (dz * most) / far];
    j[J.head * 3] += dx;
    j[J.head * 3 + 1] += dy;
    j[J.head * 3 + 2] += dz;
  }

  /** The ball (not his) is near enough to him, or coming fast enough, for his hands to keep out of its way. */
  private near(by: Loose): boolean {
    const v = Math.hypot(by.v.x, by.v.z);
    return Math.hypot(by.at.x - this.x, by.at.z - this.z) < CROWD * this.body.s + v * DODGE_S;
  }

  /**
   * A point of his (in his frame, moved in place) kept `r` ft and the ball's own size off the ball that isn't his
   * (`by`): off where it is and where it will be `ahead` seconds on, on the side toward himself (a hand over the
   * ball is drawn back off it, never flicked through it). Says how far it was moved (ft).
   */
  private dodge(at: V3, r: number, by: Loose, ahead: number, soft = 0): number {
    const w = this.world(at.x, at.y, at.z, WP);
    const x0 = w.x;
    const y0 = w.y;
    const z0 = w.z;
    const b = by.at;
    ON.x = b.x + by.v.x * ahead;
    ON.y = Math.max(BALL_R, b.y + by.v.y * ahead);
    ON.z = b.z + by.v.z * ahead;
    // (his side of its path: square to the way it is going, toward him. From where the ball is now, a pass coming
    // across in front of him would put his hand on along its path ahead of it, and the ball would catch it up)
    let [mx, mz] = [this.x - b.x, this.z - b.z];
    const v = Math.hypot(by.v.x, by.v.z);
    if (v > 1) {
      const [ux, uz] = [by.v.x / v, by.v.z / v];
      const along = mx * ux + mz * uz;
      const [px, pz] = [mx - along * ux, mz - along * uz];
      if (Math.hypot(px, pz) > 0.05 * this.body.s) [mx, mz] = [px, pz];
    }
    const d = Math.hypot(mx, mz) || 1;
    MINE.x = mx / d;
    MINE.z = mz / d;
    clearOf(w, b, ON, r + BALL_R + DODGE_GAP * this.body.s, soft, MINE);
    const moved = Math.hypot(w.x - x0, w.y - y0, w.z - z0);
    if (moved > 0) {
      [at.x, at.z] = this.local(w.x, w.z);
      at.y = w.y;
    }
    return moved;
  }

  /**
   * An arm (elbow `el`, hand `ha`) as solved, kept out of the ball that isn't his: where its upper arm, its elbow, the
   * middle of its forearm or his hand is in the ball's way (dodge, given way softly over DODGE_SOFT ft), how far the hand
   * must move for that (UPPER_LEVER times as far for the upper arm, twice for the forearm's middle), into CLEAR. Says
   * how far (ft); the hand's follower takes the move (see arms).
   */
  private clearArm(side: 1 | -1, el: number, ha: number, by: Loose): number {
    const j = this.j;
    let most = 0;
    CLEAR.x = CLEAR.y = CLEAR.z = 0;
    // (the middle of his upper arm, his elbow, the middle of his forearm, his wrist, and his hand on past it as far as its
    // fingers go; the upper arm's middle moved by moving the hand UPPER_LEVER times as far)
    const sh = side > 0 ? J.sl : J.sr;
    for (const u of CLEAR_AT) {
      const [a, b, t] = u < 0 ? [sh, el, u + 1] : [el, ha, u];
      HAND.x = j[a * 3] + (j[b * 3] - j[a * 3]) * t;
      HAND.y = j[a * 3 + 1] + (j[b * 3 + 1] - j[a * 3 + 1]) * t;
      HAND.z = j[a * 3 + 2] + (j[b * 3 + 2] - j[a * 3 + 2]) * t;
      const [x0, y0, z0] = [HAND.x, HAND.y, HAND.z];
      const m = u < 0 ? UPPER_LEVER : u === 0.5 ? 2 : 1;
      const d = this.dodge(HAND, (u < 1 ? ARM_R : u > 1 ? FINGERS_R : HAND_R) * this.body.s, by, DODGE_S, DODGE_SOFT * this.body.s) * m;
      if (d <= most) continue;
      [CLEAR.x, CLEAR.y, CLEAR.z, most] = [(HAND.x - x0) * m, (HAND.y - y0) * m, (HAND.z - z0) * m, d];
    }
    return most;
  }

  /** A free hand's place other than his move's (his frame) and how far it goes there, 0..1: see guard. */
  private aim(side: 1 | -1, x: number, y: number, z: number, w: number) {
    const k = side > 0 ? 0 : 4;
    const A = this.aims;
    // (never nearer his shoulder than AIM_NEAR: an arm after something right by him reaches, it doesn't fold shut)
    const sh = (side > 0 ? J.sl : J.sr) * 3;
    const j = this.j;
    const [dx, dy, dz] = [x - j[sh], y - j[sh + 1], z - j[sh + 2]];
    const d = Math.hypot(dx, dy, dz);
    const least = AIM_NEAR * this.body.s;
    const k2 = d < least && d > 1e-4 ? least / d : 1;
    A[k] = j[sh] + dx * k2;
    A[k + 1] = j[sh + 1] + dy * k2;
    A[k + 2] = j[sh + 2] + dz * k2;
    A[k + 3] = clamp(w, 0, 1);
  }

  /**
   * Where his free hands go other than where his move has them (into `aims`, see aim). A defender on the ball has the
   * hand on its side low at it and the other up in the passing lane, and now and then takes a swipe at it (GUARD_*,
   * SWIPE_*); a contest's hand goes up at the ball as it goes up, or, at the rim, both arms go straight up (VERT_NEAR); a
   * defender with a man driving by him has a hand on his hip (CHECK_*). A man leaning on another (Drive.touch) has his
   * hands on him: a box-out's back on the man behind him, the man boxed out's on the boxer's back and hip, a post's on the
   * man playing him (LEAN_HANDS). Out of a man the hands come to rest on him (see arms), and they keep off the ball.
   */
  private guard(loose: Loose | null, near: readonly Puppet[]) {
    const A = this.aims;
    A[3] = A[7] = 0;
    const { s } = this.body;
    const j = this.j;
    const id = this.clip;
    const one = this.one;
    const own = this.ownMs;
    this.swipeT += own;
    if (this.has) return;
    // on the ball: one hand low at it, one up in the lane; a swipe at it now and then
    if (loose && (id === 'stance' || id === 'shuffle')) {
      const [lx, lz] = this.local(loose.at.x, loose.at.z);
      const w = smooth(clamp((GUARD_NEAR * s - Math.hypot(lx, lz)) / (GUARD_EASE * s), 0, 1)) * smooth(clamp((lz - 0.5 * s) / s, 0, 1)) * (id === 'shuffle' ? GUARD_SLIDE : 1);
      if (w > 0) {
        if (lx * this.bside < -SIDE_SWAP * s) this.bside = this.bside > 0 ? -1 : 1;
        const bs = this.bside;
        if (id === 'stance' && loose.at.y < SWIPE_LOW * s && Math.hypot(lx, lz) < SWIPE_NEAR * s && (this.swipeIn -= own) <= 0) {
          this.swipeT = 0;
          this.swipeIn = (SWIPE_EVERY * (0.6 + hash(this.who, 400 + this.standN++))) / this.swipeK;
        }
        const swipe = this.swipeT < SWIPE_MS ? Math.sin((Math.PI * this.swipeT) / SWIPE_MS) : 0;
        for (const side of SIDES) {
          const sh = (side > 0 ? J.sl : J.sr) * 3;
          const [ox, oy, oz] = side === bs ? GUARD_LOW : GUARD_UP;
          let x = j[sh] + side * ox * s;
          let y = j[sh + 1] + oy * s;
          let z = j[sh + 2] + oz * s;
          if (side === bs) {
            x += (lx - x) * GUARD_TO_BALL;
            x += (lx - x) * swipe * 0.8;
            y += (loose.at.y + 0.2 * s - y) * swipe * 0.8;
            z += (lz - z) * swipe * 0.8;
          }
          this.aim(side, x, y, z, w * GUARD_K);
        }
      }
    }
    // a contest: the hand on the ball's side up at it as it goes up (the other as the move has its low one); both
    // straight up at the rim
    if (loose && one && (id === 'contest' || id === 'block') && one.tau > -260 && one.tau < 420) {
      const [lx, lz] = this.local(loose.at.x, loose.at.z);
      const close = Math.hypot(lx, lz);
      const env = smooth(clamp((one.tau + 240) / 170, 0, 1)) * (1 - smooth(clamp((one.tau - 240) / 170, 0, 1)));
      // (verticality is for a man going up at the rim: a jumper is contested with a hand at the ball)
      let rim = false;
      for (const o of near) if (o !== this && AT_RIM.has(o.clip) && Math.hypot(o.x - this.x, o.z - this.z) < (VERT_NEAR + 1) * s) rim = true;
      const vert = rim ? smooth(clamp((VERT_NEAR * s - close) / (0.8 * s), 0, 1)) : 0;
      // (the hand on the ball's side as he goes up: it stays that hand all the way)
      if (env < 0.1 && lx * this.bside < -SIDE_SWAP * s) this.bside = this.bside > 0 ? -1 : 1;
      const bs = this.bside;
      for (const side of SIDES) {
        const sh = (side > 0 ? J.sl : J.sr) * 3;
        let x: number;
        let y: number;
        let z: number;
        if (side === bs) {
          // (as near the ball as his arm reaches, and above his head: a hand up at the release, in the shooter's sight,
          // CONTEST_SHORT ft short of it: not on the ball, nor through the shooter's arms to it)
          let dx = (lx - j[sh]) * CONTEST_TOWARD;
          let dy = Math.max(loose.at.y + 0.3 * s - j[sh + 1], 1.5 * s);
          let dz = (lz - j[sh + 2]) * CONTEST_TOWARD;
          const d = Math.hypot(dx, dy, dz) || 1;
          const most = Math.min((UARM + FARM) * s * 0.97, d - CONTEST_SHORT * s);
          if (d > most) [dx, dy, dz] = [(dx * most) / d, (dy * most) / d, (dz * most) / d];
          [x, y, z] = [j[sh] + dx, j[sh + 1] + dy, j[sh + 2] + dz];
        } else if (bs > 0) [x, y, z] = [j[sh] + side * CONTEST_LOW[0] * s, j[sh + 1] + CONTEST_LOW[1] * s, j[sh + 2] + CONTEST_LOW[2] * s];
        else {
          // (his move's own low hand, but at the rim)
          if (vert > 0) this.aim(side, j[sh] + side * 0.12 * s, j[sh + 1] + 2.05 * s, j[sh + 2] + 0.3 * s, env * vert);
          continue;
        }
        // (at the rim: both arms straight up, no reach at the ball)
        x += (j[sh] + side * 0.12 * s - x) * vert;
        y += (j[sh + 1] + 2.05 * s - y) * vert;
        z += (j[sh + 2] + 0.3 * s - z) * vert;
        this.aim(side, x, y, z, env);
      }
    }
    // a hand on the man driving by him, at his hip
    if (CHECKS.has(id) && (this.act === 'guard' || this.act === 'defend' || this.act === 'trap'))
      for (const o of near) {
        if (o === this || !o.has || !o.placed) continue;
        const [cx, cz] = this.local(o.x, o.z);
        const w = smooth(clamp((CHECK_NEAR * s - Math.hypot(cx, cz)) / s, 0, 1)) * smooth(clamp((Math.hypot(o.vx, o.vz) * 1000 - 4) / 6, 0, 1)) * CHECK_K;
        if (w > 0.01) this.aim(cx >= 0 ? 1 : -1, cx, (HIP + 0.1) * o.body.s, cz, w);
      }
    // leaning on a man: his hands on him (they come to rest on his body: see arms)
    // (and as he comes off him they come down as his lean on him goes (felt), whatever he does next: not let go of the
    // frame he walks away)
    // (a screener met while he is still getting there, or as he comes off it: his arms are in across his chest as they
    // are once he is set (the screen clip's own), as far as the man is on him. Still swinging at a jog, they were into
    // the man he screens, and he was only seen to set the screen once the man had gone by)
    // (going up for the ball out of it, a move of his own, they come off him over LEAN_OUT: the hand on his back goes up
    // for the ball from there, it isn't thrown up from it the frame he goes)
    const leant = id === 'boxout' || id === 'crash' || id === 'postUp';
    const was = this.leanAs;
    this.leanOneMs = this.one && was ? this.leanOneMs + this.ownMs : 0;
    if (leant) this.leanAs = id;
    else if (this.act === 'screen' && id !== 'screen' && !this.has && !this.one) this.leanAs = 'screen';
    else if (this.felt <= 0.05 || (this.one && this.leanOneMs >= LEAN_OUT)) this.leanAs = null;
    const as = this.leanAs;
    // (and they go there over LEAN_IN ms from when he took it up, however hard he was on the man already)
    this.leanMs = as === was ? this.leanMs + this.ownMs : 0;
    if (this.felt > 0.05 && as) {
      const [mx, mz] = this.local(this.tx, this.tz);
      // (as far as the man is behind a boxer, or ahead of the man boxed out: eased as he comes round, not at once)
      const w =
        this.felt *
        LEAN_HANDS *
        smooth(clamp(this.leanMs / LEAN_IN, 0, 1)) *
        (1 - smooth(clamp(this.leanOneMs / LEAN_OUT, 0, 1))) *
        (as === 'postUp' || as === 'screen' ? 1 : smooth(clamp(((as === 'boxout' ? -mz : mz) / s + 0.1) / 0.5, 0, 1)));
      if (as === 'screen')
        for (const side of SIDES) {
          const sh = (side > 0 ? J.sl : J.sr) * 3;
          const [ox, oy, oz] = side > 0 ? SCREEN_ARMS[0] : SCREEN_ARMS[1];
          this.aim(side, j[sh] + side * ox * s, j[sh + 1] + oy * s, j[sh + 2] + oz * s, w);
        }
      else if (as === 'boxout' && mz < 0.1 * s)
        // (his arms out wide at his shoulders, elbows out: across the man behind him, a wall as wide as he can make it.
        // Not down and back at his own hips, which is where the other man's hips and hands are: the two men's arms were
        // laced together at their waists)
        for (const side of SIDES) {
          const sh = (side > 0 ? J.sl : J.sr) * 3;
          this.aim(side, j[sh] + side * BOX_HANDS[0] * s, j[sh + 1] + BOX_HANDS[1] * s, j[sh + 2] + BOX_HANDS[2] * s, w);
        }
      else if (as === 'crash' && mz > -0.1 * s) {
        // (a hand on the boxer's side, at his ribs, and his other hand up over him for the ball: one arm on the man and
        // one above him. The boxer's own are up, so nothing of the two is laced at their waists. On the boxer's side,
        // not across his back: a forearm across it was in it. Which arm is the one on the side the boxer is, his own
        // habit with the man dead ahead of him (see BAR_SWAP): a hand of his habit's, the man on his other side, went
        // two feet across his own chest to him and swept back as the man came round)
        if (!this.barSide) this.barSide = this.who % 2 ? 1 : -1;
        if (mx > BAR_SWAP * s) this.barSide = 1;
        else if (mx < -BAR_SWAP * s) this.barSide = -1;
        const bar = this.barSide > 0 ? 1 : -1;
        const bx = mx + bar * CRASH_BAR[0] * s;
        this.aim(bar, bar > 0 ? Math.max(bx, BAR_IN * s) : Math.min(bx, -BAR_IN * s), CRASH_BAR[1] * s, Math.max(CRASH_BAR[2] * s, mz - 0.1 * s), w);
        const sh = (bar > 0 ? J.sr : J.sl) * 3;
        this.aim(-bar as 1 | -1, j[sh] - bar * CRASH_UP[0] * s, j[sh + 1] + CRASH_UP[1] * s, j[sh + 2] + CRASH_UP[2] * s, w * 0.85);
      } else if (as === 'postUp' && leant && mz < 0) this.aim(1, mx + 0.4 * s, 3.4 * s, mz, w);
    }
  }

  /** A move of his own between the play's (a crossover, a hesitation), kept with the possession: played again, it comes where it came (see Tape). */
  /**
   * The way he takes the ball across this time, from the ways there are (`from`, each as often as it is listed): his own
   * turn of them (`k`), and never one he hasn't the handle for (FANCY: those go in front of him instead).
   */
  private across2(from: readonly ClipId[], k: number): ClipId {
    const id = from[Math.floor(hash(this.who, k) * from.length) % from.length];
    return FANCY.has(id) && (this.body.skill ?? 0) < FANCY_SKILL ? 'crossover' : id;
  }

  private own(d: Drive, id: ClipId) {
    this.one = { id, tau: 0 };
    if (!d.tape || d.tape.again) return;
    const key = `${this.who}:own`;
    const l = (d.tape.takes.get(key) as { t: number; id: ClipId }[] | undefined) ?? [];
    if (!l.length) d.tape.takes.set(key, l);
    l.push({ t: d.t ?? 0, id });
  }

  /**
   * His arms: to where the pose has his hands, or onto the ball (the scene's point) as far as each hand has hold of it.
   * `near`: the men round him (the ten on the floor): a free hand or an arm that would go into one of them rests on
   * him instead, or is drawn back off him. `loose`: the ball when it isn't his (where it is, and how fast it is going, ft
   * a second of the bodies' time): his free hands and forearms keep out of its way (see dodge).
   */
  arms(ball: V3 | null, near: readonly Puppet[] = [], loose: Loose | null = null) {
    const { s } = this.body;
    // (a hand-off coming to him: his hands go onto the ball where it is, in the other man's, before his own grip closes on it)
    this.takeE = ball ? this.takeE + clamp(this.takeW - this.takeE, -1, this.ownMs / TAKE_OUT_MS) : 0;
    const taking = this.takeE;
    this.takeW = 0;
    // (and one he is handing off: his hands are on it where it is as long as they have hold of it)
    const giveK = ball ? this.giveK : -1;
    const giving = giveK >= 0;
    const giveOn = giving && this.giveHeld;
    this.giveK = -1;
    const P = this.pose;
    const j = this.j;
    // (either end of a hand-off: his hold of it is the exchange's, not his clip's clock's: the giver's until it is
    // taken, the taker's as far as his hands are sent to it)
    if (giving) P[I.gl] = P[I.gr] = giveK;
    else if (taking > 0) {
      P[I.gl] = Math.max(P[I.gl], taking);
      P[I.gr] = Math.max(P[I.gr], taking);
    }
    this.loose = this.one ? 0 : this.loose + this.ownMs;
    this.catchT += this.ownMs;
    if (near.length) this.heads(near);
    // (how near the nearest man is, for next frame: by a man he keeps to the plan's spot, which is what keeps them apart)
    let room = Infinity;
    for (const o of near) if (o !== this && o.placed) room = Math.min(room, Math.hypot(o.x - this.x, o.z - this.z));
    this.room = room;
    const l = this.left;
    const f = this.front;
    let bx = 0;
    let by = 0;
    let bz = 0;
    if (ball) {
      [bx, bz] = this.local(ball.x, ball.z);
      by = ball.y;
    }
    // (the ball where the scene has it, whatever his hands are to do about it)
    const [sbx, sby, sbz] = [bx, by, bz];
    const grip = CLIPS[this.clip].grip;
    // (a dribble in the air: the hand it left, and past halfway the hand it is going to, stays over it)
    const dr = ball && grip === 'top' ? this.dribble : null;
    // (his off arm's own way, only as he dribbles in the one hand: it is gone at once for a crossover, back in its time)
    const steady = !!dr && DRIBBLES.has(this.clip) && !this.one && !CROSSES.has(this.clip);
    this.offW = steady ? this.offW + (1 - this.offW) * (1 - Math.exp(-this.ownMs / OFF_IN_MS)) : 0;
    const over = dr && dr.phase < 1 ? (dr.phase > 0.5 ? dr.to : dr.hand) : 0;
    this.overBall = dr ? (over === 0 ? dr.hand : over) : 0;
    this.push = !dr ? -1 : dr.phase < 1 ? 1 + dr.phase : dr.touch;
    // (a pass on its way to him: his hands wait for it out where it will come to them, toward where it comes from (see
    // CATCH_OUT); one from behind him is met at his side, not reached back for)
    const one = this.one;
    // (and a lob he is going up for: his hands are up where his dunk will have it, out toward it as it comes)
    const meeting = !!ball && !this.has && !taking && ((one?.id === 'catch' && one.tau < 0) || (this.how === 'oop' && this.act === 'dunk' && isDunk(one?.id)));
    if (meeting) {
      // (where he takes it: where his move has it, less where his hands are out for it; the ball is flown to his hands)
      const c = this.ballWant();
      const e = this.metT < CATCH_IN ? 1 - smooth(this.metT / CATCH_IN) : 0;
      const cx = c.x - this.met.x * e;
      const cz = c.z - this.met.z * e;
      const cy = c.y - this.met.y * e;
      const far = Math.hypot(bx - cx, by - cy, bz - cz) || 1;
      // (in front of him: a pass from off to his side is met in front of his chest, not out at his hip)
      const ux = clamp((bx - cx) / far, -CATCH_WIDE, CATCH_WIDE);
      const uy = clamp((by - cy) / far, -0.4, 0.6);
      const uz = Math.max(0, (bz - cz) / far);
      const ul = Math.hypot(ux, uy, uz) || 1;
      // (one held still, not thrown: a referee's, to be put in his hands)
      const B = this.ballWas;
      const moving = B[3] === 0 || this.ownMs <= 0 || (Math.hypot(ball!.x - B[0], ball!.y - B[1], ball!.z - B[2]) * 1000) / this.ownMs > CATCH_STILL;
      // (out there, and waiting: the ball comes into them. Not gone after it as it comes the last foot, which is a snatch)
      const out = moving ? (CATCH_OUT * s) / ul : 0;
      [this.met.x, this.met.y, this.met.z] = [ux * out, uy * out, uz * out];
      this.metT = 0;
      [bx, by, bz] = [cx + this.met.x, cy + this.met.y, cz + this.met.z];
    } else this.metT += this.ownMs;
    if (ball) [this.ballWas[0], this.ballWas[1], this.ballWas[2], this.ballWas[3]] = [ball.x, ball.y, ball.z, 1];
    else this.ballWas[3] = 0;
    // (the ball on its way to his hands from a referee's: they are up where his move will have it, ready for it before
    // it comes, not still coming up as it gets there. A move that has it in his hands while it isn't, and isn't on its way
    // to them, has them hang: they don't hold nothing out in front of him)
    const holdsIt = Math.max(P[I.gl], P[I.gr]);
    const handed = !ball && !loose && holdsIt > 0.02 && !this.onRim;
    if (handed) {
      const c = this.carry(MEET);
      [bx, bz] = this.local(c.x, c.z);
      by = c.y;
    }
    // (a pass let go: his hands follow through as his throw takes them, as fast as the clip swings them; they don't
    // chase the ball down the floor for the frames their grip takes to open)
    if (ball && !this.has && !meeting && one && THROWN.has(one.id) && one.tau >= 0) {
      const c = this.carry(MEET);
      [bx, bz] = this.local(c.x, c.z);
      by = c.y;
    }
    const empty = !ball && !!loose && CLIPS[this.clip].kind === 'loop' ? smooth(clamp(holdsIt, 0, 1)) : 0;
    // (what his free hands do other than his move's: a defender's, a hand on a man he is leaning on)
    this.guard(loose, near);
    const A = this.aims;
    const sec = this.ownMs / 1000;
    const drawn = this.easeMs / 1000;
    // (the ball his hands' own path goes onto: his own, where the scene has it (in his hands, on its way down and up in
    // a dribble); else where his move has it, or will (carry, followed: see settleBall))
    const C = this.ballAt;
    // (a ball well off where he would have it (still on its way, across the floor) is not one for his hands to go to:
    // they are where his move has it, and go on to it as it comes near. Eased by how far off it is: never a jump)
    const off = (x: number, y: number, z: number, ax: number, ay: number, az: number) =>
      smooth(clamp((Math.hypot(x - ax, y - ay, z - az) - BALL_NEAR * s) / (BALL_NEAR * s), 0, 1));
    // (how far a hand's going onto the ball, or off it to where his move has it, may change this frame: see BALL_TO)
    const toBallMost = Math.min((BALL_TO * this.ownMs) / 1000, BALL_TO_FRAME * Math.max(1, drawn * 60));
    if (ball || handed) {
      // (but a hand-off held out to him is gone to wherever it is held; and one he is giving is in his hands wherever it
      // is, in the taker's pocket as that goes off with the taker: his hands don't go back to where his own move had it)
      // (and that changes as a hand moves, not as fast as the ball does: a ball thrown to a man who stands holding his
      // hands for it crossed the last foot to him in three frames, and his hands went a foot out to it in one)
      const farK = off(bx, by, bz, C.x, C.y, C.z);
      this.farE = this.gripped ? this.farE + clamp(farK - this.farE, -toBallMost, toBallMost) : farK;
      const k = this.farE * (1 - taking) * (giveOn ? 0 : 1);
      [bx, by, bz] = [bx + (C.x - bx) * k, by + (C.y - by) * k, bz + (C.z - bz) * k];
    }
    // (leaning on a man for a rebound his hands are where that has them (see guard): not tucked in out of his way too)
    const leans = this.felt > 0.05 && (this.leanAs === 'boxout' || this.leanAs === 'crash');
    for (const side of [1, -1] as const) {
      const si = side > 0 ? 0 : 1;
      const sh = (side > 0 ? J.sl : J.sr) * 3;
      const el = side > 0 ? J.el : J.er;
      const ha = side > 0 ? J.hl : J.hr;
      const ox = P[side > 0 ? I.lx : I.rx] * s * side;
      const oy = P[side > 0 ? I.ly : I.ry] * s;
      const oz = P[side > 0 ? I.lz : I.rz] * s;
      // his clip's hand, from its shoulder
      const cx = l.x * ox + f.x * oz;
      const cy = oy + l.y * ox + f.y * oz;
      const cz = l.z * ox + f.z * oz;
      // on its side (two hands), on top of it (a dribble), or under and behind it (a shot): from one to another
      // (a catch into a dribble) the hand goes round the ball, it doesn't jump to its new side
      // (down the ball's side less as it is lower than his chest: held at his hip, an arm across him keeps out of him)
      let gx = side * SIDE_GRIP[0];
      let gy = SIDE_GRIP[1] * clamp(((ball ? sby : C.y) - SIDE_LOW * s) / (0.6 * s), 0, 1);
      let gz: number = SIDE_GRIP[2];
      if (grip === 'top') [gx, gy] = [0, PALM];
      else if (grip === 'under' && side === (this.south && this.clip === 'layup' ? 1 : -1)) [gx, gy, gz] = [0, -PALM * 0.7, -PALM * 0.7];
      const go = side > 0 ? 0 : 3;
      const ge = this.gripped ? 1 - Math.exp(-this.ownMs / GRIP_MS) : 1;
      this.grips[go] += (gx - this.grips[go]) * ge;
      this.grips[go + 1] += (gy - this.grips[go + 1]) * ge;
      this.grips[go + 2] += (gz - this.grips[go + 2]) * ge;
      // (how far his clip has this hand on the ball: a dribble he holds has the hand it is in on it)
      const gp = dr && dr.phase >= 1 && dr.hand === side ? 1 : clamp(P[side > 0 ? I.gl : I.gr], 0, 1);
      // (out to meet a pass all the way once his catch is a little way into its hold; up for a lob as he leaves the floor:
      // on it, his arms swing up with his jump, they don't wait by his face)
      const gm = meeting ? smooth(clamp(gp / CATCH_SHOW, 0, 1)) * (one && isDunk(one.id) ? smooth(clamp(P[I.air] * 1.6, 0, 1)) : 1) : gp;

      // (and onto it, or off it, no faster than a hand goes from where his clip has it to the ball: a layup's hand let go
      // of at the rim is on its way down to his side over a beat, not dropped three feet in four frames)
      const F = this.handF[si];
      const toBall = Math.hypot(C.x + this.grips[go] - j[sh] - cx, C.y + this.grips[go + 1] - j[sh + 1] - cy, C.z + this.grips[go + 2] - j[sh + 2] - cz);
      const GS = this.gripS;
      if (!F.on) GS[si] = gm;
      else {
        const most = (Math.min(GRIP_SPEED * sec, GRIP_FRAME * Math.max(1, drawn * 60)) * s) / Math.max(toBall, 0.05);
        GS[si] += clamp(gm - GS[si], -most, most);
      }
      const gw = GS[si];
      // the path the hand follows exactly: his clip's hand, onto the ball as far as his clip's grip has it, and over
      // his dribble as it leaves his palm and comes back to it. Nothing else is in it: it moves as his clip moves him.
      // (The ball it goes onto is his own in the scene while that is by the hand (held, or back up off a bounce), else
      // where his move has it, or will: eased by how far the ball is from where the hand was. A ball leaving his hands
      // (a pass, a shot) is not followed down the floor by them, and one coming to them is met where his move takes it)
      const [hwx, hwy, hwz] = F.on ? [j[sh] + F.at.x, j[sh + 1] + F.at.y, j[sh + 2] + F.at.z] : [C.x, C.y, C.z];
      // (a hand-off held out to him is gone to as he takes it, wherever it is held: that is his move)
      // (and one he is giving is held where it is, in the other man's hands too, until his own let go)
      const own1 =
        ball && this.has ? (1 - off(sbx + this.grips[go], sby + this.grips[go + 1], sbz + this.grips[go + 2], hwx, hwy, hwz)) * (1 - off(sbx, sby, sbz, C.x, C.y, C.z)) : 0;
      // (paced as above: his hand's path goes onto the ball in the scene, and back off it, as a hand goes)
      const OE = this.onE;
      OE[si] = F.on && ball ? OE[si] + clamp(own1 - OE[si], -toBallMost, toBallMost) : own1;
      const onIt = ball ? Math.max(OE[si], taking, giveOn ? 1 : 0) : 0;
      const rbx = C.x + (sbx - C.x) * onIt;
      const rby = C.y + (sby - C.y) * onIt;
      const rbz = C.z + (sbz - C.z) * onIt;
      const gt = Math.max(gw, taking);
      let px = cx + (rbx + this.grips[go] - j[sh] - cx) * gt;
      let py = cy + (rby + this.grips[go + 1] - j[sh + 1] - cy) * gt;
      let pz = cz + (rbz + this.grips[go + 2] - j[sh + 2] - cz) * gt;
      // (over the ball all the way down and up; on it as it leaves and as it comes back, so they part and meet; never pressed into it)
      const u = dr ? dr.phase : 1;
      const ok = over === side ? (dr!.to === dr!.hand ? 1 : smooth(clamp(Math.abs(u - 0.5) / 0.3, 0, 1))) : 0;
      // (down with it as he pushes it, then back up to wait for it: it comes up to his palm at his palm's own speed (see
      // bounce), and the palm gives with it from a little before it gets there. It doesn't go down again to fetch it)
      const on = over === side ? 1 - smooth(clamp(u / 0.22, 0, 1)) : 0;
      if (over === side) {
        px += (sbx - j[sh] - px) * ok;
        pz += (sbz - j[sh + 2] - pz) * ok;
        py = softMax(py + (sby + PALM - j[sh + 1] - py) * on, sby + PALM * ok - j[sh + 1], PALM_SOFT * s);
      }

      // where he wants it: his clip's hand, and all that is laid on it this moment
      let x = j[sh] + cx;
      let y = j[sh + 1] + cy;
      let z = j[sh + 2] + cz;
      if (empty > 0) {
        x += (j[sh] + (l.x * HANG[0] * side + f.x * HANG[2]) * s - x) * empty;
        y += (j[sh + 1] + HANG[1] * s - y) * empty;
        z += (j[sh + 2] + (l.z * HANG[0] * side + f.z * HANG[2]) * s - z) * empty;
      }
      // (dribbling, the arm off the ball his own way: up between him and the man as a bar, or down by him (see style); only
      // in a dribble that stays in the one hand: one that goes from hand to hand has that hand back for it)
      if (dr && side !== dr.hand && this.offW > 0.01 && P[side > 0 ? I.gl : I.gr] <= 0.5) {
        const k = this.offArm * this.offW;
        y += k * 0.6 * s;
        x += f.x * k * 0.25 * s;
        z += f.z * k * 0.25 * s;
      }
      const ai = side > 0 ? 0 : 4;
      const aw = A[ai + 3];
      if (aw > 0) {
        x += (A[ai] - x) * aw;
        y += (A[ai + 1] - y) * aw;
        z += (A[ai + 2] - z) * aw;
      }
      // (hanging on the rim: each hand on the ring, either side of its middle)
      if (this.onRim) {
        const [rx, rz] = this.local(this.ax, this.az);
        x = rx + side * 0.5 * s;
        y = RIM_Y;
        z = rz;
      }
      // (a five: the hand goes to where it meets his teammate's)
      const r = this.reach;
      if (r && r.side === side && r.w > 0) {
        const [rx, rz] = this.local(r.x, r.z);
        // (not to a place he has run on past: the hand goes up for it beside him, it isn't flung back behind him)
        const w = r.w * smooth(clamp(1 + rz / (FIVE_BACK * s), 0, 1));
        x += (rx - x) * w;
        y += (r.y - y) * w;
        z += (rz - z) * w;
      }
      // (a hand going onto a hand-off is a hand on the ball: it isn't rested on the man holding it out, or tucked away. A
      // move that has it in his hands while there is none to go to has them hang, as above)
      const g = Math.max(ball || handed ? gp : 0, taking);
      // (a man up against that side: the arm comes in to him, or, already up, goes on up out of his way; a hand that is
      // on him or after the ball half as far)
      const tuck = near.length && !this.onRim && !(r && r.side === side && r.w > 0) ? this.crowded(side, near) * (1 - g) * (1 - (leans ? 1 : 0.5) * aw) : 0;
      if (tuck > 0) {
        // (up: the hand already well over his shoulder)
        const up = y - j[sh + 1] > 0.7 * s;
        const [tx, ty, tz] = up ? TUCK_UP : TUCK;
        x += (j[sh] + (l.x * tx * side + f.x * tz) * s - x) * tuck;
        y += (j[sh + 1] + ty * s - y) * tuck;
        z += (j[sh + 2] + (l.z * tx * side + f.z * tz) * s - z) * tuck;
      }
      if (g > 0) {
        // (his clip's grip as paced above; a hand-off's as it comes)
        const w = Math.max(ball || handed ? gw : 0, taking);
        x += (bx + this.grips[go] - x) * w;
        y += (by + this.grips[go + 1] - y) * w;
        z += (bz + this.grips[go + 2] - z) * w;
      }
      if (over === side) {
        x += (sbx - x) * ok;
        z += (sbz - z) * ok;
        y = softMax(y + (sby + PALM - y) * on, sby + PALM * ok, PALM_SOFT * s);
      }

      // (and out of the way of the ball that isn't his, where it will be a moment on: as he sees it coming, so eased in
      // like anything else he wants of his hand, not knocked off it. And as far as his arm, as it was, was in its way)
      const dodging = !!loose && g < 0.5 && !this.onRim && this.near(loose);
      const AD = this.armDodge;
      const ao = si * 3;
      if (dodging) {
        HAND.x = x + AD[ao];
        HAND.y = y + AD[ao + 1];
        HAND.z = z + AD[ao + 2];
        this.dodge(HAND, HAND_R * s, loose!, DODGE_S, DODGE_SOFT * s);
        [x, y, z] = [HAND.x, HAND.y, HAND.z];
      } else AD.fill(0, ao, ao + 3);
      // followed: the path exactly, and what is wanted off it as a spring, no faster than a hand goes (see settle.ts)
      const held = over === side || this.onRim || (giving && gp >= 0.5) ? 1 : g;
      const hk = smooth(clamp(held, 0, 1));
      const HP = HAND_PACE;
      if (this.onRim) [HP.w, HP.speed, HP.frame] = [RIM_W, RIM_SPEED, RIM_FRAME];
      else if (taking > 0) [HP.w, HP.speed, HP.frame] = [2000 / HAND_TAKE_MS, HAND_TAKE_SPEED, HELD_FRAME];
      else {
        const wf = 2000 / (HAND_MS * this.handK);
        HP.w = wf + (2000 / HAND_HELD_MS - wf) * hk;
        HP.speed = HAND_SPEED + (HELD_SPEED - HAND_SPEED) * hk;
        HP.frame = FREE_FRAME + (HELD_FRAME - FREE_FRAME) * hk;
      }
      // (either end of a hand-off, his hands sent all the way to it: they are on it, or going onto it, where it is, and
      // go with it; the ball they hold is itself followed (see settleBall), so nothing of it is a jump to carry)
      // (only once they are on it, or all but: a hand reaching for it from his side comes to it like any hand)
      const stuck = (taking >= 0.99 && F.on && this.handOff[si] < STICK * s) || giveOn;
      const at = F.step(px, py, pz, x - j[sh], y - j[sh + 1], z - j[sh + 2], sec, drawn, HP, s, stuck);
      // (never farther from his shoulder than his arm reaches: past that it would be a hand left behind, owed for seconds)
      const reachMost = (UARM + FARM) * s;
      const far = Math.hypot(at.x, at.y, at.z);
      if (far > reachMost) F.push((at.x * (reachMost - far)) / far, (at.y * (reachMost - far)) / far, (at.z * (reachMost - far)) / far);

      // what is in its way moves it where it is: a free hand into another man rests on him, and slides over him as either
      // moves; it keeps off the ball that isn't his. Never faster than a hand is snatched back (PULL_IN), so out of a man
      // over a frame or two, never hopped out of him (see settle.ts)
      const free = near.length > 0 && g < 0.5 && !this.onRim;
      // (it is pushed as a hand is: from rest, gathering speed, as far as it was pushed last frame and PUSH_GROW more a
      // drawn frame, up to PULL_IN; not moved at full speed the first frame a man touches it, at any playback speed. And
      // no farther in a drawn frame than PULL_FRAME: played fast, a hand is still drawn off a man over frames)
      const PV = this.pushV;
      const frames = Math.max(1, drawn * 60);
      // (played fast, it gathers quicker a frame: as much quicker as the play is fast, over its square root, so a hand is
      // neither left in a man for frames at 4x nor knocked off him in one)
      const fast = Math.sqrt(Math.max(1, this.ownMs / Math.max(1, this.easeMs)));
      const most = Math.min(Math.max(PULL_LEAST, PV[si] + PUSH_GROW * frames * fast), (PULL_IN * this.ownMs) / 1000, PULL_FRAME * frames) * s;
      let left = most;
      if (free) {
        HAND.x = j[sh] + at.x;
        HAND.y = j[sh + 1] + at.y;
        HAND.z = j[sh + 2] + at.z;
        const [x0, y0, z0] = [HAND.x, HAND.y, HAND.z];
        this.rest(HAND, HAND_R * s, near, true, HAND_SOFT * s);
        left -= F.push(HAND.x - x0, HAND.y - y0, HAND.z - z0, left);
      }
      // (never folded in to his shoulder: a hand wanted that near reaches, it doesn't fold the arm shut)
      if (!this.onRim) {
        const want = Math.hypot(x - j[sh], y - j[sh + 1], z - j[sh + 2]);
        const least = Math.max(Math.min(HAND_NEAR * s, want), FOLD_LEAST * s);
        const d = Math.hypot(at.x, at.y, at.z);
        if (d < least && d > 1e-4) F.push((at.x * (least - d)) / d, (at.y * (least - d)) / d, (at.z * (least - d)) / d);
      }
      const put = () => {
        j[ha * 3] = j[sh] + F.at.x;
        j[ha * 3 + 1] = Math.max(0.2 * s, j[sh + 1] + F.at.y);
        j[ha * 3 + 2] = j[sh + 2] + F.at.z;
      };
      put();
      // the elbow: down, out and a little back, swung the way the pose has it
      const pole = this.elbow(side, j[ha * 3] - j[sh], j[ha * 3 + 1] - j[sh + 1], j[ha * 3 + 2] - j[sh + 2], P[side > 0 ? I.lsw : I.rsw], gp);
      const solve = () => reach(j, side > 0 ? J.sl : J.sr, el, ha, UARM * s, FARM * s, pole.x, pole.y, pole.z);
      solve();
      // (his upper arm, his elbow or his forearm in the ball's way: the hand is wanted that much farther off it next frame)
      if (dodging) {
        this.clearArm(side, el, ha, loose!);
        AD[ao] += (CLEAR.x - AD[ao]) * 0.5;
        AD[ao + 1] += (CLEAR.y - AD[ao + 1]) * 0.5;
        AD[ao + 2] += (CLEAR.z - AD[ao + 2]) * 0.5;
      }
      // (his elbow, his forearm or his wrist in another man, his trunk, his thighs or his arms: the hand is drawn back off
      // him as far as that takes, and the arm solved again. Two hugging have their arms round each other by design)
      const arms = this.clip !== 'hug';
      // (and half as far again for his arm: an arm across a man is drawn off him a little quicker than a hand is let
      // onto him, never at a hop)
      let armLeft = left + most * 0.5;
      const pushed0 = most - left + armLeft;
      if (free && near.length)
        for (let pass = 0; pass < ARM_PASSES && armLeft > 1e-4; pass++) {
          let mx = 0;
          let my = 0;
          let mz = 0;
          for (const t of PULL_AT) {
            HAND.x = j[el * 3] + (j[ha * 3] - j[el * 3]) * t;
            HAND.y = j[el * 3 + 1] + (j[ha * 3 + 1] - j[el * 3 + 1]) * t;
            HAND.z = j[el * 3 + 2] + (j[ha * 3 + 2] - j[el * 3 + 2]) * t;
            const [x0, y0, z0] = [HAND.x, HAND.y, HAND.z];
            if (this.rest(HAND, ARM_R * s, near, arms, PULL_SOFT * s) > 0) {
              // (moving the hand moves the middle of the forearm half as far)
              const m = t === 0.5 ? 2 : 1;
              const [dx, dy, dz] = [(HAND.x - x0) * m, (HAND.y - y0) * m, (HAND.z - z0) * m];
              if (Math.hypot(dx, dy, dz) > Math.hypot(mx, my, mz)) [mx, my, mz] = [dx, dy, dz];
            }
          }
          if (!mx && !my && !mz) break;
          armLeft -= F.push(mx, my, mz, armLeft);
          put();
          solve();
        }
      // (how far it was pushed this frame: what it may grow from next frame)
      PV[si] = (pushed0 - armLeft) / s;
      // (and never drawn off a man into his own middle, or swung through it: his hand, or the middle of his forearm, in his
      // own trunk comes out of it sideways, the way it already is from it. A hand on the ball too: its ball goes with it)
      if (!this.onRim) {
        const tr = (SHAPES[0][2] * Math.sqrt(this.body.bulk) + ARM_R) * s;
        SA.x = j[J.hips * 3];
        SA.y = j[J.hips * 3 + 1];
        SA.z = j[J.hips * 3 + 2];
        SB.x = j[J.chest * 3];
        SB.y = j[J.chest * 3 + 1];
        SB.z = j[J.chest * 3 + 2];
        let [mx, mz] = [0, 0];
        for (const t of [1, 0.5]) {
          HAND.x = j[el * 3] + (j[ha * 3] - j[el * 3]) * t;
          HAND.y = j[el * 3 + 1] + (j[ha * 3 + 1] - j[el * 3 + 1]) * t;
          HAND.z = j[el * 3 + 2] + (j[ha * 3 + 2] - j[el * 3 + 2]) * t;
          const [x0, z0] = [HAND.x, HAND.z];
          if (!clearOf(HAND, SA, SB, tr)) continue;
          const m = t === 0.5 ? 2 : 1;
          if (Math.hypot((HAND.x - x0) * m, (HAND.z - z0) * m) > Math.hypot(mx, mz)) [mx, mz] = [(HAND.x - x0) * m, (HAND.z - z0) * m];
        }
        if (mx || mz) {
          F.push(mx, 0, mz, Math.max(left, most * 0.5, PULL_LEAST * s));
          put();
          solve();
        }
      }
      // (how far it still is from where it is wanted, as far as his arm reaches: a hand on its way to the ball doesn't hold
      // it yet (see holds); one out as far as it goes toward a ball held out of its reach has it, and the ball comes to it)
      let [wx, wy, wz] = [x - j[sh], y - j[sh + 1], z - j[sh + 2]];
      const wl = Math.hypot(wx, wy, wz);
      if (wl > reachMost) [wx, wy, wz] = [(wx * reachMost) / wl, (wy * reachMost) / wl, (wz * reachMost) / wl];
      this.handOff[si] = Math.hypot(F.at.x - wx, F.at.y - wy, F.at.z - wz);
    }
    this.gripped = true;
  }
}

/** His legs, each from its hip joint to its knee to its ankle (the puppet's J). */
const LEGS = [
  [J.jl, J.kl, J.fl],
  [J.jr, J.kr, J.fr],
] as const;
const TMP: V3 = { x: 0, y: 0, z: 0 };
const POLE: V3 = { x: 0, y: 0, z: 0 };
const OWN: V3 = { x: 0, y: 0, z: 0 };
const SA: V3 = { x: 0, y: 0, z: 0 };
const SB: V3 = { x: 0, y: 0, z: 0 };
const FLIP = new Float32Array(N);
const WP: V3 = { x: 0, y: 0, z: 0 };
const HAND: V3 = { x: 0, y: 0, z: 0 };
const ON: V3 = { x: 0, y: 0, z: 0 };
const MINE = { x: 0, z: 0 };
const HEAD_AT: V3 = { x: 0, y: 0, z: 0 };
const GRIP_AT: V3 = { x: 0, y: 0, z: 0 };
const ELB_WAS: V3 = { x: 0, y: 0, z: 0 };
const MEET: V3 = { x: 0, y: 0, z: 0 };
const BW: V3 = { x: 0, y: 0, z: 0 };
const BP: V3 = { x: 0, y: 0, z: 0 };
const CLEAR: V3 = { x: 0, y: 0, z: 0 };
const MIX = new Float32Array(N);
/** Each foot's ankle in his frame this frame (x, y, z, the left's then the right's): see solve. */
const FL = new Float32Array(6);
const G = new Float32Array(N);
/** The held follow-through as this man makes it (see Puppet.held): each hand on the shot's line, and from its shoulder (the channels that are places). */
const HELD_R = [0, 0, 0];
const HELD_L = [0, 0, 0];
const HELD = new Float32Array(N);
const HELD_AT = [I.lx, I.ly, I.lz, I.rx, I.ry, I.rz];
