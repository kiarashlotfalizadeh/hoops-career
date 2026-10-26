// The league's team tables (standings, power, the forecast): the team stays put on the left while
// the figures scroll sideways on a phone, so every column is a swipe away instead of behind a switch.
// A tablet shows them all.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TeamLogo } from '../components/TeamLogo';
import { useLeague } from '../../state/store';

/**
 * A table: `cols` are the figure columns' widths, `head` their labels after the team's. On a phone
 * the team's column takes the room left by the first `show` figures, so those sit whole beside it and
 * the rest wait a swipe away (a tablet shows them all).
 */
export function TeamTable({ cols, head, children, show = 3, className = '' }: { cols: number[]; head: ReactNode[]; children: ReactNode; show?: number; className?: string }) {
  // the visible figures' widths, their gaps and the row's right padding
  const vis = cols.slice(0, show).reduce((a, w) => a + w + 4, 0) + 12;
  const ref = useRef<HTMLDivElement>(null);
  // a shadow under the team column once the figures have moved under it, a fade where more are to come
  useEffect(() => {
    const el = ref.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    const on = () => {
      el.classList.toggle('scrolled', el.scrollLeft > 2);
      wrap.classList.toggle('fr', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    on();
    el.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      el.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return (
    <div className="lg-tbl-wrap">
      <div ref={ref} className={`card flush lg-tbl ${className}`} style={{ '--cols': cols.map((w) => `${w}px`).join(' '), '--vis': `${vis}px` } as CSSProperties}>
        <div className="lg-tbl-in">
          <div className="lg-tbl-row head" aria-hidden="true">
            <span className="lead">Team</span>
            {head.map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A team's row: its place, mark and name (with marks after it), then its figures. `spoken` reads the figures out (they're hidden from screen readers). */
export function TeamRow({
  to,
  me,
  rank,
  tid,
  name,
  after,
  spoken,
  children,
  className = '',
}: {
  to: string;
  me: boolean;
  rank: ReactNode;
  tid: number;
  name: ReactNode;
  after?: ReactNode;
  spoken: string;
  children: ReactNode;
  className?: string;
}) {
  const abbrev = useLeague().teams[tid]?.abbrev;
  return (
    <Link to={to} className={`lg-tbl-row ${me ? 'me' : ''} ${className}`}>
      <span className="lead">
        <span className="rk">{rank}</span>
        <TeamLogo tid={tid} size={26} decorative />
        {/* (a long name, "Timberwolves", sets condensed rather than lose its end to an ellipsis, and on
            a narrow phone gives way to its abbreviation) */}
        {typeof name === 'string' && name.length > 10 ? (
          <span className="nm long">
            <span className="nm-f">{name}</span>
            <span className="nm-a">{abbrev}</span>
          </span>
        ) : (
          <span className="nm">{name}</span>
        )}
        {after}
        <span className="sr-only">{spoken}</span>
      </span>
      {children}
    </Link>
  );
}

/** A dashed line across the table between two places (the play-in, the lottery), named at its left. */
export function TableCut({ label }: { label: string }) {
  return (
    <div className="lg-tbl-cut" aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}
