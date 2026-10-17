import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, ChevronRight, ClipboardList, ShieldAlert, Swords, Target } from 'lucide-react';
import { ACTIONS, type DraftPick, type League, type Player } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { CAP_FOR, contractSeason, curTeamSeason, payroll, rosterSorted, teamName } from '../../core/league/helpers';
import { pickLabel, pickTermsNote } from '../../core/league/trades';
import { confStandings } from '../../core/league/standings';
import { scoutTeam } from '../../core/ai/advisor';
import { SCOUT_MIN_GAMES, scoutData } from '../../core/analysis/scouting';
import { HeadToHead, KeyPlayers, OppPlanNote, PlayTypeTable, RankStrip, scoutSource } from '../components/scouting';
import { aiGamePlan, nextMeeting } from '../../core/ai/opponentPlan';
import { ACTION_META, COVERAGE_META, DEF_PRESETS, OFF_PRESETS, PRESS_META, SCHEME_META, STAR_PLAN_META } from '../../core/sim/tactics';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { seasonLabel } from '../../core/constants';
import { FRANCHISES } from '../../core/teams';
import { TeamLogo } from '../components/TeamLogo';
import { OddsLine } from '../components/OddsLine';
import { Avatar, Bar, Card, Empty, Kpi, Ovr, PageHeader, Segmented, StatTable, shade, type Col } from '../components/ui';
import { f1, latestLine, ordinal, playerSeason, rosterNames, signed, startingFive, teamRatings, type PerGame } from '../stats';
import { PRACTICE, fmtM, openOption, shortSeason } from '../office/common';
import { OutcomeTag, PROJECTION_NOTE, SectionLabel, StrategyTag, TabBar, pickProjection, seasonOutcome, shortName, useQueryParam } from '../league/shared';
import { TeamScheduleList } from '../league/Schedule';
import { capPayroll } from '../../core/league/freeAgency';
import { MovesTab } from '../league/MovesTab';
import { RetiredBanners } from '../league/RetiredBanners';
import { activeCoach, coachCareer, coyWinners, stintTotals } from '../../core/league/coaches';

const TABS = ['roster', 'tactics', 'scouting', 'schedule', 'picks', 'moves', 'history'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { roster: 'Roster', tactics: 'Tactics', scouting: 'Scouting', schedule: 'Schedule', picks: 'Picks', moves: 'Moves', history: 'History' };

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
    <main className="page lg-page" key={tid}>
      <PageHeader title={team.name} sub={`${team.div} Division · ${FRANCHISES[tid]?.arena ?? ''}`} back />
      <Hero league={league} tid={tid} />
      <TabBar value={tab} onChange={setTab} options={TABS.map((id) => ({ id, label: LABEL[id] }))} label="Team sections" />
      {tab === 'roster' && <RosterTab league={league} tid={tid} />}
      {tab === 'tactics' && <TacticsTab league={league} tid={tid} />}
      {tab === 'scouting' && <ScoutingTab league={league} tid={tid} />}
      {tab === 'schedule' && <ScheduleTab league={league} tid={tid} />}
      {tab === 'picks' && <PicksTab league={league} tid={tid} />}
      {tab === 'moves' && <MovesTab league={league} tid={tid} />}
      {tab === 'history' && <HistoryTab league={league} tid={tid} />}
    </main>
  );
}

// ---------------------------------------------------------------- header

