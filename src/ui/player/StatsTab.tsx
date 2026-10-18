// A player's page, Stats: his seasons per game (regular season or playoffs), a season split between
// teams as one line, the all-in-one numbers where a season has them, then his career highs.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, Player, PlayerStats } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { BBREF_TO_TID } from '../../core/teams';
import { REC_LABEL, REC_STATS, careerHighOf } from '../../core/league/records';
import { careerOnRecord } from '../../core/analysis/milestones';
import { fmtDate } from '../../core/league/helpers';
import { Empty, More, Section, Segmented, StatTable, pct, type Col } from '../components/ui';
import { advancedView, f1, perGame, seasonLine, signed } from '../stats';

function seasonsOf(p: Player) {
  const bySeason = new Map<string, PlayerStats[]>();
  for (const s of p.stats) {
    const k = `${s.season}|${s.playoffs ? 1 : 0}`;
    if (!bySeason.has(k)) bySeason.set(k, []);
    bySeason.get(k)!.push(s);
  }
  const rows: { key: string; season: number; playoffs: boolean; teams: number[]; tot: PlayerStats }[] = [];
  for (const [k, list] of bySeason) {
    rows.push({
      key: k,
      season: list[0].season,
      playoffs: list[0].playoffs,
      teams: list.map((s) => (typeof s.tid === 'number' ? s.tid : (BBREF_TO_TID[String(s.tid)] ?? -1))),
      // a season split between teams: its totals, and its imported advanced numbers combined
      tot: seasonLine(p, list[0].season, list[0].playoffs)!,
    });
  }
  return rows.sort((a, b) => b.season - a.season || Number(a.playoffs) - Number(b.playoffs));
}

const ADV_KEYS = new Set(['per', 'bpm', 'epm', 'ws', 'ws48']);

