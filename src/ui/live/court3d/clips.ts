// The figures' motion clips. Every player is the same puppet: a pose is where his hands and feet
// are, how his hips and chest sit, and where the ball is when he has it; arms and legs are then
// solved to reach those points (puppet.ts), so a hand on the ball is on the ball and a planted foot
// stays planted. Most clips are motion capture, measured into these channels (scripts/mocap/build.ts
// writes mocap.gen.ts); the moves no take covers are keyframed here by hand.
//
// Units are feet on a 6 ft 6 figure (a taller one scales them). Hands are measured from their own
// shoulder: x out to that side, y up, z forward. The ball: x to his right, y above the floor,
// z forward.
import { MOCAP, MOCAP_CHANNELS } from './mocap.gen';

export const CHANNELS = [
  'hip', // hips up (a jump) or down (a crouch)
  'lean', // chest forward (radians)
  'twist', // chest turned to his left
  'tilt', // chest tipped to his left
  'nod',
  'lx',
  'ly',
  'lz',
  'rx',
  'ry',
  'rz',
  'flu', // left foot, off the floor: up, forward (in the air, or a knee driven up)
  'flf',
  'fru',
  'frf',
  'air', // 0 on the floor (feet planted by the gait), 1 in the air (feet hang from the hips)
  'wide', // stance, wider than the hips
  'bx',
  'by',
  'bz',
  'gl', // left hand on the ball, 0..1
  'gr',
  'leap', // carried toward the rim he's going at, 0..1
  'sway', // hips shifted to his left, and forward
  'surge',
  'pyaw', // hips turned to his left, and tipped (left side up)
  'proll',
  'turn', // head turned to his left
  'lsw', // an elbow swung round its arm, from where it hangs
  'rsw',
] as const;
export type Channel = (typeof CHANNELS)[number];
export const N = CHANNELS.length;
export const I = Object.fromEntries(CHANNELS.map((c, i) => [c, i])) as Record<Channel, number>;

export type PoseKey = Partial<Record<Channel, number>>;

/** Standing, arms down. */
const REST: Record<Channel, number> = {
  hip: 0,
  lean: 0.03,
  twist: 0,
  tilt: 0,
  nod: 0,
  lx: 0.28,
  ly: -1.98,
  lz: 0.12,
  rx: 0.28,
  ry: -1.98,
  rz: 0.12,
  flu: 0,
  flf: 0,
  fru: 0,
  frf: 0,
  air: 0,
  wide: 0,
  bx: 0.1,
  by: 4.2,
  bz: 0.85,
  gl: 0,
  gr: 0,
  leap: 0,
  sway: 0,
  surge: 0,
  pyaw: 0,
  proll: 0,
  turn: 0,
  lsw: 0,
  rsw: 0,
};

export type ClipId =
  | 'idle'
  | 'idle2'
  | 'idle3'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'backpedal'
  | 'shuffle'
  | 'stance'
  | 'ready'
  | 'dribble'
  | 'dribbleRun'
  | 'crossover'
  | 'hold'
  | 'pass'
  | 'catch'
  | 'jumper'
  | 'floater'
  | 'layup'
  | 'dunk'
  | 'freeThrow'
  | 'rebound'
  | 'block'
  | 'contest'
  | 'screen'
  | 'postUp'
  | 'boxout'
  | 'steal'
  | 'celebrate'
  | 'rue';

/**
 * How a clip is timed: a 'loop' by the clock, a 'gait' by the stride (its keys at fractions of one,
 * the left foot swinging through the first half), a 'shot' around one moment of the play (keys in ms
 * before and after it: the release, the catch, the block).
 */
export interface Clip {
  id: ClipId;
  kind: 'loop' | 'gait' | 'shot';
  /** A loop's length, ms. */
  dur: number;
  at: number[];
  poses: Float32Array[];
  /** Where a hand sits on the ball. */
  grip: 'side' | 'top' | 'under';
  /** Anything a keyframe can't say (a dribble's bounce). */
  fn?: (out: Float32Array, u: number) => void;
  /** Captured motion, sampled many times a second: read straight between its keys, not eased. */
  dense?: boolean;
}

