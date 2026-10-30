import { useId, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ShotRecord } from '../../core/types';
import { periodLabel } from '../stats';
import { wpText } from '../../core/analysis/winProb';
import './gameday.css';

/**
 * Track an element's width so charts draw at their real size instead of a letterboxed 320px. A
 * callback ref: a chart that first had too little data to draw (and rendered nothing) is measured
 * once its element appears.
 */
function useWidth(fallback = 320) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    const update = () => setW(Math.max(200, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w] as const;
}

export function LineChart({
  points,
  height = 120,
  color = 'var(--accent)',
  yMin,
  yMax,
  labels,
  refLine,
  values = true,
}: {
  points: number[];
  height?: number;
  color?: string;
  yMin?: number;
  yMax?: number;
  labels?: string[];
  refLine?: number;
  /** Each point's value over it (twelve points or fewer). */
  values?: boolean;
}) {
  const [ref, w] = useWidth();
  const h = height;
  // a value that isn't a number (NaN, ±Infinity) leaves a gap in the line instead of breaking the chart
  const known = points.filter((v) => isFinite(v));
  if (known.length === 0) return null;
  const lo = yMin ?? Math.min(...known) - 2;
  const hi = yMax ?? Math.max(...known) + 2;
  const x = (i: number) => (points.length === 1 ? w / 2 : 14 + (i / (points.length - 1)) * (w - 28));
  const y = (v: number) => h - 18 - ((v - lo) / Math.max(1e-6, hi - lo)) * (h - 32);
  const d = points.flatMap((v, i) => (isFinite(v) ? [`${i && isFinite(points[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`] : [])).join(' ');
  // every nth label, as many as the width fits ("Oct 26Nov 16" ran together on a phone): about 6px a
  // character at 10px and a gap, half as much again as the first and last end at the edges
  const labelW = labels?.length ? Math.max(...labels.map((l) => l.length)) * 6 : 0;
  const every = labels && labels.length > 1 ? Math.max(1, Math.ceil((labelW * 1.5 + 8) / ((w - 28) / (labels.length - 1)))) : 1;
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Trend: ${points.map((v) => (isFinite(v) ? Math.round(v) : 'none')).join(', ')}`}>
        <line x1={0} x2={w} y1={h - 18} y2={h - 18} stroke="var(--line-2)" />
        {refLine !== undefined && <line x1={0} x2={w} y1={y(refLine)} y2={y(refLine)} stroke="var(--line-3)" strokeDasharray="2 4" />}
        {known.length === points.length && <path d={`${d} L${x(points.length - 1)},${h - 18} L${x(0)},${h - 18} Z`} fill={color} opacity={0.08} />}
        <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {points.map(
          (v, i) =>
            isFinite(v) && (
              <g key={i}>
                <circle cx={x(i)} cy={y(v)} r={2.75} fill={color} stroke="var(--raised)" strokeWidth={1.5} />
                {values && points.length <= 12 && (
                  <text x={x(i)} y={y(v) - 8} textAnchor="middle" className="ch-val">
                    {Math.round(v)}
                  </text>
                )}
              </g>
            ),
        )}
        {labels &&
          labels.map((l, i) =>
            i % every === 0 ? (
              // the first and last labels end at the edges rather than running off them
              <text
                key={i}
                x={x(i)}
                y={h - 4}
                textAnchor={labels.length > 1 && i === 0 ? 'start' : labels.length > 1 && i === labels.length - 1 ? 'end' : 'middle'}
                className="ch-axis"
              >
                {l}
              </text>
            ) : null,
          )}
      </svg>
    </div>
  );
}

/**
 * Score margin flow (positive = team A ahead). `periods` are the periods' lengths in game seconds
 * (four quarters, then any overtimes), for the Q1..OT labels and, in older games, the spacing;
 * `periodStarts` are the flow indices where each began, when recorded: dividers sit there.
 */
export function FlowChart({
  flow,
  colorA,
  colorB,
  periods,
  periodStarts,
  height = 110,
}: {
  flow: number[];
  colorA: string;
  colorB: string;
  periods: number[];
  periodStarts?: number[];
  height?: number;
}) {
  const [ref, w] = useWidth();
  const clip = useId().replace(/:/g, '');
  const h = height;
  if (flow.length < 2) return null;
  const max = Math.max(8, ...flow.map((v) => Math.abs(v)));
  const total = periods.reduce((a, p) => a + p, 0);
  // periods sit at their game time, as on the win-probability chart: with recorded starts, each
  // period's points spread evenly across its own stretch of the axis
  const at = periods.map((_, i) => (periods.slice(0, i).reduce((a, p) => a + p, 0) / total) * w);
  const marks = periodStarts?.length === periods.length ? periodStarts.map((i) => Math.min(i, flow.length - 1)) : null;
  const x = (i: number) => {
    if (!marks) return (i / (flow.length - 1)) * w;
    let k = 0;
    while (k + 1 < marks.length && i >= marks[k + 1]) k++;
    const from = marks[k];
    const to = k + 1 < marks.length ? marks[k + 1] : flow.length - 1;
    const end = at[k + 1] ?? w;
    return to > from ? at[k] + ((i - from) / (to - from)) * (end - at[k]) : at[k];
  };
  const y = (v: number) => h / 2 - (v / max) * (h / 2 - 6);
  const d = flow.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const starts = at;
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h + 16}`} width="100%" height={h + 16} role="img" aria-label="Score margin over the game">
        <defs>
          <clipPath id={`${clip}-top`}>
            <rect x="0" y="0" width={w} height={h / 2} />
          </clipPath>
          <clipPath id={`${clip}-bot`}>
            <rect x="0" y={h / 2} width={w} height={h / 2} />
          </clipPath>
        </defs>
        {starts.map((sx, i) => (
          <g key={i}>
            {i > 0 && <line x1={sx} x2={sx} y1={0} y2={h} stroke="var(--line)" />}
            <text x={(sx + (starts[i + 1] ?? w)) / 2} y={h + 13} textAnchor="middle" className="ch-axis">
              {periodLabel(i + 1)}
            </text>
          </g>
        ))}
        <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--line-3)" />
        <path d={`${d} L${w},${h / 2} L0,${h / 2} Z`} fill={colorA} opacity={0.3} clipPath={`url(#${clip}-top)`} />
        <path d={`${d} L${w},${h / 2} L0,${h / 2} Z`} fill={colorB} opacity={0.3} clipPath={`url(#${clip}-bot)`} />
        <path d={d} fill="none" stroke="var(--text-2)" strokeWidth={1.25} strokeLinejoin="round" />
        <text x={4} y={12} className="ch-axis">
          +{max}
        </text>
        <text x={4} y={h - 4} className="ch-axis">
          −{max}
        </text>
      </svg>
    </div>
  );
}

