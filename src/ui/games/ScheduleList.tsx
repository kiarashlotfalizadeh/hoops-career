// One team's schedule and results, grouped by month. The Games hub shows the user's split in two
// (what's coming, soonest first, and the results, latest first, each collapsed past its first few);
// a team's page shows its season in order. A result opens its report; an upcoming game of the user's
// opens its matchup page, another team's game that team's page.
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GameResult, League, ScheduledGame } from '../../core/types';
import { curTeamSeason, dayToDate, fmtDate } from '../../core/league/helpers';
import { neutralSite } from '../../core/league/games';
import { standings, type StandingRow } from '../../core/league/standings';
import { planFor } from '../../core/league/gamePlans';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { ordinal, useGamesByGid } from '../league/shared';
import { gameTag, planSize } from './data';
import './games.css';

export type ScheduleFilter = 'all' | 'upcoming' | 'results' | 'home' | 'away' | 'cup' | 'post';

interface Row {
  g: ScheduledGame;
  res?: GameResult;
  opp: number;
  home: boolean;
  won?: boolean;
  us?: number;
  them?: number;
  /** The regular-season record after it. */
  rec?: string;
}

const monthOf = (season: number, day: number) => dayToDate(season, day).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const keep = (f: ScheduleFilter, r: Row) =>
  f === 'home'
    ? r.home && !neutralSite(r.g)
    : f === 'away'
      ? !r.home && !neutralSite(r.g)
      : f === 'cup'
        ? !!r.g.cup
        : f === 'post'
          ? r.g.type === 'playoffs' || r.g.type === 'playin'
          : f === 'upcoming'
            ? !r.g.played
            : f === 'results'
              ? !!r.g.played
              : true;

/**
 * `split`: the user's own schedule on the Games hub, in two lists, leaving out `skip` (the game the
 * hub's card already shows). Otherwise one team's season in order, collapsed around its next game;
 * `h2hTid` marks its games against that team (the user's, on another club's page), `cupOnly` keeps
 * its NBA Cup games.
 */
export function TeamScheduleList({
  league,
  tid,
  h2hTid,
  collapse = true,
  cupOnly = false,
  filter = cupOnly ? 'cup' : 'all',
  split = false,
  skip,
}: {
  league: League;
  tid: number;
  h2hTid?: number;
  collapse?: boolean;
  cupOnly?: boolean;
  filter?: ScheduleFilter;
  split?: boolean;
  skip?: number;
}) {
  const byGid = useGamesByGid(league);
  const ranks = useLeagueMemo(() => new Map(standings(league).map((r) => [r.tid, r])), [league]);
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

  const list = rows.filter((r) => keep(filter, r) && !(split && r.g.gid === skip));
  // (the hub's list leaves out the running record: the top bar has it)
  const rowProps = { league, tid, h2hTid, ranks, brief: split };
  if (!list.length)
    return (
      <div className="empty">
        {filter === 'cup' ? 'No NBA Cup games on the schedule.' : filter === 'post' ? 'No postseason games yet.' : rows.length ? 'No games here.' : 'No games on the schedule yet.'}
      </div>
    );
  if (!split) return <Chronological list={list} all={rows} collapse={collapse} {...rowProps} />;
  const upcoming = list.filter((r) => !r.g.played);
  const results = list.filter((r) => r.g.played).reverse();
  return (
    <>
      {upcoming.length > 0 && (
        <Months title="Upcoming" rows={upcoming} all={rows} first={collapse ? 5 : Infinity} {...rowProps} records={false} more={(n) => `${n} more game${n === 1 ? '' : 's'}`} />
      )}
      {results.length > 0 && (
        <Months title="Results" rows={results} all={rows} first={collapse ? 8 : Infinity} {...rowProps} more={(n) => `${n} earlier result${n === 1 ? '' : 's'}`} />
      )}
    </>
  );
}

interface RowProps {
  league: League;
  tid: number;
  h2hTid?: number;
  ranks: Map<number, StandingRow>;
  brief?: boolean;
}

/** A list under a section heading, grouped by month, its first `first` rows shown until expanded. */
function Months({
  title,
  rows,
  all,
  first,
  more,
  records = true,
  ...p
}: RowProps & { title: string; rows: Row[]; all: Row[]; first: number; more: (n: number) => string; records?: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, first);
  const hidden = rows.length - shown.length;
  return (
    <section className="sec" aria-label={title}>
      <div className="sec-h">
        <h3>{title}</h3>
      </div>
      <div className="card flush gs-list">
        <MonthRows rows={shown} all={all} records={records} {...p} />
        {hidden > 0 && (
          <button className="gs-more" onClick={() => setOpen(true)}>
            <ChevronDown size={15} aria-hidden="true" /> {more(hidden)}
          </button>
        )}
      </div>
    </section>
  );
}

/** One team's season in order, collapsed to the few games before its next one. */
function Chronological({ list, all, collapse, ...p }: RowProps & { list: Row[]; all: Row[]; collapse: boolean }) {
  const [expanded, setExpanded] = useState(!collapse);
  const nextIdx = list.findIndex((r) => !r.g.played);
  const anchor = nextIdx === -1 ? list.length : nextIdx;
  const hidden = !expanded && anchor > 5 ? anchor - 3 : 0;
  return (
    <div className="card flush gs-list">
      {hidden > 0 && (
        <button className="gs-more" onClick={() => setExpanded(true)}>
          <ChevronDown size={15} aria-hidden="true" /> Show {hidden} earlier game{hidden === 1 ? '' : 's'}
        </button>
      )}
      <MonthRows rows={list.slice(hidden)} all={all} {...p} />
    </div>
  );
}

