// One figure on the 3D court: an athlete's body, modelled in Blender (scripts/blender/figure.py), one
// skin over the puppet's joints. Shoulders run into arms without a seam, the head has a face, the
// hands have fingers and the feet sneakers; he wears a V-neck vest tucked into shorts, whose legs
// swing a beat behind his thighs. Builds differ (height, shoulders, how thick the limbs are), and so
// do the men: each has a skin, a head of hair, a beard and a face of his own (look.ts), made up from
// his id, never a likeness.
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
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  BufferAttribute,
  BufferGeometry,
} from 'three';
import type { MatchKit } from '../../teamColors';
import { CLIPS, I } from './clips';
import { merged, type Thing } from './glb';
import { lookOf, STYLES, type Look } from './look';
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
} as const;
const BONES = 25;
/** Where the fingers' two joints are down the hand from the wrist, ft (figure.py's KNUCKLE and MIDDLE). */
const KNUCKLE = 0.4;
const MIDDLE = 0.545;
/** Where his jaw and his nose are scaled about, from the head bone (figure.py's JAW_AT and NOSE_AT). */
const JAW_AT = new Vector3(0, 0.045 - 0.42 * 0.42, 0.05 + 0.25 * 0.37);
const NOSE_AT = new Vector3(0, 0.045 - 0.2 * 0.42, 0.05 + 0.8 * 0.37);
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
/** His shoes' upper (along the foot, round it) and their soles (along, up). */
const R_SHOE: Rect = [0, 768, 512, 192];
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
const R_SKIN: Rect = [672, 992, 160, 32];
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
/** The middle of a shoe's cross-section, from the ankle (ft): round it is its picture's second way. */
const SHOE_MID = -0.1;
/** A shoe's length (heel to toe, from the ankle) and its sole's height, ft. */
const SHOE_Z = [-0.36, 0.74] as const;
const SOLE_H = 0.15;

/** Which picture each point takes its colour from. */
const Pic = { Vest: 0, Trim: 1, Shorts: 2, Head: 3, Skin: 4, ArmL: 5, ArmR: 6, LegL: 7, LegR: 8, Shoe: 9, Sole: 10, Hair: 11 } as const;
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
};
/** Hair that is a shape of its own on the model (a man wears one of them or none: see STYLES). */
const PIECES = ['bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'];
/** Those of them that are curls, not strands: their half of the hair's picture is tufts. */
const TUFTED = ['afro', 'hightop', 'curls', 'twists'];
/** Which of a picture's two ways goes round (0 across, 1 up; -1 neither): a triangle across its seam is given points of its own. */
const ROUND: Partial<Record<Pic, 0 | 1>> = { [Pic.Shorts]: 0, [Pic.Head]: 0, [Pic.Shoe]: 1 };

