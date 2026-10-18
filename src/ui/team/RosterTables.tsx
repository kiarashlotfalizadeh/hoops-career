// A roster's tables, the same for your team (Team → Roster) and any other (/teams/:tid): every
// rating, every per-game figure, and the contracts season by season (with dead money, options and
// extensions marked, and each season's payroll under the table). Rows open the player's page.
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { CAP_FOR, contractSeason, payroll } from '../../core/league/helpers';
import { capPayroll } from '../../core/league/freeAgency';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { seasonLabel } from '../../core/constants';
import { money } from '../../core/format';
import { Bar, Ovr, StatTable, pct, type Col } from '../components/ui';
import { Term } from '../components/Glossary';
import { OvrKey } from '../components/OvrKey';
import { ratingCols, RatingKey } from '../ratingCols';
import { f1, rosterNames, signed, type PerGame } from '../stats';
import { openOption, shortSeason } from '../office/common';
import { rosterLines } from './RosterList';

/** The sticky first column, narrow so more columns fit a phone: his last name (with as much of the first as tells teammates apart) and position. */
function nameCol<T>(player: (r: T) => Player | undefined, name: (r: T) => string, extra?: (r: T) => ReactNode): Col<T> {
  return {
    key: 'name',
    label: 'Player',
    left: true,
    sticky: true,
    get: (r) => player(r)?.lastName ?? name(r),
    fmt: (_, r) => (
      <span className="lg-pcell tm-ncell">
        {/* (held together at its spaces: a long name wraps only at a hyphen) */}
        <span className="n">{name(r).replace(/ /g, '\u00a0')}</span>
        {player(r) && <span className="tiny dim">{player(r)!.pos}</span>}
        {extra?.(r)}
      </span>
    ),
  };
}

export function RosterRatings({ league, roster }: { league: League; roster: Player[] }) {
  const nav = useNavigate();
  const nameOf = useMemo(() => rosterNames(roster), [roster]);
  const cols = useMemo(
    () => [
      nameCol<Player>(
        (p) => p,
        (p) => nameOf(p.pid),
      ),
      { key: 'age', label: 'Age', get: (p: Player) => playerAge(p, league.season) },
      ...ratingCols((p: Player) => p),
    ],
    [nameOf, league.season],
  );
  return (
    <>
      <StatTable rows={roster} cols={cols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} />
      <div className="tm-foot row between wrap top">
        <RatingKey />
        <OvrKey />
      </div>
    </>
  );
}

export function RosterStats({ league, roster }: { league: League; roster: Player[] }) {
  const nav = useNavigate();
  const nameOf = useMemo(() => rosterNames(roster), [roster]);
  const { lines, current, any } = rosterLines(league, roster);
  // a player without a line reads "—" and sorts last; a percentage needs an attempt
  const stat = (p: Player, k: keyof PerGame) => lines.get(p.pid)?.[k] ?? -Infinity;
  const pctOf = (p: Player, k: 'fgPct' | 'tpPct' | 'ftPct' | 'tsPct', attempts: (l: PerGame) => number) => {
    const l = lines.get(p.pid);
    return l && attempts(l) ? l[k] : -Infinity;
  };
  const pc = (v: number | string) => pct(v as number);
  const cols: Col<Player>[] = [
    nameCol(
      (p) => p,
      (p) => nameOf(p.pid),
    ),
    { key: 'gp', label: 'GP', get: (p) => lines.get(p.pid)?.gp ?? 0 },
    { key: 'min', label: 'MIN', get: (p) => stat(p, 'min'), fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (p) => stat(p, 'pts'), fmt: (v) => <b>{f1(v as number)}</b> },
    { key: 'reb', label: 'REB', get: (p) => stat(p, 'reb'), fmt: (v) => f1(v as number) },
    { key: 'ast', label: 'AST', get: (p) => stat(p, 'ast'), fmt: (v) => f1(v as number) },
    { key: 'stl', label: 'STL', get: (p) => stat(p, 'stl'), fmt: (v) => f1(v as number) },
    { key: 'blk', label: 'BLK', get: (p) => stat(p, 'blk'), fmt: (v) => f1(v as number) },
    { key: 'tov', label: 'TOV', get: (p) => stat(p, 'tov'), fmt: (v) => f1(v as number) },
    // the % lives in the header, as in the league stats
    { key: 'fg', label: 'FG%', get: (p) => pctOf(p, 'fgPct', (l) => l.fga), fmt: pc },
    { key: 'tp', label: '3P%', get: (p) => pctOf(p, 'tpPct', (l) => l.tpa), fmt: pc },
    { key: 'ft', label: 'FT%', get: (p) => pctOf(p, 'ftPct', (l) => l.fta), fmt: pc },
    { key: 'ts', label: 'TS%', get: (p) => pctOf(p, 'tsPct', (l) => l.fga + l.fta), fmt: pc, help: 'True shooting: points per shot attempt, counting threes and free throws' },
    { key: 'usg', label: 'USG%', get: (p) => stat(p, 'usg'), fmt: pc, help: 'Usage: share of team possessions he finishes while on the floor' },
    {
      key: 'pm',
      label: '+/-',
      get: (p) => stat(p, 'pm'),
      fmt: (v) => <span className={(v as number) > 0 ? 'good' : (v as number) < 0 ? 'bad' : ''}>{signed(v as number)}</span>,
      help: 'Plus-minus a game',
    },
    // imported seasons carry no on-court tracking
    {
      key: 'on',
      label: 'ON NET',
      get: (p) => (current ? stat(p, 'onOff') : -Infinity),
      fmt: (v) => signed(v as number),
      help: 'Net rating with him on the floor, per 100 possessions',
    },
  ];
  return (
    <>
      <StatTable rows={roster} cols={cols} rowKey={(p) => p.pid} onRow={(p) => nav(`/player/${p.pid}`)} initialSort="pts" />
      <div className="tm-foot">
        {current ? 'Per game this season.' : any ? 'No games yet: each player’s latest season, per game.' : 'No games played yet.'} Tap for what they are: <Term id="ts">TS%</Term>{' '}
        · <Term id="usage">USG%</Term> · <Term id="onnet">ON NET</Term>.
      </div>
    </>
  );
}

