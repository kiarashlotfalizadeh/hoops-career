// One figure on the 3D court: an athlete's body, modelled in Blender (scripts/blender/figure.py), one
// skin over the puppet's joints. Shoulders run into arms without a seam, the head has a face, the
// hands have fingers and the feet sneakers; he wears a V-neck vest tucked into shorts, whose legs
// swing a beat behind his thighs. Builds differ (height, shoulders, how thick the limbs are), and so
// do the men: each has a skin, a head of hair, a beard and a face of his own (look.ts), made up from
// his id, never a likeness. Beyond the puppet's bones he has leaves this file turns itself: his fingers,
// his jaw and nose, his hair's swing, a bone at each shoulder (half way from chest to arm: see `girdle`)
// and one down each forearm (the hand's turn spread along it), his brows and his lower lip. His head is
// one of six kinds, each man off his kind (look.ts), and his face works: his jaw comes open on his teeth
// in the air and when he shouts, his brows come down, his eyes blink. Close up the material draws his
// eyes itself (see EYES), and his head is lit by a lamp on the camera as well as the building's, so his
// dark skin is a face with planes and not a shape (the material's uTone, uBlink, uIris, uEye). His skin
// has a grain close up and a warm edge where a lamp's light leaves it (PORES, SKIN_WRAP), and goes to his
// hair and his beard over a little way, as their picture does, never in a step.
//
// Everything he wears is one picture (his sheet, see `Sheet`): his vest with its number and name, the
// shorts with their side panels and the team's mark, his head (his face, his hair and beard),
// a strip down each arm and leg (a sleeve, a wristband, his socks), his shoes. Each point of the model
// finds its place in the picture by what it is and where it is on him (see `sheetUv`), so the whole man
// is one draw: one material, whatever he has on. A second, smaller picture says what each part is
// made of (how rough, how much a cloth's sheen, how much of its knit shows up close).
import {
  Bone,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Skeleton,
  Vector2,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  BufferAttribute,
  BufferGeometry,
} from 'three';
import type { MatchKit } from '../../teamColors';
import { CLIPS, I } from './clips';
import { merged, type Thing } from './glb';
import { lookOf, SKINS, STYLES, type Look } from './look';
import { ANKLE, J, Puppet, THIGH, type Body } from './puppet';

/** The grey the figures were before each had a skin of his own (look.ts): what the benches still wear until they take theirs from there. */
export const FIGURE = '#7b7d88';
/** That grey's hair. */
export const HAIR = ['#55565f', '#62636c', '#4a4b53', FIGURE] as const;
export const SHOE = '#1b1c1f';
export const SOCK = '#ecebe6';

/** The bones the skin hangs on, as the model names them. */
const B = {
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
} as const;
const BONES = 31;
/** How far out from his sides his arms are as built (figure.py's ARM_OUT). */
const ARM_OUT = (38 * Math.PI) / 180;
/** Where the fingers' two joints are down the hand from the wrist, ft (figure.py's KNUCKLE and MIDDLE). */
const KNUCKLE = 0.4;
const MIDDLE = 0.545;
/** Where his jaw, his nose and his brows are scaled about, from the head bone (figure.py's JAW_AT, NOSE_AT and BROW_AT). */
const JAW_AT = new Vector3(0, 0.045 - 0.5 * 0.42, 0.05 + 0.25 * 0.37);
const NOSE_AT = new Vector3(0, 0.045 - 0.2 * 0.42, 0.05 + 0.8 * 0.37);
const BROW_AT = new Vector3(0, 0.045 + 0.24 * 0.42, 0.05 + 0.8 * 0.37);
/** Where his jaw hinges, just in front of his ear (from the head bone, ft): it comes open about this, not about where it is scaled. */
const JAW_HINGE = new Vector3(0, 0.045 - 0.03 * 0.42, 0.05 - 0.2 * 0.37);
/** Where hair that hangs swings from (figure.py's HAIR_AT). */
const HAIR_AT = new Vector3(0, 0.045 + 0.1 * 0.42, 0.05 - 0.6 * 0.37);

// ---------------------------------------------------------------- his sheet: where each thing is on it

/** The sheet is a square this many pixels across; the stuff picture beside it a quarter of that. */
const SHEET = 1024;
const STUFF_K = 4;
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
/** How far down an arm and a leg its strip reaches, ft (shoulder to fingertips, hip to sole, on the 6 ft 6 body). */
const ARM_LEN = 2.75;
const LEG_LEN = 3.5;
/** His head's middle, from the head bone (figure.py's HEAD_C), and its half width, height and depth: his head's picture is drawn round it. */
const HEAD_MID = new Vector3(0, 0.045, 0.05);
const HEAD_SIZE = [0.3, 0.42, 0.37] as const;
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
/** Those of them that are curls, not strands: their half of the hair's picture is tufts. */
const TUFTED = ['afro', 'hightop', 'curls', 'twists'];
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
  blob: BufferGeometry;
  ring: BufferGeometry;
}

