// The staff's debrief at the top of a game's recap (the live final card and the report's Debrief
// tab): the lead assistant's verdict, the edges that decided it in points, your game plan's counters
// graded on what each was aimed at, your moves in a live game and what each did, and what to do next time, the fix one tap away for the plan against this
// opponent or for every game (or, for playing a step slow, the practice focus between games).
import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import type { GameReport } from '../../core/analysis/gameReport';
import { debrief, type DebriefAdvice, type PlanGrade } from '../../core/analysis/debrief';
import { leadAssistant } from '../../core/ai/assistant';
import { applyPatch } from '../../core/sim/tactics';
import { persistableTactics, planFor, setPlanItem } from '../../core/league/gamePlans';
import { shortName } from '../../core/league/helpers';
import { useStore } from '../../state/store';
import { act } from '../../state/actions';
import { PREP_META } from '../../core/sim/familiarity';
import { Section, Tag } from './ui';
import { AssistantHead, MovesList, NoteCard } from './StaffCards';

/** What to do next time, shown before "more". */
const ADVICE_SHOWN = 2;

/** A plan counter's grade, in the words a live move's verdict uses. */
const PLAN_VERDICT: Record<PlanGrade['verdict'], { label: string; tone: string }> = {
  better: { label: 'Worked', tone: 'good' },
  worse: { label: "Didn't work", tone: 'bad' },
  same: { label: 'No clear difference', tone: 'dim' },
  few: { label: 'Too few to tell', tone: 'dim' },
};

export function Debrief({ res, league, report }: { res: GameResult; league: League; report: GameReport }) {
  const d = useMemo(() => debrief(league, res, report), [league, res, report]);
  const [allAdvice, setAllAdvice] = useState(false);
  const assistant = useMemo(() => leadAssistant(league), [league]);
  const simming = useStore((s) => !!s.sim);
  const me = league.userTid;
  const opp = league.teams[d.opp];
  const nameOf = (pid: number) => (league.players[pid] ? shortName(league, league.players[pid]) : `#${pid}`);
  const inPlan = new Set(planFor(league, d.opp)?.items.map((it) => it.id));
  const apply = (a: DebriefAdvice, scope: 'plan' | 'always') => {
    if (!a.patch) return;
    const ok = act(scope === 'plan' ? 'Game plan' : 'Tactics', (l) => {
      if (scope === 'always') {
        const tm = l.teams[l.userTid];
        tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, a.patch), tm.tactics), manual: true };
      } else setPlanItem(l, d.opp, { id: a.id, label: a.label ?? a.title, group: a.group, patch: a.patch! });
    });
    if (ok) useStore.getState().toast(scope === 'plan' ? `Plan vs ${opp.abbrev}: ${a.label}` : `Your tactics: ${a.label}`, 'good');
  };
  /** A practice focus the advice asks for, from the next practice day. */
  const practice = (a: DebriefAdvice) => {
    if (!a.prep) return;
    const focus = a.prep;
    if (act('Practice', (l) => void (l.teams[l.userTid].prep = focus))) useStore.getState().toast(`Practice: ${PREP_META[focus].label}.`, 'good');
  };
  const prepNow = league.teams[me].prep ?? 'balanced';
  const us = res.home.tid === me ? league.teams[res.home.tid] : league.teams[res.away.tid];
  // (a move a live game made: its team's abbreviations for the lines)
  const abbrevs = { us: us.abbrev, them: opp.abbrev };
  return (
    <div className="gd-debrief">
      <AssistantHead name={assistant.name} initials={assistant.initials} read={d.headline} />

      {d.decided.length > 0 && (
        <div className="lv-notes reads">
          {/* (the two biggest: the rest are on the report's Why) */}
          {d.decided.slice(0, 2).map((f) => (
            <NoteCard
              key={f.title}
              note={{
                id: f.title,
                kind: 'read',
                tone: f.pts >= 0 ? 'good' : 'bad',
                title: f.title,
                text: f.detail,
                fig: { v: `${f.pts > 0 ? '+' : f.pts < 0 ? '−' : ''}${Math.abs(f.pts).toFixed(1)}`, unit: 'pts' },
                actions: [],
                rank: 0,
              }}
              onAct={() => {}}
            />
          ))}
        </div>
      )}

      {d.frame && <p className="gd-frame small dim2">{d.frame}</p>}

      {d.plan.length > 0 && (
        <Section title="Your plan">
          <div className="lv-mv card flush list">
            {d.plan.map((g) => (
              <div key={g.label} className="lv-mv-row">
                <div className="grow lv-mv-tx">
                  <div className="lv-mv-what">{g.label}</div>
                  <div className="lv-mv-line small dim2">
                    {g.line}
                    {g.worth && ` The staff measured it at ${g.worth} over many games.`}
                  </div>
                </div>
                <span className={`lv-mv-v ${PLAN_VERDICT[g.verdict].tone}`}>
                  {g.verdict === 'better' && <Check size={12} aria-hidden="true" />}
                  {PLAN_VERDICT[g.verdict].label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {res.moves && res.moves.length > 0 && (
        <Section
          title="Your moves"
          right={
            d.moves && (
              <span className="gd-tally">
                {d.moves.working > 0 && <Tag tone="good">{d.moves.working} working</Tag>}
                {d.moves.notWorking > 0 && <Tag tone="bad">{d.moves.notWorking} not</Tag>}
              </span>
            )
          }
        >
          <MovesList moves={res.moves} abbrevs={abbrevs} nameOf={nameOf} />
        </Section>
      )}

      {d.advice.length > 0 && (
        <Section title="Next time">
          <div className="gd-next card flush list">
            {(allAdvice ? d.advice : d.advice.slice(0, ADVICE_SHOWN)).map((a) => (
              <div key={a.id} className="gd-next-row">
                <div className="gd-next-t">{a.title}</div>
                <div className="gd-next-x small dim2">{a.text}</div>
                {a.prep && (
                  <div className="gd-next-acts">
                    {prepNow === a.prep ? (
                      <Tag tone="good">Practice: {PREP_META[a.prep].label}</Tag>
                    ) : (
                      <button className="btn xs" disabled={simming} onClick={() => practice(a)}>
                        Practice: {PREP_META[a.prep].label}
                      </button>
                    )}
                  </div>
                )}
                {a.patch && (
                  <div className="gd-next-acts">
                    {inPlan.has(a.id) ? (
                      <Tag tone="good">In the plan vs {opp.abbrev}</Tag>
                    ) : (
                      d.meetAgain && (
                        <button className="btn xs" disabled={simming} onClick={() => apply(a, 'plan')}>
                          {a.label}: vs {opp.abbrev}
                        </button>
                      )
                    )}
                    <button className={`btn xs ${d.meetAgain ? 'text' : ''}`} disabled={simming} onClick={() => apply(a, 'always')}>
                      {d.meetAgain ? 'For every game' : `${a.label}: every game`}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!allAdvice && d.advice.length > ADVICE_SHOWN && (
              <button className="gv-more" onClick={() => setAllAdvice(true)}>
                <ChevronDown size={15} aria-hidden="true" /> {d.advice.length - ADVICE_SHOWN} more
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
