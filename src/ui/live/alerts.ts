// The live assistant's alerts, worked out from the game as the court has drawn it (see drawn.ts),
// never from the sim running a possession ahead. Pure: the Live screen turns their actions into
// timeouts, substitutions and tactic changes.

import type { GameAdjustment, GameManagement, Settings, Tactics } from '../../core/types';
import type { InGameInjury } from '../../core/sim/engine';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { impactAdvice, impactSentence, teamRef } from '../../core/analysis/gameReport';
import { impactCounter, liveCounter } from '../../core/ai/advisor';
import { zScore } from '../../core/analysis/playTypes';
import { adviceFor } from '../seasonAnalysis';
import type { Drawn, DrawnPlayer } from './drawn';

export type AlertAction =
  | { kind: 'timeout' }
  /** Take `out` off the floor for `in`. */
  | { kind: 'sub'; out: number; in: number }
  | { kind: 'tactics'; apply: (t: Tactics) => void }
  /** Open the substitutions sheet. */
  | { kind: 'subs' };

export interface LiveAlert {
  id: string;
  text: string;
  tone: 'warn' | 'bad' | 'info';
  action?: AlertAction & { label: string };
}

/** Something that happened in the game, shown once the court has drawn the possession it happened in. */
export interface LiveEvent {
  id: string;
  kind: 'injury' | 'foulout' | 'eject' | 'adjust';
  /** The team it happened to (0 home, 1 away). */
  side: 0 | 1;
  pid?: number;
  text: string;
  /** Game seconds played when it was drawn. */
  at: number;
}

/** Events stay up as alerts for two minutes of game time (or until dismissed). */
const EVENT_SEC = 120;

/** Crunch time, when the staff stops subbing for fouls and fatigue: the last six minutes of the fourth quarter and overtime. */
export const crunchTime = (q: number, clock: number) => q >= 4 && clock < 360;

/**
 * The foul count at which the staff sits a player in period `q` (the engine's rule): 2 in Q1, 3 in
 * Q2, 4 in Q3 and 5 in Q4 and overtime as Standard has it, one sooner on Strict (after Q1), one later
 * on Loose.
 */
export function foulLimit(q: number, mode: GameManagement['foulTrouble']): number {
  const qq = Math.min(q, 4);
  const base = qq + 1;
  return mode === 'strict' ? base - (qq === 1 ? 0 : 1) : mode === 'loose' ? base + 1 : base;
}

/** Whether the staff will call a timeout itself at the next dead ball to stop the run (the engine's auto-timeout rule). */
export function staffCallsTimeout(view: Drawn, side: 0 | 1, manage: GameManagement, manualSubs: boolean): boolean {
  if (!manage.autoTimeouts || manualSubs) return false;
  const late = view.q >= 4 && view.clock < 120;
  const reserve = late ? 0 : view.q >= 4 ? 1 : 2;
  // two each after the 3:00 mark of the fourth quarter
  const left = view.q === 4 && view.clock <= 180 ? Math.min(2, view.sides[side].timeouts) : view.sides[side].timeouts;
  return view.sides[1 - side].run >= manage.timeoutRun && left > reserve;
}

/** "an 8-0 run", "an 11-0 run", "a 12-0 run". */
export const aRun = (n: number) => `${n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90) ? 'an' : 'a'} ${n}-0 run`;

/** A play type mid-sentence: "their isolation plays", "their P&R ball handler plays". */
const playType = (ft: FinishType) => FINISH_LABEL[ft].replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());

export interface AlertInput {
  view: Drawn;
  /** The user's side (0 home, 1 away). */
  side: 0 | 1;
  /** [home, away]. */
  teams: [{ tid: number; name: string; abbrev: string }, { tid: number; name: string; abbrev: string }];
  /** The user's tactics now. */
  tactics: Tactics;
  manualSubs: boolean;
  atBreak: boolean;
  /** The user called a timeout the court hasn't shown yet, or none can be called now (the game is at the period's buzzer). */
  timeoutPending: boolean;
  events: LiveEvent[];
  names: (pid: number) => string;
  /** This season's points per possession by play type. */
  baselines: Record<string, number>;
  complexity: Settings['complexity'];
  /** Who the staff would bring in for `pid`, if anyone can come in. */
  subFor: (pid: number) => number | undefined;
}

