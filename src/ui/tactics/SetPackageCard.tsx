import type { Player, SetId, Tactics } from '../../core/types';
import { MAX_SETS, SETS, SET_IDS, SET_K, bestFor, fitPlayer, setFit, setPackage } from '../../core/sim/sets';
import { Card, Help, Tag } from '../components/ui';
import { rosterNames } from '../stats';
import { isOut } from '../../core/availability';

/**
 * The set package (Offense, from Advanced depth): up to four named sets the half court mixes in now
 * and then, each for the player on the floor who fits it best (when one fits well enough). Every set
 * shows who on the roster fits it, its look, what beats it and what it costs.
 */
export function SetPackageCard({ t, edit, players }: { t: Tactics; edit: (fn: (t: Tactics) => void) => void; players: Player[] }) {
  const names = rosterNames(players);
  const pkg = setPackage(t);
  // the rotation's top nine, available, as the sets weigh them with your roles
  const pool = players
    .filter((p) => !isOut(p))
    .slice(0, 9)
    .map((p) => fitPlayer(p, t));
  const toggle = (id: SetId) =>
    edit((tt) => {
      const cur = setPackage(tt);
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_SETS ? [...cur, id] : cur;
      if (next.length) tt.offense.sets = next;
      else delete tt.offense.sets;
    });
  const pctEach = Math.round(SET_K.rate * 100);
  return (
    <Card
      title="Set package"
      right={
        <Help title="Set package">
          <p>
            A set gets the ball to the player it's for and goes for its look. It has edges against some defenses and none against others, and it takes a second or two more of the
            shot clock than your usual offense. Nothing in it makes anyone shoot better.
          </p>
          <p>
            Defenses read sets: every time one is run in a game, its look is a little less open the next time and its passes get jumped a little more often (sooner against a coach
            who rates high at tactics). A set is at its best the first time or two, and run over and over it costs you.
          </p>
          <p>
            From your package the half court runs one on about {pctEach} trips in 100 for each set in it (favoring the ones run least so far), never in a late-game situation (a
            last shot, a 2-for-1, a lead to run out, a deficit to chase), after an offensive rebound or with under 14 seconds to play with, and only for a player on the floor who
            fits it well (fit {SET_K.fit} or more). Your staff stops running a set once their defense is on it; you can still call it yourself. In live games you can call any set
            yourself (Plays), and in Game Mgmt (Expert depth) one can be your after-timeout play.
          </p>
        </Help>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="small dim">
          {pkg.length ? `${pkg.length} of ${MAX_SETS}: ${pkg.map((id) => SETS[id].short).join(', ')}.` : `Pick up to ${MAX_SETS}. With none, your offense runs no sets on its own.`}
        </div>
        {SET_IDS.map((id) => {
          const s = SETS[id];
          const on = pkg.includes(id);
          const best = bestFor(id, pool);
          const fit = best ? Math.round(setFit(id, best)) : 0;
          const full = !on && pkg.length >= MAX_SETS;
          return (
            <div key={id} className="col" style={{ gap: 4 }}>
              <div className="row between" style={{ gap: 8 }}>
                <button className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={full} onClick={() => toggle(id)}>
                  {s.name}
                </button>
                {best && (
                  <span className="tiny dim2" style={{ textAlign: 'right' }}>
                    For {names(best.pid)} <Tag tone={fit >= SET_K.fit ? 'good' : undefined}>fit {fit}</Tag>
                  </span>
                )}
              </div>
              <div className="tiny dim">
                {s.what} The look: {s.look}. Works against {s.beats}; not against {s.killedBy}.{s.note ? ` ${s.note}` : ''} Takes {s.time} s more of the shot clock.
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
