// What a top free agent weighs before he decides on your offer (the Free Agents offer sheet): his
// decision day, who else is bidding, where your offer stands now, and how your team fits what
// matters to him.
import { Check, Gavel, Minus, TriangleAlert, X } from 'lucide-react';
import type { Player } from '../../core/types';
import { PREF_KEYS, type PlayerPrefs, appealTerms, askingContract, playerPrefs, willSign } from '../../core/league/contracts';
import { MARKET_HOLD_DAYS, MARKET_STEP, bidDecideDay, bidRivals, bidStanding, marketMoney, pendingBid, withdrawBid } from '../../core/league/freeAgency';
import { useLeague, useLeagueMemo } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Callout, Line, forYears } from './common';
import { moneyExact } from '../../core/format';

const LABEL: Record<keyof PlayerPrefs, string> = { winning: 'Winning', money: 'Money', role: 'Playing time', market: 'Market' };

/** How much a priority weighs, in words (weights average 1). */
const weight = (w: number) => (w >= 1.25 ? 'matters a lot' : w >= 0.85 ? 'matters' : 'matters a little');

export function BidPanel({ p, amount, years, floor, onAmount }: { p: Player; amount: number; years: number; floor: number; onAmount: (v: number) => void }) {
  const league = useLeague();
  const tid = league.userTid;
  // rival bids don't depend on the slider: work them out once per league change
  const offers = useLeagueMemo(() => bidRivals(league, p), [league, p]);
  const standing = bidStanding(league, p, amount, years, offers);
  const prefs = playerPrefs(league, p);
  const terms = useLeagueMemo(() => appealTerms(league, tid, p), [league, tid, p]);
  const decide = bidDecideDay(league, p.pid);
  const when = decide > league.faDay ? `on day ${decide + 1}` : 'when free agency closes';
  const bid = pendingBid(league, p.pid);
  const rivals = offers.map((o) => league.teams[o.tid].abbrev);
  const best = offers[0];
  const atAsk = willSign(league, p, tid, amount, years).ok;
  // the market's read: the most an AI team could pay him now, against his price (see marketMoney)
  const room = useLeagueMemo(() => (league.phase === 'freeAgency' ? marketMoney(league, p) : null), [league, p]);
  const ask = askingContract(league, p).amount;
  const dry = room !== null && room < ask * 0.9;
  const drops = league.faDay < MARKET_HOLD_DAYS ? `From day ${MARKET_HOLD_DAYS + 2} his price drops` : 'His price drops';

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

  const busy = useBusy();
  const withdraw = () => settle('Withdrawing your offer', (l) => withdrawBid(l, p.pid), 'neutral');

  return (
    <section className="fo-bid" aria-label="Competing offers">
      <Callout icon={<Gavel size={18} className="dim" />}>
        <b>He weighs offers and decides {when}.</b>{' '}
        {rivals.length ? `Bidding: ${rivals.slice(0, 2).join(', ')}${rivals.length > 2 ? `, +${rivals.length - 2}` : ''}.` : 'No other team is bidding yet.'}
        {dry && (
          <div className="small dim2">
            {room! > 0
              ? `No other team can pay his ask: the most one could is about ${moneyExact(Math.round(room! / 100) * 100)}.`
              : 'No other team has room for him past the minimum.'}{' '}
            {drops} {Math.round(MARKET_STEP * 100)}% a day toward it, and he signs where the money is.
          </div>
        )}
        {bid && (
          <div className="fo-bid-mine">
            <span className="small dim2">
              Your offer: {moneyExact(bid.amount)} {forYears(bid.years)}
            </span>
            <button className="btn xs" disabled={busy} onClick={withdraw}>
              Withdraw
            </button>
          </div>
        )}
      </Callout>

      {amount < floor ? (
        <Callout tone="bad" icon={<X size={18} className="bad" />}>
          <b>Too low to consider.</b> Not under {moneyExact(floor)} a season for {years} year{years > 1 ? 's' : ''}.
        </Callout>
      ) : standing.leads ? (
        <Callout tone="good" icon={<Check size={18} className="good" />}>
          <b>{best ? 'Your offer leads right now.' : "No rival bids: at this price he's yours if nothing changes."}</b> Teams can still join or drop out.
        </Callout>
      ) : (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          <b>{best ? `${league.teams[best.tid].abbrev}'s offer is ahead.` : "No rival bids, so he'll hold out for his ask."}</b>{' '}
          {standing.toLead !== null ? (
            <button className="btn xs fo-lead" onClick={() => onAmount(standing.toLead!)}>
              {best ? 'Lead with' : 'Offer'} {moneyExact(standing.toLead)}
            </button>
          ) : (
            'Even a max offer would not top theirs now.'
          )}
        </Callout>
      )}

      <div className="fo-lines">
        <div className="over fo-lines-h">What matters to him</div>
        {order.map((k) => (
          <Line
            key={k}
            k={
              <span className="fo-fit">
                {fit[k].ok === true ? (
                  <Check size={15} className="good" role="img" aria-label="Your team fits" />
                ) : fit[k].ok === false ? (
                  <X size={15} className="bad" role="img" aria-label="Your team falls short" />
                ) : (
                  <Minus size={15} className="dim" role="img" aria-label="Neutral" />
                )}
                <b>{LABEL[k]}</b> <span className="dim">{weight(prefs[k])}</span>
              </span>
            }
          >
            <span className="small dim2">{fit[k].note}</span>
          </Line>
        ))}
      </div>
    </section>
  );
}