function clip(id: ClipId, kind: Clip['kind'], dur: number, base: PoseKey, keys: [number, PoseKey][], extra: Partial<Pick<Clip, 'grip' | 'fn'>> = {}): Clip {
  const start = { ...REST, ...base };
  return {
    id,
    kind,
    dur,
    at: keys.map((k) => k[0]),
    poses: keys.map(([, key]) => Float32Array.from(CHANNELS, (c) => key[c] ?? start[c])),
    grip: 'side',
    ...extra,
  };
}

// --- poses the clips share ---
const HOLD: PoseKey = { bx: 0.15, by: 4.25, bz: 0.9, gl: 1, gr: 1, lx: 0.1, ly: -1, lz: 0.9, rx: 0.1, ry: -1, rz: 0.9, hip: -0.12, lean: 0.08 };
const GUARD_ARM: PoseKey = { lx: 0.85, ly: -0.95, lz: 0.75 };
const DRIBBLE: PoseKey = { ...GUARD_ARM, bx: 0.95, bz: 0.8, rx: 0.4, ry: -2.0, rz: 0.75, hip: -0.28, lean: 0.17, wide: 0.15 };

/** A dribble's bounce: the ball leaves the hand, hits the floor halfway and comes back up; the hand rides it near the top. */
const bounce =
  (top: number) =>
  (out: Float32Array, u: number): void => {
    const h = Math.abs(Math.cos(Math.PI * u));
    out[I.by] = 0.42 + (top - 0.42) * Math.pow(h, 0.85);
    out[I.gr] = Math.max(0, Math.min(1, (h - 0.45) / 0.3));
  };

const swing = (id: ClipId, base: PoseKey, a: PoseKey, b: PoseKey): Clip =>
  clip(id, 'gait', 1, base, [
    [0, a],
    [0.5, b],
    [1, a],
  ]);

