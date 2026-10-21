// The Plan's counters: what the staff would change against this team, each with exactly what it
// changes in the Tactics screen's words, why, and the numbers behind it (the ones the numbers back
// first). Add puts one in the plan, Always in your tactics for every game.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { applyPatch } from '../../../core/sim/tactics';
import { counterCandidates, tacticsWithCounter, type Candidate } from '../../../core/ai/advisor';
import { effectiveTactics, persistableTactics, planFor, setPlanItem } from '../../../core/league/gamePlans';
import type { League } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act } from '../../../state/actions';
import { Help, Section, Tag } from '../../components/ui';
import { changesLine, screenChanges } from '../../tactics/changes';

/** Counters shown before "more": the ones the numbers back come first. */
const SHOWN = 4;

export function CountersCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const user = league.userTid;
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const inPlan = new Set(planFor(league, opp)?.items.map((it) => it.id));
  const [all, setAll] = useState(false);
  const them = league.teams[opp];

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

  const visible = all ? cands : cands.slice(0, SHOWN);
  const mine = league.teams[user].tactics;
  return (
    <Section
      title="Counters"
      right={
        <Help title="Counters">
          <p>
            The staff drafts these from their roster, their playbook and, once they have played enough games, their numbers (the ones the numbers back come first). Adding one
            replaces any item of the same kind in your plan; Always puts it in your tactics for every game.
          </p>
        </Help>
      }
    >
      <div className="card flush list">
        {!cands.length && <div className="mu-empty">Your plan already covers what the staff sees.</div>}
        {visible.map((c) => {
          const added = inPlan.has(c.id);
          // a counter that only names their players (attacking one defender) has nothing to keep for every game
          const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
          return (
            <div key={c.id} className="mu-cand">
              <div className="mu-cand-top">
                <span className="grow lr-name">{c.label}</span>
                {added ? (
                  <Tag tone="good">In plan</Tag>
                ) : (
                  <>
                    {always && (
                      <button className="btn xs text" disabled={simming} onClick={() => apply(c, 'always')} aria-label={`${c.label}: into your tactics for every game`}>
                        Always
                      </button>
                    )}
                    <button className="btn xs" disabled={simming} onClick={() => apply(c, 'game')} aria-label={`Add ${c.label} to your plan against ${them.abbrev}`}>
                      Add
                    </button>
                  </>
                )}
              </div>
              <CounterChanges league={league} opp={opp} c={c} />
              <div className="mu-note">{c.why}</div>
              {c.evidence && (
                <div className="mu-ev">
                  <b>By the numbers:</b> {c.evidence}
                </div>
              )}
            </div>
          );
        })}
        {!all && cands.length > SHOWN && (
          <button className="gs-more" onClick={() => setAll(true)}>
            <ChevronDown size={15} aria-hidden="true" /> {cands.length - SHOWN} more
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
