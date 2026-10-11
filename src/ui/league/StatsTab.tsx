import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import type { League, Player, PlayerStats, Pos, TeamSeason } from '../../core/types';
import { POSITIONS } from '../../core/types';
import { seasonTotals } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Card, Empty, Segmented, StatTable, type Col } from '../components/ui';
import { f1, perGame, signed, teamRatings, type PerGame } from '../stats';
import { shortName, statSeasons, statTid, teamAbbrev, useQueryParam } from './shared';

type View = 'leaders' | 'players' | 'teams';

export interface StatRow {
  p: Player;
  s: PlayerStats;
  pg: PerGame;
  tid: number | null;
}

/** Per-game rows for every player with stats in a season (regular season or playoffs). */
export function useSeasonRows(league: League, season: number, playoffs: boolean): StatRow[] {
  const v = useStore((s) => s.v);
  return useMemo(() => {
    const out: StatRow[] = [];
    for (const p of Object.values(league.players)) {
      const s = seasonTotals(p, season, playoffs);
      if (!s || s.gp === 0) continue;
      const pg = perGame(s);
      if (!pg) continue;
      out.push({ p, s, pg, tid: statTid(league, s) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, season, playoffs, v]);
}

/** Games played by the busiest team that season (82 for imported seasons). */
function teamGames(league: League, season: number, rows: StatRow[], playoffs: boolean) {
  if (playoffs) return rows.reduce((m, r) => Math.max(m, r.s.gp), 0);
  let mx = 0;
  for (const t of league.teams) {
    const ts = t.seasons.find((x) => x.season === season);
    if (ts) mx = Math.max(mx, ts.won + ts.lost);
  }
  return mx || rows.reduce((m, r) => Math.max(m, r.s.gp), 0);
}

const pctCell = (v: number | string) => (typeof v === 'number' && v >= 0 ? (v * 100).toFixed(1) : '-');

export function StatsTab({ league }: { league: League }) {
  const [view, setView] = useQueryParam<View>('sv', 'leaders', ['leaders', 'players', 'teams']);
  const v = useStore((s) => s.v);
  const seasons = useMemo(
    () => statSeasons(league),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, v],
  );
  // before the first game of a season, open on the last completed one
  const started = league.games.some((g) => g.season === league.season);
  const fallback = started ? league.season : ([...seasons].filter((s) => s.season < league.season).sort((a, b) => b.season - a.season)[0]?.season ?? league.season);
  const [seasonStr, setSeasonStr] = useQueryParam<string>('season', String(fallback));
  const season = seasons.some((s) => s.season === Number(seasonStr)) ? Number(seasonStr) : league.season;
  const [po, setPo] = useQueryParam<'reg' | 'po'>('po', 'reg', ['reg', 'po']);
  // team stats are kept for the regular season only
  const playoffs = po === 'po' && view !== 'teams';
  const rows = useSeasonRows(league, season, playoffs);
  const real = seasons.find((s) => s.season === season)?.real ?? false;

  return (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'leaders', label: 'Leaders' },
          { id: 'players', label: 'Players' },
          { id: 'teams', label: 'Teams' },
        ]}
      />
      <div className="lg-sub">
        <select className="lg-select" value={season} onChange={(e) => setSeasonStr(e.target.value)} aria-label="Season">
          {seasons.map((s) => (
            <option key={s.season} value={s.season}>
              {seasonLabel(s.season)}
              {s.real ? ' (real)' : ''}
            </option>
          ))}
        </select>
        <div className="chips">
          <button className={`chip ${!playoffs ? 'on' : ''}`} style={{ height: 34 }} aria-pressed={!playoffs} onClick={() => setPo('reg')}>
            Regular season
          </button>
          <button
            className={`chip ${playoffs ? 'on' : ''}`}
            style={{ height: 34 }}
            aria-pressed={playoffs}
            disabled={(real || view === 'teams') && !playoffs}
            onClick={() => setPo('po')}
          >
            Playoffs
          </button>
        </div>
      </div>
      {real && playoffs ? (
        <Card>
          <Empty>Playoff stats aren&apos;t included for imported real-life seasons. Switch to the regular season, or pick a season played in this league.</Empty>
        </Card>
      ) : (
        <>
          {view === 'leaders' && <Leaders league={league} rows={rows} season={season} playoffs={playoffs} />}
          {view === 'players' && <PlayerStatsTable league={league} rows={rows} season={season} playoffs={playoffs} real={real} />}
          {view === 'teams' && <TeamStatsTable league={league} season={season} />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- leaders

interface Cat {
  key: string;
  label: string;
  unit: string;
  get: (r: StatRow) => number;
  fmt: (v: number) => string;
  min?: (r: StatRow) => boolean;
  minNote?: string;
}

const CATS: Cat[] = [
  { key: 'pts', label: 'Points', unit: 'PPG', get: (r) => r.pg.pts, fmt: f1 },
  { key: 'reb', label: 'Rebounds', unit: 'RPG', get: (r) => r.pg.reb, fmt: f1 },
  { key: 'ast', label: 'Assists', unit: 'APG', get: (r) => r.pg.ast, fmt: f1 },
  { key: 'stl', label: 'Steals', unit: 'SPG', get: (r) => r.pg.stl, fmt: f1 },
  { key: 'blk', label: 'Blocks', unit: 'BPG', get: (r) => r.pg.blk, fmt: f1 },
  { key: 'tpm', label: '3-Pointers made', unit: '3PM', get: (r) => r.pg.tpm, fmt: f1 },
  {
    key: 'ts',
    label: 'True shooting',
    unit: 'TS%',
    get: (r) => r.pg.tsPct,
    fmt: (v) => (v * 100).toFixed(1),
    min: (r) => r.pg.fga + 0.44 * r.pg.fta >= 9,
    minNote: 'Min. 9 shot attempts per game',
  },
];

function Leaders({ league, rows, season, playoffs }: { league: League; rows: StatRow[]; season: number; playoffs: boolean }) {
  const games = teamGames(league, season, rows, playoffs);
  const minGp = Math.max(1, Math.ceil(games * (playoffs ? 0.3 : 0.5)));
  const qualified = rows.filter((r) => r.s.gp >= minGp && r.pg.min >= (playoffs ? 10 : 15));
  if (!rows.length) return <Empty>No games played {playoffs ? 'in the playoffs ' : ''}yet this season.</Empty>;
  return (
    <>
      <div className="lg-leaders">
        {CATS.map((c) => {
          const top = qualified
            .filter((r) => !c.min || c.min(r))
            .sort((a, b) => c.get(b) - c.get(a))
            .slice(0, 5);
          return <LeaderCard key={c.key} league={league} cat={c} top={top} />;
        })}
      </div>
      <div className="lg-note">
        Leaders need {minGp}+ games ({playoffs ? '30' : '50'}% of team games) and {playoffs ? 10 : 15}+ minutes per game.
      </div>
    </>
  );
}

function LeaderCard({ league, cat, top }: { league: League; cat: Cat; top: StatRow[] }) {
  const [first, ...rest] = top;
  return (
    <Card title={cat.label} right={cat.minNote ? <span className="tiny dim">{cat.minNote}</span> : undefined}>
      {!first ? (
        <div className="small dim">Nobody qualifies yet.</div>
      ) : (
        <>
          <Link to={`/player/${first.p.pid}`} className={`lg-lead-top ${first.tid === league.userTid ? 'me' : ''}`}>
            <Avatar p={first.p} />
            <div style={{ minWidth: 0 }}>
              <div className="bold ellipsis nm" style={{ fontSize: 15.5 }}>
                {first.p.firstName} {first.p.lastName}
              </div>
              <div className="row small dim" style={{ gap: 6, marginTop: 2 }}>
                {first.tid !== null && <TeamLogo tid={first.tid} size={16} />}
                <span>
                  {teamAbbrev(league, first.tid)} · {first.p.pos}
                </span>
              </div>
            </div>
            <div className="lg-lead-val">
              {cat.fmt(cat.get(first))}
              <small>{cat.unit}</small>
            </div>
          </Link>
          {rest.map((r, i) => (
            <Link key={r.p.pid} to={`/player/${r.p.pid}`} className={`lg-lead-row ${r.tid === league.userTid ? 'me' : ''}`}>
              <span className="r">{i + 2}</span>
              {r.tid !== null ? <TeamLogo tid={r.tid} size={20} /> : <span />}
              <span className="ellipsis nm">{shortName(r.p)}</span>
              <span className="v">{cat.fmt(cat.get(r))}</span>
            </Link>
          ))}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- player table

const PAGE = 100;

function PlayerStatsTable({ league, rows, season, playoffs, real }: { league: League; rows: StatRow[]; season: number; playoffs: boolean; real: boolean }) {
  const nav = useNavigate();
  const [qual, setQual] = useQueryParam<'q' | 'all'>('q', 'q', ['q', 'all']);
  const [pos, setPos] = useQueryParam<'all' | Pos>('pos', 'all', ['all', ...POSITIONS]);
  const [mine, setMine] = useQueryParam<'0' | '1'>('mine', '0', ['0', '1']);
  const [mode, setMode] = useQueryParam<'pg' | 'tot'>('mode', 'pg', ['pg', 'tot']);
  const [q, setQ] = useState('');
  // typing stays responsive: the table catches up with the search a beat later
  const query = useDeferredValue(q);
  const [limit, setLimit] = useState(PAGE);
  const games = teamGames(league, season, rows, playoffs);
  const minGp = Math.max(1, Math.ceil(games * 0.3));
  const hasAdv = real && rows.some((r) => r.s.adv);
  const tot = mode === 'tot';
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (qual === 'all' || r.s.gp >= minGp) &&
        (pos === 'all' || r.p.pos === pos) &&
        (mine === '0' || r.tid === league.userTid) &&
        (!needle || `${r.p.firstName} ${r.p.lastName}`.toLowerCase().includes(needle)),
    );
  }, [rows, qual, minGp, pos, mine, league.userTid, query]);

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
        fmt: (v) => (v === -Infinity ? '-' : <span className={(v as number) > 0 ? 'good' : (v as number) < 0 ? 'bad' : ''}>{signed(v as number, tot ? 0 : 1)}</span>),
      },
    ];
    if (hasAdv) {
      c.push(
        { key: 'per', label: 'PER', get: (r) => r.s.adv?.per ?? -99, fmt: (v) => ((v as number) === -99 ? '-' : f1(v as number)) },
        { key: 'bpm', label: 'BPM', get: (r) => r.s.adv?.bpm ?? -99, fmt: (v) => ((v as number) === -99 ? '-' : signed(v as number)) },
        { key: 'ws', label: 'WS', get: (r) => r.s.adv?.ws ?? -99, fmt: (v) => ((v as number) === -99 ? '-' : f1(v as number)) },
      );
    }
    return c;
  }, [league, hasAdv, tot]);
  // the same element between renders lets React skip the table while the search box updates
  const table = useMemo(
    () => (
      <StatTable
        rows={filtered}
        cols={cols}
        initialSort="pts"
        rowKey={(r) => r.p.pid}
        onRow={(r) => nav(`/player/${r.p.pid}`)}
        highlight={(r) => r.tid === league.userTid}
        maxHeight={560}
        limit={limit}
      />
    ),
    [filtered, cols, nav, league.userTid, limit],
  );

  return (
    <>
      <div className="lg-hscroll">
        <button className={`chip ${qual === 'q' ? 'on' : ''}`} aria-pressed={qual === 'q'} onClick={() => setQual(qual === 'q' ? 'all' : 'q')}>
          Qualified ({minGp}+ GP)
        </button>
        <button className={`chip ${mine === '1' ? 'on' : ''}`} aria-pressed={mine === '1'} onClick={() => setMine(mine === '1' ? '0' : '1')}>
          <TeamLogo tid={league.userTid} size={16} /> My team
        </button>
        <span className="lg-vsep" />
        {(['all', ...POSITIONS] as const).map((x) => (
          <button key={x} className={`chip ${pos === x ? 'on' : ''}`} aria-pressed={pos === x} onClick={() => setPos(x)}>
            {x === 'all' ? 'All' : x}
          </button>
        ))}
      </div>
      <div className="lg-sub">
        <div className="lg-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" />
        </div>
        <select className="lg-select" value={mode} onChange={(e) => setMode(e.target.value as 'pg' | 'tot')} aria-label="Per game or season totals">
          <option value="pg">Per game</option>
          <option value="tot">Totals</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <Card>
          <Empty>{rows.length ? 'No players match these filters.' : playoffs ? 'No playoff games played yet.' : 'No games played yet.'}</Empty>
        </Card>
      ) : (
        <>
          {table}
          {filtered.length > limit && (
            <button className="btn sm ghost" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + PAGE)}>
              <ChevronDown size={15} /> Show {Math.min(PAGE, filtered.length - limit)} more
            </button>
          )}
          <div className="lg-note">
            {filtered.length > limit ? `Top ${limit} of ${filtered.length} players` : `${filtered.length} player${filtered.length === 1 ? '' : 's'}`} ·{' '}
            {tot ? 'season totals' : 'per-game averages'} · tap a column to sort
            {real ? ' · imported real-life season' : ''}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- team table

interface TeamRow {
  tid: number;
  ts: TeamSeason;
  tr: ReturnType<typeof teamRatings>;
}

function TeamStatsTable({ league, season }: { league: League; season: number }) {
  const nav = useNavigate();
  const v = useStore((s) => s.v);
  const rows = useMemo(() => {
    const out: TeamRow[] = [];
    for (const t of league.teams) {
      const ts = t.seasons.find((x) => x.season === season);
      if (!ts || ts.won + ts.lost === 0) continue;
      out.push({ tid: t.tid, ts, tr: teamRatings(ts) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, season, v]);
  const cols = useMemo<Col<TeamRow>[]>(
    () => [
      {
        key: 'team',
        label: 'Team',
        left: true,
        sticky: true,
        get: (r) => league.teams[r.tid].abbrev,
        fmt: (_v, r) => (
          <span className="lg-tcell">
            <TeamLogo tid={r.tid} size={20} />
            {league.teams[r.tid].abbrev}
          </span>
        ),
      },
      { key: 'wl', label: 'W-L', get: (r) => r.ts.won / Math.max(1, r.ts.won + r.ts.lost), fmt: (_v, r) => `${r.ts.won}-${r.ts.lost}` },
      // the table opens sorted by Net, so it sits where a phone shows it
      { key: 'net', label: 'Net', get: (r) => r.tr.net, fmt: (x) => <b className={(x as number) >= 0 ? 'good' : 'bad'}>{signed(x as number)}</b> },
      { key: 'ortg', label: 'ORtg', get: (r) => r.tr.ortg, fmt: (x) => f1(x as number), help: 'Points scored per 100 possessions' },
      { key: 'drtg', label: 'DRtg', get: (r) => -r.tr.drtg, fmt: (_x, r) => f1(r.tr.drtg), help: 'Points allowed per 100 possessions (lower is better)' },
      { key: 'ppg', label: 'PPG', get: (r) => r.tr.ppg, fmt: (x) => f1(x as number) },
      { key: 'opp', label: 'OPP', get: (r) => r.tr.oppg, fmt: (x) => f1(x as number) },
      { key: 'pace', label: 'Pace', get: (r) => r.tr.pace, fmt: (x) => f1(x as number), help: 'Possessions per game' },
      { key: 'efg', label: 'eFG%', get: (r) => r.tr.efg, fmt: pctCell },
      { key: 'tov', label: 'TOV%', get: (r) => -r.tr.tov, fmt: (_x, r) => pctCell(r.tr.tov), help: 'Turnovers per possession (lower is better)' },
      { key: 'orb', label: 'ORB%', get: (r) => r.tr.orb, fmt: pctCell },
      { key: 'ftr', label: 'FT Rate', get: (r) => r.tr.ftr, fmt: (x) => ((x as number) * 100).toFixed(1), help: 'Free throw attempts per field goal attempt' },
      { key: 'tpr', label: '3PA Rate', get: (r) => r.tr.tpRate, fmt: (x) => ((x as number) * 100).toFixed(1), help: 'Share of field goal attempts from three' },
      { key: 'oefg', label: 'Opp eFG%', get: (r) => -r.tr.oppEfg, fmt: (_x, r) => pctCell(r.tr.oppEfg) },
    ],
    [league],
  );
  if (!rows.length) {
    return (
      <Card>
        <Empty>{season === league.season ? 'No games played yet this season.' : 'Team stats are only tracked for simulated seasons.'}</Empty>
      </Card>
    );
  }
  return (
    <>
      <StatTable rows={rows} cols={cols} initialSort="net" rowKey={(r) => r.tid} onRow={(r) => nav(`/team/${r.tid}`)} highlight={(r) => r.tid === league.userTid} />
      <div className="lg-note">Team stats cover the regular season. Rates are per 100 possessions. Sorting DRtg, TOV% and Opp eFG% puts the best (lowest) first.</div>
    </>
  );
}
