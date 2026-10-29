// The coach's moves in a live game, and what each did: every tactics change, substitution, timeout
// and play call the user made (or let the staff make), in the Tactics screen's words, with the scoring
// while it was in effect next to the stretch before it (at least MOVE_BASE_TRIPS of it). A change of
// tactics is measured until the next change; a substitution while the players it brought in were on
// the floor; a timeout over the trips either side of it; a play called on the trip it ran on (and,
// once the game is over, whether it won the game late or tied it for overtime).
// Read by the live game's bench as the night goes, and kept with the result for the post-game
// report. Pure: it reads the possession logs the game already keeps.

import type { CoachMove, LiveOp, MoveTally, Tactics, TacticsPatch } from '../types';
import type { FinishType, PossLog } from '../sim/log';
import { tacticsChanges } from '../sim/playbooks';
import { SCHEME_META, applyPatch } from '../sim/tactics';
import { callLabel } from '../sim/sets';
import { GAME } from '../constants';

/** A move as the live game made it (see LiveMark in state/live.ts). */
export interface MoveMark {
  op: LiveOp;
  /** Possession logs the game had when the move was made. */
  log: number;
  q: number;
  clock: number;
  /** A tactics change: the tactics it replaced. */
  before?: Tactics;
}

/** Trips either side of a timeout that measure it. */
const TIMEOUT_TRIPS = 8;
/**
 * Trips on what a move is aimed at (a play type, one of theirs) since it before its rate is the one
 * quoted, rather than that end of the floor's.
 */
export const MOVE_MIN_TRIPS = 15;
/** ...and for a move whose stretch is over (see CoachMove.closed): it will never have more. */
export const MOVE_CLOSED_TRIPS = 4;
/** Trips before the move for a rate to be its baseline, on what it's aimed at or that end of the floor (a rate over two or three trips is noise, not one: "0.00 before"). */
export const MOVE_MIN_BEFORE = 8;
/**
 * Trips (each way) the stretch before a move reaches back at least, past the last move of its kind
 * when that came only a few trips earlier: two changes a few trips apart otherwise left the second
 * a baseline of a few trips for the rest of the night.
 */
export const MOVE_BASE_TRIPS = 20;
/** Trips each side the stretch before a timeout needs for its margin a trip to be quoted. */
const MARGIN_MIN_BEFORE = 4;

/** What a move is aimed at: the end of the floor, and on it the play types or the one player it's about. */
export interface Aim {
  end: CoachMove['end'];
  /** Finishing play types it's aimed at (theirs for a move on defense, ours on offense). */
  types?: FinishType[];
  /** One of theirs it's aimed at: his own points and the trips he finished. */
  pid?: number;
}

/** Points and trips for each side over logs [from, to), and for what the move is aimed at. */
function tally(logs: PossLog[], side: 0 | 1, from: number, to: number, aim?: Aim): MoveTally {
  const t: MoveTally = { us: { poss: 0, pts: 0 }, them: { poss: 0, pts: 0 } };
  const focused = !!aim && (!!aim.types || aim.pid !== undefined);
  if (focused) t.focus = { poss: 0, pts: 0 };
  // the play types are their trips' for a move on defense, ours on offense
  const typeSide = aim?.end === 'off' ? side : 1 - side;
  for (const l of logs.slice(Math.max(0, from), Math.max(0, to))) {
    const mine = l.off === side;
    const e = mine ? t.us : t.them;
    e.poss++;
    e.pts += l.pts;
    if (!t.focus || !aim) continue;
    if (aim.types && l.off === typeSide && l.finish && aim.types.includes(l.finish)) {
      t.focus.poss++;
      t.focus.pts += l.pts;
    }
    if (aim.pid !== undefined && !mine) {
      const his = l.steps.filter((s) => s.pid === aim.pid && ((s.k === 'shot' && s.made) || s.k === 'ft')).reduce((a, s) => a + (s.v ?? 0), 0);
      if (l.steps.some((s) => s.pid === aim.pid && (s.k === 'shot' || s.k === 'ft' || s.k === 'to'))) t.focus.poss++;
      t.focus.pts += his;
    }
  }
  return t;
}

const ACTION_TYPES: Record<string, FinishType[]> = { pnr: ['pnrBH', 'pnrRoll'], iso: ['iso'], post: ['post'], handoff: ['handoff', 'offscreen'], motion: ['cut', 'spotup'] };

