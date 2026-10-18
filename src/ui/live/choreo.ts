// Turns an engine possession log into keyframes for the 2D court. Coordinates are in feet
// on a half court: x -25..25 (sideline to sideline), y 0..47 (baseline to half-court line),
// basket at (0, 5.25). The offense always attacks the basket at the top of the screen.

import type { PossLog, PossStep } from '../../core/sim/log';
import { madeAtt } from '../../core/format';
import { SETS } from '../../core/sim/sets';

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
  /** What the court says once this frame is reached ('Holmgren screens for Mitchell'), carried on until the next one says something. */
  cap?: string;
  /** Who has the ball here: an index into [...oPids, ...dPids] (-1: nobody, it's in the air or loose). The court tags him with his name. */
  hold?: number;
  /** A shot landing: the net (a make) or the rim (a miss) reacts. */
  fx?: 'make' | 'miss';
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
  /** The possession's big moment, if it had one: a shot at the buzzer, or one that won the game with it. */
  moment?: 'buzzer' | 'winner';
}

const BASKET: Pt = { x: 0, y: 5.25 };

/** How the captions say a ball-screen coverage: 'they drop', 'they switch'. */
const COVER_VERB: Record<string, string> = { drop: 'drop', switch: 'switch', hedge: 'hedge', blitz: 'blitz him', ice: 'ice it' };
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
  const dist = Math.hypot(BASKET.x - o.x, BASKET.y - o.y);
  // a step off him at least, so a man near the basket isn't drawn under his defender (on a drive, on his hip)
  const gap = dist > 0.5 ? Math.max(k * dist, 2) / dist : 0;
  return gap ? { x: o.x + (BASKET.x - o.x) * gap, y: o.y + (BASKET.y - o.y) * gap } : { x: o.x, y: o.y - 2 };
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

// the junk defenses' zones behind their chasers: a 2-2 box (box-and-one), a triangle with its point at
// the free-throw line and its base on the blocks (triangle-and-two)
// (the low spots sit inside the posts, so a big posting up isn't drawn under a defender)
const BOX: Pt[] = [
  { x: -8, y: 17 },
  { x: 8, y: 17 },
  { x: -4.5, y: 9 },
  { x: 4.5, y: 9 },
];
const TRIANGLE: Pt[] = [
  { x: 0, y: 18 },
  { x: -4.5, y: 9 },
  { x: 4.5, y: 9 },
];

/** A chaser face-guarding his man off the ball: between him and the ball, a step off him. */
function chaseSpot(o: Pt, ball: Pt): Pt {
  const dx = ball.x - o.x;
  const dy = ball.y - o.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: o.x + (dx / d) * 2.2, y: o.y + (dy / d) * 2.2 };
}

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

/**
 * Keyframes for one possession. `before` is the score it started from: its log keeps only the score
 * it ended on and its own points, which leave out a technical free throw (a disqualified player
 * staying on), so working back from those is only right when no technical was made. `teams` are the
 * [home, away] abbreviations, to say whose timeout it is.
 */
