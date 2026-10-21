// The staff's plan at the top of the matchup page's Preview: the lead assistant's read of them (who to
// watch) and his plan for tonight (the counters the numbers back first, one per kind), each a tap into
// your game plan or all of them at once. What they run and where to hit them are on Scout; what the
// team knows of the tactics (and the practice focus) on Plan, with the full counters, the star plan and
// the rest; who guards whom on Matchups.
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { League } from '../../../core/types';
import { counterCandidates, scoutTeam, type Candidate } from '../../../core/ai/advisor';
import { leadAssistant } from '../../../core/ai/assistant';
import { planFor, setPlanItem } from '../../../core/league/gamePlans';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act } from '../../../state/actions';
import { Section, Tag } from '../../components/ui';
import { plural } from '../../../core/format';
import { AssistantHead } from '../../components/StaffCards';

/** Counters the briefing proposes: the ones the numbers back first, one per game-plan group. */
const PLAN_MAX = 3;

export function Briefing({ league, opp, onPlan }: { league: League; opp: number; onPlan: () => void }) {
  const assistant = useMemo(() => leadAssistant(league), [league]);
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const simming = useStore((s) => !!s.sim);
  const them = league.teams[opp];
  const plan = planFor(league, opp);
  // one per group, the ones with evidence first (counterCandidates already sorts them so), leaving
  // out what the plan already settles (a counter in a plan item's group would undo it: a coverage
  // after the staff's own zone)
  const taken = new Set((plan?.items ?? []).map((it) => it.group ?? it.id));
  const picks: Candidate[] = [];
  for (const c of cands) if (picks.length < PLAN_MAX && !taken.has(c.group ?? c.id) && !picks.some((p) => (p.group ?? p.id) === (c.group ?? c.id))) picks.push(c);
  const more = (plan?.items.length ?? 0) > 0;
  const add = (list: Candidate[]) => {
    const ok = act('Game plan', (l) => {
      for (const c of list) setPlanItem(l, opp, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) });
    });
    if (ok) useStore.getState().toast(list.length > 1 ? `Plan vs ${them.abbrev}: the staff's ${list.length} changes` : `Plan vs ${them.abbrev}: ${list[0].label}`, 'good');
  };
  const threat = scout.threats[0];
  const read = threat ? `Watch ${threat.name}. ${threat.why}` : scout.summary;
  return (
    <Section title="The staff's plan">
      <div className="mu-brief">
        <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
        {picks.length > 0 ? (
          <div className="card flush list mu-brief-plan">
            {more && <div className="list-divider">The staff would also add</div>}
            {picks.map((c) => (
              <div key={c.id} className="mu-brief-item">
                <div className="grow">
                  <div className="lr-name">{c.label}</div>
                  <div className="lr-meta mu-brief-why">{c.evidence ?? c.why}</div>
                </div>
                <button className="btn xs" disabled={simming} onClick={() => add([c])} aria-label={`Add ${c.label} to your plan against ${them.abbrev}`}>
                  Add
                </button>
              </div>
            ))}
            <div className="mu-brief-go">
              {/* (one extra counter has its own Add) */}
              {(!more || picks.length > 1) && (
                <button className="btn sm" disabled={simming} onClick={() => add(picks)}>
                  <Check size={15} aria-hidden="true" /> {more ? 'Add all' : <>Use the staff&apos;s plan</>}
                </button>
              )}
              <button className="btn sm text" onClick={onPlan}>
                Open the plan
              </button>
            </div>
          </div>
        ) : (
          <div className="small dim">
            {plan ? (
              <>
                Your plan covers what the staff sees: <Tag tone="info">{plural(plan.items.length, 'change')}</Tag>
              </>
            ) : (
              'The staff would play them with your playbook as it is.'
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
