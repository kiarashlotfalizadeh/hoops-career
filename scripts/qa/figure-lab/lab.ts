/// <reference lib="dom" />
// A bench for the 3D figures (dev server only): one move, seen as a strip of moments or running live.
//   /scripts/qa/figure-lab/?move=jumper            eight moments of it, left to right
//   /scripts/qa/figure-lab/?move=run&live=1        one figure, moving
//   footwork: ?move=turn (his stance turned round: a pivot, then steps), ?move=boxout (giving ground, the man behind him), ?move=rebound
//   with the ball, on the game's clock (the play's time half his own, as the 3D court plays it): ?move=pivot (held, the man on him,
//   turned round and back on his pivot), drive (at the rim off the dribble: a layup), pullup (a jumper off a dribble at a run),
//   cns (a catch and shoot), closeout (a defender running at a man, into his stance), beaten (in his stance, his man going by)
//   &who=n (whose way of doing it: a layup's side and euro, a jumper's step-back go by it)  &turn=90 (degrees: the move turned round
//   on the floor, so a camera in front of the row sees it side on)
//   &yaw=40 (degrees round him)  &zoom=1.4  &from=0&to=1200 (ms)  &n=8  &h=78&w=215 (his build)
//   &seed=1 (the first man's own things: his look, sleeves, shoes; the next is seed+1)  &light=1 (the home kit)  &num=23&name=Brunson&mark=NYK
//   &style=4 &beard=3 &tone=6 (everyone's hair, beard or skin: see look.ts)  &styles=1 (each man the next style; &styles=9: from the ninth)  &tones=1 (each the next skin)
//   &eye=3,5.5,6&at=0,5,0&fov=28 (a camera of one's own, ft: for a close look at a shoulder, a shoe)
//   &cue=point&cueAt=100 (a gesture, asked that far in: his hands as it has them; a list, or all: each man the next)
//   &arms=up|shoot|fwd|hip|out|across|back|down (both arms put there, whatever the move has them do; arms=all, or a list of them: each man the next)
//   faces: ?move=idle&n=6&gap=1.5&camY=6.4&lookY=6.25&zoom=3.6&yaw=12&from=100&to=100  (&beard=0..5: none, stubble, goatee, beard, full, strap)
//   &kind=0..5 (everyone's head the kind's own, as look.ts's FACES has it: long, broad, square, narrow, heavy, soft)  &kinds=1 (each the next kind)
//   &face=1 (his jaw open and his brows down, as in a roar)  &face=joy|shout|miss|stung|disbelief|stunned|wince|glare|exhale|blow (what a moment gives him: see Fig.feel, at its height)
//   &gest=protest|call|talk|... (a gesture, his talk with it)  &at=520 (how far into it, ms of his own time)
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Act } from '../../../src/ui/live/choreo';
import { GESTURES, type Gesture } from '../../../src/ui/live/court3d/clips';
import { Fig, figureGeo, settleHeads, type Feel } from '../../../src/ui/live/court3d/figure';
import { BEARDS, FACES, lookOf, SKINS, STYLES } from '../../../src/ui/live/court3d/look';
import { loadModels } from '../../../src/ui/live/court3d/models';
import { BALL_R, bodyOf, FARM, J, UARM, type Drive } from '../../../src/ui/live/court3d/puppet';
import type { MatchKit } from '../../../src/ui/teamColors';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const move = q.get('move') ?? 'jumper';
const live = q.has('live');
const n = live ? 1 : num('n', 8);

