// The Plan's counters: what the staff would change against this team, each with exactly what it
// changes in the Tactics screen's words, why, and the numbers behind it. Test runs every one through
// the same Lab games against your plan now and ranks them in place, each with its change in net
// rating and that change's range; Add puts one in the plan, Always in your tactics for every game.
import { useState } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import { applyPatch, type Candidate, type CandidateResult, type LabSummary } from '../../../core/ai/lab';
import { counterCandidates, tacticsWithCounter } from '../../../core/ai/advisor';
import { ensureRotation } from '../../../core/league/games';
import { effectiveTactics, persistableTactics, planFor, setPlanItem } from '../../../core/league/gamePlans';
import type { League } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act, touch } from '../../../state/actions';
import { Chips, Help, Section, Spinner, Tag } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { f1, p0, signed } from '../../stats';
import { changesLine, screenChanges } from '../../tactics/changes';
import { familySigmas, labGameType, labSeed, sideFor, toTactics } from '../lab/sides';
import { LabProgress, useLabRunner } from '../lab/useLabRunner';

/** Counters shown before "more": the ones the numbers back come first. */
const SHOWN = 4;

/** A finished test: for the opponent and the plan it was run against. */
interface CounterTest {
  opp: number;
  /** The plan's tactics it ran against (a test of an older plan says so). */
  sig: string;
  base: LabSummary;
  results: CandidateResult[];
}

