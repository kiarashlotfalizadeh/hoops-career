// The Tactics Lab: real engine games before you commit. One panel, two homes: the Lab screen (/lab)
// compares your tactics before and after an edit and projects your plan against anyone, and the
// matchup page's Test projects it against that team and ranks the staff's counters for them.
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Beaker, Check, Play } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act, touch } from '../../state/actions';
import { progressCallback, resetLab, withLab } from '../../state/labClient';
import type { Candidate, CandidateResult, LabSide, LabSummary } from '../../core/ai/lab';
import { applyPatch, pairedDelta } from '../../core/ai/lab';
import { counterCandidates, scoutTeam, tacticsWithCounter } from '../../core/ai/advisor';
import { buildSimInput, ensureRotation, userGameOnDay } from '../../core/league/games';
import { aiGamePlan, nextMeeting } from '../../core/ai/opponentPlan';
import { persistableTactics, planFor, setPlanItem } from '../../core/league/gamePlans';
import { curTeamSeason } from '../../core/league/helpers';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { CLEAR_OUT, SETS } from '../../core/sim/sets';
import { IMPACT_TEXT, impactAdvice, impactSentence, teamRef } from '../../core/analysis/gameReport';
import type { GameType, League, SetId, Tactics, TacticsPatch } from '../../core/types';
import { Chips, Help, PageHeader, Section, Segmented, Spinner, Statline, Tag, scrollBehavior } from '../components/ui';
import { CompareBar } from '../components/charts';
import { TeamLogo } from '../components/TeamLogo';
import { matchupColors } from '../teamColors';
import { f1, p0, p1, rosterNames, signed } from '../stats';
import { clearLabBaseline, labBaselineName, takeLabBaseline } from '../screens/labBridge';
import './games.css';

export type LabMode = 'project' | 'compare' | 'counters';
const MODE_LABEL: Record<LabMode, string> = { project: 'Project', compare: 'Compare', counters: 'Counters' };

/** A verdict needs the change to clear two standard errors (about a 95% interval). */
const SIGMAS = 2;

/**
 * Standard errors each counter must clear when `n` are tested at once: wide enough that the whole
 * list has a 95% chance of marking none of the ones that change nothing (Bonferroni: 2 for one,
 * about 2.8 for nine). At two each, about one run in five flagged a counter that does nothing.
 */
function familySigmas(n: number): number {
  if (n <= 1) return SIGMAS;
  // upper-tail normal quantile of 2.5% / n (Abramowitz & Stegun 26.2.23, error under 0.0005)
  const t = Math.sqrt(-2 * Math.log(0.025 / n));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
}

/** Lab games are the kind being played now: in the postseason, the play-in's or the playoffs' (the playoffs' shorter rotations included). */
function labGameType(league: League): GameType {
  return league.phase === 'playoffs' || league.phase === 'playin' ? league.phase : 'regular';
}

/**
 * A lab side is built like a real game's: the game plan for this opponent on top of the tactics,
 * injured players kept on the roster so the engine hands their minutes down the bench, morale and
 * wear, rest, and an AI opponent's in-game adjustments, with the plan its coach brings to your next
 * meeting if he game-plans for it.
 */
function sideFor(league: League, tid: number, opp: number, tactics?: Tactics): LabSide {
  const view = tactics ? { ...league, teams: league.teams.map((t) => (t.tid === tid ? { ...t, tactics } : t)) } : league;
  const input = buildSimInput(view, tid, league.day, labGameType(league), opp, nextMeeting(league, tid === league.userTid ? opp : tid));
  // (the season history is never read by a game: it stays out of the message to the worker)
  return { ...input, team: { ...input.team, seasons: [] } };
}

/** The user's next opponent (today's first), else any other team. */
function defaultOpponent(league: League): number {
  const g =
    userGameOnDay(league, league.day) ??
    league.schedule.filter((x) => !x.played && x.day >= league.day && (x.home === league.userTid || x.away === league.userTid)).sort((a, b) => a.day - b.day)[0];
  if (g) return g.home === league.userTid ? g.away : g.home;
  return league.userTid === 0 ? 1 : 0;
}

