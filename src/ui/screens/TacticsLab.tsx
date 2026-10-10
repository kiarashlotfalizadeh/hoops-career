import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Beaker, Check, Play } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { labWorker } from '../../state/labClient';
import type { CandidateResult, LabSide, LabSummary } from '../../core/ai/lab';
import { applyPatch, pairedDelta } from '../../core/ai/lab';
import { counterCandidates, scoutTeam } from '../../core/ai/advisor';
import { ensureRotation, userGameOnDay } from '../../core/league/games';
import { curTeamSeason, teamPlayers } from '../../core/league/helpers';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { IMPACT_TEXT } from '../../core/analysis/gameReport';
import { Card, Chips, Empty, Help, Kpi, PageHeader, Segmented, Spinner, Tag } from '../components/ui';
import { CompareBar } from '../components/charts';
import { TeamLogo } from '../components/TeamLogo';
import { f1, p0, p1, signed } from '../stats';
import { takeLabBaseline } from './labBridge';
import type { League, Tactics } from '../../core/types';

type Mode = 'project' | 'compare' | 'counters';

function sideFor(league: League, tid: number, tactics?: Tactics): LabSide {
  const team = league.teams[tid];
  return { team: { ...team, tactics: tactics ?? team.tactics, seasons: [] }, players: teamPlayers(league, tid).filter((p) => !p.injury) };
}

function defaultOpponent(league: League): number {
  const g = userGameOnDay(league, league.day) ?? league.schedule.filter((x) => !x.played && x.day >= league.day && (x.home === league.userTid || x.away === league.userTid)).sort((a, b) => a.day - b.day)[0];
  if (g) return g.home === league.userTid ? g.away : g.home;
  return league.userTid === 0 ? 1 : 0;
}

