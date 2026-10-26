// Another team's Overview: its ratings with league ranks, the season outlook, its form, its coach and
// strategy, its payroll, and its three best players.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { CAP_FOR, contractSeason, curTeamSeason, payroll, rosterSorted } from '../../../core/league/helpers';
import { pct } from '../../../core/analysis/odds';
import { defenseLabel, offenseLabel } from '../../../core/sim/playbooks';
import { activeCoach, coachCareer, coyWinners } from '../../../core/league/coaches';
import { seasonLabel } from '../../../core/constants';
import { money, rankOf } from '../../../core/format';
import { Statline } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { f1, signed, teamRatings } from '../../stats';
import { STRATEGY_META, StrategyTag } from '../shared';
import { RosterRows } from '../../team/RosterList';
import { useForecast } from '../../useForecast';

/** League ranks among the teams that have played ("4th"), and how many have (`of`). */
function useRatingRanks(league: League, tid: number) {
  return useLeagueMemo(() => {
    const all = league.teams.map((t) => ({ tid: t.tid, ts: curTeamSeason(league, t.tid) })).filter((x) => x.ts.won + x.ts.lost > 0);
    const r = all.map((x) => ({ tid: x.tid, tr: teamRatings(x.ts) }));
    const rank = (key: 'ortg' | 'drtg' | 'net', low = false) => {
      const sorted = [...r].sort((a, b) => (low ? a.tr[key] - b.tr[key] : b.tr[key] - a.tr[key]));
      return sorted.findIndex((x) => x.tid === tid) + 1;
    };
    return { ortg: rank('ortg'), drtg: rank('drtg', true), net: rank('net'), of: r.length };
  }, [league, tid]);
}

/** The season forecast's line for a team: its series in the playoffs, else its projected record and odds. */
function useOutlook(league: League, tid: number): string | null {
  const f = useForecast(league);
  if (!f) return null;
  const t = f.teams[tid];
  const series = league.playoffs.find((s) => s.winner === undefined && (s.high === tid || s.low === tid));
  if (series) return `Series vs ${league.teams[series.high === tid ? series.low : series.high].abbrev}: ${pct(t.reach[series.round])} to win it`;
  if (t.out) return league.phase === 'playoffs' || league.phase === 'playin' ? null : 'Eliminated from the playoffs';
  const w = Math.round(t.w);
  const rec = league.phase === 'playin' ? '' : `Projected ${w}-${Math.round(t.w + t.l) - w} · `;
  return `${rec}Playoffs ${pct(t.reach[0], t.clinched)}${t.reach[4] >= 0.01 ? ` · Title ${pct(t.reach[4])}` : ''}${f.preseason ? ' (preseason)' : ''}`;
}

// (moved off its playbook's settings: "Custom (Drop base)", as the Tactics hero and Plan name it)
const playbook = (team: League['teams'][number]) => {
  const off = offenseLabel(team.tactics);
  return `${off === 'Custom' ? 'Custom offense' : off} / ${defenseLabel(team.tactics)}`;
};

/** The head coach from the coach registry: since when he's had the job (or when he takes it), and the playbook the team runs. */
function coachLine(league: League, tid: number) {
  const r = activeCoach(league, tid);
  const team = league.teams[tid];
  if (!r) return null;
  const k = coachCareer(league, r, coyWinners(league));
  const here = k.stints.find((j) => !j.stint.to && j.stint.tid === tid);
  const start = here?.lines[0]?.season ?? here?.stint.from ?? league.season;
  const since = start > league.season ? `From ${seasonLabel(start)}` : `Since ${seasonLabel(start)}`;
  return { id: r.id, line: `${since} · ${playbook(team)}` };
}

