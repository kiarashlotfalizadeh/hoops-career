// Two players side by side (/compare?a=<pid>&b=<pid>): who each is (team, size, contract, health),
// then the rows a GM weighs one against the other on, each with its better side lit, in three views:
// Profile (the overview, the scouting profile, honors), Ratings, and Stats (this season, career totals
// and highs). Either side can be changed through the player picker, and the two can swap sides.
import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, UserPlus } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT } from '../../core/types';
import { fmtHeight } from '../../core/ratings';
import { playerName } from '../../core/league/helpers';
import { askingContract, waiverSalary } from '../../core/league/contracts';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { FRANCHISES } from '../../core/teams';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Avatar, Bar, Empty, Help, Ovr, PageHeader, Section, Segmented } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { PlayerPicker } from '../components/PlayerPicker';
import { capSeason, openOption, shortSeason } from '../office/common';
import { skillColor, useSkillPercentiles } from '../playerSkills';
import { identityColor } from '../teamColors';
import { compareQuery, compareSections, pidParam, rememberComparison, rowView, type CmpSection, type Side } from '../compare';
import './compare.css';
import { injuryName, money, outFor } from '../../core/format';

type View = 'profile' | 'ratings' | 'stats';
/** The view each section is in: who they are first, then the ratings, then the numbers. */
const VIEW_OF: Record<CmpSection['id'], View> = { overview: 'profile', skills: 'profile', honors: 'profile', ratings: 'ratings', season: 'stats', career: 'stats', highs: 'stats' };

/** His deal as a line and a note: salary and years left, a free agent's asking price, a prospect's board rank. */
function contractOf(league: League, p: Player): { main: string; sub?: string } {
  const yrs = (n: number) => `${n} yr${n === 1 ? '' : 's'}`;
  if (p.tid >= 0) {
    // the season contracts count against (next season's in the offseason), or this one for a contract that's up
    const s = salaryFor(p, capSeason(league)) ? capSeason(league) : league.season;
    const exp = contractExp(p.contract);
    const opt = openOption(league, p);
    if (p.contract.tenDay) return { main: `${money(salaryFor(p, s), 2)}`, sub: '10-day contract' };
    return {
      main: `${money(salaryFor(p, s))} · ${yrs(exp - s + 1)}`,
      sub: p.contract.twoWay ? 'Two-way deal' : `through ${shortSeason(exp)}${opt ? ` · ${opt} option` : ''}`,
    };
  }
  if (p.tid === FREE_AGENT) {
    if (p.waivers) return { main: money(waiverSalary(league, p)), sub: 'On waivers' };
    const ask = askingContract(league, p, league.userTid);
    return { main: `${money(ask.amount)} · ${yrs(ask.years)}`, sub: p.rfa ? `asking · ${league.teams[p.rfa.tid]?.abbrev ?? ''} can match` : 'asking' };
  }
  if (p.tid === DRAFT_PROSPECT) return { main: `#${p.prospect?.rank ?? '—'} on the board`, sub: `${p.draft.year} draft` };
  return { main: '—' };
}

/** The letters in a name's longest unbreakable run ("Alexander-"): the name is sized so it fits its column whole. */
function longestRun(name: string): number {
  return Math.max(1, ...(name.match(/[^\s-]+-?/g) ?? [name]).map((w) => w.length));
}

/** The colour a side is known by: his team's, or a neutral one for a player without a team. */
function sideColor(league: League, p: Player | undefined): string | undefined {
  if (!p || p.tid < 0) return undefined;
  const colors = league.teams[p.tid]?.colors ?? FRANCHISES[p.tid]?.colors;
  return colors ? identityColor(colors) : undefined;
}