function MonthRows({ rows, all, records = true, ...p }: RowProps & { rows: Row[]; all: Row[]; records?: boolean }) {
  let last = '';
  return (
    <>
      {rows.map((r) => {
        const month = monthOf(p.league.season, r.g.day);
        const head = month !== last;
        last = month;
        const rec = head && records ? monthRecord(all, p.league.season, month) : '';
        return (
          <Fragment key={r.g.gid}>
            {head && (
              <div className="list-divider gs-month">
                <span>{month}</span>
                {rec && <span className="num">{rec}</span>}
              </div>
            )}
            <GameRow r={r} {...p} />
          </Fragment>
        );
      })}
    </>
  );
}

function GameRow({ r, league, tid, h2hTid, ranks, brief }: RowProps & { r: Row }) {
  const user = league.userTid;
  const mine = tid === user || r.opp === user;
  const live = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const today = !r.g.played && r.g.day === league.day && live;
  const opp = league.teams[r.opp];
  const tag = gameTag(league, r.g);
  // the user's upcoming games open their matchup page (the user's own, or the team on whose page this is)
  const vs = tid === user ? r.opp : tid;
  const to = r.res ? `/game/${r.g.gid}` : mine ? `/games/${vs}` : `/teams/${r.opp}`;
  const plan = !r.g.played && mine ? planSize(planFor(league, vs, r.g)) : 0;
  let sub: ReactNode;
  if (r.res) {
    const side = r.res.home.tid === tid ? r.res.home : r.res.away;
    const top = [...side.players].sort((a, b) => b.pts - a.pts)[0];
    const rec = r.g.type === 'regular' && !brief ? `${r.rec} · ` : '';
    // the top scorer's points stay in view when a long name is cut short (the player's own last
    // name while he's in the league: a box-score name can end in "Jr.")
    sub = top ? (
      <>
        <span className="gs-lead">
          {rec}
          {league.players[top.pid]?.lastName ?? top.name}
        </span>
        <span className="num">{top.pts}</span>
      </>
    ) : (
      r.rec
    );
  } else sub = oppLine(league, r.opp, ranks);
  // the keys to the game met, under the score of the user's results
  const keys = r.res && tid === user && r.res.keys?.length ? r.res.keys.filter((k) => k.met !== null) : [];
  const met = keys.filter((k) => k.met).length;
  const under = [r.res?.ot ? (r.res.ot > 1 ? `${r.res.ot}OT` : 'OT') : '', keys.length ? `keys ${met}/${keys.length}` : ''].filter(Boolean).join(' · ');
  return (
    <Link to={to} className={`gs-row${today ? ' today' : ''}${h2hTid !== undefined && r.opp === h2hTid ? ' h2h' : ''}`}>
      <span className="gs-date">
        <span className="wd">{today ? 'Today' : fmtDate(league.season, r.g.day, { weekday: 'short' })}</span>
        <span className="d num">{fmtDate(league.season, r.g.day)}</span>
      </span>
      <TeamLogo tid={r.opp} size={28} decorative />
      <span className="gs-opp">
        <span className="gs-name ellipsis">
          {/* the Cup final is on a neutral floor: nobody's home */}
          <span className="gs-at">{r.home || neutralSite(r.g) ? 'vs' : '@'}</span>
          {opp.name}
        </span>
        <span className="gs-sub">
          {tag && <b className="gs-tag">{tag} · </b>}
          {sub}
        </span>
      </span>
      <span className="gs-res">
        {r.res ? (
          <>
            <span className={`gs-wl ${r.won ? 'w' : 'l'}`}>{r.won ? 'W' : 'L'}</span>
            <span className="num gs-score">
              {r.us}-{r.them}
              {under && <span className="gs-ot">{under}</span>}
            </span>
          </>
        ) : r.g.played ? (
          <span className="gs-ot">Final</span>
        ) : (
          <>
            {plan > 0 && <span className="tag info">Plan</span>}
            <ChevronRight size={16} className="dim" aria-hidden="true" />
          </>
        )}
      </span>
    </Link>
  );
}

/** "8-7 · 5th West", or last season's record before a team has played. */
function oppLine(league: League, opp: number, ranks: Map<number, StandingRow>) {
  const st = ranks.get(opp);
  if (!st) {
    const ts = curTeamSeason(league, opp);
    return `${ts.won}-${ts.lost}`;
  }
  if (st.won + st.lost) return `${st.won}-${st.lost} · ${ordinal(st.confRank)} ${st.conf === 'E' ? 'East' : 'West'}`;
  const prev = league.teams[opp].seasons.find((s) => s.season === league.season - 1);
  return prev && prev.won + prev.lost ? `Last season ${prev.won}-${prev.lost}` : '0-0';
}

/** "9-5", or "3-1 · Play-In 1-0 · Playoffs 2-4" in April: postseason games stay out of the regular-season record. */
function monthRecord(rows: Row[], season: number, month: string) {
  const rec = { regular: [0, 0], playin: [0, 0], playoffs: [0, 0] };
  for (const r of rows) {
    // the Cup championship counts in none of them
    if (!r.res || (r.g.type !== 'regular' && r.g.type !== 'playin' && r.g.type !== 'playoffs')) continue;
    if (monthOf(season, r.g.day) !== month) continue;
    rec[r.g.type][r.won ? 0 : 1]++;
  }
  const part = (label: string, [w, l]: number[]) => (w + l ? `${label}${w}-${l}` : '');
  return [part('', rec.regular), part('Play-In ', rec.playin), part('Playoffs ', rec.playoffs)].filter(Boolean).join(' · ');
}
