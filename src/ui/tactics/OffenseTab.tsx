// Tactics → Offense: the playbook it starts from, tempo, how often each action is run, the shot
// profile (threes, the rim, the offensive glass, hunting mismatches, the hot hand) and the set
// package. Each control marks the playbook's own setting.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { ActionType, Player, Tactics } from '../../core/types';
import { ACTION_META, TACTIC_LEVELS } from '../../core/sim/tactics';
import { effectiveTactics } from '../../core/league/gamePlans';
import { nextUserGame } from '../../core/analysis/preview';
import { shortName } from '../../core/league/helpers';
import { Help, Levels, Section, Toggle } from '../components/ui';
import { SetPackageCard } from './SetPackageCard';
import { tweak } from './edit';
import { PlaybookLine, offPresetOf } from './PlaybookLine';

export function OffenseTab({ t, players }: { t: Tactics; players: Player[] }) {
  const pv = offPresetOf(t).values;
  return (
    <>
      <PlaybookLine kind="off" />
      <Section
        title="Tempo"
        right={
          <Help title="Tempo">
            <p>
              <b>Pace:</b> seconds you take per half-court possession. Faster means more possessions, slightly more turnovers and more fatigue.
            </p>
            <p>
              <b>Push in transition:</b> how often you attack before the defense sets after rebounds and steals. Transition is the most efficient offense in basketball.
            </p>
          </Help>
        }
      >
        <div className="card col tx-group">
          <Levels label="Pace" value={t.offense.pace} mark={pv.pace} names={TACTIC_LEVELS.pace} onChange={(x) => tweak((tt) => void (tt.offense.pace = x))} />
          <Levels
            label="Push in transition"
            value={t.offense.transition}
            mark={pv.transition}
            names={TACTIC_LEVELS.transition}
            onChange={(x) => tweak((tt) => void (tt.offense.transition = x))}
          />
        </div>
      </Section>
      <Section
        title="Actions"
        right={
          <Help title="How actions are chosen">
            <p>
              Each half-court trip, the offense picks an action weighted by these settings and by how well the players on the floor can run it. A pick-and-roll-heavy plan with no
              ball handler on the floor will naturally drift to other actions.
            </p>
            {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
              <p key={a}>
                <b>{ACTION_META[a].label}:</b> {ACTION_META[a].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="card col tx-group">
          {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
            <Levels
              key={a}
              label={ACTION_META[a].label}
              value={t.offense.actions[a]}
              mark={pv.actions[a]}
              names={TACTIC_LEVELS.action}
              onChange={(x) => tweak((tt) => void (tt.offense.actions[a] = x))}
            />
          ))}
        </div>
      </Section>
      <ShotProfile t={t} />
      <SetPackageCard t={t} edit={tweak} players={players} />
    </>
  );
}

function ShotProfile({ t }: { t: Tactics }) {
  const league = useLeague();
  const pv = offPresetOf(t).values;
  // the defender the game plan for the next opponent attacks (game by game: never in these tactics)
  const hunt = useLeagueMemo(() => {
    const g = nextUserGame(league);
    if (!g) return null;
    const opp = g.home === league.userTid ? g.away : g.home;
    const pid = effectiveTactics(league, opp, g).offense.huntTarget;
    return pid != null && league.players[pid] ? { opp, name: shortName(league, league.players[pid]) } : null;
  }, [league]);
  return (
    <Section
      title="Shot profile"
      right={
        <Help title="Shot profile">
          <p>
            <b>Three-point emphasis:</b> higher settings turn mid-range looks into threes. Great with shooters; bad shooting teams lose efficiency.
          </p>
          <p>
            <b>Attack the rim:</b> how often ball handlers drive to the basket. Draws fouls and opens kick-outs, but runs into rim protectors.
          </p>
          <p>
            <b>Crash the offensive glass:</b> more offensive rebounds and second chances, but more fast breaks allowed the other way.
          </p>
          <p>
            <b>Hunt mismatches:</b> isolations and ball screens at the weakest defender. Strong against switching defenses. A game plan can name the defender to attack instead.
          </p>
          <p>
            <b>Feed the hot hand:</b> players who have made several shots in a row get more touches.
          </p>
        </Help>
      }
    >
      <div className="card col tx-group">
        <Levels
          label="Three-point emphasis"
          value={t.offense.threePoint}
          mark={pv.threePoint}
          names={TACTIC_LEVELS.threePoint}
          onChange={(x) => tweak((tt) => void (tt.offense.threePoint = x))}
        />
        <Levels
          label="Attack the rim"
          value={t.offense.rimAttack}
          mark={pv.rimAttack}
          names={TACTIC_LEVELS.rimAttack}
          onChange={(x) => tweak((tt) => void (tt.offense.rimAttack = x))}
        />
        <Levels
          label="Crash the offensive glass"
          value={t.offense.crashBoards}
          mark={pv.crashBoards}
          names={TACTIC_LEVELS.crashBoards}
          onChange={(x) => tweak((tt) => void (tt.offense.crashBoards = x))}
        />
        <div className="tx-toggles">
          <Toggle on={t.offense.huntMismatch} onChange={(x) => tweak((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" />
          {hunt && (
            <Link to={`/games/${hunt.opp}`} className="tx-hunt">
              <span className="grow">
                Next game: your plan vs {league.teams[hunt.opp].abbrev} attacks {hunt.name} instead.
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          )}
          <Toggle on={t.offense.hotHand} onChange={(x) => tweak((tt) => void (tt.offense.hotHand = x))} label="Feed the hot hand" />
        </div>
      </div>
    </Section>
  );
}
