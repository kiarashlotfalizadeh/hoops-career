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
import { LOW } from '../../../src/ui/live/court3d/cameras';
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
Puppet.prototype.hit = function (this: Puppet, ...args: Parameters<Puppet['hit']>) {
  const [, , power, kind] = args;
  knocked.n++;
  if (power > 0.6) knocked.hard++;
  if (power > 0.4 && knocked.at.length < 40) knocked.at.push(`${stamp()} p${(this as unknown as { who: number }).who} ${this.clip} ${kind ?? 'bump'} ${power.toFixed(2)}`);
  hitWas.apply(this, args);
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
    const r = p?.ratings;
    return bodyOf(p?.heightIn ?? 78, p?.weightLb ?? 215, r?.str, r && { spd: r.spd, ath: r.ath, hnd: r.hnd, sht: Math.max(r.tp, r.mid) });
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
function measure({ speed = 2, calm = false, slide = 0.05, breaks = false, only = '', hold = 3000, final = false, from = 0, upto = Infinity, most = 5 } = {}) {
  void most;
  const c = new Clock(speed, calm, breaks);
  // (`from`, `upto`: only those possessions, for a quick look)
  if (from > 0) c.k = from;
  else c.tipMs = 0;
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
  // (how long two stay inside each other once they are: each run of frames a pair has a limb in the other (an arm or a
  // leg in his trunk or head, or, not meeting, any limb in any limb), from its first frame to the first frame clear)
  const lasting = { n: 0, frames: 0, over2: 0, over5: 0, longest: 0, at: '', why: new Map<string, number>(), lens: [] as number[] };
  const runsOf = new Map<string, { n: number; at: string; why: string }>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let cuts = 0;
  let fast = 0;
  cutNow = false;
  for (;;) {
    if (!c.step(FRAME, hold) || c.k >= upto) break;
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
        // (at the speed chip's size, as the bones' pops are: a body's turns keep up with a play run fast, up to the scene's TURN_PACE)
        if (snap > YAW_POP * Math.min(speed, 2)) {
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
    const clashing = new Set<string>();
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
          if (!walking && (arm > HIT || leg > HIT || head > HIT || !meeting)) {
            const key = `${figs[a][0]}:${figs[b][0]}`;
            clashing.add(key);
            const r = runsOf.get(key);
            if (r && !cut) r.n++;
            else runsOf.set(key, { n: 1, at: where, why: `${arm > HIT ? 'arm' : leg > HIT ? 'leg' : head > HIT ? 'head' : 'limb'} ${pair}` });
          }
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
    // (a pair clear this frame: its run is over)
    for (const [key, r] of runsOf) {
      if (clashing.has(key)) continue;
      runsOf.delete(key);
      lasting.n++;
      lasting.frames += r.n;
      lasting.lens.push(r.n);
      if (r.n > 2) lasting.over2++;
      if (r.n > 5) {
        lasting.over5++;
        bump(lasting.why, r.why);
      }
      if (r.n > lasting.longest) [lasting.longest, lasting.at] = [r.n, r.at];
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
      inside: { ...inside, deepest: Math.round(inside.deepest * 100) / 100, why: Object.fromEntries([...inside.why].sort((x, y) => y[1] - x[1]).slice(0, 40)) },
      // (each time two were inside each other: how many times, how many frames in all, how many lasted more than 2 and
      // more than 5 frames (and what those were), the median and 90th-percentile run, the longest and where it began)
      lasting: {
        n: lasting.n,
        frames: lasting.frames,
        over2: lasting.over2,
        over5: lasting.over5,
        p50: lasting.lens.sort((x, y) => x - y)[Math.floor(lasting.lens.length / 2)] ?? 0,
        p90: lasting.lens[Math.floor(lasting.lens.length * 0.9)] ?? 0,
        longest: lasting.longest,
        at: lasting.at,
        why: Object.fromEntries([...lasting.why].sort((x, y) => y[1] - x[1]).slice(0, 12)),
      },
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
        backWhy: Object.fromEntries(
          [...arm.why]
            .filter(([k]) => k.startsWith('back'))
            .sort((x, y) => y[1] - x[1])
            .slice(0, 14),
        ),
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
function gait({ speed = 2, only = '', from = 0, upto = Infinity } = {}) {
  const c = new Clock(speed);
  if (from > 0) c.k = from;
  else c.tipMs = 0;
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
  let pushAll = 0;
  let pushDown = 0;
  const velWas = new Map<number, [number, number, number]>();
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
    if (!c.step() || c.k >= upto) break;
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
        // (a body's way changes only through a foot on the floor: how much of a runner's change of velocity, from one
        // frame to the next, is made with one down, and how much in the air between two strides. A frame's change of
        // velocity spans two frames' travel, so a foot down in this one or the last counts)
        const was = velWas.get(pid);
        const footDown = p.feet.some((ft) => !ft.swing);
        if (was && m.ok >= 2 && v > CUT_FROM && !p.one && !air) {
          const dv = Math.hypot(dx / sec - was[0], dz / sec - was[1]);
          pushAll += dv;
          if (footDown || was[2]) pushDown += dv;
        }
        velWas.set(pid, [dx / sec, dz / sec, footDown ? 1 : 0]);
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
    cuts: { frames: cutFrames, yawOverFootPct: pct(cutYawDown, cutYaw), airPct: pct(cutAir, cutFrames), pushOverFootPct: pct(pushDown, pushAll) },
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
  calm = false,
} = {}) {
  const c = new Clock(speed, calm);
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
    const sn = inner as unknown as { bend: { x: number; z: number }; ownOff: { x: number; z: number }; ball: { x: number; y: number; z: number } };
    const dr = (p as unknown as { drib: { phase: number; hand: number; to: number } }).drib;
    out.push(
      `${Math.round(c.t)} i${c.stage.play?.i} ${p.clip}${raw.one ? `(${raw.one.id}@${Math.round(raw.one.tau)})` : ''} b${raw.blend.toFixed(2)} yaw${p.yaw.toFixed(2)} at(${p.x.toFixed(2)},${p.z.toFixed(2)}) ball(${sn.ball.x.toFixed(2)},${sn.ball.y.toFixed(2)},${sn.ball.z.toFixed(2)}) bend(${sn.bend.x.toFixed(2)},${sn.bend.z.toFixed(2)}) own(${sn.ownOff.x.toFixed(2)},${sn.ownOff.z.toFixed(2)}) dr${dr.phase.toFixed(2)}/${dr.hand}/${dr.to} ${keys.map((n) => `${n}${p.pose[I[n as keyof typeof I]].toFixed(2)}`).join(' ')} ${j.join(' ')}`,
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
 * A knee that folds and opens again across three drawn frames (a V: shut by more than `down` radians in one frame,
 * open again by more than `back` in the next), at a speed chip: a leg seen to flick. By clip, with the frames.
 */
function kinks({ speed = 4, down = 0.7, back = 0.45, most = 12, from = 0, upto = Infinity, only = '' } = {}) {
  const c = new Clock(speed);
  if (from > 0) c.k = from;
  else c.tipMs = 0;
  type Fr = { bend: number[]; x: number; z: number; s: string; clip: string };
  const hist = new Map<number, Fr[]>();
  const by: Record<string, number> = {};
  const out: string[] = [];
  let n = 0;
  let worst = 0;
  while (c.step() && c.k < upto) {
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const raw = p as unknown as { feet: { swing: boolean; up: number; x: number; z: number }[]; one: { id: string } | null; felt: number };
      const j = p.j;
      const bend = [0, 1].map((k) => {
        const [hj, kj, fj] = k ? [J.jr, J.kr, J.fr] : [J.jl, J.kl, J.fl];
        HL.set(j[hj * 3] - j[kj * 3], j[hj * 3 + 1] - j[kj * 3 + 1], j[hj * 3 + 2] - j[kj * 3 + 2]);
        HR.set(j[fj * 3] - j[kj * 3], j[fj * 3 + 1] - j[kj * 3 + 1], j[fj * 3 + 2] - j[kj * 3 + 2]);
        return HL.angleTo(HR);
      });
      let h = hist.get(pid);
      if (!h || Math.hypot(p.x - h[h.length - 1].x, p.z - h[h.length - 1].z) > 3) hist.set(pid, (h = []));
      const lz = (ft: { x: number; z: number }) => ((ft.x - p.x) * Math.sin(p.yaw) + (ft.z - p.z) * Math.cos(p.yaw)).toFixed(1);
      const lx = (ft: { x: number; z: number }) => ((ft.x - p.x) * Math.cos(p.yaw) - (ft.z - p.z) * Math.sin(p.yaw)).toFixed(1);
      h.push({
        bend,
        x: p.x,
        z: p.z,
        clip: p.clip,
        s: `${p.clip}${raw.one ? '(' + raw.one.id + ')' : ''} vf${p.vf.toFixed(1)} vs${p.vs.toFixed(1)} felt${(raw.felt ?? 0).toFixed(2)} ${raw.feet.map((ft) => `${ft.swing ? 'S' : '-'}${ft.up.toFixed(2)}@${lx(ft)},${lz(ft)}`).join(' ')} hip${(j[J.hips * 3 + 1] / p.body.s).toFixed(2)} kn${bend.map((b) => Math.round(b * 57.3)).join('/')}`,
      });
      if (h.length > 3) h.shift();
      if (h.length < 3 || !h[1].clip.includes(only)) continue;
      for (const k of [0, 1]) {
        const d1 = h[1].bend[k] - h[0].bend[k];
        const d2 = h[2].bend[k] - h[1].bend[k];
        if (d1 > -down || d2 < back) continue;
        n++;
        worst = Math.max(worst, Math.min(-d1, d2));
        by[h[1].clip] = (by[h[1].clip] ?? 0) + 1;
        if (out.length < most) out.push(`k${c.k} t${Math.round(c.t)} p${pid} ${k ? 'R' : 'L'}\n  ${h.map((x) => x.s).join('\n  ')}`);
      }
    }
  }
  return { n, worst: Math.round(worst * 57.3), by: Object.fromEntries(Object.entries(by).sort((x, y) => y[1] - x[1])), out };
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
 * A man's body thrown about that the plan doesn't throw: frames where his drawn middle changes how far it goes in a
 * frame by more than `acc` ft while the plan's spot changes by less than `planAcc` (`lurch`), by what moved him off his
 * spot most (`by`: spacing's step aside, a knock's give, his own puppet's offsets, or the rest of the scene's: a
 * detour, a hand-off's tug); and the spacing's last-resort shoves. With `flips`: knees that bend one way and straight
 * back the next frame, either way round (straightened then folded, or folded then straightened), by at least `big` and
 * `back` radians, by clip, and how many of them came within two frames of a lurch.
 */
function lurches({ speed = 4, acc = 0.3, planAcc = 0.2, big = 0.7, back = 0.45, most = 16, from = 0, upto = Infinity } = {}) {
  const c = new Clock(speed);
  if (from > 0) c.k = from;
  else c.tipMs = 0;
  const sp = (inner as unknown as { spacing: { state: Map<number, Float32Array>; shoves: number } }).spacing;
  const gives = (inner as unknown as { gives: Map<number, Float32Array> }).gives;
  const planAt = (inner as unknown as { planAt: Map<number, [number, number]> }).planAt;
  const shoves0 = sp.shoves;
  type H = { root: number[][]; plan: number[][]; sp: number[][]; give: number[][]; pup: number[][]; rest: number[][]; kn: number[][]; lu: number[] };
  const hist = new Map<number, H>();
  const by: Record<string, number> = {};
  const byClip: Record<string, number> = {};
  const flipBy: Record<string, number> = {};
  const at: string[] = [];
  const flipAt: string[] = [];
  let [n, frames, flips, nearLurch] = [0, 0, 0, 0];
  const a2 = (a: number[][]) => (a.length < 3 ? 0 : Math.hypot(a[2][0] - 2 * a[1][0] + a[0][0], a[2][1] - 2 * a[1][1] + a[0][1]));
  const bendOf = (j: Float32Array, k: number) => {
    const [hj, kj, fj] = k ? [J.jr, J.kr, J.fr] : [J.jl, J.kl, J.fl];
    HL.set(j[hj * 3] - j[kj * 3], j[hj * 3 + 1] - j[kj * 3 + 1], j[hj * 3 + 2] - j[kj * 3 + 2]);
    HR.set(j[fj * 3] - j[kj * 3], j[fj * 3 + 1] - j[kj * 3 + 1], j[fj * 3 + 2] - j[kj * 3 + 2]);
    return HL.angleTo(HR);
  };
  while (c.step() && c.k < upto && c.finalMs < 0) {
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const pl = planAt.get(pid);
      if (!pl) continue;
      const r = p as unknown as { ox: number; oz: number; cx: number; cz: number; flx: number; flz: number };
      const s = sp.state.get(pid);
      const g = gives.get(pid);
      const tot = [p.x - pl[0], p.z - pl[1]];
      const spo = s ? [s[0], s[1]] : [0, 0];
      const give = g ? [g[0], g[1]] : [0, 0];
      const pup = [r.ox + r.cx + r.flx, r.oz + r.cz + r.flz];
      const now = { root: [p.x, p.z], plan: [pl[0], pl[1]], sp: spo, give, pup, rest: [tot[0] - spo[0] - give[0] - pup[0], tot[1] - spo[1] - give[1] - pup[1]] };
      let h = hist.get(pid);
      if (!h || Math.hypot(p.x - h.root[h.root.length - 1][0], p.z - h.root[h.root.length - 1][1]) > 3)
        hist.set(pid, (h = { root: [], plan: [], sp: [], give: [], pup: [], rest: [], kn: [], lu: [] }));
      for (const k of ['root', 'plan', 'sp', 'give', 'pup', 'rest'] as const) {
        h[k].push(now[k]);
        if (h[k].length > 3) h[k].shift();
      }
      let lu = 0;
      if (h.root.length === 3) {
        frames++;
        if (a2(h.root) > acc && a2(h.plan) < planAcc) {
          n++;
          lu = 1;
          const parts = (['sp', 'give', 'pup', 'rest'] as const).map((k) => [k, a2(h![k])] as const).sort((x, y) => y[1] - x[1]);
          by[parts[0][0]] = (by[parts[0][0]] ?? 0) + 1;
          byClip[p.clip] = (byClip[p.clip] ?? 0) + 1;
          if (at.length < most) at.push(`k${c.k} t${Math.round(c.t)} p${pid} ${p.clip} ${a2(h.root).toFixed(2)} ${parts[0][0]}`);
        }
      }
      h.lu.push(lu);
      if (h.lu.length > 3) h.lu.shift();
      h.kn.push([bendOf(p.j, 0), bendOf(p.j, 1)]);
      if (h.kn.length > 3) h.kn.shift();
      if (h.kn.length < 3 || p.pose[I.air] > 0.5) continue;
      for (const k of [0, 1]) {
        const d1 = h.kn[1][k] - h.kn[0][k];
        const d2 = h.kn[2][k] - h.kn[1][k];
        if (d1 * d2 >= 0 || Math.max(Math.abs(d1), Math.abs(d2)) < big || Math.min(Math.abs(d1), Math.abs(d2)) < back) continue;
        flips++;
        flipBy[p.clip] = (flipBy[p.clip] ?? 0) + 1;
        if (h.lu.some((x) => x)) nearLurch++;
        if (flipAt.length < most) flipAt.push(`k${c.k} t${Math.round(c.t)} p${pid} ${k ? 'R' : 'L'} ${p.clip} ${h.kn.map((x) => Math.round(x[k] * 57.3)).join('>')}`);
      }
    }
  }
  const sort = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]));
  return { frames, lurch: n, by: sort(by), byClip: sort(byClip), shoves: sp.shoves - shoves0, at, flips, nearLurch, flipBy: sort(flipBy), flipAt };
}

/**
 * One man's legs frame by frame, from the game's start (every possession before played): his clip, how fast and which
 * way he goes against the way he faces, his hips' lead (see Puppet.hipLead), how much each thigh, shin and his pelvis
 * turned since the last frame (degrees), each knee's bend, and each foot in his frame (S swinging, d down).
 */
function legTrace({ k = 0, pid = -1, from = 0, to = Infinity, speed = 4 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  while (c.k < k && c.finalMs < 0) c.step();
  const out: string[] = [];
  const W = (p: Puppet, n: number) => {
    p.world(p.j[n * 3], p.j[n * 3 + 1], p.j[n * 3 + 2], V);
    return [V.x, V.y, V.z];
  };
  const unit = (p: Puppet, a: number, b: number) => {
    const [A, B] = [W(p, a), W(p, b)];
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return d.map((v) => v / l);
  };
  const deg = (a: number[], b: number[]) => Math.round(Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 57.3);
  let was: number[][] | null = null;
  while (c.k === k && c.finalMs < 0) {
    c.step();
    if (c.t < from || c.t > to) continue;
    const f = inner.figs.get(pid);
    if (!f) continue;
    const p = f.pup;
    const r = p as unknown as { hipLead: number; one: { id: string } | null };
    const now = [unit(p, J.jl, J.kl), unit(p, J.jr, J.kr), unit(p, J.kl, J.fl), unit(p, J.kr, J.fr), unit(p, J.jr, J.jl)];
    const turned = was ? now.map((d, i) => deg(d, was![i])).join('/') : '-';
    was = now;
    const knee = [0, 1].map((n) => {
      const [hj, kj, fj] = n ? [J.jr, J.kr, J.fr] : [J.jl, J.kl, J.fl];
      return deg(unit(p, kj, hj), unit(p, kj, fj));
    });
    const [sn, cs] = [Math.sin(p.yaw), Math.cos(p.yaw)];
    const feet = p.feet
      .map((ft) => `${ft.swing ? 'S' : 'd'}(${((ft.x - p.x) * cs - (ft.z - p.z) * sn).toFixed(2)},${((ft.x - p.x) * sn + (ft.z - p.z) * cs).toFixed(2)})`)
      .join(' ');
    out.push(
      `${Math.round(c.t)} ${p.clip}${r.one ? `(${r.one.id})` : ''} vf${p.vf.toFixed(1)} vs${p.vs.toFixed(1)} lead${r.hipLead.toFixed(2)} hip${p.pose[I.hip].toFixed(2)} wide${p.pose[I.wide].toFixed(2)} turned ${turned} knee ${knee.join('/')} ${feet}`,
    );
  }
  return out;
}

/**
 * Men on each other (a box-out, a crash into one, a screen: Puppet.felt over `on`) and coming off each other.
 * `turns`: frames where a hand, moving in his own frame faster than `moving` ft a frame, turns its way by more than
 * `turn` radians from the last frame's (a reach thrown round), by clip; with the worst. `off`: each man's first step
 * once he is off the other man (felt from over `on` to under `free`, within `within` ms of his own time): how long its
 * foot was up (ms) and how far it went (ft, on a 6 ft 6 man), against his other steps at that speed (`rushed`: a first
 * step in under `quick` of the time his steps at that speed take, or `far` times their length), with the worst.
 */
function contacts({ speed = 4, on = 0.5, free = 0.2, within = 600, moving = 0.08, turn = 1.2, quick = 0.6, far = 1.6, big = 0.3, most = 12 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const own = FRAME * speed;
  type M = { felt: number; was: number; offAt: number; hv: number[][]; hp: number[][]; up: (null | { t: number; x: number; z: number; v: number })[]; first: boolean };
  const men = new Map<number, M>();
  const turns: Record<string, number> = {};
  const bigBy: Record<string, number> = {};
  const turnAt: { mag: number; s: string }[] = [];
  let felt = 0;
  // (every step by speed bin (2 ft a second), for what a step takes at that speed)
  const bins = new Map<number, { n: number; ms: number; ft: number }>();
  const firsts: { ms: number; ft: number; v: number; at: string }[] = [];
  let t = 0;
  while (c.step() && c.finalMs < 0) {
    t += own;
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const raw = p as unknown as { felt: number; vx: number; vz: number };
      let m = men.get(pid);
      if (!m) men.set(pid, (m = { felt: 0, was: 0, offAt: -1, hv: [[], []], hp: [[], []], up: [null, null], first: false }));
      m.was = m.felt;
      m.felt = raw.felt;
      if (m.was > on) m.offAt = -1;
      if (m.was >= free && m.felt < free && m.offAt < 0) [m.offAt, m.first] = [t, true];
      const v = Math.hypot(raw.vx, raw.vz) * 1000;
      // his hands in his own frame, a frame's step each, and how its way turns
      const j = p.j;
      if (m.felt > on && p.pose[I.air] < 0.5) {
        felt++;
        for (const [k, h] of [
          [0, J.hl],
          [1, J.hr],
        ] as const) {
          const now = [j[h * 3], j[h * 3 + 1], j[h * 3 + 2]];
          const last = m.hp[k];
          if (last.length) {
            const d = [now[0] - last[0], now[1] - last[1], now[2] - last[2]];
            const dl = Math.hypot(d[0], d[1], d[2]);
            const pv = m.hv[k];
            if (pv.length && dl > moving * p.body.s && Math.hypot(pv[0], pv[1], pv[2]) > moving * p.body.s) {
              const cos = (d[0] * pv[0] + d[1] * pv[1] + d[2] * pv[2]) / (dl * Math.hypot(pv[0], pv[1], pv[2]));
              const a = Math.acos(Math.max(-1, Math.min(1, cos)));
              if (a > turn) {
                turns[p.clip] = (turns[p.clip] ?? 0) + 1;
                // (thrown round: a big step one way and a big step back)
                if (dl > big * p.body.s && Math.hypot(pv[0], pv[1], pv[2]) > big * p.body.s) bigBy[p.clip] = (bigBy[p.clip] ?? 0) + 1;
                turnAt.push({
                  mag: a * dl,
                  s: `k${c.k} t${Math.round(c.t)} p${pid} ${k ? 'R' : 'L'} ${p.clip}${p.one ? `(${p.one.id})` : ''} ${Math.round(a * 57.3)}deg ${dl.toFixed(2)}ft`,
                });
              }
            }
            m.hv[k] = d;
          }
          m.hp[k] = now;
        }
      } else m.hv = [[], []];
      if (m.felt <= on) m.hp = [[], []];
      // his steps
      p.feet.forEach((ft, k) => {
        if (ft.swing && !m!.up[k]) m!.up[k] = { t, x: ft.x, z: ft.z, v };
        if (!ft.swing && m!.up[k]) {
          const u = m!.up[k]!;
          const ms = t - u.t;
          const len = Math.hypot(ft.x - u.x, ft.z - u.z) / p.body.s;
          const b = Math.round(u.v / 2);
          if (m!.first && m!.offAt >= 0 && u.t >= m!.offAt && u.t - m!.offAt < within) {
            firsts.push({ ms, ft: len, v: u.v, at: `k${c.k} t${Math.round(c.t)} p${pid} ${p.clip} ${actOfPid(c, pid)}` });
            m!.first = false;
          } else if (p.pose[I.air] < 0.5) {
            let s = bins.get(b);
            if (!s) bins.set(b, (s = { n: 0, ms: 0, ft: 0 }));
            s.n++;
            s.ms += ms;
            s.ft += len;
          }
          m!.up[k] = null;
        }
      });
      if (m.first && m.offAt >= 0 && t - m.offAt > within) m.first = false;
    }
  }
  const rushed = firsts
    .map((x) => {
      const s = bins.get(Math.round(x.v / 2));
      const ms = s && s.n > 20 ? s.ms / s.n : NaN;
      const ft = s && s.n > 20 ? s.ft / s.n : NaN;
      return { ...x, ratio: x.ms / ms, long: x.ft / ft };
    })
    .filter((x) => Number.isFinite(x.ratio));
  const bad = rushed.filter((x) => x.ratio < quick || x.long > far);
  const mean = (a: number[]) => Math.round((a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)) * 100) / 100;
  return {
    feltFrames: felt,
    turns: Object.values(turns).reduce((x, y) => x + y, 0),
    turnsBy: Object.fromEntries(Object.entries(turns).sort((x, y) => y[1] - x[1])),
    thrown: Object.values(bigBy).reduce((x, y) => x + y, 0),
    thrownBy: Object.fromEntries(Object.entries(bigBy).sort((x, y) => y[1] - x[1])),
    turnWorst: turnAt
      .sort((x, y) => y.mag - x.mag)
      .slice(0, most)
      .map((x) => x.s),
    firstSteps: rushed.length,
    firstMsRatio: mean(rushed.map((x) => x.ratio)),
    firstLenRatio: mean(rushed.map((x) => x.long)),
    rushed: bad.length,
    rushedAt: bad
      .sort((x, y) => x.ratio - y.ratio)
      .slice(0, most)
      .map((x) => `${x.at} ${Math.round(x.ms)}ms x${x.ratio.toFixed(2)} ${x.ft.toFixed(2)}ft x${x.long.toFixed(2)} at ${x.v.toFixed(1)}`),
  };
}

/**
 * Two men the play has meet in full (a box-out, a screen): how far apart their middles are from one drawn frame to the
 * next. Leaning on each other they stay as they are; `n` counts the frames they moved more than `step` ft toward or
 * away from each other, `big` more than `hop` (thrown off each other, or fallen back together), by the pair's clips.
 */
function meetHops({ speed = 1, step = 0.06, hop = 0.15 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const meeting = (scene as unknown as { meeting: { i: number; j: number; w: number }[] }).meeting ?? [];
  const last = new Map<string, number>();
  const by: Record<string, number> = {};
  let [frames, n, big] = [0, 0, 0];
  while (c.step()) {
    const sc = c.stage.script;
    if (!sc || !c.stage.play) {
      last.clear();
      continue;
    }
    const pids = [...sc.oPids, ...sc.dPids];
    const seen = new Set<string>();
    for (const m of meeting) {
      if (m.w < 0.99) continue;
      const a = inner.figs.get(pids[m.i])?.pup;
      const b = inner.figs.get(pids[m.j])?.pup;
      if (!a || !b) continue;
      const key = `${pids[m.i]}:${pids[m.j]}:${c.k}`;
      seen.add(key);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const was = last.get(key);
      frames++;
      if (was !== undefined) {
        const st = Math.abs(d - was) / speed;
        if (st > step) n++;
        if (st > hop) {
          big++;
          const pair = [a.clip, b.clip].sort().join('+');
          by[pair] = (by[pair] ?? 0) + 1;
        }
      }
      last.set(key, d);
    }
    for (const k of [...last.keys()]) if (!seen.has(k)) last.delete(k);
  }
  return {
    frames,
    n,
    big,
    by: Object.fromEntries(
      Object.entries(by)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 8),
    ),
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
  Puppet.prototype.hit = function (this: Puppet, ...args: Parameters<Puppet['hit']>) {
    const [, , power, kind] = args;
    hitNow.apply(this, args);
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
      where: `k${c.k} t${Math.round(c.t)} p${(this as unknown as { who: number }).who} ${this.clip} ${kind ?? 'bump'}`,
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
    inb: boolean;
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
  const held = { spells: 0, travels: 0, inbound: 0, oneFoot: 0, still: 0, pivotDeg: 0, at: [] as string[] };
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
    // (an inbounder walks with the ball behind the line as he likes: no travel out of bounds)
    if (m.inb) held.inbound++;
    else if (m.still[0] && m.still[1]) {
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
          inb: false,
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
      if (holding && !m.held) [m.held, m.inb, m.steps, m.still, m.deg] = [true, false, [0, 0], [0, 0], 0];
      if (m.held && act === 'inbound') m.inb = true;
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

/**
 * A possession played, then its instant replay: the moves each man made (the clips he acted, in order) live and
 * again. `same`: the replay made no move the play didn't. (k: -1, every possession with a replay due, up to `most`.)
 */
function replays({ k = -1, ks = [] as number[], most = 12, speed = 1 } = {}) {
  const out: { k: number; same: boolean; live: string[]; again: string[] }[] = [];
  const c = new Clock(speed);
  c.tipMs = 0;
  const dir = inner as unknown as { director: { onAir: boolean } };
  const moves = (into: string[], was: Map<number, string>) => {
    // (and the ball's way to the rim: what a shot meets on its way, net, iron or glass, the same live and again)
    const fl = (inner as unknown as { flight: { hits: { what: string }[] } | null }).flight;
    const shot = fl ? `ball ${fl.hits.map((h) => h.what).join('-') || 'air'}` : '';
    if (shot && was.get(-1) !== shot) into.push(shot);
    was.set(-1, shot);
    for (const [pid, f] of inner.figs) {
      const one = (f.pup as unknown as { one: { id: string; tau: number } | null }).one;
      const id = one && !['stop', 'start', 'closeout', 'stumble', 'bump'].includes(one.id) ? `${one.id}${(f.pup as unknown as { lefty: boolean }).lefty ? '(L)' : ''}` : '';
      if (id && was.get(pid) !== id) into.push(`p${pid} ${id}`);
      was.set(pid, id);
    }
  };
  let live: string[] = [];
  let was = new Map<number, string>();
  let at = 0;
  while (c.step() && out.length < most && c.finalMs < 0) {
    if (c.k !== at) {
      // (the possession just finished: its replay, if one is due)
      const sc = scripts[at];
      if ((ks.length ? ks.includes(at) : k < 0 || k === at) && scene.replay(sc)) {
        const again: string[] = [];
        const w2 = new Map<number, string>();
        let n = 0;
        while (!scene.released && n++ < 4000) {
          scene.frame(c.stage, props, 0, FRAME, false, FRAME * speed);
          if (dir.director.onAir) moves(again, w2);
        }
        // (the replay shows the end of the play: every move in it was one of the play's, in the play's order)
        const upTo = new Map<string, number>();
        const same = again.every((m) => {
          const who = m.split(' ')[0];
          const j = live.indexOf(m, upTo.get(who) ?? 0);
          if (j < 0) return false;
          upTo.set(who, j);
          return true;
        });
        out.push({ k: at, same, live, again });
      }
      at = c.k;
      live = [];
      was = new Map();
    }
    moves(live, was);
  }
  return { n: out.length, differ: out.filter((x) => !x.same), all: out.map((x) => `k${x.k} ${x.same ? 'same' : 'DIFFERS'}: ${x.again.join(', ')}`) };
}

/**
 * Every dunk in the game played three ways: as the play has it, missed, and blocked (the man who goes up with him gets
 * a hand to it). For each: whether the ball went down through the ring (`through`), whether the dunker hung on the
 * rim (`hung`), and how near the blocker's hand the ball came (ft). A missed or blocked dunk is never through, and
 * never hung on.
 */
function dunks({ speed = 1 } = {}) {
  const out: { k: number; as: string; through: boolean; hung: boolean; nearHand: number; trail: string[] }[] = [];
  const ks = [...new Set(find('dunk').map((x) => x.k))];
  for (const k of ks) {
    const sc = scripts[k];
    const i = sc.frames.findIndex((f, n) => n > 0 && sc.frames[n - 1].act.includes('dunk') && !!f.fx);
    if (i < 0) continue;
    const f = sc.frames[i];
    const nO = sc.oPids.length;
    const blk = sc.frames[i - 1].act.findIndex((a, j) => j >= nO && (a === 'contest' || a === 'block'));
    const keep = { fx: f.fx, swat: f.swat };
    for (const as of ['play', 'miss', 'block']) {
      if (as === 'miss') f.fx = 'miss';
      if (as === 'block') {
        if (blk < 0) continue;
        f.fx = 'miss';
        f.swat = blk;
      }
      // (made afresh each way: what the possession's moves were made as is kept with it, see Tape)
      (scene as unknown as { takes: WeakMap<Script, unknown> }).takes.delete(sc);
      const c = new Clock(speed);
      c.tipMs = 0;
      c.k = k;
      const trail: string[] = [];
      const rimW = w({ x: 0, y: 5.25 }, sc.dir);
      const [rx, rz] = [rimW.y - 47, -rimW.x];
      let through = false;
      let hung = false;
      let nearHand = Infinity;
      while (c.k === k && c.finalMs < 0) {
        c.step();
        const b = inner.ball;
        // (out of everyone's hands, inside the ring's cords under the rim: it is going down through the net)
        const held = (inner as unknown as { heldBy: number | null }).heldBy !== null;
        // (only through the shot's own move: a made play's next moves, played after a dunk made a miss, have the ball under the net)
        if (c.stage.play?.i === i && !held && b.y < 9.85 && b.y > 8.8 && Math.hypot(b.x - rx, b.z - rz) < 0.55) through = true;
        if (c.stage.play?.i === i)
          trail.push(
            `${Math.round(c.t)} ${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)} r${Math.hypot(b.x - rx, b.z - rz).toFixed(2)}${(inner as unknown as { heldBy: number | null }).heldBy !== null ? ' H' : ''}`,
          );
        for (const fig of inner.figs.values()) if (fig.pup.onRim) hung = true;
        if (blk >= 0) {
          const g = inner.figs.get(sc.dPids[blk - nO]);
          if (g) {
            const j = g.pup.j;
            const h = g.pup.world(j[J.hr * 3], j[J.hr * 3 + 1], j[J.hr * 3 + 2], { x: 0, y: 0, z: 0 });
            nearHand = Math.min(nearHand, Math.hypot(b.x - h.x, b.y - h.y, b.z - h.z));
          }
        }
      }
      out.push({ k, as, through, hung, nearHand: Math.round(nearHand * 100) / 100, trail });
      f.fx = keep.fx;
      f.swat = keep.swat;
      if (keep.swat === undefined) delete f.swat;
    }
  }
  return out;
}

/**
 * Every hand-off in the game, from the move before it to the end of its own: frame by frame, how far the ball is from
 * where the hands on it hold it (Puppet.holds: either man's, a hand counting once it is half on it), and the frame it
 * becomes the taker's (heldBy). `float`: frames no hand holds it within FLOAT_FT; `owned`: the taker's grip and gap
 * when it became his. A hand-off never floats, and is the taker's only once his hands are on it.
 */
function handoffs({ speed = 1, most = 20 } = {}) {
  const FLOAT_FT = 0.3;
  const out: { k: number; i: number; frames: number; float: number; before: number; gap: number; owned: string; forced: boolean; both: number; trail: string[] }[] = [];
  const v = { x: 0, y: 0, z: 0 };
  // (every hand-off of every possession: one may have two, and the second is as much a hand-off as the first)
  const each = scripts.flatMap((sc, k) => sc.frames.flatMap((f, i) => (f.handoff && i >= 1 ? [[k, i]] : [])));
  for (const [k, i] of each) {
    if (out.length >= most) break;
    const sc = scripts[k];
    const a = sc.frames[i - 1];
    const b = sc.frames[i];
    if (a.hold === undefined || b.hold === undefined || a.hold < 0 || b.hold < 0) continue;
    const pids = sc.oPids.concat(sc.dPids);
    const gp = pids[a.hold];
    const rp = pids[b.hold];
    (scene as unknown as { takes: WeakMap<Script, unknown> }).takes.delete(sc);
    const c = new Clock(speed);
    c.tipMs = 0;
    c.k = k;
    let frames = 0;
    let float = 0;
    let before = 0;
    let gap = 0;
    let owned = '';
    let forced = false;
    // (drawn frames with both men's hands on it before it was the taker's)
    let both = 0;
    const trail: string[] = [];
    while (c.k === k && c.finalMs < 0) {
      c.step();
      const sw = (scene as unknown as { swap: { k: number; ex: { forced: boolean; phase: string } } | null }).swap;
      const ex = sw?.k === i ? sw.ex : undefined;
      forced ||= !!ex?.forced;
      const pl = c.stage.play;
      if (!pl || pl.i < i - 1 || pl.i > i) continue;
      const G = inner.figs.get(gp)?.pup;
      const R = inner.figs.get(rp)?.pup;
      if (!G || !R) continue;
      const ball = inner.ball;
      const held = (inner as unknown as { heldBy: number | null }).heldBy;
      const gg = G.holds(v);
      const gd = gg > 0.5 ? Math.hypot(ball.x - v.x, ball.y - v.y, ball.z - v.z) : Infinity;
      const rg = R.holds(v);
      const rd = rg > 0.5 ? Math.hypot(ball.x - v.x, ball.y - v.y, ball.z - v.z) : Infinity;
      const near = Math.min(gd, rd);
      // (the move before: it is only his once the hand-off's own move is under way)
      // (a dribble in the air is in nobody's hands, and not floating)
      const up = (G.dribble?.phase ?? 1) < 1;
      if (pl.i === i - 1 && held === gp && !up) {
        frames++;
        if (near > FLOAT_FT) {
          float++;
          before++;
          trail.push(
            `before u${(pl.dur > 0 ? pl.ms / pl.dur : 1).toFixed(2)} ${G.clip}${G.one ? `@${Math.round(G.one.tau)}` : ''} g${gg.toFixed(2)}/${Number.isFinite(gd) ? gd.toFixed(2) : '-'} by${ball.y.toFixed(2)}`,
          );
        }
        continue;
      }
      if (pl.i !== i) continue;
      frames++;
      if (near > FLOAT_FT) float++;
      if (Number.isFinite(near)) gap = Math.max(gap, near);
      else gap = Math.max(gap, 9);
      const u = pl.dur > 0 ? pl.ms / pl.dur : 1;
      if (!owned && held === rp) owned = `u${u.toFixed(2)} grip ${rg.toFixed(2)} gap ${Number.isFinite(rd) ? rd.toFixed(2) : '-'} giver ${gg.toFixed(2)}`;
      if (!owned && gd <= FLOAT_FT && rd <= FLOAT_FT) both++;
      trail.push(
        `u${u.toFixed(2)} ${ex?.phase ?? '-'} g${gg.toFixed(2)}/${Number.isFinite(gd) ? gd.toFixed(2) : '-'} r${rg.toFixed(2)}/${Number.isFinite(rd) ? rd.toFixed(2) : '-'}${held === rp ? ' R' : held === gp ? ' G' : ''} d${Math.hypot(G.x - R.x, G.z - R.z).toFixed(2)} rgl${Math.max((R as unknown as { pose: number[] }).pose[I.gl], (R as unknown as { pose: number[] }).pose[I.gr]).toFixed(2)} ${R.clip} yaw${(((Math.atan2(ball.x - R.x, ball.z - R.z) - R.yaw + 9 * Math.PI) % (2 * Math.PI)) - Math.PI).toFixed(2)} bd${Math.hypot(ball.x - R.x, ball.z - R.z).toFixed(2)} by${ball.y.toFixed(2)} cy${(((c2) => Math.atan2(c2.x - R.x, c2.z - R.z) - R.yaw)(R.carry({ x: 0, y: 0, z: 0 })) % (2 * Math.PI)).toFixed(2)} cd${((c2) => Math.hypot(c2.x - R.x, c2.z - R.z))(R.carry({ x: 0, y: 0, z: 0 })).toFixed(2)}`,
      );
    }
    out.push({ k, i, frames, float, before, gap: Math.round(gap * 100) / 100, owned, forced, both, trail });
  }
  return {
    n: out.length,
    float: out.reduce((s, x) => s + x.float, 0),
    before: out.reduce((s, x) => s + x.before, 0),
    frames: out.reduce((s, x) => s + x.frames, 0),
    early: out.filter((x) => !x.owned || / grip 0\.[0-4]/.test(x.owned)).length,
    forced: out.filter((x) => x.forced).length,
    unshared: out.filter((x) => x.both < 1).length,
    all: out,
  };
}

/**
 * How square each man is at the instant his move is timed to (the play's): a shot's release (radians off the rim) and
 * a catch (off the ball's way to him), at a speed. Mean and share past FACING_OFF. At 4x a man should be about as
 * square as at 1x.
 */
function facing({ speed = 1 } = {}) {
  const FACING_OFF = 0.6;
  const c = new Clock(speed);
  c.tipMs = 0;
  const was = new Map<number, { id: string; tau: number }>();
  const out: Record<string, { n: number; sum: number; off: number }> = {};
  const add = (k: string, a: number) => {
    const o = (out[k] ??= { n: 0, sum: 0, off: 0 });
    o.n++;
    o.sum += a;
    if (a > FACING_OFF) o.off++;
  };
  while (c.step() && c.finalMs < 0) {
    const sc = scripts[c.k];
    for (const [pid, f] of inner.figs) {
      const one = (f.pup as unknown as { one: { id: string; tau: number } | null }).one;
      const prev = was.get(pid);
      if (one && prev && prev.id === one.id && prev.tau < 0 && one.tau >= 0) {
        const p = f.pup;
        let to: number | null = null;
        if (['jumper', 'floater', 'layup', 'hook', 'freeThrow'].includes(one.id) && sc) {
          const rimW = w({ x: 0, y: 5.25 }, sc.dir);
          to = Math.atan2(rimW.y - 47 - p.x, -rimW.x - p.z);
        } else if ((one.id === 'catch' || one.id === 'take') && inner.ball) {
          const b = inner.ball;
          const v = (inner as unknown as { ballV: Vector3 }).ballV;
          // (the way it comes from: back along its flight, or, held out to him, from where it is)
          to = v.lengthSq() > 4 ? Math.atan2(-v.x, -v.z) : Math.atan2(b.x - p.x, b.z - p.z);
        }
        if (to !== null) add(one.id, Math.abs(((to - p.yaw + 9 * Math.PI) % (2 * Math.PI)) - Math.PI));
      }
      was.set(pid, one ? { id: one.id, tau: one.tau } : { id: '', tau: 0 });
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, o]) => [k, { n: o.n, mean: Math.round((o.sum / o.n) * 100) / 100, offPct: Math.round((o.off / o.n) * 100) }]));
}

/**
 * His weight against his travel: at a run, how his trunk's lean to the side follows his path's bending (`bank`) and its
 * lean forward follows his getting going and pulling up (`lean`). For each, the lag (ms) at which the two go together
 * best (past 0: the body after the path; before: leading it) and how well they do there and at no lag.
 */
function weight({ speed = 1, from = 8 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  type Row = { x: number; z: number; yaw: number; bank: number; lean: number; bend: number; px: number; pz: number };
  const runs = new Map<number, Row[]>();
  const W = 4;
  const LAGS = 24;
  const sums = (['bank', 'lean', 'bend', 'plan'] as const).map(() => Array.from({ length: LAGS * 2 + 1 }, () => ({ n: 0, a: 0, b: 0, aa: 0, bb: 0, ab: 0 })));
  const ms = FRAME;
  const close = (rows: Row[]) => {
    if (rows.length < 2 * (W + LAGS) + 8) return;
    const sec = (W * ms) / 1000;
    for (let i = 2 * W + LAGS; i < rows.length - 2 * W - LAGS; i++) {
      const r = rows[i];
      const ax = (rows[i + W].x - 2 * r.x + rows[i - W].x) / (sec * sec);
      const az = (rows[i + W].z - 2 * r.z + rows[i - W].z) / (sec * sec);
      const sp = Math.hypot(rows[i + W].x - rows[i - W].x, rows[i + W].z - rows[i - W].z) / (2 * sec);
      if (sp < from) continue;
      const s = Math.sin(r.yaw);
      const co = Math.cos(r.yaw);
      const want = [-(ax * -co + az * s), ax * s + az * co, -(ax * -co + az * s), -(ax * -co + az * s)];
      for (let l = -LAGS; l <= LAGS; l++) {
        const o = rows[i + l];
        const o1 = rows[i + l + W];
        const o0 = rows[i + l - W];
        const pax = (o1.px - 2 * o.px + o0.px) / (sec * sec);
        const paz = (o1.pz - 2 * o.pz + o0.pz) / (sec * sec);
        [o.bank, o.lean, -o.bend, -(pax * -co + paz * s)].forEach((v, k) => {
          const q = sums[k][l + LAGS];
          const a = want[k];
          q.n++;
          q.a += a;
          q.b += v;
          q.aa += a * a;
          q.bb += v * v;
          q.ab += a * v;
        });
      }
    }
  };
  let kWas = -1;
  while (c.step() && c.finalMs < 0) {
    const cut = cutNow || c.k !== kWas;
    cutNow = false;
    kWas = c.k;
    for (const [pid, f] of inner.figs) {
      const p = f.pup as unknown as { x: number; z: number; yaw: number; bank: number; bend: number; pose: Float32Array; one: unknown };
      let rows = runs.get(pid);
      const air = p.pose[I.air] > 0.2 || !!p.one;
      if (!rows || cut || air) {
        if (rows) close(rows);
        runs.set(pid, (rows = []));
        if (air) continue;
      }
      const at = (scene as unknown as { planAt: Map<number, [number, number]> }).planAt.get(pid) ?? [p.x, p.z];
      rows.push({ x: p.x, z: p.z, yaw: p.yaw, bank: p.bank, lean: p.pose[I.lean], bend: p.bend, px: at[0], pz: at[1] });
    }
  }
  for (const rows of runs.values()) close(rows);
  return Object.fromEntries(
    (['bank', 'lean', 'bend', 'plan'] as const).map((name, k) => {
      const r = sums[k].map((q) => (q.n * q.ab - q.a * q.b) / Math.sqrt(Math.max(1e-9, (q.n * q.aa - q.a * q.a) * (q.n * q.bb - q.b * q.b))));
      let best = 0;
      r.forEach((v, i) => v > r[best] && (best = i));
      return [
        name,
        {
          curve: r.filter((_, i) => i % 3 === 0).map((v) => Math.round(v * 100)),
          n: sums[k][LAGS].n,
          lagMs: Math.round((best - LAGS) * ms * speed),
          r: Math.round(r[best] * 100) / 100,
          r0: Math.round(r[LAGS] * 100) / 100,
        },
      ];
    }),
  );
}

/**
 * Two inside each other for more than `over` frames running (see measure's `lasting`): each such run, where it began,
 * how long, the deepest part of one in which part of the other (SHAPES names), how deep at most, and how fast each man
 * was going on average (ft a second, the bodies' time), to see what keeps them in each other.
 */
const SHAPE_NAMES = ['trunk', 'shoulders', 'pelvis', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];
function lasts({ speed = 1, over = 5, most = 30 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const wa = new Float32Array(45);
  const wb = new Float32Array(45);
  const put = (f: Fig, out: Float32Array) => {
    for (let k = 0; k < 15; k++) {
      f.pup.world(f.pup.j[k * 3], f.pup.j[k * 3 + 1], f.pup.j[k * 3 + 2], V);
      [out[k * 3], out[k * 3 + 1], out[k * 3 + 2]] = [V.x, V.y, V.z];
    }
  };
  const meeting = (scene as unknown as { meeting: { i: number; j: number; w: number }[] }).meeting ?? [];
  type Run = { n: number; at: string; parts: Map<string, number>; deep: number; va: number; vb: number; clips: string };
  const runs = new Map<string, Run>();
  const out: Run[] = [];
  const was = new Map<number, [number, number]>();
  const sec = (FRAME * speed) / 1000;
  const byParts = new Map<string, number>();
  while (c.step()) {
    const sc = c.stage.script;
    const play = c.stage.play;
    if (cutNow) {
      cutNow = false;
      runs.clear();
    }
    const figs = [...inner.figs.entries()];
    const met = new Set<string>();
    if (sc) for (const m of meeting) if (m.w > 0.2) met.add(`${[...sc.oPids, ...sc.dPids][m.i]}:${[...sc.oPids, ...sc.dPids][m.j]}`);
    const now = new Set<string>();
    for (let a = 0; a < figs.length; a++)
      for (let b = a + 1; b < figs.length; b++) {
        const [fa, fb] = [figs[a][1], figs[b][1]];
        if (Math.hypot(fa.pup.x - fb.pup.x, fa.pup.z - fb.pup.z) > 5) continue;
        put(fa, wa);
        put(fb, wb);
        const [A, B] = [fa.pup.body, fb.pup.body];
        const meet = met.has(`${figs[a][0]}:${figs[b][0]}`) || met.has(`${figs[b][0]}:${figs[a][0]}`);
        let best = 0;
        let bp = '';
        for (let i = 0; i < SHAPES.length; i++)
          for (let k = 0; k < SHAPES.length; k++) {
            // (a trunk on a trunk of two meeting is what they are for; a limb in anything is not)
            if (meet && i < 4 && k < 4) continue;
            const d = into(wa, A.s, A.bulk, wb, B.s, B.bulk, [i], [k]);
            if (d > best) [best, bp] = [d, `${SHAPE_NAMES[i]}>${SHAPE_NAMES[k]}`];
          }
        if (best <= HIT) continue;
        const key = `${figs[a][0]}:${figs[b][0]}`;
        now.add(key);
        const wA = was.get(figs[a][0]);
        const wB = was.get(figs[b][0]);
        const va = wA ? Math.hypot(fa.pup.x - wA[0], fa.pup.z - wA[1]) / sec : 0;
        const vb = wB ? Math.hypot(fb.pup.x - wB[0], fb.pup.z - wB[1]) / sec : 0;
        let r = runs.get(key);
        if (!r) {
          const act = (pid: number) => (sc && play ? play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)] : '-');
          r = {
            n: 0,
            at: `k${c.k} t${Math.round(c.t)} ${key} ${act(figs[a][0])}/${act(figs[b][0])}${meet ? ' meet' : ''}`,
            parts: new Map(),
            deep: 0,
            va: 0,
            vb: 0,
            clips: `${fa.pup.clip}+${fb.pup.clip}`,
          };
          runs.set(key, r);
        }
        r.n++;
        r.parts.set(bp, (r.parts.get(bp) ?? 0) + 1);
        r.deep = Math.max(r.deep, best);
        r.va += va;
        r.vb += vb;
      }
    for (const [key, r] of runs) {
      if (now.has(key)) continue;
      runs.delete(key);
      if (r.n <= over) continue;
      out.push(r);
      const top = [...r.parts].sort((x, y) => y[1] - x[1])[0][0];
      byParts.set(top, (byParts.get(top) ?? 0) + 1);
    }
    for (const [pid, f] of figs) was.set(pid, [f.pup.x, f.pup.z]);
  }
  return {
    n: out.length,
    byParts: Object.fromEntries([...byParts].sort((x, y) => y[1] - x[1])),
    worst: out
      .sort((x, y) => y.n - x.n)
      .slice(0, most)
      .map(
        (r) =>
          `${r.at} ${r.clips} ${r.n}f ${[...r.parts]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 2)
            .map(([k, v]) => `${k}:${v}`)
            .join(',')} deep ${r.deep.toFixed(2)} v ${(r.va / r.n).toFixed(1)}/${(r.vb / r.n).toFixed(1)}`,
      ),
  };
}

/**
 * Each wrist as the body draws it (figure.ts's bones, what the viewer sees), over the whole game: the hand
 * against its forearm as a forearm's turn (pronation, palm down or back, over 0; supination under) and a wrist's bend
 * (toward the palm over 0) and its tilt to the thumb's or the little finger's side. Held (a hand on
 * the ball) and free apart, by clip: their 5th, 50th and 95th centiles (degrees), and how many frames are past what a
 * forearm turns (PRON_DEG either way of the palm facing in), a wrist bends (FLEX_DEG, EXT_DEG) or tilts (DEV_DEG).
 * `worst`: the worst of each, to film.
 */
const PRON_DEG = 85;
const FLEX_DEG = 75;
const EXT_DEG = 65;
const DEV_DEG = 35;
function wrists({ speed = 1, most = 8, only = '' } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  type Row = { n: number; pron: number[]; flex: number[]; dev: number[]; past: number };
  const by = new Map<string, Row>();
  const worst = new Map<string, { m: number; at: string }[]>();
  const past = { pron: 0, flex: 0, ext: 0, dev: 0, n: 0 };
  const Q1 = new Quaternion();
  const Q2 = new Quaternion();
  const F = new Vector3();
  const U = new Vector3();
  const L = new Vector3();
  const deg = (r: number) => (r * 180) / Math.PI;
  const note = (kind: string, m: number, at: string) => {
    const l = worst.get(kind) ?? [];
    if (!worst.has(kind)) worst.set(kind, l);
    l.push({ m, at });
    l.sort((x, y) => y.m - x.m);
    if (l.length > most * 4) l.length = most * 4;
  };
  while (c.step()) {
    const sc = c.stage.script;
    const play = c.stage.play;
    if (!sc || !play) continue;
    for (const [pid, f] of inner.figs) {
      const bones = (f as unknown as { bones: Bone[] }).bones;
      if (bones.length < 9) continue;
      const p = f.pup;
      for (const k of [0, 1] as const) {
        const way = k ? 1 : -1;
        const [ua, fa, ha] = k ? [6, 7, 8] : [3, 4, 5];
        Q1.copy(bones[fa].quaternion).invert().multiply(bones[ha].quaternion);
        // (the turn about the forearm, then what is left: the wrist's)
        const tw = Math.hypot(Q1.y, Q1.w) || 1;
        const twist = 2 * Math.atan2(Q1.y / tw, Q1.w / tw);
        Q2.set(0, Q1.y / tw, 0, Q1.w / tw)
          .invert()
          .multiply(Q1);
        F.set(0, -1, 0).applyQuaternion(Q2);
        const pron = deg(Math.atan2(Math.sin(way * twist), Math.cos(way * twist)));
        const flex = deg(Math.atan2(way * F.x, -F.y));
        const dev = deg(Math.atan2(F.z, -F.y));
        // (the elbow: the forearm's line against the upper arm's, folded the way its hinge folds it, or past straight)
        U.set(0, -1, 0).applyQuaternion(bones[ua].quaternion);
        L.set(0, -1, 0).applyQuaternion(bones[fa].quaternion);
        const held = p.pose[k ? I.gr : I.gl] > 0.3;
        const key = `${held ? 'held' : 'free'} ${p.clip}`;
        let r = by.get(key);
        if (!r) by.set(key, (r = { n: 0, pron: [], flex: [], dev: [], past: 0 }));
        r.n++;
        if (r.pron.length < 20000) {
          r.pron.push(pron);
          r.flex.push(flex);
          r.dev.push(dev);
        }
        past.n++;
        const at = `k${c.k} t${Math.round(c.t)} p${pid} ${k ? 'R' : 'L'} ${key} ${play.b.act[[...sc.oPids, ...sc.dPids].indexOf(pid)]}`;
        let bad = false;
        if (Math.abs(pron) > PRON_DEG) {
          past.pron++;
          bad = true;
          note(pron > 0 ? 'pronated' : 'supinated', Math.abs(pron), at);
        }
        if (flex > FLEX_DEG) {
          past.flex++;
          bad = true;
          note('flexed', flex, at);
        }
        if (flex < -EXT_DEG) {
          past.ext++;
          bad = true;
          note('extended', -flex, at);
        }
        if (Math.abs(dev) > DEV_DEG) {
          past.dev++;
          bad = true;
          note('tilted', Math.abs(dev), at);
        }
        if (bad) r.past++;
      }
    }
  }
  const cent = (l: number[], q: number) => {
    const s2 = [...l].sort((x, y) => x - y);
    return Math.round(s2[Math.floor((s2.length - 1) * q)] ?? 0);
  };
  return {
    past,
    clips: Object.fromEntries(
      [...by]
        .filter(([k, r]) => r.n > 300 && (!only || k.startsWith(only)))
        .sort((x, y) => y[1].past - x[1].past)
        .slice(0, 30)
        .map(([k, r]) => [
          k,
          `n${r.n} past${Math.round((r.past / r.n) * 100)}% pron ${cent(r.pron, 0.05)}/${cent(r.pron, 0.5)}/${cent(r.pron, 0.95)} flex ${cent(r.flex, 0.05)}/${cent(r.flex, 0.5)}/${cent(r.flex, 0.95)} dev ${cent(r.dev, 0.05)}/${cent(r.dev, 0.5)}/${cent(r.dev, 0.95)}`,
        ]),
    ),
    worst: Object.fromEntries(
      [...worst].map(([k, l]) => [
        k,
        l
          .filter((x, i) => l.findIndex((y) => y.at.split(' ')[0] === x.at.split(' ')[0]) === i)
          .slice(0, most)
          .map((x) => `${x.at} ${Math.round(x.m)}`),
      ]),
    ),
  };
}

/**
 * His weight on his feet, on the ground and in no move of his own, from 2 ft a second: `over`, in the frames one foot is
 * down, how far his hips are from the middle of his feet toward that foot (a share of the way to it: 0 none, 1 right over
 * it), by speed; `list`, how his hips tip with it (the hip over the foot that is down higher than the other, ft, on
 * average, and the share of frames it is); and `absorb`, each foot put down while he is slowing harder than ABSORB_ACC
 * (ft a second squared, from his path): how far his hips sink over the next ABSORB_MS against just before (ft), on
 * average by how hard he was slowing, and how well the one goes with the other (r).
 */
const ABSORB_ACC = 10;
const ABSORB_MS = 160;
function support({ speed = 1 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  const own = FRAME * speed;
  const bins = [2, 6, 12, 20, 40];
  const over = bins.slice(1).map(() => ({ n: 0, sum: 0 }));
  const list = { n: 0, sum: 0, right: 0 };
  type Was = {
    x: number;
    z: number;
    vx: number;
    vz: number;
    ax: number;
    az: number;
    down: boolean[];
    hips: number[];
    strikes: { t: number; acc: number; y0: number; low: number }[];
  };
  const was = new Map<number, Was>();
  const absorbs: { acc: number; drop: number }[] = [];
  let t = 0;
  while (c.step() && c.finalMs < 0) {
    t += own;
    const sec = own / 1000;
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const j = p.j;
      const air = p.pose[I.air] > 0.2 || !!p.one;
      let w = was.get(pid);
      if (!w || cutNow) {
        was.set(pid, (w = { x: p.x, z: p.z, vx: 0, vz: 0, ax: 0, az: 0, down: p.feet.map((x) => !x.swing), hips: [], strikes: [] }));
        continue;
      }
      const vx = (p.x - w.x) / sec;
      const vz = (p.z - w.z) / sec;
      // (his path's change of speed, eased over a few frames)
      const k = 1 - Math.exp(-own / 50);
      w.ax += ((vx - w.vx) / sec - w.ax) * k;
      w.az += ((vz - w.vz) / sec - w.az) * k;
      const sp = Math.hypot(vx, vz);
      const along = sp > 1 ? (w.ax * vx + w.az * vz) / sp : 0;
      [w.x, w.z, w.vx, w.vz] = [p.x, p.z, vx, vz];
      const hy = j[J.hips * 3 + 1];
      w.hips.push(hy);
      if (w.hips.length > 40) w.hips.shift();
      // (each strike's sink, once its time is up)
      for (let i = w.strikes.length - 1; i >= 0; i--) {
        const st = w.strikes[i];
        st.low = Math.min(st.low, hy);
        if (t - st.t >= ABSORB_MS) {
          absorbs.push({ acc: st.acc, drop: st.y0 - st.low });
          w.strikes.splice(i, 1);
        }
      }
      const down = p.feet.map((x) => !x.swing);
      if (!air && sp > 2) {
        p.feet.forEach((_, n) => {
          if (down[n] && !w!.down[n] && -along > ABSORB_ACC) w!.strikes.push({ t, acc: -along, y0: w!.hips[Math.max(0, w!.hips.length - 3)], low: hy });
        });
        if (down[0] !== down[1]) {
          const n = down[0] ? 0 : 1;
          // (in his frame: his hips, his feet)
          const lx = (wx: number, wz: number) => (wx - p.x) * Math.cos(p.yaw) - (wz - p.z) * Math.sin(p.yaw);
          const fx = lx(p.feet[n].x, p.feet[n].z);
          const mx = (fx + lx(p.feet[1 - n].x, p.feet[1 - n].z)) / 2;
          const hx = j[J.hips * 3];
          if (Math.abs(fx - mx) > 0.1) {
            const b = bins.findIndex((v, i) => sp >= v && sp < bins[i + 1]);
            if (b >= 0) {
              over[b].n++;
              over[b].sum += (hx - mx) / (fx - mx);
            }
          }
          // (the hip over the foot that is down: the left's is J.jl)
          const up = j[(n ? J.jr : J.jl) * 3 + 1] - j[(n ? J.jl : J.jr) * 3 + 1];
          list.n++;
          list.sum += up;
          if (up > 0.005) list.right++;
        }
      }
      w.down = down;
    }
    cutNow = false;
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const n = absorbs.length;
  const ma = absorbs.reduce((a, x) => a + x.acc, 0) / Math.max(1, n);
  const md = absorbs.reduce((a, x) => a + x.drop, 0) / Math.max(1, n);
  const cov = absorbs.reduce((a, x) => a + (x.acc - ma) * (x.drop - md), 0);
  const va = absorbs.reduce((a, x) => a + (x.acc - ma) ** 2, 0);
  const vd = absorbs.reduce((a, x) => a + (x.drop - md) ** 2, 0);
  const accBins = [10, 20, 35, 60, 999];
  return {
    over: Object.fromEntries(over.map((o, i) => [`${bins[i]}-${bins[i + 1]}`, { n: o.n, share: r2(o.sum / Math.max(1, o.n)) }])),
    list: { n: list.n, ft: r3(list.sum / Math.max(1, list.n)), rightPct: Math.round((list.right / Math.max(1, list.n)) * 100) },
    absorb: {
      n,
      r: r2(cov / Math.sqrt(Math.max(1e-9, va * vd))),
      byAcc: Object.fromEntries(
        accBins.slice(0, -1).map((lo, i) => {
          const l = absorbs.filter((x) => x.acc >= lo && x.acc < accBins[i + 1]);
          const m = l.reduce((a, x) => a + x.drop, 0) / Math.max(1, l.length);
          const sd = Math.sqrt(l.reduce((a, x) => a + (x.drop - m) ** 2, 0) / Math.max(1, l.length));
          return [`${lo}-${accBins[i + 1]}`, { n: l.length, dropFt: r3(m), sd: r3(sd) }];
        }),
      ),
    },
  };
}

/**
 * Two bodies meeting as one: each knock (Puppet.hit, the two of a pair in one frame) over the next PAIR_MS of the bodies'
 * time: how far each went along the line from the first to the second (ft, at most, past 0 toward the second's side),
 * and how far the room between them opened at most (ft): two knocked off each other as one go the same way and stay
 * on each other; two who react apart bounce off, the room between them opening. By kind. And for two leaning on each
 * other (a screen, a box-out: the scene's meetings), how their hips go along that line frame to frame: `r` how well
 * each one's goes with the other's (two pushing and giving as one: over 0).
 */
const PAIR_MS = 300;
function pairs({ speed = 1 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  type Hit = { p: Puppet; dx: number; dz: number; power: number; kind: string };
  let now: Hit[] = [];
  const hitNow = Puppet.prototype.hit;
  Puppet.prototype.hit = function (this: Puppet, ...args: Parameters<Puppet['hit']>) {
    const [dx, dz, power, kind] = args;
    now.push({ p: this, dx, dz, power, kind: kind ?? 'bump' });
    hitNow.apply(this, args);
  };
  type Pair = {
    a: Puppet;
    b: Puppet;
    nx: number;
    nz: number;
    a0: [number, number];
    b0: [number, number];
    d0: number;
    t: number;
    aMost: number;
    bMost: number;
    open: number;
    kind: string;
    power: number;
  };
  const live: Pair[] = [];
  const done: Pair[] = [];
  const meeting = (scene as unknown as { meeting: { i: number; j: number; w: number }[] }).meeting ?? [];
  const planAt = (scene as unknown as { planAt: Map<number, [number, number]> }).planAt;
  const was = new Map<Puppet, [number, number]>();
  const xs: number[] = [];
  const ys: number[] = [];
  let t = 0;
  const own = FRAME * speed;
  while (c.step() && c.finalMs < 0) {
    t += own;
    // (the two hits of a pair come in one frame, one each way)
    for (let i = 0; i + 1 < now.length; i++) {
      const [h1, h2] = [now[i], now[i + 1]];
      if (h1.dx * h2.dx + h1.dz * h2.dz >= 0) continue;
      const n = Math.hypot(h2.dx, h2.dz) || 1;
      const [nx, nz] = [h2.dx / n, h2.dz / n];
      const off0 = (P: Puppet) => {
        const at = planAt.get((P as unknown as { who: number }).who);
        return at ? (P.x - at[0]) * nx + (P.z - at[1]) * nz : 0;
      };
      live.push({
        a: h1.p,
        b: h2.p,
        nx,
        nz,
        a0: [off0(h1.p), 0],
        b0: [off0(h2.p), 0],
        d0: Math.hypot(h2.p.x - h1.p.x, h2.p.z - h1.p.z),
        t,
        aMost: 0,
        bMost: 0,
        open: 0,
        kind: h1.kind === h2.kind ? h1.kind : `${h1.kind}/${h2.kind}`,
        power: Math.max(h1.power, h2.power),
      });
      i++;
    }
    now = [];
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i];
      // (off his plan's spot: what the knock and the bodies did to him, not where the play took him)
      const off = (P: Puppet) => {
        const at = planAt.get((P as unknown as { who: number }).who);
        return at ? (P.x - at[0]) * q.nx + (P.z - at[1]) * q.nz : 0;
      };
      const da = off(q.a) - q.a0[0];
      const db = off(q.b) - q.b0[0];
      if (Math.abs(da) > Math.abs(q.aMost)) q.aMost = da;
      if (Math.abs(db) > Math.abs(q.bMost)) q.bMost = db;
      q.open = Math.max(q.open, Math.hypot(q.b.x - q.a.x, q.b.z - q.a.z) - q.d0);
      if (t - q.t >= PAIR_MS || cutNow) {
        done.push(q);
        live.splice(i, 1);
      }
    }
    // (two leaning on each other: each one's hips along the line between them, this frame)
    const sc = c.stage.script;
    if (sc && !cutNow)
      for (const m of meeting) {
        if (m.w < 0.6) continue;
        const pids = [...sc.oPids, ...sc.dPids];
        const A = inner.figs.get(pids[m.i])?.pup;
        const B = inner.figs.get(pids[m.j])?.pup;
        if (!A || !B) continue;
        const wa = was.get(A);
        const wb = was.get(B);
        const d = Math.hypot(B.x - A.x, B.z - A.z) || 1;
        const [nx, nz] = [(B.x - A.x) / d, (B.z - A.z) / d];
        if (wa && wb) {
          // (each man's own hips in his body, along the line: the pose's sway and surge, put in the scene)
          const hip = (P: Puppet) => {
            const V0 = { x: 0, y: 0, z: 0 };
            P.world(P.j[J.hips * 3], 0, P.j[J.hips * 3 + 2], V0);
            return (V0.x - P.x) * nx + (V0.z - P.z) * nz;
          };
          xs.push(hip(A) - wa[0]);
          ys.push(hip(B) - wb[0]);
        }
      }
    was.clear();
    if (sc)
      for (const m of meeting) {
        const pids = [...sc.oPids, ...sc.dPids];
        for (const k of [m.i, m.j]) {
          const P = inner.figs.get(pids[k])?.pup;
          const O = inner.figs.get(pids[k === m.i ? m.j : m.i])?.pup;
          if (!P || !O) continue;
          const d = Math.hypot(O.x - P.x, O.z - P.z) || 1;
          const [nx, nz] = k === m.i ? [(O.x - P.x) / d, (O.z - P.z) / d] : [(P.x - O.x) / d, (P.z - O.z) / d];
          const V0 = { x: 0, y: 0, z: 0 };
          P.world(P.j[J.hips * 3], 0, P.j[J.hips * 3 + 2], V0);
          was.set(P, [(V0.x - P.x) * nx + (V0.z - P.z) * nz, 0]);
        }
      }
    cutNow = false;
  }
  Puppet.prototype.hit = hitNow;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const kinds = new Map<string, Pair[]>();
  for (const q of done) {
    const l = kinds.get(q.kind) ?? [];
    if (!kinds.has(q.kind)) kinds.set(q.kind, l);
    l.push(q);
  }
  const mx = xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
  const my = ys.reduce((a, x) => a + x, 0) / Math.max(1, ys.length);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return {
    knocks: Object.fromEntries(
      [...kinds].map(([k, l]) => {
        const avg = (f: (q: Pair) => number) => r2(l.reduce((a, q) => a + f(q), 0) / Math.max(1, l.length));
        return [
          k,
          {
            n: l.length,
            power: avg((q) => q.power),
            first: avg((q) => q.aMost),
            second: avg((q) => q.bMost),
            sameWayPct: Math.round((l.filter((q) => q.aMost * q.bMost > 0).length / Math.max(1, l.length)) * 100),
            opened: avg((q) => q.open),
          },
        ];
      }),
    ),
    leaning: { frames: xs.length, r: r2(sxy / Math.sqrt(Math.max(1e-12, sxx * syy))) },
  };
}

/**
 * How much each man moves as himself: in his gathers, releases, dribbles and stance, a few things a viewer sees (in his
 * own frame, on the 6 ft 6 puppet's scale): for each, the spread of the men's own averages against how much one man's
 * frames spread about his own (`ratio`: over 1, men are told apart by it; near 0, one template for all), and how many men.
 */
function identity({ speed = 1 } = {}) {
  const c = new Clock(speed);
  c.tipMs = 0;
  type Acc = Map<number, number[]>;
  const feats = new Map<string, Acc>();
  const add = (f: string, pid: number, v: number) => {
    let m = feats.get(f);
    if (!m) feats.set(f, (m = new Map()));
    const l = m.get(pid) ?? [];
    if (!m.has(pid)) m.set(pid, l);
    if (l.length < 4000) l.push(v);
  };
  const DR = new Set(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack']);
  while (c.step() && c.finalMs < 0) {
    for (const [pid, f] of inner.figs) {
      const p = f.pup;
      const j = p.j;
      const s = p.body.s;
      const one = p.one;
      const y = (k: number) => j[k * 3 + 1] / s;
      const x = (k: number) => j[k * 3] / s;
      const z = (k: number) => j[k * 3 + 2] / s;
      if (DR.has(p.clip)) {
        add('dribble hips', pid, y(J.hips));
        add('dribble lean', pid, z(J.chest) - z(J.hips));
        add('dribble off hand', pid, Math.min(y(J.hl), y(J.hr)) === y(J.hl) ? y(J.hr) : y(J.hl));
      }
      if (p.clip === 'stance' || p.clip === 'shuffle') {
        add('stance hips', pid, y(J.hips));
        add('stance feet', pid, Math.hypot(x(J.fl) - x(J.fr), z(J.fl) - z(J.fr)));
        add('stance hands', pid, (y(J.hl) + y(J.hr)) / 2);
      }
      if (one && (one.id === 'layup' || one.id === 'floater') && one.tau > -440 && one.tau < -140) {
        add('gather ball', pid, p.pose[I.by]);
        add('gather side', pid, Math.abs(p.pose[I.bx]));
        add('gather hips', pid, y(J.hips));
      }
      if (one && (one.id === 'jumper' || one.id === 'freeThrow') && one.tau > 60 && one.tau < 300) {
        add('release guide hand', pid, x(J.hl) - x(J.sl));
        add('release knees', pid, (y(J.kl) + y(J.kr)) / 2 - y(J.hips));
      }
      if (one && one.id === 'jumper' && one.tau > -200 && one.tau < 0) add('set elbow', pid, x(J.er) - x(J.sr));
    }
    cutNow = false;
  }
  const out: Record<string, { ratio: number; men: number }> = {};
  for (const [f, m] of feats) {
    const men = [...m.values()].filter((l) => l.length >= 20);
    if (men.length < 3) continue;
    const means = men.map((l) => l.reduce((a, v) => a + v, 0) / l.length);
    const mu = means.reduce((a, v) => a + v, 0) / means.length;
    const between = Math.sqrt(means.reduce((a, v) => a + (v - mu) ** 2, 0) / means.length);
    const within = men.reduce((a, l, i) => a + Math.sqrt(l.reduce((b, v) => b + (v - means[i]) ** 2, 0) / l.length), 0) / men.length;
    out[f] = { ratio: Math.round((between / Math.max(1e-6, within)) * 100) / 100, men: men.length };
  }
  return out;
}

/** The possessions whose shot has a finish of its own (choreo's Finish), by finish. */
/**
 * Each hand's step from one drawn frame to the next, from its own shoulder in his own frame (what a viewer sees as the
 * hand moving on the body, whatever the body does), over the whole game at a speed chip: how many steps are longer than
 * each tenth of a foot, the longest, and every step longer than `over` ft with where it was. Cuts (a replay in and out,
 * a man put on a new spot) are not steps. Runs in slices (a game at 1x is longer than one call may take): returns at
 * once, and the result fills in; `done` once the buzzer has been held.
 */
function snaps({ speed = 1, over = 0.6, from = 0, upto = Infinity } = {}) {
  const c = new Clock(speed);
  if (from > 0) c.k = from;
  else c.tipMs = 0;
  // (and each step much longer than both its neighbours, as `measure` counts a hand's pop: see popped)
  const out = {
    done: false,
    frames: 0,
    steps: 0,
    longest: 0,
    hist: new Array(30).fill(0) as number[],
    over: [] as { ft: number; at: string }[],
    spikes: 0,
    worstSpike: 0,
    spiked: [] as { ft: number; at: string }[],
  };
  const was = new Map<number, { k: number; l: number[]; r: number[]; x: number; z: number; clip: string }>();
  const runs = new Map<string, { ft: number; at: string }[]>();
  const rel = (j: Float32Array, h: number, sh: number) => [j[h * 3] - j[sh * 3], j[h * 3 + 1] - j[sh * 3 + 1], j[h * 3 + 2] - j[sh * 3 + 2]];
  const slice = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 200) {
      cutNow = false;
      if (!c.step() || c.k > upto) {
        out.done = true;
        out.over.sort((a, b) => b.ft - a.ft);
        out.spiked.sort((a, b) => b.ft - a.ft);
        return;
      }
      out.frames++;
      const cut = cutNow || (scene as unknown as { director: { onAir: boolean } }).director.onAir;
      for (const [pid, f] of inner.figs) {
        const p = f.pup;
        if (!p.placed) continue;
        const now = { k: c.k, l: rel(p.j, J.hl, J.sl), r: rel(p.j, J.hr, J.sr), x: p.x, z: p.z, clip: p.clip };
        const w = was.get(pid);
        was.set(pid, now);
        if (!w || w.k !== c.k || cut || Math.hypot(now.x - w.x, now.z - w.z) > 3) {
          runs.delete(`${pid}L`);
          runs.delete(`${pid}R`);
          continue;
        }
        for (const [side, a, b] of [
          ['L', w.l, now.l],
          ['R', w.r, now.r],
        ] as const) {
          const ft = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          out.steps++;
          out.hist[Math.min(29, Math.floor(ft * 10))]++;
          out.longest = Math.max(out.longest, ft);
          const at = `k${c.k} t${Math.round(c.t)} p${pid} ${side} ${w.clip}>${now.clip}${p.one ? `(${p.one.id}@${Math.round(p.one.tau)})` : ''} ${actOfPid(c, pid)} root${Math.hypot(now.x - w.x, now.z - w.z).toFixed(2)}`;
          if (ft > over) out.over.push({ ft: Math.round(ft * 100) / 100, at });
          let r = runs.get(`${pid}${side}`);
          if (!r) runs.set(`${pid}${side}`, (r = []));
          r.push({ ft, at });
          if (r.length > 3) r.shift();
          if (r.length === 3) {
            const spike = popped(r[1].ft, r[0].ft, r[2].ft, HAND_POP * speed);
            if (spike > 0) {
              out.spikes++;
              out.worstSpike = Math.max(out.worstSpike, spike);
              out.spiked.push({ ft: Math.round(spike * 100) / 100, at: r[1].at });
            }
          }
        }
      }
    }
    setTimeout(slice, 0);
  };
  slice();
  return out;
}

/**
 * One man's hand through possession k (play ms `from` to `to`), frame by frame: his clip and move, his clip's grip,
 * his dribble, the hand from its shoulder (his frame), how far it is laid off its path (see settle.ts), the ball (his
 * frame) and his own followed ball. `lead`: possessions played before it (the whole game before it: k + 1).
 */
function handTrace({ k = 0, pid = -1, side = 'R', from = 0, to = Infinity, speed = 1, lead = 2 } = {}) {
  const c = new Clock(speed);
  if (lead >= k) c.tipMs = 0;
  c.k = Math.max(0, k - lead);
  while (c.k < k && c.finalMs < 0) c.step();
  const out: string[] = [];
  const f2 = (x: number) => x.toFixed(2);
  const [h, sh] = side === 'R' ? [J.hr, J.sr] : [J.hl, J.sl];
  while (c.k === k && c.finalMs < 0) {
    c.step();
    if (c.k !== k || c.t < from || c.t > to) continue;
    const f = inner.figs.get(pid >= 0 ? pid : scripts[k].oPids[0]);
    if (!f) continue;
    const p = f.pup;
    const q = p as unknown as {
      handF: { off: Float64Array }[];
      ballAt: { x: number; y: number; z: number };
      drib: { phase: number; hand: number; to: number };
      has: boolean;
      blend: number;
    };
    const j = p.j;
    const P = p.pose;
    const s = p.body.s;
    const b = inner.ball;
    const [sn, cs] = [Math.sin(p.yaw), Math.cos(p.yaw)];
    const [dx, dz] = [b.x - p.x, b.z - p.z];
    const lb = [dx * cs - dz * sn, b.y, dx * sn + dz * cs];
    const R = [j[h * 3] - j[sh * 3], j[h * 3 + 1] - j[sh * 3 + 1], j[h * 3 + 2] - j[sh * 3 + 2]];
    const cl = side === 'R' ? [I.rx, I.ry, I.rz] : [I.lx, I.ly, I.lz];
    out.push(
      `${Math.round(c.t)} ${p.clip}${p.one ? `(${p.one.id}@${Math.round(p.one.tau)})` : ''} b${f2(q.blend)} has${q.has ? 1 : 0} g${f2(P[side === 'R' ? I.gr : I.gl])} dr${f2(q.drib.phase)}/${q.drib.hand}>${q.drib.to} ov${p.overBall} hand(${R.map(f2)}) clip(${cl.map((i) => f2(P[i] * s)).join(',')}) off(${[...q.handF[side === 'R' ? 1 : 0].off].map(f2)}) ball(${lb.map(f2)}) mine(${f2(q.ballAt.x)},${f2(q.ballAt.y)},${f2(q.ballAt.z)})`,
    );
  }
  return out;
}

/**
 * The ball and the hands of the man who has it, through his dribbles (a dribble, a crossover, a hesitation, and the
 * frames into and out of them): each frame's step of the ball and of each hand in his own frame (so less his travel and
 * his turn), ft. `over`: steps longer than this (at 1x; as many times longer as the speed) are listed, longest first,
 * with what he was in. A ball that goes down to the floor and back is fast, not a jump: `spikes` are the steps that
 * stand out from both their neighbours (see popped). Cuts and replays are not steps. Runs in slices: poll `done`.
 */
function dribbles({ speed = 1, over = 0.7, from = 0, upto = Infinity } = {}) {
  const c = new Clock(speed);
  if (from > 0) c.k = from;
  else c.tipMs = 0;
  const out = { done: false, frames: 0, steps: 0, longest: 0, over: [] as { ft: number; at: string }[], spikes: 0, spiked: [] as { ft: number; at: string }[] };
  const DR = new Set(['dribble', 'dribbleRun', 'dribbleWalk', 'dribbleBack', 'crossover', 'hesi']);
  type Row = { k: number; pid: number; b: number[]; l: number[]; r: number[]; clip: string; one: string; x: number; z: number; ph: string; lefty: boolean };
  let was: Row | null = null;
  let run: { ball: number; l: number; r: number; at: string }[] = [];
  const d3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const slice = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 200) {
      cutNow = false;
      if (!c.step() || c.k > upto) {
        out.done = true;
        out.over.sort((a, b) => b.ft - a.ft);
        out.spiked.sort((a, b) => b.ft - a.ft);
        return;
      }
      out.frames++;
      const cut = cutNow || (scene as unknown as { director: { onAir: boolean } }).director.onAir;
      const held = (inner as unknown as { heldBy: number | null }).heldBy;
      const f = held !== null ? inner.figs.get(held) : undefined;
      // (a ball still in a referee's hands, on its way to the man who is to have it, is not his yet)
      if (cut || !f || !f.pup.placed || !c.stage.play || Math.hypot(inner.ball.x - f.pup.x, inner.ball.z - f.pup.z) > 4.5) {
        was = null;
        run = [];
        continue;
      }
      const p = f.pup;
      const b = inner.ball;
      const [sn, cs] = [Math.sin(p.yaw), Math.cos(p.yaw)];
      const [dx, dz] = [b.x - p.x, b.z - p.z];
      const now: Row = {
        k: c.k,
        pid: held!,
        b: [dx * cs - dz * sn, b.y, dx * sn + dz * cs],
        l: [p.j[J.hl * 3], p.j[J.hl * 3 + 1], p.j[J.hl * 3 + 2]],
        r: [p.j[J.hr * 3], p.j[J.hr * 3 + 1], p.j[J.hr * 3 + 2]],
        clip: p.clip,
        one: p.one ? `${p.one.id}@${Math.round(p.one.tau)}` : '',
        x: p.x,
        z: p.z,
        ph: p.dribble ? p.dribble.phase.toFixed(2) : '-',
        lefty: (p as unknown as { lefty: boolean }).lefty,
      };
      const w = was;
      was = now;
      if (!w || w.k !== now.k || w.pid !== now.pid || !(DR.has(now.clip) || DR.has(w.clip))) {
        run = [];
        continue;
      }
      const [sb, sl, sr] = [d3(w.b, now.b), d3(w.l, now.l), d3(w.r, now.r)];
      const at = `k${now.k} t${Math.round(c.t)} p${now.pid} ball${sb.toFixed(2)} L${sl.toFixed(2)} R${sr.toFixed(2)} ${w.clip}(${w.one})>${now.clip}(${now.one}) ph${w.ph}>${now.ph} hand${w.lefty ? 'L' : 'R'}>${now.lefty ? 'L' : 'R'} root${Math.hypot(now.x - w.x, now.z - w.z).toFixed(2)} y${w.b[1].toFixed(2)}>${now.b[1].toFixed(2)}`;
      out.steps++;
      const m = Math.max(sb, sl, sr);
      out.longest = Math.max(out.longest, m);
      if (m > over * speed) out.over.push({ ft: Math.round(m * 100) / 100, at });
      run.push({ ball: sb, l: sl, r: sr, at });
      if (run.length > 3) run.shift();
      if (run.length === 3)
        for (const key of ['ball', 'l', 'r'] as const) {
          const spike = popped(run[1][key], run[0][key], run[2][key], HAND_POP * speed);
          if (spike > 0) {
            out.spikes++;
            out.spiked.push({ ft: Math.round(spike * 100) / 100, at: `${key} ${run[1].at}` });
          }
        }
    }
    setTimeout(slice, 0);
  };
  slice();
  return out;
}

/**
 * Shots at the rim (a dunk, a layup, a putback) as the main camera has them: over the last of the move up and the
 * first of the release, the drawn frames in which another man's trunk or head stands on the line from the gantry to the
 * ball (`hidden`, by what that man is doing), and after it (the release and the move that follows) how near the nearest
 * man's middle is to the shooter's (`crowd`: frames under `near` ft; `ring`: men within `round` ft, on average).
 */
function rimSight({ speed = 1, near = 2.4, round = 5, view = 'tv', only = '' } = {}) {
  const out = {
    shots: 0,
    frames: 0,
    hidden: 0,
    shotsHidden: 0,
    by: {} as Record<string, number>,
    after: 0,
    crowd: 0,
    ring: 0,
    worst: [] as string[],
    kinds: {} as Record<string, number[]>,
  };
  const seg = (a: number[], c: number[]) => {
    const u = [a[3] - a[0], a[4] - a[1], a[5] - a[2]];
    const v = [c[3] - c[0], c[4] - c[1], c[5] - c[2]];
    const ww = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
    const dot = (x: number[], y: number[]) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    const [uu, uv, vv, uw, vw] = [dot(u, u), dot(u, v), dot(v, v), dot(u, ww), dot(v, ww)];
    const den = uu * vv - uv * uv;
    const cl = (x: number) => Math.max(0, Math.min(1, x));
    let sA = den > 1e-9 ? cl((uv * vw - vv * uw) / den) : 0;
    const t = cl((uv * sA + vw) / (vv || 1));
    sA = cl((uv * t - uw) / (uu || 1));
    return Math.hypot(ww[0] + u[0] * sA - v[0] * t, ww[1] + u[1] * sA - v[1] * t, ww[2] + u[2] * sA - v[2] * t);
  };
  scripts.forEach((sc, k) => {
    const pids = [...sc.oPids, ...sc.dPids];
    for (let i = 1; i < sc.frames.length; i++) {
      const j = sc.frames[i - 1].act.findIndex((a) => a === 'dunk' || a === 'layup');
      if (j < 0 || !sc.frames[i].fx) continue;
      const kind = `${sc.frames[i - 1].act[j]}${sc.frames[i].how ? ' ' + sc.frames[i].how : ''}${sc.frames[i].swat !== undefined ? ' blocked' : ''}`;
      if (only && !kind.includes(only)) continue;
      const c = new Clock(speed);
      c.k = Math.max(0, k - 1);
      if (k === 0) c.tipMs = 0;
      // (where each camera stands: cameras.ts mount())
      const end = w({ x: 0, y: 5.25 }, sc.dir).y < 47 ? -1 : 1;
      const cam = view === 'low' ? [end * LOW[0], LOW[1], LOW[2]] : view === 'side' ? [end * 30, 13, 50] : view === 'end' ? [-end * 77, 36, 0] : [0, 36, 81];
      let hid = 0;
      let seen = 0;
      let crowdHere = 0;
      while (c.k <= k && c.finalMs < 0) {
        c.step();
        if (c.k !== k) continue;
        const pl = c.stage.play;
        if (!pl) continue;
        const me = inner.figs.get(pids[j]);
        if (!me) continue;
        if ((pl.i === i - 1 && pl.u > 0.6) || (pl.i === i && pl.u < 0.3)) {
          const b = inner.ball;
          const ray = [cam[0], cam[1], cam[2], b.x, b.y, b.z];
          // (short of the ball itself)
          const L = Math.hypot(b.x - cam[0], b.y - cam[1], b.z - cam[2]);
          for (let q = 3; q < 6; q++) ray[q] = cam[q - 3] + ((ray[q] - cam[q - 3]) * (L - 0.6)) / L;
          seen++;
          out.frames++;
          let who = '';
          for (const [pid, f] of inner.figs) {
            if (f === me) continue;
            const p = f.pup;
            const W = (n: number) => {
              p.world(p.j[n * 3], p.j[n * 3 + 1], p.j[n * 3 + 2], V);
              return [V.x, V.y, V.z];
            };
            const body = [...W(J.hips), ...W(J.head)];
            const act = sc.frames[Math.min(pl.i, sc.frames.length - 1)].act[pids.indexOf(pid)] ?? 'other';
            if (seg(ray, body) < 0.62 * p.body.s * p.body.bulk) who = act;
            // (or an arm of his: shoulder to elbow to hand)
            else
              for (const [a, b2] of [
                [J.sl, J.el],
                [J.el, J.hl],
                [J.sr, J.er],
                [J.er, J.hr],
              ])
                if (seg(ray, [...W(a), ...W(b2)]) < 0.28 * p.body.s) who = `${act} arm`;
          }
          if (who) {
            hid++;
            out.hidden++;
            out.by[who] = (out.by[who] ?? 0) + 1;
          }
        }
        if ((pl.i === i && pl.u >= 0.3) || pl.i === i + 1) {
          out.after++;
          let nearest = Infinity;
          for (const f of inner.figs.values()) {
            if (f === me) continue;
            const far = Math.hypot(f.pup.x - me.pup.x, f.pup.z - me.pup.z);
            nearest = Math.min(nearest, far);
            if (far < round) out.ring++;
          }
          if (nearest < near) {
            out.crowd++;
            crowdHere++;
          }
        }
      }
      out.shots++;
      const K = (out.kinds[kind] ??= [0, 0, 0, 0]);
      K[0]++;
      K[1] += seen;
      K[2] += hid;
      K[3] += crowdHere;
      if (hid > seen * 0.4) {
        out.shotsHidden++;
        out.worst.push(`k${k} i${i} p${pids[j]} ${kind} ${hid}/${seen}`);
      }
    }
  });
  out.ring = Math.round((out.ring / Math.max(1, out.after)) * 100) / 100;
  return out;
}

/**
 * Every jump shot of the game as the camera `view` shows it in a picture `w` by `h` (`calm`: reduced motion), from the
 * frame he goes up in to the ball a third of the way through its flight: the frames in which his feet, his head, the ball or the
 * rim is outside the picture (`out`, by which), the shots with any such frame, and how wide the picture went (degrees
 * top to bottom and across). By where he shot from: the camera's own corner (`near`), the other (`far`), elsewhere.
 */
function shotSight({ view = 'low', calm = false, w: pw = 844, h: ph = 390, speed = 1 } = {}) {
  const zone = () => ({ shots: 0, lost: 0, frames: 0, out: 0, by: {} as Record<string, number>, fov: 0, across: 0, worst: [] as string[], held: 0, zoomStep: 0, turnStep: 0 });
  const out = { near: zone(), far: zone(), rest: zone() };
  const cam = inner.camera as PerspectiveCamera;
  const at = new Vector3();
  scene.size(pw, ph, 1);
  const was = (props as { cam?: string }).cam;
  (props as { cam?: string }).cam = view;
  // (how hard the picture moved between two frames: its zoom (degrees) and its look (degrees); and the operator's hold)
  const op = (inner as unknown as { op: { holds: number } }).op;
  const look = new Vector3();
  const lookWas = new Vector3();
  scripts.forEach((sc, k) => {
    const pids = [...sc.oPids, ...sc.dPids];
    for (let i = 1; i < sc.frames.length; i++) {
      const j = sc.frames[i - 1].act.findIndex((a) => a === 'jumper');
      if (j < 0 || !sc.frames[i].fx) continue;
      const c = new Clock(speed, calm);
      c.k = Math.max(0, k - 1);
      if (k === 0) c.tipMs = 0;
      const end = w({ x: 0, y: 5.25 }, sc.dir).y < 47 ? -1 : 1;
      let z: ReturnType<typeof zone> | null = null;
      let bad = 0;
      let fovWas = -1;
      while (c.k <= k && c.finalMs < 0) {
        const holds = op.holds;
        c.step();
        if (c.k !== k) continue;
        const pl = c.stage.play;
        const me = inner.figs.get(pids[j]);
        if (!pl || !me || !(pl.i === i - 1 || (pl.i === i && pl.u < 0.3))) continue;
        // (the camera that follows the play, not a cut-in or a replay)
        if ((inner as unknown as { shot: string }).shot !== 'main') continue;
        if (!z) {
          z = Math.abs(me.pup.z) > 19 && end * me.pup.x > 30 ? (me.pup.z > 0 ? out.near : out.far) : out.rest;
          z.shots++;
        }
        cam.updateMatrixWorld();
        if (op.holds > holds) z.held++;
        cam.getWorldDirection(look);
        if (fovWas >= 0) {
          z.zoomStep = Math.max(z.zoomStep, Math.round(Math.abs(cam.fov - fovWas) * 100) / 100);
          z.turnStep = Math.max(z.turnStep, Math.round(((look.angleTo(lookWas) * 180) / Math.PI) * 100) / 100);
        }
        fovWas = cam.fov;
        lookWas.copy(look);
        const head = me.pup.world(me.pup.j[J.head * 3], me.pup.j[J.head * 3 + 1], me.pup.j[J.head * 3 + 2], new Vector3());
        const what: [string, number, number, number][] = [
          ['feet', me.pup.x, 0.2, me.pup.z],
          ['head', head.x, head.y, head.z],
          ['ball', inner.ball.x, inner.ball.y, inner.ball.z],
          ['rim', end * 41.75, 10, 0],
        ];
        z.frames++;
        let lost = false;
        for (const [name, x, y, zz] of what) {
          at.set(x, y, zz).project(cam);
          if (Math.abs(at.x) > 1 || Math.abs(at.y) > 1 || at.z > 1) {
            z.by[name] = (z.by[name] ?? 0) + 1;
            lost = true;
          }
        }
        if (lost) {
          z.out++;
          bad++;
        }
        const across = (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect) * 180) / Math.PI;
        if (cam.fov > z.fov) [z.fov, z.across] = [Math.round(cam.fov * 10) / 10, Math.round(across * 10) / 10];
      }
      if (z && bad) {
        z.lost++;
        if (z.worst.length < 6) z.worst.push(`k${k} i${i} p${pids[j]} ${bad}`);
      }
    }
  });
  (props as { cam?: string }).cam = was;
  return out;
}

/**
 * Possession k's instant replay as the broadcast shows it, into #strip: every `every`th frame of it, in a picture
 * `w` by `h`. `turn`: which of the play's cameras has the turn (director.ts CAMS). Says which camera it took.
 */
async function replayFilm({ k = 0, turn = 0, every = 10, w = 480, h = 270, cols = 4, most = 16, speed = 1 } = {}) {
  const c = new Clock(speed);
  c.k = Math.max(0, k - 1);
  if (k === 0) c.tipMs = 0;
  scene.size(w, h, 1);
  while (c.k <= k && c.finalMs < 0) c.step();
  const dir = (inner as unknown as { director: { onAir: boolean; n: number; reel: { cam: string; kind: string; seat: V3 } | null } }).director;
  dir.n = turn;
  if (!scene.replay(scripts[k])) return { cells: 0, why: 'no replay due' };
  const cells: ImageBitmap[] = [];
  const cams: string[] = [];
  let n = 0;
  let guard = 0;
  while (!scene.released && guard++ < 4000 && cells.length < most) {
    drawing = dir.onAir && n % every === 0;
    scene.frame(c.stage, props, 0, FRAME, false, FRAME * speed);
    if (drawing) {
      cells.push(await createImageBitmap(canvas));
      cams.push(dir.reel ? `${dir.reel.cam}@${dir.reel.seat.x.toFixed(0)},${dir.reel.seat.y.toFixed(0)},${dir.reel.seat.z.toFixed(0)}` : '-');
    }
    drawing = false;
    if (dir.onAir) n++;
  }
  scene.endReplay();
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  strip.width = Math.min(cols, cells.length) * w;
  strip.height = Math.ceil(cells.length / cols) * h;
  const g = strip.getContext('2d')!;
  cells.forEach((b, i) => g.drawImage(b, (i % cols) * w, Math.floor(i / cols) * h));
  return { cells: cells.length, cams: [...new Set(cams)] };
}

function finishes() {
  const out: Record<string, number[]> = {};
  scripts.forEach((sc, k) => sc.frames.forEach((f) => f.how && !(out[f.how] ??= []).includes(k) && out[f.how].push(k)));
  return out;
}

/** A measure's numbers in short, as one line: for a quick look at a change (`from`, `upto`: only those possessions). */
function quick(o: Parameters<typeof measure>[0] = {}) {
  const m = measure({ speed: 1, ...o }) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const top = (w: Record<string, number>, n = 10) =>
    Object.fromEntries(
      Object.entries(w)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n),
    );
  const L = m.limbs;
  return JSON.stringify({
    frames: m.frames,
    hand: { n: L.hand.n, max: L.hand.max, why: top(L.hand.why, 12) },
    knee: { n: L.knee.n, kinks: L.knee.kinks, why: top(L.knee.why, 8) },
    hips: { n: L.hips.n, why: top(L.hips.why, 4) },
    inside: [L.inside.arms, L.inside.armsMeet, L.inside.legs],
    lasting: [L.lasting.frames, L.lasting.over2, L.lasting.over5],
    catch: L.catch,
    arms: { fast: L.arms.fast, wrong: L.arms.wrong, shut: L.arms.shut, own: L.arms.own, back: L.arms.back, why: top(L.arms.why, 14) },
    pops: [m.pops.n, m.pops.steady, m.pops.max],
    popWhy: top(m.popWhy, 16),
    yaw: [m.pops.yawN, top(m.yawWhy, 4)],
    ball: m.hits.ball,
    ballWhy: top(m.ballWhy, 6),
    slides: m.slides,
    worst: Object.fromEntries(Object.entries(m.worst as Record<string, string[]>).map(([k, v]) => [k, v.slice(0, o.most ?? 5)])),
  });
}

