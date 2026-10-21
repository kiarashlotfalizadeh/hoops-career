// The Games hub, the season's spine: the next game (who, when, what it's billed as, the series as
// it stands, whether a plan is set, and its matchup page a tap away), then the schedule: what's
// coming (the big nights marked) and the results (the big ones by their headline), with filters,
// and the season series against every opponent. On game day the Continue bar carries Watch & coach:
// the card doesn't repeat it.
import { useEffect, useRef, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { GameResult, League, ScheduledGame } from '../../core/types';
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
import { seasonSeries, seriesParts, seriesText } from './series';
import { BillingLine, FormPills, useBillings } from './occasion';
import './games.css';

const FILTERS: (ScheduleFilter | 'opp')[] = ['all', 'upcoming', 'results', 'opp', 'home', 'away', 'cup', 'post'];
const FILTER_LABEL: Record<ScheduleFilter | 'opp', string> = {
  all: 'All',
  upcoming: 'Upcoming',
  results: 'Results',
  opp: 'By opponent',
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
  const [filter, setFilter] = useQueryParam<ScheduleFilter | 'opp'>('f', 'all', FILTERS);
  const me = league.userTid;
  const mine = useLeagueMemo(() => league.schedule.filter((g) => g.home === me || g.away === me), [league, me]);
  const next = useLeagueMemo(() => nextGame(league), [league]);
  // the Cup and the postseason only once there are games of theirs; Upcoming and Results only while
  // there's something on each side
  const shown = FILTERS.filter((f) =>
    f === 'cup'
      ? mine.some((g) => g.cup)
      : f === 'post'
        ? mine.some((g) => g.type === 'playoffs' || g.type === 'playin')
        : f === 'upcoming'
          ? mine.some((g) => !g.played)
          : f === 'results'
            ? mine.some((g) => g.played)
            : f === 'opp'
              ? mine.some((g) => g.type === 'regular')
              : true,
  );
  const on = shown.includes(filter) ? filter : 'all';
  const chips = useScrollEdges(shown.length);
  return (
    <main className="page">
      <PageHeader title="Games" />
      {next && <NextGame league={league} g={next} />}
      <div className="gs-filters" ref={chips}>
        <Chips label="Show games" value={on} onChange={setFilter} options={shown.map((id) => ({ id, label: FILTER_LABEL[id] }))} />
      </div>
      {on === 'opp' ? <ByOpponent league={league} /> : <TeamScheduleList league={league} tid={me} filter={on} split skip={next?.gid} />}
    </main>
  );
}

/**
 * The filters' row scrolls sideways on a phone: its edges fade where chips wait past them (`fl`,
 * `fr`), and the chip that's on is scrolled into view when the screen opens.
 */
function useScrollEdges(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const row = box?.querySelector<HTMLElement>('.chips');
    if (!box || !row) return;
    const on = row.querySelector<HTMLElement>('.chip.on');
    if (on && on.offsetLeft + on.offsetWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - 16;
    const edges = () => {
      box.classList.toggle('fl', row.scrollLeft > 4);
      box.classList.toggle('fr', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    };
    edges();
    row.addEventListener('scroll', edges, { passive: true });
    window.addEventListener('resize', edges);
    return () => {
      row.removeEventListener('scroll', edges);
      window.removeEventListener('resize', edges);
    };
  }, [count]);
  return ref;
}

/** The next game on a slab in the opponent's colours: when, who, how they stand, the series and the plan. */
function NextGame({ league, g }: { league: League; g: ScheduledGame }) {
  const me = league.userTid;
  const opp = g.home === me ? g.away : g.home;
  const t = league.teams[opp];
  const ts = curTeamSeason(league, opp);
  const rank = useLeagueMemo(() => confStandings(league, t.conf).find((r) => r.tid === opp)?.confRank ?? 0, [league, t.conf, opp]);
  // (the preseason's calendar is the regular season's: its day 0 is opening night, not today)
  const pre = league.phase === 'preseason';
  const days = pre ? Infinity : g.day - league.day;
  const when = pre ? 'Opening night' : days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtDate(league.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' });
  const neutral = neutralSite(g);
  const where = neutral ? 'Neutral floor' : g.home === me ? 'Home' : 'Away';
  const tag = gameTag(league, g);
  const series = g.type === 'playoffs' ? liveSeries(league, opp) : undefined;
  const ss = g.type === 'regular' ? seasonSeries(league, opp) : null;
  const plan = planStatus(league, opp, g);
  const bills = useBillings(league, g);
  const seriesLine = series
    ? (() => {
        const [w, l] = series.high === me ? [series.highWins, series.lowWins] : [series.lowWins, series.highWins];
        // (before game 1 the tag above says it all)
        return w + l === 0 ? '' : w === l ? `Series tied ${w}-${l}` : `${w > l ? league.teams[me].abbrev : t.abbrev} leads ${Math.max(w, l)}-${Math.min(w, l)}`;
      })()
    : ss
      ? seriesText(ss)
      : '';
  return (
    <section className="slab gn" style={slabVars(t.colors) as CSSProperties} aria-label={`Next game: ${when}, ${g.home === me || neutral ? 'vs' : 'at'} the ${t.region} ${t.name}`}>
      <div className="gn-over">
        <span className={days <= 0 ? 'today' : undefined}>
          {when} · {where}
        </span>
        {tag && <span>{tag}</span>}
      </div>
      <BillingLine billings={bills} />
      {series && <SeriesStrip league={league} seriesId={series.id} />}
      <div className="gn-id">
        <TeamLogo tid={opp} size={48} decorative />
        <div className="gn-who">
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
          {seriesLine && !series && <span className="num gn-series">{seriesLine}</span>}
          <Link to={`/games/${opp}?tab=plan`} className={`gn-plan${plan.set ? ' set' : ''}`}>
            {plan.text}
          </Link>
        </span>
        <Link to={`/games/${opp}`} className="btn sm" aria-label={`Matchup: the ${t.name}`}>
          Matchup <ChevronRight size={15} />
        </Link>
      </div>
    </section>
  );
}

/** A playoff series as drama: the score in display type, each game played a pill (a tap to its report), and what the next one means. */
function SeriesStrip({ league, seriesId }: { league: League; seriesId: string }) {
  const me = league.userTid;
  const s = league.playoffs.find((x) => x.id === seriesId);
  const games = useLeagueMemo(() => league.games.filter((r) => r.season === league.season && r.type === 'playoffs' && r.seriesId === seriesId), [league, seriesId]);
  if (!s) return null;
  const opp = s.high === me ? s.low : s.high;
  const [w, l] = s.high === me ? [s.highWins, s.lowWins] : [s.lowWins, s.highWins];
  const won = (r: GameResult) => (r.home.pts > r.away.pts ? r.home.tid : r.away.tid) === me;
  const score = (r: GameResult) => (r.home.tid === me ? `${r.home.pts}-${r.away.pts}` : `${r.away.pts}-${r.home.pts}`);
  return (
    <div className="gn-series-strip">
      <div className="gn-ss-score" aria-label={`Series: ${league.teams[me].abbrev} ${w}, ${league.teams[opp].abbrev} ${l}`}>
        <span className="num">{league.teams[me].abbrev}</span>
        <b className="num">{w}</b>
        <span className="gn-ss-dash">–</span>
        <b className="num">{l}</b>
        <span className="num">{league.teams[opp].abbrev}</span>
      </div>
      {games.length > 0 && (
        <div className="gn-ss-games">
          {games.map((r, i) => (
            <Link key={r.gid} to={`/game/${r.gid}`} className={`gn-ss-g ${won(r) ? 'w' : 'l'}`} aria-label={`Game ${i + 1}: ${won(r) ? 'won' : 'lost'} ${score(r)}`}>
              <span className="gn-ss-n">G{i + 1}</span>
              <span className="num">{score(r)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The season series against every opponent: the record, what's left, the last result and the next meeting, a row each (a tap to its matchup page). */
function ByOpponent({ league }: { league: League }) {
  const me = league.userTid;
  const rows = useLeagueMemo(
    () =>
      league.teams
        .filter((t) => t.tid !== me)
        .map((t) => {
          const ss = seasonSeries(league, t.tid);
          const next = league.schedule
            .filter((g) => !g.played && g.type === 'regular' && [g.home, g.away].includes(me) && [g.home, g.away].includes(t.tid))
            .sort((a, b) => a.day - b.day)[0];
          const meetings = league.games.filter(
            (r) => r.season === league.season && r.type === 'regular' && [r.home.tid, r.away.tid].includes(me) && [r.home.tid, r.away.tid].includes(t.tid),
          );
          return { t, ss, next, form: meetings.map((r) => r.home.pts > r.away.pts === (r.home.tid === me)) };
        })
        .filter((r) => r.ss.total > 0)
        // the ones you have the better of first, then by how many are left
        .sort((a, b) => b.ss.won - b.ss.lost - (a.ss.won - a.ss.lost) || b.ss.won + b.ss.lost - (a.ss.won + a.ss.lost) || a.t.name.localeCompare(b.t.name)),
    [league, me],
  );
  if (!rows.length) return <div className="empty">No regular-season games on the schedule yet.</div>;
  return (
    <section className="sec" aria-label="Season series">
      <div className="sec-h">
        <h3>Season series</h3>
      </div>
      <div className="card flush gs-list">
        {rows.map(({ t, ss, next, form }) => {
          const p = seriesParts(ss);
          return (
            <Link key={t.tid} to={`/games/${t.tid}`} className="gs-row gs-opp-row">
              <span className="gs-date">
                <span className="d num gs-opp-rec">{ss.won + ss.lost ? `${ss.won}-${ss.lost}` : '0-0'}</span>
              </span>
              <TeamLogo tid={t.tid} size={28} decorative />
              <span className="gs-opp">
                <span className="gs-name ellipsis">{t.name}</span>
                <span className="gs-sub">
                  <span>{[p.left, next && `next ${fmtDate(league.season, next.day)}`].filter(Boolean).join(' · ') || 'All played'}</span>
                </span>
              </span>
              <span className="gs-res">
                {form.length > 0 ? <FormPills results={form} label={`Against the ${t.name}`} page /> : <ChevronRight size={16} className="dim" aria-hidden="true" />}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
