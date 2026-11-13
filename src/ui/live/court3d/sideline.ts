// The people round the floor: three referees, the two head coaches, the benches, the scorer's table, and
// the ones who work the baselines (ball kids, photographers, security). All of them generic people (look.ts:
// a skin, a head of hair, maybe a beard, from a stable number; no likeness of anyone), women among them.
//
// Three bodies come from Blender (scripts/blender/people.py), each the player's own in other clothes, one
// skin on the puppet's bones: a player in his warm-up, a suit, a referee. Two kinds of people are made of them:
//   walkers   anyone who goes somewhere: the referees and the head coaches always; a man off the bench on
//             his way to the huddle, a man who has come off the floor on his way to his chair, a ball kid out
//             to wipe the floor. A player's puppet (walk, run, backpedal, stand, gestures) under another skin:
//             the bones are the ones figure.ts places, so whatever the players' body learns, these learn with it.
//   sitters   everyone who stays where he is: a body put in a pose once (the bones' places for a pose are
//             worked out here), and drawn many times over. What moves him is a blend from one pose to the
//             next in the vertex shader: he gets up through a lean and a push off his thighs, claps with arms
//             that move, raises a camera. Who wears what is a row of a small picture (the palette: a colour
//             for each part of him, or none where he doesn't have that part); a head turns to the ball and a
//             trunk breathes in the shader too.
// Each body comes twice (people.py): as built for a camera close by, and with a sixth of the triangles
// (benchFar, staffFar, officialFar). A sitter is drawn in the far one unless he is big in the picture, and
// only with the head of hair and the beard he wears (a cast is a body, two poses and a look: its corners
// are those parts' and no others'). The far body is also what the floor's mirror shows of anyone, what
// throws a walker's shadow, and the whole of a man off the bench on his way to the huddle.
// The referees work the play from where they never stand between the broadcast camera and the ball: the
// lead down the far side and behind the baseline, the slot along the far sideline, the trail behind the
// play. They signal what the plan says happened, and the ball goes through their hands as it does in a
// game: tossed up at the tip, taken at a whistle, bounced to the man at the line, handed to the man who
// puts it in. The coaches pace their boxes, call out, react, crouch late in a close game and take the
// huddle with a board in their hand; the benches lean in, get up for a big play (a few, each in his own time),
// slump when it goes wrong, and put a hand up to the man coming off the floor as he gets to them. At the end the
// kind of win shows (SceneProps.occasion): an ordinary one's bench stands and claps and the coaches meet to
// shake hands; a late winner's, a series' or a title's bench storms the floor to where its five are.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Camera,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Bone,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASKET, COURT_LEN, toWorld, type Act, type Pt } from '../choreo';
import { HALF_W, SIDE, type GameInfo, type Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import type { Occasion } from '../occasion';
import type { Gesture } from './clips';
import { Fig, type Geo } from './figure';
import { merged, type Thing } from './glb';
import { lookOf, STYLES, type Look } from './look';
import type { Props } from './props';
import { ANKLE, BALL_R, FARM, hash, HEAD, HIP, HIP_W, J, Puppet, SHIN, SHOULDER, THIGH, TORSO, UARM, type Body, type V3 } from './puppet';

type Keep = <T extends { dispose(): void }>(o: T) => T;

const MID = COURT_LEN / 2;
/** Where the scorer's table stands (arena.ts puts it there), and the benches' chairs behind the far sideline. */
const TABLE_Z = -(HALF_W + SIDE + 2.2);
const CHAIR_Z = TABLE_Z - 0.3;
/** A bench: this many chairs from this far along the floor, this far apart; the first ones are the assistants'. */
const CHAIRS = 10;
const CHAIR_X = 20;
const CHAIR_GAP = 2.5;
const AIDES = 2;
/** A man on his feet at his bench stands this far in front of his chair's middle: over his feet, where they were as he sat. */
const UP_OUT = 1.35;
/** The body as built (people.py, figure.py): its joints' heights, the floor under its feet, a chair's seat, how far behind the chair's middle his hips are. */
const KN_Y = HIP - THIGH;
const AN_Y = KN_Y - SHIN;
const FLOOR = AN_Y - ANKLE;
const SEAT = 1.5;
const SIT_BACK = 0.3;
/** Where the fingers' two joints are down the hand from the wrist, ft (figure.py's KNUCKLE and MIDDLE). */
const KNUCKLE = 0.4;
const MIDDLE = 0.545;
/** What a warm-up is darkened toward: the bench is not five more men in the play. */
const WARMUP = new Color('#26272c');

// ---------------------------------------------------------------- poses: where each bone is

type P3 = readonly [number, number, number];
/** A pose: the hips' middle, how far the trunk leans forward (radians), where each elbow and hand tries to be (his left, his right), and for a sitter his knees and ankles. */
interface Pose {
  hips: P3;
  lean: number;
  elbows: [P3, P3];
  hands: [P3, P3];
  knees?: [Vector3, Vector3];
  ankles?: [Vector3, Vector3];
  /** His head tipped forward, and turned to his left. */
  look?: number;
  turn?: number;
  toes?: number;
  /** Moved this far forward once posed (a sitter's hips go behind his chair's middle). */
  shift?: number;
  /** How far his fingers are closed (0 flat, 1 a fist): both hands, or his left and his right. */
  curl?: number | [number, number];
}

const v3 = (p: P3) => new Vector3(p[0], p[1], p[2]);
const mirrored = (p: P3): P3 => [-p[0], p[1], p[2]];
const both = (p: P3): [P3, P3] => [p, mirrored(p)];
const frame = (at: Vector3, x: Vector3, y: Vector3, z: Vector3) => new Matrix4().makeBasis(x, y, z).setPosition(at);
const turned = (at: Vector3, rot: Matrix4) => rot.clone().setPosition(at);
const toward = (a: Vector3, to: Vector3, length: number) => to.clone().sub(a).normalize().multiplyScalar(length).add(a);

/** The two bones of an arm or a leg through these joints, as figure.ts turns them (an elbow folds forward, a knee back). */
function limb(a: Vector3, mid: Vector3, end: Vector3, bend: number): [Matrix4, Matrix4] {
  const up = mid.clone().sub(a).normalize();
  const low = end.clone().sub(mid).normalize();
  const h = up.clone().cross(low).multiplyScalar(bend);
  if (h.length() > 0.06) h.normalize();
  else h.set(1, 0, 0);
  const one = (origin: Vector3, d: Vector3) => {
    const y = d.clone().negate();
    const x = h.clone().addScaledVector(y, -h.dot(y)).normalize();
    return frame(origin, x, y, x.clone().cross(y));
  };
  return [one(a, up), one(mid, low)];
}

/** Every bone's place for a pose (the body's own frame: x to his left, y up from where his ankles' floor is, z the way he faces). */
function bonesOf(p: Pose): Map<string, Matrix4> {
  const rot = new Matrix4().makeRotationX(p.lean);
  const hips = v3(p.hips);
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(rot);
  const chest = hips.clone().add(at(0, TORSO, 0));
  const out = new Map<string, Matrix4>();
  out.set('pelvis', turned(hips, new Matrix4().makeRotationX(p.lean * 0.35)));
  out.set('chest', turned(chest, rot));
  const head = new Matrix4().makeRotationY(p.turn ?? 0).multiply(new Matrix4().makeRotationX(p.lean * 0.3 + (p.look ?? 0)));
  out.set('head', turned(chest.clone().add(at(0, HEAD, 0)), head));
  out.set(
    'hem',
    out
      .get('pelvis')!
      .clone()
      .multiply(new Matrix4().makeTranslation(0, -0.03, 0)),
  );
  for (const [i, s, sfx] of [
    [0, 1, 'l'],
    [1, -1, 'r'],
  ] as const) {
    const sho = chest.clone().add(at(s * SHOULDER, -0.14, 0));
    const el = toward(sho, v3(p.elbows[i]), UARM);
    const ha = toward(el, v3(p.hands[i]), FARM);
    const [ua, fa] = limb(sho, el, ha, -1);
    out.set(`ua${sfx}`, ua);
    out.set(`fa${sfx}`, fa);
    const hand = fa.clone().setPosition(ha);
    out.set(`ha${sfx}`, hand);
    // his fingers, turned at the knuckles and at their middle joints as figure.ts turns a player's
    const c = typeof p.curl === 'number' ? p.curl : (p.curl?.[i] ?? 0.3);
    const k1 = hand
      .clone()
      .multiply(new Matrix4().makeTranslation(0, -KNUCKLE, 0))
      .multiply(new Matrix4().makeRotationZ(-s * (0.12 + 0.9 * c)));
    out.set(`kn1${sfx}`, k1);
    out.set(
      `kn2${sfx}`,
      k1
        .clone()
        .multiply(new Matrix4().makeTranslation(0, -(MIDDLE - KNUCKLE), 0))
        .multiply(new Matrix4().makeRotationZ(-s * (0.24 + 1.0 * c))),
    );
    const hip = hips.clone().add(new Vector3(s * HIP_W, 0, 0));
    const kn = toward(hip, p.knees?.[i] ?? hip.clone().add(new Vector3(0, -THIGH, 0)), THIGH);
    const an = toward(kn, p.ankles?.[i] ?? kn.clone().add(new Vector3(0, -SHIN, 0)), SHIN);
    const [th, sh] = limb(hip, kn, an, 1);
    out.set(`th${sfx}`, th);
    out.set(`sh${sfx}`, sh);
    out.set(`ft${sfx}`, turned(an, new Matrix4().makeRotationY(s * (p.toes ?? 0.2))));
    out.set(`hem${sfx.toUpperCase()}`, th.clone().multiply(new Matrix4().makeTranslation(0, -(THIGH - 0.7), 0)));
  }
  return out;
}

/** A pose on a seat `seat` high: the knees at this height and this far apart, the feet where the shins then reach the floor. */
function sitting(lean: number, kneeY: number, splay: number, elbows: [P3, P3], hands: [P3, P3], more: Partial<Pose> = {}, seat = SEAT): Pose {
  const hipY = FLOOR + seat + 0.4;
  const knees: Vector3[] = [];
  const ankles: Vector3[] = [];
  for (const s of [1, -1]) {
    const hip = new Vector3(s * HIP_W, hipY, 0);
    const dx = s * splay;
    const dy = kneeY - hipY;
    const kn = hip.clone().add(new Vector3(dx, dy, Math.sqrt(Math.max(0.01, THIGH * THIGH - dx * dx - dy * dy))));
    const ax = s * 0.06;
    const ay = AN_Y - kneeY;
    knees.push(kn);
    ankles.push(kn.clone().add(new Vector3(ax, ay, Math.sqrt(Math.max(0, SHIN * SHIN - ax * ax - ay * ay)))));
  }
  return { hips: [0, hipY, 0], lean, elbows, hands, knees: knees as [Vector3, Vector3], ankles: ankles as [Vector3, Vector3], toes: 0.25, shift: -SIT_BACK, ...more };
}

const standing = (lean: number, elbows: [P3, P3], hands: [P3, P3], more: Partial<Pose> = {}): Pose => ({ hips: [0, HIP, 0], lean, elbows, hands, toes: 0.16, ...more });
/** On his feet in front of his chair (a man off the bench): over where his feet were as he sat. */
const up = (lean: number, elbows: [P3, P3], hands: [P3, P3], more: Partial<Pose> = {}): Pose => standing(lean, elbows, hands, { shift: UP_OUT, ...more });

/** Half way up off a chair: his hips this high and this far forward, his feet where they were, his knees where that leaves them. */
function rising(hipY: number, hipZ: number, lean: number, elbows: [P3, P3], hands: [P3, P3], more: Partial<Pose> = {}): Pose {
  const knees: Vector3[] = [];
  const ankles: Vector3[] = [];
  for (const s of [1, -1]) {
    const hip = new Vector3(s * HIP_W, hipY, hipZ);
    const an = new Vector3(s * (HIP_W + 0.34), AN_Y, UP_OUT);
    const d = an.clone().sub(hip);
    const far = Math.min(d.length(), THIGH + SHIN - 0.02);
    const along = (THIGH * THIGH - SHIN * SHIN + far * far) / (2 * far);
    const off = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
    const dir = d.clone().normalize();
    // (a knee folds forward of the line from his hip to his ankle)
    const fwd = new Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
    knees.push(hip.clone().addScaledVector(dir, along).addScaledVector(fwd, off));
    ankles.push(an);
  }
  return { hips: [0, hipY, hipZ], lean, elbows, hands, knees: knees as [Vector3, Vector3], ankles: ankles as [Vector3, Vector3], toes: 0.22, ...more };
}

/** The poses, by name. A sitter's shoulders are about 3.6 ft up, a standing man's 5.2. */
const POSES: Record<string, Pose> = {
  // on a bench: forward on his knees, sat back, upright with his hands on his thighs, arms folded, chin on a fist
  lean: sitting(0.5, KN_Y, 0.3, both([0.68, 2.42, 1.1]), both([0.22, 1.95, 1.75]), { look: -0.3, curl: 0.5 }),
  back: sitting(-0.14, KN_Y - 0.13, 0.36, both([1.0, 2.62, 0.0]), both([0.66, 2.2, 1.0]), { look: 0.1 }),
  up: sitting(0.1, KN_Y - 0.06, 0.26, both([0.9, 2.7, 0.3]), both([0.46, 2.24, 1.3]), { curl: 0.2 }),
  arms: sitting(
    -0.04,
    KN_Y - 0.1,
    0.4,
    both([0.82, 2.72, 0.5]),
    [
      [-0.42, 3.02, 0.72],
      [0.42, 2.9, 0.76],
    ],
    { curl: 0.45 },
  ),
  chin: sitting(
    0.42,
    KN_Y,
    0.34,
    [
      [0.7, 2.4, 1.1],
      [-0.42, 2.3, 1.22],
    ],
    [
      [0.1, 2.0, 1.7],
      [-0.16, 3.42, 1.42],
    ],
    { look: -0.22, turn: -0.1, curl: [0.4, 0.95] },
  ),
  // a hand up, out to the man coming along the bench off the floor
  greet: sitting(
    0.16,
    KN_Y - 0.05,
    0.3,
    [
      [0.9, 2.7, 0.3],
      [-1.12, 3.95, 0.7],
    ],
    [
      [0.46, 2.24, 1.3],
      [-1.15, 5.0, 1.2],
    ],
    { look: -0.1, turn: -0.35, curl: [0.2, 0.05] },
  ),
  // it went wrong: bent over, his face in his hands
  slump: sitting(0.74, KN_Y, 0.34, both([0.56, 2.3, 1.36]), both([0.17, 3.42, 2.0]), { look: 0.25, curl: 0.15 }),
  // just off the floor: sat back getting his breath, a towel round his neck, his forearms on his thighs
  rest: sitting(0.3, KN_Y - 0.04, 0.42, both([0.8, 2.5, 0.8]), both([0.4, 2.0, 1.5]), { look: 0.12, curl: 0.4 }),
  // getting up: forward over his knees with his hands on them, then half way up, pushing off his thighs
  rise1: sitting(0.86, KN_Y, 0.34, both([0.72, 2.2, 1.25]), both([0.42, 1.92, 1.62]), { look: -0.55, curl: 0.25 }),
  rise2: rising(2.62, 0.62, 0.62, both([0.85, 3.1, 1.3]), both([0.5, 2.5, 1.55]), { look: -0.5, curl: 0.3 }),
  // on his feet: arms folded; his hands on his hips; both arms in the air (and pumped); clapping at his chest (his hands apart, and together); a towel going round over his head
  stand: up(
    -0.04,
    both([SHOULDER + 0.1, 4.16, 0.36]),
    [
      [-0.3, 4.34, 0.62],
      [0.3, 4.2, 0.66],
    ],
    { curl: 0.45 },
  ),
  hips: up(0.02, both([1.28, 4.22, -0.12]), both([0.56, 3.5, 0.12]), { look: -0.04, curl: 0.5 }),
  cheer: up(-0.1, both([1.25, 6.05, 0.2]), both([1.05, 7.4, 0.35]), { look: -0.12, curl: 0.95 }),
  cheer2: up(-0.02, both([1.3, 5.5, 0.45]), both([0.9, 6.5, 0.8]), { look: -0.05, curl: 0.95 }),
  clap: up(0.04, both([0.86, 4.3, 0.42]), both([0.07, 4.95, 1.12]), { curl: 0.05 }),
  clap2: up(0.02, both([1.0, 4.3, 0.36]), both([0.52, 4.9, 1.05]), { curl: 0.05 }),
  towel: up(
    -0.06,
    [
      [1.0, 4.25, 0.3],
      [-1.2, 6.05, 0.25],
    ],
    [
      [0.95, 5.05, 0.95],
      [-1.02, 7.35, 0.4],
    ],
    { look: -0.08, curl: 0.95 },
  ),
  towel2: up(
    -0.02,
    [
      [1.0, 4.25, 0.3],
      [-0.95, 6.15, 0.45],
    ],
    [
      [0.95, 5.05, 0.95],
      [-0.45, 7.4, 0.75],
    ],
    { look: -0.08, curl: 0.95 },
  ),
  // down on his haunches by the floor (a ball kid), his arms on his knees; on his feet; and out on the floor wiping it, a cloth under one hand
  low: sitting(0.34, KN_Y - 0.03, 0.34, both([0.72, 1.86, 0.95]), both([0.3, 1.78, 1.7]), { look: -0.24, shift: 0 }, 0.52),
  upright: standing(0.02, both([0.95, 4.1, 0.0]), both([0.75, 3.05, 0.25])),
  wipe: sitting(
    0.95,
    KN_Y - 0.03,
    0.4,
    [
      [0.75, 1.7, 1.0],
      [-0.6, 1.3, 1.6],
    ],
    [
      [0.35, 1.75, 1.75],
      [-0.75, 0.62, 2.3],
    ],
    { look: 0.2, shift: 0, curl: [0.3, 0.05] },
    0.52,
  ),
  wipe2: sitting(
    0.95,
    KN_Y - 0.03,
    0.4,
    [
      [0.75, 1.7, 1.0],
      [-0.2, 1.3, 1.7],
    ],
    [
      [0.35, 1.75, 1.75],
      [0.25, 0.62, 2.45],
    ],
    { look: 0.2, shift: 0, curl: [0.3, 0.05] },
    0.52,
  ),
  // staff: an assistant watching, his hands on his thighs; at the table, his hands on the desk; security, his hands together in front of him
  watch: sitting(0.18, KN_Y - 0.04, 0.32, both([0.95, 2.66, 0.45]), both([0.5, 2.22, 1.25]), { look: 0.02 }),
  desk: sitting(0.16, KN_Y - 0.06, 0.24, both([0.84, 2.78, 0.62]), both([0.4, 2.86, 1.5]), { look: -0.02, curl: 0.15 }),
  guard: standing(0.0, both([0.98, 4.1, 0.12]), both([0.1, 3.5, 0.6]), { curl: 0.6 }),
  // a photographer, sat low on his box: the camera in his lap, and at his eye (his hands are put on it: see `props`)
  photo0: sitting(0.3, KN_Y - 0.03, 0.4, both([0.9, 1.9, 0.4]), both([0.3, 1.7, 1.3]), { look: -0.05, shift: 0, curl: 0.6 }, 0.6),
  photo: sitting(0.2, KN_Y - 0.03, 0.4, both([0.7, 2.0, 0.85]), both([0.3, 2.9, 1.25]), { look: -0.12, shift: 0, curl: 0.6 }, 0.6),
};
/** The ways a man sits on a bench (a few with a towel round their necks), and gets up from one. */
const SITS = ['lean', 'back', 'up', 'arms', 'chin', 'lean', 'rest'] as const;
const UPS = ['cheer', 'clap', 'towel', 'cheer'] as const;
/** How far up off his chair each pose is: sat (0), the two steps of getting up, on his feet (3). One changes into another a step at a time. */
const HEIGHT: Record<string, number | undefined> = { rise1: 1, rise2: 2, stand: 3, hips: 3, cheer: 3, cheer2: 3, clap: 3, clap2: 3, towel: 3, towel2: 3 };
for (const p of [...SITS, 'slump', 'greet']) HEIGHT[p] = 0;
/** A pose that is never still: the one it goes to and back from, and how fast (a second). */
const LOOP: Record<string, [string, number] | undefined> = { clap: ['clap2', 3.4], cheer: ['cheer2', 2.3], towel: ['towel2', 1.9], wipe: ['wipe2', 1.5] };
/** What a pose has in its hands or on its shoulders (a cast's two poses carry the same things). */
const CARRIES: Record<string, 'towel' | 'camera' | 'rag' | 'drape' | undefined> = {
  towel: 'towel',
  towel2: 'towel',
  photo: 'camera',
  photo0: 'camera',
  wipe: 'rag',
  wipe2: 'rag',
  rest: 'drape',
};

// ---------------------------------------------------------------- the palette: who wears what

/** The parts a body is made of (people.py's materials), and two made here: a photographer's camera, a towel. */
export const PARTS = [
  'skin',
  'hair',
  'hairTop',
  'bob',
  'bun',
  'tail',
  'twists',
  'locs',
  'braids',
  'afro',
  'hightop',
  'curls',
  'brow',
  'eye',
  'iris',
  'lip',
  'beard',
  'goatee',
  'white',
  'warm',
  'trim',
  'cloth',
  'shoe',
  'suit',
  'lapel',
  'legs',
  'shirt',
  'tie',
  'top',
  'metal',
  'gear',
  'towel',
  'rag',
] as const;
type PartName = (typeof PARTS)[number];
const PART = Object.fromEntries(PARTS.map((p, i) => [p, i])) as Record<PartName, number>;
/** The most people the palette holds. */
const ROWS = 96;
const WHITE = '#e9e7e1';
const SUITS = ['#2b2d35', '#1f2a3d', '#38383c', '#232326', '#3d362e', '#2a3038'];
const SHIRTS = ['#e6e5e1', '#e6e5e1', '#cfd9e6', '#e8e0d2'];
const CASUAL = ['#3b4a3a', '#39404f', '#4a3f36', '#2f3b40', '#4d4d52', '#5a3a36'];

/** What someone wears: a colour for each part of him he has (a part with none is not drawn: the hair he doesn't wear, a beard he hasn't got). */
type Wear = Partial<Record<PartName, string>>;

const mix = (a: string, b: string | Color, t: number) => `#${new Color(a).lerp(b instanceof Color ? b : new Color(b), t).getHexString()}`;

/** Who among the people round the floor (never the players) is a woman, from her number. */
const lady = (id: number) => hash(id, 91) < 0.38;
/** How a woman wears her hair (people.py's pieces). */
const LADY_HAIR = ['bob', 'bob', 'bob', 'bun', 'tail'] as const;

/** What everyone has: skin, hair as he or she wears it, brows, eyes, lips, a beard or the shadow of one. */
function human(look: Look, woman = false): Wear {
  const style = STYLES[look.style];
  const shaved = !woman && style.name === 'shaved';
  const skin = new Color(look.skin);
  // (lips are the skin's colour, redder: as figure.ts paints a player's)
  const lip = new Color(skin.r * 0.84 + 0.03, skin.g * (woman ? 0.56 : 0.64), skin.b * (woman ? 0.6 : 0.66) + 0.01);
  const wear: Wear = {
    skin: look.skin,
    hair: shaved ? mix(look.skin, look.hair, 0.3) : look.hair,
    brow: mix(look.brows, '#15110e', 0.3),
    eye: '#15100d',
    iris: look.eyes,
    lip: `#${lip.getHexString()}`,
    white: WHITE,
    towel: WHITE,
    rag: WHITE,
    gear: '#0e0e10',
  };
  // (the one head of hair that is a shape of its own, if his is)
  const piece: PartName | null = woman
    ? LADY_HAIR[Math.floor(hash(look.style * 31 + look.tone, 7) * LADY_HAIR.length)]
    : (style.piece ?? (style.name === 'crop' ? 'hairTop' : null));
  if (piece) wear[piece] = look.hair;
  if (!woman) {
    if (look.beard === 1) wear.beard = mix(look.skin, look.brows, 0.2);
    else if (look.beard === 2) wear.goatee = look.brows;
    else if (look.beard >= 3) wear.beard = look.brows;
  }
  return wear;
}

/** A player off the floor: his warm-up, dark in his team's colour, over his shorts. */
function benchWear(look: Look, kit: MatchKit, woman = false): Wear {
  return {
    ...human(look, woman),
    warm: mix(kit.color, WARMUP, 0.58),
    trim: mix(kit.light ? kit.token.ring : kit.trim, WARMUP, 0.15),
    cloth: mix(kit.token.fill, WARMUP, 0.42),
    shoe: kit.light ? mix(kit.token.ring, '#101012', 0.3) : '#1b1c1f',
    towel: kit.light ? WHITE : mix(kit.color, '#ffffff', 0.2),
    rag: WHITE,
  };
}

/** A coach or his assistant: a dark suit, his tie his team's colour. */
function suitWear(look: Look, id: number, kit: MatchKit | null): Wear {
  const suit = SUITS[Math.floor(hash(id, 31) * SUITS.length)];
  return {
    ...human(look, lady(id)),
    suit,
    lapel: mix(suit, '#000000', 0.28),
    legs: hash(id, 37) < 0.75 ? suit : '#2c2d31',
    shirt: SHIRTS[Math.floor(hash(id, 41) * SHIRTS.length)],
    tie: kit ? (kit.light ? kit.token.ring : kit.token.fill) : '#3a3d48',
    shoe: '#151517',
  };
}

/** Someone at work round the floor in his own clothes: a jacket, a shirt of its colour, no tie to speak of. */
function plainWear(look: Look, id: number, top?: string, legs = '#25272c'): Wear {
  const jacket = top ?? CASUAL[Math.floor(hash(id, 43) * CASUAL.length)];
  return {
    ...human(look, lady(id)),
    suit: jacket,
    lapel: mix(jacket, '#000000', 0.22),
    legs,
    shirt: mix(jacket, '#ffffff', 0.55),
    tie: mix(jacket, '#000000', 0.3),
    shoe: '#1a1a1c',
  };
}

const REF_WEAR: Wear = { top: '#8f9299', trim: '#17181c', legs: '#151517', shoe: '#0d0d0e', metal: '#c4c8cf' };

// ---------------------------------------------------------------- sitters: poses, baked, drawn many times

/**
 * What the sitters' shader adds: each point between the pose he is in and the one he is going to, his colours
 * from his row of the palette, his head turned to what he watches, his trunk never quite still, a towel going round.
 */
const CAST_HEAD = /* glsl */ `
  attribute float aPart;
  attribute float aHead;
  attribute float aRow;
  attribute float aMix;
  attribute vec3 aTo;
  attribute vec3 aToN;
  attribute vec4 aLife;
  uniform sampler2D uPalette;
  uniform float uTime;
  uniform vec3 uNeck[2];
  uniform vec3 uUp[2];
  uniform vec3 uSide[2];
  uniform float uHips[2];
  uniform vec3 uHand[2];
  vec3 castWear;
  vec3 castSpin(vec3 v, vec3 k, float a) {
    return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
  }
  // (aLife: his head's turn to his left and its nod, his own beat, how hard he's waving)
  vec3 castTurn(vec3 v) {
    return castSpin(castSpin(v, normalize(mix(uSide[0], uSide[1], aMix)), aLife.y * aHead), normalize(mix(uUp[0], uUp[1], aMix)), aLife.x * aHead);
  }`;
const CAST_COLOR = /* glsl */ `
  castWear = texelFetch(uPalette, ivec2(int(aPart + 0.5), int(aRow + 0.5)), 0).rgb;
  vColor *= castWear;`;
const CAST_NORMAL = /* glsl */ `
  objectNormal = castTurn(normalize(mix(objectNormal, aToN, aMix)));`;
const CAST_MOVE = /* glsl */ `
  vec3 castNeck = mix(uNeck[0], uNeck[1], aMix);
  transformed = castNeck + castTurn(mix(transformed, aTo, aMix) - castNeck);
  if (abs(aPart - ${PART.towel.toFixed(1)}) < 0.5) {
    vec3 castHand = mix(uHand[0], uHand[1], aMix);
    transformed = castHand + castSpin(transformed - castHand, vec3(0.0, 1.0, 0.0), uTime * 11.0 + aLife.z * 6.2831);
  }
  float castHigh = max(0.0, transformed.y - mix(uHips[0], uHips[1], aMix));
  transformed.x += castHigh * (0.016 * sin(uTime * 0.9 + aLife.z * 40.0) + aLife.w * 0.05 * sin(uTime * 9.0 + aLife.z * 23.0));
  transformed.z += castHigh * 0.013 * sin(uTime * 0.63 + aLife.z * 70.0);`;
/** Two poses of one body (the same one twice: a pose held), as many times as there are people between them now. */
interface Cast {
  mesh: InstancedMesh;
  row: InstancedBufferAttribute;
  life: InstancedBufferAttribute;
  mix: InstancedBufferAttribute;
  n: number;
  /** Which pictures it is in: both, the camera's only, the floor's mirror only (see SEEN). */
  seen: number;
}

/** A cast is in the camera's picture and the floor's mirror, in the camera's only, or in the mirror only. */
const SEEN = { both: 0, camera: 1, mirror: 2 } as const;
/**
 * A sitter is drawn in the body built for a close camera once he is this much of the picture's height
 * (standing: a man on the far bench is an eighth of it from the broadcast camera), and in the far one
 * again under the second; a device a step down wants him bigger still, and from two steps down he is
 * always the far one.
 */
const NEAR_TALL = [0.2, 0.17] as const;
const NEAR_TALL_LITE = 0.34;
/** How tall a man is taken to be for that (ft). */
const MAN_FT = 6.6;

/** A thing put on a posed body: a shape in a bone's frame (or, with `at`, in a frame of the pose's own), a part of its own. */
interface Prop {
  bone: string;
  part: PartName;
  geo: BufferGeometry;
  head?: boolean;
  at?: (bones: Map<string, Matrix4>) => Matrix4;
}

/** The bones only the players' figure turns (figure.py's leaves): here each goes as the bone it hangs from. */
const HANGS: Record<string, string | undefined> = { jaw: 'head', nose: 'head', hair: 'head', cll: 'chest', clr: 'chest' };
const OF_HEAD = new Set(['head', 'jaw', 'nose', 'hair']);

/** A body in a pose: where its bones put each point and which way each faces, and what the shader needs of the pose. */
interface Baked {
  position: BufferAttribute;
  normal: BufferAttribute;
  neck: Vector3;
  up: Vector3;
  side: Vector3;
  hips: number;
  hand: Vector3;
}

/** What doesn't change with the pose: each point's baked shade, its part, how much of it is his head; the corners. */
interface Flesh {
  color: BufferAttribute;
  part: BufferAttribute;
  head: BufferAttribute;
  index: BufferAttribute;
  /** Each part's corners: where they start in `index`, and how many (a part may have more than one run). */
  runs: Map<number, [number, number][]>;
  /** The corners of the parts one look has, by the look (see Sideline.corners). */
  looks: Map<string, BufferAttribute>;
}

/** A body's own points, then its props', run together (the same for every pose of a body with the same props). */
function fleshOf(thing: Thing, props: Prop[]): Flesh {
  if (!thing.bones) throw new Error(`people.glb: ${thing.name} has no bones`);
  const heads = thing.bones.map((b) => OF_HEAD.has(b.name));
  const color: number[] = [];
  const part: number[] = [];
  const head: number[] = [];
  const index: number[] = [];
  const runs = new Map<number, [number, number][]>();
  const run = (k: number, start: number) => runs.set(k, [...(runs.get(k) ?? []), [start, index.length - start]]);
  let from = 0;
  for (const p of thing.parts) {
    const k = (PART as Record<string, number | undefined>)[p.material];
    if (k === undefined) throw new Error(`people.glb: ${thing.name} has a part the app has no colour for (${p.material})`);
    const start = index.length;
    const [pos, col, on, by] = ['position', 'color', 'skinIndex', 'skinWeight'].map((a) => p.geo.getAttribute(a));
    for (let i = 0; i < pos.count; i++) {
      color.push(col ? col.getX(i) : 1, col ? col.getY(i) : 1, col ? col.getZ(i) : 1);
      part.push(k);
      let h = 0;
      for (let c = 0; c < 4; c++) if (heads[on.getComponent(i, c)]) h += by.getComponent(i, c);
      head.push(h);
    }
    const ix = p.geo.index!;
    for (let i = 0; i < ix.count; i++) index.push(from + ix.getX(i));
    from += pos.count;
    run(k, start);
  }
  for (const prop of props) {
    const g = prop.geo.index ? prop.geo.toNonIndexed() : prop.geo;
    const count = g.getAttribute('position').count;
    const start = index.length;
    for (let i = 0; i < count; i++) {
      color.push(1, 1, 1);
      part.push(PART[prop.part]);
      head.push(prop.head ? 1 : 0);
      index.push(from + i);
    }
    run(PART[prop.part], start);
    from += count;
    if (g !== prop.geo) g.dispose();
  }
  return {
    color: new BufferAttribute(new Float32Array(color), 3),
    part: new BufferAttribute(new Float32Array(part), 1),
    head: new BufferAttribute(new Float32Array(head), 1),
    index: new BufferAttribute(from > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1),
    runs,
    looks: new Map(),
  };
}

/** A body in a pose (and what it carries): each point where its bones put it. */
function bake(thing: Thing, pose: Pose, props: Prop[] = []): Baked {
  if (!thing.bones) throw new Error(`people.glb: ${thing.name} has no bones`);
  const bones = bonesOf(pose);
  const lift = new Matrix4().makeTranslation(0, -FLOOR, pose.shift ?? 0);
  const mats = thing.bones.map((b) => {
    const at = bones.get(b.name);
    if (at) return lift.clone().multiply(at).multiply(b.inverse);
    // (a leaf only the players' figure turns: here it goes as the bone it hangs from)
    const of = HANGS[b.name];
    const from = thing.bones!.find((o) => o.name === of);
    const to = of ? bones.get(of) : undefined;
    if (!to || !from) throw new Error(`people.glb: ${thing.name} has a bone no pose places (${b.name})`);
    return lift.clone().multiply(to).multiply(from.inverse);
  });
  const P: number[] = [];
  const N: number[] = [];
  const p = new Vector3();
  const n = new Vector3();
  const q = new Vector3();
  for (const part of thing.parts) {
    const [pos, nor, on, by] = ['position', 'normal', 'skinIndex', 'skinWeight'].map((a) => part.geo.getAttribute(a));
    for (let i = 0; i < pos.count; i++) {
      let [x, y, z, nx, ny, nz] = [0, 0, 0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        const w = by.getComponent(i, c);
        if (w <= 0) continue;
        const b = on.getComponent(i, c);
        p.fromBufferAttribute(pos, i).applyMatrix4(mats[b]);
        n.fromBufferAttribute(nor, i).transformDirection(mats[b]);
        x += p.x * w;
        y += p.y * w;
        z += p.z * w;
        nx += n.x * w;
        ny += n.y * w;
        nz += n.z * w;
      }
      q.set(nx, ny, nz).normalize();
      P.push(x, y, z);
      N.push(q.x, q.y, q.z);
    }
  }
  for (const prop of props) {
    const frame = lift.clone().multiply(prop.at ? prop.at(bones) : bones.get(prop.bone)!);
    const g = (prop.geo.index ? prop.geo.toNonIndexed() : prop.geo.clone()).applyMatrix4(frame);
    P.push(...(g.getAttribute('position').array as Float32Array));
    N.push(...(g.getAttribute('normal').array as Float32Array));
    g.dispose();
  }
  const head = lift.clone().multiply(bones.get('head')!);
  const hand = lift.clone().multiply(bones.get('har')!);
  return {
    position: new BufferAttribute(new Float32Array(P), 3),
    normal: new BufferAttribute(new Float32Array(N), 3),
    neck: new Vector3().setFromMatrixPosition(head),
    up: new Vector3().setFromMatrixColumn(head, 1).normalize(),
    side: new Vector3().setFromMatrixColumn(head, 0).normalize(),
    hips: pose.hips[1] - FLOOR,
    // (what a raised hand holds is a little past its wrist)
    hand: new Vector3(0, -0.3, 0).applyMatrix4(hand),
  };
}

/** The poses there are, and a body of people.glb in one of them as it is drawn (a test puts each of them on the floor). */
export const POSE_NAMES = Object.keys(POSES);
export function posed(thing: Thing, pose: string): BufferGeometry {
  const baked = bake(thing, POSES[pose]);
  const flesh = fleshOf(thing, []);
  const geo = new BufferGeometry();
  geo.setAttribute('position', baked.position);
  geo.setAttribute('normal', baked.normal);
  geo.setAttribute('aPart', flesh.part);
  geo.setIndex(flesh.index);
  return geo;
}

/** A towel in a raised hand: a strip of cloth out from it, a little up (the shader takes it round). */
function towelGeo(): BufferGeometry {
  const g = new PlaneGeometry(1.5, 0.46, 4, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0.8, 0, 0);
  g.rotateZ(0.35);
  g.translate(0, -0.3, 0);
  return g;
}

/** A towel round his neck: over the back of it, an end down each side of his chest (in his chest's frame). */
function drapeGeo(): BufferGeometry {
  const strips: BufferGeometry[] = [];
  const n = 14;
  const at = (t: number, wide: number): [number, number, number] => {
    // (t: -1 the end on his right, 0 the back of his neck, 1 the end on his left)
    const a = Math.abs(t);
    const s = Math.sign(t) || 1;
    if (a < 0.4) {
      const th = (a / 0.4) * (Math.PI / 2);
      return [s * Math.sin(th) * (0.34 + wide * 0.4), 0.44 - wide * 0.16, -Math.cos(th) * 0.3 + 0.02];
    }
    const down = (a - 0.4) / 0.6;
    return [s * (0.36 + wide * 0.36 - down * 0.06), 0.42 - down * 1.15 - wide * 0.1, 0.06 + Math.sin(Math.min(1, down * 2.2) * Math.PI * 0.5) * 0.42];
  };
  for (let k = 0; k < n; k++) {
    const [t0, t1] = [-1 + (2 * k) / n, -1 + (2 * (k + 1)) / n];
    const g = new BufferGeometry();
    const [a, b, c, d] = [at(t0, 0), at(t1, 0), at(t1, 1), at(t0, 1)];
    g.setAttribute('position', new BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
    g.computeVertexNormals();
    strips.push(g);
  }
  const g = mergeGeometries(strips)!;
  for (const s of strips) s.dispose();
  return g;
}

/** A camera at a photographer's eye: its body and a long lens (the lens along z, the body at its near end). */
function cameraGeo(): BufferGeometry {
  const body = new BoxGeometry(0.46, 0.3, 0.2).translate(0, 0.02, 0.5);
  const lens = new CylinderGeometry(0.11, 0.13, 0.62, 10).rotateX(Math.PI / 2).translate(0, 0, 0.9);
  const g = mergeGeometries([body.toNonIndexed(), lens.toNonIndexed()])!;
  body.dispose();
  lens.dispose();
  g.deleteAttribute('uv');
  return g;
}

/** What a pose carries, as shapes on its bones: `spec` comes back with his hands where the thing is. */
function props(kind: (typeof CARRIES)[string], name: string, spec: Pose): { spec: Pose; props: Prop[] } {
  const plain = (g: BufferGeometry) => {
    g.deleteAttribute('uv');
    return g;
  };
  if (kind === 'towel') return { spec, props: [{ bone: 'har', part: 'towel', geo: plain(towelGeo()) }] };
  if (kind === 'drape') return { spec, props: [{ bone: 'chest', part: 'rag', geo: drapeGeo() }] };
  if (kind === 'rag') {
    // (a cloth flat on the floor under his right hand)
    const g = plain(new PlaneGeometry(0.9, 0.7, 1, 1).rotateX(-Math.PI / 2));
    const at = (bones: Map<string, Matrix4>) => {
      const hand = new Vector3(0, -0.3, 0).applyMatrix4(bones.get('har')!);
      return new Matrix4().makeTranslation(hand.x, FLOOR + 0.03, hand.z);
    };
    return { spec, props: [{ bone: 'har', part: 'rag', geo: g, at }] };
  }
  if (kind === 'camera') {
    const head = bonesOf(spec).get('head')!;
    // (at his eye it is in his head's frame; in his lap, tipped down in front of his chest)
    const frame = name === 'photo' ? head.clone() : new Matrix4().makeTranslation(0, 1.72, 0.62).multiply(new Matrix4().makeRotationX(0.45));
    const grip = (x: number) => new Vector3(x, -0.06, 0.62).applyMatrix4(frame).toArray() as [number, number, number];
    return { spec: { ...spec, hands: [grip(0.26), grip(-0.26)] }, props: [{ bone: 'head', part: 'gear', geo: cameraGeo(), at: () => frame }] };
  }
  return { spec, props: [] };
}

// ---------------------------------------------------------------- walkers: a puppet under another skin

/** A walker's body: its shape (one for everyone in it), each part's run of points and of corners, and its bones by the puppet's count. */
interface Suit {
  geo: BufferGeometry;
  parts: { name: string; from: number; count: number; start: number; size: number }[];
  order: number[];
  inverse: Matrix4[];
}

function suitOf(thing: Thing, slot: Map<string, number>): Suit {
  if (!thing.bones) throw new Error(`people.glb: ${thing.name} has no bones`);
  const sizes = thing.parts.map((p) => p.geo.getAttribute('position').count);
  const { geo, materials } = merged(thing);
  let from = 0;
  const parts = materials.map((name, i) => {
    const g = geo.groups[i];
    const part = { name, from, count: sizes[i], start: g.start, size: g.count };
    from += sizes[i];
    return part;
  });
  const order = thing.bones.map((b) => {
    const k = slot.get(b.name);
    if (k === undefined) throw new Error(`people.glb: ${thing.name} hangs on a bone the player doesn't have (${b.name})`);
    return k;
  });
  return { geo, parts, order, inverse: thing.bones.map((b) => b.inverse) };
}

/** What the walkers are made with: the players' figure (its shadow's shape, its bones' count and names). */
interface Kit {
  geo: Geo;
  slot: Map<string, number>;
  count: number;
}

/**
 * The players' figure with no skin of its own: its puppet and its bones, placed by figure.ts's own `place`,
 * and nothing painted (a player's kit sheet is a 1024 px picture nobody would see under another skin). Made
 * by hand from what `place` reads; if the figure has since come to need something this doesn't give it, the
 * whole figure is made instead and its skin hidden, as before.
 */
function bones(kit: Kit, body: Body, look: Look, id: number, dress: MatchKit): { fig: Fig; bones: Bone[] } {
  try {
    const fig = Object.create(Fig.prototype) as Fig;
    const group = new Group();
    const list = Array.from({ length: kit.count }, () => new Bone());
    for (const b of list) group.add(b);
    const dark = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05, depthWrite: false });
    const shadow = new Mesh(kit.geo.blob, dark);
    shadow.scale.setScalar(body.s * (0.9 + 0.2 * body.bulk));
    shadow.renderOrder = 3;
    Object.assign(fig, {
      group,
      pup: new Puppet(body),
      side: 0,
      mark: '',
      bones: list,
      hinge: [0, 1, 2, 3].map(() => new Vector3(1, 0, 0)),
      lag: [0, 1].map(() => ({ at: new Vector3(), v: new Vector3(), set: false })),
      last: 0,
      shadow,
      ring: new Object3D(),
      own: [dark],
      gone: false,
      ball: null,
      look,
    });
    // (his build and his face, as figure.ts sizes a player's bones)
    const { s, bulk } = body;
    const thick = s * (0.78 + 0.22 * bulk);
    const deep = Math.sqrt(bulk) * s;
    const hs = Math.sqrt(s) * 1.06;
    const f = look.face;
    const size = (names: string[], x: number, y: number, z: number) => {
      for (const name of names) {
        const k = kit.slot.get(name);
        if (k !== undefined) list[k].scale.set(x, y, z);
      }
    };
    size(['pelvis', 'chest', 'hem'], bulk * s, s, deep);
    size(['head', 'hair'], hs * f.wide, hs * f.long, hs);
    size(['jaw'], hs * f.wide * f.jaw, hs * f.long * f.chin, hs);
    size(['nose'], hs * f.wide * f.nose, hs * f.long, hs * f.bridge);
    size(['ual', 'fal', 'uar', 'far', 'thl', 'shl', 'thr', 'shr', 'hemL', 'hemR'], thick, s, thick);
    size(['hal', 'har', 'ftl', 'ftr', 'kn1l', 'kn2l', 'kn1r', 'kn2r'], s, s, s);
    // (stood up once, here: what `place` needs and isn't given shows now, not in the middle of a game)
    fig.pup.update({ x: 0, z: 0, yaw: 0, act: 'stand', ms: 0, dur: 0, ball: false, cut: true, who: id }, 0, 0, 0);
    fig.pup.arms(null);
    fig.place();
    for (const b of list) if (!Number.isFinite(b.position.x + b.quaternion.w)) throw new Error('a bone nowhere');
    fig.pup.placed = false;
    return { fig, bones: list };
  } catch {
    const fig = new Fig(kit.geo, body, 0, dress, '', id, '', '', look);
    const list: Bone[] = [];
    for (const c of fig.group.children) {
      if ((c as Bone).isBone) list.push(c as Bone);
      else c.visible = false;
    }
    return { fig, bones: list };
  }
}

