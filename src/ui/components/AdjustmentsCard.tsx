import type { GameResult, League } from '../../core/types';
import { Help, Section } from './ui';
import { gameTime } from '../../core/format';

/**
 * The game plan the other coach brought against you, and both coaches' in-game adjustments by
 * quarter (at breaks and timeouts), for the game report: an AI coach's, and your assistant's when he
 * adjusts in your simmed games. Nothing when there was no plan and nobody adjusted.
 */
export function AdjustmentsCard({ g, league }: { g: GameResult; league: League }) {
  const list = g.adjustments ?? [];
  const plan = g.oppPlan ?? [];
  if (!list.length && !plan.length) return null;
  const tids = [g.home.tid, g.away.tid];
  const opp = g.home.tid === league.userTid ? g.away.tid : g.home.tid;
  const quarters = [...new Set(list.map((a) => a.q))].sort((a, b) => a - b);
  return (
    <Section
      title={
        <h3>
          Adjustments
          <Help title="Adjustments">
            {plan.length > 0 && <p>Their coach came in with a plan for what your team does best.</p>}
            <p>A coach changes one thing a quarter when the other team is exploiting it, more often the better he is at adjustments.</p>
          </Help>
        </h3>
      }
      right={<span className="tiny dim">{list.length ? 'Both benches' : 'Before the game'}</span>}
    >
      <div className="card flush list">
        {plan.length > 0 && (
          <div className="gv-adj">
            <span className="gv-adj-when">Plan</span>
            <span className="grow">
              <b>{league.teams[opp]?.abbrev}</b> {plan.join(', ')}.
            </span>
          </div>
        )}
        {quarters.flatMap((q) =>
          list
            .filter((a) => a.q === q)
            .map((a, i) => {
              const tid = tids[a.t];
              const mine = tid === league.userTid;
              return (
                <div key={`${q}-${i}`} className="gv-adj">
                  <span className="gv-adj-when num">{gameTime(q, a.clock)}</span>
                  <span className="grow">
                    <b className={mine ? 'gv-mine' : undefined}>{mine ? 'Your staff' : league.teams[tid]?.abbrev}</b> {a.text}.
                  </span>
                </div>
              );
            }),
        )}
      </div>
    </Section>
  );
}
