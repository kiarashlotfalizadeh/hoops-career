/// <reference lib="dom" />
// A bench for the broadcast (dev server only): a real game, simulated here, put out through the real 3D
// scene as the live page puts it out (the court waits for an instant replay, as CourtView has it), on a
// clock of its own, and filmed: what the director shows, from the camera the user chose, with the
// graphics the page would write over it sketched on (the tags, the play's word, the lower third, the bug).
//   lab.find('dunk' | 'three' | 'ft' | 'block' | 'and1' | 'timeout' | 'break' | 'moment')   the possessions with one
//   lab.film({ k, n, from, every, cam, w, h, cols, most, speed, calm, replays, tip, final, only, scale })
//       possessions k..k+n-1 (and their replays), a cell every `every` frames from `from` ms of the clock into
//       possession k; `tip`: the line-up for this long (ms) first; `final`: the buzzer held this long (ms) after;
//       `only: 'replay'`: the replays' own frames alone; `scale`: each cell drawn at this much of its size;
//       `turn`: whose turn among the replay's cameras it is (director.ts CAMS: the same camera run after run)
//   lab.watch({ k, n, cam, speed, calm })   the same, not drawn: how long each camera had the picture (ms), the
//       cuts (and where each camera but the main one came on), the replays, and the most the main camera's aim
//       moved in a frame (degrees)
//   lab.reels({ w, h, cam, k, n, rows })   the replays' numbers, not drawn: a dunk framed and hidden by the basket's
//       unit, how wide and how fast the picture went, the room over what it must show, turns, focus (see reels)
//   lab.faces({ k, tip, w, h, cols, dist, fov, turn, low, pids })   each of the ten up close in the game's light (see faces)
//   ?seed=n&home=n&away=n&league=n picks the game.
import { Mesh, PerspectiveCamera, Raycaster, Vector3, type Object3D } from 'three';
import { createLeague, defaultSettings } from '../../../src/core/league/create';
import { teamPlayers } from '../../../src/core/league/helpers';
import { composites } from '../../../src/core/ratings';
import { Rng } from '../../../src/core/random';
import { GameSim } from '../../../src/core/sim/engine';
import { buildScript, standing, type Script, type Standing } from '../../../src/ui/live/choreo';
import { shotAt, type Shot } from '../../../src/ui/live/court3d/ballistics';
import { emptyStage, paintFloor, pose as poseAt, readPaints, type CourtFloor, type Stage } from '../../../src/ui/live/Court';
import type { CamKind } from '../../../src/ui/live/court3d/cameras';
import { settleHeads, type Fig } from '../../../src/ui/live/court3d/figure';
import { BEARDS, FACES, STYLES } from '../../../src/ui/live/court3d/look';
import { bodyOf, J } from '../../../src/ui/live/court3d/puppet';
import { CourtScene, loadModels, type Labels } from '../../../src/ui/live/court3d/scene';
import { matchKits } from '../../../src/ui/teamColors';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
/** The 3D court's pace (CourtView's COURT3D_PACE), and the 2D court's tail after a possession's last frame (ms). */
const PACE = 0.5;
const TAIL = 180;
const FRAME = 1000 / 60;

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
const scores: [number, number][] = [];
let stand: { at: Standing; q: number } | undefined;
let before: [number, number] = [0, 0];
while (!sim.over) {
  sim.step();
  for (const l of sim.drainLogs()) {
    const sc = buildScript(l, info, before, teams, nameOf, undefined, stand?.q === l.q ? stand.at : undefined);
    before = [...l.score] as [number, number];
    stand = { at: standing(sc), q: l.q };
    if (sc.frames.length) {
      scripts.push(sc);
      scores.push(before);
    }
  }
}
const winner: 0 | 1 = before[0] > before[1] ? 0 : 1;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const paints = readPaints(canvas);
const kits = matchKits(league.teams[H].colors, league.teams[AW].colors);
const scene = new CourtScene(canvas, paints.ball, paints.ballSeam, await loadModels());
const floorCv = document.createElement('canvas');
const t0 = league.teams[H];
const floor: CourtFloor = { kind: 'home', abbrev: t0.abbrev, name: t0.name, colors: t0.colors, paint: kits[0].color, trim: kits[0].trim, mark: 'circle' };
paintFloor(floorCv, { wide: true, k: 12, w: 0, h: 0, top: 0, ox: 0, oy: 0 }, 1, floor, paints);
scene.setFloor(floorCv);
const base = {
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
interface Reel {
  cam: string;
  kind: string;
  star: number;
  t: number;
  t0: number;
  at: number;
  rel: number;
  slow: number;
  swap: number;
  dunk: boolean;
  rim: { x: number; z: number };
  flight: Shot | null;
}
const inner = scene as unknown as {
  camera: PerspectiveCamera;
  shot: string;
  star: number | null;
  cutGap: number;
  figs: Map<number, Fig>;
  units: Object3D[];
  ball: Vector3;
  lens: { render: (...a: unknown[]) => void; focusAt: number };
  director: { phase: string; onAir: boolean; gap: number; replayed: unknown; n: number; reel: Reel | null };
};
/**
 * The director may show the next possession's replay, and the camera cut in on its scorer, whatever was shown before;
 * `turn`: whose turn it is among the replay's cameras (director.ts CAMS), so the same camera is had run after run.
 */
const fresh = (turn?: number) => {
  inner.director.gap = 1e9;
  inner.director.replayed = null;
  inner.cutGap = 1e9;
  if (turn !== undefined) inner.director.n = turn;
};
const w = (p: { x: number; y: number }, dir: 1 | -1) => (dir === 1 ? { ...p } : { x: -p.x, y: 94 - p.y });

interface Run {
  k: number;
  n: number;
  cam: CamKind;
  speed: number;
  calm: boolean;
  replays: boolean;
  tip: number;
  final: number;
}

/**
 * The game as the live page puts it out, a frame at a time: the tip's line-up, possession after possession
 * (each waits at its end for its replay), the buzzer. `each` is called after every frame with the graphics
 * and what the picture is (false from it stops the run).
 */
function run(o: Run, each: (labels: Labels, at: { k: number; t: number; shot: string; real: number }) => boolean | void) {
  const st: Stage = emptyStage();
  const game = (k: number, clock: number) => ({ abbrevs: teams, score: scores[Math.max(0, k - 1)] ?? ([0, 0] as [number, number]), clock, q: scripts[k]?.q ?? 4 });
  const shotNow = () => (inner.director.phase === 'on' || inner.director.phase === 'out' ? `replay:${inner.director.reel?.cam ?? ''}` : inner.shot);
  let real = 0;
  const frame = (k: number, t: number, dt: number, own: number, final?: 0 | 1) => {
    real += FRAME;
    const labels = scene.frame(st, { ...base, cam: o.cam, game: game(k, st.play?.clock ?? 0), final }, dt, FRAME, o.calm, own);
    return each(labels, { k, t, shot: shotNow(), real }) !== false;
  };
  if (o.tip > 0) {
    // (each five round the centre circle on its own side, as the page lines them up)
    const ring = [
      [0, 1.7],
      [-8.5, 3.5],
      [8.5, 3.5],
      [-5, 12],
      [5, 12],
    ];
    const sc = scripts[o.k];
    st.standers = [...sc.oPids, ...sc.dPids].map((pid, i) => ({
      pid,
      side: (i < 5 ? sc.off : 1 - sc.off) as 0 | 1,
      at: { x: ring[i % 5][0], y: 47 + (i < 5 ? 1 : -1) * ring[i % 5][1] },
    }));
    st.ball = { x: 0, y: 47 };
    for (let ms = 0; ms < o.tip; ms += FRAME) if (!frame(o.k, -1, 0, FRAME)) return;
  }
  for (let k = o.k; k < Math.min(scripts.length, o.k + o.n); k++) {
    const sc = scripts[k];
    const total = sc.frames.reduce((n, f) => n + f.dur, 0);
    const dt = FRAME * o.speed * PACE;
    let t = 0;
    for (;;) {
      t = Math.min(total + TAIL, t + dt);
      const play = poseAt(sc, t, o.calm);
      st.script = sc;
      st.play = play;
      st.standers = [
        ...sc.oPids.map((pid, j) => ({ pid, side: sc.off, at: w(play.o[j], sc.dir) })),
        ...sc.dPids.map((pid, j) => ({ pid, side: (1 - sc.off) as 0 | 1, at: w(play.d[j], sc.dir) })),
      ];
      st.ball = w(play.ball, sc.dir);
      if (!frame(k, t, dt, FRAME * o.speed)) return;
      if (t >= total + TAIL) break;
    }
    // the court has finished it: its replay, if one is due, and the court waits (never at 4x, nor with reduced motion)
    if (o.replays && o.speed < 4 && !o.calm && scene.replay(sc)) {
      for (let held = 0; !scene.released && held < 10000; held += FRAME) if (!frame(k, t, dt, FRAME * o.speed)) return;
    }
  }
  if (o.final > 0) {
    st.play = null;
    for (let ms = 0; ms < o.final; ms += FRAME) if (!frame(o.k + o.n - 1, -2, 0, FRAME, winner)) return;
  }
  scene.endReplay();
}

/** The possessions with one of these in them. */
function find(what: 'dunk' | 'three' | 'ft' | 'block' | 'and1' | 'timeout' | 'break' | 'moment' | 'foul') {
  const out: number[] = [];
  scripts.forEach((sc, k) => {
    const has = (test: (f: Script['frames'][number]) => boolean) => sc.frames.some(test);
    const hit =
      what === 'dunk'
        ? has((f) => f.act.includes('dunk'))
        : what === 'three'
          ? has((f) => f.flash?.text === '+3')
          : what === 'ft'
            ? has((f) => f.act.includes('ft'))
            : what === 'block'
              ? has((f) => f.swat !== undefined)
              : what === 'and1'
                ? has((f) => f.flash?.text === 'And one!')
                : what === 'timeout'
                  ? has((f) => !!f.flash?.text.startsWith('Timeout'))
                  : what === 'foul'
                    ? has((f) => f.flash?.kind === 'foul')
                    : what === 'break'
                      ? /Transition|Run-out/.test(sc.label)
                      : !!sc.moment;
    if (hit) out.push(k);
  });
  return out;
}

/** The graphics the page would write over a frame, sketched on a cell of the strip. */
function sketch(g: CanvasRenderingContext2D, l: Labels, x: number, y: number, cw: number, ch: number, note: string) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(0, 0, cw, ch);
  g.clip();
  g.textBaseline = 'middle';
  for (const t of l.tags) {
    g.font = '700 12px system-ui';
    const tw = g.measureText(t.text).width + 34;
    g.fillStyle = 'rgba(18,18,18,0.9)';
    g.fillRect(t.x - tw / 2, t.y - 25, tw, 20);
    g.fillStyle = t.color;
    g.fillRect(t.x - tw / 2, t.y - 25, 22, 20);
    g.fillStyle = t.late ? '#ffc65c' : '#fff';
    g.textAlign = 'center';
    g.fillText(t.num, t.x - tw / 2 + 11, t.y - 15);
    g.textAlign = 'left';
    g.fillText(t.text, t.x - tw / 2 + 28, t.y - 15);
    g.fillStyle = 'rgba(18,18,18,0.9)';
    g.beginPath();
    g.moveTo(t.x - 4, t.y - 5);
    g.lineTo(t.x + 4, t.y - 5);
    g.lineTo(t.x, t.y - 1);
    g.fill();
  }
  if (l.flash) {
    g.globalAlpha = l.flash.alpha;
    g.font = '900 18px system-ui';
    g.textAlign = 'center';
    const tw = g.measureText(l.flash.text).width + 22;
    g.fillStyle = '#121212';
    g.fillRect(l.flash.x - tw / 2, l.flash.y - 16, tw, 28);
    g.fillStyle = '#fff';
    g.fillText(l.flash.text, l.flash.x, l.flash.y - 2);
    g.globalAlpha = 1;
  }
  if (l.third) {
    g.font = '800 16px system-ui';
    g.textAlign = 'left';
    const tw = Math.max(g.measureText(l.third.name).width, 110) + 66;
    g.fillStyle = '#121212';
    g.fillRect(12, ch - 58, tw, 46);
    g.fillStyle = l.third.color;
    g.fillRect(12, ch - 58, 44, 46);
    g.fillStyle = '#fff';
    g.fillText(l.third.num, 22, ch - 35);
    g.fillText(l.third.name, 66, ch - 43);
    g.font = '500 11px ui-monospace, monospace';
    g.fillText(`${l.third.team} · ${l.third.word}`, 66, ch - 25);
  }
  if (l.replay) {
    g.font = '700 12px system-ui';
    g.textAlign = 'left';
    g.fillStyle = '#121212';
    g.fillRect(10, 22, 66, 24);
    g.fillStyle = '#fff';
    g.fillText('◀◀ Replay', 16, 34);
  }
  if (l.wipe) {
    g.fillStyle = l.wipe.color;
    const at = l.wipe.at;
    g.globalAlpha = 0.85;
    g.fillRect(-cw * 1.6 + cw * 2.6 * at, 0, cw * 1.6, ch);
    g.globalAlpha = 1;
  }
  // (the note readable however small the cell is drawn)
  const big = Math.max(11, Math.round(11 / Math.max(0.3, g.getTransform().a * 1.4)));
  g.font = `${big}px system-ui`;
  g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, 0, g.measureText(note).width + 8, big + 6);
  g.fillStyle = '#fff';
  g.fillText(note, 4, big / 2 + 3);
  g.restore();
}