export function buildScript(log: PossLog, info: (pid: number) => PInfo, before?: [number, number], teams?: [string, string], name?: (pid: number) => string): Script {
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
  // a junk defense: its chasers stay with their men, the others hold the box or triangle
  const junk = log.scheme === 'box1' ? BOX : log.scheme === 'tri2' ? TRIANGLE : null;
  const chasers = new Map<number, number>();
  if (junk) for (const c of log.chase ?? []) if (guardOf.has(c)) chasers.set(guardOf.get(c)!, c);
  const zoneSlot = new Map<number, number>();
  if (junk) dPids.filter((pid) => !chasers.has(pid)).forEach((pid, i) => zoneSlot.set(pid, i));

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
    if (junk) {
      const man = chasers.get(dpid);
      const op = man !== undefined ? o.get(man) : undefined;
      if (op) return man === holder ? guardSpot(op, true, log.help) : chaseSpot(op, o.get(holder) ?? op);
      return junk[zoneSlot.get(dpid) ?? 0] ?? { x: 0, y: 10 };
    }
    const opid = [...guardOf.entries()].find(([, dd]) => dd === dpid)?.[0];
    const op = opid !== undefined ? o.get(opid) : undefined;
    return op ? guardSpot(op, opid === holder, log.help) : { x: 0, y: 12 };
  };
  dPids.forEach((pid, i) => d.set(pid, { ...defendSpot(pid, i), y: defendSpot(pid, i).y + 6 }));
  let ball: Pt = { ...o.get(holder)! };
  const frames: Frame[] = [];
  // who has the ball: whoever stands where it is (nobody while it's in the air or at the rim)
  const holding = (): number => {
    const at = (p: Pt | undefined) => !!p && Math.abs(p.x - ball.x) < 0.01 && Math.abs(p.y - ball.y) < 0.01;
    const i = oPids.findIndex((p) => at(o.get(p)));
    if (i >= 0) return i;
    const j = dPids.findIndex((p) => at(d.get(p)));
    return j >= 0 ? oPids.length + j : -1;
  };
  const snap = (dur: number, extra: Partial<Frame> = {}) => {
    frames.push({ dur, o: oPids.map((p) => ({ ...o.get(p)! })), d: dPids.map((p) => ({ ...d.get(p)! })), ball: { ...ball }, hold: holding(), ...extra });
  };
  // captions name the players (without names, the court shows the play's label throughout)
  const N = (pid: number | undefined) => (pid === undefined || !name ? '' : name(pid));
  const cap = (text: string) => (name ? { cap: text } : {});
  const abbrev = (side: 0 | 1) => teams?.[side] ?? (side === 0 ? 'Home' : 'Away');
  const follow = () => {
    dPids.forEach((pid, i) => d.set(pid, defendSpot(pid, i)));
  };
  const moveTo = (pid: number, p: Pt) => {
    if (o.has(pid)) o.set(pid, { x: clamp(p.x, -24, 24), y: clamp(p.y, 0.5, 46) });
    else if (d.has(pid)) d.set(pid, { x: clamp(p.x, -24, 24), y: clamp(p.y, 0.5, 46) });
    if (pid === holder) ball = { ...o.get(pid)! };
  };
  // the log leaves out the pass that starts an action for a man off the ball (an isolation, a post
  // entry, a ball screen for someone else): it finds him first
  const catchBall = (pid: number) => {
    if (pid === holder || !o.has(pid)) return;
    const from = holder;
    holder = pid;
    ball = { ...o.get(pid)! };
    follow();
    snap(360, cap(`${N(from)} finds ${N(pid)}`));
  };

  snap(0, name ? { cap: log.label } : {});
  // a set's off-ball screens, in order: where each sends its man depends on the set
  let pins = 0;
  // the score before this possession, so makes can tick it up
  const score: [number, number] = before ? [...before] : [log.score[0] - (off === 0 ? log.pts : 0), log.score[1] - (off === 1 ? log.pts : 0)];
  // the possession's last shot, if it went in as the clock ran out: at the buzzer, and in the 4th or
  // overtime from behind or level into the lead, the shot that won it
  const lastShot = [...steps].reverse().find((st) => st.k === 'shot');
  const buzzer = !!lastShot?.made && log.clockEnd <= 0.05;
  let moment: Script['moment'];
  let prev: PossStep | undefined;

  for (const st of steps) {
    stepFrames(st);
    prev = st;
  }
  // a made technical free throw has no step of its own: the court ends on the scoreboard's score anyway
  if (score[0] !== log.score[0] || score[1] !== log.score[1]) snap(600, { flash: { text: 'TECH FT', kind: 'make', x: 0, y: 9 }, score: [...log.score] });
  if (!frames.length || frames.length === 1) snap(500);
  return { off, oPids, dPids, frames, label: log.label, clockStart: log.clockStart, clockEnd: log.clockEnd, q: log.q, ...(moment && { moment }) };

  function stepFrames(st: PossStep) {
    switch (st.k) {
      case 'advance': {
        for (const pid of oPids) moveTo(pid, spots.get(pid)!);
        holder = st.pid ?? holder;
        // Horns: the big it's run for and the other big set up at the elbows
        if (log.set?.id === 'horns') {
          const other = oInfo.filter((p) => p.pid !== log.set!.pid && p.pid !== holder).sort((a, b) => b.hgt - a.hgt)[0];
          moveTo(log.set.pid, { x: -6, y: 19.5 });
          if (other) moveTo(other.pid, { x: 6, y: 19.5 });
        }
        ball = { ...o.get(holder)! };
        follow();
        snap(750, log.set ? cap(`${SETS[log.set.id].name} for ${N(log.set.pid)}`) : {});
        break;
      }
      case 'press': {
        dPids.forEach((pid, i) => d.set(pid, { x: (i - 2) * 9, y: 40 + (i % 2) * 3 }));
        snap(450, cap(`${abbrev((1 - off) as 0 | 1)} press full court`));
        for (const pid of oPids) moveTo(pid, { x: spots.get(pid)!.x, y: spots.get(pid)!.y + 6 });
        follow();
        snap(700);
        break;
      }
      case 'transition': {
        holder = st.pid ?? holder;
        moveTo(holder, { x: 0, y: 30 });
        // (a lane each for the other four: counted among them, two never share one; i % 4 in case the log names no one of the five)
        oPids.filter((pid) => pid !== holder).forEach((pid, i) => moveTo(pid, { x: [-20, 20, -10, 10][i % 4], y: 14 + (i % 2) * 6 }));
        dPids.forEach((pid, i) => d.set(pid, { x: (i - 2) * 6, y: 18 + i * 3 }));
        ball = { ...o.get(holder)! };
        snap(650, cap(`${N(holder)} pushes it in transition`));
        moveTo(holder, { x: 2, y: 16 });
        snap(450);
        break;
      }
      case 'screen': {
        const scr = st.pid!;
        const h = st.pid2 ?? holder;
        // a ball screen is for the man with the ball, out on the floor: one in the corner or under the
        // basket comes up for it (or the screen would send him over the baseline)
        const up = o.get(h)!;
        if (up.y < 22) {
          moveTo(h, { x: clamp(up.x, -15, 15), y: 26 });
          follow();
          snap(420);
        }
        catchBall(h);
        const hp = o.get(h)!;
        moveTo(scr, { x: hp.x + 3, y: hp.y - 1.5 });
        follow();
        snap(480);
        moveTo(h, { x: hp.x - 4, y: hp.y - 6 });
        moveTo(scr, { x: hp.x + 1, y: 12 });
        follow();
        snap(520, {
          flash: { text: log.coverage ? log.coverage.toUpperCase() : 'SCREEN', kind: 'info', x: hp.x, y: hp.y + 3 },
          ...cap(`${N(scr)} screens for ${N(h)}${log.coverage && log.coverage !== 'zone' ? `: they ${COVER_VERB[log.coverage]}` : ''}`),
        });
        break;
      }
      case 'pin': {
        // an off-ball screen: the screener gets to his spot, then his man comes off it
        const scr = st.pid!;
        const cut = st.pid2!;
        const sp = o.get(scr);
        const cp = o.get(cut);
        if (!sp || !cp) break;
        const n = pins++;
        const side = cp.x >= 0 ? 1 : -1;
        let at: Pt;
        let to: Pt;
        switch (log.set?.id) {
          case 'floppy':
            // from the baseline under the basket, past a screen on one block, off the stagger on the
            // other side and out to that wing
            // (the stagger on the left, up the lane line from where a big posts)
            if (n === 0) {
              moveTo(cut, { x: 4.5, y: 2 });
              at = { x: 6.5, y: 8.5 };
              to = { x: 4.5, y: 2 };
            } else {
              at = { x: -6, y: 10.5 };
              to = { x: -16.5, y: 20.5 };
            }
            break;
          case 'elevator':
            // two screeners side by side at the top of the key; he comes up between them, the passer
            // swinging out to the wing to find him
            if (n === 0) {
              if (holder !== cut && holder !== scr) moveTo(holder, { x: 16.5, y: 21 });
              moveTo(cut, { x: 0, y: 13 });
              at = { x: -1.6, y: 23 };
              to = { x: 0, y: 13 };
            } else {
              at = { x: 1.6, y: 23 };
              to = { x: 0, y: 26 };
            }
            break;
          case 'chicago':
            // a pin-down on the block, and he curls up toward the handoff
            moveTo(cut, { x: side * 9, y: 6 });
            at = { x: side * 8.5, y: 11 };
            to = { x: side * 12, y: 22 };
            break;
          case 'hammer':
            // the hammer screen on the help defender frees his corner
            at = { x: side * 9, y: 7 };
            to = { x: side * 22, y: 3 };
            break;
          case 'spain':
            // a back screen on the roll man's defender as he dives
            at = { x: cp.x - 1.6, y: cp.y + 1.4 };
            to = { x: cp.x * 0.3, y: 7.5 };
            break;
          case 'postSplit':
            // the split: one screens for the other, who cuts (the screener flares)
            at = { x: cp.x + side * -2, y: cp.y };
            to = { x: cp.x * 0.5, y: cp.y - 4 };
            break;
          default:
            at = { x: cp.x - side * 2, y: cp.y - 1.5 };
            to = { x: side * 16.5, y: 21 };
        }
        moveTo(scr, at);
        follow();
        snap(420);
        moveTo(cut, to);
        if (log.set?.id === 'postSplit') moveTo(scr, { x: -side * 18, y: 20 });
        follow();
        const tag = n === 0 && log.set ? SETS[log.set.id].short.toUpperCase() : 'SCREEN';
        snap(480, { flash: { text: tag, kind: 'info', x: at.x, y: at.y + 3 }, ...cap(`${N(scr)} screens for ${N(cut)}`) });
        break;
      }
      case 'trap': {
        const h = st.pid ?? holder;
        const hp = o.get(h)!;
        const near = [...dPids].sort((a, b) => dist(d.get(a)!, hp) - dist(d.get(b)!, hp)).slice(0, 2);
        near.forEach((pid, i) => d.set(pid, { x: hp.x + (i ? 1.5 : -1.5), y: hp.y - 1.5 }));
        snap(420, { flash: { text: 'TRAP', kind: 'info', x: hp.x, y: hp.y + 4 }, ...cap(`${N(h)} is trapped`) });
        break;
      }
      case 'drive': {
        const pid = st.pid!;
        catchBall(pid);
        const p = o.get(pid)!;
        moveTo(pid, { x: p.x * 0.35, y: 10 });
        follow();
        snap(620, cap(`${N(pid)} drives`));
        break;
      }
      case 'post': {
        const pid = st.pid!;
        const side = (o.get(pid)!.x >= 0 ? 1 : -1) * 7;
        moveTo(pid, { x: side, y: 8 });
        follow();
        snap(560, cap(`${N(pid)} posts up`));
        // the entry pass once he has his spot
        catchBall(pid);
        break;
      }
      case 'cut': {
        const pid = st.pid!;
        const p = o.get(pid)!;
        moveTo(pid, { x: Math.sign(p.x || 1) * 3, y: 7 });
        snap(520, cap(`${N(pid)} cuts to the rim`));
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
        snap(380, cap(`${N(big)} hands off to ${N(sh)}`));
        break;
      }
      case 'pass': {
        const to = st.pid2!;
        const from = st.pid ?? holder;
        holder = to;
        ball = { ...o.get(to)! };
        follow();
        snap(360, cap(from !== to ? `${N(from)} finds ${N(to)}` : `${N(to)} has it`));
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
        const what = st.d ?? (st.v === 3 ? 'three' : 'jumper');
        snap(300, cap(`${N(pid)}, ${what}…`));
        ball = { ...BASKET };
        const made = !!st.made;
        const lead = score[off] - score[1 - off];
        if (made) score[off] += st.v ?? 2;
        const now = score[off] - score[1 - off];
        // in the last two minutes of the 4th or overtime, a make that changes who leads says so
        const late = log.q >= 4 && log.clockEnd <= 120;
        const swing =
          made && late ? (lead <= 0 && now > 0 ? ` ${abbrev(off)} lead ${Math.max(...score)}-${Math.min(...score)}!` : lead < 0 && now === 0 ? ` Tied at ${score[0]}!` : '') : '';
        const atBuzzer = buzzer && st === lastShot;
        if (atBuzzer) moment = log.q >= 4 && lead <= 0 && now > 0 ? 'winner' : 'buzzer';
        const flashText = atBuzzer ? (moment === 'winner' ? 'GAME WINNER' : 'BUZZER BEATER') : `+${st.v ?? 2}`;
        snap(st.zone === 'rim' ? 380 : 620, {
          ballZ: 1,
          fx: made ? 'make' : 'miss',
          flash: made ? { text: flashText, kind: 'make', x: 0, y: 9 } : { text: 'MISS', kind: 'miss', x: 0, y: 9 },
          score: [...score] as [number, number],
          ...cap(made ? `${N(pid)} ${what}: good!${st.pid2 !== undefined ? ` (${N(st.pid2)} assist)` : ''}${swing}` : `${N(pid)} misses the ${what}`),
        });
        // at the buzzer, the court lingers on it
        if (atBuzzer) snap(900);
        break;
      }
      case 'block': {
        snap(260, { flash: { text: 'BLOCKED', kind: 'block', x: 0, y: 11 }, ...cap(`Blocked by ${N(st.pid)}!`) });
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
        snap(420, {
          flash: { text, kind: 'info', x: pt.x, y: pt.y + 4 },
          ...cap(pid === undefined ? `${abbrev(off)} keep it` : o.has(pid) ? `Offensive rebound, ${N(pid)}` : `${N(pid)} rebounds`),
        });
        break;
      }
      case 'to':
      case 'steal': {
        const stl = st.pid2;
        if (stl !== undefined && d.has(stl)) {
          ball = { ...d.get(stl)! };
        } else ball = { x: 25, y: ball.y };
        snap(420, {
          flash: { text: st.k === 'steal' ? 'STEAL' : 'TURNOVER', kind: 'to', x: ball.x * 0.5, y: ball.y + 3 },
          ...cap(st.k === 'steal' && stl !== undefined ? `${N(stl)} steals it from ${N(st.pid)}!` : `Turnover, ${N(st.pid ?? holder)}`),
        });
        break;
      }
      case 'foul': {
        // fouled on a make: and one
        const andOne = prev?.k === 'shot' && !!prev.made;
        snap(380, {
          flash: { text: andOne ? 'AND ONE!' : 'FOUL', kind: andOne ? 'make' : 'foul', x: ball.x, y: ball.y + 3 },
          ...cap(andOne ? `And one! Foul on ${N(st.pid)}` : `Foul on ${N(st.pid)}`),
        });
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
        // "1-2 FT": made-attempted, as a box score writes it (a log without attempts just counts the makes)
        snap(520, {
          ballZ: 1,
          flash: { text: st.n ? `${madeAtt(st.v ?? 0, st.n)} FT` : `${st.v ?? 0} FT`, kind: (st.v ?? 0) > 0 ? 'make' : 'miss', x: 0, y: 9 },
          score: [...score] as [number, number],
          ...cap(`${N(pid)} ${st.n ? `${st.v ?? 0} of ${st.n}` : `${st.v ?? 0}`} at the line`),
        });
        break;
      }
      case 'timeout':
        // the one flash a timeout gets, naming the team that called it
        snap(900, {
          flash: { text: st.t !== undefined && teams ? `TIMEOUT ${teams[st.t]}` : 'TIMEOUT', kind: 'info', x: 0, y: 26 },
          ...cap(st.t !== undefined ? `Timeout, ${abbrev(st.t)}` : 'Timeout'),
        });
        break;
      default:
        break;
    }
  }
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** What the court says at frame `i`: the last caption reached, or the play's label before any (and without names). */
export function captionAt(script: Script, i: number): string {
  for (let j = Math.min(i, script.frames.length - 1); j >= 0; j--) {
    const c = script.frames[j].cap;
    if (c) return c;
  }
  return script.label;
}
