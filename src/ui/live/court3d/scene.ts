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
  DoubleSide,
  FrontSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import { BASKET, COURT_LEN, faceWorld, toWorld, type Act, type Flash, type Pt } from '../choreo';
import { FLOOR_L, FLOOR_W, type Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import { Arena, LAMPS } from './arena';
import { DUNK_AT } from './clips';
import { Fig, figureGeo, type Geo } from './figure';
import type { Models } from './models';
import { buildProps } from './props';
import { BALL_R, J, type Body, type V3 } from './puppet';
import { clearOf, passPath, Spacing, swerve, type PassPath } from './spacing';

export interface SceneProps {
  kits: [MatchKit, MatchKit];
  jersey: (pid: number) => string;
  body: (pid: number) => Body;
  names?: (pid: number) => string;
  hot?: ReadonlySet<number>;
  /** The colours of the building: the boards along the far side, the warning ring. */
  board: string;
  warn: string;
  /** The game is over: the side that won it (they celebrate, the others don't). */
  final?: 0 | 1;
}

/** What the page writes over the picture this frame (in CSS pixels). */
export interface Labels {
  tag: { x: number; y: number; text: string } | null;
  flash: { x: number; y: number; text: string; kind: Flash['kind']; alpha: number } | null;
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
/** The play runs no faster than this against the clock for a cut-in (at 4x there is no time for one). */
const CUT_PACE = 1.1;
/** How much of their light the stands keep behind a close-up: the picture is the player, not the crowd behind him. */
const CUT_DIM = 0.18;
/** And the benches while a play is on: the men on the floor by the far sideline stand out from their own bench. */
const BENCH_DIM = 0.5;
/** And from the low camera at a free throw, which looks along them. */
const FT_BENCH = 0.24;
/** At the buzzer each man takes it in in his own time: the last of them this long (ms) after the first. */
const BUZZER_MS = 900;
/** A body's trunk is this thick (ft from its middle, on the 6 ft 6 puppet): a ball in the air stays outside it. */
const TRUNK = 0.5;
/** And out of heads: a head's (on the 6 ft 6 puppet), and how far off a body the ball starts to give way (ft). */
const SKULL = 0.42;
const GIVE = 0.4;
/** A pass is in the two men's hands at its ends: it gives way to the bodies it goes by only past this much of its way from either. */
const HANDS = 0.2;
/** And it gives way over this long (ms), not in a frame: a pass bends round a man, it doesn't hop off him. */
const BEND_MS = 80;
/** A loose ball is moved off a body at this speed at most, ft a second: it rolls off him, it doesn't jump. */
const BALL_PUSH = 14;
/** Steps aside may run this much faster than the clock when the game does: slower and the bodies meet, faster and they jump. */
const ASIDE_PACE = 1.5;
/** A possession whose first spot for a man is this far (ft) from where the last frame had him doesn't pick up from it: everyone is put on his spot. */
const FRESH = 2.5;

/**
 * What the floor's varnish adds to a plain lit one: a hot spot under each bank of lights, long toward
 * the camera. (The lights are set for the figures: the floor takes a little less of them, so its
 * paint stays the colour it was painted.)
 */
const VARNISH = /* glsl */ `
  #include <lights_fragment_end>
  {
    reflectedLight.directDiffuse *= 0.78;
    reflectedLight.indirectDiffuse *= 0.78;
    vec3 toEye = normalize(vViewPosition);
    for (int i = 0; i < ${LAMPS.length}; i++) {
      vec3 toLamp = normalize((viewMatrix * vec4(uLamps[i], 1.0)).xyz + vViewPosition);
      float s = max(dot(normal, normalize(toLamp + toEye)), 0.0);
      reflectedLight.directSpecular += vec3(1.0, 0.95, 0.86) * (0.4 * pow(s, 420.0) + 0.03 * pow(s, 48.0));
    }
  }`;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** A point on the court, in the scene: x along the floor, z across it (toward the camera). */
const sx = (p: Pt) => p.y - MID;
const sz = (p: Pt) => -p.x;

const A = new Vector3();
const TMP: V3 = { x: 0, y: 0, z: 0 };
const TMP2: V3 = { x: 0, y: 0, z: 0 };

export class CourtScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1.3, 4, 700);
  private readonly geo: Geo;
  private readonly mats = new Map<string, Material>();
  private readonly arena: Arena;
  private readonly key: DirectionalLight;
  private readonly sky: HemisphereLight;
  private readonly bounce: DirectionalLight;
  private bounced: CanvasTexture | null = null;
  private readonly figs = new Map<number, Fig>();
  private readonly trash: { dispose(): void }[] = [];
  private readonly floorMat: MeshStandardMaterial;
  private floorTex: CanvasTexture | null = null;
  private readonly ballMesh: Object3D;
  private readonly ballShadow: Mesh;
  private readonly nets: Object3D[] = [];
  private readonly rims: Object3D[] = [];
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
  // free throws: the frames of this script a man shoots them in
  private ftAt: number[] = [];
  // the main camera, looking nearer for a ball on the near side and higher for one in the air
  private dip = 0;
  private lift = 0;
  private netKick = 0;
  private rimKick = 0;
  private focus: number | null = null;
  // the camera on now, how long it has been (ms), how long there has been nothing to follow, how far it has pushed in
  private shot: 'main' | 'ft' | 'wide' | 'close' = 'main';
  private shotMs = 0;
  private idleMs = 0;
  private push = 0;
  private ftEnd = 0;
  // a cut-in: the one asked for (and how long ago, ms), who it's on, the move it was asked in, where its camera is and looks
  private cue: 'close' | null = null;
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

  constructor(canvas: HTMLCanvasElement, ballFill: string, ballSeam: string, models: Models) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default' });
    this.renderer.setClearColor(0x0c0c0d);
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    const keep = <T extends { dispose(): void }>(o: T): T => (this.trash.push(o), o);
    this.geo = figureGeo(keep, models.figure);

    // light: an arena's, from high over the floor (it throws the shadows), a little from behind for an edge,
    // and what comes back up off the wood onto the undersides of things (its colour is the floor's: see frame)
    this.sky = new HemisphereLight(0xffffff, 0x9a7d5e, 1.5);
    this.scene.add(this.sky);
    this.scene.add(new AmbientLight(0xffffff, 0.3));
    this.bounce = new DirectionalLight(0xc89a66, 0.55);
    this.bounce.position.set(0, -40, 14);
    this.scene.add(this.bounce);
    const key = new DirectionalLight(0xfff6ea, 2.1);
    key.position.set(30, 84, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -FLOOR_L / 2 - 4;
    sc.right = FLOOR_L / 2 + 4;
    sc.top = FLOOR_W / 2 + 6;
    sc.bottom = -FLOOR_W / 2 - 6;
    sc.near = 20;
    sc.far = 140;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.04;
    // (a soft edge, and not black: a building has more lights than this one)
    key.shadow.radius = 5;
    key.shadow.intensity = 0.8;
    this.key = key;
    this.scene.add(key);
    // (an edge, not an outline: any stronger and a green kit gets a lime line round it)
    const rim = new DirectionalLight(0xe4e8f4, 0.42);
    rim.position.set(-24, 40, -70);
    this.scene.add(rim);

    // the floor as the 2D court paints it, lit: varnished wood that takes the shadows and the lights' hot spots
    const ground = new Mesh(keep(new PlaneGeometry(520, 420)), keep(new MeshBasicMaterial({ color: 0x0e0e0f })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    this.scene.add(ground);
    this.floorMat = keep(new MeshStandardMaterial({ color: 0xdcae76, roughness: 0.85, metalness: 0 }));
    this.floorMat.onBeforeCompile = (sh) => {
      sh.uniforms.uLamps = { value: LAMPS.map((l) => new Vector3(...l)) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uLamps[${LAMPS.length}];`)
        .replace('#include <lights_fragment_end>', VARNISH);
    };
    this.floorMat.customProgramCacheKey = () => 'floor';
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
      const { group, rim, net } = props.basket();
      // (built for the basket at the low end, facing up the floor; the other is turned round)
      group.position.set(end * (MID - BASKET.y), 0, 0);
      if (end > 0) group.rotation.y = Math.PI;
      this.rims.push(rim);
      this.nets.push(net);
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

  /** A plain colour on a figure (the model's own shading is under it); `both` shows a cloth's inside too. */
  private mat = (color: string, rough = 0.7, both = false): Material => {
    const key = `${color}/${rough}/${both}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ color: new Color(color), roughness: rough, metalness: 0, vertexColors: true, side: both ? DoubleSide : FrontSide });
      this.mats.set(key, m);
    }
    return m;
  };

  /** A device that can't keep up: no shadows thrown, no mirror in the floor. */
  lite(on: boolean) {
    this.key.castShadow = !on;
    this.arena.lite(on);
  }

  /** What comes back up off the floor is the floor's colour (kept warm: it is mostly wood). */
  private warm(floor: CanvasTexture) {
    const one = document.createElement('canvas');
    one.width = one.height = 1;
    const ctx = one.getContext('2d')!;
    ctx.drawImage(floor.image as HTMLCanvasElement, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const c = this.sky.groundColor.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
    c.setRGB(c.r * 0.6 + 0.132, c.g * 0.6 + 0.084, c.b * 0.6 + 0.044);
    this.bounce.color.copy(c);
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
    this.camera.aspect = w / h;
  }

  private fig(pid: number, side: 0 | 1, p: SceneProps): Fig {
    let f = this.figs.get(pid);
    if (f && f.side !== side) {
      this.drop(pid, f);
      f = undefined;
    }
    if (!f) {
      // (his hair is one of a few crops, his own every night: no likeness, only so ten men are not one man)
      f = new Fig(this.geo, this.mat, p.body(pid), side, p.kits[side], p.jersey(pid), (pid * 7 + (pid >> 3)) | 0, p.names?.(pid));
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
    // (new kits: everyone is dressed again)
    const kitKey = p.kits.map((k) => k.token.fill + k.token.ring + k.token.num).join();
    if (kitKey !== this.kitKey) {
      this.kitKey = kitKey;
      for (const [pid, f] of [...this.figs]) this.drop(pid, f);
      this.arena.dress(p.kits);
    }
    this.arena.paint(p.board);
    this.arena.update(real, calm);
    const sc = stage.script;
    const play = stage.play;
    const ball = this.ball;
    const seen = new Set<number>();
    const labels: Labels = { tag: null, flash: null };
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
    // (where the page's words go: found now, put on the picture once the camera is aimed)
    let tagAt: { x: number; z: number; text: string } | null = null;
    let flashAt: { x: number; z: number; fl: Flash; alpha: number } | null = null;

    const started = sc !== this.lastScript;
    if (started) {
      this.lastScript = sc;
      this.scriptN++;
      this.ftAt = [];
      sc?.frames.forEach((f, k) => f.act.includes('ft') && this.ftAt.push(k));
    }

    if (sc && play) {
      const nO = sc.oPids.length;
      const a = play.a;
      const b = play.b;
      const rimPt = toWorld(BASKET, sc.dir);
      const rim = { x: sx(rimPt), z: sz(rimPt) };
      rimEnd = rim.x < 0 ? 0 : 1;
      const carried = play.carried ? (a.hold as number) : -1;
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
      pids.forEach((pid, j) => {
        const side = (j < nO ? sc.off : 1 - sc.off) as 0 | 1;
        const f = this.fig(pid, side, p);
        const act = over(pid, side, b.act[j]);
        f.pup.update(
          {
            x: spots[j * 2],
            z: spots[j * 2 + 1],
            yaw: Math.PI - faceWorld(b.face[j], sc.dir),
            act,
            ms: play.ms,
            dur: play.dur,
            ball: j === carried,
            aim: AIMED.has(act) ? rim : undefined,
            cut,
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
        this.bend.x = this.bend.z = 0;
        if (fresh) {
          const start = toWorld(sc.frames[0].ball, sc.dir);
          if (cut || Math.hypot(ball.x - sx(start), ball.z - sz(start)) > 12) ball.set(sx(start), BALL_R, sz(start));
        }
        this.from.copy(ball);
        this.vy = 0;
      }
      const lu = play.dur > 0 ? clamp(play.ms / play.dur, 0, 1) : 1;
      const was = a.hold !== undefined && a.hold >= 0 ? figs[a.hold] : null;
      const next = b.hold !== undefined && b.hold >= 0 ? figs[b.hold] : null;
      if (was) hands.add(was);
      if (next) hands.add(next);
      if (carried >= 0) {
        holder = figs[carried];
        set(ball, holder.pup.carry(TMP));
      } else if (b.fx) {
        const one = was?.pup.one;
        if (was && one?.id === 'dunk' && !this.slammed) {
          // a dunk: it stays in his hands to the rim
          set(ball, was.pup.carry(TMP));
          holder = was;
          if (one.tau >= DUNK_AT) {
            this.slammed = true;
            ball.set(rim.x, RIM_H - 0.2, rim.z);
            this.vy = -20;
            if (b.fx === 'make') {
              this.netKick = 1;
              this.arena.cheer(p.kits[sc.off].light ? 1 : 0.3);
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
        } else {
          // a shot: up from his hand, over the top and down at the rim (through it, or off the iron)
          const peak = (b.ballZ ?? 6) * 0.62;
          const made = b.fx === 'make';
          const T = made ? 0.86 : 1;
          const w = Math.min(1, lu / T);
          let ex = rim.x;
          let ez = rim.z;
          if (!made) {
            const dx = this.from.x - rim.x;
            const dz = this.from.z - rim.z;
            const d = Math.hypot(dx, dz) || 1;
            ex += (dx / d) * 0.78;
            ez += (dz / d) * 0.78;
          }
          const top = RIM_H + 0.3;
          // (once it has landed it is its own: it drops out of the net to the floor, or comes off the iron)
          if (this.landed) free = true;
          else {
            ball.set(this.from.x + (ex - this.from.x) * w, this.from.y + (top - this.from.y) * w + 4 * peak * w * (1 - w), this.from.z + (ez - this.from.z) * w);
            if (made && lu > T) {
              ball.y = top - ((lu - T) / (1 - T)) * 2.7;
              if (!this.netKick && !calm) {
                this.netKick = 1;
                this.arena.cheer(p.kits[sc.off].light ? 0.8 : 0.25);
              }
            }
            if (lu >= 1) {
              this.landed = true;
              if (!made && !this.rimKick && !calm) this.rimKick = 1;
              // (it leaves the net as fast as it went through it, in the bodies' time; off the iron it pops up)
              const pace = own > 0 && dt > 0 ? dt / own : 1;
              this.vy = made ? -clamp((2.7 / Math.max(0.03, ((1 - T) * play.dur) / 1000)) * pace, 8, 30) : 7;
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
        const arc = Math.max(this.path.lob, Math.min(1.8, far * 0.05) + (next ? 0 : Math.min(1.5, far * 0.1)));
        const side = swerve(this.path, lu);
        ball.set(
          this.from.x + (to.x - this.from.x) * lu + this.path.bx * side,
          this.from.y + (to.y - this.from.y) * lu + 4 * arc * lu * (1 - lu),
          this.from.z + (to.z - this.from.z) * lu + this.path.bz * side,
        );
        // (kept out of the bodies it goes by: eased, and not at all in the hands at either end)
        const px = ball.x;
        const pz = ball.z;
        this.clear(was, next);
        const k = 1 - Math.exp(-ease / BEND_MS);
        this.bend.x += (ball.x - px - this.bend.x) * k;
        this.bend.z += (ball.z - pz - this.bend.z) * k;
        // (an end with no hands at it, a ball coming off the rim or going to the floor, is not held to its line)
        const open = smooth(clamp(Math.min(was ? lu : 1, next ? 1 - lu : 1) / HANDS, 0, 1));
        ball.x = px + this.bend.x * open;
        ball.z = pz + this.bend.z * open;
        if (lu >= 1) {
          if (next) holder = next;
          else free = true;
        }
      }
      this.heldBy = holder ? (sc.oPids.concat(sc.dPids)[figs.indexOf(holder)] ?? null) : null;

      // what the page writes over the picture: the handler's name, the play's label
      const hold = play.u >= 0.5 ? b.hold : a.hold;
      if (p.names && hold !== undefined && hold >= 0 && figs[hold]) {
        const f = figs[hold];
        const pid = hold < nO ? sc.oPids[hold] : sc.dPids[hold - nO];
        tagAt = { x: f.pup.x, z: f.pup.z, text: p.names(pid) };
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
      for (let j = 0; j < n; j++) {
        const st = stage.standers[j];
        const f = this.fig(st.pid, st.side, p);
        const x = at[j * 2];
        const z = at[j * 2 + 1];
        const has = st.pid === this.heldBy;
        const act = over(st.pid, st.side, has ? 'hold' : 'stand');
        f.pup.update({ x, z, yaw: f.pup.placed ? f.pup.yaw : Math.atan2(-x, -z), act, ms: 0, dur: 0, ball: has, cut }, dt, own, ease);
        seen.add(st.pid);
        if (has) holder = f;
      }
      if (holder) {
        hands.add(holder);
        set(ball, holder.pup.carry(TMP));
      } else {
        this.heldBy = null;
        if (stage.ball && Math.hypot(ball.x - sx(stage.ball), ball.z - sz(stage.ball)) > 14) ball.set(sx(stage.ball), BALL_R, sz(stage.ball));
        free = true;
      }
    }
    // loose, it falls and bounces
    if (free && sec > 0) {
      this.vy -= G * sec;
      ball.y += this.vy * sec;
      // (off whoever it comes down on, once it is where it fell to)
      this.clear(null, null, BALL_PUSH * sec);
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        this.vy = Math.abs(this.vy) > 5 ? -this.vy * 0.5 : 0;
      }
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

    // the ball turns as it travels; its shadow stays on the floor
    const moved = this.ballMesh.position.distanceTo(ball);
    this.ballMesh.position.copy(ball);
    if (!calm && moved < 20) this.ballMesh.rotation.x += moved * 1.1;
    this.ballShadow.position.set(ball.x, 0.035, ball.z);
    this.ballShadow.scale.setScalar(1 / (1 + ball.y * 0.07));
    // the net takes a made shot, the rim a miss
    this.netKick = Math.max(0, this.netKick - own / 420);
    this.rimKick = Math.max(0, this.rimKick - own / 380);
    // (the net stretches down more than it narrows: its loops stay on the ring. The rim tips on its hinge at the board, and the net hangs from it)
    this.nets.forEach((n, i) => {
      const k = i === rimEnd ? this.netKick : 0;
      const tip = i === rimEnd ? Math.sin(this.rimKick * 18) * this.rimKick * 0.07 : 0;
      n.scale.set(1 - k * 0.05, 1 + k * 0.4, 1 - k * 0.05);
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
    // whistle was for (a timeout has none: the benches are not built for a close look). `quiet`: nothing is being played that a cut-in would hide
    let quiet = true;
    if (sc && play) {
      const fl = play.b.flash ?? null;
      const news = fl !== this.flashed ? fl : null;
      const made = play.b.fx === 'make' && this.netKick > this.kicked;
      if (made) this.scorer = [...sc.oPids, ...sc.dPids][play.a.hold ?? -1] ?? null;
      let cue: 'close' | null = null;
      let on: number | null = null;
      if (made && !line && (this.slammed || fl?.text === '+3' || sc.moment)) {
        cue = 'close';
        on = this.scorer;
      } else if (news && (news.kind === 'foul' || news.text === 'And one!')) {
        cue = 'close';
        on = this.heldBy ?? (news.kind === 'make' ? this.scorer : null);
      }
      const timely = real > 0 && dt <= real * CUT_PACE && (this.cutGap > CUT_GAP || !!sc.moment);
      if (cue && timely && on !== null && this.figs.has(on)) {
        this.cue = cue;
        this.cueMs = 0;
        this.star = on;
        this.cutKey = this.moveKey;
        this.cutN = this.scriptN;
      }
      this.flashed = fl;
      // (the move it was asked in, a dead ball, and the ball being walked up to start the next possession)
      quiet = this.moveKey === this.cutKey || play.b.act.every((a) => a === 'stand' || a === 'hold') || (this.scriptN === this.cutN + 1 && play.i <= 1);
    }
    this.kicked = this.netKick;

    this.aim(stage, real, calm, line, near, quiet);
    this.camera.updateMatrixWorld();
    if (tagAt) {
      const t: { x: number; z: number; text: string } = tagAt;
      const at = this.screen(A.set(t.x, 0, t.z));
      labels.tag = { x: at.x, y: at.y, text: t.text };
    }
    if (flashAt) {
      const f: { x: number; z: number; fl: Flash; alpha: number } = flashAt;
      const at = this.screen(A.set(f.x, 7.5, f.z));
      labels.flash = { x: at.x, y: at.y, text: f.fl.text, kind: f.fl.kind, alpha: f.alpha };
    }
    this.renderer.render(this.scene, this.camera);
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
  /** How far the pass in the air is bent off its line by the bodies it goes by (x, z). */
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
   * The broadcast: the main camera high on the near sideline, turning with the ball and pushing in
   * as it gets to the basket; a low camera past the baseline for free throws; the whole building
   * from a corner when there is nothing to follow; and cut-ins while nothing is being played: low and
   * tight on the scorer of a big basket or the man a whistle was for, the stands behind him dimmed. It cuts
   * between them, never more often than HOLD_MS. Reduced motion: one camera, the whole floor, held still.
   */
  private aim(stage: Stage, real: number, calm: boolean, line: boolean, near: number, quiet: boolean) {
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
    this.idleMs = live ? 0 : this.idleMs + real;
    this.shotMs += real;
    this.cutGap += real;
    this.cueMs += real;
    // (a cut-in that couldn't be taken when it was asked for is not taken late)
    if (this.cue && this.cueMs > 250) this.cue = null;
    const who = this.star === null ? undefined : this.figs.get(this.star);
    const cut = this.shot === 'close';
    // a cut-in is over when it has had its time, when the play goes on, or when he has left the floor
    const over = cut && (this.shotMs > CUT_MS || !quiet || !who);
    const want = cut && !over ? this.shot : line ? 'ft' : (this.cue ?? (this.idleMs > WIDE_AFTER ? 'wide' : live || this.shot !== 'wide' ? 'main' : 'wide'));
    // (the play starting again takes the picture back from the building at once; every other camera has its HOLD_MS)
    if (want !== this.shot && (this.shotMs > HOLD_MS || (want === 'main' && this.shot === 'wide'))) {
      this.shot = want;
      this.shotMs = 0;
      this.focus = null;
      if (want === 'close') {
        this.cue = null;
        this.cutGap = 0;
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
      cam.position.copy(this.seat);
      cam.lookAt(this.look);
      cam.updateProjectionMatrix();
      return;
    }
    const tall = aspect < 1.6;
    if (this.shot === 'ft') {
      // low, past the baseline and off to the near side: the shooter at his line, the building behind him
      const e = this.ftEnd;
      // (it looks between him and the rim, and never so flat a frame that the board or his feet are cut off)
      cam.fov = Math.max(24, fov(tall ? 32 : 40));
      cam.position.set(e * (MID + 12), 10, 28);
      cam.lookAt(e * (MID - 12.5), 6.9, -2);
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
    this.push += (near - this.push) * (1 - Math.exp(-real / 420));
    cam.fov = fov((tall ? 35 : 46) - this.push * (tall ? 3 : 5));
    // (a ball by the near sideline: the picture may go farther along the floor to keep its man in it)
    const reach = (tall ? 30 : 24) + clamp(this.ball.z, 0, 25) * 0.36;
    const sc = stage.script;
    let to = this.ball.x;
    // (most of the picture ahead of the ball, toward the basket it's going at)
    if (sc && stage.play) to += (sc.dir === 1 ? -1 : 1) * (tall ? 7 : 4);
    to = clamp(to, -reach, reach);
    const jump = this.focus === null || Math.abs(to - this.focus) > 60;
    this.focus = jump ? to : this.focus! + (to - this.focus!) * (1 - Math.exp(-real / 260));
    // it looks nearer for a ball on the near side (a man in the near corner keeps his feet in the picture),
    // and a little higher for one in the air (a long shot stays in it at the top)
    const dip = clamp((this.ball.z - 8) * 0.8, 0, 12);
    const lift = clamp((this.ball.y - 9) * 0.7, 0, 5);
    this.dip = jump ? dip : this.dip + (dip - this.dip) * (1 - Math.exp(-real / 380));
    this.lift = jump ? 0 : this.lift + (lift - this.lift) * (1 - Math.exp(-real / 220));
    cam.position.set(this.focus * 0.78, 33, 60);
    cam.lookAt(this.focus, this.lift, (tall ? -6 : -4) + this.dip);
    cam.updateProjectionMatrix();
  }

  /** A point of the scene on the page (CSS pixels). */
  private screen(v: Vector3): { x: number; y: number } {
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  dispose() {
    for (const [pid, f] of [...this.figs]) this.drop(pid, f);
    for (const m of this.mats.values()) m.dispose();
    for (const o of this.trash) o.dispose();
    this.floorTex?.dispose();
    this.renderer.dispose();
  }
}

function set(v: Vector3, p: V3) {
  v.set(p.x, p.y, p.z);
}

export { loadModels } from './models';
