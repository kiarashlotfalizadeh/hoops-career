// Stats → Players: every player's line in one sortable table, per game or season totals, searched
// and filtered (season, position, qualified, your team), the all-in-one numbers where the season
// has them.
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import type { League, Pos } from '../../../core/types';
import { POSITIONS } from '../../../core/types';
import { seasonLabel } from '../../../core/constants';
import { Chips, Segmented, StatTable, Toggle, type Col } from '../../components/ui';
import { f1, signed } from '../../stats';
import { FilterField, FiltersButton, shortName, teamAbbrev, useQueryParam } from '../shared';
import { pctCell, qualifier, type StatRow } from './rows';
import { SeasonSelect, TypeSelect, type StatSeason } from './season';
import { plural } from '../../../core/format';

const PAGE = 100;

export function PlayerStatsTable({ league, rows, s, playoffs }: { league: League; rows: StatRow[]; s: StatSeason; playoffs: boolean }) {
  const { season, real } = s;
  const nav = useNavigate();
  const [qual, setQual] = useQueryParam<'q' | 'all'>('q', 'q', ['q', 'all']);
  const [pos, setPos] = useQueryParam<'all' | Pos>('pos', 'all', ['all', ...POSITIONS]);
  const [mine, setMine] = useQueryParam<'0' | '1'>('mine', '0', ['0', '1']);
  const [mode, setMode] = useQueryParam<'pg' | 'tot'>('mode', 'pg', ['pg', 'tot']);
  const [q, setQ] = useState('');
  // typing stays responsive: the table catches up with the search a beat later
  const query = useDeferredValue(q);
  const [limit, setLimit] = useState(PAGE);
  // the column a leaderboard's "All" opened the table on
  const [sortKey] = useQueryParam<string>('sort', 'pts');
  const quali = useMemo(() => qualifier(league, season, rows, playoffs), [league, season, rows, playoffs]);
  // PER and win shares wherever a season has them (imported, or a regular season played here); BPM and EPM only come imported
  const hasAdv = rows.some((r) => r.adv);
  const hasBpm = real && rows.some((r) => r.s.adv);
  const tot = mode === 'tot';
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (qual === 'all' || quali.ok(r)) &&
        (pos === 'all' || r.p.pos === pos) &&
        (mine === '0' || r.tid === league.userTid) &&
        (!needle || `${r.p.firstName} ${r.p.lastName}`.toLowerCase().includes(needle)),
    );
  }, [rows, qual, quali, pos, mine, league.userTid, query]);

  const cols = useMemo(() => {
    // per-game averages to one decimal, or whole-season totals
    const count = (pg: (r: StatRow) => number, total: (r: StatRow) => number) => (r: StatRow) => (tot ? total(r) : pg(r));
    const fmtCount = (v: number | string) => (tot ? Math.round(v as number).toLocaleString() : f1(v as number));
    const c: Col<StatRow>[] = [
      {
        key: 'name',
        label: 'Player',
        left: true,
        sticky: true,
        get: (r) => r.p.lastName,
        fmt: (_v, r) => (
          <span className="lg-pcell">
            <span className="n">{shortName(r.p)}</span>
            <span className="tiny dim">{r.p.pos}</span>
          </span>
        ),
      },
      { key: 'tm', label: 'Team', left: true, get: (r) => teamAbbrev(league, r.tid), fmt: (v) => <span className="dim2">{v}</span> },
      { key: 'gp', label: 'GP', get: (r) => r.s.gp },
      {
        key: 'min',
        label: 'MIN',
        get: count(
          (r) => r.pg.min,
          (r) => r.s.min,
        ),
        fmt: fmtCount,
      },
      {
        key: 'pts',
        label: 'PTS',
        get: count(
          (r) => r.pg.pts,
          (r) => r.s.pts,
        ),
        fmt: (v) => <b>{fmtCount(v)}</b>,
      },
      {
        key: 'reb',
        label: 'REB',
        get: count(
          (r) => r.pg.reb,
          (r) => r.s.orb + r.s.drb,
        ),
        fmt: fmtCount,
      },
      {
        key: 'ast',
        label: 'AST',
        get: count(
          (r) => r.pg.ast,
          (r) => r.s.ast,
        ),
        fmt: fmtCount,
      },
      {
        key: 'stl',
        label: 'STL',
        get: count(
          (r) => r.pg.stl,
          (r) => r.s.stl,
        ),
        fmt: fmtCount,
      },
      {
        key: 'blk',
        label: 'BLK',
        get: count(
          (r) => r.pg.blk,
          (r) => r.s.blk,
        ),
        fmt: fmtCount,
      },
      {
        key: 'tov',
        label: 'TOV',
        get: count(
          (r) => r.pg.tov,
          (r) => r.s.tov,
        ),
        fmt: fmtCount,
      },
      { key: 'fg', label: 'FG%', get: (r) => (r.s.fga ? r.pg.fgPct : -1), fmt: pctCell },
      {
        key: 'tpm',
        label: '3PM',
        get: count(
          (r) => r.pg.tpm,
          (r) => r.s.tpm,
        ),
        fmt: fmtCount,
        help: 'Threes made',
      },
      { key: 'tp', label: '3P%', get: (r) => (r.s.tpa ? r.pg.tpPct : -1), fmt: pctCell },
      { key: 'ft', label: 'FT%', get: (r) => (r.s.fta ? r.pg.ftPct : -1), fmt: pctCell },
      {
        key: 'ts',
        label: 'TS%',
        get: (r) => (r.s.fga || r.s.fta ? r.pg.tsPct : -1),
        fmt: pctCell,
        help: 'True shooting: points per shot attempt, counting threes and free throws.',
      },
      { key: 'usg', label: 'USG%', get: (r) => r.pg.usg, fmt: pctCell, help: 'Usage: share of team possessions he finishes while on the floor.' },
      {
        key: 'pm',
        label: '+/-',
        get: (r) => (r.s.real && !r.s.pm ? -Infinity : tot ? r.s.pm : r.pg.pm),
        fmt: (v) => (v === -Infinity ? '—' : <span className={(v as number) > 0 ? 'good' : (v as number) < 0 ? 'bad' : ''}>{signed(v as number, tot ? 0 : 1)}</span>),
      },
    ];
    if (hasAdv)
      c.push({
        key: 'per',
        label: 'PER',
        get: (r) => r.adv?.per ?? -99,
        fmt: (v) => ((v as number) === -99 ? '—' : f1(v as number)),
        help: "Player efficiency rating (Hollinger's): his per-minute production, adjusted for pace; the league's average is 15.",
      });
    if (hasBpm)
      c.push(
        { key: 'bpm', label: 'BPM', get: (r) => r.s.adv?.bpm ?? -99, fmt: (v) => ((v as number) === -99 ? '—' : signed(v as number)) },
        {
          key: 'epm',
          label: 'EPM',
          get: (r) => r.s.adv?.epm ?? -99,
          fmt: (v) => ((v as number) === -99 ? '—' : signed(v as number)),
          help: 'Estimated plus-minus (Dunks & Threes): points per 100 possessions he adds over an average player, offense and defense.',
        },
      );
    if (hasAdv)
      c.push(
        {
          key: 'ws',
          label: 'WS',
          get: (r) => r.adv?.ws ?? -99,
          fmt: (v) => ((v as number) === -99 ? '—' : f1(v as number)),
          help: "Win shares: the team's wins his offense and defense account for, from the box score (Basketball Reference's method).",
        },
        {
          key: 'ws48',
          label: 'WS/48',
          get: (r) => r.adv?.ws48 ?? -99,
          fmt: (v) => ((v as number) === -99 ? '—' : (v as number).toFixed(3)),
          help: 'Win shares per 48 minutes: about .100 is an average player.',
        },
      );
    return c;
  }, [league, hasAdv, hasBpm, tot]);
  // the same element between renders lets React skip the table while the search box updates
  const table = useMemo(
    () => (
      <StatTable
        rows={filtered}
        cols={cols}
        initialSort={cols.some((c) => c.key === sortKey) ? sortKey : 'pts'}
        rowKey={(r) => r.p.pid}
        onRow={(r) => nav(`/player/${r.p.pid}`)}
        highlight={(r) => r.tid === league.userTid}
        maxHeight={560}
        limit={limit}
      />
    ),
    [filtered, cols, sortKey, nav, league.userTid, limit],
  );

  const changed = [season !== s.fallback, playoffs, tot, pos !== 'all', qual === 'all', mine === '1'].filter(Boolean).length;
  return (
    <>
      <div className="lg-sub lg-nowrap">
        <div className="lg-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" />
        </div>
        <FiltersButton count={changed}>
          <FilterField label="Season">
            <div className="lg-sub">
              <SeasonSelect s={s} />
              <TypeSelect s={s} />
            </div>
          </FilterField>
          <FilterField label="Numbers">
            <Segmented
              label="Per game or season totals"
              value={mode}
              onChange={setMode}
              options={[
                { id: 'pg', label: 'Per game' },
                { id: 'tot', label: 'Totals' },
              ]}
            />
          </FilterField>
          <FilterField label="Position">
            <Chips label="Position" value={pos} onChange={setPos} options={(['all', ...POSITIONS] as const).map((x) => ({ id: x, label: x === 'all' ? 'All' : x }))} />
          </FilterField>
          <Toggle on={qual === 'q'} onChange={(v) => setQual(v ? 'q' : 'all')} label={`Qualified only (${quali.label})`} />
          <Toggle on={mine === '1'} onChange={(v) => setMine(v ? '1' : '0')} label={`${league.teams[league.userTid].name} only`} />
        </FiltersButton>
      </div>
      {filtered.length === 0 ? (
        <div className="card empty">{rows.length ? 'No players match these filters.' : playoffs ? 'No playoff games played yet.' : 'No games played yet.'}</div>
      ) : (
        <>
          {table}
          {filtered.length > limit && (
            <button className="btn sm ghost lg-showmore" onClick={() => setLimit(limit + PAGE)}>
              <ChevronDown size={15} /> Show {Math.min(PAGE, filtered.length - limit)} more
            </button>
          )}
          <div className="lg-note">
            {filtered.length > limit ? `Top ${limit} of ${filtered.length} players` : plural(filtered.length, 'player')} · {seasonLabel(season)}
            {playoffs ? ' playoffs' : real ? ' (real)' : ''} · {tot ? 'totals' : 'per game'}
          </div>
        </>
      )}
    </>
  );
}
