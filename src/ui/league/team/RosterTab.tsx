// Another team's Roster: its players as rows (starters, bench, two-way), their stats, and their
// contracts against the cap and the tax.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { League, Player } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { CAP_FOR, contractSeason, payroll, rosterSorted } from '../../../core/league/helpers';
import { capPayroll } from '../../../core/league/freeAgency';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../../core/playerGen';
import { seasonLabel } from '../../../core/constants';
import { money } from '../../../core/format';
import { Avatar, Bar, Help, Ovr, Section, Segmented, StatTable, type Col } from '../../components/ui';
import { f1, latestLine, playerSeason, rosterNames, signed, startingFive, type PerGame } from '../../stats';
import { openOption, shortSeason } from '../../office/common';
import { useQueryParam } from '../shared';

type RosterView = 'list' | 'stats' | 'contracts';

export function RosterTab({ league, tid }: { league: League; tid: number }) {
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

export function PlayerRow({ league, p, name, min }: { league: League; p: Player; name: string; min?: number }) {
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
