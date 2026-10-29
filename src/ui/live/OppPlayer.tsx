import type { Tactics } from '../../core/types';
import { keepFigures, madeAtt } from '../../core/format';
import type { DrawnPlayer } from './drawn';
import { PlayerLine } from './MyPlayer';
import { HACK_BELOW, hackThreshold } from './pills';
import { hacks, startHacking, stopHacking } from '../../core/sim/tactics';
import { Help } from '../components/ui';
import { Term } from '../components/Glossary';

/**
 * One of their players: his line tonight and his free throws, and the ways to go after him or stop
 * him: a Hack-a, double him (the star plan), and attacking the man he guards. Everything goes through your tactics, so the game's journal keeps it.
 */
export function OppPlayer({
  p,
  name,
  tactics,
  clock,
  q,
  apply,
}: {
  p: DrawnPlayer;
  name: string;
  tactics: Tactics;
  /** Seconds left in the period (a hack isn't allowed in its last two minutes). */
  clock: number;
  /** The period: hacking from now on starts a game plan's later Hack-a quarter now. */
  q: number;
  apply: (fn: (t: Tactics) => void) => void;
}) {
  const ft = Math.round(p.ftPct * 100);
  const hacking = hacks(tactics.manage, p);
  const doubled = tactics.defense.starTarget === p.pid && tactics.defense.starPlan === 'double';
  const hunting = tactics.offense.huntTarget === p.pid;
  return (
    <div className="lv-ps">
      <PlayerLine p={p} />

      <div className="lv-ps-blk">
        <div className="over">
          Stop him
          <Help title="Double him">
            <p>Send a second defender when he attacks: make the others beat you. It pays against a scorer who can&apos;t pass out of it, with non-shooters around him.</p>
          </Help>
        </div>
        <button
          className={`btn ${doubled ? 'primary' : ''}`}
          aria-pressed={doubled}
          onClick={() =>
            apply((t) => {
              t.defense.starPlan = doubled ? 'none' : 'double';
              t.defense.starTarget = doubled ? null : p.pid;
            })
          }
        >
          {doubled ? `Doubling ${name}` : 'Double him'}
        </button>
      </div>

      <div className="lv-ps-blk">
        <div className="over">
          Attack his man
          <Help title="Attacking a defender">
            <p>Your isolations, post-ups and ball screens go at the player he guards. It costs some ball movement.</p>
            <p>Worth it against a weak defender, costly against a good one.</p>
          </Help>
        </div>
        <button className={`btn block ${hunting ? 'primary' : ''}`} aria-pressed={hunting} onClick={() => apply((t) => void (t.offense.huntTarget = hunting ? null : p.pid))}>
          {hunting ? `Attacking ${name}` : `Attack ${name}`}
        </button>
      </div>

      <div className="lv-ps-blk">
        <div className="over">
          <Term id="hack">Hack-a-player</Term>
        </div>
        <div className="small">
          <b className="num">{ft}%</b> from the line
          {p.fta > 0 ? <span className="dim num"> · {keepFigures(madeAtt(p.ftm, p.fta))} tonight</span> : null}
        </div>
        {hacking ? (
          <button className="btn block" onClick={() => apply((t) => stopHacking(t.manage))}>
            Stop Hack-a-player
          </button>
        ) : p.ftPct < HACK_BELOW ? (
          <>
            <button className="btn block" onClick={() => apply((t) => startHacking(t.manage, hackThreshold(p.ftPct), q))}>
              Hack-a-{name}
            </button>
            <div className="tiny dim">Fouled away from the ball whenever he plays{clock < 120 ? ', from the next period' : ''}. Never in a period&apos;s last two minutes.</div>
          </>
        ) : (
          <div className="tiny dim">At {ft}% he&apos;s no target: fouling him gives away points.</div>
        )}
      </div>
    </div>
  );
}
