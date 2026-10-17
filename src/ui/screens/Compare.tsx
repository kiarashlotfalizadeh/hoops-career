// Two players side by side (/compare?a=<pid>&b=<pid>): who each is (team, size, contract, health),
// then the rows a GM weighs one against the other on (the scouting profile, ratings, this season's
// line, career totals and highs, honors), each with its better side lit. Either side can be changed
// through the player picker, and the two can swap sides.
import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, UserPlus } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../../core/types';
import { fmtHeight } from '../../core/ratings';
import { playerName } from '../../core/league/helpers';
import { askingContract, waiverSalary } from '../../core/league/contracts';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Avatar, Bar, Card, Empty, Ovr, PageHeader } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { PlayerPicker } from '../components/PlayerPicker';
import { capSeason, fmtM, openOption, shortSeason } from '../office/common';
import { shortName } from '../league/shared';
import { skillColor, useSkillPercentiles } from '../playerSkills';
import { compareQuery, compareSections, pidParam, rememberComparison, rowView, type CmpSection, type Side } from '../compare';
import './compare.css';

/** His deal as a line and a note: salary and years left, a free agent's asking price, a prospect's board rank. */
function contractOf(league: League, p: Player): { main: string; sub?: string } {
  const yrs = (n: number) => `${n} yr${n === 1 ? '' : 's'}`;
  if (p.tid >= 0) {
    // the season contracts count against (next season's in the offseason), or this one for a contract that's up
    const s = salaryFor(p, capSeason(league)) ? capSeason(league) : league.season;
    const exp = contractExp(p.contract);
    const opt = openOption(league, p);
    if (p.contract.tenDay) return { main: `${fmtM(salaryFor(p, s), 2)}`, sub: '10-day contract' };
    return {
      main: `${fmtM(salaryFor(p, s))} · ${yrs(exp - s + 1)}`,
      sub: p.contract.twoWay ? 'Two-way deal' : `through ${shortSeason(exp)}${opt ? ` · ${opt} option` : ''}`,
    };
  }
  if (p.tid === FREE_AGENT) {
    if (p.waivers) return { main: fmtM(waiverSalary(league, p)), sub: 'On waivers' };
    const ask = askingContract(league, p, league.userTid);
    return { main: `${fmtM(ask.amount)} · ${yrs(ask.years)}`, sub: p.rfa ? `asking · ${league.teams[p.rfa.tid]?.abbrev ?? ''} can match` : 'asking' };
  }
  if (p.tid === DRAFT_PROSPECT) return { main: `#${p.prospect?.rank ?? '—'} on the board`, sub: `${p.draft.year} draft` };
  return { main: '—' };
}

function Head({ league, p, pid, onPick }: { league: League; p: Player | undefined; pid: number | null; onPick: () => void }) {
  if (!p) {
    return (
      <div className="card cmp-head cmp-empty">
        <UserPlus size={22} className="dim" aria-hidden />
        {/* a player pruned from the save leaves his pid behind */}
        <div className="small dim2">{pid === null ? 'No player yet' : 'This player is no longer in the league'}</div>
        <button className="btn sm primary" aria-haspopup="dialog" onClick={onPick}>
          Pick a player
        </button>
      </div>
    );
  }
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const deal = contractOf(league, p);
  const status = p.tid === FREE_AGENT ? (p.rfa ? 'Restricted FA' : 'Free agent') : p.tid === DRAFT_PROSPECT ? 'Prospect' : 'Retired';
  return (
    <div className="card cmp-head">
      <div className="row between top">
        <Avatar p={p} />
        <div className="col" style={{ alignItems: 'center', gap: 2 }}>
          <Ovr v={p.ovr} size="sm" />
          <span className="pot">POT {p.pot}</span>
        </div>
      </div>
      <Link to={`/player/${p.pid}`} className="cmp-name">
        <span className="small dim2 ellipsis">{p.firstName || ' '}</span>
        <span className="ellipsis">{p.lastName}</span>
      </Link>
      <div className="row small" style={{ gap: 6, minWidth: 0 }}>
        {team ? (
          <>
            <TeamLogo tid={team.tid} size={18} decorative />
            <span className="bold ellipsis">{team.abbrev}</span>
          </>
        ) : (
          <span className="dim2 ellipsis">{status}</span>
        )}
      </div>
      <div className="tiny dim2 ellipsis">
        {p.pos} · {playerAge(p, league.season)} yrs · {fmtHeight(p.heightIn)}
      </div>
      <span className="tag info cmp-tag" title={p.archetype}>
        {p.archetype}
      </span>
      <div className="cmp-deal">
        <div className="small bold num ellipsis">{deal.main}</div>
        {deal.sub && <div className="tiny dim ellipsis">{deal.sub}</div>}
      </div>
      {p.injury && (
        <span className="tag bad cmp-tag">
          {p.injury.type} · {p.injury.gamesRemaining}g
        </span>
      )}
      <div className="cmp-foot">
        <button className="btn xs" aria-haspopup="dialog" aria-label={`Change ${playerName(p)} for another player`} onClick={onPick}>
          Change
        </button>
      </div>
    </div>
  );
}

/** One value: the better side's in a pill, with the verdict spelled out for screen readers. */
function Val({ text, win }: { text: string; win: boolean }) {
  return (
    <td className={`cmp-v ${win ? 'win' : ''} ${text === '—' ? 'none' : ''}`}>
      <span className="cmp-n">{text}</span>
      {win && <span className="sr-only"> (better)</span>}
    </td>
  );
}