function Head({ league, p, pid, onPick, side }: { league: League; p: Player | undefined; pid: number | null; onPick: () => void; side: Side }) {
  if (!p) {
    return (
      <div className={`card cmp-head cmp-empty ${side}`}>
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
  const edge = sideColor(league, p);
  return (
    <div className={`card cmp-head ${side}`} style={edge ? { ['--cmp-edge' as string]: edge } : undefined}>
      <div className="cmp-top">
        <Avatar p={p} />
        <div className="cmp-ovr">
          <Ovr v={p.ovr} />
          <span className="pot">POT {p.pot}</span>
        </div>
      </div>
      <Link to={`/player/${p.pid}`} className="cmp-name">
        <span className="cmp-first ellipsis">{p.firstName || ' '}</span>
        <span className="cmp-last" style={{ ['--run' as string]: longestRun(p.lastName) }}>
          {p.lastName}
        </span>
      </Link>
      <div className="cmp-team">
        {team ? (
          <>
            <TeamLogo tid={team.tid} size={18} decorative />
            <span className="bold">{team.abbrev}</span>
          </>
        ) : (
          <span className="dim2">{status}</span>
        )}
        <span className="cmp-meta">
          {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)}
        </span>
      </div>
      <span className="tag cmp-tag" title={p.archetype}>
        {p.archetype}
      </span>
      {p.injury && (
        <span className="tag bad cmp-tag">
          {injuryName(p.injury.type)} · {outFor(p.injury.gamesRemaining)}
        </span>
      )}
      <div className="cmp-deal">
        <div className="cmp-deal-m num">{deal.main}</div>
        {deal.sub && <div className="cmp-deal-s">{deal.sub}</div>}
      </div>
      <div className="cmp-foot">
        <button className="btn xs ghost" aria-haspopup="dialog" aria-label={`Change ${playerName(p)} for another player`} onClick={onPick}>
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

function Block({ s, names }: { s: CmpSection; names: [string, string] }) {
  return (
    <Section title={s.title} right={s.note ? <Help title={s.title}>{s.note}</Help> : undefined}>
      <div className="card cmp-card">
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
      </div>
    </Section>
  );
}

export default function Compare() {
  const league = useLeague();
  const [params, setParams] = useSearchParams();
  const ids: Record<Side, number | null> = { a: pidParam(params.get('a')), b: pidParam(params.get('b')) };
  const pa = ids.a !== null ? league.players[ids.a] : undefined;
  const pb = ids.b !== null ? league.players[ids.b] : undefined;
  const [picking, setPicking] = useState<Side | null>(null);
  const [view, setView] = useState<View>('profile');
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
  const edges = [sideColor(league, pa), sideColor(league, pb)];

  return (
    <main className="page cmp-page">
      <PageHeader
        title="Compare"
        sub={pa && pb ? `${pa.lastName} vs ${pb.lastName}` : 'Two players side by side'}
        back
        backTo={pa ? `/player/${pa.pid}` : '/team'}
        right={
          <button className="btn sm ghost" disabled={ids.a === null && ids.b === null} onClick={() => set(ids.b, ids.a)} aria-label="Swap sides">
            <ArrowLeftRight size={16} /> Swap
          </button>
        }
      />
      <div className="cmp-heads">
        <Head league={league} p={pa} pid={ids.a} side="a" onPick={() => setPicking('a')} />
        <span className="cmp-vs-badge" aria-hidden="true">
          VS
        </span>
        <Head league={league} p={pb} pid={ids.b} side="b" onPick={() => setPicking('b')} />
      </div>
      {pa || pb ? (
        <>
          {/* which side is which, kept in view while the rows scroll by */}
          <div className="cmp-strip" aria-hidden>
            {[pa, pb].map((p, i) => (
              <Fragment key={i}>
                {i === 1 && <span className="cmp-vs">vs</span>}
                <span className="cmp-side" style={edges[i] ? { ['--cmp-edge' as string]: edges[i] } : undefined}>
                  {/* last names only: one line that stays small while the rows scroll under it */}
                  <span style={{ ['--run' as string]: p ? longestRun(p.lastName) : 1 }}>{p ? p.lastName : '—'}</span>
                </span>
              </Fragment>
            ))}
          </div>
          <Segmented
            value={view}
            onChange={setView}
            label="Compare"
            options={[
              { id: 'profile', label: 'Profile' },
              { id: 'ratings', label: 'Ratings' },
              { id: 'stats', label: 'Stats' },
            ]}
          />
          {sections
            .filter((s) => VIEW_OF[s.id] === view)
            .map((s) => (
              <Block key={s.id} s={s} names={names} />
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