/** A patch that turns any tactics into `t` (the Lab applies it on top of the plan the side already plays). */
const toTactics = (t: Tactics): TacticsPatch => ({ offense: { ...t.offense }, defense: { ...t.defense }, manage: { ...t.manage } });

/** What a finished run was for: results only show, and only apply, for the matchup they simulated. */
interface Run {
  opp: number;
  mode: LabMode;
  result?: LabSummary;
  base?: LabSummary;
  cands?: CandidateResult[];
}

/** The Lab screen: compare your edits, or project your plan against anyone. Counters live on each matchup page. */
export default function LabPage() {
  const league = useLeague();
  const [params] = useSearchParams();
  const asked = Number(params.get('opp') ?? NaN);
  const opp = Number.isInteger(asked) && league.teams[asked] && asked !== league.userTid ? asked : null;
  const [baseline] = useState<Tactics | null>(() => (params.get('compare') ? takeLabBaseline(league) : null));
  // a saved playbook (from Tactics' My playbooks) as the before side, instead of the tactics before an edit
  const [baselineName] = useState(() => (params.get('compare') ? labBaselineName(league) : null));
  useEffect(() => clearLabBaseline(), []);
  if (params.get('mode') === 'counters') return <Navigate to={`/games/${opp ?? defaultOpponent(league)}?tab=test&lab=counters`} replace />;
  return (
    <main className="page">
      <PageHeader
        title="Tactics Lab"
        back
        backTo="/team/tactics"
        right={
          <Help title="Tactics Lab">
            <p>Real engine games, before you commit: both teams play as they would tonight, with both game plans, rest, wear and injuries.</p>
            <p>Project: your plan against any team. Compare: your tactics before and after an edit, through the same games.</p>
            <p>To rank the staff&apos;s counters for one team, open its matchup page: Test.</p>
          </Help>
        }
      />
      <LabPanel
        league={league}
        modes={['project', 'compare']}
        initialMode={baseline ? 'compare' : 'project'}
        initialOpp={opp ?? undefined}
        baseline={baseline}
        baselineName={baselineName}
      />
    </main>
  );
}

/**
 * The Lab itself. `fixedOpp`: the matchup page's, against that team only (its slab names them); else
 * an opponent picker. `baseline`: the tactics Compare plays as "before".
 */