export function CountersCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const user = league.userTid;
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const now = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const sig = JSON.stringify(now);
  const inPlan = new Set(planFor(league, opp)?.items.map((it) => it.id));
  const lab = useLabRunner();
  const [games, setGames] = useState(40);
  const [test, setTest] = useState<CounterTest | null>(null);
  const [all, setAll] = useState(false);
  const them = league.teams[opp];
  const shown = test?.opp === opp ? test : null;

  const run = async () => {
    touch((l) => {
      ensureRotation(l, user);
      ensureRotation(l, opp);
    });
    const n = Math.max(20, Math.round(games * 0.75));
    // each counter plays as the plan would play it: in place of the plan's item in its group
    const tested: Candidate[] = cands.map((c) => ({ ...c, patch: toTactics(tacticsWithCounter(league, opp, c)) }));
    const byId = new Map(cands.map((c) => [c.id, c]));
    const out = await lab.run(n * (cands.length + 1), (w, track) =>
      w.evaluate(sideFor(league, user, opp), sideFor(league, opp, user), tested, n, labSeed(league, opp), track(0), labGameType(league)),
    );
    // (what goes into the plan is the counter itself, relative to the playbook)
    if (out) setTest({ opp, sig, base: out.base, results: out.results.map((r) => ({ ...r, patch: byId.get(r.id)!.patch })) });
  };

  const apply = (c: Candidate, scope: 'game' | 'always') => {
    const ok = act(scope === 'game' ? 'Game plan' : 'Tactics', (l) => {
      if (scope === 'always') {
        const tm = l.teams[l.userTid];
        // a star target or a matchup names this opponent's player: kept tactics go after each opponent's own star
        tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, c.patch), tm.tactics), manual: true };
      } else setPlanItem(l, opp, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) });
    });
    if (ok) useStore.getState().toast(scope === 'game' ? `Plan vs ${them.abbrev}: ${c.label}` : `Your tactics: ${c.label}`, 'good');
  };

  const list: (Candidate | CandidateResult)[] = shown ? shown.results : cands;
  const visible = all ? list : list.slice(0, SHOWN);
  const sigmas = familySigmas(shown?.results.length ?? 1);
  return (
    <Section
      title="Counters"
      right={
        <Help title="Counters">
          <p>
            The staff drafts these from their roster, their playbook and, once they have played enough games, their numbers (the ones the numbers back come first). Adding one
            replaces any item of the same kind in your plan.
          </p>
          <p>
            Test plays each one through the same Lab games against your plan now and ranks them by the change in <Term id="ortg">net rating</Term> (points per 100 possessions). A
            counter is only called better or worse when its change clears its <Term id="range">± range</Term>; with several tested at once the range is wider, so one that changes
            nothing rarely looks like a win. More games, tighter ranges.
          </p>
        </Help>
      }
    >
      <div className="card flush list">
        {cands.length > 0 || shown ? (
          <div className="mu-run">
            <span className="over">Games</span>
            <Chips
              label="Games to simulate"
              value={games}
              onChange={setGames}
              disabled={lab.busy}
              options={[
                { id: 20, label: '20' },
                { id: 40, label: '40' },
                { id: 100, label: '100' },
              ]}
            />
            <span className="grow" />
            <button
              className="btn sm primary"
              onClick={() => void run()}
              disabled={lab.busy || simming || !cands.length}
              aria-label={`Test the counters over ${games} games against the ${them.name}`}
            >
              {lab.busy ? <Spinner /> : <Play size={14} fill="currentColor" />} Test all
            </button>
          </div>
        ) : null}
        {lab.busy && (
          <div className="mu-runbusy">
            <LabProgress lab={lab} what="each counter" />
          </div>
        )}
        {shown && !lab.busy && (
          <div className="mu-runres">
            <span>
              Your plan now: <b className="num">{p0(shown.base.winPct)}</b> wins, net <b className={`num ${shown.base.net >= 0 ? 'good' : 'bad'}`}>{signed(shown.base.net)}</b> over{' '}
              {shown.base.games} games. Each counter: change in net per 100, ± its range.
            </span>
            {shown.sig !== sig && <span className="warn">Your plan has changed since: test again for numbers against it.</span>}
          </div>
        )}
        {!list.length && <div className="mu-empty">Your plan already covers what the staff sees.</div>}
        {visible.map((c, i) => {
          const r = 'delta' in c ? c : undefined;
          const good = !!r && r.delta > sigmas * r.se;
          const bad = !!r && r.delta < -sigmas * r.se;
          const tone = good ? 'good' : bad ? 'bad' : '';
          const added = inPlan.has(c.id);
          // a counter that only names their players (attacking one defender) has nothing to keep for every game
          const always =
            !!r &&
            JSON.stringify(persistableTactics(applyPatch(league.teams[user].tactics, c.patch), league.teams[user].tactics)) !==
              JSON.stringify(persistableTactics(league.teams[user].tactics, league.teams[user].tactics));
          return (
            <div key={c.id} className={`mu-cand ${tone}`}>
              <div className="mu-cand-top">
                {r && (
                  <span className="mu-rank num" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
                <span className="grow lr-name">{c.label}</span>
                {r ? (
                  <span className="lab-d">
                    <span className={`lab-delta num ${tone || 'dim2'}`}>{signed(r.delta)}</span>
                    <span className="tiny dim num">± {f1(sigmas * r.se)}</span>
                  </span>
                ) : added ? (
                  <Tag tone="good">In plan</Tag>
                ) : (
                  <button className="btn xs" disabled={simming} onClick={() => apply(c, 'game')} aria-label={`Add ${c.label} to the plan`}>
                    Add
                  </button>
                )}
              </div>
              <CounterChanges league={league} opp={opp} c={c} />
              <div className="mu-note">{c.why}</div>
              {c.evidence && (
                <div className="mu-ev">
                  <b>By the numbers:</b> {c.evidence}
                </div>
              )}
              {r && (
                <div className="mu-cand-foot">
                  <Tag tone={good ? 'good' : bad ? 'bad' : undefined}>{good ? 'Better' : bad ? 'Worse' : 'Too close'}</Tag>
                  <span className="tiny dim num grow">win {p0(r.winPct)}</span>
                  {added ? (
                    <Tag tone="good">In plan</Tag>
                  ) : (
                    <>
                      <button
                        className={`btn xs ${good ? 'primary' : ''}`}
                        disabled={simming}
                        onClick={() => apply(c, 'game')}
                        aria-label={`Add ${c.label} to your plan against ${them.abbrev}`}
                      >
                        Add
                      </button>
                      {always && (
                        <button className="btn xs ghost" disabled={simming} onClick={() => apply(c, 'always')} aria-label={`${c.label}: into your tactics for every game`}>
                          Always
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!all && list.length > SHOWN && (
          <button className="gs-more" onClick={() => setAll(true)}>
            <ChevronDown size={15} aria-hidden="true" /> {list.length - SHOWN} more
          </button>
        )}
      </div>
    </Section>
  );
}

/** What adding a counter would change now, in the Tactics screen's words. */
function CounterChanges({ league, opp, c }: { league: League; opp: number; c: Candidate }) {
  const line = useLeagueMemo(() => changesLine(screenChanges(effectiveTactics(league, opp), tacticsWithCounter(league, opp, c))), [league, opp, c]);
  return line ? <div className="mu-changes">{line}</div> : null;
}
