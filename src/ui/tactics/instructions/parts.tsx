// The Team Instructions' drawings and small parts: the half court (as the board draws it, and to
// scale for the shot chart), a formation's thumbnail (O's with the ball, X's without it), the
// X's-and-O's of each action in the chosen shape, the shot chart in hexes, the shot-mix tiles, and a
// measured figure beside a control. Two colour families, never shared: the five actions wear the
// playbook's hues, the three shot zones the floor's (rim, wood, ink).
import { useId, useMemo, type ReactNode } from 'react';
import type { ActionType, OffShape } from '../../../core/types';
import { MIX_ZONES, type MixZone, type ShotDiet } from '../../../core/analysis/outlook';
import { OFF_SPOTS, type Spot } from '../formation';

/** A choice's name, with the dot when it's the style's own. */
export const optLabel = (label: string, mine: boolean): ReactNode => (
  <>
    {label}
    {mine && (
      <>
        <i className="tx-dot" aria-hidden="true" />
        <span className="sr-only">, the style&apos;s own</span>
      </>
    )}
  </>
);

/** A figure the games measured, beside the control that moves it; dimmed while a new reading is on its way. */
export function Fig({ children, stale }: { children: ReactNode; stale: boolean }) {
  return <span className={`ti-fig num${stale ? ' stale' : ''}`}>{children}</span>;
}

/** The half court's lines in the board's units (100 across, the baseline on top). */
export function CourtLines() {
  return (
    <g className="ti-court" fill="none">
      <path d="M 0 84 V 0 H 100 V 84" />
      <path d="M 34 0 V 27 H 66 V 0" />
      <path d="M 41 27 A 9 9 0 0 0 59 27" />
      <path d="M 6 0 V 14 A 44 44 0 0 0 94 14 V 0" />
      <path d="M 44.5 2.6 H 55.5" className="ti-court-board" />
      <circle cx="50" cy="5" r="1.7" className="ti-court-rim" />
    </g>
  );
}

