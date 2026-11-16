// The roster's need, carried from where it's named to how it turned out: the system report's weakest
// quality (Team → Tactics names it under Weaknesses) is the need; a candidate is read by what he'd do
// to it (free agents, the trade's confirm), the move that brings him in keeps what it did to it on
// its transaction (Txn.need), Today asks for him in the rotation when he isn't playing, and the
// season's review grades the need again. Pure: each reading is a view of the league, nothing changes.
import type { League, Player, Txn } from '../types';
import { QUALITY_META, systemReport, type Grade, type QualityId } from '../analysis/system';
import { autoRotation } from '../ai/coachAI';

export interface Need {
  id: QualityId;
  label: string;
  grade: Grade;
  rank: number;
  of: number;
}

/** A need as a move changes it: its grade and rank without the move and with it. */
export interface NeedMove {
  id: QualityId;
  label: string;
  from: Grade;
  to: Grade;
  rankFrom: number;
  rankTo: number;
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

/** The user's need: his system's lowest-ranked quality (Tactics's first weakness), when it sits in the league's bottom half (else none). */
export function teamNeed(league: League, cache?: NeedCache): Need | null {
  const r = systemReport(league, league.userTid, undefined, cache);
  const worst = [...r.off, ...r.def].sort((a, b) => b.rank - a.rank || a.raw - b.raw)[0];
  if (!worst || worst.rank <= Math.ceil(worst.of / 2)) return null;
  return { id: worst.id, label: QUALITY_META[worst.id].label, grade: worst.grade, rank: worst.rank, of: worst.of };
}

/**
 * What bringing in `add` and sending out `drop` does to need `id`: its grade and rank on the roster
 * without the move and with it, both with the staff's rotation (so only the players differ). Works
 * before or after the move is made: the roster "without" is his own plus `drop`, less `add`.
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
  return { id, label: QUALITY_META[id].label, from: a.grade, to: b.grade, rankFrom: a.rank, rankTo: b.rank };
}

/** Whether a move fills the need: up a grade, or FILL_RANKS places or more. */
export const fills = (m: NeedMove) => m.rankFrom - m.rankTo >= FILL_RANKS || (m.to !== m.from && m.rankTo < m.rankFrom);

/** Whether a move makes the need worse: down a grade, or FILL_RANKS places or more. */
export const hurts = (m: NeedMove) => m.rankTo - m.rankFrom >= FILL_RANKS || (m.to !== m.from && m.rankTo > m.rankFrom);

/** "Rim protection D → B": a need as a move changed it. */
export const needText = (m: Pick<NeedMove, 'label' | 'from' | 'to'>) => `${m.label} ${m.from} → ${m.to}`;

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
  return fills(m) ? { id: m.id, from: m.from, to: m.to, rankFrom: m.rankFrom, rankTo: m.rankTo } : null;
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

/** What the user's newest move did to his need, for the toast that says it went through (" It fills your need: Rim protection D → B."), or ''. */
export function movedNeedText(league: League): string {
  const t = league.transactions?.at(-1);
  if (!t?.need || !t.user || t.season !== league.season || t.day !== league.day) return '';
  const label = QUALITY_META[t.need.id as QualityId]?.label ?? 'Your need';
  return ` It fills your need: ${needText({ label, from: t.need.from as Grade, to: t.need.to as Grade })}.`;
}
