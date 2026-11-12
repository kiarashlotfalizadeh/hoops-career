// The people round the floor: three referees, the two head coaches, the benches, the scorer's table, and
// the ones who work the baselines (ball kids, photographers, security). All of them generic humans (look.ts:
// a skin, a head of hair, maybe a beard, from a stable number; no likeness of anyone).
//
// Three bodies come from Blender (scripts/blender/people.py), each the player's own in other clothes, one
// skin on the puppet's bones: a player in his warm-up, a suit, a referee. Two kinds of people are made of them:
//   walkers   the referees and the head coaches: a player's puppet (walk, run, backpedal, stand, gestures)
//             under another skin. A Fig is made for each and its own skin hidden: its bones are the ones
//             figure.ts places, so whatever the players' body learns, these learn with it.
//   sitters   everyone else: a body put in a pose once, when the court loads (the bones' places for a pose
//             are worked out here, as people.py's did), and drawn many times over. Each kind of pose is one
//             draw. Who wears what is a row of a small picture (the palette: a colour for each part of him);
//             a head turns to the ball and a trunk breathes in the vertex shader; getting up is a swap of pose.
// The referees work the play from where they never stand between the broadcast camera and the ball: the
// lead behind the baseline, the slot along the far sideline, the trail behind the play. They
// signal what the plan says happened (a three up and good, a foul, whose ball, a timeout), toss the tip
// and pick up a dead ball. The coaches pace their boxes, call out, react, crouch late in a close game and
// take the huddle at a timeout; the benches lean in, get up for a big play, slump when it goes wrong.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Bone,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASKET, COURT_LEN, toWorld, type Act, type Pt } from '../choreo';
import { HALF_W, SIDE, type GameInfo, type Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import type { Gesture } from './clips';
import { Fig, type Geo } from './figure';
import { merged, type Thing } from './glb';
import { lookOf, type Look } from './look';
import type { Props } from './props';
import { ANKLE, FARM, hash, HEAD, HIP, HIP_W, J, SHIN, SHOULDER, THIGH, TORSO, UARM, type Body, type V3 } from './puppet';

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
/** A man on his feet at his bench stands this far in front of his chair. */
const STAND_OUT = 1.5;
/** The body as built (people.py, figure.py): its joints' heights, the floor under its feet, a chair's seat, how far behind the chair's middle his hips are. */
const KN_Y = HIP - THIGH;
const AN_Y = KN_Y - SHIN;
const FLOOR = AN_Y - ANKLE;
const SEAT = 1.5;
const SIT_BACK = 0.3;
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
    out.set(`ha${sfx}`, fa.clone().setPosition(ha));
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

/** The poses, by name. A sitter's shoulders are about 3.6 ft up, a standing man's 5.2. */
const POSES: Record<string, Pose> = {
  // on a bench: forward on his knees, sat back, upright with his hands on his thighs, arms folded, chin on a fist
  lean: sitting(0.5, KN_Y, 0.3, both([0.68, 2.42, 1.1]), both([0.22, 1.95, 1.75]), { look: -0.3 }),
  back: sitting(-0.14, KN_Y - 0.13, 0.36, both([1.0, 2.62, 0.0]), both([0.66, 2.2, 1.0]), { look: 0.1 }),
  up: sitting(0.1, KN_Y - 0.06, 0.26, both([0.9, 2.7, 0.3]), both([0.46, 2.24, 1.3])),
  arms: sitting(-0.04, KN_Y - 0.1, 0.4, both([0.82, 2.72, 0.5]), [
    [-0.42, 3.02, 0.72],
    [0.42, 2.9, 0.76],
  ]),
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
    { look: -0.22, turn: -0.1 },
  ),
  // it went wrong: bent over, his face in his hands
  slump: sitting(0.74, KN_Y, 0.34, both([0.56, 2.3, 1.36]), both([0.17, 3.42, 2.0]), { look: 0.25 }),
  // on his feet: arms folded; his hands on his hips; both arms in the air; clapping at his chest; a towel going round over his head
  stand: standing(-0.04, both([SHOULDER + 0.1, 4.16, 0.36]), [
    [-0.3, 4.34, 0.62],
    [0.3, 4.2, 0.66],
  ]),
  hips: standing(0.02, both([1.28, 4.22, -0.12]), both([0.56, 3.5, 0.12]), { look: -0.04 }),
  cheer: standing(-0.1, both([1.25, 6.05, 0.2]), both([1.05, 7.4, 0.35]), { look: -0.12 }),
  clap: standing(0.04, both([0.86, 4.3, 0.42]), both([0.07, 4.95, 1.12])),
  towel: standing(
    -0.06,
    [
      [1.0, 4.25, 0.3],
      [-1.2, 6.05, 0.25],
    ],
    [
      [0.95, 5.05, 0.95],
      [-1.02, 7.35, 0.4],
    ],
    { look: -0.08 },
  ),
  // down on his haunches by the floor (a ball kid, a man waiting at the table to check in), his arms on his knees
  low: sitting(0.34, KN_Y - 0.03, 0.34, both([0.72, 1.86, 0.95]), both([0.3, 1.78, 1.7]), { look: -0.24, shift: 0 }, 0.52),
  // staff: an assistant watching, his hands on his thighs; at the table, his hands on the desk; security, his hands together in front of him
  watch: sitting(0.18, KN_Y - 0.04, 0.32, both([0.95, 2.66, 0.45]), both([0.5, 2.22, 1.25]), { look: 0.02 }),
  desk: sitting(0.16, KN_Y - 0.06, 0.24, both([0.84, 2.78, 0.62]), both([0.4, 2.86, 1.5]), { look: -0.02 }),
  guard: standing(0.0, both([0.98, 4.1, 0.12]), both([0.1, 3.5, 0.6])),
  // a photographer, sat low on his box, the camera at his eye (his hands are put on it: see CAMERA)
  photo: sitting(0.2, KN_Y - 0.03, 0.4, both([0.7, 2.0, 0.85]), both([0.3, 2.9, 1.25]), { look: -0.12, shift: 0 }, 0.6),
};
/** The poses (a body and a pose) only people off the floor's edge take: left out of the floor's mirror. */
const FAR_CASTS = new Set(['staff/photo', 'staff/guard', 'staff/desk', 'bench/low']);
/** The ways a man sits on a bench, and gets up from one. */
const SITS = ['lean', 'back', 'up', 'arms', 'chin'] as const;
const UPS = ['cheer', 'clap', 'towel', 'cheer'] as const;
const ON_FEET = new Set(['stand', 'hips', 'cheer', 'clap', 'towel', 'guard']);

// ---------------------------------------------------------------- the palette: who wears what