export function TeamOverview({ league, tid, onContracts }: { league: League; tid: number; onContracts: () => void }) {
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const gp = ts.won + ts.lost;
  const tr = teamRatings(ts);
  const ranks = useRatingRanks(league, tid);
  const outlook = useOutlook(league, tid);
  const coach = useLeagueMemo(() => coachLine(league, tid), [league, tid]);
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  const key = [...roster].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  const cs = contractSeason(league);
  const pay = payroll(league, tid, cs);
  const cap = CAP_FOR(league, cs);
  const strategy = STRATEGY_META[team.strategy];
  const won = ts.lastTen.filter((x) => x === 1).length;
  return (
    <>
      {gp > 0 && (
        <div className="card lg-strip">
          <Statline
            items={[
              {
                k: (
                  <span className="as-is">
                    <Term id="ortg">ORtg</Term>
                  </span>
                ),
                v: f1(tr.ortg),
                s: rankOf(ranks.ortg, ranks.of),
              },
              { k: <span className="as-is">DRtg</span>, v: f1(tr.drtg), s: rankOf(ranks.drtg, ranks.of) },
              {
                k: <span className="as-is">Net</span>,
                v: signed(tr.net),
                s: rankOf(ranks.net, ranks.of),
                color: tr.net > 0 ? 'var(--good)' : tr.net < 0 ? 'var(--bad)' : undefined,
              },
            ]}
          />
        </div>
      )}
      <div className="card flush list">
        {outlook && (
          <Link to={`/league/standings?view=odds&oconf=${team.conf}`} className="lg-kvl">
            <span className="k">Outlook</span>
            <span className="v">{outlook}</span>
            <ChevronRight size={15} className="dim" aria-hidden="true" />
          </Link>
        )}
        {ts.lastTen.length > 0 && (
          <div className="lg-kvl">
            <span className="k">Form</span>
            <span className="v">
              <span className="lg-form" aria-hidden="true">
                {ts.lastTen.map((x, i) => (
                  <i key={i} className={x ? 'w' : 'l'} />
                ))}
              </span>
              <span aria-hidden="true">
                {won}-{ts.lastTen.length - won} in last {ts.lastTen.length}
                {ts.streak ? ` · ${ts.streak > 0 ? 'W' : 'L'}${Math.abs(ts.streak)}` : ''}
              </span>
              <span className="sr-only">
                {won}-{ts.lastTen.length - won} in the last {ts.lastTen.length} games{ts.streak ? `, ${ts.streak > 0 ? 'won' : 'lost'} ${Math.abs(ts.streak)} in a row` : ''}
              </span>
            </span>
            <span />
          </div>
        )}
        <Link to={coach ? `/league/history?view=coaches&coach=${coach.id}` : '/league/history?view=coaches'} className="lg-kvl">
          <span className="k">Coach</span>
          <span className="v">
            <span className="bold">{team.coach.name}</span>
            <span className="sub">{coach?.line ?? playbook(team)}</span>
          </span>
          <ChevronRight size={15} className="dim" aria-hidden="true" />
        </Link>
        <div className="lg-kvl">
          <span className="k">Strategy</span>
          <span className="v">
            <StrategyTag team={team} />
            <span className="sub">{strategy.help}</span>
          </span>
          <span />
        </div>
        <button className="lg-kvl" onClick={onContracts} aria-label={`Payroll ${money(pay)}: contracts`}>
          <span className="k">Payroll</span>
          <span className="v">
            <span className="bold num">{money(pay)}</span>
            <span className="sub">
              {cs !== league.season ? `${seasonLabel(cs)} · ` : ''}
              {pay > cap.luxuryTax ? 'Over the tax' : pay > cap.salaryCap ? 'Over the cap' : `${money(cap.salaryCap - pay)} under the cap`}
            </span>
          </span>
          <ChevronRight size={15} className="dim" aria-hidden="true" />
        </button>
      </div>
      {/* the three best, as the Roster tab's rows (its column heads in the divider) */}
      {key.length > 0 && <RosterRows league={league} label="Key players" players={key} />}
    </>
  );
}
