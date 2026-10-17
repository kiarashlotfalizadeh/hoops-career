import { useQueryParam } from '../league/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { useLeague } from '../../state/store';
import { buildGameReport, setLineText } from '../../core/analysis/gameReport';
import { Card, Chips, Empty, PageHeader, Segmented, Tag } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { CompareBar, FlowChart, ShotChart, WinProbChart } from '../components/charts';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { cupLabel } from '../../core/league/cup';
import { fmtDate } from '../../core/league/helpers';
import { GAME } from '../../core/constants';
import type { GameResult, League, PbpEntry, TeamBox } from '../../core/types';
import { disciplineMarks, finalLabel, fmtClock, p1, pbpOpacity, periodLabel, rosterNames, signed, wholeMinutes } from '../stats';
import { adviceFor } from '../seasonAnalysis';
import { matchupColors } from '../teamColors';
import { GameRecap } from '../components/GameRecap';
import { HighlightsCard } from '../components/HighlightsCard';
import { AdjustmentsCard } from '../components/AdjustmentsCard';
import { biggestSwings, marginWords, playAt, swingWords, wpSeries, wpText } from '../../core/analysis/winProb';
import { threeStars } from '../../core/analysis/quotes';

type Tab = 'report' | 'box' | 'shots' | 'flow' | 'pbp';

