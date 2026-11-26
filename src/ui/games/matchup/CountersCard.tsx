// The Plan's counters: what the staff would look at against this team, in the order its scouting rules
// draft them, each a row with the staff's reason and Add. A row opens on the rest: exactly what it
// changes in the Tactics screen's words, the scouting behind it, and Every game (confirmed: in your
// tactics for every game).
//
// No verdict on a row, on purpose. The staff measures every counter (useCounterWorth), and until
// 2026-11-26 the row said what it found ("Should help", the costs folded away): the playtest's coach
// added whatever read green and never opened the scouting. Which counter is right for this opponent
// is the coach's call now, from the reasons here and the Brief; the measuring stays under the hood
// and the game's report says what the plan was worth. The one figure a row may carry is a fact: what a
// counter measured worth the last time he played it against them (playedCounters).
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { applyPatch } from '../../../core/sim/tactics';
import { counterCandidates, tacticsWithCounter, type Candidate } from '../../../core/ai/advisor';
import { counterItem, useCounterWorth } from './useCounterWorth';
import { effectiveTactics, persistableTactics, planFor, playedCounters, setPlanItem, type PlayedCounter } from '../../../core/league/gamePlans';
import type { League } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act } from '../../../state/actions';
import { Help, Section, Tag } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { changesLine, screenChanges } from '../../tactics/changes';
import { fmtDate, teamCity } from '../../../core/league/helpers';
import { ptsFig } from '../../../core/analysis/staffWords';

/** Counters shown before "more": the first the staff's rules draft. */
const SHOWN = 5;

export function CountersCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const user = league.userTid;
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  // (measured for the plan's records and the report: nothing here shows a reading)
  const worth = useCounterWorth(league, opp)?.worth;
  // what he has already played against them this season, and what it measured worth then: facts
  const played = useLeagueMemo(() => playedCounters(league, opp), [league, opp]);
  const inPlan = new Set(planFor(league, opp)?.items.map((it) => it.id));
  // (the ones in the plan when the screen opened stand still; one added since lands)
  const had = useRef<Set<string> | null>(null);
  had.current ??= new Set(inPlan);
  const [all, setAll] = useState(false);
  // Always writes into your tactics for every game: a second tap confirms it (it waits while it shows:
  // one that lapsed on a timer read as a Confirm tap that did nothing)
  const [armed, setArmed] = useState<string | null>(null);
  const them = league.teams[opp];

  const apply = (c: Candidate, scope: 'game' | 'always') => {
    const ok = act(scope === 'game' ? 'Game plan' : 'Tactics', (l) => {
      if (scope === 'always') {
        const tm = l.teams[l.userTid];
        // a star target or a matchup names this opponent's player: kept tactics go after each opponent's own star
        tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, c.patch), tm.tactics), manual: true };
      } else setPlanItem(l, opp, counterItem(c, worth?.get(c.id)));
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
            A <Term id="counter">counter</Term> is a change aimed at one opponent. The line under it is why the staff would look at it: its read of their roster and numbers, not a
            promise.
          </p>
          <p>Which one is right against them is your call. After the game, the report says what your plan was worth.</p>
        </Help>
      }
    >
      <div className="card flush list">
        {!cands.length && <div className="mu-empty">Your plan already covers what the staff sees.</div>}
        {visible.map((c) => {
          const added = inPlan.has(c.id);
          const last = played.get(c.label);
          // a counter that only names their players (attacking one defender) has nothing to keep for every game
          const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
          return (
            <div key={c.id} className={`mu-cand${added && !had.current!.has(c.id) ? ' mu-added' : ''}`}>
              <details className="mu-cand-d">
                <summary className="mu-cand-s">
                  <span className="grow mu-cand-t">
                    <span className="lr-name">{c.label}</span>
                    <span className="mu-why">{c.why}</span>
                    {last && <LastTime league={league} last={last} />}
                  </span>
                  <ChevronDown size={16} className="mu-cand-c" aria-hidden="true" />
                </summary>
                <div className="mu-cand-b">
                  <CounterChanges league={league} opp={opp} c={c} />
                  {c.evidence && <div className="mu-ev">{c.evidence}</div>}
                  {always && !added && (
                    <div className="mu-cand-foot">
                      <button
                        className="btn xs ghost"
                        disabled={simming}
                        onClick={() => {
                          if (armed !== c.id) return setArmed(c.id);
                          setArmed(null);
                          apply(c, 'always');
                        }}
                        aria-label={armed === c.id ? `Confirm: ${c.label} into your tactics for every game` : `${c.label}: into your tactics for every game`}
                      >
                        {armed === c.id ? 'Confirm' : 'Every game'}
                      </button>
                      {armed === c.id && (
                        <span className="mu-fam small" role="status">
                          Not just against {teamCity(league, them)}. Tap again to confirm.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </details>
              <span className="mu-cand-act">
                {added ? (
                  <Tag tone="good">In plan</Tag>
                ) : (
                  <button className="btn xs" disabled={simming} onClick={() => apply(c, 'game')} aria-label={`Add ${c.label} to your plan against ${them.abbrev}`}>
                    Add
                  </button>
                )}
              </span>
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

/** A counter he has played against them before: the game, and what the staff measured it worth in that night's plan. A fact, so a figure. */
function LastTime({ league, last }: { league: League; last: PlayedCounter }) {
  const when = fmtDate(league.season, last.day, { month: 'short', day: 'numeric' });
  return (
    <span className="mu-played num">
      Played {when} ({last.won ? 'W' : 'L'}){last.pts !== undefined ? ` · measured ${ptsFig(last.pts)} a game in that plan` : ''}
    </span>
  );
}
