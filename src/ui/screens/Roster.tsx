import { useQueryParam } from '../league/shared';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ListOrdered, Workflow } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { CAP_FOR, payroll, rosterSorted } from '../../core/league/helpers';
import { Avatar, Card, Ovr, PageHeader, Segmented, StatTable, Tag, type Col, activateOnKey } from '../components/ui';
import { attrDisplay, fmtHeight, ROLE_META, archetype } from '../../core/ratings';
import { moodLevel, MOOD_META } from '../../core/league/morale';
import { contractExp, salaryFor } from '../../core/playerGen';
import { f1, moneyM, p1, playerSeason, signed } from '../stats';
import type { Player } from '../../core/types';
import { CAP } from '../../core/constants';

type View = 'players' | 'ratings' | 'stats' | 'contracts';

export function MoodIcon({ p }: { p: Player }) {
  const m = MOOD_META[moodLevel(p.mood.score)];
  return (
    <span title={m.label} style={{ color: m.color, fontSize: 12 }}>
      {m.emoji}
    </span>
  );
}

export default function Roster() {
  const league = useLeague();
  const nav = useNavigate();
  const v = useStore((s) => s.v);
  const [view, setView] = useQueryParam<View>('view', 'players', ['players', 'ratings', 'stats', 'contracts']);
  const tid = league.userTid;
  const team = league.teams[tid];
  const roster = useMemo(() => rosterSorted(league, tid), [league, tid, v]);
  const cap = CAP_FOR(league);
  const pay = payroll(league, tid);
  const age = (p: Player) => league.season - p.bornYear;

  const ratingCols: Col<Player>[] = [
    { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{p.firstName[0]}. {p.lastName}</span> },
    { key: 'ovr', label: 'OVR', get: (p) => p.ovr, fmt: (v) => <Ovr v={v as number} size="sm" /> },
    { key: 'pot', label: 'POT', get: (p) => p.pot },
    ...(['hgt', 'spd', 'ath', 'ins', 'mid', 'tp', 'hnd', 'pas', 'oiq', 'perD', 'intD', 'blk', 'diq', 'dreb'] as const).map((k) => ({
      key: k,
      label: { hgt: 'SIZ', spd: 'SPD', ath: 'EXP', ins: 'FIN', mid: 'MID', tp: '3PT', hnd: 'HND', pas: 'PAS', oiq: 'OIQ', perD: 'PER', intD: 'INT', blk: 'BLK', diq: 'DIQ', dreb: 'REB' }[k],
      get: (p: Player) => attrDisplay(p.ratings[k]),
      fmt: (v: number | string) => <span style={{ color: (v as number) >= 80 ? 'var(--good)' : (v as number) <= 60 ? 'var(--text-dim)' : undefined }}>{v}</span>,
    })),
  ];

  const statCols: Col<Player>[] = [
    { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{p.firstName[0]}. {p.lastName}</span> },
    { key: 'gp', label: 'GP', get: (p) => playerSeason(p, league.season)?.gp ?? 0 },
    { key: 'min', label: 'MIN', get: (p) => playerSeason(p, league.season)?.min ?? 0, fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (p) => playerSeason(p, league.season)?.pts ?? 0, fmt: (v) => f1(v as number) },
    { key: 'reb', label: 'REB', get: (p) => playerSeason(p, league.season)?.reb ?? 0, fmt: (v) => f1(v as number) },
    { key: 'ast', label: 'AST', get: (p) => playerSeason(p, league.season)?.ast ?? 0, fmt: (v) => f1(v as number) },
    { key: 'stl', label: 'STL', get: (p) => playerSeason(p, league.season)?.stl ?? 0, fmt: (v) => f1(v as number) },
    { key: 'blk', label: 'BLK', get: (p) => playerSeason(p, league.season)?.blk ?? 0, fmt: (v) => f1(v as number) },
    { key: 'ts', label: 'TS%', get: (p) => playerSeason(p, league.season)?.tsPct ?? 0, fmt: (v) => p1(v as number) },
    { key: 'tp', label: '3P%', get: (p) => playerSeason(p, league.season)?.tpPct ?? 0, fmt: (v) => p1(v as number) },
    { key: 'usg', label: 'USG', get: (p) => playerSeason(p, league.season)?.usg ?? 0, fmt: (v) => p1(v as number) },
    { key: 'on', label: 'ON NET', get: (p) => playerSeason(p, league.season)?.onOff ?? 0, fmt: (v) => signed(v as number) },
  ];

  const seasons = [0, 1, 2, 3].map((i) => league.season + i);
  const contractCols: Col<Player>[] = [
    { key: 'name', label: 'Player', get: (p) => p.lastName, left: true, sticky: true, fmt: (_, p) => <span className="bold">{p.firstName[0]}. {p.lastName}</span> },
    ...seasons.map((s) => ({
      key: `s${s}`,
      label: `${String(s - 1).slice(2)}-${String(s).slice(2)}`,
      get: (p: Player) => salaryFor(p, s),
      fmt: (v: number | string, p: Player) => (v ? <span style={{ color: p.contract.option && contractExp(p.contract) === s ? 'var(--warn)' : undefined }}>{moneyM(v as number)}</span> : <span className="dim">—</span>),
    })),
    { key: 'exp', label: 'EXP', get: (p) => contractExp(p.contract) },
  ];

  return (
    <main className="page">
      <PageHeader
        title="Roster"
        sub={`${roster.filter((p) => !p.contract.twoWay).length}/${CAP.rosterMax} players${roster.some((p) => p.contract.twoWay) ? ` + ${roster.filter((p) => p.contract.twoWay).length} two-way` : ''} · Payroll ${moneyM(pay)} · ${pay > cap.salaryCap ? `${moneyM(pay - cap.salaryCap)} over cap` : `${moneyM(cap.salaryCap - pay)} cap space`}`}
      />
      <div className="grid3">
        <Link to="/rotation" className="btn sm">
          <ListOrdered size={16} /> Rotation
        </Link>
        <Link to="/tactics" className="btn sm">
          <Workflow size={16} /> Tactics
        </Link>
        <Link to="/lab" className="btn sm">
          <Activity size={16} /> Lab
        </Link>
      </div>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'players', label: 'Players' },
          { id: 'ratings', label: 'Ratings' },
          { id: 'stats', label: 'Stats' },
          { id: 'contracts', label: 'Contracts' },
        ]}
      />
      {view === 'players' && (
        <Card className="flush">
          <div className="list wide2">
            {roster.map((p, i) => {
              const pg = playerSeason(p, league.season);
              const role = team.tactics.offense.roles[p.pid] ?? archetype(p.ratings).role;
              const mins = team.rotation.minutes[p.pid] ?? 0;
              return (
                <div key={p.pid} className="listrow clickable" role="button" tabIndex={0} onClick={() => nav(`/player/${p.pid}`)} onKeyDown={activateOnKey(() => nav(`/player/${p.pid}`))}>
                  <span className="tiny dim num" style={{ width: 14 }}>{i < 5 ? 'S' : i + 1}</span>
                  <Avatar p={p} />
                  <div className="grow">
                    <div className="row" style={{ gap: 6 }}>
                      <span className="bold ellipsis">{p.firstName} {p.lastName}</span>
                      <MoodIcon p={p} />
                    </div>
                    <div className="small dim ellipsis">
                      {p.pos} · {age(p)} · {fmtHeight(p.heightIn)} · {ROLE_META[role].label}
                    </div>
                    <div className="row" style={{ gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                      {p.contract.twoWay && <Tag>Two-way</Tag>}
                      {p.injury && <Tag tone="bad">{p.injury.type} · {p.injury.gamesRemaining}g</Tag>}
                      {p.mood.tradeRequest && <Tag tone="bad">Trade request</Tag>}
                      {pg ? (
                        <span className="tiny dim2 num">{f1(pg.pts)} pts · {f1(pg.reb)} reb · {f1(pg.ast)} ast · {f1(pg.min)} min</span>
                      ) : (
                        <span className="tiny dim">{mins ? `${mins} min planned` : 'Out of rotation'}</span>
                      )}
                    </div>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Ovr v={p.ovr} />
                    <span className="pot">POT {p.pot}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {view === 'ratings' && <StatTable rows={roster} cols={ratingCols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} />}
      {view === 'stats' && <StatTable rows={roster} cols={statCols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} initialSort="pts" />}
      {view === 'contracts' && (
        <>
          <StatTable rows={roster} cols={contractCols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} />
          <div className="small dim">
            Cap {moneyM(cap.salaryCap)} · Tax line {moneyM(cap.luxuryTax)}. Orange = option year. Full cap sheet in <Link to="/office" style={{ color: 'var(--accent-text)' }}>Front Office</Link>.
          </div>
        </>
      )}
    </main>
  );
}
