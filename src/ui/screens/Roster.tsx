// Team → Roster: your players in four views. Players (tonight's five, the bench, the two-way deals,
// with health and mood marked where they matter), Ratings, Stats and Contracts, the app's one
// contracts table (Office links here with ?view=contracts). Roster decisions the league waits on
// (cuts on opening night) sit at the top, settled in place.
import { Fragment, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { capSeason, fmtM, openOption, shortSeason } from '../office/common';
import { useQueryParam } from '../league/shared';
import { useLeague, useLeagueMemo } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { agenda } from '../../core/league/agenda';
import { MoodMark } from '../team/MoodMark';
import { Avatar, Ovr, Segmented, StatTable, Tag, pct, type Col, activateOnKey } from '../components/ui';
import { AgendaRow } from '../components/Agenda';
import { Term } from '../components/Glossary';
import { ratingCols } from '../ratingCols';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { f1, latestLine, playerSeason, rosterNames, signed, startingFive, type PerGame } from '../stats';
import type { League, Player } from '../../core/types';
import { tenDayLabel } from '../office/TenDayPanel';
import './team.css';

type View = 'players' | 'ratings' | 'stats' | 'contracts';

export default function Roster() {
  const league = useLeague();
  const nav = useNavigate();
  const [view, setView] = useQueryParam<View>('view', 'players', ['players', 'ratings', 'stats', 'contracts']);
  const tid = league.userTid;
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  const nameOf = useMemo(() => rosterNames(roster, { initial: true }), [roster]);
  // the roster decisions the league waits on (opening night's limits): here, where they're made
  const decisions = useLeagueMemo(() => agenda(league).filter((i) => i.kind === 'cuts' || i.kind === 'twoWays'), [league]);
  const open = (p: Player) => nav(`/player/${p.pid}`);
  const nameCol: Col<Player> = { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{nameOf(p.pid)}</span> };

  // before anyone plays, each player's latest season instead of a table of zeros; a player without one reads "—" and sorts last
  const anyCur = roster.some((p) => (playerSeason(p, league.season)?.gp ?? 0) > 0);
  const lines = new Map(roster.map((p) => [p.pid, anyCur ? playerSeason(p, league.season) : (latestLine(league, p)?.pg ?? null)]));
  const stat = (p: Player, k: keyof PerGame) => lines.get(p.pid)?.[k] ?? -Infinity;
  // a percentage needs an attempt: none reads "—" too, not 0.0
  const shooting = (p: Player, k: 'tsPct' | 'tpPct', attempts: number | undefined) => (attempts ? stat(p, k) : -Infinity);
  const statCols: Col<Player>[] = [
    nameCol,
    { key: 'gp', label: 'GP', get: (p) => lines.get(p.pid)?.gp ?? 0 },
    { key: 'min', label: 'MIN', get: (p) => stat(p, 'min'), fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (p) => stat(p, 'pts'), fmt: (v) => f1(v as number) },
    { key: 'reb', label: 'REB', get: (p) => stat(p, 'reb'), fmt: (v) => f1(v as number) },
    { key: 'ast', label: 'AST', get: (p) => stat(p, 'ast'), fmt: (v) => f1(v as number) },
    { key: 'stl', label: 'STL', get: (p) => stat(p, 'stl'), fmt: (v) => f1(v as number) },
    { key: 'blk', label: 'BLK', get: (p) => stat(p, 'blk'), fmt: (v) => f1(v as number) },
    // the % lives in the header, as in the league stats
    { key: 'ts', label: 'TS%', get: (p) => shooting(p, 'tsPct', (lines.get(p.pid)?.fga ?? 0) + (lines.get(p.pid)?.fta ?? 0)), fmt: (v) => pct(v as number) },
    { key: 'tp', label: '3P%', get: (p) => shooting(p, 'tpPct', lines.get(p.pid)?.tpa), fmt: (v) => pct(v as number) },
    { key: 'usg', label: 'USG%', get: (p) => stat(p, 'usg'), fmt: (v) => pct(v as number) },
    // imported seasons carry no on-court tracking
    { key: 'on', label: 'ON NET', get: (p) => (anyCur ? stat(p, 'onOff') : -Infinity), fmt: (v) => signed(v as number) },
  ];

  // from the season the payroll counts (next season once this one is over), like the cap sheet
  const s0 = capSeason(league);
  const seasons = [0, 1, 2, 3].map((i) => s0 + i);
  const contractCols: Col<Player>[] = [
    nameCol,
    ...seasons.map((s) => ({
      key: `s${s}`,
      label: shortSeason(s),
      get: (p: Player) => salaryFor(p, s),
      fmt: (v: number | string, p: Player) => {
        if (!v) return <span className="dim">—</span>;
        const opt = contractExp(p.contract) === s ? openOption(league, p) : undefined;
        return (
          <span className={opt ? 'warn' : undefined}>
            {fmtM(v as number)}
            {opt && <span className="tiny"> {opt === 'team' ? 'TO' : 'PO'}</span>}
          </span>
        );
      },
    })),
    { key: 'exp', label: 'EXP', get: (p) => contractExp(p.contract) },
  ];

  return (
    <>
      {decisions.length > 0 && (
        <div className="card flush ag-list" role="list" aria-label="Roster decisions">
          {decisions.map((i) => (
            <div role="listitem" key={i.id}>
              <AgendaRow item={i} />
            </div>
          ))}
        </div>
      )}
      <Segmented
        value={view}
        onChange={setView}
        label="Roster view"
        options={[
          { id: 'players', label: 'Players' },
          { id: 'ratings', label: 'Ratings' },
          { id: 'stats', label: 'Stats' },
          { id: 'contracts', label: 'Contracts' },
        ]}
      />
      {view === 'players' && <PlayerList league={league} roster={roster} onOpen={open} />}
      {view === 'ratings' && <StatTable rows={roster} cols={[nameCol, ...ratingCols((p: Player) => p)]} rowKey={(p) => p.pid} onRow={open} />}
      {view === 'stats' && (
        <>
          <StatTable rows={roster} cols={statCols} rowKey={(p) => p.pid} onRow={open} initialSort="pts" />
          {!anyCur && <div className="tm-foot">{[...lines.values()].some(Boolean) ? 'No games yet: each player’s latest season.' : 'No games played yet.'}</div>}
        </>
      )}
      {view === 'contracts' && (
        <>
          <StatTable rows={roster} cols={contractCols} rowKey={(p) => p.pid} onRow={open} />
          <div className="tm-foot row between top">
            <span>
              <Term id="options">PO / TO</Term>: player / team option
            </span>
            <Link to="/office" className="card-link">
              Cap sheet <ChevronRight size={14} />
            </Link>
          </div>
        </>
      )}
    </>
  );
}

/** The roster as rows: tonight's five, the bench, then the two-way deals. */
function PlayerList({ league, roster, onOpen }: { league: League; roster: Player[]; onOpen: (p: Player) => void }) {
  const team = league.teams[league.userTid];
  // an injured starter sits: the next healthy player up starts, as on the Rotation tab
  const starters = startingFive(roster);
  const groups: [string, Player[]][] = [
    ['Starters', roster.filter((p) => starters.has(p.pid))],
    ['Bench', roster.filter((p) => !starters.has(p.pid) && !p.contract.twoWay)],
    ['Two-way', roster.filter((p) => !starters.has(p.pid) && p.contract.twoWay)],
  ];
  return (
    <div className="card flush">
      <div className="list">
        {groups.map(([label, list]) =>
          list.length ? (
            <Fragment key={label}>
              <div className="list-divider">{label}</div>
              {/* each group its own two-column grid on a tablet, so its rows pair up from its first */}
              <div className="list wide2 tm-group">
                {list.map((p) => {
                  const pg = playerSeason(p, league.season);
                  const mins = team.rotation.minutes[p.pid] ?? 0;
                  const ten = tenDayLabel(league, p);
                  return (
                    <div key={p.pid} className="listrow clickable tm-prow" role="button" tabIndex={0} onClick={() => onOpen(p)} onKeyDown={activateOnKey(() => onOpen(p))}>
                      <Avatar p={p} />
                      <div className="grow">
                        <div className="tm-pname">
                          <span className="ellipsis">
                            {p.firstName} {p.lastName}
                          </span>
                          <MoodMark p={p} />
                        </div>
                        <div className="tm-pline">
                          <span className="tm-pmeta">
                            {p.pos} · {playerAge(p, league.season)} ·
                          </span>
                          {p.injury ? (
                            <Tag tone="bad">
                              {p.injury.type} · {p.injury.gamesRemaining}g
                            </Tag>
                          ) : pg ? (
                            <span className="tm-figs">
                              <Fig v={pg.pts} k="pts" />
                              <Fig v={pg.reb} k="reb" />
                              <Fig v={pg.ast} k="ast" />
                            </span>
                          ) : (
                            <span className="tm-figs dim">{mins ? `${mins} min planned` : 'Out of rotation'}</span>
                          )}
                          {/* (the two-way group's heading says it for the rest) */}
                          {p.contract.twoWay && starters.has(p.pid) && <Tag>Two-way</Tag>}
                          {ten && <Tag tone="warn">{ten}</Tag>}
                        </div>
                      </div>
                      <div className="tm-ovr">
                        <Ovr v={p.ovr} />
                        <span className="pot">POT {p.pot}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Fragment>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** A per-game figure in a row's stat line: the number, then its unit in small capitals. */
const Fig = ({ v, k }: { v: number; k: string }) => (
  <span>
    <b className="num">{f1(v)}</b> {k}
  </span>
);
