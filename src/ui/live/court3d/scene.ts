// The 3D court: the floor the 2D court paints, two baskets, ten figures and a ball, seen from a
// broadcast camera on the sideline. It draws the moment the 2D court's clock is at (its Stage): the
// plan's positions, facings and acts go to each figure's puppet, the ball goes from hand to hand,
// and that is all. Loaded on demand (three.js stays out of the app's first download).
import {
  CanvasTexture,
  Color,
  Group,
  type DirectionalLight,
  FogExp2,
  type HemisphereLight,
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
import {
  bouncePass,
  GRAVITY,
  meets,
  passArc,
  planShot,
  shotAt,
  shotSpeed,
  spinFor,
  Spring,
  stretch,
  swat,
  veer,
  type Hoop,
  type Shot,
  type ShotKind,
  type Spin,
} from './ballistics';
import { lit as ledLit } from './ballskin';
import { DUNK_AT, isDunk } from './clips';
import { blocked, clearSeat, Operator, shot as newShot, TALL, type CamKind, type View } from './cameras';
import { BIG_WORD, Director, INTRO_MS, WIPE_MS, type BigKind } from './director';
import { Fig, figureGeo, type Geo } from './figure';
import { air, arenaLight, HAZE_COLOR, HAZE_DENSITY, Lens, varnish, woodOf, type FloorKnobs } from './lens';
import { Marks, SHOT_LATE } from './marks';
import type { Models } from './models';
import type { NetSim } from './net';
import { buildProps } from './props';
import { Rig } from './rig';
import { BALL_R, hash, J, type Body, type V3 } from './puppet';
import { Sideline } from './sideline';
import { clearOf, passPath, Spacing, swerve, type PassPath } from './spacing';

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
  /** The camera that follows the play (cameras.ts; the broadcast's main one when not said). */
  cam?: CamKind;
  /** Who is on each bench, [home, away] (player ids): they sit there as themselves. Without it the benches are made up. */
  bench?: [number[], number[]];
}