/** The parts a body is made of (people.py's materials), and two made here: a photographer's camera, a towel. */
export const PARTS = [
  'skin',
  'hair',
  'hairTop',
  'brow',
  'eye',
  'lip',
  'beard',
  'white',
  'warm',
  'trim',
  'cloth',
  'shoe',
  'suit',
  'legs',
  'shirt',
  'tie',
  'top',
  'metal',
  'gear',
  'towel',
] as const;
type PartName = (typeof PARTS)[number];
const PART = Object.fromEntries(PARTS.map((p, i) => [p, i])) as Record<PartName, number>;
/** The most people the palette holds. */
const ROWS = 96;
const WHITE = '#e9e7e1';
const SUITS = ['#2b2d35', '#1f2a3d', '#38383c', '#232326', '#3d362e', '#2a3038'];
const SHIRTS = ['#e6e5e1', '#e6e5e1', '#cfd9e6', '#e8e0d2'];
const CASUAL = ['#3b4a3a', '#39404f', '#4a3f36', '#2f3b40', '#4d4d52', '#5a3a36'];

type Wear = Partial<Record<PartName, string>> & { full?: boolean };

const mix = (a: string, b: string | Color, t: number) => `#${new Color(a).lerp(b instanceof Color ? b : new Color(b), t).getHexString()}`;

/** What everyone has: his skin, his hair (a shaved head is his skin a shade down), brows, lips, a beard or the shadow of one. */
function human(look: Look): Wear {
  const shaved = Math.floor(look.style) === 0;
  return {
    skin: look.skin,
    hair: shaved ? mix(look.skin, look.hair, 0.3) : look.hair,
    hairTop: look.hair,
    full: Math.floor(look.style) >= 3,
    brow: mix(look.hair, '#15110e', 0.4),
    eye: '#15100d',
    lip: mix(look.skin, '#7c3d3b', 0.42),
    beard: mix(look.skin, look.hair, look.beard > 0 ? 0.35 + 0.6 * look.beard : 0),
    white: WHITE,
    towel: WHITE,
    gear: '#0e0e10',
  };
}

/** A player off the floor: his warm-up, dark in his team's colour, over his shorts. */
function benchWear(look: Look, kit: MatchKit): Wear {
  return {
    ...human(look),
    warm: mix(kit.color, WARMUP, 0.58),
    trim: mix(kit.light ? kit.token.ring : kit.trim, WARMUP, 0.15),
    cloth: mix(kit.token.fill, WARMUP, 0.42),
    shoe: kit.light ? mix(kit.token.ring, '#101012', 0.3) : '#1b1c1f',
    towel: kit.light ? WHITE : mix(kit.color, '#ffffff', 0.2),
  };
}

/** A coach or his assistant: a dark suit, his tie his team's colour. */
function suitWear(look: Look, id: number, kit: MatchKit | null): Wear {
  const suit = SUITS[Math.floor(hash(id, 31) * SUITS.length)];
  return {
    ...human(look),
    suit,
    legs: hash(id, 37) < 0.75 ? suit : '#2c2d31',
    shirt: SHIRTS[Math.floor(hash(id, 41) * SHIRTS.length)],
    tie: kit ? (kit.light ? kit.token.ring : kit.token.fill) : '#3a3d48',
    shoe: '#151517',
  };
}

/** Someone at work round the floor in his own clothes: a jacket, a shirt of its colour, no tie to speak of. */
function plainWear(look: Look, id: number, top?: string, legs = '#25272c'): Wear {
  const jacket = top ?? CASUAL[Math.floor(hash(id, 43) * CASUAL.length)];
  return { ...human(look), suit: jacket, legs, shirt: mix(jacket, '#000000', 0.25), tie: mix(jacket, '#000000', 0.25), shoe: '#1a1a1c' };
}

const REF_WEAR: Wear = { top: '#8a8d94', trim: '#1a1b1f', legs: '#151517', shoe: '#0d0d0e', metal: '#c4c8cf' };

// ---------------------------------------------------------------- sitters: a pose, baked, drawn many times

/** What the sitters' shader adds: his colours from his row of the palette, his head turned to what he watches, his trunk never quite still, a towel going round. */
const CAST_HEAD = /* glsl */ `
  attribute float aPart;
  attribute float aHead;
  attribute float aRow;
  attribute vec4 aLife;
  uniform sampler2D uPalette;
  uniform float uTime;
  uniform vec3 uNeck;
  uniform vec3 uUp;
  uniform vec3 uSide;
  uniform float uHips;
  uniform vec3 uHand;
  vec4 castWear;
  vec3 castSpin(vec3 v, vec3 k, float a) {
    return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
  }
  // (aLife: his head's turn to his left and its nod, his own beat, how hard he's waving)
  vec3 castTurn(vec3 v) {
    return castSpin(castSpin(v, uSide, aLife.y * aHead), uUp, aLife.x * aHead);
  }`;
const CAST_COLOR = /* glsl */ `
  castWear = texelFetch(uPalette, ivec2(int(aPart + 0.5), int(aRow + 0.5)), 0);
  vColor *= castWear.rgb;`;
const CAST_NORMAL = /* glsl */ `
  objectNormal = castTurn(objectNormal);`;
const CAST_MOVE = /* glsl */ `
  transformed = uNeck + castTurn(transformed - uNeck);
  if (abs(aPart - ${PART.towel.toFixed(1)}) < 0.5) transformed = uHand + castSpin(transformed - uHand, vec3(0.0, 1.0, 0.0), uTime * 11.0 + aLife.z * 6.2831);
  float castHigh = max(0.0, transformed.y - uHips);
  transformed.x += castHigh * (0.016 * sin(uTime * 0.9 + aLife.z * 40.0) + aLife.w * 0.05 * sin(uTime * 9.0 + aLife.z * 23.0));
  transformed.z += castHigh * 0.013 * sin(uTime * 0.63 + aLife.z * 70.0);`;
// (a part he doesn't have, a fuller head of hair on a cropped man, is put off the picture)
const CAST_HIDE = /* glsl */ `
  if (castWear.a < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`;

/** One pose of one body, as many times as there are people in it now. */
interface Cast {
  mesh: InstancedMesh;
  row: InstancedBufferAttribute;
  life: InstancedBufferAttribute;
  n: number;
  /** His head's middle in the pose (the body's frame), for where a standing man's eyes are. */
  head: Vector3;
}

/** A thing put on a posed body: a shape in a bone's frame, a part of its own. */
interface Prop {
  bone: string;
  part: PartName;
  geo: BufferGeometry;
  head?: boolean;
}