/** The shapes every figure shares (built once; `keep` takes each to throw away with the scene). */
export function figureGeo(keep: <T extends { dispose(): void }>(o: T) => T, model: Map<string, Thing>): Geo {
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
  const { shorts, piece } = sheetUv(geo, materials, order, inverse);
  const blob = keep(new CircleGeometry(1.25, 20));
  blob.rotateX(-Math.PI / 2);
  const ring = keep(new RingGeometry(1.55, 1.85, 28));
  ring.rotateX(-Math.PI / 2);
  // each piece of hair is the same points with other triangles left out: one set of points for every man
  const all = Array.from(geo.index!.array as ArrayLike<number>);
  const made = new Map<string, BufferGeometry>();
  const wearing = (name: string | null, high = true) => {
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
  geo.dispose();
  return { body: wearing(null), wearing, wears: materials, order, inverse, shorts, blob, ring };
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
 * it; the parts become one. Says how high the shorts reach, and which piece of hair each triangle is of ('' for none).
 */
function sheetUv(geo: BufferGeometry, wears: string[], order: number[], inverse: Matrix4[]): { shorts: [number, number]; piece: string[] } {
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
  lo -= 0.02;
  hi += 0.02;
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
    if (w === 'mouth') return Pic.Mouth;
    if (w === 'teeth') return Pic.Teeth;
    if (PIECES.includes(w)) return Pic.Hair;
    // (the white below the ankle is a sole; above it, a sock: the bottom of its leg's strip)
    if (w === 'white') return L.copy(P).applyMatrix4(foot).y < -0.06 ? Pic.Sole : P.x > 0 ? Pic.LegL : Pic.LegR;
    // (his head is all his head bone's, with his jaw and nose; his neck, which shares it with his chest, is his trunk's skin)
    if (weight(v, [B.head, B.jaw, B.nose, B.brow, B.lip]) >= 0.995) return Pic.Head;
    if (weight(v, [B.ual, B.fal, B.hal]) + 0.5 * weight(v, [B.cll]) >= 0.5) return Pic.ArmL;
    if (weight(v, [B.uar, B.far, B.har]) + 0.5 * weight(v, [B.clr]) >= 0.5) return Pic.ArmR;
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
        return TUFTED.includes(wear[v]) ? [0.52 + 0.46 * fold(P.x * 2.3 + P.y * 0.9), fold(P.z * 6.4 + P.y * 3.7)] : [0.02 + 0.46 * fold(P.y * 1.7), fold(P.x * 7.3 + P.z * 5.9)];
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
  const at: [number, number][] = mine.map((k, v) => place(v, k));
  for (let f = 0; f < corners.length; f += 3) {
    const vs = [corners[f], corners[f + 1], corners[f + 2]];
    let k = mine[vs[0]];
    for (const v of vs) if ((OVER[mine[v]] ?? 0) > (OVER[k] ?? 0)) k = mine[v];
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
  return { shorts: [lo, hi], piece };
}

// ---------------------------------------------------------------- what he is made of

/** Each kind of stuff: how rough it is, how much of a cloth's sheen it has, how much of its knit shows up close (the stuff picture holds these, a channel each). */
const STUFF = {
  // (skin says so with all of the second channel: the material lights it as skin, see stuffMaterial)
  skin: [0.6, 1, 0],
  face: [0.56, 1, 0],
  // (where he sweats: his brow, his shoulders)
  sweat: [0.47, 1, 0],
  scalp: [0.5, 1, 0],
  hand: [0.6, 1, 0],
  lip: [0.36, 1, 0],
  eye: [0.08, 1, 0],
  hair: [0.7, 0.3, 0],
  curl: [0.95, 0.12, 0],
  beard: [0.8, 0.2, 0],
  vest: [0.86, 0.85, 1],
  // (a number is pressed on: smoother than the knit round it, and none of its sheen)
  print: [0.55, 0.12, 0],
  shorts: [0.78, 0.9, 0.7],
  rib: [0.8, 0.6, 0.45],
  sock: [0.92, 0.7, 0.55],
  sleeve: [0.5, 0.45, 0.25],
  terry: [0.95, 0.85, 0.8],
  tape: [0.7, 0.2, 0.15],
  // (a headband: terry too, but on his head its second channel says how much of his skin a point is, and it is none)
  band: [0.95, 0.3, 0],
  leather: [0.4, 0, 0],
  // (behind his lips: wet teeth, and the dark)
  tooth: [0.25, 0, 0],
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
    ] as const) {
      ctx.save();
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.rect(r[0], r[1], r[2], r[3]);
      ctx.clip();
      ctx.translate(r[0], r[1]);
      draw(ctx, pick);
      ctx.restore();
    }
  }

  /**
   * A picture that goes round him, drawn `pw` wide for one turn and `ph` high, with `top` and `bottom`
   * the share of the place it fills that its top and bottom rows are at; it's drawn again a turn either
   * side, for the run past the seam.
   */
  around(r: Rect, pw: number, ph: number, draw: (ctx: CanvasRenderingContext2D, pick: Pick) => void, top = 1, bottom = 0) {
    const sx = r[2] / (pw * (1 + 2 * WRAP));
    const sy = (r[3] * (top - bottom)) / ph;
    this.both(r, (ctx, pick) => {
      for (const turn of [-1, 0, 1]) {
        ctx.save();
        ctx.translate((WRAP + turn) * pw * sx, (1 - top) * r[3]);
        ctx.scale(sx, sy);
        draw(ctx, pick);
        ctx.restore();
      }
    });
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
const EYE = [0.38, 0.066, 0.138] as const;
/** How far up its outer corner is tipped and how high its upper lid stands open, for the middling man (look.ts's tilt and open scale them). */
const EYE_TILT = 0.012;
const EYE_OPEN = 0.047;
/** His iris: its half width and half height on that plane (a circle on him), and how far over the eye's middle it sits. */
const IRIS = [0.06, 0.043, 0.008] as const;

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
  // (lips are the skin's colour, redder; darker skin's are browner than they are red, the upper one darker than
  // the lower, which is pinker)
  const dark = look.tone / (SKINS.length - 1);
  const lipUp: Rgb = [skin[0] * (0.84 - 0.1 * dark) + 0.02, skin[1] * (0.66 + 0.02 * dark), skin[2] * (0.67 + 0.04 * dark) + 0.01];
  const lipLow: Rgb = [skin[0] * (0.88 + 0.12 * dark) + 0.02 + 0.04 * dark, skin[1] * (0.74 + 0.04 * dark), skin[2] * (0.75 + 0.06 * dark) + 0.01 + 0.02 * dark];
  // (his own face: how full his lips are, how his eyes are set: see look.ts)
  const full = 0.82 + 0.4 * look.face.lips;
  const tiltK = EYE_TILT * look.face.tilt;
  const openK = EYE_OPEN * look.face.open;
  // (how much of a shaven beard's shade shows: most on a lighter skin under darker hair)
  const shadow = 0.22 * (1 - 0.6 * dark);
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
  const shade = (t: number) => {
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

      if (nz > 0.1) {
        // his face, on its plane (figure.py's face_at)
        const fz = Math.max(nz, 0.3);
        const px = (nx / fz) * 0.8;
        const py = (ny / fz) * 0.8;
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
        if (py < 0.3 && py > -0.75) to([skin[0] * 1.05, skin[1] * 0.87, skin[2] * 0.84], 0.4 * bump(apx, py, 0.56, -0.24, 0.24, 0.2) + 0.4 * bump(px, py, 0, -0.25, 0.12, 0.09));
        made('sweat', sstep(0.26, 0.34, py) * sstep(0.7, 0.6, py) * 0.7);
        // the hollows: round the eyes (darkest beside the nose and under the eye), under the brow, beside the nose and
        // under it, its nostrils, the fold from its wing past the mouth, under the lower lip, under the cheekbone
        if (py > -0.2 && py < 0.4 && apx < 0.9)
          shade(0.3 * bump(apx, py, 0.37, 0.09, 0.2, 0.095) + 0.16 * bump(apx, py, 0.2, 0.07, 0.07, 0.11) + 0.12 * bump(apx, py, 0.4, -0.04, 0.14, 0.035));
        if (py > -0.47 && py < -0.2 && apx < 0.45)
          shade(0.2 * bump(px, py, 0, -0.36, 0.14, 0.028) + 0.82 * bump(apx, py, 0.078, -0.334, 0.036, 0.015) + 0.16 * bump(apx, py, 0.215, -0.285, 0.03, 0.06));
        if (py > -0.8 && py < -0.15 && apx < 0.8)
          shade(0.17 * bump(px, py, 0, -0.68, 0.17, 0.035) + 0.12 * bump(apx, py, 0.33, -0.43, 0.035, 0.12) + 0.07 * bump(apx, py, 0.66, -0.47, 0.15, 0.15));
        // (a clean-shaven man's jaw is a shade darker where his beard would be)
        if (look.beard === 0 && py < -0.3)
          to(
            [brows[0] * 0.6 + skin[0] * 0.4, brows[1] * 0.6 + skin[1] * 0.4, brows[2] * 0.6 + skin[2] * 0.4],
            shadow * (0.5 * sstep(-0.36, -0.42, py) * sstep(0.42, 0.3, apx) * (1 - bump(px, py, 0, -0.52, 0.3, 0.07)) + 0.5 * sstep(-0.62, -0.72, py)),
          );
        // his mouth: the upper lip with its bow, the fuller lower one, the line between them, the paler edge round them
        const mw = 0.262;
        const my = -0.522;
        if (apx < mw + 0.04 && py < -0.4 && py > -0.68) {
          const t = Math.min(1, apx / mw);
          const arch = Math.pow(1 - t * t, 0.6);
          const up = my + 0.052 * full * arch * (1 - 0.24 * Math.exp(-((t / 0.14) ** 2)));
          const low = my - 0.084 * full * Math.pow(1 - t * t, 0.8);
          const inLip = sstep(low - 0.01, low + 0.008, py) * sstep(up + 0.01, up - 0.008, py) * sstep(mw + 0.02, mw - 0.02, apx);
          // (the skin just over the upper lip's edge is a little paler: the edge reads without a line drawn round it)
          if (look.beard < 2) to([skin[0] * 1.08, skin[1] * 1.06, skin[2] * 1.04], 0.3 * sstep(0.03, 0.006, Math.abs(py - up - 0.016)) * sstep(mw, mw - 0.1, apx));
          if (inLip > 0) {
            const lower = py < my;
            to(lower ? lipLow : lipUp, inLip * 0.82);
            // (the creases down a lip; the lower lip's shine; its under side in its own shade)
            const crease = noise(px * 70, py * 9);
            shade(0.1 * inLip * (crease - 0.5));
            if (lower) {
              to([1, 0.94, 0.9], 0.16 * inLip * bump(px, py, 0.01, my - 0.04 * full, 0.1, 0.014));
              shade(0.16 * inLip * sstep(my - 0.05 * full, low, py));
            } else shade(0.1 * inLip * sstep(up - 0.03, my, py));
            made('lip', inLip);
          }
          // (the line between them, deepest at the corners)
          to([skin[0] * 0.16, skin[1] * 0.09, skin[2] * 0.09], 0.9 * sstep(0.0085, 0.003, Math.abs(py - my + 0.03 * t * t * t)) * sstep(mw + 0.02, mw - 0.03, apx));
          shade(0.14 * bump(apx, py, mw + 0.005, my - 0.03, 0.03, 0.025));
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
          to([skin[0] * 0.45, skin[1] * 0.36, skin[2] * 0.34], 0.5 * sstep(0.014, 0.0, Math.abs(ey - up - 0.034)) * sstep(ew + 0.05, ew - 0.03, Math.abs(ex)));
          to([skin[0] * 1.06, skin[1] * 0.92, skin[2] * 0.9], 0.3 * sstep(0.012, 0.002, Math.abs(ey - low + 0.012)) * sstep(ew, ew - 0.04, Math.abs(ex)));
          if (open > 0) {
            const white: Rgb = [0.6, 0.57, 0.53];
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
          const thick = (0.022 + 0.024 * look.brow) * (1 - 0.6 * q * q) + 0.004;
          const lean = 1.25 - 1.1 * sstep(0, 0.6, q);
          const along = apx * Math.cos(lean) + py * Math.sin(lean);
          const hairs = noise((apx * Math.sin(lean) - py * Math.cos(lean)) * 95, along * 16);
          // (its edges are hairs, not a line: thinner, and broken)
          // (a notch shaved through one of them, near its end, if he has one)
          const notch = look.notch && Math.sign(px) === look.side ? sstep(0.02, 0.008, Math.abs(q - 0.68)) : 0;
          const on =
            sstep(thick * (1.05 + 0.5 * (hairs - 0.5)), thick * 0.3, Math.abs(py - yb)) * sstep(-0.07, 0.07, q + 0.08 * (hairs - 0.5)) * sstep(1.05, 0.88, q) * (1 - notch);
          to([brows[0] * 0.85, brows[1] * 0.85, brows[2] * 0.85], on * (0.5 + 0.42 * look.brow) * (0.55 + 0.6 * hairs));
        }
      }

      // his beard: stubble, a goatee round his mouth, all of his jaw (shorter up his cheeks), a full one, or a strap
      // along the line of his jaw; its edge thins out into single hairs over a little way (no plate laid on him), and
      // it is hairs all through, his skin showing between them; round a goatee or a strap the rest of his beard's
      // ground has the shadow of a shave
      if (look.beard > 0 && nz > -0.25 && ny < 0.36) {
        const fz = Math.max(nz, 0.3);
        const px = (nx / fz) * 0.8;
        const py = (ny / fz) * 0.8;
        const apx = Math.abs(px);
        const front = sstep(0.2, 0.36, nz);
        // (round the mouth: over the lip, down beside it, the chin; never on the lips)
        const lips = front * sstep(0.32, 0.25, apx) * sstep(-0.645, -0.6, py) * sstep(-0.435, -0.475, py);
        const tache = front * sstep(-0.33, -0.4, py) * sstep(-0.55, -0.47, py) * sstep(0.4, 0.28, apx) * (1 - 0.65 * bump(px, py, 0, -0.39, 0.035, 0.04));
        const bars = front * sstep(0.18, 0.28, apx) * sstep(0.45, 0.32, apx) * sstep(-0.44, -0.56, py) * sstep(-1.05, -0.8, py);
        const chin = sstep(-0.61, -0.73, py) * sstep(0.47, 0.3, apx) * front * sstep(-1.35, -1.05, py);
        // (the tuft under the lower lip)
        const patch = front * bump(px, py, 0, -0.655, 0.06, 0.04);
        const round = Math.max(tache, bars, chin, patch) * (1 - lips);
        // (his jaw and cheeks: under a line from his ear down to the corner of his mouth, as far as under his chin)
        // (the line is a man's own, never ruled: it wanders a little)
        const line = ny + 0.52 - 0.62 * (ax - 0.3) - 0.5 * (ax - 0.3) * (ax - 0.3) + 0.06 * (noise(ax * 3.5 + 3, nz * 3.5) - 0.5);
        const under = sstep(-1.02, -0.88, ny) * sstep(-0.24, -0.05, nz) * (1 - lips);
        // (and up in front of his ear it narrows to the sideburn his hair comes down to meet)
        const burn = sstep(-0.02, 0.1, nz) * sstep(0.36, 0.18, nz) * sstep(0.32, 0.14, ny) * sstep(-0.32, -0.08, ny) * sstep(0.58, 0.8, ax);
        const high = sstep(0.04, -0.14, ny - 0.25 * (nz + 0.1));
        const cheek = Math.max(
          (look.beard === 1 ? sstep(0.2, -0.32, line + 0.25 * ax * ax) : sstep(0.1, -0.12, line + 0.2 * (ax - 0.5) * (ax - 0.5))) * under * high,
          burn * (look.beard === 2 || look.beard === 5 ? 0 : 1),
        );
        // (where a shaved beard's shadow is: a little further up than any beard)
        const ground = Math.max(round, sstep(0.2, -0.1, line + 0.2 * (ax - 0.5) * (ax - 0.5)) * under * high);
        // (a strap: a finger's width along the edge of his jaw, from ear to ear by way of his chin)
        const edge = Math.max(0.25 * ax - ny - 0.66 * nz - 0.71, -ny + 0.12 * nz - 1.137);
        const strap = Math.max(sstep(-0.29, -0.16, edge) * sstep(0.03, -0.05, edge) * sstep(-0.1, -0.32, ny), 0.9 * patch) * under;
        // (hairs: fine ones every way for stubble, longer ones lying down his jaw for a beard)
        const speck = noise(nx * 64 + nz * 41, ny * 64 - nz * 29);
        const strand = noise(nx * 52 + nz * 26, ny * 17 + nz * 7);
        const fine2 = noise(nx * 150 + nz * 90, ny * 60 - nz * 50);
        // (how thick it grows there: thinning out to nothing over its edge, in single hairs)
        const frayed = (m: number, by: number) => sstep(0.5 - by, 0.5 + by, m + (strand - 0.5) * 1.6 * by + (speck - 0.5) * by + (fine2 - 0.5) * 0.8 * by);
        const shave = ground * (0.12 + 0.12 * speck);
        let on = 0;
        let deep = 0;
        if (look.beard === 1) on = Math.max(round, cheek) * (0.15 + 0.22 * speck + 0.08 * fine2);
        else if (look.beard === 2) {
          const m = frayed(round, 0.34);
          on = Math.max(m * (0.7 + 0.22 * strand + 0.08 * fine2), shave);
          deep = 0.009 * sstep(0.35, 0.95, round);
        } else if (look.beard === 5) {
          const m = frayed(strap, 0.3);
          on = Math.max(m * (0.7 + 0.22 * strand + 0.08 * fine2), shave);
          deep = 0.007 * sstep(0.35, 0.95, strap);
        } else {
          const all = Math.max(round, cheek);
          const m = frayed(all, look.beard === 4 ? 0.32 : 0.38);
          on = Math.max(m * (0.72 + 0.2 * strand + 0.08 * fine2) * (look.beard === 3 ? 0.9 : 1), shave);
          deep = (look.beard === 4 ? 0.03 + 0.045 * sstep(-0.5, -0.9, ny) : 0.011) * sstep(0.3, 0.95, all);
        }
        if (on > 0) {
          // (lighter where a hair catches the light, darker between two; a touch of his skin's warmth in it)
          const g = 0.55 + 0.6 * strand + 0.25 * (speck - 0.5) + 0.2 * (fine2 - 0.5);
          to([brows[0] * g + 0.03 * skin[0], brows[1] * g + 0.02 * skin[1], brows[2] * g + 0.015 * skin[2]], on);
          made('beard', sstep(0.15, 0.65, on));
          lift = Math.max(lift, deep);
        }
      }

      // his hair: over the hairline, as he wears it
      const round = Math.atan2(ax, nz);
      // (a man whose hairline has gone back has lost it most at his temples, a little across his forehead)
      const line = ny - hairlineAt(round) - look.recede * (0.15 * Math.exp(-(((round - 0.78) / 0.3) ** 2)) + 0.05 * Math.exp(-((round / 0.5) ** 2)));
      if (line > -0.14) {
        // (no line drawn round his head: the hair thins out to the skin over a little way, unevenly, as a hairline
        // does, a few short hairs ahead of it)
        const wisp = noise(nx * 13 + nz * 7, ny * 13 - nz * 5);
        const over = (soft: number) => sstep(-0.9 * soft, 1.5 * soft, line + (fine() - 0.5) * soft * 0.8 + (wisp - 0.5) * soft * 1.2);
        // (how far up his sides and back: a fade is skin there and hair by the crown, never at his forehead. Each man's
        // barber takes it as high as he does, and leaves as much on top)
        const high = -0.2 + 0.55 * look.cut.sides;
        const fade = Math.max(sstep(high, high + 0.24, ny), sstep(1.15, 0.75, round) * sstep(0.3, 0.45, ny));
        const top = 0.6 + 0.8 * look.cut.top;
        const curled = style === 'curls' || style === 'afro' || style === 'twists' || style === 'locs' || style === 'hightop';
        const curl = curled ? noise(nx * 34 + nz * 23, ny * 34 + nz * 17) : 0;
        // (rows and combed hair run front to back, evenly round him)
        const across = Math.asin(Math.max(-1, Math.min(1, nx)));
        const streak = style === 'tied' || style === 'bun' || style === 'crop' ? noise(across * 46, nz * 2.5 + ny) : 0;
        let cover = 0;
        let tex = 1;
        switch (style) {
          case 'shaved':
            cover = 0.14 * over(0.1);
            break;
          case 'buzz':
            cover = (0.56 + 0.2 * look.cut.top + 0.12 * fine()) * over(0.06);
            break;
          case 'fade':
            cover = 0.94 * over(0.045) * (0.2 + 0.8 * fade);
            lift = 0.02 * top * fade * over(0.05);
            tex = 0.85 + 0.3 * fine();
            break;
          case 'curls':
            cover = over(0.04);
            tex = 0.7 + 0.6 * curl;
            break;
          case 'afro':
            cover = over(0.03);
            tex = 0.7 + 0.6 * curl;
            break;
          case 'cornrows':
          case 'braids': {
            const row = 0.5 + 0.5 * Math.cos(across * 15);
            cover = over(0.04) * (0.4 + 0.6 * Math.pow(row, 0.7));
            lift = 0.02 * row * over(0.05);
            // (each row is plaited: darker and lighter along it)
            tex = 0.75 + 0.35 * Math.abs(Math.sin(nz * 40 + ny * 25));
            break;
          }
          case 'twists':
          case 'locs':
            cover = over(0.05) * (0.78 + 0.22 * curl);
            lift = 0.012 * over(0.05);
            tex = 0.75 + 0.4 * curl;
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
            cover = over(0.06) * (0.25 + 0.75 * Math.max(fade, sstep(0.4, 0.55, ny)));
            lift = 0.012 * fade * over(0.05);
            tex = 0.75 + 0.5 * curl;
            break;
          case 'crop':
            cover = over(0.04) * (0.55 + 0.45 * fade);
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
        if (cover > 0) {
          to([hair[0] * tex, hair[1] * tex, hair[2] * tex], cover);
          if (ny > 0.3) made('scalp', sstep(0.0, 0.2, cover));
          made('hair', sstep(0.2, 0.7, cover));
        }
      } else if (nz < 0.1 && ny > -0.5 && ax > 0.8) {
        // (his ears: a little redder than his cheeks, their bowl in shade)
        to([skin[0] * 1.04, skin[1] * 0.9, skin[2] * 0.87], 0.35);
        shade(0.22 * bump(nz, ny, -0.2, -0.06, 0.035, 0.07));
      }
      // (a headband, its edges a little soft as cloth's are: no stair of pixels down them)
      const onBand = bandRgb && ny > 0.1 ? sstep(0.068, 0.058, Math.abs(ny - 0.34 - 0.13 * nz)) : 0;
      if (onBand > 0) {
        to(bandRgb!, onBand);
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

/** One man's sheet: his kit (`mark` his team's letters, if the game has them), his number and name, his own things, his look. */
function paint(kit: MatchKit, num: string, name: string, mark: string, gear: Gear, look: Look, shorts: [number, number]): Sheet {
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

  // plain patches
  sh.fill(R_SKIN, look.skin, 'skin');
  // (what is behind his lips is in his head's shade already: its colours are lighter than they will look)
  sh.fill(R_MOUTH, '#3a1210', 'gullet');
  sh.fill(R_TEETH, '#f4efe4', 'tooth');
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
      // a panel down each side, piped in the trim
      for (const x of [0, 256, 512]) {
        ctx.fillStyle = pick(panel, 'vest');
        ctx.fillRect(x - 15, -40, 30, 340);
        ctx.fillStyle = pick(ring, 'rib');
        for (const e of [-1, 1]) ctx.fillRect(x + e * 15 - 1.25, -40, 2.5, 340);
        // (sewn in: a row of stitches either side of the panel, and the seam down its middle)
        ctx.strokeStyle = pick(seam, 'vest');
        ctx.lineWidth = 0.7;
        ctx.setLineDash([2.4, 1.6]);
        for (const e of [-19, 19]) {
          ctx.beginPath();
          ctx.moveTo(x + e, -40);
          ctx.lineTo(x + e, 300);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = pick(seam, 'vest');
        ctx.fillRect(x - 0.4, -40, 0.8, 340);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      // his number, front and back, sewn on with its edge (in front it sits under the team's letters, below the V of the neck, which comes down to about 70)
      const digits = num.length > 1;
      font(ctx, 900, digits ? 88 : 96, digits ? 'condensed' : 'semi-condensed');
      sewn(ctx, num, 384, 182, 92, pick(ink, 'print'), edge && pick(edge, 'print'), 3);
      font(ctx, 900, digits ? 112 : 120, digits ? 'condensed' : 'semi-condensed');
      sewn(ctx, num, 128, 178, 110, pick(ink, 'print'), edge && pick(edge, 'print'), 3.6);
      // the team's letters arched over the front number; his name arched over the back one
      if (mark) {
        font(ctx, 900, 28, 'semi-condensed');
        arched(ctx, mark.toUpperCase(), 384, 104, 28, 0.2, 92, 3, () => (ctx.fillStyle = pick(ink, 'print')));
      }
      if (name) {
        font(ctx, 800, 21, 'condensed');
        arched(ctx, name.toUpperCase(), 128, 62, 21, 0.3, 112, 2.2, () => (ctx.fillStyle = pick(ink, 'print')));
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
    for (const x of [0, 256, 512]) {
      ctx.fillStyle = pick(panel, 'shorts');
      ctx.fillRect(x - 26, 0, 52, 256);
      ctx.fillStyle = pick(ring, 'rib');
      for (const e of [-1, 1]) ctx.fillRect(x + e * 26 - 1.5, 0, 3, 256);
      ctx.strokeStyle = pick(seam, 'shorts');
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2.6, 1.8]);
      for (const e of [-31, 31]) {
        ctx.beginPath();
        ctx.moveTo(x + e, 0);
        ctx.lineTo(x + e, 256);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    {
      // the hem's two rows of stitches; the seam up the inside of each leg and round the seat; the cord at his waist, tied in front
      const up = 256 / tall;
      ctx.strokeStyle = pick(seam, 'shorts');
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2.6, 1.8]);
      for (const y of [0.115, 0.14]) {
        ctx.beginPath();
        ctx.moveTo(-4, 256 - y * up);
        ctx.lineTo(516, 256 - y * up);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = pick(seam, 'shorts');
      for (const x of [128, 384]) ctx.fillRect(x - 0.5, 0, 1, 256);
      ctx.strokeStyle = pick(kit.light ? ring : '#f1f0eb', 'lace');
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
  const band = ['afro', 'hightop', 'twists', 'locs'].includes(STYLES[look.style].name) ? null : gear.band;
  const key = `${JSON.stringify(look)} ${band}`;
  let head = HEADS.get(key);
  if (!head) {
    // (a quick one for now: the figure asks for the finished one, see refine)
    const quick = headPainter(look, band, STUFF_K);
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
    // (a joint's skin is a shade darker: his elbow, his knee)
    const joint = arm ? 1.1 : 1.62;
    sh.both(rect, (ctx, pick) => {
      const at = (joint / len) * rect[2];
      const shade = ctx.createLinearGradient(at - 40, 0, at + 40, 0);
      const dark = mix(look.skin, '#3a1c10', 0.16);
      shade.addColorStop(0, pick(look.skin, 'skin'));
      shade.addColorStop(0.5, pick(dark, 'skin'));
      shade.addColorStop(1, pick(look.skin, 'skin'));
      ctx.fillStyle = shade;
      ctx.fillRect(at - 40, 0, 80, rect[3]);
    });
    if (arm) {
      // (his shoulder shines with sweat; his hand, from the wrist on, is a little rougher and its palm paler)
      span(0, 0.55, look.skin, 'sweat');
      span(2.12, len, mix(look.skin, '#e8c0a8', 0.12), 'hand');
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

/**
 * What the figures' material does beyond a plain one: its roughness, a cloth's sheen and, close up, the
 * knit of it come from the stuff picture. (The knit's bumps are worked out where they're drawn, and fade
 * out as they get too fine for the pixels to show.)
 */
const STUFF_PARS = /* glsl */ `
uniform sampler2D uStuff;
// (Mikkelsen's bump, as three's but with the screen's steps left their length: the height is in feet, as the knit's depth is)
vec3 knitNormal( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
  vec3 vSigmaX = dFdx( surf_pos );
  vec3 vSigmaY = dFdy( surf_pos );
  vec3 R1 = cross( vSigmaY, surf_norm );
  vec3 R2 = cross( surf_norm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDirection;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
// (numbers that look random and are a place's own, and the same eased between places: his skin's grain)
float grain3( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
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
/** The knit's stitches: this many to the sheet's width (a few millimetres apart on his vest), and how deep they are (ft: a tenth of a millimetre). */
const KNIT = 640;
const KNIT_DEEP = 0.0003;
/**
 * His skin close up: its grain (pores and the little hills between them, this many to the foot of him as built:
 * a millimetre or so apart), and the grain of hair cropped close (tufts a few millimetres across); how deep each
 * is (ft). Worked out in his own frame (where he is as built), so it goes with him and never swims.
 */
const PORES = 260;
const PORES_DEEP = 0.00014;
const TUFTS = 110;
const TUFTS_DEEP = 0.0009;
/** How far past the line where the light stops falling on his skin it still comes out of it, warmer (a share of the turn: see RE_Direct_Skin). */
const WRAP_SKIN = '0.55';
/** How much light of its own his head has (a share of its colour), for the lightest skin; the darkest has this many times that again (see uTone). */
const FACE_FILL = '0.32';
const FACE_FILL_DARK = '3.2';
/**
 * Light that goes into skin comes out of it a little way on, redder: past the line where a lamp stops falling on
 * him his skin keeps a warm edge of it, as no cloth does (a soft terminator, not a hard one). `skinWrap` is how
 * much of his skin the point is (set where his colour is worked out).
 */
const SKIN_WRAP = /* glsl */ `
float skinWrap = 0.0;
void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float nl = dot( geometryNormal, directLight.direction );
  float wrap = saturate( ( nl + ${WRAP_SKIN} ) / ( 1.0 + ${WRAP_SKIN} ) );
  float past = max( wrap * wrap - saturate( nl ), 0.0 );
  reflectedLight.directDiffuse += skinWrap * past * directLight.color * BRDF_Lambert( material.diffuseColor ) * vec3( 1.0, 0.4, 0.26 );
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
 * shade of its lid, the iris with its fibres and dark rim, the pupil, the light in it, the lashes; and his blink, the
 * upper lid down over the ball to the lower one. Far off the picture's own eye is left to show (but for a blink).
 * (A point of the sheet is taken back to the plane of his face the way it was put there: headU and headV undone.)
 */
const EYES = (() => {
  const f = (v: number) => v.toFixed(5);
  // (the eyes' own corner of the sheet, a little over: nothing is worked out anywhere else)
  const box = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => faceUv(sx * (EYE[0] + EYE[2] + 0.06), EYE[1] + sy * 0.13)));
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
      vec2 fp = vec2( tan( ha ) * ${f((HEAD_SIZE[2] / HEAD_SIZE[0]) * 0.8)}, tan( hel ) / cos( ha ) * ${f((HEAD_SIZE[2] / HEAD_SIZE[1]) * 0.8)} );
      float side = sign( fp.x );
      float ex = abs( fp.x ) - ${f(EYE[0])};
      float ey = fp.y - ${f(EYE[1])};
      float w = ${f(EYE[2])};
      float aa = clamp( fwidth( fp.y ), 0.0008, 0.05 );
      float ax = clamp( fwidth( fp.x ), 0.0008, 0.05 );
      // (how close: all of it once an eye is a dozen pixels high, none of it under five)
      float near = 1.0 - smoothstep( 0.007, 0.018, aa );
      float show = max( near, step( 0.001, uBlink ) );
      if ( show > 0.0 ) {
        float t = min( 1.0, abs( ex ) / w );
        float k = 1.0 - t * t;
        float tilt = uEye.x * ex / w;
        float up = tilt + uEye.y * pow( k, 0.55 );
        float low = tilt - 0.037 * pow( k, 0.8 );
        float lid = mix( up, low - 0.004, uBlink );
        float inX = 1.0 - smoothstep( w - ax, w + ax, abs( ex ) );
        // (shut, his lid covers the picture's own lashes too, along the top of the eye)
        float top = up + 0.016 * smoothstep( 0.0, 0.4, uBlink );
        float gap = inX * smoothstep( low - aa, low + aa, ey ) * ( 1.0 - smoothstep( top - aa, top + aa, ey ) );
        float under = 1.0 - smoothstep( lid - aa, lid + aa, ey );
        // the ball: its white (never as white as a picture of one: it is wet, and in the shade of his lid and his brow),
        // in the lid's shade at the top, greyer and redder toward the corners
        float lidShade = 0.36 + 0.64 * smoothstep( lid, lid - 0.055, ey );
        vec3 eye = ${rgb([0.6, 0.57, 0.53])} * lidShade * vec3( 1.0, 1.0 - 0.22 * t * t, 1.0 - 0.3 * t * t );
        vec2 ip = vec2( ex / ${f(IRIS[0])}, ( ey - ${f(IRIS[2])} ) / ${f(IRIS[1])} );
        float r = length( ip );
        float ar = aa / ${f(IRIS[1])};
        float ang = atan( ip.y, ip.x );
        float fibre = 0.86 + 0.14 * sin( ang * 26.0 + 3.0 * sin( ang * 7.0 ) );
        // (an iris is its own colour all through, a little lighter in a ring round the pupil and dark at its rim: no glow)
        vec3 ic = uIris * ( 0.95 + 0.4 * smoothstep( 0.44, 0.6, r ) * ( 1.0 - smoothstep( 0.62, 0.9, r ) ) - 0.6 * smoothstep( 0.78, 1.0, r ) ) * fibre * lidShade;
        eye = mix( eye, max( ic, vec3( 0.0 ) ), 1.0 - smoothstep( 1.0 - ar, 1.0 + ar, r ) );
        eye = mix( eye, vec3( 0.002 ), 1.0 - smoothstep( 0.45 - ar, 0.45 + ar, r ) );
        // (the light in it: up and to one side, the same side in both)
        float cl = length( vec2( ( ex - side * 0.02 ) / ${f(IRIS[0])}, ( ey - ${f(IRIS[2] + 0.017)} ) / ${f(IRIS[1])} ) );
        eye = mix( eye, vec3( 1.0 ), 0.85 * ( 1.0 - smoothstep( 0.11 - ar, 0.11 + ar, cl ) ) );
        // (the wet edge of his lower lid along the bottom of it, and the pink of its inner corner)
        float wet = inX * ( 1.0 - smoothstep( low + 0.004, low + 0.012 + aa, ey ) );
        eye = mix( eye, uSkin * vec3( 1.3, 0.95, 0.9 ) + vec3( 0.04, 0.025, 0.025 ), 0.5 * wet );
        eye = mix( eye, ${rgb([0.62, 0.38, 0.35])} * lidShade, 0.75 * smoothstep( - w + 0.045, - w + 0.012, ex ) );
        // (and a fainter one across from it, the floor's)
        float cl2 = length( vec2( ( ex + side * 0.022 ) / ${f(IRIS[0])}, ( ey - ${f(IRIS[2] - 0.014)} ) / ${f(IRIS[1])} ) );
        eye = mix( eye, vec3( 0.6, 0.5, 0.4 ), 0.3 * ( 1.0 - smoothstep( 0.1, 0.3, cl2 ) ) );
        // his lid over it as far as it is down, in his own skin; lashes along its edge
        vec3 over = uSkin * mix( 0.62, 0.82, smoothstep( lid, top, ey ) );
        vec3 drawn = mix( over, eye, under );
        diffuseColor.rgb = mix( diffuseColor.rgb, drawn, gap * show );
        float lash = inX * ( 1.0 - smoothstep( 0.006, 0.006 + 2.0 * aa, abs( ey - lid - 0.003 ) ) ) * ( 0.7 + 0.3 * smoothstep( - w, w, ex ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, ${rgb([0.07, 0.05, 0.045])}, 0.92 * lash * show );
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
  uBlink: { value: number };
  uIris: { value: Color };
  uEye: { value: Vector2 };
  uMouth: { value: number };
}

/** Where his head is on the sheet (in uv): there the stuff picture's third channel is how far his hair stands off him, not a knit. */
const HEAD_UV = [R_HEAD[0] / SHEET, 1 - (R_HEAD[1] + R_HEAD[3]) / SHEET, (R_HEAD[0] + R_HEAD[2]) / SHEET, 1 - R_HEAD[1] / SHEET].map((v) => v.toFixed(4));
const ON_HEAD = (uv: string) => `( ${uv}.x > ${HEAD_UV[0]} && ${uv}.y > ${HEAD_UV[1]} && ${uv}.y < ${HEAD_UV[3]} )`;
/** Where his teeth are on the sheet (in uv). */
const TEETH_UV = [R_TEETH[0] / SHEET, (R_TEETH[0] + R_TEETH[2]) / SHEET, 1 - R_TEETH[1] / SHEET].map((v) => v.toFixed(4));

/**
 * His material, from his sheet and its stuff picture. `plain` (a device that can't keep up) is a
 * standard material with the same picture, roughness and hair, but none of a cloth's sheen or knit.
 */
function stuffMaterial(map: CanvasTexture, stuff: CanvasTexture, told: Told, plain = false): MeshStandardMaterial {
  const m = plain
    ? new MeshStandardMaterial({ map, vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0 })
    : new MeshPhysicalMaterial({ map, vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uStuff = { value: stuff };
    Object.assign(sh.uniforms, told);
    // his hair stands off his head by as much as his crop says (pushed out as built, before his bones carry it)
    // (and where each point of him is as built, for his skin's grain: see PORES)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uStuff;\nvarying vec3 vRest;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvRest = position;\nif ${ON_HEAD('uv')} transformed += normal * textureLod( uStuff, uv, 0.0 ).b * ${HAIR_MAX.toFixed(3)};`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${STUFF_PARS}\nuniform float uTone;\nuniform vec3 uSkin;\nuniform float uBlink;\nuniform vec3 uIris;\nuniform vec2 uEye;\nuniform float uMouth;\nvarying vec3 vRest;`,
      )
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${SKIN_WRAP}`)
      // (skin's hollows are warm, not grey: the shade baked into him takes less of its red than of its blue)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `vec4 stuff = texture2D( uStuff, vMapUv );
        // (how much of his skin a point is: on his head it goes from skin to hair over his hairline and his beard's
        // edge as the picture does, so nothing his skin has stops in a step there)
        float skinK = ${ON_HEAD('vMapUv')} ? smoothstep( 0.35, 0.97, stuff.g ) : smoothstep( 0.92, 0.98, stuff.g );
        skinWrap = skinK;
        float shut = 0.0;
        float eyeK = 0.0;
        ${EYES}
        // (an eye drawn by the picture, far off: the whites take none of his face's own light, or they glow)
        eyeK = max( eyeK, skinK * ( 1.0 - smoothstep( 0.1, 0.22, stuff.r ) ) );
        // (dark skin's hollows go to black under a light from above long before light skin's do: its shade is let off some)
        vec3 baked = mix( vColor.rgb, vec3( 1.0 ), 0.35 * uTone * skinK );
        diffuseColor.rgb *= mix( vColor.rgb, pow( baked, vec3( 0.84, 1.03, 1.16 ) ), skinK );
        // (his teeth, in the dark behind his lips till his mouth comes open)
        if ( vMapUv.x > ${TEETH_UV[0]} && vMapUv.x < ${TEETH_UV[1]} && vMapUv.y < ${TEETH_UV[2]} ) diffuseColor.rgb *= mix( 0.1, 1.0, smoothstep( 0.03, 0.4, uMouth ) );`,
      )
      // (dark skin is read by the light that glances off it more than by the little it gives back: it has more of a shine;
      // and no skin is one shine all over: a little more here, a little less there)
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = mix( stuff.r, 0.55, shut ) * ( 1.0 - 0.2 * uTone * skinK ) * ( skinK > 0.0 ? 1.0 + 0.16 * skinK * ( noise3( vRest * 38.0 ) - 0.5 ) : 1.0 );',
      )
      // (and what light comes to it off the building is warmer on it than on cloth: a little of it has been through him)
      // (his head has a little light of its own, most where it faces the camera: under the arena's top light a face is read by it)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), vec3( 1.07, 0.98, 0.93 ), skinK );
        float toward = saturate( dot( normal, normalize( vViewPosition ) ) );
        // (that light is a lamp on the camera, a little over the lens: a plane that faces it is lit and one that turns
        // down from it is not, so his brow, his nose and his jaw are shapes in it and not one flat glow)
        float lamp = saturate( dot( normal, normalize( normalize( vViewPosition ) + ( viewMatrix * vec4( 0.0, 0.55, 0.0, 0.0 ) ).xyz ) ) );
        // (the darker his skin, the more of that light it needs to be a face and not a shape; and the rest of his skin has some too)
        if ${ON_HEAD('vMapUv')} reflectedLight.indirectDiffuse += diffuseColor.rgb * ${FACE_FILL} * ( 1.0 + ${FACE_FILL_DARK} * uTone ) * ( 0.14 + 0.86 * lamp * lamp ) * ( 1.0 - 0.75 * eyeK );
        else reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.7 * uTone * skinK * ( 0.3 + 0.7 * toward );
        // (and a rim of light along the edges that face up: the top light catching the round of a brow, a cheek, a shoulder)
        float rim = pow( 1.0 - toward, 3.0 ) * saturate( 0.35 + 0.65 * dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) );
        reflectedLight.indirectSpecular += vec3( 1.0, 0.93, 0.86 ) * rim * skinK * ( 0.04 + 0.1 * uTone );`,
      );
    if (plain) return;
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        if ( stuff.b > 0.02 && ! ${ON_HEAD('vMapUv')} ) {
          // (the folds his vest and shorts hang in are the model's own: none are drawn here to fight them)
          vec2 kp = vMapUv * ${KNIT.toFixed(1)};
          // (gone well before a stitch is a pixel across: at the broadcast's distance it would be a grid of dots)
          float fine = 1.0 - smoothstep( 0.07, 0.24, length( fwidth( kp ) ) );
          if ( fine > 0.0 ) {
            float h = sin( kp.x * 6.2832 ) * sin( kp.y * 6.2832 + 1.4 * sin( kp.x * 3.1416 ) );
            normal = knitNormal( - vViewPosition, normal, vec2( dFdx( h ), dFdy( h ) ) * ${KNIT_DEEP} * stuff.b * fine, faceDirection );
          }
        }
        {
          // his skin's grain close up (the little hills of it, and its pores), and his cropped hair's (on his head, what
          // is not skin: his hair, his beard); each gone before it is finer than the pixels
          vec3 pp = vRest * ${PORES.toFixed(1)};
          float hills = skinK * ( 1.0 - smoothstep( 0.25, 0.6, length( fwidth( pp * 0.37 ) ) ) );
          float pores = skinK * ( 1.0 - smoothstep( 0.3, 0.7, length( fwidth( pp ) ) ) );
          vec3 tp = vRest * ${TUFTS.toFixed(1)};
          float tufts = ( ${ON_HEAD('vMapUv')} ? 1.0 - skinK : 0.0 ) * ( 1.0 - smoothstep( 0.3, 0.7, length( fwidth( tp ) ) ) );
          if ( hills + tufts > 0.0 ) {
            float h = ${PORES_DEEP} * ( hills * noise3( pp * 0.37 ) - pores * 0.6 * smoothstep( 0.7, 0.92, noise3( pp ) ) ) + ${TUFTS_DEEP} * tufts * noise3( tp );
            normal = knitNormal( - vViewPosition, normal, vec2( dFdx( h ), dFdy( h ) ), faceDirection );
          }
        }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
        // (skin has a soft edge of its own against the light, warmer than cloth's)
        material.sheenColor = mix( stuff.g * mix( vec3( 1.0 ), diffuseColor.rgb, 0.45 ) * 0.7, vec3( 0.95, 0.6, 0.45 ) * ( 0.14 + 0.16 * uTone ), skinK );`,
      );
  };
  m.customProgramCacheKey = () => (plain ? 'figure-plain' : 'figure');
  return m;
}

/** How far his jaw swings open at the most, radians. */
const JAW_SWING = 0.28;
/** What a gesture does to his face: how far his jaw opens (0..1), how far his brows come down, and whether he is talking (his jaw works). */
const FACE_OF: Record<string, readonly [number, number, number] | undefined> = {
  roar: [1, 1, 0],
  flex: [0.6, 0.9, 0],
  fist: [0.45, 0.6, 0],
  protest: [0.6, 0.8, 1],
  call: [0.5, 0.3, 1],
  ask: [0.45, 0.2, 1],
  point: [0.3, 0.2, 1],
  wag: [0.2, 0.5, 0],
  head: [0, 0.6, 0],
  five: [0.2, 0, 0],
  clap: [0.25, 0.1, 1],
};

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
const UP = new Vector3(0, 1, 0);
const XA = new Vector3(1, 0, 0);
const ZA = new Vector3(0, 0, 1);

export class Fig {
  readonly group = new Group();
  readonly pup: Puppet;
  readonly side: 0 | 1;
  /** The team's letters on his kit (none in a highlight): another set dresses him again. */
  readonly mark: string;
  private readonly bones: Bone[] = [];
  /** Each limb's hinge (the line its elbow or knee folds about), kept for when it's straight. */
  private readonly hinge = [new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0)];
  readonly shadow: Mesh;
  readonly ring: Mesh;
  private readonly own: { dispose(): void }[] = [];
  private gone = false;
  private readonly mesh: SkinnedMesh;
  /** His material, and its plain twin once a slow device has asked for it (see lite). */
  private readonly mats: [MeshStandardMaterial, MeshStandardMaterial | null];
  private readonly textures: [CanvasTexture, CanvasTexture];
  private readonly told: Told;
  /** His blink: how many seconds between two, and where in that he started. */
  private readonly blinks: [number, number];
  /** His face as it is now: how far his jaw is open and his brows are down (0..1), and when that was last moved on. */
  private jawOpen = 0;
  private frown = 0;
  private faceAt = 0;

  /** Where the ball is while he has a hand on it (the scene's point; null: his hands lie on it as his move's grip has them). */
  ball: { x: number; y: number; z: number } | null = null;
  /** His own face and hair, from his seed. */
  readonly look: Look;

  /** `seed` makes him himself (his skin, face and hair, what he wears on his arms and legs, his shoes; `look` to give him another); `mark` is his team's letters. */
  constructor(geo: Geo, body: Body, side: 0 | 1, kit: MatchKit, num: string, seed = 0, name = '', mark = '', look: Look = lookOf(seed)) {
    this.pup = new Puppet(body);
    this.side = side;
    this.mark = mark;
    const { s, bulk } = body;
    const gear = gearOf(seed, kit);
    this.look = look;
    const sheet = paint(kit, num, name, mark, gear, look, geo.shorts);
    const map = new CanvasTexture(sheet.cv);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const stuff = new CanvasTexture(sheet.stuff);
    this.told = {
      uTone: { value: look.tone / (SKINS.length - 1) },
      uSkin: { value: new Color(look.skin) },
      uBlink: { value: 0 },
      uIris: { value: new Color(look.eyes) },
      uEye: { value: new Vector2(EYE_TILT * look.face.tilt, EYE_OPEN * look.face.open) },
      uMouth: { value: 0 },
    };
    // (he blinks in his own time: every few seconds, never with the man beside him)
    this.blinks = [3.1 + (((seed * 7) % 11) / 11) * 2.6, ((seed * 13) % 17) / 17];
    const mat = stuffMaterial(map, stuff, this.told);
    this.own.push(map, stuff, mat);
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
        const again = paint(kit, num, name, mark, gear, look, geo.shorts);
        current = again;
        map.image = again.cv;
        stuff.image = again.stuff;
        map.needsUpdate = stuff.needsUpdate = true;
        sharpen(again);
      });
    for (let k = 0; k < BONES; k++) {
      const b = new Bone();
      this.bones.push(b);
      this.group.add(b);
    }
    // builds: the trunk widens with his bulk, his limbs thicken with it, a small man's head is a little big
    const thick = s * (0.78 + 0.22 * bulk);
    const deep = Math.sqrt(bulk) * s;
    const scale = (k: number, x: number, y: number, z: number) => this.bones[k].scale.set(x, y, z);
    // (and no two men of one build are cut the same: one is broader across the chest, one has heavier arms or thighs,
    // one thin calves and forearms. A few parts in a hundred each: his joints stay where the puppet has them.)
    const own = rng(seed + 977);
    const [wide, arm, leg, low] = [0.97 + 0.07 * own(), 0.95 + 0.11 * own(), 0.95 + 0.1 * own(), 0.94 + 0.1 * own()];
    scale(B.pelvis, bulk * s, s, deep);
    scale(B.chest, bulk * s * wide, s, deep);
    scale(B.hem, bulk * s, s, deep);
    // (and each has a face of his own: a wider or a longer head, his jaw, his nose)
    const hs = Math.sqrt(s) * 1.06;
    const face = look.face;
    scale(B.head, hs * face.wide, hs * face.long, hs);
    scale(B.jaw, hs * face.wide * face.jaw, hs * face.long * face.chin, hs);
    scale(B.nose, hs * face.wide * face.nose, hs * face.long, hs * face.bridge);
    scale(B.hair, hs * face.wide, hs * face.long, hs);
    scale(B.brow, hs * face.wide, hs * face.long, hs);
    scale(B.lip, hs * face.wide, hs * face.long, hs);
    for (const k of [B.ual, B.uar]) scale(k, thick * arm, s, thick * arm);
    for (const k of [B.fal, B.far]) scale(k, thick * arm * low, s, thick * arm * low);
    for (const k of [B.thl, B.thr, B.hemL, B.hemR]) scale(k, thick * leg, s, thick * leg);
    for (const k of [B.shl, B.shr]) scale(k, thick * leg * low, s, thick * leg * low);
    for (const k of [B.hal, B.har, B.ftl, B.ftr]) scale(k, s, s, s);
    const mesh = new SkinnedMesh(geo.wearing(STYLES[look.style].piece, gear.shoe.high), mat);
    this.mesh = mesh;
    const bones = new Skeleton(
      geo.order.map((k) => this.bones[k]),
      geo.inverse,
    );
    this.own.push(bones);
    mesh.bind(bones, new Matrix4());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // (its bones carry it anywhere on the floor: its own bounds say nothing)
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const dark = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05, depthWrite: false });
    this.shadow = new Mesh(geo.blob, dark);
    this.shadow.scale.setScalar(s * (0.9 + 0.2 * bulk));
    this.shadow.renderOrder = 3;
    const ringMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new Mesh(geo.ring, ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    this.own.push(dark, ringMat);
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
    head.quaternion
      .copy(this.bones[B.chest].quaternion)
      .multiply(Q.setFromAxisAngle(UP, P[I.turn]))
      .multiply(Q.setFromAxisAngle(XA, -P[I.nod] * 0.8));
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
    // (a blink: his lids down and up again in a seventh of a second)
    const since = (performance.now() / 1000 / this.blinks[0] + this.blinks[1]) % 1;
    this.told.uBlink.value = Math.max(0, 1 - Math.abs(since * this.blinks[0] - 0.07) / 0.07);
    // his face works with the rest of him: in the air, at the top of his effort, his mouth comes open and his brows
    // come down; a roar or a flex bares his teeth; a man protesting, calling or asking is talking. (Eased, on the
    // wall's clock: a face is quick, and a replay at half speed loses nothing by it.)
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.faceAt) / 1000));
    this.faceAt = now;
    const air = Math.min(1, Math.max(0, P[I.air]));
    const [open, frown, talks] = FACE_OF[p.gesturing ?? ''] ?? [0, 0, 0];
    const talk = talks ? 0.5 + 0.5 * Math.sin(now * 0.021 + this.blinks[1] * 40) * Math.sin(now * 0.0083) : 1;
    const ease = 1 - Math.exp(-dt * 14);
    this.jawOpen += (Math.max(0.3 * air, open * talk) - this.jawOpen) * ease;
    this.frown += (Math.max(0.6 * air, frown) - this.frown) * ease;
    this.told.uMouth.value = this.jawOpen;
    // (his jaw swings about its hinge by his ear, not about where it is scaled from)
    const jaw = this.bones[B.jaw];
    Q.setFromAxisAngle(XA, JAW_SWING * this.jawOpen);
    jaw.position.copy(A.copy(JAW_AT).sub(JAW_HINGE).applyQuaternion(Q).add(JAW_HINGE).multiply(head.scale).applyQuaternion(head.quaternion)).add(head.position);
    jaw.quaternion.multiply(Q);
    this.bones[B.lip].position.copy(jaw.position);
    this.bones[B.lip].quaternion.copy(jaw.quaternion);
    // (his brows: down, a little forward and drawn together; a heavier brow sits further forward all the time)
    const brow = this.bones[B.brow];
    const hs = head.scale.z;
    brow.position.add(
      A.set(0, -0.016 * this.frown, 0.006 * this.frown + 0.012 * (this.look.face.ridge - 0.45))
        .multiplyScalar(hs)
        .applyQuaternion(head.quaternion),
    );
    brow.scale.x = head.scale.x * (1 - 0.07 * this.frown);
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
    // hands go with their forearms; feet point the way he faces, toes down once they leave the floor
    for (const [h, f, k] of [
      [B.hal, B.fal, J.hl],
      [B.har, B.far, J.hr],
    ] as const) {
      this.bones[h].position.copy(at(k, A));
      this.bones[h].quaternion.copy(this.bones[f].quaternion);
      const left = h === B.hal;
      const grip = Math.min(1, Math.max(0, P[left ? I.gl : I.gr]));
      const way = left ? -1 : 1;
      if (grip > 0.02) {
        // a hand on the ball lies on it: its palm toward the ball (beside it, under it or over it, as the
        // puppet holds it), its fingers on along the forearm as far as that lets them
        const hold = CLIPS[p.clip].grip;
        const ball = this.ball;
        // (toward the ball itself where the scene has said where it is, in his own frame)
        if (ball)
          W3.set(ball.x - p.x, ball.y, ball.z - p.z)
            .applyAxisAngle(UP, -p.yaw)
            .sub(this.bones[h].position)
            .normalize();
        else if (hold === 'top') W3.set(0, -1, 0);
        else if (hold === 'under' && !left) W3.set(p.up.x + p.front.x, p.up.y + p.front.y, p.up.z + p.front.z).normalize();
        else W3.set(p.left.x, p.left.y, p.left.z).multiplyScalar(way);
        const fore = E.set(0, -1, 0).applyQuaternion(this.bones[f].quaternion);
        fore.addScaledVector(W3, -fore.dot(W3));
        if (fore.lengthSq() < 0.04) fore.set(p.front.x, p.front.y, p.front.z).addScaledVector(W3, -(p.front.x * W3.x + p.front.y * W3.y + p.front.z * W3.z));
        Yv.copy(fore).normalize().multiplyScalar(-1);
        X.copy(W3).multiplyScalar(way);
        this.bones[h].quaternion.slerp(Q.setFromRotationMatrix(MAT.makeBasis(X, Yv, Z.crossVectors(X, Yv))), grip);
        // (the puppet's hand is its wrist, a palm's depth off the ball: the palm itself goes on to the leather)
        this.bones[h].position.addScaledVector(W3, 0.06 * s * grip);
      }
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
      // his fingers: a hand with nothing in it is loose, its fingers together and curled as they fall; one on the ball
      // opens, its fingers spread over the leather and laid along it
      let from = this.bones[h];
      const spread = s * (0.92 + 0.24 * grip);
      for (const [bone, down, curl] of [
        [left ? B.kn1l : B.kn1r, KNUCKLE, 0.46 - 0.2 * grip],
        [left ? B.kn2l : B.kn2r, MIDDLE - KNUCKLE, 0.66 - 0.3 * grip],
      ] as const) {
        const b = this.bones[bone];
        b.position.copy(C.set(0, -down * s, 0).applyQuaternion(from.quaternion)).add(from.position);
        b.quaternion.copy(from.quaternion).multiply(Q.setFromAxisAngle(ZA, way * curl));
        // (across the hand is the bone's own z: wider there, the fingers stand apart)
        b.scale.set(s, s, spread);
        from = b;
      }
    }
    // (on the floor a foot rolls as the puppet says, heel to toe, where the puppet says it at all)
    for (const [f, k, n] of [
      [B.ftl, J.fl, 0],
      [B.ftr, J.fr, 1],
    ] as const) {
      at(k, A);
      const lift = Math.max(0, A.y / s - ANKLE);
      this.bones[f].position.copy(A);
      const pitch = (p.feet[n] as { pitch?: number }).pitch;
      const roll = P[I.air] > 0.5 || pitch === undefined ? Math.min(0.95, lift * 0.75) : pitch;
      this.bones[f].quaternion.setFromAxisAngle(XA, Math.max(-0.4, Math.min(1.1, roll)));
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

  /** A device that can't keep up: his plain material (no cloth's sheen, no knit up close), or back to the full one. */
  lite(on: boolean) {
    if (on && !this.mats[1]) {
      this.mats[1] = stuffMaterial(this.textures[0], this.textures[1], this.told, true);
      this.own.push(this.mats[1]);
    }
    this.mesh.material = (on && this.mats[1]) || this.mats[0];
  }

  dispose() {
    this.gone = true;
    for (const o of this.own) o.dispose();
  }
}