/** A formation in small: where the five stand, as O's (with the ball) or X's (without it). */
export function FormationThumb({ spots, marks }: { spots: Spot[]; marks: 'o' | 'x' }) {
  return (
    <svg className="ti-thumb-court" viewBox="-3 -3 106 64" aria-hidden="true">
      <CourtLines />
      {spots.map((s, i) =>
        marks === 'o' ? (
          <circle key={i} cx={s.x} cy={Math.min(s.y, 55)} r="5" className="ti-thumb-o" />
        ) : (
          <path key={i} d={`M ${s.x - 4.2} ${Math.min(s.y, 55) - 4.2} l 8.4 8.4 m 0 -8.4 l -8.4 8.4`} className="ti-thumb-x" />
        ),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- X's and O's

type Pt = { x: number; y: number };
const RIM: Pt = { x: 50, y: 9 };

/** A path from `a` to `b`, bowed `bend` units to its left, stopping `short` of `b` (room for a head or a player). */
function arc(a: Pt, b: Pt, bend = 0, short = 0): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const e = { x: b.x - (dx / len) * short, y: b.y - (dy / len) * short };
  const m = { x: (a.x + e.x) / 2 + (dy / len) * bend, y: (a.y + e.y) / 2 - (dx / len) * bend };
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${m.x.toFixed(1)} ${m.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

interface Draw {
  /** A player getting to where the action starts (the screener coming up): a quiet line, no arrow. */
  sets?: string[];
  /** Players who move: a path each, an arrow at its end. */
  cuts: string[];
  /** The ball on the floor. */
  dribbles: string[];
  /** The ball in the air. */
  passes: string[];
  /** A screen: where it's set and which way it faces (degrees). */
  screen?: Pt & { rot: number };
  /** Which side of the handler the ball is on (1 right, -1 left). */
  hand: number;
  /** What the drawing shows, in a line. */
  say: string;
}

/** An action as the shape runs it: who screens, cuts, drives and passes, from the shape's own spots. */
function drawAction(action: ActionType, spots: Spot[]): Draw {
  const ball = spots[0];
  const bigs = spots.filter((s) => s.kind === 'big');
  // (no big inside: the far corner comes up, as five-out's screener does)
  const big = bigs[bigs.length - 1] ?? spots[spots.length - 1];
  const right = big.x >= 50;
  const side = right ? 1 : -1;
  const mine = (s: Spot) => (right ? s.x > 50 : s.x < 50);
  // the others outside: the one on the big's side highest up the floor is the action's wing (in horns,
  // whose high spots are its two bigs, that is the corner), the one across the floor fills behind it
  const outside = spots.filter((s) => s !== ball && s !== big && s.kind !== 'big');
  const pool = outside.length ? outside : spots.filter((s) => s !== ball && s !== big);
  const high = (list: Spot[]) => [...list].sort((a, b) => b.y - a.y)[0];
  const wing = high(pool.filter(mine)) ?? high(pool) ?? spots[1];
  const rest = pool.filter((s) => s !== wing);
  const far = high(rest.filter((s) => !mine(s))) ?? high(rest) ?? spots[2];
  // (a wing fills the top; a corner lifts up its own sideline, clear of whoever stands at the elbow)
  const fill = far.y > 30 ? { x: 50, y: 66 } : { x: far.x, y: 42 };
  // where the ball goes first: the wing, or in horns the big at the elbow
  const outlet = wing.y > 25 ? wing : big;
  switch (action) {
    case 'pnr': {
      const at = { x: ball.x + side * 9, y: ball.y - 8 };
      return {
        sets: [arc(big, at, side * -14, 3)],
        cuts: [arc(at, RIM, side * 10, 4)],
        dribbles: [arc({ x: ball.x + side * 3, y: ball.y - 5 }, { x: ball.x + side * 22, y: 40 }, side * -10, 0)],
        passes: [],
        screen: { ...at, rot: side * 35 },
        hand: -side,
        say: 'A ball screen at the top, the screener rolling to the rim',
      };
    }
    case 'handoff': {
      const at = { x: 50 + side * 13, y: 50 };
      return {
        sets: [arc(big, at, side * -8, 4)],
        cuts: [arc(wing, { x: 50 - side * 4, y: 42 }, side * 14, 0)],
        dribbles: [],
        passes: [arc({ x: ball.x + side * 3, y: ball.y - 4 }, at, 0, 5)],
        screen: { x: at.x + side * 2, y: at.y + 5, rot: side * 60 },
        hand: -side,
        say: 'The ball to the big at the elbow, a shooter running off him',
      };
    }
    case 'motion':
      return {
        cuts: [arc({ x: ball.x - side * 2, y: ball.y - 5 }, RIM, side * -9, 5), arc(far, fill, far.y > 30 ? side * -8 : 0, 5)],
        dribbles: [],
        passes: [arc({ x: ball.x + side * 4, y: ball.y - 3 }, outlet, 0, 6), arc({ x: outlet.x - side * 4, y: outlet.y - 4 }, { x: 50 - side * 3, y: 18 }, 0, 0)],
        hand: -side,
        say: 'Pass and cut: the ball moves, a cutter goes to the rim',
      };
    case 'iso':
      return {
        cuts: [],
        dribbles: [arc({ x: ball.x, y: ball.y - 5 }, { x: 50 - side * 5, y: 14 }, side * 12, 0)],
        passes: [],
        hand: -side,
        say: 'Four clear out, your scorer goes one-on-one',
      };
    case 'post': {
      const block = { x: 50 + side * 15, y: 16 };
      const there = Math.hypot(big.x - block.x, big.y - block.y) < 8;
      return {
        sets: there ? [] : [arc(big, block, side * 5, 2)],
        cuts: [],
        dribbles: [],
        passes: [
          arc({ x: ball.x + side * 4, y: ball.y - 3 }, wing, 0, 6),
          arc({ x: wing.x - side * 5, y: wing.y + (wing.y > 25 ? -4 : 3) }, { x: block.x + side * 4, y: block.y + (wing.y > 25 ? 4 : 0) }, 0, 0),
        ],
        hand: -side,
        say: wing.y > 25 ? 'The ball to the wing, then into the post' : 'The ball to the corner, then into the post',
      };
    }
  }
}

/** The X's and O's of an action in the chosen shape: the five numbered at the shape's spots. */
export function PlayDiagram({ shape, action }: { shape: OffShape; action: ActionType }) {
  const id = useId().replace(/:/g, '');
  const spots = OFF_SPOTS[shape];
  const d = drawAction(action, spots);
  return (
    <figure className={`ti-play a-${action}`}>
      <svg viewBox="-3 -3 106 80" role="img" aria-label={d.say}>
        <defs>
          <marker id={`${id}a`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.6" markerHeight="4.6" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="ti-play-head" />
          </marker>
        </defs>
        <CourtLines />
        {d.sets?.map((p, i) => (
          <path key={`s${i}`} d={p} className="ti-play-set" />
        ))}
        {d.passes.map((p, i) => (
          <path key={`p${i}`} d={p} className="ti-play-pass" markerEnd={`url(#${id}a)`} />
        ))}
        {d.cuts.map((p, i) => (
          <path key={`c${i}`} d={p} className="ti-play-cut" markerEnd={`url(#${id}a)`} />
        ))}
        {d.dribbles.map((p, i) => (
          <path key={`d${i}`} d={p} className="ti-play-dribble" markerEnd={`url(#${id}a)`} />
        ))}
        {d.screen && <path d="M -5 0 H 5" className="ti-play-screen" transform={`translate(${d.screen.x} ${d.screen.y}) rotate(${d.screen.rot})`} />}
        {spots.map((s, i) => (
          <g key={i} transform={`translate(${s.x} ${Math.min(s.y, 73)})`}>
            <circle r="5.4" className="ti-play-o" />
            <text className="ti-play-n" textAnchor="middle" dy="2.6">
              {i + 1}
            </text>
          </g>
        ))}
        <circle cx={spots[0].x + d.hand * 6.5} cy={Math.min(spots[0].y, 73) - 4.5} r="2.1" className="ti-play-ball" />
      </svg>
      <figcaption>
        {d.say}
        <span className="ti-play-key" aria-hidden="true">
          <i className="k-cut" /> cut <i className="k-dribble" /> dribble <i className="k-pass" /> pass
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- the defense's drawings

interface Cover {
  /** Their handler and screener, our man on the ball and our big. */
  h: Pt;
  s: Pt;
  x1: Pt;
  x5: Pt;
  /** Where our two go (an arrow each), and where the ball is sent. */
  moves: string[];
  ball: string;
  say: string;
}

const TOP: Pick<Cover, 'h' | 's'> = { h: { x: 43, y: 68 }, s: { x: 58, y: 62 } };

/** Each ball-screen coverage against a screen at the top (ice: on the side, where it is played). */
const COVERS: Record<string, Cover> = {
  drop: {
    ...TOP,
    x1: { x: 41, y: 56 },
    x5: { x: 56, y: 30 },
    moves: [arc({ x: 46, y: 54 }, { x: 64, y: 50 }, -7, 0)],
    ball: arc({ x: 49, y: 70 }, { x: 70, y: 52 }, 9, 0),
    say: 'Your big sits in the paint, his man chases over the screen',
  },
  switch: {
    ...TOP,
    x1: { x: 41, y: 56 },
    x5: { x: 62, y: 51 },
    moves: [arc({ x: 46, y: 55 }, { x: 55, y: 56 }, 0, 0), arc({ x: 66, y: 53 }, { x: 72, y: 60 }, 0, 0)],
    ball: arc({ x: 49, y: 70 }, { x: 74, y: 66 }, 7, 0),
    say: 'They trade men: your big takes the ball, your guard the screener',
  },
  hedge: {
    ...TOP,
    x1: { x: 41, y: 56 },
    x5: { x: 62, y: 51 },
    moves: [arc({ x: 65, y: 54 }, { x: 70, y: 66 }, -4, 0), arc({ x: 73, y: 63 }, { x: 60, y: 36 }, -10, 0)],
    ball: arc({ x: 49, y: 70 }, { x: 64, y: 72 }, 4, 0),
    say: 'Your big shows high to stall the ball, then gets back',
  },
  blitz: {
    ...TOP,
    x1: { x: 41, y: 56 },
    x5: { x: 62, y: 51 },
    moves: [arc({ x: 45, y: 58 }, { x: 58, y: 70 }, 6, 0), arc({ x: 65, y: 55 }, { x: 68, y: 67 }, -3, 0)],
    ball: arc({ x: 49, y: 70 }, { x: 62, y: 73 }, 3, 0),
    say: 'Two on the ball: the trap takes it out of his hands',
  },
  ice: {
    h: { x: 22, y: 46 },
    s: { x: 33, y: 50 },
    x1: { x: 27, y: 53 },
    x5: { x: 30, y: 22 },
    moves: [],
    ball: arc({ x: 20, y: 42 }, { x: 16, y: 20 }, 4, 0),
    say: 'On the side your guard sits on top of him, sending the ball to the baseline and your big',
  },
};

const xMark = (p: Pt, r = 4) => `M ${p.x - r} ${p.y - r} l ${2 * r} ${2 * r} m 0 ${-2 * r} l ${-2 * r} ${2 * r}`;

/** A ball-screen coverage in X's and O's: their handler and screener, our two on them. */
export function CoverageDiagram({ coverage }: { coverage: string }) {
  const id = useId().replace(/:/g, '');
  const c = COVERS[coverage] ?? COVERS.drop;
  return (
    <figure className="ti-play ti-cover">
      <svg viewBox="-3 -3 106 80" role="img" aria-label={c.say}>
        <defs>
          <marker id={`${id}a`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.6" markerHeight="4.6" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="ti-play-head" />
          </marker>
        </defs>
        <CourtLines />
        <path d={c.ball} className="ti-play-dribble them" markerEnd={`url(#${id}a)`} />
        {c.moves.map((m, i) => (
          <path key={i} d={m} className="ti-play-cut ours" markerEnd={`url(#${id}a)`} />
        ))}
        <circle cx={c.h.x} cy={c.h.y} r="4.6" className="ti-play-o" />
        <circle cx={c.s.x} cy={c.s.y} r="4.6" className="ti-play-o" />
        <circle cx={c.h.x - 5.5} cy={c.h.y - 3} r="1.9" className="ti-play-ball" />
        <path d={xMark(c.x1)} className="ti-play-x" />
        <path d={xMark(c.x5, 4.8)} className="ti-play-x big" />
      </svg>
      <figcaption>
        {c.say}
        <span className="ti-play-key" aria-hidden="true">
          <b className="k-x">×</b> yours <b className="k-o">○</b> theirs <i className="k-dribble them" /> the ball
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * A transition in small, on the whole floor (their basket on the right): how many of the five run
 * after a stop, how many chase the miss and how many get back, how far up the floor the press picks
 * them up. `n` is how many of the five do the first thing (0..5).
 */
export function TransDiagram({ kind, n, label }: { kind: 'run' | 'glass' | 'press'; n: number; label: string }) {
  const id = useId().replace(/:/g, '');
  // five lanes down the floor
  const lanes = [10, 19, 28, 37, 46];
  const marks = lanes.map((y, i) => {
    const on = i < n;
    if (kind === 'run') return { y, x: 22, to: on ? 82 : 40, on, o: true };
    // (the shot went up at the right basket: crashers go in, the rest turn back up the floor)
    if (kind === 'glass') return { y, x: 78, to: on ? 93 : 46, on, o: true };
    // (they inbound on the right: a pressing defender stands up the floor, the rest wait in the half court)
    return { y, x: on ? 74 - (i % 2) * 9 : 26 + (i % 2) * 8, to: null, on, o: false };
  });
  return (
    <svg className={`ti-trans k-${kind}`} viewBox="0 0 104 56" role="img" aria-label={label}>
      <defs>
        <marker id={`${id}a`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className="ti-play-head" />
        </marker>
      </defs>
      <g className="ti-court" fill="none">
        <rect x="2" y="3" width="100" height="50" />
        <path d="M 52 3 V 53" />
        <circle cx="52" cy="28" r="6" />
        <path d="M 2 19 H 20 V 37 H 2 M 102 19 H 84 V 37 H 102" />
        <path d="M 2 8 H 9 A 22 22 0 0 1 9 48 H 2 M 102 8 H 95 A 22 22 0 0 0 95 48 H 102" />
        <circle cx="7" cy="28" r="1.4" className="ti-court-rim" />
        <circle cx="97" cy="28" r="1.4" className="ti-court-rim" />
      </g>
      {marks.map((m, i) => (
        <g key={i} className={m.on ? 'on' : 'off'}>
          {m.to !== null && <path d={`M ${m.x + (m.to > m.x ? 4 : -4)} ${m.y} H ${m.to}`} className="ti-trans-go" markerEnd={`url(#${id}a)`} />}
          {m.o ? <circle cx={m.x} cy={m.y} r="3" className="ti-trans-o" /> : <path d={xMark({ x: m.x, y: m.y }, 2.6)} className="ti-trans-x" />}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- the shot chart

/** A hex's radius, in the chart's units (2 a foot). */
const HEX = 2.7;
const COL = Math.sqrt(3) * HEX;
const ROW = 1.5 * HEX;
/** The chart's depth: 31 feet of the half court. */
const DEPTH = 62;
const RIM_Y = 10.5;

/** The zone a spot on the floor is in by the lines (a hex nobody shot from). */
function zoneAt(x: number, y: number): MixZone {
  const d = Math.hypot(x - 50, y - RIM_Y);
  if (d <= 9.5) return 'rim';
  return (Math.abs(x - 50) >= 44 && y <= 28) || d >= 47.5 ? 'three' : 'mid';
}

const hexPath = (cx: number, cy: number, r: number) => {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    d += `${i ? 'L' : 'M'} ${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)} `;
  }
  return `${d}Z`;
};

/** Where the shots come from: the half court in hexes, each as big as its share of the shots, in its zone's colour. */
export function HexCourt({ diet, stale, label }: { diet: ShotDiet | null; stale: boolean; label: string }) {
  const cells = useMemo(() => {
    const rows = Math.floor(DEPTH / ROW);
    const cols = Math.floor(100 / COL);
    const count = new Map<number, { n: number; z: Record<MixZone, number> }>();
    for (const s of diet?.shots ?? []) {
      const y = s.y * 2;
      const r = Math.round((y - HEX) / ROW);
      if (r < 0 || r >= rows) continue;
      const c = Math.round((50 + s.x * 2 - COL / 2 - (r % 2 ? COL / 2 : 0)) / COL);
      if (c < 0 || c >= cols) continue;
      const e = count.get(r * 100 + c) ?? { n: 0, z: { three: 0, mid: 0, rim: 0 } };
      e.n++;
      e.z[s.zone]++;
      count.set(r * 100 + c, e);
    }
    // (sized against a busy hex, not the busiest: the two under the rim would shrink every other)
    const ns = [...count.values()].map((e) => e.n).sort((a, b) => a - b);
    const ref = Math.max(1, ns[Math.floor(ns.length * 0.92)] ?? 1);
    const out: { d: string; zone: MixZone; on: boolean }[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = COL / 2 + c * COL + (r % 2 ? COL / 2 : 0);
        const cy = HEX + r * ROW;
        if (cx > 100 - COL / 2 + 0.1) continue;
        const e = count.get(r * 100 + c);
        const zone = e ? MIX_ZONES.reduce((a, z) => (e.z[z] > e.z[a] ? z : a), zoneAt(cx, cy)) : zoneAt(cx, cy);
        const size = e ? 0.34 + 0.62 * Math.sqrt(Math.min(1, e.n / ref)) : 0.16;
        out.push({ d: hexPath(cx, cy, HEX * size), zone, on: !!e });
      }
    return out;
  }, [diet]);
  return (
    <svg className={`ti-hex${stale ? ' stale' : ''}`} viewBox={`-1 -1 102 ${DEPTH + 2}`} role="img" aria-label={label}>
      {cells.map((c, i) => (
        <path key={i} d={c.d} className={`z-${c.zone}${c.on ? '' : ' off'}`} />
      ))}
      {/* the court to scale: the key, the arc from the corners, the rim */}
      <g className="ti-court over" fill="none">
        <path d="M 34 0 V 38 H 66 V 0" />
        <path d="M 6 0 V 28 A 47.5 47.5 0 0 0 94 28 V 0" />
        <path d="M 44 8 H 56" className="ti-court-board" />
        <circle cx="50" cy={RIM_Y} r="1.5" className="ti-court-rim" />
      </g>
    </svg>
  );
}

/** Shares of a whole as whole percents that add to 100: each rounded down, the points left over to the largest remainders. */
export function wholePercents(shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  const exact = shares.map((x) => (x / total) * 100);
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - out[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0, left = 100 - out.reduce((a, b) => a + b, 0); k < left; k++) out[order[k % order.length][1]]++;
  return out;
}

const ZONE_LABEL: Record<MixZone, string> = { three: 'Threes', mid: 'Mid and paint', rim: 'At the rim' };

/** The shot mix in three tiles, each zone's share of the shots in its colour. */
export function MixTiles({ diet, stale }: { diet: ShotDiet | null; stale: boolean }) {
  const whole = diet ? wholePercents(MIX_ZONES.map((z) => diet.mix[z])) : null;
  return (
    <div className={`ti-mix${stale ? ' stale' : ''}`}>
      {MIX_ZONES.map((z, i) => (
        <div key={z} className={`ti-mix-t z-${z}`}>
          <b className="num">{whole ? `${whole[i]}%` : '–'}</b>
          <span>{ZONE_LABEL[z]}</span>
        </div>
      ))}
    </div>
  );
}