/** The overlap counters and where each comes from, as one short line (`from`, `upto`: only those possessions). */
function brief(o: Parameters<typeof measure>[0] = {}) {
  const m = measure({ speed: 1, ...o }) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const L = m.limbs;
  const top = (w: Record<string, number>, pre = '', n = 8) =>
    Object.fromEntries(
      Object.entries(w)
        .filter(([k]) => k.startsWith(pre))
        .sort((a, b) => b[1] - a[1])
        .slice(0, n),
    );
  return JSON.stringify({
    frames: m.frames,
    hand: [L.hand.n, L.hand.max],
    knee: [L.knee.n, L.knee.kinks],
    hips: L.hips.n,
    inside: [L.inside.arms, L.inside.armsMeet, L.inside.legs],
    lasting: [L.lasting.frames, L.lasting.over2, L.lasting.over5],
    arms: [L.arms.fast, L.arms.shut, L.arms.own, L.arms.back],
    pops: [m.pops.n, m.pops.max],
    ball: m.hits.ball,
    legWhy: top(L.inside.why, 'leg'),
    armWhy: top(L.inside.why, 'arm', 12),
    backWhy: L.arms.backWhy,
    ballWhy: top(m.ballWhy),
    kneeWhy: top(L.knee.why, '', 6),
    legWorst: (m.worst['leg in body'] ?? []).slice(0, 5),
    backWorst: (m.worst['elbow folded back'] ?? []).slice(0, 5),
  });
}

