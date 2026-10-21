// One team's schedule and results, grouped by month. The Games hub shows the user's split in two
// (what's coming, soonest first, and the results, latest first, each collapsed past its first few);
// a team's page shows its season in order. A result opens its report; an upcoming game of the user's
// opens its matchup page, another team's game that team's page. A row is the date, the opponent and
// one fact: an upcoming game's billing on the user's own schedule (a rivalry, Christmas Day, Game 7)
// or the opponent's standing; a result's W or L and score, with its top scorer (or, for a front-page
// night, its headline).
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GameResult, League, NewsItem, ScheduledGame } from '../../core/types';
import { billingsFor, userGameNews, type Billing } from '../../core/analysis/gameStory';
import { curTeamSeason, dayToDate, fmtDate } from '../../core/league/helpers';
import { boxNames } from './report/names';
import { neutralSite } from '../../core/league/games';
import { standings, type StandingRow } from '../../core/league/standings';
import { planFor } from '../../core/league/gamePlans';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { ordinal, useGamesByGid } from '../league/shared';
import { gameTag, planSize } from './data';
import { plural } from '../../core/format';
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
  /** The user's upcoming game: what it's billed as. */
  bill?: Billing;
  /** The user's result: the press's story of it. */
  story?: NewsItem;
}

/** Games further off than this are marked only for what can't change (a rivalry, Christmas Day): see billingsFor's `light`. */
const NEAR_DAYS = 7;

/** Billings about the team's run rather than the game: every game ahead shares them. */
const TEAM_STATE = new Set(['Streak on the line', 'Snap the skid']);

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
  headRight,
}: {
  league: League;
  tid: number;
  h2hTid?: number;
  collapse?: boolean;
  cupOnly?: boolean;
  filter?: ScheduleFilter;
  split?: boolean;
  skip?: number;
  /** A control on the right of the first section's head (the hub's filter). */
  headRight?: ReactNode;
}) {
  const byGid = useGamesByGid(league);
  const ranks = useLeagueMemo(() => new Map(standings(league).map((r) => [r.tid, r])), [league]);
  const rows = useLeagueMemo(() => {
    const list = league.schedule.filter((g) => g.home === tid || g.away === tid).sort((a, b) => a.day - b.day || a.gid - b.gid);
    const user = tid === league.userTid;
    const stories = user ? userGameNews(league) : null;
    let w = 0;
    let l = 0;
    return list.map((g): Row => {
      const home = g.home === tid;
      const opp = home ? g.away : g.home;
      const res = g.played ? byGid.get(g.gid) : undefined;
      if (!res) {
        // (a streak is the team's, the same on every game ahead: a row marks what's about its own game)
        const bill =
          user && !g.played && g.type !== 'allstar' ? billingsFor(league, g, tid, { light: g.day - league.day > NEAR_DAYS }).find((b) => !TEAM_STATE.has(b.tag)) : undefined;
        // (a Cup or play-in game's tag already says what its billing would)
        return { g, opp, home, ...(bill && bill.weight >= 2 && !/^(NBA Cup|Cup |Play-In)/.test(bill.tag) ? { bill } : {}) };
      }
      const story = stories?.get(`${res.season}-${res.day}`);
      const us = home ? res.home.pts : res.away.pts;
      const them = home ? res.away.pts : res.home.pts;
      const won = us > them;
      if (g.type === 'regular') {
        if (won) w++;
        else l++;
      }
      return { g, res, opp, home, won, us, them, rec: `${w}-${l}`, ...(story && (story.weight ?? 1) >= 2 ? { story } : {}) };
    });
  }, [league, tid, byGid]);

  const list = rows.filter((r) => keep(filter, r) && !(split && r.g.gid === skip));
  // (no list carries the team's running record: a row's line is about its game, its top scorer or
  // the opponent's record, the same on every team's schedule; a month's record is in its divider)
  const rowProps = { league, tid, h2hTid, ranks };
  if (!list.length) {
    const empty = (
      <div className="empty">
        {filter === 'cup' ? 'No NBA Cup games on the schedule.' : filter === 'post' ? 'No postseason games yet.' : rows.length ? 'No games here.' : 'No games on the schedule yet.'}
      </div>
    );
    return headRight ? (
      <section className="sec">
        <div className="sec-h">
          <h3>Schedule</h3>
          {headRight}
        </div>
        {empty}
      </section>
    ) : (
      empty
    );
  }
  if (!split) return <Chronological list={list} all={rows} collapse={collapse} {...rowProps} />;
  const upcoming = list.filter((r) => !r.g.played);
  const results = list.filter((r) => r.g.played).reverse();
  return (
    <>
      {upcoming.length > 0 && (
        <Months
          title="Upcoming"
          right={headRight}
          rows={upcoming}
          all={rows}
          first={collapse ? 5 : Infinity}
          {...rowProps}
          records={false}
          more={(n) => `Show ${plural(n, 'more game')}`}
        />
      )}
      {results.length > 0 && (
        <Months
          title="Results"
          right={upcoming.length ? undefined : headRight}
          rows={results}
          all={rows}
          first={collapse ? 8 : Infinity}
          {...rowProps}
          more={(n) => `Show ${plural(n, 'earlier result')}`}
        />
      )}
    </>
  );
}

