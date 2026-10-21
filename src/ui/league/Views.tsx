// The one control under a League section's tabs: its views as a row of chips (a radio group, so the
// arrow keys move the choice), scrolling sideways when they run past a phone's edge, with an optional
// control at its right (a season, Help).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Sheet, scrollBehavior } from '../components/ui';

export function ViewChips<T extends string>({
  value,
  options,
  onChange,
  label,
  right,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  right?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the chosen chip stays in view on a narrow phone
  useEffect(() => {
    const row = ref.current;
    const btn = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !btn || row.scrollWidth <= row.clientWidth) return;
    const left = btn.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + btn.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, left - 24), behavior: scrollBehavior() });
  }, [value]);
  // an edge with more chips past it fades out
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const update = () => {
      row.classList.toggle('fl', row.scrollLeft > 4);
      row.classList.toggle('fr', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    };
    update();
    row.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [options.length]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : step ? (i + step + options.length) % options.length : -1;
    if (j < 0) return;
    e.preventDefault();
    onChange(options[j].id);
    ref.current?.querySelectorAll<HTMLElement>('button')[j]?.focus();
  };
  return (
    <div className="lg-views">
      <div className="lg-views-row" role="radiogroup" aria-label={label} ref={ref}>
        {options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            tabIndex={i === current ? 0 : -1}
            className={`chip ${value === o.id ? 'on' : ''}`}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {right && <div className="lg-views-r">{right}</div>}
    </div>
  );
}

/** A quiet line under a table or a list: its key or what it counts, and the Help for the rest. */
export function Foot({ children, help }: { children?: ReactNode; help?: ReactNode }) {
  return (
    <div className="lg-foot">
      <span className="lg-foot-t">{children}</span>
      {help}
    </div>
  );
}

/**
 * What a view reads, as one quiet line over it ("2026-27 · Regular season ⌄", "League records ·
 * Playoffs ⌄") that opens its switches in a sheet: the view keeps the page, the switches a tap away.
 */
export function PickerLine({ parts, title, label, children }: { parts: ReactNode[]; title: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="lg-pickline" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}>
        {parts.map((p, i) => (
          <span key={i}>{p}</span>
        ))}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="col lg-filter-body">{children}</div>
        <button className="btn primary block lg-filter-done" onClick={() => setOpen(false)}>
          Done
        </button>
      </Sheet>
    </>
  );
}
