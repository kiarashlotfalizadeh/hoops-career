import type { GameResult, League } from '../../core/types';
import { Card } from './ui';
import { fmtClock, periodLabel } from '../stats';

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
    <Card title="Adjustments" right={<span className="tiny dim">{list.length ? 'both benches, by quarter' : 'before the game'}</span>}>
      <div className="col" style={{ gap: 10 }}>
        {plan.length > 0 && (
          <div className="col" style={{ gap: 4 }}>
            <div className="tiny dim upper bold">Their game plan</div>
            <div className="small">
              <b>{league.teams[opp]?.abbrev}</b> {plan.join(', ')}.
            </div>
          </div>
        )}
        {quarters.map((q) => (
          <div key={q} className="col" style={{ gap: 4 }}>
            <div className="tiny dim upper bold">{periodLabel(q)}</div>
            {list
              .filter((a) => a.q === q)
              .map((a, i) => {
                const tid = tids[a.t];
                const mine = tid === league.userTid;
                return (
                  <div key={i} className="row small top" style={{ gap: 8 }}>
                    <span className="num dim" style={{ width: 40, flex: 'none' }}>
                      {fmtClock(a.clock)}
                    </span>
                    <span className="grow">
                      <b style={{ color: mine ? 'var(--accent-text)' : undefined }}>{mine ? 'Your staff' : league.teams[tid]?.abbrev}</b> {a.text}.
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
        <div className="tiny dim">
          {plan.length ? 'Their coach came in with a plan for what your team does best. ' : ''}
          {list.length ? 'A coach changes one thing a quarter when the other team is exploiting it, more often the better he is at adjustments.' : ''}
        </div>
      </div>
    </Card>
  );
}
