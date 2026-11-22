// A last look before a deal you'd regret goes through: one that gives up much more neutral value than
// it gets, moves a first-round pick, changes who starts or sends a young player away. What each side
// sends, what it does to your rotation (who starts, who loses minutes), the need it fills and the one
// it opens, the future you give up, and what it does to your books, with the trade one more tap away.
import { ordinal } from '../../core/format';
import { Handshake } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, playerName, teamCity, payroll } from '../../core/league/helpers';
import { capSalary, evaluateTrade, type TradeEval, type TradeOffer } from '../../core/league/trades';
import { changesStarters, tradeImpact, type TradeImpact } from '../../core/league/tradeImpact';
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
  if (!!overpayNote(ev) || first(offer.a.dpids) || first(offer.b.dpids) || !!offer.a.swaps?.length || !!offer.b.swaps?.length) return true;
  // (a deal that changes who starts, or gives up some of the future, gets its last look too)
  const im = tradeImpact(league, offer);
  return changesStarters(im) || im.future.length > 0;
}

export function ConfirmSheet({ league, offer, onClose, onConfirm }: { league: League; offer: TradeOffer | null; onClose: () => void; onConfirm: (o: TradeOffer) => void }) {
  return (
    <Sheet open={!!offer} onClose={onClose} title={offer ? `Trade with ${teamCity(league, offer.b.tid)}?` : undefined}>
      {offer && <Body league={league} offer={offer} onClose={onClose} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function Body({ league, offer, onClose, onConfirm }: { league: League; offer: TradeOffer; onClose: () => void; onConfirm: (o: TradeOffer) => void }) {
  const user = league.userTid;
  const s = capSeason(league);
  const key = JSON.stringify(offer);
  const info = useLeagueMemo(
    () => {
      const ev = evaluateTrade(league, offer);
      const out = offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
      const inc = offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
      return { ev, out, inc, after: payroll(league, user, s) - out + inc, im: tradeImpact(league, offer) };
    },
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
  const first = [...offer.a.dpids, ...offer.b.dpids].some((d) => league.draftPicks.find((x) => x.dpid === d)?.round === 1);
  return (
    <div className="col fo-sheet">
      {warn ? (
        <TradeNotes notes={[warn]} />
      ) : (
        <p className="fo-lede">{first ? "A first-round pick moves in this deal. Once it's made, it can't be undone." : "Once it's made, it can't be undone."}</p>
      )}
      <div className="fo-counter-sides">
        <Side title="You send" items={items(offer.a)} />
        <Side title="You get" items={items(offer.b)} />
      </div>
      <ImpactList im={info.im} />
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

/**
 * What a deal does to the user's team, in a few lines (see tradeImpact): the need it fills and the one
 * it opens, who starts and who goes to the bench, minutes that move, and the future given up.
 */
export function ImpactList({ im }: { im: TradeImpact }) {
  const up = im.moves.filter((m) => m.startsWith && !m.startsNow);
  const down = im.moves.filter((m) => m.startsNow && !m.startsWith && m.dealt !== 'out');
  const rest = im.moves.filter((m) => !up.includes(m) && !down.includes(m) && !m.dealt);
  const names = (ms: typeof im.moves) => ms.map((m) => `${m.name}${m.dealt === 'in' ? ' (new)' : ''}`).join(', ');
  return (
    <div className="fo-impact">
      <div className="over">With the deal · {im.manual ? 'your rotation as you set it' : "your staff's rotation"}</div>
      <ul className="fo-impact-l small">
        {(im.adds || im.costs) && (
          <li>
            {im.adds ? `It adds ${im.adds}` : 'It adds nothing your best eight lacked'}
            {im.costs ? `, and costs you ${im.costs}.` : '.'}
          </li>
        )}
        {im.need && (
          <li>
            {im.needBy === 'you' ? 'Your priority' : "Staff's read of your need"}, {im.need.label.toLowerCase()}:{' '}
            {im.need.from === im.need.to && im.need.rankTo === im.need.rankFrom
              ? `still ${im.need.from}, the deal doesn't touch it`
              : `${im.need.from} → ${im.need.to} (${ordinal(im.need.rankFrom)} → ${ordinal(im.need.rankTo)} in the league)`}
            , read with the staff&apos;s minutes both ways{im.need.minutes > 0 ? `: ${im.need.minutes} a game for who comes in` : ''}.
            {im.needCoach ? ` Coaching alternative: your setting “${im.needCoach.text}” costs it (${im.needCoach.to} without).` : ''}
          </li>
        )}
        {up.length > 0 && <li>Into the starting five: {names(up)}.</li>}
        {down.length > 0 && <li>To the bench: {names(down)}.</li>}
        {rest.length > 0 && <li>Minutes a game: {rest.map((m) => `${m.name} ${m.from} → ${m.to}`).join(', ')}.</li>}
        {!up.length && !down.length && !rest.length && <li>Your starting five and minutes stay about the same.</li>}
        {im.manual && im.moves.some((m) => m.dealt === 'in') && (
          <li className="dim">You run the rotation: who comes in sits at the end of your depth chart until you place him.</li>
        )}
        {im.future.length > 0 && <li>For later, you give up: {im.future.join('; ')}.</li>}
      </ul>
    </div>
  );
}