export function LabPanel({
  league,
  fixedOpp,
  modes,
  initialMode,
  initialOpp,
  baseline = null,
  baselineName = null,
}: {
  league: League;
  fixedOpp?: number;
  modes: LabMode[];
  initialMode?: LabMode;
  initialOpp?: number;
  baseline?: Tactics | null;
  baselineName?: string | null;
}) {
  const [params] = useSearchParams();
  const asked = params.get('lab') as LabMode | null;
  const [mode, setMode] = useState<LabMode>(() => initialMode ?? (asked && modes.includes(asked) ? asked : modes[0]));
  const [picked, setOpp] = useState<number>(() => initialOpp ?? defaultOpponent(league));
  const opp = fixedOpp ?? picked;
  const [games, setGames] = useState(40);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(1);
  const [run, setRun] = useState<Run | null>(null);
  const simming = useStore((s) => !!s.sim);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // a run stopped with Stop fails as one stopped by leaving does
  const stopped = useRef(false);
  // leaving mid-run stops the worker so the next visit isn't queued behind stale sims
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (busyRef.current) resetLab();
    };
  }, []);
  // "opponent:counter id": counters are drafted per opponent and share their ids
  const [applied, setApplied] = useState<string[]>([]);
  const user = league.userTid;
  const noBaseline = mode === 'compare' && !baseline;

  useEffect(() => {
    setRun(null);
  }, [opp, mode, games]);

  const start = async () => {
    setBusy(true);
    stopped.current = false;
    const job: Run = { opp, mode };
    try {
      touch((l) => {
        ensureRotation(l, user);
        ensureRotation(l, opp);
      });
      const b = sideFor(league, opp, user);
      const seed = (league.rng ^ (opp * 7919)) >>> 0;
      const type = labGameType(league);
      // progress across runs (Compare's two take turns on the worker): each reports its own count, the bar shows the sum
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
          job.result = await w.runLab({ a: sideFor(league, user, opp), b, games, seed, type }, track(0));
        } else if (mode === 'compare' && baseline) {
          setTotal(games * 2);
          [job.base, job.result] = await Promise.all([
            w.runLab({ a: sideFor(league, user, opp, baseline), b, games, seed, type }, track(0)),
            w.runLab({ a: sideFor(league, user, opp), b, games, seed, type }, track(1)),
          ]);
        } else if (mode === 'counters') {
          const candidates = counterCandidates(league, user, opp);
          const n = Math.max(20, Math.round(games * 0.75));
          setTotal(n * (candidates.length + 1));
          // each counter plays as the plan would play it: in place of the plan's item in its group
          const tested: Candidate[] = candidates.map((c) => ({ ...c, patch: toTactics(tacticsWithCounter(league, opp, c)) }));
          const out = await w.evaluate(sideFor(league, user, opp), b, tested, n, seed, track(0), type);
          const byId = new Map(candidates.map((c) => [c.id, c]));
          job.base = out.base;
          // (what goes into the plan is the counter itself, relative to the playbook)
          job.cands = out.results.map((r) => ({ ...r, patch: byId.get(r.id)!.patch }));
        }
      });
      if (mounted.current) setRun(job);
    } catch (e) {
      // (not a run stopped with Stop, or by leaving the Lab: nothing went wrong there)
      if (mounted.current && !stopped.current) {
        console.error(e);
        useStore.getState().toast(`The lab could not finish: ${e instanceof Error ? e.message : 'unknown error'}`, 'bad');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const applyCand = (c: CandidateResult, scope: 'game' | 'always', vs: number) => {
    const ok = act(scope === 'game' ? 'Game plan' : 'Tactics', (l) => {
      if (scope === 'always') {
        const tm = l.teams[l.userTid];
        // a star target or a matchup names this opponent's player: kept tactics go after each opponent's own star
        tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, c.patch), tm.tactics), manual: true };
      } else setPlanItem(l, vs, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) });
    });
    if (!ok) return;
    setApplied((a) => [...a, `${vs}:${c.id}`]);
    useStore.getState().toast(scope === 'game' ? `Plan vs ${league.teams[vs].abbrev}: ${c.label}` : `Your tactics: ${c.label}`, 'good');
  };

  // a finished run brings its results up under the header
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (run) results.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, [run]);

  const shown = run && run.opp === opp && run.mode === mode ? run : null;
  const them = league.teams[opp];
  return (
    <>
      {modes.length > 1 && <Segmented value={mode} onChange={setMode} label="Lab mode" disabled={busy} options={modes.map((id) => ({ id, label: MODE_LABEL[id] }))} />}

      {fixedOpp === undefined && <OpponentPicker league={league} opp={opp} onPick={setOpp} disabled={busy} />}
      <Plans league={league} opp={opp} />

      <div className="small dim2">
        {mode === 'project' && `Your plan against the ${them.name}: the result, the shots, who gets the ball.`}
        {mode === 'compare' &&
          (baseline
            ? baselineName
              ? `Your playbook “${baselineName}” (before) vs your tactics now, through the same games.`
              : 'Your tactics before vs after your edits, through the same games.'
            : 'Your tactics before and after an edit, through the same games.')}
        {mode === 'counters' && 'Each of the staff’s counters against them, ranked.'}
      </div>
      <div className="lab-run">
        <span className="over">Games</span>
        <Chips
          label="Games to simulate"
          value={games}
          onChange={setGames}
          disabled={busy}
          options={[
            { id: 20, label: '20' },
            { id: 40, label: '40' },
            { id: 100, label: '100' },
          ]}
        />
        <span className="grow" />
        <button className="btn primary" onClick={() => void start()} disabled={busy || noBaseline || simming} aria-label={`Run ${games} games`}>
          {busy ? <Spinner /> : <Play size={16} fill="currentColor" />} Run
        </button>
      </div>

      {busy && (
        <div className="card lab-busy">
          <div className="row">
            <Spinner />
            <span className="small dim2 grow">Simulating {mode === 'counters' ? 'each counter' : `${games} games`}…</span>
            <span className="small num dim">
              {Math.min(progress, total)}/{total}
            </span>
            <button
              className="btn xs ghost"
              onClick={() => {
                stopped.current = true;
                resetLab();
              }}
            >
              Stop
            </button>
          </div>
          <div className="bar" role="progressbar" aria-label="Games simulated" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(progress, total)}>
            <div className="lab-fill" style={{ width: `${Math.min(100, (progress / Math.max(1, total)) * 100)}%` }} />
          </div>
        </div>
      )}

      {!busy && !shown && (
        <div className="lab-empty">
          <Beaker size={26} aria-hidden="true" />
          <div>{noBaseline ? 'Nothing to compare yet.' : 'Tap Run: real engine games, nothing is saved.'}</div>
          {noBaseline && (
            <Link to="/team/tactics" className="btn sm">
              Open Tactics
            </Link>
          )}
        </div>
      )}

      <div ref={results} className="lab-anchor" aria-hidden="true" />
      {shown?.result && mode === 'project' && <Summary r={shown.result} league={league} oppTid={shown.opp} />}
      {shown?.result && shown.base && mode === 'compare' && <CompareView before={shown.base} after={shown.result} league={league} />}
      {shown?.cands && shown.base && <Counters league={league} run={shown} applied={applied} onApply={applyCand} />}
    </>
  );
}