/** One point of a win-probability line: game seconds played, and one team's chance to win (0..1). */
export interface WpChartPoint {
  t: number;
  wp: number;
}

/**
 * A team's win probability over the game: 100% at the top, 50% across the middle, the area above it
 * in that team's colour (`color`) and below it in the other's (`colorOther`), with period dividers
 * at their game time (`periods`: each period's length in seconds, four quarters then any
 * overtimes). `marks` number the biggest swings on the line. A crosshair follows the pointer (or the
 * arrow keys) to the nearest point and `describe` says what was going on there.
 */
export function WinProbChart({
  points,
  periods,
  color,
  colorOther,
  marks = [],
  describe,
  label,
  height = 130,
  bare,
}: {
  points: WpChartPoint[];
  periods: number[];
  color: string;
  colorOther: string;
  /** Points (indices into `points`) to mark, numbered from 1. */
  marks?: number[];
  describe: (i: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
  height?: number;
  /** The shape alone, no percentages: the live game's. */
  bare?: boolean;
}) {
  const [ref, w] = useWidth();
  const clip = useId().replace(/:/g, '');
  const [at, setAt] = useState<number | null>(null);
  const h = height;
  if (points.length < 2) return null;
  const total = Math.max(
    1,
    periods.reduce((a, p) => a + p, 0),
  );
  // room on the left for the 100% / 50% / 0% ticks
  const left = 36;
  const x = (t: number) => left + (Math.min(total, Math.max(0, t)) / total) * (w - left - 4);
  const y = (wp: number) => 6 + (1 - wp) * (h - 12);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.wp).toFixed(1)}`).join(' ');
  const end = x(points[points.length - 1].t);
  const area = `${d} L${end.toFixed(1)},${y(0.5)} L${x(points[0].t).toFixed(1)},${y(0.5)} Z`;
  const starts = periods.map((_, i) => x(periods.slice(0, i).reduce((a, p) => a + p, 0)));
  const nearest = (px: number) => {
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    return best;
  };
  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(nearest(((e.clientX - r.left) / r.width) * w));
  };
  const shown = at !== null && at < points.length ? at : null;
  const tipLeft = shown !== null ? Math.min(Math.max(x(points[shown].t), 110), w - 110) : 0;
  return (
    <div ref={ref} className="ch-wrap">
      <svg
        viewBox={`0 0 ${w} ${h + 16}`}
        width="100%"
        height={h + 16}
        role="img"
        aria-label={label}
        tabIndex={0}
        style={{ touchAction: 'pan-y' }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          setAt((cur) => Math.max(0, Math.min(points.length - 1, (cur ?? points.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
        }}
      >
        <defs>
          <clipPath id={`${clip}-top`}>
            <rect x="0" y="0" width={w} height={y(0.5)} />
          </clipPath>
          <clipPath id={`${clip}-bot`}>
            <rect x="0" y={y(0.5)} width={w} height={h} />
          </clipPath>
        </defs>
        {starts.map((sx, i) => (
          <g key={i}>
            {i > 0 && <line x1={sx} x2={sx} y1={0} y2={h} stroke="var(--line)" />}
            <text x={(sx + (starts[i + 1] ?? w - 4)) / 2} y={h + 13} textAnchor="middle" className="ch-axis">
              {periodLabel(i + 1)}
            </text>
          </g>
        ))}
        {[1, 0].map((v) => (
          <line key={v} x1={left} x2={w} y1={y(v)} y2={y(v)} stroke="var(--line)" />
        ))}
        <line x1={left} x2={w} y1={y(0.5)} y2={y(0.5)} stroke="var(--line-3)" />
        {!bare &&
          [1, 0.5, 0].map((v) => (
            <text key={v} x={left - 5} y={y(v) + 3.5} textAnchor="end" className="ch-axis">
              {Math.round(v * 100)}%
            </text>
          ))}
        <path d={area} fill={color} opacity={0.26} clipPath={`url(#${clip}-top)`} />
        <path d={area} fill={colorOther} opacity={0.26} clipPath={`url(#${clip}-bot)`} />
        <path d={d} fill="none" stroke="var(--text)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {marks.map((i, k) =>
          points[i] ? (
            <g key={i}>
              <circle cx={x(points[i].t)} cy={y(points[i].wp)} r={7.5} fill="var(--accent)" stroke="var(--raised)" strokeWidth={2} />
              <text x={x(points[i].t)} y={y(points[i].wp) + 3.5} textAnchor="middle" className="ch-mark">
                {k + 1}
              </text>
            </g>
          ) : null,
        )}
        {shown !== null && (
          <g pointerEvents="none">
            <line x1={x(points[shown].t)} x2={x(points[shown].t)} y1={0} y2={h} stroke="var(--line-3)" />
            <circle cx={x(points[shown].t)} cy={y(points[shown].wp)} r={4} fill="var(--text)" stroke="var(--raised)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {shown !== null && (
        <div className="ch-tip" style={{ left: tipLeft }} role="status">
          {!bare && <b className="num">{wpText(points[shown].wp)}</b>} <span className="dim2">{describe(shown)}</span>
        </div>
      )}
    </div>
  );
}

