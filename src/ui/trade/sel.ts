// The trade builder's hold on one side of a deal: the players, picks and terms it sends.
import type { TradeSide } from '../../core/league/trades';

export interface Sel {
  pids: number[];
  dpids: number[];
  /** Protections on the team's own firsts it sends: dpid -> top-N. */
  protect?: Record<number, number>;
  /** Drafts in which it gives the other team the right to swap firsts. */
  swaps?: number[];
  /** Cash it sends ($K). */
  cash?: number;
}
export const EMPTY: Sel = { pids: [], dpids: [] };
/** A side of an offer as the builder holds it. */
export const selOf = (s: TradeSide): Sel => ({ pids: s.pids, dpids: s.dpids, protect: s.protect, swaps: s.swaps, cash: s.cash });

export const toggle = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
