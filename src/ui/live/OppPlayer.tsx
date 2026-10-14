import type { Settings, Tactics } from '../../core/types';
import { Kpi } from '../components/ui';
import type { DrawnPlayer } from './drawn';
import { HACK_BELOW, hackThreshold } from './pills';
import { hacks, startHacking, stopHacking } from '../../core/sim/tactics';

/** One of their players on the floor: his line tonight, his free throws, and the shortcuts to go after him (or stop). */
export function OppPlayer({
  p,
  name,
  tactics,
  complexity,
  clock,
  q,
  apply,
}: {
  p: DrawnPlayer;
  name: string;
  tactics: Tactics;
  complexity: Settings['complexity'];
  /** Seconds left in the period (a hack isn't allowed in its last two minutes). */
  clock: number;
  /** The period: hacking from now on starts a game plan's later Hack-a quarter now. */
  q: number;
  apply: (fn: (t: Tactics) => void) => void;
}) {
  const ft = Math.round(p.ftPct * 100);
  const hacking = hacks(tactics.manage, p);
  const target = tactics.defense.starTarget === p.pid ? tactics.defense.starPlan : 'none';
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="grid4">
        <Kpi k="PTS" v={p.pts} />
        <Kpi k="FG" v={`${p.fgm}/${p.fga}`} />
        <Kpi k="Fouls" v={p.fouls} />
        <Kpi k="Energy" v={`${Math.round(p.energy * 100)}%`} />
      </div>
      <div className="small">
        Free throws: <b>{ft}%</b> shooter
        {p.fta > 0 ? (
          <span className="dim">
            {' '}
            · {p.ftm}/{p.fta} tonight
          </span>
        ) : null}
        .
      </div>
      {hacking ? (
        <button className="btn block" onClick={() => apply((t) => stopHacking(t.manage))}>
          Stop the Hack-a
        </button>
      ) : p.ftPct < HACK_BELOW ? (
        <>
          <button className="btn primary block" onClick={() => apply((t) => startHacking(t.manage, hackThreshold(p.ftPct), q))}>
            Hack-a-{name}
          </button>
          <div className="tiny dim">
            Your defense fouls him away from the ball whenever he's on the floor
            {clock < 120 ? ', from the next period: not in the last two minutes of one' : ' (not in the last two minutes of a period)'}.
          </div>
        </>
      ) : (
        <div className="tiny dim">At {ft}% from the line he's no Hack-a target: fouling him gives away points.</div>
      )}
      {complexity !== 'simple' && (
        <div className="row" style={{ gap: 8 }}>
          {(['deny', 'double'] as const).map((plan) => (
            <button
              key={plan}
              className={`btn grow ${target === plan ? 'primary' : ''}`}
              aria-pressed={target === plan}
              onClick={() =>
                apply((t) => {
                  const off = t.defense.starTarget === p.pid && t.defense.starPlan === plan;
                  t.defense.starPlan = off ? 'none' : plan;
                  t.defense.starTarget = off ? null : p.pid;
                })
              }
            >
              {plan === 'deny' ? 'Deny him' : 'Double him'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
