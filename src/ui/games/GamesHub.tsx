// The Games hub, the season's spine: the next game (who, when, the series, whether a plan is set,
// and its matchup page a tap away), then the schedule: what's coming and the results, with filters.
// On game day the Continue bar carries Watch & coach: the card doesn't repeat it.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, ScheduledGame } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { neutralSite } from '../../core/league/games';
import { confStandings } from '../../core/league/standings';
import { Chips, PageHeader } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { slabVars } from '../teamColors';
import { ordinal } from '../stats';
import { useQueryParam } from '../league/shared';
import { TeamScheduleList, type ScheduleFilter } from './ScheduleList';
import { gameTag, liveSeries, planStatus } from './data';
import './games.css';

const FILTERS: ScheduleFilter[] = ['all', 'upcoming', 'results', 'home', 'away', 'cup', 'post'];
const FILTER_LABEL: Record<ScheduleFilter, string> = {
  all: 'All',
  upcoming: 'Upcoming',
  results: 'Results',
  home: 'Home',
  away: 'Away',
  cup: 'Cup',
  post: 'Playoffs',
};

/** The user's next game this season, today's included (the preseason's: opening night). */
function nextGame(league: League): ScheduledGame | undefined {
  if (!['preseason', 'regular', 'playin', 'playoffs'].includes(league.phase)) return undefined;
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && (g.home === me || g.away === me) && g.type !== 'allstar')
    .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
}

export default function GamesHub() {
  const league = useLeague();
  const [filter, setFilter] = useQueryParam<ScheduleFilter>('f', 'all', FILTERS);
  const me = league.userTid;
  const mine = useLeagueMemo(() => league.schedule.filter((g) => g.home === me || g.away === me), [league, me]);
  const next = useLeagueMemo(() => nextGame(league), [league]);
  // the Cup and the postseason only once there are games of theirs
  const shown = FILTERS.filter((f) => (f === 'cup' ? mine.some((g) => g.cup) : f === 'post' ? mine.some((g) => g.type === 'playoffs' || g.type === 'playin') : true));
  return (
    <main className="page">
      <PageHeader title="Games" />
      {next && <NextGame league={league} g={next} />}
      <div className="gs-filters">
        <Chips label="Show games" value={shown.includes(filter) ? filter : 'all'} onChange={setFilter} options={shown.map((id) => ({ id, label: FILTER_LABEL[id] }))} />
      </div>
      <TeamScheduleList league={league} tid={me} filter={shown.includes(filter) ? filter : 'all'} split skip={next?.gid} />
    </main>
  );
}

/** Regular-season meetings this season: the user's wins and losses, and how many there are in all. */
function seasonSeries(league: League, opp: number) {
  const me = league.userTid;
  const vs = (g: { home: number; away: number }) => (g.home === me && g.away === opp) || (g.home === opp && g.away === me);
  let won = 0;
  let lost = 0;
  for (const g of league.games) {
    if (g.season !== league.season || g.type !== 'regular' || !vs({ home: g.home.tid, away: g.away.tid })) continue;
    const us = g.home.tid === me ? g.home : g.away;
    if (us.pts > (us === g.home ? g.away : g.home).pts) won++;
    else lost++;
  }
  const total = league.schedule.filter((g) => g.type === 'regular' && vs(g)).length;
  return { won, lost, total };
}

/** The next game on a slab in the opponent's colours: when, who, how they stand, the series and the plan. */
function NextGame({ league, g }: { league: League; g: ScheduledGame }) {
  const me = league.userTid;
  const opp = g.home === me ? g.away : g.home;
  const t = league.teams[opp];
  const ts = curTeamSeason(league, opp);
  const rank = useLeagueMemo(() => confStandings(league, t.conf).find((r) => r.tid === opp)?.confRank ?? 0, [league, t.conf, opp]);
  const days = g.day - league.day;
  const when = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtDate(league.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' });
  const neutral = neutralSite(g);
  const where = neutral ? 'Neutral floor' : g.home === me ? 'Home' : 'Away';
  const tag = gameTag(league, g);
  const series = g.type === 'playoffs' ? liveSeries(league, opp) : undefined;
  const ss = g.type === 'regular' ? seasonSeries(league, opp) : null;
  const plan = planStatus(league, opp, g);
  const seriesText = series
    ? (() => {
        const [w, l] = series.high === me ? [series.highWins, series.lowWins] : [series.lowWins, series.highWins];
        return w === l ? `Series tied ${w}-${l}` : `${w > l ? league.teams[me].abbrev : t.abbrev} leads ${Math.max(w, l)}-${Math.min(w, l)}`;
      })()
    : ss && ss.total > 0
      ? `Season ${ss.won}-${ss.lost} · ${ss.won + ss.lost + 1} of ${ss.total}`
      : '';
  return (
    <section className="slab gn" style={slabVars(t.colors) as CSSProperties} aria-label={`Next game: ${when}, ${g.home === me || neutral ? 'vs' : 'at'} the ${t.region} ${t.name}`}>
      <span className="slab-mark">
        <TeamLogo tid={opp} size={180} decorative />
      </span>
      <div className="gn-over">
        <span className={days <= 0 ? 'today' : undefined}>
          {when} · {where}
        </span>
        {tag && <span>{tag}</span>}
      </div>
      <div className="gn-id">
        <TeamLogo tid={opp} size={52} decorative />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="gn-region">{t.region}</div>
          <div className="gn-name ellipsis">
            <span className="gn-at">{g.home === me || neutral ? 'vs' : '@'}</span>
            {t.name}
          </div>
        </div>
        <div className="gn-rec">
          <div className="v num">
            {ts.won}-{ts.lost}
          </div>
          {/* no rank before anyone has played */}
          {rank > 0 && ts.won + ts.lost > 0 && (
            <div className="s">
              {ordinal(rank)} {t.conf === 'E' ? 'East' : 'West'}
            </div>
          )}
        </div>
      </div>
      <div className="gn-foot">
        <span className="grow">
          {seriesText && <span className="num">{seriesText} · </span>}
          <span className={`gn-plan${plan.set ? ' set' : ''}`}>{plan.text}</span>
        </span>
        <Link to={`/games/${opp}`} className="btn sm" aria-label={`Matchup: the ${t.name}`}>
          Matchup <ChevronRight size={15} />
        </Link>
      </div>
    </section>
  );
}
