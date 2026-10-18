// The draft screens' shared helpers: a combine measurement in feet and inches, this year's picks,
// and draft picks as every list writes them (their order, their slots in a line, a projection).
import type { DraftPick, League, Player } from '../../core/types';
import { andList } from '../../core/league/helpers';
import { rankOf } from '../../core/format';
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