function Hero({ league, tid }: { league: League; tid: number }) {
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const isUser = tid === league.userTid;
  const confRank = useLeagueMemo(() => confStandings(league, team.conf).findIndex((r) => r.tid === tid) + 1, [league, tid, team.conf]);
  const cs = contractSeason(league);
  const pay = payroll(league, tid, cs);
  const tr = teamRatings(ts);
  const gp = ts.won + ts.lost;
  // the playbook the team runs now, as its Tactics tab and scouting report say (the coach's roots are on the Tactics tab)
  const off = OFF_PRESETS.find((p) => p.id === team.tactics.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === team.tactics.defPreset);
  const [c1] = team.colors;
  const outcome = seasonOutcome(league, tid, ts);
  return (
    <>
      <div
        className="lg-team-hero"
        style={{ background: `radial-gradient(500px 220px at 100% 0%, ${c1}66, transparent 70%), linear-gradient(160deg, ${shade(c1, -0.55)}, var(--surface) 75%)` }}
      >
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
              {gp ? `${ordinal(confRank)} in the ${team.conf === 'E' ? 'East' : 'West'}` : `${team.conf === 'E' ? 'Eastern' : 'Western'} Conference`}
            </div>
          </div>
          <div className="grow" />
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div className="small bold ellipsis">{isUser ? league.coachName : team.coach.name}</div>
            <div className="tiny dim2 ellipsis">
              {off?.name ?? 'Custom offense'} · {def?.name ?? 'Custom defense'}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <OddsLine league={league} tid={tid} />
        </div>
        <div className="lg-strip">
          <div>
            <span className="k">Off Rtg</span>
            <span className="v">{gp ? f1(tr.ortg) : '—'}</span>
          </div>
          <div>
            <span className="k">Def Rtg</span>
            <span className="v">{gp ? f1(tr.drtg) : '—'}</span>
          </div>
          <div>
            <span className="k">Net</span>
            <span className="v" style={{ color: gp ? (tr.net >= 0 ? 'var(--good)' : 'var(--bad)') : undefined }}>
              {gp ? signed(tr.net) : '—'}
            </span>
          </div>
          <div>
            <span className="k">Payroll{cs !== league.season ? ` ${shortSeason(cs)}` : ''}</span>
            <span className="v" style={{ color: payColor(league, pay, cs) }}>
              {fmtM(pay)}
            </span>
          </div>
        </div>
      </div>
      {!isUser ? (
        <div className="row" style={{ gap: 8 }}>
          <Link to={`/trade?with=${tid}`} className="btn primary grow">
            <ArrowLeftRight size={17} /> Propose trade
          </Link>
          <Link to={`/gameplan/${tid}`} className="btn grow">
            <ClipboardList size={17} /> Game plan
          </Link>
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <Link to="/roster" className="btn grow">
            Manage roster
          </Link>
          <Link to="/tactics" className="btn grow">
            Tactics
          </Link>
        </div>
      )}
    </>
  );
}

function payColor(league: League, pay: number, season: number) {
  const cap = CAP_FOR(league, season);
  return pay > cap.luxuryTax ? 'var(--bad)' : pay > cap.salaryCap ? 'var(--warn)' : 'var(--good)';
}

