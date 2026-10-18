// Shared Front Office helpers: money formatting, cap bar, owner mood visuals and
// small player-row building blocks used by Office, Trade, Free Agents, Re-sign,
// Draft, Finances and Settings.
import { Fragment, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { League, Phase, Player, Team } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { fmtHeight } from '../../core/ratings';
import { contractExp, playerAge } from '../../core/playerGen';
import { contractSeason, playerName, standardRoster } from '../../core/league/helpers';
import { WAIVER_DAYS, buyoutTerms, nonGuaranteed, releaseDeadMoney, releaseSchedule, stretchDeadMoney, stretchPhrase, stretchedSeasons } from '../../core/league/contracts';
import { moodLevel, MOOD_META } from '../../core/league/morale';
import { tradingClosedReason } from '../../core/league/trades';
import { release as releaseAction, useBusy } from '../../state/actions/office';
import { Avatar, Help, Ovr } from '../components/ui';
import './office.css';
import { money } from '../../core/format';

export const OFFSEASON_PHASES: Phase[] = ['draftLottery', 'draft', 'resign', 'freeAgency'];

export const isOffseason = (l: League) => OFFSEASON_PHASES.includes(l.phase);

/** The season new contracts/trades count against: next season during the offseason. */
export const capSeason = (l: League) => (isOffseason(l) ? l.season + 1 : l.season);

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
    ? 'His contract is up: re-sign him now or he becomes a free agent.'
    : 'His contract is up. You hold his rights until free agency: re-sign him after the draft.';
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

/** "+12" / "-40": a -1..1 grade as the owner's -100..100 scale. */
export const fmtGrade = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;

// ------------------------------------------------------------------ components

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
          <span>Cap</span>
        </div>
        <div className="fo-cap-mark tax" style={{ left: `${pct(tax)}%` }}>
          <span>Tax</span>
        </div>
      </div>
      {legend && (
        <div className="fo-legend">
          <span>
            <i style={{ background: tone(total) }} />
            Payroll <b>{money(total)}</b>
          </span>
          <span>
            Cap <b>{money(cap)}</b>
          </span>
          <span>
            Tax <b>{money(tax)}</b>
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
    <span className="fo-mood">
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
      className="fo-range"
      min={min}
      max={max}
      step={step}
      value={clamp(value, min, max)}
      aria-label={label}
      aria-valuetext={money(value, 2)}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--fill' as string]: `${fill}%` }}
    />
  );
}

/** A note with a tone: a coloured edge and an icon, not a tinted box. */
export function Callout({ tone, icon, children }: { tone?: 'good' | 'bad' | 'warn'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`fo-callout ${tone ?? ''}`}>
      {icon}
      <div className="grow">{children}</div>
    </div>
  );
}

/** Tap-to-explain with the Front Office's paragraph spacing: the rules in full, one short paragraph each. */
export function HelpSheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Help title={title}>
      <div className="fo-help">{children}</div>
    </Help>
  );
}

/** A sheet's player header: his jersey, name, line of detail and rating. */
export function PlayerHead({ league, p, children, right }: { league: League; p: Player; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="fo-phead">
      <Avatar p={p} />
      <div className="grow">
        <h2 className="ellipsis">{playerName(p)}</h2>
        <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
        {children}
      </div>
      {right ?? <Ovr v={p.ovr} />}
    </div>
  );
}

/** A label and a value on one line, hairlines between rows (a contract's seasons, a sheet's terms). */
export function Line({ k, children, className = '' }: { k: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`fo-line ${className}`}>
      <span className="fo-line-k">{k}</span>
      <span className="fo-line-v">{children}</span>
    </div>
  );
}

/**
 * Releasing one of your players: what it leaves on the books, as it is and stretched side by side
 * when the stretch provision applies, a buyout for a veteran, and the buttons (the Office contract
 * sheet and the player page).
 */
