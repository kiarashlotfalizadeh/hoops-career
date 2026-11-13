// One figure's body, each frame: the plan (choreo.ts) says where he is, where he faces and what
// he's doing; this turns that into a pose. It picks the clip, blends from the last one, walks his
// feet (a planted foot stays where it landed until it steps), and solves his arms and legs to the
// points the pose asks for. It decides nothing about the game.
//
// Getting around is one stride blended from the captured gaits either side of his speed (a walk, a jog, a
// run, a sprint), at a man's cadence for that speed and his own build; a planted foot is never dragged
// (he is in the air between strides when he's going faster than it can cover). For the body to read, and
// not yet read by it: `feet[k].pitch` (the roll from heel to toe) and `trail` / `trailSlow` (how far his
// cloth and hair lag his hips).
//
// No three.js here: joints come out as plain numbers in the figure's own frame (x to his left, y up,
// z the way he faces), for the scene to hang meshes on.
import type { Act } from '../choreo';
import {
  ARMS,
  CHANNELS,
  bounces,
  CLIPS,
  DUNK_AT,
  DUNKS,
  FOLLOW,
  GESTURES,
  HANG_UNTIL,
  I,
  isDunk,
  mirror,
  N,
  PASS_FOLLOW,
  PASSES,
  REST_POSE,
  sample,
  span,
  TRUNK,
  type ClipId,
  type Gesture,
} from './clips';
import { clearOf, SHAPES } from './spacing';

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

/** A figure's size: `s` scales the 6 ft 6 puppet to his height, `bulk` widens him. */
export interface Body {
  s: number;
  bulk: number;
}

/** His build from his listed height and weight (and strength rating): a center still looks like a center. */
export function bodyOf(heightIn: number, weightLb: number, str = 50): Body {
  const h = Math.max(66, Math.min(90, heightIn || 78));
  const bmi = ((weightLb || 215) * 703) / (h * h);
  return { s: h / 78, bulk: Math.max(0.86, Math.min(1.24, 1 + (bmi - 24.8) * 0.045 + (str - 50) * 0.0015)) };
}

// the 6 ft 6 puppet, in feet
export const HIP = 3.35;
export const THIGH = 1.62;
export const SHIN = 1.55;
export const ANKLE = 0.28;
export const TORSO = 1.95;
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
/** A hand goes from one side of the ball to another (a catch into a dribble) over about this long (ms). */
const GRIP_MS = 55;
/** A dribble picked up with the ball off his hand comes on up off the floor into his hands over this long (ms of his own), slowing as it gets there. */
const PICK_MS = 260;
/** A gathered dribble is in his hands this long (the move's ms) before the catch's moment: they have it by then. */
const GATHER_LATE = 60;
/** With less time than this to it (ms), the ball is not bounced first. */
const GATHER_LEAST = 150;
/** The ball is kept in the reach of the hand that has it from half a hold (grip 0.5) on, all of it this much more of a hold later. */
const REACH_TAKE = 0.35;
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
/** A plan spot this far (ft) from the last frame's is a new possession from fresh spots, not a move (the scene says so of nearer ones: `Drive.cut`). */
const CUT = 14;
/** One pose eases into the next over this long (ms): longer into the buzzer's (arms going up are not thrown up). */
const BLEND_MS = 130;
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
/** Sliding sideways, the feet keep this much of the floor between them: the trailing one never crosses the leading one. */
const FEET_GAP = 0.5;
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
/** A jumper's follow-through is held from this long after the release (ms) until the ball gets there. */
const FOLLOW_FROM = 60;
/** A pass's arms go on after the ball from PASS_FROM ms after it leaves, held until PASS_HOLD, and let go of over about PASS_LET ms. */
const PASS_FROM = 30;
const PASS_HOLD = 230;
const PASS_LET = 230;
/** A shot's lead-in (the gather, the dip) is played at most this many times quicker to fit a short move. */
const LEAD_IN = 1.6;
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
/** Round a bend he leans into it: radians for each ft a second squared across his path, and at most. */
const BANK = 0.0032;
const BANK_MAX = 0.17;
/** A man on his way up the floor says something to a teammate, or points him somewhere, about this often (ms of walking). */
const TALK_EVERY = 1900;
/** A defender closing out breaks his run down into short quick steps: this many times his cadence, sat this much lower (ft). */
const CHOP_RATE = 1.75;
const CHOP_SIT = 0.17;
/** A hard change of direction at a run (ft a second squared across his path): he plants, sinks (ft) and goes, over this long (ms). */
const PLANT_AT = 70;
const PLANT_SINK = 0.2;
const PLANT_MS = 300;
/** From standing, a man going this fast (ft a second) before his eased speed is half of it has set off at a run: his first step is the captured one. */
const START_AT = 7.5;
const START_DONE = 15;
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
/**
 * A knock (Puppet.hit) throws his trunk at up to JOLT_V ft a second, and it comes back as a spring of JOLT_W radians a
 * second, JOLT_DAMP of the way to not overshooting (a little under: it rocks back past once): about a sixth of a ft
 * at its hardest, back in about a third of a second.
 */
const JOLT_V = 4.2;
const JOLT_W = 13;
const JOLT_DAMP = 0.55;
/** A hard knock throws him this much farther again, at full power (a share; half power, half of it). */
const JOLT_HARD = 0.7;
/** His head follows a knock's throw of his trunk on a spring this slow (radians a second), nodding by this much for each ft it lags (radians). */
const HEAD_LATE_W = 7;
const HEAD_LATE = 1.1;
/** A knock this hard (or harder) and he takes a step to it: the foot out that way this far at full power (ft, on the 6 ft 6 puppet), taken within this long (ms) or not at all. */
const CATCH_FROM = 0.5;
const CATCH_FT = 1.0;
const CATCH_MS = 450;
/** Another man's trunk, head and thighs are looked at for a hand of his within this (ft, on the 6 ft 6 puppet), and a hand and an arm are this thick (ft, the same). */
const CROWD = 4;
const HAND_R = 0.13;
const ARM_R = 0.15;
/** His fingers, past the wrist, are this thick (ft, the same): for keeping them off the ball (see clearArm). */
const FINGERS_R = 0.1;
/** An arm drawn back off another man comes to it over about this long (ms), and lets go over the same. */
const PULL_MS = 70;
/**
 * A free hand keeps out of the ball's way when the ball isn't his: out of where it is and where it will be DODGE_S
 * seconds on (the bodies' time), by DODGE_GAP ft more than the ball and a hand. A contest comes up beside the shot, a
 * hand in a passing lane comes off the pass: near it, never through it. Looked for only with the ball within reach.
 * An elbow, a forearm or a hand still in its way once solved is moved off it no faster than DODGE_RATE ft a second.
 */
