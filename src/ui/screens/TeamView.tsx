// Another team's page (/teams/:tid; the user's own team lives in the Team tab): its slab, the two
// things to do with it (its Matchup page, a trade), then Overview, Roster, Schedule, Picks, Moves
// and History. Scouting them lives on the Matchup page.
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, ChevronRight, ClipboardList, Pencil } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { useLeague, useLeagueMemo } from '../../state/store';
import { CAP_FOR, contractSeason, curTeamSeason, fmtDate, payroll, rosterSorted } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { leagueForecast, pct } from '../../core/analysis/odds';
import { nextMeeting } from '../../core/ai/opponentPlan';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { seasonLabel } from '../../core/constants';
import { FRANCHISES } from '../../core/teams';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Bar, Help, Ovr, PageHeader, Section, Segmented, StatTable, Statline, type Col } from '../components/ui';
import { f1, latestLine, ordinal, playerSeason, rosterNames, signed, startingFive, teamRatings, type PerGame } from '../stats';
import { shortSeason, openOption } from '../office/common';
import { OutcomeTag, STRATEGY_META, StrategyTag, TabBar, seasonOutcome, useQueryParam } from '../league/shared';
import { TeamScheduleList } from '../league/Schedule';
import { capPayroll } from '../../core/league/freeAgency';
import { MovesTab } from '../league/MovesTab';
import { PicksList } from '../league/PicksList';
import { FranchiseFigures, FranchiseHistory } from '../league/Franchise';
import { activeCoach, coachCareer, coyWinners } from '../../core/league/coaches';
import { LazyTeamEditor } from '../god/lazy';
import { useBack } from '../nav';
import { slabVars } from '../teamColors';
import { money } from '../../core/format';