/** Payroll vs cap and tax lines, for the season contracts count against (next season in the offseason). */
function PayrollBar({ league, tid }: { league: League; tid: number }) {
  const cs = contractSeason(league);
  const pay = payroll(league, tid, cs);
  // during the draft and re-signing window, the players a team will keep hold cap room
  const room = capPayroll(league, tid, cs);
  const holds = room > pay ? ' after holds' : '';
  const cap = CAP_FOR(league, cs);
  const color = payColor(league, pay, cs);
  return (
    <Card>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="small dim">Payroll {seasonLabel(cs)}</span>
        <span className="bold num" style={{ color }}>
          {fmtM(pay)}
        </span>
      </div>
      <Bar value={(pay / (cap.luxuryTax * 1.1)) * 100} color={color} />
      <div className="row between tiny dim" style={{ marginTop: 6 }}>
        <span>Cap {fmtM(cap.salaryCap)}</span>
        <span>{room > cap.salaryCap ? `${fmtM(room - cap.salaryCap)} over cap${holds}` : `${fmtM(cap.salaryCap - room)} cap space${holds}`}</span>
        <span>Tax {fmtM(cap.luxuryTax)}</span>
      </div>
    </Card>
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
        label="Roster view"
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
  const team = league.teams[tid];
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  if (!roster.length) return <Empty>No players on the roster.</Empty>;
  // the avatar already shows the initials: last names alone fit a phone ("Murray-Boyles", not "C. Murray-Boyl…")
  const nameOf = rosterNames(roster);
  // the five who start the next game: an injured starter is listed with the bench until he's back
  const starters = startingFive(roster);
  const groups = [
    { label: 'Starters', list: roster.filter((p) => starters.has(p.pid)) },
    { label: 'Bench', list: roster.filter((p) => !starters.has(p.pid) && !p.contract.twoWay) },
    { label: 'Two-way', list: roster.filter((p) => !starters.has(p.pid) && p.contract.twoWay) },
  ];
  const anyCur = roster.some((p) => (playerSeason(p, league.season)?.gp ?? 0) > 0);
  // before the first game the rows show each player's latest season: a new fictional league has none
  const anyPast = !anyCur && roster.some((p) => latestLine(league, p));
  return (
    <>
      {groups.map((g) =>
        g.list.length ? (
          <div key={g.label} className="col" style={{ gap: 6 }}>
            <SectionLabel
              right={
                g.label === 'Starters' ? (
                  <span className="tiny dim">{anyCur ? `${seasonLabel(league.season)} per game` : anyPast ? 'Latest season per game' : 'No games yet'}</span>
                ) : undefined
              }
            >
              {g.label}
            </SectionLabel>
            <Card className="flush lg-flat">
              {g.list.map((p) => (
                <PlayerRow key={p.pid} league={league} p={p} name={nameOf(p.pid)} min={team.rotation.minutes[p.pid]} />
              ))}
            </Card>
          </div>
        ) : null,
      )}
    </>
  );
}

function PlayerRow({ league, p, name, min }: { league: League; p: Player; name: string; min?: number }) {
  const cur = playerSeason(p, league.season);
  const line: PerGame | null = cur && cur.gp > 0 ? cur : (latestLine(league, p)?.pg ?? null);
  const age = playerAge(p, league.season);
  return (
    <Link to={`/player/${p.pid}`} className="lg-prow">
      <Avatar p={p} />
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="bold ellipsis">{name}</span>
        </div>
        {/* what's wrong leads the details: the name line has no room for it on a phone */}
        <div className="tiny dim ellipsis">
          {p.injury && (
            <span className="bad" style={{ fontWeight: 700 }}>
              Out {p.injury.gamesRemaining}g ({p.injury.type}) ·{' '}
            </span>
          )}
          {p.mood.tradeRequest && (
            <span className="warn" style={{ fontWeight: 700 }}>
              Wants a trade ·{' '}
            </span>
          )}
          {p.pos} · {age} yrs{min ? ` · ${Math.round(min)} min` : ''} · {p.archetype}
        </div>
      </div>
      <div className="lg-pstats">
        {(['pts', 'reb', 'ast'] as const).map((k) => (
          <div key={k} className="col" style={{ gap: 0 }}>
            <span className="v">{line ? f1(line[k]) : '—'}</span>
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
  const rows = useLeagueMemo(
    () =>
      rosterSorted(league, tid)
        .map((p) => ({ p, pg: playerSeason(p, league.season) }))
        .filter((r): r is { p: Player; pg: PerGame } => !!r.pg),
    [league, tid],
  );
  const cols = useMemo<Col<{ p: Player; pg: PerGame }>[]>(() => {
    const nameOf = rosterNames(
      rows.map((r) => r.p),
      { initial: true },
    );
    const pc = (x: number | string) => (typeof x === 'number' && x >= 0 ? (x * 100).toFixed(1) : '—');
    return [
      {
        key: 'n',
        label: 'Player',
        left: true,
        sticky: true,
        get: (r) => r.p.lastName,
        fmt: (_x, r) => (
          <span className="lg-pcell">
            <span className="n">{nameOf(r.p.pid)}</span>
            <span className="tiny dim">{r.p.pos}</span>
          </span>
        ),
      },
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
  }, [rows]);
  if (!rows.length)
    return (
      <Card>
        <Empty>No games played this season yet.</Empty>
      </Card>
    );
  return <StatTable rows={rows} cols={cols} initialSort="pts" rowKey={(r) => r.p.pid} onRow={(r) => nav(`/player/${r.p.pid}`)} />;
}

/** A contracts row: a player, or the salary still owed to one the team released (dead money). */
interface ContractRow {
  key: string;
  pid: number;
  p?: Player;
  name: string;
  amount: (season: number) => number;
}

function Contracts({ league, tid }: { league: League; tid: number }) {
  const nav = useNavigate();
  const cs = contractSeason(league);
  const seasons = [0, 1, 2, 3].map((i) => cs + i);
  // names are worked out with the rows, so a new arrival never shows a blank one
  const rows = useLeagueMemo(() => {
    const players = rosterSorted(league, tid).sort((a, b) => salaryFor(b, cs) - salaryFor(a, cs));
    const nameOf = rosterNames(players, { initial: true });
    const out: ContractRow[] = players.map((p) => ({ key: `p${p.pid}`, pid: p.pid, p, name: nameOf(p.pid), amount: (s) => salaryFor(p, s) }));
    // payroll counts dead money, so the table lists it too (as the Office does)
    const dead = new Map<number, { name: string; by: Map<number, number> }>();
    for (const d of league.teams[tid].deadMoney) {
      if (d.season < cs || d.season > cs + 3) continue;
      const e = dead.get(d.pid) ?? { name: d.name, by: new Map<number, number>() };
      e.by.set(d.season, (e.by.get(d.season) ?? 0) + d.amount);
      dead.set(d.pid, e);
    }
    for (const [pid, e] of dead) out.push({ key: `d${pid}`, pid, name: e.name, amount: (s) => e.by.get(s) ?? 0 });
    return out;
  }, [league, tid, cs]);
  const cap = CAP_FOR(league, cs);
  const cols = useMemo<Col<ContractRow>[]>(
    () => [
      {
        key: 'n',
        label: 'Player',
        left: true,
        sticky: true,
        get: (r) => r.p?.lastName ?? r.name,
        fmt: (_x, r) => (
          <span className="lg-pcell">
            <span className="n">{r.name}</span>
            {r.p?.contract.twoWay && <span className="tag">2W</span>}
            {!r.p && <span className="tiny dim">dead money</span>}
          </span>
        ),
      },
      { key: 'ovr', label: 'OVR', get: (r) => r.p?.ovr ?? -1, fmt: (x, r) => (r.p ? <Ovr v={x as number} size="sm" /> : '') },
      { key: 'age', label: 'Age', get: (r) => (r.p ? playerAge(r.p, league.season) : -1), fmt: (x, r) => (r.p ? x : '') },
      ...[0, 1, 2, 3].map((i): Col<ContractRow> => ({
        key: `s${i}`,
        label: shortSeason(cs + i),
        get: (r) => r.amount(cs + i),
        fmt: (x, r) => {
          const amt = x as number;
          if (!amt) return <span className="dim">—</span>;
          // (an option year already under way was settled)
          const o = r.p ? openOption(league, r.p) : undefined;
          const opt = r.p && o && contractExp(r.p.contract) === cs + i ? (o === 'player' ? ' PO' : ' TO') : '';
          // the first season of a signed extension
          const ext = r.p && extensionStart(r.p.contract) === cs + i;
          return (
            <span className={!r.p || r.p.contract.twoWay ? 'dim' : i === 0 ? 'bold' : 'dim2'}>
              {fmtM(amt)}
              {opt && <span className="tiny warn">{opt}</span>}
              {ext && <span className="tiny good"> EXT</span>}
            </span>
          );
        },
      })),
      { key: 'exp', label: 'Exp', get: (r) => (r.p ? contractExp(r.p.contract) : -1), fmt: (x, r) => (r.p ? x : '') },
    ],
    [league, cs],
  );
  const twoWay = rows.some((r) => r.p?.contract.twoWay);
  return (
    <>
      <PayrollBar league={league} tid={tid} />
      <div className="grid4">
        {seasons.map((s) => {
          const pay = payroll(league, tid, s);
          return (
            <Kpi
              key={s}
              k={seasonLabel(s)}
              v={<span style={{ fontSize: 18 }}>{fmtM(pay, 0)}</span>}
              sub={s === cs ? (pay > cap.salaryCap ? 'Over cap' : 'Under cap') : 'committed'}
            />
          );
        })}
      </div>
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.key} onRow={(r) => nav(`/player/${r.pid}`)} />
      <div className="lg-note">
        PO = player option, TO = team option on the final year, EXT = first season of a signed extension.
        {twoWay ? ' 2W = two-way contract: paid, but not counted toward the cap, the tax or payroll.' : ''} Dead money from released players counts toward payroll.
      </div>
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

/**
 * The head coach's line on the team page, from the coach registry: his time with this team ("In
 * charge since 2027-28 · 120-126 · 1 title"), his career when he has coached elsewhere, and the
 * team's last three coaches before him.
 */
function coachingStaff(league: League, tid: number) {
  const r = activeCoach(league, tid);
  if (!r) return null;
  const coy = coyWinners(league);
  const k = coachCareer(league, r, coy);
  const here = k.stints.find((j) => !j.stint.to && j.stint.tid === tid);
  if (!here) return null;
  const titles = (n: number) => (n ? ` · ${n} title${n === 1 ? '' : 's'}` : '');
  const start = here.lines[0]?.season ?? here.stint.from;
  const line =
    start > league.season
      ? `Takes charge for ${seasonLabel(start)}`
      : `In charge since ${seasonLabel(start)}${here.won + here.lost ? ` · ${here.won}-${here.lost}` : ''}${titles(here.titles)}`;
  const elsewhere = k.stints.some((j) => j !== here && j.lines.length);
  const career = elsewhere || k.coy.length ? `Career ${k.won}-${k.lost}${titles(k.titles)}${k.coy.length ? ` · Coach of the Year ×${k.coy.length}` : ''}` : '';
  const before = (league.coaches ?? [])
    .flatMap((c) => c.stints.filter((s) => s.tid === tid && s.to).map((s) => ({ c, j: stintTotals(league, s) })))
    .filter(({ j }) => j.lines.length)
    .sort((a, b) => b.j.lines[b.j.lines.length - 1].season - a.j.lines[a.j.lines.length - 1].season || b.j.stint.from - a.j.stint.from)
    .slice(0, 3)
    .map(({ c, j }) => {
      const [first, last] = [j.lines[0].season, j.lines[j.lines.length - 1].season];
      return `${c.name} (${first === last ? seasonLabel(first) : `${seasonLabel(first)} – ${seasonLabel(last)}`}, ${j.won}-${j.lost}${titles(j.titles)})`;
    });
  return { id: r.id, here: line, career, before };
}

function TacticsTab({ league, tid }: { league: League; tid: number }) {
  const team = league.teams[tid];
  const t = team.tactics;
  const off = OFF_PRESETS.find((p) => p.id === t.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === t.defPreset);
  const coachOff = OFF_PRESETS.find((p) => p.id === team.coach.offPhilosophy);
  const coachDef = DEF_PRESETS.find((p) => p.id === team.coach.defPhilosophy);
  const roster = rosterSorted(league, tid);
  const minNames = rosterNames(roster, { initial: true });
  const byMin = [...roster].filter((p) => (team.rotation.minutes[p.pid] ?? 0) > 0).sort((a, b) => (team.rotation.minutes[b.pid] ?? 0) - (team.rotation.minutes[a.pid] ?? 0));
  const star = t.defense.starTarget !== null ? league.players[t.defense.starTarget] : undefined;
  const staff = useLeagueMemo(() => coachingStaff(league, tid), [league, tid]);
  const coachName = tid === league.userTid ? league.coachName : team.coach.name;
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      <Card
        title={
          <h3>
            <Swords size={14} style={{ verticalAlign: -2 }} /> Offense
          </h3>
        }
        right={t.manual ? <span className="tag">Custom</span> : undefined}
      >
        <div className="display bold" style={{ fontSize: 22, textTransform: 'uppercase' }}>
          {off?.name ?? 'Custom'}
        </div>
        {off && (
          <div className="small dim2" style={{ marginTop: 2 }}>
            {off.tagline}. {off.description}
          </div>
        )}
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
      <Card
        title={
          <h3>
            <ShieldAlert size={14} style={{ verticalAlign: -2 }} /> Defense
          </h3>
        }
      >
        <div className="display bold" style={{ fontSize: 22, textTransform: 'uppercase' }}>
          {def?.name ?? 'Custom'}
        </div>
        {def && (
          <div className="small dim2" style={{ marginTop: 2 }}>
            {def.tagline}. {def.description}
          </div>
        )}
        <div className="col" style={{ gap: 0, marginTop: 10 }}>
          <div className="lg-kv">
            <span className="k">Scheme</span>
            <span className="bold">{SCHEME_META[t.defense.scheme].label}</span>
          </div>
          <div className="lg-kv">
            <span className="k">Ball screens</span>
            <span className="bold">{COVERAGE_META[t.defense.pnr].label}</span>
          </div>
          <div className="lg-kv">
            <span className="k">Press</span>
            <span className="bold">{PRESS_META[t.defense.press].label}</span>
          </div>
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
        {t.defense.switchOffBall && (
          <div style={{ marginTop: 10 }}>
            <span className="tag warn">Switches off the ball</span>
          </div>
        )}
      </Card>
      <Card
        title={
          <h3>
            <ClipboardList size={14} style={{ verticalAlign: -2 }} /> Coaching staff
          </h3>
        }
      >
        <div className="row" style={{ gap: 12 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 16 }}>
              {/* his history: jobs, record, titles (History → Coaches) */}
              {staff ? <Link to={`/history?view=coaches&coach=${staff.id}`}>{coachName}</Link> : coachName}
            </div>
            <div className="small dim">Head coach{tid === league.userTid ? ' (you)' : ''}</div>
            {staff && <div className="small dim2">{staff.here}</div>}
            {staff?.career && <div className="tiny dim">{staff.career}</div>}
          </div>
        </div>
        <div className="col" style={{ gap: 0, marginTop: 10 }}>
          <div className="lg-kv">
            <span className="k">Offensive roots</span>
            <span>{coachOff?.name ?? '—'}</span>
          </div>
          <div className="lg-kv">
            <span className="k">Defensive roots</span>
            <span>{coachDef?.name ?? '—'}</span>
          </div>
        </div>
        <div className="col" style={{ gap: 2, marginTop: 8 }}>
          <Meter label="Development" value={team.coach.development} color="var(--good)" />
          <Meter label="Adjustments" value={team.coach.tactics} color="var(--good)" />
        </div>
        <div className="lg-note" style={{ marginTop: 8 }}>
          Practice intensity: {PRACTICE.find((x) => x.id === team.practice)?.label ?? '—'}. Development boosts young players' growth; adjustments drive in-game counters.
        </div>
        {staff && staff.before.length > 0 && (
          <div className="lg-note" style={{ marginTop: 6 }}>
            Before: {staff.before.join(' · ')}.
          </div>
        )}
      </Card>
      <Card title="Rotation minutes">
        {byMin.length === 0 ? (
          <div className="small dim">No rotation set.</div>
        ) : (
          <div className="col" style={{ gap: 2 }}>
            {byMin.slice(0, 11).map((p, i) => (
              <Link key={p.pid} to={`/player/${p.pid}`} className="lg-meter" style={{ gridTemplateColumns: '118px minmax(0,1fr) 28px' }}>
                <span className="ellipsis" style={{ fontWeight: i < 5 ? 700 : 500 }}>
                  {minNames(p.pid)}
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
  const rep = useLeagueMemo(() => scoutTeam(league, tid), [league, tid]);
  const data = useLeagueMemo(() => scoutData(league, tid), [league, tid]);
  // what their coach has planned for the next game against you, when he game-plans for it
  const next = useLeagueMemo(() => {
    const g = tid === league.userTid ? undefined : nextMeeting(league, tid);
    return g ? { day: g.day, plan: aiGamePlan(league, tid, league.userTid, g) } : null;
  }, [league, tid]);
  const [ptSide, setPtSide] = useState<'off' | 'def'>('off');
  const isUser = tid === league.userTid;
  const complexity = league.settings.complexity;
  const abbrev = league.teams[tid].abbrev;
  return (
    <>
      <Card accent>
        <div className="small upper dim bold" style={{ letterSpacing: '0.08em' }}>
          {isUser ? 'How opponents see you' : 'Scouting report'}
        </div>
        <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.45 }}>{rep.summary}</div>
        {next?.plan && (
          <div style={{ marginTop: 10 }}>
            <OppPlanNote league={league} items={next.plan.items} day={next.day} />
          </div>
        )}
        {!isUser && (
          <>
            <Link to={`/gameplan/${tid}`} className="btn primary sm" style={{ marginTop: 12 }}>
              <ClipboardList size={16} /> Game plan vs {abbrev}
            </Link>
            <Link to={`/lab?opp=${tid}`} className="lg-link small row" style={{ gap: 4, marginTop: 10 }}>
              Test a game plan against them in the Tactics Lab <ChevronRight size={15} />
            </Link>
          </>
        )}
      </Card>
      <Card
        title={
          <h3>
            <BarChart3 size={14} style={{ verticalAlign: -2 }} /> By the numbers
          </h3>
        }
        right={data.enough ? <span className="tiny dim">{scoutSource(data)}</span> : undefined}
      >
        {data.enough ? (
          <div className="col" style={{ gap: 12 }}>
            {data.lastSeason && <div className="small dim2">Too few games this season: these are last season&apos;s numbers.</div>}
            <RankStrip d={data} complexity={complexity} />
            {data.tendencies.length > 0 && (
              <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--info)' }}>
                {data.tendencies.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="small dim">Not enough games yet: the numbers come in after {SCOUT_MIN_GAMES} games. Until then the report reads their playbook and roster.</div>
        )}
      </Card>
      {data.enough && complexity !== 'simple' && data.playTypes.length > 0 && (
        <Card
          title="Play types"
          right={
            <span className="tiny dim">
              {data.ptGames} game{data.ptGames === 1 ? '' : 's'}
            </span>
          }
        >
          <Segmented
            label="Play types at which end"
            value={ptSide}
            onChange={setPtSide}
            options={[
              { id: 'off', label: 'Their offense' },
              { id: 'def', label: 'Their defense' },
            ]}
          />
          <div style={{ marginTop: 10 }}>
            <PlayTypeTable rows={ptSide === 'off' ? data.playTypes : data.defPlayTypes} defense={ptSide === 'def'} complexity={complexity} />
          </div>
          <div className="tiny dim" style={{ marginTop: 6 }}>
            Points per possession by how the possession finished, against the league&apos;s. {ptSide === 'off' ? 'Red: they score well.' : 'Red: they allow a lot.'}
          </div>
        </Card>
      )}
      <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
        <Card
          title={
            <h3>
              <Swords size={14} style={{ verticalAlign: -2 }} /> Offense
            </h3>
          }
        >
          <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--info)' }}>
            {rep.offense.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>
        <Card
          title={
            <h3>
              <ShieldAlert size={14} style={{ verticalAlign: -2 }} /> Defense
            </h3>
          }
        >
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
      {data.players.length > 0 && (
        <Card title="Key players" right={<span className="tiny dim">{data.lastSeason ? `${seasonLabel(data.season)} numbers` : 'This season'}</span>}>
          <KeyPlayers d={data} complexity={complexity} />
          {data.players.some((p) => p.elsewhere) && (
            <div className="tiny dim" style={{ marginTop: 6 }}>
              Newcomers show their numbers from their last team, without on/off.
            </div>
          )}
        </Card>
      )}
      <Card
        title={
          <h3>
            <Target size={14} style={{ verticalAlign: -2 }} /> {isUser ? 'Weak spots to fix' : 'How to attack them'}
          </h3>
        }
      >
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
      {!isUser && (
        <Card title={`Head to head with ${abbrev}`}>
          <HeadToHead league={league} d={data} complexity={complexity} />
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- schedule

function ScheduleTab({ league, tid }: { league: League; tid: number }) {
  const isUser = tid === league.userTid;
  const h2h = useLeagueMemo(() => {
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
    const next = league.schedule
      .filter((g) => !g.played && ((g.home === tid && g.away === league.userTid) || (g.away === tid && g.home === league.userTid)))
      .sort((a, b) => a.day - b.day);
    return { w, l, next };
  }, [league, tid, isUser]);
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
                {h2h.next.length ? (
                  <span className="dim" style={{ fontWeight: 500 }}>
                    {' '}
                    · {h2h.next.length} left
                  </span>
                ) : null}
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
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  // a pick whose slot is set carries its number in its name
  const slotTag = (d: DraftPick) => {
    const p = proj(d);
    if (p !== undefined) return { text: `Proj. #${p}`, tone: d.round === 1 && p <= 14 ? 'warn' : 'info' };
    const yrs = d.season - league.season;
    return { text: yrs <= 0 ? 'This draft' : `In ${yrs} yr${yrs === 1 ? '' : 's'}`, tone: d.pick ? 'good' : '' };
  };
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
      {owned.some((d) => proj(d) !== undefined) && <div className="lg-note">{PROJECTION_NOTE}</div>}
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
                  <div className="tiny dim">
                    {acquired ? `Acquired from the ${teamName(league.teams[d.originalTid])}` : 'Own pick'}
                    {/* its protection and any swap on it, in words */}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </div>
                </div>
                {(() => {
                  const t = slotTag(d);
                  return <span className={`tag ${t.tone}`}>{t.text}</span>;
                })()}
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
                  <div className="bold">{pickLabel(league, d)}</div>
                  <div className="tiny dim">
                    Owned by the {teamName(league.teams[d.tid])}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </div>
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
      {(team.retired?.length ?? 0) > 0 && (
        <Card title="Retired numbers">
          <RetiredBanners league={league} tid={tid} small />
        </Card>
      )}
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
