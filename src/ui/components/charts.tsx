import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ShotRecord } from '../../core/types';
import { periodLabel } from '../stats';

/** Track an element's width so charts draw at their real size instead of a letterboxed 320px. */
function useWidth(fallback = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(200, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function LineChart({
  points,
  height = 120,
  color = 'var(--accent)',
  yMin,
  yMax,
  labels,
  refLine,
}: {
  points: number[];
  height?: number;
  color?: string;
  yMin?: number;
  yMax?: number;
  labels?: string[];
  refLine?: number;
}) {
  const [ref, w] = useWidth();
  const h = height;
  if (points.length === 0) return null;
  const lo = yMin ?? Math.min(...points) - 2;
  const hi = yMax ?? Math.max(...points) + 2;
  const x = (i: number) => (points.length === 1 ? w / 2 : 14 + (i / (points.length - 1)) * (w - 28));
  const y = (v: number) => h - 18 - ((v - lo) / Math.max(1e-6, hi - lo)) * (h - 32);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Trend: ${points.map((v) => Math.round(v)).join(', ')}`}>
        {refLine !== undefined && <line x1={0} x2={w} y1={y(refLine)} y2={y(refLine)} stroke="var(--line-2)" strokeDasharray="4 4" />}
        <path d={`${d} L${x(points.length - 1)},${h - 18} L${x(0)},${h - 18} Z`} fill={color} opacity={0.12} />
        <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={3.5} fill={color} />
            {points.length <= 12 && (
              <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="Barlow Condensed">
                {Math.round(v)}
              </text>
            )}
          </g>
        ))}
        {labels &&
          labels.map((l, i) =>
            labels.length <= 12 || i % Math.ceil(labels.length / 8) === 0 ? (
              <text key={i} x={x(i)} y={h - 4} textAnchor="middle" fontSize="10" fill="var(--text-dim)">
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
  const x = (i: number) => (i / (flow.length - 1)) * w;
  const y = (v: number) => h / 2 - (v / max) * (h / 2 - 6);
  const d = flow.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const total = periods.reduce((a, p) => a + p, 0);
  const starts =
    periodStarts?.length === periods.length
      ? periodStarts.map((i) => x(Math.min(i, flow.length - 1)))
      : periods.map((_, i) => (periods.slice(0, i).reduce((a, p) => a + p, 0) / total) * w);
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
            <text x={(sx + (starts[i + 1] ?? w)) / 2} y={h + 12} textAnchor="middle" fontSize="10" fill="var(--text-dim)">
              {periodLabel(i + 1)}
            </text>
          </g>
        ))}
        <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--line-2)" />
        <path d={`${d} L${w},${h / 2} L0,${h / 2} Z`} fill={colorA} opacity={0.35} clipPath={`url(#${clip}-top)`} />
        <path d={`${d} L${w},${h / 2} L0,${h / 2} Z`} fill={colorB} opacity={0.35} clipPath={`url(#${clip}-bot)`} />
        <path d={d} fill="none" stroke="var(--text-2)" strokeWidth={1.5} />
        <text x={4} y={12} fontSize="10" fill="var(--text-dim)">
          +{max}
        </text>
        <text x={4} y={h - 4} fontSize="10" fill="var(--text-dim)">
          -{max}
        </text>
      </svg>
    </div>
  );
}

/** Half-court shot chart. Coordinates in feet: x -25..25, y 0..47 from the baseline. */
export function ShotChart({ shots, color = 'var(--accent)', size = 320 }: { shots: ShotRecord[]; color?: string; size?: number }) {
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
    <svg
      viewBox={`0 0 ${size} ${h}`}
      width="100%"
      style={{ maxWidth: size * 1.4, display: 'block', margin: '0 auto' }}
      role="img"
      aria-label={`Shot chart: ${made} of ${shots.length} shots made`}
    >
      <rect x={0} y={0} width={size} height={h} rx={8} fill="#1a140f" />
      <g stroke="rgba(255,255,255,0.22)" strokeWidth={1.4} fill="none">
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
          <circle key={i} cx={sx(s.x)} cy={sy(s.y)} r={4.2} fill={color} stroke="#0b0f15" strokeWidth={1} opacity={0.95} />
        ) : (
          <g key={i} stroke="#ff8a8a" strokeWidth={1.6} opacity={0.8}>
            <line x1={sx(s.x) - 3.2} y1={sy(s.y) - 3.2} x2={sx(s.x) + 3.2} y2={sy(s.y) + 3.2} />
            <line x1={sx(s.x) - 3.2} y1={sy(s.y) + 3.2} x2={sx(s.x) + 3.2} y2={sy(s.y) - 3.2} />
          </g>
        ),
      )}
    </svg>
  );
}

/** Two-sided bar for comparing a value between two teams. `neutral` stats (a style, like the share of threes) favour neither side. */
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
  label: string;
  a: number;
  b: number;
  fmt?: (v: number) => string;
  colorA?: string;
  colorB?: string;
  higherBetter?: boolean;
  neutral?: boolean;
}) {
  const total = Math.abs(a) + Math.abs(b) || 1;
  // a tie (as shown) favours neither side
  const tie = neutral || fmt(a) === fmt(b);
  const aWins = !tie && (higherBetter ? a > b : a < b);
  const bWins = !tie && !aWins;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between small">
        <span className={`num ${aWins ? 'bold' : tie ? '' : 'dim2'}`}>{fmt(a)}</span>
        <span className="tiny dim upper">{label}</span>
        <span className={`num ${bWins ? 'bold' : tie ? '' : 'dim2'}`}>{fmt(b)}</span>
      </div>
      <div className="row" style={{ gap: 3 }}>
        <div style={{ flex: Math.abs(a) / total, height: 6, borderRadius: 3, background: colorA, opacity: aWins || tie ? 1 : 0.45 }} />
        <div style={{ flex: Math.abs(b) / total, height: 6, borderRadius: 3, background: colorB, opacity: bWins || tie ? 1 : 0.45 }} />
      </div>
    </div>
  );
}
