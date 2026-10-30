import { plural } from '../../core/format';
import type { Tactics } from '../../core/types';
import { Section } from '../components/ui';
import { foulLimit } from './alerts';
import type { Drawn } from './drawn';

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
  subFor: (pid: number) => number | undefined;
  substitute: (out: number, inn: number) => boolean;
  /** Read going into the next period, at a break. */
  ahead?: boolean;
  skip?: ReadonlySet<number>;
}) {
  const q = view.q;
  const me = view.sides[side];
  const limit = foulLimit(ahead ? q + 1 : q, tactics.manage.foulTrouble);
  const rest = !ahead ? 0 : q === 2 ? 0.3 : 0.1;
  const fat = tactics.manage.fatigueSub;
  const trouble = me.players
    .filter((p) => me.on.includes(p.pid) && !skip?.has(p.pid))
    // (one foul from where the staff sits him, and never a single foul: one in the first quarter isn't trouble)
    .map((p) => ({ p, tired: Math.min(1, p.energy + rest) < fat + 0.1, fouls: p.fouls >= Math.max(2, limit - 1) }))
    .filter((x) => x.p.out === 0 && (x.tired || x.fouls))
    .sort((a, b) => a.p.energy - b.p.energy)
    .slice(0, 4);
  if (!trouble.length) return null;
  return (
    <Section title="Tired or in foul trouble">
      <div className="card flush list">
        {trouble.map(({ p, tired, fouls }) => {
          const sub = subFor(p.pid);
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
                <span className="tiny dim">No rested sub</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
