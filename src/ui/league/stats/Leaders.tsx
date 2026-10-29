// Stats → Leaders: one board a figure (points, rebounds ... PER), the leader then the next four
// among the qualified, each board with a way to the full table sorted by its figure.
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../../core/types';
import { TeamLogo } from '../../components/TeamLogo';
import { Avatar, Help } from '../../components/ui';
import { f1 } from '../../stats';
import { PosterSlab, shortName, teamAbbrev } from '../shared';
import { qualifier, type StatRow } from './rows';
import { Foot } from '../Views';
import { Term } from '../../components/Glossary';

interface Cat {
  key: string;
  label: string;
  unit: string;
  get: (r: StatRow) => number;
  fmt: (v: number) => string;
  /** Who it ranks beyond the qualifiers (the foot says so). */
  min?: (r: StatRow) => boolean;
  /** Its glossary entry: the head opens it. */
  term?: string;
}

/** Leaders in the all-in-one numbers: regular seasons only (a season played here has none in the playoffs). */
const ADV_CATS: Cat[] = [
  { key: 'ws', label: 'Win shares', unit: 'WS', get: (r) => r.adv?.ws ?? -Infinity, fmt: f1, term: 'ws' },
  { key: 'per', label: 'Player efficiency', unit: 'PER', get: (r) => r.adv?.per ?? -Infinity, fmt: f1, term: 'per' },
];

const CATS: Cat[] = [
  { key: 'pts', label: 'Points', unit: 'PTS', get: (r) => r.pg.pts, fmt: f1 },
  { key: 'reb', label: 'Rebounds', unit: 'REB', get: (r) => r.pg.reb, fmt: f1 },
  { key: 'ast', label: 'Assists', unit: 'AST', get: (r) => r.pg.ast, fmt: f1 },
  { key: 'stl', label: 'Steals', unit: 'STL', get: (r) => r.pg.stl, fmt: f1 },
  { key: 'blk', label: 'Blocks', unit: 'BLK', get: (r) => r.pg.blk, fmt: f1 },
  { key: 'tpm', label: 'Threes made', unit: '3PM', get: (r) => r.pg.tpm, fmt: f1 },
  {
    key: 'ts',
    label: 'True shooting',
    unit: 'TS%',
    get: (r) => r.pg.tsPct,
    fmt: (v) => (v * 100).toFixed(1),
    min: (r) => r.pg.fga + 0.44 * r.pg.fta >= 9,
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
  const boards = [...CATS, ...(rows.some((r) => r.adv) ? ADV_CATS : [])].map((c) => ({
    c,
    top: qualified
      .filter((r) => (!c.min || c.min(r)) && Number.isFinite(c.get(r)))
      .sort((a, b) => c.get(b) - c.get(a))
      .slice(0, 5),
  }));
  // the scoring race is the poster, in its leader's colours; the other boards share one panel under it
  const [lead, ...others] = boards;
  return (
    <>
      {lead.top[0] ? (
        <LeadSlab league={league} cat={lead.c} top={lead.top} all={allHref(lead.c.key)} playoffs={playoffs} />
      ) : (
        <div className="card flush lg-leaders">
          <LeaderBlock league={league} cat={lead.c} top={lead.top} all={allHref(lead.c.key)} />
        </div>
      )}
      <div className="card flush lg-leaders">
        {others.map(({ c, top }) => (
          <LeaderBlock key={c.key} league={league} cat={c} top={top} all={allHref(c.key)} />
        ))}
      </div>
      <Foot
        help={
          <Help title="Who qualifies">
            <p className="lg-p">
              A leader has played {playoffs ? '30% of' : 'half'} his team&apos;s games, {q.minGp} so far. He averages {q.minMin}+ minutes.
            </p>
            <p className="lg-p">True shooting also needs 9 shot attempts a game, free throws counted.</p>
          </Help>
        }
      >
        Per game · qualified: {q.label}
      </Foot>
    </>
  );
}

/** The scoring race as the poster: the leader in his team's colours with his figure, the next four under him. */
function LeadSlab({ league, cat, top, all, playoffs }: { league: League; cat: Cat; top: StatRow[]; all: string; playoffs: boolean }) {
  const [first, ...rest] = top;
  const tid = first.tid ?? -1;
  const colors = league.teams[tid >= 0 ? tid : league.userTid].colors;
  return (
    <PosterSlab
      colors={colors}
      // (the season is the picker's line over it)
      over={`${cat.label} per game${playoffs ? ' · playoffs' : ''}`}
      mark={tid >= 0 ? <TeamLogo tid={tid} size={44} decorative /> : undefined}
      region={`${teamAbbrev(league, first.tid)} · ${first.p.pos}`}
      name={
        <Link to={`/player/${first.p.pid}`} className="lg-title-link">
          {first.p.firstName} {first.p.lastName}
        </Link>
      }
      fig={cat.fmt(cat.get(first))}
      figLabel={`${cat.unit}, the league's best`}
    >
      {rest.length > 0 && (
        <div className="lg-title-list">
          {rest.map((r, i) => (
            <Link key={r.p.pid} to={`/player/${r.p.pid}`}>
              <span className="r">{i + 2}</span>
              <span className="ellipsis">
                {shortName(r.p)} <span className="lg-title-ab">{teamAbbrev(league, r.tid)}</span>
              </span>
              <span className="v">{cat.fmt(cat.get(r))}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="lg-title-foot">
        <Link to={all} className="card-link" aria-label={`All players by ${cat.label.toLowerCase()}`}>
          All players <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </PosterSlab>
  );
}

function LeaderBlock({ league, cat, top, all }: { league: League; cat: Cat; top: StatRow[]; all: string }) {
  const [first, ...rest] = top;
  return (
    <section className="lg-lead">
      <div className="lg-lead-h">
        <h3>{cat.term ? <Term id={cat.term}>{cat.label}</Term> : cat.label}</h3>
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
