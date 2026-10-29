// The Plan's counters: what the staff would change against this team, each a row with its measured
// worth in tonight's game as a verdict and one number (see useCounterWorth: the gains first, the
// costs behind "more") and Add. A row opens on the rest: exactly what it changes in the Tactics
// screen's words, why, the numbers behind it, and Always (confirmed: in your tactics for every game).
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { applyPatch } from '../../../core/sim/tactics';
import { counterCandidates, tacticsWithCounter, type Candidate } from '../../../core/ai/advisor';
import { worthCall, type CounterWorth } from '../../../core/ai/counterWorth';
import { byWorth, counterItem, useCounterWorth, worthText } from './useCounterWorth';
import { effectiveTactics, persistableTactics, planFor, setPlanItem } from '../../../core/league/gamePlans';
import type { League } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act } from '../../../state/actions';
import { Help, Section, Tag } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { changesLine, screenChanges } from '../../tactics/changes';

/** Counters shown before "more": the ones the numbers back come first. */
const SHOWN = 4;

export function CountersCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const user = league.userTid;
  const drafted = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const measuring = useCounterWorth(league, opp);
  const worth = measuring?.worth;
  const cands = byWorth(drafted, worth);
  const inPlan = new Set(planFor(league, opp)?.items.map((it) => it.id));
  const [all, setAll] = useState(false);
  // Always writes into your tactics for every game: a second tap confirms it
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
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

  // the costs and the ones it didn't measure wait behind "more": the staff wouldn't play them
  const shown = worth
    ? Math.min(
        SHOWN,
        cands.filter((c) => {
          const w = worth.get(c.id);
          return !!w && worthCall(w) !== 'cost';
        }).length,
      )
    : SHOWN;
  const visible = all ? cands : cands.slice(0, shown);
  const mine = league.teams[user].tactics;
  return (
    <Section
      title="Counters"
      right={
        <Help title="Counters">
          <p>
            A <Term id="counter">counter</Term> is a change aimed at one opponent. Its number is what it adds a game, over hundreds of replays.
          </p>
        </Help>
      }
    >
      <div className="card flush list">
        {!cands.length && <div className="mu-empty">Your plan already covers what the staff sees.</div>}
        {cands.length > 0 && shown === 0 && !all && <div className="mu-empty">By the staff&apos;s numbers, none of its counters beats how you play them now.</div>}
        {visible.map((c) => {
          const added = inPlan.has(c.id);
          const w = worth?.get(c.id);
          // a counter that only names their players (attacking one defender) has nothing to keep for every game
          const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
          return (
            <div key={c.id} className="mu-cand">
              <details className="mu-cand-d">
                <summary className="mu-cand-s">
                  <span className="grow mu-cand-t">
                    <span className="lr-name">{c.label}</span>
                    <WorthTag w={w} measuring={!!measuring && !worth} />
                  </span>
                  <ChevronDown size={16} className="mu-cand-c" aria-hidden="true" />
                </summary>
                <div className="mu-cand-b">
                  <CounterChanges league={league} opp={opp} c={c} />
                  <div className="mu-note">{c.why}</div>
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
                          Not just against the {them.name}. Tap again to confirm.
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
        {!all && cands.length > shown && (
          <button className="gs-more" onClick={() => setAll(true)}>
            <ChevronDown size={15} aria-hidden="true" /> {cands.length - shown} more
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

/**
 * A counter's measured worth as a verdict and one number, the line under its name (or that it's being
 * measured). The raw reading and its ± are its title, a long press down.
 */
export function WorthTag({ w, measuring }: { w?: CounterWorth; measuring: boolean }) {
  if (!w) return measuring ? <span className="mu-worth dim">Measuring…</span> : null;
  const { text, tone } = worthText(w);
  return (
    <span className={`mu-worth ${tone ?? 'dim'}`} title={`Measured ${w.raw >= 0 ? '+' : '−'}${Math.abs(w.raw).toFixed(1)} a game, ±${w.se.toFixed(1)}`}>
      {text}
    </span>
  );
}
