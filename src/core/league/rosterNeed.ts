// The roster's need, carried from where it's named to how it turned out. It's the staff's opinion
// unless the coach says otherwise: the system report's weakest quality (Team → Tactics names it under
// Weaknesses), which he can swap for any other quality he'd rather build up, or set aside as a trade-off he
// accepts (League.needChoice). A weakness the settings cause is said as that, with what the coach can
// do about it, beside the players who'd fill it. A candidate is read by what he'd do to it with the
// staff's minutes both ways (said as that: a rotation he runs gives a newcomer none until he places
// him), the move that brings him in keeps what it did to it on its transaction (Txn.need), Today asks
// for him in the rotation when he isn't playing, and the season's review grades the need again.
// Pure: each reading is a view of the league, nothing changes.
import type { League, Player, Txn } from '../types';
import { QUALITY_META, gradeOf, systemReport, type Grade, type Quality, type QualityId } from '../analysis/system';
import { autoRotation } from '../ai/coachAI';

export interface Need {
  id: QualityId;
  label: string;
  /** Its grade and rank on the rotation in use. */
  grade: Grade;
  rank: number;
  of: number;
  /** Who named it: the staff's read, or the coach's own priority. */
  by: 'staff' | 'you';
  /** Its grade with the staff's minutes (what a candidate is read against), when that differs from the rotation in use. */
  staff?: { grade: Grade; rank: number };
  /**
   * A tactical exposure, not (only) a lack of players: the setting that costs it most, and the grade
   * without the settings that cost it. The coaching alternative to a signing.
   */
  coach?: { text: string; to: Grade };
}

/** A need as a move changes it: its grade and rank without the move and with it, both with the staff's minutes. */
export interface NeedMove {
  id: QualityId;
  label: string;
  from: Grade;
  to: Grade;
  rankFrom: number;
  rankTo: number;
  /** Minutes a game the staff would give those coming in: the allocation `to` is read with. */
  minutes: number;
}

/** Days Today asks for a newcomer brought in for a need to get minutes. */
const DEPLOY_DAYS = 30;

/** Ranks a candidate has to lift the need by to fill it (or a better grade). */
const FILL_RANKS = 3;

/** The others' scores for the report, worked out once a screen (systemReport's `others`). */
export type NeedCache = Map<number, Record<QualityId, number>>;

const healthy = (p: Player) => !(p.injury && p.injury.gamesRemaining > 0);

/**
 * The user's team as it would be with `add` and without `drop` (pids), the staff's rotation for that
 * roster: a view, nothing in the league changes.
 */
function viewWith(league: League, add: number[], drop: number[]): League {
  const me = league.userTid;
  const players = { ...league.players };
  for (const pid of add) if (players[pid]) players[pid] = { ...players[pid], tid: me };
  // (sent away: off the team for the view)
  for (const pid of drop) if (players[pid]?.tid === me) players[pid] = { ...players[pid], tid: -99 };
  const roster = Object.values(players).filter((p) => p.tid === me);
  const teams = league.teams.slice();
  teams[me] = { ...teams[me], rotation: autoRotation(roster.filter(healthy), teams[me].rotation) };
  return { ...league, players, teams };
}

/** The others' scores, once: pass to teamNeed / needMove for every candidate on a screen. */
export const needCache = (league: League): NeedCache => systemReport(league, league.userTid).others;

const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

/** The user's qualities, weakest first. */
const weakest = (league: League, cache?: NeedCache): Quality[] => {
  const r = systemReport(league, league.userTid, undefined, cache);
  return [...r.off, ...r.def].sort((a, b) => b.rank - a.rank || a.raw - b.raw);
};

const bottomHalf = (q: Quality) => q.rank > Math.ceil(q.of / 2);

/** What the coach said about his need: a weakness of his own choosing, 'none' (a trade-off he accepts), or nothing (the staff's read stands). */
export const needChoice = (league: League): QualityId | 'none' | undefined => {
  const c = league.needChoice;
  return c === 'none' || (c !== undefined && c in QUALITY_META) ? (c as QualityId | 'none') : undefined;
};