/** Every other team, its logo and abbreviation, the picked one scrolled into view. */
function OpponentPicker({ league, opp, onPick, disabled }: { league: League; opp: number; onPick: (tid: number) => void; disabled: boolean }) {
  const ts = curTeamSeason(league, opp);
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  // the teams keep their order (a tapped one doesn't jump under the finger): the one picked on arrival scrolls into view
  const picker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = picker.current;
    const btn = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && btn) row.scrollLeft = Math.max(0, btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2);
  }, []);
  const t = league.teams[opp];
  return (
    <Section
      title="Opponent"
      right={
        <Link to={`/games/${opp}`} className="card-link">
          Matchup
        </Link>
      }
    >
      <div className="card flush">
        <div className="hscroll lab-teams" ref={picker}>
          {league.teams
            .filter((x) => x.tid !== league.userTid)
            .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
            .map((x) => (
              <button key={x.tid} onClick={() => onPick(x.tid)} disabled={disabled} aria-pressed={x.tid === opp} className="lab-team">
                {/* named by the abbreviation it shows, then the team: "MEM, Memphis Grizzlies" */}
                <TeamLogo tid={x.tid} size={x.tid === opp ? 38 : 30} decorative />
                <span className="lab-team-ab">{x.abbrev}</span>
                <span className="sr-only">
                  , {x.region} {x.name}
                </span>
              </button>
            ))}
        </div>
        <div className="lab-plans">
          <div className="row between">
            <b>
              {t.region} {t.name}
            </b>
            <span className="num dim2">
              {ts.won}-{ts.lost}
            </span>
          </div>
          <div className="mu-note">{scout.summary.replace(`${t.region} ${t.name}: `, '')}</div>
        </div>
      </div>
    </Section>
  );
}

/** Both game plans, as every Lab game plays them. */
function Plans({ league, opp }: { league: League; opp: number }) {
  const plan = planFor(league, opp);
  // the plan their coach brings to your next meeting, which the Lab plays as he will
  const theirPlan = useLeagueMemo(() => {
    const g = nextMeeting(league, opp);
    return g ? aiGamePlan(league, opp, league.userTid, g) : null;
  }, [league, opp]);
  if (!plan?.items.length && !theirPlan?.items.length) return null;
  return (
    <div className="col" style={{ gap: 6 }}>
      {!!plan?.items.length && (
        <div className="lab-pline">
          <span className="over">Your plan</span>
          <span className="small dim2">{plan.items.map((it) => it.label).join(' · ')}</span>
        </div>
      )}
      {!!theirPlan?.items.length && (
        <div className="lab-pline">
          <span className="over">Their plan</span>
          <span className="small dim2">{theirPlan.items.map((it) => it.text).join(' · ')}</span>
        </div>
      )}
    </div>
  );
}