const TABS = ['overview', 'roster', 'schedule', 'picks', 'moves', 'history'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { overview: 'Overview', roster: 'Roster', schedule: 'Schedule', picks: 'Picks', moves: 'Moves', history: 'History' };

export default function TeamView() {
  const league = useLeague();
  const params = useParams();
  const tid = Number(params.tid);
  const team = Number.isInteger(tid) ? league.teams[tid] : undefined;
  const [raw, setTab] = useQueryParam<string>('tab', 'overview');
  const [editing, setEditing] = useState(false);
  if (!team) {
    return (
      <main className="page">
        <PageHeader title="Team" back backTo="/league" />
        <div className="card empty">That team does not exist.</div>
      </main>
    );
  }
  // scouting them (and how they play) lives on their Matchup page now
  if (raw === 'scouting' || raw === 'tactics') return <Navigate to={`/games/${tid}`} replace />;
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : 'overview';
  return (
    <main className="page lg-page">
      {editing && league.settings.godMode && <LazyTeamEditor tid={tid} onClose={() => setEditing(false)} />}
      <Hero league={league} tid={tid} onEdit={league.settings.godMode ? () => setEditing(true) : undefined} />
      <Actions league={league} tid={tid} />
      <TabBar value={tab} onChange={setTab} options={TABS.map((id) => ({ id, label: LABEL[id] }))} label="Team sections" />
      {tab === 'overview' && <Overview league={league} tid={tid} onRoster={() => setTab('roster')} />}
      {tab === 'roster' && <RosterTab league={league} tid={tid} />}
      {tab === 'schedule' && <ScheduleTab league={league} tid={tid} />}
      {tab === 'picks' && <PicksList league={league} tid={tid} />}
      {tab === 'moves' && <MovesTab league={league} tid={tid} />}
      {tab === 'history' && (
        <>
          <div className="card lg-strip">
            <FranchiseFigures league={league} tid={tid} />
          </div>
          <FranchiseHistory league={league} tid={tid} />
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- header

/** The team's slab, in its colours: who they are and where they stand. */
function Hero({ league, tid, onEdit }: { league: League; tid: number; onEdit?: () => void }) {
  const goBack = useBack('/league');
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const confRank = useLeagueMemo(() => confStandings(league, team.conf).findIndex((r) => r.tid === tid) + 1, [league, tid, team.conf]);
  const outcome = seasonOutcome(league, tid, ts);
  const confWord = team.conf === 'E' ? 'East' : 'West';
  const arena = FRANCHISES[tid]?.arena;
  const gp = ts.won + ts.lost;
  return (
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
      <div className="lg-team-rec">
        <div className="lg-team-wl num">
          {ts.won}-{ts.lost}
        </div>
        <div className="lg-team-rank">{gp ? `${ordinal(confRank)} in the ${confWord}` : 'No games yet'}</div>
        {outcome.short !== 'Ongoing' && outcome.short !== 'Missed' && (
          <span className="lg-team-tags">
            <OutcomeTag o={outcome} />
          </span>
        )}
      </div>
    </section>
  );
}

/** What to do with them: their Matchup page (scouting, your plan; when you play them next) and a trade. */
function Actions({ league, tid }: { league: League; tid: number }) {
  const next = useLeagueMemo(() => nextMeeting(league, tid), [league, tid]);
  const when = next ? (next.day === league.day ? 'Today' : fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })) : undefined;
  return (
    <div className="lg-team-actions">
      <Link to={`/games/${tid}`} className={`btn ${next ? 'primary' : ''}`} aria-label={`Matchup${when ? `, next game ${when}` : ''}`}>
        <ClipboardList size={17} aria-hidden="true" />
        <span className="lg-act-t">
          Matchup
          {when && <small>{when}</small>}
        </span>
      </Link>
      <Link to={`/office/trade?with=${tid}`} className={`btn ${next ? '' : 'primary'}`}>
        <ArrowLeftRight size={17} aria-hidden="true" /> Trade
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------- overview

/** A league rank among the teams that have played ("4th"). */
function useRatingRanks(league: League, tid: number) {
  return useLeagueMemo(() => {
    const all = league.teams.map((t) => ({ tid: t.tid, ts: curTeamSeason(league, t.tid) })).filter((x) => x.ts.won + x.ts.lost > 0);
    const r = all.map((x) => ({ tid: x.tid, tr: teamRatings(x.ts) }));
    const rank = (key: 'ortg' | 'drtg' | 'net', low = false) => {
      const sorted = [...r].sort((a, b) => (low ? a.tr[key] - b.tr[key] : b.tr[key] - a.tr[key]));
      return sorted.findIndex((x) => x.tid === tid) + 1;
    };
    return { ortg: rank('ortg'), drtg: rank('drtg', true), net: rank('net') };
  }, [league, tid]);
}

/** The season forecast's line for a team: its series in the playoffs, else its projected record and odds. */
function useOutlook(league: League, tid: number): string | null {
  const f = useLeagueMemo(() => leagueForecast(league), [league]);
  if (!f) return null;
  const t = f.teams[tid];
  const series = league.playoffs.find((s) => s.winner === undefined && (s.high === tid || s.low === tid));
  if (series) return `Series vs ${league.teams[series.high === tid ? series.low : series.high].abbrev}: ${pct(t.reach[series.round])} to win it`;
  if (t.out) return league.phase === 'playoffs' || league.phase === 'playin' ? null : 'Eliminated from the playoffs';
  const w = Math.round(t.w);
  const rec = league.phase === 'playin' ? '' : `Projected ${w}-${Math.round(t.w + t.l) - w} · `;
  return `${rec}Playoffs ${pct(t.reach[0], t.clinched)}${t.reach[4] >= 0.01 ? ` · Title ${pct(t.reach[4])}` : ''}${f.preseason ? ' (preseason)' : ''}`;
}

function Overview({ league, tid, onRoster }: { league: League; tid: number; onRoster: () => void }) {
  const team = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const gp = ts.won + ts.lost;
  const tr = teamRatings(ts);
  const ranks = useRatingRanks(league, tid);
  const outlook = useOutlook(league, tid);
  const coach = useLeagueMemo(() => coachLine(league, tid), [league, tid]);
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  const key = [...roster].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  const nameOf = rosterNames(roster);
  const cs = contractSeason(league);
  const pay = payroll(league, tid, cs);
  const cap = CAP_FOR(league, cs);
  const strategy = STRATEGY_META[team.strategy];
  const won = ts.lastTen.filter((x) => x === 1).length;
  return (
    <>
      {gp > 0 && (
        <div className="card lg-strip">
          <Statline
            items={[
              { k: 'Off', v: f1(tr.ortg), s: `${ordinal(ranks.ortg)}` },
              { k: 'Def', v: f1(tr.drtg), s: `${ordinal(ranks.drtg)}` },
              { k: 'Net', v: signed(tr.net), s: `${ordinal(ranks.net)}`, color: tr.net > 0 ? 'var(--good)' : tr.net < 0 ? 'var(--bad)' : undefined },
            ]}
          />
        </div>
      )}
      <div className="card flush list">
        {outlook && (
          <Link to={`/league/standings?view=odds&oconf=${team.conf}`} className="lg-kvl">
            <span className="k">Outlook</span>
            <span className="v">{outlook}</span>
            <ChevronRight size={15} className="dim" aria-hidden="true" />
          </Link>
        )}
        {ts.lastTen.length > 0 && (
          <div className="lg-kvl">
            <span className="k">Form</span>
            <span className="v">
              <span className="lg-form" aria-hidden="true">
                {ts.lastTen.map((x, i) => (
                  <i key={i} className={x ? 'w' : 'l'} />
                ))}
              </span>
              <span>
                {won}-{ts.lastTen.length - won}
                {ts.streak ? ` · ${ts.streak > 0 ? 'W' : 'L'}${Math.abs(ts.streak)}` : ''}
              </span>
              <span className="sr-only">
                in the last {ts.lastTen.length} games{ts.streak ? `, ${ts.streak > 0 ? 'won' : 'lost'} ${Math.abs(ts.streak)} in a row` : ''}
              </span>
            </span>
            <span />
          </div>
        )}
        <Link to={coach ? `/league/history?view=coaches&coach=${coach.id}` : '/league/history?view=coaches'} className="lg-kvl">
          <span className="k">Coach</span>
          <span className="v">
            <span className="bold">{team.coach.name}</span>
            <span className="sub">{coach?.line ?? playbook(team)}</span>
          </span>
          <ChevronRight size={15} className="dim" aria-hidden="true" />
        </Link>
        <div className="lg-kvl">
          <span className="k">Strategy</span>
          <span className="v">
            <StrategyTag team={team} />
            <span className="sub">{strategy.help}</span>
          </span>
          <span />
        </div>
        <button className="lg-kvl" onClick={onRoster} aria-label={`Payroll ${money(pay)}: contracts`}>
          <span className="k">Payroll</span>
          <span className="v">
            <span className="bold num">{money(pay)}</span>
            <span className="sub">
              {cs !== league.season ? `${seasonLabel(cs)} · ` : ''}
              {pay > cap.luxuryTax ? 'Over the tax' : pay > cap.salaryCap ? 'Over the cap' : `${money(cap.salaryCap - pay)} under the cap`}
            </span>
          </span>
          <ChevronRight size={15} className="dim" aria-hidden="true" />
        </button>
      </div>
      {key.length > 0 && (
        <Section title="Key players">
          <div className="card flush">
            {key.map((p) => (
              <PlayerRow key={p.pid} league={league} p={p} name={nameOf(p.pid)} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

const playbook = (team: League['teams'][number]) =>
  `${OFF_PRESETS.find((p) => p.id === team.tactics.offPreset)?.name ?? 'Custom offense'} / ${DEF_PRESETS.find((p) => p.id === team.tactics.defPreset)?.name ?? 'Custom defense'}`;

/** The head coach from the coach registry: since when he's had the job (or when he takes it), and the playbook the team runs. */
function coachLine(league: League, tid: number) {
  const r = activeCoach(league, tid);
  const team = league.teams[tid];
  if (!r) return null;
  const k = coachCareer(league, r, coyWinners(league));
  const here = k.stints.find((j) => !j.stint.to && j.stint.tid === tid);
  const start = here?.lines[0]?.season ?? here?.stint.from ?? league.season;
  const since = start > league.season ? `From ${seasonLabel(start)}` : `Since ${seasonLabel(start)}`;
  return { id: r.id, line: `${since} · ${playbook(team)}` };
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
          { id: 'list', label: 'Players' },
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
            right={g.label === 'Starters' ? <span className="lg-sec-meta">{anyCur ? 'Per game' : anyPast ? 'Latest season, per game' : 'No games yet'}</span> : undefined}
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
          {money(pay)}
        </span>
      </div>
      <Bar value={(pay / (cap.luxuryTax * 1.1)) * 100} color={color} />
      <div className="lg-pay-foot">
        <span>Cap {money(cap.salaryCap)}</span>
        <span>{room > cap.salaryCap ? `${money(room - cap.salaryCap)} over cap${holds}` : `${money(cap.salaryCap - room)} cap space${holds}`}</span>
        <span>Tax {money(cap.luxuryTax)}</span>
      </div>
    </div>
  );
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
              {money(amt)}
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
  // the next seasons' commitments ride on the table's own columns: the payroll bar is this season's
  return (
    <>
      <PayrollBar league={league} tid={tid} />
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.key} onRow={(r) => nav(`/player/${r.pid}`)} />
      <div className="lg-legend">
        <span>{[0, 1, 2, 3].map((i) => `${shortSeason(cs + i)} ${money(payroll(league, tid, cs + i), 0)}`).join(' · ')}</span>
        <span>PO/TO player/team option</span>
        <span>EXT extension starts</span>
        {twoWay && <span>2W two-way, off the cap</span>}
        <Help title="Contracts">
          <p className="lg-p">Payroll counts dead money: salary still owed to players the team released. Two-way contracts don&apos;t count against the cap.</p>
        </Help>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- schedule

function ScheduleTab({ league, tid }: { league: League; tid: number }) {
  const h2h = useLeagueMemo(() => {
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
    const left = league.schedule.filter((g) => !g.played && ((g.home === tid && g.away === league.userTid) || (g.away === tid && g.home === league.userTid))).length;
    return { w, l, left };
  }, [league, tid]);
  const me = league.teams[league.userTid];
  return (
    <>
      <Link to={`/games/${tid}`} className="card lg-h2h">
        <TeamLogo tid={league.userTid} size={32} decorative />
        <span className="grow">
          <span className="over">
            {me.abbrev} vs {league.teams[tid].abbrev} this season
          </span>
          <span className="lg-h2h-v">
            {h2h.w + h2h.l ? `${h2h.w}-${h2h.l}` : 'No meetings yet'}
            {h2h.left ? <span className="dim"> · {h2h.left} to play</span> : null}
          </span>
        </span>
        <span className="lg-h2h-key">Your games</span>
      </Link>
      <TeamScheduleList league={league} tid={tid} h2hTid={league.userTid} />
    </>
  );
}
