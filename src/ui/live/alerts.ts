// The live assistant's alerts, worked out from the game as the court has drawn it (see drawn.ts),
// never from the sim running a possession ahead. Each is a headline and one line, as the shared
// assistant rows have them: the Live screen shows a new one in the banner over the court, offers the
// top fix as the pill in its quick actions, and turns their actions into timeouts, substitutions and
// tactic changes. Pure.

import type { GameAdjustment, GameManagement, LiveOp, Tactics } from '../../core/types';
import type { InGameInjury } from '../../core/sim/engine';
import { FINISH_LABEL, type FinishType, type PossLog } from '../../core/sim/log';
import { cloneTactics } from '../../core/sim/tactics';
import { impactAdvice, impactSentence, leverPaid, teamRef } from '../../core/analysis/gameReport';
import { impactCounter, liveCounter } from '../../core/ai/advisor';
import { zScore } from '../../core/analysis/playTypes';
import { CLOSE_WIN, crunchTime as coreCrunch, winProb } from '../../core/analysis/winProb';
import { GAME } from '../../core/constants';
import { callCosts, callKey } from '../../core/analysis/callWorth';
import type { Drawn, DrawnPlayer } from './drawn';

export type AlertAction =
  | { kind: 'timeout' }
  /** Take `out` off the floor for `in`. */
  | { kind: 'sub'; out: number; in: number }
  | { kind: 'tactics'; apply: (t: Tactics) => void }
  /** Open the lineup (your five and the bench). */
  | { kind: 'subs' };

export interface LiveAlert {
  id: string;
  /** The headline: what's happening, in a few words. */
  title: string;
  /** One line under it: the number or the why (may be empty). */
  text: string;
  tone: 'warn' | 'bad' | 'info';
  action?: AlertAction & { label: string };
}

/** An event as an alert: "SAS adjusts: hedges ball screens…" reads as a headline and its line. */
export function eventLines(e: Pick<LiveEvent, 'kind' | 'text'>): { title: string; text: string } {
  const i = e.kind === 'adjust' ? e.text.indexOf(': ') : -1;
  return i < 0 ? { title: e.text.replace(/\.$/, ''), text: '' } : { title: e.text.slice(0, i), text: e.text.slice(i + 2).replace(/^./, (c) => c.toUpperCase()) };
}

/** Something that happened in the game, shown once the court has drawn the possession it happened in. */
export interface LiveEvent {
  id: string;
  kind: 'injury' | 'foulout' | 'adjust';
  /** The team it happened to (0 home, 1 away). */
  side: 0 | 1;
  pid?: number;
  text: string;
  /** Game seconds played when it was drawn. */
  at: number;
}

/** Events stay up as alerts for two minutes of game time (or until dismissed). */
const EVENT_SEC = 120;

/**
 * Crunch time, when the staff stops subbing for fouls and fatigue: the last six minutes of the fourth
 * quarter and overtime in a game still in reach, the engine's own rule (core crunchTime).
 */
export const crunchTime = (v: Pick<Drawn, 'q' | 'clock' | 'sides'>) => coreCrunch(v.q, v.clock, v.sides[0].score - v.sides[1].score);

/**
 * A close game, the one meaning every live pause goes by (a fifth foul, a closer out of legs, the last
 * possession): the fourth quarter or overtime, with neither side CLOSE_WIN to win it from the drawn
 * game (the score, the clock, the ball and the projection at tip-off, `edge`). A blowout never stops.
 */
export function closeGame(v: Pick<Drawn, 'q' | 'clock' | 'ball'> & { sides: readonly { score: number }[] }, edge: number): boolean {
  if (v.q < 4) return false;
  const p = winProb({ margin: v.sides[0].score - v.sides[1].score, q: v.q, clock: v.clock, ball: v.ball, edge });
  return p < CLOSE_WIN && p > 1 - CLOSE_WIN;
}