function Counters({ league, run, applied, onApply }: { league: League; run: Run; applied: string[]; onApply: (c: CandidateResult, scope: 'game' | 'always', vs: number) => void }) {
  const simming = useStore((s) => !!s.sim);
  const base = run.base!;
  const cands = run.cands!;
  const vs = league.teams[run.opp].abbrev;
  const mine = league.teams[league.userTid].tactics;
  return (
    <>
      <section className="lab-hero" aria-label="Your plan now">
        <div className="over">Your plan now</div>
        <Statline
          items={[
            { k: 'Win %', v: p0(base.winPct) },
            { k: 'Net rtg', v: signed(base.net), color: base.net >= 0 ? 'var(--good)' : 'var(--bad)' },
            { k: 'Margin', v: signed(base.ptsFor - base.ptsAgainst) },
          ]}
        />
      </section>
      <Section
        title="Counters, ranked"
        right={
          <Help title="Reading these numbers">
            Each counter plays the same games against them. The change is in net rating (points per 100 possessions) against your plan now. A counter is only called better or worse
            when its change clears the ± range; with several tested at once the range is wider than for one, so a counter that changes nothing rarely looks like a win. More games,
            tighter numbers.
          </Help>
        }
      >
        <div className="card flush list">
          {!cands.length && <div className="mu-empty">Nothing new to test: your plan already covers what the staff sees.</div>}
          {cands.map((c, i, all) => {
            const sig = familySigmas(all.length);
            const good = c.delta > sig * c.se;
            const bad = c.delta < -sig * c.se;
            const tone = good ? 'good' : bad ? 'bad' : '';
            // a counter that only names their players (attacking one defender) has nothing to keep for every game
            const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
            return (
              <div key={c.id} className={`lab-cand ${tone}`}>
                <div className="lab-cand-top">
                  <span className="lab-rank num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="grow lr-name">{c.label}</span>
                  <span className="lab-d">
                    <span className={`lab-delta num ${tone || 'dim2'}`}>{signed(c.delta)}</span>
                    <span className="tiny dim num">± {f1(sig * c.se)}</span>
                  </span>
                </div>
                <div className="mu-note">{c.why}</div>
                {c.evidence && (
                  <div className="mu-ev">
                    <b>By the numbers:</b> {c.evidence}
                  </div>
                )}
                <div className="lab-cand-foot">
                  <Tag tone={good ? 'good' : bad ? 'bad' : undefined}>{good ? 'Better' : bad ? 'Worse' : 'Too close'}</Tag>
                  <span className="tiny dim num grow">win {p0(c.winPct)}</span>
                  {applied.includes(`${run.opp}:${c.id}`) ? (
                    <Tag tone="good">
                      <Check size={12} /> Added
                    </Tag>
                  ) : (
                    <>
                      <button
                        className={`btn xs ${good ? 'primary' : ''}`}
                        disabled={simming}
                        onClick={() => onApply(c, 'game', run.opp)}
                        aria-label={`${c.label}: into your plan against ${vs}`}
                      >
                        Plan vs {vs}
                      </button>
                      {always && (
                        <button
                          className="btn xs ghost"
                          disabled={simming}
                          onClick={() => onApply(c, 'always', run.opp)}
                          aria-label={`${c.label}: into your tactics for every game`}
                        >
                          Always
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function Summary({ r, league, oppTid }: { r: LabSummary; league: League; oppTid: number }) {
  const me = league.teams[league.userTid];
  const them = league.teams[oppTid];
  const [cMe, cThem] = matchupColors(me.colors, them.colors);
  // advice only for what your tactics for this opponent still do: no "go back to man-to-man" from man-to-man
  const tactics = useLeagueMemo(() => sideFor(league, league.userTid, oppTid).team.tactics, [league, oppTid]);
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
  // each side's gains on their own line: netted, both teams' drop coverage conceding pull-ups cancelled out
  const impacts = Object.entries(r.impacts)
    .filter(([k]) => IMPACT_TEXT[k])
    .flatMap(([k, v]): [string, number][] => [
      [k, v.us],
      [k, -v.them],
    ])
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);
  return (
    <>
      <section className="lab-hero" aria-label="Projection">
        <div className="over">
          {me.abbrev} vs {them.abbrev} · {r.games} games
        </div>
        <Statline
          items={[
            { k: 'Win %', v: p0(r.winPct) },
            { k: 'Net rtg', v: signed(r.net), s: `± ${f1(SIGMAS * r.netSE)}`, color: r.net >= 0 ? 'var(--good)' : 'var(--bad)' },
            { k: 'Score', v: `${Math.round(r.ptsFor)}-${Math.round(r.ptsAgainst)}`, s: `Pace ${f1(r.pace)}` },
          ]}
        />
      </section>
      {impacts.length > 0 && (
        <Section title="What drives it" right={<span className="tiny dim">pts a game</span>}>
          <div className="card flush list">
            {impacts.map(([k, v]) => {
              const advice = v < 0 ? impactAdvice(k, tactics) : undefined;
              return (
                <div key={`${k}${v >= 0 ? '+' : '-'}`} className="lab-imp">
                  <span className={`lab-imp-v num ${v >= 0 ? 'good' : 'bad'}`}>{signed(v)}</span>
                  <span>
                    <span>{impactSentence(k, teamRef(v >= 0 ? me : them), teamRef(v >= 0 ? them : me))}</span>
                    {advice && <span className="lab-imp-a">{advice}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section
        title="Shot profile"
        right={
          <span className="lab-legend">
            <i style={{ background: cMe }} /> {me.abbrev} <i style={{ background: cThem }} /> {them.abbrev}
          </span>
        }
      >
        <div className="card lab-bars">
          <CompareBar label="eFG%" a={r.shot.efg * 100} b={r.oppShot.efg * 100} colorA={cMe} colorB={cThem} />
          <CompareBar label="Rim rate" a={r.shot.rimRate * 100} b={r.oppShot.rimRate * 100} colorA={cMe} colorB={cThem} neutral />
          <CompareBar label="3PA rate" a={r.shot.threeRate * 100} b={r.oppShot.threeRate * 100} colorA={cMe} colorB={cThem} neutral />
          <CompareBar label="FTA / FGA" a={r.shot.ftRate * 100} b={r.oppShot.ftRate * 100} colorA={cMe} colorB={cThem} />
          <CompareBar label="Turnover %" a={r.shot.tov * 100} b={r.oppShot.tov * 100} colorA={cMe} colorB={cThem} higherBetter={false} />
          <CompareBar label="Off. rebound %" a={r.shot.orb * 100} b={r.oppShot.orb * 100} colorA={cMe} colorB={cThem} />
        </div>
      </Section>
      <Section title="Your play types" right={<span className="tiny dim">share · pts/poss</span>}>
        <div className="card flush list">
          {pts.map(([k, v]) => (
            <div key={k} className="lab-tr c2">
              <span className="ellipsis">{FINISH_LABEL[k as FinishType] ?? k}</span>
              <span className="num dim2">{p0(v.freq)}</span>
              <span className={`num bold ${v.ppp >= 1.1 ? 'good' : v.ppp < 0.9 ? 'bad' : ''}`}>{v.ppp.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Who gets the ball" right={<span className="tiny dim">a game</span>}>
        <div className="card flush list">
          <div className="lab-tr c5 h">
            <span>Player</span>
            <span>Min</span>
            <span>Pts</span>
            <span>Usg</span>
            <span>TS%</span>
          </div>
          {users.slice(0, 10).map((u) => (
            <div key={u.p.pid} className="lab-tr c5">
              <span className="ellipsis">{names(u.p.pid)}</span>
              <span className="num dim2">{f1(u.min)}</span>
              <span className="num bold">{f1(u.pts)}</span>
              <span className="num dim2">{p1(u.usg)}</span>
              <span className="num dim2">{p1(u.ts)}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function CompareView({ before, after, league }: { before: LabSummary; after: LabSummary; league: League }) {
  const { delta: d, se } = pairedDelta(before, after);
  const margin = SIGMAS * se;
  const verdict = d > margin ? 'An improvement' : d < -margin ? 'A step back' : 'Too close to call';
  const tone = d > margin ? 'good' : d < -margin ? 'bad' : '';
  const names = rosterNames(
    Object.keys(after.players)
      .map((pid) => league.players[+pid])
      .filter(Boolean),
  );
  const keys = Array.from(new Set([...Object.keys(before.playTypes), ...Object.keys(after.playTypes)]));
  // (summaries from before sets have none)
  const setKeys = Array.from(new Set([...Object.keys(before.sets ?? {}), ...Object.keys(after.sets ?? {})]));
  const players = Object.keys(after.players)
    .map(Number)
    .map((pid) => ({ p: league.players[pid], a: after.players[pid], b: before.players[pid] }))
    .filter((x) => x.p && x.a)
    .sort((x, y) => y.a.min - x.a.min)
    .slice(0, 9);
  const legend = (
    <span className="lab-legend">
      <i className="before" /> Before <i className="after" /> After
    </span>
  );
  return (
    <>
      <section className="lab-hero" aria-label="Verdict">
        <div className="lab-verdict">
          <div className="grow">
            <div className="over">Verdict</div>
            <div className={`lab-verdict-t ${tone}`}>{verdict}</div>
          </div>
          <div className="lab-d">
            <span className={`lab-delta big num ${tone || 'dim2'}`}>{signed(d)}</span>
            <span className="tiny dim">net / 100 poss · ± {f1(margin)}</span>
          </div>
        </div>
        <Statline
          items={[
            { k: 'Win %', v: p0(after.winPct), s: `was ${p0(before.winPct)}` },
            { k: 'Off rtg', v: f1(after.ortg), s: signed(after.ortg - before.ortg) },
            { k: 'Def rtg', v: f1(after.drtg), s: signed(after.drtg - before.drtg) },
          ]}
        />
      </section>
      <Section title="Shot profile" right={legend}>
        <div className="card lab-bars">
          <CompareBar label="eFG%" a={before.shot.efg * 100} b={after.shot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
          <CompareBar label="3PA rate" a={before.shot.threeRate * 100} b={after.shot.threeRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" neutral />
          <CompareBar label="Rim rate" a={before.shot.rimRate * 100} b={after.shot.rimRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" neutral />
          <CompareBar label="Opp eFG%" a={before.oppShot.efg * 100} b={after.oppShot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" higherBetter={false} />
          <CompareBar label="Opp turnover %" a={before.oppShot.tov * 100} b={after.oppShot.tov * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
        </div>
      </Section>
      <Section title="Play types" right={<span className="tiny dim">share · pts/poss</span>}>
        <div className="card flush list">
          {keys.map((k) => {
            const b = before.playTypes[k] ?? { freq: 0, ppp: 0 };
            const a = after.playTypes[k] ?? { freq: 0, ppp: 0 };
            return (
              <div key={k} className="lab-tr c3">
                <span className="ellipsis">{FINISH_LABEL[k as FinishType] ?? k}</span>
                <span className="num dim2">
                  {p0(b.freq)} → {p0(a.freq)}
                </span>
                <span className="num">
                  {b.ppp.toFixed(2)} → <b>{a.ppp.toFixed(2)}</b>
                </span>
              </div>
            );
          })}
        </div>
      </Section>
      {setKeys.length > 0 && (
        <Section
          title="Sets"
          right={
            <Help title="Sets">
              The possessions each set opened, a game, and the points per possession they scored. A set package&apos;s sets run now and then, for players who fit them; their
              defense reads each one a little better every run.
            </Help>
          }
        >
          <div className="card flush list">
            {setKeys.map((k) => {
              const b = before.sets?.[k];
              const a = after.sets?.[k];
              const ppp = (x?: { runs: number; pts: number }) => (x?.runs ? (x.pts / x.runs).toFixed(2) : '—');
              return (
                <div key={k} className="lab-tr c3">
                  <span className="ellipsis">{k === 'iso' ? CLEAR_OUT.name : SETS[k as SetId].name}</span>
                  <span className="num dim2">
                    {f1(b?.runs ?? 0)} → {f1(a?.runs ?? 0)}
                  </span>
                  <span className="num">
                    {ppp(b)} → <b>{ppp(a)}</b>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section title="Touches" right={<span className="tiny dim">usage · pts</span>}>
        <div className="card flush list">
          {players.map(({ p, a, b }) => (
            <div key={p.pid} className="lab-tr c3">
              <span className="ellipsis">{names(p.pid)}</span>
              <span className="num dim2 nowrap">
                {b ? p1(b.usg) : '—'} → {p1(a.usg)}
              </span>
              <span className="num">{f1(a.pts)} pts</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
