// Shared Front Office helpers: money formatting, cap bar, owner mood visuals and
// small player-row building blocks used by Office, Trade, Free Agents, Re-sign,
// Draft, Finances and Settings.
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { League, Phase, Player, Team } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { fmtHeight } from '../../core/ratings';
import { contractExp, playerAge } from '../../core/playerGen';
import { playerName, standardRoster } from '../../core/league/helpers';
import { nonGuaranteed, releaseDeadMoney, releasePlayer } from '../../core/league/contracts';
import { moodLevel, MOOD_META } from '../../core/league/morale';
import { tradingClosedReason } from '../../core/league/trades';
import { useStore } from '../../state/store';
import { Ovr } from '../components/ui';
import './office.css';

export const OFFSEASON_PHASES: Phase[] = ['draftLottery', 'draft', 'resign', 'freeAgency'];

export const isOffseason = (l: League) => OFFSEASON_PHASES.includes(l.phase);

/** The season new contracts/trades count against: next season during the offseason. */
export const capSeason = (l: League) => (isOffseason(l) ? l.season + 1 : l.season);

/** Money in $K → "$X.XM" (negative values get a leading minus; one that rounds to zero doesn't). */
export function fmtM(k: number, d = 1): string {
  const m = (Math.abs(k) / 1000).toFixed(d);
  return `${k < 0 && Number(m) !== 0 ? '-' : ''}$${m}M`;
}

/** Signed money "+$1.2M" / "-$3.4M" (a value that rounds to zero reads "+$0.0M"). */
export const fmtMs = (k: number, d = 1) => {
  const m = (Math.abs(k) / 1000).toFixed(d);
  return `${k < 0 && Number(m) !== 0 ? '-' : '+'}$${m}M`;
};

/** "26-27" style short season label. */
export const shortSeason = (season: number) => `${String((season - 1) % 100).padStart(2, '0')}-${String(season % 100).padStart(2, '0')}`;

export { ordinal } from '../stats';

// tones match the league screens' strategy tags
export { STRATEGY_META } from '../league/shared';

/** Practice intensity levels as the Finances budget tab names and explains them. */
export const PRACTICE: { id: Team['practice']; label: string; dev: string; risk: string }[] = [
  { id: 'light', label: 'Light', dev: 'Slower skill growth (about −0.35 rating points per skill each year)', risk: 'Fresher legs: least wear and injury risk' },
  { id: 'normal', label: 'Normal', dev: 'Standard development', risk: 'Standard wear and injury risk' },
  { id: 'intense', label: 'Intense', dev: 'Faster skill growth (about +0.45 rating points per skill each year)', risk: 'Heavier legs: more wear and injury risk' },
];

export function playerMeta(league: League, p: Player, extra?: string): string {
  const bits = [p.pos, String(playerAge(p, league.season)), fmtHeight(p.heightIn)];
  if (extra) bits.push(extra);
  return bits.join(' · ');
}

/** The option on a contract's final season while it is still to be decided (after the season before it); an option year already under way was settled. */
export function openOption(league: League, p: Player): 'player' | 'team' | undefined {
  return contractExp(p.contract) > league.season ? p.contract.option : undefined;
}

