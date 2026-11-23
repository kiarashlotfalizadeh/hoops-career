// The figures' motion clips. Every player is the same puppet: a pose is where his hands and feet
// are, how his hips and chest sit, and where the ball is when he has it; arms and legs are then
// solved to reach those points (puppet.ts), so a hand on the ball is on the ball and a planted foot
// stays planted. Most clips are motion capture, measured into these channels (scripts/mocap/build.ts
// writes mocap.gen.ts); the moves no take covers are keyframed here by hand, and the keyed jumps off
// two feet (a rebound, a block, a contest) take their crouch, leap and landing from a captured one
// (`leapt`).
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
  'curl', // his ribs pitched forward past the line of his trunk (a rounded back), or back from it (an arched one)
  'ptip', // his pelvis pitched forward more than its usual share of his lean (his seat out), or less (tucked under)
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
  curl: 0,
  ptip: 0,
};

export type ClipId =
  | 'idle'
  | 'idle2'
  | 'idle3'
  | 'shift'
  | 'hips'
  | 'knees'
  | 'spot'
  | 'spot2'
  | 'spot3'
  | 'walk'
  | 'jog'
  | 'run'
  | 'sprint'
  | 'backpedal'
  | 'shuffle'
  | 'stance'
  | 'ready'
  | 'dribble'
  | 'dribbleRun'
  | 'dribbleWalk'
  | 'dribbleBack'
  | 'crossover'
  | 'hesi'
  | 'inOut'
  | 'pullBack'
  | 'btl'
  | 'behind'
  | 'spin'
  | 'stop'
  | 'closeout'
  | 'stumble'
  | 'start'
  | 'hold'
  | 'inbound'
  | 'pass'
  | 'passOne'
  | 'passOver'
  | 'handoff'
  | 'catch'
  | 'take'
  | 'jumper'
  | 'pump'
  | 'floater'
  | 'layup'
  | 'putback'
  | 'hook'
  | 'dunk'
  | 'dunk1'
  | 'dunkHang'
  | 'dunkBack'
  | 'dunkMill'
  | 'dunkRev'
  | 'dunkSide'
  | 'freeThrow'
  | 'ftRoutine'
  | 'rebound'
  | 'block'
  | 'contest'
  | 'screen'
  | 'postUp'
  | 'boxout'
  | 'crash'
  | 'tip'
  | 'pull'
  | 'steal'
  | 'celebrate'
  | 'cheer'
  | 'bump'
  | 'rue'
  | 'slump'
  | 'jump'
  | 'hug'
  | 'crouch'
  | 'kneel'
  | 'floor';

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

/** Each hand's grip on the ball, and its channels. */
const HANDS: [Channel, Channel[]][] = [
  ['gl', ['lx', 'ly', 'lz']],
  ['gr', ['rx', 'ry', 'rz']],
];

function clip(id: ClipId, kind: Clip['kind'], dur: number, base: PoseKey, keys: [number, PoseKey][], extra: Partial<Pick<Clip, 'grip' | 'fn'>> = {}): Clip {
  const start = { ...REST, ...base };
  // (a hand on the ball in a key that doesn't say where it is has it where the next key to say so puts it: on the ball it
  // is the ball's, and letting go of it, it goes on from there toward that, never down by his side and back up again)
  const own = keys.map(([at, key], i): [number, PoseKey] => {
    if (kind === 'loop') return [at, key];
    const out = { ...key };
    for (const [g, chans] of HANDS) {
      if ((key[g] ?? start[g]) <= 0) continue;
      for (const c of chans) {
        if (key[c] !== undefined || base[c] !== undefined) continue;
        const next = keys.slice(i + 1).find(([, k]) => k[c] !== undefined);
        if (next) out[c] = next[1][c];
      }
    }
    return [at, out];
  });
  return {
    id,
    kind,
    dur,
    at: own.map((k) => k[0]),
    poses: own.map(([, key]) => {
      const P = Float32Array.from(CHANNELS, (c) => key[c] ?? start[c]);
      // (his back, where neither the key nor the clip says how it is: as the rest of him has it)
      const [curl, ptip] = backOf(P);
      if (key.curl === undefined && base.curl === undefined) P[I.curl] = curl;
      if (key.ptip === undefined && base.ptip === undefined) P[I.ptip] = ptip;
      return P;
    }),
    grip: 'side',
    ...extra,
  };
}

/**
 * How a keyed pose's back is curved, from the rest of it (the pose's `curl` and `ptip`: a take measures them, see
 * scripts/mocap/build.ts, and what the takes show is what is said here). His back is hollowed by as much as his
 * pelvis is pitched forward of his ribs. A man reaching overhead arches: his ribs go back off the line of his trunk
 * while his pelvis stays tipped forward under them, and in the air his whole body is a bow from his heels to the
 * ball. One sat down into his legs on the floor has his seat back, hinged at his hips with his back straight; and one
 * bent far over (his hands on his knees) is rounded, his hips nearly upright under him. A hand on the ball says
 * nothing of where it is (a key's hand is the ball's): the ball does.
 */
const BACK = { arch: 0.3, bow: 0.08, sit: 0.28, round: 0.25 } as const;
function backOf(P: Float32Array): [number, number] {
  const unit = (v: number) => Math.max(0, Math.min(1, v));
  const air = unit(P[I.air]);
  const [gl, gr] = [unit(P[I.gl]), unit(P[I.gr])];
  const high = (y: number) => unit((y - 0.9) / 1.1);
  const reach = Math.max((1 - gl) * high(P[I.ly]), (1 - gr) * high(P[I.ry]), Math.max(gl, gr) * unit((P[I.by] - 6.9) / 1.6));
  const crouch = unit(-P[I.hip] / 0.8) * (1 - air);
  const over = unit((P[I.lean] - 0.45) / 0.4);
  return [BACK.round * over - BACK.arch * reach * (0.5 + 0.5 * air), BACK.sit * crouch * (1 - over) + BACK.bow * reach * air];
}

/** Standing, arms down, as numbers (what a gesture's trunk channels are measured from). */
export const REST_POSE = Float32Array.from(CHANNELS, (c) => REST[c]);

// --- poses the clips share ---
const HOLD: PoseKey = { bx: 0.15, by: 4.25, bz: 0.9, gl: 1, gr: 1, lx: 0.1, ly: -1, lz: 0.9, rx: 0.1, ry: -1, rz: 0.9, hip: -0.12, lean: 0.08 };
/** A man who has just caught it and could shoot, pass or go: knees bent, the ball in both hands on his right hip. */
const THREAT: PoseKey = { bx: 0.62, by: 3.65, bz: 0.55, gl: 1, gr: 1, hip: -0.3, lean: 0.17, wide: 0.22, twist: -0.14, lx: 0.1, ly: -1, lz: 0.9, rx: 0.1, ry: -1, rz: 0.9 };
/** A dribbler's other arm: up in front of him, its forearm across, a bar between the man on him and the ball. */
const GUARD_ARM: PoseKey = { lx: 0.62, ly: -0.62, lz: 1.0 };
const DRIBBLE: PoseKey = { ...GUARD_ARM, bx: 0.95, bz: 0.8, rx: 0.4, ry: -2.0, rz: 0.75, hip: -0.28, lean: 0.17, wide: 0.15 };
/** Hands on his hips, elbows out (the arms are solved down to his waist and fold outward). */
const ON_HIPS: PoseKey = { lx: -0.2, ly: -1.36, lz: -0.06, rx: -0.2, ry: -1.36, rz: -0.06 };
/** Bent over, his hands on his knees, arms straight. */
const ON_KNEES: PoseKey = { hip: -0.8, lean: 0.75, wide: 0.22, lx: -0.3, ly: -2.3, lz: -0.19, rx: -0.3, ry: -2.3, rz: -0.19 };
/** A dunk as it is thrown down: his back, which was a bow as he reached, crunched forward over his hips. */
const SLAM: PoseKey = { curl: 0.18, ptip: -0.08 };
/** The dunk up to the slam (DUNK_AT): the gather, the two-foot leap and the reach. Every dunk shares it, so the ball meets the rim on time. */
const DUNK_UP: [number, PoseKey][] = [
  [-340, { ...DRIBBLE, by: 2.8, bz: 1.3, gl: 0 }],
  [-170, { hip: -0.62, by: 4.2, lean: 0.22 }],
  [-40, { hip: 0.2, air: 0.4, by: 5.6, leap: 0.25 }],
  [70, { hip: 1.9, air: 1, by: 8.6, leap: 0.8, flu: 0.7, flf: 0.3, fru: 0.5, frf: -0.3, lean: -0.08 }],
  [150, { hip: 2.3, air: 1, by: 8.5, leap: 1, flu: 0.8, flf: 0.4, fru: 0.6, frf: -0.4, lean: 0.05 }],
  // (the slam: his ribs thrown down over his hips after the ball)
  [200, { hip: 2.25, air: 1, by: 7.6, leap: 1, flu: 0.8, flf: 0.5, fru: 0.6, frf: -0.3, lean: 0.2, ...SLAM }],
];
/** A free throw's bounce: one, off the floor at his right foot, between his catching it and setting (0: it goes up). */
const FT_BOUNCES: [number, number][] = [
  [-800, -590],
  [-540, -330],
];

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