/** Everything the assistant would say now, most urgent first (the screen shows the first few not dismissed). */
export function liveAlerts(a: AlertInput): LiveAlert[] {
  const { view, side, tactics, names } = a;
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const themTeam = a.teams[1 - side];
  const meTeam = a.teams[side];
  const out: LiveAlert[] = [];
  const crunch = crunchTime(view.q, view.clock);
  const onFloor = me.on.map((pid) => me.players.find((p) => p.pid === pid)).filter((p): p is DrawnPlayer => !!p);
  const sit = (p: DrawnPlayer, label: string): LiveAlert['action'] => {
    const sub = a.subFor(p.pid);
    return sub === undefined ? undefined : { kind: 'sub', out: p.pid, in: sub, label };
  };

  // your players lost for the game (the staff has already sent someone in, unless you handle subs)
  for (const e of a.events) {
    if (e.side !== side || e.kind === 'adjust' || view.elapsed - e.at > EVENT_SEC) continue;
    out.push({ id: e.id, tone: 'bad', text: e.text, action: a.manualSubs ? { kind: 'subs', label: 'Subs' } : undefined });
  }

  // one foul from fouling out late: worth a decision every time, crunch time or not
  for (const p of onFloor) {
    if (view.q >= 4 && p.fouls === 5) out.push({ id: `fouls-${p.pid}-5`, tone: 'warn', text: `${names(p.pid)} has 5 fouls: one more and he's out.`, action: sit(p, 'Sit him') });
  }
  // a technical already in the fourth quarter, when tempers run hottest: one more and he's ejected
  for (const p of onFloor) {
    if (view.q >= 4 && p.tf === 1) out.push({ id: `tech-${p.pid}`, tone: 'warn', text: `${names(p.pid)} has a technical: one more and he's ejected.`, action: sit(p, 'Sit him') });
  }

  // a run the staff won't stop for you (it calls its own timeouts unless you handle subs)
  if (them.run >= 8 && me.timeouts > 0 && !a.atBreak && !a.timeoutPending && !staffCallsTimeout(view, side, tactics.manage, a.manualSubs))
    out.push({
      id: `run-${them.score}`,
      tone: 'warn',
      text: `The ${themTeam.name} are on ${aRun(them.run)}. A timeout rests legs (+5% energy) and resets the run, but it also gives their coach a chance to adjust.`,
      action: { kind: 'timeout', label: 'Timeout' },
    });

  // tired legs: the staff subs them out itself, except in crunch time or when you handle subs
  if (a.manualSubs || crunch)
    for (const p of onFloor) {
      if (p.out !== 0 || p.energy >= tactics.manage.fatigueSub) continue;
      const sub = a.subFor(p.pid);
      out.push({
        id: `tired-${p.pid}-${Math.round(p.energy * 10)}`,
        tone: 'warn',
        text: `${names(p.pid)} is gassed (${Math.round(p.energy * 100)}% energy).`,
        action: sub === undefined ? undefined : { kind: 'sub', out: p.pid, in: sub, label: `Sub ${names(sub)}` },
      });
    }

  // foul trouble the staff would have sat him for (only you are making the calls)
  if (a.manualSubs && !crunch) {
    const limit = foulLimit(view.q, tactics.manage.foulTrouble);
    for (const p of onFloor) {
      if (p.fouls < limit || (view.q >= 4 && p.fouls === 5)) continue;
      out.push({
        id: `fouls-${p.pid}-${p.fouls}`,
        tone: 'warn',
        text: `${names(p.pid)} has ${p.fouls} fouls (your staff sits players at ${limit} in ${view.q <= 4 ? `Q${view.q}` : 'overtime'}).`,
        action: sit(p, 'Sit him'),
      });
    }
  }

  // the other coach changed something
  for (const e of a.events) {
    if (e.side === side || e.kind !== 'adjust' || view.elapsed - e.at > EVENT_SEC) continue;
    out.push({ id: e.id, tone: 'info', text: e.text });
  }

  // opponent play types torching us: well above this season's norm for that play, on a real sample
  // ("Other" is presses, the clock and late fouls: nothing to adjust against)
  for (const [k, v] of Object.entries(them.pt)) {
    const base = a.baselines[k];
    if (k === 'misc' || base === undefined || v.poss < 12 || zScore(v, base) <= 2) continue;
    const ft = k as FinishType;
    // only a button that changes something: none once the tactics already do it
    const counter = liveCounter(ft, tactics);
    const text = `Their ${playType(ft)} plays are scoring ${(v.pts / v.poss).toFixed(2)} per possession (league ${base.toFixed(2)}).${counter?.note ? ` ${counter.note}` : ''}`;
    out.push({ id: `pt-${k}`, tone: 'warn', text, action: counter && { kind: 'tactics', apply: counter.apply, label: counter.label } });
  }

  // the biggest tactical edge against us so far, while the tactics still give it to them
  const worst = view.impacts.filter((im) => im.t !== side && im.pts >= 2.5 && impactAdvice(im.key, tactics)).sort((x, y) => y.pts - x.pts)[0];
  if (worst) {
    const fix = impactCounter(worst.key, tactics);
    out.push({
      id: `imp-${worst.key}`,
      tone: 'warn',
      text: `${impactSentence(worst.key, teamRef(themTeam), teamRef(meTeam))} ${adviceFor(impactAdvice(worst.key, tactics)!, a.complexity)}`,
      action: fix && { kind: 'tactics', apply: fix.apply, label: fix.label },
    });
  }

  for (const [k, v] of Object.entries(me.pt)) {
    const base = a.baselines[k];
    if (k !== 'misc' && base !== undefined && v.poss >= 12 && zScore(v, base) < -2)
      out.push({
        id: `mypt-${k}`,
        tone: 'info',
        text: `Our ${playType(k as FinishType)} plays are stalling at ${(v.pts / v.poss).toFixed(2)} per possession (league ${base.toFixed(2)}). Consider running other actions.`,
      });
  }
  return out;
}