/** "Deadline in 12 days" or "Deadline today" during the regular season until the trade deadline; null otherwise. */
export function deadlineLabel(league: League): string | null {
  const days = league.tradeDeadlineDay - league.day;
  if (league.phase !== 'regular' || days < 0) return null;
  return days === 0 ? 'Deadline today' : `Deadline in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * A contract that's up after the season is a set of Bird rights until free agency opens: he is
 * re-signed or let go in the re-sign period, not released or traded. Null for anyone else.
 */
export function contractUpNote(league: League, p: Player): string | null {
  if (p.tid < 0 || !isOffseason(league) || contractExp(p.contract) > league.season) return null;
  return league.phase === 'resign'
    ? 'His contract is up. Re-sign him now or he becomes a free agent.'
    : 'His contract is up. You hold his rights until free agency opens: re-sign him in the re-sign period after the draft.';
}

/** Why none of the user's players can be traded right now (past the deadline, the postseason) and when that ends, or null. */
export function tradeClosedNote(league: League): string | null {
  const why = tradingClosedReason(league);
  return why && `${why} Trading reopens after the playoffs, with the draft lottery.`;
}

export function contractYearsLabel(league: League, p: Player, fromSeason: number): string {
  const exp = contractExp(p.contract);
  const yrs = exp - fromSeason + 1;
  if (yrs <= 0) return 'Expiring';
  const opt = openOption(league, p);
  return `${yrs} yr${yrs > 1 ? 's' : ''}${opt ? (opt === 'player' ? ' · PO' : ' · TO') : ''}`;
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
    <svg className="fo-gauge" width={size} height={size * 0.68} viewBox="0 0 100 68" role="img" aria-label={`Owner mood ${Math.round(v * 100)}`}>
      <path d={arc(0, 0.25)} stroke="var(--bad)" strokeWidth="8" fill="none" opacity="0.9" />
      <path d={arc(0.25, 0.4)} stroke="var(--warn)" strokeWidth="8" fill="none" opacity="0.9" />
      <path d={arc(0.4, 0.55)} stroke="var(--info)" strokeWidth="8" fill="none" opacity="0.9" />
      <path d={arc(0.55, 1)} stroke="var(--good)" strokeWidth="8" fill="none" opacity="0.9" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4.5" fill="var(--text)" />
      <text x={cx} y={66} textAnchor="middle" fontSize="11" fontWeight="700" fill={verdict.color}>
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

/** Bare range input for an amount of money ($K) using the design-system track styling. */
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
      aria-valuetext={fmtM(value, 2)}
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

/** Releasing one of your players: what it leaves on the books, and the buttons (the Office contract sheet and the player page). */
export function ReleaseConfirm({ league, p, onKeep, onDone }: { league: League; p: Player; onKeep: () => void; onDone: () => void }) {
  const remaining = releaseDeadMoney(league, p);
  const owed = remaining.reduce((a, r) => a + r.amount, 0);
  const n = standardRoster(league, league.userTid).length;
  const release = () => {
    const name = playerName(p);
    useStore.getState().mutate((l) => releasePlayer(l, l.players[p.pid]));
    useStore.getState().toast(`${name} released.${owed > 0 ? ` ${fmtM(owed)} stays on your books.` : ''}`, 'neutral');
    onDone();
  };
  return (
    <>
      <p className="dim2" style={{ margin: 0 }}>
        {playerName(p)} becomes a free agent immediately and can sign with any team.{' '}
        {p.contract.twoWay ? (
          'Two-way pay sits outside the cap, so there is no dead money.'
        ) : nonGuaranteed(league, p) ? (
          "His minimum deal isn't guaranteed until opening night, so there is no dead money."
        ) : owed > 0 ? (
          <>
            <b>His remaining salary stays on your books</b> as dead money and counts against the cap and your payroll until it runs out.
          </>
        ) : (
          'Nothing is left to pay on his contract, so there is no dead money.'
        )}
      </p>
      {remaining.length > 0 && (
        <div className="card tight">
          {remaining.map((r) => (
            <div key={r.season} className="row between small" style={{ padding: '3px 0' }}>
              <span className="dim2">{seasonLabel(r.season)}</span>
              <span className="num bold">{fmtM(r.amount)}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="row between small">
            <span className="bold">Dead money</span>
            <span className="num bold bad">{fmtM(owed)}</span>
          </div>
        </div>
      )}
      {!p.contract.twoWay && n - 1 < CAP.rosterMin && (
        <div className="fo-callout warn">
          <TriangleAlert size={18} className="warn" />
          <div>
            You'll have {n - 1} players. Rosters need at least {CAP.rosterMin} to start the season.
          </div>
        </div>
      )}
      <div className="row">
        <button className="btn grow" onClick={onKeep}>
          Keep him
        </button>
        <button className="btn danger grow" onClick={release}>
          Release
        </button>
      </div>
    </>
  );
}
