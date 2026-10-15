import { Hand } from 'lucide-react';
import type { DefScheme, PnrCoverage, PressMode, Settings, StarPlan, Tactics } from '../../core/types';
import { COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META, TACTIC_LEVELS, chasers, schemesFor, startHacking, stopHacking } from '../../core/sim/tactics';
import { Chips, Levels, Slider, Tag, Toggle } from '../components/ui';

/**
 * The in-game adjustments sheet, as deep as the coaching depth: Simple gets the big levers,
 * Advanced the junk defenses, the press, star plan and the rest of the settings, Expert the matchups
 * and late-game rules.
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
  q,
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
  /** The period: a threshold set now starts a game plan's later Hack-a quarter now. */
  q: number;
}) {
  const adv = complexity !== 'simple';
  const expert = complexity === 'expert';
  // the junk defenses from Advanced (one already in play stays on offer)
  const schemes = schemesFor(complexity).concat(schemesFor(complexity).includes(t.defense.scheme) ? [] : [t.defense.scheme]);
  const n = chasers(t.defense.scheme);
  const chase = (t.defense.chase ?? []).slice(0, n);
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
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Scheme
        </div>
        <Chips
          label="Scheme"
          value={t.defense.scheme}
          onChange={(x: DefScheme) => set((tt) => void (tt.defense.scheme = x))}
          options={schemes.map((k) => ({ id: k, label: SCHEME_META[k].label }))}
        />
        {n > 0 && (
          <>
            <div className="tiny upper dim bold" style={{ margin: '10px 0 6px' }}>
              Chase
            </div>
            <div className="chips" role="group" aria-label="Players to chase">
              <button className={`chip ${!chase.length ? 'on' : ''}`} aria-pressed={!chase.length} onClick={() => set((tt) => void delete tt.defense.chase)}>
                Auto
              </button>
              {oppOn.map((pid) => {
                const on = chase.includes(pid);
                return (
                  <button
                    key={pid}
                    className={`chip ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      set((tt) => {
                        const next = on ? chase.filter((x) => x !== pid) : [...chase, pid].slice(-n);
                        if (next.length) tt.defense.chase = next;
                        else delete tt.defense.chase;
                      })
                    }
                  >
                    {nameOf(pid)}
                  </button>
                );
              })}
            </div>
            <div className="tiny dim" style={{ marginTop: 6 }}>
              {chase.length
                ? `Chasing ${chase.map(nameOf).join(' and ')}${chase.length < n ? ' and their next creator on the floor' : ''}; while ${chase.length === 2 ? 'neither is' : "he isn't"} on the floor you play man-to-man.`
                : `Auto: the chaser${n === 2 ? 's take their two main creators' : ' takes their main creator'} on the floor.`}
            </div>
          </>
        )}
      </div>
      <Levels label="Help defense" value={t.defense.help} names={TACTIC_LEVELS.help} onChange={(x) => set((tt) => void (tt.defense.help = x))} />
      {adv && (
        <>
          <Levels label="Ball pressure" value={t.defense.pressure} names={TACTIC_LEVELS.pressure} onChange={(x) => set((tt) => void (tt.defense.pressure = x))} />
          <Levels label="Physicality" value={t.defense.physicality} names={TACTIC_LEVELS.physicality} onChange={(x) => set((tt) => void (tt.defense.physicality = x))} />
          <Levels label="Transition defense" value={t.defense.getBack} names={TACTIC_LEVELS.getBack} onChange={(x) => set((tt) => void (tt.defense.getBack = x))} />
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
      <Levels label="Pace" value={t.offense.pace} names={TACTIC_LEVELS.pace} onChange={(x) => set((tt) => void (tt.offense.pace = x))} />
      <Levels label="Three-point emphasis" value={t.offense.threePoint} names={TACTIC_LEVELS.threePoint} onChange={(x) => set((tt) => void (tt.offense.threePoint = x))} />
      <Levels label="Crash the offensive glass" value={t.offense.crashBoards} names={TACTIC_LEVELS.crashBoards} onChange={(x) => set((tt) => void (tt.offense.crashBoards = x))} />
      {adv && (
        <>
          <Levels label="Attack the rim" value={t.offense.rimAttack} names={TACTIC_LEVELS.rimAttack} onChange={(x) => set((tt) => void (tt.offense.rimAttack = x))} />
          <Levels label="Push in transition" value={t.offense.transition} names={TACTIC_LEVELS.transition} onChange={(x) => set((tt) => void (tt.offense.transition = x))} />
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
          <Toggle
            on={!!t.manage.foulToGive}
            onChange={(x) => set((tt) => void (tt.manage.foulToGive = x))}
            label="Foul to give"
            help="With 3 to 8 seconds left and the ball theirs, foul at once when it's only a side out: a worse inbounds look for them (in the 4th and overtime only tied or up 3 or less)."
          />
          <Slider
            label="Hack-a-player threshold"
            value={t.manage.hackThreshold}
            min={0}
            max={65}
            onChange={(x) => set((tt) => (x === 0 ? stopHacking(tt.manage) : startHacking(tt.manage, x, q)))}
            format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
            help={`Intentionally foul their players who shoot below this from the line (not in the last 2 minutes of a period). Off also stops tonight's game-plan targets${
              t.manage.hackTargets?.length ? ` (${t.manage.hackTargets.map(nameOf).join(', ')})` : ''
            }.`}
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
