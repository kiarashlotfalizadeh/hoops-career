import { Hand } from 'lucide-react';
import type { DefScheme, PnrCoverage, PressMode, Settings, StarPlan, Tactics } from '../../core/types';
import { COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META } from '../../core/sim/tactics';
import { Chips, Segmented, Slider, Tag, Toggle } from '../components/ui';

/**
 * The in-game adjustments sheet, as deep as the coaching depth: Simple gets the big levers,
 * Advanced the press, star plan and the rest of the sliders, Expert the matchups and late-game rules.
 */
export function TacticsPanel({
  tactics: t,
  apply,
  persist,
  setPersist,
  complexity,
  plan,
  oppOn,
  myOn,
  guardOf,
  nameOf,
}: {
  /** What the team plays now. */
  tactics: Tactics;
  apply: (fn: (t: Tactics) => void) => void;
  persist: boolean;
  setPersist: (on: boolean) => void;
  complexity: Settings['complexity'];
  /** Tonight's game plan items. */
  plan: { id: string; label: string }[];
  oppOn: number[];
  myOn: number[];
  /** Who guards one of their players now. */
  guardOf: (pid: number) => number | undefined;
  nameOf: (pid: number) => string;
}) {
  const adv = complexity !== 'simple';
  const expert = complexity === 'expert';
  const set = apply;
  const head = (text: string) => <div className="tiny dim upper bold">{text}</div>;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Toggle
        on={persist}
        onChange={setPersist}
        label="Keep changes after this game"
        help={
          persist
            ? "Tonight's changes so far, and every change from now on, are your saved tactics (not tonight's matchups or star target). Off again puts them back."
            : 'Off: adjustments only apply to this game.'
        }
      />
      {plan.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          {head("Tonight's game plan")}
          <div className="chips">
            {plan.map((it) => (
              <Tag key={it.id} tone="info">
                {it.label}
              </Tag>
            ))}
          </div>
        </div>
      )}
      {head('Defense')}
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Pick-and-roll coverage
        </div>
        <Chips
          label="Pick-and-roll coverage"
          value={t.defense.pnr}
          onChange={(x: PnrCoverage) => set((tt) => void (tt.defense.pnr = x))}
          options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))}
        />
      </div>
      <Segmented
        value={t.defense.scheme}
        onChange={(x: DefScheme) => set((tt) => void (tt.defense.scheme = x))}
        label="Base scheme"
        options={(Object.keys(SCHEME_META) as DefScheme[]).map((k) => ({ id: k, label: SCHEME_META[k].label }))}
      />
      <Slider label="Help defense" value={t.defense.help} onChange={(x) => set((tt) => void (tt.defense.help = x))} left="Stay home" right="Pack the paint" />
      {adv && (
        <>
          <Slider label="Ball pressure" value={t.defense.pressure} onChange={(x) => set((tt) => void (tt.defense.pressure = x))} left="Contain" right="Swarm" />
          <Slider label="Physicality" value={t.defense.physicality} onChange={(x) => set((tt) => void (tt.defense.physicality = x))} left="Clean" right="Physical" />
          <Slider label="Transition defense" value={t.defense.getBack} onChange={(x) => set((tt) => void (tt.defense.getBack = x))} left="Jog back" right="Sprint back" />
          <Toggle on={t.defense.switchOffBall} onChange={(x) => set((tt) => void (tt.defense.switchOffBall = x))} label="Switch off-ball screens" />
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>
              Full-court press
            </div>
            <Chips
              label="Full-court press"
              value={t.defense.press}
              onChange={(x: PressMode) => set((tt) => void (tt.defense.press = x))}
              options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
            />
          </div>
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>
              Star plan
            </div>
            <Chips
              label="Star plan"
              value={t.defense.starPlan}
              onChange={(x: StarPlan) => set((tt) => void (tt.defense.starPlan = x))}
              options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
            />
            {t.defense.starPlan !== 'none' && (
              <div className="chips" role="group" aria-label="Star plan target" style={{ marginTop: 8 }}>
                <button
                  className={`chip ${t.defense.starTarget === null ? 'on' : ''}`}
                  aria-pressed={t.defense.starTarget === null}
                  onClick={() => set((tt) => void (tt.defense.starTarget = null))}
                >
                  Auto
                </button>
                {oppOn.map((pid) => (
                  <button
                    key={pid}
                    className={`chip ${t.defense.starTarget === pid ? 'on' : ''}`}
                    aria-pressed={t.defense.starTarget === pid}
                    onClick={() => set((tt) => void (tt.defense.starTarget = pid))}
                  >
                    {nameOf(pid)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {expert && (
        <div>
          <div className="small bold" style={{ marginBottom: 6 }}>
            Matchups
          </div>
          <div className="col" style={{ gap: 8 }}>
            {oppOn.map((o) => {
              const cur = guardOf(o);
              return (
                <div key={o} className="col" style={{ gap: 4 }}>
                  <div className="small">
                    <b>{nameOf(o)}</b>{' '}
                    <span className="dim">
                      guarded by {cur !== undefined ? nameOf(cur) : '—'}
                      {t.defense.matchups[o] !== undefined ? ' (assigned)' : ''}
                    </span>
                  </div>
                  <div className="chips" role="group" aria-label={`Who guards ${nameOf(o)}`}>
                    {myOn.map((d) => (
                      <button
                        key={d}
                        className={`chip ${t.defense.matchups[o] === d ? 'on' : ''}`}
                        aria-pressed={t.defense.matchups[o] === d}
                        style={{ fontSize: 12 }}
                        onClick={() =>
                          set((tt) => {
                            if (tt.defense.matchups[o] === d) delete tt.defense.matchups[o];
                            else {
                              for (const k of Object.keys(tt.defense.matchups)) if (tt.defense.matchups[+k] === d) delete tt.defense.matchups[+k];
                              tt.defense.matchups[o] = d;
                            }
                          })
                        }
                      >
                        {nameOf(d)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="tiny dim">Assignments stick whenever both players are on the floor; otherwise the staff matches by size and threat.</div>
          </div>
        </div>
      )}
      {head('Offense')}
      <Slider label="Pace" value={t.offense.pace} onChange={(x) => set((tt) => void (tt.offense.pace = x))} left="Grind" right="Run & gun" />
      <Slider label="Three-point emphasis" value={t.offense.threePoint} onChange={(x) => set((tt) => void (tt.offense.threePoint = x))} left="Mid-range ok" right="Rim & 3s only" />
      <Slider label="Crash the offensive glass" value={t.offense.crashBoards} onChange={(x) => set((tt) => void (tt.offense.crashBoards = x))} left="Get back" right="Crash" />
      {adv && (
        <>
          <Slider label="Attack the rim" value={t.offense.rimAttack} onChange={(x) => set((tt) => void (tt.offense.rimAttack = x))} left="Settle" right="Downhill" />
          <Slider label="Push in transition" value={t.offense.transition} onChange={(x) => set((tt) => void (tt.offense.transition = x))} left="Walk it up" right="Run" />
          <Toggle on={t.offense.huntMismatch} onChange={(x) => set((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" />
          <Toggle on={t.offense.hotHand} onChange={(x) => set((tt) => void (tt.offense.hotHand = x))} label="Feed the hot hand" />
        </>
      )}
      {expert && (
        <>
          {head('Late game')}
          <Toggle
            on={t.manage.foulWhenTrailing}
            onChange={(x) => set((tt) => void (tt.manage.foulWhenTrailing = x))}
            label="Foul when trailing late"
            help="Stop the clock with intentional fouls when behind in the final minute."
          />
          <Toggle
            on={t.manage.foulUp3}
            onChange={(x) => set((tt) => void (tt.manage.foulUp3 = x))}
            label="Foul when up 3"
            help="In the final seconds, foul before the opponent can attempt a tying three."
          />
          <Toggle on={t.manage.twoForOne} onChange={(x) => set((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
          <Slider
            label="Hack-a-player threshold"
            value={t.manage.hackThreshold}
            min={0}
            max={65}
            onChange={(x) => set((tt) => void (tt.manage.hackThreshold = x))}
            format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
            help="Intentionally foul their players who shoot below this from the line (not in the last 2 minutes of a period)."
          />
          <Toggle
            on={t.manage.autoTimeouts}
            onChange={(x) => set((tt) => void (tt.manage.autoTimeouts = x))}
            label="Staff timeouts to stop runs"
            help="Your staff calls a timeout after a run (unless you handle substitutions): it rests legs and resets the run."
          />
          <Slider
            label="Timeout after a run of"
            value={t.manage.timeoutRun}
            disabled={!t.manage.autoTimeouts}
            min={6}
            max={14}
            onChange={(x) => set((tt) => void (tt.manage.timeoutRun = x))}
            format={(x) => `${x}-0`}
          />
        </>
      )}
      <div className="tiny dim">
        <Hand size={12} style={{ verticalAlign: -2 }} /> Changes take effect on the next possession.
      </div>
    </div>
  );
}
