// A play on the coach's board (plays.ts playBoard): the half court from above with the basket at the top, the
// five as numbered rings (1 has the ball; the man the play is for is filled in his team's colour), and the
// play in a coach's own marks: a line with an arrow for a cut, a line ending in a bar for a screen, a zigzag
// for a dribble, a dashed line for a pass (handed off, not thrown: two short strokes where it changes hands).
import { useId } from 'react';
import type { Pt } from './choreo';
import type { Board } from './plays';

/** A man's ring (ft), and how far short of where it is going a line stops. */
const MAN = 1.75;
const SHORT = 0.5;
/** A dribble's zigzag: how long each tooth is along the way, and how far it stands off it (ft). */
const TOOTH = 1.5;
const BITE = 0.55;
/** A screen's bar, half its length (ft). */
const BAR = 1.5;
/** The board shows the floor from the baseline out to here (ft), and this far past each sideline. */
const DEEP = 35.5;
const WIDE = 26;

const far = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
/** A point `ft` from `a` toward `b`. */
const along = (a: Pt, b: Pt, ft: number): Pt => {
  const d = far(a, b) || 1;
  return { x: a.x + ((b.x - a.x) * ft) / d, y: a.y + ((b.y - a.y) * ft) / d };
};
const f = (n: number) => n.toFixed(2);

/** A line through points as a path: off the ring it starts in, short of where it ends. */
function trimmed(pts: Pt[], end = SHORT): Pt[] {
  if (pts.length < 2) return pts;
  const out = pts.map((p) => ({ ...p }));
  if (far(out[0], out[1]) > MAN + 0.4) out[0] = along(out[0], out[1], MAN);
  const n = out.length - 1;
  if (far(out[n - 1], out[n]) > end + 0.4) out[n] = along(out[n], out[n - 1], end);
  return out;
}

/** The same way in teeth: across it one side and the other, a tooth at a time. */
function zigzag(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]];
  let side = 1;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const d = far(a, b);
    const n = Math.max(2, Math.round(d / TOOTH));
    const [nx, ny] = d > 0 ? [-(b.y - a.y) / d, (b.x - a.x) / d] : [0, 0];
    // (straight for the last tooth, so the arrow points the way he goes)
    for (let k = 1; k < n; k++) {
      const u = (k - 0.5) / n;
      out.push({ x: a.x + (b.x - a.x) * u + nx * BITE * side, y: a.y + (b.y - a.y) * u + ny * BITE * side });
      side = -side;
    }
    out.push(along(b, a, d / n / 2), b);
  }
  return out;
}

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');

export function PlayBoard({ board, label, color }: { board: Board; label: string; color: string }) {
  const arrow = useId();
  // (the three-point line: straight in the corners, the arc above them)
  const arcY = 5.25 + Math.sqrt(23.75 * 23.75 - 22 * 22);
  return (
    <svg
      className="lv-pb"
      viewBox={`${-WIDE} -1 ${2 * WIDE} ${DEEP + 1.5}`}
      role="img"
      aria-label={`${label}, on the board. ${board.says.join('. ')}`}
      style={{ ['--pb-c' as string]: color }}
    >
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
          <path d="M0 0.6 L10 5 L0 9.4 Z" className="lv-pb-head" />
        </marker>
      </defs>
      <g className="lv-pb-floor">
        <path d={`M${-25} 0 H25 M${-25} 0 V${DEEP} M25 0 V${DEEP}`} />
        <rect x={-8} y={0} width={16} height={19} />
        <path d="M-6 19 A6 6 0 0 0 6 19" />
        <path d={`M-22 0 V${f(arcY)} A23.75 23.75 0 0 0 22 ${f(arcY)} V0`} />
        <path d="M-3 4 H3" className="lv-pb-glass" />
        <circle cx={0} cy={5.25} r={0.85} />
      </g>
      {board.marks.map((m, i) => {
        if (m.kind === 'pass') {
          const [a, b] = [along(m.from, m.to, MAN + 0.2), along(m.to, m.from, MAN + 0.4)];
          const d = far(a, b) || 1;
          const [nx, ny] = [-(b.y - a.y) / d, (b.x - a.x) / d];
          // (handed off: the two men are an arm apart, and a line between them is a scribble: two strokes where it changes hands)
          if (m.hand) {
            const at = { x: (m.from.x + m.to.x) / 2, y: (m.from.y + m.to.y) / 2 };
            return (
              <g key={i} className="lv-pb-pass">
                {[-0.4, 0.4].map((o) => (
                  <path
                    key={o}
                    className="lv-pb-hand"
                    d={path([
                      { x: at.x + ((b.x - a.x) / d) * o + nx * 1.1, y: at.y + ((b.y - a.y) / d) * o + ny * 1.1 },
                      { x: at.x + ((b.x - a.x) / d) * o - nx * 1.1, y: at.y + ((b.y - a.y) / d) * o - ny * 1.1 },
                    ])}
                  />
                ))}
              </g>
            );
          }
          return (
            <g key={i} className="lv-pb-pass">
              <path d={path([a, b])} markerEnd={`url(#${arrow})`} />
            </g>
          );
        }
        const pts = trimmed(m.pts, m.screen !== undefined ? 0.1 : SHORT);
        const end = pts[pts.length - 1];
        const from = pts[pts.length - 2] ?? end;
        const d = far(from, end) || 1;
        const [nx, ny] = [-(end.y - from.y) / d, (end.x - from.x) / d];
        return (
          <g key={i} className={`lv-pb-${m.kind}`}>
            <path d={path(m.kind === 'dribble' ? zigzag(pts) : pts)} markerEnd={m.screen === undefined ? `url(#${arrow})` : undefined} />
            {m.screen !== undefined && (
              <path
                className="lv-pb-bar"
                d={path([
                  { x: end.x + nx * BAR, y: end.y + ny * BAR },
                  { x: end.x - nx * BAR, y: end.y - ny * BAR },
                ])}
              />
            )}
          </g>
        );
      })}
      {board.men.map((m) => (
        <g key={m.pid} className={`lv-pb-man${m.star ? ' star' : ''}`}>
          <circle cx={m.at.x} cy={m.at.y} r={MAN} />
          {m.ball && <circle className="lv-pb-ball" cx={m.at.x + MAN * 0.95} cy={m.at.y + MAN * 0.95} r={0.75} />}
          <text x={m.at.x} y={m.at.y + 0.08} textAnchor="middle" dominantBaseline="middle">
            {m.n}
          </text>
        </g>
      ))}
    </svg>
  );
}