/** The play a move's focus types make up, in a few words. */
function aimLabel(types: FinishType[]): string {
  if (types.includes('pnrBH')) return 'pick-and-roll';
  if (types.includes('transition')) return 'transition';
  if (types.includes('iso')) return 'isolation';
  if (types.includes('post')) return 'post-up';
  if (types.includes('handoff')) return 'handoff';
  return 'motion';
}

/** The end of the floor a tactics change is about, and what on it. */
function aimOf(a: Tactics, b: Tactics): Aim {
  const def = JSON.stringify(a.defense) !== JSON.stringify(b.defense);
  const off = JSON.stringify(a.offense) !== JSON.stringify(b.offense);
  const end: CoachMove['end'] = def && off ? 'both' : def ? 'def' : off ? 'off' : 'both';
  if (end === 'def') {
    const d0 = a.defense;
    const d1 = b.defense;
    if (d0.pnr !== d1.pnr && d0.scheme === d1.scheme) return { end, types: ['pnrBH', 'pnrRoll'] };
    if (d0.getBack !== d1.getBack && d0.pnr === d1.pnr && d0.scheme === d1.scheme) return { end, types: ['transition'] };
    // aimed at one of theirs: a star plan or a matchup on him
    if (d1.starPlan !== 'none' && d1.starTarget != null && (d0.starPlan !== d1.starPlan || d0.starTarget !== d1.starTarget)) return { end, pid: d1.starTarget };
    const changed = (x: Record<number, unknown> = {}, y: Record<number, unknown> = {}) =>
      [...new Set([...Object.keys(x), ...Object.keys(y)])].map(Number).find((p) => x[p] !== y[p]);
    const pid = changed(d0.matchups, d1.matchups);
    return pid !== undefined ? { end, pid } : { end };
  }
  if (end === 'off') {
    const acts = (Object.keys(b.offense.actions) as (keyof Tactics['offense']['actions'])[]).filter((k) => a.offense.actions[k] !== b.offense.actions[k]);
    if (acts.length === 1) return { end, types: ACTION_TYPES[acts[0]] };
    if (!acts.length && (a.offense.transition !== b.offense.transition || a.offense.pace !== b.offense.pace)) return { end, types: ['transition'] };
  }
  return { end };
}

/** What a game plan's counter is aimed at, as a move making the same change would be (the report grades the plan with it). */
export function planAim(base: Tactics, patch: TacticsPatch): Aim {
  return aimOf(base, applyPatch(base, patch));
}

/** A tactics change in a few words, as the Tactics screen names it, game-specific orders included ("Dort guards Fox"). */
export function moveText(a: Tactics, b: Tactics, nameOf: (pid: number) => string): string {
  const parts = tacticsChanges(a, b, nameOf).map((c) => (c.from || c.to ? `${c.label}: ${c.from} → ${c.to}` : `${c.label} changed`));
  const d0 = a.defense;
  const d1 = b.defense;
  for (const p of new Set([...Object.keys(d0.matchups), ...Object.keys(d1.matchups)].map(Number)))
    if (d0.matchups[p] !== d1.matchups[p]) parts.push(d1.matchups[p] != null ? `${nameOf(d1.matchups[p])} guards ${nameOf(p)}` : `${nameOf(p)}'s matchup back to the staff`);
  if (d0.starTarget !== d1.starTarget && d1.starPlan !== 'none') parts.push(`Star plan on ${d1.starTarget != null ? nameOf(d1.starTarget) : 'their top creator'}`);
  if (JSON.stringify(d0.chase ?? []) !== JSON.stringify(d1.chase ?? []) && d1.chase?.length)
    parts.push(`${SCHEME_META[d1.scheme].label} chasing ${d1.chase.map(nameOf).join(' and ')}`);
  if ((a.offense.huntTarget ?? null) !== (b.offense.huntTarget ?? null))
    parts.push(b.offense.huntTarget != null ? `Attack ${nameOf(b.offense.huntTarget)}` : `Stop attacking ${a.offense.huntTarget != null ? nameOf(a.offense.huntTarget) : 'him'}`);
  return parts.join(' · ') || 'Tactics adjusted';
}

/**
 * Moves of one kind made within this many possession logs of each other (a few at a break, or two
 * changes a trip apart) are one move: no trip was played between them, so nothing could tell what
 * each did on its own, and measured one by one, each had an empty stretch after it (or before it).
 */
const BATCH_LOGS = 4;

