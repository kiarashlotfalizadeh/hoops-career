import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { League, Player, PlayerStats, Pos, TeamSeason } from '../../core/types';
import { POSITIONS } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Chips, Segmented, StatTable, Toggle, type Col } from '../components/ui';
import { advancedView, f1, perGame, seasonLine, signed, teamRatings, type AdvView, type PerGame } from '../stats';
import { FilterField, FiltersButton, shortName, statSeasons, statTid, teamAbbrev, teamPath, useQueryParam } from './shared';
import { RatingsTab } from './RatingsTab';

type View = 'leaders' | 'players' | 'teams' | 'ratings';

export interface StatRow {
  p: Player;
  s: PlayerStats;
  pg: PerGame;
  tid: number | null;
  /** PER and win shares: an imported season's own, or worked out for a regular season played here (see advancedView). */
  adv: AdvView | null;
}

/** Per-game rows for every player with stats in a season (regular season or playoffs). */
export function useSeasonRows(league: League, season: number, playoffs: boolean): StatRow[] {
  return useLeagueMemo(() => {
    const out: StatRow[] = [];
    for (const p of Object.values(league.players)) {
      // a player traded during an imported season keeps his usage and advanced numbers
      const s = seasonLine(p, season, playoffs);
      if (!s || s.gp === 0) continue;
      const pg = perGame(s);
      if (!pg) continue;
      out.push({ p, s, pg, tid: statTid(league, s), adv: advancedView(league, p, s) });
    }
    return out;
  }, [league, season, playoffs]);
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

/**
 * Who qualifies for the leaders, and for the players table's "Qualified only": half his team's
 * games (30% in the playoffs) at 15 minutes a game (10). One rule, so a leaderboard and the table it
 * opens rank the same players.
 */
function qualifier(league: League, season: number, rows: StatRow[], playoffs: boolean) {
  const games = teamGames(league, season, rows, playoffs);
  const minGp = Math.max(1, Math.ceil(games * (playoffs ? 0.3 : 0.5)));
  const minMin = playoffs ? 10 : 15;
  return { minGp, minMin, ok: (r: StatRow) => r.s.gp >= minGp && r.pg.min >= minMin, label: `${minGp}+ games, ${minMin}+ min` };
}

const pctCell = (v: number | string) => (typeof v === 'number' && v >= 0 ? (v * 100).toFixed(1) : '—');

/** Stats: the leaders, every player's line, every team's, and every player's ratings, one switch apart. */
export function StatsTab({ league }: { league: League }) {
  const [view, setView] = useQueryParam<View>('sv', 'leaders', ['leaders', 'players', 'teams', 'ratings']);
  return (
    <>
      <Segmented
        label="Stats view"
        value={view}
        onChange={setView}
        options={[
          { id: 'leaders', label: 'Leaders' },
          { id: 'players', label: 'Players' },
          { id: 'teams', label: 'Teams' },
          { id: 'ratings', label: 'Ratings' },
        ]}
      />
      {view === 'ratings' ? <RatingsTab league={league} /> : <SeasonStats league={league} view={view} />}
    </>
  );
}

/** The season a stats view reads (the current one once it has games, else the last) and whether it's the playoffs'. */
function useStatSeason(league: League) {
  const seasons = useLeagueMemo(() => statSeasons(league), [league]);
  // before the first game of a season, open on the last completed one
  const started = league.games.some((g) => g.season === league.season);
  const fallback = started ? league.season : ([...seasons].filter((s) => s.season < league.season).sort((a, b) => b.season - a.season)[0]?.season ?? league.season);
  const [seasonStr, setSeasonStr] = useQueryParam<string>('season', String(fallback));
  // a season the league doesn't have (an old or garbled link) opens the default one
  const season = seasons.some((s) => s.season === Number(seasonStr)) ? Number(seasonStr) : fallback;
  const [po, setPo] = useQueryParam<'reg' | 'po'>('po', 'reg', ['reg', 'po']);
  const real = seasons.find((s) => s.season === season)?.real ?? false;
  return { seasons, season, setSeason: (s: number) => setSeasonStr(String(s)), fallback, po, setPo, real };
}

type StatSeason = ReturnType<typeof useStatSeason>;

function SeasonSelect({ s }: { s: StatSeason }) {
  return (
    <select className="lg-select" value={s.season} onChange={(e) => s.setSeason(Number(e.target.value))} aria-label="Season">
      {s.seasons.map((x) => (
        <option key={x.season} value={x.season}>
          {seasonLabel(x.season)}
          {x.real ? ' (real)' : ''}
        </option>
      ))}
    </select>
  );
}

/** Regular season or playoffs; an imported real-life season has no playoff stats. */
function TypeSelect({ s }: { s: StatSeason }) {
  return (
    <select className="lg-select" value={s.real ? 'reg' : s.po} onChange={(e) => s.setPo(e.target.value as 'reg' | 'po')} aria-label="Season type" disabled={s.real}>
      <option value="reg">Regular season</option>
      <option value="po">Playoffs</option>
    </select>
  );
}

function SeasonStats({ league, view }: { league: League; view: Exclude<View, 'ratings'> }) {
  const s = useStatSeason(league);
  // team stats are kept for the regular season only; imported seasons have no playoff lines
  const playoffs = s.po === 'po' && view !== 'teams' && !s.real;
  const rows = useSeasonRows(league, s.season, playoffs);
  return (
    <>
      {view !== 'players' && (
        <div className="lg-sub">
          <SeasonSelect s={s} />
          {view === 'leaders' && <TypeSelect s={s} />}
        </div>
      )}
      {view === 'leaders' && <Leaders league={league} rows={rows} season={s.season} playoffs={playoffs} />}
      {view === 'players' && <PlayerStatsTable league={league} rows={rows} s={s} playoffs={playoffs} />}
      {view === 'teams' && <TeamStatsTable league={league} season={s.season} />}
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

/** Leaders in the all-in-one numbers: regular seasons only (a season played here has none in the playoffs). */
const ADV_CATS: Cat[] = [
  { key: 'ws', label: 'Win shares', unit: 'WS', get: (r) => r.adv?.ws ?? -Infinity, fmt: f1 },
  { key: 'per', label: 'Player efficiency', unit: 'PER', get: (r) => r.adv?.per ?? -Infinity, fmt: f1 },
];

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
  const q = qualifier(league, season, rows, playoffs);
  const qualified = rows.filter(q.ok);
  const { search } = useLocation();
  if (!rows.length) return <div className="card empty">No games played {playoffs ? 'in the playoffs ' : ''}yet this season.</div>;
  // a board's "All" opens the players table on the same season, sorted by its figure
  const allHref = (key: string) => {
    const sp = new URLSearchParams(search);
    sp.set('sv', 'players');
    sp.set('sort', key);
    return `/league/stats?${sp}`;
  };
  return (
    <>
      {/* every category in one panel: the leader, then the next four */}
      <div className="card flush lg-leaders">
        {[...CATS, ...(rows.some((r) => r.adv) ? ADV_CATS : [])].map((c) => {
          const top = qualified
            .filter((r) => (!c.min || c.min(r)) && Number.isFinite(c.get(r)))
            .sort((a, b) => c.get(b) - c.get(a))
            .slice(0, 5);
          return <LeaderBlock key={c.key} league={league} cat={c} top={top} all={allHref(c.key)} />;
        })}
      </div>
      <div className="lg-note">
        Qualified: {q.minGp}+ games ({playoffs ? '30' : '50'}% of team games), {q.minMin}+ minutes a game.
      </div>
    </>
  );
}

function LeaderBlock({ league, cat, top, all }: { league: League; cat: Cat; top: StatRow[]; all: string }) {
  const [first, ...rest] = top;
  return (
    <section className="lg-lead">
      <div className="lg-lead-h">
        <h3>{cat.label}</h3>
        {cat.minNote && <span>{cat.minNote}</span>}
        <Link to={all} className="card-link lg-lead-all" aria-label={`All players by ${cat.label.toLowerCase()}`}>
          All <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {!first ? (
        <div className="lg-lead-none">Nobody qualifies yet.</div>
      ) : (
        <>
          <Link to={`/player/${first.p.pid}`} className={`lg-lead-top ${first.tid === league.userTid ? 'me' : ''}`}>
            <Avatar p={first.p} />
            <span className="lg-lead-who">
              <span className="nm ellipsis">
                {first.p.firstName} {first.p.lastName}
              </span>
              <span className="lg-lead-meta">
                {first.tid !== null && <TeamLogo tid={first.tid} size={16} decorative />}
                {teamAbbrev(league, first.tid)} · {first.p.pos}
              </span>
            </span>
            <span className="lg-lead-val">
              {cat.fmt(cat.get(first))}
              <small>{cat.unit}</small>
            </span>
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
    </section>
  );
}

// ---------------------------------------------------------------- player table

const PAGE = 100;

function PlayerStatsTable({ league, rows, s, playoffs }: { league: League; rows: StatRow[]; s: StatSeason; playoffs: boolean }) {
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
            {filtered.length > limit ? `Top ${limit} of ${filtered.length} players` : `${filtered.length} player${filtered.length === 1 ? '' : 's'}`} · {seasonLabel(season)}
            {playoffs ? ' playoffs' : real ? ' (real)' : ''} · {tot ? 'totals' : 'per game'}
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
  const rows = useLeagueMemo(() => {
    const out: TeamRow[] = [];
    for (const t of league.teams) {
      const ts = t.seasons.find((x) => x.season === season);
      if (!ts || ts.won + ts.lost === 0) continue;
      out.push({ tid: t.tid, ts, tr: teamRatings(ts) });
    }
    return out;
  }, [league, season]);
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
            <TeamLogo tid={r.tid} size={20} decorative />
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
  if (!rows.length) return <div className="card empty">{season === league.season ? 'No games played yet this season.' : 'Team stats are only tracked for simulated seasons.'}</div>;
  return (
    <>
      <StatTable rows={rows} cols={cols} initialSort="net" rowKey={(r) => r.tid} onRow={(r) => nav(teamPath(r.tid))} highlight={(r) => r.tid === league.userTid} />
      <div className="lg-note">Regular season · ratings per 100 possessions · DRtg, TOV% and Opp eFG% sort lowest (best) first.</div>
    </>
  );
}