/** A strip of what goes out (see the header). Into #strip. */
function film({
  k = 0,
  n = 1,
  from = 0,
  every = 30,
  cam = 'tv' as CamKind,
  w: cw = 800,
  h: ch = 474,
  cols = 3,
  most = 24,
  speed = 1,
  calm = false,
  replays = true,
  tip = 0,
  final = 0,
  lead = 2,
  only = '',
  scale = 1,
  turn = undefined as number | undefined,
} = {}) {
  // (the possessions before it, not drawn, so everyone gets there as he would)
  scene.size(cw, ch, 1);
  const start = Math.max(0, k - lead);
  if (start < k) run({ k: start, n: k - start, cam, speed: 2, calm, replays: false, tip: 0, final: 0 }, () => true);
  // (the director may show this one's replay, and the camera cut in on its scorer, whatever came before)
  fresh(turn);
  const copy = () => {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    c.getContext('2d')!.drawImage(canvas, 0, 0);
    return c;
  };
  const cells: { bmp: HTMLCanvasElement; labels: Labels; note: string }[] = [];
  const seen = new Set<string>();
  let i = 0;
  // (`only: 'replay'`: the replays' own frames, not their wipes; noted with how far from its moment (ms) and how wide)
  run({ k, n, cam, speed, calm, replays, tip, final }, (labels, at) => {
    if (at.k === k && at.t >= 0 && at.t < from) return true;
    const r = inner.director.reel;
    const on = inner.director.onAir && r && r.swap < 0;
    if (only === 'replay' && (!on || labels.wipe)) return true;
    if (on) seen.add(`${r.kind} ${r.cam}${r.slow < 0.25 ? '2' : ''}`);
    const note = on
      ? `${cells.length} k${at.k} ${r.kind} ${r.cam}${r.slow < 0.25 ? '2' : ''} ${Math.round(r.t - (r.dunk ? r.rel + 90 : r.at))}ms ${inner.camera.fov.toFixed(1)}°`
      : `${cells.length} k${at.k} ${Math.round(at.t)} ${at.shot}`;
    if (i++ % every === 0) cells.push({ bmp: copy(), labels: JSON.parse(JSON.stringify(labels)) as Labels, note });
    return cells.length < most;
  });
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  strip.width = Math.round(Math.min(cols, cells.length) * cw * scale);
  strip.height = Math.round(Math.ceil(cells.length / cols) * ch * scale);
  const g = strip.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  for (let c = 0; c < cells.length; c++) {
    const x = (c % cols) * cw;
    const y = Math.floor(c / cols) * ch;
    g.drawImage(cells[c].bmp, x, y);
    sketch(g, cells[c].labels, x, y, cw, ch, cells[c].note);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return { cells: cells.length, w: strip.width, h: strip.height, reels: [...seen] };
}

/** The basket unit's parts that hide what is behind them (not the glass, the paint on it, the rim or the net). */
const SUPPORT = new Set(['pad', 'steel', 'team', 'clock', 'led']);
/** What the lower third and the Replay bug cover (CSS px across and up, as court3d.css draws them). */
const COVER = { third: [262, 62], bug: [100, 36] };

/**
 * The replays' numbers, not drawn (nothing is rendered): each possession with a big play is run on its own, the
 * director let show its replay and the camera let cut in on its scorer. Per replay (each look of it): for a dunk the
 * share of frames from his take-off to the end of the hang with his whole head, both hands, the ball and the rim in
 * the safe frame (inside the picture, off the lower third and the bug) and the share with the basket's unit between
 * the lens and his head, a hand or the ball; for all, how wide the picture went and how fast it widened (deg/s),
 * how much of the picture is over the highest thing it must show (`room`) and the share of frames that has it all
 * in the lower half (`sunk`), the most the look turned in a frame (deg) and the focus moved (ft), a body between the
 * lens and the man, and where the slowest moment fell (ms after the slam, or the moment). And the live cut-ins on
 * a dunk's scorer: his head and hands in the picture, the unit in front of them. `trace`: each replay frame's
 * [k, look, ms from the moment, fov, focus (ft), turn (deg), the highest must-see point's height in the picture].
 */
function reels({ w: cw = 1440, h: ch = 900, cam = 'tv' as CamKind, k = 0, n = 1e9, rows = false, trace = false, turn = undefined as number | undefined } = {}) {
  scene.size(cw, ch, 1);
  const tr: number[][] = [];
  const render = inner.lens.render;
  inner.lens.render = () => {};
  const ks = [...new Set((['dunk', 'three', 'block', 'and1', 'moment'] as const).flatMap((kd) => find(kd)))].filter((x) => x >= k && x < k + n).sort((a, b) => a - b);
  const dunks = new Set(find('dunk'));
  const ray = new Raycaster();
  const [P, D, F, F0] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const parts = inner.units.map((u) => {
    u.updateMatrixWorld(true);
    const out: Object3D[] = [];
    u.traverse((o) => {
      if (o instanceof Mesh && SUPPORT.has(o.name)) out.push(o);
    });
    return out;
  });
  const c = inner.camera;
  const proj = (x: number, y: number, z: number) => P.set(x, y, z).project(c);
  const safe = (v: Vector3) =>
    v.z < 1 &&
    Math.abs(v.x) < 0.97 &&
    Math.abs(v.y) < 0.96 &&
    !(v.x < -1 + (2 * COVER.third[0]) / cw && v.y < -1 + (2 * COVER.third[1]) / ch) &&
    !(v.x < -1 + (2 * COVER.bug[0]) / cw && v.y > 1 - (2 * COVER.bug[1]) / ch);
  // (the unit at that end between the lens and the point)
  const hidden = (end: number, x: number, y: number, z: number) => {
    D.set(x, y, z).sub(c.position);
    const far = D.length();
    ray.set(c.position, D.normalize());
    ray.far = far - 0.25;
    const hit = ray.intersectObjects(parts[end], false);
    if (trace && hit.length && hits.length < 40)
      hits.push([
        hit[0].object.name,
        +x.toFixed(1),
        +y.toFixed(1),
        +z.toFixed(1),
        +c.position.x.toFixed(1),
        +c.position.y.toFixed(1),
        +c.position.z.toFixed(1),
        +hit[0].point.x.toFixed(1),
        +hit[0].point.y.toFixed(1),
        +hit[0].point.z.toFixed(1),
      ]);
    return hit.length > 0;
  };
  const hits: (string | number)[][] = [];
  interface Row {
    k: number;
    kind: string;
    cam: string;
    look: number;
    frames: number;
    dunkF: number;
    inF: number;
    occF: number;
    miss: Record<string, number>;
    fov0: number;
    fov1: number;
    rate: number;
    room: number;
    sunk: number;
    low: number;
    head: number;
    turn: number;
    focus: number;
    body: number;
    steps: number[];
    last: { fov: number; t: number; focus: number } | null;
  }
  const out: Row[] = [];
  const live = { frames: 0, inF: 0, occF: 0, miss: {} as Record<string, number> };
  let row: Row | null = null;
  let key = '';
  const J3 = (f: Fig, j: number) => f.pup.world(f.pup.j[j * 3], f.pup.j[j * 3 + 1], f.pup.j[j * 3 + 2], { x: 0, y: 0, z: 0 });
  for (const kk of ks) {
    fresh(turn);
    run({ k: kk, n: 1, cam, speed: 1, calm: false, replays: true, tip: 0, final: 0 }, () => {
      const d = inner.director;
      const r = d.reel;
      c.updateMatrixWorld();
      if (!d.onAir || !r) {
        // a live cut-in on a dunk's scorer: his head, and his hands when they are up (over his chest: a close-up is his waist up)
        const f = inner.shot === 'close' && dunks.has(kk) && inner.star !== null ? inner.figs.get(inner.star) : undefined;
        if (f) {
          const end = f.pup.x < 0 ? 0 : 1;
          const head = J3(f, J.head);
          const up = J3(f, J.chest).y + 0.5;
          const pts = [
            ...[J3(f, J.hl), J3(f, J.hr)].filter((p) => p.y > up).map((p) => ({ what: 'hand', p })),
            { what: 'head', p: head },
            { what: 'head', p: { ...head, y: head.y + 0.45 * f.pup.body.s } },
          ];
          live.frames++;
          let all = true;
          for (const { what, p } of pts)
            if (!safe(proj(p.x, p.y, p.z))) {
              all = false;
              live.miss[what] = (live.miss[what] ?? 0) + 1;
            }
          if (all) live.inF++;
          if (pts.some(({ p }, i) => i < pts.length - 1 && hidden(end, p.x, p.y, p.z))) live.occF++;
        }
        return true;
      }
      if (r.swap >= 0) return true;
      const look = r.slow < 0.25 ? 2 : 1;
      const id = `${kk}/${look}/${r.t0}`;
      if (id !== key) {
        key = id;
        row = {
          k: kk,
          kind: r.kind,
          cam: r.cam,
          look,
          frames: 0,
          dunkF: 0,
          inF: 0,
          occF: 0,
          miss: {},
          fov0: 1e9,
          fov1: 0,
          rate: 0,
          room: 0,
          sunk: 0,
          low: 0,
          head: 0,
          turn: 0,
          focus: 0,
          body: 0,
          steps: [],
          last: null,
        };
        out.push(row);
      }
      const R = row!;
      const f = inner.figs.get(r.star);
      if (!f) return true;
      const slam = r.dunk ? r.rel + 90 : r.at;
      const end = r.rim.x < 0 ? 0 : 1;
      const b = inner.ball;
      const head = J3(f, J.head);
      const top = { ...head, y: head.y + 0.45 * f.pup.body.s };
      const hands = [J3(f, J.hl), J3(f, J.hr)];
      const chest = J3(f, J.chest);
      R.frames++;
      // (what it must show: his head, the ball while it is in play, the rim; a dunk's hands)
      const must: { what: string; p: { x: number; y: number; z: number } }[] = [
        { what: 'head', p: top },
        { what: 'rim', p: { x: r.rim.x, y: 10, z: r.rim.z } },
      ];
      if (r.kind !== 'block' && (r.t < slam || b.y > 6)) must.push({ what: 'ball', p: { x: b.x, y: b.y, z: b.z } });
      // (and while a shot is in the air, the top of its flight)
      if (r.flight && r.t >= r.rel && r.t < r.at) must.push({ what: 'arc', p: shotAt(r.flight, 0.5, { x: 0, y: 0, z: 0 }) });
      if (r.dunk) must.push({ what: 'hand', p: hands[0] }, { what: 'hand', p: hands[1] }, { what: 'head', p: head });
      let hi = -Infinity;
      for (const m of must) hi = Math.max(hi, proj(m.p.x, m.p.y, m.p.z).y);
      R.room += (1 - Math.min(1, hi)) / 2;
      if (hi < 0) R.sunk++;
      // (and where his head is: under the middle, he has sunk under the air over him)
      const ht = proj(top.x, top.y, top.z).y;
      R.head += ht;
      if (ht < 0) R.low++;
      if (r.dunk && r.t >= slam - 250 && r.t <= slam + 200) {
        R.dunkF++;
        let all = true;
        for (const m of must)
          if (!safe(proj(m.p.x, m.p.y, m.p.z))) {
            all = false;
            R.miss[m.what] = (R.miss[m.what] ?? 0) + 1;
          }
        if (all) R.inF++;
        if ([head, ...hands, b].some((p) => hidden(end, p.x, p.y, p.z))) R.occF++;
      }
      // (another body in the foreground: nearer the lens than half way to him, across the line to his chest)
      for (const o of inner.figs.values()) {
        if (o === f) continue;
        const [ax, az] = [c.position.x, c.position.z];
        const [bx, bz] = [chest.x - ax, chest.z - az];
        const l2 = bx * bx + bz * bz || 1;
        const u = ((o.pup.x - ax) * bx + (o.pup.z - az) * bz) / l2;
        if (u < 0.02 || u > 0.6) continue;
        const off = Math.hypot(o.pup.x - ax - bx * u, o.pup.z - az - bz * u);
        const yAt = c.position.y + (head.y - c.position.y) * u;
        if (off < 0.9 && yAt < 7 * o.pup.body.s) {
          R.body++;
          break;
        }
      }
      // (how wide, how fast it widened, how far the look turned and the focus moved since the last frame)
      F.set(-c.matrixWorld.elements[8], -c.matrixWorld.elements[9], -c.matrixWorld.elements[10]);
      R.fov0 = Math.min(R.fov0, c.fov);
      R.fov1 = Math.max(R.fov1, c.fov);
      if (R.last) {
        R.rate = Math.max(R.rate, ((c.fov - R.last.fov) * 1000) / FRAME);
        R.turn = Math.max(R.turn, (F.angleTo(F0) * 180) / Math.PI);
        R.focus = Math.max(R.focus, Math.abs(inner.lens.focusAt - R.last.focus));
        const step = r.t - R.last.t;
        if (step > 0) R.steps.push(r.t - slam, step);
      }
      if (trace)
        tr.push([
          R.k,
          R.look,
          Math.round(r.t - slam),
          +c.fov.toFixed(2),
          +inner.lens.focusAt.toFixed(2),
          R.last ? +((F.angleTo(F0) * 180) / Math.PI).toFixed(2) : 0,
          +hi.toFixed(2),
          +c.position.distanceTo(P.set(chest.x, chest.y, chest.z)).toFixed(1),
        ]);
      F0.copy(F);
      R.last = { fov: c.fov, t: r.t, focus: inner.lens.focusAt };
      return true;
    });
  }
  inner.lens.render = render;
  const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const sum = (xs: Row[], f: (o: Row) => number) => xs.reduce((a, o) => a + f(o), 0);
  const dk = out.filter((o) => o.dunkF > 0);
  const miss: Record<string, number> = {};
  for (const o of dk) for (const [what, m] of Object.entries(o.miss)) miss[what] = (miss[what] ?? 0) + m;
  const spread = out.map((o) => o.fov1 - o.fov0);
  const stat = (xs: number[]) => ({ med: r1(med(xs)), max: r1(Math.max(0, ...xs)) });
  // (the middle of the slowest stretch: the frames within 3% of its slowest step; not the last, cut short at the end)
  const slowAt = (o: Row) => {
    let low = Infinity;
    const end = o.steps.length - 2;
    for (let i = 1; i < end; i += 2) low = Math.min(low, o.steps[i]);
    let [t, m] = [0, 0];
    for (let i = 1; i < end; i += 2) if (o.steps[i] <= low * 1.03) [t, m] = [t + o.steps[i - 1], m + 1];
    return Math.round(t / (m || 1));
  };
  return {
    looks: out.length,
    dunk: {
      looks: dk.length,
      framed: pct(
        sum(dk, (o) => o.inF),
        sum(dk, (o) => o.dunkF),
      ),
      hidden: pct(
        sum(dk, (o) => o.occF),
        sum(dk, (o) => o.dunkF),
      ),
      miss,
      slowAfterSlam: dk.map(slowAt),
    },
    live: { frames: live.frames, framed: pct(live.inF, live.frames), hidden: pct(live.occF, live.frames) },
    fovSpread: stat(spread),
    widenRate: stat(out.map((o) => o.rate)),
    room: r1(
      (100 * sum(out, (o) => o.room)) /
        Math.max(
          1,
          sum(out, (o) => o.frames),
        ),
    ),
    sunk: pct(
      sum(out, (o) => o.sunk),
      sum(out, (o) => o.frames),
    ),
    low: pct(
      sum(out, (o) => o.low),
      sum(out, (o) => o.frames),
    ),
    head:
      r1(
        (100 * sum(out, (o) => o.head)) /
          Math.max(
            1,
            sum(out, (o) => o.frames),
          ),
      ) / 100,
    turn: stat(out.map((o) => o.turn)),
    focus: stat(out.map((o) => o.focus)),
    body: pct(
      sum(out, (o) => o.body),
      sum(out, (o) => o.frames),
    ),
    // (each look's own counts, to add up over several games)
    rows: rows ? out.map(({ steps, last, ...o }) => ({ ...o, slow: slowAt({ steps, last, ...o }) })) : undefined,
    liveCounts: live,
    trace: trace ? tr : undefined,
    // (with `trace`: the first of what the basket's unit hid: the part, the point, the camera, where the ray met it)
    hits: trace ? hits : undefined,
  };
}

/** The same run, not filmed: who had the picture and for how long, the cuts, and how hard the camera was moved. */
function watch({ k = 0, n = 20, cam = 'tv' as CamKind, speed = 1, calm = false, replays = true, tip = 0, final = 0, w: cw = 800, h: ch = 474 } = {}) {
  scene.size(cw, ch, 1);
  const on: Record<string, number> = {};
  let cuts = 0;
  let reels = 0;
  const log: string[] = [];
  let was = '';
  let worst = 0;
  let real = 0;
  const dir = { x: 0, y: 0, z: 0 };
  const e = inner.camera.matrixWorld.elements;
  run({ k, n, cam, speed, calm, replays, tip, final }, (_l, at) => {
    on[at.shot] = (on[at.shot] ?? 0) + FRAME;
    real = at.real;
    if (at.shot !== was) {
      cuts++;
      if (at.shot !== 'main' && log.length < 80) log.push(`k${at.k}@${Math.round(at.t)} ${at.shot}`);
      if (at.shot.startsWith('replay') && !was.startsWith('replay')) reels++;
    } else if (at.shot === 'main') {
      // (how far the main camera's aim turned this frame)
      const dot = -(e[8] * dir.x + e[9] * dir.y + e[10] * dir.z);
      worst = Math.max(worst, (Math.acos(Math.min(1, dot)) * 180) / Math.PI);
    }
    [dir.x, dir.y, dir.z] = [-e[8], -e[9], -e[10]];
    was = at.shot;
    return true;
  });
  for (const key of Object.keys(on)) on[key] = Math.round(on[key]);
  return { real: Math.round(real), cuts, reels, worstTurnDeg: Math.round(worst * 100) / 100, on, log };
}

/**
 * The cast up close, in the game's own light: the ten lined up for the tip (`tip` ms of it, so each is where the
 * page would have him), then each man's head and shoulders as a close-up has him, from in front of him and a
 * little to one side (`turn`, degrees), `dist` ft off, `fov` degrees. Into #strip, a cell a man. (The other nine
 * are left out of his picture: one standing between him and the camera would hide him.)
 */
function faces({
  k = 0,
  tip = 1500,
  w: cw = 420,
  h: ch = 480,
  cols = 5,
  dist = 4.2,
  fov = 20,
  turn = 18,
  low = 0.15,
  pids,
}: { k?: number; tip?: number; w?: number; h?: number; cols?: number; dist?: number; fov?: number; turn?: number; low?: number; pids?: number[] } = {}) {
  scene.size(cw, ch, 1);
  run({ k, n: 0, cam: 'tv', speed: 1, calm: true, replays: false, tip, final: 0 }, () => true);
  settleHeads();
  run({ k, n: 0, cam: 'tv', speed: 1, calm: true, replays: false, tip: 50, final: 0 }, () => true);
  const figs = (scene as unknown as { figs: Map<number, Fig> }).figs;
  const cam = new PerspectiveCamera(fov, cw / ch, 0.3, 400);
  const who = pids ?? [...figs.keys()];
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  strip.width = Math.min(cols, who.length) * cw;
  strip.height = Math.ceil(who.length / cols) * ch;
  const g = strip.getContext('2d')!;
  const out: string[] = [];
  who.forEach((pid, i) => {
    const f = figs.get(pid);
    if (!f) return;
    const p = f.pup;
    const j = p.j;
    const head = p.world(j[J.head * 3], j[J.head * 3 + 1], j[J.head * 3 + 2], { x: 0, y: 0, z: 0 });
    const t = (turn * Math.PI) / 180;
    const fx = p.front.x * Math.cos(t) + p.left.x * Math.sin(t);
    const fz = p.front.z * Math.cos(t) + p.left.z * Math.sin(t);
    const ahead = p.world(j[J.head * 3] + fx * dist, j[J.head * 3 + 1] + 0.25, j[J.head * 3 + 2] + fz * dist, { x: 0, y: 0, z: 0 });
    cam.position.set(ahead.x, ahead.y, ahead.z);
    cam.lookAt(head.x, head.y - low, head.z);
    cam.updateMatrixWorld();
    for (const [k, o] of figs) o.group.visible = k === pid;
    scene.still(cam);
    for (const o of figs.values()) o.group.visible = true;
    g.drawImage(canvas, (i % cols) * cw, Math.floor(i / cols) * ch);
    const l = f.look;
    g.font = '11px system-ui';
    g.fillStyle = '#fff';
    g.fillText(`${pid} ${nameOf(pid)} · tone ${l.tone} · ${STYLES[l.style].name} · ${BEARDS[l.beard]}`, (i % cols) * cw + 4, Math.floor(i / cols) * ch + 12);
    out.push(`${pid}: tone ${l.tone}, ${STYLES[l.style].name}, ${BEARDS[l.beard]}, ${FACES[l.face.kind].name}${l.recede ? ', receding' : ''}${l.hair !== l.brows ? ', dyed' : ''}`);
  });
  return out;
}

(window as unknown as { lab: unknown }).lab = { scripts, find, film, watch, reels, faces, scene, winner, teams };
document.title = 'Cast lab ready';
