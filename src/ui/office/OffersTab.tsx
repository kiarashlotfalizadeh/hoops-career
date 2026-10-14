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
import { Card, Empty, Ovr } from '../components/ui';
import { STRATEGY_META, capSeason, fmtM, fmtMs } from './common';

const KIND_LABEL: Record<Proposal['kind'], string> = { buy: 'Wants your player', sell: 'Selling', dump: 'Salary dump', pick: 'Wants your pick' };

export function OffersTab({ league, closed, onCounter }: { league: League; closed: boolean; onCounter: (o: TradeOffer) => void }) {
  const offers = openProposals(league);
  // why each can't be taken right now (another deal moved a player since), worked out once per change
  const errors = useLeagueMemo(() => withHoldsMemo(() => new Map(openProposals(league).map((p) => [p.id, proposalError(league, p)]))), [league]);
  if (!offers.length)
    return (
      <Empty>
        {closed
          ? "Teams aren't making offers until trading reopens."
          : 'No offers right now. Teams call about once every ten days in season and more often before the deadline, for your first-round pick on draft night, and with salary dumps when free agency opens if you have cap space.'}
      </Empty>
    );
  return (
    <>
      <div className="fo-sec">
        {offers.length} offer{offers.length > 1 ? 's' : ''} on the table
      </div>
      {[...offers]
        .sort((a, b) => a.expires - b.expires || a.id - b.id)
        .map((p) => (
          <OfferCard key={p.id} league={league} p={p} error={errors.get(p.id) ?? null} onCounter={onCounter} />
        ))}
    </>
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
  const verdict = share > 0.05 ? { l: 'In your favor', c: 'var(--good)' } : share < -0.05 ? { l: 'A little short', c: 'var(--warn)' } : { l: 'Fair value', c: 'var(--info)' };
  const until = p.kind === 'pick' && p.expires === league.day ? 'Until the pick is made' : p.expires === league.day ? 'Last day' : `Until ${fmtDate(league.season, p.expires)}`;
  const accept = () => {
    let r = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      r = acceptProposal(l, p.id);
    });
    useStore.getState().toast(r.reason, r.ok ? 'good' : 'bad');
  };
  const decline = () => {
    useStore.getState().mutate((l) => void declineProposal(l, p.id));
    useStore.getState().toast(`You turned down the ${t.name}.`, 'neutral');
  };
  return (
    <Card className="tight">
      <div className="row" style={{ gap: 10 }}>
        <TeamLogo tid={p.tid} size={34} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">
            {t.region} {t.name}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>
            <span className="tag">{KIND_LABEL[p.kind]}</span>
          </div>
        </div>
        <div className="right" style={{ flex: 'none' }}>
          <div className="small bold" style={{ color: verdict.c }}>
            {verdict.l}
          </div>
          <div className="tiny dim row" style={{ gap: 3, justifyContent: 'flex-end' }}>
            <Clock size={11} /> {until}
          </div>
        </div>
      </div>
      <div className="small dim2" style={{ marginTop: 8, fontStyle: 'italic' }}>
        “{p.note}”
      </div>
      <div className="grid2" style={{ alignItems: 'start', marginTop: 10 }}>
        <Side league={league} title="You send" side={p.offer.a} />
        <Side league={league} title="You get" side={p.offer.b} />
      </div>
      <div className="tiny dim num" style={{ marginTop: 8 }}>
        Salary out {fmtM(out)} · in {fmtM(inc)} · payroll after{' '}
        <b style={{ color: after > cap.luxuryTax ? 'var(--bad)' : after > cap.salaryCap ? 'var(--warn)' : 'var(--good)' }}>{fmtM(after)}</b> (
        {after > cap.salaryCap ? `${fmtMs(after - cap.salaryCap)} vs cap` : `${fmtM(cap.salaryCap - after)} under`})
      </div>
      {error && (
        <div className="fo-callout warn" style={{ marginTop: 8 }}>
          <span>
            <b>No longer available.</b> {error}
          </span>
        </div>
      )}
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn sm good grow" disabled={!!error} onClick={accept}>
          <Check size={15} /> Accept
        </button>
        <button className="btn sm grow" disabled={!!error} onClick={() => onCounter(p.offer)}>
          <PencilLine size={15} /> Counter
        </button>
        <button className="btn sm ghost" onClick={decline} aria-label={`Decline the ${t.name}' offer`}>
          <X size={15} /> Decline
        </button>
      </div>
    </Card>
  );
}

function Side({ league, title, side }: { league: League; title: string; side: TradeOffer['a'] }) {
  const s = capSeason(league);
  return (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      <div className="row" style={{ gap: 6 }}>
        <TeamLogo tid={side.tid} size={16} />
        <span className="tiny upper bold dim">{title}</span>
      </div>
      {!side.pids.length && !side.dpids.length && <div className="small dim">Nothing</div>}
      {side.pids.map((pid) => {
        const p = league.players[pid];
        if (!p) return null;
        return (
          <div key={pid} className="row" style={{ gap: 6, minWidth: 0 }}>
            <Ovr v={p.ovr} size="sm" />
            <div className="grow" style={{ minWidth: 0 }}>
              <Link to={`/player/${pid}`} className="small bold ellipsis" style={{ display: 'block' }}>
                {playerName(p)}
              </Link>
              <div className="tiny dim ellipsis">
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
          <div key={d} className="row" style={{ gap: 6, minWidth: 0 }}>
            <Ticket size={16} className="dim" style={{ flex: 'none', width: 24 }} />
            <span className="small bold ellipsis">{pickLabel(league, dp)}</span>
          </div>
        );
      })}
    </div>
  );
}
