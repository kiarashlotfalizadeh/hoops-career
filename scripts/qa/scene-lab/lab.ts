/// <reference lib="dom" />
// A bench for the whole 3D court (dev server only): the real scene (arena, benches, crowd, baskets,
// ten figures standing), held still and seen from wherever you ask.
//   /scripts/qa/scene-lab/?eye=0,33,60&at=0,0,-4&fov=30      a camera in the scene's feet (x along the floor, y up, z toward the near side)
//   &shot=bench|coach|crowd|stands|basket|rim|table|board|players|player|ball|ft     a ready-made camera on one thing
//   lab.bench() in the console: what a frame costs (ms, triangles, draw calls)
//   &cheer=1 (the crowd on its feet)  &away=1 (the visitors' paint)  &t=3 (seconds the crowd has swayed)
//   &lite=n (a slow device's step: 1 the picture unfinished, 2 no shadows either, 3 no mirror nor fine wood either; &lite alone is 3)
//   &game=1 (a game on the boards: Q4, 2:31 left, 88-85)  &call=three|dunk|andOne|block|steal|buzzer|timeout (a big moment, the home side's;
//   &by=1 the visitors')  &def=1 (the home side on defence)  &ft=1 (a visitor at the line, the end behind it waving)  &clutch=1  &final=0|1 (who won)
//   &final=0|1 (the game over, that side the winners: with no eye or shot, the broadcast's own camera finds them)
//   &mood=1 (the house lights down, as for the open, a timeout and the clutch: with a shot or an eye)
//   &tip=1 (the ten lined up for the tip, the ball in the centre circle: with no eye or shot, the broadcast's opening camera)
import { PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { emptyStage, paintFloor, readPaints, type CourtFloor, type Stage } from '../../../src/ui/live/Court';
import { settleHeads } from '../../../src/ui/live/court3d/figure';
import { bodyOf } from '../../../src/ui/live/court3d/puppet';
import { CourtScene, loadModels } from '../../../src/ui/live/court3d/scene';
import { matchKits } from '../../../src/ui/teamColors';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const vec = (k: string, d: number[]) => (q.has(k) ? q.get(k)!.split(',').map(Number) : d);

/** Ready-made cameras: where it stands, what it looks at, how wide it sees (degrees, up and down). */
const SHOTS: Record<string, [number[], number[], number]> = {
  main: [[0, 33, 60], [0, 0, -4], 30],
  bench: [[-30, 7, -6], [-30, 3.2, -29.5], 22],
  coach: [[-14, 6, -16], [-18.9, 4.2, -27], 16],
  crowd: [[0, 14, -8], [0, 12, -52], 24],
  stands: [[-40, 30, 40], [10, 12, -60], 40],
  basket: [[-28, 9, 14], [-42.5, 10, 0], 24],
  rim: [[-38, 11.5, 5], [-42.6, 9.7, 0], 16],
  table: [[6, 7, -10], [0, 2.2, -29], 30],
  board: [[0, 30, 30], [0, 62, 0], 40],
  players: [[14, 5.5, 20], [30, 3.6, 2], 24],
  player: [[22, 5.2, 8], [26, 3.9, 1], 22],
  ball: [[17, 2.2, 4.5], [19, 0.6, 3], 14],
  ft: [[59, 10, 28], [28, 5.5, -2], 22],
};

const canvas = document.getElementById('c') as HTMLCanvasElement;
const paints = readPaints(canvas);
const kits = matchKits(q.has('away') ? ['#0c2340', '#c8102e', '#ffffff'] : ['#002b5c', '#e31837', '#c4ced4'], ['#00471b', '#eee1c6', '#0077c0']);
const scene = new CourtScene(canvas, paints.ball, paints.ballSeam, await loadModels());
scene.lite(q.has('lite') ? (Math.min(3, Number(q.get('lite')) || 3) as 1 | 2 | 3) : 0);
const floorCv = document.createElement('canvas');
const floor: CourtFloor = { kind: 'home', abbrev: 'WAS', name: 'Wizards', colors: ['#002b5c', '#e31837', '#c4ced4'], paint: kits[0].color, trim: kits[0].trim, mark: 'circle' };
paintFloor(floorCv, { wide: true, k: 14, w: 0, h: 0, top: 0, ox: 0, oy: 0 }, 1, floor, paints, true);
scene.setFloor(floorCv);

// ten men where a half-court set leaves them, and the ball with one of them
const spots: [number, number][] = [
  [0, 68],
  [-17, 73],
  [17, 73],
  [-7, 85],
  [8, 82],
  [1, 72],
  [-13, 77],
  [13, 77],
  [-4, 88],
  [6, 85],
];
const stage: Stage = { ...emptyStage(), standers: spots.map(([x, y], i) => ({ pid: i + 1, side: (i < 5 ? 0 : 1) as 0 | 1, at: { x, y } })), ball: { x: 3, y: 66 } };
// (the tip: each five round the centre circle on its own side, a jumper in it)
if (q.has('tip')) {
  const ring = [
    [0, 1.7],
    [-8.5, 3.5],
    [8.5, 3.5],
    [-5, 12],
    [5, 12],
  ];
  stage.standers = stage.standers.map((st, i) => ({ ...st, at: { x: ring[i % 5][0], y: 47 + (i < 5 ? 1 : -1) * ring[i % 5][1] } }));
  stage.ball = { x: 0, y: 47 };
}
const builds: [number, number][] = [
  [75, 190],
  [78, 215],
  [80, 225],
  [82, 240],
  [84, 265],
];
const props = {
  kits,
  jersey: (pid: number) => String([3, 11, 23, 34, 5, 0, 12, 22, 7, 15][pid - 1] ?? pid),
  body: (pid: number) => bodyOf(...builds[(pid - 1) % 5]),
  names: (pid: number) => ['Young', 'Porter Jr.', 'Antetokounmpo', 'Lee', 'Sarr', 'George', 'Coulibaly', 'Trent Jr.', 'Kuzma', 'Turner'][pid - 1] ?? '',
  board: kits[0].color,
  warn: paints.warn,
  // (the game as the court has played it: the letters on the kits, the boards)
  game: { abbrevs: ['WAS', 'MIL'] as [string, string], score: [54, 51] as [number, number], clock: 312, q: 3 },
  ...(q.has('final') && { final: (Number(q.get('final')) ? 1 : 0) as 0 | 1 }),
};

// (the boards' game, made up: the lab has no court to play one)
if (q.has('game')) {
  Object.assign(props, { game: { abbrevs: ['WAS', 'MIL'], score: [88, 85], clock: 151.4, q: 4 }, clutch: q.has('clutch') });
  if (q.has('final')) Object.assign(props, { final: Number(q.get('final')), game: { abbrevs: ['WAS', 'MIL'], score: [104, 99], clock: 0, q: 4 } });
  // (the app's face, which the lab's page doesn't load itself)
  const face = new FontFace('Archivo Variable', 'url(/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2)', {
    weight: '100 900',
    stretch: '62% 125%',
  });
  (document.fonts as unknown as { add(f: FontFace): void }).add(await face.load().catch(() => face));
}
type Lab = {
  cheer(n: number): void;
  update(ms: number, calm: boolean): void;
  shed(level: number): void;
  boards: { shout(call: string, side: 0 | 1 | null): void; house: { pretend: unknown } };
};
const inner = scene as unknown as { renderer: WebGLRenderer; scene: Scene; arena: Lab; rig: { mood(to: number, ms: number): void; drama: number } };
if (q.has('def') || q.has('ft')) inner.arena.boards.house.pretend = { off: 1, line: q.has('ft'), end: -1, shot: q.has('ft') ? null : 11.2 };
const [eye0, at0, fov0] = SHOTS[q.get('shot') ?? 'main'] ?? SHOTS.main;
const eye = vec('eye', eye0);
const at = vec('at', at0);
const cam = new PerspectiveCamera(num('fov', fov0), 1, 0.5, 900);

function draw() {
  const w = innerWidth;
  const h = innerHeight;
  if (!w || !h) return;
  scene.size(w, h, Math.min(2, devicePixelRatio));
  // (a few frames so the figures settle where they stand and the crowd is where `t` and `cheer` put it)
  for (let i = 0; i < 30; i++) {
    // (a still wants the men's finished heads, which a game paints between frames)
    if (i === 27) settleHeads();
    if (q.has('cheer')) inner.arena.cheer(1);
    if (q.has('call') && i === 18) inner.arena.boards.shout(q.get('call')!, q.has('by') ? 1 : 0);
    scene.frame(stage, props, 16, (num('t', 2) * 1000) / 30, false, 16);
  }
  cam.aspect = w / h;
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.lookAt(at[0], at[1], at[2]);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  if (q.has('mood')) {
    inner.rig.mood(num('mood', 1), 1e9);
    scene.lens.drama = inner.rig.drama;
  }
  if (q.has('shot') || q.has('eye')) scene.still(cam);
  // (kept for a screenshot: the renderer clears its picture once the page has shown it)
  const still = document.getElementById('still') as HTMLCanvasElement;
  still.width = canvas.width;
  still.height = canvas.height;
  still.getContext('2d')!.drawImage(canvas, 0, 0);
}
/** What a frame costs: its time (ms, the drawing finished), and the triangles and draw calls of every pass in it. */
function bench(n = 60) {
  const info = inner.renderer.info;
  const gl = inner.renderer.getContext();
  info.autoReset = false;
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    info.reset();
    scene.frame(stage, props, 16, 16, false, 16);
  }
  gl.finish();
  const ms = (performance.now() - t0) / n;
  const { triangles, calls } = info.render;
  info.autoReset = true;
  return { ms: Math.round(ms * 100) / 100, triangles, calls, pixels: [canvas.width, canvas.height] };
}
draw();
addEventListener('resize', draw);
(window as unknown as { lab: unknown }).lab = { scene, cam, draw, bench };
