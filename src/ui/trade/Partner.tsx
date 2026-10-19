// The trade partner: the row of teams to pick from, and the chosen one's slab (how they deal, their
// cap room, their recent deals).
import { useEffect, useRef } from 'react';
import type { League } from '../../core/types';
import { CAP_FOR, curTeamSeason, payroll } from '../../core/league/helpers';
import { capPayroll } from '../../core/league/freeAgency';
import { TeamLogo } from '../components/TeamLogo';
import { scrollBehavior } from '../components/ui';
import { slabVars } from '../teamColors';
import { STRATEGY_META } from '../office/common';
import { RecentDeals } from '../league/MovesTab';
import { money } from '../../core/format';

export function TeamPicker({ league, partner, onPick }: { league: League; partner: number; onPick: (tid: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.fo-team.on');
    const box = ref.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: scrollBehavior() });
  }, [partner]);
  const teams = league.teams.filter((t) => t.tid !== league.userTid).sort((a, b) => a.abbrev.localeCompare(b.abbrev));
  return (
    <div className="fo-teams hscroll" ref={ref} role="group" aria-label="Trade partner">
      {teams.map((t) => (
        <button key={t.tid} aria-pressed={t.tid === partner} className={`fo-team ${t.tid === partner ? 'on' : ''}`} onClick={() => onPick(t.tid)}>
          <TeamLogo tid={t.tid} size={24} decorative />
          {t.abbrev}
        </button>
      ))}
    </div>
  );
}

/** The trade partner in its colours: who they are, how they deal, and their cap room. */
export function PartnerSlab({ league, tid, season }: { league: League; tid: number; season: number }) {
  const t = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const prev = t.seasons.find((x) => x.season === league.season - 1);
  const rec = ts.won + ts.lost > 0 ? `${ts.won}-${ts.lost}` : prev ? `${prev.won}-${prev.lost} last season` : '0-0';
  const pay = capPayroll(league, tid, season);
  const holds = pay - payroll(league, tid, season);
  const cap = CAP_FOR(league, season);
  const st = STRATEGY_META[t.strategy];
  return (
    <section className="slab fo-partner" style={slabVars(t.colors)} aria-label={`Trade partner: ${t.region} ${t.name}`}>
      <span className="slab-mark">
        <TeamLogo tid={tid} size={150} decorative />
      </span>
      <div className="fo-partner-top">
        <TeamLogo tid={tid} size={46} decorative />
        <div className="grow">
          <div className="fo-partner-region">{t.region}</div>
          <div className="fo-partner-name">{t.name}</div>
        </div>
        <div className="fo-partner-cap">
          <div className="v num">{pay > cap.salaryCap ? money(pay - cap.salaryCap) : money(cap.salaryCap - pay)}</div>
          <div className="k">
            {pay > cap.secondApron
              ? 'over · 2nd apron'
              : pay > cap.firstApron
                ? 'over · 1st apron'
                : pay > cap.luxuryTax
                  ? 'over · taxpayer'
                  : pay > cap.salaryCap
                    ? 'over the cap'
                    : 'cap space'}
          </div>
        </div>
      </div>
      <div className="fo-partner-meta">
        <span className="tag">{st.label}</span>
        <span className="num">{rec}</span>
        <span>·</span>
        {/* (cap holds count: in free agency a team's restricted free agents' and offer sheets', see capHolds) */}
        <span className="num">
          payroll {money(pay)}
          {holds > 0 ? ' with holds' : ''}
        </span>
      </div>
      <RecentDeals league={league} tid={tid} />
    </section>
  );
}