interface RowProps {
  league: League;
  tid: number;
  h2hTid?: number;
  ranks: Map<number, StandingRow>;
}

/** A list under a section heading, grouped by month, its first `first` rows shown until expanded. */
function Months({
  title,
  rows,
  all,
  first,
  more,
  records = true,
  right,
  ...p
}: RowProps & { title: string; right?: ReactNode; rows: Row[]; all: Row[]; first: number; more: (n: number) => string; records?: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, first);
  const hidden = rows.length - shown.length;
  return (
    <section className="sec" aria-label={title}>
      <div className="sec-h">
        <h3>{title}</h3>
        {right}
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

function GameRow({ r, league, tid, h2hTid, ranks }: RowProps & { r: Row }) {
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
    // the top scorer's points stay in view when a long name is cut short (the player's own last
    // name while he's in the league: a box-score name can end in "Jr."; a teammate's namesake told apart)
    // a big night reads as its headline (the top scorer is in it, or in the report)
    // (a front-page night only: the rest are a tap away in the report)
    sub =
      r.story?.head && (r.story.weight ?? 1) >= 3 ? (
        <span className="gs-head">{r.story.head}</span>
      ) : top ? (
        <>
          <span className="gs-lead">{boxNames(league, side)(top.pid) || top.name}</span>
          <span className="num">{top.pts}</span>
        </>
      ) : (
        r.rec
      );
  } else {
    // one fact: what the night is billed as, else how they stand
    sub = r.bill ? <b className={`gs-bill w${r.bill.weight}`}>{r.bill.tag}</b> : oppLine(league, r.opp, ranks);
  }
  const ot = r.res?.ot ? (r.res.ot > 1 ? `${r.res.ot}OT` : 'OT') : '';
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
        {(tag || sub) && (
          <span className="gs-sub">
            {tag && (
              <b className="gs-tag">
                {tag}
                {sub ? ' · ' : ''}
              </b>
            )}
            {sub}
          </span>
        )}
      </span>
      <span className="gs-res">
        {r.res ? (
          <>
            <span className={`gs-wl ${r.won ? 'w' : 'l'}`}>{r.won ? 'W' : 'L'}</span>
            <span className="num gs-score">
              {r.us}-{r.them}
              {ot && <span className="gs-ot">{ot}</span>}
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

/** "8-7 · 5th West", or last season's record before a team has played (else nothing). */
function oppLine(league: League, opp: number, ranks: Map<number, StandingRow>) {
  const st = ranks.get(opp);
  if (!st) {
    const ts = curTeamSeason(league, opp);
    return `${ts.won}-${ts.lost}`;
  }
  if (st.won + st.lost) return `${st.won}-${st.lost} · ${ordinal(st.confRank)} ${st.conf === 'E' ? 'East' : 'West'}`;
  const prev = league.teams[opp].seasons.find((s) => s.season === league.season - 1);
  // (nobody has played and there's no last season to go by: nothing worth a line)
  return prev && prev.won + prev.lost ? `Last season ${prev.won}-${prev.lost}` : '';
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
