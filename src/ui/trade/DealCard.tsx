// The deal so far: what each side sends, with a protection on each own first going out, and the
// terms in words. Nothing while the deal is empty (the dock says to tap players or picks).
import { ArrowLeftRight, Banknote, Repeat, RotateCcw, Ticket, X } from 'lucide-react';
import type { League } from '../../core/types';
import { pickLabel, type TradeOffer } from '../../core/league/trades';
import { teamPlayers } from '../../core/league/helpers';
import { rosterNames } from '../stats';
import { TeamLogo } from '../components/TeamLogo';
import { Ovr, Section } from '../components/ui';
import { ProtectSelect, TermsList, protectable } from './Terms';
import { moneyExact } from '../../core/format';
import { type Sel } from './sel';

export function DealCard({
  league,
  partner,
  offer,
  give,
  get,
  onGive,
  onGet,
  onReset,
}: {
  league: League;
  partner: number;
  offer: TradeOffer;
  give: Sel;
  get: Sel;
  onGive: (s: Sel) => void;
  onGet: (s: Sel) => void;
  onReset: () => void;
}) {
  const size = (s: Sel) => s.pids.length + s.dpids.length + (s.swaps?.length ?? 0) + (s.cash ? 1 : 0);
  const any = size(give) + size(get) > 0;
  const protect = (sel: Sel, set: (s: Sel) => void, d: number, n: number) => {
    const next = { ...sel.protect };
    if (n) next[d] = n;
    else delete next[d];
    set({ ...sel, protect: next });
  };
  // teammates who share a last name told apart, as in the lists below
  const nameOf = (tid: number) => rosterNames(teamPlayers(league, tid));
  const col = (title: string, tid: number, sel: Sel, set: (s: Sel) => void) => (
    <div className="fo-deal-col">
      <div className="fo-deal-h">
        <TeamLogo tid={tid} size={18} decorative />
        <span className="over">{title}</span>
      </div>
      {size(sel) === 0 && <div className="fo-deal-none">Nothing yet</div>}
      {sel.pids.map((pid) => {
        const p = league.players[pid];
        return (
          <span key={pid} className="fo-pill">
            <Ovr v={p.ovr} size="sm" />
            <span className="ellipsis grow">{nameOf(tid)(pid)}</span>
            <button className="x" aria-label={`Remove ${nameOf(tid)(pid)}`} onClick={() => set({ ...sel, pids: sel.pids.filter((x) => x !== pid) })}>
              <X size={14} />
            </button>
          </span>
        );
      })}
      {sel.dpids.map((d) => {
        const dp = league.draftPicks.find((x) => x.dpid === d)!;
        // a protection being set shows in its drop-down, one it already carries in its name
        const open = protectable(league, dp, tid);
        const label = pickLabel(league, dp);
        return (
          <div key={d} className="fo-deal-pick">
            <span className="fo-pill">
              <Ticket size={15} className="fo-pill-ic" />
              <span className="ellipsis grow">{label}</span>
              <button className="x" aria-label={`Remove ${label}`} onClick={() => set({ ...sel, dpids: sel.dpids.filter((x) => x !== d) })}>
                <X size={14} />
              </button>
            </span>
            {/* a team's own first can go out protected */}
            {open && <ProtectSelect dp={dp} value={sel.protect?.[d] ?? 0} onChange={(n) => protect(sel, set, d, n)} />}
          </div>
        );
      })}
      {(sel.swaps ?? []).map((y) => (
        <span key={`s${y}`} className="fo-pill">
          <Repeat size={14} className="fo-pill-ic" />
          <span className="ellipsis grow">{y} swap right</span>
          <button className="x" aria-label={`Remove the ${y} swap right`} onClick={() => set({ ...sel, swaps: sel.swaps!.filter((x) => x !== y) })}>
            <X size={14} />
          </button>
        </span>
      ))}
      {(sel.cash ?? 0) > 0 && (
        <span className="fo-pill">
          <Banknote size={15} className="fo-pill-ic" />
          <span className="ellipsis grow">{moneyExact(sel.cash!)} cash</span>
          <button className="x" aria-label="Remove the cash" onClick={() => set({ ...sel, cash: 0 })}>
            <X size={14} />
          </button>
        </span>
      )}
    </div>
  );
  if (!any) return null;
  return (
    <Section
      title="The deal"
      right={
        <button className="btn xs ghost" onClick={onReset}>
          <RotateCcw size={13} /> Clear
        </button>
      }
    >
      <div className="card fo-deal">
        <div className="fo-deal-cols">
          {col('You send', league.userTid, give, onGive)}
          <span className="fo-deal-swap" aria-hidden="true">
            <ArrowLeftRight size={16} />
          </span>
          {col('You get', partner, get, onGet)}
        </div>
        <TermsList league={league} offer={offer} />
      </div>
    </Section>
  );
}
