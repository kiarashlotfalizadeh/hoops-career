// The coach's moves in a live game, and what each did: every tactics change, substitution and
// timeout the user made (or let the staff make), in the Tactics screen's words, with the scoring
// while it was in effect next to the stretch before it. A change of tactics is measured until the
// next change; a substitution over the stint it started; a timeout over the trips either side of it.
// Read by the live game's bench as the night goes, and kept with the result for the post-game
// report. Pure: it reads the possession logs the game already keeps.

import type { CoachMove, League, LiveOp, MoveTally, ScheduledGame, Tactics, TacticsPatch } from '../types';
import type { FinishType, PossLog } from '../sim/log';
import { tacticsChanges } from '../sim/playbooks';
import { PLAYER_D_META, SCHEME_META, applyPatch, emptyPatch, tacticsDiff } from '../sim/tactics';
import { SLOT_COUNT, SLOT_LETTERS, activeSlot, slotTactics } from '../sim/slots';
import { effectiveTactics } from '../league/gamePlans';
import { SETS, setLabel } from '../sim/sets';

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
/** Trips at a rate since a move before its effect reads as anything but early. */
export const MOVE_MIN_TRIPS = 15;
/**
 * Trips a move whose stretch is over (see CoachMove.closed: the next move of its kind came, or the
 * game ended) is judged on: it will never have more, and at MOVE_Z a swing that reads over so few is
 * a big one. A move still in effect waits for MOVE_MIN_TRIPS, so its verdict doesn't flip trip to trip.
 */
export const MOVE_CLOSED_TRIPS = 4;
/** Trips at the rate before a move it needs to be judged against (a rate over two or three trips is noise, not a baseline). */
export const MOVE_MIN_BEFORE = 8;
/**
 * Standard errors the rate has to move, the stretch before's noise counted too, to read as working
 * or not: at one, a move that changed nothing read one way or the other about a third of the time.
 */
const MOVE_Z = 2;
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
    // aimed at one of theirs: a star plan, an instruction or a matchup on him
    if (d1.starPlan !== 'none' && d1.starTarget != null && (d0.starPlan !== d1.starPlan || d0.starTarget !== d1.starTarget)) return { end, pid: d1.starTarget };
    const changed = (x: Record<number, unknown> = {}, y: Record<number, unknown> = {}) =>
      [...new Set([...Object.keys(x), ...Object.keys(y)])].map(Number).find((p) => x[p] !== y[p]);
    const pid = changed(d0.playerD, d1.playerD) ?? changed(d0.matchups, d1.matchups);
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
  for (const p of new Set([...Object.keys(d0.playerD ?? {}), ...Object.keys(d1.playerD ?? {})].map(Number))) {
    const x = d0.playerD?.[p];
    const y = d1.playerD?.[p];
    if (x !== y) parts.push(y ? `${PLAYER_D_META[y].short}: ${nameOf(p)}` : `Play ${nameOf(p)} straight`);
  }
  if (JSON.stringify(d0.chase ?? []) !== JSON.stringify(d1.chase ?? []) && d1.chase?.length)
    parts.push(`${SCHEME_META[d1.scheme].label} chasing ${d1.chase.map(nameOf).join(' and ')}`);
  if ((a.offense.huntTarget ?? null) !== (b.offense.huntTarget ?? null))
    parts.push(b.offense.huntTarget != null ? `Attack ${nameOf(b.offense.huntTarget)}` : `Stop attacking ${a.offense.huntTarget != null ? nameOf(a.offense.huntTarget) : 'him'}`);
  return parts.join(' · ') || 'Tactics adjusted';
}

/**
 * Which of a team's tactic slots (Tactic A, B, C) some tactics are, in a game against the other team
 * in `game`: each slot as that game plays it (tonight's game plan on top of it, for the user's team),
 * matched on everything but tonight's opponent-specific orders. The active slot first (a copy in
 * another slot is the same tactics); null when they're none of them (a slot with changes made since).
 */
export function slotMatcher(league: League, game: Pick<ScheduledGame, 'home' | 'away' | 'seriesId'>, tid = league.userTid): (t: Tactics) => number | null {
  const team = league.teams[tid];
  // one tactic and no other: nothing to switch to
  if (!team.slots?.stored.some(Boolean)) return () => null;
  const opp = game.home === tid ? game.away : game.home;
  const active = activeSlot(team);
  const order = [active, ...Array.from({ length: SLOT_COUNT }, (_, i) => i).filter((i) => i !== active)];
  const targets = order.flatMap((i) => {
    const s = slotTactics(team, i);
    return s ? [{ i, t: tid === league.userTid ? effectiveTactics(league, opp, game, s) : s }] : [];
  });
  return (t) => targets.find((x) => emptyPatch(tacticsDiff(x.t, t)))?.i ?? null;
}

