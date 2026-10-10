import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronRight, ClipboardList, FlaskConical, ShieldAlert, Swords, Target } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { useLeague, useStore } from '../../state/store';
import { CAP_FOR, curTeamSeason, payroll, rosterSorted } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { pickLabel } from '../../core/league/trades';
import { scoutTeam } from '../../core/ai/advisor';
import { ACTION_META, COVERAGE_META, DEF_PRESETS, OFF_PRESETS, PRESS_META, SCHEME_META, STAR_PLAN_META } from '../../core/sim/tactics';
import { ACTIONS } from '../../core/types';
import { contractExp, salaryFor } from '../../core/playerGen';
import { seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Bar, Card, Empty, Kpi, Ovr, PageHeader, Segmented, StatTable, shade, type Col } from '../components/ui';
import { f1, latestLine, moneyM, playerSeason, signed, teamRatings, type PerGame } from '../stats';
import { OutcomeTag, SectionLabel, StrategyTag, TabBar, ordinal, seasonOutcome, shortName, useQueryParam } from '../league/shared';
import { TeamScheduleList } from '../league/Schedule';

const TABS = ['roster', 'tactics', 'scouting', 'schedule', 'picks', 'history'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { roster: 'Roster', tactics: 'Tactics', scouting: 'Scouting', schedule: 'Schedule', picks: 'Picks', history: 'History' };

export default function TeamView() {
  const league = useLeague();
  const params = useParams();
  const tid = Number(params.tid);
  const team = Number.isInteger(tid) ? league.teams[tid] : undefined;
  const [tab, setTab] = useQueryParam<Tab>('tab', 'roster', TABS, true);
  if (!team) {
    return (
      <main className="page">
        <PageHeader title="Team" back />
        <Card>
          <Empty>That team does not exist.</Empty>
        </Card>
      </main>
    );
  }
  return (
    <main className="page" key={tid}>
      <PageHeader title={team.abbrev} sub={`${team.region} ${team.name}`} back />
      <Hero league={league} tid={tid} />
      <TabBar value={tab} onChange={setTab} options={TABS.map((id) => ({ id, label: LABEL[id] }))} />
      {tab === 'roster' && <RosterTab league={league} tid={tid} />}
      {tab === 'tactics' && <TacticsTab league={league} tid={tid} />}
      {tab === 'scouting' && <ScoutingTab league={league} tid={tid} />}
      {tab === 'schedule' && <ScheduleTab league={league} tid={tid} />}
      {tab === 'picks' && <PicksTab league={league} tid={tid} />}
      {tab === 'history' && <HistoryTab league={league} tid={tid} />}
    </main>
  );
}

// ---------------------------------------------------------------- header

function Hero({ league, tid }: { league: League; tid: number }) {
  const v = useStore((s) => s.v);
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const isUser = tid === league.userTid;
  const confRank = useMemo(
    () => confStandings(league, team.conf).findIndex((r) => r.tid === tid) + 1,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, tid, v],
  );
  const pay = payroll(league, tid);
  const cap = CAP_FOR(league);
  const tr = teamRatings(ts);
  const gp = ts.won + ts.lost;
  const off = OFF_PRESETS.find((p) => p.id === team.coach.offPhilosophy);
  const def = DEF_PRESETS.find((p) => p.id === team.coach.defPhilosophy);
  const [c1] = team.colors;
  const capPct = (pay / cap.luxuryTax) * 100;
  const payColor = pay > cap.luxuryTax ? 'var(--bad)' : pay > cap.salaryCap ? 'var(--warn)' : 'var(--good)';
  const outcome = seasonOutcome(league, tid, ts);
  return (
    <>
      <div className="lg-team-hero" style={{ background: `radial-gradient(500px 220px at 100% 0%, ${c1}66, transparent 70%), linear-gradient(160deg, ${shade(c1, -0.55)}, var(--surface) 75%)` }}>
        <div className="wm">
          <TeamLogo tid={tid} size={170} />
        </div>
        <div className="row" style={{ gap: 14, position: 'relative' }}>
          <TeamLogo tid={tid} size={64} />
          <div className="grow">
            <div className="kick">{team.region}</div>
            <div className="big">{team.name}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              <StrategyTag team={team} />
              {isUser && <span className="tag info">Your team</span>}
              {outcome.short !== 'Ongoing' && outcome.short !== 'Missed' && <OutcomeTag o={outcome} />}
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 18, position: 'relative', alignItems: 'flex-end' }}>
          <div>
            <div className="display bold num" style={{ fontSize: 34, lineHeight: 1 }}>
              {ts.won}-{ts.lost}
            </div>
            <div className="tiny dim2 upper bold" style={{ marginTop: 3 }}>
              {gp ? `${ordinal(confRank)} in the ${team.conf === 'E' ? 'East' : 'West'}` : `${team.conf === 'E' ? 'Eastern' : 'Western'} Conf. · ${team.div}`}
            </div>
          </div>
          <div className="grow" />
          <div style={{ textAlign: 'right' }}>
            <div className="small bold">
              {isUser ? league.coachName : team.coach.name}
            </div>
            <div className="tiny dim2">
              {off?.name ?? 'Balanced'} · {def?.name ?? 'Man'}
            </div>
          </div>
        </div>
      </div>
      <div className="grid4">
        <Kpi k="Off Rtg" v={gp ? f1(tr.ortg) : '–'} />
        <Kpi k="Def Rtg" v={gp ? f1(tr.drtg) : '–'} />
        <Kpi k="Net" v={gp ? signed(tr.net) : '–'} color={gp ? (tr.net >= 0 ? 'var(--good)' : 'var(--bad)') : undefined} />
        <Kpi k="Pace" v={gp ? f1(tr.pace) : '–'} />
      </div>
      <Card>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="small dim">Payroll {seasonLabel(league.season)}</span>
          <span className="bold num" style={{ color: payColor }}>
            {moneyM(pay)}
          </span>
        </div>
        <Bar value={capPct} color={payColor} />
        <div className="row between tiny dim" style={{ marginTop: 6 }}>
          <span>Cap {moneyM(cap.salaryCap)}</span>
          <span>{pay > cap.salaryCap ? `${moneyM(pay - cap.salaryCap)} over cap` : `${moneyM(cap.salaryCap - pay)} cap space`}</span>
          <span>Tax {moneyM(cap.luxuryTax)}</span>
        </div>
        {!isUser ? (
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <Link to={`/trade?with=${tid}`} className="btn primary grow">
              <ArrowLeftRight size={17} /> Propose trade
            </Link>
            <Link to={`/lab?opp=${tid}`} className="btn grow">
              <FlaskConical size={17} /> Game plan
            </Link>
          </div>
        ) : (
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <Link to="/roster" className="btn grow">
              Manage roster
            </Link>
            <Link to="/tactics" className="btn grow">
              Tactics
            </Link>
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- roster

type RosterView = 'list' | 'stats' | 'contracts';

function RosterTab({ league, tid }: { league: League; tid: number }) {
  const [view, setView] = useQueryParam<RosterView>('rv', 'list', ['list', 'stats', 'contracts']);
  return (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'list', label: 'Rotation' },
          { id: 'stats', label: 'Stats' },
          { id: 'contracts', label: 'Contracts' },
        ]}
      />
      {view === 'list' && <RotationList league={league} tid={tid} />}
      {view === 'stats' && <RosterStats league={league} tid={tid} />}
      {view === 'contracts' && <Contracts league={league} tid={tid} />}
    </>
  );
}