/** The column headers screen readers announce with each value; drawn by the strip above instead. */
function Heads({ names, mid }: { names: [string, string]; mid?: string }) {
  return (
    <thead>
      <tr>
        <th scope="col">
          <span className="sr-only">{names[0]}</span>
        </th>
        {mid !== undefined && (
          <th scope="col">
            <span className="sr-only">{mid}</span>
          </th>
        )}
        <th scope="col">
          <span className="sr-only">{names[1]}</span>
        </th>
      </tr>
    </thead>
  );
}

function Section({ s, names }: { s: CmpSection; names: [string, string] }) {
  return (
    <Card title={s.title}>
      {s.note && <div className="tiny dim cmp-note">{s.note}</div>}
      {!s.rows.length ? (
        <div className="small dim">{s.empty}</div>
      ) : s.id === 'skills' ? (
        // percentiles as bars that grow out from the middle, the skill above them
        <table className="cmp-t cmp-skills">
          <Heads names={names} />
          <tbody>
            {s.rows.map((r) => {
              const v = rowView(r);
              return (
                <Fragment key={r.key}>
                  <tr className="cmp-sl">
                    <th colSpan={2} scope="colgroup">
                      {r.label}
                    </th>
                  </tr>
                  <tr>
                    {(['a', 'b'] as Side[]).map((side) => {
                      const val = r[side];
                      const text = v[side];
                      return (
                        <td key={side} className={`cmp-bar ${side} ${v.win === side ? 'win' : ''} ${val === null ? 'none' : ''}`}>
                          <div className="cmp-bw">
                            <span className="cmp-n">{text}</span>
                            {v.win === side && <span className="sr-only"> (better)</span>}
                            <span className="cmp-track">{val !== null && <Bar value={val} color={skillColor(val)} height={8} />}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="cmp-t">
          <Heads names={names} mid={s.title} />
          <tbody>
            {s.rows.map((r) => {
              const v = rowView(r);
              return (
                <Fragment key={r.key}>
                  {r.group && (
                    <tr className="cmp-group">
                      <th colSpan={3} scope="colgroup">
                        {r.group}
                      </th>
                    </tr>
                  )}
                  <tr>
                    <Val text={v.a} win={v.win === 'a'} />
                    <th scope="row" className="cmp-l">
                      {r.label}
                    </th>
                    <Val text={v.b} win={v.win === 'b'} />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function Compare() {
  const league = useLeague();
  const [params, setParams] = useSearchParams();
  const ids: Record<Side, number | null> = { a: pidParam(params.get('a')), b: pidParam(params.get('b')) };
  const pa = ids.a !== null ? league.players[ids.a] : undefined;
  const pb = ids.b !== null ? league.players[ids.b] : undefined;
  const [picking, setPicking] = useState<Side | null>(null);
  const pctile = useSkillPercentiles(league);
  const sections = useLeagueMemo(() => compareSections(league, pa, pb, pctile), [league, pa, pb, pctile]);
  // the picker's recent comparisons (this device's)
  useEffect(() => {
    if (pa && pb && pa.pid !== pb.pid) rememberComparison(league.id, pa.pid, pb.pid);
  }, [league.id, pa, pb]);

  // replace, not push: Back leaves the comparison rather than stepping through its changes
  const set = (a: number | null, b: number | null) => setParams(compareQuery(a, b), { replace: true });
  const names: [string, string] = [pa ? playerName(pa) : 'No player', pb ? playerName(pb) : 'No player'];
  const other = picking === 'a' ? pb : picking === 'b' ? pa : undefined;

  return (
    <main className="page cmp-page">
      <PageHeader
        title="Compare"
        sub={pa && pb ? `${pa.lastName} vs ${pb.lastName}` : 'Two players side by side'}
        back
        backTo={pa ? `/player/${pa.pid}` : '/roster'}
        right={
          <button className="btn sm ghost" disabled={ids.a === null && ids.b === null} onClick={() => set(ids.b, ids.a)} aria-label="Swap sides">
            <ArrowLeftRight size={16} /> Swap
          </button>
        }
      />
      <div className="cmp-heads">
        <Head league={league} p={pa} pid={ids.a} onPick={() => setPicking('a')} />
        <Head league={league} p={pb} pid={ids.b} onPick={() => setPicking('b')} />
      </div>
      {pa || pb ? (
        <>
          {/* which side is which, kept in view while the rows scroll by */}
          <div className="cmp-strip" aria-hidden>
            <span className="ellipsis">{pa ? shortName(pa) : '—'}</span>
            <span className="cmp-vs">vs</span>
            <span className="ellipsis">{pb ? shortName(pb) : '—'}</span>
          </div>
          {sections.map((s) => (
            <Section key={s.id} s={s} names={names} />
          ))}
        </>
      ) : (
        <Empty>Pick two players to set them side by side, or open Compare from any player's page.</Empty>
      )}
      <PlayerPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        anchor={other}
        except={[pa?.pid, pb?.pid].filter((x): x is number => x !== undefined)}
        title={other ? `Compare with ${other.lastName}` : 'Pick a player'}
        onPick={(pid) => {
          set(picking === 'a' ? pid : ids.a, picking === 'b' ? pid : ids.b);
          setPicking(null);
        }}
      />
    </main>
  );
}
