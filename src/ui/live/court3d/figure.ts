// One figure on the 3D court: an athlete's body, modelled in Blender (scripts/blender/figure.py), one
// skin over the puppet's joints. Shoulders run into arms without a seam, the head has a face, the
// hands have fingers and the feet sneakers; he wears a V-neck vest tucked into shorts, whose legs
// swing a beat behind his thighs. Builds differ (height, shoulders, how thick the limbs are), and so
// do the men: each has a skin, a head of hair, a beard and a face of his own (look.ts), made up from
// his id, never a likeness. Beyond the puppet's bones he has leaves this file turns itself: his fingers,
// his jaw and nose, his hair's swing, a bone at each shoulder (half way from chest to arm: see `girdle`)
// and one down each forearm (the hand's turn spread along it), his brows and his lower lip. His head is
// one of six kinds, each man off his kind (look.ts), his face moulded to a shape of its own (FACE_SHAPE),
// and his face works (see Fig.face): his eyes are on what he looks at, his lids blink and narrow and
// widen, his jaw comes open on his teeth and his mouth takes a shape of its own (FACE_MOVE: a grin, a
// grimace, lips pressed, a snarl, lips rounded, cheeks blown out, one side more than the other), his brows
// come down or go up, one or both; he talks a syllable at a time, nods and shakes his head; and the game's
// moments show on it (Fig.feel), on his body's own clock, kept for a replay to show (Fig.when). Close up the material draws his
// eyes itself (see EYES), and his head is lit by a lamp on the camera as well as the building's, so his
// dark skin is a face with planes and not a shape (the material's uTone, uBlink, uIris, uEye). His skin
// has a grain close up and a warm edge where a lamp's light leaves it (Detail, SKIN_WRAP), and goes to his
// hair and his beard over a little way, as their picture does, never in a step. His face makes lines as it
// moves (CREASE_DEEP), and the game shows on his skin: he sweats and flushes as he goes (Fig.skin). Behind his
// lips are teeth, gums and a tongue, each built (figure.py's mouth), in the dark of his mouth (MOUTH_LIGHT).
//
// Everything he wears is one picture (his sheet, see `Sheet`): his vest with its number and name, the
// shorts with their side panels and the team's mark, his head (his face, his hair and beard),
// a strip down each arm and leg (a sleeve, a wristband, his socks), his shoes. Each point of the model
// finds its place in the picture by what it is and where it is on him (see `sheetUv`), so the whole man
// is one draw: one material, whatever he has on. A second, smaller picture says what each part is
// made of (how rough, how much a cloth's sheen, how much of its knit shows up close: the knit itself, a rib's and his
// skin's grain are small pictures made when the first court is, see Detail).
import {
  Bone,
  CanvasTexture,
  CircleGeometry,
  Color,
  DataArrayTexture,
  DataTexture,
  DoubleSide,
  Euler,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  RGFormat,
  RingGeometry,
  Skeleton,
  Vector2,
  Vector4,
  SkinnedMesh,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
  BufferAttribute,
  BufferGeometry,
} from 'three';
import type { MatchKit } from '../../teamColors';
import type { Anat } from './anat';
import { smoothed } from './smooth';
import { GRAIN_MM, LAYERS, STEEP, TILE, TILE_MM, tilesOf } from './detail';
import { CLIPS, DUNKS, I, type ClipId, type Gesture } from './clips';
import { merged, type Thing } from './glb';
import { lookOf, SKINS, STYLES, type Look } from './look';
import { ANKLE, BALL_R, J, Puppet, THIGH, type Body } from './puppet';

/** The grey the figures were before each had a skin of his own (look.ts): what the benches still wear until they take theirs from there. */
export const FIGURE = '#7b7d88';
/** That grey's hair. */
export const HAIR = ['#55565f', '#62636c', '#4a4b53', FIGURE] as const;
export const SHOE = '#1b1c1f';
export const SOCK = '#ecebe6';

/** The bones the skin hangs on, as the model names them. */
export const B = {
  pelvis: 0,
  chest: 1,
  head: 2,
  ual: 3,
  fal: 4,
  hal: 5,
  uar: 6,
  far: 7,
  har: 8,
  thl: 9,
  shl: 10,
  ftl: 11,
  thr: 12,
  shr: 13,
  ftr: 14,
  hem: 15,
  hemL: 16,
  hemR: 17,
  // (leaves the puppet knows nothing of: each hand's fingers at the knuckles and at their middle joints, his jaw, his nose)
  kn1l: 18,
  kn2l: 19,
  kn1r: 20,
  kn2r: 21,
  jaw: 22,
  nose: 23,
  // (and what hair that hangs swings from)
  hair: 24,
  // (and one at each shoulder, half way between his chest and his upper arm: see `girdle`)
  cll: 25,
  clr: 26,
  // (and one down each forearm, that takes part of the hand's turn about it)
  fwl: 27,
  fwr: 28,
  // (and one his brows hang on: lowered when he strains or shouts)
  brow: 29,
  // (and one for his lower lip and teeth: it opens with his jaw, and keeps his head's size, so his lips meet whatever his jaw's shape)
  lip: 30,
  // (and each hand's other fingers and its thumb, two joints each: kn1 and kn2 above are its middle finger's. See DIGITS)
  ix1l: 31,
  ix2l: 32,
  rg1l: 33,
  rg2l: 34,
  pk1l: 35,
  pk2l: 36,
  th1l: 37,
  th2l: 38,
  ix1r: 39,
  ix2r: 40,
  rg1r: 41,
  rg2r: 42,
  pk1r: 43,
  pk2r: 44,
  th1r: 45,
  th2r: 46,
  // (and one under each shoulder's, his armpit's: see `axilla`)
  axl: 47,
  axr: 48,
} as const;
const BONES = 49;
/** How far out from his sides his arms are as built (figure.py's ARM_OUT). */
const ARM_OUT = (38 * Math.PI) / 180;
/** Where his armpit's bone turns about (see `axilla`): in from the shoulder's joint and down from it, ft on the 6 ft 6 body. */
const AXILLA = [0.1, 0.3] as const;
/**
 * Each hand's fingers and thumb as figure.py builds them (its DIGITS): the bones at a digit's two joints (a finger's
 * knuckle and middle joint, the thumb's root down in the heel of the hand and its middle knuckle), each from the wrist:
 * toward the palm, down the hand, forward (toward the thumb's side), ft on the 6 ft 6 body. Index, middle, ring,
 * little finger, thumb; their bones' places in B, the left hand's then the right's.
 */
export const DIGITS: readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[] = [
  [
    [0.011, 0.377, 0.125],
    [0.0225, 0.508, 0.138],
  ],
  [
    [0.011, 0.395, 0.042],
    [0.024, 0.542, 0.045],
  ],
  [
    [0.011, 0.387, -0.042],
    [0.023, 0.522, -0.048],
  ],
  [
    [0.011, 0.37, -0.12],
    [0.02, 0.478, -0.134],
  ],
  [
    [0.025, 0.06, 0.09],
    [0.075, 0.22, 0.175],
  ],
];
/** The model's names for them (each joint's bone is the name, 1 or 2, then l or r). */
export const DIGIT_NAMES = ['ix', 'kn', 'rg', 'pk', 'th'] as const;
/** Each hand's bone, its forearm's and the puppet's joint at its wrist: the left's, then the right's. */
const HANDS_AT = [
  [B.hal, B.fal, J.hl],
  [B.har, B.far, J.hr],
] as const;
const DIGIT_BONES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [B.ix1l, B.ix2l],
    [B.kn1l, B.kn2l],
    [B.rg1l, B.rg2l],
    [B.pk1l, B.pk2l],
    [B.th1l, B.th2l],
  ],
  [
    [B.ix1r, B.ix2r],
    [B.kn1r, B.kn2r],
    [B.rg1r, B.rg2r],
    [B.pk1r, B.pk2r],
    [B.th1r, B.th2r],
  ],
];
/** Each arm's bones, shoulder to fingertips (the left's, then the right's). */
const ARM_BONES = [
  [B.ual, B.fal, B.fwl, B.hal, ...DIGIT_BONES[0].flat()],
  [B.uar, B.far, B.fwr, B.har, ...DIGIT_BONES[1].flat()],
];
/** Where his jaw, his nose and his brows are scaled about, from the head bone (figure.py's JAW_AT, NOSE_AT and BROW_AT). */
const HEAD_H = 0.465;
const HEAD_D = 0.376;
const JAW_AT = new Vector3(0, 0.045 - 0.5 * HEAD_H, 0.05 + 0.25 * HEAD_D);
const NOSE_AT = new Vector3(0, 0.045 - 0.2 * HEAD_H, 0.05 + 0.8 * HEAD_D);
const BROW_AT = new Vector3(0, 0.045 + 0.24 * HEAD_H, 0.05 + 0.8 * HEAD_D);
/** Where his jaw hinges, just in front of his ear (from the head bone, ft): it comes open about this, not about where it is scaled. */
const JAW_HINGE = new Vector3(0, 0.045 - 0.03 * HEAD_H, 0.05 - 0.2 * HEAD_D);
/** Where hair that hangs swings from (figure.py's HAIR_AT). */
const HAIR_AT = new Vector3(0, 0.045 + 0.1 * HEAD_H, 0.05 - 0.6 * HEAD_D);

// ---------------------------------------------------------------- his sheet: where each thing is on it

/** The sheet is a square this many pixels across; the stuff picture beside it a quarter of that. */
const SHEET = 1024;
const STUFF_K = 2;
/** A quick head (a new man's, until his finished one is painted) is this much smaller each way. */
const QUICK_K = 4;
/** A place on the sheet: x, y, width, height in its pixels (y down, as a canvas has it). */
type Rect = readonly [number, number, number, number];
/** The vest, as the old picture had it (twice its size: a close-up reads the name), the shorts, his head. */
const R_VEST: Rect = [0, 0, 1024, 512];
const R_SHORTS: Rect = [0, 512, 512, 256];
const R_HEAD: Rect = [512, 512, 512, 400];
/** His shoes' upper (along the foot, round it), their collar and tongue (round his ankle, up it) and their soles (along, up). */
const R_SHOE: Rect = [0, 768, 384, 192];
const R_COLLAR: Rect = [384, 768, 128, 192];
const R_SOLE: Rect = [0, 960, 512, 64];
/** A strip down each limb, shoulder to fingertips and hip to sole: left arm, right arm, left leg, right leg. */
const R_LIMB: readonly Rect[] = [
  [512, 912, 512, 20],
  [512, 932, 512, 20],
  [512, 952, 512, 20],
  [512, 972, 512, 20],
];
/** Plain patches: the vest's and shorts' trim, the skin of his trunk, and hair that is a shape of its own (a bun, his locks). */
const R_TRIM: Rect = [512, 992, 160, 32];
const R_SKIN: Rect = [672, 992, 96, 32];
/**
 * His ears: a plain strip of his skin along the foot of his head's picture, where the picture is of what is down
 * inside his neck and no point of him looks. (Round his head's middle his ears lie over his hair and his beard,
 * whose picture is not theirs; and on his head's part of the sheet they are lit as his face is.)
 */
const R_EAR: Rect = [R_HEAD[0] + 64, R_HEAD[1] + R_HEAD[3] - 14, 384, 12];
/** What is behind his lips when his jaw comes open (figure.py's mouth): the dark of it, his teeth. */
const R_MOUTH: Rect = [768, 992, 32, 32];
const R_TEETH: Rect = [800, 992, 32, 32];
const R_HAIR: Rect = [832, 992, 192, 32];
/** A picture that goes round him (the shorts, his head, a shoe) runs on this far past its seam either side (in turns), so a triangle across the seam finds what it needs. */
const WRAP = 0.06;
/** The vest's picture is the model's own uv: round him from his left side, and up it in 2 ft from 3.6 ft; it reaches this high (in those units). */
const VEST_TOP = 1.1;
/** A vest's side panels start here on its picture (px down the old frame): at the foot of the armhole, under its trim. */
const PANEL_TOP = 74;
/** The shorts' picture runs on this far past their cloth at each end, under the waistband and the hem's band (ft). */
const SHORTS_PAST = 0.02;
/** How far into the cloth the fold is where it goes into one of those bands (ft): see kitSeams. */
const FOLD_FT = 0.008;
/**
 * The vest's trim is all this far over the top of his shorts or more (ft; its armholes' foot is near three times as
 * far), the waistband's all under it; and his collar's is all nearer his middle across than COLLAR_X (ft), his
 * armholes' all further out. See sheetUv's tubes.
 */
const VEST_TRIM = 0.5;
const COLLAR_X = 0.4;
/** His hand's skin (a little rougher and paler) comes in over his wrist, from the first of these down his arm's strip to the second (ft). */
const HAND_FROM = [2.04, 2.22] as const;
/** How far down an arm and a leg its strip reaches, ft (shoulder to fingertips, hip to sole, on the 6 ft 6 body). */
const ARM_LEN = 2.75;
const LEG_LEN = 3.5;
/** His head's middle, from the head bone (figure.py's HEAD_C), and its half width, height and depth (figure.py's PLAYER_HEAD: a real man's head for his height): his head's picture is drawn round it. */
const HEAD_MID = new Vector3(0, 0.045, 0.05);
const HEAD_SIZE = [0.28, HEAD_H, HEAD_D] as const;
/**
 * A real face's layout, and the formula's. His head is a real man's (scripts/blender/mhbody.py), whose features are
 * not where figure.py's formula has them (his nose is shorter than its, his chin longer, his eyes lower and further
 * apart, his lips fuller), and everything here that paints or moves a face does it by the formula's places. So a
 * place on his face is read through a map: from where a thing is on him (the plane of his face) to where the formula
 * has it. Up and down, the map is a table: at each of a few distances out from the middle of his face (FACE_COLS),
 * the heights of some things on him and the heights the formula has them at, straight between them (so it never
 * doubles back), and straight between one distance and the next. Across, a place by his eye goes in with his eye,
 * and the corner of his mouth with it (FACE_ACROSS: where, how wide and tall the patch that moves is, how far).
 * mhbody.py has the same tables and the same map: keep the two alike.
 */
const FACE_COLS: readonly (readonly [number, readonly (readonly [number, number])[]])[] = [
  [
    0.0,
    [
      [0.62, 0.62],
      [0.03, 0.075],
      [-0.209, -0.262],
      [-0.317, -0.345],
      [-0.383, -0.481],
      [-0.445, -0.522],
      [-0.548, -0.61],
      [-0.727, -0.685],
      [-0.929, -0.84],
      [-1.3, -1.3],
    ],
  ],
  [
    0.08,
    [
      [0.62, 0.62],
      [0.03, 0.075],
      [-0.209, -0.262],
      [-0.317, -0.345],
      [-0.378, -0.471],
      [-0.458, -0.522],
      [-0.555, -0.604],
      [-0.727, -0.685],
      [-0.929, -0.84],
      [-1.3, -1.3],
    ],
  ],
  [
    0.16,
    [
      [0.62, 0.62],
      [0.12, 0.2],
      [0.03, 0.075],
      [-0.243, -0.298],
      [-0.398, -0.479],
      [-0.471, -0.522],
      [-0.565, -0.587],
      [-0.727, -0.685],
      [-0.929, -0.84],
      [-1.3, -1.3],
    ],
  ],
  [
    0.24,
    [
      [0.62, 0.62],
      [0.14, 0.215],
      [0.02, 0.065],
      [-0.243, -0.29],
      [-0.469, -0.496],
      [-0.489, -0.522],
      [-0.53, -0.55],
      [-0.727, -0.69],
      [-0.929, -0.84],
      [-1.3, -1.3],
    ],
  ],
  [
    0.32,
    [
      [0.62, 0.62],
      [0.15, 0.235],
      [0.02, 0.065],
      [-0.25, -0.27],
      [-0.519, -0.522],
      [-0.75, -0.71],
      [-0.93, -0.85],
      [-1.3, -1.3],
    ],
  ],
  [
    0.45,
    [
      [0.62, 0.62],
      [0.165, 0.26],
      [0.021, 0.066],
      [-0.25, -0.24],
      [-0.52, -0.515],
      [-0.93, -0.88],
      [-1.3, -1.3],
    ],
  ],
  [
    0.65,
    [
      [0.62, 0.62],
      [0.15, 0.22],
      [0.026, 0.071],
      [-0.3, -0.29],
      [-1.3, -1.3],
    ],
  ],
  [
    0.95,
    [
      [0.62, 0.62],
      [-1.3, -1.3],
    ],
  ],
];
const FACE_ACROSS: readonly (readonly [number, number, number, number, number])[] = [
  [0.45, 0.08, 0.22, 0.2, -0.071],
  [0.32, -0.52, 0.05, 0.06, -0.019],
  [0.155, -0.243, 0.06, 0.06, -0.007],
];
/** A column of the table at height y. */
function faceCol(knots: readonly (readonly [number, number])[], y: number): number {
  if (y >= knots[0][0]) return y;
  for (let i = 1; i < knots.length; i++) {
    const [y0, v0] = knots[i - 1];
    const [y1, v1] = knots[i];
    if (y >= y1) return v0 + ((v1 - v0) * (y0 - y)) / (y0 - y1);
  }
  return y;
}
/** Where the formula has what is at (px, py) on his face. */
export function faceT(px: number, py: number): [number, number] {
  const ax = Math.abs(px);
  let y = py;
  const last = FACE_COLS.length - 1;
  if (ax < FACE_COLS[last][0]) {
    let k = 1;
    while (ax > FACE_COLS[k][0]) k++;
    const [x0, k0] = FACE_COLS[k - 1];
    const [x1, k1] = FACE_COLS[k];
    const t = (ax - x0) / (x1 - x0);
    y = faceCol(k0, py) * (1 - t) + faceCol(k1, py) * t;
  }
  let dx = 0;
  for (const [cx, cy, sx, sy, by] of FACE_ACROSS) dx += by * Math.exp(-(((ax - cx) / sx) ** 2 + ((py - cy) / sy) ** 2));
  return [ax > 1e-9 ? Math.sign(px) * (ax + dx) : 0, y];
}
/** Where on his face the formula's (fx, fy) is: faceT undone (up and down by halving: the map never doubles back). */
function faceBack(fx: number, fy: number): [number, number] {
  let x = fx;
  let y = fy;
  for (let i = 0; i < 6; i++) {
    y = solve((v) => faceT(x, v)[1], fy, -1.4, 0.8);
    x += fx - faceT(x, y)[0];
  }
  return [x, y];
}
/** The same map for a shader (`faceT( vec2 )`): each column a run of straight pieces. */
const FACE_T = (() => {
  const f = (v: number) => v.toFixed(4);
  const col = (knots: readonly (readonly [number, number])[]) => {
    let out = 'y';
    for (let i = knots.length - 1; i >= 1; i--) {
      const [y0, v0] = knots[i - 1];
      const [y1, v1] = knots[i];
      out = `( y >= ${f(y1)} ? ${f(v0)} + ${f((v1 - v0) / (y0 - y1))} * ( ${f(y0)} - y ) : ${out} )`;
    }
    return `( y >= ${f(knots[0][0])} ? y : ${out} )`;
  };
  const cols = FACE_COLS.map(([, knots], k) => `float faceCol${k}( float y ) { return ${col(knots)}; }`).join('\n');
  let pick = 'p.y';
  for (let k = FACE_COLS.length - 1; k >= 1; k--) {
    const x0 = FACE_COLS[k - 1][0];
    const x1 = FACE_COLS[k][0];
    pick = `( ax <= ${f(x1)} ? mix( faceCol${k - 1}( p.y ), faceCol${k}( p.y ), ( ax - ${f(x0)} ) / ${f(x1 - x0)} ) : ${pick} )`;
  }
  const across = FACE_ACROSS.map(([cx, cy, sx, sy, by]) => `${f(by)} * exp( - pow( ( ax - ${f(cx)} ) / ${f(sx)}, 2.0 ) - pow( ( p.y - ${f(cy)} ) / ${f(sy)}, 2.0 ) )`).join(' + ');
  return /* glsl */ `
${cols}
vec2 faceT( vec2 p ) {
  float ax = abs( p.x );
  float y = ${pick};
  float dx = ${across};
  return vec2( ax > 1e-6 ? sign( p.x ) * ( ax + dx ) : 0.0, y );
}`;
})();
/** The most his hair stands off his scalp, ft (an afro, a high top's crown). */
const HAIR_MAX = 0.32;
/**
 * His head's picture has more of itself for his face than for the back of his head: round him, most
 * at the front; up him, most at the height of his eyes and mouth. (Where a direction from the head's
 * middle is on it: `a` round from the front, `el` up from level.)
 */
const HEAD_KA = 0.5;
const HEAD_KE = 0.4;
const HEAD_CE = 0.46;
const headU = (a: number) => 0.5 + (a + HEAD_KA * Math.sin(a)) / (2 * Math.PI);
const headV = (el: number) => {
  const t = 0.5 + el / Math.PI;
  return t + (HEAD_KE / (2 * Math.PI)) * (Math.sin(2 * Math.PI * (t - HEAD_CE)) + Math.sin(2 * Math.PI * HEAD_CE));
};
/** The value a rising function takes `y` at, between lo and hi. */
function solve(f: (x: number) => number, y: number, lo: number, hi: number): number {
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** The line a shoe's upper is unrolled about, from the ankle (ft: the foot of the upper, so its top is half way up its picture and its sides a quarter either way). */
const SHOE_MID = -0.2;
/** How high a shoe's collar and tongue reach, from the ankle (ft): their picture's second way. */
const COLLAR_Y = [-0.14, 0.42] as const;
/** A shoe's length (heel to toe, from the ankle) and its sole's height, ft. */
const SHOE_Z = [-0.36, 0.74] as const;
const SOLE_H = 0.15;

/** Which picture each point takes its colour from. */
const Pic = { Vest: 0, Trim: 1, Shorts: 2, Head: 3, Skin: 4, ArmL: 5, ArmR: 6, LegL: 7, LegR: 8, Shoe: 9, Sole: 10, Hair: 11, Collar: 12, Mouth: 13, Teeth: 14, Ear: 15 } as const;
type Pic = (typeof Pic)[keyof typeof Pic];
const RECT: Record<Pic, Rect> = {
  [Pic.Vest]: R_VEST,
  [Pic.Trim]: R_TRIM,
  [Pic.Shorts]: R_SHORTS,
  [Pic.Head]: R_HEAD,
  [Pic.Skin]: R_SKIN,
  [Pic.ArmL]: R_LIMB[0],
  [Pic.ArmR]: R_LIMB[1],
  [Pic.LegL]: R_LIMB[2],
  [Pic.LegR]: R_LIMB[3],
  [Pic.Shoe]: R_SHOE,
  [Pic.Sole]: R_SOLE,
  [Pic.Hair]: R_HAIR,
  [Pic.Collar]: R_COLLAR,
  [Pic.Mouth]: R_MOUTH,
  [Pic.Teeth]: R_TEETH,
  [Pic.Ear]: R_EAR,
};
/** Hair that is a shape of its own on the model (a man wears one of them or none: see STYLES). */
const PIECES = ['bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'];
/** What makes a shoe a high one (the collar on up round his ankle, a longer tongue): a piece too, left off a man who wears his low. */
const HIGH = 'high';
/**
 * Those of them that are a mass of tight curls: his hair's fuzz is laid over them too, as coils (COIL_OUT ft long, a
 * coil COIL_ACROSS to the foot of him), so the edge of an afro against the light is curls, each its own, not a
 * smooth ball.
 */
const COILED = ['afro', 'hightop', 'curls'];
const COIL_OUT = 0.034;
/** And how far off his scalp (ft) a head of curls is where its coils start, and where they are their whole length: see fuzzOf's `stand`. */
const COIL_EDGE = ['0.025', '0.07'] as const;
const COIL_ACROSS = 84;
/** How much of a lamp's shine and the roof's tight curls give back (see stuffMaterial). */
const CURL_SHINE = '0.4';
/**
 * Each coil (see stuffMaterial): the shortest (a share of the fuzz's whole length) and how much longer some are, how
 * many times it winds round as it goes out, how far round its own line it winds (a share of a coil's room), and how
 * thick it is (its radius, a share of its room).
 */
const COIL_SHAPE = ['0.55', '0.45', '1.3', '0.22', '0.36'] as const;
/** Those of them that are curls, not strands: their half of the hair's picture is tufts. */
const TUFTED = ['afro', 'hightop', 'curls'];
/**
 * A twist is a lock of two strands wound round each other (drawn by the material, from how far along it and round it a
 * point is: see sheetUv's `twist`): how many times they wind round each other root to end, how deep the groove between
 * them is (ft), and how many fine runs of hairs lie along each strand.
 */
const TWIST = ['6.5', '0.0035', '5.0'] as const;
/** How many lengths his twist's line is found in, root to end, as it bends (see twistsOf). */
const TWIST_SPINE = 5;
/** A lock's own relief (see stuffMaterial): how fine its finest grooves are (to a foot, for when they are seen), and how deep a groove the picture's darkest stands for (ft). */
const LOCK_RELIEF = ['300.0', '0.006'] as const;
/** Which of a picture's two ways goes round (0 across, 1 up; -1 neither): a triangle across its seam is given points of its own. */
const ROUND: Partial<Record<Pic, 0 | 1>> = { [Pic.Shorts]: 0, [Pic.Head]: 0, [Pic.Shoe]: 1, [Pic.Collar]: 0 };

export interface Geo {
  /** The body: one shape, every point of it placed on the sheet (with no hair but what is painted on him). */
  body: BufferGeometry;
  /** The body with one of the model's pieces of hair on it (a bun, a tail, twists, locks, braids), or `body` for none; in high shoes, or (`high` false) low ones. */
  wearing(piece: string | null, high?: boolean): BufferGeometry;
  /** What the model says each part is (the sheet is painted to match: see `sheetUv`). */
  wears: string[];
  /** The skin counts its bones in the model's order: which of ours each is, and the way back to it from the body as built. */
  order: number[];
  inverse: Matrix4[];
  /** How high the shorts reach (ft, as built): their picture runs from one to the other. */
  shorts: [number, number];
  /** His hair's fuzz: the scalp again in layers, each a little further out (see fuzzOf). */
  fuzz: BufferGeometry;
  /** That, for a man who wears this piece of hair (or none): a head of curls has its own curls on it too (see COILED). */
  fuzzFor(piece: string | null): BufferGeometry;
  /** The shapes a face can take (faces.bin: see readFaces), on the body's points; null where the file didn't come. */
  shapes: Shapes | null;
  /** His skin's anatomy, as every man's material reads it (see Maps); null where its map didn't come. */
  maps: Maps | null;
  /** His skin's grain and his kit's knit close up, as every man's full material reads them (see Detail). */
  detail: Detail;
  blob: BufferGeometry;
  ring: BufferGeometry;
  /** The bands round his limbs that stand off them (see Cuff), as one shape on his bones; null for none. And what they are made of (one for every man). */
  cuffs(bands: readonly Cuff[]): BufferGeometry | null;
  cuffMat: MeshStandardMaterial;
  /**
   * The same man far off (the model's figureFar: figure.py's dress_far), a sixth of his triangles on bones of the same
   * names, laid on the same sheet: what a lamp's shadow map and the floor's mirror draw of him, and all a device that
   * can't keep up draws of a man who is not close (see Fig.low). `wearing` as the body's own.
   */
  far: { wearing(piece: string | null, high?: boolean): BufferGeometry; order: number[]; inverse: Matrix4[] };
}

/**
 * A band round a limb that stands off it: the ribbed top of a sock, a wristband, an armband, the hem of a sleeve or
 * of a pad over a knee. Painted on his skin alone (his sheet) each was a change of colour on a smooth arm; this is the
 * cloth's own thickness over it, which catches the light along its edge and throws a line of shade under it. `limb`:
 * his left arm, his right, his left leg, his right; `from`..`to`: ft down it from the shoulder or the hip, as his
 * sheet's strips are measured; `proud`: how far off his skin (ft).
 */
export interface Cuff {
  limb: 0 | 1 | 2 | 3;
  from: number;
  to: number;
  proud: number;
  color: string;
}
/** A limb's own bones (its first the one its length is measured down): a point of the body is the limb's if it hangs on these most. */
const LIMB_BONES = [
  [B.ual, B.fal, B.fwl, B.hal],
  [B.uar, B.far, B.fwr, B.har],
  [B.thl, B.shl],
  [B.thr, B.shr],
] as const;
/** How many sides a band has round the limb, how far either side of it the limb's girth is read (ft), and a band's shape across: where each of its rows is (of its half width) and how far off the skin (of `proud`). */
const CUFF_SIDES = 18;
const CUFF_READ = 0.04;
const CUFF_ROWS = [
  [-1, 0.2, 0.85],
  [-0.55, 1, 0.2],
  [0.55, 1, -0.2],
  [1, 0.2, -0.85],
] as const;

/**
 * What builds a man's bands (Geo.cuffs) from the body as built: each band follows the limb's own outline where it
 * goes round it (the farthest point of the body out from the limb's middle on each of its sides, there), a little
 * proud of it, and hangs on the bone most of the skin under it hangs on, so it goes where that skin goes.
 */
function cuffMaker(geo: BufferGeometry, order: number[], inverse: Matrix4[]): Geo['cuffs'] {
  const [pos, on, by] = [geo.getAttribute('position'), geo.getAttribute('skinIndex'), geo.getAttribute('skinWeight')];
  // each limb's points, in the frame of its first bone: across (x, z), how far down it (t), and the bone each hangs on most
  const limbs = LIMB_BONES.map((bones) => {
    const root = order.indexOf(bones[0]);
    const mine = new Set(bones.map((b) => order.indexOf(b)));
    const pts: number[] = [];
    const P = new Vector3();
    for (let v = 0; root >= 0 && v < pos.count; v++) {
      let [most, bone] = [0, -1];
      for (let c = 0; c < 4; c++) if (by.getComponent(v, c) > most) [most, bone] = [by.getComponent(v, c), on.getComponent(v, c)];
      if (!mine.has(bone)) continue;
      P.fromBufferAttribute(pos, v).applyMatrix4(inverse[root]);
      pts.push(P.x, -P.y, P.z, bone);
    }
    return { root, pts, out: root >= 0 ? inverse[root].clone().invert() : new Matrix4() };
  });
  return (bands) => {
    const [P, N, C, I, S]: number[][] = [[], [], [], [], []];
    const c = new Color();
    const v = new Vector3();
    for (const band of bands) {
      const { root, pts, out } = limbs[band.limb];
      const mid = (band.from + band.to) / 2;
      const half = (band.to - band.from) / 2;
      const near = (t: number) => Math.abs(t - mid) <= half + CUFF_READ;
      let [n, cx, cz] = [0, 0, 0];
      for (let i = 0; i < pts.length; i += 4) if (near(pts[i + 1])) [n, cx, cz] = [n + 1, cx + pts[i], cz + pts[i + 2]];
      if (root < 0 || n < 12) continue;
      cx /= n;
      cz /= n;
      const far = new Float32Array(CUFF_SIDES);
      const hangs = new Map<number, number>();
      for (let i = 0; i < pts.length; i += 4) {
        if (!near(pts[i + 1])) continue;
        const [dx, dz] = [pts[i] - cx, pts[i + 2] - cz];
        const k = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * CUFF_SIDES) % CUFF_SIDES;
        far[k] = Math.max(far[k], Math.hypot(dx, dz));
        hangs.set(pts[i + 3], (hangs.get(pts[i + 3]) ?? 0) + 1);
      }
      // (a side no point of the body is on takes its neighbours'; and no side is far under them: a band is round, not a star)
      const mean = far.reduce((a, b) => a + b, 0) / (far.filter((r) => r > 0).length || 1);
      const round = Array.from(far, (r, k) => {
        const [a, b] = [far[(k + CUFF_SIDES - 1) % CUFF_SIDES] || mean, far[(k + 1) % CUFF_SIDES] || mean];
        return Math.max(r || mean, ((a + b) / 2) * 0.97);
      });
      const bone = [...hangs].sort((a, b) => b[1] - a[1])[0][0];
      c.set(band.color);
      const first = P.length / 3;
      for (const [across, off, lean] of CUFF_ROWS)
        for (let k = 0; k < CUFF_SIDES; k++) {
          const a = -Math.PI + ((k + 0.5) / CUFF_SIDES) * 2 * Math.PI;
          const r = round[k] + band.proud * off;
          v.set(cx + Math.cos(a) * r, -(mid + across * half), cz + Math.sin(a) * r).applyMatrix4(out);
          P.push(v.x, v.y, v.z);
          // (a row's face: out from the limb, the outer rows turned up and down it)
          v.set(Math.cos(a), lean, Math.sin(a)).normalize().transformDirection(out);
          N.push(v.x, v.y, v.z);
          C.push(c.r, c.g, c.b);
          S.push(bone, 0, 0, 0);
        }
      for (let row = 0; row + 1 < CUFF_ROWS.length; row++)
        for (let k = 0; k < CUFF_SIDES; k++) {
          const [a, b] = [first + row * CUFF_SIDES + k, first + row * CUFF_SIDES + ((k + 1) % CUFF_SIDES)];
          I.push(a, b, a + CUFF_SIDES, b, b + CUFF_SIDES, a + CUFF_SIDES);
        }
    }
    if (!I.length) return null;
    const made = new BufferGeometry();
    made.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
    made.setAttribute('normal', new BufferAttribute(new Float32Array(N), 3));
    made.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
    made.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(S), 4));
    made.setAttribute('skinWeight', new BufferAttribute(new Float32Array(S.map((_, i) => (i % 4 ? 0 : 1))), 4));
    made.setIndex(I);
    return made;
  };
}

/**
 * The shapes a face can take, each a move of some of the body's points (`at`, its points; `by`, how far each, ft:
 * three to a point). A man's face is his own mix of them (look.ts `shape`), put on his head once (`ownShape`).
 */
export interface Shapes {
  names: string[];
  at: Int32Array[];
  by: Float32Array[];
  /** The grid the file's points are on (ft): a point and its twin across a seam are one place on it (see ownShape). */
  grid: number;
}

/**
 * faces.bin (scripts/blender/figure.py faces_bin: MakeHuman's shapes of a face, carried over onto our head), its
 * points found on the body's by their place (both on the same grid): one point of the file may be several of the
 * body's (a seam in the sheet).
 */
export function readFaces(file: ArrayBuffer, geo: BufferGeometry): Shapes {
  const head = new DataView(file);
  if (file.byteLength < 12 || head.getUint32(0, true) !== 0x45434146) throw new Error('faces.bin: not one');
  const metaLen = head.getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 12, metaLen))) as { names: string[]; scales: number[]; points: number; grid: number };
  let at = 12 + metaLen;
  const places = new Int16Array(file.slice(at, at + meta.points * 6));
  at += meta.points * 6;
  at += -at & 3;
  const pos = geo.getAttribute('position');
  const of = new Map<string, number[]>();
  for (let v = 0; v < pos.count; v++) {
    const key = `${Math.round(pos.getX(v) / meta.grid)},${Math.round(pos.getY(v) / meta.grid)},${Math.round(pos.getZ(v) / meta.grid)}`;
    const list = of.get(key);
    if (list) list.push(v);
    else of.set(key, [v]);
  }
  const body: number[][] = [];
  // (a point a hair either side of a step of the grid, as Blender wrote it and as the file has it, is the same point)
  const found = new Set<number>();
  for (let k = 0; k < meta.points; k++) {
    const [x, y, z] = [places[k * 3], places[k * 3 + 1], places[k * 3 + 2]];
    let list = of.get(`${x},${y},${z}`);
    for (let d = 0; !list && d < 27; d++) if (d !== 13) list = of.get(`${x + (d % 3) - 1},${y + (Math.floor(d / 3) % 3) - 1},${z + Math.floor(d / 9) - 1}`);
    body.push(list ?? []);
    for (const v of list ?? []) found.add(v);
  }
  if (typeof window !== 'undefined' && (window as { faceDebug?: unknown }).faceDebug !== undefined)
    (window as { faceDebug?: unknown }).faceDebug = { points: meta.points, missing: body.filter((b) => !b.length).length, found: found.size };
  const out: Shapes = { names: meta.names, at: [], by: [], grid: meta.grid };
  meta.names.forEach((_name, t) => {
    const n = head.getUint32(at, true);
    at += 4;
    const idx = new Uint16Array(file.slice(at, at + n * 2));
    at += n * 2;
    at += -at & 3;
    const q = new Int8Array(file.slice(at, at + n * 3));
    at += n * 3;
    at += -at & 3;
    const vs: number[] = [];
    const ds: number[] = [];
    for (let i = 0; i < n; i++)
      for (const v of body[idx[i]]) {
        vs.push(v);
        ds.push(q[i * 3] * meta.scales[t], q[i * 3 + 1] * meta.scales[t], q[i * 3 + 2] * meta.scales[t]);
      }
    out.at.push(Int32Array.from(vs));
    out.by.push(Float32Array.from(ds));
  });
  return out;
}

/** Each shape's points, as one place on him: a point's first at its place on the grid (keyed by the shape's own positions, so worked out once). */
const WELDS = new WeakMap<object, Int32Array>();
function weldOf(base: BufferGeometry, grid: number): Int32Array {
  const pos = base.getAttribute('position');
  let weld = WELDS.get(pos);
  if (weld) return weld;
  weld = new Int32Array(pos.count);
  const first = new Map<string, number>();
  for (let v = 0; v < pos.count; v++) {
    const key = `${Math.round(pos.getX(v) / grid)},${Math.round(pos.getY(v) / grid)},${Math.round(pos.getZ(v) / grid)}`;
    const at = first.get(key);
    if (at === undefined) first.set(key, v);
    weld[v] = at ?? v;
  }
  WELDS.set(pos, weld);
  return weld;
}

/**
 * A man's own head: the body's shape (`base`, shared by every man) with his face's mix of the shapes put on it, as
 * the attribute `aShape` (how far each point moves, ft: the material adds it: see stuffMaterial) and the way each
 * point now faces (its normal, turned by as much as the triangles round it are). Everything else is shared. `from`
 * says which of the body's points each of base's is (the fuzz's layers are copies), where they are not the same.
 */
export function ownShape(base: BufferGeometry, shapes: Shapes, mix: Record<string, number>, from?: Int32Array): BufferGeometry {
  const n = base.getAttribute('position').count;
  const total = from ? Math.max(...shapes.at.map((a) => (a.length ? Math.max(...a) : 0))) + 1 : n;
  const move = new Float32Array(total * 3);
  shapes.names.forEach((name, t) => {
    const w = mix[name] ?? 0;
    if (!w) return;
    const at = shapes.at[t];
    const by = shapes.by[t];
    for (let i = 0; i < at.length; i++) {
      const v = at[i] * 3;
      move[v] += by[i * 3] * w;
      move[v + 1] += by[i * 3 + 1] * w;
      move[v + 2] += by[i * 3 + 2] * w;
    }
  });
  const shift = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const src = from ? from[v] : v;
    if (src * 3 + 2 < move.length) shift.set(move.subarray(src * 3, src * 3 + 3), v * 3);
  }
  const g = new BufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) g.setAttribute(k, a);
  g.setIndex(base.index);
  g.setAttribute('aShape', new BufferAttribute(shift, 3));
  // (each moved point's normal turned as the triangles round it are: the sum of their faces before and after. A point
  // split in two by a seam in a picture (his sheet's, his skin's map's) is one place on him: its two halves sum the
  // triangles of both sides and turn alike, or a face of his own shape would have a line down his neck and his head)
  const pos = base.getAttribute('position');
  const nor = base.getAttribute('normal');
  const weld = weldOf(base, shapes.grid);
  const was = new Float32Array(n * 3);
  const now = new Float32Array(n * 3);
  const index = base.index!;
  const p = [new Vector3(), new Vector3(), new Vector3()];
  const q = [new Vector3(), new Vector3(), new Vector3()];
  const e1 = new Vector3();
  const e2 = new Vector3();
  const moved = (v: number) => shift[v * 3] !== 0 || shift[v * 3 + 1] !== 0 || shift[v * 3 + 2] !== 0;
  for (let t = 0; t < index.count; t += 3) {
    const vs = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (!vs.some(moved)) continue;
    vs.forEach((v, k) => {
      p[k].fromBufferAttribute(pos, v);
      q[k].set(p[k].x + shift[v * 3], p[k].y + shift[v * 3 + 1], p[k].z + shift[v * 3 + 2]);
    });
    const a = e1.subVectors(p[1], p[0]).cross(e2.subVectors(p[2], p[0]));
    const [ax, ay, az] = [a.x, a.y, a.z];
    const b = e1.subVectors(q[1], q[0]).cross(e2.subVectors(q[2], q[0]));
    for (const v of vs) {
      const w = weld[v] * 3;
      was[w] += ax;
      was[w + 1] += ay;
      was[w + 2] += az;
      now[w] += b.x;
      now[w + 1] += b.y;
      now[w + 2] += b.z;
    }
  }
  const turned = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    let x = nor.getX(v);
    let y = nor.getY(v);
    let z = nor.getZ(v);
    const w = weld[v] * 3;
    const len = Math.hypot(was[w], was[w + 1], was[w + 2]);
    if (len > 0) {
      x += (now[w] - was[w]) / len;
      y += (now[w + 1] - was[w + 1]) / len;
      z += (now[w + 2] - was[w + 2]) / len;
    }
    const l = Math.hypot(x, y, z) || 1;
    turned[v * 3] = x / l;
    turned[v * 3 + 1] = y / l;
    turned[v * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new BufferAttribute(turned, 3));
  return g;
}

/**
 * His skin's anatomy as every man's material reads it, in MakeHuman's own uv (the body's `uv1`: see
 * scripts/blender/anatomy.py, which bakes the heights of his muscles, tendons and veins there). `anat`: their slopes,
 * as steep across and up the map as a texel's step goes (muscle and tendon in red and green, his veins in blue and
 * alpha: 128 is level, 1 and 255 as steep as `scale` says, ft a texel, one for each pair), `size` texels a side.
 * `cav`: the shade down in their hollows (255 none), half that. Shared by every man (each shows his own share: see Fig).
 */
export interface Maps {
  anat: DataTexture;
  cav: DataTexture;
  scale: Vector2;
  size: number;
}

/**
 * The maps every man's skin reads (see Maps): new textures for each court, on the bytes his anatomy was worked out
 * into once (anat.ts: kept by models.ts, so a court built again only puts them on the card).
 */
function mapsOf(keep: <T extends { dispose(): void }>(o: T) => T, anat: Anat): Maps {
  const [n, m] = [anat.size, anat.size >> 1];
  if (anat.slopes.length !== n * n * 4 || anat.shade.length !== m * m)
    throw new Error(`his skin's anatomy: ${anat.slopes.length} and ${anat.shade.length} bytes, not ${n * n * 4} and ${m * m}`);
  const texture = (data: Uint8Array<ArrayBuffer>, size: number, format: typeof RGBAFormat | typeof RedFormat) => {
    const t = keep(new DataTexture(data, size, size, format, UnsignedByteType));
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  return { anat: texture(anat.slopes, n, RGBAFormat), cav: texture(anat.shade, m, RedFormat), scale: new Vector2(...anat.scale), size: n };
}

/**
 * His skin's grain and his kit's knit close up, as every man's full material reads them: detail.ts's three small
 * pictures (his skin's, a knit's, a rib's: each the slopes of its height, the shade in its hollows and its slope
 * squared: `tiles`, made the first time something asks for them, as `seams` are), laid on him as big as they are
 * (`cloth`: ft a uv across and up his vest's picture and his shorts', his shoes' and their collars'; `tubes`: what his
 * trim and the strips down his limbs go round, see sheetUv). `sq`: each picture's slope squared, on average (what a
 * lamp's shine on it is roughed up by, far off; filled in when the tiles are made). `seams`: his kit's seams, piping,
 * rows of stitches and hems as the cloth's slopes, on the sheet as they are painted on it (see kitSeams), made when
 * first asked for (see seamsOf); none where there is no page to draw them on, as in a test. New textures for each
 * court, on bytes made once a session.
 */
export interface Detail {
  tiles: () => DataArrayTexture;
  cloth: Vector4[];
  tubes: Vector4[];
  sq: Vector3;
  seams: (() => DataTexture) | null;
}

/**
 * How far his kit's seams stand off the cloth, mm (see kitSeams): a seam sunk where two panels are sewn; a row of
 * stitches a groove with its thread lying in it (standing up off the groove's floor, not out of it; the hem's rows in a
 * shallower one, see kitSeams); the trim's piping
 * and the cord at his waist each a cord laid on the cloth; the cloth rolled where it goes into a band. And how far what
 * is pressed on his kit (his number, his name, the team's letters) stands up off the knit, mm (see SEAM_RELIEF).
 */
const SEAM_MM: Record<Exclude<Seam, 'panel'>, number> = { seam: -0.3, groove: -0.2, hem: -0.08, stitch: -0.05, piping: 0.5, cord: 0.5, fold: 0.4 };
const PRINT_MM = 0.3;
/** The seams' heights as greys (mm a step off 128), and their slopes as bytes (mm a texel at 127, either way). */
const SEAM_STEP = 0.005;
const SEAM_STEEP = 0.3;
/**
 * How much steeper a seam is drawn than its picture has it: the sheet's texel is a millimetre and a third across, and
 * eased, a seam a millimetre wide is three or four of them, as deep but that much less steep.
 */
const SEAM_SHOWN = 5;
/** The seams' picture: laid out as the sheet is, its width and down to the foot of the shorts' picture (the vest's and the shorts' are all it has). */
const SEAM_W = SHEET;
const SEAM_H = R_SHORTS[1] + R_SHORTS[3];

/** His kit's seams as heights (see kitSeams): greys, 128 the cloth's own, on a picture laid out as the sheet is (see SEAM_H). `tall`: how high the shorts' picture runs (ft). */
function paintRelief(tall: number): Uint8Array {
  const cv = document.createElement('canvas');
  cv.width = SEAM_W;
  cv.height = SEAM_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const grey = (mm: number) => {
    const g = Math.round(128 + mm / SEAM_STEP);
    return `rgb(${g},${g},${g})`;
  };
  // (a side panel is the same cloth as the rest: no height of its own)
  const ink = (part: Seam) => (part === 'panel' ? null : grey(SEAM_MM[part]));
  ctx.fillStyle = grey(0);
  ctx.fillRect(0, 0, SEAM_W, SEAM_H);
  within(ctx, 1, R_VEST, (c) => turns(c, R_VEST, 512, 256, 1 / VEST_TOP, 0, (t) => kitSeams(t, ink, null)));
  within(ctx, 1, R_SHORTS, (c) => turns(c, R_SHORTS, 512, 256, 1, 0, (t) => kitSeams(t, ink, tall)));
  const px = ctx.getImageData(0, 0, SEAM_W, SEAM_H).data;
  const heights = new Uint8Array(SEAM_W * SEAM_H);
  for (let i = 0; i < heights.length; i++) heights[i] = px[i * 4];
  return heights;
}

/**
 * Heights (greys, SEAM_STEP mm a step, `w` by `h`: see paintRelief) as the slopes the material reads, as his skin's
 * anatomy's are (see Maps): eased a texel each way first (a cord is round, a seam a groove, neither a step), then how
 * steep across the picture and down it, red and green, 128 level and 1 and 255 as steep as SEAM_STEEP says.
 */
export function seamSlopes(heights: Uint8Array, w: number, h: number): Uint8Array<ArrayBuffer> {
  // (in whole numbers: across, 1 2 1; then down, 1 2 1; sixteen times the eased height)
  const across = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    across[r] = 3 * heights[r] + heights[r + 1];
    for (let x = 1; x < w - 1; x++) across[r + x] = heights[r + x - 1] + 2 * heights[r + x] + heights[r + x + 1];
    across[r + w - 1] = heights[r + w - 2] + 3 * heights[r + w - 1];
  }
  const eased = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    const [r, u, d] = [y * w, Math.max(0, y - 1) * w, Math.min(h - 1, y + 1) * w];
    for (let x = 0; x < w; x++) eased[r + x] = across[u + x] + 2 * across[r + x] + across[d + x];
  }
  // (a step of the eased height either side, halved, in mm a texel: as a byte, looked up)
  const most = 16 * 255;
  const byte = new Uint8Array(2 * most + 1);
  for (let v = -most; v <= most; v++) byte[v + most] = Math.min(255, Math.max(1, Math.round(128 + (v * SEAM_STEP * 127) / (32 * SEAM_STEEP))));
  const out = new Uint8Array(w * h * 2);
  for (let y = 0; y < h; y++) {
    const [r, u, d] = [y * w, Math.max(0, y - 1) * w, Math.min(h - 1, y + 1) * w];
    out[r * 2] = byte[eased[r + 1] - eased[r] + most];
    for (let x = 1; x < w - 1; x++) out[(r + x) * 2] = byte[eased[r + x + 1] - eased[r + x - 1] + most];
    out[(r + w - 1) * 2] = byte[eased[r + w - 1] - eased[r + w - 2] + most];
    for (let x = 0; x < w; x++) out[(r + x) * 2 + 1] = byte[eased[d + x] - eased[u + x] + most];
  }
  return out;
}

/** His kit's seams' slopes, made the first time a court wants them and kept for the session (the shorts' height is the model's: the same every court). */
let SEAMS: { tall: number; bytes: Uint8Array<ArrayBuffer> } | null = null;

/**
 * His kit's seams as a texture for this court (see Detail): made the first time something asks for it (his full
 * material, or the step that draws it putting its pictures on the card), on the bytes kept for the session, and the same
 * one after. A phone that stays on his plain material never asks, and never pays for it. None where there is no page to
 * draw them on.
 */
function seamsOf(keep: <T extends { dispose(): void }>(o: T) => T, tall: number): (() => DataTexture) | null {
  if (typeof document === 'undefined') return null;
  let made: DataTexture | null = null;
  return () => {
    if (made) return made;
    if (SEAMS?.tall !== tall) SEAMS = { tall, bytes: seamSlopes(paintRelief(tall), SEAM_W, SEAM_H) };
    made = keep(new DataTexture(SEAMS.bytes, SEAM_W, SEAM_H, RGFormat, UnsignedByteType));
    made.generateMipmaps = true;
    made.minFilter = LinearMipmapLinearFilter;
    made.magFilter = LinearFilter;
    made.anisotropy = 4;
    made.needsUpdate = true;
    return made;
  };
}

/**
 * His fine grain for this court (see Detail). Its three pictures are made the first time something asks for them (his
 * full material, or the step that draws it putting its pictures on the card): by then the worker models.ts started has
 * long made them, and if not they are made here. A phone that stays on his plain material never asks.
 */
function detailOf(keep: <T extends { dispose(): void }>(o: T) => T, cloth: Vector4[], tubes: Vector4[], tall: number): Detail {
  const sq = new Vector3();
  let made: DataArrayTexture | null = null;
  const tiles = () => {
    if (made) return made;
    const { bytes, meanSq } = tilesOf();
    sq.set(...meanSq);
    made = keep(new DataArrayTexture(bytes, TILE, TILE, LAYERS));
    made.format = RGBAFormat;
    made.type = UnsignedByteType;
    made.wrapS = made.wrapT = RepeatWrapping;
    made.generateMipmaps = true;
    made.minFilter = LinearMipmapLinearFilter;
    made.magFilter = LinearFilter;
    made.anisotropy = 4;
    made.needsUpdate = true;
    return made;
  };
  return { tiles, cloth, tubes, sq, seams: seamsOf(keep, tall) };
}

/** How big his kit is on him, for its knit (see sheetUv), worked out once a figure model: each court built after has it from here. */
type Sized = { cloth: Vector4[]; tubes: Vector4[] };
const SIZED = new WeakMap<Thing, Sized>();

/** The shapes every figure shares (built once; `keep` takes each to throw away with the scene). `anat`: his skin's anatomy, where its map came (see Maps). */
export function figureGeo(keep: <T extends { dispose(): void }>(o: T) => T, model: Map<string, Thing>, faces?: ArrayBuffer, anat?: Anat): Geo {
  const fig = model.get('figure');
  if (!fig?.bones) throw new Error('figure.glb: no figure');
  const { geo, materials } = merged(fig);
  for (const p of fig.parts) p.geo.dispose();
  const order = fig.bones.map((b) => {
    const k = (B as Record<string, number | undefined>)[b.name];
    if (k === undefined) throw new Error(`figure.glb: a bone the puppet doesn't have (${b.name})`);
    return k;
  });
  const inverse = fig.bones.map((b) => b.inverse);
  const { shorts, piece, cloth, tubes } = sheetUv(geo, materials, order, inverse, SIZED.get(fig));
  SIZED.set(fig, { cloth, tubes });
  const fuzz = keep(fuzzOf(geo, piece));
  let shapes: Shapes | null = null;
  try {
    if (faces) shapes = readFaces(faces, geo);
  } catch (e) {
    console.warn(e);
  }
  let maps: Maps | null = null;
  try {
    if (anat) maps = mapsOf(keep, anat);
  } catch (e) {
    console.warn(e);
  }
  const blob = keep(new CircleGeometry(1.25, 20));
  blob.rotateX(-Math.PI / 2);
  const ring = keep(new RingGeometry(1.55, 1.85, 28));
  ring.rotateX(-Math.PI / 2);
  const wearing = wearer(keep, geo, piece);
  // (and the same man far off, on the same sheet: his shorts' picture reaches as far on it as on him)
  const low = model.get('figureFar');
  if (!low?.bones) throw new Error('figure.glb: no figureFar');
  const lowM = merged(low);
  for (const p of low.parts) p.geo.dispose();
  const lowOrder = low.bones.map((b) => {
    const k = (B as Record<string, number | undefined>)[b.name];
    if (k === undefined) throw new Error(`figure.glb: a bone the puppet doesn't have (${b.name})`);
    return k;
  });
  const lowInverse = low.bones.map((b) => b.inverse);
  const lowPiece = sheetUv(lowM.geo, lowM.materials, lowOrder, lowInverse, { cloth, tubes }, shorts).piece;
  // (the points stay for a head of curls' own fuzz, made when the first man who wears one comes on)
  const shell = geo;
  const coiled = new Map<string, BufferGeometry>();
  const fuzzFor = (name: string | null) => {
    if (name === null || !COILED.includes(name)) return fuzz;
    let g = coiled.get(name);
    if (!g) {
      g = keep(fuzzOf(shell, piece, name));
      coiled.set(name, g);
    }
    return g;
  };
  return {
    body: wearing(null),
    wearing,
    wears: materials,
    order,
    inverse,
    shorts,
    fuzz,
    fuzzFor,
    shapes,
    maps,
    detail: detailOf(keep, cloth, tubes, shorts[1] - shorts[0]),
    blob,
    ring,
    cuffs: cuffMaker(geo, order, inverse),
    cuffMat: keep(new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: DoubleSide })),
    far: { wearing: wearer(keep, lowM.geo, lowPiece), order: lowOrder, inverse: lowInverse },
  };
}

/**
 * A body with one of its pieces of hair on it (or none), in high shoes or low: each is the same points with other
 * triangles left out, one set of points for every man, made the first time it is asked for. `piece`: which piece of
 * hair each triangle is of (sheetUv's).
 */
function wearer(keep: <T extends { dispose(): void }>(o: T) => T, geo: BufferGeometry, piece: string[]): Geo['wearing'] {
  const all = Array.from(geo.index!.array as ArrayLike<number>);
  const made = new Map<string, BufferGeometry>();
  return (name, high = true) => {
    const key = name !== null && PIECES.includes(name) ? name : null;
    let g = made.get(`${key} ${high}`);
    if (!g) {
      g = keep(new BufferGeometry());
      for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
      const on = (p: string) => p === '' || p === key || (high && p === HIGH);
      const tris = all.filter((_v, i) => on(piece[Math.floor(i / 3)]));
      g.setIndex(geo.getAttribute('position').count > 65535 ? tris : new BufferAttribute(Uint16Array.from(tris), 1));
      made.set(`${key} ${high}`, g);
    }
    return g;
  };
}

/**
 * His hair's fuzz: how many layers of it, and how far past his hair the outermost stands (ft: a few millimetres on
 * a crop, and a share more of however far his hair stands off his scalp); and its strands, this many to the foot of
 * him as built (a clump of hairs a millimetre or so across).
 */
const FUZZ_LAYERS = 6;
const FUZZ_OUT = [0.014, 0.33] as const;
/** How far a strand's end lies back and down from over its root (a share of its length): hair lies, it does not stand on end. */
const FUZZ_LIE = 0.9;
const STRANDS = 230;

/**
 * The triangles of his head where hair can grow (over the lowest of hairlines, down to his nape and his sideburns),
 * again FUZZ_LAYERS times, each layer a vertex attribute `fuzz` (its share of the way out: see stuffMaterial). Its
 * material draws a strand where one stands, fewer in each layer out, so his hair's edge against the light is single
 * hairs and its outline broken, and close up it has depth: not a cap painted on his head.
 */
function fuzzOf(geo: BufferGeometry, piece: string[], coils: string | null = null): BufferGeometry {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const index = geo.index!;
  const [hu0, hv0, hu1, hv1] = HEAD_UV.map(Number);
  // (the ears' strip along the foot of the head's picture is theirs)
  const earTop = 1 - R_EAR[1] / SHEET;
  const hairy = (v: number) => {
    const u = uv.getX(v);
    const w = uv.getY(v);
    if (u < hu0 || u > hu1 || w < Math.max(hv0, earTop) || w > hv1) return false;
    const nx = pos.getX(v) / HEAD_SIZE[0];
    const ny = (pos.getY(v) - HEAD_REST - HEAD_MID.y) / HEAD_SIZE[1];
    const nz = (pos.getZ(v) - HEAD_MID.z) / HEAD_SIZE[2];
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) return false;
    // (and where a beard grows: his jaw and chin, round his mouth, his cheeks up to his sideburns. Its strands stand
    // where his picture says there is a beard, and nowhere else: a clean-shaven man's are none, see stuffMaterial)
    const [ux, uy, uz] = [Math.abs(nx) / len, ny / len, nz / len];
    if (uy < 0.3 && uy > -0.97 && uz > -0.3 + 0.35 * Math.max(0, uy) && !(uz > 0.35 && uy > -0.12)) return true;
    return uy > hairlineAt(Math.atan2(ux, uz)) - 0.2;
  };
  const keep = new Map<number, number>();
  const curled = new Set<number>();
  const from: number[] = [];
  const tris: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const vs = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    // (`coils`: a head of curls that is a shape of its own is in it too, all of it: its curls stand off it, see COILED)
    if (piece[t / 3] === '' ? !vs.every(hairy) : piece[t / 3] !== coils) continue;
    if (piece[t / 3] !== '') for (const v of vs) curled.add(v);
    for (const v of vs) {
      if (!keep.has(v)) {
        keep.set(v, from.length);
        from.push(v);
      }
      tris.push(keep.get(v)!);
    }
  }
  const out = new BufferGeometry();
  const n = from.length;
  for (const [name, a] of Object.entries(geo.attributes)) {
    // (his skin's map's uv is not wanted on his hair: its material reads no map)
    if (name === 'uv1') continue;
    const src = a.array as ArrayLike<number>;
    const size = a.itemSize;
    const arr = new (a.array.constructor as new (k: number) => Float32Array)(n * FUZZ_LAYERS * size);
    for (let l = 0; l < FUZZ_LAYERS; l++) for (let j = 0; j < n; j++) for (let c = 0; c < size; c++) arr[(l * n + j) * size + c] = src[from[j] * size + c];
    out.setAttribute(name, new BufferAttribute(arr, size, a.normalized));
  }
  const layer = new Float32Array(n * FUZZ_LAYERS);
  for (let l = 0; l < FUZZ_LAYERS; l++) layer.fill((l + 1) / FUZZ_LAYERS, l * n, (l + 1) * n);
  out.setAttribute('fuzz', new BufferAttribute(layer, 1));
  // (how far each point of a head of curls stands off his scalp (ft): where it comes down to his hairline its coils are
  // short, none at its very edge, or they hang over his forehead as a row of teeth. Every other point: far)
  const stand = new Float32Array(n * FUZZ_LAYERS).fill(1);
  if (coils) {
    const cell = 0.04;
    const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const scalp = new Map<string, number[]>();
    for (let t = 0; t < index.count; t += 3)
      if (piece[t / 3] === '')
        for (let k = 0; k < 3; k++) {
          const v = index.getX(t + k);
          if (!hairy(v)) continue;
          const at = key(pos.getX(v), pos.getY(v), pos.getZ(v));
          (scalp.get(at) ?? scalp.set(at, []).get(at)!).push(v);
        }
    for (let j = 0; j < n; j++) {
      const v = from[j];
      if (!curled.has(v)) continue;
      const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      let near = 1;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const w of scalp.get(key(x + dx * cell, y + dy * cell, z + dz * cell)) ?? []) near = Math.min(near, Math.hypot(pos.getX(w) - x, pos.getY(w) - y, pos.getZ(w) - z));
      for (let l = 0; l < FUZZ_LAYERS; l++) stand[l * n + j] = near;
    }
  }
  out.setAttribute('stand', new BufferAttribute(stand, 1));
  out.setIndex(Array.from({ length: FUZZ_LAYERS }, (_v, l) => tris.map((v) => v + l * n)).flat());
  // (which of the body's points each of its points is: a man's own face moves them with it, see ownShape)
  out.userData.from = Int32Array.from({ length: n * FUZZ_LAYERS }, (_v, k) => from[k % n]);
  return out;
}

/**
 * His twists, each a lock of its own (its triangles joined): how far along it from its root each of its points is (a
 * share of its length, along its line as it bends) and how far round it (a turn, 0 to 1), and a number of each twist's own, three numbers a point; none where a point is no twist's.
 * Its root is where it is nearest his head's middle (it grows out of his scalp), its line from there to the furthest
 * point of it: a twist falls over a little, but not so far that round its line is not round it.
 */
function twistsOf(pos: BufferGeometry['attributes'][string], index: BufferAttribute, wear: string[]): Float32Array {
  const n = pos.count;
  const out = new Float32Array(n * 3);
  const parent = Int32Array.from({ length: n }, (_v, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (wear[a] !== 'twists') continue;
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const locks = new Map<number, number[]>();
  for (let v = 0; v < n; v++)
    if (wear[v] === 'twists') {
      const r = find(v);
      (locks.get(r) ?? locks.set(r, []).get(r)!).push(v);
    }
  const mid = new Vector3(0, HEAD_REST + HEAD_MID.y, HEAD_MID.z);
  const [p, root, axis, e1, e2, q, t] = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  let lockNo = 0;
  for (const vs of locks.values()) {
    // (its root: where it is nearest his head's middle, a ring of it; its end: the furthest point of it from there)
    const by = vs.map((v) => [p.fromBufferAttribute(pos, v).distanceToSquared(mid), v]).sort((x, y) => x[0] - y[0]);
    root.set(0, 0, 0);
    const k = Math.min(6, by.length);
    for (let i = 0; i < k; i++) root.add(p.fromBufferAttribute(pos, by[i][1]));
    root.divideScalar(k);
    let far = 0;
    for (const v of vs) {
      const d = p.fromBufferAttribute(pos, v).distanceTo(root);
      if (d > far) {
        far = d;
        axis.copy(p);
      }
    }
    axis.sub(root).normalize();
    // (its line, as it bends: the middle of its points a few lengths along at a time, root to end)
    const spine: Vector3[] = [root.clone()];
    for (let b = 1; b < TWIST_SPINE; b++) {
      const c = new Vector3();
      let w = 0;
      for (const v of vs) {
        p.fromBufferAttribute(pos, v);
        const k2 = 1 - Math.abs((q.subVectors(p, root).dot(axis) / far) * TWIST_SPINE - b);
        if (k2 > 0) {
          c.addScaledVector(p, k2);
          w += k2;
        }
      }
      spine.push(w > 0 ? c.divideScalar(w) : root.clone().addScaledVector(axis, (far * b) / TWIST_SPINE));
    }
    spine.push(root.clone().addScaledVector(axis, far));
    const lens = [0];
    for (let i = 1; i < spine.length; i++) lens.push(lens[i - 1] + spine[i].distanceTo(spine[i - 1]));
    const whole = lens[lens.length - 1] || 1;
    // (round it: one way across it, the same all down it, square to its line where each point is)
    e1.set(0.3, 0.2, 1).cross(axis).normalize();
    // (and each twist its own: a number of its own for the material, see TWIST)
    const own = (lockNo++ * 0.6180339887) % 1;
    for (const v of vs) {
      p.fromBufferAttribute(pos, v);
      let best = Infinity;
      let along = 0;
      for (let i = 1; i < spine.length; i++) {
        t.subVectors(spine[i], spine[i - 1]);
        const l2 = t.lengthSq() || 1;
        const u = Math.min(1, Math.max(0, q.subVectors(p, spine[i - 1]).dot(t) / l2));
        const d = q
          .copy(spine[i - 1])
          .addScaledVector(t, u)
          .distanceToSquared(p);
        if (d < best) {
          best = d;
          along = (lens[i - 1] + u * (lens[i] - lens[i - 1])) / whole;
          axis.copy(t).normalize();
          root.copy(q);
        }
      }
      q.copy(e1).addScaledVector(axis, -e1.dot(axis)).normalize();
      e2.crossVectors(axis, q);
      p.sub(root);
      out[v * 3] = along;
      out[v * 3 + 1] = Math.atan2(p.dot(e2), p.dot(q)) / (2 * Math.PI) + 0.5;
      out[v * 3 + 2] = own;
    }
  }
  return out;
}

/** A number folded into 0..1 and back (0, 1, 0, 1 at each whole step): a picture laid by it repeats with no seam. */
const fold = (v: number) => Math.abs((((v % 2) + 2) % 2) - 1);

/** How far round him a point is, in turns from his left side (the back a quarter of the way, the front three): the vest's own way. */
const round = (x: number, z: number) => ((((Math.atan2(x, z) - Math.PI / 2) / (2 * Math.PI)) % 1) + 1) % 1;

/** Of the pictures of his skin, the one a triangle across two of them takes (its other points are put on it too): his head over an arm over a leg over his trunk. */
const OVER: Partial<Record<Pic, number>> = { [Pic.Head]: 4, [Pic.ArmL]: 3, [Pic.ArmR]: 3, [Pic.LegL]: 2, [Pic.LegR]: 2, [Pic.Skin]: 1 };

/**
 * Puts every point of the body on the sheet (its uv), by what it is (the model's material) and where it
 * is on him as built (by the bones it hangs on): the vest keeps the model's picture; the shorts go round
 * him; his head round its middle; an arm or a leg down its strip; a shoe along and round the foot.
 * Each triangle takes one picture (one across two pictures of his skin, the one OVER says; one across a
 * picture's seam, the picture a turn on), its points twinned where they have to be somewhere else for
 * it; the parts become one. Says how high the shorts reach, and which piece of hair each triangle is of ('' for none);
 * and how big his kit is on him there, for its knit (see Detail): ft a uv across and up the pictures of it that are
 * flat (`cloth`), and the tubes the rest of it is round (`tubes`). Those are the model's alone: given them (`sized`, as
 * worked out for this model before), they are not worked out again. `reach`: how high the shorts reach, where another
 * body of his has said (his far one's are the near one's).
 */
function sheetUv(
  geo: BufferGeometry,
  wears: string[],
  order: number[],
  inverse: Matrix4[],
  sized?: Sized,
  reach?: [number, number],
): { shorts: [number, number]; piece: string[] } & Sized {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const on = geo.getAttribute('skinIndex');
  const by = geo.getAttribute('skinWeight');
  const index = geo.index!;
  const n = pos.count;
  // (what each point is, by the part its triangles are in)
  const wear: string[] = new Array<string>(n).fill('skin');
  for (const g of geo.groups) for (let i = g.start; i < g.start + g.count; i++) wear[index.getX(i)] = wears[g.materialIndex ?? 0];
  const inv: Matrix4[] = [];
  order.forEach((k, i) => (inv[k] = inverse[i]));
  const twist = twistsOf(pos, index, wear);
  const mhuv = geo.getAttribute('uv1');
  if (mhuv) for (let v = 0; v < n; v++) if (wear[v] === 'twists') mhuv.setXY(v, Math.cos(2 * Math.PI * twist[v * 3 + 1]), Math.sin(2 * Math.PI * twist[v * 3 + 1]));
  const weight = (v: number, bones: number[]) => {
    let w = 0;
    for (let c = 0; c < 4; c++) if (bones.includes(order[on.getComponent(v, c)])) w += by.getComponent(v, c);
    return w;
  };
  let lo = Infinity;
  let hi = -Infinity;
  for (let v = 0; v < n; v++)
    if (wear[v] === 'cloth') {
      lo = Math.min(lo, pos.getY(v));
      hi = Math.max(hi, pos.getY(v));
    }
  lo -= SHORTS_PAST;
  hi += SHORTS_PAST;
  // (a second body of the same man, far off, takes the first's: one picture of his shorts lies on both the same)
  if (reach) [lo, hi] = reach;
  const P = new Vector3();
  const L = new Vector3();
  /** Which picture a point is in. */
  const own = (v: number): Pic => {
    P.fromBufferAttribute(pos, v);
    const w = wear[v];
    const foot = inv[P.x > 0 ? B.ftl : B.ftr];
    if (w === 'jersey') return Pic.Vest;
    if (w === 'trim') return Pic.Trim;
    if (w === 'cloth') return Pic.Shorts;
    if (w === 'shoe') return Pic.Shoe;
    if (w === 'collar' || w === 'high') return Pic.Collar;
    if (w === 'ear') return Pic.Ear;
    if (w === 'mouth' || w === 'tongue') return Pic.Mouth;
    if (w === 'teeth' || w === 'gum') return Pic.Teeth;
    if (PIECES.includes(w)) return Pic.Hair;
    // (the white below the ankle is a sole; above it, a sock: the bottom of its leg's strip)
    if (w === 'white') return L.copy(P).applyMatrix4(foot).y < -0.06 ? Pic.Sole : P.x > 0 ? Pic.LegL : Pic.LegR;
    // (his head is all his head bone's, with his jaw and nose; his neck, which shares it with his chest, is his trunk's skin)
    if (weight(v, [B.head, B.jaw, B.nose, B.brow, B.lip]) >= 0.995) return Pic.Head;
    // (his fingers and thumb are the ends of his arms' strips)
    if (weight(v, ARM_BONES[0]) + 0.5 * weight(v, [B.cll, B.axl]) >= 0.5) return Pic.ArmL;
    if (weight(v, ARM_BONES[1]) + 0.5 * weight(v, [B.clr, B.axr]) >= 0.5) return Pic.ArmR;
    if (weight(v, [B.thl, B.shl, B.ftl, B.hemL]) >= 0.5) return Pic.LegL;
    if (weight(v, [B.thr, B.shr, B.ftr, B.hemR]) >= 0.5) return Pic.LegR;
    return Pic.Skin;
  };
  /** Where a point is in a picture: across it and up it, each 0..1 (one that goes round, in turns). */
  const place = (v: number, k: Pic): [number, number] => {
    P.fromBufferAttribute(pos, v);
    const left = P.x > 0;
    switch (k) {
      case Pic.Vest:
        return [uv.getX(v), uv.getY(v) / VEST_TOP];
      case Pic.Shorts:
        return [round(P.x, P.z), (P.y - lo) / (hi - lo)];
      case Pic.Shoe:
      case Pic.Sole:
        // (along the foot from the heel; round it from under the sole, the top of the foot half way and his outside three quarters; a sole, up it)
        L.copy(P).applyMatrix4(inv[left ? B.ftl : B.ftr]);
        return [(L.z - SHOE_Z[0]) / (SHOE_Z[1] - SHOE_Z[0]), k === Pic.Shoe ? 0.5 + Math.atan2(left ? L.x : -L.x, L.y - SHOE_MID) / (2 * Math.PI) : (L.y + ANKLE) / SOLE_H];
      case Pic.Collar:
        // (round his ankle from behind it: the tongue is half way round, his outside three quarters; and up it)
        L.copy(P).applyMatrix4(inv[left ? B.ftl : B.ftr]);
        return [0.5 + Math.atan2(left ? L.x : -L.x, L.z + 0.03) / (2 * Math.PI), (L.y - COLLAR_Y[0]) / (COLLAR_Y[1] - COLLAR_Y[0])];
      case Pic.Head:
        // (his head, hair and all, round its middle from behind: his face is half way round)
        L.copy(P).applyMatrix4(inv[B.head]).sub(HEAD_MID);
        return [headU(Math.atan2(L.x, L.z)) % 1, headV(Math.atan2(L.y, Math.hypot(L.x, L.z)))];
      case Pic.Hair:
        // (the hair's picture laid over him again and again, each time the other way round so it has no edge: combed
        // hair, in the left half of it, runs down a lock; a head of curls, in the right, is tufts every way)
        // (hair gathered in a tail or a bun is combed strands and nothing else: between two of the picture's turns of a lock)
        if (wear[v] === 'tail' || wear[v] === 'bun') return [0.02 + 0.46 * 0.068, fold(P.x * 7.3 + P.z * 5.9)];
        // (a twist: down it and round it, its own way: see TWIST)
        // (a twist: its own quarter of it, how far along it a point is across that; how far round it is in his skin's
        // map's uv, which a twist has no use for, as a turn's cosine and sine (no seam where it comes round): its two
        // strands are drawn by the material, see TWIST)
        if (wear[v] === 'twists') return [0.02 + 0.22 * twist[v * 3], 0.1 + 0.8 * twist[v * 3 + 2]];
        return TUFTED.includes(wear[v]) ? [0.52 + 0.46 * fold(P.x * 2.3 + P.y * 0.9), fold(P.z * 6.4 + P.y * 3.7)] : [0.26 + 0.22 * fold(P.y * 1.7), fold(P.x * 7.3 + P.z * 5.9)];
      case Pic.Mouth:
      case Pic.Teeth:
        // (the dark of his mouth and his teeth are the first half of their pictures across; his tongue and his gum the second)
        return [wear[v] === 'tongue' || wear[v] === 'gum' ? 0.75 : 0.25, 0.5];
      case Pic.ArmL:
      case Pic.ArmR:
        return [-L.copy(P).applyMatrix4(inv[k === Pic.ArmL ? B.ual : B.uar]).y / ARM_LEN, 0.5];
      case Pic.LegL:
      case Pic.LegR:
        return [-L.copy(P).applyMatrix4(inv[k === Pic.LegL ? B.thl : B.thr]).y / LEG_LEN, 0.5];
      default:
        return [0.5, 0.5];
    }
  };
  const mine = Array.from({ length: n }, (_v, v) => own(v));

  // each triangle's picture, and where its corners are in it; a corner somewhere else than its point is a twin
  const corners = Array.from(index.array as ArrayLike<number>);
  const piece: string[] = [];
  for (let f = 0; f < corners.length; f += 3) piece.push(PIECES.includes(wear[corners[f]]) || wear[corners[f]] === HIGH ? wear[corners[f]] : '');
  const twins = new Map<string, number>();
  const made: { v: number; k: Pic; at: [number, number] }[] = [];
  const pics: Pic[] = [];
  const at: [number, number][] = mine.map((k, v) => place(v, k));
  for (let f = 0; f < corners.length; f += 3) {
    const vs = [corners[f], corners[f + 1], corners[f + 2]];
    let k = mine[vs[0]];
    for (const v of vs) if ((OVER[mine[v]] ?? 0) > (OVER[k] ?? 0)) k = mine[v];
    pics.push(k);
    const where = vs.map((v) => (mine[v] === k ? at[v] : place(v, k)));
    const way = ROUND[k];
    const across = way !== undefined && Math.max(...where.map((w) => w[way])) - Math.min(...where.map((w) => w[way])) > 0.5;
    for (let i = 0; i < 3; i++) {
      const v = vs[i];
      const turn = across && where[i][way!] < 0.5 ? 1 : 0;
      if (mine[v] === k && !turn) continue;
      const key = `${v} ${k} ${turn}`;
      let w = twins.get(key);
      if (w === undefined) {
        w = n + made.length;
        twins.set(key, w);
        const p: [number, number] = [...where[i]];
        if (turn) p[way!] += 1;
        made.push({ v, k, at: p });
      }
      corners[f + i] = w;
    }
  }
  const total = n + made.length;
  for (const [name, a] of Object.entries(geo.attributes)) {
    const Kind = a.array.constructor as new (length: number) => typeof a.array;
    const arr = new Kind(total * a.itemSize);
    arr.set(a.array);
    made.forEach(({ v }, i) => {
      for (let c = 0; c < a.itemSize; c++) arr[(n + i) * a.itemSize + c] = a.array[v * a.itemSize + c];
    });
    geo.setAttribute(name, new BufferAttribute(arr, a.itemSize, a.normalized));
  }
  // onto the sheet: a picture that goes round has room for its run past the seam; any other stays off its edges
  const out = new Float32Array(total * 2);
  const put = (i: number, k: Pic, [a, b]: [number, number]) => {
    const [x, y, w, h] = RECT[k];
    const way = ROUND[k];
    if (way === 0 || k === Pic.Vest) a = (a + WRAP) / (1 + 2 * WRAP);
    if (way === 1) b = (b + WRAP) / (1 + 2 * WRAP);
    if (k !== Pic.Vest) {
      a = Math.min(0.995, Math.max(0.005, a));
      b = Math.min(0.98, Math.max(0.02, b));
    }
    out[i * 2] = (x + a * w) / SHEET;
    out[i * 2 + 1] = 1 - (y + (1 - b) * h) / SHEET;
  };
  for (let v = 0; v < n; v++) put(v, mine[v], at[v]);
  made.forEach(({ k, at: p }, i) => put(n + i, k, p));
  geo.setAttribute('uv', new BufferAttribute(out, 2));
  geo.setIndex(total > 65535 ? corners : new BufferAttribute(Uint16Array.from(corners), 1));
  geo.clearGroups();
  if (sized) return { shorts: [lo, hi], piece, ...sized };

  // how big each flat picture of his kit is on him: each of its triangles says how far (ft) a step across its uv goes,
  // and one up it, and the picture takes the middle of what they say (by their size: a sliver at a seam says little)
  const all = geo.getAttribute('position');
  const feet = (k: Pic): [number, number] => {
    const say: [number, number, number][] = [];
    const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
    for (let f = 0; f < corners.length; f += 3) {
      if (pics[f / 3] !== k) continue;
      const [i, j, l] = [corners[f], corners[f + 1], corners[f + 2]];
      a.fromBufferAttribute(all, i);
      b.fromBufferAttribute(all, j).sub(a);
      c.fromBufferAttribute(all, l).sub(a);
      const [u1, v1, u2, v2] = [out[j * 2] - out[i * 2], out[j * 2 + 1] - out[i * 2 + 1], out[l * 2] - out[i * 2], out[l * 2 + 1] - out[i * 2 + 1]];
      const det = u1 * v2 - u2 * v1;
      if (Math.abs(det) < 1e-12) continue;
      // (the triangle's two edges, as steps across the uv and up it: each a way through him, ft a uv)
      const across = b
        .clone()
        .multiplyScalar(v2 / det)
        .addScaledVector(c, -v1 / det)
        .length();
      const up = c
        .clone()
        .multiplyScalar(u1 / det)
        .addScaledVector(b, -u2 / det)
        .length();
      say.push([across, up, b.cross(c).length()]);
    }
    const middle = (w: 0 | 1) => {
      const sorted = [...say].sort((p, q) => p[w] - q[w]);
      let left = sorted.reduce((t, p) => t + p[2], 0) / 2;
      for (const p of sorted) if ((left -= p[2]) <= 0) return p[w];
      return 0;
    };
    return say.length ? [middle(0), middle(1)] : [0, 0];
  };
  const cloth = [new Vector4(...feet(Pic.Vest), ...feet(Pic.Shorts)), new Vector4(...feet(Pic.Shoe), ...feet(Pic.Collar))];

  // and the tubes the rest of it goes round (a trim, a strip down a limb, where no picture is flat): the line each runs
  // along (its left side's, as built: a point on it, ft; and which way it runs) and how far round it a foot is (ft a
  // radian: the middle of how far its points are off the line). His trunk, upright through his vest's armholes; an arm
  // (his hand is not in it) and a leg (nor his foot), each the way its points lie longest; then his collar and his
  // waistband, each upright too (where its middle is across and front to back, how far round it a foot is, and the
  // furthest across or the highest a point of it is)
  const tube = (on: (v: number) => boolean, up: Vector3 | null): Vector4[] => {
    const ps: Vector3[] = [];
    for (let v = 0; v < n; v++) if (on(v)) ps.push(new Vector3().fromBufferAttribute(pos, v));
    if (!ps.length) return [new Vector4(), new Vector4(0, 1, 0, 0)];
    const mid = ps.reduce((m, p) => m.add(p), new Vector3()).divideScalar(ps.length);
    let dir = up ?? new Vector3(0, -1, 0);
    if (!up) {
      // (the longest way through them: a few turns of their spread about the middle)
      const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const p of ps) {
        const d = [p.x - mid.x, p.y - mid.y, p.z - mid.z];
        for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) cov[r * 3 + q] += d[r] * d[q];
      }
      for (let it = 0; it < 40; it++)
        dir = new Vector3(
          cov[0] * dir.x + cov[1] * dir.y + cov[2] * dir.z,
          cov[3] * dir.x + cov[4] * dir.y + cov[5] * dir.z,
          cov[6] * dir.x + cov[7] * dir.y + cov[8] * dir.z,
        ).normalize();
      if (dir.y > 0) dir.negate();
    }
    const off = ps.map((p) => p.clone().sub(mid).addScaledVector(dir, -p.clone().sub(mid).dot(dir)).length()).sort((p, q) => p - q);
    return [new Vector4(mid.x, mid.y, mid.z, off[off.length >> 1]), new Vector4(dir.x, dir.y, dir.z, 0)];
  };
  const along = (v: number, k: Pic) =>
    k === Pic.ArmL ? -L.copy(P.fromBufferAttribute(pos, v)).applyMatrix4(inv[B.ual]).y / ARM_LEN : -L.copy(P.fromBufferAttribute(pos, v)).applyMatrix4(inv[B.thl]).y / LEG_LEN;
  // (round his trunk each band of trim is its own: his armholes', his collar's and his shorts' waistband, each upright
  // through its own middle and as far round as it mostly is, so its ribs stand up it all the way round (one round as far
  // as each point is would lean them over toward his back). Below hi - 0.2 the trim is his shorts': round his legs at
  // the hem and down their sides)
  const up = new Vector3(0, 1, 0);
  const trim = (v: number, vest: boolean) => wear[v] === 'trim' && pos.getY(v) > (vest ? hi + VEST_TRIM : hi - 0.2) && (vest || pos.getY(v) <= hi + VEST_TRIM);
  const trunk = tube((v) => trim(v, true) && Math.abs(pos.getX(v)) >= COLLAR_X, up);
  const [collar] = tube((v) => trim(v, true) && Math.abs(pos.getX(v)) < COLLAR_X, up);
  const [waist] = tube((v) => trim(v, false), up);
  trunk[1].w = hi - 0.2;
  const arm = tube((v) => mine[v] === Pic.ArmL && along(v, Pic.ArmL) < HAND_FROM[0] / ARM_LEN, null);
  const leg = tube((v) => mine[v] === Pic.LegL && pos.getY(v) > 0.35, null);
  const bands = [new Vector4(collar.x, collar.z, collar.w, COLLAR_X), new Vector4(waist.x, waist.z, waist.w, hi + VEST_TRIM)];
  return { shorts: [lo, hi], piece, cloth, tubes: [...trunk, ...arm, ...leg, ...bands] };
}

// ---------------------------------------------------------------- what he is made of

/** Each kind of stuff: how rough it is, how much of a cloth's sheen it has, how much of its knit shows up close (the stuff picture holds these, a channel each). */
const STUFF = {
  // (skin says so with all of the second channel: the material lights it as skin, see stuffMaterial)
  // (skin under an arena's lamps has a shine: a broad soft one, and over it the sharper one of the oil and sweat on it, see RE_Direct_Skin)
  skin: [0.57, 1, 0],
  face: [0.5, 1, 0],
  // (where he sweats: his brow, his shoulders; a sheen, not oil)
  sweat: [0.5, 1, 0],
  scalp: [0.5, 1, 0],
  // (the crown of a shaved head: skin drawn over bone, a touch smoother than his shoulders and no more. It is the one
  // part of him that faces straight up at a bank of lamps: any smoother, and it wore a white oval the size of his
  // hand in every shot from above)
  dome: [0.56, 1, 0],
  hand: [0.6, 1, 0],
  lip: [0.48, 1, 0],
  wetLip: [0.36, 1, 0],
  eye: [0.08, 1, 0],
  // (hair is a mass of fine strands, not a shell: little of a sheen, and that broken)
  hair: [0.84, 0.16, 0],
  curl: [0.95, 0.1, 0],
  beard: [0.88, 0.12, 0],
  // (hair plaited tight to his scalp or locked: no loose strand of it stands off him (its second channel is under the
  // fuzz's, see stuffMaterial: a stray strand over a row or between his locks is grey fluff), and the least of a sheen)
  plait: [0.78, 0.04, 0],
  // (stubble is hair too, but the ends of it under his skin: no strand of it stands off him, see fuzzOf; it is lit as
  // the skin it is mostly, not as a hair's sheen, which greys it over a dark skin)
  stubble: [0.72, 0.78, 0],
  vest: [0.8, 0.85, 1],
  // (a number is pressed on: smoother than the knit round it, and none of its sheen)
  print: [0.55, 0.12, 0],
  shorts: [0.68, 0.9, 0.7],
  rib: [0.8, 0.6, 0.45],
  sock: [0.92, 0.7, 0.55],
  sleeve: [0.5, 0.45, 0.25],
  terry: [0.95, 0.85, 0.8],
  tape: [0.7, 0.2, 0.15],
  // (a headband: terry too, but on his head its second channel says how much of his skin a point is, and it is none)
  band: [0.95, 0.3, 0],
  leather: [0.4, 0, 0],
  // (behind his lips: wet teeth, wetter gums and tongue (its papillae break its shine up a little), and the dark)
  tooth: [0.2, 0, 0],
  gum: [0.26, 0, 0],
  tongue: [0.34, 0, 0],
  gullet: [0.9, 0, 0],
  mesh: [0.7, 0.2, 0.6],
  lace: [0.8, 0.3, 0.3],
  rubber: [0.62, 0, 0],
} as const satisfies Record<string, readonly [number, number, number]>;
type Stuff = keyof typeof STUFF;
const stuffColor = (k: Stuff) => `rgb(${STUFF[k].map((v) => Math.round(v * 255)).join(',')})`;
/** A colour, or (on the stuff picture) the stuff it is. */
type Pick = (color: string, stuff: Stuff) => string;

const mixC = new Color();
const mixD = new Color();
/** Two colours mixed (t of the second). */
function mix(a: string, b: string, t: number): string {
  return `#${mixC.set(a).lerp(mixD.set(b), t).getHexString()}`;
}
/** How light a colour is, 0..1 (near enough). */
function light(c: string): number {
  mixC.set(c).convertLinearToSRGB();
  return 0.3 * mixC.r + 0.59 * mixC.g + 0.11 * mixC.b;
}

/** Draws in a place on a picture laid out as the sheet is, in the sheet's own pixels (0, 0 the place's corner; `k` the picture's size against the sheet's). */
function within(ctx: CanvasRenderingContext2D, k: number, r: Rect, draw: (ctx: CanvasRenderingContext2D) => void) {
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(r[0], r[1], r[2], r[3]);
  ctx.clip();
  ctx.translate(r[0], r[1]);
  draw(ctx);
  ctx.restore();
}

/**
 * A picture that goes round him, in its place `r` (drawn in, see within): `pw` wide for one turn and `ph` high, with
 * `top` and `bottom` the share of the place it fills that its top and bottom rows are at; it's drawn again a turn
 * either side, for the run past the seam.
 */
function turns(ctx: CanvasRenderingContext2D, r: Rect, pw: number, ph: number, top: number, bottom: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const sx = r[2] / (pw * (1 + 2 * WRAP));
  const sy = (r[3] * (top - bottom)) / ph;
  for (const turn of [-1, 0, 1]) {
    ctx.save();
    ctx.translate((WRAP + turn) * pw * sx, (1 - top) * r[3]);
    ctx.scale(sx, sy);
    draw(ctx);
    ctx.restore();
  }
}

/** The two pictures being painted, and painting on both at once. */
class Sheet {
  readonly cv = document.createElement('canvas');
  readonly stuff = document.createElement('canvas');
  /** The head painted on it (which may be a quick one yet). */
  head: Wanted | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sctx: CanvasRenderingContext2D;
  constructor() {
    this.cv.width = this.cv.height = SHEET;
    this.stuff.width = this.stuff.height = SHEET / STUFF_K;
    this.ctx = this.cv.getContext('2d')!;
    this.sctx = this.stuff.getContext('2d')!;
  }

  /** A plain patch. */
  fill(r: Rect, color: string, stuff: Stuff) {
    this.both(r, (ctx, pick) => {
      ctx.fillStyle = pick(color, stuff);
      ctx.fillRect(0, 0, r[2], r[3]);
    });
  }

  /** Draws in a place on the sheet in its own pixels (0, 0 its corner), on both pictures. */
  both(r: Rect, draw: (ctx: CanvasRenderingContext2D, pick: Pick) => void) {
    for (const [ctx, k, pick] of [
      [this.ctx, 1, (c: string) => c],
      [this.sctx, 1 / STUFF_K, (_c: string, s: Stuff) => stuffColor(s)],
    ] as const)
      within(ctx, k, r, (c) => draw(c, pick));
  }

  /** A picture that goes round him (see turns), on both pictures. */
  around(r: Rect, pw: number, ph: number, draw: (ctx: CanvasRenderingContext2D, pick: Pick) => void, top = 1, bottom = 0) {
    this.both(r, (ctx, pick) => turns(ctx, r, pw, ph, top, bottom, (c) => draw(c, pick)));
  }

  /** A picture made a point at a time (see points), put in its place on both. */
  put(r: Rect, pic: Points) {
    for (const [ctx, k, cv] of [
      [this.ctx, 1, pic.color],
      [this.sctx, 1 / STUFF_K, pic.stuff],
    ] as const) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cv, r[0] * k, r[1] * k, r[2] * k, r[3] * k);
      ctx.restore();
    }
  }
}

/** A picture made a point at a time: its colour, and its stuff (in whose third channel, a knit's elsewhere, how far it stands off him). */
interface Points {
  color: HTMLCanvasElement;
  stuff: HTMLCanvasElement;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/**
 * As far as a forearm turns and a wrist bends on a hand that is told where to lie (on the ball, by its palm and its
 * fingers): ARM_PRON palm down or back, ARM_SUP palm up or forward (radians from the palm facing in); the wrist
 * WRIST_FLEX toward the palm, WRIST_EXT back (a shooter's cocked wrist), WRIST_DEV to either side. Past them a hand
 * put on the ball by its palm was wrung right round its forearm (a palm on the leather, a forearm turned a half turn
 * under it), or bent back flat: it lies on the ball as far as a wrist lets it.
 */
const ARM_PRON = 1.45;
const ARM_SUP = 1.5;
const WRIST_FLEX = 1.25;
const WRIST_EXT = 1.35;
const WRIST_DEV = 0.55;
const LW_T = new Quaternion();
const LW_S = new Quaternion();
const LW_W = new Quaternion();
const LW_F = new Vector3();
const LW_D = new Vector3(0, -1, 0);
/**
 * The hand (`hand`, its bone's turn) against its forearm (`fore`), kept to a forearm's and a wrist's (see ARM_PRON):
 * its turn split into the part about the forearm's own line (the forearm's: pronation, `way` 1 the right hand's, -1 the
 * left's) and the rest (the wrist's: its fingers off the forearm's line, toward the palm (the bone's x on the right
 * hand, -x on the left) or back, and to the side), each held to its own, and put back together. In place.
 */
function limitWrist(fore: Quaternion, hand: Quaternion, way: number) {
  const q = LW_S.copy(fore).invert().multiply(hand);
  const tl = Math.hypot(q.y, q.w);
  if (tl < 1e-6) return;
  const turn = 2 * Math.atan2(q.y / tl, q.w / tl);
  const pron = Math.atan2(Math.sin(turn), Math.cos(turn)) * way;
  // (the wrist's part: what is left once the forearm's turn is taken off, as where it points the fingers)
  LW_T.set(0, q.y / tl, 0, q.w / tl);
  const swing = LW_W.copy(LW_T).invert().multiply(q);
  const fg = LW_F.set(0, -1, 0).applyQuaternion(swing);
  const along = Math.max(-1, Math.min(1, -fg.y));
  const bent = Math.acos(along);
  const side = Math.hypot(fg.x, fg.z);
  let fx = 0;
  let fz = 0;
  if (side > 1e-6) [fx, fz] = [fg.x / side, fg.z / side];
  // (toward the palm, or back; and to the side: as far as each goes, in between as an ellipse does)
  const toPalm = fx * way;
  const lx = toPalm >= 0 ? WRIST_FLEX : WRIST_EXT;
  const k = Math.hypot((bent * toPalm) / lx, (bent * fz) / WRIST_DEV);
  const pr = Math.max(-ARM_SUP, Math.min(ARM_PRON, pron));
  if (k <= 1 && pr === pron) return;
  const b2 = k > 1 ? bent / k : bent;
  fg.set(fx * Math.sin(b2), -Math.cos(b2), fz * Math.sin(b2));
  swing.setFromUnitVectors(LW_D, fg);
  LW_T.setFromAxisAngle(UP, pr * way);
  hand.copy(fore).multiply(LW_T).multiply(swing);
}
/**
 * The shots whose shooting hand (his right) follows through: its wrist bent down FLICK radians after the release,
 * in over FLICK_IN ms, held to FLICK_HOLD and let go of over FLICK_OUT.
 */
const FLICKED = new Set<string>(['jumper', 'hook', 'floater', 'freeThrow']);
const FLICK = 0.86;
const FLICK_IN = 90;
const FLICK_HOLD = 300;
const FLICK_OUT = 260;
/**
 * A hand with nothing in it is never held dead straight off its forearm: let hang, it falls a little toward the palm
 * (WRIST_LOOSE radians), turned a little palm-back (WRIST_PRON, a turn of the forearm and wrist: past the palm facing
 * his thigh); a defender's (DEFENDS) is turned to show its palm the way he faces, as far as a forearm turns, and is
 * bent back a little (WRIST_SHOW). As far as a forearm turns either way from the palm facing in (radians, PRON_MOST palm
 * down or back, SUP_MOST palm up or forward), and how far a wrist bends (FLEX_MOST toward the palm, EXT_MOST back).
 * What he is doing changes it over about WRIST_MS (his own ms): a wrist is turned, never snapped.
 */
const WRIST_LOOSE = 0.3;
const WRIST_PRON = 0.25;
const WRIST_SHOW = -0.2;
const PRON_MOST = 1.35;
const SUP_MOST = 1.35;
const FLEX_MOST = 1.15;
const EXT_MOST = 0.8;
const WRIST_MS = 90;
const DEFENDS = new Set<string>(['stance', 'ready', 'shuffle', 'closeout', 'contest', 'block', 'steal']);
/**
 * A pass let go of: both hands snap through it, turned thumbs down (PASS_PRON) and bent toward the palm (PASS_SNAP),
 * in over PASS_SNAP_IN ms from the release, held to PASS_SNAP_HOLD and let go of over PASS_SNAP_OUT.
 */
const PASSED = new Set<string>(['pass', 'passOne', 'passOver']);
const PASS_PRON = 1.1;
const PASS_SNAP = 0.45;
const PASS_SNAP_IN = 70;
const PASS_SNAP_HOLD = 200;
const PASS_SNAP_OUT = 220;

/**
 * A hand's shape: how far each finger is curled at its knuckle and at its middle joint (index, middle, ring, little:
 * radians toward the palm), how far they are spread (the index that far toward the thumb, the others by SPREAD_K), and
 * the thumb: turned toward the palm at its root, out from the hand there (less than none: in across the fingers), and
 * bent at its middle knuckle. What he is doing picks one for each hand (see Fig.shapeOf), a hand on the ball another
 * by how it holds it, and his hand goes from one to the next over about SHAPE_MS of his own time: a fist is made, not
 * snapped shut.
 */
type Shape = Float32Array;
const SHAPE_N = 12;
const SPREAD = 8;
const THUMB_PALM = 9;
const THUMB_OUT = 10;
const THUMB_BEND = 11;
const SPREAD_K = [1, 0.15, -0.55, -1.1] as const;
const SHAPE_MS = 65;
const shape = (knuckles: readonly number[], middles: readonly number[], spread: number, palm: number, out: number, bend: number): Shape =>
  Float32Array.from([...knuckles, ...middles, spread, palm, out, bend]);
/** Let hang: loose, each finger a little more curled than the one before it and drawn in by the next (not fanned out), the thumb in a little toward the palm by the index, a little bent. */
const LOOSE = shape([0.32, 0.42, 0.52, 0.62], [0.45, 0.6, 0.72, 0.82], -0.06, 0.3, 0.2, 0.3);
/** On the ball's side (two hands on it): spread over the leather and laid along it, the thumb wide behind it. */
const BALL = shape([0.6, 0.6, 0.62, 0.65], [0.6, 0.6, 0.62, 0.65], 0.2, 0.1, 0.65, 0.1);
/** On top of a dribble: spread, on it with the pads of his fingers more than his palm. */
const TOP = shape([0.28, 0.26, 0.3, 0.34], [0.26, 0.24, 0.28, 0.32], 0.3, 0.05, 0.5, 0.1);
/** The shooting hand under the ball: as wide as it goes, the ball on the pads of his fingers, the thumb out. */
const SHOOT = shape([0.64, 0.62, 0.56, 0.52], [0.56, 0.54, 0.5, 0.46], 0.36, 0.55, 0.6, 0.35);
/** The guide hand on the ball's side as he shoots: flat on it, fingers up, there to steady it and come off it. */
const GUIDE = shape([0.4, 0.4, 0.44, 0.52], [0.36, 0.36, 0.4, 0.46], 0.2, 0.05, 0.55, 0.05);
/** Shut: the fingers in to the palm, the thumb across them. */
const FIST = shape([1.45, 1.5, 1.5, 1.45], [1.7, 1.75, 1.75, 1.7], -0.04, 0.05, -0.45, 0.75);
/** The first finger out and the others shut on the thumb; two of them out; three. */
const POINT = shape([0.04, 1.5, 1.5, 1.45], [0.04, 1.75, 1.75, 1.7], 0, 0.05, -0.45, 0.7);
const TWO = shape([0.04, 0.04, 1.5, 1.45], [0.04, 0.04, 1.75, 1.7], 0.16, 0.05, -0.45, 0.7);
const THREE = shape([0.04, 0.04, 0.06, 1.45], [0.04, 0.04, 0.06, 1.7], 0.16, 0.05, -0.45, 0.7);
/** Open, the palm shown: the fingers straight and apart, the thumb out. */
const OPEN = shape([0.06, 0.06, 0.08, 0.1], [0.08, 0.08, 0.1, 0.12], 0.22, 0, 0.6, 0.05);
/** Flat: the fingers straight and together, the thumb along them (a referee's arm out, a T). */
const FLAT = shape([0.04, 0.04, 0.05, 0.06], [0.04, 0.04, 0.05, 0.06], -0.03, 0.05, 0.05, 0.05);
/** A defender's: open and apart and a little bent, ready to take a swipe or get a hand on a pass. */
const ACTIVE = shape([0.22, 0.27, 0.32, 0.38], [0.3, 0.35, 0.4, 0.45], 0.26, 0.1, 0.45, 0.15);
/** Open and easy: the fingers a little bent and not held apart, the thumb let be (a hand up in the air, a hand out to a man: nobody's is a starfish). */
const EASY = shape([0.14, 0.2, 0.27, 0.36], [0.2, 0.28, 0.36, 0.46], 0.08, 0.12, 0.38, 0.14);
/** A fist not clenched white: shut, a little loose (a pumped fist, held a while). */
const FIST_EASY = shape([1.2, 1.3, 1.36, 1.38], [1.45, 1.55, 1.6, 1.6], -0.02, 0.1, -0.3, 0.6);
/**
 * The buzzer's hands, each man's own of these (his left's, his right's): both fists, a fist and an open hand, a
 * finger up, both hands open. Ten men with both fists shut was a drill.
 */
const PARTY_HANDS: readonly (readonly [Shape, Shape])[] = [
  [FIST, FIST],
  [FIST_EASY, EASY],
  [EASY, FIST],
  [FIST, POINT],
  [EASY, EASY],
  [FIST_EASY, FIST_EASY],
];
/**
 * A free hand is its man's own: each finger's joints this much more or less bent than the shape has them (radians, at
 * the most; less the more shut it is), and alive: they work this much (radians) every HAND_LIFE_MS or so, each hand in
 * its own time.
 */
const HAND_OWN = 0.16;
const HAND_LIFE = 0.07;
const HAND_LIFE_MS = 2600;
const ownHand = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
/** Closed round something (a board, his shorts, the rim, another man's hand). */
const GRAB = shape([1.05, 1.1, 1.15, 1.2], [1.15, 1.2, 1.25, 1.3], 0, 0.15, -0.2, 0.5);
/** Out for a pass: open, apart, the thumbs wide (toward each other, with his palms to it: see CATCH_UP). */
const CATCH = shape([0.15, 0.15, 0.2, 0.25], [0.2, 0.2, 0.24, 0.3], 0.3, 0.1, 0.65, 0.1);
/**
 * The shooting hand after the release: dropped over toward the rim and let go, its fingers hanging down at it. Each a
 * little bent at its knuckle and more at its middle, more the further from the first finger the ball rolled off, and
 * together, the thumb let in beside them: held straight and apart, the hand was a flat paddle on the end of his arm.
 */
const GOOSE = shape([0.3, 0.38, 0.48, 0.6], [0.6, 0.7, 0.8, 0.92], -0.03, 0.16, 0.24, 0.32);
/** The guide hand as it comes off the ball and is held there: as it lay on it, easy, its fingers up and a little bent, the thumb let be. Not shown open. */
const GUIDE_OFF = shape([0.3, 0.38, 0.46, 0.56], [0.5, 0.62, 0.74, 0.86], -0.02, 0.2, 0.3, 0.25);
/** Cupped (round his mouth, on his knee); half shut, the thumb up (a handshake). */
const CUP = shape([0.25, 0.25, 0.3, 0.35], [0.3, 0.3, 0.35, 0.4], -0.02, 0.15, 0.1, 0.15);
const SHAKE = shape([0.75, 0.8, 0.85, 0.9], [0.7, 0.75, 0.8, 0.85], 0, 0.15, 0.25, 0.2);
/** How a gesture turns a hand's palm (see Fig.place): as it is, to the way he faces, up, down. */
const PALM_AS = 0;
const PALM_FRONT = 1;
const PALM_UP = 2;
const PALM_DOWN = 3;
/** Each gesture's hands (his left's shape, his right's; null: as his move has it) and how it turns its palms. */
const GESTURE_HANDS: Record<Gesture, readonly [Shape | null, Shape | null, number]> = {
  flex: [FIST, FIST, PALM_AS],
  roar: [FIST, FIST, PALM_AS],
  point: [null, POINT, PALM_FRONT],
  fist: [null, FIST, PALM_AS],
  five: [null, OPEN, PALM_FRONT],
  handUp: [null, OPEN, PALM_FRONT],
  protest: [OPEN, OPEN, PALM_UP],
  clap: [FLAT, FLAT, PALM_AS],
  wag: [null, POINT, PALM_FRONT],
  head: [OPEN, OPEN, PALM_AS],
  wipe: [null, LOOSE, PALM_AS],
  tug: [GRAB, GRAB, PALM_AS],
  call: [POINT, null, PALM_AS],
  ask: [null, OPEN, PALM_FRONT],
  talk: [OPEN, null, PALM_UP],
  direct: [null, POINT, PALM_AS],
  refFoul: [null, FIST, PALM_AS],
  refThree: [THREE, null, PALM_FRONT],
  refGood: [OPEN, OPEN, PALM_FRONT],
  refPointL: [FLAT, null, PALM_DOWN],
  refPointR: [null, FLAT, PALM_DOWN],
  refTimeout: [FLAT, FLAT, PALM_AS],
  refCount: [null, FLAT, PALM_DOWN],
  refToss: [OPEN, OPEN, PALM_UP],
  refTwo: [null, TWO, PALM_FRONT],
  refHand: [null, OPEN, PALM_UP],
  refBounce: [OPEN, OPEN, PALM_AS],
  coachBoard: [GRAB, POINT, PALM_AS],
  coachShout: [CUP, CUP, PALM_AS],
  coachPoint: [null, POINT, PALM_AS],
  coachWide: [OPEN, OPEN, PALM_UP],
  coachCrouch: [GRAB, GRAB, PALM_AS],
  coachWave: [null, OPEN, PALM_AS],
  coachCalm: [OPEN, OPEN, PALM_DOWN],
  shake: [null, SHAKE, PALM_AS],
  dap: [null, GRAB, PALM_AS],
};
/** The hands of a move (both, or his left's and his right's) where it has them other than loose. */
const CLIP_HANDS: Partial<Record<ClipId, Shape | readonly [Shape, Shape]>> = {
  stance: ACTIVE,
  ready: ACTIVE,
  shuffle: ACTIVE,
  closeout: ACTIVE,
  steal: ACTIVE,
  crash: ACTIVE,
  contest: OPEN,
  block: OPEN,
  tip: OPEN,
  rebound: OPEN,
  boxout: OPEN,
  postUp: OPEN,
  hug: EASY,
  floor: OPEN,
  stumble: OPEN,
  rue: EASY,
  bump: OPEN,
  celebrate: FIST,
  cheer: FIST,
  kneel: FIST,
  screen: GRAB,
  pull: GRAB,
  hips: FLAT,
  knees: CUP,
  slump: CUP,
};
/** Reaching for a pass, his hands' fingers point this far up from his forearms' line (eased in by his hold on it): palms to the ball, thumbs in. */
const CATCH_UP = 1.1;
/** A hand on the ball's side lies with its fingers this far up from its forearm's line (a hold: his thumbs behind it). */
const SIDE_UP = 0.4;
/** ...and is put this much nearer the ball than the puppet has its wrist (ft), so its palm is on the leather and not in it. */
const SIDE_IN = 0.03;
/**
 * A hand over the ball or under it: how deep its palm is from the bone's line (ft, the 6 ft 6 body: figure.py's
 * palm_form); how far it is tipped onto the ball at most (the cosine of it: the ball on the heel of his fingers, not
 * on them); how far a wrist too near the ball has its hand put out at most; and how far the puppet puts a wrist from
 * the ball's middle (its PALM) as the scene has not said where the ball is.
 */
const PALM_DEEP = 0.055;
const TIP_MOST = 0.8;
const PUT_OUT = 0.05;
const HOLD_FAR = 0.51;
/** Where the thumb's middle knuckle bends about, in the thumb's own frame (toward his palm, across the fingers); the left hand's, then the right's. */
export const THUMB_HINGE = [new Vector3(0.8, 0, -0.6).normalize(), new Vector3(0.8, 0, 0.6).normalize()] as const;
/**
 * How a digit of a hand in this shape (`st` from `o`) is turned: its first bone off the hand's (`q1`: a finger spread at
 * its knuckle and curled there; the thumb turned toward the palm at its root and out from the hand), and its second off
 * its first (`q2`: a finger curled at its middle joint, the thumb bent at its middle knuckle). Index, middle, ring,
 * little finger, thumb (d 0..4). The sideline's men are turned by it too.
 */
export function digitTurns(st: ArrayLike<number>, o: number, d: number, left: boolean, q1: Quaternion, q2: Quaternion) {
  const way = left ? -1 : 1;
  if (d < 4) {
    q1.setFromAxisAngle(XA, -SPREAD_K[d] * st[o + SPREAD]).multiply(DQ.setFromAxisAngle(ZA, way * st[o + d]));
    q2.setFromAxisAngle(ZA, way * st[o + 4 + d]);
  } else {
    q1.setFromAxisAngle(ZA, way * st[o + THUMB_PALM]).multiply(DQ.setFromAxisAngle(XA, -st[o + THUMB_OUT]));
    q2.setFromAxisAngle(THUMB_HINGE[left ? 0 : 1], st[o + THUMB_BEND]);
  }
}
const DQ = new Quaternion();
const F1 = new Quaternion();
const F2 = new Quaternion();
/**
 * A hand shut this far (0 flat, 1 a fist) as a man at rest holds it: flat, let hang (LOOSE: each finger a little more
 * curled than the one before it, the thumb by the index), closed round something, shut. For the sideline's men.
 */
export function handOf(shut: number, out: Float32Array = new Float32Array(SHAPE_N)): Float32Array {
  const steps = [FLAT, LOOSE, GRAB, FIST] as const;
  const at = [0, 0.3, 0.7, 1] as const;
  let k = 0;
  while (k < 2 && shut > at[k + 1]) k++;
  const u = Math.max(0, Math.min(1, (shut - at[k]) / (at[k + 1] - at[k])));
  for (let i = 0; i < SHAPE_N; i++) out[i] = steps[k][i] + (steps[k + 1][i] - steps[k][i]) * u;
  return out;
}
/**
 * A dribble's wrist (radians toward the palm, as the hand is over the ball): cocked back (DRIB_CATCH) as the ball comes up
 * into it and gives with it, bent over it as it pushes it down (DRIB_PUSH), on through after it as it goes (DRIB_AFTER),
 * and back for the next as it comes up (DRIB_WAIT).
 */
const DRIB_CATCH = -0.2;
const DRIB_PUSH = 0.45;
const DRIB_AFTER = 0.6;
const DRIB_WAIT = -0.1;
/** The hand over a dribble in the air is turned this far of the way to lie on it (the rest as a free hand hangs): a wrist after a ball off it is not wrung round. */
const DRIB_HOLDS = 0.75;
/** 0 below a, 1 above b, eased between (a over b: the other way). */
function sstep(a: number, b: number, v: number): number {
  const q = clamp01((v - a) / (b - a));
  return q * q * (3 - 2 * q);
}
/** A bump of 1 at (ax, ay) that dies away over (sx, sy). */
const bump = (x: number, y: number, ax: number, ay: number, sx: number, sy: number) => Math.exp(-(((x - ax) / sx) ** 2 + ((y - ay) / sy) ** 2));
/** Numbers that look random and are a place's own, 0..1, and the same eased between places. */
function grain(i: number, j: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = grain(xi, yi) + (grain(xi + 1, yi) - grain(xi, yi)) * sx;
  const b = grain(xi, yi + 1) + (grain(xi + 1, yi + 1) - grain(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}

/** A colour as the picture's bytes have it (0..1 each). */
type Rgb = [number, number, number];
const rgbOf = (c: string): Rgb => {
  const k = new Color(c).convertLinearToSRGB();
  return [k.r, k.g, k.b];
};

/**
 * A hairline thins out to his skin over this many times each style's own width (in a portrait it was a line across his
 * forehead; at 1.8 it was a band of thin hair a few centimetres deep, his skin through it: every man looked to be going
 * bald). Ahead of it, a few single hairs; behind it, all hair.
 */
const HAIR_EDGE = 0.75;
/** How many rows of cornrows (and of the braids' roots) across his head, ear to ear over the top. */
const CORNROWS = 17;
/** How much lower than his hairline (a unit of his head's height, half of it) his hair is painted under an afro, a head of curls, a high top: see headPainter's `over`. */
const COILED_AHEAD = 0.04;
/** The styles whose hair lies plaited or locked on his scalp: no fuzz stands off it (see STUFF.plait). */
const PLAITED = new Set<string>(['cornrows', 'braids', 'locs', 'twists']);
/**
 * His hairline, round his head: how high it is (as the height of a unit direction from the head's
 * middle) by how far round from the front he is (radians): across his forehead, back at the temples,
 * down in front of his ear, over it, down behind it to the nape.
 */
const HAIRLINE: readonly (readonly [number, number])[] = [
  [0, 0.6],
  [0.55, 0.61],
  [0.9, 0.64],
  [1.2, 0.5],
  [1.36, 0.1],
  [1.52, 0.25],
  [1.98, 0.22],
  [2.3, -0.18],
  [2.65, -0.4],
  [3.15, -0.44],
];
function hairlineAt(round: number): number {
  for (let k = 1; k < HAIRLINE.length; k++)
    if (round <= HAIRLINE[k][0]) {
      const [a0, y0] = HAIRLINE[k - 1];
      const [a1, y1] = HAIRLINE[k];
      return y0 + (y1 - y0) * sstep(a0, a1, round);
    }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

/** His eyes on the plane of his face (figure.py's EYE_X, EYE_Y, EYE_W): how far out each is, how high, its half width. */
const EYE = [0.38, 0.066, 0.166] as const;
/**
 * How far up its outer corner is tipped and how high its upper lid stands open, for the middling man (look.ts's tilt
 * and open scale them): the lid over the top of his iris, as a man's is when he isn't startled (a ring of white
 * all round it is a stare).
 */
const EYE_TILT = 0.012;
const EYE_OPEN = 0.041;
/** His iris: its half width and half height on that plane (a circle on him), and how far over the eye's middle it sits. */
const IRIS = [0.069, 0.049, 0.008] as const;
/**
 * His eye as a ball, in iris radii (a real eye's: a ball 12 mm round, an iris 6 mm): the ball's radius, the cornea's (the
 * clear dome over the iris, rounder than the ball), how far the cornea's middle is out from the ball's along his gaze (so
 * it meets the ball round the iris's rim and stands a little proud of it), and how deep the iris is under the cornea's
 * face (what is seen of it through the cornea shifts by that as the camera goes round him).
 */
const EYE_BALL = [2.5, 1.3, 1.46, 0.3] as const;
/**
 * The light in his eye: the camera's lamp (the one his face is lit by: see stuffMaterial) seen in his cornea, a spot this
 * wide (how near the cornea's face must be to facing half way between lamp and lens: a cosine) and this bright; and the
 * shine of the tears along his lower lid.
 */
const CATCH_LIGHT = [0.9978, 2.2] as const;
const TEAR_SHINE = 0.07;
/** His upper lip's colour and his lower lip's, as a share of his skin's (red, green, blue), on the lightest skin and the darkest. */
const LIP_UP = [
  [0.84, 0.72],
  [0.66, 0.62],
  [0.7, 0.74],
] as const;
const LIP_LOW = [
  [0.9, 1.04],
  [0.76, 0.96],
  [0.8, 1.2],
] as const;

/**
 * His head's picture, a point at a time: his skin with a face on it (eyes, brows, lips, the shade of
 * its hollows, all placed as figure.py's head_r shapes them), his beard, his hair as he wears it (and
 * how far each point of it stands off his scalp: the third channel of the stuff picture), a headband.
 */
function headPainter(look: Look, band: string | null, k: number): { rows: number; row(j: number): void; done(): Points } {
  // (`k`: how many of the sheet's pixels a point of this picture is across: 1 the finished head, more a quick one)
  const w = R_HEAD[2] / k;
  const h = R_HEAD[3] / k;
  const sk = Math.max(1, STUFF_K / k);
  const sw = w / sk;
  const sh = h / sk;
  const img = new ImageData(w, h);
  const simg = new ImageData(sw, sh);
  const skin = rgbOf(look.skin);
  const hair = rgbOf(look.hair);
  // (his brows and his beard are his hair's own colour, whatever he has done to the hair on his head)
  const brows = rgbOf(look.brows);
  const iris = rgbOf(look.eyes);
  const bandRgb = band ? rgbOf(band) : null;
  // (lips are the skin's colour, redder on light skin; on darker skin the upper lip is darker than his face and
  // browner, and the lower one lighter than it and mauve, bluer than his skin rather than redder: no lipstick. Each a
  // share of his skin's own, light to dark: LIP_UP, LIP_LOW)
  const dark = look.tone / (SKINS.length - 1);
  // (and each man's own: paler and pinker, or browner and darker: Look.lip)
  const lipOwn: Rgb = look.lip < 0 ? [1.05, 0.95, 0.97] : [0.85, 0.8, 0.8];
  const own = (c: Rgb): Rgb => [0, 1, 2].map((i) => c[i] * (1 + (lipOwn[i] - 1) * Math.abs(look.lip))) as Rgb;
  const lipOf = (k: readonly (readonly [number, number])[]): Rgb => own([0, 1, 2].map((i) => skin[i] * (k[i][0] + (k[i][1] - k[i][0]) * dark)) as Rgb);
  const lipUp = lipOf(LIP_UP);
  const lipLow = lipOf(LIP_LOW);
  // (his own face: how full his lips are, how his eyes are set: see look.ts)
  const full = 0.92 + 0.36 * look.face.lips;
  const tiltK = EYE_TILT * look.face.tilt;
  const openK = EYE_OPEN * look.face.open;
  // (how much of a shaven beard's shade shows: most on a lighter skin under darker hair)
  const shadow = 0.13 * (1 - 0.6 * dark);
  const style = STYLES[look.style].name;
  // where each column and row of the picture looks from the head's middle
  const cols = Array.from({ length: w }, (_v, i) => {
    const turn = ((i + 0.5) / w) * (1 + 2 * WRAP) - WRAP;
    const a = solve(headU, turn - Math.floor(turn), -Math.PI, Math.PI);
    return [Math.sin(a), Math.cos(a)] as const;
  });
  const rows = Array.from({ length: h }, (_v, j) => {
    const el = solve(headV, 1 - (j + 0.5) / h, -Math.PI / 2, Math.PI / 2);
    return [Math.sin(el), Math.cos(el)] as const;
  });
  const c: Rgb = [0, 0, 0];
  /**
   * What the point is made of (how rough, how much of a sheen: the stuff picture's first two channels), mixed from one
   * stuff toward another as its colour is: skin goes to hair over a hairline, to a beard over its edge, never in a step.
   */
  const sv = [0, 0];
  const made = (k: Stuff, t: number) => {
    sv[0] += (STUFF[k][0] - sv[0]) * t;
    sv[1] += (STUFF[k][1] - sv[1]) * t;
  };
  /** Mixes the point's colour toward another. */
  const to = (k: Rgb | readonly number[], t: number) => {
    c[0] += (k[0] - c[0]) * t;
    c[1] += (k[1] - c[1]) * t;
    c[2] += (k[2] - c[2]) * t;
  };
  const shade = (t0: number) => {
    // (the lamps over him put most of a hollow's shade there themselves: the picture's own is the rest of it)
    const t = t0 * 0.6;
    // (a shade on skin keeps its red)
    c[0] *= 1 - t * 0.75;
    c[1] *= 1 - t;
    c[2] *= 1 - t * 1.1;
  };
  const row = (j: number) => {
    const [se, ce] = rows[j];
    for (let i = 0; i < w; i++) {
      const [sa, ca] = cols[i];
      // the direction in the head's half sizes (x out to his left, y up, z forward): figure.py's `n`
      let nx = (ce * sa) / HEAD_SIZE[0];
      let ny = se / HEAD_SIZE[1];
      let nz = (ce * ca) / HEAD_SIZE[2];
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      c[0] = skin[0];
      c[1] = skin[1];
      c[2] = skin[2];
      sv[0] = STUFF.skin[0];
      sv[1] = STUFF.skin[1];
      let lift = 0;
      const ax = Math.abs(nx);
      // (each kind of grain is worked out only where something is drawn with it: most points need none)
      let fineV = -1;
      const fine = () => (fineV < 0 ? (fineV = noise(nx * 90 + nz * 61, ny * 90 + nz * 37)) : fineV);

      // (how near a point under his jaw is to where his head goes into his neck: what grows on his jaw thins out before
      // it gets there, or the edge of his head would show round his throat as a line; ft, from his head's middle and
      // the neck's as figure.py builds them)
      const wy = ny * 0.4;
      const seam = wy > -0.22 ? 1 : 1 - sstep(-0.22, -0.3, wy) * (1 - sstep(-0.02, 0.2, Math.hypot((nx * 0.285) / 0.215, (nz * 0.35 + 0.08) / 0.18) - 1));
      if (nz > 0.1) {
        // his face, on its plane (figure.py's face_at)
        const fz = Math.max(nz, 0.3);
        const [px, py] = faceT((nx / fz) * 0.8, (ny / fz) * 0.8);
        const apx = Math.abs(px);
        made('face', 1);
        // (and its shine: most down his nose and across his forehead, least on his cheeks; uneven, as skin is)
        sv[0] +=
          -0.1 * bump(px, py, 0, -0.1, 0.09, 0.3) - 0.06 * bump(px, py, 0, 0.45, 0.4, 0.16) + 0.05 * bump(apx, py, 0.5, -0.3, 0.2, 0.22) + 0.04 * (noise(nx * 40, ny * 40) - 0.5);
        // skin is never one colour: lighter where the bone is near it and the light falls (his forehead, the bridge of his
        // nose, his chin), redder where the blood is (his cheeks, the end of his nose), uneven everywhere
        const mottle = noise(nx * 21 + nz * 13, ny * 21 - nz * 9) - 0.5;
        c[0] *= 1 + 0.035 * mottle;
        c[1] *= 1 + 0.05 * mottle;
        c[2] *= 1 + 0.055 * mottle;
        if (py > 0.25) to([skin[0] * 1.1, skin[1] * 1.08, skin[2] * 1.05], 0.34 * bump(px, py, 0, 0.52, 0.42, 0.17));
        if (py < 0.3 && py > -0.3 && apx < 0.2) to([skin[0] * 1.1, skin[1] * 1.08, skin[2] * 1.05], 0.3 * bump(px, py, 0, -0.03, 0.032, 0.16));
        if (py < -0.7) to([skin[0] * 1.06, skin[1] * 1.04, skin[2] * 1.02], 0.25 * bump(px, py, 0, -0.86, 0.14, 0.08));
        // (a flush is rose, not orange: it takes green out of the skin more than blue)
        if (py < 0.3 && py > -0.75) to([skin[0] * 1.04, skin[1] * 0.86, skin[2] * 0.9], 0.32 * bump(apx, py, 0.56, -0.24, 0.24, 0.2) + 0.36 * bump(px, py, 0, -0.25, 0.12, 0.09));
        made('sweat', sstep(0.26, 0.34, py) * sstep(0.7, 0.6, py) * 0.7);
        // the hollows: round the eyes (darkest beside the nose and under the eye), under the brow, beside the nose and
        // under it, its nostrils, the fold from its wing past the mouth, under the lower lip, under the cheekbone
        // (the socket is deepest up under the brow beside the nose, and the skin under the eye is thin: darker there and a
        // little cooler, the blood under it showing; the sides of his nose turned from the light, its wings round their
        // nostrils, which from in front are slits in the shade under its tip, not holes)
        if (py > -0.2 && py < 0.4 && apx < 0.9) {
          shade(0.15 * bump(apx, py, 0.37, 0.1, 0.2, 0.09) + 0.22 * bump(apx, py, 0.22, 0.15, 0.075, 0.075) + 0.06 * bump(apx, py, 0.4, -0.05, 0.15, 0.035));
          to([skin[0] * 0.8, skin[1] * 0.72, skin[2] * 0.8], 0.22 * bump(apx, py, 0.33, -0.055, 0.12, 0.04));
        }
        if (py > -0.4 && py < 0.2 && apx < 0.3) shade(0.09 * bump(apx, py, 0.125, -0.08, 0.04, 0.17));
        if (py > -0.47 && py < -0.2 && apx < 0.45)
          shade(
            0.24 * bump(px, py, 0, -0.355, 0.13, 0.026) +
              0.5 * bump(apx - 0.072, py + 0.336 + 0.25 * (apx - 0.072), 0, 0, 0.032, 0.01) +
              0.14 * bump(apx, py, 0.215, -0.285, 0.03, 0.06) +
              0.1 * bump(apx, py, 0.16, -0.31, 0.06, 0.03),
          );
        if (py > -0.8 && py < -0.15 && apx < 0.8)
          shade(0.24 * bump(px, py, 0, -0.68, 0.17, 0.04) + 0.09 * bump(apx, py, 0.34, -0.43, 0.035, 0.12) + 0.04 * bump(apx, py, 0.66, -0.47, 0.15, 0.15));
        // his mouth: the upper lip with its bow, the fuller lower one, the line between them, the paler edge round them
        const mw = 0.286;
        const my = -0.522;
        if (apx < mw + 0.04 && py < -0.4 && py > -0.68) {
          const t = Math.min(1, apx / mw);
          const arch = Math.pow(1 - t * t, 0.6);
          const up = my + 0.054 * full * arch * (1 - 0.24 * Math.exp(-((t / 0.14) ** 2)));
          const low = my - 0.088 * full * Math.pow(1 - t * t, 0.8);
          const inLip = sstep(low - 0.01, low + 0.008, py) * sstep(up + 0.01, up - 0.008, py) * sstep(mw + 0.02, mw - 0.02, apx);
          // (the skin just over the upper lip's edge is a little paler: the edge reads without a line drawn round it)
          if (look.beard === 0) to([skin[0] * 1.08, skin[1] * 1.06, skin[2] * 1.04], 0.3 * sstep(0.03, 0.006, Math.abs(py - up - 0.016)) * sstep(mw, mw - 0.1, apx));
          if (inLip > 0) {
            const lower = py < my;
            to(lower ? lipLow : lipUp, inLip * (lower ? 0.86 : 0.92));
            // (the creases down a lip; the lower lip's shine; its under side in its own shade)
            const crease = noise(px * 70, py * 9);
            shade(0.1 * inLip * (crease - 0.5));
            if (lower) {
              to([1, 0.94, 0.9], 0.08 * inLip * bump(px, py, 0.01, my - 0.04 * full, 0.1, 0.014));
              // (a darker skin's lower lip is its own lighter colour across its fullness, and as dark as the upper one round its edge)
              to(lipUp, 0.55 * dark * inLip * sstep(my - 0.035 * full, low + 0.004, py));
              shade(0.2 * inLip * sstep(my - 0.05 * full, low, py));
            } else shade(inLip * (0.1 + 0.16 * sstep(up - 0.03, my, py)));
            // (the upper lip faces down, out of the light, and is drier: only the lower one has a lip's shine all over)
            made(lower ? 'lip' : 'face', inLip);
            // (wet along where they meet, and most over the fullness of his lower one: they shine)
            made('wetLip', inLip * Math.max(0, lower ? 0.45 * bump(px, py, 0, my - 0.04 * full, 0.16, 0.03) : 0));
          }
          // (the line between them, deepest at the corners)
          to([skin[0] * 0.2, skin[1] * 0.11, skin[2] * 0.11], (0.25 + 0.3 * t) * sstep(0.011 + 0.003 * t, 0.003, Math.abs(py - my)) * sstep(mw + 0.02, mw - 0.03, apx));
          shade(0.2 * bump(apx, py, mw + 0.005, my - 0.025, 0.035, 0.03));
        }
        // his eyes: the white between its lids, the iris with its dark rim and pupil, a light in it; lashes, the fold
        // over the lid (close up the material draws the eye itself, sharper than a picture can: see EYES)
        const ex = apx - EYE[0];
        const ey = py - EYE[1];
        const ew = EYE[2];
        if (Math.abs(ex) < ew + 0.06 && Math.abs(ey) < 0.13) {
          const t = clamp01(Math.abs(ex) / ew);
          // (the outer corner sits a little higher than the inner one)
          const tilt = tiltK * (ex / ew);
          const up = tilt + openK * Math.pow(1 - t * t, 0.55);
          const low = tilt - 0.037 * Math.pow(1 - t * t, 0.8);
          const open = sstep(low - 0.005, low + 0.005, ey) * sstep(up + 0.005, up - 0.005, ey) * (Math.abs(ex) < ew ? 1 : 0);
          // (the upper lid: its skin a little darker and redder than his cheek's, the fold over it, the edge of the lower one)
          const onLid = sstep(up + 0.05, up + 0.02, ey) * sstep(up - 0.005, up + 0.005, ey) * sstep(ew + 0.05, ew - 0.02, Math.abs(ex));
          to([skin[0] * 0.86, skin[1] * 0.74, skin[2] * 0.72], 0.5 * onLid);
          // (the fold is a soft shade where the lid goes in under the brow, not a line drawn round the eye)
          to([skin[0] * 0.55, skin[1] * 0.45, skin[2] * 0.43], 0.36 * sstep(0.026, 0.0, Math.abs(ey - up - 0.036)) * sstep(ew + 0.05, ew - 0.03, Math.abs(ex)));
          to([skin[0] * 1.06, skin[1] * 0.92, skin[2] * 0.9], 0.3 * sstep(0.012, 0.002, Math.abs(ey - low + 0.012)) * sstep(ew, ew - 0.04, Math.abs(ex)));
          if (open > 0) {
            const white: Rgb = [0.72, 0.69, 0.65];
            // (the lid's shadow on the top of the eye; its corners redder)
            const lidShade = 0.42 + 0.58 * sstep(up, up - 0.05, ey);
            to([white[0] * lidShade, white[1] * lidShade * (1 - 0.16 * t * t), white[2] * lidShade * (1 - 0.2 * t * t)], open);
            const r = Math.hypot(ex / IRIS[0], (ey - IRIS[2]) / IRIS[1]);
            if (r < 1.1) {
              const ir = sstep(1.08, 0.94, r) * open;
              const glow = 0.95 + 0.35 * sstep(0.44, 0.6, r) * sstep(0.9, 0.62, r) - 0.6 * sstep(0.78, 1.0, r);
              to([iris[0] * glow * lidShade, iris[1] * glow * lidShade, iris[2] * glow * lidShade], ir);
              to([0.02, 0.015, 0.015], sstep(0.49, 0.39, r) * open);
              // (the light in his eye, up and toward his nose's other side: the same side in both)
              to([1, 1, 1], 0.7 * open * sstep(0.22, 0.08, Math.hypot((px - Math.sign(px) * EYE[0] - 0.02) / IRIS[0], (ey - IRIS[2] - 0.016) / IRIS[1])));
            }
            made('eye', open);
          }
          // lashes along the upper lid (heavier toward its outer end), a thinner line under the lower one
          to([0.06, 0.045, 0.04], 0.9 * sstep(0.014, 0.004, Math.abs(ey - up - 0.004)) * sstep(ew + 0.025, ew - 0.01, Math.abs(ex)) * (0.75 + 0.25 * sstep(-ew, ew, ex)));
          to([skin[0] * 0.4, skin[1] * 0.32, skin[2] * 0.3], 0.5 * sstep(0.008, 0.002, Math.abs(ey - low + 0.003)) * sstep(ew, ew - 0.03, Math.abs(ex)));
        }
        // his eyebrows, on the ridge of his brow: from beside the nose up to their peak and down to a tail, heavier or
        // lighter; each a run of hairs, upright by the nose and laid over toward the tail
        const q = (apx - 0.15) / 0.52;
        if (q > -0.08 && q < 1.06 && py > 0.1 && py < 0.38) {
          const yb = 0.2 + 0.07 * Math.sin(Math.min(1, Math.max(0, q) * 1.15) * Math.PI * 0.62) - 0.035 * sstep(0.7, 1, q);
          const thick = (0.019 + 0.02 * look.brow) * (1 - 0.6 * q * q) + 0.004;
          const lean = 1.25 - 1.1 * sstep(0, 0.6, q);
          const along = apx * Math.cos(lean) + py * Math.sin(lean);
          const hairs = noise((apx * Math.sin(lean) - py * Math.cos(lean)) * 95, along * 16);
          // (its edges are hairs, not a line: thinner, and broken)
          // (a notch shaved through one of them, near its end, if he has one)
          const notch = look.notch && Math.sign(px) === look.side ? sstep(0.02, 0.008, Math.abs(q - 0.68)) : 0;
          const on =
            sstep(thick * (1.05 + 0.5 * (hairs - 0.5)), thick * 0.3, Math.abs(py - yb)) * sstep(-0.07, 0.07, q + 0.08 * (hairs - 0.5)) * sstep(1.05, 0.88, q) * (1 - notch);
          to([brows[0] * 0.85, brows[1] * 0.85, brows[2] * 0.85], on * (0.44 + 0.38 * look.brow) * (0.75 + 0.35 * hairs));
        }
      }

      // his beard: stubble, a goatee round his mouth, all of his jaw (shorter up his cheeks), a full one, or a strap
      // along the line of his jaw; its edge thins out into single hairs over a little way (no plate laid on him), and
      // it is hairs all through, his skin showing between them; round a goatee or a strap the rest of his beard's
      // ground has the shadow of a shave
      if (nz > -0.25 && ny < 0.36) {
        const fz = Math.max(nz, 0.3);
        const [px, py] = faceT((nx / fz) * 0.8, (ny / fz) * 0.8);
        const apx = Math.abs(px);
        const front = sstep(0.2, 0.36, nz);
        // (round the mouth: over the lip, down beside it, the chin; never on the lips)
        // (right up to their edges: a clean ring round his mouth is a mask's edge, not a shave)
        // (his lips' own outline, as the mouth below paints them: a lens to its corners, never a box round it)
        const lt = Math.min(1, apx / 0.286);
        const lipUpY = -0.522 + 0.054 * full * Math.pow(1 - lt * lt, 0.6) * (1 - 0.24 * Math.exp(-((lt / 0.14) ** 2)));
        const lipLowY = -0.522 - 0.088 * full * Math.pow(1 - lt * lt, 0.8);
        const lips = front * sstep(0.315, 0.29, apx) * sstep(lipLowY - 0.012, lipLowY + 0.002, py) * sstep(lipUpY + 0.004, lipUpY - 0.006, py);
        // (a moustache comes down to the edge of his upper lip, its hairs' ends over it: no strip of bare skin between)
        const tache = front * sstep(-0.33, -0.4, py) * sstep(lipUpY - 0.012, lipUpY + 0.02, py) * sstep(0.4, 0.28, apx) * (1 - 0.65 * bump(px, py, 0, -0.39, 0.035, 0.04));
        const bars = front * sstep(0.18, 0.28, apx) * sstep(0.45, 0.32, apx) * sstep(-0.44, -0.56, py) * sstep(-1.05, -0.8, py);
        const chin = sstep(-0.61, -0.73, py) * sstep(0.47, 0.3, apx) * front * sstep(-1.35, -1.05, py);
        // (the tuft under the lower lip)
        const patch = front * bump(px, py, 0, -0.655, 0.06, 0.04);
        const round = Math.max(tache, bars, chin, patch) * (1 - lips);
        // (his jaw and cheeks: under a line from his ear down to the corner of his mouth, as far as under his chin)
        // (the line is a man's own, never ruled: it wanders a little)
        const line = ny + 0.52 - 0.62 * (ax - 0.3) - 0.5 * (ax - 0.3) * (ax - 0.3) + 0.06 * (noise(ax * 3.5 + 3, nz * 3.5) - 0.5);
        const under = sstep(-1.02, -0.88, ny) * (look.beard === 1 ? sstep(-0.36, 0.0, nz) : sstep(-0.24, -0.05, nz)) * (1 - lips);
        // (and up in front of his ear it narrows to the sideburn his hair comes down to meet)
        // (stubble's edges are softer still than a beard's: it is a shadow, with no line round it)
        const stub = look.beard === 1 ? 1.8 : 1;
        const burn =
          sstep(0.04 - 0.1 * stub, 0.1 + 0.02 * stub, nz) *
          sstep(0.36 + 0.03 * stub, 0.18, nz) *
          sstep(0.32 + 0.06 * stub, 0.14 - 0.04 * stub, ny) *
          sstep(-0.32 - 0.1 * stub, -0.08, ny) *
          sstep(0.58, 0.8, ax);
        const high = sstep(0.04 * stub, -0.14 * stub, ny - 0.25 * (nz + 0.1));
        // (a full beard's line across his cheek is a little lower than a trimmed one's and no softer: it is the longest
        // beard, and the higher and looser its top edge the more of it stood off his cheekbones as two wings of fluff)
        const full4 = look.beard === 4;
        const cheek = Math.max(
          (look.beard === 1 ? sstep(0.2, -0.32, line + 0.25 * ax * ax) : sstep(full4 ? 0.1 : 0.17, -0.2, line + (full4 ? 0.07 : 0) + 0.2 * (ax - 0.5) * (ax - 0.5))) * under * high,
          burn * (look.beard === 2 || look.beard === 5 ? 0 : 1),
        );
        // (where a shaved beard's shadow is: a little further up than any beard)
        const ground = Math.max(round, sstep(0.2, -0.1, line + 0.2 * (ax - 0.5) * (ax - 0.5)) * under * high);
        // (a strap: a trimmed beard two fingers wide, down from his sideburn in front of his ear to the corner of his jaw,
        // along the jaw's side and round the front of his chin, and all of it under his jaw; its edge is a barber's,
        // soft but clean, the same width all the way)
        // (a little wider round his chin; behind, it stops at the back edge of his jaw, under his ear)
        const ramus = sstep(0.14, 0.09, nz + 0.06 * (ny + 0.3)) * sstep(0.62, 0.74, ax) * sstep(0.32, 0.18, ny);
        // (its edge runs level with the foot of his jaw: back to its corner, then up in front of his ear)
        const jaw = Math.max(0.25 * ax - ny - 0.4 * nz - 0.83, -ny + 0.12 * nz - 1.137);
        const strap = Math.max(sstep(-0.27, -0.21, jaw - 0.12 * sstep(0.5, 0.1, ax)), ramus) * under * sstep(-0.12, -0.05, nz);
        // (hairs: fine ones every way for stubble, longer ones lying down his jaw for a beard)
        const speck = noise(nx * 64 + nz * 41, ny * 64 - nz * 29);
        const strand = noise(nx * 52 + nz * 26, ny * 17 + nz * 7);
        const fine2 = noise(nx * 150 + nz * 90, ny * 60 - nz * 50);
        // (how thick it grows there: thinning out to nothing over its edge, in single hairs)
        // (wide: a beard thins over a finger's width or more, its hairs fewer and fewer, and none where it doesn't grow)
        const frayed = (m: number, by: number) => sstep(0.5 - by, 0.5 + by, m + (strand - 0.5) * 1.6 * by + (speck - 0.5) * by + (fine2 - 0.5) * 0.8 * by) * sstep(0, 0.25, m);
        // (only a shadow: never so much it reads as a smudge on his cheek)
        const shave = ground * (0.07 + 0.09 * speck);
        let on = 0;
        let deep = 0;
        // (a clean-shaven man's shadow is all he has: his skin a shade darker and cooler there, over the whole of it
        // alike, with no edge to it anywhere)
        if (look.beard === 0) to([skin[0] * 0.8 + brows[0] * 0.16, skin[1] * 0.82 + brows[1] * 0.16, skin[2] * 0.9 + brows[2] * 0.16], shadow * 2.4 * ground * seam);
        else if (look.beard === 1) on = Math.max(round, cheek) * (0.34 + 0.26 * fine2 + 0.14 * speck);
        else if (look.beard === 2) {
          const m = frayed(round, 0.48);
          on = Math.max(m * (0.7 + 0.22 * strand + 0.08 * fine2), shave);
          deep = 0.009 * sstep(0.25, 1, round);
        } else if (look.beard === 5) {
          // (cut short and even: a close grain of hairs, no strands; its edge broken only by single hairs)
          const m = sstep(0.3, 0.7, strap + (fine2 - 0.5) * 0.28 + (speck - 0.5) * 0.14);
          on = Math.max(m * (0.62 + 0.2 * fine2 + 0.1 * speck), shave * 0.6);
          deep = 0.006 * sstep(0.4, 1, strap);
        } else if (look.beard > 2) {
          const all = Math.max(round, cheek);
          const m = frayed(all, look.beard === 4 ? 0.34 : 0.5);
          on = Math.max(m * (0.72 + 0.2 * strand + 0.08 * fine2) * (look.beard === 3 ? 0.9 : 1), shave);
          // (a full beard is short where it starts on his cheek and long under his jaw: it lies on his cheek by its
          // line, a few millimetres of it, and stands off him more the further under the line)
          const below = sstep(-0.02, -0.34, line);
          deep = (look.beard === 4 ? 0.008 + 0.022 * below + 0.045 * sstep(-0.5, -0.9, ny) : 0.011) * sstep(0.2, 1, all) ** 1.5;
          // (and up the side of his face to his ear it is cut down to nothing: a sideburn is the shortest of a beard,
          // hair lying on the skin in front of the ear. The line across his cheek falls away toward the ear, so by
          // then the side of his face is well "under the line" and stood off him as far as his jaw's does: seen
          // from in front, two tufts of fuzz out past his ears)
          deep *= 1 - 0.96 * sstep(0.54, 0.78, ax) * sstep(-0.74, -0.36, ny);
        }
        on *= seam;
        // (and close to his lips it lies flat on him, its hairs over their edge: a beard stood off his face right up to
        // them would be a wall round his mouth, the picture stretched down it)
        deep *= seam * (1 - front * sstep(0.36, 0.3, apx) * sstep(lipLowY - 0.07, lipLowY - 0.006, py) * sstep(lipUpY + 0.07, lipUpY + 0.006, py));
        if (on > 0) {
          // (lighter where a hair catches the light, darker between two; a touch of his skin's warmth in it)
          // (stubble is the ends of hairs under his skin, every way: a fine grain that greys and darkens it, no strands)
          if (look.beard === 1) {
            const g = 0.8 + 0.4 * fine2;
            to([(skin[0] * 0.5 + brows[0] * 0.42) * g, (skin[1] * 0.52 + brows[1] * 0.42) * g, (skin[2] * 0.58 + brows[2] * 0.42) * g], on);
          } else if (look.beard === 5) {
            // (a strap's hairs are short: a grain, lighter and darker, a little of his skin showing through)
            const g = 0.8 + 0.34 * fine2 + 0.16 * (speck - 0.5);
            to([brows[0] * g + 0.14 * skin[0], brows[1] * g + 0.12 * skin[1], brows[2] * g + 0.11 * skin[2]], on);
          } else {
            const g = 0.55 + 0.6 * strand + 0.25 * (speck - 0.5) + 0.2 * (fine2 - 0.5);
            to([brows[0] * g + 0.03 * skin[0], brows[1] * g + 0.02 * skin[1], brows[2] * g + 0.015 * skin[2]], on);
          }
          made(look.beard === 1 ? 'stubble' : 'beard', sstep(0.15, 0.65, on));
          lift = Math.max(lift, deep);
        }
      }

      // his hair: over the hairline, as he wears it
      const round = Math.atan2(ax, nz);
      // (a man whose hairline has gone back has lost it most at his temples, a little across his forehead)
      // (a line-up is squared off with a razor: straight across his forehead, a corner at each temple, down to the sideburn)
      const lined = look.lineup ? 1 : 0;
      const line =
        ny -
        hairlineAt(round) -
        look.recede * (0.15 * Math.exp(-(((round - 0.78) / 0.3) ** 2)) + 0.05 * Math.exp(-((round / 0.5) ** 2))) +
        lined * (0.015 + 0.075 * sstep(0.55, 0.85, round) * sstep(1.3, 1.08, round));
      if (line > -0.14) {
        // (no line drawn round his head: the hair thins out to the skin over a little way, unevenly, as a hairline
        // does, a few short hairs ahead of it; but for a line-up, cut crisp)
        const wisp = noise(nx * 13 + nz * 7, ny * 13 - nz * 5);
        // (`ahead`: how much lower than his hairline the painted hair comes, under a head of curls that is a shape of its
        // own: its edge sits on hair, not on his forehead, or the curls along it stand out over bare skin as teeth)
        const over = (soft: number, ahead = 0) => {
          const k = soft * HAIR_EDGE * (1 - 0.72 * lined);
          return sstep(-0.9 * k, 1.5 * k, line + ahead + (fine() - 0.5) * k * 1.8 + (wisp - 0.5) * k * 0.9);
        };
        // (how far up his sides and back: a fade is skin there and hair by the crown, never at his forehead. Each man's
        // barber takes it as high as he does, and leaves as much on top)
        const high = -0.2 + 0.55 * look.cut.sides;
        const fade = Math.max(sstep(high, high + 0.24, ny), sstep(1.15, 0.75, round) * sstep(0.3, 0.45, ny));
        const top = 0.6 + 0.8 * look.cut.top;
        const curled = style === 'curls' || style === 'afro' || style === 'twists' || style === 'locs' || style === 'hightop' || style === 'taper';
        const curl = curled ? noise(nx * 34 + nz * 23, ny * 34 + nz * 17) : 0;
        // (rows and combed hair run front to back, evenly round him)
        const across = Math.asin(Math.max(-1, Math.min(1, nx)));
        const streak = style === 'tied' || style === 'bun' || style === 'crop' ? noise(across * 46, nz * 2.5 + ny) : 0;
        let cover = 0;
        let tex = 1;
        switch (style) {
          case 'shaved':
            cover = 0.14 * over(0.1);
            // (a shaved head shines a little over its crown)
            made('dome', 0.85 * sstep(0.25, 0.65, ny) * sstep(-0.4, 0.1, nz + 0.5 * ny));
            break;
          case 'buzz':
            cover = (0.56 + 0.2 * look.cut.top + 0.12 * fine()) * over(0.06);
            break;
          case 'fade':
            cover = 0.94 * over(0.045) * (0.2 + 0.8 * fade);
            // (more of it on top than at the sides: a head of hair, not a cap)
            lift = (0.012 + 0.022 * top * sstep(0.2, 0.7, ny)) * fade * over(0.05);
            tex = 0.8 + 0.3 * fine() + 0.12 * (curl - 0.5);
            break;
          case 'taper': {
            // (short at his temples and the nape, faded out low over his ears; on top, curls left long, standing off his head)
            const low = Math.max(sstep(-0.12, 0.16, ny), sstep(1.2, 0.85, round) * sstep(0.25, 0.4, ny));
            cover = over(0.035) * (0.3 + 0.7 * low);
            lift = (0.01 + 0.042 * (0.45 + 0.55 * look.cut.top) * sstep(0.25, 0.75, ny)) * low * over(0.05) + 0.008 * (curl - 0.5) * sstep(0.3, 0.6, ny);
            tex = 0.62 + 0.62 * curl;
            break;
          }
          case 'curls':
            cover = over(0.04, COILED_AHEAD);
            tex = 0.7 + 0.6 * curl;
            break;
          case 'afro':
            cover = over(0.03, COILED_AHEAD);
            tex = 0.7 + 0.6 * curl;
            break;
          case 'cornrows':
          case 'braids': {
            // (rows plaited tight to his scalp, front to back, side by side: his scalp only in the thin line parted
            // between two; each row round, three strands crossed over and over along it, a V down its length)
            const a = (across * CORNROWS) / Math.PI;
            const f = a - Math.floor(a) - 0.5;
            const part = sstep(0.41, 0.49, Math.abs(f));
            const row = Math.sqrt(Math.max(0, 1 - 4 * f * f));
            cover = over(0.03) * (1 - 0.7 * part);
            lift = 0.022 * row * over(0.04);
            const plait = Math.abs(((ny - 0.6 * nz) * 34 + Math.abs(f) * 1.6) % 1) * 2 - 1;
            tex = (0.62 + 0.5 * Math.abs(plait) * row) * (0.85 + 0.15 * row);
            break;
          }
          case 'twists':
          case 'locs':
            // (parted into squares at the roots, each lock's own: dark between them, little of his scalp to be seen; and in
            // the shade of the locks over it, which the model's baked shade leaves to the men who wear them)
            cover = over(0.05) * (0.9 + 0.1 * curl);
            lift = 0.012 * over(0.05);
            tex = (0.62 + 0.4 * curl) * 0.55;
            break;
          case 'tied':
            cover = over(0.03);
            lift = 0.022 * sstep(-0.01, 0.08, line);
            tex = 0.72 + 0.56 * streak;
            break;
          case 'bun':
            // (the sides and back cut close under it)
            cover = over(0.04) * (0.3 + 0.7 * fade);
            lift = 0.022 * fade * sstep(-0.01, 0.08, line);
            tex = 0.72 + 0.56 * streak;
            break;
          case 'hightop':
            cover = over(0.06, COILED_AHEAD) * (0.25 + 0.75 * Math.max(fade, sstep(0.4, 0.55, ny)));
            lift = 0.012 * fade * over(0.05);
            tex = 0.75 + 0.5 * curl;
            break;
          case 'crop':
            cover = over(0.04) * (0.85 + 0.15 * fade);
            lift = 0.01 + 0.05 * top * sstep(0.3, 0.7, ny) * over(0.05) + 0.025 * top * sstep(0.35, 0.9, nz) * sstep(0.5, 0.7, ny);
            tex = 0.7 + 0.6 * streak;
            break;
          case 'waves': {
            // (brushed flat, in rings round his crown: ridge and trough, as far down as the hairline)
            const fromCrown = Math.acos(Math.max(-1, Math.min(1, 0.85 * ny - 0.53 * nz)));
            const ring = 0.5 + 0.5 * Math.sin(fromCrown * 58 + 4 * (wisp - 0.5) + Math.atan2(nx, -nz) * 1.5);
            cover = (0.84 + 0.1 * fine()) * over(0.05);
            lift = 0.007 * over(0.05);
            tex = 0.68 + 0.5 * ring;
            break;
          }
          case 'part': {
            // (a short fade, longer on top, a line shaved through it on one side, from his forehead back)
            const on = Math.abs(across * look.side - 0.44) / Math.max(0.15, nz + 0.6);
            const cut = sstep(0.022, 0.01, on) * sstep(0.25, 0.4, ny) * sstep(-0.5, -0.1, nz);
            cover = 0.94 * over(0.045) * (0.2 + 0.8 * fade) * (1 - 0.85 * cut);
            lift = (0.018 + 0.012 * sstep(0.45, 0.75, ny)) * top * fade * over(0.05) * (1 - 0.6 * cut);
            tex = 0.82 + 0.3 * fine();
            break;
          }
          case 'mohawk': {
            // (a strip over the top from his forehead to his crown, the sides cut to his skin)
            const strip = sstep(0.44, 0.27, Math.abs(nx) / Math.max(0.3, Math.hypot(ny, nz))) * sstep(0.12, 0.35, ny);
            cover = over(0.05) * Math.max(0.18, strip);
            lift = (0.012 + 0.036 * sstep(0.3, 0.75, ny)) * top * strip * over(0.05);
            tex = 0.72 + 0.5 * noise(nx * 34 + nz * 23, ny * 34 + nz * 17);
            break;
          }
        }
        // (his hair comes up off his head from its hairline over a finger's width, evenly: a step up at the line itself,
        // as ragged as the line is, would be a wall over his forehead with holes in it)
        lift *= sstep(-0.03, 0.16, line);
        if (cover > 0) {
          // (hair cut short still lies one way, back from his forehead and down his sides: its grain runs with it)
          if (style === 'fade' || style === 'buzz' || style === 'part' || style === 'taper') tex *= 0.9 + 0.2 * noise(across * 80, (ny - nz) * 4);
          to([hair[0] * tex, hair[1] * tex, hair[2] * tex], cover);
          if (ny > 0.3 && style !== 'shaved') made('scalp', sstep(0.0, 0.2, cover));
          made(PLAITED.has(style) ? 'plait' : COILED.includes(style) ? 'curl' : 'hair', sstep(0.2, 0.7, cover));
        }
      } else if (nz < 0.25 && ny > -0.6 && ax > 0.7) {
        // (where his ears grow from: a little redder than his cheeks, fading out round them, no patch with an edge)
        to([skin[0] * 1.03, skin[1] * 0.92, skin[2] * 0.9], 0.3 * bump(nz, ny, -0.19, -0.07, 0.11, 0.17) * sstep(0.75, 0.9, ax));
        shade(0.22 * bump(nz, ny, -0.2, -0.06, 0.035, 0.07));
      }
      // (a headband, its edges a little soft as cloth's are: no stair of pixels down them)
      // (wide or thin, worn higher or lower: each man's own way; a maker's mark on the front of some)
      const bandW = look.cut.sides < 0.35 ? 0.04 : 0.064;
      const onBand = bandRgb && ny > 0.1 ? sstep(bandW + 0.005, bandW - 0.005, Math.abs(ny - 0.33 - 0.04 * (look.cut.top - 0.5) - 0.13 * nz)) : 0;
      if (onBand > 0) {
        to(bandRgb!, onBand);
        if (look.side > 0 && nz > 0.8 && Math.abs(nx) < 0.08)
          to(
            light(band!) > 0.5 ? [0.1, 0.1, 0.11] : [0.92, 0.92, 0.9],
            onBand * sstep(0.06, 0.045, Math.abs(nx)) * sstep(bandW * 0.7, bandW * 0.5, Math.abs(ny - 0.33 - 0.04 * (look.cut.top - 0.5) - 0.13 * nz)),
          );
        made('band', onBand);
        lift = lift + (Math.max(lift * 0.5, 0.012) - lift) * onBand;
      }
      const o = (j * w + i) * 4;
      img.data[o] = c[0] * 255;
      img.data[o + 1] = c[1] * 255;
      img.data[o + 2] = c[2] * 255;
      img.data[o + 3] = 255;
      if (i % sk === 0 && j % sk === 0) {
        const so = ((j / sk) * sw + i / sk) * 4;
        simg.data[so] = sv[0] * 255;
        simg.data[so + 1] = sv[1] * 255;
        simg.data[so + 2] = (lift / HAIR_MAX) * 255;
        simg.data[so + 3] = 255;
      }
    }
  };
  const done = (): Points => {
    const [color, stuffCv] = [img, simg].map((data) => {
      const cv = document.createElement('canvas');
      cv.width = data.width;
      cv.height = data.height;
      cv.getContext('2d')!.putImageData(data, 0, 0);
      return cv;
    });
    return { color, stuff: stuffCv };
  };
  return { rows: h, row, done };
}

/** His ears' colour: his skin's, a little redder. */
const earOf = (look: Look) => mix(look.skin, '#a8402e', 0.1);

/** Which head a sheet wants: its key among the heads kept, and what to paint it from. */
interface Wanted {
  key: string;
  look: Look;
  band: string | null;
}
/**
 * A finished head is a tenth of a second's painting: too long for one frame. A new man gets a quick
 * head at once (a sixteenth of the points), and the finished one a few rows at a time between frames.
 */
const JOBS: (() => boolean)[] = [];
const REFINING = new Map<string, ((head: Points) => void)[]>();
let pumping = false;
function pump() {
  const t0 = performance.now();
  while (JOBS.length && performance.now() - t0 < 4) if (JOBS[0]()) JOBS.shift();
  if (JOBS.length) setTimeout(pump, 4);
  else pumping = false;
}
function refine(want: Wanted, then: (head: Points) => void) {
  if (HEADS.has(want.key)) return;
  const waiting = REFINING.get(want.key);
  if (waiting) {
    waiting.push(then);
    return;
  }
  REFINING.set(want.key, [then]);
  const painter = headPainter(want.look, want.band, 1);
  let j = 0;
  JOBS.push(() => {
    for (const end = Math.min(painter.rows, j + 6); j < end; j++) painter.row(j);
    if (j < painter.rows) return false;
    const head = painter.done();
    if (HEADS.size >= HEADS_KEPT) HEADS.delete(HEADS.keys().next().value!);
    HEADS.set(want.key, head);
    for (const tell of REFINING.get(want.key) ?? []) tell(head);
    REFINING.delete(want.key);
    return true;
  });
  if (!pumping) {
    pumping = true;
    setTimeout(pump, 0);
  }
}
/** Finishes every head still being painted, now (a still, a test: nothing there minds the wait). */
export function settleHeads() {
  while (JOBS.length) if (JOBS[0]()) JOBS.shift();
}

/** Heads already painted, by look and band (a man's head is the same whoever he plays for): most of the time a new man takes. */
const HEADS = new Map<string, Points>();
const HEADS_KEPT = 24;

/** Canvas text in the app's face (condensed like its scoreboard figures, or as wide as asked). */
function font(ctx: CanvasRenderingContext2D, weight: number, px: number, stretch: 'condensed' | 'semi-condensed' | 'normal' = 'condensed') {
  // (an engine that doesn't take the width keyword in the shorthand ignores that line and keeps the first)
  ctx.font = `${weight} ${px}px "Archivo Variable", system-ui, sans-serif`;
  ctx.font = `${weight} ${stretch} ${px}px "Archivo Variable", system-ui, sans-serif`;
  if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = stretch;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

/** Words set along an arch over (x, y), its middle highest (`bend`: how far its ends drop, in its height), no wider than `most`. */
function arched(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, bend: number, most: number, spacing: number, paint: () => void) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const k = Math.min(1, most / total);
  let at = -total / 2;
  for (const [i, ch] of [...text].entries()) {
    const mid = (at + widths[i] / 2 - spacing / 2) * k;
    const u = mid / (most / 2);
    ctx.save();
    ctx.translate(x + mid, y + bend * px * u * u);
    ctx.rotate(Math.atan((2 * bend * px * u) / (most / 2)) * 0.9);
    ctx.scale(k, 1);
    paint();
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    at += widths[i];
  }
}

/** A number as they sew one on: its colour, an edge of another round it. */
function sewn(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, most: number, fill: string, edge: string | null, width: number) {
  if (edge) {
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3;
    ctx.lineWidth = width * 2;
    ctx.strokeStyle = edge;
    ctx.strokeText(text, x, y, most);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, most);
}

/** A man's own things, the same every night (from his seed): a headband, what he wears on his arms and legs (tape round a wrist), his shoes. */
interface Gear {
  band: string | null;
  /** A shooting sleeve: on which arm (0 left, 1 right) and its colour. */
  sleeve: { arm: 0 | 1; color: string } | null;
  wrist: { arms: (0 | 1)[]; color: string } | null;
  /** On one leg or both: a knee sleeve, or one down the whole leg. */
  leg: { legs: (0 | 1)[]; long: boolean; color: string } | null;
  /** How far up his socks come (a share of the sock: 0 all of it). */
  sockDrop: number;
  /** Tights under his shorts down to the knee (their colour), a padded sleeve over a knee, a band round an upper arm. */
  tights: string | null;
  pads: { legs: (0 | 1)[]; color: string } | null;
  armband: { arm: 0 | 1; color: string } | null;
  /** White tape round a wrist or both (under a wristband, none). */
  tape: (0 | 1)[] | null;
  /** His shoes: the upper's colour and its second one, the foam's and the tread's, the laces'; cut high round the ankle or low. */
  shoe: { base: string; accent: string; sole: string; tread: string; lace: string; high: boolean };
}

/** Numbers that look random and are a man's own: the same seed, the same run. */
function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const BLACK = '#1d1e22';
const WHITE = '#f1f0eb';

function gearOf(seed: number, kit: MatchKit): Gear {
  const r = rng(seed);
  const one = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];
  r();
  // (what a man may wear on his arms and legs is black, white or his team's colour, as the league has it)
  const allowed = kit.light ? [WHITE, kit.color, BLACK] : [kit.color, BLACK, WHITE];
  const sleeve = r() < 0.28 ? { arm: (r() < 0.75 ? 1 : 0) as 0 | 1, color: one(allowed) } : null;
  const wristRoll = r();
  const wrist = wristRoll < 0.2 ? { arms: (wristRoll < 0.08 ? [0, 1] : [r() < 0.5 ? 0 : 1]) as (0 | 1)[], color: one(allowed) } : null;
  const legRoll = r();
  // (a sleeve down the whole leg is on one leg; a knee sleeve may be on both)
  const long = r() < 0.4;
  const leg = legRoll < 0.17 ? { legs: (legRoll < 0.05 && !long ? [0, 1] : [r() < 0.5 ? 0 : 1]) as (0 | 1)[], long, color: one(allowed) } : null;
  const band = r() < 0.14 ? one(allowed) : null;
  // shoes: mostly black or white, some in the team's colour, the other two in a stripe and the sole
  const base = kit.light ? one([WHITE, WHITE, BLACK, kit.color]) : one([BLACK, BLACK, WHITE, kit.color]);
  const pale = light(base) > 0.6;
  const accent = base === kit.color ? (pale ? BLACK : WHITE) : one([kit.color, kit.color, pale ? BLACK : WHITE]);
  const sole = one(pale ? [WHITE, WHITE, '#2a2b30'] : [WHITE, '#2a2b30', '#2a2b30']);
  // (the tread under it: gum, the foam's own colour a shade down, or the second colour)
  const tread = one(['#b08a5a', mix(sole, '#000000', sole === WHITE ? 0.72 : 0.35), accent]);
  const lace = pale ? one([WHITE, accent]) : one([base, WHITE]);
  const sockDrop = one([0, 0, 0.12, 0.25]);
  // (a dice of its own, last: what came before it stays as it was)
  const shoe = { base, accent, sole, tread, lace, high: r() < 0.62 };
  const tights = r() < 0.2 ? one([BLACK, BLACK, WHITE, kit.color]) : null;
  const padRoll = r();
  // (pads go on bare knees: a man in a leg sleeve has his knee covered already)
  const pads = !leg && padRoll < 0.16 ? { legs: (padRoll < 0.1 ? [0, 1] : [r() < 0.5 ? 0 : 1]) as (0 | 1)[], color: one([BLACK, BLACK, WHITE]) } : null;
  const armband = !sleeve && r() < 0.1 ? { arm: (r() < 0.5 ? 0 : 1) as 0 | 1, color: one(allowed) } : null;
  const tapeRoll = r();
  const tape = tapeRoll < 0.18 ? ((tapeRoll < 0.07 ? [0, 1] : [r() < 0.5 ? 0 : 1]) as (0 | 1)[]).filter((k) => !wrist?.arms.includes(k)) : null;
  return { band, sleeve, wrist, leg, sockDrop, shoe, tights, pads, armband, tape: tape?.length ? tape : null };
}

/** How far a band of each kind stands off his skin (ft): terry is thick, a sleeve's hem and a sock's top a fold of knit. */
const PROUD = { terry: 0.016, hem: 0.01, sock: 0.012 };
/**
 * The bands that stand off his limbs (Cuff), where his sheet paints what he wears on them (see paint: the same
 * numbers): the top of each sock, a wristband, an armband, a sleeve's hems at his arm and his wrist, the foot of a
 * knee sleeve, a knee pad's above and below the knee.
 */
function cuffsOf(gear: Gear, kit: MatchKit): Cuff[] {
  const out: Cuff[] = [];
  const hem = (limb: Cuff['limb'], at: number, color: string, wide = 0.05) =>
    out.push({ limb, from: at - wide / 2, to: at + wide / 2, proud: PROUD.hem, color: mix(color, light(color) > 0.5 ? '#000000' : '#ffffff', 0.1) });
  for (const side of [0, 1] as const) {
    const [arm, leg] = [side, (2 + side) as Cuff['limb']];
    if (gear.sleeve?.arm === side) {
      hem(arm, 0.31, gear.sleeve.color);
      hem(arm, 2.05, gear.sleeve.color);
    }
    if (gear.wrist?.arms.includes(side)) out.push({ limb: arm, from: 1.87, to: 2.09, proud: PROUD.terry, color: gear.wrist.color });
    if (gear.armband?.arm === side) out.push({ limb: arm, from: 0.62, to: 0.72, proud: PROUD.terry, color: gear.armband.color });
    const top = 2.4 + gear.sockDrop * 0.5;
    // (a leg sleeve's top is up under his shorts, where a band would come through them: its foot only, where it ends
    // short of his sock)
    if (gear.leg?.legs.includes(side) && !gear.leg.long) hem(leg, 2.02, gear.leg.color);
    if (gear.pads?.legs.includes(side)) {
      hem(leg, 1.39, gear.pads.color, 0.06);
      hem(leg, 1.89, gear.pads.color, 0.06);
    }
    out.push({ limb: leg, from: top, to: top + 0.07, proud: PROUD.sock, color: kit.light ? WHITE : kit.color });
  }
  return out;
}

/** How far along the shoe's picture a place on the foot is (0 the heel's end, 1 the toe's), from how far forward of the ankle it is (ft). */
const shoeU = (z: number) => (z - SHOE_Z[0]) / (SHOE_Z[1] - SHOE_Z[0]);
/** Where the laces cross the throat, ft forward of the ankle (figure.py's LACES). */
const LACES = [0, 1, 2, 3, 4, 5].map((k) => 0.2 + 0.056 * k);

/**
 * His shoes. The upper is drawn unrolled: x along the foot (heel to toe), and across it `t` from the
 * ridge of the foot (0) down either side to the sole (1), the same on his inside and his outside:
 * the heel's counter and a panel on each side in the second colour, the eyestays with their
 * eyelets either side of the tongue, the laces, a toe box of mesh behind a rubber bumper, and the
 * stitching round each piece. Then the collar and tongue (round his ankle, up it), and the sole
 * (the tread, the foam over it with a line of the second colour).
 */
function paintShoes(sh: Sheet, shoe: Gear['shoe']) {
  const { base, accent, sole, tread, lace } = shoe;
  const pale = light(base) > 0.5;
  const off = (c: string, t: number) => mix(c, light(c) > 0.5 ? '#000000' : '#ffffff', t);
  const stitch = off(base, 0.3);
  const tongue = off(base, pale ? 0.12 : 0.06);
  sh.both(R_SHOE, (ctx, pick) => {
    const [, , w, h] = R_SHOE;
    // (drawn 512 along and, a turn round the foot, 192 up: the ridge at 96, the sole's edge 48 either side of it)
    ctx.scale(w / 512, h / 192);
    const X = (z: number) => shoeU(z) * 512;
    const Y = (side: number, t: number) => 96 + side * 48 * t;
    ctx.fillStyle = pick(base, 'leather');
    ctx.fillRect(-4, -4, 520, 200);
    /** A shape on both sides of the foot: its corners as (ft forward of the ankle, t). */
    const both = (pts: [number, number][], color: string, stuff: Stuff) => {
      ctx.fillStyle = pick(color, stuff);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        pts.forEach(([z, t], i) => (i ? ctx.lineTo(X(z), Y(side, t)) : ctx.moveTo(X(z), Y(side, t))));
        ctx.closePath();
        ctx.fill();
      }
    };
    /** A line of stitches on both sides. */
    const sewn = (pts: [number, number][]) => {
      ctx.strokeStyle = pick(stitch, 'lace');
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 2.2]);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        pts.forEach(([z, t], i) => (i ? ctx.lineTo(X(z), Y(side, t)) : ctx.moveTo(X(z), Y(side, t))));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    // the toe box: mesh, a row of holes punched in it; the rubber bumper round its end
    both(
      [
        [0.46, 0],
        [0.76, 0],
        [0.76, 1.6],
        [0.4, 1.6],
        [0.42, 0.8],
      ],
      off(base, pale ? 0.07 : 0.045),
      'mesh',
    );
    ctx.fillStyle = pick(off(base, 0.3), 'mesh');
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) for (let k = 0; k < 4; k++) ctx.fillRect(X(0.5 + i * 0.035) - 1, Y(side, 0.12 + k * 0.2) - 1, 2, 2);
    both(
      [
        [0.655, 0],
        [0.76, 0],
        [0.76, 1.6],
        [0.6, 1.6],
        [0.62, 0.75],
      ],
      sole,
      'rubber',
    );
    // the heel's counter, and a panel on each side under the eyestay
    both(
      [
        [-0.4, 0],
        [-0.2, 0],
        [-0.13, 0.5],
        [-0.16, 1.6],
        [-0.4, 1.6],
      ],
      accent,
      'leather',
    );
    both(
      [
        [-0.1, 1.6],
        [0.27, 1.6],
        [0.25, 0.72],
        [0.13, 0.5],
        [0.0, 0.62],
      ],
      accent,
      'leather',
    );
    // the eyestays either side of the throat, the tongue between them
    both(
      [
        [0.1, 0],
        [0.52, 0],
        [0.55, 0.36],
        [0.5, 0.52],
        [0.14, 0.62],
        [0.08, 0.4],
      ],
      off(base, pale ? 0.05 : 0.08),
      'leather',
    );
    both(
      [
        [0.12, 0],
        [0.5, 0],
        [0.5, 0.2],
        [0.12, 0.3],
      ],
      tongue,
      'mesh',
    );
    // the laces: across the throat where the model has them, crossed between
    ctx.strokeStyle = pick(lace, 'lace');
    ctx.lineWidth = 2;
    for (let k = 0; k + 1 < LACES.length; k++)
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(LACES[k]), Y(side, 0.3));
        ctx.lineTo(X(LACES[k + 1]), Y(-side, 0.3));
        ctx.stroke();
      }
    ctx.fillStyle = pick(lace, 'lace');
    for (const z of LACES) ctx.fillRect(X(z) - 6.5, Y(-1, 0.4), 13, Y(1, 0.4) - Y(-1, 0.4));
    ctx.fillStyle = pick(off(base, 0.55), 'rubber');
    for (const z of LACES)
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(X(z), Y(side, 0.47), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    sewn([
      [-0.19, 0],
      [-0.115, 0.5],
      [-0.145, 1.6],
    ]);
    sewn([
      [-0.09, 1.6],
      [0.0, 0.66],
      [0.13, 0.54],
      [0.24, 0.74],
      [0.262, 1.6],
    ]);
    sewn([
      [0.07, 0.42],
      [0.13, 0.66],
      [0.5, 0.56],
      [0.565, 0.38],
    ]);
    sewn([
      [0.4, 1.6],
      [0.41, 0.8],
      [0.45, 0],
    ]);
    // (where the upper goes into the sole: a line of shade)
    ctx.fillStyle = pick(mix(base, '#000000', 0.45), 'rubber');
    for (const side of [-1, 1]) ctx.fillRect(-4, Y(side, 0.93) - (side > 0 ? 0 : 3), 520, 3);
  });
  // the collar and tongue: leather, the padded rim a shade off it and a line of the second colour under that; the
  // tongue in front with its patch; a loop behind
  sh.around(R_COLLAR, 128, 192, (ctx, pick) => {
    const Y = (y: number) => 192 * (1 - (y - COLLAR_Y[0]) / (COLLAR_Y[1] - COLLAR_Y[0]));
    ctx.fillStyle = pick(base, 'leather');
    ctx.fillRect(-2, -2, 132, 196);
    // (the padding round the top of a high one, a shade off the leather; a line of the second colour under it)
    ctx.fillStyle = pick(off(base, 0.05), 'mesh');
    ctx.fillRect(-2, Y(0.3), 132, Y(0.16) - Y(0.3));
    ctx.fillStyle = pick(accent, 'leather');
    ctx.fillRect(-2, Y(0.16), 132, 2);
    // (the tongue, half way round)
    ctx.fillStyle = pick(tongue, 'mesh');
    ctx.fillRect(64 - 15, -2, 30, Y(0.02) + 2);
    ctx.fillStyle = pick(accent, 'print');
    ctx.fillRect(64 - 8, Y(0.3), 16, Y(0.22) - Y(0.3));
    ctx.fillStyle = pick(lace, 'lace');
    ctx.fillRect(64 - 10, Y(0.12), 20, 3);
    ctx.fillRect(64 - 10, Y(0.06), 20, 3);
    // (the loop, at the seam behind)
    ctx.fillStyle = pick(accent, 'lace');
    for (const x of [0, 128]) ctx.fillRect(x - 5, Y(0.3), 10, Y(0.1) - Y(0.3));
  });
  // the soles: the tread at the bottom, the foam over it, a line of the second colour along it
  sh.both(R_SOLE, (ctx, pick) => {
    const [, , w, h] = R_SOLE;
    ctx.fillStyle = pick(sole, 'rubber');
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = pick(tread, 'rubber');
    ctx.fillRect(0, h * (1 - 0.027 / SOLE_H), w, h);
    ctx.fillStyle = pick(accent, 'rubber');
    ctx.fillRect(0, h * (1 - 0.062 / SOLE_H), w * shoeU(0.3), h * 0.05);
    // (the heel's foam has a window of the second colour in it)
    ctx.fillRect(w * shoeU(-0.3), h * (1 - 0.085 / SOLE_H), w * (shoeU(-0.08) - shoeU(-0.3)), h * (0.03 / SOLE_H));
  });
}

/** A part of his kit's seams (see kitSeams). */
type Seam = 'panel' | 'piping' | 'groove' | 'hem' | 'stitch' | 'seam' | 'fold' | 'cord';

/**
 * His kit's seams, the one place they are drawn from: on his sheet in their colours (paint) and on the picture of how
 * far they stand off the cloth (paintRelief), so the two lie on each other to the pixel. `ink` says how a part is drawn
 * on the picture at hand, or that it isn't (null). Down each side a panel, the trim's piping down both its edges, a row
 * of stitches outside each (the groove it is sunk in, then its thread) and on the vest the seam down its middle; on the
 * shorts too the hem's two rows of stitches, the seam up the inside of each leg and round the seat, the fold where the
 * cloth goes into the waistband and the hem's band, and the cord at his waist, tied in front. In the frame of the vest's
 * picture (`tall` null: see paint) or the shorts' (`tall`: how high their picture runs, ft).
 */
function kitSeams(ctx: CanvasRenderingContext2D, ink: (part: Seam) => string | null, tall: number | null) {
  /** Fills each of some places with a part, if this picture has it. */
  const fills = (part: Seam, rects: number[][]) => {
    const style = ink(part);
    if (!style) return;
    ctx.fillStyle = style;
    for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
  };
  /** Rows of stitches along lines, `w` wide, a dash and a gap of thread at a time: the groove first (twice as wide, no gaps; `groove` which), then the thread over it. */
  const stitches = (rows: number[][], w: number, dash: number[], groove: Seam = 'groove') => {
    const runs: [Seam, number, number[]][] = [
      [groove, w * 2, []],
      ['stitch', w, dash],
    ];
    for (const [part, width, gaps] of runs) {
      const style = ink(part);
      if (!style) continue;
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(gaps);
      for (const [x0, y0, x1, y1] of rows) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  };
  if (tall === null) {
    // a panel down each side, piped in the trim: from the foot of the armhole down. (The picture goes round him by
    // angle, and the top of a shoulder is as far round as his side is: a panel run to the picture's top crossed each
    // strap, its two lines of piping beside the armhole's own trim, a strap trimmed twice)
    for (const x of [0, 256, 512]) {
      const [y0, y1] = [PANEL_TOP, 300];
      fills('panel', [[x - 15, y0, 30, y1 - y0]]);
      fills(
        'piping',
        [-1, 1].map((e) => [x + e * 15 - 1.25, y0, 2.5, y1 - y0]),
      );
      // (sewn in: a row of stitches either side of the panel, and the seam down its middle)
      stitches(
        [-19, 19].map((e) => [x + e, y0, x + e, y1]),
        0.7,
        [2.4, 1.6],
      );
      fills('seam', [[x - 0.4, y0, 0.8, y1 - y0]]);
    }
    return;
  }
  for (const x of [0, 256, 512]) {
    fills('panel', [[x - 26, 0, 52, 256]]);
    fills(
      'piping',
      [-1, 1].map((e) => [x + e * 26 - 1.5, 0, 3, 256]),
    );
    stitches(
      [-31, 31].map((e) => [x + e, 0, x + e, 256]),
      0.8,
      [2.6, 1.8],
    );
  }
  const up = 256 / tall;
  // (the cloth stops SHORTS_PAST in from each end of the picture, at the foot of the waistband and the top of the hem's
  // band: turned in there, a roll of it FOLD_FT into the cloth)
  fills('fold', [
    [-4, -4, 520, (SHORTS_PAST + FOLD_FT) * up + 4],
    [-4, 256 - (SHORTS_PAST + FOLD_FT) * up, 520, (SHORTS_PAST + FOLD_FT) * up + 4],
  ]);
  // (the hem's two rows, in a shallower groove than a seam's: they run round him as his shorts' picture does, a little
  // up and down, and a groove as deep as a seam's would draw that out)
  stitches(
    [0.115, 0.14].map((y) => [-4, 256 - y * up, 516, 256 - y * up]),
    0.8,
    [2.6, 1.8],
    'hem',
  );
  fills(
    'seam',
    [128, 384].map((x) => [x - 0.5, 0, 1, 256]),
  );
  const cord = ink('cord');
  if (cord) {
    ctx.strokeStyle = cord;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const e of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(384 + e * 3, 0.13 * up);
      ctx.quadraticCurveTo(384 + e * 9, 0.2 * up, 384 + e * 7, 0.3 * up);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
}

/**
 * How a team's kit is made, past its colours: every kit is the same cut (a panel down each side, piped: its seams
 * stand off the cloth the same on all of them, see paintRelief), and over that a team has its own
 *  - `cut`: nothing more ('panel'), bands of its trim round the hem of the vest and of each leg ('hoops'), fine
 *    stripes of it down the cloth ('pinstripe'), or its shoulders in its colour ('shoulders');
 *  - `type`, how its numbers and letters are set: heavy and narrow with an edge sewn round them ('block'), broad
 *    and open ('wide'), leaning ('italic'), or with a shadow thrown down and to the right of them ('shadow').
 * From its letters (a team is one way all season, home and away), or from its colours where the game has none.
 * Ten men in one cut and one face of type on every team was every team's kit in two colours.
 */
interface KitStyle {
  cut: 'panel' | 'hoops' | 'pinstripe' | 'shoulders';
  type: 'block' | 'wide' | 'italic' | 'shadow';
}
const KIT_CUTS: readonly KitStyle['cut'][] = ['panel', 'hoops', 'pinstripe', 'shoulders'];
const KIT_TYPES: readonly KitStyle['type'][] = ['block', 'wide', 'italic', 'shadow'];
export function kitStyle(mark: string, kit: { color: string; trim: string }): KitStyle {
  let h = 2166136261;
  for (const ch of (mark || `${kit.color}${kit.trim}`).toUpperCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  // (the type from the same letters stirred again: a team's cut says nothing of its type)
  let g = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  g ^= g >>> 15;
  g = Math.imul(g, 0x27d4eb2d);
  g ^= g >>> 13;
  return { cut: KIT_CUTS[(h >>> 0) % KIT_CUTS.length], type: KIT_TYPES[(g >>> 0) % KIT_TYPES.length] };
}
/** A leaning face's lean (the tangent of it), a broad one's size next to the narrow one's, and how far a shadow is thrown (of the edge's width). */
const TYPE_LEAN = 0.17;
const TYPE_WIDE = 0.88;
const TYPE_SHADOW = 1.15;
/** Where the vest's bands go round its hem and the legs' round theirs (its picture's rows, and a leg's: ft up from its hem), and how far apart the fine stripes are (px of the vest's picture). */
const HOOPS_VEST = [
  [208, 5],
  [216, 2],
] as const;
const HOOPS_LEG = [
  [0.2, 0.05],
  [0.28, 0.02],
] as const;
const PIN_GAP = 16;
/** The vest's picture down to here is its shoulders (the straps, over the name on his back). */
const SHOULDERS = 40;

/** One man's sheet: his kit (`mark` his team's letters, if the game has them), his number and name, his own things, his look (`anat`: his skin has its map, see Maps). */
function paint(kit: MatchKit, num: string, name: string, mark: string, gear: Gear, look: Look, shorts: [number, number], anat = false): Sheet {
  const sh = new Sheet();
  const fill = kit.token.fill;
  const ring = kit.token.ring;
  const ink = kit.token.num;
  // the number's edge: the team's second colour where it reads against both, else a deeper shade of the cloth
  const edge = (() => {
    const c = kit.light ? kit.trim : ring;
    if (c.toLowerCase() !== ink.toLowerCase() && Math.abs(light(c) - light(fill)) > 0.12) return c;
    return kit.light ? null : mix(fill, '#000000', 0.45);
  })();
  const panel = kit.light ? mix(fill, kit.color, 0.1) : mix(fill, '#000000', 0.18);
  // (a seam and its stitches: the cloth's own colour, a shade off it)
  const seam = mix(fill, light(fill) > 0.5 ? '#000000' : '#ffffff', 0.2);
  // how the team's kit is made, past its colours (see KitStyle): a fine stripe is the trim let down into the cloth
  const style = kitStyle(mark, kit);
  const pin = mix(fill, ring, 0.4);
  const shadow = edge ?? mix(fill, '#000000', 0.45);
  // (his kit's seams in their colours, each the stuff it is: the groove a row of stitches lies in and the fold into a band are only in the cloth's height, see kitSeams)
  const inks =
    (pick: Pick, cloth: Stuff) =>
    (part: Seam): string | null => {
      if (part === 'panel') return pick(panel, cloth);
      if (part === 'piping') return pick(ring, 'rib');
      if (part === 'stitch' || part === 'seam') return pick(seam, cloth);
      if (part === 'cord') return pick(kit.light ? ring : '#f1f0eb', 'lace');
      return null;
    };

  // plain patches
  sh.fill(R_SKIN, look.skin, 'skin');
  // what is behind his lips, each the first half or the second of its picture across (see sheetUv): the dark at the back
  // of his mouth, his tongue; his teeth (never a white: ivory, yellower the older he is), his gums (pink, and browner on
  // darker skin, as gums are). Each lighter than it will look: his mouth's own shade is put on it as it is drawn
  const darker = look.tone / (SKINS.length - 1);
  const half = (r: Rect, k: 0 | 1): Rect => [r[0] + (k * r[2]) / 2, r[1], r[2] / 2, r[3]];
  sh.fill(half(R_MOUTH, 0), '#3a1210', 'gullet');
  sh.fill(half(R_MOUTH, 1), mix('#c46a6c', '#8a4a48', 0.5 * darker), 'tongue');
  sh.fill(half(R_TEETH, 0), mix('#ece4d2', '#dccaa0', 0.75 * look.age), 'tooth');
  sh.fill(half(R_TEETH, 1), mix('#cc6e74', '#74403a', 0.75 * darker), 'gum');
  sh.fill(R_TRIM, ring, 'rib');
  // (his locks: the hair's colour, a little lighter and darker along them)
  sh.both(R_HAIR, (ctx, pick) => {
    const [, , w, h] = R_HAIR;
    ctx.fillStyle = pick(look.hair, 'hair');
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 24; k++) {
      ctx.fillStyle = pick(mix(look.hair, k % 2 ? '#000000' : '#8a7460', 0.2), 'hair');
      ctx.fillRect(0, ((k * 7) % 31) + 0.5, w / 2, 1.4);
    }
    // (a lock is wound: a darker turn every little way down it)
    ctx.fillStyle = pick(mix(look.hair, '#000000', 0.3), 'hair');
    for (let x = 3; x < w / 2; x += 7) ctx.fillRect(x, 0, 1.6, h);
    // (the right half in tufts: curls are not combed, and take no shine)
    ctx.fillStyle = pick(look.hair, 'curl');
    ctx.fillRect(w / 2, 0, w / 2, h);
    for (let k = 0; k < 260; k++) {
      ctx.fillStyle = pick(mix(look.hair, k % 4 ? '#000000' : '#8a7460', k % 4 ? 0.3 : 0.14), 'curl');
      ctx.beginPath();
      ctx.arc(w / 2 + 2 + ((k * 37) % (w / 2 - 4)), (k * 13) % h, 0.9 + (k % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // the vest (the old picture's frame: 512 round him, 256 up its 2 ft, its top at VEST_TOP)
  sh.around(
    R_VEST,
    512,
    256,
    (ctx, pick) => {
      ctx.fillStyle = pick(fill, 'vest');
      ctx.fillRect(-4, -40, 520, 340);
      // (the team's own cut, under the seams: stripes down the cloth, its shoulders in its colour, bands round its hem)
      if (style.cut === 'pinstripe') {
        ctx.fillStyle = pick(pin, 'vest');
        for (let x = PIN_GAP / 2; x < 512; x += PIN_GAP) ctx.fillRect(x - 0.6, -40, 1.2, 340);
      }
      if (style.cut === 'shoulders') {
        ctx.fillStyle = pick(kit.light ? kit.color : mix(fill, '#000000', 0.32), 'vest');
        ctx.fillRect(-4, -40, 520, 40 + SHOULDERS);
        ctx.fillStyle = pick(ring, 'rib');
        ctx.fillRect(-4, SHOULDERS, 520, 2.2);
      }
      if (style.cut === 'hoops') {
        ctx.fillStyle = pick(ring, 'rib');
        for (const [y, h] of HOOPS_VEST) ctx.fillRect(-4, y, 520, h);
      }
      kitSeams(ctx, inks(pick, 'vest'), null);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      // his number, front and back, in the team's type (in front it sits under the team's letters, below the V of the
      // neck, which comes down to about 70): sewn on with its edge, or its shadow thrown under it
      const digits = num.length > 1;
      const wide = style.type === 'wide';
      const numeral = (x: number, y: number, px: number, most: number, w: number) => {
        font(ctx, wide ? 800 : 900, wide ? px * TYPE_WIDE : px, wide ? (digits ? 'semi-condensed' : 'normal') : digits ? 'condensed' : 'semi-condensed');
        ctx.save();
        ctx.translate(x, y);
        if (style.type === 'italic') ctx.transform(1, 0, -TYPE_LEAN, 1, 0, 0);
        if (style.type === 'shadow') {
          ctx.fillStyle = pick(shadow, 'print');
          ctx.fillText(num, w * TYPE_SHADOW, w * TYPE_SHADOW, most);
          sewn(ctx, num, 0, 0, most, pick(ink, 'print'), null, 0);
        } else sewn(ctx, num, 0, 0, most, pick(ink, 'print'), edge && pick(edge, 'print'), w);
        ctx.restore();
      };
      numeral(384, 182, digits ? 88 : 96, 92, 3);
      numeral(128, 178, digits ? 112 : 120, 110, 3.6);
      // the team's letters arched over the front number; his name arched over the back one (each letter leaning, in a leaning type)
      const letter = () => {
        if (style.type === 'italic') ctx.transform(1, 0, -TYPE_LEAN, 1, 0, 0);
        ctx.fillStyle = pick(ink, 'print');
      };
      if (mark) {
        font(ctx, wide ? 800 : 900, wide ? 25 : 28, wide ? 'normal' : 'semi-condensed');
        arched(ctx, mark.toUpperCase(), 384, 104, 28, 0.2, 92, wide ? 4 : 3, letter);
      }
      if (name) {
        font(ctx, wide ? 700 : 800, wide ? 19 : 21, wide ? 'semi-condensed' : 'condensed');
        arched(ctx, name.toUpperCase(), 128, 62, 21, 0.3, 112, wide ? 2.8 : 2.2, letter);
      }
    },
    1 / VEST_TOP,
    0,
  );

  // the shorts: a panel down each side with the trim's piping, the team's letters on his left leg
  const tall = shorts[1] - shorts[0];
  sh.around(R_SHORTS, 512, 256, (ctx, pick) => {
    ctx.fillStyle = pick(fill, 'shorts');
    ctx.fillRect(-4, -4, 520, 264);
    // (the same cut as the vest's: the stripes go on down them, the bands round each leg's hem)
    if (style.cut === 'pinstripe') {
      ctx.fillStyle = pick(pin, 'shorts');
      for (let x = PIN_GAP / 2; x < 512; x += PIN_GAP) ctx.fillRect(x - 0.6, -4, 1.2, 264);
    }
    if (style.cut === 'hoops') {
      ctx.fillStyle = pick(ring, 'rib');
      for (const [up, h] of HOOPS_LEG) ctx.fillRect(-4, 256 - ((up + h) * 256) / tall, 520, (h * 256) / tall);
    }
    kitSeams(ctx, inks(pick, 'shorts'), tall);
    if (mark) {
      // (a round mark a third of a foot across, low on his left leg's front: the picture goes round him
      // 0.62 ft out from his middle there, and up the shorts' height, so a foot is this many pixels each way)
      const across = 512 / (2 * Math.PI * 0.62);
      const up = 256 / tall;
      const [x, y] = [0.885 * 512, 256 - 0.45 * up];
      ctx.beginPath();
      ctx.ellipse(x, y, 0.17 * across, 0.17 * up, 0, 0, Math.PI * 2);
      ctx.fillStyle = pick(ring, 'print');
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, 0.145 * across, 0.145 * up, 0, 0, Math.PI * 2);
      ctx.fillStyle = pick(fill, 'print');
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(across / up, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      font(ctx, 900, Math.round((mark.length > 2 ? 0.12 : 0.15) * up), 'condensed');
      ctx.fillStyle = pick(ink, 'print');
      ctx.fillText(mark.toUpperCase(), 0, 0.01 * up, 0.24 * up);
      ctx.restore();
    }
  });

  // his head: his face, his hair and beard, a point at a time round its middle
  // (a headband goes on hair that lies close, not round an afro or a high top)
  const band = ['afro', 'hightop', 'twists'].includes(STYLES[look.style].name) ? null : gear.band;
  const key = `${JSON.stringify(look)} ${band}`;
  let head = HEADS.get(key);
  if (!head) {
    // (a quick one for now: the figure asks for the finished one, see refine)
    const quick = headPainter(look, band, QUICK_K);
    for (let j = 0; j < quick.rows; j++) quick.row(j);
    head = quick.done();
  }
  sh.put(R_HEAD, head);
  sh.fill(R_EAR, earOf(look), 'skin');
  sh.head = { key, look, band };

  // the limbs' strips: skin, and what he wears on them
  for (const [limb, rect] of R_LIMB.entries()) {
    const arm = limb < 2;
    const side = (limb % 2) as 0 | 1;
    const len = arm ? ARM_LEN : LEG_LEN;
    const span = (from: number, to: number, color: string, stuff: Stuff) =>
      sh.both(rect, (ctx, pick) => {
        ctx.fillStyle = pick(color, stuff);
        ctx.fillRect((from / len) * rect[2], 0, ((to - from) / len) * rect[2], rect[3]);
      });
    sh.fill(rect, look.skin, 'skin');
    // (a joint's skin is a shade darker: his elbow, his knee. Half that where his skin's anatomy has its own shade there)
    const joint = arm ? 1.1 : 1.62;
    sh.both(rect, (ctx, pick) => {
      const at = (joint / len) * rect[2];
      const shade = ctx.createLinearGradient(at - 40, 0, at + 40, 0);
      const dark = mix(look.skin, '#3a1c10', anat ? 0.08 : 0.16);
      shade.addColorStop(0, pick(look.skin, 'skin'));
      shade.addColorStop(0.5, pick(dark, 'skin'));
      shade.addColorStop(1, pick(look.skin, 'skin'));
      ctx.fillStyle = shade;
      ctx.fillRect(at - 40, 0, 80, rect[3]);
    });
    if (arm) {
      // (his shoulder shines with sweat; his hand, from the wrist on, is a little rougher and its palm paler)
      span(0, 0.55, look.skin, 'sweat');
      // (from over his wrist, not at a line round it: his skin is the same skin on both sides of it)
      const hand = mix(look.skin, '#e8c0a8', 0.1);
      sh.both(rect, (ctx, pick) => {
        const [a, b] = [(HAND_FROM[0] / len) * rect[2], (HAND_FROM[1] / len) * rect[2]];
        const g = ctx.createLinearGradient(a, 0, b, 0);
        g.addColorStop(0, pick(look.skin, 'hand'));
        g.addColorStop(1, pick(hand, 'hand'));
        ctx.fillStyle = g;
        ctx.fillRect(a, 0, b - a, rect[3]);
      });
      span(HAND_FROM[1], len, hand, 'hand');
      if (gear.sleeve?.arm === side) span(0.28, 2.08, gear.sleeve.color, 'sleeve');
      if (gear.wrist?.arms.includes(side)) span(1.86, 2.1, gear.wrist.color, 'terry');
      if (gear.armband?.arm === side) span(0.62, 0.72, gear.armband.color, 'terry');
      if (gear.tape?.includes(side)) span(2.0, 2.14, '#ebe8e1', 'tape');
    } else {
      // socks from the shoe up to mid-calf (lower for some), a band of the team's colour at the top of a white one
      const sock = kit.light ? WHITE : kit.color;
      const top = 2.4 + gear.sockDrop * 0.5;
      if (gear.tights) span(0.8, 1.78, gear.tights, 'sleeve');
      if (gear.leg?.legs.includes(side)) span(gear.leg.long ? 0.9 : 1.3, gear.leg.long ? top + 0.05 : 2.05, gear.leg.color, 'sleeve');
      if (gear.pads?.legs.includes(side)) {
        // (a padded sleeve over the knee: its cuffs a shade off it, the pad itself quilted)
        span(1.36, 1.92, gear.pads.color, 'sleeve');
        span(1.48, 1.8, mix(gear.pads.color, light(gear.pads.color) > 0.5 ? '#000000' : '#ffffff', 0.12), 'terry');
      }
      span(top, len, sock, 'sock');
      span(top + 0.07, top + 0.13, sock === WHITE ? kit.color : WHITE, 'sock');
    }
  }

  paintShoes(sh, gear.shoe);
  return sh;
}

/** (Shallower and less even than they were: on a light kit, close up, they were deep stripes a hand apart.) */
/** The folds his kit hangs in (see foldsOf): how deep a vest's are, his shorts', and the short ones where cloth is pulled or bunched (ft); how dark the bottom of one is (a share). */
const FOLDS = ['0.036', '0.042', '0.026'] as const;
const FOLD_SHADE = '0.18';
/** Where his vest's picture and his shorts' are on the sheet (uv). */
const ON_VEST = (uv: string) => `( ${uv}.y > ${(1 - (R_VEST[1] + R_VEST[3]) / SHEET).toFixed(4)} )`;
const ON_SHORTS = (uv: string) =>
  `( ${uv}.x < ${((R_SHORTS[0] + R_SHORTS[2]) / SHEET).toFixed(4)} && ${uv}.y > ${(1 - (R_SHORTS[1] + R_SHORTS[3]) / SHEET).toFixed(4)} && ${uv}.y < ${(1 - R_SHORTS[1] / SHEET).toFixed(4)} )`;
/** Hair that is a shape of its own (an afro, a high top, locks): where its picture is on the sheet, and the curls in its surface (how many to the foot, how deep, ft; a finer grain over them). */
const ON_PIECE = (uv: string) => `( ${uv}.x > ${(R_HAIR[0] / SHEET).toFixed(4)} && ${uv}.y < ${(1 - R_HAIR[1] / SHEET).toFixed(4)} )`;
const CURLS = ['34.0', '0.016', '115.0', '0.005'] as const;
/**
 * A vest is not painted on him: below his chest it hangs off him, a little further out the lower it goes and
 * unevenly round him, and blouses over his waistband where it is tucked in (ft at the most; the model's own is skin-tight).
 */
const VEST_LOOSE = 0.05;
/**
 * The top of his shorts' waistband, as built (figure.py's WAIST, ft), and how far in toward him his vest is drawn at it
 * (ft). His vest's hang starts there, and under the band it is tucked in: the model's folds over his waistband stand it
 * off him by up to some 7 mm at the band's top, more than the band does, and hung out as well it came out through the
 * band most of the way round him, its edge a ragged line along the band's top. Drawn in, it goes in under the band's own
 * edge all the way round (by 3.5 mm or more, as built), and comes back out a little way above it, not at it: a triangle
 * of his vest across the band's edge, drawn in at one corner and not the others, stood out through it.
 */
const WAIST_TOP = 3.77;
const TUCK_IN = 0.045;
const VEST_HANG = /* glsl */ `if ${ON_VEST('uv')} {
  float low = smoothstep( 5.2, 4.2, position.y ) * smoothstep( ${WAIST_TOP.toFixed(2)}, ${(WAIST_TOP + 0.18).toFixed(2)}, position.y );
  transformed += normal * ${VEST_LOOSE} * low * ( 0.75 + 0.25 * sin( position.x * 7.0 + position.z * 5.0 + position.y * 2.0 ) );
  transformed -= normal * ${TUCK_IN} * ( 1.0 - smoothstep( ${(WAIST_TOP + 0.03).toFixed(2)}, ${(WAIST_TOP + 0.18).toFixed(2)}, position.y ) );
}`;
/**
 * What the figures' material does beyond a plain one: its roughness, a cloth's sheen and, close up, the
 * knit of it come from the stuff picture. (The knit's bumps are worked out where they're drawn, and fade
 * out as they get too fine for the pixels to show.)
 */
const STUFF_PARS = /* glsl */ `
uniform sampler2D uStuff;
// (how much of the sky the baked shade says a point of his skin sees, 1 all of it: down in a hollow the shine of the
// building and the lamps is shut out as its light is, or his eyes' sockets and his nostrils glint)
float shutK = 1.0;
// (Mikkelsen's bump, as three's but with the screen's steps left their length: the height is in feet, as the knit's depth is.
// Where his skin is folded over on itself, as deep in his armpit, a triangle faces well away from the normal it is lit
// by, and the bump, which is divided by how far the two agree, turns his normal right over: a slit of light. Less of it
// where they part by more than some 25 degrees, none past 55. The surface's own steps across the screen are taken once,
// where every pixel is, before anything is asked (knitSx, knitSy: see RELIEF_MARK): a bump is often put on in a branch)
vec3 knitSx;
vec3 knitSy;
vec3 knitNormal( vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
  vec3 vSigmaX = knitSx;
  vec3 vSigmaY = knitSy;
  vec3 R1 = cross( vSigmaY, surf_norm );
  vec3 R2 = cross( surf_norm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDirection;
  float agree = abs( fDet ) / max( length( cross( vSigmaX, vSigmaY ) ), 1e-20 );
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 ) * smoothstep( 0.55, 0.9, agree );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
// (numbers that look random and are a place's own, and the same eased between places: his skin's grain)
float grain3( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float noise3( vec3 x );
// (the folds a vest and a pair of shorts hang in, as built (p, ft): how high the cloth stands there, ft. A vest is
// tight over his chest and shoulders and hangs looser to its hem: long folds down it, pulled a little toward each
// armhole, and where it is tucked in at his waist it bunches in short ones across. Shorts hang in deeper ones down
// each leg from his waistband, and pull across from his crotch)
float foldsOf( vec3 p, float shorts ) {
  float warp = noise3( vec3( p.x * 1.3, p.y * 1.1, p.z * 1.3 ) + 4.0 ) - 0.5;
  if ( shorts > 0.5 ) {
    float leg = abs( p.x ) - 0.34;
    float hang = 0.35 + 0.65 * smoothstep( 3.75, 2.9, p.y );
    vec3 q = vec3( p.x * 4.4 + warp * 2.8, p.y * 0.75 - 0.9 * abs( leg ), p.z * 4.4 - warp * 2.2 );
    float a = noise3( q );
    float b = noise3( q * 2.3 + 7.1 );
    float pull = noise3( vec3( ( p.y - 3.1 + abs( p.x ) * 0.9 ) * 6.5, p.z * 1.2, 3.0 + sign( p.x ) ) );
    float cross = ( 1.0 - smoothstep( 0.1, 0.55, abs( p.x ) ) ) * smoothstep( 0.0, 0.25, p.z + 0.1 );
    return ${FOLDS[1]} * hang * ( a + 0.4 * b - 0.3 * abs( 2.0 * a - 1.0 ) ) + ${FOLDS[2]} * cross * pull;
  }
  float hang = smoothstep( 5.3, 4.15, p.y );
  vec3 q = vec3( p.x * 4.8 + warp * 3.6, p.y * 0.7 + 0.6 * abs( p.x ), p.z * 4.8 - warp * 3.6 );
  float a = noise3( q );
  float b = noise3( q * 2.4 + 3.3 );
  float bunch = smoothstep( 4.3, 3.85, p.y ) * noise3( vec3( p.x * 1.6 + warp, p.y * 8.0, p.z * 1.6 ) );
  return ${FOLDS[0]} * ( 0.45 + 0.55 * hang ) * ( 0.55 * a + 0.4 * b + 0.3 * abs( 2.0 * a - 1.0 ) ) + ${FOLDS[2]} * 0.7 * bunch;
}
float noise3( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( grain3( i ), grain3( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( grain3( i + vec3( 0.0, 1.0, 0.0 ) ), grain3( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
    mix( mix( grain3( i + vec3( 0.0, 0.0, 1.0 ) ), grain3( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( grain3( i + vec3( 0.0, 1.0, 1.0 ) ), grain3( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
    f.z );
}`;
/** A knit's yarn, row on row, a little uneven further off than its stitches show: this many rows to the sheet's width. */
const KNIT = 640;
/**
 * The grain of hair cropped close (tufts a few millimetres across, this many to the foot of him as built), and how
 * deep (ft). Worked out in his own frame (where he is as built), so it goes with him and never swims.
 */
const TUFTS = 110;
const TUFTS_DEEP = 0.0009;
/** How far past the line where the light stops falling on his skin it still comes out of it, warmer (a share of the turn: see RE_Direct_Skin). */
const WRAP_SKIN = '0.55';
/** How much light of its own his head has (a share of its colour), for the lightest skin; the darkest has this many times that again (see uTone). */
const FACE_FILL = '0.13';
/**
 * How much of the baked shade on his face is lifted off it (and as much more again as the rest of him gets for a darker
 * skin): his face's own hollows are baked close (figure.py's FACE_REACH), so most of it stays. And how much of a lamp's
 * shine the shade shuts out where his skin is down in a hollow (the building's, all of it as it shuts its light out).
 */
const HEAD_LIFT = '0.15';
const SHUT_LAMPS = '0.6';
const FACE_FILL_DARK = '1.6';
/** How much of a lamp behind him comes through his ears and the wings of his nose toward the camera (a share of its light on his skin's colour). */
const THROUGH = '0.8';
/**
 * Light that goes into skin comes out of it a little way on, redder: past the line where a lamp stops falling on
 * him his skin keeps a warm edge of it, as no cloth does (a soft terminator, not a hard one). `skinWrap` is how
 * much of his skin the point is (set where his colour is worked out).
 */
/** The sharper shine over his skin's own (its oil, his sweat): how much smoother than his skin it is (a share of its roughness), and how much of it a dry light skin has, the darkest more by, a wet one more by. */
const SKIN_OIL = ['0.84', '0.085', '0.05', '0.42'] as const;
/** How much of the building's own shine his skin goes without (a share). */
const SKIN_ROOF = '0.5';
/** His hair's two bands of shine: how far each is shifted along the strand (toward its root, toward its tip), and how tight each is. */
const HAIR_SHIFT = ['-0.12', '0.22'] as const;
const HAIR_SHARP = ['90.0', '14.0'] as const;
/** And how much of it there is. */
const HAIR_SHINE = '0.1';
const SKIN_WRAP = /* glsl */ `
float skinWrap = 0.0;
float skinThin = 0.0;
float skinGloss = 0.0;
float hairShine = 0.0;
vec3 hairTint = vec3( 0.0 );
vec3 hairAlong = vec3( 0.0, 1.0, 0.0 );
void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float nl = dot( geometryNormal, directLight.direction );
  float wrap = saturate( ( nl + ${WRAP_SKIN} ) / ( 1.0 + ${WRAP_SKIN} ) );
  float past = max( wrap * wrap - saturate( nl ), 0.0 );
  reflectedLight.directDiffuse += skinWrap * past * directLight.color * BRDF_Lambert( material.diffuseColor ) * vec3( 1.0, 0.4, 0.26 );
  // (and where he is thin, a lamp behind him shines through him toward the camera, red: his ears, the edges of his nose)
  // (most at its thin edges, seen edge on)
  float through = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3.0 ) * saturate( 0.25 - nl ) * ( 0.5 + 0.5 * ( 1.0 - abs( dot( geometryNormal, geometryViewDir ) ) ) );
  reflectedLight.directDiffuse += skinThin * through * ${THROUGH} * directLight.color * material.diffuseColor * vec3( 1.0, 0.24, 0.14 );
  // (skin's shine is two: the broad one of the skin itself, above, and a sharper one of the oil and the sweat on
  // it, which is what a lamp overhead puts along a shoulder, a brow, the bridge of a nose)
  if ( skinGloss > 0.0 ) {
    PhysicalMaterial oil = material;
    oil.roughness = max( 0.22, material.roughness * ${SKIN_OIL[0]} );
    reflectedLight.directSpecular += skinGloss * saturate( nl ) * directLight.color * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, oil );
  }
  // (hair's shine runs across its strands, not round a ball: a band of the lamp's own white where the strands turn
  // it to the camera, and a little way toward their tips a broader one of the hair's own colour, come through it)
  if ( hairShine > 0.0 ) {
    vec3 hv = normalize( directLight.direction + geometryViewDir );
    vec3 t1 = normalize( hairAlong + geometryNormal * ${HAIR_SHIFT[0]} );
    vec3 t2 = normalize( hairAlong + geometryNormal * ${HAIR_SHIFT[1]} );
    float d1 = dot( t1, hv );
    float d2 = dot( t2, hv );
    float lit = smoothstep( -0.25, 0.35, nl );
    vec3 band = vec3( 0.22 ) * pow( sqrt( max( 0.0, 1.0 - d1 * d1 ) ), ${HAIR_SHARP[0]} ) + hairTint * pow( sqrt( max( 0.0, 1.0 - d2 * d2 ) ), ${HAIR_SHARP[1]} );
    reflectedLight.directSpecular += hairShine * lit * directLight.color * band;
  }
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin`;

/** Where a place on the plane of his face (figure.py's face_at) is on the sheet, in uv. */
function faceUv(px: number, py: number): [number, number] {
  const d = [(px / 0.8) * HEAD_SIZE[0], (py / 0.8) * HEAD_SIZE[1], HEAD_SIZE[2]];
  const u = (headU(Math.atan2(d[0], d[2])) + WRAP) / (1 + 2 * WRAP);
  const v = headV(Math.atan2(d[1], Math.hypot(d[0], d[2])));
  return [(R_HEAD[0] + u * R_HEAD[2]) / SHEET, 1 - (R_HEAD[1] + (1 - v) * R_HEAD[3]) / SHEET];
}
/**
 * His eyes, drawn where his head's picture is lit: close up a picture has too few points for an eye (a dozen across
 * its iris), so there the material draws it itself, as headPainter does but as sharp as the screen: the white in the
 * shade of its lid (and his blood in it as he tires), the iris under its cornea with its fibres, the dark ring round it
 * and the pupil, the wet rim of his lower lid, the lashes; and his blink, the upper lid down over the ball to the lower
 * one. The ball is lit as the ball it is (eyeN, EYE_BALL): its shine and the light in it (CATCH_LIGHT) are where the lamps
 * put them on its round, as his gaze and the camera have it. Far off the picture's own eye is left to show (but for a blink).
 * (A point of the sheet is taken back to the plane of his face the way it was put there: headU and headV undone.)
 */
const EYES = (() => {
  const f = (v: number) => v.toFixed(5);
  // (the eyes' own corner of the sheet, a little over: nothing is worked out anywhere else)
  const box = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => faceUv(...faceBack(sx * (EYE[0] + EYE[2] + 0.06), EYE[1] + sy * 0.13))));
  const [u0, u1] = [Math.min(...box.map((c) => c[0])), Math.max(...box.map((c) => c[0]))];
  const [v0, v1] = [Math.min(...box.map((c) => c[1])), Math.max(...box.map((c) => c[1]))];
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const rgb = (c: readonly number[]) => `vec3( ${c.map((v) => f(lin(v))).join(', ')} )`;
  return /* glsl */ `if ( vMapUv.x > ${f(u0)} && vMapUv.x < ${f(u1)} && vMapUv.y > ${f(v0)} && vMapUv.y < ${f(v1)} ) {
      // (round him and up him from where the point is on the sheet)
      float hu = ( vMapUv.x - ${f(R_HEAD[0] / SHEET)} ) / ${f(R_HEAD[2] / SHEET)} * ${f(1 + 2 * WRAP)} - ${f(WRAP)};
      float hv = ( vMapUv.y - ${f(1 - (R_HEAD[1] + R_HEAD[3]) / SHEET)} ) / ${f(R_HEAD[3] / SHEET)};
      float ha = ( hu - 0.5 ) * 6.28318;
      float ht = hv;
      for ( int i = 0; i < 4; i ++ ) {
        ha -= ( ha + ${f(HEAD_KA)} * sin( ha ) - ( hu - 0.5 ) * 6.28318 ) / ( 1.0 + ${f(HEAD_KA)} * cos( ha ) );
        ht -= ( ht + ${f(HEAD_KE / (2 * Math.PI))} * ( sin( 6.28318 * ( ht - ${f(HEAD_CE)} ) ) + ${f(Math.sin(2 * Math.PI * HEAD_CE))} ) - hv ) / ( 1.0 + ${f(HEAD_KE)} * cos( 6.28318 * ( ht - ${f(HEAD_CE)} ) ) );
      }
      float hel = ( ht - 0.5 ) * 3.14159;
      // (and from there the plane of his face: out from his nose, and up)
      vec2 fp = faceT( vec2( tan( ha ) * ${f((HEAD_SIZE[2] / HEAD_SIZE[0]) * 0.8)}, tan( hel ) / cos( ha ) * ${f((HEAD_SIZE[2] / HEAD_SIZE[1]) * 0.8)} ) );
      float side = sign( fp.x );
      float ex = abs( fp.x ) - ${f(EYE[0])};
      float ey = fp.y - ${f(EYE[1])};
      float w = ${f(EYE[2])};
      float aa = clamp( fwidth( fp.y ), 0.0008, 0.05 );
      float ax = clamp( fwidth( fp.x ), 0.0008, 0.05 );
      // (how close: all of it once an eye is a dozen pixels high, none of it under five)
      float near = 1.0 - smoothstep( 0.007, 0.018, aa );
      float show = max( near, step( 0.001, uBlink + abs( uLid.x ) + abs( uLid.y ) ) );
      if ( show > 0.0 ) {
        float t = min( 1.0, abs( ex ) / w );
        float k = 1.0 - t * t;
        float tilt = uEye.x * ex / w;
        // (his lids go with his eyes: the upper one rides on the top of his iris, down with it and nearly as far up; the
        // lower one a little down with it and up a little with it)
        // (and with his face: the upper one up as he stares, down as he narrows his eyes or tires; the lower one up as
        // he narrows them or his cheeks come up under them: see uLid)
        float up = tilt + uEye.y * pow( k, 0.55 ) + ( 0.85 * min( uGaze.y, 0.0 ) + 0.7 * max( uGaze.y, 0.0 ) + uLid.x ) * pow( k, 0.55 );
        float low = tilt - 0.037 * pow( k, 0.8 ) + ( 0.3 * min( uGaze.y, 0.0 ) + 0.12 * max( uGaze.y, 0.0 ) + uLid.y ) * pow( k, 0.8 );
        up = max( up, low + 0.002 );
        float lid = mix( up, low - 0.004, uBlink );
        float inX = 1.0 - smoothstep( w - ax, w + ax, abs( ex ) );
        // (shut, his lid covers the picture's own lashes too, along the top of the eye)
        // (and over the shade of the fold above it, going into it softly: a lid, not a lens laid over the eye)
        float top = up + 0.026 * smoothstep( 0.0, 0.4, uBlink );
        float soft = max( aa, 0.009 * smoothstep( 0.0, 0.4, uBlink ) );
        float gap = inX * smoothstep( low - aa, low + aa, ey ) * ( 1.0 - smoothstep( top - soft, top + aa, ey ) );
        float under = 1.0 - smoothstep( lid - aa, lid + aa, ey );
        float lidShade = 0.36 + 0.64 * smoothstep( lid, lid - 0.055, ey );
        // the ball as a ball (in iris radii from its middle, a circle on him): the round of the eye, and over the iris the
        // cornea standing out of it, turned with his gaze; what the lamps make of it is worked out on its round, not on his
        // lids' skin (see eyeN: its shine, the light in it)
        vec2 ic0 = vec2( side * uGaze.x - uGaze.z, uGaze.y );
        vec2 bp = vec2( ex / ${f(IRIS[0])}, ( ey - ${f(IRIS[2])} ) / ${f(IRIS[1])} );
        vec2 gz = vec2( ic0.x / ${f(IRIS[0])}, ic0.y / ${f(IRIS[1])} ) / ${f(EYE_BALL[0])};
        vec3 cc = vec3( gz, sqrt( max( 0.0, 1.0 - dot( gz, gz ) ) ) ) * ${f(EYE_BALL[2])};
        vec2 cp = bp - cc.xy;
        float hE = sqrt( max( ${f(0.06 * EYE_BALL[0] ** 2)}, ${f(EYE_BALL[0] ** 2)} - dot( bp, bp ) ) );
        float hC = cc.z + sqrt( max( 0.0, ${f(EYE_BALL[1] ** 2)} - dot( cp, cp ) ) );
        vec3 nb = normalize( mix( vec3( bp, hE ) / ${f(EYE_BALL[0])}, vec3( cp, hC - cc.z ) / ${f(EYE_BALL[1])}, smoothstep( -0.12, 0.12, hC - hE ) ) );
        eyeN = normalize( mat3( viewMatrix ) * ( uHead * vec3( side * nb.x, nb.y, nb.z ) ) );
        // the iris: behind the cornea, so as the camera goes round him it shifts against the lids (each eye's outward is
        // his own side); its own colour all through, a little lighter in a ring round the pupil, darker to its rim and then
        // the dark ring round it (the limbus) going softly into the white; and the light the cornea gathers onto its far
        // side, under a lamp above: its lower half the brighter. No glow
        vec3 vh = ( normalize( vViewPosition ) * mat3( viewMatrix ) ) * uHead;
        vec2 ip = bp - gz * ${f(EYE_BALL[0])} - vec2( side * vh.x, vh.y ) / max( vh.z, 0.35 ) * ${f(EYE_BALL[3])};
        float r = length( ip );
        float ar = aa / ${f(IRIS[1])};
        float ang = atan( ip.y, ip.x );
        float fineI = 1.0 - smoothstep( 0.0012, 0.004, aa );
        float fibre = 0.86 + 0.14 * sin( ang * 26.0 + 3.0 * sin( ang * 7.0 ) ) + fineI * 0.12 * ( noise3( vec3( ang * 14.0, r * 9.0, side ) ) - 0.5 );
        vec3 ic = uIris * ( 0.95 + 0.4 * smoothstep( 0.44, 0.6, r ) * ( 1.0 - smoothstep( 0.62, 0.9, r ) ) - 0.45 * smoothstep( 0.78, 1.0, r ) ) * fibre;
        ic *= 1.0 + 0.6 * smoothstep( 0.1, 0.8, - ip.y ) * ( 1.0 - smoothstep( 0.7, 0.95, r ) );
        // the white: never as white as a picture of one (it is wet, and in the shade of his lid and his brow), greyer and
        // redder toward the corners; and as he tires, his blood in it: fine vessels run in from the corners, and a flush
        float tired = uWorn.z;
        vec3 eye = ${rgb([0.72, 0.69, 0.65])} * vec3( 1.0, 1.0 - ( 0.22 + 0.12 * tired ) * t * t, 1.0 - ( 0.3 + 0.12 * tired ) * t * t );
        float vein = 1.0 - abs( 2.0 * noise3( vec3( atan( bp.y, bp.x ) * 7.0 + 1.2 * noise3( vec3( bp * 2.5, side ) ), length( bp ) * 1.4, side * 3.0 ) ) - 1.0 );
        vein = fineI * smoothstep( 0.9, 0.985, vein ) * smoothstep( 0.3, 0.9, t );
        eye = mix( eye, ${rgb([0.66, 0.2, 0.18])}, ( 0.2 + 0.65 * tired ) * vein );
        eye *= lidShade;
        float limbus = smoothstep( 0.86, 1.0, r ) * ( 1.0 - smoothstep( 1.0, 1.14 + ar, r ) );
        eye = mix( eye, ic * lidShade, 1.0 - smoothstep( 1.0 - ar, 1.0 + ar, r ) );
        eye = mix( eye, ${rgb([0.09, 0.075, 0.07])} * lidShade, 0.7 * limbus );
        eye = mix( eye, vec3( 0.002 ), 1.0 - smoothstep( 0.45 - ar, 0.45 + ar, r ) );
        // (the pink of its inner corner)
        eye = mix( eye, ${rgb([0.62, 0.38, 0.35])} * lidShade, 0.75 * smoothstep( - w + 0.045, - w + 0.012, ex ) );
        // his lid over it as far as it is down, in his own skin
        // (as his upper lid is painted round it, a little darker and redder than his cheek, and only just shaded along
        // the line of his lashes, where it folds: shut, it is his skin over his eye, not a plate laid on it)
        vec3 over = uSkin * vec3( 0.8, 0.67, 0.65 ) * mix( 0.8, 1.0, smoothstep( lid, mix( lid, top, 0.5 ) + 0.006, ey ) );
        vec3 drawn = mix( over, eye, under );
        diffuseColor.rgb = mix( diffuseColor.rgb, drawn, gap * show );
        // the rim of his lower lid (its waterline), a wet pink band along the foot of the ball, its own thickness; the
        // tears along its edge catch the light (eyeTear)
        float rim = inX * smoothstep( low - 0.008 - aa, low - 0.005, ey ) * ( 1.0 - smoothstep( low - aa, low + aa, ey ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, uSkin * vec3( 1.0, 0.62, 0.62 ) * 0.72, 0.7 * rim * show * ( 1.0 - uBlink ) );
        eyeTear = inX * exp( - pow( ( ey - low - 0.001 ) / max( 0.0011, aa ), 2.0 ) ) * show * ( 1.0 - uBlink ) * fineI * ( 1.0 - t * t );
        // lashes: along the upper lid's edge, a run of hairs curling up off it (longer and heavier toward the outer corner,
        // each its own up close, a dark line further off), and a sparse thinner row under the lower lid's rim
        float lt = smoothstep( - w, w, ex );
        float above = ey - lid;
        float lashLen = 0.007 + 0.008 * lt;
        float strand = smoothstep( 0.3, 0.75, noise3( vec3( ( ex - above * ( 0.6 * lt - 0.2 ) ) * 520.0, side * 7.0, 0.0 ) ) );
        float lash = inX * smoothstep( -0.0025 - aa, -0.0005, above ) * pow( 1.0 - smoothstep( 0.0, lashLen + aa, above ), 1.5 ) * mix( 0.9, 0.4 + 0.6 * strand, fineI ) * ( 0.75 + 0.25 * lt );
        float below = low - 0.0075 - ey;
        float lash2 = inX * smoothstep( -0.001, 0.0005, below ) * ( 1.0 - smoothstep( 0.0, 0.004 + aa, below ) ) * mix( 0.2, 0.4 * strand, fineI ) * ( 0.2 + 0.8 * lt );
        diffuseColor.rgb = mix( diffuseColor.rgb, ${rgb([0.07, 0.05, 0.045])}, 0.94 * max( lash, lash2 ) * show );
        eyeWet = gap * under * show;
        shut = max( shut, gap * ( 1.0 - under ) );
        eyeK = max( eyeK, gap * under * show );
      }
    }`;
})();

/**
 * What a man's material is told of him as he plays: how dark his skin is (0 the lightest tone, 1 the darkest), its
 * colour, how far shut his eyes are; his eyes' colour, and how they are set (their tilt, how far open); how far his
 * mouth is open (shut, his teeth are in the dark behind his lips).
 */
interface Told {
  uTone: { value: number };
  uSkin: { value: Color };
  /** His hair's colour (his fuzz stands only where his head's picture is nearly all of it: see stuffMaterial). */
  uHair: { value: Color };
  /** His brows' hairs' colour (see stuffMaterial: close up, the picture's brows are drawn hair by hair). */
  uBrow: { value: Color };
  uBlink: { value: number };
  uIris: { value: Color };
  uEye: { value: Vector2 };
  /** Where his eyes look, on the plane of his face: across (to his left), up, and how far each comes in toward his nose. */
  uGaze: { value: Vector3 };
  /** How far his lids stand from where they are set, on the plane of his face (up): the upper one's, the lower one's. */
  uLid: { value: Vector2 };
  uMouth: { value: number };
  /** His face as it moves (see FACE_MOVE): a smile, a grimace, lips pressed, a snarl; then lips apart, his cheeks up. */
  uMove: { value: Vector4 };
  uMove2: { value: Vector4 };
  /** And more of it: lips rounded, cheeks blown out, lips stretched wide; and how one-sided his mouth is (its sign the side). */
  uMove3: { value: Vector4 };
  /** His face's own shape (look.ts): his cheekbones, the flesh of his cheeks, his chin, his jaw's corners; then his lips, his brow, how deep his eyes are set, his nose's wings. */
  uShape: { value: Vector4 };
  uShape2: { value: Vector4 };
  /** How his head is turned in the world (from as built): his eyes' round is lit as it faces (see EYES). */
  uHead: { value: Matrix3 };
  /** What the game has done to his skin (see Fig.skin): how wet it is with sweat, how flushed he is, how tired his eyes are; and how lived-in his face is (Look.age). */
  uWorn: { value: Vector4 };
  /** The lines his face makes as it moves (see CREASE_DEEP): his brows raised, drawn down, his eyes narrowed, shut tight. */
  uCrease: { value: Vector4 };
}

/**
 * The lines his face makes as it moves, how deep each is at the most (ft: a fraction of a millimetre to most of one),
 * times as much again as his years make it (CREASE_AGE: the youngest face's share, the most lived-in's: Look.age); and how
 * dark the deepest is down in it (CREASE_SHADE: a share of his skin's colour taken off). Each is the
 * hollow of a fold and the skin bunched beside it, as a bump on his skin's light, and the shade down in it: lines across
 * his forehead with his brows raised; the two between his brows as he frowns (and one across the root of his nose for a
 * hard frown); crow's-feet out from his eyes' outer corners and a fold under each lower lid with the skin bunched over it,
 * as he narrows his eyes or his cheeks come up; the fold from each wing of his nose round his mouth, deeper as he grins or
 * snarls, his cheek full beside it; his chin dimpled and the fold under his lower lip as he presses his lips; short lines
 * across his nose as he snarls or shuts his eyes tight. None at rest: a man's face at rest is smooth.
 */
const CREASE_DEEP = { brow: 0.0013, frown: 0.0018, crow: 0.0012, lid: 0.0009, fold: 0.0028, chin: 0.0016, nose: 0.0008 } as const;
const CREASE_AGE = [0.7, 1.8] as const;
const CREASE_SHADE = '0.22';
/**
 * His sweat (see Fig.skin): how much smoother it makes his skin's shine at the most (a share of its roughness), and the
 * beads of it where it gathers (his forehead, his temples, his nose, over his lip): this far apart (ft, a couple of
 * millimetres), how high (a share of a bead's width), and how smooth a bead's shine is. His hair is darker wet, by this
 * much at the most.
 */
const WET_SHINE = 0.36;
const BEAD_CELL = 0.0065;
const BEAD_HIGH = 0.35;
const BEAD_ROUGH = 0.1;
const WET_HAIR = 0.28;
/** His brows' hairs close up (see stuffMaterial): how many along his brow and up it to a unit of the plane of his face, and how far a hair stands off his skin (ft). */
const BROW_HAIRS = ['420.0', '30.0', '0.0002'] as const;
/** And each hair: its half width (a share of the room each has), how long it is (a unit of the plane of his face, about), how far up or down the brow its middle may sit, and how much lighter than the picture's blur of them his skin is between them. */
const BROW_STRAND = ['0.17', '0.05', '0.035', '1.3'] as const;
/** A flush, at its reddest (what it does to his skin's colour), and how much less of it shows on the darkest skin (a share). */
const FLUSH_TO = 'vec3( 1.04, 0.84, 0.85 )';
const FLUSH_DARK = 0.55;

/** What the game does to his skin and his face's lines, in his material (see CREASE_DEEP, WET_SHINE): the workings. */
const WORN_PARS = /* glsl */ `
float valley( float d, float w ) { return exp( - d * d / ( w * w ) ); }
// (his face's lines at a place on the plane of his face: how high his skin stands there (ft), and how much of a hollow's shade)
vec2 creases( vec2 fp ) {
  float apx = abs( fp.x );
  float age = mix( ${CREASE_AGE[0].toFixed(2)}, ${CREASE_AGE[1].toFixed(2)}, uWorn.w );
  float h = 0.0;
  float dark = 0.0;
  float raise = uCrease.x * age;
  if ( raise > 0.0 && fp.y > 0.28 && apx < 0.66 ) {
    float arch = 0.035 * sin( clamp( ( apx - 0.05 ) / 0.5, 0.0, 1.0 ) * 3.14159 );
    float across = 1.0 - smoothstep( 0.4, 0.62, apx );
    for ( int i = 0; i < 4; i ++ ) {
      float fi = float( i );
      float on = smoothstep( 0.22, 0.55, noise3( vec3( apx * 7.0 + fi * 3.7, fi * 1.3, 0.5 ) ) ) * across;
      float v = valley( fp.y - 0.355 - 0.066 * fi - arch * ( 1.0 - 0.2 * fi ), 0.0095 ) * on;
      h -= ${CREASE_DEEP.brow} * raise * v;
      dark = max( dark, raise * v );
    }
  }
  float frown = uCrease.y * age;
  if ( frown > 0.0 && apx < 0.24 && fp.y > 0.06 && fp.y < 0.4 ) {
    float along = smoothstep( 0.11, 0.16, fp.y ) * ( 1.0 - smoothstep( 0.2, 0.3, fp.y ) );
    float v = valley( apx - 0.05 - 0.12 * ( fp.y - 0.14 ), 0.011 * ( 1.2 - along * 0.4 ) ) * along;
    float v2 = valley( fp.y - 0.15, 0.008 ) * ( 1.0 - smoothstep( 0.04, 0.09, apx ) ) * smoothstep( 0.4, 0.9, uCrease.y );
    h += frown * ( - ${CREASE_DEEP.frown} * v - 0.5 * ${CREASE_DEEP.frown} * v2 + 0.4 * ${CREASE_DEEP.frown} * valley( apx, 0.03 ) * along );
    dark = max( dark, frown * max( v, 0.6 * v2 ) );
  }
  float crow = max( uCrease.z, max( 0.8 * uMove2.y, uCrease.w ) ) * age;
  if ( crow > 0.0 && apx > 0.42 && apx < 0.78 && fp.y > -0.12 && fp.y < 0.26 ) {
    vec2 q = vec2( apx - 0.525, fp.y - 0.075 );
    float r = length( q );
    float a = atan( q.y, q.x );
    float v = 0.0;
    for ( int i = 0; i < 4; i ++ ) {
      float fi = float( i );
      v = max( v, valley( ( a + 0.65 - 0.42 * fi - 0.06 * sin( r * 40.0 + fi * 2.0 ) ) * r, 0.0068 ) * ( 0.6 + 0.4 * sin( fi * 2.3 + 1.0 ) ) );
    }
    v *= smoothstep( 0.025, 0.05, r ) * ( 1.0 - smoothstep( 0.1, 0.17, r ) );
    h -= ${CREASE_DEEP.crow} * crow * v;
    dark = max( dark, crow * v );
  }
  float bunch = max( uCrease.z, uMove2.y ) * age;
  if ( bunch > 0.0 && apx > 0.18 && apx < 0.62 && fp.y > -0.1 && fp.y < 0.06 ) {
    float t = clamp( abs( apx - 0.38 ) / 0.152, 0.0, 1.0 );
    float yl = 0.032 - 0.037 * pow( 1.0 - t * t, 0.8 ) - 0.006 * t;
    float along = 1.0 - smoothstep( 0.12, 0.2, abs( apx - 0.4 ) );
    float v = valley( fp.y - yl, 0.006 ) * along;
    h += bunch * ${CREASE_DEEP.lid} * ( 1.3 * valley( fp.y - yl - 0.016, 0.012 ) * along - v );
    dark = max( dark, 0.8 * bunch * v );
  }
  float grin = max( max( uMove.x, uMove.w ), 0.7 * uMove2.y ) * ( 0.75 + 0.25 * age );
  if ( grin > 0.0 && apx > 0.12 && apx < 0.62 && fp.y < -0.18 && fp.y > -0.82 ) {
    vec2 f = vec2( apx - 0.225, fp.y + 0.31 );
    vec2 dir = vec2( 0.4706, -0.8824 );
    float along = clamp( dot( f, dir ) / 0.4, 0.0, 1.0 );
    vec2 off = f - dir * along * 0.4;
    // (it bows out round the corner of his mouth on its way down)
    float d = dot( off, vec2( 0.8824, 0.4706 ) ) - 0.05 * along * along;
    float v = valley( d, 0.014 ) * smoothstep( 0.0, 0.08, along ) * ( 1.0 - smoothstep( 0.7, 1.0, along ) );
    float cheek = valley( d - 0.04, 0.03 ) * smoothstep( 0.0, 0.1, along ) * ( 1.0 - smoothstep( 0.6, 1.0, along ) );
    h += grin * ${CREASE_DEEP.fold} * ( 0.6 * cheek - v );
    dark = max( dark, grin * v );
  }
  float chin = max( uMove.z, 0.6 * uMove.y );
  if ( chin > 0.0 && apx < 0.32 && fp.y < -0.6 && fp.y > -1.0 ) {
    float ball = valley( apx, 0.15 ) * valley( fp.y + 0.84, 0.09 );
    float pits = noise3( vec3( fp * 70.0, 1.0 ) ) + 0.5 * noise3( vec3( fp * 150.0, 2.0 ) );
    float v = valley( fp.y + 0.69, 0.012 ) * ( 1.0 - smoothstep( 0.15, 0.25, apx ) );
    h += chin * ${CREASE_DEEP.chin} * ( ball * ( pits - 0.75 ) - v );
    dark = max( dark, chin * ( 0.6 * v + 0.45 * ball * smoothstep( 0.65, 0.3, pits ) ) );
  }
  float nose = max( uMove.w, uCrease.w );
  if ( nose > 0.0 && apx > 0.04 && apx < 0.22 && fp.y > -0.06 && fp.y < 0.24 ) {
    float v = 0.0;
    for ( int i = 0; i < 3; i ++ ) v = max( v, valley( fp.y - 0.03 - 0.05 * float( i ) - 0.7 * ( apx - 0.11 ), 0.006 ) );
    v *= smoothstep( 0.05, 0.08, apx ) * ( 1.0 - smoothstep( 0.15, 0.21, apx ) );
    h -= ${CREASE_DEEP.nose} * nose * v;
    dark = max( dark, 0.7 * nose * v );
  }
  return vec2( h, min( 1.0, dark ) );
}
// (the beads of his sweat about a place (in beads' widths): how high one stands there (in those widths), and how much of
// one it is; only so many of them as he is wet)
float beads( vec2 q, float wet, out float on ) {
  vec2 cell = floor( q );
  float h = 0.0;
  on = 0.0;
  for ( int j = -1; j <= 1; j ++ )
    for ( int i = -1; i <= 1; i ++ ) {
      vec2 c = cell + vec2( float( i ), float( j ) );
      vec3 r = vec3( grain3( vec3( c, 3.0 ) ), grain3( vec3( c, 7.0 ) ), grain3( vec3( c, 11.0 ) ) );
      if ( r.z > wet ) continue;
      float rad = 0.2 + 0.28 * fract( r.x * 7.3 + r.y * 3.1 );
      float d = length( q - c - 0.5 - ( r.xy - 0.5 ) * 0.6 ) / rad;
      if ( d < 1.0 ) {
        h = max( h, sqrt( 1.0 - d * d ) * rad );
        on = max( on, smoothstep( 1.0, 0.75, d ) );
      }
    }
  return h;
}`;

/** Where his head bone is as built (figure.py's HEAD_Y), ft: his face's shape is worked out round it. */
const HEAD_REST = 6.1;
/** His head's middle as built, and its half sizes (ft), as a shader has them. */
const HEAD_C = `vec3( 0.0, ${(HEAD_REST + HEAD_MID.y).toFixed(3)}, ${HEAD_MID.z.toFixed(3)} )`;
const HEAD_S = `vec3( ${HEAD_SIZE.map((v) => v.toFixed(3)).join(', ')} )`;
/**
 * His face's own shape, as a man's bones are his own: on the one head every man shares, how far (ft) a point of
 * his face stands out or in for him (his cheekbones high and full or flat, his cheeks round or hollow under the
 * bone, his chin forward or back, his jaw's corners square or tapering, his lips, his brow, his eyes set deep
 * or not, his nose's wings broad or narrow), placed by the plane of his face as figure.py's head_r places it.
 * Each is a share of uShape and uShape2 (0 the middling man): no two faces one head scaled.
 */
const FACE_SHAPE = /* glsl */ `${FACE_T}
uniform vec4 uShape;
uniform vec4 uShape2;
float faceG( vec2 p, vec2 c, vec2 s ) { vec2 q = ( p - c ) / s; return exp( - dot( q, q ) ); }
// (how much of his face's shape and moves a point takes: none of them where his head's skin gives way to his neck's,
// under his jaw and round the top of his neck (mhbody.py's own line): the two are one skin, and must not part there)
float faceOn( vec3 n ) {
  return max( smoothstep( -0.62, -0.5, n.y ), smoothstep( 1.0, 1.2, length( vec2( n.x * ${(HEAD_SIZE[0] / 0.225).toFixed(4)}, ( n.z * ${HEAD_SIZE[2].toFixed(4)} + 0.08 ) / 0.19 ) ) ) );
}
float faceShape( vec3 p ) {
  vec3 n = normalize( ( p - vec3( 0.0, ${(HEAD_REST + HEAD_MID.y).toFixed(3)}, ${HEAD_MID.z.toFixed(3)} ) ) / vec3( ${HEAD_SIZE.map((v) => v.toFixed(3)).join(', ')} ) );
  float ax = abs( n.x );
  // (the corner of his jaw, round under his ear)
  vec3 q = ( vec3( ax, n.y, n.z ) - vec3( 0.74, -0.64, -0.08 ) ) / vec3( 0.15, 0.14, 0.22 );
  float f = uShape.w * 0.05 * exp( - dot( q, q ) );
  float front = smoothstep( 0.1, 0.5, n.z );
  if ( front > 0.0 ) {
    vec2 fp = faceT( vec2( ax, n.y ) / max( n.z, 0.3 ) * 0.8 );
    float k = uShape.x * 0.034 * faceG( fp, vec2( 0.54, -0.14 ), vec2( 0.16, 0.1 ) );
    k += uShape.y * ( 0.036 * faceG( fp, vec2( 0.5, -0.43 ), vec2( 0.2, 0.17 ) ) + 0.01 * faceG( fp, vec2( 0.3, -0.62 ), vec2( 0.15, 0.15 ) ) );
    k += uShape.z * 0.042 * faceG( fp, vec2( 0.0, -0.84 ), vec2( 0.2, 0.12 ) );
    float lips = ( fp.y + 0.53 ) / 0.07;
    k += uShape2.x * 0.016 * pow( max( 0.0, 1.0 - fp.x * fp.x / 0.096 ), 0.7 ) * exp( - lips * lips );
    k += uShape2.y * 0.016 * faceG( fp, vec2( 0.36, 0.23 ), vec2( 0.26, 0.06 ) );
    k -= uShape2.z * 0.018 * faceG( fp, vec2( 0.37, 0.1 ), vec2( 0.17, 0.09 ) );
    k += uShape2.w * 0.022 * faceG( fp, vec2( 0.15, -0.3 ), vec2( 0.055, 0.045 ) );
    f += k * front;
  }
  return f * 0.36 * faceOn( n );
}`;

/** The line of his mouth on the plane of his face (figure.py's MOUTH_Y), and how far out from its middle his lips part (figure.py's SLIT): past that they meet, at its corners. */
const MOUTH_Y = -0.522;
const SLIT = 0.275;
/**
 * His face as it moves, on the one head (each a share of uMove and uMove2: see Fig.face): how far (ft, as built) a
 * point of his face goes for a smile (the corners of his mouth up, out and back round his teeth), his cheeks coming
 * up (forward and up under his eyes, bunching his lower lids), a grimace (the corners down and out), lips pressed
 * (each drawn in toward the line between them, and back), a snarl (his upper lip up off his teeth, his nose's wings
 * with it) and lips apart (the upper a little up, the lower further down). His lips part along the line the model
 * splits them on: a point is his upper lip's or his lower one's by which side of it it was built (`up`, worked out
 * once for the point: the two edges of the split are a hair apart), and nothing parts past the split's ends.
 * Then (uMove3) his lips rounded (drawn in from the corners and pushed forward, as for "oo" or to blow), his cheeks
 * blown out, his lips stretched wide and flat ("ee", or a man straining); and one side of his mouth taken further
 * than the other (a smirk, a sneer: uMove3.w, its sign the side, eased across the middle of his lips so the two
 * halves never part company there).
 */
const FACE_MOVE = /* glsl */ `
uniform vec4 uMove;
uniform vec4 uMove2;
uniform vec4 uMove3;
float lipUp( vec3 p ) {
  vec3 n = normalize( ( p - ${HEAD_C} ) / ${HEAD_S} );
  return smoothstep( -0.0006, 0.0006, faceT( n.xy / max( n.z, 0.3 ) * 0.8 ).y - ${MOUTH_Y.toFixed(3)} );
}
vec3 faceMove( vec3 p, float up ) {
  vec3 n = normalize( ( p - ${HEAD_C} ) / ${HEAD_S} );
  float front = smoothstep( 0.15, 0.5, n.z );
  if ( front <= 0.0 ) return vec3( 0.0 );
  vec2 fp = faceT( n.xy / max( n.z, 0.3 ) * 0.8 );
  float side = fp.x < 0.0 ? -1.0 : 1.0;
  float ax = abs( fp.x );
  float my = fp.y - ${MOUTH_Y.toFixed(3)};
  // (how far a point goes with the corners of his mouth: none of the way in its middle, most at the corners, less
  // and less past them and up and down from its line)
  float outward = smoothstep( 0.02, 0.3, ax ) * exp( - pow( max( ax - 0.29, 0.0 ) / 0.17, 2.0 ) ) * exp( - my * my / 0.02 );
  float corner = faceG( vec2( ax, my ), vec2( 0.29, 0.0 ), vec2( 0.12, 0.11 ) );
  float cheek = faceG( vec2( ax, fp.y ), vec2( 0.44, -0.2 ), vec2( 0.18, 0.15 ) );
  // (his lips about the line between them, and how much of them parts: none at the split's ends)
  float lips = exp( - my * my / 0.009 ) * smoothstep( 0.36, 0.22, ax );
  float slit = sqrt( max( 0.0, 1.0 - pow( ax / ${SLIT.toFixed(3)}, 2.0 ) ) ) * exp( - my * my / 0.012 );
  // (one side more, the other less: none of it in the very middle)
  float lop = clamp( 1.0 + uMove3.w * clamp( fp.x / 0.08, -1.0, 1.0 ), 0.0, 2.0 );
  vec3 d = uMove.x * lop * ( vec3( side * 0.02, 0.026, 0.0 ) * outward - vec3( 0.0, 0.0, 0.014 ) * corner );
  d += uMove2.y * lop * cheek * vec3( side * 0.002, 0.012, 0.008 );
  d += uMove.y * lop * ( vec3( side * 0.018, -0.026, 0.0 ) * outward - vec3( 0.0, 0.0, 0.004 ) * corner );
  d += uMove.z * ( lips * vec3( - side * 0.005 * smoothstep( 0.1, 0.3, ax ), -0.4 * my, -0.01 ) + faceG( vec2( ax, fp.y ), vec2( 0.0, -0.8 ), vec2( 0.2, 0.1 ) ) * vec3( 0.0, 0.006, 0.004 ) );
  d.y += uMove.w * lop * ( 0.02 * up * slit * exp( - pow( ( ax - 0.08 ) / 0.2, 2.0 ) ) + 0.006 * faceG( vec2( ax, fp.y ), vec2( 0.15, -0.3 ), vec2( 0.08, 0.07 ) ) );
  d.y += uMove2.x * slit * ( 0.006 * up - 0.013 * ( 1.0 - up ) );
  // (rounded: in from the corners toward the middle, and forward, the middle a little open)
  d += uMove3.x * ( lips * vec3( - side * 0.022 * smoothstep( 0.04, 0.3, ax ), 0.0, 0.02 ) + corner * vec3( - side * 0.014, 0.0, 0.006 ) );
  d.y += uMove3.x * slit * ( 0.004 * up - 0.006 * ( 1.0 - up ) );
  // (blown out: his cheeks forward and out between his cheekbones and his jaw, his lips a little forward on the air)
  d += uMove3.y * ( faceG( vec2( ax, fp.y ), vec2( 0.4, -0.46 ), vec2( 0.18, 0.17 ) ) * vec3( side * 0.03, -0.002, 0.022 ) + lips * vec3( 0.0, 0.0, 0.005 ) );
  // (stretched: the corners straight out and a little back, his lips drawn thin over his teeth)
  d += uMove3.z * ( vec3( side * 0.022, -0.003, 0.0 ) * outward - vec3( 0.0, 0.0, 0.008 ) * corner + lips * vec3( 0.0, -0.15 * my, -0.002 ) );
  return d * front * faceOn( n );
}`;

/** Where his head is on the sheet (in uv): there the stuff picture's third channel is how far his hair stands off him, not a knit. */
const HEAD_UV = [R_HEAD[0] / SHEET, 1 - (R_HEAD[1] + R_HEAD[3]) / SHEET, (R_HEAD[0] + R_HEAD[2]) / SHEET, 1 - R_HEAD[1] / SHEET].map((v) => v.toFixed(4));
const ON_HEAD = (uv: string) => `( ${uv}.x > ${HEAD_UV[0]} && ${uv}.y > ${HEAD_UV[1]} && ${uv}.y < ${HEAD_UV[3]} )`;
/**
 * Where his mouth's insides are on the sheet (in uv): from the dark of it across to his gums (R_MOUTH and R_TEETH, side by
 * side, each two halves: see sheetUv), under this; and a quarter of that across: which part a point is (the back of his
 * mouth, his tongue, his teeth, his gums).
 */
const INSIDES_UV = [R_MOUTH[0] / SHEET, (R_TEETH[0] + R_TEETH[2]) / SHEET, 1 - R_MOUTH[1] / SHEET, R_MOUTH[2] / 2 / SHEET].map((v) => v.toFixed(5));
/**
 * His mouth as built (figure.py's mouth): the line of it at its middle (ft up), how far forward his upper teeth's front
 * faces are there, and how high their edges are and his lower teeth's.
 */
const MOUTH_MID = 5.903;
const TEETH_FRONT = 0.369;
const TEETH_EDGES = [5.896, 5.9] as const;
/**
 * How far into his mouth the light gets (ft behind his front teeth: a share of it is left each time), with his lips
 * just apart and with his jaw wide open; and how much of it gets past lips just apart at all.
 */
const MOUTH_LIGHT = [0.03, 0.052] as const;
/**
 * His cheeks close round his back teeth: past this far out from the middle of his mouth (ft), each foot further out
 * counts as this many further in, so the teeth at the corners of a grin go into the dark beside them (no lone canine
 * standing lit at a corner, seen from the side) while his front ones take the light.
 */
const MOUTH_CORNER = [0.03, 2.5] as const;
const MOUTH_SHUT = 0.05;
/** His tongue's papillae, this many to the foot of him as built (a millimetre or so apart), and how deep (ft). */
const PAPILLAE = 300;
const PAPILLAE_DEEP = 0.00025;
/** Above his ears' strip on the sheet (in uv): his head's own picture. */
const INSIDE_V = (1 - (R_EAR[1] - 2) / SHEET).toFixed(4);
/**
 * How far forward (ft, as built) the top of his neck up inside his head is his mouth's dark: behind that, what is
 * seen of it past the corner of his jaw is his neck, lit as his skin is, not a black hole under his ear.
 */
const INSIDE_FRONT = '0.18';
/** The dark inside his mouth, as the material draws the inside of his head (linear). */
const MOUTH_DARK = 'vec3( 0.022, 0.006, 0.005 )';

/** What a man's material takes of his skin's anatomy: the maps every man shares (see Maps), and how much of each he shows (uAnatK: his muscle and tendon, his veins, the shade in his hollows). */
interface Relief {
  maps: Maps;
  k: { value: Vector3 };
}
/** Where his skin's anatomy has been put on his normal, in both his materials: what the full one does to his normal after it goes on from here. */
export const RELIEF_MARK = '// <figure-relief>';
/**
 * His skin's anatomy on his normal (see Maps): the map's slopes, a texel's step at a time, taken onto the screen by how
 * his skin's uv runs across it there, and his normal turned by them as by any height in feet (the knit's bump: no
 * tangents wanted, and right however his bones stretch him). His veins stand out more as he flushes (uWorn.y). On his
 * skin only: not his eyes, nor in his mouth. (The steps are taken before anything is asked, as a screen's steps must be.)
 */
const ANAT_RELIEF = /* glsl */ `vec2 anatDx = dFdx( vAnatUv ) * ANAT_SIZE;
        vec2 anatDy = dFdy( vAnatUv ) * ANAT_SIZE;
        vec2 anatG = anatS.xy * uAnatScale.x * uAnatK.x + anatS.zw * uAnatScale.y * uAnatK.y * ( 1.0 + 0.4 * uWorn.y );
        float anatM = skinK * ( 1.0 - eyeWet ) * step( mouthPart, -0.5 );
        normal = knitNormal( normal, vec2( dot( anatG, anatDx ), dot( anatG, anatDy ) ) * anatM, faceDirection );`;

/**
 * His fine grain (see Detail): how much of each picture's height he shows (his skin's, a knit's, a rib's: a share of
 * detail.ts's own, his kit's also by how much of a knit its stuff says shows); how much of the shade down in his skin's
 * furrows and pores goes on its colour, and of the dark in a knit's holes (a share, at the most); and how much the grain
 * too fine for the pixels roughs up the shine on it (its slope squared, on the roughness to the fourth: Toksvig's).
 */
const GRAIN_DEEP = [1, 2.5, 2.5] as const;
const GRAIN_SHADE = ['0.12', '0.25'] as const;
const TOKSVIG = '1.0';
/** A sock's knit (see STUFF): a rib's, and the rest of what is on the strips down his limbs a plain knit's. */
const SOCK_KNIT = STUFF.sock[2].toFixed(2);
/** Where on the sheet each of his kit's pictures is (uv): see sheetUv. */
const ON_RECT = (uv: string, [x, y, w, h]: Rect) =>
  `( ${uv}.x > ${(x / SHEET).toFixed(5)} && ${uv}.x < ${((x + w) / SHEET).toFixed(5)} && ${uv}.y > ${(1 - (y + h) / SHEET).toFixed(5)} && ${uv}.y < ${(1 - y / SHEET).toFixed(5)} )`;
const ON_LIMB = (uv: string) => ON_RECT(uv, [R_LIMB[0][0], R_LIMB[0][1], R_LIMB[0][2], R_LIMB[3][1] + R_LIMB[3][3] - R_LIMB[0][1]]);
/** An arm's strip is above this on the sheet (uv), a leg's below it. */
const ARM_V = (1 - (R_LIMB[1][1] + R_LIMB[1][3]) / SHEET).toFixed(5);
const glf = (v: number) => v.toFixed(6);
/** Each of detail.ts's pictures: how big a repeat of it is on him (ft), its steepest slope, and its grain's size (ft). */
const GRAIN_FT = TILE_MM.map((mm) => glf(mm / 304.8));
const GRAIN_STEEP = STEEP.map((v) => glf(v));
const GRAIN_SEEN = GRAIN_MM.map((mm) => glf(mm / 304.8));
const GRAIN_PARS = /* glsl */ `
uniform sampler2DArray uDetail;
uniform vec4 uCloth[ 2 ];
uniform vec4 uTube[ 8 ];
uniform vec3 uGrainSq;
varying vec3 vRestN;
// (one of his fine grain's pictures (see Detail) at p, in its own repeats, dx and dy the screen's steps in them, read
// as finely as a pixel's own steps gx and gy say; ft how big a repeat is on him, steep its steepest slope, k how much of
// its height he shows, fine how much of it the pixels still show. Its height's steps across the screen and up it go onto
// d (ft a pixel), what of its slope is too fine to be drawn onto sq (squared), and it says how much shade there is down
// in it there (1 none))
float grainAt( float layer, vec2 p, vec2 gx, vec2 gy, vec2 dx, vec2 dy, float ft, float steep, float k, float fine, inout vec2 d, inout float sq ) {
  vec4 t = textureGrad( uDetail, vec3( p, layer ), gx, gy );
  vec2 s = ( t.xy * 255.0 - 128.0 ) / 127.0 * ( steep * k );
  d += fine * ft * vec2( dot( s, dx ), dot( s, dy ) );
  sq += max( 0.0, 2.0 * t.w * steep * steep * k * k - fine * fine * dot( s, s ) );
  return t.z;
}`;
/**
 * His skin's grain close up (detail.ts: little plateaus between furrows, a pore in some, and the hills a few millimetres
 * across they lie on, which are what break a lamp's shine on a shoulder up), laid on him as built three ways at once,
 * each as much as his skin faces that way, so it goes with him and never swims; not on his eyes, nor in his mouth. Gone
 * where it is too fine for the pixels, and its slope roughs his shine up instead (all of it, far off: see TOKSVIG).
 */
const GRAIN_SKIN = /* glsl */ `float skinG = skinK * ( 1.0 - eyeWet ) * step( mouthPart, -0.5 );
          if ( skinG > 0.0 ) {
            float fine = 1.0 - smoothstep( 0.25, 0.6, restPx / ${GRAIN_SEEN[0]} );
            float k = ${glf(GRAIN_DEEP[0])} * skinG;
            vec3 w = pow( abs( normalize( vRestN ) ), vec3( 4.0 ) );
            w /= w.x + w.y + w.z;
            if ( fine > 0.0 ) {
              vec3 p = vRest / ${GRAIN_FT[0]};
              vec3 px = restDx / ${GRAIN_FT[0]};
              vec3 py = restDy / ${GRAIN_FT[0]};
              float shade = 1.0;
              // (across him, up him, and front to back; each picture a little way along from the others, so no two are one)
              if ( w.x > 0.01 ) shade *= mix( 1.0, grainAt( 0.0, p.zy + vec2( 0.31, 0.57 ), px.zy, py.zy, px.zy, py.zy, ${GRAIN_FT[0]}, ${GRAIN_STEEP[0]}, k * w.x, fine, grainD, grainSq ), w.x );
              if ( w.y > 0.01 ) shade *= mix( 1.0, grainAt( 0.0, p.xz + vec2( 0.13, 0.71 ), px.xz, py.xz, px.xz, py.xz, ${GRAIN_FT[0]}, ${GRAIN_STEEP[0]}, k * w.y, fine, grainD, grainSq ), w.y );
              if ( w.z > 0.01 ) shade *= mix( 1.0, grainAt( 0.0, p.xy, px.xy, py.xy, px.xy, py.xy, ${GRAIN_FT[0]}, ${GRAIN_STEEP[0]}, k * w.z, fine, grainD, grainSq ), w.z );
              diffuseColor.rgb *= mix( 1.0, shade, ${GRAIN_SHADE[0]} * skinG * fine );
            } else grainSq += k * k * dot( w, w ) * ${GRAIN_STEEP[0]} * ${GRAIN_STEEP[0]} * uGrainSq.x;
          }
          `;
/**
 * His kit's knit close up (detail.ts: a jersey's V's, a rib's columns), as big on him as it is: across and up its own
 * picture where that is flat, as big as the picture is on him (see sheetUv); round and along the tube it is part of on
 * his trim (a rib) and on the strips down his limbs (a sock a rib too). As deep as its stuff says its knit shows; gone
 * where it is too fine for the pixels, as his skin's is.
 */
const GRAIN_CLOTH = /* glsl */ `if ( stuff.b > 0.02 && ! ${ON_HEAD('vMapUv')} ) {
          vec2 feet = ${ON_VEST('vMapUv')} ? uCloth[ 0 ].xy : ${ON_SHORTS('vMapUv')} ? uCloth[ 0 ].zw : ${ON_RECT('vMapUv', R_SHOE)} ? uCloth[ 1 ].xy : ${ON_RECT('vMapUv', R_COLLAR)} ? uCloth[ 1 ].zw : vec2( 0.0 );
          vec2 cp = vMapUv * feet;
          vec2 cdx = mapDx * feet;
          vec2 cdy = mapDy * feet;
          float layer = 1.0;
          bool trim = ${ON_RECT('vMapUv', R_TRIM)};
          if ( feet.x == 0.0 && ( trim || ${ON_LIMB('vMapUv')} ) ) {
            // (which tube: on his trim his trunk's (his waistband's, his collar's or his armholes'), or a leg's below his
            // shorts' waistband; on a strip an arm's or a leg's. His right side's is his left's, across)
            int t = trim ? ( vRest.y > uTube[ 1 ].w ? 0 : 4 ) : vMapUv.y > ${ARM_V} ? 2 : 4;
            vec4 at = t == 0 ? uTube[ 0 ] : t == 2 ? uTube[ 2 ] : uTube[ 4 ];
            vec4 run = t == 0 ? uTube[ 1 ] : t == 2 ? uTube[ 3 ] : uTube[ 5 ];
            vec4 band = vRest.y < uTube[ 7 ].w ? uTube[ 7 ] : abs( vRest.x ) < uTube[ 6 ].w ? uTube[ 6 ] : vec4( 0.0 );
            if ( t == 0 && band.z > 0.0 ) at = vec4( band.x, at.y, band.y, band.z );
            float side = t > 0 && vRest.x < 0.0 ? -1.0 : 1.0;
            vec3 along = vec3( run.x * side, run.y, run.z );
            vec3 fore = normalize( vec3( 0.0, 0.0, 1.0 ) - along * along.z );
            vec3 out1 = cross( along, fore );
            vec3 q = vRest - vec3( at.x * side, at.y, at.z );
            vec2 r = vec2( dot( q, out1 ), dot( q, fore ) );
            float rr = max( dot( r, r ), 1e-6 );
            // (round it, ft: at its middle way out, so its ribs run straight along it as a sock's do, and stand straight up a
            // band of his trim all the way round (a rib a little further apart where the band is further out than most of
            // it); and along it. The steps round it worked out from his own, so there is no jump in them where the angle
            // comes back round, at its back)
            vec2 rx = vec2( dot( restDx, out1 ), dot( restDx, fore ) );
            vec2 ry = vec2( dot( restDy, out1 ), dot( restDy, fore ) );
            cp = vec2( atan( r.x, r.y ) * at.w, dot( q, along ) );
            cdx = vec2( ( r.y * rx.x - r.x * rx.y ) / rr * at.w, dot( restDx, along ) );
            cdy = vec2( ( r.y * ry.x - r.x * ry.y ) / rr * at.w, dot( restDy, along ) );
            layer = trim || abs( stuff.b - ${SOCK_KNIT} ) < 0.05 ? 2.0 : 1.0;
          }
          // (how fine it is read, and how much of it shows: by how far a pixel goes over him, his picture's own steps only
          // where it is stretched well past that. Each of its triangles stretches it its own way, and by those alone the knit
          // is a triangle sharper here and blurrier there)
          float cPx = max( length( cdx ), length( cdy ) );
          float seen = max( max( length( restDx ), length( restDy ) ) * 1.15, cPx );
          if ( cPx > 0.0 ) {
            bool rib = layer > 1.5;
            float ft = rib ? ${GRAIN_FT[2]} : ${GRAIN_FT[1]};
            float steep = rib ? ${GRAIN_STEEP[2]} : ${GRAIN_STEEP[1]};
            float k = ( rib ? ${glf(GRAIN_DEEP[2])} : ${glf(GRAIN_DEEP[1])} ) * stuff.b;
            float fine = 1.0 - smoothstep( 0.25, 0.6, seen / ( rib ? ${GRAIN_SEEN[2]} : ${GRAIN_SEEN[1]} ) );
            if ( fine > 0.0 ) {
              float shade = grainAt( layer, cp / ft, vec2( seen / ft, 0.0 ), vec2( 0.0, seen / ft ), cdx / ft, cdy / ft, ft, steep, k, fine, grainD, grainSq );
              // (and the dark down in its holes and between its columns: a mesh jersey's, a sock's)
              diffuseColor.rgb *= 1.0 - ${GRAIN_SHADE[1]} * stuff.b * fine * ( 1.0 - shade );
            } else grainSq += k * k * steep * steep * ( rib ? uGrainSq.z : uGrainSq.y );
          }
        }
        `;

/**
 * His kit's seams close up (see kitSeams, Detail): the slopes of the picture of them, read where his vest's or his
 * shorts' picture is, taken onto the screen by how the sheet runs across it there (as his skin's anatomy is: see
 * ANAT_RELIEF); and the edge of what is pressed on his kit (his number, his name, the team's letters), read off his own
 * stuff picture, where it is print (its second channel far under the cloth's), half a texel of it either side. Gone once
 * a texel of the sheet is under half a pixel (the print's edge, once one of his stuff picture's is), as a seam a
 * millimetre or two across then is: from the broadcast's camera he is far too far off for a stitch to be seen, and one
 * drawn there would only sparkle. The steps are taken before anything is asked.
 */
const SEAM_PARS = /* glsl */ `
uniform sampler2D uSeams;
// (how far what is pressed on his kit stands up off it at uv, a share of PRINT_MM: all of it on print, none on the knit)
float printAt( vec2 uv, vec2 gx, vec2 gy ) {
  return 1.0 - smoothstep( 0.12, 0.3, textureGrad( uStuff, uv, gx, gy ).g );
}`;
const SEAM_RELIEF = /* glsl */ `{
            vec2 tx = vec2( mapDx.x, - mapDx.y ) * ${SHEET.toFixed(1)};
            vec2 ty = vec2( mapDy.x, - mapDy.y ) * ${SHEET.toFixed(1)};
            float tpp = max( length( tx ), length( ty ) );
            float near = 1.0 - smoothstep( 0.8, 2.0, tpp );
            if ( near > 0.0 ) {
              vec2 st = vec2( vMapUv.x, ( 1.0 - vMapUv.y ) * ${(SHEET / SEAM_H).toFixed(6)} );
              vec2 sk = vec2( 1.0, ${(SHEET / SEAM_H).toFixed(6)} ) / ${SHEET.toFixed(1)};
              vec2 sg = ( textureGrad( uSeams, st, tx * sk, ty * sk ).xy * 255.0 - 128.0 ) / 127.0 * ${glf((SEAM_STEEP * SEAM_SHOWN) / 304.8)};
              grainD += near * vec2( dot( sg, tx ), dot( sg, ty ) );
            }
            float nearP = 1.0 - smoothstep( 0.8, 2.0, tpp / ${STUFF_K.toFixed(1)} );
            if ( nearP > 0.0 ) {
              vec2 du = vec2( ${(0.5 / (SHEET / STUFF_K)).toFixed(6)}, 0.0 );
              vec2 pg = vec2( printAt( vMapUv + du, mapDx, mapDy ) - printAt( vMapUv - du, mapDx, mapDy ), printAt( vMapUv + du.yx, mapDx, mapDy ) - printAt( vMapUv - du.yx, mapDx, mapDy ) ) * ${glf(PRINT_MM / 304.8 / (2 * (0.5 / (SHEET / STUFF_K))))};
              grainD += nearP * vec2( dot( pg, mapDx ), dot( pg, mapDy ) );
            }
          }`;

/** His left shoulder's joint as built (figure.py's SHOULDER and SH_Y: across, up; ft), his arm hung out ARM_OUT from it. */
const SHOULDER_AT = [0.84, 5.16] as const;
/**
 * How rough his skin is off his head: his own, worked out from where the point is on him as built, never his sheet's.
 * The sheet's pictures of his skin (his trunk's, each arm's strip) meet along his triangles' edges, and where two of
 * them said different things a lamp's shine on his shoulder took the edge of every triangle in it: a pane of glass laid
 * on him. His skin's (STUFF), smoother with sweat over each shoulder (from the top of it to half way down his upper arm,
 * fading out toward his neck and down his arm), a little rougher on his hand from over his wrist; the same either side.
 * (On his head his picture's own is kept: his lips, his eyes, his crown, each painted as it is.)
 */
const SKIN_ROUGH = /* glsl */ `float skinR = ${STUFF.skin[0].toFixed(2)};
        if ( skinK > 0.0 ) {
          float side = vRest.x < 0.0 ? -1.0 : 1.0;
          vec3 armQ = vRest - vec3( side * ${SHOULDER_AT[0].toFixed(2)}, ${SHOULDER_AT[1].toFixed(2)}, 0.0 );
          vec3 armDown = vec3( side * ${Math.sin(ARM_OUT).toFixed(4)}, ${(-Math.cos(ARM_OUT)).toFixed(4)}, 0.0 );
          float armAlong = dot( armQ, armDown );
          float onArm = 1.0 - smoothstep( 0.35, 0.55, length( armQ - armDown * armAlong ) );
          skinR = mix( skinR, ${STUFF.sweat[0].toFixed(2)}, onArm * smoothstep( -0.6, -0.25, armAlong ) * ( 1.0 - smoothstep( 0.4, 0.75, armAlong ) ) );
          skinR = mix( skinR, ${STUFF.hand[0].toFixed(2)}, onArm * smoothstep( ${HAND_FROM[0].toFixed(2)}, ${HAND_FROM[1].toFixed(2)}, armAlong ) );
        }
        float stuffR = ${ON_HEAD('vMapUv')} ? stuff.r : mix( stuff.r, skinR, skinK );`;

/**
 * His material, from his sheet and its stuff picture. `plain` (a device that can't keep up) is a
 * standard material with the same picture, roughness and hair, but none of a cloth's sheen or knit.
 * `relief`: his skin's anatomy (see Relief), in both of those but not his hair's fuzz. `detail`: his skin's grain and
 * his kit's knit close up (see Detail), in the full one only: a phone's men are seldom near enough for it, and its
 * plain material costs what it did.
 */
export function stuffMaterial(
  map: CanvasTexture,
  stuff: CanvasTexture,
  told: Told,
  plain = false,
  // (his hair's fuzz; 'coils': a head of curls's, its coils drawn too (see COILED); the rest of the men's go without that weight)
  fuzz: boolean | 'coils' = false,
  relief: Relief | null = null,
  detail: Detail | null = null,
): MeshStandardMaterial {
  const anat = fuzz ? null : relief;
  const coils = fuzz === 'coils';
  const micro = plain || fuzz ? null : detail;
  const seams = micro?.seams ?? null;
  const m = plain
    ? new MeshStandardMaterial({ map, vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0 })
    : new MeshPhysicalMaterial({ map, vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uStuff = { value: stuff };
    Object.assign(sh.uniforms, told);
    if (anat) Object.assign(sh.uniforms, { uAnat: { value: anat.maps.anat }, uCav: { value: anat.maps.cav }, uAnatScale: { value: anat.maps.scale }, uAnatK: anat.k });
    if (micro) Object.assign(sh.uniforms, { uDetail: { value: micro.tiles() }, uCloth: { value: micro.cloth }, uTube: { value: micro.tubes }, uGrainSq: { value: micro.sq } });
    if (seams) sh.uniforms.uSeams = { value: seams() };
    // his hair stands off his head by as much as his crop says (pushed out as built, before his bones carry it)
    // (and where each point of him is as built, and the way it faces, for his skin's grain: see Detail)
    // (and his face is his own shape: the point moved out or in, and the way it faces turned with the slope of that)
    // (and where each point of his skin is on its map, MakeHuman's own uv: see Maps)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform sampler2D uStuff;\nattribute vec3 aShape;\nvarying vec3 vRest;${micro ? '\nvarying vec3 vRestN;' : ''}\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec2 vTwist;${anat ? '\nvarying vec2 vAnatUv;' : ''}\n${FACE_SHAPE}\n${FACE_MOVE}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `#include <beginnormal_vertex>
        vec3 faceOff = vec3( 0.0 );
        if ( ${ON_HEAD('uv')} && position.y > ${(HEAD_REST - 0.45).toFixed(2)} ) {
          float f0 = faceShape( position );
          vec3 t1 = normalize( cross( objectNormal, abs( objectNormal.y ) < 0.95 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
          vec3 t2 = cross( objectNormal, t1 );
          float g1 = ( faceShape( position + t1 * 0.012 ) - f0 ) / 0.012;
          float g2 = ( faceShape( position + t2 * 0.012 ) - f0 ) / 0.012;
          faceOff = objectNormal * f0;
          vec3 turned = objectNormal - t1 * g1 - t2 * g2;
          // (and as it moves, when it does: the point carried, and the way it faces worked out again from the moved
          // surface's two ways along it there)
          if ( dot( uMove, uMove ) + dot( uMove2, uMove2 ) + dot( uMove3, uMove3 ) > 0.0 ) {
            float up = lipUp( position );
            vec3 m0 = faceMove( position, up );
            vec3 m1 = faceMove( position + t1 * 0.004, up ) - m0;
            vec3 m2 = faceMove( position + t2 * 0.004, up ) - m0;
            faceOff += m0;
            turned = cross( ( t1 + objectNormal * g1 ) * 0.004 + m1, ( t2 + objectNormal * g2 ) * 0.004 + m2 );
          }
          objectNormal = normalize( turned );
        }${micro ? '\n        vRestN = objectNormal;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvRest = position;\nvTwist = uv1;${anat ? '\nvAnatUv = uv1;' : ''}\ntransformed += faceOff + aShape;\n${VEST_HANG}\nif ${ON_HEAD('uv')} transformed += normal * textureLod( uStuff, uv, 0.0 ).b * ${HAIR_MAX.toFixed(3)};`,
      );
    // (his hair's fuzz: each layer its share of the way out past his hair, which goes further on hair left long)
    if (fuzz)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float fuzz;\nattribute float stand;\nvarying float vFuzz;\nvarying vec3 vFuzzN;')
        .replace(
          'vRest = position;',
          `vRest = position;\nvFuzz = fuzz;\nvFuzzN = normal;\nfloat fuzzLen = ${FUZZ_OUT[0].toFixed(4)} + ${(FUZZ_OUT[1] * HAIR_MAX).toFixed(4)} * textureLod( uStuff, uv, 0.0 ).b;\nvec3 fuzzLie = position.y < ${(HEAD_REST + HEAD_MID.y - 0.06).toFixed(3)} ? vec3( 0.0, -1.0, 0.15 ) : normalize( vec3( 0.0, normal.z * 1.2 - 0.5, -1.0 ) );\nfuzzLie -= normal * dot( fuzzLie, normal );\nfuzzLen *= 0.35 + 0.65 * ( 1.0 - smoothstep( 0.2, 0.45, textureLod( uStuff, uv, 0.0 ).g ) );\n// (a beard under his jaw, where his skin faces down, lies close: long there, its strands hang under his chin as a fringe)\nif ( position.y < ${(HEAD_REST + HEAD_MID.y - 0.06).toFixed(3)} ) fuzzLen *= 0.35 + 0.65 * smoothstep( -0.95, -0.5, normal.y );\nif ${ON_PIECE('uv')} { fuzzLen = ${COIL_OUT.toFixed(3)} * smoothstep( ${COIL_EDGE[0]}, ${COIL_EDGE[1]}, stand ); fuzzLie = vec3( 0.0 ); }\nelse if ( textureLod( uStuff, uv, 0.0 ).r > 0.91 ) fuzzLie = vec3( 0.0 );\ntransformed += normal * fuzz * fuzzLen + fuzzLie * fuzz * fuzz * fuzzLen * ${FUZZ_LIE.toFixed(2)};`,
        );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${STUFF_PARS}\n${FACE_T}\nuniform float uTone;\nuniform vec3 uSkin;\nuniform vec3 uHair;\nuniform vec3 uBrow;\nvarying vec2 vTwist;\nuniform float uBlink;\nuniform vec3 uIris;\nuniform vec2 uEye;\nuniform vec3 uGaze;\nuniform vec2 uLid;\nuniform float uMouth;\nuniform mat3 uHead;\nuniform vec4 uWorn;\nuniform vec4 uCrease;\nuniform vec4 uMove;\nuniform vec4 uMove2;\nvarying vec3 vRest;${fuzz ? '\nvarying float vFuzz;\nvarying vec3 vFuzzN;' : ''}${micro ? GRAIN_PARS : ''}${seams ? SEAM_PARS : ''}${anat ? `\nuniform sampler2D uAnat;\nuniform sampler2D uCav;\nuniform vec2 uAnatScale;\nuniform vec3 uAnatK;\nvarying vec2 vAnatUv;\n#define ANAT_SIZE ${anat.maps.size.toFixed(1)}` : ''}\n${WORN_PARS}`,
      )
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${SKIN_WRAP}`)
      // (skin's hollows are warm, not grey: the shade baked into him takes less of its red than of its blue)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `${anat ? '// (his anatomy: its slopes, and the shade in its hollows; see Maps)\n        vec4 anatS = ( texture2D( uAnat, vAnatUv ) * 255.0 - 128.0 ) / 127.0;\n        float anatC = texture2D( uCav, vAnatUv ).r;\n        ' : ''}vec4 stuff = texture2D( uStuff, vMapUv );
        // (how much of his skin a point is: on his head it goes from skin to hair over his hairline and his beard's
        // edge as the picture does, so nothing his skin has stops in a step there)
        float skinK = ${ON_HEAD('vMapUv')} ? smoothstep( 0.35, 0.97, stuff.g ) : smoothstep( 0.92, 0.98, stuff.g );
        skinWrap = skinK;
        // (and no skin is one colour: broad mottling, a finer unevenness, and here and there a redder patch, as a
        // living skin has and a wax one never does)
        if ( skinK > 0.0 ) {
          float mot = noise3( vRest * 9.0 ) - 0.5;
          float grain = noise3( vRest * 55.0 + 7.3 ) - 0.5;
          float blot = smoothstep( 0.6, 0.82, noise3( vRest * 23.0 + 3.1 ) );
          diffuseColor.rgb *= 1.0 + skinK * ( 0.12 * mot + 0.07 * grain );
          diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.03, 0.9, 0.88 ), skinK * ( 0.5 * max( 0.0, mot ) + 0.22 * blot ) );
        }
        ${
          fuzz
            ? /* glsl */ `// (his hair's fuzz: a strand where one stands, each a run of hairs laid back over his head, fewer in each layer
        // out; none on his skin, his headband or his beard's ground, and none at all once a strand is finer than a pixel)
        float hairK = smoothstep( 0.06, 0.09, stuff.g ) * ( 1.0 - smoothstep( 0.2, 0.28, stuff.g ) );
        vec3 sp = vRest * ${STRANDS.toFixed(1)};
        vec3 restStep = fwidth( vRest );
        float sharp = 1.0 - smoothstep( 0.35, 0.8, length( restStep * ${STRANDS.toFixed(1)} ) );
        float coilLit = 1.0;
        float strand = 0.65 * noise3( vec3( sp.x, sp.y * 0.6, sp.z * 0.3 ) ) + 0.35 * noise3( sp * 2.7 + 5.0 );
        // (a strand is thick at its root and a point at its end: fewer and finer in each layer out)
        // (further off, where a strand is finer than the picture's dots, the layers go from the outside in: no stray
        // specks of the last of them left over his forehead)
        ${
          coils
            ? /* glsl */ `// (his scalp under a head of curls is curls too (its stuff says so: see STUFF.curl), coils as short as his hair is)
        vec3 toHairC = uHair - uSkin;
        float coverC = clamp( dot( diffuseColor.rgb - uSkin, toHairC ) / max( 0.004, dot( toHairC, toHairC ) ), 0.0, 1.0 );
        bool scalpCurls = ${ON_HEAD('vMapUv')} && stuff.r > 0.91;
        if ( ${ON_PIECE('vMapUv')} || scalpCurls ) {
          if ( scalpCurls && coverC < 0.55 ) discard;
          // (on a head of curls: coils, each its own, round, standing off the mass of them and winding round as it goes
          // out (a spring, not a cone or a fern: the same place in each layer would stack up into a feather); each of
          // its own length, a little thinner toward its end, lit round its middle and dark down among the rest)
          vec3 cp = vRest * ${COIL_ACROSS.toFixed(1)};
          sharp = 1.0 - smoothstep( 0.25, 0.7, length( restStep * ${COIL_ACROSS.toFixed(1)} ) );
          // (a layer too fine for the pixels is gone before its coils are looked for)
          if ( vFuzz > sharp * 1.15 ) discard;
          vec3 cn = normalize( vFuzzN );
          vec3 ct = normalize( cross( cn, abs( cn.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
          vec3 cb = cross( cn, ct );
          vec3 cell = floor( cp - 0.5 );
          float best = 9.0;
          float own = 0.0;
          for ( int k = 0; k < 8; k++ ) {
            vec3 c = cell + vec3( float( k & 1 ), float( ( k >> 1 ) & 1 ), float( ( k >> 2 ) & 1 ) );
            float h1 = grain3( c );
            float h2 = fract( h1 * 37.17 );
            float len = ${COIL_SHAPE[0]} + ${COIL_SHAPE[1]} * h2;
            if ( vFuzz > len ) continue;
            float ph = 6.2831853 * ( h1 + vFuzz * ${COIL_SHAPE[2]} );
            vec3 d = cp - ( c + 0.5 + 0.35 * ( vec3( h1, h2, fract( h1 * 91.3 ) ) - 0.5 ) ) - ( ct * cos( ph ) + cb * sin( ph ) ) * ${COIL_SHAPE[3]};
            d -= cn * dot( d, cn );
            float r = ${COIL_SHAPE[4]} * ( 1.0 - 0.45 * smoothstep( len - 0.35, len, vFuzz ) );
            float at = length( d ) / r;
            if ( at < best ) {
              best = at;
              own = h1;
            }
          }
          strand = 1.0 - min( best, 1.0 );
          hairK = 1.0;
          // (a coil is his hair's colour, not the picture's stretched tufts, see the shape of curls below)
          diffuseColor.rgb = uHair * vColor.g * ( 0.85 + 0.3 * noise3( vRest * 37.0 + 2.0 ) );
          if ( vFuzz > sharp * 1.15 || best > 1.0 ) discard;
          coilLit = ( 0.72 + 0.4 * sqrt( strand ) ) * ( 0.85 + 0.3 * own );
        } else {`
            : /* glsl */ `bool scalpCurls = false;
        {`
        }
          // (and fewer of them as his head's picture thins to his skin along his hairline, none where it is skin: a line of
          // them stopped all at once is a cut-out's edge. A strand there is his hair's colour, not the picture's mix of
          // hair and skin, which would be a pale spike over his forehead)
          vec3 toHair = uHair - uSkin;
          float cover = clamp( dot( diffuseColor.rgb - uSkin, toHair ) / max( 0.004, dot( toHair, toHair ) ), 0.0, 1.0 );
          // (on his scalp: his beard's hairs are his brows' colour, not his head's, and keep to where it is all beard)
          bool scalp = vRest.y > ${(HEAD_REST + HEAD_MID.y - 0.06).toFixed(3)};
          hairK *= scalp ? smoothstep( 0.4, 0.95, cover ) : smoothstep( 0.82, 0.96, cover );
          if ( vFuzz > sharp * 1.15 || strand * hairK < 0.3 + 0.42 * vFuzz ) discard;
          if ( scalp ) diffuseColor.rgb = mix( diffuseColor.rgb, uHair * diffuseColor.rgb / max( vec3( 0.004 ), mix( uSkin, uHair, cover ) ), 1.0 - cover );
          // (a beard's strands are his beard's colour (his brows'), not what the picture is round its edge from a low angle,
          // where the picture's coarse copies take in his kit's colours beside his head's)
          else diffuseColor.rgb = uBrow * ( 0.8 + 0.4 * strand );
        }
        // (down among them it is dark, where the others shade them; their ends are in the light)
        diffuseColor.rgb *= ${ON_PIECE('vMapUv')} || scalpCurls ? mix( 0.6, 1.1, vFuzz ) * coilLit : mix( 0.78, 1.08, vFuzz ) * ( 0.85 + 0.3 * strand );`
            : /* glsl */ `// (and down among the strands, his hair is darker: its roots, in their shade)
        if ( ${ON_HEAD('vMapUv')} ) diffuseColor.rgb *= 1.0 - 0.18 * ( 1.0 - smoothstep( 0.2, 0.28, stuff.g ) ) * ( 1.0 - skinK );`
        }
        // (hair that is a shape of its own is a mass of curls, not a block: lumps of them, a grain over the lumps, the
        // dark down between them)
        float pieceH = 0.0;
        vec3 restW = fwidth( vRest );
        if ${ON_PIECE('vMapUv')} {
          if ( vMapUv.x < ${((R_HAIR[0] + R_HAIR[2] / 4) / SHEET).toFixed(4)} ) {
            // (a twist: its two strands wound round each other, each a round bulge between grooves that wind down it,
            // the hairs in each laid along it; his hair's colour, darker in the grooves and at its root)
            float along = ( vMapUv.x * ${SHEET.toFixed(1)} - ${(R_HAIR[0] + 0.02 * R_HAIR[2]).toFixed(2)} ) / ${(0.22 * R_HAIR[2]).toFixed(2)};
            // (each twist's own number, in how far up its quarter of the picture it is: its strands wound a little
            // tighter or looser than the next one's, from their own place round it, wavering a little down it)
            float ownT = ( 1.0 - ( ( 1.0 - vMapUv.y ) * ${SHEET.toFixed(1)} - ${R_HAIR[1].toFixed(1)} ) / ${R_HAIR[3].toFixed(1)} - 0.1 ) / 0.8;
            float turn = atan( vTwist.y, vTwist.x );
            float wind = 2.0 * turn - 6.2831853 * ${TWIST[0]} * ( 0.8 + 0.4 * ownT ) * along + 6.2831853 * ownT + 0.5 * sin( along * 9.0 + ownT * 40.0 );
            float bulge = 0.5 + 0.5 * cos( wind );
            float fibre = 0.5 + 0.5 * sin( wind * ${TWIST[2]} + 2.5 * noise3( vRest * 220.0 ) );
            // (the strands as long as they are a few pixels across, their hairs only close up)
            float seenB = 1.0 - smoothstep( 0.5, 1.2, length( restW * 120.0 ) );
            float seenT = 1.0 - smoothstep( 0.4, 1.0, length( restW * 400.0 ) );
            // (each strand round, a narrow dark crease between the two)
            float body = smoothstep( 0.0, 0.6, bulge );
            pieceH = ${TWIST[1]} * ( body - 0.5 ) * seenB + 0.0004 * fibre * seenT;
            diffuseColor.rgb = uHair * vColor.g * 1.1 * mix( 0.9, 0.62 + 0.45 * body, seenB ) * mix( 1.0, 0.94 + 0.12 * fibre, seenT ) * ( 0.8 + 0.2 * smoothstep( 0.0, 0.35, along ) ) * ( 0.9 + 0.2 * ownT );
          } else if ( vMapUv.x > ${((R_HAIR[0] + R_HAIR[2] / 2) / SHEET).toFixed(4)} ) {
            float seenC = 1.0 - smoothstep( 0.3, 0.9, length( restW * ${CURLS[0]} ) );
            float seenF = 1.0 - smoothstep( 0.3, 0.8, length( restW * ${CURLS[2]} ) );
            float lump = noise3( vRest * ${CURLS[0]} );
            float fine = noise3( vRest * ${CURLS[2]} + 9.0 );
            // (his hair's own colour, the same every way round: the picture of tufts laid on by where a point is stretches
            // into streaks down the sides of an afro, which no head of curls has)
            diffuseColor.rgb = uHair * vColor.g * ( 0.85 + 0.3 * noise3( vRest * 37.0 + 2.0 ) );
            pieceH = ${CURLS[1]} * seenC * lump + ${CURLS[3]} * seenF * fine;
            diffuseColor.rgb *= mix( 1.0, 0.5 + 0.9 * lump, seenC ) * mix( 1.0, 0.8 + 0.4 * fine, seenF );
          } else {
            // (combed hair, a lock, a twist: no lumps; its strands and its turns stand up and lie down in it as its
            // picture is lighter and darker, as long as they are some pixels across)
            float seenS = 1.0 - smoothstep( 0.4, 1.0, length( restW * ${LOCK_RELIEF[0]} ) );
            vec3 raw = texture( map, vMapUv ).rgb;
            pieceH = ${LOCK_RELIEF[1]} * seenS * ( dot( raw, vec3( 0.3, 0.59, 0.11 ) ) / max( 0.002, dot( uHair, vec3( 0.3, 0.59, 0.11 ) ) ) - 1.0 );
          }
        }
        float shut = 0.0;
        float eyeK = 0.0;
        vec3 eyeN = vec3( 0.0, 0.0, 1.0 );
        float eyeWet = 0.0;
        float eyeTear = 0.0;
        ${EYES}
        // (an eye drawn by the picture, far off: the whites take none of his face's own light, or they glow)
        eyeK = max( eyeK, skinK * ( 1.0 - smoothstep( 0.1, 0.22, stuff.r ) ) );
        // his mouth's insides (figure.py's mouth): the back of it, his tongue, his teeth, his gums. No light of the
        // building's gets far in past his lips: the further back a point is, the less of it (and the more of it the wider
        // his mouth is open), and lips just apart let little in at all; his teeth's edges, where the enamel is thin, are
        // greyer and a little blue, the dark behind them showing through; each part's roots, under his lips, in their shade
        float mouthK = 0.0;
        float mouthLit = 1.0;
        float mouthPart = -1.0;
        if ( vMapUv.y < ${INSIDES_UV[2]} && vMapUv.x > ${INSIDES_UV[0]} && vMapUv.x < ${INSIDES_UV[1]} ) {
          mouthK = 1.0;
          mouthPart = floor( ( vMapUv.x - ${INSIDES_UV[0]} ) / ${INSIDES_UV[3]} );
          float deep = max( 0.0, ${TEETH_FRONT.toFixed(3)} - vRest.z ) + ${MOUTH_CORNER[1].toFixed(2)} * max( 0.0, abs( vRest.x ) - ${MOUTH_CORNER[0].toFixed(3)} );
          mouthLit = exp( - deep / mix( ${MOUTH_LIGHT[0]}, ${MOUTH_LIGHT[1]}, uMouth ) ) * mix( ${MOUTH_SHUT}, 1.0, smoothstep( 0.03, 0.45, uMouth ) );
          mouthLit *= 1.0 - 0.45 * smoothstep( 0.012, 0.04, abs( vRest.y - ${MOUTH_MID.toFixed(3)} ) );
          // (and his jaw's under his upper teeth and his palate: little of a light from above gets down to it)
          mouthLit *= 1.0 - 0.3 * smoothstep( 0.0, 0.004, ${TEETH_EDGES[0].toFixed(3)} - vRest.y );
          // (a tooth's edge, and toward its root, where the dentin shows through it, a little yellower)
          if ( mouthPart == 2.0 ) {
            float edge = 1.0 - smoothstep( 0.0012, 0.0055, min( abs( vRest.y - ${TEETH_EDGES[0].toFixed(3)} ), abs( vRest.y - ${TEETH_EDGES[1].toFixed(3)} ) ) );
            diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.84, 0.86, 0.88 ), 0.5 * edge ) * mix( vec3( 1.0 ), vec3( 1.0, 0.97, 0.9 ), smoothstep( 0.012, 0.03, min( abs( vRest.y - ${TEETH_EDGES[0].toFixed(3)} ), abs( vRest.y - ${TEETH_EDGES[1].toFixed(3)} ) ) ) );
          }
        } else {
          // (dark skin's hollows go to black under a light from above long before light skin's do: its shade is let off some)
          vec3 baked = mix( vColor.rgb, vec3( 1.0 ), ( ( ${ON_HEAD('vMapUv')} ? ${HEAD_LIFT} : 0.3 ) + 0.25 * uTone ) * skinK );
          // (and his hair and beard as much as his skin: a beard's strands down under his jaw, in its shade, catch no sky)
          shutK = mix( 1.0, vColor.g, ${ON_HEAD('vMapUv')} ? 1.0 : skinK );
          diffuseColor.rgb *= mix( vColor.rgb, pow( baked, vec3( 0.9, 1.02, 1.1 ) ), skinK );${anat ? '\n          // (and the shade down in the hollows of his anatomy: between his muscles, along a tendon, under his collarbones)\n          diffuseColor.rgb *= mix( 1.0, anatC, skinK * ( 1.0 - eyeWet ) * uAnatK.z );' : ''}
        }
        diffuseColor.rgb *= mouthLit;
        // what the game does to his skin, and the lines his face makes (see CREASE_DEEP, WET_SHINE, Fig.skin): worked out on
        // the plane of his face as figure.py's head_r has it, each only as near as it can be seen; and where light gets
        // through him (his ears, the wings and the tip of his nose)
        float creaseH = 0.0;
        float beadH = 0.0;
        float beadK = 0.0;
        float wetK = 0.0;
        float hairWet = 0.0;
        {
          vec3 hn = normalize( ( vRest - ${HEAD_C} ) / ${HEAD_S} );
          vec2 fp = faceT( hn.xy / max( hn.z, 0.3 ) * 0.8 );
          float apx = abs( fp.x );
          float onHead = ${ON_HEAD('vMapUv')} ? 1.0 : 0.0;
          float ear = vMapUv.y < ${INSIDE_V} ? onHead : 0.0;
          float faceK = onHead * ( 1.0 - ear ) * smoothstep( 0.1, 0.5, hn.z ) * skinK;
          float fine = 1.0 - smoothstep( 0.004, 0.012, fwidth( fp.y ) );
          if ( faceK * fine > 0.0 && dot( uCrease, uCrease ) + dot( uMove, uMove ) + uMove2.y > 0.0 ) {
            vec2 cd = creases( fp );
            creaseH = cd.x * faceK * fine;
            diffuseColor.rgb *= 1.0 - ${CREASE_SHADE} * cd.y * faceK * fine;
          }
          // (his brows close up: the picture has a few points to a hair; here they are hairs, each its own, upright beside
          // his nose and laid over toward the tail (as headPainter lays them), as fine as the screen: two layers of them,
          // each hair crossing the brow's line at its own place, of its own length and darkness, his skin showing between
          // them; as much of them as the picture is darker than his skin, about the line of his brow. The screen's steps
          // are taken here, where every pixel is)
          float bq = ( apx - 0.15 ) / 0.52;
          vec2 fpW = fwidth( fp );
          float fineB = 1.0 - smoothstep( 0.0015, 0.004, fpW.y );
          if ( faceK * fineB > 0.0 && bq > -0.12 && bq < 1.1 && fp.y > 0.1 && fp.y < 0.38 ) {
            float yb = 0.2 + 0.07 * sin( clamp( bq * 1.15, 0.0, 1.0 ) * 1.9478 ) - 0.035 * smoothstep( 0.7, 1.0, bq );
            // (each hair a line through the brow's own line at its lean: told apart by where it crosses that line)
            float lean = mix( 1.25, 0.4, smoothstep( 0.0, 0.6, bq ) );
            float dy = fp.y - yb;
            float root = ( apx - dy / tan( lean ) ) * ${BROW_HAIRS[0]};
            float rootW = ${BROW_HAIRS[0]} * ( fpW.x + fpW.y / tan( lean ) );
            fineB *= 1.0 - smoothstep( 0.3, 0.6, rootW );
            float onB = smoothstep( 0.12, 0.45, 1.0 - dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) / max( 0.01, dot( uSkin, vec3( 0.3, 0.59, 0.11 ) ) ) );
            onB *= faceK * fineB * ( 1.0 - smoothstep( 0.05, 0.08, abs( dy ) ) );
            float cover = 0.0;
            for ( int k = 0; k < 2; k++ ) {
              float r = root * ( 1.0 - 0.31 * float( k ) ) + 0.37 * float( k );
              float cell = floor( r );
              float h1 = grain3( vec3( cell, float( k ), 3.0 ) );
              float h2 = grain3( vec3( cell, float( k ), 11.0 ) );
              float aa = max( 0.5 * rootW, 0.02 );
              float line = 1.0 - smoothstep( ${BROW_STRAND[0]} - aa, ${BROW_STRAND[0]} + aa, abs( fract( r ) - 0.5 + 0.35 * ( h1 - 0.5 ) ) );
              float len = ${BROW_STRAND[1]} * ( 0.6 + 0.8 * h2 );
              float seg = 1.0 - smoothstep( 0.3 * len, 0.5 * len, abs( dy - ${BROW_STRAND[2]} * ( h1 - 0.5 ) ) );
              cover = max( cover, line * seg * ( 0.55 + 0.45 * h2 ) );
            }
            // (between the hairs his skin, lighter than the picture's blur of them; the hairs darker, his brows' colour)
            diffuseColor.rgb *= mix( 1.0, ${BROW_STRAND[3]}, onB * ( 1.0 - cover ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, min( diffuseColor.rgb, uBrow ), cover * onB );
            creaseH += ${BROW_HAIRS[2]} * cover * onB;
          }
          if ( uWorn.x > 0.0 ) {
            // (his sweat: on all his skin, most where it gathers on his face, in beads there close up; his hair darker wet)
            float gather = min( 1.0, smoothstep( 0.24, 0.34, fp.y ) + valley( apx - 0.68, 0.12 ) * valley( fp.y - 0.25, 0.2 ) + valley( apx, 0.1 ) * valley( fp.y + 0.05, 0.22 ) + valley( apx, 0.2 ) * valley( fp.y + 0.41, 0.045 ) );
            wetK = uWorn.x * skinK * ( onHead > 0.0 ? mix( 0.55, 1.0, gather * faceK ) : 0.75 );
            vec2 bq = vec2( fp.x * 0.375, fp.y * 0.525 ) / ${BEAD_CELL};
            // (beads only on bare skin, never up into his hair or on a headband; more here than there: sweat gathers
            // unevenly; and only once a bead is a few pixels across, or they are a grain that crawls)
            float near = faceK * smoothstep( 0.6, 0.95, skinK ) * gather * ( 1.0 - smoothstep( 0.12, 0.3, length( fwidth( bq ) ) ) );
            if ( near > 0.0 ) {
              float on;
              float many = 0.55 * smoothstep( 0.15, 1.0, uWorn.x ) * ( 0.45 + 0.9 * noise3( vec3( fp * 5.0, 9.0 ) ) );
              beadH = beads( bq, many, on ) * ${(BEAD_CELL * BEAD_HIGH).toFixed(6)} * near;
              beadK = on * near;
            }
            hairWet = uWorn.x * onHead * ( 1.0 - skinK ) * ( 1.0 - ear );
            diffuseColor.rgb *= 1.0 - ${WET_HAIR} * hairWet;
          }
          float flush = uWorn.y * ( 1.0 - ${FLUSH_DARK} * uTone );
          if ( flush > 0.0 ) {
            float where = onHead > 0.0 ? ear * 0.9 + faceK * min( 1.0, 0.25 + valley( apx - 0.5, 0.2 ) * valley( fp.y + 0.22, 0.18 ) + 0.6 * valley( apx, 0.1 ) * valley( fp.y + 0.22, 0.12 ) + 0.35 * smoothstep( 0.3, 0.5, fp.y ) ) : skinK * ( 0.3 + 0.5 * smoothstep( 5.3, 5.8, vRest.y ) );
            diffuseColor.rgb *= mix( vec3( 1.0 ), ${FLUSH_TO}, where * flush );
          }
          skinThin = max( ear * skinK, faceK * ( 0.6 * valley( apx - 0.15, 0.05 ) * valley( fp.y + 0.3, 0.05 ) + 0.4 * valley( apx, 0.06 ) * valley( fp.y + 0.26, 0.05 ) ) );
        }
        // (the inside of his head and neck, seen through his open mouth past his teeth, is the dark of his mouth, not the
        // back of his skin, nor the top of his neck where it goes up inside his head; but for his ears, whose strip is
        // along the foot of his head's picture, and his hair's fuzz)
        float inside = ${fuzz ? '0.0' : `vRest.y > ${(HEAD_REST - 0.6).toFixed(2)} && ( ${ON_HEAD('vMapUv')} ? ! gl_FrontFacing && vMapUv.y > ${INSIDE_V} && stuff.g > 0.34 && vRest.y < ${(HEAD_REST + HEAD_MID.y + 0.1).toFixed(3)} : skinK > 0.5 && ( ! gl_FrontFacing || length( ( vRest - ${HEAD_C} ) / ${HEAD_S} ) < 0.92 && vRest.z > ${INSIDE_FRONT} ) ) ? 1.0 : 0.0`};
        // (but the inside of his lips, along the line of his mouth, is their own wet red, going into the dark)
        float lipIn = 0.0;
        if ( inside > 0.0 ) {
          lipIn = ${ON_HEAD('vMapUv')} ? ( 1.0 - smoothstep( 0.012, 0.04, abs( vRest.y - ${MOUTH_MID.toFixed(3)} ) ) ) * smoothstep( 0.3, 0.345, vRest.z ) : 0.0;
          diffuseColor.rgb = mix( ${MOUTH_DARK}, uSkin * vec3( 0.62, 0.3, 0.3 ) * smoothstep( 0.29, 0.35, vRest.z ), lipIn );
          skinK = 0.0;
          skinWrap = 0.0;
        }`,
      )
      // (dark skin is read by the light that glances off it more than by the little it gives back: it has more of a shine;
      // and no skin is one shine all over: a little more here, a little less there)
      .replace(
        '#include <roughnessmap_fragment>',
        // (and his sweat smooths it, his wet hair's too, and a bead of it is water; his skin's own off his head, see SKIN_ROUGH)
        `${SKIN_ROUGH}
        float roughnessFactor = mix( stuffR, 0.55, shut ) * ( 1.0 - 0.06 * uTone * skinK ) * ( skinK > 0.0 ? 1.0 + skinK * ( 0.16 * ( noise3( vRest * 38.0 ) - 0.5 ) + 0.22 * ( noise3( vRest * 7.0 ) - 0.5 ) ) : 1.0 );
        roughnessFactor = mix( roughnessFactor * ( 1.0 - ${WET_SHINE} * wetK - 0.3 * hairWet ), ${BEAD_ROUGH}, beadK );
        skinGloss = skinK * ( 1.0 - shut ) * ( 1.0 - eyeK ) * ( ${SKIN_OIL[1]} + ${SKIN_OIL[2]} * uTone + ${SKIN_OIL[3]} * wetK ) * ( 0.55 + 0.9 * noise3( vRest * 5.0 + 11.0 ) );`,
      )
      // (and what light comes to it off the building is warmer on it than on cloth: a little of it has been through him)
      // (his head has a little light of its own, most where it faces the camera: under the arena's top light a face is read by it)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), vec3( 1.04, 0.99, 0.96 ), skinK );
        // (skin gives back the lamps it sees, not the whole lit roof as a sheet of glass would: most of the building's
        // own shine on it would make vinyl of him)
        reflectedLight.indirectSpecular *= ( 1.0 - ${SKIN_ROOF} * skinK ) * shutK;
        reflectedLight.directSpecular *= mix( 1.0, shutK, ${SHUT_LAMPS} );
        float toward = saturate( dot( normal, normalize( vViewPosition ) ) );
        // (that light is a lamp on the camera, a little over the lens: a plane that faces it is lit and one that turns
        // down from it is not, so his brow, his nose and his jaw are shapes in it and not one flat glow)
        float lamp = saturate( dot( normal, normalize( normalize( vViewPosition ) + ( viewMatrix * vec4( 0.0, 0.55, 0.0, 0.0 ) ).xyz ) ) );
        // (the darker his skin, the more of that light it needs to be a face and not a shape; and the rest of his skin has some too)
        if ${ON_HEAD('vMapUv')} reflectedLight.indirectDiffuse += diffuseColor.rgb * ${FACE_FILL} * ( 1.0 + ${FACE_FILL_DARK} * uTone ) * ( 0.14 + 0.86 * lamp * lamp ) * ( 1.0 - 0.75 * eyeK );
        else reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.22 * uTone * skinK * ( 0.3 + 0.7 * toward );
        // (the light in his eye: that lamp, a spot on his cornea where it faces half way between the lamp and the lens, so
        // it stays put as the camera holds and moves over his iris as his eyes turn; and the shine of his tears along his
        // lower lid)
        if ( eyeWet + eyeTear > 0.0 ) {
          vec3 eyeV = normalize( vViewPosition );
          float c = dot( eyeN, normalize( eyeV + normalize( eyeV + ( viewMatrix * vec4( 0.0, 0.55, 0.0, 0.0 ) ).xyz ) ) );
          float fw = max( fwidth( c ), 0.0002 );
          reflectedLight.directSpecular += vec3( 1.0, 0.98, 0.95 ) * ( ${CATCH_LIGHT[1].toFixed(2)} * eyeWet * smoothstep( ${CATCH_LIGHT[0]} - fw, ${CATCH_LIGHT[0]} + fw, c ) + ${TEAR_SHINE} * eyeTear * ( 0.3 + 0.7 * lamp ) );
        }
        // (and a rim of light along the edges that face up: the top light catching the round of a brow, a cheek, a shoulder)
        float rim = pow( 1.0 - toward, 3.0 ) * saturate( 0.35 + 0.65 * dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) );
        reflectedLight.indirectSpecular += vec3( 1.0, 0.93, 0.86 ) * rim * skinK * ( 0.04 + 0.1 * uTone ) * ( ${ON_HEAD('vMapUv')} ? 1.0 : 0.45 );
        // (no light gets in there to speak of; but what does falls on his lips' insides, and they are wet)
        if ( inside > 0.0 ) {
          reflectedLight.directDiffuse *= mix( 0.25, 0.8, lipIn );
          reflectedLight.directSpecular *= 0.6 * lipIn;
          reflectedLight.indirectSpecular *= 0.4 * lipIn;
          reflectedLight.indirectDiffuse *= mix( 0.5, 0.9, lipIn );
        }
        // (his teeth and the rest of his mouth's insides are in the camera's lamp too, as far as its light gets in; their
        // shine is wet, and as dark as the rest of them back there)
        if ( mouthK > 0.0 ) {
          reflectedLight.indirectDiffuse += diffuseColor.rgb * ${FACE_FILL} * ( 0.14 + 0.86 * lamp * lamp );
          reflectedLight.directSpecular *= mouthLit;
          reflectedLight.indirectSpecular *= mouthLit * mouthLit;
        }`,
      );
    // his skin's anatomy, plain or not (a phone starts plain: its men have their muscles too); what the full one adds goes on after it
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n        knitSx = dFdx( - vViewPosition );\n        knitSy = dFdy( - vViewPosition );\n        ${anat ? `${ANAT_RELIEF}\n        ` : ''}${RELIEF_MARK}`,
    );
    if (plain) return;
    sh.fragmentShader = sh.fragmentShader
      .replace(
        RELIEF_MARK,
        /* glsl */ `${RELIEF_MARK}
        // (the screen's steps, taken here before anything is asked: his fine grain is read with them, see Detail)
        vec3 restDx = dFdx( vRest );
        vec3 restDy = dFdy( vRest );
        vec2 mapDx = dFdx( vMapUv );
        vec2 mapDy = dFdy( vMapUv );
        float restPx = length( abs( restDx ) + abs( restDy ) );
        vec2 grainD = vec2( 0.0 );
        float grainSq = 0.0;
        // (the folds his vest and his shorts hang in: the model's own are few and soft, and cloth that does not fold is
        // card. As long as a fold is more than a few pixels across: from the broadcast's camera too. Their height is had
        // before anything is asked of it, none off his kit, so its steps across the screen are taken where every pixel is)
        bool onVest = ${ON_VEST('vMapUv')};
        bool onKit = onVest || ${ON_SHORTS('vMapUv')};
        float seen = onKit ? 1.0 - smoothstep( 0.35, 0.9, restPx * 5.0 ) : 0.0;
        float fh = seen > 0.0 ? foldsOf( vRest, onVest ? 0.0 : 1.0 ) * seen : 0.0;
        vec2 foldD = vec2( dFdx( fh ), dFdy( fh ) );
        if ( onKit ) {
          if ( seen > 0.0 ) {
            normal = knitNormal( normal, foldD, faceDirection );
            // (and the bottom of a fold is in its own shade)
            diffuseColor.rgb *= 1.0 - ${FOLD_SHADE} * seen * ( 1.0 - smoothstep( 0.0, 0.55, fh / ( onVest ? ${FOLDS[0]} : ${FOLDS[1]} ) ) );
          }
          ${
            seams
              ? `// (and its seams, close up: see SEAM_RELIEF)
          ${SEAM_RELIEF}`
              : ''
          }
        }
        ${micro ? GRAIN_CLOTH : ''}if ( stuff.b > 0.02 && ! ${ON_HEAD('vMapUv')} ) {
          // (further off, where no stitch is seen, a knit still isn't one flat colour: its yarn a little uneven, row on row)
          vec2 kp = vMapUv * ${KNIT.toFixed(1)};
          float yarn = 1.0 - smoothstep( 0.25, 0.9, length( abs( mapDx ) + abs( mapDy ) ) * ${(KNIT * 0.12).toFixed(1)} );
          if ( yarn > 0.0 ) {
            float row = noise3( vec3( kp.x * 0.11, kp.y * 0.45, 0.0 ) );
            diffuseColor.rgb *= 1.0 + 0.06 * stuff.b * yarn * ( row - 0.5 );
          }
        }
        {
          ${micro ? GRAIN_SKIN : ''}// (and his cropped hair's grain, on his head where it is not skin: his hair, his beard; gone before it is finer than the pixels)
          float tufts = ( ${ON_HEAD('vMapUv')} ? 1.0 - skinK : 0.0 ) * ( 1.0 - smoothstep( 0.3, 0.7, restPx * ${TUFTS.toFixed(1)} ) );
          float tuftH = tufts > 0.0 ? ${TUFTS_DEEP} * tufts * noise3( vRest * ${TUFTS.toFixed(1)} ) : 0.0;
          grainD += vec2( dFdx( tuftH ), dFdy( tuftH ) );
          if ( dot( grainD, grainD ) > 0.0 ) normal = knitNormal( normal, grainD, faceDirection );
          // (and what of it all is too fine for the pixels roughs up the shine on it instead of being drawn: Toksvig's,
          // its slope squared on the roughness to the fourth, so a knit or a pore far off never sparkles)
          roughnessFactor = pow( pow( roughnessFactor, 4.0 ) + ${TOKSVIG} * grainSq, 0.25 );
          // (the lines his face makes, and the beads of his sweat)
          float wornH = creaseH + beadH + pieceH;
          vec2 wornD = vec2( dFdx( wornH ), dFdy( wornH ) );
          if ( dot( wornD, wornD ) > 0.0 ) normal = knitNormal( normal, wornD, faceDirection );
          // (his eye is lit as the ball it is, not as his lids' skin over where it is: see EYES)
          if ( eyeWet > 0.0 ) normal = normalize( mix( normal, eyeN, eyeWet ) );
          // (and his tongue's papillae, which break its wet shine up)
          float papH = mouthPart == 1.0 ? ${PAPILLAE_DEEP} * ( 1.0 - smoothstep( 0.3, 0.7, restPx * ${PAPILLAE.toFixed(1)} ) ) * noise3( vRest * ${PAPILLAE.toFixed(1)} ) : 0.0;
          vec2 papD = vec2( dFdx( papH ), dFdy( papH ) );
          if ( mouthPart == 1.0 ) normal = knitNormal( normal, papD, faceDirection );
        }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
        // (skin has a soft edge of its own against the light, warmer than cloth's)
        material.sheenColor = mix( stuff.g * mix( vec3( 1.0 ), diffuseColor.rgb, 0.45 ) * 0.7, vec3( 0.95, 0.6, 0.45 ) * ( 0.05 + 0.08 * uTone ), skinK );
        // (and none of it down in a hollow, nor under his jaw in a beard's shade: a sheen there is grey fluff)
        material.sheenColor *= shutK * ( stuff.r > 0.91 ? ${CURL_SHINE} : 1.0 );
        // (skin gives back less of a lamp than the default does, at its face: a skin's is near 0.028 against plastic's 0.04)
        material.specularColor *= 1.0 - 0.3 * skinK;
        // (and tight curls give back little of a lamp or the roof: they scatter it every way; much shine on them is a grey
        // frost over the top of a head of them)
        material.specularColor *= stuff.r > 0.91 ? ${CURL_SHINE} : 1.0;
        material.specularF90 *= stuff.r > 0.91 ? ${CURL_SHINE} : 1.0;
        // (and a head of hair or a beard seen edge on is not a mirror: half the shine at its edge a smooth thing has)
        if ( ${ON_HEAD('vMapUv')} && skinK < 0.5 && stuff.r > 0.8 && stuff.r <= 0.91 ) material.specularF90 *= 0.5;
        // (his hair's shine: see RE_Direct_Skin. Its strands lie back and down over his head from his crown; tight
        // curls scatter a lamp every way, and have little of it)
        if ${ON_HEAD('vMapUv')} {
          float hairK = smoothstep( 0.06, 0.09, stuff.g ) * ( 1.0 - smoothstep( 0.2, 0.28, stuff.g ) ) * ( 1.0 - skinK );
          if ( hairK > 0.0 ) {
            // (up and back off his forehead, back over his crown, down the back of his head and his sides; his beard's, down)
            vec3 own = ( normal * mat3( viewMatrix ) ) * uHead;
            vec3 lie = normalize( mat3( viewMatrix ) * ( uHead * ( vRest.y < ${(HEAD_REST + HEAD_MID.y - 0.06).toFixed(3)} ? vec3( 0.0, -1.0, 0.15 ) : vec3( 0.0, own.z * 1.2 - 0.5, -1.0 ) ) ) );
            hairAlong = normalize( lie - normal * dot( lie, normal ) + normal * 0.001 );
            // (each lock its own tilt: the band is broken along it, not a ring round a ball)
            float lock = noise3( vec3( vRest.x * 150.0, vRest.y * 24.0, vRest.z * 150.0 ) ) - 0.5;
            hairAlong = normalize( hairAlong + normal * 0.35 * lock );
            // (and broken in clumps over his head: one even band of light from temple to temple is a helmet's)
            float clump = noise3( vRest * 11.0 + 5.0 );
            hairShine = hairK * ${HAIR_SHINE} * ( 1.0 - smoothstep( 0.8, 0.97, stuff.r ) ) * ( 0.3 + 1.4 * ( lock + 0.5 ) ) * ( 0.35 + 1.3 * clump );
            // (a beard's hairs are short and every way: little of a band of light along them, and a lamp's in a dark
            // beard reads as grey frost along its edge)
            if ( vRest.y < ${(HEAD_REST + HEAD_MID.y - 0.06).toFixed(3)} ) hairShine *= 0.2;
            diffuseColor.rgb *= 0.86 + 0.28 * clump;
            hairTint = diffuseColor.rgb * 2.6 + 0.012;
          }
        }`,
      );
  };
  if (fuzz) m.defines = { ...m.defines, FUZZ: '' };
  if (anat) m.defines = { ...m.defines, SKIN_MAPS: '' };
  m.customProgramCacheKey = () =>
    `${plain ? 'figure-plain' : fuzz ? `figure-fuzz${coils ? '-coils' : ''}` : 'figure'}${anat ? `-m${anat.maps.size}` : ''}${micro ? '-d' : ''}${seams ? '-s' : ''}`;
  return m;
}

/** How far his head comes forward as he looks down (ft a radian of his nod, for a 6 ft 6 man): his neck's own bend. */
const NECK_BEND = 0.24;
/** How far his jaw swings open at the most, radians. */
const JAW_SWING = 0.28;
/** How far his brows go up at the most (ft, on the 6 ft 6 head): a man who can't believe it, or is stunned. */
const BROW_UP = 0.034;
/**
 * His eyes' own life (on the plane of his face: see uGaze). How far an iris goes across and up for a turn of the eye
 * (an eye's radius, some 12 mm, in that plane's units); how far ahead of his head his eyes get as it
 * turns (s: they find the thing first and hold on it as his head comes round); how long he holds them on one spot
 * before they flick to the next (s, the least and the most), and how far about the thing those spots are (radians,
 * across and up).
 */
const EYE_TURN = [0.13, 0.094] as const;
/**
 * His eyes turn in on what he looks at, each by the angle half the span between them (ft) makes at that distance: two
 * eyes on one thing, the ball in his hands or a man across the floor, not a doll's two fixed on nothing. How far off a
 * thing is when he looks at nothing in particular, and the nearest his eyes will come in for (ft): nearer, he would
 * be cross-eyed.
 */
const EYE_HALF = 0.105;
const EYE_IDLE = 9;
const EYE_NEAR = 1.4;
/** How far in his eyes are turned for a thing that far off (on the plane of his face, as uGaze has it). */
const eyeIn = (far: number) => EYE_TURN[0] * Math.sin(Math.atan(EYE_HALF / Math.max(EYE_NEAR, far)));
const EYE_LEAD = 0.1;
const FIXES = [0.35, 2.4] as const;
const FIX_SPREAD = [0.24, 0.1] as const;
/** On a thing, the spots his eyes rest on about it are this near it (radians: across, up). */
const FIX_ON = [0.035, 0.022] as const;
/** Where his eyes turn about, half way between them (from the head bone, ft, as built): what he looks at is found from there. */
const EYES_AT = new Vector3(0, 0.056, 0.33);
/** The farthest his eyes turn in his head (radians): across, up, down. Past that his head has to bring them round. */
const EYE_REACH = [0.5, 0.36, -0.45] as const;
/**
 * A jump bigger than this (radians) in where the thing he looks at is, from his head, is a new thing: his eyes go to
 * it in one flick (a saccade), this quick (a rate a second: there in some forty thousandths of a second), and he may
 * blink as they do (BLINK_SHIFT). Between flicks they're carried with the thing as it, and his head, moves: they stay on it.
 */
const SACCADE = 0.25;
const SACCADE_RATE = 55;
/**
 * The moves he keeps his eyes on the rim through and doesn't blink in: a shot until it's away (ms into it), his
 * routine at the line; and those of them he sets himself for, his lips pressed (not a run at the rim: up there his
 * mouth is open).
 */
const SHOTS = new Set<string>(['jumper', 'freeThrow', 'ftRoutine', 'layup', 'floater', 'hook', 'putback', ...DUNKS]);
const SET_SHOTS = new Set<string>(['jumper', 'freeThrow', 'ftRoutine', 'floater', 'hook']);
const SHOT_STILL = 900;
/**
 * His blink (s): how long his lids take to come down, stay down and go up again (quicker down than up); how often one
 * is a half blink, and how often two come together; the chance he blinks as his eyes go to a new thing or his head
 * whips round (faster than this, radians a second).
 */
const BLINK = [0.06, 0.03, 0.12] as const;
const BLINK_HALF = 0.12;
const BLINK_TWICE = 0.1;
const BLINK_SHIFT = 0.35;
const BLINK_WHIP = 3.5;
/** A knock at least this hard (Puppet.hit's power: see Fig.jolt) shuts his eyes a beat, as a blink does. */
const BLINK_KNOCK = 0.2;

/**
 * What his face is doing, a channel each (0..1): his jaw open; his brows down and drawn together; his brows up; a
 * smile; a grimace (the corners of his mouth down and out); his lips pressed; a snarl (his upper lip up off his
 * teeth); his lips apart; his eyes narrowed; his eyes wide; his eyes shut tight; his lids heavy; his lips rounded;
 * his cheeks blown out; his lips stretched wide; one side of his mouth further than the other (a smirk, a sneer: on
 * the side Fig.lopSide says); one brow up (Fig.cockSide's); his head thrown back.
 */
const F = {
  jaw: 0,
  frown: 1,
  raise: 2,
  smile: 3,
  grim: 4,
  press: 5,
  snarl: 6,
  part: 7,
  squint: 8,
  wide: 9,
  shut: 10,
  heavy: 11,
  round: 12,
  puff: 13,
  stretch: 14,
  lop: 15,
  cock: 16,
  back: 17,
} as const;
type Ch = keyof typeof F;
const CHANNELS = 18;
/**
 * How quickly each comes to what is asked of it (a rate a second): a face is quick, the lids quickest; a tired man's
 * lids come down slowly, cheeks fill over a breath, and a head thrown back goes back over a beat. Talking, his mouth's
 * own (TALKS) come TALK_QUICK times quicker still: a syllable is over in a tenth of a second or two.
 */
const CH_RATE = [14, 12, 10, 9, 10, 9, 12, 10, 14, 18, 24, 2.5, 14, 7, 14, 8, 8, 5] as const;
const TALK_QUICK = 1.8;
/**
 * A channel goes to what is asked of it as a muscle does, not as a switch: it gathers speed, then slows into it, and
 * never past it (critically damped, its speed kept from frame to frame), so one look goes over into the next with no
 * jerk where it starts. SPRING_K: how much quicker its spring is than the channel's rate, so it is as far there as the
 * rate says in about the same time.
 */
const SPRING_K = 2;
/**
 * Where a channel at `x` going at `v` (a second) is `dt` s on, sprung toward `goal` at `w` (a second); into `out` (its
 * place, then its speed). Worked out exactly, so a long frame never throws it past.
 */
export function follow(x: number, v: number, goal: number, w: number, dt: number, out: [number, number]): [number, number] {
  const y = x - goal;
  const e = Math.exp(-w * dt);
  const k = (v + w * y) * dt;
  out[0] = goal + (y + k) * e;
  out[1] = (v - w * k) * e;
  return out;
}
const FOLLOWED: [number, number] = [0, 0];
const TALKS = new Uint8Array(CHANNELS);
for (const c of [F.jaw, F.part, F.press, F.round, F.stretch]) TALKS[c] = 1;
/** A face, from what it has of each channel. */
function faceOf(o: Partial<Record<Ch, number>>): Float32Array {
  const v = new Float32Array(CHANNELS);
  for (const k of Object.keys(o) as Ch[]) v[F[k]] = o[k] ?? 0;
  return v;
}
/**
 * What a gesture does to his face, and how loud he is as he makes it (0: he isn't talking; his mouth goes through the
 * shapes of speech: see VISEMES); `for`: the face only so long into it (s), a referee's whistle in his mouth.
 */
const FACE_OF: Record<string, { face: Float32Array; talk: number; for?: number } | undefined> = {
  roar: { face: faceOf({ jaw: 1, frown: 1, snarl: 0.8, squint: 0.8 }), talk: 0 },
  flex: { face: faceOf({ jaw: 0.6, frown: 0.9, snarl: 0.6, squint: 0.7 }), talk: 0 },
  fist: { face: faceOf({ jaw: 0.45, frown: 0.6, snarl: 0.4, squint: 0.5 }), talk: 0 },
  protest: { face: faceOf({ frown: 0.35, raise: 0.7, wide: 0.3 }), talk: 1 },
  call: { face: faceOf({ frown: 0.3, wide: 0.15 }), talk: 0.85 },
  ask: { face: faceOf({ raise: 0.5 }), talk: 0.7 },
  point: { face: faceOf({ frown: 0.2, smile: 0.4 }), talk: 0.5 },
  wag: { face: faceOf({ jaw: 0.15, frown: 0.5, press: 0.3, smile: 0.3, lop: 0.8 }), talk: 0 },
  head: { face: faceOf({ frown: 0.6, press: 0.6, grim: 0.3 }), talk: 0 },
  five: { face: faceOf({ jaw: 0.2, smile: 0.8, part: 0.4, squint: 0.4 }), talk: 0 },
  clap: { face: faceOf({ frown: 0.1, smile: 0.5 }), talk: 0.6 },
  handUp: { face: faceOf({ raise: 0.45, press: 0.3 }), talk: 0 },
  wipe: { face: faceOf({ grim: 0.3, squint: 0.4, part: 0.3 }), talk: 0 },
  tug: { face: faceOf({ press: 0.4 }), talk: 0 },
  talk: { face: faceOf({ raise: 0.1 }), talk: 0.45 },
  direct: { face: faceOf({ frown: 0.15 }), talk: 0.55 },
  coachShout: { face: faceOf({ frown: 0.6, squint: 0.3 }), talk: 1 },
  coachPoint: { face: faceOf({ frown: 0.3 }), talk: 0.7 },
  coachWave: { face: faceOf({ raise: 0.2 }), talk: 0.6 },
  coachBoard: { face: faceOf({ frown: 0.15 }), talk: 0.5 },
  coachCalm: { face: faceOf({ raise: 0.15 }), talk: 0.35 },
  coachWide: { face: faceOf({ raise: 0.85, wide: 0.4 }), talk: 0.8 },
  refFoul: { face: faceOf({ round: 0.9, puff: 0.55, frown: 0.3 }), talk: 0, for: 0.55 },
  refTimeout: { face: faceOf({ round: 0.85, puff: 0.45 }), talk: 0, for: 0.45 },
};
/**
 * His mouth as he talks, a syllable at a time (not his jaw on a swing): open ("ah"), wide ("ee"), rounded ("oo"),
 * shut ("m", "b"), and between words just apart (QUIET). How likely each of the first four is (added up), how long a
 * syllable is held (s, the least and the most), how many syllables to a word, and how long the beat between words
 * (s). A loud man's shapes are bigger (each a share of them, from the least for the quietest).
 */
const VISEMES = [
  faceOf({ jaw: 0.8, part: 0.9 }),
  faceOf({ jaw: 0.3, stretch: 0.85, part: 0.8 }),
  faceOf({ jaw: 0.42, round: 1, part: 0.55 }),
  faceOf({ press: 0.5 }),
  faceOf({ jaw: 0.06, part: 0.3 }),
];
const QUIET = 4;
const VISEME_ODDS = [0.36, 0.58, 0.75, 1] as const;
const SYLLABLE = [0.075, 0.19] as const;
const WORD = [2, 6] as const;
const WORD_GAP = [0.14, 0.42] as const;
const LOUD_LEAST = 0.4;
/**
 * His head's own moves, over where he looks (radians about his neck: see Fig.nod): a nod (down and back up, a beat or
 * two), a shake (side to side, two or three times, quick), a beat (one small dip on a word said hard). Each: how far,
 * how long a swing takes (s), how many swings.
 */
const HEAD_MOVES = { nod: [0.14, 0.38, 2], shake: [0.16, 0.27, 3], beat: [0.045, 0.22, 1] } as const;
export type HeadMove = keyof typeof HEAD_MOVES;
/** How far back his head goes thrown back (radians: his chin up), and how far it tips to one side with one brow up. */
const HEAD_BACK = 0.36;
const HEAD_TIP = 0.09;
/** How far one brow goes up past the other (radians of his brows' bone about the line of his nose). */
const BROW_COCK = 0.18;

/** What a moment of the game may give a man (see Fig.feel). */
export type Feel = 'joy' | 'shout' | 'miss' | 'stung' | 'disbelief' | 'stunned' | 'wince' | 'glare' | 'exhale' | 'blow';
/** A way of showing a feeling: his face, and a move of his head with it (so long after it comes on, s). */
interface Way {
  face: Float32Array;
  head?: HeadMove;
  at: number;
}
const way = (o: Partial<Record<Ch, number>>, head?: HeadMove, at = 0.15): Way => ({ face: faceOf(o), head, at });
/**
 * Each feeling: the ways a man may show it (one picked each time, by the roll, or for joy by his own way: see
 * Look.grin), how long it takes to come on, how long it holds and how long it goes off over (s), and what it may turn
 * into once it has held (how likely: always, if not said). Joy is a grin, a shout, or (a cool man, a lesser basket) a
 * smirk out of one side of his mouth; a miss a grimace with his eyes shut a beat, his lips pressed and a shake of his
 * head, an "aw", or his head thrown back with his eyes shut, and now and then a breath let out after it; stung (the
 * ball taken from him) a scowl, maybe a shake; disbelief (a whistle on him) his brows up and his mouth open, or one
 * brow up and a twist of his mouth, a shake; stunned (his shot sent back) wide eyes, then stung; a wince (a knock) his
 * eyes shut and his teeth bared; a glare (at the man who fouled him) his brows down and his eyes narrowed on him, or
 * a sneer; an exhale his cheeks blown out, then the breath let go through round lips.
 */
const FEELS: Record<Feel, { ways: Way[]; rise: number; hold: number; fall: number; then?: Feel; odds?: number }> = {
  joy: {
    ways: [
      way({ smile: 1, part: 0.55, squint: 0.55, jaw: 0.1, raise: 0.15 }),
      way({ jaw: 0.75, snarl: 0.55, frown: 0.6, squint: 0.7, smile: 0.3 }),
      way({ smile: 0.6, lop: 1, squint: 0.3, cock: 0.5, part: 0.15 }, 'nod', 0.25),
    ],
    rise: 0.18,
    hold: 1.5,
    fall: 0.7,
  },
  shout: { ways: [way({ jaw: 1, snarl: 0.8, frown: 0.9, squint: 0.8 })], rise: 0.12, hold: 1.1, fall: 0.6 },
  miss: {
    ways: [
      way({ grim: 0.9, shut: 0.8, frown: 0.7, press: 0.35, part: 0.2 }),
      way({ press: 0.9, frown: 0.55, grim: 0.35, squint: 0.3 }, 'shake', 0.2),
      way({ jaw: 0.3, raise: 0.4, grim: 0.45, frown: 0.25, round: 0.35 }),
      way({ back: 1, shut: 0.85, grim: 0.5, frown: 0.45, part: 0.35, stretch: 0.3 }),
    ],
    rise: 0.12,
    hold: 0.55,
    fall: 0.6,
    then: 'exhale',
    odds: 0.35,
  },
  stung: {
    ways: [way({ frown: 0.85, press: 0.7, grim: 0.45, squint: 0.3 }), way({ jaw: 0.35, frown: 0.6, grim: 0.6, part: 0.3, squint: 0.2 }, 'shake', 0.3)],
    rise: 0.15,
    hold: 1.3,
    fall: 0.8,
  },
  disbelief: {
    ways: [
      way({ raise: 1, jaw: 0.5, wide: 0.75, grim: 0.25 }, 'shake', 0.35),
      way({ raise: 0.8, frown: 0.25, jaw: 0.35, smile: 0.12, wide: 0.5 }),
      way({ cock: 1, raise: 0.35, lop: 0.8, smile: 0.25, grim: 0.25, jaw: 0.12 }, 'shake', 0.45),
    ],
    rise: 0.15,
    hold: 1.6,
    fall: 0.8,
  },
  stunned: { ways: [way({ wide: 1, raise: 0.75, jaw: 0.3 })], rise: 0.06, hold: 0.45, fall: 0.3, then: 'stung' },
  wince: { ways: [way({ shut: 0.85, grim: 0.8, part: 0.45, frown: 0.8, squint: 1, stretch: 0.3 })], rise: 0.04, hold: 0.22, fall: 0.35 },
  glare: {
    ways: [way({ frown: 1, squint: 0.8, press: 0.6, snarl: 0.15 }), way({ frown: 0.85, squint: 0.6, lop: 0.9, snarl: 0.45, press: 0.25 })],
    rise: 0.2,
    hold: 1.1,
    fall: 0.7,
  },
  exhale: { ways: [way({ puff: 1, press: 0.35, raise: 0.12 }), way({ puff: 0.8, round: 0.3, heavy: 0.4 })], rise: 0.22, hold: 0.3, fall: 0.12, then: 'blow' },
  blow: { ways: [way({ round: 0.8, part: 0.65, jaw: 0.16, puff: 0.2, heavy: 0.35 })], rise: 0.08, hold: 0.3, fall: 0.5 },
};
/** A feeling comes on a beat after the moment (s: the least, and up to this much more): not every man in one frame. */
const REACT_AFTER = [0.03, 0.2] as const;
/** His face as he guards a man (his jaw set, his eyes narrowed on him), and as he shoots (lips pressed): each a share of it, by the man (see Look.temper). */
const SET = faceOf({ press: 0.3, frown: 0.4, squint: 0.35 });
const FOCUS = faceOf({ press: 0.5, frown: 0.25, squint: 0.2 });
/**
 * The game as it is for him (Fig.stakes, -1..1). Close and late, as he plays his jaw is set harder and his eyes are
 * wider (CLUTCH, at the most), his guarding face is fuller and every feeling a little bigger and held a little longer
 * (STAKES_K, STAKES_HOLD at the most); in a blowout all of it as much less: looser.
 */
const CLUTCH = faceOf({ press: 0.45, frown: 0.3, wide: 0.28 });
const STAKES_K = 0.25;
const STAKES_HOLD = 0.3;
/** The clips he guards a man in, and those he rests in (his lids heavy once he's spent). */
const GUARDING = new Set<string>(['stance', 'ready', 'shuffle', 'closeout', 'contest', 'boxout']);
const RESTING = new Set<string>(['idle', 'idle2', 'idle3', 'shift', 'hips', 'knees', 'spot', 'spot2', 'spot3']);
/** Spent, he breathes through his mouth: from how spent (the puppet's effort) it starts to come open, and how far at the most (his jaw, his lips). */
const PANT = [0.25, 0.3, 0.25] as const;
/** Late in the game (Fig.wear) he looks this spent at the least, a share of the puppet's effort: his breath and his lids show the minutes. */
const WEAR_SPENT = 0.55;
/**
 * His face as it was, kept on the possession's own clock (the script's ms) for an instant replay to show (see
 * Fig.when): a sample at most every TAPE_STEP ms of it, the last TAPE_N of them (some twenty seconds of play at 1x).
 * Each (TAPE_K numbers) is the script's ms; his face's channels; his blink; where his eyes were (across, up, how far
 * in); his head's own move (its nod, turn and tip: see HEAD_MOVES); the sides a one-sided mouth and a raised brow were
 * on. A moment up to TAPE_OVER ms past the last of it is that last face; outside it, his face is his own as it is now.
 */
const TAPE_N = 1200;
const TAPE_STEP = 8;
const TAPE_OVER = 250;
const T_BLINK = 1 + CHANNELS;
const T_EYE = T_BLINK + 1;
const T_HEAD = T_EYE + 3;
const T_SIDE = T_HEAD + 3;
const TAPE_K = T_SIDE + 2;

/**
 * His sweat and his flush (see Fig.skin), a rate a second of his body's clock each: how quickly he gets wet going (by how
 * hard he goes: the puppet's effort), how quickly it dries off him stood at a dead ball, and on the bench (a man back on
 * the floor comes back as wet as he left it, less that: see WORN); how quickly his face flushes and how quickly it goes.
 * How tired his eyes look follows how spent he is and how long he has been at it, slowly.
 */
const WET_UP = 0.0022;
const WET_DOWN = 0.0012;
const BENCH_DRY = 0.003;
const FLUSH_RATE = [0.03, 0.015] as const;
const TIRED_RATE = 0.02;
/** What the men who have left the floor had on their skin (wet, flushed, tired) and when they left (s, the wall's clock), by seed: the most kept. */
const WORN = new Map<number, { wet: number; flush: number; tired: number; at: number }>();
const WORN_KEPT = 40;

const A = new Vector3();
const C = new Vector3();
const D = new Vector3();
const E = new Vector3();
const X = new Vector3();
const W3 = new Vector3();
const Yv = new Vector3();
const Z = new Vector3();
const MAT = new Matrix4();
const Q = new Quaternion();
const QA = new Quaternion();
const QB = new Quaternion();
const EU = new Euler();
const UP = new Vector3(0, 1, 0);
const XA = new Vector3(1, 0, 0);
const ZA = new Vector3(0, 0, 1);

export class Fig {
  readonly group = new Group();
  readonly pup: Puppet;
  readonly side: 0 | 1;
  /** The team's letters on his kit (none in a highlight): another set dresses him again. */
  readonly mark: string;
  /** His bones, by the figure's count (B): what place puts where the puppet's joints are, and a skin hangs on. */
  readonly bones: Bone[] = [];
  /** Each limb's hinge (the line its elbow or knee folds about), kept for when it's straight. */
  private readonly hinge = [new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0)];
  /** Each free hand's wrist as it is now (see WRIST_LOOSE): how far it is bent toward the palm, and turned palm-back (the left's, then the right's). */
  private readonly wrists = new Float32Array([WRIST_LOOSE, WRIST_PRON, WRIST_LOOSE, WRIST_PRON]);
  /** Each hand's shape as it is now (see Shape: the left's, then the right's), eased toward what he is doing. */
  private readonly digits = Float32Array.from([...LOOSE, ...LOOSE]);
  /** His hands' own clock (ms): see HAND_LIFE. */
  private handMs = 0;
  readonly shadow: Mesh;
  readonly ring: Mesh;
  private readonly own: { dispose(): void }[] = [];
  private gone = false;
  /** His skin (none: a man with no skin of his own, see the constructor). */
  private readonly mesh: SkinnedMesh | null = null;
  /** His mesh as the model has it, and split finer for when he is seen close (see near). */
  private readonly base: BufferGeometry | null = null;
  private fine: BufferGeometry | null = null;
  /** His hair's fuzz (see fuzzOf): left off on a device that can't keep up. */
  private readonly fuzz: SkinnedMesh | null = null;
  /** The bands that stand off his limbs (see Cuff), on the same bones; none on a man who wears none, or with no skin of his own. */
  private readonly cuffs: SkinnedMesh | null = null;
  /**
   * His far body (Geo.far), on the same bones, in his plain material: all of him that a lamp's shadow map and the
   * floor's mirror draw, and what a device that can't keep up draws of him unless he is close. In any other picture
   * none of its triangles are drawn (its draw range is empty: see bodies). His full body throws no shadow of its own.
   */
  private readonly low: SkinnedMesh | null = null;
  /** Which picture is being drawn and how: the floor's mirror's; on a device that can't keep up; and, on one, close enough that his full body is wanted. */
  private inMirror = false;
  private plain = false;
  private close = false;
  /** His material, and its plain twin once a slow device has asked for it (see lite). */
  private readonly mats: [MeshStandardMaterial, MeshStandardMaterial | null] | null = null;
  private readonly textures: [CanvasTexture, CanvasTexture] | null = null;
  private readonly told: Told;
  /** His share of his skin's anatomy, for his material and its plain twin (see Relief); none where its map didn't come. */
  private readonly relief: Relief | null = null;
  /** Whose figure this is (his seed): what the game did to his skin goes with him off the floor and back (see WORN). */
  private readonly who: number;
  /** His blink: his own time between two (s), and a number of his own that sets him apart from the next man. */
  private readonly blinkGap: number;
  private readonly phase: number;
  /** The blink going (when it started, s, and how far it shuts), whether another follows it, and when the next comes (s). */
  private blinkAt = -1;
  private blinkK = 1;
  private blinkTwice = false;
  private blinkNext = 0;
  /**
   * His face's own clock (s): his body's time, a frame at a time (Puppet.frameMs), so a replay at half speed plays his
   * face at half speed, a lab that runs faster than the wall plays it as the game had it, and a game held still holds it.
   */
  private clock = 0;
  /** His face as it is now, a channel each (see F), how fast each is going (a second: see follow), and what is asked of it this frame. */
  private readonly mien = new Float32Array(CHANNELS);
  private readonly mienV = new Float32Array(CHANNELS);
  private readonly want = new Float32Array(CHANNELS);
  /** What a moment gave him (see feel): which feeling and his way of showing it (null: none), how strongly, when (s), how long it holds (s), and what it turns into (null: nothing). */
  private feelKind: Feel = 'joy';
  private feelWay: Way | null = null;
  private feelK = 0;
  private feelAt = 0;
  private feelHold = 0;
  private feelThen: Feel | null = null;
  /** The face a moment gave him before the one showing now took its place, going off as it would have (see start): its face (null: none), how much of it was showing, from when (s), over how long (s). */
  private fadeFace: Float32Array | null = null;
  private fadeK = 0;
  private fadeAt = 0;
  private fadeLen = 0;
  /** His eyes: where they look now (radians from where his head faces: across, up) and how far in, the spot they're on and when the next comes (s), how fast his head is turning (eased) and where it faced a frame ago; and his own run of numbers for the spots. */
  private readonly eye = [0, 0];
  private verge = eyeIn(EYE_IDLE);
  private readonly fix = [0, 0];
  private fixAt = 0;
  private headRate = 0;
  private headWas = Number.NaN;
  private readonly eyeRng: () => number;
  /** Where the thing he looks at was a frame ago (radians from where his head faced), whether he had one, and whether his head was whipping round. */
  private readonly goal = [0, 0];
  private onIt = false;
  private whipped = false;
  /** Where a point is from his eyes (see sight): across, up (radians), how far (ft). */
  private readonly sighted = [0, 0, 0];
  /** A glance of his eyes alone, his head staying where it is (see peek): at what, and until when (s). */
  private readonly peekAt = { x: 0, y: 0, z: 0 };
  private peekTill = -1;
  /** His talking (see VISEMES): the shape his mouth is in, until when (s), and how many syllables are left of the word. */
  private vis = QUIET;
  private visTill = 0;
  private sylLeft = 0;
  /** The gesture he was making a frame ago, and when he started it (s). */
  private gestWas: string | null = null;
  private gestAt = 0;
  /** His head's own move (see nod): which, when it starts (s), how big; and what all his head's own moves come to (place lays it over where he looks). */
  private moveKind: HeadMove = 'nod';
  private moveAt = -1e9;
  private moveK = 0;
  private readonly tilt = new Quaternion();
  /** The sides a one-sided mouth and one raised brow are on now (1: his left, -1: his right), and the side he favours. */
  private lopSide = 1;
  private cockSide = 1;
  private readonly favours: 1 | -1;
  /** Where in the game his face is this frame (see when): the possession, the script's ms, and whether a replay has the picture. */
  private of: object | null = null;
  private ms = 0;
  private replaying = false;
  /** His face as it was (see TAPE_N): the samples (made the first time one is kept), whose possession, how many, where the next goes; and this frame's face, a sample's worth. */
  private tape: Float32Array | null = null;
  private tapeOf: object | null = null;
  private tapeN = 0;
  private tapeHead = 0;
  private readonly row = new Float32Array(TAPE_K);
  /** This frame's face's channels, on the row. */
  private readonly shown = this.row.subarray(1, 1 + CHANNELS);
  /** What the game is to him now (-1 a blowout, 0 nothing much, 1 close and late) and how far into it he is (0 fresh, 1 the last minutes of the fourth): the scene says (see CLUTCH, WEAR_SPENT). */
  stakes = 0;
  wear = 0;

  /** Where the ball is while he has a hand on it (the scene's point; null: his hands lie on it as his move's grip has them). */
  ball: { x: number; y: number; z: number } | null = null;
  /** His own face and hair, from his seed. */
  readonly look: Look;

  /**
   * His lips are one skin, with no mouth behind them (the people round the floor: sideline.ts hangs their bodies on
   * these bones): his jaw stays shut whatever his face asks of it. His brows and his head still move.
   */
  sealed = false;

  /**
   * `seed` makes him himself (his skin, face and hair, what he wears on his arms and legs, his shoes; `look` to give
   * him another); `mark` is his team's letters. `kit` null: a man with no skin of his own, his puppet, his bones and
   * his face's moves only, for another body to be hung on (sideline.ts: a referee, a coach). Nothing of him is
   * painted and nothing of his goes up on the card: a player's kit sheet is two 1024 px pictures and his head a
   * painting of its own, which under another skin nobody would see.
   */
  constructor(geo: Geo, body: Body, side: 0 | 1, kit: MatchKit | null, num: string, seed = 0, name = '', mark = '', look: Look = lookOf(seed)) {
    this.pup = new Puppet(body);
    this.side = side;
    this.mark = mark;
    this.look = look;
    this.who = seed;
    this.told = {
      uTone: { value: look.tone / (SKINS.length - 1) },
      uSkin: { value: new Color(look.skin) },
      uHair: { value: new Color(look.hair) },
      uBrow: { value: new Color(look.brows).multiplyScalar(0.7) },
      uBlink: { value: 0 },
      uIris: { value: new Color(look.eyes) },
      uEye: { value: new Vector2(EYE_TILT * look.face.tilt, EYE_OPEN * look.face.open) },
      uGaze: { value: new Vector3(0, 0, eyeIn(EYE_IDLE)) },
      uLid: { value: new Vector2() },
      uMouth: { value: 0 },
      uMove: { value: new Vector4() },
      uMove2: { value: new Vector4() },
      uMove3: { value: new Vector4() },
      uShape: { value: new Vector4(look.face.cheeks, look.face.full, look.face.point, look.face.flare) },
      uShape2: { value: new Vector4((look.face.lips - 0.5) * 2, (look.face.ridge - 0.45) * 2, look.face.deep, look.face.wings) },
      uHead: { value: new Matrix3() },
      uWorn: { value: new Vector4(0, 0, 0, look.age) },
      uCrease: { value: new Vector4() },
    };
    // (he blinks in his own time: every few seconds, never with the man beside him)
    this.blinkGap = 3.1 + (((seed * 7) % 11) / 11) * 2.6;
    this.phase = ((seed * 13) % 17) / 17;
    this.eyeRng = rng(seed * 31 + 7);
    this.blinkNext = this.phase * this.blinkGap;
    // (and a side he favours for a one-sided look: his smirk is his own)
    this.favours = ((seed * 5) % 7) / 7 < 0.5 ? 1 : -1;
    this.frame(body, seed);
    const dark = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05, depthWrite: false });
    this.shadow = new Mesh(geo.blob, dark);
    this.shadow.scale.setScalar(body.s * (0.9 + 0.2 * body.bulk));
    this.shadow.renderOrder = 3;
    const ringMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new Mesh(geo.ring, ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    this.own.push(dark, ringMat);
    if (!kit) return;

    // his skin: his kit and his head painted, his own material, his mesh on his bones
    const gear = gearOf(seed, kit);
    const sheet = paint(kit, num, name, mark, gear, look, geo.shorts, !!geo.maps);
    const map = new CanvasTexture(sheet.cv);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const stuff = new CanvasTexture(sheet.stuff);
    // (back on the floor, he is as wet as he was when he left it, less what the bench dried off him)
    const was = WORN.get(seed);
    if (was) {
      const off = Math.exp(-Math.max(0, performance.now() / 1000 - was.at) * BENCH_DRY);
      this.told.uWorn.value.set(was.wet * off, was.flush * off * off, was.tired * off, look.age);
    }
    // (every man has the same muscles, tendons and veins under his skin, and his own share of them: a little more or less
    // of his form, his veins from faint to roped)
    const built = rng(seed * 3 + 401);
    this.relief = geo.maps && { maps: geo.maps, k: { value: new Vector3(0.9 + 0.2 * built(), 0.5 + 0.8 * built(), 1) } };
    const mat = stuffMaterial(map, stuff, this.told, false, false, this.relief, geo.detail);
    const fuzzMat = stuffMaterial(map, stuff, this.told, false, COILED.includes(STYLES[look.style].piece ?? '') ? 'coils' : true);
    this.own.push(map, stuff, mat, fuzzMat);
    this.mats = [mat, null];
    this.textures = [map, stuff];
    // (his finished head, once it's painted, goes onto whichever sheet he has by then)
    let current = sheet;
    const sharpen = (on: Sheet) => {
      if (on.head)
        refine(on.head, (head) => {
          if (this.gone) return;
          current.put(R_HEAD, head);
          current.fill(R_EAR, earOf(look), 'skin');
          map.needsUpdate = stuff.needsUpdate = true;
        });
    };
    sharpen(sheet);
    // (the app's face may still be on its way: once it's here, his letters are painted again in it)
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts && !fonts.check('900 40px "Archivo Variable"'))
      void fonts.load('900 40px "Archivo Variable"').then(() => {
        if (this.gone || !fonts.check('900 40px "Archivo Variable"')) return;
        const again = paint(kit, num, name, mark, gear, look, geo.shorts, !!geo.maps);
        current = again;
        map.image = again.cv;
        stuff.image = again.stuff;
        map.needsUpdate = stuff.needsUpdate = true;
        sharpen(again);
      });
    // (his face his own shape: MakeHuman's shapes of a face, in his mix, on his head; see ownShape)
    let worn = geo.wearing(STYLES[look.style].piece, gear.shoe.high);
    let fuzzGeo = geo.fuzzFor(STYLES[look.style].piece);
    if (geo.shapes) {
      worn = ownShape(worn, geo.shapes, look.shape);
      fuzzGeo = ownShape(fuzzGeo, geo.shapes, look.shape, fuzzGeo.userData.from as Int32Array);
      this.own.push(worn, fuzzGeo);
    }
    const mesh = new SkinnedMesh(worn, mat);
    this.mesh = mesh;
    this.base = worn;
    const bones = new Skeleton(
      geo.order.map((k) => this.bones[k]),
      geo.inverse,
    );
    this.own.push(bones);
    mesh.bind(bones, new Matrix4());
    mesh.receiveShadow = true;
    // (its bones carry it anywhere on the floor: its own bounds say nothing)
    mesh.frustumCulled = false;
    this.group.add(mesh);
    // His far body. The shadow he throws is its shadow: four lamps each drew all of him again, 28,000 triangles and
    // more where he was split finer for a close-up, for a map whose dot is a tenth of a foot. (Its points are every
    // man's; its draw range is his own, so the shape is.)
    const from = geo.far.wearing(STYLES[look.style].piece, gear.shoe.high);
    const lowGeo = new BufferGeometry();
    for (const [k, a] of Object.entries(from.attributes)) lowGeo.setAttribute(k, a);
    lowGeo.setIndex(from.index);
    const lowMat = stuffMaterial(map, stuff, this.told, true);
    const lowBones = new Skeleton(
      geo.far.order.map((k) => this.bones[k]),
      geo.far.inverse,
    );
    this.own.push(lowGeo, lowMat, lowBones);
    const low = new SkinnedMesh(lowGeo, lowMat);
    this.low = low;
    low.bind(lowBones, new Matrix4());
    low.castShadow = true;
    low.receiveShadow = true;
    low.frustumCulled = false;
    lowGeo.setDrawRange(0, 0);
    low.onBeforeShadow = () => lowGeo.setDrawRange(0, Infinity);
    low.onAfterShadow = () => lowGeo.setDrawRange(0, this.far ? Infinity : 0);
    this.group.add(low);
    // (his hair's fuzz, on the same bones, and his beard's: it casts no shadow of its own)
    this.fuzz = new SkinnedMesh(fuzzGeo, fuzzMat);
    this.fuzz.bind(bones, new Matrix4());
    this.fuzz.frustumCulled = false;
    this.fuzz.receiveShadow = true;
    this.group.add(this.fuzz);
    const banded = geo.cuffs(cuffsOf(gear, kit));
    if (banded) {
      this.own.push(banded);
      this.cuffs = new SkinnedMesh(banded, geo.cuffMat);
      this.cuffs.bind(bones, new Matrix4());
      this.cuffs.frustumCulled = false;
      this.cuffs.receiveShadow = true;
      this.group.add(this.cuffs);
    }
    this.bodies();
  }

  /** Whether the picture being drawn has his far body and not his full one (see low). */
  private get far(): boolean {
    return this.inMirror || (this.plain && !this.close);
  }

  /** Puts in the picture what it has of him: his full body with its fuzz and bands, or his far one alone; on a slow device, his full body in its plain material and nothing over it. */
  private bodies() {
    if (!this.mesh || !this.mats || !this.fuzz || !this.low) return;
    const far = this.far;
    this.mesh.visible = !far;
    this.mesh.material = (this.plain && this.mats[1]) || this.mats[0];
    this.fuzz.visible = !far && !this.plain && this.fuzzy;
    if (this.cuffs) this.cuffs.visible = !far && !this.plain;
    this.low.geometry.setDrawRange(0, far ? Infinity : 0);
  }

  /** The floor's mirror is being drawn (or has been): his far body is in it. */
  mirrored(on: boolean) {
    if (this.inMirror === on) return;
    this.inMirror = on;
    this.bodies();
  }

  /** On a device that can't keep up, whether he is close enough to the camera to be drawn in his full body (the scene says: see Scene.closeUp). */
  closeTo(on: boolean) {
    if (this.close === on) return;
    this.close = on;
    this.bodies();
  }
  get isClose(): boolean {
    return this.close;
  }

  /**
   * Whether he has any fuzz to draw: a head of hair's, or a beard's (a shaved head has none of its own, but a man
   * with a shaved head and a beard has his beard's). One answer, asked wherever his fuzz is shown or hidden: asked
   * twice in two places it was two answers, and a shaved head's beard lost its fuzz the first time the scene told
   * him how fine to be drawn.
   */
  private get fuzzy(): boolean {
    return STYLES[this.look.style].name !== 'shaved' || this.look.beard > 1;
  }

  /** His bones, each sized to his build: the trunk widens with his bulk, his limbs thicken with it, a small man's head is a little big. */
  private frame(body: Body, seed: number) {
    const { s, bulk } = body;
    const look = this.look;
    for (let k = 0; k < BONES; k++) {
      const b = new Bone();
      this.bones.push(b);
      this.group.add(b);
    }
    const thick = s * (0.78 + 0.22 * bulk);
    const deep = Math.sqrt(bulk) * s;
    const scale = (k: number, x: number, y: number, z: number) => this.bones[k].scale.set(x, y, z);
    // (and no two men of one build are cut the same: one is broader across the chest, one has heavier arms or thighs,
    // one thin calves and forearms. A few parts in a hundred each: his joints stay where the puppet has them.)
    const own = rng(seed + 977);
    const [wide, arm, leg, low] = [0.97 + 0.07 * own(), 0.95 + 0.11 * own(), 0.95 + 0.1 * own(), 0.94 + 0.1 * own()];
    scale(B.pelvis, bulk * s, s, deep);
    scale(B.chest, bulk * s * wide * (body.shoulders ?? 1), s, deep);
    scale(B.hem, bulk * s, s, deep);
    // (and each has a face of his own: a wider or a longer head, his jaw, his nose)
    const hs = Math.sqrt(s) * 1.0;
    const face = look.face;
    const hd = hs * face.depth;
    scale(B.head, hs * face.wide, hs * face.long, hd);
    scale(B.jaw, hs * face.wide * face.jaw, hs * face.long * face.chin, hd);
    scale(B.nose, hs * face.wide * face.nose, hs * face.long, hd * face.bridge);
    scale(B.hair, hs * face.wide, hs * face.long, hd);
    scale(B.brow, hs * face.wide, hs * face.long, hd);
    scale(B.lip, hs * face.wide, hs * face.long, hd);
    for (const k of [B.ual, B.uar]) scale(k, thick * arm, s, thick * arm);
    for (const k of [B.fal, B.far]) scale(k, thick * arm * low, s, thick * arm * low);
    for (const k of [B.thl, B.thr, B.hemL, B.hemR]) scale(k, thick * leg, s, thick * leg);
    for (const k of [B.shl, B.shr]) scale(k, thick * leg * low, s, thick * leg * low);
    for (const k of [B.hal, B.har, B.ftl, B.ftr]) scale(k, s, s, s);
    for (const hand of DIGIT_BONES) for (const [k1, k2] of hand) for (const k of [k1, k2]) scale(k, s, s, s);
  }

  /** A bone at a joint, turned so its own x, y, z lie along these. */
  private set(k: number, at: Vector3, x: Vector3, y: Vector3, z: Vector3) {
    const b = this.bones[k];
    b.position.copy(at);
    b.quaternion.setFromRotationMatrix(MAT.makeBasis(x, y, z));
  }

  /**
   * A shoulder's own bone: at the joint, turned half way from where the arm is as built (on his chest) to
   * where it points now, with none of the arm's own twist. The cap of his shoulder and his armpit hang on
   * it, so an arm overhead, forward or at his side bends there in two gentle turns. (Both swings are taken
   * from an arm straight out to the side: the one way an arm never points is straight in through his chest.)
   * An arm let down below where it was built goes less of the way with it: the top of a shoulder stays where
   * it is over an arm that hangs (taken half way, its cap would swing out over the arm, a ball on his side).
   */
  private girdle(k: number, arm: number, side: 1 | -1, joint: Vector3, elbow: Vector3) {
    const chest = this.bones[B.chest].quaternion;
    const now = W3.copy(elbow).sub(joint).normalize().applyQuaternion(Q.copy(chest).invert());
    const out = E.set(side, 0, 0);
    QA.setFromUnitVectors(out, D.set(side * Math.sin(ARM_OUT), -Math.cos(ARM_OUT), 0));
    const lowered = -Math.cos(ARM_OUT) - now.y;
    const way = 0.5 - 0.2 * sstep(0, 0.18, lowered);
    QB.setFromUnitVectors(out, now)
      .slerp(QA, 1 - way)
      .multiply(QA.invert());
    const b = this.bones[k];
    b.position.copy(joint);
    b.quaternion
      .copy(chest)
      .multiply(QB)
      .multiply(Q.setFromAxisAngle(ZA, side * ARM_OUT));
    // (as thick as his arm is where it meets it; an arm let down draws the cap in over it a little, as its muscle lies flat)
    b.scale.copy(this.bones[arm].scale);
    b.scale.x *= 1 - 0.1 * sstep(0, 0.18, lowered);
    this.axilla(side, joint, QB);
  }

  /**
   * His armpit's own bone, under the shoulder's: turned as that one is (`swing`, in the chest's frame), but about the
   * hollow of his armpit (AXILLA), not the joint. The skin under the joint stays on his side as the arm goes up and
   * stretches from it to the arm (turned about the joint, it would swing out from his side, a shelf under an arm
   * raised overhead); an arm at his side, forward or across him turns it little, and it goes as the shoulder's.
   */
  private axilla(side: 1 | -1, joint: Vector3, swing: Quaternion) {
    const chest = this.bones[B.chest].quaternion;
    const b = this.bones[side > 0 ? B.axl : B.axr];
    b.quaternion
      .copy(chest)
      .multiply(swing)
      .multiply(Q.setFromAxisAngle(ZA, side * ARM_OUT));
    const { s } = this.pup.body;
    W3.set(-side * AXILLA[0] * s, -AXILLA[1] * s, 0);
    b.position.copy(joint).add(W3.sub(E.copy(W3).applyQuaternion(swing)).applyQuaternion(chest));
    b.scale.copy(this.bones[side > 0 ? B.cll : B.clr].scale);
  }

  /**
   * A hand's fingers and thumb as its shape is now (see Shape), each bone at its joint (DIGITS) off the hand's: a finger
   * spread at its knuckle and curled there and at its middle joint; the thumb turned toward the palm at its root and out
   * from the hand (or in across it), and bent at its middle knuckle.
   */
  private fingers(left: boolean) {
    const { s } = this.pup.body;
    const way = left ? -1 : 1;
    const hand = this.bones[left ? B.hal : B.har];
    const st = this.digits;
    const o = left ? 0 : SHAPE_N;
    const bones = DIGIT_BONES[left ? 0 : 1];
    for (let d = 0; d < 5; d++) {
      const [j1, j2] = DIGITS[d];
      const b1 = this.bones[bones[d][0]];
      const b2 = this.bones[bones[d][1]];
      b1.position
        .set(way * j1[0] * s, -j1[1] * s, j1[2] * s)
        .applyQuaternion(hand.quaternion)
        .add(hand.position);
      digitTurns(st, o, d, left, F1, F2);
      b1.quaternion.copy(hand.quaternion).multiply(F1);
      b2.position
        .set(way * (j2[0] - j1[0]) * s, -(j2[1] - j1[1]) * s, (j2[2] - j1[2]) * s)
        .applyQuaternion(b1.quaternion)
        .add(b1.position);
      b2.quaternion.copy(b1.quaternion).multiply(F2);
    }
  }

  /** The skin onto the puppet's joints. */
  place() {
    const p = this.pup;
    const j = p.j;
    const P = p.pose;
    const { s } = p.body;
    this.group.position.set(p.x, 0, p.z);
    this.group.rotation.y = p.yaw;
    const at = (k: number, v: Vector3) => v.set(j[k * 3], j[k * 3 + 1], j[k * 3 + 2]);

    // the hips: across the hip joints, upright but for the spine's lean
    X.copy(at(J.jl, A)).sub(at(J.jr, C)).normalize();
    Yv.set(p.up.x * 0.35, 1, p.up.z * 0.35).normalize();
    Z.crossVectors(X, Yv).normalize();
    Yv.crossVectors(Z, X);
    this.set(B.pelvis, at(J.hips, A), X, Yv, Z);
    const hipQ = this.bones[B.pelvis].quaternion;
    // the chest, and the head on it: turned and tipped as the pose has it
    X.set(p.left.x, p.left.y, p.left.z);
    Yv.set(p.up.x, p.up.y, p.up.z);
    Z.set(p.front.x, p.front.y, p.front.z);
    this.set(B.chest, at(J.chest, A), X, Yv, Z);
    const head = this.bones[B.head];
    head.position.copy(at(J.head, A));
    // (looking down, his neck bends from its foot as well as at his skull: his head comes forward as it tips, so his
    // chin goes down in front of his throat, not into it)
    const tip = Math.max(0, -P[I.nod]);
    if (tip > 0) head.position.addScaledVector(W3.set(p.front.x, p.front.y, p.front.z), NECK_BEND * tip * s);
    head.quaternion
      .copy(this.bones[B.chest].quaternion)
      .multiply(Q.setFromAxisAngle(UP, P[I.turn]))
      .multiply(Q.setFromAxisAngle(XA, -P[I.nod] * 0.8))
      // (and what his face does with his head: a nod, a shake, thrown back, tipped: see face, a frame ago)
      .multiply(this.tilt);
    // (his jaw and his nose go with his head: only their size is their own)
    for (const [k, from] of [
      [B.jaw, JAW_AT],
      [B.nose, NOSE_AT],
      [B.hair, HAIR_AT],
      [B.brow, BROW_AT],
      [B.lip, JAW_AT],
    ] as const) {
      const b = this.bones[k];
      b.position.copy(A.copy(from).multiply(head.scale).applyQuaternion(head.quaternion)).add(head.position);
      b.quaternion.copy(head.quaternion);
    }
    this.face(head);
    this.skin(head);
    // hair that hangs swings a beat behind him, as far as the puppet says the heavier of his loose things lags (in
    // his own frame, ft: behind him on a run, so its ends go back; to the side he came from on a slide)
    const lag = p.trailSlow;
    this.bones[B.hair].quaternion
      .multiply(Q.setFromAxisAngle(XA, Math.max(-0.4, Math.min(0.6, -lag.z * 0.32))))
      .multiply(Q.setFromAxisAngle(ZA, Math.max(-0.45, Math.min(0.45, lag.x * 0.32))));

    // arms and legs: each bone along its limb, turned so the joint folds the way it's folded
    const limb = (n: number, a: number, mid: number, end: number, b0: number, bend: 1 | -1) => {
      at(a, A);
      at(mid, C);
      at(end, D);
      const up = E.copy(C).sub(A).normalize();
      const low = Z.copy(D).sub(C).normalize();
      // the hinge: square to both halves (an elbow folds forward, a knee back); a straight limb keeps the last
      const h = X.crossVectors(up, low).multiplyScalar(bend);
      const bent = h.length();
      const keepH = this.hinge[n];
      if (bent > 0.06) keepH.lerp(h.multiplyScalar(1 / bent), Math.min(1, (bent - 0.06) * 6)).normalize();
      for (const [bone, from, dir] of [
        [b0, A, up],
        [b0 + 1, C, low],
      ] as const) {
        // (the bone's own y runs back up the limb)
        Yv.copy(dir).multiplyScalar(-1);
        X.copy(keepH).addScaledVector(Yv, -keepH.dot(Yv)).normalize();
        this.set(bone, from, X, Yv, W3.crossVectors(X, Yv));
      }
    };
    limb(0, J.sl, J.el, J.hl, B.ual, -1);
    limb(1, J.sr, J.er, J.hr, B.uar, -1);
    this.girdle(B.cll, B.ual, 1, at(J.sl, A), at(J.el, C));
    this.girdle(B.clr, B.uar, -1, at(J.sr, A), at(J.er, C));
    limb(2, J.jl, J.kl, J.fl, B.thl, 1);
    limb(3, J.jr, J.kr, J.fr, B.thr, 1);
    // hands go with their forearms, at the wrist as they hang, hold or let go (feet: below, each its own way on the floor)
    for (const [h, f, k] of HANDS_AT) {
      this.bones[h].position.copy(at(k, A));
      this.bones[h].quaternion.copy(this.bones[f].quaternion);
      const left = h === B.hal;
      const grip = Math.min(1, Math.max(0, P[left ? I.gl : I.gr]));
      const way = left ? -1 : 1;
      const one = p.one;
      // (the hand over a dribble keeps over it, the ball in the air or not: its palm down to it, its fingers spread)
      const drib = p.overBall === -way;
      const holds = drib ? Math.max(grip, DRIB_HOLDS) : grip;
      // what his hand is doing with nothing in it (see Shape): a gesture's, his move's, a pass or a shot let go of, out
      // for a pass; how a gesture turns its palm
      const gest = p.gesturing;
      const gh = gest ? GESTURE_HANDS[gest] : null;
      let free = gh?.[left ? 0 : 1] ?? null;
      const palm = free && gh ? gh[2] : PALM_AS;
      if (!free) {
        const c = CLIP_HANDS[p.clip];
        free = !c ? LOOSE : c instanceof Float32Array ? c : c[left ? 0 : 1];
        // (the buzzer's: his own pair of them)
        if (p.clip === 'celebrate' || p.clip === 'cheer') free = PARTY_HANDS[Math.floor(ownHand(p.me, 31) * PARTY_HANDS.length) % PARTY_HANDS.length][left ? 0 : 1];
        if (p.overBall && !drib) free = OPEN;
        if (one && one.tau > 0 && PASSED.has(one.id)) free = OPEN;
        if ((one && one.tau > 0 && FLICKED.has(one.id)) || p.following > 0.3) free = left ? GUIDE_OFF : GOOSE;
        if ((one?.id === 'catch' || one?.id === 'take') && one.tau < 0) free = CATCH;
        if (p.onRim) free = GRAB;
      }
      // a hand off the ball has a wrist: let hang, loose and a little bent toward the palm; a defender's turned to show
      // its palm (and a gesture's, as it turns it); a pass let go of snaps through, thumbs down; a shot let go of drops
      // over toward the rim (FLICK), its palm turned down to it. Turned about the forearm's own line, then bent toward
      // the palm (the bone's own z)
      const wi = left ? 0 : 2;
      const defends = DEFENDS.has(p.clip);
      let flex = defends || palm !== PALM_AS ? WRIST_SHOW : WRIST_LOOSE;
      // (how far the palm would turn to face the way he faces: from facing in, about the forearm)
      const fore0 = this.bones[f].quaternion;
      W3.set(p.front.x, p.front.y, p.front.z).applyQuaternion(Q.copy(fore0).invert());
      const toFront = Math.max(-SUP_MOST, Math.min(PRON_MOST, way * Math.atan2(-way * W3.z, way * W3.x)));
      let pron = palm === PALM_UP ? -SUP_MOST : palm === PALM_DOWN ? PRON_MOST * 0.85 : defends || palm === PALM_FRONT ? toFront : WRIST_PRON;
      const ease = 1 - Math.exp(-p.frameMs / WRIST_MS);
      this.wrists[wi] += (flex - this.wrists[wi]) * ease;
      this.wrists[wi + 1] += (pron - this.wrists[wi + 1]) * ease;
      flex = this.wrists[wi];
      pron = this.wrists[wi + 1];
      // (a pass let go of, and the shooting hand after a shot: from the release, on the move's own clock)
      if (one && one.tau > 0 && PASSED.has(one.id)) {
        const u = clamp01(one.tau / PASS_SNAP_IN) * (1 - clamp01((one.tau - PASS_SNAP_HOLD) / PASS_SNAP_OUT));
        const e = u * u * (3 - 2 * u);
        flex += (PASS_SNAP - flex) * e;
        pron += (PASS_PRON - pron) * e;
      }
      if (left && free === GUIDE_OFF) {
        // (the guide hand held off the ball: its palm still in toward the line the ball left on, where it lay on it,
        // and a little on toward the rim. Not turned to show its palm to the rim: that is a man with his hand up)
        W3.set(-0.85, 0, 0.5).applyQuaternion(Q.copy(fore0).invert());
        const toLine = Math.max(-SUP_MOST, Math.min(PRON_MOST, -Math.atan2(W3.z, -W3.x)));
        const e = Math.max(p.following, one && one.tau > 0 ? clamp01(one.tau / FLICK_IN) : 0);
        pron += (toLine - pron) * e;
        flex += (WRIST_LOOSE - flex) * e;
      }
      if (!left) {
        // (snapped over as the ball leaves it, and kept over for as long as his arm is held up after it: a wrist that
        // straightened on its own clock stood up straight on an arm still pointing at the rim. A shot whose arm is
        // not held (a hook, a floater) is let go of on that clock, his own)
        let u = 0;
        if (one && FLICKED.has(one.id) && one.tau > 0) u = clamp01(one.tau / FLICK_IN) * (1 - clamp01((one.tau - FLICK_HOLD * p.followHold) / FLICK_OUT));
        const e = Math.max(u * u * (3 - 2 * u), one && one.tau < FLICK_IN ? 0 : p.following);
        flex += (FLICK - flex) * e;
        // (its palm down the line the ball went on, the way he faces: his chest is turned from it as he shoots, and a
        // palm turned to where his chest faces waved at the sideline)
        W3.set(0, 0, 1).applyQuaternion(Q.copy(fore0).invert());
        const toRim = Math.max(-SUP_MOST, Math.min(PRON_MOST, Math.atan2(-W3.z, W3.x)));
        pron += (toRim - pron) * e;
      }
      flex = Math.max(-EXT_MOST, Math.min(FLEX_MOST, flex));
      this.bones[h].quaternion.multiply(Q.setFromAxisAngle(UP, way * pron)).multiply(Q.setFromAxisAngle(ZA, way * flex));
      const hold = CLIPS[p.clip].grip;
      if (holds > 0.02) {
        // a hand on the ball lies on it: its palm toward the ball (beside it, under it or over it, as the
        // puppet holds it), its fingers on along the forearm as far as that lets them (up from it on the ball's side,
        // and out for a pass: his thumbs behind it)
        const ball = this.ball;
        // (toward the ball itself where the scene has said where it is, in his own frame; a dribble's hand with the ball
        // off it, down at the floor: it waits over it, it isn't wrung round after it)
        let far = HOLD_FAR * s;
        if (drib && grip < 0.5) W3.set(0, -1, 0);
        else if (ball) {
          W3.set(ball.x - p.x, ball.y, ball.z - p.z)
            .applyAxisAngle(UP, -p.yaw)
            .sub(this.bones[h].position);
          far = W3.length();
          W3.normalize();
        } else if (hold === 'top') W3.set(0, -1, 0);
        else if (hold === 'under' && !left) W3.set(p.up.x + p.front.x, p.up.y + p.front.y, p.up.z + p.front.z).normalize();
        else W3.set(p.left.x, p.left.y, p.left.z).multiplyScalar(way);
        const fore = E.set(0, -1, 0).applyQuaternion(this.bones[f].quaternion);
        const up = (one?.id === 'catch' || one?.id === 'take') && one.tau < 0 ? CATCH_UP : hold === 'side' && !drib ? SIDE_UP : 0;
        if (up > 0) {
          // (on its side, and out for a pass: its fingers up the ball from his forearm's line, and its palm square to them
          // toward the ball's middle: the wrist is down the ball from the palm, see the puppet's SIDE_GRIP)
          fore.addScaledVector(D.set(p.up.x, p.up.y, p.up.z), up).normalize();
          W3.addScaledVector(fore, -W3.dot(fore));
          if (W3.lengthSq() < 0.04) W3.set(p.left.x, p.left.y, p.left.z).multiplyScalar(way);
          W3.normalize();
        } else {
          // (over it or under it: its fingers on along the forearm as far as that lets them, and the hand tipped onto
          // the ball about its wrist until its palm lies on the leather, not the wrist on it with the palm and fingers
          // going off it in a flat plane: the ball's middle a palm's depth and the ball's size out from the palm, a
          // little way on from the wrist toward the fingers. A wrist nearer the ball than that has its hand put out)
          fore.addScaledVector(W3, -fore.dot(W3));
          if (fore.lengthSq() < 0.04) fore.set(p.front.x, p.front.y, p.front.z).addScaledVector(W3, -(p.front.x * W3.x + p.front.y * W3.y + p.front.z * W3.z));
          fore.normalize();
          const lie = BALL_R + PALM_DEEP * s;
          const back = Math.max(TIP_MOST, Math.min(1, lie / Math.max(far, 1e-3)));
          const tip = Math.sqrt(1 - back * back);
          if (far < lie) this.bones[h].position.addScaledVector(W3, -Math.min(PUT_OUT * s, lie - far) * grip);
          D.copy(W3).multiplyScalar(back).addScaledVector(fore, -tip);
          fore.multiplyScalar(back).addScaledVector(W3, tip);
          W3.copy(D);
        }
        Yv.copy(fore).normalize().multiplyScalar(-1);
        X.copy(W3).multiplyScalar(way);
        this.bones[h].quaternion.slerp(Q.setFromRotationMatrix(MAT.makeBasis(X, Yv, Z.crossVectors(X, Yv))), holds);
        // (the puppet's hand on the ball's side is its wrist, out a little past a palm's depth off the ball: the palm
        // itself goes on to the leather; over it or under it, tipped onto it, the palm is on it already)
        if (up > 0) this.bones[h].position.addScaledVector(W3, SIDE_IN * s * grip);
        // (a dribble's wrist: cocked back as the ball comes up into it, over it as it pushes it down, on after it as
        // it goes, and back for the next: see DRIB_CATCH)
        if (drib && p.push >= 0) {
          const u = p.push;
          const bend =
            u < 1
              ? DRIB_CATCH + (DRIB_PUSH - DRIB_CATCH) * sstep(0, 1, u)
              : u < 1.3
                ? DRIB_PUSH + (DRIB_AFTER - DRIB_PUSH) * sstep(1, 1.3, u)
                : u < 1.8
                  ? DRIB_AFTER + (DRIB_WAIT - DRIB_AFTER) * sstep(1.3, 1.8, u)
                  : DRIB_WAIT + (DRIB_CATCH - DRIB_WAIT) * sstep(1.8, 2, u);
          this.bones[h].quaternion.multiply(Q.setFromAxisAngle(ZA, way * bend));
        }
      }
      // (whatever turned it, on the ball or off it: no further than a forearm turns and a wrist bends, see limitWrist)
      limitWrist(this.bones[f].quaternion, this.bones[h].quaternion, way);
      // his forearm turns with his hand: the part of the hand's turn that is about the forearm's own line, most of it
      // (the rest is the wrist's)
      const fw = this.bones[left ? B.fwl : B.fwr];
      const fore = this.bones[f];
      QA.copy(fore.quaternion).invert().multiply(this.bones[h].quaternion);
      const twist = Math.hypot(QA.y, QA.w);
      if (twist > 1e-6) QA.set(0, QA.y / twist, 0, QA.w / twist);
      else QA.identity();
      fw.position.copy(fore.position);
      fw.quaternion.copy(fore.quaternion).multiply(QB.identity().slerp(QA, 0.7));
      fw.scale.copy(fore.scale);
      // his fingers and thumb: the hand's shape eased toward what it is doing (see Shape), a hand on the ball's by how it holds it
      const on = hold === 'top' ? TOP : hold === 'under' ? (left ? GUIDE : SHOOT) : BALL;
      const st = this.digits;
      const o = left ? 0 : SHAPE_N;
      const se = 1 - Math.exp(-p.frameMs / SHAPE_MS);
      // (a free hand his own and alive: see HAND_OWN. Not a hand on the ball, nor one a gesture has shaped)
      this.handMs += p.frameMs / 2;
      const own = gest ? 0 : 1 - holds;
      const work = Math.sin((this.handMs / HAND_LIFE_MS) * 6.283 * (0.8 + 0.4 * ownHand(p.me, o + 40)) + 6.283 * ownHand(p.me, o + 41));
      for (let i = 0; i < SHAPE_N; i++) {
        // (his fingers' joints only: less the more shut they are, a fist stays one)
        const loose = i < 8 ? own * Math.max(0.15, 1 - free[i] / 1.4) : 0;
        const mine = loose * ((ownHand(p.me, o + i) - 0.5) * 2 * HAND_OWN + work * HAND_LIFE * (0.5 + ownHand(p.me, o + i + 20)));
        st[o + i] += (Math.max(0, free[i] + mine) + (on[i] - free[i]) * holds - st[o + i]) * se;
      }
      this.fingers(left);
    }
    // (each foot points where the puppet has it on the floor, which isn't always the way he faces: a planted foot keeps
    // its own heading as his body turns over it; and rolls as the puppet says, heel to toe)
    for (const [f, k, n] of [
      [B.ftl, J.fl, 0],
      [B.ftr, J.fr, 1],
    ] as const) {
      const foot = p.feet[n];
      this.bones[f].position.copy(at(k, A));
      this.bones[f].quaternion.setFromAxisAngle(UP, foot.turn).multiply(Q.setFromAxisAngle(XA, Math.max(-0.4, Math.min(1.1, foot.pitch))));
    }

    // cloth: each leg of the shorts hangs from its thigh, and trails as far as the puppet says his loose things do
    // (the puppet's own clock: a replay at half speed swings them at half speed). It never stretches far.
    const far = Math.hypot(p.trail.x, p.trail.y, p.trail.z);
    const give = Math.min(1, (0.22 * s) / Math.max(1e-6, far * 0.3)) * 0.3;
    // (the vest is tucked in: its bone stays with his hips)
    this.bones[B.hem].position.copy(this.bones[B.pelvis].position);
    this.bones[B.hem].quaternion.copy(hipQ);
    for (const [bone, th, a, k] of [
      [B.hemL, B.thl, J.jl, J.kl],
      [B.hemR, B.thr, J.jr, J.kr],
    ] as const) {
      at(a, A).lerp(at(k, E), (THIGH - 0.7) / THIGH);
      this.bones[bone].position.set(A.x + p.trail.x * give, A.y + p.trail.y * give * 0.5, A.z + p.trail.z * give);
      this.bones[bone].quaternion.copy(this.bones[th].quaternion);
    }

    this.shadow.position.set(p.x, 0.03, p.z);
    this.ring.position.set(p.x, 0.045, p.z);
  }

  /**
   * Seen close (a replay, a cut to him, a still): his mesh split finer, its outline on the curves of his skin and his kit
   * (see smooth.ts), made the first time it's asked for and kept; or back to the model's own. `forget`: let it go.
   */
  near(on: boolean) {
    if (!this.mesh || !this.base) return;
    if (on && !this.fine) this.fine = smoothed(this.base);
    const want = (on && this.fine) || this.base;
    if (this.mesh.geometry !== want) this.mesh.geometry = want;
  }
  /** Whether he has his finer mesh made (see near). */
  get smooth(): boolean {
    return !!this.fine;
  }
  farOff() {
    this.near(false);
    this.fine?.dispose();
    this.fine = null;
  }

  /**
   * A device that can't keep up: his far body, and close to the camera his full one in his plain material (no cloth's
   * sheen, no knit up close, no fuzz or bands); or back to the full one.
   */
  lite(on: boolean) {
    if (!this.mats || !this.textures) return;
    if (on && !this.mats[1]) {
      this.mats[1] = stuffMaterial(this.textures[0], this.textures[1], this.told, true, false, this.relief);
      this.own.push(this.mats[1]);
    }
    this.plain = on;
    this.bodies();
  }

  dispose() {
    this.gone = true;
    for (const o of this.own) o.dispose();
    this.fine?.dispose();
    // (what the game did to his skin goes with him: a man with none has nothing to keep)
    if (!this.mesh) return;
    const w = this.told.uWorn.value;
    WORN.delete(this.who);
    if (WORN.size >= WORN_KEPT) WORN.delete(WORN.keys().next().value!);
    WORN.set(this.who, { wet: w.x, flush: w.y, tired: w.z, at: performance.now() / 1000 });
  }

  /**
   * Where in the game his face is this frame (the scene says, before place): the possession `of` and how far into it
   * (the script's ms). Live, his face is kept on that clock as it goes (see TAPE_N); `replay`: an instant replay has
   * the picture at that moment, and his face is the one he had then (what the moment gave him, his eyes, his blinks,
   * his head's own moves, his talk), not the one he has now. Nothing new comes to his face while a replay has it.
   */
  when(of: object | null, ms: number, replay = false) {
    this.of = of;
    this.ms = ms;
    this.replaying = replay;
  }

  /**
   * A moment of the game that shows on his face (see FEELS): a basket of his ('joy'; a 'shout' for a big one), a miss,
   * the ball taken from him or thrown away ('stung'), a whistle on him ('disbelief'), his shot sent back ('stunned'),
   * a hard knock ('wince'), the man who fouled him ('glare'), a breath let out ('exhale'). `power` (0..1): how big a
   * moment it is for him; how much of it shows is his own (Look.temper), and the game's (stakes). It comes on a beat
   * after (REACT_AFTER, and `after` s more), each man in his own time. One already showing more than this would is not
   * cut short by it.
   */
  feel(kind: Feel, power = 1, after = 0) {
    if (this.replaying) return;
    const r = this.eyeRng;
    const t = this.clock;
    const k = Math.min(1, clamp01(power) * (0.45 + 0.65 * this.look.temper) * (0.85 + 0.25 * r()) * (1 + STAKES_K * this.stakes));
    const now = this.feelWay ? this.shows(t) * this.feelK : 0;
    if (now > k) return;
    const run = FEELS[kind];
    // (his way of showing it: a man who grins grins (a cool one smirks at a lesser basket), but a big one makes a
    // shouter of most men; any other, by the roll)
    const roll = r();
    const w =
      kind === 'joy'
        ? roll < this.look.grin * (1.25 - 0.6 * power)
          ? power < 0.8 && r() < 0.6 * (1 - this.look.temper)
            ? 2
            : 0
          : 1
        : Math.floor(roll * run.ways.length) % run.ways.length;
    // (a knock's wince is as long as it was hard; anything else a little longer or shorter, by the man and the game)
    const hold = run.hold * (kind === 'wince' ? 0.5 + power : (0.8 + 0.4 * r()) * (1 + STAKES_HOLD * this.stakes));
    // (a beat after the moment, each man in his own time; at once from a face already showing something)
    this.start(kind, run.ways[w], k, t + (now > 0.05 ? 0 : after + REACT_AFTER[0] + REACT_AFTER[1] * r()), hold);
  }

  /** A feeling on his face from `at` (s): its way, how strongly, how long it holds; what it turns into, if anything, and his head's move with it. */
  private start(kind: Feel, w: Way, k: number, at: number, hold: number) {
    const r = this.eyeRng;
    const run = FEELS[kind];
    // (what was showing isn't taken off his face in a frame: it goes off over its own fall as the new one comes on)
    const was = this.feelWay ? this.shows(this.clock) * this.feelK : 0;
    if (this.feelWay && was > 0.02) {
      this.fadeFace = this.feelWay.face;
      this.fadeK = was;
      this.fadeAt = this.clock;
      this.fadeLen = FEELS[this.feelKind].fall;
    }
    this.feelKind = kind;
    this.feelWay = w;
    this.feelK = k;
    this.feelAt = at;
    this.feelHold = hold;
    this.feelThen = run.then && r() < (run.odds ?? 1) ? run.then : null;
    // (a one-sided look on the side he favours, mostly; never moved over while one is still showing)
    if (this.mien[F.lop] < 0.05) this.lopSide = r() < 0.75 ? this.favours : -this.favours;
    if (this.mien[F.cock] < 0.05) this.cockSide = r() < 0.75 ? this.favours : -this.favours;
    if (w.head) this.move(w.head, k, at + w.at);
  }

  /** How much of what a moment gave him shows at `t` (s), over its run: on, held, off. */
  private shows(t: number): number {
    const run = FEELS[this.feelKind];
    const s = t - this.feelAt;
    return sstep(0, run.rise, s) * (1 - sstep(run.rise + this.feelHold, run.rise + this.feelHold + run.fall, s));
  }

  /** A move of his head (see HEAD_MOVES): a nod on a five, a shake at a bad call. `k` (0..1): how big; `after`: so long from now (s). */
  nod(kind: HeadMove, k = 1, after = 0) {
    if (this.replaying) return;
    this.move(kind, k, this.clock + after);
  }

  /** A move of his head from `at` (s); one already going is let finish first (never cut off in the middle of a swing), and a beat on a word isn't made over one. */
  private move(kind: HeadMove, k: number, at: number) {
    const was = HEAD_MOVES[this.moveKind];
    const end = this.moveAt + was[1] * was[2];
    if (end > this.clock && this.moveAt <= this.clock) {
      if (kind === 'beat') return;
      at = Math.max(at, end);
    }
    this.moveKind = kind;
    this.moveAt = at;
    this.moveK = (0.6 + 0.4 * clamp01(k)) * (0.85 + 0.3 * this.eyeRng());
  }

  /** A glance of his eyes alone at a point (the scene's), for `ms` of his own time: his head stays on what it is on. One he would have to turn his head for isn't made. */
  peek(x: number, y: number, z: number, ms: number) {
    if (this.replaying) return;
    this.peekAt.x = x;
    this.peekAt.y = y;
    this.peekAt.z = z;
    this.peekTill = this.clock + ms / 1000;
  }

  /** A knock (Puppet.hit's power): a hard enough one shuts his eyes a beat (a wince is the scene's: see feel). */
  jolt(power: number) {
    if (this.replaying || power < BLINK_KNOCK || this.clock - this.blinkAt < 0.3) return;
    this.blinkNext = this.clock;
  }

  /**
   * His face, as the rest of him has it now (place has just put his head): his eyes on what he looks at, his lids and
   * his blink, his jaw, his mouth's shape, his brows, his head's own moves. On his own clock (see clock); in a replay,
   * the face he had at its moment if it was kept (see when).
   */
  private face(head: Bone) {
    const step = Math.max(0, this.pup.frameMs) / 1000;
    this.clock += step;
    if (!(this.replaying && this.played(this.ms))) this.live(head, Math.min(0.1, step));
    this.show(head);
    if (!this.replaying) this.keep();
  }

  /**
   * His face as he lives it, into this frame's row. What is asked of each channel is the most any of these asks: the
   * moment (in the air, at the top of his effort, his mouth comes open and his brows down), his own face as he guards
   * a man or shoots (harder in a close one, looser in a blowout), his breath once he's spent (sooner late in the game),
   * a gesture's face (a roar bares his teeth; a man protesting, calling or asking is talking: VISEMES), and what a
   * moment of the game gave him (see feel); then each eases to it.
   */
  private live(head: Bone, dt: number) {
    const p = this.pup;
    const P = p.pose;
    const t = this.clock;
    const one = p.one;
    const shooting = one !== null && SHOTS.has(one.id) && one.tau < SHOT_STILL;
    const look = this.look;
    const want = this.want;
    const r = this.eyeRng;
    const air = clamp01(P[I.air]);
    want.fill(0);
    want[F.jaw] = 0.3 * air;
    want[F.frown] = 0.6 * air;
    want[F.squint] = 0.4 * air;
    const stakes = this.stakes;
    const resting = RESTING.has(p.clip);
    const own = shooting ? (SET_SHOTS.has(one.id) ? FOCUS : null) : GUARDING.has(p.clip) ? SET : null;
    if (own) for (let c = 0; c < CHANNELS; c++) want[c] = Math.max(want[c], own[c] * (0.5 + 0.5 * look.temper) * (1 + 0.35 * stakes));
    if (stakes > 0 && !resting) for (let c = 0; c < CHANNELS; c++) want[c] = Math.max(want[c], CLUTCH[c] * stakes);
    const spent = sstep(PANT[0], 1, Math.max(p.effort, WEAR_SPENT * this.wear));
    if (spent > 0) {
      const breath = 0.5 + 0.5 * Math.sin(p.breath * Math.PI * 2);
      want[F.jaw] = Math.max(want[F.jaw], spent * PANT[1] * (0.5 + 0.5 * breath));
      want[F.part] = Math.max(want[F.part], spent * PANT[2]);
      if (resting) want[F.heavy] = 0.7 * spent;
    }
    // a gesture's face, and his talk as he makes it: a word at a time, from the start of it
    const gest = p.gesturing;
    if (gest !== this.gestWas) {
      this.gestWas = gest;
      this.gestAt = t;
      this.vis = QUIET;
      this.visTill = t;
      this.sylLeft = 0;
    }
    const g = FACE_OF[gest ?? ''];
    const talk = g ? g.talk : 0;
    if (g && (g.for === undefined || t - this.gestAt < g.for)) for (let c = 0; c < CHANNELS; c++) want[c] = Math.max(want[c], g.face[c]);
    if (talk > 0) {
      this.talk(talk, t);
      const v = VISEMES[this.vis];
      const loud = LOUD_LEAST + (1 - LOUD_LEAST) * talk;
      for (let c = 0; c < CHANNELS; c++) want[c] = Math.max(want[c], v[c] * loud);
    }
    if (this.feelWay) {
      const run = FEELS[this.feelKind];
      const s = t - this.feelAt;
      const k = this.shows(t) * this.feelK;
      const f = this.feelWay.face;
      for (let c = 0; c < CHANNELS; c++) want[c] = Math.max(want[c], f[c] * k);
      // (held: it goes off, or turns into what it turns into)
      if (this.feelThen && s > run.rise + this.feelHold) {
        const next = FEELS[this.feelThen];
        this.start(this.feelThen, next.ways[Math.floor(r() * next.ways.length) % next.ways.length], this.feelK, t, next.hold * (0.8 + 0.4 * r()));
      } else if (s > run.rise + this.feelHold + run.fall) this.feelWay = null;
    }
    if (this.fadeFace) {
      const k = this.fadeK * (1 - sstep(0, this.fadeLen, t - this.fadeAt));
      const f = this.fadeFace;
      if (k > 0) for (let c = 0; c < CHANNELS; c++) want[c] = Math.max(want[c], f[c] * k);
      else this.fadeFace = null;
    }
    // (a smile takes the press and the grimace out of his mouth, lips pressed aren't apart, and an open jaw can't
    // press them; wide eyes aren't narrowed, nor heavy; cheeks blown out hold his lips together, and lips rounded
    // aren't stretched or smiling)
    want[F.press] *= 1 - want[F.smile];
    want[F.grim] *= 1 - want[F.smile];
    want[F.part] *= 1 - want[F.press];
    want[F.press] *= 1 - want[F.jaw];
    want[F.squint] *= 1 - want[F.wide];
    want[F.heavy] *= clamp01(1 - 2 * Math.max(want[F.wide], want[F.shut]));
    want[F.part] *= 1 - 0.8 * want[F.puff];
    want[F.jaw] *= 1 - want[F.puff];
    want[F.stretch] *= 1 - want[F.round];
    want[F.smile] *= 1 - 0.7 * want[F.round];
    const m = this.mien;
    const vel = this.mienV;
    for (let c = 0; c < CHANNELS; c++) {
      follow(m[c], vel[c], want[c], SPRING_K * CH_RATE[c] * (talk > 0 && TALKS[c] ? TALK_QUICK : 1), dt, FOLLOWED);
      // (never below nothing: a shape the other way is another shape)
      m[c] = Math.max(0, FOLLOWED[0]);
      vel[c] = m[c] > 0 ? FOLLOWED[1] : Math.max(0, FOLLOWED[1]);
    }

    // his eyes: on the thing he looks at (the puppet's), from where they are in his head as it is turned now, or
    // glancing at something else for a moment (see peek); with nothing to look at, or a thing behind him, they are
    // where his head is going, ahead of it as it turns. They flick to a new thing quicker than his head comes round,
    // and are carried with it while his head comes after (they stay on it, through a nod or a shake too); about it
    // they rest on one spot then another, but never as he shoots
    const heading = p.yaw + P[I.twist] + P[I.turn];
    if (Number.isNaN(this.headWas)) this.headWas = heading;
    const turned = Math.atan2(Math.sin(heading - this.headWas), Math.cos(heading - this.headWas));
    this.headWas = heading;
    if (dt > 0) this.headRate += (turned / dt - this.headRate) * (1 - Math.exp(-dt * 12));
    let gx = 0;
    let gy = 0;
    let on = false;
    let far = p.lookFar;
    const aim = this.sighted;
    if (t < this.peekTill) {
      const pk = this.peekAt;
      this.sight(head, pk.x, pk.y, pk.z);
      if (Math.abs(aim[0]) < EYE_REACH[0] && aim[1] < EYE_REACH[1] && aim[1] > EYE_REACH[2]) {
        gx = aim[0];
        gy = aim[1];
        far = aim[2];
        on = true;
      } else this.peekTill = -1;
    }
    if (!on && Number.isFinite(p.lookFar)) {
      this.sight(head, p.seen.x, p.seen.y, p.seen.z);
      gx = aim[0];
      gy = aim[1];
      on = Math.abs(gx) < 1.4;
    }
    if (!on) {
      gx = Math.max(-0.35, Math.min(0.35, this.headRate * EYE_LEAD));
      gy = Math.max(-0.2, Math.min(0.25, 0.2 * P[I.nod]));
    }
    gx = Math.max(-EYE_REACH[0], Math.min(EYE_REACH[0], gx));
    gy = Math.max(EYE_REACH[2], Math.min(EYE_REACH[1], gy));
    const fresh = on !== this.onIt || Math.hypot(gx - this.goal[0], gy - this.goal[1]) > SACCADE;
    if (on && !fresh) {
      this.eye[0] += gx - this.goal[0];
      this.eye[1] += gy - this.goal[1];
    }
    const whip = Math.abs(this.headRate) > BLINK_WHIP;
    if (((fresh && on) || (whip && !this.whipped)) && !shooting && t - this.blinkAt > 1 && r() < BLINK_SHIFT) this.blinkNext = t;
    this.whipped = whip;
    this.goal[0] = gx;
    this.goal[1] = gy;
    this.onIt = on;
    if (fresh || t > this.fixAt) {
      const spread = on ? FIX_ON : FIX_SPREAD;
      this.fix[0] = fresh && on ? 0 : (r() - 0.5) * spread[0];
      this.fix[1] = fresh && on ? 0 : (r() - 0.5) * spread[1];
      this.fixAt = t + FIXES[0] + (FIXES[1] - FIXES[0]) * r() ** 2;
    }
    const flick = 1 - Math.exp(-dt * SACCADE_RATE);
    this.eye[0] += (gx + (shooting ? 0 : this.fix[0]) - this.eye[0]) * flick;
    this.eye[1] += (gy + (shooting ? 0 : this.fix[1]) - this.eye[1]) * flick;
    this.eye[0] = Math.max(-EYE_REACH[0], Math.min(EYE_REACH[0], this.eye[0]));
    this.eye[1] = Math.max(EYE_REACH[2], Math.min(EYE_REACH[1], this.eye[1]));
    // (and they turn in on the thing as far as it is near: quickly, as eyes do, but never in a frame)
    this.verge += (eyeIn(on ? far : EYE_IDLE) - this.verge) * (1 - Math.exp(-dt * 10));

    // his blink: in his own time, sooner the harder he's going; now and then a half one, or two together; as his eyes
    // go to a new thing or his head whips round (above), or a knock jolts him (see jolt); never as he shoots, nor with
    // his eyes already shut tight
    if (shooting || m[F.shut] > 0.5) this.blinkNext = Math.max(this.blinkNext, t + 0.25);
    if (t >= this.blinkNext) {
      this.blinkAt = t;
      this.blinkK = r() < BLINK_HALF ? 0.45 + 0.25 * r() : 1;
      this.blinkTwice = r() < BLINK_TWICE;
      this.blinkNext = t + (this.blinkGap * (0.5 + 1.2 * r())) / (1 + 0.8 * p.effort);
    }
    let since = t - this.blinkAt;
    const span = BLINK[0] + BLINK[1] + BLINK[2];
    if (this.blinkTwice && since > span + 0.05) {
      this.blinkAt = t;
      this.blinkTwice = false;
      since = 0;
    }
    const lid = since < BLINK[0] ? sstep(0, BLINK[0], since) : 1 - sstep(BLINK[0] + BLINK[1], span, since);

    // his head's own moves: a nod, a shake, a beat on a word (in and out over the first and last of it); thrown back;
    // tipped a little to the side of a raised brow
    let nod = 0;
    let shake = 0;
    const mv = HEAD_MOVES[this.moveKind];
    const into = t - this.moveAt;
    const long = mv[1] * mv[2];
    if (into > 0 && into < long) {
      const u = into / long;
      const env = this.moveK * mv[0] * sstep(0, 0.15, u) * (1 - sstep(0.75, 1, u));
      const ph = (into / mv[1]) * Math.PI * 2;
      if (this.moveKind === 'shake') shake = env * Math.sin(ph);
      else nod = env * 0.5 * (1 - Math.cos(ph));
    }

    const row = this.row;
    row[0] = this.ms;
    for (let c = 0; c < CHANNELS; c++) row[1 + c] = m[c];
    row[T_BLINK] = since >= 0 && since < span ? lid * this.blinkK : 0;
    row[T_EYE] = this.eye[0];
    row[T_EYE + 1] = this.eye[1];
    row[T_EYE + 2] = this.verge;
    row[T_HEAD] = nod - HEAD_BACK * m[F.back];
    row[T_HEAD + 1] = shake;
    row[T_HEAD + 2] = HEAD_TIP * m[F.cock] * this.cockSide;
    row[T_SIDE] = this.lopSide;
    row[T_SIDE + 1] = this.cockSide;
  }

  /** Where a point (the scene's) is from his eyes, as his head is turned now: across and up (radians) and how far (ft), into `sighted`. */
  private sight(head: Bone, x: number, y: number, z: number) {
    const p = this.pup;
    const eyes = E.copy(EYES_AT).multiply(head.scale).applyQuaternion(head.quaternion).add(head.position);
    W3.set(x - p.x, y, z - p.z)
      .applyAxisAngle(UP, -p.yaw)
      .sub(eyes)
      .applyQuaternion(Q.copy(head.quaternion).invert());
    this.sighted[0] = Math.atan2(W3.x, W3.z);
    this.sighted[1] = Math.atan2(W3.y, Math.hypot(W3.x, W3.z));
    this.sighted[2] = W3.length();
  }

  /**
   * His mouth as he talks (see VISEMES): a word's syllables one after another, no two the same in a row, then a beat
   * with his mouth just apart, then the next word (a hard one with his head: a beat).
   */
  private talk(loud: number, t: number) {
    if (t < this.visTill) return;
    const r = this.eyeRng;
    if (this.sylLeft <= 0 && this.vis !== QUIET) {
      this.vis = QUIET;
      this.visTill = t + WORD_GAP[0] + (WORD_GAP[1] - WORD_GAP[0]) * r();
      return;
    }
    if (this.sylLeft <= 0) {
      this.sylLeft = WORD[0] + Math.floor(r() * (WORD[1] - WORD[0] + 1));
      if (r() < 0.4 * loud) this.move('beat', loud, t);
    }
    this.sylLeft--;
    const u = r();
    let v = 0;
    while (v < 3 && u > VISEME_ODDS[v]) v++;
    if (v === this.vis) v = (v + 1 + Math.floor(r() * 3)) % 4;
    this.vis = v;
    this.visTill = t + SYLLABLE[0] + (SYLLABLE[1] - SYLLABLE[0]) * r();
  }

  /**
   * What a frame's face (the row: see TAPE_K) makes of his lids, his mouth, his jaw, his brows and his head (see EYES,
   * FACE_MOVE). His lids: the upper one up as he stares, down as he narrows his eyes, smiles or tires; the lower one
   * up as he narrows them or his cheeks come up under them; shut tight, they are shut as in a blink.
   */
  private show(head: Bone) {
    const row = this.row;
    const m = this.shown;
    const told = this.told;
    told.uGaze.value.set(EYE_TURN[0] * Math.sin(row[T_EYE]), EYE_TURN[1] * Math.sin(row[T_EYE + 1]), row[T_EYE + 2]);
    told.uBlink.value = Math.max(row[T_BLINK], m[F.shut]);
    told.uLid.value.set(0.02 * m[F.wide] - 0.011 * m[F.squint] - 0.014 * m[F.heavy] - 0.004 * m[F.smile], 0.013 * m[F.squint] + 0.008 * m[F.smile] - 0.003 * m[F.wide]);
    told.uMove.value.set(m[F.smile], m[F.grim], m[F.press], m[F.snarl]);
    told.uMove2.value.set(m[F.part], Math.max(m[F.smile], 0.5 * m[F.squint], 0.6 * m[F.snarl]), 0, 0);
    told.uMove3.value.set(m[F.round], m[F.puff], m[F.stretch], m[F.lop] * row[T_SIDE]);
    // (his teeth are in the dark behind his lips till they come apart: a little behind lips just apart, most in a grin)
    told.uMouth.value = Math.max(m[F.jaw], 0.5 * m[F.part] * (1 + m[F.smile] + 0.5 * m[F.stretch]), 0.9 * m[F.snarl]);
    // (his jaw swings about its hinge by his ear, not about where it is scaled from)
    const jaw = this.bones[B.jaw];
    Q.setFromAxisAngle(XA, this.sealed ? 0 : JAW_SWING * m[F.jaw]);
    jaw.position.copy(A.copy(JAW_AT).sub(JAW_HINGE).applyQuaternion(Q).add(JAW_HINGE).multiply(head.scale).applyQuaternion(head.quaternion)).add(head.position);
    jaw.quaternion.multiply(Q);
    this.bones[B.lip].position.copy(jaw.position);
    this.bones[B.lip].quaternion.copy(jaw.quaternion);
    // (his brows: down, a little forward and drawn together, or up and a little apart, or one up and the other not;
    // a heavier brow sits further forward all the time)
    const brow = this.bones[B.brow];
    const hs = head.scale.z;
    const cock = m[F.cock];
    brow.position.add(
      A.set(0, -0.024 * m[F.frown] + BROW_UP * (m[F.raise] + 0.5 * cock), 0.006 * m[F.frown] + 0.012 * (this.look.face.ridge - 0.45))
        .multiplyScalar(hs)
        .applyQuaternion(head.quaternion),
    );
    if (cock > 0.001) brow.quaternion.multiply(Q.setFromAxisAngle(ZA, BROW_COCK * cock * row[T_SIDE + 1]));
    brow.scale.x = head.scale.x * (1 - 0.08 * m[F.frown] + 0.025 * m[F.raise]);
    // (and his head's own moves, for place to lay over where he looks next frame)
    this.tilt.setFromEuler(EU.set(row[T_HEAD], row[T_HEAD + 1], row[T_HEAD + 2], 'YXZ'));
  }

  /** This frame's face onto the tape (see TAPE_N), at most every TAPE_STEP ms of the possession; a new possession, or one gone back, starts it again. */
  private keep() {
    const of = this.of;
    if (!of) return;
    const tape = (this.tape ??= new Float32Array(TAPE_N * TAPE_K));
    const last = this.tapeN > 0 ? tape[((this.tapeHead + TAPE_N - 1) % TAPE_N) * TAPE_K] : -Infinity;
    if (of !== this.tapeOf || this.ms < last - 1) {
      this.tapeOf = of;
      this.tapeN = 0;
      this.tapeHead = 0;
    } else if (this.ms - last < TAPE_STEP) return;
    tape.set(this.row, this.tapeHead * TAPE_K);
    this.tapeHead = (this.tapeHead + 1) % TAPE_N;
    this.tapeN = Math.min(TAPE_N, this.tapeN + 1);
  }

  /** The `j`th of the samples kept, oldest first: where it starts on the tape. */
  private slot(j: number): number {
    return ((this.tapeHead - this.tapeN + j + 2 * TAPE_N) % TAPE_N) * TAPE_K;
  }

  /** His face at `ms` of the possession, as it was kept (eased between the two samples about it), into this frame's row; false if it wasn't. */
  private played(ms: number): boolean {
    const tape = this.tape;
    const n = this.tapeN;
    if (!tape || this.tapeOf !== this.of || n < 2 || ms < tape[this.slot(0)] || ms > tape[this.slot(n - 1)] + TAPE_OVER) return false;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tape[this.slot(mid)] <= ms) lo = mid;
      else hi = mid - 1;
    }
    const a = this.slot(lo);
    const b = this.slot(Math.min(n - 1, lo + 1));
    const u = tape[b] > tape[a] ? clamp01((ms - tape[a]) / (tape[b] - tape[a])) : 0;
    for (let k = 0; k < TAPE_K; k++) this.row[k] = tape[a + k] + (tape[b + k] - tape[a + k]) * u;
    return true;
  }

  /**
   * What the game does to his skin, once his face is set (see face): going hard he gets wet with sweat (the harder, the
   * quicker; some men more than others: Look.sweat) and his face flushes; stood at a dead ball both ease off, slowly; his
   * eyes tire as he is spent and has been at it a while. And the lines his face makes as it moves (CREASE_DEEP: his brows,
   * his eyes), from his face as it is now; and his head's turn in the world, for his eyes' round. On his body's clock.
   */
  private skin(head: Bone) {
    const p = this.pup;
    const dt = Math.min(0.1, p.frameMs / 1000);
    const told = this.told;
    const w = told.uWorn.value;
    const going = p.effort;
    const sweat = this.look.sweat;
    w.x = RESTING.has(p.clip) && going < 0.15 ? w.x * Math.exp(-dt * WET_DOWN) : w.x + (1 - w.x) * (1 - Math.exp(-dt * WET_UP * sweat * (0.25 + going)));
    const flush = clamp01(sweat * (0.35 * w.x + 0.5 * going));
    w.y += (flush - w.y) * (1 - Math.exp(-dt * FLUSH_RATE[flush > w.y ? 0 : 1]));
    w.z += (clamp01(0.35 * going + 0.7 * w.x * w.x) - w.z) * (1 - Math.exp(-dt * TIRED_RATE));
    const m = this.mien;
    told.uCrease.value.set(m[F.raise], m[F.frown], m[F.squint], m[F.shut]);
    told.uHead.value.setFromMatrix4(MAT.makeRotationFromQuaternion(Q.copy(this.group.quaternion).multiply(head.quaternion)));
  }
}
