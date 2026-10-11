import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Beaker, Check, Play } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { progressCallback, resetLab, withLab } from '../../state/labClient';
import type { CandidateResult, LabSide, LabSummary } from '../../core/ai/lab';
import { applyPatch, pairedDelta } from '../../core/ai/lab';
import { counterCandidates, scoutTeam } from '../../core/ai/advisor';
import { buildSimInput, ensureRotation, userGameOnDay } from '../../core/league/games';
import { curTeamSeason } from '../../core/league/helpers';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { IMPACT_TEXT } from '../../core/analysis/gameReport';
import { Card, Chips, Empty, Help, Kpi, PageHeader, Segmented, Sheet, Spinner, Tag } from '../components/ui';
import { CompareBar } from '../components/charts';
import { TeamLogo } from '../components/TeamLogo';
import { f1, p0, p1, rosterNames, signed } from '../stats';
import { adviceFor } from '../seasonAnalysis';
import { takeLabBaseline } from './labBridge';
import type { League, Tactics } from '../../core/types';

type Mode = 'project' | 'compare' | 'counters';

/** A verdict needs the change to clear two standard errors (about a 95% interval). */
const SIGMAS = 2;

/**
 * A lab side is built like a real game's: the game plan for this opponent on top of the tactics,
 * and injured players kept on the roster so the engine hands their minutes down the bench.
 */
function sideFor(league: League, tid: number, opp: number, tactics?: Tactics): LabSide {
  const view = tactics ? { ...league, teams: league.teams.map((t) => (t.tid === tid ? { ...t, tactics } : t)) } : league;
  const input = buildSimInput(view, tid, league.day, 'regular', opp);
  return { team: { ...input.team, seasons: [] }, players: input.players };
}

function defaultOpponent(league: League): number {
  const g =
    userGameOnDay(league, league.day) ??
    league.schedule.filter((x) => !x.played && x.day >= league.day && (x.home === league.userTid || x.away === league.userTid)).sort((a, b) => a.day - b.day)[0];
  if (g) return g.home === league.userTid ? g.away : g.home;
  return league.userTid === 0 ? 1 : 0;
}

/** What a finished run was for: results only show, and only apply, for the matchup they simulated. */
interface Run {
  opp: number;
  mode: Mode;
  result?: LabSummary;
  base?: LabSummary;
  cands?: CandidateResult[];
}

