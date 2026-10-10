// Shared Front Office helpers: money formatting, cap bar, owner mood visuals and
// small player-row building blocks used by Office, Trade, Free Agents, Re-sign,
// Draft, Finances and Settings.
import type { ReactNode } from 'react';
import type { League, Phase, Player } from '../../core/types';
import { clamp } from '../../core/random';
import { fmtHeight } from '../../core/ratings';
import { contractExp, playerAge } from '../../core/playerGen';
import { moodLevel, MOOD_META } from '../../core/league/morale';
import { Ovr } from '../components/ui';
import './office.css';

export const OFFSEASON_PHASES: Phase[] = ['draftLottery', 'draft', 'resign', 'freeAgency'];

export const isOffseason = (l: League) => OFFSEASON_PHASES.includes(l.phase);

/** The season new contracts/trades count against: next season during the offseason. */
export const capSeason = (l: League) => (isOffseason(l) ? l.season + 1 : l.season);

/** Money in $K → "$X.XM" (negative values get a leading minus). */
export function fmtM(k: number, d = 1): string {
  const m = Math.abs(k) / 1000;
  return `${k < 0 ? '-' : ''}$${m.toFixed(d)}M`;
}

/** Signed money "+$1.2M" / "-$3.4M". */
export const fmtMs = (k: number, d = 1) => `${k >= 0 ? '+' : '-'}$${(Math.abs(k) / 1000).toFixed(d)}M`;

/** "26-27" style short season label. */
export const shortSeason = (season: number) => `${String((season - 1) % 100).padStart(2, '0')}-${String(season % 100).padStart(2, '0')}`;

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export const STRATEGY_META: Record<'contend' | 'retool' | 'rebuild', { label: string; tone: 'good' | 'info' | 'warn'; help: string }> = {
  contend: { label: 'Contending', tone: 'good', help: 'Wants proven players who help now. Discounts draft picks.' },
  retool: { label: 'Retooling', tone: 'info', help: 'Balanced: values players and picks at face value.' },
  rebuild: { label: 'Rebuilding', tone: 'warn', help: 'Pays extra for young players and draft picks, marks down veterans 29+.' },
};

export const PLAYOFF_LABEL = (round: number) =>
  round >= 5 ? 'Champion' : round === 4 ? 'Finals' : round === 3 ? 'Conf. Finals' : round === 2 ? '2nd Round' : round === 1 ? '1st Round' : round === 0 ? 'Play-In' : 'Missed';

export function playerMeta(league: League, p: Player, extra?: string): string {
  const bits = [p.pos, String(playerAge(p, league.season)), fmtHeight(p.heightIn)];
  if (extra) bits.push(extra);
  return bits.join(' · ');
}

export function contractYearsLabel(p: Player, fromSeason: number): string {
  const exp = contractExp(p.contract);
  const yrs = exp - fromSeason + 1;
  if (yrs <= 0) return 'Expiring';
  return `${yrs} yr${yrs > 1 ? 's' : ''}${p.contract.option ? (p.contract.option === 'player' ? ' · PO' : ' · TO') : ''}`;
}

export function appealInfo(a: number): { label: string; color: string; tone: 'good' | 'info' | 'warn' | 'bad' } {
  if (a >= 1.12) return { label: 'Very interested', color: 'var(--good)', tone: 'good' };
  if (a >= 1.02) return { label: 'Interested', color: 'var(--good)', tone: 'good' };
  if (a >= 0.94) return { label: 'Open', color: 'var(--info)', tone: 'info' };
  if (a >= 0.86) return { label: 'Lukewarm', color: 'var(--warn)', tone: 'warn' };
  return { label: 'Not keen', color: 'var(--bad)', tone: 'bad' };
}

export function ownerVerdict(total: number): { label: string; color: string } {
  if (total > 0.4) return { label: 'Thrilled', color: 'var(--good)' };
  if (total > 0.1) return { label: 'Pleased', color: 'var(--good)' };
  if (total > -0.2) return { label: 'Patient', color: 'var(--info)' };
  if (total > -0.5) return { label: 'Concerned', color: 'var(--warn)' };
  return { label: 'Hot seat', color: 'var(--bad)' };
}

// ------------------------------------------------------------------ components

export function SecTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row between" style={{ marginTop: 4 }}>
      <div className="fo-sec grow">{children}</div>
      {right}
    </div>
  );
}

