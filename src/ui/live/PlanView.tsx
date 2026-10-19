// The live game's Game plan: the battle as it stands, each number next to the lever that moves it.
// Their play types tonight against the league's, each with the setting that defends it (the
// ball-screen coverage beside their pick-and-roll, help beside their spot-ups, transition defense
// beside their run-outs); their scorers and who's been on each, a tap from their sheet; the
// defenders of theirs you're scoring on, with Attack; your own play types with the action behind
// each; then the team-wide levers, and every setting one tap down. Every change goes through the live
// game, so its journal keeps it and the bench measures it from here.
import { useMemo, type ReactNode } from 'react';
import { ChevronRight, RotateCcw, SlidersHorizontal, Target } from 'lucide-react';
import type { DefScheme, PnrCoverage, PressMode, Tactics } from '../../core/types';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { ALL_SCHEMES, COVERAGE_META, PRESS_META, SCHEME_META } from '../../core/sim/tactics';
import { zScore } from '../../core/analysis/playTypes';
import { madeAtt } from '../../core/format';
import { Section, Tag } from '../components/ui';
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
  names: ['Stay home', 'Balanced', 'Pack the paint'],
  values: [30, 50, 75],
  read: (t) => t.defense.help,
  write: (t, v) => void (t.defense.help = v),
};
const GET_BACK: Three = {
  label: 'Transition defense',
  names: ['Crash the glass', 'Balanced', 'Sprint back'],
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
  label: 'Three-point emphasis',
  names: ['Fewer threes', 'Balanced', 'More threes'],
  values: [25, 50, 78],
  read: (t) => t.offense.threePoint,
  write: (t, v) => void (t.offense.threePoint = v),
};
const PUSH: Three = {
  label: 'Push in transition',
  names: ['Walk it up', 'Balanced', 'Push'],
  values: [25, 50, 80],
  read: (t) => t.offense.transition,
  write: (t, v) => void (t.offense.transition = v),
};
const CRASH: Three = {
  label: 'Crash the offensive glass',
  names: ['Get back', 'Balanced', 'Crash'],
  values: [20, 50, 78],
  read: (t) => t.offense.crashBoards,
  write: (t, v) => void (t.offense.crashBoards = v),
};
const PACE: Three = {
  label: 'Pace',
  names: ['Slow it down', 'Balanced', 'Push the pace'],
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

function ThreeChips({ lever, t, apply }: { lever: Three; t: Tactics; apply: (fn: (t: Tactics) => void) => void }) {
  const cur = third(lever.read(t));
  return (
    <div className="lv-lev" role="group" aria-label={lever.label}>
      {lever.names.map((n, i) => (
        <button key={n} className={`chip sm ${i === cur ? 'on' : ''}`} aria-pressed={i === cur} onClick={() => i !== cur && apply((x) => lever.write(x, lever.values[i]))}>
          {n}
        </button>
      ))}
    </div>
  );
}

/** A play type tonight: its points a trip against the league's, coloured by which way is good for you, and its trips. */
function PlayRow({ k, v, base, mine, children }: { k: string; v: { poss: number; pts: number }; base?: number; mine: boolean; children?: ReactNode }) {
  const ppp = v.pts / v.poss;
  const z = base !== undefined && v.poss >= 4 ? zScore(v, base) : 0;
  // good for you: your plays above the league, theirs below it
  const tone = Math.abs(z) < 1 ? '' : z > 0 === mine ? 'good' : 'bad';
  return (
    <div className="lv-pr">
      <div className="lv-pr-top">
        <span className="lv-pr-n grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
        <span className="lv-pr-trips tiny dim num">{v.poss} trips</span>
        <span className={`lv-pr-ppp num ${tone}`}>{ppp.toFixed(2)}</span>
        {base !== undefined && <span className="lv-pr-base tiny dim num">lg {base.toFixed(2)}</span>}
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
}: {
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

  return (
    <div className="lv-plan">
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

      <Section title={`${abbrevs.them} on offense`}>
        <div className="card flush list">
          {!theirs.length && <div className="lv-pr-empty small dim">Their play types show here as the game goes.</div>}
          {theirs.map(([k, v]) => {
            const lever = THEIR_LEVER[k as FinishType];
            const pnr = k === 'pnrBH' || k === 'pnrRoll';
            return (
              <PlayRow key={k} k={k} v={v} base={baselines[k]} mine={false}>
                {pnr && man && (
                  <div className="lv-lev" role="group" aria-label="Pick-and-roll coverage">
                    {(Object.keys(COVERAGE_META) as PnrCoverage[]).map((c) => (
                      <button
                        key={c}
                        className={`chip sm ${t.defense.pnr === c ? 'on' : ''}`}
                        aria-pressed={t.defense.pnr === c}
                        onClick={() => apply((x) => void (x.defense.pnr = c))}
                      >
                        {COVERAGE_META[c].label}
                      </button>
                    ))}
                  </div>
                )}
                {pnr && !man && <div className="tiny dim">Your {SCHEME_META[t.defense.scheme].label} plays their ball screens: man-to-man brings the coverages back.</div>}
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
            const how = t.defense.playerD?.[p.pid];
            return (
              <button key={p.pid} className="lv-sc-row" onClick={() => onPlayer(p.pid)} aria-haspopup="dialog">
                <span className="lv-sc-pts num">{p.pts}</span>
                <span className="grow lv-sc-t">
                  <span className="lv-sc-n">
                    {nameOf(p.pid)}
                    {!them.on.includes(p.pid) && <span className="tiny dim"> · bench</span>}
                  </span>
                  <span className="tiny dim2">
                    {madeAtt(p.fgm, p.fga)}
                    {on ? ` · ${nameOf(on.def)} on him: ${on.pts} on ${on.trips} trips` : ''}
                  </span>
                </span>
                {target && <Tag tone="info">{t.defense.starPlan === 'double' ? 'Doubled' : 'Denied'}</Tag>}
                {how && !target && <Tag>{how === 'under' ? 'Under' : how === 'tight' ? 'Top-lock' : how === 'sag' ? 'Sag' : 'Physical'}</Tag>}
                <ChevronRight size={16} className="dim" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={`${abbrevs.us} on offense`}>
        <div className="card flush list">
          {!ours.length && <div className="lv-pr-empty small dim">Your play types show here as the game goes.</div>}
          {ours.map(([k, v]) => {
            const lever = OUR_LEVER[k as FinishType];
            return (
              <PlayRow key={k} k={k} v={v} base={baselines[k]} mine>
                {lever && <ThreeChips lever={lever} t={t} apply={apply} />}
              </PlayRow>
            );
          })}
          {theirD.slice(0, 2).map(([pid, v]) => (
            <div key={pid} className="lv-pr">
              <div className="lv-pr-top">
                <Target size={14} className="dim" aria-hidden="true" />
                <span className="grow lv-pr-n">
                  Scoring on {nameOf(pid)}
                  {!them.on.includes(pid) && <span className="tiny dim"> · bench</span>}
                </span>
                <span className="lv-pr-trips tiny dim num">{v.trips} trips</span>
                <span className={`lv-pr-ppp num ${v.pts / v.trips >= 1.25 ? 'good' : ''}`}>{(v.pts / v.trips).toFixed(2)}</span>
              </div>
              <div className="lv-lev">
                <button
                  className={`chip sm ${hunt === pid ? 'on' : ''}`}
                  aria-pressed={hunt === pid}
                  onClick={() => apply((x) => void (x.offense.huntTarget = hunt === pid ? null : pid))}
                >
                  {hunt === pid ? `Attacking ${nameOf(pid)}` : `Attack ${nameOf(pid)}`}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Team">
        <div className="lv-team-lev">
          <div className="lv-tl">
            <span className="slider-label">
              <Term id="zone">Defense</Term>
            </span>
            <div className="lv-lev" role="group" aria-label="Base scheme">
              {ALL_SCHEMES.map((k: DefScheme) => (
                <button
                  key={k}
                  className={`chip sm ${t.defense.scheme === k ? 'on' : ''}`}
                  aria-pressed={t.defense.scheme === k}
                  onClick={() => apply((x) => void (x.defense.scheme = k))}
                >
                  {SCHEME_META[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="lv-tl">
            <span className="slider-label">{PACE.label}</span>
            <ThreeChips lever={PACE} t={t} apply={apply} />
          </div>
          <div className="lv-tl">
            <span className="slider-label">
              <Term id="press">Full-court press</Term>
            </span>
            <div className="lv-lev" role="group" aria-label="Full-court press">
              {(Object.keys(PRESS_META) as PressMode[]).map((k) => (
                <button
                  key={k}
                  className={`chip sm ${t.defense.press === k ? 'on' : ''}`}
                  aria-pressed={t.defense.press === k}
                  onClick={() => apply((x) => void (x.defense.press = k))}
                >
                  {PRESS_META[k].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="lv-plan-all" onClick={onAll}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className="grow">Every setting</span>
          <ChevronRight size={16} className="dim" aria-hidden="true" />
        </button>
      </Section>
    </div>
  );
}