/**
 * The last possession: the fourth quarter or overtime with the game clock under the shot clock (the
 * shot is the period's last), the ball yours, tied or down three or less. Up, there's no call to make:
 * the clock is yours to run out.
 */
export function lastPossession(v: Pick<Drawn, 'q' | 'clock' | 'ball' | 'sides'>, side: 0 | 1): boolean {
  const margin = v.sides[side].score - v.sides[1 - side].score;
  return v.q >= 4 && v.clock <= GAME.shotClock && v.clock > 0.05 && v.ball === side && margin <= 0 && margin >= -3;
}

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
  /** Who the staff would bring in for `pid`, if anyone can come in. */
  subFor: (pid: number) => number | undefined;
  /** The projected home margin at tip-off (LiveGame.edge), for win probability (0 if not given). */
  edge?: number;
  /** Each setting changed in the game, and the trips played since it last was (see recentLevers). */
  recent?: Record<string, number>;
}

/** A side this likely to win (or to lose) has a decided game: the staff makes no calls in it but its own and the bench's. */
export const DECIDED_WIN = 0.97;
/** Trips a setting is left to work after a change before the staff calls to change it again (no Drop → Hedge whiplash). */
export const LEVER_TRIPS = 15;

/** The settings two tactics differ on, as paths: "defense.pnr", "offense.actions.iso", "defense.matchups.12". */
export function tacticsDiff(a: unknown, b: unknown, at = ''): string[] {
  if (a === b) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((k) => tacticsDiff(x[k], y[k], at ? `${at}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [at];
}

/**
 * Each setting the coach changed in the game (on the staff's word or his own), with the trips played
 * since it last changed: the other side's for a defensive setting, yours for the rest. From the game's
 * moves (LiveGame.marks) and the possessions the court has drawn.
 */
export function recentLevers(marks: { op: LiveOp; log: number; before?: Tactics }[], logs: PossLog[], side: 0 | 1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of marks) {
    if (m.op.op !== 'tactics' || !m.before) continue;
    const since = logs.slice(m.log).filter((l) => l.kind !== 'ft');
    for (const k of tacticsDiff(m.before, m.op.args.tactics)) {
      const off = k.startsWith('defense.') ? 1 - side : side;
      out[k] = Math.min(out[k] ?? Infinity, since.filter((l) => l.off === off).length);
    }
  }
  return out;
}

/**
 * Why the staff keeps a call to itself now, if it does: the game is decided (neither side between
 * 3% and 97% to win it: no tactics to chase, no timeout to take), it's the period's last 24 seconds
 * (no change or sub has time to matter; a timeout still can), or the call changes a setting changed
 * fewer than LEVER_TRIPS trips ago (it hasn't had the trips to be judged).
 */
export function callHold(a: AlertInput, act: { kind: string; apply?: (t: Tactics) => void } | undefined): 'decided' | 'late' | 'lever' | null {
  if (!act) return null;
  const v = a.view;
  if (act.kind === 'tactics' || act.kind === 'timeout') {
    const p = winProb({ margin: v.sides[0].score - v.sides[1].score, q: v.q, clock: v.clock, ball: v.ball, edge: a.edge ?? 0 });
    if (p > DECIDED_WIN || p < 1 - DECIDED_WIN) return 'decided';
  }
  if (!a.atBreak && v.clock > 0 && v.clock <= GAME.shotClock && (act.kind === 'tactics' || act.kind === 'sub')) return 'late';
  if (act.kind === 'tactics' && act.apply && a.recent) {
    const x = cloneTactics(a.tactics);
    act.apply(x);
    if (tacticsDiff(a.tactics, x).some((k) => (a.recent![k] ?? Infinity) < LEVER_TRIPS)) return 'lever';
  }
  return null;
}

/** Everything the assistant would say now, most urgent first (the screen shows the first few not dismissed). */
/** Attempts before a side's shooting against its looks is read, and how far above them (eFG) reads as a hot night. */
const LUCK_FGA = 20;
const LIVE_LUCK = 0.05;

export function liveAlerts(a: AlertInput): LiveAlert[] {
  const { view, side, tactics, names } = a;
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const themTeam = a.teams[1 - side];
  const meTeam = a.teams[side];
  const out: LiveAlert[] = [];
  const crunch = crunchTime(view);
  // from the fourth quarter on, legs and fouls only while the game is close (the band the game stops
  // in): up 15 in the fourth, a tired starter or a fifth foul isn't worth a word
  const close = view.q < 4 || closeGame(view, a.edge ?? 0);
  const onFloor = me.on.map((pid) => me.players.find((p) => p.pid === pid)).filter((p): p is DrawnPlayer => !!p);
  const sit = (p: DrawnPlayer, label: string): LiveAlert['action'] => {
    const sub = a.subFor(p.pid);
    return sub === undefined ? undefined : { kind: 'sub', out: p.pid, in: sub, label: `${label} ${names(p.pid)}` };
  };

  // your players lost for the game (the staff has already sent someone in, unless you handle subs)
  for (const e of a.events) {
    if (e.side !== side || e.kind === 'adjust' || view.elapsed - e.at > EVENT_SEC) continue;
    out.push({ id: e.id, tone: 'bad', ...eventLines(e), action: a.manualSubs ? { kind: 'subs', label: 'Subs' } : undefined });
  }

  // one foul from fouling out late, when you make the subs: worth a decision in a close game, crunch
  // time or not. The staff makes this call itself (it sits him at five before crunch time and plays
  // him through it in crunch time), and sitting him in a close fourth quarter cost about 1.3 points of
  // win chance where it measured it (callWorth.ts): no call when it's the staff's
  for (const p of onFloor) {
    if (a.manualSubs && view.q >= 4 && p.fouls === 5 && close)
      out.push({ id: `fouls-${p.pid}-5`, tone: 'warn', title: `${names(p.pid)} has 5 fouls`, text: "One more and he's out.", action: sit(p, 'Sit') });
  }

  // a run the staff won't stop for you (it calls its own timeouts unless you handle subs)
  if (them.run >= 8 && me.timeouts > 0 && !a.atBreak && !a.timeoutPending && !staffCallsTimeout(view, side, tactics.manage, a.manualSubs))
    out.push({
      // (one alert a run, however long it gets: a dismissal holds until the run ends)
      id: `run-${them.score - them.run}`,
      tone: 'warn',
      title: `${themTeam.abbrev} on ${aRun(them.run)}`,
      text: 'A timeout rests legs and can stop the run, but gives their coach a chance to adjust.',
      action: { kind: 'timeout', label: 'Timeout' },
    });

  // tired legs, when you make the subs: the staff subs them out itself, and plays through them in
  // crunch time (a gassed closer subbed out there cost about 0.1 a game where it measured it: no call)
  if (a.manualSubs && close)
    for (const p of onFloor) {
      if (p.out !== 0 || p.energy >= tactics.manage.fatigueSub) continue;
      const sub = a.subFor(p.pid);
      out.push({
        id: `tired-${p.pid}-${Math.round(p.energy * 10)}`,
        tone: 'warn',
        title: `${names(p.pid)} is gassed`,
        text: `${Math.round(p.energy * 100)}% energy.`,
        action: sub === undefined ? undefined : { kind: 'sub', out: p.pid, in: sub, label: `${names(sub)} for ${names(p.pid)}` },
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
        title: `${names(p.pid)} has ${p.fouls} fouls`,
        text: `Your staff sits players at ${limit} in ${view.q <= 4 ? `Q${view.q}` : 'overtime'}.`,
        action: sit(p, 'Sit'),
      });
    }
  }

  // the other coach changed something
  for (const e of a.events) {
    if (e.side === side || e.kind !== 'adjust' || view.elapsed - e.at > EVENT_SEC) continue;
    out.push({ id: e.id, tone: 'info', ...eventLines(e) });
  }

  // opponent play types torching us: well above this season's norm for that play, on a real sample
  // ("Other" is presses, the clock and late fouls: nothing to adjust against). Not while their shots
  // fall well above what their looks are worth: that heat is the night's luck, as the report will
  // call it, and a change made for it answers nothing
  const theirBox = side === 0 ? view.box.away : view.box.home;
  const theirLooks = view.box.xShots?.[1 - side];
  const theirLuck = !!theirLooks && theirBox.t.fga >= LUCK_FGA ? (theirBox.t.fgm + 0.5 * theirBox.t.tpm) / theirBox.t.fga - theirLooks.pts / 2 / theirBox.t.fga > LIVE_LUCK : false;
  for (const [k, v] of Object.entries(them.pt)) {
    const base = a.baselines[k];
    if (theirLuck || k === 'misc' || base === undefined || v.poss < 12 || zScore(v, base) <= 2) continue;
    const ft = k as FinishType;
    // only a button that changes something: none once the tactics already do it
    const counter = liveCounter(ft, tactics);
    const text = `${(v.pts / v.poss).toFixed(2)} points a trip (league ${base.toFixed(2)}).${counter?.note ? ` ${counter.note}` : ''}`;
    out.push({
      id: `pt-${k}`,
      tone: 'warn',
      title: `Their ${playType(ft)} plays are hot`,
      text,
      action: counter && { kind: 'tactics', apply: counter.apply, label: counter.label },
    });
  }

  // the biggest tactical edge against us so far, while the tactics still give it to them and the
  // setting behind it hasn't won back what it cost (as the report judges it)
  const worst = view.impacts
    .filter((im) => im.t !== side && im.pts >= 2.5 && impactAdvice(im.key, tactics) && !leverPaid(view.impacts, im.key, side))
    .sort((x, y) => y.pts - x.pts)[0];
  if (worst) {
    const fix = impactCounter(worst.key, tactics);
    out.push({
      id: `imp-${worst.key}`,
      tone: 'warn',
      title: impactSentence(worst.key, teamRef(themTeam), teamRef(meTeam)).replace(/\.$/, ''),
      text: impactAdvice(worst.key, tactics)!,
      action: fix && { kind: 'tactics', apply: fix.apply, label: fix.label },
    });
  }

  for (const [k, v] of Object.entries(me.pt)) {
    const base = a.baselines[k];
    if (k !== 'misc' && base !== undefined && v.poss >= 12 && zScore(v, base) < -2)
      out.push({
        id: `mypt-${k}`,
        tone: 'info',
        title: `Our ${playType(k as FinishType)} plays are stalling`,
        text: `${(v.pts / v.poss).toFixed(2)} points a trip (league ${base.toFixed(2)}): try other actions.`,
      });
  }
  // nothing the staff would hold back (a decided game, the last seconds, a setting just changed), and
  // no counter that measured as a cost where it fires (callWorth.ts: the switches to Hedge off Drop,
  // staying home on spot-ups): there's nothing to change for that edge
  return out.filter((x) => !callHold(a, x.action) && !(x.action?.kind === 'tactics' && callCosts(callKey(x.id, x.action.label))));
}

/**
 * What happened in the possessions between two snapshots: injuries and foul-outs on either side,
 * and the coaches' adjustments (the engine's lists, read up to `next`'s counts).
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
      if (p.out !== 1) continue;
      const before = prev?.sides[i].players.find((x) => x.pid === p.pid);
      if (prev && before?.out === 1) continue;
      out.push({ id: `fo-${p.pid}`, kind: 'foulout', side: i as 0 | 1, pid: p.pid, text: `${names(p.pid)} has fouled out.`, at: next.elapsed });
    }
  });
  adjustments
    .slice(prev?.adjustments ?? 0, next.adjustments)
    .forEach((adj, k) =>
      out.push({ id: `adj-${(prev?.adjustments ?? 0) + k}`, kind: 'adjust', side: adj.t, text: `${teams[adj.t].abbrev} adjusts: ${adj.text}.`, at: next.elapsed }),
    );
  return out;
}
