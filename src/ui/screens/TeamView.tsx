import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, ChevronLeft, ChevronRight, ClipboardList, FlaskConical, Pencil, ShieldAlert, Swords, Target } from 'lucide-react';
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
import { Avatar, Bar, Help, More, Ovr, PageHeader, Section, Segmented, StatTable, Statline, type Col } from '../components/ui';
import { f1, latestLine, ordinal, playerSeason, rosterNames, signed, startingFive, teamRatings, type PerGame } from '../stats';
import { PRACTICE, fmtM, openOption, shortSeason } from '../office/common';
import { OutcomeTag, PROJECTION_NOTE, StrategyTag, TabBar, pickProjection, seasonOutcome, shortName, useQueryParam } from '../league/shared';
import { TeamScheduleList } from '../league/Schedule';
import { capPayroll } from '../../core/league/freeAgency';
import { MovesTab } from '../league/MovesTab';
import { RetiredBanners } from '../league/RetiredBanners';
import { activeCoach, coachCareer, coyWinners, stintTotals } from '../../core/league/coaches';
import { LazyTeamEditor } from '../god/lazy';
import { useBack } from '../nav';
import { slabVars } from '../teamColors';

const TABS = ['roster', 'tactics', 'scouting', 'schedule', 'picks', 'moves', 'history'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { roster: 'Roster', tactics: 'Tactics', scouting: 'Scouting', schedule: 'Schedule', picks: 'Picks', moves: 'Moves', history: 'History' };

export default function TeamView() {
  const league = useLeague();
  const params = useParams();
  const tid = Number(params.tid);
  const team = Number.isInteger(tid) ? league.teams[tid] : undefined;
  const [tab, setTab] = useQueryParam<Tab>('tab', 'roster', TABS, true);
  const [editing, setEditing] = useState(false);
  if (!team) {
    return (
      <main className="page">
        <PageHeader title="Team" back />
        <div className="card empty">That team does not exist.</div>
      </main>
    );
  }
  return (
    <main className="page lg-page" key={tid}>
      {editing && league.settings.godMode && <LazyTeamEditor tid={tid} onClose={() => setEditing(false)} />}
      <Hero league={league} tid={tid} onEdit={league.settings.godMode ? () => setEditing(true) : undefined} />
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

/** The team's slab, in its colours: who they are, their record and figures, then what you can do with them. */
function Hero({ league, tid, onEdit }: { league: League; tid: number; onEdit?: () => void }) {
  const goBack = useBack('/league');
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const isUser = tid === league.userTid;
  const confRank = useLeagueMemo(() => confStandings(league, team.conf).findIndex((r) => r.tid === tid) + 1, [league, tid, team.conf]);
  const cs = contractSeason(league);
  const pay = payroll(league, tid, cs);
  const cap = CAP_FOR(league, cs);
  const tr = teamRatings(ts);
  const gp = ts.won + ts.lost;
  // the playbook the team runs now, as its Tactics tab and scouting report say (the coach's roots are on the Tactics tab)
  const off = OFF_PRESETS.find((p) => p.id === team.tactics.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === team.tactics.defPreset);
  const outcome = seasonOutcome(league, tid, ts);
  const confWord = team.conf === 'E' ? 'East' : 'West';
  const arena = FRANCHISES[tid]?.arena;
  return (
    <>
      <section className="slab lg-team" style={slabVars(team.colors) as CSSProperties}>
        <span className="slab-mark">
          <TeamLogo tid={tid} size={220} decorative />
        </span>
        <div className="lg-team-top">
          <button className="iconbtn lg-team-back" onClick={goBack} aria-label="Back">
            <ChevronLeft size={24} />
          </button>
          <span className="lg-team-over">
            {confWord}ern Conference · {team.div}
          </span>
          {onEdit && (
            <button className="btn xs" aria-haspopup="dialog" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
        <div className="lg-team-id">
          <TeamLogo tid={tid} size={58} decorative />
          <div className="grow">
            <div className="lg-team-region">
              {team.region}
              {arena ? ` · ${arena}` : ''}
            </div>
            <h1 className="lg-team-name">{team.name}</h1>
          </div>
        </div>
        <div className="lg-team-tags">
          <StrategyTag team={team} />
          {isUser && <span className="tag">Your team</span>}
          {outcome.short !== 'Ongoing' && outcome.short !== 'Missed' && <OutcomeTag o={outcome} />}
        </div>
        <div className="lg-team-rec">
          <div>
            <div className="lg-team-wl num">
              {ts.won}-{ts.lost}
            </div>
            <div className="lg-team-rank">{gp ? `${ordinal(confRank)} in the ${confWord}` : 'No games yet'}</div>
          </div>
          <div className="lg-team-coach">
            <span className="nm ellipsis">{isUser ? league.coachName : team.coach.name}</span>
            <span className="lg-team-play">
              {off?.name ?? 'Custom offense'} · {def?.name ?? 'Custom defense'}
            </span>
          </div>
        </div>
        <div className="lg-team-odds">
          <OddsLine league={league} tid={tid} />
        </div>
        <div className="lg-team-figs">
          <Statline
            items={[
              { k: 'Off', v: gp ? f1(tr.ortg) : '—' },
              { k: 'Def', v: gp ? f1(tr.drtg) : '—' },
              { k: 'Net', v: gp ? signed(tr.net) : '—' },
              {
                k: `Payroll${cs !== league.season ? ` ${shortSeason(cs)}` : ''}`,
                v: fmtM(pay),
                s: pay > cap.luxuryTax ? 'Taxpayer' : pay > cap.salaryCap ? 'Over the cap' : 'Under the cap',
              },
            ]}
          />
        </div>
      </section>
      <div className="lg-team-actions">
        {!isUser ? (
          <>
            <Link to={`/trade?with=${tid}`} className="btn primary">
              <ArrowLeftRight size={17} /> Propose trade
            </Link>
            <Link to={`/gameplan/${tid}`} className="btn">
              <ClipboardList size={17} /> Game plan
            </Link>
          </>
        ) : (
          <>
            <Link to="/roster" className="btn">
              Manage roster
            </Link>
            <Link to="/tactics" className="btn">
              Tactics
            </Link>
          </>
        )}
      </div>
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
    <div className="card lg-pay">
      <div className="lg-pay-top">
        <span className="over">Payroll {seasonLabel(cs)}</span>
        <span className="lg-pay-v num" style={{ color }}>
          {fmtM(pay)}
        </span>
      </div>
      <Bar value={(pay / (cap.luxuryTax * 1.1)) * 100} color={color} />
      <div className="lg-pay-foot">
        <span>Cap {fmtM(cap.salaryCap)}</span>
        <span>{room > cap.salaryCap ? `${fmtM(room - cap.salaryCap)} over cap${holds}` : `${fmtM(cap.salaryCap - room)} cap space${holds}`}</span>
        <span>Tax {fmtM(cap.luxuryTax)}</span>
      </div>
    </div>
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
  if (!roster.length) return <div className="card empty">No players on the roster.</div>;
  // the jersey already shows who he is: last names alone fit a phone ("Murray-Boyles", not "C. Murray-Boyl…")
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
          <Section
            key={g.label}
            title={g.label}
            right={
              g.label === 'Starters' ? (
                <span className="lg-sec-meta">{anyCur ? `${seasonLabel(league.season)} per game` : anyPast ? 'Latest season per game' : 'No games yet'}</span>
              ) : undefined
            }
          >
            <div className="card flush">
              {g.list.map((p) => (
                <PlayerRow key={p.pid} league={league} p={p} name={nameOf(p.pid)} min={team.rotation.minutes[p.pid]} />
              ))}
            </div>
          </Section>
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
      <span className="lg-prow-t">
        <span className="lr-name ellipsis">{name}</span>
        {/* what's wrong leads the details: the name line has no room for it on a phone. They wrap rather
            than lose the archetype or the injury off the end, the archetype next to the position and each
            dot kept with what's before it */}
        <span className="lr-meta">
          {p.injury && (
            <b className="bad">
              Out {p.injury.gamesRemaining}g ({p.injury.type}) ·{' '}
            </b>
          )}
          {p.mood.tradeRequest && <b className="warn">Wants a trade · </b>}
          {p.pos}&nbsp;· {p.archetype}&nbsp;· {age}&nbsp;yrs{min ? `\u00a0· ${Math.round(min)}\u00a0min` : ''}
        </span>
      </span>
      <span className="lg-pstats">
        {(['pts', 'reb', 'ast'] as const).map((k) => (
          <span key={k}>
            <span className="v">{line ? f1(line[k]) : '—'}</span>
            <span className="k">{k.toUpperCase()}</span>
          </span>
        ))}
      </span>
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
  if (!rows.length) return <div className="card empty">No games played this season yet.</div>;
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
      <div className="card lg-strip">
        <Statline
          items={seasons.map((s) => {
            const pay = payroll(league, tid, s);
            return { k: shortSeason(s), v: fmtM(pay, 0), s: s === cs ? (pay > cap.salaryCap ? 'Over cap' : 'Under cap') : 'Committed' };
          })}
        />
      </div>
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.key} onRow={(r) => nav(`/player/${r.pid}`)} />
      <div className="lg-legend">
        <span>PO player option</span>
        <span>TO team option</span>
        <span>EXT extension starts</span>
        {twoWay && <span>2W two-way, off the cap</span>}
        <span>Dead money counts</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- tactics

function Meter({ label, value, max = 100, color }: { label: string; value: number; max?: number; color?: string }) {
  return (
    <div className="lg-meter">
      <span>{label}</span>
      <Bar value={value} max={max} color={color} height={5} />
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
    <div className="md-grid2">
      <Section
        title={
          <h3>
            <Swords size={13} aria-hidden="true" /> Offense
          </h3>
        }
        right={t.manual ? <span className="tag">Custom</span> : undefined}
      >
        <div className="card lg-tac">
          <div className="lg-tac-name">{off?.name ?? 'Custom'}</div>
          {off && (
            <>
              <div className="lg-tac-line">{off.tagline}.</div>
              <More>
                <p className="lg-p">{off.description}</p>
              </More>
            </>
          )}
          <div className="lg-meters">
            <Meter label="Pace" value={t.offense.pace} />
            <Meter label="Transition" value={t.offense.transition} />
            <Meter label="3PT emphasis" value={t.offense.threePoint} />
            <Meter label="Rim attack" value={t.offense.rimAttack} />
            <Meter label="Crash boards" value={t.offense.crashBoards} />
          </div>
          <div className="lg-tac-sub over">Play types</div>
          <div className="lg-meters">
            {ACTIONS.map((a) => (
              <Meter key={a} label={ACTION_META[a].label} value={t.offense.actions[a]} color="var(--info)" />
            ))}
          </div>
          {(t.offense.huntMismatch || t.offense.hotHand) && (
            <div className="chips">
              {t.offense.huntMismatch && <span className="tag info">Hunts mismatches</span>}
              {t.offense.hotHand && <span className="tag info">Feeds the hot hand</span>}
            </div>
          )}
        </div>
      </Section>
      <Section
        title={
          <h3>
            <ShieldAlert size={13} aria-hidden="true" /> Defense
          </h3>
        }
      >
        <div className="card lg-tac">
          <div className="lg-tac-name">{def?.name ?? 'Custom'}</div>
          {def && (
            <>
              <div className="lg-tac-line">{def.tagline}.</div>
              <More>
                <p className="lg-p">{def.description}</p>
              </More>
            </>
          )}
          <dl className="lg-kvs">
            <div className="lg-kv">
              <dt>Scheme</dt>
              <dd>{SCHEME_META[t.defense.scheme].label}</dd>
            </div>
            <div className="lg-kv">
              <dt>Ball screens</dt>
              <dd>{COVERAGE_META[t.defense.pnr].label}</dd>
            </div>
            <div className="lg-kv">
              <dt>Press</dt>
              <dd>{PRESS_META[t.defense.press].label}</dd>
            </div>
            <div className="lg-kv">
              <dt>Star plan</dt>
              <dd className="ellipsis">
                {STAR_PLAN_META[t.defense.starPlan].label}
                {star && t.defense.starPlan !== 'none' ? ` · ${shortName(star)}` : ''}
              </dd>
            </div>
          </dl>
          <div className="lg-meters">
            <Meter label="Help in paint" value={t.defense.help} color="var(--warn)" />
            <Meter label="Ball pressure" value={t.defense.pressure} color="var(--warn)" />
            <Meter label="Get back" value={t.defense.getBack} color="var(--warn)" />
            <Meter label="Physicality" value={t.defense.physicality} color="var(--warn)" />
          </div>
          {t.defense.switchOffBall && (
            <div className="chips">
              <span className="tag warn">Switches off the ball</span>
            </div>
          )}
        </div>
      </Section>
      <Section
        title={
          <h3>
            <ClipboardList size={13} aria-hidden="true" /> Coaching staff
          </h3>
        }
      >
        <div className="card lg-tac">
          <div>
            <div className="lg-coach-nm">
              {/* his history: jobs, record, titles (History → Coaches) */}
              {staff ? <Link to={`/history?view=coaches&coach=${staff.id}`}>{coachName}</Link> : coachName}
              <span className="lg-coach-role">Head coach{tid === league.userTid ? ' (you)' : ''}</span>
            </div>
            {staff && <div className="lg-tac-line">{staff.here}</div>}
            {staff?.career && <div className="lg-note">{staff.career}</div>}
          </div>
          <dl className="lg-kvs">
            <div className="lg-kv">
              <dt>Offensive roots</dt>
              <dd>{coachOff?.name ?? '—'}</dd>
            </div>
            <div className="lg-kv">
              <dt>Defensive roots</dt>
              <dd>{coachDef?.name ?? '—'}</dd>
            </div>
            <div className="lg-kv">
              <dt>Practice</dt>
              <dd>{PRACTICE.find((x) => x.id === team.practice)?.label ?? '—'}</dd>
            </div>
          </dl>
          <div className="lg-meters">
            <Meter label="Development" value={team.coach.development} color="var(--good)" />
            <Meter label="Adjustments" value={team.coach.tactics} color="var(--good)" />
          </div>
          <div className="lg-note">Development grows young players; adjustments drive in-game counters.</div>
          {staff && staff.before.length > 0 && <div className="lg-note">Before him: {staff.before.join(' · ')}.</div>}
        </div>
      </Section>
      <Section title="Rotation minutes">
        <div className="card lg-tac">
          {byMin.length === 0 ? (
            <div className="lg-note">No rotation set.</div>
          ) : (
            <div className="lg-meters">
              {byMin.slice(0, 11).map((p, i) => (
                <Link key={p.pid} to={`/player/${p.pid}`} className={`lg-meter lg-min ${i < 5 ? 'start' : ''}`}>
                  <span className="ellipsis">{minNames(p.pid)}</span>
                  <Bar value={team.rotation.minutes[p.pid] ?? 0} max={42} color={i < 5 ? 'var(--text)' : 'var(--text-dim)'} height={5} />
                  <span className="val">{Math.round(team.rotation.minutes[p.pid] ?? 0)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- scouting

function Bullets({ items, tone }: { items: string[]; tone: string }) {
  return (
    <ul className="lg-bullets" style={{ ['--bul' as string]: tone }}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

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
      <Section title={isUser ? 'How opponents see you' : 'Scouting report'}>
        <div className="card lg-scout">
          <p className="lg-scout-sum">{rep.summary}</p>
          {next?.plan && <OppPlanNote league={league} items={next.plan.items} day={next.day} />}
          {!isUser && (
            <div className="lg-scout-act">
              <Link to={`/gameplan/${tid}`} className="btn primary sm">
                <ClipboardList size={15} /> Game plan vs {abbrev}
              </Link>
              <Link to={`/lab?opp=${tid}`} className="btn sm" aria-label={`Test a game plan against ${abbrev} in the Tactics Lab`}>
                <FlaskConical size={15} /> Test in the Lab
              </Link>
            </div>
          )}
        </div>
      </Section>
      <Section
        title={
          <h3>
            <BarChart3 size={13} aria-hidden="true" /> By the numbers
          </h3>
        }
        right={data.enough ? <span className="lg-sec-meta">{scoutSource(data)}</span> : undefined}
      >
        <div className="card lg-tac">
          {data.enough ? (
            <>
              {data.lastSeason && <div className="lg-note">Too few games this season: last season&apos;s numbers.</div>}
              <RankStrip d={data} complexity={complexity} />
              {data.tendencies.length > 0 && <Bullets items={data.tendencies} tone="var(--info)" />}
            </>
          ) : (
            <div className="lg-note">The numbers come in after {SCOUT_MIN_GAMES} games. Until then the report reads their playbook and roster.</div>
          )}
        </div>
      </Section>
      {data.enough && complexity !== 'simple' && data.playTypes.length > 0 && (
        <Section
          title="Play types"
          right={
            <span className="lg-bar-r">
              <span className="lg-sec-meta">
                {data.ptGames} game{data.ptGames === 1 ? '' : 's'}
              </span>
              <Help title="Play types">
                <p className="lg-p">
                  Points per possession by how the possession finished, against the league&apos;s. On their offense, red means they score well; on their defense, that they allow a
                  lot.
                </p>
              </Help>
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
          <PlayTypeTable rows={ptSide === 'off' ? data.playTypes : data.defPlayTypes} defense={ptSide === 'def'} complexity={complexity} />
        </Section>
      )}
      <div className="md-grid2">
        <Section
          title={
            <h3>
              <Swords size={13} aria-hidden="true" /> Offense
            </h3>
          }
        >
          <div className="card lg-tac">
            <Bullets items={rep.offense} tone="var(--info)" />
          </div>
        </Section>
        <Section
          title={
            <h3>
              <ShieldAlert size={13} aria-hidden="true" /> Defense
            </h3>
          }
        >
          <div className="card lg-tac">
            <Bullets items={rep.defense} tone="var(--warn)" />
          </div>
        </Section>
      </div>
      <Section title="Key threats">
        {rep.threats.length === 0 ? (
          <div className="card empty">No standout threats.</div>
        ) : (
          <div className="card flush list">
            {rep.threats.map((th) => {
              const p = league.players[th.pid];
              return (
                <Link key={th.pid} to={`/player/${th.pid}`} className="lg-threat">
                  {p ? <Avatar p={p} /> : <span />}
                  <span className="lg-threat-t">
                    <span className="lr-name">
                      {th.name} {p && <Ovr v={p.ovr} size="sm" />}
                    </span>
                    <span className="lr-meta">{th.why}</span>
                  </span>
                  <ChevronRight size={16} className="dim" />
                </Link>
              );
            })}
          </div>
        )}
      </Section>
      {data.players.length > 0 && (
        <Section title="Key players" right={<span className="lg-sec-meta">{data.lastSeason ? `${seasonLabel(data.season)} numbers` : 'This season'}</span>}>
          <KeyPlayers d={data} complexity={complexity} />
          {data.players.some((p) => p.elsewhere) && <div className="lg-note">Newcomers show their numbers from their last team, without on/off.</div>}
        </Section>
      )}
      <Section
        title={
          <h3>
            <Target size={13} aria-hidden="true" /> {isUser ? 'Weak spots to fix' : 'How to attack them'}
          </h3>
        }
      >
        <div className="card lg-tac">
          {rep.weaknesses.length === 0 ? (
            <div className="lg-note">No obvious weaknesses. Win the possession battle and execute.</div>
          ) : (
            <Bullets items={rep.weaknesses} tone="var(--good)" />
          )}
        </div>
      </Section>
      {!isUser && (
        <Section title={`Head to head with ${abbrev}`}>
          <div className="card lg-tac">
            <HeadToHead league={league} d={data} complexity={complexity} />
          </div>
        </Section>
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
        <div className="card lg-h2h">
          <TeamLogo tid={league.userTid} size={32} decorative />
          <span className="grow">
            <span className="over">
              {me.abbrev} vs {league.teams[tid].abbrev} this season
            </span>
            <span className="lg-h2h-v">
              {h2h.w + h2h.l ? `You are ${h2h.w}-${h2h.l}` : 'No meetings yet'}
              {h2h.next.length ? <span className="dim"> · {h2h.next.length} left</span> : null}
            </span>
          </span>
          <span className="lg-h2h-key">Your games</span>
        </div>
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
      <div className="card lg-strip">
        <Statline
          items={[
            { k: 'Owned', v: owned.length },
            { k: '1st round', v: firsts },
            { k: 'Traded away', v: away.length, color: away.length ? 'var(--warn)' : undefined },
          ]}
        />
      </div>
      <Section title="Picks owned" right={owned.some((d) => proj(d) !== undefined) ? <Help title="Projected picks">{PROJECTION_NOTE}</Help> : undefined}>
        <div className="card flush list">
          {owned.length === 0 ? (
            <div className="empty">No draft picks owned.</div>
          ) : (
            owned.map((d) => {
              const acquired = d.originalTid !== tid;
              const t = slotTag(d);
              return (
                <div key={d.dpid} className="lg-pick">
                  <TeamLogo tid={d.originalTid} size={28} decorative />
                  <span className="lg-pick-t">
                    <span className="lr-name">{pickLabel(league, d)}</span>
                    <span className="lr-meta">
                      {acquired ? `From the ${teamName(league.teams[d.originalTid])}` : 'Own pick'}
                      {/* its protection and any swap on it, in words */}
                      {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                    </span>
                  </span>
                  <span className={`tag ${t.tone}`}>{t.text}</span>
                </div>
              );
            })
          )}
        </div>
      </Section>
      {away.length > 0 && (
        <Section title="Owed to other teams">
          <div className="card flush list">
            {away.map((d) => (
              <Link key={d.dpid} to={`/team/${d.tid}`} className="lg-pick">
                <TeamLogo tid={d.tid} size={28} decorative />
                <span className="lg-pick-t">
                  <span className="lr-name">{pickLabel(league, d)}</span>
                  <span className="lr-meta">
                    Owned by the {teamName(league.teams[d.tid])}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </span>
                </span>
                <ChevronRight size={16} className="dim" />
              </Link>
            ))}
          </div>
        </Section>
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
      <div className="card lg-strip">
        <Statline
          items={[
            { k: 'Record', v: `${w}-${l}`, s: `${seasons.length} season${seasons.length === 1 ? '' : 's'}` },
            { k: 'Playoffs', v: apps },
            { k: 'Titles', v: titles, color: titles ? 'var(--tier-elite)' : undefined },
          ]}
        />
      </div>
      {(team.retired?.length ?? 0) > 0 && (
        <Section title="Retired numbers">
          <RetiredBanners league={league} tid={tid} small />
        </Section>
      )}
      <Section
        title="Season by season"
        right={
          tid === league.userTid ? (
            <Link to="/history" className="card-link" aria-label="Full franchise and league history">
              History <ChevronRight size={14} />
            </Link>
          ) : undefined
        }
      >
        <div className="card flush list">
          {seasons.map((s) => (
            <div key={s.season} className="lg-season">
              <span className="yr">{seasonLabel(s.season)}</span>
              <span className="rec">
                {s.won}-{s.lost}
              </span>
              <span className="sd ellipsis">{s.seed ? `${ordinal(s.seed)} seed` : s.season === league.season && s.won + s.lost === 0 ? 'Not started' : ''}</span>
              <OutcomeTag o={seasonOutcome(league, tid, s)} />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