/**
 * The night's moves, oldest first: `marks` are the game's, in the order made; `side` is the user's (0
 * home, 1 away). Changes of tactics made together are one move, and so are substitutions (see
 * BATCH_LOGS). `over`: the game has ended, so a move whose stretch ran to the final buzzer is over too
 * (see CoachMove.closed).
 */
export function coachMoves(marks: MoveMark[], logs: PossLog[], side: 0 | 1, nameOf: (pid: number) => string, over = false): CoachMove[] {
  // the moves as batches of one kind: [first, last] of each
  const batches: [MoveMark, MoveMark][] = [];
  for (const m of marks) {
    if (m.op.op === 'tactics' && !m.before) continue;
    const open = m.op.op === 'timeout' || m.op.op === 'play' ? undefined : [...batches].reverse().find((b) => b[1].op.op === m.op.op);
    if (open && m.log - open[1].log <= BATCH_LOGS) open[1] = m;
    else batches.push([m, m]);
  }
  const out: CoachMove[] = [];
  // each batch is measured from its last move to the next batch of its kind, against the stretch from the one before
  const nextOf = (i: number, kind: LiveOp['op']) => batches.slice(i + 1).find((b) => b[0].op.op === kind)?.[0].log ?? logs.length;
  // (from the last move of its kind, or MOVE_BASE_TRIPS back when that was only a few trips ago: two logs a trip each way)
  const prevOf = (i: number, kind: LiveOp['op'], at: number) =>
    Math.min(
      batches
        .slice(0, i)
        .reverse()
        .find((b) => b[1].op.op === kind)?.[1].log ?? 0,
      Math.max(0, at - 2 * MOVE_BASE_TRIPS),
    );
  /** Its stretch is over (the next move of its kind came, or the final buzzer) short of the trips a move in effect waits for. */
  const closed = (to: number, t: MoveTally) => (to < logs.length || over) && Math.min(t.us.poss, t.them.poss) < MOVE_MIN_TRIPS;
  batches.forEach(([m, last], i) => {
    const at = { q: m.q, clock: Math.round(m.clock) };
    const all = marks.slice(marks.indexOf(m), marks.indexOf(last) + 1).filter((x) => x.op.op === m.op.op && (x.op.op !== 'tactics' || x.before));
    if (m.op.op === 'tactics' && last.op.op === 'tactics' && m.before) {
      const after = last.op.args.tactics;
      const aim = aimOf(m.before, after);
      const end = nextOf(i, 'tactics');
      const tAfter = tally(logs, side, last.log, end, aim);
      out.push({
        kind: 'tactics',
        ...at,
        text: moveText(m.before, after, nameOf),
        end: aim.end,
        // (the staff's only when it made every change in it)
        ...(all.every((x) => x.op.op === 'tactics' && x.op.args.staff) ? { by: 'staff' as const } : {}),
        ...(aim.pid !== undefined ? { pid: aim.pid } : {}),
        ...(aim.types ? { aim: aimLabel(aim.types) } : {}),
        before: tally(logs, side, prevOf(i, 'tactics', m.log), m.log, aim),
        after: tAfter,
        ...(closed(end, tAfter) ? { closed: true as const } : {}),
      });
    } else if (m.op.op === 'sub') {
      // the stretch the players it brought in were on the floor: from the trip the first of them
      // checked in (a sub waits for a dead ball) until the last of them went off, or the next of the
      // user's substitutions (the staff's later changes ended the margin's link to his)
      const ins = all.flatMap((x) => (x.op.op === 'sub' ? [x.op.args.in] : []));
      const next = nextOf(i, 'sub');
      // (logs without the five on the floor, a game from before they were kept: the stretch to the next substitution)
      const known = logs.slice(last.log, next).some((l) => l.on?.[side]?.length);
      const playing = (k: number) => !known || ins.some((pid) => logs[k]?.on?.[side]?.includes(pid));
      let from = last.log;
      while (from < next && !playing(from)) from++;
      let end = from;
      while (end < next && playing(end)) end++;
      const tAfter = tally(logs, side, from, end);
      out.push({
        kind: 'sub',
        ...at,
        text: all.map((x) => (x.op.op === 'sub' ? `${nameOf(x.op.args.in)} in for ${nameOf(x.op.args.out)}` : '')).join(' · '),
        end: 'both',
        before: tally(logs, side, prevOf(i, 'sub', m.log), m.log),
        after: tAfter,
        ...(closed(end, tAfter) ? { closed: true as const } : {}),
      });
    } else if (m.op.op === 'play') {
      // the trip it ran on: the next of ours this period that ran it (none when the period ran out first)
      const id = m.op.args.set;
      const j = logs.findIndex((l, k) => k >= m.log && l.off === side && l.q === m.q && (id === 'iso' ? l.iso !== undefined : l.set?.id === id));
      const ran = j >= 0 ? logs[j] : undefined;
      const pid = (id === 'iso' ? ran?.iso : ran?.set?.pid) ?? m.op.args.pid;
      // (whether it won the game or tied it late is known once the game is over)
      const late = ran && over ? lateBasket(logs, j, side) : undefined;
      out.push({
        kind: 'play',
        ...at,
        text: callLabel(id, pid !== undefined ? nameOf(pid) : undefined),
        call: { id, ...(pid !== undefined && { pid }), ...(late && { late }) },
        end: 'off',
        before: tally(logs, side, 0, 0),
        after: j >= 0 ? tally(logs, side, j, j + 1) : tally(logs, side, 0, 0),
      });
    } else if (m.op.op === 'timeout') {
      out.push({
        kind: 'timeout',
        ...at,
        text: 'Timeout',
        end: 'both',
        before: tally(logs, side, m.log - 2 * TIMEOUT_TRIPS, m.log),
        after: tally(logs, side, m.log, m.log + 2 * TIMEOUT_TRIPS),
      });
    }
  });
  return out;
}

