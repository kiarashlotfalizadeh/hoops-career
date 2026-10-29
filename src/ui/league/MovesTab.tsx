// The transaction log on screen: a team's Moves tab, a player's Transactions card and the last
// deals with a trade partner. Lines come from core (txnLine) with the names of the day; a player
// still in the league links to his page.
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { League, Phase, Txn, TxnKind } from '../../core/types';
import { fmtDate } from '../../core/league/helpers';
import { playerTxns, teamTxns, tradesBetween, txnLine, type TxnPart } from '../../core/league/transactions';
import { seasonLabel } from '../../core/constants';
import { plural } from '../../core/format';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Help } from '../components/ui';
import { teamPath, useQueryParam } from './shared';

type Group = 'trade' | 'signing' | 'release' | 'draft' | 'other';
type Filter = 'all' | Group;

const GROUP: Record<TxnKind, Group> = {
  trade: 'trade',
  // an exercised pick swap: picks changing hands, as in a trade
  swap: 'trade',
  sign: 'signing',
  resign: 'signing',
  extend: 'signing',
  twoWay: 'signing',
  convert: 'signing',
  claim: 'signing',
  release: 'release',
  waive: 'release',
  buyout: 'release',
  renounce: 'release',
  option: 'other',
  draft: 'draft',
  // restricted free agency: an offer sheet and its outcome are signings; a qualifying offer is a
  // rights call, like an option, until he takes it (see groupOf)
  qualify: 'other',
  offerSheet: 'signing',
  match: 'signing',
  // a 10-day contract is a signing; one that ended, a departure
  tenDay: 'signing',
};
/** A move's filter group: a qualifying offer he took is a signing, a 10-day contract that ended a release. */
const groupOf = (t: Txn): Group => (t.kind === 'qualify' && t.note === 'accepted' ? 'signing' : t.kind === 'tenDay' && t.note === 'ended' ? 'release' : GROUP[t.kind]);
const FILTERS: Filter[] = ['all', 'trade', 'signing', 'release', 'draft', 'other'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', trade: 'Trades', signing: 'Signings', release: 'Releases', draft: 'Draft', other: 'Other' };

const OFFSEASON: Phase[] = ['draftLottery', 'draft', 'resign', 'freeAgency'];
const PAGE = 40;

/** A move's line: text, players by their names then (linked while still in the league), teams by abbreviation. */
export function TxnText({ league, parts }: { league: League; parts: TxnPart[] }) {
  return (
    <>
      {parts.map((x, i) =>
        typeof x === 'string' ? (
          <Fragment key={i}>{x}</Fragment>
        ) : 'tid' in x ? (
          <Link key={i} to={teamPath(x.tid)} className="lg-name-link">
            {league.teams[x.tid]?.abbrev ?? '?'}
          </Link>
        ) : league.players[x.pid] ? (
          <Link key={i} to={`/player/${x.pid}`} className="lg-name-link">
            {x.name}
          </Link>
        ) : (
          <span key={i} className="bold">
            {x.name}
          </span>
        ),
      )}
    </>
  );
}

/** A team's moves, newest first, by season (the summer's draft, re-signings and free agency as its own block). */
export function MovesTab({ league, tid }: { league: League; tid: number }) {
  const [filter, setFilter] = useQueryParam<Filter>('moves', 'all', FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const all = useLeagueMemo(() => teamTxns(league, tid), [league, tid]);
  const counts = new Map<Filter, number>([['all', all.length]]);
  for (const t of all) counts.set(groupOf(t), (counts.get(groupOf(t)) ?? 0) + 1);
  const shown = all.filter((t) => filter === 'all' || groupOf(t) === filter);
  // kinds with no moves stay out, as on the News tab; with a single kind there's nothing to filter
  const chips = FILTERS.filter((f) => f === 'all' || f === filter || counts.get(f));
  let lastKey = '';
  return (
    <>
      <div className="lg-bar lg-bar-chips">
        <div className="lg-hscroll lg-bar-scroll" role="group" aria-label="Kind of move">
          {chips.length > 2 || filter !== 'all'
            ? chips.map((f) => (
                <button key={f} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {FILTER_LABEL[f]} <span className="lg-count num">{counts.get(f) ?? 0}</span>
                </button>
              ))
            : all.length > 0 && <span className="lg-bar-l">{plural(all.length, 'move')}</span>}
        </div>
        <span className="lg-bar-r">
          <Help title="The moves log">
            <p className="lg-p">Trades and your own moves stay in the log for good.</p>
            <p className="lg-p">Other teams&apos; signings, releases, options and draft picks stay two seasons. Their minimum deals aren&apos;t listed.</p>
          </Help>
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="card empty">{all.length ? 'No moves of this kind in the log.' : 'No moves yet. Trades, signings, extensions and releases land here.'}</div>
      ) : (
        <div className="card flush">
          {shown.slice(0, limit).map((t) => {
            const summer = OFFSEASON.includes(t.phase);
            const key = `${t.season}:${summer}`;
            const header = key !== lastKey;
            lastKey = key;
            return (
              <Fragment key={t.id}>
                {header && <div className="list-divider">{summer ? `${t.season} offseason` : `${seasonLabel(t.season)} season`}</div>}
                <div className="lg-news lg-txn">
                  <div className="lg-news-body">
                    <div className="lg-news-text">
                      <TxnText league={league} parts={txnLine(t, { tid })} />
                    </div>
                    {/* (the line's own verb says what kind of move it was: "Signed", "Traded") */}
                    <div className="lg-news-date">{fmtDate(t.season, t.day)}</div>
                  </div>
                </div>
              </Fragment>
            );
          })}
          {shown.length > limit && (
            <button className="lg-more" onClick={() => setLimit(limit + PAGE)}>
              <ChevronDown size={15} /> Show more ({shown.length - limit})
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The whole league's transaction log, newest first (News → Transactions): each move from its first
 * team's side, that team named first. `mine` keeps the user's team's moves.
 */
export function LeagueMoves({ league, mine }: { league: League; mine: boolean }) {
  const [limit, setLimit] = useState(PAGE);
  const all = useLeagueMemo(() => [...(league.transactions ?? [])].sort((a, b) => b.id - a.id), [league]);
  const shown = mine ? all.filter((t) => t.tids.includes(league.userTid)) : all;
  if (!shown.length) return <div className="card empty">No moves yet.</div>;
  let lastKey = '';
  return (
    <div className="card flush">
      {shown.slice(0, limit).map((t) => {
        const key = `${t.season}:${t.day}`;
        const header = key !== lastKey;
        lastKey = key;
        const tid = t.tids[0];
        return (
          <Fragment key={t.id}>
            {header && (
              <div className="list-divider">
                {fmtDate(t.season, t.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                {t.season !== league.season ? ` · ${seasonLabel(t.season)}` : ''}
              </div>
            )}
            <div className="lg-news lg-txn">
              <div className="lg-news-body">
                <div className="lg-news-text">
                  {league.teams[tid] && (
                    <Link to={teamPath(tid)} className="lg-name-link lg-txn-team">
                      <TeamLogo tid={tid} size={16} decorative />
                      {league.teams[tid].abbrev}
                    </Link>
                  )}{' '}
                  <TxnText league={league} parts={txnLine(t, { tid })} />
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
      {shown.length > limit && (
        <button className="lg-more" onClick={() => setLimit(limit + PAGE)}>
          <ChevronDown size={15} /> Show more ({shown.length - limit})
        </button>
      )}
    </div>
  );
}

/** The team a move put the player with (a trade: the team that got him; an offer sheet he joined: the team that signed it), for its logo. */
function moveTeam(t: Txn, pid: number): number {
  if (t.kind === 'match' && t.note === 'declined') return t.tids[1];
  if (t.kind !== 'trade') return t.tids[0];
  return t.sides?.find((s) => !s.players.some((x) => x.pid === pid))?.tid ?? t.tids[0];
}

const monthYear = (t: Txn) => fmtDate(t.season, t.day, { month: 'short', year: 'numeric' });

/** A player's Transactions card: every move of his in the log, newest first (nothing when there are none). */
export function PlayerMoves({ league, pid }: { league: League; pid: number }) {
  const [all, setAll] = useState(false);
  const moves = useLeagueMemo(() => playerTxns(league, pid), [league, pid]);
  if (!moves.length) return null;
  const shown = all ? moves : moves.slice(0, 6);
  return (
    <Card title="Transactions">
      <div className="col lg-pmoves">
        {shown.map((t) => (
          <div key={t.id} className="row top lg-pmove">
            <TeamLogo tid={moveTeam(t, pid)} size={22} />
            <div className="grow small lg-lh">
              <TxnText league={league} parts={txnLine(t, { pid })} />
            </div>
            <span className="tiny dim num nowrap">{monthYear(t)}</span>
          </div>
        ))}
      </div>
      {moves.length > shown.length && (
        <button className="btn xs lg-pmoves-all" onClick={() => setAll(true)}>
          Show all {moves.length}
        </button>
      )}
    </Card>
  );
}

/** The user's last three trades with team `tid`, from his side, for the Trade screen's partner card. */
export function RecentDeals({ league, tid }: { league: League; tid: number }) {
  const deals = useLeagueMemo(() => tradesBetween(league, league.userTid, tid).slice(0, 3), [league, tid]);
  if (!deals.length) return null;
  return (
    <div className="lg-deals">
      <div className="lg-deals-h">Your last {deals.length === 1 ? 'deal' : `${deals.length} deals`} with them</div>
      <div className="col lg-deals-list">
        {deals.map((t) => (
          <div key={t.id} className="small lg-lh">
            <span className="tiny dim num">{fmtDate(t.season, t.day, { month: 'short', day: 'numeric', year: 'numeric' })} · </span>
            <TxnText league={league} parts={txnLine(t, { tid: league.userTid })} />
          </div>
        ))}
      </div>
    </div>
  );
}
