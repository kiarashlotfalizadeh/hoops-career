// When an AI team turns a deal down: the versions it would take instead, each with what changes,
// what it does to your payroll, and buttons to make it or to edit it in the builder.
import { Handshake, Minus, PackagePlus, Plus } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, playerName } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import { capSalary, evaluateTrade, pickLabel, type TradeOffer } from '../../core/league/trades';
import { type CounterOffer } from '../../core/league/tradeHelp';
import { useLeagueMemo } from '../../state/store';
import { Sheet } from '../components/ui';
import { capSeason } from '../office/common';
import { TradeNotes } from './common';
import { money, moneyExact } from '../../core/format';

const KIND = {
  add: { icon: Plus, tone: 'info' },
  remove: { icon: Minus, tone: 'warn' },
  absorb: { icon: PackagePlus, tone: 'bad' },
} as const;

export function CounterSheet({
  league,
  base,
  counters,
  onClose,
  onAccept,
  onEdit,
}: {
  league: League;
  /** The deal they turned down. */
  base: TradeOffer | null;
  counters: CounterOffer[];
  onClose: () => void;
  onAccept: (o: TradeOffer) => void;
  onEdit: (o: TradeOffer) => void;
}) {
  const open = !!base && counters.length > 0;
  return (
    <Sheet open={open} onClose={onClose} title={base ? `The ${league.teams[base.b.tid].name} say no` : undefined}>
      {open && base && (
        <div className="col fo-sheet">
          <p className="fo-lede">
            {counters.length === 1
              ? "But they'd take this version now."
              : `But they'd take any of these ${counters.length} versions now, the best for you first (by league-neutral value).`}
          </p>
          <div className="card flush list">
            {counters.map((c, i) => (
              <CounterCard key={`${i}:${c.label}`} league={league} base={base} c={c} onAccept={onAccept} onEdit={onEdit} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

interface Item {
  key: string;
  name: string;
  /** new in this version, or gone from the deal you proposed */
  change?: 'added' | 'dropped';
}

function CounterCard({
  league,
  base,
  c,
  onAccept,
  onEdit,
}: {
  league: League;
  base: TradeOffer;
  c: CounterOffer;
  onAccept: (o: TradeOffer) => void;
  onEdit: (o: TradeOffer) => void;
}) {
  const user = league.userTid;
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const key = JSON.stringify(c.offer);
  // in the summer each team's cap holds replay its re-signing plan: once per card, not every render
  const info = useLeagueMemo(
    () =>
      withHoldsMemo(() => {
        const out = c.offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
        const inc = c.offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
        // a warning for you (giving up far more than you get) is worth repeating here
        const warn = evaluateTrade(league, c.offer).notes.filter((n) => n.tone === 'warn');
        return { out, inc, after: capPayroll(league, user, s) - out + inc, warn };
      }),
    // key stands for the counter's offer
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, key, user, s],
  );
  // a pick with the protection its side puts on it in that version of the deal
  const pick = (d: number, side: TradeOffer['a']) => {
    const dp = league.draftPicks.find((x) => x.dpid === d);
    return dp ? pickLabel(league, dp, { protection: side.protect?.[d] }) : 'a pick';
  };
  const items = (now: TradeOffer['a'], was: TradeOffer['a']): Item[] => [
    ...now.pids.map((pid) => ({ key: `p${pid}`, name: playerName(league.players[pid]), change: was.pids.includes(pid) ? undefined : ('added' as const) })),
    ...now.dpids.map((d) => ({ key: `d${d}`, name: pick(d, now), change: was.dpids.includes(d) ? undefined : ('added' as const) })),
    ...(now.swaps ?? []).map((y) => ({ key: `s${y}`, name: `${y} swap right`, change: was.swaps?.includes(y) ? undefined : ('added' as const) })),
    ...(now.cash ? [{ key: 'c', name: `${moneyExact(now.cash)} cash`, change: was.cash === now.cash ? undefined : ('added' as const) }] : []),
    ...was.pids.filter((pid) => !now.pids.includes(pid)).map((pid) => ({ key: `p${pid}`, name: playerName(league.players[pid]), change: 'dropped' as const })),
    ...was.dpids.filter((d) => !now.dpids.includes(d)).map((d) => ({ key: `d${d}`, name: pick(d, was), change: 'dropped' as const })),
    ...(was.swaps ?? []).filter((y) => !now.swaps?.includes(y)).map((y) => ({ key: `s${y}`, name: `${y} swap right`, change: 'dropped' as const })),
    ...(was.cash && !now.cash ? [{ key: 'c', name: `${moneyExact(was.cash)} cash`, change: 'dropped' as const }] : []),
  ];
  const k = KIND[c.kind];
  const Icon = k.icon;
  return (
    <section className="fo-counter">
      <div className="fo-counter-h">
        <span className={`fo-counter-ic ${k.tone}`} aria-hidden="true">
          <Icon size={15} />
        </span>
        <div className="grow bold">{c.label}</div>
      </div>
      <div className="fo-counter-sides">
        <Side title="You send" items={items(c.offer.a, base.a)} />
        <Side title="You get" items={items(c.offer.b, base.b)} />
      </div>
      <div className="tiny dim num">
        {info.inc >= info.out ? 'You take on' : 'You shed'} {money(Math.abs(info.inc - info.out))} in salary · payroll after{' '}
        <b className={info.after > cap.luxuryTax ? 'bad' : info.after > cap.salaryCap ? 'warn' : 'good'}>{money(info.after)}</b>
        {info.after > cap.secondApron
          ? `, ${money(info.after - cap.secondApron)} over the second apron`
          : info.after > cap.firstApron
            ? `, ${money(info.after - cap.firstApron)} over the first apron`
            : info.after > cap.luxuryTax
              ? `, ${money(info.after - cap.luxuryTax)} over the tax`
              : info.after > cap.salaryCap
                ? `, ${money(info.after - cap.salaryCap)} over the cap`
                : `, ${money(cap.salaryCap - info.after)} in cap space`}
      </div>
      {info.warn.length > 0 && <TradeNotes notes={info.warn} />}
      <div className="row">
        <button className="btn sm grow" onClick={() => onEdit(c.offer)} aria-label={`Edit in builder: ${c.label}`}>
          Edit in builder
        </button>
        <button className="btn sm good grow" onClick={() => onAccept(c.offer)} aria-label={`Accept: ${c.label}`}>
          <Handshake size={16} /> Accept
        </button>
      </div>
    </section>
  );
}

function Side({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="fo-counter-side">
      <span className="over">{title}</span>
      <span className="grow">
        {items.length === 0 && <span className="dim">Nothing</span>}
        {items.map((x, i) => (
          <span key={x.key}>
            {i > 0 && <span className="dim">, </span>}
            {x.change === 'added' ? (
              <b className="accent-text">
                + {x.name}
                <span className="sr-only"> (added)</span>
              </b>
            ) : x.change === 'dropped' ? (
              <s className="dim">
                {x.name}
                <span className="sr-only"> (dropped)</span>
              </s>
            ) : (
              x.name
            )}
          </span>
        ))}
      </span>
    </div>
  );
}
