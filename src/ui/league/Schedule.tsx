import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GameResult, League, ScheduledGame } from '../../core/types';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { p0 } from '../stats';
import { keepFigures, plural } from '../../core/format';
import { roundName, useGamesByGid, useQueryParam } from './shared';
import { gameProjection, nextUserGame } from '../../core/analysis/preview';

// one team's schedule and results lives with the Games screens
export { TeamScheduleList } from '../games/ScheduleList';

const TYPE_LABEL: Record<string, string> = { playin: 'Play-In', playoffs: 'Playoffs', allstar: 'All-Star' };
const CUP_SHORT: Record<string, string> = { group: 'Cup', qf: 'Cup QF', sf: 'Cup SF', final: 'Cup Final' };

function record(league: League, tid: number) {
  const ts = curTeamSeason(league, tid);
  return `${ts.won}-${ts.lost}`;
}

/** Each team's regular-season record after each day's games, this season: a past day's cards show the records as they stood then. */
function recordsByDay(league: League): Map<number, Map<number, [number, number]>> {
  const out = new Map<number, Map<number, [number, number]>>();
  const run = new Map<number, [number, number]>();
  const games = league.games.filter((g) => g.season === league.season && g.type === 'regular').sort((a, b) => a.day - b.day || a.gid - b.gid);
  for (const g of games) {
    const homeWon = g.home.pts > g.away.pts;
    for (const [tid, won] of [
      [g.home.tid, homeWon],
      [g.away.tid, !homeWon],
    ] as const) {
      const [w, l] = run.get(tid) ?? [0, 0];
      const now: [number, number] = won ? [w + 1, l] : [w, l + 1];
      run.set(tid, now);
      let day = out.get(g.day);
      if (!day) out.set(g.day, (day = new Map()));
      day.set(tid, now);
    }
  }
  return out;
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
  const afterDay = useLeagueMemo(() => recordsByDay(league), [league]);
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
      {/* the day is the poster: its date as the headline, its games counted over it, the stepper beside */}
      <div className="lg-day">
        <div className="mid">
          <p className="over">
            {isToday ? 'Today · ' : ''}
            {plural(games.length, 'game')}
            {played && played < games.length ? ` · ${played} final` : played ? ' · all final' : ''}
          </p>
          <h2 className="lg-day-d">{fmtDate(league.season, day, { weekday: 'short', month: 'short', day: 'numeric' })}</h2>
        </div>
        <div className="lg-day-nav">
          <button className="iconbtn" disabled={prev === undefined} onClick={() => go(prev)} aria-label="Previous day">
            <ChevronLeft size={20} />
          </button>
          <button className="iconbtn" disabled={next === undefined} onClick={() => go(next)} aria-label="Next day">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      {day !== fallback && (
        <button className="btn xs ghost lg-jump" onClick={() => setDayStr('')}>
          Jump to {fallback === league.day ? 'today' : fallback > league.day ? 'next game day' : 'latest games'}
        </button>
      )}
      <div className="card flush lg-sb-grid">
        {games.map((g) => (
          <ScoreCard key={g.gid} league={league} g={g} res={byGid.get(g.gid)} after={day < league.day ? afterDay.get(day) : undefined} />
        ))}
      </div>
    </>
  );
}

/** "MIL 72%": the matchup preview's own projection (net ratings regressed toward tonight's rotations, home court), so the two never disagree. */
function favorite(league: League, g: ScheduledGame): string {
  const { win } = gameProjection(league, g);
  const fav = win >= 0.5 ? g.home : g.away;
  return `${league.teams[fav].abbrev} ${p0(Math.max(win, 1 - win))}`;
}

function ScoreCard({ league, g, res, after }: { league: League; g: ScheduledGame; res?: GameResult; after?: Map<number, [number, number]> }) {
  const mine = g.home === league.userTid || g.away === league.userTid;
  const tag = gameTag(league, g);
  const done = !!res || !!g.played;
  // (the projection sets up the game as it will tip off: once per league change)
  const fav = useLeagueMemo(() => (done ? '' : favorite(league, g)), [league, g, done]);
  // a game to come leads with its favourite ("LAC 53% to win"), a final with its result; the right
  // holds what kind of game it is (a Cup night, a playoff game), when it is one
  const status = res ? `Final${res.ot ? (res.ot > 1 ? `/${res.ot}OT` : '/OT') : ''}` : g.played ? 'Final' : tag ? fav : `${fav} to win`;
  const right = tag;
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
        <span className={!done && mine ? 'live' : ''} title={done ? undefined : 'Chance to win, from the matchup preview'}>
          {status}
          {!done && tag && <span className="sr-only"> to win</span>}
        </span>
        {right && <span>{right}</span>}
      </div>
      {lines.map((t) => (
        <div key={t.tid} className={`lg-sb-t ${winner !== undefined && winner !== t.tid ? 'lose' : ''}`}>
          <TeamLogo tid={t.tid} size={22} decorative />
          <span className="ab">
            {league.teams[t.tid].abbrev}
            <span className="rec">
              {keepFigures(
                series ? `${seriesWins(t.tid)}-${seriesWins(t.tid === g.home ? g.away : g.home)}` : after?.get(t.tid) ? after.get(t.tid)!.join('-') : record(league, t.tid),
              )}
            </span>
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