export default function TacticsLab() {
  const league = useLeague();
  const [params] = useSearchParams();
  const [baseline] = useState<Tactics | null>(() => (params.get('compare') ? takeLabBaseline() : null));
  const [mode, setMode] = useState<Mode>(baseline ? 'compare' : 'project');
  const [opp, setOpp] = useState<number>(() => Number(params.get('opp') ?? defaultOpponent(league)));
  const [games, setGames] = useState(40);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabSummary | null>(null);
  const [baseResult, setBaseResult] = useState<LabSummary | null>(null);
  const [cands, setCands] = useState<CandidateResult[] | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const user = league.userTid;
  const scout = useMemo(() => scoutTeam(league, opp), [league, opp]);

  useEffect(() => {
    setResult(null);
    setBaseResult(null);
    setCands(null);
  }, [opp, mode, games]);

  const run = async () => {
    setBusy(true);
    try {
      ensureRotation(league, opp);
      const b = sideFor(league, opp);
      const seed = (league.rng ^ (opp * 7919)) >>> 0;
      const w = labWorker();
      if (mode === 'project') {
        setResult(await w.runLab({ a: sideFor(league, user), b, games, seed }));
      } else if (mode === 'compare') {
        const base = baseline ?? league.teams[user].tactics;
        const [r0, r1] = await Promise.all([w.runLab({ a: sideFor(league, user, base), b, games, seed }), w.runLab({ a: sideFor(league, user), b, games, seed })]);
        setBaseResult(r0);
        setResult(r1);
      } else {
        const candidates = counterCandidates(league, user, opp);
        const out = await w.evaluate(sideFor(league, user), b, candidates, Math.max(20, Math.round(games * 0.75)), seed);
        setBaseResult(out.base);
        setCands(out.results);
      }
    } catch (e) {
      console.error(e);
      useStore.getState().toast('The lab hit an error running sims.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const applyCand = (c: CandidateResult) => {
    useStore.getState().mutate((l) => {
      const tm = l.teams[l.userTid];
      tm.tactics = { ...applyPatch(tm.tactics, c.patch), manual: true };
    });
    setApplied((a) => [...a, c.id]);
    useStore.getState().toast(`Applied: ${c.label}`, 'good');
  };

  const oppTeam = league.teams[opp];
  const ts = curTeamSeason(league, opp);
  return (
    <main className="page">
      <PageHeader title="Tactics Lab" back sub="Simulate before you commit: every number below comes from real engine games." />
      <Card title="Opponent" right={<span className="small dim num">{ts.won}-{ts.lost}</span>}>
        <div className="hscroll">
          {league.teams
            .filter((t) => t.tid !== user)
            .sort((a, b) => (a.tid === opp ? -1 : b.tid === opp ? 1 : a.abbrev.localeCompare(b.abbrev)))
            .map((t) => (
              <button key={t.tid} onClick={() => setOpp(t.tid)} className="col" style={{ alignItems: 'center', gap: 2, opacity: t.tid === opp ? 1 : 0.55, minWidth: 48 }}>
                <TeamLogo tid={t.tid} size={t.tid === opp ? 42 : 34} />
                <span className="tiny bold">{t.abbrev}</span>
              </button>
            ))}
        </div>
        <div className="small dim2" style={{ marginTop: 8 }}>
          <b>{oppTeam.region} {oppTeam.name}:</b> {scout.offense[0]} {scout.defense[0]}
        </div>
        {scout.weaknesses.length > 0 && <div className="small" style={{ marginTop: 4 }}><span className="good">Weakness:</span> {scout.weaknesses[0]}</div>}
      </Card>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { id: 'project', label: 'Project' },
          { id: 'compare', label: 'Compare' },
          { id: 'counters', label: 'Counters' },
        ]}
      />
      <div className="small dim">
        {mode === 'project' && 'Your current game plan against this opponent: expected result, shot profile, play types and who gets the ball.'}
        {mode === 'compare' && (baseline ? 'Your tactics before vs after your latest edits, same opponent, same random draws.' : 'Edit something in Tactics, then tap "Compare" there to see before vs after. Without a snapshot, this compares your plan with itself.')}
        {mode === 'counters' && 'The assistant drafts counters for this opponent and tests each one. Apply the ones that move the needle.'}
      </div>
      <div className="row">
        <Chips value={games} onChange={setGames} options={[{ id: 20, label: '20 games' }, { id: 40, label: '40' }, { id: 100, label: '100' }]} />
        <div className="grow" />
        <button className="btn primary" onClick={() => void run()} disabled={busy}>
          {busy ? <Spinner /> : <Play size={16} fill="currentColor" />} Run
        </button>
      </div>

      {busy && (
        <Card>
          <div className="row">
            <Spinner />
            <span className="small dim2">Simulating {mode === 'counters' ? 'several game plans' : `${games} games`} in the background…</span>
          </div>
        </Card>
      )}

      {!busy && !result && !cands && (
        <Empty>
          <Beaker size={28} style={{ opacity: 0.6 }} />
          <div style={{ marginTop: 8 }}>Pick an opponent and run the sims.</div>
        </Empty>
      )}

      {result && mode === 'project' && <Summary r={result} league={league} oppTid={opp} />}
      {result && baseResult && mode === 'compare' && <CompareView before={baseResult} after={result} league={league} />}
      {cands && baseResult && (
        <>
          <Card title="Baseline">
            <div className="grid3">
              <Kpi k="Win %" v={p0(baseResult.winPct)} />
              <Kpi k="Net rtg" v={signed(baseResult.net)} color={baseResult.net >= 0 ? 'var(--good)' : 'var(--bad)'} />
              <Kpi k="Margin" v={signed(baseResult.ptsFor - baseResult.ptsAgainst)} />
            </div>
          </Card>
          <Card title="Counters, ranked" right={<Help title="Reading these numbers">Each candidate is simulated against the same opponent. The change is in net rating (points per 100 possessions) versus your current plan; the ± range is a rough 1-sigma uncertainty, so small edges may be noise. More games mean tighter estimates.</Help>}>
            <div className="col" style={{ gap: 8 }}>
              {cands.map((c) => {
                const good = c.delta > c.se;
                const bad = c.delta < -c.se;
                return (
                  <div key={c.id} className="card tight" style={{ borderColor: good ? 'color-mix(in srgb, var(--good) 45%, transparent)' : undefined }}>
                    <div className="row between">
                      <span className="bold">{c.label}</span>
                      <span className={`display num ${good ? 'good' : bad ? 'bad' : 'dim2'}`} style={{ fontSize: 20 }}>
                        {signed(c.delta)}
                      </span>
                    </div>
                    <div className="small dim2">{c.why}</div>
                    <div className="row between" style={{ marginTop: 6 }}>
                      <span className="tiny dim">± {f1(c.se)} · win {p0(c.winPct)}</span>
                      {applied.includes(c.id) ? (
                        <Tag tone="good"><Check size={12} /> Applied</Tag>
                      ) : (
                        <button className={`btn xs ${good ? 'primary' : ''}`} onClick={() => applyCand(c)}>
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </main>
  );
}

function Summary({ r, league, oppTid }: { r: LabSummary; league: League; oppTid: number }) {
  const me = league.teams[league.userTid];
  const them = league.teams[oppTid];
  const users = Object.entries(r.players)
    .map(([pid, v]) => ({ p: league.players[+pid], ...v }))
    .filter((x) => x.p)
    .sort((a, b) => b.min - a.min);
  const pts = Object.entries(r.playTypes).sort((a, b) => b[1].freq - a[1].freq);
  const impacts = Object.entries(r.impacts)
    .filter(([k]) => IMPACT_TEXT[k])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);
  return (
    <>
      <Card accent>
        <div className="grid3">
          <Kpi k="Win %" v={p0(r.winPct)} />
          <Kpi k="Net rtg" v={signed(r.net)} sub={`± ${f1(r.netSE * 2)}`} color={r.net >= 0 ? 'var(--good)' : 'var(--bad)'} />
          <Kpi k="Score" v={`${Math.round(r.ptsFor)}-${Math.round(r.ptsAgainst)}`} sub={`Pace ${f1(r.pace)}`} />
        </div>
      </Card>
      <Card title="Shot profile" right={<span className="tiny dim">{me.abbrev} vs {them.abbrev}</span>}>
        <div className="col" style={{ gap: 10 }}>
          <CompareBar label="eFG%" a={r.shot.efg * 100} b={r.oppShot.efg * 100} />
          <CompareBar label="Rim rate" a={r.shot.rimRate * 100} b={r.oppShot.rimRate * 100} />
          <CompareBar label="3PA rate" a={r.shot.threeRate * 100} b={r.oppShot.threeRate * 100} />
          <CompareBar label="FT rate" a={r.shot.ftRate * 100} b={r.oppShot.ftRate * 100} />
          <CompareBar label="TOV%" a={r.shot.tov * 100} b={r.oppShot.tov * 100} higherBetter={false} />
          <CompareBar label="ORB%" a={r.shot.orb * 100} b={r.oppShot.orb * 100} />
        </div>
      </Card>
      <Card title="Your play types">
        <div className="col" style={{ gap: 6 }}>
          {pts.map(([k, v]) => (
            <div key={k} className="row small">
              <span className="grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
              <span className="dim num" style={{ width: 48, textAlign: 'right' }}>{p0(v.freq)}</span>
              <span className="num bold" style={{ width: 52, textAlign: 'right', color: v.ppp >= 1.1 ? 'var(--good)' : v.ppp < 0.9 ? 'var(--bad)' : undefined }}>{v.ppp.toFixed(2)}</span>
            </div>
          ))}
          <div className="tiny dim">Share of possessions · points per possession (league average ≈ 1.13).</div>
        </div>
      </Card>
      <Card title="Who gets the ball">
        <div className="col" style={{ gap: 6 }}>
          {users.slice(0, 10).map((u) => (
            <div key={u.p.pid} className="row small">
              <span className="grow ellipsis">{u.p.firstName[0]}. {u.p.lastName}</span>
              <span className="dim num" style={{ width: 44, textAlign: 'right' }}>{f1(u.min)}m</span>
              <span className="num" style={{ width: 44, textAlign: 'right' }}>{f1(u.pts)}</span>
              <span className="num dim2" style={{ width: 52, textAlign: 'right' }}>{p1(u.usg)}</span>
              <span className="num dim2" style={{ width: 52, textAlign: 'right' }}>{p1(u.ts)}</span>
            </div>
          ))}
          <div className="tiny dim">Minutes, points, usage rate, true shooting per game.</div>
        </div>
      </Card>
      {impacts.length > 0 && (
        <Card title="What drives the result">
          <div className="col" style={{ gap: 8 }}>
            {impacts.map(([k, v]) => {
              const tpl = IMPACT_TEXT[k];
              const X = v >= 0 ? me.name : them.name;
              const Y = v >= 0 ? them.name : me.name;
              return (
                <div key={k} className="row top small">
                  <span className={`num bold ${v >= 0 ? 'good' : 'bad'}`} style={{ width: 44 }}>{signed(v)}</span>
                  <div className="grow">
                    <div>{tpl.text(X, Y, '')}</div>
                    {v < 0 && tpl.advice && <div className="tiny dim">{tpl.advice}</div>}
                  </div>
                </div>
              );
            })}
            <div className="tiny dim">Expected points per game from each tactical effect.</div>
          </div>
        </Card>
      )}
    </>
  );
}

function CompareView({ before, after, league }: { before: LabSummary; after: LabSummary; league: League }) {
  const { delta: d, se } = pairedDelta(before, after);
  const verdict = d > se ? 'An improvement' : d < -se ? 'A step back' : 'Too close to call';
  const keys = Array.from(new Set([...Object.keys(before.playTypes), ...Object.keys(after.playTypes)]));
  const players = Object.keys(after.players)
    .map(Number)
    .map((pid) => ({ p: league.players[pid], a: after.players[pid], b: before.players[pid] }))
    .filter((x) => x.p && x.a)
    .sort((x, y) => y.a.min - x.a.min)
    .slice(0, 9);
  return (
    <>
      <Card accent>
        <div className="row between">
          <div>
            <div className="small dim upper bold">Verdict</div>
            <div className="bold" style={{ fontSize: 20 }}>{verdict}</div>
          </div>
          <span className={`display num ${d > se ? 'good' : d < -se ? 'bad' : 'dim2'}`} style={{ fontSize: 34 }}>{signed(d)}</span>
        </div>
        <div className="small dim">Net rating change per 100 possessions (± {f1(se)}).</div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <Kpi k="Win %" v={`${p0(before.winPct)} → ${p0(after.winPct)}`} />
          <Kpi k="Off rtg" v={`${f1(after.ortg)}`} sub={signed(after.ortg - before.ortg)} />
          <Kpi k="Def rtg" v={`${f1(after.drtg)}`} sub={signed(after.drtg - before.drtg)} />
        </div>
      </Card>
      <Card title="Shot profile shift">
        <div className="col" style={{ gap: 10 }}>
          <CompareBar label="eFG% (before / after)" a={before.shot.efg * 100} b={after.shot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
          <CompareBar label="3PA rate" a={before.shot.threeRate * 100} b={after.shot.threeRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
          <CompareBar label="Rim rate" a={before.shot.rimRate * 100} b={after.shot.rimRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
          <CompareBar label="Opp eFG%" a={before.oppShot.efg * 100} b={after.oppShot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" higherBetter={false} />
          <CompareBar label="Opp TOV%" a={before.oppShot.tov * 100} b={after.oppShot.tov * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
        </div>
      </Card>
      <Card title="Play types">
        <div className="col" style={{ gap: 6 }}>
          {keys.map((k) => {
            const b = before.playTypes[k] ?? { freq: 0, ppp: 0 };
            const a = after.playTypes[k] ?? { freq: 0, ppp: 0 };
            return (
              <div key={k} className="row small">
                <span className="grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
                <span className="dim num" style={{ width: 92, textAlign: 'right' }}>{p0(b.freq)} → {p0(a.freq)}</span>
                <span className="num" style={{ width: 92, textAlign: 'right' }}>{b.ppp.toFixed(2)} → {a.ppp.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Touches">
        <div className="col" style={{ gap: 6 }}>
          {players.map(({ p, a, b }) => (
            <div key={p.pid} className="row small">
              <span className="grow ellipsis">{p.lastName}</span>
              <span className="num dim" style={{ width: 96, textAlign: 'right' }}>{b ? p1(b.usg) : '-'} → {p1(a.usg)}</span>
              <span className="num" style={{ width: 70, textAlign: 'right' }}>{f1(a.pts)} pts</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
