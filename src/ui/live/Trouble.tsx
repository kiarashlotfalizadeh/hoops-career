import { plural } from '../../core/format';
import type { Tactics } from '../../core/types';
import { Section } from '../components/ui';
import { troubleThresholds } from './alerts';
import type { Drawn } from './drawn';

export type SubFor = (pid: number, exclude?: ReadonlySet<number>, opts?: { ahead?: boolean; q?: number }) => number | undefined;

/**
 * Your five who are tired or in foul trouble, each with the staff's sub a tap away: on the Now view as
 * things stand, in a huddle too, and at a break going into the next period (its foul limit, the break's
 * rest). Nobody in trouble, nothing shows. `skip`: players a staff call already offers to sub.
 */
export function Trouble({
  view,
  side,
  tactics,
  names,
  subFor,
  substitute,
  ahead,
  skip,
}: {
  view: Drawn;
  side: 0 | 1;
  tactics: Tactics;
  names: (pid: number) => string;
  /** The rested bench player the staff would send in for one of yours. */
  subFor: SubFor;
  substitute: (out: number, inn: number) => boolean;
  /** Read going into the next period, at a break. */
  ahead?: boolean;
  skip?: ReadonlySet<number>;
}) {
  const q = view.q;
  const me = view.sides[side];
  const { limit, rest, tiredAt } = troubleThresholds(q, tactics.manage, !!ahead);
  const trouble = me.players
    .filter((p) => me.on.includes(p.pid) && !skip?.has(p.pid))
    // Use the exact foul limit and tired line shared with benchFor so swaps never ping-pong
    .map((p) => ({ p, tired: Math.min(1, p.energy + rest) < tiredAt, fouls: p.fouls >= limit }))
    .filter((x) => x.p.out === 0 && (x.tired || x.fouls))
    .sort((a, b) => a.p.energy - b.p.energy)
    .slice(0, 4);
  if (!trouble.length) return null;
  // one bench player a row: two in trouble never both offer the same man in
  const taken = new Set<number>();
  const subs = new Map<number, number | undefined>();
  for (const { p } of trouble) {
    const sub = subFor(p.pid, taken, { ahead: !!ahead, q });
    subs.set(p.pid, sub);
    if (sub !== undefined) taken.add(sub);
  }
  return (
    <Section title="Tired or in foul trouble">
      <div className="card flush list">
        {trouble.map(({ p, tired, fouls }) => {
          const sub = subs.get(p.pid);
          return (
            <div key={p.pid} className="lv-bk-row">
              <div className="lv-bk-who">
                <div className="bold ellipsis">{names(p.pid)}</div>
                <div className="small warn">{[tired && 'Tired', fouls && plural(p.fouls, 'foul')].filter(Boolean).join(' · ')}</div>
              </div>
              {sub !== undefined ? (
                <button className="btn sm" onClick={() => substitute(p.pid, sub)}>
                  {names(sub)} in
                </button>
              ) : (
                <span className="tiny dim">{fouls && !tired ? 'No clean sub' : 'No rested sub'}</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