/** Walkers go no faster than this toward their spot (ft a second of their own time), and are this near it before they stop. */
const NEAR = 0.35;
/** A walker keeps this far from a player (ft): he steps out of a man's way, the man doesn't step out of his. */
const BERTH = 3.4;

class Walker {
  readonly fig: Fig;
  readonly mesh: SkinnedMesh;
  /** The same man in the far body, on the same bones: what throws his shadow and stands in the floor's mirror for him (none: `mesh` is the far body already). */
  private readonly low: SkinnedMesh | null = null;
  private readonly bones: Bone[];
  private readonly own: { dispose(): void }[] = [];
  /** Where he is going, and how fast he is getting there. */
  x = 0;
  z = 0;
  private vx = 0;
  private vz = 0;
  private placed = false;
  private set = false;
  private going = false;
  /** The ball is in his hands. */
  has = false;

  constructor(
    private readonly kit: Kit,
    suit: Suit,
    body: Body,
    dress: MatchKit,
    readonly id: number,
    look: Look,
    wear: Wear,
    mat: MeshStandardMaterial,
    low?: Suit,
  ) {
    const made = bones(kit, body, look, id, dress);
    this.fig = made.fig;
    this.bones = made.bones;
    const skin = (suit: Suit) => {
      const geo = new BufferGeometry();
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(name, suit.geo.getAttribute(name));
      // his colours, a point at a time: the part's, under its baked shade; a part he doesn't have is left out
      const shade = suit.geo.getAttribute('color');
      const col = new Float32Array(shade.count * 3);
      const c = new Color();
      const corners: number[] = [];
      const all = suit.geo.index!.array;
      for (const part of suit.parts) {
        const hex = wear[part.name as PartName];
        if (hex === undefined) continue;
        c.set(hex);
        for (let i = part.from; i < part.from + part.count; i++) col.set([c.r * shade.getX(i), c.g * shade.getY(i), c.b * shade.getZ(i)], i * 3);
        for (let i = part.start; i < part.start + part.size; i++) corners.push(all[i]);
      }
      geo.setAttribute('color', new BufferAttribute(col, 3));
      geo.setIndex(corners);
      const mesh = new SkinnedMesh(geo, mat);
      const skeleton = new Skeleton(
        suit.order.map((k) => this.bones[k]),
        suit.inverse,
      );
      mesh.bind(skeleton, new Matrix4());
      mesh.frustumCulled = false;
      this.fig.group.add(mesh);
      this.own.push(geo, skeleton);
      return mesh;
    };
    this.mesh = skin(suit);
    this.mesh.castShadow = !low;
    if (low) {
      // (in the camera's picture none of it is drawn; for a lamp's shadow map, and in the mirror, all of it)
      const mesh = (this.low = skin(low));
      mesh.castShadow = true;
      mesh.geometry.setDrawRange(0, 0);
      mesh.onBeforeShadow = () => mesh.geometry.setDrawRange(0, Infinity);
      mesh.onAfterShadow = () => mesh.geometry.setDrawRange(0, this.inMirror || this.plain ? Infinity : 0);
    }
  }