/**
 * A called play's trip late in the fourth quarter or an overtime (its basket in the period's last
 * shot clock) that won the game, from level or behind into a lead never given up, or tied it there for
 * overtime (the period's last score): how, and the clock its basket came at. Read once the game is over.
 */
function lateBasket(logs: PossLog[], j: number, side: 0 | 1): { how: 'won' | 'tied'; clock: number } | undefined {
  const l = logs[j];
  if (l.q < 4 || l.clockEnd > GAME.shotClock || l.pts <= 0) return undefined;
  const margin = (x: PossLog) => x.score[side] - x.score[1 - side];
  const to = margin(l);
  const from = to - l.pts;
  const rest = logs.slice(j + 1);
  if (from <= 0 && to > 0 && rest.every((x) => margin(x) > 0)) return { how: 'won', clock: l.clockEnd };
  if (from < 0 && to === 0 && rest.every((x) => x.q !== l.q || margin(x) === 0)) return { how: 'tied', clock: l.clockEnd };
  return undefined;
}

/** Points per trip, or null with no trips. */
export const ppp = (x: { poss: number; pts: number } | undefined) => (x && x.poss ? x.pts / x.poss : null);

/**
 * What a move has done since, as evidence with no verdict: the number it's read by (what it's aimed at
 * when that has a few trips, else their points a trip for a move on defense, ours on offense, the
 * margin per trip for the rest), since it and in the stretch before. Whether it worked is the
 * replayed night's to say (GameResult.movesWorth: the rest of the game played with it and without):
 * a rate after a move set off by a hot stretch reads better afterwards whether or not the move did
 * anything (regression to the mean), so a before-and-after verdict would flatter every move.
 */
export function moveRate(m: CoachMove): { now: number | null; was: number | null; trips: number; what: 'them' | 'us' | 'focus' | 'margin' } {
  const need = m.closed ? MOVE_CLOSED_TRIPS : MOVE_MIN_TRIPS;
  const aimed = !!m.after.focus && m.after.focus.poss >= need && (m.before.focus?.poss ?? 0) >= MOVE_MIN_BEFORE;
  const what = aimed ? 'focus' : m.end === 'def' ? 'them' : m.end === 'off' ? 'us' : 'margin';
  if (what === 'margin') {
    const per = (t: MoveTally) => (t.us.poss + t.them.poss ? (t.us.pts - t.them.pts) / ((t.us.poss + t.them.poss) / 2) : null);
    // (a margin a trip over a trip or two before isn't a rate: a timeout a minute in has none to compare)
    const was = Math.min(m.before.us.poss, m.before.them.poss) >= MARGIN_MIN_BEFORE ? per(m.before) : null;
    return { now: per(m.after), was, trips: Math.min(m.after.us.poss, m.after.them.poss), what };
  }
  const pick = (t: MoveTally) => (what === 'focus' ? t.focus : what === 'them' ? t.them : t.us);
  // (a move on the first few trips of the game has no stretch before it to speak of)
  const before = pick(m.before);
  return { now: ppp(pick(m.after)), was: (before?.poss ?? 0) >= MOVE_MIN_BEFORE ? ppp(before) : null, trips: pick(m.after)?.poss ?? 0, what };
}
