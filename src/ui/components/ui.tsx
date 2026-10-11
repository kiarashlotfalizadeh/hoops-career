import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, HelpCircle, X } from 'lucide-react';
import type { Player } from '../../core/types';
import { ovrColor } from '../../core/ratings';
import { FRANCHISES } from '../../core/teams';

export function Card({ title, right, children, className = '', onClick, accent }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string; onClick?: () => void; accent?: boolean }) {
  return (
    <section
      className={`card ${accent ? 'accent' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? activateOnKey(onClick) : undefined}
    >
      {(title || right) && (
        <div className="card-h">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Enter/Space activation for clickable non-button elements (rows, cards). */
export function activateOnKey(fn: () => void) {
  return (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

export function Ovr({ v, size = '' }: { v: number; size?: '' | 'sm' | 'lg' }) {
  return (
    <span className={`ovr ${size}`} style={{ background: ovrColor(v) }}>
      {Math.round(v)}
    </span>
  );
}

export function Avatar({ p, size = '' }: { p: Pick<Player, 'firstName' | 'lastName' | 'tid' | 'jersey'>; size?: '' | 'lg' }) {
  const colors = p.tid >= 0 ? FRANCHISES[p.tid]?.colors : undefined;
  const c1 = colors?.[0] ?? '#334155';
  const c2 = colors?.[1] ?? '#64748b';
  const initials = `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`;
  return (
    <div className={`avatar ${size}`} style={{ background: `linear-gradient(140deg, ${c1}, ${shade(c1, -0.35)})`, boxShadow: `inset 0 0 0 2px ${c2}55` }}>
      {initials}
      {p.jersey && <span className="jn">#{p.jersey}</span>}
    </div>
  );
}

export function shade(hex: string, amt: number) {
  const h = hex.replace('#', '');
  const n = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * (1 + amt))));
  return `#${[n(0), n(2), n(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // when the options overflow a narrow phone, keep the selected one in view
  useEffect(() => {
    const seg = ref.current;
    const btn = seg?.querySelector<HTMLElement>('button.on');
    if (!seg || !btn || seg.scrollWidth <= seg.clientWidth) return;
    seg.scrollTo({ left: Math.max(0, btn.offsetLeft - (seg.clientWidth - btn.offsetWidth) / 2), behavior: 'smooth' });
  }, [value]);
  return (
    <div className="seg" role="tablist" ref={ref}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o.id)} className={`chip ${value === o.id ? 'on' : ''}`} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, help }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode }) {
  return (
    <label className="row between" style={{ gap: 12, cursor: 'pointer' }}>
      <div className="grow">
        <div style={{ fontWeight: 650 }}>{label}</div>
        {help && <div className="small dim">{help}</div>}
      </div>
      <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />
    </label>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, left, right, help, format, disabled }: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; left?: string; right?: string; help?: ReactNode; format?: (v: number) => string; disabled?: boolean }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div className="slider-top">
        <span className="slider-label">{label}</span>
        <span className="slider-val num">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--fill' as string]: `${fill}%` }} aria-label={typeof label === 'string' ? label : undefined} />
      {(left || right) && (
        <div className="slider-ends">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
      {help && <div className="small dim">{help}</div>}
    </div>
  );
}

export function Bar({ value, max = 100, color, height = 6 }: { value: number; max?: number; color?: string; height?: number }) {
  return (
    <div className="bar" style={{ height }}>
      <div style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}

let openSheets = 0;

/**
 * Bottom sheet on phones, centred dialog on tablets. Focus moves in and is restored on close,
 * Tab stays inside, Escape / the close button / a backdrop tap / a downward swipe dismiss it,
 * and the page behind doesn't scroll.
 */
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    openSheets++;
    document.body.classList.add('sheet-open');
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (--openSheets <= 0) {
        openSheets = 0;
        document.body.classList.remove('sheet-open');
      }
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);
  if (!open) return null;
  // swipe down from the top of the sheet to dismiss
  const onTouchStart = (e: React.TouchEvent) => {
    start.current = (ref.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current === null) return;
    setDrag(Math.max(0, e.touches[0].clientY - start.current));
  };
  const onTouchEnd = () => {
    if (drag > 90) onClose();
    else setDrag(0);
    start.current = null;
  };
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-grip" />
        <div className={`sheet-head ${title ? '' : 'bare'}`}>
          {title ? <h2 id={titleId}>{title}</h2> : <span />}
          <button className="iconbtn sheet-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

