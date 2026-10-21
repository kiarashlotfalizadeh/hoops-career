// Tactics → Instructions, the offense's controls by phase of play. In possession: the pace and how
// often each action is run, the shot profile (threes, the rim, hunting mismatches, the hot hand) and the
// set package. In transition: pushing after stops and the offensive glass (with the players' own
// glass duties). Each control marks the playbook's own setting, and says when it sits off what the
// team has drilled.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { ActionType, Familiarity, Player, Tactics } from '../../core/types';
import { ACTION_META, GLASS_META } from '../../core/sim/tactics';
import { effectiveTactics } from '../../core/league/gamePlans';
import { nextUserGame } from '../../core/analysis/preview';
import { shortName } from '../../core/league/helpers';
import { Help, Section, Toggle } from '../components/ui';
import { SetPackageCard } from './SetPackageCard';
import { tweak } from './edit';
import { offPresetOf } from './PlaybookLine';
import { Lv } from './Lv';

type Props = { t: Tactics; fam: Familiarity };

/** In possession: the pace of the half court, and how often each action is run (one card: one block, not two). */
export function ActionsSection({ t, fam }: Props) {
  const pv = offPresetOf(t).values;
  return (
    <Section
      title="Pace and actions"
      right={
        <Help title="Pace and actions">
          <p>
            <b>Pace:</b> seconds you take per half-court possession. Faster means more possessions, slightly more turnovers and more fatigue.
          </p>
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
        <Lv label="Pace" k="pace" level="pace" t={t} fam={fam} mark={pv.pace} set={(tt, x) => void (tt.offense.pace = x)} />
        {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
          <Lv key={a} label={ACTION_META[a].label} k={`a_${a}`} level="action" t={t} fam={fam} mark={pv.actions[a]} set={(tt, x) => void (tt.offense.actions[a] = x)} />
        ))}
      </div>
    </Section>
  );
}

/** In possession: the shots you look for, and whom you attack. */
export function ShotProfile({ t, fam }: Props) {
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
            <b>Hunt mismatches:</b> isolations and ball screens at the weakest defender. Strong against switching defenses. A game plan can name the defender to attack instead.
          </p>
          <p>
            <b>Feed the hot hand:</b> players who have made several shots in a row get more touches.
          </p>
        </Help>
      }
    >
      <div className="card col tx-group">
        <Lv label="Three-point emphasis" k="threePoint" level="threePoint" t={t} fam={fam} mark={pv.threePoint} set={(tt, x) => void (tt.offense.threePoint = x)} />
        <Lv label="Attack the rim" k="rimAttack" level="rimAttack" t={t} fam={fam} mark={pv.rimAttack} set={(tt, x) => void (tt.offense.rimAttack = x)} />
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

/** In possession, all of it: pace and actions, the shot profile and the set package. */
export function InPossession({ t, fam, players }: Props & { players: Player[] }) {
  return (
    <>
      <ActionsSection t={t} fam={fam} />
      <ShotProfile t={t} fam={fam} />
      <SetPackageCard t={t} edit={tweak} players={players} />
    </>
  );
}

/** In transition: pushing after stops, and who crashes the glass when a shot goes up. */
export function InTransition({ t, fam, players }: Props & { players: Player[] }) {
  const pv = offPresetOf(t).values;
  const glass = t.offense.glass ?? {};
  const crash = players.filter((p) => glass[p.pid] === 1);
  const back = players.filter((p) => glass[p.pid] === -1);
  const league = useLeague();
  const names = (ps: Player[]) => ps.map((p) => shortName(league, p)).join(', ');
  return (
    <>
      <Section
        title="After a stop"
        right={
          <Help title="Push in transition">
            <p>How often you attack before the defense sets after rebounds and steals. Transition is the most efficient offense in basketball, at a cost in legs.</p>
          </Help>
        }
      >
        <div className="card col tx-group">
          <Lv label="Push in transition" k="transition" level="transition" t={t} fam={fam} mark={pv.transition} set={(tt, x) => void (tt.offense.transition = x)} />
        </div>
      </Section>
      <Section
        title="When a shot goes up"
        right={
          <Help title="The offensive glass">
            <p>
              <b>Crash the offensive glass:</b> more offensive rebounds and second chances, but more fast breaks allowed the other way. Transition defense (Defensive transition)
              sets how hard the rest sprint back.
            </p>
            {([1, -1] as const).map((g) => (
              <p key={g}>
                <b>{GLASS_META[g].label}:</b> {GLASS_META[g].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="card col tx-group">
          <Lv label="Crash the offensive glass" k="crashBoards" level="crashBoards" t={t} fam={fam} mark={pv.crashBoards} set={(tt, x) => void (tt.offense.crashBoards = x)} />
          <Link to="/team/tactics?tab=players" className="tx-hunt">
            <span className="grow">
              {crash.length || back.length ? (
                <>
                  {crash.length > 0 && <>Always crash: {names(crash)}. </>}
                  {back.length > 0 && <>Always get back: {names(back)}.</>}
                </>
              ) : (
                'Everyone crashes or gets back as the team does. Set a player’s own duty on Players.'
              )}
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </Section>
    </>
  );
}
