// The draft screens' shared helpers: a combine measurement in feet and inches, this year's picks,
// draft picks as every list writes them (their order, their slots in a line, a projection), and a
// pick's grade against the big board.
import type { DraftPick, League, Player } from '../../core/types';
import { andList } from '../../core/league/helpers';
import { ordinal, rankOf } from '../../core/format';
import { overallPick } from '../league/shared';

export function fmtIn(x: number | undefined) {
  if (x === undefined || !isFinite(x)) return '—';
  const ft = Math.floor(x / 12);
  const inches = x - ft * 12;
  const whole = Math.floor(inches + 1e-6);
  const q = Math.round((inches - whole) * 4);
  const frac = q === 1 ? '¼' : q === 2 ? '½' : q === 3 ? '¾' : '';
  return `${ft}'${q === 4 ? whole + 1 : whole}${q === 4 ? '' : frac}"`;
}

export function draftedThisYear(league: League): Player[] {
  return Object.values(league.players)
    .filter((p) => p.draft.year === league.season && p.draft.round > 0)
    .sort((a, b) => overallPick(league, a.draft.round, a.draft.pick) - overallPick(league, b.draft.round, b.draft.pick));
}

/** Where a pick lands overall: its slot once the order is set, its projection (pickProjection) until then. */
export const pickSlot = (league: League, d: DraftPick, proj?: (d: DraftPick) => number | undefined): number | undefined =>
  d.pick ? overallPick(league, d.round, d.pick) : proj?.(d);

/** Picks in one order on every list: by draft, then where each lands (its slot, or its projection), then whose it was. */
export const pickOrder =
  (league: League, proj?: (d: DraftPick) => number | undefined) =>
  (a: DraftPick, b: DraftPick): number =>
    a.season - b.season || a.round - b.round || (pickSlot(league, a, proj) ?? 99) - (pickSlot(league, b, proj) ?? 99) || a.originalTid - b.originalTid;

/**
 * A team's picks in this draft as one line, in order, by overall slot (a second-rounder's number
 * says its round): "#10, #26, #28 and #38". Picks without a slot or a projection are counted:
 * "#10 and 1 in the 2nd round".
 */
export function picksText(league: League, picks: DraftPick[], proj?: (d: DraftPick) => number | undefined): string {
  const slots = picks
    .map((d) => pickSlot(league, d, proj))
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b)
    .map((n) => `#${n}`);
  const open = picks.filter((d) => pickSlot(league, d, proj) === undefined);
  const firsts = open.filter((d) => d.round === 1).length;
  const seconds = open.length - firsts;
  return andList([...slots, ...(firsts ? [`${firsts} in the 1st round`] : []), ...(seconds ? [`${seconds} in the 2nd round`] : [])]);
}

/** A prospect's place on the scouts' board, out of his class: "3rd of 72" (null off the board). */
export function boardRank(league: League, p: Player): string | null {
  const r = p.prospect?.rank;
  if (!r) return null;
  return rankOf(r, Object.values(league.players).filter((x) => x.draft.year === p.draft.year && x.prospect?.rank).length);
}

/** A pick's projection, as every pick list writes it: "proj. #17" (neutral: a projection, not a grade). */
export const projText = (n: number) => `proj. #${n}`;

export interface PickGrade {
  label: 'Steal' | 'Value' | 'Fair' | 'Reach' | 'Big reach';
  /** How many places later (positive) or earlier than his board rank he went. */
  by: number;
  rank: number;
  overall: number;
}

/**
 * A pick graded against the scouts' big board, as the room reads it the moment it's made: how many
 * places after (a steal) or before (a reach) his consensus rank he went, against a tolerance that
 * widens down the draft (two places, or a fifth of the pick: a reach at #3 is a bigger one than at #40).
 */
export function pickGrade(league: League, p: Player): PickGrade | null {
  const rank = p.prospect?.rank;
  if (!rank || p.draft.round === 0) return null;
  const overall = overallPick(league, p.draft.round, p.draft.pick);
  const tol = Math.max(2, Math.round(overall * 0.2));
  const by = overall - rank;
  const label = by >= 2 * tol ? 'Steal' : by >= tol ? 'Value' : by > -tol ? 'Fair' : by > -2 * tol ? 'Reach' : 'Big reach';
  return { label, by, rank, overall };
}

/** A grade's tone: the steals green, the reaches amber, the rest plain. */
export const gradeTone = (g: PickGrade) => (g.label === 'Steal' || g.label === 'Value' ? 'good' : g.label === 'Fair' ? '' : 'warn');

/** "5th pick", "31st pick": a pick's number as the announcer says it. */
export const pickWords = (n: number) => `${ordinal(n)} pick`;

/**
 * Whether the user has watched this season's lottery reveal (LotteryView), so nothing else gives his
 * slot away first. Kept on the device only: a new device plays the reveal again.
 */
const lotteryKey = (league: League) => `hc-lottery:${league.id}:${league.season}`;
export function lotterySeen(league: League): boolean {
  try {
    return localStorage.getItem(lotteryKey(league)) === '1';
  } catch {
    return false;
  }
}
/** The lottery is in but its reveal hasn't been watched: the draft's other tabs keep the order (slots, "via") to themselves until then. */
export const lotteryHidden = (league: League) => league.phase === 'draftLottery' && !lotterySeen(league);

export function markLotterySeen(league: League) {
  try {
    localStorage.setItem(lotteryKey(league), '1');
  } catch {
    // (private windows and blocked storage: the reveal just plays again next time)
  }
}