  /** His far body is the one drawn: for the floor's mirror, or all the time (a slow device). */
  private inMirror = false;
  private plain = false;
  private draw() {
    if (!this.low) return;
    const far = this.inMirror || this.plain;
    this.mesh.visible = !far;
    this.low.geometry.setDrawRange(0, far ? Infinity : 0);
  }

  /** The floor's mirror is being drawn (or has been): his far body is in it, not the near one. */
  mirrored(on: boolean) {
    this.inMirror = on;
    this.draw();
  }

  /** A device that can't keep up: his far body is all of him. */
  lite(on: boolean) {
    this.plain = on;
    this.draw();
  }

  get pup() {
    return this.fig.pup;
  }

  /** Something in one of his hands (a coach's board), in the hand's frame. */
  hold(thing: Object3D, hand: 'hal' | 'har') {
    const k = this.kit.slot.get(hand);
    if (k !== undefined) this.bones[k].add(thing);
  }

  /** He is here, now (not on his way). */
  put(x: number, z: number) {
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.placed = false;
    this.set = true;
  }

  /**
   * A frame on: he goes toward (tx, tz) at `pace` ft a second at most, out of the way of the players, facing
   * `yaw` (or the way he's going, when he has far to go), and his puppet takes it from there.
   */
  go(tx: number, tz: number, yaw: number, pace: number, act: Act, a: Around, more: { look?: V3; rest?: boolean; cut?: boolean; clear?: boolean } = {}) {
    const sec = a.own / 1000;
    const first = !this.placed;
    // (the first time he is seen he is where he is going, unless he has been put somewhere)
    if (more.cut || (first && !this.set)) {
      this.x = tx;
      this.z = tz;
      this.vx = this.vz = 0;
    } else if (sec > 0) {
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      // (he slows as he gets there, and gets up to speed over a stride or two)
      const want = d < NEAR ? 0 : Math.min(pace, d * 2.6);
      const k = 1 - Math.exp(-sec * 7);
      this.vx += ((d > 0 ? (dx / d) * want : 0) - this.vx) * k;
      this.vz += ((d > 0 ? (dz / d) * want : 0) - this.vz) * k;
      this.x += this.vx * sec;
      this.z += this.vz * sec;
      if (more.clear !== false)
        for (const f of a.figs.values()) {
          const ox = this.x - f.pup.x;
          const oz = this.z - f.pup.z;
          const far = Math.hypot(ox, oz);
          if (far >= BERTH) continue;
          const push = Math.min(BERTH - far, sec * 14);
          // (straight away from him; from on top of him, toward the far side)
          this.x += far > 0.05 ? (ox / far) * push : 0;
          this.z += far > 0.05 ? (oz / far) * push : -push;
        }
    }
    // going somewhere he faces the way he's going (his head still on what he watches), unless that is behind
    // him: then he backs up; a step or two he takes as he stands
    const sp = Math.hypot(this.vx, this.vz);
    const way = Math.atan2(this.vx, this.vz);
    this.going = sp > (this.going ? 1.2 : 2.2) && Math.abs(wrap(way - yaw)) < 2.2;
    const face = this.going ? way : yaw;
    this.placed = true;
    this.pup.update(
      {
        x: this.x,
        z: this.z,
        yaw: face,
        act: this.has ? 'hold' : sp > 1 ? 'move' : act,
        ms: 0,
        dur: 0,
        ball: this.has,
        cut: first || !!more.cut,
        look: this.has ? undefined : more.look,
        rest: more.rest,
        who: this.id,
      },
      a.own,
      a.own,
      a.ease,
    );
  }