const DODGE_S = 0.12;
const DODGE_GAP = 0.06;
const DODGE_SOFT = 0.3;
const DODGE_RATE = 14;
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
 * A rebound is taken as high as the ball is when he gets to it: from REB_LOW ft (his chest: no jump for it) to
 * REB_TOP (both arms up at the top of his jump, the clip's own), on the 6 ft 6 puppet; and drawn in to where the clip
 * holds it over REB_IN ms. Taken low, his hands go no higher than REB_HANDS (from his shoulders, ft) before it comes.
 */
const REB_LOW = 4.9;
const REB_TOP = 9.9;
const REB_IN = 320;
const REB_HANDS = 0.3;
/** A five changes hands once his teammate is this far (ft) over to his other side. */
const FIVE_SWAP = 0.8;
/** A swinging foot covers the floor no faster than this many times his speed, and this much more (ft a second). */
const FOOT_SWING = 2.6;
const FOOT_SWING_MIN = 9;
/** Where the two hands meet that far behind him (ft), he doesn't reach back for it. */
const FIVE_BACK = 1.2;
/** A hand on its way somewhere is never carried nearer its own shoulder than this (ft), unless that is where it is going: an arm folded that far whips its elbow round. */
const HAND_NEAR = 1.0;
/** His head turns aside off another man's by this much at most (ft). */
const HEAD_GIVE_FT = 0.35;
/**
 * A hand wanted somewhere else in a frame than the way it was going (a grip let go after a shot, a pass, a gesture
 * over, a clip that has it elsewhere) is not thrown there: a jump of more than HAND_JUMP ft (or what a hand swung hard
 * covers past its way in a frame, HAND_ACC ft a ms squared) is carried and dies away over about HAND_MS, no faster
 * than HAND_SPEED ft a second; on the ball, over about HAND_HELD_MS.
 */
const HAND_JUMP = 0.15;
const HAND_ACC = 0.0002;
const HAND_MS = 90;
const HAND_HELD_MS = 25;
const HAND_SPEED = 16;
/**
 * A free hand goes round his shoulder (the line from it to the hand) no faster than ARM_TURN radians a second in a
 * move (a pass, a shot, a contest), ARM_FREE out of one (a sprinter's arms turn at about 13), and in or out from it no
 * faster than ARM_REACH ft a second: an arm going from over his head to his side swings down round him in an arc, it
 * doesn't fold through his shoulder or reset in a few frames. For ARM_RELAX ms after a move it is let fall back, not
 * yanked: no faster than ARM_BACK, and easing in over about ARM_EASE ms.
 */
const ARM_TURN = 26;
const ARM_FREE = 18;
const ARM_REACH = 22;
const ARM_RELAX = 450;
const ARM_BACK = 11;
const ARM_EASE = 95;
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
const GRIP_POLE = 0.75;
/** Getting up off the floor, or out of a deep crouch, takes this much longer (ms) for each ft his hips rise past HIP_FAR, up to BLEND_UP ms in all. */
const HIP_FAR = 0.45;
const BLEND_HIP = 220;
const BLEND_UP = 560;
/** A leg past this share of its length straightens the rest of the way softly (it never locks in a frame), and a stride's sink comes in over about SINK_IN ms and goes over SINK_OUT. */
const KNEE_SOFT = 0.96;
const SINK_IN = 30;
const SINK_OUT = 90;
/** A stride's shape (how long a foot is down, how high it goes) follows his speed over about this long (ms). */
const STRIDE_MS = 90;
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
/** What his body does with it (the lean, the sit) is eased again over this long (ms): it gathers and gives up its lean as a body does, never in a frame. */
const GAIN_BODY_MS = 110;
const GAIN_FULL = 22;
const GAIN_AHEAD = 0.5;
const BRAKE_RATE = 0.3;
const GO_LEAN = 0.2;
/** (no farther forward than this with it: a man setting off at a run already leans into his first steps) */
const GO_MOST = 0.4;
const GO_SIT = 0.09;
/** Getting going at GAIN_FULL from a stand, each foot is down at least DRIVE_DOWN of its stride (a share: he drives off it) and his feet turn over DRIVE_RATE quicker again; both less as he gets up to DRIVE_UNTIL ft a second. */
const DRIVE_DOWN = 0.5;
const DRIVE_RATE = 0.4;
const DRIVE_UNTIL = 14;
const DOWN_DROP_MS = 260;
const BRAKE_LEAN = 0.2;
const BRAKE_SIT = 0.12;
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
  /** A man meeting him body to body (a screen, a box-out: the scene's point), and how far into it (0..1). */
  touch?: { x: number; z: number; w: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const IDLES: ClipId[] = ['idle', 'idle2', 'idle3'];
/** How a man off the ball waits with the play live: ready for it, mostly; no two alike for long. */
const SPOTS: ClipId[] = ['spot', 'spot', 'spot2', 'spot2', 'spot3'];
/** The ways of standing (alert, at rest, spent). */
const STANDING = new Set<ClipId>(['idle', 'idle2', 'idle3', 'shift', 'hips', 'knees', 'spot', 'spot2', 'spot3']);
/** He turns to face a thing no faster than this (radians a second), and his head on his shoulders no faster than this: a turn, not a snap. */
const TURN_MAX = 10;
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
/** A jump shot's fade: how far back his chest goes (radians) and his feet ahead (ft), at most. */
const FADE_LEAN = 0.2;
const FADE_FEET = 0.5;
/** A layup from farther than this (ft) to the side of the rim goes up off the hand on that side. */
const LAYUP_SIDE = 1.2;
/** A hand's channels (see ARM_FAR). */
const ARM_AT = [I.lx, I.ly, I.lz, I.rx, I.ry, I.rz];
/** Clips he holds still in: what breathing shows on. */
const STILL = new Set<ClipId>([...STANDING, 'ready', 'stance', 'hold', 'slump', 'rue', 'screen', 'boxout', 'postUp', 'crash', 'inbound']);
/** A number from 0 to 1 for a man and a count: the same every time (his own way of doing a thing). */
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
const HANDED = new Set<ClipId>(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack', 'crossover', 'hesi']);
/** The dribbles. */
const DRIBBLES = new Set<ClipId>(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack']);
/** A man guarding him nearer than PRESS_NEAR (ft) is on him; farther than PRESS_FAR he is left alone. The ball is kept this far (ft, on the 6 ft 6 puppet) from that man's middle. */
const PRESS_NEAR = 3;
const PRESS_FAR = 5.5;
const PRESS_CLEAR = 1.32;
/** A drive opens with a crossover: it can start this far into the move, ms. */
const CROSS_MS = 320;
const smooth = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

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
    case 'guard':
    case 'trap':
      return moving ? (ahead && sp > 22 ? 'run' : 'shuffle') : 'stance';
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
 * his speed ahead and aside.
 */
export function spine(P: Float32Array, body: Body, hipY: number, j: Float32Array, u: V3, f: V3, l: V3, vf = 0, vs = 0) {
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
  const cx = j[J.chest * 3];
  const cyy = j[J.chest * 3 + 1];
  const cz = j[J.chest * 3 + 2];
  const hd = HEAD * s;
  const nod = P[I.nod];
  put(J.head, cx + u.x * hd + f.x * -nod * 0.3 * s, cyy + u.y * hd - Math.abs(nod) * 0.08 * s, cz + u.z * hd + f.z * -nod * 0.3 * s);
  const sw = SHOULDER * s * (0.92 + 0.08 * bulk);
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
  /** It came up ahead of its turn (he sped up or turned over it): the stride whose swing it carries on into, or 0. */
  early: number;
  /** How its toes point (radians, down from level): the heel coming up as he pushes off it, toes up before the heel strikes. For the body's foot bone. */
  pitch: number;
  /** How much wider than his hips it is to land, the outside foot of a cut (ft): set as it leaves the floor, kept through its swing. */
  wide: number;
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
  period: number;
  push: V3;
  floor: { x: number; z: number };
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
  readonly pose = new Float32Array(N);
  clip: ClipId = 'idle';
  /** The move he's in the middle of (a shot, a catch), and where in it (ms around its moment). */
  one: { id: ClipId; tau: number } | null = null;
  readonly feet: [Foot, Foot] = [
    { x: 0, z: 0, up: 0, swing: false, fx: 0, fz: 0, p0: 0, early: 0, pitch: 0, wide: 0 },
    { x: 0, z: 0, up: 0, swing: false, fx: 0, fz: 0, p0: 0, early: 0, pitch: 0, wide: 0 },
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
  private styled = -1;
  /** His speed, eased (what the blend of gaits goes by), which way he was going a beat ago, and the bank that gives. */
  private spLag = 0;
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
  /** A hard knock's step to take it (see hit): which foot (-1 none), how far out of its place it goes (the scene's ft), and how long it has to be taken (ms). */
  private catchK = -1;
  private catchX = 0;
  private catchZ = 0;
  private catchMs = 0;
  private catchLand = false;
  /** The ball is his this frame, and how many of the bodies' ms go by for one of the play's. */
  private has = false;
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
  /** How far each hand is moved off the ball that isn't his (see clearArm: ft, his frame, the left hand's then the right's). */
  private readonly cleared = new Float32Array(6);
  private readonly catchD: V3 = { x: 0, y: 0, z: 0 };
  /** A rebound (see rebound): how high he takes it, from at his chest (0) to as high as he reaches (1, the clip's own). */
  private takeK = 1;
  private readonly drib: Dribble = { hand: -1, to: -1, phase: 1, period: 500, push: { x: 0, y: 0, z: 0 }, floor: { x: 0, z: 0 } };
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
  private plantSide = 1;
  private talkIn = TALK_EVERY;
  /** He has been put on the floor (until then he has no heading of his own). */
  placed = false;
  /** Where each hand sits on the ball (left x, y, z, then right), eased from one grip to another; whether it has been yet; the bodies' ms of the last frame. */
  private readonly grips = new Float32Array(6);
  private gripped = false;
  private ownMs = 16;
  /** Each hand on its way (see toward), from its shoulder in his frame: where it was wanted, how fast that was going, what it still carries of a jump and how fast that is dying away (three each, the left hand's then the right's), how far each is drawn back off another man (see arms), and how far each had hold of the ball. */
  private readonly hand = new Float32Array(32);
  /** Where each hand was last frame from its shoulder (see ARM_TURN), and where each elbow pointed (see ELBOW_TURN): his frame, the left's then the right's. */
  private readonly swung = new Float32Array(6);
  private readonly elbows = new Float32Array(6);
  /** How long since his last move ended (the bodies' ms, see ARM_RELAX). */
  private loose = 1e9;
  /** How far a stride has his hips sunk below the pose's (ft, eased), and what that was going into this frame. */
  private sink = 0;
  private sinkFrom = 0;
  /** His stride, eased (see step): how much of it a foot is down, how early it is up, how high it goes (ft). */
  private downE = 0.5;
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
  /** Where the plan had him last frame. */
  private px = 0;
  private pz = 0;
  /** How much higher than the clip's a dunk's jump is, for his size. */
  private readonly rise: number;
  /** How he stands when he's standing: no two quite alike. */
  private idle: ClipId = 'idle';
  /** How long he keeps standing that way (ms), whether it's at rest, and how many ways he has stood. */
  private standMs = 0;
  private resting = false;
  private standN = 0;
  /** Whose body this is (see Drive.who), the dunk he's going up for, and how many he has. */
  private who = 0;
  private dunk: ClipId = 'dunk';
  private dunks = 0;
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
  /** How free his chest is to turn with his eyes (0..1, eased). */
  private freed = 0;
  /** How fast he is getting going (ft a second squared, eased: less than none pulling up), his speed a frame ago, how quick his turn is for his feet (see TURN_DOWN), and how hard his path is turning (ft a second squared, to his right). */
  private acc = 0;
  private accBody = 0;
  private spWas = 0;
  private gate = 1;
  private bend = 0;
  private bvx = 0;
  private bvz = 0;
  /** How hard he has been going (0..1), his breath, his speed ahead a beat ago and the lean it gives. */
  effort = 0;
  private breath = 0;
  private vfLag = 0;
  private leanGo = 0;
  /** A little reset in a stance: when the next one comes (ms), and how far into one he is. */
  private resetIn = 1500;
  private resetT = 1e9;
  /** A dribbler's next crossover (play ms), the shot he last took, and how far his follow-through is held. */
  private crossIn = CROSS_EVERY;
  private shot: ClipId | null = null;
  private fw = 0;
  /** A pass's follow-through (see follow): how far into it, and which pass it was. */
  private pw = 0;
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
   * is the clock's own time (ms): he turns and his arms go up at the buzzer on it, no faster a frame
   * when the game is played fast.
   */
  update(d: Drive, dt: number, own = dt, ease = own) {
    const { s } = this.body;
    const P = this.pose;
    // a new possession from fresh spots (a highlight, a skip, a quarter that ended on his dunk): he is put there, and
    // whatever he was in the middle of is dropped. (A leap is measured from the rim: left running, it would hold
    // him at the old basket and walk him the length of the floor.)
    const cut = this.placed && (!!d.cut || Math.hypot(d.x - this.px, d.z - this.pz) > CUT);
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
    const rx = d.x + this.cx;
    const rz = d.z + this.cz;
    const jumped = !this.placed || cut || Math.hypot(rx - this.x, rz - this.z) > CUT;
    if (jumped) {
      this.x = rx;
      this.z = rz;
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
    } else if (own > 0) {
      const k = 1 - Math.exp(-own / 70);
      this.vx += ((rx - this.x) / own - this.vx) * k;
      this.vz += ((rz - this.z) / own - this.vz) * k;
      this.x = rx;
      this.z = rz;
      // (a dunker turns to the rim as he goes up: his hands go where he is looking)
      const up = isDunk(this.clip) && this.hasAim && leap > 0.2;
      // (a defender his man has got by: faster than a slide goes, the way he's going far round from the way he faces, he
      // opens his hips and runs with him, and squares up again once he's caught up. So does any man without the ball
      // sent somewhere faster than a man slides or backs up, away from the way he faces: a screener on his way to set it
      // turns and runs there. Not in a move, or leaning on a man for the ball)
      const sp0 = Math.hypot(this.vx, this.vz) * 1000;
      const run = Math.atan2(this.vx, this.vz);
      const loose = !ONE[d.act] && d.act !== 'boxout' && d.act !== 'crash' && d.act !== 'release' && d.act !== 'land' && d.act !== 'inbound';
      const beaten = loose && !d.ball && sp0 > BEATEN_AT && Math.abs(wrap(run - d.yaw)) > BEATEN_ROUND;
      this.opened += ((beaten ? 1 : 0) - this.opened) * (1 - Math.exp(-ease / BEATEN_MS));
      const face = up ? Math.atan2(this.ax - rx, this.az - rz) : this.opened > 0.01 ? d.yaw + wrap(run - d.yaw) * this.opened : d.yaw;
      // (in the air he turns in his own time: played fast, he still has the rim in front of him when he gets to it)
      // (he turns as a body does: it gathers speed, and no faster than a man spins. A dunker in the air has the rim in front of him whatever)
      const sec = (up ? Math.max(ease, own * 0.6) : ease) / 1000;
      if (sec > 0 && up) {
        const [to, v] = spring(0, this.yawV, wrap(face - this.yaw), 30, sec);
        this.yaw += to;
        this.yawV = clamp(v, -TURN_MAX, TURN_MAX);
      } else if (sec > 0) {
        // (the speed he'd turn at to get there: no faster than a man spins, and slow enough to stop on it; a move's
        // turn, squaring up to the rim or to a pass, is quicker. He gathers that speed and gives it up as a body
        // does, never all in a frame: a turn starts with a step into it and ends with him set)
        const off = wrap(face - this.yaw);
        const down = this.feet.some((f) => !f.swing) && P[I.air] < 0.5;
        const [most, acc] = this.turning(off, wrap(face - run), sp0, !!ONE[d.act], down);
        const want = Math.sign(off) * Math.min(most, Math.sqrt(1.6 * acc * Math.abs(off)), Math.abs(off) * (ONE[d.act] ? 30 : 13));
        this.yawV += clamp(want - this.yawV, -acc * sec, acc * sec);
        // (at a run his body comes round over a planted foot: quicker with one down, slower with both up)
        const running = sp0 > TURN_GATE_FROM && (!this.one || this.one.id === 'start');
        this.gate += ((running ? (down ? TURN_DOWN : TURN_UP) : 1) - this.gate) * (1 - Math.exp(-own / TURN_GATE_MS));
        let turn = this.yawV * sec * this.gate;
        if (turn * off > 0 && Math.abs(turn) > Math.abs(off)) [turn, this.yawV] = [off, 0];
        this.yaw += turn;
      }
    }
    this.ownMs = Math.max(0, own);
    if (own <= 0 && this.placed && !jumped) return;
    this.placed = true;
    if (jumped) this.gripped = false;

    const [fx, fz, sx, sz] = this.dirs();
    const sp = Math.hypot(this.vx, this.vz) * 1000;
    const vf = (this.vx * fx + this.vz * fz) * 1000;
    const vs = (this.vx * sx + this.vz * sz) * 1000;
    // how fast he is getting going or pulling up, and how hard his path is turning to his right (ft a second squared, eased on his own time)
    if (jumped) this.acc = this.accBody = this.bend = 0;
    else if (own > 0) {
      const k = 1 - Math.exp(-own / GAIN_MS);
      this.acc += (((sp - this.spWas) * 1000) / own - this.acc) * k;
      this.accBody += (this.acc - this.accBody) * (1 - Math.exp(-own / GAIN_BODY_MS));
      this.bend += ((((this.vx - this.bvx) * sx + (this.vz - this.bvz) * sz) * 1e6) / own - this.bend) * k;
    }
    this.spWas = sp;
    this.bvx = this.vx;
    this.bvz = this.vz;

    // the move he's in the middle of
    // (the play's clock stopped under him, a timeout or the buzzer: he finishes it on his own time, and comes to a stand)
    // (that time stays his until the next move: the play going on again doesn't take him back to where its clock stopped)
    this.has = d.ball;
    if (dt > 0 && own > 0) this.pace = own / dt;
    if (d.who !== undefined) this.who = d.who;
    if (this.styled !== this.who) this.style();
    // (each dunk is one of his: two hands, one, or hanging on the rim)
    if (d.act === 'dunk' && this.act !== 'dunk') this.dunk = DUNKS[Math.floor(hash(this.who, ++this.dunks) * DUNKS.length)];
    // (each pass is one of his: picked as he draws it in, or as it goes if he had no time to)
    const winds = d.ball && d.pass !== undefined && d.act !== 'pass';
    // (thrown in from out of bounds, it comes from over his head, where he has it)
    if ((winds && !this.winding) || (d.act === 'pass' && this.act !== 'pass' && !this.winding))
      this.passId = d.act === 'inbound' || this.act === 'inbound' ? 'passOver' : PASSES[Math.floor(hash(this.who, 40 + ++this.passes) * PASSES.length)];
    this.winding = winds || (this.winding && d.act === 'pass');
    // (each shot is one of his: a jumper off the dribble may fade or kick a leg; a layup goes up off the hand on its side of the rim, now and then after a step across)
    if (d.act === 'jumper' && this.act !== 'jumper') {
      const r = hash(this.who, 80 + ++this.shots);
      const off = DRIBBLES.has(this.clip) || this.clip === 'crossover' || this.clip === 'hesi';
      this.fade = off && r < 0.4 ? 0.5 + r : 0;
      this.kick = r > 0.7 ? 1 : 0;
      // (off the dribble he may step back for it; off the catch he hops into it)
      this.stepBack = off && r >= 0.4 && r < 0.62 ? 1 : 0;
      this.hop = !off && (this.clip === 'catch' || this.act === 'catch') ? 1 : 0;
    }
    // (a big man's runner is a hook)
    if (d.act === 'floater' && this.act !== 'floater') this.hooks = s > 1.03 && hash(this.who, 160 + ++this.shots) < 0.75;
    if (d.act === 'layup' && this.act !== 'layup') {
      const side = d.aim ? (d.z - d.aim.z) * (d.aim.x < 0 ? 1 : -1) : 0;
      this.south = side > LAYUP_SIDE * s;
      const r = hash(this.who, 120 + ++this.shots);
      this.euro = r < 0.3 ? (r < 0.15 ? 1 : -1) : 0;
      // (he has just come down with the board: straight back up with it. Now and then he goes under the rim and lays it back over his head)
      this.put = this.act === 'rebound' || this.one?.id === 'rebound';
      this.reverse = !this.put && r > 0.8 ? 1 : 0;
    }
    if (d.act !== this.act || d.ms < this.at) this.over = 0;
    else if (dt <= 0) this.over += own;
    this.act = d.act;
    this.at = d.ms;
    if (!d.over) this.bumped = false;
    const ms = d.ms + this.over;
    const one = ONE[d.act];
    if (one) {
      const id =
        one[0] === 'dunk' ? this.dunk : one[0] === 'pass' ? this.passId : one[0] === 'layup' && this.put ? 'putback' : one[0] === 'floater' && this.hooks ? 'hook' : one[0];
      // (a move shorter than the clip's lead-in plays the lead-in quicker, up to LEAD_IN times: a shooter still
      // gathers and dips before he rises, he doesn't start halfway up)
      const lead = -span(CLIPS[id])[0];
      const tau = one[1] === 'end' ? ms - d.dur : ms;
      this.one = { id, tau: tau < 0 && d.dur > 0 ? Math.max(-lead, tau * clamp(lead / d.dur, 1, LEAD_IN)) : tau };
    } else if (d.act === 'release' || d.act === 'land') this.one = { id: this.one?.id ?? (d.act === 'release' ? 'jumper' : 'contest'), tau: Math.max(this.one?.tau ?? 0, ms) };
    // (a drive opens with a crossover, as soon as the ball is back in his hand: never snatched out of the air)
    else if (d.act === 'drive' && d.ball && d.ms < CROSS_MS && this.one?.id === 'crossover') this.one.tau += dt > 0 ? dt : own;
    else if (d.act === 'drive' && d.ball && d.ms < CROSS_MS && (this.drib.phase >= 1 || !DRIBBLES.has(this.clip))) this.one = { id: 'crossover', tau: 0 };
    // (at the line: his routine, timed to end as the shot's own move begins)
    else if (d.ball && d.ft !== undefined && d.ft <= -span(CLIPS.ftRoutine)[0]) this.one = { id: 'ftRoutine', tau: -d.ft };
    // (about to pass: the wind-up, timed to end as the pass's own move begins)
    else if (winds && d.pass! <= -span(CLIPS[this.passId])[0]) this.one = { id: this.passId, tau: -d.pass! };
    else if (d.bump && !this.bumped) {
      this.one = { id: 'bump', tau: 0 };
      this.bumped = true;
    } else if (this.one) this.one.tau += dt > 0 ? dt : own;
    // (standing with it, he crosses it over now and then)
    else if (d.act === 'dribble' && d.ball && sp < 7 && !this.across && (this.crossIn -= dt) <= 0 && this.drib.phase >= 1) {
      // (or a hesitation: up out of it and back down)
      // (never across into a man who is on him)
      this.one = { id: this.pressed > 0.5 || hash(this.who, 60 + this.standN) < 0.4 ? 'hesi' : 'crossover', tau: 0 };
      this.crossIn = CROSS_EVERY * (0.5 + hash(this.who, this.standN++));
    }
    // knocked over, as soon as he's on the floor and free
    if (this.knocked && (!this.one || this.one.id === 'stop' || this.one.id === 'closeout') && P[I.air] < 0.3 && !d.ball) {
      this.one = { id: 'stumble', tau: 0 };
      this.knocked = false;
    }
    // pulling up out of a run: the stop is a take's (a defender's ends down in his stance)
    const plain = baseClip(d.act, d.ball, sp, vf, vs);
    if (!this.one && !d.ball && !d.over && sp < 2.5 && this.spLag > 8 && CLIPS[this.clip].kind === 'gait')
      this.one = { id: plain === 'ready' || plain === 'stance' ? 'closeout' : 'stop', tau: 0 };
    else if (this.one && (this.one.id === 'stop' || this.one.id === 'closeout') && sp > 6) this.one = null;
    // from standing into a run: the first step is a take's (he drops, leans and drives his arms)
    // (a man who only walks off doesn't: it is for setting off at a run)
    if (!this.one && !d.ball && !d.over && sp > START_AT && this.spLag < START_AT / 2 && vf > 0.75 * sp && FORWARD.has(plain) && plain !== 'walk')
      this.one = { id: 'start', tau: 0 };
    // (once he is up to speed it is his stride again)
    else if (this.one?.id === 'start' && (sp < START_AT / 2 || vf < 0.5 * sp || !FORWARD.has(plain) || this.spLag > START_DONE)) this.one = null;
    // (a man who caught it and is already going doesn't carry it on his hip first)
    if (this.one?.id === 'catch' && this.one.tau > CATCH_HELD && sp > CATCH_GO) this.one = null;
    // (a defender coming to a man out of a run breaks his steps down before he gets there)
    const closing = (d.act === 'defend' || d.act === 'guard' || d.act === 'contest') && !this.one && sp > 3 && sp < 15 && sp < this.spLag - 1.2;
    this.chop += ((closing ? 1 : 0) - this.chop) * (1 - Math.exp(-own / (closing ? 70 : 160)));
    if (this.one && (this.one.id === 'jumper' || this.one.id === 'freeThrow')) this.shot = this.one.id;
    else if (d.act !== 'release') this.shot = null;
    if (this.one && this.one.tau > span(CLIPS[this.one.id])[1]) {
      // (a crossover leaves the ball in his other hand)
      if (this.one.id === 'crossover') this.lefty = !this.lefty;
      this.one = null;
    }
    if (!d.ball && !this.one) this.lefty = false;
    const acting = this.one && this.one.tau >= span(CLIPS[this.one.id])[0] ? this.one : null;

    let id = acting ? acting.id : plain;
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
    } else if (id !== this.clip) {
      this.fresh = true;
      this.blend = 0;
      if (DRIBBLES.has(id)) this.rephase(id);
      const rest = STANDING.has(id) && (STANDING.has(this.clip) || id === 'knees' || id === 'hips');
      // (into and out of a run takes a stride, not a snap)
      const gait = CLIPS[id].kind === 'gait' || CLIPS[this.clip].kind === 'gait';
      this.clip = id;
      this.dwell = 0;
      this.slow = id === 'celebrate' || id === 'rue' || id === 'cheer' || id === 'slump' || id === d.party;
      this.blendMs = this.slow ? BLEND_SLOW : rest ? BLEND_REST : gait && !acting ? BLEND_GAIT : BLEND_MS;
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
    if (FORWARD.has(id)) this.stride(this.spLag, this.want);
    else sample(c, c.kind === 'shot' ? acting!.tau : c.kind === 'gait' ? this.phase : this.loopT / c.dur, this.want);
    if ((this.lefty && HANDED.has(id)) || (this.south && id === 'layup')) mirror(this.want);
    // (a slide is one clip, going left: going right it's flipped, eased over so he doesn't snap)
    // (into a slide or out of one, the new pose is the one blended to: a flip fading under some other clip would swing its arms across him)
    const flipTo = id === 'shuffle' && vs > 0 ? 1 : 0;
    if (this.fresh) this.flip = flipTo;
    else this.flip += (flipTo - this.flip) * (1 - Math.exp(-own / 110));
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
    this.shoot(id);
    this.shield(d, id, own);
    this.ride(id);
    this.land(own);
    this.follow(d, own);
    this.gesture(d, own);
    this.life(d, id, sp, vf, own);
    this.contact(d, id, own);
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
      // (getting up off the floor, or out of a crouch, takes a moment whatever he is going into: up from sitting into a catch is not a spring)
      const up = -this.off[I.hip] - HIP_FAR;
      if (up > 0 && !this.slow) this.blendMs = Math.max(this.blendMs, Math.min(BLEND_UP, BLEND_MS + up * BLEND_HIP));
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + (this.slow ? ease : own) / this.blendMs);
      const w = smooth(this.blend);
      for (let i = 0; i < N; i++) P[i] += this.off[i] * (1 - w);
      // (a hand going from his side to over his head goes round in front of him: straight up it would pass
      // through his own shoulder, and the elbow would whip round it)
      const out = Math.sin(Math.PI * w) * ARC;
      P[I.lz] += out * clamp((Math.abs(this.off[I.ly]) - ARC_FROM) / ARC_FROM, 0, 1);
      P[I.rz] += out * clamp((Math.abs(this.off[I.ry]) - ARC_FROM) / ARC_FROM, 0, 1);
    }
    B.set(P);
    // where he looks, on top of it all
    this.gaze(d, ease, sp);

    this.step(own, sp);
    this.sinkFrom = jumped ? 0 : this.sink;
    this.solve(vf, vs);
    this.trails(own);
  }

  /** The bounce he's dribbling, or null when he isn't (see Dribble). Read after `update`. */
  get dribble(): Dribble | null {
    const id = this.clip;
    if (!this.has || !(DRIBBLES.has(id) || id === 'crossover' || id === 'hesi')) return null;
    const c = CLIPS[id];
    const loop = c.kind !== 'shot';
    const all = bounces(c);
    if (!all.length || (!loop && !this.one)) return null;
    const t = loop ? this.loopT / c.dur - Math.floor(this.loopT / c.dur) : this.one!.tau;
    // (the one he's in, else the next to come: round to the loop's first, or a one-off's last, done)
    const b = all.find((x) => t <= x.on) ?? (loop ? all[0] : all[all.length - 1]);
    const out = this.drib;
    const flying = t >= b.off && t <= b.on;
    out.phase = flying ? clamp((t - b.off) / (b.on - b.off || 1), 0, 1) : 1;
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
        at.y = this.bounce(clamp(1 - left / this.gatherMs, 0, 1), this.gatherY, at.y, at.y);
        this.heldY = at.y;
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
    // (from where the palm let it go)
    const u = d.phase;
    at.y = this.bounce(u, this.heldY, at.y);
    this.pickY = u < 0.8 ? at.y : -1;
    this.pickMs = 0;
    return this.keepOut(at);
  }

  /**
   * A bounce `u` of the way through (0..1): from `top` (ft) down to the floor, back up as high as `up` and into the
   * hand at `hand` (ft).
   */
  private bounce(u: number, top: number, hand: number, up = top): number {
    const from = Math.max(top, BALL_R + 0.6);
    const peak = Math.max(up, BALL_R + 0.6);
    const down = 0.44;
    const y = u < down ? from - (from - BALL_R) * Math.pow(u / down, 1.35) : BALL_R + (peak - BALL_R) * (1 - Math.pow(1 - (u - down) / (1 - down), 1.8));
    // (and into the hand where the clip has it, so the palm and the ball meet)
    return y + (hand - y) * smooth(clamp((u - 0.8) / 0.2, 0, 1));
  }

  /**
   * The ball he has (the scene's point, moved in place) kept out of his own body: his head, his trunk and his legs
   * as spacing.ts shapes them. Over his head it goes round in front of his face, low it goes round his knees; his
   * arms are what carry it, so they are left out.
   */
  keepOut(at: V3): V3 {
    const { s, bulk } = this.body;
    const j = this.j;
    const [lx, lz] = this.local(at.x, at.z);
    OWN.x = lx;
    OWN.y = at.y;
    OWN.z = lz;
    let moved = false;
    for (const [p, q, r, limb] of SHAPES) {
      if (limb && p < J.jl) continue;
      const need = r * s * (limb && p !== J.jl && p !== J.jr ? 1 : Math.sqrt(bulk)) + BALL_R;
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
    return moved ? this.world(OWN.x, Math.max(BALL_R, OWN.y), OWN.z, at) : at;
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
    for (const side of [1, -1] as const) {
      const g = dr && dr.hand === side ? 1 : clamp(P[side > 0 ? I.gl : I.gr], 0, 1);
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
  }

  /** What makes a shot his own (see `fade`, `kick`, `euro`): laid on the clip around its release. */
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
    } else if (id === 'jumper' && this.hop > 0) {
      // (off the catch: a little hop onto both feet as it comes, and up out of it)
      const w = Math.sin(Math.PI * clamp((one.tau + 380) / 170, 0, 1)) * this.hop;
      P[I.air] = Math.max(P[I.air], 0.6 * w);
      P[I.hip] += 0.12 * w;
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
    } else if (id === 'layup' && this.euro) {
      // (a long step one way and the next the other, before he goes up)
      const u = clamp((one.tau + 320) / 260, 0, 1);
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
   * had a leg in his): his feet go with him and his legs are solved again. Read after `update`, before `arms`.
   */
  nudge(dx: number, dz: number) {
    this.x += dx;
    this.z += dz;
    // (bodily: a planted foot skids the little he is moved, it isn't left in the other man's legs)
    for (const f of this.feet) {
      if (f.swing) continue;
      f.x += dx;
      f.z += dz;
    }
    this.solve(this.vf, this.vs);
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
  hit(dx: number, dz: number, power: number) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || power <= 0) return;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // (a hard one throws him farther than a soft one does by its power alone: he is off balance)
    const k = clamp(power, 0, 1);
    const v = JOLT_V * k * (1 + JOLT_HARD * k);
    this.jolt[2] += ((dx * c - dz * s) / d) * v;
    this.jolt[3] += ((dx * s + dz * c) / d) * v;
    // (a hard one he takes a step to: the foot farthest the way it pushes him goes farther that way)
    if (k < CATCH_FROM || this.pose[I.air] > 0.3 || this.catchK >= 0) return;
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
    this.pressed += (want - this.pressed) * (1 - Math.exp(-own / 160));
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
    if (this.across && !this.one && this.switched > 900 && this.drib.phase >= 1) {
      this.one = { id: 'crossover', tau: 0 };
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
  private land(own: number) {
    const P = this.pose;
    const up = P[I.air] > 0.5;
    if (up) this.peak = Math.max(this.peak, P[I.hip]);
    if (this.flew && !up) {
      this.giveT = 0;
      this.hard = clamp(this.peak / LAND_HIGH, 0.3, 1.25);
      const id = this.one?.id;
      this.foot = id === 'layup' || id === 'floater' || id === 'hook' || id === 'putback' || id === 'dunk1' ? (this.south ? -1 : 1) : 0;
      this.peak = 0;
    }
    this.flew = up;
    const long = LAND_MS * (0.75 + 0.25 * this.hard);
    if (this.giveT > long) return;
    this.giveT += own;
    const u = Math.min(1, this.giveT / long);
    const dip = u < 0.28 ? smooth(u / 0.28) : u < 0.4 ? 1 : 1 - smooth((u - 0.4) / 0.6);
    const k = dip * this.hard * clamp((P[I.hip] + 0.4) / 0.4, 0, 1) * (1 - clamp(P[I.air], 0, 1));
    P[I.hip] -= LAND_DIP * k;
    P[I.lean] += 0.09 * k;
    P[I.wide] += 0.1 * k;
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
    const t = d.touch;
    if (t) [this.tx, this.tz] = [t.x, t.z];
    this.felt += ((t ? t.w : 0) - this.felt) * (1 - Math.exp(-own / CONTACT_MS));
    const w = this.felt * (1 - clamp(P[I.air] / 0.3, 0, 1));
    if (w < 0.01) return;
    const [lx, lz] = this.local(this.tx, this.tz);
    const far = Math.hypot(lx, lz) || 1;
    const ahead = lz / far;
    const aside = lx / far;
    const shove = Math.sin(this.loopT * SHOVE_RATE + this.who);
    P[I.hip] -= CONTACT_SIT * w;
    P[I.wide] += 0.14 * w;
    P[I.lean] += (ahead > 0 ? 0.12 * ahead : -0.04 * ahead) * w + 0.025 * shove * w;
    P[I.surge] += (ahead > 0 ? 0.08 * ahead : 0.16 * ahead) * w + 0.05 * shove * ahead * w;
    P[I.tilt] += 0.11 * aside * w;
    P[I.sway] += 0.07 * aside * w;
    if (ahead > 0.25 && !d.ball && id !== 'screen' && !this.one) {
      const [ax, ay, az] = aside >= 0 ? [I.lx, I.ly, I.lz] : [I.rx, I.ry, I.rz];
      const k = w * Math.min(1, ahead * 1.3) * 0.85;
      P[ax] += (0.3 - P[ax]) * k;
      P[ay] += (-0.5 - P[ay]) * k;
      P[az] += (1.0 - P[az]) * k;
    }
  }

  /** What is his own: by who he is and how he's built, the same every game. A big man's feet turn over slower; no two carry themselves alike. */
  private style() {
    const w = this.who;
    this.styled = w;
    const { s, bulk } = this.body;
    this.tempo = (1 + (hash(w, 21) - 0.5) * 0.14) / (Math.sqrt(s) * (1 + (bulk - 1) * 0.3));
    this.carry0 = (hash(w, 22) - 0.5) * 0.07;
    this.nod0 = (hash(w, 23) - 0.5) * 0.1;
    this.armK = 0.82 + hash(w, 24) * 0.36;
    this.beat = 0.84 + hash(w, 25) * 0.32;
    // (what would be chance is his own too: each starts on his own beat, and the same one every time the game is played)
    this.loopT = hash(w, 26) * 2000;
    this.fidgetIn = FIDGET_EVERY * (0.4 + hash(w, 27));
    this.breath = hash(w, 28);
    this.resetIn = 1500 + hash(w, 29) * 2000;
    this.crossIn = CROSS_EVERY * (0.5 + hash(w, 30));
    this.idle = IDLES[Math.floor(hash(w, 31) * IDLES.length)];
  }

  /**
   * How fast he may turn (radians a second) and how quickly he gathers it (radians a second, each second), for a
   * turn `off` from the way he faces to the way he's to face, that way `against` from the way he is going. A big
   * turn away from his run is no turntable: going fast he comes round slower; from a walk or a stand he plants and
   * pivots, quicker than he turns on the move.
   */
  private turning(off: number, against: number, sp: number, move: boolean, down: boolean): [number, number] {
    const acc = move ? TURN_ACC_MOVE : TURN_ACC;
    if (move) return [TURN_MAX, acc];
    const big = smooth(clamp((Math.abs(off) - TURN_BIG) / TURN_BIG, 0, 1));
    const carried = smooth(clamp((Math.abs(against) - TURN_BIG) / TURN_BIG, 0, 1)) * clamp((sp - PIVOT_UNDER) / (TURN_CARRIED - PIVOT_UNDER), 0, 1);
    const pivot = down ? big * clamp((PIVOT_UNDER - sp) / PIVOT_UNDER, 0, 1) : 0;
    return [TURN_MAX * (1 - TURN_SLOWED * carried * big) + (PIVOT_MAX - TURN_MAX) * pivot, acc];
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
    sample(CLIPS[AHEAD[k][0]], this.phase, out);
    if (w <= 0) return;
    sample(CLIPS[AHEAD[k + 1][0]], this.phase, MIX);
    for (let i = 0; i < N; i++) out[i] += (MIX[i] - out[i]) * w;
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
    const fresh = !STANDING.has(this.clip) || rest !== this.resting;
    this.standMs -= own;
    if (!fresh && this.standMs > 0) return this.idle;
    this.resting = rest;
    const r = hash(this.who, ++this.standN);
    const tired = Math.max(this.effort, d.tired ? TIRED_LATE : 0);
    // (the play is live and the ball isn't his: on his toes for it. Holding it, or between whistles, he stands as he stands)
    if (!rest) {
      this.idle = d.act === 'stand' || d.act === 'move' ? SPOTS[Math.floor(r * SPOTS.length)] : IDLES[Math.floor(r * IDLES.length)];
      // (a hand on his hip is for the far side of the floor: near the ball he is ready for it)
      if (this.idle === 'spot3' && !(d.look && Math.hypot(d.look.x - this.x, d.look.z - this.z) > WEAK_SIDE)) this.idle = r < 0.9 ? 'spot' : 'spot2';
    }
    // (late in a close one a dead ball is a chance to get his breath: hands on his knees)
    else if (fresh && (tired > 0.5 || (!!d.tired && r < 0.4))) this.idle = 'knees';
    else if (tired > 0.3) this.idle = r < 0.6 ? 'hips' : 'shift';
    else this.idle = r < 0.3 ? 'hips' : r < 0.65 ? 'shift' : r < 0.85 ? 'idle' : 'idle3';
    this.standMs = this.idle === 'knees' ? 1600 + r * 1200 : 2600 + r * 3200;
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
   * A jumper's or a free throw's follow-through, held: the arm stays up until the ball gets there. A pass's: the arms
   * go on after the ball for PASS_HOLD ms of it, then are let go of over a beat (PASS_LET ms or so).
   */
  private follow(d: Drive, own: number) {
    const P = this.pose;
    const up = this.shot === 'jumper' || this.shot === 'freeThrow';
    const on = up && ((this.one !== null && this.one.tau > FOLLOW_FROM) || (this.one === null && d.act === 'release'));
    this.fw += ((on ? 1 : 0) - this.fw) * (1 - Math.exp(-own / (on ? 90 : 240)));
    if (this.fw >= 0.005) for (const [c, v] of FOLLOWED) P[c] += (v - P[c]) * this.fw;
    const pass = this.one && PASS_FOLLOW[this.one.id] ? this.one : null;
    if (pass) this.passed = pass.id;
    const going = !!pass && pass.tau > PASS_FROM && pass.tau < PASS_HOLD;
    this.pw += ((going ? 1 : 0) - this.pw) * (1 - Math.exp(-own / (going ? 60 : PASS_LET)));
    const key = PASS_FOLLOW[this.passed];
    if (this.pw < 0.005 || !key) return;
    for (const c of ARM_AT) {
      const v = key[CHANNELS[c] as keyof typeof key];
      if (v !== undefined) P[c] += (v - P[c]) * this.pw;
    }
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
    const gain = vf - this.vfLag;
    this.vfLag += gain * (1 - Math.exp(-own / 220));
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
      const across = (((this.vx - this.pvx) * sx + (this.vz - this.pvz) * sz) * 1e6) / own;
      bank = clamp(-across * BANK, -BANK_MAX, BANK_MAX);
    }
    // (a hard cut at a run: he plants his outside foot and sinks over it, his head still on the way he was going for a beat)
    if (own > 0 && sp > 9 && !this.one && !d.ball && P[I.air] < 0.2 && this.plantT > PLANT_MS + 250) {
      const [, , sx, sz] = this.dirs();
      const across = (((this.vx - this.pvx) * sx + (this.vz - this.pvz) * sz) * 1e6) / own;
      if (Math.abs(across) > PLANT_AT) {
        this.plantT = 0;
        this.plantSide = Math.sign(across);
      }
    }
    this.pvx = this.vx;
    this.pvz = this.vz;
    this.bank += (bank - this.bank) * (1 - Math.exp(-own / 200));
    P[I.tilt] += this.bank;
    P[I.proll] += this.bank * 0.4;
    if (this.plantT < PLANT_MS) {
      this.plantT += own;
      const u = Math.min(1, this.plantT / PLANT_MS);
      // (sinking from the first frame of it, not dropped into it)
      const w = Math.sin(Math.PI * Math.pow(u, 0.7)) * smooth(clamp(u / 0.25, 0, 1));
      P[I.hip] -= PLANT_SINK * w;
      P[I.sway] += 0.16 * this.plantSide * w;
      P[I.turn] += 0.4 * this.plantSide * w * (1 - u);
      P[I.twist] += 0.14 * this.plantSide * w * (1 - u);
    } else this.plantT += own;
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
    this.downE = 0.5;
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
      f.early = 0;
      f.pitch = 0;
      f.wide = 0;
    });
  }

  /**
   * The gait: one foot swings to where the next stride will need it while the other stays where it landed.
   * His feet turn over as a man's do for his speed (a walker's two steps a second, a sprinter's four and a
   * half), and no faster: what a planted foot can't cover he covers in the air between strides.
   */
  private step(dt: number, sp: number) {
    const { s } = this.body;
    const [, , sx, sz] = this.dirs();
    const w = (HIP_W + 0.08 + this.pose[I.wide] * 0.6) * s;
    // (a hard knock's step: that foot's place is out the way he was pushed until it is put down there)
    if (this.catchK >= 0 && (this.catchMs -= dt) <= 0 && !this.feet[this.catchK].swing) this.catchK = -1;
    const homeX = (k: number) => this.x + sx * w * (k ? 1 : -1) + (k === this.catchK ? this.catchX : 0);
    const homeZ = (k: number) => this.z + sz * w * (k ? 1 : -1) + (k === this.catchK ? this.catchZ : 0);
    const going = sp > 1.2;
    const ahead = this.vf > 0.6 * sp;
    const back = this.vf < -0.45 * sp;
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
    const chopK = this.tempo * (1 + (CHOP_RATE - 1) * this.chop);
    // (and his first steps from a stand quicker again: short, driving ones, up to DRIVE_RATE more of them, gone by DRIVE_UNTIL ft a second)
    const quick = urged ? DRIVE_RATE * clamp(this.accBody / GAIN_FULL, 0, 1) * clamp(1 - sp / DRIVE_UNTIL, 0, 1) : 0;
    const rate = Math.min(4.6, rateAt(soon) * (1 + brake + quick)) * chopK;
    // (backing up or sliding he takes short quick steps: a long one would cross his feet or turn his hips)
    const reachOf = ahead ? Infinity : (back ? 2.4 : 2) * s;
    const away = (f: Foot, k: number) => k === this.catchK || Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > 0.5 * s;
    let cadence = going ? Math.min(Math.max(rate, sp / reachOf), 6.5) : 0;
    // standing: a foot left out of place (or caught mid-step) takes one step home, and then both stay down
    if (!going && this.feet.some((f, k) => f.swing || away(f, k))) cadence = 3.4;
    const cycle = cadence ? 2 / cadence : 0;
    // (stood, he takes it now: that foot's stride starts this frame)
    const ck = this.catchK;
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
    const downTo = going ? Math.max(drive, clamp((CONTACT * s * crouch) / (sp * even), 0.08, DOWN_WALK)) : 0.5;
    this.downE += (downTo - this.downE) * (downTo < this.downE ? 1 - Math.exp(-dt / DOWN_DROP_MS) : ke);
    // (a runner's swing and knee lift go by the speed he is getting up to: his first steps from a stand drive his knees)
    this.paceE += ((ahead ? clamp((soon - 6) / 12, 0, 1) : 0) - this.paceE) * ke;
    this.liftE += ((ahead ? clamp(0.3 + soon * 0.05, 0.3, 1.9) : clamp(0.3 + sp * 0.022, 0.3, 0.8)) * s - this.liftE) * ke;
    const down = this.downE;
    const pace = this.paceE;
    const lift = this.liftE;
    const sideways = Math.abs(this.vs) > Math.abs(this.vf) && sp > 1.2;
    const vl = Math.hypot(this.vx, this.vz) || 1;
    this.feet.forEach((f, k) => {
      const p = this.phase + (k ? 0.5 : 0);
      const n = Math.floor(p);
      const q = (p - n) / (1 - down);
      // (a planted foot he has left behind, or turned away from, comes up now, ahead of its turn: he sped up, or cut.
      // It is never dragged to keep time)
      if (!f.swing && !f.early && going && q >= 1 && Math.hypot(f.x - homeX(k), f.z - homeZ(k)) > (CONTACT / 2 + 0.3) * s) f.early = n + 1;
      const end = (f.early || n) + (1 - down);
      if (f.early && (p >= end || !cadence)) f.early = 0;
      // (standing, a foot that is home stays down, and one that isn't waits for the start of its stride)
      const swinging = f.early ? true : cadence > 0 && q < 1 && (going || f.swing || (q < 0.5 && away(f, k)));
      if (swinging && !f.swing) {
        // (where it leaves the floor, measured from him: it swings through under him however fast he goes)
        f.fx = f.x - this.x;
        f.fz = f.z - this.z;
        f.p0 = p;
        // (cutting at a run, the foot on the outside of the turn goes down wide: he pushes off it into the new way)
        f.wide = going && ahead && sp > TURN_GATE_FROM && (k ? 1 : -1) * this.bend < 0 ? Math.min(PLANT_WIDE, Math.abs(this.bend) * PLANT_OUT) * s * (k ? 1 : -1) : 0;
      }
      // (the frame its stride ends it is put down where the step was going: not left hanging short of it)
      const landing = f.swing && !swinging && cadence > 0;
      if (landing && k === this.catchK) this.catchLand = true;
      f.swing = swinging;
      let toes = 0;
      if (swinging || landing) {
        const x0 = f.x;
        const z0 = f.z;
        // it lands ahead of him by half of what he'll cover while it's down
        // (never farther than a leg reaches without sinking him)
        const till = ((landing ? 0 : end - p) + down / 2) * cycle * 1000;
        const lead = Math.min(1, (REACH * s * crouch) / (Math.hypot(this.vx, this.vz) * till || 1));
        // (a stride picked up partway through still starts from where the foot was)
        const u = landing || end - f.p0 < 0.01 ? 1 : clamp((p - f.p0) / (end - f.p0), 0, 1);
        const tx = homeX(k) - this.x + this.vx * till * lead + sx * f.wide;
        const tz = homeZ(k) - this.z + this.vz * till * lead + sz * f.wide;
        // it leaves the floor still (so it trails behind him a moment, the heel coming up) and is still again as it
        // lands (drawn back under him, not thrown down ahead and dragged): a curve from one to the other
        const span = Math.hypot(tx - f.fx, tz - f.fz);
        const swingMs = Math.max(0, end - f.p0) * cycle * 1000;
        const m = going ? Math.min(vl * swingMs, span * 0.9) / vl : 0;
        const u2 = u * u;
        const u3 = u2 * u;
        const h01 = 3 * u2 - 2 * u3;
        const h1 = u3 - 2 * u2 + u + (u3 - u2);
        f.x = this.x + f.fx + (tx - f.fx) * h01 - this.vx * m * h1;
        f.z = this.z + f.fz + (tz - f.fz) * h01 - this.vz * m * h1;
        // (a runner's foot comes up behind him early and reaches down late; a walker's just clears the floor. It
        // leaves the floor at a speed, not all at once: the top a third of the way through. The heel peels off first, so
        // the knee that was straightening as he went over it starts to bend over a frame or two, it doesn't fold at once;
        // not when the plan has him going faster than a man runs, where there is no time for it)
        const peel = going ? PEEL * (1 - clamp((sp - PEEL_FAST) / 8, 0, 1)) : 0;
        const walk = Math.sin(Math.PI * (u + 0.76 * pace * u * (1 - u))) * (peel > 0 ? smooth(clamp(u / peel, 0, 1)) : 1);
        // (a runner's heel comes up to his seat as a swing, not a flick: it rises over the first SWING_TOP of the
        // stride, gathering speed and giving it up, so his knee folds over four or five frames, never most of the
        // way in one; then it reaches down for the floor and meets it moving)
        const top = SWING_TOP;
        const run = u < top ? (1 - Math.cos((Math.PI * u) / top)) / 2 : Math.cos(((Math.PI / 2) * (u - top)) / (1 - top));
        f.up = (walk + (run - walk) * pace) * lift;
        // (toes down as it trails, up as it reaches for the floor)
        toes = going ? 0.95 - 1.25 * smooth(clamp((u - 0.2) / 0.55, 0, 1)) + 0.15 * clamp((u - 0.85) / 0.15, 0, 1) : 0.4 * Math.sin(Math.PI * u);
        if (sideways) {
          // (a slide: it comes down on its own side of the other foot)
          const o = this.feet[1 - k];
          const lat = ((f.x - o.x) * sx + (f.z - o.z) * sz) * (k ? 1 : -1);
          const gap = FEET_GAP * s;
          if (lat < gap) {
            f.x += sx * (gap - lat) * (k ? 1 : -1);
            f.z += sz * (gap - lat) * (k ? 1 : -1);
          }
        }
        // (no faster than a foot is swung: a stride caught late in its turn as he sets off from a stand is not thrown
        // down the floor in a frame; it is put down short, and the next one makes it up)
        const moved = Math.hypot(f.x - x0, f.z - z0);
        const most = ((FOOT_SWING * Math.max(sp, this.spLag) + FOOT_SWING_MIN) * s * dt) / 1000;
        if (moved > most) {
          f.x = x0 + ((f.x - x0) * most) / moved;
          f.z = z0 + ((f.z - z0) * most) / moved;
        }
      } else {
        f.up = Math.max(0, f.up - dt * 0.006 * s);
        // (down: flat until it is behind him, then the heel comes up as he goes over it)
        if (going && ahead) toes = 0.75 * clamp((-((f.x - this.x) * this.vx + (f.z - this.z) * this.vz) / vl - 0.35 * s) / (0.9 * s), 0, 1);
      }
      // (faster than his legs can turn over: the foot can't stay where it landed. It comes off the floor and skips after him, not dragged along it)
      const dx = f.x - this.x;
      const dz = f.z - this.z;
      const far = Math.hypot(dx, dz);
      const max = (REACH + 0.3) * s + w;
      if (far > max) {
        f.x = this.x + (dx / far) * max;
        f.z = this.z + (dz / far) * max;
        if (!swinging) f.up = Math.min(0.3 * s, f.up + dt * 0.012 * s);
      }
      // (in the air his toes point)
      if (this.pose[I.air] > 0.5) toes = 0.6;
      f.pitch += (toes - f.pitch) * (1 - Math.exp(-dt / 45));
    });
    // (put down where the knock sent it, it is his own foot again: he steps back under himself when he next can)
    if (this.catchLand) [this.catchK, this.catchLand] = [-1, false];
  }

  /** Hips, chest, head, legs: everything but the arms (they wait for the ball). */
  private solve(vf: number, vs: number) {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    const air = clamp(P[I.air], 0, 1);
    const put = (k: number, x: number, y: number, z: number) => {
      j[k * 3] = x;
      j[k * 3 + 1] = y;
      j[k * 3 + 2] = z;
    };
    // feet, in his frame: planted where they are on the floor, or hanging from a jump
    const w = (HIP_W + 0.08 + P[I.wide] * 0.6) * s;
    const jump = Math.max(0, P[I.hip]) * s;
    const fl: [number, number, number][] = [];
    this.feet.forEach((f, k) => {
      const [lx, lz] = this.local(f.x, f.z);
      const ax = (k ? -1 : 1) * w;
      const au = jump + P[k ? I.fru : I.flu] * s;
      const af = P[k ? I.frf : I.flf] * s;
      const x = lx + (ax - lx) * air;
      const z = lz + (af - lz) * air;
      const y = ANKLE * s + f.up * (1 - air) + au * air;
      fl.push([x, y, z]);
      if (air > 0.5) {
        // (in the air his feet go with him: he lands where he comes down)
        const o = this.world(ax, 0, af, TMP);
        f.x = o.x;
        f.z = o.z;
        f.up = 0;
        f.swing = false;
      }
    });
    // hips: as high as the pose says, never higher than both legs can reach from
    const want = (HIP + P[I.hip]) * s;
    let hipY = want;
    const legs = (THIGH + SHIN) * s * 0.985;
    // (no lower than this, ever: his seat on the floor knocked down, else well up; never above where the pose has him, as he gets up out of a fall)
    const floorY = Math.min((this.clip === 'stumble' ? 0.72 : 1.7) * s, want);
    if (air < 0.5) {
      fl.forEach(([x, y, z], k) => {
        // (a foot in the air holds nothing down: its leg folds to follow)
        if (this.feet[k].swing) return;
        const dh = Math.hypot(x - ((k ? -1 : 1) * HIP_W + P[I.sway]) * s, z - P[I.surge] * s);
        hipY = Math.min(hipY, Math.sqrt(Math.max(0.5, legs * legs - dh * dh)) + y);
      });
      // a long stride sinks him a little, no more: past that the heel comes off the floor instead
      // (knocked down he goes all the way to the floor: his seat on it, his knees up)
      hipY = Math.max(hipY, want - SINK * s, floorY);
    }
    // (that sink comes in over a frame or two and goes over a few: a foot put down far ahead doesn't jerk his hips
    // down for one frame and up the next. The leg reaching for it straightens softly the rest of the way)
    const need = want - hipY;
    this.sink = this.sinkFrom + (need - this.sinkFrom) * (1 - Math.exp(-this.ownMs / (need > this.sinkFrom ? SINK_IN : SINK_OUT)));
    hipY = Math.max(want - this.sink, floorY);
    // (a captured clip leans as the runner did: only a keyed one is leaned by his speed)
    const keyed = CLIPS[this.clip].dense ? 0 : 1;
    spine(P, this.body, hipY, j, this.up, this.front, this.left, vf * keyed, vs * keyed);
    put(J.fl, fl[0][0], fl[0][1], fl[0][2]);
    put(J.fr, fl[1][0], fl[1][1], fl[1][2]);
    reach(j, J.jl, J.kl, J.fl, THIGH * s, SHIN * s, 0.25, 0.1, 1, KNEE_SOFT);
    reach(j, J.jr, J.kr, J.fr, THIGH * s, SHIN * s, -0.25, 0.1, 1, KNEE_SOFT);
    this.vf = vf;
    this.vs = vs;
  }

  /** Where the ball is when it's his, in the scene: where the pose puts it, never out of the reach of the hand that has it. */
  carry(out: V3): V3 {
    const { s } = this.body;
    // (asked where it will be his while it isn't yet: a dribble he lost on its way down is long gone)
    if (!this.has) this.pickY = -1;
    const P = this.pose;
    const j = this.j;
    let x = -P[I.bx] * s;
    let y = P[I.by] * s + Math.max(0, P[I.hip]) * s;
    let z = P[I.bz] * s;
    const g = Math.max(P[I.gl], P[I.gr]);
    if (isDunk(this.clip) && this.hasAim && this.one) {
      // a dunk: the ball goes to the rim, as far as his hands can take it (each on its side of the ball)
      const w = smooth(clamp((this.one.tau - (DUNK_AT - DUNK_REACH)) / DUNK_REACH, 0, 1));
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
    } else if (g > 0.5) {
      const k = (P[I.gr] >= P[I.gl] ? J.sr : J.sl) * 3;
      // (a dribbler's palm is on top of it: it is his hand that must reach, and the ball hangs under it)
      const top = CLIPS[this.clip].grip === 'top' ? PALM : 0;
      const dx = x - j[k];
      const dy = y + top - j[k + 1];
      const dz = z - j[k + 2];
      const d = Math.hypot(dx, dy, dz);
      const max = (UARM + FARM) * s * 0.97 - (top ? 0 : PALM);
      if (d > max) {
        // (as far as the hand has taken hold of it: a ball he is only now taking isn't pulled up to his hand in a frame)
        const w = smooth(clamp((g - 0.5) / REACH_TAKE, 0, 1));
        x += (j[k] + (dx / d) * max - x) * w;
        y += (j[k + 1] + (dy / d) * max - top - y) * w;
        z += (j[k + 2] + (dz / d) * max - z) * w;
      }
    } else if (DRIBBLES.has(this.clip) || this.clip === 'crossover' || this.clip === 'hesi') {
      // (a dribble between touches: where it will come back to his hand is no lower than his hand can go)
      const k = (this.drib.to > 0 ? J.sl : J.sr) * 3;
      const max = (UARM + FARM) * s * 0.97;
      y = Math.max(y, j[k + 1] - Math.sqrt(Math.max(0.3, max * max - (x - j[k]) ** 2 - (z - j[k + 2]) ** 2)) - PALM);
    }
    const one = this.one;
    if (one?.id === 'rebound' && this.takeK < 1) {
      // (a rebound comes to his hands as high as it is when he gets to it, and is drawn in from there as the clip draws it)
      const take = (REB_LOW + (REB_TOP - REB_LOW) * this.takeK) * s;
      y += (take - y) * (1 - smooth(clamp(one.tau / REB_IN, 0, 1)));
    }
    if (this.catchT < GIVE_IN + GIVE_OUT && !isDunk(this.clip)) {
      // (a fast ball caught: on the way it came, toward his chest, and back)
      const t = this.catchT;
      const e = t < GIVE_IN ? Math.sin((Math.PI / 2) * (t / GIVE_IN)) : 1 - smooth((t - GIVE_IN) / GIVE_OUT);
      x += this.catchD.x * e;
      y += this.catchD.y * e;
      z += this.catchD.z * e;
    }
    if (this.pressed > 0.02 && !isDunk(this.clip)) {
      // (kept out of the man on him: pushed away from his middle, as far as he is pressed)
      const [px, pz] = this.local(this.px0, this.pz0);
      const dx = x - px;
      const dz = z - pz;
      const far = Math.hypot(dx, dz);
      const clear = PRESS_CLEAR * s;
      if (far < clear) {
        const out = (clear - far) * Math.min(1, this.pressed * 3);
        // (straight back toward himself when it is dead centre on the man)
        const [ux, uz] = far > 0.05 ? [dx / far, dz / far] : [-px / (Math.hypot(px, pz) || 1), -pz / (Math.hypot(px, pz) || 1)];
        x += ux * out;
        z += uz * out;
      }
    }
    return this.keepOut(this.world(x, Math.max(BALL_R, y), z, out));
  }

  /**
   * A hand on its way to where it is wanted (`x`, `y`, `z` from its shoulder, in his frame). Where that is somewhere
   * else this frame than the way it was going (a grip let go after a shot or a pass, a gesture over, a catch, a clip
   * that has it elsewhere), the jump is carried: the hand goes on as it was going and comes to the new place as a
   * spring with no bounce, no faster than a hand is swung. On the ball (`held`: how far it has hold of it, 0..1) that
   * is all but at once; on the ring (`fixed`) it is there.
   */
  private toward(side: 1 | -1, x: number, y: number, z: number, held: number, fixed = false): V3 {
    const H = this.hand;
    // (where it was wanted at 0, how fast that was going at 6 (ft a ms), what it carries at 12, and how fast that is going at 18 (ft a second))
    const k = side > 0 ? 0 : 3;
    const dt = this.ownMs;
    const out = FOLLOWS[side > 0 ? 0 : 1];
    if (!this.gripped || fixed) {
      H.fill(0, k + 6, k + 9);
      H.fill(0, k + 12, k + 15);
      H.fill(0, k + 18, k + 21);
      H.fill(0, k + 24, k + 27);
    } else if (dt > 0) {
      const ex = x - H[k] - H[k + 6] * dt;
      const ey = y - H[k + 1] - H[k + 7] * dt;
      const ez = z - H[k + 2] - H[k + 8] * dt;
      // (a hand on the ball goes with it however it goes: only taking it or letting it go is a jump)
      const was = H[30 + (side > 0 ? 0 : 1)];
      const jump = Math.hypot(ex, ey, ez) > Math.max(HAND_JUMP, HAND_ACC * dt * dt) * this.body.s && (held < 0.5 || Math.abs(held - was) > 0.25);
      for (let a = 0; a < 3; a++) {
        const v = a === 0 ? x : a === 1 ? y : z;
        if (jump) {
          // (it stays where it was and keeps going as it was: the new place is where it is going)
          H[k + 12 + a] += H[k + a] - v;
          H[k + 18 + a] += H[k + 6 + a] * 1000;
          H[k + 6 + a] = 0;
        } else H[k + 6 + a] = (v - H[k + a]) / dt;
      }
      // (what it carries dies away)
      for (let a = 0; a < 3; a++) WAS3[a] = H[k + 12 + a];
      const sec = dt / 1000;
      const w = 2000 / (HAND_MS + (HAND_HELD_MS - HAND_MS) * smooth(clamp(held, 0, 1)));
      let mx = 0;
      for (let a = 0; a < 3; a++) {
        const [to, v] = spring(H[k + 12 + a], H[k + 18 + a], 0, w, sec);
        TMP3[a] = to - H[k + 12 + a];
        TMP3[a + 3] = v;
        mx += TMP3[a] * TMP3[a];
      }
      // (no faster than a hand is swung)
      const most = held > 0.5 ? Infinity : (HAND_SPEED * this.body.s * dt) / 1000;
      const cut = Math.sqrt(mx) > most ? most / Math.sqrt(mx) : 1;
      for (let a = 0; a < 3; a++) {
        H[k + 12 + a] += TMP3[a] * cut;
        H[k + 18 + a] = cut < 1 ? (TMP3[a] * cut * 1000) / dt : TMP3[a + 3];
      }
    }
    H[k] = x;
    H[k + 1] = y;
    H[k + 2] = z;
    H[30 + (side > 0 ? 0 : 1)] = held;
    out.x = x + H[k + 12];
    out.y = y + H[k + 13];
    out.z = z + H[k + 14];
    // (a free hand goes round his shoulder, no faster than an arm turns: what it is held back by it carries on with)
    if (this.gripped && !fixed && held < 0.5 && dt > 0 && this.round(side, out, dt)) {
      H[k + 12] = out.x - x;
      H[k + 13] = out.y - y;
      H[k + 14] = out.z - z;
      for (let a = 0; a < 3; a++) H[k + 18 + a] = ((H[k + 12 + a] - WAS3[a]) * 1000) / dt;
    }
    // (not folded in to his shoulder on the way: out round it)
    const d = Math.hypot(out.x, out.y, out.z);
    const least = Math.min(HAND_NEAR * this.body.s, Math.hypot(x, y, z));
    if (d < least && d > 1e-4) {
      out.x *= least / d;
      out.y *= least / d;
      out.z *= least / d;
    }
    return out;
  }

  /**
   * A free hand's way to `to` (from its shoulder, in his frame; moved in place) from where it was last frame: round
   * the shoulder no faster than ARM_TURN (ARM_BACK out of a move), in or out no faster than ARM_REACH. Says whether
   * it was held back.
   */
  private round(side: 1 | -1, to: V3, dt: number): boolean {
    const W = this.swung;
    const k = side > 0 ? 0 : 3;
    const pr = Math.hypot(W[k], W[k + 1], W[k + 2]);
    const qr = Math.hypot(to.x, to.y, to.z);
    if (pr < 1e-3 || qr < 1e-3) return false;
    const sec = dt / 1000;
    const th = Math.acos(clamp((W[k] * to.x + W[k + 1] * to.y + W[k + 2] * to.z) / (pr * qr), -1, 1));
    const relax = !this.one && this.loose < ARM_RELAX;
    const turn = this.one ? ARM_TURN * sec : relax ? Math.min(ARM_BACK * sec, th * (1 - Math.exp(-dt / ARM_EASE))) : ARM_FREE * sec;
    const most = ARM_REACH * this.body.s * sec * (relax ? ARM_BACK / ARM_FREE : 1);
    if (th <= turn && Math.abs(qr - pr) <= most) return false;
    const r = pr + clamp(qr - pr, -most, most);
    let [x, y, z] = [to.x / qr, to.y / qr, to.z / qr];
    if (th > turn) {
      // (turned toward it about the axis square to both; straight back the other way, about the one across his front)
      let [ax, ay, az] = [W[k + 1] * z - W[k + 2] * y, W[k + 2] * x - W[k] * z, W[k] * y - W[k + 1] * x];
      let al = Math.hypot(ax, ay, az);
      if (al < 1e-3 * pr) {
        [ax, ay, az] = [W[k + 1] * this.front.z - W[k + 2] * this.front.y, W[k + 2] * this.front.x - W[k] * this.front.z, W[k] * this.front.y - W[k + 1] * this.front.x];
        al = Math.hypot(ax, ay, az) || 1;
      }
      [ax, ay, az] = [ax / al, ay / al, az / al];
      const [px, py, pz] = [W[k] / pr, W[k + 1] / pr, W[k + 2] / pr];
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      // (Rodrigues: the axis is square to where it was)
      x = px * c + (ay * pz - az * py) * sn;
      y = py * c + (az * px - ax * pz) * sn;
      z = pz * c + (ax * py - ay * px) * sn;
    }
    to.x = x * r;
    to.y = y * r;
    to.z = z * r;
    return true;
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
  private rest(at: V3, r: number, near: readonly Puppet[]): number {
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
        if (limb && p !== J.jl && p !== J.jr) continue;
        o.world(oj[p * 3], oj[p * 3 + 1], oj[p * 3 + 2], SA);
        o.world(oj[q * 3], oj[q * 3 + 1], oj[q * 3 + 2], SB);
        clearOf(w, SA, SB, t * o.body.s * Math.sqrt(o.body.bulk) + r, 0, MINE);
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
    const d = Math.hypot(this.x - b.x, this.z - b.z) || 1;
    MINE.x = (this.x - b.x) / d;
    MINE.z = (this.z - b.z) / d;
    clearOf(w, b, ON, r + BALL_R + DODGE_GAP * this.body.s, soft, MINE);
    const moved = Math.hypot(w.x - x0, w.y - y0, w.z - z0);
    if (moved > 0) {
      [at.x, at.z] = this.local(w.x, w.z);
      at.y = w.y;
    }
    return moved;
  }

  /**
   * An arm (elbow `el`, hand `ha`) as solved, kept out of the ball that isn't his: where its elbow or the middle of its
   * forearm or his hand is in the ball's way (dodge, given way softly over DODGE_SOFT ft), the hand is moved as far as
   * that takes (twice as far for the forearm's middle). Says whether it moved; the arm is to be solved again.
   */
  private clearArm(side: 1 | -1, el: number, ha: number, by: Loose | null): boolean {
    const j = this.j;
    let mx = 0;
    let my = 0;
    let mz = 0;
    let most = 0;
    // (his elbow, the middle of his forearm, his wrist, and his hand on past it as far as its fingers go)
    for (const u of by ? [0, 0.5, 1, 1.4] : []) {
      HAND.x = j[el * 3] + (j[ha * 3] - j[el * 3]) * u;
      HAND.y = j[el * 3 + 1] + (j[ha * 3 + 1] - j[el * 3 + 1]) * u;
      HAND.z = j[el * 3 + 2] + (j[ha * 3 + 2] - j[el * 3 + 2]) * u;
      const [x0, y0, z0] = [HAND.x, HAND.y, HAND.z];
      const m = u === 0.5 ? 2 : 1;
      const d = this.dodge(HAND, (u < 1 ? ARM_R : u > 1 ? FINGERS_R : HAND_R) * this.body.s, by!, DODGE_S, DODGE_SOFT * this.body.s) * m;
      if (d <= most) continue;
      [mx, my, mz, most] = [(HAND.x - x0) * m, (HAND.y - y0) * m, (HAND.z - z0) * m, d];
    }
    // (moved there no faster than DODGE_RATE, and let go of as slowly: it never jumps)
    const C = this.cleared;
    const k = side > 0 ? 0 : 3;
    const ex = mx - C[k];
    const ey = my - C[k + 1];
    const ez = mz - C[k + 2];
    const far = Math.hypot(ex, ey, ez);
    const step = Math.min(1, (DODGE_RATE * this.body.s * this.ownMs) / 1000 / (far || 1));
    C[k] += ex * step;
    C[k + 1] += ey * step;
    C[k + 2] += ez * step;
    if (Math.abs(C[k]) + Math.abs(C[k + 1]) + Math.abs(C[k + 2]) < 1e-4) return false;
    j[ha * 3] += C[k];
    j[ha * 3 + 1] = Math.max(0.2 * this.body.s, j[ha * 3 + 1] + C[k + 1]);
    j[ha * 3 + 2] += C[k + 2];
    return true;
  }

  /**
   * His arms: to where the pose has his hands, or onto the ball (the scene's point) as far as each hand has hold of it.
   * `near`: the men round him (the ten on the floor): a free hand or an arm that would go into one of them rests on
   * him instead, or is drawn back off him. `loose`: the ball when it isn't his (where it is, and how fast it is going, ft
   * a second of the bodies' time): his free hands and forearms keep out of its way (see dodge).
   */
  arms(ball: V3 | null, near: readonly Puppet[] = [], loose: Loose | null = null) {
    const { s } = this.body;
    const P = this.pose;
    const j = this.j;
    this.loose = this.one ? 0 : this.loose + this.ownMs;
    this.catchT += this.ownMs;
    if (near.length) this.heads(near);
    const l = this.left;
    const f = this.front;
    let bx = 0;
    let by = 0;
    let bz = 0;
    if (ball) {
      [bx, bz] = this.local(ball.x, ball.z);
      by = ball.y;
    }
    const grip = CLIPS[this.clip].grip;
    // (a dribble in the air: the hand it left, and past halfway the hand it is going to, stays over it)
    const dr = ball && grip === 'top' ? this.dribble : null;
    const over = dr && dr.phase < 1 ? (dr.phase > 0.5 ? dr.to : dr.hand) : 0;
    for (const side of [1, -1] as const) {
      const sh = (side > 0 ? J.sl : J.sr) * 3;
      const el = side > 0 ? J.el : J.er;
      const ha = side > 0 ? J.hl : J.hr;
      const ox = P[side > 0 ? I.lx : I.rx] * s * side;
      const oy = P[side > 0 ? I.ly : I.ry] * s;
      const oz = P[side > 0 ? I.lz : I.rz] * s;
      let x = j[sh] + l.x * ox + f.x * oz;
      let y = j[sh + 1] + oy + l.y * ox + f.y * oz;
      let z = j[sh + 2] + l.z * ox + f.z * oz;
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
      // (a dribble he has his hand on: the hand is on the ball, wherever the clip's own hand was)
      const g = ball ? (dr && dr.phase >= 1 && dr.hand === side ? 1 : clamp(P[side > 0 ? I.gl : I.gr], 0, 1)) : 0;
      // (a man up against that side: the arm comes in to him, or, already up, goes on up out of his way)
      const tuck = near.length && !this.onRim && !(r && r.side === side && r.w > 0) ? this.crowded(side, near) * (1 - g) : 0;
      if (tuck > 0) {
        // (up: the hand already well over his shoulder)
        const up = y - j[sh + 1] > 0.7 * s;
        const [tx, ty, tz] = up ? TUCK_UP : TUCK;
        x += (j[sh] + (l.x * tx * side + f.x * tz) * s - x) * tuck;
        y += (j[sh + 1] + ty * s - y) * tuck;
        z += (j[sh + 2] + (l.z * tx * side + f.z * tz) * s - z) * tuck;
      }
      // on its side (two hands), on top of it (a dribble), or under and behind it (a shot): from one to another
      // (a catch into a dribble) the hand goes round the ball, it doesn't jump to its new side
      let gx = side * PALM;
      let gy = 0;
      let gz = 0;
      if (grip === 'top') [gx, gy] = [0, PALM];
      else if (grip === 'under' && side === (this.south && this.clip === 'layup' ? 1 : -1)) [gx, gy, gz] = [0, -PALM * 0.7, -PALM * 0.7];
      const go = side > 0 ? 0 : 3;
      const ge = this.gripped ? 1 - Math.exp(-this.ownMs / GRIP_MS) : 1;
      this.grips[go] += (gx - this.grips[go]) * ge;
      this.grips[go + 1] += (gy - this.grips[go + 1]) * ge;
      this.grips[go + 2] += (gz - this.grips[go + 2]) * ge;
      if (g > 0) {
        const hx = bx + this.grips[go];
        const hy = by + this.grips[go + 1];
        const hz = bz + this.grips[go + 2];
        x += (hx - x) * g;
        y += (hy - y) * g;
        z += (hz - z) * g;
      }
      if (over === side) {
        // (over the ball all the way down and up; on it as it leaves and as it comes back, so they part and meet; never pressed into it)
        const u = dr!.phase;
        const k = dr!.to === dr!.hand ? 1 : smooth(clamp(Math.abs(u - 0.5) / 0.3, 0, 1));
        const on = Math.max(1 - smooth(clamp(u / 0.22, 0, 1)), smooth(clamp((u - 0.62) / 0.38, 0, 1)));
        x += (bx - x) * k;
        z += (bz - z) * k;
        y = Math.max(y + (by + PALM - y) * on, by + PALM * k);
      }
      // (a free hand into another man rests on him; one whose arm went into him last frame is drawn back off him;
      // and it goes by the ball, not through it)
      const dodging = !!loose && g < 0.5 && !this.onRim && this.near(loose);
      const free = (near.length > 0 || dodging) && g < 0.5 && !this.onRim;
      const pu = side > 0 ? 24 : 27;
      const H = this.hand;
      if (free) {
        HAND.x = x + H[pu];
        HAND.y = y + H[pu + 1];
        HAND.z = z + H[pu + 2];
        this.rest(HAND, HAND_R * s, near);
        if (dodging) this.dodge(HAND, HAND_R * s, loose!, DODGE_S);
        [x, y, z] = [HAND.x, HAND.y, HAND.z];
      }
      // (on its way there: a hand wanted somewhere new this frame is carried there, not thrown; on the ball it is on the ball)
      const held = over === side || this.onRim ? 1 : g;
      const fw = this.toward(side, x - j[sh], y - j[sh + 1], z - j[sh + 2], held, this.onRim);
      x = j[sh] + fw.x;
      y = j[sh + 1] + fw.y;
      z = j[sh + 2] + fw.z;
      // (and still out of him on its way there, and out of the ball where it is now)
      if (free) {
        HAND.x = x;
        HAND.y = y;
        HAND.z = z;
        if (this.rest(HAND, HAND_R * s, near) > 0) [x, y, z] = [HAND.x, HAND.y, HAND.z];
      }
      j[ha * 3] = x;
      j[ha * 3 + 1] = Math.max(0.2 * s, y);
      j[ha * 3 + 2] = z;
      // the elbow: down, out and a little back, swung the way the pose has it
      const k = (side > 0 ? J.sl : J.sr) * 3;
      const pole = this.elbow(side, x - j[k], j[ha * 3 + 1] - j[k + 1], z - j[k + 2], P[side > 0 ? I.lsw : I.rsw], g);
      reach(j, side > 0 ? J.sl : J.sr, el, ha, UARM * s, FARM * s, pole.x, pole.y, pole.z);
      // (his elbow or his forearm in the ball's way: the hand is moved off it as far as they must go, and the arm solved again)
      if (this.clearArm(side, el, ha, dodging ? loose : null)) reach(j, side > 0 ? J.sl : J.sr, el, ha, UARM * s, FARM * s, pole.x, pole.y, pole.z);
      // (where the hand is now, for its way on next frame: see round)
      const sw = side > 0 ? 0 : 3;
      for (let a = 0; a < 3; a++) this.swung[sw + a] = j[ha * 3 + a] - j[k + a];
      // (his elbow or his forearm in another man: next frame the hand is drawn back off him by as much, eased; else
      // what it was drawn back lets go)
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (free)
        for (const u of [0, 0.5]) {
          HAND.x = j[el * 3] + (j[ha * 3] - j[el * 3]) * u;
          HAND.y = j[el * 3 + 1] + (j[ha * 3 + 1] - j[el * 3 + 1]) * u;
          HAND.z = j[el * 3 + 2] + (j[ha * 3 + 2] - j[el * 3 + 2]) * u;
          const [x0, y0, z0] = [HAND.x, HAND.y, HAND.z];
          if (this.rest(HAND, ARM_R * s, near) > 0) {
            // (moving the hand moves the middle of the forearm half as far)
            const m = u > 0 ? 2 : 1;
            dx += (HAND.x - x0) * m;
            dy += (HAND.y - y0) * m;
            dz += (HAND.z - z0) * m;
          }
        }
      const ke = 1 - Math.exp(-this.ownMs / PULL_MS);
      H[pu] += dx * ke - (dx ? 0 : H[pu] * ke);
      H[pu + 1] += dy * ke - (dy ? 0 : H[pu + 1] * ke);
      H[pu + 2] += dz * ke - (dz ? 0 : H[pu + 2] * ke);
    }
    this.gripped = true;
  }
}

const TMP: V3 = { x: 0, y: 0, z: 0 };
const POLE: V3 = { x: 0, y: 0, z: 0 };
const OWN: V3 = { x: 0, y: 0, z: 0 };
const SA: V3 = { x: 0, y: 0, z: 0 };
const SB: V3 = { x: 0, y: 0, z: 0 };
const FLIP = new Float32Array(N);
const TMP3 = new Float64Array(6);
const WP: V3 = { x: 0, y: 0, z: 0 };
const HAND: V3 = { x: 0, y: 0, z: 0 };
const ON: V3 = { x: 0, y: 0, z: 0 };
const MINE = { x: 0, z: 0 };
const HEAD_AT: V3 = { x: 0, y: 0, z: 0 };
const GRIP_AT: V3 = { x: 0, y: 0, z: 0 };
const ELB_WAS: V3 = { x: 0, y: 0, z: 0 };
const WAS3 = new Float64Array(3);
const FOLLOWS: [V3, V3] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
];
const MIX = new Float32Array(N);
const G = new Float32Array(N);
const FOLLOWED = Object.entries(FOLLOW).map(([c, v]) => [I[c as keyof typeof I], v] as [number, number]);
