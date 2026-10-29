// The Games hub, the season's spine: the next game as a ticket (the two teams in their colours with
// each one's chance to win, what the night is billed as, the series and the plan; a tap opens its
// matchup page), then the schedule: what's coming and the results, a W or L and the score each.
// One Filter opens every other view (home, away, the Cup, the playoffs, the season series by
// opponent). On game day the Continue bar carries Watch & coach: the ticket doesn't repeat it.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, ListFilter } from 'lucide-react';
import type { GameResult, League, ScheduledGame } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { keepFigures } from '../../core/format';
import { neutralSite } from '../../core/league/games';
import { gameProjection } from '../../core/analysis/preview';
import { Sheet } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { GameBoard } from '../components/FinalSlab';
import { useQueryParam } from '../league/shared';
import { TeamScheduleList, type ScheduleFilter } from './ScheduleList';
import { gameTag, liveSeries, planStatus } from './data';
import { seasonSeries, seriesParts, seriesText } from './series';
import { FormPills, nightTitle, useBillings } from './occasion';
import './games.css';

const FILTERS: (ScheduleFilter | 'opp')[] = ['all', 'upcoming', 'results', 'home', 'away', 'cup', 'post', 'opp'];
const FILTER_LABEL: Record<ScheduleFilter | 'opp', string> = {
  all: 'All games',
  upcoming: 'Upcoming',
  results: 'Results',
  opp: 'By opponent',
  home: 'Home games',
  away: 'Away games',
  cup: 'NBA Cup',
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
  const pick = <FilterPick value={on} options={shown} onChange={setFilter} />;
  return (
    <main className="page">
      <h1 className="sr-only">Games</h1>
      {next && <NextGame league={league} g={next} />}
      {on === 'opp' ? (
        <ByOpponent league={league} right={pick} />
      ) : (
        <TeamScheduleList league={league} tid={me} filter={on} split skip={next?.gid} headRight={pick} collapse={on !== 'upcoming' && on !== 'results'} />
      )}
    </main>
  );
}

/** The schedule's one control: which games it shows, a sheet of every view a tap away. */
function FilterPick({ value, options, onChange }: { value: ScheduleFilter | 'opp'; options: (ScheduleFilter | 'opp')[]; onChange: (v: ScheduleFilter | 'opp') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn xs gs-filter${value !== 'all' ? ' on' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Show: ${FILTER_LABEL[value]}`}>
        <ListFilter size={14} aria-hidden="true" /> {FILTER_LABEL[value]}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Show">
        <div className="card flush list" role="radiogroup" aria-label="Show games">
          {options.map((id) => (
            <button
              key={id}
              className="gs-pick"
              role="radio"
              aria-checked={id === value}
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
            >
              <span className="grow">{FILTER_LABEL[id]}</span>
              {id === value && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/**
 * The next game as a ticket: the two teams on their colours with each one's chance to win, then what
 * the night is billed as, the series and the plan. The whole ticket opens its matchup page.
 */
function NextGame({ league, g }: { league: League; g: ScheduledGame }) {
  const me = league.userTid;
  const opp = g.home === me ? g.away : g.home;
  const t = league.teams[opp];
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
  const [bill] = useBillings(league, g);
  // the preview's chance to win, from the home side
  const proj = useLeagueMemo(() => gameProjection(league, g), [league, g]);
  const seriesLine = series
    ? (() => {
        const [w, l] = series.high === me ? [series.highWins, series.lowWins] : [series.lowWins, series.highWins];
        // (before game 1 the tag above says it all)
        return w + l === 0 ? '' : w === l ? `Series tied ${w}-${l}` : `${w > l ? league.teams[me].abbrev : t.abbrev} leads ${Math.max(w, l)}-${Math.min(w, l)}`;
      })()
    : ss && ss.total > 0
      ? // ("Season 1-0 · 3 left"; before the first meeting, "No meetings yet · 4 left")
        `${ss.won + ss.lost ? 'Season ' : ''}${seriesText(ss)}`
      : '';
  const rec = (tid: number) => {
    const ts = curTeamSeason(league, tid);
    return keepFigures(`${ts.won}-${ts.lost}`);
  };
  const chance = (v: number) => (
    <>
      {Math.round(v * 100)}
      <small>%</small>
    </>
  );
  return (
    <section className="gs-next" aria-label={`Next game: ${when}, ${g.home === me || neutral ? 'vs' : 'at'} the ${t.region} ${t.name}`}>
      <GameBoard
        league={league}
        links={false}
        // (as shown: 50% against 50% is neither side's)
        away={{ tid: g.away, fig: chance(1 - proj.win), sub: rec(g.away), lost: Math.round((1 - proj.win) * 100) < 50 }}
        home={{ tid: g.home, fig: chance(proj.win), sub: rec(g.home), lost: Math.round(proj.win * 100) < 50 }}
        over={[`${when} · ${where}`, tag]}
        mid={<span className="gd-bd-k">To win</span>}
      />
      <div className="gs-next-body">
        {/* the poster's headline: what the night is billed as, or on an ordinary night who's next */}
        <div className="gs-next-bill">
          <h2 className={`gs-next-h w${bill ? bill.weight : 1}`}>{bill ? bill.tag : nightTitle(league, g, neutral)}</h2>
          {bill && <div className="gs-next-l">{keepFigures(bill.line)}</div>}
        </div>
        {series && <SeriesStrip league={league} seriesId={series.id} />}
        <div className="gs-next-foot">
          <span className="grow gs-next-facts">
            <span className={plan.set ? 'gs-next-plan set' : 'gs-next-plan'}>{plan.text}</span>
            {seriesLine && <span className="gs-next-ss">{keepFigures(seriesLine)}</span>}
          </span>
          <Link to={`/games/${opp}`} className="btn sm gs-next-go" aria-label={`Matchup: the ${t.name}`}>
            Matchup <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
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
              <span className="num">{keepFigures(score(r))}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The season series against every opponent: the record, what's left, the last result and the next meeting, a row each (a tap to its matchup page). */
function ByOpponent({ league, right }: { league: League; right?: ReactNode }) {
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
  if (!rows.length)
    return (
      <section className="sec" aria-label="Season series">
        <div className="sec-h">
          <h3>Season series</h3>
          {right}
        </div>
        <div className="empty">No regular-season games on the schedule yet.</div>
      </section>
    );
  return (
    <section className="sec" aria-label="Season series">
      <div className="sec-h">
        <h3>Season series</h3>
        {right}
      </div>
      <div className="card flush gs-list">
        {rows.map(({ t, ss, next, form }) => {
          const p = seriesParts(ss);
          return (
            <Link key={t.tid} to={`/games/${t.tid}`} className="gs-row gs-opp-row">
              <span className="gs-date">
                <span className="d num gs-opp-rec">{keepFigures(ss.won + ss.lost ? `${ss.won}-${ss.lost}` : '0-0')}</span>
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