  cue(id: Gesture, wait = 1500) {
    this.pup.cue(id, null, wait);
  }

  /** Where a ball handed to him goes, or one he hands on starts from: in front of his chest. */
  hands(out: Vector3): Vector3 {
    const s = this.pup.body.s;
    const at = this.pup.world(0, 3.5 * s, 1.05 * s, TMP);
    return out.set(at.x, at.y, at.z);
  }

  /** His skin onto his puppet (after everything has been said to it this frame). `ball`: the ball, when it's in his hands. */
  place(ball: V3 | null) {
    this.pup.arms(ball);
    this.fig.place();
  }

  show(on: boolean) {
    this.fig.group.visible = on;
    this.fig.shadow.visible = on;
  }

  dispose() {
    for (const o of this.own) o.dispose();
    this.fig.dispose();
  }
}

// ---------------------------------------------------------------- the frame, as the scene sees it

/** What the scene tells the sideline each frame. */
export interface Around {
  /** The moment drawn (a replay's, while one has the picture). */
  stage: Stage;
  /** The ball (a referee with it in his hands puts it there). */
  ball: Vector3;
  figs: ReadonlyMap<number, Fig>;
  /** A player has the ball in his hands. */
  held: boolean;
  /** A trip to the line. */
  line: boolean;
  final?: 0 | 1;
  /** What kind of win it is, and where the winners gather on the floor (a bench that storms the floor runs there). */
  occasion?: Occasion;
  gather?: { x: number; z: number } | null;
  clutch: boolean;
  game?: GameInfo;
  /** Who is on each bench (their player ids), when the page knows. */
  bench?: [number[], number[]];
  /** Each player's build, for the man who walks off the floor to his chair. */
  body?: (pid: number) => Body;
  /** The bodies' time, the clock's eased time, the clock's own (ms). */
  own: number;
  ease: number;
  real: number;
  calm: boolean;
  /** The picture went to another moment (into a replay, out of one): everyone is put where he belongs. */
  cut: boolean;
  replay: boolean;
}

/** Somewhere to stand: where his feet are, and the way he faces. */
interface Spot {
  x: number;
  z: number;
  yaw: number;
}

/** Someone who is drawn as a pose (and, a man off the bench or a ball kid, as a walker while he goes somewhere). */
interface Sitter {
  body: 'bench' | 'staff';
  kind: 'bench' | 'aide' | 'crew' | 'guard' | 'photo' | 'kid';
  side: 0 | 1 | null;
  row: number;
  id: number;
  woman: boolean;
  wear: Wear;
  /** His seat: where, which way it faces, his size; a bench's chair by its number. */
  x: number;
  z: number;
  yaw: number;
  size: [number, number, number];
  chair: number;
  /** How he sits when nothing is happening, and how he gets up for a play. */
  sit: string;
  react: string;
  /** What he's doing (sat; up for a play; down about one; a hand up to a teammate off the floor), from when and until when (ms). */
  mode: 'sit' | 'up' | 'down' | 'greet';
  from: number;
  until: number;
  /** At the end of the game, he runs out onto the floor to the winners. */
  storm: boolean;
  /** He came off the floor, and sits with a towel until then (ms). */
  spent: number;
  /** The pose he is in, the one he is on his way to and how far he has got (0..1). */
  pose: string;
  next: string | null;
  t: number;
  /** Where the frame his poses are drawn in is now (his chair's, while he sits on it), and where his head is turned. */
  px: number;
  pz: number;
  pyaw: number;
  turn: number;
  nod: number;
  beat: number;
  /** On his way somewhere, as a walker (made the first time he goes). */
  w: Walker | null;
  walking: boolean;
  /** As he is to be drawn this frame (see Sideline.present): at all, toward which pose and how far, how high he hops, whether he waves. */
  drawn: boolean;
  to: string;
  mix: number;
  hop: number;
  wave: number;
  /** Big enough in the picture for the body built for a close camera. */
  near: boolean;
  /** What a slow device gives up first (1), then (2). */
  tier: 0 | 1 | 2;
}

/** A head coach. */
interface Coach {
  w: Walker;
  side: 0 | 1;
  /** Where in his box he's standing (x), and when he next moves (ms). */
  spot: number;
  move: number;
  /** When he may next call something out. */
  call: number;
  /** The board he takes the huddle with. */
  board: Mesh;
}

/** A man of the ten the sideline has on a way of its own for a moment: on from the table, over to his bench. */
interface Detour {
  x: number;
  z: number;
  /** Where he is sent (none: back to where the play has him, and then he is the play's again). */
  to: [number, number] | null;
  pace: number;
}

/** The ball, while it is the referees': on its way to one, in his hands, tossed up at the tip, or on its way from him to a player. */
interface Mine {
  w: Walker;
  phase: 'to' | 'held' | 'give' | 'up';
  t: number;
  ms: number;
  from: Vector3;
  /** Who it is handed to, and whether it is bounced to him (the man at the line). */
  pid: number;
  bounce: boolean;
}

/** What the benches and the coaches react to. */
type Moment = 'three' | 'dunk' | 'and1' | 'block' | 'buzzer' | 'make' | 'turnover' | 'foul' | 'timeout';

const sx = (p: Pt) => p.y - MID;
const sz = (p: Pt) => -p.x;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const M = new Matrix4();
const Q = new Quaternion();
const UP = new Vector3(0, 1, 0);
const AT = new Vector3();
const SIZE = new Vector3();
const HAND = new Vector3();
const TMP: V3 = { x: 0, y: 0, z: 0 };
const TMP2: V3 = { x: 0, y: 0, z: 0 };

/** The referees' spots while nothing is being played: together by the table. */
const IDLE: readonly (readonly [number, number])[] = [
  [-4.5, -22.6],
  [4.5, -22.6],
  [0, -20.8],
];
/** A dead ball lies this long (ms) before a referee goes to pick it up. */
const PICK_AFTER = 700;
/** The lead runs down the floor this far toward the far sideline (ft from the floor's middle): outside the lanes the players run in, and never between the camera and the play. */
const LANE_Z = -20.5;
/** How fast a referee runs, a coach walks and hurries, a man off the bench walks (ft a second). */
const REF_PACE = 25;
const COACH_PACE = 4.5;
const COACH_HURRY = 9;
const BENCH_PACE = 6.5;
/** A coach's box: from the table's end this far along his bench, this far behind the sideline. */
const BOX = [18.6, 30] as const;
const BOX_Z = -26.3;
/** The huddle: in front of the bench, the coach's back to the floor. */
const HUDDLE_X = 26;
const HUDDLE_Z = -25.4;
/** Late in a close game (the fourth or overtime, this many seconds left, this near): the benches are on their feet, the coaches down in a crouch. */
const LATE_S = 150;
const LATE_BY = 8;
/** A man coming on runs on from here, by the end of the table on his bench's side; a man called to his bench at a timeout gets this far toward it. */
const TABLE_END = 16.5;
const ON_Z = -(HALF_W + 1.2);
/** One step of getting up or sitting down takes this long (ms), and a change between two ways of standing or of sitting this long. */
const STEP_MS = 250;
const TURN_MS = 340;
/** A man just off the floor keeps his towel this long (ms of the bodies' time). */
const SPENT_MS = 60000;
/** A bench that storms the floor runs this fast (ft a second), to this far round where its five are (ft). */
const STORM_PACE = 15;
const STORM_R = [4.2, 5.6] as const;
/** The coaches meet in front of the table this long after the buzzer (ms), by the kind of win, and shake hands. */
const SHAKE_AFTER: Record<Occasion, number> = { win: 300, late: 4200, playoff: 2400, clinch: 4600, title: 5600 };

