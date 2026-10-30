// A last look before a deal you'd regret goes through: one that gives up much more neutral value than
// it gets, or moves a first-round pick. What each side sends and what it does to your books, with the
// trade one more tap away.
import { Handshake } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, playerName } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import { capSalary, evaluateTrade, type TradeEval, type TradeOffer } from '../../core/league/trades';
import { pickName } from '../draft/common';
import { useLeagueMemo } from '../../state/store';
import { Sheet } from '../components/ui';
import { capSeason } from '../office/common';
import { PayrollLine, Side, type Item } from './CounterSheet';
import { TradeNotes } from './common';
import { moneyExact } from '../../core/format';

/** Your warning in their verdict: by neutral value you'd give up much more than you get (see tradeNotes). */
export const overpayNote = (ev: TradeEval) => ev.notes.find((n) => n.tone === 'warn');

/** Whether a deal they'd take should be confirmed first: you overpay by neutral value, or a first-round pick (or the right to swap one) moves. */
export function needsConfirm(league: League, offer: TradeOffer, ev: TradeEval): boolean {
  const first = (dpids: number[]) => dpids.some((d) => league.draftPicks.find((x) => x.dpid === d)?.round === 1);
  return !!overpayNote(ev) || first(offer.a.dpids) || first(offer.b.dpids) || !!offer.a.swaps?.length || !!offer.b.swaps?.length;
}

export function ConfirmSheet({ league, offer, onClose, onConfirm }: { league: League; offer: TradeOffer | null; onClose: () => void; onConfirm: (o: TradeOffer) => void }) {
  return (
    <Sheet open={!!offer} onClose={onClose} title={offer ? `Trade with the ${league.teams[offer.b.tid].name}?` : undefined}>
      {offer && <Body league={league} offer={offer} onClose={onClose} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function Body({ league, offer, onClose, onConfirm }: { league: League; offer: TradeOffer; onClose: () => void; onConfirm: (o: TradeOffer) => void }) {
  const user = league.userTid;
  const s = capSeason(league);
  const key = JSON.stringify(offer);
  const info = useLeagueMemo(
    () =>
      withHoldsMemo(() => {
        const ev = evaluateTrade(league, offer);
        const out = offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
        const inc = offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
        return { ev, out, inc, after: capPayroll(league, user, s) - out + inc };
      }),
    // key stands for the offer
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, key, user, s],
  );
  const items = (side: TradeOffer['a']): Item[] => [
    ...side.pids.map((pid) => ({ key: `p${pid}`, name: playerName(league.players[pid]) })),
    ...side.dpids.map((d) => {
      const dp = league.draftPicks.find((x) => x.dpid === d);
      return { key: `d${d}`, name: dp ? pickName(league, dp, { protection: side.protect?.[d] }) : 'a pick' };
    }),
    ...(side.swaps ?? []).map((y) => ({ key: `s${y}`, name: `${y} swap right` })),
    ...(side.cash ? [{ key: 'c', name: `${moneyExact(side.cash)} cash` }] : []),
  ];
  const warn = overpayNote(info.ev);
  return (
    <div className="col fo-sheet">
      {warn ? <TradeNotes notes={[warn]} /> : <p className="fo-lede">A first-round pick moves in this deal. Once it's made, it can't be undone.</p>}
      <div className="fo-counter-sides">
        <Side title="You send" items={items(offer.a)} />
        <Side title="You get" items={items(offer.b)} />
      </div>
      <PayrollLine cap={CAP_FOR(league, s)} out={info.out} inc={info.inc} after={info.after} />
      <div className="row">
        <button className="btn grow" onClick={onClose}>
          Back
        </button>
        <button className="btn primary grow" disabled={!info.ev.accept} onClick={() => onConfirm(offer)}>
          <Handshake size={16} /> Make the trade
        </button>
      </div>
    </div>
  );
}
