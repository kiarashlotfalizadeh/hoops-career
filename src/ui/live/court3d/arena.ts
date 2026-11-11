// The building round the 3D court: a lower bowl of seats on all four sides with a crowd in it (people,
// who shift in their seats and get up with their arms in the air for a basket), a dark upper deck
// behind a lit ribbon, the scorer's table and the two benches along the far side, boards behind the
// baskets, a scoreboard and banks of lights in the roof, the floor's sheen (the building mirrored in
// the varnish, faint and blurred), and the dark where a body meets the floor.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  FrontSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { COURT_LEN } from '../choreo';
import { END, FLOOR_L, FLOOR_W, HALF_W, SIDE } from '../Court';
import type { MatchKit } from '../../teamColors';
import { FIGURE, HAIR, SHOE, SOCK } from './figure';
import { placed, type Thing } from './glb';
import type { Props } from './props';

type Keep = <T extends { dispose(): void }>(o: T) => T;

const MID = COURT_LEN / 2;
/** What a bench's warm-ups are darkened toward. */
const WARMUP = new Color('#26272c');
/** Where the seats start: behind the far boards, behind each basket's boards, and in front of the camera. */
const FAR = HALF_W + SIDE + 7.5;
const ENDX = MID + END + 9.5;
/** A row of seats: how deep, how much higher than the one in front, a seat's width. */
const DEEP = 2.6;
const RISE = 1.5;
const SEAT = 1.9;
const ROWS = 18;
const NEAR_ROWS = 3;
/** What the crowd wears: mostly dark (the lights are on the floor), a few colours, a few light. The home colour is added to it. */
const WEAR = ['#22242a', '#2a2c33', '#322f2c', '#1f232b', '#3c3934', '#272a30', '#46433f', '#6f6c67', '#2f2729', '#4a2a2c', '#27384a', '#2f4034', '#5b5446', '#8a8780'];
/** Where the banks of lights hang (the far side's five, the middle one over each end): the floor's hot spots are theirs. */
export const LAMPS: readonly (readonly [number, number, number])[] = [
  ...[-2, -1, 0, 1, 2].map((i) => [(i * 2 * (ENDX + ROWS * DEEP)) / 5.4, 47.2 + ROWS * RISE, -(FAR + ROWS * DEEP + 31)] as const),
  ...[-1, 1].map((e) => [e * (ENDX + ROWS * DEEP + 31), 47.2 + ROWS * RISE, 0] as const),
];
/** The most pools of dark the floor can take: two feet and a body for every figure on it. */
const TOUCHES = 48;

/**
 * What the crowd's shader adds to a plain lit one. aSeed is a fan's own beat. He sways and shifts in
 * his seat; as the cheer comes up he stands (the keen ones first), most with their arms in the air,
 * the rest clapping. The model (fan in scripts/blender/arena.py) says which of his points are what by
 * `aPart`, and its joints are the numbers here: change both.
 */
const CROWD_HEAD = /* glsl */ `
  attribute float aSeed;
  attribute float aPart;
  uniform float uTime;
  uniform float uCheer;
  uniform float uDim;`;
const CROWD_COLOR = /* glsl */ `
  float tone = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
  vec3 skin = mix(vec3(0.07, 0.04, 0.03), vec3(0.4, 0.27, 0.2), tone);
  // (a quarter over a part's number is its end: hair on a head, a hand on an arm, a shoe on a leg)
  bool tip = fract(aPart) > 0.1;
  vec3 wear = vColor;
  if (aPart > 3.5) {
    // his legs: trousers darker than his top (denim to khaki), shoes dark, on a few pale
    wear = color * (tip ? mix(vec3(0.012), vec3(0.22), step(0.82, fract(tone * 11.0))) : mix(vec3(0.011, 0.014, 0.024), vec3(0.07, 0.062, 0.048), fract(tone * 3.0)));
  } else if (aPart > 1.5) {
    // an arm: his hand is bare, and on some the arm below a short sleeve
    if (tip || (fract(tone * 5.0) > 0.62 && position.y < 1.3)) wear = color * skin;
  } else if (aPart > 0.5) {
    // a head: a face, and hair over the top and the back of it (dark, brown, on the fair a few light; some have none)
    float dye = fract(tone * 13.0);
    vec3 hair = dye < 0.55 ? vec3(0.014) : dye < 0.85 || tone < 0.5 ? vec3(0.07, 0.04, 0.022) : vec3(0.3, 0.24, 0.14);
    wear = color * (tip ? mix(hair, skin * 0.8, step(0.86, fract(tone * 7.0))) : skin);
  }
  vColor = wear * uDim;`;
