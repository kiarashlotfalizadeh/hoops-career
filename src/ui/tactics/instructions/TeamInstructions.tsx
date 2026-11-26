// Team Instructions: the one surface for how the team plays, in the three phases of a trip (With
// ball, Transitions, Without ball), each read left to right as the trip goes: the shape, how the
// advantage is built, how it ends. It opens over the tactics board (a wide dialog on a desk; on a
// phone one column at a time, stepped). The drawings know the roster: the shot chart, the shot mix
// and the seconds a trip lasts are measured with the rotation as it would dress (useOutlook), each
// shape carries what the five make of it, and an action the shape works against is flagged. One
// stepped scale for every 0-100 setting (the style's own level under a dot); steppers only for the
// playbook's mix, which is shares of one whole.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { useLeague } from '../../../state/store';
import type { ActionType, DefScheme, OffShape, Player, PnrCoverage, PressMode, Tactics } from '../../../core/types';
import { ACTIONS, OFF_SHAPES } from '../../../core/types';
import {
  ACTION_META,
  ALL_SCHEMES,
  COVERAGE_META,
  GLASS_META,
  LEVEL_VALUES,
  PRESS_META,
  SCHEME_META,
  SHAPE_META,
  TACTIC_LEVELS,
  levelIndex,
  shapeOf,
} from '../../../core/sim/tactics';
import { composites } from '../../../core/ratings';
import { ratingText } from '../../../core/analysis/guarding';
import { shortName } from '../../../core/league/helpers';
import type { Outlook } from '../../../core/analysis/outlook';
import type { FinishType } from '../../../core/sim/log';
import { Chips, Help, Segmented, Sheet, Tag, Toggle } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { tweak } from '../edit';
import { Lv } from '../Lv';
import { DEF_SPOTS, OFF_SPOTS } from '../formation';
import { PlaybookLine, defPresetOf, offPresetOf } from '../PlaybookLine';
import { useOutlook } from '../useOutlook';
import { CoverageDiagram, Fig, FormationThumb, HexCourt, MixTiles, PlayDiagram, TransDiagram, optLabel, wholePercents } from './parts';
import './instructions.css';

export type Phase = 'ball' | 'trans' | 'off';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'ball', label: 'With ball' },
  { id: 'trans', label: 'Transitions' },
  { id: 'off', label: 'Without ball' },
];

/** Each phase's three columns, as a phone steps through them. */
const STEPS: Record<Phase, [string, string, string]> = {
  ball: ['Shape', 'Advantage', 'Finish'],
  trans: ['Run', 'Glass', 'Press'],
  off: ['Shape', 'Coverage', 'Contest'],
};

type Tone = 'good' | 'warn' | undefined;
interface Note {
  text: string;
  tone: Tone;
}

/** The five who start next: the first healthy ones in the depth chart. */
function nextFive(order: readonly number[], players: Player[]): Player[] {
  const byId = new Map(players.map((p) => [p.pid, p]));
  return order
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => !!p && !p.injury)
    .slice(0, 5);
}

/** A player defenses leave alone (spacing: a three-point rating under about 37), and one they must guard out there (over about 52). */
const NON_SHOOTER = 18;
const SHOOTER = 40;

