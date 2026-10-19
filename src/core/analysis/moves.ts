// The coach's moves in a live game, and what each did: every tactics change, substitution and
// timeout the user made (or let the staff make), in the Tactics screen's words, with the scoring
// while it was in effect next to the stretch before it. A change of tactics is measured until the
// next change; a substitution over the stint it started; a timeout over the trips either side of it.
// Read by the live game's bench as the night goes, and kept with the result for the post-game
// report. Pure: it reads the possession logs the game already keeps.

import type { CoachMove, LiveOp, MoveTally, Tactics } from '../types';
import type { FinishType, PossLog } from '../sim/log';
import { tacticsChanges } from '../sim/playbooks';
import { PLAYER_D_META, SCHEME_META } from '../sim/tactics';

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
/** Trips at a rate before a move's effect reads as anything but early. */
export const MOVE_MIN_TRIPS = 8;

/** What a move is aimed at: the end of the floor, and on it the play types or the one player it's about. */
interface Aim {
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

/** The night's moves, oldest first: `marks` are the game's, in the order made; `side` is the user's (0 home, 1 away). */
export function coachMoves(marks: MoveMark[], logs: PossLog[], side: 0 | 1, nameOf: (pid: number) => string): CoachMove[] {
  const out: CoachMove[] = [];
  const nextOf = (i: number, kind: LiveOp['op']) => marks.slice(i + 1).find((m) => m.op.op === kind)?.log ?? logs.length;
  const prevOf = (i: number, kind: LiveOp['op']) =>
    marks
      .slice(0, i)
      .reverse()
      .find((m) => m.op.op === kind)?.log ?? 0;
  marks.forEach((m, i) => {
    const at = { q: m.q, clock: Math.round(m.clock) };
    if (m.op.op === 'tactics' && m.before) {
      const after = m.op.args.tactics;
      const aim = aimOf(m.before, after);
      out.push({
        kind: 'tactics',
        ...at,
        text: moveText(m.before, after, nameOf),
        end: aim.end,
        ...(m.op.args.staff ? { by: 'staff' as const } : {}),
        ...(aim.pid !== undefined ? { pid: aim.pid } : {}),
        ...(aim.types ? { aim: aimLabel(aim.types) } : {}),
        before: tally(logs, side, prevOf(i, 'tactics'), m.log, aim),
        after: tally(logs, side, m.log, nextOf(i, 'tactics'), aim),
      });
    } else if (m.op.op === 'sub') {
      out.push({
        kind: 'sub',
        ...at,
        text: `${nameOf(m.op.args.in)} in for ${nameOf(m.op.args.out)}`,
        end: 'both',
        before: tally(logs, side, prevOf(i, 'sub'), m.log),
        after: tally(logs, side, m.log, nextOf(i, 'sub')),
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
  const what = m.after.focus && m.after.focus.poss >= 4 ? 'focus' : m.end === 'def' ? 'them' : m.end === 'off' ? 'us' : 'margin';
  if (what === 'margin') {
    const per = (t: MoveTally) => (t.us.poss + t.them.poss ? (t.us.pts - t.them.pts) / ((t.us.poss + t.them.poss) / 2) : null);
    const now = per(m.after);
    const was = per(m.before);
    const trips = Math.min(m.after.us.poss, m.after.them.poss);
    return { now, was, trips, what, verdict: judge(now, was, trips, 1, 1.5) };
  }
  const pick = (t: MoveTally) => (what === 'focus' ? t.focus : what === 'them' ? t.them : t.us);
  const now = ppp(pick(m.after));
  const was = ppp(pick(m.before));
  const trips = pick(m.after)?.poss ?? 0;
  // fewer points is better on defense (their trips, or their player's), more on offense
  const better = what === 'us' || (what === 'focus' && m.end === 'off') ? 1 : -1;
  return { now, was, trips, what, verdict: judge(now, was, trips, better, 1.1) };
}

/** A trip's points spread about 1.1 either way (a margin per trip about 1.5): a move reads as more than noise once its rate has moved about one standard error. */
function judge(now: number | null, was: number | null, trips: number, better: 1 | -1, spread: number): MoveVerdict {
  if (now === null || was === null || trips < MOVE_MIN_TRIPS) return 'early';
  const se = spread / Math.sqrt(trips);
  const d = (now - was) * better;
  return d > se ? 'better' : d < -se ? 'worse' : 'same';
}
