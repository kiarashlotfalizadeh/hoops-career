// The building round the 3D court: a lower bowl of seats on all four sides with a crowd in it (people,
// who shift in their seats and get up with their arms in the air for a basket), a dark upper deck
// behind a lit ribbon, the scorer's table and the two benches along the far side, boards behind the
// baskets, a scoreboard and banks of lights in the roof, the floor's sheen (the building mirrored in
// the varnish, faint and blurred), and the dark where a body meets the floor. The boards show the game
// (boards.ts); the crowd answers it: the home crowd up for its own, towels out late with the home side
// defending, the end behind the basket waving at a visitor's free throw, a hush and the visitors' few
// up for theirs, cameras going off for the big ones (fx.ts), and at a home win all of it on its feet
// under confetti.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DepthTexture,
  DoubleSide,
  DynamicDrawUsage,
  FrontSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COURT_LEN } from '../choreo';
import { END, FLOOR_L, FLOOR_W, HALF_W, SIDE, type GameInfo, type Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import { BIG, Boards } from './boards';
import { FIGURE, HAIR, SHOE, SOCK } from './figure';
import { Confetti, Flashes } from './fx';
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
/** How much of the light the crowd keeps while it sits. */
const SAT = 0.8;
/** The most pools of dark the floor can take: two feet and a body for every figure on it. */
const TOUCHES = 48;
/** The visitors' block: from x to x on the far side, rows this to that (most of its seats theirs). */
const VISITORS = [24, 40, 2, 8];
/** One seat in this many has a camera or a phone up when something happens. */
const FLASH_SHARE = 0.22;
/**
 * How many of the cameras go off (a share of their moments): now and then while a play is on, a few for
 * a late free throw, a burst for a big moment (the home side's bigger), a building of them at the buzzer.
 */
const FLASH_IDLE = 0.004;
const FLASH_LINE = 0.05;
const FLASH_BIG = 0.5;
const FLASH_FINAL = 0.32;
/** How long a big moment's flashes, towels and hush last (ms). */
const FLASH_MS = 2600;
const TOWEL_MS = 3200;
const HUSH_MS = 5000;
/** How much of a cheer the home crowd stands to late in a close game while its side defends (about half of it up). */
const STAND = 0.4;

/**
 * What the crowd's shader adds to a plain lit one. aSeed is a fan's own beat, aKind who he is for: 0 the
 * home side, 1 the same with a towel, 2 the visitors. He sways and shifts in his seat; as the cheer comes
 * up he stands (the keen ones first), most with their arms in the air, the rest clapping. A towel goes
 * round over his head (uWave); in the end behind the basket a visitor shoots free throws at, the home
 * crowd gets up and waves both arms (uRally, uEnd: that end's side of x); the visitors' fans get up for
 * their own (uAway), and the rest hold still while they do (uHush). The model (fan in
 * scripts/blender/arena.py) says which of his points are what by `aPart`, and its joints are the
 * numbers here: change both. `fanAt` is where one of his points is (the towels in their hands use it too).
 */
const FAN_MOVE = /* glsl */ `
  uniform float uTime;
  uniform float uCheer;
  uniform float uAway;
  uniform float uWave;
  uniform float uHush;
  uniform float uRally;
  uniform float uEnd;
  float fanRally(float kind, mat4 seat) {
    // (a seat in the end stands faces along x; which end, its side of the floor)
    vec3 facing = seat[2].xyz;
    return kind > 1.5 ? 0.0 : uRally * step(0.7 * length(facing), abs(facing.x)) * step(0.0, seat[3].x * uEnd);
  }
  vec3 fanAt(vec3 p, float part, float seed, float kind, mat4 seat) {
    float beat = fract(seed) * 6.2831;
    bool away = kind > 1.5;
    float rally = fanRally(kind, seat);
    float towel = kind > 0.5 && kind < 1.5 ? max(uWave, rally) : 0.0;
    float up = max(smoothstep(0.0, 0.35, (away ? uAway : uCheer) * 1.5 - seed), max(towel, rally));
    float hop = up * 0.22 * abs(sin(uTime * 7.0 + beat * 9.0));
    // getting up: a thigh (1.2 long) swings up about the knee, which stays over his feet
    float swing = up * 1.5708;
    if (part > 3.5) {
      // a leg: the shin and the foot stay where they are; the hip's end of the thigh goes up with him
      if (p.z < 0.6) {
        vec2 knee = vec2(0.2, 1.2);
        vec2 r = p.yz - knee;
        p.yz = knee + vec2(r.x * cos(swing) - r.y * sin(swing), r.x * sin(swing) + r.y * cos(swing));
        p.y += hop;
      }
      return p;
    }
    if (part > 1.5) {
      // an arm, about its shoulder: in his lap, in the air, or clapping; a towel round over his head in one
      // hand, and in a rally both arms up and waving
      vec3 piv = vec3(part < 2.5 ? 0.69 : -0.69, 1.55, 0.0);
      float keen = step(0.3, fract(seed * 7.3));
      float clap = sin(uTime * 15.0 + beat);
      float high = keen > 0.5 ? 2.7 + 0.25 * sin(uTime * 9.0 + beat * 3.0) : 1.15 + 0.2 * clap;
      bool cloth = part < 2.5 && towel > 0.0;
      float wave = max(part < 2.5 ? towel : 0.0, rally);
      float a = mix(mix(0.6, high, up), 2.85, wave);
      vec3 r = p - piv;
      // (how far down the arm: the hands of those clapping come together)
      float reach = clamp(-r.y / 1.45, 0.0, 1.0);
      r = vec3(r.x, r.y * cos(a) + r.z * sin(a), r.z * cos(a) - r.y * sin(a));
      // (side to side about the shoulder: a towel fast and wide, empty hands slower)
      float sw = wave * (cloth ? 0.6 * sin(uTime * 8.0 + beat * 4.0) : 0.38 * sin(uTime * 4.6 + beat));
      r.xy = vec2(r.x * cos(sw) - r.y * sin(sw), r.x * sin(sw) + r.y * cos(sw));
      p = piv + r;
      p.x += sign(piv.x) * up * (1.0 - wave) * (keen * 0.45 * smoothstep(1.2, 2.6, p.y) - (1.0 - keen) * reach * reach * (0.22 + 0.08 * clap));
    }
    // the rest of him goes where the top of his thighs goes: up, and forward over his feet
    p.y += 1.2 * sin(swing) + hop;
    p.z += 1.2 * (1.0 - cos(swing));
    // (he leans from the hips, a little, on his own beat; the home crowd holds still while the visitors celebrate)
    float still = away ? 1.0 : 1.0 - 0.85 * uHush;
    float lean = p.y * 0.5;
    p.x += lean * 0.07 * sin(uTime * 0.8 + beat * 5.0) * still;
    p.z += lean * (0.05 * sin(uTime * 0.37 + beat * 11.0) * still + 0.12 * up);
    return p;
  }`;
const CROWD_HEAD = /* glsl */ `
  attribute float aSeed;
  attribute float aPart;
  attribute float aKind;
  uniform float uDim;
  ${FAN_MOVE}`;
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
  transformed = fanAt(transformed, aPart, aSeed, aKind, instanceMatrix);`;

/**
 * A towel in a fan's hand (the hand of his arm `aPart` 2: in the model, hanging, at TOWEL_HAND): held by a
 * corner and streaming out past it, trailing the way his arm goes, flapping; folded away in his lap
 * while he isn't waving it. The towel is a strip of cloth: position x across it (-0.5 to 0.5), y along it.
 */
const TOWEL_HAND = [0.42, 0.07, 0.24];
const TOWEL_MOVE = /* glsl */ `
  float beat = fract(aSeed) * 6.2831;
  float on = max(uWave, fanRally(1.0, instanceMatrix));
  vec3 hand = fanAt(vec3(${TOWEL_HAND.join(', ')}), 2.25, aSeed, 1.0, instanceMatrix);
  vec3 elbow = fanAt(vec3(0.55, 0.8, 0.12), 2.0, aSeed, 1.0, instanceMatrix);
  vec3 along = normalize(hand - elbow);
  vec3 across = normalize(cross(along, vec3(0.0, 0.0, 1.0)));
  float ph = uTime * 8.0 + beat * 4.0;
  float t = position.y;
  vec3 cloth = hand + along * (0.05 + t * 1.05) + across * position.x * 0.46 * (1.0 - 0.35 * t) - across * cos(ph) * t * t * 0.6;
  // (it curls across, and ripples down its length)
  cloth.z += (position.x * position.x * 0.5 + sin(ph * 1.7 + t * 4.5) * 0.16) * t;
  vec3 transformed = mix(hand, cloth, smoothstep(0.05, 0.4, on));`;

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

/** The upper deck, in the dark: rows of people up its slope (see paintDeck), DECK_FT of it across the picture. */
function deckTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 768;
  paintDeck(cv, '#2a2c33');
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** How soft the mirror gets with height: the blur (of the picture's height) for each ft over the floor, for each ft the floor is from the camera. */
const SHEEN_SOFT = '0.06';
/** How sharp the mirror is drawn: this much of the picture's own size, but this many dots across at least and at most (and on a device that has stepped down, at most as it was drawn before). */
const SHEEN_SHARP = 0.55;
const SHEEN_LEAST = 480;
const SHEEN_MOST = 1280;
const SHEEN_LITE = 640;

/**
 * The floor's sheen: what the varnish mirrors, stronger the flatter you look across it, and blurred the
 * more the higher over the floor what it shows is (a glossy floor's reflection is sharp where a foot meets
 * it and soft by the head): `tDepth` is the mirror's depth, `uUnproject` takes it back to the building.
 */
const SHEEN = {
  name: 'FloorSheen',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    tDepth: { value: null },
    textureMatrix: { value: null },
    uUnproject: { value: null },
    uSize: { value: null },
    strength: { value: 0.85 },
  },
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
    uniform sampler2D tDepth;
    uniform mat4 uUnproject;
    uniform vec2 uSize;
    uniform float strength;
    varying vec4 vUv;
    varying vec3 vView;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      // how high over the floor what the mirror shows here is (ft); how far apart its samples go for it,
      // drawn out up and down the picture (toward the camera, as a rough floor draws a reflection)
      float depth = texture2D(tDepth, uv).r;
      vec4 at = uUnproject * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      // (nothing drawn there, or so far off the mirror's tipped clip runs out: the roof, high up)
      float high = at.w <= 0.0 || depth > 0.9999 ? 200.0 : clamp(at.y / at.w, 0.0, 200.0);
      vec2 r = vec2(0.32, 1.0) * clamp((0.05 + high) * ${SHEEN_SOFT} / max(length(vView), 1.0), 0.0, 0.03);
      float lod = log2(max(r.y * uSize.y * 0.4, 1.0));
      vec3 c = textureLod(tDiffuse, uv, lod * 0.5).rgb * 0.24;
      c += (textureLod(tDiffuse, uv + r * vec2(0.5, 0.25), lod).rgb + textureLod(tDiffuse, uv - r * vec2(0.5, 0.25), lod).rgb) * 0.16;
      c += (textureLod(tDiffuse, uv + r * vec2(-0.6, 0.55), lod).rgb + textureLod(tDiffuse, uv - r * vec2(-0.6, 0.55), lod).rgb) * 0.12;
      c += (textureLod(tDiffuse, uv + r * vec2(0.15, 0.95), lod).rgb + textureLod(tDiffuse, uv - r * vec2(0.15, 0.95), lod).rgb) * 0.1;
      float graze = pow(1.0 - clamp(normalize(vView).y, 0.0, 1.0), 3.0);
      gl_FragColor = vec4(c, strength * (0.04 + 0.96 * graze));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class Arena {
  readonly group = new Group();
  /** The boards, and what the building knows of the game (they read it). */
  readonly boards: Boards;
  private readonly bodies: InstancedMesh;
  /** The crowd as the floor's mirror draws it (see the varnish). */
  private readonly blur: InstancedMesh;
  private readonly pools: InstancedMesh;
  private readonly dark = new InstancedBufferAttribute(new Float32Array(TOUCHES), 1);
  private readonly sheen: Reflector;
  /** From the mirror's picture back to the building (see SHEEN). */
  private readonly unproject = new Matrix4();
  private readonly time = { value: 0 };
  private readonly cheerU = { value: 0 };
  private readonly dimU = { value: 1 };
  private readonly awayU = { value: 0 };
  private readonly waveU = { value: 0 };
  private readonly hushU = { value: 0 };
  private readonly rallyU = { value: 0 };
  private readonly endU = { value: -1 };
  private dimTo = 1;
  /** Which of the crowd wear the home colour (some with a towel), and which the visitors'. */
  private readonly fans: number[] = [];
  private readonly visitors: number[] = [];
  private readonly towels: InstancedMesh;
  private readonly towelMat: MeshBasicMaterial;
  private readonly flashes: Flashes;
  private readonly confetti: Confetti;
  private readonly deck: CanvasTexture;
  /** The roof's steel and the lights on it (only a camera looking up sees them: the first thing a slow device gives up). */
  private readonly steel: Object3D[];
  private readonly total: number;
  /** The benches: each part of the people on them (who wears which team's colours), their chairs' padding, the pads on the baskets. */
  private readonly cast: { mesh: InstancedMesh; part: string; sides: (0 | 1)[] }[] = [];
  private readonly castMats: MeshStandardMaterial[] = [];
  private readonly seatMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.75, vertexColors: true });
  private readonly team: MeshStandardMaterial;
  private board = '';
  private cheering = 0;
  // the visitors' fans up, the rest holding still, the towels out, the end behind a visitor's free throw up (each eased)
  private awayUp = 0;
  private hush = 0;
  private wave = 0;
  private rally = 0;
  /** How long the game has been over (ms of the clock's real time). */
  private overMs = 0;

  constructor(keep: Keep, props: Props, people: Map<string, Thing>) {
    keep(this.seatMat);
    this.boards = new Boards(keep);
    this.team = props.team;
    const dark = keep(new MeshLambertMaterial({ color: 0x17171a }));
    const add = (m: Mesh) => (this.group.add(m), m);

    // the far side: the scorer's table in the middle, boards behind it; behind each basket a run of boards
    const tableZ = -(HALF_W + SIDE + 2.2);
    const table = props.table(this.boards.tableFace());
    table.position.set(0, 0, tableZ);
    this.group.add(table);
    this.boards.clockFace(props.clock);
    // (every dark box round the bowl, these and the ribbon's and the walls under the deck, is one shape: one draw)
    const darks: BufferGeometry[] = [];
    const dark3 = (w: number, h: number, d: number, x: number, y: number, z: number) => darks.push(new BoxGeometry(w, h, d).translate(x, y, z));
    for (const end of [-1, 1] as const) {
      dark3(0.5, 2.7, 44, end * (MID + END + 6.4), 1.35, 0);
      this.boards.end(end * (MID + END + 6.4 - 0.26), 1.38, 43.6, 2.5, end > 0 ? -1 : 1);
    }
    dark3(2 * ENDX, 3, 0.5, 0, 1.5, -(FAR - 1.6));
    this.boards.farSide(0, 1.58, -(FAR - 1.6) + 0.26, 2 * ENDX - 0.6, 2.5);

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
    const crowdU = { uTime: this.time, uCheer: this.cheerU, uAway: this.awayU, uWave: this.waveU, uHush: this.hushU, uRally: this.rallyU, uEnd: this.endU };
    const mat = keep(new MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, crowdU);
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
    const kinds = new Float32Array(this.total);
    const kind = new InstancedBufferAttribute(kinds, 1);
    who.setAttribute('aKind', kind);
    far.setAttribute('aKind', kind);
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
    // (who is for whom comes from its own numbers: the crowd's sizes and colours stay as they were)
    let k = 29;
    const pick = () => ((k = (k * 16807) % 2147483647) & 0xffff) / 0xffff;
    const home = new Set(this.fans);
    seats.forEach((s, i) => {
      // the visitors' fans: a block of them up on the far side, and a few here and there
      const row = (s.y - 1.2) / RISE;
      if (!home.has(i) && ((s.turn === 0 && s.x > VISITORS[0] && s.x < VISITORS[1] && row >= VISITORS[2] && row <= VISITORS[3] && pick() < 0.8) || pick() < 0.02)) {
        kinds[i] = 2;
        this.visitors.push(i);
      } else if (home.has(i) && pick() < 0.45) kinds[i] = 1;
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

    // the towels in the hands of those who brought one (see TOWEL_MOVE), each in his seat and on his beat
    const waving = seats.flatMap((_, i) => (kinds[i] === 1 ? [i] : []));
    const cloth = keep(new PlaneGeometry(1, 1, 1, 3));
    cloth.translate(0, 0.5, 0);
    cloth.setAttribute(
      'aSeed',
      new InstancedBufferAttribute(
        Float32Array.from(waving, (i) => seed[i]),
        1,
      ),
    );
    this.towelMat = keep(new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }));
    this.towelMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, crowdU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aSeed;${FAN_MOVE}`)
        .replace('#include <begin_vertex>', TOWEL_MOVE)
        // (it catches the light as it turns over)
        .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vColor *= 0.62 + 0.38 * abs(cos(ph + t * 2.0));');
    };
    this.towelMat.customProgramCacheKey = () => 'towel';
    this.towels = new InstancedMesh(cloth, this.towelMat, waving.length);
    waving.forEach((i, n) => {
      this.bodies.getMatrixAt(i, m);
      this.towels.setMatrixAt(n, m);
      this.towels.setColorAt(n, c.set(n % 2 ? '#888' : '#f2f0ea'));
    });
    this.towels.frustumCulled = false;
    this.towels.visible = false;
    keep(this.towels);
    this.group.add(this.towels);

    // cameras in the stands: a share of the seats, held up over a head toward the floor, and some up in the deck (see tier)
    const cams: number[] = [];
    for (const s of seats) if (pick() < FLASH_SHARE) cams.push(s.x + 0.6 * Math.sin(s.turn), s.y + 4.5, s.z + 0.6 * Math.cos(s.turn));

    // the benches: eight chairs a side, his assistant in the first and a player in each of the others, in his
    // kit (some lean on their knees, some sit back with a towel); their coach on his feet in front of his
    // assistant, arms folded (the two are one thing: see people.py). They are the players' own model, posed in Blender.
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
        const pose = rnd() < 0.5 ? 0 : 1;
        if (i) sitters[pose].push({ at: new Matrix4().compose(at.set(x, 0, tableZ - 0.3), q, size.set(big, big, big)), side });
      }
      // (turned toward the middle of the floor: the head coach, in front of his assistant, stands to the table's side of him)
      q.setFromAxisAngle(up, -e * 0.35);
      coaches.push({ at: new Matrix4().compose(at.set(e * 20, 0, tableZ - 0.3), q, size.set(1, 1, 1)), side });
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

    // above the seats: a lit ribbon, the upper deck in the dark, lights and a scoreboard in the roof (each kind of
    // thing all round the bowl one shape, a draw, not one a side)
    this.deck = keep(deckTexture());
    const lamp = keep(new MeshBasicMaterial({ color: 0xfff1dc }));
    const decks: BufferGeometry[] = [];
    const banks: BufferGeometry[] = [];
    const tier = (wide: number, x: number, z: number, turn: number) => {
      const g = new Matrix4().compose(at.set(x, 0, z), q.setFromAxisAngle(up, turn), size.set(1, 1, 1));
      const put = (geo: BufferGeometry, px: number, py: number, pz: number, tilt = 0) =>
        geo.applyMatrix4(new Matrix4().makeRotationX(tilt).setPosition(px, py, pz)).applyMatrix4(g);
      // (the ribbon: a dark box, its lamps on the face toward the floor)
      darks.push(put(new BoxGeometry(wide, 2.4, 0.6), 0, high + 4.2, 0));
      this.boards.ribbon(x + 0.31 * Math.sin(turn), high + 4.2, z + 0.31 * Math.cos(turn), wide, 2.3, turn);
      // (and cameras up in the deck: points on its slope, turned and put where the tier is)
      for (let i = 0; i < wide * 0.5; i++) {
        const along = (pick() - 0.5) * (wide + 40);
        const up = (pick() - 0.4) * 50;
        const ly = high + 26 + up * Math.cos(0.72);
        const lz = -24 - up * Math.sin(0.72);
        cams.push(x + along * Math.cos(turn) + lz * Math.sin(turn), ly + 1.5, z - along * Math.sin(turn) + lz * Math.cos(turn));
      }
      darks.push(put(new BoxGeometry(wide, 7, 0.4), 0, high + 1, -0.6));
      const seatsUp = new PlaneGeometry(wide + 60, 58);
      const uv = seatsUp.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * (wide + 60)) / DECK_FT);
      decks.push(put(seatsUp, 0, high + 26, -24, -0.72));
      // (a bank of lights over each side: what the floor's varnish catches)
      for (let i = -2; i <= 2; i++) banks.push(put(new PlaneGeometry(wide * 0.11, 3.2), (i * wide) / 5.4, high + 46, -30, 0.5));
      roof.rig(wide, g, high + 46);
    };
    const roof = new Roof();
    tier(2 * (ENDX + top), 0, -(FAR + top + 1), 0);
    tier(2 * (FAR + top), -(ENDX + top + 1), 0, Math.PI / 2);
    tier(2 * (FAR + top), ENDX + top + 1, 0, -Math.PI / 2);
    const one = (list: BufferGeometry[], mat: MeshBasicMaterial | MeshLambertMaterial) => {
      const geo = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (geo) add(new Mesh(keep(geo), mat));
    };
    one(darks, dark);
    one(decks, keep(new MeshBasicMaterial({ map: this.deck })));
    one(banks, lamp);
    // the roof: trusses over the floor and the lights on them, the banners on the far side's
    this.steel = roof.build(keep, this.group);
    this.boards.banners(roof.banners);
    this.boards.build();
    this.group.add(this.boards.group);
    this.flashes = new Flashes(keep, cams);
    this.group.add(this.flashes.points);
    this.confetti = new Confetti(keep);
    this.group.add(this.confetti.mesh);
    const scoreboard = props.scoreboard(this.boards.ringFace(), this.boards.screenFace());
    scoreboard.position.set(0, 62, 0);
    this.group.add(scoreboard);

    // the varnish (its picture keeps its depth, for how soft each part of it is, and its sizes down, to be read soft)
    this.sheen = new Reflector(keep(new PlaneGeometry(FLOOR_L, FLOOR_W)), { textureWidth: 640, textureHeight: 400, clipBias: 0.02, shader: SHEEN });
    const shot = this.sheen.getRenderTarget();
    shot.depthTexture = new DepthTexture(640, 400);
    shot.texture.generateMipmaps = true;
    shot.texture.minFilter = LinearMipmapLinearFilter;
    const su = (this.sheen.material as ShaderMaterial).uniforms;
    su.tDepth.value = shot.depthTexture;
    su.uUnproject.value = this.unproject;
    su.uSize.value = new Vector2(640, 400);
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
      const cam = this.sheen.camera;
      this.unproject.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
      this.blur.visible = false;
      this.bodies.visible = true;
    };
  }

  /** The building's colour (the home team's on its own floor): the pads on the baskets, the benches' chairs, a fifth of the crowd and some of their towels. */
  paint(board: string) {
    if (board === this.board) return;
    this.board = board;
    this.boards.paint(board);
    this.team.color.set(board);
    paintDeck(this.deck.image as HTMLCanvasElement, `#${new Color(board).multiplyScalar(0.55).getHexString()}`);
    this.deck.needsUpdate = true;
    this.seatMat.color.set(board).multiplyScalar(0.75);
    const c = new Color(board).multiplyScalar(0.5);
    for (const i of this.fans) this.bodies.setColorAt(i, c);
    this.bodies.instanceColor!.needsUpdate = true;
    c.set(board);
    for (let i = 1; i < this.towels.count; i += 2) this.towels.setColorAt(i, c);
    if (this.towels.instanceColor) this.towels.instanceColor.needsUpdate = true;
  }

  /** The benches in tonight's kits; each coach in a dark suit, his tie his team's colour. The visitors' fans in theirs; the boards and the confetti in both. */
  dress(kits: [MatchKit, MatchKit]) {
    const c = new Color();
    this.boards.dress(kits);
    this.confetti.colours(kits[0].color, kits[0].trim);
    c.set(kits[1].color).multiplyScalar(0.5);
    for (const i of this.visitors) this.bodies.setColorAt(i, c);
    this.bodies.instanceColor!.needsUpdate = true;
    const wear = (part: string, kit: MatchKit, i: number): string => {
      switch (part) {
        case 'hair':
          // (one of the figures' few crops each, as on the floor)
          return HAIR[(i * 3 + 1) % HAIR.length];
        case 'jersey':
        case 'cloth':
          // (warm-ups over their kit, dark in the team's colour: the bench is not five more men in the play)
          return `#${c.set(kit.color).lerp(WARMUP, 0.7).getHexString()}`;
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

  /** How much of their light the people in the stands keep (1: all of it), and those on the benches; the boards with them. */
  dim(to: number, bench = to) {
    this.dimTo = to;
    for (const m of this.castMats) m.color.setScalar(bench);
    this.boards.dim(to, bench);
  }

  /**
   * A basket: the building gets up for it (all of it for the home team's big ones). For the visitors' it is
   * their fans who get up, and the rest go quiet.
   */
  cheer(much: number) {
    if (this.boards.house.off === 1) {
      this.awayUp = Math.max(this.awayUp, much >= 0.2 ? 1 : 0.5);
      this.hush = Math.max(this.hush, much >= 0.2 ? 1 : 0.3);
      return;
    }
    this.cheering = Math.max(this.cheering, much);
  }

  /** A device that can't keep up, a step at a time (Court3D's STEPS): the roof's steel gone and the boards painted less often (1), half the cameras and a third of the confetti (2). */
  shed(level: 0 | 1 | 2) {
    for (const o of this.steel) o.visible = level < 1;
    this.boards.lite(level > 0);
    this.flashes.lite(level > 1);
    this.confetti.lite(level > 1);
  }

  /**
   * Time passes (ms): the boards read the game off the stage (none in the scene lab: they keep what they
   * were told), the crowd sways, a cheer dies down, and what the moment calls for comes up: towels, the end
   * behind a visitor's free throw, the cameras, the ovation. `calm` keeps it still.
   */
  update(real: number, calm: boolean, stage?: Stage, p?: { game?: GameInfo; final?: 0 | 1; clutch?: boolean }) {
    const h = this.boards.house;
    if (stage) h.read(stage, p?.game, p?.final, !!p?.clutch, real);
    this.boards.update(real, calm);
    this.overMs = h.final === undefined ? 0 : this.overMs + real;
    const won = h.final === 0 && !!h.game;
    this.confetti.update(won ? this.overMs : -1, this.dimTo, calm);
    if (calm) {
      this.cheering = this.awayUp = this.hush = this.wave = this.rally = 0;
      this.cheerU.value = this.awayU.value = this.hushU.value = this.waveU.value = this.rallyU.value = 0;
      this.dimU.value = this.dimTo;
      this.towels.visible = false;
      this.flashes.update(real, 0, this.dimTo, true);
      return;
    }
    this.time.value += real / 1000;
    const g = h.game;
    const m = h.moment;
    const fresh = (ms: number) => !!m && m.ms < ms && BIG.has(m.call);
    // the end of the game: the winners' fans on their feet and staying there, the losers' quiet
    if (h.final !== undefined && this.overMs > 250) {
      if (h.final === 0) this.cheering = Math.max(this.cheering, 1);
      else {
        this.awayUp = 1;
        this.hush = 1;
      }
    }
    this.cheering = Math.max(0, this.cheering - real / 2600);
    this.awayUp = Math.max(0, this.awayUp - real / 3200);
    this.hush = Math.max(0, this.hush - real / HUSH_MS);
    const ease = (v: number, to: number, ms: number) => v + (to - v) * (1 - Math.exp(-real / ms));
    const late = !!g && g.q >= 4 && g.clock <= 150 && Math.abs(g.score[0] - g.score[1]) <= 9;
    const defending = h.off === 1 && !h.line;
    // (late in a close one, with its side defending, half the home crowd is on its feet and stays there)
    const stand = defending && (h.clutch || late) ? STAND : 0;
    this.cheerU.value = ease(this.cheerU.value, Math.max(stand, Math.min(1, this.cheering * 1.6)), 180);
    this.awayU.value = ease(this.awayU.value, this.awayUp, 180);
    this.hushU.value = ease(this.hushU.value, this.hush, 400);
    // towels: late in a close game with the home side defending, for a moment after a big home basket, and at a home win
    this.wave = ease(this.wave, (defending && (h.clutch || late)) || won || (fresh(TOWEL_MS) && m!.side === 0) ? 1 : 0, 350);
    this.waveU.value = this.wave;
    this.rally = ease(this.rally, h.line && h.off === 1 ? 1 : 0, 300);
    this.rallyU.value = this.rally;
    this.endU.value = h.end;
    this.towels.visible = this.wave > 0.02 || this.rally > 0.02;
    // (sat down, the stands are a shade under the floor's light: the play is in front of them. On their feet they are in it)
    this.dimU.value = this.dimTo * (SAT + (1 - SAT) * this.cheerU.value);
    this.towelMat.color.setScalar(this.dimU.value);
    // the cameras: a big moment's burst, a late free throw, the buzzer and the minutes after it, and now and then
    const burst = fresh(FLASH_MS) ? FLASH_BIG * (m!.side === 0 ? 1 : 0.5) * (1 - m!.ms / FLASH_MS) * (m!.call === 'buzzer' || m!.call === 'winner' ? 1.6 : 1) : 0;
    const end = h.final === undefined ? 0 : FLASH_FINAL * Math.max(0.15, 1 - this.overMs / 7000);
    const live = h.off !== null || h.final !== undefined ? FLASH_IDLE : 0;
    this.flashes.update(real, Math.max(burst, end, h.line && late ? FLASH_LINE : 0, live), this.dimTo, false);
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

  /** The picture is this many dots: the mirror is drawn at about half of it (sharp enough at a foot, see SHEEN_SHARP), less on a device that has stepped down. */
  mirror(w: number, h: number, sharp = true) {
    const sw = Math.round(Math.max(Math.min(SHEEN_LEAST, w), Math.min(sharp ? SHEEN_MOST : SHEEN_LITE, w * SHEEN_SHARP)));
    const sh = Math.max(64, Math.round((sw * h) / Math.max(w, 1)));
    const rt = this.sheen.getRenderTarget();
    if (rt.width === sw && rt.height === sh) return;
    rt.setSize(sw, sh);
    ((this.sheen.material as ShaderMaterial).uniforms.uSize.value as Vector2).set(sw, sh);
  }
}

/** The upper deck's picture is this many ft across (a seat is SEAT of it). */
const DECK_FT = 40;

/**
 * The upper deck's picture: rows of people up its slope, as the lower bowl's crowd looks from across the
 * building (a head, shoulders, the seat backs between rows), an aisle now and then, a few seats empty (in
 * the building's colour, `seat`), darker the higher it goes: the lights are on the floor.
 */
function paintDeck(cv: HTMLCanvasElement, seat: string) {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, w, h);
  let n = 7;
  const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
  const rows = 24;
  const rh = h / rows;
  const across = Math.round(DECK_FT / SEAT);
  const sw = w / across;
  const tone = (hex: string, k: number) => {
    const c = new Color(hex).multiplyScalar(k);
    return `#${c.getHexString()}`;
  };
  for (let r = 0; r < rows; r++) {
    // (row 0 is the top of the picture: the back of the deck, the darkest)
    const lit = 0.32 + 0.68 * (r / (rows - 1)) ** 1.4;
    const y = r * rh;
    ctx.fillStyle = tone('#2a2b30', lit);
    ctx.fillRect(0, y + rh * 0.78, w, rh * 0.22);
    for (let i = 0; i < across; i++) {
      const x = i * sw;
      // an aisle every so often: steps, a little lighter
      if (i % 14 === 7) {
        ctx.fillStyle = tone('#3a3b40', lit);
        ctx.fillRect(x, y, sw, rh);
        ctx.fillStyle = tone('#1a1b1e', lit);
        ctx.fillRect(x, y + rh * 0.45, sw, rh * 0.08);
        continue;
      }
      if (rnd() < 0.09) {
        ctx.fillStyle = tone(seat, lit);
        ctx.fillRect(x + sw * 0.14, y + rh * 0.42, sw * 0.72, rh * 0.36);
        continue;
      }
      const cx = x + sw * (0.5 + (rnd() - 0.5) * 0.16);
      const wear = WEAR[Math.floor(rnd() * WEAR.length)];
      ctx.fillStyle = tone(wear, lit * 0.9);
      ctx.beginPath();
      ctx.roundRect(cx - sw * 0.36, y + rh * 0.42, sw * 0.72, rh * 0.42, sw * 0.16);
      ctx.fill();
      const skin = 0.12 + rnd() * 0.5;
      ctx.fillStyle = tone(rnd() < 0.5 ? '#c79a7b' : '#7a5642', lit * (0.55 + skin));
      ctx.beginPath();
      ctx.arc(cx, y + rh * 0.3, sw * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tone('#151210', lit);
      ctx.fillRect(cx - sw * 0.17, y + rh * 0.1, sw * 0.34, rh * 0.1);
    }
  }
}

/**
 * The roof: box trusses over the floor (four chords and the lacing between), a frame the scoreboard's
 * cables hang from, a truss over each side's banks of lights with the lights on hangers, lights along
 * the trusses over the floor, and the banners on the far side's. Every bar is one instance of one box (a
 * draw for all the steel), every light one of another, the banners one shape (see Boards.banners).
 */
class Roof {
  private readonly bars: Matrix4[] = [];
  private readonly lights: Matrix4[] = [];
  readonly banners: { x: number; y: number; z: number; w: number; h: number }[] = [];
  private readonly q = new Quaternion();
  private readonly y = new Vector3(0, 1, 0);

  constructor() {
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    // over the floor: three along it, four across, under the roof
    for (const z of [-70, -35, 0, 35]) this.truss(v(-132, ROOF_Y, z), v(132, ROOF_Y, z), 4, 5, 8);
    for (const x of [-95, -45, 45, 95]) this.truss(v(x, ROOF_Y - 5.2, -100), v(x, ROOF_Y - 5.2, 45), 4, 4.6, 8);
    // lights along the middle ones, pointed down at the floor
    for (const z of [-35, 35]) for (let x = -110; x <= 110; x += 11) this.light(v(x + (z > 0 ? 5.5 : 0), ROOF_Y - 3.4, z));
    // the scoreboard's: a frame over its cables, and four hangers up to the truss over the middle of the floor
    const top = 74;
    for (const [ax, az, bx, bz] of [
      [-7, -7, 7, -7],
      [7, -7, 7, 7],
      [7, 7, -7, 7],
      [-7, 7, -7, -7],
    ])
      this.truss(v(ax, top + 2, az), v(bx, top + 2, bz), 1.6, 1.6, 3.5);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        this.bar(v(sx * 3.96, top, sz * 3.96), v(sx * 6.2, top + 1.2, sz * 6.2), 0.16);
        this.bar(v(sx * 6.2, top + 2.8, sz * 6.2), v(sx * 6.2, ROOF_Y - 2.5, 0), 0.14);
      }
    // the banners: on the far side's truss, facing the floor
    for (let i = 0; i < 6; i++) this.banners.push({ x: (i - 2.5) * 19, y: ROOF_Y - 5.4 - 11, z: -70 + 2.4, w: 10, h: 22 });
  }

  /** A bar from a to b, `t` thick. */
  private bar(a: Vector3, b: Vector3, t: number) {
    const d = b.clone().sub(a);
    const len = d.length();
    this.q.setFromUnitVectors(this.y, d.divideScalar(len));
    this.bars.push(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), this.q, new Vector3(t, len, t)));
  }

  /** A box truss from a to b along its top: `w` across, `h` deep, laced every `panel` ft down its sides and across its foot. */
  private truss(a: Vector3, b: Vector3, w: number, h: number, panel = 5) {
    const d = b.clone().sub(a).normalize();
    const side = d
      .clone()
      .cross(this.y)
      .normalize()
      .multiplyScalar(w / 2);
    const down = new Vector3(0, -h, 0);
    const at = (t: number, s: number, low: boolean) =>
      a
        .clone()
        .lerp(b, t)
        .addScaledVector(side, s)
        .add(low ? down : new Vector3());
    for (const s of [-1, 1]) for (const low of [false, true]) this.bar(at(0, s, low), at(1, s, low), 0.32);
    const n = Math.max(1, Math.round(a.distanceTo(b) / panel));
    for (let k = 0; k < n; k++) {
      const [t0, t1] = [k / n, (k + 1) / n];
      const flip = k % 2 === 0;
      for (const s of [-1, 1]) this.bar(at(flip ? t0 : t1, s, false), at(flip ? t1 : t0, s, true), 0.14);
      this.bar(at(t0, -1, true), at(t1, 1, true), 0.12);
    }
  }

  private light(at: Vector3) {
    this.lights.push(new Matrix4().compose(at, this.q.identity(), new Vector3(1.5, 0.55, 1.5)));
  }

  /** Over a side's banks of lights (its frame `g`; the banks `y` up, 30 ft back): a truss along them, each bank on two hangers. */
  rig(wide: number, g: Matrix4, y: number) {
    const p = (x: number, yy: number, z: number) => new Vector3(x, yy, z).applyMatrix4(g);
    this.truss(p(-wide * 0.47, y + 5.5, -31.5), p(wide * 0.47, y + 5.5, -31.5), 3, 3, 7);
    for (let i = -2; i <= 2; i++)
      for (const s of [-1, 1]) {
        const x = (i * wide) / 5.4 + s * wide * 0.04;
        this.bar(p(x, y + 1.4, -30.6), p(x, y + 2.5, -31.5), 0.12);
      }
  }

  /** The steel and the lights, made (and given back, to be hidden on a slow device). */
  build(keep: Keep, group: Group): Object3D[] {
    const unit = keep(new BoxGeometry(1, 1, 1));
    const steel = keep(new MeshLambertMaterial({ color: 0x3b3d43 }));
    const glow = keep(new MeshBasicMaterial({ color: 0xfff1dc }));
    const made: Object3D[] = [];
    for (const [list, mat] of [
      [this.bars, steel],
      [this.lights, glow],
    ] as const) {
      const mesh = keep(new InstancedMesh(unit, mat, list.length));
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.frustumCulled = false;
      group.add(mesh);
      made.push(mesh);
    }
    return made;
  }
}

/** How high the tops of the roof's trusses over the floor are (ft). */
const ROOF_Y = 104;
