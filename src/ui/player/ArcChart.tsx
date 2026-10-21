// A player's career arc: his OVR at the start of each season he has on record (ratingsHistory),
// this season's check-ins after the latest, and his potential as a dashed line ahead of him. One
// series, so no legend box; the key under it names the line, the dot that is now and the dashed
// ceiling. Each point says its value on hover and to a screen reader.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { League, Player } from '../../core/types';
import { seasonTrail } from '../../core/league/devWatch';
import { fmtDate } from '../../core/league/helpers';

interface Pt {
  x: number;
  ovr: number;
  label: string;
  /** A tick on the axis (a season), or a check-in between seasons. */
  tick?: string;
}

function useWidth(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(200, el.clientWidth));
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return [ref, w];
}

/** The arc's points: a season apart, this season's check-ins spaced inside its year. */
export function arcPoints(league: League, p: Player): Pt[] {
  const out: Pt[] = p.ratingsHistory.map((h, i) => ({
    x: i,
    ovr: h.ovr,
    label: `${h.season - 1}-${String(h.season % 100).padStart(2, '0')} start: ${h.ovr}`,
    tick: `'${String(h.season).slice(2)}`,
  }));
  const cur = p.ratingsHistory.findIndex((h) => h.season === league.season);
  if (cur >= 0) {
    // the check-ins this season, a quarter of a year apart, then today if he has moved since
    const trail = seasonTrail(league, p).slice(1);
    trail.forEach((c, i) => out.push({ x: cur + (i + 1) * 0.25, ovr: c.ovr, label: `Check-in, ${fmtDate(league.season, c.day)}: ${c.ovr}` }));
    const last = out[out.length - 1];
    if (last.ovr !== p.ovr) out.push({ x: Math.max(last.x + 0.15, cur + 0.9), ovr: p.ovr, label: `Now: ${p.ovr}` });
  } else if (out.length && out[out.length - 1].ovr !== p.ovr) {
    out.push({ x: out[out.length - 1].x + 0.5, ovr: p.ovr, label: `Now: ${p.ovr}` });
  }
  return out;
}

export function ArcChart({ league, p, height = 150 }: { league: League; p: Player; height?: number }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pts = arcPoints(league, p);
  if (pts.length < 2) return null;
  const showPot = p.pot > p.ovr;
  const lo = Math.min(...pts.map((x) => x.ovr)) - 3;
  const hi = Math.max(showPot ? p.pot : 0, ...pts.map((x) => x.ovr)) + 3;
  const maxX = pts[pts.length - 1].x + (showPot ? 0.8 : 0.2);
  const padL = 26;
  const padR = 10;
  const h = height;
  const x = (v: number) => padL + (v / Math.max(0.5, maxX)) * (w - padL - padR);
  const y = (v: number) => h - 20 - ((v - lo) / Math.max(1, hi - lo)) * (h - 34);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.x).toFixed(1)},${y(q.ovr).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  // two or three gridlines, on round OVR values
  const step = hi - lo > 24 ? 10 : 5;
  const grid: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  // the season ticks, thinned to what the width fits
  const ticks = pts.filter((q) => q.tick);
  const every = Math.max(1, Math.ceil((ticks.length * 30) / (w - padL - padR)));
  const hv = hover !== null ? pts[hover] : null;
  return (
    <div ref={ref} className="dv-arc">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Career arc: ${pts.map((q) => q.label).join('; ')}${showPot ? `; potential ${p.pot}` : ''}`}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-dim)">
              {v}
            </text>
          </g>
        ))}
        {showPot && (
          <>
            <line x1={x(last.x)} x2={w - padR} y1={y(p.pot)} y2={y(p.pot)} stroke="var(--tier-star)" strokeWidth={2} strokeDasharray="5 4" />
            <line x1={x(last.x)} x2={x(last.x)} y1={y(last.ovr)} y2={y(p.pot)} stroke="var(--tier-star)" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
            <text x={w - padR} y={y(p.pot) - 6} textAnchor="end" fontSize="10.5" fontWeight={750} fill="var(--text-2)">
              POT {p.pot}
            </text>
          </>
        )}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((q, i) => {
          const isLast = i === pts.length - 1;
          return (
            <g key={i}>
              <circle
                cx={x(q.x)}
                cy={y(q.ovr)}
                r={isLast ? 5 : q.tick ? 4 : 3}
                fill={isLast ? 'var(--bg)' : 'var(--accent)'}
                stroke={isLast ? 'var(--accent)' : 'var(--raised)'}
                strokeWidth={2}
              />
              {/* a hit target bigger than the mark */}
              <circle
                cx={x(q.x)}
                cy={y(q.ovr)}
                r={14}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((v) => (v === i ? null : v))}
                onClick={() => setHover((v) => (v === i ? null : i))}
              >
                <title>{q.label}</title>
              </circle>
            </g>
          );
        })}
        <text x={x(last.x)} y={y(last.ovr) - 10} textAnchor="middle" fontSize="11" fontWeight={800} fill="var(--text)">
          {last.ovr}
        </text>
        {ticks.map((q, i) =>
          i % every === 0 || i === ticks.length - 1 ? (
            <text key={q.x} x={x(q.x)} y={h - 4} textAnchor="middle" fontSize="10" fill="var(--text-dim)">
              {q.tick}
            </text>
          ) : null,
        )}
        {hv && (
          <g pointerEvents="none">
            <rect
              x={Math.min(w - padR - 150, Math.max(padL, x(hv.x) - 75))}
              y={Math.max(0, y(hv.ovr) - 40)}
              width={150}
              height={22}
              rx={6}
              fill="var(--surface-2)"
              stroke="var(--line-2)"
            />
            <text x={Math.min(w - padR - 75, Math.max(padL + 75, x(hv.x)))} y={Math.max(0, y(hv.ovr) - 40) + 15} textAnchor="middle" fontSize="11" fill="var(--text)">
              {hv.label}
            </text>
          </g>
        )}
      </svg>
      <div className="dv-arc-key">
        <span>
          <i aria-hidden="true" />
          OVR at the start of each season{pts.some((q) => !q.tick) ? ', then this season’s check-ins' : ''}
        </span>
        {showPot && (
          <span>
            <i className="pot" aria-hidden="true" />
            Potential
          </span>
        )}
      </div>
    </div>
  );
}
