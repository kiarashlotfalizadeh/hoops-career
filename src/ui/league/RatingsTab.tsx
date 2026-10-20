// Stats → Ratings: every player's ratings across the league in one sortable table, the roster's Ratings view for all
// thirty teams and the free agents: filter by team, position or a name, sorted best OVR first.
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import { FREE_AGENT, POSITIONS, type League, type Player, type Pos } from '../../core/types';
import { playerAge } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { Chips, StatTable, type Col } from '../components/ui';
import { RatingKey, ratingCols } from '../ratingCols';
import { OvrKey } from '../components/OvrKey';
import { FilterField, FiltersButton, shortName, teamAbbrev, useQueryParam } from './shared';
import { plural } from '../../core/format';

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
  const teams = [...league.teams].filter((t) => t.tid !== league.userTid).sort((a, b) => a.region.localeCompare(b.region));

  return (
    <>
      <div className="lg-sub lg-nowrap">
        <div className="lg-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" />
        </div>
        <FiltersButton count={(team !== 'all' ? 1 : 0) + (pos !== 'all' ? 1 : 0)}>
          <FilterField label="Players">
            <select className="lg-select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
              <option value="all">Every team</option>
              <option value={String(league.userTid)}>{league.teams[league.userTid].name} (yours)</option>
              <option value="fa">Free agents</option>
              {teams.map((t) => (
                <option key={t.tid} value={String(t.tid)}>
                  {t.region} {t.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Position">
            <Chips label="Position" value={pos} onChange={setPos} options={(['all', ...POSITIONS] as const).map((x) => ({ id: x, label: x === 'all' ? 'All' : x }))} />
          </FilterField>
        </FiltersButton>
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
          <div className="lg-note">{filtered.length > limit ? `Top ${limit} of ${filtered.length} players` : plural(filtered.length, 'player')} · current ratings</div>
          <div className="lg-note row between wrap top">
            <RatingKey />
            <OvrKey />
          </div>
        </>
      )}
    </>
  );
}