const KEYED: Record<Exclude<ClipId, 'idle2' | 'idle3'>, Clip> = {
  // --- standing and getting around (the legs are the gait's; these are the rest of him) ---
  idle: clip('idle', 'loop', 2600, {}, [
    [0, {}],
    [0.5, { hip: -0.04, ly: -1.95, ry: -1.95, lean: 0.05 }],
    [1, {}],
  ]),
  walk: swing('walk', { lean: 0.05 }, { lz: 0.5, rz: -0.35 }, { lz: -0.35, rz: 0.5 }),
  run: swing(
    'run',
    { lean: 0.13, hip: -0.08, lx: 0.3, rx: 0.3 },
    { lz: 0.95, ly: -0.9, rz: -0.6, ry: -1.25, twist: -0.12 },
    { lz: -0.6, ly: -1.25, rz: 0.95, ry: -0.9, twist: 0.12 },
  ),
  sprint: swing(
    'sprint',
    { lean: 0.24, hip: -0.12, lx: 0.3, rx: 0.3 },
    { lz: 1.2, ly: -0.55, rz: -0.85, ry: -1.1, twist: -0.2 },
    { lz: -0.85, ly: -1.1, rz: 1.2, ry: -0.55, twist: 0.2 },
  ),
  backpedal: swing('backpedal', { lean: 0.02, hip: -0.3, lx: 0.75, rx: 0.75, ly: -1.3, ry: -1.3, wide: 0.1 }, { lz: 0.65, rz: 0.4 }, { lz: 0.4, rz: 0.65 }),
  shuffle: swing('shuffle', { lean: 0.2, hip: -0.5, wide: 0.45, lx: 1.3, ly: -0.9, lz: 0.75, rx: 1.3, ry: -0.9, rz: 0.75 }, { ly: -0.8, ry: -1 }, { ly: -1, ry: -0.8 }),
  stance: clip('stance', 'loop', 1100, { lean: 0.22, wide: 0.55, lx: 1.25, ly: -0.85, lz: 0.9, rx: 0.9, ry: -0.2, rz: 1.1 }, [
    [0, { hip: -0.52 }],
    [0.5, { hip: -0.6, ry: -0.05 }],
    [1, { hip: -0.52 }],
  ]),
  ready: clip('ready', 'loop', 1700, { lean: 0.13, wide: 0.35, lx: 1.05, ly: -1.15, lz: 0.6, rx: 1.05, ry: -1.15, rz: 0.6 }, [
    [0, { hip: -0.3 }],
    [0.5, { hip: -0.36 }],
    [1, { hip: -0.3 }],
  ]),

  // --- with the ball ---
  dribble: clip(
    'dribble',
    'loop',
    470,
    DRIBBLE,
    [
      [0, {}],
      [0.5, { hip: -0.33 }],
      [1, {}],
    ],
    { grip: 'top', fn: bounce(2.85) },
  ),
  dribbleRun: clip(
    'dribbleRun',
    'loop',
    400,
    { ...DRIBBLE, bz: 1.45, bx: 0.8, rz: 1.2, lean: 0.24, hip: -0.2, lx: 0.4, lz: -0.2, ly: -1.3 },
    [
      [0, { lz: -0.4 }],
      [0.5, { lz: 0.5 }],
      [1, { lz: -0.4 }],
    ],
    { grip: 'top', fn: bounce(3.1) },
  ),
  // (right to left and back, low, as a drive starts)
  crossover: clip(
    'crossover',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      [80, { bx: 0.1, by: 0.5, hip: -0.5, tilt: -0.14 }],
      [160, { bx: -0.85, by: 2.3, gl: 1, lx: 0.4, ly: -2, lz: 0.75, hip: -0.5, tilt: -0.24, twist: -0.3 }],
      [240, { bx: -0.1, by: 0.5, hip: -0.45, tilt: -0.1 }],
      [320, { by: 2.6, gr: 1 }],
    ],
    { grip: 'top' },
  ),
  hold: clip('hold', 'loop', 2200, HOLD, [
    [0, {}],
    [0.5, { by: 4.15, hip: -0.16 }],
    [1, {}],
  ]),
  // (0: it leaves his hands)
  pass: clip('pass', 'shot', 0, {}, [
    [0, { ...HOLD }],
    [45, { lx: 0, ly: -0.5, lz: 1.7, rx: 0, ry: -0.5, rz: 1.7, lean: 0.24, gl: 0, gr: 0 }],
    [120, { lx: 0.05, ly: -0.4, lz: 2, rx: 0.05, ry: -0.4, rz: 2, lean: 0.3 }],
    [330, {}],
  ]),
  // (0: it reaches them)
  catch: clip('catch', 'shot', 0, { bx: 0, by: 4.5, bz: 1.25 }, [
    [-230, { lx: 0.15, ly: -0.7, lz: 1.3, rx: 0.15, ry: -0.7, rz: 1.3 }],
    [-70, { lx: 0.1, ly: -0.5, lz: 1.6, rx: 0.1, ry: -0.5, rz: 1.6, gl: 0.5, gr: 0.5 }],
    [0, { gl: 1, gr: 1, lz: 1.3, rz: 1.3 }],
    [150, { ...HOLD }],
  ]),

  // --- shots (0: the release) ---
  jumper: clip(
    'jumper',
    'shot',
    0,
    { gl: 1, gr: 1, bx: 0.2 },
    [
      [-380, { ...HOLD }],
      [-210, { hip: -0.6, by: 4.3, bz: 0.75, lean: 0.14 }],
      [-80, { hip: -0.1, by: 6.1, bz: 0.5, lean: 0.02 }],
      [0, { hip: 0.9, air: 1, by: 7.5, bz: 0.65, lean: -0.03 }],
      [45, { hip: 1.1, air: 1, gl: 0, gr: 0, lx: 0.3, ly: 1.1, lz: 0.6, rx: 0.05, ry: 2, rz: 0.75, lean: -0.03 }],
      [150, { hip: 1.2, air: 1, gl: 0, gr: 0, lx: 0.35, ly: 0.8, lz: 0.6, rx: 0.05, ry: 1.95, rz: 0.95 }],
      [340, { hip: -0.3, gl: 0, gr: 0, lx: 0.4, ly: -0.6, lz: 0.5, rx: 0.1, ry: 1.3, rz: 0.9 }],
      [580, { gl: 0, gr: 0 }],
    ],
    { grip: 'under' },
  ),
  floater: clip(
    'floater',
    'shot',
    0,
    { gr: 1, bx: 0.45 },
    [
      [-300, { ...DRIBBLE, by: 2.8 }],
      [-150, { hip: -0.45, by: 4.2, bz: 0.9, gl: 1, lean: 0.15 }],
      [0, { hip: 0.6, air: 1, by: 7.3, bz: 1.05, flu: 0.5, flf: 0.5 }],
      [45, { hip: 0.75, air: 1, gr: 0, rx: 0.2, ry: 1.9, rz: 1.1, flu: 0.5, flf: 0.5 }],
      [300, { hip: -0.25, gr: 0, rx: 0.2, ry: 0.8, rz: 0.8 }],
      [480, { gr: 0 }],
    ],
    { grip: 'under' },
  ),
  layup: clip(
    'layup',
    'shot',
    0,
    { gr: 1, bx: 0.4 },
    [
      [-320, { ...DRIBBLE, by: 2.8, bz: 1.3 }],
      [-140, { hip: -0.4, by: 4.4, bz: 0.9, gl: 1, lean: 0.2 }],
      [0, { hip: 1.35, air: 1, by: 8.2, bz: 0.85, leap: 0.6, flu: 0.95, flf: 0.9, lx: 0.5, ly: -0.8, lz: 0.4, lean: 0.05 }],
      [50, { hip: 1.5, air: 1, gr: 0, rx: 0.2, ry: 2.05, rz: 0.7, leap: 0.68, flu: 0.9, flf: 0.8, lx: 0.5, ly: -0.8, lz: 0.4 }],
      [170, { hip: 1.2, air: 1, gr: 0, rx: 0.25, ry: 1.7, rz: 0.6, leap: 0.78, flu: 0.4, flf: 0.4 }],
      [340, { hip: -0.32, gr: 0, leap: 0.8, rx: 0.3, ry: -0.4, rz: 0.5 }],
      [460, { gr: 0, leap: 0.74 }],
    ],
    { grip: 'under' },
  ),
  // (the slam comes 180 ms into the shot's flight: see DUNK_AT)
  dunk: clip(
    'dunk',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0, bz: 1 },
    [
      [-340, { ...DRIBBLE, by: 2.8, bz: 1.3, gl: 0 }],
      [-170, { hip: -0.62, by: 4.2, lean: 0.22 }],
      [-40, { hip: 0.2, air: 0.4, by: 5.6, leap: 0.25 }],
      [70, { hip: 1.9, air: 1, by: 8.6, leap: 0.8, flu: 0.7, flf: 0.3, fru: 0.5, frf: -0.3, lean: -0.08 }],
      [150, { hip: 2.3, air: 1, by: 8.5, leap: 1, flu: 0.8, flf: 0.4, fru: 0.6, frf: -0.4, lean: 0.05 }],
      [200, { hip: 2.25, air: 1, by: 7.6, leap: 1, flu: 0.8, flf: 0.5, fru: 0.6, frf: -0.3, lean: 0.2 }],
      [230, { hip: 2.15, air: 1, gl: 0, gr: 0, lx: 0.15, ly: 1.75, lz: 0.9, rx: 0.15, ry: 1.75, rz: 0.9, leap: 1, flu: 0.7, flf: 0.6, fru: 0.5, frf: 0.2, lean: 0.15 }],
      [330, { hip: 1.5, air: 1, gl: 0, gr: 0, lx: 0.3, ly: 1.2, lz: 0.6, rx: 0.3, ry: 1.2, rz: 0.6, leap: 1 }],
      [500, { hip: -0.4, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.8, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5 }],
      [620, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'side' },
  ),
  freeThrow: clip(
    'freeThrow',
    'shot',
    0,
    { gl: 1, gr: 1, bx: 0.2 },
    [
      [-260, { ...HOLD }],
      [-130, { hip: -0.4, by: 4.4, bz: 0.8, lean: 0.1 }],
      [0, { hip: 0.08, by: 7.6, bz: 0.7 }],
      [45, { hip: 0.1, gl: 0, gr: 0, lx: 0.3, ly: 1, lz: 0.6, rx: 0.05, ry: 2, rz: 0.8 }],
      [330, { gl: 0, gr: 0, lx: 0.3, ly: 0.4, lz: 0.6, rx: 0.05, ry: 1.9, rz: 1 }],
      [620, { gl: 0, gr: 0 }],
    ],
    { grip: 'under' },
  ),

  // --- the rest of the game (0: the ball gets there, or the shot goes up) ---
  rebound: clip('rebound', 'shot', 0, { bx: 0, bz: 0.45 }, [
    [-330, { hip: -0.55, lx: 0.6, ly: -0.4, lz: 0.6, rx: 0.6, ry: -0.4, rz: 0.6, by: 8.4, wide: 0.3 }],
    [-150, { hip: 0.1, air: 0.3, lx: 0.3, ly: 1.4, lz: 0.5, rx: 0.3, ry: 1.4, rz: 0.5, by: 8.4, gl: 0.3, gr: 0.3 }],
    [0, { hip: 1.5, air: 1, lx: 0.1, ly: 2, lz: 0.45, rx: 0.1, ry: 2, rz: 0.45, by: 8.4, gl: 1, gr: 1 }],
    [170, { hip: 0.5, air: 1, by: 6.4, gl: 1, gr: 1 }],
    [320, { ...HOLD, hip: -0.4, by: 4.6, wide: 0.4 }],
    [460, { ...HOLD }],
  ]),
  block: clip('block', 'shot', 0, {}, [
    [-260, { hip: -0.55, lx: 0.7, ly: -0.6, lz: 0.6, rx: 0.5, ry: -0.2, rz: 0.7 }],
    [-50, { hip: 0.1, air: 0.3, rx: 0.2, ry: 1.2, rz: 0.7 }],
    [130, { hip: 1.7, air: 1, rx: 0.1, ry: 2.1, rz: 0.75, lx: 0.6, ly: -0.3, lz: 0.5, lean: 0.06 }],
    [220, { hip: 1.5, air: 1, rx: 0.1, ry: 1.9, rz: 1.3, lx: 0.6, ly: -0.3, lz: 0.5, lean: 0.12 }],
    [400, { hip: -0.35, rx: 0.4, ry: 0, rz: 0.7 }],
    [520, {}],
  ]),
  contest: clip('contest', 'shot', 0, { wide: 0.3 }, [
    [-220, { hip: -0.45, lx: 0.9, ly: -0.8, lz: 0.7, rx: 0.5, ry: 0.4, rz: 1 }],
    [40, { hip: 0.4, air: 0.8, rx: 0.15, ry: 2.05, rz: 0.9, lx: 0.8, ly: -0.6, lz: 0.6, lean: 0.1 }],
    [230, { hip: -0.25, rx: 0.2, ry: 1.6, rz: 0.9, lx: 0.8, ly: -0.8, lz: 0.5 }],
    [420, { hip: -0.2, lx: 0.9, ly: -1.2, lz: 0.5, rx: 0.9, ry: -1.2, rz: 0.5 }],
  ]),
  screen: clip('screen', 'loop', 2000, { hip: -0.3, wide: 0.6, lean: 0.06, lx: -0.55, ly: -0.95, lz: 0.5, rx: -0.55, ry: -1.1, rz: 0.42 }, [
    [0, {}],
    [0.5, { hip: -0.34 }],
    [1, {}],
  ]),
  postUp: clip('postUp', 'loop', 1500, { hip: -0.5, wide: 0.65, lean: 0.16, lx: 1.1, ly: -0.9, lz: -0.3, rx: 0.5, ry: 0.9, rz: 0.6 }, [
    [0, {}],
    [0.5, { hip: -0.56, ry: 1.05 }],
    [1, {}],
  ]),
  boxout: clip('boxout', 'loop', 1300, { hip: -0.55, wide: 0.7, lean: 0.2, lx: 1.4, ly: -0.7, lz: -0.2, rx: 1.4, ry: -0.7, rz: -0.2 }, [
    [0, {}],
    [0.5, { hip: -0.62, nod: -0.3 }],
    [1, {}],
  ]),
  steal: clip(
    'steal',
    'shot',
    0,
    { bx: 0.3, by: 3, bz: 1.6 },
    [
      [-230, { hip: -0.5, lean: 0.25, wide: 0.4, lx: 1, ly: -1, lz: 0.6, rx: 0.5, ry: -1, rz: 1 }],
      [-60, { hip: -0.55, lean: 0.5, wide: 0.5, rx: 0, ry: -1, rz: 2, lx: 1, ly: -1.1, lz: 0.2, gr: 0.6 }],
      [0, { hip: -0.5, lean: 0.45, rx: 0, ry: -1, rz: 1.9, gr: 1 }],
      [220, { ...DRIBBLE, by: 2.85, gr: 1 }],
    ],
    { grip: 'top' },
  ),
  celebrate: clip('celebrate', 'loop', 820, { lean: -0.05 }, [
    [0, { hip: -0.25, lx: 0.7, ly: 1.2, lz: 0.4, rx: 0.7, ry: 1.2, rz: 0.4 }],
    [0.5, { hip: 0.5, air: 0.9, lx: 0.6, ly: 2.05, lz: 0.3, rx: 0.6, ry: 2.05, rz: 0.3 }],
    [1, { hip: -0.25, lx: 0.7, ly: 1.2, lz: 0.4, rx: 0.7, ry: 1.2, rz: 0.4 }],
  ]),
  rue: clip('rue', 'loop', 2400, { lean: 0.02, lx: -0.25, ly: 1.05, lz: 0.2, rx: -0.25, ry: 1.05, rz: 0.2 }, [
    [0, { nod: -0.5 }],
    [0.5, { nod: -0.8, hip: -0.06 }],
    [1, { nod: -0.5 }],
  ]),
};