/** What the page writes over the picture this frame (in CSS pixels). */
export interface Labels {
  /** The tags over heads: the man with the ball, then a man the user tapped; each his name and number, in his team's colour (`late`: the shot clock is running out on him). */
  tags: { x: number; y: number; text: string; num: string; color: string; late: boolean }[];
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
/** What a loose ball falls by, ft a second squared, in the bodies' time (a touch more than a thrown one's: it is out of the way sooner). */
const G = GRAVITY * 1.15;
/** How much of its speed a ball keeps off the floor, and the bounce too small to count (ft a second). */
const BOUNCE_KEEP = 0.62;
const BOUNCE_LEAST = 2.5;
/** A loose ball is moved in steps no longer than this (s): it meets the iron, it doesn't skip through it. */
const FREE_STEP = 1 / 120;
/** The two baskets, for a loose ball (ballistics.ts meets). */
const HOOPS: readonly Hoop[] = [
  { x: -(COURT_LEN / 2 - BASKET.y), z: 0, out: 1 },
  { x: COURT_LEN / 2 - BASKET.y, z: 0, out: -1 },
];
/** A man hanging on the rim: a hand this near the ring (ft) has hold of it, and each holds it this far down (radians). */
const HANG_NEAR = 0.45;
const HANG_TIP = 0.055;
/** The play's time to the bodies', when a frame doesn't say (CourtView's COURT3D_PACE). */
const PACE = 0.5;
/** The rim on its hinge: how fast it rings (a second) and how soon it stops; how fast a firm shot off the iron sets it going (radians a second), and a dunk. */
const RIM_HZ = 4.2;
const RIM_DAMP = 0.36;
const RIM_KNOCK = 0.5;
const RIM_SLAM = 3.4;
/** The unit on its base: slower, and it takes this much of a dunk. */
const UNIT_HZ = 3.1;
const UNIT_DAMP = 0.14;
const UNIT_SLAM = 0.07;
/** The ball's spin gets to what it is doing in about this long (s). */
const SPIN_S = 0.07;
/** A dribbler's clips (the ball rolls forward off the floor). */
const DRIBBLES = new Set(['dribble', 'dribbleRun', 'crossover']);
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
/** A bench's or the crowd's cut-away has this long (ms), a timeout's bench this long. */
const AWAY_MS = 1500;
const HUDDLE_MS = 2400;
/** A close-up with a body in front of its man for this long (ms) is left. */
const BLOCK_MS = 220;
/** The final buzzer's picture goes from the winners to the crowd after this long (ms), and to the whole building after this. */
const FINAL_CROWD = 5200;
const FINAL_WIDE = 8600;
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
const TIP_OFF = 38;
const TIP_FROM = -0.45;
const TIP_TURN = 0.07;
/** The final buzzer's camera comes in on the winners over this long (ms), from this far off them (ft). */
const FINAL_MS = 5000;
const FINAL_OFF = 31;
/** A camera on a man's shoulder moves this much (ft) as it holds; the main camera's operator lets the frame wander this much. */
const HAND = 0.1;
const OPERATOR = 0.45;
/** How much of their light the stands keep behind a close-up: the picture is the player, not the crowd behind him. */
const CUT_DIM = 0.42;
/** And the benches while a play is on: the men on the floor by the far sideline stand out from their own bench. */
const BENCH_DIM = 0.4;
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
const TOSS = 27;
/** A loose ball rolls to a stop over about this long (s), and a bounce keeps this much of its roll. */
const ROLL_S = 0.9;
const ROLL_KEEP = 0.7;
/** A rebound's arc off the rim (ft above the line from the rim to his hands, and more the farther it goes), and the most a ball already on its way up adds. */
const REBOUND_ARC = 2.2;
const REBOUND_MOST = 4.5;

/** How much of the floor's colour the light off it loses (see warm). */
const BOUNCE_GREY = 0.45;
/** How far a device that can't keep up has stepped down (see lite). */
export type Lite = 0 | 1 | 2 | 3;

/** A ball through the net pulls it for this long (ms): down, flicked back up past where it hangs, and still. */
const NET_MS = 700;
/** A tag stands this far over a head (ft); a tapped man keeps his this long (ms); a tap this near him on the page (px, at least) is on him. */
const TAG_OVER = 1.15;
const PICK_MS = 7000;
const PICK_PX = 30;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** A point on the court, in the scene: x along the floor, z across it (toward the camera). */
const sx = (p: Pt) => p.y - MID;
const sz = (p: Pt) => -p.x;

const A = new Vector3();
const Q = new Quaternion();
const AXIS_X = new Vector3(1, 0, 0);
const HANDS: V3[] = [];
const NO_HANDS: V3[] = [];
const TMP: V3 = { x: 0, y: 0, z: 0 };
const TMP2: V3 = { x: 0, y: 0, z: 0 };
const SIDE = { x: 0, z: 0 };
const SEAT = { x: 0, z: 0 };
/** A close-up's camera stands this far off its man (ft). */
const CLOSE_OFF = 22;
const WAY = { x: 0, z: 0 };
const TURN: V3 = { x: 0, y: 0, z: 0 };

export class CourtScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1.3, 4, 700);
  private readonly geo: Geo;
  private readonly arena: Arena;
  private readonly rig: Rig;
  /** The camera's exposure with the house lights up (kept the first time they are asked about). */
  private lit?: number;
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
  private readonly ballFrame = new Group();
  // which way the ball has turned (its seams), kept apart from the frame it is stretched in
  private readonly ballTurn = new Quaternion();
  private readonly ballShadow: Mesh;
  private readonly nets: Object3D[] = [];
  private readonly rims: Object3D[] = [];
  private readonly units: Object3D[] = [];
  private readonly swish: Vector3[] = [];
  // the nets as cord (net.ts), the rims on their hinges and the units on their bases, and the boards' lights
  private readonly cords: { sim: NetSim; mesh: Object3D; draw(): void }[] = [];
  private readonly hinges = [new Spring(RIM_HZ, RIM_DAMP), new Spring(RIM_HZ, RIM_DAMP)];
  private readonly sways = [new Spring(UNIT_HZ, UNIT_DAMP), new Spring(UNIT_HZ, UNIT_DAMP)];
  private readonly led: MeshBasicMaterial;
  private rimWas = 0;
  // how hard the net and the rim were last hit (a dunk more than a shot); how the ball turns (its axis times radians a second) and how fast it goes
  private netHit = 1;
  private rimHit = 1;
  // the camera that follows the play (cameras.ts): its operator, what he is shown, his picture; how far it has come in for the clutch
  private readonly op = new Operator();
  private readonly view: View = { ball: { x: 0, y: 0, z: 0 }, men: new Float32Array(20), n: 0, end: 0, aspect: 1.5, near: 0, tight: 0 };
  private readonly pic = newShot();
  private camCut = false;
  private readonly spin = new Vector3();
  private readonly ballV = new Vector3();
  private long = 0;
  // the shot in the air (ballistics.ts), how many of the things it meets it has met, and how fast the ball was going when this move picked it up
  private flight: Shot | null = null;
  private met = 0;
  private readonly fromV = new Vector3();
  // a blocked shot is off the hand and on its own (until someone has it)
  private swatted = false;
  private tight = 0;
  // the ball: where it is, where this move picked it up, how fast it's falling
  private readonly ball = new Vector3(0, BALL_R, 0);
  private readonly from = new Vector3();
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
  private netKick = 0;
  private rimKick = 0;
  // the camera on now, how long it has been (ms), how long there has been nothing to follow, how far it has pushed in
  private shot: 'main' | 'wide' | 'close' | 'house' | 'tip' | 'open' | 'final' | 'bench' | 'crowd' | 'intro' = 'main';
  // how long the cut-away on now has (ms), whose bench or crowd it is, whether a timeout's building comes after it,
  // how long a body has been in front of a close-up's man (ms)
  private cutLen = CUT_MS;
  private cutSide: 0 | 1 = 0;
  private cueSide: 0 | 1 = 0;
  private after = false;
  private blockMs = 0;
  // the tip's building shot has been shown
  private introSeen = false;
  private finalBeat = 0;
  private shotMs = 0;
  private idleMs = 0;
  private push = 0;
  // a cut-in: the one asked for (and how long ago, ms), who it's on, the move it was asked in, where its camera is and looks
  private cue: 'close' | 'house' | 'bench' | 'crowd' | null = null;
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
  // who is who on the floor (marks.ts), and the man the user tapped: who, and how long ago (ms)
  private readonly marks: Marks;
  private picked: number | null = null;
  private pickMs = 0;
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
    this.rig = new Rig(this.scene);
    this.sky = this.rig.sky;
    this.bounce = this.rig.bounce;

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
    this.arena = new Arena(keep, props, new Sideline(keep, props, models, this.geo));
    this.scene.add(this.arena.group);

    // the baskets: the unit behind each baseline, its board, the rim and its net
    for (const end of [-1, 1]) {
      const { group, rim, net, swish, live } = props.basket();
      this.cords.push(live);
      // (built for the basket at the low end, facing up the floor; the other is turned round)
      group.position.set(end * (MID - BASKET.y), 0, 0);
      if (end > 0) group.rotation.y = Math.PI;
      this.rims.push(rim);
      this.nets.push(net);
      this.units.push(group);
      this.swish.push(swish);
      this.scene.add(group);
    }

    // (the ball turns inside a frame that is drawn a little long the way it goes when it goes fast)
    this.ballMesh = props.ball(ballFill, ballSeam);
    this.ballFrame.add(this.ballMesh);
    this.scene.add(this.ballFrame);
    this.ballShadow = props.ballShadow();
    this.ballShadow.visible = false;
    this.scene.add(this.ballShadow);
    this.marks = new Marks(keep);
    this.scene.add(this.marks.group);
    this.led = props.led;
  }

  /**
   * A device that can't keep up: the picture straight to the screen, unfinished (no glow, no dark where
   * things meet), without the lamps' beams and with two of the four lamps' shadows (1), no shadows thrown
   * at all, a blob under each man instead (2), and no mirror in the floor, nor its fine wood, nor the lit
   * air over the stands (3).
   */
  lite(level: Lite) {
    this.level = level;
    this.arena.mirror(this.px.x, this.px.y, level < 1);
    this.lens.post = level < 1;
    this.lens.occlude = level < 1;
    this.beams.visible = level < 1;
    this.rig.lite(level);
    this.arena.lite(level > 2);
    this.floorKnobs.uDetail.value = level > 2 ? 0 : 1;
    this.dome.visible = level < 3;
    // (the building's extras: the roof's steel and the boards' rate from step 2, half the cameras and confetti at 3)
    this.arena.shed(level > 2 ? 2 : level > 1 ? 1 : 0);
    this.arena.sideline.shed(level);
    // (the players' plain material, no cloth sheen nor knit, once the shadows have gone too)
    this.figLite = level > 1;
    for (const f of this.figs.values()) {
      f.lite(this.figLite);
      f.shadow.visible = this.figLite;
    }
    // (a blob under a man and the ball is what a device with no thrown shadows has instead of them)
    this.ballShadow.visible = this.figLite;
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
    this.floorKnobs.uWood.value.copy(woodOf(cv));
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
      f.shadow.visible = this.figLite;
      // (a body takes the lamps' shadows too: an arm's on a trunk, one man's on the next)
      f.group.traverse((o) => (o.receiveShadow = true));
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
    const reel = this.director.feed(stage, dt, own, real, (this.shot === 'close' || this.shot === 'bench' || this.shot === 'crowd') && this.shotMs < this.cutLen - WIPE_MS / 2);
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
    const labels: Labels = { tags: [], flash: null, third: null, replay: false, wipe: null };
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
    let passing = false;
    let hanger: Fig | null = null;
    /** The building gets up for a basket: all of it for the home side's big ones, a stir for the visitors'. */
    const roar = (home: boolean, big: boolean) => this.arena.cheer(home ? (big || p.clutch ? 1 : line ? 0.25 : 0.42) : big ? 0.22 : 0.12);
    // (where the page's words go: found now, put on the picture once the camera is aimed)
    let tagAt: { f: Fig; pid: number } | null = null;
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
            // (the man on him, if one is near: he keeps the ball away from him)
            press: j === carried ? nearestOf(spots, j, j < nO ? nO : 0, j < nO ? pids.length : nO, (k) => this.figs.get(pids[k])?.pup) : undefined,
            // (about to pass it: how long until it leaves his hands)
            pass: j === carried && nb?.act[j] === 'pass' ? Math.max(0, play.dur - play.ms) : undefined,
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
        this.flight = null;
        this.met = 0;
        // (how fast it was going, for whoever picks it out of the air; a held ball's is its carrier's, not its own)
        if (this.heldBy === null && !fresh) this.fromV.copy(this.ballV);
        else this.fromV.set(0, 0, 0);
        if (fresh || (b.hold !== undefined && b.hold >= 0)) this.swatted = false;
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
      // (the play's time to the bodies')
      const pace = own > 0 && dt > 0 ? dt / own : PACE;
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
            this.vy = -17;
            this.drift.x = this.drift.z = 0;
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
        } else if (this.slammed) {
          free = true;
          // (he may hang on the rim on his way down)
          if (was && one && isDunk(one.id)) hanger = was;
        } else if (this.swatted) free = true;
        else if (b.swat !== undefined && figs[b.swat]) {
          // blocked: it gets as far as his hand, and goes off it the way the play takes it next (or back where it came from)
          const blk = figs[b.swat];
          hands.add(blk);
          const j = blk.pup.j;
          const hand = blk.pup.world(j[J.hr * 3], j[J.hr * 3 + 1] + 0.4, j[J.hr * 3 + 2], TMP);
          const w = Math.min(1, lu / 0.32);
          ball.set(this.from.x + (hand.x - this.from.x) * w, this.from.y + (hand.y - this.from.y) * w + 1.2 * w * (1 - w), this.from.z + (hand.z - this.from.z) * w);
          this.give(null, null, ease, false);
          backspin = true;
          if (lu >= 0.32) {
            this.swatted = true;
            // (how long until someone has it: the rest of this move and the ones with nobody on the ball after it)
            let left = (1 - lu) * play.dur;
            let k = bi + 1;
            for (; k < sc.frames.length && !((sc.frames[k].hold ?? -1) >= 0); k++) left += sc.frames[k].dur;
            const to = sc.frames[k] ? toWorld(sc.frames[k].ball, sc.dir) : null;
            const v = swat(hand, this.from, to && { x: sx(to), y: 0, z: sz(to) }, left / 1000 / pace, hash(this.scriptN, bi + 3), TMP2);
            this.vy = v.y;
            this.drift.x = v.x;
            this.drift.z = v.z;
            this.spin.set(v.z, 0, -v.x).multiplyScalar(0.6);
            free = true;
          }
        } else {
          // a shot: thrown from his hand to the rim, and what it does there (ballistics.ts): through it, off the iron, off the glass
          const made = b.fx === 'make';
          if (!this.flight) {
            const kind: ShotKind = this.ftAt.includes(bi - 1) ? 'ft' : ((['layup', 'floater', 'jumper'] as const).find((k) => a.act.includes(k)) ?? 'jumper');
            // (where the play takes it after: a rebounder's hands, or the floor where it is next wanted)
            const nf = made ? undefined : sc.frames[bi + 1];
            const to = nf && toWorld(nf.ball, sc.dir);
            this.flight = planShot({
              from: this.from,
              rim,
              kind,
              made,
              secs: play.dur / 1000 / pace,
              next: to ? { x: sx(to), y: 0, z: sz(to) } : null,
              r: [hash(this.scriptN, bi), hash(this.scriptN, bi + 50), hash(this.scriptN, bi + 7)],
            });
          }
          const shot = this.flight;
          // (once it has landed it is its own: it drops out of the net to the floor, or comes off the iron)
          if (this.landed) free = true;
          else {
            set(ball, shotAt(shot, lu, TMP));
            // (what a body had moved it in his hands is let go of on the way up)
            this.give(null, null, ease, false);
            backspin = this.met === 0;
            for (; this.met < shot.hits.length && lu >= shot.hits[this.met].u; this.met++) {
              const hit = shot.hits[this.met];
              // (off the iron or the glass it loses its spin, and picks up some of the way it glanced off)
              shotSpeed(shot, hit.u + 0.02, TMP2);
              if (hit.what !== 'net') this.spin.set(TMP2.z, TMP2.y * 0.4, -TMP2.x).multiplyScalar(0.7);
              if (calm) continue;
              if (hit.what === 'net') {
                this.netKick = 1;
                this.netHit = hit.power;
                roar(sc.off === 0, b.flash?.text === '+3' || !!sc.moment);
                if (sc.moment) this.lens.bump(BUZZER_BUMP);
              } else if (hit.what === 'rim') {
                this.rimKick = 1;
                this.rimHit = hit.power;
              } else this.sways[rimEnd].kick(-UNIT_SLAM * hit.power);
            }
            if (lu >= 1) {
              this.landed = true;
              // (it goes on as it was going: down out of the net, or up and away off the iron)
              const v = shotSpeed(shot, 1, TMP2);
              this.vy = v.y;
              this.drift.x = v.x;
              this.drift.z = v.z;
              free = true;
            }
          }
        }
      } else if (this.swatted && !next) free = true;
      else {
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
        // (one that never met the iron only falls to him)
        const off = !!next && b.act[figs.indexOf(next)] === 'rebound' && this.from.y > RIM_H - 1 && this.fromV.y > -2;
        // (a ball picked out of the air, off the iron or off a block, starts the way it was going: up, if it was on its way up)
        const flying = !was && this.fromV.lengthSq() > 4;
        const secs = play.dur / 1000 / pace;
        const rise = flying ? clamp((this.fromV.y * secs - (to.y - this.from.y)) / 4, 0, REBOUND_MOST) : 0;
        // (a pass is thrown up by as much as it falls on its way: a long one is a lob, a short one all but flat; a ball already in the air is not thrown again)
        const arc = Math.max(this.path.lob, flying ? 0 : Math.min(next ? 1.8 : 3, passArc(secs)), off ? Math.max(rise, Math.min(REBOUND_ARC, 0.6 + far * 0.2)) : rise);
        const side = swerve(this.path, lu, SIDE);
        if (flying) {
          const way = veer(to.x - this.from.x, to.z - this.from.z, this.fromV.x, this.fromV.z, secs, lu, WAY);
          side.x += way.x;
          side.z += way.z;
        }
        ball.set(
          this.from.x + (to.x - this.from.x) * lu + side.x,
          this.path.bounce ? bouncePass(this.from.y, to.y, BALL_R, this.path.bounce, lu, secs) : this.from.y + (to.y - this.from.y) * lu + 4 * arc * lu * (1 - lu),
          this.from.z + (to.z - this.from.z) * lu + side.z,
        );
        passing = true;
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
        tagAt = { f: figs[hold], pid: hold < nO ? sc.oPids[hold] : sc.dPids[hold - nO] };
      }
      const fl = (play.u > 0.35 ? b.flash : undefined) ?? (play.u <= 0.35 ? a.flash : undefined);
      if (fl) {
        const at = toWorld({ x: fl.x, y: fl.y }, sc.dir);
        flashAt = { x: sx(at), z: sz(at), fl, alpha: calm ? 1 : fl === b.flash ? Math.min(1, (play.u - 0.35) / 0.25) : 1 - play.u / 0.35 };
      }
      // (the camera pushes in as the ball gets to the basket)
      near = clamp(1 - (Math.hypot(ball.x - rim.x, ball.z - rim.z) - 6) / 16, 0, 1);
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
      // (in short steps: it meets the iron, the glass and the net's cords on its way, and comes off them: ballistics.ts)
      const steps = Math.min(12, Math.ceil(sec / FREE_STEP));
      const h = sec / steps;
      for (let st = 0; st < steps; st++) {
        this.vy -= G * h;
        TMP.x = ball.x + this.drift.x * h;
        TMP.y = ball.y + this.vy * h;
        TMP.z = ball.z + this.drift.z * h;
        TMP2.x = this.drift.x;
        TMP2.y = this.vy;
        TMP2.z = this.drift.z;
        const met = meets(TMP, TMP2, h, HOOPS);
        set(ball, TMP);
        this.drift.x = TMP2.x;
        this.vy = TMP2.y;
        this.drift.z = TMP2.z;
        if (met && !calm) {
          const end = ball.x < 0 ? 0 : 1;
          if (met > 0) this.hinges[end].kick(-RIM_KNOCK * met);
          else this.sways[end].kick(UNIT_SLAM * met);
          this.spin.set(this.drift.z, this.vy * 0.3, -this.drift.x).multiplyScalar(0.8);
        }
        if (ball.y < BALL_R) {
          ball.y = BALL_R;
          const hard = Math.abs(this.vy) > BOUNCE_LEAST;
          this.vy = hard ? -this.vy * BOUNCE_KEEP : 0;
          if (hard) {
            this.drift.x *= ROLL_KEEP;
            this.drift.z *= ROLL_KEEP;
          }
        }
      }
      // (off whoever it comes down on, once it is where it fell to)
      this.clear(null, null, BALL_PUSH * sec);
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
    // the people round the floor: the referees work this moment of the play, the coaches and the benches watch it
    // (a referee who has the ball, at the tip or picked up dead, puts it in his hands)
    this.arena.sideline.update({
      stage,
      ball,
      figs: this.figs,
      held: !!holder,
      line,
      final: p.final,
      clutch: !!p.clutch,
      game: p.game,
      bench: p.bench,
      own,
      ease,
      real,
      calm,
      cut: !!reel?.cut,
      replay: this.director.onAir,
    });

    for (const [pid, f] of [...this.figs]) {
      if (!seen.has(pid)) {
        this.drop(pid, f);
        continue;
      }
      f.ball = hands.has(f) ? ball : null;
      f.pup.arms(hands.has(f) ? ball : null);
      f.place();
      const hot = !!p.hot?.has(pid);
      // (the man with the ball has the broadcast's own ring: see marks.ts)
      f.ring.visible = hot && f !== holder;
      if (f.ring.visible) (f.ring.material as MeshBasicMaterial).color.set(p.warn);
    }

    // the ball turns as what it is doing turns it (ballistics.ts spinFor): its seams show it. Its shadow stays on the
    // floor, tight and dark as it touches, wider and fainter the higher it is
    const bm = this.ballFrame.position;
    const moved = bm.distanceTo(ball);
    if (sec > 0 && moved < 20) this.ballV.set((ball.x - bm.x) / sec, (ball.y - bm.y) / sec, (ball.z - bm.z) / sec);
    else if (moved >= 20) this.ballV.set(0, 0, 0);
    const doing: Spin = backspin
      ? line
        ? 'ft'
        : 'shot'
      : passing
        ? 'pass'
        : holder
          ? DRIBBLES.has(holder.pup.clip)
            ? 'dribble'
            : 'held'
          : free && ball.y <= BALL_R + 0.02
            ? 'roll'
            : 'loose';
    // (a dribbler's ball rolls the way he goes, not the way his hand takes it from side to side)
    const turn =
      doing === 'dribble' && holder
        ? spinFor(doing, holder.pup.vf * Math.sin(holder.pup.yaw), holder.pup.vf * Math.cos(holder.pup.yaw), TURN)
        : spinFor(doing, this.ballV.x, this.ballV.z, TURN);
    if (turn && sec > 0) this.spin.lerp(A.set(turn.x, turn.y, turn.z), 1 - Math.exp(-sec / SPIN_S));
    const rate = this.spin.length();
    if (!calm && sec > 0 && rate > 1e-3) this.ballTurn.premultiply(Q.setFromAxisAngle(A.copy(this.spin).divideScalar(rate), Math.min(1.2, rate * sec))).normalize();
    // (a pass thrown hard is drawn a little long along its way; the seams turn inside that)
    const speed = this.ballV.length();
    const long = passing && !calm ? stretch(speed) : 0;
    this.long += (long - this.long) * (sec > 0 ? 1 - Math.exp(-sec / SPIN_S) : 0);
    if (this.long > 1e-3 && speed > 1) {
      this.ballFrame.quaternion.setFromUnitVectors(AXIS_X, A.copy(this.ballV).divideScalar(speed));
      this.ballFrame.scale.set(1 + this.long, 1 - this.long * 0.4, 1 - this.long * 0.4);
      this.ballMesh.quaternion.copy(this.ballFrame.quaternion).invert().multiply(this.ballTurn);
    } else {
      this.ballFrame.quaternion.identity();
      this.ballFrame.scale.setScalar(1);
      this.ballMesh.quaternion.copy(this.ballTurn);
    }
    bm.copy(ball);
    const up = Math.max(0, ball.y - BALL_R);
    this.ballShadow.position.set(ball.x, 0.035, ball.z);
    this.ballShadow.scale.setScalar(0.74 + Math.min(2.2, up * 0.22));
    (this.ballShadow.material as MeshBasicMaterial).opacity = 0.62 / (1 + up * 1.1) + 0.1 / (1 + up * 0.12);
    // the net takes a made shot, the rim a miss or a dunk
    this.netKick = Math.max(0, this.netKick - own / NET_MS);
    this.rimKick = Math.max(0, this.rimKick - own / 380);
    // (a knock sets the rim ringing on its hinge at the board; a dunk tips it right down, and the whole unit rocks on its base)
    if (this.rimKick > this.rimWas) {
      const slam = this.rimHit > 1.5;
      this.hinges[rimEnd].kick(-(slam ? RIM_SLAM : RIM_KNOCK) * this.rimHit);
      if (slam) this.sways[rimEnd].kick(-UNIT_SLAM * this.rimHit);
    }
    this.rimWas = this.rimKick;
    // (the cords are worked out while the device keeps up; past that the net Blender made is pulled as a ball would pull
    // it: down its length, flicked back up past where it hangs, wider at the foot, and swung out)
    const corded = this.level < 2 && !calm;
    const age = (1 - this.netKick) * NET_MS;
    const pull = this.netKick > 0 ? this.netHit * Math.exp(-age / 230) : 0;
    this.nets.forEach((n, i) => {
      const k = i === rimEnd ? pull : 0;
      const wave = Math.cos(age / 50);
      this.swish[i].set(k * wave, k * 0.2 * Math.max(0, -wave), k * 0.22 * Math.sin(age / 64));
      if (calm) {
        this.hinges[i].still();
        this.sways[i].still();
      }
      const unit = this.units[i];
      // (the far basket's own frame is turned round)
      const flip = unit.rotation.y ? -1 : 1;
      // a man hanging on it: each hand on the ring holds it down, and the cords are pushed off his wrists
      HANDS.length = 0;
      if (hanger && i === rimEnd && !calm)
        for (const k of [J.hl, J.hr]) {
          const j = hanger.pup.j;
          const at = hanger.pup.world(j[k * 3], j[k * 3 + 1], j[k * 3 + 2], TMP);
          const lx = (at.x - unit.position.x) * flip;
          const lz = at.z * flip;
          if (Math.hypot(Math.hypot(lx, lz) - 0.776, at.y - RIM_H) < HANG_NEAR) HANDS.push({ x: lx, y: at.y - RIM_H - 0.25, z: lz });
        }
      this.hinges[i].step(sec, -HANG_TIP * HANDS.length);
      this.sways[i].step(sec);
      const tip = this.hinges[i].x;
      unit.rotation.z = this.sways[i].x;
      // (the rim tips about its hinge; the net hangs from it)
      for (const o of [n, this.rims[i]]) {
        o.rotation.z = tip;
        o.position.set(RIM_HINGE * (Math.cos(tip) - 1), RIM_H + RIM_HINGE * Math.sin(tip), 0);
      }
      const cord = this.cords[i];
      n.visible = !corded;
      cord.mesh.visible = corded;
      if (!corded) return void cord.sim.reset();
      // (the ball in the net's own frame)
      TMP.x = (ball.x - unit.position.x) * flip;
      TMP.y = ball.y - RIM_H;
      TMP.z = ball.z * flip;
      if (cord.sim.step(sec, TMP, tip, HANDS.length ? HANDS : NO_HANDS)) cord.draw();
    });
    // the lights round the boards: red when the period's clock is out, and when the shot clock is
    const shotClock = this.arena.boards.house.shot;
    ledLit(this.led, (play ? play.clock <= 0 : p.game?.clock === 0) || (shotClock !== null && shotClock <= 0));

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
    pools = this.arena.sideline.touch(this.arena, pools);
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
      let cue: 'close' | 'house' | 'bench' | 'crowd' | null = null;
      let on: number | null = null;
      let word = '';
      let whose: 0 | 1 = 0;
      if (made && !line && (this.slammed || fl?.text === '+3' || sc.moment)) {
        cue = 'close';
        on = this.scorer;
        word = sc.moment ? BIG_WORD[sc.moment] : this.slammed ? BIG_WORD.dunk : BIG_WORD.three;
        // (not always his face: now and then his bench on its feet, or, for the home side, the crowd)
        const side = on === null ? undefined : this.figs.get(on)?.side;
        const r = hash(this.scriptN, 21);
        if (side !== undefined && !sc.moment) {
          whose = side;
          if (r < 0.2 && d.benchClear(side, this.view.men, this.view.n)) cue = 'bench';
          else if (r < 0.36 && side === 0) cue = 'crowd';
        }
      } else if (made && line && hash(this.scriptN, 22) < 0.6) {
        // (a free throw down: the man at the line, now and then)
        cue = 'close';
        on = this.scorer;
        word = 'At the line';
      } else if (news && (news.kind === 'foul' || news.text === 'And one!')) {
        cue = 'close';
        on = this.heldBy ?? (news.kind === 'make' ? this.scorer : null);
        word = news.kind === 'make' ? BIG_WORD.and1 : 'Fouled';
      } else if (news?.text.startsWith('Timeout')) {
        cue = 'house';
        // (whose it is: its bench first, then the building)
        whose = p.game?.abbrevs[1] && news.text.endsWith(p.game.abbrevs[1]) ? 1 : 0;
      }
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
        this.cueSide = whose;
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
    this.aim(stage, real, calm, line, near, quiet, !!p.clutch, p.cam ?? 'tv', p.final);
    if (this.cutHook && !calm && !reel && !d.onAir && (this.shot !== shotWas || this.camCut) && this.shot !== 'open' && real > 0) {
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
    // who is who: a ring under the man with the ball and a tag over his head (the ring says when the shot clock
    // is running out on him), and the same, plainer, for a man the user tapped; none of it in a replay or a close-up
    const plain = !d.onAir && (this.shot === 'main' || this.shot === 'open') && p.final === undefined;
    const left = this.arena.boards.house.shot;
    const late = sc && play && left !== null ? clamp((SHOT_LATE + 0.4 - left) / 1.2, 0, 1) : 0;
    this.pickMs += real;
    const picked = this.picked !== null && this.pickMs < PICK_MS ? this.figs.get(this.picked) : undefined;
    if (!picked) this.picked = null;
    const tagOver = (f: Fig, pid: number, isLate: boolean) => {
      const j = f.pup.j;
      const h = f.pup.world(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2], TMP);
      const at = this.screen(A.set(h.x, h.y + TAG_OVER, h.z));
      labels.tags.push({ x: at.x, y: at.y, text: p.names!(pid), num: p.jersey(pid), color: p.kits[f.side].color, late: isLate });
    };
    this.marks.tick(real);
    const lit = plain && holder ? (holder as Fig) : null;
    this.marks.put(0, !!lit, lit?.pup.x ?? 0, lit?.pup.z ?? 0, real, lit ? p.kits[lit.side].color : null, late, p.warn, calm);
    const also = plain && picked && picked !== lit ? picked : null;
    this.marks.put(1, !!also, also?.pup.x ?? 0, also?.pup.z ?? 0, real, null, 0, p.warn, calm);
    if (plain && p.names) {
      if (tagAt) {
        const t: { f: Fig; pid: number } = tagAt;
        tagOver(t.f, t.pid, late > 0.5);
      }
      if (also && this.picked !== null) tagOver(also, this.picked, false);
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
    // (the house lights come down for the open, the tip and a timeout, and some of the way for the clutch: rig.ts)
    this.rig.mood(this.shot === 'open' || this.shot === 'tip' || this.shot === 'house' ? 1 : p.clutch ? 0.6 : 0, calm ? 1e6 : real);
    this.lens.drama = this.rig.drama;
    // (the house lights down for the open, a timeout, a home win: the building says how far)
    this.lens.exposure = (this.lit ??= this.lens.exposure) * this.arena.house;
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
      // a screen coming: the man guarding the screener calls it. An open man with nobody near asks for the ball (one a move)
      const nO = sc.oPids.length;
      let asked = false;
      for (let j = 0; j < nO; j++) {
        if (b.act[j] === 'screen' && a.act[j] !== 'screen') figs[nO + j]?.pup.cue('call', null, 600);
        else if (!asked && b.act[j] === 'stand' && figs[j] && figs[j] !== holder && holder && holder.side === figs[j].side && r(20 + j) < 0.35) {
          const open = figs.every((f) => f.side === figs[j].side || Math.hypot(f.pup.x - figs[j].pup.x, f.pup.z - figs[j].pup.z) > OPEN_FT);
          if (open) {
            figs[j].pup.cue('ask', null, 500);
            asked = true;
          }
        }
      }
      // (fouled hard with the ball: now and then he goes down, and gets up)
      if (fl?.kind === 'foul' && a.hold !== undefined && a.hold >= 0 && figs[a.hold] && figs[a.hold] !== figs[b.foul ?? -1] && r(8) < 0.3) figs[a.hold].pup.stumble();
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
  private aim(stage: Stage, real: number, calm: boolean, line: boolean, near: number, quiet: boolean, clutch: boolean, kind: CamKind, final?: 0 | 1) {
    const cam = this.camera;
    const aspect = this.w / this.h;
    const fov = (across: number) => (2 * Math.atan(Math.tan((across * Math.PI) / 360) / aspect) * 180) / Math.PI;
    const live = !!(stage.script && stage.play);
    // what the camera that follows the play is shown: the ball, the men, the end being attacked
    const v = this.view;
    let n = 0;
    for (const f of this.figs.values()) {
      if (n >= v.men.length) break;
      (v.men as Float32Array)[n++] = f.pup.x;
      (v.men as Float32Array)[n++] = f.pup.z;
    }
    v.n = n / 2;
    v.ball = this.ball;
    v.end = live ? (stage.script!.dir === 1 ? -1 : 1) : 0;
    v.aspect = aspect;
    this.camCut = false;
    if (calm) {
      // (no pans: each half of the floor is a still picture, and the picture cuts between them)
      const s = this.pic;
      this.op.aim(kind, v, real, true, s);
      cam.fov = s.fov;
      cam.position.set(s.px, s.py, s.pz);
      cam.lookAt(s.lx, s.ly, s.lz);
      cam.updateProjectionMatrix();
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
      const head = f && j ? f.pup.world(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2], TMP2) : null;
      d.aimReel(cam, chest, head, this.ball, aspect, real);
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
    const held = this.shot === 'close' || this.shot === 'house' || this.shot === 'bench' || this.shot === 'crowd';
    const next = held && this.shot !== 'house' && (d.phase === 'wait' || d.phase === 'in');
    // (a body in front of a close-up's man: the picture leaves him)
    this.blockMs = this.shot === 'close' && who && blocked(who.pup.x, who.pup.z, this.seat.x, this.seat.z, this.others(who), v.n - 1) ? this.blockMs + real : 0;
    const over = held && ((this.shot === 'close' && (!who || this.blockMs > BLOCK_MS)) || (!next && (this.shotMs > this.cutLen || !quiet)));
    // a close-up is taken from where its man is clear, his face to it if it can be; from nowhere, the home crowd instead, or nothing
    if (this.cue === 'close' && who && clearSeat(who.pup.x, who.pup.z, who.pup.yaw, this.others(who), v.n - 1, CLOSE_OFF, SEAT) >= 3) this.cue = who.side === 0 ? 'crowd' : null;
    if (live) this.introSeen = false;
    else if (this.shot === 'intro' && this.shotMs > INTRO_MS) this.introSeen = true;
    const want: typeof this.shot =
      final !== undefined
        ? 'final'
        : held && !over
          ? this.shot
          : this.shot === 'bench' && this.after && quiet
            ? 'house'
            : ((this.cue === 'house' ? 'bench' : this.cue) ??
              // (the building, then the line-up, which stays on the picture until the first possession is on the floor: nothing in between)
              (tip || ((this.shot === 'tip' || this.shot === 'intro') && !live)
                ? this.introSeen
                  ? 'tip'
                  : 'intro'
                : live && (this.shot === 'tip' || this.shot === 'intro' || (this.shot === 'open' && this.shotMs < OPEN_MS))
                  ? 'open'
                  : this.idleMs > WIDE_AFTER
                    ? 'wide'
                    : live || this.shot !== 'wide'
                      ? 'main'
                      : 'wide'));
    // (the play starting again takes the picture back from the building at once, the buzzer and a timeout take it
    // from anything, and the tip's line-up goes straight into the first possession; every other camera has its HOLD_MS)
    const timeout = want === 'bench' && this.cue === 'house';
    const now = want === 'final' || want === 'house' || want === 'open' || want === 'intro' || timeout || (want === 'main' && this.shot === 'wide');
    if (want !== this.shot && (this.shotMs > HOLD_MS || now)) {
      this.shot = want;
      this.shotMs = 0;
      this.blockMs = 0;
      this.op.reset();
      if (want === 'close' || want === 'house' || want === 'bench' || want === 'crowd') {
        this.after = timeout;
        this.cutLen = want === 'close' ? CUT_MS : want === 'house' ? HOUSE_MS : timeout ? HUDDLE_MS : AWAY_MS;
        this.cutSide = this.cueSide;
        this.cue = null;
        if (want !== 'house' && !timeout) this.cutGap = 0;
      }
      if (want === 'close' && who) {
        // (low, from where he is clear: found just above)
        this.seat.set(SEAT.x, 5.4, SEAT.z);
        this.look.set(who.pup.x, 5.4 * who.pup.body.s, who.pup.z);
      }
    }
    const closeUp = this.shot === 'close' && !!who;
    const away = this.shot === 'bench' || this.shot === 'crowd';
    this.arena.dim(closeUp ? CUT_DIM : 1, closeUp ? CUT_DIM : away ? this.bench(1, real * 4) : this.bench(live ? BENCH_DIM : 1, real));
    if (this.shot === 'bench') return d.aimBench(cam, this.cutSide, this.shotMs, aspect);
    if (this.shot === 'crowd') return d.aimCrowd(cam, this.cutSide, this.shotMs, aspect);
    if (this.shot === 'intro') return d.aimIntro(cam, this.shotMs, aspect);

    if (this.shot === 'close' && who) {
      // low and tight on him, following him as he goes; the frame is on his face: his waist to over his head, whatever its shape
      const j = who.pup.j;
      const c = who.pup.world(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2], TMP);
      this.look.lerp(A.set(c.x, Math.max(4, c.y - 0.9), c.z), 1 - Math.exp(-real / 160));
      const half = (3.2 - 0.5 * Math.min(1, this.shotMs / CUT_MS)) / Math.min(1, aspect);
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
    const tall = aspect < TALL;
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
      // (the winners first; then the crowd, if it is theirs; then the whole building)
      const beat = this.shotMs > FINAL_WIDE ? 2 : this.shotMs > FINAL_CROWD && final === 0 ? 1 : 0;
      if (beat !== this.finalBeat) this.camCut = true;
      this.finalBeat = beat;
      if (beat === 1) return d.aimCrowd(cam, cx < 0 ? 0 : 1, this.shotMs - FINAL_CROWD, aspect);
      if (beat === 2) {
        const u = Math.min(1, (this.shotMs - FINAL_WIDE) / 16000);
        cam.fov = fov(tall ? 50 : 58);
        cam.position.set(56 - u * 12, 30 - u * 3, 72);
        cam.lookAt(0, 9, -14);
        cam.updateProjectionMatrix();
        return;
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
    if (this.shot === 'wide') {
      // the building, from high in a corner, drifting in
      const drift = Math.min(1, this.shotMs / 14000);
      cam.fov = fov(tall ? 46 : 54);
      cam.position.set(-60 + drift * 10, 30 - drift * 2, 74);
      cam.lookAt(-2, 8, -14);
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
    // (it comes in as the ball gets to the basket, and for a man at the line)
    this.push += ((line ? 1 : near) - this.push) * (1 - Math.exp(-real / 420));
    // (clutch time: it comes in and down a little, slowly, and stays there while the play is on)
    this.tight += ((clutch && live ? 1 : 0) - this.tight) * (1 - Math.exp(-real / 1800));
    v.near = this.push;
    v.tight = this.tight;
    const s = this.pic;
    // (a cut of his own, a new camera or the floor's changing ends, dissolves as any cut does; not his first picture after another shot's)
    const first = this.shotMs === 0 || !this.aimed;
    this.camCut = this.op.aim(kind, v, real, false, s) && !first;
    this.aimed = true;
    // (a hand on it: the gantry's and the end zone's are on heads and only their frame wanders; the others are carried,
    // and the rim taking a dunk is felt in all of them)
    const carried = kind === 'side' || kind === 'low' ? 1 : 0;
    let fv = s.fov;
    let px = s.px + carried * d.hand(0, HAND);
    let py = s.py + carried * d.hand(1, HAND * 0.7) - d.bump(kind === 'low' ? 0.2 : 0.4);
    let pz = s.pz + carried * d.hand(2, HAND);
    const wander = (OPERATOR * Math.hypot(s.lx - s.px, s.ly - s.py, s.lz - s.pz)) / 90;
    let lx = s.lx + d.drift(1, wander);
    let ly = s.ly + d.drift(2, wander * 0.45);
    let lz = s.lz + d.drift(0, wander * 0.3);
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
  private aimed = false;
  /** Everyone on the floor but `who` (x, z each), for a close-up's line of sight. */
  private others(who: Fig): Float32Array {
    const out = this.rest;
    let n = 0;
    for (const f of this.figs.values()) {
      if (f === who || n >= out.length) continue;
      out[n++] = f.pup.x;
      out[n++] = f.pup.z;
    }
    return out;
  }
  private readonly rest = new Float32Array(20);

  /** Into a replay or out of it: the next frame starts afresh (everyone on his spot, the ball where its move has it, a cut). */
  private recut() {
    this.lastScript = null;
    for (const k of this.planAt.keys()) this.planAt.set(k, [NOWHERE, NOWHERE]);
    // (the net and the rim are still; the end of a possession seen again doesn't sink the shot again)
    this.netKick = 1e-6;
    this.rimKick = 0;
    this.op.reset();
    this.flight = null;
    this.swatted = false;
    for (const c of this.cords) c.sim.reset();
    for (const h of [...this.hinges, ...this.sways]) h.still();
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

  /**
   * A tap on the picture at (x, y) (CSS pixels): on a man, he is tagged for a while (again: no longer), and
   * true. Not during a replay or a close-up (a tap there is the page's).
   */
  tap(x: number, y: number): boolean {
    if (this.director.phase !== 'off' || (this.shot !== 'main' && this.shot !== 'open')) return false;
    let best: number | null = null;
    let near = Infinity;
    for (const [pid, f] of this.figs) {
      const j = f.pup.j;
      const c = f.pup.world(j[J.chest * 3], j[J.chest * 3 + 1], j[J.chest * 3 + 2], TMP);
      const at = this.screen(A.set(c.x, c.y, c.z));
      const feet = this.screen(A.set(c.x, 0, c.z));
      // (within his height on the page, or a finger's width of him when he is small on it)
      const d = Math.hypot(at.x - x, (at.y - y) * 0.6);
      if (d < Math.max(PICK_PX, (feet.y - at.y) * 0.55) && d < near) [near, best] = [d, pid];
    }
    if (best === null) return false;
    this.picked = this.picked === best && this.pickMs < PICK_MS ? null : best;
    this.pickMs = 0;
    return true;
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
    this.arena.sideline.dispose();
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

/** An open man has nobody of theirs within this far of him (ft). */
const OPEN_FT = 9;
/** Of the men at spots `from`..`to` (pairs of x, z; where his body is, once he has one), the nearest to spot `j`, if he is within reach of him. */
function nearestOf(
  spots: ArrayLike<number>,
  j: number,
  from: number,
  to: number,
  body: (k: number) => { x: number; z: number; placed: boolean } | undefined,
): { x: number; z: number } | undefined {
  let best = 6;
  let at: { x: number; z: number } | undefined;
  for (let k = from; k < to; k++) {
    const b = body(k);
    const x = b?.placed ? b.x : spots[k * 2];
    const z = b?.placed ? b.z : spots[k * 2 + 1];
    const d = Math.hypot(x - spots[j * 2], z - spots[j * 2 + 1]);
    if (d < best) [best, at] = [d, { x, z }];
  }
  return at;
}