const CROWD_MOVE = /* glsl */ `
  float beat = fract(aSeed) * 6.2831;
  float up = smoothstep(0.0, 0.35, uCheer * 1.5 - aSeed);
  float hop = up * 0.22 * abs(sin(uTime * 7.0 + beat * 9.0));
  // getting up: a thigh (1.2 long) swings up about the knee, which stays over his feet
  float swing = up * 1.5708;
  if (aPart > 3.5) {
    // a leg: the shin and the foot stay where they are; the hip's end of the thigh goes up with him
    if (transformed.z < 0.6) {
      vec2 knee = vec2(0.2, 1.2);
      vec2 r = transformed.yz - knee;
      transformed.yz = knee + vec2(r.x * cos(swing) - r.y * sin(swing), r.x * sin(swing) + r.y * cos(swing));
      transformed.y += hop;
    }
  } else {
    if (aPart > 1.5) {
      // an arm, about its shoulder: in his lap, in the air, or clapping
      vec3 piv = vec3(aPart < 2.5 ? 0.69 : -0.69, 1.55, 0.0);
      float keen = step(0.3, fract(aSeed * 7.3));
      float clap = sin(uTime * 15.0 + beat);
      float high = keen > 0.5 ? 2.7 + 0.25 * sin(uTime * 9.0 + beat * 3.0) : 1.15 + 0.2 * clap;
      float a = mix(0.6, high, up);
      vec3 r = transformed - piv;
      // (how far down the arm: the hands of those clapping come together)
      float reach = clamp(-r.y / 1.45, 0.0, 1.0);
      transformed = piv + vec3(r.x, r.y * cos(a) + r.z * sin(a), r.z * cos(a) - r.y * sin(a));
      transformed.x += sign(piv.x) * up * (keen * 0.45 * smoothstep(1.2, 2.6, transformed.y) - (1.0 - keen) * reach * reach * (0.22 + 0.08 * clap));
    }
    // the rest of him goes where the top of his thighs goes: up, and forward over his feet
    transformed.y += 1.2 * sin(swing) + hop;
    transformed.z += 1.2 * (1.0 - cos(swing));
    // (he leans from the hips, a little, on his own beat)
    float lean = transformed.y * 0.5;
    transformed.x += lean * 0.07 * sin(uTime * 0.8 + beat * 5.0);
    transformed.z += lean * (0.05 * sin(uTime * 0.37 + beat * 11.0) + 0.12 * up);
  }`;

/** A pool of dark on the floor: darkest in the middle, gone by its edge. */
const POOL = {
  vertexShader: /* glsl */ `
    attribute float aDark;
    varying float vDark;
    varying vec2 vAt;
    void main() {
      vDark = aDark;
      vAt = uv * 2.0 - 1.0;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying float vDark;
    varying vec2 vAt;
    void main() {
      float t = 1.0 - min(1.0, length(vAt));
      gl_FragColor = vec4(0.03, 0.02, 0.015, vDark * t * t * (3.0 - 2.0 * t));
    }`,
};

/** The upper deck, in the dark: flecks on ink. */
function deckTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#101011';
  ctx.fillRect(0, 0, 256, 128);
  let n = 7;
  const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
  for (let row = 0; row < 16; row++) {
    for (let i = 0; i < 46; i++) {
      const v = 18 + Math.floor(rnd() * 26);
      ctx.fillStyle = `rgb(${v + 5}, ${v + 2}, ${v})`;
      ctx.fillRect(i * 5.6 + (row % 2) * 2.8 + rnd() * 1.5, row * 8 + 2, 3.2, 4);
    }
  }
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

