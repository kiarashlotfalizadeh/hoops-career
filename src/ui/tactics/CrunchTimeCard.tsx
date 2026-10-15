import type { ActionType, Player, SetId, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import { ACTION_META } from '../../core/sim/tactics';
import { SETS, SET_IDS, isSetId } from '../../core/sim/sets';
import { Card, Chips, Help, Toggle } from '../components/ui';
import { rosterNames } from '../stats';

/**
 * Expert game management: who takes over in crunch time, the play after your timeouts (an action, or
 * one of the sets for a player you name or the best fit on the floor), and whether your assistant
 * adjusts at breaks in the games you don't coach live.
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
  const help = isSetId(ato) ? `${SETS[ato].what} For ${SETS[ato].forWho}: ${SETS[ato].look}.` : ato !== 'none' ? ACTION_META[ato].help : '';
  return (
    <Card
      title="Crunch time"
      right={
        <Help title="Crunch time">
          <p>
            In the last two minutes of the 4th quarter or overtime, with the game within five, the ball finds your go-to player much more often and the offense runs more of what he
            does best. The rest of the game is untouched.
          </p>
          <p>
            After one of your timeouts (yours or the staff's), the next half-court trip opens with the after-timeout play. A set is run for the player you name while he's on the
            floor, else for the one who fits it best, and like any set it's read a little better each time it's run in a game.
          </p>
          <p>In live games you can also call plays from the bench: from Advanced depth any time (Plays), and in the last two minutes on every depth.</p>
        </Help>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div>
          <div className="small bold" style={{ marginBottom: 6 }}>
            Go-to player
          </div>
          <Chips
            label="Go-to player"
            value={goTo}
            onChange={(pid: number) => edit((tt) => void (tt.manage.goTo = pid < 0 ? null : pid))}
            options={[{ id: -1, label: 'None' }, ...listed(t.manage.goTo).map((p) => ({ id: p.pid, label: `${names(p.pid)}${p.injury ? ' (inj.)' : ''}` }))]}
          />
        </div>
        <div>
          <div className="small bold" style={{ marginBottom: 6 }}>
            After-timeout play
          </div>
          <Chips
            label="After-timeout play"
            value={ato}
            onChange={(a: ActionType | SetId | 'none') =>
              edit((tt) => {
                tt.manage.ato = a === 'none' ? null : a;
                // the player stays named only for a play that's run for one
                if (!(isSetId(a) || a === 'iso')) delete tt.manage.atoPid;
              })
            }
            options={[
              { id: 'none' as const, label: 'Any' },
              ...ACTIONS.map((a) => ({ id: a, label: ACTION_META[a].label })),
              ...SET_IDS.map((id) => ({ id, label: SETS[id].name })),
            ]}
          />
          {help && (
            <div className="small dim" style={{ marginTop: 6 }}>
              {help}
            </div>
          )}
        </div>
        {forOne && (
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>
              Run it for
            </div>
            <Chips
              label="Run the after-timeout play for"
              value={atoPid}
              onChange={(pid: number) =>
                edit((tt) => {
                  if (pid < 0) delete tt.manage.atoPid;
                  else tt.manage.atoPid = pid;
                })
              }
              options={[{ id: -1, label: ato === 'iso' ? 'Auto' : 'Best fit' }, ...listed(t.manage.atoPid).map((p) => ({ id: p.pid, label: names(p.pid) }))]}
            />
          </div>
        )}
        <Toggle
          on={!!t.manage.assistantAdjusts}
          onChange={(x) =>
            edit((tt) => {
              if (x) tt.manage.assistantAdjusts = true;
              else delete tt.manage.assistantAdjusts;
            })
          }
          label="Assistant adjusts in simmed games"
          help="At breaks and timeouts he changes one thing a quarter when the other team is exploiting it, as AI coaches do. Game reports list every change. Never in games you coach live."
        />
      </div>
    </Card>
  );
}
