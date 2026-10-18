// The Lab itself, one panel with two homes: the Lab screen (/lab: project your plan against anyone,
// or compare your tactics before and after an edit) and the matchup page's Lab (your plan against
// that team, projected). Real engine games; nothing is saved. The staff's counters are tested on the
// matchup page's Plan, with the same runner.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Beaker, Play } from 'lucide-react';
import type { LabSummary } from '../../../core/ai/lab';
import { scoutTeam } from '../../../core/ai/advisor';
import { aiGamePlan, nextMeeting } from '../../../core/ai/opponentPlan';
import { ensureRotation } from '../../../core/league/games';
import { planFor } from '../../../core/league/gamePlans';
import { curTeamSeason } from '../../../core/league/helpers';
import type { League, Tactics } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { touch } from '../../../state/actions';
import { Chips, Section, Segmented, Spinner, scrollBehavior } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { CompareResult } from './CompareResult';
import { ProjectionResult } from './ProjectionResult';
import { defaultOpponent, labGameType, labSeed, sideFor, type LabMode } from './sides';
import { LabProgress, useLabRunner } from './useLabRunner';
import './lab.css';

const MODE_LABEL: Record<LabMode, string> = { project: 'Project', compare: 'Compare' };

/** What a finished run was for: results only show, and only apply, for the matchup they simulated. */
interface Run {
  opp: number;
  mode: LabMode;
  result?: LabSummary;
  base?: LabSummary;
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
    }
    if (job) setRun(job);
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
      </div>
      <div className="lab-run">
        <Chips
          label="Games to run"
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
          {busy ? <Spinner /> : <Play size={16} fill="currentColor" />} Run {games} games
        </button>
      </div>

      {busy && <LabProgress lab={lab} what={`${games} games`} />}

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