/** What the five make of each shape, in a tag: the part of the roster the shape leans on or exposes. */
function shapeNotes(five: Player[]): Record<OffShape, Note | null> {
  const cs = five.map((p) => composites(p.ratings));
  const bigs = five
    .map((p, i) => ({ p, c: cs[i] }))
    .sort((a, b) => b.p.ratings.hgt - a.p.ratings.hgt || b.c.orb - a.c.orb)
    .slice(0, 2);
  // (five-out sags off a player a little from a spacing of 40 down, a ramp: only a true non-shooter,
  // most of the way down it, is named one. 18 is a three-point rating under 37.)
  const cold = cs.filter((c) => c.spacing < NON_SHOOTER).length;
  const elbow = Math.max(0, ...bigs.map((b) => b.c.passing));
  // (the double post wastes a big's shooting from a spacing of 25 up: a real shooter, the league's top third, is named)
  const wasted = bigs.filter((b) => b.c.spacing >= SHOOTER).length;
  const post = Math.max(0, ...bigs.map((b) => b.c.postScore));
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return {
    fourOut: bigs[0] && bigs[0].c.spacing < NON_SHOOTER ? { text: 'Hides a non-shooting big', tone: 'good' } : null,
    fiveOut: cold ? { text: n(cold, 'non-shooter', 'non-shooters'), tone: 'warn' } : { text: 'Five shooters', tone: 'good' },
    horns: elbow >= 62 ? { text: 'A passer at the elbow', tone: 'good' } : elbow < 48 ? { text: 'No passer at the elbows', tone: 'warn' } : null,
    twoIn: wasted
      ? { text: n(wasted, 'shooter stuck inside', 'shooters stuck inside'), tone: 'warn' }
      : post >= 62
        ? { text: 'A post scorer', tone: 'good' }
        : { text: 'No post scorer', tone: 'warn' },
  };
}

/** The actions each shape works for and against (the engine's shape rules, tk.ts). */
const SHAPE_ACTIONS: Record<OffShape, { suits: ActionType[]; clash: Partial<Record<ActionType, string>> }> = {
  fourOut: { suits: [], clash: {} },
  fiveOut: { suits: ['motion'], clash: { post: 'Nobody inside in 5-Out' } },
  horns: { suits: ['pnr', 'handoff'], clash: { motion: 'Horns cuts less' } },
  twoIn: { suits: ['post'], clash: { iso: 'A crowded paint to drive into' } },
};

const SCHEME_NOTE: Partial<Record<DefScheme, string>> = { zone23: 'Change-up', zone32: 'Change-up', box1: 'One chaser', tri2: 'Two chasers' };

/** How many of the five pick up full court in each press, as the drawing shows it. */
const PRESS_UP: Record<PressMode, number> = { none: 0, afterMade: 3, always: 5 };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The ways a trip ends that are an action's own (a kick-out three off any of them is nobody's). */
const ENDS: Record<ActionType, FinishType[]> = { pnr: ['pnrBH', 'pnrRoll'], iso: ['iso'], post: ['post'], handoff: ['handoff', 'offscreen'], motion: ['cut'] };
/** The share of the team's trips that ended in an action, as the games measured it. */
const usage = (out: Outlook, a: ActionType) => ENDS[a].reduce((sum, f) => sum + (out.finishes[f] ?? 0), 0);

export function TeamInstructions({
  phase,
  setPhase,
  onClose,
  t,
  players,
  dock,
}: {
  /** The phase shown (none: closed). */
  phase: Phase | null;
  setPhase: (p: Phase) => void;
  onClose: () => void;
  t: Tactics;
  players: Player[];
  /** This visit's changes (what they did to the grades, Undo, Done), at the surface's foot. */
  dock?: ReactNode;
}) {
  const [step, setStep] = useState(0);
  // (closing: the sheet shows the phase it had while it slides out)
  const [last, setLast] = useState<Phase>(phase ?? 'ball');
  if (phase && phase !== last) setLast(phase);
  const shown = phase ?? last;
  const go = (p: Phase) => {
    setStep(0);
    setPhase(p);
  };
  return (
    <Sheet
      wide
      open={!!phase}
      onClose={onClose}
      title={
        <span className="ti-title">
          <span className="over">Team instructions</span>
          <span className="ti-title-p">{PHASES.find((p) => p.id === shown)!.label}</span>
        </span>
      }
    >
      {phase && <Body phase={shown} go={go} step={step} setStep={setStep} t={t} players={players} dock={dock} onClose={onClose} />}
    </Sheet>
  );
}

