// The Trade screen's Offers tab: AI teams' open offers to the user (see core/league/proposals.ts),
// each with what goes each way, the salary it moves, the other GM's pitch and how long it stands,
// and Accept, Counter (opens it in the trade builder) and Decline.
import { Link } from 'react-router-dom';
import { Check, Clock, PencilLine, Ticket, X } from 'lucide-react';
import type { League, Proposal } from '../../core/types';
import { CAP_FOR, fmtDate, playerName } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import { acceptProposal, declineProposal, openProposals, proposalError } from '../../core/league/proposals';
import { capSalary, neutralBalance, pickLabel, type TradeOffer } from '../../core/league/trades';
import { playerAge, salaryFor } from '../../core/playerGen';
import { useLeagueMemo, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, More, Ovr, Section } from '../components/ui';
import { Callout, STRATEGY_META, capSeason, fmtM, fmtMs } from './common';
import { continueDraft } from '../../core/league/season';

const KIND_LABEL: Record<Proposal['kind'], string> = { buy: 'Wants your player', sell: 'Selling', dump: 'Salary dump', pick: 'Wants your pick' };

export function OffersTab({ league, closed, onCounter }: { league: League; closed: boolean; onCounter: (o: TradeOffer) => void }) {
  const offers = openProposals(league);
  // why each can't be taken right now (another deal moved a player since), worked out once per change
  const errors = useLeagueMemo(() => withHoldsMemo(() => new Map(openProposals(league).map((p) => [p.id, proposalError(league, p)]))), [league]);
  if (!offers.length)
    return closed ? (
      <Empty>Teams aren't making offers until trading reopens.</Empty>
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
    <Section title={`${offers.length} offer${offers.length > 1 ? 's' : ''} on the table`}>
      {[...offers]
        .sort((a, b) => a.expires - b.expires || a.id - b.id)
        .map((p) => (
          <OfferCard key={p.id} league={league} p={p} error={errors.get(p.id) ?? null} onCounter={onCounter} />
        ))}
    </Section>
  );
}

function OfferCard({ league, p, error, onCounter }: { league: League; p: Proposal; error: string | null; onCounter: (o: TradeOffer) => void }) {
  const t = league.teams[p.tid];
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const out = p.offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
  const inc = p.offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
  const after = capPayroll(league, league.userTid, s) - out + inc;
  // in neutral (league) value: every offer is at worst slightly against the user
  const { net, out: worth } = neutralBalance(league, p.offer);
  const share = worth > 0 ? net / worth : net >= 0 ? 1 : -1;
  const verdict = share > 0.05 ? { l: 'In your favor', c: 'good' } : share < -0.05 ? { l: 'A little short', c: 'warn' } : { l: 'Fair value', c: 'info' };
  const until = p.kind === 'pick' && p.expires === league.day ? 'Until the pick is made' : p.expires === league.day ? 'Last day' : `Until ${fmtDate(league.season, p.expires)}`;
  const accept = () => {
    let r = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      r = acceptProposal(l, p.id);
      // a pick traded on draft night: the draft moves on to the next team that picks (or yours)
      if (r.ok && l.phase === 'draft') continueDraft(l);
    });
    useStore.getState().toast(r.reason, r.ok ? 'good' : 'bad');
  };
  const decline = () => {
    useStore.getState().mutate((l) => void declineProposal(l, p.id));
    useStore.getState().toast(`You turned down the ${t.name}.`, 'neutral');
  };
  return (
    <section className="card fo-offer" aria-label={`Offer from the ${t.region} ${t.name}`}>
      <div className="fo-offer-h">
        <TeamLogo tid={p.tid} size={34} decorative />
        <div className="grow">
          <div className="fo-name">
            {t.region} {t.name}
          </div>
          <div className="fo-meta">
            {STRATEGY_META[t.strategy].label} · {KIND_LABEL[p.kind]}
          </div>
        </div>
        <div className="right">
          <span className={`tag ${verdict.c}`}>{verdict.l}</span>
          <div className="fo-offer-until">
            <Clock size={11} /> {until}
          </div>
        </div>
      </div>
      <p className="fo-offer-note">“{p.note}”</p>
      <div className="fo-offer-sides">
        <Side league={league} title="You send" side={p.offer.a} />
        <Side league={league} title="You get" side={p.offer.b} />
      </div>
      <div className="tiny dim num">
        Salary out {fmtM(out)} · in {fmtM(inc)} · payroll after <b className={after > cap.luxuryTax ? 'bad' : after > cap.salaryCap ? 'warn' : 'good'}>{fmtM(after)}</b> (
        {after > cap.salaryCap ? `${fmtMs(after - cap.salaryCap)} vs cap` : `${fmtM(cap.salaryCap - after)} under`})
      </div>
      {error && (
        <Callout tone="warn">
          <b>No longer available.</b> {error}
        </Callout>
      )}
      <div className="row">
        <button className="btn sm good grow" disabled={!!error} onClick={accept}>
          <Check size={15} /> Accept
        </button>
        <button className="btn sm grow" disabled={!!error} onClick={() => onCounter(p.offer)}>
          <PencilLine size={15} /> Counter
        </button>
        <button className="btn sm ghost" onClick={decline} aria-label={`Decline the offer from the ${t.name}`}>
          <X size={15} /> Decline
        </button>
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
              <div className="fo-meta">
                {p.pos} · {playerAge(p, league.season)} · {fmtM(salaryFor(p, s))}
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