/** A move as the plan would ask for it, `t` ms in. Speeds in ft a second. */
function drive(t: number): Drive {
  const still = (act: Act, ball = false): Drive => ({ x: 0, z: 0, yaw: 0, act, ms: t, dur: 4000, ball });
  const going = (act: Act, v: number, ball = false, side = 0): Drive => ({ x: side ? (v * t) / 1000 : 0, z: side ? 0 : (v * t) / 1000, yaw: 0, act, ms: t, dur: 60000, ball });
  const shot = (act: Act, wind = 450, hold = 500): Drive => {
    const rim = { x: 0, z: act === 'jumper' || act === 'ft' ? 18 : 7 };
    if (t < hold) return { x: 0, z: 0, yaw: 0, act: 'hold', ms: t, dur: hold, ball: true };
    if (t < hold + wind) return { x: 0, z: 0, yaw: 0, act, ms: t - hold, dur: wind, ball: true, aim: rim };
    if (t < hold + wind + 900) return { x: 0, z: 0, yaw: 0, act: 'release', ms: t - hold - wind, dur: 900, ball: false, aim: rim };
    return still('stand');
  };
  switch (move) {
    case 'idle':
      return still('stand');
    case 'walk':
      return going('move', 5);
    case 'run':
      return going('move', 16);
    case 'sprint':
      return going('move', 36);
    case 'backpedal':
      return going('defend', -12);
    case 'shuffle':
      return going('guard', 9, false, 1);
    case 'stance':
      return still('guard');
    case 'ready':
      return still('defend');
    case 'dribble':
      return still('dribble', true);
    case 'dribbleRun':
      return going('dribble', 15, true);
    case 'crossover':
      return t < 600 ? still('dribble', true) : { x: 0, z: ((t - 600) * 6) / 1000, yaw: 0, act: 'drive', ms: t - 600, dur: 1500, ball: true };
    case 'jumper':
      return shot('jumper');
    case 'ft':
      return shot('ft', 600);
    case 'layup':
      return shot('layup');
    case 'dunk':
      return shot('dunk');
    case 'floater':
      return shot('floater');
    case 'pass':
      return t < 500 ? still('hold', true) : { ...still('pass'), ms: t - 500, ball: false };
    case 'hold':
      return still('hold', true);
    // footwork: in his stance he turns three-quarters of the way round (a pivot, then steps); a box-out with the man
    // behind him, giving ground a step at a time; a rebound gone up for off two feet
    case 'turn':
      return { ...still('defend'), yaw: t < 300 ? 0 : Math.min(2.4, ((t - 300) * 3.2) / 1000) };
    case 'boxout': {
      const z = -Math.max(0, t - 300) * 0.0012;
      return { ...still('boxout'), z, touch: { x: 0, z: z - 2.3, w: 1 } };
    }
    case 'rebound':
      return t < 400 ? still('boxout') : { ...still('rebound'), ms: t - 400, dur: 650 };
    // (these on the game's clock: t is the play's ms, a speed is ft a play's second, twice the body's)
    case 'pivot': {
      const yaw = t < 300 ? 0 : t < 800 ? Math.min(2.6, ((t - 300) * 7) / 1000) : Math.max(0.6, 2.6 - ((t - 800) * 5) / 1000);
      return { ...still('hold', true), yaw, press: { x: Math.sin(yaw) * 3, z: Math.cos(yaw) * 3 } };
    }
    case 'drive': {
      // (28 ft a play's second is a body's 14: easing off a little into the last of it)
      const z = (u: number) => (u < 600 ? (28 * u) / 1000 : 16.8 + 22 * ((u - 600) / 1000) - 8 * ((u - 600) / 1000) ** 2);
      const rim = { x: 0, z: z(900) + 2.5 };
      if (t < 600) return { ...going('dribble', 28, true), z: z(t) };
      if (t < 900) return { x: 0, z: z(t), yaw: 0, act: 'layup', ms: t - 600, dur: 300, ball: true, aim: rim };
      return { x: 0, z: z(900), yaw: 0, act: t < 1800 ? 'release' : 'stand', ms: t - 900, dur: 900, ball: false, aim: rim };
    }
    case 'pullup': {
      // (a dribble at a run, eased to a stop at his spot, and up from it)
      const z = (u: number) => (u < 300 ? (28 * u) / 1000 : 8.4 + 28 * 0.3 * (1 - (1 - Math.min(1, (u - 300) / 600)) ** 2));
      const rim = { x: 0, z: 30 };
      if (t < 900) return { x: 0, z: z(t), yaw: 0, act: 'dribble', ms: t, dur: 900, ball: true };
      if (t < 1200) return { x: 0, z: z(900), yaw: 0, act: 'jumper', ms: t - 900, dur: 300, ball: true, aim: rim };
      return { x: 0, z: z(900), yaw: 0, act: t < 2100 ? 'release' : 'stand', ms: t - 1200, dur: 900, ball: false, aim: rim };
    }
    case 'cns': {
      const rim = { x: 0, z: 24 };
      if (t < 360) return { x: 0, z: 0, yaw: 0, act: 'catch', ms: t, dur: 360, ball: false };
      if (t < 660) return { x: 0, z: 0, yaw: 0, act: 'jumper', ms: t - 360, dur: 300, ball: true, aim: rim };
      return { x: 0, z: 0, yaw: 0, act: t < 1560 ? 'release' : 'stand', ms: t - 660, dur: 900, ball: false, aim: rim };
    }
    case 'closeout': {
      // (30 ft a play's second, slowing to his man over the last of it)
      const u = Math.min(1, t / 700);
      return { x: 0, z: 10.5 * (1 - (1 - u) ** 2), yaw: 0, act: 'defend', ms: t, dur: 1400, ball: false };
    }
    case 'beaten': {
      // (in his stance, then his man goes by him to his right: faster than he slides)
      const go = Math.max(0, t - 300);
      return { x: -(30 * go) / 1000, z: 0, yaw: 0, act: 'guard', ms: t, dur: 4000, ball: false };
    }
    default:
      return still(move as Act);
  }
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x16161a);
renderer.toneMapping = NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
const scene = new Scene();
scene.add(new HemisphereLight(0xffffff, 0x9a7d5e, 1.5), new AmbientLight(0xffffff, 0.3));
const key = new DirectionalLight(0xfff6ea, 2.1);
key.position.set(8, 30, 14);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
// (the figures take shadows too: kept off their own skin)
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.06;
Object.assign(key.shadow.camera, { left: -30, right: 30, top: 20, bottom: -20, near: 5, far: 80 });
scene.add(key);
const rim = new DirectionalLight(0xcfdcff, 0.9);
rim.position.set(-10, 14, -24);
scene.add(rim);
const floor = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0xc99a62, roughness: 0.6 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const geo = figureGeo((o) => o, (await loadModels()).figure);
const kit = {
  color: '#1d428a',
  trim: '#ffc72c',
  night: '#5d8be0',
  text: '#1d428a',
  light: q.has('light'),
  token: q.has('light') ? { fill: '#f4f2ec', ring: '#1d428a', num: '#1d428a' } : { fill: '#1d428a', ring: '#ffc72c', num: '#ffffff' },
} as MatchKit;
const gap = num('gap', 5);
const figs = Array.from({ length: n }, (_, i) => {
  const look = lookOf(num('seed', 1) + i);
  if (q.has('styles')) look.style = (i + Math.max(0, num('styles', 1) - 1)) % STYLES.length;
  if (q.has('style')) look.style = num('style', 0) % STYLES.length;
  if (q.has('beard')) look.beard = num('beard', 0) % BEARDS.length;
  if (q.has('tones')) look.tone = i % SKINS.length;
  if (q.has('tone')) look.tone = num('tone', 0) % SKINS.length;
  look.skin = SKINS[look.tone];
  if (q.has('kind') || q.has('kinds')) {
    const kind = (q.has('kinds') ? i : num('kind', 0)) % FACES.length;
    const k = FACES[kind];
    Object.assign(look.face, {
      wide: k.wide,
      long: k.long,
      jaw: k.jaw,
      chin: k.chin,
      ridge: k.ridge,
      nose: k.nose,
      lips: k.lips,
      cheeks: k.cheeks,
      full: k.full,
      point: k.point,
      flare: k.flare,
      deep: k.deep,
      kind,
    });
  }
  const f = new Fig(
    geo,
    bodyOf(num('h', 78), num('w', 215)),
    0,
    kit,
    String(q.get('num') ?? 23),
    num('seed', 1) + i,
    String(q.get('name') ?? 'Brunson'),
    String(q.get('mark') ?? 'NYK'),
    look,
  );
  scene.add(f.group);
  const ball = new Mesh(new SphereGeometry(BALL_R, 18, 14), new MeshStandardMaterial({ color: 0xc8642a, roughness: 0.6 }));
  ball.castShadow = true;
  scene.add(ball);
  return { f, ball, x: (i - (n - 1) / 2) * gap, t: 0 };
});

