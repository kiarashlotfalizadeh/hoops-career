import { PLAYER_DEFENSES, type PlayerDefense, type Settings, type Tactics } from '../../core/types';
import { Kpi } from '../components/ui';
import type { DrawnPlayer } from './drawn';
import { HACK_BELOW, hackThreshold } from './pills';
import { PLAYER_D_META, hacks, startHacking, stopHacking } from '../../core/sim/tactics';

/**
 * One of their players on the floor: his line tonight, his free throws, and the shortcuts to go after
 * him (or stop): Hack-a, deny or double him, how to guard him, attack the man he guards.
 */
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
      {complexity !== 'simple' && (
        <>
          <div className="col" style={{ gap: 6 }}>
            <div className="tiny upper dim bold">Guard him</div>
            <div className="chips" role="group" aria-label={`How to guard ${name}`}>
              {PLAYER_DEFENSES.map((d) => (
                <button key={d} className={`chip ${how === d ? 'on' : ''}`} aria-pressed={how === d} title={PLAYER_D_META[d].help} onClick={() => setHow(d)}>
                  {PLAYER_D_META[d].label}
                </button>
              ))}
            </div>
            <div className="tiny dim">{how ? PLAYER_D_META[how].help : 'Straight up. Tap an instruction for his defender; tap it again to take it off.'}</div>
          </div>
          <button className={`btn block ${hunting ? 'primary' : ''}`} aria-pressed={hunting} onClick={() => apply((t) => void (t.offense.huntTarget = hunting ? null : p.pid))}>
            {hunting ? `Attacking ${name}: stop` : `Attack ${name}`}
          </button>
          <div className="tiny dim">
            {hunting
              ? 'Your isolations, post-ups and ball screens go at the player he guards while he plays, at some cost in ball movement.'
              : 'Run isolations, post-ups and ball screens at the player he guards while he plays: worth it against a weak defender, costly against a good one.'}
          </div>
        </>
      )}
    </div>
  );
}
