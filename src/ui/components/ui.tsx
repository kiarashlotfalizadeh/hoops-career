import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, HelpCircle, X } from 'lucide-react';
import type { Player } from '../../core/types';
import { ovrColor, ovrTier } from '../../core/ratings';
import { LEVEL_VALUES, levelIndex, type LevelNames } from '../../core/sim/tactics';
import { FRANCHISES } from '../../core/teams';
import { keepFigures } from '../../core/format';
import { useBack } from '../nav';
import { jerseyKit } from '../teamColors';
import { useTeamLook } from './TeamLogo';

export function Card({
  title,
  right,
  children,
  className = '',
  onClick,
  accent,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  accent?: boolean;
}) {
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
    // the colour of the figure it shows: an 88.6 average reads 89, an elite gold
    // (its tier's class sets the badge's weight, so a tier reads without its hue: solid, washed, ringed, plain)
    <span className={`ovr ${size} t-${ovrTier(Math.round(v)).tone}`} style={{ ['--tier' as string]: ovrColor(Math.round(v)) }}>
      {Math.round(v)}
    </span>
  );
}

/** The jersey's outline, its neckline and armholes (a 40-unit square). */
const JERSEY_BODY = 'M11 3.5 L15.5 3.5 Q20 10.5 24.5 3.5 L29 3.5 Q29.6 10.6 35 13.4 L35 37.4 Q20 39 5 37.4 L5 13.4 Q10.4 10.6 11 3.5 Z';
const JERSEY_TRIM = 'M15.5 3.5 Q20 10.5 24.5 3.5 M29 3.5 Q29.6 10.6 35 13.4 M5 13.4 Q10.4 10.6 11 3.5';
/** A free agent's or a prospect's: no team, so a neutral kit. */
const NO_TEAM: [string, string, string] = ['#2a3441', '#8a94a4', '#c4cfdc'];

