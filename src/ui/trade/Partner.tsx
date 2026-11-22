// The trade partner: the chosen team's slab (who they are, how they deal, their cap room, your
// recent deals with them) with the way to pick another, a sheet of the league's teams.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, curTeamSeason, payroll } from '../../core/league/helpers';
import { TeamLogo } from '../components/TeamLogo';
import { Sheet } from '../components/ui';
import { slabVars } from '../teamColors';
import { STRATEGY_META } from '../office/common';
import { RecentDeals } from '../league/MovesTab';
import { money } from '../../core/format';
import { gmLine } from '../../core/league/voices';

/** A team's cap room as the trade slab says it: the figure, and which line it's measured from. */
function capRoom(league: League, tid: number, season: number) {
  const pay = payroll(league, tid, season);
  const cap = CAP_FOR(league, season);
  const v = pay > cap.salaryCap ? money(pay - cap.salaryCap) : money(cap.salaryCap - pay);
  const k = pay > cap.luxuryTax ? 'over · taxpayer' : pay > cap.salaryCap ? 'over the cap' : 'cap space';
  return { pay, v, k };
}

function record(league: League, tid: number) {
  const ts = curTeamSeason(league, tid);
  const prev = league.teams[tid].seasons.find((x) => x.season === league.season - 1);
  return ts.won + ts.lost > 0 ? `${ts.won}-${ts.lost}` : prev ? `${prev.won}-${prev.lost} last season` : '0-0';
}

/** The league's other teams in a sheet: each with how it deals and its record; tap one to trade with it. */
export function TeamSheet({
  league,
  partner,
  open,
  onClose,
  onPick,
  title = 'Trade with',
  not = [],
}: {
  league: League;
  partner: number;
  open: boolean;
  onClose: () => void;
  onPick: (tid: number) => void;
  title?: string;
  /** Teams already in the deal (a three-team deal's other partner): left out of the list. */
  not?: number[];
}) {
  const teams = league.teams.filter((t) => t.tid !== league.userTid && !not.includes(t.tid)).sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  return (
    <Sheet open={open} onClose={onClose} title={title}>
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
                  {STRATEGY_META[t.strategy].label} · {record(league, t.tid)} · {gmLine(league, t).split(' · ')[0]}
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
      </div>
      {/* their cap room is the figure a deal with them turns on: the slab's big number */}
      <div className="fo-partner-fig">
        <div className="fo-partner-cap">
          <div className="v num">{v}</div>
          <div className="k">{k}</div>
        </div>
        <div className="fo-partner-meta">
          <span className="tag">{st.label}</span>
          <span className="num">{record(league, tid)}</span>
          <span className="num">
            payroll {money(pay)}
            {holds > 0 ? ' with holds' : ''}
          </span>
        </div>
      </div>
      {/* how its front office does business (league/voices.ts): it leans the values a little, and it talks like it */}
      <div className="fo-partner-gm">Front office: {gmLine(league, t)}</div>
      <RecentDeals league={league} tid={tid} />
      <TeamSheet league={league} partner={tid} open={open} onClose={() => setOpen(false)} onPick={onPick} />
    </section>
  );
}
