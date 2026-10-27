// Tactics → Instructions, the offense's phases. In possession: three headline decisions (what the half
// court plays through, the shot profile, the tempo), then Fine-tune (the five action weights, attacking
// the rim, hunting mismatches, the hot hand), and the set package as its own compact card. In
// transition: after a stop, when a shot goes up (one dial over the glass and getting back) and the
// press, then Fine-tune (the glass and getting back apart, the players' own glass duties). Each control
// marks the style's own setting, and says when it sits off what the team has drilled.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { ActionType, Familiarity, Player, PressMode, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import { ACTION_META, FOCUS_META, GLASS_LEVELS, GLASS_META, PLAY_FOCI, PRESS_META, applyFocus, focusOf, glassLevel, setGlassLevel, type PlayFocus } from '../../core/sim/tactics';
import { effectiveTactics } from '../../core/league/gamePlans';
import { nextUserGame } from '../../core/analysis/preview';
import { shortName } from '../../core/league/helpers';
import { Chips, Help, Levels, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { tweak } from './edit';
import { defPresetOf, offPresetOf } from './PlaybookLine';
import { optLabel } from './DefenseTab';
import { CostLine } from './Cost';
import { Lv } from './Lv';

type Props = { t: Tactics; fam: Familiarity };

const ACTION_KEYS = ACTIONS.map((a) => `a_${a}` as const);
const GLASS_NAMES = GLASS_LEVELS.map((l) => l.label) as unknown as readonly [string, string, string, string, string];

/** A focus's name, or the mix's when the weights aren't near any. */
const focusName = (f: PlayFocus | null) => (f ? FOCUS_META[f].label : 'Custom mix');

/** In possession's headline decisions: what the half court plays through, the shot profile, the tempo. */
export function InPossession({ t, fam }: Props) {
  const pv = offPresetOf(t).values;
  const focus = focusOf(t.offense);
  const mine = focusOf(pv);
  return (
    <div className="card col tx-group">
      <div className="tx-lv">
        <div className="slider-label tx-label">
          Play through
          <Help title="Play through">
            <p>What the half court runs most: one choice that sets how often each action is run. Fine-tune keeps all five weights, to set your own mix.</p>
            {PLAY_FOCI.map((f) => (
              <p key={f}>
                <b>{FOCUS_META[f].label}:</b> {FOCUS_META[f].help}
              </p>
            ))}
            <p>Whatever you pick, the offense still drifts to what the five on the floor run best: a pick-and-roll focus with no ball handler on the floor runs other things.</p>
          </Help>
        </div>
        <Chips
          label="Play through"
          value={focus ?? 'custom'}
          onChange={(x: PlayFocus | 'custom') => x !== 'custom' && tweak((tt) => applyFocus(tt.offense, x))}
          options={[
            ...PLAY_FOCI.map((f) => ({ id: f as PlayFocus | 'custom', label: optLabel(FOCUS_META[f].label, f === mine) })),
            ...(focus ? [] : [{ id: 'custom' as const, label: 'Custom mix' }]),
          ]}
        />
        <CostLine fam={fam} t={t} keys={ACTION_KEYS} drilled={(dt) => focusName(focusOf(dt.offense))} />
      </div>
      <Lv label="Shot profile" k="threePoint" level="threePoint" t={t} fam={fam} mark={pv.threePoint} set={(tt, x) => void (tt.offense.threePoint = x)} />
      <Lv label="Tempo" k="pace" level="pace" t={t} fam={fam} mark={pv.pace} set={(tt, x) => void (tt.offense.pace = x)} />
    </div>
  );
}

/** What's in In possession's Fine-tune, in a few words. */
export const IN_POSS_FINE = 'Action weights, attack the rim, mismatches, hot hand';

/** In possession's fine-tuning: the five action weights, attacking the rim, hunting mismatches, the hot hand. */
export function InPossessionFine({ t, fam }: Props) {
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
    <>
      <div className="tx-fine-h tx-fine-sub">
        <span className="over">How often each action is run</span>
        <Help title="Action weights">
          <p>
            Each half-court trip, the offense picks an action weighted by these settings and by how well the players on the floor can run it. Play through sets all five at once;
            here you set your own mix.
          </p>
          {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
            <p key={a}>
              <b>{ACTION_META[a].label}:</b> {ACTION_META[a].help}
            </p>
          ))}
        </Help>
      </div>
      {ACTIONS.map((a) => (
        <Lv key={a} label={ACTION_META[a].label} k={`a_${a}`} level="action" t={t} fam={fam} mark={pv.actions[a]} set={(tt, x) => void (tt.offense.actions[a] = x)} />
      ))}
      <Lv label="Attack the rim" k="rimAttack" level="rimAttack" t={t} fam={fam} mark={pv.rimAttack} set={(tt, x) => void (tt.offense.rimAttack = x)} />
      <div className="tx-toggles">
        <Toggle
          on={t.offense.huntMismatch}
          onChange={(x) => tweak((tt) => void (tt.offense.huntMismatch = x))}
          label="Hunt mismatches"
          help="Isolations and ball screens at the weakest defender. Strong against switching defenses. A game plan can name the defender to attack instead."
        />
        {hunt && (
          <Link to={`/games/${hunt.opp}`} className="tx-hunt">
            <span className="grow">
              Next game: your plan vs {league.teams[hunt.opp].abbrev} attacks {hunt.name} instead.
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        )}
        <Toggle
          on={t.offense.hotHand}
          onChange={(x) => tweak((tt) => void (tt.offense.hotHand = x))}
          label="Feed the hot hand"
          help="Players who have made several shots in a row get more touches."
        />
      </div>
    </>
  );
}

