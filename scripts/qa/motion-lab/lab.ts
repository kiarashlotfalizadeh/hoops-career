/// <reference lib="dom" />
// A bench for the figures' motion (dev server only): a real game, simulated here, played through the real
// 3D scene on a clock of its own (60 frames a second, nothing waits for the screen), measured, and filmed.
//   lab.measure({ speed: 2 })     the whole game at a speed chip: planted feet that slide, hips that sink on a
//                                 run, bodies inside each other, the ball inside a body, pops and snapping turns
//                                 (breaks: true holds a dead ball at each period's end and before each timeout, as
//                                 the live page does: the men walk to their benches and back)
//                                 and `limbs`: hands that pop (by what he was doing: in a move, after one, the ball
//                                 taken or let go), knees that snap or kink, hips that bob, strides that change in a
//                                 frame, an arm, a leg or a head inside another man (`limbs.arms`: arm bones turning faster
//                                 than an arm is swung, elbows the wrong way round or shut, wrists on the ball bent or
//                                 twisted past a wrist's: see ARM_FAST; free wrists held dead straight or past a wrist's,
//                                 and how far they hang toward the palm: WRIST_DEAD; hanging arms folded back at the
//                                 elbow: BACK_DOWN); `limbs.catch`: each pass as it gets to him, his hands not out to meet
//                                 it a beat before, snapped onto it, or not on it (CATCH_LATE); `knocks`: bodies knocked off
//                                 each other (Puppet.hit);
//                                 `worst`: the worst of each kind as
//                                 `k t pid`, to film (`only: 'jumper'` keeps just those). A pop must stand out from both
//                                 its neighbour frames, at the speed chip's size (see POP_RATIO); the frames the picture
//                                 cuts on are skipped; and what pops while the plan has a man going faster than a man
//                                 runs (FASTEST) is counted apart, as `tooFast`. Film what `worst` names from a measure
//                                 with breaks off (the film plays the game without them), with `lead` past k. `final: true, hold: 8000`:
//                                 only the end of the game, the buzzer held 8 s (with ?occasion, a celebration)
//   lab.gait({ speed: 2, only })  his legs against his travel: how fast men go (ft a second, the bodies' time), each step's
//                                 length × cadence against how far he went, by speed; feet that slide or skip; starts, stops
//                                 and an even run (lean, hips, steps against an even run's); how much of a cut's turn is
//                                 made over a planted foot; the head's and the whole pose's pops, the worst to film
//   lab.ballArms({ speed, off })  the frames a man has the ball (not his) in his upper arm, forearm or hand, by part and clip
//   lab.when('pull')              where in the game a man goes into that clip, or makes that gesture
//   lab.find('dunk')              the possessions with a man doing that (act), and when
//   lab.film({ k, pid, from, to, every, eye, fov })   a strip of moments of possession k, a camera on one man
//                                 (eye: where the camera is from him, ft; 'tv': the broadcast's own; faced: round from
//                                 the way he faces, for a close look at his hands that stays on them as he turns)
//                                 (k: 0 with `tip`: from both fives waiting round the circle for the opening tip)
//   lab.pose({ drive, n, from, to })   one move side by side at moments of it, at centre court (toss: a pass thrown
//                                 to him through his 'catch', from [x, y, z] ft off him)
//   lab.solo({ drive, from, to })  one man on his own, no body drawn: his clip, pose channels and hands, frame by frame
//   lab.feet({ speed: 2 })        his shoes as the body draws them, on the floor: the heel's and the ball's travel while
//                                 they are down (a slide), a flat shoe's turn on the floor (a spin), a sole in the floor,
//                                 a planted foot off it (a skip), steps a second; by what the plan has him doing
//                                 (box-out, crash, rebound, landing, contact, ...) and by clip; `worst` to film
//   lab.footwork({ speed: 2 })    his footwork as the puppet plans it: travels holding the ball (both feet stepped, not on a
//                                 pivot), which foot each jump leaves the floor off (a layup off the foot opposite his hand),
//                                 a slide's lead and trail steps and clicked feet, a box-out's base, feet thrown in a frame
//   lab.footTrace({ k, pid, from, to })   one man's footwork frame by frame: his move, the plan's speed, how he is set
//                                 (pivot, load, hop, the foot timed to a jump), how far off the plan's spot, each foot
//   ?seed=n&home=n&away=n picks the game. ?side=0: nobody round the floor. ?occasion=late|playoff|clinch|title: the kind of win at the buzzer.
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, SphereGeometry, Vector3, type Bone, type Camera, type Scene, type WebGLRenderer } from 'three';
import { createLeague, defaultSettings } from '../../../src/core/league/create';
import { teamPlayers } from '../../../src/core/league/helpers';
import { composites } from '../../../src/core/ratings';
import { Rng } from '../../../src/core/random';
import { GameSim } from '../../../src/core/sim/engine';
import { buildScript, COURT_LEN, standing, tipSpots, type Act, type Script, type Standing } from '../../../src/ui/live/choreo';
import { emptyStage, paintFloor, pose as poseAt, readPaints, type CourtFloor, type Stage } from '../../../src/ui/live/Court';
import { I } from '../../../src/ui/live/court3d/clips';
import { Fig, type Geo } from '../../../src/ui/live/court3d/figure';
import { BALL, BALL_R, bodyOf, elbowPole, HEEL, HIP, J, Puppet, type Drive, type V3 } from '../../../src/ui/live/court3d/puppet';
import type { Gesture } from '../../../src/ui/live/court3d/clips';
import { CourtScene, loadModels } from '../../../src/ui/live/court3d/scene';
import { ballIn, clearance, into, PARTS, SHAPES, sunk } from '../../../src/ui/live/court3d/spacing';
import { matchKits } from '../../../src/ui/teamColors';
import type { Occasion } from '../../../src/ui/live/occasion';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
/** The 3D court's pace (CourtView's COURT3D_PACE), and the 2D court's tail after a possession's last frame (ms). */
const PACE = 0.5;
const TAIL = 180;
const FRAME = 1000 / 60;
/** How long both fives wait round the centre circle before the opening tip (real ms). */
const TIP_WAIT = 1600;
/** With `breaks`: how long a period's break and a huddle before a timeout are held (real ms). */
const BREAK_MS = 6000;

// (each knock a man's body takes from another's (Puppet.hit), and how many of them hard: see measure's `knocks`)
const knocked = { n: 0, hard: 0, at: [] as string[] };
let stamp = () => '';
const hitWas = Puppet.prototype.hit;
Puppet.prototype.hit = function (this: Puppet, dx: number, dz: number, power: number) {
  knocked.n++;
  if (power > 0.6) knocked.hard++;
  if (power > 0.4 && knocked.at.length < 40) knocked.at.push(`${stamp()} p${(this as unknown as { who: number }).who} ${this.clip} ${power.toFixed(2)}`);
  hitWas.call(this, dx, dz, power);
};

// the game
const league = createLeague({ name: 'lab', userTid: 0, coachName: 'lab', settings: defaultSettings(), seed: null, rngSeed: num('league', 17) });
const H = num('home', 4);
const AW = num('away', 9);
const sim = new GameSim(
  { team: league.teams[H], players: teamPlayers(league, H) },
  { team: league.teams[AW], players: teamPlayers(league, AW) },
  { rng: new Rng(num('seed', 11)), type: 'regular', record: true, injuries: false },
);
const info = (pid: number) => {
  const p = league.players[pid];
  const c = p ? composites(p.ratings) : null;
  return { pid, hgt: p?.ratings.hgt ?? 50, shoot: c?.c3 ?? 50, handle: c?.pnrHandle ?? 50 };
};
const teams: [string, string] = [league.teams[H].abbrev, league.teams[AW].abbrev];
const nameOf = (pid: number) => league.players[pid]?.lastName ?? '';
const scripts: Script[] = [];
let stand: { at: Standing; q: number } | undefined;
let before: [number, number] = [0, 0];
while (!sim.over) {
  sim.step();
  for (const l of sim.drainLogs()) {
    const sc = buildScript(l, info, before, teams, nameOf, undefined, stand?.q === l.q ? stand.at : undefined);
    before = [...l.score] as [number, number];
    stand = { at: standing(sc), q: l.q };
    if (sc.frames.length) scripts.push(sc);
  }
}
const winner: 0 | 1 = before[0] > before[1] ? 0 : 1;

// the scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
const paints = readPaints(canvas);
const kits = matchKits(league.teams[H].colors, league.teams[AW].colors);
const scene = new CourtScene(canvas, paints.ball, paints.ballSeam, await loadModels());
const floorCv = document.createElement('canvas');
const t0 = league.teams[H];
const floor: CourtFloor = { kind: 'home', abbrev: t0.abbrev, name: t0.name, colors: t0.colors, paint: kits[0].color, trim: kits[0].trim, mark: 'circle' };
paintFloor(floorCv, { wide: true, k: 12, w: 0, h: 0, top: 0, ox: 0, oy: 0 }, 1, floor, paints, true);
scene.setFloor(floorCv);
const props = {
  kits,
  jersey: (pid: number) => league.players[pid]?.jersey || '0',
  body: (pid: number) => {
    const p = league.players[pid];
    return bodyOf(p?.heightIn ?? 78, p?.weightLb ?? 215, p?.ratings.str);
  },
  names: nameOf,
  board: kits[0].color,
  warn: paints.warn,
  occasion: (q.get('occasion') ?? undefined) as Occasion | undefined,
};
const inner = scene as unknown as {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  figs: Map<number, Fig>;
  ball: Vector3;
  geo: Geo;
};
// (?side=0: the floor without the people round it, for when their models are being rebuilt under the lab)
if (q.get('side') === '0') (scene as unknown as { arena: { sideline: { update: () => void } } }).arena.sideline.update = () => {};
// (the frames the picture cuts on, into an instant replay and back: everyone is put on his spot there, and a pose
// that jumps is not seen move. Measured frames skip them)
const director = (scene as unknown as { director: { feed: (...a: unknown[]) => { cut: boolean } | null } }).director;
const feed = director.feed.bind(director);
let cutNow = false;
director.feed = (...a: unknown[]) => {
  const r = feed(...a);
  if (r?.cut) cutNow = true;
  return r;
};
const draw = inner.renderer.render.bind(inner.renderer);
// (measuring draws nothing: a game takes seconds, not its length)
let drawing = false;
inner.renderer.render = (s, c) => void (drawing && draw(s, c));