/** A quality he can make his priority: its grade and rank, whether it's a weakness (the league's bottom half), and whether it's the staff's read. */
export interface NeedOption extends Pick<Need, 'id' | 'label' | 'grade' | 'rank' | 'of'> {
  weak: boolean;
  staff: boolean;
}

/** Every quality he can make his priority, weakest first: the first is the staff's read when it's a weakness. */
export function needOptions(league: League, cache?: NeedCache): NeedOption[] {
  const all = weakest(league, cache);
  const staff = all[0] && bottomHalf(all[0]) ? all[0].id : undefined;
  return all.map((q) => ({ id: q.id, label: QUALITY_META[q.id].label, grade: q.grade, rank: q.rank, of: q.of, weak: bottomHalf(q), staff: q.id === staff }));
}

/**
 * The user's need: the weakness he made his priority, else the staff's read (his system's
 * lowest-ranked quality, Tactics's first weakness, when it sits in the league's bottom half). None
 * when he has no such weakness, or set the need aside. With it: its grade on the staff's minutes when
 * that differs from his rotation's, and whether his own settings cost it a grade (see Need.coach).
 */
export function teamNeed(league: League, cache?: NeedCache): Need | null {
  const choice = needChoice(league);
  if (choice === 'none') return null;
  const others = cache ?? needCache(league);
  const all = weakest(league, others);
  const q = choice ? all.find((x) => x.id === choice) : all[0] && bottomHalf(all[0]) ? all[0] : undefined;
  if (!q) return null;
  const need: Need = { id: q.id, label: QUALITY_META[q.id].label, grade: q.grade, rank: q.rank, of: q.of, by: choice ? 'you' : 'staff' };
  // the same quality with the staff's minutes: what every candidate is read against
  const s = systemReport(viewWith(league, [], []), league.userTid, undefined, others);
  const sq = [...s.off, ...s.def].find((x) => x.id === q.id)!;
  if (sq.grade !== q.grade) need.staff = { grade: sq.grade, rank: sq.rank };
  // the settings that cost it (every part after the first is a setting): without them, would it grade better?
  const costs = q.parts.slice(1).filter((x) => x.v < 0);
  if (costs.length) {
    const raw = q.raw - costs.reduce((a, x) => a + x.v, 0);
    const to = gradeOf(1 + [...others.values()].filter((x) => x[q.id] > raw).length, q.of);
    if (ORDER.indexOf(to) > ORDER.indexOf(q.grade)) need.coach = { text: [...costs].sort((a, b) => a.v - b.v)[0].text, to };
  }
  return need;
}

/**
 * What bringing in `add` and sending out `drop` does to need `id`: its grade and rank on the roster
 * without the move and with it, both with the staff's rotation (so only the players differ), and the
 * minutes that rotation gives those coming in. Works before or after the move is made: the roster
 * "without" is his own plus `drop`, less `add`.
 */
export function needMove(league: League, id: QualityId, add: number[], drop: number[] = [], cache?: NeedCache): NeedMove {
  const me = league.userTid;
  const before = viewWith(
    league,
    drop.filter((pid) => league.players[pid]?.tid !== me),
    add,
  );
  // (an added player already on the team when the move is made stays: the drop list holds who left)
  const after = viewWith(league, add, drop);
  const others = cache ?? needCache(league);
  const q = (l: League) => {
    const r = systemReport(l, me, undefined, others);
    return [...r.off, ...r.def].find((x) => x.id === id)!;
  };
  const a = q(before);
  const b = q(after);
  const mins = after.teams[me].rotation.minutes;
  const minutes = Math.round(add.reduce((t, pid) => t + (mins[pid] ?? 0), 0));
  return { id, label: QUALITY_META[id].label, from: a.grade, to: b.grade, rankFrom: a.rank, rankTo: b.rank, minutes };
}

/** Whether a move fills the need: up a grade, or FILL_RANKS places or more. */
export const fills = (m: NeedMove) => m.rankFrom - m.rankTo >= FILL_RANKS || (m.to !== m.from && m.rankTo < m.rankFrom);