export function StatsTab({ p, league }: { p: Player; league: League }) {
  const [po, setPo] = useState(false);
  const rows = seasonsOf(p).filter((r) => r.playoffs === po);
  type R = (typeof rows)[number];
  const pg = (r: R) => perGame(r.tot)!;
  const adv = (r: R) => advancedView(league, p, r.tot);
  const cols: Col<R>[] = [
    {
      key: 'season',
      label: 'Season',
      left: true,
      sticky: true,
      get: (r) => r.season,
      fmt: (_, r) => (
        <span className="bold">
          {seasonLabel(r.season)}
          {r.tot.real ? <span className="tiny dim"> real</span> : ''}
        </span>
      ),
    },
    { key: 'tm', label: 'Team', left: true, get: (r) => r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/') },
    { key: 'gp', label: 'GP', get: (r) => r.tot.gp },
    { key: 'min', label: 'MIN', get: (r) => pg(r).min, fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (r) => pg(r).pts, fmt: (v) => f1(v as number) },
    { key: 'reb', label: 'REB', get: (r) => pg(r).reb, fmt: (v) => f1(v as number) },
    { key: 'ast', label: 'AST', get: (r) => pg(r).ast, fmt: (v) => f1(v as number) },
    { key: 'stl', label: 'STL', get: (r) => pg(r).stl, fmt: (v) => f1(v as number) },
    { key: 'blk', label: 'BLK', get: (r) => pg(r).blk, fmt: (v) => f1(v as number) },
    { key: 'tov', label: 'TOV', get: (r) => pg(r).tov, fmt: (v) => f1(v as number) },
    // the % lives in the header, as in the league stats
    // a season without an attempt reads "—" (and sorts last), not 0.0
    { key: 'fg', label: 'FG%', get: (r) => (r.tot.fga ? pg(r).fgPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'tp', label: '3P%', get: (r) => (r.tot.tpa ? pg(r).tpPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'tpa', label: '3PA', get: (r) => pg(r).tpa, fmt: (v) => f1(v as number) },
    { key: 'ft', label: 'FT%', get: (r) => (r.tot.fta ? pg(r).ftPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'ts', label: 'TS%', get: (r) => (r.tot.fga || r.tot.fta ? pg(r).tsPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'usg', label: 'USG%', get: (r) => pg(r).usg, fmt: (v) => pct(v as number) },
    { key: 'per', label: 'PER', get: (r) => adv(r)?.per ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'bpm', label: 'BPM', get: (r) => r.tot.adv?.bpm ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : signed(v as number)) },
    { key: 'epm', label: 'EPM', get: (r) => r.tot.adv?.epm ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : signed(v as number)) },
    { key: 'ws', label: 'WS', get: (r) => adv(r)?.ws ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'ws48', label: 'WS/48', get: (r) => adv(r)?.ws48 ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : (v as number).toFixed(3)) },
    // imported seasons carry no plus-minus: "—", not 0.0 (as in the league stats)
    { key: 'pm', label: '+/-', get: (r) => (r.tot.real && !r.tot.pm ? NaN : pg(r).pm), fmt: (v) => signed(v as number) },
  ];
  // the all-in-one numbers only where a season has them, as in the league stats: BPM and EPM come
  // with imported seasons alone, and a season played here has no PER or win shares in the playoffs
  const shown = cols.filter((c) => !ADV_KEYS.has(c.key) || rows.some((r) => Number.isFinite(c.get(r))));
  const real = p.stats.some((s) => s.real);
  return (
    <>
      <div className="tm-seg-l">
        <Segmented
          value={po ? 'po' : 'rs'}
          onChange={(v) => setPo(v === 'po')}
          label="Season type"
          options={[
            { id: 'rs', label: 'Regular season' },
            { id: 'po', label: 'Playoffs' },
          ]}
        />
      </div>
      {rows.length ? (
        <StatTable rows={rows} cols={shown} rowKey={(r) => r.key} />
      ) : (
        <div className="card">
          <Empty>{po ? 'No playoff games yet.' : 'No NBA games yet.'}</Empty>
        </div>
      )}
      <div className="tm-foot">
        {real ? (
          <More label="“real” seasons and advanced stats">
            <p className="tm-more-p">
              “real” seasons are imported from Basketball Reference, with EPM from Dunks & Threes; only they have BPM and EPM. PER and win shares for seasons played in this league
              are worked out from their box scores the way Basketball Reference does (not in the playoffs). +/- is only kept for simulated seasons.
            </p>
          </More>
        ) : (
          'PER and win shares come from each box score, as Basketball Reference works them (not in the playoffs).'
        )}
      </div>
      {!po && <CareerHighs p={p} league={league} />}
    </>
  );
}

/** His regular-season career highs: the whole career's when it's all in this league's book, otherwise since the book began. */
function CareerHighs({ p, league }: { p: Player; league: League }) {
  const highs = p.highs;
  if (!highs || !Object.keys(highs).length) return null;
  const since = league.records?.since ?? league.startSeason;
  const first = Math.min(...p.stats.filter((s) => !s.real).map((s) => s.season));
  const whole = !p.stats.some((s) => s.real) && careerOnRecord(p, league.season) && first >= since;
  const stored = new Set(league.games.map((g) => g.gid));
  return (
    <Section title={whole ? 'Career highs' : `Highs since ${seasonLabel(since)}`}>
      <div className="card flush list">
        {REC_STATS.filter((k) => highs[k]).map((k) => {
          const h = careerHighOf(p, k)!;
          const text = `vs ${league.teams[h.opp]?.abbrev ?? '?'} · ${fmtDate(h.season, h.day, { month: 'short', day: 'numeric', year: 'numeric' })}`;
          const body = (
            <>
              <span className="tm-hi-v num">{h.v}</span>
              <span className="tm-hi-k">{REC_LABEL[k][0]}</span>
              <span className="tm-hi-when ellipsis">{text}</span>
            </>
          );
          return stored.has(h.gid) ? (
            <Link key={k} to={`/game/${h.gid}`} className="tm-hi">
              {body}
              <ChevronRight size={15} className="dim" />
            </Link>
          ) : (
            <div key={k} className="tm-hi">
              {body}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
