// The building round the 3D court: the bowl (bowl.ts: a lower bowl of stepped rows on all four sides with
// aisles and tunnels, a walkway and a level of suites over it, an upper deck, walls up to the roof) with a
// crowd in it (crowd.ts: people, who shift in their seats, follow the ball, get up for a basket), the
// scorer's table and the two benches along the far side, chairs on the floor along the near one, boards
// behind the baskets, a scoreboard, steel, catwalks, speakers and banks of lights in the roof, the
// floor's sheen (the building mirrored in the varnish, faint and blurred), and the dark where a body meets
// the floor. The boards show the game (boards.ts); the crowd answers it: a cheer goes out across the
// building from the play, the home crowd on its feet late in a close one (towels out with its side
// defending), the end behind the basket waving at a visitor's free throw, a hush and the visitors' few up
// for theirs, phones up and cameras going off for the big ones, seats emptying late in a blowout, and at
// the end as the kind of win calls for (SceneProps.occasion): an ordinary one stood and clapped, a late
// winner, a playoff win and a series with the building going wild (towels for the playoffs), a title on its
// feet all the while under confetti and streamers in the champions' colours. While a play is on the stands
// sit back: stiller, a shade darker and greyer, no cameras going off, the boards a notch down; they come up
// again at a dead ball and a big moment. The house lights go down for the open, a timeout and a home win,
// with the roof's spots sweeping the floor (fx.ts).
import {
  BoxGeometry,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  DepthTexture,
  DoubleSide,
  DynamicDrawUsage,
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
  Points,
  Quaternion,
  RepeatWrapping,
  type Scene,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COURT_LEN, toWorld } from '../choreo';
import { END, FLOOR_L, FLOOR_W, HALF_W, SIDE, type GameInfo, type Stage } from '../Court';
import type { MatchKit, Roofing, Venue } from '../../teamColors';
import type { Occasion } from '../occasion';
import { BIG, Boards } from './boards';
import { Bowl, DEEP, ENDX, FAR, RISE, ROOF_TOP, ROWS, type Seat, TOP } from './bowl';
import { Crowd } from './crowd';
import { Confetti, Flashes, Show, Streamers } from './fx';
import { BOARD_KINDS, type BoardKind, type Props } from './props';
import type { Sideline } from './sideline';
import { WEAR } from './lens';

type Keep = <T extends { dispose(): void }>(o: T) => T;

const MID = COURT_LEN / 2;
/** How high the banks of lights hang (over the upper deck's people). */
const LAMP_Y = 57.2 + ROWS * RISE;
/** Where the banks of lights hang (the far side's five, the middle one over each end): the floor's hot spots are theirs. */
export const LAMPS: readonly (readonly [number, number, number])[] = [
  ...[-2, -1, 0, 1, 2].map((i) => [(i * 2 * (ENDX + ROWS * DEEP)) / 5.4, LAMP_Y, -(FAR + ROWS * DEEP + 31)] as const),
  ...[-1, 1].map((e) => [e * (ENDX + ROWS * DEEP + 31), LAMP_Y, 0] as const),
];
const LED_WHITE = new Color('#ffffff');
/** How much of the light the crowd keeps while it sits. */
const SAT = 0.8;
/** The most pools of dark the floor can take: two feet and a body for every figure on it, one under everyone sat round it. */
const TOUCHES = 96;
/** One seat in this many has a camera or a phone up when something happens. */
const FLASH_SHARE = 0.22;
/**
 * How many of the cameras go off (a share of their moments): now and then at a dead ball (never while a play
 * is on), a few for a late free throw, a burst for a big moment (the home side's bigger), a building of them
 * at the buzzer.
 */
const FLASH_IDLE = 0.004;
const FLASH_LINE = 0.05;
const FLASH_BIG = 0.5;
const FLASH_FINAL = 0.32;
/** How long a big moment's flashes, towels and hush last (ms). */
const FLASH_MS = 2600;
const TOWEL_MS = 3200;
const HUSH_MS = 5000;
/** How much of the home crowd is on its feet late in a close game: its side defending, and with the ball. */
const TENSE = [0.8, 0.45];
/** A blowout: this many points in it with this long left in the fourth (s), and the most of a side's fans who go home early; more go once it is lost. */
const BLOWOUT = 17;
const BLOWOUT_S = 330;
const LEAVERS = 0.45;
const LEAVERS_LOST = 0.6;
/** How far the house lights go down for the open, a timeout and a home win (the picture's exposure: the spots and the boards keep theirs), and how long each lasts (ms). */
const HOUSE_DOWN = 0.6;
/** How much of the stands' light the rig's darker mood takes (the clutch, the open: the lamps stay on the floor, the bowl sits back). */
const MOOD_DIM = 0.4;
const OPEN_SHOW_MS = 5200;
const TIMEOUT_SHOW_MS = 9000;
const WIN_SHOW_MS = 60000;
/** A home win's lights go down only this much of the way: the floor is where the party is. */
const WIN_SHOW = 0.5;
/**
 * While a play is on, how much of their light the stands give up (the people, and the steps and walls), the lit
 * faces round the bowl and the boards: the players are the brightest things in the picture.
 */
const LIVE_STANDS = 0.2;
const LIVE_LIT = 0.18;
const LIVE_LED = 0.16;
/**
 * The end, by the kind of win: how much of the winners' crowd is on its feet at the buzzer and a while after
 * (ms: it eases from one to the other), how wild it is, whether the towels go round, and how many of the home
 * fans go home early after a home win (the losers' as many as ever).
 */
const OVATION: Record<Occasion, { up: number; then: number; ms: number; loud: number; towels: boolean; leave: number }> = {
  win: { up: 0.85, then: 0.3, ms: 18000, loud: 0.2, towels: false, leave: 0.3 },
  late: { up: 1, then: 0.7, ms: 30000, loud: 1, towels: false, leave: 0.15 },
  playoff: { up: 1, then: 0.75, ms: 30000, loud: 0.85, towels: true, leave: 0.1 },
  clinch: { up: 1, then: 0.95, ms: 60000, loud: 1, towels: true, leave: 0 },
  title: { up: 1, then: 1, ms: 60000, loud: 1, towels: true, leave: 0 },
};
/** A home crowd stunned by a late winner against it: on its feet with its hands at its face for this long (ms). */
const STUNNED_MS = 4000;
/**
 * How fast the ball goes up the floor (ft/s, eased) for a break: the keen in the end it is going to come up off their
 * seats and phones go up. A jump of more than the other (a new play's ball) is not a break.
 */
const RUSH_FT = 17;
const RUSH_JUMP = 80;
/** How far out of the court (ft from the middle of the floor, across it) the ball is before the chairs on the floor react to the man with it. */
const NEAR_Z = 21;
/** How big a groan is: a free throw missed, a shot missed, one missed late in a close one; the visitors' block or steal, and a big basket of theirs. */
const GROAN = { line: 0.3, miss: 0.45, late: 0.95, stop: 0.6, basket: 0.7 };

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

/** How soft the mirror gets with height: the blur (of the picture's height) for each ft over the floor, for each ft the floor is from the camera. */
const SHEEN_SOFT = '0.06';
/** How sharp the mirror is drawn: this much of the picture's own size, but this many dots across at least and at most (and on a device that has stepped down, at most as it was drawn before). */
const SHEEN_SHARP = 0.5;
const SHEEN_LEAST = 480;
const SHEEN_MOST = 1024;
const SHEEN_LITE = 640;