/** Payroll against the cap and the tax, for the season contracts count against (next season in the offseason). */
export function PayrollBar({ league, tid }: { league: League; tid: number }) {
  const cs = contractSeason(league);
  const pay = payroll(league, tid, cs);
  // during the draft and re-signing window, the players a team will keep hold cap room
  const room = capPayroll(league, tid, cs);
  const holds = room > pay ? ' after holds' : '';
  const cap = CAP_FOR(league, cs);
  const color = pay > cap.luxuryTax ? 'var(--bad)' : pay > cap.salaryCap ? 'var(--warn)' : 'var(--good)';
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

/** The contracts table: four seasons from the one payroll counts (next season once this one is over), each season's payroll under it. */
export function RosterContracts({ league, tid, roster }: { league: League; tid: number; roster: Player[] }) {
  const nav = useNavigate();
  const cs = contractSeason(league);
  const mine = tid === league.userTid;
  // names are worked out with the rows, so a new arrival never shows a blank one
  const rows = useLeagueMemo(() => {
    const players = [...roster].sort((a, b) => salaryFor(b, cs) - salaryFor(a, cs));
    const nameOf = rosterNames(players);
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
  }, [league, tid, cs, roster]);
  const cols = useMemo<Col<ContractRow>[]>(
    () => [
      nameCol<ContractRow>(
        (r) => r.p,
        (r) => r.name,
        (r) => (r.p?.contract.twoWay ? <span className="tag">2W</span> : !r.p ? <span className="tiny dim">dead money</span> : null),
      ),
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
      { key: 'exp', label: 'Exp', get: (r) => (r.p ? contractExp(r.p.contract) : -1), fmt: (x, r) => (r.p ? shortSeason(x as number) : ''), help: 'The last season of his deal' },
    ],
    [league, cs],
  );
  const twoWay = rows.some((r) => r.p?.contract.twoWay);
  return (
    <>
      {/* your own payroll is on Team's header, in full in the Office: another team's gets its bar here */}
      {!mine && <PayrollBar league={league} tid={tid} />}
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.key} onRow={(r) => nav(`/player/${r.pid}`)} />
      <div className="tm-foot lg-legend">
        {/* the seasons after this one: this one's payroll is on the header (yours) or the bar above (theirs) */}
        <span className="num">Committed {[1, 2, 3].map((i) => `${shortSeason(cs + i)} ${money(payroll(league, tid, cs + i))}`).join(' · ')}</span>
        <span>
          <Term id="options">PO / TO</Term> player / team option
        </span>
        <span>
          <Term id="extension">EXT</Term> extension starts
        </span>
        {twoWay && (
          <span>
            <Term id="twoway">2W</Term> two-way, off the cap
          </span>
        )}
        {rows.some((r) => !r.p) && (
          <span>
            <Term id="dead">Dead money</Term> counts on the cap
          </span>
        )}
        {mine && (
          <Link to="/office" className="card-link">
            Cap sheet <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </>
  );
}