/** A missed shot's cross on the shot chart: neutral, so a team's made shots keep its own colour, red ones included. */
const MISS = 'var(--text-dim)';

/** The shot chart's key: each team's made shots in its colour (`made`: label and colour), and the misses. */
export function ShotKey({ made }: { made: { label: string; color: string }[] }) {
  return (
    <div className="shot-key" aria-hidden="true">
      {made.map((m) => (
        <span key={m.label}>
          <i style={{ background: m.color }} /> {m.label}
        </span>
      ))}
      <span>
        <b style={{ color: MISS }}>×</b> Missed
      </span>
    </div>
  );
}

/**
 * Half-court shot chart, with its key (made in `color`, missed as a cross) unless `keyed` is false,
 * for charts that share one key. Coordinates in feet: x -25..25, y 0..47 from the baseline.
 */
export function ShotChart({ shots, color = 'var(--accent)', size = 320, keyed = true }: { shots: ShotRecord[]; color?: string; size?: number; keyed?: boolean }) {
  const W = 50;
  const H = 40;
  const sx = (x: number) => ((x + 25) / W) * size;
  const sy = (y: number) => (y / H) * (size * (H / W));
  const h = size * (H / W);
  const arcR = 23.75;
  const by = 5.25;
  const cornerY = by + Math.sqrt(arcR * arcR - 22 * 22);
  const made = shots.filter((s) => s.made).length;
  return (
    <div className="shot-chart">
      <svg viewBox={`0 0 ${size} ${h}`} style={{ maxWidth: size * 1.4 }} role="img" aria-label={`Shot chart: ${made} of ${shots.length} shots made`}>
        <rect x={0} y={0} width={size} height={h} rx={6} fill="var(--bg-2)" />
        <g stroke="var(--line-3)" strokeWidth={1.1} fill="none">
          <rect x={sx(-8)} y={0} width={sx(8) - sx(-8)} height={sy(19)} />
          <circle cx={sx(0)} cy={sy(19)} r={(6 / W) * size} />
          <circle cx={sx(0)} cy={sy(by)} r={(0.75 / W) * size} />
          <line x1={sx(-3)} x2={sx(3)} y1={sy(4)} y2={sy(4)} />
          <path d={`M${sx(-4)},${sy(by)} A${(4 / W) * size},${(4 / W) * size} 0 0 0 ${sx(4)},${sy(by)}`} />
          <line x1={sx(-22)} x2={sx(-22)} y1={0} y2={sy(cornerY)} />
          <line x1={sx(22)} x2={sx(22)} y1={0} y2={sy(cornerY)} />
          <path d={`M${sx(-22)},${sy(cornerY)} A${(arcR / W) * size},${(arcR / W) * size} 0 0 0 ${sx(22)},${sy(cornerY)}`} />
        </g>
        {shots.map((s, i) =>
          s.made ? (
            <circle key={i} cx={sx(s.x)} cy={sy(s.y)} r={4} fill={color} stroke="var(--bg-2)" strokeWidth={1.25} />
          ) : (
            <g key={i} stroke={MISS} strokeWidth={1.4} strokeLinecap="round" opacity={0.75}>
              <line x1={sx(s.x) - 3} y1={sy(s.y) - 3} x2={sx(s.x) + 3} y2={sy(s.y) + 3} />
              <line x1={sx(s.x) - 3} y1={sy(s.y) + 3} x2={sx(s.x) + 3} y2={sy(s.y) - 3} />
            </g>
          ),
        )}
      </svg>
      {keyed && <ShotKey made={[{ label: 'Made', color }]} />}
    </div>
  );
}