/** In transition's headline decisions: after a stop, when a shot goes up, the press. */
export function InTransition({ t, fam }: Props) {
  const pv = offPresetOf(t).values;
  const dv = defPresetOf(t).values;
  const mine = glassLevel({ offense: { ...t.offense, crashBoards: pv.crashBoards }, defense: { ...t.defense, getBack: dv.getBack } });
  return (
    <div className="card col tx-group">
      <Lv label="After a stop" k="transition" level="transition" t={t} fam={fam} mark={pv.transition} set={(tt, x) => void (tt.offense.transition = x)} />
      <div className="tx-lv">
        <Levels label="When a shot goes up" value={glassLevel(t) * 25} names={GLASS_NAMES} mark={mine * 25} onChange={(x) => tweak((tt) => setGlassLevel(tt, x / 25))} />
        <CostLine fam={fam} t={t} keys={['crashBoards', 'getBack']} drilled={(dt) => GLASS_LEVELS[glassLevel(dt)].label} />
      </div>
      <div className="tx-lv">
        <div className="slider-label tx-label">
          <Term id="press">Full-court press</Term>
        </div>
        <Chips
          label="Full-court press"
          value={t.defense.press}
          onChange={(x: PressMode) => tweak((tt) => void (tt.defense.press = x))}
          options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({
            id: k,
            label: optLabel(PRESS_META[k].label, k === dv.press, fam, k === 'none' ? null : `press:${k}`),
          }))}
        />
      </div>
    </div>
  );
}

/** What's in In transition's Fine-tune, in a few words. */
export const IN_TRANS_FINE = 'The glass and getting back apart, players’ glass duties';

/** In transition's fine-tuning: the glass and getting back as two settings, and the players' own glass duties. */
export function InTransitionFine({ t, fam, players }: Props & { players: Player[] }) {
  const league = useLeague();
  const pv = offPresetOf(t).values;
  const dv = defPresetOf(t).values;
  const glass = t.offense.glass ?? {};
  const crash = players.filter((p) => glass[p.pid] === 1);
  const back = players.filter((p) => glass[p.pid] === -1);
  const names = (ps: Player[]) => ps.map((p) => shortName(league, p)).join(', ');
  return (
    <>
      <Lv label="Crash the offensive glass" k="crashBoards" level="crashBoards" t={t} fam={fam} mark={pv.crashBoards} set={(tt, x) => void (tt.offense.crashBoards = x)} />
      <Lv label="Transition defense" k="getBack" level="getBack" t={t} fam={fam} mark={dv.getBack} set={(tt, x) => void (tt.defense.getBack = x)} />
      <Link to="/team/tactics" className="tx-hunt">
        <span className="grow">
          {crash.length || back.length ? (
            <>
              {crash.length > 0 && <>Always crash: {names(crash)}. </>}
              {back.length > 0 && <>Always get back: {names(back)}.</>}
            </>
          ) : (
            'Everyone crashes or gets back as the team does. A player’s own glass duty is in his sheet on Tactic.'
          )}
        </span>
        <ChevronRight size={15} aria-hidden="true" />
      </Link>
    </>
  );
}

/** In transition's Help: what each of its decisions does. */
export function InTransitionHelp() {
  return (
    <Help title="In transition">
      <p>
        <b>After a stop:</b> how often you attack before the defense sets after rebounds and steals. Transition is the most efficient offense in basketball, at a cost in legs.
      </p>
      <p>
        <b>When a shot goes up:</b> how many go after the offensive rebound and how hard the rest sprint back. Crashing gets second chances and gives up fast breaks the other way.
        Fine-tune sets the two apart.
      </p>
      {([1, -1] as const).map((g) => (
        <p key={g}>
          <b>{GLASS_META[g].label}:</b> {GLASS_META[g].help}
        </p>
      ))}
      {(Object.keys(PRESS_META) as PressMode[]).map((k) => (
        <p key={k}>
          <b>{PRESS_META[k].label}:</b> {PRESS_META[k].help}
        </p>
      ))}
    </Help>
  );
}

/** In possession's Help: the shot profile and the tempo (Play through has its own). */
export function InPossessionHelp() {
  return (
    <Help title="In possession">
      <p>
        <b>Play through:</b> what the half court runs most (its own ⓘ has each).
      </p>
      <p>
        <b>Shot profile:</b> higher turns mid-range looks into threes. Great with shooters; bad shooting teams lose efficiency.
      </p>
      <p>
        <b>Tempo:</b> seconds you take per half-court possession. Faster means more possessions, slightly more turnovers and more fatigue.
      </p>
      <p>
        A setting moved off what the team has drilled costs <Term id="familiarity">familiarity</Term> until practice and games drill it again: the line under it says how much.
      </p>
    </Help>
  );
}
