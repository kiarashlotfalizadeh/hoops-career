// The Lab itself, one panel with two homes: the Lab screen (/lab: project your plan against anyone,
// or compare your tactics before and after an edit) and the matchup page's Test (against that team:
// project, or rank the staff's counters). Real engine games; nothing is saved until you apply one.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Beaker, Play } from 'lucide-react';
import type { Candidate, CandidateResult, LabSummary } from '../../../core/ai/lab';
import { applyPatch } from '../../../core/ai/lab';
import { counterCandidates, scoutTeam, tacticsWithCounter } from '../../../core/ai/advisor';
import { aiGamePlan, nextMeeting } from '../../../core/ai/opponentPlan';
import { ensureRotation } from '../../../core/league/games';
import { persistableTactics, planFor, setPlanItem } from '../../../core/league/gamePlans';
import { curTeamSeason } from '../../../core/league/helpers';
import type { League, Tactics } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act, touch } from '../../../state/actions';
import { Chips, Section, Segmented, Spinner, scrollBehavior } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { CompareResult } from './CompareResult';
import { CountersResult } from './CountersResult';
import { ProjectionResult } from './ProjectionResult';
import { defaultOpponent, labGameType, labSeed, sideFor, toTactics, type LabMode } from './sides';
import { LabProgress, useLabRunner } from './useLabRunner';
import './lab.css';

const MODE_LABEL: Record<LabMode, string> = { project: 'Project', compare: 'Compare', counters: 'Counters' };

/** What a finished run was for: results only show, and only apply, for the matchup they simulated. */
interface Run {
  opp: number;
  mode: LabMode;
  result?: LabSummary;
  base?: LabSummary;
  cands?: CandidateResult[];
}

/**
 * `fixedOpp`: the matchup page's, against that team only (its slab names them); else an opponent
 * picker. `baseline`: the tactics Compare plays as "before".
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
  const [run, setRun] = useState<Run | null>(null);
  const lab = useLabRunner();
  const simming = useStore((s) => !!s.sim);
  // "opponent:counter id": counters are drafted per opponent and share their ids
  const [applied, setApplied] = useState<string[]>([]);
  const user = league.userTid;
  const noBaseline = mode === 'compare' && !baseline;

  useEffect(() => {
    setRun(null);
  }, [opp, mode, games]);

  const start = async () => {
    touch((l) => {
      ensureRotation(l, user);
      ensureRotation(l, opp);
    });
    const b = sideFor(league, opp, user);
    const seed = labSeed(league, opp);
    const type = labGameType(league);
    let job: Run | undefined;
    if (mode === 'project') {
      job = await lab.run(games, async (w, track) => ({ opp, mode, result: await w.runLab({ a: sideFor(league, user, opp), b, games, seed, type }, track(0)) }));
    } else if (mode === 'compare' && baseline) {
      job = await lab.run(games * 2, async (w, track) => {
        // (the two runs take turns on the worker; each reports its own count)
        const [base, result] = await Promise.all([
          w.runLab({ a: sideFor(league, user, opp, baseline), b, games, seed, type }, track(0)),
          w.runLab({ a: sideFor(league, user, opp), b, games, seed, type }, track(1)),
        ]);
        return { opp, mode, base, result };
      });
    } else if (mode === 'counters') {
      const candidates = counterCandidates(league, user, opp);
      const n = Math.max(20, Math.round(games * 0.75));
      // each counter plays as the plan would play it: in place of the plan's item in its group
      const tested: Candidate[] = candidates.map((c) => ({ ...c, patch: toTactics(tacticsWithCounter(league, opp, c)) }));
      job = await lab.run(n * (candidates.length + 1), async (w, track) => {
        const out = await w.evaluate(sideFor(league, user, opp), b, tested, n, seed, track(0), type);
        const byId = new Map(candidates.map((c) => [c.id, c]));
        // (what goes into the plan is the counter itself, relative to the playbook)
        return { opp, mode, base: out.base, cands: out.results.map((r) => ({ ...r, patch: byId.get(r.id)!.patch })) };
      });
    }
    if (job) setRun(job);
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
  const busy = lab.busy;
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

      {busy && <LabProgress lab={lab} what={mode === 'counters' ? 'each counter' : `${games} games`} />}

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
      {shown?.result && mode === 'project' && <ProjectionResult r={shown.result} league={league} oppTid={shown.opp} />}
      {shown?.result && shown.base && mode === 'compare' && <CompareResult before={shown.base} after={shown.result} league={league} />}
      {shown?.cands && shown.base && <CountersResult league={league} opp={shown.opp} base={shown.base} cands={shown.cands} applied={applied} onApply={applyCand} />}
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