/** A body in a pose, as one shape: each point where its bones put it, marked with its part and how much of it is his head. */
function bake(thing: Thing, pose: Pose, props: Prop[] = []): { geo: BufferGeometry; head: Vector3; up: Vector3; side: Vector3; hips: number; hand: Vector3 } {
  if (!thing.bones) throw new Error(`people.glb: ${thing.name} has no bones`);
  const bones = bonesOf(pose);
  const lift = new Matrix4().makeTranslation(0, -FLOOR, pose.shift ?? 0);
  const mats = thing.bones.map((b) => {
    const at = bones.get(b.name);
    if (!at) throw new Error(`people.glb: ${thing.name} has a bone no pose places (${b.name})`);
    return lift.clone().multiply(at).multiply(b.inverse);
  });
  const headBone = thing.bones.findIndex((b) => b.name === 'head');
  const p = new Vector3();
  const n = new Vector3();
  const q = new Vector3();
  const parts: BufferGeometry[] = [];
  for (const part of thing.parts) {
    const k = (PART as Record<string, number | undefined>)[part.material];
    if (k === undefined) throw new Error(`people.glb: ${thing.name} has a part the app has no colour for (${part.material})`);
    const [pos, nor, col, on, by] = ['position', 'normal', 'color', 'skinIndex', 'skinWeight'].map((a) => part.geo.getAttribute(a));
    const count = pos.count;
    const [P, N, H] = [new Float32Array(count * 3), new Float32Array(count * 3), new Float32Array(count)];
    for (let i = 0; i < count; i++) {
      let [x, y, z, nx, ny, nz, head] = [0, 0, 0, 0, 0, 0, 0];
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
        if (b === headBone) head += w;
      }
      q.set(nx, ny, nz).normalize();
      P.set([x, y, z], i * 3);
      N.set([q.x, q.y, q.z], i * 3);
      H[i] = head;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(P, 3));
    g.setAttribute('normal', new BufferAttribute(N, 3));
    g.setAttribute('color', new BufferAttribute(col ? Float32Array.from(col.array as ArrayLike<number>).subarray(0, count * 3) : new Float32Array(count * 3).fill(1), 3));
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(count).fill(k), 1));
    g.setAttribute('aHead', new BufferAttribute(H, 1));
    g.setIndex(part.geo.index!.clone());
    parts.push(g);
  }
  for (const prop of props) {
    const g = prop.geo
      .clone()
      .applyMatrix4(lift.clone().multiply(bones.get(prop.bone)!))
      .toNonIndexed();
    const count = g.getAttribute('position').count;
    g.deleteAttribute('uv');
    g.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(count).fill(PART[prop.part]), 1));
    g.setAttribute('aHead', new BufferAttribute(new Float32Array(count).fill(prop.head ? 1 : 0), 1));
    g.setIndex(Array.from({ length: count }, (_, i) => i));
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  if (!geo) throw new Error(`people.glb: ${thing.name}'s parts don't match`);
  const head = lift.clone().multiply(bones.get('head')!);
  const hand = lift.clone().multiply(bones.get('har')!);
  return {
    geo,
    head: new Vector3().setFromMatrixPosition(head),
    up: new Vector3().setFromMatrixColumn(head, 1).normalize(),
    side: new Vector3().setFromMatrixColumn(head, 0).normalize(),
    hips: pose.hips[1] - FLOOR,
    // (what a raised hand holds is a little past its wrist)
    hand: new Vector3(0, -0.3, 0).applyMatrix4(hand),
  };
}

/** The poses there are, and a body of people.glb in one of them as it is drawn (a test puts each of them on the floor). */
export const POSE_NAMES = Object.keys(POSES);
export const posed = (thing: Thing, pose: string): BufferGeometry => bake(thing, POSES[pose]).geo;

/** A towel in a raised hand: a strip of cloth out from it, a little up (the shader takes it round). */
function towelGeo(): BufferGeometry {
  const g = new PlaneGeometry(1.5, 0.46, 4, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0.8, 0, 0);
  g.rotateZ(0.35);
  g.translate(0, -0.3, 0);
  return g;
}