export interface Geo {
  /** The body: one shape, every point of it placed on the sheet (with no hair but what is painted on him). */
  body: BufferGeometry;
  /** The body with one of the model's pieces of hair on it (a bun, a tail, twists, locks, braids), or `body` for none. */
  wearing(piece: string | null): BufferGeometry;
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
  const made = new Map<string | null, BufferGeometry>();
  const wearing = (name: string | null) => {
    const key = name !== null && PIECES.includes(name) ? name : null;
    let g = made.get(key);
    if (!g) {
      g = keep(new BufferGeometry());
      for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
      const tris = all.filter((_v, i) => piece[Math.floor(i / 3)] === '' || piece[Math.floor(i / 3)] === key);
      g.setIndex(geo.getAttribute('position').count > 65535 ? tris : new BufferAttribute(Uint16Array.from(tris), 1));
      made.set(key, g);
    }
    return g;
  };
  geo.dispose();
  return { body: wearing(null), wearing, wears: materials, order, inverse, shorts, blob, ring };
}

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
    if (PIECES.includes(w)) return Pic.Hair;
    // (the white below the ankle is a sole; above it, a sock: the bottom of its leg's strip)
    if (w === 'white') return L.copy(P).applyMatrix4(foot).y < -0.06 ? Pic.Sole : P.x > 0 ? Pic.LegL : Pic.LegR;
    // (his head is all his head bone's, with his jaw and nose; his neck, which shares it with his chest, is his trunk's skin)
    if (weight(v, [B.head, B.jaw, B.nose]) >= 0.995) return Pic.Head;
    if (weight(v, [B.ual, B.fal, B.hal]) >= 0.5) return Pic.ArmL;
    if (weight(v, [B.uar, B.far, B.har]) >= 0.5) return Pic.ArmR;
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
      case Pic.Head:
        // (his head, hair and all, round its middle from behind: his face is half way round)
        L.copy(P).applyMatrix4(inv[B.head]).sub(HEAD_MID);
        return [headU(Math.atan2(L.x, L.z)) % 1, headV(Math.atan2(L.y, Math.hypot(L.x, L.z)))];
      case Pic.Hair:
        // (a lock's own run of the hair's picture: along it by where it is on him)
        // (combed hair in the left half of the hair's picture, a head of curls in the right)
        return [(TUFTED.includes(wear[v]) ? 0.75 : 0.25) + 0.2 * Math.sin(P.x * 6 + P.z * 8), 0.5 + 0.45 * Math.sin(P.y * 7)];
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
  for (let f = 0; f < corners.length; f += 3) piece.push(PIECES.includes(wear[corners[f]]) ? wear[corners[f]] : '');
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
  beard: [0.8, 0.2, 0],
  vest: [0.86, 0.85, 1],
  // (a number is pressed on: smoother than the knit round it, and none of its sheen)
  print: [0.55, 0.12, 0],
  shorts: [0.78, 0.9, 0.7],
  rib: [0.8, 0.6, 0.45],
  sock: [0.92, 0.7, 0.55],
  sleeve: [0.5, 0.45, 0.25],
  terry: [0.95, 0.85, 0.8],
  leather: [0.4, 0, 0],
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
  const iris = rgbOf(look.eyes);
  const bandRgb = band ? rgbOf(band) : null;
  // (lips are the skin's colour, redder; darker skin's are browner than they are red)
  const lip: Rgb = [skin[0] * 0.84 + 0.03, skin[1] * 0.64, skin[2] * 0.66 + 0.01];
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
      let stuff: Stuff = 'skin';
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
        stuff = 'face';
        // blood under the skin of his cheeks, nose and ears; his brow catches the light and sweats
        if (py < 0.3 && py > -0.75) to([skin[0] * 1.04, skin[1] * 0.88, skin[2] * 0.85], 0.55 * bump(apx, py, 0.56, -0.24, 0.24, 0.2) + 0.5 * bump(px, py, 0, -0.22, 0.13, 0.12));
        if (py > 0.3 && py < 0.66) stuff = 'sweat';
        // the hollows: round the eyes, under the brow, beside and under the nose, under the lower lip, under the jaw
        if (py > -0.2 && py < 0.4 && apx < 0.9) shade(0.2 * bump(apx, py, 0.38, 0.09, 0.2, 0.1) + 0.1 * bump(apx, py, 0.2, 0.05, 0.07, 0.12));
        if (py > -0.47 && py < -0.24 && apx < 0.45) shade(0.22 * bump(px, py, 0, -0.345, 0.15, 0.03) + 0.5 * bump(apx, py, 0.085, -0.318, 0.04, 0.022));
        if (py > -0.8 && py < -0.15 && apx < 0.5) shade(0.16 * bump(px, py, 0, -0.68, 0.17, 0.035) + 0.1 * bump(apx, py, 0.3, -0.43, 0.035, 0.12));
        // his mouth: the upper lip with its bow, the fuller lower one, the line between them
        const mw = 0.275;
        const my = -0.52;
        if (apx < mw + 0.03) {
          const t = Math.min(1, apx / mw);
          const arch = Math.pow(1 - t * t, 0.6);
          const up = my + 0.058 * arch * (1 - 0.2 * Math.exp(-((t / 0.14) ** 2)));
          const low = my - 0.082 * Math.pow(1 - t * t, 0.8);
          const inLip = sstep(low - 0.008, low + 0.008, py) * sstep(up + 0.008, up - 0.008, py) * sstep(mw + 0.02, mw - 0.02, apx);
          if (inLip > 0) {
            to(py < my ? [lip[0] * 1.07, lip[1] * 1.05, lip[2] * 1.05] : lip, inLip * 0.85);
            // (the lower lip's shine)
            to([1, 0.95, 0.92], 0.1 * inLip * bump(px, py, 0, my - 0.04, 0.12, 0.016));
            if (inLip > 0.5) stuff = 'lip';
          }
          to([skin[0] * 0.2, skin[1] * 0.12, skin[2] * 0.12], 0.85 * sstep(0.011, 0.004, Math.abs(py - my + 0.012 * t * t)) * sstep(mw + 0.02, mw - 0.03, apx));
        }
        // his eyes: the white between its lids, the iris and pupil, a light in it; lashes, the fold over the lid
        const ex = apx - 0.38;
        const ey = py - 0.066;
        const ew = 0.138;
        if (Math.abs(ex) < ew + 0.05 && Math.abs(ey) < 0.12) {
          const t = clamp01(Math.abs(ex) / ew);
          // (the outer corner sits a little higher than the inner one)
          const tilt = 0.012 * (ex / ew);
          const up = tilt + 0.056 * Math.pow(1 - t * t, 0.55);
          const low = tilt - 0.037 * Math.pow(1 - t * t, 0.8);
          const open = sstep(low - 0.005, low + 0.005, ey) * sstep(up + 0.005, up - 0.005, ey) * (Math.abs(ex) < ew ? 1 : 0);
          to([skin[0] * 0.5, skin[1] * 0.42, skin[2] * 0.4], 0.35 * sstep(0.03, 0.0, Math.abs(ey - up - 0.03)) * sstep(ew + 0.04, ew - 0.03, Math.abs(ex)));
          if (open > 0) {
            const white: Rgb = [0.7, 0.66, 0.62];
            // (the lid's shadow on the top of the eye; its corners redder)
            const lidShade = 0.55 + 0.45 * sstep(up, up - 0.04, ey);
            to([white[0] * lidShade, white[1] * lidShade * (1 - 0.12 * t), white[2] * lidShade * (1 - 0.14 * t)], open);
            const r = Math.hypot(ex / 0.06, (ey - 0.01) / 0.043);
            if (r < 1.12) {
              const ir = sstep(1.12, 0.94, r) * open;
              to([iris[0] * (1.25 - 0.6 * r) * lidShade, iris[1] * (1.25 - 0.6 * r) * lidShade, iris[2] * (1.25 - 0.6 * r) * lidShade], ir);
              to([0.02, 0.015, 0.015], sstep(0.5, 0.38, r) * open + 0.5 * sstep(0.85, 1.0, r) * ir);
              // (the light in his eye, up and toward his nose's other side: the same side in both)
              to([1, 1, 1], 0.55 * open * sstep(0.2, 0.08, Math.hypot((px - Math.sign(px) * 0.38 - 0.02) / 0.06, (ey - 0.024) / 0.043)));
            }
            if (open > 0.5) stuff = 'eye';
          }
          // lashes along the upper lid, a thinner line under the lower one
          to([0.07, 0.05, 0.04], 0.9 * sstep(0.013, 0.004, Math.abs(ey - up - 0.004)) * sstep(ew + 0.02, ew - 0.01, Math.abs(ex)));
          to([skin[0] * 0.45, skin[1] * 0.36, skin[2] * 0.34], 0.5 * sstep(0.008, 0.002, Math.abs(ey - low + 0.003)) * sstep(ew, ew - 0.03, Math.abs(ex)));
        }
        // his eyebrows: from beside the nose up to their peak and down to a tail, heavier or lighter
        const q = (apx - 0.15) / 0.52;
        if (q > -0.05 && q < 1.05 && py > 0.12 && py < 0.36) {
          const yb = 0.2 + 0.07 * Math.sin(Math.min(1, q * 1.15) * Math.PI * 0.62) - 0.035 * sstep(0.7, 1, q);
          const thick = (0.02 + 0.022 * look.brow) * (1 - 0.55 * q * q) + 0.004;
          const on = sstep(thick, thick * 0.45, Math.abs(py - yb)) * sstep(-0.03, 0.08, q) * sstep(1.03, 0.9, q);
          to([hair[0] * 0.9, hair[1] * 0.9, hair[2] * 0.9], on * (0.55 + 0.4 * look.brow) * (0.75 + 0.25 * fine()));
        }
      }

      // his beard: stubble, a goatee round his mouth, or all of his jaw (shorter up his cheeks)
      if (look.beard > 0 && nz > -0.25 && ny < 0.15) {
        const fz = Math.max(nz, 0.3);
        const px = (nx / fz) * 0.8;
        const py = (ny / fz) * 0.8;
        const apx = Math.abs(px);
        const front = nz > 0.3 ? 1 : 0;
        // (round the mouth: over the lip, down beside it, the chin; never on the lips)
        const lips = front * sstep(0.3, 0.26, apx) * sstep(-0.617, -0.602, py) * sstep(-0.447, -0.462, py);
        const tache = front * sstep(-0.34, -0.375, py) * sstep(-0.53, -0.47, py) * sstep(0.36, 0.3, apx) * (1 - 0.7 * bump(px, py, 0, -0.39, 0.035, 0.03));
        const bars = front * sstep(0.2, 0.26, apx) * sstep(0.4, 0.34, apx) * sstep(-0.47, -0.53, py) * sstep(-0.95, -0.8, py);
        const chin = sstep(-0.635, -0.695, py) * sstep(0.42, 0.34, apx) * front * sstep(-1.25, -1.0, py);
        const round = Math.max(tache, bars, chin) * (1 - lips);
        // (his jaw and cheeks: under a line from his ear down to the corner of his mouth, as far as under his chin)
        const cheek = sstep(0.05, -0.09, ny + 0.52 - 0.62 * (ax - 0.3) - 0.5 * (ax - 0.3) * (ax - 0.3)) * sstep(-0.99, -0.9, ny) * sstep(-0.25, -0.1, nz) * (1 - lips);
        let on = 0;
        let deep = 0;
        if (look.beard === 1) on = Math.max(round, cheek) * (0.3 + 0.12 * fine());
        else if (look.beard === 2) {
          on = round * (0.82 + 0.18 * fine());
          deep = 0.008 * round;
        } else {
          on = Math.max(round, cheek) * (0.84 + 0.16 * fine());
          deep = (look.beard === 4 ? 0.035 + 0.05 * sstep(-0.55, -0.9, ny) : 0.012) * Math.max(round, cheek);
        }
        if (on > 0) {
          const g = 0.8 + 0.3 * fine();
          to([hair[0] * g, hair[1] * g, hair[2] * g], on);
          if (on > 0.5) stuff = 'beard';
          lift = Math.max(lift, deep);
        }
      }

      // his hair: over the hairline, as he wears it
      const round = Math.atan2(ax, nz);
      const line = ny - hairlineAt(round);
      if (line > -0.12) {
        const over = (soft: number) => clamp01(line / soft + 0.3);
        // (how far up from the hairline of his sides and back: a fade is skin there and hair by the crown; never at his forehead)
        const fade = Math.max(sstep(0.0, 0.3, line), sstep(1.0, 0.45, round));
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
            cover = (0.66 + 0.12 * fine()) * over(0.06);
            break;
          case 'fade':
            cover = 0.94 * over(0.07) * (0.2 + 0.8 * fade);
            lift = 0.02 * fade * over(0.05);
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
            lift = 0.01 + 0.05 * sstep(0.3, 0.7, ny) * over(0.05) + 0.025 * sstep(0.35, 0.9, nz) * sstep(0.5, 0.7, ny);
            tex = 0.7 + 0.6 * streak;
            break;
        }
        if (cover > 0) {
          to([hair[0] * tex, hair[1] * tex, hair[2] * tex], cover);
          if (cover > 0.4) stuff = 'hair';
          else if (ny > 0.3) stuff = 'scalp';
        }
      } else if (nz < 0.1 && ny > -0.5 && ax > 0.8) {
        // (his ears: redder than his cheeks, their bowl in shade)
        to([skin[0] * 1.02, skin[1] * 0.86, skin[2] * 0.84], 0.4);
        shade(0.3 * bump(nz, ny, -0.22, -0.05, 0.1, 0.12));
      }
      if (bandRgb && ny > 0.1 && Math.abs(ny - 0.34 - 0.13 * nz) < 0.062) {
        c[0] = bandRgb[0];
        c[1] = bandRgb[1];
        c[2] = bandRgb[2];
        stuff = 'terry';
        lift = Math.max(lift * 0.5, 0.012);
      }
      const o = (j * w + i) * 4;
      img.data[o] = c[0] * 255;
      img.data[o + 1] = c[1] * 255;
      img.data[o + 2] = c[2] * 255;
      img.data[o + 3] = 255;
      if (i % sk === 0 && j % sk === 0) {
        const so = ((j / sk) * sw + i / sk) * 4;
        const v = STUFF[stuff];
        simg.data[so] = v[0] * 255;
        simg.data[so + 1] = v[1] * 255;
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

/** A man's own things, the same every night (from his seed): a headband, what he wears on his arms and legs, his shoes. */
interface Gear {
  band: string | null;
  /** A shooting sleeve: on which arm (0 left, 1 right) and its colour. */
  sleeve: { arm: 0 | 1; color: string } | null;
  wrist: { arms: (0 | 1)[]; color: string } | null;
  /** On one leg or both: a knee sleeve, or one down the whole leg. */
  leg: { legs: (0 | 1)[]; long: boolean; color: string } | null;
  /** How far up his socks come (a share of the sock: 0 all of it). */
  sockDrop: number;
  shoe: { base: string; accent: string; sole: string; lace: string };
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
  const shoe = { base, accent, sole: one(pale ? [WHITE, WHITE, '#2a2b30'] : [WHITE, '#2a2b30', '#2a2b30']), lace: pale ? one([WHITE, accent]) : one([base, WHITE]) };
  return { band, sleeve, wrist, leg, sockDrop: one([0, 0, 0.12, 0.25]), shoe };
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

  // plain patches
  sh.fill(R_SKIN, look.skin, 'skin');
  sh.fill(R_TRIM, ring, 'rib');
  // (his locks: the hair's colour, a little lighter and darker along them)
  sh.both(R_HAIR, (ctx, pick) => {
    const [, , w, h] = R_HAIR;
    ctx.fillStyle = pick(look.hair, 'hair');
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 24; k++) {
      ctx.fillStyle = pick(mix(look.hair, k % 2 ? '#000000' : '#8a7460', 0.22), 'hair');
      ctx.fillRect(0, ((k * 7) % 31) + 0.5, w / 2, 1.6);
    }
    // (the right half in tufts: curls are not combed)
    for (let k = 0; k < 150; k++) {
      ctx.fillStyle = pick(mix(look.hair, k % 3 ? '#000000' : '#9a8068', 0.26), 'hair');
      ctx.beginPath();
      ctx.arc(w / 2 + 3 + ((k * 37) % (w / 2 - 6)), (k * 13) % h, 1.2 + (k % 3) * 0.8, 0, Math.PI * 2);
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
    } else {
      // socks from the shoe up to mid-calf (lower for some), a band of the team's colour at the top of a white one
      const sock = kit.light ? WHITE : kit.color;
      const top = 2.4 + gear.sockDrop * 0.5;
      if (gear.leg?.legs.includes(side)) span(gear.leg.long ? 0.9 : 1.3, gear.leg.long ? top + 0.05 : 2.05, gear.leg.color, 'sleeve');
      span(top, len, sock, 'sock');
      span(top + 0.07, top + 0.13, sock === WHITE ? kit.color : WHITE, 'sock');
    }
  }

  // the shoes: along the foot (heel to toe), round it from under the sole (the top half way, his outside three quarters)
  const { base, accent, sole, lace } = gear.shoe;
  sh.both(R_SHOE, (ctx, pick) => {
    // (a turn round the foot is up the picture here: drawn with y the share of a turn from under the
    // sole, 192 to the turn, its top at 96 and his outside at 144, and again a turn either side)
    const [, , w, h] = R_SHOE;
    for (const turn of [-1, 0, 1]) {
      ctx.save();
      ctx.translate(0, h);
      ctx.scale(w / 512, -h / (192 * (1 + 2 * WRAP)));
      ctx.translate(0, (WRAP + turn) * 192);
      ctx.fillStyle = pick(base, 'leather');
      ctx.fillRect(-10, -10, 532, 212);
      // the toe box, a mesh a shade off the leather; the heel's counter and a panel each side in the second colour
      ctx.fillStyle = pick(mix(base, light(base) > 0.5 ? '#000000' : '#ffffff', 0.1), 'mesh');
      ctx.fillRect(0.8 * 512, -10, 120, 212);
      ctx.fillStyle = pick(accent, 'leather');
      ctx.fillRect(-10, -10, 0.17 * 512 + 10, 212);
      for (const out of [1, -1]) {
        // (up the side of the foot is toward 96 from either side: it climbs toward the heel)
        const mid = 96 + out * 50;
        ctx.beginPath();
        ctx.moveTo(0.16 * 512, mid - out * 34);
        ctx.lineTo(0.62 * 512, mid - out * 8);
        ctx.lineTo(0.67 * 512, mid + out * 4);
        ctx.lineTo(0.16 * 512, mid + out * 14);
        ctx.closePath();
        ctx.fill();
      }
      // the laces up the top of the foot, over a tongue
      ctx.fillStyle = pick(mix(base, '#000000', 0.18), 'mesh');
      ctx.fillRect(0.4 * 512, 96 - 15, 0.42 * 512, 30);
      ctx.fillStyle = pick(lace, 'lace');
      for (let k = 0; k < 6; k++) ctx.fillRect((0.43 + k * 0.062) * 512, 96 - 13, 8, 26);
      ctx.restore();
    }
  });
  // the soles: the tread at the bottom, the foam over it, a line of the stripe's colour round the top
  sh.both(R_SOLE, (ctx, pick) => {
    const [, , w, h] = R_SOLE;
    ctx.fillStyle = pick(sole, 'rubber');
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = pick(sole === WHITE ? '#3a3b40' : '#202125', 'rubber');
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    ctx.fillStyle = pick(accent, 'rubber');
    ctx.fillRect(0, h * 0.12, w, h * 0.07);
  });
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
}`;
/** The knit's stitches: this many to the sheet's width (a few millimetres apart on his vest), and how deep they are (ft: a tenth of a millimetre). */
const KNIT = 640;
const KNIT_DEEP = 0.0003;
/** How much light of its own his head has (a share of its colour). */
const FACE_FILL = '0.32';
/** How deep the folds his vest and shorts hang in are, ft. */
const FOLD_DEEP = 0.013;

/** Where his head is on the sheet (in uv): there the stuff picture's third channel is how far his hair stands off him, not a knit. */
const HEAD_UV = [R_HEAD[0] / SHEET, 1 - (R_HEAD[1] + R_HEAD[3]) / SHEET, (R_HEAD[0] + R_HEAD[2]) / SHEET, 1 - R_HEAD[1] / SHEET].map((v) => v.toFixed(4));
const ON_HEAD = (uv: string) => `( ${uv}.x > ${HEAD_UV[0]} && ${uv}.y > ${HEAD_UV[1]} && ${uv}.y < ${HEAD_UV[3]} )`;

/**
 * His material, from his sheet and its stuff picture. `plain` (a device that can't keep up) is a
 * standard material with the same picture, roughness and hair, but none of a cloth's sheen or knit.
 */
function stuffMaterial(map: CanvasTexture, stuff: CanvasTexture, plain = false): MeshStandardMaterial {
  const m = plain
    ? new MeshStandardMaterial({ map, vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0 })
    : new MeshPhysicalMaterial({ map, vertexColors: true, side: DoubleSide, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uStuff = { value: stuff };
    // his hair stands off his head by as much as his crop says (pushed out as built, before his bones carry it)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uStuff;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nif ${ON_HEAD('uv')} transformed += normal * textureLod( uStuff, uv, 0.0 ).b * ${HAIR_MAX.toFixed(3)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${STUFF_PARS}`)
      // (skin's hollows are warm, not grey: the shade baked into him takes less of its red than of its blue)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `vec4 stuff = texture2D( uStuff, vMapUv );
        float skinK = smoothstep( 0.92, 0.98, stuff.g );
        diffuseColor.rgb *= mix( vColor.rgb, pow( vColor.rgb, vec3( 0.84, 1.03, 1.16 ) ), skinK );`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = stuff.r;')
      // (and what light comes to it off the building is warmer on it than on cloth: a little of it has been through him)
      // (his head has a little light of its own, most where it faces the camera: under the arena's top light a face is read by it)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), vec3( 1.07, 0.98, 0.93 ), skinK );
        if ${ON_HEAD('vMapUv')} reflectedLight.indirectDiffuse += diffuseColor.rgb * ${FACE_FILL} * ( 0.35 + 0.65 * saturate( dot( normal, normalize( vViewPosition ) ) ) );`,
      );
    if (plain) return;
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        if ( stuff.b > 0.02 && ! ${ON_HEAD('vMapUv')} ) {
          // (his vest and shorts hang in folds: broad ones, there at any distance)
          float folds = smoothstep( 0.62, 0.7, stuff.b ) * ( 1.0 - skinK );
          if ( folds > 0.0 ) {
            float fh = 0.6 * sin( vMapUv.x * 96.0 + 3.0 * sin( vMapUv.y * 23.0 ) ) + 0.4 * sin( vMapUv.x * 41.0 - vMapUv.y * 33.0 + 2.0 * sin( vMapUv.y * 47.0 ) );
            // (across a seam of the picture the folds jump: no fold is that steep)
            normal = knitNormal( - vViewPosition, normal, clamp( vec2( dFdx( fh ), dFdy( fh ) ), -0.4, 0.4 ) * ${FOLD_DEEP} * folds, faceDirection );
          }
          vec2 kp = vMapUv * ${KNIT.toFixed(1)};
          // (gone well before a stitch is a pixel across: at the broadcast's distance it would be a grid of dots)
          float fine = 1.0 - smoothstep( 0.07, 0.24, length( fwidth( kp ) ) );
          if ( fine > 0.0 ) {
            float h = sin( kp.x * 6.2832 ) * sin( kp.y * 6.2832 + 1.4 * sin( kp.x * 3.1416 ) );
            normal = knitNormal( - vViewPosition, normal, vec2( dFdx( h ), dFdy( h ) ) * ${KNIT_DEEP} * stuff.b * fine, faceDirection );
          }
        }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
        // (skin has a soft edge of its own against the light, warmer than cloth's)
        material.sheenColor = mix( stuff.g * mix( vec3( 1.0 ), diffuseColor.rgb, 0.45 ) * 0.7, vec3( 0.95, 0.6, 0.45 ) * 0.14, skinK );`,
      );
  };
  m.customProgramCacheKey = () => (plain ? 'figure-plain' : 'figure');
  return m;
}

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
const UP = new Vector3(0, 1, 0);
const XA = new Vector3(1, 0, 0);
const ZA = new Vector3(0, 0, 1);

/** A point of the cloth that follows where it hangs from, a beat late. */
interface Lag {
  at: Vector3;
  v: Vector3;
  set: boolean;
}

export class Fig {
  readonly group = new Group();
  readonly pup: Puppet;
  readonly side: 0 | 1;
  /** The team's letters on his kit (none in a highlight): another set dresses him again. */
  readonly mark: string;
  private readonly bones: Bone[] = [];
  /** Each limb's hinge (the line its elbow or knee folds about), kept for when it's straight. */
  private readonly hinge = [new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0)];
  private readonly lag: Lag[] = [0, 1].map(() => ({ at: new Vector3(), v: new Vector3(), set: false }));
  private last = 0;
  readonly shadow: Mesh;
  readonly ring: Mesh;
  private readonly own: { dispose(): void }[] = [];
  private gone = false;
  private readonly mesh: SkinnedMesh;
  /** His material, and its plain twin once a slow device has asked for it (see lite). */
  private readonly mats: [MeshStandardMaterial, MeshStandardMaterial | null];
  private readonly textures: [CanvasTexture, CanvasTexture];

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
    const mat = stuffMaterial(map, stuff);
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
    scale(B.pelvis, bulk * s, s, deep);
    scale(B.chest, bulk * s, s, deep);
    scale(B.hem, bulk * s, s, deep);
    // (and each has a face of his own: a wider or a longer head, his jaw, his nose)
    const hs = Math.sqrt(s) * 1.06;
    const face = look.face;
    scale(B.head, hs * face.wide, hs * face.long, hs);
    scale(B.jaw, hs * face.wide * face.jaw, hs * face.long * face.chin, hs);
    scale(B.nose, hs * face.wide * face.nose, hs * face.long, hs * face.bridge);
    scale(B.hair, hs * face.wide, hs * face.long, hs);
    for (const k of [B.kn1l, B.kn2l, B.kn1r, B.kn2r]) scale(k, s, s, s);
    for (const k of [B.ual, B.fal, B.uar, B.far, B.thl, B.shl, B.thr, B.shr, B.hemL, B.hemR]) scale(k, thick, s, thick);
    for (const k of [B.hal, B.har, B.ftl, B.ftr]) scale(k, s, s, s);
    const mesh = new SkinnedMesh(geo.wearing(STYLES[look.style].piece), mat);
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
    ] as const) {
      const b = this.bones[k];
      b.position.copy(A.copy(from).multiply(head.scale).applyQuaternion(head.quaternion)).add(head.position);
      b.quaternion.copy(head.quaternion);
    }
    // (in the air, at the top of his effort, his mouth comes open a little)
    this.bones[B.jaw].quaternion.multiply(Q.setFromAxisAngle(XA, 0.11 * Math.min(1, Math.max(0, P[I.air]))));
    // hair that hangs swings a beat behind him, as far as the puppet says his cloth lags (in his own frame, ft)
    const lag = (p as { trailSlow?: { x: number; z: number }; trail?: { x: number; z: number } }).trailSlow ?? (p as { trail?: { x: number; z: number } }).trail;
    if (lag)
      this.bones[B.hair].quaternion
        .multiply(Q.setFromAxisAngle(XA, Math.max(-0.5, Math.min(0.5, lag.z * 0.6))))
        .multiply(Q.setFromAxisAngle(ZA, Math.max(-0.4, Math.min(0.4, -lag.x * 0.6))));

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
      // his fingers: a hand that hangs curls them a little; one on the ball closes them round it
      let from = this.bones[h];
      for (const [bone, down, curl] of [
        [left ? B.kn1l : B.kn1r, KNUCKLE, 0.12 + 0.16 * grip],
        [left ? B.kn2l : B.kn2r, MIDDLE - KNUCKLE, 0.24 + 0.14 * grip],
      ] as const) {
        const b = this.bones[bone];
        b.position.copy(C.set(0, -down * s, 0).applyQuaternion(from.quaternion)).add(from.position);
        b.quaternion.copy(from.quaternion).multiply(Q.setFromAxisAngle(ZA, way * curl));
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

    // cloth: each leg of the shorts down its thigh, a beat late
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.group.updateMatrixWorld(true);
    const cloth = (n: number, bone: number, anchor: Vector3, q: Quaternion, give: number) => {
      const l = this.lag[n];
      const want = C.copy(anchor);
      this.group.localToWorld(want);
      if (!l.set || dt === 0 || l.at.distanceTo(want) > 3) {
        l.at.copy(want);
        l.v.set(0, 0, 0);
        l.set = true;
      } else {
        // a spring to where it hangs, damped; it never stretches far
        l.v.addScaledVector(D.copy(want).sub(l.at), 260 * dt).multiplyScalar(Math.exp(-14 * dt));
        l.at.addScaledVector(l.v, dt);
        D.copy(l.at).sub(want);
        const far = D.length();
        if (far > give * s) l.at.copy(want).addScaledVector(D, (give * s) / far);
      }
      const b = this.bones[bone];
      b.position.copy(this.group.worldToLocal(D.copy(l.at)));
      b.quaternion.copy(q);
    };
    // (the vest is tucked in: its bone stays with his hips)
    this.bones[B.hem].position.copy(this.bones[B.pelvis].position);
    this.bones[B.hem].quaternion.copy(hipQ);
    for (const [n, bone, th, a, k] of [
      [0, B.hemL, B.thl, J.jl, J.kl],
      [1, B.hemR, B.thr, J.jr, J.kr],
    ] as const) {
      at(a, A).lerp(at(k, E), (THIGH - 0.7) / THIGH);
      cloth(n, bone, A, this.bones[th].quaternion, 0.2);
    }

    this.shadow.position.set(p.x, 0.03, p.z);
    this.ring.position.set(p.x, 0.045, p.z);
  }

  /** A device that can't keep up: his plain material (no cloth's sheen, no knit up close), or back to the full one. */
  lite(on: boolean) {
    if (on && !this.mats[1]) {
      this.mats[1] = stuffMaterial(this.textures[0], this.textures[1], true);
      this.own.push(this.mats[1]);
    }
    this.mesh.material = (on && this.mats[1]) || this.mats[0];
  }

  dispose() {
    this.gone = true;
    for (const o of this.own) o.dispose();
  }
}
