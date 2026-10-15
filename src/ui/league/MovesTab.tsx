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
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty } from '../components/ui';
import { NEWS_KIND } from './NewsTab';
import { useQueryParam } from './shared';

type Group = 'trade' | 'signing' | 'release' | 'other';
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
  draft: 'other',
  // restricted free agency: an offer sheet and its outcome are signings; a qualifying offer is a
  // rights call, like an option, until he takes it (see groupOf)
  qualify: 'other',
  offerSheet: 'signing',
  match: 'signing',
};
/** A move's filter group: a qualifying offer he took is a signing. */
const groupOf = (t: Txn): Group => (t.kind === 'qualify' && t.note === 'accepted' ? 'signing' : GROUP[t.kind]);
const FILTERS: Filter[] = ['all', 'trade', 'signing', 'release', 'other'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', trade: 'Trades', signing: 'Signings', release: 'Releases', other: 'Other' };
/** The news log's icon and colour for each kind of move. */
const kindMeta = (t: Txn) => {
  const g = groupOf(t);
  return NEWS_KIND[g === 'other' ? (t.kind === 'draft' ? 'draft' : 'general') : g];
};

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
          <Link key={i} to={`/team/${x.tid}`} className="lg-name-link">
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
  let lastKey = '';
  return (
    <>
      <div className="lg-hscroll" role="group" aria-label="Kind of move">
        {/* kinds with no moves stay out, as on the News tab */}
        {FILTERS.filter((f) => f === 'all' || f === filter || counts.get(f)).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]} <span className="dim num">{counts.get(f) ?? 0}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Card>
          <Empty>{all.length ? 'No moves of this kind in the log.' : 'No moves yet. Trades, signings, extensions and releases show up here as they happen.'}</Empty>
        </Card>
      ) : (
        <Card className="flush lg-flat">
          {shown.slice(0, limit).map((t) => {
            const summer = OFFSEASON.includes(t.phase);
            const key = `${t.season}:${summer}`;
            const header = key !== lastKey;
            lastKey = key;
            const M = kindMeta(t);
            return (
              <Fragment key={t.id}>
                {header && <div className="lg-date-h">{summer ? `${t.season} offseason` : `${seasonLabel(t.season)} season`}</div>}
                <div className="lg-news">
                  <span className="lg-ic" style={{ background: `color-mix(in srgb, ${M.color} 16%, var(--surface-3))`, color: M.color }}>
                    <M.icon size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="lg-news-text">
                      <TxnText league={league} parts={txnLine(t, { tid })} />
                    </div>
                    <div className="tiny dim" style={{ marginTop: 2 }}>
                      {fmtDate(t.season, t.day)}
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
          {shown.length > limit && (
            <button className="lg-more" style={{ borderBottom: 'none', borderTop: '1px solid var(--line)' }} onClick={() => setLimit(limit + PAGE)}>
              <ChevronDown size={15} /> Show more ({shown.length - limit})
            </button>
          )}
        </Card>
      )}
      <div className="lg-note">
        Trades and your own moves stay in the log for good, other teams' signings, releases, options and draft picks for two seasons. Their minimum deals aren't listed.
      </div>
    </>
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
      <div className="col" style={{ gap: 10 }}>
        {shown.map((t) => (
          <div key={t.id} className="row top" style={{ gap: 10 }}>
            <TeamLogo tid={moveTeam(t, pid)} size={22} />
            <div className="grow small" style={{ minWidth: 0, lineHeight: 1.4 }}>
              <TxnText league={league} parts={txnLine(t, { pid })} />
            </div>
            <span className="tiny dim num" style={{ whiteSpace: 'nowrap' }}>
              {monthYear(t)}
            </span>
          </div>
        ))}
      </div>
      {moves.length > shown.length && (
        <button className="btn xs" style={{ marginTop: 10 }} onClick={() => setAll(true)}>
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
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
      <div className="tiny dim upper bold" style={{ letterSpacing: '0.06em', marginBottom: 4 }}>
        Your last {deals.length === 1 ? 'deal' : `${deals.length} deals`} with them
      </div>
      <div className="col" style={{ gap: 6 }}>
        {deals.map((t) => (
          <div key={t.id} className="small" style={{ lineHeight: 1.4 }}>
            <span className="tiny dim num">{fmtDate(t.season, t.day, { month: 'short', day: 'numeric', year: 'numeric' })} · </span>
            <TxnText league={league} parts={txnLine(t, { tid: league.userTid })} />
          </div>
        ))}
      </div>
    </div>
  );
}