/** A camera at a photographer's eye: its body and a long lens, in his head's frame. */
function cameraGeo(): BufferGeometry {
  const body = new BoxGeometry(0.46, 0.3, 0.2).translate(0, 0.02, 0.5);
  const lens = new CylinderGeometry(0.11, 0.13, 0.62, 10).rotateX(Math.PI / 2).translate(0, 0, 0.9);
  const g = mergeGeometries([body.toNonIndexed(), lens.toNonIndexed()])!;
  body.dispose();
  lens.dispose();
  return g;
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

/** Walkers go no faster than this toward their spot (ft a second of their own time), and are this near it before they stop. */
const NEAR = 0.35;
/** A walker keeps this far from a player (ft): he steps out of a man's way, the man doesn't step out of his. */
const BERTH = 3.4;

class Walker {
  readonly fig: Fig;
  readonly mesh: SkinnedMesh;
  private readonly own: { dispose(): void }[] = [];
  /** Where he is going, and how fast he is getting there. */
  x = 0;
  z = 0;
  private vx = 0;
  private vz = 0;
  private placed = false;
  private going = false;
  /** The ball is in his hands. */
  has = false;

  constructor(
    geoOf: Geo,
    suit: Suit,
    body: Body,
    kit: MatchKit,
    readonly id: number,
    wear: Wear,
    mat: MeshStandardMaterial,
  ) {
    // (the player's own figure, for its puppet and its bones: its skin stays out of the picture)
    this.fig = new Fig(geoOf, body, 0, kit, '', id);
    const bones: Bone[] = [];
    for (const c of this.fig.group.children) {
      if ((c as Bone).isBone) bones.push(c as Bone);
      else c.visible = false;
    }
    const geo = new BufferGeometry();
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(name, suit.geo.getAttribute(name));
    // his colours, a point at a time: the part's, under its baked shade
    const shade = suit.geo.getAttribute('color');
    const col = new Float32Array(shade.count * 3);
    const c = new Color();
    const corners: number[] = [];
    const all = suit.geo.index!.array;
    for (const part of suit.parts) {
      const hex = wear[part.name as PartName];
      c.set(typeof hex === 'string' ? hex : '#808080');
      for (let i = part.from; i < part.from + part.count; i++) col.set([c.r * shade.getX(i), c.g * shade.getY(i), c.b * shade.getZ(i)], i * 3);
      if (part.name === 'hairTop' && !wear.full) continue;
      for (let i = part.start; i < part.start + part.size; i++) corners.push(all[i]);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setIndex(corners);
    this.mesh = new SkinnedMesh(geo, mat);
    const skeleton = new Skeleton(
      suit.order.map((k) => bones[k]),
      suit.inverse,
    );
    this.mesh.bind(skeleton, new Matrix4());
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.fig.group.add(this.mesh);
    this.own.push(geo, skeleton);
  }

  get pup() {
    return this.fig.pup;
  }

  /**
   * A frame on: he goes toward (tx, tz) at `pace` ft a second at most, out of the way of the players, facing
   * `yaw` (or the way he's going, when he has far to go), and his puppet takes it from there.
   */
  go(tx: number, tz: number, yaw: number, pace: number, act: Act, a: Around, more: { look?: V3; rest?: boolean; cut?: boolean; clear?: boolean } = {}) {
    const sec = a.own / 1000;
    const cut = !this.placed || !!more.cut;
    if (cut) {
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
        cut,
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

  /** His skin onto his puppet (after everything has been said to it this frame). `ball`: the ball, when it's in his hands. */
  place(ball: V3 | null) {
    this.pup.arms(ball);
    this.fig.place();
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
  clutch: boolean;
  game?: GameInfo;
  /** Who is on each bench (their player ids), when the page knows. */
  bench?: [number[], number[]];
  /** The bodies' time, the clock's eased time, the clock's own (ms). */
  own: number;
  ease: number;
  real: number;
  calm: boolean;
  /** The picture went to another moment (into a replay, out of one): everyone is put where he belongs. */
  cut: boolean;
  replay: boolean;
}

/** Someone who is drawn as a pose. */
interface Sitter {
  body: 'bench' | 'staff';
  kind: 'bench' | 'aide' | 'crew' | 'guard' | 'photo' | 'kid';
  side: 0 | 1 | null;
  row: number;
  id: number;
  /** His seat: where, which way it faces, his size. */
  x: number;
  z: number;
  yaw: number;
  size: [number, number, number];
  /** How he sits when nothing is happening, how he gets up for a play, and the pose he was last on his feet in. */
  sit: string;
  react: string;
  stood: string;
  /** What he's doing (sat; up for a play; down about one; at the table to check in), from when and until when (ms). */
  mode: 'sit' | 'up' | 'down' | 'table';
  from: number;
  until: number;
  /** How far he has got up (0 sat, 1 on his feet), where he is now, where his head is turned. */
  rise: number;
  px: number;
  pz: number;
  turn: number;
  beat: number;
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
}

/** What the benches and the coaches react to. */
type Moment = 'three' | 'dunk' | 'and1' | 'block' | 'buzzer' | 'make' | 'turnover' | 'foul' | 'timeout';

const sx = (p: Pt) => p.y - MID;
const sz = (p: Pt) => -p.x;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const M = new Matrix4();
const Q = new Quaternion();
const UP = new Vector3(0, 1, 0);
const AT = new Vector3();
const SIZE = new Vector3();
const TMP: V3 = { x: 0, y: 0, z: 0 };

/** The referees' spots while nothing is being played: together by the table. */
const IDLE: readonly (readonly [number, number])[] = [
  [-4.5, -22.6],
  [4.5, -22.6],
  [0, -20.8],
];
/** A dead ball lies this long (ms) before a referee goes to pick it up. */
const PICK_AFTER = 700;
/** The lead runs down the floor this near the near sideline (ft from the floor's middle): outside the lanes the players run in. */
const LANE_Z = 23.4;
/** How fast a referee runs, a coach walks and hurries (ft a second). */
const REF_PACE = 25;
const COACH_PACE = 4.5;
const COACH_HURRY = 9;
/** A coach's box: from the table's end this far along his bench, this far behind the sideline. */
const BOX = [18.6, 30] as const;
const BOX_Z = -26.3;
/** The huddle: in front of the bench, the coach's back to the floor. */
const HUDDLE_X = 26;
const HUDDLE_Z = -25.4;
/** Late in a close game (the fourth or overtime, this many seconds left, this near): the benches are on their feet, the coaches down in a crouch. */
const LATE_S = 150;
const LATE_BY = 8;

export class Sideline {
  readonly group = new Group();
  private readonly seatMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.75, vertexColors: true });
  private readonly things: Map<string, Thing>;
  private readonly casts = new Map<string, Cast>();
  private readonly castMats: MeshStandardMaterial[] = [];
  private readonly colours = new Float32Array(PARTS.length * ROWS * 4);
  private readonly palette: DataTexture;
  private readonly time = { value: 0 };
  private readonly sitters: Sitter[] = [];
  /** The benches' own people (they change with the kits and with who is on the floor). */
  private bench: Sitter[] = [];
  private benchKey = '';
  private rows = 0;
  private fixedRows = 0;
  private kits: [MatchKit, MatchKit] | null = null;
  // the walkers: three referees, two coaches; the material each wears (the coaches' takes the benches' light)
  private readonly refMat: MeshStandardMaterial;
  private readonly coachMat: MeshStandardMaterial;
  private readonly suits: { official: Suit; staff: Suit };
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
  private tipped = false;
  private huddle = 0;
  private late = false;
  private over = false;
  private count = 0;
  /** Signals still to come: who, what, when (ms of the sideline's clock). */
  private later: { w: Walker; id: Gesture; at: number }[] = [];
  private lineups: [string, string] = ['', ''];
  private subs: [number, number] = [0, 0];

  constructor(
    private readonly keep: Keep,
    props: Props,
    models: { people: Map<string, Thing>; figure: Map<string, Thing> },
    private readonly geo: Geo,
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
    this.suits = { official: suitOf(thing('official'), slot), staff: suitOf(thing('staff'), slot) };
    keep(this.suits.official.geo);
    keep(this.suits.staff.geo);
    this.refMat = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true, side: DoubleSide }));
    this.coachMat = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true, side: DoubleSide }));
    this.group.add(this.walkers);

    // the chairs: each bench's, and the table crew's behind the table
    const chairs: { x: number; y: number; z: number; turn: number }[] = [];
    for (const e of [-1, 1]) for (let i = 0; i < CHAIRS; i++) chairs.push({ x: e * (CHAIR_X + i * CHAIR_GAP), y: 0, z: CHAIR_Z, turn: 0 });
    const desks = [-13.2, -8.2, -3.4, 3.4, 8.2, 13.2];
    for (const x of desks) chairs.push({ x, y: 0, z: TABLE_Z - 1.5, turn: 0 });
    this.group.add(props.chairs(chairs, this.seatMat));

    // who never changes: the table's crew, security at the far corners, the photographers and the ball kids on the baselines
    let n = 7;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    const add = (kind: Sitter['kind'], body: Sitter['body'], sit: string, x: number, z: number, yaw: number, big: number, tier: Sitter['tier'], side: Sitter['side'] = null) => {
      const id = 5000 + this.sitters.length * 7;
      const wide = big * (0.94 + rnd() * 0.14);
      const s: Sitter = {
        body,
        kind,
        side,
        row: this.rows++,
        id,
        x,
        z,
        yaw,
        size: [wide, big, wide],
        sit,
        react: 'cheer',
        stood: 'stand',
        mode: 'sit',
        from: 0,
        until: 0,
        rise: 0,
        px: x,
        pz: z,
        turn: 0,
        beat: rnd(),
        tier,
      };
      this.sitters.push(s);
      return s;
    };
    for (const x of desks) add('crew', 'staff', 'desk', x, TABLE_Z - 1.5, (rnd() - 0.5) * 0.2, 0.88 + rnd() * 0.08, 2);
    for (const e of [-1, 1]) {
      add('guard', 'staff', 'guard', e * (MID + 9.2), -30.5, -e * 0.5, 0.94 + rnd() * 0.06, 1);
      add('guard', 'staff', 'guard', e * (CHAIR_X + CHAIRS * CHAIR_GAP + 1.5), CHAIR_Z - 1.2, -e * 0.2, 0.94 + rnd() * 0.06, 1);
      const out = MID + 6.3;
      for (const z of [-19, -13.5, 12, 16.5, 21])
        add('photo', 'staff', 'photo', e * (out + rnd() * 0.5), z + rnd(), -e * Math.PI * 0.5 + (rnd() - 0.5) * 0.3, 0.86 + rnd() * 0.1, 1);
      for (const z of [-9, 8.5]) add('kid', 'bench', 'low', e * (out - 0.6), z + rnd(), -e * Math.PI * 0.5, 0.68 + rnd() * 0.06, 1, 0);
    }
    this.fixedRows = this.rows;
    for (const s of this.sitters) {
      const look = lookOf(s.id);
      this.wear(
        s.row,
        s.kind === 'guard'
          ? plainWear(look, s.id, '#17181b', '#17181b')
          : s.kind === 'kid'
            ? human(look)
            : plainWear(look, s.id, s.kind === 'crew' ? SUITS[s.row % SUITS.length] : undefined),
      );
    }
  }

  /** A row of the palette: one person's colours. */
  private wear(row: number, wear: Wear) {
    const px = this.colours;
    const c = new Color();
    PARTS.forEach((part, k) => {
      const hex = wear[part];
      c.set(typeof hex === 'string' ? hex : '#808080');
      px.set([c.r, c.g, c.b, part === 'hairTop' && !wear.full ? 0 : 1], (row * PARTS.length + k) * 4);
    });
    this.palette.needsUpdate = true;
  }

  /** The pose `pose` of body `body`, made the first time someone takes it: one shape, drawn once for all who are in it. */
  private cast(body: Sitter['body'], pose: string): Cast {
    const key = `${body}/${pose}`;
    let c = this.casts.get(key);
    if (c) return c;
    const thing = this.things.get(body);
    if (!thing) throw new Error(`people.glb has no ${body}`);
    let spec = POSES[pose];
    const props: Prop[] = [];
    if (pose === 'towel') props.push({ bone: 'har', part: 'towel', geo: towelGeo() });
    if (pose === 'photo') {
      // (his hands go to the camera, which is at his eye)
      const head = bonesOf(spec).get('head')!;
      const grip = (x: number) => new Vector3(x, -0.06, 0.62).applyMatrix4(head).toArray() as [number, number, number];
      spec = { ...spec, hands: [grip(0.26), grip(-0.26)] };
      props.push({ bone: 'head', part: 'gear', geo: cameraGeo(), head: true });
    }
    const baked = bake(thing, spec, props);
    for (const p of props) p.geo.dispose();
    const mat = this.keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true, side: DoubleSide }));
    const uniforms = {
      uPalette: { value: this.palette },
      uTime: this.time,
      uNeck: { value: baked.head },
      uUp: { value: baked.up },
      uSide: { value: baked.side },
      uHips: { value: baked.hips },
      uHand: { value: baked.hand },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>${CAST_HEAD}`)
        .replace('#include <color_vertex>', `#include <color_vertex>${CAST_COLOR}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>${CAST_NORMAL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${CAST_MOVE}`)
        .replace('#include <project_vertex>', `#include <project_vertex>${CAST_HIDE}`);
    };
    mat.customProgramCacheKey = () => 'cast';
    this.castMats.push(mat);
    const row = new InstancedBufferAttribute(new Float32Array(ROWS), 1);
    const life = new InstancedBufferAttribute(new Float32Array(ROWS * 4), 4);
    row.setUsage(DynamicDrawUsage);
    life.setUsage(DynamicDrawUsage);
    baked.geo.setAttribute('aRow', row);
    baked.geo.setAttribute('aLife', life);
    const mesh = this.keep(new InstancedMesh(this.keep(baked.geo), mat, ROWS));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    c = { mesh, row, life, n: 0, head: baked.head };
    this.casts.set(key, c);
    return c;
  }

  /** The building's colour: the benches' chairs. */
  paint(board: string) {
    this.seatMat.color.set(board).multiplyScalar(0.75);
  }

  /** Tonight's kits: the benches in their warm-ups, the coaches' ties, the ball kids in the home colour. The referees and the coaches are made here, the first time. */
  dress(kits: [MatchKit, MatchKit]) {
    this.kits = kits;
    this.benchKey = '';
    for (const s of this.sitters) if (s.kind === 'kid') this.wear(s.row, { ...benchWear(lookOf(s.id), kits[0]), warm: kits[0].color, cloth: '#1d1e22' });
    for (const w of this.walking) {
      this.walkers.remove(w.fig.group, w.fig.shadow);
      w.dispose();
    }
    this.walking = [];
    this.refs = [0, 1, 2].map((i) => {
      const id = 7001 + i * 13;
      const w = new Walker(
        this.geo,
        this.suits.official,
        { s: 0.88 + 0.05 * hash(id, 3), bulk: 0.96 + 0.14 * hash(id, 5) },
        kits[0],
        id,
        { ...human(lookOf(id)), ...REF_WEAR },
        this.refMat,
      );
      this.walkers.add(w.fig.group, w.fig.shadow);
      return w;
    });
    this.coaches = ([0, 1] as const).map((side) => {
      const id = 7101 + side * 17;
      const w = new Walker(
        this.geo,
        this.suits.staff,
        { s: 0.9 + 0.05 * hash(id, 3), bulk: 1 + 0.16 * hash(id, 5) },
        kits[side],
        id,
        suitWear(lookOf(id), id, kits[side]),
        this.coachMat,
      );
      this.walkers.add(w.fig.group, w.fig.shadow);
      return { w, side, spot: (side ? 1 : -1) * 21, move: 0, call: 4000 };
    });
    this.walking = [...this.refs, ...this.coaches.map((c) => c.w)];
  }

  /** Who is on each bench now: the assistants in the first chairs, then the players (their own looks, when the page says who they are). */
  private seat(bench: [number[], number[]] | undefined, on: ReadonlySet<number>) {
    const key = bench ? `${bench.map((b) => b.join()).join('/')}|${this.lineups.join('|')}` : '-';
    if (key === this.benchKey || !this.kits) return;
    this.benchKey = key;
    const was = new Map(this.bench.map((s) => [s.id, s]));
    this.bench = [];
    this.rows = this.fixedRows;
    let n = 23;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    for (const side of [0, 1] as const) {
      const e = side ? 1 : -1;
      const kit = this.kits[side];
      // (the page's bench, less whoever is on the floor; with none, seven made-up men)
      const pids = (bench?.[side].filter((pid) => !on.has(pid)) ?? Array.from({ length: 7 }, (_, i) => 8000 + side * 100 + i)).slice(0, CHAIRS - AIDES);
      for (let i = 0; i < AIDES + pids.length; i++) {
        const aide = i < AIDES;
        const id = aide ? 7200 + side * 10 + i : pids[i - AIDES];
        const x = e * (CHAIR_X + i * CHAIR_GAP);
        const big = aide ? 0.9 + 0.06 * hash(id, 3) : 0.97 + 0.1 * hash(id, 3);
        const wide = big * (aide ? 1 + 0.14 * hash(id, 5) : 0.94 + 0.14 * hash(id, 5));
        const sit = aide ? (i ? 'lean' : 'watch') : SITS[Math.floor(hash(id, 7) * SITS.length)];
        const old = was.get(id);
        const s: Sitter = old ?? {
          body: aide ? 'staff' : 'bench',
          kind: aide ? 'aide' : 'bench',
          side,
          row: 0,
          id,
          x,
          z: CHAIR_Z,
          yaw: (rnd() - 0.5) * 0.3 - e * 0.08,
          size: [wide, big, wide],
          sit,
          react: 'cheer',
          stood: 'stand',
          mode: 'sit',
          from: 0,
          until: 0,
          rise: 0,
          px: x,
          pz: CHAIR_Z,
          turn: 0,
          beat: rnd(),
          tier: 0,
        };
        s.x = x;
        s.row = this.rows++;
        const look = lookOf(id);
        this.wear(s.row, aide ? suitWear(look, id, kit) : benchWear(look, kit));
        this.bench.push(s);
      }
    }
    this.all = [...this.sitters, ...this.bench];
  }

  /** How much of their light the benches keep (the coaches with them): the men on the floor by the far sideline stand out from their own bench. */
  dim(bench: number) {
    // (not as far down as the scene asks: their warm-ups already set them apart from the men on the floor)
    for (const m of this.castMats) m.color.setScalar(0.5 + 0.5 * bench);
    this.coachMat.color.setScalar(0.6 + 0.4 * bench);
  }

  /** A device that can't keep up (the scene's steps): from 2 nobody works the baselines and the heads hold still; at 3 the table is empty and the benches stay sat. */
  shed(level: number) {
    this.level = level;
  }

  /**
   * The floor's mirror is being drawn (arena.ts), or has been: what the varnish shows of the people behind the
   * baselines and the table is nothing worth drawing them twice for. The benches and the walkers stay in it.
   */
  mirrored(on: boolean) {
    for (const [key, c] of this.casts) if (FAR_CASTS.has(key)) c.mesh.visible = !on && c.n > 0;
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
    const share = what === 'buzzer' ? 1 : what === 'dunk' ? 0.6 : what === 'and1' ? 0.55 : what === 'three' ? 0.45 : what === 'block' ? 0.35 : 0;
    this.n++;
    for (const s of this.bench) {
      if (s.kind !== 'bench' || s.mode === 'table' || this.level > 2) continue;
      const r = hash(s.id, this.n);
      if (big && s.side === side && r < share) {
        s.mode = 'up';
        s.from = this.clock + hash(s.id, this.n + 50) * 380;
        s.until = s.from + 1500 + r * 2200 + (what === 'buzzer' ? 2500 : 0);
        s.react = UPS[Math.floor(hash(s.id, this.n + 9) * UPS.length)];
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
        if (big) c.w.cue(r < 0.5 ? 'fist' : 'clap');
        else if (r < 0.25) c.w.cue('clap');
      } else if (big && r < 0.4) c.w.cue(r < 0.2 ? 'coachWide' : 'coachCalm');
      c.call = Math.max(c.call, this.clock + 2500);
    }
  }

  /**
   * What the plan says happened since the last frame: a new move of the possession (a whistle, a shot going
   * up, a turnover, a timeout), a basket going down. The referees signal it, the benches and the coaches take it.
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
    if (fresh) {
      // who is on the floor: a change is a man gone in from the table
      for (const side of [0, 1] as const) {
        const five = (side === off ? sc.oPids : sc.dPids).slice().sort().join();
        if (five !== this.lineups[side]) for (const s of this.bench) if (s.side === side && s.mode === 'table') s.until = 0;
        this.lineups[side] = five;
      }
      // (the ball comes in from out of bounds: the nearest of them hands it over)
      const start = toWorld(sc.frames[0].ball, sc.dir);
      if (Math.abs(sz(start)) > HALF_W - 0.5 || Math.abs(sx(start)) > MID - 0.5) this.signal(this.nearest(sx(start), sz(start)), 'refHand');
    }
    if (fresh || i !== this.move) {
      this.script = sc;
      this.move = i;
      const fl = b.flash;
      const at = this.nearest(a.ball.x, a.ball.z);
      const point = (toward: number, w = at) => (w && Math.cos(w.pup.yaw) * toward > 0 ? 'refPointL' : 'refPointR');
      if (fl?.kind === 'foul' || fl?.text === 'And one!') {
        const offensive = b.foul !== undefined && b.foul < nO;
        const line = sc.frames.slice(i).some((f) => f.act.includes('ft'));
        this.signal(at, 'refFoul');
        this.signal(at, offensive ? point(-e) : line ? 'refTwo' : point(e), 1500);
        this.happen(fl.text === 'And one!' ? 'and1' : 'foul', fl.text === 'And one!' ? off : offensive ? off : def);
        // (a whistle is when a man goes to the table to check in)
        for (const side of [0, 1] as const) if (hash(this.n, 77 + side) < 0.4 && this.clock > this.subs[side]) this.checkIn(side);
      } else if (fl?.kind === 'to') {
        if (fl.text !== 'Steal') this.signal(at, point(-e));
        this.happen('turnover', off);
      } else if (fl?.kind === 'block') this.happen('block', def);
      else if (fl?.text.startsWith('Timeout')) {
        this.signal(this.refs[2], 'refTimeout');
        this.huddle = this.clock + 2600;
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
    // a basket, once, as it goes down
    const key = `${this.move}`;
    if (b.fx === 'make' && play.u >= 0.86 && (fresh || this.made !== key) && !a.line) {
      this.made = key;
      const three = b.flash?.text === '+3';
      const dunk = play.a.act.includes('dunk') || b.act.includes('dunk');
      if (three) this.signal(this.refs[e < 0 ? 1 : 0], 'refGood');
      this.happen(sc.moment ? 'buzzer' : dunk ? 'dunk' : three ? 'three' : 'make', off);
    } else if (b.fx !== 'make') this.made = '';
  }

  /** A man from the end of `side`'s bench goes to the table to check in, and waits there on his haunches. */
  private checkIn(side: 0 | 1) {
    const men = this.bench.filter((s) => s.side === side && s.kind === 'bench' && s.mode === 'sit');
    const s = men[Math.floor(hash(this.n, 5) * men.length)];
    if (!s || this.level > 2) return;
    s.mode = 'table';
    s.from = this.clock + 300;
    s.until = this.clock + 20000;
    this.subs[side] = this.clock + 45000;
  }

  /**
   * One frame: the referees to their places for this moment of the play, the coaches about their boxes,
   * everyone sat or stood as the game has him. A referee with the ball in his hands puts it there.
   */
  update(a: Around) {
    if (!this.kits) return;
    const { script: sc, play } = a.stage;
    const live = !!(sc && play);
    const ball = a.ball;
    if (!a.calm) this.time.value += a.real / 1000;
    this.clock += a.own;
    this.seat(a.bench, new Set(a.figs.keys()));
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
      for (const s of this.bench) {
        if (s.kind !== 'bench') continue;
        const won = s.side === a.final;
        s.mode = won ? 'up' : hash(s.id, this.n) < 0.6 ? 'down' : 'sit';
        s.from = this.clock + hash(s.id, this.n + 50) * 600;
        s.until = Infinity;
        if (won) s.react = UPS[Math.floor(hash(s.id, this.n + 9) * UPS.length)];
      }
      for (const c of this.coaches) c.w.cue(c.side === a.final ? 'fist' : 'head', 3000);
    } else if (a.final === undefined && this.over) {
      this.over = false;
      for (const s of this.bench) s.until = 0;
    }
    if (!a.replay && !a.calm && a.final === undefined) this.read(a, e);
    // (a break in the play that lasts is a huddle too)
    if (!live && !tip && a.final === undefined && this.deadMs > 1200) this.huddle = Math.max(this.huddle, this.clock + 400);
    const huddle = this.clock < this.huddle && a.final === undefined;
    for (let k = this.later.length - 1; k >= 0; k--)
      if (this.clock >= this.later[k].at) {
        this.later[k].w.cue(this.later[k].id);
        this.later.splice(k, 1);
      }

    this.officiate(a, live, tip, e);
    this.coach(a, live, huddle);
    for (const w of this.walking) w.place(w.has ? ball : null);
    this.sit(a, huddle);
  }

  /** The referees: the lead behind the baseline, the slot along the far sideline, the trail behind the play; at the table when nothing is on. */
  private officiate(a: Around, live: boolean, tip: boolean, e: number) {
    const ball = a.ball;
    const refs = this.refs;
    const look: V3 = { x: ball.x, y: Math.max(3, ball.y), z: ball.z };
    const face = (w: Walker) => Math.atan2(ball.x - w.x, ball.z - w.z);
    if (!live) {
      // the tip: one of them in the circle with the ball, the other two back by the far sideline
      if (tip) {
        this.tipped = true;
        refs[0].has = true;
        refs[0].go(0, -3, 0, REF_PACE, 'stand', a, { cut: a.cut || this.deadMs <= a.own, clear: false });
        refs[1].go(-21, -22.8, face(refs[1]), REF_PACE, 'stand', a, { look, rest: true, cut: a.cut || this.deadMs <= a.own });
        refs[2].go(19, -22.8, face(refs[2]), REF_PACE, 'stand', a, { look, rest: true, cut: a.cut || this.deadMs <= a.own });
      } else {
        // a dead ball left on the floor: the nearest of them goes and picks it up, and keeps it
        const holder = refs.find((w) => w.has);
        const loose = !holder && !a.held && a.final === undefined && this.deadMs > PICK_AFTER && ball.y < 0.8;
        const picker = loose ? this.nearest(ball.x, ball.z) : undefined;
        refs.forEach((w, k) => {
          if (w === picker) {
            w.go(ball.x - 0.9, ball.z - 0.9, face(w), REF_PACE * 0.6, 'stand', a, { look, cut: a.cut });
            if (Math.hypot(w.x - ball.x, w.z - ball.z) < 2.2) w.has = true;
          } else w.go(IDLE[k][0], IDLE[k][1], w.has ? 0 : face(w), 6, 'stand', a, { look, rest: true, cut: a.cut });
        });
      }
      for (const w of refs) {
        if (!w.has) continue;
        const at = w.pup.carry(TMP);
        ball.set(at.x, at.y, at.z);
      }
      return;
    }
    // the play is on: whoever had the ball has let it go (the tip is tossed)
    for (const w of refs) {
      if (w.has && this.tipped) this.signal(w, 'refToss');
      w.has = false;
    }
    this.tipped = false;
    const bx = clamp(ball.x, -MID, MID);
    const bz = clamp(ball.z, -HALF_W, HALF_W);
    // (two of them work the near side, each the lead at his own end and the trail going the other way: nobody
    // has to cross the play when it turns round; the third has the far sideline both ways)
    const [lead, trail] = e < 0 ? [refs[0], refs[1]] : [refs[1], refs[0]];
    const slot = refs[2];
    const dead = a.stage.play!.b.act.every((x) => x === 'stand' || x === 'hold');
    const more = { look, cut: a.cut, rest: dead };
    // the lead: ahead of the play down the near side, round the corner, and along behind the baseline as the ball
    // goes (out of bounds at the end he hides nothing; at a free throw, in by the lane, out of the low camera's picture)
    const there = e * lead.x > MID - 7;
    const lz = a.line ? 5.5 : clamp(8 + 0.4 * Math.max(0, bz), 8, 15);
    lead.go(e * (there ? MID + 2.2 : MID - 2.5), there ? lz : LANE_Z, face(lead), REF_PACE, 'stand', a, more);
    // the slot: the far sideline, level with the free-throw line or with the ball
    slot.go(e * (a.line ? 24 : clamp(e * bx + 3, -38, 27)), -23.4, face(slot), REF_PACE, 'stand', a, more);
    // the trail: behind the play, no nearer the basket than the top of the arc; he comes up from his own baseline
    // once the ball has come out past him
    const back = clamp(e * bx - 13, -(MID + 2.2), 15);
    const out = back < -(MID - 1.5);
    const tx = a.line ? e * 15 : e * back;
    const tz = a.line ? 9 : out ? clamp(trail.z, 8, 15) : clamp(6 + bz * 0.4, 3, 15);
    trail.go(tx, tz, face(trail), REF_PACE, 'stand', a, more);
    // (the count, while a team brings it up its backcourt)
    if (a.held && !dead && e * bx < -6 && this.clock > this.count) {
      trail.cue('refCount', 300);
      this.count = this.clock + 1500;
    }
  }

  /** The coaches: about their boxes with the play, down in a crouch late in a close one, calling out, taking the huddle. */
  private coach(a: Around, live: boolean, huddle: boolean) {
    const ball = a.ball;
    const look: V3 = { x: ball.x, y: Math.max(3, ball.y), z: ball.z };
    for (const c of this.coaches) {
      const w = c.w;
      const E = c.side ? 1 : -1;
      if (huddle) {
        // (his back to the floor, his players in front of him)
        w.go(E * HUDDLE_X, HUDDLE_Z, Math.PI, COACH_HURRY, 'stand', a, { cut: a.cut, clear: false });
        if (!w.pup.gesturing && this.clock > c.call) {
          w.cue((['coachPoint', 'coachCalm', 'coachWave', 'clap'] as const)[Math.floor(hash(w.id, this.n++) * 4)]);
          c.call = this.clock + 1400 + hash(w.id, this.n) * 1200;
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

  /** Everyone who is a pose: who is up and who is down, where each head is turned, and each pose's people written out to be drawn. */
  private sit(a: Around, huddle: boolean) {
    const ball = a.ball;
    const k = 1 - Math.exp(-a.real / 260);
    const up = 1 - Math.exp(-a.real / 110);
    for (const c of this.casts.values()) c.n = 0;
    const standing = this.late && a.final === undefined && this.level < 3;
    const spots: [number, number] = [0, 0];
    for (const s of this.all) {
      if (s.tier > 0 && this.level > s.tier) continue;
      // what he's doing now
      let pose = s.sit;
      let tx = s.x;
      let tz = s.z;
      let yaw = s.yaw;
      let wave = 0;
      if (s.kind === 'bench') {
        if (s.mode !== 'sit' && this.clock > s.until) s.mode = 'sit';
        const on = s.mode !== 'sit' && this.clock >= s.from;
        const E = s.side ? 1 : -1;
        if (huddle && s.mode !== 'table' && this.level < 3) {
          // round their coach, in an arc on the bench's side of him
          const i = spots[s.side!]++;
          const ang = (i - 3) * 0.4;
          pose = i % 3 === 1 ? 'hips' : 'stand';
          tx = E * HUDDLE_X + Math.sin(ang) * 6.2;
          tz = HUDDLE_Z - 0.4 - Math.cos(ang) * 3.6;
          yaw = Math.atan2(E * HUDDLE_X - tx, HUDDLE_Z - tz);
        } else if (s.mode === 'table' && on) {
          // (down on his haunches by the end of the table, once he has got there)
          tx = E * 18.3;
          tz = TABLE_Z + 1.9;
          yaw = E * 0.5;
          pose = 'low';
        } else if (s.mode === 'up' && on) {
          pose = s.react;
          wave = 1;
        } else if (s.mode === 'down' && on) pose = 'slump';
        // (late in a close one most of them are on their feet, the rest forward on their knees)
        else if (standing) pose = hash(s.id, 61) < 0.3 ? 'hips' : hash(s.id, 61) < 0.7 ? 'stand' : 'lean';
        if (ON_FEET.has(pose) && tz === s.z) tz = s.z + STAND_OUT;
        // (on his way somewhere, there or back, he is on his feet)
        if (!ON_FEET.has(pose) && Math.hypot(tx - s.px, tz - s.pz) > 1.2) pose = 'stand';
      }
      // (he gets up over a moment, and sits down over one: half way he is still as he was)
      const onFeet = ON_FEET.has(pose);
      s.rise += ((onFeet ? 1 : 0) - s.rise) * up;
      if (onFeet && s.kind === 'bench') {
        if (s.rise < 0.5) pose = s.sit;
        else s.stood = pose;
      } else if (s.kind === 'bench' && s.rise > 0.5) pose = s.stood;
      s.px += (tx - s.px) * (1 - Math.exp(-a.real / 320));
      s.pz += (tz - s.pz) * (1 - Math.exp(-a.real / 320));
      // his head to the ball (not with it in his hands: down, or at the desk he looks where he was)
      const c = this.cast(s.body, pose);
      const still = pose === 'slump' || this.level > 1;
      const keen = (s.kind === 'crew' ? 0.6 : s.kind === 'photo' ? 0.4 : 1) * (0.5 + 0.5 * hash(s.id, 67));
      const want = still ? 0 : clamp(wrap(Math.atan2(ball.x - s.px, ball.z - s.pz) - yaw) * keen, -0.95, 0.95);
      s.turn += (want - s.turn) * k;
      const i = c.n++;
      const tall = ON_FEET.has(pose) ? 0.8 + 0.2 * clamp(s.rise * 2 - 1, 0, 1) : 1;
      const hop = wave && pose !== 'towel' ? 0.16 * Math.abs(Math.sin(this.time.value * 7 + s.beat * 9)) : 0;
      Q.setFromAxisAngle(UP, yaw);
      c.mesh.setMatrixAt(i, M.compose(AT.set(s.px, hop, s.pz), Q, SIZE.set(s.size[0], s.size[1] * tall, s.size[2])));
      c.row.array[i] = s.row;
      const life = c.life.array;
      life[i * 4] = s.turn;
      life[i * 4 + 1] = s.kind === 'crew' ? 0.12 : 0;
      life[i * 4 + 2] = s.beat;
      life[i * 4 + 3] = wave && pose === 'cheer' ? 1 : 0;
    }
    for (const c of this.casts.values()) {
      c.mesh.count = c.n;
      c.mesh.visible = c.n > 0;
      c.mesh.instanceMatrix.needsUpdate = true;
      c.row.needsUpdate = true;
      c.life.needsUpdate = true;
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
    return n;
  }

  dispose() {
    for (const w of this.walking) w.dispose();
  }
}
