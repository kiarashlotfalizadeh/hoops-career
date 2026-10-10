import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { useLeague } from '../../state/store';
import { buildGameReport } from '../../core/analysis/gameReport';
import { Card, Empty, PageHeader, Segmented, Tag } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { CompareBar, FlowChart, ShotChart } from '../components/charts';
import { fmtDate } from '../../core/league/helpers';
import type { GameResult, TeamBox } from '../../core/types';
import { p1, signed } from '../stats';

type Tab = 'report' | 'box' | 'shots' | 'flow' | 'pbp';

export default function GameView() {
  const league = useLeague();
  const { gid } = useParams();
  const g = league.games.find((x) => x.gid === Number(gid));
  const userGame = !!g && (g.home.tid === league.userTid || g.away.tid === league.userTid);
  const report = useMemo(() => (g && userGame && g.impacts ? buildGameReport(league, g) : null), [g, userGame, league]);
  const [tab, setTab] = useState<Tab>(report ? 'report' : 'box');
  if (!g) {
    return (
      <main className="page">
        <PageHeader title="Game" back />
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
  const typeLabel = g.type === 'playoffs' ? 'Playoffs' : g.type === 'playin' ? 'Play-In' : g.type === 'allstar' ? 'All-Star' : 'Regular season';
  return (
    <main className="page">
      <PageHeader title="Game report" back sub={`${typeLabel} · ${fmtDate(g.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' })}${g.att ? ` · Att ${g.att.toLocaleString()}` : ''}`} />
      <Card accent>
        <div className="scorebug">
          <Link to={`/team/${away.tid}`} className="col" style={{ alignItems: 'center', gap: 4 }}>
            <TeamLogo tid={away.tid} size={48} />
            <span className="bold">{away.abbrev}</span>
          </Link>
          <div className="row" style={{ gap: 14 }}>
            <span className="score" style={{ opacity: g.away.pts > g.home.pts ? 1 : 0.55 }}>{g.away.pts}</span>
            <span className="dim small">{g.ot ? `F/${g.ot > 1 ? `${g.ot}OT` : 'OT'}` : 'FINAL'}</span>
            <span className="score" style={{ opacity: g.home.pts > g.away.pts ? 1 : 0.55 }}>{g.home.pts}</span>
          </div>
          <Link to={`/team/${home.tid}`} className="col" style={{ alignItems: 'center', gap: 4 }}>
            <TeamLogo tid={home.tid} size={48} />
            <span className="bold">{home.abbrev}</span>
          </Link>
        </div>
        <QuarterTable g={g} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
      </Card>
      {tabs.length > 1 && <Segmented value={tab} onChange={setTab} options={tabs} />}

      {tab === 'report' && report && (
        <>
          <Card>
            <div className="bold" style={{ fontSize: 16 }}>{report.headline}</div>
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
                          <Lightbulb size={13} style={{ verticalAlign: -2 }} /> {f.advice}
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
                    <span className="dim">{p.userPoss}</span> <b style={{ color: pppColor(p.userPpp, p.userPoss) }}>{p.userPoss ? p.userPpp.toFixed(2) : '-'}</b>
                  </span>
                  <span className="num" style={{ width: 82, textAlign: 'right' }}>
                    <span className="dim">{p.oppPoss}</span> <b style={{ color: pppColor(p.oppPpp, p.oppPoss) }}>{p.oppPoss ? p.oppPpp.toFixed(2) : '-'}</b>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <div className="md-grid2">
            <Card title="Player grades">
              <div className="col" style={{ gap: 6 }}>
                {report.grades.map((gr) => (
                  <Link key={gr.pid} to={`/player/${gr.pid}`} className="row small">
                    <span className={`display bold`} style={{ width: 30, fontSize: 18, color: gr.grade.startsWith('A') ? 'var(--good)' : gr.grade.startsWith('B') ? 'var(--info)' : gr.grade.startsWith('C') ? 'var(--warn)' : 'var(--bad)' }}>{gr.grade}</span>
                    <span className="bold" style={{ width: 96 }}>{league.players[gr.pid]?.lastName}</span>
                    <span className="dim grow ellipsis">{gr.note}</span>
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
                      <span className={`num bold ${l.pm >= 0 ? 'good' : 'bad'}`} style={{ width: 36 }}>{signed(l.pm, 0)}</span>
                      <span className="grow dim2">{l.pids.map((pid) => league.players[pid]?.lastName ?? '?').join(', ')}</span>
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
                  <div key={i} className={`small ${r.side === 'user' ? 'good' : 'bad'}`}>{r.text}</div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'box' && (
        <>
          <BoxTable box={g.away} title={`${away.region} ${away.name}`} pog={g.pog} />
          <BoxTable box={g.home} title={`${home.region} ${home.name}`} pog={g.pog} />
          <Card title="Team comparison" right={<span className="tiny dim">{away.abbrev} · {home.abbrev}</span>}>
            <div className="col" style={{ gap: 10 }}>
              <CompareBar label="FG%" a={(g.away.t.fgm / Math.max(1, g.away.t.fga)) * 100} b={(g.home.t.fgm / Math.max(1, g.home.t.fga)) * 100} />
              <CompareBar label="3P%" a={(g.away.t.tpm / Math.max(1, g.away.t.tpa)) * 100} b={(g.home.t.tpm / Math.max(1, g.home.t.tpa)) * 100} />
              <CompareBar label="Rebounds" a={g.away.t.orb + g.away.t.drb} b={g.home.t.orb + g.home.t.drb} fmt={(v) => String(v)} />
              <CompareBar label="Assists" a={g.away.t.ast} b={g.home.t.ast} fmt={(v) => String(v)} />
              <CompareBar label="Turnovers" a={g.away.t.tov} b={g.home.t.tov} fmt={(v) => String(v)} higherBetter={false} />
              <CompareBar label="Paint pts" a={g.away.extra.paint} b={g.home.extra.paint} fmt={(v) => String(v)} />
              <CompareBar label="Fast break" a={g.away.extra.fastBreak} b={g.home.extra.fastBreak} fmt={(v) => String(v)} />
              <CompareBar label="2nd chance" a={g.away.extra.secondChance} b={g.home.extra.secondChance} fmt={(v) => String(v)} />
              <CompareBar label="Bench pts" a={g.away.extra.bench} b={g.home.extra.bench} fmt={(v) => String(v)} />
            </div>
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
                <ShotChart shots={shots} color={side === 0 ? 'var(--accent)' : '#7dd3fc'} />
                <div className="grid3" style={{ marginTop: 8 }}>
                  {(['rim', 'mid', 'ab3'] as const).map((z) => {
                    const zs = shots.filter((s) => (z === 'ab3' ? s.zone === 'ab3' || s.zone === 'c3' : z === 'mid' ? s.zone === 'mid' || s.zone === 'paint' : s.zone === 'rim'));
                    const m = zs.filter((s) => s.made).length;
                    return (
                      <div key={z} className="kpi">
                        <span className="k">{z === 'rim' ? 'At rim' : z === 'mid' ? 'Paint/Mid' : 'Three'}</span>
                        <span className="v" style={{ fontSize: 18 }}>{m}/{zs.length}</span>
                        <span className="tiny dim">{zs.length ? p1(m / zs.length) : '-'}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'flow' && g.flow && (
        <Card title="Score margin" right={<span className="tiny dim">{home.abbrev} above · {away.abbrev} below</span>}>
          <FlowChart flow={g.flow} colorA={home.colors[0]} colorB={away.colors[0]} height={150} />
          <div className="row between tiny dim">
            <span>Q1</span>
            <span>Q2</span>
            <span>Q3</span>
            <span>Q4</span>
          </div>
          <div className="small dim" style={{ marginTop: 8 }}>
            Largest leads: {home.abbrev} {g.home.extra.biggestLead}, {away.abbrev} {g.away.extra.biggestLead}.
          </div>
        </Card>
      )}

      {tab === 'pbp' && g.pbp && (
        <Card>
          <div className="col" style={{ gap: 6 }}>
            {g.pbp.map((e, i) => (
              <div key={i} className="row top small" style={{ gap: 8, opacity: e.kind === 'sub' ? 0.6 : 1 }}>
                <span className="tiny dim num" style={{ width: 56 }}>Q{e.q} {Math.floor(e.clock / 60)}:{String(Math.floor(e.clock % 60)).padStart(2, '0')}</span>
                <span className="grow" style={{ fontWeight: e.kind === 'period' ? 700 : 400 }}>{e.text}</span>
                <span className="tiny num dim">{e.as}-{e.hs}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}

function pppColor(ppp: number, poss: number) {
  if (!poss) return undefined;
  return ppp >= 1.2 ? 'var(--good)' : ppp < 0.9 ? 'var(--bad)' : undefined;
}

function QuarterTable({ g, abbrevs }: { g: GameResult; abbrevs: Record<number, string> }) {
  const n = Math.max(g.home.quarters.length, g.away.quarters.length);
  const label = (i: number) => (i < 4 ? `${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ''}`);
  return (
    <div className="tablewrap" style={{ marginTop: 12, background: 'transparent', border: 'none' }}>
      <table className="stats">
        <thead>
          <tr>
            <th className="l">Team</th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i}>{label(i)}</th>
            ))}
            <th>T</th>
          </tr>
        </thead>
        <tbody>
          {[g.away, g.home].map((t) => (
            <tr key={t.tid}>
              <td className="l bold">{abbrevs[t.tid] ?? (t === g.away ? 'Away' : 'Home')}</td>
              {Array.from({ length: n }, (_, i) => (
                <td key={i}>{t.quarters[i] ?? '-'}</td>
              ))}
              <td className="bold">{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxTable({ box, title, pog }: { box: TeamBox; title: string; pog?: number }) {
  const rows = box.players.filter((p) => p.min > 0);
  const dnp = box.players.filter((p) => p.min <= 0);
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
                  <Link to={`/player/${p.pid}`}>
                    <span className={p.gs ? 'bold' : ''}>{shortName(p.name)}</span>
                    {p.pid === pog && <span className="tag warn" style={{ marginLeft: 4, height: 16 }}>POG</span>}
                  </Link>
                </td>
                <td>{Math.round(p.min)}</td>
                <td className="bold">{p.pts}</td>
                <td>{p.orb + p.drb}</td>
                <td>{p.ast}</td>
                <td>{p.stl}</td>
                <td>{p.blk}</td>
                <td>{p.tov}</td>
                <td>{p.fgm}-{p.fga}</td>
                <td>{p.tpm}-{p.tpa}</td>
                <td>{p.ftm}-{p.fta}</td>
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
              <td>{box.t.fgm}-{box.t.fga}</td>
              <td>{box.t.tpm}-{box.t.tpa}</td>
              <td>{box.t.ftm}-{box.t.fta}</td>
              <td>{box.t.pf}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {dnp.length > 0 && <div className="tiny dim" style={{ padding: '8px 12px' }}>DNP: {dnp.map((p) => `${shortName(p.name)} (${p.dnp ?? 'Coach'})`).join(', ')}</div>}
    </Card>
  );
}

function shortName(name: string) {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
}