export class Sideline {
  readonly group = new Group();
  private readonly seatMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.75, vertexColors: true });
  private readonly things: Map<string, Thing>;
  private readonly casts = new Map<string, Cast>();
  private readonly baked = new Map<string, Baked>();
  private readonly flesh = new Map<string, Flesh>();
  private readonly castMats: MeshStandardMaterial[] = [];
  private readonly colours = new Float32Array(PARTS.length * ROWS * 4);
  private readonly palette: DataTexture;
  private readonly time = { value: 0 };
  private readonly sitters: Sitter[] = [];
  /** The benches' own people (they change with the kits and with who is on the floor). */
  private bench: Sitter[] = [];
  private benchKey = '';
  private readonly freeRows: number[] = [];
  private rows = 0;
  private kits: [MatchKit, MatchKit] | null = null;
  // the walkers: three referees, two coaches, whoever is on his way somewhere; the material each wears (the benches' take the benches' light)
  private readonly refMat: MeshStandardMaterial;
  private readonly coachMat: MeshStandardMaterial;
  private readonly benchMat: MeshStandardMaterial;
  private readonly suits: { official: Suit; staff: Suit; officialFar: Suit; staffFar: Suit; benchFar: Suit };
  private readonly kit: Kit;
  private refs: Walker[] = [];
  private coaches: Coach[] = [];
  private walking: Walker[] = [];
  private all: Sitter[] = [];
  private readonly walkers = new Group();
  private level = 0;
  // the game as last seen: the possession and its move, the basket last counted, how long the ball has been dead
  private script: unknown = null;
  private move = -1;
  private made = '';
  private n = 0;
  private deadMs = 0;
  private clock = 0;
  private sec = 0;
  private tipped = false;
  private tipBack = 0;
  private huddle = 0;
  private timeout = false;
  private whistle = 0;
  private late = false;
  private over = false;
  /** When the coaches go to shake hands, after the buzzer (ms of the sideline's clock), and whether they have. */
  private shake = Infinity;
  private shook = false;
  private count = 0;
  /** Signals still to come: who, what, when (ms of the sideline's clock). */
  private later: { w: Walker; id: Gesture; at: number }[] = [];
  /** Where each of the ten was last seen, and which side he is on. */
  private readonly lastAt = new Map<number, [number, number, 0 | 1]>();
  private readonly detours = new Map<number, Detour>();
  private mine: Mine | null = null;
  private bodyOf: ((pid: number) => Body) | undefined;

  constructor(
    private readonly keep: Keep,
    props: Props,
    models: { people: Map<string, Thing>; figure: Map<string, Thing> },
    geo: Geo,
  ) {
    keep(this.seatMat);
    this.things = models.people;
    const thing = (name: string) => {
      const t = models.people.get(name);
      if (!t) throw new Error(`people.glb has no ${name}`);
      return t;
    };
    // the palette: a row a person, a colour a part (its fourth number: whether he has that part at all)
    this.palette = keep(new DataTexture(this.colours, PARTS.length, ROWS, RGBAFormat, FloatType));
    this.palette.minFilter = this.palette.magFilter = NearestFilter;
    this.palette.needsUpdate = true;

    // the walkers' bodies, on the bones the player's figure has
    const figure = models.figure.get('figure');
    if (!figure?.bones) throw new Error('figure.glb: no figure');
    const slot = new Map(figure.bones.map((b, i) => [b.name, geo.order[i]]));
    this.kit = { geo, slot, count: Math.max(...geo.order) + 1 };
    this.suits = {
      official: suitOf(thing('official'), slot),
      staff: suitOf(thing('staff'), slot),
      officialFar: suitOf(thing('officialFar'), slot),
      staffFar: suitOf(thing('staffFar'), slot),
      benchFar: suitOf(thing('benchFar'), slot),
    };
    for (const s of Object.values(this.suits)) keep(s.geo);
    this.refMat = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true, side: DoubleSide }));
    this.coachMat = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true, side: DoubleSide }));
    this.benchMat = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true, side: DoubleSide }));
    this.group.add(this.walkers);

    // the chairs: each bench's, and the table crew's behind the table
    const chairs: { x: number; y: number; z: number; turn: number }[] = [];
    for (const e of [-1, 1]) for (let i = 0; i < CHAIRS; i++) chairs.push({ x: e * (CHAIR_X + i * CHAIR_GAP), y: 0, z: CHAIR_Z, turn: 0 });
    const desks = [-13.2, -8.2, -3.4, 3.4, 8.2, 13.2];
    for (const x of desks) chairs.push({ x, y: 0, z: TABLE_Z - 1.5, turn: 0 });
    this.group.add(props.chairs(chairs, this.seatMat));

    // who never changes: the table's crew, security at the far corners and the tunnels, the photographers and the ball kids on the baselines
    let n = 7;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    const add = (kind: Sitter['kind'], body: Sitter['body'], sit: string, x: number, z: number, yaw: number, big: number, tier: Sitter['tier'], side: Sitter['side'] = null) => {
      const id = 5000 + this.sitters.length * 7;
      const woman = lady(id);
      big *= woman ? 0.93 : 1;
      const wide = big * (0.94 + rnd() * 0.14) * (woman ? 0.88 : 1);
      this.sitters.push(this.sitter({ body, kind, side, id, woman, x, z, yaw, size: [wide, big, wide], sit, tier, beat: rnd() }));
    };
    for (const x of desks) add('crew', 'staff', 'desk', x, TABLE_Z - 1.5, (rnd() - 0.5) * 0.2, 0.88 + rnd() * 0.08, 2);
    for (const e of [-1, 1]) {
      add('guard', 'staff', 'guard', e * (MID + 9.2), -30.5, -e * 0.5, 0.94 + rnd() * 0.06, 1);
      add('guard', 'staff', 'guard', e * (CHAIR_X + CHAIRS * CHAIR_GAP + 1.5), CHAIR_Z - 1.2, -e * 0.2, 0.94 + rnd() * 0.06, 1);
      // (one each side of the players' tunnel, under the end's stands by the far corner)
      add('guard', 'staff', 'guard', e * (MID + 13.5), -20.5, -e * 1.2, 0.95 + rnd() * 0.06, 1);
      add('guard', 'staff', 'guard', e * (MID + 13.5), -10.5, -e * 1.9, 0.95 + rnd() * 0.06, 1);
      const out = MID + 6.3;
      for (const z of [-19, -13.5, 12, 16.5, 21])
        add('photo', 'staff', 'photo0', e * (out + rnd() * 0.5), z + rnd(), -e * Math.PI * 0.5 + (rnd() - 0.5) * 0.3, 0.86 + rnd() * 0.1, 1);
      for (const z of [-9, 8.5]) add('kid', 'bench', 'low', e * (out - 0.6), z + rnd(), -e * Math.PI * 0.5, 0.68 + rnd() * 0.06, 1, 0);
    }
    for (const s of this.sitters) {
      const look = lookOf(s.id);
      s.wear =
        s.kind === 'guard'
          ? plainWear(look, s.id, '#17181b', '#17181b')
          : s.kind === 'kid'
            ? { ...human(look, s.woman), warm: '#30323a', trim: '#8a8d94', cloth: '#1d1e22', shoe: '#1b1c1f' }
            : plainWear(look, s.id, s.kind === 'crew' ? SUITS[s.row % SUITS.length] : undefined);
      this.wear(s.row, s.wear);
    }
  }

  /** Someone new, sat where he sits. */
  private sitter(o: Pick<Sitter, 'body' | 'kind' | 'side' | 'id' | 'woman' | 'x' | 'z' | 'yaw' | 'size' | 'sit' | 'tier' | 'beat'> & { chair?: number }): Sitter {
    return {
      chair: -1,
      ...o,
      row: this.freeRows.pop() ?? this.rows++,
      wear: {},
      react: 'cheer',
      mode: 'sit',
      from: 0,
      until: 0,
      storm: false,
      spent: 0,
      pose: o.sit,
      next: null,
      t: 0,
      px: o.x,
      pz: o.z,
      pyaw: o.yaw,
      turn: 0,
      nod: 0,
      w: null,
      walking: false,
      drawn: false,
      to: o.sit,
      mix: 0,
      hop: 0,
      wave: 0,
      near: false,
    };
  }

  /** A row of the palette: one person's colours. */
  private wear(row: number, wear: Wear) {
    const px = this.colours;
    const c = new Color();
    PARTS.forEach((part, k) => {
      const hex = wear[part];
      c.set(hex ?? '#808080');
      px.set([c.r, c.g, c.b, hex === undefined ? 0 : 1], (row * PARTS.length + k) * 4);
    });
    this.palette.needsUpdate = true;
  }

  /** A body in a pose, with what a cast of that kind carries: worked out the first time it is asked for. */
  private pose(body: string, pose: string, carries: (typeof CARRIES)[string]): Baked {
    const key = `${body}/${pose}/${carries ?? ''}`;
    let b = this.baked.get(key);
    if (!b) {
      const made = props(carries, pose, POSES[pose]);
      b = bake(this.things.get(body)!, made.spec, made.props);
      for (const p of made.props) p.geo.dispose();
      this.baked.set(key, b);
    }
    return b;
  }

  /** The corners of the parts this look has (the hair he wears, his beard if he has one, his clothes), in a body's own order: made once for each look of each body. */
  private corners(flesh: Flesh, wear: Wear): { key: string; index: BufferAttribute } {
    const has = PARTS.map((part, k) => (wear[part] !== undefined && flesh.runs.has(k) ? k : -1)).filter((k) => k >= 0);
    const key = has.join(',');
    let index = flesh.looks.get(key);
    if (!index) {
      const all = flesh.index.array;
      const runs = has.flatMap((k) => flesh.runs.get(k)!);
      const out = new (all.constructor as Uint16ArrayConstructor | Uint32ArrayConstructor)(runs.reduce((n, r) => n + r[1], 0));
      let at = 0;
      for (const [start, count] of runs) {
        out.set(all.subarray(start, start + count), at);
        at += count;
      }
      index = new BufferAttribute(out, 1);
      flesh.looks.set(key, index);
    }
    return { key, index };
  }

  /**
   * People of body `body` and one look between pose `a` and pose `b` (the same: held in it), made the first
   * time someone is: one shape, drawn once for all who are in it. Its points are the body's (every cast of a
   * body in a pose shares them); its corners are the look's parts only.
   */
  private cast(body: string, a: string, b: string, wear: Wear, seen: number): Cast {
    const thing = this.things.get(body);
    if (!thing) throw new Error(`people.glb has no ${body}`);
    const carries = CARRIES[a] ?? CARRIES[b];
    const fkey = `${body}/${carries ?? ''}`;
    let flesh = this.flesh.get(fkey);
    if (!flesh) {
      const made = props(carries, a, POSES[a]);
      flesh = fleshOf(thing, made.props);
      for (const p of made.props) p.geo.dispose();
      this.flesh.set(fkey, flesh);
    }
    const look = this.corners(flesh, wear);
    const key = `${body}/${a}>${b}/${look.key}/${seen}`;
    let c = this.casts.get(key);
    if (c) return c;
    const [from, to] = [this.pose(body, a, carries), this.pose(body, b, carries)];
    const geo = this.keep(new BufferGeometry());
    geo.setAttribute('position', from.position);
    geo.setAttribute('normal', from.normal);
    geo.setAttribute('aTo', to.position);
    geo.setAttribute('aToN', to.normal);
    geo.setAttribute('color', flesh.color);
    geo.setAttribute('aPart', flesh.part);
    geo.setAttribute('aHead', flesh.head);
    geo.setIndex(look.index);
    const mat = this.keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true, side: DoubleSide }));
    if (this.castMats.length) mat.color.copy(this.castMats[0].color);
    const uniforms = {
      uPalette: { value: this.palette },
      uTime: this.time,
      uNeck: { value: [from.neck, to.neck] },
      uUp: { value: [from.up, to.up] },
      uSide: { value: [from.side, to.side] },
      uHips: { value: [from.hips, to.hips] },
      uHand: { value: [from.hand, to.hand] },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>${CAST_HEAD}`)
        .replace('#include <color_vertex>', `#include <color_vertex>${CAST_COLOR}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>${CAST_NORMAL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${CAST_MOVE}`);
    };
    mat.customProgramCacheKey = () => 'cast2';
    this.castMats.push(mat);
    const row = new InstancedBufferAttribute(new Float32Array(ROWS), 1);
    const life = new InstancedBufferAttribute(new Float32Array(ROWS * 4), 4);
    const mix = new InstancedBufferAttribute(new Float32Array(ROWS), 1);
    for (const at of [row, life, mix]) at.setUsage(DynamicDrawUsage);
    geo.setAttribute('aRow', row);
    geo.setAttribute('aLife', life);
    geo.setAttribute('aMix', mix);
    const mesh = this.keep(new InstancedMesh(geo, mat, ROWS));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    this.group.add(mesh);
    c = { mesh, row, life, mix, n: 0, seen };
    this.casts.set(key, c);
    return c;
  }

  /** The building's colour: the benches' chairs. */
  paint(board: string) {
    this.seatMat.color.set(board).multiplyScalar(0.75);
  }

  /** A walker of this body. */
  private walker(suit: Suit, body: Body, dress: MatchKit, id: number, look: Look, wear: Wear, mat: MeshStandardMaterial, low?: Suit): Walker {
    const w = new Walker(this.kit, suit, body, dress, id, look, wear, mat, low);
    this.walkers.add(w.fig.group, w.fig.shadow);
    return w;
  }

  private drop(w: Walker) {
    this.walkers.remove(w.fig.group, w.fig.shadow);
    w.dispose();
  }

  /** Tonight's kits: the benches in their warm-ups, the coaches' ties, the ball kids in the home colour. The referees and the coaches are made here, the first time. */
  dress(kits: [MatchKit, MatchKit]) {
    this.kits = kits;
    this.benchKey = '';
    for (const s of [...this.sitters, ...this.bench]) {
      if (s.w) this.drop(s.w);
      s.w = null;
      s.walking = false;
      if (s.kind !== 'kid') continue;
      s.wear = { ...benchWear(lookOf(s.id), kits[0], s.woman), warm: kits[0].color, cloth: '#1d1e22' };
      this.wear(s.row, s.wear);
    }
    for (const s of this.bench) this.freeRows.push(s.row);
    this.bench = [];
    for (const w of this.walking) this.drop(w);
    this.mine = null;
    this.refs = [0, 1, 2].map((i) => {
      const id = 7001 + i * 13;
      const woman = lady(id);
      const body = { s: (0.88 + 0.05 * hash(id, 3)) * (woman ? 0.94 : 1), bulk: (0.96 + 0.14 * hash(id, 5)) * (woman ? 0.86 : 1) };
      return this.walker(this.suits.official, body, kits[0], id, lookOf(id), { ...human(lookOf(id), woman), ...REF_WEAR }, this.refMat, this.suits.officialFar);
    });
    this.coaches = ([0, 1] as const).map((side) => {
      const id = 7101 + side * 17;
      const woman = lady(id);
      const body = { s: (0.9 + 0.05 * hash(id, 3)) * (woman ? 0.94 : 1), bulk: (1 + 0.16 * hash(id, 5)) * (woman ? 0.84 : 1) };
      const w = this.walker(this.suits.staff, body, kits[side], id, lookOf(id), suitWear(lookOf(id), id, kits[side]), this.coachMat, this.suits.staffFar);
      // (his board: a white sheet on a dark clip board, in his left hand)
      const board = new Mesh(
        this.keep(new BoxGeometry(0.72, 0.95, 0.035)),
        [0, 1, 2, 3, 4, 5].map((k) => this.keep(new MeshStandardMaterial({ color: k === 4 ? 0xe8e6df : 0x2a2c31, roughness: 0.7 }))),
      );
      board.position.set(0.02, -0.55, 0.16);
      board.rotation.set(-0.5, 0, 0);
      board.visible = false;
      w.hold(board, 'hal');
      // (the two never in step: each moves and calls out on his own clock)
      return { w, side, spot: (side ? 1 : -1) * 21, move: side * 2300, call: 4000 + side * 2900, board };
    });
    this.walking = [...this.refs, ...this.coaches.map((c) => c.w)];
    for (const w of this.walking) w.lite(this.level >= 2);
  }

  /**
   * Who is on each bench now: the assistants in the first chairs, then the players (their own looks, when the
   * page says who they are), each keeping his chair for as long as he is on the bench. A man who was on the
   * floor a moment ago walks to his chair from where he stood.
   */
  private seat(bench: [number[], number[]] | undefined, on: ReadonlySet<number>) {
    const key = bench ? `${bench.map((b) => b.join()).join('/')}|${[...on].sort().join()}` : '-';
    if (key === this.benchKey || !this.kits) return;
    this.benchKey = key;
    const was = new Map(this.bench.map((s) => [s.id, s]));
    const next: Sitter[] = [];
    const back: [Sitter, number][] = [];
    for (const side of [0, 1] as const) {
      const e = side ? 1 : -1;
      const kit = this.kits[side];
      // (the page's bench, less whoever is on the floor; with none, seven made-up men)
      const pids = (bench?.[side].filter((pid) => !on.has(pid)) ?? Array.from({ length: 7 }, (_, i) => 8000 + side * 100 + i)).slice(0, CHAIRS - AIDES);
      const ids = [7200 + side * 10, 7201 + side * 10, ...pids];
      const taken = new Set(ids.map((id) => was.get(id)?.chair ?? -1));
      let free = 0;
      ids.forEach((id, i) => {
        const aide = i < AIDES;
        let s = was.get(id);
        if (!s) {
          while (taken.has(free)) free++;
          taken.add(free);
          const woman = aide && lady(id);
          const big = (aide ? 0.9 + 0.06 * hash(id, 3) : 0.97 + 0.1 * hash(id, 3)) * (woman ? 0.94 : 1);
          const wide = big * (aide ? 1 + 0.14 * hash(id, 5) : 0.94 + 0.14 * hash(id, 5)) * (woman ? 0.86 : 1);
          s = this.sitter({
            body: aide ? 'staff' : 'bench',
            kind: aide ? 'aide' : 'bench',
            side,
            id,
            woman,
            x: e * (CHAIR_X + free * CHAIR_GAP),
            z: CHAIR_Z,
            yaw: (hash(id, 13) - 0.5) * 0.3 - e * 0.08,
            size: [wide, big, wide],
            sit: aide ? (i ? 'lean' : 'watch') : SITS[Math.floor(hash(id, 7) * SITS.length)],
            tier: 0,
            beat: hash(id, 17),
            chair: free,
          });
          const look = lookOf(id);
          s.wear = aide ? suitWear(look, id, kit) : benchWear(look, kit);
          this.wear(s.row, s.wear);
          // (off the floor this moment: he is where he stood, on his feet, and his chair is where he is going)
          const from = this.lastAt.get(id);
          if (from && !aide && this.level < 2) {
            s.pose = 'stand';
            s.pyaw = Math.atan2(s.x - from[0], s.z - from[1]);
            s.px = from[0] - Math.sin(s.pyaw) * UP_OUT;
            s.pz = from[1] - Math.cos(s.pyaw) * UP_OUT;
            s.spent = this.clock + SPENT_MS;
            back.push([s, (Math.hypot(s.x - from[0], s.z - from[1]) / BENCH_PACE) * 1000]);
          }
        }
        was.delete(id);
        next.push(s);
      });
    }
    // (the men either side of a chair put a hand up to him as he comes along to it: about when he gets to them)
    for (const [b, walk] of back)
      for (const n of next)
        if (n.side === b.side && n.kind === 'bench' && n.mode === 'sit' && n !== b && Math.abs(n.chair - b.chair) <= 2 && hash(n.id, b.id) < 0.75) {
          n.mode = 'greet';
          n.from = this.clock + walk - 700 + hash(n.id, b.id + 3) * 400;
          n.until = n.from + 1500;
        }
    // (whoever has left the bench: on the floor now, or gone from the page's list)
    for (const s of was.values()) {
      if (s.w) this.drop(s.w);
      this.freeRows.push(s.row);
    }
    this.bench = next;
    this.all = [...this.sitters, ...this.bench];
  }

  /** How much of their light the benches keep (the coaches with them): the men on the floor by the far sideline stand out from their own bench. */
  dim(bench: number) {
    // (not as far down as the scene asks: their warm-ups already set them apart from the men on the floor)
    for (const m of this.castMats) m.color.setScalar(0.5 + 0.5 * bench);
    this.coachMat.color.setScalar(0.6 + 0.4 * bench);
    this.benchMat.color.setScalar(0.5 + 0.5 * bench);
  }

  /**
   * A device that can't keep up (the scene's steps): at 1 a sitter has to be twice as big in the picture for
   * his near body; from 2 everyone is his far body (the referees and the coaches too), nobody works the baselines, the heads hold still,
   * and nobody off the bench walks anywhere (they slide the few feet to the huddle as poses, and the men on
   * the floor are left to the play); at 3 the table is empty and the benches stay sat.
   */
  shed(level: number) {
    this.level = level;
    if (level >= 2) this.detours.clear();
    for (const w of this.walking) w.lite(level >= 2);
  }

  /**
   * The floor's mirror is being drawn (arena.ts), or has been: what the varnish shows of the people behind the
   * baselines and the table is nothing worth drawing them twice for. The benches and the walkers stay in it,
   * each in his far body (a mirror that soft shows no more of him).
   */
  mirrored(on: boolean) {
    for (const c of this.casts.values()) c.mesh.visible = c.n > 0 && c.seen !== (on ? SEEN.camera : SEEN.mirror);
    for (const w of this.walking) w.mirrored(on);
    for (const s of this.bench) s.w?.mirrored(on);
  }

  /**
   * One of the ten, as the scene is about to place him (where the play has him, the way he faces): a man the
   * sideline has on a way of its own for a moment (on from the table, over toward his bench at a timeout) is
   * put on it instead, and given back to the play when he has got to where it has him. `cut`: the play has put
   * everyone on fresh spots (a new period, a skip), so nobody is on his way anywhere.
   */
  lead(pid: number, end: { x: number; z: number; yaw: number }, quiet = false, cut = false) {
    if (cut) {
      this.detours.delete(pid);
      return;
    }
    let d = this.detours.get(pid);
    if (!d && !quiet && this.level < 2 && !this.lastAt.has(pid)) {
      // (new to the floor, and off the bench a moment ago: he runs on from the table's end, on his bench's side)
      const s = this.bench.find((b) => b.id === pid && b.kind === 'bench');
      if (s) this.detours.set(pid, (d = { x: (s.side ? 1 : -1) * TABLE_END, z: ON_Z, to: null, pace: 17 }));
    }
    if (!d) return;
    const [gx, gz] = d.to ?? [end.x, end.z];
    const dx = gx - d.x;
    const dz = gz - d.z;
    const far = Math.hypot(dx, dz);
    const step = Math.min(far, d.pace * this.sec);
    if (far > 1e-3) {
      d.x += (dx / far) * step;
      d.z += (dz / far) * step;
    }
    if (far - step < 0.4) {
      if (!d.to) {
        this.detours.delete(pid);
        return;
      }
    } else end.yaw = Math.atan2(dx, dz);
    end.x = d.x;
    end.z = d.z;
  }

  /** A signal from a referee, now or in a while. */
  private signal(w: Walker | undefined, id: Gesture, after = 0) {
    if (!w) return;
    if (after <= 0) w.cue(id);
    else this.later.push({ w, id, at: this.clock + after });
  }

  /** The referee nearest a spot. */
  private nearest(x: number, z: number, of: Walker[] = this.refs): Walker | undefined {
    let best: Walker | undefined;
    let d = Infinity;
    for (const w of of) {
      const far = Math.hypot(w.x - x, w.z - z);
      if (far < d) [d, best] = [far, w];
    }
    return best;
  }

  /** Something happened, for `side`'s team (a foul: against it): the benches and the coaches take it their own ways. */
  private happen(what: Moment, side: 0 | 1) {
    const big = what === 'three' || what === 'dunk' || what === 'and1' || what === 'block' || what === 'buzzer';
    // (a few get up for it; as many again lean in where they sit)
    const share = what === 'buzzer' ? 1 : what === 'dunk' ? 0.45 : what === 'and1' ? 0.4 : what === 'three' ? 0.3 : what === 'block' ? 0.25 : 0;
    this.n++;
    for (const s of this.bench) {
      if (s.kind !== 'bench' || s.walking || this.level > 2) continue;
      const r = hash(s.id, this.n);
      if (big && s.side === side && r < Math.min(1, share * 2)) {
        // (each in his own time, and for his own while: along the bench from the table, one after another)
        s.mode = 'up';
        s.from = this.clock + hash(s.id, this.n + 50) * 650 + s.chair * 45;
        s.until = s.from + 1500 + hash(s.id, this.n + 70) * 2600 + (what === 'buzzer' ? 2500 : 0);
        s.react = r < share ? UPS[Math.floor(hash(s.id, this.n + 9) * UPS.length)] : 'lean';
      } else if (s.side !== side && s.mode === 'sit' && ((big && r < 0.22) || (what === 'turnover' && r > 0.9))) {
        s.mode = 'down';
        s.from = this.clock + 200 + hash(s.id, this.n + 50) * 500;
        s.until = s.from + 2200 + r * 3000;
      }
    }
    for (const c of this.coaches) {
      const r = hash(c.w.id, this.n);
      const mine = c.side === side;
      if (what === 'foul') {
        // (the whistle went against his team)
        if (mine && r < 0.6) c.w.cue(r < 0.3 ? 'protest' : 'coachWide');
      } else if (what === 'timeout') continue;
      else if (what === 'turnover') {
        if (mine && r < 0.5) c.w.cue(r < 0.25 ? 'head' : 'coachWide');
        else if (!mine && r < 0.3) c.w.cue('clap');
      } else if (mine) {
        if (big) this.signal(c.w, r < 0.5 ? 'fist' : 'clap', 120 + hash(c.w.id, this.n + 3) * 600);
        else if (r < 0.25) this.signal(c.w, 'clap', 200 + hash(c.w.id, this.n + 3) * 700);
      } else if (big && r < 0.4) this.signal(c.w, r < 0.2 ? 'coachWide' : 'coachCalm', 300 + hash(c.w.id, this.n + 3) * 700);
      c.call = Math.max(c.call, this.clock + 2500);
    }
  }

  /** The whistle has gone: the ball is a referee's (tossed to him from wherever it is). */
  private take(w: Walker | undefined, a: Around) {
    if (!w || this.mine || this.level >= 2) return;
    for (const r of this.refs) r.has = false;
    this.mine = { w, phase: 'to', t: 0, ms: 380 + 14 * Math.hypot(w.x - a.ball.x, w.z - a.ball.z), from: a.ball.clone(), pid: -1, bounce: false };
  }

  /** The referee with the ball gives it to a player: handed or tossed, or bounced to the man at the line. */
  private give(pid: number, a: Around, bounce = false, quick = false) {
    const m = this.mine;
    const f = a.figs.get(pid);
    if (!m || m.phase === 'give' || m.phase === 'up' || !f) return;
    const far = Math.hypot(m.w.x - f.pup.x, m.w.z - f.pup.z);
    m.w.has = false;
    m.phase = 'give';
    m.t = 0;
    m.ms = quick ? 120 : bounce ? clamp(300 + 26 * far, 420, 820) : clamp(240 + 20 * far, 300, 700);
    m.from.copy(a.ball);
    m.pid = pid;
    m.bounce = bounce;
    m.w.cue(bounce ? 'refBounce' : 'refHand', 200);
  }

  /**
   * What the plan says happened since the last frame: a new move of the possession (a whistle, a shot going
   * up, a turnover, a timeout), a basket going down, a change of the five. The referees signal it and take the
   * ball or give it, the benches and the coaches take it their own ways.
   */
  private read(a: Around, e: number) {
    const { script: sc, play } = a.stage;
    if (!sc || !play) return;
    const fresh = sc !== this.script;
    const i = Math.min(play.i, sc.frames.length - 1);
    const nO = sc.oPids.length;
    const off = sc.off;
    const def = (1 - off) as 0 | 1;
    const b = play.b;
    const pids = [...sc.oPids, ...sc.dPids];
    if (fresh) {
      // (a ball that comes in from out of bounds with nobody to hand it over: the nearest of them shows where)
      const start = toWorld(sc.frames[0].ball, sc.dir);
      if (!this.mine && (Math.abs(sz(start)) > HALF_W - 0.5 || Math.abs(sx(start)) > MID - 0.5)) this.signal(this.nearest(sx(start), sz(start)), 'refHand');
    }
    if (fresh || i !== this.move) {
      // (the timeout is over: the men who went toward their benches come back)
      if (this.timeout) {
        this.timeout = false;
        for (const d of this.detours.values()) if (d.to) [d.to, d.pace] = [null, 16];
      }
      this.script = sc;
      this.move = i;
      const fl = b.flash;
      const at = this.nearest(a.ball.x, a.ball.z);
      const point = (toward: number, w = at) => (w && Math.cos(w.pup.yaw) * toward > 0 ? 'refPointL' : 'refPointR');
      const lead = this.refs[e < 0 ? 0 : 1];
      if (fl?.kind === 'foul' || fl?.text === 'And one!') {
        const offensive = b.foul !== undefined && b.foul < nO;
        const line = sc.frames.slice(i).some((f) => f.act.includes('ft'));
        this.signal(at, 'refFoul');
        this.signal(at, offensive ? point(-e) : line ? 'refTwo' : point(e), 1500);
        this.happen(fl.text === 'And one!' ? 'and1' : 'foul', fl.text === 'And one!' ? off : offensive ? off : def);
        this.whistle = this.clock + 1800;
        // (to the line: the lead has it, under the basket; else whoever is nearest)
        this.take(line ? lead : at === this.refs[2] || !at ? this.nearest(a.ball.x, a.ball.z, [this.refs[0], this.refs[1]]) : at, a);
      } else if (fl?.kind === 'to') {
        if (fl.text !== 'Steal') {
          this.signal(at, point(-e));
          this.whistle = this.clock + 1500;
          this.take(at, a);
        }
        this.happen('turnover', off);
      } else if (fl?.kind === 'block') this.happen('block', def);
      else if (fl?.text.startsWith('Timeout')) {
        this.signal(this.refs[2], 'refTimeout');
        this.huddle = this.clock + 2600;
        this.whistle = this.clock + 1500;
        this.take(at, a);
        // (the five on the floor start for their benches: as far as the break lets them get)
        if (this.level < 2) {
          this.timeout = true;
          pids.forEach((pid, j) => {
            const f = a.figs.get(pid);
            if (!f) return;
            const side = (j < nO ? off : def) as 0 | 1;
            const k = j < nO ? j : j - nO;
            this.detours.set(pid, { x: f.pup.x, z: f.pup.z, to: [(side ? 1 : -1) * (HUDDLE_X - 4 + k * 2), -(HALF_W - 3.5) + (k % 2) * 1.6], pace: 7.5 });
          });
        }
      } else if (this.mine && this.mine.phase !== 'give' && !a.line && b.hold !== undefined && b.hold >= 0) {
        // (the play goes on: whoever has it next is handed it)
        this.give(pids[b.hold], a);
      }
      // a three going up: the nearer of the slot and the trail has an arm in the air
      b.act.forEach((act, j) => {
        if (j >= nO || act !== 'jumper') return;
        const from = play.a.o[j];
        if (Math.hypot(from.x - BASKET.x, from.y - BASKET.y) < 22.4) return;
        const w = toWorld(from, sc.dir);
        this.signal(this.nearest(sx(w), sz(w), [this.refs[e < 0 ? 1 : 0], this.refs[2]]), 'refThree');
      });
    }
    // the man at the line: the lead bounces it to him as he sets his feet (and he has it before it goes up, whatever happened)
    if (this.mine && this.mine.phase !== 'give') {
      const j = b.act.indexOf('hold');
      const next = sc.frames[i + 1];
      const shooter = b.act.findIndex((x) => x === 'ft' || x === 'release');
      if (j >= 0 && next?.act[j] === 'ft' && play.u > 0.3) this.give(pids[j], a, true);
      else if (shooter >= 0) this.give(pids[shooter], a, false, true);
    }
    // a basket, once, as it goes down
    const key = `${this.move}`;
    if (b.fx === 'make' && play.u >= 0.86 && (fresh || this.made !== key) && !a.line) {
      this.made = key;
      const three = b.flash?.text === '+3';
      const dunk = play.a.act.includes('dunk') || b.act.includes('dunk');
      if (three) this.signal(this.refs[2], 'refGood');
      this.happen(sc.moment ? 'buzzer' : dunk ? 'dunk' : three ? 'three' : 'make', off);
    } else if (b.fx !== 'make') this.made = '';
  }

  /**
   * One frame: the referees to their places for this moment of the play, the coaches about their boxes,
   * everyone sat or stood as the game has him. Says whether the ball is the referees' this frame (in a hand,
   * or on its way to one or from one): it is then where they have put it, and no player's hands are on it.
   */
  update(a: Around): boolean {
    if (!this.kits) return false;
    const { script: sc, play } = a.stage;
    const live = !!(sc && play);
    if (!a.calm) this.time.value += a.real / 1000;
    this.clock += a.own;
    this.sec = a.own / 1000;
    this.bodyOf = a.body;
    // (a replay's men are not men coming off the floor)
    if (a.cut || a.replay) this.lastAt.clear();
    this.seat(a.bench, new Set(a.figs.keys()));
    // (where each of the ten is: a man who leaves the floor walks off from there)
    this.lastAt.clear();
    for (const [pid, f] of a.figs) this.lastAt.set(pid, [f.pup.x, f.pup.z, f.side]);
    for (const pid of this.detours.keys()) if (!a.figs.has(pid)) this.detours.delete(pid);
    // which end the play is going at, and whether it is a play at all
    const rim = sc ? sx(toWorld(BASKET, sc.dir)) : 0;
    const e = rim < 0 ? -1 : 1;
    this.deadMs = live ? 0 : this.deadMs + a.own;
    const tip = !live && a.stage.standers.length === 10 && !!a.stage.ball && Math.abs(a.stage.ball.y - MID) < 0.01 && Math.abs(a.stage.ball.x) < 0.01;
    const g = a.game;
    this.late = a.clutch || (!!g && g.q >= 4 && g.clock <= LATE_S && Math.abs(g.score[0] - g.score[1]) <= LATE_BY);
    if (a.final !== undefined && !this.over) {
      this.over = true;
      this.n++;
      this.detours.clear();
      const o = a.occasion ?? 'win';
      // (an ordinary win: up and clapping; a playoff one: towels going round; a late winner, a series, a title: out onto the floor)
      const storm = o === 'late' || o === 'clinch' || o === 'title';
      const ups = o === 'win' ? (['clap', 'clap', 'clap', 'cheer'] as const) : o === 'playoff' ? (['towel', 'cheer', 'towel', 'clap'] as const) : UPS;
      for (const s of this.bench) {
        if (s.kind !== 'bench') continue;
        const won = s.side === a.final;
        s.mode = won ? 'up' : hash(s.id, this.n) < (o === 'win' ? 0.25 : 0.6) ? 'down' : 'sit';
        s.from = this.clock + hash(s.id, this.n + 50) * (storm ? 450 : 900);
        s.until = Infinity;
        s.storm = won && storm;
        if (won) s.react = ups[Math.floor(hash(s.id, this.n + 9) * ups.length)];
      }
      this.shake = this.clock + SHAKE_AFTER[o];
      for (const c of this.coaches) this.signal(c.w, c.side === a.final ? (o === 'win' ? 'clap' : 'fist') : 'head', hash(c.w.id, this.n) * 500);
    } else if (a.final === undefined && this.over) {
      this.over = false;
      this.shook = false;
      for (const s of this.bench) {
        s.until = 0;
        s.storm = false;
      }
    }
    if (a.cut || a.replay) {
      // (another moment has the picture: the ball is wherever that moment has it)
      this.mine = null;
      this.detours.clear();
      this.timeout = false;
      if (!tip) for (const w of this.refs) w.has = false;
    }
    if (!a.replay && !a.calm && a.final === undefined) this.read(a, e);
    // (a break in the play that lasts is a huddle too: the ten go over to their benches for it)
    const rest = !live && !tip && a.final === undefined && this.deadMs > 1200;
    if (rest) {
      this.huddle = Math.max(this.huddle, this.clock + 400);
      if (this.level < 2 && !a.replay && !a.cut) {
        const n: [number, number] = [0, 0];
        for (const st of a.stage.standers) {
          const f = a.figs.get(st.pid);
          const k = n[st.side]++;
          if (!f || this.detours.get(st.pid)?.to) continue;
          const ang = (k - 2) * 0.5;
          this.detours.set(st.pid, { x: f.pup.x, z: f.pup.z, to: [(st.side ? 1 : -1) * HUDDLE_X + Math.sin(ang) * 4.6, HUDDLE_Z + 2.6 + Math.cos(ang) * 2.4], pace: 7.5 });
        }
      }
    } else if (live && !this.timeout) for (const d of this.detours.values()) if (d.to) [d.to, d.pace] = [null, 16];
    const huddle = this.clock < this.huddle && a.final === undefined;
    for (let k = this.later.length - 1; k >= 0; k--)
      if (this.clock >= this.later[k].at) {
        this.later[k].w.cue(this.later[k].id);
        this.later.splice(k, 1);
      }

    this.officiate(a, live, tip, e);
    this.coach(a, live, huddle);
    const taken = this.carry(a, live);
    for (const w of this.walking) w.place(w.has ? a.ball : null);
    this.sit(a, live, huddle);
    return taken;
  }

  /** The ball while it is the referees': to a hand, in it, from it to a player's. */
  private carry(a: Around, live: boolean): boolean {
    const ball = a.ball;
    const m = this.mine;
    if (!m) {
      // (the tip's, held for the toss)
      const w = this.refs.find((r) => r.has);
      if (!w) return false;
      const at = w.pup.carry(TMP);
      ball.set(at.x, at.y, at.z);
      return true;
    }
    if (m.phase === 'held') {
      const at = m.w.pup.carry(TMP);
      ball.set(at.x, at.y, at.z);
      // (a play that has started with it still in his hands: the man who has it there gets it)
      const sc = a.stage.script;
      const play = a.stage.play;
      if (live && sc && play && !a.line) {
        const hold = play.b.hold ?? play.a.hold;
        const fl = play.b.flash;
        const stopped = fl?.kind === 'foul' || fl?.text === 'And one!' || (fl?.kind === 'to' && fl.text !== 'Steal') || !!fl?.text.startsWith('Timeout');
        if (!stopped && hold !== undefined && hold >= 0) this.give([...sc.oPids, ...sc.dPids][hold], a);
      }
      return true;
    }
    m.t = Math.min(1, m.t + a.own / m.ms);
    const u = smooth(m.t);
    if (m.phase === 'up') {
      // (it leaves his hands a moment into the toss, and is over the middle of the circle at its top)
      const k = clamp((m.t - 0.25) / 0.75, 0, 1);
      ball.set(m.from.x * (1 - k), m.from.y + (11.5 - m.from.y) * Math.sin(k * Math.PI * 0.5), m.from.z * (1 - k));
      const sc = a.stage.script;
      if (m.t >= 1 && sc) {
        const first = sc.frames.find((f) => f.hold !== undefined && f.hold >= 0)?.hold;
        m.phase = 'held';
        if (first === undefined) this.mine = null;
        else this.give([...sc.oPids, ...sc.dPids][first], a);
      } else if (m.t >= 1) this.mine = null;
      return true;
    }
    if (m.phase === 'to') {
      const to = m.w.hands(HAND);
      ball.lerpVectors(m.from, to, u);
      ball.y += Math.sin(Math.PI * m.t) * Math.min(3, 0.6 + 0.07 * m.from.distanceTo(to));
      if (m.t >= 1) {
        m.phase = 'held';
        m.w.has = true;
      }
      return true;
    }
    const f = a.figs.get(m.pid);
    if (!f) {
      this.mine = null;
      return false;
    }
    const to = f.pup.carry(TMP2);
    // (a hand that isn't holding anything yet is no place to send it: his chest then)
    if (!(to.y > 1.5)) f.pup.world(0, 3.6 * f.pup.body.s, 0.9 * f.pup.body.s, to);
    ball.set(m.from.x + (to.x - m.from.x) * u, m.from.y + (to.y - m.from.y) * u, m.from.z + (to.z - m.from.z) * u);
    if (m.bounce) {
      // (down to the floor a little past half way, and up into his hands)
      const k = 0.56;
      ball.y = m.t < k ? m.from.y + (BALL_R - m.from.y) * Math.pow(m.t / k, 1.5) : BALL_R + (to.y - BALL_R) * Math.sin(((m.t - k) / (1 - k)) * Math.PI * 0.5);
      ball.x = m.from.x + (to.x - m.from.x) * m.t;
      ball.z = m.from.z + (to.z - m.from.z) * m.t;
    } else ball.y += Math.sin(Math.PI * m.t) * 0.3;
    if (m.t >= 1) {
      this.mine = null;
      return false;
    }
    return true;
  }

  /** The referees: the lead down the far side and behind the baseline, the slot along the far sideline, the trail behind the play; at the table when nothing is on. */
  private officiate(a: Around, live: boolean, tip: boolean, e: number) {
    const ball = a.ball;
    const refs = this.refs;
    const look: V3 = { x: ball.x, y: Math.max(3, ball.y), z: ball.z };
    const face = (w: Walker) => Math.atan2(ball.x - w.x, ball.z - w.z);
    if (!live) {
      // the tip: one of them in the circle between the two who jump, the ball in his hands; the other two back by the far sideline
      if (tip) {
        this.tipped = true;
        this.mine = null;
        refs[0].has = true;
        refs[0].go(0, -2.3, 0, REF_PACE, 'stand', a, { cut: a.cut || this.deadMs <= a.own, clear: false });
        refs[1].go(-21, -22.8, face(refs[1]), REF_PACE, 'stand', a, { look, rest: true, cut: a.cut || this.deadMs <= a.own });
        refs[2].go(19, -22.8, face(refs[2]), REF_PACE, 'stand', a, { look, rest: true, cut: a.cut || this.deadMs <= a.own });
      } else {
        // a dead ball left on the floor: the nearest of them goes and picks it up, and keeps it
        const loose = !this.mine && !a.held && a.final === undefined && this.deadMs > PICK_AFTER && ball.y < 0.8 && this.level < 2;
        const picker = loose ? this.nearest(ball.x, ball.z) : undefined;
        refs.forEach((w, k) => {
          if (w === picker) {
            w.go(ball.x - 0.9, ball.z - 0.9, face(w), REF_PACE * 0.6, 'stand', a, { look, cut: a.cut });
            if (Math.hypot(w.x - ball.x, w.z - ball.z) < 2.2) this.take(w, a);
          } else w.go(IDLE[k][0], IDLE[k][1], w.has ? 0 : face(w), 6, 'stand', a, { look, rest: true, cut: a.cut });
        });
      }
      return;
    }
    // the play is on: the tip is tossed, and the man who tossed it backs out of the circle
    if (this.tipped) {
      this.tipped = false;
      if (refs[0].has) {
        refs[0].has = false;
        refs[0].cue('refToss', 100);
        this.tipBack = this.clock + 1500;
        // (straight up between the two who jump, and tapped to whoever the play starts with)
        if (this.level < 2 && !a.cut) this.mine = { w: refs[0], phase: 'up', t: 0, ms: 560, from: ball.clone(), pid: -1, bounce: false };
      }
    }
    const bx = clamp(ball.x, -MID, MID);
    const bz = clamp(ball.z, -HALF_W, HALF_W);
    // (two of them are each the lead at his own end and the trail going the other way: nobody has to cross the
    // play when it turns round; the third has the far sideline both ways)
    const [lead, trail] = e < 0 ? [refs[0], refs[1]] : [refs[1], refs[0]];
    const slot = refs[2];
    const dead = a.stage.play!.b.act.every((x) => x === 'stand' || x === 'hold');
    const more = { look, cut: a.cut, rest: dead };
    const to = (w: Walker, x: number, z: number) => {
      if (w === refs[0] && this.clock < this.tipBack) w.go(0, -9.5, 0, 7, 'stand', a, { look, clear: false });
      else w.go(x, z, face(w), REF_PACE, 'stand', a, more);
    };
    // the lead: ahead of the play down the far side, round the corner, and along behind the baseline on that side
    // of the basket (out of bounds at the end he hides nothing, and nothing of him is ever in front of the play; at
    // a free throw, in by the lane, where he bounces the ball out to the man at the line)
    const there = e * lead.x > MID - 7;
    const lz = a.line ? -5.2 : -clamp(8 + 0.4 * Math.max(0, -bz), 8, 15);
    to(lead, e * (there ? MID + 2.2 : MID - 2.5), there ? lz : LANE_Z);
    // the slot: the far sideline, level with the free-throw line or with the ball
    to(slot, e * (a.line ? 24 : clamp(e * bx + 3, -38, 27)), -23.4);
    // the trail: behind the play on the far half of the floor (when it turns round he is the lead, and runs ahead of
    // it: never down the near side, between the camera and the men), no nearer the basket than the top of the arc; he
    // comes up from his own baseline once the ball has come out past him
    const back = clamp(e * bx - 13, -(MID + 2.2), 15);
    const out = back < -(MID - 1.5);
    to(trail, a.line ? e * 15 : e * back, a.line ? -10 : out ? clamp(trail.z, -15, -8) : clamp(-7 + bz * 0.4, -15, -3));
    // (the count, while a team brings it up its backcourt)
    if (a.held && !dead && e * bx < -6 && this.clock > this.count && !this.mine) {
      trail.cue('refCount', 300);
      this.count = this.clock + 1500;
    }
  }

  /** The coaches: about their boxes with the play, down in a crouch late in a close one, calling out, taking the huddle with their boards. */
  private coach(a: Around, live: boolean, huddle: boolean) {
    const ball = a.ball;
    const look: V3 = { x: ball.x, y: Math.max(3, ball.y), z: ball.z };
    for (const c of this.coaches) {
      const w = c.w;
      const E = c.side ? 1 : -1;
      const there = huddle && Math.hypot(w.x - E * HUDDLE_X, w.z - HUDDLE_Z) < 2.5;
      c.board.visible = there && this.level < 2;
      if (huddle) {
        // (his back to the floor, his players in front of him)
        w.go(E * HUDDLE_X, HUDDLE_Z, Math.PI, COACH_HURRY, 'stand', a, { cut: a.cut, clear: false });
        if (there && !w.pup.gesturing && this.clock > c.call) {
          w.cue((['coachBoard', 'coachBoard', 'coachPoint', 'coachCalm'] as const)[Math.floor(hash(w.id, this.n++) * 4)]);
          c.call = this.clock + 1500 + hash(w.id, this.n) * 900;
        }
        continue;
      }
      if (a.final !== undefined && this.clock > this.shake) {
        // the end: over to the other one in front of the table, and a handshake
        const tx = E * 1.25;
        const tz = BOX_Z + 1.6;
        w.go(tx, tz, -E * Math.PI * 0.5, COACH_HURRY, 'stand', a, { cut: a.cut, clear: false });
        if (!this.shook && this.coaches.every((o) => Math.hypot(o.w.x - (o.side ? 1 : -1) * 1.25, o.w.z - tz) < 0.5)) {
          this.shook = true;
          for (const o of this.coaches) o.w.cue('shake');
        }
        continue;
      }
      // where in his box: toward the end the ball is at, a new spot every few seconds
      if (this.clock > c.move) {
        c.spot = E * clamp(E * ball.x * 0.3 + 23 + (hash(w.id, this.n++) - 0.5) * 5, BOX[0], BOX[1]);
        c.move = this.clock + 3500 + hash(w.id, this.n) * 5000;
      }
      const down = this.late && live && !a.line && a.final === undefined;
      const yaw = Math.atan2(ball.x - w.x, ball.z - w.z);
      w.go(c.spot, BOX_Z, yaw, COACH_PACE, down ? 'defend' : 'stand', a, { look, rest: !live || a.line, cut: a.cut, clear: false });
      if (down && !w.pup.gesturing) w.cue('coachCrouch', 400);
      // now and then he has something to say to them: more when they're defending
      if (live && !down && a.final === undefined && this.clock > c.call && !w.pup.gesturing) {
        const defending = a.stage.script!.off !== c.side;
        const r = hash(w.id, this.n++);
        w.cue(defending ? (r < 0.4 ? 'coachPoint' : r < 0.7 ? 'coachShout' : 'coachCalm') : r < 0.4 ? 'coachWave' : r < 0.7 ? 'coachPoint' : 'clap');
        c.call = this.clock + (defending ? 4500 : 7000) + r * 6000;
      }
    }
  }

  /** The pose he should be in next, on his way from the one he is in to the one he wants: up off a chair, or down onto one, a step at a time. */
  private step(from: string, want: string): string {
    const [h, to] = [HEIGHT[from], HEIGHT[want]];
    if (h === undefined || to === undefined || h === to) return want;
    if (h < to) return h === 0 ? 'rise1' : h === 1 ? 'rise2' : want;
    return h === 3 ? 'rise2' : h === 2 ? 'rise1' : want;
  }

  /** Everyone who is a pose: who is up and who is down, who is on his way somewhere, where each head is turned; each cast's people written out to be drawn. */
  private sit(a: Around, live: boolean, huddle: boolean) {
    const ball = a.ball;
    const k = 1 - Math.exp(-a.real / 260);
    const slide = 1 - Math.exp(-a.real / 320);
    for (const s of this.all) s.drawn = false;
    const standing = this.late && a.final === undefined && this.level < 3;
    const spots: [number, number] = [0, 0];
    const walk = this.level < 2 && !a.calm;
    const looked = this.clock < this.whistle;
    // (a break: the ball kid nearest each basket is out under it with a cloth)
    const wiping = huddle && this.level < 2;
    for (const s of this.all) {
      if (s.tier > 0 && this.level > s.tier) {
        if (s.w) s.w.show(false);
        s.walking = false;
        continue;
      }
      // what he should be doing now: a pose, and where (his own seat, or a spot to stand on)
      let want = s.sit;
      let spot: Spot | null = null;
      let wave = 0;
      if (s.kind === 'bench') {
        if (s.spent && this.clock > s.spent) s.spent = 0;
        if (s.spent) want = 'rest';
        if (s.mode !== 'sit' && this.clock > s.until) s.mode = 'sit';
        const on = s.mode !== 'sit' && this.clock >= s.from;
        const E = s.side ? 1 : -1;
        if (huddle && this.level < 3) {
          // round their coach, in an arc on the bench's side of him
          const i = spots[s.side!]++;
          const ang = (i - 3) * 0.4;
          want = i % 3 === 1 ? 'hips' : 'stand';
          const x = E * HUDDLE_X + Math.sin(ang) * 6.2;
          const z = HUDDLE_Z - 0.4 - Math.cos(ang) * 3.6;
          spot = { x, z, yaw: Math.atan2(E * HUDDLE_X - x, HUDDLE_Z - z) };
        } else if (s.mode === 'up' && on) {
          want = s.react;
          wave = 1;
          if (s.storm && a.gather && this.level < 3) {
            // out onto the floor to his five: round where they are (beside and behind them, not between them and the near
            // side's cameras), facing them
            const i = s.chair + (s.side ? 11 : 0);
            const ang = Math.PI + (((i * 0.618) % 1) - 0.5) * 2.7;
            const r = STORM_R[i % 2];
            const x = a.gather.x + Math.sin(ang) * r;
            const z = Math.min(a.gather.z + Math.cos(ang) * r, HALF_W - 1);
            spot = { x, z, yaw: Math.atan2(a.gather.x - x, a.gather.z - z) };
          }
        } else if (s.mode === 'greet' && on) want = 'greet';
        else if (s.mode === 'down' && on) want = 'slump';
        // (late in a close one most of them are on their feet, the rest forward on their knees)
        else if (standing) want = hash(s.id, 61) < 0.3 ? 'hips' : hash(s.id, 61) < 0.7 ? 'stand' : 'lean';
      } else if (s.kind === 'kid') {
        const end = s.x < 0 ? -1 : 1;
        if (wiping && s.z < 0) {
          want = 'wipe';
          spot = { x: end * (MID - 7.5), z: end * 2.5, yaw: -end * Math.PI * 0.5 + 0.5 };
        }
      } else if (s.kind === 'photo') {
        // (the play comes to his end: the camera goes up to his eye)
        const near = live && Math.sign(ball.x) === Math.sign(s.x) && Math.abs(ball.x) > MID - 24;
        want = near || a.final !== undefined ? 'photo' : 'photo0';
      }

      // where the frame his poses are drawn in should be: his seat's, or the one that stands him on his spot
      const fwd = s.kind === 'bench' ? UP_OUT : 0;
      const hx = spot ? spot.x - Math.sin(spot.yaw) * fwd : s.x;
      const hz = spot ? spot.z - Math.cos(spot.yaw) * fwd : s.z;
      const hyaw = spot ? spot.yaw : s.yaw;
      const far = Math.hypot(hx - s.px, hz - s.pz);
      const feet = s.kind === 'kid' ? 'upright' : 'stand';
      if (far > 0.3 && s.body === 'bench') {
        // somewhere to go: on his feet first, then as a walker (or, on a slow device, slid there as he stands)
        want = feet;
        if (s.pose === feet && !s.next) {
          if (walk && this.kits) {
            if (!s.w) {
              const kit = this.kits[s.side ?? 0];
              const body = s.kind === 'bench' && this.bodyOf ? this.bodyOf(s.id) : { s: s.size[1], bulk: s.size[0] / s.size[1] };
              // (a few seconds on his way along the far side: the far body is all of him the broadcast shows)
              s.w = this.walker(this.suits.benchFar, body, kit, s.id, lookOf(s.id), s.wear, this.benchMat);
            }
            const w = s.w;
            if (!s.walking) {
              s.walking = true;
              w.put(s.px + Math.sin(s.pyaw) * fwd, s.pz + Math.cos(s.pyaw) * fwd);
              w.pup.yaw = s.pyaw;
            }
            const [gx, gz] = [hx + Math.sin(hyaw) * fwd, hz + Math.cos(hyaw) * fwd];
            const left = Math.hypot(gx - w.x, gz - w.z);
            w.go(gx, gz, left < 2 ? hyaw : Math.atan2(gx - w.x, gz - w.z), s.storm ? STORM_PACE : BENCH_PACE, 'stand', a, {
              look: { x: ball.x, y: 4, z: ball.z },
              clear: s.kind === 'bench' && s.spent > 0,
            });
            if (left < 0.5 && Math.abs(wrap(w.pup.yaw - hyaw)) < 0.5) {
              s.walking = false;
              [s.px, s.pz, s.pyaw] = [hx, hz, hyaw];
            }
          } else {
            s.walking = false;
            s.px += (hx - s.px) * slide;
            s.pz += (hz - s.pz) * slide;
            s.pyaw += wrap(hyaw - s.pyaw) * slide;
            if (far < 0.5) [s.px, s.pz, s.pyaw] = [hx, hz, hyaw];
          }
        }
      } else if (far > 0) [s.px, s.pz, s.pyaw] = [hx, hz, hyaw];
      if (s.w) s.w.show(s.walking);
      if (s.walking && s.w) {
        s.w.place(null);
        continue;
      }

      // from the pose he is in toward the one he wants, a step at a time
      if (!s.next && s.pose !== want) {
        s.next = this.step(s.pose, want);
        s.t = 0;
      }
      if (s.next) {
        const stepped = HEIGHT[s.pose] !== undefined && HEIGHT[s.pose] !== HEIGHT[s.next];
        s.t += a.real / (stepped ? STEP_MS : TURN_MS);
        if (s.t >= 1) {
          s.pose = s.next;
          s.next = null;
          s.t = 0;
        }
      }
      // (held in a pose that is never still: to its other end and back)
      const loop = s.next ? undefined : LOOP[s.pose];
      const to = s.next ?? loop?.[0] ?? s.pose;
      const mix = s.next ? smooth(s.t) : loop ? 0.5 - 0.5 * Math.cos((this.time.value * loop[1] + s.beat) * Math.PI * 2) : 0;

      // his head to the ball (not with it in his hands: down, or at the desk he looks where he was, until a whistle)
      const still = s.pose === 'slump' || s.pose === 'wipe' || this.level > 1;
      const keen = (s.kind === 'crew' ? (looked ? 1 : 0.6) : s.kind === 'photo' ? 0.4 : 1) * (0.5 + 0.5 * hash(s.id, 67));
      const wantTurn = still ? 0 : clamp(wrap(Math.atan2(ball.x - s.px, ball.z - s.pz) - s.pyaw) * keen, -0.95, 0.95);
      s.turn += (wantTurn - s.turn) * k;
      s.nod += ((s.kind === 'crew' ? (looked ? -0.1 : 0.14) : 0) - s.nod) * k;
      s.drawn = true;
      s.to = to;
      s.mix = mix;
      s.wave = wave && s.pose === 'cheer' && !s.next ? 1 : 0;
      s.hop = s.wave ? 0.16 * Math.abs(Math.sin(this.time.value * 7 + s.beat * 9)) : 0;
    }
  }

  /**
   * The sitters as the picture about to be drawn from `camera` wants them (the building asks, before each
   * picture: arena.ts reflect): each in the body his size in that picture calls for, the benches a second
   * time in the far body for the floor's mirror where the camera has them in the near one.
   */
  present(camera: Camera) {
    for (const c of this.casts.values()) c.n = 0;
    const persp = camera as PerspectiveCamera;
    // (how much of the picture's height a foot is, a foot from the camera)
    const scale = persp.isPerspectiveCamera ? 0.5 / Math.tan((persp.fov * Math.PI) / 360) : 0;
    const eye = camera.position;
    const [on, off] = this.level > 0 ? [NEAR_TALL_LITE, NEAR_TALL_LITE * 0.85] : NEAR_TALL;
    const put = (s: Sitter, c: Cast) => {
      const i = c.n++;
      Q.setFromAxisAngle(UP, s.pyaw);
      c.mesh.setMatrixAt(i, M.compose(AT.set(s.px, s.hop, s.pz), Q, SIZE.set(s.size[0], s.size[1], s.size[2])));
      c.row.array[i] = s.row;
      c.mix.array[i] = s.mix;
      const life = c.life.array;
      life[i * 4] = s.turn;
      life[i * 4 + 1] = s.nod;
      life[i * 4 + 2] = s.beat;
      life[i * 4 + 3] = s.wave;
    };
    for (const s of this.all) {
      if (!s.drawn) continue;
      const tall = (MAN_FT * s.size[1] * scale) / Math.max(1, Math.hypot(eye.x - s.px, eye.y - 3, eye.z - s.pz));
      s.near = this.level < 2 && tall > (s.near ? off : on);
      // (only the benches are ever in the floor's mirror: the rest are behind the boards and the table)
      const mirrored = s.kind === 'bench' || s.kind === 'aide';
      if (s.near) put(s, this.cast(s.body, s.pose, s.to, s.wear, SEEN.camera));
      if (!s.near || mirrored) put(s, this.cast(`${s.body}Far`, s.pose, s.to, s.wear, !s.near ? (mirrored ? SEEN.both : SEEN.camera) : SEEN.mirror));
    }
    for (const c of this.casts.values()) {
      c.mesh.count = c.n;
      c.mesh.visible = c.n > 0 && c.seen !== SEEN.mirror;
      if (!c.n) continue;
      c.mesh.instanceMatrix.needsUpdate = true;
      c.row.needsUpdate = true;
      c.life.needsUpdate = true;
      c.mix.needsUpdate = true;
    }
  }

  /** The dark where the walkers meet the floor (arena.touch's pools, from `n` on): the next free one. */
  touch(floor: { touch(i: number, x: number, z: number, r: number, dark: number): void }, n: number): number {
    for (const w of this.walking) {
      const j = w.pup.j;
      for (const k of [J.fl, J.fr]) {
        const at = w.pup.world(j[k * 3], j[k * 3 + 1], j[k * 3 + 2], TMP);
        const lift = Math.max(0, at.y - 0.4);
        floor.touch(n++, at.x, at.z, 0.8 + lift * 0.6, 0.5 / (1 + lift * 3));
      }
      const hips = w.pup.world(j[J.hips * 3], 0, j[J.hips * 3 + 2], TMP);
      floor.touch(n++, hips.x, hips.z, 2.5, 0.18);
    }
    // (the sitters throw no shadow: a pool of dark under each one's feet and chair sits him on the floor)
    for (const s of this.all) {
      if (!s.drawn || s.kind === 'crew') continue;
      const out = s.kind === 'bench' || s.kind === 'aide' ? UP_OUT * 0.6 : 0.2;
      floor.touch(n++, s.px + Math.sin(s.pyaw) * out, s.pz + Math.cos(s.pyaw) * out, 2.3 * s.size[1], HEIGHT[s.pose] ? 0.26 : 0.34);
    }
    return n;
  }

  dispose() {
    for (const w of this.walking) w.dispose();
    for (const s of this.all) s.w?.dispose();
  }
}
