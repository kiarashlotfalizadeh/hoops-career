// The next three teams on the user's schedule, each with its game plan's status and a way into it.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, ScheduledGame } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { planFor } from '../../core/league/gamePlans';
import { neutralSite } from '../../core/league/games';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { Help, Section, Tag } from './ui';
import { TeamLogo } from './TeamLogo';
import '../screens/tactics.css';

/** The next `n` different opponents, each at his first meeting. */
function nextOpponents(league: League, n: number): { opp: number; g: ScheduledGame }[] {
  const me = league.userTid;
  const out: { opp: number; g: ScheduledGame }[] = [];
  const games = league.schedule.filter((g) => !g.played && g.day >= league.day && (g.home === me || g.away === me) && g.type !== 'allstar').sort((a, b) => a.day - b.day);
  for (const g of games) {
    const opp = g.home === me ? g.away : g.home;
    if (!out.some((x) => x.opp === opp)) out.push({ opp, g });
    if (out.length >= n) break;
  }
  return out;
}

const SCOPE: Record<string, string> = { next: 'next game', series: 'this series', season: 'all season' };

export function UpcomingOpponents() {
  const league = useLeague();
  const rows = useLeagueMemo(() => nextOpponents(league, 3), [league]);
  if (!rows.length) return null;
  return (
    <Section
      title="Upcoming opponents"
      right={
        <Help title="Game plans">
          A game plan changes your tactics against one team only, on top of this playbook: counters, a star plan, matchups. Open one to scout them and build it.
        </Help>
      }
    >
      <div className="card flush list">
        {rows.map(({ opp, g }) => {
          const t = league.teams[opp];
          const ts = curTeamSeason(league, opp);
          const plan = planFor(league, opp, g);
          const n = plan ? plan.items.length : 0;
          const matchups = plan?.matchups ? Object.keys(plan.matchups).length : 0;
          const guards = plan?.playerD ? Object.keys(plan.playerD).length : 0;
          const status = plan
            ? [
                n ? `${n} change${n === 1 ? '' : 's'}` : '',
                matchups ? `${matchups} matchup${matchups === 1 ? '' : 's'}` : '',
                guards ? `${guards} instruction${guards === 1 ? '' : 's'}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : '';
          return (
            <Link key={opp} to={`/gameplan/${opp}`} className="tx-opp">
              <TeamLogo tid={opp} size={30} decorative />
              <span className="grow">
                <span className="tx-opp-t">
                  {g.home === league.userTid || neutralSite(g) ? 'vs' : '@'} {t.abbrev}{' '}
                  <span className="tx-opp-rec num">
                    {ts.won}-{ts.lost}
                  </span>
                </span>
                <span className="lr-meta">
                  {g.day === league.day ? 'Today' : fmtDate(league.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {plan && status ? ` · ${status}` : ''}
                </span>
              </span>
              {plan ? <Tag tone="info">Plan · {SCOPE[plan.scope ?? 'next']}</Tag> : <span className="tiny dim">No plan</span>}
              <span className="sr-only">. Open the game plan</span>
              <ChevronRight size={16} className="dim tx-chev" />
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