/** A captured stance shorter than this (ms) is a snatch of a man shifting his weight: looped at its own speed it twitches, so it's played over this long. */
const LOOP_MIN = 1100;

/**
 * A captured loop's join. Its last pose is its first, but the motion into the join and out of it are two
 * different moments of the take: every limb changes speed there, each time round (a twitch in a stance,
 * a hitch in a runner's arm). The poses around the join are smoothed round it, most at the join itself.
 */
function mend(poses: Float32Array[]): Float32Array[] {
  const n = poses.length - 1;
  if (n < 6) return poses;
  const reach = Math.max(2, Math.round(n * 0.22));
  let now = poses.slice(0, n);
  for (let pass = 0; pass < 6; pass++) {
    const next = now.map((p) => Float32Array.from(p));
    for (let k = -reach; k <= reach; k++) {
      const i = (k + n) % n;
      const w = 1 - Math.abs(k) / (reach + 1);
      const a = now[(i + n - 1) % n];
      const b = now[(i + 1) % n];
      for (let c = 0; c < N; c++) next[i][c] += ((a[c] + b[c]) / 2 - now[i][c]) * 0.5 * w;
    }
    now = next;
  }
  return [...now, Float32Array.from(now[0])];
}

/** The captured clips (mocap.gen.ts), if they were measured on these channels. */
const CAPTURED: Partial<Record<ClipId, Clip>> = {};
if (MOCAP_CHANNELS.length === N && MOCAP_CHANNELS.every((c, i) => c === CHANNELS[i]))
  for (const [id, m] of Object.entries(MOCAP)) {
    const poses = m.poses.map((p) => Float32Array.from(p));
    CAPTURED[id as ClipId] = {
      id: id as ClipId,
      kind: m.kind,
      dur: m.kind === 'loop' && m.dur < 700 ? LOOP_MIN : m.dur,
      at: m.at,
      poses: m.kind === 'shot' ? poses : mend(poses),
      grip: m.grip,
      dense: true,
    };
  }

