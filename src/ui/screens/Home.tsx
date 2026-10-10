import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Eye, FastForward, Mail, Zap } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { curTeamSeason, fmtDate, teamPlayers } from '../../core/league/helpers';
import { userGameOnDay } from '../../core/league/games';
import { confStandings } from '../../core/league/standings';
import { scoutTeam, teamAlerts } from '../../core/ai/advisor';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty, Kpi, Ovr } from '../components/ui';
import { flowActions } from '../flow';
import { useFlowRunner } from '../useFlow';
import { f1, playerSeason, signed, teamRatings } from '../stats';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import type { League } from '../../core/types';

function nextUserGame(league: League) {
  const today = userGameOnDay(league, league.day);
  if (today) return today;
  return league.schedule.filter((g) => !g.played && g.day >= league.day && (g.home === league.userTid || g.away === league.userTid)).sort((a, b) => a.day - b.day)[0];
}

export default function Home() {
  const league = useLeague();
  const nav = useNavigate();
  const run = useFlowRunner();
  const sim = useStore((s) => s.sim);
  const v = useStore((s) => s.v);
  const team = league.teams[league.userTid];
  const ts = curTeamSeason(league, league.userTid);
  const inSeason = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const next = inSeason ? nextUserGame(league) : undefined;
  const oppTid = next ? (next.home === league.userTid ? next.away : next.home) : undefined;
  const scout = useMemo(() => (oppTid !== undefined ? scoutTeam(league, oppTid) : null), [league, oppTid, v]);
  const alerts = useMemo(() => teamAlerts(league, league.userTid), [league, v]);
  const actions = flowActions(league);
  const unread = league.inbox.filter((m) => !m.read).slice(0, 3);
  const conf = useMemo(() => confStandings(league, team.conf), [league, team.conf, v]);
  const myRank = conf.findIndex((r) => r.tid === league.userTid);
  const window = conf.slice(Math.max(0, Math.min(myRank - 3, conf.length - 7)), Math.max(7, Math.min(conf.length, myRank + 4)));
  const roster = teamPlayers(league, league.userTid);
  const leaders = (['pts', 'reb', 'ast'] as const).map((k) => {
    let best: { name: string; v: number; pid: number } | null = null;
    for (const p of roster) {
      const pg = playerSeason(p, league.season);
      if (!pg || pg.gp < 1) continue;
      const val = pg[k];
      if (!best || val > best.v) best = { name: p.lastName, v: val, pid: p.pid };
    }
    return { k, best };
  });
  const recent = league.games.filter((g) => g.season === league.season && (g.home.tid === league.userTid || g.away.tid === league.userTid)).slice(-5).reverse();
  const tr = teamRatings(ts);
  const primary = actions.find((a) => a.primary);

  return (
    <main className="page">
      {league.fired && (
        <Card accent>
          <div className="row">
            <AlertTriangle className="bad" />
            <div className="grow">
              <div className="bold">You have been fired.</div>
              <div className="small dim">Take over another team from Settings to keep playing.</div>
            </div>
            <Link className="btn sm" to="/settings">
              Settings
            </Link>
          </div>
        </Card>
      )}

      {!league.settings.onboarded && <Onboarding />}

      {/* Next game / phase card */}
      {next && oppTid !== undefined ? (
        <Card accent>
          <div className="row between">
            <span className="tag info">{next.type === 'playoffs' ? 'Playoffs' : next.type === 'playin' ? 'Play-In' : `Game ${ts.won + ts.lost + 1}`}</span>
            <span className="small dim">{fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })}{next.day === league.day ? ' · Today' : ''}</span>
          </div>
          <div className="scorebug" style={{ marginTop: 12 }}>
            <div className="col" style={{ alignItems: 'center', gap: 4 }}>
              <TeamLogo tid={next.away} size={54} />
              <div className="bold">{league.teams[next.away].abbrev}</div>
              <div className="tiny dim num">{curTeamSeason(league, next.away).won}-{curTeamSeason(league, next.away).lost}</div>
            </div>
            <div className="display dim" style={{ fontSize: 22 }}>@</div>
            <div className="col" style={{ alignItems: 'center', gap: 4 }}>
              <TeamLogo tid={next.home} size={54} />
              <div className="bold">{league.teams[next.home].abbrev}</div>
              <div className="tiny dim num">{curTeamSeason(league, next.home).won}-{curTeamSeason(league, next.home).lost}</div>
            </div>
          </div>
          {next.seriesId && (() => {
            const s = league.playoffs.find((x) => x.id === next.seriesId);
            return s ? (
              <div className="center small dim2" style={{ marginTop: 8 }}>
                Series: {league.teams[s.high].abbrev} {s.highWins} - {s.lowWins} {league.teams[s.low].abbrev}
              </div>
            ) : null;
          })()}
          {scout && (
            <div className="col" style={{ marginTop: 12, gap: 6 }}>
              <div className="small upper dim bold">Scouting report</div>
              <div className="small dim2">{scout.offense[0]} {scout.defense[0]}</div>
              {scout.threats[0] && (
                <div className="small">
                  <span className="bad">Threat:</span> {scout.threats[0].name}. {scout.threats[0].why}
                </div>
              )}
              {scout.weaknesses[0] && (
                <div className="small">
                  <span className="good">Attack:</span> {scout.weaknesses[0]}
                </div>
              )}
              {league.gamePlan && league.gamePlan.oppTid === oppTid && league.gamePlan.items.length > 0 ? (
                <div className="card tight" style={{ marginTop: 4 }}>
                  <div className="row between">
                    <span className="small bold">Game plan for this opponent</span>
                    <button className="btn xs ghost" onClick={() => useStore.getState().mutate((l) => void (l.gamePlan = null))}>
                      Clear
                    </button>
                  </div>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {league.gamePlan.items.map((it) => (
                      <span key={it.id} className="tag info">{it.label}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <Link to={`/lab?opp=${oppTid}`} className="small" style={{ color: 'var(--accent)', fontWeight: 650 }}>
                Build a game plan in the Tactics Lab →
              </Link>
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            {next.day === league.day ? (
              <>
                <button className="btn primary grow" disabled={!!sim} onClick={() => nav('/live')}>
                  <Eye size={18} /> Watch & coach
                </button>
                <button className="btn grow" disabled={!!sim} onClick={() => void run({ id: 'quick', label: '', cmd: 'quickGame' })}>
                  <FastForward size={18} /> Quick sim
                </button>
              </>
            ) : (
              <button className="btn primary grow" disabled={!!sim} onClick={() => void useStore.getState().simulate({ kind: 'untilUserGame' })}>
                <FastForward size={18} /> Sim to game day
              </button>
            )}
          </div>
        </Card>
      ) : (
        <Card accent title={<h3>{PHASE_LABEL[league.phase]} · {seasonLabel(league.season)}</h3>}>
          {primary && (
            <>
              {primary.sub && <div className="small dim2" style={{ marginBottom: 10 }}>{primary.disabled ?? primary.sub}</div>}
              <button className="btn primary block big" disabled={!!primary.disabled || !!sim} onClick={() => void run(primary)}>
                {primary.label}
              </button>
            </>
          )}
          <div className="row wrap" style={{ marginTop: 10 }}>
            {actions
              .filter((a) => !a.primary)
              .map((a) => (
                <button key={a.id} className="btn sm" disabled={!!a.disabled || !!sim} onClick={() => void run(a)}>
                  {a.label}
                </button>
              ))}
          </div>
        </Card>
      )}

      {inSeason && (
        <div className="grid4">
          <Kpi k="Record" v={`${ts.won}-${ts.lost}`} sub={myRank >= 0 ? `${myRank + 1}${['st', 'nd', 'rd'][myRank] ?? 'th'} in ${team.conf === 'E' ? 'East' : 'West'}` : ''} />
          <Kpi k="Off Rtg" v={f1(tr.ortg)} />
          <Kpi k="Def Rtg" v={f1(tr.drtg)} />
          <Kpi k="Net" v={signed(tr.net)} color={tr.net >= 0 ? 'var(--good)' : 'var(--bad)'} />
        </div>
      )}

      {alerts.length > 0 && (
        <Card title={<h3><Zap size={14} style={{ verticalAlign: -2 }} /> Assistant coach</h3>}>
          <div className="col" style={{ gap: 10 }}>
            {alerts.slice(0, 4).map((a) => (
              <Link key={a.id} to={a.link ?? '/'} className="row top" style={{ gap: 10 }}>
                <span className={`tag ${a.tone === 'bad' ? 'bad' : a.tone === 'alert' ? 'warn' : 'info'}`}>{a.tone === 'bad' ? 'Issue' : 'Tip'}</span>
                <div className="grow">
                  <div className="bold small">{a.title}</div>
                  <div className="small dim">{a.body}</div>
                </div>
                <ChevronRight size={16} className="dim" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="md-grid2">
        <Card title={<h3><Mail size={14} style={{ verticalAlign: -2 }} /> Inbox</h3>} right={<Link className="small dim" to="/inbox">All</Link>}>
          {unread.length === 0 ? (
            <div className="small dim">No new messages.</div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {unread.map((m) => (
                <Link key={m.id} to={m.link ?? '/inbox'} onClick={() => useStore.getState().mutate((l) => { const x = l.inbox.find((y) => y.id === m.id); if (x) x.read = true; })}>
                  <div className="small dim">{m.from}</div>
                  <div className="bold small">{m.subject}</div>
                  <div className="small dim2" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.body}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`${team.conf === 'E' ? 'East' : 'West'} standings`} right={<Link className="small dim" to="/league">Full</Link>}>
          <div className="col" style={{ gap: 4 }}>
            {window.map((r) => (
              <Link key={r.tid} to={`/team/${r.tid}`} className="row" style={{ padding: '4px 0', fontWeight: r.tid === league.userTid ? 750 : 500, color: r.tid === league.userTid ? 'var(--text)' : 'var(--text-2)' }}>
                <span className="num dim" style={{ width: 18 }}>{r.confRank}</span>
                <TeamLogo tid={r.tid} size={22} />
                <span className="grow">{league.teams[r.tid].name}</span>
                <span className="num">{r.won}-{r.lost}</span>
                <span className="num dim small" style={{ width: 34, textAlign: 'right' }}>{r.gb === 0 ? '-' : r.gb.toFixed(1)}</span>
              </Link>
            ))}
          </div>
          {inSeason && <div className="tiny dim" style={{ marginTop: 6 }}>Top 6 qualify for the playoffs; 7-10 go to the play-in.</div>}
        </Card>
      </div>

      <div className="md-grid2">
        <Card title="Team leaders">
          {leaders.every((l) => !l.best) ? (
            <div className="small dim">No games played yet.</div>
          ) : (
            <div className="grid3">
              {leaders.map(({ k, best }) => (
                <Link key={k} to={best ? `/player/${best.pid}` : '/roster'} className="kpi">
                  <span className="k">{k}</span>
                  <span className="v">{best ? f1(best.v) : '-'}</span>
                  <span className="tiny dim ellipsis">{best?.name ?? ''}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card title="Recent games">
          {recent.length === 0 ? (
            <Empty>No games yet.</Empty>
          ) : (
            <div className="col" style={{ gap: 6 }}>
              {recent.map((g) => {
                const home = g.home.tid === league.userTid;
                const us = home ? g.home : g.away;
                const them = home ? g.away : g.home;
                const won = us.pts > them.pts;
                return (
                  <Link key={g.gid} to={`/game/${g.gid}`} className="row">
                    <span className={`tag ${won ? 'good' : 'bad'}`}>{won ? 'W' : 'L'}</span>
                    <span className="small dim" style={{ width: 22 }}>{home ? 'vs' : '@'}</span>
                    <TeamLogo tid={them.tid} size={22} />
                    <span className="grow">{league.teams[them.tid].name}</span>
                    <span className="num bold">{us.pts}-{them.pts}</span>
                    <ChevronRight size={16} className="dim" />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Top of the roster" right={<Link className="small dim" to="/roster">Roster</Link>}>
        <div className="hscroll">
          {[...roster]
            .sort((a, b) => b.ovr - a.ovr)
            .slice(0, 8)
            .map((p) => (
              <Link key={p.pid} to={`/player/${p.pid}`} className="kpi" style={{ minWidth: 112 }}>
                <div className="row between">
                  <Ovr v={p.ovr} size="sm" />
                  <span className="tiny dim">{p.pos}</span>
                </div>
                <span className="bold small ellipsis" style={{ marginTop: 4 }}>{p.lastName}</span>
                <span className="tiny dim ellipsis">{p.archetype}</span>
              </Link>
            ))}
        </div>
      </Card>
    </main>
  );
}

function Onboarding() {
  const steps = [
    { to: '/tactics', title: 'Pick a game plan', body: 'Choose an offensive playbook and defensive identity. Fit scores show what suits your roster; every control explains itself.' },
    { to: '/rotation', title: 'Set the rotation', body: 'Order your depth chart and minute targets. The stint plan shows exactly when each player will be on the floor.' },
    { to: '/lab', title: 'Test it in the Lab', body: 'Simulate dozens of games against any opponent before you commit, and let the assistant find counters.' },
    { to: '/', title: 'Coach games live', body: 'Watch on the court, call timeouts, sub and adjust coverages. After each game, "Why" breaks down what decided it.' },
  ];
  return (
    <Card accent title={<h3>Welcome, coach</h3>} right={<button className="btn xs ghost" onClick={() => useStore.getState().mutate((l) => void (l.settings.onboarded = true))}>Got it</button>}>
      <div className="col" style={{ gap: 10 }}>
        {steps.map((s, i) => (
          <Link key={s.title} to={s.to} className="row top" style={{ gap: 10 }}>
            <span className="display bold" style={{ width: 22, fontSize: 20, color: 'var(--accent)' }}>{i + 1}</span>
            <div className="grow">
              <div className="bold small">{s.title}</div>
              <div className="small dim">{s.body}</div>
            </div>
          </Link>
        ))}
        <div className="tiny dim">Change how deep the coaching controls go (Simple / Advanced / Expert) any time in Settings.</div>
      </div>
    </Card>
  );
}
