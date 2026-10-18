import { useQueryParam } from '../league/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { useLeague } from '../../state/store';
import { buildGameReport, setLineText } from '../../core/analysis/gameReport';
import { Chips, Empty, Help, PageHeader, Section, Segmented, Statline, Tag } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { CompareBar, FlowChart, ShotChart, WinProbChart } from '../components/charts';
import { TeamComparison } from '../components/gameBlocks';
import { GAME } from '../../core/constants';
import type { GameResult, League, PbpEntry, TeamBox } from '../../core/types';
import { fmtClock, p1, pbpOpacity, periodLabel, rosterNames, signed, wholeMinutes } from '../stats';
import { matchupColors } from '../teamColors';
import { FinalSlab, GameRecap } from '../components/GameRecap';
import { HighlightsCard } from '../components/HighlightsCard';
import { AdjustmentsCard } from '../components/AdjustmentsCard';
import { biggestSwings, marginWords, playAt, swingWords, wpSeries, wpText } from '../../core/analysis/winProb';
import { threeStars } from '../../core/analysis/quotes';
import '../components/gameday.css';

type Tab = 'recap' | 'report' | 'box' | 'shots' | 'flow' | 'pbp';

export default function GameView() {
  const league = useLeague();
  const { gid } = useParams();
  const g = league.games.find((x) => x.gid === Number(gid));
  const userGame = !!g && (g.home.tid === league.userTid || g.away.tid === league.userTid);
  const report = useMemo(() => (g && userGame && g.impacts ? buildGameReport(league, g) : null), [g, userGame, league]);
  const userNames = useMemo(() => (g && userGame ? boxNames(league, g.home.tid === league.userTid ? g.home : g.away) : null), [g, userGame, league]);
  // your games open on their recap (the result, the stars, the quotes); the Why is a tab away
  const [picked, setTab] = useQueryParam<Tab>('tab', userGame ? 'recap' : 'box', ['recap', 'report', 'box', 'shots', 'flow', 'pbp']);
  if (!g) {
    return (
      <main className="page">
        <PageHeader title="Game" back backTo="/" />
        <Empty>This game is no longer stored. Detailed results are kept for the current season.</Empty>
      </main>
    );
  }
  const home = league.teams[g.home.tid];
  const away = league.teams[g.away.tid];
  const tabs: { id: Tab; label: string }[] = [
    ...(userGame ? [{ id: 'recap' as Tab, label: 'Recap' }] : []),
    ...(report ? [{ id: 'report' as Tab, label: 'Why' }] : []),
    { id: 'box', label: 'Box' },
    ...(g.shots?.length ? [{ id: 'shots' as Tab, label: 'Shots' }] : []),
    ...(g.flow?.length ? [{ id: 'flow' as Tab, label: 'Flow' }] : []),
    ...(g.pbp?.length ? [{ id: 'pbp' as Tab, label: 'PBP' }] : []),
  ];
  // a tab this game doesn't have (a link from another game's report) opens the first it has
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0].id;
  // the user's team carries the accent in two-team comparisons, wherever it played (side 0 = home);
  // between two other teams neither side does (the away side wore it, as if it were yours)
  const accentSide = userGame && g.home.tid === league.userTid ? 0 : 1;
  const [awayColor, homeColor] = !userGame
    ? ['var(--text-dim)', 'var(--text-dim)']
    : accentSide === 0
      ? ['var(--text-dim)', 'var(--accent)']
      : ['var(--accent)', 'var(--text-dim)'];
  const flowColors = matchupColors(home.colors, away.colors);
  return (
    <main className="page gv">
      <PageHeader title="Game report" back backTo="/" />
      <FinalSlab res={g} league={league} />
      {tabs.length > 1 && <Segmented tabs value={tab} onChange={setTab} options={tabs} label="Game report sections" />}

      {tab === 'recap' && userGame && (
        <GameRecap res={g} league={league} report={report} highlights={league.reel?.gid === g.gid ? <HighlightsCard league={league} res={g} /> : undefined} />
      )}

      {tab === 'report' && report && (
        <>
          <p className="gv-headline">{report.headline}</p>
          <Section
            title={
              <h3>
                What decided it
                <Help title="What decided it">
                  <p>Expected-point swings from the engine&apos;s tactical tracking and the four factors.</p>
                  <p>Positive numbers favored your team.</p>
                </Help>
              </h3>
            }
          >
            {report.factors.length === 0 ? (
              <div className="card small dim">No single factor stood out; this one came down to execution.</div>
            ) : (
              <div className="card flush list">
                {report.factors.map((f, i) => (
                  <div key={i} className="gv-factor">
                    <span className={`gv-pts num ${f.pts >= 0 ? 'good' : 'bad'}`}>{signed(f.pts)}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="gv-factor-t">{f.title}</div>
                      <div className="gv-factor-d">{f.detail}</div>
                      {f.advice && (
                        <div className="gv-advice">
                          <Lightbulb size={13} aria-hidden="true" /> {f.advice}
                        </div>
                      )}
                    </div>
                    <Tag>{f.category}</Tag>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <AdjustmentsCard g={g} league={league} />
          <Section title="Four factors" right={<span className="tiny dim">You · Them</span>}>
            <div className="card gv-bars">
              <CompareBar label="eFG%" a={report.fourFactors.user.efg * 100} b={report.fourFactors.opp.efg * 100} />
              <CompareBar label="Turnover %" a={report.fourFactors.user.tov * 100} b={report.fourFactors.opp.tov * 100} higherBetter={false} />
              <CompareBar label="Off. rebound %" a={report.fourFactors.user.orb * 100} b={report.fourFactors.opp.orb * 100} />
              <CompareBar label="FT / FGA" a={report.fourFactors.user.ftr * 100} b={report.fourFactors.opp.ftr * 100} />
            </div>
          </Section>
          <Section title="Play types" right={<span className="tiny dim">poss · per poss</span>}>
            <div className="card flush list">
              <div className="gv-pt gv-pt-h" aria-hidden="true">
                <span className="grow" />
                <span>You</span>
                <span>Them</span>
              </div>
              {report.playTypes.map((p) => (
                <div key={p.key} className="gv-pt">
                  <span className="grow">{p.label}</span>
                  <span className="num">
                    <span className="dim">{p.userPoss}</span> <b style={{ color: pppColor(p.userPpp, p.userPoss) }}>{p.userPoss ? p.userPpp.toFixed(2) : '—'}</b>
                  </span>
                  <span className="num">
                    <span className="dim">{p.oppPoss}</span> <b style={{ color: pppColor(p.oppPpp, p.oppPoss) }}>{p.oppPoss ? p.oppPpp.toFixed(2) : '—'}</b>
                  </span>
                </div>
              ))}
            </div>
          </Section>
          {report.sets.length > 0 && (
            <Section
              title={
                <h3>
                  Sets
                  <Help title="Sets">
                    <p>The possessions each set opened, second chances included.</p>
                    <p>Read by: the run by which their defense had taken a good part of its look away.</p>
                  </Help>
                </h3>
              }
              right={<span className="tiny dim">runs · per poss</span>}
            >
              <div className="card flush list">
                {report.sets.map((s) => (
                  <div key={s.id} className="gv-row">
                    <span className="grow">{s.name}</span>
                    <span className="num dim2">{setLineText(s)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <div className="md-grid2">
            <Section title="Player grades">
              <div className="card flush list">
                {report.grades.map((gr) => (
                  <Link key={gr.pid} to={`/player/${gr.pid}`} className="gv-grade">
                    <span className={`gv-g ${gr.grade[0]}`}>{gr.grade}</span>
                    {/* name over the line: long names and the minutes no longer get cut off on a phone */}
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="gv-grade-n">{userNames?.(gr.pid) || league.players[gr.pid]?.lastName}</span>
                      <span className="gv-grade-l">{gr.note}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Section>
            <Section title="Lineups">
              {report.lineups.length === 0 ? (
                <div className="card small dim">No lineup played 3+ minutes together.</div>
              ) : (
                <div className="card flush list">
                  {report.lineups.map((l, i) => (
                    <div key={i} className="gv-row top">
                      <span className={`gv-pm num ${l.pm >= 0 ? 'good' : 'bad'}`}>{signed(l.pm, 0)}</span>
                      <span className="grow dim2">{l.pids.map((pid) => userNames?.(pid) || '?').join(', ')}</span>
                      <span className="dim tiny num">{l.min.toFixed(0)}m</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
          {report.runs.length > 0 && (
            <Section title="Momentum swings">
              <div className="card flush list">
                {report.runs.map((r, i) => (
                  <div key={i} className="gv-row top">
                    <span className={`gv-run ${r.side === 'user' ? 'good' : 'bad'}`} aria-hidden="true" />
                    <span className="grow">
                      <span className={r.side === 'user' ? 'good' : 'bad'}>{r.text}</span>
                      <span className="dim"> · {runContext(g, accentSide, r.startIdx, r.endIdx)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'box' && (
        <>
          {/* (a game of yours has them in its recap) */}
          {!userGame && <StarsCard g={g} league={league} />}
          <BoxTable box={g.away} title={`${away.region} ${away.name}`} pog={g.pog} league={league} />
          <BoxTable box={g.home} title={`${home.region} ${home.name}`} pog={g.pog} league={league} />
          <Section
            title="Team comparison"
            right={
              <span className="tiny dim">
                {away.abbrev} · {home.abbrev}
              </span>
            }
          >
            <div className="card">
              <TeamComparison g={g} colors={[awayColor, homeColor]} />
            </div>
          </Section>
        </>
      )}

      {tab === 'shots' && g.shots && (
        <div className="md-grid2">
          {[1, 0].map((side) => {
            const t = side === 0 ? home : away;
            const shots = g.shots!.filter((s) => s.t === side);
            const made = shots.filter((s) => s.made).length;
            return (
              <Section
                key={side}
                title={
                  <h3>
                    <TeamLogo tid={t.tid} size={18} decorative /> {t.name}
                  </h3>
                }
                right={
                  <span className="small bold num">
                    {made}/{shots.length}
                  </span>
                }
              >
                <div className="card gv-shots">
                  <ShotChart shots={shots} color={userGame && side === accentSide ? 'var(--accent)' : '#7dd3fc'} />
                  <Statline
                    items={(['rim', 'mid', 'ab3'] as const).map((z) => {
                      const zs = shots.filter((s) => (z === 'ab3' ? s.zone === 'ab3' || s.zone === 'c3' : z === 'mid' ? s.zone === 'mid' || s.zone === 'paint' : s.zone === 'rim'));
                      const m = zs.filter((s) => s.made).length;
                      return { k: z === 'rim' ? 'At rim' : z === 'mid' ? 'Paint/Mid' : 'Three', v: `${m}/${zs.length}`, s: zs.length ? p1(m / zs.length) : '—' };
                    })}
                  />
                </div>
              </Section>
            );
          })}
        </div>
      )}

      {tab === 'flow' && g.flow && <WinProbCard g={g} league={league} side={accentSide} kits={flowColors} />}
      {tab === 'flow' && g.flow && (
        <Section
          title="Score margin"
          right={
            <span className="tiny dim">
              {/* (your team above in your games, as the win probability is) */}
              {(userGame ? accentSide : 0) === 0 ? `${home.abbrev} above · ${away.abbrev} below` : `${away.abbrev} above · ${home.abbrev} below`}
            </span>
          }
        >
          <div className="card">
            <FlowChart
              flow={userGame && accentSide === 1 ? g.flow.map((m) => -m) : g.flow}
              colorA={flowColors[userGame ? accentSide : 0]}
              colorB={flowColors[userGame ? 1 - accentSide : 1]}
              periods={[...Array(4).fill(GAME.quarterSec), ...Array(g.ot).fill(GAME.otSec)]}
              periodStarts={g.flowPeriods}
              height={150}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              Largest leads: {home.abbrev} {g.home.extra.biggestLead}, {away.abbrev} {g.away.extra.biggestLead}.
            </div>
          </div>
        </Section>
      )}

      {tab === 'pbp' && g.pbp && <PlayByPlay pbp={g.pbp} />}
    </main>
  );
}

/** The three stars, both teams: the player of the game first, then the next two by game score. */
function StarsCard({ g, league }: { g: GameResult; league: League }) {
  const stars = threeStars(g);
  if (!stars.length) return null;
  return (
    <Section title="Three stars">
      <div className="card flush list">
        {stars.map(({ line, tid }, k) => (
          <Link key={line.pid} to={`/player/${line.pid}`} className={`gd-star${k === 0 && line.pid === g.pog ? ' pog' : ''}`}>
            <span className="gd-star-n num">{k + 1}</span>
            <span className="grow gd-star-who">
              <span className="gd-star-name ellipsis">{league.players[line.pid] ? `${league.players[line.pid].firstName} ${league.players[line.pid].lastName}` : line.name}</span>
              <span className="gd-star-line num">
                {line.pts} pts · {line.orb + line.drb} reb · {line.ast} ast
              </span>
            </span>
            <span className="gd-star-team">{league.teams[tid]?.abbrev}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/**
 * Win probability over the game, from `side`'s view, with the three biggest swings marked and
 * named (the play itself while the play-by-play is kept, else what it did to the score).
 */
function WinProbCard({ g, league, side, kits }: { g: GameResult; league: League; side: 0 | 1; kits: [string, string] }) {
  const series = useMemo(() => wpSeries(g), [g]);
  if (!series || series.length < 3) return null;
  const abbrevs = [league.teams[g.home.tid].abbrev, league.teams[g.away.tid].abbrev] as const;
  const me = abbrevs[side];
  const mine = (v: number) => (side === 0 ? v : 1 - v);
  const pct = wpText;
  // numbered in the order they happened
  const swings = biggestSwings(series, 3).sort((a, b) => a.at - b.at);
  const say = (at: number) => {
    const p = series[at];
    const prev = series[at - 1];
    // from the side it went for
    const gainer: 0 | 1 = p.wp >= prev.wp ? 0 : 1;
    const m = (x: number) => (gainer === 0 ? x : -x);
    const play = playAt(g, p);
    return `${periodLabel(p.q)} ${fmtClock(p.clock)} · ${play ? play.text.replace(/\.$/, '') : `${abbrevs[gainer]} ${swingWords(m(prev.margin), m(p.margin))}`}`;
  };
  return (
    <Section
      title={
        <h3>
          Win probability
          <Help title="Win probability">
            <p>
              {me} {pct(mine(series[0].wp))} to win at tip-off{g.edge === undefined ? ' (home court alone: this game kept no projection)' : ', from the pre-game projection'}.
            </p>
            <p>After each possession: the score, the time left{g.flowPoss ? ', who has the ball' : ''} and that projection.</p>
            {!g.flowT && <p>Possession times weren&apos;t kept for this game, so they are spread evenly over each period.</p>}
          </Help>
        </h3>
      }
      right={<span className="tiny dim">{me} above 50%</span>}
    >
      <div className="card">
        <WinProbChart
          points={series.map((p) => ({ t: p.t, wp: mine(p.wp) }))}
          periods={[...Array(4).fill(GAME.quarterSec), ...Array(g.ot).fill(GAME.otSec)]}
          color={kits[side]}
          colorOther={kits[1 - side]}
          marks={swings.map((x) => x.at)}
          describe={(i) => {
            const p = series[i];
            return p.i < 0 ? 'Tip-off' : `${periodLabel(p.q)} ${fmtClock(p.clock)} · ${marginWords(me, side === 0 ? p.margin : -p.margin)}`;
          }}
          label={`${me} win probability over the game: ${pct(mine(series[0].wp))} at tip-off${swings.length ? `; biggest swings: ${swings.map((x) => `${say(x.at)}, ${pct(mine(x.from))} to ${pct(mine(x.to))}`).join('; ')}` : ''}`}
          height={140}
        />
        <div className="gv-swings">
          <div className="over">Biggest swings</div>
          {swings.length === 0 && <div className="small dim2">No possession moved it 5 points or more.</div>}
          {swings.map((x, k) => (
            <div key={x.at} className="gv-swing">
              <span className="gv-swing-n num">{k + 1}</span>
              <span className="grow dim2">{say(x.at)}</span>
              <span className="num nowrap">
                {pct(mine(x.from))} → <b>{pct(mine(x.to))}</b>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** When a run happened and the margin it turned, from the user's side: "Q2-Q3, from down 13 to up 4". */
function runContext(g: GameResult, userSide: 0 | 1, start: number, end: number) {
  const flow = g.flow ?? [];
  const margin = (i: number) => (userSide === 0 ? 1 : -1) * (flow[i] ?? 0);
  const says = (m: number) => (m === 0 ? 'tied' : m > 0 ? `up ${m}` : `down ${-m}`);
  const period = (i: number) => (g.flowPeriods ?? []).reduce((q, at, k) => (at <= i ? k + 1 : q), 0);
  // flow[start] is the margin before the run's first possession
  const [a, b] = [period(start + 1), period(end)];
  const when = !a ? '' : a === b ? `${periodLabel(a)}, ` : `${periodLabel(a)}-${periodLabel(b)}, `;
  return `${when}from ${says(margin(start))} to ${says(margin(end))}`;
}

/** A coached game's play-by-play runs to hundreds of lines: one period at a time on request. */
function PlayByPlay({ pbp }: { pbp: PbpEntry[] }) {
  const [q, setQ] = useState(0);
  const periods = Math.max(4, ...pbp.map((e) => e.q));
  const rows = q ? pbp.filter((e) => e.q === q) : pbp;
  return (
    <>
      <Chips
        label="Period"
        value={q}
        onChange={setQ}
        options={[{ id: 0, label: 'All' }, ...Array.from({ length: periods }, (_, i) => ({ id: i + 1, label: periodLabel(i + 1) }))]}
      />
      <div className="card flush list">
        {rows.map((e, i) => (
          <div key={i} className={`gv-pbp${e.kind === 'period' ? ' strong' : ''}`} style={{ opacity: pbpOpacity(e.kind) }}>
            <span className="gv-pbp-when num">
              {periodLabel(e.q)} {fmtClock(e.clock)}
            </span>
            <span className="grow">{e.text}</span>
            <span className="gv-pbp-sc num">
              {e.as}-{e.hs}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function pppColor(ppp: number, poss: number) {
  if (!poss) return undefined;
  return ppp >= 1.2 ? 'var(--good)' : ppp < 0.9 ? 'var(--bad)' : undefined;
}

/** Collision-aware names for one side of a box score (current players by record, others by the stored name). */
function boxNames(league: League, box: TeamBox, initial = false) {
  return rosterNames(
    box.players.map((b) => {
      const p = league.players[b.pid];
      const [first, ...rest] = b.name.split(' ');
      return { pid: b.pid, firstName: p ? p.firstName : rest.length ? first : '', lastName: p ? p.lastName : rest.length ? rest.join(' ') : first };
    }),
    { initial },
  );
}

/** "Injured (Concussion)" reads "Injured: Concussion" inside the DNP list's own parentheses. */
const dnpLabel = (dnp: string) => dnp.replace(/^Injured \((.+)\)$/, 'Injured: $1');

function BoxTable({ box, title, pog, league }: { box: TeamBox; title: string; pog?: number; league: League }) {
  const rows = box.players.filter((p) => p.min > 0);
  const dnp = box.players.filter((p) => p.min <= 0);
  const name = boxNames(league, box, true);
  const min = wholeMinutes(box.players);
  return (
    <Section
      title={
        <h3>
          <TeamLogo tid={box.tid} size={18} decorative /> {title}
        </h3>
      }
      right={<span className="gv-box-pts num">{box.pts}</span>}
    >
      <div className="card flush">
        {/* it scrolls sideways: focusable so a keyboard can scroll it */}
        <div className="tablewrap" tabIndex={0} role="region" aria-label={`${title} box score`} style={{ border: 'none', borderRadius: 0 }}>
          <table className="stats">
            <thead>
              <tr>
                <th className="l sticky">Player</th>
                <th>MIN</th>
                <th>PTS</th>
                <th>REB</th>
                <th>AST</th>
                <th>STL</th>
                <th>BLK</th>
                <th>TO</th>
                <th>FG</th>
                <th>3P</th>
                <th>FT</th>
                <th>PF</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.pid}>
                  <td className="l sticky">
                    {/* the whole name cell is the link, not just the 16px of text */}
                    <Link to={`/player/${p.pid}`} style={{ display: 'block', margin: -8, padding: 8 }}>
                      <span className={p.gs ? 'bold' : ''}>{name(p.pid)}</span>
                      {p.pid === pog && (
                        <span className="tag warn" style={{ marginLeft: 4, height: 16 }}>
                          POG
                        </span>
                      )}
                    </Link>
                  </td>
                  <td>{min(p.pid)}</td>
                  <td className="bold">{p.pts}</td>
                  <td>{p.orb + p.drb}</td>
                  <td>{p.ast}</td>
                  <td>{p.stl}</td>
                  <td>{p.blk}</td>
                  <td>{p.tov}</td>
                  <td>
                    {p.fgm}-{p.fga}
                  </td>
                  <td>
                    {p.tpm}-{p.tpa}
                  </td>
                  <td>
                    {p.ftm}-{p.fta}
                  </td>
                  <td>{p.pf}</td>
                  <td className={p.pm > 0 ? 'good' : p.pm < 0 ? 'bad' : ''}>{p.pm > 0 ? `+${p.pm}` : p.pm}</td>
                </tr>
              ))}
              <tr>
                <td className="l sticky bold">Team</td>
                <td />
                <td className="bold">{box.pts}</td>
                <td>{box.t.orb + box.t.drb}</td>
                <td>{box.t.ast}</td>
                <td>{box.t.stl}</td>
                <td>{box.t.blk}</td>
                <td>{box.t.tov}</td>
                <td>
                  {box.t.fgm}-{box.t.fga}
                </td>
                <td>
                  {box.t.tpm}-{box.t.tpa}
                </td>
                <td>
                  {box.t.ftm}-{box.t.fta}
                </td>
                <td>{box.t.pf}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {dnp.length > 0 && <div className="gv-dnp">DNP: {dnp.map((p) => `${name(p.pid)} (${dnpLabel(p.dnp ?? "Coach's decision")})`).join(', ')}</div>}
      </div>
    </Section>
  );
}