export default function TacticsLab() {
  const league = useLeague();
  const [params] = useSearchParams();
  const [baseline] = useState<Tactics | null>(() => (params.get('compare') ? takeLabBaseline() : null));
  const [mode, setMode] = useState<Mode>(baseline ? 'compare' : 'project');
  const [opp, setOpp] = useState<number>(() => Number(params.get('opp') ?? defaultOpponent(league)));
  const [games, setGames] = useState(40);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(1);
  const [run, setRun] = useState<Run | null>(null);
  const [replace, setReplace] = useState<CandidateResult | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // leaving mid-run stops the worker so the next visit isn't queued behind stale sims
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (busyRef.current) resetLab();
    };
  }, []);
  const [applied, setApplied] = useState<string[]>([]);
  const user = league.userTid;
  const scout = useMemo(() => scoutTeam(league, opp), [league, opp]);
  const plan = league.gamePlan && league.gamePlan.oppTid === opp && league.gamePlan.items.length ? league.gamePlan : null;
  const noBaseline = mode === 'compare' && !baseline;

  useEffect(() => {
    setRun(null);
  }, [opp, mode, games]);

  const start = async () => {
    setBusy(true);
    const job: Run = { opp, mode };
    try {
      useStore.getState().mutate((l) => {
        ensureRotation(l, user);
        ensureRotation(l, opp);
      }, false);
      const b = sideFor(league, opp, user);
      const seed = (league.rng ^ (opp * 7919)) >>> 0;
      // progress across parallel runs: each run reports its own count, the bar shows the sum
      const done: number[] = [];
      const track = (slot: number) =>
        progressCallback((n) => {
          done[slot] = n;
          if (mounted.current) setProgress(done.reduce((a, x) => a + (x ?? 0), 0));
        });
      setProgress(0);
      await withLab(async (w) => {
        if (mode === 'project') {
          setTotal(games);
          job.result = await w.runLab({ a: sideFor(league, user, opp), b, games, seed }, track(0));
        } else if (mode === 'compare' && baseline) {
          setTotal(games * 2);
          [job.base, job.result] = await Promise.all([
            w.runLab({ a: sideFor(league, user, opp, baseline), b, games, seed }, track(0)),
            w.runLab({ a: sideFor(league, user, opp), b, games, seed }, track(1)),
          ]);
        } else if (mode === 'counters') {
          const candidates = counterCandidates(league, user, opp);
          const n = Math.max(20, Math.round(games * 0.75));
          setTotal(n * (candidates.length + 1));
          const out = await w.evaluate(sideFor(league, user, opp), b, candidates, n, seed, track(0));
          job.base = out.base;
          job.cands = out.results;
        }
      });
      if (mounted.current) setRun(job);
    } catch (e) {
      console.error(e);
      if (mounted.current) useStore.getState().toast(`The lab could not finish: ${e instanceof Error ? e.message : 'unknown error'}`, 'bad');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const applyCand = (c: CandidateResult, scope: 'game' | 'always', vs: number) => {
    useStore.getState().mutate((l) => {
      if (scope === 'always') {
        const tm = l.teams[l.userTid];
        tm.tactics = { ...applyPatch(tm.tactics, c.patch), manual: true };
      } else {
        const gp = l.gamePlan && l.gamePlan.oppTid === vs ? l.gamePlan : { oppTid: vs, items: [] };
        gp.items = [...gp.items.filter((x) => x.id !== c.id), { id: c.id, label: c.label, patch: c.patch }];
        l.gamePlan = gp;
      }
    });
    setApplied((a) => [...a, c.id]);
    useStore.getState().toast(scope === 'game' ? `Game plan vs ${league.teams[vs].abbrev}: ${c.label}` : `Applied to your tactics: ${c.label}`, 'good');
  };
  // "This game" keeps one plan: confirm before it replaces the one for a different opponent
  const planOther = league.gamePlan && league.gamePlan.items.length && league.gamePlan.oppTid !== run?.opp ? league.gamePlan : null;

  const oppTeam = league.teams[opp];
  const ts = curTeamSeason(league, opp);
  const shown = run && run.opp === opp && run.mode === mode ? run : null;
  return (
    <main className="page">
      <PageHeader title="Tactics Lab" back backTo="/tactics" sub="Simulate before you commit: every number below comes from real engine games." />
      <Card
        title="Opponent"
        right={
          <span className="small dim num">
            {ts.won}-{ts.lost}
          </span>
        }
      >
        <div className="hscroll">
          {league.teams
            .filter((t) => t.tid !== user)
            .sort((a, b) => (a.tid === opp ? -1 : b.tid === opp ? 1 : a.abbrev.localeCompare(b.abbrev)))
            .map((t) => (
              <button
                key={t.tid}
                onClick={() => setOpp(t.tid)}
                disabled={busy}
                aria-pressed={t.tid === opp}
                aria-label={`${t.region} ${t.name}`}
                className="col"
                style={{ alignItems: 'center', gap: 2, opacity: t.tid === opp ? 1 : busy ? 0.3 : 0.55, minWidth: 48 }}
              >
                <TeamLogo tid={t.tid} size={t.tid === opp ? 42 : 34} />
                <span className="tiny bold">{t.abbrev}</span>
              </button>
            ))}
        </div>
        <div className="small dim2" style={{ marginTop: 8 }}>
          <b>
            {oppTeam.region} {oppTeam.name}:
          </b>{' '}
          {scout.offense[0]} {scout.defense[0]}
        </div>
        {scout.weaknesses.length > 0 && (
          <div className="small" style={{ marginTop: 4 }}>
            <span className="good">Weakness:</span> {scout.weaknesses[0]}
          </div>
        )}
        {plan && (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <span className="small dim2">Your game plan for {oppTeam.abbrev} is included:</span>
            {plan.items.map((it) => (
              <Tag key={it.id} tone="info">
                {it.label}
              </Tag>
            ))}
          </div>
        )}
      </Card>

      <Segmented
        value={mode}
        onChange={setMode}
        label="Lab mode"
        disabled={busy}
        options={[
          { id: 'project', label: 'Project' },
          { id: 'compare', label: 'Compare' },
          { id: 'counters', label: 'Counters' },
        ]}
      />
      <div className="small dim">
        {mode === 'project' && 'Your current game plan against this opponent: expected result, shot profile, play types and who gets the ball.'}
        {mode === 'compare' &&
          (baseline
            ? 'Your tactics before vs after your latest edits, same opponent, same random draws.'
            : 'Compare plays your tactics from before and after an edit against the same games.')}
        {mode === 'counters' && 'The assistant drafts counters for this opponent and tests each one. Apply the ones that move the needle.'}
      </div>
      <div className="row">
        <Chips
          value={games}
          onChange={setGames}
          disabled={busy}
          options={[
            { id: 20, label: '20 games' },
            { id: 40, label: '40' },
            { id: 100, label: '100' },
          ]}
        />
        <div className="grow" />
        <button className="btn primary" onClick={() => void start()} disabled={busy || noBaseline}>
          {busy ? <Spinner /> : <Play size={16} fill="currentColor" />} Run
        </button>
      </div>

      {busy && (
        <Card>
          <div className="row">
            <Spinner />
            <span className="small dim2 grow">Simulating {mode === 'counters' ? 'several game plans' : `${games} games`}…</span>
            <span className="small num dim">
              {Math.min(progress, total)}/{total}
            </span>
          </div>
          <div className="bar" style={{ marginTop: 10 }} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(progress, total)}>
            <div style={{ width: `${Math.min(100, (progress / Math.max(1, total)) * 100)}%`, transition: 'width 0.2s' }} />
          </div>
        </Card>
      )}

      {!busy && !shown && (
        <Empty>
          <Beaker size={28} style={{ opacity: 0.6 }} />
          <div style={{ marginTop: 8 }}>
            {mode === 'project' && 'Tap Run to simulate this matchup with your current plan.'}
            {mode === 'compare' &&
              (baseline
                ? 'Tap Run to play both versions of your tactics against this opponent.'
                : 'Nothing to compare yet. Change something in Tactics, then tap Compare in the bar that appears.')}
            {mode === 'counters' && 'Tap Run and the assistant drafts counters for this opponent, then tests each one.'}
          </div>
          {noBaseline && (
            <Link to="/tactics" className="btn sm" style={{ marginTop: 12 }}>
              Open Tactics
            </Link>
          )}
        </Empty>
      )}

      {shown?.result && mode === 'project' && <Summary r={shown.result} league={league} oppTid={shown.opp} />}
      {shown?.result && shown.base && mode === 'compare' && <CompareView before={shown.base} after={shown.result} league={league} />}
      {shown?.cands && shown.base && (
        <>
          <Card title="Baseline">
            <div className="grid3">
              <Kpi k="Win %" v={p0(shown.base.winPct)} />
              <Kpi k="Net rtg" v={signed(shown.base.net)} color={shown.base.net >= 0 ? 'var(--good)' : 'var(--bad)'} />
              <Kpi k="Margin" v={signed(shown.base.ptsFor - shown.base.ptsAgainst)} />
            </div>
          </Card>
          <Card
            title="Counters, ranked"
            right={
              <Help title="Reading these numbers">
                Each candidate is simulated against the same opponent. The change is in net rating (points per 100 possessions) versus your current plan. The ± range is a 95%
                interval (two standard errors): a counter is only marked as better or worse when its change clears it. More games mean tighter estimates.
              </Help>
            }
          >
            <div className="col" style={{ gap: 8 }}>
              {shown.cands.map((c) => {
                const good = c.delta > SIGMAS * c.se;
                const bad = c.delta < -SIGMAS * c.se;
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
                      <span className="tiny dim">
                        95% range ± {f1(SIGMAS * c.se)} · win {p0(c.winPct)}
                      </span>
                      {applied.includes(c.id) ? (
                        <Tag tone="good">
                          <Check size={12} /> Applied
                        </Tag>
                      ) : (
                        <div className="row" style={{ gap: 6 }}>
                          <button className={`btn xs ${good ? 'primary' : ''}`} onClick={() => (planOther ? setReplace(c) : applyCand(c, 'game', shown.opp))}>
                            This game
                          </button>
                          <button className="btn xs ghost" onClick={() => applyCand(c, 'always', shown.opp)}>
                            Always
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <Sheet open={!!replace && !!planOther} onClose={() => setReplace(null)} title="Replace your game plan?">
        {replace && planOther && shown && (
          <>
            <p className="dim2">
              You have a game plan for {league.teams[planOther.oppTid].abbrev} ({planOther.items.map((it) => it.label).join(', ')}). Only one plan is kept: this replaces it with{' '}
              {replace.label} vs {league.teams[shown.opp].abbrev}.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn grow" onClick={() => setReplace(null)}>
                Keep it
              </button>
              <button
                className="btn primary grow"
                onClick={() => {
                  applyCand(replace, 'game', shown.opp);
                  setReplace(null);
                }}
              >
                Replace
              </button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  );
}

function Summary({ r, league, oppTid }: { r: LabSummary; league: League; oppTid: number }) {
  const me = league.teams[league.userTid];
  const them = league.teams[oppTid];
  const names = rosterNames(
    Object.keys(r.players)
      .map((pid) => league.players[+pid])
      .filter(Boolean),
    { initial: true },
  );
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
          <Kpi k="Net rtg" v={signed(r.net)} sub={`95% range ± ${f1(SIGMAS * r.netSE)}`} color={r.net >= 0 ? 'var(--good)' : 'var(--bad)'} />
          <Kpi k="Score" v={`${Math.round(r.ptsFor)}-${Math.round(r.ptsAgainst)}`} sub={`Pace ${f1(r.pace)}`} />
        </div>
      </Card>
      <Card
        title="Shot profile"
        right={
          <span className="tiny dim">
            {me.abbrev} vs {them.abbrev}
          </span>
        }
      >
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
              <span className="dim num" style={{ width: 48, textAlign: 'right' }}>
                {p0(v.freq)}
              </span>
              <span className="num bold" style={{ width: 52, textAlign: 'right', color: v.ppp >= 1.1 ? 'var(--good)' : v.ppp < 0.9 ? 'var(--bad)' : undefined }}>
                {v.ppp.toFixed(2)}
              </span>
            </div>
          ))}
          <div className="tiny dim">Share of possessions · points per possession (league average ≈ 1.13).</div>
        </div>
      </Card>
      <Card title="Who gets the ball">
        <div className="col" style={{ gap: 6 }}>
          {users.slice(0, 10).map((u) => (
            <div key={u.p.pid} className="row small">
              <span className="grow ellipsis">{names(u.p.pid)}</span>
              <span className="dim num" style={{ width: 44, textAlign: 'right' }}>
                {f1(u.min)}m
              </span>
              <span className="num" style={{ width: 44, textAlign: 'right' }}>
                {f1(u.pts)}
              </span>
              <span className="num dim2" style={{ width: 52, textAlign: 'right' }}>
                {p1(u.usg)}
              </span>
              <span className="num dim2" style={{ width: 52, textAlign: 'right' }}>
                {p1(u.ts)}
              </span>
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
                  <span className={`num bold ${v >= 0 ? 'good' : 'bad'}`} style={{ width: 44 }}>
                    {signed(v)}
                  </span>
                  <div className="grow">
                    <div>{tpl.text(X, Y, '')}</div>
                    {v < 0 && tpl.advice && <div className="tiny dim">{adviceFor(tpl.advice, league.settings.complexity)}</div>}
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
  const margin = SIGMAS * se;
  const verdict = d > margin ? 'An improvement' : d < -margin ? 'A step back' : 'Too close to call';
  const names = rosterNames(
    Object.keys(after.players)
      .map((pid) => league.players[+pid])
      .filter(Boolean),
  );
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
            <div className="bold" style={{ fontSize: 20 }}>
              {verdict}
            </div>
          </div>
          <span className={`display num ${d > margin ? 'good' : d < -margin ? 'bad' : 'dim2'}`} style={{ fontSize: 34 }}>
            {signed(d)}
          </span>
        </div>
        <div className="small dim">Net rating change per 100 possessions. 95% range ± {f1(margin)}: only a change bigger than that is called.</div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <Kpi k="Win %" v={p0(after.winPct)} sub={`was ${p0(before.winPct)}`} />
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
                <span className="dim num" style={{ width: 92, textAlign: 'right' }}>
                  {p0(b.freq)} → {p0(a.freq)}
                </span>
                <span className="num" style={{ width: 92, textAlign: 'right' }}>
                  {b.ppp.toFixed(2)} → {a.ppp.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Touches">
        <div className="col" style={{ gap: 6 }}>
          {players.map(({ p, a, b }) => (
            <div key={p.pid} className="row small">
              <span className="grow ellipsis">{names(p.pid)}</span>
              <span className="num dim nowrap" style={{ width: 120, textAlign: 'right' }}>
                {b ? p1(b.usg) : '-'} → {p1(a.usg)}
              </span>
              <span className="num" style={{ width: 70, textAlign: 'right' }}>
                {f1(a.pts)} pts
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
