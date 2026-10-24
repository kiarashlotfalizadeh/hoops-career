// The Trade screen's Offers tab: AI teams' open offers to the user (see core/league/proposals.ts).
// Each is its agenda row (the pitch, how long it stands, Accept / Turn down, settled in place) over
// what goes each way and the payroll it leaves, with Review to open it in the trade builder.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PencilLine, Ticket } from 'lucide-react';
import type { League, Proposal } from '../../core/types';
import { CAP_FOR, payroll, playerName } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import { declineProposal, openProposals, proposalError } from '../../core/league/proposals';
import { agenda, type AgendaItem } from '../../core/league/agenda';
import { capSalary, pickLabel, type TradeOffer } from '../../core/league/trades';
import { neutralBalance } from '../../core/league/tradePackages';
import { salaryFor } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { act } from '../../state/actions';
import { AgendaRow } from '../components/Agenda';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, More, Ovr } from '../components/ui';
import { capSeason, contractEnd, salaryText, taxLine } from './common';
import { useBusy } from '../../state/actions/office';
import { money } from '../../core/format';

export function OffersTab({ league, closed, focus, onReview }: { league: League; closed: boolean; focus?: number | null; onReview: (o: TradeOffer) => void }) {
  const offers = openProposals(league);
  // why each can't be taken right now (another deal moved a player since), worked out once per change
  const errors = useLeagueMemo(() => withHoldsMemo(() => new Map(openProposals(league).map((p) => [p.id, proposalError(league, p)]))), [league]);
  const items = useLeagueMemo(() => new Map(agenda(league).flatMap((i) => (i.kind === 'tradeOffer' ? [[i.id, i] as const] : []))), [league]);
  if (!offers.length)
    return closed ? (
      <Empty>No offers until trading reopens.</Empty>
    ) : (
      <div className="empty">
        No offers right now.
        <More label="When teams call">
          <p className="small">
            About once every ten days in season and more often before the deadline, for your first-round pick on draft night, and with salary dumps when free agency opens if you
            have cap space.
          </p>
        </More>
      </div>
    );
  return (
    <div className="col fo-offers">
      {[...offers]
        .sort((a, b) => Number(b.id === focus) - Number(a.id === focus) || a.expires - b.expires || a.id - b.id)
        .map((p) => (
          <OfferCard key={p.id} league={league} p={p} item={items.get(`tradeOffer:${p.id}`)} error={errors.get(p.id) ?? null} focus={p.id === focus} onReview={onReview} />
        ))}
    </div>
  );
}

function OfferCard({
  league,
  p,
  item,
  error,
  focus,
  onReview,
}: {
  league: League;
  p: Proposal;
  item?: AgendaItem;
  error: string | null;
  focus: boolean;
  onReview: (o: TradeOffer) => void;
}) {
  const t = league.teams[p.tid];
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const busy = useBusy();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [focus]);
  const out = p.offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
  const inc = p.offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
  const after = capPayroll(league, league.userTid, s) - out + inc;
  const pay = payroll(league, league.userTid, s);
  const tax = taxLine(league, pay, pay - out + inc, s);
  // in neutral (league) value: every offer is at worst slightly against the user
  const { net, out: worth } = neutralBalance(league, p.offer);
  const share = worth > 0 ? net / worth : net >= 0 ? 1 : -1;
  const verdict = share > 0.05 ? { l: 'In your favor', c: 'good' } : share < -0.05 ? { l: 'A little short', c: 'warn' } : { l: 'Fair value', c: 'info' };
  return (
    <section ref={ref} className={`card flush fo-offer ${focus ? 'focus' : ''}`} aria-label={`Offer from the ${t.region} ${t.name}`}>
      {item && !error ? (
        // (its own screen is this one: the row doesn't link)
        <AgendaRow item={{ ...item, to: undefined }} />
      ) : (
        <div className="ag-row tone-warn">
          <div className="ag-head">
            <div className="grow">
              <div className="ag-title">{t.abbrev}'s offer is off</div>
              <div className="ag-line">{error ?? 'No longer on the table.'}</div>
            </div>
          </div>
          <div className="ag-acts">
            <button className="btn xs" disabled={busy} onClick={() => act('Turning the offer down', (l) => void declineProposal(l, p.id))}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="fo-offer-body">
        <div className="fo-offer-sides">
          <Side league={league} title="You send" side={p.offer.a} />
          <Side league={league} title="You get" side={p.offer.b} />
        </div>
        <div className="row fo-offer-foot">
          <span className={`tag ${verdict.c}`}>{verdict.l}</span>
          <span className="tiny dim num grow">
            Payroll after <b className={after > cap.luxuryTax ? 'bad' : after > cap.salaryCap ? 'warn' : 'good'}>{money(after)}</b>
            {tax ? <span className={tax.tone}> · {tax.text}</span> : after > cap.salaryCap ? ', over the cap' : ''}
          </span>
          <button className="btn xs ghost" disabled={!!error} onClick={() => onReview(p.offer)}>
            <PencilLine size={14} /> Review
          </button>
        </div>
      </div>
    </section>
  );
}

function Side({ league, title, side }: { league: League; title: string; side: TradeOffer['a'] }) {
  const s = capSeason(league);
  return (
    <div className="fo-deal-col">
      <div className="fo-deal-h">
        <TeamLogo tid={side.tid} size={16} decorative />
        <span className="over">{title}</span>
      </div>
      {!side.pids.length && !side.dpids.length && <div className="fo-deal-none">Nothing</div>}
      {side.pids.map((pid) => {
        const p = league.players[pid];
        if (!p) return null;
        return (
          <div key={pid} className="fo-offer-item">
            <Ovr v={p.ovr} size="sm" />
            <div className="grow">
              <Link to={`/player/${pid}`} className="fo-name small">
                {playerName(p)}
              </Link>
              <div className="fo-meta num">
                {salaryText(league, salaryFor(p, s))} · {contractEnd(league, p)}
              </div>
            </div>
          </div>
        );
      })}
      {side.dpids.map((d) => {
        const dp = league.draftPicks.find((x) => x.dpid === d);
        if (!dp) return null;
        return (
          <div key={d} className="fo-offer-item">
            <Ticket size={16} className="dim fo-pkg-ic" />
            <span className="fo-name small">{pickLabel(league, dp)}</span>
          </div>
        );
      })}
    </div>
  );
}
