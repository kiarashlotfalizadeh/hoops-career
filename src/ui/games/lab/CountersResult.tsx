// The staff's counters for one team, each played through the same games against your plan now and
// ranked by what it changes; a counter goes into the plan against them, or into your tactics.
import { Check } from 'lucide-react';
import type { CandidateResult, LabSummary } from '../../../core/ai/lab';
import { applyPatch } from '../../../core/ai/lab';
import { persistableTactics } from '../../../core/league/gamePlans';
import type { League } from '../../../core/types';
import { useStore } from '../../../state/store';
import { Help, Section, Statline, Tag } from '../../components/ui';
import { f1, p0, signed } from '../../stats';
import { familySigmas } from './sides';

export function CountersResult({
  league,
  opp,
  base,
  cands,
  applied,
  onApply,
}: {
  league: League;
  opp: number;
  base: LabSummary;
  cands: CandidateResult[];
  applied: string[];
  onApply: (c: CandidateResult, scope: 'game' | 'always', vs: number) => void;
}) {
  const simming = useStore((s) => !!s.sim);
  const vs = league.teams[opp].abbrev;
  const mine = league.teams[league.userTid].tactics;
  return (
    <>
      <section className="lab-hero" aria-label="Your plan now">
        <div className="over">Your plan now</div>
        <Statline
          items={[
            { k: 'Win %', v: p0(base.winPct) },
            { k: 'Net rtg', v: signed(base.net), color: base.net >= 0 ? 'var(--good)' : 'var(--bad)' },
            { k: 'Margin', v: signed(base.ptsFor - base.ptsAgainst) },
          ]}
        />
      </section>
      <Section
        title="Counters, ranked"
        right={
          <Help title="Reading these numbers">
            Each counter plays the same games against them. The change is in net rating (points per 100 possessions) against your plan now. A counter is only called better or worse
            when its change clears the ± range; with several tested at once the range is wider than for one, so a counter that changes nothing rarely looks like a win. More games,
            tighter numbers.
          </Help>
        }
      >
        <div className="card flush list">
          {!cands.length && <div className="mu-empty">Nothing new to test: your plan already covers what the staff sees.</div>}
          {cands.map((c, i, all) => {
            const sig = familySigmas(all.length);
            const good = c.delta > sig * c.se;
            const bad = c.delta < -sig * c.se;
            const tone = good ? 'good' : bad ? 'bad' : '';
            // a counter that only names their players (attacking one defender) has nothing to keep for every game
            const always = JSON.stringify(persistableTactics(applyPatch(mine, c.patch), mine)) !== JSON.stringify(persistableTactics(mine, mine));
            return (
              <div key={c.id} className={`lab-cand ${tone}`}>
                <div className="lab-cand-top">
                  <span className="lab-rank num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="grow lr-name">{c.label}</span>
                  <span className="lab-d">
                    <span className={`lab-delta num ${tone || 'dim2'}`}>{signed(c.delta)}</span>
                    <span className="tiny dim num">± {f1(sig * c.se)}</span>
                  </span>
                </div>
                <div className="mu-note">{c.why}</div>
                {c.evidence && (
                  <div className="mu-ev">
                    <b>By the numbers:</b> {c.evidence}
                  </div>
                )}
                <div className="lab-cand-foot">
                  <Tag tone={good ? 'good' : bad ? 'bad' : undefined}>{good ? 'Better' : bad ? 'Worse' : 'Too close'}</Tag>
                  <span className="tiny dim num grow">win {p0(c.winPct)}</span>
                  {applied.includes(`${opp}:${c.id}`) ? (
                    <Tag tone="good">
                      <Check size={12} /> Added
                    </Tag>
                  ) : (
                    <>
                      <button
                        className={`btn xs ${good ? 'primary' : ''}`}
                        disabled={simming}
                        onClick={() => onApply(c, 'game', opp)}
                        aria-label={`${c.label}: into your plan against ${vs}`}
                      >
                        Plan vs {vs}
                      </button>
                      {always && (
                        <button className="btn xs ghost" disabled={simming} onClick={() => onApply(c, 'always', opp)} aria-label={`${c.label}: into your tactics for every game`}>
                          Always
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