function RotationList({ league, tid }: { league: League; tid: number }) {
  const v = useStore((s) => s.v);
  const team = league.teams[tid];
  const roster = useMemo(
    () => rosterSorted(league, tid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, tid, v],
  );
  if (!roster.length) return <Empty>No players on the roster.</Empty>;
  const starters = new Set(team.rotation.order.slice(0, 5));
  const groups = [
    { label: 'Starters', list: roster.filter((p) => starters.has(p.pid)) },
    { label: 'Bench', list: roster.filter((p) => !starters.has(p.pid)) },
  ];
  const anyCur = roster.some((p) => (playerSeason(p, league.season)?.gp ?? 0) > 0);
  return (
    <>
      {groups.map((g) =>
        g.list.length ? (
          <div key={g.label} className="col" style={{ gap: 6 }}>
            <SectionLabel right={g.label === 'Starters' ? <span className="tiny dim">{anyCur ? `${seasonLabel(league.season)} per game` : 'Last season per game'}</span> : undefined}>{g.label}</SectionLabel>
            <Card className="flush lg-flat">
              {g.list.map((p) => (
                <PlayerRow key={p.pid} league={league} p={p} min={team.rotation.minutes[p.pid]} />
              ))}
            </Card>
          </div>
        ) : null,
      )}
    </>
  );
}