/** Payroll vs cap vs tax, with an optional pending amount (striped). */
export function CapBar({ pay, cap, tax, add = 0, legend = true }: { pay: number; cap: number; tax: number; add?: number; legend?: boolean }) {
  const total = pay + Math.max(0, add);
  const max = Math.max(tax * 1.14, total * 1.03);
  const pct = (x: number) => clamp((x / max) * 100, 0, 100);
  const tone = (x: number) => (x > tax ? 'var(--bad)' : x > cap ? 'var(--warn)' : 'var(--good)');
  return (
    <div>
      <div className="fo-cap">
        <div className="fo-cap-track">
          <div className="fo-cap-fill" style={{ width: `${pct(pay)}%`, background: tone(pay) }} />
          {add > 0 && <div className="fo-cap-add" style={{ left: `${pct(pay)}%`, width: `${pct(total) - pct(pay)}%` }} />}
        </div>
        <div className="fo-cap-mark" style={{ left: `${pct(cap)}%` }}>
          <span>CAP</span>
        </div>
        <div className="fo-cap-mark tax" style={{ left: `${pct(tax)}%` }}>
          <span>TAX</span>
        </div>
      </div>
      {legend && (
        <div className="fo-legend">
          <span>
            <i style={{ background: tone(total) }} />
            Payroll <b>{fmtM(total)}</b>
          </span>
          <span>
            Cap <b>{fmtM(cap)}</b>
          </span>
          <span>
            Tax line <b>{fmtM(tax)}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/** Horizontal bar for a -1..1 value, growing from the center line. */
export function CenterBar({ value }: { value: number }) {
  const v = clamp(value, -1, 1);
  const w = Math.abs(v) * 50;
  const color = v >= 0.1 ? 'var(--good)' : v <= -0.1 ? 'var(--bad)' : 'var(--warn)';
  return (
    <div className="fo-cbar">
      <i style={{ left: v >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 1.5)}%`, background: color }} />
    </div>
  );
}

/** Semicircle gauge for the owner's overall mood (-1..1). */
export function Gauge({ value, size = 150, label }: { value: number; size?: number; label?: string }) {
  const v = clamp(value, -1, 1);
  const r = 42;
  const cx = 50;
  const cy = 50;
  const ang = Math.PI * (1 - (v + 1) / 2); // 180° (left) .. 0° (right)
  const nx = cx + Math.cos(ang) * (r - 6);
  const ny = cy - Math.sin(ang) * (r - 6);
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy - Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy - Math.sin(a1) * r;
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const verdict = ownerVerdict(v);
  return (
    <svg className="fo-gauge" width={size} height={size * 0.62} viewBox="0 0 100 62" role="img" aria-label={`Owner mood ${Math.round(v * 100)}`}>
      <path d={arc(0, 0.25)} stroke="var(--bad)" strokeWidth="8" fill="none" opacity="0.9" />
      <path d={arc(0.25, 0.4)} stroke="var(--warn)" strokeWidth="8" fill="none" opacity="0.9" />
      <path d={arc(0.4, 0.55)} stroke="var(--info)" strokeWidth="8" fill="none" opacity="0.9" />
      <path d={arc(0.55, 1)} stroke="var(--good)" strokeWidth="8" fill="none" opacity="0.9" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4.5" fill="var(--text)" />
      <text x={cx} y={61} textAnchor="middle" fontSize="11" fontWeight="700" fill={verdict.color}>
        {label ?? verdict.label.toUpperCase()}
      </text>
    </svg>
  );
}

/** Ovr badge with POT underneath. */
export function OvrPot({ p, showPot = true }: { p: Pick<Player, 'ovr' | 'pot'>; showPot?: boolean }) {
  return (
    <div className="fo-ovrstack">
      <Ovr v={p.ovr} size="sm" />
      {showPot && <span className="pot">{p.pot > p.ovr ? `▲${p.pot}` : p.pot}</span>}
    </div>
  );
}

export function MoodTag({ p, withNotes = false }: { p: Player; withNotes?: boolean }) {
  const lvl = moodLevel(p.mood.score);
  const m = MOOD_META[lvl];
  return (
    <span className="row" style={{ gap: 6, minWidth: 0, display: 'inline-flex' }}>
      <span className="tag" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 16%, transparent)` }}>
        {m.emoji} {m.label}
      </span>
      {withNotes && p.mood.notes.length > 0 && <span className="small dim ellipsis">{p.mood.notes.join(' · ')}</span>}
    </span>
  );
}

/** Bare range input using the design-system track styling. */
export function Range({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  const fill = max > min ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={clamp(value, min, max)}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--fill' as string]: `${fill}%`, display: 'block' }}
    />
  );
}

export function Callout({ tone, icon, children }: { tone?: 'good' | 'bad' | 'warn'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`fo-callout ${tone ?? ''}`}>
      {icon}
      <div className="grow">{children}</div>
    </div>
  );
}

/** Pick a readable accent from a team's colors (mirrors the shell's logic). */
export function teamAccentColor(colors: [string, string, string]): string {
  const info = (hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, s: Math.max(r, g, b) - Math.min(r, g, b) };
  };
  const c = colors.map((x) => ({ x, ...info(x) })).filter((y) => y.l > 0.12 && y.l < 0.8);
  c.sort((a, b) => b.s - a.s);
  return c[0]?.x ?? '#3b82f6';
}