export default function GameView() {
  const league = useLeague();
  const { gid } = useParams();
  const g = league.games.find((x) => x.gid === Number(gid));
  const userGame = !!g && (g.home.tid === league.userTid || g.away.tid === league.userTid);
  const report = useMemo(() => (g && userGame && g.impacts ? buildGameReport(league, g) : null), [g, userGame, league]);
  const userNames = useMemo(() => (g && userGame ? boxNames(league, g.home.tid === league.userTid ? g.home : g.away) : null), [g, userGame, league]);
  const [tab, setTab] = useQueryParam<Tab>('tab', report ? 'report' : 'box', ['report', 'box', 'shots', 'flow', 'pbp']);
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
    ...(report ? [{ id: 'report' as Tab, label: 'Why' }] : []),
    { id: 'box', label: 'Box' },
    ...(g.shots?.length ? [{ id: 'shots' as Tab, label: 'Shots' }] : []),
    ...(g.flow?.length ? [{ id: 'flow' as Tab, label: 'Flow' }] : []),
    ...(g.pbp?.length ? [{ id: 'pbp' as Tab, label: 'PBP' }] : []),
  ];
  // the user's team carries the accent in two-team comparisons, wherever it played (side 0 = home);
  // between two other teams neither side does (the away side wore it, as if it were yours)
  const accentSide = userGame && g.home.tid === league.userTid ? 0 : 1;
  const [awayColor, homeColor] = !userGame
    ? ['var(--text-dim)', 'var(--text-dim)']
    : accentSide === 0
      ? ['var(--text-dim)', 'var(--accent)']
      : ['var(--accent)', 'var(--text-dim)'];
  const flowColors = matchupColors(home.colors, away.colors);
  const typeLabel =
    cupLabel(league, { cup: g.cup, home: g.home.tid, season: g.season }) ?? (g.type === 'playoffs' ? 'Playoffs' : g.type === 'playin' ? 'Play-In' : 'Regular Season');
  return (
    <main className="page">
      <PageHeader
        title="Game report"
        back
        backTo="/"
        sub={`${typeLabel} · ${fmtDate(g.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' })}${g.att ? ` · Att ${g.att.toLocaleString()}` : ''}`}
      />
      <Card accent>
        <div className="scorebug">
          <Link to={`/team/${away.tid}`} className="col" style={{ alignItems: 'center', gap: 4 }}>
            <TeamLogo tid={away.tid} size={48} decorative />
            <span className="bold">{away.abbrev}</span>
          </Link>
          <div className="row" style={{ gap: 14 }}>
            <span className="score" style={{ opacity: g.away.pts > g.home.pts ? 1 : 0.55 }}>
              {g.away.pts}
            </span>
            <span className="dim small">{finalLabel(g.ot)}</span>
            <span className="score" style={{ opacity: g.home.pts > g.away.pts ? 1 : 0.55 }}>
              {g.home.pts}
            </span>
          </div>
          <Link to={`/team/${home.tid}`} className="col" style={{ alignItems: 'center', gap: 4 }}>
            <TeamLogo tid={home.tid} size={48} decorative />
            <span className="bold">{home.abbrev}</span>
          </Link>
        </div>
        <QuarterTable g={g} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
      </Card>
      {userGame && <GameRecap res={g} league={league} report={report} />}
      {userGame && league.reel?.gid === g.gid && <HighlightsCard league={league} res={g} />}
      {tabs.length > 1 && <Segmented value={tab} onChange={setTab} options={tabs} label="Game report sections" />}

      {tab === 'report' && report && (
        <>
          <Card>
            <div className="bold" style={{ fontSize: 16 }}>
              {report.headline}
            </div>
          </Card>
          <Card title="What decided it">
            <div className="col" style={{ gap: 12 }}>
              {report.factors.length === 0 && <div className="small dim">No single factor stood out; this one came down to execution.</div>}
              {report.factors.map((f, i) => (
                <div key={i} className="col" style={{ gap: 4 }}>
                  <div className="row top" style={{ gap: 10 }}>
                    <span className={`display num ${f.pts >= 0 ? 'good' : 'bad'}`} style={{ fontSize: 20, width: 52, flex: 'none' }}>
                      {signed(f.pts)}
                    </span>
                    <div className="grow">
                      <div className="small bold">{f.title}</div>
                      <div className="tiny dim">{f.detail}</div>
                      {f.advice && (
                        <div className="small" style={{ marginTop: 4, color: 'var(--warn)' }}>
                          <Lightbulb size={13} style={{ verticalAlign: -2 }} /> {adviceFor(f.advice, league.settings.complexity)}
                        </div>
                      )}
                    </div>
                    <Tag>{f.category}</Tag>
                  </div>
                </div>
              ))}
              <div className="tiny dim">Expected-point swings from the engine's tactical tracking and the four factors. Positive numbers favored your team.</div>
            </div>
          </Card>
          <AdjustmentsCard g={g} league={league} />
          <Card title="Four factors" right={<span className="tiny dim">You · Them</span>}>
            <div className="col" style={{ gap: 10 }}>
              <CompareBar label="eFG%" a={report.fourFactors.user.efg * 100} b={report.fourFactors.opp.efg * 100} />
              <CompareBar label="Turnover %" a={report.fourFactors.user.tov * 100} b={report.fourFactors.opp.tov * 100} higherBetter={false} />
              <CompareBar label="Off. rebound %" a={report.fourFactors.user.orb * 100} b={report.fourFactors.opp.orb * 100} />
              <CompareBar label="FT / FGA" a={report.fourFactors.user.ftr * 100} b={report.fourFactors.opp.ftr * 100} />
            </div>
          </Card>
          <Card title="Play types" right={<span className="tiny dim">poss · points per possession</span>}>
            <div className="col" style={{ gap: 6 }}>
              <div className="row tiny dim upper bold">
                <span className="grow">Type</span>
                <span style={{ width: 82, textAlign: 'right' }}>You</span>
                <span style={{ width: 82, textAlign: 'right' }}>Them</span>
              </div>
              {report.playTypes.map((p) => (
                <div key={p.key} className="row small">
                  <span className="grow">{p.label}</span>
                  <span className="num" style={{ width: 82, textAlign: 'right' }}>
                    <span className="dim">{p.userPoss}</span> <b style={{ color: pppColor(p.userPpp, p.userPoss) }}>{p.userPoss ? p.userPpp.toFixed(2) : '—'}</b>
                  </span>
                  <span className="num" style={{ width: 82, textAlign: 'right' }}>
                    <span className="dim">{p.oppPoss}</span> <b style={{ color: pppColor(p.oppPpp, p.oppPoss) }}>{p.oppPoss ? p.oppPpp.toFixed(2) : '—'}</b>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          {report.sets.length > 0 && (
            <Card title="Sets" right={<span className="tiny dim">runs · points per possession</span>}>
              <div className="col" style={{ gap: 6 }}>
                {report.sets.map((s) => (
                  <div key={s.id} className="row small" style={{ gap: 8 }}>
                    <span className="grow">{s.name}</span>
                    <span className="num dim2" style={{ textAlign: 'right' }}>
                      {setLineText(s)}
                    </span>
                  </div>
                ))}
                <div className="tiny dim">
                  The possessions each set opened, second chances included. Read by: the run by which their defense had taken a good part of its look away.
                </div>
              </div>
            </Card>
          )}
          <div className="md-grid2">
            <Card title="Player grades">
              <div className="col" style={{ gap: 6 }}>
                {report.grades.map((gr) => (
                  <Link key={gr.pid} to={`/player/${gr.pid}`} className="row small">
                    <span
                      className={`display bold`}
                      style={{
                        width: 30,
                        flex: 'none',
                        fontSize: 18,
                        color: gr.grade.startsWith('A') ? 'var(--good)' : gr.grade.startsWith('B') ? 'var(--info)' : gr.grade.startsWith('C') ? 'var(--warn)' : 'var(--bad)',
                      }}
                    >
                      {gr.grade}
                    </span>
                    {/* name over the line: long names and the minutes no longer get cut off on a phone */}
                    <span className="grow">
                      <span className="bold">{userNames?.(gr.pid) || league.players[gr.pid]?.lastName}</span>
                      <span className="dim tiny" style={{ display: 'block' }}>
                        {gr.note}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
            <Card title="Lineups">
              {report.lineups.length === 0 ? (
                <div className="small dim">No lineup played 3+ minutes together.</div>
              ) : (
                <div className="col" style={{ gap: 8 }}>
                  {report.lineups.map((l, i) => (
                    <div key={i} className="row small top">
                      <span className={`num bold ${l.pm >= 0 ? 'good' : 'bad'}`} style={{ width: 36 }}>
                        {signed(l.pm, 0)}
                      </span>
                      <span className="grow dim2">{l.pids.map((pid) => userNames?.(pid) || '?').join(', ')}</span>
                      <span className="dim tiny num">{l.min.toFixed(0)}m</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          {report.runs.length > 0 && (
            <Card title="Momentum swings">
              <div className="col" style={{ gap: 4 }}>
                {report.runs.map((r, i) => (
                  <div key={i} className="small">
                    <span className={r.side === 'user' ? 'good' : 'bad'}>{r.text}</span>
                    <span className="dim"> · {runContext(g, accentSide, r.startIdx, r.endIdx)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'box' && (
        <>
          {/* (a game of yours has them in its recap) */}
          {!userGame && <StarsCard g={g} league={league} />}
          <BoxTable box={g.away} title={`${away.region} ${away.name}`} pog={g.pog} league={league} />
          <BoxTable box={g.home} title={`${home.region} ${home.name}`} pog={g.pog} league={league} />
          <Card
            title="Team comparison"
            right={
              <span className="tiny dim">
                {away.abbrev} · {home.abbrev}
              </span>
            }
          >
            <TeamComparison g={g} colors={[awayColor, homeColor]} />
          </Card>
        </>
      )}

      {tab === 'shots' && g.shots && (
        <div className="md-grid2">
          {[1, 0].map((side) => {
            const t = side === 0 ? home : away;
            const shots = g.shots!.filter((s) => s.t === side);
            const made = shots.filter((s) => s.made).length;
            return (
              <Card key={side} title={`${t.name} · ${made}/${shots.length}`}>
                <ShotChart shots={shots} color={userGame && side === accentSide ? 'var(--accent)' : '#7dd3fc'} />
                <div className="grid3" style={{ marginTop: 8 }}>
                  {(['rim', 'mid', 'ab3'] as const).map((z) => {
                    const zs = shots.filter((s) => (z === 'ab3' ? s.zone === 'ab3' || s.zone === 'c3' : z === 'mid' ? s.zone === 'mid' || s.zone === 'paint' : s.zone === 'rim'));
                    const m = zs.filter((s) => s.made).length;
                    return (
                      <div key={z} className="kpi">
                        <span className="k">{z === 'rim' ? 'At rim' : z === 'mid' ? 'Paint/Mid' : 'Three'}</span>
                        <span className="v" style={{ fontSize: 18 }}>
                          {m}/{zs.length}
                        </span>
                        <span className="tiny dim">{zs.length ? p1(m / zs.length) : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'flow' && g.flow && <WinProbCard g={g} league={league} side={accentSide} kits={flowColors} />}
      {tab === 'flow' && g.flow && (
        <Card
          title="Score margin"
          right={
            <span className="tiny dim">
              {/* (your team above in your games, as the win probability is) */}
              {(userGame ? accentSide : 0) === 0 ? `${home.abbrev} above · ${away.abbrev} below` : `${away.abbrev} above · ${home.abbrev} below`}
            </span>
          }
        >
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
        </Card>
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
    <Card title="Three stars">
      <div className="col" style={{ gap: 0 }}>
        {stars.map(({ line, tid }, k) => (
          <Link key={line.pid} to={`/player/${line.pid}`} className="row small" style={{ minHeight: 36, gap: 8 }}>
            <span className={`tag ${k === 0 ? 'warn' : ''}`} style={{ flex: 'none' }}>
              {['1st', '2nd', '3rd'][k]} star
            </span>
            <b className="grow ellipsis">{league.players[line.pid] ? `${league.players[line.pid].firstName} ${league.players[line.pid].lastName}` : line.name}</b>
            <span className="dim" style={{ flex: 'none' }}>
              {league.teams[tid]?.abbrev}
            </span>
            <span className="num dim2 nowrap">
              {line.pts} pts · {line.orb + line.drb} reb · {line.ast} ast
            </span>
          </Link>
        ))}
      </div>
    </Card>
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
    <Card title="Win probability" right={<span className="tiny dim">{me} above 50%</span>}>
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
      <div className="col" style={{ gap: 6, marginTop: 10 }}>
        <div className="tiny dim upper bold">Biggest swings</div>
        {swings.length === 0 && <div className="small dim2">No possession moved it 5 points or more.</div>}
        {swings.map((x, k) => (
          <div key={x.at} className="row top small" style={{ gap: 8 }}>
            <span className="bold num" style={{ width: 14, flex: 'none' }}>
              {k + 1}
            </span>
            <span className="grow dim2">{say(x.at)}</span>
            <span className="num nowrap">
              {pct(mine(x.from))} → <b>{pct(mine(x.to))}</b>
            </span>
          </div>
        ))}
        <div className="tiny dim">
          {me} {pct(mine(series[0].wp))} to win at tip-off{g.edge === undefined ? ' (home court alone: this game kept no projection)' : ', from the pre-game projection'}. After
          each possession: the score, the time left{g.flowPoss ? ', who has the ball' : ''} and that projection.
          {g.flowT ? '' : " Possession times weren't kept for this game, so they are spread evenly over each period."}
        </div>
      </div>
    </Card>
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
      <Card>
        <div className="col" style={{ gap: 6 }}>
          {rows.map((e, i) => (
            <div key={i} className="row top small" style={{ gap: 8, opacity: pbpOpacity(e.kind) }}>
              <span className="tiny dim num" style={{ width: 62, flex: 'none' }}>
                {periodLabel(e.q)} {fmtClock(e.clock)}
              </span>
              <span className="grow" style={{ fontWeight: e.kind === 'period' ? 700 : 400 }}>
                {e.text}
              </span>
              <span className="tiny num dim">
                {e.as}-{e.hs}
              </span>
            </div>
          ))}
        </div>
      </Card>
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
    <Card title={title} className="flush">
      <div className="tablewrap" style={{ border: 'none', borderRadius: 0 }}>
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
                    {/* (on a line of their own under the name: tags beside it would widen the pinned column on a phone) */}
                    {disciplineMarks(p).length > 0 && <span className="box-marks">{disciplineMarks(p).join(' · ')}</span>}
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
      {dnp.length > 0 && (
        <div className="tiny dim" style={{ padding: '8px 12px' }}>
          DNP: {dnp.map((p) => `${name(p.pid)} (${dnpLabel(p.dnp ?? "Coach's decision")})`).join(', ')}
        </div>
      )}
      {box.coachTf ? (
        <div className="tiny dim" style={{ padding: '8px 12px' }}>
          Coach: {box.coachTf} technical{box.coachTf === 1 ? '' : 's'}
          {box.coachEj ? ', ejected' : ''}
        </div>
      ) : null}
    </Card>
  );
}