/**
 * The floor's sheen: what the varnish mirrors, stronger the flatter you look across it, and blurred the
 * more the higher over the floor what it shows is (a glossy floor's reflection is sharp where a foot meets
 * it and soft by the head): `tDepth` is the mirror's depth, `uUnproject` takes it back to the building.
 * It is as clear as the coat is where it lies (lens.ts WEAR, `#include <wear>`: the floor's own canvas,
 * `tFloor`, says where the paint is): fainter and softer where the feet have worn it, and on the apron.
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
    tFloor: { value: null },
    uWood: { value: null },
    strength: { value: 0.74 },
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
    uniform sampler2D tFloor;
    uniform vec3 uWood;
    varying vec4 vUv;
    varying vec3 vView;
    #include <wear>
    vec3 lit(vec2 uv, float lod) {
      vec3 c = textureLod(tDiffuse, uv, lod).rgb;
      return c * c;
    }
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      // how high over the floor what the mirror shows here is (ft); how far apart its samples go for it,
      // drawn out up and down the picture (toward the camera, as a rough floor draws a reflection)
      float depth = texture2D(tDepth, uv).r;
      vec4 at = uUnproject * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      // (nothing drawn there, or so far off the mirror's tipped clip runs out: the roof, high up)
      float high = at.w <= 0.0 || depth > 0.9999 ? 200.0 : clamp(at.y / at.w, 0.0, 200.0);
      float far = max(length(vView), 1.0);
      // how clear the coat is here: paint or bare wood, worn or not (the floor's canvas, as its own shader reads it)
      vec3 spot = cameraPosition - vView;
      vec3 paint = texture2D(tFloor, vec2(spot.x / ${FLOOR_L.toFixed(3)} + 0.5, 0.5 - spot.z / ${FLOOR_W.toFixed(3)})).rgb;
      float worn;
      float coat = fCoat(fGlossAt(spot.xz, 1.0 - smoothstep(0.05, 0.16, length(paint - uWood)), worn));
      // (each 2¼ in strip's face is a little off flat: its piece of the mirror sits a little up or down, the more
      // the higher what it shows; strips too fine to see don't)
      float across = (${(FLOOR_W / 2).toFixed(3)} - (cameraPosition.z - vView.z)) / 0.1875;
      float off = fract(sin(floor(across) * 12.9898) * 43758.5453) - 0.5;
      uv.y += off * 0.05 * min(high, 30.0) / far * (1.0 - smoothstep(0.45, 1.3, fwidth(across)));
      // (the taps turned a little from dot to dot: rows of seats don't come back as a lattice)
      float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 r = vec2(0.32, 1.0) * clamp((0.05 + high) * ${SHEEN_SOFT} / far * (1.0 + 0.9 * (1.0 - coat)), 0.0, 0.034) * (0.7 + 0.6 * turn);
      float lod = log2(max(r.y * uSize.y * 0.4, 1.0)) + 0.6 + min(high, 40.0) * 0.05;
      // (the mirror's picture is in the screen's terms: its taps are added up as light, near enough, and put back)
      vec3 c = lit(uv, lod * 0.5) * 0.24;
      c += (lit(uv + r * vec2(0.5, 0.25), lod) + lit(uv - r * vec2(0.5, 0.25), lod)) * 0.16;
      c += (lit(uv + r * vec2(-0.6, 0.55), lod) + lit(uv - r * vec2(-0.6, 0.55), lod)) * 0.12;
      c += (lit(uv + r * vec2(0.15, 0.95), lod) + lit(uv - r * vec2(0.15, 0.95), lod)) * 0.1;
      c = sqrt(c);
      // (a clear coat mirrors as glass does: a twentieth of what is over it from above, most of it looked along;
      // from the broadcast's seat, some 30 degrees down, that is the men standing faintly in the wood)
      float graze = pow(1.0 - clamp(normalize(vView).y, 0.0, 1.0), 5.0);
      // (and fainter the higher what it shows: a varnish is not a mirror, the roof is a blur in it)
      gl_FragColor = vec4(c, strength * coat * (0.06 + 0.94 * graze) / (1.0 + high * 0.03));
    }`,
};

export class Arena {
  readonly group = new Group();
  /** The boards, and what the building knows of the game (they read it). */
  readonly boards: Boards;
  /** The banks of lights' faces (they go down with the house lights). */
  private readonly lamp = new MeshBasicMaterial({ color: 0xfff1dc });
  /** The bowl, and the people in it. */
  private readonly bowl: Bowl;
  private readonly crowd: Crowd;
  private readonly pools: InstancedMesh;
  private readonly dark = new InstancedBufferAttribute(new Float32Array(TOUCHES), 1);
  private readonly sheen: Reflector;
  private readonly mirrorDraw: Reflector['onBeforeRender'];
  /** From the mirror's picture back to the building (see SHEEN). */
  private readonly unproject = new Matrix4();
  private dimTo = 1;
  private readonly flashes: Flashes;
  private readonly confetti: Confetti;
  private readonly streamers: Streamers;
  /** The light show: the house lights down, the roof's spots sweeping (see fx.ts). */
  private readonly lights: Show;
  /** How far down the rig's own mood is (rig.ts drama: the scene says): the stands sit darker under it. */
  mood = 0;
  /** How far the house lights are down (0 to 1). */
  private show = 0;
  private showMs = Infinity;
  private showFor = 0;
  private showAt = '';
  private showTo = 1;
  private tipped = false;
  /** The roof's steel and the lights on it (only a camera looking up sees them: the first thing a slow device gives up). */
  private steel: Object3D[] = [];
  /** Which roof is built (Venue.roof), what every roof is made of, and the frames of the banks of lights its steel carries. */
  private roofKey = '';
  private readonly roofKit: RoofKit;
  private readonly rigs: { wide: number; g: Matrix4 }[] = [];
  /** The banners (boards.ts banners), hung where the building hangs them (see roofed). */
  private flags: Mesh | null = null;
  /** The scoreboards, one of each kind (props.ts BOARD_KINDS): the building's own is shown. */
  private readonly scoreboards = new Map<BoardKind, Object3D>();
  /** The benches: each part of the people on them (who wears which team's colours), their chairs' padding, the pads on the baskets. */
  private readonly seatMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.75, vertexColors: true });
  private readonly team: MeshStandardMaterial;
  /** The stanchions' badge (props.ts): the home side's name on their pads. */
  private readonly badge: CanvasTexture;
  /** The ribbon of lamps along the top of the lower bowl, in a building that has one (Venue.fascia). */
  private readonly fasciaLeds: Mesh;
  /** The step a slow device is on (see shed). */
  private level = 0;
  private board = '';
  /** Whose building it is (the stands' seats, rails, concrete and house lights), and what was last painted. */
  private venue: Venue | null = null;
  private painted = '';
  /** The house lights' colour (the banks' faces): a warm hall, a plain one or a cool one; and a ceiling's glow under them (see paint). */
  private readonly lampTone = new Color(0xfff1dc);
  private readonly ceilingGlow = new Color(CEILING_GLOW);
  private trim = '#d8d4c8';
  private cheering = 0;
  // the visitors' fans up, the rest holding still, the towels out, the end behind a visitor's free throw up (each eased)
  private awayUp = 0;
  private hush = 0;
  private wave = 0;
  private rally = 0;
  private leave = 0;
  private leaveAway = 0;
  /** How long the game has been over (ms of the clock's real time). */
  private overMs = 0;
  /** A play is on (eased: the stands sit back while it is). */
  private live = 0;
  private kits: [MatchKit, MatchKit] | null = null;
  /** Whose colours the confetti is in (a title's champions'). */
  private party = -1;
  /** The ball's last spot on the floor and how fast it is going up it (ft/s, eased); a break on (eased); a man with it by the chairs on the floor (eased). */
  private lastBall: { x: number; y: number } | null = null;
  private pace = 0;
  private rush = 0;
  private near = 0;

  constructor(
    keep: Keep,
    props: Props,
    /** The people round the floor (sideline.ts): the benches, the coaches, the referees, the table's crew. */
    readonly sideline: Sideline,
  ) {
    keep(this.seatMat);
    keep(this.lamp);
    this.boards = new Boards(keep);
    this.team = props.team;
    this.badge = props.badge;
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

    // the bowl and the people in it; chairs on the floor along the near side and in the far corners
    this.bowl = new Bowl(keep);
    this.group.add(this.bowl.group);
    this.group.add(props.chairs(this.bowl.chairs, this.seatMat));
    this.crowd = new Crowd(keep, props.crowd(), this.bowl.seats);
    this.group.add(this.crowd.group);
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const at = new Vector3();
    const size = new Vector3();

    // the people round the floor (sideline.ts): the benches, the coaches, the referees, the table's crew
    this.group.add(sideline.group);

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

    // above the seats: a ribbon board round the suites' fascia, banks of lights over each side (each kind of
    // thing all round the bowl one shape, a draw, not one a side)
    for (const r of this.bowl.ribbons) this.boards.ribbon(r.x, r.y, r.z, r.w, 2.3, r.turn);
    const banks: BufferGeometry[] = [];
    const bank = (wide: number, x: number, z: number, turn: number) => {
      const g = new Matrix4().compose(at.set(x, 0, z), q.setFromAxisAngle(up, turn), size.set(1, 1, 1));
      // (a bank of lights over each side: what the floor's varnish catches)
      for (let i = -2; i <= 2; i++) {
        const hung = new Matrix4().makeRotationX(0.5).setPosition((i * wide) / 5.4, LAMP_Y, -30);
        banks.push(new PlaneGeometry(wide * 0.11, 3.2).applyMatrix4(hung).applyMatrix4(g));
        // (its housing: a dark box behind the lamps' face)
        darks.push(new BoxGeometry(wide * 0.11 + 0.8, 4, 1.2).translate(0, 0, -0.64).applyMatrix4(hung).applyMatrix4(g));
      }
      this.rigs.push({ wide, g });
    };
    bank(2 * (ENDX + TOP), 0, -(FAR + TOP + 1), 0);
    bank(2 * (FAR + TOP), -(ENDX + TOP + 1), 0, Math.PI / 2);
    bank(2 * (FAR + TOP), ENDX + TOP + 1, 0, -Math.PI / 2);
    bank(2 * (ENDX + TOP), 0, FAR + TOP + 1, Math.PI);
    const one = (list: BufferGeometry[], mat: MeshBasicMaterial | MeshLambertMaterial) => {
      const geo = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (geo) add(new Mesh(keep(geo), mat));
    };
    one(darks, dark);
    one(banks, this.lamp);
    // the roof (each building's own: see roofed), and the banners on the far side's truss
    this.roofKit = {
      unit: keep(new BoxGeometry(1, 1, 1)),
      // (the steel shows a little whatever the light: the lamps point down, and a roof is never quite black)
      steel: keep(new MeshLambertMaterial({ color: 0xffffff, emissive: 0x1e2025 })),
      glow: keep(new MeshBasicMaterial({ color: 0xfff1dc })),
      deck: new Mesh(keep(new PlaneGeometry(310, 290)), keep(new MeshLambertMaterial({ map: ribbed(keep), emissiveMap: ribbed(keep), side: DoubleSide }))),
      ceiling: new Mesh(
        keep(new PlaneGeometry(300, 280)),
        keep(new MeshLambertMaterial({ color: CEILING_TONE, emissive: CEILING_GLOW, map: tiled(keep), emissiveMap: tiled(keep), side: DoubleSide })),
      ),
    };
    for (const m of [this.roofKit.deck, this.roofKit.ceiling]) {
      m.rotation.x = Math.PI / 2;
      this.group.add(m);
    }
    // the scoreboards: one of each kind, all in the same screens and ribbon (the building's is shown: see roofed)
    const [ring, screens] = [this.boards.ringFace(), this.boards.screenFace()];
    for (const kind of BOARD_KINDS) {
      const board = props.scoreboard(ring, screens, kind);
      this.scoreboards.set(kind, board);
      this.group.add(board);
    }
    this.flags = this.boards.banners(BANNERS);
    const roof = this.roofed(ROOFING)!;
    this.boards.build();
    this.fasciaLeds = this.boards.fascia(this.bowl.fasciaRuns);
    this.group.add(this.boards.group);
    this.flashes = new Flashes(keep, cameras(this.bowl.seats, this.bowl.high));
    this.group.add(this.flashes.points);
    this.confetti = new Confetti(keep);
    this.group.add(this.confetti.mesh);
    this.streamers = new Streamers(keep);
    this.group.add(this.streamers.mesh);
    this.lights = new Show(keep, roof.spots);
    this.group.add(this.lights.group);

    // the varnish (its picture keeps its depth, for how soft each part of it is, and its sizes down, to be read soft)
    // (one sample a dot: every dot of it is read through a blur)
    const shader = { ...SHEEN, fragmentShader: SHEEN.fragmentShader.replace('#include <wear>', WEAR) };
    this.sheen = new Reflector(keep(new PlaneGeometry(FLOOR_L, FLOOR_W)), { textureWidth: 640, textureHeight: 400, clipBias: 0.02, shader, multisample: 0 });
    const shot = this.sheen.getRenderTarget();
    // Its picture is drawn as the screen's is (lens.ts screenTarget: the tone curve on, the screen's terms, 8
    // bits). Drawn as three draws into any other target, every material in the building changed its program
    // for the mirror and back again each frame, which was most of a frame's work on the page's own thread.
    shot.texture.type = UnsignedByteType;
    shot.texture.colorSpace = SRGBColorSpace;
    shot.texture.internalFormat = 'RGBA8';
    (shot as typeof shot & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    shot.depthTexture = new DepthTexture(640, 400);
    shot.texture.generateMipmaps = true;
    shot.texture.minFilter = LinearMipmapLinearFilter;
    const su = (this.sheen.material as ShaderMaterial).uniforms;
    su.tDepth.value = shot.depthTexture;
    su.uUnproject.value = this.unproject;
    su.uSize.value = new Vector2(640, 400);
    su.uWood.value = new Color(0xdcae76);
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
    // It is drawn before the picture, not from inside it (see reflect): a draw inside a draw has lights of its
    // own as three keeps them, and every lit material changed its program for it and back, each frame.
    this.mirrorDraw = this.sheen.onBeforeRender;
    this.sheen.onBeforeRender = () => {};
  }

  /** The floor's mirror for the picture about to be drawn from `camera` (the lens asks, before each picture). */
  reflect(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    // (the people round the floor, as this camera's picture wants them)
    this.sideline.present(camera);
    if (!this.sheen.visible) return;
    this.crowd.mirror(true);
    this.sideline.mirrored(true);
    this.mirrorDraw.call(this.sheen, renderer, scene, camera, this.sheen.geometry, this.sheen.material as ShaderMaterial, null as never);
    const cam = this.sheen.camera;
    this.unproject.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    this.crowd.mirror(false);
    this.sideline.mirrored(false);
  }

  /**
   * The building's colour (the home team's on its own floor): the pads on the baskets, the chairs, half the
   * crowd and some of their towels; and the building itself (`venue`, teamColors.ts venueLook: the home
   * team's own, the same every night): the seats by section, the walls' padded tops, the concrete, the house
   * lights, the partners' order on the boards and their look, the stanchions' pads, the wall or the ribbon
   * along the top of the lower bowl, the concourse and the suites (bowl.ts), the fans' signs.
   */
  paint(board: string, venue?: Venue) {
    // (asked every frame: the same building as the last, as a rule)
    if (board === this.board && (venue ?? null) === this.venue && this.painted) return;
    const key = venue
      ? `${board}|${venue.seed}|${venue.seats.join()}|${venue.rail}|${venue.house}|${venue.pad}|${venue.fascia}|${venue.boards}|${venue.crowd}|${venue.aisles}`
      : board;
    this.board = board;
    this.venue = venue ?? null;
    if (key === this.painted) return;
    this.painted = key;
    this.boards.paint(board, venue?.seed, venue?.boards);
    // (the stanchions' pads: the building's colour as a rule; in its own building, what it pads them in)
    this.team.color.set(venue?.pad ?? board);
    this.badged(venue);
    this.fasciaLeds.visible = venue?.fascia === 'ribbon' && this.level < 1;
    this.seatMat.color.set(board).multiplyScalar(0.75);
    this.bowl.paint(board, venue);
    this.roofed(venue?.roof ?? ROOFING);
    this.recam();
    this.sideline.paint(board);
    this.crowd.paint(board, this.trim, venue?.seats, venue?.seatMix, venue?.letters, venue?.crowd);
    this.lights.colours(board);
    this.lampTone.set(venue?.house ?? 0xfff1dc);
    this.lamp.color.copy(this.lampTone);
    // (a ceiling in the house lights' colour, and a breath of the building's own in its glow)
    const tone = new Color(0xffffff).lerp(this.lampTone, 0.5);
    (this.roofKit.ceiling.material as MeshLambertMaterial).color.set(CEILING_TONE).multiply(tone);
    this.ceilingGlow.set(CEILING_GLOW).multiply(tone).lerp(tone.set(board), CEILING_TINT);
    (this.roofKit.ceiling.material as MeshLambertMaterial).emissive.copy(this.ceilingGlow);
  }

  /**
   * The roof over the floor as this building has it (Venue.roof: see Roof), built again when it changes: its steel
   * and lights (the last building's given back), the deck or the ceiling over them, the light show's spots where its
   * catwalks hang them, and its scoreboard shown, at its size, from the roof's frame.
   */
  private roofed(look: Roofing): Roof | null {
    const key = JSON.stringify(look);
    if (key === this.roofKey) return null;
    this.roofKey = key;
    const roof = new Roof(look);
    for (const o of this.steel) {
      this.group.remove(o);
      (o as InstancedMesh).dispose();
    }
    for (const r of this.rigs) roof.rig(r.wide, r.g, LAMP_Y);
    this.steel = roof.build(this.roofKit, this.group);
    for (const o of this.steel) o.visible = this.level < 1;
    const { deck, ceiling } = this.roofKit;
    const open = look.kind === 'open';
    deck.position.set(0, ROOF_TOP, 14);
    (deck.material as MeshLambertMaterial).color.set(open ? OPEN_DECK : DECK);
    (deck.material as MeshLambertMaterial).emissive.set(open ? 0x000000 : DECK_GLOW);
    ceiling.position.set(0, CEILING_Y, 14);
    ceiling.visible = look.kind === 'ceiling';
    // (the banners: in a row over the far side, or turned to hang over the high end, facing down the floor)
    if (this.flags) {
      const end = look.rafters === 'end';
      this.flags.rotation.y = end ? -Math.PI / 2 : 0;
      this.flags.position.set(end ? RAFTERS_END + BANNERS[0].z : 0, 0, 0);
    }
    for (const [kind, board] of this.scoreboards) {
      board.visible = kind === look.board;
      board.scale.setScalar(look.size);
      board.position.set(0, BOARD_Y, 0);
    }
    // (the light show's spots, as many as ever, moved to this roof's: fx.ts Show made its beams, pools and glare for them)
    for (const o of this.lights?.group.children ?? []) {
      const geo = (o as Mesh).geometry;
      for (const name of o instanceof Points ? ['aFrom', 'position'] : ['aFrom']) {
        const at = geo.getAttribute(name);
        roof.spots.forEach((p, i) => at.setXYZ(i, p.x, p.y, p.z));
        at.needsUpdate = true;
      }
    }
    return roof;
  }

  /** The cameras in the stands, where this building's seats are (its aisles and tunnels are its own): as many as the first building had, spread over them. */
  private recam() {
    const at = this.flashes.points.geometry.getAttribute('position');
    const cams = cameras(this.bowl.seats, this.bowl.high);
    const n = cams.length / 3;
    for (let i = 0; i < at.count; i++) {
      const j = Math.floor((i * n) / at.count) * 3;
      at.setXYZ(i, cams[j], cams[j + 1], cams[j + 2]);
    }
    at.needsUpdate = true;
  }

  /**
   * The stanchions' badge: the home side's name in white between two fine rules, spaced wide, as a pad
   * is lettered (in the building's own lettering's lean); none on a neutral floor.
   */
  private badged(venue: Venue | undefined) {
    const cv = this.badge.image as HTMLCanvasElement;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const name = venue?.letters ? venue.baselines[1].toUpperCase() : '';
    if (name) {
      const { width: w, height: h } = cv;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.035);
      ctx.fillRect(w * 0.08, h * 0.845, w * 0.84, h * 0.035);
      ctx.globalAlpha = 0.95;
      const px = Math.round(h * 0.52);
      ctx.font = `800 ${px}px "Archivo Variable", system-ui, sans-serif`;
      ctx.font = `800 condensed ${px}px "Archivo Variable", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(px * 0.12)}px`;
      ctx.save();
      ctx.translate(w / 2 + Math.round(px * 0.06), h / 2 + 2);
      if (venue?.court.words === 'italic') ctx.transform(1, 0, -0.22, 1, 0, 0);
      ctx.fillText(name, 0, 0, w * 0.82);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    this.badge.needsUpdate = true;
  }

  /** The benches in tonight's kits; each coach in a dark suit, his tie his team's colour. The visitors' fans in theirs; the boards and the confetti in both. */
  dress(kits: [MatchKit, MatchKit]) {
    this.kits = kits;
    this.party = 0;
    this.boards.dress(kits);
    this.confetti.colours(kits[0].color, kits[0].trim);
    this.streamers.colours(kits[0].color, kits[0].trim);
    this.crowd.dress(kits[1].color, kits[1].trim);
    // (the home fans' second colour: on its own floor, the home side's)
    this.trim = kits[0].trim;
    if (this.board) this.crowd.paint(this.board, this.trim, this.venue?.seats, this.venue?.seatMix, this.venue?.letters, this.venue?.crowd);
    this.sideline.dress(kits);
  }

  /** How much of their light the people in the stands keep (1: all of it), and those on the benches; the boards with them. */
  dim(to: number, bench = to) {
    this.dimTo = to;
    this.sideline.dim(bench);
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
      // (a big one of theirs: a groan goes round the rest)
      if (much >= 0.2) this.crowd.groan(GROAN.basket, this.boards.house.end * (MID - 6), 0);
      return;
    }
    this.cheering = Math.max(this.cheering, much);
    // (it goes out across the building from the play's end of the floor)
    this.crowd.cheer(Math.min(1, much * 1.15), this.boards.house.end * (MID - 6), 0);
  }

  /**
   * A device that can't keep up, by the scene's steps (Court3D's STEPS, scene.lite): the crowd in lighter
   * models at each (crowd.ts shed); from the second the roof's steel, the glass and rails, the light spilt
   * from the tunnels and the boards gone, the boards painted less often and no light show; at the third
   * half the cameras, a third of the confetti, no streamers. The ribbon along the top of the lower bowl goes
   * from the second too (its wall stays, with the name on it), and what the fans hold from the first.
   */
  shed(lite: 0 | 1 | 2 | 3) {
    const level = lite > 2 ? 2 : lite > 1 ? 1 : 0;
    this.level = level;
    this.fasciaLeds.visible = this.venue?.fascia === 'ribbon' && level < 1;
    for (const o of this.steel) o.visible = level < 1;
    this.bowl.shed(level);
    this.crowd.shed(lite);
    this.boards.lite(level > 0);
    this.lights.lite(level > 0);
    this.flashes.lite(level > 1);
    this.confetti.lite(level > 1);
    this.streamers.lite(level > 1);
  }

  /**
   * Time passes (ms): the boards read the game off the stage (none in the scene lab: they keep what they
   * were told), the crowd sways and follows the ball, a cheer dies down, and what the moment calls for comes
   * up: towels, the end behind a visitor's free throw, the cameras, the ovation, the house lights going
   * down. `calm` keeps it still.
   */
  update(
    real: number,
    calm: boolean,
    stage?: Stage,
    p?: { game?: GameInfo; final?: 0 | 1; occasion?: Occasion; clutch?: boolean; names?: (pid: number) => string; jersey?: (pid: number) => string },
  ) {
    const h = this.boards.house;
    this.boards.cast(p?.names, p?.jersey);
    this.boards.hear(Math.max(this.crowd.u.uCheer.value, 0.55 * this.crowd.u.uStand.value + 0.2 * Math.abs(Math.sin(this.crowd.u.uTime.value * 1.7))));
    if (stage) h.read(stage, p?.game, p?.final, !!p?.clutch, real);
    this.boards.update(real, calm);
    const was = this.overMs;
    this.overMs = h.final === undefined ? 0 : this.overMs + real;
    const won = h.final === 0 && !!h.game;
    const o: Occasion = p?.occasion ?? 'win';
    const end = OVATION[o];
    // (a title brings the confetti down in the champions' colours, wherever it is won; a series won at home, streamers and a little of it)
    const title = o === 'title' && h.final !== undefined;
    const paper = title || (won && o === 'clinch') ? this.overMs : -1;
    if (title && this.kits && this.party !== h.final) {
      this.party = h.final!;
      this.confetti.colours(this.kits[h.final!].color, this.kits[h.final!].trim);
      this.streamers.colours(this.kits[h.final!].color, this.kits[h.final!].trim);
    }
    this.confetti.share(title ? 1 : 0.3);
    this.confetti.update(paper, this.dimTo, calm);
    this.streamers.update(paper, this.dimTo, calm);
    const u = this.crowd.u;
    if (calm) {
      this.cheering = this.awayUp = this.hush = this.wave = this.rally = this.show = this.live = this.rush = this.near = this.pace = 0;
      this.lastBall = null;
      u.uCheer.value =
        u.uLag.value =
        u.uAway.value =
        u.uHush.value =
        u.uWave.value =
        u.uRally.value =
        u.uStand.value =
        u.uPhone.value =
        u.uOvation.value =
        u.uLive.value =
        u.uLine.value =
          0;
      u.uRush.value.x = u.uNear.value.z = 0;
      u.uRipA.value.x = u.uRipB.value.x = u.uGroan.value.x = -99;
      u.uBall.value.y = 0;
      this.crowd.dim(this.dimTo * (1 - MOOD_DIM * this.mood), this.dimTo * (1 - MOOD_DIM * this.mood));
      this.crowd.wave(false, 1);
      this.bowl.dim(this.dimTo, this.dimTo * (1 - MOOD_DIM * this.mood));
      this.bowl.cheer(0);
      this.boards.boost(1);
      this.flashes.update(real, 0, this.dimTo, true, 1);
      this.lights.update(real, 0, 1);
      return;
    }
    u.uTime.value += real / 1000;
    const g = h.game;
    const m = h.moment;
    const fresh = (ms: number) => !!m && m.ms < ms && BIG.has(m.call);
    // the end of the game: the winners' fans on their feet (as many and as wild as the kind of win calls for), the losers' quiet
    if (h.final !== undefined && this.overMs > 250) {
      if (h.final === 0) {
        this.cheering = Math.max(this.cheering, 1);
        if (was <= 250) this.crowd.cheer(1, h.end * (MID - 6), 0);
      } else {
        this.awayUp = 1;
        this.hush = 1;
      }
    }
    this.cheering = Math.max(0, this.cheering - real / 2600);
    this.awayUp = Math.max(0, this.awayUp - real / 3200);
    this.hush = Math.max(0, this.hush - real / HUSH_MS);
    const ease = (v: number, to: number, ms: number) => v + (to - v) * (1 - Math.exp(-real / ms));
    const margin = g ? g.score[0] - g.score[1] : 0;
    const late = !!g && g.q >= 4 && g.clock <= 150 && Math.abs(margin) <= 9;
    const defending = h.off === 1 && !h.line;
    const tense = h.final === undefined && (h.clutch || late);
    // a cheer starts at the play's end of the floor and goes out across the building (each fan's own: see Crowd.cheer); the upper deck's a moment later
    u.uCheer.value = ease(u.uCheer.value, Math.min(1, this.cheering * 1.6), 180);
    u.uLag.value = ease(u.uLag.value, u.uCheer.value, 480);
    u.uAway.value = ease(u.uAway.value, this.awayUp, 180);
    u.uHush.value = ease(u.uHush.value, this.hush, 400);
    // (the end: as many of the winners' crowd up as the kind of win calls for, fewer as it goes on; how wild it is when it's up)
    const ovation = won ? end.up + (end.then - end.up) * Math.min(1, this.overMs / end.ms) : 0;
    u.uOvation.value = ease(u.uOvation.value, ovation, 500);
    u.uLoud.value = ease(u.uLoud.value, won ? end.loud : h.clutch ? 1 : 0.8, 600);
    // (a play on: the stands sit back; a dead ball, a big moment, the end: back up)
    const playing = h.off !== null && !h.line && h.final === undefined && !fresh(FLASH_MS) && this.show < 0.05;
    this.live = ease(this.live, playing ? 1 : 0, playing ? 700 : 350);
    u.uLive.value = this.live;
    // (late in a close one most of the home crowd is on its feet and stays there, more of it with its side defending; a
    // late winner against it has it up with its hands at its face a moment)
    const stunned = h.final === 1 && o === 'late' && this.overMs < STUNNED_MS;
    u.uStand.value = ease(u.uStand.value, tense ? TENSE[defending ? 0 : 1] : stunned ? 0.75 : 0, stunned ? 300 : 1400);
    // towels: late in a close game with the home side defending, for a moment after a big home basket, and at a home playoff win
    this.wave = ease(this.wave, (defending && tense) || (won && end.towels) || (fresh(TOWEL_MS) && m!.side === 0) ? 1 : 0, 350);
    u.uWave.value = this.wave;
    this.rally = ease(this.rally, h.line && h.off === 1 ? 1 : 0, 300);
    u.uRally.value = this.rally;
    u.uEnd.value = h.end;
    // (a man at the line: those sat lean in and keep still for it)
    u.uLine.value = ease(u.uLine.value, h.line && h.final === undefined ? 1 : 0, 600);
    // a groan from the home crowd as it goes out from the play: a shot of its side's missed (bigger late in a close one,
    // smaller at the line), the visitors' block or steal
    const just = (ms: number) => ms < 1;
    if (h.final === undefined && h.miss?.side === 0 && just(h.miss.ms))
      this.crowd.groan(h.miss.line ? GROAN.line : late || h.clutch ? GROAN.late : GROAN.miss, h.end * (MID - 6), 0);
    if (m && m.side === 1 && (m.call === 'block' || m.call === 'steal') && just(m.ms)) this.crowd.groan(GROAN.stop, h.end * (MID - 6), 0);
    // heads follow the ball (the play's, on the floor; between plays the stage's; its end of the floor, when there is none)
    const sc = stage?.script;
    const ball = stage?.play && sc ? toWorld(stage.play.ball, sc.dir) : stage?.ball;
    // a break: the ball going up the floor fast with a play on (the keen at the end it goes to up off their seats, phones up)
    if (ball && this.lastBall && real > 0) {
      const v = ((ball.y - this.lastBall.y) / real) * 1000;
      if (Math.abs(v) < RUSH_JUMP) this.pace = ease(this.pace, v, 350);
    }
    this.lastBall = ball ? { x: ball.x, y: ball.y } : null;
    const breaking = playing && !h.line && Math.abs(this.pace) > RUSH_FT;
    this.rush = ease(this.rush, breaking ? 1 : 0, breaking ? 300 : 1100);
    u.uRush.value.set(this.rush, breaking ? Math.sign(this.pace) : u.uRush.value.y);
    // (the ball out by the chairs on the floor: those sat there sit back from the man with it, hands up)
    const by = !!ball && Math.abs(ball.x) > NEAR_Z;
    this.near = ease(this.near, by ? 1 : 0, by ? 200 : 900);
    if (ball) u.uNear.value.set(ball.y - MID, -ball.x, this.near);
    else u.uNear.value.z = this.near;
    const look = u.uBall.value;
    look.x = ease(look.x, ball ? ball.y - MID : h.end * 30, 500);
    look.z = ease(look.z, ball ? -ball.x : 0, 500);
    look.y = ease(look.y, 0.8, 800);
    // a blowout late: the side that is losing it starts for the exits, and goes once it is lost
    const blown = !!g && g.q >= 4 && g.clock <= BLOWOUT_S && Math.abs(margin) >= BLOWOUT;
    const share = blown ? LEAVERS * Math.min(1, 0.35 + (BLOWOUT_S - g.clock) / BLOWOUT_S) : 0;
    const lost = h.final === undefined ? 0 : Math.min(LEAVERS_LOST, this.overMs / 30000);
    // (and after a home win, a few of its own beating the traffic: fewer the bigger the night)
    const home = won ? Math.min(end.leave, this.overMs / 60000) : 0;
    this.leave = ease(this.leave, Math.max(blown && margin < 0 ? share : 0, h.final === 1 ? lost : home), 4000);
    this.leaveAway = ease(this.leaveAway, Math.max(blown && margin > 0 ? share : 0, h.final === 0 ? lost : 0), 4000);
    u.uLeave.value = this.leave;
    u.uLeaveAway.value = this.leaveAway;

    // the house lights: down for the open (the fives lined up for the tip, coming up as it nears), a timeout, a home win
    const tip = !!stage && !stage.script && stage.standers.length === 10 && !!g && g.q === 1 && g.score[0] + g.score[1] === 0 && h.final === undefined;
    // (the play going on, its next move or the next possession, takes them back up at once)
    const at = stage?.script ? `${stage.script.clockStart}:${stage.play?.i ?? -1}` : h.final === undefined ? 'idle' : 'over';
    if (at !== this.showAt) this.showFor = 0;
    if (tip && !this.tipped) this.lightsDown(OPEN_SHOW_MS, at);
    this.tipped = tip;
    if (m && m.call === 'timeout' && m.ms < real * 1.5 + 1) this.lightsDown(TIMEOUT_SHOW_MS, at);
    if (won && o !== 'win' && this.overMs > 1200 && this.overMs - real <= 1200) this.lightsDown(WIN_SHOW_MS, at, WIN_SHOW);
    this.showMs += real;
    this.show = ease(this.show, this.showMs < this.showFor ? this.showTo : 0, this.showMs < this.showFor ? 320 : 700);
    const house = 1 - HOUSE_DOWN * this.show;
    this.lights.update(real, this.show, house);
    this.lamp.color.copy(this.lampTone).multiplyScalar(1 - 0.75 * this.show);
    (this.roofKit.ceiling.material as MeshLambertMaterial).emissive.copy(this.ceilingGlow).multiplyScalar(1 - 0.6 * this.show);
    this.boards.boost((1 / house) * (1 - LIVE_LED * this.live));

    this.crowd.wave(this.wave > 0.02 || this.rally > 0.02, this.dimTo);
    // (the boards' light on the rows by them: the building's colour, up for a moment with a big one)
    if (this.board)
      u.uLed.value
        .set(this.board)
        .lerp(LED_WHITE, 0.35)
        .multiplyScalar((0.2 + (fresh(FLASH_MS) ? 0.25 * (1 - m!.ms / FLASH_MS) : 0)) * this.dimTo * (1 - LIVE_LED * this.live));
    // (sat down, the stands are a shade under the floor's light: the play is in front of them. On their feet they are in it)
    // (the steps, the seats and the walls go down with them, for a close-up and under the darker house: one bowl)
    const stands = this.dimTo * (1 - MOOD_DIM * this.mood) * (1 - LIVE_STANDS * this.live);
    this.crowd.dim(stands * (SAT + (1 - SAT) * Math.max(u.uCheer.value, u.uOvation.value)), stands);
    this.bowl.dim((this.dimTo / house) * (1 - LIVE_LIT * this.live), stands);
    this.bowl.cheer(u.uLag.value);
    // the cameras: a big moment's burst, a late free throw, the buzzer and the minutes after it, and now and then;
    // a few phones go up with them
    const burst = fresh(FLASH_MS) ? FLASH_BIG * (m!.side === 0 ? 1 : 0.5) * (1 - m!.ms / FLASH_MS) * (m!.call === 'buzzer' || m!.call === 'winner' ? 1.6 : 1) : 0;
    const over = h.final === undefined ? 0 : FLASH_FINAL * Math.max(title ? 0.4 : 0.15, 1 - this.overMs / 7000);
    // (now and then at a dead ball, never while a play is on: a flicker in the stands pulls the eye off the floor)
    const idle = h.final !== undefined || (h.off === null && !!g) ? FLASH_IDLE * (1 - this.live) : 0;
    const rate = Math.max(burst, over, h.line && late ? FLASH_LINE : 0, idle, this.show * 0.06);
    u.uPhone.value = ease(u.uPhone.value, rate > 0.03 || this.rush > 0.5 ? 1 : 0, 600);
    this.flashes.update(real, rate, this.dimTo, false, 1 / house);
  }

  /** How much of the picture's exposure the house lights leave (1: all of it): the scene's camera takes it. */
  get house() {
    return 1 - HOUSE_DOWN * this.show;
  }

  /** The house lights go down (`much` of the way) for this long (ms), or until the game moves on from where it is (`at`). */
  private lightsDown(ms: number, at: string, much = 1) {
    this.showMs = 0;
    this.showFor = ms;
    this.showAt = at;
    this.showTo = much;
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

  /** The floor's canvas (Court.tsx paintFloor) and its bare wood's colour (linear): where the mirror is clearer, over paint. */
  floorMap(map: Texture, wood: Color) {
    const su = (this.sheen.material as ShaderMaterial).uniforms;
    su.tFloor.value = map;
    (su.uWood.value as Color).copy(wood);
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

/**
 * The roof, as a building has it (Venue.roof): over the floor deep box trusses (four chords and the lacing
 * between), arched ribs across a dark open roof with purlins between them, or nothing to see under a flat
 * ceiling but the rings of lights let into it (the deck and the ceiling themselves are the arena's: RoofKit);
 * two catwalks along the floor's length, a ring of them round the scoreboard, or two across over the ends, each
 * with its rails and the spots that sweep the floor in a light show on its floor side; the frame the scoreboard's
 * cables hang from (as big as the board); a truss over each side's banks of lights with the lights on hangers; a
 * cluster of speakers toward each corner of the floor; and a batten over the banners. Every bar is one instance
 * of one box (a draw for all the steel, each bar in its own grey), every light one of another.
 */
class Roof {
  private readonly bars: Matrix4[] = [];
  private readonly tints: number[] = [];
  private readonly lights: Matrix4[] = [];
  /** Where the spots that sweep the floor hang (SPOTS of them, whatever the catwalks). */
  readonly spots: Vector3[] = [];
  private readonly q = new Quaternion();
  private readonly y = new Vector3(0, 1, 0);
  /** How high the underside of what is over the floor is, over a point of it (what a hanger goes up to). */
  private readonly under: (x: number, z: number) => number;

  constructor(look: Roofing) {
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    if (look.kind === 'trusses') {
      // deep box trusses: six across the floor, four along it under them, lights under the middle two
      const low = ROOF_Y - DEEP_TRUSS - 0.2;
      for (const z of [-70, -35, 0, 35, 70, 105]) this.truss(v(-132, ROOF_Y, z), v(132, ROOF_Y, z), 4, DEEP_TRUSS, 8);
      for (const x of [-95, -45, 45, 95]) this.truss(v(x, low, -100), v(x, low, 118), 4, 4.6, 8);
      for (const z of [-35, 35]) for (let x = -110; x <= 110; x += 11) this.light(v(x + (z > 0 ? 5.5 : 0), ROOF_Y - DEEP_TRUSS - 0.4, z));
      this.under = () => low - 4.6;
    } else if (look.kind === 'ceiling') {
      // rings of lights let into the ceiling round the scoreboard
      for (const [rx, rz, n] of CEILING_RINGS)
        for (let i = 0; i < n; i++) this.light(v(rx * Math.cos((i / n) * 2 * Math.PI), CEILING_Y - 0.2, rz * Math.sin((i / n) * 2 * Math.PI)), CEILING_LIGHT);
      this.under = () => CEILING_Y;
    } else {
      // arched ribs across the floor (deep girders, no lacing), purlins along it between them, lights hung under the ribs
      const arch = (z: number) => ROOF_Y + 0.5 - ARCH_RISE * ((z - 9) / 109) ** 2;
      for (const x of RIBS) {
        for (let i = 0; i < 16; i++) {
          const [z0, z1] = [-100 + (218 * i) / 16, -100 + (218 * (i + 1)) / 16];
          this.plank(v(x, arch(z0) - 2.2, z0), v(x, arch(z1) - 2.2, z1), 1.4, 4.4, 0x2a2c31);
        }
        for (const z of [-35, 35]) for (const s of [-1, 1]) this.light(v(x + s * 1.6, arch(z) - 4.9, z));
      }
      for (let z = -88; z <= 120; z += 26) this.bar(v(-132, arch(z) - 0.3, z), v(132, arch(z) - 0.3, z), 0.4);
      this.under = (_x, z) => arch(z) - 4.4;
    }

    // the catwalks, a little under what is over the floor, and the spots on their floor sides
    const cy = Math.min(ROOF_Y - 13, this.under(0, 19) - 4.6);
    if (look.catwalk === 'sides') {
      for (const z of [-19, 19]) {
        this.catwalk(v(-104, cy, z), v(104, cy, z));
        for (let x = -84; x <= 84; x += 24) this.spot(v(x + (z > 0 ? 12 : 0), cy - 1.1, z - Math.sign(z) * 1.9), v(0, 0, -Math.sign(z)));
      }
    } else if (look.catwalk === 'ring') {
      const [X, Z] = RING;
      const corners = [v(-X, cy, -Z), v(X, cy, -Z), v(X, cy, Z), v(-X, cy, Z)];
      corners.forEach((c, i) => this.catwalk(c, corners[(i + 1) % 4]));
      for (const x of [-36, -18, 0, 18, 36]) for (const s of [-1, 1]) this.spot(v(x, cy - 1.1, s * (Z - 1.9)), v(0, 0, -s));
      for (const z of [-18, 0, 18]) for (const s of [-1, 1]) this.spot(v(s * (X - 1.9), cy - 1.1, z), v(-s, 0, 0));
    } else {
      for (const s of [-1, 1]) {
        this.catwalk(v(s * ENDS_X, cy, -64), v(s * ENDS_X, cy, 74));
        for (let z = -52; z <= 60; z += 16) this.spot(v(s * (ENDS_X - 1.9), cy - 1.1, z), v(-s, 0, 0));
      }
    }

    // speakers: a hanging run of boxes toward each corner of the floor, curling in under itself as such runs do
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const [cx, cz] = [sx * 30, sz * 31];
        const out = v(sx, 0, sz * 0.75).normalize();
        this.bar(v(cx, this.under(cx, cz), cz), v(cx, ROOF_Y - 18, cz), 0.12);
        for (let i = 0; i < 8; i++) {
          const tilt = 0.05 + i * 0.075;
          const mid = v(cx, ROOF_Y - 18.8 - i * 1.55, cz).addScaledVector(out, -i * i * 0.06);
          const dir = out.clone().multiplyScalar(Math.cos(tilt)).setY(-Math.sin(tilt));
          this.plank(mid.clone().addScaledVector(dir, -1.2), mid.clone().addScaledVector(dir, 1.2), 4.2, 1.45, i % 2 ? 0x1b1c20 : 0x222429);
        }
      }
    // the scoreboard's: a frame over its cables (its size, its shape: a long board's is long), hangers up from its corners
    const top = BOARD_Y + BOARD_CABLES * look.size;
    const long = look.board === 'long';
    const [ax, az] = (long ? [14.5, 4.4] : [7, 7]).map((f) => f * look.size);
    const [kx, kz] = (long ? [13, 2.6] : [3.96, 3.96]).map((f) => f * look.size);
    for (const [sx, sz, ex, ez] of [
      [-1, -1, 1, -1],
      [1, -1, 1, 1],
      [1, 1, -1, 1],
      [-1, 1, -1, -1],
    ])
      this.truss(v(sx * ax, top + 2, sz * az), v(ex * ax, top + 2, ez * az), 1.6, 1.6, 3.5);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        this.bar(v(sx * kx, top, sz * kz), v(sx * (ax - 0.8), top + 1.2, sz * (az - 0.8)), 0.16);
        this.bar(v(sx * ax, top + 2, sz * az), v(sx * ax, this.under(sx * ax, sz * az), sz * az), 0.14);
      }
    // the banners' batten, and its hangers (over the far side, or turned over the high end: see Arena.roofed)
    const batten = BANNERS[0].y + BANNERS[0].h / 2 + 0.3;
    const bz = BANNERS[0].z - 0.3;
    const hang: (a: number, y: number, b: number) => Vector3 = look.rafters === 'end' ? (a, y) => v(RAFTERS_END + 0.3, y, a) : (a, y, b) => v(a, y, b);
    this.bar(hang(-60, batten, bz), hang(60, batten, bz), 0.3);
    for (const x of [-40, 40]) {
      const at = hang(x, batten, bz);
      this.bar(at, at.clone().setY(this.under(at.x, at.z)), 0.12);
    }
  }

  /** A bar from a to b, `t` thick (in the steel's grey, or its own). */
  private bar(a: Vector3, b: Vector3, t: number, tint = 0x3b3d43) {
    this.plank(a, b, t, t, tint);
  }

  /** A box from a to b, `w` across (level) and `h` deep. */
  private plank(a: Vector3, b: Vector3, w: number, h: number, tint: number) {
    const d = b.clone().sub(a);
    const len = d.length();
    d.divideScalar(len);
    // (its width stays level: along the floor, square to the way it runs)
    const flat = Math.hypot(d.x, d.z);
    const side = flat > 1e-3 ? new Vector3(-d.z / flat, 0, d.x / flat) : new Vector3(1, 0, 0);
    const deep = new Vector3().crossVectors(side, d);
    this.q.setFromRotationMatrix(new Matrix4().makeBasis(side, d, deep));
    this.bars.push(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), this.q, new Vector3(w, len, h)));
    this.tints.push(tint);
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

  /** A catwalk from a to b (at its deck's height): the deck, a rail each side on posts, hangers up to the roof every so often. */
  private catwalk(a: Vector3, b: Vector3) {
    const d = b.clone().sub(a);
    const len = d.length();
    d.divideScalar(len);
    this.plank(a, b, 3.4, 0.25, 0x2c2e33);
    for (const s of [-1, 1]) {
      const off = new Vector3(-d.z, 0, d.x).multiplyScalar(s * 1.7);
      const on = (t: number, h: number) =>
        a
          .clone()
          .addScaledVector(d, t)
          .add(off)
          .setY(a.y + h);
      for (const h of [1.7, 3.3]) this.bar(on(0, h), on(len, h), 0.1, 0x55585f);
      for (let t = 0; t <= len; t += 8) this.bar(on(t, 0), on(t, 3.3), 0.1, 0x55585f);
      for (let t = 9; t < len; t += 40) {
        const p = on(t, 3.3);
        this.bar(p, p.clone().setY(this.under(p.x, p.z)), 0.14);
      }
    }
  }

  /** A spot under a catwalk's floor side (`to` the way to the floor's middle, level), in its fixture. */
  private spot(at: Vector3, to: Vector3) {
    this.spots.push(at);
    this.plank(at.clone().setY(at.y + 0.9), at.clone().setY(at.y + 0.35), 0.5, 0.5, 0x1a1b1e);
    this.plank(
      at.clone().setY(at.y + 0.5),
      at
        .clone()
        .addScaledVector(to, 0.5)
        .setY(at.y - 0.7),
      1.1,
      1.1,
      0x16171a,
    );
  }

  private light(at: Vector3, size = LIGHT) {
    this.lights.push(new Matrix4().compose(at, this.q.identity(), size));
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

  /** The steel and the lights, made of the kit's box and materials (given back to be hidden on a slow device, or dropped for another building's). */
  build(kit: RoofKit, group: Group): InstancedMesh[] {
    const made: InstancedMesh[] = [];
    const c = new Color();
    for (const [list, mat] of [
      [this.bars, kit.steel],
      [this.lights, kit.glow],
    ] as const) {
      const mesh = new InstancedMesh(kit.unit, mat, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      if (mat === kit.steel) this.tints.forEach((t, i) => mesh.setColorAt(i, c.set(t)));
      mesh.frustumCulled = false;
      group.add(mesh);
      made.push(mesh);
    }
    if (this.spots.length !== SPOTS) throw new Error(`the roof hangs ${this.spots.length} spots, not ${SPOTS}`);
    return made;
  }
}

/** What every building's roof is made of (the arena keeps them; each roof's steel and lights are instances of these): the deck, and a ceiling under it in a building with one. */
interface RoofKit {
  unit: BoxGeometry;
  steel: MeshLambertMaterial;
  glow: MeshBasicMaterial;
  deck: Mesh;
  ceiling: Mesh;
}

/** The cameras in the stands: a share of the seats, held up over a head toward the floor, and some up in the deck (bowl.ts high). */
function cameras(seats: readonly Seat[], high: readonly number[]): number[] {
  let k = 29;
  const pick = () => ((k = (k * 16807) % 2147483647) & 0xffff) / 0xffff;
  const cams: number[] = [];
  for (const s of seats) if (pick() < FLASH_SHARE) cams.push(s.x + 0.6 * Math.sin(s.turn), s.y + 5, s.z + 0.6 * Math.cos(s.turn));
  cams.push(...high);
  return cams;
}

/** The roof's deck from below: ribbed sheet between purlins. */
let ribs: CanvasTexture | null = null;
function ribbed(keep: Keep): CanvasTexture {
  if (ribs) return ribs;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) {
    ctx.fillStyle = '#6c6c6c';
    ctx.fillRect(x, 0, 3, 64);
    ctx.fillStyle = '#c4c4c4';
    ctx.fillRect(x + 3, 0, 1, 64);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 3);
  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(0, 3, 64, 2);
  ribs = keep(new CanvasTexture(cv));
  ribs.colorSpace = SRGBColorSpace;
  ribs.wrapS = ribs.wrapT = RepeatWrapping;
  ribs.repeat.set(52, 14);
  ribs.anisotropy = 4;
  return ribs;
}