/** Tap-to-explain: the core of progressive disclosure. */
export function Help({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="help-btn" aria-label={`Explain ${title}`} onClick={(e) => (e.stopPropagation(), setOpen(true))}>
        <HelpCircle size={14} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="col" style={{ gap: 10, color: 'var(--text-2)' }}>
          {children}
        </div>
        <button className="btn block" style={{ marginTop: 16 }} onClick={() => setOpen(false)}>
          Got it
        </button>
      </Sheet>
    </>
  );
}

export function PageHeader({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="row" style={{ gap: 8, minHeight: 44 }}>
      {back && (
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="grow">
        <h1 style={{ fontSize: 26, textTransform: 'uppercase' }}>{title}</h1>
        {sub && <div className="small dim">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ k, v, sub, color }: { k: ReactNode; v: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="kpi">
      <span className="k">{k}</span>
      <span className="v" style={{ color }}>
        {v}
      </span>
      {sub && <span className="tiny dim">{sub}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export interface Col<T> {
  key: string;
  label: string;
  get: (r: T) => number | string;
  fmt?: (v: number | string, r: T) => ReactNode;
  left?: boolean;
  sticky?: boolean;
  width?: number;
  help?: string;
}

/** Sortable table. `limit` renders only the first rows of the sorted list, for long tables that page with "Show more". */
export function StatTable<T>({ rows, cols, initialSort, rowKey, onRow, highlight, maxHeight, limit }: { rows: T[]; cols: Col<T>[]; initialSort?: string; rowKey: (r: T) => string | number; onRow?: (r: T) => void; highlight?: (r: T) => boolean; maxHeight?: number; limit?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ? { key: initialSort, dir: -1 } : null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
  }, [rows, cols, sort]);
  return (
    <div className="tablewrap" style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      <table className="stats">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`${c.left ? 'l' : ''} ${c.sticky ? 'sticky' : ''} ${sort?.key === c.key ? 'sorted' : ''}`}
                style={{ minWidth: c.width }}
                title={c.help}
                aria-sort={sort?.key === c.key ? (sort.dir === -1 ? 'descending' : 'ascending') : undefined}
                onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.left ? 1 : -1 }))}
              >
                <button type="button" className="th-sort" aria-label={`Sort by ${c.help ?? c.label}`} onClick={(e) => e.preventDefault()}>
                  {c.label}
                  {sort?.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(limit ? sorted.slice(0, limit) : sorted).map((r) => (
            <tr
              key={rowKey(r)}
              className={highlight?.(r) ? 'me' : ''}
              onClick={onRow ? () => onRow(r) : undefined}
              tabIndex={onRow ? 0 : undefined}
              onKeyDown={onRow ? activateOnKey(() => onRow(r)) : undefined}
              style={{ cursor: onRow ? 'pointer' : undefined }}
            >
              {cols.map((c) => {
                const v = c.get(r);
                return (
                  <td key={c.key} className={`${c.left ? 'l' : ''} ${c.sticky ? 'sticky' : ''}`}>
                    {c.fmt ? c.fmt(v, r) : typeof v === 'number' ? fmtNum(v) : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function fmtNum(v: number, d = 1) {
  if (!isFinite(v)) return '-';
  return Number.isInteger(v) ? String(v) : v.toFixed(d);
}

export const pct = (v: number, d = 1) => (isFinite(v) ? `${(v * 100).toFixed(d)}` : '-');

export function Spinner() {
  return <div className="spinner" />;
}

export function Tag({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info' }) {
  return <span className={`tag ${tone ?? ''}`}>{children}</span>;
}