/** "Tactic B (Plan B)": a slot as the night's moves name a switch to it. */
export function slotMoveName(league: League, i: number, tid = league.userTid): string {
  const name = league.teams[tid].slots?.names[i];
  return `Tactic ${SLOT_LETTERS[i]}${name ? ` (${name})` : ''}`;
}

/**
 * Moves of one kind made within this many possession logs of each other (a few at a break, or two
 * changes a trip apart) are one move: no trip was played between them, so nothing could tell what
 * each did on its own, and measured one by one, each had an empty stretch after it (or before it).
 */
const BATCH_LOGS = 4;

/**
 * The night's moves, oldest first: `marks` are the game's, in the order made; `side` is the user's (0
 * home, 1 away). `slotName` names the tactic slot some tactics are, if any (see slotMatcher): a change
 * onto one from anything else reads as the switch it was ("Switched to Tactic B (Plan B)"). Changes of
 * tactics made together are one move, and so are substitutions (see BATCH_LOGS). `over`: the game has
 * ended, so a move whose stretch ran to the final buzzer is over too (see CoachMove.closed).
 */
export function coachMoves(marks: MoveMark[], logs: PossLog[], side: 0 | 1, nameOf: (pid: number) => string, slotName?: (t: Tactics) => string | null, over = false): CoachMove[] {
  // the moves as batches of one kind: [first, last] of each
  const batches: [MoveMark, MoveMark][] = [];
  for (const m of marks) {
    if (m.op.op === 'tactics' && !m.before) continue;
    const open = m.op.op === 'timeout' || m.op.op === 'play' ? undefined : [...batches].reverse().find((b) => b[1].op.op === m.op.op);
    if (open && m.log - open[1].log <= BATCH_LOGS) open[1] = m;
    else batches.push([m, m]);
  }
  const out: CoachMove[] = [];
  // the slot the game tipped off with: the tactics the first change replaced
  const first = marks.find((m) => m.op.op === 'tactics' && m.before);
  const tip = first?.before && slotName ? slotName(first.before) : null;
  // each batch is measured from its last move to the next batch of its kind, against the stretch from the one before
  const nextOf = (i: number, kind: LiveOp['op']) => batches.slice(i + 1).find((b) => b[0].op.op === kind)?.[0].log ?? logs.length;
  const prevOf = (i: number, kind: LiveOp['op']) =>
    batches
      .slice(0, i)
      .reverse()
      .find((b) => b[1].op.op === kind)?.[1].log ?? 0;
  /** Its stretch is over (the next move of its kind came, or the final buzzer) short of the trips a move in effect waits for. */
  const closed = (to: number, t: MoveTally) => (to < logs.length || over) && Math.min(t.us.poss, t.them.poss) < MOVE_MIN_TRIPS;
  batches.forEach(([m, last], i) => {
    const at = { q: m.q, clock: Math.round(m.clock) };
    const all = marks.slice(marks.indexOf(m), marks.indexOf(last) + 1).filter((x) => x.op.op === m.op.op && (x.op.op !== 'tactics' || x.before));
    if (m.op.op === 'tactics' && last.op.op === 'tactics' && m.before) {
      const after = last.op.args.tactics;
      const aim = aimOf(m.before, after);
      // (back onto the slot the game tipped off with from changes made on it is "Reset to game plan", not a switch)
      const to = slotName?.(after);
      const from = slotName?.(m.before) ?? null;
      const switched = !!to && to !== from && (from !== null || to !== tip);
      const end = nextOf(i, 'tactics');
      const tAfter = tally(logs, side, last.log, end, aim);
      out.push({
        kind: 'tactics',
        ...at,
        text: switched ? `Switched to ${to}` : moveText(m.before, after, nameOf),
        end: aim.end,
        // (the staff's only when it made every change in it)
        ...(all.every((x) => x.op.op === 'tactics' && x.op.args.staff) ? { by: 'staff' as const } : {}),
        ...(aim.pid !== undefined ? { pid: aim.pid } : {}),
        ...(aim.types ? { aim: aimLabel(aim.types) } : {}),
        before: tally(logs, side, prevOf(i, 'tactics'), m.log, aim),
        after: tAfter,
        ...(closed(end, tAfter) ? { closed: true as const } : {}),
      });
    } else if (m.op.op === 'sub') {
      const end = nextOf(i, 'sub');
      const tAfter = tally(logs, side, last.log, end);
      out.push({
        kind: 'sub',
        ...at,
        text: all.map((x) => (x.op.op === 'sub' ? `${nameOf(x.op.args.in)} in for ${nameOf(x.op.args.out)}` : '')).join(' · '),
        end: 'both',
        before: tally(logs, side, prevOf(i, 'sub'), m.log),
        after: tAfter,
        ...(closed(end, tAfter) ? { closed: true as const } : {}),
      });
    } else if (m.op.op === 'play') {
      // the trip it ran on: the next of ours that ran it (none when the period ran out first)
      const id = m.op.args.set;
      const j = logs.findIndex((l, k) => k >= m.log && l.off === side && l.set?.id === id);
      const ran = j >= 0 ? logs[j] : undefined;
      const pid = ran?.set?.pid ?? m.op.args.pid;
      out.push({
        kind: 'play',
        ...at,
        text: pid !== undefined ? setLabel(id, nameOf(pid)) : SETS[id].name,
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

/** Points per trip, or null with no trips. */
export const ppp = (x: { poss: number; pts: number } | undefined) => (x && x.poss ? x.pts / x.poss : null);

export type MoveVerdict = 'better' | 'worse' | 'same' | 'early';

/**
 * How a move is going: the number it's judged by (what it's aimed at when that has a few trips,
 * else their points a trip for a move on defense, ours on offense, the margin per trip for the
 * rest), now and in the stretch before, and whether it reads better or worse, by how far the rate
 * moved against the noise of the trips behind it.
 */
export function moveVerdict(m: CoachMove): { now: number | null; was: number | null; trips: number; what: 'them' | 'us' | 'focus' | 'margin'; verdict: MoveVerdict } {
  // (what it's aimed at, when that has the trips a verdict needs, each side of it: a play type is a
  // few trips a quarter, and judged on them alone a change of coverage stayed early all night)
  const need = m.closed ? MOVE_CLOSED_TRIPS : MOVE_MIN_TRIPS;
  const aimed = !!m.after.focus && m.after.focus.poss >= need && (m.before.focus?.poss ?? 0) >= MOVE_MIN_BEFORE;
  const what = aimed ? 'focus' : m.end === 'def' ? 'them' : m.end === 'off' ? 'us' : 'margin';
  if (what === 'margin') {
    const per = (t: MoveTally) => (t.us.poss + t.them.poss ? (t.us.pts - t.them.pts) / ((t.us.poss + t.them.poss) / 2) : null);
    const now = per(m.after);
    // (a margin a trip over a trip or two before isn't a rate: a timeout a minute in has none to compare)
    const was = Math.min(m.before.us.poss, m.before.them.poss) >= MARGIN_MIN_BEFORE ? per(m.before) : null;
    const trips = Math.min(m.after.us.poss, m.after.them.poss);
    return { now, was, trips, what, verdict: judge(now, was, trips, Math.min(m.before.us.poss, m.before.them.poss), 1, 1.5, !!m.closed) };
  }
  const pick = (t: MoveTally) => (what === 'focus' ? t.focus : what === 'them' ? t.them : t.us);
  const now = ppp(pick(m.after));
  const was = ppp(pick(m.before));
  const trips = pick(m.after)?.poss ?? 0;
  // fewer points is better on defense (their trips, or their player's), more on offense
  const better = what === 'us' || (what === 'focus' && m.end === 'off') ? 1 : -1;
  return { now, was, trips, what, verdict: judge(now, was, trips, pick(m.before)?.poss ?? 0, better, 1.1, !!m.closed) };
}

/**
 * A trip's points spread about 1.1 either way (a margin per trip about 1.5): a move reads as more
 * than noise once the two rates are MOVE_Z standard errors of their difference apart, which counts
 * the trips on both sides of it (a hot stretch before a move flatters or damns it as much as one after).
 * A move whose stretch is over needs only MOVE_CLOSED_TRIPS: the standard error over so few is wide, so
 * it reads as more than noise only on a big swing.
 */
function judge(now: number | null, was: number | null, trips: number, wasTrips: number, better: 1 | -1, spread: number, closed: boolean): MoveVerdict {
  if (now === null || was === null || trips < (closed ? MOVE_CLOSED_TRIPS : MOVE_MIN_TRIPS) || wasTrips < MOVE_MIN_BEFORE) return 'early';
  const se = spread * Math.sqrt(1 / trips + 1 / wasTrips);
  const d = (now - was) * better;
  return d > MOVE_Z * se ? 'better' : d < -MOVE_Z * se ? 'worse' : 'same';
}
