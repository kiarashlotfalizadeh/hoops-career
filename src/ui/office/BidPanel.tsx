// What a top free agent weighs before he decides on your offer (the Free Agents offer sheet): his
// decision day, who else is bidding, where your offer stands now, and how your team fits what
// matters to him.
import { Check, Gavel, Minus, TriangleAlert, X } from 'lucide-react';
import type { Player } from '../../core/types';
import { PREF_KEYS, type PlayerPrefs, appealTerms, playerPrefs, willSign } from '../../core/league/contracts';
import { bidDecideDay, bidStanding, faInterest, pendingBid, withdrawBid } from '../../core/league/freeAgency';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { Callout, fmtM } from './common';

const LABEL: Record<keyof PlayerPrefs, string> = { winning: 'Winning', money: 'Money', role: 'Playing time', market: 'Market' };

/** How much a priority weighs, in words (weights average 1). */
const weight = (w: number) => (w >= 1.25 ? 'matters a lot' : w >= 0.85 ? 'matters' : 'matters a little');

export function BidPanel({ p, amount, years, floor, onAmount }: { p: Player; amount: number; years: number; floor: number; onAmount: (v: number) => void }) {
  const league = useLeague();
  const tid = league.userTid;
  // rival bids don't depend on the slider: work them out once per league change
  const offers = useLeagueMemo(() => faInterest(league, p), [league, p]);
  const standing = bidStanding(league, p, amount, years, offers);
  const prefs = playerPrefs(league, p);
  const terms = useLeagueMemo(() => appealTerms(league, tid, p), [league, tid, p]);
  const decide = bidDecideDay(league, p.pid);
  const when = decide > league.faDay ? `on day ${decide + 1}` : 'when free agency closes';
  const bid = pendingBid(league, p.pid);
  const rivals = offers.map((o) => league.teams[o.tid].abbrev);
  const best = offers[0];
  const atAsk = willSign(league, p, tid, amount, years).ok;

  // fit of your team for each priority: yes, no, or neither
  const fit: Record<keyof PlayerPrefs, { ok: boolean | null; note: string }> = {
    winning: { ok: terms.winning > 0.005 ? true : terms.winning < -0.005 ? false : null, note: `${Math.round(terms.wp * 100)}% wins` },
    money: { ok: atAsk, note: atAsk ? 'at his price' : 'below his price' },
    role: { ok: terms.role > 0 ? true : terms.role < 0 ? false : null, note: terms.role > 0 ? 'he would start' : terms.role < 0 ? 'deep on your bench' : 'rotation minutes' },
    market: {
      ok: terms.market > 0.005 ? true : terms.market < -0.005 ? false : null,
      note: terms.market > 0.005 ? 'big stage' : terms.market < -0.005 ? 'small stage' : 'average',
    },
  };
  const order = [...PREF_KEYS].sort((a, b) => prefs[b] - prefs[a]);

  const withdraw = () => {
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = withdrawBid(l, p.pid);
    });
    useStore.getState().toast(res.reason, res.ok ? 'neutral' : 'bad');
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <Callout icon={<Gavel size={18} />}>
        <b>Top free agents weigh offers:</b> he decides {when}.{' '}
        {rivals.length ? (
          <>
            Interest: {rivals.slice(0, 2).join(', ')}
            {rivals.length > 2 ? `, +${rivals.length - 2}` : ''}.
          </>
        ) : (
          'No other team is bidding right now.'
        )}
        {bid && (
          <div className="row between" style={{ marginTop: 6, gap: 8 }}>
            <span className="small dim2">
              Your offer: {bid.years} yr{bid.years > 1 ? 's' : ''} · {fmtM(bid.amount, 2)}
            </span>
            <button className="btn xs" onClick={withdraw}>
              Withdraw
            </button>
          </div>
        )}
      </Callout>

      {amount < floor ? (
        <Callout tone="bad" icon={<X size={18} className="bad" />}>
          <b>Too low to consider.</b> He won't look at less than {fmtM(floor, 2)} a season for {years} year{years > 1 ? 's' : ''}.
        </Callout>
      ) : standing.leads ? (
        <Callout tone="good" icon={<Check size={18} className="good" />}>
          <b>{best ? 'Your offer leads the field right now.' : "No rival bids: at this price he's yours if nothing changes."}</b>
          <span className="dim2"> Teams can still join or drop out before he decides.</span>
        </Callout>
      ) : (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          <b>{best ? `${league.teams[best.tid].abbrev}'s offer is ahead.` : "No rival bids, so he'll hold out for his asking price."}</b>{' '}
          {standing.toLead !== null ? (
            <button className="btn xs" style={{ marginTop: 4 }} onClick={() => onAmount(standing.toLead!)}>
              {best ? 'Lead with' : 'Offer'} {fmtM(standing.toLead, 2)}
            </button>
          ) : (
            <span className="dim2">Even a max offer wouldn't top theirs now.</span>
          )}
        </Callout>
      )}

      <div className="card tight col" style={{ gap: 6 }}>
        <div className="small bold">What matters to him</div>
        {order.map((k) => (
          <div key={k} className="row between small" style={{ gap: 8 }}>
            <span className="row" style={{ gap: 6 }}>
              {fit[k].ok === true ? (
                <Check size={15} className="good" role="img" aria-label="Your team fits" />
              ) : fit[k].ok === false ? (
                <X size={15} className="bad" role="img" aria-label="Your team falls short" />
              ) : (
                <Minus size={15} className="dim" role="img" aria-label="Neutral" />
              )}
              <span>
                <b>{LABEL[k]}</b> <span className="dim">{weight(prefs[k])}</span>
              </span>
            </span>
            <span className="tiny dim2">{fit[k].note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