/** A player's badge: a jersey in his team's colours with his number (his initials when he has none). */
export function Avatar({ p, size = '' }: { p: Pick<Player, 'firstName' | 'lastName' | 'tid' | 'jersey'>; size?: '' | 'lg' }) {
  const look = useTeamLook(p.tid);
  const colors = p.tid >= 0 ? (look.colors ?? FRANCHISES[p.tid]?.colors ?? NO_TEAM) : NO_TEAM;
  const kit = jerseyKit(colors);
  const label = p.jersey || `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`;
  // three characters ("00" fits at the usual width) squeeze into the narrowest cut
  const long = label.length > 2;
  return (
    // a badge beside the name it stands for: nothing more for a screen reader to read
    <div className={`avatar ${size}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <path d={JERSEY_BODY} fill={kit.fill} stroke="rgba(18,18,18,0.16)" strokeWidth="0.8" />
        <path d={JERSEY_TRIM} fill="none" stroke={kit.trim} strokeWidth="2.2" strokeLinecap="round" />
        <text
          x="20"
          y="30"
          textAnchor="middle"
          fontFamily="Archivo Variable, sans-serif"
          fontWeight="760"
          fontSize={p.jersey ? (label.length > 1 ? 15 : 16) : 12}
          fill={kit.num}
          style={{ fontStretch: long ? '62%' : '70%' }}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

export function shade(hex: string, amt: number) {
  const h = hex.replace('#', '');
  const n = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * (1 + amt))));
  return `#${[n(0), n(2), n(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Script scrolls ignore the CSS reduced-motion rule: smooth only when the device allows motion. */
export const scrollBehavior = (): ScrollBehavior => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** One-of-several switch: a radio group, so arrow keys move the choice and Tab leaves it. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  tabs,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label?: string;
  disabled?: boolean;
  /** A screen's own sections: underlined tabs on the page instead of a boxed switch. */
  tabs?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // when the options overflow a narrow phone, keep the selected one in view
  useEffect(() => {
    const seg = ref.current;
    const btn = seg?.querySelector<HTMLElement>('button.on');
    if (!seg || !btn || seg.scrollWidth <= seg.clientWidth) return;
    seg.scrollTo({ left: Math.max(0, btn.offsetLeft - (seg.clientWidth - btn.offsetWidth) / 2), behavior: scrollBehavior() });
  }, [value]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : step ? (i + step + options.length) % options.length : -1;
    if (j < 0) return;
    e.preventDefault();
    onChange(options[j].id);
    ref.current?.querySelectorAll<HTMLElement>('button')[j]?.focus();
  };
  return (
    <div className={`seg ${tabs ? 'tabs' : ''}`} role="radiogroup" aria-label={label} ref={ref}>
      {options.map((o, i) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          tabIndex={i === current ? 0 : -1}
          disabled={disabled}
          className={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One-of-several chips (toggle buttons); `label` names the group for screen readers. */
export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="chips" role={label ? 'group' : undefined} aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} className={`chip ${value === o.id ? 'on' : ''}`} aria-pressed={value === o.id} disabled={disabled} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The switch is named by `label` alone; `help` is its description (screen readers read it after the state). */
/**
 * A labelled switch. Its help is one tap away behind a "?" (and read out with the switch), never a
 * paragraph under every toggle.
 */
export function Toggle({ on, onChange, label, help, disabled }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="row between" style={{ gap: 12, cursor: 'pointer' }}>
      <div className="grow row" style={{ gap: 6 }}>
        <div id={`${id}l`} style={{ fontWeight: 640 }}>
          {label}
        </div>
        {help && (
          <>
            <Help title={typeof label === 'string' ? label : 'About this setting'}>{help}</Help>
            <span id={`${id}h`} className="sr-only">
              {help}
            </span>
          </>
        )}
      </div>
      <button
        className={`toggle ${on ? 'on' : ''}`}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        aria-labelledby={`${id}l`}
        aria-describedby={help ? `${id}h` : undefined}
        onClick={() => onChange(!on)}
      />
    </label>
  );
}

/** `name` is what screen readers call the slider when `label` isn't plain text. */
export function Slider({
  label,
  name,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  left,
  right,
  help,
  format,
  disabled,
}: {
  label: ReactNode;
  name?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  left?: string;
  right?: string;
  help?: ReactNode;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div className="slider-top">
        <span className="slider-label">{label}</span>
        <span className="slider-val num">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
        aria-label={name ?? (typeof label === 'string' ? label : undefined)}
        aria-valuetext={format ? format(value) : undefined}
      />
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

/**
 * A 0-100 tactic as five named settings, low to high, in place of a slider. The setting nearest the
 * value is the one marked (presets and the staff's adjustments can land between them); picking one
 * sets its value. The settings below the chosen one are tinted, like a slider's fill. `mark`: a
 * reference value (the playbook's own setting) whose level carries a dot.
 */
export function Levels({
  label,
  value,
  names,
  onChange,
  help,
  disabled,
  mark,
}: {
  label: string;
  value: number;
  names: LevelNames;
  onChange: (v: number) => void;
  help?: ReactNode;
  disabled?: boolean;
  mark?: number;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cur = levelIndex(value);
  const marked = mark === undefined ? -1 : levelIndex(mark);
  // a radio group: arrows move along the scale (no wrapping from one end to the other), Home and End jump to its ends
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? names.length - 1 : step ? Math.min(names.length - 1, Math.max(0, i + step)) : -1;
    if (j < 0) return;
    e.preventDefault();
    if (j !== cur) onChange(LEVEL_VALUES[j]);
    ref.current?.querySelectorAll<HTMLElement>('button')[j]?.focus();
  };
  return (
    <div className="levels" style={{ opacity: disabled ? 0.5 : 1 }}>
      <span id={`${id}l`} className="slider-label">
        {label}
      </span>
      <div className="levels-row" role="radiogroup" aria-labelledby={`${id}l`} aria-describedby={help ? `${id}h` : undefined} ref={ref}>
        {names.map((n, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === cur}
            tabIndex={i === cur ? 0 : -1}
            disabled={disabled}
            className={[i === cur ? 'on' : i < cur ? 'below' : '', i === marked ? 'mark' : ''].filter(Boolean).join(' ') || undefined}
            // the setting already marked stays as it is: a preset's or the staff's value between levels isn't snapped to the level's
            onClick={() => i !== cur && onChange(LEVEL_VALUES[i])}
            onKeyDown={(e) => onKey(e, i)}
          >
            {n}
          </button>
        ))}
      </div>
      {help && (
        <div id={`${id}h`} className="small dim">
          {help}
        </div>
      )}
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

/** How long a closing sheet takes to slide out (overlays.css `.sheet.closing`). */
const SHEET_OUT_MS = 180;

/** The open sheets, the top one last: Escape and Tab are its alone (a Help sheet over a contract sheet). */
const openSheets: object[] = [];

// ---------------------------------------------------------------- Back closes the top sheet
// Each open sheet holds a history entry of its own: the same URL and router key, marked with the
// sheet's number (numbers rise as sheets open, so a sheet over another has the higher one). Browser
// and Android Back take that entry, and the sheets above the entry Back lands on close. A sheet closed
// any other way takes its entry back; one closed by going to another screen leaves its entry under
// that screen, and Back steps past it later. (The native shell's Back taps the top backdrop: the same
// close, the same entry taken back.)
let sheetSeq = 0;
/** Open sheets by number: how to close one, and whether its entry is in the history yet. */
const sheetEntries = new Map<number, { close: () => void; pushed: boolean }>();
/** Our own history.back()s not yet landed: an entry pushed meanwhile could be the one they take. */
let sheetBacks = 0;
const sheetMark = () => (window.history.state as { hcSheet?: number } | null)?.hcSheet ?? 0;
const sheetBack = () => {
  sheetBacks++;
  window.history.back();
};
function pushSheetEntries() {
  for (const [n, e] of sheetEntries)
    if (!e.pushed) {
      e.pushed = true;
      window.history.pushState({ ...(window.history.state as object | null), hcSheet: n }, '');
    }
}
function onSheetPop() {
  if (sheetBacks) sheetBacks--;
  const at = sheetMark();
  for (const [n, e] of sheetEntries) if (e.pushed && n > at) e.close();
  // an entry left by a sheet that has closed since: step past it
  if (at && !sheetEntries.has(at)) return sheetBack();
  if (!sheetBacks) pushSheetEntries();
}
let sheetPopOn = false;
function openSheetEntry(close: () => void): number {
  if (!sheetPopOn) {
    sheetPopOn = true;
    window.addEventListener('popstate', onSheetPop);
  }
  const n = ++sheetSeq;
  sheetEntries.set(n, { close, pushed: false });
  if (!sheetBacks) pushSheetEntries();
  return n;
}
function closeSheetEntry(n: number) {
  sheetEntries.delete(n);
  if (sheetMark() === n) sheetBack();
}

/** A sheet closes when the screen under it changes (a link inside it, a shortcut). */
function ClosesOnNavigate({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const at = useRef(pathname);
  useEffect(() => {
    if (pathname !== at.current) onClose();
  }, [pathname, onClose]);
  return null;
}

/**
 * Bottom sheet on phones, centred dialog on tablets. Focus moves in and is restored on close,
 * Tab stays inside, Escape / the close button / a backdrop tap / a downward swipe dismiss it,
 * and the page behind doesn't scroll.
 */
export function Sheet({
  open,
  onClose,
  children,
  title,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  /** What screen readers call a sheet without a title. */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [drag, setDrag] = useState(0);
  // closing plays a short slide out: the sheet stays on the page that long, showing what it showed
  // when it was last open (whatever it showed may be gone by then: a deleted league's name)
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const kept = useRef<{ children: ReactNode; title: ReactNode }>({ children, title });
  if (open) kept.current = { children, title };
  if (open && (!mounted || closing)) {
    setMounted(true);
    setClosing(false);
  } else if (!open && mounted && !closing) setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(
      () => {
        setMounted(false);
        setClosing(false);
        setDrag(0);
      },
      reducedMotion() ? 0 : SHEET_OUT_MS,
    );
    return () => clearTimeout(t);
  }, [closing]);
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const routed = useInRouterContext();
  const closeNow = useMemo(() => () => closeRef.current(), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const me = {};
    openSheets.push(me);
    const entry = openSheetEntry(() => closeRef.current());
    document.body.classList.add('sheet-open');
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== me) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab' || !ref.current) return;
      // what Tab can reach: not disabled controls, nor a radio group's unselected options (tabindex -1)
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')].filter(
        (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.hidden,
      );
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
      openSheets.splice(openSheets.indexOf(me), 1);
      closeSheetEntry(entry);
      if (!openSheets.length) document.body.classList.remove('sheet-open');
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!mounted) return null;
  const shown = open ? { children, title } : kept.current;
  // swipe down from the top of the sheet to dismiss; sliders, tables and scrollers keep their own drags,
  // and a sheet opened from this one (its touches bubble up the React tree) drags itself, not this one
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const mine = !!ref.current?.contains(e.target as Node);
    start.current = mine && (ref.current?.scrollTop ?? 0) <= 0 && !ownsDrag(e.target as Element, ref.current) ? { x: t.clientX, y: t.clientY, locked: false } : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.locked) {
      if (Math.hypot(dx, dy) < 8) return;
      // decide once, on the first real move: only a mostly vertical, downward drag dismisses
      if (dy <= Math.abs(dx) + 6) {
        start.current = null;
        return;
      }
      s.locked = true;
    }
    setDrag(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    // (the closing slide carries on from where the finger let go)
    if (drag > 90) onClose();
    else setDrag(0);
    start.current = null;
  };
  const dragging = drag > 0 && !closing && !!start.current;
  return createPortal(
    <>
      <div className={`sheet-backdrop ${closing ? 'closing' : ''}`} onClick={closing ? undefined : onClose} />
      <div
        ref={ref}
        className={`sheet ${closing ? 'closing' : ''}`}
        role="dialog"
        aria-modal={closing ? undefined : true}
        aria-hidden={closing || undefined}
        aria-labelledby={shown.title ? titleId : undefined}
        aria-label={shown.title ? undefined : (label ?? 'Dialog')}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: dragging ? 'none' : undefined } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className={`sheet-head ${shown.title ? '' : 'bare'}`}>
          {shown.title ? <h2 id={titleId}>{shown.title}</h2> : <span />}
          <button className="iconbtn sheet-close" onClick={onClose} aria-label="Close" tabIndex={closing ? -1 : undefined}>
            <X size={20} />
          </button>
        </div>
        {shown.children}
      </div>
      {open && routed && <ClosesOnNavigate onClose={closeNow} />}
    </>,
    document.body,
  );
}

/** A touch that starts on a control or a sideways scroller belongs to it, not to swipe-to-close. */
function ownsDrag(target: Element, sheet: Element | null): boolean {
  if (target.closest('input, textarea, select, .tablewrap, .hscroll, .seg, .chips')) return true;
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
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
        <div className="col help-body" style={{ gap: 10, color: 'var(--text-2)' }}>
          {children}
        </div>
        <button className="btn block" style={{ marginTop: 16 }} onClick={() => setOpen(false)}>
          Got it
        </button>
      </Sheet>
    </>
  );
}

/** `backTo` is where Back goes when there is no in-app page behind this one (a deep link or a reload). */
export function PageHeader({ title, sub, back, backTo = '/', right }: { title: ReactNode; sub?: ReactNode; back?: boolean; backTo?: string; right?: ReactNode }) {
  const goBack = useBack(backTo);
  return (
    <div className="ph">
      {back && (
        <button className="iconbtn back" onClick={goBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="grow">
        {/* (with controls beside it on a narrow phone, "League" a size down rather than "Leag / ue") */}
        <Fit as="h1" min={20}>
          {title}
        </Fit>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/** A section without a box: an overline heading, an optional link or control on its right, then its content. */
export function Section({ title, right, children, className = '' }: { title: ReactNode; right?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`sec ${className}`}>
      <div className="sec-h">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
        {right}
      </div>
      {children}
    </section>
  );
}

/** The rest of an explanation, one tap away under its short line. */
export function More({ label = 'More', children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <details className="more">
      <summary>
        {label} <ChevronDown size={14} aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

/**
 * Text on the screen with its figures kept whole ("48-5" never breaks at the hyphen, nor does a
 * figure's compound: "3-game", "7-footer"); anything else as is.
 */
export const keep = (n: ReactNode): ReactNode => (typeof n === 'string' ? keepFigures(n).replace(/(\d)-(?=\p{L})/gu, '$1-\u2060') : n);

/**
 * A headline's words, each a run no line may break inside, with what parts them: a space, or "" after
 * a hyphen between letters ("Gilgeous-" / "Alexander"; never inside a figure, "112-98", nor at a
 * no-break space).
 */
const fitRuns = (s: string) =>
  s
    .trim()
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/(\p{L}-)(?=\p{L})/gu, '$1\n')
    .split(/( +|\n)/)
    .map((w) => (w === '\n' ? '' : w));

/**
 * A headline fitted to its box ("Antetokounmpo" on a phone's slab): printed at its CSS size, or as
 * much smaller as its widest word needs to fit the line whole. Measured in the page, not guessed from
 * a letter count ("Cunningham" is wider than its ten letters say), and kept fitted as the box resizes
 * or the type loads; each word is unbreakable, so a name never splits in the middle (`.fit-w`).
 * Text that isn't a string prints as is. `min` is the floor in pixels.
 */
export function Fit({
  as: Tag = 'div',
  className = '',
  min = 12,
  style,
  children,
}: {
  as?: 'div' | 'span' | 'h1' | 'h2' | 'h3';
  className?: string;
  min?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const text = typeof children === 'string' ? children : null;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || text === null) return;
    const fit = () => {
      el.style.fontSize = '';
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      let widest = 0;
      for (const w of el.querySelectorAll('.fit-w')) widest = Math.max(widest, w.getBoundingClientRect().width);
      // (a 2% margin for the rounding of glyph widths at the smaller size)
      if (room > 0 && widest > room) el.style.fontSize = `${Math.max(min, Math.floor(((parseFloat(cs.fontSize) * room) / widest) * 0.98 * 10) / 10)}px`;
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    void fonts?.ready.then(fit);
    fonts?.addEventListener?.('loadingdone', fit);
    return () => {
      ro?.disconnect();
      fonts?.removeEventListener?.('loadingdone', fit);
    };
  }, [text, min]);
  const words = text === null ? null : fitRuns(text);
  return (
    <Tag ref={ref as never} className={`fit ${className}`} style={style}>
      {words
        ? words.map((w, i) =>
            i % 2 ? (
              // a space stays a space (a line may end there); a hyphen's break is a <wbr>
              w ? (
                ' '
              ) : (
                <wbr key={i} />
              )
            ) : (
              <span key={i} className="fit-w">
                {w}
              </span>
            ),
          )
        : children}
    </Tag>
  );
}

/** Figures in a row, hairlines between them: an overline label, the value in scoreboard type, an optional line under it. */
export function Statline({ items }: { items: { k: ReactNode; v: ReactNode; s?: ReactNode; color?: string }[] }) {
  return (
    <div className="statline">
      {items.map((it, i) => (
        <div key={i}>
          <div className="k">{it.k}</div>
          {/* a figure is never broken over two lines: one too long for its column steps its size down to fit (--len) */}
          <div className="v" style={it.color ? { color: it.color } : undefined}>
            {typeof it.v === 'string' || typeof it.v === 'number' ? (
              <span className="v-fit" style={{ '--len': String(it.v).length } as CSSProperties}>
                <CountUp value={String(it.v)} />
              </span>
            ) : (
              it.v
            )}
          </div>
          {it.s && <div className="s">{it.s}</div>}
        </div>
      ))}
    </div>
  );
}

/** "+11.3", "114.7", "$216.2M", "97": one number with a prefix and a suffix that hold no digits. */
const COUNTABLE = /^([^\d+-]*)([+-]?)(\d+(?:\.(\d+))?)(\D*)$/;

/**
 * A figure that counts up from zero when it first shows (a screen opening), then just shows its
 * value: later changes don't replay it. Text that isn't one number, and reduced motion, show as is.
 */
export function CountUp({ value, ms = 650 }: { value: string; ms?: number }) {
  const m = COUNTABLE.exec(value);
  const [t, setT] = useState(() => (m && !reducedMotion() ? 0 : 1));
  useEffect(() => {
    if (t >= 1) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const x = Math.min(1, (now - start) / ms);
      setT(x);
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!m || t >= 1) return <>{value}</>;
  const [, pre, sign, num, dec, post] = m;
  // ease out: quick at first, settling on the value
  const eased = 1 - (1 - t) ** 3;
  const shown = (Number(num) * eased).toFixed(dec?.length ?? 0);
  // screen readers get the value itself, not the count
  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {pre}
        {sign}
        {shown}
        {post}
      </span>
    </>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
  /** The header written as it is, not in caps (ORtg, DRtg, Net). */
  asIs?: boolean;
  /** Lower is better (a rank, a sprint time): the first tap sorts lowest first. */
  asc?: boolean;
}

/** "Points per game" → "points per game" (an acronym like "TS%" stays as it is). */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Sortable table. `limit` renders only the first rows of the sorted list, for long tables that page with "Show more". */
export function StatTable<T>({
  rows,
  cols,
  initialSort,
  rowKey,
  onRow,
  highlight,
  maxHeight,
  limit,
}: {
  rows: T[];
  cols: Col<T>[];
  initialSort?: string;
  rowKey: (r: T) => string | number;
  onRow?: (r: T) => void;
  highlight?: (r: T) => boolean;
  maxHeight?: number;
  limit?: number;
}) {
  // the column's own first direction, as a tap on its header gives it (names A-Z, ranks lowest first, the rest highest first)
  const firstDir = (c: Col<T> | undefined): 1 | -1 => (c?.left || c?.asc ? 1 : -1);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(() => (initialSort ? { key: initialSort, dir: firstDir(cols.find((c) => c.key === initialSort)) } : null));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => compareCells(col.get(a), col.get(b), sort.dir));
  }, [rows, cols, sort]);
  // a table opened sorted by a column off the right edge (a leaderboard's "All") scrolls it into view, once
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    const th = el?.querySelector<HTMLElement>('th.sorted');
    if (!el || !th || th.offsetLeft + th.offsetWidth <= el.clientWidth) return;
    const stuck = el.querySelector<HTMLElement>('th.sticky')?.offsetWidth ?? 0;
    el.scrollLeft = th.offsetLeft - stuck - 8;
    // (on mount only: a tap on a header sorts where the reader already is)
  }, []);
  // more columns to the right: the table's edge fades, as the league's team tables do
  const outer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const on = () => outer.current?.classList.toggle('fr', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    on();
    el.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      el.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [rows.length, cols.length]);
  return (
    <div className="tablewrap-o" ref={outer}>
      <div className="tablewrap" ref={wrap} style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
        <table className="stats">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.left ? 'l' : ''} ${c.sticky ? 'sticky' : ''} ${sort?.key === c.key ? 'sorted' : ''} ${c.asIs ? 'as-is' : ''}`}
                  style={{ minWidth: c.width }}
                  title={c.help}
                  aria-sort={sort?.key === c.key ? (sort.dir === -1 ? 'descending' : 'ascending') : undefined}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: firstDir(c) }))}
                >
                  {/* named by its visible label first ("PTS, sort by points per game"); the arrow is aria-sort's */}
                  <button type="button" className="th-sort" aria-label={`${c.label}, sort by ${lowerFirst(c.help ?? c.label)}`} onClick={(e) => e.preventDefault()}>
                    {c.label}
                    {sort?.key === c.key && <span aria-hidden="true">{sort.dir === -1 ? ' ↓' : ' ↑'}</span>}
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
    </div>
  );
}

/**
 * A sorted column's order. A number that isn't there (NaN or ±Infinity: no PER outside imported
 * seasons, no line yet) goes last either way, instead of scrambling the order around it.
 */
export function compareCells(va: number | string, vb: number | string, dir: 1 | -1): number {
  if (typeof va === 'number' && typeof vb === 'number') {
    const [ma, mb] = [!isFinite(va), !isFinite(vb)];
    if (ma || mb) return Number(ma) - Number(mb);
    return (va - vb) * dir;
  }
  return String(va).localeCompare(String(vb)) * dir;
}

export function fmtNum(v: number, d = 1) {
  if (!isFinite(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  // a value that rounds to zero reads "0.0", not "-0.0" (as the stats helpers' f1)
  const s = v.toFixed(d);
  return Number(s) === 0 ? (0).toFixed(d) : s;
}

export const pct = (v: number, d = 1) => (isFinite(v) ? `${(v * 100).toFixed(d)}` : '—');

export function Spinner() {
  return <div className="spinner" />;
}

export function Tag({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info' | 'brand' }) {
  return <span className={`tag ${tone ?? ''}`}>{children}</span>;
}