/** Every clip: captured where a take covers the move, keyed by hand where none does (a dunk, a block, a celebration). */
export const CLIPS: Record<ClipId, Clip> = { ...KEYED, idle2: KEYED.idle, idle3: KEYED.idle, ...CAPTURED };

/** Whether a clip is captured motion. */
export const captured = (id: ClipId): boolean => !!CLIPS[id].dense;

/** A pose for the other hand: left for right. */
export function mirror(P: Float32Array) {
  const swap = (a: number, b: number) => {
    const t = P[a];
    P[a] = P[b];
    P[b] = t;
  };
  swap(I.lx, I.rx);
  swap(I.ly, I.ry);
  swap(I.lz, I.rz);
  swap(I.flu, I.fru);
  swap(I.flf, I.frf);
  swap(I.gl, I.gr);
  swap(I.lsw, I.rsw);
  P[I.lsw] *= -1;
  P[I.rsw] *= -1;
  P[I.twist] *= -1;
  P[I.tilt] *= -1;
  P[I.sway] *= -1;
  P[I.pyaw] *= -1;
  P[I.proll] *= -1;
  P[I.turn] *= -1;
  P[I.bx] *= -1;
}

/** A dunk's slam, ms after the shot leaves the floor's plan: the ball stays in his hands until then. */
export const DUNK_AT = 180;