/** Whether a move makes the need worse: down a grade, or FILL_RANKS places or more. */
export const hurts = (m: NeedMove) => m.rankTo - m.rankFrom >= FILL_RANKS || (m.to !== m.from && m.rankTo > m.rankFrom);

/** "Rim protection D → B": a need as a move changed it. */
export const needText = (m: Pick<NeedMove, 'label' | 'from' | 'to'>) => `${m.label} ${m.from} → ${m.to}`;

/** "at 22 MPG": the staff's minutes a need's reading gives who comes in ('' when it gives none). */
export const needMinutes = (m: Pick<NeedMove, 'minutes'>) => (m.minutes > 0 ? ` at ${m.minutes} MPG` : ' with no minutes');

/** Whose need it is, as a lead-in: "Staff's read of your need" / "Your priority". */
export const needLead = (n: Pick<Need, 'by'>) => (n.by === 'you' ? 'Your priority' : "Staff's read of your need");

/**
 * The need a move brought players in for, to keep on its transaction: the need before it (on the
 * roster without them), and what they did to it. Null when he had no need, or they didn't fill it.
 */
export function moveNeed(league: League, add: number[], drop: number[] = []): NonNullable<Txn['need']> | null {
  if (!add.length) return null;
  const me = league.userTid;
  const cache = needCache(league);
  const without = viewWith(
    league,
    drop.filter((pid) => league.players[pid]?.tid !== me),
    add,
  );
  const need = teamNeed(without, cache);
  if (!need) return null;
  const m = needMove(league, need.id, add, drop, cache);
  return fills(m) ? { id: m.id, from: m.from, to: m.to, rankFrom: m.rankFrom, rankTo: m.rankTo, by: need.by } : null;
}

/** The need's grade now (the user's rotation as it is), for the review's look back. */
export function needNow(league: League, id: QualityId): { grade: Grade; rank: number } {
  const r = systemReport(league, league.userTid);
  const q = [...r.off, ...r.def].find((x) => x.id === id)!;
  return { grade: q.grade, rank: q.rank };
}

/**
 * Moves of his this season that came in for a need, whose player is still his but isn't playing: on
 * a rotation he runs himself, a newcomer sits at the end with no minutes until he places him.
 */
export function needsDeploying(league: League): { txn: Txn; p: Player }[] {
  const me = league.userTid;
  const team = league.teams[me];
  if (!team.rotation.manual) return [];
  const out: { txn: Txn; p: Player }[] = [];
  for (const t of league.transactions ?? []) {
    // (for a month: after that, leaving him out is the coach's call)
    if (t.season !== league.season || !t.need || !t.tids.includes(me) || league.day - t.day > DEPLOY_DAYS) continue;
    const pids = t.kind === 'trade' ? (t.sides ?? []).filter((s) => s.tid !== me).flatMap((s) => s.players.map((x) => x.pid)) : t.pid !== undefined ? [t.pid] : [];
    for (const pid of pids) {
      const p = league.players[pid];
      if (p && p.tid === me && healthy(p) && !(team.rotation.minutes[pid] > 0)) out.push({ txn: t, p });
    }
  }
  return out;
}

/** What the user's newest move did to his need, for the toast that says it went through (" It fills the staff's read of your need: Rim protection D → B."), or ''. */
export function movedNeedText(league: League): string {
  const t = league.transactions?.at(-1);
  if (!t?.need || !t.user || t.season !== league.season || t.day !== league.day) return '';
  const label = QUALITY_META[t.need.id as QualityId]?.label ?? 'Your need';
  return ` It fills ${needWhose(t.need)}: ${needText({ label, from: t.need.from as Grade, to: t.need.to as Grade })}.`;
}

/** Whose need a move filled, as its log line kept it: "your priority" / "the staff's read of your need" / (an older line) "your need". */
export function needWhose(n: Pick<NonNullable<Txn['need']>, 'by'>): string {
  return n.by === 'you' ? 'your priority' : n.by === 'staff' ? "the staff's read of your need" : 'your need';
}