export function ReleaseConfirm({ league, p, onKeep, onDone }: { league: League; p: Player; onKeep: () => void; onDone: () => void }) {
  const remaining = releaseDeadMoney(league, p);
  const owed = remaining.reduce((a, r) => a + r.amount, 0);
  const n = standardRoster(league, league.userTid).length;
  // in the regular season, a release that leaves dead money goes through waivers first (see releasePlayer)
  const waive = league.phase === 'regular' && owed > 0;
  const buyout = buyoutTerms(league, p);
  const busy = useBusy();
  // the stretch provision: the same money over twice the seasons left plus one (null: nothing to stretch)
  const stretch = stretchDeadMoney(league, remaining);
  const spread = stretch ? stretchedSeasons(stretch) : 0;
  const buyoutStretch = buyout ? stretchedSeasons(releaseSchedule(league, p, { giveback: buyout.giveback, stretch: true })) : 0;
  const release = (stretchIt: boolean) => {
    const name = playerName(p);
    const how = stretchIt && spread ? `, ${stretchPhrase(league, spread)}` : '';
    const after = waive
      ? `${name} waived. ${money(owed)} stays on your books${how} unless a team claims him.`
      : `${name} released.${owed > 0 ? ` ${money(owed)} stays on your books${how}.` : ''}`;
    if (releaseAction(league, p.pid, { stretch: stretchIt }, after)) onDone();
  };
  const buyOut = (stretchIt: boolean) => {
    if (releaseAction(league, p.pid, { stretch: stretchIt, buyout: true }, '')) onDone();
  };
  // every season either schedule touches, in order
  const seasons = [...new Set([...remaining, ...(stretch ?? [])].map((d) => d.season))].sort((a, b) => a - b);
  const amountIn = (xs: { season: number; amount: number }[] | null, s: number) => xs?.find((d) => d.season === s)?.amount;
  // why he'd give back more than a little
  const why = buyout
    ? [
        p.mood.tradeRequest ? 'he wants out' : p.mood.score <= -2 ? "he's unhappy" : '',
        playerAge(p, league.season) >= 32 ? 'his age' : '',
        league.teams[p.tid].strategy !== 'contend' ? "you're not contending" : '',
      ].filter(Boolean)
    : [];
  return (
    <>
      <p className="fo-lede">
        {waive ? `On waivers for ${WAIVER_DAYS} days, then a free agent if no one claims him.` : 'He becomes a free agent at once.'}{' '}
        {p.contract.twoWay
          ? 'Two-way pay is off the cap: no dead money.'
          : p.contract.tenDay
            ? 'His 10-day pay was paid when he signed: no dead money.'
            : nonGuaranteed(league, p)
              ? "His minimum deal isn't guaranteed until opening night: no dead money."
              : owed > 0
                ? `What he's owed stays on your cap and payroll as dead money${waive ? ' unless he is claimed' : ''}.`
                : 'Nothing is left to pay: no dead money.'}
      </p>
      {remaining.length > 0 && (
        <div className={`fo-dead ${stretch ? 'three' : ''}`}>
          <span className="over">Dead money</span>
          <span className="over r">Release</span>
          {stretch && <span className="over r">Stretched</span>}
          {seasons.map((s) => (
            <Fragment key={s}>
              <span className="dim2">{seasonLabel(s)}</span>
              <span className="num r">{amountIn(remaining, s) ? money(amountIn(remaining, s)!) : '—'}</span>
              {stretch && <span className="num r">{amountIn(stretch, s) ? money(amountIn(stretch, s)!) : '—'}</span>}
            </Fragment>
          ))}
          <span className="fo-dead-t">Total</span>
          <span className="fo-dead-t num r bad">{money(owed)}</span>
          {stretch && <span className="fo-dead-t num r bad">{money(owed)}</span>}
        </div>
      )}
      {stretch && (
        <div className="tiny dim">
          Stretched: the same money{contractSeason(league) === league.season ? ' past this season' : ''} over {spread} seasons (twice the {(spread - 1) / 2} left, plus one).
          {waive ? ' A waiver claim still wipes it.' : ''}
        </div>
      )}
      {buyout && (
        <div className="fo-buyout">
          <div className="row between">
            <span className="bold">Or buy him out</span>
            <span className="tag good">Gives back {Math.round(buyout.giveback * 100)}%</span>
          </div>
          <div className="small dim2">
            He gives back {money(buyout.saved)} of {money(buyout.owed)}
            {why.length ? ` (${why.join(', ')})` : ''} and skips waivers.
          </div>
          <div className="statline">
            <div>
              <div className="k">Release</div>
              <div className="v bad">{money(buyout.owed)}</div>
            </div>
            <div>
              <div className="k">Buyout</div>
              <div className="v warn">{money(buyout.dead)}</div>
            </div>
          </div>
          <button className="btn block" disabled={busy} onClick={() => buyOut(false)}>
            Buy out · save {money(buyout.saved)}
          </button>
          {buyoutStretch > 0 && (
            <button className="btn block" disabled={busy} onClick={() => buyOut(true)}>
              Buy out and stretch it over {buyoutStretch} seasons
            </button>
          )}
        </div>
      )}
      {!p.contract.twoWay && n - 1 < CAP.rosterMin && (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          You'll have {n - 1} players: rosters need {CAP.rosterMin} to start the season.
        </Callout>
      )}
      <div className="row">
        <button className="btn grow" onClick={onKeep}>
          Keep him
        </button>
        <button className="btn danger grow" disabled={busy} onClick={() => release(false)}>
          Release
        </button>
      </div>
      {stretch && (
        <button className="btn danger block" disabled={busy} onClick={() => release(true)}>
          Release and stretch over {spread} seasons
        </button>
      )}
    </>
  );
}
