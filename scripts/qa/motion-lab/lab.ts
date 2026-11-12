/// <reference lib="dom" />
// A bench for the figures' motion (dev server only): a real game, simulated here, played through the real
// 3D scene on a clock of its own (60 frames a second, nothing waits for the screen), measured, and filmed.
//   lab.measure({ speed: 2 })     the whole game at a speed chip: planted feet that slide, hips that sink on a
//                                 run, bodies inside each other, the ball inside a body
//   lab.when('pull')              where in the game a man goes into that clip, or makes that gesture
//   lab.find('dunk')              the possessions with a man doing that (act), and when
//   lab.film({ k, pid, from, to, every, eye, fov })   a strip of moments of possession k, a camera on one man
//                                 (eye: where the camera is from him, ft; 'tv': the broadcast's own)
//                                 (k: 0 with `tip`: from both fives waiting round the circle for the opening tip)
//   lab.pose({ drive, n, from, to })   one move side by side at moments of it, at centre court
//   ?seed=n&home=n&away=n picks the game. ?side=0: nobody round the floor. ?toes=0: the feet as the body turns them itself (by default the lab turns
//   each foot bone by the puppet's own `feet[k].pitch`, the heel-and-toe roll the body doesn't read yet).
import { Mesh, MeshStandardMaterial, PerspectiveCamera, SphereGeometry, Vector3, type Bone, type Camera, type Scene, type WebGLRenderer } from 'three';
import { createLeague, defaultSettings } from '../../../src/core/league/create';
import { teamPlayers } from '../../../src/core/league/helpers';
import { composites } from '../../../src/core/ratings';
import { Rng } from '../../../src/core/random';
import { GameSim } from '../../../src/core/sim/engine';
import { buildScript, COURT_LEN, standing, tipSpots, type Act, type Script, type Standing } from '../../../src/ui/live/choreo';
import { emptyStage, paintFloor, pose as poseAt, readPaints, type CourtFloor, type Stage } from '../../../src/ui/live/Court';
import { I } from '../../../src/ui/live/court3d/clips';
import { Fig, type Geo } from '../../../src/ui/live/court3d/figure';
import { BALL_R, bodyOf, HIP, J, type Drive } from '../../../src/ui/live/court3d/puppet';
import type { Gesture } from '../../../src/ui/live/court3d/clips';
import { CourtScene, loadModels } from '../../../src/ui/live/court3d/scene';
import { matchKits } from '../../../src/ui/teamColors';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
/** The 3D court's pace (CourtView's COURT3D_PACE), and the 2D court's tail after a possession's last frame (ms). */
const PACE = 0.5;
const TAIL = 180;
const FRAME = 1000 / 60;
/** How long both fives wait round the centre circle before the opening tip (real ms). */
const TIP_WAIT = 1600;

// (the roll of a foot from heel to toe: the puppet says it, the body's foot bones are turned here until figure.ts reads it)
if (q.get('toes') !== '0') {
  const place = Fig.prototype.place;
  const X = new Vector3(1, 0, 0);
  Fig.prototype.place = function (this: Fig) {
    place.call(this);
    const bones = (this as unknown as { bones: Bone[] }).bones;
    this.pup.feet.forEach((f, k) => {
      const b = bones[k ? 14 : 11];
      const lift = Math.max(0, b.position.y / this.pup.body.s - 0.28);
      // (as the body has it, toes down by how high the foot is, where the puppet says nothing: a jump)
      b.quaternion.setFromAxisAngle(X, Math.max(-0.4, Math.min(1.1, this.pup.pose[I.air] > 0.5 ? Math.min(0.95, lift * 0.75) : f.pitch)));
    });
  };
}

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
  readonly stage: Stage = emptyStage();
  constructor(
    readonly speed: number,
    readonly calm = false,
  ) {}
  /** One frame on (real ms). False once the buzzer has been held this long. */
  step(real = FRAME, hold = 3000): boolean {
    const st = this.stage;
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
const HP = new Vector3();
const CH = new Vector3();
const HD = new Vector3();
const HL = new Vector3();
const HR = new Vector3();

/** The whole game at a speed chip, measured. */
function measure({ speed = 2, calm = false, slide = 0.05 } = {}) {
  const c = new Clock(speed, calm);
  c.tipMs = 0;
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
    { x: number; z: number; feet: [number, number, boolean][]; head: number; pose: Float32Array; air: number; yaw: number; twist: number; turn: number }
  >();
  const acts = new Map<string, number>();
  const gestures = new Map<string, number>();
  const making = new Map<number, string | null>();
  for (;;) {
    if (!c.step()) break;
    frames++;
    const figs = [...inner.figs.entries()];
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
      // (a foot is down while it isn't swinging and he isn't in the air: one put down and dragged after him counts)
      const feet = p.feet.map((ft) => [ft.x, ft.z, !ft.swing && air < 0.5] as [number, number, boolean]);
      if (was && Math.hypot(p.x - was.x, p.z - was.z) < 3) {
        let worst = 0;
        feet.forEach((ft, k) => {
          if (ft[2] && was.feet[k][2]) worst = Math.max(worst, Math.hypot(ft[0] - was.feet[k][0], ft[1] - was.feet[k][1]));
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
    for (let a = 0; a < figs.length; a++)
      for (let b = a + 1; b < figs.length; b++) {
        const pa = figs[a][1].pup;
        const pb = figs[b][1].pup;
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        const r = (pa.body.s + pb.body.s) / 2;
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
    dunkOffDeg: Math.round((dunkOff * 180) / Math.PI),
    cases,
    headWhips: headWhip,
    whips: Object.fromEntries([...whips].sort((x, y) => y[1] - x[1]).slice(0, 16)),
    whipAt: Object.fromEntries([...whipAt].sort((x, y) => y[1] - x[1]).slice(0, 14)),
    headTravel: Math.round((heads / Math.max(1, pf)) * 1000) / 1000,
    statuePct: pct(still, standing),
    gestures: Object.fromEntries(gestures),
    clips: Object.fromEntries([...acts].sort((x, y) => y[1] - x[1])),
  };
}

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
 * (`eye`: how far from him, how high, how far round from the side toward mid-floor; 'tv': the broadcast camera). Drawn into #strip.
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
          const a = Math.atan2(-target.x, -target.z) + (eye[2] ?? 0);
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
 * for a man at `t` (the source of a function `(t) => Drive`), `cue` a gesture asked for at `cueAt`. Into #strip.
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
      const ball = d.ball ? f.pup.carry({ x: 0, y: 0, z: 0 }) : null;
      f.pup.arms(ball);
      b.visible = !!ball;
      if (ball) b.position.set(ball.x, ball.y, ball.z);
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

(window as unknown as { lab: unknown }).lab = {
  trace,
  pose,
  scripts,
  measure,
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