/** The game as the live page plays it: possession after possession, then the buzzer held. */
class Clock {
  k = 0;
  t = 0;
  finalMs = -1;
  /** How long the fives have stood round the circle for the tip (real ms); -1: the game starts on its first play. */
  tipMs = -1;
  /** With `breaks`: how long the dead ball has been held (real ms), -1 none; and whether the floor is empty of a play (a period's break). */
  breakMs = -1;
  empty = false;
  readonly stage: Stage = emptyStage();
  constructor(
    readonly speed: number,
    readonly calm = false,
    readonly breaks = false,
  ) {}
  /** One frame on (real ms). False once the buzzer has been held this long. */
  step(real = FRAME, hold = 3000): boolean {
    const st = this.stage;
    if (this.breakMs >= 0) {
      // (a period's break: no play on the floor, everyone where the last one left him; a huddle before a timeout: the play held at its end)
      this.breakMs += real;
      if (this.empty) {
        st.script = null;
        st.play = null;
      }
      scene.frame(st, props, 0, real, this.calm, real);
      if (this.breakMs >= BREAK_MS) {
        this.breakMs = -1;
        this.empty = false;
        this.k++;
        this.t = 0;
      }
      return true;
    }
    if (this.finalMs >= 0) {
      this.finalMs += real;
      scene.frame(st, { ...props, final: winner }, 0, real, this.calm, real);
      return this.finalMs < hold;
    }
    if (this.tipMs >= 0 && this.tipMs < TIP_WAIT && this.k === 0 && this.t === 0) {
      // (as the live page has them before the first play: round the circle, the ball in the referee's hands)
      this.tipMs += real;
      const at = tipSpots(scripts[0].off === 0 ? [scripts[0].oPids, scripts[0].dPids] : [scripts[0].dPids, scripts[0].oPids]);
      st.script = null;
      st.play = null;
      st.standers = [...at].map(([pid, p]) => ({ pid, side: (scripts[0].oPids.includes(pid) ? scripts[0].off : 1 - scripts[0].off) as 0 | 1, at: p }));
      st.ball = { x: 0, y: COURT_LEN / 2 };
      scene.frame(st, props, 0, real, this.calm, real * this.speed);
      return true;
    }
    const sc = scripts[this.k];
    const dt = real * this.speed * PACE;
    this.t += dt;
    const total = sc.frames.reduce((n, f) => n + f.dur, 0);
    if (this.t >= total + TAIL) {
      if (this.k + 1 >= scripts.length) {
        this.finalMs = 0;
        return true;
      }
      const next = scripts[this.k + 1];
      if (this.breaks && (next.q !== sc.q || next.frames.some((f) => f.flash?.text.startsWith('Timeout')))) {
        this.breakMs = 0;
        this.empty = next.q !== sc.q;
        return this.step(real, hold);
      }
      this.k++;
      this.t = 0;
      return this.step(real, hold);
    }
    const play = poseAt(sc, this.t, this.calm);
    st.script = sc;
    st.play = play;
    st.standers = [
      ...sc.oPids.map((pid, j) => ({ pid, side: sc.off, at: w(play.o[j], sc.dir) })),
      ...sc.dPids.map((pid, j) => ({ pid, side: (1 - sc.off) as 0 | 1, at: w(play.d[j], sc.dir) })),
    ];
    st.ball = w(play.ball, sc.dir);
    scene.frame(st, props, dt, real, this.calm, real * this.speed);
    return true;
  }
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const w = (p: { x: number; y: number }, dir: 1 | -1) => (dir === 1 ? { ...p } : { x: -p.x, y: 94 - p.y });

const seg = (p: Vector3, a: Vector3, b: Vector3) => {
  const ab = B0.subVectors(b, a);
  const t = Math.max(0, Math.min(1, B1.subVectors(p, a).dot(ab) / (ab.lengthSq() || 1)));
  return B2.copy(a).addScaledVector(ab, t).distanceTo(p);
};
const B0 = new Vector3();
const B1 = new Vector3();
const B2 = new Vector3();
const V = { x: 0, y: 0, z: 0 };
const at = (f: Fig, k: number, out: Vector3) => {
  const j = f.pup.j;
  f.pup.world(j[k * 3], j[k * 3 + 1], j[k * 3 + 2], V);
  return out.set(V.x, V.y, V.z);
};
/** Two shapes this far (ft) inside each other are counted (spacing.ts's shapes sit a little inside the skin). */
const HIT = 0.1;
/** A bone that turns this much more in one frame than in the frames either side of it has popped (radians); a heading that starts or stops turning by this much in a frame has snapped. */
const POP = 0.15;
const YAW_POP = 0.08;
/** The bones a pop is looked for in (joints of the puppet's J), and their names. */
const BONES: readonly [number, number][] = [
  [J.hips, J.chest],
  [J.chest, J.head],
  [J.sl, J.sr],
  [J.jl, J.jr],
  [J.sl, J.el],
  [J.el, J.hl],
  [J.sr, J.er],
  [J.er, J.hr],
  [J.jl, J.kl],
  [J.kl, J.fl],
  [J.jr, J.kr],
  [J.kr, J.fr],
];
const BONE_NAMES = ['spine', 'neck', 'shoulders', 'pelvis', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];
/**
 * A hand that moves this much farther (ft, from his own shoulder, in his own frame) in one frame than in the frames
 * either side of it has popped; a knee whose bend does that by this much (radians) has snapped; hips that do it by
 * this much (ft) have bobbed in a frame; feet that turn over this much quicker or slower (a share) in one frame
 * than the last have changed stride.
 */
const HAND_POP = 0.25;
const KNEE_POP = 0.15;
const HIP_POP = 0.06;
const CADENCE_JUMP = 0.3;
/** A hand pop this many frames after a move (a shot, a pass, a catch, a gesture) ends is that move's arm coming back. */
const AFTER = 24;
/** How many of the worst of each kind are kept to film. */
const TOP = 12;
/**
 * A frame's step counts as a pop only when it is also much bigger than both its neighbours (this many times the
 * bigger), or bigger than them by twice the pop; and the pop it must beat is as many times bigger as the speed chip
 * (a pop is a jump, the same size at any speed; a fast move steps that much farther a frame at 2x: a sprinter's
 * planted shin turns half a radian a frame there, and filmed it reads as fast, not as a pop). `raw` counts keep the
 * old rule, a spike at 1x's size alone.
 */
const POP_RATIO = 1.6;
/**
 * An arm's bone turning faster than this in his own frame (rad a second, the bodies' time) is faster than an arm is
 * swung (a hard pass's elbow straightens at about 20); an elbow folded tighter than ELBOW_SHUT (radians, between
 * upper arm and forearm) is shut through itself; an elbow whose point is more than ELBOW_WRONG (radians) off where
 * elbowPole would put it bends the wrong way round; a wrist on the ball bent more than WRIST_BEND off its forearm's
 * line, or turned round it more than WRIST_TWIST, is past what a wrist does (radians).
 */
const ARM_FAST = 30;
const ELBOW_SHUT = 0.45;
const ELBOW_WRONG = 2.0;
const WRIST_BEND = 1.35;
const WRIST_TWIST = 1.9;
/** A free hand whose wrist is bent less than this (radians) off its forearm's line is held dead straight. */
const WRIST_DEAD = 0.05;
/**
 * An elbow bent the wrong way round for the arm, as a viewer sees it (where the old rule, ELBOW_WRONG, also counts an
 * elbow forward under a ball held up, as a shooter's is): the upper arm down past BACK_DOWN (the share of it that
 * points down his spine) and the forearm folded back behind it, its fold more than BACK_FOLD of the way toward his back
 * (a hanging arm bent backward at the elbow), bent at least BACK_BENT radians.
 */
const BACK_DOWN = 0.3;
const BACK_FOLD = 0.7;
const BACK_BENT = 0.35;
/**
 * A catch (the moment a pass gets to him: his catch's own moment): a hand farther than CATCH_LATE ft off the ball
 * where it got to him, CATCH_EARLY ms (the bodies' time) before it did, was not out to meet it (still at his side, or
 * on its way there); a hand going faster than CATCH_SNAP ft a second over the frames before it came (not the frame it
 * comes into his hands and they go in with it) is snapped onto it.
 */
const CATCH_LATE = 1.0;
const CATCH_EARLY = 100;
const CATCH_SNAP = 14;
const AU = new Vector3();
const AV = new Vector3();
const AH = new Vector3();
const AE = new Vector3();
const AP = { x: 0, y: 0, z: 0 };
const AQ = new Quaternion();
const popped = (step: number, before: number, after: number, least: number) => {
  const spike = step - Math.max(before, after);
  return spike > least && (step > POP_RATIO * Math.max(before, after) || spike > 2 * least) ? spike : 0;
};
/** A knee that was straightening this fast (radians a frame) and folds in the next, or the other way, has kinked. */
const KINK = 0.4;
/** Faster than this (ft a second, the bodies' time) is faster than a man runs. */
const FASTEST = 32;
const HP = new Vector3();
const CH = new Vector3();
const HD = new Vector3();
const HL = new Vector3();
const HR = new Vector3();

/** How far a planted foot went along the floor from one frame to the next (ft): the less of its ball's and its heel's travel (x, z, down, heading each). */
const footSlid = (a: readonly (number | boolean)[], b: readonly (number | boolean)[], s: number) => {
  const at = (f: readonly (number | boolean)[], d: number, k: 0 | 1) => (f[k] as number) + (k ? Math.cos(f[3] as number) : Math.sin(f[3] as number)) * d * s;
  return Math.min(Math.hypot(at(a, BALL, 0) - at(b, BALL, 0), at(a, BALL, 1) - at(b, BALL, 1)), Math.hypot(at(a, -HEEL, 0) - at(b, -HEEL, 0), at(a, -HEEL, 1) - at(b, -HEEL, 1)));
};

/** The whole game at a speed chip, measured. */
function measure({ speed = 2, calm = false, slide = 0.05, breaks = false, only = '', hold = 3000, final = false } = {}) {
  const c = new Clock(speed, calm, breaks);
  c.tipMs = 0;
  [knocked.n, knocked.hard, knocked.at] = [0, 0, []];
  stamp = () => `k${c.k} t${Math.round(c.t)}`;
  // bodies and the ball inside each other (spacing.ts's shapes), pops (a bone that changes how fast it turns by
  // more than POP in a frame) and snapping turns (his heading, by more than YAW_POP)
  const ws = new Map<number, Float32Array>();
  const bones = new Map<
    number,
    { d: Float32Array; th: Float32Array; yaw: number; ys: number[]; clip: string; was: string; since: number; ok: number; x: number; z: number; label: string }
  >();
  const steps: number[] = [];
  const steadyWhy = new Map<string, number>();
  const turnAt: string[] = [];
  const yawAt: string[] = [];
  const hit = { trunk: 0, trunkMeet: 0, limbs: 0, deep: 0, ball: 0, deepest: 0, walk: 0, live: 0, dead: 0, meet: 0 };
  const meeting = (scene as unknown as { meeting: { i: number; j: number; w: number }[] }).meeting ?? [];
  const trunkWhy = new Map<string, number>();
  const trunkAt: string[] = [];
  const hitWhy = new Map<string, number>();
  const hitAt: string[] = [];
  const ballWhy = new Map<string, number>();
  const ballAt: string[] = [];
  const pop = { n: 0, steady: 0, raw: 0, tooFast: 0, max: 0, yawN: 0, yawMax: 0, turnMax: 0, bones: 0 };
  const popWhy = new Map<string, number>();
  const popAt: string[] = [];
  const yawWhy = new Map<string, number>();
  const detours = (scene as unknown as { arena: { sideline: { detours: Map<number, unknown> } } }).arena.sideline.detours;
  let pf = 0;
  let slid = 0;
  let slidFt = 0;
  let runs = 0;
  const hips: number[] = [];
  let pairs = 0;
  let deep = 0;
  let inBody = 0;
  let frames = 0;
  let headWhip = 0;
  let still = 0;
  let standing = 0;
  let heads = 0;
  let dunkOff = 0;
  const cases: string[] = [];
  const slides = new Map<string, number>();
  const whips = new Map<string, number>();
  const deeps = new Map<string, number>();
  const whipAt = new Map<string, number>();
  const deepAt: string[] = [];
  const last = new Map<
    number,
    { x: number; z: number; feet: [number, number, boolean, number][]; head: number; pose: Float32Array; air: number; yaw: number; twist: number; turn: number }
  >();
  const acts = new Map<string, number>();
  const gestures = new Map<string, number>();
  const making = new Map<number, string | null>();
  // the worst of each kind, to film (`k t pid what`): each man once in a possession
  const tops = new Map<string, { mag: number; at: string; key: string }[]>();
  // (`only`: just the ones whose line says it, a clip or a move)
  const top = (kind: string, mag: number, at: string, key: string) => {
    if (only && !at.includes(only)) return;
    let l = tops.get(kind);
    if (!l) tops.set(kind, (l = []));
    const same = l.findIndex((x) => x.key === key);
    if (same >= 0) {
      if (l[same].mag >= mag) return;
      l.splice(same, 1);
    }
    if (l.length >= TOP && l[l.length - 1].mag >= mag) return;
    l.push({ mag, at, key });
    l.sort((x, y) => y.mag - x.mag);
    if (l.length > TOP) l.pop();
  };
  const actOf = (pid: number) => {
    const sc = c.stage.script;
    const play = c.stage.play;
    return sc && play ? play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)] : '-';
  };
  // his arms: how fast each of their bones turns in his own frame (rad a second of the bodies' time: `rate`, a count
  // for each whole one), a bone faster than an arm is swung, an elbow bent the wrong way round (its point more than
  // ELBOW_WRONG off where elbowPole would put it) or folded shut, an elbow or a forearm in his own trunk, and a hand on
  // the ball (the body's own bones) bent at the wrist past WRIST_BEND or twisted round its forearm past WRIST_TWIST
  const arm = {
    n: 0,
    fast: 0,
    wrong: 0,
    shut: 0,
    own: 0,
    held: 0,
    bent: 0,
    twist: 0,
    free: 0,
    dead: 0,
    back: 0,
    freeBent: 0,
    freeTwist: 0,
    flex: 0,
    rate: new Uint32Array(80),
    why: new Map<string, number>(),
  };
  const armWas = new Map<number, Float32Array>();
  const armCheck = (pid: number, f: Fig, ok: number, where: string, label: string) => {
    const p = f.pup;
    const j = p.j;
    const s = p.body.s;
    let was = armWas.get(pid);
    if (!was) armWas.set(pid, (was = new Float32Array(12)));
    const sec = (FRAME * speed) / 1000;
    const axes = p as unknown as { left: { x: number; y: number; z: number }; front: { x: number; y: number; z: number } };
    const bones = (f as unknown as { bones: Bone[] }).bones;
    const tag = `${where} ${label}`;
    for (const [k, sh, el, ha] of [
      [0, J.sl, J.el, J.hl],
      [1, J.sr, J.er, J.hr],
    ] as const) {
      const side = k ? -1 : 1;
      const u = AU.set(j[el * 3] - j[sh * 3], j[el * 3 + 1] - j[sh * 3 + 1], j[el * 3 + 2] - j[sh * 3 + 2]).normalize();
      const v = AV.set(j[ha * 3] - j[el * 3], j[ha * 3 + 1] - j[el * 3 + 1], j[ha * 3 + 2] - j[el * 3 + 2]).normalize();
      arm.n++;
      for (const [o, d] of [
        [k * 6, u],
        [k * 6 + 3, v],
      ] as const) {
        if (ok >= 1) {
          const r = Math.acos(Math.max(-1, Math.min(1, d.x * was[o] + d.y * was[o + 1] + d.z * was[o + 2]))) / sec;
          arm.rate[Math.min(79, Math.floor(r))]++;
          if (r > ARM_FAST) {
            arm.fast++;
            bump(arm.why, `fast ${label}`);
            top('arm fast', r, `${tag} ${k ? 'R' : 'L'}${o % 6 ? 'fore' : 'upper'} ${actOf(pid)}`, `${c.k}:${pid}`);
          }
        }
        [was[o], was[o + 1], was[o + 2]] = [d.x, d.y, d.z];
      }
      // the elbow: folded shut, or its point (square to the line from shoulder to hand) the wrong way round
      const fold = Math.acos(Math.max(-1, Math.min(1, -(u.x * v.x + u.y * v.y + u.z * v.z))));
      if (fold < ELBOW_SHUT) {
        arm.shut++;
        bump(arm.why, `shut ${label}`);
        top('elbow shut', ELBOW_SHUT - fold, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
      }
      // (a hanging arm folded back at the elbow: see BACK_DOWN)
      const up = p.up;
      const along = v.dot(u);
      if (Math.PI - fold > BACK_BENT && -(u.x * up.x + u.y * up.y + u.z * up.z) > BACK_DOWN) {
        const ax = v.x - u.x * along;
        const ay = v.y - u.y * along;
        const az = v.z - u.z * along;
        const back = -(ax * axes.front.x + ay * axes.front.y + az * axes.front.z) / (Math.hypot(ax, ay, az) || 1);
        if (back > BACK_FOLD) {
          arm.back++;
          bump(arm.why, `back ${label}`);
          top('elbow folded back', back, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
      }
      const h = AH.set(j[ha * 3] - j[sh * 3], j[ha * 3 + 1] - j[sh * 3 + 1], j[ha * 3 + 2] - j[sh * 3 + 2]);
      const e = AE.set(j[el * 3] - j[sh * 3], j[el * 3 + 1] - j[sh * 3 + 1], j[el * 3 + 2] - j[sh * 3 + 2]);
      e.addScaledVector(h, -e.dot(h) / Math.max(1e-6, h.lengthSq()));
      if (e.length() > 0.15 * s && fold < 2.8) {
        const pole = elbowPole(axes.left, axes.front, side, h.x, h.y, h.z, 0, AP);
        const off = Math.acos(Math.max(-1, Math.min(1, (e.x * pole.x + e.y * pole.y + e.z * pole.z) / (e.length() * Math.hypot(pole.x, pole.y, pole.z) || 1))));
        if (off > ELBOW_WRONG) {
          arm.wrong++;
          bump(arm.why, `wrong ${label}`);
          top('elbow wrong way', off, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
      }
      // his elbow, or the middle of his forearm, in his own trunk (the line from his hips to his chest, as thick as SHAPES has it)
      const r = SHAPES[0][2] * s * Math.sqrt(p.body.bulk);
      let sunkIn = 0;
      for (const w of [0, 0.5]) {
        AH.set(j[el * 3] + (j[ha * 3] - j[el * 3]) * w, j[el * 3 + 1] + (j[ha * 3 + 1] - j[el * 3 + 1]) * w, j[el * 3 + 2] + (j[ha * 3 + 2] - j[el * 3 + 2]) * w);
        AE.set(j[J.chest * 3] - j[J.hips * 3], j[J.chest * 3 + 1] - j[J.hips * 3 + 1], j[J.chest * 3 + 2] - j[J.hips * 3 + 2]);
        const t = Math.max(0, Math.min(1, (AH.x - j[J.hips * 3]) * AE.x + (AH.y - j[J.hips * 3 + 1]) * AE.y + (AH.z - j[J.hips * 3 + 2]) * AE.z) / AE.lengthSq());
        sunkIn = Math.max(sunkIn, r - Math.hypot(AH.x - j[J.hips * 3] - AE.x * t, AH.y - j[J.hips * 3 + 1] - AE.y * t, AH.z - j[J.hips * 3 + 2] - AE.z * t));
      }
      if (sunkIn > HIT) {
        arm.own++;
        bump(arm.why, `own ${label}`);
        top('arm in own trunk', sunkIn, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
      }
      // the wrist of a hand on the ball: the body's hand against its forearm, bent (the turn off its line) and twisted (about it)
      // (and of a free hand: bent or twisted past a wrist's the same, or held dead straight, and how far it is let fall, palm
      // ward, on average)
      const onIt = p.pose[k ? I.gr : I.gl] > 0.3;
      if (!onIt && bones.length > 8) {
        arm.free++;
        AQ.copy(bones[k ? 7 : 4].quaternion)
          .invert()
          .multiply(bones[k ? 8 : 5].quaternion);
        const tw = Math.hypot(AQ.y, AQ.w);
        const twist = 2 * Math.acos(Math.min(1, Math.abs(AQ.w) / Math.max(1e-6, tw)));
        const fingers = AV.set(0, -1, 0).applyQuaternion(AQ);
        const bend = fingers.angleTo(AU.set(0, -1, 0));
        // (toward the palm: the palm is the bone's own x on the right hand, its -x on the left)
        arm.flex += Math.atan2((k ? 1 : -1) * fingers.x, -fingers.y);
        if (bend < WRIST_DEAD) arm.dead++;
        if (bend > WRIST_BEND) {
          arm.freeBent++;
          bump(arm.why, `free wrist bent ${label}`);
          top('free wrist bent', bend, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
        if (twist > WRIST_TWIST) {
          arm.freeTwist++;
          bump(arm.why, `free wrist twist ${label}`);
          top('free wrist twist', twist, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
      }
      if (onIt && bones.length > 8) {
        arm.held++;
        AQ.copy(bones[k ? 7 : 4].quaternion)
          .invert()
          .multiply(bones[k ? 8 : 5].quaternion);
        const tw = Math.hypot(AQ.y, AQ.w);
        const twist = 2 * Math.acos(Math.min(1, Math.abs(AQ.w) / Math.max(1e-6, tw)));
        const bend = AV.set(0, -1, 0)
          .applyQuaternion(AQ)
          .angleTo(AU.set(0, -1, 0));
        if (bend > WRIST_BEND) {
          arm.bent++;
          bump(arm.why, `wrist bent ${label}`);
          top('wrist bent', bend, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
        if (twist > WRIST_TWIST) {
          arm.twist++;
          bump(arm.why, `wrist twist ${label}`);
          top('wrist twist', twist, `${tag} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
      }
    }
  };
  // his arms and legs from frame to frame: each hand's step from his shoulder, each knee's bend, his hips, how fast his
  // feet turn over, and what he was last doing (the move or the gesture, and how long since; the ball, taken or let go)
  const limbs = new Map<
    number,
    {
      h: Float32Array;
      hs: Float32Array;
      kn: Float32Array;
      ks: Float32Array;
      kw: Float32Array;
      hip: number;
      hps: Float32Array;
      ph: number;
      cad: number;
      last: string;
      since: number;
      held: boolean;
      grab: number;
      label: string;
      ok: number;
      x: number;
      z: number;
    }
  >();
  const hand = { n: 0, raw: 0, tooFast: 0, max: 0, why: new Map<string, number>() };
  // each catch as the pass gets to him (see CATCH_LATE): his hands a beat before, how fast they were going as it came,
  // and whether they were on it; each man's hands in the scene over his last frames
  const caught = { n: 0, hands: 0, late: 0, lateFt: 0, snap: 0, snapFt: 0, off: 0 };
  const handsWas = new Map<number, { at: Float32Array; n: number; tau: number; had: boolean }>();
  const back = Math.max(1, Math.round(CATCH_EARLY / (FRAME * speed)));
  const knee = { n: 0, raw: 0, kinks: 0, tooFast: 0, max: 0, why: new Map<string, number>() };
  const hipPop = { n: 0, raw: 0, tooFast: 0, why: new Map<string, number>() };
  const stride = { n: 0, why: new Map<string, number>() };
  const inside = { arms: 0, armsMeet: 0, legs: 0, heads: 0, deepest: 0, why: new Map<string, number>() };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let cuts = 0;
  let fast = 0;
  cutNow = false;
  for (;;) {
    if (!c.step(FRAME, hold)) break;
    // (`final`: only the end of the game, from the buzzer on, held `hold` ms: see ?occasion)
    if (final && c.finalMs < 0) continue;
    frames++;
    const figs = [...inner.figs.entries()];
    // (a frame the picture cuts on, or everyone put on fresh spots: nothing is judged across it)
    const cut =
      cutNow ||
      figs.some(([pid, f]) => {
        const w = last.get(pid);
        return !!w && Math.hypot(f.pup.x - w.x, f.pup.z - w.z) > 2.5;
      });
    cutNow = false;
    if (cut) cuts++;
    const ball = inner.ball;
    const play = c.stage.play;
    const sc = c.stage.script;
    const holders = new Set<number>();
    if (sc && play) for (const h of [play.a.hold, play.b.hold]) if (h !== undefined && h >= 0) holders.add([...sc.oPids, ...sc.dPids][h]);
    for (const [pid, f] of figs) {
      const p = f.pup;
      const s = p.body.s;
      pf++;
      const air = p.pose[I.air];
      const was = last.get(pid);
      // (a foot is down while it isn't swinging and he isn't in the air: one put down and dragged after him counts. It
      // slides when neither its ball nor its heel stays where it was: a pivot on the one, or a roll onto it, doesn't)
      const feet = p.feet.map((ft) => [ft.x, ft.z, !ft.swing && air < 0.5, ft.yaw] as [number, number, boolean, number]);
      if (was && !cut && Math.hypot(p.x - was.x, p.z - was.z) < 3) {
        let worst = 0;
        feet.forEach((ft, k) => {
          if (ft[2] && was.feet[k][2]) worst = Math.max(worst, footSlid(ft, was.feet[k], s));
        });
        if (worst > slide) {
          slid++;
          slidFt += worst;
          // (which clip he was in, and whether he had just come down from a jump)
          const why = `${p.clip}${was.air > 0.2 || air > 0.2 ? '+air' : ''}`;
          slides.set(why, (slides.get(why) ?? 0) + 1);
        }
        // (how fast his head turns on the floor: a whip is a frame of more than 0.25 rad)
        const hd = p.yaw + p.pose[I.twist] + p.pose[I.turn];
        const dh = Math.abs(Math.atan2(Math.sin(hd - was.head), Math.cos(hd - was.head)));
        if (dh > 0.25) {
          headWhip++;
          // (what turned it: his body, his chest or his neck, and in which clip)
          const parts = [Math.abs(wrap(p.yaw - was.yaw)), Math.abs(p.pose[I.twist] - was.twist), Math.abs(p.pose[I.turn] - was.turn)];
          const why = `${p.clip}:${['yaw', 'twist', 'turn'][parts.indexOf(Math.max(...parts))]}`;
          whips.set(why, (whips.get(why) ?? 0) + 1);
          const where = `k${c.k} i${play?.i} p${pid} ${p.clip} ${play ? play.b.act[sc ? [...sc.oPids, ...sc.dPids].indexOf(pid) : 0] : ''}`;
          whipAt.set(where, (whipAt.get(where) ?? 0) + 1);
        }
        heads += dh;
        // (a man standing who doesn't move at all from one frame to the next: a statue)
        if (p.clip.startsWith('idle') || p.clip === 'ready' || p.clip === 'hold' || p.clip === 'stance') {
          standing++;
          let moved = 0;
          for (let i = 0; i < p.pose.length; i++) moved += Math.abs(p.pose[i] - was.pose[i]);
          if (moved < 0.002) still++;
        }
      }
      // (a dunker at the slam: how far off the rim he faces)
      if (sc && p.one && p.one.id.startsWith('dunk') && p.one.tau >= 140 && p.one.tau <= 200) {
        const rx = sc.dir === 1 ? -41.75 : 41.75;
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(rx - p.x, -p.z) - p.yaw), Math.cos(Math.atan2(rx - p.x, -p.z) - p.yaw)));
        dunkOff = Math.max(dunkOff, off);
      }
      const sp = Math.hypot(p.vf, p.vs);
      // (faster than a man runs: the plan has him somewhere his legs can't take him)
      if (sp > FASTEST && !cut) {
        fast++;
        top('faster than a man runs', sp, `k${c.k} t${Math.round(c.t)} p${pid} ${p.clip} ${actOf(pid)}`, `${c.k}:${pid}`);
      }
      if (sp > 9 && !p.one && (p.clip === 'jog' || p.clip === 'run' || p.clip === 'sprint')) {
        runs++;
        hips.push(p.j[J.hips * 3 + 1] / (HIP * s));
      }
      last.set(pid, {
        x: p.x,
        z: p.z,
        feet,
        head: p.yaw + p.pose[I.twist] + p.pose[I.turn],
        pose: Float32Array.from(p.pose),
        air,
        yaw: p.yaw,
        twist: p.pose[I.twist],
        turn: p.pose[I.turn],
      });
      const key = p.clip;
      acts.set(key, (acts.get(key) ?? 0) + 1);
      const g = p.gesturing;
      if (g && making.get(pid) !== g) gestures.set(g, (gestures.get(g) ?? 0) + 1);
      making.set(pid, g);
      // the ball inside a body it isn't in the hands of
      if (!holders.has(pid)) {
        at(f, J.hips, HP);
        at(f, J.chest, CH);
        at(f, J.head, HD);
        at(f, J.hl, HL);
        at(f, J.hr, HR);
        const touching = Math.min(HL.distanceTo(ball), HR.distanceTo(ball)) < 0.9;
        if (!touching && (seg(ball, HP, CH) < 0.42 * s * Math.sqrt(p.body.bulk) || seg(ball, CH, HD) < 0.3 * s)) {
          inBody++;
          if (cases.length < 40 && sc && play)
            cases.push(
              `k${c.k} t${Math.round(c.t)} i${play.i} ${pid} ${p.clip} ${play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)]} y${ball.y.toFixed(1)} a${play.a.hold} b${play.b.hold} ${play.b.fx ?? ''}`,
            );
        }
      }
    }
    // each man's joints in the scene, his bones' ways and his heading
    for (const [pid, f] of figs) {
      const p = f.pup;
      let w = ws.get(pid);
      if (!w) ws.set(pid, (w = new Float32Array(45)));
      for (let k = 0; k < 15; k++) {
        p.world(p.j[k * 3], p.j[k * 3 + 1], p.j[k * 3 + 2], V);
        w[k * 3] = V.x;
        w[k * 3 + 1] = V.y;
        w[k * 3 + 2] = V.z;
      }
      let b = bones.get(pid);
      const fresh = !b;
      if (!b)
        bones.set(
          pid,
          (b = {
            d: new Float32Array(BONES.length * 3),
            th: new Float32Array(BONES.length * 2),
            yaw: p.yaw,
            ys: [0, 0],
            clip: p.clip,
            was: p.clip,
            since: 99,
            ok: 0,
            x: p.x,
            z: p.z,
            label: p.clip,
          }),
        );
      if (b.clip !== p.clip) {
        b.was = b.clip;
        b.clip = p.clip;
        b.since = 0;
      } else b.since++;
      const label = b.since < 8 ? `${b.was}>${p.clip}` : p.clip;
      const jumped = Math.hypot(p.x - b.x, p.z - b.z) > 3;
      b.x = p.x;
      b.z = p.z;
      // (frames in a row he has been followed for: a pop at t-1 is judged against t-2 and t)
      b.ok = fresh || jumped || cut ? 0 : b.ok + 1;
      BONES.forEach(([from, to], i) => {
        const dx = w[to * 3] - w[from * 3];
        const dy = w[to * 3 + 1] - w[from * 3 + 1];
        const dz = w[to * 3 + 2] - w[from * 3 + 2];
        const l = Math.hypot(dx, dy, dz) || 1;
        const k = i * 3;
        const [nx, ny, nz] = [dx / l, dy / l, dz / l];
        const th = Math.acos(Math.max(-1, Math.min(1, nx * b.d[k] + ny * b.d[k + 1] + nz * b.d[k + 2])));
        if (b.ok >= 3) {
          pop.bones++;
          pop.max = Math.max(pop.max, th);
          steps.push(th);
          // (the frame before: a step bigger than both its neighbours' by POP is a pop)
          if (b.th[i * 2] - Math.max(b.th[i * 2 + 1], th) > POP) pop.raw++;
          const spike = popped(b.th[i * 2], b.th[i * 2 + 1], th, POP * speed);
          // (faster than a man runs, the plan's doing: counted on its own)
          if (spike > 0 && Math.hypot(p.vf, p.vs) > FASTEST) pop.tooFast++;
          else if (spike > 0) {
            const part = i >= 8 ? 'legs' : i >= 4 ? 'arms' : 'trunk';
            top(`pop ${part}`, spike, `k${c.k} t${Math.round(c.t) - Math.round(FRAME * speed * PACE)} p${pid} ${b.label}:${BONE_NAMES[i]} ${actOf(pid)}`, `${c.k}:${pid}`);
          }
          // (in a clip's own motion, or in the change from one clip to the next)
          if (spike > 0 && Math.hypot(p.vf, p.vs) > FASTEST) {
            // (counted above)
          } else if (spike > 0 && !b.label.includes('>')) {
            pop.steady++;
            const why = `${b.label}:${BONE_NAMES[i]}`;
            steadyWhy.set(why, (steadyWhy.get(why) ?? 0) + 1);
          } else if (spike > 0) {
            pop.n++;
            const why = `${b.label}:${BONE_NAMES[i]}`;
            popWhy.set(why, (popWhy.get(why) ?? 0) + 1);
            if (popAt.length < 30 && why.includes(only) && !popAt.some((x) => x.startsWith(`k${c.k} `)))
              popAt.push(`k${c.k} t${Math.round(c.t)} p${pid} ${why} ${spike.toFixed(2)}`);
          }
        }
        b.th[i * 2 + 1] = b.th[i * 2];
        b.th[i * 2] = b.ok >= 1 ? th : 0;
        b.d[k] = nx;
        b.d[k + 1] = ny;
        b.d[k + 2] = nz;
      });
      b.label = label;
      // his heading: how much it turns in a frame, and how suddenly it starts or stops turning
      const ys = Math.abs(wrap(p.yaw - b.yaw));
      if (b.ok >= 3) {
        pop.turnMax = Math.max(pop.turnMax, ys);
        if (ys > 0.4 && turnAt.length < 12)
          turnAt.push(`k${c.k} t${Math.round(c.t)} i${play?.i} p${pid} ${label} ${sc && play ? play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)] : '-'} ${ys.toFixed(2)}`);
        const snap = Math.abs(ys - b.ys[0]);
        pop.yawMax = Math.max(pop.yawMax, snap);
        if (snap > YAW_POP) {
          pop.yawN++;
          yawWhy.set(label, (yawWhy.get(label) ?? 0) + 1);
          if (yawAt.length < 20 && !yawAt.some((x) => x.startsWith(`k${c.k} `)))
            yawAt.push(
              `k${c.k} t${Math.round(c.t)} i${play?.i} p${pid} ${label} ${sc && play ? play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)] : '-'} ${b.ys[0].toFixed(2)}->${ys.toFixed(2)}`,
            );
        }
      }
      b.ys[0] = b.ok >= 1 ? ys : 0;
      b.yaw = p.yaw;
    }
    // his hands, knees, hips and stride: a frame's step bigger than both its neighbours' (judged a frame late)
    for (const [pid, f] of figs) {
      const p = f.pup;
      const j = p.j;
      const s = p.body.s;
      let m = limbs.get(pid);
      if (!m)
        limbs.set(
          pid,
          (m = {
            h: new Float32Array(6),
            hs: new Float32Array(4),
            kn: new Float32Array(2),
            ks: new Float32Array(4),
            kw: new Float32Array(2),
            hip: 0,
            hps: new Float32Array(2),
            ph: 0,
            cad: 0,
            last: '',
            since: 99,
            held: false,
            grab: 99,
            label: '',
            ok: 0,
            x: p.x,
            z: p.z,
          }),
        );
      const jumped = Math.hypot(p.x - m.x, p.z - m.z) > 3;
      m.x = p.x;
      m.z = p.z;
      m.ok = jumped || cut ? 0 : m.ok + 1;
      // (what he is doing, for whatever pops: a move, a gesture, or how long since one ended; the ball taken or let go)
      const doing = p.one?.id ?? p.gesturing ?? null;
      if (doing) [m.last, m.since] = [doing, 0];
      else m.since++;
      if (!!f.ball !== m.held) [m.held, m.grab] = [!!f.ball, 0];
      else m.grab++;
      const b = bones.get(pid)!;
      // (faster than a man runs, the plan's doing: his feet can't keep up, and what pops is put down to that)
      const label =
        (Math.hypot(p.vf, p.vs) > FASTEST ? 'too fast: ' : '') +
        (doing ? `in ${doing}` : m.since < AFTER ? `after ${m.last}` : m.grab < 6 ? (m.held ? 'took it' : 'let it go') : b.since < 8 ? `${b.was}>${p.clip}` : p.clip);
      const where = `k${c.k} t${Math.round(c.t) - Math.round(FRAME * speed * PACE)} p${pid}`;
      // each hand from its own shoulder, in his frame
      for (const [k, sh, ha] of [
        [0, J.sl, J.hl],
        [1, J.sr, J.hr],
      ] as const) {
        const x = j[ha * 3] - j[sh * 3];
        const y = j[ha * 3 + 1] - j[sh * 3 + 1];
        const z = j[ha * 3 + 2] - j[sh * 3 + 2];
        const st = Math.hypot(x - m.h[k * 3], y - m.h[k * 3 + 1], z - m.h[k * 3 + 2]);
        if (m.ok >= 3) {
          if (m.hs[k * 2] - Math.max(m.hs[k * 2 + 1], st) > HAND_POP) hand.raw++;
          const spike = popped(m.hs[k * 2], m.hs[k * 2 + 1], st, HAND_POP * speed);
          if (spike > 0 && m.label.startsWith('too fast')) hand.tooFast++;
          else if (spike > 0) {
            hand.n++;
            hand.max = Math.max(hand.max, spike);
            bump(hand.why, m.label);
            top('hand', spike, `${where} ${m.label} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
          }
        }
        m.hs[k * 2 + 1] = m.hs[k * 2];
        m.hs[k * 2] = m.ok >= 1 ? st : 0;
        [m.h[k * 3], m.h[k * 3 + 1], m.h[k * 3 + 2]] = [x, y, z];
      }
      armCheck(pid, f, m.ok, where, m.label);
      // a catch, as the pass gets to him
      let hw = handsWas.get(pid);
      if (!hw) handsWas.set(pid, (hw = { at: new Float32Array(6 * 8), n: 0, tau: 0, had: false }));
      // (in his own frame: a man on the run carries his hands with him)
      const slot = (hw.n % 8) * 6;
      for (let a = 0; a < 3; a++) [hw.at[slot + a], hw.at[slot + 3 + a]] = [j[J.hl * 3 + a], j[J.hr * 3 + a]];
      hw.n = m.ok >= 1 ? hw.n + 1 : 1;
      const tau = p.one?.id === 'catch' ? p.one.tau : 1e9;
      // (a pass, not his own dribble gathered: the ball wasn't his a beat ago)
      if (tau >= 0 && hw.tau < 0 && hw.n > back + 2 && f.ball && !hw.had) {
        caught.n++;
        const palm = BALL_R + 0.12 * s;
        const sec = (FRAME * speed) / 1000;
        const [bs, bc] = [Math.sin(p.yaw), Math.cos(p.yaw)];
        const [bx, bz] = [ball.x - p.x, ball.z - p.z];
        const lb = { x: bx * bc - bz * bs, y: ball.y, z: bx * bs + bz * bc };
        let worstSnap = 0;
        for (const k of [0, 1]) {
          if (p.pose[k ? I.gr : I.gl] < 0.5) continue;
          caught.hands++;
          const ofs = (frames: number) => ((((hw.n - 1 - frames) % 8) + 8) % 8) * 6 + k * 3;
          const h = ofs(0);
          const was = ofs(back);
          const late = Math.hypot(hw.at[was] - lb.x, hw.at[was + 1] - lb.y, hw.at[was + 2] - lb.z) - palm;
          caught.lateFt += Math.max(0, late);
          if (late > CATCH_LATE) {
            caught.late++;
            top('catch late', late, `${where} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
          }
          if (Math.hypot(hw.at[h] - lb.x, hw.at[h + 1] - lb.y, hw.at[h + 2] - lb.z) - palm > 0.35) caught.off++;
          // (the frames before it came: a hand rushing at it then, not one going in with it)
          for (let fr = 1; fr < back; fr++) {
            const a = ofs(fr);
            const b2 = ofs(fr + 1);
            worstSnap = Math.max(worstSnap, Math.hypot(hw.at[a] - hw.at[b2], hw.at[a + 1] - hw.at[b2 + 1], hw.at[a + 2] - hw.at[b2 + 2]) / sec);
          }
        }
        caught.snapFt += worstSnap;
        if (worstSnap > CATCH_SNAP) {
          caught.snap++;
          top('catch snap', worstSnap, `${where} ${actOf(pid)}`, `${c.k}:${pid}`);
        }
      }
      hw.tau = tau;
      hw.had = (p as unknown as { has: boolean }).has;
      // each knee's bend
      for (const [k, hj, kj, fj] of [
        [0, J.jl, J.kl, J.fl],
        [1, J.jr, J.kr, J.fr],
      ] as const) {
        const ax = j[hj * 3] - j[kj * 3];
        const ay = j[hj * 3 + 1] - j[kj * 3 + 1];
        const az = j[hj * 3 + 2] - j[kj * 3 + 2];
        const bx = j[fj * 3] - j[kj * 3];
        const by = j[fj * 3 + 1] - j[kj * 3 + 1];
        const bz = j[fj * 3 + 2] - j[kj * 3 + 2];
        const bend = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1))));
        const st = Math.abs(bend - m.kn[k]);
        const w = bend - m.kn[k];
        if (m.ok >= 3) {
          if (m.ks[k * 2] - Math.max(m.ks[k * 2 + 1], st) > KNEE_POP) knee.raw++;
          // (a pop, or a kink: straightening and then folding, or folding and then straightening, both fast)
          const kink = m.kw[k] * w < 0 && Math.abs(w - m.kw[k]) > KINK * speed ? Math.abs(w - m.kw[k]) : 0;
          if (kink) knee.kinks++;
          const spike = Math.max(popped(m.ks[k * 2], m.ks[k * 2 + 1], st, KNEE_POP * speed), kink);
          if (spike > 0 && m.label.startsWith('too fast')) knee.tooFast++;
          else if (spike > 0) {
            knee.n++;
            knee.max = Math.max(knee.max, spike);
            bump(knee.why, m.label);
            top('knee', spike, `${where} ${m.label} ${k ? 'R' : 'L'} ${actOf(pid)}`, `${c.k}:${pid}`);
          }
        }
        m.ks[k * 2 + 1] = m.ks[k * 2];
        m.ks[k * 2] = m.ok >= 1 ? st : 0;
        m.kw[k] = m.ok >= 1 ? w : 0;
        m.kn[k] = bend;
      }
      // his hips, up and down
      const hy = j[J.hips * 3 + 1];
      const hst = Math.abs(hy - m.hip);
      if (m.ok >= 3 && m.hps[0] - Math.max(m.hps[1], hst) > HIP_POP * s && p.pose[I.air] < 0.3) hipPop.raw++;
      const bob = popped(m.hps[0], m.hps[1], hst, HIP_POP * s * speed);
      if (m.ok >= 3 && bob > 0 && p.pose[I.air] < 0.3 && m.label.startsWith('too fast')) hipPop.tooFast++;
      else if (m.ok >= 3 && bob > 0 && p.pose[I.air] < 0.3) {
        hipPop.n++;
        bump(hipPop.why, m.label);
        top('hips', bob, `${where} ${m.label} ${actOf(pid)}`, `${c.k}:${pid}`);
      }
      m.hps[1] = m.hps[0];
      m.hps[0] = m.ok >= 1 ? hst : 0;
      m.hip = hy;
      // how fast his feet turn over (strides a ms): a change of gait keeps it, give or take
      const ph = (p as unknown as { phase: number }).phase;
      const cad = (ph - m.ph) / (FRAME * speed);
      if (m.ok >= 3 && cad > 0 && m.cad > 0 && Math.abs(cad - m.cad) > CADENCE_JUMP * Math.max(cad, m.cad)) {
        stride.n++;
        bump(stride.why, label);
        top('stride', Math.abs(cad - m.cad) / Math.max(cad, m.cad), `${where} ${label} ${actOf(pid)}`, `${c.k}:${pid}`);
      }
      m.cad = m.ok >= 1 ? cad : 0;
      m.ph = ph;
      m.label = label;
    }
    for (const [pid, f] of figs) {
      const p = f.pup;
      const deep = ballIn(ball, ws.get(pid)!, p.body.s, p.body.bulk, BALL_R, !f.ball);
      if (deep > HIT) {
        hit.ball++;
        const why = `${f.ball ? 'his' : 'by'} ${p.clip}`;
        ballWhy.set(why, (ballWhy.get(why) ?? 0) + 1);
        if (ballAt.length < 24 && sc && play)
          ballAt.push(`k${c.k} t${Math.round(c.t)} i${play.i} p${pid} ${why} ${play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)]} y${ball.y.toFixed(1)} ${deep.toFixed(2)}`);
      }
    }
    // (who meets whom this frame: the scene's own list)
    const met = new Set<string>();
    if (sc) for (const m of meeting) if (m.w > 0.2) met.add(`${[...sc.oPids, ...sc.dPids][m.i]}:${[...sc.oPids, ...sc.dPids][m.j]}`);
    for (let a = 0; a < figs.length; a++)
      for (let b = a + 1; b < figs.length; b++) {
        const fa = figs[a][1];
        const fb = figs[b][1];
        const deep = sunk(ws.get(figs[a][0])!, fa.pup.body.s, fa.pup.body.bulk, ws.get(figs[b][0])!, fb.pup.body.s, fb.pup.body.bulk, true);
        if (deep <= HIT) continue;
        const trunk = sunk(ws.get(figs[a][0])!, fa.pup.body.s, fa.pup.body.bulk, ws.get(figs[b][0])!, fb.pup.body.s, fb.pup.body.bulk, false);
        const walking = detours.has(figs[a][0]) || detours.has(figs[b][0]);
        // (two the play has meet body to body, a screen, a box-out: touching is what they are for, counted on their own)
        const meeting = met.has(`${figs[a][0]}:${figs[b][0]}`) || met.has(`${figs[b][0]}:${figs[a][0]}`);
        const ctx = meeting ? 'meet' : walking ? 'walk' : sc && play ? 'live' : 'dead';
        // an arm or a leg of one inside the other's trunk or head (a hand on him is not in him), and a head in a head
        {
          const [wa, wb] = [ws.get(figs[a][0])!, ws.get(figs[b][0])!];
          const [A, B] = [fa.pup.body, fb.pup.body];
          const arm = Math.max(into(wa, A.s, A.bulk, wb, B.s, B.bulk, PARTS.arms), into(wb, B.s, B.bulk, wa, A.s, A.bulk, PARTS.arms));
          const leg = Math.max(into(wa, A.s, A.bulk, wb, B.s, B.bulk, PARTS.legs, PARTS.trunk), into(wb, B.s, B.bulk, wa, A.s, A.bulk, PARTS.legs, PARTS.trunk));
          const head = into(wa, A.s, A.bulk, wb, B.s, B.bulk, PARTS.head, PARTS.head);
          const pair = `${[fa.pup.clip, fb.pup.clip].sort().join('+')}`;
          const where = `k${c.k} t${Math.round(c.t)} ${figs[a][0]}/${figs[b][0]} ${ctx} ${pair} ${actOf(figs[a][0])}/${actOf(figs[b][0])}`;
          if (arm > HIT) {
            if (meeting) inside.armsMeet++;
            else inside.arms++;
            bump(inside.why, `arm ${ctx} ${pair}`);
            top(meeting ? 'arm in body (meet)' : 'arm in body', arm, where, `${c.k}:${figs[a][0]}:${figs[b][0]}`);
          }
          if (leg > HIT) {
            inside.legs++;
            bump(inside.why, `leg ${ctx} ${pair}`);
            top('leg in body', leg, where, `${c.k}:${figs[a][0]}:${figs[b][0]}`);
          }
          if (head > HIT) {
            inside.heads++;
            bump(inside.why, `head ${ctx} ${pair}`);
            top('head in head', head, where, `${c.k}:${figs[a][0]}:${figs[b][0]}`);
          }
          inside.deepest = Math.max(inside.deepest, arm, leg, head);
        }
        if (meeting) {
          if (trunk > HIT) hit.trunkMeet++;
        } else {
          hit.limbs++;
          if (deep > 0.25) hit.deep++;
          hit.deepest = Math.max(hit.deepest, deep);
        }
        if (trunk > HIT && !meeting) {
          hit.trunk++;
          const tw = `${ctx} ${[fa.pup.clip, fb.pup.clip].sort().join('+')}`;
          trunkWhy.set(tw, (trunkWhy.get(tw) ?? 0) + 1);
          if (trunkAt.length < 30 && !trunkAt.some((x) => x.startsWith(`k${c.k} `)))
            trunkAt.push(
              `k${c.k} t${Math.round(c.t)} i${play?.i} ${figs[a][0]}/${figs[b][0]} ${tw} ${sc && play ? [figs[a][0], figs[b][0]].map((q) => play.b.act[[...sc.oPids, ...sc.dPids].indexOf(q)]).join('/') : ''} ${trunk.toFixed(2)}`,
            );
        }
        hit[ctx]++;
        const why = `${ctx} ${[fa.pup.clip, fb.pup.clip].sort().join('+')}`;
        hitWhy.set(why, (hitWhy.get(why) ?? 0) + 1);
        if (hitAt.length < 30 && !hitAt.some((x) => x.startsWith(`k${c.k} `)))
          hitAt.push(
            `k${c.k} t${Math.round(c.t)} i${play?.i} ${figs[a][0]}/${figs[b][0]} ${why} ${sc && play ? [figs[a][0], figs[b][0]].map((q) => play.b.act[[...sc.oPids, ...sc.dPids].indexOf(q)]).join('/') : ''} ${deep.toFixed(2)}${trunk > HIT ? ' trunk' : ''}`,
          );
      }
    for (let a = 0; a < figs.length; a++)
      for (let b = a + 1; b < figs.length; b++) {
        const pa = figs[a][1].pup;
        const pb = figs[b][1].pup;
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        const r = (pa.body.s + pb.body.s) / 2;
        if (met.has(`${figs[a][0]}:${figs[b][0]}`) || met.has(`${figs[b][0]}:${figs[a][0]}`)) continue;
        if (d < 1.3 * r) pairs++;
        if (d < 0.9 * r) {
          deep++;
          const why = [pa.clip, pb.clip].sort().join('+');
          deeps.set(why, (deeps.get(why) ?? 0) + 1);
          if (deepAt.length < 12 && !deepAt.some((x) => x.startsWith(`k${c.k} `))) deepAt.push(`k${c.k} t${Math.round(c.t)} ${figs[a][0]}/${figs[b][0]} ${why}`);
        }
      }
  }
  hips.sort((x, y) => x - y);
  const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 10000) / 100;
  return {
    speed,
    possessions: scripts.length,
    frames,
    cuts,
    fastPct: pct(fast, pf),
    slidePct: pct(slid, pf),
    slideMeanFt: Math.round((slidFt / Math.max(1, slid)) * 1000) / 1000,
    slides: Object.fromEntries([...slides].sort((x, y) => y[1] - x[1]).slice(0, 14)),
    hipsLowest: hips[0],
    hipsP1: hips[Math.floor(hips.length * 0.01)],
    hipsMean: hips.reduce((x, y) => x + y, 0) / Math.max(1, hips.length),
    runs,
    pairsNear: pairs,
    pairsDeep: deep,
    deeps: Object.fromEntries([...deeps].sort((x, y) => y[1] - x[1]).slice(0, 8)),
    deepAt,
    ballInBody: inBody,
    hits: { ...hit, deepest: Math.round(hit.deepest * 100) / 100 },
    hitWhy: Object.fromEntries([...hitWhy].sort((x, y) => y[1] - x[1]).slice(0, 16)),
    hitAt,
    trunkWhy: Object.fromEntries([...trunkWhy].sort((x, y) => y[1] - x[1]).slice(0, 16)),
    trunkAt,
    ballWhy: Object.fromEntries([...ballWhy].sort((x, y) => y[1] - x[1]).slice(0, 12)),
    ballAt,
    pops: {
      ...pop,
      per1k: Math.round((pop.n / Math.max(1, pop.bones)) * 1e6) / 1e3,
      max: Math.round(pop.max * 100) / 100,
      p999: Math.round((steps.sort((x, y) => x - y)[Math.floor(steps.length * 0.999)] ?? 0) * 1000) / 1000,
      yawMax: Math.round(pop.yawMax * 1000) / 1000,
      turnMax: Math.round(pop.turnMax * 1000) / 1000,
    },
    popWhy: Object.fromEntries([...popWhy].sort((x, y) => y[1] - x[1]).slice(0, 20)),
    popAt,
    yawWhy: Object.fromEntries([...yawWhy].sort((x, y) => y[1] - x[1]).slice(0, 12)),
    yawAt,
    turnAt,
    steadyWhy: Object.fromEntries([...steadyWhy].sort((x, y) => y[1] - x[1]).slice(0, 16)),
    dunkOffDeg: Math.round((dunkOff * 180) / Math.PI),
    cases,
    headWhips: headWhip,
    whips: Object.fromEntries([...whips].sort((x, y) => y[1] - x[1]).slice(0, 16)),
    whipAt: Object.fromEntries([...whipAt].sort((x, y) => y[1] - x[1]).slice(0, 14)),
    headTravel: Math.round((heads / Math.max(1, pf)) * 1000) / 1000,
    statuePct: pct(still, standing),
    knocks: { ...knocked },
    // (hands that pop, knees that snap, hips that bob, strides that change in a frame, and limbs and heads inside another man)
    limbs: {
      hand: {
        n: hand.n,
        raw: hand.raw,
        tooFast: hand.tooFast,
        max: Math.round(hand.max * 100) / 100,
        why: Object.fromEntries([...hand.why].sort((x, y) => y[1] - x[1]).slice(0, 16)),
      },
      knee: {
        n: knee.n,
        raw: knee.raw,
        kinks: knee.kinks,
        tooFast: knee.tooFast,
        max: Math.round(knee.max * 100) / 100,
        why: Object.fromEntries([...knee.why].sort((x, y) => y[1] - x[1]).slice(0, 16)),
      },
      hips: { n: hipPop.n, raw: hipPop.raw, tooFast: hipPop.tooFast, why: Object.fromEntries([...hipPop.why].sort((x, y) => y[1] - x[1]).slice(0, 10)) },
      stride: { n: stride.n, why: Object.fromEntries([...stride.why].sort((x, y) => y[1] - x[1]).slice(0, 12)) },
      inside: { ...inside, deepest: Math.round(inside.deepest * 100) / 100, why: Object.fromEntries([...inside.why].sort((x, y) => y[1] - x[1]).slice(0, 16)) },
      // (each catch: hands farther than CATCH_LATE off it a beat before it came (and how far on average), catches snapped
      // onto (and how fast the hands went, on average, ft a second), hands not on it as it came)
      catch: {
        n: caught.n,
        hands: caught.hands,
        late: caught.late,
        lateFt: Math.round((caught.lateFt / Math.max(1, caught.hands)) * 100) / 100,
        snap: caught.snap,
        snapFt: Math.round((caught.snapFt / Math.max(1, caught.n)) * 10) / 10,
        off: caught.off,
      },
      // (each arm: its bones' turn, and the share of them at or past 10, 20, 30 and 40 rad a second; a free hand's wrist:
      // the share held dead straight, and how far it is let fall toward the palm on average, radians)
      arms: {
        ...arm,
        dead: pct(arm.dead, arm.free),
        flex: Math.round((arm.flex / Math.max(1, arm.free)) * 100) / 100,
        rate: [10, 20, 30, 40].map((r) =>
          pct(
            arm.rate.slice(r).reduce((x, y) => x + y, 0),
            arm.n * 2,
          ),
        ),
        why: Object.fromEntries([...arm.why].sort((x, y) => y[1] - x[1]).slice(0, 24)),
      },
    },
    worst: Object.fromEntries([...tops].map(([k, l]) => [k, l.map((x) => `${x.at} ${x.mag.toFixed(2)}`)])),
    gestures: Object.fromEntries(gestures),
    clips: Object.fromEntries([...acts].sort((x, y) => y[1] - x[1])),
  };
}

/** A man's speed (ft a second, his body's time) is told by these bins in `gait`. */
const GAIT_BINS = [3, 8, 14, 20, 26, 30, 36, 48];
/** A step whose body travel is more than this of the stride it took (or less than its inverse) isn't explained by his legs. */
const UNEXPLAINED = 1.25;
/** Speeding up or slowing down harder than this (ft a second squared, eased over GAIT_EASE ms) is a start or a stop. */
const GAIT_ACC = 12;
const GAIT_EASE = 90;
/** A cut: his path turning faster than this (radians a second) at more than this speed (ft a second). */
const CUT_RATE = 2.2;
const CUT_FROM = 8;
/** The least a head's or a pose's step that stands out from both its neighbours counts as a pop (radians a frame at 1x). */
const HEAD_POP = 0.05;
const POSE_POP = 0.25;

/**
 * His legs against his travel, over the whole game at a speed chip: how fast men go (ft a second, on their bodies'
 * own time); each step (one foot down to the other) as its length × his cadence against how far his body went, by
 * speed; feet that slide or skip while down; how he leans and how long his steps are setting off, pulling up and at
 * an even speed; how much of a cut's turn is made over a planted foot; and the head's and the whole pose's pops (a
 * frame's turn bigger than both its neighbours': see `popped`), with the worst of each as `k t pid clip act`, to film.
 */
function gait({ speed = 2, only = '' } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const own = FRAME * speed;
  const sec = own / 1000;
  const bins = GAIT_BINS.map(() => ({ frames: 0, steps: 0, len: 0, cad: 0, ratio: 0, off: 0 }));
  const binOf = (v: number) => GAIT_BINS.reduce((k, b, i) => (v >= b ? i : k), 0);
  const speeds: number[] = [];
  let pf = 0;
  let slid = 0;
  let skip = 0;
  const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 10000) / 100;
  // (each kind's steps by speed bin: the sum of their lengths and how many)
  const kind0 = () => ({ f: 0, lean: 0, hip: 0, n: 0, by: new Float64Array(GAIT_BINS.length * 2) });
  const kinds = { start: kind0(), stop: kind0(), even: kind0() };
  let cutYaw = 0;
  let cutYawDown = 0;
  let cutFrames = 0;
  let cutAir = 0;
  const pops = { head: 0, pose: 0 };
  // (what he was in when it popped: his clip, and the one before if he has just changed)
  const popWhy = { head: new Map<string, number>(), pose: new Map<string, number>() };
  const clipWas = new Map<number, [string, string, number]>();
  const worst = new Map<string, { mag: number; at: string; key: string }[]>();
  const top = (kind: string, mag: number, at: string, key: string) => {
    if (only && !at.includes(only)) return;
    let l = worst.get(kind);
    if (!l) worst.set(kind, (l = []));
    const same = l.findIndex((x) => x.key === key);
    if (same >= 0) {
      if (l[same].mag >= mag) return;
      l.splice(same, 1);
    }
    l.push({ mag, at, key });
    l.sort((x, y) => y.mag - x.mag);
    if (l.length > TOP) l.pop();
  };
  // each man: where he was, his speed eased (and a beat ago), his heading of travel, the last foot down (where, when,
  // and where he was then), his head's way and his bones' (in his own frame) a frame ago, and the last two steps of each
  const men = new Map<
    number,
    {
      x: number;
      z: number;
      v: number;
      vWas: number;
      hv: number;
      down: [boolean, boolean];
      land: { k: number; x: number; z: number; bx: number; bz: number; t: number } | null;
      fx: [number, number, number, number];
      fy: [number, number];
      hd: [number, number, number];
      hs: [number, number];
      bd: Float32Array;
      ps: [number, number];
      ok: number;
      t: number;
    }
  >();
  const ex = (j: Float32Array, a: number, b: number, out: Float32Array, o: number) => {
    const dx = j[b * 3] - j[a * 3];
    const dy = j[b * 3 + 1] - j[a * 3 + 1];
    const dz = j[b * 3 + 2] - j[a * 3 + 2];
    const l = Math.hypot(dx, dy, dz) || 1;
    out[o] = dx / l;
    out[o + 1] = dy / l;
    out[o + 2] = dz / l;
  };
  const BD = new Float32Array(BONES.length * 3);
  cutNow = false;
  for (;;) {
    if (!c.step()) break;
    const figs = [...inner.figs.entries()];
    const cut = cutNow || figs.some(([pid, f]) => (men.has(pid) ? Math.hypot(f.pup.x - men.get(pid)!.x, f.pup.z - men.get(pid)!.z) > 2.5 : false));
    cutNow = false;
    for (const [pid, f] of figs) {
      const p = f.pup;
      const s = p.body.s;
      let m = men.get(pid);
      if (!m) {
        men.set(
          pid,
          (m = {
            x: p.x,
            z: p.z,
            v: 0,
            vWas: 0,
            hv: 0,
            down: [true, true],
            land: null,
            fx: [0, 0, 0, 0],
            fy: [0, 0],
            hd: [0, 0, 0],
            hs: [0, 0],
            bd: new Float32Array(BONES.length * 3),
            ps: [0, 0],
            ok: 0,
            t: 0,
          }),
        );
      }
      m.t += own;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const v = Math.hypot(dx, dz) / sec;
      m.ok = cut ? 0 : m.ok + 1;
      const air = p.pose[I.air] > 0.5;
      const act = actOfPid(c, pid);
      let cw = clipWas.get(pid);
      if (!cw) clipWas.set(pid, (cw = [p.clip, p.clip, 99]));
      if (cw[1] !== p.clip) [cw[0], cw[1], cw[2]] = [cw[1], p.clip, 0];
      else cw[2]++;
      const label = cw[2] < 8 ? `${cw[0]}>${p.clip}` : p.one ? `in ${p.one.id}` : p.clip;
      const at = `k${c.k} t${Math.round(c.t) - Math.round(FRAME * speed * PACE)} p${pid} ${label} ${act}`;
      if (m.ok >= 1) {
        pf++;
        speeds.push(v);
        bins[binOf(v)].frames++;
        // (feet that are down: one that moves slid, one that is lifted off the floor without a stride skipped)
        p.feet.forEach((ft, k) => {
          const isDown = !ft.swing && !air;
          if (isDown && m!.down[k] && footSlid([ft.x, ft.z, 1, ft.yaw], [m!.fx[k * 2], m!.fx[k * 2 + 1], 1, m!.fy[k]], s) > 0.05) slid++;
          if (isDown && ft.up > 0.03 * s) skip++;
        });
        // (his speed eased, and how fast it changes)
        const k = 1 - Math.exp(-own / GAIT_EASE);
        if (m.v < 0) m.v = v;
        m.vWas = m.v;
        m.v += (v - m.v) * k;
        const acc = (m.v - m.vWas) / sec;
        const kind = m.v < 5 || p.one ? null : acc > GAIT_ACC ? 'start' : acc < -GAIT_ACC ? 'stop' : 'even';
        if (kind) {
          const r = kinds[kind];
          r.f++;
          r.lean += p.pose[I.lean];
          r.hip += p.j[J.hips * 3 + 1] / (HIP * s) - 1;
        }
        // (a cut: his path turning fast at a run; how much of his body's turn is made with a foot down under him)
        const hv = Math.atan2(dx, dz);
        if (v > CUT_FROM && m.ok >= 2) {
          const rate = Math.abs(wrap(hv - m.hv)) / sec;
          if (rate > CUT_RATE && !p.one) {
            cutFrames++;
            const yawStep = Math.abs(wrap(p.yaw - m.hd[2]));
            cutYaw += yawStep;
            if (p.feet.some((ft) => !ft.swing) && !air) cutYawDown += yawStep;
            if (air || p.feet.every((ft) => ft.swing)) cutAir++;
          }
        }
        m.hv = hv;
        // each step: from one foot down to the other, its length × his cadence against how far his body went
        p.feet.forEach((ft, fk) => {
          const isDown = !ft.swing && !air;
          if (isDown && !m!.down[fk]) {
            const l = m!.land;
            if (l && l.k !== fk && m!.t - l.t < 900 && m!.t - l.t > 60) {
              const len = Math.hypot(ft.x - l.x, ft.z - l.z);
              const went = Math.hypot(p.x - l.bx, p.z - l.bz);
              const dur = (m!.t - l.t) / 1000;
              const vv = went / dur;
              if (vv > 3 && FORWARD_CLIPS.has(p.clip)) {
                const b = bins[binOf(vv)];
                b.steps++;
                b.len += len / s;
                b.cad += 1 / dur;
                const ratio = went / Math.max(0.2, len);
                b.ratio += ratio;
                if (ratio > UNEXPLAINED || ratio < 1 / UNEXPLAINED) {
                  b.off++;
                  top('unexplained', ratio, at, `${c.k}:${pid}`);
                }
                if (kind) {
                  kinds[kind].n++;
                  kinds[kind].by[binOf(vv) * 2] += len / s;
                  kinds[kind].by[binOf(vv) * 2 + 1]++;
                }
              }
            }
            m!.land = { k: fk, x: ft.x, z: ft.z, bx: p.x, bz: p.z, t: m!.t };
          }
          m!.down[fk] = isDown;
          m!.fx[fk * 2] = ft.x;
          m!.fx[fk * 2 + 1] = ft.z;
          m!.fy[fk] = ft.yaw;
        });
        // his head's way (heading and pitch): a frame's turn bigger than both its neighbours'
        const hy = p.yaw + p.pose[I.twist] + p.pose[I.turn];
        const hp = p.pose[I.nod] + p.pose[I.lean];
        const hstep = Math.hypot(wrap(hy - m.hd[0]), hp - m.hd[1]);
        if (m.ok >= 3) {
          const spike = popped(m.hs[0], m.hs[1], hstep, HEAD_POP * speed);
          if (spike > 0) {
            pops.head++;
            popWhy.head.set(label, (popWhy.head.get(label) ?? 0) + 1);
            top('head', spike, at, `${c.k}:${pid}`);
          }
        }
        m.hs = [hstep, m.hs[0]];
        // the whole pose (each bone's way in his own frame, all of them)
        BONES.forEach(([a, b], i) => ex(p.j, a, b, BD, i * 3));
        let pstep = 0;
        for (let i = 0; i < BONES.length; i++)
          pstep += Math.acos(Math.max(-1, Math.min(1, BD[i * 3] * m.bd[i * 3] + BD[i * 3 + 1] * m.bd[i * 3 + 1] + BD[i * 3 + 2] * m.bd[i * 3 + 2])));
        pstep += Math.abs(wrap(p.yaw - m.hd[2]));
        if (m.ok >= 3) {
          const spike = popped(m.ps[0], m.ps[1], pstep, POSE_POP * speed);
          if (spike > 0) {
            pops.pose++;
            popWhy.pose.set(label, (popWhy.pose.get(label) ?? 0) + 1);
            top('pose', spike, at, `${c.k}:${pid}`);
          }
        }
        m.ps = [pstep, m.ps[0]];
        m.bd.set(BD);
        m.hd = [hy, hp, p.yaw];
      } else {
        BONES.forEach(([a, b], i) => ex(p.j, a, b, m!.bd, i * 3));
        m.hd = [p.yaw + p.pose[I.twist] + p.pose[I.turn], p.pose[I.nod] + p.pose[I.lean], p.yaw];
        m.hs = [0, 0];
        m.ps = [0, 0];
        m.land = null;
        p.feet.forEach((ft, fk) => {
          m!.down[fk] = !ft.swing && !air;
          m!.fx[fk * 2] = ft.x;
          m!.fx[fk * 2 + 1] = ft.z;
          m!.fy[fk] = ft.yaw;
        });
        m.hv = 0;
        m.v = -1;
      }
      m.x = p.x;
      m.z = p.z;
    }
  }
  speeds.sort((a, b) => a - b);
  const moving = speeds.filter((v) => v > 3);
  const q = (l: number[], u: number) => Math.round(l[Math.min(l.length - 1, Math.floor(u * l.length))] * 10) / 10;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    playerFrames: pf,
    speed: {
      p50: q(moving, 0.5),
      p90: q(moving, 0.9),
      p99: q(moving, 0.99),
      max: q(moving, 1),
      over24: pct(speeds.filter((v) => v > 24).length, pf),
      over28: pct(speeds.filter((v) => v > 28).length, pf),
      over32: pct(speeds.filter((v) => v > 32).length, pf),
    },
    // by speed bin (from): share of frames, steps, step length (ft on a 6 ft 6 man), cadence (steps a second), body travel / stride, share unexplained
    bins: Object.fromEntries(
      bins.map((b, i) => [
        `${GAIT_BINS[i]}+`,
        b.steps
          ? { framePct: pct(b.frames, pf), steps: b.steps, len: r2(b.len / b.steps), cad: r2(b.cad / b.steps), ratio: r2(b.ratio / b.steps), offPct: pct(b.off, b.steps) }
          : { framePct: pct(b.frames, pf), steps: 0 },
      ]),
    ),
    slidePct: pct(slid, pf),
    skipPct: pct(skip, pf),
    // setting off, pulling up and an even run: frames, mean lean (rad), hips (of standing, -: lower), steps, a step against an even one's
    kinds: Object.fromEntries(
      Object.entries(kinds).map(([k, r]) => {
        // (each step against an even run's at its speed)
        let w = 0;
        let n = 0;
        GAIT_BINS.forEach((_, b) => {
          const e = kinds.even.by;
          if (!r.by[b * 2 + 1] || !e[b * 2 + 1]) return;
          w += r.by[b * 2 + 1] * (r.by[b * 2] / r.by[b * 2 + 1] / (e[b * 2] / e[b * 2 + 1]));
          n += r.by[b * 2 + 1];
        });
        return [k, { frames: r.f, lean: r2(r.lean / Math.max(1, r.f)), hips: r2(r.hip / Math.max(1, r.f)), steps: r.n, stepVsEven: r2(w / Math.max(1, n)) }];
      }),
    ),
    cuts: { frames: cutFrames, yawOverFootPct: pct(cutYawDown, cutYaw), airPct: pct(cutAir, cutFrames) },
    popWhy: Object.fromEntries(Object.entries(popWhy).map(([k, m]) => [k, Object.fromEntries([...m].sort((x, y) => y[1] - x[1]).slice(0, 14))])),
    pops: { head: pops.head, headPer1k: r2((pops.head / Math.max(1, pf)) * 1000), pose: pops.pose, posePer1k: r2((pops.pose / Math.max(1, pf)) * 1000) },
    worst: Object.fromEntries([...worst].map(([k, l]) => [k, l.map((x) => `${x.at} ${x.mag.toFixed(2)}`)])),
  };
}
/** A man's own state from frame to frame of possession k (the puppet's private fields named in `fields`, and pose channels in `keys`). */
function peek({ k = 0, pid = -1, from = 0, to = Infinity, speed = 2, fields = ['gw', 'lim', 'freed'] as string[], keys = ['twist', 'turn'] as string[], lead = 2 } = {}) {
  const c = new Clock(speed);
  if (lead >= k) c.tipMs = 0;
  c.k = Math.max(0, k - lead);
  while (c.k < k && c.finalMs < 0) c.step();
  const out: string[] = [];
  while (c.k === k && c.finalMs < 0) {
    c.step();
    if (c.k !== k || c.t < from || c.t > to) continue;
    const f = inner.figs.get(pid >= 0 ? pid : scripts[k].oPids[0]);
    if (!f) continue;
    const p = f.pup as unknown as Record<string, unknown> & { pose: Float32Array; clip: string; yaw: number };
    const v = (x: unknown) => (typeof x === 'number' ? x.toFixed(3) : JSON.stringify(x));
    out.push(
      `${Math.round(c.t)} ${p.clip} yaw${p.yaw.toFixed(3)} ${fields.map((n) => `${n}=${v(p[n])}`).join(' ')} ${keys.map((n) => `${n}${p.pose[I[n as keyof typeof I]].toFixed(3)}`).join(' ')}`,
    );
  }
  return out;
}

/** The gaits ahead, whose steps `gait` measures. */
const FORWARD_CLIPS = new Set(['walk', 'jog', 'run', 'sprint', 'start']);
/** What he is doing in the play this frame (his act), or '-'. */
const actOfPid = (c: Clock, pid: number) => {
  const sc = c.stage.script;
  const play = c.stage.play;
  return sc && play ? (play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)] ?? '-') : '-';
};

/** Where in the game (at a speed chip) a man goes into `clip`, or makes that gesture: the first `most` times, each possession once. */
function when(clip: string, { speed = 2, most = 8 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const out: string[] = [];
  const was = new Map<number, string>();
  while (c.step() && out.length < most) {
    for (const [pid, f] of inner.figs) {
      const now = f.pup.clip === clip || f.pup.gesturing === clip ? clip : '';
      if (now && was.get(pid) !== now && !out.some((x) => x.startsWith(`k${c.k} `))) out.push(`k${c.k} t${Math.round(c.t)} p${pid}`);
      was.set(pid, now);
    }
  }
  return out;
}

/** The possessions with a man doing `act` (or with a frame whose flash or fx says it), and where. */
function find(what: Act | 'make' | 'miss' | 'foul' | 'moment' | 'swat') {
  const out: { k: number; frame: number; pid: number; ms: number; caps: string }[] = [];
  scripts.forEach((sc, k) => {
    let ms = 0;
    sc.frames.forEach((f, i) => {
      ms += f.dur;
      const pids = [...sc.oPids, ...sc.dPids];
      if (what === 'make' || what === 'miss') {
        if (f.fx === what) out.push({ k, frame: i, pid: pids[sc.frames[i - 1]?.hold ?? 0], ms, caps: f.cap ?? '' });
      } else if (what === 'foul') {
        if (f.flash?.kind === 'foul') out.push({ k, frame: i, pid: -1, ms, caps: f.cap ?? '' });
      } else if (what === 'moment') {
        if (sc.moment && i === sc.frames.length - 1) out.push({ k, frame: i, pid: -1, ms, caps: sc.moment });
      } else if (what === 'swat') {
        if (f.swat !== undefined) out.push({ k, frame: i, pid: pids[f.swat], ms, caps: f.cap ?? '' });
      } else
        f.act.forEach((a, j) => {
          if (a === what) out.push({ k, frame: i, pid: pids[j], ms: ms - f.dur, caps: f.cap ?? '' });
        });
    });
  });
  return out;
}

/** What possession k does, frame by frame. */
function acts(k: number) {
  const sc = scripts[k];
  const pids = [...sc.oPids, ...sc.dPids];
  let ms = 0;
  return sc.frames.map((f) => {
    ms += f.dur;
    return `${ms - f.dur}+${f.dur} hold=${f.hold} ${f.fx ?? ''} ${f.flash?.text ?? ''} | ${f.act.map((a, j) => `${pids[j]}:${a}`).join(' ')}`;
  });
}

/**
 * A strip of moments of possession k (play ms `from` to `to`, a frame every `every`), a camera on one man
 * (`eye`: how far from him, how high, how far round from the side toward mid-floor; 'tv': the broadcast camera; `faced`: round
 * from the way he faces instead, 0 in front of him, so a close look at his hands stays on them as he turns). Drawn into #strip.
 */
async function film({
  k = 0,
  pid = -1,
  from = 0,
  to = Infinity,
  every = 3,
  speed = 2,
  eye = [16, 3, 0] as number[] | 'tv',
  look = 3.4,
  fov = 30,
  w = 300,
  h = 360,
  cols = 8,
  most = 32,
  final = false,
  tip = false,
  lead = 2,
  world = null as number[] | null,
  faced = false,
} = {}) {
  const c = new Clock(speed);
  // (`lead`: how many possessions before it are played first; all of them, from the tip, and it is the game as `measure` and `when` play it)
  if ((tip && k === 0) || lead >= k) c.tipMs = 0;
  const start = Math.max(0, k - lead);
  c.k = start;
  // (the possessions before it, so everyone gets there as he would)
  while (c.k < k && c.finalMs < 0) c.step();
  scene.size(w, h, 1);
  const cam = new PerspectiveCamera(fov, w / h, 0.5, 900);
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  const cells: ImageBitmap[] = [];
  let n = 0;
  const target = new Vector3();
  for (;;) {
    const sc = scripts[c.k];
    const waiting = c.tipMs >= 0 && c.tipMs < TIP_WAIT;
    const inside = final ? c.finalMs >= 0 && c.finalMs >= from && c.finalMs <= to : c.k === k && c.t >= from && c.t <= to && (!waiting || c.tipMs > TIP_WAIT - 300);
    drawing = inside && n % every === 0 && eye === 'tv' && !world;
    const going = c.step(FRAME, final ? to + 100 : 3000);
    if (inside && n % every === 0) {
      if (world) {
        // (a camera held still: [x, y, z] it stands at, [x, y, z] it looks at; x as the rim's side, mirrored for a team attacking the other end)
        const e = sc.dir === 1 ? 1 : -1;
        cam.position.set(world[0] * e, world[1], world[2]);
        cam.lookAt(world[3] * e, world[4], world[5]);
        cam.updateMatrixWorld();
        drawing = true;
        inner.renderer.render(inner.scene, cam);
      } else if (eye !== 'tv') {
        const f = inner.figs.get(pid >= 0 ? pid : sc.oPids[0]);
        if (f) {
          at(f, J.hips, target);
          target.y = look;
          // (eye: how far, how high, and how far round from the side of him toward the middle of the floor)
          const a = (faced ? f.pup.yaw : Math.atan2(-target.x, -target.z)) + (eye[2] ?? 0);
          cam.position.set(target.x + Math.sin(a) * eye[0], eye[1], target.z + Math.cos(a) * eye[0]);
          cam.lookAt(target);
          cam.updateMatrixWorld();
          drawing = true;
          inner.renderer.render(inner.scene, cam);
        }
      }
      cells.push(await createImageBitmap(canvas));
    }
    drawing = false;
    if (inside) n++;
    if (!going || cells.length >= most || (!final && (c.k > k || (c.k === k && c.t > to)))) break;
  }
  const rows = Math.ceil(cells.length / cols);
  strip.width = Math.min(cols, cells.length) * w;
  strip.height = rows * h;
  const g = strip.getContext('2d')!;
  cells.forEach((b, i) => {
    g.drawImage(b, (i % cols) * w, Math.floor(i / cols) * h);
    g.fillStyle = '#fff';
    g.fillText(String(i), (i % cols) * w + 4, Math.floor(i / cols) * h + 12);
  });
  return { cells: cells.length, w: strip.width, h: strip.height };
}

/**
 * One move side by side at moments `from`..`to` (ms), at centre court in the arena's light: `drive` is the plan
 * for a man at `t` (the source of a function `(t) => Drive`), `cue` a gesture asked for at `cueAt`. `toss`: [x, y, z]
 * ft from him (x to the scene's x, z to its z), the ball thrown to him from there through a move of his that isn't his
 * yet (a 'catch'): as the scene flies a pass, on a line with a little lift to where his hands will have it, in his
 * hands as the move ends (and given with: Puppet.caught). Into #strip.
 */
function pose({
  drive = '(t) => ({ x: 0, z: 0, yaw: 0, act: "stand", ms: t, dur: 9000, ball: false })',
  n = 6,
  from = 0,
  to = 1500,
  gap = 4.6,
  eye = [0, 5.6, 24],
  at = [0, 3.7, 0],
  fov = 30,
  w = 1500,
  h = 520,
  cue = null as Gesture | null,
  cueAt = 0,
  fall = false,
  h0 = 78,
  w0 = 215,
  toss = null as number[] | null,
} = {}) {
  const make = new Function(`return ${drive}`)() as (t: number, i: number) => Drive;
  // (no game on the floor)
  scene.frame(emptyStage(), props, 0, 16, false, 0);
  scene.size(w, h, 1);
  const ballMat = new MeshStandardMaterial({ color: 0xc8642a, roughness: 0.6 });
  const ballGeo = new SphereGeometry(BALL_R, 18, 14);
  const made: { f: Fig; b: Mesh }[] = [];
  for (let i = 0; i < n; i++) {
    const f = new Fig(inner.geo, bodyOf(h0, w0), 0, kits[0], '23', i, 'LAB', 'LAB');
    const b = new Mesh(ballGeo, ballMat);
    inner.scene.add(f.group, f.shadow, b);
    const end = from + ((to - from) * i) / Math.max(1, n - 1);
    let t = 0;
    let cued = false;
    const ox = (i - (n - 1) / 2) * gap;
    // (a ball thrown to him: where it set off from, where it was last frame, and whether it was in the air)
    let thrown: V3 | null = null;
    const was = new Vector3();
    let flew = false;
    for (;;) {
      const step = Math.min(16, end - t);
      t += step;
      if ((cue || fall) && !cued && t >= cueAt) {
        if (cue) f.pup.cue(cue);
        else f.pup.stumble();
        cued = true;
      }
      const d = make(t, i);
      f.pup.update({ ...d, x: d.x + ox }, step, step, step);
      let ball: V3 | null = d.ball ? f.pup.carry({ x: 0, y: 0, z: 0 }) : null;
      if (toss && !d.ball && d.act === 'catch' && d.dur > 0) {
        const to = f.pup.carry({ x: 0, y: 0, z: 0 });
        thrown ??= { x: to.x + toss[0], y: toss[1], z: to.z + toss[2] };
        const u = Math.max(0, Math.min(1, d.ms / d.dur));
        const lift = Math.min(1.8, d.dur / 1000);
        ball = { x: thrown.x + (to.x - thrown.x) * u, y: thrown.y + (to.y - thrown.y) * u + 4 * lift * u * (1 - u), z: thrown.z + (to.z - thrown.z) * u };
        flew = true;
      } else if (ball && flew && step > 0) {
        f.pup.caught({ x: ((ball.x - was.x) * 1000) / step, y: ((ball.y - was.y) * 1000) / step, z: ((ball.z - was.z) * 1000) / step });
        flew = false;
      }
      f.ball = ball;
      f.pup.arms(ball);
      // (in his hands as they are drawn, as the scene puts it)
      if (ball && d.ball && f.pup.holds(V) > 0.5) ball = { x: V.x, y: V.y, z: V.z };
      b.visible = !!ball;
      if (ball) {
        b.position.set(ball.x, ball.y, ball.z);
        was.set(ball.x, ball.y, ball.z);
      }
      if (t >= end) break;
    }
    f.place();
    made.push({ f, b });
  }
  const cam = new PerspectiveCamera(fov, w / h, 0.5, 900);
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.lookAt(at[0], at[1], at[2]);
  cam.updateMatrixWorld();
  drawing = true;
  inner.renderer.render(inner.scene, cam);
  drawing = false;
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  strip.width = w;
  strip.height = h;
  strip.getContext('2d')!.drawImage(canvas, 0, 0);
  for (const { f, b } of made) {
    inner.scene.remove(f.group, f.shadow, b);
    f.dispose();
  }
  ballGeo.dispose();
  ballMat.dispose();
  return { n, w, h };
}

/**
 * One man on his own (no body drawn): the plan `drive` as `pose` takes it, from 0 to `to` ms in 16 ms frames, and from
 * `from` on each `every`th frame as a line: his clip and move, the pose channels in `keys`, each hand from its shoulder
 * in his own frame (x to his left, up, ahead; ft) and each elbow's bend (radians from straight).
 */
function solo({ drive = '', from = 0, to = 1500, every = 1, keys = ['ly', 'lz', 'gl'] as string[], toss = null as number[] | null } = {}) {
  const make = new Function(`return ${drive}`)() as (t: number) => Drive;
  const p = new Puppet(bodyOf(78, 215));
  const out: string[] = [];
  const j = p.j;
  const fmt = (v: number) => v.toFixed(2);
  const own = (k: number, sh: number) => {
    const [dx, dy, dz] = [j[k * 3] - j[sh * 3], j[k * 3 + 1] - j[sh * 3 + 1], j[k * 3 + 2] - j[sh * 3 + 2]];
    return `${fmt(dx * p.left.x + dy * p.left.y + dz * p.left.z)},${fmt(dx * p.up.x + dy * p.up.y + dz * p.up.z)},${fmt(dx * p.front.x + dy * p.front.y + dz * p.front.z)}`;
  };
  const bend = (sh: number, el: number, ha: number) => {
    const u = new Vector3(j[el * 3] - j[sh * 3], j[el * 3 + 1] - j[sh * 3 + 1], j[el * 3 + 2] - j[sh * 3 + 2]);
    const v = new Vector3(j[ha * 3] - j[el * 3], j[ha * 3 + 1] - j[el * 3 + 1], j[ha * 3 + 2] - j[el * 3 + 2]);
    return fmt(u.angleTo(v));
  };
  let n = 0;
  // (a ball thrown to him, as `pose` throws it)
  let thrown: V3 | null = null;
  let flew = false;
  const was = { x: 0, y: 0, z: 0 };
  for (let t = 16; t <= to; t += 16) {
    const d = make(t);
    p.update(d, 16, 16, 16);
    let ball: V3 | null = d.ball ? p.carry({ x: 0, y: 0, z: 0 }) : null;
    if (toss && !d.ball && d.act === 'catch' && d.dur > 0) {
      const to = p.carry({ x: 0, y: 0, z: 0 });
      thrown ??= { x: to.x + toss[0], y: toss[1], z: to.z + toss[2] };
      const u = Math.max(0, Math.min(1, d.ms / d.dur));
      const lift = Math.min(1.8, d.dur / 1000);
      ball = { x: thrown.x + (to.x - thrown.x) * u, y: thrown.y + (to.y - thrown.y) * u + 4 * lift * u * (1 - u), z: thrown.z + (to.z - thrown.z) * u };
      flew = true;
    } else if (ball && flew) {
      p.caught({ x: ((ball.x - was.x) * 1000) / 16, y: ((ball.y - was.y) * 1000) / 16, z: ((ball.z - was.z) * 1000) / 16 });
      flew = false;
    }
    p.arms(ball);
    if (ball && d.ball && p.holds(V) > 0.5) ball = { x: V.x, y: V.y, z: V.z };
    if (ball) Object.assign(was, ball);
    if (t < from || n++ % every) continue;
    const one = p.one ? `(${p.one.id}@${Math.round(p.one.tau)})` : '';
    // (the ball in his frame: to his left, up, ahead)
    let bl = '';
    if (ball) {
      const [dx, dz] = [ball.x - p.x, ball.z - p.z];
      const [sn, cs] = [Math.sin(p.yaw), Math.cos(p.yaw)];
      bl = ` B[${fmt(dx * cs - dz * sn)},${fmt(ball.y)},${fmt(dx * sn + dz * cs)}]`;
    }
    out.push(
      `${t} ${p.clip}${one} ${keys.map((k) => `${k}${fmt(p.pose[I[k as keyof typeof I]])}`).join(' ')} L[${own(J.hl, J.sl)}] e${bend(J.sl, J.el, J.hl)} R[${own(J.hr, J.sr)}] e${bend(J.sr, J.er, J.hr)} hl[${fmt(j[J.hl * 3])},${fmt(j[J.hl * 3 + 1])},${fmt(j[J.hl * 3 + 2])}]${bl}`,
    );
  }
  return out;
}

/**
 * One man through possession k (play ms `from` to `to`), frame by frame: his clip and move, how far into its blend,
 * the pose channels named in `keys`, and joints of his (J names) in the scene.
 */
function track({ k = 0, pid = -1, from = 0, to = Infinity, speed = 2, keys = ['lx', 'ly', 'lz'] as string[], joints = ['hl'] as string[], lead = 2 } = {}) {
  const c = new Clock(speed);
  if (lead >= k) c.tipMs = 0;
  c.k = Math.max(0, k - lead);
  while (c.k < k && c.finalMs < 0) c.step();
  const out: string[] = [];
  while (c.k === k && c.finalMs < 0) {
    c.step();
    if (c.k !== k || c.t < from || c.t > to) continue;
    const f = inner.figs.get(pid >= 0 ? pid : scripts[k].oPids[0]);
    if (!f) continue;
    const p = f.pup;
    const raw = p as unknown as { blend: number; one: { id: string; tau: number } | null };
    const j = joints.map((n) => {
      const q = J[n as keyof typeof J];
      const w = p.world(p.j[q * 3], p.j[q * 3 + 1], p.j[q * 3 + 2], V);
      return `${n}(${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)})`;
    });
    out.push(
      `${Math.round(c.t)} i${c.stage.play?.i} ${p.clip}${raw.one ? `(${raw.one.id}@${Math.round(raw.one.tau)})` : ''} b${raw.blend.toFixed(2)} yaw${p.yaw.toFixed(2)} ${keys.map((n) => `${n}${p.pose[I[n as keyof typeof I]].toFixed(2)}`).join(' ')} ${j.join(' ')}`,
    );
  }
  return out;
}

/** The ball through possession k (play ms `from` to `to`), every `every` frames: where it is (ft) and its biggest jump in a frame. */
function trace({ k = 0, from = 0, to = Infinity, every = 2, speed = 2 } = {}) {
  const c = new Clock(speed);
  c.k = Math.max(0, k - 2);
  while (c.k < k && c.finalMs < 0) c.step();
  const out: string[] = [];
  let n = 0;
  let worst = 0;
  const was = inner.ball.clone();
  while (c.k === k && c.finalMs < 0) {
    c.step();
    const b = inner.ball;
    if (c.t >= from && c.t <= to) {
      worst = Math.max(worst, b.distanceTo(was));
      if (n++ % every === 0) out.push(`${Math.round(c.t)} i${c.stage.play?.i} ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`);
    }
    was.copy(b);
  }
  return { worst: Math.round(worst * 100) / 100, out };
}

/**
 * The ball through the arms of the men it isn't in the hands of, over the whole game at a speed chip (the arms as
 * Puppet.arms leaves them, the ball where the scene has it then): each frame a man has his upper arm, his forearm or
 * his hand (on past the wrist as far as its fingers) in it, by part and by his clip, with the worst to film.
 * `off`: his hands are not told where the ball is (what they did before they kept out of its way).
 */
function ballArms({ speed = 2, off = false } = {}) {
  const was = Puppet.prototype.arms;
  const by = new Map<string, number>();
  const at: string[] = [];
  let frames = 0;
  let c: Clock | null = null;
  const P3 = (j: Float32Array, k: number) => new Vector3(j[k * 3], j[k * 3 + 1], j[k * 3 + 2]);
  Puppet.prototype.arms = function (this: Puppet, ball, near, loose) {
    was.call(this, ball, near, off ? null : loose);
    if (ball || !loose) return;
    const s = this.body.s;
    const b = new Vector3(loose.at.x, loose.at.y, loose.at.z);
    let any = false;
    for (const [side, sh, el, ha] of [
      ['L', J.sl, J.el, J.hl],
      ['R', J.sr, J.er, J.hr],
    ] as const) {
      const [S, E, H] = [P3(this.j, sh), P3(this.j, el), P3(this.j, ha)];
      const T = H.clone().addScaledVector(H.clone().sub(E).normalize(), 0.5 * s);
      for (const [part, a, z, w] of [
        ['upper', S, E, 0.17],
        ['forearm', E, H, 0.13],
        ['hand', H, T, 0.1],
      ] as const) {
        const wa = this.world(a.x, a.y, a.z, { x: 0, y: 0, z: 0 });
        const wz = this.world(z.x, z.y, z.z, { x: 0, y: 0, z: 0 });
        if (w * s + BALL_R - seg(b, new Vector3(wa.x, wa.y, wa.z), new Vector3(wz.x, wz.y, wz.z)) <= 0.05) continue;
        any = true;
        by.set(`${part} ${this.clip}`, (by.get(`${part} ${this.clip}`) ?? 0) + 1);
        if (at.length < 12 && c) at.push(`k${c.k} t${Math.round(c.t)} ${side}${part} ${this.clip}`);
      }
    }
    if (any) frames++;
  };
  try {
    c = new Clock(speed);
    c.tipMs = 0;
    while (c.step());
  } finally {
    Puppet.prototype.arms = was;
  }
  return { frames, by: Object.fromEntries([...by].sort((x, y) => y[1] - x[1]).slice(0, 16)), at };
}

/**
 * A runner's knees, popped (measure's rule, in a gait only): what his feet were doing about it, by his speed. For each
 * pop, the frames either side of it: each foot's swing (S, E early, L the frame it lands, U the frame it goes up),
 * its height, how far behind or ahead of his hips it is (ft, along his travel), his hip height and the knee's bend.
 */
function knees({ speed = 2, only = 'run', most = 30, from = 0, to = Infinity } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  type Fr = { bend: number[]; s: string };
  const hist = new Map<number, Fr[]>();
  const byWhy = new Map<string, number>();
  const bySpeed = new Map<number, number>();
  const out: string[] = [];
  let n = 0;
  while (c.step() && c.k < to) {
    if (c.k < from) continue;
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const raw = p as unknown as {
        feet: { swing: boolean; early: number; up: number; x: number; z: number }[];
        phase: number;
        one: { id: string } | null;
        spLag: number;
        downE: number;
      };
      const j = p.j;
      const sp = Math.hypot(p.vf, p.vs);
      const bend = [0, 1].map((k) => {
        const [hj, kj, fj] = k ? [J.jr, J.kr, J.fr] : [J.jl, J.kl, J.fl];
        HL.set(j[hj * 3] - j[kj * 3], j[hj * 3 + 1] - j[kj * 3 + 1], j[hj * 3 + 2] - j[kj * 3 + 2]);
        HR.set(j[fj * 3] - j[kj * 3], j[fj * 3 + 1] - j[kj * 3 + 1], j[fj * 3 + 2] - j[kj * 3 + 2]);
        return HL.angleTo(HR);
      });
      let h = hist.get(pid);
      if (!h || Math.hypot(p.x - (h[h.length - 1] as Fr & { x: number }).x, p.z - (h[h.length - 1] as Fr & { z: number }).z) > 3) hist.set(pid, (h = []));
      const was = h[h.length - 1] as (Fr & { sw: boolean[] }) | undefined;
      const feet = raw.feet
        .map((ft, k) => {
          const lz = (ft.x - p.x) * Math.sin(p.yaw) + (ft.z - p.z) * Math.cos(p.yaw);
          const tag = ft.swing ? (was && !was.sw[k] ? 'U' : ft.early ? 'E' : 'S') : was?.sw[k] ? 'L' : '-';
          return `${tag}${ft.up.toFixed(2)}@${lz.toFixed(1)}`;
        })
        .join(' ');
      const fr = {
        bend,
        sw: raw.feet.map((ft) => ft.swing),
        x: p.x,
        z: p.z,
        s: `${p.clip}${raw.one ? '(' + raw.one.id + ')' : ''} sp${sp.toFixed(1)} lag${raw.spLag.toFixed(1)} ph${raw.phase.toFixed(2)} dn${raw.downE.toFixed(2)} hip${j[J.hips * 3 + 1].toFixed(2)} ${feet} kn${bend.map((b) => b.toFixed(2)).join('/')}`,
      };
      h.push(fr as Fr);
      if (h.length > 4) h.shift();
      if (h.length < 4 || !p.clip.includes(only)) continue;
      for (const k of [0, 1]) {
        const s1 = Math.abs(h[1].bend[k] - h[0].bend[k]);
        const s2 = Math.abs(h[2].bend[k] - h[1].bend[k]);
        const s3 = Math.abs(h[3].bend[k] - h[2].bend[k]);
        const w2 = h[2].bend[k] - h[1].bend[k];
        const w3 = h[3].bend[k] - h[2].bend[k];
        const kink = w2 * w3 < 0 && Math.abs(w3 - w2) > KINK * speed;
        if (!(popped(s2, s1, s3, KNEE_POP * speed) > 0 || kink)) continue;
        n++;
        const tags = h.map((x) => x.s.split(' ').filter((t) => /^[-SEUL]\d/.test(t))[k][0]).join('');
        const why = (kink ? 'kink ' : 'pop ') + tags;
        byWhy.set(why, (byWhy.get(why) ?? 0) + 1);
        const band = Math.round(sp / 3) * 3;
        bySpeed.set(band, (bySpeed.get(band) ?? 0) + 1);
        if (out.length < most) out.push(`k${c.k} t${Math.round(c.t)} p${pid} ${k ? 'R' : 'L'} ${why}\n  ${h.map((x) => x.s).join('\n  ')}`);
      }
    }
  }
  return {
    n,
    why: Object.fromEntries([...byWhy].sort((x, y) => y[1] - x[1]).slice(0, 24)),
    speed: Object.fromEntries([...bySpeed].sort((x, y) => x[0] - y[0])),
    out,
  };
}

/**
 * Hard starts from a stand (the bodies' time): a man stood (under STOOD ft a second) for a beat who is past
 * GOT_GOING within a second. His first three swings: how long each foot was up (ms), how far it went (ft, on a
 * 6 ft 6 man) and how fast he was going as it landed; with how far he leans over them. `worst`: the longest first swings.
 */
const STOOD = 2;
const GOT_GOING = 14;
function starts({ speed = 2, most = 12 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const own = FRAME * speed;
  type St = {
    still: number;
    t: number;
    on: number;
    swings: { ms: number; ft: number; v: number }[];
    up: (null | { t: number; x: number; z: number })[];
    lean: number;
    n: number;
    px: number;
    pz: number;
  };
  const men = new Map<number, St>();
  const done: { first: number[]; at: string; lean: number }[] = [];
  let t = 0;
  while (c.step()) {
    t += own;
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      let m = men.get(pid);
      if (!m) men.set(pid, (m = { still: 0, t: -1, on: 0, swings: [], up: [null, null], lean: 0, n: 0, px: p.x, pz: p.z }));
      const v = Math.hypot(p.x - m.px, p.z - m.pz) / (own / 1000);
      [m.px, m.pz] = [p.x, p.z];
      if (v > 60) {
        m.t = -1;
        m.still = 0;
        continue;
      }
      if (m.t < 0) {
        if (m.still > 250 && v >= STOOD) [m.t, m.swings, m.up, m.lean, m.n, m.on] = [t, [], [null, null], 0, 0, 0];
        m.still = v < STOOD ? m.still + own : 0;
        continue;
      }
      m.lean += p.pose[I.lean];
      m.n++;
      if (v > GOT_GOING) m.on = 1;
      p.feet.forEach((ft, k) => {
        if (ft.swing && !m!.up[k]) m!.up[k] = { t, x: ft.x, z: ft.z };
        if (!ft.swing && m!.up[k]) {
          const u = m!.up[k]!;
          m!.swings.push({ ms: t - u.t, ft: Math.hypot(ft.x - u.x, ft.z - u.z) / p.body.s, v });
          m!.up[k] = null;
        }
      });
      if (t - m.t > 1000 || m.swings.length >= 3 || p.one?.id === 'stumble' || p.pose[I.air] > 0.5) {
        if (m.on && m.swings.length >= 2)
          done.push({ first: m.swings.flatMap((s) => [s.ms, s.ft, s.v]), at: `k${c.k} t${Math.round(c.t)} p${pid}`, lean: m.lean / Math.max(1, m.n) });
        m.t = -1;
        m.still = 0;
      }
    }
  }
  const avg = (i: number) => Math.round((done.reduce((a, d) => a + (d.first[i] ?? 0), 0) / Math.max(1, done.filter((d) => d.first[i] !== undefined).length)) * 100) / 100;
  return {
    n: done.length,
    first: { ms: avg(0), ft: avg(1), v: avg(2) },
    second: { ms: avg(3), ft: avg(4), v: avg(5) },
    third: { ms: avg(6), ft: avg(7), v: avg(8) },
    lean: Math.round((done.reduce((a, d) => a + d.lean, 0) / Math.max(1, done.length)) * 1000) / 1000,
    worst: done
      .sort((a, b) => b.first[0] - a.first[0])
      .slice(0, most)
      .map((d) => `${d.at} ${d.first.map((x) => Math.round(x * 10) / 10).join(' ')}`),
  };
}

/**
 * Big turns of his body (more than BIG radians, one way, without a pause) while he is going: how fast he was going
 * as it turned (ft a second, the bodies' time), how much of it was turned at more than SPIN_FROM ft a second (a
 * turntable), how much over a planted foot, and how fast it came round at its quickest (radians a second). Not
 * in a move (a shot, a pass) or in the air. `worst`: the most turned at speed, to film (`k t pid clip`).
 */
const BIG = 1.4;
const SPIN_FROM = 10;
function spins({ speed = 2, most = 12, only = '' } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const sec = (FRAME * speed) / 1000;
  type Tn = { yaw: number; x: number; z: number; dir: number; turned: number; fast: number; down: number; v: number; n: number; top: number; at: string; clip: string };
  const men = new Map<number, Tn>();
  const done: Tn[] = [];
  const end = (m: Tn) => {
    if (m.turned > BIG) done.push({ ...m });
    Object.assign(m, { dir: 0, turned: 0, fast: 0, down: 0, v: 0, n: 0, top: 0 });
  };
  while (c.step()) {
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      let m = men.get(pid);
      if (!m) men.set(pid, (m = { yaw: p.yaw, x: p.x, z: p.z, dir: 0, turned: 0, fast: 0, down: 0, v: 0, n: 0, top: 0, at: '', clip: '' }));
      const v = Math.hypot(p.x - m.x, p.z - m.z) / sec;
      const dy = wrap(p.yaw - m.yaw);
      [m.yaw, m.x, m.z] = [p.yaw, p.x, p.z];
      if (v > 60 || p.one || p.pose[I.air] > 0.3) {
        end(m);
        continue;
      }
      const rate = Math.abs(dy) / sec;
      if (rate < 0.5 || (m.dir && Math.sign(dy) !== m.dir)) {
        end(m);
        if (rate < 0.5) continue;
      }
      if (!m.dir) [m.dir, m.at, m.clip] = [Math.sign(dy), `k${c.k} t${Math.round(c.t)} p${pid}`, p.clip];
      m.turned += Math.abs(dy);
      if (v > SPIN_FROM) m.fast += Math.abs(dy);
      if (p.feet.some((ft) => !ft.swing)) m.down += Math.abs(dy);
      m.v += v;
      m.n++;
      m.top = Math.max(m.top, rate);
    }
  }
  const sum = (k: 'turned' | 'fast' | 'down') => done.reduce((a, d) => a + d[k], 0);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    n: done.length,
    atSpeed: done.filter((d) => d.fast > BIG / 2).length,
    fastPct: r2((sum('fast') / Math.max(1e-6, sum('turned'))) * 100),
    downPct: r2((sum('down') / Math.max(1e-6, sum('turned'))) * 100),
    meanV: r2(done.reduce((a, d) => a + d.v / d.n, 0) / Math.max(1, done.length)),
    topRate: r2(done.reduce((a, d) => a + d.top, 0) / Math.max(1, done.length)),
    worst: done
      .filter((d) => d.clip.includes(only))
      .sort((a, b) => b.fast - a.fast)
      .slice(0, most)
      .map((d) => `${d.at} ${d.clip} turned ${r2(d.turned)} at speed ${r2(d.fast)} v${r2(d.v / d.n)} top ${r2(d.top)}`),
  };
}

/**
 * Two men the play has meet body to body (a box-out, a screen): the frames a leg of one is inside a leg or the
 * trunk of the other (more than HIT ft), by the pair's clips; how deep at worst; and the worst to film (`k t a/b`).
 */
function meetLegs({ speed = 2, most = 12, k = -1 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const meeting = (scene as unknown as { meeting: { i: number; j: number; w: number }[] }).meeting ?? [];
  const LT = [...PARTS.legs, ...PARTS.trunk];
  const wa = new Float32Array(45);
  const wb = new Float32Array(45);
  const put = (f: Fig, out: Float32Array) => {
    for (let k = 0; k < 15; k++) {
      f.pup.world(f.pup.j[k * 3], f.pup.j[k * 3 + 1], f.pup.j[k * 3 + 2], V);
      [out[k * 3], out[k * 3 + 1], out[k * 3 + 2]] = [V.x, V.y, V.z];
    }
  };
  let frames = 0;
  let n = 0;
  let deepest = 0;
  const why = new Map<string, number>();
  const at: { d: number; s: string }[] = [];
  while (c.step()) {
    const sc = c.stage.script;
    if (!sc || !c.stage.play) continue;
    const pids = [...sc.oPids, ...sc.dPids];
    for (const m of meeting) {
      if (m.w < 0.2) continue;
      const fa = inner.figs.get(pids[m.i]);
      const fb = inner.figs.get(pids[m.j]);
      if (!fa || !fb) continue;
      frames++;
      put(fa, wa);
      put(fb, wb);
      const [A, B] = [fa.pup.body, fb.pup.body];
      const d = Math.max(into(wa, A.s, A.bulk, wb, B.s, B.bulk, PARTS.legs, LT), into(wb, B.s, B.bulk, wa, A.s, A.bulk, PARTS.legs, LT));
      // (`k`: that possession's meetings frame by frame: how far apart their middles are, their trunks' room, how deep a leg is)
      if (c.k === k)
        at.push({
          d: -c.t,
          s: `t${Math.round(c.t)} ${pids[m.i]}/${pids[m.j]} ${fa.pup.clip}+${fb.pup.clip} w${m.w.toFixed(2)} apart ${Math.hypot(fa.pup.x - fb.pup.x, fa.pup.z - fb.pup.z).toFixed(2)} trunks ${clearance(wa, A.s, A.bulk, wb, B.s, B.bulk, false).toFixed(2)} leg ${d.toFixed(2)}`,
        });
      if (d <= HIT || k >= 0) continue;
      n++;
      deepest = Math.max(deepest, d);
      const pair = [fa.pup.clip, fb.pup.clip].sort().join('+');
      why.set(pair, (why.get(pair) ?? 0) + 1);
      at.push({ d, s: `k${c.k} t${Math.round(c.t)} ${pids[m.i]}/${pids[m.j]} ${pair} ${d.toFixed(2)}` });
    }
  }
  return {
    frames,
    n,
    pct: Math.round((n / Math.max(1, frames)) * 10000) / 100,
    deepest: Math.round(deepest * 100) / 100,
    why: Object.fromEntries([...why].sort((x, y) => y[1] - x[1]).slice(0, 10)),
    worst: (k >= 0 ? at.slice(0, 400) : at)
      .sort((x, y) => y.d - x.d)
      .filter((x, i, l) => k >= 0 || l.findIndex((y) => y.s.split(' ')[0] === x.s.split(' ')[0]) === i)
      .slice(0, k >= 0 ? 400 : most)
      .map((x) => x.s),
  };
}

/**
 * Each knock (Puppet.hit) over the next KNOCK_LOOK ms of his body's time, by how hard (power under 0.4, to 0.7, over):
 * how far his trunk (hips to chest) was thrown off where it was (degrees, at most), when (ms), and his head (chest
 * to head) the same; how many took a step (a foot up) within it. `worst`: the hardest, to film (`k t pid`).
 */
const KNOCK_LOOK = 600;
function knockLook({ speed = 2, most = 12 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const own = FRAME * speed;
  type Kn = {
    p: Puppet;
    power: number;
    t: number;
    trunk: Vector3;
    head: Vector3;
    peak: number;
    at: number;
    hpeak: number;
    hat: number;
    thrown: number;
    stepped: boolean;
    was: boolean[];
    where: string;
  };
  const live: Kn[] = [];
  const done: Kn[] = [];
  const axis = (p: Puppet, a: number, b: number, out: Vector3) => out.set(p.j[b * 3] - p.j[a * 3], p.j[b * 3 + 1] - p.j[a * 3 + 1], p.j[b * 3 + 2] - p.j[a * 3 + 2]).normalize();
  const T = new Vector3();
  let t = 0;
  const hitNow = Puppet.prototype.hit;
  Puppet.prototype.hit = function (this: Puppet, dx: number, dz: number, power: number) {
    hitNow.call(this, dx, dz, power);
    if (live.some((k) => k.p === this)) return;
    live.push({
      p: this,
      power,
      t,
      trunk: axis(this, J.hips, J.chest, new Vector3()),
      head: axis(this, J.chest, J.head, new Vector3()),
      peak: 0,
      at: 0,
      hpeak: 0,
      hat: 0,
      thrown: 0,
      stepped: false,
      was: this.feet.map((f) => f.swing),
      where: `k${c.k} t${Math.round(c.t)} p${(this as unknown as { who: number }).who} ${this.clip}`,
    });
  };
  while (c.step()) {
    t += own;
    for (let i = live.length - 1; i >= 0; i--) {
      const k = live[i];
      const a = (axis(k.p, J.hips, J.chest, T).angleTo(k.trunk) * 180) / Math.PI;
      if (a > k.peak) [k.peak, k.at] = [a, t - k.t];
      // (the knock's own throw of his trunk, laid on whatever else he is doing: see Puppet.knock)
      const jo = (k.p as unknown as { jolt: Float32Array }).jolt;
      k.thrown = Math.max(k.thrown, (Math.hypot(jo[1] * 1.3, jo[0] * 1.1) * 180) / Math.PI);
      const h = (axis(k.p, J.chest, J.head, T).angleTo(k.head) * 180) / Math.PI;
      if (h > k.hpeak) [k.hpeak, k.hat] = [h, t - k.t];
      k.p.feet.forEach((f, n) => {
        if (f.swing && !k.was[n]) k.stepped = true;
        k.was[n] = f.swing;
      });
      if (t - k.t >= KNOCK_LOOK || k.p.pose[I.air] > 0.3) {
        done.push(k);
        live.splice(i, 1);
      }
    }
  }
  Puppet.prototype.hit = hitNow;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const bin = (lo: number, hi: number) => {
    const l = done.filter((k) => k.power >= lo && k.power < hi);
    const avg = (f: (k: Kn) => number) => r1(l.reduce((s, k) => s + f(k), 0) / Math.max(1, l.length));
    return {
      n: l.length,
      thrownDeg: avg((k) => k.thrown),
      trunkDeg: avg((k) => k.peak),
      trunkMs: avg((k) => k.at),
      headDeg: avg((k) => k.hpeak),
      headMs: avg((k) => k.hat),
      stepPct: avg((k) => (k.stepped ? 100 : 0)),
    };
  };
  return {
    soft: bin(0, 0.4),
    firm: bin(0.4, 0.7),
    hard: bin(0.7, 9),
    worst: done
      .sort((a, b) => b.power - a.power)
      .slice(0, most)
      .map(
        (k) =>
          `${k.where} ${k.power.toFixed(2)} thrown ${r1(k.thrown)} trunk ${r1(k.peak)}deg@${Math.round(k.at)} head ${r1(k.hpeak)}@${Math.round(k.hat)} ${k.stepped ? 'stepped' : ''}`,
      ),
  };
}

/**
 * His shoes as the body draws them (figure.ts's foot bones, as the viewer sees them), over the whole game at a speed
 * chip. A sole point (heel, ball, toe tip: SOLE, in the bone's own frame) within FLOOR_ON ft of the floor is on it.
 * A heel or a ball on the floor two frames running that moves along it more than SLID ft has slid (a planted foot) or
 * been dragged (a swinging one, going up or coming down, or one hanging from him in the air); a shoe flat on the
 * floor two frames running (heel and ball down) that turns more than SPUN degrees has spun on it; a sole point more
 * than SUNK ft under the floor is in it; a foot the puppet has planted with its sole more than SKIPPED ft off the
 * floor skips. Each by what the plan has him doing (his act, `+land` for LANDED frames after he comes down from a
 * jump, `+touch` while he meets a man body to body) and by clip; with steps a second (a foot leaving the floor).
 */
const SOLE: readonly [string, number][] = [
  ['heel', -HEEL],
  ['ball', BALL],
  ['toe', 0.72],
];
const FLOOR_ON = 0.05;
const SLID = 0.03;
const SPUN = 2;
const SUNK = 0.06;
const SKIPPED = 0.12;
const LANDED = 12;
function feet({ speed = 2, only = '', most = 12 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const sec = (FRAME * speed) / 1000;
  type Row = { on: number; slid: number; ft: number; drag: number; spin: number; deg: number; sunk: number; skip: number; steps: number; frames: number };
  const row = (): Row => ({ on: 0, slid: 0, ft: 0, drag: 0, spin: 0, deg: 0, sunk: 0, skip: 0, steps: 0, frames: 0 });
  const byAct = new Map<string, Row>();
  const byClip = new Map<string, Row>();
  const all = row();
  const rows = (act: string, clip: string): Row[] => {
    let a = byAct.get(act);
    if (!a) byAct.set(act, (a = row()));
    let b = byClip.get(clip);
    if (!b) byClip.set(clip, (b = row()));
    return [all, a, b];
  };
  const worst = new Map<string, { mag: number; at: string; key: string }[]>();
  const top = (kind: string, mag: number, at: string, key: string) => {
    if (only && !at.includes(only)) return;
    let l = worst.get(kind);
    if (!l) worst.set(kind, (l = []));
    const same = l.findIndex((x) => x.key === key);
    if (same >= 0) {
      if (l[same].mag >= mag) return;
      l.splice(same, 1);
    }
    l.push({ mag, at, key });
    l.sort((x, y) => y.mag - x.mag);
    if (l.length > most) l.pop();
  };
  // each man's shoes last frame: each sole point (x, y, z), the heading, whether the puppet had it swinging; when he last came down
  type Was = { pts: Float32Array; yaw: Float32Array; swing: boolean[]; x: number; z: number; landed: number; air: boolean };
  const men = new Map<number, Was>();
  const pts = new Float32Array(SOLE.length * 3 * 2);
  const yaws = new Float32Array(2);
  const L = new Vector3();
  const UPV = new Vector3(0, 1, 0);
  // (which sole point is deepest in the floor, when one is: heel, ball, toe)
  const sunkBy = [0, 0, 0];
  cutNow = false;
  while (c.step()) {
    const figs = [...inner.figs.entries()];
    const cut = cutNow || figs.some(([pid, f]) => (men.has(pid) ? Math.hypot(f.pup.x - men.get(pid)!.x, f.pup.z - men.get(pid)!.z) > 2.5 : false));
    cutNow = false;
    for (const [pid, f] of figs) {
      const p = f.pup;
      const bones = (f as unknown as { bones: Bone[] }).bones;
      // (each shoe's sole points and its heading, as drawn)
      for (let k = 0; k < 2; k++) {
        const b = bones[k ? 14 : 11];
        SOLE.forEach(([, z], i) => {
          L.set(0, -0.28, z).multiply(b.scale).applyQuaternion(b.quaternion).add(b.position).applyAxisAngle(UPV, f.group.rotation.y).add(f.group.position);
          pts.set([L.x, L.y, L.z], (k * SOLE.length + i) * 3);
        });
        L.set(0, 0, 1).applyQuaternion(b.quaternion).applyAxisAngle(UPV, f.group.rotation.y);
        yaws[k] = Math.atan2(L.x, L.z);
      }
      const air = p.pose[I.air] > 0.5;
      let m = men.get(pid);
      if (!m) men.set(pid, (m = { pts: new Float32Array(pts.length), yaw: new Float32Array(2), swing: [false, false], x: p.x, z: p.z, landed: 99, air }));
      m.landed = m.air && !air ? 0 : m.landed + 1;
      if (!cut) {
        const raw = p as unknown as { felt: number };
        const act = `${actOfPid(c, pid)}${m.landed < LANDED ? '+land' : ''}${raw.felt > 0.3 ? '+touch' : ''}`;
        const at = `k${c.k} t${Math.round(c.t)} p${pid} ${act} ${p.clip}${p.one ? '(' + p.one.id + ')' : ''}`;
        const rs = rows(act, p.clip);
        for (const r of rs) r.frames++;
        for (let k = 0; k < 2; k++) {
          const ft = p.feet[k];
          const o = k * SOLE.length * 3;
          const y = (i: number) => pts[o + i * 3 + 1];
          const yw = (i: number) => m!.pts[o + i * 3 + 1];
          const on = SOLE.map((_, i) => y(i) < FLOOR_ON);
          const was = SOLE.map((_, i) => yw(i) < FLOOR_ON);
          if (ft.swing && !m.swing[k]) for (const r of rs) r.steps++;
          if (on.some(Boolean)) for (const r of rs) r.on++;
          // (a heel or a ball down both frames that moved along the floor)
          let slid = 0;
          for (const i of [0, 1]) if (on[i] && was[i]) slid = Math.max(slid, Math.hypot(pts[o + i * 3] - m.pts[o + i * 3], pts[o + i * 3 + 2] - m.pts[o + i * 3 + 2]));
          // (a planted foot that slides; a swinging one that is dragged along the floor as it goes up or comes down)
          if (slid > SLID && !ft.swing && !m.swing[k] && !air && !m.air) {
            for (const r of rs) [r.slid, r.ft] = [r.slid + 1, r.ft + slid];
            top('slide', slid, `${at} ${k ? 'R' : 'L'}`, `${c.k}:${pid}`);
          } else if (slid > SLID) {
            for (const r of rs) r.drag++;
            top('drag', slid, `${at} ${k ? 'R' : 'L'}`, `${c.k}:${pid}`);
          }
          // (flat on the floor both frames, and turned)
          if (on[0] && on[1] && was[0] && was[1]) {
            const deg = (Math.abs(wrap(yaws[k] - m.yaw[k])) * 180) / Math.PI;
            if (deg > SPUN) {
              for (const r of rs) [r.spin, r.deg] = [r.spin + 1, r.deg + deg];
              top('spin', deg, `${at} ${k ? 'R' : 'L'}`, `${c.k}:${pid}`);
            }
          }
          const low = Math.min(y(0), y(1), y(2));
          if (low < -SUNK) {
            for (const r of rs) r.sunk++;
            const i = [y(0), y(1), y(2)].indexOf(low);
            sunkBy[i]++;
            top('sunk', -low, `${at} ${k ? 'R' : 'L'} ${SOLE[i][0]} pitch ${ft.pitch.toFixed(2)}`, `${c.k}:${pid}`);
          }
          if (!ft.swing && !air && low > SKIPPED) {
            for (const r of rs) r.skip++;
            top('skip', low, `${at} ${k ? 'R' : 'L'}`, `${c.k}:${pid}`);
          }
        }
      }
      m.pts.set(pts);
      m.yaw.set(yaws);
      m.swing = p.feet.map((ft) => ft.swing);
      [m.x, m.z, m.air] = [p.x, p.z, air];
    }
  }
  const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 10000) / 100;
  const out = (r: Row) => ({
    frames: r.frames,
    slidPct: pct(r.slid, r.on),
    slidFt: Math.round((r.ft / Math.max(1, r.slid)) * 1000) / 1000,
    dragPct: pct(r.drag, r.on),
    spinPct: pct(r.spin, r.on),
    spinDeg: Math.round((r.deg / Math.max(1, r.spin)) * 10) / 10,
    sunkPct: pct(r.sunk, r.frames * 2),
    skipPct: pct(r.skip, r.frames * 2),
    stepsPerSec: Math.round((r.steps / Math.max(1e-6, r.frames * sec)) * 100) / 100,
  });
  const table = (m: Map<string, Row>, n: number) =>
    Object.fromEntries(
      [...m]
        .sort((x, y) => y[1].frames - x[1].frames)
        .slice(0, n)
        .map(([k, r]) => [k, out(r)]),
    );
  return {
    all: out(all),
    sunkBy: Object.fromEntries(SOLE.map(([n], i) => [n, sunkBy[i]])),
    acts: table(byAct, 30),
    clips: table(byClip, 30),
    worst: Object.fromEntries([...worst].map(([k, l]) => [k, l.map((x) => `${x.at} ${x.mag.toFixed(2)}`)])),
  };
}

/**
 * His footwork as the puppet plans it, over the whole game at a speed chip (feet as the puppet has them: down, or
 * swinging):
 *  - `held`: each spell he has the ball and isn't dribbling it, on the floor (a catch, a hold, a wind-up). Both feet
 *    stepping in one spell while the plan has him all but still (under HELD_STILL ft a second) is a travel; how far
 *    round the foot he keeps down was turned while he did (`pivotDeg`, a spell);
 *  - `takeoffs`: each jump, by the move, off which foot (the one down the frame before he leaves the floor: both, his
 *    left, his right, or neither); for a layup (and the one-foot moves) whether it was off the foot opposite the hand
 *    he finishes with (`right`);
 *  - `slides`: a slide's steps, by whether the foot on the side he goes leaves first (`lead`), the other after it
 *    (`trail`), and frames the feet are nearer than SLIDE_NEAR across him (clicked) or crossed;
 *  - `contact`: body to body (boxing out, crashing), how wide his feet are and how low his hips (on the 6 ft 6 puppet);
 *  - `jumps`: a foot moved farther in a frame than FOOT_JUMP ft past what a foot swung at FOOT_SWUNG times his own travel
 *    covers, by clip, and the worst to film.
 */
const HELD_STILL = 3;
const SLIDE_NEAR = 0.35;
const FOOT_JUMP = 0.6;
const FOOT_SWUNG = 2.6;
function footwork({ speed = 2, most = 10 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  type Raw = { has: boolean; south: boolean; felt: number; vs: number; vx: number; vz: number };
  type Man = {
    held: boolean;
    steps: [number, number];
    still: [number, number];
    deg: number;
    air: boolean;
    down: [boolean, boolean];
    swing: [boolean, boolean];
    x: number[];
    z: number[];
    yaw: number[];
    lastSlide: number;
    px: number;
    pz: number;
  };
  const men = new Map<number, Man>();
  const held = { spells: 0, travels: 0, oneFoot: 0, still: 0, pivotDeg: 0, at: [] as string[] };
  const takeoffs: Record<string, { both: number; L: number; R: number; none: number; right: number }> = {};
  const slides = { lead: 0, trail: 0, again: 0, frames: 0, clicked: 0, crossed: 0 };
  const contact = { frames: 0, wide: 0, hips: 0 };
  const jumps: Record<string, number> = {};
  const worst: string[] = [];
  const DRIB = new Set(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack', 'crossover', 'hesi']);
  const SHOTS = new Set(['jumper', 'floater', 'layup', 'putback', 'hook', 'dunk', 'dunk1', 'dunkHang', 'freeThrow', 'rebound', 'tip', 'block', 'contest']);
  const ONE = new Set(['layup', 'floater', 'hook', 'putback', 'dunk1']);
  cutNow = false;
  const close = (m: Man, at: string) => {
    if (!m.held) return;
    m.held = false;
    held.spells++;
    if (m.still[0] && m.still[1]) {
      held.travels++;
      if (held.at.length < most) held.at.push(at);
    } else if (m.still[0] || m.still[1]) held.oneFoot++;
    held.pivotDeg += m.deg;
  };
  while (c.step()) {
    const cut = cutNow;
    cutNow = false;
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const raw = p as unknown as Raw;
      const { s } = p.body;
      const air = p.pose[I.air] > 0.5;
      const swing = [p.feet[0].swing, p.feet[1].swing] as [boolean, boolean];
      let m = men.get(pid);
      if (!m || cut) {
        if (m) close(m, '');
        m = {
          held: false,
          steps: [0, 0],
          still: [0, 0],
          deg: 0,
          air,
          down: [!swing[0], !swing[1]],
          swing,
          x: p.feet.map((ft) => ft.x),
          z: p.feet.map((ft) => ft.z),
          yaw: p.feet.map((ft) => ft.yaw),
          lastSlide: -1,
          px: p.x,
          pz: p.z,
        };
        men.set(pid, m);
        continue;
      }
      const act = actOfPid(c, pid);
      const at = `k${c.k} t${Math.round(c.t)} p${pid} ${act} ${p.clip}${p.one ? '(' + p.one.id + ')' : ''}`;
      const sp = Math.hypot(raw.vx, raw.vz) * 1000;
      // held, not dribbled
      const holding = raw.has && !DRIB.has(p.clip) && !air && !(p.one && SHOTS.has(p.one.id) && p.one.tau > -60);
      if (holding && !m.held) [m.held, m.steps, m.still, m.deg] = [true, [0, 0], [0, 0], 0];
      else if (!holding && m.held) close(m, at);
      for (let k = 0; k < 2; k++) {
        const ft = p.feet[k];
        const started = swing[k] && !m.swing[k] && !air;
        if (m.held && started) {
          m.steps[k]++;
          if (sp < HELD_STILL) m.still[k]++;
        }
        if (m.held && !swing[k] && !m.swing[k]) m.deg += (Math.abs(wrap(ft.yaw - m.yaw[k])) * 180) / Math.PI;
        // a foot thrown across the floor in a frame
        const moved = Math.hypot(ft.x - m.x[k], ft.z - m.z[k]);
        if (moved > FOOT_JUMP * s + FOOT_SWUNG * Math.hypot(p.x - m.px, p.z - m.pz)) {
          jumps[p.clip] = (jumps[p.clip] ?? 0) + 1;
          if (worst.length < most * 3) worst.push(`${at} ${k ? 'R' : 'L'} ${moved.toFixed(2)} sp${sp.toFixed(0)}`);
        }
      }
      // off the floor: which foot was down the frame before
      if (air && !m.air && p.one) {
        const id = p.one.id;
        const t = (takeoffs[id] ??= { both: 0, L: 0, R: 0, none: 0, right: 0 });
        const [l, r] = m.down;
        if (l && r) t.both++;
        else if (l) t.L++;
        else if (r) t.R++;
        else t.none++;
        if (ONE.has(id) && (raw.south ? r && !l : l && !r)) t.right++;
      }
      // a slide's steps, and how near the feet come across him
      if (p.clip === 'shuffle' && !air) {
        slides.frames++;
        const [, , rx, rz] = [Math.sin(p.yaw), Math.cos(p.yaw), -Math.cos(p.yaw), Math.sin(p.yaw)];
        const across = (p.feet[1].x - p.feet[0].x) * rx + (p.feet[1].z - p.feet[0].z) * rz;
        if (across < 0) slides.crossed++;
        else if (across < SLIDE_NEAR * s) slides.clicked++;
        const lead = raw.vs > 0 ? 1 : 0;
        for (let k = 0; k < 2; k++)
          if (swing[k] && !m.swing[k]) {
            if (k === lead) slides.lead++;
            else slides.trail++;
            if (k === m.lastSlide) slides.again++;
            m.lastSlide = k;
          }
      }
      if (raw.felt > 0.5 && (act === 'boxout' || act === 'crash') && !air) {
        contact.frames++;
        contact.wide += Math.hypot(p.feet[0].x - p.feet[1].x, p.feet[0].z - p.feet[1].z) / s;
        contact.hips += p.j[J.hips * 3 + 1] / s;
      }
      m.down = [!swing[0] && !air, !swing[1] && !air];
      m.swing = swing;
      m.air = air;
      m.x = p.feet.map((ft) => ft.x);
      m.z = p.feet.map((ft) => ft.z);
      m.yaw = p.feet.map((ft) => ft.yaw);
      [m.px, m.pz] = [p.x, p.z];
    }
  }
  for (const m of men.values()) close(m, '');
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    held: { ...held, travelPct: r2((held.travels / Math.max(1, held.spells)) * 100), pivotDeg: r2(held.pivotDeg / Math.max(1, held.spells)) },
    takeoffs,
    slides: { ...slides, clickedPct: r2((slides.clicked / Math.max(1, slides.frames)) * 100), crossedPct: r2((slides.crossed / Math.max(1, slides.frames)) * 100) },
    contact: { frames: contact.frames, wide: r2(contact.wide / Math.max(1, contact.frames)), hips: r2(contact.hips / Math.max(1, contact.frames)) },
    jumps,
    worst: worst.slice(0, most * 3),
  };
}

/**
 * One man's footwork frame by frame through possession k (play ms `from` to `to`): his move and how far into it, the
 * plan's speed, how he is set (pivot foot, loading, a hop, the foot timed to a jump off one and how long until it), how
 * far he stands off the plan's spot, and each foot (down or swinging, where from him in his own frame, how high, its roll).
 */
function footTrace({ k = 0, pid = -1, from = 0, to = Infinity, speed = 2, lead = 2 } = {}) {
  const c = new Clock(speed);
  if (lead >= k) c.tipMs = 0;
  c.k = Math.max(0, k - lead);
  while (c.k < k && c.finalMs < 0) c.step();
  const out: string[] = [];
  type Raw = {
    planSp: number;
    setOn: boolean;
    ox: number;
    oz: number;
    pivotK: number;
    loading: boolean;
    gathering: boolean;
    hopU: number;
    lockK: number;
    lockMs: number;
    vx: number;
    vz: number;
    phase: number;
  };
  while (c.k === k && c.finalMs < 0) {
    c.step();
    if (c.k !== k || c.t < from || c.t > to) continue;
    const f = inner.figs.get(pid >= 0 ? pid : scripts[k].oPids[0]);
    if (!f) continue;
    const p = f.pup;
    const r = p as unknown as Raw;
    const [s, cs] = [Math.sin(p.yaw), Math.cos(p.yaw)];
    const feet = p.feet
      .map((ft) => {
        const dx = ft.x - p.x;
        const dz = ft.z - p.z;
        return `${ft.swing ? 'S' : 'd'}(${(dx * cs - dz * s).toFixed(2)},${(dx * s + dz * cs).toFixed(2)})u${ft.up.toFixed(2)}p${ft.pitch.toFixed(2)}`;
      })
      .join(' ');
    out.push(
      `${Math.round(c.t)} ${actOfPid(c, pid)} ${p.clip}${p.one ? `(${p.one.id} ${Math.round(p.one.tau)})` : ''} sp${(Math.hypot(r.vx, r.vz) * 1000).toFixed(1)} plan${r.planSp.toFixed(1)} ph${r.phase.toFixed(2)} ${r.setOn ? 'SET' : ''}${r.pivotK >= 0 ? ` piv${r.pivotK}` : ''}${r.loading ? (r.gathering ? ' gath' : ' load') : ''}${r.hopU >= 0 && r.hopU < 1 ? ` hop${r.hopU.toFixed(2)}` : ''}${r.lockK !== -1 ? ` lock${r.lockK}@${Math.round(r.lockMs)}` : ''} off${Math.hypot(r.ox, r.oz).toFixed(2)} air${p.pose[I.air].toFixed(2)} hip${p.pose[I.hip].toFixed(2)} ${feet}`,
    );
  }
  return out;
}

(window as unknown as { lab: unknown }).lab = {
  footTrace,
  footwork,
  feet,
  Puppet,
  I,
  ballArms,
  knockLook,
  meetLegs,
  spins,
  starts,
  knees,
  trace,
  track,
  pose,
  solo,
  scripts,
  measure,
  gait,
  peek,
  when,
  find,
  acts,
  film,
  scene,
  inner,
  winner,
  teams,
};
document.title = 'Motion lab ready';
