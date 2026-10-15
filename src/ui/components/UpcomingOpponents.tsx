// The next three teams on the user's schedule, each with its game plan's status and a way into it.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, ScheduledGame } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { planFor } from '../../core/league/gamePlans';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { Card, Help, Tag } from './ui';
import { TeamLogo } from './TeamLogo';

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
    <Card
      title="Upcoming opponents"
      right={
        <Help title="Game plans">
          A game plan changes your tactics against one team only, on top of this playbook: counters, a star plan, matchups. Open one to scout them and build it.
        </Help>
      }
    >
      <div className="col" style={{ gap: 8 }}>
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
            <Link key={opp} to={`/gameplan/${opp}`} className="card tight row" style={{ gap: 10 }}>
              <TeamLogo tid={opp} size={32} decorative />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold ellipsis">
                  {g.home === league.userTid ? 'vs' : '@'} {t.abbrev}{' '}
                  <span className="dim num" style={{ fontWeight: 500 }}>
                    {ts.won}-{ts.lost}
                  </span>
                </div>
                <div className="tiny dim2">
                  {fmtDate(league.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {g.day === league.day ? ' · Today' : ''}
                </div>
              </div>
              {plan ? (
                <div style={{ textAlign: 'right' }}>
                  <Tag tone="info">Plan · {SCOPE[plan.scope ?? 'next']}</Tag>
                  <div className="tiny dim2">{status}</div>
                </div>
              ) : (
                <span className="tiny dim">No plan</span>
              )}
              <span className="sr-only">. Open the game plan</span>
              <ChevronRight size={16} className="dim" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
