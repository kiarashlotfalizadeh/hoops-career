// Every player's ratings across the league in one sortable table, the roster's Ratings view for all
// thirty teams and the free agents: filter by team, position or a name, sorted best OVR first.
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import { FREE_AGENT, POSITIONS, type League, type Player, type Pos } from '../../core/types';
import { playerAge } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { StatTable, type Col } from '../components/ui';
import { ratingCols } from '../ratingCols';
import { shortName, teamAbbrev, useQueryParam } from './shared';

const PAGE = 100;

export function RatingsTab({ league }: { league: League }) {
  const nav = useNavigate();
  // 'all' (every player on a team), 'fa' (the free agents) or a team id (one the league doesn't have reads 'all')
  const [team, setTeam] = useQueryParam<string>('rt', 'all', ['all', 'fa', ...league.teams.map((t) => String(t.tid))]);
  const [pos, setPos] = useQueryParam<'all' | Pos>('pos', 'all', ['all', ...POSITIONS]);
  const [q, setQ] = useState('');
  // typing stays responsive: the table catches up with the search a beat later
  const query = useDeferredValue(q);
  const [limit, setLimit] = useState(PAGE);
  const players = useLeagueMemo(() => Object.values(league.players).filter((p) => p.tid >= 0 || p.tid === FREE_AGENT), [league]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players.filter(
      (p) =>
        (team === 'all' ? p.tid >= 0 : team === 'fa' ? p.tid === FREE_AGENT : p.tid === Number(team)) &&
        (pos === 'all' || p.pos === pos) &&
        (!needle || `${p.firstName} ${p.lastName}`.toLowerCase().includes(needle)),
    );
  }, [players, team, pos, query]);
  const cols = useMemo<Col<Player>[]>(
    () => [
      {
        key: 'name',
        label: 'Player',
        left: true,
        sticky: true,
        get: (p) => p.lastName,
        fmt: (_v, p) => (
          <span className="lg-pcell">
            <span className="n">{shortName(p)}</span>
            <span className="tiny dim">{p.pos}</span>
          </span>
        ),
      },
      { key: 'tm', label: 'Team', left: true, get: (p) => (p.tid >= 0 ? teamAbbrev(league, p.tid) : 'FA'), fmt: (v) => <span className="dim2">{v}</span> },
      { key: 'age', label: 'Age', get: (p) => playerAge(p, league.season) },
      ...ratingCols((p: Player) => p),
    ],
    [league],
  );
  const teams = [...league.teams].sort((a, b) => a.abbrev.localeCompare(b.abbrev));

  return (
    <>
      <div className="lg-sub">
        <div className="lg-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" />
        </div>
        <select className="lg-select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
          <option value="all">All teams</option>
          <option value="fa">Free agents</option>
          {teams.map((t) => (
            <option key={t.tid} value={String(t.tid)}>
              {t.abbrev}
            </option>
          ))}
        </select>
      </div>
      <div className="lg-hscroll" role="group" aria-label="Filter players">
        <button
          className={`chip ${team === String(league.userTid) ? 'on' : ''}`}
          aria-pressed={team === String(league.userTid)}
          onClick={() => setTeam(team === String(league.userTid) ? 'all' : String(league.userTid))}
        >
          <TeamLogo tid={league.userTid} size={16} /> My team
        </button>
        <span className="lg-vsep" />
        {(['all', ...POSITIONS] as const).map((x) => (
          <button key={x} className={`chip ${pos === x ? 'on' : ''}`} aria-pressed={pos === x} onClick={() => setPos(x)}>
            {x === 'all' ? 'All' : x}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="card empty">No players match these filters.</div>
      ) : (
        <>
          <StatTable
            rows={filtered}
            cols={cols}
            initialSort="ovr"
            rowKey={(p) => p.pid}
            onRow={(p) => nav(`/player/${p.pid}`)}
            highlight={(p) => p.tid === league.userTid}
            limit={limit}
          />
          {filtered.length > limit && (
            <button className="btn sm ghost lg-showmore" onClick={() => setLimit(limit + PAGE)}>
              <ChevronDown size={15} /> Show {Math.min(PAGE, filtered.length - limit)} more
            </button>
          )}
          <div className="lg-note">
            {filtered.length > limit ? `Top ${limit} of ${filtered.length} players` : `${filtered.length} player${filtered.length === 1 ? '' : 's'}`} · as on the player page · tap
            a column to sort
          </div>
        </>
      )}
    </>
  );
}
