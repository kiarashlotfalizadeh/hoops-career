// The staff's briefing at the top of the matchup page's Preview: the lead assistant's read of them
// (what they run, who to watch, where they can be beaten), what the team knows of tonight's tactics
// (a gap flagged, with the practice focus that closes it), and his plan for tonight (the counters the
// numbers back first, one per kind), each a tap into your game plan or all of them at once. The full
// counters, the star plan, matchups and the rest are on the Plan and Matchups tabs.
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
import { FamBrief } from '../../today/Practice';

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
    <Section title="From your staff">
      <div className="mu-brief">
        <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
        <dl className="mu-brief-facts">
          <div>
            <dt>They run</dt>
            <dd>{scout.offense.slice(0, 2).join(' ')}</dd>
          </div>
          <div>
            <dt>Their defense</dt>
            <dd>{scout.defense.slice(0, 2).join(' ')}</dd>
          </div>
          {scout.weaknesses.length > 0 && (
            <div>
              <dt>Where to hit them</dt>
              {/* the first, best-backed one: the rest are on Scout */}
              <dd>{scout.weaknesses[0]}</dd>
            </div>
          )}
        </dl>
        <FamBrief league={league} opp={opp} tonight />
        {picks.length > 0 ? (
          <div className="mu-brief-plan">
            <div className="over">{more ? 'The staff would also add' : <>The staff&apos;s plan for tonight</>}</div>
            {picks.map((c) => (
              <div key={c.id} className="mu-brief-item">
                <div className="grow">
                  <div className="bold small">{c.label}</div>
                  <div className="tiny dim2">{c.evidence ?? c.why}</div>
                </div>
                <button className="btn xs" disabled={simming} onClick={() => add([c])} aria-label={`Add ${c.label} to your plan against ${them.abbrev}`}>
                  Add
                </button>
              </div>
            ))}
            <div className="mu-brief-go">
              {/* (one extra counter has its own Add) */}
              {(!more || picks.length > 1) && (
                <button className="btn sm primary" disabled={simming} onClick={() => add(picks)}>
                  <Check size={15} aria-hidden="true" /> {more ? 'Add all' : <>Use the staff&apos;s plan</>}
                </button>
              )}
              <button className="btn sm ghost" onClick={onPlan}>
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
