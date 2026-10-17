import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Beaker, Check, ChevronRight, Play } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
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
import { Chips, Empty, Help, PageHeader, Section, Segmented, Spinner, Statline, Tag } from '../components/ui';
import { CompareBar } from '../components/charts';
import { TeamLogo } from '../components/TeamLogo';
import { matchupColors } from '../teamColors';
import { f1, p0, p1, rosterNames, signed } from '../stats';
import { adviceFor } from '../seasonAnalysis';
import { clearLabBaseline, labBaselineName, takeLabBaseline } from './labBridge';
import type { GameType, League, SetId, Tactics, TacticsPatch } from '../../core/types';
import './tactics.css';

type Mode = 'project' | 'compare' | 'counters';

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
  mode: Mode;
  result?: LabSummary;
  base?: LabSummary;
  cands?: CandidateResult[];
}

export default function TacticsLab() {
  const league = useLeague();
  const [params] = useSearchParams();
  const [baseline] = useState<Tactics | null>(() => (params.get('compare') ? takeLabBaseline(league) : null));
  // a saved playbook (from Tactics' My playbooks) as the before side, instead of the tactics before an edit
  const [baselineName] = useState(() => (params.get('compare') ? labBaselineName(league) : null));
  useEffect(() => clearLabBaseline(), []);
  const [mode, setMode] = useState<Mode>(baseline ? 'compare' : params.get('mode') === 'counters' ? 'counters' : 'project');
  // a link from before a team switch (or a hand-edited one) can name your own team or none: fall back to the next opponent
  const [opp, setOpp] = useState<number>(() => {
    const asked = Number(params.get('opp') ?? NaN);
    return Number.isInteger(asked) && league.teams[asked] && asked !== league.userTid ? asked : defaultOpponent(league);
  });
  const [games, setGames] = useState(40);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(1);
  const [run, setRun] = useState<Run | null>(null);
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
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const plan = planFor(league, opp);
  // the plan their coach brings to your next meeting, which the lab plays as he will
  const theirPlan = useLeagueMemo(() => {
    const g = nextMeeting(league, opp);
    return g ? aiGamePlan(league, opp, league.userTid, g) : null;
  }, [league, opp]);
  const noBaseline = mode === 'compare' && !baseline;

  useEffect(() => {
    setRun(null);
  }, [opp, mode, games]);

  const start = async () => {
    setBusy(true);
    stopped.current = false;
    const job: Run = { opp, mode };
    try {
      useStore.getState().mutate((l) => {
        ensureRotation(l, user);
        ensureRotation(l, opp);
      }, false);
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
    useStore.getState().mutate((l) => {
      if (scope === 'always') {
        const tm = l.teams[l.userTid];
        // a star target or a matchup names this opponent's player: kept tactics go after each opponent's own star
        tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, c.patch), tm.tactics), manual: true };
      } else setPlanItem(l, vs, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) });
    });
    setApplied((a) => [...a, `${vs}:${c.id}`]);
    useStore.getState().toast(scope === 'game' ? `Game plan vs ${league.teams[vs].abbrev}: ${c.label}` : `Applied to your tactics: ${c.label}`, 'good');
  };

  // the teams keep their order (a tapped one doesn't jump under the finger): the one picked on arrival scrolls into view
  const picker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = picker.current;
    const btn = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && btn) row.scrollLeft = Math.max(0, btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2);
  }, []);

  const oppTeam = league.teams[opp];
  const ts = curTeamSeason(league, opp);
  const shown = run && run.opp === opp && run.mode === mode ? run : null;
  return (
    <main className="page tx-page">
      <PageHeader title="Tactics Lab" back backTo="/tactics" sub="Real engine games, before you commit." />
      <Segmented
        tabs
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

      <Section
        title="Opponent"
        right={
          <Link to={`/gameplan/${opp}`} className="card-link">
            Game plan vs {oppTeam.abbrev} <ChevronRight size={14} />
          </Link>
        }
      >
        <div className="card flush">
          <div className="hscroll tx-teams" ref={picker}>
            {league.teams
              .filter((t) => t.tid !== user)
              .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
              .map((t) => (
                <button key={t.tid} onClick={() => setOpp(t.tid)} disabled={busy} aria-pressed={t.tid === opp} className="tx-team">
                  {/* named by the abbreviation it shows, then the team: "MEM, Memphis Grizzlies" */}
                  <TeamLogo tid={t.tid} size={t.tid === opp ? 42 : 34} decorative />
                  <span className="tx-team-ab">{t.abbrev}</span>
                  <span className="sr-only">
                    , {t.region} {t.name}
                  </span>
                </button>
              ))}
          </div>
          <div className="tx-scout">
            <div className="tx-scout-h">
              <span className="tx-scout-n">
                {oppTeam.region} {oppTeam.name}
              </span>
              <span className="num tx-opp-rec">
                {ts.won}-{ts.lost}
              </span>
            </div>
            <div className="tx-note">
              {scout.offense[0]} {scout.defense[0]}
            </div>
            {scout.weaknesses.length > 0 && (
              <div className="tx-sline">
                <Tag tone="good">Attack</Tag>
                <span className="grow">{scout.weaknesses[0]}</span>
              </div>
            )}
            {plan && (
              <div className="tx-sline">
                <span className="over">Your plan</span>
                <span className="chips grow">
                  {plan.items.map((it) => (
                    <Tag key={it.id} tone="info">
                      {it.label}
                    </Tag>
                  ))}
                </span>
              </div>
            )}
            {theirPlan && (
              <div className="tx-sline">
                <span className="over">Their plan</span>
                <span className="chips grow">
                  {theirPlan.items.map((it) => (
                    <Tag key={it.id} tone="warn">
                      {it.text}
                    </Tag>
                  ))}
                </span>
              </div>
            )}
            {(plan || theirPlan) && <div className="tiny dim">Both plans play in every Lab game.</div>}
          </div>
        </div>
      </Section>

      <div className="card tx-run">
        <div className="tx-note">
          {mode === 'project' && 'Your plan against them: the result, shot profile, play types and who gets the ball.'}
          {mode === 'compare' &&
            (baseline
              ? baselineName
                ? `Your playbook "${baselineName}" (before) vs your tactics now (after): same opponent, same random draws.`
                : 'Your tactics before vs after your edits: same opponent, same random draws.'
              : 'Plays your tactics from before and after an edit through the same games.')}
          {mode === 'counters' && 'The assistant drafts counters for them and tests each one. Apply the ones that move the needle.'}
        </div>
        <div className="row">
          <Chips
            label="Games to simulate"
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
          <button className="btn primary tx-runbtn" onClick={() => void start()} disabled={busy || noBaseline}>
            {busy ? <Spinner /> : <Play size={16} fill="currentColor" />} Run
          </button>
        </div>
      </div>

      {busy && (
        <div className="card tx-busy">
          <div className="row">
            <Spinner />
            <span className="small dim2 grow">Simulating {mode === 'counters' ? 'several game plans' : `${games} games`}…</span>
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
            <div className="tx-fill" style={{ width: `${Math.min(100, (progress / Math.max(1, total)) * 100)}%` }} />
          </div>
        </div>
      )}

      {!busy && !shown && (
        <Empty>
          <Beaker size={28} className="tx-empty-ic" />
          <div className="tx-empty-t">
            {mode === 'project' && 'Tap Run to simulate this matchup with your plan.'}
            {mode === 'compare' &&
              (baseline ? 'Tap Run to play both versions of your tactics against them.' : 'Nothing to compare yet. Change something in Tactics, then tap Compare.')}
            {mode === 'counters' && 'Tap Run: the assistant drafts counters for them, then tests each one.'}
          </div>
          {noBaseline && (
            <Link to="/tactics" className="btn sm tx-empty-btn">
              Open Tactics
            </Link>
          )}
        </Empty>
      )}

      {shown?.result && mode === 'project' && <Summary r={shown.result} league={league} oppTid={shown.opp} />}
      {shown?.result && shown.base && mode === 'compare' && <CompareView before={shown.base} after={shown.result} league={league} />}
      {shown?.cands && shown.base && (
        <>
          <section className="card tx-hero" aria-label="Baseline">
            <div className="over tx-hero-over">Baseline · your plan now</div>
            <Statline
              items={[
                { k: 'Win %', v: p0(shown.base.winPct) },
                { k: 'Net rtg', v: signed(shown.base.net), color: shown.base.net >= 0 ? 'var(--good)' : 'var(--bad)' },
                { k: 'Margin', v: signed(shown.base.ptsFor - shown.base.ptsAgainst) },
              ]}
            />
          </section>
          <Section
            title="Counters, ranked"
            right={
              <Help title="Reading these numbers">
                Each candidate is simulated against the same opponent. The change is in net rating (points per 100 possessions) versus your current plan. A counter is only marked
                as better or worse when its change clears the ± range. With several counters tested at once the range is wider than for one (two standard errors), so a counter that
                changes nothing rarely looks like a win. More games mean tighter estimates.
              </Help>
            }
          >
            <div className="card flush list">
              {!shown.cands.length && <div className="tx-empty">Nothing new to test: your plan already covers what the staff sees.</div>}
              {shown.cands.map((c, i, all) => {
                const sig = familySigmas(all.length);
                const good = c.delta > sig * c.se;
                const bad = c.delta < -sig * c.se;
                const tone = good ? 'good' : bad ? 'bad' : '';
                // a counter that only names their players (attacking one defender) has nothing to keep for every game
                const mine = league.teams[league.userTid].tactics;
                const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
                return (
                  <div key={c.id} className={`tx-cand ${tone}`}>
                    <div className="tx-cand-top">
                      <span className="tx-rank num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="grow lr-name">{c.label}</span>
                      <span className="tx-cand-d">
                        <span className={`tx-delta num ${tone || 'dim2'}`}>{signed(c.delta)}</span>
                        <span className="tiny dim num">± {f1(sig * c.se)}</span>
                      </span>
                    </div>
                    <div className="tx-cand-body">
                      <div className="tx-note">{c.why}</div>
                      {c.evidence && (
                        <div className="tx-ev">
                          <b>By the numbers:</b> {c.evidence}
                        </div>
                      )}
                      <div className="tx-cand-foot">
                        <Tag tone={good ? 'good' : bad ? 'bad' : undefined}>{good ? 'Better' : bad ? 'Worse' : 'Too close'}</Tag>
                        <span className="tiny dim num grow">win {p0(c.winPct)}</span>
                        {applied.includes(`${shown.opp}:${c.id}`) ? (
                          <Tag tone="good">
                            <Check size={12} /> Applied
                          </Tag>
                        ) : (
                          <span className="row tx-btns">
                            <button
                              className={`btn xs ${good ? 'primary' : ''}`}
                              onClick={() => applyCand(c, 'game', shown.opp)}
                              aria-label={`Vs ${league.teams[shown.opp].abbrev}: ${c.label}, in your game plan for them`}
                            >
                              Vs {league.teams[shown.opp].abbrev}
                            </button>
                            {always && (
                              <button className="btn xs ghost" onClick={() => applyCand(c, 'always', shown.opp)} aria-label={`Always: ${c.label}, in your tactics for every game`}>
                                Always
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </main>
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
      <section className="card tx-hero" aria-label="Projection">
        <div className="over tx-hero-over">
          {me.abbrev} vs {them.abbrev} · {r.games} games
        </div>
        <Statline
          items={[
            { k: 'Win %', v: p0(r.winPct) },
            { k: 'Net rtg', v: signed(r.net), s: `95% ± ${f1(SIGMAS * r.netSE)}`, color: r.net >= 0 ? 'var(--good)' : 'var(--bad)' },
            { k: 'Score', v: `${Math.round(r.ptsFor)}-${Math.round(r.ptsAgainst)}`, s: `Pace ${f1(r.pace)}` },
          ]}
        />
      </section>
      <Section
        title="Shot profile"
        right={
          <span className="tx-legend">
            <i style={{ background: cMe }} /> {me.abbrev} <i style={{ background: cThem }} /> {them.abbrev}
          </span>
        }
      >
        <div className="card col tx-bars">
          <CompareBar label="eFG%" a={r.shot.efg * 100} b={r.oppShot.efg * 100} colorA={cMe} colorB={cThem} />
          <CompareBar label="Rim rate" a={r.shot.rimRate * 100} b={r.oppShot.rimRate * 100} colorA={cMe} colorB={cThem} neutral />
          <CompareBar label="3PA rate" a={r.shot.threeRate * 100} b={r.oppShot.threeRate * 100} colorA={cMe} colorB={cThem} neutral />
          <CompareBar label="FTA / FGA" a={r.shot.ftRate * 100} b={r.oppShot.ftRate * 100} colorA={cMe} colorB={cThem} />
          <CompareBar label="Turnover %" a={r.shot.tov * 100} b={r.oppShot.tov * 100} colorA={cMe} colorB={cThem} higherBetter={false} />
          <CompareBar label="Off. rebound %" a={r.shot.orb * 100} b={r.oppShot.orb * 100} colorA={cMe} colorB={cThem} />
        </div>
      </Section>
      <Section title="Your play types" right={<span className="tiny dim">share · pts/poss</span>}>
        <div className="card flush tx-table">
          {pts.map(([k, v]) => (
            <div key={k} className="tx-tr tx-tr2">
              <span className="ellipsis">{FINISH_LABEL[k as FinishType] ?? k}</span>
              <span className="num dim2">{p0(v.freq)}</span>
              <span className={`num bold ${v.ppp >= 1.1 ? 'good' : v.ppp < 0.9 ? 'bad' : ''}`}>{v.ppp.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="tx-note">League average ≈ 1.13 points per possession.</div>
      </Section>
      <Section title="Who gets the ball" right={<span className="tiny dim">per game</span>}>
        <div className="card flush tx-table">
          <div className="tx-tr tx-tr5 tx-th">
            <span>Player</span>
            <span>Min</span>
            <span>Pts</span>
            <span>Usg</span>
            <span>TS%</span>
          </div>
          {users.slice(0, 10).map((u) => (
            <div key={u.p.pid} className="tx-tr tx-tr5">
              <span className="ellipsis">{names(u.p.pid)}</span>
              <span className="num dim2">{f1(u.min)}</span>
              <span className="num bold">{f1(u.pts)}</span>
              <span className="num dim2">{p1(u.usg)}</span>
              <span className="num dim2">{p1(u.ts)}</span>
            </div>
          ))}
        </div>
      </Section>
      {impacts.length > 0 && (
        <Section title="What drives the result" right={<span className="tiny dim">pts per game</span>}>
          <div className="card flush list">
            {impacts.map(([k, v]) => {
              const advice = v < 0 ? impactAdvice(k, tactics) : undefined;
              const X = teamRef(v >= 0 ? me : them);
              const Y = teamRef(v >= 0 ? them : me);
              return (
                <div key={`${k}${v >= 0 ? '+' : '-'}`} className="tx-imp">
                  <span className={`tx-imp-v num ${v >= 0 ? 'good' : 'bad'}`}>{signed(v)}</span>
                  <span className="grow">
                    <span className="tx-imp-t">{impactSentence(k, X, Y)}</span>
                    {advice && <span className="tx-imp-a">{adviceFor(advice, league.settings.complexity)}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
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
    <span className="tx-legend">
      <i className="before" /> Before <i className="after" /> After
    </span>
  );
  return (
    <>
      <section className="card tx-hero" aria-label="Verdict">
        <div className="tx-verdict">
          <div className="grow">
            <div className="over">Verdict</div>
            <div className={`tx-verdict-t ${tone}`}>{verdict}</div>
          </div>
          <div className="tx-verdict-d">
            <span className={`tx-delta big num ${tone || 'dim2'}`}>{signed(d)}</span>
            <span className="tiny dim">net / 100 poss</span>
          </div>
        </div>
        <div className="tx-note tx-verdict-n">95% range ± {f1(margin)}: only a change bigger than that is called.</div>
        <Statline
          items={[
            { k: 'Win %', v: p0(after.winPct), s: `was ${p0(before.winPct)}` },
            { k: 'Off rtg', v: f1(after.ortg), s: signed(after.ortg - before.ortg) },
            { k: 'Def rtg', v: f1(after.drtg), s: signed(after.drtg - before.drtg) },
          ]}
        />
      </section>
      <Section title="Shot profile shift" right={legend}>
        <div className="card col tx-bars">
          <CompareBar label="eFG%" a={before.shot.efg * 100} b={after.shot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
          <CompareBar label="3PA rate" a={before.shot.threeRate * 100} b={after.shot.threeRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" neutral />
          <CompareBar label="Rim rate" a={before.shot.rimRate * 100} b={after.shot.rimRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" neutral />
          <CompareBar label="Opp eFG%" a={before.oppShot.efg * 100} b={after.oppShot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" higherBetter={false} />
          <CompareBar label="Opp turnover %" a={before.oppShot.tov * 100} b={after.oppShot.tov * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
        </div>
      </Section>
      <Section title="Play types">
        <div className="card flush tx-table">
          <div className="tx-tr tx-trw tx-th">
            <span>Type</span>
            <span>Share</span>
            <span>Pts/poss</span>
          </div>
          {keys.map((k) => {
            const b = before.playTypes[k] ?? { freq: 0, ppp: 0 };
            const a = after.playTypes[k] ?? { freq: 0, ppp: 0 };
            return (
              <div key={k} className="tx-tr tx-trw">
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
          <div className="card flush tx-table">
            <div className="tx-tr tx-trw tx-th">
              <span>Set</span>
              <span>Runs</span>
              <span>Pts/poss</span>
            </div>
            {setKeys.map((k) => {
              const b = before.sets?.[k];
              const a = after.sets?.[k];
              const ppp = (x?: { runs: number; pts: number }) => (x?.runs ? (x.pts / x.runs).toFixed(2) : '—');
              return (
                <div key={k} className="tx-tr tx-trw">
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
        <div className="card flush tx-table">
          {players.map(({ p, a, b }) => (
            <div key={p.pid} className="tx-tr tx-trw">
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
