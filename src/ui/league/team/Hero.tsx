// Another team's slab, in its colours: who they are, where they stand, and at its foot the two things
// to do with them (their Matchup page and a trade).
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, ClipboardList, Pencil } from 'lucide-react';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { curTeamSeason, fmtDate } from '../../../core/league/helpers';
import { confStandings } from '../../../core/league/standings';
import { nextMeeting } from '../../../core/ai/opponentPlan';
import { FRANCHISES } from '../../../core/teams';
import { TeamLogo } from '../../components/TeamLogo';
import { ordinal } from '../../stats';
import { OutcomeTag, seasonOutcome } from '../shared';
import { useBack } from '../../nav';
import { slabVars } from '../../teamColors';
// the roster rows (team/RosterList, RosterViews) are styled by the Team section's sheet, which only
// the Team tab loads: a team's page opened straight from the League tab needs it too
import '../../screens/team.css';

/** The team's slab, in its colours: who they are and where they stand, its actions (`children`) at its foot. */
export function TeamHero({ league, tid, onEdit, children }: { league: League; tid: number; onEdit?: () => void; children?: ReactNode }) {
  const goBack = useBack('/league');
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const confRank = useLeagueMemo(() => confStandings(league, team.conf).findIndex((r) => r.tid === tid) + 1, [league, tid, team.conf]);
  const outcome = seasonOutcome(league, tid, ts);
  const confWord = team.conf === 'E' ? 'East' : 'West';
  const arena = FRANCHISES[tid]?.arena;
  const gp = ts.won + ts.lost;
  return (
    <section className="slab lg-team" style={slabVars(team.colors) as CSSProperties}>
      <div className="lg-team-top">
        <button className="iconbtn lg-team-back" onClick={goBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <span className="lg-team-over">
          {confWord} · {team.div}
        </span>
        {onEdit && (
          <button className="btn xs" aria-haspopup="dialog" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>
      <div className="lg-team-id">
        <div className="grow">
          <div className="lg-team-region">
            {team.region}
            {arena ? <span className="lg-team-arena"> · {arena}</span> : ''}
          </div>
          <h1 className="lg-team-name">{team.name}</h1>
        </div>
        <TeamLogo tid={tid} size={64} decorative />
      </div>
      <div className="lg-team-rec">
        <div className="lg-team-wl num">
          {ts.won}-{ts.lost}
        </div>
        <div className="lg-team-rank">{gp ? `${ordinal(confRank)} in the ${confWord}` : 'No games yet'}</div>
        {outcome.short !== 'In progress' && outcome.short !== 'Missed' && (
          <span className="lg-team-tags">
            <OutcomeTag o={outcome} />
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** What to do with them: their Matchup page (scouting, your plan; when you play them next) and a trade. */
export function TeamActions({ league, tid }: { league: League; tid: number }) {
  const next = useLeagueMemo(() => nextMeeting(league, tid), [league, tid]);
  const when = next ? (next.day === league.day ? 'Today' : fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })) : undefined;
  return (
    <div className="lg-team-actions">
      <Link to={`/games/${tid}`} className={`btn ${next ? 'primary' : ''}`} aria-label={`Matchup${when ? `, next game ${when}` : ''}`}>
        <ClipboardList size={17} aria-hidden="true" />
        <span className="lg-act-t">
          Matchup
          {when && <small>{when}</small>}
        </span>
      </Link>
      <Link to={`/office/trade?with=${tid}`} className={`btn ${next ? '' : 'primary'}`}>
        <ArrowLeftRight size={17} aria-hidden="true" /> Trade
      </Link>
    </div>
  );
}
