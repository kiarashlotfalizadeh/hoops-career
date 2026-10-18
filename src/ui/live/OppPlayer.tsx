import { PLAYER_DEFENSES, type PlayerDefense, type Tactics } from '../../core/types';
import { madeAtt } from '../../core/format';
import type { DrawnPlayer } from './drawn';
import { PlayerLine } from './MyPlayer';
import { HACK_BELOW, hackThreshold } from './pills';
import { PLAYER_D_META, hacks, startHacking, stopHacking } from '../../core/sim/tactics';
import { Help } from '../components/ui';
import { Term } from '../components/Glossary';

/**
 * One of their players: his line tonight and his free throws, and the ways to go after him or stop
 * him: a Hack-a, deny or double him (the star plan), how his defender plays him, and attacking the
 * man he guards. Everything goes through your tactics, so the game's journal keeps it.
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
  const target = tactics.defense.starTarget === p.pid ? tactics.defense.starPlan : 'none';
  const how = tactics.defense.playerD?.[p.pid];
  const hunting = tactics.offense.huntTarget === p.pid;
  const setHow = (d: PlayerDefense) =>
    apply((t) => {
      const pd = { ...t.defense.playerD };
      if (pd[p.pid] === d) delete pd[p.pid];
      else pd[p.pid] = d;
      if (Object.keys(pd).length) t.defense.playerD = pd;
      else delete t.defense.playerD;
    });
  return (
    <div className="ps">
      <PlayerLine p={p} />

      <div className="ps-blk">
        <div className="over">
          Stop him
          <Help title="Deny or double">
            <p>
              <b>Deny:</b> face-guard him: fewer touches, a tired defender.
            </p>
            <p>
              <b>Double:</b> send a second defender when he attacks: make the others beat you.
            </p>
          </Help>
        </div>
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
      </div>

      <div className="ps-blk">
        <div className="over">Guard him</div>
        <div className="chips" role="group" aria-label={`How to guard ${name}`}>
          {PLAYER_DEFENSES.map((d) => (
            <button key={d} className={`chip ${how === d ? 'on' : ''}`} aria-pressed={how === d} title={PLAYER_D_META[d].help} onClick={() => setHow(d)}>
              {PLAYER_D_META[d].label}
            </button>
          ))}
        </div>
        <div className="tiny dim">{how ? PLAYER_D_META[how].help : 'Straight up. Tap one for his defender; again to take it off.'}</div>
      </div>

      <div className="ps-blk">
        <div className="over">
          Attack his man
          <Help title="Attacking a defender">
            <p>Your isolations, post-ups and ball screens go at the player he guards while he plays, at some cost in ball movement.</p>
            <p>Worth it against a weak defender, costly against a good one.</p>
          </Help>
        </div>
        <button className={`btn block ${hunting ? 'primary' : ''}`} aria-pressed={hunting} onClick={() => apply((t) => void (t.offense.huntTarget = hunting ? null : p.pid))}>
          {hunting ? `Attacking ${name}` : `Attack ${name}`}
        </button>
      </div>

      <div className="ps-blk">
        <div className="over">
          <Term id="hack">Hack-a-player</Term>
        </div>
        <div className="small">
          <b className="num">{ft}%</b> from the line
          {p.fta > 0 ? <span className="dim num"> · {madeAtt(p.ftm, p.fta)} tonight</span> : null}
        </div>
        {hacking ? (
          <button className="btn block" onClick={() => apply((t) => stopHacking(t.manage))}>
            Stop the Hack-a
          </button>
        ) : p.ftPct < HACK_BELOW ? (
          <>
            <button className="btn block" onClick={() => apply((t) => startHacking(t.manage, hackThreshold(p.ftPct), q))}>
              Hack-a-{name}
            </button>
            <div className="tiny dim">Fouled away from the ball whenever he plays{clock < 120 ? ', from the next period' : ''} (never in a period&apos;s last two minutes).</div>
          </>
        ) : (
          <div className="tiny dim">At {ft}% he&apos;s no target: fouling him gives away points.</div>
        )}
      </div>
    </div>
  );
}
