import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { GameResult, League, ScheduledGame } from '../../core/types';
import { curTeamSeason, dayToDate, fmtDate } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { teamRatings } from '../stats';
import { Card, Empty } from '../components/ui';
import { ordinal, roundName, useGamesByGid, useQueryParam } from './shared';
import { standings, type StandingRow } from '../../core/league/standings';
import { nextUserGame } from '../../core/analysis/preview';

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

interface Row {
  g: ScheduledGame;
  res?: GameResult;
  opp: number;
  home: boolean;
  won?: boolean;
  us?: number;
  them?: number;
  rec?: string;
}

/**
 * One team's schedule & results, grouped by month. Long lists start collapsed around the next game.
 * `h2hTid` highlights games against that team (e.g. the user's team on another club's page);
 * `cupOnly` keeps just its NBA Cup games.
 */
export function TeamScheduleList({
  league,
  tid,
  h2hTid,
  collapse = true,
  cupOnly = false,
}: {
  league: League;
  tid: number;
  h2hTid?: number;
  collapse?: boolean;
  cupOnly?: boolean;
}) {
  const byGid = useGamesByGid(league);
  const [expanded, setExpanded] = useState(!collapse);
  const ranks = useLeagueMemo(() => new Map(standings(league).map((r) => [r.tid, r])), [league]);
  // the user's next game opens its preview
  const nextGid = useLeagueMemo(() => nextUserGame(league)?.gid, [league]);
  const rows = useLeagueMemo(() => {
    const list = league.schedule.filter((g) => g.home === tid || g.away === tid).sort((a, b) => a.day - b.day || a.gid - b.gid);
    let w = 0;
    let l = 0;
    return list.map((g): Row => {
      const home = g.home === tid;
      const opp = home ? g.away : g.home;
      const res = g.played ? byGid.get(g.gid) : undefined;
      if (!res) return { g, opp, home };
      const us = home ? res.home.pts : res.away.pts;
      const them = home ? res.away.pts : res.home.pts;
      const won = us > them;
      if (g.type === 'regular') {
        if (won) w++;
        else l++;
      }
      return { g, res, opp, home, won, us, them, rec: `${w}-${l}` };
    });
  }, [league, tid, byGid]);

  const list = cupOnly ? rows.filter((r) => r.g.cup) : rows;
  if (!list.length) return <Empty>{cupOnly ? 'No NBA Cup games on the schedule.' : 'No games on the schedule yet.'}</Empty>;

  const nextIdx = list.findIndex((r) => !r.g.played);
  const anchor = nextIdx === -1 ? list.length : nextIdx;
  const hiddenCount = !expanded && anchor > 5 ? anchor - 3 : 0;
  const visible = list.slice(hiddenCount);

  let lastMonth = '';
  return (
    <Card className="flush lg-flat">
      {hiddenCount > 0 && (
        <button className="lg-more" onClick={() => setExpanded(true)}>
          <ChevronDown size={15} /> Show {hiddenCount} earlier game{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {visible.map((r) => {
        const d = dayToDate(league.season, r.g.day);
        const month = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const showMonth = month !== lastMonth;
        lastMonth = month;
        const monthRec = showMonth && !cupOnly ? monthRecord(rows, league.season, month) : '';
        const today = !r.g.played && r.g.day === league.day && (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs');
        const opp = league.teams[r.opp];
        const typeLabel = gameTag(league, r.g);
        const to = r.res ? `/game/${r.g.gid}` : r.g.gid === nextGid ? `/preview/${r.g.gid}` : `/team/${r.opp}`;
        return (
          <Fragment key={r.g.gid}>
            {showMonth && (
              <div className="lg-month">
                <span>{month}</span>
                {monthRec && (
                  <span className="num small dim" style={{ fontFamily: 'var(--font)', letterSpacing: 0, textTransform: 'none' }}>
                    {monthRec}
                  </span>
                )}
              </div>
            )}
            <Link to={to} className={`lg-g-row ${today ? 'today' : ''} ${h2hTid !== undefined && r.opp === h2hTid ? 'h2h' : ''}`}>
              <div className="lg-g-date">
                <span className="wd">{today ? 'Today' : fmtDate(league.season, r.g.day, { weekday: 'short' })}</span>
                <span className="d">{fmtDate(league.season, r.g.day)}</span>
              </div>
              <span className="lg-g-at">{r.home ? 'vs' : '@'}</span>
              <TeamLogo tid={r.opp} size={28} />
              <div style={{ minWidth: 0 }}>
                <div className="bold ellipsis">{opp.name}</div>
                <div className="tiny dim ellipsis">
                  {typeLabel ? (
                    <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>
                      {typeLabel}
                      {' · '}
                    </span>
                  ) : null}
                  {rowSub(league, r, tid, ranks)}
                </div>
              </div>
              <div className="lg-g-res">
                {r.res ? (
                  <>
                    <span className="row" style={{ gap: 6 }}>
                      <span className={`lg-wl ${r.won ? 'w' : 'l'}`}>{r.won ? 'W' : 'L'}</span>
                      <span className="num bold">
                        {r.us}-{r.them}
                      </span>
                    </span>
                    {r.res.ot > 0 && <span className="tiny dim">{r.res.ot > 1 ? `${r.res.ot}OT` : 'OT'}</span>}
                  </>
                ) : r.g.played ? (
                  <span className="tiny dim">Final</span>
                ) : (
                  <ChevronRight size={16} className="dim" />
                )}
              </div>
            </Link>
          </Fragment>
        );
      })}
    </Card>
  );
}

function rowSub(league: League, r: Row, tid: number, ranks: Map<number, StandingRow>) {
  if (r.res) {
    const side = r.res.home.tid === tid ? r.res.home : r.res.away;
    const top = [...side.players].sort((a, b) => b.pts - a.pts)[0];
    // the last word of a box-score name can be a suffix ("Jr."): the player's own last name when he's still in the league
    const lead = top ? `${league.players[top.pid]?.lastName ?? top.name} ${top.pts} pts` : '';
    return [r.g.type === 'regular' ? r.rec : '', lead].filter(Boolean).join(' · ');
  }
  const st = ranks.get(r.opp);
  if (!st) return record(league, r.opp);
  if (st.won + st.lost) return `${st.won}-${st.lost} · ${ordinal(st.confRank)} in ${st.conf === 'E' ? 'East' : 'West'}`;
  // a rank means nothing before the opponent has played: show last season instead, if there was one
  const prev = league.teams[r.opp].seasons.find((s) => s.season === league.season - 1);
  return prev && prev.won + prev.lost ? `Last season ${prev.won}-${prev.lost}` : '0-0';
}

/** "9-5", or "3-1 · Play-In 1-0 · Playoffs 2-4" in April: postseason games don't go into the regular-season record. */
function monthRecord(rows: Row[], season: number, month: string) {
  const rec = { regular: [0, 0], playin: [0, 0], playoffs: [0, 0] };
  for (const r of rows) {
    // the Cup championship counts in none of them
    if (!r.res || (r.g.type !== 'regular' && r.g.type !== 'playin' && r.g.type !== 'playoffs')) continue;
    const m = dayToDate(season, r.g.day).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (m !== month) continue;
    rec[r.g.type][r.won ? 0 : 1]++;
  }
  const part = (label: string, [w, l]: number[]) => (w + l ? `${label}${w}-${l}` : '');
  return [part('', rec.regular), part('Play-In ', rec.playin), part('Playoffs ', rec.playoffs)].filter(Boolean).join(' · ');
}

/** Scoreboard for every game on one calendar day, with a day stepper. */
export function DayScoreboard({ league }: { league: League }) {
  const byGid = useGamesByGid(league);
  const days = useLeagueMemo(() => [...new Set(league.schedule.map((g) => g.day))].sort((a, b) => a - b), [league]);
  const [dayStr, setDayStr] = useQueryParam<string>('day', '');
  if (!days.length) return <Empty>No games scheduled.</Empty>;
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
          <div className="bold">{fmtDate(league.season, day, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          <div className="tiny dim upper">
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
        <button className="btn xs ghost" style={{ alignSelf: 'center' }} onClick={() => setDayStr('')}>
          Jump to {fallback === league.day ? 'today' : fallback > league.day ? 'next game day' : 'latest games'}
        </button>
      )}
      <div className="lg-sb-grid">
        {games.map((g) => (
          <ScoreCard key={g.gid} league={league} g={g} res={byGid.get(g.gid)} />
        ))}
      </div>
    </>
  );
}

/** "MIL 72%": the favorite by season net rating plus home court (logistic on the expected margin). */
function favorite(league: League, g: ScheduledGame): string {
  const h = curTeamSeason(league, g.home);
  const a = curTeamSeason(league, g.away);
  if (h.won + h.lost < 3 || a.won + a.lost < 3) return '';
  const margin = teamRatings(h).net - teamRatings(a).net + 2.5;
  const pHome = 1 / (1 + Math.exp(-margin / 7));
  const fav = pHome >= 0.5 ? g.home : g.away;
  const p = Math.round(Math.max(pHome, 1 - pHome) * 100);
  return `${league.teams[fav].abbrev} ${p}%`;
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
          <TeamLogo tid={t.tid} size={22} />
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
    // the user's next game opens its preview; a later one, Home
    const next = !g.played && nextUserGame(league)?.gid === g.gid;
    return (
      <Link to={next ? `/preview/${g.gid}` : '/'} className="lg-sb me">
        {body}
      </Link>
    );
  }
  return <div className="lg-sb">{body}</div>;
}
