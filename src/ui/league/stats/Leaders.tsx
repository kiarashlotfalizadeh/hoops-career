// Stats → Leaders: one board a figure (points, rebounds ... PER), the leader then the next four
// among the qualified, each board with a way to the full table sorted by its figure.
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../../core/types';
import { TeamLogo } from '../../components/TeamLogo';
import { Avatar } from '../../components/ui';
import { f1 } from '../../stats';
import { shortName, teamAbbrev } from '../shared';
import { qualifier, type StatRow } from './rows';

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

export function Leaders({ league, rows, season, playoffs }: { league: League; rows: StatRow[]; season: number; playoffs: boolean }) {
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