/**
 * Two-sided bar for comparing a value between two teams. The side that wins it has its figure in a
 * pill of its colour, so the winner reads at a glance even where lower is better (`higherBetter`
 * false: turnovers, where the shorter bar wins); `neutral` stats (a style, like the share of threes)
 * favour neither side.
 */
export function CompareBar({
  label,
  a,
  b,
  fmt = (v: number) => v.toFixed(1),
  colorA = 'var(--accent)',
  colorB = 'var(--text-dim)',
  higherBetter = true,
  neutral = false,
}: {
  label: ReactNode;
  a: number;
  b: number;
  fmt?: (v: number) => string;
  colorA?: string;
  colorB?: string;
  higherBetter?: boolean;
  neutral?: boolean;
}) {
  // a figure that isn't a number (a rate with no attempts) reads "—", draws no bar and decides nothing
  const [wa, wb] = [a, b].map((v) => (isFinite(v) ? Math.abs(v) : 0));
  const total = wa + wb || 1;
  const show = (v: number) => (isFinite(v) ? fmt(v) : '—');
  // a tie (as shown) favours neither side
  const tie = neutral || !isFinite(a) || !isFinite(b) || show(a) === show(b);
  const aWins = !tie && (higherBetter ? a > b : a < b);
  const bWins = !tie && !aWins;
  const fig = (v: number, wins: boolean, color: string) => (
    <span className={`num cmp-v${wins ? ' win' : tie ? '' : ' lose'}`} style={{ '--cmp-c': color } as CSSProperties}>
      {show(v)}
      {wins && <span className="sr-only"> (better)</span>}
    </span>
  );
  return (
    <div className="ch-cmp">
      <div className="ch-cmp-top">
        {fig(a, aWins, colorA)}
        <span className="ch-cmp-l">{label}</span>
        {fig(b, bWins, colorB)}
      </div>
      <div className="ch-cmp-bars" aria-hidden="true">
        <i className={aWins || tie ? undefined : 'dim'} style={{ flex: wa / total, background: colorA }} />
        <i className={bWins || tie ? undefined : 'dim'} style={{ flex: wb / total, background: colorB }} />
      </div>
    </div>
  );
}