/**
 * The broadcast picture's own motion over possessions `from`..`to` (the live page's pace, `speed`): how fast its look
 * turns (deg/s of real time), how hard that changes from frame to frame (deg/s², a jolt), and its zoom (fov deg/s);
 * medians, 95th and the most, and how many frames jolt past `jolt` deg/s² (a hand on a camera never does).
 */
function camPath({ view = 'tv', from = 0, to = 12, speed = 1, w: pw = 844, h: ph = 390, jolt = 400 } = {}) {
  const cam = inner.camera as PerspectiveCamera;
  scene.size(pw, ph, 1);
  const was = (props as { cam?: string }).cam;
  (props as { cam?: string }).cam = view;
  const c = new Clock(speed);
  c.k = Math.max(0, from - 1);
  if (from === 0) c.tipMs = 0;
  const dir = new Vector3();
  const prev = new Vector3();
  let fovWas = -1;
  let vWas = -1;
  const turn: number[] = [];
  const acc: number[] = [];
  const zoom: number[] = [];
  const worst: string[] = [];
  const dt = FRAME / 1000;
  while (c.k <= to && c.finalMs < 0) {
    c.step();
    if (c.k < from) continue;
    cam.getWorldDirection(dir);
    if (fovWas >= 0) {
      const a = (Math.acos(Math.min(1, Math.max(-1, dir.dot(prev)))) * 180) / Math.PI / dt;
      turn.push(a);
      zoom.push(Math.abs(cam.fov - fovWas) / dt);
      if (vWas >= 0) {
        const j = Math.abs(a - vWas) / dt;
        acc.push(j);
        if (j > jolt && worst.length < 12) worst.push(`k${c.k} t${Math.round(c.t)} ${a.toFixed(0)}deg/s`);
      }
      vWas = a;
    }
    prev.copy(dir);
    fovWas = cam.fov;
  }
  (props as { cam?: string }).cam = was;
  const q = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0);
  };
  return {
    frames: turn.length,
    turn: { p50: q(turn, 0.5), p95: q(turn, 0.95), max: q(turn, 1) },
    jolt: { p50: q(acc, 0.5), p95: q(acc, 0.95), max: q(acc, 1), over: acc.filter((x) => x > jolt).length },
    zoom: { p50: q(zoom, 0.5), p95: q(zoom, 0.95), max: q(zoom, 1) },
    worst,
  };
}

(window as unknown as { lab: unknown }).lab = {
  camPath,
  quick,
  brief,
  rimSight,
  shotSight,
  replayFilm,
  snaps,
  dribbles,
  handTrace,
  weight,
  support,
  pairs,
  identity,
  lasts,
  wrists,
  facing,
  handoffs,
  kinks,
  lurches,
  contacts,
  legTrace,
  dunks,
  replays,
  finishes,
  footTrace,
  footwork,
  feet,
  Puppet,
  I,
  ballArms,
  knockLook,
  meetLegs,
  meetHops,
  into,
  PARTS,
  J,
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
  Clock,
  props,
};
document.title = 'Motion lab ready';
