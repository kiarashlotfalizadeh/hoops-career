// Draft-day trades for one pick of this season's draft. Another team's pick: what it would want
// from you for it ("what would make this work?"), with Accept. Your own: the best package each
// team would give you for it (trading down), each with Accept. After a deal on draft night the
// draft carries on as after a pick (to your next turn, unless it stops before every pick).
import { Check, Ticket } from 'lucide-react';
import type { DraftPick, League } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { continueDraft } from '../../core/league/season';
import { evaluateTrade, executeTrade, makeItWork, pickLabel, type TradeOffer } from '../../core/league/trades';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Ovr, Sheet } from '../components/ui';
import { overallPick } from '../league/shared';
import { STRATEGY_META } from './common';
import { blockOffers } from './tradeBlock';

/** Make the deal (checked again first) and let the draft carry on. */
function take(offer: TradeOffer, onDone: () => void) {
  let msg = '';
  let ok = false;
  useStore.getState().mutate((l) => {
    const ev = evaluateTrade(l, offer);
    if (!ev.accept) {
      msg = ev.message;
      return;
    }
    executeTrade(l, offer);
    continueDraft(l);
    ok = true;
  });
  useStore.getState().toast(ok ? 'Trade done.' : msg, ok ? 'good' : 'bad');
  if (ok) onDone();
}

export function PickTradeSheet({ dpid, onClose }: { dpid: number | null; onClose: () => void }) {
  const league = useLeague();
  const dp = dpid !== null ? league.draftPicks.find((d) => d.dpid === dpid) : undefined;
  const n = dp?.pick ? overallPick(league, dp.round, dp.pick) : null;
  const mine = dp?.tid === league.userTid;
  return (
    <Sheet open={!!dp} onClose={onClose} title={dp ? (mine ? `Offers for ${n ? `#${n}` : 'your pick'}` : `Trade for ${n ? `#${n}` : pickLabel(league, dp)}`) : undefined}>
      {dp && (mine ? <OffersFor league={league} dp={dp} onDone={onClose} /> : <TradeFor league={league} dp={dp} onDone={onClose} />)}
    </Sheet>
  );
}

/** What the team holding the pick wants for it. */
function TradeFor({ league, dp, onDone }: { league: League; dp: DraftPick; onDone: () => void }) {
  const ask = useLeagueMemo(
    () => makeItWork(league, { a: { tid: league.userTid, pids: [], dpids: [] }, b: { tid: dp.tid, pids: [], dpids: [dp.dpid] } }),
    [league, dp.tid, dp.dpid],
  );
  const t = league.teams[dp.tid];
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        <TeamLogo tid={dp.tid} size={34} decorative />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">
            {t.region} {t.name}
          </div>
          <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>
        </div>
      </div>
      {!ask.offer ? (
        <Empty>
          {ask.why === 'salary'
            ? `The ${t.name} would want salary back, and no player (or pair) of yours makes it match.`
            : `Nothing you can offer gets the ${t.name} to move ${pickLabel(league, dp)}.`}
        </Empty>
      ) : (
        <>
          <div className="small dim2">The {t.name} would move it for:</div>
          <Assets league={league} side={ask.offer.a} />
          <button className="btn good block" onClick={() => take(ask.offer, onDone)}>
            <Check size={16} /> Accept: get {pickLabel(league, dp)}
          </button>
        </>
      )}
    </div>
  );
}

/** Each team's best package for the user's pick (trading down). */
function OffersFor({ league, dp, onDone }: { league: League; dp: DraftPick; onDone: () => void }) {
  const offers = useLeagueMemo(() => blockOffers(league, { pids: [], dpids: [dp.dpid] }), [league, dp.dpid]);
  if (!offers.length) return <Empty>No team has a package for {pickLabel(league, dp)} right now.</Empty>;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="small dim2">The best package each team would give you for {pickLabel(league, dp)}, most valuable to you first.</div>
      {offers.slice(0, 8).map((o) => {
        const t = league.teams[o.tid];
        return (
          <div key={o.tid} className="card tight">
            <div className="row" style={{ gap: 8 }}>
              <TeamLogo tid={o.tid} size={26} decorative />
              <span className="bold grow ellipsis">
                {t.region} {t.name}
              </span>
              <span className="tiny dim num">{o.targetValue > 0 ? `${Math.round((o.myValue / o.targetValue) * 100)}% of its value` : ''}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Assets league={league} side={o.offer.b} />
            </div>
            <button className="btn sm good block" style={{ marginTop: 8 }} onClick={() => take(o.offer, onDone)}>
              <Check size={15} /> Accept
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Assets({ league, side }: { league: League; side: TradeOffer['a'] }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      {side.pids.map((pid) => {
        const p = league.players[pid];
        return (
          <div key={pid} className="row" style={{ gap: 8 }}>
            <Ovr v={p.ovr} size="sm" />
            <span className="small bold ellipsis grow">{playerName(p)}</span>
            <span className="tiny dim">{p.pos}</span>
          </div>
        );
      })}
      {side.dpids.map((d) => {
        const x = league.draftPicks.find((y) => y.dpid === d);
        return x ? (
          <div key={d} className="row" style={{ gap: 8 }}>
            <Ticket size={16} className="dim" style={{ width: 28 }} />
            <span className="small bold ellipsis">{pickLabel(league, x)}</span>
          </div>
        ) : null;
      })}
      {!side.pids.length && !side.dpids.length && <div className="small dim">Nothing</div>}
    </div>
  );
}
