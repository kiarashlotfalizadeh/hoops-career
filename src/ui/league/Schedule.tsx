import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GameResult, League, ScheduledGame } from '../../core/types';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { teamRatings } from '../stats';
import { roundName, useGamesByGid, useQueryParam } from './shared';
import { nextUserGame } from '../../core/analysis/preview';
import { neutralSite } from '../../core/league/games';

// one team's schedule and results lives with the Games screens
export { TeamScheduleList } from '../games/ScheduleList';

const TYPE_LABEL: Record<string, string> = { playin: 'Play-In', playoffs: 'Playoffs', allstar: 'All-Star' };
const CUP_SHORT: Record<string, string> = { group: 'Cup', qf: 'Cup QF', sf: 'Cup SF', final: 'Cup Final' };

function record(league: League, tid: number) {
  const ts = curTeamSeason(league, tid);
  return `${ts.won}-${ts.lost}`;
}

/** "1st Round G4", "Finals G2", "Play-In", or '' for regular-season games. */
function gameTag(league: League, g: ScheduledGame): string {
  if (g.type === 'playoffs') {
    const round = g.seriesId ? Number(g.seriesId[1]) : 0;
    const n = seriesGameNo(league, g);
    return `${round >= 1 ? roundName(round, true) : 'Playoffs'}${n ? ` G${n}` : ''}`;
  }
  if (g.cup) return CUP_SHORT[g.cup];
  return TYPE_LABEL[g.type] ?? '';
}

/** Game number within a playoff series (1-based), by scheduling order. */
function seriesGameNo(league: League, g: ScheduledGame) {
  if (!g.seriesId) return 0;
  const list = league.schedule.filter((x) => x.seriesId === g.seriesId && x.type === g.type).sort((a, b) => a.day - b.day || a.gid - b.gid);
  return list.findIndex((x) => x.gid === g.gid) + 1;
}

