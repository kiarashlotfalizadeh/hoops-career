// The bench: what the lead assistant sees in the game as the court has drawn it, and what he'd do
// about it. Each note is a headline, the evidence (a number from tonight, against the league's or
// the stretch before), and the moves on offer, the staff's pick first. Decisions want a call from
// you; reads say what's working or not with nothing to change. Built on the live alerts (tired legs,
// foul trouble, runs, their coach's adjustments, their play types running hot, the tactical edges
// against you) plus who's scoring on whom from the possession logs: the defender of theirs you're
// beating, your own actions stalling or working. No call on a scorer's hot streak: the engine has no
// shooting hot hand, so a double for one answers noise and costs points. Every call was measured where
// it fires (callWorth.ts): the ones that cost aren't made, and the rest say what they've been worth
// (or that they're the staff's read, with no number yet). Pure.

import type { Tactics } from '../../core/types';
import { FINISH_LABEL, type FinishType, type PossLog } from '../../core/sim/log';
import { zScore } from '../../core/analysis/playTypes';
import { madeAtt } from '../../core/format';
import { callHold, liveAlerts, type AlertInput, type LiveAlert } from './alerts';
import { callCosts, callKey, worthLine } from '../../core/analysis/callWorth';

export type StaffAction = { label: string } & (
  | { kind: 'tactics'; apply: (t: Tactics) => void }
  | { kind: 'sub'; out: number; in: number }
  | { kind: 'timeout' }
  /** Open the lineup (your five and the bench). */
  | { kind: 'lineup' }
);

export interface StaffNote {
  id: string;
  /** A decision wants a call from you; a read says what's working or not, with nothing to change. */
  kind: 'decision' | 'read';
  tone: 'good' | 'bad' | 'warn' | 'info';
  title: string;
  /** The evidence, one line. */
  text: string;
  /** The figure it leads with: "1.31" a trip, "+4.2" points, "14" points. */
  fig?: { v: string; unit: string };
  /** The moves on offer, the staff's pick first. */
  actions: StaffAction[];
  /** Higher first. */
  rank: number;
  /** With the bench handed to the staff, it makes its pick itself (a tactics change; subs and timeouts stay yours). */
  auto?: boolean;
  /** A decision's measured worth where it fires, in a line (worthLine), or that it's the staff's read. */
  worth?: string;
}

/** What the staff reads besides the alerts' input: the possessions the court has drawn. */
export interface StaffInput extends AlertInput {
  logs: PossLog[];
}

/** One matchup over the game so far: their trips finished by `off` against `def` (or ours, against theirs). */
export interface MatchupRow {
  off: number;
  def: number;
  trips: number;
  pts: number;
}

/** Who finished a possession: the last shooter, free-throw shooter or ball-handler who turned it over. */
export function finisher(l: PossLog): number | undefined {
  for (let i = l.steps.length - 1; i >= 0; i--) {
    const s = l.steps[i];
    if ((s.k === 'shot' || s.k === 'ft' || s.k === 'to') && s.pid !== undefined) return s.pid;
  }
  return undefined;
}

/** Trips and points by each pairing of finisher and his defender, for one side's offense. */
export function matchups(logs: PossLog[], offSide: 0 | 1): MatchupRow[] {
  const by = new Map<string, MatchupRow>();
  for (const l of logs) {
    if (l.off !== offSide || l.kind === 'ft') continue;
    const off = finisher(l);
    const def = off !== undefined ? l.guards[off] : undefined;
    if (off === undefined || def === undefined) continue;
    const k = `${off}:${def}`;
    const e = by.get(k) ?? { off, def, trips: 0, pts: 0 };
    e.trips++;
    e.pts += l.pts;
    by.set(k, e);
  }
  return [...by.values()];
}

/** Rows summed by one key ('off' for each scorer, 'def' for each defender). */
export function sumBy(rows: MatchupRow[], key: 'off' | 'def'): Map<number, { trips: number; pts: number }> {
  const out = new Map<number, { trips: number; pts: number }>();
  for (const r of rows) {
    const e = out.get(r[key]) ?? { trips: 0, pts: 0 };
    e.trips += r.trips;
    e.pts += r.pts;
    out.set(r[key], e);
  }
  return out;
}