settleHeads();
const yaw = (num('yaw', 30) * Math.PI) / 180;
const zoom = num('zoom', 1);
const cam = new PerspectiveCamera(28, innerWidth / innerHeight, 1, 400);
const dist = (n * gap * 0.62 + 16) / zoom;
cam.position.set(Math.sin(yaw) * dist, num('camY', 5.5), Math.cos(yaw) * dist);
cam.lookAt(0, num('lookY', 3.8), 0);
// (a camera of one's own: where it is and what it looks at, ft, and how wide it sees)
if (q.has('eye')) {
  const [eye, at] = [q.get('eye')!, q.get('at') ?? '0,4,0'].map((v) => v.split(',').map(Number));
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.fov = num('fov', 28);
  cam.updateProjectionMatrix();
  cam.lookAt(at[0], at[1], at[2]);
}

/** Arms put where a shoulder is hardest on a skin (each: the way the upper arm points, then the forearm, for his left; x out to his side, y up, z forward). */
const REACH: Record<string, [number[], number[]]> = {
  down: [
    [0.08, -1, 0.02],
    [0.05, -1, 0.12],
  ],
  up: [
    [0.25, 1, 0.1],
    [-0.05, 1, 0.05],
  ],
  shoot: [
    [0.2, 0.55, 0.8],
    [-0.1, 1, 0.1],
  ],
  fwd: [
    [0.1, -0.1, 1],
    [-0.1, 0.1, 1],
  ],
  hip: [
    [0.75, -0.6, -0.25],
    [-0.8, -0.45, 0.4],
  ],
  out: [
    [1, 0.05, 0],
    [1, 0.3, 0.1],
  ],
  across: [
    [-0.35, -0.3, 0.9],
    [-0.9, 0.2, 0.4],
  ],
  back: [
    [0.2, -0.75, -0.65],
    [0.1, -0.9, -0.3],
  ],
};
const ARMS = q.get('arms');
function reach(f: Fig, pose: string) {
  const [up, low] = REACH[pose] ?? REACH.down;
  const { j, body, left, up: spine, front } = f.pup;
  for (const [side, sh, el, ha] of [
    [1, J.sl, J.el, J.hl],
    [-1, J.sr, J.er, J.hr],
  ] as const) {
    let at = [j[sh * 3], j[sh * 3 + 1], j[sh * 3 + 2]];
    for (const [d, len, to] of [
      [up, UARM, el],
      [low, FARM, ha],
    ] as const) {
      const n = Math.hypot(d[0], d[1], d[2]);
      const [x, y, z] = [(side * d[0]) / n, d[1] / n, d[2] / n];
      at = [
        at[0] + (left.x * x + spine.x * y + front.x * z) * len * body.s,
        at[1] + (left.y * x + spine.y * y + front.y * z) * len * body.s,
        at[2] + (left.z * x + spine.z * y + front.z * z) * len * body.s,
      ];
      j[to * 3] = at[0];
      j[to * 3 + 1] = at[1];
      j[to * 3 + 2] = at[2];
    }
  }
}

