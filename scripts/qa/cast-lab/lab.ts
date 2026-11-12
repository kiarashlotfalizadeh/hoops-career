/// <reference lib="dom" />
// A bench for the broadcast (dev server only): a real game, simulated here, put out through the real 3D
// scene as the live page puts it out (the court waits for an instant replay, as CourtView has it), on a
// clock of its own, and filmed: what the director shows, from the camera the user chose, with the
// graphics the page would write over it sketched on (the tags, the play's word, the lower third, the bug).
//   lab.find('dunk' | 'three' | 'ft' | 'block' | 'and1' | 'timeout' | 'break' | 'moment')   the possessions with one
//   lab.film({ k, n, from, every, cam, w, h, cols, most, speed, calm, replays, tip, final })
//       possessions k..k+n-1 (and their replays), a cell every `every` frames from `from` ms of the clock into
//       possession k; `tip`: the line-up for this long (ms) first; `final`: the buzzer held this long (ms) after
//   lab.watch({ k, n, cam, speed, calm })   the same, not drawn: how long each camera had the picture (ms), the
//       cuts (and where each camera but the main one came on), the replays, and the most the main camera's aim
//       moved in a frame (degrees)
//   ?seed=n&home=n&away=n&league=n picks the game.
import type { PerspectiveCamera } from 'three';
import { createLeague, defaultSettings } from '../../../src/core/league/create';
import { teamPlayers } from '../../../src/core/league/helpers';
import { composites } from '../../../src/core/ratings';
import { Rng } from '../../../src/core/random';
import { GameSim } from '../../../src/core/sim/engine';
import { buildScript, standing, type Script, type Standing } from '../../../src/ui/live/choreo';
import { emptyStage, paintFloor, pose as poseAt, readPaints, type CourtFloor, type Stage } from '../../../src/ui/live/Court';
import type { CamKind } from '../../../src/ui/live/court3d/cameras';
import { bodyOf } from '../../../src/ui/live/court3d/puppet';
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
const inner = scene as unknown as { camera: PerspectiveCamera; shot: string; director: { phase: string; reel: { cam: string; kind: string } | null } };
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
  g.font = '11px system-ui';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.fillText(note, 4, 9);
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
} = {}) {
  // (the possessions before it, not drawn, so everyone gets there as he would)
  scene.size(cw, ch, 1);
  const start = Math.max(0, k - lead);
  if (start < k) run({ k: start, n: k - start, cam, speed: 2, calm, replays: false, tip: 0, final: 0 }, () => true);
  const copy = () => {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    c.getContext('2d')!.drawImage(canvas, 0, 0);
    return c;
  };
  const cells: { bmp: HTMLCanvasElement; labels: Labels; note: string }[] = [];
  let i = 0;
  run({ k, n, cam, speed, calm, replays, tip, final }, (labels, at) => {
    if (at.k === k && at.t >= 0 && at.t < from) return true;
    if (i++ % every === 0) cells.push({ bmp: copy(), labels: JSON.parse(JSON.stringify(labels)) as Labels, note: `${cells.length} k${at.k} ${Math.round(at.t)} ${at.shot}` });
    return cells.length < most;
  });
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  strip.width = Math.min(cols, cells.length) * cw;
  strip.height = Math.ceil(cells.length / cols) * ch;
  const g = strip.getContext('2d')!;
  for (let c = 0; c < cells.length; c++) {
    const x = (c % cols) * cw;
    const y = Math.floor(c / cols) * ch;
    g.drawImage(cells[c].bmp, x, y);
    sketch(g, cells[c].labels, x, y, cw, ch, cells[c].note);
  }
  return { cells: cells.length, w: strip.width, h: strip.height };
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

(window as unknown as { lab: unknown }).lab = { scripts, find, film, watch, scene, winner, teams };
document.title = 'Cast lab ready';
