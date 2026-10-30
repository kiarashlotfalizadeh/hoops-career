// The live game's Tactics view: the mentality and tonight's plan, then the game one end at a time behind
// one switch. Each row says in plain words what a side is running and how it's going, with the lever
// that moves it named under it. Defense: their play types (the ball-screen coverage beside their
// pick-and-roll, help beside their spot-ups, transition defense beside their run-outs), their scorers
// with who's been on each, then your scheme and press. Offense: your own play types with the action
// behind each, the defenders of theirs you're scoring on with Attack, then your tempo. Every setting is
// one tap down at the foot. Every change goes through the live game, so its journal keeps it.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, RotateCcw, SlidersHorizontal, Target } from 'lucide-react';
import type { DefScheme, PnrCoverage, PressMode, Tactics } from '../../core/types';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { ALL_SCHEMES, COVERAGE_META, PRESS_META, SCHEME_META } from '../../core/sim/tactics';
import { zScore } from '../../core/analysis/playTypes';
import { keepFigures, madeAtt, plural } from '../../core/format';
import { Section, Segmented, Tag } from '../components/ui';
import { Term } from '../components/Glossary';
import type { Drawn } from './drawn';
import { matchups, sumBy } from './staff';
import type { PossLog } from '../../core/sim/log';

/** A three-way lever on a 0-100 setting: its low, middle and high settings. */
interface Three {
  label: string;
  names: [string, string, string];
  values: [number, number, number];
  read: (t: Tactics) => number;
  write: (t: Tactics, v: number) => void;
}

const third = (v: number) => (v < 38 ? 0 : v < 63 ? 1 : 2);

const HELP: Three = {
  label: 'Help defense',
  names: ['Stay home', 'Balanced', 'Pack paint'],
  values: [30, 50, 75],
  read: (t) => t.defense.help,
  write: (t, v) => void (t.defense.help = v),
};
const GET_BACK: Three = {
  label: 'Transition defense',
  names: ['Crash glass', 'Balanced', 'Sprint back'],
  values: [25, 50, 85],
  read: (t) => t.defense.getBack,
  write: (t, v) => void (t.defense.getBack = v),
};
const PRESSURE: Three = {
  label: 'Ball pressure',
  names: ['Contain', 'Balanced', 'Pressure'],
  values: [30, 50, 72],
  read: (t) => t.defense.pressure,
  write: (t, v) => void (t.defense.pressure = v),
};
const PHYSICAL: Three = {
  label: 'Physicality',
  names: ['Play clean', 'Balanced', 'Physical'],
  values: [30, 50, 70],
  read: (t) => t.defense.physicality,
  write: (t, v) => void (t.defense.physicality = v),
};
const action = (k: 'pnr' | 'iso' | 'post' | 'handoff' | 'motion', label: string): Three => ({
  label,
  names: ['Less', 'Normal', 'More'],
  values: [25, 50, 75],
  read: (t) => t.offense.actions[k],
  write: (t, v) => void (t.offense.actions[k] = v),
});
const THREES: Three = {
  label: 'Shot profile',
  names: ['Fewer threes', 'Balanced', 'More threes'],
  values: [25, 50, 78],
  read: (t) => t.offense.threePoint,
  write: (t, v) => void (t.offense.threePoint = v),
};
const PUSH: Three = {
  label: 'After a stop',
  names: ['Walk it up', 'Balanced', 'Push'],
  values: [25, 50, 80],
  read: (t) => t.offense.transition,
  write: (t, v) => void (t.offense.transition = v),
};
const CRASH: Three = {
  label: 'Offensive glass',
  names: ['Get back', 'Balanced', 'Crash'],
  values: [20, 50, 78],
  read: (t) => t.offense.crashBoards,
  write: (t, v) => void (t.offense.crashBoards = v),
};
const PACE: Three = {
  label: 'Tempo',
  names: ['Slow down', 'Balanced', 'Push pace'],
  values: [25, 50, 78],
  read: (t) => t.offense.pace,
  write: (t, v) => void (t.offense.pace = v),
};