/** A ceiling from below: square acoustic panels in a grid of joints, a panel here and there a shade off. */
let tiles: CanvasTexture | null = null;
function tiled(keep: Keep): CanvasTexture {
  if (tiles) return tiles;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const g = 168 + (((i * 7 + j * 13) % 5) - 2) * 6;
      ctx.fillStyle = `rgb(${g}, ${g}, ${g + 2})`;
      ctx.fillRect(i * 16, j * 16, 16, 16);
    }
  ctx.fillStyle = '#5a5a5c';
  for (let x = 0; x < 64; x += 16) {
    ctx.fillRect(x, 0, 1, 64);
    ctx.fillRect(0, x, 64, 1);
  }
  tiles = keep(new CanvasTexture(cv));
  tiles.colorSpace = SRGBColorSpace;
  tiles.wrapS = tiles.wrapT = RepeatWrapping;
  tiles.repeat.set(30, 28);
  tiles.anisotropy = 4;
  return tiles;
}

/** How high the tops of the roof's trusses over the floor are (ft). */
const ROOF_Y = 104;
/** How deep a trussed roof's trusses across the floor are (ft). */
const DEEP_TRUSS = 7;
/** A light's box (ft), and one let into a ceiling (wider, flatter). */
const LIGHT = new Vector3(1.5, 0.55, 1.5);
const CEILING_LIGHT = new Vector3(2.6, 0.2, 2.6);
/** A building with a ceiling: how high it hangs (under the trusses, over the banners), its panels' tone and their glow, and its rings of lights round the scoreboard (ft across, ft along, how many). */
const CEILING_Y = 99.5;
const CEILING_TONE = 0xa4a6ab;
const CEILING_GLOW = 0x64666c;
/** How much of the building's colour a ceiling's glow takes. */
const CEILING_TINT = 0.05;
const CEILING_RINGS: readonly (readonly [number, number, number])[] = [
  [30, 24, 16],
  [56, 44, 26],
  [84, 66, 36],
];
/** A dark open roof's: its deck, near black; where its arched ribs cross the floor; how far they fall from the middle to the walls (ft). */
const OPEN_DECK = 0x0d0e10;
const RIBS = [-110, -66, -22, 22, 66, 110];
const ARCH_RISE = 16.5;
/** A trussed roof's deck, and its glow. */
const DECK = 0x2c2e33;
const DECK_GLOW = 0x17181c;
/** Catwalks in a ring round the scoreboard: half its length and width (ft); across over the ends: how far out. */
const RING = [46, 36] as const;
const ENDS_X = 52;
/** How many spots the light show has, whatever the catwalks (fx.ts Show makes them once). */
const SPOTS = 16;
/** Where the scoreboard's middle hangs (ft), and how far over it its cables go up to the roof's frame (arena.py CABLE_Y). */
const BOARD_Y = 62;
const BOARD_CABLES = 12;
/** A building with nothing said of its roof (before one is painted): deep trusses, catwalks along the sides, the big scoreboard. */
const ROOFING: Roofing = { kind: 'trusses', catwalk: 'sides', board: 'four', size: 1, rafters: 'far' };
/** The banners: in front of the far side's truss (or under the ceiling), facing the floor; or, turned, this far out over the high end (Roofing.rafters). */
const RAFTERS_END = 74;
/** The banners' places (over the far side). */
const BANNERS = Array.from({ length: 6 }, (_, i) => ({ x: (i - 2.5) * 19, y: ROOF_Y - 5.4 - 11, z: -70 + 2.4, w: 10, h: 22 }));
