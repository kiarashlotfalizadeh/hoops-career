/// <reference lib="dom" />
// A bench for the 3D figures (dev server only): one move, seen as a strip of moments or running live.
//   /scripts/qa/figure-lab/?move=jumper            eight moments of it, left to right
//   /scripts/qa/figure-lab/?move=run&live=1        one figure, moving
//   &yaw=40 (degrees round him)  &zoom=1.4  &from=0&to=1200 (ms)  &n=8  &h=78&w=215 (his build)
//   &seed=1 (the first man's own things: his look, sleeves, shoes; the next is seed+1)  &light=1 (the home kit)  &num=23&name=Brunson&mark=NYK
//   &style=4 &beard=3 &tone=6 (everyone's hair, beard or skin: see look.ts)  &styles=1 (each man the next style; &styles=9: from the ninth)  &tones=1 (each the next skin)
//   &eye=3,5.5,6&at=0,5,0&fov=28 (a camera of one's own, ft: for a close look at a shoulder, a shoe)
//   &arms=up|shoot|fwd|hip|out|across|back|down (both arms put there, whatever the move has them do; arms=all, or a list of them: each man the next)
//   faces: ?move=idle&n=6&gap=1.5&camY=6.4&lookY=6.25&zoom=3.6&yaw=12&from=100&to=100  (&beard=0..5: none, stubble, goatee, beard, full, strap)
//   &face=1 (his jaw open and his brows down, as in a roar)
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
  WebGLRenderer,
} from 'three';
import type { Act } from '../../../src/ui/live/choreo';
import { Fig, figureGeo, settleHeads } from '../../../src/ui/live/court3d/figure';
import { BEARDS, lookOf, SKINS, STYLES } from '../../../src/ui/live/court3d/look';
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

/** One figure a step on, then put where its lane is (it runs on the spot). */
function step(k: (typeof figs)[number], dt: number) {
  k.t += dt;
  const d = drive(k.t);
  k.f.pup.update(d, dt, dt);
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
    while (k.t < end) step(k, Math.min(16, end - k.t));
  });
  renderer.render(scene, cam);
}
if (q.has('face') && !live) {
  // (his face at the top of a shout: held there, then he is put again and drawn)
  for (const k of figs) {
    Object.assign(k.f as unknown as Record<string, number>, { jawOpen: 1, frown: 1, faceAt: performance.now() + 1e7 });
    const [x, z] = [k.f.group.position.x, k.f.group.position.z];
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
(window as unknown as { lab: unknown }).lab = { figs, renderer, scene, cam };