/** The lever beside each of their play types (the ball-screen coverage is its own row). */
const THEIR_LEVER: Partial<Record<FinishType, Three>> = {
  spotup: HELP,
  cut: HELP,
  post: HELP,
  transition: GET_BACK,
  iso: PRESSURE,
  putback: PHYSICAL,
};
/** The lever beside each of your play types. */
const OUR_LEVER: Partial<Record<FinishType, Three>> = {
  pnrBH: action('pnr', 'Pick-and-roll'),
  pnrRoll: action('pnr', 'Pick-and-roll'),
  iso: action('iso', 'Isolation'),
  post: action('post', 'Post-up'),
  handoff: action('handoff', 'Handoffs & screens'),
  offscreen: action('handoff', 'Handoffs & screens'),
  cut: action('motion', 'Motion & cuts'),
  spotup: THREES,
  transition: PUSH,
  putback: CRASH,
};

/** The lever for the play at `i` in a list, unless a play above it has the same one. */
function firstLever(rows: [string, unknown][], i: number, levers: Partial<Record<FinishType, Three>>): Three | undefined {
  const lever = levers[rows[i][0] as FinishType];
  return lever && rows.slice(0, i).some(([k]) => levers[k as FinishType]?.label === lever.label) ? undefined : lever;
}

/** A named lever: what it is, then its choices across the row. */
function Lever({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="lv-lv">
      <span className="lv-lv-k">{label}</span>
      {children}
    </div>
  );
}