const KEYED: Record<Exclude<ClipId, 'idle2' | 'idle3' | 'jog' | 'dribbleWalk' | 'dribbleBack' | 'jump' | 'closeout' | 'start'>, Clip> = {
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
  // (pulling up out of a run: the braking plant. His hips drop and stay back behind his lead foot, his chest goes back
  // against it and his arms out in front of him for balance, his head on forward a beat; he sinks into it, and comes up
  // into his ready stance. The legs are the gait's: a long last step, wide)
  stop: clip('stop', 'shot', 0, {}, [
    [0, { hip: -0.12, lean: 0.2, wide: 0.2, lx: 0.45, ly: -1.2, lz: 0.75, rx: 0.45, ry: -1.2, rz: 0.75 }],
    [55, { hip: -0.42, lean: -0.08, surge: -0.22, wide: 0.42, nod: 0.12, lx: 0.85, ly: -0.95, lz: 1.05, rx: 0.85, ry: -0.95, rz: 1.05 }],
    [150, { hip: -0.48, lean: 0.02, surge: -0.1, wide: 0.42, nod: 0.05, lx: 0.95, ly: -1.05, lz: 0.85, rx: 0.95, ry: -1.05, rz: 0.85 }],
    [330, { hip: -0.3, lean: 0.13, wide: 0.35, lx: 1.05, ly: -1.15, lz: 0.6, rx: 1.05, ry: -1.15, rz: 0.6 }],
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
  // (in and out: carried in across his body as if to cross it over, his head and his shoulders going with it, and
  // rolled back out the same side to the same hand: the man on him goes with the first half of it)
  inOut: clip(
    'inOut',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      [90, { bx: 0.6, by: 0.5, gr: 0, hip: -0.42 }],
      [190, { bx: 0.18, by: 2.5, gr: 1, hip: -0.44, tilt: -0.2, twist: -0.26, sway: 0.12, nod: 0.05, rx: 0.2, ry: -1.9, rz: 0.8 }],
      [270, { bx: 0.6, by: 2.25, gr: 1, hip: -0.46, tilt: 0.04, twist: -0.06 }],
      [350, { bx: 1.05, by: 0.5, gr: 0, hip: -0.48, tilt: 0.16, twist: 0.12 }],
      [450, { by: 2.6, gr: 1 }],
    ],
    { grip: 'top' },
  ),
  // (a snatch back: one hard dribble at the man, his weight over it, then pulled back to his hip as he rocks off his
  // front foot: the room a jump shot or the next move wants)
  pullBack: clip(
    'pullBack',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      [100, { by: 0.5, bz: 1.1, gr: 0, hip: -0.5, lean: 0.3, surge: 0.24 }],
      [210, { bx: 0.92, by: 2.7, bz: 0.4, gr: 1, hip: -0.5, lean: 0.03, surge: -0.24, rx: 0.5, ry: -1.8, rz: 0.35 }],
      [330, { bx: 0.95, by: 0.5, bz: 0.35, gr: 0, hip: -0.42, lean: 0.05, surge: -0.3 }],
      [450, { by: 2.8, bz: 0.6, gr: 1, hip: -0.32, lean: 0.12, surge: -0.1 }],
      [560, { by: 2.6, gr: 1 }],
    ],
    { grip: 'top' },
  ),
  // (between his legs: his feet split, his left ahead and his right back, and the ball put down through them from his
  // right hand to his left, which takes it behind his front thigh: his own leg is between the ball and the man)
  btl: clip(
    'btl',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      // (let go of, and taken, where a hand can be on top of it: pushed down from his hip, and up into his left by his thigh)
      [80, { bx: 0.6, by: 2.15, bz: 0.55, gr: 0.4, hip: -0.52, wide: 0.22, flf: 0.5, frf: -0.3, lean: 0.14 }],
      [160, { bx: 0.0, by: 0.5, bz: 0.1, gr: 0, hip: -0.6, wide: 0.26, flf: 0.55, frf: -0.35, lean: 0.2 }],
      [235, { bx: -0.7, by: 2.2, bz: 0.3, gl: 0.3, lx: 0.45, ly: -2.0, lz: 0.4, hip: -0.56, wide: 0.24, flf: 0.5, frf: -0.3, tilt: -0.12, twist: -0.2, lean: 0.16 }],
      [270, { bx: -0.78, by: 2.4, bz: 0.35, gl: 1, lx: 0.45, ly: -2.0, lz: 0.4, hip: -0.55, wide: 0.24, flf: 0.5, frf: -0.3, tilt: -0.14, twist: -0.22, lean: 0.16 }],
      // (it is his left hand's now, and stays there: he comes up out of the split with it)
      [330, { bx: -0.9, by: 2.5, bz: 0.6, gl: 1, lx: 0.4, ly: -2.0, lz: 0.6, hip: -0.42, tilt: -0.08, twist: -0.1, flf: 0.25, frf: -0.15 }],
      [410, { bx: -0.95, by: 2.6, gl: 1, lx: 0.4, ly: -2.0, lz: 0.75 }],
    ],
    { grip: 'top' },
  ),
  // (behind his back: carried back round his hip in his right hand, put down behind his heels and across, and taken by
  // his left as he steps on past it: all of him is between the ball and the man)
  behind: clip(
    'behind',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      [100, { bx: 0.95, by: 2.4, bz: -0.25, gr: 1, hip: -0.4, lean: 0.2, twist: 0.3, rx: 0.5, ry: -1.9, rz: -0.35 }],
      [125, { bx: 0.9, by: 2.2, bz: -0.45, gr: 0.4, hip: -0.42, lean: 0.22, twist: 0.26, rx: 0.5, ry: -1.9, rz: -0.45 }],
      [190, { bx: 0.1, by: 0.5, bz: -0.75, gr: 0, hip: -0.46, lean: 0.24, twist: 0.12 }],
      [262, { bx: -0.85, by: 2.2, bz: 0.05, gl: 0.3, lx: 0.5, ly: -2.0, lz: 0.15, hip: -0.45, lean: 0.2, twist: -0.26, tilt: -0.1, surge: 0.1 }],
      [295, { bx: -0.9, by: 2.4, bz: 0.15, gl: 1, lx: 0.5, ly: -2.0, lz: 0.2, hip: -0.44, lean: 0.2, twist: -0.3, tilt: -0.12, surge: 0.14 }],
      [350, { bx: -0.95, by: 2.5, bz: 0.55, gl: 1, lx: 0.4, ly: -2.0, lz: 0.55, hip: -0.38, twist: -0.12, tilt: -0.06 }],
      [430, { bx: -0.95, by: 2.6, gl: 1, lx: 0.4, ly: -2.0, lz: 0.75 }],
    ],
    { grip: 'top' },
  ),
  // (a spin: a hard dribble at the man, then round on his front foot with his back to him, the ball pulled round low on
  // his hip, and put out ahead into his other hand as he comes out of it. The turn itself is his body's: see
  // Puppet's SPIN)
  spin: clip(
    'spin',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      [90, { bx: 0.8, by: 0.5, bz: 0.55, gr: 0, hip: -0.5, lean: 0.22, wide: 0.2 }],
      [200, { bx: 0.85, by: 2.2, bz: 0.15, gr: 1, hip: -0.55, lean: 0.26, wide: 0.26, twist: 0.25, rx: 0.45, ry: -1.9, rz: 0.1, lx: 0.9, ly: -0.9, lz: 0.5 }],
      [275, { bx: 0.8, by: 2.15, bz: 0.25, gr: 0.4, hip: -0.54, lean: 0.26, wide: 0.26, twist: 0.2 }],
      [340, { bx: 0.6, by: 0.5, bz: 0.45, gr: 0, hip: -0.5, lean: 0.24, wide: 0.24, twist: 0.1 }],
      [415, { bx: -0.6, by: 2.2, bz: 0.85, gl: 0.3, lx: 0.4, ly: -2.0, lz: 0.85, hip: -0.46, lean: 0.24, tilt: -0.1, twist: -0.16 }],
      [450, { bx: -0.7, by: 2.4, bz: 0.9, gl: 1, lx: 0.4, ly: -2.0, lz: 0.85, hip: -0.45, lean: 0.24, tilt: -0.12, twist: -0.2 }],
      [520, { bx: -0.9, by: 2.5, bz: 0.85, gl: 1, lx: 0.4, ly: -2.0, lz: 0.8, hip: -0.38, lean: 0.2 }],
      [600, { bx: -0.95, by: 2.6, gl: 1, lx: 0.4, ly: -2.0, lz: 0.75 }],
    ],
    { grip: 'top' },
  ),
  // (a hesitation: he comes up out of his dribble with it riding his hand, as if to stop, and drops back into it)
  hesi: clip(
    'hesi',
    'shot',
    0,
    DRIBBLE,
    [
      [0, { by: 2.6, gr: 1 }],
      [115, { by: 0.5, gr: 0, hip: -0.3 }],
      [255, { by: 3.5, gr: 1, hip: -0.02, lean: 0.03, nod: 0.12, ry: -1.4, lx: 0.6, ly: -1.3, lz: 0.5 }],
      [430, { by: 3.4, gr: 1, hip: -0.06, lean: 0.04, nod: 0.1, ry: -1.45, lx: 0.6, ly: -1.3, lz: 0.5 }],
      [555, { by: 0.5, gr: 0, hip: -0.42, lean: 0.26 }],
      [680, { by: 2.6, gr: 1 }],
    ],
    { grip: 'top' },
  ),
  // (knocked off his feet by a foul: a stagger, down onto a hand, and up again)
  stumble: clip('stumble', 'shot', 0, {}, [
    [0, {}],
    [140, { hip: -0.35, lean: 0.34, tilt: 0.18, surge: 0.3, wide: 0.3, lx: 0.9, ly: -0.6, lz: 0.9, rx: 0.9, ry: -1.0, rz: 0.7 }],
    [300, { hip: -1.5, lean: 0.1, tilt: 0.2, surge: -0.5, wide: 0.5, lx: 0.9, ly: -1.2, lz: 0.6, rx: 0.5, ry: -2.2, rz: -0.3 }],
    [470, { hip: -2.55, lean: -0.42, tilt: 0.14, surge: -1.25, wide: 0.45, nod: 0.3, lx: 0.7, ly: -1.3, lz: 0.9, rx: 0.6, ry: -2.5, rz: -0.75 }],
    // (sat there, a hand up for whoever comes to pull him up)
    [900, { hip: -2.55, lean: -0.3, tilt: 0.05, surge: -1.2, wide: 0.45, nod: 0.25, lx: 0.35, ly: -0.5, lz: 1.35, rx: 0.6, ry: -2.5, rz: -0.7 }],
    [1150, { hip: -2.0, lean: 0.4, tilt: -0.1, surge: -0.5, wide: 0.5, nod: 0.3, lx: 0.25, ly: -0.2, lz: 1.5, rx: 0.5, ry: -2.6, rz: 0.9 }],
    [1400, { ...ON_KNEES, hip: -0.7, lean: 0.5, nod: 0.3 }],
    [1650, {}],
  ]),
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
  // (one hand: drawn back to his right hip, his weight on his back foot, then pushed through as he steps into it)
  passOne: clip(
    'passOne',
    'shot',
    0,
    {},
    [
      [-210, { ...HOLD }],
      [-90, { bx: 0.75, by: 4.2, bz: 0.25, gl: 0.5, gr: 1, rx: 0.55, ry: -1.0, rz: 0.15, lx: 0.1, ly: -0.9, lz: 0.85, twist: -0.28, surge: -0.12, hip: -0.22, lean: 0.04 }],
      [0, { bx: 0.5, by: 4.5, bz: 1.35, gl: 0, gr: 1, rx: 0.3, ry: -0.65, rz: 1.5, lx: 0.45, ly: -1.1, lz: 0.5, twist: 0.12, surge: 0.2, hip: -0.2, lean: 0.2 }],
      [60, { gl: 0, gr: 0, rx: 0.2, ry: -0.45, rz: 2.0, lx: 0.5, ly: -1.3, lz: 0.3, twist: 0.3, surge: 0.28, hip: -0.16, lean: 0.27 }],
      [170, { gl: 0, gr: 0, rx: 0.2, ry: -0.6, rz: 1.8, lx: 0.45, ly: -1.5, lz: 0.25, twist: 0.26, surge: 0.2, lean: 0.2 }],
      // (and let go of: the arm falls in front of him, the rest of the way after)
      [270, { gl: 0, gr: 0, rx: 0.25, ry: -0.95, rz: 1.6, lx: 0.4, ly: -1.65, lz: 0.3, twist: 0.18, surge: 0.1, lean: 0.14 }],
      [360, { gl: 0, gr: 0, rx: 0.3, ry: -1.45, rz: 1.05 }],
    ],
    { grip: 'under' },
  ),
  // (a hand-off: the ball held out at his belly toward the man coming by, one hand under it and one on it, his body
  // turned a little to wall off that man's defender. 0 is the moment it changes hands, and his move waits there until
  // it has (see exchange.ts): where he holds it out, and how long his hands stay on it, are the exchange's, not these
  // keys'. After it his hands come off it, the one under it last, and back in as he sets his feet for the screen that
  // comes with it)
  handoff: clip('handoff', 'shot', 0, {}, [
    [-330, { ...HOLD }],
    [-170, { bx: 0.6, by: 4.05, bz: 1.15, gl: 1, gr: 1, lx: 0.4, ly: -0.95, lz: 1.0, rx: 0.65, ry: -1.2, rz: 0.9, twist: -0.22, hip: -0.24, lean: 0.12, wide: 0.22 }],
    [0, { bx: 0.65, by: 4.05, bz: 1.2, gl: 1, gr: 1, lx: 0.45, ly: -0.95, lz: 1.05, rx: 0.7, ry: -1.2, rz: 0.95, twist: -0.26, hip: -0.27, lean: 0.12, wide: 0.28 }],
    [70, { bx: 0.65, by: 4.05, bz: 1.2, gl: 0.5, gr: 0.8, lx: 0.45, ly: -0.98, lz: 1.05, rx: 0.7, ry: -1.2, rz: 0.95, twist: -0.26, hip: -0.28, lean: 0.11, wide: 0.29 }],
    [140, { gl: 0, gr: 0, lx: 0.42, ly: -1.05, lz: 0.98, rx: 0.66, ry: -1.25, rz: 0.9, twist: -0.24, hip: -0.28, lean: 0.1, wide: 0.3 }],
    [290, { gl: 0, gr: 0, lx: 0.15, ly: -1.4, lz: 0.55, rx: 0.2, ry: -1.4, rz: 0.55, twist: -0.1, hip: -0.28, lean: 0.08, wide: 0.34 }],
    [400, { gl: 0, gr: 0, hip: -0.24, wide: 0.34 }],
  ]),
  // (two hands over his head: back behind it, then thrown from there)
  passOver: clip('passOver', 'shot', 0, {}, [
    // (the ball already on its way up in front of his face: from over his head (an inbound) it doesn't dip to his chest first)
    // (his elbows up and forward over it, not out to his sides: swung round their arms, forward, as it goes back behind his head)
    [-230, { bx: 0, by: 6.2, bz: 0.6, gl: 1, gr: 1, hip: -0.08, lean: 0.04, lsw: -0.5, rsw: 0.5 }],
    // (back over the top of his head, not through the back of it)
    [-100, { bx: 0, by: 7.3, bz: -0.3, gl: 1, gr: 1, lean: -0.1, surge: -0.1, hip: -0.06, nod: 0.1, lsw: -1.3, rsw: 1.3 }],
    [0, { bx: 0, by: 7.45, bz: 0.75, gl: 1, gr: 1, lean: 0.1, surge: 0.14, hip: -0.1, lsw: -1.0, rsw: 1.0 }],
    // (thrown: his arms on out after it, all but straight, up toward where it went)
    [55, { gl: 0, gr: 0, lx: 0.15, ly: 1.2, lz: 1.65, rx: 0.15, ry: 1.2, rz: 1.65, lean: 0.2, surge: 0.22, hip: -0.12, lsw: -0.4, rsw: 0.4 }],
    [170, { gl: 0, gr: 0, lx: 0.16, ly: 0.75, lz: 1.92, rx: 0.16, ry: 0.75, rz: 1.92, lean: 0.16, surge: 0.16 }],
    // (the follow-through let go of: the arms come down in front of him, still reaching, and fall the rest of the way after)
    [280, { gl: 0, gr: 0, lx: 0.3, ly: -0.2, lz: 1.6, rx: 0.3, ry: -0.2, rz: 1.6, lean: 0.1, surge: 0.08 }],
    [360, { gl: 0, gr: 0, lx: 0.3, ly: -1.15, lz: 1.05, rx: 0.3, ry: -1.15, rz: 1.05 }],
  ]),
  // (he shows his hands where he wants it, reaches for it, and gives with it as it comes in)
  catch: clip('catch', 'shot', 0, { bx: 0, by: 4.5, bz: 1.25 }, [
    [-420, { lx: 0.3, ly: -0.95, lz: 1.0, rx: 0.3, ry: -0.95, rz: 1.0, hip: -0.1 }],
    [-230, { lx: 0.2, ly: -0.7, lz: 1.35, rx: 0.2, ry: -0.7, rz: 1.35, hip: -0.14, lean: 0.07 }],
    [-70, { lx: 0.1, ly: -0.5, lz: 1.65, rx: 0.1, ry: -0.5, rz: 1.65, gl: 0.5, gr: 0.5, hip: -0.2, lean: 0.14, surge: 0.3 }],
    [0, { gl: 1, gr: 1, lx: 0.1, ly: -0.55, lz: 1.45, rx: 0.1, ry: -0.55, rz: 1.45, hip: -0.2, lean: 0.1, surge: 0.26 }],
    [90, { gl: 1, gr: 1, lx: 0.1, ly: -0.9, lz: 0.95, rx: 0.1, ry: -0.9, rz: 0.95, by: 4.3, bz: 0.95, hip: -0.24, lean: 0.03 }],
    // (he has it: down into a triple threat, the ball on his hip away from the man, his eyes up)
    [230, { ...THREAT }],
    [420, { ...THREAT, hip: -0.36, by: 3.5 }],
  ]),
  // (a hand-off taken on the run: his hands out for it as he comes, closed on it at 0, the moment it changes hands (his
  // move waits there until it has: see exchange.ts), then brought in to his belly on the side he goes on with it, out in
  // front of his legs, ready to put it on the floor; not down on his hip in a triple threat, where his running legs
  // would be through it)
  take: clip('take', 'shot', 0, { bx: 0, by: 4.5, bz: 1.25 }, [
    [-420, { lx: 0.3, ly: -0.95, lz: 1.0, rx: 0.3, ry: -0.95, rz: 1.0, hip: -0.1 }],
    [-230, { lx: 0.2, ly: -0.7, lz: 1.35, rx: 0.2, ry: -0.7, rz: 1.35, hip: -0.14, lean: 0.07 }],
    [-70, { lx: 0.1, ly: -0.5, lz: 1.65, rx: 0.1, ry: -0.5, rz: 1.65, gl: 0.5, gr: 0.5, hip: -0.18, lean: 0.12, surge: 0.2 }],
    [0, { gl: 1, gr: 1, lx: 0.1, ly: -0.55, lz: 1.45, rx: 0.1, ry: -0.55, rz: 1.45, hip: -0.18, lean: 0.12, surge: 0.18 }],
    [110, { gl: 1, gr: 1, lx: 0.12, ly: -0.85, lz: 1.1, rx: 0.12, ry: -0.85, rz: 1.1, bx: 0.15, by: 4.25, bz: 1.1, hip: -0.2, lean: 0.14 }],
    [260, { gl: 1, gr: 1, lx: 0.15, ly: -0.95, lz: 1.0, rx: 0.2, ry: -1.0, rz: 0.95, bx: 0.4, by: 4.0, bz: 1.05, hip: -0.22, lean: 0.16, twist: -0.06 }],
    [420, { gl: 0.8, gr: 1, lx: 0.2, ly: -1.0, lz: 0.95, rx: 0.3, ry: -1.1, rz: 0.9, bx: 0.6, by: 3.8, bz: 1.0, hip: -0.22, lean: 0.17, twist: -0.08 }],
  ]),
  // (out of bounds with it after a basket: the ball over his head, a look one way and a pump, before he throws it in)
  // (his hands up on it, where it is, whether the referee has let go of it yet or not: never down by his sides)
  inbound: clip(
    'inbound',
    'loop',
    1500,
    { bx: 0, by: 7.35, bz: 0.1, gl: 1, gr: 1, lx: -0.25, ly: 1.95, lz: 0.25, rx: -0.25, ry: 1.95, rz: 0.25, hip: -0.05, lean: 0.02, wide: 0.1 },
    [
      [0, { twist: 0.14 }],
      [0.3, { twist: -0.16, sway: -0.05 }],
      [0.5, { twist: -0.12, bz: 0.55, by: 7.2, lean: 0.1, surge: 0.08 }],
      [0.68, { twist: 0.05, bz: 0, by: 7.4, lean: -0.03 }],
      [1, { twist: 0.14 }],
    ],
  ),

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
  // (a shot fake: the ball shown up at his forehead as he comes up on his toes, and brought back down as the man goes up; 0: it starts)
  pump: clip(
    'pump',
    'shot',
    0,
    { gl: 1, gr: 1, bx: 0.2 },
    [
      [0, { ...HOLD, hip: -0.3 }],
      [90, { hip: -0.5, by: 4.4, bz: 0.75, lean: 0.14 }],
      [200, { hip: 0.03, by: 6.35, bz: 0.85, lean: 0.02, nod: -0.12 }],
      [290, { hip: 0.03, by: 6.25, bz: 0.85, lean: 0.02, nod: -0.12 }],
      [450, { hip: -0.45, by: 4.3, bz: 0.8, lean: 0.16, wide: 0.15 }],
      [560, { ...HOLD, hip: -0.4 }],
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
  // (a put-back: he has come down with the board and goes straight back up with it in both hands, no gather)
  putback: clip(
    'putback',
    'shot',
    0,
    { gl: 1, gr: 1, bx: 0.1 },
    [
      [-230, { ...HOLD, hip: -0.5, by: 5.4, bz: 0.6, wide: 0.35, lean: 0.1 }],
      [-90, { hip: -0.62, by: 6.2, bz: 0.55, wide: 0.35, lean: 0.12 }],
      [0, { hip: 1.15, air: 1, by: 8.7, bz: 0.7, leap: 0.3, lean: 0.02 }],
      [50, { hip: 1.25, air: 1, gl: 0, gr: 0, lx: 0.3, ly: 1.5, lz: 0.6, rx: 0.15, ry: 2.05, rz: 0.75, leap: 0.34 }],
      [190, { hip: 0.9, air: 1, gl: 0, gr: 0, lx: 0.4, ly: 0.9, lz: 0.6, rx: 0.2, ry: 1.7, rz: 0.7, leap: 0.4 }],
      [340, { hip: -0.35, gl: 0, gr: 0, leap: 0.4, lx: 0.5, ly: -0.6, lz: 0.5, rx: 0.4, ry: -0.2, rz: 0.6, wide: 0.3 }],
      [470, { gl: 0, gr: 0, leap: 0.38 }],
    ],
    { grip: 'under' },
  ),
  // (a big man's hook: he turns his shoulder to the rim, and the ball goes up over his head in a sweep off the far hand)
  hook: clip(
    'hook',
    'shot',
    0,
    { gr: 1, bx: 0.45 },
    [
      [-340, { ...DRIBBLE, by: 2.8 }],
      [-190, { hip: -0.5, by: 4.0, bx: 0.6, bz: 0.6, gl: 1, lean: 0.12, twist: -0.45, wide: 0.3 }],
      [-70, { hip: -0.1, by: 5.6, bx: 0.95, bz: 0.2, gl: 0.4, twist: -0.85, tilt: 0.12, lx: 0.7, ly: -0.5, lz: 0.7, flu: 0.3, flf: 0.3 }],
      [0, { hip: 0.75, air: 1, by: 8.55, bx: 0.35, bz: 0.3, gl: 0, twist: -1.0, tilt: 0.2, turn: 0.6, lx: 0.8, ly: -0.2, lz: 0.75, flu: 0.75, flf: 0.5, lean: -0.02 }],
      [50, { hip: 0.85, air: 1, gr: 0, gl: 0, rx: -0.45, ry: 2.0, rz: 0.2, twist: -0.9, tilt: 0.2, turn: 0.55, lx: 0.8, ly: -0.3, lz: 0.7, flu: 0.7, flf: 0.5 }],
      [200, { hip: 0.5, air: 1, gr: 0, gl: 0, rx: -0.6, ry: 1.5, rz: 0.5, twist: -0.6, tilt: 0.1, turn: 0.35, lx: 0.7, ly: -0.6, lz: 0.6, flu: 0.3, flf: 0.3 }],
      [330, { hip: -0.28, gr: 0, gl: 0, rx: 0.1, ry: 0.3, rz: 0.7, twist: -0.25 }],
      [500, { gr: 0, gl: 0 }],
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
      ...DUNK_UP,
      [230, { hip: 2.15, air: 1, gl: 0, gr: 0, lx: 0.15, ly: 1.75, lz: 0.9, rx: 0.15, ry: 1.75, rz: 0.9, leap: 1, flu: 0.7, flf: 0.6, fru: 0.5, frf: 0.2, lean: 0.15, ...SLAM }],
      [330, { hip: 1.5, air: 1, gl: 0, gr: 0, lx: 0.3, ly: 1.2, lz: 0.6, rx: 0.3, ry: 1.2, rz: 0.6, leap: 1 }],
      [500, { hip: -0.4, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.8, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5 }],
      [620, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'side' },
  ),
  // (one hand: the ball cocked high behind his head in his right, the left arm out for balance, thrown down through the ring)
  dunk1: clip(
    'dunk1',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0.1, bz: 1 },
    [
      ...DUNK_UP.slice(0, 2),
      [-40, { hip: 0.2, air: 0.4, by: 5.8, bx: 0.3, bz: 0.7, leap: 0.25, gl: 0.2 }],
      [70, { hip: 1.9, air: 1, by: 9.1, bx: 0.45, bz: 0.15, leap: 0.8, gl: 0, lx: 0.85, ly: 0.2, lz: 0.6, flu: 0.9, flf: 0.6, fru: 0.2, frf: -0.4, lean: -0.12, tilt: 0.12 }],
      [150, { hip: 2.3, air: 1, by: 9.2, bx: 0.4, bz: 0.45, leap: 1, gl: 0, lx: 0.9, ly: 0.4, lz: 0.5, flu: 0.95, flf: 0.7, fru: 0.25, frf: -0.4, lean: -0.05, tilt: 0.14 }],
      [200, { hip: 2.25, air: 1, by: 8.0, bx: 0.2, bz: 1.1, leap: 1, gl: 0, lx: 0.9, ly: 0.3, lz: 0.5, flu: 0.85, flf: 0.6, fru: 0.3, frf: -0.3, lean: 0.22, tilt: 0.06, ...SLAM }],
      [240, { hip: 2.1, air: 1, gl: 0, gr: 0, lx: 0.8, ly: 0.1, lz: 0.5, rx: 0.15, ry: 1.2, rz: 1.1, leap: 1, flu: 0.7, flf: 0.6, fru: 0.4, frf: 0.1, lean: 0.25, ...SLAM }],
      [340, { hip: 1.4, air: 1, gl: 0, gr: 0, lx: 0.6, ly: -0.3, lz: 0.5, rx: 0.3, ry: 0.2, rz: 0.8, leap: 1 }],
      [500, { hip: -0.45, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.9, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5, lean: 0.2 }],
      [640, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'under' },
  ),
  // (two hands, and he hangs on the rim a beat, legs down, before he drops)
  dunkHang: clip(
    'dunkHang',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0, bz: 1 },
    [
      ...DUNK_UP,
      [230, { hip: 2.15, air: 1, gl: 0, gr: 0, lx: 0.2, ly: 1.85, lz: 0.75, rx: 0.2, ry: 1.85, rz: 0.75, leap: 1, flu: 0.5, flf: 0.4, fru: 0.4, frf: 0.2, lean: 0.12, ...SLAM }],
      // (hung from the ring by his hands his body is let out long under them: his legs swing through and back)
      [
        330,
        {
          hip: 2.05,
          air: 1,
          gl: 0,
          gr: 0,
          lx: 0.25,
          ly: 1.95,
          lz: 0.6,
          rx: 0.25,
          ry: 1.95,
          rz: 0.6,
          leap: 1,
          flu: 0.1,
          flf: 0.15,
          fru: 0.05,
          frf: 0.1,
          lean: -0.04,
          curl: -0.12,
          ptip: -0.04,
        },
      ],
      [
        520,
        {
          hip: 1.95,
          air: 1,
          gl: 0,
          gr: 0,
          lx: 0.25,
          ly: 1.95,
          lz: 0.55,
          rx: 0.25,
          ry: 1.95,
          rz: 0.55,
          leap: 1,
          flu: 0.2,
          flf: 0.3,
          fru: 0.15,
          frf: 0.25,
          lean: 0.02,
          curl: 0.04,
          ptip: 0.02,
        },
      ],
      [640, { hip: 1.0, air: 1, gl: 0, gr: 0, lx: 0.4, ly: 1.0, lz: 0.5, rx: 0.4, ry: 1.0, rz: 0.5, leap: 1 }],
      [780, { hip: -0.45, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.8, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5, lean: 0.15 }],
      [900, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'side' },
  ),
  // (a windmill: the ball taken down past his hip in his right hand as he leaves the floor, swung back behind him at
  // arm's length, up over the top and thrown down through the ring: one full turn of his arm)
  dunkMill: clip(
    'dunkMill',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0.1, bz: 1 },
    [
      ...DUNK_UP.slice(0, 2),
      [-40, { hip: 0.2, air: 0.4, by: 4.1, bx: 0.85, bz: 0.55, leap: 0.25, gl: 0.1, twist: -0.2 }],
      [
        50,
        {
          hip: 1.8,
          air: 1,
          by: 4.9,
          bx: 1.05,
          bz: -0.8,
          leap: 0.75,
          gl: 0,
          lx: 0.8,
          ly: 0.2,
          lz: 0.6,
          flu: 0.9,
          flf: 0.6,
          fru: 0.2,
          frf: -0.4,
          lean: 0.05,
          tilt: 0.1,
          twist: -0.45,
        },
      ],
      [
        130,
        {
          hip: 2.3,
          air: 1,
          by: 9.0,
          bx: 0.7,
          bz: -0.45,
          leap: 1,
          gl: 0,
          lx: 0.9,
          ly: 0.4,
          lz: 0.5,
          flu: 0.95,
          flf: 0.7,
          fru: 0.25,
          frf: -0.4,
          lean: -0.12,
          tilt: 0.16,
          twist: -0.3,
        },
      ],
      [200, { hip: 2.25, air: 1, by: 7.9, bx: 0.2, bz: 1.1, leap: 1, gl: 0, lx: 0.9, ly: 0.3, lz: 0.5, flu: 0.85, flf: 0.6, fru: 0.3, frf: -0.3, lean: 0.24, tilt: 0.06 }],
      [240, { hip: 2.1, air: 1, gl: 0, gr: 0, lx: 0.8, ly: 0.1, lz: 0.5, rx: 0.15, ry: 1.2, rz: 1.1, leap: 1, flu: 0.7, flf: 0.6, fru: 0.4, frf: 0.1, lean: 0.25 }],
      [340, { hip: 1.4, air: 1, gl: 0, gr: 0, lx: 0.6, ly: -0.3, lz: 0.5, rx: 0.3, ry: 0.2, rz: 0.8, leap: 1 }],
      [500, { hip: -0.45, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.9, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5, lean: 0.2 }],
      [640, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'under' },
  ),
  // (a reverse: he turns in the air, his chest coming round away from the rim and his back arched to it, the ball
  // carried up in both hands and thrown down behind his own head)
  dunkRev: clip(
    'dunkRev',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0, bz: 1 },
    [
      ...DUNK_UP.slice(0, 3),
      [70, { hip: 1.9, air: 1, by: 8.3, bx: -0.25, bz: 0.6, leap: 0.8, flu: 0.8, flf: 0.3, fru: 0.6, frf: -0.2, lean: -0.12, twist: 0.8, tilt: -0.08, nod: -0.1 }],
      [150, { hip: 2.3, air: 1, by: 9.3, bx: -0.1, bz: 0.6, leap: 1, flu: 0.85, flf: 0.4, fru: 0.7, frf: -0.1, lean: -0.28, twist: 1.35, nod: -0.22 }],
      [200, { hip: 2.25, air: 1, by: 7.8, bx: 0, bz: 1.0, leap: 1, flu: 0.8, flf: 0.5, fru: 0.6, frf: 0.1, lean: -0.32, twist: 1.5, nod: -0.28 }],
      [
        240,
        {
          hip: 2.1,
          air: 1,
          gl: 0,
          gr: 0,
          lx: 0.15,
          ly: 1.55,
          lz: 0.9,
          rx: 0.15,
          ry: 1.55,
          rz: 0.9,
          leap: 1,
          flu: 0.6,
          flf: 0.5,
          fru: 0.5,
          frf: 0.2,
          lean: -0.26,
          twist: 1.4,
          nod: -0.2,
        },
      ],
      [340, { hip: 1.5, air: 1, gl: 0, gr: 0, lx: 0.3, ly: 1.0, lz: 0.6, rx: 0.3, ry: 1.0, rz: 0.6, leap: 1, lean: -0.1, twist: 0.8 }],
      [500, { hip: -0.42, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.8, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5, twist: 0.25 }],
      [620, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'side' },
  ),
  // (two hands, taken back behind his head at the top of it, his back arched and his knees up under him, and thrown down
  // as he folds over it)
  dunkBack: clip(
    'dunkBack',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0, bz: 1 },
    [
      ...DUNK_UP.slice(0, 3),
      [70, { hip: 1.9, air: 1, by: 9.3, bz: 0.05, leap: 0.8, flu: 1.0, flf: 0.5, fru: 0.95, frf: 0.4, lean: -0.22, nod: 0.1 }],
      [140, { hip: 2.3, air: 1, by: 9.5, bz: -0.1, leap: 1, flu: 1.1, flf: 0.6, fru: 1.0, frf: 0.5, lean: -0.28, nod: 0.1 }],
      [200, { hip: 2.25, air: 1, by: 7.7, bz: 1.05, leap: 1, flu: 0.8, flf: 0.5, fru: 0.7, frf: 0.2, lean: 0.3, curl: 0.24, ptip: -0.06 }],
      [
        240,
        {
          hip: 2.1,
          air: 1,
          gl: 0,
          gr: 0,
          lx: 0.15,
          ly: 1.6,
          lz: 1.0,
          rx: 0.15,
          ry: 1.6,
          rz: 1.0,
          leap: 1,
          flu: 0.6,
          flf: 0.5,
          fru: 0.5,
          frf: 0.2,
          lean: 0.3,
          curl: 0.24,
          ptip: -0.06,
        },
      ],
      [340, { hip: 1.5, air: 1, gl: 0, gr: 0, lx: 0.3, ly: 1.1, lz: 0.6, rx: 0.3, ry: 1.1, rz: 0.6, leap: 1, lean: 0.12 }],
      [500, { hip: -0.42, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.8, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5 }],
      [620, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'side' },
  ),
  // (one hand, the arm taken out wide and back with his body turned side on to the rim, and brought over the top like an
  // axe; the other arm down and out for balance)
  dunkSide: clip(
    'dunkSide',
    'shot',
    0,
    { gr: 1, gl: 1, bx: 0.1, bz: 1 },
    [
      ...DUNK_UP.slice(0, 2),
      [-40, { hip: 0.2, air: 0.4, by: 5.2, bx: 0.7, bz: 0.5, leap: 0.25, gl: 0.1, twist: -0.25 }],
      [
        70,
        {
          hip: 1.9,
          air: 1,
          by: 8.4,
          bx: 1.25,
          bz: 0.0,
          leap: 0.8,
          gl: 0,
          lx: 0.7,
          ly: -0.6,
          lz: 0.5,
          flu: 0.9,
          flf: 0.7,
          fru: 0.15,
          frf: -0.5,
          lean: -0.1,
          tilt: 0.22,
          twist: -0.5,
        },
      ],
      [
        150,
        {
          hip: 2.3,
          air: 1,
          by: 9.3,
          bx: 0.95,
          bz: 0.3,
          leap: 1,
          gl: 0,
          lx: 0.75,
          ly: -0.5,
          lz: 0.4,
          flu: 1.0,
          flf: 0.8,
          fru: 0.2,
          frf: -0.5,
          lean: -0.04,
          tilt: 0.24,
          twist: -0.4,
        },
      ],
      [
        200,
        {
          hip: 2.25,
          air: 1,
          by: 8.0,
          bx: 0.3,
          bz: 1.1,
          leap: 1,
          gl: 0,
          lx: 0.8,
          ly: -0.3,
          lz: 0.4,
          flu: 0.85,
          flf: 0.6,
          fru: 0.3,
          frf: -0.3,
          lean: 0.2,
          tilt: 0.08,
          twist: 0.1,
          ...SLAM,
        },
      ],
      [
        240,
        {
          hip: 2.1,
          air: 1,
          gl: 0,
          gr: 0,
          lx: 0.8,
          ly: -0.4,
          lz: 0.4,
          rx: 0.15,
          ry: 1.2,
          rz: 1.1,
          leap: 1,
          flu: 0.7,
          flf: 0.6,
          fru: 0.4,
          frf: 0.1,
          lean: 0.25,
          twist: 0.2,
          ...SLAM,
        },
      ],
      [340, { hip: 1.4, air: 1, gl: 0, gr: 0, lx: 0.6, ly: -0.5, lz: 0.5, rx: 0.3, ry: 0.2, rz: 0.8, leap: 1 }],
      [500, { hip: -0.45, gl: 0, gr: 0, leap: 1, lx: 0.5, ly: -0.9, lz: 0.5, rx: 0.5, ry: -0.8, rz: 0.5, lean: 0.2 }],
      [640, { gl: 0, gr: 0, leap: 0.95 }],
    ],
    { grip: 'under' },
  ),
  // (his routine at the line, as long as the plan leaves him: a bounce, the ball back into both hands, set. 0: the shot's move begins)
  ftRoutine: clip(
    'ftRoutine',
    'shot',
    0,
    { ...HOLD, hip: -0.06, lean: 0.05 },
    [
      [-900, { ...HOLD }],
      ...FT_BOUNCES.flatMap((b): [number, PoseKey][] => [
        [b[0], { bx: 0.42, by: 3.0, bz: 0.95, gl: 0, gr: 1, hip: -0.22, lean: 0.2, lx: 0.45, ly: -1.25, lz: 0.55, rx: 0.3, ry: -1.3, rz: 0.75, nod: -0.2 }],
        [b[1], { bx: 0.42, by: 3.0, bz: 0.95, gl: 0, gr: 1, hip: -0.25, lean: 0.22, lx: 0.45, ly: -1.25, lz: 0.55, rx: 0.3, ry: -1.3, rz: 0.75, nod: -0.2 }],
      ]),
      // (both hands on it, up off his knees, a breath with his eyes on the rim, and he sets)
      [-230, { ...HOLD, by: 3.9, hip: -0.16, lean: 0.12, nod: -0.05 }],
      [-110, { ...HOLD, by: 4.3, hip: -0.02, lean: 0.02, nod: 0.08 }],
      [0, { ...HOLD }],
    ],
    {
      grip: 'top',
      fn: (out, u) => {
        const b = FT_BOUNCES.find((x) => u > x[0] && u < x[1]);
        if (!b) return;
        const h = Math.abs(Math.cos((Math.PI * (u - b[0])) / (b[1] - b[0])));
        out[I.by] = 0.42 + (3.0 - 0.42) * Math.pow(h, 0.85);
        out[I.gr] = Math.max(0, Math.min(1, (h - 0.45) / 0.3));
      },
    },
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
    // (the swat: his arm thrown forward through the ball, his ribs after it)
    [220, { hip: 1.5, air: 1, rx: 0.1, ry: 1.9, rz: 1.3, lx: 0.6, ly: -0.3, lz: 0.5, lean: 0.12, curl: 0.08, ptip: -0.06 }],
    [400, { hip: -0.35, rx: 0.4, ry: 0, rz: 0.7 }],
    [520, {}],
  ]),
  contest: clip('contest', 'shot', 0, { wide: 0.3 }, [
    [-220, { hip: -0.45, lx: 0.9, ly: -0.8, lz: 0.7, rx: 0.5, ry: 0.4, rz: 1 }],
    // (a hand up at the shot, his body going at the shooter under it: straight, not bowed back as for a board)
    [40, { hip: 0.4, air: 0.8, rx: 0.15, ry: 2.05, rz: 0.9, lx: 0.8, ly: -0.6, lz: 0.6, lean: 0.1, curl: -0.08, ptip: 0 }],
    [230, { hip: -0.25, rx: 0.2, ry: 1.6, rz: 0.9, lx: 0.8, ly: -0.8, lz: 0.5, curl: -0.03 }],
    // (the arm comes down round him, out in front and to his side at its length, not folded down through his shoulder)
    [295, { hip: -0.24, rx: 0.85, ry: 1.1, rz: 1.25, lx: 0.85, ly: -0.95, lz: 0.5 }],
    [360, { hip: -0.22, rx: 1.25, ry: 0.05, rz: 1.35, lx: 0.88, ly: -1.1, lz: 0.5 }],
    [440, { hip: -0.2, lx: 0.9, ly: -1.2, lz: 0.5, rx: 0.95, ry: -1.15, rz: 0.6 }],
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
  // (sat back into the man behind him, arms out to hold him there, head up for the ball: he shoves back and gives)
  boxout: clip('boxout', 'loop', 1300, { hip: -0.6, wide: 0.75, lean: 0.24, surge: -0.22, nod: 0.3, lx: 1.4, ly: -0.8, lz: -0.35, rx: 1.4, ry: -0.8, rz: -0.35 }, [
    [0, {}],
    [0.5, { hip: -0.7, surge: -0.34, lean: 0.3, sway: 0.08 }],
    [1, {}],
  ]),
  // (going to the glass: low, his chest into the man in his way, forearms up for the ball, head back to find it)
  crash: clip('crash', 'loop', 900, { hip: -0.45, wide: 0.5, lean: 0.3, surge: 0.18, nod: 0.38, lx: 0.5, ly: -0.25, lz: 0.85, rx: 0.5, ry: -0.25, rz: 0.85 }, [
    [0, {}],
    [0.5, { hip: -0.56, surge: 0.28, lean: 0.36, sway: -0.1, ly: -0.05, ry: -0.4 }],
    [1, {}],
  ]),
  // (the opening tip: a crouch, straight up, one arm at full stretch, and a flick of the hand at the top; 0: he gets a hand to it)
  tip: clip('tip', 'shot', 0, { wide: 0.25 }, [
    [-300, { hip: -0.3, lean: 0.12, lx: 0.6, ly: -1.2, lz: 0.5, rx: 0.5, ry: -0.9, rz: 0.6, nod: 0.3 }],
    [-150, { hip: -0.75, lean: 0.24, lx: 0.7, ly: -1.5, lz: -0.3, rx: 0.6, ry: -1.4, rz: -0.3, nod: 0.35 }],
    [-40, { hip: 0.3, air: 0.5, rx: 0.2, ry: 1.3, rz: 0.6, lx: 0.6, ly: -0.6, lz: 0.4, nod: 0.45 }],
    [0, { hip: 1.75, air: 1, rx: 0.08, ry: 2.0, rz: 0.85, lx: 0.7, ly: -0.5, lz: 0.3, nod: 0.5, lean: 0.06, surge: 0.45, tilt: -0.08 }],
    [70, { hip: 1.85, air: 1, rx: 0.15, ry: 1.95, rz: -0.25, lx: 0.7, ly: -0.5, lz: 0.3, nod: 0.3, surge: 0.4, tilt: -0.06 }],
    [260, { hip: 0.9, air: 1, rx: 0.4, ry: 0.6, rz: 0.4, lx: 0.7, ly: -0.6, lz: 0.4 }],
    [400, { hip: -0.4, rx: 0.6, ry: -0.9, rz: 0.5, lx: 0.7, ly: -1, lz: 0.5, wide: 0.3 }],
    [540, {}],
  ]),
  // (pulling a teammate up off the floor: a hand down to him, braced, and back as he comes up; 0: he's there)
  pull: clip('pull', 'shot', 0, { wide: 0.3 }, [
    [0, {}],
    [220, { hip: -0.4, lean: 0.5, rx: 0.1, ry: -1.3, rz: 1.5, lx: 0.4, ly: -1.7, lz: 0.3, nod: -0.2, surge: 0.15 }],
    [620, { hip: -0.46, lean: 0.56, rx: 0.1, ry: -1.45, rz: 1.55, lx: 0.4, ly: -1.7, lz: 0.3, nod: -0.22, surge: 0.18 }],
    [900, { hip: -0.2, lean: 0.1, rx: 0.15, ry: -0.9, rz: 1.0, lx: 0.4, ly: -1.6, lz: 0.1, surge: -0.15 }],
    [1150, {}],
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
  // (fists pumping in turn, bouncing on his toes, head back)
  cheer: clip('cheer', 'loop', 760, { lean: -0.04, wide: 0.12, nod: 0.3 }, [
    [0, { hip: -0.14, lx: 0.55, ly: 1.05, lz: 0.35, rx: 0.5, ry: -0.35, rz: 0.55 }],
    [0.25, { hip: 0.02 }],
    [0.5, { hip: -0.14, lx: 0.5, ly: -0.35, lz: 0.55, rx: 0.55, ry: 1.05, rz: 0.35 }],
    [0.75, { hip: 0.02 }],
    [1, { hip: -0.14, lx: 0.55, ly: 1.05, lz: 0.35, rx: 0.5, ry: -0.35, rz: 0.55 }],
  ]),
  // (a chest bump with the man facing him: down, up together chest first, arms flung back, and down again)
  bump: clip('bump', 'shot', 0, { wide: 0.15 }, [
    [0, { hip: -0.12, lx: 0.6, ly: 0.9, lz: 0.4, rx: 0.6, ry: 0.9, rz: 0.4 }],
    [200, { hip: -0.55, lean: 0.28, lx: 0.45, ly: -1.3, lz: -0.45, rx: 0.45, ry: -1.3, rz: -0.45 }],
    [
      400,
      {
        hip: 1.05,
        air: 1,
        lean: 0.18,
        surge: 0.2,
        nod: 0.35,
        lx: 0.95,
        ly: 0.2,
        lz: -0.65,
        rx: 0.95,
        ry: 0.2,
        rz: -0.65,
        flu: 0.35,
        flf: -0.3,
        fru: 0.35,
        frf: -0.3,
        curl: -0.28,
        ptip: 0.1,
      },
    ],
    [580, { hip: 0.55, air: 1, lean: 0.02, surge: 0.05, lx: 0.8, ly: 1.4, lz: 0.15, rx: 0.8, ry: 1.4, rz: 0.15, flu: 0.2, fru: 0.2 }],
    [780, { hip: -0.32, lx: 0.6, ly: 1.5, lz: 0.3, rx: 0.6, ry: 1.5, rz: 0.3 }],
    [980, { hip: -0.1, lx: 0.6, ly: 0.9, lz: 0.4, rx: 0.6, ry: 0.9, rz: 0.4 }],
  ]),
  rue: clip('rue', 'loop', 2400, { lean: 0.02, lx: -0.25, ly: 1.05, lz: 0.2, rx: -0.25, ry: 1.05, rz: 0.2 }, [
    [0, { nod: -0.5 }],
    [0.5, { nod: -0.8, hip: -0.06 }],
    [1, { nod: -0.5 }],
  ]),
  // (bent over, hands on his knees, head down: it's gone)
  slump: clip('slump', 'loop', 3000, { ...ON_KNEES, lean: 0.82, nod: -0.55 }, [
    [0, {}],
    [0.5, { hip: -0.86, lean: 0.88, nod: -0.7 }],
    [1, {}],
  ]),

  // --- standing at rest (a dead ball: the line, a timeout, the walk up) and his weight going from foot to foot ---
  // (weight from one leg to the other, slowly, the hip of the leg he stands on up)
  shift: clip('shift', 'loop', 5200, { lean: 0.03 }, [
    [0, { sway: 0.11, proll: 0.05, tilt: -0.035, lx: 0.32, rx: 0.22, ly: -1.95, ry: -1.98 }],
    [0.5, { sway: -0.11, proll: -0.05, tilt: 0.035, lx: 0.22, rx: 0.32, ly: -1.98, ry: -1.95 }],
    [1, { sway: 0.11, proll: 0.05, tilt: -0.035, lx: 0.32, rx: 0.22, ly: -1.95, ry: -1.98 }],
  ]),
  hips: clip('hips', 'loop', 4600, { ...ON_HIPS, lean: 0.04, wide: 0.1 }, [
    [0, { sway: 0.08, proll: 0.04, nod: -0.12 }],
    [0.5, { sway: -0.06, proll: -0.03, nod: 0.06 }],
    [1, { sway: 0.08, proll: 0.04, nod: -0.12 }],
  ]),
  // --- off the ball with the play live ---
  // (what a man waiting for the ball does with his weight, his feet and his eyes is his own: Puppet.wait. These are his
  // carriage, which is everyone's: knees a little bent, his weight off his heels, his arms let hang, not held up)
  // (most of the time: loose, a little sat down, his hands hanging a touch in front of him)
  spot: clip('spot', 'loop', 4300, { hip: -0.1, lean: 0.07, wide: 0.1, lx: 0.24, ly: -1.93, lz: 0.22, rx: 0.24, ry: -1.93, rz: 0.22 }, [
    [0, {}],
    [0.45, { hip: -0.12, lz: 0.28, rz: 0.18 }],
    [1, {}],
  ]),
  // (near the ball and wanting it: lower, his hands up in front of his belt where the pass can be put, his elbows down)
  spot2: clip('spot2', 'loop', 3700, { hip: -0.24, lean: 0.15, wide: 0.24, lx: 0.12, ly: -1.02, lz: 0.68, rx: 0.12, ry: -1.02, rz: 0.68 }, [
    [0, {}],
    [0.5, { hip: -0.27, ly: -1.08, ry: -0.98 }],
    [1, {}],
  ]),
  // (the far side of the floor: standing taller, his hands on his hips)
  spot3: clip('spot3', 'loop', 4800, { ...ON_HIPS, hip: -0.05, lean: 0.03, wide: 0.12 }, [
    [0, { nod: -0.04 }],
    [0.5, { nod: 0.04 }],
    [1, { nod: -0.04 }],
  ]),
  // (bent over getting his breath back, head up to see the floor)
  knees: clip('knees', 'loop', 2400, { ...ON_KNEES, nod: 0.3 }, [
    [0, {}],
    [0.5, { hip: -0.84, lean: 0.79 }],
    [1, {}],
  ]),

  // --- the end of a big one (the scene picks them: see Drive.party) ---
  // (his arms round the man facing him, one over his shoulder and one under his arm, rocking side to side)
  hug: clip('hug', 'loop', 1500, { hip: -0.1, lean: 0.14, wide: 0.18, nod: -0.2, lx: -0.3, ly: -0.55, lz: 0.95, rx: -0.2, ry: -0.12, rz: 0.92, lsw: -0.5, rsw: -0.3 }, [
    [0, { tilt: 0.07, twist: 0.09, sway: 0.05 }],
    [0.5, { tilt: -0.07, twist: -0.09, sway: -0.05, hip: -0.16 }],
    [1, { tilt: 0.07, twist: 0.09, sway: 0.05 }],
  ]),
  // (down on his haunches, forearms on his knees, head hanging: it's gone)
  crouch: clip('crouch', 'loop', 3200, { hip: -1.5, lean: 0.5, wide: 0.42, nod: -0.75, lx: -0.08, ly: -1.15, lz: 0.95, rx: -0.08, ry: -1.2, rz: 0.92, lsw: 0.2, rsw: 0.2 }, [
    [0, {}],
    [0.5, { hip: -1.55, nod: -0.85, lean: 0.55 }],
    [1, {}],
  ]),
  // (on his knees, both fists up at the roof, head back)
  kneel: clip(
    'kneel',
    'loop',
    2200,
    { air: 1, hip: -1.47, flu: -0.12, flf: -1.4, fru: -0.12, frf: -1.4, wide: 0.12, lean: -0.1, nod: 0.5, lx: 0.5, ly: 1.75, lz: 0.4, rx: 0.5, ry: 1.75, rz: 0.4 },
    [
      [0, {}],
      [0.5, { lx: 0.55, ly: 1.5, lz: 0.5, rx: 0.55, ry: 1.5, rz: 0.5, nod: 0.55, lean: -0.14 }],
      [1, {}],
    ],
  ),
  // (sat on the floor, legs out, leaning back on his hands, looking up at it all)
  floor: clip(
    'floor',
    'loop',
    3600,
    { air: 1, hip: -2.6, lean: -0.55, flu: -0.05, flf: 2.3, fru: 0.05, frf: 2.05, wide: 0.4, nod: 0.45, lx: 0.5, ly: -1.15, lz: -0.85, rx: 0.5, ry: -1.15, rz: -0.85 },
    [
      [0, {}],
      [0.5, { lean: -0.6, nod: 0.5 }],
      [1, {}],
    ],
  ),
};

/**
 * What his arms and head can do over whatever his legs are doing (a gesture): flex after a dunk, point to
 * the sky, pump a fist, slap a teammate's hand, raise a hand for the foul or ask what that was for, clap,
 * wag a finger after a block, hands to his head. Each is timed from its start (ms); only the arm and head
 * channels are read, laid over his pose (see Puppet.cue).
 */
export type Gesture =
  'flex' | 'roar' | 'point' | 'fist' | 'five' | 'handUp' | 'protest' | 'clap' | 'wag' | 'head' | 'wipe' | 'tug' | 'call' | 'ask' | 'talk' | 'direct' | SidelineGesture;
/** The gestures of the people round the floor (sideline.ts): a referee's signals, a coach's. */
export type SidelineGesture =
  | 'refFoul'
  | 'refThree'
  | 'refGood'
  | 'refPointL'
  | 'refPointR'
  | 'refTimeout'
  | 'refCount'
  | 'refToss'
  | 'refTwo'
  | 'refHand'
  | 'refBounce'
  | 'coachBoard'
  | 'coachShout'
  | 'coachPoint'
  | 'coachWide'
  | 'coachCrouch'
  | 'coachWave'
  | 'coachCalm'
  | 'shake'
  | 'dap';

/** A gesture's keys, from REST: the channels it moves. */
const gesture = (keys: [number, PoseKey][]): Clip => clip('celebrate', 'shot', 0, {}, keys);
export const GESTURES: Record<Gesture, Clip> = {
  // (both arms up and bent, fists by his ears, chest out)
  flex: gesture([
    [0, {}],
    [220, { lx: 1.0, ly: 0.2, lz: 0.05, rx: 1.0, ry: 0.2, rz: 0.05, lean: -0.06, nod: 0.25, lsw: -0.5, rsw: -0.5 }],
    [420, { lx: 0.85, ly: 0.32, lz: 0.0, rx: 0.85, ry: 0.32, rz: 0.0, lean: -0.1, nod: 0.3, lsw: -0.6, rsw: -0.6 }],
    [1050, { lx: 0.9, ly: 0.28, lz: 0.02, rx: 0.9, ry: 0.28, rz: 0.02, lean: -0.08, nod: 0.25, lsw: -0.55, rsw: -0.55 }],
    [1350, {}],
  ]),
  // (arms down and out, fists clenched, chest forward: a scream at the floor)
  roar: gesture([
    [0, {}],
    [200, { lx: 0.75, ly: -1.25, lz: 0.45, rx: 0.75, ry: -1.25, rz: 0.45, lean: 0.24, nod: 0.2 }],
    [900, { lx: 0.8, ly: -1.2, lz: 0.5, rx: 0.8, ry: -1.2, rz: 0.5, lean: 0.28, nod: 0.25 }],
    [1200, {}],
  ]),
  // (his right arm up at the sky and held)
  point: gesture([
    [0, {}],
    [240, { rx: 0.25, ry: 1.6, rz: 1.05, nod: 0.25, twist: -0.06 }],
    [950, { rx: 0.25, ry: 1.65, rz: 1.0, nod: 0.3, twist: -0.06 }],
    [1250, {}],
  ]),
  // (a fist pumped down, twice)
  fist: gesture([
    [0, {}],
    [170, { rx: 0.45, ry: 0.75, rz: 0.35, lean: -0.05, nod: 0.2 }],
    [320, { rx: 0.3, ry: -0.75, rz: 0.95, lean: 0.2, nod: 0.1 }],
    [470, { rx: 0.45, ry: 0.6, rz: 0.4, lean: 0 }],
    [620, { rx: 0.3, ry: -0.75, rz: 0.95, lean: 0.22, nod: 0.15 }],
    [900, {}],
  ]),
  // (his right hand up to a teammate's: where it meets his is the scene's point, see Puppet.arms)
  five: gesture([
    [0, {}],
    [280, { rx: 0.25, ry: 1.55, rz: 0.75 }],
    [420, { rx: 0.2, ry: 1.3, rz: 0.95 }],
    [750, {}],
  ]),
  // (the foul is his: one arm straight up, head down)
  handUp: gesture([
    [0, {}],
    [240, { rx: 0.12, ry: 2.05, rz: 0.3, nod: -0.25 }],
    [1150, { rx: 0.12, ry: 2.05, rz: 0.3, nod: -0.3 }],
    [1450, {}],
  ]),
  // (both arms out, palms up, a shake of the head: what was that?)
  protest: gesture([
    [0, {}],
    [260, { lx: 0.75, ly: -0.85, lz: 0.85, rx: 0.75, ry: -0.85, rz: 0.85, lean: -0.05, turn: 0.22 }],
    [520, { lx: 0.85, ly: -0.7, lz: 0.85, rx: 0.85, ry: -0.7, rz: 0.85, lean: -0.08, turn: -0.22 }],
    [780, { lx: 0.8, ly: -0.75, lz: 0.85, rx: 0.8, ry: -0.75, rz: 0.85, lean: -0.06, turn: 0.18 }],
    [1050, { lx: 0.75, ly: -0.8, lz: 0.8, rx: 0.75, ry: -0.8, rz: 0.8, turn: -0.1 }],
    [1350, {}],
  ]),
  // (four claps at his chest)
  clap: gesture([
    [0, {}],
    [160, { lx: -0.25, ly: -0.6, lz: 0.95, rx: -0.25, ry: -0.6, rz: 0.95 }],
    [260, { lx: -0.62, ly: -0.55, lz: 1.05, rx: -0.62, ry: -0.55, rz: 1.05 }],
    [360, { lx: -0.25, ly: -0.6, lz: 0.95, rx: -0.25, ry: -0.6, rz: 0.95 }],
    [460, { lx: -0.62, ly: -0.55, lz: 1.05, rx: -0.62, ry: -0.55, rz: 1.05 }],
    [560, { lx: -0.25, ly: -0.6, lz: 0.95, rx: -0.25, ry: -0.6, rz: 0.95 }],
    [660, { lx: -0.62, ly: -0.55, lz: 1.05, rx: -0.62, ry: -0.55, rz: 1.05 }],
    [760, { lx: -0.25, ly: -0.6, lz: 0.95, rx: -0.25, ry: -0.6, rz: 0.95 }],
    [860, { lx: -0.62, ly: -0.55, lz: 1.05, rx: -0.62, ry: -0.55, rz: 1.05 }],
    [1100, {}],
  ]),
  // (a finger wagged at head height: not in here)
  wag: gesture([
    [0, {}],
    [200, { rx: 0.05, ry: 0.85, rz: 1.3, turn: 0.15 }],
    [360, { rx: 0.4, ry: 0.85, rz: 1.25, turn: -0.15 }],
    [520, { rx: 0.05, ry: 0.85, rz: 1.3, turn: 0.15 }],
    [680, { rx: 0.4, ry: 0.85, rz: 1.25, turn: -0.15 }],
    [840, { rx: 0.15, ry: 0.8, rz: 1.25, turn: 0.05 }],
    [1100, {}],
  ]),
  // (both hands to the top of his head)
  head: gesture([
    [0, {}],
    [280, { lx: -0.25, ly: 1.05, lz: 0.2, rx: -0.25, ry: 1.05, rz: 0.2, nod: 0.2 }],
    [1100, { lx: -0.25, ly: 1.08, lz: 0.15, rx: -0.25, ry: 1.08, rz: 0.15, nod: 0.3 }],
    [1400, {}],
  ]),
  // (what a man does with a dead ball, unasked: see Puppet.life)
  // (a forearm across his brow)
  wipe: gesture([
    [0, {}],
    [320, { rx: -0.45, ry: 0.95, rz: 0.55, nod: -0.22, rsw: -0.5 }],
    [620, { rx: -0.75, ry: 1.02, rz: 0.5, nod: -0.26, turn: -0.12, rsw: -0.5 }],
    [900, { rx: -0.3, ry: 0.8, rz: 0.55, nod: -0.15, rsw: -0.4 }],
    [1250, {}],
  ]),
  // (a pull at the hem of his shorts, both hands, bent a little)
  tug: gesture([
    [0, {}],
    [300, { lx: 0.12, ly: -2.15, lz: 0.35, rx: 0.12, ry: -2.15, rz: 0.35, lean: 0.16, nod: -0.25 }],
    [520, { lx: 0.14, ly: -2.28, lz: 0.32, rx: 0.14, ry: -2.28, rz: 0.32, lean: 0.2, nod: -0.3 }],
    [760, { lx: 0.12, ly: -2.12, lz: 0.35, rx: 0.12, ry: -2.12, rz: 0.35, lean: 0.14, nod: -0.2 }],
    [1100, {}],
  ]),
  // (a defender talking: an arm out at the man or the screen he's calling, twice)
  call: gesture([
    [0, {}],
    [220, { lx: 0.55, ly: -0.25, lz: 1.45, turn: 0.2, twist: 0.08 }],
    [420, { lx: 0.6, ly: -0.4, lz: 1.25, turn: 0.22 }],
    [600, { lx: 0.55, ly: -0.2, lz: 1.5, turn: 0.2, twist: 0.08 }],
    [900, { lx: 0.6, ly: -0.35, lz: 1.3, turn: 0.12 }],
    [1150, {}],
  ]),
  // (an open man asking for it: a hand up, shown to the ball)
  ask: gesture([
    [0, {}],
    [240, { rx: 0.3, ry: 1.15, rz: 0.85 }],
    [800, { rx: 0.32, ry: 1.25, rz: 0.8 }],
    [1050, {}],
  ]),
  // (talking on the way back up the floor: a hand turned out toward a teammate, his head with it, twice)
  talk: gesture([
    [0, {}],
    [260, { lx: 0.7, ly: -0.9, lz: 0.75, turn: 0.45, twist: 0.1 }],
    [520, { lx: 0.8, ly: -1.05, lz: 0.6, turn: 0.5 }],
    [760, { lx: 0.7, ly: -0.8, lz: 0.85, turn: 0.42, twist: 0.1 }],
    [1100, { lx: 0.6, ly: -1.3, lz: 0.5, turn: 0.2 }],
    [1400, {}],
  ]),
  // (pointing a teammate to where he should be: an arm out at the floor ahead, held)
  direct: gesture([
    [0, {}],
    [230, { rx: 0.5, ry: -0.15, rz: 1.7, turn: -0.3, twist: -0.1 }],
    [800, { rx: 0.55, ry: -0.2, rz: 1.65, turn: -0.32, twist: -0.1 }],
    [1100, {}],
  ]),
  // --- the sideline's gestures (a referee's signals, a coach's) go below this line ---
  // ---- the people round the floor (sideline.ts): a referee's signals, then a coach's ----
  // (a foul: his fist straight up, and held)
  refFoul: gesture([
    [0, {}],
    [200, { rx: 0.14, ry: 2.08, rz: 0.22, nod: 0.05 }],
    [1050, { rx: 0.14, ry: 2.08, rz: 0.2, nod: 0.05 }],
    [1350, {}],
  ]),
  // (a three is up: one arm raised, out to its side)
  refThree: gesture([
    [0, {}],
    [220, { lx: 0.62, ly: 1.92, lz: 0.4 }],
    [1300, { lx: 0.62, ly: 1.92, lz: 0.4 }],
    [1600, {}],
  ]),
  // (and it's good: both arms straight up)
  refGood: gesture([
    [0, {}],
    [200, { lx: 0.3, ly: 2.06, lz: 0.25, rx: 0.3, ry: 2.06, rz: 0.25 }],
    [950, { lx: 0.3, ly: 2.06, lz: 0.25, rx: 0.3, ry: 2.06, rz: 0.25 }],
    [1250, {}],
  ]),
  // (whose ball it is: an arm straight out along the floor, to his left or his right, his head with it)
  refPointL: gesture([
    [0, {}],
    [220, { lx: 2.08, ly: 0.02, lz: 0.2, turn: 0.5, twist: 0.12 }],
    [1050, { lx: 2.08, ly: 0.02, lz: 0.2, turn: 0.5, twist: 0.12 }],
    [1350, {}],
  ]),
  refPointR: gesture([
    [0, {}],
    [220, { rx: 2.08, ry: 0.02, rz: 0.2, turn: -0.5, twist: -0.12 }],
    [1050, { rx: 2.08, ry: 0.02, rz: 0.2, turn: -0.5, twist: -0.12 }],
    [1350, {}],
  ]),
  // (a timeout: one hand flat over the fingertips of the other, a T at his chest)
  refTimeout: gesture([
    [0, {}],
    [240, { lx: -0.55, ly: 0.2, lz: 0.85, rx: -0.6, ry: -0.3, rz: 0.9, lsw: -0.7 }],
    [1250, { lx: -0.55, ly: 0.2, lz: 0.85, rx: -0.6, ry: -0.3, rz: 0.9, lsw: -0.7 }],
    [1550, {}],
  ]),
  // (the count, a team in its backcourt or a man with the ball out of bounds: his arm swept across at his waist, twice)
  refCount: gesture([
    [0, {}],
    [180, { rx: 1.0, ry: -0.75, rz: 1.0 }],
    [400, { rx: 0.0, ry: -0.7, rz: 1.25 }],
    [620, { rx: 1.0, ry: -0.75, rz: 1.0 }],
    [840, { rx: 0.0, ry: -0.7, rz: 1.25 }],
    [1100, {}],
  ]),
  // (the tip: the ball up from his waist and out of both hands overhead)
  refToss: gesture([
    [0, {}],
    [200, { lx: 0.05, ly: -1.1, lz: 0.9, rx: 0.05, ry: -1.1, rz: 0.9, lean: 0.1 }],
    [420, { lx: 0.08, ly: 1.9, lz: 0.75, rx: 0.08, ry: 1.9, rz: 0.75, lean: -0.05, nod: 0.3 }],
    [700, { lx: 0.2, ly: 1.5, lz: 0.6, rx: 0.2, ry: 1.5, rz: 0.6, nod: 0.3 }],
    [1050, {}],
  ]),
  // (two shots: his arm up in front of him, two fingers)
  refTwo: gesture([
    [0, {}],
    [220, { rx: 0.35, ry: 1.72, rz: 0.75 }],
    [1000, { rx: 0.35, ry: 1.72, rz: 0.75 }],
    [1300, {}],
  ]),
  // (handing the ball over: an arm out in front of him at his waist, palm up)
  refHand: gesture([
    [0, {}],
    [260, { rx: 0.25, ry: -0.9, rz: 1.75, lean: 0.1 }],
    [700, { rx: 0.25, ry: -0.9, rz: 1.75, lean: 0.1 }],
    [1000, {}],
  ]),
  // (a bounce pass to the man at the line: both hands from his chest, pushed out and down)
  refBounce: gesture([
    [0, {}],
    [170, { lx: -0.2, ly: -0.55, lz: 0.85, rx: -0.2, ry: -0.55, rz: 0.85 }],
    [360, { lx: -0.05, ly: -1.05, lz: 1.7, rx: -0.05, ry: -1.05, rz: 1.7, lean: 0.16 }],
    [620, { lx: 0.0, ly: -1.0, lz: 1.5, rx: 0.0, ry: -1.0, rz: 1.5, lean: 0.1 }],
    [900, {}],
  ]),
  // (the huddle: his board held up in front of him in his left hand, the other drawing on it, his head down to it)
  coachBoard: gesture([
    [0, {}],
    [260, { lx: -0.3, ly: -0.5, lz: 1.0, rx: -0.4, ry: -0.5, rz: 1.05, nod: -0.3, lean: 0.1 }],
    [520, { lx: -0.3, ly: -0.5, lz: 1.0, rx: -0.2, ry: -0.7, rz: 1.1, nod: -0.32, lean: 0.12 }],
    [780, { lx: -0.3, ly: -0.5, lz: 1.0, rx: -0.5, ry: -0.6, rz: 1.05, nod: -0.3, lean: 0.12 }],
    [1050, { lx: -0.3, ly: -0.5, lz: 1.0, rx: -0.25, ry: -0.45, rz: 1.1, nod: -0.28, lean: 0.1 }],
    [1400, {}],
  ]),
  // (a coach calls out: his hands cupped round his mouth, leaning into it)
  coachShout: gesture([
    [0, {}],
    [240, { lx: -0.42, ly: 0.52, lz: 0.6, rx: -0.42, ry: 0.52, rz: 0.6, lean: 0.14, nod: 0.12, lsw: -0.5, rsw: -0.5 }],
    [1250, { lx: -0.42, ly: 0.55, lz: 0.6, rx: -0.42, ry: 0.55, rz: 0.6, lean: 0.17, nod: 0.12, lsw: -0.5, rsw: -0.5 }],
    [1550, {}],
  ]),
  // (points a man to his place: his arm out in front of him, jabbed twice)
  coachPoint: gesture([
    [0, {}],
    [220, { rx: 0.2, ry: 0.15, rz: 2.0, lean: 0.08 }],
    [420, { rx: 0.25, ry: 0.0, rz: 1.6, lean: 0.05 }],
    [600, { rx: 0.2, ry: 0.15, rz: 2.05, lean: 0.1 }],
    [1050, { rx: 0.2, ry: 0.12, rz: 2.0, lean: 0.08 }],
    [1350, {}],
  ]),
  // (what was that: both arms out wide, palms up, held)
  coachWide: gesture([
    [0, {}],
    [260, { lx: 1.75, ly: -0.25, lz: 0.6, rx: 1.75, ry: -0.25, rz: 0.6, lean: -0.08, nod: 0.12 }],
    [1300, { lx: 1.8, ly: -0.2, lz: 0.55, rx: 1.8, ry: -0.2, rz: 0.55, lean: -0.1, nod: 0.15 }],
    [1650, {}],
  ]),
  // (down in a crouch at the sideline, his hands together in front of his knees: worn over a defender's stance, and asked for again while he stays down)
  coachCrouch: gesture([
    [0, {}],
    [320, { lx: -0.2, ly: -1.55, lz: 1.05, rx: -0.2, ry: -1.55, rz: 1.05, lean: 0.2 }],
    [3600, { lx: -0.2, ly: -1.55, lz: 1.05, rx: -0.2, ry: -1.55, rz: 1.05, lean: 0.2 }],
    [3950, {}],
  ]),
  // (get up the floor: an arm swung round and forward, twice)
  coachWave: gesture([
    [0, {}],
    [200, { rx: 0.5, ry: 0.9, rz: 0.6 }],
    [380, { rx: 0.35, ry: 0.2, rz: 1.75 }],
    [580, { rx: 0.5, ry: 0.9, rz: 0.6 }],
    [760, { rx: 0.35, ry: 0.2, rz: 1.75 }],
    [1050, {}],
  ]),
  // (settle down: both palms pressed down in front of him, twice)
  coachCalm: gesture([
    [0, {}],
    [220, { lx: 0.35, ly: -0.55, lz: 1.2, rx: 0.35, ry: -0.55, rz: 1.2 }],
    [440, { lx: 0.35, ly: -1.05, lz: 1.2, rx: 0.35, ry: -1.05, rz: 1.2 }],
    [660, { lx: 0.35, ly: -0.6, lz: 1.2, rx: 0.35, ry: -0.6, rz: 1.2 }],
    [880, { lx: 0.35, ly: -1.05, lz: 1.2, rx: 0.35, ry: -1.05, rz: 1.2 }],
    [1150, {}],
  ]),
  // (a handshake with the man facing him: his right hand out across to the middle, at the waist, shaken twice)
  shake: gesture([
    [0, {}],
    [320, { rx: -0.42, ry: -0.95, rz: 1.25, nod: -0.08, lean: 0.06 }],
    [480, { rx: -0.42, ry: -0.78, rz: 1.25, nod: -0.08, lean: 0.06 }],
    [640, { rx: -0.42, ry: -0.98, rz: 1.25, nod: -0.06, lean: 0.06 }],
    [800, { rx: -0.42, ry: -0.82, rz: 1.25, nod: -0.06, lean: 0.06 }],
    [1050, { rx: -0.4, ry: -0.92, rz: 1.2 }],
    [1350, {}],
  ]),
  // (a dap: hands clasped at the chest, pulled in, the other arm round his back a moment)
  dap: gesture([
    [0, {}],
    [260, { rx: -0.45, ry: -0.35, rz: 1.15, lean: 0.04 }],
    [520, { rx: -0.5, ry: -0.3, rz: 0.75, lx: -0.25, ly: -0.25, lz: 0.95, lean: 0.12, nod: -0.15 }],
    [900, { rx: -0.5, ry: -0.32, rz: 0.72, lx: -0.28, ly: -0.22, lz: 0.98, lean: 0.12, nod: -0.15 }],
    [1250, {}],
  ]),
};
/** The arm channels a gesture takes over, and the trunk ones it adds to. */
export const ARMS = [I.lx, I.ly, I.lz, I.rx, I.ry, I.rz, I.lsw, I.rsw];
export const TRUNK = [I.lean, I.twist, I.tilt, I.nod, I.turn];
/**
 * A held follow-through after a jumper or a free throw, on the shot's own line: where each hand is from the middle of
 * his chest (ft: out to that hand's side of the line to the rim, up from his shoulders, on toward the rim). Not from
 * his shoulders as his chest has them: a shooter turns as he goes up (the captured one by most of a quarter turn), and
 * hands held off a chest turned that far followed through at the stands, the guide arm flung out to the side like a
 * man with his hands up. The shooting arm goes up after the ball over his shooting eye; the guide hand stays where
 * the ball left it, beside the line and by his brow. `lsw`, `rsw`: the elbows swung round their arms (radians: the
 * guide elbow down under its hand and in, the shooting elbow in under its own).
 */
export const FOLLOW = { r: [0.35, 1.82, 1.3], l: [0.5, 0.8, 0.88], lsw: -0.75, rsw: 0.08 } as const;
/** A pass's follow-through: the arms on after the ball, toward where it went (two hands from his chest, one, or over his head). */
export const PASS_FOLLOW: Partial<Record<ClipId, PoseKey>> = {
  pass: { lx: 0.12, ly: -0.5, lz: 1.85, rx: 0.12, ry: -0.5, rz: 1.85 },
  passOne: { rx: 0.15, ry: -0.6, rz: 1.85 },
  passOver: { lx: 0.16, ly: 0.75, lz: 1.92, rx: 0.16, ry: 0.75, rz: 1.92 },
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

/** An angle the short way round: within a half turn either way. */
export const wrapped = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** The captured clips (mocap.gen.ts), if they were measured on these channels. */
const CAPTURED: Partial<Record<ClipId, Clip>> = {};
if (MOCAP_CHANNELS.length === N && MOCAP_CHANNELS.every((c, i) => c === CHANNELS[i]))
  for (const [id, m] of Object.entries(MOCAP)) {
    const poses = m.poses.map((p) => Float32Array.from(p));
    // (an elbow's swing round its arm is an angle: measured, it may come round past a half turn from one key to the
    // next, and read straight between them it would spin the elbow all the way round. It is made to go the short way)
    for (const ch of [I.lsw, I.rsw]) for (let k = 1; k < poses.length; k++) poses[k][ch] = poses[k - 1][ch] + wrapped(poses[k][ch] - poses[k - 1][ch]);
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

/** The passes: from his chest (twice as often), pushed with one hand, thrown from over his head. All leave his hands at 0. */
export const PASSES: readonly ClipId[] = ['pass', 'pass', 'passOne', 'passOver'];

/**
 * The dunks: a two-hander, a one-hander, one that hangs on the rim, a two-hander taken back behind his head first, a
 * one-hander brought over from out wide, a windmill, and a reverse (the one a dunk the play-by-play calls a reverse is). All meet the rim at DUNK_AT. `isDunk` is the one test of it: whatever the
 * rest of him does about a dunk (the ball, the rim, the net, his hands) it does for all of them.
 */
export const DUNKS: readonly ClipId[] = ['dunk', 'dunk1', 'dunkHang', 'dunkBack', 'dunkSide', 'dunkMill', 'dunkRev'];
export const isDunk = (id: ClipId | undefined): boolean => id !== undefined && DUNKS.includes(id);
/** The plain ones, for a dunk that has no time for more: a lob taken in the air, one jammed off the iron or sent back. With two hands, and with one. */
export const DUNKS_PLAIN: readonly [ClipId, ClipId] = ['dunk', 'dunk1'];
/** The two-handers that come straight down (a dunk the play-by-play calls two-handed is one of these). */
export const DUNKS_TWO: readonly ClipId[] = ['dunk', 'dunkBack', 'dunkRev'];

/**
 * A dribbler's moves on the man in front of him, each played once through over his dribble: a crossover, between his
 * legs, behind his back and a spin (the ones that leave the ball in his other hand: SWITCHES), a hesitation, an
 * in-and-out, a snatch back. `isMove` is the one
 * test of it: the ball, his hands and his feet treat every one of them as they do a crossover, but for the hand it
 * ends in.
 */
export const MOVES: readonly ClipId[] = ['crossover', 'hesi', 'inOut', 'pullBack', 'btl', 'behind', 'spin'];
export const isMove = (id: ClipId | undefined): boolean => id !== undefined && MOVES.includes(id);
export const SWITCHES: ReadonlySet<ClipId> = new Set(['crossover', 'btl', 'behind', 'spin']);
/**
 * The ways the ball goes to his other hand, as often as each is made (a name's count in the list): stood over it or
 * walking it up, and at the start of a drive. In front of him most often; between his legs; behind his back and a spin
 * only for a man with the handle for them (FANCY, see Puppet.across), and a spin only on the move.
 */
export const SWITCH_STILL: readonly ClipId[] = ['crossover', 'crossover', 'crossover', 'btl', 'btl', 'behind'];
export const SWITCH_DRIVE: readonly ClipId[] = ['crossover', 'crossover', 'crossover', 'crossover', 'btl', 'behind', 'spin'];
export const FANCY: ReadonlySet<ClipId> = new Set(['behind', 'spin']);
/** The moves that keep the ball in the hand it is in: what a man pressed on its other side makes (never across into him). */
export const MOVES_SAME: readonly ClipId[] = ['hesi', 'inOut', 'pullBack'];

/** Whether a clip is captured motion (a take's, or a keyed jump on a take's body). */
export const captured = (id: ClipId): boolean => id in CAPTURED || ((id === 'rebound' || id === 'block' || id === 'contest') && !!CAPTURED.jump);

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

/** A hanging dunk's hands stay on the ring from the slam until this long after the shot leaves the plan (ms): then he lets go and drops. */
export const HANG_UNTIL = 560;

/** One bounce of a dribble in a clip's own time: the hand lets it go at `off`, it is on the floor at `low`, a hand has it again at `on` (the other hand: `cross`). */
export interface Bounce {
  off: number;
  low: number;
  on: number;
  cross: boolean;
}
const BOUNCES = new WeakMap<Clip, Bounce[]>();
/** The bounces in a clip with the ball in it, in order: found where no hand is on it. */
export function bounces(c: Clip): Bounce[] {
  let out = BOUNCES.get(c);
  if (out) return out;
  out = [];
  const [from, to] = c.kind === 'shot' ? span(c) : [0, 1];
  const step = (to - from) / 400;
  const P = new Float32Array(N);
  let cur: Bounce | null = null;
  let lowest = 9;
  let left = false;
  for (let i = 0; i <= 400; i++) {
    const t = from + i * step;
    sample(c, t, P);
    const held = Math.max(P[I.gl], P[I.gr]) >= 0.5;
    if (!held && !cur && i > 0) {
      cur = { off: t, low: t, on: t, cross: false };
      lowest = 9;
    }
    if (!held && cur && P[I.by] < lowest) {
      lowest = P[I.by];
      cur.low = t;
    }
    if (held && cur) {
      cur.on = t;
      cur.cross = P[I.gl] > P[I.gr] !== left;
      out.push(cur);
      cur = null;
    }
    if (held) left = P[I.gl] > P[I.gr];
  }
  BOUNCES.set(c, out);
  return out;
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

/** The channels a jump off two feet gives a keyed move: his hips, his trunk and his legs. His arms stay the move's own. */
const LEAPT = [I.lean, I.tilt, I.proll] as const;
const HANG = [I.flu, I.fru] as const;
/** The play's time runs at half the body's (CourtView's COURT3D_PACE): a captured ms is this many of a clip's. */
const PLAY = 0.5;

/**
 * A keyed jump (a rebound, a block, a contest) on a captured one's body: the crouch, the leap and the landing
 * are the take's, its top at `apex` (the clip's ms) and `peak` ft high; a higher jump than the take's hangs
 * longer, as a real one does (by the root of its height). The arms, the ball and the lean the move adds stay keyed.
 */
function leapt(c: Clip, jump: Clip | undefined, apex: number, peak: number): Clip {
  if (!jump) return c;
  const rest = Float32Array.from(jump.poses[0]);
  const top = sample(jump, 0, new Float32Array(N))[I.hip] - rest[I.hip];
  const slow = PLAY * Math.sqrt(peak / top);
  const [from, to] = span(c);
  // (the whole landing is played, however short the keyed move was)
  const end = Math.max(to, apex + span(jump)[1] * slow);
  const at: number[] = [];
  const poses: Float32Array[] = [];
  const K = new Float32Array(N);
  const Jp = new Float32Array(N);
  for (let t = from; t < end + 16; t += 16) {
    const ms = Math.min(end, t);
    sample(c, ms, K);
    sample(jump, (ms - apex) / slow, Jp);
    const P = Float32Array.from(K);
    const up = Jp[I.hip] - rest[I.hip];
    // (as deep a crouch as the keyed move's own before he goes up; the take's coming down)
    P[I.hip] = up > 0 ? (up * peak) / top : ms < apex ? Math.min(K[I.hip], up) : up * 0.8;
    // (the take is a jump ahead: this one goes straight up, so his trunk swings less and his feet hang under him)
    for (const k of LEAPT) P[k] = K[k] + (Jp[k] - rest[k]) * 0.6;
    for (const k of HANG) P[k] = Jp[k] * Math.sqrt(peak / top);
    P[I.air] = Jp[I.air];
    at.push(ms);
    poses.push(P);
  }
  return { ...c, at, poses, dense: true, fn: undefined };
}

/** Every clip: captured where a take covers the move, keyed by hand where none does (a dunk, a block, a celebration). */
export const CLIPS: Record<ClipId, Clip> = {
  ...KEYED,
  idle2: KEYED.idle,
  idle3: KEYED.idle,
  jog: KEYED.run,
  closeout: KEYED.ready,
  start: KEYED.run,
  dribbleWalk: KEYED.dribble,
  dribbleBack: KEYED.dribble,
  jump: KEYED.contest,
  ...CAPTURED,
};
/** Clip `a` until `at` (ms), then `b`, eased from one to the other over `over` ms: a take with a keyed ending. */
function spliced(a: Clip, b: Clip, at: number, over: number): Clip {
  const from = span(a)[0];
  const to = span(b)[1];
  const ats: number[] = [];
  const poses: Float32Array[] = [];
  const Q = new Float32Array(N);
  for (let t = from; t < to + 16; t += 16) {
    const ms = Math.min(to, t);
    const P = sample(a, ms, new Float32Array(N));
    const w = Math.max(0, Math.min(1, (ms - at) / over));
    if (w > 0) {
      sample(b, ms, Q);
      const e = w * w * (3 - 2 * w);
      for (let i = 0; i < N; i++) P[i] += (Q[i] - P[i]) * e;
    }
    ats.push(ms);
    poses.push(P);
  }
  return { ...a, at: ats, poses, dense: true, fn: undefined };
}
/**
 * A keyed leap's way up made a thrown thing's: from where his feet leave the floor to its top he rises fast and
 * slows (and, `down`, falls the same way from its top to the floor). The top, and when, are the keys' own.
 */
function arc(c: Clip, down: boolean): Clip {
  const [from, to] = span(c);
  const at: number[] = [];
  const poses: Float32Array[] = [];
  for (let t = from; t < to + 16; t += 16) {
    at.push(Math.min(to, t));
    poses.push(sample(c, Math.min(to, t), new Float32Array(N)));
  }
  const hips = poses.map((p) => p[I.hip]);
  const top = hips.indexOf(Math.max(...hips));
  let off = top;
  while (off > 0 && poses[off][I.air] > 0.5) off--;
  let on = top;
  while (on < poses.length - 1 && poses[on][I.air] > 0.5) on++;
  for (let i = off; i < top; i++) hips[i] = hips[off] + (hips[top] - hips[off]) * (1 - ((top - i) / (top - off)) ** 2);
  if (down) for (let i = top + 1; i < on; i++) hips[i] = hips[on] + (hips[top] - hips[on]) * (1 - ((i - top) / (on - top)) ** 2);
  poses.forEach((p, i) => (p[I.hip] = hips[i]));
  return { ...c, at, poses, dense: true, fn: undefined };
}
// (the man in the take pulled up hard, ducking and looking away: a ballplayer's stop is half of that)
if (CAPTURED.stop) for (const p of CAPTURED.stop.poses) for (const k of [I.hip, I.lean, I.turn, I.nod, I.tilt]) p[k] = REST_POSE[k] + (p[k] - REST_POSE[k]) * 0.5;
// (where he looks is the game's, not the take's)
for (const c of [CAPTURED.stop, CAPTURED.closeout, CAPTURED.start]) for (const p of c?.poses ?? []) p[I.turn] = p[I.nod] = 0;
// (closing out he comes with a hand up at the shooter, and brings it down into his stance)
if (CAPTURED.closeout) {
  const c = CAPTURED.closeout;
  const end = span(c)[1];
  // (and the take's other arm, swung back as he stopped, comes forward into his stance: both hands are a
  // defender's by the end, the stance he goes on in, not flung there after it)
  const ready = KEYED.ready.poses[0];
  c.poses.forEach((p, k) => {
    const u = c.at[k] / end;
    const w = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.85;
    p[I.rx] += (0.2 - p[I.rx]) * w;
    p[I.ry] += (1.25 - p[I.ry]) * w;
    p[I.rz] += (0.95 - p[I.rz]) * w;
    const set = (x: number) => x * x * (3 - 2 * x);
    const a = set(Math.max(0, Math.min(1, (u - 0.3) / 0.6)));
    const b = set(Math.max(0, Math.min(1, (u - 0.75) / 0.25)));
    for (const ch of [I.lx, I.ly, I.lz]) p[ch] += (ready[ch] - p[ch]) * a;
    for (const ch of [I.rx, I.ry, I.rz]) p[ch] += (ready[ch] - p[ch]) * b;
  });
}
// (the take's passer keeps his hands at his chest once it has gone: a ballplayer's go out after it, thumbs down, and drop)
if (CAPTURED.pass) CLIPS.pass = spliced(CAPTURED.pass, KEYED.pass, 0, 70);
CLIPS.floater = arc(KEYED.floater, true);
// (a dunker who lets go of the rim falls as he rose; one who hangs on it comes down when he lets go)
for (const id of DUNKS) CLIPS[id] = arc(KEYED[id as 'dunk'], id !== 'dunkHang');
// (and he lets go of it from rest: slowly at first, then all at once, as anything dropped)
{
  const c = CLIPS.dunkHang;
  const i0 = c.at.findIndex((t) => t >= HANG_UNTIL - 40);
  let on = i0;
  while (on < c.poses.length - 1 && c.poses[on][I.air] > 0.5) on++;
  const [h0, h1] = [c.poses[i0][I.hip], c.poses[on][I.hip]];
  for (let i = i0; i < on; i++) c.poses[i][I.hip] = h1 + (h0 - h1) * (1 - ((i - i0) / (on - i0)) ** 2);
}
CLIPS.rebound = leapt(KEYED.rebound, CAPTURED.jump, 0, 1.5);
// (the toss goes up eleven feet and more: the two biggest men on the floor go all the way up for it)
CLIPS.tip = leapt(KEYED.tip, CAPTURED.jump, 30, 2.6);
CLIPS.putback = arc(KEYED.putback, true);
CLIPS.hook = arc(KEYED.hook, true);
CLIPS.block = leapt(KEYED.block, CAPTURED.jump, 140, 1.7);
CLIPS.contest = leapt(KEYED.contest, CAPTURED.jump, 50, 0.8);