/** `&cue=point&cueAt=100`: a gesture asked of each of them that far in (ms); `&cue=all`: each the next one. */
const CUES = q.get('cue') === 'all' ? Object.keys(GESTURES) : (q.get('cue')?.split(',') ?? []);
const cued = new Set<number>();

/** One figure a step on, then put where its lane is (it runs on the spot). */
const PLAY = new Set(['pivot', 'drive', 'pullup', 'cns', 'closeout', 'beaten']).has(move) ? 0.5 : 1;
const TURN = (num('turn', 0) * Math.PI) / 180;
const turned = <T extends { x: number; z: number } | undefined>(p: T): T =>
  p && ({ ...p, x: p.x * Math.cos(TURN) + p.z * Math.sin(TURN), z: -p.x * Math.sin(TURN) + p.z * Math.cos(TURN) } as T);
function step(k: (typeof figs)[number], dt: number) {
  k.t += dt * PLAY;
  const i = figs.indexOf(k);
  if (CUES.length && !cued.has(i) && k.t >= num('cueAt', 100)) {
    k.f.pup.cue(CUES[i % CUES.length] as Gesture);
    cued.add(i);
  }
  const d0 = drive(k.t);
  const d = { ...d0, ...turned({ x: d0.x, z: d0.z }), yaw: d0.yaw + TURN, aim: turned(d0.aim), press: turned(d0.press), touch: turned(d0.touch), who: num('who', 0) };
  k.f.pup.update(d, dt * PLAY, dt);
  const b = d.ball ? k.f.pup.carry({ x: 0, y: 0, z: 0 }) : null;
  k.f.pup.arms(b);
  if (ARMS) reach(k.f, (ARMS === 'all' ? Object.keys(REACH) : ARMS.split(','))[figs.indexOf(k) % (ARMS === 'all' ? Object.keys(REACH).length : ARMS.split(',').length)]);
  k.f.place();
  const offX = k.x - k.f.pup.x;
  const offZ = -k.f.pup.z;
  k.f.group.position.x += offX;
  k.f.group.position.z += offZ;
  k.ball.visible = !!b;
  if (b) k.ball.position.set(b.x + offX, b.y, b.z + offZ);
}

