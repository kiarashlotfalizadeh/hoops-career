// The trade partner: the chosen team's slab (who they are, how they deal, their cap room, your
// recent deals with them) with the way to pick another, a sheet of the league's teams.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, curTeamSeason, payroll } from '../../core/league/helpers';
import { capPayroll } from '../../core/league/freeAgency';
import { TeamLogo } from '../components/TeamLogo';
import { Sheet } from '../components/ui';
import { slabVars } from '../teamColors';
import { STRATEGY_META } from '../office/common';
import { RecentDeals } from '../league/MovesTab';
import { money } from '../../core/format';

/** A team's cap room as the trade slab says it: the figure, and which line it's measured from. */
function capRoom(league: League, tid: number, season: number) {
  const pay = capPayroll(league, tid, season);
  const cap = CAP_FOR(league, season);
  const v = pay > cap.salaryCap ? money(pay - cap.salaryCap) : money(cap.salaryCap - pay);
  const k =
    pay > cap.secondApron
      ? 'over · 2nd apron'
      : pay > cap.firstApron
        ? 'over · 1st apron'
        : pay > cap.luxuryTax
          ? 'over · taxpayer'
          : pay > cap.salaryCap
            ? 'over the cap'
            : 'cap space';
  return { pay, v, k };
}

function record(league: League, tid: number) {
  const ts = curTeamSeason(league, tid);
  const prev = league.teams[tid].seasons.find((x) => x.season === league.season - 1);
  return ts.won + ts.lost > 0 ? `${ts.won}-${ts.lost}` : prev ? `${prev.won}-${prev.lost} last season` : '0-0';
}

/** The league's other teams in a sheet: each with how it deals and its record; tap one to trade with it. */
function TeamSheet({ league, partner, open, onClose, onPick }: { league: League; partner: number; open: boolean; onClose: () => void; onPick: (tid: number) => void }) {
  const teams = league.teams.filter((t) => t.tid !== league.userTid).sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  return (
    <Sheet open={open} onClose={onClose} title="Trade with">
      <div className="card flush">
        <div className="list" role="group" aria-label="Trade partner">
          {teams.map((t) => (
            <button
              key={t.tid}
              className={`listrow clickable fo-pteam ${t.tid === partner ? 'on' : ''}`}
              aria-pressed={t.tid === partner}
              onClick={() => {
                onPick(t.tid);
                onClose();
              }}
            >
              <TeamLogo tid={t.tid} size={30} decorative />
              <span className="grow">
                <span className="lr-name">
                  {t.region} {t.name}
                </span>
                <span className="lr-meta">
                  {STRATEGY_META[t.strategy].label} · {record(league, t.tid)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** The trade partner in its colours: who they are, how they deal, and their cap room; its name opens the league's teams. */
export function PartnerSlab({ league, tid, season, onPick }: { league: League; tid: number; season: number; onPick: (tid: number) => void }) {
  const [open, setOpen] = useState(false);
  const t = league.teams[tid];
  const { pay, v, k } = capRoom(league, tid, season);
  const holds = pay - payroll(league, tid, season);
  const st = STRATEGY_META[t.strategy];
  return (
    <section className="slab fo-partner" style={slabVars(t.colors)} aria-label={`Trade partner: ${t.region} ${t.name}`}>
      <div className="fo-partner-top">
        <TeamLogo tid={tid} size={44} decorative />
        {/* the name is the switch: it opens the league's teams */}
        <button className="grow fo-partner-pick" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Trade partner: ${t.region} ${t.name}. Change`}>
          <span className="fo-partner-region">{t.region}</span>
          <span className="fo-partner-name">
            <span className="ellipsis">{t.name}</span>
            <ChevronDown size={20} aria-hidden="true" />
          </span>
        </button>
        <div className="fo-partner-cap">
          <div className="v num">{v}</div>
          <div className="k">{k}</div>
        </div>
      </div>
      <div className="fo-partner-meta">
        <span className="tag">{st.label}</span>
        <span className="num">{record(league, tid)}</span>
        <span aria-hidden="true">·</span>
        {/* (cap holds count: in free agency a team's restricted free agents' and offer sheets', see capHolds) */}
        <span className="num">
          payroll {money(pay)}
          {holds > 0 ? ' with holds' : ''}
        </span>
      </div>
      <RecentDeals league={league} tid={tid} />
      <TeamSheet league={league} partner={tid} open={open} onClose={() => setOpen(false)} onPick={onPick} />
    </section>
  );
}