/** A play type mid-sentence: "their isolation plays". */
const playType = (ft: string) => (FINISH_LABEL[ft as FinishType] ?? ft).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const f2 = (x: number) => x.toFixed(2);

/** The action an offensive play type comes out of, and the settings that lean into it or away. */
const OFF_ACTION: Partial<Record<FinishType, 'pnr' | 'iso' | 'post' | 'handoff' | 'motion'>> = {
  pnrBH: 'pnr',
  pnrRoll: 'pnr',
  iso: 'iso',
  post: 'post',
  handoff: 'handoff',
  offscreen: 'handoff',
  cut: 'motion',
};
const ACTION_NAME: Record<'pnr' | 'iso' | 'post' | 'handoff' | 'motion', string> = {
  pnr: 'pick-and-roll',
  iso: 'isolations',
  post: 'post-ups',
  handoff: 'handoffs',
  motion: 'motion and cuts',
};

/** An alert as a note: its headline, line and action, ranked by what it's about. */
function fromAlert(a: LiveAlert): StaffNote {
  const rank = a.id.startsWith('run-')
    ? 90
    : a.id.startsWith('fouls-')
      ? a.id.endsWith('-5')
        ? 86
        : 80
      : a.id.startsWith('tired-')
        ? 78
        : a.id.startsWith('inj-') || a.id.startsWith('fo-')
          ? 95
          : a.id.startsWith('adj-')
            ? 70
            : a.id.startsWith('imp-')
              ? 77
              : a.id.startsWith('pt-')
                ? 75
                : 50;
  const actions: StaffAction[] = [];
  const act = a.action;
  if (act?.kind === 'tactics') actions.push({ kind: 'tactics', label: act.label, apply: act.apply });
  else if (act?.kind === 'sub') actions.push({ kind: 'sub', label: act.label, out: act.out, in: act.in });
  else if (act?.kind === 'timeout') actions.push({ kind: 'timeout', label: act.label });
  else if (act?.kind === 'subs') actions.push({ kind: 'lineup', label: act.label });
  return {
    id: a.id,
    kind: actions.length ? 'decision' : 'read',
    tone: a.tone === 'info' ? 'info' : a.tone === 'bad' ? 'bad' : 'warn',
    title: a.title,
    text: a.text,
    actions,
    rank,
    // (a sub or a timeout stays your call: the staff already subs for fatigue and fouls unless you make the subs)
    auto: act?.kind === 'tactics',
  };
}

/**
 * A game out of reach in the fourth quarter (or overtime): the margin the engine's staff empties its
 * bench at (22 with five minutes left, 16 with two and a half), or 30 at any point of the quarter.
 */
export function gameDecided(q: number, clock: number, margin: number): boolean {
  const m = Math.abs(margin);
  return q >= 4 && clock > 5 && (m >= 30 || (clock < 300 && m >= 22) || (clock < 150 && m >= 16));
}

/**
 * Everything the staff has to say now, most pressing first: the alerts (with their fixes), the
 * defender of theirs you're beating, your own actions stalling or working, and the late-game switches
 * that are off when they matter.
 */
