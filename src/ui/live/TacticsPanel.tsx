import { useState, type ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useLeague } from '../../state/store';
import { pendingLive } from '../../state/live';
import type { DefScheme, PnrCoverage, PressMode, StarPlan, Tactics } from '../../core/types';
import { ACTIONS } from '../../core/types';
import {
  ACTION_META,
  ALL_SCHEMES,
  COVERAGE_META,
  FOCUS_META,
  GLASS_LEVELS,
  PLAY_FOCI,
  PRESS_META,
  SCHEME_META,
  STAR_PLAN_META,
  TACTIC_LEVELS,
  applyFocus,
  chasers,
  focusOf,
  glassLevel,
  setGlassLevel,
  startHacking,
  stopHacking,
  type PlayFocus,
} from '../../core/sim/tactics';
import { CLASH_META, LINK_META, linkState } from '../../core/sim/links';
import { Chips, Help, Levels, Segmented, Slider, Tag, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import type { Pill } from './pills';
import { changesLine, screenChanges } from '../tactics/changes';
import { OPT, famSuffix, floorLinks } from './familiar';

/** Changes listed before "N more". */
const CHANGES_SHOWN = 3;
/** Partnerships named on the floor's line before "N more" (a tap names them all). */
const LINKS_SHOWN = 1;

type Phase = 'inPoss' | 'inTrans' | 'outPoss';
const PHASES: { id: Phase; label: string }[] = [
  { id: 'inPoss', label: 'In possession' },
  { id: 'inTrans', label: 'Transition' },
  { id: 'outPoss', label: 'Out of possession' },
];
const GLASS_NAMES = GLASS_LEVELS.map((l) => l.label) as unknown as readonly [string, string, string, string, string];

/** A setting picked from chips: its name over them. */
function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="lv-tp-field">
      <div className="slider-label">{label}</div>
      {children}
    </div>
  );
}

/** A part of the sheet one tap down: its name and what's in it, the rest once opened. */
function Fold({ label, meta, children }: { label: string; meta: string; children: ReactNode }) {
  return (
    <details className="lv-fine">
      <summary>
        <span className="grow">
          <span className="lv-fine-l">{label}</span>
          <span className="lv-fine-m">{meta}</span>
        </span>
        <ChevronDown size={18} className="lv-fine-c" aria-hidden="true" />
      </summary>
      <div className="lv-tp-tab lv-fine-body">{children}</div>
    </details>
  );
}

/**
 * The partnerships of the five on the floor in a line, and any clash: who plays off whom, and how
 * well (see core/sim/links.ts).
 */
function FloorLine({ nameOf }: { nameOf: (pid: number) => string }) {
  const lg = pendingLive(useLeague());
  const [all, setAll] = useState(false);
  if (!lg) return null;
  const { links, clashes } = floorLinks(lg);
  const shown = all ? links : links.slice(0, LINKS_SHOWN);
  return (
    <div className="lv-floor small">
      <span className="over">
        <Term id="partnership">On the floor</Term>
      </span>{' '}
      {shown.length === 0 && !clashes.length && <span className="dim">No partnerships in this five.</span>}
      {shown.map((l, i) => {
        const st = linkState(l);
        return (
          <span key={`${l.id}${l.a}-${l.b}`}>
            {i > 0 && ' · '}
            {nameOf(l.a)}–{nameOf(l.b)} {LINK_META[l.id].label.toLowerCase()}{' '}
            <b className={st.word === 'Strong' || st.word === 'Good' ? 'good' : st.word === 'Weak' ? 'bad' : 'warn'} title={st.why}>
              {st.word}
            </b>
          </span>
        );
      })}
      {links.length > LINKS_SHOWN && !all && (
        <>
          {' · '}
          <button className="lv-floor-more" onClick={() => setAll(true)}>
            {links.length - LINKS_SHOWN} more
          </button>
        </>
      )}
      {clashes.map((c) => (
        <span key={c.id} className="warn" title={CLASH_META[c.id].help}>
          {links.length > 0 && ' · '}
          {CLASH_META[c.id].label}: {c.pids.map(nameOf).join(', ')}
        </span>
      ))}
    </div>
  );
}

