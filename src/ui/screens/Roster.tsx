import { capSeason, fmtM, isOffseason, openOption, shortSeason } from '../office/common';
import { useQueryParam } from '../league/shared';
import { Fragment, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, ListOrdered, Workflow } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { CAP_FOR, payroll, rosterSorted } from '../../core/league/helpers';
import { Avatar, Ovr, PageHeader, Segmented, StatTable, Tag, pct, type Col, activateOnKey } from '../components/ui';
import { fmtHeight, ROLE_META, archetype } from '../../core/ratings';
import { ratingCols } from '../ratingCols';
import { moodLevel, MOOD_META } from '../../core/league/morale';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { f1, latestLine, playerSeason, rosterNames, signed, startingFive, type PerGame } from '../stats';
import type { League, Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { tenDayLabel } from '../office/TenDayPanel';
import './team.css';

type View = 'players' | 'ratings' | 'stats' | 'contracts';

export function MoodIcon({ p }: { p: Player }) {
  const m = MOOD_META[moodLevel(p.mood.score)];
  return (
    <span className="tm-mood" role="img" aria-label={`Mood: ${m.label}`} title={m.label} style={{ color: m.color }}>
      {m.emoji}
    </span>
  );
}

export default function Roster() {
  const league = useLeague();
  const nav = useNavigate();
  const [view, setView] = useQueryParam<View>('view', 'players', ['players', 'ratings', 'stats', 'contracts']);
  const tid = league.userTid;
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  const nameOf = useMemo(() => rosterNames(roster, { initial: true }), [roster]);
  // between seasons, count and pay next season's contracts (the same view as Office and Re-sign)
  const s0 = capSeason(league);
  const cap = CAP_FOR(league, s0);
  const pay = payroll(league, tid, s0);
  const standard = roster.filter((p) => !p.contract.twoWay && contractExp(p.contract) >= s0).length;
  const twoWays = roster.filter((p) => p.contract.twoWay).length;
  const expiring = isOffseason(league) ? roster.filter((p) => !p.contract.twoWay && contractExp(p.contract) < s0).length : 0;
  const over = pay > cap.salaryCap;

  const ratingTable: Col<Player>[] = [
    { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{nameOf(p.pid)}</span> },
    ...ratingCols((p: Player) => p),
  ];

  // before anyone plays, each player's latest season (as the team page does) instead of a table of zeros;
  // a player without one reads "—" and sorts last
  const anyCur = roster.some((p) => (playerSeason(p, league.season)?.gp ?? 0) > 0);
  const lines = new Map(roster.map((p) => [p.pid, anyCur ? playerSeason(p, league.season) : (latestLine(league, p)?.pg ?? null)]));
  const stat = (p: Player, k: keyof PerGame) => lines.get(p.pid)?.[k] ?? -Infinity;
  // a percentage needs an attempt: none reads "—" too, not 0.0
  const shooting = (p: Player, k: 'tsPct' | 'tpPct', attempts: number | undefined) => (attempts ? stat(p, k) : -Infinity);
  const statCols: Col<Player>[] = [
    { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{nameOf(p.pid)}</span> },
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

  // from the season the payroll above counts (next season once this one is over), like the cap sheet
  const seasons = [0, 1, 2, 3].map((i) => s0 + i);
  const contractCols: Col<Player>[] = [
    { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{nameOf(p.pid)}</span> },
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

  const spots = `${standard}/${CAP.rosterMax}${twoWays ? ` + ${twoWays} two-way` : ''}${expiring ? ` + ${expiring} expiring` : ''}`;
  const money = `${fmtM(pay)}${isOffseason(league) ? ` in ${shortSeason(s0)}` : ''} · ${over ? `${fmtM(pay - cap.salaryCap)} over cap` : `${fmtM(cap.salaryCap - pay)} space`}`;

  return (
    <main className="page">
      <PageHeader title="Roster" sub={`${spots} · ${money}`} />
      <nav className="tm-links" aria-label="Team tools">
        <Link to="/rotation" className="btn sm ghost">
          <ListOrdered size={15} /> Rotation
        </Link>
        <Link to="/tactics" className="btn sm ghost">
          <Workflow size={15} /> Tactics
        </Link>
        <Link to="/lab" className="btn sm ghost">
          <Activity size={15} /> Lab
        </Link>
      </nav>
      <div className="tm-tabs">
        <Segmented
          tabs
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
      </div>
      {view === 'players' && <PlayerList league={league} roster={roster} onOpen={(pid) => nav(`/player/${pid}`)} />}
      {view === 'ratings' && <StatTable rows={roster} cols={ratingTable} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} />}
      {view === 'stats' && (
        <>
          <StatTable rows={roster} cols={statCols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} initialSort="pts" />
          {!anyCur && <div className="tm-foot">{[...lines.values()].some(Boolean) ? 'No games yet: each player’s latest season, per game.' : 'No games played yet.'}</div>}
        </>
      )}
      {view === 'contracts' && (
        <>
          <StatTable rows={roster} cols={contractCols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} />
          <div className="tm-foot row between top">
            <span>
              Cap {fmtM(cap.salaryCap)} · Tax {fmtM(cap.luxuryTax)} · PO / TO: player / team option
            </span>
            <Link to="/office" className="card-link">
              Cap sheet <ChevronRight size={14} />
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

/** The roster as rows: tonight's five, the bench, then the two-way deals. */
function PlayerList({ league, roster, onOpen }: { league: League; roster: Player[]; onOpen: (pid: number) => void }) {
  const team = league.teams[league.userTid];
  // an injured starter sits: the next healthy player up starts, as on the Rotation screen
  const starters = startingFive(roster);
  const groups: [string, Player[]][] = [
    ['Starters', roster.filter((p) => starters.has(p.pid))],
    ['Bench', roster.filter((p) => !starters.has(p.pid) && !p.contract.twoWay)],
    ['Two-way', roster.filter((p) => !starters.has(p.pid) && p.contract.twoWay)],
  ];
  const age = (p: Player) => playerAge(p, league.season);
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
                  const role = team.tactics.offense.roles[p.pid] ?? archetype(p.ratings).role;
                  const mins = team.rotation.minutes[p.pid] ?? 0;
                  const ten = tenDayLabel(league, p);
                  return (
                    <div key={p.pid} className="listrow clickable tm-prow" role="button" tabIndex={0} onClick={() => onOpen(p.pid)} onKeyDown={activateOnKey(() => onOpen(p.pid))}>
                      <Avatar p={p} />
                      <div className="grow">
                        <div className="tm-pname">
                          <span className="ellipsis">
                            {p.firstName} {p.lastName}
                          </span>
                          <MoodIcon p={p} />
                        </div>
                        <div className="lr-meta ellipsis">
                          {p.pos} · {age(p)} · {fmtHeight(p.heightIn)} · {ROLE_META[role].label}
                        </div>
                        <div className="tm-pline">
                          {p.injury && (
                            <Tag tone="bad">
                              {p.injury.type} · {p.injury.gamesRemaining}g
                            </Tag>
                          )}
                          {/* (the two-way group's heading says it for the rest) */}
                          {p.contract.twoWay && starters.has(p.pid) && <Tag>Two-way</Tag>}
                          {ten && <Tag tone="warn">{ten}</Tag>}
                          {p.mood.tradeRequest && <Tag tone="bad">Wants a trade</Tag>}
                          {pg ? (
                            <span className="tm-figs">
                              <Fig v={pg.pts} k="pts" />
                              <Fig v={pg.reb} k="reb" />
                              <Fig v={pg.ast} k="ast" />
                              <Fig v={pg.min} k="min" />
                            </span>
                          ) : (
                            <span className="tm-figs dim">{mins ? `${mins} min planned` : 'Out of rotation'}</span>
                          )}
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
