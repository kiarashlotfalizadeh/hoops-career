// Tactics → System's Advanced drawer: every niche setting in one place, closed until asked for, under
// plain headings (no drawers inside it). Offense: what the half court plays through and each action's
// weight, attacking the rim, hunting mismatches, the hot hand. Transition: running after a stop, the
// offensive glass and getting back, the press, the players' own glass duties. Defense: switching off
// the ball. Crunch time: the go-to player and the after-timeout play. Late game: fouling, 2-for-1,
// late subs, blowouts. Timeouts and substitutions. Simmed games: the assistant's adjustments.
// Nothing here names an opponent: a star to double, a defender to target and players to hack are an
// opponent's Game Plan (Games → the matchup → Game Plan).
import type { ReactNode } from 'react';
import type { ActionType, Player, PressMode, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import { ACTION_META, FOCUS_META, GLASS_META, PLAY_FOCI, PRESS_META, applyFocus, focusOf, type PlayFocus } from '../../core/sim/tactics';
import { shortName } from '../../core/league/helpers';
import { useLeague } from '../../state/store';
import { Chips, Help, Slider, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { CrunchTimeCard } from './CrunchTimeCard';
import { Disclosure } from './Disclosure';
import { optLabel } from './CoreLevers';
import { defPresetOf, offPresetOf } from './PlaybookLine';
import { Lv } from './Lv';
import { tweak } from './edit';

/** A heading inside the drawer, with its Help. */
function Head({ children, help }: { children: ReactNode; help?: ReactNode }) {
  return (
    <div className="tx-fine-h tx-fine-sub">
      <span className="over">{children}</span>
      {help}
    </div>
  );
}

export function Advanced({ t, players }: { t: Tactics; players: Player[] }) {
  const league = useLeague();
  const ov = offPresetOf(t).values;
  const dv = defPresetOf(t).values;
  const m = t.manage;
  const focus = focusOf(t.offense);
  const mine = focusOf(ov);
  const glass = t.offense.glass ?? {};
  const crash = players.filter((p) => glass[p.pid] === 1);
  const back = players.filter((p) => glass[p.pid] === -1);
  const names = (ps: Player[]) => ps.map((p) => shortName(league, p)).join(', ');
  return (
    <Disclosure label="Advanced" meta="Actions, transition, the glass, crunch time, late game, timeouts">
      <div className="col tx-group tx-fine-pad">
        <Head
          help={
            <Help title="Offense">
              <p>
                <b>Play through:</b> what the half court runs most. Each trip picks an action by these settings and what the five run well.
              </p>
              {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
                <p key={a}>
                  <b>{ACTION_META[a].label}:</b> {ACTION_META[a].help}
                </p>
              ))}
            </Help>
          }
        >
          Offense
        </Head>
        <div className="tx-lv">
          <div className="slider-label tx-label">Play through</div>
          <Chips
            label="Play through"
            value={focus ?? 'custom'}
            onChange={(x: PlayFocus | 'custom') => x !== 'custom' && tweak((tt) => applyFocus(tt.offense, x))}
            options={[
              ...PLAY_FOCI.map((f) => ({ id: f as PlayFocus | 'custom', label: optLabel(FOCUS_META[f].label, f === mine) })),
              ...(focus ? [] : [{ id: 'custom' as const, label: 'Custom mix' }]),
            ]}
          />
        </div>
        {ACTIONS.map((a) => (
          <Lv key={a} label={ACTION_META[a].label} level="action" value={t.offense.actions[a]} mark={ov.actions[a]} set={(tt, x) => void (tt.offense.actions[a] = x)} />
        ))}
        <Lv label="Attack the rim" level="rimAttack" value={t.offense.rimAttack} mark={ov.rimAttack} set={(tt, x) => void (tt.offense.rimAttack = x)} />
        <div className="tx-toggles">
          <Toggle
            on={t.offense.huntMismatch}
            onChange={(x) => tweak((tt) => void (tt.offense.huntMismatch = x))}
            label="Hunt mismatches"
            help="Isolations and ball screens at the weakest defender. A game plan can name the defender instead."
          />
          <Toggle
            on={t.offense.hotHand}
            onChange={(x) => tweak((tt) => void (tt.offense.hotHand = x))}
            label="Feed the hot hand"
            help="Three straight makes and a shooter is hot: he shoots better. This gets him the ball more."
          />
        </div>

        <Head
          help={
            <Help title="Transition">
              <p>
                <b>After a stop:</b> how often you run before the defense sets. Running scores best and costs legs.
              </p>
              <p>Crashing the glass wins second chances, gives up fast breaks and tires legs. Missed threes come off long and start more fast breaks.</p>
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
          }
        >
          Transition
        </Head>
        <Lv label="After a stop" level="transition" value={t.offense.transition} mark={ov.transition} set={(tt, x) => void (tt.offense.transition = x)} />
        <Lv label="Crash the offensive glass" level="crashBoards" value={t.offense.crashBoards} mark={ov.crashBoards} set={(tt, x) => void (tt.offense.crashBoards = x)} />
        <Lv label="Transition defense" level="getBack" value={t.defense.getBack} mark={dv.getBack} set={(tt, x) => void (tt.defense.getBack = x)} />
        <div className="tx-lv">
          <div className="slider-label tx-label">
            <Term id="press">Full-court press</Term>
          </div>
          <Chips
            label="Full-court press"
            value={t.defense.press}
            onChange={(x: PressMode) => tweak((tt) => void (tt.defense.press = x))}
            options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: optLabel(PRESS_META[k].label, k === dv.press) }))}
          />
        </div>
        <div className="tx-note">
          {crash.length || back.length ? (
            <>
              {crash.length > 0 && <>Always crash: {names(crash)}. </>}
              {back.length > 0 && <>Always get back: {names(back)}.</>}
            </>
          ) : (
            'Glass duties: everyone goes as the team does. Tap a player on the board to set his.'
          )}
        </div>

        <Head>Defense</Head>
        <div className="tx-toggles">
          <Toggle
            on={t.defense.switchOffBall}
            onChange={(x) => tweak((tt) => void (tt.defense.switchOffBall = x))}
            label="Switch off-ball screens"
            help="Stops handoffs and movement shooters. Switched bigs get driven on, and switched guards get posted up."
          />
        </div>

        <CrunchTimeCard t={t} edit={tweak} players={players} />

        <Head
          help={
            <Help title="Late game">
              <p>
                <b>Foul when up 3:</b> in the final seconds, foul before they can try a tying three.
              </p>
              <p>
                <b>Foul to give:</b> late in a quarter, foul when it only gives them a side out. They inbound with less time.
              </p>
              <p>
                <b>Foul when trailing late:</b> stop the clock with fouls when behind in the final minute.
              </p>
              <p>
                <b>Go for 2-for-1:</b> shoot early with about 35 seconds left, to get the last trip.
              </p>
              <p>
                <b>Offense-defense subs late:</b> your best bench defender comes in on defense in the last seconds of a close game.
              </p>
              <p>
                <b>Rest starters in blowouts:</b> empty the bench late in lopsided games.
              </p>
            </Help>
          }
        >
          Late game
        </Head>
        <div className="tx-toggles">
          <Toggle on={m.foulUp3} onChange={(x) => tweak((tt) => void (tt.manage.foulUp3 = x))} label="Foul when up 3" />
          <Toggle on={!!m.foulToGive} onChange={(x) => tweak((tt) => void (tt.manage.foulToGive = x))} label="Foul to give" />
          <Toggle on={m.foulWhenTrailing} onChange={(x) => tweak((tt) => void (tt.manage.foulWhenTrailing = x))} label="Foul when trailing late" />
          <Toggle on={m.twoForOne} onChange={(x) => tweak((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          <Toggle on={m.odSubs !== false} onChange={(x) => tweak((tt) => void (tt.manage.odSubs = x))} label="Offense-defense subs late" />
          <Toggle on={m.garbageTime} onChange={(x) => tweak((tt) => void (tt.manage.garbageTime = x))} label="Rest starters in blowouts" />
        </div>

        <Head
          help={
            <Help title="Timeouts and substitutions">
              <p>
                <b>Auto timeouts:</b> a team on a run shoots better until a basket or a timeout ends it. A timeout rests legs too, and lets their coach adjust.
              </p>
              <p>
                <b>Foul trouble:</b> Standard sits a player at 2 fouls in Q1, one more each quarter. Loose leaves him in longer, Strict sits him sooner.
              </p>
              <p>
                <b>Sub out tired players:</b> tired legs shoot and defend worse and get hurt more. Higher means shorter stints.
              </p>
            </Help>
          }
        >
          Timeouts and substitutions
        </Head>
        <div className="tx-toggles">
          <Toggle on={m.autoTimeouts} onChange={(x) => tweak((tt) => void (tt.manage.autoTimeouts = x))} label="Auto timeouts to stop runs" />
        </div>
        <Slider
          label="Timeout after a run of"
          value={m.timeoutRun}
          disabled={!m.autoTimeouts}
          min={6}
          max={14}
          onChange={(x) => tweak((tt) => void (tt.manage.timeoutRun = x))}
          format={(x) => `${x}-0`}
        />
        <div className="tx-lv">
          <div className="slider-label">Foul trouble</div>
          <Chips
            label="Foul trouble"
            value={m.foulTrouble}
            onChange={(x: Tactics['manage']['foulTrouble']) => tweak((tt) => void (tt.manage.foulTrouble = x))}
            options={[
              { id: 'loose', label: 'Loose' },
              { id: 'standard', label: 'Standard' },
              { id: 'strict', label: 'Strict' },
            ]}
          />
        </div>
        <Slider
          label="Sub out tired players at"
          value={Math.round(m.fatigueSub * 100)}
          min={30}
          max={80}
          onChange={(x) => tweak((tt) => void (tt.manage.fatigueSub = x / 100))}
          format={(x) => `${x}% energy`}
        />

        <Head>Simmed games</Head>
        <div className="tx-toggles">
          <Toggle
            // (on unless switched off, whoever runs the tactics: taking over the tactics doesn't turn it
            // off; see buildSimInput). The assistant has the AI coaches' menu at both ends, each kind
            // measured alone (scripts/tactics-lab/adjustments.ts) at about even or better and the losing
            // kinds never made, so the help says so and quotes no number (DESIGN.md)
            on={m.assistantAdjusts !== false}
            onChange={(x) =>
              tweak((tt) => {
                if (x) delete tt.manage.assistantAdjusts;
                else tt.manage.assistantAdjusts = false;
              })
            }
            label="Assistant adjusts in simmed games"
            help="At breaks he fixes what the other team cashes in on, as AI coaches do. Never in games you coach live."
          />
        </div>
      </div>
    </Disclosure>
  );
}