export function staffNotes(a: StaffInput): StaffNote[] {
  const { view, side, tactics: t, names } = a;
  const me = view.sides[side];
  const them = view.sides[1 - side];
  const out: StaffNote[] = liveAlerts(a)
    // (the stalling-actions read is the staff's own below, with something to do about it)
    .filter((x) => !x.id.startsWith('mypt-'))
    .map(fromAlert);
  const ourRows = matchups(a.logs, side);

  // the defender of theirs you're beating: attack him (while he's on the floor)
  if (t.offense.huntTarget == null) {
    const weak = [...sumBy(ourRows, 'def')]
      .filter(([pid, v]) => them.on.includes(pid) && v.trips >= 8 && v.pts >= 10 && v.pts / v.trips >= 1.3)
      .sort((x, y) => y[1].pts / y[1].trips - x[1].pts / x[1].trips)[0];
    if (weak) {
      const [pid, v] = weak;
      out.push({
        id: `hunt-${pid}`,
        kind: 'decision',
        tone: 'good',
        title: `We're beating ${names(pid)}`,
        text: `${v.pts} points on ${v.trips} trips he defended (${f2(v.pts / v.trips)} a trip). Run your isolations, post-ups and ball screens at him while he's on.`,
        fig: { v: f2(v.pts / v.trips), unit: 'a trip' },
        actions: [{ kind: 'tactics', label: `Attack ${names(pid)}`, apply: (x) => void (x.offense.huntTarget = pid) }],
        rank: 64,
        auto: true,
      });
    }
  }

  // your own actions: stalling (lean away from them) or working (lean into them)
  for (const [k, v] of Object.entries(me.pt)) {
    const base = a.baselines[k];
    const act = OFF_ACTION[k as FinishType];
    if (base === undefined || v.poss < 10 || !act) continue;
    const z = zScore(v, base);
    const now = t.offense.actions[act];
    if (z < -1.8 && now > 30) {
      // the other half-court actions the offense can lean on instead (motion and cuts, unless that's the one stalling)
      const alt = act === 'motion' ? 'handoff' : 'motion';
      out.push({
        id: `cold-${k}`,
        kind: 'decision',
        tone: 'warn',
        title: `Our ${playType(k)} plays are stalling`,
        text: `${f2(v.pts / v.poss)} points a trip on ${v.poss} (league ${f2(base)}).`,
        fig: { v: f2(v.pts / v.poss), unit: 'a trip' },
        actions: [
          {
            kind: 'tactics',
            label: `Less ${ACTION_NAME[act]}, more ${ACTION_NAME[alt]}`,
            apply: (x) => void ((x.offense.actions[act] = Math.max(0, x.offense.actions[act] - 25)), (x.offense.actions[alt] = Math.min(100, x.offense.actions[alt] + 25))),
          },
        ],
        rank: 58,
        auto: true,
      });
    } else if (z > 1.8 && now < 75) {
      out.push({
        id: `work-${k}`,
        kind: 'decision',
        tone: 'good',
        title: `Our ${playType(k)} plays are working`,
        text: `${f2(v.pts / v.poss)} points a trip on ${v.poss} (league ${f2(base)}).`,
        fig: { v: f2(v.pts / v.poss), unit: 'a trip' },
        actions: [{ kind: 'tactics', label: `More ${ACTION_NAME[act]}`, apply: (x) => void (x.offense.actions[act] = Math.min(100, x.offense.actions[act] + 25)) }],
        rank: 45,
      });
    }
  }

  // their play types well under the league's: whatever you're doing there, it's working
  const held = Object.entries(them.pt)
    .filter(([k, v]) => k !== 'misc' && a.baselines[k] !== undefined && v.poss >= 10 && zScore(v, a.baselines[k]) < -1.8)
    .sort((x, y) => zScore(x[1], a.baselines[x[0]]) - zScore(y[1], a.baselines[y[0]]))[0];
  if (held)
    out.push({
      id: `held-${held[0]}`,
      kind: 'read',
      tone: 'good',
      title: `Their ${playType(held[0])} plays aren't working`,
      text: `${f2(held[1].pts / held[1].poss)} points a trip on ${held[1].poss} (league ${f2(a.baselines[held[0]])}).`,
      fig: { v: f2(held[1].pts / held[1].poss), unit: 'a trip' },
      actions: [],
      rank: 30,
    });

  // the late game: the switches that matter now, when they're off
  const margin = me.score - them.score;
  if (view.q >= 4 && view.clock <= 120 && view.clock > 5 && !a.atBreak) {
    if (margin < 0 && margin >= -9 && !t.manage.foulWhenTrailing)
      out.push({
        id: `late-foul-${view.q}`,
        kind: 'decision',
        tone: 'warn',
        title: `Down ${-margin} with ${view.clock >= 60 ? `${Math.floor(view.clock / 60)}:${String(Math.floor(view.clock % 60)).padStart(2, '0')}` : `${Math.ceil(view.clock)} seconds`} left`,
        text: 'Foul when trailing is off: they can run the clock out.',
        actions: [{ kind: 'tactics', label: 'Foul when trailing', apply: (x) => void (x.manage.foulWhenTrailing = true) }],
        rank: 92,
        auto: true,
      });
    if (margin === 3 && !t.manage.foulUp3)
      out.push({
        id: `late-up3-${view.q}`,
        kind: 'decision',
        tone: 'warn',
        title: 'Up 3 late',
        text: 'Foul when up 3 is off: they get a look at a tying three.',
        actions: [{ kind: 'tactics', label: 'Foul when up 3', apply: (x) => void (x.manage.foulUp3 = true) }],
        rank: 91,
        auto: true,
      });
  }

  // a decided game: no tactics to chase (their scorer's garbage-time points, an action running hot).
  // No call to rest the starters either when the coach switched that off: it cost 2.3 points of margin
  // in 396 measured blowouts and never a result (callWorth.ts), and his starters are his call
  const decided = gameDecided(view.q, view.clock, margin);
  // a fix for the same thing only once (the hot play type and the tactical edge often agree)
  const seen = new Set<string>();
  const manual = a.manualSubs;
  return (
    out
      // no call that measured as a cost where it fires (attacking the defender we're beating, leaning on
      // our own play types: callWorth.ts), and each one kept says what it's been worth
      .filter((n) => n.kind !== 'decision' || !callCosts(callKey(n.id, n.actions[0]?.label, manual)))
      .map((n) => (n.kind === 'decision' && n.actions.length && n.actions[0].kind !== 'lineup' ? { ...n, worth: worthLine(callKey(n.id, n.actions[0].label, manual)) } : n))
      .filter((n) => !decided || !n.actions.some((x) => x.kind === 'tactics'))
      // nothing held back (callHold): but fouling late is the last seconds' own call
      .filter((n) => {
        const hold = callHold(a, n.actions[0]);
        return !hold || (hold === 'late' && n.id.startsWith('late-'));
      })
      .sort((x, y) => y.rank - x.rank)
      .filter((n) => {
        const key = n.actions[0]?.label;
        if (!key || n.actions[0].kind !== 'tactics') return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
  );
}

/**
 * The staff's read of the game in a sentence or two: the biggest edge each way in the box score (the
 * glass, the turnovers, the paint, the threes, the free-throw line), or the score itself early on.
 */
export function staffRead(a: Pick<AlertInput, 'view' | 'side' | 'teams'>): string {
  const { view, side } = a;
  const us = side === 0 ? view.box.home : view.box.away;
  const them = side === 0 ? view.box.away : view.box.home;
  const abbrev = a.teams[1 - side].abbrev;
  if (view.elapsed < 240) return 'Early. Watching how they want to play.';
  const edges: { d: number; good: string; bad: string }[] = [];
  const reb = us.t.orb + us.t.drb - (them.t.orb + them.t.drb);
  edges.push({ d: reb / 4, good: `We're winning the glass by ${reb}`, bad: `They're winning the glass by ${-reb}` });
  const tov = them.t.tov - us.t.tov;
  edges.push({ d: tov / 3, good: `${them.t.tov} turnovers from them to our ${us.t.tov}`, bad: `${us.t.tov} turnovers to their ${them.t.tov}` });
  const paint = (us.extra?.paint ?? 0) - (them.extra?.paint ?? 0);
  edges.push({ d: paint / 8, good: `We're +${paint} in the paint`, bad: `They're +${-paint} in the paint` });
  const threes = us.t.tpm - them.t.tpm;
  edges.push({
    d: threes / 2.5,
    good: `${threes} more threes than them (${madeAtt(us.t.tpm, us.t.tpa)})`,
    bad: `${-threes} fewer threes than them (${madeAtt(them.t.tpm, them.t.tpa)} for ${abbrev})`,
  });
  const fta = us.t.fta - them.t.fta;
  edges.push({ d: fta / 6, good: `${fta} more free throws than them`, bad: `${-fta} fewer free throws than them` });
  const good = edges.filter((e) => e.d >= 1).sort((x, y) => y.d - x.d)[0];
  const bad = edges.filter((e) => e.d <= -1).sort((x, y) => x.d - y.d)[0];
  // (the second clause runs on from the first: "…, but they're winning the glass by 6"; a count or a team's abbreviation keeps its case)
  if (good && bad) return `${good.good}, but ${bad.bad.replace(/^(They|We)\b/, (w) => w.toLowerCase())}.`;
  if (good) return `${good.good}.`;
  if (bad) return `${bad.bad}.`;
  return 'Even on the glass, the turnovers and the threes.';
}
