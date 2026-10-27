// Shared Front Office helpers: the cap sheet's words (cap room, the tax, roster spots, when a
// contract ends), the cap bar, and the small building blocks of the desks' rows and sheets (Office,
// Trade, Free agents, Re-sign, Draft, Finances, Owner, and the player page's contract).
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { League, Player, Team } from '../../core/types';
import { CAP } from '../../core/constants';
import { clamp } from '../../core/random';
import { fmtHeight } from '../../core/ratings';
import { contractExp, playerAge } from '../../core/playerGen';
import { contractSeason, playerName, standardRoster } from '../../core/league/helpers';
import { WAIVER_DAYS, buyoutTerms, nonGuaranteed, releaseDeadMoney, releaseSchedule, stretchDeadMoney, stretchPhrase, stretchedSeasons } from '../../core/league/contracts';
import { tradingClosedReason } from '../../core/league/trades';
import { taxChange } from '../../core/league/finances';
import { release as releaseAction, useBusy } from '../../state/actions/office';
import { Avatar, Help, Ovr } from '../components/ui';
import { Term } from '../components/Glossary';
import './office.css';
import { money, outFor, moneyExact } from '../../core/format';

// the seasons the desks count on, and their roster and contract counts (CSS-free, so the Team header
// and Today can use them without the Office's styles)
export * from './basis';
import { capSeason, isOffseason, shortSeason } from './basis';

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
export function openOption(league: League, p: Pick<Player, 'contract'>): 'player' | 'team' | undefined {
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

// ------------------------------------------------------------------ the cap sheet's words
// Every desk says the cap the same way: a room is never a negative number, an existing contract
// says when it ends ("thru 27-28"), a new deal how long it runs ("× 4 yrs").

/** Cap room as a figure: "Cap space $12.0M" under the cap, "Over the cap $51.2M" over it (the label opens the cap's glossary entry). */
export function capRoomFig(space: number): { k: ReactNode; v: string; color: string } {
  return space >= 0
    ? { k: <Term id="cap">Cap space</Term>, v: money(space), color: 'var(--good)' }
    : { k: <Term id="cap">Over the cap</Term>, v: money(-space), color: 'var(--warn)' };
}

/** Cap room in a phrase: "$12.0M in cap space", "$51.2M over the cap". */
export const capRoomText = (space: number) => (space >= 0 ? `${money(space)} in cap space` : `${money(-space)} over the cap`);

/** The salary floor, when the payroll is under it: the shortfall is paid at the season's end all the same (see assessLuxuryTax), so it's money to spend. */
export const floorText = (pay: number, cap: { minPayroll: number }) =>
  pay < cap.minPayroll ? `${money(cap.minPayroll - pay)} under the salary floor: you pay it anyway at season's end.` : null;

/** Where a payroll stands against the tax line, as a figure: the tax bill over it, the room under it. */
/** The tax figure for a payroll: the bill over the line (`bill`, its brackets counted, see luxuryTaxBill), or the room under it. */
export function taxFig(pay: number, line: number, bill: number): { k: ReactNode; v: string; s: string; color?: string } {
  return pay > line
    ? { k: <Term id="tax">Luxury tax</Term>, v: money(bill), s: `over by ${money(pay - line)}`, color: 'var(--bad)' }
    : { k: <Term id="tax">Under the tax</Term>, v: money(line - pay), s: `line ${money(line)}` };
}

/**
 * What a move does to the user's luxury tax, in a line, wherever money moves (the trade dock, an
 * offer's card, a signing or re-signing sheet): "26-27 tax +$45.1M ($18.9M → $64.0M) · crosses the
 * 2nd apron", "saves $10.7M in tax", or null when there's no tax either way and no line crossed.
 */
export function taxLine(league: League, before: number, after: number, season: number): { text: string; tone: 'bad' | 'good' | 'dim' } | null {
  const t = taxChange(league, league.userTid, before, after, season);
  if (!t.before && !t.after && !t.crosses) return null;
  const bill = `${money(t.before)} → ${money(t.after)}`;
  const cross = t.crosses ? ` · crosses the ${t.crosses === 'tax' ? 'tax line' : t.crosses === 'first' ? '1st apron' : '2nd apron'}` : '';
  const text =
    t.delta > 0
      ? `${shortSeason(season)} tax +${money(t.delta)} (${bill})${cross}`
      : t.delta < 0
        ? `Saves ${money(-t.delta)} in ${shortSeason(season)} tax (${bill})${cross}`
        : `${shortSeason(season)} tax bill ${money(t.after)}, unchanged${cross}`;
  return { text, tone: t.delta > 0 || t.crosses ? 'bad' : t.delta < 0 ? 'good' : 'dim' };
}

/** Where a payroll stands against the cap's lines, for a status tag: the second apron, the first, the tax line, the cap. */
export function payStatus(pay: number, cap: { salaryCap: number; luxuryTax: number; firstApron: number; secondApron: number }): { label: string; tone: 'bad' | 'warn' | 'good' } {
  if (pay > cap.secondApron) return { label: 'Over the 2nd apron', tone: 'bad' };
  if (pay > cap.firstApron) return { label: 'Over the 1st apron', tone: 'bad' };
  if (pay > cap.luxuryTax) return { label: 'Taxpayer', tone: 'bad' };
  if (pay > cap.salaryCap) return { label: 'Over the cap', tone: 'warn' };
  return { label: 'Under the cap', tone: 'good' };
}

/** An injured player's flag in a list: "Out 8 games". */
export function outTag(p: Pick<Player, 'injury'>): string | null {
  if (!p.injury) return null;
  const s = outFor(p.injury.gamesRemaining);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** When a contract ends, as a cap sheet says it: "expiring" this season, else "thru 27-28" (with an option still to come: "thru 28-29 PO"). */
export function contractEnd(league: League, p: Pick<Player, 'contract'>, season = capSeason(league)): string {
  const exp = contractExp(p.contract);
  if (exp <= season) return 'expiring';
  const opt = openOption(league, p);
  return `thru ${shortSeason(exp)}${opt ? (opt === 'player' ? ' PO' : ' TO') : ''}`;
}

/** A new deal's length after its yearly amount: "× 4 yrs". */
export const forYears = (years: number) => `× ${years} yr${years === 1 ? '' : 's'}`;

export function appealInfo(a: number): { label: string; color: string; tone: 'good' | 'info' | 'warn' | 'bad' } {
  if (a >= 1.12) return { label: 'Very interested', color: 'var(--good)', tone: 'good' };
  if (a >= 1.02) return { label: 'Interested', color: 'var(--good)', tone: 'good' };
  if (a >= 0.94) return { label: 'Neutral', color: 'var(--info)', tone: 'info' };
  if (a >= 0.86) return { label: 'Lukewarm', color: 'var(--warn)', tone: 'warn' };
  return { label: 'Not keen', color: 'var(--bad)', tone: 'bad' };
}

/** "+12" / "-40": a -1..1 grade as the owner's -100..100 scale. */
export const fmtGrade = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;

// ------------------------------------------------------------------ components

/**
 * A desk's floating dock (the trade dock, free agency's days) tells the page its height
 * (--fo-dock-h on the body), so toasts rise above it instead of covering it. `dep` re-measures
 * when the dock's element changes.
 */
export function useDockHeight<T extends HTMLElement>(dep?: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.body.style.setProperty('--fo-dock-h', `${Math.round(el.offsetHeight)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.removeProperty('--fo-dock-h');
    };
  }, [dep]);
  return ref;
}

/**
 * Payroll against the cap and the tax line, with an amount on top of it striped (cap holds, an
 * offer). The legend names each part: the payroll and the stripe with their swatches (`full`), or
 * only the two lines when the payroll is the figure above it (`lines`).
 */
export function CapBar({
  pay,
  cap,
  tax,
  aprons,
  add = 0,
  addLabel,
  legend = 'full',
}: {
  pay: number;
  cap: number;
  tax: number;
  /** The first and second aprons, marked past the tax line (too close to it for a label over the bar: the legend names them). */
  aprons?: { first: number; second: number };
  add?: number;
  /** What the stripe is ("Cap holds", "This offer"). */
  addLabel?: ReactNode;
  legend?: 'full' | 'lines' | false;
}) {
  const total = pay + Math.max(0, add);
  const max = Math.max(aprons ? aprons.second * 1.05 : tax * 1.14, total * 1.03);
  const pct = (x: number) => clamp((x / max) * 100, 0, 100);
  // the payroll in its zones: up to the cap, the cap to the tax line, past the tax (a team deep in
  // the tax reads as mostly paid-for room with a red tail, not one red bar)
  const zones = [
    { from: 0, to: Math.min(pay, cap), cls: '' },
    { from: cap, to: Math.min(pay, tax), cls: 'over' },
    { from: tax, to: pay, cls: 'tax' },
  ].filter((z) => z.to > z.from);
  return (
    <div>
      <div className="fo-cap">
        <div className="fo-cap-track">
          {zones.map((z) => (
            <div key={z.cls || 'base'} className={`fo-cap-fill ${z.cls}`} style={{ left: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%` }} />
          ))}
          {add > 0 && <div className="fo-cap-add" style={{ left: `${pct(pay)}%`, width: `${pct(total) - pct(pay)}%` }} />}
          {aprons && (
            <>
              <div className="fo-cap-notch" style={{ left: `${pct(aprons.first)}%` }} />
              <div className="fo-cap-notch" style={{ left: `${pct(aprons.second)}%` }} />
            </>
          )}
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
          {legend === 'full' && (
            <span>
              {/* (the payroll's swatch carries its zones: to the cap, to the tax line, past it) */}
              <i className="fo-legend-pay" />
              Payroll <b>{money(pay)}</b>
            </span>
          )}
          {add > 0 && addLabel && (
            <span>
              <i className="fo-legend-add" />
              {addLabel} <b>{money(add)}</b>
            </span>
          )}
          <span>
            <i className="fo-legend-line" />
            Cap <b>{money(cap)}</b>
          </span>
          <span>
            <i className="fo-legend-line tax" />
            Tax line <b>{money(tax)}</b>
          </span>
          {aprons && (
            <span>
              <i className="fo-legend-apron" />
              <Term id="apron">Aprons</Term>{' '}
              <b>
                {money(aprons.first)} · {money(aprons.second)}
              </b>
            </span>
          )}
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

/** Ovr badge with his potential under it, named: "POT 89". */
export function OvrPot({ p, showPot = true }: { p: Pick<Player, 'ovr' | 'pot'>; showPot?: boolean }) {
  return (
    <div className="fo-ovrstack">
      <Ovr v={p.ovr} size="sm" />
      {showPot && (
        <span className="pot">
          <span className="pot-k">POT</span> {p.pot}
        </span>
      )}
    </div>
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
      aria-valuetext={moneyExact(value)}
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
  const why = buyout ? [playerAge(p, league.season) >= 32 ? 'his age' : '', league.teams[p.tid].strategy !== 'contend' ? "you're not contending" : ''].filter(Boolean) : [];
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
              <span className="dim2">{shortSeason(s)}</span>
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