if (live) {
  let last = performance.now();
  const tick = (now: number) => {
    step(figs[0], Math.min(40, now - last) * num('speed', 1));
    last = now;
    renderer.render(scene, cam);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
} else {
  const from = num('from', 300);
  const to = num('to', 1700);
  figs.forEach((k, i) => {
    const end = from + ((to - from) * i) / Math.max(1, n - 1);
    while (k.t < end - 1e-6) step(k, Math.min(16, (end - k.t) / PLAY));
  });
  // (a camera on one of the first man's joints, wherever the move has taken it: &focus=hr&off=1.2,0.3,1.6, ft from it)
  const focus = q.get('focus') as keyof typeof J | null;
  if (focus && focus in J) {
    const j = figs[0].f.pup.j;
    const k = J[focus];
    const at = figs[0].f.group.localToWorld(new Vector3(j[k * 3], j[k * 3 + 1], j[k * 3 + 2]));
    const [dx, dy, dz] = (q.get('off') ?? '1.2,0.3,1.6').split(',').map(Number);
    cam.position.set(at.x + dx, at.y + dy, at.z + dz);
    cam.fov = num('fov', 24);
    cam.updateProjectionMatrix();
    cam.lookAt(at);
  }
  renderer.render(scene, cam);
}
if ((q.has('face') || q.has('gest')) && !live) {
  // (his face so far into a moment (&at ms, of his own time: about its height by default), or into a gesture (&gest=protest,
  // his talk with it): his body's clock run on to it a tick at a time, which is the clock his face runs on, and drawn)
  const kind = (q.get('face') === '1' ? 'shout' : q.get('face')) as Feel | null;
  const gest = q.get('gest') as Gesture | null;
  for (const k of figs) {
    if (kind) k.f.feel(kind, 1);
    if (gest) k.f.pup.cue(gest, null, 1000);
  }
  for (let ms = 0; ms < num('at', 520); ms += 16)
    for (const k of figs) {
      const [x, z] = [k.f.group.position.x, k.f.group.position.z];
      k.f.pup.update(drive(k.t), 0, 16);
      k.f.place();
      k.f.group.position.x = x;
      k.f.group.position.z = z;
    }
  renderer.render(scene, cam);
}
// (a window that changes shape, or had none yet when this ran, is drawn again)
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
});
(window as unknown as { lab: unknown }).lab = { figs, renderer, scene, cam, J };
