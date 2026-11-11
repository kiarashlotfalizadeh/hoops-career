// One figure on the 3D court: an athlete's body, modelled in Blender (scripts/blender/figure.py), one
// skin over the puppet's joints. Shoulders run into arms without a seam, the head has a face, the
// hands have fingers and the feet sneakers; he wears a V-neck vest tucked into shorts, whose legs
// swing a beat behind his thighs. Builds differ (height, shoulders, how thick the limbs are); the
// tone doesn't: one neutral colour for everyone, and no likeness.
import {
  Bone,
  CanvasTexture,
  DoubleSide,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { MatchKit } from '../../teamColors';
import { I } from './clips';
import { merged, type Thing } from './glb';
import { ANKLE, J, Puppet, THIGH, type Body } from './puppet';

/** The figures' own colour: one neutral tone for everyone (they are figurines, not likenesses). */
export const FIGURE = '#7b7d88';
/** Their hair, cropped close: the same tone darker, or none (a shaved head is the skin's colour). Which one is a figure's own. */
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
} as const;
const BONES = 18;

export interface Geo {
  /** The body, a group of it for each material in `wears`. */
  body: BufferGeometry;
  wears: string[];
  /** The skin counts its bones in the model's order: which of ours each is, and the way back to it from the body as built. */
  order: number[];
  inverse: Matrix4[];
  blob: BufferGeometry;
  ring: BufferGeometry;
}

/** A shared material for a plain colour: `both` draws the inside of cloth too (a sleeve hole shows it). */
export type Mats = (color: string, rough?: number, both?: boolean) => Material;

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
  const blob = keep(new CircleGeometry(1.25, 20));
  blob.rotateX(-Math.PI / 2);
  const ring = keep(new RingGeometry(1.55, 1.85, 28));
  ring.rotateX(-Math.PI / 2);
  return { body: keep(geo), wears: materials, order, inverse: fig.bones.map((b) => b.inverse), blob, ring };
}

/** The vest's cloth: the kit's colour, a panel down each side, his number front and back and his name over it on the back (its trim is sewn on: see the model). */
function jerseyTexture(num: string, name: string, kit: MatchKit): CanvasTexture {
  // (drawn at twice the size it's laid out in: a close-up reads the name)
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = kit.token.fill;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = kit.token.ring;
  // (the picture starts at his side: the back is a quarter of the way round, the front three)
  for (const x of [0, 256, 512]) ctx.fillRect(x - 13, 0, 26, 256);
  ctx.fillStyle = kit.token.num;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${num.length > 1 ? 84 : 92}px "Archivo Variable", system-ui, sans-serif`;
  for (const x of [128, 384]) ctx.fillText(num, x, 116, 104);
  if (name) {
    // (spaced out and no wider than his shoulder blades, as a name is sewn on)
    ctx.font = '700 19px "Archivo Variable", system-ui, sans-serif';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.5px';
    ctx.fillText(name.toUpperCase(), 128, 53, 112);
  }
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
  private readonly bones: Bone[] = [];
  /** Each limb's hinge (the line its elbow or knee folds about), kept for when it's straight. */
  private readonly hinge = [new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0)];
  private readonly lag: Lag[] = [0, 1].map(() => ({ at: new Vector3(), v: new Vector3(), set: false }));
  private last = 0;
  readonly shadow: Mesh;
  readonly ring: Mesh;
  private readonly own: { dispose(): void }[] = [];

  constructor(geo: Geo, mats: Mats, body: Body, side: 0 | 1, kit: MatchKit, num: string, look = 0, name = '') {
    this.pup = new Puppet(body);
    this.side = side;
    const { s, bulk } = body;
    const tex = jerseyTexture(num, name, kit);
    // (every hollow's shade is on the skin and the cloth themselves: see the model)
    const jersey = new MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, vertexColors: true, side: DoubleSide });
    const skin = new MeshStandardMaterial({ color: FIGURE, roughness: 0.52, metalness: 0, vertexColors: true });
    this.own.push(tex, jersey, skin);
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
    const hs = Math.sqrt(s);
    scale(B.head, hs, hs, hs);
    for (const k of [B.ual, B.fal, B.uar, B.far, B.thl, B.shl, B.thr, B.shr, B.hemL, B.hemR]) scale(k, thick, s, thick);
    for (const k of [B.hal, B.har, B.ftl, B.ftr]) scale(k, s, s, s);
    const wear: Record<string, Material> = {
      skin,
      hair: mats(HAIR[Math.abs(look) % HAIR.length], 0.78),
      jersey,
      trim: mats(kit.token.ring, 0.8, true),
      cloth: mats(kit.token.fill, 0.82, true),
      shoe: mats(kit.light ? kit.token.ring : SHOE, 0.45),
      white: mats(SOCK, 0.7),
    };
    const mesh = new SkinnedMesh(
      geo.body,
      geo.wears.map((name) => wear[name] ?? skin),
    );
    const bones = new Skeleton(
      geo.order.map((k) => this.bones[k]),
      geo.inverse,
    );
    this.own.push(bones);
    mesh.bind(bones, new Matrix4());
    mesh.castShadow = true;
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
    }
    for (const [f, k] of [
      [B.ftl, J.fl],
      [B.ftr, J.fr],
    ] as const) {
      at(k, A);
      const lift = Math.max(0, A.y / s - ANKLE);
      this.bones[f].position.copy(A);
      this.bones[f].quaternion.setFromAxisAngle(XA, Math.min(0.95, lift * 0.75));
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

  dispose() {
    for (const o of this.own) o.dispose();
  }
}
