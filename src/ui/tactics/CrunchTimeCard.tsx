import type { ActionType, Player, SetId, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import { ACTION_META } from '../../core/sim/tactics';
import { SETS, SET_IDS, isSetId } from '../../core/sim/sets';
import { Help, Section, Toggle } from '../components/ui';
import { rosterNames } from '../stats';
import { PickRow } from './Pick';

/**
 * Match's crunch time: who takes over in crunch time, the play after your timeouts (an action, or
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
  const playerSub = (p: Player) => `${p.pos} · OVR ${p.ovr}${p.injury ? ' · injured' : ''}`;
  return (
    <Section
      title="Crunch time"
      right={
        <Help title="Crunch time">
          <p>
            In the last two minutes of the 4th quarter or overtime, with the game within five, the ball finds your go-to player much more often and the offense runs more of what he
            does best. The rest of the game is untouched.
          </p>
          <p>
            After one of your timeouts (yours or the staff&apos;s), the next half-court trip opens with the after-timeout play. A set is run for the player you name while he&apos;s
            on the floor, else for the one who fits it best, and like any set it&apos;s read a little better each time it&apos;s run in a game.
          </p>
          <p>
            In live games the play late is yours to call, built around your go-to player: out of a timeout in the last five minutes, and on the last possession of a close game.
          </p>
          <p>
            Assistant adjusts in simmed games: at breaks and timeouts he changes one thing a quarter when the other team is exploiting it, as AI coaches do. Game reports list every
            change. Never in games you coach live.
          </p>
        </Help>
      }
    >
      <div className="card flush list">
        <PickRow
          label="Go-to player"
          value={goTo}
          onChange={(pid: number) => edit((tt) => void (tt.manage.goTo = pid < 0 ? null : pid))}
          help="Gets the ball much more in the last two minutes of a close game."
          options={[{ id: -1, label: 'None' }, ...listed(t.manage.goTo).map((p) => ({ id: p.pid, label: `${names(p.pid)}${p.injury ? ' (inj.)' : ''}`, sub: playerSub(p) }))]}
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
          help="Opens your next half-court trip after your timeouts."
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
        <div className="tx-ctl">
          <Toggle
            // (on unless switched off, whoever runs the tactics: taking over the tactics doesn't turn it
            // off; see buildSimInput). Measured again with injuries on (2026-10-25: 32 team runs over two
            // leagues, 28,160 paired games, each team's first 10-12): +0.05 ± 0.15 a game, about even, so
            // the help says so and quotes no number (DESIGN.md)
            on={t.manage.assistantAdjusts !== false}
            onChange={(x) =>
              edit((tt) => {
                if (x) delete tt.manage.assistantAdjusts;
                else tt.manage.assistantAdjusts = false;
              })
            }
            label="Assistant adjusts in simmed games"
            help="At the breaks of a game you don't watch, the assistant changes one thing the other team is cashing in on (a switch they keep hunting, a roll man punishing your hedge), as AI coaches do, but never the changes that cost your side (Drop to Hedge, backing off the ball). About even by the staff's measurements: it answers what the other bench finds, and some nights that helps and some it doesn't. Live games are yours."
          />
        </div>
      </div>
    </Section>
  );
}
