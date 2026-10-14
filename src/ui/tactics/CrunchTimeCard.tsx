import type { ActionType, Player, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import { ACTION_META } from '../../core/sim/tactics';
import { Card, Chips, Help, Toggle } from '../components/ui';
import { rosterNames } from '../stats';

/**
 * Expert game management: who takes over in crunch time, the play after your timeouts, and whether
 * your assistant adjusts at breaks in the games you don't coach live.
 */
export function CrunchTimeCard({ t, edit, players }: { t: Tactics; edit: (fn: (t: Tactics) => void) => void; players: Player[] }) {
  const names = rosterNames(players);
  // the go-to player is picked from the top of the depth chart (and stays listed while he's hurt)
  const options = players.slice(0, 9);
  const goTo = t.manage.goTo ?? -1;
  if (goTo >= 0 && !options.some((p) => p.pid === goTo)) {
    const p = players.find((x) => x.pid === goTo);
    if (p) options.push(p);
  }
  return (
    <Card
      title="Crunch time"
      right={
        <Help title="Crunch time">
          <p>
            In the last two minutes of the 4th quarter or overtime, with the game within five, the ball finds your go-to player much more often and the offense runs more of what he
            does best. The rest of the game is untouched.
          </p>
          <p>After one of your timeouts (yours or the staff's), the next half-court trip opens with the after-timeout play.</p>
          <p>In live games you can also call plays from the bench in the last two minutes.</p>
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
            options={[{ id: -1, label: 'None' }, ...options.map((p) => ({ id: p.pid, label: `${names(p.pid)}${p.injury ? ' (inj.)' : ''}` }))]}
          />
        </div>
        <div>
          <div className="small bold" style={{ marginBottom: 6 }}>
            After-timeout play
          </div>
          <Chips
            label="After-timeout play"
            value={t.manage.ato ?? 'none'}
            onChange={(a: ActionType | 'none') => edit((tt) => void (tt.manage.ato = a === 'none' ? null : a))}
            options={[{ id: 'none' as const, label: 'Any' }, ...ACTIONS.map((a) => ({ id: a, label: ACTION_META[a].label }))]}
          />
          {t.manage.ato && (
            <div className="small dim" style={{ marginTop: 6 }}>
              {ACTION_META[t.manage.ato].help}
            </div>
          )}
        </div>
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