/** Scoreboard for every game on one calendar day, with a day stepper. */
export function DayScoreboard({ league }: { league: League }) {
  const byGid = useGamesByGid(league);
  const days = useLeagueMemo(() => [...new Set(league.schedule.map((g) => g.day))].sort((a, b) => a - b), [league]);
  const [dayStr, setDayStr] = useQueryParam<string>('day', '');
  if (!days.length) return <div className="card empty">No games scheduled.</div>;
  const fallback = days.includes(league.day) ? league.day : (days.find((d) => d >= league.day) ?? days[days.length - 1]);
  const day = dayStr !== '' && days.includes(Number(dayStr)) ? Number(dayStr) : fallback;
  const idx = days.indexOf(day);
  const prev = idx > 0 ? days[idx - 1] : undefined;
  const next = idx < days.length - 1 ? days[idx + 1] : undefined;
  const go = (d: number | undefined) => d !== undefined && setDayStr(d === fallback ? '' : String(d));
  const games = league.schedule
    .filter((g) => g.day === day)
    .sort((a, b) => {
      const ua = a.home === league.userTid || a.away === league.userTid ? 0 : 1;
      const ub = b.home === league.userTid || b.away === league.userTid ? 0 : 1;
      return ua - ub || a.gid - b.gid;
    });
  const isToday = day === league.day;
  const played = games.filter((g) => g.played).length;

  return (
    <>
      <div className="lg-day">
        <button className="iconbtn" disabled={prev === undefined} onClick={() => go(prev)} aria-label="Previous day">
          <ChevronLeft size={20} />
        </button>
        <div className="mid">
          <div className="lg-day-d">{fmtDate(league.season, day, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <div className="lg-day-s">
            {isToday ? 'Today · ' : ''}
            {games.length} game{games.length === 1 ? '' : 's'}
            {played && played < games.length ? ` · ${played} final` : played ? ' · final' : ''}
          </div>
        </div>
        <button className="iconbtn" disabled={next === undefined} onClick={() => go(next)} aria-label="Next day">
          <ChevronRight size={20} />
        </button>
      </div>
      {day !== fallback && (
        <button className="btn xs ghost lg-jump" onClick={() => setDayStr('')}>
          Jump to {fallback === league.day ? 'today' : fallback > league.day ? 'next game day' : 'latest games'}
        </button>
      )}
      <div className="card flush lg-sb-grid">
        {games.map((g) => (
          <ScoreCard key={g.gid} league={league} g={g} res={byGid.get(g.gid)} />
        ))}
      </div>
    </>
  );
}

/** "MIL 72% to win": the favorite by season net rating plus home court, none on a neutral floor (logistic on the expected margin). */
function favorite(league: League, g: ScheduledGame): string {
  const h = curTeamSeason(league, g.home);
  const a = curTeamSeason(league, g.away);
  if (h.won + h.lost < 3 || a.won + a.lost < 3) return '';
  const margin = teamRatings(h).net - teamRatings(a).net + (neutralSite(g) ? 0 : 2.5);
  const pHome = 1 / (1 + Math.exp(-margin / 7));
  const fav = pHome >= 0.5 ? g.home : g.away;
  const p = Math.round(Math.max(pHome, 1 - pHome) * 100);
  return `${league.teams[fav].abbrev} ${p}% to win`;
}

function ScoreCard({ league, g, res }: { league: League; g: ScheduledGame; res?: GameResult }) {
  const mine = g.home === league.userTid || g.away === league.userTid;
  const tag = gameTag(league, g);
  const done = !!res || !!g.played;
  const status = res ? `Final${res.ot ? (res.ot > 1 ? `/${res.ot}OT` : '/OT') : ''}` : g.played ? 'Final' : tag || 'Preview';
  const right = done ? tag : favorite(league, g);
  // a playoff card shows the series as it stood after this game (or going into it)
  const series =
    g.seriesId && g.type === 'playoffs'
      ? league.games.filter((x) => x.season === league.season && x.type === 'playoffs' && x.seriesId === g.seriesId && (x.day < g.day || x.gid === g.gid))
      : undefined;
  const seriesWins = (tid: number) => series?.filter((x) => (x.home.pts > x.away.pts ? x.home.tid : x.away.tid) === tid).length ?? 0;
  const lines = [
    { tid: g.away, pts: res?.away.pts },
    { tid: g.home, pts: res?.home.pts },
  ];
  const winner = res ? (res.home.pts > res.away.pts ? g.home : g.away) : undefined;
  const body = (
    <>
      <div className="lg-sb-st">
        <span className={!done && mine ? 'live' : ''}>{status}</span>
        {right && <span title={done ? undefined : 'Win probability from net ratings and home court'}>{right}</span>}
      </div>
      {lines.map((t) => (
        <div key={t.tid} className={`lg-sb-t ${winner !== undefined && winner !== t.tid ? 'lose' : ''}`}>
          <TeamLogo tid={t.tid} size={22} decorative />
          <span className="ab">
            {league.teams[t.tid].abbrev}
            <span className="rec">{series ? `${seriesWins(t.tid)}-${seriesWins(t.tid === g.home ? g.away : g.home)}` : record(league, t.tid)}</span>
          </span>
          <span className="sc">{t.pts ?? ''}</span>
        </div>
      ))}
    </>
  );
  if (res) {
    return (
      <Link to={`/game/${g.gid}`} className={`lg-sb ${mine ? 'me' : ''}`}>
        {body}
      </Link>
    );
  }
  if (mine) {
    // the user's next game opens its matchup preview; a later one, his schedule
    const next = !g.played && nextUserGame(league)?.gid === g.gid;
    const opp = g.home === league.userTid ? g.away : g.home;
    return (
      <Link to={next ? `/games/${opp}?tab=preview` : '/games'} className="lg-sb me">
        {body}
      </Link>
    );
  }
  return <div className="lg-sb">{body}</div>;
}
