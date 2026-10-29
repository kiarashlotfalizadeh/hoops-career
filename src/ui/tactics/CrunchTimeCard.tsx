import type { ActionType, Player, SetId, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import { ACTION_META } from '../../core/sim/tactics';
import { SETS, SET_IDS, isSetId } from '../../core/sim/sets';
import { Help, Section } from '../components/ui';
import { rosterNames } from '../stats';
import { PickRow } from './Pick';

/**
 * Match's crunch time: who takes over in crunch time, and the play after your timeouts (an action, or
 * one of the sets for a player you name or the best fit on the floor).
 */
export function CrunchTimeCard({ t, edit, players }: { t: Tactics; edit: (fn: (t: Tactics) => void) => void; players: Player[] }) {
  const names = rosterNames(players);
  // the go-to player is picked from the top of the depth chart (and stays listed while he's hurt)
  const options = players.slice(0, 9);
  const listed = (pid: number | null | undefined) => {
    if (pid == null || pid < 0 || options.some((p) => p.pid === pid)) return options;
    const p = players.find((x) => x.pid === pid);
    return p ? [...options, p] : options;
  };
  const goTo = t.manage.goTo ?? -1;
  const ato = t.manage.ato ?? 'none';
  const atoPid = t.manage.atoPid ?? -1;
  // a set, or an isolation, can be run for one player
  const forOne = isSetId(ato) || ato === 'iso';
  const playerSub = (p: Player) => `${p.pos} · OVR ${p.ovr}${p.injury ? ' · Out' : ''}`;
  return (
    <Section
      title="Crunch time"
      right={
        <Help title="Crunch time">
          <p>
            <b>Go-to player:</b> in a close game&apos;s last two minutes, the ball finds him much more. The offense runs more of what he does best.
          </p>
          <p>
            <b>After-timeout play:</b> your next half-court trip after a timeout opens with it. A set is run for the player you name, else the best fit.
          </p>
          <p>In live games you call the late plays yourself, built around your go-to player.</p>
        </Help>
      }
    >
      <div className="card flush list">
        <PickRow
          label="Go-to player"
          value={goTo}
          onChange={(pid: number) => edit((tt) => void (tt.manage.goTo = pid < 0 ? null : pid))}
          help="He gets the ball much more in the last two minutes of a close game."
          options={[{ id: -1, label: 'None' }, ...listed(t.manage.goTo).map((p) => ({ id: p.pid, label: names(p.pid), sub: playerSub(p) }))]}
        />
        <PickRow
          label="After-timeout play"
          value={ato}
          onChange={(a: ActionType | SetId | 'none') =>
            edit((tt) => {
              tt.manage.ato = a === 'none' ? null : a;
              // the player stays named only for a play that's run for one
              if (!(isSetId(a) || a === 'iso')) delete tt.manage.atoPid;
            })
          }
          help="It opens your next half-court trip after a timeout."
          options={[
            { id: 'none' as const, label: 'Any' },
            ...ACTIONS.map((a) => ({ id: a, label: ACTION_META[a].label, sub: ACTION_META[a].help, group: 'Actions' })),
            ...SET_IDS.map((id) => ({ id, label: SETS[id].name, sub: `${SETS[id].what} For ${SETS[id].forWho}.`, group: 'Sets' })),
          ]}
        />
        {forOne && (
          <PickRow
            label="Run it for"
            value={atoPid}
            onChange={(pid: number) =>
              edit((tt) => {
                if (pid < 0) delete tt.manage.atoPid;
                else tt.manage.atoPid = pid;
              })
            }
            options={[{ id: -1, label: ato === 'iso' ? 'Auto' : 'Best fit' }, ...listed(t.manage.atoPid).map((p) => ({ id: p.pid, label: names(p.pid), sub: playerSub(p) }))]}
          />
        )}
      </div>
    </Section>
  );
}