function PlayerRow({ league, p, min }: { league: League; p: Player; min?: number }) {
  const cur = playerSeason(p, league.season);
  const line: PerGame | null = cur && cur.gp > 0 ? cur : latestLine(league, p)?.pg ?? null;
  const age = league.season - p.bornYear;
  return (
    <Link to={`/player/${p.pid}`} className="lg-prow">
      <Avatar p={p} />
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="bold ellipsis">{shortName(p)}</span>
          {p.injury && (
            <span className="tag bad" title={p.injury.type}>
              {p.injury.gamesRemaining}g
            </span>
          )}
          {p.mood.tradeRequest && <span className="tag warn">Wants out</span>}
        </div>
        <div className="tiny dim ellipsis">
          {p.pos} · {age} yrs · {p.archetype}
          {min ? ` · ${Math.round(min)} min` : ''}
        </div>
      </div>
      <div className="lg-pstats">
        {(['pts', 'reb', 'ast'] as const).map((k) => (
          <div key={k} className="col" style={{ gap: 0 }}>
            <span className="v">{line ? f1(line[k]) : '–'}</span>
            <span className="k">{k.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <Ovr v={p.ovr} />
    </Link>
  );
}

function RosterStats({ league, tid }: { league: League; tid: number }) {
  const nav = useNavigate();
  const v = useStore((s) => s.v);
  const rows = useMemo(
    () =>
      rosterSorted(league, tid)
        .map((p) => ({ p, pg: playerSeason(p, league.season) }))
        .filter((r): r is { p: Player; pg: PerGame } => !!r.pg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, tid, v],
  );
  const cols = useMemo<Col<{ p: Player; pg: PerGame }>[]>(() => {
    const pc = (x: number | string) => (typeof x === 'number' && x >= 0 ? (x * 100).toFixed(1) : '-');
    return [
      { key: 'n', label: 'Player', left: true, sticky: true, get: (r) => r.p.lastName, fmt: (_x, r) => <span className="lg-pcell"><span className="n">{shortName(r.p)}</span><span className="tiny dim">{r.p.pos}</span></span> },
      { key: 'gp', label: 'GP', get: (r) => r.pg.gp },
      { key: 'min', label: 'MIN', get: (r) => r.pg.min, fmt: (x) => f1(x as number) },
      { key: 'pts', label: 'PTS', get: (r) => r.pg.pts, fmt: (x) => <b>{f1(x as number)}</b> },
      { key: 'reb', label: 'REB', get: (r) => r.pg.reb, fmt: (x) => f1(x as number) },
      { key: 'ast', label: 'AST', get: (r) => r.pg.ast, fmt: (x) => f1(x as number) },
      { key: 'stl', label: 'STL', get: (r) => r.pg.stl, fmt: (x) => f1(x as number) },
      { key: 'blk', label: 'BLK', get: (r) => r.pg.blk, fmt: (x) => f1(x as number) },
      { key: 'tov', label: 'TOV', get: (r) => r.pg.tov, fmt: (x) => f1(x as number) },
      { key: 'fg', label: 'FG%', get: (r) => (r.pg.fga ? r.pg.fgPct : -1), fmt: pc },
      { key: 'tp', label: '3P%', get: (r) => (r.pg.tpa ? r.pg.tpPct : -1), fmt: pc },
      { key: 'ft', label: 'FT%', get: (r) => (r.pg.fta ? r.pg.ftPct : -1), fmt: pc },
      { key: 'ts', label: 'TS%', get: (r) => (r.pg.fga || r.pg.fta ? r.pg.tsPct : -1), fmt: pc },
      { key: 'usg', label: 'USG%', get: (r) => r.pg.usg, fmt: pc },
      { key: 'pm', label: '+/-', get: (r) => r.pg.pm, fmt: (x) => <span className={(x as number) > 0 ? 'good' : (x as number) < 0 ? 'bad' : ''}>{signed(x as number)}</span> },
    ];
  }, []);
  if (!rows.length) return <Card><Empty>No games played this season yet.</Empty></Card>;
  return <StatTable rows={rows} cols={cols} initialSort="pts" rowKey={(r) => r.p.pid} onRow={(r) => nav(`/player/${r.p.pid}`)} />;
}

function Contracts({ league, tid }: { league: League; tid: number }) {
  const nav = useNavigate();
  const v = useStore((s) => s.v);
  const seasons = [0, 1, 2, 3].map((i) => league.season + i);
  const rows = useMemo(
    () => rosterSorted(league, tid).sort((a, b) => salaryFor(b, league.season) - salaryFor(a, league.season)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, tid, v],
  );
  const cap = CAP_FOR(league);
  const cols = useMemo<Col<Player>[]>(
    () => [
      { key: 'n', label: 'Player', left: true, sticky: true, get: (p) => p.lastName, fmt: (_x, p) => <span className="lg-pcell"><span className="n">{shortName(p)}</span></span> },
      { key: 'ovr', label: 'OVR', get: (p) => p.ovr, fmt: (x) => <Ovr v={x as number} size="sm" /> },
      { key: 'age', label: 'Age', get: (p) => league.season - p.bornYear },
      ...seasons.map(
        (s, i): Col<Player> => ({
          key: `s${i}`,
          label: seasonLabel(s).slice(2),
          get: (p) => salaryFor(p, s),
          fmt: (x, p) => {
            const amt = x as number;
            if (!amt) return <span className="dim">–</span>;
            const opt = p.contract.option && contractExp(p.contract) === s ? (p.contract.option === 'player' ? ' PO' : ' TO') : '';
            return (
              <span className={i === 0 ? 'bold' : 'dim2'}>
                {moneyM(amt)}
                {opt && <span className="tiny warn">{opt}</span>}
              </span>
            );
          },
        }),
      ),
      { key: 'exp', label: 'Exp', get: (p) => contractExp(p.contract) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, league.season],
  );
  return (
    <>
      <div className="grid4">
        {seasons.map((s) => {
          const pay = payroll(league, tid, s);
          return <Kpi key={s} k={seasonLabel(s)} v={<span style={{ fontSize: 18 }}>{moneyM(pay, 0)}</span>} sub={s === league.season ? (pay > cap.salaryCap ? 'Over cap' : 'Under cap') : 'committed'} />;
        })}
      </div>
      <StatTable rows={rows} cols={cols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} />
      <div className="lg-note">PO = player option, TO = team option on the final year. Dead money from released players counts toward payroll.</div>
    </>
  );
}

// ---------------------------------------------------------------- tactics

function Meter({ label, value, max = 100, color }: { label: string; value: number; max?: number; color?: string }) {
  return (
    <div className="lg-meter">
      <span className="dim2">{label}</span>
      <Bar value={value} max={max} color={color} />
      <span className="val">{Math.round(value)}</span>
    </div>
  );
}

function TacticsTab({ league, tid }: { league: League; tid: number }) {
  const team = league.teams[tid];
  const t = team.tactics;
  const off = OFF_PRESETS.find((p) => p.id === t.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === t.defPreset);
  const coachOff = OFF_PRESETS.find((p) => p.id === team.coach.offPhilosophy);
  const coachDef = DEF_PRESETS.find((p) => p.id === team.coach.defPhilosophy);
  const roster = rosterSorted(league, tid);
  const byMin = [...roster].filter((p) => (team.rotation.minutes[p.pid] ?? 0) > 0).sort((a, b) => (team.rotation.minutes[b.pid] ?? 0) - (team.rotation.minutes[a.pid] ?? 0));
  const star = t.defense.starTarget !== null ? league.players[t.defense.starTarget] : undefined;
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      <Card title={<h3><Swords size={14} style={{ verticalAlign: -2 }} /> Offense</h3>} right={t.manual ? <span className="tag">Custom</span> : undefined}>
        <div className="display bold" style={{ fontSize: 22, textTransform: 'uppercase' }}>{off?.name ?? 'Custom'}</div>
        {off && <div className="small dim2" style={{ marginTop: 2 }}>{off.tagline}. {off.description}</div>}
        <div className="col" style={{ gap: 2, marginTop: 12 }}>
          <Meter label="Pace" value={t.offense.pace} />
          <Meter label="Transition" value={t.offense.transition} />
          <Meter label="3PT emphasis" value={t.offense.threePoint} />
          <Meter label="Rim attack" value={t.offense.rimAttack} />
          <Meter label="Crash boards" value={t.offense.crashBoards} />
        </div>
        <div className="divider" style={{ margin: '12px 0' }} />
        <SectionLabel>Play types</SectionLabel>
        <div className="col" style={{ gap: 2, marginTop: 6 }}>
          {ACTIONS.map((a) => (
            <Meter key={a} label={ACTION_META[a].label} value={t.offense.actions[a]} color="var(--info)" />
          ))}
        </div>
        {(t.offense.huntMismatch || t.offense.hotHand) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {t.offense.huntMismatch && <span className="tag info">Hunts mismatches</span>}
            {t.offense.hotHand && <span className="tag info">Feeds the hot hand</span>}
          </div>
        )}
      </Card>
      <Card title={<h3><ShieldAlert size={14} style={{ verticalAlign: -2 }} /> Defense</h3>}>
        <div className="display bold" style={{ fontSize: 22, textTransform: 'uppercase' }}>{def?.name ?? 'Custom'}</div>
        {def && <div className="small dim2" style={{ marginTop: 2 }}>{def.tagline}. {def.description}</div>}
        <div className="col" style={{ gap: 0, marginTop: 10 }}>
          <div className="lg-kv"><span className="k">Scheme</span><span className="bold">{SCHEME_META[t.defense.scheme].label}</span></div>
          <div className="lg-kv"><span className="k">Ball screens</span><span className="bold">{COVERAGE_META[t.defense.pnr].label}</span></div>
          <div className="lg-kv"><span className="k">Press</span><span className="bold">{PRESS_META[t.defense.press].label}</span></div>
          <div className="lg-kv">
            <span className="k">Star plan</span>
            <span className="bold ellipsis">
              {STAR_PLAN_META[t.defense.starPlan].label}
              {star && t.defense.starPlan !== 'none' ? ` · ${shortName(star)}` : ''}
            </span>
          </div>
        </div>
        <div className="col" style={{ gap: 2, marginTop: 8 }}>
          <Meter label="Help in paint" value={t.defense.help} color="var(--warn)" />
          <Meter label="Ball pressure" value={t.defense.pressure} color="var(--warn)" />
          <Meter label="Get back" value={t.defense.getBack} color="var(--warn)" />
          <Meter label="Physicality" value={t.defense.physicality} color="var(--warn)" />
        </div>
        {t.defense.switchOffBall && <div style={{ marginTop: 10 }}><span className="tag warn">Switches off the ball</span></div>}
      </Card>
      <Card title={<h3><ClipboardList size={14} style={{ verticalAlign: -2 }} /> Coaching staff</h3>}>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <div className="bold" style={{ fontSize: 16 }}>{tid === league.userTid ? league.coachName : team.coach.name}</div>
            <div className="small dim">Head coach{tid === league.userTid ? ' (you)' : ''}</div>
          </div>
        </div>
        <div className="col" style={{ gap: 0, marginTop: 10 }}>
          <div className="lg-kv"><span className="k">Offensive roots</span><span>{coachOff?.name ?? '—'}</span></div>
          <div className="lg-kv"><span className="k">Defensive roots</span><span>{coachDef?.name ?? '—'}</span></div>
        </div>
        <div className="col" style={{ gap: 2, marginTop: 8 }}>
          <Meter label="Development" value={team.coach.development} color="var(--good)" />
          <Meter label="Adjustments" value={team.coach.tactics} color="var(--good)" />
        </div>
        <div className="lg-note" style={{ marginTop: 8 }}>
          Practice: {team.practice}. Development boosts young players' growth; adjustments drive in-game counters.
        </div>
      </Card>
      <Card title="Rotation minutes">
        {byMin.length === 0 ? (
          <div className="small dim">No rotation set.</div>
        ) : (
          <div className="col" style={{ gap: 2 }}>
            {byMin.slice(0, 11).map((p, i) => (
              <Link key={p.pid} to={`/player/${p.pid}`} className="lg-meter" style={{ gridTemplateColumns: '118px minmax(0,1fr) 28px' }}>
                <span className="ellipsis" style={{ fontWeight: i < 5 ? 700 : 500 }}>
                  {shortName(p)}
                </span>
                <Bar value={team.rotation.minutes[p.pid] ?? 0} max={42} color={i < 5 ? 'var(--accent)' : 'var(--text-dim)'} />
                <span className="val">{Math.round(team.rotation.minutes[p.pid] ?? 0)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- scouting

function ScoutingTab({ league, tid }: { league: League; tid: number }) {
  const v = useStore((s) => s.v);
  const rep = useMemo(
    () => scoutTeam(league, tid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, tid, v],
  );
  const isUser = tid === league.userTid;
  return (
    <>
      <Card accent>
        <div className="small upper dim bold" style={{ letterSpacing: '0.08em' }}>
          {isUser ? 'How opponents see you' : 'Scouting report'}
        </div>
        <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.45 }}>{rep.summary}</div>
        {!isUser && (
          <Link to={`/lab?opp=${tid}`} className="lg-link small row" style={{ gap: 4, marginTop: 10 }}>
            Test a game plan against them in the Tactics Lab <ChevronRight size={15} />
          </Link>
        )}
      </Card>
      <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
        <Card title={<h3><Swords size={14} style={{ verticalAlign: -2 }} /> Offense</h3>}>
          <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--info)' }}>
            {rep.offense.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>
        <Card title={<h3><ShieldAlert size={14} style={{ verticalAlign: -2 }} /> Defense</h3>}>
          <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--warn)' }}>
            {rep.defense.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Key threats">
        {rep.threats.length === 0 ? (
          <div className="small dim">No standout threats.</div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {rep.threats.map((th) => {
              const p = league.players[th.pid];
              return (
                <Link key={th.pid} to={`/player/${th.pid}`} className="row top" style={{ gap: 10 }}>
                  {p ? <Avatar p={p} /> : null}
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="bold">{th.name}</span>
                      {p && <Ovr v={p.ovr} size="sm" />}
                    </div>
                    <div className="small dim2">{th.why}</div>
                  </div>
                  <ChevronRight size={16} className="dim" style={{ marginTop: 10 }} />
                </Link>
              );
            })}
          </div>
        )}
      </Card>
      <Card title={<h3><Target size={14} style={{ verticalAlign: -2 }} /> {isUser ? 'Weak spots to fix' : 'How to attack them'}</h3>}>
        {rep.weaknesses.length === 0 ? (
          <div className="small dim">No obvious weaknesses. Win the possession battle and execute.</div>
        ) : (
          <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--good)' }}>
            {rep.weaknesses.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- schedule

function ScheduleTab({ league, tid }: { league: League; tid: number }) {
  const v = useStore((s) => s.v);
  const isUser = tid === league.userTid;
  const h2h = useMemo(() => {
    if (isUser) return null;
    let w = 0;
    let l = 0;
    for (const g of league.games) {
      if (g.season !== league.season || g.type === 'allstar') continue;
      const ids = [g.home.tid, g.away.tid];
      if (!ids.includes(tid) || !ids.includes(league.userTid)) continue;
      const usWon = (g.home.tid === league.userTid ? g.home.pts : g.away.pts) > (g.home.tid === league.userTid ? g.away.pts : g.home.pts);
      if (usWon) w++;
      else l++;
    }
    const next = league.schedule.filter((g) => !g.played && ((g.home === tid && g.away === league.userTid) || (g.away === tid && g.home === league.userTid))).sort((a, b) => a.day - b.day);
    return { w, l, next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, tid, v, isUser]);
  const me = league.teams[league.userTid];
  return (
    <>
      {h2h && (
        <Card>
          <div className="row" style={{ gap: 12 }}>
            <TeamLogo tid={league.userTid} size={36} />
            <div className="grow">
              <div className="small dim upper bold" style={{ letterSpacing: '0.06em' }}>
                {me.abbrev} vs {league.teams[tid].abbrev} this season
              </div>
              <div className="bold">
                {h2h.w + h2h.l ? `You are ${h2h.w}-${h2h.l}` : 'No meetings yet'}
                {h2h.next.length ? <span className="dim" style={{ fontWeight: 500 }}> · {h2h.next.length} left</span> : null}
              </div>
            </div>
            <span className="tag" style={{ background: 'color-mix(in srgb, var(--accent-2) 20%, transparent)', color: 'var(--accent-2)' }}>
              H2H
            </span>
          </div>
        </Card>
      )}
      <TeamScheduleList league={league} tid={tid} h2hTid={isUser ? undefined : league.userTid} />
    </>
  );
}

// ---------------------------------------------------------------- picks

function PicksTab({ league, tid }: { league: League; tid: number }) {
  const owned = league.draftPicks.filter((d) => d.tid === tid).sort((a, b) => a.season - b.season || a.round - b.round || a.originalTid - b.originalTid);
  const away = league.draftPicks.filter((d) => d.originalTid === tid && d.tid !== tid).sort((a, b) => a.season - b.season || a.round - b.round);
  const firsts = owned.filter((d) => d.round === 1).length;
  return (
    <>
      <div className="grid3">
        <Kpi k="Picks owned" v={owned.length} />
        <Kpi k="1st rounders" v={firsts} />
        <Kpi k="Traded away" v={away.length} color={away.length ? 'var(--warn)' : undefined} />
      </div>
      <Card className="flush lg-flat">
        {owned.length === 0 ? (
          <Empty>No draft picks owned.</Empty>
        ) : (
          owned.map((d) => {
            const acquired = d.originalTid !== tid;
            return (
              <div key={d.dpid} className="lg-season" style={{ gridTemplateColumns: '28px minmax(0,1fr) auto' }}>
                <TeamLogo tid={d.originalTid} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div className="bold">{pickLabel(league, d)}</div>
                  <div className="tiny dim">{acquired ? `Acquired from ${league.teams[d.originalTid].region} ${league.teams[d.originalTid].name}` : 'Own pick'}</div>
                </div>
                <span className={`tag ${d.round === 1 ? 'info' : ''}`}>{d.round === 1 ? '1st round' : '2nd round'}</span>
              </div>
            );
          })
        )}
      </Card>
      {away.length > 0 && (
        <>
          <SectionLabel>Owed to other teams</SectionLabel>
          <Card className="flush lg-flat">
            {away.map((d) => (
              <Link key={d.dpid} to={`/team/${d.tid}`} className="lg-season" style={{ gridTemplateColumns: '28px minmax(0,1fr) auto' }}>
                <TeamLogo tid={d.tid} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div className="bold">
                    {d.season} {d.round === 1 ? '1st' : '2nd'}
                    {d.pick ? ` (#${d.pick})` : ''}
                  </div>
                  <div className="tiny dim">Owned by {league.teams[d.tid].region} {league.teams[d.tid].name}</div>
                </div>
                <ChevronRight size={16} className="dim" />
              </Link>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- history

function HistoryTab({ league, tid }: { league: League; tid: number }) {
  const team = league.teams[tid];
  const seasons = [...team.seasons].sort((a, b) => b.season - a.season);
  const done = seasons.filter((s) => s.season < league.season || (s.season === league.season && !['preseason', 'regular'].includes(league.phase)));
  const titles = seasons.filter((s) => s.playoffRound === 5).length;
  const apps = done.filter((s) => s.playoffRound >= 1).length;
  const w = seasons.reduce((a, s) => a + s.won, 0);
  const l = seasons.reduce((a, s) => a + s.lost, 0);
  return (
    <>
      <div className="grid3">
        <Kpi k="Record" v={`${w}-${l}`} sub={`${seasons.length} season${seasons.length === 1 ? '' : 's'}`} />
        <Kpi k="Playoffs" v={apps} />
        <Kpi k="Titles" v={titles} color={titles ? 'var(--tier-elite)' : undefined} />
      </div>
      <Card className="flush lg-flat">
        {seasons.map((s) => (
          <div key={s.season} className="lg-season">
            <span className="yr">{seasonLabel(s.season)}</span>
            <span className="rec">
              {s.won}-{s.lost}
            </span>
            <span className="tiny dim ellipsis">{s.seed ? `${ordinal(s.seed)} seed` : ''}</span>
            <OutcomeTag o={seasonOutcome(league, tid, s)} />
          </div>
        ))}
      </Card>
      {tid === league.userTid && (
        <Link to="/history" className="lg-link small row" style={{ gap: 4, justifyContent: 'center' }}>
          Full franchise & league history <ChevronRight size={15} />
        </Link>
      )}
    </>
  );
}
