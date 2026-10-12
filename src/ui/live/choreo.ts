// Turns an engine possession log into keyframes for the 2D court. Coordinates are in feet
// on a half court: x -25..25 (sideline to sideline), y 0..47 (baseline to half-court line),
// basket at (0, 5.25). The offense always attacks the basket at the top of the screen.

import type { PossLog, PossStep } from '../../core/sim/log';

export interface Pt {
  x: number;
  y: number;
}

export interface Flash {
  text: string;
  kind: 'make' | 'miss' | 'block' | 'to' | 'foul' | 'info';
  x: number;
  y: number;
}

export interface Frame {
  dur: number; // ms to reach this frame from the previous one
  o: Pt[];
  d: Pt[];
  ball: Pt;
  ballZ?: number; // 0..1 arc height (shots)
  flash?: Flash;
  score?: [number, number];
}

export interface Script {
  off: 0 | 1;
  oPids: number[];
  dPids: number[];
  frames: Frame[];
  label: string;
  clockStart: number;
  clockEnd: number;
  q: number;
}

const BASKET: Pt = { x: 0, y: 5.25 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface PInfo {
  pid: number;
  hgt: number;
  shoot: number;
  handle: number;
}

function baseSpots(players: PInfo[], handler: number): Map<number, Pt> {
  const spots = new Map<number, Pt>();
  const rest = players.filter((p) => p.pid !== handler);
  const big = [...rest].sort((a, b) => b.hgt - a.hgt)[0];
  spots.set(handler, { x: 0, y: 29 });
  const wings = rest.filter((p) => p !== big).sort((a, b) => b.shoot - a.shoot);
  const slots: Pt[] = [
    { x: 21.5, y: 4 },
    { x: -16.5, y: 22 },
    { x: 16.5, y: 22 },
    { x: -21.5, y: 4 },
  ];
  wings.forEach((p, i) => spots.set(p.pid, slots[i] ?? { x: 0, y: 20 }));
  if (big) spots.set(big.pid, big.shoot > 55 ? { x: -8, y: 24 } : { x: -6.5, y: 7 });
  return spots;
}

function guardSpot(o: Pt, onBall: boolean, help: number): Pt {
  const k = onBall ? 0.12 : 0.22 + (help / 100) * 0.18;
  return { x: o.x + (BASKET.x - o.x) * k, y: o.y + (BASKET.y - o.y) * k };
}

const ZONE23: Pt[] = [
  { x: -7, y: 18 },
  { x: 7, y: 18 },
  { x: -12, y: 7 },
  { x: 12, y: 7 },
  { x: 0, y: 7 },
];
// three across the top, two on the blocks
const ZONE32: Pt[] = [
  { x: -12, y: 20 },
  { x: 0, y: 23 },
  { x: 12, y: 20 },
  { x: -7, y: 8 },
  { x: 7, y: 8 },
];

// free throws: the defense takes the spots nearest the basket and the top ones, the shooter's teammates the middle
// ones, one defender stays back for the break (lane spots 3.5 ft apart, so no two players overlap)
const FT_OFF: Pt[] = [
  { x: -9.5, y: 11 },
  { x: 9.5, y: 11 },
  { x: -16, y: 28 },
  { x: 16, y: 28 },
];
const FT_DEF: Pt[] = [
  { x: -9.5, y: 7.5 },
  { x: 9.5, y: 7.5 },
  { x: -9.5, y: 14.5 },
  { x: 9.5, y: 14.5 },
  { x: 0, y: 32 },
];

export function buildScript(log: PossLog, info: (pid: number) => PInfo): Script {
  const off = log.off;
  const oPids = log.on[off];
  const dPids = log.on[1 - off];
  const oInfo = oPids.map(info);
  const steps = log.steps;
  const first = steps.find((s) => s.pid !== undefined && oPids.includes(s.pid));
  let holder = first?.pid ?? oPids[0];
  const spots = baseSpots(oInfo, holder);
  const guardOf = new Map<number, number>(Object.entries(log.guards).map(([o, d]) => [Number(o), d]));
  const zone = log.scheme === 'zone32' ? ZONE32 : log.scheme === 'zone23' ? ZONE23 : null;

  // current positions
  const o = new Map<number, Pt>();
  const d = new Map<number, Pt>();
  const startY = log.kind === 'transition' ? 40 : 38;
  oPids.forEach((pid) => {
    const s = spots.get(pid)!;
    o.set(pid, { x: s.x * 0.6, y: clamp(s.y + 16, 0, startY + 4) });
  });
  const defendSpot = (dpid: number, i: number): Pt => {
    if (zone) return zone[i] ?? { x: 0, y: 10 };
    const opid = [...guardOf.entries()].find(([, dd]) => dd === dpid)?.[0];
    const op = opid !== undefined ? o.get(opid) : undefined;
    return op ? guardSpot(op, opid === holder, log.help) : { x: 0, y: 12 };
  };
  dPids.forEach((pid, i) => d.set(pid, { ...defendSpot(pid, i), y: defendSpot(pid, i).y + 6 }));
  let ball: Pt = { ...o.get(holder)! };
  const frames: Frame[] = [];
  const snap = (dur: number, extra: Partial<Frame> = {}) => {
    frames.push({ dur, o: oPids.map((p) => ({ ...o.get(p)! })), d: dPids.map((p) => ({ ...d.get(p)! })), ball: { ...ball }, ...extra });
  };
  const follow = () => {
    dPids.forEach((pid, i) => d.set(pid, defendSpot(pid, i)));
  };
  const moveTo = (pid: number, p: Pt) => {
    if (o.has(pid)) o.set(pid, { x: clamp(p.x, -24, 24), y: clamp(p.y, 0.5, 46) });
    else if (d.has(pid)) d.set(pid, { x: clamp(p.x, -24, 24), y: clamp(p.y, 0.5, 46) });
    if (pid === holder) ball = { ...o.get(pid)! };
  };

  snap(0);
  let score: [number, number] = [...log.score] as [number, number];
  // reconstruct the score before this possession so makes can tick it up
  const scoreBefore: [number, number] = [...score] as [number, number];
  scoreBefore[off] -= log.pts;
  score = [...scoreBefore] as [number, number];

  for (const st of steps) {
    stepFrames(st);
  }
  if (!frames.length || frames.length === 1) snap(500);
  return { off, oPids, dPids, frames, label: log.label, clockStart: log.clockStart, clockEnd: log.clockEnd, q: log.q };

  function stepFrames(st: PossStep) {
    switch (st.k) {
      case 'advance': {
        for (const pid of oPids) moveTo(pid, spots.get(pid)!);
        holder = st.pid ?? holder;
        ball = { ...o.get(holder)! };
        follow();
        snap(750);
        break;
      }
      case 'press': {
        dPids.forEach((pid, i) => d.set(pid, { x: (i - 2) * 9, y: 40 + (i % 2) * 3 }));
        snap(450);
        for (const pid of oPids) moveTo(pid, { x: spots.get(pid)!.x, y: spots.get(pid)!.y + 6 });
        follow();
        snap(700);
        break;
      }
      case 'transition': {
        holder = st.pid ?? holder;
        moveTo(holder, { x: 0, y: 30 });
        oPids.forEach((pid, i) => {
          if (pid !== holder) moveTo(pid, { x: [-20, 20, -10, 10][i % 4], y: 14 + (i % 2) * 6 });
        });
        dPids.forEach((pid, i) => d.set(pid, { x: (i - 2) * 6, y: 18 + i * 3 }));
        ball = { ...o.get(holder)! };
        snap(650);
        moveTo(holder, { x: 2, y: 16 });
        snap(450);
        break;
      }
      case 'screen': {
        const scr = st.pid!;
        const h = st.pid2 ?? holder;
        const hp = o.get(h)!;
        moveTo(scr, { x: hp.x + 3, y: hp.y - 1.5 });
        follow();
        snap(480);
        moveTo(h, { x: hp.x - 4, y: hp.y - 6 });
        moveTo(scr, { x: hp.x + 1, y: 12 });
        follow();
        snap(520, { flash: { text: log.coverage ? log.coverage.toUpperCase() : 'SCREEN', kind: 'info', x: hp.x, y: hp.y + 3 } });
        break;
      }
      case 'trap': {
        const h = st.pid ?? holder;
        const hp = o.get(h)!;
        const near = [...dPids].sort((a, b) => dist(d.get(a)!, hp) - dist(d.get(b)!, hp)).slice(0, 2);
        near.forEach((pid, i) => d.set(pid, { x: hp.x + (i ? 1.5 : -1.5), y: hp.y - 1.5 }));
        snap(420, { flash: { text: 'TRAP', kind: 'info', x: hp.x, y: hp.y + 4 } });
        break;
      }
      case 'drive': {
        const pid = st.pid!;
        const p = o.get(pid)!;
        moveTo(pid, { x: p.x * 0.35, y: 10 });
        follow();
        snap(620);
        break;
      }
      case 'post': {
        const pid = st.pid!;
        const side = (o.get(pid)!.x >= 0 ? 1 : -1) * 7;
        moveTo(pid, { x: side, y: 8 });
        follow();
        snap(560);
        break;
      }
      case 'cut': {
        const pid = st.pid!;
        const p = o.get(pid)!;
        moveTo(pid, { x: Math.sign(p.x || 1) * 3, y: 7 });
        snap(520);
        break;
      }
      case 'handoff': {
        const big = st.pid!;
        const sh = st.pid2!;
        const side = o.get(sh)!.x >= 0 ? 1 : -1;
        moveTo(big, { x: side * 9, y: 21 });
        follow();
        snap(480);
        holder = big;
        ball = { ...o.get(big)! };
        moveTo(sh, { x: side * 11, y: 24 });
        snap(380);
        holder = sh;
        ball = { ...o.get(sh)! };
        moveTo(sh, { x: side * 13, y: 25 });
        follow();
        snap(380);
        break;
      }
      case 'pass': {
        const to = st.pid2!;
        holder = to;
        ball = { ...o.get(to)! };
        follow();
        snap(360);
        break;
      }
      case 'shot': {
        const pid = st.pid!;
        const target = { x: st.x ?? 0, y: st.y ?? 10 };
        moveTo(pid, target);
        holder = pid;
        ball = { ...target };
        follow();
        // contest: nearest defender closes out to a hand's length, on the basket side (not on top of a shooter at the rim)
        const near = [...dPids].sort((a, b) => dist(d.get(a)!, target) - dist(d.get(b)!, target))[0];
        const toRim = dist(target, BASKET);
        const [ux, uy] = toRim > 0.5 ? [(BASKET.x - target.x) / toRim, (BASKET.y - target.y) / toRim] : [0, -1];
        if (near !== undefined) d.set(near, { x: target.x + ux * 3, y: Math.max(0.5, target.y + uy * 3) });
        snap(300);
        ball = { ...BASKET };
        const made = !!st.made;
        if (made) score[off] += st.v ?? 2;
        snap(st.zone === 'rim' ? 380 : 620, {
          ballZ: 1,
          flash: made ? { text: `+${st.v ?? 2}`, kind: 'make', x: 0, y: 9 } : { text: 'MISS', kind: 'miss', x: 0, y: 9 },
          score: [...score] as [number, number],
        });
        break;
      }
      case 'block': {
        snap(260, { flash: { text: 'BLOCKED', kind: 'block', x: 0, y: 11 } });
        break;
      }
      case 'reb': {
        // no pid: a team rebound (out of bounds, or the ball loose after a free throw)
        const pid = st.pid;
        const pt = { x: (Math.random() - 0.5) * 8, y: 7 + Math.random() * 4 };
        if (pid !== undefined && o.has(pid)) {
          moveTo(pid, pt);
          holder = pid;
        } else if (pid !== undefined && d.has(pid)) d.set(pid, pt);
        ball = { ...pt };
        const text = pid === undefined ? 'TEAM REBOUND' : o.has(pid) ? 'OFF. REBOUND' : 'REBOUND';
        snap(420, { flash: { text, kind: 'info', x: pt.x, y: pt.y + 4 } });
        break;
      }
      case 'to':
      case 'steal': {
        const stl = st.pid2;
        if (stl !== undefined && d.has(stl)) {
          ball = { ...d.get(stl)! };
        } else ball = { x: 25, y: ball.y };
        snap(420, { flash: { text: st.k === 'steal' ? 'STEAL' : 'TURNOVER', kind: 'to', x: ball.x * 0.5, y: ball.y + 3 } });
        break;
      }
      case 'foul': {
        snap(380, { flash: { text: 'FOUL', kind: 'foul', x: ball.x, y: ball.y + 3 } });
        break;
      }
      case 'ft': {
        const pid = st.pid!;
        moveTo(pid, { x: 0, y: 19 });
        holder = pid;
        ball = { x: 0, y: 19 };
        oPids.filter((p) => p !== pid).forEach((p, i) => moveTo(p, FT_OFF[i] ?? { x: 0, y: 30 }));
        dPids.forEach((p, i) => d.set(p, FT_DEF[i] ?? { x: 0, y: 32 }));
        snap(450);
        ball = { ...BASKET };
        score[off] += st.v ?? 0;
        // "1/2 FT": makes out of attempts (a log without attempts just counts the makes)
        snap(520, {
          ballZ: 1,
          flash: { text: st.n ? `${st.v ?? 0}/${st.n} FT` : `${st.v ?? 0} FT`, kind: (st.v ?? 0) > 0 ? 'make' : 'miss', x: 0, y: 9 },
          score: [...score] as [number, number],
        });
        break;
      }
      case 'timeout':
        snap(500, { flash: { text: 'TIMEOUT', kind: 'info', x: 0, y: 26 } });
        break;
      default:
        break;
    }
  }
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