/**
 * Every setting, the sheet under the Game plan view: the touchline (your three tactics, the mentality,
 * the shape), tonight's game plan, what's changed since the tip (in the Tactics screen's words) and the
 * way back to it, a short row of quick changes, the floor's partnerships, then the three phases of
 * play as the Tactics screen has them: each phase's headline decisions, the rest under Fine-tune, the
 * late game one tap down too. Each discrete option shows the team's familiarity when it isn't fluid.
 * Last, whether tonight's changes stay after the game. Player-by-player orders (matchups, a
 * defender's instructions, a Hack-a on one man) live on each player's sheet. Every change goes
 * through the live game.
 */
export function TacticsPanel({
  tactics: t,
  apply,
  persist,
  setPersist,
  plan,
  pills,
  planned,
  offPlan,
  reset,
  oppOn,
  nameOf,
  q,
  touchline,
  famOf = () => 100,
  away = false,
}: {
  /** The touchline (see Touchline.tsx), at the top. */
  touchline?: ReactNode;
  /** How well the team knows a discrete option ('scheme:zone23'), as tonight plays it. */
  famOf?: (key: string) => number;
  /** The team plays another tactic than the one the game tipped off with (its changes aren't kept). */
  away?: boolean;
  /** What the team plays now. */
  tactics: Tactics;
  apply: (fn: (t: Tactics) => void) => void;
  persist: boolean;
  setPersist: (on: boolean) => void;
  /** Tonight's game plan items. */
  plan: { id: string; label: string }[];
  pills: Pill[];
  /** The tactics the game tipped off with (its game plan in them). */
  planned: Tactics;
  /** Tonight's tactics differ from what the game tipped off with. */
  offPlan: boolean;
  reset: () => void;
  oppOn: number[];
  nameOf: (pid: number) => string;
  /** The period: a threshold set now starts a game plan's later Hack-a quarter now. */
  q: number;
}) {
  const [phase, setPhase] = useState<Phase>('inPoss');
  const n = chasers(t.defense.scheme);
  const chase = (t.defense.chase ?? []).slice(0, n);
  const set = apply;
  // what's changed since the tip, named as the Tactics screen names each control
  const changed = offPlan ? screenChanges(planned, t, nameOf) : [];
  /** An option's label with the team's familiarity beside it when it isn't fluid ("2-3 Zone · 35%"). */
  const fam = (label: string, key: string | null) => (key ? `${label}${famSuffix(famOf(key))}` : label);
  const focus = focusOf(t.offense);
  return (
    <div className="lv-tp">
      {touchline}
      {(plan.length > 0 || offPlan) && (
        <div className="lv-tp-top">
          {plan.length > 0 && (
            <div className="lv-tp-plan">
              <span className="over">
                <Term id="gameplan">Tonight&apos;s game plan</Term>
              </span>
              <div className="chips">
                {plan.map((it) => (
                  <Tag key={it.id} tone="info">
                    {it.label}
                  </Tag>
                ))}
              </div>
            </div>
          )}
          {offPlan && (
            <button className="btn sm" onClick={reset}>
              <RotateCcw size={15} aria-hidden="true" /> Reset to game plan
            </button>
          )}
          {changed.length > 0 && (
            <div className="lv-tp-changed small">
              <span className="dim">Changed tonight:</span> {changesLine(changed.slice(0, CHANGES_SHOWN))}
              {changed.length > CHANGES_SHOWN && <span className="dim"> · {changed.length - CHANGES_SHOWN} more</span>}
            </div>
          )}
        </div>
      )}

      {pills.length > 0 && (
        <div className="lv-tp-quick">
          <span className="over">
            Quick changes
            <Help title="Quick changes">
              <p>One tap for the changes coaches make most during a game. Pressed again, each goes back to the game plan&apos;s setting.</p>
              <p>Every change counts from the next possession.</p>
            </Help>
          </span>
          <div className="chips" role="group" aria-label="Quick changes">
            {pills.map((p) => (
              <button key={p.id} className={`chip ${p.on ? 'on' : ''}`} aria-pressed={p.on} title={p.help} onClick={() => apply(p.apply)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <FloorLine nameOf={nameOf} />

      <div className="lv-phases">
        <Segmented label="Phase of play" value={phase} onChange={setPhase} options={PHASES} />
      </div>
      {phase === 'inPoss' && (
        <>
          <div className="lv-tp-tab">
            <Field label="Play through">
              <Chips
                label="Play through"
                value={focus ?? 'custom'}
                onChange={(x: PlayFocus | 'custom') => x !== 'custom' && set((tt) => applyFocus(tt.offense, x))}
                options={[
                  ...PLAY_FOCI.map((f) => ({ id: f as PlayFocus | 'custom', label: FOCUS_META[f].label })),
                  ...(focus ? [] : [{ id: 'custom' as const, label: 'Custom mix' }]),
                ]}
              />
            </Field>
            <Levels label="Shot profile" value={t.offense.threePoint} names={TACTIC_LEVELS.threePoint} onChange={(x) => set((tt) => void (tt.offense.threePoint = x))} />
            <Levels label="Tempo" value={t.offense.pace} names={TACTIC_LEVELS.pace} onChange={(x) => set((tt) => void (tt.offense.pace = x))} />
          </div>
          <Fold label="Fine-tune" meta="Action weights, attack the rim, mismatches, hot hand">
            {ACTIONS.map((a) => (
              <Levels
                key={a}
                label={ACTION_META[a].label}
                value={t.offense.actions[a]}
                names={TACTIC_LEVELS.action}
                onChange={(x) => set((tt) => void (tt.offense.actions[a] = x))}
              />
            ))}
            <Levels label="Attack the rim" value={t.offense.rimAttack} names={TACTIC_LEVELS.rimAttack} onChange={(x) => set((tt) => void (tt.offense.rimAttack = x))} />
            <Toggle on={t.offense.huntMismatch} onChange={(x) => set((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" />
            <Toggle on={t.offense.hotHand} onChange={(x) => set((tt) => void (tt.offense.hotHand = x))} label="Feed the hot hand" />
          </Fold>
        </>
      )}
      {phase === 'inTrans' && (
        <>
          <div className="lv-tp-tab">
            <Levels label="After a stop" value={t.offense.transition} names={TACTIC_LEVELS.transition} onChange={(x) => set((tt) => void (tt.offense.transition = x))} />
            <Levels label="When a shot goes up" value={glassLevel(t) * 25} names={GLASS_NAMES} onChange={(x) => set((tt) => setGlassLevel(tt, x / 25))} />
            <Field label={<Term id="press">Full-court press</Term>}>
              <Chips
                label="Full-court press"
                value={t.defense.press}
                onChange={(x: PressMode) => set((tt) => void (tt.defense.press = x))}
                options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: fam(PRESS_META[k].label, OPT.press(k)) }))}
              />
            </Field>
          </div>
          <Fold label="Fine-tune" meta="The glass and getting back apart">
            <Levels
              label="Crash the offensive glass"
              value={t.offense.crashBoards}
              names={TACTIC_LEVELS.crashBoards}
              onChange={(x) => set((tt) => void (tt.offense.crashBoards = x))}
            />
            <Levels label="Transition defense" value={t.defense.getBack} names={TACTIC_LEVELS.getBack} onChange={(x) => set((tt) => void (tt.defense.getBack = x))} />
          </Fold>
        </>
      )}
      {phase === 'outPoss' && (
        <>
          <div className="lv-tp-tab">
            <Field label={<Term id="zone">Scheme</Term>}>
              <Chips
                label="Scheme"
                value={t.defense.scheme}
                onChange={(x: DefScheme) => set((tt) => void (tt.defense.scheme = x))}
                options={ALL_SCHEMES.map((k) => ({ id: k, label: fam(SCHEME_META[k].label, OPT.scheme(k)) }))}
              />
              <div className="tiny dim lv-fam-key">A figure beside an option is how familiar the team is with it: below fluid, it plays a step slow.</div>
              {n > 0 && (
                <>
                  <div className="over" style={{ marginTop: 6 }}>
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
                  <div className="tiny dim">
                    {chase.length
                      ? `Chasing ${chase.map(nameOf).join(' and ')}${chase.length < n ? ' and their next creator' : ''}; man-to-man while ${chase.length === 2 ? 'neither is' : "he isn't"} on.`
                      : `Auto: ${n === 2 ? 'their two main creators' : 'their main creator'} on the floor.`}
                  </div>
                </>
              )}
            </Field>
            <Field label={<Term id="pnr">Ball-screen coverage</Term>}>
              <Chips
                label="Ball-screen coverage"
                value={t.defense.pnr}
                onChange={(x: PnrCoverage) => set((tt) => void (tt.defense.pnr = x))}
                options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: fam(COVERAGE_META[k].label, OPT.pnr(k)) }))}
              />
            </Field>
            <Levels label="Help" value={t.defense.help} names={TACTIC_LEVELS.help} onChange={(x) => set((tt) => void (tt.defense.help = x))} />
          </div>
          <Fold label="Fine-tune" meta="Ball pressure, physicality, off-ball switches, star plan">
            <Levels label="Ball pressure" value={t.defense.pressure} names={TACTIC_LEVELS.pressure} onChange={(x) => set((tt) => void (tt.defense.pressure = x))} />
            <Levels label="Physicality" value={t.defense.physicality} names={TACTIC_LEVELS.physicality} onChange={(x) => set((tt) => void (tt.defense.physicality = x))} />
            <Toggle on={t.defense.switchOffBall} onChange={(x) => set((tt) => void (tt.defense.switchOffBall = x))} label="Switch off-ball screens" />
            <Field label="Star plan">
              <Chips
                label="Star plan"
                value={t.defense.starPlan}
                onChange={(x: StarPlan) => set((tt) => void (tt.defense.starPlan = x))}
                options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
              />
              {t.defense.starPlan !== 'none' && (
                <div className="chips" role="group" aria-label="Star plan target">
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
            </Field>
          </Fold>
        </>
      )}
      <Fold label="Late game" meta="Fouling, 2-for-1, Hack-a-player, timeouts">
        <Toggle
          on={t.manage.foulWhenTrailing}
          onChange={(x) => set((tt) => void (tt.manage.foulWhenTrailing = x))}
          label="Foul when trailing late"
          help="Stop the clock with fouls when behind in the final minute."
        />
        <Toggle
          on={t.manage.foulUp3}
          onChange={(x) => set((tt) => void (tt.manage.foulUp3 = x))}
          label="Foul when up 3"
          help="In the final seconds, foul before they can try a tying three."
        />
        <Toggle on={t.manage.twoForOne} onChange={(x) => set((tt) => void (tt.manage.twoForOne = x))} label="Go for 2-for-1" />
        <Toggle
          on={!!t.manage.foulToGive}
          onChange={(x) => set((tt) => void (tt.manage.foulToGive = x))}
          label="Foul to give"
          help="3 to 8 seconds left, their ball: foul at once when it's only a side out, for a worse inbounds look (4th and overtime: tied or up 3 or less)."
        />
        <Slider
          label={
            <span className="lv-tp-label">
              <Term id="hack">Hack-a-player threshold</Term>
              <Help title="Hack-a-player threshold">
                <p>Foul their players who shoot below this from the line, away from the ball (never in a period&apos;s last 2 minutes).</p>
                <p>
                  Off also stops tonight&apos;s game-plan targets
                  {t.manage.hackTargets?.length ? ` (${t.manage.hackTargets.map(nameOf).join(', ')})` : ''}.
                </p>
              </Help>
            </span>
          }
          name="Hack-a-player threshold"
          value={t.manage.hackThreshold}
          min={0}
          max={65}
          onChange={(x) => set((tt) => (x === 0 ? stopHacking(tt.manage) : startHacking(tt.manage, x, q)))}
          format={(x) => (x === 0 ? 'Off' : `< ${x}% FT`)}
        />
        <Toggle
          on={t.manage.autoTimeouts}
          onChange={(x) => set((tt) => void (tt.manage.autoTimeouts = x))}
          label="Auto timeouts to stop runs"
          help="After a run (unless you handle subs): rests legs and resets the run."
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
      </Fold>
      <Toggle
        on={persist}
        onChange={setPersist}
        label="Keep changes after this game"
        help={
          persist
            ? `Tonight's changes, before and from now on, are your saved tactics (not tonight's matchups or star target). Off puts them back.${away ? " While you play another of your tactics than the one you tipped off with, its changes are tonight's only." : ''}`
            : 'Off: changes last this game only.'
        }
      />
    </div>
  );
}
