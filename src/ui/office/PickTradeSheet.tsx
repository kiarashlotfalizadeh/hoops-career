// Draft-day trades for one pick of this season's draft. Another team's pick: what it would want
// from you for it ("what would make this work?"), with Accept. Your own: the best package each
// team would give you for it (trading down), each with Accept. After a deal on draft night the
// draft carries on as after a pick (to your next turn, unless it stops before every pick).
import { Check, Ticket } from 'lucide-react';
import type { DraftPick, League } from '../../core/types';
import { playerName, sentence } from '../../core/league/helpers';
import { pickLabel, type TradeOffer } from '../../core/league/trades';
import { pickName } from '../draft/common';
import { makeItWork } from '../../core/league/tradeHelp';
import { useLeague, useLeagueMemo } from '../../state/store';
import { makeTrade, useBusy } from '../../state/actions/office';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Ovr, Sheet } from '../components/ui';
import { overallPick } from '../league/shared';
import { STRATEGY_META } from './common';
import { blockOffers } from './tradeBlock';
import { packageWord } from '../trade/TradingBlock';

/** Make the deal (checked again first) and let the draft carry on. */
function take(league: League, offer: TradeOffer, onDone: () => void) {
  if (makeTrade(league, offer, 'The draft-day trade')) onDone();
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
  const busy = useBusy();
  const ask = useLeagueMemo(
    () => makeItWork(league, { a: { tid: league.userTid, pids: [], dpids: [] }, b: { tid: dp.tid, pids: [], dpids: [dp.dpid] } }),
    [league, dp.tid, dp.dpid],
  );
  const t = league.teams[dp.tid];
  return (
    <div className="col fo-sheet">
      <div className="fo-pkg-h">
        <TeamLogo tid={dp.tid} size={34} decorative />
        <div className="grow">
          <div className="fo-name">
            {t.region} {t.name}
          </div>
          <div className="fo-meta">{STRATEGY_META[t.strategy].label}</div>
        </div>
      </div>
      {!ask.offer ? (
        <Empty>
          {ask.why === 'salary'
            ? `The ${t.name} would want salary back, and no one or two of your players make it match.`
            : sentence(`Nothing you can offer gets the ${t.name} to move the ${pickLabel(league, dp)}`)}
        </Empty>
      ) : (
        <>
          <div className="over">They'd move it for</div>
          <div className="card flush">
            <Assets league={league} side={ask.offer.a} />
          </div>
          <button className="btn good block" disabled={busy} onClick={() => take(league, ask.offer, onDone)}>
            <Check size={16} /> Accept: get {pickLabel(league, dp)}
          </button>
        </>
      )}
    </div>
  );
}

/** Each team's best package for the user's pick (trading down). */
function OffersFor({ league, dp, onDone }: { league: League; dp: DraftPick; onDone: () => void }) {
  const busy = useBusy();
  const offers = useLeagueMemo(() => blockOffers(league, { pids: [], dpids: [dp.dpid] }), [league, dp.dpid]);
  if (!offers.length) return <Empty>No team has a package for {pickLabel(league, dp)} right now.</Empty>;
  return (
    <div className="col fo-sheet">
      <p className="fo-lede">Each team's best package for {pickLabel(league, dp)}, most valuable to you first.</p>
      <div className="card flush list">
        {offers.slice(0, 8).map((o) => {
          const t = league.teams[o.tid];
          return (
            <div key={o.tid} className="fo-pkg">
              <div className="fo-pkg-h">
                <TeamLogo tid={o.tid} size={28} decorative />
                <span className="fo-name grow">
                  {t.region} {t.name}
                </span>
                {o.neutralGive > 0 && <span className={`tag ${packageWord(o.neutralGive, o.neutralGet).c}`}>{packageWord(o.neutralGive, o.neutralGet).l}</span>}
              </div>
              <Assets league={league} side={o.offer.b} />
              <button className="btn sm good block" disabled={busy} onClick={() => take(league, o.offer, onDone)}>
                <Check size={15} /> Accept
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Assets({ league, side }: { league: League; side: TradeOffer['a'] }) {
  return (
    <div className="fo-pkg-items fo-pkg-flat">
      {side.pids.map((pid) => {
        const p = league.players[pid];
        return (
          <div key={pid} className="fo-pkg-item">
            <Ovr v={p.ovr} size="sm" />
            <span className="grow ellipsis bold">{playerName(p)}</span>
            <span className="dim">{p.pos}</span>
          </div>
        );
      })}
      {side.dpids.map((d) => {
        const x = league.draftPicks.find((y) => y.dpid === d);
        return x ? (
          <div key={d} className="fo-pkg-item">
            <Ticket size={16} className="dim fo-pkg-ic" />
            <span className="grow ellipsis bold">{pickName(league, x)}</span>
          </div>
        ) : null;
      })}
      {!side.pids.length && !side.dpids.length && <div className="small dim">Nothing</div>}
    </div>
  );
}
