// The trade builder's terms beyond players and picks: a protection on a team's own first as it
// goes, the right to swap firsts in a future draft, and cash (see the deal terms in
// core/league/trades.ts), plus the dock's plain-words account of what each one does.
import type { DraftPick, League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { PROTECTIONS, cashRoom, dealTerms, fmtCash, inSwap, swapSeasons, type TradeOffer } from '../../core/league/trades';
import { contractSeason } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { Range } from '../office/common';

/** Can the team sending this pick put a protection on it: its own first, its draft order still open, no swap on it? */
export const protectable = (league: League, dp: DraftPick, tid: number) => dp.round === 1 && dp.originalTid === tid && dp.pick === undefined && !inSwap(league, dp);

/** A compact drop-down for the protection a team puts on its own first as it sends it. */
export function ProtectSelect({ dp, value, onChange }: { dp: DraftPick; value: number; onChange: (n: number) => void }) {
  return (
    <select
      className="lg-select"
      aria-label={`Protection on the ${dp.season} 1st`}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ height: 30, width: '100%', minWidth: 0, fontSize: 12, padding: '0 22px 0 8px', backgroundPosition: 'right 6px center' }}
    >
      <option value="0">Unprotected</option>
      {PROTECTIONS.map((n) => (
        <option key={n} value={String(n)}>
          Top-{n} protected{n === 14 ? ' (lottery)' : ''}
        </option>
      ))}
    </select>
  );
}

/**
 * The drafts in which `giver` can give the other team the right to swap firsts, as chips: each is
 * a right the other team gets to take the giver's first instead of its own if the giver's lands higher.
 */
export function SwapChips({
  league,
  giver,
  taker,
  value,
  taken,
  onChange,
}: {
  league: League;
  giver: number;
  taker: number;
  value: number[];
  /** Drafts this deal already ties up (swapped the other way, or one of the two firsts moving in it). */
  taken: number[];
  onChange: (v: number[]) => void;
}) {
  const seasons = useLeagueMemo(() => swapSeasons(league, giver, taker), [league, giver, taker]);
  const mine = giver === league.userTid;
  const g = league.teams[giver].abbrev;
  const t = league.teams[taker].abbrev;
  return (
    <div style={{ padding: '0 12px 10px' }}>
      <div className="tiny dim2" style={{ marginBottom: 6 }}>
        {mine ? `Let ${t} take your first instead of theirs if yours lands higher, in:` : `${g} let you take their first instead of yours if theirs lands higher, in:`}
      </div>
      {seasons.length === 0 ? (
        <div className="small dim">No draft where both teams hold their own first, unprotected and without a swap.</div>
      ) : (
        <div className="chips" role="group" aria-label={mine ? `Swap rights you give ${t}` : `Swap rights ${g} give you`}>
          {seasons.map((y) => {
            const on = value.includes(y);
            return (
              <button
                key={y}
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={!on && taken.includes(y)}
                onClick={() => onChange(on ? value.filter((x) => x !== y) : [...value, y].sort((a, b) => a - b))}
              >
                {y}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Cash one team sends, in $0.1M steps up to what it can still send and the other can still
 * receive this season. One way per deal: while the other side sends cash, this one can't.
 */
export function CashControl({
  league,
  from,
  to,
  value,
  onChange,
  blocked,
}: {
  league: League;
  from: number;
  to: number;
  value: number;
  onChange: (k: number) => void;
  /** The other side sends cash already. */
  blocked: boolean;
}) {
  const send = cashRoom(league, from);
  const take = cashRoom(league, to);
  const max = Math.min(send.send, take.receive);
  const mine = from === league.userTid;
  const f = league.teams[from].abbrev;
  const s = seasonLabel(contractSeason(league));
  return (
    <div style={{ padding: '0 12px 12px' }}>
      <div className="row between small" style={{ gap: 8 }}>
        <span className="dim2">{mine ? 'You send' : `${f} send`}</span>
        <b className="num">{value > 0 ? fmtCash(value) : 'No cash'}</b>
      </div>
      {blocked ? (
        <div className="tiny dim">Cash goes one way in a deal: take the other side's out first.</div>
      ) : max <= 0 ? (
        <div className="tiny dim">
          {send.send < 100 ? `${mine ? 'You have' : `${f} has`} sent all the cash allowed` : `${league.teams[to].abbrev} can't take more cash`} in trades for {s} (
          {fmtCash(send.limit)} a season each way).
        </div>
      ) : (
        <>
          <Range value={Math.min(value, max)} min={0} max={max} step={100} onChange={onChange} label={mine ? 'Cash you send' : `Cash ${f} send`} />
          <div className="tiny dim" style={{ marginTop: 4 }}>
            Up to {fmtCash(max)}: each team can send, and take, {fmtCash(send.limit)} in trades a season ({s}). Cash isn't salary: it doesn't match or count against the cap.
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What each of the deal's protections, swaps and sums of cash does (nothing for a deal without
 * any): in full under the deal, or a line for each protection and swap (`short`) in the dock.
 */
export function TermsList({ league, offer, short = false }: { league: League; offer: TradeOffer; short?: boolean }) {
  const key = JSON.stringify(offer);
  // (the dock leaves the cash to the cash control, which shows what's left this season; key stands
  // for the offer, a new object every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const terms = useLeagueMemo(() => dealTerms(league, offer).filter((t) => !short || t.key !== 'cash'), [league, key, short]);
  if (!terms.length) return null;
  return (
    <div className="col" style={{ gap: short ? 3 : 6, marginTop: short ? 6 : 10 }}>
      {terms.map((t) => (
        <div key={t.key} className={`row top ${short ? 'tiny' : 'small'} dim2`} style={{ gap: 6 }}>
          <span className="fo-dot" style={{ background: 'var(--info)', margin: short ? '4px 0 0' : '6px 0 0', flex: 'none' }} />
          <span>{short ? t.short : t.text}</span>
        </div>
      ))}
    </div>
  );
}
