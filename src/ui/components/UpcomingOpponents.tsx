// The next three teams on the user's schedule, each with its game plan's status and its matchup page
// a tap away (Team → Tactics shows it under the playbook).
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, ScheduledGame } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { planFor } from '../../core/league/gamePlans';
import { neutralSite } from '../../core/league/games';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { planSize } from '../games/data';
import { Help, Section, Tag } from './ui';
import { TeamLogo } from './TeamLogo';
import '../games/games.css';

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
          A game plan changes your tactics against one team only, on top of this playbook: counters, a star plan, matchups. Open a matchup page to scout them and build one.
        </Help>
      }
    >
      <div className="card flush list">
        {rows.map(({ opp, g }) => {
          const t = league.teams[opp];
          const ts = curTeamSeason(league, opp);
          const plan = planFor(league, opp, g);
          const n = planSize(plan);
          return (
            <Link key={opp} to={`/games/${opp}`} className="uo-row">
              <TeamLogo tid={opp} size={30} decorative />
              <span className="grow">
                <span className="uo-t">
                  {g.home === league.userTid || neutralSite(g) ? 'vs' : '@'} {t.abbrev}{' '}
                  <span className="uo-rec num">
                    {ts.won}-{ts.lost}
                  </span>
                </span>
                <span className="lr-meta">
                  {g.day === league.day && league.phase !== 'preseason' ? 'Today' : fmtDate(league.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {n ? ` · ${n} item${n === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              {plan && n ? <Tag tone="info">Plan · {SCOPE[plan.scope ?? 'next']}</Tag> : <span className="tiny dim">No plan</span>}
              <span className="sr-only">. Open the matchup</span>
              <ChevronRight size={16} className="dim" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
