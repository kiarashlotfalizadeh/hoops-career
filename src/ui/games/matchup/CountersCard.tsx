// The Plan's counters: what the staff would change against this team, each with what it measured
// worth in tonight's game (see useCounterWorth: the gains first, the costs behind "more"), what it
// costs in familiarity tonight, exactly what it changes in the Tactics screen's words, why, and the
// numbers behind it. Add puts one in the plan (with its worth, which the win chance counts); Always,
// confirmed, in your tactics for every game.
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { applyPatch } from '../../../core/sim/tactics';
import { counterCandidates, RISKY, tacticsWithCounter, type Candidate } from '../../../core/ai/advisor';
import { systemFamiliarity } from '../../../core/league/practice';
import { freshFamiliarity, optionsOf, optValue } from '../../../core/sim/familiarity';
import { teamPlayers } from '../../../core/league/helpers';
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
            A <Term id="counter">counter</Term> is a change aimed at one opponent. The staff drafts these from their roster, their playbook and, once they have played enough games,
            their numbers. Then it plays your next game against them a few hundred times with and without each one: the number is the points a game it adds (Even: too close to
            call). Gains come first; a counter in your plan counts in the win chance at its number.
          </p>
          <p>
            One the team hasn&apos;t drilled costs familiarity tonight (a step slow where it&apos;s new): each says how much before you add it. Adding one replaces any item of the
            same kind in your plan; Always, confirmed, puts it in your tactics for every game.
          </p>
        </Help>
      }
    >
      <div className="card flush list">
        {!cands.length && <div className="mu-empty">Your plan already covers what the staff sees.</div>}
        {cands.length > 0 && shown === 0 && !all && <div className="mu-empty">By the staff&apos;s numbers, none of its counters beats how you play them now.</div>}
        {visible.map((c) => {
          const added = inPlan.has(c.id);
          // a counter that only names their players (attacking one defender) has nothing to keep for every game
          const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
          return (
            <div key={c.id} className="mu-cand">
              <div className="mu-cand-top">
                <span className="grow lr-name">{c.label}</span>
                <WorthTag w={worth?.get(c.id)} measuring={!!measuring && !worth} />
                {added ? (
                  <Tag tone="good">In plan</Tag>
                ) : (
                  <>
                    {always && (
                      <button
                        className="btn xs text mu-always"
                        disabled={simming}
                        onClick={() => {
                          if (armed !== c.id) return setArmed(c.id);
                          setArmed(null);
                          apply(c, 'always');
                        }}
                        aria-label={armed === c.id ? `Confirm: ${c.label} into your tactics for every game` : `${c.label}: into your tactics for every game`}
                      >
                        {armed === c.id ? 'Confirm' : 'Always'}
                      </button>
                    )}
                    <button className="btn xs" disabled={simming} onClick={() => apply(c, 'game')} aria-label={`Add ${c.label} to your plan against ${them.abbrev}`}>
                      Add
                    </button>
                  </>
                )}
              </div>
              {armed === c.id && !added && (
                <div className="mu-fam small" role="status">
                  Always puts it in your tactics for every game, not just against the {them.name}. Tap again to confirm.
                </div>
              )}
              {!added && <FamCost league={league} opp={opp} c={c} />}
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
        {!all && cands.length > shown && (
          <button className="gs-more" onClick={() => setAll(true)}>
            <ChevronDown size={15} aria-hidden="true" /> {cands.length - shown} more
          </button>
        )}
      </div>
    </Section>
  );
}

/**
 * What a counter costs in familiarity tonight, as the Familiarity card's "Tonight" reads it: "−11%
 * familiarity tonight: new to this team", or null when it costs under a point.
 */
export function famCostText(league: League, opp: number, c: Candidate): string | null {
  const me = league.userTid;
  const base = effectiveTactics(league, opp);
  const t = tacticsWithCounter(league, opp, c);
  const drop = Math.round(systemFamiliarity(league, me, base).overall) - Math.round(systemFamiliarity(league, me, t).overall);
  if (drop < 1) return null;
  const team = league.teams[me];
  const fam = team.fam ?? freshFamiliarity(team, teamPlayers(league, me));
  const was = new Set(optionsOf(base));
  const low = Math.min(
    100,
    ...optionsOf(t)
      .filter((k) => !was.has(k))
      .map((k) => optValue(fam, k)),
  );
  return `−${drop}% familiarity tonight${low < RISKY ? ': new to this team' : ''}`;
}

/** A counter's familiarity cost tonight, if it has one. */
export function FamCost({ league, opp, c }: { league: League; opp: number; c: Candidate }) {
  const text = useLeagueMemo(() => famCostText(league, opp, c), [league, opp, c]);
  return text ? <div className="mu-fam small warn">{text}</div> : null;
}

/** What adding a counter would change now, in the Tactics screen's words. */
function CounterChanges({ league, opp, c }: { league: League; opp: number; c: Candidate }) {
  const line = useLeagueMemo(() => changesLine(screenChanges(effectiveTactics(league, opp), tacticsWithCounter(league, opp, c))), [league, opp, c]);
  return line ? <div className="mu-changes">{line}</div> : null;
}

/** A counter's measured worth (or that it's being measured: the first few the staff measures). */
export function WorthTag({ w, measuring }: { w?: CounterWorth; measuring: boolean }) {
  if (!w) return measuring ? <span className="mu-worth dim small">Measuring…</span> : null;
  const { text, tone } = worthText(w);
  return (
    <span className={`mu-worth num ${tone ?? 'dim'}`} title={`Measured ${w.raw >= 0 ? '+' : ''}${w.raw.toFixed(1)} a game, ±${w.se.toFixed(1)}: shown as what's likely real`}>
      {text}
    </span>
  );
}