/**
 * What happened in the possessions between two snapshots: injuries, foul-outs and ejections on either
 * side, and the coaches' adjustments (the engine's lists, read up to `next`'s counts).
 */
export function newEvents(
  prev: Drawn | null,
  next: Drawn,
  adjustments: GameAdjustment[],
  injuries: InGameInjury[],
  teams: AlertInput['teams'],
  names: (pid: number) => string,
): LiveEvent[] {
  const out: LiveEvent[] = [];
  const sideOf = (tid: number): 0 | 1 => (teams[0].tid === tid ? 0 : 1);
  for (const inj of injuries.slice(prev?.injuries ?? 0, next.injuries))
    out.push({ id: `inj-${inj.pid}`, kind: 'injury', side: sideOf(inj.tid), pid: inj.pid, text: `${names(inj.pid)} is hurt and out for the game.`, at: next.elapsed });
  next.sides.forEach((s, i) => {
    for (const p of s.players) {
      if (p.out !== 1 && p.out !== 3) continue;
      const before = prev?.sides[i].players.find((x) => x.pid === p.pid);
      if (prev && before?.out === p.out) continue;
      if (p.out === 3)
        out.push({
          id: `ej-${p.pid}`,
          kind: 'eject',
          side: i as 0 | 1,
          pid: p.pid,
          text: `${names(p.pid)} has been ejected (${p.ej === 'flagrant' ? 'Flagrant 2' : '2 technicals'}).`,
          at: next.elapsed,
        });
      else out.push({ id: `fo-${p.pid}`, kind: 'foulout', side: i as 0 | 1, pid: p.pid, text: `${names(p.pid)} has fouled out.`, at: next.elapsed });
    }
  });
  adjustments
    .slice(prev?.adjustments ?? 0, next.adjustments)
    .forEach((adj, k) =>
      out.push({ id: `adj-${(prev?.adjustments ?? 0) + k}`, kind: 'adjust', side: adj.t, text: `${teams[adj.t].abbrev} adjusts: ${adj.text}.`, at: next.elapsed }),
    );
  return out;
}