function Body({
  phase,
  go,
  step,
  setStep,
  t,
  players,
  dock,
  onClose,
}: {
  phase: Phase;
  go: (p: Phase) => void;
  step: number;
  setStep: (s: number) => void;
  t: Tactics;
  players: Player[];
  dock?: ReactNode;
  onClose: () => void;
}) {
  const league = useLeague();
  const { out, stale } = useOutlook(league, t);
  const steps = STEPS[phase];
  const cols =
    phase === 'ball' ? (
      <WithBall t={t} players={players} out={out} stale={stale} />
    ) : phase === 'trans' ? (
      <Transitions t={t} players={players} out={out} stale={stale} />
    ) : (
      <WithoutBall t={t} players={players} out={out} stale={stale} />
    );
  const moved = <PlaybookLine />;
  const method = (
    // (one line; how the figures are measured is a tap away)
    <p className="ti-method">
      <span>Applies right away · a dot marks your style&apos;s setting</span>
      <Help title="How the figures are measured">
        <p>
          {out
            ? `Each figure is measured over ${out.games} simulated games: your rotation against the league.`
            : 'Each figure is measured over simulated games: your rotation against the league.'}
        </p>
        <p>A change is saved as you make it and plays from your next game. The figures refresh a moment after it.</p>
      </Help>
    </p>
  );
  return (
    <div className="ti" data-step={step}>
      <div className="ti-phases">
        <Segmented value={phase} options={PHASES} onChange={go} label="Phase of play" />
      </div>
      {/* a phone: one column at a time, the trip's order as the steps */}
      <div className="ti-steps" role="tablist" aria-label="Part of the phase">
        {steps.map((s, i) => (
          <button key={s} role="tab" aria-selected={i === step} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)}>
            <span className="num">{i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className="ti-cols">{cols}</div>
      {/* (a phone keeps its foot short: these two scroll with the column, a desk has them in the foot) */}
      <div className="ti-narrow ti-tail">
        {moved}
        {method}
      </div>
      <div className="ti-foot">
        <div className="ti-nav">
          <button className="btn sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ChevronLeft size={16} /> {step > 0 ? steps[step - 1] : 'Back'}
          </button>
          {step < 2 ? (
            <button className="btn sm primary" onClick={() => setStep(step + 1)}>
              {steps[step + 1]} <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn sm primary" onClick={() => (phase === 'off' ? onClose() : go(phase === 'ball' ? 'trans' : 'off'))}>
              {phase === 'off' ? 'Close' : PHASES[phase === 'ball' ? 1 : 2].label} <ChevronRight size={16} />
            </button>
          )}
        </div>
        <div className="ti-foot-row">
          <span className="ti-wide">
            {moved}
            {method}
          </span>
          {dock}
        </div>
      </div>
    </div>
  );
}

interface ColProps {
  t: Tactics;
  players: Player[];
  out: Outlook | null;
  stale: boolean;
}

/** One column: its title and what it answers, the controls under them. */
function Col({ i, title, sub, help, children }: { i: number; title: string; sub: string; help?: ReactNode; children: ReactNode }) {
  return (
    <section className="ti-col card" data-i={i} aria-label={title}>
      <header className="ti-col-h">
        <div className="grow">
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
        {help}
      </header>
      {children}
    </section>
  );
}

/** A stepped scale with the figure the games measured for it. */
function Measured({ fig, stale, children }: { fig: ReactNode; stale: boolean; children: ReactNode }) {
  return (
    <div className="ti-measured">
      {children}
      {fig != null && <Fig stale={stale}>{fig}</Fig>}
    </div>
  );
}

// ---------------------------------------------------------------- with the ball

function WithBall({ t, players, out, stale }: ColProps) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const order = team.rotation.order;
  const shape = shapeOf(t.offense);
  const five = useMemo(() => nextFive(order, players), [order, players]);
  const notes = useMemo(() => shapeNotes(five), [five]);
  const ov = offPresetOf(t).values;
  // the action drawn: the one last touched, else the one called most
  const [drawn, setDrawn] = useState<ActionType | null>(null);
  const most = ACTIONS.reduce((a, k) => (t.offense.actions[k] > t.offense.actions[a] ? k : a), ACTIONS[0]);
  const action = drawn ?? most;
  const total = Math.max(
    1,
    ACTIONS.reduce((a, k) => a + t.offense.actions[k], 0),
  );
  const shares = wholePercents(ACTIONS.map((a) => t.offense.actions[a] / total));
  const rules = SHAPE_ACTIONS[shape];
  const stepAction = (a: ActionType, d: number) => {
    setDrawn(a);
    tweak((tt) => {
      // the next level down or up from the value itself: a style's 10 steps down to 0, not nowhere
      const v = tt.offense.actions[a];
      const next = d < 0 ? [...LEVEL_VALUES].reverse().find((x) => x < v) : LEVEL_VALUES.find((x) => x > v);
      if (next !== undefined) tt.offense.actions[a] = next;
    });
  };
  return (
    <>
      <Col
        i={0}
        title="Shape and pace"
        sub="How we line up, and how fast"
        help={
          <Help title="Shape and pace">
            {OFF_SHAPES.map((s) => (
              <p key={s}>
                <b>{SHAPE_META[s].label}:</b> {SHAPE_META[s].help}
              </p>
            ))}
            <p>
              <b>Tempo:</b> how long you take in the half court. Faster means more possessions, turnovers and fatigue.
            </p>
          </Help>
        }
      >
        <div className="over">
          <Term id="shape">Offensive shape</Term>
        </div>
        <div className="ti-thumbs" role="radiogroup" aria-label="Offensive shape">
          {OFF_SHAPES.map((s) => {
            const note = notes[s];
            return (
              <button
                key={s}
                role="radio"
                aria-checked={s === shape}
                className={`ti-thumb${s === shape ? ' on' : ''}`}
                onClick={() =>
                  tweak((tt) => {
                    if (s === 'fourOut') delete tt.offense.shape;
                    else tt.offense.shape = s;
                  })
                }
              >
                <FormationThumb spots={OFF_SPOTS[s]} marks="o" />
                <span className="ti-thumb-n">{SHAPE_META[s].label}</span>
                {note ? (
                  <span className={`ti-thumb-tag ${note.tone ?? ''}`}>{note.text}</span>
                ) : (
                  <span className="ti-thumb-tag">{s === 'fourOut' ? 'The default' : 'No clear lean'}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ti-read">
          <span>
            <b className="good">+</b> {SHAPE_META[shape].good}
          </span>
          <span>
            <b className="bad">−</b> {SHAPE_META[shape].bad}
          </span>
        </div>
        <Measured stale={stale} fig={out ? `${out.secPerPoss.toFixed(1)} s a possession` : null}>
          <Lv label="Tempo" level="pace" value={t.offense.pace} mark={ov.pace} set={(tt, x) => void (tt.offense.pace = x)} />
        </Measured>
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
      </Col>

      <Col
        i={1}
        title="Build the advantage"
        sub="How our possessions start"
        help={
          <Help title="Build the advantage">
            <p>Each trip picks an action by this mix and by what the five on the floor run well. Lean too hard on one and defenses key on it.</p>
            <p>Each row says how many of your trips ended in it. Kick-out shots off any action aren&apos;t counted.</p>
            {ACTIONS.map((a) => (
              <p key={a}>
                <b>{ACTION_META[a].label}:</b> {ACTION_META[a].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="over">The playbook</div>
        <div className="ti-bar" role="img" aria-label={`The playbook's mix: ${ACTIONS.map((a) => `${ACTION_META[a].label} ${shares[ACTIONS.indexOf(a)]}%`).join(', ')}`}>
          {ACTIONS.filter((a) => t.offense.actions[a] > 0).map((a) => {
            const share = t.offense.actions[a] / total;
            return (
              <span key={a} className={`a-${a}${rules.clash[a] ? ' clash' : ''}`} style={{ flexGrow: share }}>
                {share >= 0.1 && <b className="num">{shares[ACTIONS.indexOf(a)]}%</b>}
              </span>
            );
          })}
        </div>
        <div className="ti-acts">
          {ACTIONS.map((a) => {
            const v = t.offense.actions[a];
            const li = levelIndex(v);
            const clash = rules.clash[a];
            const suits = rules.suits.includes(a);
            return (
              <div key={a} className={`ti-act a-${a}${a === action ? ' on' : ''}${clash ? ' clash' : ''}`}>
                <button className="ti-act-pick" aria-pressed={a === action} aria-label={`Draw ${ACTION_META[a].label}`} onClick={() => setDrawn(a)}>
                  <i className="ti-sw" aria-hidden="true" />
                  <span className="grow">
                    <span className="ti-act-n">{optLabel(ACTION_META[a].label, levelIndex(ov.actions[a]) === li)}</span>
                    <span className="ti-act-l">
                      {TACTIC_LEVELS.action[li]}
                      {out && <span className={`ti-act-u num${stale ? ' stale' : ''}`}> · ends {pct(usage(out, a))} of trips</span>}
                      {clash ? <b className="warn"> · {clash}</b> : suits ? <b className="good"> · Suits {SHAPE_META[shape].short}</b> : null}
                    </span>
                  </span>
                </button>
                <span className="ti-stepper">
                  <button aria-label={`Less ${ACTION_META[a].label}`} disabled={v <= 0} onClick={() => stepAction(a, -1)}>
                    <Minus size={15} />
                  </button>
                  <button aria-label={`More ${ACTION_META[a].label}`} disabled={v >= 100} onClick={() => stepAction(a, 1)}>
                    <Plus size={15} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <PlayDiagram shape={shape} action={action} />
      </Col>

      <Col
        i={2}
        title="Finish the possession"
        sub="Where we want our shots"
        help={
          <Help title="Finish the possession">
            <p>
              <b>Three-pointers:</b> higher turns mid-range looks into threes. It pays with shooters and costs without them.
            </p>
            <p>
              <b>Attack the rim:</b> more drives: shots at the rim and fouls drawn, with more charges and strips in traffic.
            </p>
            <p>The chart is where your rotation&apos;s shots come from with these instructions. A bigger hex is more shots.</p>
          </Help>
        }
      >
        <HexCourt diet={out?.own ?? null} stale={stale} label="Where your shots come from" />
        <div className="ti-axis z-three">
          <Lv label="Three-pointers" level="threePoint" value={t.offense.threePoint} mark={ov.threePoint} set={(tt, x) => void (tt.offense.threePoint = x)} />
        </div>
        <div className="ti-axis z-rim">
          <Lv label="Attack the rim" level="rimAttack" value={t.offense.rimAttack} mark={ov.rimAttack} set={(tt, x) => void (tt.offense.rimAttack = x)} />
        </div>
        <div className="over">Expected shot mix</div>
        <MixTiles diet={out?.own ?? null} stale={stale} />
      </Col>
    </>
  );
}

// ---------------------------------------------------------------- transitions

function Transitions({ t, players, out, stale }: ColProps) {
  const league = useLeague();
  const ov = offPresetOf(t).values;
  const dv = defPresetOf(t).values;
  const glass = t.offense.glass ?? {};
  const crash = players.filter((p) => glass[p.pid] === 1);
  const back = players.filter((p) => glass[p.pid] === -1);
  const names = (ps: Player[]) => ps.map((p) => shortName(league, p)).join(', ');
  return (
    <>
      <Col
        i={0}
        title="When we win the ball"
        sub="Run, or walk it up"
        help={
          <Help title="When we win the ball">
            <p>
              <b>After a stop:</b> how often you run before the defense sets. Running scores best and costs legs.
            </p>
          </Help>
        }
      >
        <TransDiagram kind="run" n={levelIndex(t.offense.transition)} label={`${levelIndex(t.offense.transition)} of your five run after a stop`} />
        <Measured stale={stale} fig={out ? `${pct(out.fastBreak)} of trips on the break` : null}>
          <Lv label="After a stop" level="transition" value={t.offense.transition} mark={ov.transition} set={(tt, x) => void (tt.offense.transition = x)} />
        </Measured>
        <p className="tx-note">Missed threes come off long and start more breaks, yours and theirs.</p>
      </Col>
      <Col
        i={1}
        title="When a shot goes up"
        sub="Chase the miss, or get back"
        help={
          <Help title="When a shot goes up">
            <p>Crashing the glass wins second chances, gives up fast breaks and tires legs.</p>
            {([1, -1] as const).map((g) => (
              <p key={g}>
                <b>{GLASS_META[g].label}:</b> {GLASS_META[g].help}
              </p>
            ))}
          </Help>
        }
      >
        <TransDiagram kind="glass" n={levelIndex(t.offense.crashBoards)} label={`${levelIndex(t.offense.crashBoards)} of your five chase the miss, the rest get back`} />
        <Measured stale={stale} fig={out ? `${pct(out.orb)} of misses won back` : null}>
          <Lv label="Crash the offensive glass" level="crashBoards" value={t.offense.crashBoards} mark={ov.crashBoards} set={(tt, x) => void (tt.offense.crashBoards = x)} />
        </Measured>
        <Measured stale={stale} fig={out ? `They run on ${pct(out.oppFastBreak)} of trips` : null}>
          <Lv label="Transition defense" level="getBack" value={t.defense.getBack} mark={dv.getBack} set={(tt, x) => void (tt.defense.getBack = x)} />
        </Measured>
        <p className="tx-note">
          {crash.length || back.length ? (
            <>
              {crash.length > 0 && <>Always crash: {names(crash)}. </>}
              {back.length > 0 && <>Always get back: {names(back)}.</>}
            </>
          ) : (
            'Glass duties: everyone goes as the team does. Tap a player on the board to set his.'
          )}
        </p>
      </Col>
      <Col
        i={2}
        title="When they inbound"
        sub="Pick them up full court, or set up"
        help={
          <Help title="When they inbound">
            {(Object.keys(PRESS_META) as PressMode[]).map((k) => (
              <p key={k}>
                <b>{PRESS_META[k].label}:</b> {PRESS_META[k].help}
              </p>
            ))}
          </Help>
        }
      >
        <TransDiagram kind="press" n={PRESS_UP[t.defense.press]} label={PRESS_META[t.defense.press].help} />
        <Measured stale={stale} fig={out ? `They lose it on ${pct(out.forced)} of trips` : null}>
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
        </Measured>
        <p className="tx-note">{PRESS_META[t.defense.press].help}</p>
      </Col>
    </>
  );
}

// ---------------------------------------------------------------- without the ball

function WithoutBall({ t, players, out, stale }: ColProps) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const dv = defPresetOf(t).values;
  const five = useMemo(() => nextFive(team.rotation.order, players), [team.rotation.order, players]);
  const big = [...five].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
  const bigC = big ? composites(big.ratings) : null;
  const fit = (good: boolean, yes: string, no: string) => <Tag tone={good ? 'good' : 'warn'}>{good ? yes : no}</Tag>;
  return (
    <>
      <Col
        i={0}
        title="Shape"
        sub="How we line up without it"
        help={
          <Help title="Defensive shape">
            {ALL_SCHEMES.map((k) => (
              <p key={k}>
                <b>{SCHEME_META[k].label}:</b> {SCHEME_META[k].help}
              </p>
            ))}
          </Help>
        }
      >
        <div className="over">Scheme</div>
        <div className="ti-thumbs three" role="radiogroup" aria-label="Defensive scheme">
          {ALL_SCHEMES.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={k === t.defense.scheme}
              className={`ti-thumb${k === t.defense.scheme ? ' on' : ''}`}
              onClick={() => tweak((tt) => void (tt.defense.scheme = k))}
            >
              <FormationThumb spots={DEF_SPOTS[k]} marks="x" />
              <span className="ti-thumb-n">{optLabel(SCHEME_META[k].label, k === dv.scheme)}</span>
              <span className="ti-thumb-tag">{SCHEME_NOTE[k] ?? 'The base defense'}</span>
            </button>
          ))}
        </div>
        <p className="tx-note">{SCHEME_META[t.defense.scheme].help}</p>
      </Col>
      <Col
        i={1}
        title="Guard the action"
        sub="What we do with their screens"
        help={
          <Help title="Guard the action">
            {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => (
              <p key={k}>
                <b>{COVERAGE_META[k].label}:</b> {COVERAGE_META[k].help}
              </p>
            ))}
            <p>Drop needs a big who protects the rim. Switching and hedging need one who moves.</p>
            <p>
              <b>Ball pressure:</b> more steals and turnovers, and more fouls. Secure handlers blow by it.
            </p>
          </Help>
        }
      >
        <div className="tx-lv">
          <div className="slider-label tx-label">
            <Term id="pnr">Ball-screen coverage</Term>
          </div>
          <Chips
            label="Ball-screen coverage"
            value={t.defense.pnr}
            onChange={(x: PnrCoverage) => tweak((tt) => void (tt.defense.pnr = x))}
            options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: optLabel(COVERAGE_META[k].label, k === dv.pnr) }))}
          />
          {big && bigC && (t.defense.pnr === 'drop' || t.defense.pnr === 'switch' || t.defense.pnr === 'hedge') && (
            <div className="tx-bigfit">
              <span className="grow">
                <b>{shortName(league, big)}</b>: {ratingText(big, 'blk')} · {ratingText(big, 'spd')}
              </span>
              {t.defense.pnr === 'drop' && fit(bigC.rimProt >= 60, 'Built for drop', 'Weak rim deterrent')}
              {t.defense.pnr === 'switch' && fit(big.ratings.spd >= 45, 'Mobile enough', 'Guards will hunt him')}
              {t.defense.pnr === 'hedge' && fit(big.ratings.spd >= 45, 'Can show and recover', 'Slow to recover')}
            </div>
          )}
        </div>
        <CoverageDiagram coverage={t.defense.pnr} />
        <div className="tx-toggles">
          <Toggle
            on={t.defense.switchOffBall}
            onChange={(x) => tweak((tt) => void (tt.defense.switchOffBall = x))}
            label="Switch off-ball screens"
            help="Stops handoffs and movement shooters. Switched bigs get driven on, and switched guards get posted up."
          />
        </div>
        <Measured stale={stale} fig={out ? `They lose it on ${pct(out.forced)} of trips` : null}>
          <Lv label="Ball pressure" level="pressure" value={t.defense.pressure} mark={dv.pressure} set={(tt, x) => void (tt.defense.pressure = x)} />
        </Measured>
      </Col>
      <Col
        i={2}
        title="Contest the finish"
        sub="Which shots we give up"
        help={
          <Help title="Contest the finish">
            <p>
              <b>Help defense:</b> packing the paint walls off drives and gives up kick-out threes. Stay home against shooters.
            </p>
            <p>The chart is where the league&apos;s shots come from against these instructions. A bigger hex is more shots.</p>
          </Help>
        }
      >
        <HexCourt diet={out?.opp ?? null} stale={stale} label="Where their shots come from" />
        <Lv label="Help defense" level="help" value={t.defense.help} mark={dv.help} set={(tt, x) => void (tt.defense.help = x)} />
        <div className="over">Shots we allow</div>
        <MixTiles diet={out?.opp ?? null} stale={stale} />
      </Col>
    </>
  );
}