/** A 'shot' clip's first and last moment (ms around its anchor). */
export const span = (c: Clip): [number, number] => [c.at[0], c.at[c.at.length - 1]];

/**
 * How fast each channel is moving at each key of a hand-keyed clip (per unit of its time). Through a key
 * on the way up or down it keeps going (the two sides' rates, meaned so it never overshoots either
 * pose); at a key where it turns round, and at the clip's ends, it is still.
 */
const SLOPES = new WeakMap<Clip, Float32Array[]>();
function slopes(c: Clip): Float32Array[] {
  let m = SLOPES.get(c);
  if (!m) {
    const { at, poses } = c;
    m = poses.map(() => new Float32Array(N));
    for (let k = 1; k < at.length - 1; k++)
      for (let i = 0; i < N; i++) {
        const d0 = (poses[k][i] - poses[k - 1][i]) / (at[k] - at[k - 1]);
        const d1 = (poses[k + 1][i] - poses[k][i]) / (at[k + 1] - at[k]);
        if (d0 * d1 > 0) m[k][i] = (2 * d0 * d1) / (d0 + d1);
      }
    SLOPES.set(c, m);
  }
  return m;
}

/** The clip's pose at `t` (a loop's or a gait's fraction 0..1, a shot's ms), written into `out`. */
export function sample(c: Clip, t: number, out: Float32Array): Float32Array {
  const { at, poses } = c;
  const last = at.length - 1;
  let u = t;
  if (c.kind !== 'shot') u = t - Math.floor(t);
  if (u <= at[0]) out.set(poses[0]);
  else if (u >= at[last]) out.set(poses[last]);
  else {
    let k = 1;
    while (at[k] < u) k++;
    const a = poses[k - 1];
    const b = poses[k];
    const x = (u - at[k - 1]) / (at[k] - at[k - 1]);
    if (c.dense) for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * x;
    else {
      // a curve through the keys: he moves through a pose on his way to the next, not to it and then on
      const m = slopes(c);
      const ma = m[k - 1];
      const mb = m[k];
      const h = at[k] - at[k - 1];
      const x2 = x * x;
      const x3 = x2 * x;
      const h10 = (x3 - 2 * x2 + x) * h;
      const h11 = (x3 - x2) * h;
      const h01 = 3 * x2 - 2 * x3;
      for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * h01 + ma[i] * h10 + mb[i] * h11;
    }
  }
  c.fn?.(out, u);
  return out;
}
