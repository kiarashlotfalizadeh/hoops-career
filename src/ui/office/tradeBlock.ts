// "Trading block": for one of the user's players or picks (or several), the best package each AI
// team would actually accept (packageFor in core/league/trades.ts), most valuable to the user first.
import type { League } from '../../core/types';
import { withHoldsMemo } from '../../core/league/freeAgency';
import { packageFor, type TradeOffer } from '../../core/league/trades';

export interface BlockOffer {
  tid: number;
  offer: TradeOffer;
  /** Value of the package to the user's team (its strategy). */
  myValue: number;
  /** Value of what the user gives (a player, a pick or several) to the user's team. */
  targetValue: number;
}

/** `give`: a player's id, or the user's players and picks. */
export function blockOffers(league: League, give: number | { pids: number[]; dpids: number[] }): BlockOffer[] {
  const assets = typeof give === 'number' ? { pids: [give], dpids: [] } : give;
  return withHoldsMemo(() =>
    league.teams
      .flatMap((t) => {
        const pkg = t.tid === league.userTid ? null : packageFor(league, t.tid, assets);
        return pkg ? [{ tid: t.tid, offer: pkg.offer, myValue: pkg.myValue, targetValue: pkg.giveValue }] : [];
      })
      .sort((x, y) => y.myValue - x.myValue),
  );
}