/** The floor's sheen: what the varnish mirrors, blurred, stronger the flatter you look across it. */
const SHEEN = {
  name: 'FloorSheen',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.85 } },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vView;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vView = cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec4 vUv;
    varying vec3 vView;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.28;
      c += (texture2D(tDiffuse, uv + vec2(0.0, 0.006)).rgb + texture2D(tDiffuse, uv - vec2(0.0, 0.006)).rgb) * 0.2;
      c += (texture2D(tDiffuse, uv + vec2(0.0035, 0.014)).rgb + texture2D(tDiffuse, uv - vec2(0.0035, 0.014)).rgb) * 0.11;
      c += (texture2D(tDiffuse, uv + vec2(-0.0035, 0.024)).rgb + texture2D(tDiffuse, uv - vec2(-0.0035, 0.024)).rgb) * 0.05;
      float graze = pow(1.0 - clamp(normalize(vView).y, 0.0, 1.0), 3.0);
      gl_FragColor = vec4(c, strength * (0.04 + 0.96 * graze));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class Arena {
  readonly group = new Group();
  private readonly boardMat = new MeshBasicMaterial({ color: 0x222222 });
  private readonly ribbonMat = new MeshBasicMaterial({ color: 0x222222 });
  private readonly bodies: InstancedMesh;
  /** The crowd as the floor's mirror draws it (see the varnish). */
  private readonly blur: InstancedMesh;
  private readonly pools: InstancedMesh;
  private readonly dark = new InstancedBufferAttribute(new Float32Array(TOUCHES), 1);
  private readonly sheen: Reflector;
  private readonly time = { value: 0 };
  private readonly cheerU = { value: 0 };
  private readonly dimU = { value: 1 };
  /** Which of the crowd wear the home colour. */
  private readonly fans: number[] = [];
  private readonly total: number;
  /** The benches: each part of the people on them (who wears which team's colours), their chairs' padding, the pads on the baskets. */
  private readonly cast: { mesh: InstancedMesh; part: string; sides: (0 | 1)[] }[] = [];
  private readonly castMats: MeshStandardMaterial[] = [];
  private readonly seatMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.75, vertexColors: true });
  private readonly team: MeshStandardMaterial;
  private board = '';
  private cheering = 0;

  constructor(keep: Keep, props: Props, people: Map<string, Thing>) {
    keep(this.boardMat);
    keep(this.ribbonMat);
    keep(this.seatMat);
    this.team = props.team;
    const dark = keep(new MeshLambertMaterial({ color: 0x17171a }));
    const add = (m: Mesh) => (this.group.add(m), m);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: MeshBasicMaterial | MeshLambertMaterial) => {
      const m = add(new Mesh(keep(new BoxGeometry(w, h, d)), mat));
      m.position.set(x, y, z);
      return m;
    };

    // the far side: the scorer's table in the middle, boards behind it; behind each basket a run of boards
    const tableZ = -(HALF_W + SIDE + 2.2);
    const table = props.table(this.boardMat);
    table.position.set(0, 0, tableZ);
    this.group.add(table);
    for (const end of [-1, 1]) box(0.5, 2.7, 44, end * (MID + END + 6.4), 1.35, 0, this.boardMat);
    box(2 * ENDX, 3, 0.5, 0, 1.5, -(FAR - 1.6), dark);

    // the seats: a slope of them on each side, and who sits in them
    const seats: { x: number; y: number; z: number; turn: number }[] = [];
    const slope: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => slope.push(...a, ...b, ...c, ...a, ...c, ...d);
    const top = ROWS * DEEP;
    const high = 1.2 + ROWS * RISE;
    quad([-ENDX, 1.2, -FAR], [ENDX, 1.2, -FAR], [ENDX + top, high, -FAR - top], [-ENDX - top, high, -FAR - top]);
    for (const e of [-1, 1]) {
      const p: number[][] = [
        [e * ENDX, 1.2, -FAR],
        [e * (ENDX + top), high, -FAR - top],
        [e * (ENDX + top), high, FAR + NEAR_ROWS * DEEP],
        [e * ENDX, 1.2, FAR + NEAR_ROWS * DEEP],
      ];
      if (e > 0) quad(p[0], p[3], p[2], p[1]);
      else quad(p[0], p[1], p[2], p[3]);
    }
    quad([ENDX, 0.2, FAR], [-ENDX, 0.2, FAR], [-ENDX, 0.2 + NEAR_ROWS * RISE, FAR + NEAR_ROWS * DEEP], [ENDX, 0.2 + NEAR_ROWS * RISE, FAR + NEAR_ROWS * DEEP]);
    const slopeGeo = keep(new BufferGeometry());
    slopeGeo.setAttribute('position', new Float32BufferAttribute(slope, 3));
    slopeGeo.computeVertexNormals();
    add(new Mesh(slopeGeo, keep(new MeshLambertMaterial({ color: 0x17171a, side: DoubleSide }))));

    let n = 11;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    /** A row of seats from `a` to `b` along one axis (an aisle every so often, a few seats empty). */
    const row = (along: 'x' | 'z', a: number, b: number, fixed: number, y: number, turn: number) => {
      const count = Math.floor((b - a) / SEAT);
      for (let i = 0; i < count; i++) {
        const at = a + (i + 0.5) * SEAT;
        if (Math.abs(Math.round(at / SEAT)) % 19 === 9 || rnd() < 0.06) continue;
        seats.push(along === 'x' ? { x: at, y, z: fixed, turn } : { x: fixed, y, z: at, turn });
      }
    };
    for (let i = 0; i < ROWS; i++) {
      const out = i * DEEP + 1.3;
      const y = 1.2 + i * RISE;
      row('x', -(ENDX + out), ENDX + out, -(FAR + out), y, 0);
      row('z', -(FAR + out), FAR + NEAR_ROWS * DEEP, -(ENDX + out), y, Math.PI / 2);
      row('z', -(FAR + out), FAR + NEAR_ROWS * DEEP, ENDX + out, y, -Math.PI / 2);
    }
    for (let i = 0; i < NEAR_ROWS; i++) row('x', -ENDX, ENDX, FAR + i * DEEP + 1.3, 0.2 + i * RISE, Math.PI);
    this.total = seats.length;

    // everyone is the one person, his own size and colours; each keeps his own beat, and gets up when the building does
    const seed = new Float32Array(this.total);
    for (let i = 0; i < this.total; i++) seed[i] = rnd();
    const mat = keep(new MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.uniforms.uCheer = this.cheerU;
      sh.uniforms.uDim = this.dimU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>${CROWD_HEAD}`)
        .replace('#include <color_vertex>', `#include <color_vertex>${CROWD_COLOR}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${CROWD_MOVE}`);
    };
    mat.customProgramCacheKey = () => 'crowd';
    // (one person, a couple of hundred triangles of him, modelled in Blender with the building's props:
    // `aPart` says which of his points are trunk, head, arms and legs, `color` is his baked shade)
    const { fan: who, far } = props.crowd();
    const beat = new InstancedBufferAttribute(seed, 1);
    who.setAttribute('aSeed', beat);
    far.setAttribute('aSeed', beat);
    this.bodies = new InstancedMesh(who, mat, this.total);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const at = new Vector3();
    const size = new Vector3();
    const c = new Color();
    seats.forEach((s, i) => {
      // (a child here and there)
      const big = rnd() < 0.05 ? 0.72 : 0.92 + rnd() * 0.18;
      q.setFromAxisAngle(up, s.turn + (rnd() - 0.5) * 0.3);
      this.bodies.setMatrixAt(i, m.compose(at.set(s.x, s.y + 0.9, s.z), q, size.set(big, big, big)));
      if (rnd() < 0.2) this.fans.push(i);
      this.bodies.setColorAt(i, c.set(WEAR[Math.floor(rnd() * WEAR.length)]));
    });
    this.bodies.frustumCulled = false;
    this.group.add(this.bodies);
    // (the same people in the same seats and colours, a trunk and a head each: only the mirror shows them)
    this.blur = new InstancedMesh(far, mat, 0);
    this.blur.instanceMatrix = this.bodies.instanceMatrix;
    this.blur.instanceColor = this.bodies.instanceColor;
    this.blur.count = this.total;
    this.blur.frustumCulled = false;
    this.blur.visible = false;
    this.group.add(this.blur);

    // the benches: eight chairs a side and a player in each, in his kit (some lean on their knees, some sit
    // back); their coach on his feet by the table, arms folded. They are the players' own model, posed in Blender.
    const chairs: { x: number; y: number; z: number; turn: number }[] = [];
    const sitters: { at: Matrix4; side: 0 | 1 }[][] = [[], []];
    const coaches: { at: Matrix4; side: 0 | 1 }[] = [];
    for (const side of [0, 1] as const) {
      const e = side ? 1 : -1;
      for (let i = 0; i < 8; i++) {
        const x = e * (20 + i * 2.5);
        chairs.push({ x, y: 0, z: tableZ - 0.3, turn: 0 });
        const big = 0.96 + rnd() * 0.1;
        q.setFromAxisAngle(up, (rnd() - 0.5) * 0.3 - e * 0.08);
        sitters[rnd() < 0.5 ? 0 : 1].push({ at: new Matrix4().compose(at.set(x, 0, tableZ - 0.3), q, size.set(big, big, big)), side });
      }
      q.setFromAxisAngle(up, -e * 0.3);
      coaches.push({ at: new Matrix4().compose(at.set(e * 18.9, 0, tableZ + 1.9), q, size.set(0.95, 0.95, 0.95)), side });
    }
    this.group.add(props.chairs(chairs, this.seatMat));
    const stage = (name: string, who: { at: Matrix4; side: 0 | 1 }[]) => {
      const thing = people.get(name);
      if (!thing) throw new Error(`people.glb has no ${name}`);
      if (!who.length) return;
      for (const part of placed(thing)) {
        // (every copy takes its own colours: see dress)
        const cloth = part.material !== 'skin' && part.material !== 'shoe' && part.material !== 'white';
        const pm = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: cloth ? 0.82 : 0.55, vertexColors: true, side: cloth ? DoubleSide : FrontSide }));
        const mesh = new InstancedMesh(keep(part.geo), pm, who.length);
        who.forEach((w, i) => mesh.setMatrixAt(i, w.at));
        mesh.frustumCulled = false;
        keep(mesh);
        this.castMats.push(pm);
        this.cast.push({ mesh, part: name === 'coach' && part.material === 'shoe' ? 'dress' : part.material, sides: who.map((w) => w.side) });
        this.group.add(mesh);
      }
    };
    stage('benchA', sitters[0]);
    stage('benchB', sitters[1]);
    stage('coach', coaches);

    // where a body meets the floor (see touch)
    const pool = keep(new PlaneGeometry(2, 2));
    pool.rotateX(-Math.PI / 2);
    this.dark.setUsage(DynamicDrawUsage);
    pool.setAttribute('aDark', this.dark);
    this.pools = new InstancedMesh(pool, keep(new ShaderMaterial({ ...POOL, transparent: true, depthWrite: false })), TOUCHES);
    this.pools.instanceMatrix.setUsage(DynamicDrawUsage);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 3;
    this.group.add(this.pools);

    // above the seats: a lit ribbon, the upper deck in the dark, lights and a scoreboard in the roof
    const deck = keep(deckTexture());
    const lamp = keep(new MeshBasicMaterial({ color: 0xfff1dc }));
    const tier = (wide: number, x: number, z: number, turn: number) => {
      const g = new Group();
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      const band = new Mesh(keep(new BoxGeometry(wide, 2.4, 0.6)), this.ribbonMat);
      band.position.set(0, high + 4.2, 0);
      const wall = new Mesh(keep(new BoxGeometry(wide, 7, 0.4)), dark);
      wall.position.set(0, high + 1, -0.6);
      const tex = keep(deck.clone());
      tex.needsUpdate = true;
      tex.repeat.set(wide / 40, 2.2);
      const seatsUp = new Mesh(keep(new PlaneGeometry(wide + 60, 58)), keep(new MeshBasicMaterial({ map: tex })));
      seatsUp.rotation.x = -0.72;
      seatsUp.position.set(0, high + 26, -24);
      g.add(band, wall, seatsUp);
      // (a bank of lights over each side: what the floor's varnish catches)
      for (let i = -2; i <= 2; i++) {
        const bank = new Mesh(keep(new PlaneGeometry(wide * 0.11, 3.2)), lamp);
        bank.position.set((i * wide) / 5.4, high + 46, -30);
        bank.rotation.x = 0.5;
        g.add(bank);
      }
      this.group.add(g);
    };
    tier(2 * (ENDX + top), 0, -(FAR + top + 1), 0);
    tier(2 * (FAR + top), -(ENDX + top + 1), 0, Math.PI / 2);
    tier(2 * (FAR + top), ENDX + top + 1, 0, -Math.PI / 2);
    const scoreboard = props.scoreboard(this.ribbonMat);
    scoreboard.position.set(0, 62, 0);
    this.group.add(scoreboard);

    // the varnish
    this.sheen = new Reflector(keep(new PlaneGeometry(FLOOR_L, FLOOR_W)), { textureWidth: 640, textureHeight: 400, clipBias: 0.02, shader: SHEEN });
    this.sheen.rotation.x = -Math.PI / 2;
    this.sheen.position.y = 0.012;
    this.sheen.renderOrder = 2;
    const sm = this.sheen.material as unknown as { transparent: boolean; depthWrite: boolean };
    sm.transparent = true;
    sm.depthWrite = false;
    keep(this.sheen);
    this.group.add(this.sheen);
    // The mirror draws the whole scene a second time, and the crowd is most of the scene's triangles.
    // What the varnish shows of the stands is small and smeared, but it is there (most of all from the low
    // camera at a free throw): for that pass each of the crowd is his trunk and his head.
    const mirror = this.sheen.onBeforeRender;
    this.sheen.onBeforeRender = (...at) => {
      this.bodies.visible = false;
      this.blur.visible = true;
      mirror.apply(this.sheen, at);
      this.blur.visible = false;
      this.bodies.visible = true;
    };
  }

  /** The building's colour (the home team's on its own floor): the boards, the ribbon, the pads on the baskets, the benches' chairs, a fifth of the crowd. */
  paint(board: string) {
    if (board === this.board) return;
    this.board = board;
    this.boardMat.color.set(board);
    this.ribbonMat.color.set(board).multiplyScalar(0.8);
    this.team.color.set(board);
    this.seatMat.color.set(board).multiplyScalar(0.75);
    const c = new Color(board).multiplyScalar(0.5);
    for (const i of this.fans) this.bodies.setColorAt(i, c);
    this.bodies.instanceColor!.needsUpdate = true;
  }

  /** The benches in tonight's kits; each coach in a dark suit, his tie his team's colour. */
  dress(kits: [MatchKit, MatchKit]) {
    const c = new Color();
    const wear = (part: string, kit: MatchKit, i: number): string => {
      switch (part) {
        case 'hair':
          // (one of the figures' few crops each, as on the floor)
          return HAIR[(i * 3 + 1) % HAIR.length];
        case 'jersey':
        case 'cloth':
          // (warm-ups over their kit, dark in the team's colour: the bench is not five more men in the play)
          return `#${c.set(kit.color).lerp(WARMUP, 0.62).getHexString()}`;
        case 'trim':
          return kit.token.ring;
        case 'tie':
          return kit.light ? kit.token.ring : kit.token.fill;
        case 'shoe':
          return kit.light ? kit.token.ring : SHOE;
        case 'white':
          return SOCK;
        case 'shirt':
          return '#e6e5e1';
        case 'suit':
          return '#353740';
        case 'dress':
          return '#151517';
        default:
          return FIGURE;
      }
    };
    for (const { mesh, part, sides } of this.cast) {
      sides.forEach((side, i) => mesh.setColorAt(i, c.set(wear(part, kits[side], i))));
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  /** How much of their light the people in the stands keep (1: all of it), and those on the benches. */
  dim(to: number, bench = to) {
    this.dimU.value = to;
    for (const m of this.castMats) m.color.setScalar(bench);
  }

  /** A basket: the building gets up for it (all of it for the home team, a few for the visitors). */
  cheer(much: number) {
    this.cheering = Math.max(this.cheering, much);
  }

  /** Time passes (ms): the crowd sways, a cheer dies down. `calm` keeps it still. */
  update(real: number, calm: boolean) {
    if (calm) {
      this.cheering = 0;
      this.cheerU.value = 0;
      return;
    }
    this.time.value += real / 1000;
    this.cheering = Math.max(0, this.cheering - real / 2600);
    this.cheerU.value += (Math.min(1, this.cheering * 1.6) - this.cheerU.value) * (1 - Math.exp(-real / 180));
  }

  /**
   * The dark where a body meets the floor, one pool of it: `r` ft across the middle, `dark` at its
   * darkest. A foot gets a small deep one (fainter and wider as it leaves the floor), a body a wide
   * faint one: the thrown shadow alone leaves him floating.
   */
  touch(i: number, x: number, z: number, r: number, dark: number) {
    if (i >= TOUCHES) return;
    const e = this.pools.instanceMatrix.array;
    e.fill(0, i * 16, i * 16 + 16);
    e[i * 16] = e[i * 16 + 10] = r;
    e[i * 16 + 5] = e[i * 16 + 15] = 1;
    e[i * 16 + 12] = x;
    e[i * 16 + 13] = 0.02;
    e[i * 16 + 14] = z;
    this.dark.array[i] = dark;
  }

  /** How many pools there are this frame. */
  touched(n: number) {
    this.pools.count = Math.min(n, TOUCHES);
    this.pools.instanceMatrix.needsUpdate = true;
    this.dark.needsUpdate = true;
  }

  /** A device that can't keep up: no mirror in the floor. */
  lite(on: boolean) {
    this.sheen.visible = !on;
  }
}
