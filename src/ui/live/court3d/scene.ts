// The 3D court: the floor the 2D court paints, two baskets, ten figures and a ball, seen from a
// broadcast camera on the sideline. It draws the moment the 2D court's clock is at (its Stage): the
// plan's positions, facings and acts go to each figure's puppet, the ball goes from hand to hand,
// and that is all. Loaded on demand (three.js stays out of the app's first download).
import {
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
  type WebGLRenderTarget,
} from 'three';
import { BASKET, COURT_LEN, faceWorld, toWorld, type Act, type Flash, type Pt, type Script } from '../choreo';
import { FLOOR_L, FLOOR_W, type GameInfo, type Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import { Arena } from './arena';
import { DUNK_AT, isDunk } from './clips';
import { BIG_WORD, Director, WIPE_MS, type BigKind } from './director';
import { Fig, figureGeo, type Geo } from './figure';
import { air, arenaLight, HAZE_COLOR, HAZE_DENSITY, Lens, varnish, type FloorKnobs } from './lens';
import type { Models } from './models';
import { buildProps } from './props';
import { BALL_R, hash, J, type Body, type V3 } from './puppet';
import { bounced, clearOf, passPath, Spacing, swerve, type PassPath } from './spacing';

export interface SceneProps {
  kits: [MatchKit, MatchKit];
  jersey: (pid: number) => string;
  body: (pid: number) => Body;
  names?: (pid: number) => string;
  /** The game as the court has played it, for the building's boards (none in a highlight). */
  game?: GameInfo;
  hot?: ReadonlySet<number>;
  /** The colours of the building: the boards along the far side, the warning ring. */
  board: string;
  warn: string;
  /** The game is over: the side that won it (they celebrate, the others don't). */
  final?: 0 | 1;
  /** Clutch time: the main camera comes in a little, and the building is on its feet for less. */
  clutch?: boolean;
}

/** What the page writes over the picture this frame (in CSS pixels). */
export interface Labels {
  /** The ball handler's tag: his name and number, in his team's colour. */
  tag: { x: number; y: number; text: string; num: string; color: string } | null;
  flash: { x: number; y: number; text: string; kind: Flash['kind']; alpha: number } | null;
  /** The lower third: the man a cut-in or a replay is on, and what he did (`key` changes when it does). */
  third: { key: string; name: string; num: string; color: string; team: string; word: string } | null;
  /** An instant replay has the picture (its bug shows). */
  replay: boolean;
  /** A wipe across the picture, how far (0..1), in the colours of the side whose play it is. */
  wipe: { at: number; color: string; trim: string } | null;
}

const MID = COURT_LEN / 2;
const RIM_H = 10;
/** How far in front of its hinge at the board the rim's middle is (ft): it tips about the hinge. */
const RIM_HINGE = 1.2;
/** Gravity in the game's sped-up time, ft a second squared. */
const G = 85;
/** Acts that go at the rim. */
const AIMED = new Set<Act>(['layup', 'dunk', 'floater', 'jumper', 'release']);
/** The joints that stand on the floor. */
const FEET = [J.fl, J.fr];
/** A camera stays on at least this long (ms) before the picture cuts to another. */
const HOLD_MS = 900;
/** Nothing to follow for this long (ms): the picture cuts to the whole building. */
const WIDE_AFTER = 1500;
/** A cut-in (a close-up of a scorer or the man a whistle was for) has this long at most (ms), and there is this long between two. */
const CUT_MS = 1700;
const CUT_GAP = 12000;
/** And goes this far round him while it holds (radians). */
const CUT_ARC = 0.1;
/** The play runs no faster than this against the clock for a cut-in (at 4x there is no time for one). */
const CUT_PACE = 1.1;
/** A timeout's shot of the building holds this long at most (ms), while nothing is being played. */
const HOUSE_MS = 4200;
/** The game's first possession: the picture comes up from low by the centre circle into the main camera over this long (ms). */
const OPEN_MS = 2600;
/** Where a man is put to be sure he is cut to his spot, not walked there (see recut). */
const NOWHERE = 1e4;
/** The tip's line-up is seen from this far off the centre circle (ft), going round it from this side (radians) at this pace (a second). */
const TIP_OFF = 30;
const TIP_FROM = -0.45;
const TIP_TURN = 0.07;
/** The free-throw camera comes in on the shooter over this long (ms). */
const FT_PUSH = 2600;
/** The final buzzer's camera comes in on the winners over this long (ms), from this far off them (ft). */
const FINAL_MS = 5000;
const FINAL_OFF = 31;
/** A camera on a man's shoulder moves this much (ft) as it holds; the main camera's operator lets the frame wander this much. */
const HAND = 0.1;
const OPERATOR = 0.45;
/** How much of their light the stands keep behind a close-up: the picture is the player, not the crowd behind him. */
const CUT_DIM = 0.18;
/** And the benches while a play is on: the men on the floor by the far sideline stand out from their own bench. */
const BENCH_DIM = 0.4;
/** And from the low camera at a free throw, which looks along them. */
const FT_BENCH = 0.24;
/** At the buzzer each man takes it in in his own time: the last of them this long (ms) after the first. */
const BUZZER_MS = 900;
/** A body's trunk is this thick (ft from its middle, on the 6 ft 6 puppet): a ball in the air stays outside it. */
const TRUNK = 0.5;
/** And out of heads: a head's (on the 6 ft 6 puppet), and how far off a body the ball starts to give way (ft). */
const SKULL = 0.42;
const GIVE = 0.4;
/** The ball gives way to a body over this long (ms), not in a frame: it bends round a man, it doesn't hop off him. */
const BEND_MS = 80;
/** A loose ball is moved off a body at this speed at most, ft a second: it rolls off him, it doesn't jump. */
const BALL_PUSH = 14;
/** Steps aside may run this much faster than the clock when the game does: slower and the bodies meet, faster and they jump. */
const ASIDE_PACE = 1.5;
/** A possession whose first spot for a man is this far (ft) from where the last frame had him doesn't pick up from it: everyone is put on his spot. */
const FRESH = 2.5;
/** How soft a close-up's building goes behind its man (lens.focus), and a replay's (its cameras are wider). */
const CLOSE_SOFT = 0.6;
const REPLAY_SOFT = 0.4;
/** The flash of light on a slam, and on a shot at the buzzer that drops (lens.bump; none with reduced motion). */
const DUNK_BUMP = 0.16;
const BUZZER_BUMP = 0.22;
/** On the lane at a free throw: men this near the rim (ft) get down into a stance as it goes up. */
const LANE_FT = 11;
/** The last this many seconds of the fourth (or overtime): the men are tired, and show it when they stand. */
const LATE_S = 150;
/** The man with the ball looks up the floor and round his teammates, a new one about this often (ms); a defender off the ball finds his own man as often. */
const SCAN_MS = 900;
const SPLIT_MS = 800;
/** After a big basket, for this long (the bodies' ms), a teammate who comes within FIVE_NEAR (ft) of the scorer slaps his hand. */
const FIVE_MS = 3600;
const FIVE_NEAR = 4.6;
/** At the buzzer, winners this near each other (ft) pair off for a chest bump, walking this long (ms) to meet. */
const PAIR_NEAR = 9;
const PAIR_MS = 650;
/** Each stands this far (ft) from the middle of the two: near enough that their chests meet at the top. */
const PAIR_GAP = 1.15;
/** A winner with the ball at the buzzer throws it up: this fast (ft a second). */
const TOSS = 40;
/** A loose ball rolls to a stop over about this long (s), and a bounce keeps this much of its roll. */
const ROLL_S = 0.9;
const ROLL_KEEP = 0.7;
/** The ways a shot misses: off the front of the rim, off the back, off the side, in and out round the ring. */
const MISSES = ['front', 'front', 'front', 'back', 'back', 'side', 'round'] as const;
/** The ring's middle to its iron (ft, near enough for the ball's middle on it); in and out, the ball gets to the ring this far into its flight and goes this far round it (radians). */
const RING = 0.75;
const ROUND_AT = 0.8;
const ROUND_TURN = 4.2;
/** A rebound's arc off the rim (ft above the line from the rim to his hands, and more the farther it goes). */
const REBOUND_ARC = 2.2;

/** The lights the crowd shares with the floor and the figures (see the constructor): the soft light from above, all round, and back up off the wood. */
const SKY = 1.0;
const FILL = 0.14;
const BOUNCE = 0.36;
/** How much of the floor's colour the light off it loses (see warm). */
const BOUNCE_GREY = 0.45;
/** The key's shadow map holds the floor and this much round it (ft), and is this deep along the light (ft: lens.ts SHADOW_FT is the same). */
const SHADOW_MARGIN = 2;
const SHADOW_DEPTH = 120;
/** How far a device that can't keep up has stepped down (see lite). */
export type Lite = 0 | 1 | 2 | 3;

/** A ball through the net pulls it for this long (ms): down, flicked back up past where it hangs, and still. */
const NET_MS = 700;
/** The main camera gets to where it is turning in about this long (s): it starts and stops, it doesn't lurch. */
const FOLLOW_S = 0.34;
/** And looks this far ahead of a ball on its way along the floor: ft for each ft a second, and at most. */
const LEAD = 0.14;
const LEAD_MAX = 5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** A point on the court, in the scene: x along the floor, z across it (toward the camera). */
const sx = (p: Pt) => p.y - MID;
const sz = (p: Pt) => -p.x;

const A = new Vector3();
const TMP: V3 = { x: 0, y: 0, z: 0 };
const TMP2: V3 = { x: 0, y: 0, z: 0 };
const SIDE = { x: 0, z: 0 };

export class CourtScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1.3, 4, 700);
  private readonly geo: Geo;
  private readonly arena: Arena;
  private readonly key: DirectionalLight;
  private readonly sky: HemisphereLight;
  private readonly bounce: DirectionalLight;
  private bounced: CanvasTexture | null = null;
  /** The picture as a broadcast camera makes it: its knobs (exposure, bump, focus) are for whoever directs it. */
  readonly lens: Lens;
  // the building's light (an environment map, one for each floor), the floor's knobs, the air's beams and dome
  private envMap: WebGLRenderTarget | null = null;
  private readonly floorKnobs: FloorKnobs;
  private readonly beams: Object3D;
  private readonly dome: Object3D;
  // the picture's size in the screen's own dots, and how far the device has stepped down
  private readonly px = new Vector2(640, 400);
  private level: Lite = 0;
  private readonly figs = new Map<number, Fig>();
  private readonly trash: { dispose(): void }[] = [];
  private readonly floorMat: MeshStandardMaterial;
  private floorTex: CanvasTexture | null = null;
  private readonly ballMesh: Object3D;
  private readonly ballShadow: Mesh;
  private readonly nets: Object3D[] = [];
  private readonly rims: Object3D[] = [];
  private readonly units: Object3D[] = [];
  private readonly swish: Vector3[] = [];
  // how hard the net and the rim were last hit (a dunk more than a shot), and the way the ball last rolled
  private netHit = 1;
  private rimHit = 1;
  private readonly spin = new Vector3(1, 0, 0);
  // the main camera's turn: how fast it is turning, how fast the ball goes along the floor, how far it has come in for the clutch
  private focusV = 0;
  private ballVx = 0;
  private tight = 0;
  // the ball: where it is, where this move picked it up, how fast it's falling
  private readonly ball = new Vector3(0, BALL_R, 0);
  private readonly from = new Vector3();
  private readonly swatAt = new Vector3();
  private vy = 0;
  private moveKey = '';
  private lastScript: unknown = null;
  private scriptN = 0;
  private heldBy: number | null = null;
  private slammed = false;
  // a shot has landed (it falls on its own from there); a pass's way past whoever is in its lane (null: not worked out)
  private landed = false;
  private path: PassPath | null = null;
  // a loose ball's roll along the floor (ft a second), and whether the buzzer's ball has been thrown up
  private readonly drift = { x: 0, z: 0 };
  private tossed = false;
  // the players' reactions: the move last looked at, the basket last counted and its scorer, the teammates coming to him
  private reactKey = '';
  private madeKey = '';
  private shooter: Fig | null = null;
  private fives: { by: Fig; ms: number; n: number; done: Set<Fig> } | null = null;
  // the clock their eyes move on (ms), and the buzzer's chest bumps: each winner's partner, where they meet and when
  private lookMs = 0;
  private pairs: Map<number, { mate: number; x: number; z: number; at: number }> | null = null;
  // free throws: the frames of this script a man shoots them in
  private ftAt: number[] = [];
  // the main camera, looking nearer for a ball on the near side and higher for one in the air
  private dip = 0;
  private lift = 0;
  private netKick = 0;
  private rimKick = 0;
  private focus: number | null = null;
  // the camera on now, how long it has been (ms), how long there has been nothing to follow, how far it has pushed in
  private shot: 'main' | 'ft' | 'wide' | 'close' | 'house' | 'tip' | 'open' | 'final' = 'main';
  private shotMs = 0;
  private idleMs = 0;
  private push = 0;
  private ftEnd = 0;
  // a cut-in: the one asked for (and how long ago, ms), who it's on, the move it was asked in, where its camera is and looks
  private cue: 'close' | 'house' | null = null;
  // and what the lower third says he did
  private cueWord = '';
  private cueMs = 0;
  private star: number | null = null;
  private scorer: number | null = null;
  private cutKey = '';
  private cutN = 0;
  private cutGap = CUT_GAP;
  private kicked = 0;
  private flashed: Flash | null = null;
  private readonly seat = new Vector3();
  private readonly look = new Vector3();
  private w = 1;
  private h = 1;
  private kitKey = '';
  private readonly spacing = new Spacing();
  // how long the game has been over, in the bodies' time (ms)
  private finalMs = 0;
  // the replays, and the hand on the cameras (director.ts); the rim taking a dunk, as last seen
  private readonly director = new Director();
  private slamSeen = false;
  // the final buzzer's camera: which way round the winners it stands (radians from the near side)
  private finalA = 0;
  // the camera as it was before this frame's aim (a cut dissolves from its picture)
  private readonly was = { pos: new Vector3(), dir: new Quaternion(), fov: 30 };
  /**
   * Set by the page where a cut may dissolve (Court3D: the top step only, it costs a second render on the
   * frame of the cut): called with the last camera's picture of this moment on the canvas, just before the
   * new camera's is drawn over it.
   */
  cutHook: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, ballFill: string, ballSeam: string, models: Models) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default' });
    this.renderer.setClearColor(0x0c0c0d);
    // (the tone curve is the materials', on every step: the lens finishes the picture after it, see lens.ts)
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.lens = new Lens(this.renderer);
    const keep = <T extends { dispose(): void }>(o: T): T => (this.trash.push(o), o);
    this.geo = figureGeo(keep, models.figure);

    // light: an arena's, from high over the floor (it throws the shadows), a little from behind for an edge,
    // and what comes back up off the wood onto the undersides of things (its colour is the floor's: see frame).
    // Most of the soft light is the building's own (the environment: see warm), which gives a body its form;
    // these are what the crowd, which takes no environment, is lit by as well.
    this.sky = new HemisphereLight(0xffffff, 0x9a7d5e, SKY);
    this.scene.add(this.sky);
    this.scene.add(new AmbientLight(0xffffff, FILL));
    this.bounce = new DirectionalLight(0xc89a66, BOUNCE);
    this.bounce.position.set(0, -40, 14);
    this.scene.add(this.bounce);
    const key = new DirectionalLight(0xfffaf3, 2.1);
    key.position.set(30, 84, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    // (its map is the floor as the light sees it, turned square on to it and no bigger: a body over the floor
    // throws its shadow where it is in the map, so the floor is all the map need hold)
    const sc = key.shadow.camera;
    sc.up.set(0, 0, -1);
    const toKey = key.position.clone().normalize();
    const across = new Vector3().crossVectors(sc.up, toKey).normalize();
    const up = new Vector3().crossVectors(toKey, across);
    let [wide, high] = [0, 0];
    for (const [x, z] of [
      [FLOOR_L / 2, FLOOR_W / 2],
      [FLOOR_L / 2, -FLOOR_W / 2],
    ]) {
      wide = Math.max(wide, Math.abs(across.x * x + across.z * z));
      high = Math.max(high, Math.abs(up.x * x + up.z * z));
    }
    sc.left = -wide - SHADOW_MARGIN;
    sc.right = wide + SHADOW_MARGIN;
    sc.top = high + SHADOW_MARGIN;
    sc.bottom = -high - SHADOW_MARGIN;
    sc.near = 20;
    sc.far = 20 + SHADOW_DEPTH;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.04;
    // (a soft edge, and not black: a building has more lights than this one. The floor's own shadow is
    // sharp at a foot and this soft by a head: see varnish)
    key.shadow.radius = 5;
    key.shadow.intensity = 0.8;
    this.key = key;
    this.scene.add(key);
    // (an edge, not an outline: any stronger and a green kit gets a lime line round it)
    const rim = new DirectionalLight(0xe4e8f4, 0.42);
    rim.position.set(-24, 40, -70);
    this.scene.add(rim);

    // the floor as the 2D court paints it, lit: varnished maple that takes the shadows and the lamps (see lens.ts)
    const ground = new Mesh(keep(new PlaneGeometry(520, 420)), keep(new MeshBasicMaterial({ color: 0x0e0e0f })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    this.scene.add(ground);
    this.floorMat = keep(new MeshStandardMaterial({ color: 0xdcae76, roughness: 0.85, metalness: 0 }));
    this.floorKnobs = varnish(this.floorMat);
    // the air: lit faintly round the lamps' height, their beams down through it; and a haze, so the far stands sit back
    const { group: airGroup, beams, dome } = air(keep);
    this.beams = beams;
    this.dome = dome;
    this.scene.add(airGroup);
    this.scene.fog = new FogExp2(HAZE_COLOR, HAZE_DENSITY);
    const floor = new Mesh(keep(new PlaneGeometry(FLOOR_L, FLOOR_W)), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // what Blender built (scripts/blender): the baskets, the ball, the furniture, the people on the benches
    const props = buildProps(models.arena, keep);
    this.arena = new Arena(keep, props, models.people);
    this.scene.add(this.arena.group);

    // the baskets: the unit behind each baseline, its board, the rim and its net
    for (const end of [-1, 1]) {
      const { group, rim, net, swish } = props.basket();
      // (built for the basket at the low end, facing up the floor; the other is turned round)
      group.position.set(end * (MID - BASKET.y), 0, 0);
      if (end > 0) group.rotation.y = Math.PI;
      this.rims.push(rim);
      this.nets.push(net);
      this.units.push(group);
      this.swish.push(swish);
      this.scene.add(group);
    }

    this.ballMesh = props.ball(ballFill, ballSeam);
    this.scene.add(this.ballMesh);
    const under = keep(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }));
    const ballBlob = keep(new CircleGeometry(0.42, 14));
    ballBlob.rotateX(-Math.PI / 2);
    this.ballShadow = new Mesh(ballBlob, under);
    this.ballShadow.renderOrder = 3;
    this.scene.add(this.ballShadow);
  }

  /**
   * A device that can't keep up: the picture straight to the screen, unfinished and without the lamps'
   * beams (1), no shadows thrown either (2), and no mirror in the floor, nor its fine wood, nor the lit
   * air over the stands (3).
   */
  lite(level: Lite) {
    this.level = level;
    this.arena.mirror(this.px.x, this.px.y, level < 1);
    this.lens.post = level < 1;
    this.beams.visible = level < 1;
    this.key.castShadow = level < 2;
    this.arena.lite(level > 2);
    this.floorKnobs.uDetail.value = level > 2 ? 0 : 1;
    this.dome.visible = level < 3;
    // (the building's extras: the roof's steel and the boards' rate from step 2, half the cameras and confetti at 3)
    this.arena.shed(level > 2 ? 2 : level > 1 ? 1 : 0);
    // (the players' plain material, no cloth sheen nor knit, once the shadows have gone too)
    this.figLite = level > 1;
    for (const f of this.figs.values()) f.lite(this.figLite);
  }

  /**
   * What comes back up off the floor is the floor's colour (kept warm: it is mostly wood), and the
   * building's light is drawn again round it.
   */
  private warm(floor: CanvasTexture) {
    // (its average colour: halved and halved again, each time four dots to one, then summed; a canvas drawn
    // straight down to one dot is one dot of it, which is the white of the halfway line)
    let from = floor.image as HTMLCanvasElement;
    let w = from.width;
    let h = from.height;
    const one = document.createElement('canvas');
    const ctx = one.getContext('2d', { willReadFrequently: true })!;
    one.width = w = Math.max(1, w >> 1);
    one.height = h = Math.max(1, h >> 1);
    ctx.drawImage(from, 0, 0, w, h);
    from = one;
    while (w > 48) {
      ctx.drawImage(from, 0, 0, w, h, 0, 0, w >> 1, h >> 1);
      w >>= 1;
      h = Math.max(1, h >> 1);
    }
    const px = ctx.getImageData(0, 0, w, h).data;
    let [r, g, b] = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) [r, g, b] = [r + px[i], g + px[i + 1], b + px[i + 2]];
    const n = px.length / 4;
    const c = this.sky.groundColor.setRGB(r / n / 255, g / n / 255, b / n / 255, SRGBColorSpace);
    // (half its colour: a white kit stays white over it, the camera balanced for the floor under the lamps)
    const grey = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    c.lerp(new Color(grey, grey, grey), BOUNCE_GREY);
    const wood = c.clone();
    c.setRGB(c.r * 0.6 + 0.132, c.g * 0.6 + 0.084, c.b * 0.6 + 0.044);
    this.bounce.color.copy(c);
    this.envMap?.dispose();
    this.envMap = arenaLight(this.renderer, wood);
    this.scene.environment = this.envMap.texture;
  }

  /** The floor as the 2D court paints it (the whole floor, sideways). */
  setFloor(cv: HTMLCanvasElement) {
    this.floorTex?.dispose();
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.floorTex = tex;
    this.floorMat.map = tex;
    this.floorMat.color.set(0xffffff);
    this.floorMat.needsUpdate = true;
  }

  size(w: number, h: number, ratio: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    // (the picture's own dots, exactly: the lens's target is drawn to the screen dot for dot)
    const px = this.renderer.getDrawingBufferSize(this.px);
    this.lens.size(px.x, px.y);
    this.arena.mirror(px.x, px.y, this.level < 1);
    this.camera.aspect = w / h;
  }

  /** The figures wear their plain material (no cloth's sheen or knit): a device that can't keep up (see lite). */
  private figLite = false;

  private fig(pid: number, side: 0 | 1, p: SceneProps): Fig {
    let f = this.figs.get(pid);
    // (his team's letters go on his kit once the game has them: none in a highlight)
    const mark = p.game?.abbrevs[side] ?? '';
    if (f && (f.side !== side || f.mark !== mark)) {
      this.drop(pid, f);
      f = undefined;
    }
    if (!f) {
      // (his crop of hair, his sleeves and shoes are his own every night: no likeness, only so ten men are not one man)
      f = new Fig(this.geo, p.body(pid), side, p.kits[side], p.jersey(pid), pid, p.names?.(pid), mark);
      f.lite(this.figLite);
      this.figs.set(pid, f);
      this.scene.add(f.group, f.shadow, f.ring);
    }
    return f;
  }

  private drop(pid: number, f: Fig) {
    this.scene.remove(f.group, f.shadow, f.ring);
    f.dispose();
    this.figs.delete(pid);
    this.planAt.delete(pid);
  }

  /**
   * One frame: `dt` is the play's time since the last (ms; none while it's paused), `own` the
   * bodies' (they run faster than the play: see Puppet.update), `real` the clock's (the camera eases
   * on it). `calm`: reduced motion, so the camera holds the whole floor and
   * the net and the rim keep still.
   */
  frame(stage: Stage, p: SceneProps, dt: number, real: number, calm: boolean, own = dt): Labels {
    // (the building's boards and its crowd keep to the live game: a replay is the broadcast's, not the arena's clock)
    const live = stage;
    // an instant replay has the picture: the moment it is at goes through everything below in place of the
    // live one (director.ts); on the frame it cuts in, and the one it cuts back, everyone starts afresh
    if (calm) this.director.end();
    // (a cut-in on the scorer has the picture until the wipe comes over it at its end)
    const reel = this.director.feed(stage, dt, own, real, this.shot === 'close' && this.shotMs < CUT_MS - WIPE_MS / 2);
    if (reel) {
      stage = reel.stage;
      dt = reel.dt;
      own = reel.own;
      if (reel.cut) this.recut();
    }
    // (new kits: everyone is dressed again)
    const kitKey = p.kits.map((k) => k.token.fill + k.token.ring + k.token.num).join();
    if (kitKey !== this.kitKey) {
      this.kitKey = kitKey;
      for (const [pid, f] of [...this.figs]) this.drop(pid, f);
      this.arena.dress(p.kits);
    }
    this.arena.paint(p.board);
    this.arena.update(real, calm, live, p);
    const sc = stage.script;
    const play = stage.play;
    const ball = this.ball;
    const seen = new Set<number>();
    const labels: Labels = { tag: null, flash: null, third: null, replay: false, wipe: null };
    // (what is eased, a turn, a step aside, arms going up, is eased on the clock: no bigger a frame at 2x or 4x)
    const ease = Math.min(own, real);
    const aside = Math.min(own, real * ASIDE_PACE);
    // (the buzzer is a held moment: after it the bodies run on the clock too, whatever speed the game was played at)
    if (p.final !== undefined) own = ease;
    const sec = own / 1000;
    this.finalMs = p.final === undefined ? 0 : this.finalMs + ease;
    // (the buzzer: the winners go up and the others' heads go down one after another, not all ten in one frame)
    const over = (pid: number, side: 0 | 1, act: Act): Act =>
      p.final === undefined || this.finalMs < (((pid * 131 + 17) % 10) / 9) * BUZZER_MS ? act : side === p.final ? 'celebrate' : 'rue';
    /** Whose arms go to the ball this frame. */
    const hands = new Set<Fig>();
    let holder: Fig | null = null;
    let free = false;
    let rimEnd = 0;
    let line = false;
    let near = 0;
    let backspin = false;
    /** The building gets up for a basket: all of it for the home side's big ones, a stir for the visitors'. */
    const roar = (home: boolean, big: boolean) => this.arena.cheer(home ? (big || p.clutch ? 1 : line ? 0.25 : 0.42) : big ? 0.22 : 0.12);
    // (where the page's words go: found now, put on the picture once the camera is aimed)
    let tagAt: { x: number; z: number; text: string; num: string; color: string } | null = null;
    let flashAt: { x: number; z: number; fl: Flash; alpha: number } | null = null;

    const started = sc !== this.lastScript;
    if (started) {
      this.lastScript = sc;
      this.scriptN++;
      this.ftAt = [];
      sc?.frames.forEach((f, k) => f.act.includes('ft') && this.ftAt.push(k));
    }

    if (sc && play) {
      this.lookMs += ease;
      const nO = sc.oPids.length;
      const a = play.a;
      const b = play.b;
      const rimPt = toWorld(BASKET, sc.dir);
      const rim = { x: sx(rimPt), z: sz(rimPt) };
      rimEnd = rim.x < 0 ? 0 : 1;
      let carried = play.carried ? (a.hold as number) : -1;
      const figs: Fig[] = [];
      // (the move the play is in: past the script's end it is still its last)
      const bi = Math.min(play.i, sc.frames.length - 1);
      // a trip to the line: from the men taking their places to the shot landing, and the dead ball after it
      line = this.ftAt.some((k) => (bi === k - 1 && play.u > 0.5) || bi === k || bi === k + 1);
      // a possession from fresh spots (a highlight, a skip, after a break): some man doesn't start where he was
      const pids = [...sc.oPids, ...sc.dPids];
      const f0 = sc.frames[0];
      const cut =
        started &&
        pids.some((pid, j) => {
          const was = this.planAt.get(pid);
          const w = toWorld(j < nO ? f0.o[j] : f0.d[j - nO], sc.dir);
          return !!was && Math.hypot(sx(w) - was[0], sz(w) - was[1]) > FRESH;
        });
      const spots = this.apart(sc, play, own, aside, cut);
      // a dead ball (the line, a whistle, a timeout, everyone waiting): men stand up out of their stance and may rest
      const dead = line || b.flash?.kind === 'foul' || !!b.flash?.text.startsWith('Timeout') || b.act.every((x) => x === 'stand' || x === 'hold');
      const late = sc.q >= 4 && play.clock <= LATE_S;
      const looks = this.looks(sc, play, bi, dead);
      pids.forEach((pid, j) => {
        const side = (j < nO ? sc.off : 1 - sc.off) as 0 | 1;
        const f = this.fig(pid, side, p);
        const said = over(pid, side, b.act[j]);
        // (out of their stance at a dead ball; on the lane at a free throw, down into one as it goes up)
        const lane = line && said === 'stand' && (b.act.includes('ft') || b.act.includes('release')) && Math.hypot(spots[j * 2] - rim.x, spots[j * 2 + 1] - rim.z) < LANE_FT;
        const act = lane ? 'defend' : dead && (said === 'defend' || said === 'guard') ? 'stand' : said;
        const end = this.paired(pid, side, spots[j * 2], spots[j * 2 + 1], Math.PI - faceWorld(b.face[j], sc.dir), p);
        const nb = sc.frames[bi + 1];
        f.pup.update(
          {
            x: end.x,
            z: end.z,
            yaw: end.yaw,
            act,
            ms: play.ms,
            dur: play.dur,
            // (at the buzzer the man with the ball lets it go: his arms are up, or his head is down, like everyone's)
            ball: j === carried && said === b.act[j],
            aim: AIMED.has(act) ? rim : undefined,
            cut,
            look: looks[j],
            rest: dead || p.final !== undefined,
            tired: late,
            // (holding it at the line: how long until it goes up)
            ft: said === 'hold' && nb?.act[j] === 'ft' ? Math.max(0, play.dur - play.ms) : undefined,
            over: p.final !== undefined,
            bump: end.bump,
            who: pid,
          },
          dt,
          own,
          ease,
        );
        figs.push(f);
        seen.add(pid);
      });
      // a possession that doesn't pick up where the last ended: the ball is where it starts
      const key = `${this.scriptN}:${bi}`;
      if (key !== this.moveKey) {
        const fresh = !this.moveKey.startsWith(`${this.scriptN}:`);
        this.moveKey = key;
        this.slammed = false;
        this.landed = false;
        this.path = null;
        if (fresh) {
          const start = toWorld(sc.frames[0].ball, sc.dir);
          if (cut || Math.hypot(ball.x - sx(start), ball.z - sz(start)) > 12) {
            ball.set(sx(start), BALL_R, sz(start));
            this.bend.x = this.bend.z = 0;
          }
        }
        // (where the move picks it up, less what a body by it had moved it: that is still added on, eased)
        this.from.set(ball.x - this.bend.x, ball.y, ball.z - this.bend.z);
        this.vy = 0;
      }
      const lu = play.dur > 0 ? clamp(play.ms / play.dur, 0, 1) : 1;
      const was = a.hold !== undefined && a.hold >= 0 ? figs[a.hold] : null;
      const next = b.hold !== undefined && b.hold >= 0 ? figs[b.hold] : null;
      if (was) hands.add(was);
      if (next) hands.add(next);
      if (carried >= 0 && over(pids[carried], figs[carried].side, 'hold') !== 'hold') {
        // (a winner with the ball throws it up in the air)
        if (figs[carried].side === p.final) this.toss();
        carried = -1;
        free = true;
      } else if (carried >= 0) {
        holder = figs[carried];
        set(ball, holder.pup.carry(TMP));
        this.give(holder, null, ease);
      } else if (b.fx) {
        const one = was?.pup.one;
        if (was && one && isDunk(one.id) && !this.slammed) {
          // a dunk: it stays in his hands to the rim
          set(ball, was.pup.carry(TMP));
          this.give(null, null, ease, false);
          holder = was;
          if (one.tau >= DUNK_AT) {
            this.slammed = true;
            ball.set(rim.x, RIM_H - 0.2, rim.z);
            this.vy = -20;
            // (the rim takes his weight and springs back; the net is pulled harder than a shot pulls it)
            this.rimKick = 1;
            this.rimHit = 1.7;
            if (b.fx === 'make') {
              this.netKick = 1;
              this.netHit = 1.5;
              roar(sc.off === 0, true);
              // (the building's flashes go off on a slam: the picture takes a breath of light)
              if (!calm) this.lens.bump(DUNK_BUMP);
            }
          }
        } else if (this.slammed) free = true;
        else if (b.swat !== undefined && figs[b.swat]) {
          // blocked: it gets as far as his hand, and comes back off it
          const blk = figs[b.swat];
          hands.add(blk);
          const j = blk.pup.j;
          const hand = blk.pup.world(j[J.hr * 3], j[J.hr * 3 + 1] + 0.4, j[J.hr * 3 + 2], TMP);
          if (lu < 0.32) {
            const w = lu / 0.32;
            ball.set(this.from.x + (hand.x - this.from.x) * w, this.from.y + (hand.y - this.from.y) * w, this.from.z + (hand.z - this.from.z) * w);
            this.swatAt.copy(ball);
          } else {
            const w = (lu - 0.32) / 0.68;
            const dx = this.from.x - rim.x;
            const dz = this.from.z - rim.z;
            const d = Math.hypot(dx, dz) || 1;
            ball.set(this.swatAt.x + (dx / d) * 9 * w, Math.max(BALL_R, this.swatAt.y * (1 - w * w)), this.swatAt.z + (dz / d) * 9 * w);
          }
          this.give(null, null, ease, false);
        } else {
          // a shot: up from his hand, over the top and down at the rim (through it, or off the iron)
          const peak = (b.ballZ ?? 6) * 0.62;
          const made = b.fx === 'make';
          // (a miss is one of a few, the shot's own: off the front of the rim, off the back, off the side, or in and round and out)
          const how = made ? 'in' : MISSES[Math.floor(hash(this.scriptN, bi) * MISSES.length)];
          const T = made ? 0.86 : how === 'round' ? ROUND_AT : 1;
          const w = Math.min(1, lu / T);
          const dx = this.from.x - rim.x;
          const dz = this.from.z - rim.z;
          const d = Math.hypot(dx, dz) || 1;
          // (toward the shooter from the rim, and square to that)
          const ux = dx / d;
          const uz = dz / d;
          const turn = hash(this.scriptN, bi + 50) < 0.5 ? 1 : -1;
          const hit = how === 'back' ? -0.7 : how === 'side' ? 0 : how === 'in' ? 0 : RING;
          let ex = rim.x + ux * hit + (how === 'side' ? uz * RING * turn : 0);
          let ez = rim.z + uz * hit - (how === 'side' ? ux * RING * turn : 0);
          const top = RIM_H + 0.3;
          // (once it has landed it is its own: it drops out of the net to the floor, or comes off the iron)
          if (this.landed) free = true;
          else {
            ball.set(this.from.x + (ex - this.from.x) * w, this.from.y + (top - this.from.y) * w + 4 * peak * w * (1 - w), this.from.z + (ez - this.from.z) * w);
            // (what a body had moved it in his hands is let go of on the way up)
            this.give(null, null, ease, false);
            backspin = true;
            if (made && lu > T) {
              ball.y = top - ((lu - T) / (1 - T)) * 2.7;
              if (!this.netKick && !calm) {
                this.netKick = 1;
                this.netHit = 1;
                // (one in four rattles in: the rim takes a little of it on the way through)
                if (hash(this.scriptN, bi + 7) < 0.25 && !this.rimKick) {
                  this.rimKick = 0.5;
                  this.rimHit = 0.6;
                }
                roar(sc.off === 0, b.flash?.text === '+3' || !!sc.moment);
                if (sc.moment && !calm) this.lens.bump(BUZZER_BUMP);
              }
            }
            if (how === 'round' && lu > T) {
              // (in and out: round the inside of the ring from its front, and off it)
              const a = ((lu - T) / (1 - T)) * ROUND_TURN * turn;
              const c = Math.cos(a);
              const sn = Math.sin(a);
              ex = rim.x + (ux * c - uz * sn) * RING;
              ez = rim.z + (uz * c + ux * sn) * RING;
              ball.set(ex, top - 0.15 * Math.sin((Math.PI * (lu - T)) / (1 - T)), ez);
              if (!this.rimKick && !calm) {
                this.rimKick = 0.6;
                this.rimHit = 0.6;
              }
            }
            if (lu >= 1) {
              this.landed = true;
              if (!made && !this.rimKick && !calm) {
                this.rimKick = 1;
                this.rimHit = how === 'back' ? 1.3 : 1;
              }
              // (it leaves the net as fast as it went through it, in the bodies' time, and rolls out from under the basket;
              // off the iron it pops up and away: short off the front, long off the back, wide off the side, out of the ring the way it was going round)
              const pace = own > 0 && dt > 0 ? dt / own : 1;
              this.vy = made ? -clamp((2.7 / Math.max(0.03, ((1 - T) * play.dur) / 1000)) * pace, 8, 30) : how === 'back' ? 12 : how === 'round' ? 5 : 8;
              const out = made ? 2 : how === 'back' ? 6 : 5;
              const [ox, oz] = made ? [-Math.sign(rim.x), 0] : how === 'back' ? [-ux, -uz] : how === 'front' ? [ux, uz] : [ex - rim.x, ez - rim.z];
              const ol = Math.hypot(ox, oz) || 1;
              this.drift.x = (ox / ol) * out;
              this.drift.z = (oz / ol) * out;
            }
          }
        }
      } else {
        // a pass (to where his hands will be), or the ball loose on the floor
        const end = toWorld(b.ball, sc.dir);
        const to = next ? next.pup.carry(TMP) : { x: sx(end), y: BALL_R, z: sz(end) };
        // (it leaves the passer's hands, wherever his dribble had it when he picked it up)
        if (was && was !== next) set(this.from, was.pup.carry(TMP2));
        const far = Math.hypot(to.x - this.from.x, to.z - this.from.z);
        if (!this.path) {
          // a man in its lane, where he will be when it gets to him: it goes over a defender, and round anyone it can't go over
          const mine = (was ?? next)?.side;
          const ends = [...b.o, ...b.d].map((pt) => toWorld(pt, sc.dir));
          const go = (f: Fig, k: number) => ({ gx: sx(ends[k]) - f.pup.x, gz: sz(ends[k]) - f.pup.z });
          const catcher = next ? go(next, figs.indexOf(next)) : { gx: 0, gz: 0 };
          this.path = passPath(
            this.from,
            to,
            catcher.gx * (1 - lu),
            catcher.gz * (1 - lu),
            figs.flatMap((f, k) => (f === was || f === next ? [] : [{ x: f.pup.x, z: f.pup.z, ...go(f, k), s: f.pup.body.s, mate: f.side === mine }])),
          );
        }
        // (a rebound comes up off the rim and down into his hands)
        const off = !!next && b.act[figs.indexOf(next)] === 'rebound' && this.from.y > RIM_H - 1;
        const arc = Math.max(this.path.lob, Math.min(1.8, far * 0.05) + (next ? 0 : Math.min(1.5, far * 0.1)), off ? REBOUND_ARC + far * 0.05 : 0);
        const side = swerve(this.path, lu, SIDE);
        ball.set(
          this.from.x + (to.x - this.from.x) * lu + side.x,
          this.path.bounce ? bounced(this.from.y, to.y, BALL_R, this.path.bounce, lu) : this.from.y + (to.y - this.from.y) * lu + 4 * arc * lu * (1 - lu),
          this.from.z + (to.z - this.from.z) * lu + side.z,
        );
        // (kept out of the bodies it goes by, eased: the two men's hands go with it)
        this.give(was, next, ease);
        if (lu >= 1) {
          if (next) holder = next;
          else free = true;
        }
      }
      this.heldBy = holder ? (sc.oPids.concat(sc.dPids)[figs.indexOf(holder)] ?? null) : null;
      this.react(sc, play, figs, holder, line, lu, own);

      // what the page writes over the picture: the handler's name, the play's label
      const hold = play.u >= 0.5 ? b.hold : a.hold;
      if (p.names && hold !== undefined && hold >= 0 && figs[hold]) {
        const f = figs[hold];
        const pid = hold < nO ? sc.oPids[hold] : sc.dPids[hold - nO];
        tagAt = { x: f.pup.x, z: f.pup.z, text: p.names(pid), num: p.jersey(pid), color: p.kits[f.side].color };
      }
      const fl = (play.u > 0.35 ? b.flash : undefined) ?? (play.u <= 0.35 ? a.flash : undefined);
      if (fl) {
        const at = toWorld({ x: fl.x, y: fl.y }, sc.dir);
        flashAt = { x: sx(at), z: sz(at), fl, alpha: calm ? 1 : fl === b.flash ? Math.min(1, (play.u - 0.35) / 0.25) : 1 - play.u / 0.35 };
      }
      // (the camera pushes in as the ball gets to the basket)
      near = clamp(1 - (Math.hypot(ball.x - rim.x, ball.z - rim.z) - 6) / 16, 0, 1);
      if (line) this.ftEnd = rimEnd ? 1 : -1;
    } else {
      // between possessions: everyone where the last play left him (or lined up for the tip)
      this.moveKey = '';
      // (still kept apart: a man who had stepped round another doesn't snap back the frame the play ends)
      const n = stage.standers.length;
      const at = this.spotsFor(n);
      // (put somewhere else while the play is stopped, the tip, a skip: they are there, not on their way)
      let cut = false;
      stage.standers.forEach((st, j) => {
        at[j * 2] = sx(st.at);
        at[j * 2 + 1] = sz(st.at);
        const was = this.planAt.get(st.pid);
        if (was && Math.hypot(at[j * 2] - was[0], at[j * 2 + 1] - was[1]) > FRESH) cut = true;
        this.planAt.set(st.pid, [at[j * 2], at[j * 2 + 1]]);
      });
      this.spacing.place(
        at,
        this.going.fill(0),
        stage.standers.map((st) => st.pid),
        own,
        aside,
        cut,
      );
      const had = stage.standers.find((st) => st.pid === this.heldBy);
      for (let j = 0; j < n; j++) {
        const st = stage.standers[j];
        const f = this.fig(st.pid, st.side, p);
        const act = over(st.pid, st.side, st.pid === this.heldBy ? 'hold' : 'stand');
        const has = act === 'hold';
        const end = this.paired(st.pid, st.side, at[j * 2], at[j * 2 + 1], f.pup.placed ? f.pup.yaw : Math.atan2(-at[j * 2], -at[j * 2 + 1]), p);
        // (they watch the ball, and the ball is dead: they stand at rest)
        const look = has || p.final !== undefined ? undefined : { x: ball.x, y: ball.y, z: ball.z };
        f.pup.update(
          { x: end.x, z: end.z, yaw: end.yaw, act, ms: 0, dur: 0, ball: has, cut, look, rest: true, over: p.final !== undefined, bump: end.bump, who: st.pid },
          dt,
          own,
          ease,
        );
        seen.add(st.pid);
        if (has) holder = f;
      }
      if (holder) {
        hands.add(holder);
        set(ball, holder.pup.carry(TMP));
        this.give(holder, null, ease);
      } else {
        if (had && had.side === p.final) this.toss();
        this.heldBy = null;
        if (stage.ball && Math.hypot(ball.x - sx(stage.ball), ball.z - sz(stage.ball)) > 14) ball.set(sx(stage.ball), BALL_R, sz(stage.ball));
        free = true;
      }
    }
    // loose, it falls and bounces, and rolls the way it was going
    // (it is where it is: nothing more is owed to a body it went by)
    if (free) this.bend.x = this.bend.z = 0;
    else this.drift.x = this.drift.z = 0;
    if (free && sec > 0) {
      this.vy -= G * sec;
      ball.y += this.vy * sec;
      ball.x += this.drift.x * sec;
      ball.z += this.drift.z * sec;
      // (off whoever it comes down on, once it is where it fell to)
      this.clear(null, null, BALL_PUSH * sec);
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        const hard = Math.abs(this.vy) > 5;
        this.vy = hard ? -this.vy * 0.5 : 0;
        if (hard) {
          this.drift.x *= ROLL_KEEP;
          this.drift.z *= ROLL_KEEP;
        }
      }
      // (on the floor it slows to a stop)
      if (ball.y <= BALL_R + 0.01 && this.vy === 0) {
        const k = Math.exp(-sec / ROLL_S);
        this.drift.x *= k;
        this.drift.z *= k;
      }
    }
    if (p.final === undefined) {
      this.tossed = false;
      this.pairs = null;
    }

    for (const [pid, f] of [...this.figs]) {
      if (!seen.has(pid)) {
        this.drop(pid, f);
        continue;
      }
      f.pup.arms(hands.has(f) ? ball : null);
      f.place();
      const hot = !!p.hot?.has(pid);
      f.ring.visible = hot || f === holder;
      if (f.ring.visible) (f.ring.material as MeshBasicMaterial).color.set(hot ? p.warn : '#ffffff');
    }

    // the ball rolls the way it goes (a shot spins back); its shadow stays on the floor, wider and fainter the higher it is
    const bm = this.ballMesh.position;
    const moved = bm.distanceTo(ball);
    const flat = Math.hypot(ball.x - bm.x, ball.z - bm.z);
    // (a dribble goes up and down: it keeps the spin it had)
    if (flat > 0.3 * moved && flat > 1e-3) this.spin.set((ball.z - bm.z) / flat, 0, -(ball.x - bm.x) / flat);
    if (!calm && moved < 20 && moved > 1e-4) this.ballMesh.rotateOnWorldAxis(this.spin, (backspin ? -1 : 1) * Math.min(0.8, moved * 1.1));
    bm.copy(ball);
    this.ballShadow.position.set(ball.x, 0.035, ball.z);
    this.ballShadow.scale.setScalar(1 + Math.min(1.2, ball.y * 0.06));
    (this.ballShadow.material as MeshBasicMaterial).opacity = 0.34 / (1 + ball.y * 0.3);
    // the net takes a made shot, the rim a miss or a dunk
    this.netKick = Math.max(0, this.netKick - own / NET_MS);
    this.rimKick = Math.max(0, this.rimKick - own / 380);
    // (the ball pulls the net down its length, it flicks back up past where it hangs, wider at the foot, and swings out; its
    // loops stay on the ring. The rim tips on its hinge at the board, the net hangs from it, and the whole unit rocks a little with it)
    const age = (1 - this.netKick) * NET_MS;
    const pull = this.netKick > 0 ? this.netHit * Math.exp(-age / 230) : 0;
    this.nets.forEach((n, i) => {
      const k = i === rimEnd ? pull : 0;
      const wave = Math.cos(age / 50);
      this.swish[i].set(k * wave, k * 0.2 * Math.max(0, -wave), k * 0.22 * Math.sin(age / 64));
      const tip = i === rimEnd ? Math.sin(this.rimKick * 18) * this.rimKick * 0.07 * this.rimHit : 0;
      this.units[i].rotation.z = tip * 0.1;
      for (const o of [n, this.rims[i]]) {
        o.rotation.z = tip;
        o.position.set(RIM_HINGE * (Math.cos(tip) - 1), RIM_H + RIM_HINGE * Math.sin(tip), 0);
      }
    });

    // where each body meets the floor: under each foot (less as it lifts), and wide under him
    let pools = 0;
    for (const f of this.figs.values()) {
      const j = f.pup.j;
      for (const k of FEET) {
        const at = f.pup.world(j[k * 3], j[k * 3 + 1], j[k * 3 + 2], TMP);
        const lift = Math.max(0, at.y - 0.4);
        this.arena.touch(pools++, at.x, at.z, 0.8 + lift * 0.6, 0.5 / (1 + lift * 3));
      }
      const hips = f.pup.world(j[J.hips * 3], 0, j[J.hips * 3 + 2], TMP);
      this.arena.touch(pools++, hips.x, hips.z, 2.7, 0.2);
    }
    this.arena.touched(pools);
    if (this.floorTex && this.floorTex !== this.bounced) this.warm((this.bounced = this.floorTex));

    // what the camera might cut in on: the scorer of a dunk, a three or a shot at the buzzer, the man a
    // whistle was for (a timeout has none: the benches are not built for a close look; the building gets a
    // shot of its own). And what is worth a replay at the next dead ball (director.ts): a dunk, a three, an
    // and-one, a block, a shot at the buzzer. `quiet`: nothing is being played that a cut-in would hide.
    // Nothing in a replay is news, nor is the end of the possession it replayed when the picture is back on it.
    const d = this.director;
    let quiet = true;
    if (this.slammed && !this.slamSeen && !calm) d.kick();
    this.slamSeen = this.slammed;
    if (sc && play && !d.onAir) {
      const pids = [...sc.oPids, ...sc.dPids];
      const stale = sc === d.replayed;
      const fl = play.b.flash ?? null;
      const news = fl !== this.flashed && !stale ? fl : null;
      const made = play.b.fx === 'make' && this.netKick > this.kicked && !stale;
      if (made) this.scorer = pids[play.a.hold ?? -1] ?? null;
      let cue: 'close' | 'house' | null = null;
      let on: number | null = null;
      let word = '';
      if (made && !line && (this.slammed || fl?.text === '+3' || sc.moment)) {
        cue = 'close';
        on = this.scorer;
        word = sc.moment ? BIG_WORD[sc.moment] : this.slammed ? BIG_WORD.dunk : BIG_WORD.three;
      } else if (news && (news.kind === 'foul' || news.text === 'And one!')) {
        cue = 'close';
        on = this.heldBy ?? (news.kind === 'make' ? this.scorer : null);
        word = news.kind === 'make' ? BIG_WORD.and1 : 'Fouled';
      } else if (news?.text.startsWith('Timeout')) cue = 'house';
      // (noted whatever the camera does now: it is shown when the ball is dead)
      const big: BigKind | null =
        made && !line ? (sc.moment ?? (this.slammed ? 'dunk' : fl?.text === '+3' ? 'three' : null)) : news?.text === 'And one!' ? 'and1' : news?.kind === 'block' ? 'block' : null;
      if (big) {
        // (the move with the moment in it: the shot's, the one an and-one's whistle came after, the one a block met)
        let k = Math.min(play.i, sc.frames.length - 1);
        while (k > 1 && !(big === 'block' ? sc.frames[k].swat !== undefined : sc.frames[k].fx === 'make')) k--;
        const who = big === 'block' ? pids[sc.frames[k].swat ?? -1] : this.scorer;
        const f = who === undefined || who === null ? undefined : this.figs.get(who);
        if (f) d.note(sc, k, big, who!, f.side);
      }
      const pace = real > 0 && dt <= real * CUT_PACE;
      const timely = pace && (this.cutGap > CUT_GAP || !!sc.moment);
      if (cue === 'house' ? pace : !!cue && timely && on !== null && this.figs.has(on)) {
        this.cue = cue;
        this.cueMs = 0;
        if (cue === 'close') {
          this.star = on;
          this.cueWord = word;
        }
        this.cutKey = this.moveKey;
        this.cutN = this.scriptN;
      }
      this.flashed = fl;
      // (the move it was asked in, a dead ball, and the ball being walked up to start the next possession)
      quiet = this.moveKey === this.cutKey || play.b.act.every((a) => a === 'stand' || a === 'hold') || (this.scriptN === this.cutN + 1 && play.i <= 1);
    }
    this.kicked = this.netKick;

    // (a cut, not into or out of a replay (the wipe has those) nor the opening's move: the last camera's picture of
    // this moment goes up first, for the page to dissolve from: see cutHook)
    const cam = this.camera;
    const shotWas = this.shot;
    this.was.pos.copy(cam.position);
    this.was.dir.copy(cam.quaternion);
    this.was.fov = cam.fov;
    this.aim(stage, real, calm, line, near, quiet, !!p.clutch, p.final);
    if (this.cutHook && !calm && !reel && !d.onAir && this.shot !== shotWas && this.shot !== 'open' && real > 0) {
      const now = { pos: cam.position.clone(), dir: cam.quaternion.clone(), fov: cam.fov };
      cam.position.copy(this.was.pos);
      cam.quaternion.copy(this.was.dir);
      cam.fov = this.was.fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.lens.render(this.scene, cam, 0);
      this.cutHook();
      cam.position.copy(now.pos);
      cam.quaternion.copy(now.dir);
      cam.fov = now.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    // the words over the picture: the handler's tag and the play's word, none over a replay (its bug and
    // its lower third say what it is); the lower third on the man a cut-in or a replay is on; the wipe
    if (tagAt && !d.onAir) {
      const t: { x: number; z: number; text: string; num: string; color: string } = tagAt;
      const at = this.screen(A.set(t.x, 0, t.z));
      labels.tag = { x: at.x, y: at.y, text: t.text, num: t.num, color: t.color };
    }
    if (flashAt && !d.onAir) {
      const f: { x: number; z: number; fl: Flash; alpha: number } = flashAt;
      const at = this.screen(A.set(f.x, 7.5, f.z));
      labels.flash = { x: at.x, y: at.y, text: f.fl.text, kind: f.fl.kind, alpha: f.alpha };
    }
    const r = d.reel;
    labels.replay = d.onAir;
    if (r && d.wipe !== null) labels.wipe = { at: d.wipe, color: p.kits[r.side].color, trim: p.kits[r.side].trim };
    const close = this.shot === 'close' && this.star !== null ? this.figs.get(this.star) : undefined;
    const third =
      d.onAir && r ? { pid: r.star, side: r.side, word: BIG_WORD[r.kind] } : close && this.star !== null ? { pid: this.star, side: close.side, word: this.cueWord } : null;
    if (third && p.names) {
      labels.third = {
        key: `${third.pid}/${third.word}`,
        name: p.names(third.pid),
        num: p.jersey(third.pid),
        color: p.kits[third.side].color,
        team: p.game?.abbrevs[third.side] ?? '',
        word: third.word,
      };
    }
    // (a close-up and a replay are on one man: what is nearer and farther than him goes soft, as a long lens has it)
    const sharp = d.onAir && r ? this.figs.get(r.star) : close;
    if (sharp && !calm) {
      const j = sharp.pup.j;
      const c = sharp.pup.world(j[J.chest * 3], j[J.chest * 3 + 1], j[J.chest * 3 + 2], TMP);
      this.lens.focus(this.camera.position.distanceTo(A.set(c.x, c.y, c.z)), d.onAir ? REPLAY_SOFT : CLOSE_SOFT);
    } else this.lens.focus(0, 0);
    this.lens.render(this.scene, this.camera, real);
    return labels;
  }

  /**
   * Where the ten are drawn this frame (x, z each): where the plan has them, but no two on top of each
   * other. The plan keeps them apart at its keyframes, not on the way between: two whose paths cross
   * step round each other (see spacing.ts).
   */
  private apart(sc: NonNullable<Stage['script']>, play: NonNullable<Stage['play']>, own: number, aside: number, cut: boolean): Float32Array {
    const nO = sc.oPids.length;
    const n = nO + sc.dPids.length;
    const at = this.spotsFor(n);
    const go = this.going;
    for (let j = 0; j < n; j++) {
      const w = toWorld(j < nO ? play.o[j] : play.d[j - nO], sc.dir);
      at[j * 2] = sx(w);
      at[j * 2 + 1] = sz(w);
      // (how far the move takes him, for which side he passes on)
      const a = toWorld(j < nO ? play.a.o[j] : play.a.d[j - nO], sc.dir);
      const b = toWorld(j < nO ? play.b.o[j] : play.b.d[j - nO], sc.dir);
      go[j * 2] = sx(b) - sx(a);
      go[j * 2 + 1] = sz(b) - sz(a);
    }
    const pids = [...sc.oPids, ...sc.dPids];
    pids.forEach((pid, j) => this.planAt.set(pid, [at[j * 2], at[j * 2 + 1]]));
    return this.spacing.place(at, go, pids, own, aside, cut);
  }

  /**
   * What each of the ten looks at this move: a shooter the rim (from the move before he goes up); a passer the man
   * he's throwing to (from the move before it leaves); the man with the ball up the floor and round his teammates;
   * a defender off the ball his own man every so often; everyone else the ball. Nobody at the buzzer.
   */
  private looks(sc: NonNullable<Stage['script']>, play: NonNullable<Stage['play']>, bi: number, dead: boolean): (V3 | undefined)[] {
    const nO = sc.oPids.length;
    const pids = [...sc.oPids, ...sc.dPids];
    const { a, b } = play;
    const nb = sc.frames[bi + 1];
    const rimPt = toWorld(BASKET, sc.dir);
    const rim: V3 = { x: sx(rimPt), y: RIM_H, z: sz(rimPt) };
    const ball: V3 = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
    const spot = (k: number): V3 => {
      const w = toWorld(k < nO ? play.o[k] : play.d[k - nO], sc.dir);
      return { x: sx(w), y: 5.6, z: sz(w) };
    };
    const has = b.hold !== undefined && b.hold >= 0 ? b.hold : -1;
    const out: (V3 | undefined)[] = pids.map(() => undefined);
    pids.forEach((pid, j) => {
      const act = b.act[j];
      if (act === 'celebrate' || act === 'rue') return;
      const next = nb?.act[j];
      if (AIMED.has(act) || act === 'ft' || (j === has && next !== undefined && (AIMED.has(next) || next === 'ft'))) out[j] = rim;
      else if (act === 'pass' && has >= 0 && has !== j) out[j] = spot(has);
      else if (j === has && next === 'pass' && nb!.hold !== undefined && nb!.hold >= 0 && nb!.hold !== j) out[j] = spot(nb!.hold);
      else if (j === has && j === a.hold && (act === 'dribble' || act === 'hold')) {
        // (up the floor, or at one of his teammates, a new look every so often)
        const r = hash(pid, Math.floor((this.lookMs + pid * 389) / SCAN_MS));
        const mates = pids.map((_, k) => k).filter((k) => k !== j && k < nO === j < nO);
        out[j] = r < 0.45 || !mates.length ? rim : spot(mates[Math.floor(((r - 0.45) / 0.55) * mates.length)]);
      } else if (j >= nO && act === 'defend' && !dead && hash(pid, Math.floor((this.lookMs + pid * 613) / SPLIT_MS)) < 0.4) {
        // (his own man: the nearest of theirs without the ball)
        let man = -1;
        let near = Infinity;
        const me = spot(j);
        for (let k = 0; k < nO; k++) {
          if (k === has) continue;
          const o = spot(k);
          const d = Math.hypot(o.x - me.x, o.z - me.z);
          if (d < near) [near, man] = [d, k];
        }
        out[j] = man >= 0 ? spot(man) : ball;
      } else out[j] = ball;
    });
    return out;
  }

  /**
   * The players' reactions, all of them the plan's own moments: the scorer of a dunk or a three flexes, points
   * or pumps a fist once he's down, and his teammates slap his hand as they pass him on the way back; the man
   * a whistle was on raises his hand or asks what for, an and-one's scorer roars, a blocker wags a finger, a
   * man stripped of it asks for the foul.
   */
  private react(sc: NonNullable<Stage['script']>, play: NonNullable<Stage['play']>, figs: Fig[], holder: Fig | null, line: boolean, lu: number, own: number) {
    const { a, b } = play;
    const key = this.moveKey;
    const first = key !== this.reactKey;
    this.reactKey = key;
    const r = (n: number) => hash(this.scriptN, n);
    // a basket, once, when it's down (the slam, or the ball through the net)
    if (b.fx === 'make' && !line && this.madeKey !== key && (this.slammed || lu >= 0.86)) {
      this.madeKey = key;
      const by = a.hold !== undefined && a.hold >= 0 ? (figs[a.hold] ?? null) : null;
      this.shooter = by;
      if (by) {
        const big = this.slammed || b.flash?.text === '+3' || !!sc.moment;
        const k = Math.floor(r(1) * 3);
        if (big && !sc.moment) by.pup.cue(this.slammed ? (['flex', 'roar', 'fist'] as const)[k] : (['point', 'fist', 'flex'] as const)[k], null, 2600);
        if (big || r(2) < 0.3) this.fives = { by, ms: 0, n: 0, done: new Set() };
      }
    }
    if (first) {
      const fl = b.flash;
      if (fl?.text === 'And one!' && this.shooter) this.shooter.pup.cue(r(3) < 0.5 ? 'roar' : 'flex');
      if ((fl?.kind === 'foul' || fl?.text === 'And one!') && b.foul !== undefined && figs[b.foul]) figs[b.foul].pup.cue(r(4) < 0.55 ? 'handUp' : 'protest', null, 1500);
      if (a.swat !== undefined && figs[a.swat] && r(5) < 0.6) figs[a.swat].pup.cue('wag');
      if (fl?.text === 'Steal' && a.hold !== undefined && a.hold >= 0 && figs[a.hold] && r(6) < 0.5) figs[a.hold].pup.cue('protest', null, 1200);
    }
    const fv = this.fives;
    if (!fv) return;
    fv.ms += own;
    if (fv.ms > FIVE_MS || fv.n >= 2) {
      this.fives = null;
      return;
    }
    if (fv.by.pup.gesturing || fv.by === holder) return;
    for (const f of this.figs.values()) {
      if (f === fv.by || f.side !== fv.by.side || f === holder || fv.done.has(f) || f.pup.gesturing) continue;
      if (Math.hypot(f.pup.x - fv.by.pup.x, f.pup.z - fv.by.pup.z) > FIVE_NEAR) continue;
      fv.by.pup.cue('five', f.pup, 500);
      f.pup.cue('five', fv.by.pup, 500);
      fv.done.add(f);
      fv.n++;
      break;
    }
  }

  /**
   * At the buzzer: winners near each other pair off (the two nearest, then the next two), walk to meet and
   * chest-bump. Where he goes, the way he faces, and whether he's going up. Anyone else: as he was.
   */
  private paired(pid: number, side: 0 | 1, x: number, z: number, yaw: number, p: SceneProps): { x: number; z: number; yaw: number; bump: boolean } {
    if (p.final === undefined || side !== p.final) return { x, z, yaw, bump: false };
    if (!this.pairs) {
      this.pairs = new Map();
      const men = [...this.figs.entries()].filter(([, f]) => f.side === p.final);
      const all: [number, number, number][] = [];
      for (let i = 0; i < men.length; i++)
        for (let k = i + 1; k < men.length; k++) {
          const d = Math.hypot(men[i][1].pup.x - men[k][1].pup.x, men[i][1].pup.z - men[k][1].pup.z);
          if (d < PAIR_NEAR) all.push([d, i, k]);
        }
      all.sort((u, v) => u[0] - v[0]);
      const taken = new Set<number>();
      for (const [, i, k] of all) {
        if (taken.has(i) || taken.has(k) || taken.size >= 4) continue;
        taken.add(i).add(k);
        const [ia, fa] = men[i];
        const [ib, fb] = men[k];
        const mx = (fa.pup.x + fb.pup.x) / 2;
        const mz = (fa.pup.z + fb.pup.z) / 2;
        const d = Math.hypot(fb.pup.x - fa.pup.x, fb.pup.z - fa.pup.z) || 1;
        const ux = (fb.pup.x - fa.pup.x) / d;
        const uz = (fb.pup.z - fa.pup.z) / d;
        // (after both have taken the buzzer in: see `over`)
        const at = Math.max(((ia * 131 + 17) % 10) / 9, ((ib * 131 + 17) % 10) / 9) * BUZZER_MS + 150;
        this.pairs.set(ia, { mate: ib, x: mx - ux * PAIR_GAP, z: mz - uz * PAIR_GAP, at });
        this.pairs.set(ib, { mate: ia, x: mx + ux * PAIR_GAP, z: mz + uz * PAIR_GAP, at });
      }
    }
    const pr = this.pairs.get(pid);
    const mate = pr && this.figs.get(pr.mate);
    if (!pr || !mate || this.finalMs < pr.at) return { x, z, yaw, bump: false };
    const w = Math.min(1, (this.finalMs - pr.at) / PAIR_MS);
    const e = w * w * (3 - 2 * w);
    return { x: x + (pr.x - x) * e, z: z + (pr.z - z) * e, yaw: Math.atan2(mate.pup.x - x, mate.pup.z - z), bump: w >= 1 };
  }

  /** The ball thrown up at the buzzer (once): high, and a little off to one side. */
  private toss() {
    if (this.tossed) return;
    this.tossed = true;
    this.vy = TOSS;
    const a = hash(this.scriptN, 9) * Math.PI * 2;
    this.drift.x = Math.cos(a) * 2;
    this.drift.z = Math.sin(a) * 2;
  }
  /**
   * The ball in the air (a pass, a loose ball) is kept out of the bodies it goes by, trunk and head: all but
   * the two whose hands it is between. It gives way a little before it gets to one, so it bends round him.
   * `most`: the farthest it is moved, ft.
   */
  private clear(a: Fig | null, b: Fig | null, most = Infinity) {
    const ball = this.ball;
    const x = ball.x;
    const z = ball.z;
    for (const f of this.figs.values()) {
      if (f === a || f === b || !f.pup.placed) continue;
      const j = f.pup.j;
      const s = f.pup.body.s;
      const hips = f.pup.world(j[J.hips * 3], j[J.hips * 3 + 1], j[J.hips * 3 + 2], TMP);
      const chest = f.pup.world(j[J.chest * 3], j[J.chest * 3 + 1], j[J.chest * 3 + 2], TMP2);
      clearOf(ball, hips, chest, TRUNK * s * Math.sqrt(f.pup.body.bulk) + BALL_R - 0.1, GIVE);
      const head = f.pup.world(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2], TMP);
      clearOf(ball, chest, head, SKULL * s + BALL_R - 0.1, GIVE);
    }
    const dx = ball.x - x;
    const dz = ball.z - z;
    const k = Math.min(1, most / (Math.hypot(dx, dz) || 1));
    ball.x = x + dx * k;
    ball.z = z + dz * k;
  }
  /**
   * The ball, in a man's hands or on its way between two, gives way to the bodies by it (all but `a` and
   * `b`, whose hands it is in): eased, so it is carried and passed round a man, never hopped off him, and
   * what it has given way is kept from one move to the next. `on` false: nothing to give way to, and what
   * it had is eased out.
   */
  private give(a: Fig | null, b: Fig | null, ease: number, on = true) {
    const ball = this.ball;
    const px = ball.x;
    const pz = ball.z;
    if (on) this.clear(a, b);
    const k = 1 - Math.exp(-ease / BEND_MS);
    this.bend.x += (ball.x - px - this.bend.x) * k;
    this.bend.z += (ball.z - pz - this.bend.z) * k;
    ball.x = px + this.bend.x;
    ball.z = pz + this.bend.z;
  }
  /** How far the ball is off where its move has it, for the bodies by it (x, z). */
  private readonly bend = { x: 0, z: 0 };
  /** Where the plan had each man last frame (x, z), before anyone stepped aside. */
  private readonly planAt = new Map<number, [number, number]>();
  private spotsFor(n: number): Float32Array {
    if (this.spots.length !== n * 2) {
      this.spots = new Float32Array(n * 2);
      this.going = new Float32Array(n * 2);
    }
    return this.spots;
  }
  private spots = new Float32Array(20);
  private going = new Float32Array(20);

  /** The benches' light now: eased down while a play is on, back up when the ball is dead. */
  private bench(to: number, real: number) {
    this.benchLit += (to - this.benchLit) * (1 - Math.exp(-real / 300));
    return this.benchLit;
  }
  private benchLit = 1;

  /**
   * The broadcast: the main camera high on the near sideline, turning with the ball and pushing in as it
   * gets to the basket, an operator's hand on it; a low camera past the baseline for free throws; the
   * whole building from a corner when there is nothing to follow, and from across it at a timeout;
   * cut-ins while nothing is being played: low and tight on the scorer of a big basket or the man a
   * whistle was for, held on the shoulder, the stands dimmed behind him; the tip's line-up from low,
   * going round the centre circle, and the first possession coming up from there into the main camera;
   * the winners at the final buzzer; the instant replays (director.ts). It cuts between them, never more
   * often than HOLD_MS. Reduced motion: one camera, the whole floor, held still.
   */
  private aim(stage: Stage, real: number, calm: boolean, line: boolean, near: number, quiet: boolean, clutch: boolean, final?: 0 | 1) {
    const cam = this.camera;
    const aspect = this.w / this.h;
    const fov = (across: number) => (2 * Math.atan(Math.tan((across * Math.PI) / 360) / aspect) * 180) / Math.PI;
    const live = !!(stage.script && stage.play);
    if (calm) {
      cam.fov = fov(aspect < 1.6 ? 62 : 58);
      cam.position.set(0, 46, 96);
      cam.lookAt(0, 0, 4);
      cam.updateProjectionMatrix();
      this.focus = null;
      this.shot = 'main';
      this.cue = null;
      this.arena.dim(1, this.bench(live ? BENCH_DIM : 1, real));
      return;
    }
    const d = this.director;
    if (d.onAir) {
      // the replay's camera (the stands dimmed behind the tight one, as behind a cut-in)
      const r = d.reel!;
      const f = this.figs.get(r.star);
      const j = f?.pup.j;
      const chest = f && j ? f.pup.world(j[J.chest * 3], j[J.chest * 3 + 1], j[J.chest * 3 + 2], TMP) : null;
      d.aimReel(cam, chest, this.ball, aspect, real);
      const dim = r.cam === 'tight' ? CUT_DIM : 1;
      this.arena.dim(dim, this.bench(dim, real));
      return;
    }
    this.idleMs = live ? 0 : this.idleMs + real;
    this.shotMs += real;
    this.cutGap += real;
    this.cueMs += real;
    // (a cut-in that couldn't be taken when it was asked for is not taken late)
    if (this.cue && this.cueMs > 250) this.cue = null;
    const who = this.star === null ? undefined : this.figs.get(this.star);
    // the tip's line-up: no play yet, the ten round the centre circle and the ball in it
    const tip = !live && stage.standers.length === 10 && !!stage.ball && Math.abs(stage.ball.y - MID) < 0.01 && Math.abs(stage.ball.x) < 0.01;
    // a cut-in, or the building at a timeout, is over when it has had its time, when the play goes on, or when
    // he has left the floor (but a cut-in a replay comes after has the picture until the wipe has covered it)
    const held = this.shot === 'close' || this.shot === 'house';
    const next = this.shot === 'close' && (d.phase === 'wait' || d.phase === 'in');
    const over = held && ((this.shot === 'close' && !who) || (!next && (this.shotMs > (this.shot === 'close' ? CUT_MS : HOUSE_MS) || !quiet)));
    const want: typeof this.shot =
      final !== undefined
        ? 'final'
        : held && !over
          ? this.shot
          : line
            ? 'ft'
            : (this.cue ??
              // (the line-up stays on the picture until the first possession is on the floor: nothing in between)
              (tip || (this.shot === 'tip' && !live)
                ? 'tip'
                : live && (this.shot === 'tip' || (this.shot === 'open' && this.shotMs < OPEN_MS))
                  ? 'open'
                  : this.idleMs > WIDE_AFTER
                    ? 'wide'
                    : live || this.shot !== 'wide'
                      ? 'main'
                      : 'wide'));
    // (the play starting again takes the picture back from the building at once, the buzzer and a timeout take it
    // from anything, and the tip's line-up goes straight into the first possession; every other camera has its HOLD_MS)
    const now = want === 'final' || want === 'house' || want === 'open' || (want === 'main' && this.shot === 'wide');
    if (want !== this.shot && (this.shotMs > HOLD_MS || now)) {
      this.shot = want;
      this.shotMs = 0;
      this.focus = null;
      if (want === 'close' || want === 'house') {
        this.cue = null;
        if (want === 'close') this.cutGap = 0;
      }
      if (want === 'close' && who) {
        // low, from where nobody stands between: past the baseline for a man at the basket, else round the near side of him
        const x = who.pup.x;
        const z = who.pup.z;
        const e = x < 0 ? -1 : 1;
        let best = Infinity;
        for (const turn of Math.abs(x) > MID - 13 ? [e * 1.25, e * 0.6, 0, -e * 0.6, e * 0.95, e * 0.3, -e * 0.3] : [-e * 0.3, e * 0.3, -e * 0.9, e * 0.9, 0, -e * 0.6, e * 0.6]) {
          const cx = clamp(x + Math.sin(turn) * 24, -(MID + 8.5), MID + 8.5);
          const cz = clamp(z + Math.cos(turn) * 24, -8, 32);
          const far = Math.hypot(cx - x, cz - z);
          let cost = far < 11 ? 5 : 0;
          for (const f of this.figs.values()) {
            const t = ((f.pup.x - x) * (cx - x) + (f.pup.z - z) * (cz - z)) / (far * far);
            // (a body takes more of the picture the nearer the lens it stands: a wider berth there, and it counts for more)
            if (f !== who && t > 0.04 && t < 1 && Math.hypot(f.pup.x - x - (cx - x) * t, f.pup.z - z - (cz - z) * t) < 2.4 + 4 * t) cost += 1 + 2 * t;
          }
          if (cost < best) {
            best = cost;
            this.seat.set(cx, 5.2, cz);
          }
        }
        this.look.set(x, 4.6, z);
      }
    }
    const closeUp = this.shot === 'close' && !!who;
    this.arena.dim(closeUp ? CUT_DIM : 1, closeUp ? CUT_DIM : this.bench(this.shot === 'ft' ? FT_BENCH : live ? BENCH_DIM : 1, real));
    if (this.shot === 'close' && who) {
      // low and tight on him, following his chest as he goes; the frame is his height and a half, whatever its shape
      const j = who.pup.j;
      const c = who.pup.world(j[J.chest * 3], j[J.chest * 3 + 1], j[J.chest * 3 + 2], TMP);
      this.look.lerp(A.set(c.x, Math.max(3.6, c.y), c.z), 1 - Math.exp(-real / 200));
      const half = (5.9 - 0.9 * Math.min(1, this.shotMs / CUT_MS)) / Math.min(1, aspect);
      cam.fov = clamp((2 * Math.atan(half / this.seat.distanceTo(this.look)) * 180) / Math.PI, 10, 58);
      // (it drifts round him a little as it holds, on the operator's shoulder: a camera on a man, not one on a post)
      const turn = CUT_ARC * Math.min(1, this.shotMs / CUT_MS) * (this.seat.x < this.look.x ? 1 : -1);
      const ox = this.seat.x - this.look.x;
      const oz = this.seat.z - this.look.z;
      cam.position.set(
        this.look.x + ox * Math.cos(turn) - oz * Math.sin(turn) + d.hand(0, HAND),
        this.seat.y + d.hand(1, HAND * 0.7) - d.bump(0.25),
        this.look.z + ox * Math.sin(turn) + oz * Math.cos(turn) + d.hand(2, HAND),
      );
      cam.lookAt(A.set(this.look.x + d.hand(3, HAND * 0.4), this.look.y + d.hand(4, HAND * 0.3), this.look.z));
      cam.updateProjectionMatrix();
      return;
    }
    const tall = aspect < 1.6;
    if (this.shot === 'final') {
      // the buzzer: low on the winners as they take it in, going round them a little and coming in
      let cx = 0;
      let cz = 0;
      let n = 0;
      let spread = 4;
      for (const f of this.figs.values()) {
        if (f.side !== final) continue;
        cx += f.pup.x;
        cz += f.pup.z;
        n++;
      }
      if (n) {
        cx /= n;
        cz /= n;
        for (const f of this.figs.values()) if (f.side === final) spread = Math.max(spread, Math.hypot(f.pup.x - cx, f.pup.z - cz));
      }
      if (this.shotMs === 0) {
        // (from the near side, round to where none of the others stands between)
        let best = Infinity;
        for (const a of [0, 0.35, -0.35, 0.7, -0.7, 1, -1]) {
          const ex = Math.sin(a) * FINAL_OFF;
          const ez = Math.cos(a) * FINAL_OFF;
          let cost = Math.abs(a) * 0.6;
          for (const f of this.figs.values()) {
            if (f.side === final) continue;
            const t = ((f.pup.x - cx) * ex + (f.pup.z - cz) * ez) / (FINAL_OFF * FINAL_OFF);
            if (t > 0.02 && t < 1 && Math.hypot(f.pup.x - cx - ex * t, f.pup.z - cz - ez * t) < 3 + 3 * t) cost += 1 + t;
          }
          if (cost < best) {
            best = cost;
            this.finalA = a;
          }
        }
      }
      this.look.lerp(A.set(cx, 4.4, cz), this.shotMs === 0 ? 1 : 1 - Math.exp(-real / 600));
      const u = Math.min(1, this.shotMs / FINAL_MS);
      const a = this.finalA + 0.22 * u * (this.finalA > 0 || (this.finalA === 0 && this.look.x < 0) ? 1 : -1);
      const far = FINAL_OFF - 7 * u;
      cam.fov = fov(clamp((2 * Math.atan((spread + 6) / far) * 180) / Math.PI, 22, 64));
      cam.position.set(
        clamp(this.look.x + Math.sin(a) * far, -(MID + 8), MID + 8) + d.hand(0, HAND * 1.5),
        5.8 + d.hand(1, HAND),
        Math.min(33, this.look.z + Math.cos(a) * far) + d.hand(2, HAND * 1.5),
      );
      cam.lookAt(this.look);
      cam.updateProjectionMatrix();
      return;
    }
    if (this.shot === 'tip') {
      // the tip's line-up, low, going slowly round the centre circle
      const a = TIP_FROM + (this.shotMs / 1000) * TIP_TURN;
      cam.fov = fov(tall ? 46 : 52);
      cam.position.set(Math.sin(a) * TIP_OFF + d.hand(0, HAND), 5.6 + d.hand(1, HAND), Math.cos(a) * TIP_OFF);
      cam.lookAt(0, 4.4, 0);
      cam.updateProjectionMatrix();
      return;
    }
    if (this.shot === 'ft') {
      // low, past the baseline and off to the near side: the shooter at his line from the front, the lane
      // either side of him, the building behind; it comes in a little on him through his routine, on a shoulder
      const e = this.ftEnd;
      const u = smooth(Math.min(1, this.shotMs / FT_PUSH));
      cam.fov = Math.max(20, fov(tall ? 29 : 35)) * (1 - 0.08 * u);
      cam.position.set(e * (MID + 10) + d.hand(0, HAND * 0.6), 8.5 + d.hand(1, HAND * 0.5), 22);
      cam.lookAt(e * (MID - 15.5), 6.3, -1.5);
      cam.updateProjectionMatrix();
      return;
    }
    if (this.shot === 'wide') {
      // the building, from high in a corner, drifting in
      const drift = Math.min(1, this.shotMs / 14000);
      cam.fov = fov(tall ? 46 : 54);
      cam.position.set(-74 + drift * 10, 46 - drift * 4, 92 - drift * 8);
      cam.lookAt(-4, 2, -6);
      cam.updateProjectionMatrix();
      return;
    }
    if (this.shot === 'house') {
      // a timeout: the building, from low by the near sideline, moving along and tilting up from the floor over the stands
      const u = smooth(Math.min(1, this.shotMs / HOUSE_MS));
      cam.fov = fov(tall ? 66 : 76);
      cam.position.set(-34 + u * 7, 8.5 + u * 1.5, 40 - u * 2);
      cam.lookAt(u * 3, 18 + u * 5, -12);
      cam.updateProjectionMatrix();
      return;
    }
    this.push += (near - this.push) * (1 - Math.exp(-real / 420));
    // (clutch time: it comes in and down a little, slowly, and stays there while the play is on)
    this.tight += ((clutch && live ? 1 : 0) - this.tight) * (1 - Math.exp(-real / 1800));
    // (a ball by the far sideline: the near half of the floor is empty wood, so it looks farther and a little tighter)
    this.far += (clamp((-this.ball.z - 7) / 14, 0, 1) - this.far) * (1 - Math.exp(-real / 600));
    let fv = fov((tall ? 35 : 46) - this.push * (tall ? 3 : 5) - this.tight * (tall ? 1.5 : 2.5) - this.far * (tall ? 1.5 : 2.5));
    // (a ball by the near sideline: the picture may go farther along the floor to keep its man in it)
    const reach = (tall ? 30 : 24) + clamp(this.ball.z, 0, 25) * 0.36;
    const sc = stage.script;
    const sec = real / 1000;
    // how fast the ball is going along the floor, eased (a pass is over before the camera has heard of it; a break is not)
    const vx = sec > 0 ? clamp((this.ball.x - this.ballWas) / sec, -60, 60) : 0;
    this.ballWas = this.ball.x;
    this.ballVx += (vx - this.ballVx) * (1 - Math.exp(-real / 450));
    let to = this.ball.x;
    // (most of the picture ahead of the ball, toward the basket it's going at, and a little more ahead of one on its way)
    if (sc && stage.play) to += (sc.dir === 1 ? -1 : 1) * (tall ? 7 : 4) + clamp(this.ballVx * LEAD, -LEAD_MAX, LEAD_MAX);
    to = clamp(to, -reach, reach);
    const jump = this.focus === null || Math.abs(to - this.focus) > 60;
    if (jump) {
      this.focus = to;
      this.focusV = this.ballVx = 0;
    } else if (sec > 0) {
      // (a spring with no bounce in it: the turn has a speed of its own, so it eases off and eases in)
      const w = 2 / FOLLOW_S;
      const x = w * sec;
      const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const off = this.focus! - to;
      const t = (this.focusV + w * off) * sec;
      this.focusV = (this.focusV - w * t) * e;
      this.focus = to + (off + t) * e;
    }
    // it looks nearer for a ball on the near side (a man in the near corner keeps his feet in the picture),
    // and a little higher for one in the air (a long shot stays in it at the top)
    const dip = clamp((this.ball.z - 8) * 0.8, 0, 12);
    const lift = clamp((this.ball.y - 9) * 0.7, 0, 5);
    this.dip = jump ? dip : this.dip + (dip - this.dip) * (1 - Math.exp(-real / 380));
    this.lift = jump ? 0 : this.lift + (lift - this.lift) * (1 - Math.exp(-real / 220));
    // (the operator: the frame is never quite still on the play, and the rim taking a dunk is felt in it)
    let px = this.focus! * 0.78 + d.drift(0, OPERATOR * 0.6);
    let py = 33 - this.tight * 2 - d.bump(0.4);
    let pz = 60 - this.tight * 1.5;
    let lx = this.focus! + d.drift(1, OPERATOR);
    let ly = this.lift + d.drift(2, OPERATOR * 0.45);
    let lz = (tall ? -6 : -4) + this.dip - this.far * 3;
    if (this.shot === 'open') {
      // the game's first possession: up from low by the centre circle into the main camera
      const w = smooth(Math.min(1, this.shotMs / OPEN_MS));
      px += (-6 - px) * (1 - w);
      py += (6 - py) * (1 - w);
      pz += (34 - pz) * (1 - w);
      lx += (this.ball.x - lx) * (1 - w);
      ly += (4 - ly) * (1 - w);
      lz += (this.ball.z - lz) * (1 - w);
      fv += (fov(tall ? 50 : 58) - fv) * (1 - w);
    }
    cam.fov = fv;
    cam.position.set(px, py, pz);
    cam.lookAt(lx, ly, lz);
    cam.updateProjectionMatrix();
  }
  private ballWas = 0;
  private far = 0;

  /** Into a replay or out of it: the next frame starts afresh (everyone on his spot, the ball where its move has it, a cut). */
  private recut() {
    this.lastScript = null;
    for (const k of this.planAt.keys()) this.planAt.set(k, [NOWHERE, NOWHERE]);
    // (the net and the rim are still; the end of a possession seen again doesn't sink the shot again)
    this.netKick = 1e-6;
    this.rimKick = 0;
    this.focus = null;
    this.shot = 'main';
    this.shotMs = HOLD_MS;
    this.cue = null;
  }

  /** The court has finished `sc`: a replay of its big play starts if one is due (true: hold the court until `released`). */
  replay(sc: Script | null): boolean {
    return this.director.start(sc);
  }
  /** A tap on the court: the replay goes, through its wipe. */
  skipReplay() {
    this.director.skip();
  }
  /** The replay goes at once (the game stopped, sped up, or the picture went). */
  endReplay() {
    this.director.end();
  }
  /** The court may go on (no replay is holding it). */
  get released() {
    return this.director.released;
  }

  /** A point of the scene on the page (CSS pixels). */
  private screen(v: Vector3): { x: number; y: number } {
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** The scene as it is now from another camera (the scene lab's), finished as the picture is. */
  still(camera: PerspectiveCamera) {
    this.lens.render(this.scene, camera, 0);
  }

  dispose() {
    for (const [pid, f] of [...this.figs]) this.drop(pid, f);
    for (const o of this.trash) o.dispose();
    this.floorTex?.dispose();
    this.envMap?.dispose();
    this.lens.dispose();
    this.renderer.dispose();
  }
}

function set(v: Vector3, p: V3) {
  v.set(p.x, p.y, p.z);
}

export { loadModels } from './models';