function Choices<T extends string>({ label, options, value, onPick }: { label: string; options: { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="lv-lev" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} className={`chip sm ${o.id === value ? 'on' : ''}`} aria-pressed={o.id === value} onClick={() => o.id !== value && onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ThreeChips({ lever, t, apply }: { lever: Three; t: Tactics; apply: (fn: (t: Tactics) => void) => void }) {
  const cur = third(lever.read(t));
  return (
    <Lever label={lever.label}>
      <div className="lv-lev three" role="group" aria-label={lever.label}>
        {lever.names.map((n, i) => (
          <button key={n} className={`chip sm ${i === cur ? 'on' : ''}`} aria-pressed={i === cur} onClick={() => i !== cur && apply((x) => lever.write(x, lever.values[i]))}>
            {n}
          </button>
        ))}
      </div>
    </Lever>
  );
}

/** A play type tonight: its points and trips, and in a word how it's going from your side. */
function PlayRow({ k, v, base, mine, children }: { k: string; v: { poss: number; pts: number }; base?: number; mine: boolean; children?: ReactNode }) {
  const z = base !== undefined && v.poss >= 4 ? zScore(v, base) : 0;
  const good = z > 0 === mine;
  const word = Math.abs(z) < 1 ? null : mine ? (good ? 'Working' : 'Stalling') : good ? 'Holding them' : 'Hurting you';
  return (
    <div className="lv-pr">
      <div className="lv-pr-top">
        <span className="grow lv-pr-t">
          <span className="lv-pr-n">{FINISH_LABEL[k as FinishType] ?? k}</span>
          <span className="tiny dim">
            {plural(v.pts, 'point')} on {plural(v.poss, 'trip')}
          </span>
        </span>
        {word && <Tag tone={good ? 'good' : 'bad'}>{word}</Tag>}
      </div>
      {children}
    </div>
  );
}

export function PlanView({
  view,
  side,
  tactics: t,
  logs,
  baselines,
  apply,
  nameOf,
  plan,
  changed,
  onReset,
  onPlayer,
  onAll,
  abbrevs,
  touchline,
}: {
  /** The touchline (see Touchline.tsx), at the top. */
  touchline?: ReactNode;
  view: Drawn;
  side: 0 | 1;
  tactics: Tactics;
  /** The possessions the court has drawn. */
  logs: PossLog[];
  baselines: Record<string, number>;
  apply: (fn: (t: Tactics) => void) => void;
  nameOf: (pid: number) => string;
  /** Tonight's game plan items. */
  plan: { id: string; label: string }[];
  /** What changed since the tip, a line (empty: nothing). */
  changed: string;
  onReset: () => void;
  /** Open a player's sheet. */
  onPlayer: (pid: number) => void;
  /** Every setting, in its sheet. */
  onAll: () => void;
  abbrevs: { us: string; them: string };
}) {
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const theirRows = useMemo(() => matchups(logs, (1 - side) as 0 | 1), [logs, side]);
  const ourRows = useMemo(() => matchups(logs, side), [logs, side]);
  const order = (pt: Record<string, { poss: number; pts: number }>) =>
    Object.entries(pt)
      .filter(([k, v]) => k !== 'misc' && v.poss >= 2)
      .sort((a, b) => b[1].poss - a[1].poss)
      .slice(0, 5);
  const theirs = order(them.pt);
  const ours = order(me.pt);
  const man = t.defense.scheme === 'man';

  // their scorers, best night first, and who's been on each
  const scorers = [...them.players]
    .filter((p) => p.pts > 0 || them.on.includes(p.pid))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 4);
  // the defenders of theirs you're scoring on
  const theirD = [...sumBy(ourRows, 'def')].filter(([, v]) => v.trips >= 4).sort((a, b) => b[1].pts / b[1].trips - a[1].pts / a[1].trips);
  const hunt = t.offense.huntTarget ?? null;
  // the battle one end at a time: one view under the touchline
  const [end, setEnd] = useState<'def' | 'off'>('def');

  return (
    <div className="lv-plan">
      {touchline && <div className="lv-plan-touch">{touchline}</div>}
      {(plan.length > 0 || changed) && (
        <div className="lv-plan-top">
          {plan.length > 0 && (
            <div className="chips">
              <span className="over">
                <Term id="gameplan">Tonight&apos;s plan</Term>
              </span>
              {plan.map((it) => (
                <Tag key={it.id} tone="info">
                  {it.label}
                </Tag>
              ))}
            </div>
          )}
          {changed && (
            <div className="lv-plan-changed small">
              <span className="dim">Changed tonight:</span> {changed}{' '}
              <button className="lv-plan-reset" onClick={onReset}>
                <RotateCcw size={13} aria-hidden="true" /> Reset
              </button>
            </div>
          )}
        </div>
      )}

      <Segmented
        value={end}
        onChange={setEnd}
        label="Which end"
        options={[
          { id: 'def', label: 'Defense' },
          { id: 'off', label: 'Offense' },
        ]}
      />

      {end === 'def' && (
        <>
          <Section title={`What ${abbrevs.them} is running`}>
            <div className="card flush list">
              {!theirs.length && <div className="lv-pr-empty small dim">Their plays show here as the game goes.</div>}
              {theirs.map(([k, v], i) => {
                // (a lever shows once, under the first play it moves: two sets of the same chips read as two settings)
                const lever = firstLever(theirs, i, THEIR_LEVER);
                const pnr = k === 'pnrBH' || k === 'pnrRoll';
                // (the coverage, or why there's none, under the first of their ball-screen rows only)
                const firstPnr = pnr && theirs.findIndex(([x]) => x === 'pnrBH' || x === 'pnrRoll') === i;
                return (
                  <PlayRow key={k} k={k} v={v} base={baselines[k]} mine={false}>
                    {firstPnr && man && (
                      <Lever label="Ball-screen coverage">
                        <Choices
                          label="Ball-screen coverage"
                          value={t.defense.pnr}
                          onPick={(c: PnrCoverage) => apply((x) => void (x.defense.pnr = c))}
                          options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((c) => ({ id: c, label: COVERAGE_META[c].label }))}
                        />
                      </Lever>
                    )}
                    {firstPnr && !man && <div className="tiny dim">Your {SCHEME_META[t.defense.scheme].label} plays their ball screens. Man-to-man brings the coverages back.</div>}
                    {lever && <ThreeChips lever={lever} t={t} apply={apply} />}
                  </PlayRow>
                );
              })}
            </div>
          </Section>

          <Section title="Their scorers">
            <div className="card flush list">
              {scorers.map((p) => {
                const on = theirRows.filter((r) => r.off === p.pid).sort((a, b) => b.trips - a.trips)[0];
                const target = t.defense.starPlan !== 'none' && t.defense.starTarget === p.pid;
                return (
                  <button key={p.pid} className="lv-sc-row" onClick={() => onPlayer(p.pid)} aria-haspopup="dialog">
                    <span className="grow lv-sc-t">
                      <span className="lv-sc-n">
                        {nameOf(p.pid)}
                        {!them.on.includes(p.pid) && <span className="tiny dim"> · bench</span>}
                      </span>
                      <span className="tiny dim2">
                        {p.pts} pts on {keepFigures(madeAtt(p.fgm, p.fga))}
                        {on ? ` · ${nameOf(on.def)} on him` : ''}
                      </span>
                    </span>
                    {target && <Tag tone="info">Doubled</Tag>}
                    <ChevronRight size={16} className="dim" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Your defense">
            <div className="card lv-team-lev">
              <Lever label={<Term id="zone">Scheme</Term>}>
                <Choices
                  label="Scheme"
                  value={t.defense.scheme}
                  onPick={(k: DefScheme) => apply((x) => void (x.defense.scheme = k))}
                  options={ALL_SCHEMES.map((k: DefScheme) => ({ id: k, label: SCHEME_META[k].label }))}
                />
              </Lever>
              <Lever label={<Term id="press">Full-court press</Term>}>
                <Choices
                  label="Full-court press"
                  value={t.defense.press}
                  onPick={(k: PressMode) => apply((x) => void (x.defense.press = k))}
                  options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
                />
              </Lever>
            </div>
          </Section>
        </>
      )}

      {end === 'off' && (
        <>
          <Section title={`What ${abbrevs.us} is running`}>
            <div className="card flush list">
              {!ours.length && <div className="lv-pr-empty small dim">Your plays show here as the game goes.</div>}
              {ours.map(([k, v], i) => {
                const lever = firstLever(ours, i, OUR_LEVER);
                return (
                  <PlayRow key={k} k={k} v={v} base={baselines[k]} mine>
                    {lever && <ThreeChips lever={lever} t={t} apply={apply} />}
                  </PlayRow>
                );
              })}
            </div>
          </Section>

          {theirD.length > 0 && (
            <Section title="Who you're scoring on">
              <div className="card flush list">
                {theirD.slice(0, 2).map(([pid, v]) => (
                  <div key={pid} className="lv-pr">
                    <div className="lv-pr-top">
                      <Target size={14} className="dim" aria-hidden="true" />
                      <span className="grow lv-pr-t">
                        <span className="lv-pr-n">
                          {nameOf(pid)}
                          {!them.on.includes(pid) && <span className="tiny dim"> · bench</span>}
                        </span>
                        <span className="tiny dim">
                          {plural(v.pts, 'point')} on {plural(v.trips, 'trip')}
                        </span>
                      </span>
                      <button
                        className={`chip sm ${hunt === pid ? 'on' : ''}`}
                        aria-pressed={hunt === pid}
                        onClick={() => apply((x) => void (x.offense.huntTarget = hunt === pid ? null : pid))}
                      >
                        {hunt === pid ? 'Attacking' : 'Attack'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Your offense">
            <div className="card lv-team-lev">
              <ThreeChips lever={PACE} t={t} apply={apply} />
            </div>
          </Section>
        </>
      )}

      <button className="lv-plan-all" onClick={onAll} aria-haspopup="dialog">
        <SlidersHorizontal size={17} aria-hidden="true" />
        <span className="grow">Every setting</span>
        <ChevronRight size={16} className="dim" aria-hidden="true" />
      </button>
    </div>
  );
}
