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
// a home win all of it on its feet under confetti and streamers. The house lights go down for the open,
// a timeout and a home win, with the roof's spots sweeping the floor (fx.ts).
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
  Quaternion,
  RepeatWrapping,
  type Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COURT_LEN } from '../choreo';
import { END, FLOOR_L, FLOOR_W, HALF_W, SIDE, type GameInfo, type Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import { BIG, Boards } from './boards';
import { Bowl, DEEP, ENDX, FAR, RISE, ROOF_TOP, ROWS, TOP } from './bowl';
import { Crowd } from './crowd';
import { Confetti, Flashes, Show, Streamers } from './fx';
import type { Props } from './props';
import type { Sideline } from './sideline';

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
      // (each 2¼ in strip's face is a little off flat: its piece of the mirror sits a little up or down, the more
      // the higher what it shows; strips too fine to see don't)
      float across = (${(FLOOR_W / 2).toFixed(3)} - (cameraPosition.z - vView.z)) / 0.1875;
      float off = fract(sin(floor(across) * 12.9898) * 43758.5453) - 0.5;
      uv.y += off * 0.05 * min(high, 30.0) / far * (1.0 - smoothstep(0.45, 1.3, fwidth(across)));
      // (the taps turned a little from dot to dot: rows of seats don't come back as a lattice)
      float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 r = vec2(0.32, 1.0) * clamp((0.05 + high) * ${SHEEN_SOFT} / far, 0.0, 0.03) * (0.7 + 0.6 * turn);
      float lod = log2(max(r.y * uSize.y * 0.4, 1.0)) + 0.6 + min(high, 40.0) * 0.05;
      // (the mirror's picture is in the screen's terms: its taps are added up as light, near enough, and put back)
      vec3 c = lit(uv, lod * 0.5) * 0.24;
      c += (lit(uv + r * vec2(0.5, 0.25), lod) + lit(uv - r * vec2(0.5, 0.25), lod)) * 0.16;
      c += (lit(uv + r * vec2(-0.6, 0.55), lod) + lit(uv - r * vec2(-0.6, 0.55), lod)) * 0.12;
      c += (lit(uv + r * vec2(0.15, 0.95), lod) + lit(uv - r * vec2(0.15, 0.95), lod)) * 0.1;
      c = sqrt(c);
      // (a clear coat mirrors as glass does: a twenty-fifth of what is over it from above, most of it looked along)
      float graze = pow(1.0 - clamp(normalize(vView).y, 0.0, 1.0), 5.0);
      // (and fainter the higher what it shows: a varnish is not a mirror, the roof is a blur in it)
      gl_FragColor = vec4(c, strength * (0.04 + 0.96 * graze) / (1.0 + high * 0.03));
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
  private readonly steel: Object3D[];
  /** The benches: each part of the people on them (who wears which team's colours), their chairs' padding, the pads on the baskets. */
  private readonly seatMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.75, vertexColors: true });
  private readonly team: MeshStandardMaterial;
  private board = '';
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
    let k = 29;
    const pick = () => ((k = (k * 16807) % 2147483647) & 0xffff) / 0xffff;
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const at = new Vector3();
    const size = new Vector3();

    // cameras in the stands: a share of the seats, held up over a head toward the floor, and some up in the deck
    const cams: number[] = [];
    for (const s of this.bowl.seats) if (pick() < FLASH_SHARE) cams.push(s.x + 0.6 * Math.sin(s.turn), s.y + 5, s.z + 0.6 * Math.cos(s.turn));
    cams.push(...this.bowl.high);

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
    const roof = new Roof();
    const bank = (wide: number, x: number, z: number, turn: number) => {
      const g = new Matrix4().compose(at.set(x, 0, z), q.setFromAxisAngle(up, turn), size.set(1, 1, 1));
      // (a bank of lights over each side: what the floor's varnish catches)
      for (let i = -2; i <= 2; i++) {
        const hung = new Matrix4().makeRotationX(0.5).setPosition((i * wide) / 5.4, LAMP_Y, -30);
        banks.push(new PlaneGeometry(wide * 0.11, 3.2).applyMatrix4(hung).applyMatrix4(g));
        // (its housing: a dark box behind the lamps' face)
        darks.push(new BoxGeometry(wide * 0.11 + 0.8, 4, 1.2).translate(0, 0, -0.64).applyMatrix4(hung).applyMatrix4(g));
      }
      roof.rig(wide, g, LAMP_Y);
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
    // the roof: trusses over the floor and the lights on them, the banners on the far side's
    this.steel = roof.build(keep, this.group);
    this.boards.banners(roof.banners);
    this.boards.build();
    this.group.add(this.boards.group);
    this.flashes = new Flashes(keep, cams);
    this.group.add(this.flashes.points);
    this.confetti = new Confetti(keep);
    this.group.add(this.confetti.mesh);
    this.streamers = new Streamers(keep);
    this.group.add(this.streamers.mesh);
    this.lights = new Show(keep, roof.spots);
    this.group.add(this.lights.group);
    const scoreboard = props.scoreboard(this.boards.ringFace(), this.boards.screenFace());
    scoreboard.position.set(0, 62, 0);
    this.group.add(scoreboard);

    // the varnish (its picture keeps its depth, for how soft each part of it is, and its sizes down, to be read soft)
    // (one sample a dot: every dot of it is read through a blur)
    this.sheen = new Reflector(keep(new PlaneGeometry(FLOOR_L, FLOOR_W)), { textureWidth: 640, textureHeight: 400, clipBias: 0.02, shader: SHEEN, multisample: 0 });
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

  /** The building's colour (the home team's on its own floor): the pads on the baskets, the chairs, the seats, half the crowd and some of their towels, the walls' trim. */
  paint(board: string) {
    if (board === this.board) return;
    this.board = board;
    this.boards.paint(board);
    this.team.color.set(board);
    this.seatMat.color.set(board).multiplyScalar(0.75);
    this.bowl.paint(board);
    this.sideline.paint(board);
    this.crowd.paint(board, this.trim);
    this.lights.colours(board);
  }

  /** The benches in tonight's kits; each coach in a dark suit, his tie his team's colour. The visitors' fans in theirs; the boards and the confetti in both. */
  dress(kits: [MatchKit, MatchKit]) {
    this.boards.dress(kits);
    this.confetti.colours(kits[0].color, kits[0].trim);
    this.streamers.colours(kits[0].color, kits[0].trim);
    this.crowd.dress(kits[1].color, kits[1].trim);
    // (the home fans' second colour: on its own floor, the home side's)
    this.trim = kits[0].trim;
    if (this.board) this.crowd.paint(this.board, this.trim);
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
      return;
    }
    this.cheering = Math.max(this.cheering, much);
  }

  /**
   * A device that can't keep up, by the scene's steps (Court3D's STEPS, scene.lite): the crowd in lighter
   * models at each (crowd.ts shed); from the second the roof's steel, the glass and rails, the light spilt
   * from the tunnels and the boards gone, the boards painted less often and no light show; at the third
   * half the cameras, a third of the confetti, no streamers.
   */
  shed(lite: 0 | 1 | 2 | 3) {
    const level = lite > 2 ? 2 : lite > 1 ? 1 : 0;
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
  update(real: number, calm: boolean, stage?: Stage, p?: { game?: GameInfo; final?: 0 | 1; clutch?: boolean; names?: (pid: number) => string; jersey?: (pid: number) => string }) {
    const h = this.boards.house;
    this.boards.cast(p?.names, p?.jersey);
    this.boards.hear(Math.max(this.crowd.u.uCheer.value, 0.55 * this.crowd.u.uStand.value + 0.2 * Math.abs(Math.sin(this.crowd.u.uTime.value * 1.7))));
    if (stage) h.read(stage, p?.game, p?.final, !!p?.clutch, real);
    this.boards.update(real, calm);
    this.overMs = h.final === undefined ? 0 : this.overMs + real;
    const won = h.final === 0 && !!h.game;
    this.confetti.update(won ? this.overMs : -1, this.dimTo, calm);
    this.streamers.update(won ? this.overMs : -1, this.dimTo, calm);
    const u = this.crowd.u;
    if (calm) {
      this.cheering = this.awayUp = this.hush = this.wave = this.rally = this.show = 0;
      u.uCheer.value = u.uLag.value = u.uAway.value = u.uHush.value = u.uWave.value = u.uRally.value = u.uStand.value = u.uPhone.value = 0;
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
    const margin = g ? g.score[0] - g.score[1] : 0;
    const late = !!g && g.q >= 4 && g.clock <= 150 && Math.abs(margin) <= 9;
    const defending = h.off === 1 && !h.line;
    const tense = h.final === undefined && (h.clutch || late);
    // a cheer starts at the play's end of the floor and goes out across the building: the far end is up a moment later
    u.uCheer.value = ease(u.uCheer.value, Math.min(1, this.cheering * 1.6), 180);
    u.uLag.value = ease(u.uLag.value, u.uCheer.value, 480);
    u.uFrom.value.set(h.end * (MID - 6), 0);
    u.uAway.value = ease(u.uAway.value, this.awayUp, 180);
    u.uHush.value = ease(u.uHush.value, this.hush, 400);
    // (late in a close one most of the home crowd is on its feet and stays there, more of it with its side defending)
    u.uStand.value = ease(u.uStand.value, tense ? TENSE[defending ? 0 : 1] : 0, 1400);
    // towels: late in a close game with the home side defending, for a moment after a big home basket, and at a home win
    this.wave = ease(this.wave, (defending && tense) || won || (fresh(TOWEL_MS) && m!.side === 0) ? 1 : 0, 350);
    u.uWave.value = this.wave;
    this.rally = ease(this.rally, h.line && h.off === 1 ? 1 : 0, 300);
    u.uRally.value = this.rally;
    u.uEnd.value = h.end;
    // heads follow the ball (the ball's end of the floor, when the stage has none)
    const ball = stage?.ball;
    const look = u.uBall.value;
    look.x = ease(look.x, ball ? ball.y - MID : h.end * 30, 500);
    look.z = ease(look.z, ball ? -ball.x : 0, 500);
    look.y = ease(look.y, 0.8, 800);
    // a blowout late: the side that is losing it starts for the exits, and goes once it is lost
    const blown = !!g && g.q >= 4 && g.clock <= BLOWOUT_S && Math.abs(margin) >= BLOWOUT;
    const share = blown ? LEAVERS * Math.min(1, 0.35 + (BLOWOUT_S - g.clock) / BLOWOUT_S) : 0;
    const lost = h.final === undefined ? 0 : Math.min(LEAVERS_LOST, this.overMs / 30000);
    this.leave = ease(this.leave, Math.max(blown && margin < 0 ? share : 0, h.final === 1 ? lost : 0), 4000);
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
    if (won && this.overMs > 1200 && this.overMs - real <= 1200) this.lightsDown(WIN_SHOW_MS, at, WIN_SHOW);
    this.showMs += real;
    this.show = ease(this.show, this.showMs < this.showFor ? this.showTo : 0, this.showMs < this.showFor ? 320 : 700);
    const house = 1 - HOUSE_DOWN * this.show;
    this.lights.update(real, this.show, house);
    this.lamp.color.set(0xfff1dc).multiplyScalar(1 - 0.75 * this.show);
    this.boards.boost(1 / house);

    this.crowd.wave(this.wave > 0.02 || this.rally > 0.02, this.dimTo);
    // (the boards' light on the rows by them: the building's colour, up for a moment with a big one)
    if (this.board)
      u.uLed.value
        .set(this.board)
        .lerp(LED_WHITE, 0.35)
        .multiplyScalar((0.2 + (fresh(FLASH_MS) ? 0.25 * (1 - m!.ms / FLASH_MS) : 0)) * this.dimTo);
    // (sat down, the stands are a shade under the floor's light: the play is in front of them. On their feet they are in it)
    // (the steps, the seats and the walls go down with them, for a close-up and under the darker house: one bowl)
    const stands = this.dimTo * (1 - MOOD_DIM * this.mood);
    this.crowd.dim(stands * (SAT + (1 - SAT) * u.uCheer.value), stands);
    this.bowl.dim(this.dimTo / house, stands);
    this.bowl.cheer(u.uLag.value);
    // the cameras: a big moment's burst, a late free throw, the buzzer and the minutes after it, and now and then;
    // a few phones go up with them
    const burst = fresh(FLASH_MS) ? FLASH_BIG * (m!.side === 0 ? 1 : 0.5) * (1 - m!.ms / FLASH_MS) * (m!.call === 'buzzer' || m!.call === 'winner' ? 1.6 : 1) : 0;
    const end = h.final === undefined ? 0 : FLASH_FINAL * Math.max(0.15, 1 - this.overMs / 7000);
    const live = h.off !== null || h.final !== undefined ? FLASH_IDLE : 0;
    const rate = Math.max(burst, end, h.line && late ? FLASH_LINE : 0, live, this.show * 0.06);
    u.uPhone.value = ease(u.uPhone.value, rate > 0.03 ? 1 : 0, 600);
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
 * The roof: its deck, box trusses under it over the floor (four chords and the lacing between), a frame
 * the scoreboard's cables hang from, a truss over each side's banks of lights with the lights on
 * hangers, lights along the trusses over the floor, two catwalks along the floor's length with their
 * rails and the spots that sweep the floor in a light show on them, a cluster of speakers toward each
 * corner of the floor, and the banners on the far side's truss. Every bar is one instance of one box (a
 * draw for all the steel, each bar in its own grey), every light one of another, the banners one shape
 * (see Boards.banners).
 */
class Roof {
  private readonly bars: Matrix4[] = [];
  private readonly tints: number[] = [];
  private readonly lights: Matrix4[] = [];
  /** Where the spots that sweep the floor hang. */
  readonly spots: Vector3[] = [];
  readonly banners: { x: number; y: number; z: number; w: number; h: number }[] = [];
  private readonly q = new Quaternion();
  private readonly y = new Vector3(0, 1, 0);

  constructor() {
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    // over the floor: three along it, four across, under the roof
    for (const z of [-70, -35, 0, 35, 70, 105]) this.truss(v(-132, ROOF_Y, z), v(132, ROOF_Y, z), 4, 5, 8);
    for (const x of [-95, -45, 45, 95]) this.truss(v(x, ROOF_Y - 5.2, -100), v(x, ROOF_Y - 5.2, 118), 4, 4.6, 8);
    // a catwalk either side of the scoreboard, hung under the trusses: a deck, a rail each side on posts, hangers
    // up; the spots are on its floor-side rail
    for (const z of [-19, 19]) {
      const y = ROOF_Y - 13;
      this.plank(v(-104, y, z), v(104, y, z), 3.4, 0.25, 0x2c2e33);
      for (const s of [-1, 1]) {
        for (const h of [1.7, 3.3]) this.bar(v(-104, y + h, z + s * 1.7), v(104, y + h, z + s * 1.7), 0.1, 0x55585f);
        for (let x = -104; x <= 104; x += 8) this.bar(v(x, y, z + s * 1.7), v(x, y + 3.3, z + s * 1.7), 0.1, 0x55585f);
      }
      for (const x of [-95, -45, 45, 95]) for (const s of [-1, 1]) this.bar(v(x + s * 1.6, y + 3.3, z + s * 1.7), v(x + s * 1.6, ROOF_Y - 9.8, z + s * 1.7), 0.14);
      const side = z < 0 ? 1 : -1;
      for (let x = -84; x <= 84; x += 24) {
        const at = v(x + (z > 0 ? 12 : 0), y - 1.1, z + side * 1.9);
        if (Math.abs(at.x) > 96) continue;
        this.spots.push(at);
        this.plank(at.clone().setY(y - 0.2), at.clone().setY(y - 0.75), 0.5, 0.5, 0x1a1b1e);
        this.plank(v(at.x, at.y + 0.5, at.z), v(at.x, at.y - 0.7, at.z + side * 0.5), 1.1, 1.1, 0x16171a);
      }
    }
    // speakers: a hanging run of boxes toward each corner of the floor, curling in under itself as such runs do
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const [cx, cz] = [sx * 30, sz * 31];
        const out = v(sx, 0, sz * 0.75).normalize();
        this.bar(v(cx, ROOF_Y - 5.4, cz), v(cx, ROOF_Y - 18, cz), 0.12);
        for (let i = 0; i < 8; i++) {
          const tilt = 0.05 + i * 0.075;
          const mid = v(cx, ROOF_Y - 18.8 - i * 1.55, cz).addScaledVector(out, -i * i * 0.06);
          const dir = out.clone().multiplyScalar(Math.cos(tilt)).setY(-Math.sin(tilt));
          this.plank(mid.clone().addScaledVector(dir, -1.2), mid.clone().addScaledVector(dir, 1.2), 4.2, 1.45, i % 2 ? 0x1b1c20 : 0x222429);
        }
      }
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

  /** The steel and the lights, made (and given back, to be hidden on a slow device); the roof's deck over them stays. */
  build(keep: Keep, group: Group): Object3D[] {
    const unit = keep(new BoxGeometry(1, 1, 1));
    // (the steel shows a little whatever the light: the lamps point down, and a roof is never quite black)
    const steel = keep(new MeshLambertMaterial({ color: 0xffffff, emissive: 0x1e2025 }));
    const glow = keep(new MeshBasicMaterial({ color: 0xfff1dc }));
    const made: Object3D[] = [];
    const c = new Color();
    for (const [list, mat] of [
      [this.bars, steel],
      [this.lights, glow],
    ] as const) {
      const mesh = keep(new InstancedMesh(unit, mat, list.length));
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      if (mat === steel) this.tints.forEach((t, i) => mesh.setColorAt(i, c.set(t)));
      mesh.frustumCulled = false;
      group.add(mesh);
      made.push(mesh);
    }
    const deck = new Mesh(
      keep(new PlaneGeometry(310, 290)),
      keep(new MeshLambertMaterial({ color: 0x2c2e33, emissive: 0x17181c, map: ribbed(keep), emissiveMap: ribbed(keep), side: DoubleSide })),
    );
    deck.rotation.x = Math.PI / 2;
    deck.position.set(0, ROOF_TOP, 14);
    group.add(deck);
    return made;
  }
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

/** How high the tops of the roof's trusses over the floor are (ft). */
const ROOF_Y = 104;
